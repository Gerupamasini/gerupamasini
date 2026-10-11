import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';
import {
  ARMS, ARM_BONES, CAVITY_Z, EYE, FIN, FUNNEL, HEAD_PROFILE, PROFILE, TENTACLE, TENTACLE_BONES, Z_FRONT, Z_TIP,
  Z_ROOT, armBase, finBase, finEdge, funnelSection, lidFrame, mantleRim, profileAt, surfacePoint, tentacleBase, toModel, type ArmDef, type ProfileKnot,
} from './anatomy';

/**
 * Geometry of the ミミイカ, built once per tier and shared by every animal: skinned meshes of the mantle, the head
 * (with the eye sockets and the arm crown), the funnel, the fins, the eight arms and the two tentacles, plus the
 * eyeballs (rigid, under the eye bones). Every skin vertex carries
 *   aSkin = (part, t along an arm / tentacle, oral-ness −1 … 1, section centre y in mm)
 * part: 0 mantle, 1 head, 2 arm, 3 tentacle, 4 funnel — the shader lays the chromatophores on the rest position in
 * millimetres (no texture, no seams) and deforms the mantle (ventilation, the jet) about its own axis.
 * The fins carry aFin = (u along the base 0 front … 1 back, v out to the edge 0 … 1, side +1 left / −1 right): the
 * waves that run along them are made in the vertex shader.
 */

export interface Tier {
  around: number; front: number; back: number;
  armAround: number; armAlong: number;
  tenAround: number; tenAlong: number;
  finU: number; finV: number;
  eyeW: number; eyeH: number;
  funnel: boolean; tentacles: boolean;
  /** segments round each sucker cup (0: the suckers are only painted) */
  sucker: number;
}

export const LODS: Tier[] = [
  { around: 72, back: 58, front: 30, armAround: 10, armAlong: 22, tenAround: 8, tenAlong: 30, finU: 24, finV: 9, eyeW: 40, eyeH: 28, funnel: true, tentacles: true, sucker: 6 },
  { around: 36, back: 28, front: 15, armAround: 7, armAlong: 11, tenAround: 6, tenAlong: 14, finU: 12, finV: 5, eyeW: 20, eyeH: 14, funnel: true, tentacles: true, sucker: 0 },
  { around: 14, back: 10, front: 6, armAround: 4, armAlong: 5, tenAround: 4, tenAlong: 5, finU: 6, finV: 2, eyeW: 10, eyeH: 7, funnel: false, tentacles: false, sucker: 0 },
];

// ------------------------------------------------------------------ rig

export interface BoneDef {
  name: string;
  parent: string | null;
  /** rest transform in the model frame (absolute) */
  matrix: Matrix4;
  inverse: Matrix4;
  /** arm / tentacle chains: the index in the chain */
  chain?: { kind: 'arm' | 'ten'; index: number; k: number; length: number };
}

export interface RigDef {
  defs: BoneDef[];
  byName: Record<string, number>;
}

const v3 = (a: [number, number, number]) => new Vector3(...a);

/** a frame whose z is `dir`, y as close to `up` as it can be */
function frame(pos: Vector3, dir: Vector3, up: Vector3): Matrix4 {
  const z = dir.clone().normalize();
  const x = new Vector3().crossVectors(up, z).normalize();
  const y = new Vector3().crossVectors(z, x);
  return new Matrix4().makeBasis(x, y, z).setPosition(pos);
}

export const armBone = (a: ArmDef, k: number) => `J_arm${a.name}_${k}`;
export const tenBone = (side: 1 | -1, k: number) => `J_ten${side > 0 ? 'L' : 'R'}_${k}`;

export function rigDefinition(): RigDef {
  const defs: BoneDef[] = [];
  const add = (name: string, parent: string | null, m: Matrix4, chain?: BoneDef['chain']) => defs.push({ name, parent, matrix: m, inverse: m.clone().invert(), chain });
  const Y = new Vector3(0, 1, 0);
  add('J_root', null, new Matrix4());
  add('J_head', 'J_root', new Matrix4().setPosition(v3(toModel([0, 0.8, 1.2]))));
  for (const side of [1, -1] as const) {
    const g = new Vector3(EYE.gaze[0] * side, EYE.gaze[1], EYE.gaze[2]).normalize();
    add(side > 0 ? 'J_eye_L' : 'J_eye_R', 'J_head', frame(v3(toModel([EYE.x * side, EYE.y, EYE.z])), g, Y));
  }
  // the funnel's joint where it leaves the mantle, pointing along the tube to its opening
  const f0 = funnelSection(0), f1 = funnelSection(FUNNEL.z1);
  add('J_funnel', 'J_head', frame(v3(toModel([0, f0.yc, 0])), new Vector3(0, f1.yc - f0.yc, FUNNEL.z1), Y));
  for (const side of [1, -1] as const) {
    // the fin's frame: z along the base (forward), x out along the membrane at rest, y its normal
    const b = v3(toModel(finBase(0.45)));
    b.x *= side;
    const out = new Vector3(Math.cos(FIN.tilt) * side, Math.sin(FIN.tilt), 0);
    const z = new Vector3(0, 0, 1);
    const y = new Vector3().crossVectors(z, out).normalize();
    // (y = z × out keeps both fins' frames proper rotations; the right fin's y points down)
    const m = new Matrix4().makeBasis(out, y, z).setPosition(b);
    add(side > 0 ? 'J_fin_L' : 'J_fin_R', 'J_root', m);
  }
  ARMS.forEach((a, i) => {
    const B = armBase(a);
    const dir = v3(B.dir), out = v3(B.out);
    for (let k = 0; k < ARM_BONES; k++) {
      const p = v3(B.pos).addScaledVector(dir, (a.length * k) / ARM_BONES);
      add(armBone(a, k), k === 0 ? 'J_head' : armBone(a, k - 1), frame(v3(toModel([p.x, p.y, p.z])), dir, out), { kind: 'arm', index: i, k, length: a.length / ARM_BONES / 1000 });
    }
  });
  for (const side of [1, -1] as const) {
    const B = tentacleBase(side);
    const dir = v3(B.dir), out = new Vector3(Math.sin(side * TENTACLE.angle), Math.cos(TENTACLE.angle), 0);
    for (let k = 0; k < TENTACLE_BONES; k++) {
      const p = v3(B.pos).addScaledVector(dir, (TENTACLE.length * k) / (TENTACLE_BONES - 1) * 0.96);
      add(tenBone(side, k), k === 0 ? 'J_head' : tenBone(side, k - 1), frame(v3(toModel([p.x, p.y, p.z])), dir, out), { kind: 'ten', index: side > 0 ? 0 : 1, k, length: (TENTACLE.length * 0.96) / (TENTACLE_BONES - 1) / 1000 });
    }
  }
  const byName: Record<string, number> = {};
  defs.forEach((d, i) => { byName[d.name] = i; });
  return { defs, byName };
}

// ------------------------------------------------------------------ builders

class Builder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; skin: number[] = []; si: number[] = []; sw: number[] = []; idx: number[] = []; fin: number[] = [];
  get count(): number { return this.pos.length / 3; }
  vert(p: Vector3, n: Vector3, uv: [number, number], skin: [number, number, number, number], bones: [number, number][], fin?: [number, number, number]): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(uv[0], uv[1]);
    this.skin.push(...skin);
    if (fin) this.fin.push(...fin);
    const b = bones.filter(([, w]) => w > 1e-4).sort((a, c) => c[1] - a[1]).slice(0, 4);
    const tot = b.reduce((s, [, w]) => s + w, 0) || 1;
    for (let k = 0; k < 4; k++) { this.si.push(b[k]?.[0] ?? 0); this.sw.push(b[k] ? b[k][1] / tot : 0); }
    return this.count - 1;
  }
  /** a grid of rows × cols vertices (cols wrapping or not) into quads */
  grid(first: number, rows: number, cols: number, flip = false): void {
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = first + r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if (flip) this.idx.push(a, b, d, b, e, d);
      else this.idx.push(a, d, b, b, d, e);
    }
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    if (this.skin.length) g.setAttribute('aSkin', new BufferAttribute(new Float32Array(this.skin), 4));
    if (this.fin.length) g.setAttribute('aFin', new BufferAttribute(new Float32Array(this.fin), 3));
    g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(this.si), 4));
    g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(this.sw), 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const M = (p: [number, number, number]) => v3(toModel(p));

/** z of the body's rings: clustered at the caps, the neck and over the eyes */
function rings(z0: number, z1: number, n: number, clusterStart: boolean, clusterEnd: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    let t = i / n;
    if (clusterStart && clusterEnd) t = 0.5 - 0.5 * Math.cos(Math.PI * t);
    else if (clusterStart) t = 1 - Math.cos((Math.PI / 2) * t);
    else if (clusterEnd) t = Math.sin((Math.PI / 2) * t);
    out.push(z0 + (z1 - z0) * t);
  }
  return out;
}

/** a point of a lofted surface (outline K) and its outward normal, from the surface's derivatives */
function surf(z: number, th: number, K: ProfileKnot[], zLo: number, zHi: number): { p: Vector3; n: Vector3; f: Vector3; c: number } {
  const pr = profileAt(z, K);
  const p = v3(surfacePoint(z, th, K));
  const e = 0.02, ez = 0.03;
  const a1 = v3(surfacePoint(z, th + e, K)), a0 = v3(surfacePoint(z, th - e, K));
  const b1 = v3(surfacePoint(Math.min(zHi, z + ez), th, K)), b0 = v3(surfacePoint(Math.max(zLo, z - ez), th, K));
  const dth = a1.sub(a0), dz = b1.sub(b0);
  let n = new Vector3().crossVectors(dth, dz);
  if (n.lengthSq() < 1e-10 || pr.w < 0.05) n = new Vector3(0, 0, z < (zLo + zHi) / 2 ? -1 : 1);
  n.normalize();
  // (outward: away from the section's centre, and out of the caps at the two ends)
  if (n.dot(new Vector3(p.x, p.y - pr.c, z < zLo + 5 ? (z - zLo - 5) * 2 : z > zHi - 2 ? (z - zHi + 2) * 2 : 0)) < 0) n.negate();
  const f = dz.lengthSq() > 1e-12 ? dz.normalize() : new Vector3(0, 0, 1);
  return { p, n, f, c: pr.c };
}

/**
 * The mantle and the head.
 *   Mantle  a muscular cloak round the visceral mass: the outer skin from the blunt end to the free edge (mantleRim:
 *           on the back fused onto the head, on the sides and under the belly a little behind the neck), a rounded,
 *           thick collar lip, and the inner lining running back into the mantle cavity until it meets the visceral sac
 *           (aSkin.y: 0 outer skin, 0.5 the lip, 1 the lining)
 *   Head    the visceral sac inside the cavity, the neck, the head with the eye sockets and the arm crown; narrower
 *           than the mantle's opening, so the cavity shows as a dark gap round the neck with the funnel coming out
 */
export function buildBody(rig: RigDef, t: Tier): { mantle: BufferGeometry; head: BufferGeometry; domeMin: number } {
  const head = rig.byName.J_head, root = rig.byName.J_root;
  const cols = t.around + 1;
  // ---- the mantle
  const mb = new Builder();
  const nOut = t.back, nLip = Math.max(2, Math.round(t.front / 6)), nIn = Math.max(2, Math.round(t.front / 2.5));
  const rows = nOut + 1 + nLip + nIn;
  const pts: { p: Vector3; n: Vector3; c: number; layer: number; z: number }[][] = [];
  for (let j = 0; j < cols; j++) {
    const th = -Math.PI + (2 * Math.PI * j) / t.around;
    const rim = mantleRim(th);
    const col: (typeof pts)[number] = [];
    // the free edge turns in a little towards the neck it closes on; under the belly it lies on the funnel's base
    // instead and stands out over it
    const V = Math.exp(-(((Math.PI - Math.abs(th)) / 0.62) ** 2));
    const hug = (z: number) => 0.7 * (1 - rim.fused) * (1 - V) * smooth(rim.z - 2.6, rim.z, z) - FUNNEL.flare * V * smooth(rim.z - 4.5, rim.z, z);
    // outer skin: clustered at the blunt end and at the edge
    for (let i = 0; i <= nOut; i++) {
      const u = 0.5 - 0.5 * Math.cos(Math.PI * (i / nOut));
      const z = Z_TIP + (rim.z - Z_TIP) * u;
      const S = surf(z, th, PROFILE, Z_TIP, Z_FRONT);
      S.p.addScaledVector(S.n, -hug(z));
      col.push({ p: S.p, n: S.n, c: S.c, layer: 0, z });
    }
    // the lip: half a turn from the outer skin over the edge onto the lining
    const R = surf(rim.z, th, PROFILE, Z_TIP, Z_FRONT);
    R.p.addScaledVector(R.n, -hug(rim.z));
    const T = rim.thick;
    for (let k = 1; k <= nLip; k++) {
      const ph = (Math.PI * k) / (nLip + 1);
      const p = R.p.clone().addScaledVector(R.n, -(T / 2) * (1 - Math.cos(ph))).addScaledVector(R.f, (T / 2) * Math.sin(ph) * 1.2);
      // (where the mantle is fused to the head there is no free edge: the lip keeps the skin's normal, no crease)
      const n = R.n.clone().multiplyScalar(Math.cos(ph)).addScaledVector(R.f, Math.sin(ph)).normalize().lerp(R.n, rim.fused).normalize();
      col.push({ p, n, c: R.c, layer: 0.5 * (1 - rim.fused), z: rim.z });
    }
    // the lining: back into the cavity, closing onto the visceral sac at its floor
    for (let i = 0; i <= nIn; i++) {
      const u = i / nIn;
      const z = rim.z + (CAVITY_Z - rim.z) * u;
      const O = surf(z, th, PROFILE, Z_TIP, Z_FRONT);
      const H = surf(z, th, HEAD_PROFILE, -7.6, Z_FRONT);
      const p = O.p.clone().addScaledVector(O.n, -T - hug(z));
      const close = smooth(0.7, 1.0, u);
      p.lerp(H.p, close);
      const n = O.n.clone().negate().lerp(H.n.clone().negate(), close).normalize();
      col.push({ p, n, c: O.c, layer: 1, z });
    }
    pts.push(col);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const q = pts[j][i];
    mb.vert(M([q.p.x, q.p.y, q.p.z]), q.n, [j / t.around, i / (rows - 1)], [0, q.layer, 0, q.c], [[root, 1]]);
  }
  mb.grid(0, rows, cols, false);
  // ---- the head and the visceral sac
  const hb = new Builder();
  const zs = rings(-7.6, Z_FRONT, t.front + Math.round(t.front / 2), true, true);
  for (const z of zs) {
    for (let j = 0; j < cols; j++) {
      const th = -Math.PI + (2 * Math.PI * j) / t.around;
      const S = surf(z, th, HEAD_PROFILE, -7.6, Z_FRONT);
      // the head (and arms) turn on the neck; the sac inside the mantle stays with the root; the skin of the eye's dome
      // turns with the head as one piece (the ball under it is rigid on the head)
      const dEye = Math.hypot(S.p.x - EYE.x * Math.sign(S.p.x || 1), S.p.y - EYE.y, S.p.z - EYE.z) - (EYE.r + EYE.skin);
      const wh = Math.max(smooth(-0.2, 3.0, z), 1 - smooth(0.25, 1.5, dEye));
      hb.vert(M([S.p.x, S.p.y, S.p.z]), S.n, [j / t.around, (z + 7.6) / (Z_FRONT + 7.6)], [1, 0, 0, S.c], [[root, 1 - wh], [head, wh]]);
    }
  }
  hb.grid(0, zs.length, cols, false);
  return { mantle: mb.build(), head: hb.build(), domeMin: domeMin(hb) };
}

/**
 * The least distance from the eye's centre to the head's skin over the front of the dome (the triangles' corners,
 * edge midpoints and centroids: a flat facet sags inside the sphere its corners lie on). The ball must stay under it.
 */
function domeMin(b: Builder): number {
  const C = new Vector3(EYE.x, EYE.y, EYE.z), A = new Vector3(...EYE.gaze).normalize();
  const Rs = EYE.r + EYE.skin;
  const P = (i: number) => new Vector3(b.pos[3 * i] * 1000, b.pos[3 * i + 1] * 1000, b.pos[3 * i + 2] * 1000 + Z_ROOT);
  let best = Infinity;
  for (let k = 0; k < b.idx.length; k += 3) {
    const a = P(b.idx[k]), c = P(b.idx[k + 1]), d = P(b.idx[k + 2]);
    if (a.x <= 0 || c.x <= 0 || d.x <= 0) continue;
    if (a.distanceTo(C) > 1.5 * Rs || c.distanceTo(C) > 1.5 * Rs || d.distanceTo(C) > 1.5 * Rs) continue;
    const m = a.clone().add(c).add(d).divideScalar(3);
    if (m.clone().sub(C).dot(A) <= 0) continue;
    for (const q of [a, c, d, m, a.clone().lerp(c, 0.5), c.clone().lerp(d, 0.5), d.clone().lerp(a, 0.5)]) best = Math.min(best, q.distanceTo(C));
  }
  return best;
}

/** a tapering tube along a straight rest line, skinned to a chain of bones; `club` widens the far end (the tentacles) */
function tube(b: Builder, base: Vector3, dir: Vector3, out: Vector3, length: number, radius: (t: number) => number, flat: (t: number) => number,
  around: number, along: number, bones: number[], part: number, t0 = -0.1): void {
  const z = dir.clone().normalize();
  const y = out.clone().addScaledVector(z, -out.dot(z)).normalize();
  const x = new Vector3().crossVectors(y, z);
  const first = b.count, cols = around + 1;
  const nb = bones.length;
  const rows: number[] = [];
  for (let i = 0; i <= along; i++) {
    const u = i / along;
    // denser towards the tip (the curl is strongest there)
    rows.push(t0 + (1 - t0) * (1 - (1 - u) * (1 - u) * 0.35 - 0.65 * (1 - u)) );
  }
  rows[rows.length - 1] = 1;
  for (const tt of rows) {
    // a rounded tip: the last few % close in
    const tipK = tt > 0.97 ? Math.sqrt(Math.max(0, (1 - tt) / 0.03)) : 1;
    const r = radius(Math.max(0, tt)) * tipK;
    const fl = flat(Math.max(0, tt));
    const c = base.clone().addScaledVector(z, tt * length);
    for (let j = 0; j < cols; j++) {
      const a = (2 * Math.PI * j) / around;
      // angle 0 = the aboral (outer) side; π = the oral side with the suckers, a little flattened
      const ca = Math.cos(a), sa = Math.sin(a);
      const ry = ca < 0 ? r * fl : r;
      const p = c.clone().addScaledVector(y, ca * ry).addScaledVector(x, sa * r);
      const n = y.clone().multiplyScalar(ca / Math.max(ry, 1e-4)).addScaledVector(x, sa / Math.max(r, 1e-4)).normalize();
      if (tt > 0.97) n.lerp(z, smooth(0.97, 1, tt)).normalize();
      // weights along the chain: linear between the two nearest bones
      // (arm joints at k / nb of the length, the tentacle's at k / (nb − 1) of 96 % of it)
      const f = Math.max(0, Math.min(nb - 1, part === 3 ? (tt / 0.96) * (nb - 1) - 0.5 : tt * nb - 0.5));
      const k0 = Math.floor(f), k1 = Math.min(nb - 1, k0 + 1), w1 = f - k0;
      b.vert(new Vector3(p.x / 1000, p.y / 1000, p.z / 1000), n, [j / around, Math.max(0, tt)], [part, Math.max(0, tt), -ca, 0], [[bones[k0], 1 - w1], [bones[k1], w1]]);
    }
  }
  b.grid(first, rows.length, cols, false);
}

/**
 * Stalked sucker cups on the oral face of an arm (or a tentacle club): along `from` … `to` of the length, in rows at the
 * given angles round the arm (π is the oral midline), alternate rows half a step apart, each cup a short wall, a
 * rounded rim and the hollow inside it (aSkin.z: 0 the wall, 1 the rim, 2 the hollow). Skinned like the arm under it.
 */
function suckers(b: Builder, base: Vector3, dir: Vector3, out: Vector3, length: number, radius: (t: number) => number, flat: (t: number) => number,
  bones: number[], weightAt: (t: number) => [number, number][], rows: number[], from: number, to: number, size: (t: number) => number, seg: number, part: number): void {
  const z = dir.clone().normalize();
  const y = out.clone().addScaledVector(z, -out.dot(z)).normalize();
  const x = new Vector3().crossVectors(y, z);
  void bones;
  // the cup's rings: (radius, height) in units of the cup's radius, and which part of the cup it is
  const RING: [number, number, number][] = [[0.8, -0.35, 0], [1.0, 0.3, 0], [0.86, 0.55, 1], [0.5, 0.4, 2], [0.18, 0.12, 2]];
  rows.forEach((a, ri) => {
    let tt = from + (ri % 2) * 0.5 * (2.5 * size(from) / length);
    while (tt < to) {
      const r = radius(tt), fl = flat(tt), rs = size(tt);
      const ca = Math.cos(a), sa = Math.sin(a);
      const ry = ca < 0 ? r * fl : r;
      const c = base.clone().addScaledVector(z, tt * length);
      const P = c.clone().addScaledVector(y, ca * ry).addScaledVector(x, sa * r);
      const N = y.clone().multiplyScalar(ca / Math.max(ry, 1e-4)).addScaledVector(x, sa / Math.max(r, 1e-4)).normalize();
      const T = z.clone().addScaledVector(N, -z.dot(N)).normalize();
      const B = new Vector3().crossVectors(N, T);
      const w = weightAt(tt);
      const first = b.count;
      for (const [rr, hh, kind] of RING) {
        for (let k = 0; k <= seg; k++) {
          const ph = (2 * Math.PI * k) / seg;
          const radial = T.clone().multiplyScalar(Math.cos(ph)).addScaledVector(B, Math.sin(ph));
          const p = P.clone().addScaledVector(radial, rr * rs).addScaledVector(N, hh * rs);
          const n = kind === 0 ? radial.clone().addScaledVector(N, 0.3).normalize() : kind === 1 ? N.clone().addScaledVector(radial, 0.4).normalize() : N.clone().addScaledVector(radial, -0.6).normalize();
          b.vert(new Vector3(p.x / 1000, p.y / 1000, p.z / 1000), n, [k / seg, tt], [part, tt, kind, 0], w);
        }
      }
      b.grid(first, RING.length, seg + 1, true);
      // the bottom of the hollow
      const ci = b.vert(P.clone().addScaledVector(N, 0.08 * rs).divideScalar(1000), N, [0.5, tt], [part, tt, 2, 0], w);
      const last = first + (RING.length - 1) * (seg + 1);
      for (let k = 0; k < seg; k++) b.idx.push(last + k, ci, last + k + 1);
      tt += 2.5 * rs / length;
    }
  });
}

/** the eight arms in one geometry */
export function buildArms(rig: RigDef, t: Tier): BufferGeometry {
  const b = new Builder();
  for (const a of ARMS) {
    const B = armBase(a);
    const base = new Vector3(...toModel(B.pos)).multiplyScalar(1000);
    const bones = Array.from({ length: ARM_BONES }, (_, k) => rig.byName[armBone(a, k)]);
    const radius = (u: number) => a.rBase * (1 - 0.86 * Math.pow(u, 0.85)) + 0.08, flat = (u: number) => 0.72 + 0.18 * u;
    tube(b, base, v3(B.dir), v3(B.out), a.length, radius, flat, t.armAround, t.armAlong, bones, 2);
    if (t.sucker) {
      const nb = bones.length;
      const wAt = (u: number): [number, number][] => { const f = Math.max(0, Math.min(nb - 1, u * nb - 0.5)); const k0 = Math.floor(f), k1 = Math.min(nb - 1, k0 + 1); return [[bones[k0], 1 - (f - k0)], [bones[k1], f - k0]]; };
      // two rows either side of the oral midline, from the mouth to near the tip, shrinking along the arm
      suckers(b, base, v3(B.dir), v3(B.out), a.length, radius, flat, bones, wAt, [Math.PI - 0.5, Math.PI + 0.5], 0.04, 0.93, (u) => a.rBase * 0.24 * (1 - 0.72 * u) + 0.03, t.sucker, 7);
    }
  }
  return b.build();
}

/** the two tentacles: thin stalks with a club (rest geometry at full length; the pose draws them in) */
export function buildTentacles(rig: RigDef, t: Tier): BufferGeometry {
  const b = new Builder();
  for (const side of [1, -1] as const) {
    const B = tentacleBase(side);
    const base = new Vector3(...toModel(B.pos)).multiplyScalar(1000);
    const out = new Vector3(Math.sin(side * TENTACLE.angle), Math.cos(TENTACLE.angle), 0);
    const bones = Array.from({ length: TENTACLE_BONES }, (_, k) => rig.byName[tenBone(side, k)]);
    const r = (u: number) => {
      const club = smooth(TENTACLE.club0 - 0.06, TENTACLE.club0 + 0.08, u) * (1 - smooth(0.93, 1.0, u) * 0.6);
      return TENTACLE.rStalk * (1 - 0.25 * u) + (TENTACLE.rClub - TENTACLE.rStalk) * club;
    };
    const flat = (u: number) => (u > TENTACLE.club0 ? 0.55 : 0.9);
    tube(b, base, v3(B.dir), out, TENTACLE.length, r, flat, t.tenAround, t.tenAlong, bones, 3);
    if (t.sucker) {
      const nb = bones.length;
      const wAt = (u: number): [number, number][] => { const f = Math.max(0, Math.min(nb - 1, (u / 0.96) * (nb - 1) - 0.5)); const k0 = Math.floor(f), k1 = Math.min(nb - 1, k0 + 1); return [[bones[k0], 1 - (f - k0)], [bones[k1], f - k0]]; };
      // the club's pad: four rows of tiny suckers
      suckers(b, base, v3(B.dir), out, TENTACLE.length, r, flat, bones, wAt, [Math.PI - 0.75, Math.PI - 0.25, Math.PI + 0.25, Math.PI + 0.75], TENTACLE.club0 + 0.02, 0.97, () => 0.13, Math.max(4, t.sucker - 2), 7);
    }
  }
  return b.build();
}

/**
 * The funnel (anatomy FUNNEL, funnelSection): one sheet from the flat base in the mantle cavity along the outer wall
 * to the opening, over the thick rounded lip and back down the bore, closed at the bottom of the bore. The seam runs
 * along the dorsal wall, in the head's groove. aSkin = (4, t along the outer wall, layer 0 outer / 1 lip / 2 bore,
 * depth into the bore 0 … 1). Skinned from the root (the base in the cavity) through the head to J_funnel (the tube).
 */
export function buildFunnel(rig: RigDef, t: Tier): BufferGeometry {
  const b = new Builder();
  const fun = rig.byName.J_funnel, head = rig.byName.J_head, root = rig.byName.J_root;
  const around = Math.max(10, Math.round(t.around / 3)), along = Math.max(8, Math.round(t.front / 2)), nLip = t.around > 40 ? 4 : 2, nBore = 3;
  const cols = around + 1;
  const weights = (z: number): [number, number][] => {
    const wh = smooth(-2.6, -0.6, z), wf = smooth(-0.2, 1.8, z);
    return [[root, 1 - wh], [head, wh * (1 - wf)], [fun, wh * wf]];
  };
  // the section at z, scaled in (s) for the lip and the bore; φ = 0 is the dorsal side, φ > 0 the animal's left
  const at = (z: number, phi: number, s: number, dz = 0): Vector3 => {
    const S = funnelSection(z);
    return new Vector3(Math.sin(phi) * (S.a - s), S.yc + Math.cos(phi) * (S.b - s * 0.9), z + dz);
  };
  const rows: { p: Vector3[]; skin: [number, number, number, number]; z: number }[] = [];
  for (let i = 0; i <= along; i++) {
    const u = i / along;
    // denser towards the opening
    const z = FUNNEL.z0 + (FUNNEL.z1 - FUNNEL.z0) * (1 - (1 - u) * (1 - u) * 0.55 - 0.45 * (1 - u));
    rows.push({ p: Array.from({ length: cols }, (_, j) => at(z, (2 * Math.PI * j) / around, 0)), skin: [4, u, 0, 0], z });
  }
  // the lip: half a turn over the rim
  const L = FUNNEL.lip;
  for (let k = 1; k <= nLip; k++) {
    const ph = (Math.PI * k) / (nLip + 1);
    rows.push({ p: Array.from({ length: cols }, (_, j) => at(FUNNEL.z1, (2 * Math.PI * j) / around, L * 0.5 * (1 - Math.cos(ph)), L * 0.55 * Math.sin(ph))), skin: [4, 1, 1, 0], z: FUNNEL.z1 });
  }
  // the bore: back into the tube, narrowing a little
  for (let k = 0; k <= nBore; k++) {
    const d = k / nBore, z = FUNNEL.z1 - FUNNEL.bore * d;
    rows.push({ p: Array.from({ length: cols }, (_, j) => at(z, (2 * Math.PI * j) / around, L + 0.25 * d)), skin: [4, 1, 2, d], z });
  }
  // normals from the sheet's own derivatives (rows × around: outward on the wall, into the bore inside it)
  const n = rows.length;
  rows.forEach((r, i) => {
    const r0 = rows[Math.max(0, i - 1)].p, r1 = rows[Math.min(n - 1, i + 1)].p;
    r.p.forEach((p, j) => {
      const jm = (j - 1 + around) % around, jp = (j + 1) % around;
      const dRow = r1[j].clone().sub(r0[j]);
      const dCol = r.p[jp].clone().sub(r.p[jm]);
      const nn = new Vector3().crossVectors(dRow, dCol);
      if (nn.lengthSq() < 1e-12) nn.set(0, 0, i < along ? -1 : 1);
      b.vert(M([p.x, p.y, p.z]), nn.normalize(), [j / around, i / (n - 1)], r.skin, weights(r.z));
    });
  });
  b.grid(0, n, cols, false);
  // the bottom of the bore, and the closed base inside the cavity (never seen but through the mantle)
  const last = (n - 1) * cols;
  const zb = FUNNEL.z1 - FUNNEL.bore, Sb = funnelSection(zb);
  const cb = b.vert(M([0, Sb.yc, zb - 0.1]), new Vector3(0, 0, 1), [0.5, 1], [4, 1, 2, 1], weights(zb));
  for (let j = 0; j < around; j++) b.idx.push(last + j, cb, last + j + 1);
  const S0 = funnelSection(FUNNEL.z0);
  const c0 = b.vert(M([0, S0.yc, FUNNEL.z0 - 0.2]), new Vector3(0, 0, -1), [0.5, 0], [4, 0, 0, 0], weights(FUNNEL.z0));
  for (let j = 0; j < around; j++) b.idx.push(j + 1, c0, j);
  return b.build();
}

/** a fin (left +1 / right −1): the rounded ear on the mantle's side */
export function buildFin(rig: RigDef, t: Tier, side: 1 | -1): BufferGeometry {
  const b = new Builder();
  const finB = rig.byName[side > 0 ? 'J_fin_L' : 'J_fin_R'], root = rig.byName.J_root;
  const out = new Vector3(Math.cos(FIN.tilt) * side, Math.sin(FIN.tilt), 0);
  const nrm = new Vector3(-Math.sin(FIN.tilt) * side, Math.cos(FIN.tilt), 0);
  const cols = t.finU + 1;
  for (let i = 0; i <= t.finV; i++) {
    const v = i / t.finV;
    for (let j = 0; j < cols; j++) {
      const u = j / t.finU;
      const base = finBase(Math.min(1, Math.max(0, u)));
      const e = finEdge(u);
      // the membrane: from its base line on the mantle out to the rounded edge (the lobe reaches past both ends of the base)
      const vz = v * v * (3 - 2 * v);
      const z = base[2] + (e.z - base[2]) * vz;
      const span = e.span * v;
      const p = new Vector3(base[0] * side, base[1], z).addScaledVector(out, span);
      b.vert(M([p.x, p.y, p.z]), nrm, [u, v], [5, v, 0, 0], [[root, 1 - smooth(0.0, 0.3, v)], [finB, smooth(0.0, 0.3, v)]], [u, v, side]);
    }
  }
  b.grid(0, t.finV + 1, cols, side < 0);
  return b.build();
}

/**
 * The viscera seen through the glassy mantle (photographs 17, 24, 62): the silvery, dark ink sac on the midline under
 * the gut, the orange-brown digestive gland behind it and the pale gills to the sides — ellipsoids with a vertex
 * colour each, rigid with the root (they sit well inside the mantle's contraction); the gills in the mantle cavity.
 */
export function buildViscera(rig: RigDef, t: Tier): BufferGeometry {
  const b = new Builder();
  const root = rig.byName.J_root;
  const cols: number[] = [];
  const blob = (c: [number, number, number], r: [number, number, number], col: [number, number, number], w: number, h: number) => {
    const first = b.count;
    for (let i = 0; i <= h; i++) {
      const th = (Math.PI * i) / h;
      for (let j = 0; j <= w; j++) {
        const ph = (2 * Math.PI * j) / w;
        const n = new Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
        const p: [number, number, number] = [c[0] + n.x * r[0], c[1] + n.y * r[1], c[2] + n.z * r[2]];
        b.vert(M(p), new Vector3(n.x / r[0], n.y / r[1], n.z / r[2]).normalize(), [j / w, i / h], [6, 0, 0, 0], [[root, 1]]);
        cols.push(...col);
      }
    }
    b.grid(first, h + 1, w + 1, true);
  };
  const w = Math.max(8, Math.round(t.around / 4)), h = Math.max(5, Math.round(w * 0.6));
  blob([0, 1.4, -13.5], [4.4, 3.6, 6.8], [0.36, 0.17, 0.08], w, h);          // digestive gland
  blob([0, -1.8, -9.5], [2.3, 1.7, 4.2], [0.05, 0.05, 0.06], w, h);         // ink sac (its silver coat: the shader)
  // the gills lie in the mantle cavity either side of the visceral sac: seen through the gap at the collar
  for (const s of [-1, 1]) blob([s * 6.3, -1.0, -3.9], [0.7, 1.45, 2.5], [0.62, 0.5, 0.48], w, h);
  const g = b.build();
  g.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
  return g;
}

/**
 * The eyeball: a sphere round the optical axis (+z), polar uv (centre of the uv square = the pupil). Its back half sits
 * in the socket, under the dome of the lid skin; its radius is the tier's (just under the skin's facets, domeMin).
 */
export function buildEye(t: Tier, rBall = EYE.r): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const r = rBall / 1000;
  const W = t.eyeW, H = t.eyeH;
  for (let i = 0; i <= H; i++) {
    const th = (Math.PI * 0.78 * i) / H;   // from the axis back to 140°: the rest is inside the head
    for (let j = 0; j <= W; j++) {
      const ph = (2 * Math.PI * j) / W;
      const n = new Vector3(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
      const rr = Math.min(1, th / Math.PI) * 0.5;
      pos.push(n.x * r, n.y * r, n.z * r);
      const nn = n.clone().normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push(0.5 + rr * Math.cos(ph), 0.5 + rr * Math.sin(ph));
    }
  }
  for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) {
    const a = i * (W + 1) + j, b = a + 1, c = a + W + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}


/**
 * The corneas (both eyes in one geometry, in J_head's frame): clear bubbles bulging a little over the lids' opening
 * (photographs 12, 15, 22, 47: their highlights float above the iris), tucked under the lid skin round it. uv is the
 * stereographic position on the eye (the lids' frame), so the shader can mask the bubble to the opening. Only on the
 * two nearer tiers.
 */
export function buildCornea(t: Tier): BufferGeometry | null {
  if (t.eyeW < 20) return null;
  const nA = Math.round(0.8 * t.eyeW), nR = Math.round(0.45 * t.eyeH);
  const { A, U, F } = lidFrame();
  const vA = new Vector3(...A), vU = new Vector3(...U), vF = new Vector3(...F);
  const Rs = EYE.r + EYE.skin;
  const H = toModel([0, 0.8, 1.2]);   // J_head's rest position
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const side of [1, -1] as const) {
    const first = pos.length / 3;
    for (let i = 0; i <= nR; i++) {
      const phi = (0.88 * i) / nR;
      const q = 1 - (phi / 0.8) ** 2;
      const rho = phi < 0.8 ? Rs + 0.02 + 0.22 * q * q : Rs - 0.08;
      const drho = phi < 0.8 ? 0.22 * 2 * q * (-2 * phi / 0.64) : 0;
      for (let j = 0; j <= nA; j++) {
        const psi = (2 * Math.PI * j) / nA;
        const rad = vF.clone().multiplyScalar(Math.cos(psi)).addScaledVector(vU, Math.sin(psi));
        const dir = vA.clone().multiplyScalar(Math.cos(phi)).addScaledVector(rad, Math.sin(phi));
        const tPhi = vA.clone().multiplyScalar(-Math.sin(phi)).addScaledVector(rad, Math.cos(phi));
        const n = dir.clone().addScaledVector(tPhi, -drho / rho).normalize();
        const p = [EYE.x + dir.x * rho, EYE.y + dir.y * rho, EYE.z + dir.z * rho];
        const m = toModel([p[0] * side, p[1], p[2]]);
        pos.push(m[0] - H[0], m[1] - H[1], m[2] - H[2]);
        nor.push(n.x * side, n.y, n.z);
        const st = 2 * Math.tan(phi / 2);
        uv.push(st * Math.cos(psi), st * Math.sin(psi));
      }
    }
    for (let i = 0; i < nR; i++) for (let j = 0; j < nA; j++) {
      const a = first + i * (nA + 1) + j, b = a + 1, c = a + nA + 1, d = c + 1;
      // (outward on the left eye; the mirrored right eye winds the other way)
      if (side > 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
