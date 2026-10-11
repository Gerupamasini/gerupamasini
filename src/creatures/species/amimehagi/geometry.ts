import { BufferGeometry, Float32BufferAttribute, Matrix4, Sphere, Uint16BufferAttribute, Uint32BufferAttribute, Vector3 } from 'three';
import {
  ANAL, BONES, CAUDAL, DORSAL, EYE, FIN_BONES, FLAP, GAPE, JAW, MODEL_TL, PEC, SPINE, SPINE_D1, SPINE_S, S_CAUDAL_BASE, S_HEAD, S_PIVOT,
  boneIndex, dorsalY, gapeY, halfWidthAt, sectionPoint, ventralY, zOf, type BoneName,
} from './anatomy';

/**
 * The アミメハギ's skinned geometry, three tiers, built once and shared by every fish (each fish has its own skeleton).
 *
 *  LOD0  the named parts of the rig, one mesh each: Head and Body (a 64-around loft split behind the gill slit, with
 *        the lips' seam over the jaw bone, the eye sockets' rims and a scatter of skin filaments), Eye_L / Eye_R
 *        (eyeballs turning on their own bones), DorsalSpine (the barbed first spine with the membrane behind it),
 *        DorsalFin, AnalFin, PectoralFin_L / _R and CaudalFin (membranes at ray resolution)
 *  LOD1  Body (a 24-around loft with small eye caps and the spine) and Fins (all five fins, coarser)
 *  LOD2  Body only: an 10-around loft with the tail folded into the same mesh (one draw call, opaque)
 *
 * Skin vertices carry aPart (0 skin, 2 the far tier's opaque tail, 4 the spine, 5 a skin filament, 6 the spine's
 * membrane, 7 a small eye on the far tiers, 8 the skin over the eyeball's edge) and aThin (how much light gets through the
 * tissue: 0 thick .. 1 thin; on the eye's skin ring, how near the opening); fin
 * vertices carry aFin = (across the base 0..1, along the ray 0..1, fin id: 0 caudal, 1 dorsal, 2 anal, 3 pectoral);
 * eye vertices aEye = (angle from the eye's axis / the largest drawn, azimuth, side).
 * Model frame: metres, +Z forward, +Y up, +X the fish's left, origin on the axis at S_PIVOT.
 */

export type Lod = 0 | 1 | 2;
export const PART_NAMES = ['Head', 'Body', 'Eye_L', 'Eye_R', 'DorsalSpine', 'DorsalFin', 'AnalFin', 'PectoralFin_L', 'PectoralFin_R', 'CaudalFin'] as const;
export type PartName = (typeof PART_NAMES)[number] | 'Fins';
/** which material each mesh takes */
export const PART_KIND: Record<PartName, 'skin' | 'eye' | 'fin'> = {
  Head: 'skin', Body: 'skin', DorsalSpine: 'skin', Eye_L: 'eye', Eye_R: 'eye',
  DorsalFin: 'fin', AnalFin: 'fin', PectoralFin_L: 'fin', PectoralFin_R: 'fin', CaudalFin: 'fin', Fins: 'fin',
};

const TL = MODEL_TL;
type P3 = [number, number, number];
type W = [number, number][];

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** model-frame point (TL units) from (s, y, x) */
const at = (s: number, y: number, x = 0): P3 => [x, y, zOf(s)];

/** Linear interpolation through a short list of values spread evenly over [0, 1]. */
export function along(vals: readonly number[], a: number): number {
  const x = Math.min(1, Math.max(0, a)) * (vals.length - 1);
  const i = Math.min(vals.length - 2, Math.floor(x));
  return lerp(vals[i], vals[i + 1], x - i);
}

// ------------------------------------------------------------------ rig

export interface RigRest {
  parent: number[];
  /** rest positions (model space, metres) */
  world: Vector3[];
  /** inverse bind matrices, shared by every skeleton (the rest pose has no rotations) */
  inverses: Matrix4[];
  /** rotation axes (model frame, unit) of the undulating fins' bones: the base line's direction at each bone */
  dorsalAxes: Vector3[];
  analAxes: Vector3[];
  /** each pectoral's base line (top → bottom) and the direction its rays lie at rest */
  pecBase: [Vector3, Vector3];
  pecRest: [Vector3, Vector3];
}

/** a point on a soft fin's base: s and the height, just inside the knife edge */
function finBase(f: typeof DORSAL | typeof ANAL, dorsal: boolean, a: number): { s: number; y: number } {
  const s = lerp(f.s0, f.s1, a);
  return { s, y: dorsal ? dorsalY(s) - 0.002 : -ventralY(s) + 0.002 };
}
function finTangent(f: typeof DORSAL | typeof ANAL, dorsal: boolean, a: number): Vector3 {
  const p0 = finBase(f, dorsal, Math.max(0, a - 0.02)), p1 = finBase(f, dorsal, Math.min(1, a + 0.02));
  return new Vector3(0, p1.y - p0.y, zOf(p1.s) - zOf(p0.s)).normalize();
}

function pecFrame(side: 1 | -1): { top: P3; bot: P3; ctr: P3; base: Vector3; rest: Vector3 } {
  const h = PEC.base / 2;
  const sTop = PEC.s - h * Math.sin(PEC.tilt), yTop = PEC.y + h * Math.cos(PEC.tilt);
  const sBot = PEC.s + h * Math.sin(PEC.tilt), yBot = PEC.y - h * Math.cos(PEC.tilt);
  const top: P3 = at(sTop, yTop, side * halfWidthAt(sTop, yTop) * 0.96);
  const bot: P3 = at(sBot, yBot, side * halfWidthAt(sBot, yBot) * 0.96);
  const ctr: P3 = [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2];
  const base = new Vector3(bot[0] - top[0], bot[1] - top[1], bot[2] - top[2]).normalize();
  // at rest the fin lies back along the flank, a little out from it
  const rest = new Vector3(side * 0.3, 0.05, -1).normalize();
  return { top, bot, ctr, base, rest };
}

let rig: RigRest | null = null;
export function rigRest(): RigRest {
  if (rig) return rig;
  const world: Vector3[] = [], parent: number[] = [];
  const v = (p: P3) => new Vector3(p[0] * TL, p[1] * TL, p[2] * TL);
  const chainFor = (s: number): number => {
    let j = 0;
    for (let i = 0; i < SPINE_S.length; i++) if (s >= SPINE_S[i] - 1e-6) j = i;
    return boneIndex(SPINE[j][0] as BoneName);
  };
  const dorsalAxes: Vector3[] = [], analAxes: Vector3[] = [];
  const pl = pecFrame(1), pr = pecFrame(-1);
  for (const name of BONES) {
    if (name === 'J_root') { world.push(new Vector3()); parent.push(-1); continue; }
    const si = SPINE.findIndex(([n]) => n === name);
    if (si >= 0) { world.push(v(at(SPINE[si][1], 0))); parent.push(si === 0 ? boneIndex('J_root') : boneIndex(SPINE[si - 1][0] as BoneName)); continue; }
    if (name === 'J_jaw') { world.push(v(at(JAW.s, JAW.y))); parent.push(boneIndex('J_head')); continue; }
    if (name === 'J_eye_L' || name === 'J_eye_R') {
      const side = name === 'J_eye_L' ? 1 : -1;
      world.push(v(eyeCentre(side)));
      parent.push(boneIndex('J_head'));
      continue;
    }
    if (name === 'J_spine') { world.push(v(at(SPINE_D1.s, dorsalY(SPINE_D1.s) - 0.004))); parent.push(boneIndex('J_head')); continue; }
    if (name === 'J_flap') { world.push(v(at(FLAP.hinge.s, FLAP.hinge.y))); parent.push(boneIndex('J_sp1')); continue; }
    if (name === 'J_pec_L' || name === 'J_pec_R') {
      const f = name === 'J_pec_L' ? pl : pr;
      world.push(v(f.ctr)); parent.push(boneIndex('J_head'));
      continue;
    }
    if (name === 'J_pec_L2' || name === 'J_pec_R2') {
      const f = name === 'J_pec_L2' ? pl : pr;
      const c = v(f.ctr).addScaledVector(f.rest, PEC.len * 0.45 * TL);
      world.push(c); parent.push(boneIndex(name === 'J_pec_L2' ? 'J_pec_L' : 'J_pec_R'));
      continue;
    }
    if (name === 'J_cau_U' || name === 'J_cau_L') { world.push(v(at(CAUDAL.s, 0))); parent.push(boneIndex('J_tail')); continue; }
    const dor = name.startsWith('J_dor');
    const k = Number(name.slice(-1));
    const f = dor ? DORSAL : ANAL;
    const a = k / (FIN_BONES - 1);
    const b = finBase(f, dor, a);
    world.push(v(at(b.s, b.y)));
    parent.push(chainFor(b.s));
    (dor ? dorsalAxes : analAxes).push(finTangent(f, dor, a));
  }
  const inverses = world.map((p) => new Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  rig = { parent, world, inverses, dorsalAxes, analAxes, pecBase: [pl.base, pr.base], pecRest: [pl.rest, pr.rest] };
  return rig;
}

/** centre of an eyeball (TL units, model frame): sunk into the socket so that a cap of it shows */
export function eyeCentre(side: 1 | -1): P3 {
  return at(EYE.s, EYE.y, side * (halfWidthAt(EYE.s, EYE.y) - EYE.sink));
}
/** the eye's resting line of sight: out to the side, a little forward and up */
export function eyeAxis(side: 1 | -1): Vector3 {
  return new Vector3(side, 0.08, 0.22).normalize();
}

/** Up to three chain bones and weights for a point at s: rigid at each segment's middle, blended across a joint. */
export function chainWeights(s: number): W {
  const n = SPINE_S.length;
  if (s <= SPINE_S[0]) return [[boneIndex('J_head'), 1]];
  if (s >= SPINE_S[n - 1]) return [[boneIndex('J_tail'), 1]];
  let j = n - 2;
  for (let i = 0; i < n - 1; i++) if (s < SPINE_S[i + 1]) { j = i; break; }
  const s0 = SPINE_S[j], s1 = SPINE_S[j + 1];
  const t = Math.min(1, Math.max(0, (s - s0) / (s1 - s0)));
  // the deep trunk is stiff: blends only near the joints
  const wPrev = j > 0 ? 0.5 * (1 - smooth(0, 0.35, t)) : 0;
  const wNext = 0.5 * smooth(0.65, 1, t);
  const out: W = [[boneIndex(SPINE[j][0] as BoneName), 1 - wPrev - wNext]];
  if (wPrev > 1e-4) out.push([boneIndex(SPINE[j - 1][0] as BoneName), wPrev]);
  if (wNext > 1e-4) out.push([boneIndex(SPINE[j + 1][0] as BoneName), wNext]);
  return out;
}

/** the skin's weights at (s, y): the body chain, the lower lip on the jaw, the flap's point on its own bone */
function skinWeights(s: number, y: number): W {
  let w = chainWeights(s);
  // the lower lip and chin below the gape ride on the jaw (fading out behind the mouth's corner)
  const jaw = (1 - smooth(GAPE.s - 0.004, GAPE.s + 0.03, s)) * smooth(gapeY(s) + 0.0012, gapeY(s) - 0.0012, y);
  if (jaw > 1e-4) w = mix(w, [[boneIndex('J_jaw'), 1]], jaw);
  // the pelvic flap: the corner and the skin just around it swing on J_flap
  const fl = smooth(-0.24, -0.3, y) * (1 - smooth(0.03, 0.07, Math.abs(s - FLAP.s)));
  if (fl > 1e-4) w = mix(w, [[boneIndex('J_flap'), 1]], fl);
  return w;
}

function mix(a: W, b: W, t: number): W {
  const m = new Map<number, number>();
  for (const [i, x] of a) m.set(i, (m.get(i) ?? 0) + x * (1 - t));
  for (const [i, x] of b) m.set(i, (m.get(i) ?? 0) + x * t);
  return [...m.entries()];
}

// ------------------------------------------------------------------ builder

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  idx: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  a3: number[] = [];
  part: number[] = [];
  thin: number[] = [];
  uv: number[] = [];
  constructor(readonly kind: 'skin' | 'fin' | 'eye') {}
  get count(): number { return this.pos.length / 3; }

  vertex(p: P3, weights: W, n: P3, extra: { a3?: P3; part?: number; thin?: number; uv?: [number, number] } = {}): number {
    this.pos.push(p[0] * TL, p[1] * TL, p[2] * TL);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.nrm.push(n[0] / l, n[1] / l, n[2] / l);
    const w = [...weights].filter(([, x]) => x > 1e-5).sort((x, y) => y[1] - x[1]).slice(0, 4);
    const sum = w.reduce((acc, [, x]) => acc + x, 0) || 1;
    for (let k = 0; k < 4; k++) { this.si.push(w[k] ? w[k][0] : 0); this.sw.push(w[k] ? w[k][1] / sum : 0); }
    const a = extra.a3 ?? [0, 0, 0];
    this.a3.push(a[0], a[1], a[2]);
    this.part.push(extra.part ?? 0);
    this.thin.push(extra.thin ?? 0);
    // the skin's own coordinates: s, and a height measured along the surface (the side-view height on the flanks)
    const uv = extra.uv ?? [S_PIVOT - p[2], p[1]];
    this.uv.push(uv[0], uv[1]);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }

  /** a triangle wound so that its normal points along `want` */
  faced(a: number, b: number, c: number, want: P3): void {
    const p = (i: number) => [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
    const A = p(a), B = p(b), C = p(c);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) this.tri(a, b, c);
    else this.tri(a, c, b);
  }

  geometry(radius = 0.75): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    if (this.kind === 'fin') g.setAttribute('aFin', new Float32BufferAttribute(this.a3, 3));
    else if (this.kind === 'eye') g.setAttribute('aEye', new Float32BufferAttribute(this.a3, 3));
    else {
      g.setAttribute('aPart', new Float32BufferAttribute(this.part, 1));
      g.setAttribute('aThin', new Float32BufferAttribute(this.thin, 1));
      g.setAttribute('aSkin', new Float32BufferAttribute(this.uv, 2));
    }
    g.setIndex(this.count > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1));
    // the skinned fish moves its parts a little: a sphere around the whole fish from its pivot
    g.boundingSphere = new Sphere(new Vector3(0, 0, 0), TL * radius);
    return g;
  }
}

/** merge builders of one kind into one */
function merged(kind: 'skin' | 'fin', bs: Builder[]): Builder {
  const out = new Builder(kind);
  for (const b of bs) {
    const base = out.count;
    out.pos.push(...b.pos); out.nrm.push(...b.nrm); out.si.push(...b.si); out.sw.push(...b.sw);
    out.a3.push(...b.a3); out.part.push(...b.part); out.thin.push(...b.thin); out.uv.push(...b.uv);
    for (const i of b.idx) out.idx.push(i + base);
  }
  return out;
}

// ------------------------------------------------------------------ skin

function skinPoint(s: number, phi: number): P3 {
  const [x, y] = sectionPoint(s, phi);
  return at(s, y, x);
}
function skinNormal(s: number, phi: number): P3 {
  const e = 1e-4;
  const a = skinPoint(s, phi - e), b = skinPoint(s, phi + e);
  const c = skinPoint(Math.max(0, s - e), phi), d = skinPoint(s + e, phi);
  const dp = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ds = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
  const n: P3 = [dp[1] * ds[2] - dp[2] * ds[1], dp[2] * ds[0] - dp[0] * ds[2], dp[0] * ds[1] - dp[1] * ds[0]];
  const l = Math.hypot(n[0], n[1], n[2]);
  if (l < 1e-12) return [Math.sign(Math.sin(phi)) || 1, 0, 0];
  return [n[0] / l, n[1] / l, n[2] / l];
}
/**
 * The skin's height coordinate around a ring: the dorsal edge's height less the distance along the skin from it, so
 * that on the flat flanks it is the height itself and the pattern does not smear over the back and the belly.
 */
function skinArc(s: number, nAround: number): number[] {
  const sub = 8, n = nAround * sub;
  const out: number[] = new Array(nAround).fill(0);
  const top = dorsalY(s);
  for (const side of [1, -1]) {
    let acc = 0, prev = skinPoint(s, 0);
    for (let k = 1; k <= n / 2; k++) {
      const phi = side * (k / n) * Math.PI * 2;
      const p = skinPoint(s, phi);
      acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
      if (k % sub === 0) {
        const j = side === 1 ? k / sub : (nAround - k / sub) % nAround;
        out[j] = top - acc;
      }
    }
  }
  out[0] = top;
  return out;
}

/** how much light gets through the body here: the tissue's thickness against a few millimetres of soft flesh */
const thinAt = (s: number, y: number): number => Math.exp(-(2 * halfWidthAt(s, y)) / 0.028);

/** rings along the body: dense on the snout, around the eye and spine, at the flap and the peduncle */
function ringStations(lod: Lod): number[] {
  const spans: [number, number, number][] = lod === 0
    ? [[0, 0.04, 9], [0.04, 0.31, 32], [0.31, 0.5, 22], [0.5, S_CAUDAL_BASE, 24]]
    : lod === 1 ? [[0, 0.05, 3], [0.05, 0.31, 9], [0.31, 0.5, 7], [0.5, S_CAUDAL_BASE, 8]] : [[0, 0.1, 2], [0.1, 0.4, 4], [0.4, S_CAUDAL_BASE, 6]];
  const out: number[] = [];
  for (const [a, b, n] of spans) for (let i = 0; i < n; i++) {
    const u = i / n;
    out.push(a + (b - a) * u);
  }
  out.push(S_CAUDAL_BASE);
  return out;
}

/**
 * The skin loft between two stations (inclusive), with the snout's cap when it starts at 0 and the caudal base's cap
 * when it reaches it. `nAround` points per ring, phi spaced evenly (the cosine spacing in height gathers rings of
 * vertices along the knife edges of the back and the belly).
 */
function buildLoft(b: Builder, stations: number[], nAround: number, capFront: boolean, capBack: boolean): void {
  const rings: number[][] = [];
  for (const s of stations) {
    const ring: number[] = [];
    const arc = skinArc(s, nAround);
    for (let j = 0; j < nAround; j++) {
      const phi = (j / nAround) * Math.PI * 2;
      const p = skinPoint(s, phi);
      ring.push(b.vertex(p, skinWeights(s, p[1]), skinNormal(s, phi), { part: 0, thin: thinAt(s, p[1]), uv: [s, arc[j]] }));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1];
    for (let j = 0; j < nAround; j++) {
      const j1 = (j + 1) % nAround;
      b.tri(r0[j], r0[j1], r1[j]);
      b.tri(r0[j1], r1[j1], r1[j]);
    }
  }
  if (capFront) {
    const s0 = stations[0];
    const c = b.vertex(at(s0 - 0.005, gapeY(0)), mix(chainWeights(0), [[boneIndex('J_jaw'), 1]], 0.5), [0, 0, 1], { part: 0 });
    const r = rings[0];
    for (let j = 0; j < nAround; j++) b.faced(c, r[j], r[(j + 1) % nAround], [0, 0, 1]);
  }
  if (capBack) {
    const s1 = stations[stations.length - 1];
    const c = b.vertex(at(s1 + 0.006, 0), chainWeights(s1), [0, 0, -1], { part: 0 });
    const r = rings[rings.length - 1];
    for (let j = 0; j < nAround; j++) b.faced(c, r[(j + 1) % nAround], r[j], [0, 0, -1]);
  }
}

/** Tiny white skin filaments scattered over the flanks (dermal cirri), as little cones standing off the skin. */
function buildCirri(b: Builder, sMin: number, sMax: number, count: number, seed: number): void {
  let h = seed >>> 0;
  const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; h ^= h >>> 12; return (h >>> 0) / 4294967296; };
  let made = 0, tries = 0;
  while (made < count && tries++ < count * 20) {
    const s = lerp(sMin, sMax, rnd());
    const phi = lerp(0.35, Math.PI - 0.35, rnd()) * (rnd() < 0.5 ? 1 : -1);
    const p = skinPoint(s, phi);
    // not on the eye, the lips or the gill slit
    if (Math.hypot(s - 0.215, p[1] - 0.072) < 0.07 || s < 0.05) continue;
    const n = skinNormal(s, phi);
    const len = 0.007 + 0.011 * rnd(), r = 0.0011 + 0.0007 * rnd();
    // a tangent frame on the skin: along the body and up it
    const tz: P3 = [0, 0, 1];
    const u: P3 = [n[1] * tz[2] - n[2] * tz[1], n[2] * tz[0] - n[0] * tz[2], n[0] * tz[1] - n[1] * tz[0]];
    const ul = Math.hypot(...u) || 1;
    u[0] /= ul; u[1] /= ul; u[2] /= ul;
    const v: P3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const w = skinWeights(s, p[1]);
    const base: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const q: P3 = [p[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r - n[0] * 0.0006, p[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r - n[1] * 0.0006, p[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r - n[2] * 0.0006];
      base.push(b.vertex(q, w, [n[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * 0.8, n[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * 0.8, n[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * 0.8], { part: 5, thin: 1 }));
    }
    // leaning back with the flow over the skin, a little crooked
    const lean = 0.5 + 0.4 * rnd();
    const tip: P3 = [p[0] + n[0] * len, p[1] + n[1] * len + (rnd() - 0.5) * len * 0.4, p[2] + n[2] * len - lean * len];
    const t = b.vertex(tip, w, n, { part: 5, thin: 1 });
    for (let k = 0; k < 3; k++) b.faced(base[k], base[(k + 1) % 3], t, [n[0], n[1], n[2]]);
    made++;
  }
}

// ------------------------------------------------------------------ eyes

/** An eyeball: a sphere drawn out to `thMax` from its axis (the rest stays hidden inside the head when it turns). */
function buildEye(b: Builder, side: 1 | -1, nTh: number, nPsi: number, thMax: number, asPart = -1): void {
  const c = eyeCentre(side);
  const ax = eyeAxis(side);
  const u = new Vector3(0, 1, 0).cross(ax).normalize();
  const v = ax.clone().cross(u).normalize();
  const r = EYE.r;
  const bone: W = [[boneIndex(side === 1 ? 'J_eye_L' : 'J_eye_R'), 1]];
  const rows: number[][] = [];
  const tip = (() => {
    const p: P3 = [c[0] + ax.x * r, c[1] + ax.y * r, c[2] + ax.z * r];
    return asPart >= 0 ? b.vertex(p, bone, [ax.x, ax.y, ax.z], { part: asPart }) : b.vertex(p, bone, [ax.x, ax.y, ax.z], { a3: [0, 0, side] });
  })();
  for (let i = 1; i <= nTh; i++) {
    const th = (i / nTh) * thMax;
    const row: number[] = [];
    for (let j = 0; j < nPsi; j++) {
      const psi = (j / nPsi) * Math.PI * 2;
      const d = ax.clone().multiplyScalar(Math.cos(th)).addScaledVector(u, Math.sin(th) * Math.cos(psi)).addScaledVector(v, Math.sin(th) * Math.sin(psi));
      const p: P3 = [c[0] + d.x * r, c[1] + d.y * r, c[2] + d.z * r];
      row.push(asPart >= 0 ? b.vertex(p, bone, [d.x, d.y, d.z], { part: asPart }) : b.vertex(p, bone, [d.x, d.y, d.z], { a3: [th / thMax, psi, side] }));
    }
    rows.push(row);
  }
  const out: P3 = [ax.x, ax.y, ax.z];
  for (let j = 0; j < nPsi; j++) b.faced(tip, rows[0][j], rows[0][(j + 1) % nPsi], out);
  for (let i = 0; i < rows.length - 1; i++) {
    const r0 = rows[i], r1 = rows[i + 1];
    for (let j = 0; j < nPsi; j++) {
      const j1 = (j + 1) % nPsi;
      const pm = b.pos.slice(r0[j] * 3, r0[j] * 3 + 3);
      const want: P3 = [pm[0] / TL - c[0], pm[1] / TL - c[1], pm[2] / TL - c[2]];
      b.faced(r0[j], r1[j], r0[j1], want);
      b.faced(r0[j1], r1[j], r1[j1], want);
    }
  }
}

/**
 * The skin over the eyeball's edge: a fleshy ring round the eye, from the opening (where it lies just over the ball)
 * out to the cheek, standing a little proud between. It sits on the head and does not turn with the eye, so the ball
 * moves under it as in the photographs. Vertices carry part 8 and, in aThin, how near the opening they are (1 at its
 * margin): the margin is thin, darker and lets light through.
 */
function buildEyeLid(b: Builder, side: 1 | -1, nR: number, nPsi: number): void {
  const c = eyeCentre(side);
  const ax = eyeAxis(side);
  const u = new Vector3(0, 1, 0).cross(ax).normalize();
  const v = ax.clone().cross(u).normalize();
  const R = EYE.r, r0 = EYE.aperture, r1 = EYE.lidOut;
  const hIn = Math.sqrt(R * R - r0 * r0) + 0.0012;
  const grid: P3[][] = [];
  for (let j = 0; j < nPsi; j++) {
    const psi = (j / nPsi) * Math.PI * 2;
    const dir = u.clone().multiplyScalar(Math.cos(psi)).addScaledVector(v, Math.sin(psi));
    const row: P3[] = [];
    for (let k = 0; k <= nR; k++) {
      const t = k / nR;
      // a little narrower in front and behind than above and below: the opening is a slightly upright oval
      const r = r0 * (1 + 0.06 * Math.sin(psi) * Math.sin(psi)) + (r1 - r0) * t;
      const px = c[0] + dir.x * r, py = c[1] + dir.y * r, pz = c[2] + dir.z * r;
      // where the cheek's skin lies along the eye's axis from here
      let hS = EYE.sink;
      for (let it = 0; it < 3; it++) {
        const qx = px + ax.x * hS, qy = py + ax.y * hS, qz = pz + ax.z * hS;
        const sk = side * halfWidthAt(S_PIVOT - qz, qy);
        hS += (sk - qx) / ax.x;
      }
      const e = smooth(0, 1, t);
      const h = hIn * (1 - e) + (hS - 0.0006) * e + 0.0038 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 1.3);
      row.push([px + ax.x * h, py + ax.y * h, pz + ax.z * h]);
    }
    grid.push(row);
  }
  const ids: number[][] = [];
  for (let j = 0; j < nPsi; j++) {
    const row: number[] = [];
    for (let k = 0; k <= nR; k++) {
      const p = grid[j][k];
      const a = grid[(j + 1) % nPsi][k], bq = grid[(j + nPsi - 1) % nPsi][k];
      const o = grid[j][Math.min(nR, k + 1)], i = grid[j][Math.max(0, k - 1)];
      const dpsi = [a[0] - bq[0], a[1] - bq[1], a[2] - bq[2]], dr = [o[0] - i[0], o[1] - i[1], o[2] - i[2]];
      let n: P3 = [dr[1] * dpsi[2] - dr[2] * dpsi[1], dr[2] * dpsi[0] - dr[0] * dpsi[2], dr[0] * dpsi[1] - dr[1] * dpsi[0]];
      if (n[0] * ax.x + n[1] * ax.y + n[2] * ax.z < 0) n = [-n[0], -n[1], -n[2]];
      const t = k / nR;
      row.push(b.vertex(p, chainWeights(EYE.s), n, { part: 8, thin: 1 - t }));
    }
    ids.push(row);
  }
  const out: P3 = [ax.x, ax.y, ax.z];
  for (let j = 0; j < nPsi; j++) {
    const r0i = ids[j], r1i = ids[(j + 1) % nPsi];
    for (let k = 0; k < nR; k++) {
      b.faced(r0i[k], r0i[k + 1], r1i[k], out);
      b.faced(r0i[k + 1], r1i[k + 1], r1i[k], out);
    }
  }
}

// ------------------------------------------------------------------ the first dorsal spine

/** centreline of the spine at u (0 base .. 1 tip), TL units in the model frame, and its forward-up direction */
function spineLine(u: number): { p: P3; t: Vector3; back: Vector3 } {
  const n = 24;
  let y = 0, z = 0;
  const steps = Math.round(u * n);
  const base = at(SPINE_D1.s, dorsalY(SPINE_D1.s) - 0.004);
  let a = SPINE_D1.lean;
  for (let k = 0; k < steps; k++) {
    const uu = (k + 0.5) / n;
    a = SPINE_D1.lean + SPINE_D1.curl * uu * uu;
    y += Math.cos(a) * SPINE_D1.len / n;
    z -= Math.sin(a) * SPINE_D1.len / n;
  }
  const rem = u * n - steps;
  if (rem > 0) { y += Math.cos(a) * SPINE_D1.len / n * rem; z -= Math.sin(a) * SPINE_D1.len / n * rem; }
  const aa = SPINE_D1.lean + SPINE_D1.curl * u * u;
  const t = new Vector3(0, Math.cos(aa), -Math.sin(aa));
  const back = new Vector3(0, -Math.sin(aa), -Math.cos(aa));
  return { p: [base[0], base[1] + y, base[2] + z], t, back };
}

function buildSpine(b: Builder, nU: number, nAround: number, barbs: boolean): void {
  const bone: W = [[boneIndex('J_spine'), 1]];
  const rings: number[][] = [];
  for (let i = 0; i <= nU; i++) {
    const u = i / nU;
    const { p, back } = spineLine(u * 0.985);
    // laterally compressed, deep fore-and-aft at the base, the rear edge a blade
    const dep = SPINE_D1.depth * Math.pow(1 - u, 0.75) + 0.0025, wid = SPINE_D1.width * Math.pow(1 - u, 0.9) + 0.0016;
    const ring: number[] = [];
    for (let j = 0; j < nAround; j++) {
      const w = (j / nAround) * Math.PI * 2;
      // fore-aft along `back`, side to side along x; the rear (cos w < 0 … toward the tail) narrows to an edge
      const cb = Math.cos(w), sb = Math.sin(w);
      const k = cb > 0 ? 0.62 : 0.38;
      const q: P3 = [p[0] + sb * wid / 2 * (cb > 0 ? Math.pow(1 - cb, 0.35) : 1), p[1] + back.y * cb * dep * k, p[2] + back.z * cb * dep * k];
      const n: P3 = [sb / wid, back.y * cb / dep, back.z * cb / dep];
      ring.push(b.vertex(q, bone, n, { part: 4, thin: 0.3 }));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < nAround; j++) {
      const j1 = (j + 1) % nAround;
      const ctr = spineLine((i + 0.5) / nU).p;
      const pm = b.pos.slice(rings[i][j] * 3, rings[i][j] * 3 + 3);
      const want: P3 = [pm[0] / TL - ctr[0], pm[1] / TL - ctr[1], pm[2] / TL - ctr[2]];
      b.faced(rings[i][j], rings[i + 1][j], rings[i][j1], want);
      b.faced(rings[i][j1], rings[i + 1][j], rings[i + 1][j1], want);
    }
  }
  const top = spineLine(1);
  const tip = b.vertex(top.p, bone, [top.t.x, top.t.y, top.t.z], { part: 4 });
  const last = rings[rings.length - 1];
  for (let j = 0; j < nAround; j++) b.faced(last[j], last[(j + 1) % nAround], tip, [top.t.x, top.t.y, top.t.z]);
  if (!barbs) return;
  // two rows of small downturned barbs on the rear edge (and smaller ones up the front near the tip)
  for (let k = 0; k < SPINE_D1.barbs; k++) {
    const u = 0.28 + (0.62 * k) / (SPINE_D1.barbs - 1);
    const { p, t, back } = spineLine(u);
    const dep = SPINE_D1.depth * Math.pow(1 - u, 0.75) + 0.0025, wid = SPINE_D1.width * Math.pow(1 - u, 0.9) + 0.0016;
    const len = 0.009 * (1 - 0.45 * u);
    for (const side of [1, -1]) {
      const root: P3 = [p[0] + side * wid * 0.22, p[1] + back.y * dep * 0.36, p[2] + back.z * dep * 0.36];
      const tipP: P3 = [root[0] + side * len * 0.25, root[1] + (back.y * 0.55 - t.y * 0.75) * len, root[2] + (back.z * 0.55 - t.z * 0.75) * len];
      const up: P3 = [root[0], root[1] + t.y * len * 0.5, root[2] + t.z * len * 0.5];
      const side2: P3 = [root[0] - side * wid * 0.25, root[1], root[2]];
      const out: P3 = [side * 0.6, back.y, back.z];
      const a = b.vertex(root, bone, out, { part: 4 }), c = b.vertex(up, bone, out, { part: 4 }), d = b.vertex(tipP, bone, out, { part: 4 }), e = b.vertex(side2, bone, out, { part: 4 });
      b.faced(a, c, d, [side, 0, 0]);
      b.faced(e, c, d, [back.x, back.y, back.z]);
      b.faced(a, e, d, [-t.x, -t.y, -t.z]);
    }
  }
  for (let k = 0; k < 4; k++) {
    const u = 0.55 + 0.1 * k;
    const { p, t, back } = spineLine(u);
    const dep = SPINE_D1.depth * Math.pow(1 - u, 0.75) + 0.0025;
    const len = 0.004;
    const root: P3 = [p[0], p[1] - back.y * dep * 0.6, p[2] - back.z * dep * 0.6];
    const tipP: P3 = [root[0], root[1] - back.y * len - t.y * len * 0.6, root[2] - back.z * len - t.z * len * 0.6];
    for (const side of [1, -1]) {
      const sideP: P3 = [root[0] + side * 0.002, root[1] + t.y * len, root[2] + t.z * len];
      const a = b.vertex(root, bone, [side, 0, 0], { part: 4 }), c = b.vertex(sideP, bone, [side, 0, 0], { part: 4 }), d = b.vertex(tipP, bone, [side, 0, 0], { part: 4 });
      b.faced(a, c, d, [side, 0, 0]);
    }
  }
}

/** the dark membrane behind the spine's lower part, down to the back; folds with it */
function buildSpineMembrane(b: Builder, nU: number): void {
  const sBack0 = SPINE_D1.s + 0.012, sBack1 = SPINE_D1.s + 0.07;
  const front: number[][] = [];
  for (const side of [1, -1]) {
    const row: number[] = [];
    for (let i = 0; i <= nU; i++) {
      const u = i / nU;
      // upper edge: the spine's rear edge from its base to about 40 % up; lower edge: the back behind it
      const sp = spineLine(u * 0.42);
      const dep = SPINE_D1.depth * Math.pow(1 - u * 0.42, 0.75) + 0.0025;
      const top: P3 = [side * 0.0004, sp.p[1] + sp.back.y * dep * 0.35, sp.p[2] + sp.back.z * dep * 0.35];
      const sb = lerp(sBack0, sBack1, u);
      const bot: P3 = [side * 0.0004, dorsalY(sb) - 0.002, zOf(sb)];
      const wTop: W = [[boneIndex('J_spine'), 1]];
      const wBot = chainWeights(sb);
      for (let k = 0; k <= 2; k++) {
        const t = k / 2;
        const p: P3 = [top[0], lerp(bot[1], top[1], t), lerp(bot[2], top[2], t)];
        row.push(b.vertex(p, mix(wBot, wTop, smooth(0, 1, t)), [side, 0, 0], { part: 6, thin: 1 }));
      }
    }
    front.push(row);
  }
  for (let si = 0; si < 2; si++) {
    const side = si === 0 ? 1 : -1, row = front[si];
    for (let i = 0; i < nU; i++) for (let k = 0; k < 2; k++) {
      const a = row[i * 3 + k], c = row[i * 3 + k + 1], d = row[(i + 1) * 3 + k], e = row[(i + 1) * 3 + k + 1];
      b.faced(a, c, d, [side, 0, 0]);
      b.faced(c, e, d, [side, 0, 0]);
    }
  }
}

// ------------------------------------------------------------------ fins

/** A membrane grid (na × nt) at ray resolution: `pt(a, t)` places it, `weights(a, t)` skins it. */
function membrane(b: Builder, na: number, nt: number, id: number, pt: (a: number, t: number) => P3, normal: (a: number, t: number) => P3, weights: (a: number, t: number) => W): void {
  const grid: number[] = [];
  for (let i = 0; i <= na; i++) for (let k = 0; k <= nt; k++) {
    const a = i / na, t = k / nt;
    grid.push(b.vertex(pt(a, t), weights(a, t), normal(a, t), { a3: [a, t, id] }));
  }
  for (let i = 0; i < na; i++) for (let k = 0; k < nt; k++) {
    const p = i * (nt + 1) + k, q = (i + 1) * (nt + 1) + k;
    b.tri(grid[p], grid[q], grid[p + 1]);
    b.tri(grid[p + 1], grid[q], grid[q + 1]);
  }
}

function softFin(b: Builder, f: typeof DORSAL | typeof ANAL, dorsal: boolean, na: number, nt: number): void {
  const pre = dorsal ? 'J_dor' : 'J_ana';
  membrane(b, na, nt, dorsal ? 1 : 2,
    (a, t) => {
      const base = finBase(f, dorsal, a);
      const rake = along(f.rake, a), len = along(f.len, a);
      // the front of the fin is rounded off: the first rays rise from short to full
      const lr = len * (0.55 + 0.45 * smooth(0, 0.12, a));
      const dy = (dorsal ? 1 : -1) * Math.cos(rake), dz = -Math.sin(rake);
      // the free edge droops a little between the rays' tips
      return at(base.s - dz * lr * t, base.y + dy * lr * t);
    },
    () => [1, 0, 0],
    (a, t) => {
      const base = finBase(f, dorsal, a);
      if (t === 0) return chainWeights(base.s);
      const x = a * (FIN_BONES - 1), i = Math.min(FIN_BONES - 2, Math.floor(x)), u = x - i;
      const fin: W = [[boneIndex(`${pre}${i}` as BoneName), 1 - u], [boneIndex(`${pre}${i + 1}` as BoneName), u]];
      return mix(chainWeights(base.s), fin, smooth(0, 0.3, t));
    });
}

function caudalFin(b: Builder, na: number, nt: number): void {
  const mid = (CAUDAL.closed + CAUDAL.open) / 2;
  membrane(b, na, nt, 0,
    (a, t) => {
      const f = 1 - 2 * a;
      const beta = f * mid;
      const L = CAUDAL.len * (1 - 0.12 * f * f);
      const y0 = f * CAUDAL.halfBase;
      return at(CAUDAL.s + Math.cos(beta) * L * t, y0 + Math.sin(beta) * L * t);
    },
    () => [1, 0, 0],
    (a, t) => {
      const f = 1 - 2 * a;
      const tail: W = [[boneIndex('J_tail'), 1]];
      if (t === 0) return tail;
      const spread: W = [[boneIndex(f >= 0 ? 'J_cau_U' : 'J_cau_L'), 1]];
      return mix(tail, spread, Math.abs(f) * smooth(0, 0.15, t));
    });
}

function pectoralFin(b: Builder, side: 1 | -1, na: number, nt: number): void {
  const fr = pecFrame(side);
  const b1 = boneIndex(side === 1 ? 'J_pec_L' : 'J_pec_R'), b2 = boneIndex(side === 1 ? 'J_pec_L2' : 'J_pec_R2');
  // rays fan in the plane of the base line and the resting direction, the upper ones longest
  const up = new Vector3(-fr.base.x, -fr.base.y, -fr.base.z);
  membrane(b, na, nt, 3,
    (a, t) => {
      const root: P3 = [lerp(fr.top[0], fr.bot[0], a), lerp(fr.top[1], fr.bot[1], a), lerp(fr.top[2], fr.bot[2], a)];
      const zeta = lerp(0.42, -0.62, a);
      const d = fr.rest.clone().multiplyScalar(Math.cos(zeta)).addScaledVector(up, Math.sin(zeta)).normalize();
      const L = PEC.len * (1 - 0.55 * Math.pow(a - 0.25, 2)) * (0.8 + 0.2 * smooth(0, 0.15, a));
      return [root[0] + d.x * L * t, root[1] + d.y * L * t, root[2] + d.z * L * t];
    },
    () => {
      const n = fr.rest.clone().cross(up).normalize();
      return [n.x, n.y, n.z];
    },
    (_a, t) => {
      if (t === 0) return chainWeights(PEC.s);
      return [[b1, 1 - smooth(0.3, 0.7, t)], [b2, smooth(0.3, 0.7, t)]];
    });
}

/** the far tier's caudal fin: a thin opaque fan folded into the body mesh */
function tailSliver(b: Builder): void {
  const mid = (CAUDAL.closed + CAUDAL.open) / 2;
  const n = 5;
  for (const side of [1, -1]) {
    const row: number[] = [];
    const base = b.vertex(at(CAUDAL.s - 0.004, 0, side * 0.002), [[boneIndex('J_tail'), 1]], [side, 0, 0], { part: 2 });
    for (let i = 0; i <= n; i++) {
      const f = 1 - (2 * i) / n;
      const beta = f * mid, L = CAUDAL.len * (1 - 0.12 * f * f) * 0.94;
      const p = at(CAUDAL.s + Math.cos(beta) * L, f * CAUDAL.halfBase + Math.sin(beta) * L, side * 0.002);
      row.push(b.vertex(p, mix([[boneIndex('J_tail'), 1]], [[boneIndex(f >= 0 ? 'J_cau_U' : 'J_cau_L'), 1]], Math.abs(f)), [side, 0, 0], { part: 2, a3: [i / n, 1, 0] }));
    }
    for (let i = 0; i < n; i++) b.faced(base, row[i], row[i + 1], [side, 0, 0]);
  }
}

// ------------------------------------------------------------------ tiers

export type AmimehagiGeometry = Partial<Record<PartName, BufferGeometry>>;
const cache = new Map<Lod, AmimehagiGeometry>();

/** The geometry of a tier: LOD0 one mesh per named part; LOD1 Body + Fins; LOD2 Body. */
export function amimehagiGeometry(lod: Lod): AmimehagiGeometry {
  const hit = cache.get(lod);
  if (hit) return hit;
  const out: AmimehagiGeometry = {};
  const st = ringStations(lod);
  if (lod === 0) {
    const iHead = st.findIndex((s) => s >= S_HEAD - 1e-6);
    const head = new Builder('skin'), body = new Builder('skin');
    buildLoft(head, st.slice(0, iHead + 1), 64, true, false);
    buildEyeLid(head, 1, 6, 40);
    buildEyeLid(head, -1, 6, 40);
    buildCirri(head, 0.06, S_HEAD - 0.01, 22, 0x5a17);
    buildLoft(body, st.slice(iHead), 64, false, true);
    buildCirri(body, S_HEAD + 0.01, 0.74, 54, 0x91c3);
    out.Head = head.geometry();
    out.Body = body.geometry();
    for (const side of [1, -1] as const) {
      const e = new Builder('eye');
      buildEye(e, side, 18, 36, 1.2);
      out[side === 1 ? 'Eye_L' : 'Eye_R'] = e.geometry();
    }
    const sp = new Builder('skin');
    buildSpine(sp, 14, 12, true);
    buildSpineMembrane(sp, 6);
    out.DorsalSpine = sp.geometry();
    const df = new Builder('fin'), af = new Builder('fin'), cf = new Builder('fin');
    softFin(df, DORSAL, true, DORSAL.rays * 2, 6);
    softFin(af, ANAL, false, ANAL.rays * 2, 6);
    caudalFin(cf, (CAUDAL.rays - 1) * 2, 8);
    out.DorsalFin = df.geometry();
    out.AnalFin = af.geometry();
    out.CaudalFin = cf.geometry(1.1);
    for (const side of [1, -1] as const) {
      const pf = new Builder('fin');
      pectoralFin(pf, side, (PEC.rays - 1) * 2, 6);
      out[side === 1 ? 'PectoralFin_L' : 'PectoralFin_R'] = pf.geometry();
    }
  } else if (lod === 1) {
    const body = new Builder('skin');
    buildLoft(body, st, 24, true, true);
    buildEye(body, 1, 3, 10, 0.95, 7);
    buildEye(body, -1, 3, 10, 0.95, 7);
    buildEyeLid(body, 1, 2, 14);
    buildEyeLid(body, -1, 2, 14);
    buildSpine(body, 4, 5, false);
    out.Body = body.geometry();
    const fins = [new Builder('fin'), new Builder('fin'), new Builder('fin'), new Builder('fin'), new Builder('fin')];
    softFin(fins[0], DORSAL, true, 13, 2);
    softFin(fins[1], ANAL, false, 12, 2);
    caudalFin(fins[2], 8, 3);
    pectoralFin(fins[3], 1, 4, 2);
    pectoralFin(fins[4], -1, 4, 2);
    out.Fins = merged('fin', fins).geometry(1.1);
  } else {
    const body = new Builder('skin');
    buildLoft(body, st, 10, true, true);
    tailSliver(body);
    out.Body = body.geometry(1.1);
  }
  cache.set(lod, out);
  return out;
}

export function triangleCount(lod: Lod): number {
  let n = 0;
  for (const g of Object.values(amimehagiGeometry(lod))) if (g) n += (g.index?.count ?? 0) / 3;
  return n;
}

/** total length from the pivot to the tail tip and to the snout (metres at the model size) */
export const REACH = { snout: S_PIVOT * TL, tail: (1 - S_PIVOT) * TL };
