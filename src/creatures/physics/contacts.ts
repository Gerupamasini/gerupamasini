import type { Floor } from '../drivers/Driver';

/**
 * Contacts between the animals: every body is a capsule lying along its heading (a disc for the round ones) over a
 * span of height. Two that overlap in both are pushed apart along the shortest way out, the lighter the more
 * (position-based, a few relaxations a frame); within a soft margin round them they already start to make way, so
 * they slide past each other instead of bumping. The pushes go back to the drivers (Driver.nudge), which carry on
 * with what they were doing from where they were pushed.
 */

/** How a body meets the others this frame. */
export type BodyMode =
  /** on the bottom */
  | 'bed'
  /** swimming free */
  | 'water'
  /** out of everyone's way: in the sand, down its burrow, on the wing */
  | 'away'
  /** in the way but not to be moved: cemented, clinging, holding its place at food */
  | 'fixed';

/** The build of a species' body, in shares of its total length (DriverEntry.body). */
export interface BodyBuild {
  /** the body's width / its length: the capsule's diameter */
  width: number;
  /** the body's height / its length */
  height: number;
  /** the share of the length that is solid body (a ray's disc without its tail, a fish without its tail fin) */
  core?: number;
  /** the core's centre ahead of the animal's position (in lengths; a fish's position is often its pivot, toward the head) */
  ahead?: number;
  /** never pushed (sessile, attached) */
  fixed?: boolean;
  /** members of one school keep their own spacing: no contacts between two bodies of the same flock */
  flock?: string;
}

/** A body's shape in metres. */
export interface BodyShape {
  /** capsule radius */
  radius: number;
  /** half the length of its core segment, along the heading */
  half: number;
  /** the segment's centre ahead of the position */
  ahead: number;
  /** its height */
  height: number;
  /** grams: who gives way to whom */
  mass: number;
}

export function shapeOf(build: BodyBuild, length_m: number, weight_g: number): BodyShape {
  const L = Math.max(0.004, length_m);
  const radius = Math.max(0.0015, (build.width * L) / 2);
  return {
    radius,
    half: Math.max(0, ((build.core ?? 1) * L) / 2 - radius),
    ahead: (build.ahead ?? 0) * L,
    height: Math.max(0.002, build.height * L),
    mass: Math.max(0.02, weight_g),
  };
}

/** One body as the contacts see it. The owner fills in the pose each frame; the solver fills in the push. */
export interface ContactBody {
  readonly id: string;
  readonly build: BodyBuild;
  readonly shape: BodyShape;
  /** where it is (its driver's position; y: its underside) and which way it faces (forward = (sin, cos)) */
  x: number;
  y: number;
  z: number;
  heading: number;
  mode: BodyMode;
  /** its driver takes a nudge */
  movable: boolean;
  /** the water it must keep under it (m; 0: none) */
  minDepth: number;
  /** this step's push (m), to hand to the driver (whose nudge moves its position at once: the next step reads it there) */
  pushX: number;
  pushZ: number;
}

export function contactBody(id: string, build: BodyBuild, length_m: number, weight_g: number): ContactBody {
  return {
    id, build, shape: shapeOf(build, length_m, weight_g),
    x: 0, y: 0, z: 0, heading: 0, mode: 'bed', movable: false, minDepth: 0, pushX: 0, pushZ: 0,
  };
}

/** the soft margin round a body (in radii of the smaller of the two): within it they start to make way */
const MARGIN = 0.4;
/** how fast an overlap is undone, and the margin's gentler give (1/s) */
const HARD_RATE = 30;
const SOFT_RATE = 3;
const ITERATIONS = 3;
/** the most a body is pushed in a frame (m/s, and a little more): two put down on top of each other part over a few frames */
const MAX_PUSH = 0.5;

export interface ContactEnv {
  floor: Floor;
  /** the walls to keep a push inside (the tank) */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** closest points between the segments p1 + s·d1 and p2 + t·d2 (s, t in 0..1) in the plane */
function closest(p1x: number, p1z: number, d1x: number, d1z: number, p2x: number, p2z: number, d2x: number, d2z: number, out: { s: number; t: number }): void {
  const rx = p1x - p2x, rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  let s = 0, t = 0;
  if (a > 1e-12 || e > 1e-12) {
    if (a <= 1e-12) t = Math.min(1, Math.max(0, f / e));
    else {
      const c = d1x * rx + d1z * rz;
      if (e <= 1e-12) s = Math.min(1, Math.max(0, -c / a));
      else {
        const b = d1x * d2x + d1z * d2z, den = a * e - b * b;
        s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
        else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
      }
    }
  }
  out.s = s; out.t = t;
}

/** a stable direction for two bodies exactly on top of each other */
function hashAngle(a: string, b: string): number {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) { h ^= a.charCodeAt(i); h = Math.imul(h, 16777619); }
  for (let i = 0; i < b.length; i++) { h ^= b.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

const reachOf = (b: ContactBody): number => b.shape.half + Math.abs(b.shape.ahead) + b.shape.radius * (1 + MARGIN);
const weightOf = (b: ContactBody): number => (b.movable && b.mode !== 'fixed' && !b.build.fixed ? 1 / b.shape.mass : 0);

interface Table { reach: Float64Array; sin: Float64Array; cos: Float64Array; w: Float64Array; y0: Float64Array; y1: Float64Array; flock: Int32Array }

export class Contacts {
  private readonly list: ContactBody[] = [];
  private tab: Table | null = null;
  private readonly flocks = new Map<string, number>();
  private readonly cp = { s: 0, t: 0 };
  /** pairs that touched in the last step (debug) */
  touching = 0;

  private table(n: number): Table {
    if (!this.tab || this.tab.reach.length < n) {
      const m = Math.max(64, n * 2);
      this.tab = { reach: new Float64Array(m), sin: new Float64Array(m), cos: new Float64Array(m), w: new Float64Array(m), y0: new Float64Array(m), y1: new Float64Array(m), flock: new Int32Array(m) };
    }
    return this.tab;
  }

  /**
   * One step over the bodies: fills in each one's push (pushX, pushZ) for the owner to hand to its driver. Bodies that
   * are away take no part.
   */
  step(dt: number, bodies: Iterable<ContactBody>, env: ContactEnv): void {
    const list = this.list;
    list.length = 0;
    for (const b of bodies) {
      b.pushX = b.pushZ = 0;
      if (b.mode !== 'away') list.push(b);
    }
    this.touching = 0;
    if (dt <= 0 || list.length < 2) return;
    // sweep along the axis they are spread over most (a shore's animals lie along the water's edge)
    const n = list.length;
    let mx = 0, mz = 0;
    for (const b of list) { mx += b.x; mz += b.z; }
    mx /= n; mz /= n;
    let vx = 0, vz = 0;
    for (const b of list) { vx += (b.x - mx) ** 2; vz += (b.z - mz) ** 2; }
    const alongX = vx >= vz;
    list.sort((a, b) => (alongX ? a.x : a.z) - reachOf(a) - ((alongX ? b.x : b.z) - reachOf(b)));
    // what the pairs need, once a step
    const t = this.table(n);
    const flocks = this.flocks;
    flocks.clear();
    for (let i = 0; i < n; i++) {
      const b = list[i], sh = b.shape;
      t.reach[i] = reachOf(b);
      t.sin[i] = Math.sin(b.heading);
      t.cos[i] = Math.cos(b.heading);
      t.w[i] = weightOf(b);
      const fl = b.build.flock;
      t.flock[i] = fl ? (flocks.get(fl) ?? flocks.set(fl, flocks.size + 1).get(fl)!) : 0;
      t.y0[i] = b.y;
      t.y1[i] = b.y + sh.height;
    }
    // (each relaxation takes its share of the frame's give, so together they give the rate's)
    const hard = 1 - Math.exp((-HARD_RATE * dt) / ITERATIONS), soft = 1 - Math.exp((-SOFT_RATE * dt) / ITERATIONS);
    const cp = this.cp;
    for (let it = 0; it < ITERATIONS; it++) {
      for (let i = 0; i < n; i++) {
        const A = list[i], ra = t.reach[i], wa = t.w[i];
        const ax = A.x + A.pushX, az = A.z + A.pushZ;
        const keyA = alongX ? A.x : A.z, crossA = alongX ? az : ax;
        for (let j = i + 1; j < n; j++) {
          const B = list[j], rb = t.reach[j];
          if ((alongX ? B.x : B.z) - rb > keyA + ra + 0.02) break;
          const wb = t.w[j];
          if (wa + wb <= 0) continue;
          if (t.flock[i] !== 0 && t.flock[i] === t.flock[j]) continue;
          // their height spans must meet (a fish passing over a crab does not touch it)
          if (t.y0[i] >= t.y1[j] || t.y0[j] >= t.y1[i]) continue;
          const bx = B.x + B.pushX, bz = B.z + B.pushZ;
          if (Math.abs((alongX ? bz : bx) - crossA) > ra + rb) continue;
          const sa = t.sin[i], ca = t.cos[i], sb = t.sin[j], cb = t.cos[j];
          const ha = A.shape.half, hb = B.shape.half;
          const a0x = ax + sa * (A.shape.ahead - ha), a0z = az + ca * (A.shape.ahead - ha);
          const b0x = bx + sb * (B.shape.ahead - hb), b0z = bz + cb * (B.shape.ahead - hb);
          closest(a0x, a0z, sa * 2 * ha, ca * 2 * ha, b0x, b0z, sb * 2 * hb, cb * 2 * hb, cp);
          let nx = a0x + sa * 2 * ha * cp.s - (b0x + sb * 2 * hb * cp.t);
          let nz = a0z + ca * 2 * ha * cp.s - (b0z + cb * 2 * hb * cp.t);
          const touch = A.shape.radius + B.shape.radius;
          const reach = touch + MARGIN * Math.min(A.shape.radius, B.shape.radius);
          const d2 = nx * nx + nz * nz;
          if (d2 >= reach * reach) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-7) { const an = hashAngle(A.id, B.id); nx = Math.sin(an); nz = Math.cos(an); d = 0; }
          else { nx /= d; nz /= d; }
          // inside the touch: undone fast; in the margin only: a gentle give
          const corr = Math.max(0, touch - d) * hard + Math.min(reach - d, reach - touch) * soft;
          if (it === 0 && d < touch) this.touching++;
          const fa = wa / (wa + wb), fb = wb / (wa + wb);
          A.pushX += nx * corr * fa; A.pushZ += nz * corr * fa;
          B.pushX -= nx * corr * fb; B.pushZ -= nz * corr * fb;
        }
      }
    }
    // never more than a short step a frame, nor out of the walls or the water the animal must stay in
    const f = env.floor, bnd = env.bounds, maxPush = MAX_PUSH * dt + 0.001;
    for (const b of list) {
      let px = b.pushX, pz = b.pushZ;
      const m = Math.hypot(px, pz);
      if (m < 1e-8) { b.pushX = b.pushZ = 0; continue; }
      if (m > maxPush) { px *= maxPush / m; pz *= maxPush / m; }
      const x0 = b.x, z0 = b.z;
      let nx = x0 + px, nz = z0 + pz;
      if (bnd) {
        nx = Math.min(bnd.maxX, Math.max(bnd.minX, nx));
        nz = Math.min(bnd.maxZ, Math.max(bnd.minZ, nz));
      }
      // a push toward the dry is not taken (the other one gives way instead)
      if (b.minDepth > 0) {
        const after = f.waterAt(nx, nz) - f.heightAt(nx, nz);
        if (after < b.minDepth && after < f.waterAt(x0, z0) - f.heightAt(x0, z0)) { nx = x0; nz = z0; }
      }
      b.pushX = nx - x0;
      b.pushZ = nz - z0;
    }
  }
}
