import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { samplePath } from './skeleton';
import type { HirugiLod, LeafSpec, TreeSkeleton, WoodPath } from './types';

/** Concatenated geometry: no Object3D, material, or draw call per leaf / root. */
class Builder {
  p: number[] = []; uv: number[] = []; detail: number[] = []; center: number[] = []; indices: number[] = [];
  vertex(p: Vector3, u: number, v: number, age = 0, phase = 0, flex = 0, center = p): number {
    const i = this.p.length / 3; this.p.push(p.x, p.y, p.z); this.uv.push(u, v);
    this.detail.push(age, phase, flex); this.center.push(center.x, center.y, center.z); return i;
  }
  finish(name: string): BufferGeometry {
    const g = new BufferGeometry(); g.name = name;
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aDetail', new Float32BufferAttribute(this.detail, 3));
    g.setAttribute('aCenter', new Float32BufferAttribute(this.center, 3));
    g.setIndex(this.indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    // Seed lean, root spread and wind may extend the undeformed bounds.
    if (g.boundingSphere) g.boundingSphere.radius += 1.6;
    return g;
  }
}

function tube(b: Builder, path: WoodPath, lod: HirugiLod): void {
  // Budgeted by screen size: a 6 cm prop root needs ~12 sides at 1 m, a 4 mm shoot needs 3-4.
  const tier = Math.min(path.order, 3);
  const steps = path.points.length === 2 ? 1 : (path.root ? [[28, 9, 6], [14, 5, 3], [4, 2, 2], [4, 2, 2]] : [[22, 8, 5], [12, 5, 3], [5, 3, 2], [1, 1, 1]])[tier][lod];
  const sides = (path.root ? [[12, 6, 4], [9, 5, 3], [4, 3, 3], [4, 3, 3]] : [[18, 8, 5], [10, 6, 4], [5, 4, 3], [path.radii[0] < 0.005 ? 3 : 4, 3, 3]])[tier][lod];
  const { points, radii } = samplePath(path, steps), offset = b.p.length / 3;
  let length = 0, side = new Vector3(1, 0, 0);
  for (let i = 0; i <= steps; i++) {
    const p = points[i], tangent = points[Math.min(steps, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    // Parallel transport avoids the twisting/flip of an arbitrary up-vector frame.
    side.addScaledVector(tangent, -side.dot(tangent)).normalize();
    if (side.lengthSq() < 0.1) side.set(0, 0, 1).addScaledVector(tangent, -tangent.z).normalize();
    const up = tangent.clone().cross(side).normalize();
    if (i) length += p.distanceTo(points[i - 1]);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      const flute = 1 + (path.root ? 0.018 : 0.035) * Math.sin(a * 5 + length * 0.7) + (lod === 0 ? 0.006 * Math.sin(a * 13 + length * 21) : 0);
      const q = p.clone().addScaledVector(side, Math.cos(a) * radii[i] * flute).addScaledVector(up, Math.sin(a) * radii[i] * flute);
      b.vertex(q, j / sides * Math.PI * 2 * radii[i], length, 0, path.order, 0);
    }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < sides; j++) {
    const a = offset + i * (sides + 1) + j, c = a + sides + 1;
    b.indices.push(a, a + 1, c, a + 1, c + 1, c);
  }
  // End caps; most are inside the adjoining trunk/branch, no open black holes close up.
  // Twigs/shoots end in sub-millimetre tips and start inside their parent: caps would be invisible triangles.
  if (path.order >= 2 && !path.root) return;
  for (const end of [0, steps]) {
    const c = b.vertex(points[end], 0, end ? length : 0), row = offset + end * (sides + 1);
    for (let j = 0; j < sides; j++) if (end) b.indices.push(c, row + j + 1, row + j); else b.indices.push(c, row + j, row + j + 1);
  }
}

const UP = new Vector3(0, 1, 0);
/** Leaf frame: length along the leaf axis, blade facing the sky (adaxial side up), then a small roll. */
function leafFrame(l: LeafSpec): Matrix4 {
  const length = l.axis.clone().normalize(), width = new Vector3().crossVectors(UP, length);
  if (width.lengthSq() < 1e-4) width.set(1, 0, 0); width.normalize();
  const normal = new Vector3().crossVectors(width, length).normalize();
  if (normal.y < 0) { width.negate(); normal.negate(); }
  return new Matrix4().makeBasis(width, length, normal).multiply(new Matrix4().makeRotationY(l.roll));
}

/** Thick leathery lamina: elliptic, narrow petiole, short mucronate tip, V-fold along the midrib, recurved margins. */
function blade(b: Builder, l: LeafSpec, lod: HirugiLod): void {
  const rows = [3, 1, 1][lod], across = lod === 0 ? 3 : 2, offset = b.p.length / 3, frame = leafFrame(l);
  for (let k = 0; k <= rows; k++) for (let j = 0; j < across; j++) {
    const t = k / rows, u = j / (across - 1) * 2 - 1;
    // Mesh is a curved envelope; the exact outline (petiole, mucro) is the shader cutout, so it never looks faceted.
    const width = lod === 0 ? 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.1)) : 1;
    const arch = Math.sin(t * Math.PI), fold = lod === 0 ? (Math.abs(u) * 0.1 - Math.abs(u) ** 3 * 0.05) * l.width * arch : 0;
    const local = new Vector3(u * l.width * 0.5 * width, t * l.length, fold + l.length * (0.07 * arch - 0.06 * t * t)).applyMatrix4(frame).add(l.center);
    // Quads (LOD1) carry the leaf outline in the shader: detail.x >= 2 marks an analytic alpha leaf.
    b.vertex(local, (u * width) * 0.5 + 0.5, t, l.age + 2, l.phase, t, l.center);
  }
  for (let k = 0; k < rows; k++) for (let j = 0; j < across - 1; j++) {
    const a = offset + k * across + j, c = a + across;
    b.indices.push(a, a + 1, c, a + 1, c + 1, c);
  }
}

/** Atlas card per twig (detail.x >= 4): the whole far crown, or interior filler behind real leaves up close. */
function tuftCard(b: Builder, l: LeafSpec, crossed: boolean, scale = 1): void {
  l = scale === 1 ? l : { ...l, length: l.length * scale, width: l.width * scale, center: l.center.clone().addScaledVector(l.axis, l.length * (1 - scale) * 0.5).setY(l.center.y - 0.06) };
  for (const roll of crossed ? [0, Math.PI / 2] : [0]) {
    const frame = leafFrame({ ...l, roll }), offset = b.p.length / 3;
    for (let k = 0; k <= 1; k++) for (let j = 0; j <= 1; j++) {
      const p = new Vector3((j - 0.5) * l.width, k * l.length, 0).applyMatrix4(frame).add(l.center);
      b.vertex(p, j, k, l.age + 4, l.phase, 0.35 + k * 0.4, l.center);
    }
    b.indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
  }
}

/** Crossed ribbons retain thin trunk/prop-root silhouettes without tubular geometry. */
function ribbon(b: Builder, path: WoodPath): void {
  const { points, radii } = samplePath(path, 2);
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], c = points[i + 1], next = length + a.distanceTo(c);
    const tangent = c.clone().sub(a).normalize();
    const side = new Vector3(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
    if (side.lengthSq() < 0.1) side.set(0, 0, 1).addScaledVector(tangent, -tangent.z).normalize();
    for (const axis of [side, tangent.clone().cross(side).normalize()]) {
      const start = b.vertex(a.clone().addScaledVector(axis, -radii[i]), 0, length);
      b.vertex(a.clone().addScaledVector(axis, radii[i]), 1, length);
      b.vertex(c.clone().addScaledVector(axis, -radii[i + 1]), 0, next);
      b.vertex(c.clone().addScaledVector(axis, radii[i + 1]), 1, next);
      b.indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2,
        start + 2, start + 1, start, start + 2, start + 3, start + 1);
    }
    length = next;
  }
}

export interface TreeGeometry { Trunk: BufferGeometry; Branches: BufferGeometry; Leaves: BufferGeometry; Roots: BufferGeometry }
export function buildTreeGeometry(s: TreeSkeleton, lod: HirugiLod, lowFar = false): TreeGeometry {
  const trunk = new Builder(), branch = new Builder(), root = new Builder(), leaf = new Builder();
  const juvenile = s.tufts.length === 0;
  if (lowFar && lod === 2) {
    s.trunk.forEach(p => ribbon(trunk, p));
    s.roots.filter(p => p.order === 0).forEach(p => ribbon(root, p));
    if (juvenile) s.leaves.forEach(l => blade(leaf, l, 1)); else s.tufts.forEach((t, i) => { if (i % 2 === 0) tuftCard(leaf, { ...t, length: t.length * 1.4, width: t.width * 1.4, center: t.center.clone().addScaledVector(t.axis, -t.length * 0.2) }, true); });
    return { Trunk: trunk.finish('Trunk'), Branches: branch.finish('Branches'), Leaves: leaf.finish('Leaves'), Roots: root.finish('Roots') };
  }
  s.trunk.forEach((p) => tube(trunk, p, lod));
  // 4-7 mm shoots and stipules are sub-pixel beyond LOD0 range; the rosettes hide the 20-30 cm gap to the twig.
  s.branches.filter((p) => p.order <= [3, 2, 1][lod]).forEach((p) => tube(branch, p, lod));
  // All primary prop roots survive into the far silhouette; hanging rootlets are close-range only.
  s.roots.filter((p) => p.order <= [2, 1, 0][lod]).forEach((p) => tube(root, p, lod));
  // LOD1 (8-30 m): every second leaf, 1.35x larger (the same canopy area) - a leaf is a few pixels there.
  if (lod === 1 && !juvenile) s.leaves.forEach((l, i) => { if (i % 2 === 0) blade(leaf, { ...l, length: l.length * 1.35, width: l.width * 1.35 }, 1); });
  else if (lod < 2 || juvenile) s.leaves.forEach(l => blade(leaf, l, juvenile ? Math.min(lod, 1) as HirugiLod : lod));
  // Real crowns carry tens of thousands of leaves. Filler cards just inside each twig supply that mass
  // (the dense domes of photos 23/45) for ~0.8k triangles, while real leaves form the readable outer layer.
  // Crossed: a lone horizontal card vanishes edge-on and the crown reads see-through from the side.
  if (lod < 2) s.tufts.forEach(t => tuftCard(leaf, t, true, 0.85));
  // LOD2: every second twig card at 1.4x (same coverage); at that range the gaps between cards are sub-pixel
  else s.tufts.forEach((t, i) => { if (i % 2 === 0) tuftCard(leaf, { ...t, length: t.length * 1.4, width: t.width * 1.4, center: t.center.clone().addScaledVector(t.axis, -t.length * 0.2) }, true); });
  return { Trunk: trunk.finish('Trunk'), Branches: branch.finish('Branches'), Leaves: leaf.finish('Leaves'), Roots: root.finish('Roots') };
}

/**
 * One whole distant crown (unit radius, base at y=0) made of the trees' own twig-tuft cards: the background
 * forest is the same foliage, material and wind as the real trees, aggregated. 10 crossed cards on a dome (40 triangles).
 */
export function buildCrownGeometry(): BufferGeometry {
  const b = new Builder();
  for (let i = 0; i < 10; i++) {
    // Fibonacci points over the upper hemisphere, flattened like a Rhizophora dome
    const t = (i + 0.5) / 10, el = Math.asin(t * 0.95), az = i * 2.39996;
    const dir = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el) * 0.75, Math.sin(az) * Math.cos(el));
    const size = 0.95 - 0.25 * t;
    const axis = dir.clone().add(new Vector3(0, 0.9, 0)).normalize();
    const center = dir.clone().multiplyScalar(0.62).add(new Vector3(0, 0.35, 0)).addScaledVector(axis, -size * 0.5);
    tuftCard(b, { center, axis, roll: az, length: size, width: size * 1.05, age: 0.25 + 0.6 * ((i * 0.618) % 1), phase: (i * 0.37) % 1 }, true);
  }
  const g = b.finish('Crown');
  g.boundingSphere!.radius = 2.5;
  return g;
}
