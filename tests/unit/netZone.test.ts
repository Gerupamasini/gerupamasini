import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { NetView, REACH, ZONE_A, ZONE_B, ZONE_NEAR } from '../../src/player/NetView';

/** a crouched player at the waterline, looking down a little */
function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(60, 16 / 9, 0.05, 100);
  cam.position.set(3, 0.9, -12);
  cam.rotation.set(-0.35, 1.1, 0, 'YXZ');
  cam.updateMatrixWorld();
  return cam;
}
const ahead = (cam: PerspectiveCamera, t: number, right = 0, up = 0): Vector3 => {
  const dir = cam.getWorldDirection(new Vector3());
  const r = new Vector3().crossVectors(dir, new Vector3(0, 1, 0)).normalize();
  const u = new Vector3().crossVectors(r, dir).normalize();
  return cam.position.clone().addScaledVector(dir, t).addScaledVector(r, right).addScaledVector(u, up);
};

describe('タモの判定: 視線に沿った縦の楕円', () => {
  it('a point on the reticle within the handle reach is at the centre of the zone', () => {
    const cam = camera();
    expect(NetView.inZone(cam, ahead(cam, 0.6), 0)).toBeCloseTo(0, 5);
    expect(NetView.inZone(cam, ahead(cam, REACH - 0.01), 0)).toBeCloseTo(0, 5);
  });
  it('is limited only by the handle: too close or beyond the reach is outside', () => {
    const cam = camera();
    expect(NetView.inZone(cam, ahead(cam, ZONE_NEAR - 0.05), 0)).toBe(-1);
    expect(NetView.inZone(cam, ahead(cam, REACH + 0.05), 0)).toBe(-1);
    // the animal's own size extends the reach
    expect(NetView.inZone(cam, ahead(cam, REACH + 0.05), 0.1)).toBeGreaterThanOrEqual(0);
  });
  it('is taller than it is wide (the hoop stood upright)', () => {
    const cam = camera();
    const t = 0.8;
    expect(NetView.inZone(cam, ahead(cam, t, ZONE_A * 0.9, 0), 0)).toBeCloseTo(0.9, 3);
    expect(NetView.inZone(cam, ahead(cam, t, ZONE_A * 1.1, 0), 0)).toBe(-1);
    expect(NetView.inZone(cam, ahead(cam, t, 0, ZONE_B * 0.9), 0)).toBeCloseTo(0.9, 3);
    expect(NetView.inZone(cam, ahead(cam, t, 0, -ZONE_B * 0.9), 0)).toBeCloseTo(0.9, 3);
    expect(NetView.inZone(cam, ahead(cam, t, 0, ZONE_B * 1.1), 0)).toBe(-1);
    // a point that is inside vertically would be outside if the ellipse were turned on its side
    expect(NetView.inZone(cam, ahead(cam, t, 0, ZONE_A * 1.2), 0)).toBeGreaterThan(0);
  });
  it('widens by the animal\'s half length', () => {
    const cam = camera();
    expect(NetView.inZone(cam, ahead(cam, 0.7, ZONE_A + 0.04, 0), 0)).toBe(-1);
    expect(NetView.inZone(cam, ahead(cam, 0.7, ZONE_A + 0.04, 0), 0.06)).toBeGreaterThan(0);
  });
});
