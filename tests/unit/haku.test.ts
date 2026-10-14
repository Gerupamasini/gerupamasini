import { describe, expect, it, vi } from 'vitest';
import { Vector2, Vector3, Vector4 } from 'three';
import { mulletGeometry, rigRest, triangleCount, chainWeights } from '../../src/creatures/species/haku/geometry';
import { BONES, HAKU, MODEL_TL, S_PIVOT, SUBASHIRI, boneIndex, formFor, type MulletForm } from '../../src/creatures/species/haku/anatomy';
import type { MeadowProbe } from '../../src/creatures/drivers/Driver';
import type { ShootSpec } from '../../src/world/amamo/AmamoPatch';
import { fleeScale } from '../../src/creatures/Individual';
import { shootLine, shootState } from '../../src/world/amamo/flow';
import { LEAF_SLOTS } from '../../src/world/amamo/params';

const hakuGeometry = (lod: 0 | 1 | 2) => mulletGeometry(lod, HAKU);
const GAPE = HAKU.gape, OPER_BONE = HAKU.operBone, OPER_EDGE = HAKU.operEdge;
const halfWidthAt = (s: number, y: number) => HAKU.halfWidthAt(s, y);
import { chainAngles, envelope, midline } from '../../src/creatures/species/haku/swim';
import { HakuFish, School, type FishEnv } from '../../src/creatures/species/haku/School';
import { Rng } from '../../src/core/Rng';

describe('ハク geometry', () => {
  it('stays inside the per-tier triangle budgets and gets cheaper with distance', () => {
    const t0 = triangleCount(0), t1 = triangleCount(1), t2 = triangleCount(2);
    expect(t0).toBeLessThan(14000);
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
        // the skin (aPart below 0.2: the loft, with the near tier's gill chamber), not the eyes, mouth or gill cover
        if (part.getX(ia) >= 0.2) continue;
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

  it('splits the near tier\'s head along the gape into two lips over a mouth cavity, the lower jaw on its own bone', () => {
    const g = hakuGeometry(0).body;
    const pos = g.getAttribute('position'), part = g.getAttribute('aPart'), si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
    const jaw = boneIndex('J_jaw');
    // the lips' edge vertices come in pairs at the same place: one on the head, one on the lower jaw
    let pairs = 0, cavity = 0;
    const lipEdge = new Map<string, number[]>();
    for (let i = 0; i < pos.count; i++) {
      if (part.getX(i) === 3) { cavity++; continue; }
      if (part.getX(i) >= 0.2) continue;
      const s = S_PIVOT - pos.getZ(i) / MODEL_TL;
      if (s > GAPE.s) continue;
      const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => (v / MODEL_TL).toFixed(5)).join();
      lipEdge.set(key, [...(lipEdge.get(key) ?? []), i]);
    }
    for (const ids of lipEdge.values()) {
      if (ids.length !== 2) continue;
      const onJaw = ids.map((i) => (si.getX(i) === jaw ? sw.getX(i) : 0));
      if (Math.max(...onJaw) > 0.99 && Math.min(...onJaw) < 0.01) pairs++;
    }
    expect(pairs).toBeGreaterThan(10);
    expect(cavity).toBeGreaterThan(50);
    // the far tiers keep a closed snout
    expect([...Array(hakuGeometry(1).body.getAttribute('aPart').count).keys()].some((i) => hakuGeometry(1).body.getAttribute('aPart').getX(i) === 3)).toBe(false);
  });

  it('builds the gill cover as plates whose free edges stand off the skin, the opercle on its own bones', () => {
    const g = hakuGeometry(0).body;
    const pos = g.getAttribute('position'), part = g.getAttribute('aPart'), si = g.getAttribute('skinIndex');
    const operL = boneIndex('J_oper_L'), operR = boneIndex('J_oper_R');
    let preop = 0, oper = 0, rim = 0, onOperBone = 0, standOff = 0;
    for (let i = 0; i < pos.count; i++) {
      const p = part.getX(i);
      if (p > 0.25 && p < 0.32) preop++;
      if (p > 0.33 && p < 0.45) {
        oper++;
        if (si.getX(i) === operL || si.getX(i) === operR || si.getY(i) === operL || si.getY(i) === operR) onOperBone++;
        // the opercle's flap, from its bony margin to its free edge, stands proud of the body's own surface there
        const s = S_PIVOT - pos.getZ(i) / MODEL_TL, y = pos.getY(i) / MODEL_TL;
        if (s > OPER_BONE(y) && s < OPER_EDGE(y) && y < 0.0 && y > -0.03 && Math.abs(pos.getX(i)) / MODEL_TL - halfWidthAt(s, y) > 0.0004) standOff++;
      }
      if (p === 4) rim++;
    }
    expect(preop).toBeGreaterThan(50);
    expect(oper).toBeGreaterThan(100);
    expect(rim).toBeGreaterThan(50);
    expect(onOperBone / oper).toBeGreaterThan(0.5);
    expect(standOff).toBeGreaterThan(4);
    expect(rigRest().parent[operL]).toBe(boneIndex('J_sp1'));
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

describe('スバシリ', () => {
  it('takes over from the fry at 4.5 cm', () => {
    expect(formFor(28)).toBe(HAKU);
    expect(formFor(44)).toBe(HAKU);
    expect(formFor(70)).toBe(SUBASHIRI);
  });

  it('is a deeper fish on the same rig, inside the same budgets', () => {
    const depth = (F: MulletForm) => F.dorsalY(0.35) - F.ventralY(0.35);
    expect(depth(SUBASHIRI) / depth(HAKU)).toBeGreaterThan(1.05);
    const t = ([0, 1, 2] as const).map((l) => triangleCount(l, SUBASHIRI));
    expect(t[0]).toBeLessThan(14000);
    expect(t[1]).toBeLessThan(2000);
    expect(t[2]).toBeLessThan(400);
    expect(t[0]).toBeGreaterThan(t[1]);
    expect(t[1]).toBeGreaterThan(t[2]);
    expect(mulletGeometry(0, SUBASHIRI)).toBe(mulletGeometry(0, SUBASHIRI));
    expect(mulletGeometry(0, SUBASHIRI)).not.toBe(mulletGeometry(0, HAKU));
    expect(rigRest(SUBASHIRI).world.length).toBe(BONES.length);
  });

  it('faces outward, is fully weighted, and has its lips, mouth cavity and gill cover', () => {
    for (const lod of [0, 1, 2] as const) {
      const { body, fins } = mulletGeometry(lod, SUBASHIRI);
      const pos = body.getAttribute('position'), part = body.getAttribute('aPart'), idx = body.index!;
      const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), m = new Vector3();
      let out = 0, total = 0;
      for (let i = 0; i < idx.count; i += 3) {
        const ia = idx.getX(i), ib = idx.getX(i + 1), ic = idx.getX(i + 2);
        if (part.getX(ia) >= 0.2) continue;
        a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
        n.subVectors(b, a).cross(m.subVectors(c, a));
        if (n.lengthSq() < 1e-16) continue;
        const ctr = m.copy(a).add(b).add(c).divideScalar(3);
        const radial = new Vector3(ctr.x, ctr.y, 0);
        if (radial.lengthSq() < 1e-10) radial.set(0, 0, ctr.z > 0 ? 1 : -1);
        if (n.dot(radial) > 0) out++;
        total++;
      }
      expect(out / total).toBeGreaterThan(0.97);
      for (const g of [body, fins]) {
        if (!g) continue;
        const sw = g.getAttribute('skinWeight');
        for (let i = 0; i < sw.count; i++) expect(Math.abs(sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i) - 1)).toBeLessThan(1e-4);
      }
    }
    const part = mulletGeometry(0, SUBASHIRI).body.getAttribute('aPart');
    let cavity = 0, oper = 0, rim = 0;
    for (let i = 0; i < part.count; i++) {
      const p = part.getX(i);
      if (p === 3) cavity++;
      if (p > 0.33 && p < 0.45) oper++;
      if (p === 4) rim++;
    }
    expect(cavity).toBeGreaterThan(50);
    expect(oper).toBeGreaterThan(100);
    expect(rim).toBeGreaterThan(50);
  });

  it('has fleshy lips: a roll on the head above the gape and one on the jaw below it, thick across the front', () => {
    const g = mulletGeometry(0, SUBASHIRI).body;
    const pos = g.getAttribute('position'), si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
    const jaw = boneIndex('J_jaw'), R = SUBASHIRI.lips.rolls!;
    const gy = SUBASHIRI.gapeY(0) + SUBASHIRI.frontLift(0, 0, SUBASHIRI.gapeY(0));
    let top = -Infinity, bottom = Infinity, onHead = 0, onJaw = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / MODEL_TL, y = pos.getY(i) / MODEL_TL, s = S_PIVOT - pos.getZ(i) / MODEL_TL;
      // the middle of the front of the mouth
      if (Math.abs(x) > 0.003 || s > 0.004 || Math.abs(y - gy) > 0.03) continue;
      const jawW = si.getX(i) === jaw ? sw.getX(i) : 0;
      if (jawW > 0.99) { onJaw++; bottom = Math.min(bottom, y); } else if (jawW < 0.01) { onHead++; top = Math.max(top, y); }
    }
    expect(onHead).toBeGreaterThan(4);
    expect(onJaw).toBeGreaterThan(4);
    expect(top - gy).toBeGreaterThan(1.2 * R.upper);
    expect(gy - bottom).toBeGreaterThan(1.0 * R.lower);
  });
});

// ------------------------------------------------------------------ grazing

/** a patch of eelgrass (40 cm leaves, 9 cm sheaths) on a flat bed half a metre down, in a gentle current and swell */
function meadow(): MeadowProbe {
  const uniforms = {
    uAmTime: { value: 0 }, uAmWater: { value: 0 }, uAmCurrent: { value: new Vector2(0.03, 0.01) },
    uAmWave: { value: new Vector4(Math.cos(0.7), Math.sin(0.7), 0.06, 0.6) }, uAmSeaward: { value: new Vector2(0, 1) },
    uAmPush: { value: [] as Vector4[] }, tAmSurf: { value: null }, uAmSurf: { value: new Vector2(1, 0) },
  };
  const shoots: ShootSpec[] = [];
  const rng = new Rng(9);
  for (let i = 0; i < 80; i++) {
    shoots.push({ x: rng.range(-0.4, 0.4), y: -0.5, z: rng.range(-0.4, 0.4), fan: rng.range(0, Math.PI), length: rng.range(0.35, 0.45), leaves: 4, seed: rng.next(), width: 0.005, age: 0.5, gx: 0, gz: 0, pool: -1e3, edge: 0, sheath: 0.09, layer: 0 });
  }
  return {
    kit: { uniforms },
    coverAt: (x, z) => (Math.abs(x) < 0.45 && Math.abs(z) < 0.45 ? 0.8 : 0),
    shootsNear: (x, z, r, max = 24) => shoots.filter((s) => Math.hypot(s.x - x, s.z - z) <= r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, max),
  };
}

interface Grazer { graze: { kind: 'blade' | 'bed'; point: Vector3 } | null; gzPhase: string }
const grazer = (f: HakuFish) => f as unknown as Grazer;

/**
 * a school of スバシリ feeding: each bite's mouth-to-spot distance (TL) and the lowest the body comes to the sand (m).
 * (The fish draw their choices from Math.random: seeded here, so the run is the same every time.)
 */
function feed(env: FishEnv, seconds: number, alarm = 0, tl = 0.075) {
  const draw = new Rng(77);
  const spy = vi.spyOn(Math, 'random').mockImplementation(() => draw.next());
  try {
    return feedRun(env, seconds, alarm, tl);
  } finally {
    spy.mockRestore();
  }
}

function feedRun(env: FishEnv, seconds: number, alarm: number, tl: number) {
  const school = new School('graze', 11);
  const fish: HakuFish[] = [];
  for (let i = 0; i < 6; i++) {
    const f = new HakuFish(tl, new Rng(40 + i), SUBASHIRI);
    f.pos.set(-0.1 + 0.04 * i, -0.3, 0.02 * i);
    f.placed = true;
    f.alarm = alarm;
    school.add(f);
    fish.push(f);
  }
  school.request('FORAGE', seconds + 5, null, true);
  const bites: Record<'blade' | 'bed', number[]> = { blade: [], bed: [] };
  let clearance = Infinity;
  const m = new Vector3();
  const u = env.meadow?.kit.uniforms;
  for (let t = 0; t < seconds; t += 1 / 60) {
    if (u) u.uAmTime.value = t;
    for (const f of fish) {
      f.update(1 / 60, school, env);
      const g = grazer(f);
      clearance = Math.min(clearance, f.pos.y - 0.5 * f.depthBody * Math.cos(f.pitch) - env.floor.heightAt(f.pos.x, f.pos.z));
      if (g.graze && g.gzPhase === 'bite') bites[g.graze.kind].push(f.snout(m).distanceTo(g.graze.point) / f.tl);
    }
  }
  return { bites, clearance, fish };
}

describe('grazing', () => {
  it('follows one leaf of a shoot: with the shoot in the sheath, out to its own side of the fan above it', () => {
    const u = meadow().kit.uniforms;
    const ref = { x: 0, y: -0.5, z: 0, fan: 0.4, length: 0.4, sheath: 0.09, seed: 0.3, width: 0.005, pool: -1e3, gx: 0, gz: 0 };
    const S = shootState(u, ref);
    const line = (len: number, side: number) => {
      const out = Array.from({ length: 14 }, () => new Vector3());
      const leaf = side ? { side, splay: LEAF_SLOTS[0].splay, rel: LEAF_SLOTS[0].rel } : undefined;
      const n = shootLine(u, ref, S, len / 12, len, out, leaf);
      return out[n - 1].clone();
    };
    const fan = new Vector3(Math.cos(ref.fan), 0, Math.sin(ref.fan));
    // inside the sheath every leaf is the shoot's line
    expect(line(0.05, 1).distanceTo(line(0.05, 0))).toBeLessThan(1e-9);
    // above it the two outer leaves part to either side of the fan, a few mm a little above the sheath, more higher up
    const near = line(0.14, 1).sub(line(0.14, 0)).dot(fan), high = line(0.3, 1).sub(line(0.3, 0)).dot(fan);
    expect(near).toBeGreaterThan(0.001);
    expect(near).toBeLessThan(0.012);
    expect(high).toBeGreaterThan(2 * near);
    expect(line(0.3, -1).sub(line(0.3, 0)).dot(fan)).toBeLessThan(-0.5 * high);
  });

  it('scrapes the leaves of the eelgrass with its lips on the leaf', () => {
    const env: FishEnv = { floor: { heightAt: () => -0.5, waterAt: () => 0 }, minDepth: 0.015, meadow: meadow() };
    const { bites } = feed(env, 20);
    expect(bites.blade.length).toBeGreaterThan(60);
    // through the whole of each bite (open, press in, scrape, let go) the mouth is at the leaf
    const sorted = [...bites.blade].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.9)]).toBeLessThan(0.15);
  });

  it('tips head-down to the bed and keeps its body off the sand', () => {
    const env: FishEnv = { floor: { heightAt: () => -0.5, waterAt: () => 0 }, minDepth: 0.015 };
    const { bites, clearance } = feed(env, 20);
    expect(bites.bed.length).toBeGreaterThan(60);
    const sorted = [...bites.bed].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.9)]).toBeLessThan(0.15);
    expect(clearance).toBeGreaterThan(-0.001);
  });

  it('does not feed while the player has it uneasy, the bigger fish sooner', () => {
    const env: FishEnv = { floor: { heightAt: () => -0.5, waterAt: () => 0 }, minDepth: 0.015 };
    // an alarm that a 6 cm fish still feeds through puts a 10 cm one off
    expect(feed(env, 15, 0.2, 0.06).bites.bed.length).toBeGreaterThan(20);
    expect(feed(env, 15, 0.2, 0.1).bites.bed.length).toBe(0);
    const small = new HakuFish(0.025, new Rng(1)), big = new HakuFish(0.095, new Rng(1), SUBASHIRI);
    expect(big.vigilance).toBeGreaterThan(small.vigilance + 0.8);
  });

  it('takes fright further off the bigger it is', () => {
    const species = { brain: { tree: 'fish_school', params: { fleeLengthRef_mm: 24, fleeLengthExp: 0.5 } } } as never;
    expect(fleeScale({ species, length_mm: 24 })).toBeCloseTo(1, 6);
    expect(fleeScale({ species, length_mm: 96 })).toBeCloseTo(2, 6);
    // a species that does not say keeps its one flight distance
    expect(fleeScale({ species: { brain: { tree: 'x', params: {} } } as never, length_mm: 96 })).toBe(1);
  });
});

