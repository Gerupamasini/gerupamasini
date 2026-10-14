import { BufferGeometry, CylinderGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { Rng, hashInts } from '../core/Rng';
import type { Terrain } from './Terrain';

/**
 * 竹杭: a short row of old bamboo stakes standing in the shallows (the lines of stakes in the 葛西 photos, left from
 * the laver nets), weathered grey above the water and crusted with oysters through the tide band.
 */

export interface StakeSite { p: Vector3; n: Vector3; room: number; stake: number }
interface Stake { base: Vector3; axis: Vector3; r: number; top: number }

export class StakeRow {
  readonly mesh: InstancedMesh;
  private readonly stakes: Stake[] = [];

  /** a row from (x0, z0) to (x1, z1), `count` stakes */
  constructor(private readonly terrain: Terrain, x0: number, z0: number, x1: number, z1: number, count: number, seed: number) {
    const rng = new Rng(hashInts(seed, 0x57a));
    for (let i = 0; i < count; i++) {
      const t = (i + rng.range(-0.25, 0.25)) / Math.max(1, count - 1);
      const x = x0 + (x1 - x0) * t + rng.range(-0.3, 0.3), z = z0 + (z1 - z0) * t + rng.range(-0.3, 0.3);
      if (!terrain.inside(x, z, 1)) continue;
      // a few have rotted down to stumps
      const top = rng.chance(0.2) ? rng.range(-0.3, 0.6) : rng.range(1.3, 1.9);
      const axis = new Vector3(rng.range(-0.06, 0.06), 1, rng.range(-0.06, 0.06)).normalize();
      this.stakes.push({ base: new Vector3(x, terrain.heightAt(x, z) - 0.4, z), axis, r: rng.range(0.028, 0.045), top });
    }
    const geo: BufferGeometry = new CylinderGeometry(1, 1, 1, 10, 1, false);
    geo.translate(0, 0.5, 0);
    const mat = new MeshStandardMaterial({ color: new Color('#8d877a'), roughness: 0.9, metalness: 0 });
    this.mesh = new InstancedMesh(geo, mat, Math.max(1, this.stakes.length));
    this.mesh.count = this.stakes.length;
    const q = new Quaternion(), s = new Vector3(), c = new Color();
    this.stakes.forEach((st, i) => {
      q.setFromUnitVectors(new Vector3(0, 1, 0), st.axis);
      s.set(st.r, (st.top - st.base.y) / st.axis.y, st.r);
      this.mesh.setMatrixAt(i, new Matrix4().compose(st.base, q, s));
      this.mesh.setColorAt(i, c.set('#8d877a').multiplyScalar(rng.range(0.8, 1.1)));
    });
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'stakes';
  }

  /** where oysters can settle: round each stake, between `top` and `bottom` (T.P. m), clear of the bed */
  attachSites(seed: number, top: number, bottom: number, spacing = 0.09): StakeSite[] {
    const rng = new Rng(hashInts(seed, 0x5a7));
    const out: StakeSite[] = [];
    this.stakes.forEach((st, i) => {
      const ground = this.terrain.heightAt(st.base.x, st.base.z);
      const lo = Math.max(bottom, ground + 0.06), hi = Math.min(top, st.top - 0.05);
      for (let y = lo; y < hi; y += spacing) {
        // thickest low down, thinning toward the top of the band
        if (rng.next() > 0.85 - 0.5 * (y - lo) / Math.max(0.1, hi - lo)) continue;
        const a = rng.range(0, Math.PI * 2);
        const n = new Vector3(Math.cos(a), 0, Math.sin(a));
        const p = this.axisPoint(i, y).addScaledVector(n, st.r);
        out.push({ p, n, room: 0.1, stake: i });
      }
    });
    return out;
  }

  /** the point of a stake's surface toward a world point, and the outward normal there */
  surfaceToward(stake: number, world: Vector3, outP: Vector3, outN: Vector3): void {
    const st = this.stakes[stake];
    const c = this.axisPoint(stake, world.y);
    outN.copy(world).sub(c);
    outN.addScaledVector(st.axis, -outN.dot(st.axis));
    if (outN.lengthSq() < 1e-8) outN.set(1, 0, 0);
    outN.normalize();
    outP.copy(c).addScaledVector(outN, st.r);
  }

  /** the point on a stake's axis at height y */
  private axisPoint(stake: number, y: number): Vector3 {
    const st = this.stakes[stake];
    return st.base.clone().addScaledVector(st.axis, (y - st.base.y) / st.axis.y);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}
