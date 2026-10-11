import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Uint16BufferAttribute, Vector3 } from 'three';
import { MORPH, dorsalHeight, halfWidth, tailFins, tailSection, tailZ, ventralDepth } from './morphology';

/**
 * Geometry of the アカエイ, built once per LOD and shared by every individual (the individual's size is the root's
 * scale; its pose lives in its own skeleton). All parts are skinned to one skeleton:
 *
 *   bone 0                       the trunk (root of the rig)
 *   bones 1 … ROWS×COLS          a lattice over the disc: ROWS stations from the snout back, COLS across from the left
 *                                margin to the right one. The driver sets each from the analytic undulation field, so the
 *                                skin follows a travelling wave with the head still and the margins and rear moving most.
 *   bones after that             the tail, TAIL_BONES stations from the pelvic fins to the tip, posed by a follow chain.
 *
 * Every vertex of the disc, the eyes, the spiracles and the mouth is weighted bilinearly in (station, across) to its four
 * lattice bones; tail vertices (and the sting riding on the tail) to the two tail bones around them.
 */

export const LATTICE_ROWS = 12;
export const LATTICE_COLS = 9;
export const TAIL_BONES = 22;
export const LATTICE_BASE = 1;
export const TAIL_BASE = LATTICE_BASE + LATTICE_ROWS * LATTICE_COLS;
export const BONE_COUNT = TAIL_BASE + TAIL_BONES;

export type Lod = 0 | 1 | 2;

export interface LodSpec {
  rows: number;
  across: number;
  tailRings: number;
  tailSides: number;
  eyeSeg: number;
  details: boolean;
}

export const LOD_SPEC: Record<Lod, LodSpec> = {
  0: { rows: 112, across: 50, tailRings: 120, tailSides: 16, eyeSeg: 24, details: true },
  1: { rows: 52, across: 22, tailRings: 52, tailSides: 9, eyeSeg: 12, details: true },
  2: { rows: 18, across: 7, tailRings: 16, tailSides: 5, eyeSeg: 6, details: false },
};

/** bind-pose station of lattice row r */
export function latticeZ(r: number): number {
  return MORPH.zSnout - (MORPH.zSnout - MORPH.zEnd) * (r / (LATTICE_ROWS - 1));
}
/** bind-pose across fraction of lattice column c (-1 left margin … +1 right margin; +X is the animal's left) */
export function latticeU(c: number): number {
  return -1 + (2 * c) / (LATTICE_COLS - 1);
}
/** bind-pose arc length of tail bone j along the tail (0 … 1) */
export function tailBoneS(j: number): number {
  return j / (TAIL_BONES - 1);
}
/** the tail's axis height in the bind pose: mid-thickness of the trunk at its end, then level */
export function tailAxisY(s: number): number {
  return 0.004 * Math.max(0, 1 - s * 6);
}

export function bindPosition(i: number, out = new Vector3()): Vector3 {
  if (i === 0) return out.set(0, 0, 0);
  if (i < TAIL_BASE) {
    const k = i - LATTICE_BASE, r = Math.floor(k / LATTICE_COLS), c = k % LATTICE_COLS;
    const z = latticeZ(r);
    return out.set(latticeU(c) * halfWidth(z), 0, z);
  }
  const s = tailBoneS(i - TAIL_BASE);
  return out.set(0, tailAxisY(s), tailZ(s));
}

/** the four lattice bones and weights for a point of the disc in the bind pose */
export function latticeWeights(x: number, z: number, idx: number[], wts: number[]): void {
  const span = MORPH.zSnout - MORPH.zEnd;
  const rf = Math.min(LATTICE_ROWS - 1 - 1e-6, Math.max(0, ((MORPH.zSnout - z) / span) * (LATTICE_ROWS - 1)));
  const w = Math.max(1e-4, halfWidth(Math.min(MORPH.zSnout - 1e-4, Math.max(MORPH.zEnd, z))));
  const u = Math.max(-1, Math.min(1, x / w));
  const cf = Math.min(LATTICE_COLS - 1 - 1e-6, ((u + 1) / 2) * (LATTICE_COLS - 1));
  const r0 = Math.floor(rf), c0 = Math.floor(cf), fr = rf - r0, fc = cf - c0;
  idx[0] = LATTICE_BASE + r0 * LATTICE_COLS + c0; wts[0] = (1 - fr) * (1 - fc);
  idx[1] = LATTICE_BASE + r0 * LATTICE_COLS + c0 + 1; wts[1] = (1 - fr) * fc;
  idx[2] = LATTICE_BASE + (r0 + 1) * LATTICE_COLS + c0; wts[2] = fr * (1 - fc);
  idx[3] = LATTICE_BASE + (r0 + 1) * LATTICE_COLS + c0 + 1; wts[3] = fr * fc;
}

function tailWeights(s: number, idx: number[], wts: number[]): void {
  const f = Math.min(TAIL_BONES - 1 - 1e-6, Math.max(0, s * (TAIL_BONES - 1)));
  const j = Math.floor(f), t = f - j;
  idx[0] = TAIL_BASE + j; wts[0] = 1 - t;
  idx[1] = TAIL_BASE + j + 1; wts[1] = t;
  idx[2] = 0; wts[2] = 0;
  idx[3] = 0; wts[3] = 0;
}

/**
 * accumulates a skinned mesh: positions, the plan coordinates the skin shader reads (disc: x, z, side ±1 / 0 on the
 * margin, the outline's half-width there; tail: s, angle, 2, 0), skin indices and weights
 */
class Builder {
  pos: number[] = [];
  plan: number[] = [];
  col: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  /** triangle indices per material */
  private readonly lists: number[][] = [[]];
  private cur = 0;
  morph: number[][] = [];
  /** mirror the winding (parts built in a mirrored frame) */
  flip = false;
  private readonly ti = [0, 0, 0, 0];
  private readonly tw = [0, 0, 0, 0];
  get count(): number { return this.pos.length / 3; }
  /** a vertex weighted to the disc lattice at its bind-pose (x, z) */
  disc(x: number, y: number, z: number, side: number, colour?: [number, number, number]): number {
    latticeWeights(x, z, this.ti, this.tw);
    return this.push(x, y, z, x, z, side, halfWidth(Math.min(MORPH.zSnout, Math.max(MORPH.zEnd, z))), colour);
  }
  /** a vertex weighted to the tail bones at arc length s */
  tail(x: number, y: number, z: number, s: number, around: number, colour?: [number, number, number]): number {
    tailWeights(s, this.ti, this.tw);
    return this.push(x, y, z, s, around, 2, 0, colour);
  }
  private push(x: number, y: number, z: number, p0: number, p1: number, p2: number, p3: number, colour?: [number, number, number]): number {
    this.pos.push(x, y, z);
    this.plan.push(p0, p1, p2, p3);
    if (colour) this.col.push(colour[0], colour[1], colour[2]);
    this.si.push(this.ti[0], this.ti[1], this.ti[2], this.ti[3]);
    const s = this.tw[0] + this.tw[1] + this.tw[2] + this.tw[3] || 1;
    this.sw.push(this.tw[0] / s, this.tw[1] / s, this.tw[2] / s, this.tw[3] / s);
    return this.count - 1;
  }
  quad(a: number, b: number, c: number, d: number): void { this.tri(a, b, c); this.tri(a, c, d); }
  tri(a: number, b: number, c: number): void { if (this.flip) this.lists[this.cur].push(a, c, b); else this.lists[this.cur].push(a, b, c); }
  /** the material the following triangles use */
  group(mat: number): void { this.cur = mat; while (this.lists.length <= mat) this.lists.push([]); }
  build(normals = true): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aPlan', new Float32BufferAttribute(this.plan, 4));
    if (this.col.length) g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.lists.flat());
    if (this.lists.length > 1) {
      let start = 0;
      this.lists.forEach((l, mat) => { if (l.length) g.addGroup(start, l.length, mat); start += l.length; });
    }
    if (normals) g.computeVertexNormals();
    if (this.morph.length) {
      g.morphAttributes.position = this.morph.map((m, i) => { const a = new Float32BufferAttribute(m, 3); a.name = `m${i}`; return a; });
      g.morphTargetsRelative = true;
    }
    return g;
  }
}

/** n + 1 values from 0 to 1 spaced inversely to `density` (more where it is higher) */
function spread(n: number, density: (t: number) => number): number[] {
  const M = 2000, cum = [0];
  for (let i = 1; i <= M; i++) cum.push(cum[i - 1] + density((i - 0.5) / M));
  const total = cum[M], out: number[] = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * total;
    while (j < M && cum[j + 1] < target) j++;
    const f = j < M ? (target - cum[j]) / Math.max(1e-12, cum[j + 1] - cum[j]) : 0;
    out.push(Math.min(1, (j + f) / M));
  }
  out[0] = 0; out[n] = 1;
  return out;
}

/**
 * The disc: one closed shell. Each station is a loop across the dorsal surface from the left margin to the right and
 * back under the ventral surface, so the margin vertex is shared (its normal points out, which gives the thin rim its
 * light). Stations crowd a little at the snout and much more over the eye–spiracle complex; across, they crowd toward
 * the margin where the wave is largest and over the complex.
 */
function buildDisc(spec: LodSpec): BufferGeometry {
  const b = new Builder();
  const M = MORPH, NZ = spec.rows, NU = spec.across;
  // across: crowded toward the margin (where the wave is largest) and, on the detailed tiers, over the eye–spiracle
  // complex too, whose lips and rims are narrower than the rest of the disc needs
  const across = spread(NU, (u) => 1 + 2.2 * u * u * u + (spec.details ? 2.4 * Math.exp(-(((u - 0.3) / 0.12) ** 2)) : 0));
  // u from -1 (the animal's right, -X) over the back to +1 and back under the belly
  const loopU: { u: number; side: number }[] = [];
  for (let k = NU; k >= 1; k--) loopU.push({ u: -across[k], side: 1 });
  loopU.push({ u: 0, side: 1 });
  for (let k = 1; k <= NU; k++) loopU.push({ u: across[k], side: k === NU ? 0 : 1 });
  for (let k = NU - 1; k >= 1; k--) loopU.push({ u: across[k], side: -1 });
  loopU.push({ u: 0, side: -1 });
  for (let k = 1; k < NU; k++) loopU.push({ u: -across[k], side: -1 });
  loopU[0].side = 0;
  const ring = loopU.length;
  const z0 = M.zSnout - 0.0016, z1 = M.zEnd;
  const rows: number[] = [];
  // stations: a little closer at the snout, and much closer over the eyes and spiracles on the detailed tiers
  const along = spread(NZ, (t) => {
    const z = z0 - (z0 - z1) * t;
    return 1.3 - 0.3 * t + (spec.details ? 3.2 * Math.exp(-(((z - 0.24) / 0.055) ** 2)) : 0);
  });
  for (let r = 0; r <= NZ; r++) {
    const z = z0 - (z0 - z1) * along[r];
    const w = halfWidth(z);
    rows.push(b.count);
    for (const { u, side } of loopU) {
      const x = u * w;
      const y = side > 0 ? dorsalHeight(x, z) : side < 0 ? -ventralDepth(x, z) : 0;
      b.disc(x, y, z, side === 0 ? 0.0001 : side);
    }
  }
  for (let r = 0; r < NZ; r++) {
    const a = rows[r], c = rows[r + 1];
    for (let k = 0; k < ring; k++) {
      const k1 = (k + 1) % ring;
      b.quad(a + k, a + k1, c + k1, c + k);
    }
  }
  // the snout tip and the hidden cap inside the tail base
  const tip = b.disc(0, 0.0005, M.zSnout, 1);
  for (let k = 0; k < ring; k++) b.tri(tip, rows[0] + ((k + 1) % ring), rows[0] + k);
  const zc = z1;
  const end = b.disc(0, (dorsalHeight(0, zc) - ventralDepth(0, zc)) / 2, zc - 0.001, 1);
  const last = rows[NZ];
  for (let k = 0; k < ring; k++) b.tri(end, last + k, last + ((k + 1) % ring));
  return b.build();
}

/**
 * The tail: a tube along -Z from inside the trunk to the whip's tip. Depressed at the base, round further back, with a
 * skin fold underneath and a low keel on top behind the sting. Vertices at exactly the top and bottom carry the keel and
 * the fold so they stay sharp.
 */
function buildTail(spec: LodSpec): BufferGeometry {
  const b = new Builder();
  const N = spec.tailRings, S = Math.max(4, spec.tailSides);
  const s0 = -(MORPH.tailStart - MORPH.zEnd) / MORPH.tailLength;
  const angles: number[] = [];
  for (let k = 0; k < S; k++) angles.push(-Math.PI / 2 + (2 * Math.PI * k) / S);
  if (S % 2 === 1) angles.push(Math.PI / 2), angles.sort((p, q) => p - q);
  const R = angles.length;
  const rings: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // denser around the base and the sting, where the shape changes
    const s = s0 + (1 - s0) * (0.7 * t + 0.3 * t * t);
    const { a, c } = tailSection(s);
    const { fold, keel } = tailFins(s);
    const y0 = tailAxisY(Math.max(0, s)), z = tailZ(s);
    rings.push(b.count);
    for (let k = 0; k < R; k++) {
      const th = angles[k];
      let x = a * Math.cos(th), y = c * Math.sin(th);
      // flat-bottomed at the base like the trunk it leaves
      if (y < 0) y *= 0.75 + 0.25 * Math.min(1, Math.max(0, s * 4));
      const dDown = Math.abs(th + Math.PI / 2), dUp = Math.abs(th - Math.PI / 2);
      y -= fold * Math.exp(-((dDown / 0.2) ** 2));
      y += keel * Math.exp(-((dUp / 0.2) ** 2));
      if (fold > 0 && dDown < 0.9) x *= 1 - 0.35 * Math.min(1, fold / 0.006) * Math.exp(-((dDown / 0.5) ** 2));
      b.tail(x, y0 + y, z, s, th);
    }
  }
  for (let i = 0; i < N; i++) {
    const p = rings[i], q = rings[i + 1];
    for (let k = 0; k < R; k++) {
      const k1 = (k + 1) % R;
      b.quad(p + k, q + k, q + k1, p + k1);
    }
  }
  const tipZ = tailZ(1) - 0.004;
  const tip = b.tail(0, tailAxisY(1), tipZ, 1, 0);
  const last = rings[N];
  for (let k = 0; k < R; k++) b.tri(last + ((k + 1) % R), last + k, tip);
  return b.build();
}

/**
 * The sting: a flat, tapering blade with saw-teeth along both edges pointing back toward its base, a groove along the
 * top, lying on the tail and lifted a little at its tip. Plus the few spear-shaped thorns on the midline in front of it.
 * Vertex colours: ivory dentine, browner where the skin sheath still covers the base.
 */
function buildSting(spec: LodSpec): BufferGeometry {
  const b = new Builder();
  const St = MORPH.sting;
  const NL = spec.details ? 64 : 20, NW = spec.details ? 6 : 3;
  const sBase = St.s;
  const { c: cBase } = tailSection(sBase);
  const yBase = tailAxisY(sBase) + cBase * 0.92;
  const zBase = tailZ(sBase);
  const lift = St.lift;
  const colour = (t: number, v: number): [number, number, number] => {
    const sheath = 1 - Math.min(1, Math.max(0, (t - 0.05) / 0.2));
    const ivory: [number, number, number] = [0.66, 0.62, 0.53];
    const skin: [number, number, number] = [0.2, 0.17, 0.12];
    const k = sheath * 0.85;
    const edge = 0.9 + 0.1 * (1 - Math.abs(v));
    return [(ivory[0] * (1 - k) + skin[0] * k) * edge, (ivory[1] * (1 - k) + skin[1] * k) * edge, (ivory[2] * (1 - k) + skin[2] * k) * edge];
  };
  const halfW = (t: number): number => {
    const taper = St.halfW * Math.pow(1 - t, 0.75) * Math.min(1, 0.55 + t * 8);
    if (!spec.details) return taper;
    // saw-teeth: each period widens backward then drops, so the points face the base
    const ph = (t * St.teeth) % 1;
    const tooth = t > 0.18 && t < 0.97 ? 0.28 * ph * ph : 0;
    return taper * (1 + tooth);
  };
  const top: number[][] = [], bot: number[][] = [];
  for (let i = 0; i <= NL; i++) {
    const t = i / NL;
    const len = t * St.len;
    const zz = zBase - len * Math.cos(lift);
    const s = (MORPH.zEnd - zz) / MORPH.tailLength;
    const yy = yBase + len * Math.sin(lift) * Math.pow(t, 0.6);
    const hw = halfW(t), ht = St.halfT * Math.pow(1 - t, 0.5) + 0.0002;
    const tr: number[] = [], br: number[] = [];
    for (let j = 0; j <= NW; j++) {
      const v = -1 + (2 * j) / NW;
      const groove = 1 - 0.35 * Math.exp(-(v * v) / 0.06);
      const yTop = yy + ht * Math.sqrt(Math.max(0, 1 - v * v)) * groove;
      const yBot = yy - ht * 0.7 * Math.sqrt(Math.max(0, 1 - v * v));
      tr.push(b.tail(v * hw, yTop, zz, s, Math.PI / 2, colour(t, v)));
      br.push(b.tail(v * hw, yBot, zz, s, Math.PI / 2, colour(t, v)));
    }
    top.push(tr); bot.push(br);
  }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NW; j++) {
    b.quad(top[i][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]);
    b.quad(bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1]);
  }
  // close the edges
  for (let i = 0; i < NL; i++) {
    b.quad(top[i][0], top[i + 1][0], bot[i + 1][0], bot[i][0]);
    b.quad(top[i][NW], bot[i][NW], bot[i + 1][NW], top[i + 1][NW]);
  }
  if (spec.details) {
    // thorns: small cones leaning back on the midline
    for (const ts of MORPH.thorns) {
      const { c } = tailSection(ts);
      const y = tailAxisY(ts) + c * 0.9, z = tailZ(ts);
      const h = 0.006, r = 0.0028, n = 6;
      const tip = b.tail(0, y + h, z - 0.004, ts, Math.PI / 2, [0.5, 0.46, 0.38]);
      const ring: number[] = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        ring.push(b.tail(Math.cos(a) * r, y - 0.0008, z + Math.sin(a) * r * 1.6, ts, Math.PI / 2, [0.3, 0.26, 0.2]));
      }
      for (let k = 0; k < n; k++) b.tri(ring[k], tip, ring[(k + 1) % n]);
    }
  }
  return b.build();
}

/**
 * An eye: the cornea's dark dome, a little almond-shaped (longer along the body) and lower than it is wide, sunk in its
 * socket so about half shows, bulging up and out through the raised lip [PHOTO 005, 006, 011, 027]. uv.y runs from the
 * apex (1) down the dome.
 */
function buildEye(spec: LodSpec, sideX: number): BufferGeometry {
  const E = MORPH.eye;
  const seg = spec.eyeSeg;
  // nearly a whole ball: its open lower edge stays deep under the skin of the socket
  const sph = new SphereGeometry(E.r, seg, Math.max(5, Math.round(seg * 0.75)), 0, Math.PI * 2, 0, Math.PI * 0.9);
  // shape in the eye's own frame (y = its axis): flattened along the axis, drawn out along the body
  sph.applyMatrix4(new Matrix4().makeScale(1, E.flat, E.long));
  const gaze = new Vector3(E.gaze[0] * sideX, E.gaze[1], E.gaze[2]).normalize();
  // turn the axis to the gaze, keeping the long axis along the body
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), gaze);
  const x = E.x * sideX, z = E.z;
  const c = new Vector3(x, dorsalHeight(x, z) - E.r * E.sunk, z);
  sph.applyMatrix4(new Matrix4().compose(c, q, new Vector3(1, 1, 1)));
  const b = new Builder();
  const p = sph.getAttribute('position'), uv = sph.getAttribute('uv');
  for (let i = 0; i < p.count; i++) b.disc(p.getX(i), p.getY(i), p.getZ(i), 1);
  const idx = sph.getIndex()!;
  for (let i = 0; i < idx.count; i += 3) b.tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  const g = b.build(false);
  g.setAttribute('normal', sph.getAttribute('normal'));
  g.setAttribute('uv', uv);
  sph.dispose();
  return g;
}

/** spiracle-local frame: su across (out), sv along (forward), both in the margin plane */
function spiracleFrame(sideX: number): { cx: number; cz: number; ux: [number, number]; vx: [number, number] } {
  const S = MORPH.spiracle;
  const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
  // the slit points back and a little outward
  return { cx: S.x * sideX, cz: S.z, ux: [cy * sideX, -sy], vx: [sy * sideX, cy] };
}

/**
 * A spiracle: the dark opening sunk in its hollow behind the eye (material 1) and the valve that shuts it (material 0,
 * skin). Morph target 0 opens the valve: it draws back against its hinge on the outer wall.
 */
function buildSpiracle(spec: LodSpec, sideX: number): BufferGeometry {
  const S = MORPH.spiracle;
  const b = new Builder();
  b.flip = sideX < 0;
  const f = spiracleFrame(sideX);
  const NR = spec.details ? 7 : 3, NA = spec.details ? 24 : 10;
  const at = (du: number, dv: number): [number, number] => [f.cx + f.ux[0] * du + f.vx[0] * dv, f.cz + f.ux[1] * du + f.vx[1] * dv];
  const open: number[] = [];
  // the opening: a dark floor and a short wall down into the head
  b.group(1);
  const centre = (() => { const [x, z] = at(0, 0); return b.disc(x, dorsalHeight(x, z) + 0.0005, z, 1, [0.025, 0.012, 0.012]); })();
  open.push(0, 0, 0);
  const rings: number[][] = [];
  for (let r = 1; r <= NR; r++) {
    const d = r / NR;
    const ring: number[] = [];
    for (let k = 0; k < NA; k++) {
      const a = (k / NA) * Math.PI * 2;
      const [x, z] = at(Math.cos(a) * S.rx * 0.82 * d, Math.sin(a) * S.rz * 0.82 * d);
      // nearly black inside, a little warm brown only at the lip [PHOTO 005, 006]
      const shade = 0.018 + 0.1 * Math.pow(d, 4);
      ring.push(b.disc(x, dorsalHeight(x, z) + 0.0005, z, 1, [shade * 0.8, shade * 0.7, shade * 0.6]));
      open.push(0, 0, 0);
    }
    rings.push(ring);
  }
  for (let k = 0; k < NA; k++) b.tri(centre, rings[0][(k + 1) % NA], rings[0][k]);
  for (let r = 0; r < NR - 1; r++) for (let k = 0; k < NA; k++) {
    const k1 = (k + 1) % NA;
    b.quad(rings[r][k], rings[r][k1], rings[r + 1][k1], rings[r + 1][k]);
  }
  // the valve: a pale flap hinged on the outer wall that closes all but a dark crescent slit next to the eye
  // [PHOTO 011, 027]; open, it draws back toward its hinge
  b.group(0);
  const NV = spec.details ? 6 : 2, NVa = spec.details ? 12 : 5;
  const hingeU = S.rx * 0.84;
  const flap: number[][] = [];
  const open0 = new Vector3();
  for (let i = 0; i <= NV; i++) {
    const t = i / NV; // 0 at the hinge (outer wall) … 1 at the free edge (toward the eye)
    const row: number[] = [];
    const du = hingeU - t * S.rx * 1.36;
    const halfAlong = S.rz * 0.86 * Math.sqrt(Math.max(0.05, 1 - (du / (S.rx * 0.86)) ** 2));
    for (let j = 0; j <= NVa; j++) {
      const w = -1 + (2 * j) / NVa;
      const dv = w * halfAlong;
      const [x, z] = at(du, dv);
      const y = dorsalHeight(x, z) + 0.0011 + 0.0012 * Math.sin(Math.PI * t * 0.8);
      row.push(b.disc(x, y, z, 1));
      const [hx, hz] = at(hingeU, dv * 0.95);
      open0.set(hx + (x - hx) * 0.3, y + 0.0015 * t, hz + (z - hz) * 0.3);
      open.push(open0.x - x, open0.y - y, open0.z - z);
    }
    flap.push(row);
  }
  for (let i = 0; i < NV; i++) for (let j = 0; j < NVa; j++) b.quad(flap[i][j], flap[i + 1][j], flap[i + 1][j + 1], flap[i][j + 1]);
  b.morph.push(open);
  return b.build();
}

/**
 * The ventral face of the head: mouth, nostrils and nasal curtain, and five pairs of gill slits, as thin relief laid on
 * the belly. Material 0 is the skin (lips, the curtain, the rims of the slits), material 1 the dark interior of the
 * openings. Morph 0 opens the mouth (the slit widens and its lips part), morph 1 flares the gill slits.
 */
function buildMouth(spec: LodSpec): BufferGeometry {
  const b = new Builder();
  const M = MORPH;
  const mouthOpen: number[] = [], gillOpen: number[] = [];
  const vy = (x: number, z: number): number => -ventralDepth(x, z) - 0.0004;
  const push = (o: [number, number, number], g: [number, number, number]): void => { mouthOpen.push(...o); gillOpen.push(...g); };
  const fine = spec.details;

  /** a slit along a path: interior strip (mat 1) between two raised lips (mat 0) */
  const slit = (path: (t: number) => [number, number], n: number, halfOpen: number, flare: number, lipW: number, which: 'mouth' | 'gill' | 'nose') => {
    // tangent-normal offset in plan
    const pts: { x: number; z: number; nx: number; nz: number; t: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const [x, z] = path(t);
      const [x2, z2] = path(Math.min(1, t + 1e-3));
      const [x1, z1] = path(Math.max(0, t - 1e-3));
      const tx = x2 - x1, tz = z2 - z1, l = Math.hypot(tx, tz) || 1;
      pts.push({ x, z, nx: -tz / l, nz: tx / l, t });
    }
    const env = (t: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.6;
    b.group(1);
    const inner: number[][] = [];
    for (const p of pts) {
      const e = env(p.t);
      const row: number[] = [];
      for (const side of [-1, 0, 1]) {
        const off = side * halfOpen * e;
        const x = p.x + p.nx * off, z = p.z + p.nz * off;
        const depth = side === 0 ? 0.0035 : 0.0012;
        const shade = side === 0 ? 0.035 : 0.12;
        row.push(b.disc(x, vy(x, z) + depth, z, -1, [shade * 1.1, shade * 0.6, shade * 0.6]));
        const o = side * e;
        const m: [number, number, number] = which === 'mouth' ? [p.nx * o * flare, side === 0 ? 0.004 * e : 0.0015 * e, p.nz * o * flare] : [0, 0, 0];
        const g: [number, number, number] = which === 'gill' ? [p.nx * o * flare, 0, p.nz * o * flare] : [0, 0, 0];
        push(m, g);
      }
      inner.push(row);
    }
    for (let i = 0; i < n; i++) {
      b.quad(inner[i][0], inner[i + 1][0], inner[i + 1][1], inner[i][1]);
      b.quad(inner[i][1], inner[i + 1][1], inner[i + 1][2], inner[i][2]);
    }
    b.group(0);
    for (const side of [-1, 1]) {
      const lip: number[][] = [];
      for (const p of pts) {
        const e = env(p.t);
        const row: number[] = [];
        for (const k of [0, 0.5, 1]) {
          const off = side * (halfOpen * e + lipW * k);
          const x = p.x + p.nx * off, z = p.z + p.nz * off;
          const bulge = k === 0.5 ? 0.0012 * e : k === 0 ? 0.0004 * e : -0.0004;
          row.push(b.disc(x, vy(x, z) - bulge, z, -1));
          const o = side * e * (1 - k * 0.6);
          const m: [number, number, number] = which === 'mouth' ? [p.nx * o * flare, 0.001 * e * (1 - k), p.nz * o * flare] : [0, 0, 0];
          const g: [number, number, number] = which === 'gill' ? [p.nx * o * flare, 0, p.nz * o * flare] : [0, 0, 0];
          push(m, g);
        }
        lip.push(row);
      }
      for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
        if (side > 0) b.quad(lip[i][k], lip[i + 1][k], lip[i + 1][k + 1], lip[i][k + 1]);
        else b.quad(lip[i][k], lip[i][k + 1], lip[i + 1][k + 1], lip[i + 1][k]);
      }
    }
  };

  // mouth: a transverse slit, arched forward in the middle
  const Mo = M.mouth;
  slit((t) => { const x = -Mo.halfW + 2 * Mo.halfW * t; return [x, Mo.z + Mo.arch * (1 - (x / Mo.halfW) ** 2)]; }, fine ? 22 : 8, 0.0024, 0.007, 0.004, 'mouth');
  // nostrils: oblique slits running forward and out from the mouth's corners
  const Na = M.nostril;
  for (const sx of [-1, 1]) {
    slit((t) => [sx * (Na.x - 0.008 + 0.018 * t), Na.z - Na.len * 0.45 + Na.len * t * 0.9], fine ? 8 : 3, 0.0018, 0, 0.0026, 'nose');
  }
  if (fine) {
    // the nasal curtain: a broad skirt between the nostrils hanging over the upper jaw, its rear edge finely fringed
    b.group(0);
    const NX = 14, NZc = 5, zFront = Na.z + 0.01, zBack = Mo.z + 0.004;
    const rows: number[][] = [];
    for (let i = 0; i <= NZc; i++) {
      const t = i / NZc;
      const row: number[] = [];
      for (let j = 0; j <= NX; j++) {
        const x = -0.028 + (0.056 * j) / NX;
        let z = zFront + (zBack - zFront) * t;
        if (i === NZc) z -= 0.0012 * (j % 2);
        const y = vy(x, z) - 0.0011 * Math.sin(Math.PI * t) - 0.0006;
        row.push(b.disc(x, y, z, -1));
        push([0, 0.0012 * t, -0.0015 * t], [0, 0, 0]);
      }
      rows.push(row);
    }
    for (let i = 0; i < NZc; i++) for (let j = 0; j < NX; j++) b.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  }
  // gill slits: five pairs, short S-curves, in arcs that converge toward the rear
  for (const sx of [-1, 1]) {
    for (const G of M.gills) {
      const ca = Math.cos(G.ang), sa = Math.sin(G.ang);
      slit((t) => {
        const a = (t - 0.5) * G.len;
        const bend = 0.003 * Math.sin((t - 0.5) * Math.PI);
        return [sx * (G.x + a * ca - bend * sa), G.z + a * sa * -1 + bend * ca];
      }, fine ? 10 : 4, 0.0015, 0.0022, 0.0026, 'gill');
    }
  }
  b.morph.push(mouthOpen, gillOpen);
  return b.build();
}

export interface AkaeiGeometries {
  disc: BufferGeometry;
  tail: BufferGeometry;
  sting: BufferGeometry;
  eyeL: BufferGeometry;
  eyeR: BufferGeometry;
  spiracleL: BufferGeometry | null;
  spiracleR: BufferGeometry | null;
  mouth: BufferGeometry | null;
}

const cache = new Map<Lod, AkaeiGeometries>();

/** the shared geometry of one LOD (built on first use) */
export function akaeiGeometries(lod: Lod): AkaeiGeometries {
  let g = cache.get(lod);
  if (g) return g;
  const spec = LOD_SPEC[lod];
  g = {
    disc: buildDisc(spec),
    tail: buildTail(spec),
    sting: buildSting(spec),
    eyeL: buildEye(spec, 1),
    eyeR: buildEye(spec, -1),
    spiracleL: lod < 2 ? buildSpiracle(spec, 1) : null,
    spiracleR: lod < 2 ? buildSpiracle(spec, -1) : null,
    mouth: lod < 2 ? buildMouth(spec) : null,
  };
  for (const geo of Object.values(g)) if (geo) geo.userData.shared = true;
  cache.set(lod, g);
  return g;
}

export function triangleCount(g: AkaeiGeometries): number {
  let n = 0;
  for (const geo of Object.values(g)) if (geo) n += (geo.getIndex()?.count ?? 0) / 3;
  return n;
}
