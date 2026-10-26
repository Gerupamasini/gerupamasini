import { BufferGeometry, Float32BufferAttribute, Matrix4, Uint16BufferAttribute, Vector3 } from 'three';
import {
  FIN_BAND_COUNT, FIN_BANDS, curve, mix, phiAtHeight, profilesOf, sectionAt, sectionPoint, smooth, zOf,
  type EyeSpec, type FishSpec, type MedianFinSpec, type PairedFinSpec, type Section,
} from './spec';

/**
 * 共通 FishRig + LOD geometry: the body lofted from the species' profiles and sections, with a real gape (the lower
 * jaw is its own bone; the mouth's lining shows when it opens), the gill cover's free edge raised as a step, domed
 * eyes, and the fins as thin skinned sheets drawn through a fin atlas. Three tiers per species, built once and shared.
 *
 * Bones: S0 … S7 along the axis (S0 the head joint: in front of it the skull is rigid; S7 the caudal base), Jaw (a child
 * of S0 at the corner of the mouth), PecL / PecR (at the pectoral bases), OperL / OperR (the gill covers, hinged in front:
 * they swing out as the fish breathes and the red of the gill chamber shows behind them), Eye0 / Eye1 (each eyeball
 * turns in its orbit), Caud (the caudal fin's rays bend behind the peduncle).
 */

export type Lod = 0 | 1 | 2;
export const SPINE_N = 8;
export const BONE_JAW = SPINE_N;
export const BONE_PECL = SPINE_N + 1;
export const BONE_PECR = SPINE_N + 2;
export const BONE_OPERL = SPINE_N + 3;
export const BONE_OPERR = SPINE_N + 4;
export const BONE_EYE0 = SPINE_N + 5;
export const BONE_EYE1 = SPINE_N + 6;
export const BONE_CAUD = SPINE_N + 7;
export const BONE_COUNT = SPINE_N + 8;

interface TierParams { rings: number; around: number; finU: number; finV: number; eye: number; mouth: boolean }
export const TIERS: readonly TierParams[] = [
  { rings: 160, around: 84, finU: 1, finV: 6, eye: 22, mouth: true },
  { rings: 46, around: 26, finU: 0.45, finV: 3, eye: 9, mouth: true },
  { rings: 15, around: 10, finU: 0.18, finV: 1, eye: 0, mouth: false },
];

export interface RigRest {
  /** s of every spine bone */
  sp: number[];
  /** model-frame rest position of every bone, its parent (−1: the model root) */
  world: Vector3[];
  parent: number[];
  inverses: Matrix4[];
}

const RIGS = new WeakMap<FishSpec, RigRest>();

export function rigRest(spec: FishSpec): RigRest {
  let r = RIGS.get(spec);
  if (r) return r;
  const sp: number[] = [];
  for (let k = 0; k < SPINE_N; k++) sp.push(mix(spec.headJoint, spec.caudalBase, k / (SPINE_N - 1)));
  const T = spec.modelTL;
  const world: Vector3[] = sp.map((s) => new Vector3(0, 0, zOf(spec, s)));
  const parent = sp.map((_, k) => k - 1);
  const m = spec.mouth;
  world.push(new Vector3(0, profilesOf(spec).gape(m.corner) * T, zOf(spec, m.corner + 0.012)));
  parent.push(0);
  const pec = spec.fins.pectoral;
  const pk = Math.max(0, sp.findIndex((s) => s > pec.s) - 1);
  const sec = sectionAt(spec, pec.s);
  const [px] = sectionPoint(sec, phiAtHeight(sec, pec.y));
  world.push(new Vector3(px * T, pec.y * T, zOf(spec, pec.s)), new Vector3(-px * T, pec.y * T, zOf(spec, pec.s)));
  parent.push(pk, pk);
  // the gill covers swing about their front, high on the cheek
  const o = operHinge(spec), P0 = new Vector3(), N0 = new Vector3();
  for (const side of [1, -1]) {
    skinPoint(spec, o.s, o.y, side, P0, N0);
    world.push(P0.clone().addScaledVector(N0, -0.01 * T));
    parent.push(0);
  }
  // the eyeballs turn about their centres
  const eyes = eyeList(spec);
  for (let k = 0; k < 2; k++) {
    const e = eyes[Math.min(k, eyes.length - 1)];
    world.push(eyeFrame(spec, e.e, e.side).c.clone());
    parent.push(0);
  }
  world.push(new Vector3(0, 0, zOf(spec, spec.caudalBase + 0.45 * spec.fins.caudal.len)));
  parent.push(SPINE_N - 1);
  const inverses = world.map((w) => new Matrix4().makeTranslation(-w.x, -w.y, -w.z));
  r = { sp, world, parent, inverses };
  RIGS.set(spec, r);
  return r;
}

/** the two spine bones (and weights) a point at s follows */
function spineWeights(sp: number[], s: number, out: [number, number, number]): [number, number, number] {
  if (s <= sp[0]) { out[0] = 0; out[1] = 0; out[2] = 0; return out; }
  for (let k = 0; k < sp.length - 1; k++) {
    if (s <= sp[k + 1]) {
      out[0] = k; out[1] = k + 1; out[2] = (s - sp[k]) / (sp[k + 1] - sp[k]);
      return out;
    }
  }
  const n = sp.length - 1;
  out[0] = n; out[1] = n; out[2] = 0;
  return out;
}

class Builder {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  fin: number[] = [];
  gill: number[] = [];
  idx: number[] = [];
  constructor(readonly withColour: boolean, readonly withFin: boolean) {}
  get count(): number { return this.pos.length / 3; }
  vertex(x: number, y: number, z: number, u: number, v: number, bones: readonly number[], weights: readonly number[], c = 1): number {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    if (this.withColour) { this.col.push(c, c, c); this.gill.push(0); }
    for (let i = 0; i < 4; i++) { this.si.push(bones[i] ?? 0); this.sw.push(weights[i] ?? 0); }
    if (this.withFin) this.fin.push(0, 0);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  geometry(normals = true): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    if (this.withColour) {
      g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
      g.setAttribute('aGill', new Float32BufferAttribute(this.gill, 1));
    }
    if (this.withFin) g.setAttribute('aFin', new Float32BufferAttribute(this.fin, 2));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    if (normals) g.computeVertexNormals();
    return g;
  }
}

/** ring stations along the body: dense at the snout and head, a cap behind the peduncle */
function stations(spec: FishSpec, n: number): number[] {
  const cb = spec.caudalBase;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // dense toward the snout (the head carries the eye, the gape and the gill cover)
    out.push(cb * (0.62 * t * t + 0.38 * t));
  }
  return out;
}

/** body texture u for s (the body takes the texture's full width; the head, with its detail, a larger share of it) */
export const bodyU = (spec: FishSpec, s: number): number => Math.pow(Math.max(0, s) / (spec.caudalBase + 0.03), 0.7);
/** s at body texture u (the painter's inverse of bodyU) */
export const bodyS = (spec: FishSpec, u: number): number => (spec.caudalBase + 0.03) * Math.pow(Math.max(0, u), 1 / 0.7);

/** where a gill cover is hinged (s, height; TL) */
export function operHinge(spec: FishSpec): { s: number; y: number } {
  return { s: spec.oper.s - 0.06, y: 0.55 * spec.oper.top };
}

/** how much a point of the skin (s, height y) follows its gill cover: 1 on the plate up to its free edge */
export function operWeight(spec: FishSpec, s: number, y: number, top: number, bot: number): number {
  const o = spec.oper;
  if (y >= o.top || y <= -o.bot) return 0;
  const hh = y >= 0 ? top : bot, v = y / Math.max(1e-4, hh);
  const edge = o.s - o.sweep * v * v;
  const pre = o.s - (spec.relief?.preDepth ?? 0.055) - 0.035 * Math.max(0, -v) ** 2 + 0.01 * v;
  const fadeY = (1 - smooth(o.top * 0.7, o.top, y)) * (1 - smooth(o.bot * 0.7, o.bot, -y));
  return smooth(pre, edge - 0.02, s) * (1 - smooth(edge - 0.0005, edge + 0.0005, s)) * fadeY;
}

export interface TierGeometry { body: BufferGeometry; fins: BufferGeometry; eyes: BufferGeometry | null; triangles: number }

const CACHE = new WeakMap<FishSpec, (TierGeometry | null)[]>();

export function fishGeometry(spec: FishSpec, lod: Lod): TierGeometry {
  let c = CACHE.get(spec);
  if (!c) { c = [null, null, null]; CACHE.set(spec, c); }
  const hit = c[lod];
  if (hit) return hit;
  const body = buildBody(spec, TIERS[lod]);
  const fins = buildFins(spec, TIERS[lod]);
  const eyes = TIERS[lod].eye > 0 ? buildEyes(spec, TIERS[lod].eye) : null;
  const tris = (g: BufferGeometry | null) => (g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0);
  const t: TierGeometry = { body, fins, eyes, triangles: tris(body) + tris(fins) + tris(eyes) };
  c[lod] = t;
  return t;
}

function buildBody(spec: FishSpec, tp: TierParams): BufferGeometry {
  const T = spec.modelTL, P = profilesOf(spec), rig = rigRest(spec);
  const b = new Builder(true, false);
  const S = stations(spec, tp.rings);
  const cb = spec.caudalBase;
  // the peduncle closes behind the caudal base (under the fin's base)
  S.push(cb + 0.008, cb + 0.016);
  const K = tp.around;
  const m = spec.mouth, oper = spec.oper;
  const gapeAt = (s: number) => {
    const ss = Math.min(s, m.corner);
    const sec = { hwL: 1, hwR: 1, top: Math.max(1e-4, P.top(ss)), bot: Math.max(1e-4, P.bot(ss)), nTop: P.nTop(ss), nBot: P.nBot(ss) };
    return phiAtHeight(sec, P.gape(ss));
  };
  const phiC = gapeAt(m.corner);
  const Ku = Math.max(2, Math.round((K * phiC) / Math.PI)), Kl = Math.max(2, K - Ku);
  const ringLen = Ku + Kl + 2;
  const sec: Section = { hwL: 0, hwR: 0, top: 0, bot: 0, nTop: 2, nBot: 2 };
  const pt: [number, number] = [0, 0];
  const w3: [number, number, number] = [0, 0, 0];
  const bones = [0, 0, 0, 0], weights = [0, 0, 0, 0];
  const rings: number[] = [];
  const inner: number[] = [];
  const mouthRings: number[] = [];
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    sectionAt(spec, Math.min(s, cb), sec);
    if (s > cb) {
      const k = s > cb + 0.012 ? 0.08 : 0.55;
      sec.hwL *= k; sec.hwR *= k; sec.top *= k; sec.bot *= k;
    }
    const phiG = gapeAt(s);
    rings.push(b.count);
    spineWeights(rig.sp, s, w3);
    for (let part = 0; part < 2; part++) {
      const n = part === 0 ? Ku : Kl;
      const a0 = part === 0 ? -phiG : phiG, a1 = part === 0 ? phiG : 2 * Math.PI - phiG;
      for (let j = 0; j <= n; j++) {
        const phi = a0 + ((a1 - a0) * j) / n;
        sectionPoint(sec, phi, pt);
        let x = pt[0], y = pt[1];
        // the gill cover's free edge: the plate stands a step proud of the body just in front of it
        const hh = y >= 0 ? sec.top : sec.bot;
        const edge = oper.s - oper.sweep * (y / Math.max(1e-4, hh)) ** 2;
        if (y < oper.top && y > -oper.bot) {
          const side = Math.sin(phi) ** 2;
          const step = oper.step * side * (1 - smooth(edge - 0.004, edge + 0.0015, s)) * smooth(edge - 0.11, edge - 0.07, s);
          const r = Math.hypot(x, y) || 1;
          x += (x / r) * step; y += (y / r) * step;
        }
        // the lower jaw (and the throat in front of the corner) follows the jaw bone
        let wj = 0;
        if (part === 1 && tp.mouth) {
          const away = Math.min(1, Math.min(j, n - j) / (0.5 * n));
          wj = 1 - smooth(0.62 * m.corner, m.corner * (1 + 0.5 * away), s);
        }
        // the gill cover follows its own bone up to its free edge; just behind the edge, the gill chamber's red shows
        // as the cover swings out (aGill)
        const sideK = Math.sin(phi) ** 2;
        const wo = tp.mouth ? sideK * operWeight(spec, s, pt[1], sec.top, sec.bot) : 0;
        bones[0] = w3[0]; bones[1] = w3[1]; bones[2] = BONE_JAW; bones[3] = Math.sin(phi) >= 0 ? BONE_OPERL : BONE_OPERR;
        const rest = 1 - wj - wo;
        weights[0] = (1 - w3[2]) * rest; weights[1] = w3[2] * rest; weights[2] = wj; weights[3] = wo;
        const k = b.vertex(x * T, y * T, zOf(spec, s), bodyU(spec, s), phi / (2 * Math.PI), bones, weights);
        if (tp.mouth && pt[1] < oper.top * 0.8 && pt[1] > -oper.bot * 0.9) {
          b.gill[k] = sideK * (s > edge ? 1 - smooth(edge + 0.002, edge + 0.008, s) : 0);
        }
      }
    }
    // the mouth's lining: a cone inside the head behind the lips, on the same angles
    if (tp.mouth && s < m.corner) {
      mouthRings.push(i);
      inner.push(b.count);
      const g = P.gape(s) * sec.top / Math.max(1e-4, P.top(s));
      const k = 0.82 * Math.sqrt(Math.max(0, 1 - (s / m.corner) ** 2));
      const si = s + 0.01;
      for (let part = 0; part < 2; part++) {
        const n = part === 0 ? Ku : Kl;
        const a0 = part === 0 ? -phiG : phiG, a1 = part === 0 ? phiG : 2 * Math.PI - phiG;
        for (let j = 0; j <= n; j++) {
          const phi = a0 + ((a1 - a0) * j) / n;
          sectionPoint(sec, phi, pt);
          const x = k * pt[0], y = g + k * (pt[1] - g);
          const away = Math.min(1, Math.min(j, n - j) / (0.5 * n));
          const wj = part === 1 ? 1 - smooth(0.62 * m.corner, m.corner * (1 + 0.5 * away), s) : 0;
          bones[0] = 0; bones[1] = 0; bones[2] = BONE_JAW; bones[3] = 0;
          weights[0] = 1 - wj; weights[1] = 0; weights[2] = wj; weights[3] = 0;
          b.vertex(x * T, y * T, zOf(spec, si), bodyU(spec, s), phi / (2 * Math.PI), bones, weights, m.inside);
        }
      }
    }
  }
  // the skin: upper arc and lower arc, each its own strip (the gape between them)
  const arcs: [number, number][] = [[0, Ku], [Ku + 1, Kl]];
  for (let i = 0; i < S.length - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1];
    for (const [o, n] of arcs) {
      for (let j = 0; j < n; j++) {
        const a = r0 + o + j, bb = r0 + o + j + 1, c = r1 + o + j, d = r1 + o + j + 1;
        b.tri(a, bb, c); b.tri(bb, d, c);
      }
    }
  }
  // the end of the peduncle: closed to a point
  const last = rings[rings.length - 1];
  const tip = b.vertex(0, 0, zOf(spec, cb + 0.02), bodyU(spec, cb + 0.02), 0.25, [SPINE_N - 1], [1]);
  for (const [o, n] of arcs) for (let j = 0; j < n; j++) b.tri(last + o + j, last + o + j + 1, tip);
  if (inner.length) {
    // the lining (wound inward) and the lips' rolls joining it to the skin at the gape
    for (let q = 0; q < inner.length; q++) {
      const i = mouthRings[q];
      const n0 = inner[q], n1 = q + 1 < inner.length ? inner[q + 1] : -1;
      const o0 = rings[i], o1 = rings[i + 1];
      if (n1 < 0) continue;
      for (const [o, n] of arcs) for (let j = 0; j < n; j++) {
        const a = n0 + o + j, bb = n0 + o + j + 1, c = n1 + o + j, d = n1 + o + j + 1;
        b.tri(a, c, bb); b.tri(bb, c, d);
      }
      // the four ends of the arcs: outer edge → inner edge
      // (both windings: the rolls are seen from above and below as the jaw drops)
      for (const e of [0, Ku, Ku + 1, Ku + 1 + Kl]) {
        const oa = o0 + e, ob = o1 + e, ia = n0 + e, ib = n1 + e;
        b.tri(oa, ia, ob); b.tri(ia, ib, ob);
        b.tri(oa, ob, ia); b.tri(ia, ob, ib);
      }
    }
  }
  const g = b.geometry();
  // the duplicated vertices along the gape and at the snout share one normal (no seam while the mouth is shut)
  const nrm = g.attributes.normal as Float32BufferAttribute;
  const avg = (list: number[]) => {
    let x = 0, y = 0, z = 0;
    for (const v of list) { x += nrm.getX(v); y += nrm.getY(v); z += nrm.getZ(v); }
    const l = Math.hypot(x, y, z) || 1;
    for (const v of list) nrm.setXYZ(v, x / l, y / l, z / l);
  };
  for (let i = 0; i < S.length; i++) {
    const r = rings[i];
    avg([r + Ku, r + Ku + 1]);
    avg([r, r + ringLen - 1]);
  }
  const apex: number[] = [];
  for (let j = 0; j < ringLen; j++) apex.push(rings[0] + j);
  avg(apex);
  nrm.needsUpdate = true;
  return g;
}

/** a point on the skin of the left (side +1) or right flank at (s, y), its outward normal (model frame, metres) */
export function skinPoint(spec: FishSpec, s: number, y: number, side: number, outP: Vector3, outN: Vector3): void {
  const T = spec.modelTL;
  const sec = sectionAt(spec, s);
  const phi0 = phiAtHeight(sec, y);
  const phi = side > 0 ? phi0 : 2 * Math.PI - phi0;
  const p = sectionPoint(sec, phi);
  outP.set(p[0] * T, p[1] * T, zOf(spec, s));
  const d = 0.004;
  const pa = sectionPoint(sec, phi + d), pb = sectionPoint(sec, phi - d);
  const s2 = sectionAt(spec, s + 0.004);
  const ps = sectionPoint(s2, phi);
  const ta = new Vector3((pa[0] - pb[0]) * T, (pa[1] - pb[1]) * T, 0);
  const ts = new Vector3((ps[0] - p[0]) * T, (ps[1] - p[1]) * T, zOf(spec, s + 0.004) - zOf(spec, s));
  outN.crossVectors(ts, ta).normalize();
  if (outN.x * side < 0 && Math.abs(p[0]) > 1e-6) outN.negate();
}

function eyeList(spec: FishSpec): { e: EyeSpec; side: number }[] {
  const out: { e: EyeSpec; side: number }[] = [];
  for (const e of spec.eyes) {
    if (e.side) out.push({ e, side: e.side });
    else out.push({ e, side: 1 }, { e, side: -1 });
  }
  return out;
}

/** an eye's dome: its sphere's centre, the gaze, the frame across it, the sphere's radius and the dome's half angle */
export function eyeFrame(spec: FishSpec, e: EyeSpec, side: number): { c: Vector3; g: Vector3; e1: Vector3; e2: Vector3; rS: number; thM: number; r: number } {
  const T = spec.modelTL;
  const P = new Vector3(), N = new Vector3();
  skinPoint(spec, e.s, e.y, side, P, N);
  // the gaze: the skin's normal, turned forward and (a flathead's) up
  const g = N.clone();
  g.applyAxisAngle(new Vector3(0, 1, 0), side * (e.fwd ?? 0.15));
  if (e.up) g.lerp(new Vector3(0, 1, 0), e.up).normalize();
  const r = e.r * T, bulge = e.bulge * T;
  const rS = (r * r + bulge * bulge) / (2 * bulge);
  const thM = Math.asin(Math.min(1, r / rS));
  // (set into the orbit: the dome's rim a little under the skin)
  const c = P.clone().addScaledVector(g, bulge - rS - 0.1 * r);
  const e2 = new Vector3(0, 1, 0).addScaledVector(g, -g.y).normalize();
  if (e2.lengthSq() < 0.5) e2.set(0, 0, 1).addScaledVector(g, -g.z).normalize();
  const e1 = new Vector3().crossVectors(e2, g);
  return { c, g, e1, e2, rS, thM, r };
}

function buildEyes(spec: FishSpec, seg: number): BufferGeometry {
  const T = spec.modelTL;
  const b = new Builder(false, false);
  eyeList(spec).forEach(({ e, side }, k) => {
    const { c, g, e1, e2, rS, thM, r } = eyeFrame(spec, e, side);
    const bone = k === 0 ? BONE_EYE0 : BONE_EYE1;
    const rows = Math.max(3, Math.round(seg / 2)), cols = seg * 2;
    const base = b.count;
    for (let i = 0; i <= rows + 1; i++) {
      const th = i <= rows ? (thM * i) / rows : thM;
      const rr = i <= rows ? rS : rS * 1.08;
      const sink = i <= rows ? 0 : 0.6 * r;
      for (let j = 0; j <= cols; j++) {
        const a = (2 * Math.PI * j) / cols;
        const lx = Math.sin(th) * Math.cos(a), ly = Math.sin(th) * Math.sin(a), lz = Math.cos(th);
        const p = c.clone().addScaledVector(e1, rr * lx).addScaledVector(e2, rr * ly).addScaledVector(g, rS * lz - sink);
        // the cornea maps onto the iris painted on the skin under it (the body's albedo)
        const ss = spec.pivot - p.z / T, yy = p.y / T, sec = sectionAt(spec, Math.max(0.001, ss));
        const ph = phiAtHeight(sec, Math.max(-sec.bot, Math.min(sec.top, yy)));
        b.vertex(p.x, p.y, p.z, bodyU(spec, ss), (side > 0 ? ph : 2 * Math.PI - ph) / (2 * Math.PI), [bone], [1]);
      }
    }
    for (let i = 0; i <= rows; i++) for (let j = 0; j < cols; j++) {
      const a = base + i * (cols + 1) + j, bb = a + 1, cc = a + cols + 1, d = cc + 1;
      b.tri(a, cc, bb); b.tri(bb, cc, d);
    }
  });
  return b.geometry();
}

function finV(id: keyof typeof FIN_BANDS, v: number): number {
  return (FIN_BANDS[id] + 0.03 + 0.94 * v) / FIN_BAND_COUNT;
}

function buildFins(spec: FishSpec, tp: TierParams): BufferGeometry {
  const T = spec.modelTL, P = profilesOf(spec), rig = rigRest(spec);
  const b = new Builder(false, true);
  const w3: [number, number, number] = [0, 0, 0];
  const nv = tp.finV;
  const grid = (nu: number, at: (u: number, v: number, out: Vector3) => number, id: keyof typeof FIN_BANDS, bone: number | null, ripple = 0, rippleLen = 0, flex = false) => {
    const base = b.count;
    // the sheet first, then pleated: each ray a ridge, the membrane between two rays a fold (every other column)
    const pts: Vector3[] = [], ss: number[] = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const p = new Vector3(); ss.push(at(i / nu, j / nv, p)); pts.push(p); }
    const P = (i: number, j: number) => pts[Math.max(0, Math.min(nu, i)) * (nv + 1) + Math.max(0, Math.min(nv, j))];
    const du = new Vector3(), dv = new Vector3(), n = new Vector3();
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const p = P(i, j).clone();
        if (pleat && j > 0) {
          du.subVectors(P(i + 1, j), P(i - 1, j));
          dv.subVectors(P(i, j + 1), P(i, j - 1));
          n.crossVectors(du, dv);
          if (n.lengthSq() > 1e-16) {
            n.normalize();
            const gap = du.length() / ((i > 0 && i < nu ? 2 : 1));
            p.addScaledVector(n, (i % 2 === 0 ? 1 : -1) * 0.22 * gap * Math.min(1, 0.4 + v));
          }
        }
        const s = ss[i * (nv + 1) + j];
        let bones: number[], weights: number[];
        if (flex) { const wv = smooth(0.15, 0.85, v); bones = [SPINE_N - 1, BONE_CAUD]; weights = [1 - wv, wv]; }
        else if (bone !== null) { bones = [bone]; weights = [1]; } else {
          spineWeights(rig.sp, s, w3);
          bones = [w3[0], w3[1]]; weights = [1 - w3[2], w3[2]];
        }
        const k = b.vertex(p.x, p.y, p.z, u, finV(id, v), bones, weights);
        b.fin[2 * k] = u * rippleLen;
        b.fin[2 * k + 1] = ripple * v;
      }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = base + i * (nv + 1) + j, bb = a + 1, c = a + nv + 1, d = c + 1;
      b.tri(a, c, bb); b.tri(bb, c, d);
    }
  };
  // the near tier has a column on every ray and one between each two (the pleats), the others fewer
  const pleat = tp.finU >= 1;
  const nuOf = (rays: number) => (pleat ? Math.max(2, 2 * (rays - 1)) : Math.max(2, Math.round(rays * 2 * tp.finU)));
  for (const f of spec.fins.median) {
    const len = curve(f.len);
    const up = f.id === 'a' ? -1 : 1;
    grid(nuOf(f.rays), (u, v, out) => {
      const sb = mix(f.s0, f.s1, u);
      const yb = up > 0 ? P.top(sb) * 0.94 : -P.bot(sb) * 0.94;
      const rk = mix(f.rake[0], f.rake[1], u);
      const L = len(u) * v;
      const s = sb + Math.sin(rk) * L;
      out.set(0, (yb + up * Math.cos(rk) * L) * T, zOf(spec, s));
      return s;
    }, f.id, null, f.ripple ?? 0, (f.s1 - f.s0));
  }
  // the caudal fin: a fan off the peduncle, rigid on the last bone
  const c = spec.fins.caudal;
  const cb = spec.caudalBase - 0.006;
  const hTop = P.top(spec.caudalBase) * c.base, hBot = P.bot(spec.caudalBase) * c.base;
  grid(nuOf(c.rays), (u, v, out) => {
    const a = 2 * u - 1;
    const yb = mix(-hBot, hTop, u);
    const th = a * c.spread;
    const L = c.len * (c.centre + (c.tip - c.centre) * Math.pow(Math.abs(a), c.p)) * v;
    const s = cb + Math.cos(th) * L;
    out.set(0, (yb + Math.sin(th) * L) * T, zOf(spec, s));
    return s;
  }, 'c', SPINE_N - 1, 0, 0, true);
  // pectorals: a fan in the plane of the flank, on their own bones (the rest pose holds them out)
  const pec = spec.fins.pectoral, pl = curve(pec.len);
  const pw = rig.world[BONE_PECL];
  for (const side of [1, -1]) {
    grid(nuOf(pec.rays), (u, v, out) => {
      const sb = pec.s + 0.25 * pec.base * u, yb = pec.y - pec.base * u;
      const th = mix(pec.dirs[0], pec.dirs[1], u);
      const L = pl(u) * v;
      const s = sb + Math.cos(th) * L;
      out.set(side * (pw.x + 0.0015 * T), (yb + Math.sin(th) * L) * T, zOf(spec, s));
      return s;
    }, 'p', side > 0 ? BONE_PECL : BONE_PECR);
  }
  // pelvics: under the belly, angled down and out
  const pv = spec.fins.pelvic, vl = curve(pv.len);
  for (const side of [1, -1]) {
    grid(nuOf(pv.rays), (u, v, out) => {
      const sb = pv.s + 0.3 * pv.base * u;
      const yb = -P.bot(sb) * 0.92;
      const xb = side * (0.25 * P.width(sb) + pv.base * 0.4 * (1 - u));
      const th = mix(pv.dirs[0], pv.dirs[1], u);
      const L = vl(u) * v;
      const s = sb + Math.cos(th) * L;
      const out2 = Math.sin(th) * L;
      out.set((xb + side * Math.sin(pv.rest) * out2) * T, (yb - Math.cos(pv.rest) * Math.abs(out2) - 0.08 * L) * T, zOf(spec, s));
      return s;
    }, 'v', null);
  }
  return b.geometry();
}

/** the eyes of a spec as (side, spec) pairs (the painter rims them) */
export { eyeList };

/** the bone index a fin follows in the rest pose (tests) */
export function spineOf(spec: FishSpec, s: number): number {
  const w: [number, number, number] = [0, 0, 0];
  spineWeights(rigRest(spec).sp, s, w);
  return w[2] < 0.5 ? w[0] : w[1];
}

export type { MedianFinSpec, PairedFinSpec };
