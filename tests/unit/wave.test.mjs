import test from 'node:test';
import assert from 'node:assert/strict';
import { spineWave, envelope, WaveDriver, freqFromSpeed, ampFromSpeed, cStartShape, SPINE_COUNT } from '../../src/locomotion/wave.js';

test('envelope hits the knots and A_tail at s=1', () => {
  assert.ok(Math.abs(envelope(0, 0.1) - 0.02) < 1e-12);
  assert.ok(Math.abs(envelope(0.1, 0.1) - 0.009) < 1e-12);
  assert.ok(Math.abs(envelope(1, 0.1) - 0.1) < 1e-12);
});

test('centreline length is preserved and amplitude reaches ~A_tail', () => {
  let zmin = 1e9, zmax = -1e9;
  for (let k = 0; k < 64; k++) {
    const r = spineWave({ phase: (k / 64) * 2 * Math.PI, A_tail: 0.10 });
    const t = r.z[SPINE_COUNT - 1] + r.recoil; zmin = Math.min(zmin, t); zmax = Math.max(zmax, t);
    assert.equal(r.rel.length, SPINE_COUNT);
    for (const v of r.rel) assert.ok(Math.abs(v) <= 0.45 + 1e-9);
  }
  const half = (zmax - zmin) / 2;
  assert.ok(half > 0.06 && half < 0.12, `tail half amplitude ${half}`);
});

test('wave speed exceeds swimming speed for the default stride length (c/U > 1)', () => {
  for (const U of [1, 2.5, 4, 6]) { const f = freqFromSpeed(U); const c = 0.9 * f; assert.ok(c / U > 1.1 && c / U < 1.6, `U=${U} c/U=${c / U}`); }
});

test('amplitude map matches spec table', () => {
  assert.ok(Math.abs(ampFromSpeed(0) - 0.055) < 1e-9);
  assert.ok(Math.abs(ampFromSpeed(1.0) - 0.10) < 1e-9);
  assert.ok(Math.abs(ampFromSpeed(6) - 0.10) < 1e-9);
});

test('turn curvature bends the tail towards the turn side (left = -Z)', () => {
  const r0 = spineWave({ phase: 0, A_tail: 0, turn: 0 }), rl = spineWave({ phase: 0, A_tail: 0, turn: 0.5 });
  assert.ok(Math.abs(r0.z[23]) < 1e-9);
  assert.ok(rl.z[23] < -0.02, `tail z ${rl.z[23]}`);
  const sum = Array.from(rl.rel).reduce((a, b) => a + b, 0) * 180 / Math.PI;       // total bend for R = 2 SL ~ 0.5 rad/SL * ~0.8 SL
  assert.ok(Math.abs(sum) > 10 && Math.abs(sum) < 30, `total bend ${sum}`);
});

test('driver converges to the target frequency with first-order lag', () => {
  const d = new WaveDriver(); for (let i = 0; i < 600; i++) d.update(1 / 60, { U_target: 2.5 });
  assert.ok(Math.abs(d.f - 2.5 / 0.7) < 0.02, `f=${d.f}`);
  assert.ok(Math.abs(d.A - 0.10) < 0.002);
});

test('C-start: 100 degree bend at end of stage 1, counter-bend after, then relaxed', () => {
  const T12 = 0.088, T1 = 0.45 * T12;
  const s1 = cStartShape(T1, { T12 }); assert.ok(Math.abs(Math.abs(s1.total) * 180 / Math.PI - 100) < 1e-6);
  const s2 = cStartShape(T12, { T12 }); assert.ok(Math.sign(s2.total) === -Math.sign(s1.total));
  assert.equal(cStartShape(1.0, { T12 }).active, false);
});
