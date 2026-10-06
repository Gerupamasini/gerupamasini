import { BufferGeometry, Float32BufferAttribute, Matrix4, Sphere, Uint16BufferAttribute, Vector3 } from 'three';
import {
  BONES, D1, EYE, FINS, FIN_ID, JAW, MODEL_TL, PEC, SPINE, SPINE_S, S_CAP, S_CAUDAL_BASE, boneIndex, dorsalY, section, sectionPoint, ventralY, zOf,
  type BoneName,
} from './anatomy';

/**
 * The ハク's skinned geometry, three tiers, built once and shared by every fish (each fish has its own skeleton).
 *
 *  LOD0  8,704 triangles: 74 × 40 body loft, eyes, all seven fins with ray-resolution membranes
 *  LOD1  1,200 triangles: 26 × 16 body, small eyes, caudal / dorsals / anal / pectorals
 *  LOD2    192 triangles: 11 × 8 body with the forked tail folded into the same mesh (one draw call, opaque)
 *
 * Body vertices carry aBody = (s, cos φ, sin φ), aPat = (s, arc length from the dorsal midline) in TL units and
 * aPart (0 body, 1 eye, 2 opaque tail of LOD2); fin vertices carry aFin = (across the base, along the ray, fin id).
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
  get count(): number { return this.pos.length / 3; }

  vertex(p: [number, number, number], weights: [number, number][], a3: [number, number, number], a2?: [number, number], part?: number, n?: [number, number, number]): number {
    this.pos.push(p[0] * TL, p[1] * TL, p[2] * TL);
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
    } else g.setAttribute('aFin', new Float32BufferAttribute(this.a3, 3));
    g.setIndex(this.idx);
    if (computeNormals) g.computeVertexNormals();
    // the fish bends but never leaves this sphere (frustum culling of the skinned meshes)
    g.boundingSphere = new Sphere(new Vector3(0, 0, 0), 0.68 * TL);
    return g;
  }
}

/** jaw influence for a body vertex: the chin and lower lip below the mouth line follow J_jaw */
function withJaw(s: number, y: number, w: [number, number][]): [number, number][] {
  const c = section(s);
  if (s > JAW.s + 0.012 || y > c.yc - 0.003) return w;
  const k = Math.min(1, Math.max(0, (JAW.s + 0.012 - s) / 0.03)) * Math.min(1, Math.max(0, (c.yc - 0.003 - y) / 0.01));
  if (k <= 0) return w;
  return [...w.map(([b, v]) => [b, v * (1 - k)] as [number, number]), [boneIndex('J_jaw'), k]];
}

function buildBody(b: Builder, rings: number, tipRings: number, around: number): void {
  // ring stations: dense through the rounded snout (s ∝ u² so the cap grows like a dome), even along the trunk
  const ss: number[] = [];
  for (let i = 1; i <= tipRings; i++) ss.push(S_CAP * Math.pow(i / tipRings, 2));
  for (let i = 1; i <= rings; i++) ss.push(S_CAP + (S_CAUDAL_BASE - S_CAP) * (i / rings));
  // snout tip
  const yc0 = section(0).yc;
  b.vertex([0, yc0, zOf(0)], withJaw(0, yc0 - 0.004, chainWeights(0)), [0, 0, 0], [0, 0], 0, [0, 0, 1]);
  const ring0 = b.count;
  for (const s of ss) {
    const sec = section(s);
    // arc length from the dorsal midline (TL units) along this section, for the patterns
    let arc = 0, prev = sectionPoint(sec, 0);
    const arcs: number[] = [];
    for (let k = 0; k < around; k++) {
      const phi = (k / around) * Math.PI * 2;
      const p = sectionPoint(sec, phi);
      if (k > 0) {
        // left side counts down from the top, the right side mirrors it
        if (k <= around / 2) arc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        prev = p;
      }
      arcs.push(arc);
    }
    for (let k = 0; k < around; k++) {
      const phi = (k / around) * Math.PI * 2;
      const [x, y] = sectionPoint(sec, phi);
      const mirror = k <= around / 2 ? arcs[k] : arcs[around - k];
      b.vertex([x, y, zOf(s)], withJaw(s, y, chainWeights(s)), [s, Math.cos(phi), Math.sin(phi)], [s, mirror], 0);
    }
  }
  // tip fan
  for (let k = 0; k < around; k++) b.idx.push(0, ring0 + ((k + 1) % around), ring0 + k);
  // loft
  for (let r = 0; r < ss.length - 1; r++) {
    const a = ring0 + r * around, c = a + around;
    for (let k = 0; k < around; k++) {
      const k1 = (k + 1) % around;
      b.idx.push(a + k, a + k1, c + k, a + k1, c + k1, c + k);
    }
  }
  // tail cap (inside the caudal fin's base)
  const last = ring0 + (ss.length - 1) * around;
  const sEnd = S_CAUDAL_BASE + 0.004;
  const tail = b.vertex([0, section(S_CAUDAL_BASE).yc, zOf(sEnd)], chainWeights(sEnd), [sEnd, 0, 0], [sEnd, 0], 0, [0, 0, -1]);
  for (let k = 0; k < around; k++) b.idx.push(tail, last + k, last + ((k + 1) % around));
}

/** An eye: the outer part of a flattened ellipsoid bulging out of the head, aBody.y = cos of the angle from its axis. */
function buildEye(b: Builder, side: 1 | -1, nTheta: number, nPsi: number): void {
  const s = EYE.s, y = EYE.y;
  const out = new Vector3(side, 0.16, 0.1).normalize();
  const t1 = new Vector3(0, 0, 1).addScaledVector(out, -out.z).normalize();   // forward along the head
  const t2 = new Vector3().crossVectors(out, t1).multiplyScalar(side);        // up
  if (t2.y < 0) t2.negate();
  const surf = halfWidthAt(s, y);
  const c = new Vector3(side * (surf + EYE.bulge - EYE.axial), y, zOf(s));
  const start = b.count;
  const thetaMax = Math.PI * 0.64;
  const w = chainWeights(0.05);
  for (let i = 0; i <= nTheta; i++) {
    const th = (i / nTheta) * thetaMax;
    for (let j = 0; j < nPsi; j++) {
      const ps = (j / nPsi) * Math.PI * 2;
      const lx = Math.cos(ps) * Math.sin(th), ly = Math.sin(ps) * Math.sin(th), lz = Math.cos(th);
      const p = c.clone().addScaledVector(t1, lx * EYE.r).addScaledVector(t2, ly * EYE.r).addScaledVector(out, lz * EYE.axial);
      // ellipsoid normal: gradient of (x/r)² + (z/a)²
      const n = new Vector3().addScaledVector(t1, lx / EYE.r).addScaledVector(t2, ly / EYE.r).addScaledVector(out, lz / EYE.axial).normalize();
      b.vertex([p.x, p.y, p.z], w, [s, lz, side], [lx, ly], 1, [n.x, n.y, n.z]);
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
  // forked outline: the fork's notch at the middle, lobes reaching back to the tips, rounded lobe ends
  const edgeS = C.fork + (C.tip - C.fork) * Math.pow(av, 1.25) - 0.016 * Math.pow(Math.max(0, (av - 0.82) / 0.18), 2);
  const edgeY = Math.sign(v) * C.span * Math.pow(av, 0.92) * (1 - 0.05 * Math.pow(Math.max(0, (av - 0.85) / 0.15), 2));
  const baseS = C.s0 + 0.01 * (1 - av * av);
  const baseY = v * C.halfBase;
  // rays bow a little: the membrane is cupped toward the trailing edge
  const s = baseS + (edgeS - baseS) * t;
  const y = baseY + (edgeY - baseY) * Math.pow(t, 0.9);
  return [0.0015 * Math.sin(Math.PI * t) * v, y, 0.38 - s];
}

function medianAt(f: { s0: number; s1: number; len: readonly number[]; rake: number }, dorsal: boolean, a: number, t: number): P3 {
  const s = f.s0 + (f.s1 - f.s0) * a;
  const y0 = dorsal ? dorsalY(s) - 0.002 : ventralY(s) + 0.002;
  const L = lerpLen(f.len, a);
  // the rays rake back more toward the end of the base, and bend slightly at their tips
  const rake = f.rake + 0.25 * a + 0.15 * t;
  const dy = Math.cos(rake) * L * t * (dorsal ? 1 : -1), ds = Math.sin(rake) * L * t;
  return [0, y0 + dy, 0.38 - (s + ds)];
}

function pelvicAt(side: 1 | -1, a: number, t: number): P3 {
  const P = FINS.pelvic;
  const s0 = P.s - 0.012 + 0.016 * a;
  const x0 = side * (0.008 + 0.006 * a), y0 = ventralY(s0) + 0.004;
  const L = P.len * (1 - 0.35 * a);
  const dir = new Vector3(side * (0.22 + 0.25 * a), -0.42 + 0.12 * a, -1).normalize();
  return [x0 + dir.x * L * t, y0 + dir.y * L * t, 0.38 - s0 + dir.z * L * t];
}

function pectoralAt(side: 1 | -1, a: number, t: number): P3 {
  const P = FINS.pectoral;
  // base runs obliquely down the flank right behind the gill cover; a = 0 the upper (longest) ray
  const s0 = PEC.s + 0.006 * a, y0 = PEC.y + 0.011 - 0.024 * a;
  const x0 = side * halfWidthAt(s0, y0) * 0.97;
  const L = P.len * (1 - 0.5 * a * a);
  // at rest the fin lies back along the flank, standing a little off it
  const dir = new Vector3(side * (0.2 + 0.08 * a), 0.1 - 0.22 * a, -1).normalize();
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
  if (lod === 0) { buildBody(body, 64, 10, 40); buildEye(body, 1, 14, 24); buildEye(body, -1, 14, 24); }
  else if (lod === 1) { buildBody(body, 22, 4, 16); buildEye(body, 1, 4, 10); buildEye(body, -1, 4, 10); }
  else { buildBody(body, 9, 2, 8); buildTailSliver(body); }
  // body normals: computed over the closed loft, then the eyes' analytic normals are restored
  const g = body.build('body', false);
  const eyeNormals = body.nrm.slice();
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as Float32BufferAttribute;
  for (let i = 0; i < body.count; i++) if (body.part[i] === 1) n.setXYZ(i, eyeNormals[i * 3], eyeNormals[i * 3 + 1], eyeNormals[i * 3 + 2]);
  // the snout tip and tail cap keep their axial normals (the fan average is off-axis)
  n.setXYZ(0, 0, -0.1, 1);
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
