import { Color, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, type BufferGeometry } from 'three';
import { Rng } from '../core/Rng';
import type { FeedingPit } from './FeedingPits';
import type { Terrain } from './Terrain';

/** A broken piece of a ribbed bivalve valve (after MahazeViewer's debris): a shallow cap cut irregularly. */
function shellGeometry(rng: Rng): BufferGeometry {
  const geo = new SphereGeometry(1, 18, 7, 0, Math.PI * (0.8 + rng.next() * 1.0), 0, Math.PI * 0.4);
  const pos = geo.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const rib = 1 + 0.04 * Math.sin(a * 24) + 0.02 * Math.sin(Math.acos(Math.min(1, v.y)) * 44);
    v.multiplyScalar(rib);
    v.y *= 0.42;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Crushed アサリ shell lying in the middle of every pit — what the ray left of its meal — plus a few bigger
 * pieces thrown onto the rim. One instanced draw per geometry for the whole flat.
 */
export function createPitDebris(pits: FeedingPit[], terrain: Terrain, seed: number): InstancedMesh[] {
  const rng = new Rng(seed ^ 0x5bd1);
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  const kinds = [shellGeometry(rng), shellGeometry(rng)];
  const per = pits.map(() => 18 + rng.int(0, 22) + 4);
  const total = per.reduce((s, x) => s + x, 0);
  const meshes = kinds.map((g) => new InstancedMesh(g, mat, Math.ceil(total / kinds.length) + 8));
  const counts = meshes.map(() => 0);
  const m = new Matrix4(), q = new Quaternion(), tilt = new Quaternion(), sc = new Vector3(), p = new Vector3(), c = new Color(), e = new Euler(), n = new Vector3(), up = new Vector3(0, 1, 0);
  pits.forEach((pit, pi) => {
    const count = per[pi];
    for (let k = 0; k < count; k++) {
      const onRim = k < 4;
      const ang = rng.range(0, Math.PI * 2);
      // in the middle of the bowl, or on the rim
      const rr = onRim ? 1.1 + rng.range(0, 0.25) : Math.sqrt(rng.next()) * 0.45;
      const u = Math.cos(ang) * pit.a * rr, v = Math.sin(ang) * pit.b * rr;
      const x = pit.x + u * Math.cos(pit.rot) - v * Math.sin(pit.rot), z = pit.z + u * Math.sin(pit.rot) + v * Math.cos(pit.rot);
      if (!terrain.inside(x, z, 2)) continue;
      const size = onRim ? 0.014 + rng.range(0, 0.02) : 0.008 + Math.pow(rng.next(), 1.6) * 0.026;
      terrain.normalAt(x, z, n);
      p.set(x, terrain.heightAt(x, z) - size * 0.1, z);
      e.set(rng.range(-0.3, 0.3), rng.range(0, Math.PI * 2), rng.range(-0.3, 0.3) + (rng.chance(0.3) ? Math.PI : 0));
      q.setFromEuler(e).premultiply(tilt.setFromUnitVectors(up, n));
      sc.set(size * rng.range(0.8, 1.2), size * 0.9, size * rng.range(0.7, 1.1));
      m.compose(p, q, sc);
      const which = rng.int(0, kinds.length - 1), mesh = meshes[which];
      if (counts[which] >= mesh.count) continue;
      mesh.setMatrixAt(counts[which], m);
      // アサリ: chalky white to grey-brown outside, a violet sheen inside; a few dark weathered pieces
      const roll = rng.next();
      if (roll < 0.2) c.setHSL(0.75, 0.1, 0.8 + rng.range(0, 0.1));
      else if (roll < 0.32) c.setHSL(0.08, 0.12, 0.32 + rng.range(0, 0.12));
      else c.setHSL(0.08 + rng.range(0, 0.04), 0.06 + rng.range(0, 0.12), 0.74 + rng.range(0, 0.2));
      c.convertSRGBToLinear();
      mesh.setColorAt(counts[which], c);
      counts[which]++;
    }
  });
  meshes.forEach((mesh, i) => {
    mesh.count = counts[i];
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = `pit-shells-${i}`;
  });
  return meshes;
}
