import { describe, expect, it } from 'vitest';
import { Box3, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { AquariumEquipment, AquariumDevice, AquariumTank, Cable, EQUIPMENT_KINDS, EquipmentMaterials, Hose, normalizeEquipment, routeConnection, STANDARD_TANK, validateConnection } from '../../src/aquarium';

const camera = () => { const c = new PerspectiveCamera(40, 1, 0.003, 20); c.position.set(0.6, 0.3, 0.8); c.updateMatrixWorld(); return c; };
const triangles = (root: AquariumDevice, level: number) => { let n = 0; root.lod.levels[level].object.traverse((o) => { if (o instanceof Mesh) n += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; }); return n; };

describe('aquarium equipment', () => {
  it('constructs every device with progressively lighter LODs and one shared palette', () => {
    const materials = new EquipmentMaterials(), context = { materials };
    for (const kind of EQUIPMENT_KINDS) {
      const d = new AquariumDevice(kind, context);
      expect(d.lod.levels).toHaveLength(3);
      expect(triangles(d, 0), kind).toBeGreaterThanOrEqual(triangles(d, 1));
      expect(triangles(d, 1), kind).toBeGreaterThanOrEqual(triangles(d, 2));
      expect(triangles(d, 0), kind).toBeLessThan(22000);
      d.traverse((o) => { if (o instanceof Mesh) { expect(Object.values(materials)).toContain(o.material); expect([...o.geometry.attributes.position.array].every(Number.isFinite)).toBe(true); } });
      d.dispose();
    }
    const tank = new AquariumTank({ materials, dimensions: { width: 0.9, depth: 0.45, height: 0.45, glass: 0.008, waterHeight: 0.38 } });
    const box = new Box3().setFromObject(tank); expect(box.max.x - box.min.x).toBeCloseTo(0.916, 3); expect(box.max.y).toBeCloseTo(0.45075, 3);
    tank.dispose(); materials.dispose();
  });
  it('powers lamps, water circulation and air through actual connections, with immediate OFF propagation', () => {
    const rig = new AquariumEquipment(); rig.update(0.016, camera());
    expect(rig.lightLevel).toBe(1); expect(rig.flows.some((f) => f.device === 'canisterFilter')).toBe(true);
    expect(rig.getObjectByProperty('type', 'Points')?.visible).toBe(true);
    rig.changeDevice('powerStrip', { enabled: false }); rig.update(0.016, camera());
    expect(rig.lightLevel).toBe(0); expect(rig.flows).toHaveLength(0); expect(rig.getObjectByProperty('type', 'Points')?.visible).toBe(false);
    rig.changeDevice('powerStrip', { enabled: true }); rig.update(0.016, camera()); expect(rig.lightLevel).toBe(1);
    rig.disconnect(rig.currentLayout.connections.find((c) => c.to.device === 'canisterFilter' && c.kind === 'water')!.id);
    rig.update(0.016, camera()); expect(rig.flows).toHaveLength(0); rig.dispose();
  });
  it('rejects incompatible, duplicate and cyclic power connections without changing the circuit', () => {
    const rig = new AquariumEquipment(), before = rig.currentLayout.connections.length;
    const bad = { id: 'bad', kind: 'water' as const, from: { device: 'powerStrip', port: 'socket0' }, to: { device: 'canisterFilter', port: 'in' }, radius: 0.008 };
    expect(rig.connect(bad)).toMatch(/種類/); expect(rig.currentLayout.connections).toHaveLength(before);
    const existing = rig.currentLayout.connections.find((c) => c.to.device === 'ledLight')!;
    expect(rig.connect({ ...existing, id: 'duplicate' })).toMatch(/使用中/);
    const id = rig.addDevice('powerStrip')!;
    const first = { id: 'chain', kind: 'power' as const, from: { device: 'powerStrip', port: 'socket5' }, to: { device: id, port: 'power' }, radius: 0.003 };
    expect(rig.connect(first)).toBeNull();
    const cycle = { ...first, id: 'cycle', from: { device: id, port: 'socket0' }, to: { device: 'powerStrip', port: 'power' } };
    expect(validateConnection(cycle, rig.resolvePort, [first])).toMatch(/循環/); rig.dispose();
  });
  it('keeps endpoints attached after placement changes, rotation and assembly transforms', () => {
    const rig = new AquariumEquipment(); rig.position.set(1, 0.8, -2); rig.rotation.y = 0.6; rig.updateMatrixWorld(true);
    rig.changeDevice('heater', { position: [0.21, 0.18, -0.13], rotation: Math.PI / 3 });
    const c = rig.currentLayout.connections.find((c) => c.to.device === 'heater')!;
    const points = routeConnection(c, rig.resolvePort, STANDARD_TANK, rig);
    const endpoint = rig.resolvePort(c.to)!.anchor.getWorldPosition(new Vector3());
    expect(new Vector3(...points[points.length - 1]).applyMatrix4(rig.matrixWorld).distanceTo(endpoint)).toBeLessThan(1e-6);
    // Rear routing gets above the rim and includes a drip loop below the supply socket.
    expect(points.some((p) => p[1] > STANDARD_TANK.height)).toBe(true);
    expect(points.some((p) => p[1] < points[0][1] - 0.06)).toBe(true); rig.dispose();
  });
  it('restores edited equipment, connections and stand without adding removed default devices', () => {
    const rig = new AquariumEquipment(); rig.setStand('metal'); rig.removeDevice('airPump');
    rig.changeDevice('heater', { enabled: false, position: [0.2, 0.18, -0.12] });
    const saved = JSON.parse(JSON.stringify(rig.currentLayout)); rig.setLayout(saved);
    expect(rig.currentLayout).toEqual(saved); expect(rig.devices.has('airPump')).toBe(false);
    expect(rig.currentLayout.connections.some((c) => c.from.device === 'airPump')).toBe(false);
    const copy = rig.currentLayout; copy.devices[0].position[0] = 88; expect(rig.currentLayout.devices[0].position[0]).not.toBe(88); rig.dispose();
  });
  it('places standard equipment against the walls of a different tank size', () => {
    const rig = new AquariumEquipment({ width: 0.9, depth: 0.45, height: 0.45, glass: 0.008, waterHeight: 0.38 });
    const heater = rig.currentLayout.devices.find((d) => d.kind === 'heater')!;
    expect(heater.position[0]).toBeCloseTo(0.405); expect(heater.position[2]).toBeCloseTo(-0.213);
    expect(rig.currentLayout.devices.find((d) => d.kind === 'ledLight')!.position[1]).toBeCloseTo(0.52);
    rig.update(0.016, camera()); expect(rig.flows).toHaveLength(1); rig.dispose();
  });
  it('controls heat from the connected sensor and does not heat after the sensor is removed', () => {
    const rig = new AquariumEquipment(), state = rig.currentLayout; state.temperature = 20; rig.setLayout(state);
    rig.update(1, camera()); expect(rig.devices.get('heater')!.powered).toBe(true); expect(rig.temperature).toBeGreaterThan(20);
    rig.removeDevice('thermometer'); rig.update(1, camera()); expect(rig.devices.get('heater')!.powered).toBe(false); rig.dispose();
  });
  it('requires a complete serial chiller circuit and returns a directed local water velocity', () => {
    const rig = new AquariumEquipment(); const chiller = rig.addDevice('chiller')!; rig.autoConnect(); rig.update(0.016, camera());
    expect(rig.currentLayout.connections.some((c) => c.from.device === 'canisterFilter' && c.to.device === chiller)).toBe(true);
    const f = rig.flows[0]; expect(f).toBeDefined(); expect(rig.sampleFlow(f.position).dot(f.direction)).toBeGreaterThan(0);
    expect(rig.sampleFlow(new Vector3(10, 10, 10)).length()).toBe(0);
    rig.disconnect(rig.currentLayout.connections.find((c) => c.from.device === chiller && c.kind === 'water')!.id); rig.update(0.016, camera()); expect(rig.flows).toHaveLength(0); rig.dispose();
  });
  it('supports parametric hose/cable paths without losing endpoints, including repeated points', () => {
    const m = new EquipmentMaterials(), a: [number, number, number] = [0, 0, 0], b: [number, number, number] = [0.3, 0.4, -0.2];
    for (const Line of [Hose, Cable]) { const l = new Line(m, a, b, 0.003, [a, [0, 0.2, 0], b]); l.traverse((o) => { if (o instanceof Mesh) expect([...o.geometry.attributes.position.array].every(Number.isFinite)).toBe(true); }); l.setPath(b, a); expect(l.lod.levels).toHaveLength(3); l.dispose(); }
    m.dispose();
  });
  it('does not produce water flow or bubbles when moved out of the aquarium', () => {
    const rig = new AquariumEquipment(), pump = rig.addDevice('flowPump')!; rig.autoConnect(); rig.update(0.016, camera());
    expect(rig.flows.some((f) => f.device === pump)).toBe(true);
    rig.changeDevice(pump, { position: [0.6, 0.25, 0] }); rig.changeDevice('airStone', { position: [-0.24, 0.4, -0.1] }); rig.update(0.016, camera());
    expect(rig.flows.some((f) => f.device === pump)).toBe(false); expect(rig.getObjectByProperty('type', 'Points')?.visible).toBe(false);
    const edge = rig.currentLayout.connections[0]; expect(rig.connect(edge)).toMatch(/識別子/); rig.dispose();
  });
  it('migrates missing equipment and sanitises imported positions and settings', () => {
    expect(normalizeEquipment(undefined).devices.length).toBeGreaterThan(0);
    const s = normalizeEquipment({ version: 1, devices: [{ id: 'bad', kind: 'heater', position: [NaN, 1, 2], setting: Infinity }, { id: 'bad', kind: 'heater' }, { id: 'tank', kind: 'heater' }], connections: [], temperature: NaN });
    expect(s.devices).toHaveLength(1); expect(s.devices[0].position.every(Number.isFinite)).toBe(true); expect(s.temperature).toBe(24);
  });
});
