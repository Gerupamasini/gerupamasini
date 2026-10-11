import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';
import {
  ARMS, ARM_BONES, EYE, FIN, FUNNEL, TENTACLE, TENTACLE_BONES, Z_FRONT, Z_TIP,
  armBase, finBase, finEdge, profileAt, surfacePoint, tentacleBase, toModel, type ArmDef,
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
}

export const LODS: Tier[] = [
  { around: 72, back: 58, front: 30, armAround: 10, armAlong: 22, tenAround: 8, tenAlong: 30, finU: 24, finV: 9, eyeW: 40, eyeH: 28, funnel: true, tentacles: true },
  { around: 36, back: 28, front: 15, armAround: 7, armAlong: 11, tenAround: 6, tenAlong: 14, finU: 12, finV: 5, eyeW: 20, eyeH: 14, funnel: true, tentacles: true },
  { around: 14, back: 10, front: 6, armAround: 4, armAlong: 5, tenAround: 4, tenAlong: 5, finU: 6, finV: 2, eyeW: 10, eyeH: 7, funnel: false, tentacles: false },
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
  add('J_funnel', 'J_head', frame(v3(toModel([0, FUNNEL.y, FUNNEL.z0 + 1.2])), new Vector3(0, 0.08, 1), Y));
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

const Z_SPLIT = 0.3;

/**
 * The mantle and the head: one lofted surface split at the neck (the two meshes share the ring there, so the skin is
 * continuous). θ runs from the ventral midline round the left side over the back to the ventral midline again.
 */
export function buildBody(rig: RigDef, t: Tier): { mantle: BufferGeometry; head: BufferGeometry } {
  const head = rig.byName.J_head, root = rig.byName.J_root;
  const make = (zs: number[], part: number) => {
    const b = new Builder();
    const cols = t.around + 1;
    for (const z of zs) {
      const pr = profileAt(z);
      for (let j = 0; j < cols; j++) {
        const th = -Math.PI + (2 * Math.PI * j) / t.around;
        const p = surfacePoint(z, th);
        // the normal from the surface's derivatives (the caps: along the axis)
        const e = 0.02, ez = 0.03;
        const a1 = surfacePoint(z, th + e), a0 = surfacePoint(z, th - e);
        const b1 = surfacePoint(Math.min(Z_FRONT, z + ez), th), b0 = surfacePoint(Math.max(Z_TIP, z - ez), th);
        const dth = new Vector3(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]);
        const dz = new Vector3(b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]);
        let n = new Vector3().crossVectors(dth, dz);
        if (n.lengthSq() < 1e-10 || pr.w < 0.05) n = new Vector3(0, 0, z < 0 ? -1 : 1);
        n.normalize();
        if (n.dot(new Vector3(p[0], p[1] - pr.c, z < -20 ? (z + 20) * 2 : z > 7 ? (z - 7) * 2 : 0)) < 0) n.negate();
        // the head (and arms) turn on the neck; the mantle stays with the root
        const wh = part === 1 ? smooth(-0.2, 3.0, z) : 0;
        b.vert(M(p), n, [j / t.around, (z - Z_TIP) / (Z_FRONT - Z_TIP)], [part, 0, 0, pr.c], [[root, 1 - wh], [head, wh]]);
      }
    }
    b.grid(0, zs.length, cols, false);
    return b.build();
  };
  const back = rings(Z_TIP, Z_SPLIT, t.back, true, true);
  const front = rings(Z_SPLIT, Z_FRONT, t.front, false, true);
  return { mantle: make(back, 0), head: make(front, 1) };
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

/** the eight arms in one geometry */
export function buildArms(rig: RigDef, t: Tier): BufferGeometry {
  const b = new Builder();
  for (const a of ARMS) {
    const B = armBase(a);
    const base = new Vector3(...toModel(B.pos)).multiplyScalar(1000);
    const bones = Array.from({ length: ARM_BONES }, (_, k) => rig.byName[armBone(a, k)]);
    tube(b, base, v3(B.dir), v3(B.out), a.length, (u) => a.rBase * (1 - 0.86 * Math.pow(u, 0.85)) + 0.08, (u) => 0.72 + 0.18 * u, t.armAround, t.armAlong, bones, 2);
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
    tube(b, base, v3(B.dir), out, TENTACLE.length, r, (u) => (u > TENTACLE.club0 ? 0.55 : 0.9), t.tenAround, t.tenAlong, bones, 3);
  }
  return b.build();
}

/** the funnel: a short cone under the head, open at its tip */
export function buildFunnel(rig: RigDef, t: Tier): BufferGeometry {
  const b = new Builder();
  const fun = rig.byName.J_funnel, head = rig.byName.J_head;
  const around = Math.max(8, Math.round(t.around / 4)), along = 8;
  const cols = around + 1;
  for (let i = 0; i <= along; i++) {
    const u = i / along;
    const z = FUNNEL.z0 + (FUNNEL.z1 - FUNNEL.z0) * u;
    const r = FUNNEL.r0 + (FUNNEL.r1 - FUNNEL.r0) * Math.pow(u, 0.8);
    for (let j = 0; j < cols; j++) {
      const a = (2 * Math.PI * j) / around;
      const p: [number, number, number] = [Math.sin(a) * r * 1.15, FUNNEL.y + Math.cos(a) * r * 0.8, z];
      const n = new Vector3(Math.sin(a) / 1.15, Math.cos(a) / 0.8, 0.12).normalize();
      b.vert(M(p), n, [j / around, u], [4, u, 0, FUNNEL.y], [[head, 1 - smooth(0.2, 0.7, u)], [fun, smooth(0.2, 0.7, u)]]);
    }
  }
  b.grid(0, along + 1, cols, false);
  // the opening: a small dark disc just inside the rim
  const first = b.count;
  const zc = FUNNEL.z1 - 0.15;
  b.vert(M([0, FUNNEL.y, zc - 0.3]), new Vector3(0, 0, 1), [0.5, 1], [4, 1.5, 0, FUNNEL.y], [[fun, 1]]);
  for (let j = 0; j <= around; j++) {
    const a = (2 * Math.PI * j) / around;
    const r = FUNNEL.r1 * 0.95;
    b.vert(M([Math.sin(a) * r * 1.15, FUNNEL.y + Math.cos(a) * r * 0.8, zc]), new Vector3(0, 0, 1), [j / around, 1], [4, 1.5, 0, FUNNEL.y], [[fun, 1]]);
  }
  for (let j = 0; j < around; j++) b.idx.push(first, first + 1 + j + 1, first + 1 + j);
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
 * The eyeball: a sphere round the optical axis (+z), polar uv (centre of the uv square = the pupil). Its back half sits
 * in the socket; the cornea over it is the skin's transparent window (the shader's clearcoat).
 */
export function buildEye(t: Tier): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const r = EYE.r / 1000;
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

