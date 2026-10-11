import { CatmullRomCurve3, CylinderGeometry, Group, LOD, Mesh, Object3D, TubeGeometry, Vector3, type Camera } from 'three';
import type { EquipmentPort } from './Equipment';
import type { EquipmentMaterials } from './Materials';
import { STANDARD_TANK, type ConnectionRecord, type Endpoint, type TankDimensions, type Vec3 } from './state';

export type PortResolver = (endpoint: Endpoint) => EquipmentPort | undefined;
export function validateConnection(c: ConnectionRecord, resolve: PortResolver, existing: ConnectionRecord[] = []): string | null {
  const a = resolve(c.from), b = resolve(c.to);
  if (!a || !b) return '接続端子が見つかりません';
  if (existing.some((x) => x.id === c.id)) return '接続の識別子が重複しています';
  if (c.from.device === c.to.device) return '同じ設備には接続できません';
  if (a.kind !== c.kind || b.kind !== c.kind || a.role !== 'out' || b.role !== 'in') return '端子の種類または方向が合いません';
  if (Math.abs(a.radius - b.radius) > 0.004) return 'ホースの口径が合いません';
  if (!Number.isFinite(c.radius) || c.radius < 0.001 || c.radius > 0.012) return '接続の太さが不正です';
  const same = (x: Endpoint, y: Endpoint) => x.device === y.device && x.port === y.port;
  if (existing.some((x) => x.id !== c.id && (same(x.to, c.to) || same(x.from, c.from)))) return 'この端子は使用中です';
  // Directed cycles have no supply and are not meaningful power/air/sensor connections.
  const visit = (id: string, seen: Set<string>): boolean => {
    if (id === c.from.device) return true; if (seen.has(id)) return false; seen.add(id);
    return existing.filter((x) => x.kind === c.kind && x.id !== c.id && x.from.device === id).some((x) => visit(x.to.device, seen));
  };
  if (c.kind !== 'water' && visit(c.to.device, new Set())) return '接続が循環しています';
  return null;
}

/** Editable endpoints, optional waypoints, radius and bend; all three LODs follow the same curve. */
export class FlexibleLine extends Group {
  readonly lod = new LOD();
  constructor(readonly materials: EquipmentMaterials, readonly fluid: boolean, start: Vec3, end: Vec3, readonly radius = 0.003, via: Vec3[] = [], readonly bend = 0.02) {
    super(); this.add(this.lod); this.setPath(start, end, via);
  }
  setPath(start: Vec3, end: Vec3, via: Vec3[] = []): void {
    if (![start, end, ...via].every((p) => p.length === 3 && p.every(Number.isFinite)) || !Number.isFinite(this.radius) || this.radius <= 0) throw new Error('Invalid cable/hose path');
    this.lod.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); });
    this.lod.clear(); this.lod.levels.length = 0;
    const points = [start, ...(via.length ? via : [[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - this.bend, (start[2] + end[2]) / 2] as Vec3]), end].map((p) => new Vector3(...p));
    // Drop repeated points to avoid cusps/NaNs in Catmull-Rom's tangent frame.
    const clean = points.filter((p, i) => !i || p.distanceToSquared(points[i - 1]) > 1e-9);
    if (clean.length < 2) { clean.push(clean[0].clone().add(new Vector3(0, 0.001, 0))); }
    const curve = new CatmullRomCurve3(clean, false, 'centripetal');
    for (let i = 0; i < 3; i++) {
      const g = new Group(); g.name = `LOD${i}`;
      // Small wires disappear at distance; thick plumbing retains its silhouette.
      if (i < 2 || this.radius >= 0.006) {
        const mesh = new Mesh(new TubeGeometry(curve, [Math.max(24, clean.length * 8), Math.max(12, clean.length * 3), 10][i], this.radius, [8, 6, 4][i], false), this.fluid ? this.materials.clearPlastic : this.materials.rubber);
        mesh.castShadow = !this.fluid; if (this.fluid) mesh.renderOrder = 6; g.add(mesh);
      }
      this.lod.addLevel(g, [0, 0.95, 1.9][i]);
    }
  }
  updateLOD(camera: Camera): void { this.lod.update(camera); }
  override dispose(): void { this.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); }); this.removeFromParent(); }
}
export class Cable extends FlexibleLine { constructor(m: EquipmentMaterials, start: Vec3, end: Vec3, radius = 0.0025, via: Vec3[] = [], bend = 0.025) { super(m, false, start, end, radius, via, bend); this.name = 'Cable'; } }
export class Hose extends FlexibleLine { constructor(m: EquipmentMaterials, start: Vec3, end: Vec3, radius = 0.008, via: Vec3[] = [], bend = 0.035) { super(m, true, start, end, radius, via, bend); this.name = 'Hose'; } }

/** Route behind the rear glass, rise above the rim before crossing it, and give power cables a drip loop. */
export function routeConnection(c: ConnectionRecord, resolve: PortResolver, d: TankDimensions = STANDARD_TANK, frame?: Object3D): Vec3[] {
  const a = resolve(c.from)!, b = resolve(c.to)!;
  const p = a.anchor.getWorldPosition(new Vector3()), q = b.anchor.getWorldPosition(new Vector3());
  if (frame) { frame.worldToLocal(p); frame.worldToLocal(q); }
  const dir = (port: EquipmentPort) => { const v = new Vector3(0, 1, 0).transformDirection(port.anchor.matrixWorld); if (frame) v.transformDirection(frame.matrixWorld.clone().invert()); return v; };
  const left = p.clone().addScaledVector(dir(a), 0.02), right = q.clone().addScaledVector(dir(b), 0.02);
  if (c.via?.length) return [p.toArray(), left.toArray(), ...c.via, right.toArray(), q.toArray()] as Vec3[];
  const railZ = -d.depth / 2 - (c.kind === 'power' || c.kind === 'sensor' ? 0.072 : 0.04);
  const inside = (v: Vector3) => Math.abs(v.x) < d.width / 2 + 0.008 && Math.abs(v.z) < d.depth / 2 + 0.008 && v.y >= 0 && v.y < d.height;
  const routeEnd = (v: Vector3, tip: Vector3): Vec3[] => inside(v) ? [tip.toArray(), [tip.x, d.height + 0.026, tip.z], [tip.x, d.height + 0.032, railZ]] as Vec3[] : [tip.toArray(), [tip.x, tip.y, railZ]] as Vec3[];
  const x = routeEnd(p, left), y = routeEnd(q, right).reverse();
  const tail = x[x.length - 1], head = y[0];
  const loop: Vec3[] = c.kind === 'power' && c.to.device !== 'mains' ? [[tail[0], Math.min(tail[1], head[1]) - 0.065, railZ], [head[0], Math.min(tail[1], head[1]) - 0.065, railZ]] : [[tail[0], Math.max(tail[1], head[1]), railZ], [head[0], Math.max(tail[1], head[1]), railZ]];
  return [p.toArray() as Vec3, ...x, ...loop, ...y, q.toArray() as Vec3];
}

export function makeConnector(port: EquipmentPort, materials: EquipmentMaterials): Object3D {
  const mesh = new Mesh(new CylinderGeometry(port.radius * 1.4, port.radius * 1.4, 0.013, 10), port.kind === 'water' ? materials.blackPlastic : materials.rubber);
  mesh.position.copy(port.anchor.position); mesh.quaternion.copy(port.anchor.quaternion); mesh.translateY(0.005); return mesh;
}
