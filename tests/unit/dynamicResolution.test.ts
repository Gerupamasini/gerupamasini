import { describe, expect, it } from 'vitest';
import { DynamicResolution } from '../../src/render/DynamicResolution';

/** Runs frames of `dt` seconds for `seconds`, the GPU's time given by the scale. */
function run(d: DynamicResolution, seconds: number, gpuAt: (scale: number) => number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) d.update(dt, gpuAt(d.scale));
}

describe('DynamicResolution', () => {
  it('stays at the tier scale while the GPU has room', () => {
    const d = new DynamicResolution({ targetMs: 16.7, max: 0.85, min: 0.5 });
    run(d, 10, () => 9);
    expect(d.scale).toBeCloseTo(0.85);
  });

  it('draws smaller until a pixel-bound GPU is under the target, and no smaller', () => {
    const d = new DynamicResolution({ targetMs: 16.7, max: 1, min: 0.5 });
    // 2 ms that do not scale, 22 ms at full size that do (with the pixels: the scale squared)
    const gpu = (s: number) => 2 + 22 * s * s;
    run(d, 30, gpu);
    expect(gpu(d.scale)).toBeLessThan(16.7 * 0.92);
    expect(d.scale).toBeGreaterThanOrEqual(0.75);
  });

  it('goes back up once the load is gone', () => {
    const d = new DynamicResolution({ targetMs: 16.7, max: 1, min: 0.5 });
    run(d, 20, (s) => 30 * s * s);
    expect(d.scale).toBeLessThan(0.8);
    run(d, 20, (s) => 8 * s * s);
    expect(d.scale).toBeCloseTo(1);
  });

  it('holds when a smaller picture does not lower the GPU time (bound elsewhere)', () => {
    const d = new DynamicResolution({ targetMs: 16.7, max: 1, min: 0.5 });
    run(d, 20, () => 25);
    expect(d.scale).toBeGreaterThanOrEqual(0.95);
  });

  it('never leaves the floor and ceiling', () => {
    const d = new DynamicResolution({ targetMs: 16.7, max: 0.88, min: 0.5 });
    run(d, 60, (s) => 200 * s * s);
    expect(d.scale).toBeCloseTo(0.5);
    run(d, 60, () => 1);
    expect(d.scale).toBeCloseTo(0.88);
  });

  it('without a GPU timer, steps down on late frames only so far', () => {
    const d = new DynamicResolution({ targetMs: 16.7, max: 1, min: 0.5 });
    for (let t = 0; t < 30; t += 1 / 30) d.update(1 / 30, Number.NaN);
    expect(d.scale).toBeCloseTo(0.7);
  });
});
