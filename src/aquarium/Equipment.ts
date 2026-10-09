import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, LOD, Matrix4, Mesh, Object3D, Quaternion, Vector3, type Material, type Camera } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EquipmentMaterials } from './Materials';
import { STANDARD_TANK, type ConnectionKind, type EquipmentKind, type TankDimensions, type Vec3 } from './state';
import type { EquipmentStyle } from './catalog';

export interface EquipmentPort { name: string; kind: ConnectionKind; role: 'in' | 'out'; anchor: Object3D; radius: number }
export interface EquipmentContext { materials: EquipmentMaterials; dimensions?: TankDimensions; style?: EquipmentStyle }
type Part = 'body' | 'supports' | 'emitter' | 'detail';

/** Batch static geometry by material within each named part: a grille costs one draw, not 40. */
class ModelBuilder {
  readonly root = new Group();
  private readonly batches = new Map<Part, Map<Material, BufferGeometry[]>>();
  constructor(readonly quality: number, readonly m: EquipmentMaterials, readonly style: EquipmentStyle = 'classic') {}
  add(geo: BufferGeometry, material: Material, p: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0], part: Part = 'body'): void {
    material = this.m.forStyle(material, this.style);
    const mesh = new Mesh(geo); mesh.position.fromArray(p); mesh.rotation.set(...rotation); mesh.updateMatrix();
    geo.applyMatrix4(mesh.matrix);
    const flat = geo.index ? geo.toNonIndexed() : geo; if (flat !== geo) geo.dispose();
    if (!this.batches.has(part)) this.batches.set(part, new Map());
    const batch = this.batches.get(part)!; if (!batch.has(material)) batch.set(material, []); batch.get(material)!.push(flat);
  }
  box(size: Vec3, p: Vec3, mat: Material, rounded = false, part: Part = 'body'): void {
    const geo = rounded && this.quality < 2 ? new RoundedBoxGeometry(...size, 1, Math.min(...size) * 0.12) : new BoxGeometry(...size);
    this.add(geo, mat, p, [0, 0, 0], part);
  }
  cylinder(radius: number, length: number, p: Vec3, mat: Material, rotation: Vec3 = [0, 0, 0], part: Part = 'body'): void {
    this.add(new CylinderGeometry(radius, radius, length, [20, 12, 6][this.quality]), mat, p, rotation, part);
  }
  rod(a: Vec3, z: Vec3, radius: number, mat: Material, part: Part = 'body'): void {
    const from = new Vector3(...a), to = new Vector3(...z), dir = to.clone().sub(from);
    const geo = new CylinderGeometry(radius, radius, dir.length(), [12, 8, 4][this.quality]);
    geo.applyMatrix4(new Matrix4().compose(from.add(to).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()), new Vector3(1, 1, 1)));
    this.add(geo, mat, [0, 0, 0], [0, 0, 0], part);
  }
  screw(p: Vec3): void { if (this.quality === 0) this.cylinder(0.0018, 0.001, p, this.m.metal, [Math.PI / 2, 0, 0], 'detail'); }
  slots(width: number, height: number, z: number, count: number): void {
    if (this.quality === 2) return;
    for (let i = 0; i < count; i++) this.box([width, 0.002, 0.002], [0, height * (i / count - 0.5), z], this.m.rubber, false, 'detail');
  }
  finish(): Group {
    for (const [name, batches] of this.batches) {
      const part = new Group(); part.name = name;
      for (const [material, geos] of batches) {
        const geometry = mergeGeometries(geos)!; geos.forEach((g) => g.dispose());
        const mesh = new Mesh(geometry, material); mesh.castShadow = !material.transparent && name !== 'emitter'; mesh.receiveShadow = true;
        if (material.transparent) mesh.renderOrder = 6;
        part.add(mesh);
      }
      this.root.add(part);
    }
    return this.root;
  }
}

/** Stable ports stay outside the LOD so connections never jump when the camera moves. */
export class AquariumDevice extends Group {
  readonly lod = new LOD();
  readonly ports = new Map<string, EquipmentPort>();
  enabled = true;
  powered = false;
  readonly dimensions: TankDimensions;
  constructor(readonly kind: EquipmentKind | 'tank' | 'stand', readonly context: EquipmentContext, stand: 'wood' | 'metal' = 'wood') {
    super(); this.name = kind; this.dimensions = context.dimensions ?? STANDARD_TANK;
    this.rebuildModel(stand);
    this.add(this.lod); definePorts(this);
    // Start unpowered; every emitter is assigned from the connectivity graph.
    this.powered = true; this.setPowered(false);
  }
  rebuildModel(stand: 'wood' | 'metal' = 'wood'): void {
    this.lod.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); }); this.lod.clear(); this.lod.levels.length = 0;
    for (let q = 0; q < 3; q++) { const b = new ModelBuilder(q, this.context.materials, this.context.style); buildModel(this.kind, b, this.dimensions, stand); const g = b.finish(); g.name = `LOD${q}`; this.lod.addLevel(g, [0, 0.95, 1.9][q]); }
  }
  port(name: string, kind: ConnectionKind, role: 'in' | 'out', position: Vec3, direction: Vec3, radius = 0.003): void {
    const anchor = new Object3D(); anchor.position.fromArray(position); anchor.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...direction).normalize()); anchor.name = name;
    this.add(anchor); this.ports.set(name, { name, kind, role, anchor, radius });
  }
  setPowered(on: boolean): void {
    if (this.powered === on) return;
    this.powered = on;
    this.lod.traverse((o) => { if (o instanceof Mesh && o.parent?.name === 'emitter') o.material = on ? this.context.materials.lamp : this.context.materials.lampOff; });
  }
  updateLOD(camera: Camera): void { this.lod.update(camera); }
  override dispose(): void { this.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); }); this.removeFromParent(); }
}

function buildModel(kind: AquariumDevice['kind'], b: ModelBuilder, d: TankDimensions, stand: 'wood' | 'metal'): void {
  const m = b.m, w = d.width, h = d.height, z = d.depth, t = d.glass, q = b.quality;
  const suction = (x: number, y: number, depth: number) => b.cylinder(0.011, 0.005, [x, y, depth], m.rubber, [Math.PI / 2, 0, 0]);
  switch (kind) {
    case 'tank': {
      b.box([w, t, z], [0, -t / 2, 0], m.glass);
      for (const sign of [-1, 1]) {
        b.box([w, h, t], [0, h / 2, sign * (z / 2 + t / 2)], m.glass);
        b.box([t, h, z], [sign * (w / 2 + t / 2), h / 2, 0], m.glass);
        b.box([w + 2 * t, 0.0015, t], [0, h, sign * (z / 2 + t / 2)], m.clearPlastic);
        b.box([t, 0.0015, z], [sign * (w / 2 + t / 2), h, 0], m.clearPlastic);
        for (const side of [-1, 1]) b.box([0.002, h, 0.002], [side * (w / 2 - 0.001), h / 2, sign * (z / 2 - 0.001)], m.silicone);
        b.box([w, 0.003, 0.003], [0, 0.0015, sign * (z / 2 - 0.001)], m.silicone);
      }
      if (b.style !== 'classic') for (const sign of [-1, 1]) {
        b.box([w + 2 * t, 0.012, t + 0.002], [0, h - 0.005, sign * (z / 2 + t / 2)], m.paintedMetal);
        b.box([t + 0.002, 0.012, z], [sign * (w / 2 + t / 2), h - 0.005, 0], m.paintedMetal);
      }
      break;
    }
    case 'stand': {
      b.box([w + 0.04, 0.02, z + 0.04], [0, -0.017, 0], m.wood);
      b.box([w + 0.005, 0.004, z + 0.005], [0, -0.006, 0], m.rubber);
      b.box([w + 0.025, 0.02, z + 0.025], [0, -0.72, 0], stand === 'wood' ? m.wood : m.paintedMetal);
      if (stand === 'wood') {
        for (const s of [-1, 1]) b.box([0.018, 0.68, z + 0.02], [s * (w / 2 + 0.003), -0.369, 0], m.wood);
        // Open rear and split front doors leave access for plumbing and maintenance.
        for (const s of [-1, 1]) { b.box([w / 2 - 0.012, 0.65, 0.016], [s * w / 4, -0.365, z / 2 + 0.009], m.wood, true); b.rod([s * 0.021, -0.3, z / 2 + 0.02], [s * 0.021, -0.38, z / 2 + 0.02], 0.002, m.metal, 'detail'); }
      } else {
        for (const x of [-1, 1]) for (const a of [-1, 1]) b.box([0.025, 0.68, 0.025], [x * (w / 2 - 0.015), -0.369, a * (z / 2 - 0.015)], m.paintedMetal);
        b.box([w, 0.025, 0.025], [0, -0.08, -z / 2 + 0.015], m.paintedMetal);
        b.rod([-w / 2 + 0.025, -0.69, -z / 2], [w / 2 - 0.025, -0.08, -z / 2], 0.006, m.metal);
      }
      break;
    }
    case 'glassLid': {
      // Rear 45 mm service gap keeps hoses and light clamps clear of the lid.
      for (const s of [-1, 1]) b.box([w / 2 - 0.008, 0.004, z - 0.054], [s * w / 4, 0, 0.023], m.glass);
      for (const s of [-1, 1]) b.box([0.023, 0.007, 0.01], [s * (w / 2 - 0.025), -0.002, 0], m.clearPlastic);
      b.box([0.03, 0.008, 0.012], [0.028, 0.005, 0.08], m.clearPlastic, true, 'detail'); break;
    }
    case 'ledLight': case 'lightFixture': {
      const fluorescent = kind === 'lightFixture';
      b.box([w + 0.014, fluorescent ? 0.032 : 0.016, 0.054], [0, 0, 0], m.paintedMetal, true);
      for (const s of [-1, 1]) {
        b.box([0.015, 0.025, 0.056], [s * (w / 2 + 0.002), 0, 0], m.blackPlastic, true);
        b.rod([s * (w / 2 - 0.01), -0.008, 0], [s * (w / 2 - 0.01), -0.06, -0.02], 0.003, m.metal, 'supports');
        b.box([0.025, 0.006, 0.03], [s * (w / 2 - 0.008), -0.064, -0.02], m.rubber, false, 'supports');
        b.screw([s * (w / 2 - 0.03), 0, 0.028]);
      }
      b.box([w - 0.04, 0.003, 0.032], [0, -0.01, 0], m.lamp, false, 'emitter');
      if (q === 0) for (let i = 0; i < 12; i++) b.box([w - 0.04, 0.001, 0.001], [0, 0.009, -0.022 + i * 0.004], m.metal, false, 'detail');
      break;
    }
    case 'canisterFilter': {
      b.box([0.145, 0.23, 0.14], [0, 0.115, 0], m.blackPlastic, true);
      b.box([0.151, 0.038, 0.146], [0, 0.239, 0], m.paintedMetal, true);
      b.box([0.135, 0.013, 0.13], [0, 0.011, 0], m.rubber);
      for (const s of [-1, 1]) { b.box([0.012, 0.046, 0.022], [s * 0.075, 0.217, 0], m.rubber, true); b.cylinder(0.009, 0.028, [s * 0.035, 0.269, 0], m.blackPlastic); if (q < 2) b.cylinder(0.011, 0.007, [s * 0.035, 0.258, 0], m.metal); }
      b.box([0.07, 0.026, 0.007], [0, 0.246, 0], m.rubber, true); b.box([0.045, 0.014, 0.002], [0, 0.165, 0.071], m.metal, false, 'detail'); break;
    }
    case 'topFilter': {
      b.box([w * 0.65, 0.065, 0.095], [0, 0, 0], m.blackPlastic, true); b.box([w * 0.65 + 0.006, 0.005, 0.099], [0, 0.036, 0], m.clearPlastic);
      b.rod([-w * 0.25, -0.01, 0], [-w * 0.25, -0.19, 0], 0.009, m.clearPlastic); b.box([0.032, 0.045, 0.036], [-w * 0.25, -0.205, 0], m.blackPlastic, true);
      b.cylinder(0.012, 0.055, [w * 0.25, -0.057, 0.018], m.clearPlastic);
      for (const s of [-1, 1]) b.box([0.018, 0.014, z * 0.6], [s * w * 0.3, -0.04, 0], m.blackPlastic, false, 'supports'); break;
    }
    case 'spongeFilter': {
      b.cylinder(0.041, 0.07, [0, 0.046, 0], m.rubber); b.cylinder(0.045, 0.011, [0, 0.008, 0], m.blackPlastic);
      b.cylinder(0.009, 0.16, [0, 0.14, 0], m.clearPlastic); b.rod([0, 0.213, 0], [0, 0.213, 0.035], 0.008, m.clearPlastic);
      if (q === 0) for (let i = 0; i < 7; i++) b.cylinder(0.042, 0.002, [0, 0.014 + i * 0.01, 0], m.blackPlastic, [0, 0, 0], 'detail'); break;
    }
    case 'airPump': {
      b.box([0.1, 0.006, 0.075], [0, -0.033, 0], m.paintedMetal, false, 'supports');
      b.box([0.09, 0.055, 0.006], [0, -0.054, 0.035], m.paintedMetal, false, 'supports');
      b.box([0.085, 0.042, 0.053], [0, 0, 0], m.paintedMetal, true); b.box([0.078, 0.012, 0.048], [0, -0.024, 0], m.rubber, true);
      for (let i = 0; i < 4; i++) b.rod([(i - 1.5) * 0.014, 0, 0.026], [(i - 1.5) * 0.014, 0, 0.033], 0.003, m.blackPlastic);
      b.box([0.018, 0.002, 0.012], [0.02, 0.022, 0], m.rubber, false, 'detail'); break;
    }
    case 'airStone':
      if (b.style === 'ivory') b.cylinder(0.014, 0.008, [0, 0.004, 0], m.ceramic);
      else b.box([b.style === 'studio' ? 0.055 : 0.035, 0.008, 0.013], [0, 0.004, 0], m.ceramic, true);
      b.rod([0, 0.004, -0.006], [0, 0.004, -0.015], 0.002, m.blackPlastic); break;
    case 'heater': {
      b.cylinder(0.008, 0.17, [0, 0, 0], m.glass); b.cylinder(0.0058, 0.135, [0, -0.008, 0], m.ceramic);
      b.cylinder(0.009, 0.024, [0, 0.094, 0], m.blackPlastic); b.cylinder(0.007, 0.006, [0, -0.088, 0], m.rubber);
      for (const y of [-0.05, 0.045]) { suction(0, y, -0.009); b.box([0.012, 0.007, 0.01], [0, y, -0.003], m.blackPlastic); }
      if (q === 0) for (let i = 0; i < 16; i++) b.cylinder(0.006, 0.001, [0, -0.063 + i * 0.007, 0], m.metal, [0, 0, 0], 'detail'); break;
    }
    case 'thermometer': {
      b.box([0.032, 0.023, 0.012], [0, 0, 0], m.blackPlastic, true); b.box([0.025, 0.014, 0.001], [0, 0, 0.0065], m.display); suction(0, 0, -0.009);
      b.rod([0, -0.009, 0], [0, -0.058, 0], 0.0018, m.metal); break;
    }
    case 'thermostat': {
      b.box([0.07, 0.095, 0.028], [0, 0, 0], m.blackPlastic, true); b.box([0.053, 0.026, 0.002], [0, 0.012, 0.015], m.display);
      b.cylinder(0.013, 0.006, [0, -0.024, 0.016], m.paintedMetal, [Math.PI / 2, 0, 0]); b.box([0.004, 0.004, 0.002], [0.024, -0.025, 0.016], m.indicator, false, 'detail'); break;
    }
    case 'filter': {
      b.box([0.042, 0.115, 0.037], [0, 0, 0], m.blackPlastic, true); b.box([0.038, 0.035, 0.04], [0, 0.064, 0], m.paintedMetal, true);
      b.rod([0, 0.06, 0.02], [0, 0.06, 0.042], 0.006, m.blackPlastic); b.slots(0.033, 0.095, 0.02, q === 0 ? 12 : 5); suction(0, 0.032, -0.023); suction(0, -0.035, -0.023); break;
    }
    case 'flowPump': {
      b.cylinder(0.023, 0.045, [0, 0, 0], m.blackPlastic, [Math.PI / 2, 0, 0]); suction(0, 0, -0.026);
      b.cylinder(0.008, 0.034, [0, 0, 0.014], m.paintedMetal, [Math.PI / 2, 0, 0]);
      if (q < 2) for (let i = 0; i < (q === 0 ? 12 : 6); i++) { const a = i * Math.PI * 2 / (q === 0 ? 12 : 6); b.rod([Math.cos(a) * 0.023, Math.sin(a) * 0.023, 0.012], [0, 0, 0.032], 0.0013, m.paintedMetal, 'detail'); }
      break;
    }
    case 'circulationPump': {
      b.box([0.04, 0.037, 0.033], [0, 0, 0], m.blackPlastic, true); b.cylinder(0.007, 0.022, [0, 0.024, 0], m.blackPlastic);
      b.slots(0.03, 0.023, 0.018, 6); suction(0, -0.012, -0.019); break;
    }
    case 'chiller': {
      b.box([0.22, 0.3, 0.27], [0, 0.155, 0], m.paintedMetal, true); b.box([0.18, 0.035, 0.006], [0, 0.272, 0.137], m.blackPlastic, true); b.box([0.056, 0.02, 0.003], [0, 0.272, 0.142], m.display);
      if (q < 2) for (let i = 0; i < (q === 0 ? 22 : 9); i++) b.box([0.185, 0.003, 0.004], [0, 0.035 + i * (q === 0 ? 0.008 : 0.021), 0.138], m.rubber, false, 'detail');
      for (const s of [-1, 1]) { b.cylinder(0.009, 0.025, [s * 0.065, 0.318, -0.06], m.blackPlastic); b.box([0.025, 0.009, 0.04], [s * 0.07, 0.001, 0.08], m.rubber); } break;
    }
    case 'powerStrip': {
      b.box([0.27, 0.025, 0.042], [0, 0, 0], m.blackPlastic, true);
      for (let i = 0; i < 6; i++) { const x = -0.106 + i * 0.038; b.box([0.028, 0.002, 0.023], [x, 0.014, 0], m.rubber, true); if (q < 2) for (const s of [-1, 1]) b.box([0.002, 0.001, 0.009], [x + s * 0.005, 0.0155, 0], m.metal, false, 'detail'); }
      b.box([0.017, 0.005, 0.016], [0.123, 0.015, 0], m.indicator); break;
    }
  }
}

function definePorts(o: AquariumDevice): void {
  const k = o.kind, d = o.dimensions;
  const port = (name: string, kind: ConnectionKind, role: 'in' | 'out', p: Vec3, dir: Vec3 = [0, 1, 0], r = 0.003) => o.port(name, kind, role, p, dir, r);
  if (!['tank', 'stand', 'glassLid', 'airStone', 'spongeFilter', 'thermometer'].includes(k)) port('power', 'power', 'in', k === 'canisterFilter' ? [0, 0.247, -0.072] : k === 'chiller' ? [0, 0.04, -0.137] : k === 'ledLight' || k === 'lightFixture' ? [d.width / 2 + 0.01, 0, 0] : [0, 0.015, -0.02], [0, 0, -1]);
  if (k === 'tank') { port('intake', 'water', 'out', [-d.width / 2 + 0.035, d.height + 0.012, -d.depth / 2 - 0.02], [0, -1, 0], 0.008); port('return', 'water', 'in', [d.width / 2 - 0.035, d.height + 0.012, -d.depth / 2 - 0.02], [0, -1, 0], 0.008); }
  if (k === 'canisterFilter' || k === 'chiller') { const y = k === 'canisterFilter' ? 0.283 : 0.331, x = k === 'canisterFilter' ? 0.035 : 0.065; port('in', 'water', 'in', [-x, y, k === 'chiller' ? -0.06 : 0], [0, 1, 0], 0.008); port('out', 'water', 'out', [x, y, k === 'chiller' ? -0.06 : 0], [0, 1, 0], 0.008); }
  if (k === 'airPump') for (let i = 0; i < 4; i++) port(i === 0 ? 'air' : `air${i}`, 'air', 'out', [(i - 1.5) * 0.014, 0, 0.033], [0, 0, 1], 0.002);
  if (k === 'airStone') port('air', 'air', 'in', [0, 0.004, -0.015], [0, 0, -1], 0.002);
  if (k === 'spongeFilter') port('air', 'air', 'in', [0, 0.014, -0.011], [0, 0, -1], 0.002);
  if (k === 'thermostat') { port('heater', 'power', 'out', [0.02, -0.048, 0], [0, -1, 0]); port('sensor', 'sensor', 'in', [-0.02, -0.048, 0], [0, -1, 0], 0.001); }
  if (k === 'thermometer') port('sensor', 'sensor', 'out', [0, 0.012, -0.007], [0, 1, 0], 0.001);
  if (k === 'circulationPump') {
    port('in', 'water', 'in', [0, 0, 0.018], [0, 0, 1], 0.006);
    port('out', 'water', 'out', [0, 0.035, 0], [0, 1, 0], 0.006);
  }
  if (k === 'powerStrip') for (let i = 0; i < 6; i++) port(`socket${i}`, 'power', 'out', [-0.106 + i * 0.038, 0.016, 0]);
}

export class AquariumTank extends AquariumDevice { constructor(c: EquipmentContext) { super('tank', c); } }
export class AquariumStand extends AquariumDevice { constructor(c: EquipmentContext, finish: 'wood' | 'metal' = 'wood') { super('stand', c, finish); } }
export class GlassLid extends AquariumDevice { constructor(c: EquipmentContext) { super('glassLid', c); } }
export class LightFixture extends AquariumDevice { constructor(c: EquipmentContext) { super('lightFixture', c); } }
export class LEDLight extends AquariumDevice { constructor(c: EquipmentContext) { super('ledLight', c); } }
export class Filter extends AquariumDevice { constructor(c: EquipmentContext) { super('filter', c); } }
export class CanisterFilter extends AquariumDevice { constructor(c: EquipmentContext) { super('canisterFilter', c); } }
export class TopFilter extends AquariumDevice { constructor(c: EquipmentContext) { super('topFilter', c); } }
export class SpongeFilter extends AquariumDevice { constructor(c: EquipmentContext) { super('spongeFilter', c); } }
export class AirPump extends AquariumDevice { constructor(c: EquipmentContext) { super('airPump', c); } }
export class AirStone extends AquariumDevice { constructor(c: EquipmentContext) { super('airStone', c); } }
export class Heater extends AquariumDevice { constructor(c: EquipmentContext) { super('heater', c); } }
export class Thermometer extends AquariumDevice { constructor(c: EquipmentContext) { super('thermometer', c); } }
export class Thermostat extends AquariumDevice { constructor(c: EquipmentContext) { super('thermostat', c); } }
export class FlowPump extends AquariumDevice { constructor(c: EquipmentContext) { super('flowPump', c); } }
export class CirculationPump extends AquariumDevice { constructor(c: EquipmentContext) { super('circulationPump', c); } }
export class Chiller extends AquariumDevice { constructor(c: EquipmentContext) { super('chiller', c); } }
export class PowerStrip extends AquariumDevice { constructor(c: EquipmentContext) { super('powerStrip', c); } }
