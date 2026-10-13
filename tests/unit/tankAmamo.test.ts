import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { TankAmamo, TankAmamoPlant } from '../../src/app/TankAmamo';
import { buildTankItem, TANK_ITEM_TYPES } from '../../src/app/TankLayout';
import { AmamoPatch } from '../../src/world/amamo';
import { emptySave, InvalidSaveError, parseSave } from '../../src/core/Save';
import { newRoomTank } from '../../src/aquarium/room';

describe('aquarium amamo interior', () => {
  it('uses the meadow model, keeps the old plant, and shares resources until the last clump is removed', () => {
    expect(TANK_ITEM_TYPES).toEqual(expect.arrayContaining(['plant', 'amamo']));
    const resources = new TankAmamo(), one = buildTankItem('amamo', 17, resources) as TankAmamoPlant;
    const two = buildTankItem('amamo', 17, resources) as TankAmamoPlant;
    expect(one).toBeInstanceOf(AmamoPatch);
    expect(one.shoots).toEqual(two.shoots);
    expect(one.shootCount).toBeGreaterThan(0); expect(one.shootCount).toBeLessThanOrEqual(3);
    expect(one.maxLength).toBeLessThan(0.3);
    expect(one.leafCluster.material).toBe(two.leafCluster.material);
    const material = resources.kit!.leafMat[1], dispose = vi.spyOn(material, 'dispose');
    one.dispose(); expect(dispose).not.toHaveBeenCalled(); expect(resources.plants.size).toBe(1);
    two.dispose(); expect(dispose).toHaveBeenCalledTimes(1); expect(resources.kit).toBeNull();
    two.dispose(); expect(dispose).toHaveBeenCalledTimes(1);
    const replacement = resources.create(17);
    expect(replacement.leafCluster.material).not.toBe(material);
    resources.dispose(); expect(resources.plants.size).toBe(0);
  });

  it('uses world water height, freezes only time, and reduces geometry without losing the model at minimum quality', () => {
    const resources = new TankAmamo(), plant = resources.create(2), camera = new PerspectiveCamera();
    const tank = new Group(); tank.position.set(1.8, 0.73, 0); tank.add(plant);
    camera.position.set(1.8, 0.88, 0.4);
    resources.update(camera, 1.03, 'high', 0.25, [{ direction: new Vector3(1, 0, 0), flowRate: 999999 }]);
    const u = resources.kit!.uniforms;
    expect(u.uAmWater.value).toBe(1.03); expect(u.uAmTime.value).toBe(0.25);
    expect(u.uAmCurrent.value.length()).toBeLessThanOrEqual(0.055 + 1e-9);
    expect(plant.lod).toBe(0); const closeVertices = plant.drawnVertices;
    resources.update(camera, 0.98, 'minimal');
    expect(u.uAmTime.value).toBe(0.25); expect(u.uAmWater.value).toBe(0.98);
    expect(plant.lod).toBe(2); expect(plant.visible).toBe(true);
    expect(plant.drawnVertices).toBeLessThan(closeVertices); expect(plant.rootRhizome.visible).toBe(false);
    resources.update(camera, 1.03, 'high'); camera.position.z = 4;
    resources.update(camera, 1.03, 'high'); expect(plant.lod).toBe(2);
    resources.dispose();
  });

  it('selects the placed clump rather than the undeformed tall leaf buffer', () => {
    const resources = new TankAmamo(), plant = resources.create(4);
    plant.position.set(0.1, 0.78, 0); plant.rotation.y = Math.PI / 3; plant.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.1, 0.88, 1), new Vector3(0, 0, -1));
    expect(ray.intersectObject(plant, true).map(hit => hit.object)).toEqual([plant]);
    ray.ray.origin.y = 1.3; expect(ray.intersectObject(plant, true)).toEqual([]);
    plant.visible = false; ray.ray.origin.y = 0.88; expect(ray.intersectObject(plant, true)).toEqual([]);
    resources.dispose();
  });

  it('round-trips amamo in the legacy field and every room tank without accepting unknown decoration types', () => {
    const save = emptySave('hashirimizu', 1);
    const item = { id: 'amamo-one', type: 'amamo' as const, x: 0.1, z: -0.04, rot: 1.5 };
    save.tank.layout!.items = [item];
    expect(parseSave(save).tank.layout!.items).toEqual([item]);
    const one = newRoomTank('one', 60, [0, 0]), two = newRoomTank('two', 90, [-1.8, 0]);
    one.layout.items = [item]; two.layout.items = [{ ...item, id: 'amamo-two' }];
    save.equipmentCollection!.progression!.sizes.push(90);
    save.aquariumRoom = { version: 1, mainTankId: 'one', tanks: [one, two] };
    const restored = parseSave(JSON.parse(JSON.stringify(save)));
    expect(restored.aquariumRoom!.tanks.map(tank => tank.layout.items[0].type)).toEqual(['amamo', 'amamo']);
    expect(parseSave(restored)).toEqual(restored);
    (save.tank.layout!.items[0] as { type: string }).type = 'unknown-plant';
    expect(() => parseSave(save)).toThrow(InvalidSaveError);
  });
});
