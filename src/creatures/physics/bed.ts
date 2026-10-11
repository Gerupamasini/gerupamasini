import { Quaternion, Vector3 } from 'three';

/**
 * Resting on the bed. A body lying on the bottom does not stand level with its centre's height: it rests on its
 * footprint — its front and back, its two sides — and lies in the plane they make, down a slope, across a ripple,
 * bridging a hollow narrower than itself and riding over a hump under its middle.
 */

export interface BedPlane {
  /** the height the body's middle rests at: the plane through its footprint, or the ground under its middle where that is higher (m) */
  y: number;
  /** the ground's own height under the middle (m) */
  ground: number;
  /** the bed's rise ahead of the body and toward its left (rad; nose up, left side up) */
  pitch: number;
  roll: number;
  /** the plane's normal (world) */
  readonly normal: Vector3;
}

export function bedPlane(): BedPlane {
  return { y: 0, ground: 0, pitch: 0, roll: 0, normal: new Vector3(0, 1, 0) };
}

/**
 * The plane under a body at (x, z) facing `heading` (forward = (sin, cos)), its footprint `halfL` along and `halfW`
 * across (m).
 */
export function fitBed(ground: { heightAt(x: number, z: number): number }, x: number, z: number, heading: number, halfL: number, halfW: number, out: BedPlane): BedPlane {
  const a = Math.max(0.003, halfL), b = Math.max(0.003, halfW);
  const s = Math.sin(heading), c = Math.cos(heading);
  const hf = ground.heightAt(x + s * a, z + c * a), hb = ground.heightAt(x - s * a, z - c * a);
  // (the animal's left is +x in its own frame: (cos h, −sin h) in the world)
  const hl = ground.heightAt(x + c * b, z - s * b), hr = ground.heightAt(x - c * b, z + s * b);
  const h0 = ground.heightAt(x, z);
  const gF = (hf - hb) / (2 * a), gL = (hl - hr) / (2 * b);
  out.ground = h0;
  out.y = Math.max(h0, (hf + hb + hl + hr) / 4);
  out.pitch = Math.atan(gF);
  out.roll = Math.atan(gL);
  // the slope in the world's axes
  const gx = gF * s + gL * c, gz = gF * c - gL * s;
  out.normal.set(-gx, 1, -gz).normalize();
  return out;
}

const UP = new Vector3(0, 1, 0);
const tmpN = new Vector3();

/**
 * The turn (in the world) that lays a body standing level onto the bed, `weight` of the way (0: level, 1: on the bed):
 * premultiply it onto the body's own attitude.
 */
export function bedTilt(plane: BedPlane, weight: number, out: Quaternion): Quaternion {
  if (weight <= 0) return out.identity();
  const n = plane.normal;
  return out.setFromUnitVectors(UP, tmpN.set(n.x * weight, 1 - (1 - n.y) * weight, n.z * weight).normalize());
}
