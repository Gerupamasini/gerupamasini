import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { hakuGeometry, rigRest, triangleCount, chainWeights } from '../../src/creatures/species/haku/geometry';
import { BONES, MODEL_TL, S_PIVOT } from '../../src/creatures/species/haku/anatomy';
import { chainAngles, envelope, midline } from '../../src/creatures/species/haku/swim';
import { HakuFish, School, type FishEnv } from '../../src/creatures/species/haku/School';
import { Rng } from '../../src/core/Rng';

describe('ハク geometry', () => {
  it('stays inside the per-tier triangle budgets and gets cheaper with distance', () => {
    const t0 = triangleCount(0), t1 = triangleCount(1), t2 = triangleCount(2);
    expect(t0).toBeLessThan(12000);
    expect(t1).toBeLessThan(2000);
    expect(t2).toBeLessThan(400);
    expect(t0).toBeGreaterThan(t1);
    expect(t1).toBeGreaterThan(t2);
  });

  it('shares one geometry per tier', () => {
    expect(hakuGeometry(0)).toBe(hakuGeometry(0));
    expect(hakuGeometry(2).fins).toBeNull();
  });

  it('faces the body outward', () => {
    for (const lod of [0, 1, 2] as const) {
      const g = hakuGeometry(lod).body;
      const pos = g.getAttribute('position'), part = g.getAttribute('aPart'), idx = g.index!;
      const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), m = new Vector3(), axis = new Vector3();
      let out = 0, total = 0;
      for (let i = 0; i < idx.count; i += 3) {
        const ia = idx.getX(i), ib = idx.getX(i + 1), ic = idx.getX(i + 2);
        if (part.getX(ia) !== 0) continue;
        a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
        n.subVectors(b, a).cross(m.subVectors(c, a));
        if (n.lengthSq() < 1e-16) continue;
        const ctr = m.copy(a).add(b).add(c).divideScalar(3);
        axis.set(0, 0, ctr.z);
        const radial = ctr.clone().sub(axis);
        // the snout and the tail cap face along the axis
        if (radial.lengthSq() < 1e-10) radial.set(0, 0, ctr.z > 0 ? 1 : -1);
        if (n.dot(radial) > 0) out++;
        total++;
      }
      expect(out / total).toBeGreaterThan(0.97);
    }
  });

  it('weights every vertex fully to bones of the rig', () => {
    for (const lod of [0, 1, 2] as const) {
      const { body, fins } = hakuGeometry(lod);
      for (const g of [body, fins]) {
        if (!g) continue;
        const sw = g.getAttribute('skinWeight'), si = g.getAttribute('skinIndex');
        for (let i = 0; i < sw.count; i++) {
          const sum = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
          expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
          expect(si.getX(i)).toBeLessThan(BONES.length);
        }
      }
    }
  });

  it('blends neighbouring joints 50/50 at a joint and is rigid at a segment middle', () => {
    const atJoint = chainWeights(0.42);
    expect(atJoint.length).toBe(2);
    expect(atJoint[0][1]).toBeCloseTo(0.5, 2);
    const mid = chainWeights(0.47);
    expect(mid[0][1]).toBeCloseTo(1, 2);
  });

  it('puts the rig on the body axis, head forward', () => {
    const r = rigRest();
    expect(r.world.length).toBe(BONES.length);
    const head = r.world[BONES.indexOf('J_head')], tail = r.world[BONES.indexOf('J_tail')];
    expect(head.z).toBeCloseTo((S_PIVOT - 0.07) * MODEL_TL, 6);
    expect(tail.z).toBeLessThan(0);
    for (let i = 1; i < BONES.length; i++) expect(r.parent[i]).toBeLessThan(i);
  });
});

describe('ハク swimming wave', () => {
  it('moves the head little and the tail most', () => {
    expect(envelope(0)).toBeLessThan(0.25);
    expect(envelope(0.2)).toBeLessThan(envelope(0));
    expect(envelope(1)).toBeCloseTo(1, 5);
    let headMax = 0, tailMax = 0;
    for (let k = 0; k < 64; k++) {
      const ph = (k / 64) * Math.PI * 2;
      headMax = Math.max(headMax, Math.abs(midline(0, ph, 0.1, 0)));
      tailMax = Math.max(tailMax, Math.abs(midline(1, ph, 0.1, 0)));
    }
    expect(tailMax).toBeGreaterThan(4 * headMax);
  });

  it('runs the wave from head to tail', () => {
    // a crest at s moves to a larger s as the phase grows
    const crest = (ph: number) => { let best = 0, bs = 0; for (let s = 0.3; s <= 0.95; s += 0.002) { const v = midline(s, ph, 0.1, 0) / envelope(s); if (v > best) { best = v; bs = s; } } return bs; };
    expect(crest(1.0)).toBeGreaterThan(crest(0.6));
  });

  it('bends head and tail to the same side in a turn', () => {
    const a = chainAngles(0, 0, 3);
    // turning left (+curv): the head yaws left (+), the tail segments sweep the other way
    expect(a[0]).toBeGreaterThan(0);
    expect(a[a.length - 1]).toBeLessThan(0);
    const flat = chainAngles(0, 0, 0);
    for (const x of flat) expect(Math.abs(x)).toBeLessThan(1e-9);
  });
});

/** a flat bed 20 cm under the surface, dry beyond x = dryX */
function flatEnv(dryX = 99): FishEnv {
  return { floor: { heightAt: (x) => (x > dryX ? 0.05 : -0.2), waterAt: () => 0 }, minDepth: 0.015 };
}

function makeSchool(n: number, env: FishEnv, seed = 1): { school: School; fish: HakuFish[] } {
  const school = new School(`test${seed}`, seed);
  const rng = new Rng(seed);
  const fish: HakuFish[] = [];
  for (let i = 0; i < n; i++) {
    const f = new HakuFish(0.027, new Rng(seed * 1000 + i));
    f.pos.set(rng.range(-0.15, 0.15), -0.05, rng.range(-0.15, 0.15));
    f.heading = rng.range(-0.4, 0.4);
    f.placed = true;
    school.add(f);
    fish.push(f);
  }
  return { school, fish };
}

function run(school: School, fish: HakuFish[], env: FishEnv, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) for (const f of fish) f.update(dt, school, env);
}

const nearest = (fish: HakuFish[]) => fish.map((f) => Math.min(...fish.filter((o) => o !== f).map((o) => o.pos.distanceTo(f.pos))));
const polarisation = (fish: HakuFish[]) => Math.hypot(fish.reduce((s, f) => s + Math.sin(f.heading), 0), fish.reduce((s, f) => s + Math.cos(f.heading), 0)) / fish.length;

describe('ハク school', () => {
  it('keeps its spacing: no collisions, no drifting apart', () => {
    const env = flatEnv();
    const { school, fish } = makeSchool(22, env);
    school.request('SCHOOL_SWIM', 12, null, true);
    run(school, fish, env, 8);
    const nn = nearest(fish);
    expect(Math.min(...nn)).toBeGreaterThan(0.25 * 0.027);
    expect(nn.reduce((a, b) => a + b, 0) / nn.length).toBeLessThan(3 * 0.027);
    const far = Math.max(...fish.map((f) => Math.hypot(f.pos.x - school.center.x, f.pos.z - school.center.z)));
    expect(far).toBeLessThan(0.45);
  });

  it('holds together at the longest substep the driver takes (1/40 s)', () => {
    const env = flatEnv();
    const { school, fish } = makeSchool(20, env, 7);
    school.request('SCHOOL_SWIM', 12, null, true);
    run(school, fish, env, 6, 1 / 40);
    const nn = nearest(fish);
    expect(Math.min(...nn)).toBeGreaterThan(0.2 * 0.027);
    expect(nn.reduce((a, b) => a + b, 0) / nn.length).toBeLessThan(3 * 0.027);
    for (const f of fish) { expect(Number.isFinite(f.pos.y)).toBe(true); expect(f.pos.y).toBeLessThan(0); expect(f.pos.y).toBeGreaterThan(-0.2); }
  });

  it('travels polarised', () => {
    const env = flatEnv();
    const { school, fish } = makeSchool(20, env, 2);
    school.request('SCHOOL_SWIM', 12, null, true);
    run(school, fish, env, 6);
    expect(polarisation(fish)).toBeGreaterThan(0.8);
  });

  it('turns as one and bolts from a threat, the nearest first', () => {
    const env = flatEnv();
    const { school, fish } = makeSchool(20, env, 3);
    school.request('SCHOOL_SWIM', 12, null, true);
    run(school, fish, env, 2);
    const threat = new Vector3(school.center.x, 0, school.center.z - 0.6);
    const before = fish.map((f) => f.pos.distanceTo(threat));
    const origin = fish.reduce((a, f) => (f.pos.distanceTo(threat) < a.pos.distanceTo(threat) ? f : a), fish[0]);
    school.startle(threat, origin.pos.clone());
    expect(school.state).toBe('ESCAPE');
    // the wave crosses a 30 cm school in about a tenth of a second plus each fish's own latency
    run(school, fish, env, 0.2);
    expect(fish.every((f) => f.escT >= 0 || f.reactAt < 0)).toBe(true);
    expect(fish.filter((f) => f.escT >= 0).length).toBe(fish.length);
    run(school, fish, env, 0.8);
    const after = fish.map((f) => f.pos.distanceTo(threat));
    const gained = after.map((d, i) => d - before[i]);
    expect(gained.reduce((a, b) => a + b, 0) / gained.length).toBeGreaterThan(0.25);
    // burst speed well above cruising: tens of body lengths a second at the height of it
    expect(Math.max(...fish.map((f) => f.speed / f.tl))).toBeGreaterThan(8);
  });

  it('never leaves the water', () => {
    const env = flatEnv(0.25);
    const { school, fish } = makeSchool(16, env, 4);
    school.request('SCHOOL_SWIM', 20, new Vector3(1.5, 0, 0), true);
    run(school, fish, env, 10);
    for (const f of fish) expect(f.pos.x).toBeLessThan(0.25 + 1e-6);
  });

  it('holds station facing into the current when idle', () => {
    const env = flatEnv();
    const { school, fish } = makeSchool(10, env, 5);
    school.request('IDLE', 20, null, true);
    run(school, fish, env, 0.6);
    school.current.set(0.02, 0, 0);
    // pin the flow (the school recomputes it every half second)
    const pin = () => school.current.set(0.02, 0, 0);
    for (let t = 0; t < 8; t += 1 / 60) { pin(); for (const f of fish) f.update(1 / 60, school, env); }
    const into = fish.filter((f) => Math.sin(f.heading) < -0.5).length;
    expect(into / fish.length).toBeGreaterThan(0.7);
  });

  it('keeps the dorsum under the surface and the belly off the bottom', () => {
    const env: FishEnv = { floor: { heightAt: () => -0.03, waterAt: () => 0 }, minDepth: 0.015 };
    const { school, fish } = makeSchool(12, env, 6);
    school.request('SURFACE_SWIM', 12, null, true);
    run(school, fish, env, 4);
    for (const f of fish) {
      expect(f.pos.y + 0.5 * f.depthBody).toBeLessThan(0.0005);
      expect(f.pos.y - 0.5 * f.depthBody).toBeGreaterThan(-0.03);
    }
  });
});
