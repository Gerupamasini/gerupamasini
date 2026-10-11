import { BufferGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three';
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
  const steps = path.points.length === 2 ? 1 : path.root ? (path.order >= 2 ? [6, 2, 2] : path.order ? [18, 6, 4] : [40, 10, 7])[lod] : path.order >= 2 ? [7, 3, 2][lod] : [24, 8, 5][lod];
  const sides = path.root ? (path.order >= 2 ? [5, 3, 3] : path.order ? [12, 6, 4] : [18, 7, 5])[lod] : path.order >= 2 ? [6, 5, 3][lod] : [20, 8, 5][lod];
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
  for (const end of [0, steps]) {
    const c = b.vertex(points[end], 0, end ? length : 0), row = offset + end * (sides + 1);
    for (let j = 0; j < sides; j++) if (end) b.indices.push(c, row + j + 1, row + j); else b.indices.push(c, row + j, row + j + 1);
  }
}

function blade(b: Builder, l: LeafSpec, lod: HirugiLod, enlarge: number, proxy: boolean, flat = false): void {
  const rows = flat ? 1 : [8, 3, 2][lod], across = lod === 2 ? 2 : 3, offset = b.p.length / 3;
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), l.axis);
  for (let k = 0; k <= rows; k++) for (let j = 0; j < across; j++) {
    const t = k / rows, u = j / (across - 1) * 2 - 1;
    // Obovate-elliptic lamina with a narrow petiole and a distinct short mucronate tip.
    const width = proxy ? 1 : Math.pow(Math.sin(Math.PI * Math.pow(t, 0.92)), 0.7) * (0.83 + 0.26 * t);
    const tip = !proxy && t > 0.92 ? (1 - t) / 0.08 : 1;
    const local = new Vector3(u * l.width * 0.5 * width * tip * enlarge, t * l.length * enlarge,
      (0.009 * Math.sin(t * Math.PI) - 0.006 * u * u * Math.sin(t * Math.PI) + 0.008 * t * t) * enlarge);
    local.applyAxisAngle(new Vector3(0, 1, 0), l.roll).applyQuaternion(q).add(l.center);
    b.vertex(local, u * 0.5 + 0.5, t, l.age + (proxy ? lod*2 : 0), l.phase, t, l.center);
  }
  for (let k = 0; k < rows; k++) for (let j = 0; j < across - 1; j++) {
    const a = offset + k * across + j, c = a + across;
    b.indices.push(a, a + 1, c, a + 1, c + 1, c);
  }
  // Leaf undersides have their own shading (gl_FrontFacing); no z-fighting second plane.
}

/** Crossed ribbons retain thin trunk/prop-root silhouettes without tubular geometry. */
function ribbon(b: Builder, path: WoodPath): void {
  const { points, radii } = samplePath(path, path.root ? 4 : 3);
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
  if (lowFar && lod === 2) {
    s.trunk.forEach(p => ribbon(trunk, p));
    s.roots.filter(p => p.order === 0).forEach(p => ribbon(root, p));
    // Flat cutout leaf-group cards, distributed throughout the authored crown.
    const stride = s.leaves.length < 100 ? 1 : 72;
    for (let i = 0; i < s.leaves.length; i += stride) blade(leaf, s.leaves[i], 2, stride === 1 ? 1 : 7.8, stride > 1, true);
    return { Trunk: trunk.finish('Trunk'), Branches: branch.finish('Branches'), Leaves: leaf.finish('Leaves'), Roots: root.finish('Roots') };
  }
  s.trunk.forEach((p) => tube(trunk, p, lod));
  s.branches.filter((p) => p.order <= [3, 1, 1][lod]).forEach((p) => tube(branch, p, lod));
  // All primary prop roots survive into the far silhouette; hanging rootlets are close-range only.
  s.roots.filter((p) => p.order <= [2, 1, 0][lod]).forEach((p) => tube(root, p, lod));
  const stride = s.leaves.length < 100 ? 1 : [1, 10, 24][lod];
  const enlarge = s.leaves.length < 100 ? 1 : [1, 2.60, 4.5][lod];
  for (let i = 0; i < s.leaves.length; i += stride) blade(leaf, s.leaves[i], lod, enlarge, s.leaves.length >= 100 && lod > 0);
  return { Trunk: trunk.finish('Trunk'), Branches: branch.finish('Branches'), Leaves: leaf.finish('Leaves'), Roots: root.finish('Roots') };
}
