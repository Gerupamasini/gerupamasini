import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { NetView, ZONE_NEAR } from '../../src/player/NetView';
import { CR_PER_LEVEL, LOADOUT_MAX, levelFor, nextLevelAt, skillKeyOf } from '../../src/systems/Encyclopedia';

describe('観察者レベルと CR', () => {
  it('level grows with the square root of the research', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(99)).toBe(1);
    expect(levelFor(100)).toBe(2);
    expect(levelFor(400)).toBe(3);
    expect(nextLevelAt(2)).toBe(400);
    expect(CR_PER_LEVEL).toBeGreaterThan(0);
    expect(LOADOUT_MAX).toBe(3);
  });
  it('every net shares one proficiency, other tools have their own', () => {
    expect(skillKeyOf({ id: 'hand_net_long', type: 'capture' })).toBe('hand_net');
    expect(skillKeyOf({ id: 'shovel', type: 'dig' })).toBe('shovel');
  });
});

describe('立ったままでも網が届く', () => {
  it('a longer reach along the line of sight takes a point on the bed from a standing eye', () => {
    const cam = new PerspectiveCamera(60, 16 / 9, 0.05, 100);
    cam.position.set(0, 1.5, 0);
    cam.rotation.set(-Math.atan2(1.5, 1.2), 0, 0, 'YXZ');
    cam.updateMatrixWorld();
    const bed = new Vector3(0, 0, -1.2);
    // the crouched reach of 1.6 m misses it, the standing reach (1.5 m across the ground, 2.1 m down the sight) takes it
    expect(NetView.inZone(cam, bed, 0.05, 1, 1.6)).toBe(-1);
    const reach = Math.min(1.5 / Math.cos(Math.atan2(1.5, 1.2)), Math.hypot(1.5, 1.5) + 0.1);
    expect(NetView.inZone(cam, bed, 0.05, 1, reach)).toBeGreaterThanOrEqual(0);
    expect(reach).toBeGreaterThan(ZONE_NEAR);
  });
});
