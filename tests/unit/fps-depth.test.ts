import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { BOOT_DEPTH, FPSController, LOW_HEIGHT } from '../../src/player/FPSController';
import type { Input } from '../../src/core/Input';
import type { Terrain } from '../../src/world/Terrain';
import type { Habitat } from '../../src/world/Habitat';
import type { MapDef } from '../../src/data/schemas';

function setup(wadeDepth?: number) {
  const camera = new PerspectiveCamera();
  const input = { looking: false, mouseRightDown: false, pressed: () => false,
    held: (_action: string) => false, moveForward: 1, moveRight: 0 };
  const terrain = { heightAt: (_x: number, _z: number) => 0,
    substrateAt: () => 'sand', normalAt: () => new Vector3(0, 1, 0) };
  const habitat = { waterAt: (_x: number, z: number): number => z < -0.05 ? 2 : 0.1,
    depthAt: (x: number, z: number): number => habitat.waterAt(x, z) - terrain.heightAt(x, z) };
  const map = { spawnStart: { x: 0, z: 0, heading: 0 },
    bounds: { walkable: [[-10, -10], [10, 10]], noEntry: [] as number[][][] },
    wading: wadeDepth === undefined ? undefined : { maxDepth_m: wadeDepth } };
  const player = new FPSController(camera, terrain as unknown as Terrain,
    habitat as unknown as Habitat, input as unknown as Input, map as unknown as MapDef);
  return { player, camera, input, terrain, habitat, map };
}

describe('debug water depth limits', () => {
  it('keeps the normal boot limit and the map-specific wader limit', () => {
    const boots = setup(), waders = setup(1.2);
    for (const s of [boots, waders]) s.habitat.waterAt = (_x, z) => z < -0.05 ? 0.8 : 0.1;
    boots.player.update(0.2, 1, false); waders.player.update(0.2, 1, false);
    expect(boots.player.wadeDepth).toBe(BOOT_DEPTH);
    expect(boots.player.position.z).toBe(0);
    expect(boots.player.blockedByDepth).toBe(true);
    expect(waders.player.position.z).toBeLessThan(-0.05);
    expect(waders.player.blockedByDepth).toBe(false);
    waders.habitat.waterAt = () => 1.3;
    const z = waders.player.position.z;
    waders.player.update(0.2, 1, false);
    expect(waders.player.position.z).toBe(z);
    expect(waders.player.blockedByDepth).toBe(true);
  });

  it.each([undefined, 1.2])('lets debug mode enter deep water with wader limit %s, then restores it', (limit) => {
    const { player } = setup(limit);
    player.ignoreDepthLimit = true;
    player.update(0.2, 1, false);
    expect(player.position.z).toBeLessThan(-0.05);
    expect(player.depthHere).toBe(2);
    expect(player.blockedByDepth).toBe(false);
    const z = player.position.z;
    player.ignoreDepthLimit = false;
    player.update(0.2, 1, false);
    expect(player.position.z).toBe(z);
    expect(player.blockedByDepth).toBe(true);
  });

  it('allows an underwater eye in debug and restores the water-surface clamp when closed', () => {
    const { player, camera, input, habitat } = setup();
    habitat.waterAt = () => 2; input.moveForward = 0;
    player.update(0.1, 1, false);
    expect(camera.position.y).toBeCloseTo(2.16);
    player.ignoreDepthLimit = true; player.idle(0);
    expect(camera.position.y).toBeCloseTo(LOW_HEIGHT);
    player.ignoreDepthLimit = false; player.idle(0);
    expect(camera.position.y).toBeCloseTo(2.16);
  });

  it('allows jumping from deep water only in debug', () => {
    const { player, input, habitat } = setup();
    habitat.waterAt = () => 2; input.moveForward = 0;
    player.update(0, 1, false);
    input.held = (action) => action === 'jump';
    player.update(0.016, 1, false);
    expect(player.airborne).toBe(false);
    player.ignoreDepthLimit = true;
    player.update(0.016, 1, false);
    expect(player.airborne).toBe(true);
    expect(player.jumped).toBe(true);
  });

  it.each(['bounds', 'noEntry', 'step', 'obstacle'] as const)('preserves %s collision in debug without a false depth warning', (obstacle) => {
    const { player, map, terrain } = setup();
    player.ignoreDepthLimit = true;
    if (obstacle === 'bounds') map.bounds.walkable = [[-10, -0.05], [10, 10]];
    if (obstacle === 'noEntry') map.bounds.noEntry = [[[-10, -10], [10, -0.05]]];
    if (obstacle === 'step') terrain.heightAt = (_x, z) => z < -0.05 ? 1 : 0;
    if (obstacle === 'obstacle') player.obstacleFree = () => false;
    player.update(0.2, 1, false);
    expect(player.position.z).toBe(0);
    expect(player.blockedByDepth).toBe(false);
  });

  it('measures supported wading depth from the root underfoot and bypasses it in debug', () => {
    const { player, habitat } = setup();
    habitat.waterAt = () => 0.6;
    player.supportHeight = () => 0.3; player.setPose(0, 0, 0);
    player.update(0.2, 1, false);
    expect(player.position.z).toBeLessThan(0);
    expect(player.blockedByDepth).toBe(false);
    habitat.waterAt = () => 2;
    const z = player.position.z;
    player.update(0.2, 1, false);
    expect(player.position.z).toBe(z);
    expect(player.blockedByDepth).toBe(true);
    player.ignoreDepthLimit = true;
    player.update(0.2, 1, false);
    expect(player.position.z).toBeLessThan(z);
    expect(player.blockedByDepth).toBe(false);
  });
});
