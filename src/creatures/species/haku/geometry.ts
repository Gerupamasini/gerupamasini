import { BufferGeometry, Float32BufferAttribute, Matrix4, Sphere, Uint16BufferAttribute, Vector3 } from 'three';
import {
  BONES, D1, EYE, FINS, FIN_ID, GAPE, GILL, JAW, LIPS, MODEL_TL, OPER_BONE, OPER_EDGE, PEC, PREOP_EDGE, SPINE, SPINE_S, S_CAP, S_CAUDAL_BASE, S_HEAD,
  boneIndex, dorsalY, gapeY, lipInset, lipShift, section, sectionPoint, ventralY, zOf, type BoneName,
} from './anatomy';

/**
 * The ハク's skinned geometry, three tiers, built once and shared by every fish (each fish has its own skeleton).
 *
 *  LOD0  13,048 triangles: 84 × 48 body loft split along the gape into two rolled lips over a mouth cavity, eyes, the
 *        gill cover's plates (preopercle, opercle on its own bone) over the gill chamber, seven fins with ray-resolution
 *        membranes
 *  LOD1   1,228 triangles: 26 × 16 body (closed snout), small eyes, caudal / dorsals / anal / pectorals
 *  LOD2     192 triangles: 11 × 8 body with the forked tail folded into the same mesh (one draw call, opaque)
 *
 * Body vertices carry aBody = (s, cos φ, sin φ), aPat = (distance along the skin from the snout, arc length from the
 * dorsal midline) in TL units, aPart (0 body, 0.01–0.16 the near tier's skin and its gill chamber, 0.3 preopercle,
 * 0.35–0.39 opercle bone → flap, 1 eye, 2 opaque tail of LOD2, 3 mouth cavity, 4 a plate's rim and underside) and aOcc
 * (ambient occlusion from the shape: the groove between the lips, the cavity); fin vertices carry aFin = (across the
 * base, along the ray, fin id).
 * Model frame: metres, +Z forward, +Y up, +X the fish's left, origin on the axis at S_PIVOT.
 */

export type Lod = 0 | 1 | 2;

export interface HakuGeometry {
  body: BufferGeometry;
  fins: BufferGeometry | null;
}

const TL = MODEL_TL;

// ------------------------------------------------------------------ rig

/** rest positions (model space, metres) and parents of every bone */
export interface RigRest {
  parent: number[];
  world: Vector3[];
  /** inverse bind matrices, shared by every skeleton */
  inverses: Matrix4[];
}

/** half width of the body at (s, height y) in TL units: where a point on the flank at that height sits */
export function halfWidthAt(s: number, y: number): number {
  const c = section(s);
  const h = y - c.yc;
  const span = h >= 0 ? c.top : c.bot, n = h >= 0 ? c.nTop : c.nBot;
  const v = Math.min(1, Math.abs(h) / Math.max(span, 1e-6));
  return c.hw * Math.pow(Math.max(0, 1 - Math.pow(v, n)), 1 / n);
}

let rig: RigRest | null = null;
export function rigRest(): RigRest {
  if (rig) return rig;
  const world: Vector3[] = [], parent: number[] = [];
  const at = (s: number, y = 0, x = 0) => new Vector3(x * TL, y * TL, zOf(s) * TL);
  for (const name of BONES) {
    if (name === 'J_root') { world.push(new Vector3()); parent.push(-1); continue; }
    const si = SPINE.findIndex(([n]) => n === name);
    if (si >= 0) { world.push(at(SPINE[si][1])); parent.push(si === 0 ? boneIndex('J_root') : boneIndex(SPINE[si - 1][0] as BoneName)); continue; }
    if (name === 'J_pec_L' || name === 'J_pec_R') {
      const side = name === 'J_pec_L' ? 1 : -1;
      world.push(at(PEC.s, PEC.y, side * halfWidthAt(PEC.s, PEC.y) * 0.97));
      parent.push(boneIndex('J_sp1'));
    } else if (name === 'J_d1') {
      world.push(at(D1.s0, dorsalY(D1.s0) - 0.002));
      parent.push(boneIndex('J_sp3'));
    } else if (name === 'J_oper_L' || name === 'J_oper_R') {
      // the opercle's articulation, high at the front of the gill cover; it rides on the trunk's first segment like the
      // skin beneath it
      const side = name === 'J_oper_L' ? 1 : -1;
      world.push(at(GILL.hinge.s, GILL.hinge.y, side * halfWidthAt(GILL.hinge.s, GILL.hinge.y)));
      parent.push(boneIndex('J_sp1'));
    } else {
      world.push(at(JAW.s, JAW.y));
      parent.push(boneIndex('J_head'));
    }
  }
  const inverses = world.map((p) => new Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  rig = { parent, world, inverses };
  return rig;
}

/** Up to three chain bones and weights for a point at s: rigid at each segment's middle, a 50/50 blend at a joint. */
export function chainWeights(s: number): [number, number][] {
  const n = SPINE_S.length;
  if (s <= SPINE_S[0]) return [[boneIndex('J_head'), 1]];
  let j = n - 1;
  for (let i = 0; i < n - 1; i++) if (s < SPINE_S[i + 1]) { j = i; break; }
  const s0 = SPINE_S[j], s1 = j < n - 1 ? SPINE_S[j + 1] : 1.0;
  const t = Math.min(1, Math.max(0, (s - s0) / (s1 - s0)));
  const ss = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  let wPrev = j > 0 ? 0.5 * (1 - ss(0, 0.5, t)) : 0;
  let wNext = j < n - 1 ? 0.5 * ss(0.5, 1, t) : 0;
  // the head segment is stiff: the skull does not bend at J_sp1 as much as the trunk does at its joints
  if (j === 0) wNext *= 0.6;
  if (j === 1) wPrev *= 0.6;
  const out: [number, number][] = [[boneIndex(SPINE[j][0] as BoneName), 1 - wPrev - wNext]];
  if (wPrev > 1e-4) out.push([boneIndex(SPINE[j - 1][0] as BoneName), wPrev]);
  if (wNext > 1e-4) out.push([boneIndex(SPINE[j + 1][0] as BoneName), wNext]);
  return out;
}

// ------------------------------------------------------------------ builder

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  idx: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  a3: number[] = [];   // aBody or aFin
  a2: number[] = [];   // aPat (body only)
  part: number[] = [];
  occ: number[] = [];  // ambient occlusion (body only): 1 open, 0 shut in
  get count(): number { return this.pos.length / 3; }

  vertex(p: [number, number, number], weights: [number, number][], a3: [number, number, number], a2?: [number, number], part?: number, n?: [number, number, number], occ = 1): number {
    this.pos.push(p[0] * TL, p[1] * TL, p[2] * TL);
    this.occ.push(occ);
    this.nrm.push(...(n ?? [0, 1, 0]));
    const w = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = w.reduce((x, [, v]) => x + v, 0) || 1;
    for (let k = 0; k < 4; k++) { this.si.push(w[k]?.[0] ?? 0); this.sw.push(w[k] ? w[k][1] / sum : 0); }
    this.a3.push(...a3);
    if (a2) this.a2.push(...a2);
    if (part !== undefined) this.part.push(part);
    return this.count - 1;
  }

  build(kind: 'body' | 'fins', computeNormals: boolean): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    if (kind === 'body') {
      g.setAttribute('aBody', new Float32BufferAttribute(this.a3, 3));
      g.setAttribute('aPat', new Float32BufferAttribute(this.a2, 2));
      g.setAttribute('aPart', new Float32BufferAttribute(this.part, 1));
      g.setAttribute('aOcc', new Float32BufferAttribute(this.occ, 1));
    } else g.setAttribute('aFin', new Float32BufferAttribute(this.a3, 3));
    g.setIndex(this.idx);
    if (computeNormals) g.computeVertexNormals();
    // the fish bends but never leaves this sphere (frustum culling of the skinned meshes)
    g.boundingSphere = new Sphere(new Vector3(0, 0, 0), 0.68 * TL);
    return g;
  }
}

/** jaw influence for a body vertex of a tier without a split mouth: the chin below the gape follows J_jaw */
function withJaw(s: number, y: number, w: [number, number][]): [number, number][] {
  const lim = JAW.s + 0.01, g = gapeY(s);
  if (s > lim || y > g - 0.001) return w;
  const k = Math.min(1, Math.max(0, (lim - s) / 0.025)) * Math.min(1, Math.max(0, (g - 0.001 - y) / 0.008));
  return blendJaw(w, k);
}

function blendJaw(w: [number, number][], k: number): [number, number][] {
  if (k <= 0) return w;
  return [...w.map(([b, v]) => [b, v * (1 - k)] as [number, number]), [boneIndex('J_jaw'), k]];
}

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** the skin at (s, φ) before the lips are rolled in: the section's point with the lower lip pushed forward (TL units) */
function skinPoint(s: number, phi: number, out = new Vector3()): Vector3 {
  const [x, y] = sectionPoint(section(s), phi);
  return out.set(x, y, zOf(s) + lipShift(s, y));
}

/** the skin's outward normal at (s, φ) */
function skinNormal(s: number, phi: number): Vector3 {
  if (s <= 1e-6) return new Vector3(0, 0, 1);
  const ds = Math.min(1e-4, s * 0.5), dp = 2e-3;
  const Ps = skinPoint(s + ds, phi).sub(skinPoint(s - ds, phi));
  const Pp = skinPoint(s, phi + dp).sub(skinPoint(s, phi - dp));
  const n = new Vector3().crossVectors(Pp, Ps).normalize();
  const p = skinPoint(s, phi), c = section(s);
  const out = new Vector3(p.x, p.y - c.yc, s < S_CAP ? 0.02 : 0);
  if (n.dot(out) < 0) n.negate();
  return n;
}

/**
 * The gill chamber, 0..1, at (s, height y): the skin under the part of the opercle that stands off the head (from a
 * little before its bony margin to just short of its free edge). Coloured as the gills and shut in; seen only when the
 * gill cover swings open.
 */
function gillChamber(s: number, y: number): number {
  const O = GILL.oper;
  const bone = OPER_BONE(y), edge = OPER_EDGE(y);
  // (only where the plate stands fully off the skin: its ends sink in over the last 28 % of its height)
  const H = O.top - O.bottom;
  return smooth(bone - 0.012, bone - 0.006, s) * (1 - smooth(edge - 0.006, edge - 0.002, s)) * smooth(O.bottom + 0.28 * H, O.bottom + 0.36 * H, y) * (1 - smooth(O.top - 0.36 * H, O.top - 0.28 * H, y));
}

interface Loft {
  /** ring counts: the rounded front of the lips, the mouth (back to its corner), the rest of the head, the trunk */
  tip: number; mouth: number; head: number; trunk: number;
  /** vertices round each ring */
  around: number;
  /** how much closer the ring's vertices crowd at its sides (where the lips meet) than at the back and belly */
  squeeze: number;
  /** split the head along the gape into two lips over a mouth cavity, and sink the gill chamber under the opercle */
  mouthOpen: boolean;
}

/** what buildBody leaves for the mouth cavity: the lips' edge vertices along the gape and the corner of the mouth */
interface Gape {
  /** per ring of the split, front to back: the upper and lower lip's edge vertex on the left and on the right */
  rings: { s: number; upL: number; upR: number; loL: number; loR: number }[];
  cornerL: number;
  cornerR: number;
}

function buildBody(b: Builder, L: Loft): Gape | null {
  const { around } = L;
  // ring stations: dense through the rounded lips (s ∝ u², so the front grows like a dome), even along the mouth so a
  // ring lands on its corner, close over the head where the profile turns fastest, even along the trunk
  const ss: number[] = [];
  if (L.mouthOpen) {
    // a split mouth starts with the front of the gape itself (the level line the section closes to at s = 0), the
    // rings' heights on the rounded front crowding toward it so the lips' rolls are round where they meet
    for (let i = 0; i <= L.tip; i++) { const k = Math.pow(i / L.tip, 1.6); ss.push(S_CAP * (1 - Math.sqrt(Math.max(0, 1 - k * k)))); }
  } else for (let i = 1; i <= L.tip; i++) ss.push(S_CAP * Math.pow(i / L.tip, 2));
  for (let i = 1; i <= L.mouth; i++) ss.push(S_CAP + (GAPE.s - S_CAP) * (i / L.mouth));
  const s0 = L.mouth > 0 ? GAPE.s : S_CAP;
  for (let i = 1; i <= L.head; i++) ss.push(s0 + (S_HEAD - s0) * (i / L.head));
  for (let i = 1; i <= L.trunk; i++) ss.push(S_HEAD + (S_CAUDAL_BASE - S_HEAD) * (i / L.trunk));
  const phiOf = (k: number) => { const psi = (k / around) * Math.PI * 2; return psi + L.squeeze * Math.sin(2 * psi); };
  // the gape lies at the side of every ring (φ = π/2 and 3π/2: each section's widest point is at the gape's height)
  const kL = around / 4, kR = (3 * around) / 4;
  const split = (s: number) => L.mouthOpen && s < GAPE.s - 1e-9;
  const jaw = boneIndex('J_jaw');
  const lower = (k: number) => k > kL && k < kR;

  /** a ring vertex: rolled lips, the sunk gill chamber, the jaw's share */
  const skin = (s: number, phi: number, lowerSide: boolean, a3: [number, number, number], a2: [number, number]): number => {
    const p = skinPoint(s, phi);
    // the near tier's skin is marked (aPart 0.01) so its shader knows the gill cover is in the geometry
    let occ = 1, part = L.mouthOpen ? 0.01 : 0;
    const y = p.y;
    if (L.mouthOpen) {
      const d = lipInset(s, y);
      if (d > 0) {
        p.addScaledVector(skinNormal(s, phi), -d);
        occ = 1 - 0.8 * Math.min(1, d / LIPS.upper);
      }
      const g = gillChamber(s, y);
      if (g > 0) {
        part = 0.01 + 0.15 * g;
        occ = Math.min(occ, 1 - 0.75 * g);
      }
    }
    let w = chainWeights(s);
    if (L.mouthOpen) {
      // the split mouth: everything below the gape is the lower jaw; behind the corner the chin hands over to the head
      if (split(s)) w = lowerSide ? [[jaw, 1]] : w;
      else w = blendJaw(w, (1 - smooth(GAPE.s, GAPE.s + 0.014, s)) * smooth(0, 0.008, GAPE.y1 - y));
    } else w = withJaw(s, y, w);
    return b.vertex([p.x, p.y, p.z], w, a3, a2, part, undefined, occ);
  };

  // a closed snout's tip
  const tip = L.mouthOpen ? -1 : skin(0, 0, false, [0, 0, 0], [0, 0]);
  const ringStart: number[] = [];
  const lowCopy: [number, number][] = [];
  const meridian: Vector3[] = [], mlen: number[] = [];
  const gape: Gape | null = L.mouthOpen ? { rings: [], cornerL: 0, cornerR: 0 } : null;
  for (const s of ss) {
    const sec = section(s);
    // arc length from the dorsal midline (TL units) along this section, for the patterns
    let arc = 0, prev = sectionPoint(sec, 0);
    const arcs: number[] = [];
    for (let k = 0; k < around; k++) {
      const p = sectionPoint(sec, phiOf(k));
      if (k > 0) {
        // left side counts down from the top, the right side mirrors it
        if (k <= around / 2) arc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        prev = p;
      }
      arcs.push(arc);
    }
    ringStart.push(b.count);
    for (let k = 0; k < around; k++) {
      const phi = phiOf(k);
      const mirror = k <= around / 2 ? arcs[k] : arcs[around - k];
      const v = skin(s, phi, lower(k), [s, Math.cos(phi), Math.sin(phi)], [s, mirror]);
      // the pattern's first coordinate is the distance along the skin from the snout (so the pigment cells keep their
      // shape round the steep front of the snout, where s hardly changes)
      const p = vAt(b, v);
      if (meridian[k]) { mlen[k] += p.distanceTo(meridian[k]); meridian[k].copy(p); } else { meridian[k] = p; mlen[k] = s; }
      b.a2[v * 2] = mlen[k];
    }
    if (split(s)) {
      // the lower lip's own edge vertices, where the upper lip's are now
      const l = skin(s, phiOf(kL), true, [s, Math.cos(phiOf(kL)), Math.sin(phiOf(kL))], [mlen[kL], arcs[kL]]);
      const r = skin(s, phiOf(kR), true, [s, Math.cos(phiOf(kR)), Math.sin(phiOf(kR))], [mlen[kR], arcs[around - kR]]);
      lowCopy.push([l, r]);
      gape!.rings.push({ s, upL: ringStart[ringStart.length - 1] + kL, upR: ringStart[ringStart.length - 1] + kR, loL: l, loR: r });
    } else {
      lowCopy.push([-1, -1]);
      if (gape && gape.cornerL === 0) { gape.cornerL = ringStart[ringStart.length - 1] + kL; gape.cornerR = ringStart[ringStart.length - 1] + kR; }
    }
  }
  /** a ring's vertex k on the given side of the gape */
  const vid = (r: number, k: number, low: boolean) => {
    if (low && lowCopy[r][0] >= 0) { if (k === kL) return lowCopy[r][0]; if (k === kR) return lowCopy[r][1]; }
    return ringStart[r] + (k % around);
  };
  // tip fan (a split mouth has none: its first ring is the front of the gape, upper and lower halves apart)
  if (tip >= 0) for (let k = 0; k < around; k++) b.idx.push(tip, vid(0, k + 1, false), vid(0, k, false));
  // loft (the quads between the lips' edges are never made: that is the gape)
  for (let r = 0; r < ss.length - 1; r++) {
    for (let k = 0; k < around; k++) {
      const low = k >= kL && k < kR;
      const a = vid(r, k, low), a1 = vid(r, k + 1, low), c = vid(r + 1, k, low), c1 = vid(r + 1, k + 1, low);
      b.idx.push(a, a1, c, a1, c1, c);
    }
  }
  // tail cap (inside the caudal fin's base)
  const last = ringStart[ss.length - 1];
  const sEnd = S_CAUDAL_BASE + 0.004;
  const tail = b.vertex([0, section(S_CAUDAL_BASE).yc, zOf(sEnd)], chainWeights(sEnd), [sEnd, 0, 0], [sEnd, 0], 0, [0, 0, -1]);
  for (let k = 0; k < around; k++) b.idx.push(tail, last + k, last + ((k + 1) % around));
  return gape;
}

const vAt = (b: Builder, i: number) => new Vector3(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]).divideScalar(TL);

/** push a triangle facing `want` (flipping its winding if it does not) */
function faced(b: Builder, a: number, c: number, d: number, want: Vector3): void {
  const A = vAt(b, a), n = vAt(b, c).sub(A).cross(vAt(b, d).sub(A));
  if (n.dot(want) >= 0) b.idx.push(a, c, d); else b.idx.push(a, d, c);
}

/**
 * The mouth cavity behind the lips: a vaulted palate from the upper lip's edge across to the other side, a floor from
 * the lower lip's, the two meeting along a line across the head at the corner of the mouth. Dark and shut in; seen
 * when the jaw drops.
 */
function buildMouth(b: Builder, g: Gape, across: number): void {
  const jaw = boneIndex('J_jaw');
  const head = chainWeights(0.02);
  const row = (s: number, iL: number, iR: number, sign: number, w: [number, number][], shared?: number[]): number[] => {
    if (shared) return shared;
    const A = vAt(b, iL), B = vAt(b, iR);
    // the vault rises behind the lips' front edge and falls to nothing at the corner
    const k = Math.max(0, 1 - s / GAPE.s) * smooth(0, 0.004, s);
    const arch = Math.min(0.006, 0.5 * Math.abs(A.x)) * Math.sqrt(k), back = 0.004 * k;
    const out: number[] = [];
    for (let t = 0; t <= across; t++) {
      const u = t / across, bump = Math.sin(Math.PI * u);
      const p = A.clone().lerp(B, u);
      p.y += sign * arch * bump;
      p.z -= back * bump;
      out.push(b.vertex([p.x, p.y, p.z], w, [s, 0, 0], [s, 0], 3, undefined, 0.2 + 0.25 * (1 - bump)));
    }
    return out;
  };
  // the back of the cavity, shared by palate and floor
  const cs = GAPE.s;
  const corner = row(cs, g.cornerL, g.cornerR, 0, head);
  for (const [sign, want, w] of [[1, new Vector3(0, -1, 0), head], [-1, new Vector3(0, 1, 0), [[jaw, 1]] as [number, number][]]] as const) {
    const rows = g.rings.map((r) => row(r.s, sign > 0 ? r.upL : r.loL, sign > 0 ? r.upR : r.loR, sign, w as [number, number][]));
    rows.push(row(cs, 0, 0, 0, head, corner));
    for (let r = 0; r < rows.length - 1; r++) {
      for (let t = 0; t < across; t++) {
        faced(b, rows[r][t], rows[r + 1][t], rows[r][t + 1], want);
        faced(b, rows[r][t + 1], rows[r + 1][t], rows[r + 1][t + 1], want);
      }
    }
  }
}

/** the head's surface and its outward normal at (s, height y) on one side */
function flank(s: number, y: number, side: 1 | -1): { p: Vector3; n: Vector3 } {
  const e = 0.002;
  const P = (ss: number, yy: number) => new Vector3(side * halfWidthAt(ss, yy), yy, zOf(ss));
  const p = P(s, y);
  const ds = P(s + e, y).sub(P(s - e, y)), dy = P(s, y + e).sub(P(s, y - e));
  const n = new Vector3().crossVectors(dy, ds).normalize();
  if (n.x * side < 0) n.negate();
  return { p, n };
}

/**
 * An eye: the flat cornea over a big lens, a shallow dome raised off the head's own curved surface (so the skin closes
 * over it exactly at the dark rim, wherever the head curves away) and carried a little past the rim under the skin.
 * aPat = the point on the eye's disc (1 at the visible rim; x toward the snout, y up), aBody.y = 1 − that radius.
 */
function buildEye(b: Builder, side: 1 | -1, nTheta: number, nPsi: number): void {
  const RHO = 1.04;
  // the dome's height over the skin at disc radius rho: a shallow cap meeting the skin at the rim, then sinking under it
  const lift = (rho: number) => (rho <= 1 ? EYE.bulge * (1 - rho * rho) : -0.003 * (rho - 1) / (RHO - 1));
  const at = (ex: number, ey: number): Vector3 => {
    const rho = Math.hypot(ex, ey);
    const { p, n } = flank(EYE.s - ex * EYE.r, EYE.y + ey * EYE.r, side);
    return p.addScaledVector(n, lift(rho));
  };
  const start = b.count;
  const w = chainWeights(0.05);
  const e = 0.01;
  for (let i = 0; i <= nTheta; i++) {
    // rings close together toward the rim
    const rho = RHO * Math.sin((i / nTheta) * Math.PI * 0.5);
    for (let j = 0; j < nPsi; j++) {
      const ps = (j / nPsi) * Math.PI * 2;
      const ex = rho * Math.cos(ps), ey = rho * Math.sin(ps);
      const p = at(ex, ey);
      // normal from the surface's own tangents (x toward the snout, y up)
      const tx = at(ex + e, ey).sub(at(ex - e, ey)), ty = at(ex, ey + e).sub(at(ex, ey - e));
      const n = new Vector3().crossVectors(tx, ty).normalize();
      if (n.x * side < 0) n.negate();
      b.vertex([p.x, p.y, p.z], w, [EYE.s, 1 - rho, side], [ex, ey], 1, [n.x, n.y, n.z]);
      if (i === 0) break;   // one pole vertex
    }
  }
  // pole fan, then rings (vertex 0 is the pole; ring i (≥1) starts at 1 + (i-1)·nPsi)
  const ringAt = (i: number) => start + 1 + (i - 1) * nPsi;
  for (let j = 0; j < nPsi; j++) {
    const j1 = (j + 1) % nPsi;
    if (side > 0) b.idx.push(start, ringAt(1) + j1, ringAt(1) + j); else b.idx.push(start, ringAt(1) + j, ringAt(1) + j1);
  }
  for (let i = 1; i < nTheta; i++) {
    for (let j = 0; j < nPsi; j++) {
      const j1 = (j + 1) % nPsi;
      const a = ringAt(i) + j, a1 = ringAt(i) + j1, c0 = ringAt(i + 1) + j, c1 = ringAt(i + 1) + j1;
      if (side > 0) b.idx.push(a, a1, c0, a1, c1, c0); else b.idx.push(a, c0, a1, a1, c0, c1);
    }
  }
}

/** the loft's pattern attributes for the point of the skin at (s, height y) on one side: aBody and aPat */
function skinAttrs(s: number, y: number, side: 1 | -1): { a3: [number, number, number]; a2: [number, number] } {
  const sec = section(s);
  const dy = y - sec.yc, span = dy >= 0 ? sec.top : sec.bot, n = dy >= 0 ? sec.nTop : sec.nBot;
  const cp = Math.sign(dy) * Math.pow(Math.min(1, Math.abs(dy) / Math.max(span, 1e-6)), n / 2);
  const sp = Math.pow(Math.min(1, halfWidthAt(s, y) / Math.max(sec.hw, 1e-6)), sec.hw > 0 ? n / 2 : 1);
  const phi = Math.atan2(sp, cp);
  // arc length from the dorsal midline down to φ
  let arc = 0, prev = sectionPoint(sec, 0);
  for (let i = 1; i <= 24; i++) { const q = sectionPoint(sec, (phi * i) / 24); arc += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  // (the skin's first pattern coordinate runs a little ahead of s on the head: the distance along it from the snout)
  return { a3: [s, Math.cos(phi), side * Math.sin(phi)], a2: [s + 0.015, arc] };
}

interface Plate {
  side: 1 | -1;
  /** height range of the plate (its ends sink into the skin) and the rows along it */
  top: number; bottom: number; nv: number;
  /** s of the outer face's rows at height y, front (sunk into the skin) to the start of the rounded free edge */
  rows: (y: number) => number[];
  /** s of the free edge at height y */
  edge: (y: number) => number;
  /** stand-off of the outer face (TL) at (s, y), negative where it sinks under the skin */
  lift: (s: number, y: number) => number;
  /** carry the edge round and back under the plate as its inner face (for a plate that swings open) */
  inner: boolean;
  /** aPart of the outer face at (s, y) */
  part: (s: number, y: number) => number;
  /** occlusion of the outer face */
  occ: (s: number, y: number) => number;
  weights: (s: number) => [number, number][];
}

/**
 * A bony plate of the gill cover: a thin shell lying on the cheek, its front and ends sunk into the skin, its free edge
 * standing off the skin behind it and rounded over into its thickness (and, for the opercle, back under itself as the
 * plate's inner face). Rows run front → edge (→ under), columns top → bottom.
 */
function buildPlate(b: Builder, P: Plate): void {
  const SUNK = -0.0012, UNDER = -0.0006, RIM = 0.0008;
  const grid: number[][] = [];
  for (let j = 0; j <= P.nv; j++) {
    const v = j / P.nv, y = P.top + (P.bottom - P.top) * v;
    // the ends of the plate dip under the skin
    const taper = smooth(0, 0.28, v) * (1 - smooth(0.72, 1, v));
    const t = (x: number) => SUNK + (x - SUNK) * taper;
    const E = P.edge(y);
    const col: number[] = [];
    const put = (s: number, off: number, part: number, occ: number) => {
      const { p, n } = flank(s, y, P.side);
      p.addScaledVector(n, t(off));
      const { a3, a2 } = skinAttrs(s, y, P.side);
      col.push(b.vertex([p.x, p.y, p.z], P.weights(s), a3, a2, part, undefined, occ));
    };
    for (const s of P.rows(y)) put(s, P.lift(s, y), P.part(s, y), P.occ(s, y));
    // the free edge, rounded over from the outer face down to the skin
    const te = P.lift(E - RIM, y);
    for (let m = 1; m <= 3; m++) {
      const th = (m / 3) * (Math.PI / 2);
      put(E - RIM * (1 - Math.sin(th)), te - (te - UNDER) * (1 - Math.cos(th)), 4, 0.85);
    }
    if (P.inner) {
      const F = P.rows(y)[0];
      for (const q of [0.06, 0.2, 0.42]) put(E - (E - F) * q, UNDER - 0.0016 * q - 0.0004, 4, 0.5);
    }
    grid.push(col);
  }
  // wind the outer face outward
  const A = vAt(b, grid[0][1]), B = vAt(b, grid[0][2]), C = vAt(b, grid[1][1]);
  const flip = B.sub(A).cross(C.sub(A)).x * P.side < 0;
  for (let j = 0; j < P.nv; j++) {
    const c0 = grid[j], c1 = grid[j + 1];
    for (let i = 0; i < c0.length - 1; i++) {
      if (!flip) b.idx.push(c0[i], c0[i + 1], c1[i], c0[i + 1], c1[i + 1], c1[i]);
      else b.idx.push(c0[i], c1[i], c0[i + 1], c0[i + 1], c1[i], c1[i + 1]);
    }
  }
}

/** rows of s from a to b (n steps, a included, b excluded) */
const span = (a: number, b: number, n: number): number[] => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / n);

/**
 * The gill cover on one side. The preopercle's posterior margin stands off the skin a little behind the eye and turns
 * forward below; under it starts the opercle, rising to its bony margin, then thinning into the membranous flap whose
 * free edge is the gill opening. The opercle swings out on J_oper_* (the skin under it is the gill chamber).
 */
function buildGillCover(b: Builder, side: 1 | -1, nv: number): void {
  const R = GILL.preop, O = GILL.oper;
  const chain = (s: number) => chainWeights(s);
  // the plates lie just under the skin over most of their area and come up through it toward their free edges, so
  // nothing but the edges shows: the preopercle's margin, the opercle's bony margin and its membranous flap
  buildPlate(b, {
    side, top: R.top, bottom: R.bottom, nv: Math.round(nv * 0.8), inner: false,
    rows: (y) => { const E = PREOP_EDGE(y), F = E - R.width; return [...span(F, E - 0.022, 2), ...span(E - 0.022, E - 0.0008, 5)]; },
    edge: PREOP_EDGE,
    lift: (s, y) => -0.0012 + (R.lift + 0.0012) * smooth(PREOP_EDGE(y) - 0.022, PREOP_EDGE(y) - 0.003, s),
    part: () => 0.3, occ: () => 1, weights: chain,
  });
  const operBone = boneIndex(side > 0 ? 'J_oper_L' : 'J_oper_R'), sp1 = boneIndex('J_sp1');
  buildPlate(b, {
    side, top: O.top, bottom: O.bottom, nv, inner: true,
    rows: (y) => {
      const F = PREOP_EDGE(y) - 0.01, Bn = OPER_BONE(y), E = OPER_EDGE(y);
      const b0 = Math.min(Bn - 0.0015, E - 0.006), b1 = Math.min(Bn + 0.0015, E - 0.004);
      return [...span(F, b0 - 0.026, 2), ...span(b0 - 0.026, b0, 5), ...span(b0, b1, 2), ...span(b1, E - 0.0008, 3)];
    },
    edge: OPER_EDGE,
    lift: (s, y) => {
      const Bn = OPER_BONE(y);
      const rise = -0.0012 + (O.lift + 0.0012) * smooth(Bn - 0.026, Bn - 0.004, s);
      return rise + (O.membrane - O.lift) * smooth(Bn - 0.0012, Bn + 0.0012, s);
    },
    part: (s, y) => 0.35 + 0.04 * smooth(OPER_BONE(y) - 0.0012, OPER_BONE(y) + 0.0012, s),
    occ: () => 1,
    // the plate rides the skin beneath it, its trunk share swinging open on the opercle's bone
    weights: (s) => chain(s).map(([i, w]) => [i === sp1 ? operBone : i, w] as [number, number]),
  });
}

type P3 = [number, number, number];

/** A fin membrane as a grid over (a across the base, t along the rays). */
function membrane(b: Builder, na: number, nt: number, id: number, at: (a: number, t: number) => P3, weights: (a: number, t: number, p: P3) => [number, number][], part?: number): void {
  const start = b.count;
  for (let i = 0; i <= na; i++) {
    for (let j = 0; j <= nt; j++) {
      const a = i / na, t = j / nt;
      const p = at(a, t);
      if (part === undefined) b.vertex(p, weights(a, t, p), [a, t, id]);
      else b.vertex(p, weights(a, t, p), [sOf(p), 0, 0], [sOf(p), 0], part);
    }
  }
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nt; j++) {
      const v = start + i * (nt + 1) + j;
      b.idx.push(v, v + nt + 1, v + 1, v + 1, v + nt + 1, v + nt + 2);
    }
  }
}

const sOf = (p: P3): number => 0.38 - p[2];   // inverse of zOf
const lerpLen = (len: readonly number[], a: number): number => {
  const x = a * (len.length - 1), i = Math.min(len.length - 2, Math.floor(x)), f = x - i;
  return len[i] * (1 - f) + len[i + 1] * f;
};

function caudalAt(a: number, t: number): P3 {
  const C = FINS.caudal;
  const v = a * 2 - 1, av = Math.abs(v);
  // a broad, shallowly forked fan: the notch at the middle, pointed lobes, the trailing edge nearly straight
  const edgeS = C.fork + (C.tip - C.fork) * Math.pow(av, 1.1) - 0.012 * Math.pow(Math.max(0, (av - 0.86) / 0.14), 2);
  const edgeY = Math.sign(v) * C.span * av;
  // the base follows the curved end of the scaled body
  const baseS = C.s0 + 0.012 * (1 - av * av);
  const baseY = v * C.halfBase;
  const s = baseS + (edgeS - baseS) * t;
  const y = baseY + (edgeY - baseY) * Math.pow(t, 0.85);
  return [0.0012 * Math.sin(Math.PI * t) * v, y, 0.38 - s];
}

function medianAt(f: { s0: number; s1: number; len: readonly number[]; rake: readonly number[] }, dorsal: boolean, a: number, t: number): P3 {
  const s = f.s0 + (f.s1 - f.s0) * a;
  const y0 = dorsal ? dorsalY(s) - 0.002 : ventralY(s) + 0.002;
  const L = lerpLen(f.len, a);
  // the rays rake back more toward the end of the base (a fan), and curve back slightly at their tips
  const rake = f.rake[0] + (f.rake[1] - f.rake[0]) * a + 0.08 * t;
  const dy = Math.cos(rake) * L * t * (dorsal ? 1 : -1), ds = Math.sin(rake) * L * t;
  return [0, y0 + dy, 0.38 - (s + ds)];
}

function pelvicAt(side: 1 | -1, a: number, t: number): P3 {
  const P = FINS.pelvic;
  // close together under the belly, swept back and down
  const s0 = P.s - 0.01 + 0.014 * a;
  const x0 = side * (0.006 + 0.008 * a), y0 = ventralY(s0) + 0.003;
  const L = P.len * (1 - 0.4 * a);
  const rake = P.rake + 0.32 * a;
  const dir = new Vector3(side * (0.1 + 0.08 * a), -Math.cos(rake), -Math.sin(rake)).normalize();
  return [x0 + dir.x * L * t, y0 + dir.y * L * t, 0.38 - s0 + dir.z * L * t];
}

function pectoralAt(side: 1 | -1, a: number, t: number): P3 {
  const P = FINS.pectoral;
  // the base runs obliquely down and back from the axillary spot; a = 0 the upper (longest) ray
  const s0 = PEC.s + 0.022 * a, y0 = PEC.y + 0.008 - 0.034 * a;
  const x0 = side * halfWidthAt(s0, y0) * 0.97;
  const L = P.len * (1 - 0.62 * a);
  // at rest the fin lies back along the upper flank, standing just off it, its rays fanning from level (the upper)
  // to raised (the lower, short ones)
  const dir = new Vector3(side * (0.1 + 0.04 * a), 0.04 + 0.32 * a, -1).normalize();
  const bend = 0.12 * t * t;   // the fin follows the body's curve toward its tip
  return [x0 + side * (dir.x * L * t - bend * 0.08 * L), y0 + dir.y * L * t, 0.38 - s0 + dir.z * L * t];
}

function buildFins(b: Builder, lod: 0 | 1): void {
  const hi = lod === 0;
  const chain = (_a: number, _t: number, p: P3) => chainWeights(sOf(p));
  membrane(b, hi ? 24 : 8, hi ? 10 : 4, FIN_ID.caudal, caudalAt, chain);
  const d1Bone = boneIndex('J_d1');
  membrane(b, hi ? 12 : 4, hi ? 6 : 3, FIN_ID.d1, (a, t) => medianAt(FINS.d1, true, a, t), (a, t, p) => {
    const k = Math.min(1, t / 0.25);
    return [...chainWeights(sOf(p)).map(([i, w]) => [i, w * (1 - k)] as [number, number]), [d1Bone, k]];
  });
  membrane(b, hi ? 14 : 5, hi ? 6 : 3, FIN_ID.d2, (a, t) => medianAt(FINS.d2, true, a, t), chain);
  membrane(b, hi ? 14 : 5, hi ? 6 : 3, FIN_ID.anal, (a, t) => medianAt(FINS.anal, false, a, t), chain);
  if (hi) {
    membrane(b, 6, 6, FIN_ID.pelvic, (a, t) => pelvicAt(1, a, t), chain);
    membrane(b, 6, 6, FIN_ID.pelvic, (a, t) => pelvicAt(-1, a, t), chain);
  }
  const pl = boneIndex('J_pec_L'), pr = boneIndex('J_pec_R');
  membrane(b, hi ? 12 : 5, hi ? 8 : 4, FIN_ID.pectoral, (a, t) => pectoralAt(1, a, t), () => [[pl, 1]]);
  membrane(b, hi ? 12 : 5, hi ? 8 : 4, FIN_ID.pectoral, (a, t) => pectoralAt(-1, a, t), () => [[pr, 1]]);
}

/** LOD2: the forked tail as an opaque sliver in the body mesh */
function buildTailSliver(b: Builder): void {
  membrane(b, 4, 2, 0, caudalAt, (_a, _t, p) => chainWeights(sOf(p)), 2);
}

const cache = new Map<Lod, HakuGeometry>();

/** The shared geometry of a tier (built on first use). */
export function hakuGeometry(lod: Lod): HakuGeometry {
  const hit = cache.get(lod);
  if (hit) return hit;
  const body = new Builder();
  if (lod === 0) {
    const gape = buildBody(body, { tip: 10, mouth: 8, head: 28, trunk: 38, around: 48, squeeze: 0.22, mouthOpen: true });
    buildMouth(body, gape!, 6);
    buildEye(body, 1, 12, 28); buildEye(body, -1, 12, 28);
    buildGillCover(body, 1, 18); buildGillCover(body, -1, 18);
  } else if (lod === 1) {
    buildBody(body, { tip: 3, mouth: 0, head: 9, trunk: 14, around: 16, squeeze: 0, mouthOpen: false });
    buildEye(body, 1, 4, 12); buildEye(body, -1, 4, 12);
  } else { buildBody(body, { tip: 2, mouth: 0, head: 3, trunk: 6, around: 8, squeeze: 0, mouthOpen: false }); buildTailSliver(body); }
  // body normals: computed over the closed loft, then the eyes' analytic normals are restored
  const g = body.build('body', false);
  const eyeNormals = body.nrm.slice();
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as Float32BufferAttribute;
  for (let i = 0; i < body.count; i++) if (body.part[i] === 1) n.setXYZ(i, eyeNormals[i * 3], eyeNormals[i * 3 + 1], eyeNormals[i * 3 + 2]);
  // a closed snout's tip keeps its axial normal (the fan average is off-axis); the split lips' tips keep their own,
  // turned into the gape
  if (lod > 0) n.setXYZ(0, 0, -0.1, 1);   // vertex 0 is the closed snout's tip
  n.needsUpdate = true;
  let fins: BufferGeometry | null = null;
  if (lod < 2) { const fb = new Builder(); buildFins(fb, lod as 0 | 1); fins = fb.build('fins', true); }
  const out = { body: g, fins };
  cache.set(lod, out);
  return out;
}

/** triangle counts per tier (docs / tests) */
export function triangleCount(lod: Lod): number {
  const g = hakuGeometry(lod);
  return (g.body.index!.count + (g.fins?.index?.count ?? 0)) / 3;
}
