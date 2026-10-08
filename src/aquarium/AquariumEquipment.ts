import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, Object3D, SpotLight, Vector3, type Camera } from 'three';
import { AquariumDevice, AquariumStand, AquariumTank, type EquipmentPort } from './Equipment';
import { BubbleEmitter } from './Bubbles';
import { Cable, Hose, makeConnector, routeConnection, validateConnection, type FlexibleLine } from './Connections';
import { EquipmentMaterials } from './Materials';
import { defaultEquipmentLayout, EQUIPMENT_MAX, FLOW_KINDS, makeEquipment, normalizeEquipment, STANDARD_TANK, type ConnectionRecord, type Endpoint, type EquipmentKind, type EquipmentLayout, type EquipmentRecord, type TankDimensions, type Vec3 } from './state';

export interface WaterFlow { position: Vector3; direction: Vector3; flowRate: number; radius: number; device: string }
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
/** Readable geometry digits, batched into one mesh; no canvas redraws, textures or per-device materials. */
class TemperatureDisplay extends Group {
  private value = '';
  private readonly mesh: Mesh;
  constructor(materials: EquipmentMaterials, width: number, z: number, y = 0) { super(); this.mesh = new Mesh(new BufferGeometry(), materials.indicator); this.add(this.mesh); this.scale.setScalar(width / 0.026); this.position.set(0, y, z); }
  setValue(v: number): void {
    const s = Math.max(0, Math.min(99.9, v)).toFixed(1).replace('.', '').padStart(3, '0'); if (s === this.value) return; this.value = s;
    const positions: number[] = [], normals: number[] = [];
    const rect = (x: number, y: number, w: number, h: number) => { for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { positions.push(x + a * w / 2, y + b * h / 2, 0); normals.push(0, 0, 1); } };
    const bars: Record<string, [number, number, number, number]> = { a: [0, 0.005, 0.005, 0.00065], b: [0.003, 0.0025, 0.00065, 0.004], c: [0.003, -0.0025, 0.00065, 0.004], d: [0, -0.005, 0.005, 0.00065], e: [-0.003, -0.0025, 0.00065, 0.004], f: [-0.003, 0.0025, 0.00065, 0.004], g: [0, 0, 0.005, 0.00065] };
    for (let i = 0; i < 3; i++) for (const key of DIGITS[Number(s[i])]) { const [x, y, w, h] = bars[key]; rect(x + (i - 1) * 0.0085, y, w, h); }
    rect(0.0047, -0.0049, 0.0009, 0.0009);
    this.mesh.geometry.dispose(); this.mesh.geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)).setAttribute('normal', new Float32BufferAttribute(normals, 3));
  }
  override dispose(): void { this.mesh.geometry.dispose(); this.removeFromParent(); }
}

/** Reusable equipment assembly. Water/glass optical simulation remains owned by the host TankScene. */
export class AquariumEquipment extends Group {
  readonly materials = new EquipmentMaterials();
  readonly tank: AquariumTank;
  stand: AquariumStand;
  readonly devices = new Map<string, AquariumDevice>();
  readonly flows: WaterFlow[] = [];
  readonly warnings: string[] = [];
  private layout: EquipmentLayout = defaultEquipmentLayout();
  private readonly lines = new Map<string, FlexibleLine>();
  private readonly fittings = new Group();
  private readonly bubbles = new Map<string, BubbleEmitter>();
  private readonly displays = new Map<string, TemperatureDisplay>();
  private readonly lights = new Map<string, SpotLight>();
  private readonly mains = new Object3D();
  private readonly vector = new Vector3();
  private readonly current = new Vector3();
  private readonly waterPoint = new Vector3();
  private time = 0;
  private rippleAcc = 0;
  private readonly heaterDemand = new Map<string, boolean>();
  private readonly chillerDemand = new Map<string, boolean>();
  onRipple: ((x: number, z: number, strength: number) => void) | null = null;
  constructor(readonly dimensions: TankDimensions = STANDARD_TANK) {
    super(); this.name = 'AquariumEquipment';
    const c = { materials: this.materials, dimensions }; this.tank = new AquariumTank(c); this.stand = new AquariumStand(c);
    this.mains.position.set(0, -0.16, -dimensions.depth / 2 - 0.13); this.mains.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(0, 0, 1));
    const outlet = new Mesh(new BoxGeometry(0.045, 0.07, 0.009), this.materials.paintedMetal); outlet.position.copy(this.mains.position); outlet.position.z -= 0.005;
    this.add(this.tank, this.stand, this.fittings, this.mains, outlet); this.setLayout();
  }
  resolvePort = (p: Endpoint): EquipmentPort | undefined => {
    if (p.device === 'mains' && p.port === 'socket') return { name: 'socket', kind: 'power', role: 'out', anchor: this.mains, radius: 0.003 };
    return (p.device === 'tank' ? this.tank : this.devices.get(p.device))?.ports.get(p.port);
  };
  get currentLayout(): EquipmentLayout { return { ...this.layout, devices: this.layout.devices.map((d) => ({ ...d, position: [...d.position] })), connections: this.layout.connections.map((c) => ({ ...c, from: { ...c.from }, to: { ...c.to }, via: c.via?.map((p) => [...p] as Vec3) })) }; }
  get temperature(): number { return this.layout.temperature; }
  get lightLevel(): number { return [...this.devices.values()].filter((d) => (d.kind === 'ledLight' || d.kind === 'lightFixture') && d.powered).length; }
  setLayout(raw?: EquipmentLayout): void {
    for (const d of this.devices.values()) d.dispose(); this.devices.clear();
    for (const b of this.bubbles.values()) b.dispose(); this.bubbles.clear();
    for (const d of this.displays.values()) d.dispose(); this.displays.clear();
    for (const l of this.lights.values()) { l.target.removeFromParent(); l.removeFromParent(); l.dispose(); } this.lights.clear();
    this.layout = normalizeEquipment(raw, this.dimensions); this.setStand(this.layout.stand);
    this.heaterDemand.clear(); this.chillerDemand.clear();
    for (const r of this.layout.devices) this.spawn(r);
    if (!raw) this.autoConnect(); else this.rebuildConnections();
    this.refreshOperation();
  }
  private spawn(r: EquipmentRecord): void {
    const d = new AquariumDevice(r.kind, { materials: this.materials, dimensions: this.dimensions }); d.name = r.id; d.userData.equipmentId = r.id; d.position.fromArray(r.position); d.rotation.y = r.rotation; d.enabled = r.enabled;
    this.devices.set(r.id, d); this.add(d);
    if (r.kind === 'airStone' || r.kind === 'spongeFilter') { const b = new BubbleEmitter(); this.bubbles.set(r.id, b); this.add(b); }
    if (['thermometer', 'thermostat', 'chiller'].includes(r.kind)) {
      const screen = new TemperatureDisplay(this.materials, r.kind === 'thermometer' ? 0.022 : 0.044, r.kind === 'thermometer' ? 0.0075 : r.kind === 'thermostat' ? 0.0165 : 0.145, r.kind === 'thermostat' ? 0.012 : r.kind === 'chiller' ? 0.272 : 0);
      screen.setValue(this.temperature); d.add(screen); this.displays.set(r.id, screen);
    }
    if (r.kind === 'ledLight' || r.kind === 'lightFixture') {
      const light = new SpotLight(0xdff4ff, 0.7, 1.4, 1.0, 0.75, 1.5); light.position.set(0, -0.012, 0); light.target.position.set(0, -0.4, 0); d.add(light, light.target); this.lights.set(r.id, light);
    }
  }
  setStand(finish: 'wood' | 'metal'): void {
    this.layout.stand = finish; this.stand.dispose(); this.stand = new AquariumStand({ materials: this.materials, dimensions: this.dimensions }, finish); this.add(this.stand);
  }
  addDevice(kind: EquipmentKind): string | null {
    if (this.devices.size >= EQUIPMENT_MAX) return null;
    let i = 1, id = `${kind}-${i}`; while (this.devices.has(id)) id = `${kind}-${++i}`;
    const r = makeEquipment(kind, id, this.dimensions); const duplicates = this.layout.devices.filter((d) => d.kind === kind).length;
    if (duplicates) r.position[0] = Math.max(-0.7, Math.min(0.7, r.position[0] + 0.055 * duplicates));
    this.layout.devices.push(r); this.spawn(r); this.refreshOperation(); return id;
  }
  removeDevice(id: string): void {
    this.devices.get(id)?.dispose(); this.devices.delete(id); this.bubbles.get(id)?.dispose(); this.bubbles.delete(id); this.displays.get(id)?.dispose(); this.displays.delete(id);
    const l = this.lights.get(id); l?.target.removeFromParent(); l?.removeFromParent(); l?.dispose(); this.lights.delete(id);
    this.layout.devices = this.layout.devices.filter((d) => d.id !== id); this.layout.connections = this.layout.connections.filter((c) => c.from.device !== id && c.to.device !== id); this.rebuildConnections(); this.refreshOperation();
  }
  changeDevice(id: string, change: Partial<Pick<EquipmentRecord, 'position' | 'rotation' | 'enabled' | 'setting'>>): void {
    const r = this.layout.devices.find((d) => d.id === id), d = this.devices.get(id); if (!r || !d) return;
    const next = normalizeEquipment({ ...this.layout, devices: [{ ...r, ...change }] }, this.dimensions).devices[0]; if (!next) return;
    Object.assign(r, next); d.position.fromArray(r.position); d.rotation.y = r.rotation; d.enabled = r.enabled; this.rebuildConnections(); this.refreshOperation();
  }
  connect(c: ConnectionRecord): string | null {
    const error = validateConnection(c, this.resolvePort, this.layout.connections); if (error) return error;
    this.layout.connections.push(c); this.rebuildConnections(); this.refreshOperation(); return null;
  }
  disconnect(id: string): void { this.layout.connections = this.layout.connections.filter((c) => c.id !== id); this.rebuildConnections(); this.refreshOperation(); }
  /** Defaults choose a single serial water circuit; extra devices stay available for manual wiring. */
  autoConnect(): void {
    const connections: ConnectionRecord[] = [], list = this.layout.devices;
    const first = (kind: EquipmentKind) => list.find((d) => d.kind === kind)?.id;
    const link = (kind: ConnectionRecord['kind'], from: string | undefined, fp: string, to: string | undefined, tp: string, radius = kind === 'water' ? 0.008 : kind === 'air' ? 0.002 : kind === 'sensor' ? 0.001 : 0.003) => {
      if (!from || !to) return; const c: ConnectionRecord = { id: `auto-${connections.length}`, kind, from: { device: from, port: fp }, to: { device: to, port: tp }, radius };
      if (!validateConnection(c, this.resolvePort, connections)) connections.push(c);
    };
    const strips = list.filter((d) => d.kind === 'powerStrip');
    if (strips.length) link('power', 'mains', 'socket', strips[0].id, 'power');
    let socket = 0, strip = 0;
    for (const d of list) {
      if (d.kind === 'powerStrip' || !this.devices.get(d.id)?.ports.has('power')) continue;
      if (d.kind === 'heater' && first('thermostat')) { link('power', first('thermostat'), 'heater', d.id, 'power'); continue; }
      // Reserve the sixth outlet to supply the next strip, if one was placed.
      if (socket >= 5 && strips[strip + 1]) { link('power', strips[strip]?.id, `socket${socket}`, strips[strip + 1].id, 'power'); strip++; socket = 0; }
      if (socket < 6) link('power', strips[strip]?.id, `socket${socket++}`, d.id, 'power');
    }
    link('sensor', first('thermometer'), 'sensor', first('thermostat'), 'sensor');
    const can = first('canisterFilter'), chill = first('chiller');
    if (can) { link('water', 'tank', 'intake', can, 'in'); link('water', can, 'out', chill ?? 'tank', chill ? 'in' : 'return'); if (chill) link('water', chill, 'out', 'tank', 'return'); }
    const air = list.filter((d) => d.kind === 'airPump'), emitters = list.filter((d) => d.kind === 'airStone' || d.kind === 'spongeFilter');
    emitters.forEach((d, i) => link('air', air[i]?.id, 'air', d.id, 'air'));
    this.layout.connections = connections; this.rebuildConnections(); this.refreshOperation();
  }
  private rebuildConnections(): void {
    for (const l of this.lines.values()) l.dispose(); this.lines.clear(); this.fittings.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); }); this.fittings.clear();
    this.updateWorldMatrix(true, true); const accepted: ConnectionRecord[] = []; this.warnings.length = 0;
    for (const c of this.layout.connections) {
      const error = validateConnection(c, this.resolvePort, accepted); if (error) { this.warnings.push(`${c.id}: ${error}`); continue; }
      accepted.push(c); const points = routeConnection(c, this.resolvePort, this.dimensions, this);
      // Routed positions are converted back to assembly space, allowing this Group to be placed anywhere.
      const local = points;
      const Line = c.kind === 'water' || c.kind === 'air' ? Hose : Cable;
      const line = new Line(this.materials, local[0], local[local.length - 1], c.radius, local.slice(1, -1)); line.name = c.id; this.lines.set(c.id, line); this.add(line);
      if (c.kind === 'air' && (this.devices.get(c.from.device)?.position.y ?? 0) < this.dimensions.waterHeight) {
        const v = new Mesh(new CylinderGeometry(0.004, 0.004, 0.023, 10), this.materials.clearPlastic);
        const point = local.find((p) => p[1] >= this.dimensions.height + 0.026) ?? local[1];
        v.position.fromArray(point); this.fittings.add(v);
      }
      for (const p of [c.from, c.to]) { const port = this.resolvePort(p)!; const fitting = makeConnector(port, this.materials); const owner = p.device === 'tank' ? this.tank : p.device === 'mains' ? this : this.devices.get(p.device)!; owner.updateWorldMatrix(true, false); const pos = port.anchor.getWorldPosition(new Vector3()); fitting.position.copy(this.worldToLocal(pos)); fitting.quaternion.copy(this.getWorldQuaternion(fitting.quaternion).invert().multiply(port.anchor.getWorldQuaternion(new Object3D().quaternion))); this.fittings.add(fitting); }
    }
    // Only validated edges drive operation. Reject corrupt saved edges instead of rendering half a circuit.
    this.layout.connections = accepted;
    this.buildTankPlumbing();
  }
  private buildTankPlumbing(): void {
    const d = this.dimensions;
    for (const name of ['intake', 'return']) {
      if (!this.layout.connections.some((c) => c.from.device === 'tank' && c.from.port === name || c.to.device === 'tank' && c.to.port === name)) continue;
      const x = (name === 'intake' ? -1 : 1) * (d.width / 2 - 0.035), z = -d.depth / 2;
      const points: Vec3[] = [[x, d.height + 0.012, z - 0.02], [x, d.height + 0.028, z - 0.02], [x, d.height + 0.028, z + 0.026], [x, d.height - 0.03, z + 0.026], [x, name === 'intake' ? 0.09 : d.waterHeight - 0.025, z + 0.026]];
      const pipe = new Hose(this.materials, points[0], points[points.length - 1], 0.008, points.slice(1, -1)); this.lines.set(`tank-${name}`, pipe); this.add(pipe);
      if (name === 'intake') { const mesh = new Mesh(new BoxGeometry(0.022, 0.042, 0.024), this.materials.blackPlastic); mesh.position.set(x, 0.071, z + 0.026); this.fittings.add(mesh); }
    }
  }
  private supplied(id: string, visiting = new Set<string>()): boolean {
    if (id === 'mains') return true; const d = this.devices.get(id); if (!d || !d.enabled || visiting.has(id)) return false;
    visiting.add(id);
    const edge = this.layout.connections.find((c) => c.kind === 'power' && c.to.device === id && c.to.port === 'power'); if (!edge || !this.supplied(edge.from.device, visiting)) return false;
    if (this.devices.get(edge.from.device)?.kind === 'thermostat' && edge.from.port === 'heater') return this.heaterDemand.get(edge.from.device) ?? false;
    return true;
  }
  private waterCircuit(id: string): boolean {
    const walk = (device: string, upstream: boolean, seen = new Set<string>()): boolean => {
      if (device === 'tank') return true; if (seen.has(device)) return false; seen.add(device);
      const edge = this.layout.connections.find((c) => c.kind === 'water' && (upstream ? c.to.device === device : c.from.device === device));
      return !!edge && walk(upstream ? edge.from.device : edge.to.device, upstream, seen);
    };
    return walk(id, true) && walk(id, false);
  }
  private refreshOperation(): void {
    for (const thermostat of this.layout.devices.filter((d) => d.kind === 'thermostat')) {
      const sensor = this.layout.connections.some((c) => c.kind === 'sensor' && c.to.device === thermostat.id && this.devices.get(c.from.device)?.enabled);
      if (!sensor || !this.supplied(thermostat.id)) this.heaterDemand.set(thermostat.id, false);
      else if (this.temperature < thermostat.setting - 0.2) this.heaterDemand.set(thermostat.id, true);
      else if (this.temperature >= thermostat.setting + 0.2) this.heaterDemand.set(thermostat.id, false);
    }
    this.flows.length = 0;
    for (const r of this.layout.devices) {
      const d = this.devices.get(r.id)!; d.setPowered(this.supplied(r.id));
      const light = this.lights.get(r.id); if (light) light.intensity = d.powered ? 0.7 : 0;
      if (r.kind === 'glassLid') d.visible = r.enabled;
      const screen = this.displays.get(r.id); if (screen) { screen.visible = r.kind === 'thermometer' ? r.enabled : d.powered; screen.setValue(this.temperature); }
      if (d.powered && FLOW_KINDS.includes(r.kind) && (r.kind !== 'canisterFilter' || this.waterCircuit(r.id))) {
        const position = d.getWorldPosition(new Vector3()), direction = new Vector3(0, 0, 1).transformDirection(d.matrixWorld);
        if (r.kind === 'canisterFilter') position.set(this.dimensions.width / 2 - 0.035, this.dimensions.waterHeight - 0.025, -this.dimensions.depth / 2 + 0.026).applyMatrix4(this.matrixWorld);
        if (r.kind === 'topFilter') { d.localToWorld(position.set(this.dimensions.width * 0.25, -0.085, 0.018)); direction.set(0, -1, 0).transformDirection(d.matrixWorld); }
        const local = this.worldToLocal(position.clone());
        if (local.y >= 0 && local.y <= this.dimensions.waterHeight + 0.025 && Math.abs(local.x) < this.dimensions.width / 2 && Math.abs(local.z) < this.dimensions.depth / 2)
          this.flows.push({ position, direction, flowRate: r.setting, radius: r.kind === 'flowPump' ? 0.18 : 0.085, device: r.id });
      }
      const b = this.bubbles.get(r.id); if (b) { const air = this.layout.connections.find((c) => c.kind === 'air' && c.to.device === r.id); b.visible = r.enabled && r.position[1] >= 0 && r.position[1] + (r.kind === 'spongeFilter' ? 0.213 : 0.008) < this.dimensions.waterHeight && Math.abs(r.position[0]) < this.dimensions.width / 2 && Math.abs(r.position[2]) < this.dimensions.depth / 2 && !!air && this.supplied(air.from.device); }
    }
  }
  sampleFlow(point: Vector3, out = new Vector3()): Vector3 {
    out.set(0, 0, 0);
    for (const f of this.flows) { const distance = point.distanceTo(f.position); if (distance < f.radius) out.addScaledVector(f.direction, Math.min(0.15, f.flowRate / 12000) * (1 - distance / f.radius) ** 2); }
    return out;
  }
  update(dt: number, camera: Camera, viewportHeight = 720): void {
    this.time += dt; this.updateWorldMatrix(true, true); this.refreshOperation(); this.tank.updateLOD(camera); this.stand.updateLOD(camera);
    for (const d of this.devices.values()) d.updateLOD(camera); for (const l of this.lines.values()) l.updateLOD(camera);
    this.rippleAcc += dt;
    for (const [id, b] of this.bubbles) {
      const d = this.devices.get(id)!; this.vector.set(0, d.kind === 'spongeFilter' ? 0.213 : 0.008, d.kind === 'spongeFilter' ? 0.035 : 0); d.localToWorld(this.vector);
      b.update(this.time, this.vector, this.localToWorld(this.waterPoint.set(0, this.dimensions.waterHeight, 0)).y, viewportHeight, this.sampleFlow(this.vector, this.current));
      if (b.visible && this.rippleAcc > 0.25) this.onRipple?.(this.vector.x, this.vector.z, 0.25);
    }
    if (this.rippleAcc > 0.25) { for (const f of this.flows) if (f.position.y > this.dimensions.waterHeight - 0.06) this.onRipple?.(f.position.x, f.position.z, Math.min(0.5, f.flowRate / 1600)); this.rippleAcc = 0; }
    let cooling = 0;
    for (const chill of this.layout.devices.filter((r) => r.kind === 'chiller')) {
      if (!this.supplied(chill.id) || !this.waterCircuit(chill.id)) this.chillerDemand.set(chill.id, false);
      else if (this.temperature > chill.setting + 0.3) this.chillerDemand.set(chill.id, true); else if (this.temperature < chill.setting - 0.3) this.chillerDemand.set(chill.id, false);
      if (this.chillerDemand.get(chill.id)) cooling += 150;
    }
    const heating = this.layout.devices.filter((r) => r.kind === 'heater' && this.devices.get(r.id)?.powered && r.position[1] - 0.085 >= 0 && r.position[1] + 0.07 <= this.dimensions.waterHeight && Math.abs(r.position[0]) < this.dimensions.width / 2 && Math.abs(r.position[2]) < this.dimensions.depth / 2).length * 100;
    const watts = heating - cooling - (this.temperature - 22) * 2;
    const litres = this.dimensions.width * this.dimensions.depth * this.dimensions.waterHeight * 1000;
    this.layout.temperature = Math.max(5, Math.min(40, this.temperature + watts * Math.min(dt, 1) / (4184 * litres)));
  }
  /** Camera/LOD update while the layout editor deliberately pauses the simulation. */
  updateFrozen(camera: Camera): void { this.updateWorldMatrix(true, true); this.refreshOperation(); this.tank.updateLOD(camera); this.stand.updateLOD(camera); for (const d of this.devices.values()) d.updateLOD(camera); for (const l of this.lines.values()) l.updateLOD(camera);
    for (const [id, b] of this.bubbles) { const d = this.devices.get(id)!; this.vector.set(0, d.kind === 'spongeFilter' ? 0.213 : 0.008, d.kind === 'spongeFilter' ? 0.035 : 0); d.localToWorld(this.vector); b.update(this.time, this.vector, this.localToWorld(this.waterPoint.set(0, this.dimensions.waterHeight, 0)).y, 720, this.sampleFlow(this.vector, this.current)); }
  }
  override dispose(): void { for (const b of this.bubbles.values()) b.dispose(); for (const s of this.displays.values()) s.dispose(); for (const l of this.lights.values()) l.dispose(); for (const d of this.devices.values()) d.dispose(); for (const l of this.lines.values()) l.dispose(); this.tank.dispose(); this.stand.dispose(); this.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); }); this.materials.dispose(); this.removeFromParent(); }
}
