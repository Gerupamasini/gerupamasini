import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Bone, Group, Mesh, Object3D, Vector3 } from 'three';
import { SpeciesSchema } from '../../src/data/schemas/species';
import { generateIndividual } from '../../src/creatures/Individual';
import { modelFor } from '../../src/creatures/models/choice';
import { MahazeDriver } from '../../src/creatures/species/mahaze/MahazeDriver';

const species = SpeciesSchema.parse(JSON.parse(readFileSync(new URL('../../public/data/species/acanthogobius_flavimanus.json', import.meta.url).pathname, 'utf8')));

interface RigJson {
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: { name?: string; translation?: [number, number, number]; rotation?: [number, number, number, number]; scale?: [number, number, number]; children?: number[]; mesh?: number; extras?: Record<string, unknown> }[];
  meshes: { primitives: { material: number }[] }[];
  materials: { extras?: Record<string, unknown> }[];
  skins: { joints: number[] }[];
}

/** Read the actual model's rest rig and material metadata without loading GPU textures. */
function modelRig(rel: string) {
  const buf = readFileSync(new URL(`../../src/assets/models/${rel}`, import.meta.url).pathname);
  const json: RigJson = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const joints = new Set(json.skins.flatMap((s) => s.joints)), root = new Group();
  const bones: Record<string, Object3D> = {}, meshes: Object3D[] = [];
  const nodes = json.nodes.map((n, i) => {
    const node = n.mesh !== undefined ? new Mesh() : joints.has(i) ? new Bone() : new Object3D();
    node.name = n.name ?? ''; node.userData = { ...n.extras };
    if (n.translation) node.position.fromArray(n.translation);
    if (n.rotation) node.quaternion.fromArray(n.rotation);
    if (n.scale) node.scale.fromArray(n.scale);
    if (node instanceof Bone) bones[node.name] = node;
    if (n.mesh !== undefined) {
      node.userData.mahaze = json.materials[json.meshes[n.mesh].primitives[0].material].extras?.mahaze;
      meshes.push(node);
    }
    return node;
  });
  json.nodes.forEach((n, i) => { for (const child of n.children ?? []) nodes[i].add(nodes[child]); });
  for (const i of json.scenes[json.scene ?? 0].nodes) root.add(nodes[i]);
  return { root, bones, meshes };
}

function occupant(length: number, tier: 'hero' | 'lod1' | 'lod2', parent?: Group) {
  const ind = generateIndividual(species, 1, 0.06, -0.04, 0, 0, 0, [length, length]);
  const model = modelRig(modelFor(species, ind.stage)[tier]!);
  if (parent) { parent.add(model.root); parent.updateMatrixWorld(true); }
  const driver = new MahazeDriver(); driver.attach(model.root, ind, {}, model.bones, model.meshes);
  const update = (floorY: number) => {
    for (let i = 0; i < 90; i++) driver.update(1 / 60, { floor: { heightAt: () => floorY, waterAt: () => 0.3 }, player: new Vector3(0, 1, 2), simScale: 1, nowMs: i * 1000 / 60 });
    model.root.updateWorldMatrix(true, true);
  };
  return { ...model, driver, ind, update };
}

describe('goby contact placement in a raised aquarium', () => {
  afterEach(() => vi.restoreAllMocks());

  for (const length of [50, 100, 180]) for (const tier of ['hero', 'lod1', 'lod2'] as const) {
    it(`${length} mm ${tier} rests at the same tank-local height with a 73 cm parent offset`, () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const tank = new Group(); tank.position.y = 0.73;
      const base = occupant(length, tier), raised = occupant(length, tier, tank);
      base.update(0.05); raised.update(0.05);
      expect(raised.root.position.y).toBeCloseTo(base.root.position.y, 9);
      expect(raised.root.getWorldPosition(new Vector3()).y - base.root.getWorldPosition(new Vector3()).y).toBeCloseTo(0.73, 9);
      expect(raised.ind.pos.y).toBeCloseTo(base.ind.pos.y, 9);
      expect(raised.root.position.y).toBeGreaterThanOrEqual(0.05);
      expect(raised.root.position.y).toBeLessThan(0.1);
      base.driver.dispose(); raised.driver.dispose();
    });
  }

  it('keeps contact after a parent moves, rotates and scales, and after the substrate changes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = occupant(180, 'lod1'), moved = occupant(180, 'lod1'), tank = new Group();
    tank.add(moved.root); tank.position.set(1.2, 0.73, -0.6); tank.rotation.set(0.1, 0.5, -0.08); tank.scale.setScalar(1.5);
    for (const floorY of [0.05, 0, 0.05]) {
      base.update(floorY); moved.update(floorY);
      expect(moved.root.position.distanceTo(base.root.position)).toBeLessThan(1e-8);
      const expected = tank.localToWorld(base.root.position.clone());
      expect(moved.root.getWorldPosition(new Vector3()).distanceTo(expected)).toBeLessThan(1e-8);
    }
    base.driver.dispose(); moved.driver.dispose();
  });
});
