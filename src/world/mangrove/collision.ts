import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { samplePath } from './skeleton';
import { treeScale, worldPoint, type Ground, type RootSegment, type TreeSkeleton, type TreeSpec } from './types';

export interface RootSurface { height: number; point: Vector3; normal: Vector3; tree: number; segment: RootSegment }
const UP = new Vector3(0, 1, 0);

/** The low-resolution tapered capsules are independent of rendered geometry and LOD. */
export function collisionSegments(skeleton: TreeSkeleton, tree: TreeSpec, ground: Ground): RootSegment[] {
  const result: RootSegment[] = [], scale = treeScale(tree);
  for (const p of [...skeleton.roots, ...skeleton.trunk]) {
    // Tiered fidelity: arching primaries are smooth enough to walk along, toes/secondary arches coarser,
    // hair-thin hanging rootlets are a single snag capsule (body blocking only, too thin to stand on).
    const sample = samplePath(p, p.root ? [16, 6, 1][Math.min(p.order, 2)] : 10);
    for (let i = 0; i < sample.points.length - 1; i++) {
      const a = worldPoint(sample.points[i], tree, p.root, ground), b = worldPoint(sample.points[i + 1], tree, p.root, ground);
      if (a.distanceToSquared(b) < 1e-10) continue;
      // Small animals need a contact patch: very thin roots get a minimum support radius of 2.5 cm.
      const min = p.root && p.order < 2 ? 0.025 : 0;
      result.push({ a, b, ra: Math.max(min, sample.radii[i] * scale), rb: Math.max(min, sample.radii[i + 1] * scale), tree: tree.id, root: p.root });
    }
  }
  return result;
}

/** Vertical intersections with a tapered cylinder and its round end caps; retains gaps between roots. */
export function segmentSurface(s: RootSegment, x: number, z: number, maxY: number, minNormalY = 0.3): RootSurface | null {
  const radius = Math.max(s.ra,s.rb);
  if (x < Math.min(s.a.x,s.b.x)-radius || x > Math.max(s.a.x,s.b.x)+radius || z < Math.min(s.a.z,s.b.z)-radius || z > Math.max(s.a.z,s.b.z)+radius) return null;
  const axis = s.b.clone().sub(s.a), len = axis.length(); axis.divideScalar(len);
  const m = new Vector3(x, maxY, z).sub(s.a), md = m.dot(axis), nd = -axis.y;
  const perp = m.clone().addScaledVector(axis, -md), dperp = new Vector3(0, -1, 0).addScaledVector(axis, -nd);
  const k = (s.rb - s.ra) / len, r = s.ra + k * md, rd = k * nd;
  const A = dperp.lengthSq() - rd * rd, B = 2 * (perp.dot(dperp) - r * rd), C = perp.lengthSq() - r * r;
  let best: RootSurface | null = null;
  const accept = (t: number, normal: Vector3) => {
    if (!Number.isFinite(t) || t < -1e-7 || normal.y < minNormalY) return;
    const height = maxY - Math.max(0, t);
    if (!best || height > best.height) best = { height, point: new Vector3(x,height,z), normal, tree: s.tree, segment: s };
  };
  const coneHit = (t: number) => {
    const h = md + t * nd;
    if (h < 0 || h > len || t < -1e-7) return;
    const rad = s.ra + k * h;
    const n = perp.clone().addScaledVector(dperp, t).addScaledVector(axis, -k * rad).normalize();
    accept(t, n);
  };
  if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) coneHit(-C / B); }
  else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) { const q = Math.sqrt(disc); coneHit((-B - q) / (2 * A)); coneHit((-B + q) / (2 * A)); }
  }
  for (const [p, radius] of [[s.a, s.ra], [s.b, s.rb]] as const) {
    const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    const dy = Math.sqrt(Math.max(0, radius * radius - d2)), y = p.y + dy;
    accept(maxY - y, new Vector3(dx, dy, dz).normalize());
  }
  return best;
}

/** Reject interior end-cap surfaces at joined segments: they are not tiny invisible stairs. */
function containsAbove(s: RootSegment, p: Vector3): boolean {
  const y=p.y+0.002, r=Math.max(s.ra,s.rb);
  if(y<Math.min(s.a.y,s.b.y)-r || y>Math.max(s.a.y,s.b.y)+r || p.x<Math.min(s.a.x,s.b.x)-r || p.x>Math.max(s.a.x,s.b.x)+r || p.z<Math.min(s.a.z,s.b.z)-r || p.z>Math.max(s.a.z,s.b.z)+r)return false;
  const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,dz=s.b.z-s.a.z;
  const t=Math.max(0,Math.min(1,((p.x-s.a.x)*dx+(y-s.a.y)*dy+(p.z-s.a.z)*dz)/(dx*dx+dy*dy+dz*dz)));
  const rr=s.ra+(s.rb-s.ra)*t;
  return (p.x-s.a.x-dx*t)**2+(y-s.a.y-dy*t)**2+(p.z-s.a.z-dz*t)**2 < rr*rr;
}

/** Closest squared distance between two finite segments (also handles vertical / zero-length segments). */
export function segmentDistanceSq(p: Vector3, q: Vector3, a: Vector3, b: Vector3): number {
  const u = q.clone().sub(p), v = b.clone().sub(a), w = p.clone().sub(a);
  const uu = u.lengthSq(), vv = v.lengthSq(), uv = u.dot(v), uw = u.dot(w), vw = v.dot(w), D = uu * vv - uv * uv;
  let s = D > 1e-12 ? Math.max(0, Math.min(1, (uv * vw - vv * uw) / D)) : 0;
  let t = vv > 1e-12 ? (uv * s + vw) / vv : 0;
  if (t < 0) { t = 0; s = uu > 1e-12 ? Math.max(0, Math.min(1, -uw / uu)) : 0; }
  else if (t > 1) { t = 1; s = uu > 1e-12 ? Math.max(0, Math.min(1, (uv - uw) / uu)) : 0; }
  return w.addScaledVector(u, s).addScaledVector(v, -t).lengthSq();
}

export class RootCollisionWorld {
  readonly segments: RootSegment[] = [];
  private readonly cells = new Map<string, RootSegment[]>();
  private readonly cellSize = 2;
  add(segments: RootSegment[]): void {
    for (const s of segments) {
      this.segments.push(s);
      const r = Math.max(s.ra, s.rb), c = this.cellSize;
      const x0 = Math.floor((Math.min(s.a.x, s.b.x) - r) / c), x1 = Math.floor((Math.max(s.a.x, s.b.x) + r) / c);
      const z0 = Math.floor((Math.min(s.a.z, s.b.z) - r) / c), z1 = Math.floor((Math.max(s.a.z, s.b.z) + r) / c);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const key = `${x},${z}`, bucket = this.cells.get(key) ?? []; bucket.push(s); this.cells.set(key, bucket);
      }
    }
  }
  /** Small animals can ask for normals and a bounded drop to land on roots without snapping to an overhead arch. */
  supportAt(x: number, z: number, maxY: number, minY = -Infinity, minNormalY = 0.3, footRadius = 0): RootSurface | null {
    let best: RootSurface | null = null;
    const bucket = new Set<RootSegment>();
    for (let j = Math.floor((z-footRadius)/this.cellSize); j <= Math.floor((z+footRadius)/this.cellSize); j++)
      for (let i = Math.floor((x-footRadius)/this.cellSize); i <= Math.floor((x+footRadius)/this.cellSize); i++)
        for (const s of this.cells.get(`${i},${j}`) ?? []) bucket.add(s);
    for (const s of bucket) {
      if (!s.root || Math.min(s.a.y, s.b.y) - Math.max(s.ra, s.rb) > maxY) continue;
      const r = Math.max(s.ra,s.rb)+footRadius;
      if (x < Math.min(s.a.x,s.b.x)-r || x > Math.max(s.a.x,s.b.x)+r || z < Math.min(s.a.z,s.b.z)-r || z > Math.max(s.a.z,s.b.z)+r) continue;
      let sx = x, sz = z;
      if (footRadius > 0) {
        const dx = s.b.x-s.a.x, dz = s.b.z-s.a.z, len2 = dx*dx+dz*dz;
        const t = len2 > 1e-12 ? Math.max(0,Math.min(1,((x-s.a.x)*dx+(z-s.a.z)*dz)/len2)) : 0;
        const qx = s.a.x+t*dx, qz = s.a.z+t*dz, distance = Math.hypot(qx-x,qz-z);
        const f = distance > 1e-12 ? Math.min(1,footRadius/distance) : 0;
        sx += (qx-x)*f; sz += (qz-z)*f;
      }
      const hit = segmentSurface(s, sx, sz, maxY, minNormalY);
      if (hit && hit.height >= minY && (!best || hit.height > best.height)) {
        let covered=false;for(const other of bucket)if(containsAbove(other,hit.point)){covered=true;break;}
        if(!covered)best=hit;
      }
    }
    return best;
  }
  overlapsBody(x: number, z: number, feetY: number, radius = 0.18, height = 1.45): boolean {
    const p = new Vector3(x, feetY + Math.min(radius, height / 2) + 0.055, z), q = new Vector3(x, feetY + height - Math.min(radius, height / 2), z);
    const seen = new Set<RootSegment>();
    const c = this.cellSize;
    for (let j = Math.floor((z - radius) / c); j <= Math.floor((z + radius) / c); j++) for (let i = Math.floor((x - radius) / c); i <= Math.floor((x + radius) / c); i++) {
      for (const s of this.cells.get(`${i},${j}`) ?? []) {
        if (seen.has(s)) continue; seen.add(s);
        if (Math.max(s.a.y, s.b.y) + Math.max(s.ra, s.rb) < feetY + 0.035 || Math.min(s.a.y, s.b.y) - Math.max(s.ra, s.rb) > feetY + height) continue;
        if (segmentDistanceSq(p, q, s.a, s.b) < (radius + Math.max(s.ra, s.rb)) ** 2) return true;
      }
    }
    return false;
  }
  /** Sweep in <=5 cm increments; prevents fast motion tunnelling through narrow prop roots. */
  canMove(from: Vector3, to: Vector3, ground: Ground, radius = 0.18, height = 1.45, step = 0.45): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.05));
    let feet = from.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      const terrain = ground.heightAt(x, z), hit = this.supportAt(x, z, feet + step, terrain, 0.35, radius);
      // Preserve jump height. A grounded walker can step up onto the accessible upper surface.
      const y = Math.max(terrain, hit?.height ?? terrain, Math.min(feet, to.y));
      if (y - feet > step + 1e-6 || this.overlapsBody(x, z, y, radius, height)) return false;
      feet = y;
    }
    return true;
  }
  /** Separate simplified mesh for debug/export. Analytic capsules keep rounded joints and do not use a single box. */
  debugMesh(): Mesh {
    const positions: number[] = [], indices: number[] = [];
    for (const s of this.segments) {
      const dir = s.b.clone().sub(s.a), g = new CylinderGeometry(s.rb, s.ra, dir.length(), 6, 1, false);
      const q = new Quaternion().setFromUnitVectors(UP, dir.normalize()), center = s.a.clone().add(s.b).multiplyScalar(0.5);
      g.applyQuaternion(q); g.translate(center.x, center.y, center.z);
      const attr = g.getAttribute('position'), offset = positions.length / 3;
      for (let i = 0; i < attr.count; i++) positions.push(attr.getX(i), attr.getY(i), attr.getZ(i));
      for (const i of g.index!.array) indices.push(offset + i);
      g.dispose();
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(positions, 3)); g.setIndex(indices);
    g.computeVertexNormals();
    const m = new Mesh(g, new MeshBasicMaterial({ color: 0x30ffcf, wireframe: true, depthTest: false, transparent: true, opacity: 0.5 }));
    m.name = 'RootCollision'; m.renderOrder = 10; return m;
  }
  clear(): void { this.cells.clear(); this.segments.length = 0; }
}
