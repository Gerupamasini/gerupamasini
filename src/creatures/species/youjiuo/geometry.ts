import { BufferGeometry, Float32BufferAttribute, Matrix4, Uint16BufferAttribute, Uint32BufferAttribute, Vector3 } from 'three';
import {
  ANAL, BONES, B_DORSAL, B_EYE_L, B_EYE_R, B_HEAD, B_JAW, B_PEC_L, B_PEC_R, B_SNOUT, CAUDAL, CHAIN_BONES, DORSAL, DORSAL_BONES, EYE,
  JAW_PIVOT, MODEL_TL, NSEG, PEC, STATIONS, S_CAUDAL, S_HEAD, S_SNOUT, TAIL_PTS, TRUNK_PTS, bodyWeights, centreAt, depthAt, dorsalBoneS,
  ridgeness, ringAt, tailness, widthAt, zOf,
} from './anatomy';

/**
 * The ヨウジウオ's skinned geometry: three tiers built once and shared by every fish (each fish has its own skeleton).
 *
 *  LOD0  16.5k triangles: 32-sided loft, three rows to every bony ring with a groove at each ring joint (the armour's
 *        segmentation reads in the silhouette), the ridges of the heptagonal trunk and the quadrangular tail kept as
 *        edges, the orbit and the gill cover raised, the mouth at the snout tip; eyeballs; the dorsal fin with all 38
 *        rays, pectoral fans of 12 rays, the caudal fan, the tiny anal fin
 *  LOD1  2.7k triangles: 16-sided loft one row per ring (the rings are painted), small eyes, dorsal / pectoral / caudal
 *  LOD2  0.5k triangles: 8-sided loft with the caudal fan folded into the same mesh (one draw call, opaque)
 *
 * Body vertices carry aBody = (s, cos φ, sin φ) (φ round the section from the dorsal midline toward the left flank,
 * in eighths: 1 superior ridge, 2 lateral ridge, 3 inferior ridge, 4 ventral midline, 5–7 the right side's),
 * aPat = (ring coordinate, arc length round the section from the dorsal midline in TL, the same on both sides), aPart (0 skin, 1 eye, 2 mouth, 3 LOD2's painted
 * tail fan). Fin vertices carry aFin = (across the base 0..1, along the ray 0..1, fin id: 0 dorsal, 1 pectoral,
 * 2 caudal, 3 anal) and aRay (1 on a ray, 0 between rays).
 */

export type Lod = 0 | 1 | 2;
export interface YoujiuoGeometry { body: BufferGeometry; fins: BufferGeometry | null }

const TL = MODEL_TL;

// ------------------------------------------------------------------ rig

export interface RigRest {
  /** rest position of every bone (model space, metres) */
  pos: Vector3[];
  inverses: Matrix4[];
}

/** top of the section (TL, height above the axis) at s */
export function topAt(s: number): number {
  const top = (1 - tailness(s)) * TRUNK_PTS[0][1] + tailness(s) * TAIL_PTS[0][1];
  return centreAt(s) + 0.5 * depthAt(s) * (ridgeness(s) * top + (1 - ridgeness(s)));
}

let rig: RigRest | null = null;
export function rigRest(): RigRest {
  if (rig) return rig;
  const pos: Vector3[] = [];
  const at = (s: number, y = 0, x = 0) => new Vector3(x * TL, y * TL, zOf(s) * TL);
  for (const name of BONES) {
    const ci = CHAIN_BONES.indexOf(name);
    if (ci >= 0) { pos.push(at(STATIONS[ci])); continue; }
    switch (name) {
      case 'Head': pos.push(at(S_HEAD)); break;
      case 'Snout': pos.push(at(S_SNOUT, centreAt(S_SNOUT))); break;
      case 'Jaw': pos.push(at(JAW_PIVOT.s, JAW_PIVOT.y)); break;
      case 'Eye_L': case 'Eye_R': pos.push(at(EYE.s, EYE.y, (name === 'Eye_L' ? 1 : -1) * eyeCentreX())); break;
      case 'PectoralFin_L': case 'PectoralFin_R':
        pos.push(at(PEC.s, 0.5 * (PEC.y0 + PEC.y1), (name === 'PectoralFin_L' ? 1 : -1) * 0.5 * widthAt(PEC.s) * 0.92)); break;
      default: {
        const b = name === 'DorsalFin' ? 0 : Number(name.split('_')[1]);
        const s = dorsalBoneS(b);
        pos.push(at(s, topAt(s) - 0.0004));
      }
    }
  }
  rig = { pos, inverses: pos.map((p) => new Matrix4().makeTranslation(-p.x, -p.y, -p.z)) };
  return rig;
}

/** x of the eyeball's centre (TL): set so the dome stands out of the raised orbit by about a third of its radius */
export function eyeCentreX(): number {
  return 0.5 * widthAt(EYE.s) + ORBIT_BUMP - EYE.r * 0.66;
}
const ORBIT_BUMP = 0.0023;

// ------------------------------------------------------------------ builder

class Builder {
  pos: number[] = []; nrm: number[] = []; idx: number[] = [];
  si: number[] = []; sw: number[] = [];
  a3: number[] = []; a2: number[] = []; part: number[] = [];
  get count(): number { return this.pos.length / 3; }
  vertex(p: readonly [number, number, number], w: [number, number][], a3: readonly [number, number, number], a2: readonly [number, number], part: number): number {
    this.pos.push(p[0] * TL, p[1] * TL, p[2] * TL);
    this.nrm.push(0, 0, 0);
    const ws = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = ws.reduce((a, b) => a + b[1], 0) || 1;
    for (let i = 0; i < 4; i++) { this.si.push(ws[i]?.[0] ?? 0); this.sw.push(ws[i] ? ws[i][1] / sum : 0); }
    this.a3.push(a3[0], a3[1], a3[2]);
    this.a2.push(a2[0], a2[1]);
    this.part.push(part);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, a, c, d); }
  build(name3: string, name2: string | null, normals: 'compute' | 'given' = 'compute'): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    g.setAttribute(name3, new Float32BufferAttribute(this.a3, 3));
    if (name2) g.setAttribute(name2, new Float32BufferAttribute(this.a2, 2));
    g.setAttribute('aPart', new Float32BufferAttribute(this.part, 1));
    g.setIndex(this.count > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1));
    if (normals === 'compute') g.computeVertexNormals();
    return g;
  }
}

// ------------------------------------------------------------------ section

const SE_N = 2.4;
/** angle from the dorsal midline (toward +x) of each key point of the trunk polygon, for the head's rounded section */
const KEY_ANGLES = TRUNK_PTS.map(([x, y]) => Math.atan2(x, y));

/** the key points round the whole section (left side, then the right side back up), unit coordinates */
function keyPoints(s: number): [number, number][] {
  const t = tailness(s);
  const left = TRUNK_PTS.map((p, i) => [p[0] * (1 - t) + TAIL_PTS[i][0] * t, p[1] * (1 - t) + TAIL_PTS[i][1] * t] as [number, number]);
  return [...left, ...left.slice(1, 4).reverse().map(([x, y]) => [-x, y] as [number, number])];
}
function superellipse(theta: number): [number, number] {
  const sx = Math.sin(theta), cy = Math.cos(theta);
  const r = Math.pow(Math.pow(Math.abs(sx), SE_N) + Math.pow(Math.abs(cy), SE_N), -1 / SE_N);
  return [r * sx, r * cy];
}

/**
 * A point of the section at s, at position e round it (0..8 in edges, 0 = dorsal midline, increasing down the left
 * flank): unit coordinates (x toward the fish's left, y up). Ridged polygon on the body (plates a little convex
 * between the ridges, the ridges themselves slightly softened), a rounded superellipse on the head.
 */
export function sectionUnit(s: number, e: number): [number, number] {
  const kp = keyPoints(s);
  const ei = Math.floor(e) % 8, u = e - Math.floor(e);
  const a = kp[ei], b = kp[(ei + 1) % 8];
  let px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u;
  // the plate between two ridges bulges a little
  const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1;
  // outward normal of the edge (the polygon runs clockwise seen from the front: dorsal → left → ventral → right)
  const nx = ey / el, ny = -ex / el;
  // (flat to faintly convex: the photographs show crisp ridges with near-flat plates between)
  const bulge = 0.035 * Math.sin(Math.PI * u) * el;
  px += nx * bulge; py += ny * bulge;
  // the rounded head section at the matching angle
  const ka = (i: number) => (i <= 4 ? KEY_ANGLES[i] : 2 * Math.PI - KEY_ANGLES[8 - i]);
  const th = ka(ei) + (ka(ei + 1) - ka(ei)) * u;
  const [hx, hy] = superellipse(th);
  const r = ridgeness(s);
  // the body's ridges softened a little (~0.2), the head fully round
  const round = 1 - r * 0.86;
  return [px * (1 - round) + hx * round, py * (1 - round) + hy * round];
}

/** local swellings of the head: the raised orbit, the convex gill cover with its free edge (TL, added outward) */
function headSwell(s: number, y: number, ux: number): number {
  if (s > 0.13 || s < 0.04) return 0;
  const lat = Math.max(0, Math.abs(ux));
  const g = (d: number, w: number) => Math.exp(-(d * d) / (w * w));
  // the orbit: a ring of bone round the eye, highest at its rim
  const de = Math.hypot((s - EYE.s) * 1.0, y - EYE.y);
  const orbit = ORBIT_BUMP * (0.75 * g(de - EYE.r * 0.95, 0.0035) + 0.55 * g(de, 0.009)) * Math.pow(lat, 0.7);
  // the gill cover: convex, its free edge a low lip just before the occiput, the gill opening high at its back
  const op = 0.0011 * g(s - 0.1, 0.011) * g(y + 0.0015, 0.009) * lat;
  const lip = 0.00055 * g(s - 0.1125, 0.0016) * g(y + 0.001, 0.011) * lat;
  return orbit + op + lip;
}

/** a groove at each bony ring's joint (TL, inward) */
function ringGroove(s: number, depth: number): number {
  if (s < S_HEAD + 0.002 || s > S_CAUDAL) return 0;
  const r = ringAt(s);
  const d = Math.abs(r - Math.round(r));
  return depth * Math.exp(-(d * d) / (0.13 * 0.13));
}

// ------------------------------------------------------------------ body

interface TierSpec { around: number; headRows: number; perRing: number; groove: number; eyes: 0 | 1 | 2; fins: 0 | 1 | 2 }
const TIERS: Record<Lod, TierSpec> = {
  0: { around: 32, headRows: 46, perRing: 3, groove: 0.02, eyes: 2, fins: 2 },
  1: { around: 16, headRows: 14, perRing: 1, groove: 0, eyes: 1, fins: 1 },
  2: { around: 8, headRows: 5, perRing: 0.34, groove: 0, eyes: 0, fins: 0 },
};

function bodyRows(t: TierSpec): number[] {
  const rows: number[] = [];
  // the head: denser at the mouth, round the eye and at the gill cover's edge
  for (let i = 0; i < t.headRows; i++) {
    const u = i / t.headRows;
    // a little denser at the mouth and the orbit than along the snout's tube
    rows.push(S_HEAD * (u + 0.06 * Math.sin(2 * Math.PI * u) - 0.035 * Math.sin(4 * Math.PI * u)));
  }
  // rings: rows at each joint (the groove) and between
  const nRings = Math.round(ringAt(S_CAUDAL));
  const n = Math.max(1, Math.round(nRings * t.perRing));
  for (let i = 0; i <= n; i++) {
    const r = (i / n) * nRings;
    const s = sOfRingLocal(r);
    if (s > rows[rows.length - 1] + 1e-4) rows.push(s);
  }
  // the tail tip past the caudal base
  rows.push(0.982, 0.986);
  return rows;
}
// (kept local: anatomy's inverse is exact; this one only needs to be monotone)
function sOfRingLocal(r: number): number {
  let lo = S_HEAD, hi = S_CAUDAL;
  for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi); if (ringAt(m) < r) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}

function buildBody(lod: Lod, b: Builder): void {
  const t = TIERS[lod];
  const rows = bodyRows(t);
  const A = t.around;
  const per = A / 8;
  const ringIdx: number[][] = [];
  for (const s of rows) {
    const ring: number[] = [];
    const D = depthAt(s), Wd = widthAt(s), yc = centreAt(s);
    const tip = s > 0.981 ? (s > 0.985 ? 0.35 : 0.75) : 1;
    const groove = 1 - ringGroove(s, t.groove);
    const xs: number[] = [], ys: number[] = [];
    for (let j = 0; j < A; j++) {
      const [ux, uy] = sectionUnit(s, j / per);
      let x = ux * 0.5 * Wd * groove * tip, y = yc + uy * 0.5 * D * groove * tip;
      if (lod < 2) {
        const sw = headSwell(s, y, ux);
        if (sw > 0) { const l = Math.hypot(ux, uy) || 1; x += (ux / l) * sw; y += (uy / l) * sw * 0.6; }
      }
      xs.push(x); ys.push(y);
    }
    // arc length round the section from the dorsal midline (TL), the same both ways: the skin's pigment cells are laid
    // out in it, so they keep their shape on the long flank plates of the polygonal section
    const arc = new Array<number>(A).fill(0);
    for (let j = 1; j <= A / 2; j++) arc[j] = arc[j - 1] + Math.hypot(xs[j] - xs[j - 1], ys[j] - ys[j - 1]);
    for (let j = A - 1; j > A / 2; j--) arc[j] = (j === A - 1 ? 0 : arc[j + 1]) + Math.hypot(xs[j] - xs[(j + 1) % A], ys[j] - ys[(j + 1) % A]);
    for (let j = 0; j < A; j++) {
      const phi = (j / A) * 2 * Math.PI;
      ring.push(b.vertex([xs[j], ys[j], zOf(s)], bodyWeights(s, ys[j]), [s, Math.cos(phi), Math.sin(phi)], [ringAt(s), arc[j]], 0));
    }
    ringIdx.push(ring);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const r0 = ringIdx[i], r1 = ringIdx[i + 1];
    for (let j = 0; j < A; j++) {
      const j1 = (j + 1) % A;
      // the section runs clockwise seen from the front (+z): wind so the outside faces out
      b.quad(r0[j], r0[j1], r1[j1], r1[j]);
    }
  }
  // the tail tip's cap
  const last = ringIdx[ringIdx.length - 1];
  const sEnd = rows[rows.length - 1];
  const cEnd = b.vertex([0, centreAt(sEnd), zOf(sEnd + 0.001)], bodyWeights(sEnd, 0), [sEnd, 1, 0], [ringAt(S_CAUDAL), 0], 0);
  for (let j = 0; j < A; j++) b.tri(last[(j + 1) % A], cEnd, last[j]);
  // the mouth: the snout's end closes over a small upturned opening (a dark pit at the top of the tip)
  const first = ringIdx[0];
  const s0 = rows[0];
  const D0 = depthAt(s0), W0 = widthAt(s0), y0 = centreAt(s0);
  const lips: number[] = [];
  const lipZ = zOf(s0) + 0.0011, lipS = 0.62;
  for (let j = 0; j < A; j++) {
    const [ux, uy] = sectionUnit(0, j / per);
    const y = y0 + 0.0012 + uy * 0.5 * D0 * lipS;
    lips.push(b.vertex([ux * 0.5 * W0 * lipS, y, lipZ], bodyWeights(0, y), [0, Math.cos((j / A) * 2 * Math.PI), Math.sin((j / A) * 2 * Math.PI)], [-1, j / per], 0));
  }
  for (let j = 0; j < A; j++) b.quad(lips[j], lips[(j + 1) % A], first[(j + 1) % A], first[j]);
  // a small mouth set high on the end (upturned), not a hole down the tube
  const pitZ = zOf(s0) + 0.0006, pitY = y0 + 0.0022;
  // (the mouth is part -1: blended toward the skin's 0 it never passes through another part's id)
  const pit = b.vertex([0, pitY, pitZ], bodyWeights(0, pitY), [0, 1, 0], [-1, 0], -1);
  const inner: number[] = [];
  for (let j = 0; j < A; j++) {
    const [ux, uy] = sectionUnit(0, j / per);
    const y = pitY + uy * 0.5 * D0 * 0.2;
    inner.push(b.vertex([ux * 0.5 * W0 * 0.24, y, lipZ + 0.0002], bodyWeights(0, y), [0, 1, 0], [-1, j / per], -0.55));
  }
  for (let j = 0; j < A; j++) {
    b.quad(inner[j], inner[(j + 1) % A], lips[(j + 1) % A], lips[j]);
    b.tri(inner[j], pit, inner[(j + 1) % A]);
  }
  // LOD2: the caudal fan as a painted, opaque blade in the body's mesh
  if (lod === 2) {
    const k = NSEG - 1;
    const z0 = zOf(S_CAUDAL - 0.004), z1 = zOf(S_CAUDAL + CAUDAL.len);
    const h0 = 0.0028, h1 = CAUDAL.len * Math.sin(CAUDAL.spread) * 0.85;
    const v = (y: number, z: number, u: number, w: number) => b.vertex([0, y, z], [[k, 1]], [S_CAUDAL, u, w], [ringAt(S_CAUDAL), 0], 3);
    const a0 = v(-h0, z0, 0, 0), a1 = v(h0, z0, 1, 0), a2 = v(h1, z1, 1, 1), a3 = v(-h1, z1, 0, 1);
    b.quad(a0, a1, a2, a3);
  }
}

// ------------------------------------------------------------------ eyes

function buildEyes(lod: Lod, b: Builder): void {
  const t = TIERS[lod];
  if (!t.eyes) return;
  const rings = t.eyes === 2 ? 9 : 4, segs = t.eyes === 2 ? 20 : 10;
  const maxPolar = 1.25;
  for (const side of [1, -1]) {
    const bone = side > 0 ? B_EYE_L : B_EYE_R;
    const cx = side * eyeCentreX(), cy = EYE.y, cz = zOf(EYE.s);
    // looking out, a little up and forward
    const axis = new Vector3(side, 0.22, 0.12).normalize();
    const u1 = new Vector3(0, 1, 0).cross(axis).normalize();
    const u2 = axis.clone().cross(u1).normalize();
    const idx: number[][] = [];
    const c = b.vertex([cx + axis.x * EYE.r, cy + axis.y * EYE.r, cz + axis.z * EYE.r], [[bone, 1]], [EYE.s, side, 0], [0, 0], 1);
    for (let i = 1; i <= rings; i++) {
      const pol = (i / rings) * maxPolar;
      const row: number[] = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * 2 * Math.PI;
        const d = axis.clone().multiplyScalar(Math.cos(pol)).addScaledVector(u1, Math.sin(pol) * Math.cos(a)).addScaledVector(u2, Math.sin(pol) * Math.sin(a));
        // eye-local pattern coordinates on the iris plane, in eye radii: x forward, y up (u1 points back on the left eye)
        const ex = -side * Math.sin(pol) * Math.cos(a), ey = Math.sin(pol) * Math.sin(a);
        row.push(b.vertex([cx + d.x * EYE.r, cy + d.y * EYE.r, cz + d.z * EYE.r], [[bone, 1]], [EYE.s, side, pol], [ex, ey], 1));
      }
      idx.push(row);
    }
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      b.tri(c, idx[0][j], idx[0][j1]);
    }
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      // (axis, u1, u2) is right-handed for both eyes: one winding fits both
      b.quad(idx[i][j], idx[i + 1][j], idx[i + 1][j1], idx[i][j1]);
    }
  }
}

// ------------------------------------------------------------------ fins

class FinBuilder extends Builder {
  ray: number[] = [];
  fin(p: readonly [number, number, number], w: [number, number][], u: number, v: number, id: number, onRay: number): number {
    this.ray.push(onRay);
    return this.vertex(p, w, [u, v, id], [0, 0], 0);
  }
  /** a membrane: columns × rows of points, quads between (double-sided material) */
  grid(cols: number[][]): void {
    for (let c = 0; c < cols.length - 1; c++) for (let r = 0; r < cols[c].length - 1; r++) this.quad(cols[c][r], cols[c][r + 1], cols[c + 1][r + 1], cols[c + 1][r]);
  }
}

const dorsalProfile = (u: number) => Math.pow(Math.sin(Math.PI * (0.06 + 0.86 * u)), 0.55) * (1 - 0.18 * u);

function buildFins(lod: Lod): BufferGeometry | null {
  const t = TIERS[lod];
  if (!t.fins) return null;
  const b = new FinBuilder();
  const full = t.fins === 2;
  // dorsal: rays from the back's midline, leaning back; the membrane notched a little between the rays
  {
    const nCols = full ? DORSAL.rays * 2 - 1 : 13;
    const nRows = full ? 5 : 2;
    const cols: number[][] = [];
    for (let c = 0; c < nCols; c++) {
      const u = c / (nCols - 1);
      const s = DORSAL.s0 + (DORSAL.s1 - DORSAL.s0) * u;
      const onRay = full ? (c % 2 === 0 ? 1 : 0) : 1;
      const h = DORSAL.height * dorsalProfile(u) * (onRay ? 1 : 0.9);
      const lean = DORSAL.lean + 0.12 * u;
      const bf = u * (DORSAL_BONES - 1), b0 = Math.min(DORSAL_BONES - 2, Math.floor(bf)), wb = bf - b0;
      const w: [number, number][] = [[B_DORSAL + b0, 1 - wb], [B_DORSAL + b0 + 1, wb]];
      const y0 = topAt(s) - 0.0006;
      const col: number[] = [];
      for (let r = 0; r < nRows; r++) {
        const v = r / (nRows - 1);
        col.push(b.fin([0, y0 + Math.sin(lean) * h * v, zOf(s) - Math.cos(lean) * h * v], w, u, v, 0, onRay));
      }
      cols.push(col);
    }
    b.grid(cols);
  }
  // pectorals: a small fan of rays from an oblique base just behind the gill cover, opening backward and out
  for (const side of [1, -1]) {
    const bone = side > 0 ? B_PEC_L : B_PEC_R;
    const n = full ? PEC.rays * 2 - 1 : 5;
    const nRows = full ? 4 : 2;
    const cols: number[][] = [];
    const xb = side * 0.5 * widthAt(PEC.s) * 0.92;
    for (let c = 0; c < n; c++) {
      const u = c / (n - 1);
      const onRay = full ? (c % 2 === 0 ? 1 : 0) : 1;
      const yb = PEC.y1 + (PEC.y0 - PEC.y1) * u;
      const a = -0.95 + 1.75 * u;
      const len = PEC.len * (0.62 + 0.38 * Math.sin(Math.PI * (0.15 + 0.75 * u))) * (onRay ? 1 : 0.92);
      const dir = new Vector3(side * 0.42, -Math.sin(a) * 0.95, -Math.cos(a)).normalize();
      const col: number[] = [];
      for (let r = 0; r < nRows; r++) {
        const v = r / (nRows - 1);
        col.push(b.fin([xb + dir.x * len * v, yb + dir.y * len * v, zOf(PEC.s) + dir.z * len * v], [[bone, 1]], u, v, 1, onRay));
      }
      cols.push(side > 0 ? col : col);
    }
    if (side < 0) cols.reverse();
    b.grid(cols);
  }
  // caudal: a rounded fan of ten rays from the tail's end
  {
    const k = NSEG - 1;
    const n = full ? CAUDAL.rays * 2 - 1 : 7;
    const nRows = full ? 5 : 2;
    const cols: number[][] = [];
    const base = depthAt(CAUDAL.s) * 0.42;
    for (let c = 0; c < n; c++) {
      const u = c / (n - 1);
      const onRay = full ? (c % 2 === 0 ? 1 : 0) : 1;
      const a = (u * 2 - 1) * CAUDAL.spread;
      const len = CAUDAL.len * (0.86 + 0.14 * Math.cos(a * 1.6)) * (onRay ? 1 : 0.93);
      const yb = (u * 2 - 1) * base, zb = zOf(CAUDAL.s);
      const col: number[] = [];
      for (let r = 0; r < nRows; r++) {
        const v = r / (nRows - 1);
        col.push(b.fin([0, yb + Math.sin(a) * len * v, zb - Math.cos(a) * len * v], [[k, 1]], u, v, 2, onRay));
      }
      cols.push(col);
    }
    b.grid(cols);
  }
  // anal: two or three tiny rays (near tier only)
  if (full) {
    const k = segmentOfS(ANAL.s);
    const cols: number[][] = [];
    for (let c = 0; c < ANAL.rays * 2 - 1; c++) {
      const u = c / (ANAL.rays * 2 - 2);
      const s = ANAL.s + u * 0.006;
      const y0 = centreAt(s) - 0.5 * depthAt(s) + 0.0003;
      const onRay = c % 2 === 0 ? 1 : 0;
      const len = ANAL.len * (onRay ? 1 : 0.85);
      cols.push([0, 1].map((v) => b.fin([0, y0 - Math.sin(1.0) * len * v, zOf(s) - Math.cos(1.0) * len * v], [[k, 1]], u, v, 3, onRay)));
    }
    b.grid(cols);
  }
  const g = b.build('aFin', null);
  g.setAttribute('aRay', new Float32BufferAttribute(b.ray, 1));
  return g;
}
function segmentOfS(s: number): number {
  for (let k = NSEG - 1; k >= 0; k--) if (s >= STATIONS[k]) return k;
  return 0;
}

// ------------------------------------------------------------------ tiers

const cache = new Map<Lod, YoujiuoGeometry>();

/** The shared geometry of a tier (built on first use). */
export function youjiuoGeometry(lod: Lod): YoujiuoGeometry {
  let g = cache.get(lod);
  if (g) return g;
  const b = new Builder();
  buildBody(lod, b);
  buildEyes(lod, b);
  const body = b.build('aBody', 'aPat');
  body.name = `YoujiuoBody${lod}`;
  const fins = buildFins(lod);
  if (fins) fins.name = `YoujiuoFins${lod}`;
  g = { body, fins };
  cache.set(lod, g);
  return g;
}

/** triangle counts of a tier (body, fins) */
export function triangleCount(lod: Lod): { body: number; fins: number } {
  const g = youjiuoGeometry(lod);
  return { body: (g.body.index?.count ?? 0) / 3, fins: (g.fins?.index?.count ?? 0) / 3 };
}

export { B_HEAD, B_SNOUT, B_JAW };
