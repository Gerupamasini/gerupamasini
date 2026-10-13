import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CARRY_TILT, FOOT, HEAD, MODEL_SH, OPERCULUM, carryRotation } from './anatomy';
import { LANDMARKS, apertureOutline, lowestY } from './shell';

/**
 * The soft parts: the foot, the head and neck (SoftBody), the tentacles with their eyes, the siphon, the proboscis and
 * the operculum. Each is built once in a rest pose (animal frame, metres at the model size) and moved on the GPU:
 * a part's matrix and four numbers per part (the tubes' length, bend and wobble), the foot's rhythm (its front
 * reaching out and lifting, its hind part hauling up, faint waves along the margin, the bend of a turn, the plough of
 * a burrow) and the withdrawal (each part drawn into the aperture in turn, the foot folding, the operculum last).
 *
 * Attribute aSoft: x the part (0 foot, 1 head and neck, 2/3 the left/right tentacle, 4 siphon, 5 proboscis,
 * 6 operculum); for the tubes y along (0 base → 1 tip), z round; for the foot y along (0 front → 1 tail), z up
 * (0 sole → 1 back), w out (0 middle → 1 margin); for the head y the head's share (it moves with the head), z the
 * shell's share (the neck's top moves with the shell), w thickness; −1 in w marks the eyes.
 */

export const PART = { foot: 0, head: 1, tentacleL: 2, tentacleR: 3, siphon: 4, proboscis: 5, operculum: 6 } as const;
export const PART_NAMES = ['Foot', 'SoftBody', 'Tentacle_L', 'Tentacle_R', 'Siphon', 'Proboscis', 'Operculum'] as const;
export type SoftLod = 0 | 1;

const SH = MODEL_SH;
const L_FOOT = FOOT.length * SH;

// ------------------------------------------------------------------ the rest pose (animal frame)

/** the shell's height of the foot under the aperture: the lip clears the foot's back by this much (SH) */
const LIP_CLEAR = 0.035;
/** where along the foot the aperture's centre sits (SH, + forward) */
const APERTURE_Z = -0.03;

export interface Rest {
  /** shell frame → animal frame as the shell is carried */
  shellM: Matrix4;
  aperture: Vector3;
  canal: Vector3;
  /** the head's pivot (at the neck), the mouth under the head's front */
  headPivot: Vector3;
  mouth: Vector3;
  /** each tentacle's base and its rest direction (yaw out from the midline, pitch up) */
  tentacle: { base: Vector3; yaw: number; pitch: number }[];
  /** the siphon's base (at the canal, shell frame) and its rest direction (yaw, pitch) in the animal frame */
  siphonBase: Vector3;
  siphonYaw: number;
  siphonPitch: number;
  /** the operculum on the back of the foot; closing the aperture (shell frame) */
  opercFoot: Matrix4;
  opercShut: Matrix4;
  /** the foot's back (height of its upper surface, SH) */
  footTop: number;
}

function footHalfWidth(z: number): number {
  // (SH) the propodium broad and square in front, tapering to the tail
  const t = (FOOT.front - z) / FOOT.length; // 0 front → 1 tail
  if (t < 0) return 0;
  const w = FOOT.width / 2;
  return w * (t < 0.12 ? 0.92 + 0.08 * Math.sin((t / 0.12) * Math.PI * 0.5) : Math.pow(Math.max(0, 1 - (t - 0.12) / 0.88), 0.85) * (1 - 0.15 * (t - 0.12)));
}

/** height of the foot's back at (x, z) (SH) */
export function footTopAt(x: number, z: number): number {
  const hw = footHalfWidth(z);
  if (hw <= 0) return 0;
  const r = Math.min(1, Math.abs(x) / hw);
  const along = 1 - Math.pow(Math.abs(z + 0.05) / 0.66, 2);
  return FOOT.edge + (FOOT.thick - FOOT.edge) * Math.max(0, along) * Math.sqrt(Math.max(0, 1 - r * r));
}

export const REST: Rest = (() => {
  const R = carryRotation(CARRY_TILT);
  const ap = LANDMARKS.aperture.clone().applyMatrix4(R);
  // the lowest point of the lip, carried: set it just over the foot's back
  const lip = apertureOutline(48).map((p) => p.clone().applyMatrix4(R));
  let low = Infinity;
  for (const p of lip) low = Math.min(low, p.y);
  const shellM = R.clone();
  const top = footTopAt(0, APERTURE_Z) * SH;
  const ty = top + LIP_CLEAR * SH - low;
  shellM.setPosition(-ap.x, ty, APERTURE_Z * SH - ap.z);
  const aperture = LANDMARKS.aperture.clone().applyMatrix4(shellM);
  const canal = LANDMARKS.canal.clone().applyMatrix4(shellM);
  // the head comes out under the front of the aperture, a flat lobe over the propodium
  const headPivot = new Vector3(0, top + 0.01 * SH, aperture.z + 0.05 * SH);
  const front = canal.z - 0.02 * SH;
  const mouth = new Vector3(0, top + 0.035 * SH, front + 0.08 * SH);
  const tentacle = [1, -1].map((side) => ({
    base: new Vector3(side * 0.085 * SH, top + 0.075 * SH, front + 0.035 * SH), yaw: side * 0.62, pitch: 0.22,
  }));
  // the siphon from the canal, held forward and up, a little to the left of the midline
  const siphonBase = LANDMARKS.canal.clone();
  // the operculum rides on the back of the foot behind the shell
  const opercFoot = new Matrix4().compose(
    new Vector3(0.01 * SH, footTopAt(0, -0.24) * SH + 0.004 * SH, -0.24 * SH),
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.32),
    new Vector3(1, 1, 1),
  );
  // shut: in the aperture's plane (shell frame: the plane z = 0, facing +z), a little inside the lip
  const opercShut = new Matrix4().compose(
    LANDMARKS.aperture.clone().add(new Vector3(-0.004 * SH, 0.004 * SH, -0.05 * SH)),
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2).premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.45)),
    new Vector3(1, 1, 1),
  );
  return {
    shellM, aperture, canal, headPivot, mouth, tentacle, siphonBase, siphonYaw: 0.06, siphonPitch: 0.62,
    opercFoot, opercShut, footTop: top / SH,
  };
})();

/** how high the shell's lowest point is over the ground in the rest pose (m) */
export const REST_SHELL_LOW = lowestY(REST.shellM);

// ------------------------------------------------------------------ geometry

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  att: number[] = [];
  idx: number[] = [];
  add(x: number, y: number, z: number, nx: number, ny: number, nz: number, a: number, b: number, c: number, d: number): number {
    this.pos.push(x, y, z);
    const l = Math.hypot(nx, ny, nz) || 1;
    this.nrm.push(nx / l, ny / l, nz / l);
    this.att.push(a, b, c, d);
    return this.pos.length / 3 - 1;
  }
  get count(): number { return this.pos.length / 3; }
  grid(base: number, rows: number, cols: number, closed: boolean, flip = false): void {
    const cc = closed ? cols : cols - 1;
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cc; j++) {
      const a = base + i * cols + j, b = base + i * cols + ((j + 1) % cols), c = a + cols, d = b + cols;
      if (flip) this.idx.push(a, c, b, b, c, d);
      else this.idx.push(a, b, c, b, d, c);
    }
  }
  /** turn every triangle to face the way its vertices' normals do (the parts are built in many pieces) */
  private orient(): void {
    const P = this.pos, N = this.nrm, I = this.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const nx = N[a] + N[b] + N[c], ny = N[a + 1] + N[b + 1] + N[c + 1], nz = N[a + 2] + N[b + 2] + N[c + 2];
      if (fx * nx + fy * ny + fz * nz < 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
    }
  }
  build(name: string): BufferGeometry {
    this.orient();
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aSoft', new Float32BufferAttribute(this.att, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.name = name;
    return g;
  }
}

/** the foot's outline (SH, x ≥ 0 half, front to tail): the anterior horns, the tapering metapodium, the two tails */
const FOOT_OUTLINE: readonly [number, number][] = [
  [0.0, 0.575], [0.09, 0.598], [0.2, 0.604], [0.29, 0.59], [0.345, 0.6], [0.372, 0.618],
  [0.365, 0.55], [0.34, 0.44], [0.31, 0.27], [0.278, 0.1], [0.24, -0.065], [0.195, -0.21],
  [0.145, -0.33], [0.098, -0.42], [0.062, -0.47], [0.052, -0.5], [0.034, -0.58], [0.021, -0.59], [0.014, -0.515], [0.0, -0.505],
];

function outline(n: number): [number, number][] {
  // the closed outline (left half mirrored), resampled evenly by arc length
  const half = FOOT_OUTLINE;
  const pts: [number, number][] = [...half.map(([x, z]) => [x, z] as [number, number]), ...half.slice(1, -1).reverse().map(([x, z]) => [-x, z] as [number, number])];
  const seg: number[] = [0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    seg.push(seg[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = seg[pts.length];
  const out: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * total;
    while (seg[j + 1] < t) j++;
    const a = pts[j], b = pts[(j + 1) % pts.length], f = (t - seg[j]) / Math.max(1e-9, seg[j + 1] - seg[j]);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** the foot: a flat sole, a rounded margin, a domed back */
function buildFoot(b: Builder, n: number, rings: number, rim: number): void {
  const out = outline(n);
  const C = [0, -0.04];
  const re = FOOT.edge / 2;
  // outward normals of the outline
  const nor = out.map((p, i) => {
    const a = out[(i - 1 + n) % n], c = out[(i + 1) % n];
    const tx = c[0] - a[0], tz = c[1] - a[1];
    // the outline runs clockwise seen from above (front, right side… ): outward is (tz, −tx) or its opposite
    let nx = tz, nz = -tx;
    if (nx * (p[0] - C[0]) + nz * (p[1] - C[1]) < 0) { nx = -nx; nz = -nz; }
    const l = Math.hypot(nx, nz) || 1;
    return [nx / l, nz / l];
  });
  const along = (z: number) => Math.max(0, Math.min(1, (FOOT.front - z) / FOOT.length));
  const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number, up: number, outw: number) =>
    b.add(x * SH, y * SH, z * SH, nx, ny, nz, PART.foot, along(z), up, outw);
  // sole: from the middle out to the inset edge
  let base = b.count;
  for (let r = 0; r <= rings; r++) {
    const k = r / rings; // 0 middle → 1 edge
    for (let j = 0; j < n; j++) {
      const p = out[j], q = nor[j];
      const x = C[0] + (p[0] - C[0]) * k - q[0] * re * k, z = C[1] + (p[1] - C[1]) * k - q[1] * re * k;
      put(x, 0, z, 0, -1, 0, 0, k * 0.9);
    }
  }
  b.grid(base, rings + 1, n, true, true);
  // the margin: a half-round from the sole up to the back
  base = b.count;
  for (let r = 0; r <= rim; r++) {
    const phi = (r / rim) * Math.PI;
    for (let j = 0; j < n; j++) {
      const p = out[j], q = nor[j];
      const cx = p[0] - q[0] * re, cz = p[1] - q[1] * re;
      const s = Math.sin(phi), co = Math.cos(phi);
      put(cx + q[0] * re * s, re - re * co, cz + q[1] * re * s, q[0] * s, -co, q[1] * s, r / rim * 0.3, 0.9 + 0.1 * s);
    }
  }
  b.grid(base, rim + 1, n, true, false);
  // the back: domed toward the middle
  base = b.count;
  for (let r = 0; r <= rings; r++) {
    const k = 1 - r / rings; // 1 edge → 0 middle
    for (let j = 0; j < n; j++) {
      const p = out[j], q = nor[j];
      const x = C[0] + (p[0] - C[0]) * k - q[0] * re * k, z = C[1] + (p[1] - C[1]) * k - q[1] * re * k;
      const y = Math.max(2 * re, footTopAt(x, z));
      // the normal from the dome's slope
      const e = 0.01;
      const dx = (footTopAt(x + e, z) - footTopAt(x - e, z)) / (2 * e), dz = (footTopAt(x, z + e) - footTopAt(x, z - e)) / (2 * e);
      put(x, y, z, -dx, 1, -dz, 0.3 + 0.7 * (1 - k), k * 0.9);
    }
  }
  b.grid(base, rings + 1, n, true, false);
}

/** a tube along +z from the origin: length (SH), radius profile r(u) (SH), with a rounded tip; returns the first vertex */
function buildTube(b: Builder, part: number, len: number, radius: (u: number) => number, rings: number, around: number, cap = true, thickness = 0.5): void {
  const base = b.count;
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const r = radius(u), dr = (radius(Math.min(1, u + 0.01)) - radius(Math.max(0, u - 0.01))) / 0.02 / len;
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      b.add(cx * r * SH, cy * r * SH, u * len * SH, cx, cy, -dr, part, u, j / around, thickness);
    }
  }
  b.grid(base, rings + 1, around, true, false);
  if (cap) {
    // a rounded tip
    const r0 = radius(1);
    const capBase = b.count;
    const steps = Math.max(2, Math.round(around / 4));
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 0.5;
      for (let j = 0; j < around; j++) {
        const a = (j / around) * Math.PI * 2;
        const cx = Math.cos(a) * Math.cos(t), cy = Math.sin(a) * Math.cos(t), cz = Math.sin(t);
        b.add(cx * r0 * SH, cy * r0 * SH, (len + cz * r0) * SH, cx, cy, cz, part, 1, j / around, thickness);
      }
    }
    // stitch the last ring of the tube to the cap rings
    const last = base + rings * around;
    for (let j = 0; j < around; j++) {
      const a = last + j, c = last + ((j + 1) % around), d = capBase + j, e = capBase + ((j + 1) % around);
      b.idx.push(a, c, d, c, e, d);
    }
    b.grid(capBase, steps, around, true, false);
  }
}

/** a small sphere (the eye), riding on a tube at `u` */
function buildEye(b: Builder, part: number, u: number, cx: number, cy: number, cz: number, r: number, seg: number): void {
  const base = b.count;
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI;
    for (let j = 0; j < seg * 2; j++) {
      const ph = (j / (seg * 2)) * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ph), ny = Math.sin(th) * Math.sin(ph), nz = Math.cos(th);
      b.add((cx + nx * r) * SH, (cy + ny * r) * SH, (cz + nz * r) * SH, nx, ny, nz, part, u, 0, -1);
    }
  }
  b.grid(base, seg + 1, seg * 2, true, false);
}

/** an ellipsoid blob (centre, radii in SH), the shares of the head and the shell graded by functions of position */
function buildBlob(b: Builder, c: Vector3, r: Vector3, rows: number, around: number, head: (x: number, y: number, z: number) => number, shell: (x: number, y: number, z: number) => number, thick: number): void {
  const base = b.count;
  for (let i = 0; i <= rows; i++) {
    const th = (i / rows) * Math.PI;
    for (let j = 0; j < around; j++) {
      const ph = (j / around) * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
      const x = c.x + nx * r.x, y = c.y + ny * r.y, z = c.z + nz * r.z;
      b.add(x * SH, y * SH, z * SH, nx / r.x, ny / r.y, nz / r.z, PART.head, head(x, y, z), shell(x, y, z), thick);
    }
  }
  b.grid(base, rows + 1, around, true, false);
}

/** the operculum: an ovate plate with a toothed edge, nucleus near one end (local frame: the plate in xz, y its face) */
function buildOperculum(b: Builder, n: number): void {
  const L = OPERCULUM.length, W = OPERCULUM.width, T = 0.012;
  // ovate, pointed at the anterior end, a fine serration on the margin
  const rim: [number, number][] = [];
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2;
    const ov = 1 + 0.18 * Math.cos(a);
    const tooth = 1 + 0.035 * Math.abs(Math.sin(a * 14));
    rim.push([Math.sin(a) * W * 0.5 * tooth, Math.cos(a) * L * 0.5 * ov * tooth - 0.05 * L]);
  }
  const uv = (j: number): [number, number] => { const a = (j / n) * Math.PI * 2; return [Math.sin(a) * 0.9, Math.cos(a) * 0.9 + 0.3]; };
  for (const side of [1, -1]) {
    const base = b.count;
    b.add(0, side * T * 0.5 * SH, 0, 0, side, 0, PART.operculum, 0, 0.3, 0.3);
    for (let j = 0; j < n; j++) b.add(rim[j][0] * SH, side * T * 0.5 * SH, rim[j][1] * SH, 0, side, 0, PART.operculum, ...uv(j), 0.3);
    for (let j = 0; j < n; j++) b.idx.push(base, base + 1 + j, base + 1 + ((j + 1) % n));
  }
  // the edge
  const base = b.count;
  for (const side of [1, -1]) for (let j = 0; j < n; j++) {
    const p = rim[j], q = rim[(j + 1) % n], o = rim[(j - 1 + n) % n];
    b.add(p[0] * SH, side * T * 0.5 * SH, p[1] * SH, o[1] - q[1], 0, q[0] - o[0], PART.operculum, ...uv(j), 0.3);
  }
  for (let j = 0; j < n; j++) {
    const a = base + j, c = base + ((j + 1) % n), a2 = base + n + j, c2 = base + n + ((j + 1) % n);
    b.idx.push(a, a2, c, c, a2, c2);
  }
}

interface SoftTier { foot: [number, number, number]; tube: [number, number]; blob: [number, number]; eye: number; operc: number }
const SOFT_TIERS: Record<SoftLod, SoftTier> = {
  0: { foot: [88, 9, 6], tube: [26, 10], blob: [14, 22], eye: 5, operc: 40 },
  1: { foot: [36, 3, 3], tube: [7, 5], blob: [6, 9], eye: 2, operc: 12 },
};

function partGeometry(part: number, lod: SoftLod): BufferGeometry {
  const t = SOFT_TIERS[lod];
  const b = new Builder();
  if (part === PART.foot) buildFoot(b, t.foot[0], t.foot[1], t.foot[2]);
  else if (part === PART.head) {
    const top = REST.footTop;
    const ap = REST.aperture.clone().multiplyScalar(1 / SH), hp = REST.headPivot.clone().multiplyScalar(1 / SH), mo = REST.mouth.clone().multiplyScalar(1 / SH);
    const apY = ap.y;
    // the neck: from the foot's back up into the aperture (its top rides with the shell)
    buildBlob(b, new Vector3(0, (top + apY) * 0.5 + 0.01, ap.z - 0.03), new Vector3(0.13, Math.max(0.07, (apY - top) * 0.5 + 0.05), 0.18), t.blob[0], t.blob[1],
      () => 0, (_x, y) => Math.max(0, Math.min(1, (y - top - 0.02) / Math.max(0.02, apY - top))), 0.8);
    // the head: a flat lobe forward under the siphon, the tentacles at its front corners
    const hc = new Vector3(0, top + 0.035, (hp.z + mo.z) * 0.5 + 0.02);
    buildBlob(b, hc, new Vector3(0.12, 0.04, Math.max(0.08, (mo.z - hp.z) * 0.5 + 0.04)), t.blob[0], t.blob[1],
      (_x, _y, z) => Math.max(0, Math.min(1, (z - hp.z) / 0.08)), () => 0, 0.45);
  } else if (part === PART.tentacleL || part === PART.tentacleR) {
    const side = part === PART.tentacleL ? 1 : -1;
    buildTube(b, part, HEAD.tentacle, (u) => (HEAD.tentacleBase + (HEAD.tentacleTip - HEAD.tentacleBase) * Math.pow(u, 0.8)) * 0.5, t.tube[0], Math.max(5, t.tube[1] - 2), true, 0.9);
    // the eye: on the outer side of the base, on a small swelling
    buildEye(b, part, HEAD.eyeAt, side * HEAD.tentacleBase * 0.42, 0.006, HEAD.eyeAt * HEAD.tentacle, HEAD.eyeR, t.eye + 1);
  } else if (part === PART.siphon) {
    buildTube(b, part, HEAD.siphon, (u) => HEAD.siphonR * (1 + (HEAD.siphonFlare - 1) * Math.pow(u, 6)) * (u < 0.04 ? 1.25 - u * 6 : 1), t.tube[0], t.tube[1] + 2, false, 0.55);
    // the open mouth: a short inside
    const base = b.count;
    const around = t.tube[1] + 2;
    for (let i = 0; i <= 2; i++) {
      const u = 1 - i * 0.03;
      const r = HEAD.siphonR * HEAD.siphonFlare * (0.85 - i * 0.1);
      for (let j = 0; j < around; j++) {
        const a = (j / around) * Math.PI * 2;
        b.add(Math.cos(a) * r * SH, Math.sin(a) * r * SH, u * HEAD.siphon * SH, -Math.cos(a), -Math.sin(a), 0, part, u, j / around, 0.55);
      }
    }
    b.grid(base, 3, around, true, false);
  } else if (part === PART.proboscis) {
    buildTube(b, part, HEAD.proboscis, (u) => HEAD.proboscisR * (1 - 0.25 * u), t.tube[0] + 8, t.tube[1], true, 0.7);
  } else if (part === PART.operculum) buildOperculum(b, t.operc);
  return b.build(`Aramushiro${PART_NAMES[part]}${lod}`);
}

const cache = new Map<string, BufferGeometry>();

/** one soft part at the near tier (shared by every individual) */
export function softPartGeometry(part: number): BufferGeometry {
  const k = `p${part}`;
  let g = cache.get(k);
  if (!g) { g = partGeometry(part, 0); cache.set(k, g); }
  return g;
}

/** all the soft parts in one geometry for the middle tier (one draw) */
export function softMergedGeometry(): BufferGeometry {
  let g = cache.get('merged');
  if (!g) {
    g = mergeGeometries(Object.values(PART).map((p) => partGeometry(p, 1)))!;
    g.name = 'AramushiroSoft1';
    cache.set('merged', g);
  }
  return g;
}

/** the far tier's stand-in for the foot: a flat pale oval under the shell (shell frame, `aShell` like the shell's) */
export function farFootGeometry(): BufferGeometry {
  let g = cache.get('far');
  if (!g) {
    const inv = REST.shellM.clone().invert();
    const n = 10;
    const pos: number[] = [], nrm: number[] = [], att: number[] = [], idx: number[] = [];
    const out = outline(n);
    const push = (x: number, y: number, z: number) => {
      const p = new Vector3(x * SH, y * SH, z * SH).applyMatrix4(inv);
      pos.push(p.x, p.y, p.z);
      const nn = new Vector3(0, 1, 0).transformDirection(inv);
      nrm.push(nn.x, nn.y, nn.z);
      att.push(0, 0, 0, 3 + 8);
    };
    push(0, FOOT.thick * 0.8, -0.04);
    for (const [x, z] of out) push(x, FOOT.edge, z);
    for (let j = 0; j < n; j++) idx.push(0, 1 + ((j + 1) % n), 1 + j);
    g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    g.setAttribute('aShell', new Float32BufferAttribute(att, 4));
    g.setIndex(idx);
    cache.set('far', g);
  }
  return g;
}

/** triangle count of the soft parts at a tier */
export function softTriangles(lod: SoftLod): number {
  if (lod === 1) return (softMergedGeometry().index?.count ?? 0) / 3;
  let n = 0;
  for (const p of Object.values(PART)) n += (softPartGeometry(p).index?.count ?? 0) / 3;
  return n;
}

// ------------------------------------------------------------------ the vertex shader

export const SOFT_VERTEX_PARS = /* glsl */ `
attribute vec4 aSoft;
varying vec4 vSoft;
uniform mat4 uPartM[7];
uniform vec4 uPartP[7];
uniform vec4 uFoot;     // x: ripple phase (cycles), y: reach 0..1, z: haul 0..1, w: crawling 0..1
uniform vec4 uFoot2;    // x: turn curvature (1/m), y: dig 0..1, z: front lift (m), w: width (×)
uniform vec4 uRetract;  // x: tentacles and siphon, y: head, z: foot, w: all (operculum shut)
uniform vec3 uAperture;
uniform mat4 uShellM;   // the shell's displacement from its rest carry
uniform float uTime;
float amSmV(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

// a tube along +z bent in a plane: P = (length share, bend over the length (rad), the bend's plane (rad), wobble (rad))
vec3 amTube(vec3 p, inout vec3 n, float u, vec4 P, float L0) {
  float ext = max(P.x, 0.03);
  float L = L0 * ext;
  float l = u * L;
  float bend = P.y + P.w * u * sin(uTime * 2.1 + u * 2.6 + P.z * 3.0);
  float k = bend / max(L, 1e-6);
  float ang = k * l;
  vec3 b = vec3(cos(P.z), sin(P.z), 0.0);
  vec3 z = vec3(0.0, 0.0, 1.0);
  vec3 c = abs(bend) < 1e-3 ? z * l + b * 0.5 * k * l * l : b * (1.0 - cos(ang)) / k + z * sin(ang) / k;
  vec3 T = z * cos(ang) + b * sin(ang);
  vec3 b2 = b * cos(ang) - z * sin(ang);
  // shorter is fatter (the muscle bunches as it contracts)
  // (the cap and the eye stand off the section along the tube)
  vec3 off = vec3(p.xy, p.z - u * L0) * mix(1.7, 1.0, amSmV(0.0, 1.0, ext));
  float ob = dot(off, b);
  vec3 o2 = off - ob * b + ob * b2 + off.z * (T - z);
  float nb = dot(n, b), nz = n.z;
  n = normalize(n - nb * b - nz * z + nb * b2 + nz * T);
  return c + o2;
}
`;

/** the soft parts' motion (at beginnormal: sets amPos and objectNormal) */
export const SOFT_VERTEX = /* glsl */ `
vSoft = aSoft;
vec3 amPos = position;
{
  float part = aSoft.x;
  vec3 n = objectNormal;
  if (part < 0.5) {
    // ---- the foot
    float zn = aSoft.y, up = aSoft.z, outw = aSoft.w;
    vec3 p = position;
    float reach = uFoot.y, haul = uFoot.z;
    float fr = pow(1.0 - zn, 1.5), bk = pow(zn, 1.5);
    // the propodium reaches out and lifts its edge; the hind part hauls up behind the shell
    p.z += ${(L_FOOT).toFixed(6)} * (0.085 * reach * fr - 0.07 * haul * bk);
    float squeeze = 0.07 * haul * bk - 0.05 * reach * fr;
    // spread out to crawl, drawn in a little at rest
    p.x *= (1.0 + squeeze) * uFoot2.w;
    p.z = mix(${(-0.04 * SH).toFixed(6)}, p.z, 0.55 + 0.45 * uFoot2.w);
    p.y *= 1.0 + 1.8 * squeeze;
    p.y += uFoot2.z * reach * pow(1.0 - zn, 4.0) * (0.5 + 0.5 * up);
    // faint muscular waves running forward along the margin
    float wave = sin(6.2831853 * (uFoot.x - 2.5 * zn));
    p.x += sign(p.x) * ${(0.008 * L_FOOT).toFixed(6)} * wave * amSmV(0.6, 1.0, outw) * uFoot.w;
    p.y += ${(0.006 * L_FOOT).toFixed(6)} * max(wave, 0.0) * amSmV(0.6, 1.0, outw) * uFoot.w * up;
    // the turn: the foot follows the curve it is on
    p.x += 0.5 * uFoot2.x * p.z * p.z;
    // the burrow: the front ploughs down into the sand
    p.y -= uFoot2.y * ${(0.3 * L_FOOT).toFixed(6)} * pow(1.0 - zn, 1.6);
    // withdrawal: the foot folds along its length and is drawn into the aperture, the tail (and the operculum) last
    float rr = amSmV(0.0, 1.0, uRetract.z * 1.45 - 0.45 * zn);
    p.x *= 1.0 - 0.6 * rr;
    p.y += rr * abs(position.x) * 0.8;
    p = mix(p, uAperture + (p - uAperture) * 0.1, rr * rr);
    amPos = p;
  } else if (part < 1.5) {
    // ---- the head and the neck
    vec3 p = position;
    vec3 ph = (uPartM[1] * vec4(p, 1.0)).xyz;
    p = mix(p, ph, aSoft.y);
    n = normalize(mix(n, mat3(uPartM[1]) * n, aSoft.y));
    vec3 ps = (uShellM * vec4(p, 1.0)).xyz;
    p = mix(p, ps, aSoft.z);
    float rh = amSmV(0.0, 1.0, uRetract.y);
    amPos = mix(p, uAperture + (p - uAperture) * 0.12, rh);
  } else if (part < 5.5) {
    // ---- the tubes: tentacles, siphon, proboscis
    float L0 = part < 3.5 ? ${(HEAD.tentacle * SH).toFixed(6)} : part < 4.5 ? ${(HEAD.siphon * SH).toFixed(6)} : ${(HEAD.proboscis * SH).toFixed(6)};
    int i = int(part + 0.5);
    vec4 P = uPartP[i];
    vec3 p = amTube(position, n, aSoft.y, P, L0);
    p = (uPartM[i] * vec4(p, 1.0)).xyz;
    n = mat3(uPartM[i]) * n;
    float rr = part < 4.5 ? amSmV(0.0, 1.0, max(uRetract.y, uRetract.x * 0.6)) : amSmV(0.0, 1.0, uRetract.y);
    amPos = mix(p, uAperture + (p - uAperture) * 0.12, rr);
  } else {
    // ---- the operculum
    amPos = (uPartM[6] * vec4(position, 1.0)).xyz;
    n = mat3(uPartM[6]) * n;
  }
  objectNormal = normalize(n);
}
`;
