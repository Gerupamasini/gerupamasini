import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ozoneTransmittance } from '../../src/world/Sky';

describe('the ozone the sunlight crosses to the sky', () => {
  it('takes nothing without a column, and hardly anything with the sun high', () => {
    expect(ozoneTransmittance(3, 0, new Vector3()).toArray()).toEqual([1, 1, 1]);
    const t = ozoneTransmittance(60, 1, new Vector3());
    expect(t.y).toBeGreaterThan(0.96);
  });

  it('takes the green most and the blue least, more as the sun goes down', () => {
    const noon = ozoneTransmittance(60, 1, new Vector3()), low = ozoneTransmittance(3, 1, new Vector3()), set = ozoneTransmittance(0, 1, new Vector3());
    expect(set.y).toBeLessThan(set.x);
    expect(set.x).toBeLessThan(set.z);
    expect(set.z).toBeGreaterThan(0.98);
    expect(low.y).toBeLessThan(noon.y);
    expect(set.y).toBeLessThan(low.y);
    // a shell 25 km up seen edge-on: some 11 times the column straight up
    expect(Math.log(set.y) / Math.log(noon.y) / Math.sin(Math.PI / 3)).toBeCloseTo(11.3, 0);
  });

  it('crosses the layer twice once the sun is 6° down', () => {
    const set = ozoneTransmittance(0, 1, new Vector3()), down = ozoneTransmittance(-6, 1, new Vector3()), deeper = ozoneTransmittance(-12, 1, new Vector3());
    expect(Math.log(down.y)).toBeCloseTo(2 * Math.log(set.y), 6);
    expect(deeper.toArray()).toEqual(down.toArray());
  });
});
