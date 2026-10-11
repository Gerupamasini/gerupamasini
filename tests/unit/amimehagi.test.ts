import { describe, expect, it } from 'vitest';
import { Vector2, Vector3 } from 'three';
import { amimehagiGeometry, chainWeights, rigRest, triangleCount, PART_NAMES } from '../../src/creatures/species/amimehagi/geometry';
import { BONES, EYE, MODEL_TL, SPINE_D1, bodyDepth, dorsalY, halfWidthAt, ventralY } from '../../src/creatures/species/amimehagi/anatomy';
import { AmimehagiFish, type FishEnv } from '../../src/creatures/species/amimehagi/Behavior';
import { medianAngle, restPose } from '../../src/creatures/species/amimehagi/pose';
import { PALETTES, PALETTE_WEIGHTS, pickPalette } from '../../src/creatures/species/amimehagi/materials';
import type { SeagrassQuery, ShootRef } from '../../src/creatures/species/amimehagi/seagrass';
import { Rng } from '../../src/core/Rng';

describe('アミメハギ body plan', () => {
  it('is a deep rhomboid and very thin', () => {
    const { depth, width } = bodyDepth();
    // soft dorsal origin to the pelvic flap ≈ 0.56 TL; greatest width under a fifth of that
    expect(depth).toBeGreaterThan(0.5);
    expect(depth).toBeLessThan(0.62);
    expect(width / depth).toBeLessThan(0.2);
    // the deepest point above is the soft dorsal's origin, below the flap; the back dips between spine and fin
    expect(dorsalY(0.48)).toBeGreaterThan(dorsalY(0.33));
    expect(dorsalY(0.33)).toBeLessThan(dorsalY(SPINE_D1.s) + 0.001);
    expect(ventralY(0.425)).toBeGreaterThan(ventralY(0.47));
    // a narrow peduncle
    expect(dorsalY(0.77) + ventralY(0.77)).toBeLessThan(0.12);
  });

  it('sets the eye high and well behind the snout, with the spine over its back', () => {
    expect(EYE.s).toBeGreaterThan(0.18);
    expect(EYE.y).toBeGreaterThan(0.05);
    expect(SPINE_D1.s).toBeGreaterThan(EYE.s);
    expect(SPINE_D1.s - EYE.s).toBeLessThan(0.06);
    // the eye socket stands out of the flat cheek
    expect(halfWidthAt(EYE.s, EYE.y)).toBeGreaterThan(halfWidthAt(EYE.s, EYE.y - 0.1));
  });
});

describe('アミメハギ geometry', () => {
  it('splits the near tier into the rig\'s named parts', () => {
    const g = amimehagiGeometry(0);
    for (const n of PART_NAMES) expect(g[n], n).toBeTruthy();
    expect(Object.keys(amimehagiGeometry(1)).sort()).toEqual(['Body', 'Fins']);
    expect(Object.keys(amimehagiGeometry(2))).toEqual(['Body']);
  });

  it('stays inside the per-tier triangle budgets and gets cheaper with distance', () => {
    const t0 = triangleCount(0), t1 = triangleCount(1), t2 = triangleCount(2);
    expect(t0).toBeLessThan(22000);
    expect(t1).toBeLessThan(2500);
    expect(t2).toBeLessThan(400);
    expect(t0).toBeGreaterThan(t1);
    expect(t1).toBeGreaterThan(t2);
  });

  it('shares one geometry per tier', () => {
    expect(amimehagiGeometry(0)).toBe(amimehagiGeometry(0));
    expect(amimehagiGeometry(0).Body).toBe(amimehagiGeometry(0).Body);
  });

  it('faces the skin outward', () => {
    for (const lod of [0, 1, 2] as const) {
      const g = amimehagiGeometry(lod).Body!;
      const pos = g.getAttribute('position'), part = g.getAttribute('aPart'), idx = g.index!;
      const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), m = new Vector3();
      let out = 0, total = 0;
      for (let i = 0; i < idx.count; i += 3) {
        const ia = idx.getX(i), ib = idx.getX(i + 1), ic = idx.getX(i + 2);
        if (part.getX(ia) !== 0) continue;
        a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
        n.subVectors(b, a).cross(m.subVectors(c, a));
        if (n.lengthSq() < 1e-18) continue;
        const ctr = m.copy(a).add(b).add(c).divideScalar(3);
        // outward from the body's mid-plane (the fish is thin: the flanks face ±x, the knife edges up and down)
        const radial = new Vector3(ctr.x, ctr.y - (dorsalY(0.38 - ctr.z / MODEL_TL) - ventralY(0.38 - ctr.z / MODEL_TL)) * MODEL_TL / 2, 0);
        if (radial.lengthSq() < 1e-12) continue;
        if (n.dot(radial) > 0) out++;
        total++;
      }
      expect(out / total).toBeGreaterThan(0.95);
    }
  });

  it('weights every vertex fully to bones of the rig', () => {
    for (const lod of [0, 1, 2] as const) {
      for (const g of Object.values(amimehagiGeometry(lod))) {
        const sw = g!.getAttribute('skinWeight'), si = g!.getAttribute('skinIndex');
        for (let i = 0; i < sw.count; i++) {
          const sum = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
          expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
          expect(si.getX(i)).toBeLessThan(BONES.length);
        }
      }
    }
  });

  it('puts the undulating fins on their own bones and the eyes on theirs', () => {
    const r = rigRest();
    expect(r.dorsalAxes.length).toBe(7);
    expect(r.analAxes.length).toBe(7);
    const eye = amimehagiGeometry(0).Eye_L!;
    const si = eye.getAttribute('skinIndex');
    for (let i = 0; i < si.count; i++) expect(BONES[si.getX(i)]).toBe('J_eye_L');
    // a stiff deep body: rigid in a segment's middle
    expect(chainWeights(0.47)[0][1]).toBeCloseTo(1, 2);
  });
});

describe('アミメハギ fins', () => {
  it('sends a travelling wave along the median fins, reversed to back', () => {
    const p = restPose();
    p.medAmp = 0.4; p.medPhase = 0;
    const a0 = [0, 1, 2, 3, 4, 5, 6].map((i) => medianAngle(p, i));
    p.medPhase = 0.3;
    const a1 = [0, 1, 2, 3, 4, 5, 6].map((i) => medianAngle(p, i));
    // the crest moves toward the tail: the angle at bone i+1 later follows the angle at bone i earlier
    const crest = (a: number[]) => a.indexOf(Math.max(...a));
    p.medPhase = 0;
    expect(crest(a1)).toBeGreaterThanOrEqual(crest(a0));
    expect(new Set(a0.map((x) => x.toFixed(3))).size).toBeGreaterThan(3);
  });
});

/** a bed of shoots on a 6 cm grid, 50 cm long, water 70 cm deep */
function bed(): FishEnv {
  const shoots: ShootRef[] = [];
  for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) shoots.push({ x: i * 0.06 + (j % 2) * 0.02, y: 0, z: j * 0.06, len: 0.5 });
  const pushes = new Map<number, number[]>();
  const grass: SeagrassQuery = {
    near(x, z, r, out, max = 24) {
      const f = shoots.map((s) => ({ s, d: Math.hypot(s.x - x, s.z - z) })).filter((o) => o.d <= r).sort((a, b) => a.d - b.d).slice(0, max);
      // (like the real bridge: the result objects are reused from call to call)
      f.forEach((o, i) => { Object.assign(out[i] ?? (out[i] = { x: 0, y: 0, z: 0, len: 0 }), o.s); });
      return f.length;
    },
    bladeAt(s, h, out) { return out.set(s.x, s.y + h, s.z); },
    cover() { return 0.8; },
    current(out: Vector2) { return out.set(0, 0); },
    claimPush() { return 0; },
    setPush(slot, x, y, z, r) { pushes.set(slot, [x, y, z, r]); },
    releasePush() { /* none */ },
  };
  return { floor: { heightAt: () => 0, waterAt: () => 0.7 }, minDepth: 0.03, grass, threat: null };
}

function fish(seed = 3): AmimehagiFish {
  const f = new AmimehagiFish(0.04, new Rng(seed));
  f.pos.set(0.01, 0.2, 0.02);
  return f;
}

function run(f: AmimehagiFish, env: FishEnv, seconds: number, each?: (t: number) => void): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) { f.update(dt, env); each?.(t); }
}

describe('アミメハギ behaviour', () => {
  it('holds its place by a leaf when hovering, on its fins, the tail still', () => {
    const env = bed(), f = fish();
    f.enter('HOVER', 20, env);
    run(f, env, 2);
    const p0 = f.pos.clone();
    let maxTail = 0, maxPec = 0;
    run(f, env, 8, () => { maxTail = Math.max(maxTail, f.pose.tailAmp); maxPec = Math.max(maxPec, f.pose.pecAmpL); });
    expect(f.pos.distanceTo(p0)).toBeLessThan(0.03);
    expect(maxTail).toBeLessThan(0.02);
    expect(maxPec).toBeGreaterThan(0.1);
    expect(f.pose.medAmp).toBeGreaterThan(0.05);
  });

  it('moves slowly from leaf to leaf without beating its tail', () => {
    const env = bed(), f = fish(5);
    f.enter('SLOW_SWIM', 30, env, { target: new Vector3(0.4, 0, 0.3) });
    let maxSpeed = 0, maxTail = 0;
    run(f, env, 20, () => { maxSpeed = Math.max(maxSpeed, Math.hypot(f.vel.x, f.vel.z)); maxTail = Math.max(maxTail, f.pose.tailAmp); });
    expect(Math.hypot(f.pos.x - 0.4, f.pos.z - 0.3)).toBeLessThan(Math.hypot(0.39, 0.28) - 0.15);
    // one to two body lengths a second at most
    expect(maxSpeed).toBeLessThan(2.2 * f.tl);
    expect(maxTail).toBeLessThan(0.02);
  });

  it('pecks: edges up, darts in with the mouth opening, backs off', () => {
    const env = bed(), f = fish(7);
    const events: string[] = [];
    f.onEvent = (e) => events.push(e);
    f.enter('FORAGE', 20, env);
    let maxJaw = 0;
    run(f, env, 15, () => { maxJaw = Math.max(maxJaw, f.pose.jaw); });
    expect(events.filter((e) => e === 'forage').length).toBeGreaterThan(2);
    expect(maxJaw).toBeGreaterThan(0.6);
  });

  it('escapes with hard tail beats, spine up, then hides in the leaves', () => {
    const env = bed(), f = fish(9);
    env.threat = new Vector3(-0.5, 0.3, 0);
    f.enter('HOVER', 10, env);
    run(f, env, 1);
    f.enter('ESCAPE', 8, env, { from: env.threat });
    let maxSpeed = 0, maxTail = 0, maxSpine = 0;
    run(f, env, 0.7, () => { maxSpeed = Math.max(maxSpeed, f.vel.length()); maxTail = Math.max(maxTail, f.pose.tailAmp); maxSpine = Math.max(maxSpine, f.pose.spine); });
    expect(maxSpeed).toBeGreaterThan(6 * f.tl);
    expect(maxTail).toBeGreaterThan(0.3);
    expect(maxSpine).toBeGreaterThan(0.95);
    // away from the threat
    expect(f.pos.x).toBeGreaterThan(0.05);
    run(f, env, 2);
    expect(f.state).toBe('SEAGRASS_HIDE');
    run(f, env, 3);
    expect(f.dark).toBeGreaterThan(0.4);
    expect(f.pose.tailAmp).toBeLessThan(0.05);
  });

  it('hides head-down beside a shoot, on the far side from the threat', () => {
    const env = bed(), f = fish(11);
    env.threat = new Vector3(0.0, 0.25, -0.8);
    f.enter('SEAGRASS_HIDE', 20, env, { from: env.threat });
    run(f, env, 6);
    expect(f.pitch).toBeLessThan(-0.7);
    expect(f.pose.spine).toBeGreaterThan(0.9);
    // the nearest shoot lies between it and the threat
    const out: ShootRef[] = [];
    env.grass!.near(f.pos.x, f.pos.z, 0.2, out, 1);
    const s = out[0];
    expect(Math.hypot(s.x - f.pos.x, s.z - f.pos.z)).toBeLessThan(0.06);
    expect(f.pos.z).toBeGreaterThan(s.z - 0.005);
  });

  it('moves its eyes each on its own', () => {
    const env = bed(), f = fish(13);
    f.enter('HOVER', 30, env);
    let differ = 0, n = 0;
    run(f, env, 10, () => { n++; if (Math.abs(f.pose.eyeL.yaw - f.pose.eyeR.yaw) > 0.05) differ++; });
    expect(differ / n).toBeGreaterThan(0.3);
  });

  it('keeps the whole fish in the water, off the sand, under the surface', () => {
    const env = bed(), f = fish(15);
    f.pos.y = 0.69;
    f.enter('SEAGRASS_HIDE', 10, env);
    run(f, env, 5);
    const tipDown = f.pos.y - Math.sin(-f.pitch) * 0.38 * f.tl;
    expect(tipDown).toBeGreaterThan(0);
    expect(f.pos.y).toBeLessThan(0.7);
  });
});

describe('アミメハギ looks', () => {
  it('varies between individuals, weighted toward the leaves\' olive and brown', () => {
    expect(PALETTE_WEIGHTS.length).toBe(PALETTES.length);
    expect(PALETTE_WEIGHTS.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(pickPalette(i / 200));
    expect(seen.size).toBe(PALETTES.length);
  });
});
