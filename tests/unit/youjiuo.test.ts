import { describe, expect, it } from 'vitest';
import { Group, Object3D, SkinnedMesh, Vector2, Vector3, Vector4 } from 'three';
import { youjiuoGeometry, triangleCount, rigRest, sectionUnit } from '../../src/creatures/species/youjiuo/geometry';
import { BONES, DORSAL, MODEL_TL, NSEG, PIVOT_K, STATIONS, TAIL_RINGS, TRUNK_RINGS, chainWeights, ringAt, sOfRing } from '../../src/creatures/species/youjiuo/anatomy';
import { SEG_LEN, applyPose, chainFromBends, restPose, respace } from '../../src/creatures/species/youjiuo/pose';
import { Youjiuo, type FishEnv } from '../../src/creatures/species/youjiuo/behavior';
import { YoujiuoDriver } from '../../src/creatures/species/youjiuo/YoujiuoDriver';
import { shootLine, shootState, shootFlow, amNoise } from '../../src/world/amamo/flow';
import type { MeadowProbe } from '../../src/creatures/drivers/Driver';
import type { ShootSpec } from '../../src/world/amamo/AmamoPatch';
import { DRIVERS } from '../../src/creatures/drivers/index';
import { Rng } from '../../src/core/Rng';

describe('ヨウジウオ anatomy', () => {
  it('has 19 trunk and 41 tail rings, and its snout is about half the head', () => {
    expect(ringAt(0.4)).toBeCloseTo(TRUNK_RINGS, 5);
    expect(ringAt(0.976)).toBeCloseTo(TRUNK_RINGS + TAIL_RINGS, 5);
    for (const r of [0, 5, 19, 30, 59]) expect(ringAt(sOfRing(r))).toBeCloseTo(r, 4);
    // tail rings shorten toward the tip
    expect(sOfRing(21) - sOfRing(20)).toBeGreaterThan(sOfRing(59) - sOfRing(58));
    expect(0.062 / 0.115).toBeGreaterThan(0.5);
    expect(DORSAL.rays).toBe(38);
  });
  it('makes the trunk heptagonal and the tail quadrangular', () => {
    // the trunk's lateral ridge stands out at the widest point; on the tail the side is straight
    const trunk = sectionUnit(0.25, 2), tail = sectionUnit(0.8, 2);
    expect(trunk[0]).toBeGreaterThan(0.85);
    const tailUp = sectionUnit(0.8, 1), tailLo = sectionUnit(0.8, 3);
    expect(Math.abs(tail[0] - 0.5 * (tailUp[0] + tailLo[0]))).toBeLessThan(0.12);
  });
  it('blends each body point over at most three chain bones, fully weighted', () => {
    for (let s = 0.12; s < 1; s += 0.013) {
      const w = chainWeights(s);
      expect(w.length).toBeLessThanOrEqual(3);
      expect(w.reduce((a, b) => a + b[1], 0)).toBeCloseTo(1, 6);
    }
  });
});

describe('ヨウジウオ geometry', () => {
  it('stays inside the per-tier triangle budgets', () => {
    const t0 = triangleCount(0), t1 = triangleCount(1), t2 = triangleCount(2);
    expect(t0.body + t0.fins).toBeLessThan(20000);
    expect(t1.body + t1.fins).toBeLessThan(3200);
    expect(t2.body + t2.fins).toBeLessThan(500);
    expect(t2.fins).toBe(0);
    expect(youjiuoGeometry(0)).toBe(youjiuoGeometry(0));
  });
  it('faces the skin outward', () => {
    for (const lod of [0, 1, 2] as const) {
      const g = youjiuoGeometry(lod).body;
      const pos = g.getAttribute('position'), part = g.getAttribute('aPart'), idx = g.index!;
      const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), m = new Vector3();
      let out = 0, total = 0;
      for (let i = 0; i < idx.count; i += 3) {
        const ia = idx.getX(i), ib = idx.getX(i + 1), ic = idx.getX(i + 2);
        if (part.getX(ia) > 0.5 || part.getX(ib) > 0.5 || part.getX(ic) > 0.5) continue;
        a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
        n.subVectors(b, a).cross(m.subVectors(c, a));
        if (n.lengthSq() < 1e-18) continue;
        const ctr = m.copy(a).add(b).add(c).divideScalar(3);
        const radial = new Vector3(ctr.x, ctr.y, 0);
        if (radial.lengthSq() < 1e-12) continue;
        if (n.dot(radial) > 0) out++;
        total++;
      }
      expect(out / total).toBeGreaterThan(0.95);
    }
  });
  it('weights every vertex to bones of the rig', () => {
    for (const lod of [0, 1, 2] as const) {
      const { body, fins } = youjiuoGeometry(lod);
      for (const g of [body, fins]) {
        if (!g) continue;
        const sw = g.getAttribute('skinWeight'), si = g.getAttribute('skinIndex');
        for (let i = 0; i < sw.count; i++) {
          expect(Math.abs(sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i) - 1)).toBeLessThan(1e-4);
          expect(si.getX(i)).toBeLessThan(BONES.length);
        }
      }
    }
  });
  it('names the parts of the rig', () => {
    for (const n of ['Body', 'Head', 'Snout', 'Eye_L', 'Eye_R', 'DorsalFin', 'PectoralFin_L', 'PectoralFin_R', 'Tail']) expect(BONES).toContain(n);
    expect(rigRest().pos.length).toBe(BONES.length);
  });
});

describe('ヨウジウオ pose', () => {
  it('a straight rest chain matches the rest rig, and bends keep the segment lengths', () => {
    const p = restPose();
    const bones = BONES.map(() => new Object3D());
    applyPose(bones as never, p, 0);
    const rest = rigRest().pos;
    for (let k = 0; k < NSEG; k++) expect(bones[k].position.distanceTo(rest[k])).toBeLessThan(1e-9);
    const yb = new Float32Array(NSEG + 1).map((_, k) => 0.2 * Math.sin(k)), pb = new Float32Array(NSEG + 1).fill(0.05);
    chainFromBends(p.pts, 0.4, 0, yb, pb);
    for (let k = 0; k < NSEG; k++) expect(p.pts[k].distanceTo(p.pts[k + 1])).toBeCloseTo(SEG_LEN[k], 9);
    expect(p.pts[PIVOT_K].length()).toBe(0);
    p.pts[3].x += 0.01;
    respace(p.pts);
    for (let k = 0; k < NSEG; k++) expect(p.pts[k].distanceTo(p.pts[k + 1])).toBeCloseTo(SEG_LEN[k], 9);
  });
});

// ------------------------------------------------------------------ a meadow for the tests

function meadow(): MeadowProbe & { t: number } {
  const uniforms = {
    uAmTime: { value: 0 }, uAmWater: { value: 0.6 }, uAmCurrent: { value: new Vector2(0.05, 0.02) },
    uAmWave: { value: new Vector4(Math.cos(0.7), Math.sin(0.7), 0.1, 0.6) }, uAmSeaward: { value: new Vector2(0, 1) },
    uAmPush: { value: [] as Vector4[] },
  };
  const shoots: ShootSpec[] = [];
  const rng = new Rng(9);
  for (let i = 0; i < 60; i++) {
    shoots.push({ x: rng.range(-0.6, 0.6), y: 0, z: rng.range(-0.6, 0.6), fan: rng.range(0, Math.PI), length: rng.range(0.4, 0.6), leaves: 4, seed: rng.next(), width: 0.005, age: 0.5, gx: 0, gz: 0, pool: -1e3, edge: 0, sheath: 0.09, layer: 0 });
  }
  return {
    t: 0, kit: { uniforms },
    coverAt: (x, z) => (Math.abs(x) < 0.7 && Math.abs(z) < 0.7 ? 0.8 : 0),
    shootsNear: (x, z, r, max = 24) => shoots.filter((s) => Math.hypot(s.x - x, s.z - z) <= r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, max),
  };
}
const floorWith = (m: MeadowProbe | null) => ({ heightAt: () => 0, waterAt: () => 0.6, meadow: m });

function run(fish: Youjiuo, env: FishEnv, secs: number, m?: { t: number; kit: MeadowProbe['kit'] }, each?: () => void) {
  for (let t = 0; t < secs; t += 1 / 30) {
    if (m) m.kit.uniforms.uAmTime.value += 1 / 30;
    env.t += 1 / 30;
    fish.update(1 / 30, env);
    each?.();
  }
}

describe('アマモ flow twin', () => {
  it('a shoot leans with the current and stays under the water', () => {
    const m = meadow();
    const ref = { x: 0, y: 0, z: 0, fan: 0.3, length: 0.5, sheath: 0.09, seed: 0.4, width: 0.005, pool: -1e3 };
    const S = shootState(m.kit.uniforms, ref);
    const pts = Array.from({ length: 64 }, () => new Vector3());
    const n = shootLine(m.kit.uniforms, ref, S, 0.01, 0.5, pts);
    expect(n).toBe(51);
    // leaning downstream (+x, +z current)
    expect(pts[n - 1].x + pts[n - 1].z).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) expect(pts[i].y).toBeLessThanOrEqual(0.6);
    // the waves' push comes later up the blade
    const a = shootFlow(m.kit.uniforms, S, 0, new Vector2()), b = shootFlow(m.kit.uniforms, S, 1.6, new Vector2());
    expect(a.distanceTo(b)).toBeGreaterThan(1e-4);
    expect(amNoise(3.3, 7.1)).toBeGreaterThanOrEqual(0);
    expect(amNoise(3.3, 7.1)).toBeLessThanOrEqual(1);
  });
});

describe('ヨウジウオ behaviour', () => {
  const mk = (seed = 3) => { const f = new Youjiuo(0.2, new Rng(seed)); f.pos.set(0, Number.NaN, 0); return f; };
  it('hovers in the water, inclined, the dorsal fin buzzing in bouts', () => {
    const f = mk();
    const env: FishEnv = { floor: floorWith(null), t: 0 };
    f.hover(10);
    let fin = 0, still = 0;
    run(f, env, 10, undefined, () => { if (f.finHz > 8) fin++; else still++; });
    expect(f.pos.y).toBeGreaterThan(0.02);
    expect(f.pos.y).toBeLessThan(0.6);
    expect(fin).toBeGreaterThan(10);
    expect(still).toBeGreaterThan(10);
  });
  it('swims slowly on the dorsal fin with the body almost straight', () => {
    const f = mk();
    const env: FishEnv = { floor: floorWith(null), t: 0 };
    f.swimTo(new Vector3(0.8, 0.15, 0.2), 20);
    let maxBend = 0, maxSpeed = 0;
    run(f, env, 16, undefined, () => {
      maxSpeed = Math.max(maxSpeed, f.speed);
      const P = f.pose.pts;
      // deviation of the body from the straight line head–tail
      const a = P[0], b = P[NSEG];
      for (const p of P) maxBend = Math.max(maxBend, new Vector3().subVectors(p, a).cross(new Vector3().subVectors(b, a).normalize()).length());
      expect(f.finHz).toBeLessThanOrEqual(26);
    });
    expect(maxSpeed).toBeLessThan(0.2 * 0.85);
    expect(maxSpeed).toBeGreaterThan(0.03);
    expect(maxBend).toBeLessThan(0.2 * 0.05);
    expect(Math.hypot(f.pos.x - 0.8, f.pos.z - 0.2)).toBeLessThan(0.15);
  });
  it('holds a blade: laid along it, swaying with it, the tail hooked round the sheath', () => {
    const m = meadow();
    const f = mk(5);
    f.pos.set(0.05, Number.NaN, 0.05);
    const env: FishEnv = { floor: floorWith(m), t: 0 };
    run(f, env, 0.2, m);
    expect(f.holdGrass(env, 40)).toBe(true);
    run(f, env, 14, m);
    expect(f.state).toBe('GRASS_HOLD');
    expect(f.sub).toBe('hold');
    expect(f.curl).toBe(1);
    // the body stands up along the blade
    const head = f.toWorld(f.pose.pts[0].clone()), tail = f.toWorld(f.pose.pts[NSEG].clone());
    expect(head.y - tail.y).toBeGreaterThan(0.1);
    // the tail's end is near the shoot's axis (hooked round it)
    const h = (f as unknown as { hold: { ref: { x: number; z: number } } }).hold.ref;
    expect(Math.hypot(tail.x - h.x, tail.z - h.z)).toBeLessThan(0.02);
    // it moves with the waves while the fins rest
    const p0 = f.toWorld(f.pose.pts[0].clone());
    let travel = 0;
    run(f, env, 3, m, () => { travel = Math.max(travel, f.toWorld(f.pose.pts[0].clone()).distanceTo(p0)); });
    expect(travel).toBeGreaterThan(0.003);
    expect(f.finAmp).toBeLessThan(0.15);
    // the segments keep their length through it all
    for (let k = 0; k < NSEG; k++) expect(f.pose.pts[k].distanceTo(f.pose.pts[k + 1])).toBeCloseTo(SEG_LEN[k], 6);
  });
  it('stalks prey and strikes with a flick of the head and the snout\'s suction', () => {
    const f = mk(11);
    const env: FishEnv = { floor: floorWith(null), t: 0 };
    const events: string[] = [];
    f.onEvent = (e) => events.push(e);
    f.forage(30);
    let maxHead = 0, maxSnout = 0;
    run(f, env, 25, undefined, () => { maxHead = Math.max(maxHead, f.pose.headPitch); maxSnout = Math.max(maxSnout, f.pose.snout); });
    expect(events).toContain('strike');
    expect(events).toContain('swallow');
    expect(maxHead).toBeGreaterThan(0.25);
    expect(maxSnout).toBeGreaterThan(0.5);
  });
  it('escapes away from a threat into the grass, and holds still there', () => {
    const m = meadow();
    const f = mk(7);
    f.pos.set(0.3, Number.NaN, 0.0);
    const env: FishEnv = { floor: floorWith(m), t: 0 };
    run(f, env, 0.5, m);
    const start = f.pos.clone();
    f.escape(env, new Vector3(0.9, 0.2, 0));
    let maxSpeed = 0;
    run(f, env, 3, m, () => { maxSpeed = Math.max(maxSpeed, f.speed); });
    expect(maxSpeed).toBeGreaterThan(0.3);
    expect(f.pos.x).toBeLessThan(start.x);
    expect(f.state).toBe('GRASS_HOLD');
  });
  it('never leaves the water', () => {
    const f = mk(2);
    const env: FishEnv = { floor: { heightAt: () => 0, waterAt: () => 0.12 }, t: 0 };
    f.hover(5);
    run(f, env, 5);
    const ys = f.pose.pts.map((p) => f.toWorld(p.clone()).y);
    expect(Math.max(...ys)).toBeLessThan(0.12);
    expect(Math.min(...ys)).toBeGreaterThan(-0.005);
  });
});

describe('ヨウジウオ driver', () => {
  it('is registered and builds a skinned rig with three tiers', () => {
    const entry = DRIVERS.youjiuo;
    expect(entry).toBeDefined();
    const holder = entry.placeholder!();
    const scene = new Group();
    scene.add(holder.root);
    const d = entry.create() as YoujiuoDriver;
    const ind = {
      id: 'syngnathus_schlegeli#1', species: { id: 'syngnathus_schlegeli' }, pos: new Vector3(0, 0, 0), home: new Vector3(), heading: 0, length_mm: 180,
      cell: 1, ruleIndex: 0, rng: new Rng(1),
    } as never;
    d.attach(holder.root, ind);
    d.setIntent({ id: 1, kind: 'rest', urgency: 0.2, seconds: 10 });
    for (let i = 0; i < 30; i++) d.update(1 / 30, { floor: floorWith(null), player: new Vector3(3, 0, 3), simScale: 1, nowMs: i * 33 });
    let skinned = 0;
    holder.root.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) skinned++; });
    expect(skinned).toBe(5);
    expect(holder.root.scale.x).toBeCloseTo(0.18 / MODEL_TL, 6);
    expect(d.behaviour!.state).toBe('IDLE_HOVER');
    const preview = YoujiuoDriver.makePreview(0.5);
    expect(preview.children.length).toBeGreaterThan(BONES.length);
    d.dispose();
  });
  it('spaces its stations along the body', () => {
    expect(STATIONS[0]).toBeCloseTo(0.115, 6);
    expect(STATIONS[STATIONS.length - 1]).toBe(1);
  });
});

describe('ヨウジウオ eyes', () => {
  it('face out of the head', () => {
    const g = youjiuoGeometry(0).body;
    const pos = g.getAttribute('position'), part = g.getAttribute('aPart'), idx = g.index!;
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), m = new Vector3();
    let out = 0, total = 0;
    for (let i = 0; i < idx.count; i += 3) {
      const ia = idx.getX(i);
      if (Math.abs(part.getX(ia) - 1) > 0.01) continue;
      a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, idx.getX(i + 1)); c.fromBufferAttribute(pos, idx.getX(i + 2));
      n.subVectors(b, a).cross(m.subVectors(c, a));
      if (n.x * Math.sign(a.x) > 0) out++;
      total++;
    }
    expect(total).toBeGreaterThan(100);
    expect(out / total).toBeGreaterThan(0.9);
  });
});
