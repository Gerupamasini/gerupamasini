import test from 'node:test';
import assert from 'node:assert/strict';
import { Locomotion } from '../../src/locomotion/locomotion.js';
import { World } from '../../src/behavior/world.js';
import { YamameAgent } from '../../src/behavior/agent.js';
import { capProb, CFG } from '../../src/behavior/config.js';

function run(seed, seconds, hook) {
  const world = new World({ seed }), body = new Locomotion({ phase0: 0 }), ag = new YamameAgent({ body, world, seed });
  let hold = 0, up = 0, maxOff = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    hook?.(t, world, ag); ag.update(1 / 60);
    if (ag.state === 'StationHolding' || ag.state === 'DriftWatch') { hold++; if (Math.abs(Math.atan2(Math.sin(body.heading), Math.cos(body.heading))) < 20 * Math.PI / 180) up++; }
    maxOff = Math.max(maxOff, Math.hypot(body.pos.x, body.pos.z));
  }
  return { world, body, ag, up: up / hold, maxOff };
}

test('cap_prob uses only the published endpoints (04 §4.6.4)', () => {
  assert.equal(capProb(0.1), 0.65); assert.equal(capProb(0.29), 0.65); assert.equal(capProb(0.8), 0.10);
  assert.ok(Math.abs(capProb(0.45) - 0.375) < 1e-9);
});

test('AT-02: faces upstream within 20 deg for >= 90 % of the holding time (300 s, fixed seed)', () => {
  const r = run(3, 300); assert.ok(r.up >= 0.9, `upstream fraction ${r.up}`);
});

test('station is kept: never farther than the strike window + return from the focal point', () => {
  const r = run(3, 300); assert.ok(r.maxOff < CFG.strike_dist_max_m.v + 0.6, `maxOff ${r.maxOff}`);
});

test('AT-03: every strike ends in ReturnToStation or RejectSpit -> ReturnToStation', () => {
  const r = run(3, 300); const tr = r.ag.trace.entries; let n = 0;
  for (let i = 0; i < tr.length; i++) if (tr[i].state.to === 'StrikeAttack') {
    n++; const next = tr.slice(i + 1).find((e) => e.state.from !== e.state.to);
    assert.ok(next && ['ReturnToStation', 'RejectSpit'].includes(next.state.to), `strike followed by ${next?.state.to}`);
  }
  assert.ok(n >= 5, `strikes ${n}`); assert.ok(r.ag.stats.eaten >= 3);
});

test('AT-13: every transition has why_now, needs, env and a provenance-tagged parameter list when thresholds were used', () => {
  const r = run(3, 120);
  for (const e of r.ag.trace.entries) { assert.ok(e.why_now && e.why_now.thresholdName != null); assert.ok(e.needs && e.env && e.state); for (const p of e.paramsUsed) assert.ok(['A', 'B', 'C', 'M', 'P', 'E'].includes(p.prov)); }
  assert.ok(r.ag.trace.entries.some((e) => e.paramsUsed.some((p) => p.prov === 'E')), 'E-valued parameters are flagged');
});

test('a threat approaching at 1 m/s: Alert -> CStartFlee -> FleeBurst -> Hide, and the fish ends up at the rock', () => {
  const r = run(5, 25, (t, world) => { if (Math.abs(t - 5) < 1 / 120) world.addThreat({ pos: [5.5, 0.4, 0.2], vel: [-1.0, 0, 0], size: 1, shadow: true }); });
  const seq = r.ag.trace.entries.map((e) => e.state.to);
  const i = seq.indexOf('Alert'); assert.ok(i >= 0, seq.join()); assert.ok(seq.indexOf('CStartFlee') > i); assert.ok(seq.indexOf('FleeBurst') > seq.indexOf('CStartFlee')); assert.ok(seq.indexOf('Hide') > seq.indexOf('FleeBurst'));
  const flee = r.ag.trace.entries.find((e) => e.state.to === 'CStartFlee'); assert.ok(flee.state.interrupt);
  assert.ok(r.ag.coverDist() < 0.4, `cover distance ${r.ag.coverDist()}`);
});

test('deterministic for a fixed seed', () => {
  const a = run(7, 60), b = run(7, 60);
  assert.deepEqual(a.ag.trace.entries.map((e) => [e.t.toFixed(3), e.state.to]), b.ag.trace.entries.map((e) => [e.t.toFixed(3), e.state.to]));
});
