import { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { Rng } from '../core/Rng';
import type { FeedingPit } from './FeedingPits';
import type { Terrain } from './Terrain';
import { FORMS, sharedGeometry } from '../creatures/asari/AsariModel.js';
import { makeShellOuterMaterial } from '../creatures/asari/AsariMaterial.js';

/**
 * A piece of an アサリ valve: the clam model's own light valve geometry (shell-length units), cut by one or two
 * chords so what is left is a chip, a half, or the whole valve. Every vertex attribute comes along, so the shell
 * material draws the ribs, growth checks and the individual's colour pattern on the fragment as on a live clam.
 */
function valveFragment(base: BufferGeometry, rng: Rng, cuts: number): BufferGeometry {
  const src = base.index ? base.toNonIndexed() : base.clone();
  const pos = src.getAttribute('position');
  const planes: { nx: number; ny: number; d: number }[] = [];
  for (let c = 0; c < cuts; c++) {
    // a chord through the valve at a random angle, a little off the centre, keeping the side the normal points to
    const a = rng.range(0, Math.PI * 2), off = rng.range(-0.12, 0.12);
    planes.push({ nx: Math.cos(a), ny: Math.sin(a), d: off });
  }
  const keep: number[] = [];
  const v = new Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    let inside = 0;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(pos, t + k);
      if (planes.every((p) => p.nx * v.x + p.ny * v.y - p.d >= 0)) inside++;
    }
    if (inside >= 2) keep.push(t);
  }
  const out = new BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const at = src.getAttribute(name) as BufferAttribute;
    const n = at.itemSize;
    const arr = new (at.array.constructor as new (len: number) => typeof at.array)(keep.length * 3 * n);
    let w = 0;
    for (const t of keep) for (let k = 0; k < 3; k++) for (let i = 0; i < n; i++) arr[w++] = at.array[(t + k) * n + i];
    out.setAttribute(name, new BufferAttribute(arr, n, at.normalized));
  }
  out.computeBoundingSphere();
  return out;
}

/**
 * Crushed アサリ shells lying in the middle of every pit — what the ray left of its meal — plus a few bigger
 * pieces thrown onto the rim: whole valves, halves and chips of the clam model's valve, drawn with its shell
 * material (ribs, growth lines, each piece's own markings). One instanced draw per fragment kind for the whole flat.
 */
export function createPitDebris(pits: FeedingPit[], terrain: Terrain, seed: number): InstancedMesh[] {
  const rng = new Rng(seed ^ 0x5bd1);
  const form = FORMS.asari;
  const valve = sharedGeometry(form).valve[2] as BufferGeometry;
  // whole valves, halves, chips
  const kinds = [valveFragment(valve, rng, 0), valveFragment(valve, rng, 1), valveFragment(valve, rng, 1), valveFragment(valve, rng, 2), valveFragment(valve, rng, 2)];
  const sizes = [1, 0.95, 0.9, 0.8, 0.75];
  const per = pits.map(() => 24 + rng.int(0, 20) + 4);
  const total = per.reduce((s, x) => s + x, 0);
  const cap = Math.ceil(total / kinds.length) + 12;
  const meshes = kinds.map((g) => {
    const mat = (makeShellOuterMaterial as (o: { instanced?: boolean; style?: string }) => ReturnType<typeof makeShellOuterMaterial>)({ instanced: true, style: form.style });
    (mat.userData.uniforms as { uSand: { value: { set(a: number, b: number, c: number, d: number): void } } }).uSand.value.set(-1e9, 0.04, 0, 0.8);
    const geo = g.clone();
    geo.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    return new InstancedMesh(geo, mat, cap);
  });
  const counts = meshes.map(() => 0);
  const o = new Object3D(), m = new Matrix4(), tilt = new Quaternion(), n = new Vector3(), up = new Vector3(0, 1, 0);
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
      // the ray eats the big ones: whole valves and halves on the rim, more chips in the bowl
      const which = onRim ? rng.int(0, 2) : Math.min(kinds.length - 1, Math.floor(Math.pow(rng.next(), 0.7) * kinds.length));
      const mesh = meshes[which];
      if (counts[which] >= mesh.count) continue;
      const length = (onRim ? 0.03 + rng.range(0, 0.012) : 0.022 + rng.range(0, 0.016)) * sizes[which];
      terrain.normalAt(x, z, n);
      // convex side up, half sunk, a little tilt; the valve geometry lies in its own x-y plane, so it is laid flat
      o.position.set(x, terrain.heightAt(x, z) - length * 0.015, z);
      o.rotation.set(-Math.PI / 2 + rng.range(-0.25, 0.25), rng.range(0, Math.PI * 2), rng.range(-0.25, 0.25), 'YXZ');
      o.quaternion.premultiply(tilt.setFromUnitVectors(up, n));
      o.scale.setScalar(length);
      o.updateMatrix();
      m.copy(o.matrix);
      mesh.setMatrixAt(counts[which], m);
      // each piece its own markings; the last two seed components follow the clam bed's (pattern on, light detail)
      (mesh.geometry.getAttribute('aSeed') as InstancedBufferAttribute).set([rng.next(), rng.next(), 1, 0], counts[which] * 4);
      counts[which]++;
    }
  });
  meshes.forEach((mesh, i) => {
    mesh.count = counts[i];
    mesh.instanceMatrix.needsUpdate = true;
    (mesh.geometry.getAttribute('aSeed') as InstancedBufferAttribute).needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = `pit-shells-${i}`;
  });
  return meshes;
}
