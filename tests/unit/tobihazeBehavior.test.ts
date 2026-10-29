import { describe, expect, it } from 'vitest';
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { Rng } from '../../src/core/Rng';
import {
  blendPoses, createTobihaze, crawlPose, EVENTS, poseContacts, propPose, rigFK, rigPoint, rigPose, STATE_EVENT, STATES, TOBI, tobiRig,
  type PoseRef, type RigContact, type RigPose, type TobiApi, type TobiEnv, type TobiFrame, type TobiIntent, type TobiRig, type TobiState, type V3,
} from '../../src/creatures/species/tobihaze/behavior';

/**
 * トビハゼ's behaviour, headless: every state from the brain's intents and the water, the crawl that never slides
 * (each welded contact checked through the rig's own forward kinematics, the GLB's crawl cycle and prop frames as the
 * pose module reads them), hops that leave nothing planted moving, transitions that keep the fins out of the mud, the
 * state kept across a tier change, the tank and the case, the eyes, and what an update costs.
 *
 * The rig is the shipped masters' (src/assets/models/tobihaze/*.glb, their JSON chunk), else a local build's
 * (tools/models/tobihaze/out/tiers/), else the extract in fixtures/tobihaze-rig.json.
 */

const TIERS = ['hero', 'lod1', 'lod2'] as const;
type Tier = (typeof TIERS)[number];
const MM = 0.001;

interface GltfNode { extras?: { tobihaze?: { tier?: string } } & Record<string, unknown> }
/** a GLB's root extras without reading its buffers */
function glbExtras(path: string): Record<string, unknown> {
  const fd = openSync(path, 'r');
  const head = new Uint8Array(20);
  readSync(fd, head, 0, 20, 0);
  const len = head[12] | (head[13] << 8) | (head[14] << 16) | (head[15] << 24);
  const buf = new Uint8Array(len);
  readSync(fd, buf, 0, len, 20);
  closeSync(fd);
  const json = JSON.parse(new TextDecoder().decode(buf)) as { nodes: GltfNode[] };
  const node = json.nodes.find((n) => n.extras?.tobihaze?.tier);
  if (!node?.extras) throw new Error(`no tobihaze extras in ${path}`);
  return node.extras;
}
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/tobihaze-rig.json', import.meta.url).pathname, 'utf8')) as { tiers: Record<Tier, Record<string, unknown>> };
const SOURCES = ['../../src/assets/models/tobihaze', '../../tools/models/tobihaze/out/tiers'];
const EXTRAS: Record<Tier, Record<string, unknown>> = {} as Record<Tier, Record<string, unknown>>;
for (const tier of TIERS) {
  let found: Record<string, unknown> | null = null;
  for (const dir of SOURCES) {
    const p = new URL(`${dir}/tobihaze.${tier}.glb`, import.meta.url).pathname;
    if (existsSync(p)) { found = glbExtras(p); break; }
  }
  EXTRAS[tier] = found ?? FIXTURE.tiers[tier];
}
const RIG: Record<Tier, TobiRig> = { hero: tobiRig(EXTRAS.hero), lod1: tobiRig(EXTRAS.lod1), lod2: tobiRig(EXTRAS.lod2) };

// ------------------------------------------------------------------------------------------------ worlds

const flat: TobiEnv = { groundY: () => 0, waterY: () => -1 };
const slope = (deg: number): TobiEnv => { const k = Math.tan((deg * Math.PI) / 180); return { groundY: (x, z) => k * (0.8 * x + 0.6 * z), waterY: () => -10 }; };
/** a 3° beach with ripples and hummocks of ±4 mm a few decimetres across */
const bumpy: TobiEnv = { groundY: (x, z) => 0.05 * x + 0.004 * Math.sin(x * 9) * Math.cos(z * 7), waterY: () => -10 };
/** land for x > 0, water for x < 0 (3° beach) */
const beach: TobiEnv = { groundY: (x) => 0.05 * x, waterY: () => 0, canBurrow: true };

const make = (tier: Tier, x = 0, z = 0, heading = 0, seed: number | Rng = 11, length = 0.08) => {
  const r = typeof seed === 'number' ? new Rng(seed) : seed;
  return createTobihaze({ rng: () => r.next(), length, start: { x, z, heading }, home: { x: 50, z: 50 }, extras: EXTRAS[tier] });
};
const run = (b: TobiApi, env: TobiEnv, seconds: number, each?: (f: TobiFrame, i: number) => void, dt = 1 / 60) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) each?.(b.update(dt, env), i);
};
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** a model-frame point (m at model scale) in the world, under a frame's root */
function toWorld(f: TobiFrame, m: V3): V3 {
  const q = f.root.quat, s = f.scale;
  const v: V3 = [m[0] * s, m[1] * s, m[2] * s];
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y + f.root.x, iy * w + iw * -y + iz * -x - ix * -z + f.root.y, iz * w + iw * -z + ix * -y - iy * -x + f.root.z];
}

/** the pose a frame asks for, as the pose module builds it from the GLB extras */
function poseOf(rig: TobiRig, f: TobiFrame): RigPose {
  const at = (ref: PoseRef) => rigPose(rig, ref, ref === 'crawl' ? f.crawl?.phase ?? 0 : ref === 'prop' ? f.prop?.raise ?? 15 : undefined);
  return f.stateBlend ? blendPoses(rig, at(f.stateBlend.from), at(f.stateBlend.to), f.stateBlend.u, f.stateBlend.lift) : at(f.pose);
}
const pelvicOf = (rig: TobiRig, set: 'land' | 'rest'): RigContact => {
  const c = rig.contacts[set]!.find((k) => k.name === 'pelvic')!;
  return { ...c, local: [0, c.local[1], c.local[2]] };
};

/** where a welded contact actually is under the frame's pose: the rig's forward kinematics of the bone it is on */
function actual(rig: TobiRig, f: TobiFrame, name: string): V3 | null {
  if (name.startsWith('crutch') && f.crawl) {
    const seg = rig.crawl.segs[Number(name.slice(-1))], side = name[6];
    if (!seg?.bone || !seg.lL || !seg.lR) return null;
    const W = rigFK(rig, crawlPose(rig, f.crawl.phase));
    return toWorld(f, rigPoint(rig, W, side === 'L' ? seg.bone : seg.bone.replace(/L$/, 'R'), side === 'L' ? seg.lL : seg.lR));
  }
  if (name === 'cup' && f.crawl && f.pose === 'crawl') {
    const c = pelvicOf(rig, 'land');
    return toWorld(f, rigPoint(rig, rigFK(rig, crawlPose(rig, f.crawl.phase)), c.bone, c.local));
  }
  if (name === 'cup' && f.pose === 'rest' && !f.stateBlend) {
    const c = pelvicOf(rig, 'rest');
    return toWorld(f, rigPoint(rig, rigFK(rig, rig.states.rest!), c.bone, c.local));
  }
  if ((name === 'soleL' || name === 'soleR' || name === 'cup') && f.pose === 'prop' && !f.stateBlend && f.prop) {
    const c = name === 'cup' ? pelvicOf(rig, 'land') : rig.contacts.land!.find((k) => k.name === name)!;
    return toWorld(f, rigPoint(rig, rigFK(rig, propPose(rig, f.prop.raise)), c.bone, c.local));
  }
  return null;
}

/**
 * The lowest of the contacts a frame's pose stands on (both ends' of a blend, those both share moved with it) over the
 * ground under each (m; negative: in the mud).
 */
function lowestOverGround(rig: TobiRig, f: TobiFrame, env: TobiEnv): { low: number; name: string } {
  const W = rigFK(rig, poseOf(rig, f));
  const k = f.stateBlend ? smooth(f.stateBlend.u) : 0;
  const A = poseContacts(rig, f.stateBlend ? f.stateBlend.from : f.pose), B = f.stateBlend ? poseContacts(rig, f.stateBlend.to) : [];
  const pec = (n: string) => /^(sole|blade|tip)/.test(n), side = (n: string) => (/L(Front|Back)?$|^(sole|blade|tip)L/.test(n) ? 'L' : 'R');
  let low = Infinity, name = '';
  const test = (p: V3, n: string) => { const w = toWorld(f, p); const d = w[1] - env.groundY(w[0], w[2]); if (d < low) { low = d; name = n; } };
  for (const c of A) {
    if (rig.index[c.bone] === undefined) continue;
    const p = rigPoint(rig, W, c.bone, c.local);
    const d = B.find((x) => x.name === c.name) ?? (pec(c.name) ? B.find((x) => pec(x.name) && side(x.name) === side(c.name)) : undefined);
    if (d && rig.index[d.bone] !== undefined) { const q = rigPoint(rig, W, d.bone, d.local); p[1] += (q[1] - p[1]) * k; }
    test(p, c.name);
  }
  for (const c of B) if (!A.some((x) => x.name === c.name) && !pec(c.name) && rig.index[c.bone] !== undefined) test(rigPoint(rig, W, c.bone, c.local), c.name);
  return { low, name };
}

/** random wandering intents round where it is (5–30 cm, now and then a rest), as the brain gives them */
function wanderer(b: TobiApi, seed: number, restShare = 0.15) {
  const r = new Rng(seed);
  return () => {
    if (b.busy) return;
    if (r.next() < restShare) { b.setIntent({ kind: 'rest', seconds: r.range(1, 4) }); return; }
    const a = r.range(0, Math.PI * 2), d = r.range(0.05, 0.3);
    b.setIntent({ kind: 'wander', target: { x: b.pos.x + Math.sin(a) * d, z: b.pos.z + Math.cos(a) * d }, urgency: 0.2, seconds: 20 });
  };
}

// ------------------------------------------------------------------------------------------------ the rig

describe('トビハゼ behaviour: the rig it plans with', () => {
  it('reads the GLB extras of every tier: the crawl cycle, the welds, the cup, the prop and the states', () => {
    for (const tier of TIERS) {
      const rig = RIG[tier];
      expect(rig.tier).toBe(tier);
      expect(rig.crawl.frames.length).toBeGreaterThanOrEqual(17);
      expect(rig.crawl.stride).toBeCloseTo(0.015, 6);
      expect(rig.crawl.cycleS).toBeCloseTo(0.5, 6);
      expect(rig.crawl.duty).toBeCloseTo(0.6, 6);
      expect(rig.crawl.segs.length).toBeGreaterThanOrEqual(1);
      for (const s of rig.crawl.segs) { expect(s.L[0]).toBeGreaterThan(0.009); expect(s.R[0]).toBeCloseTo(-s.L[0], 6); expect(s.lL).toBeTruthy(); }
      expect(rig.prop.raises[0]).toBe(10);
      expect(rig.prop.raises[rig.prop.raises.length - 1]).toBe(25);
      for (const k of ['land', 'reach', 'rest', 'water', 'swim'] as const) { expect(rig.states[k]).toBeTruthy(); expect(rig.ground[k]).toBeLessThan(-0.004); }
    }
  });

  it('agrees with the build: the weld the forward kinematics puts the touch-down vertex at is the extras\' weldM', () => {
    for (const tier of ['hero', 'lod1'] as const) {
      const X = (EXTRAS[tier].tobihaze ?? EXTRAS[tier]) as { hlMM: number; tlMM: number; crawl: { weldBind?: number[]; weldM: number[] } };
      const rig = RIG[tier], wb = X.crawl.weldBind!;
      const Y0 = 0.3 * X.hlMM, S0 = X.tlMM / 2;
      const bind: V3 = [wb[2] * MM, (wb[1] - Y0) * MM, (S0 - wb[0]) * MM];
      const bone = rig.crawl.segs[0].bone!;
      const local: V3 = [bind[0] - rig.joints[rig.index[bone]].pivot[0], bind[1] - rig.joints[rig.index[bone]].pivot[1], bind[2] - rig.joints[rig.index[bone]].pivot[2]];
      const at0 = rigPoint(rig, rigFK(rig, crawlPose(rig, 0)), bone, local);
      expect(dist(at0, X.crawl.weldM as V3)).toBeLessThan(0.002 * MM);
    }
  });

  it('holds the prop\'s soles where the land state put them at every raise it uses (12.5–25°): the IDLE props on welded feet', () => {
    for (const tier of TIERS) {
      const rig = RIG[tier], sole = rig.contacts.land!.find((c) => c.name === 'soleL')!;
      const ref = rigPoint(rig, rigFK(rig, propPose(rig, 15)), sole.bone, sole.local);
      for (let raise = TOBI.raiseDeg[0]; raise <= TOBI.raiseDeg[1]; raise += 0.5) {
        const p = rigPoint(rig, rigFK(rig, propPose(rig, raise)), sole.bone, sole.local);
        // (lod2's one-joint arm turns its card about the shoulder alone: its sole wanders up to ≈ 3.4 mm from the 15°
        // prop's at 25°, a far tier's)
        expect(dist(p, ref)).toBeLessThan((tier === 'lod2' ? 4 : 0.02) * MM);
      }
    }
  });

  it('keeps the numbers it uses without a model (the hero\'s) equal to the shipped hero\'s', () => {
    const hero = RIG.hero, none = tobiRig(null);
    for (let i = 0; i < 2; i++) expect(dist(none.crawl.segs[i].L, hero.crawl.segs[i].L)).toBeLessThan(0.01 * MM);
    expect(none.crawl.segs[1].from).toBe(hero.crawl.segs[1].from);
    expect(dist(none.crawl.cup, hero.crawl.cup)).toBeLessThan(0.01 * MM);
    expect(dist(none.prop.soleL, hero.prop.soleL)).toBeLessThan(0.01 * MM);
    for (const k of ['land', 'reach', 'rest', 'water', 'swim', 'crawl'] as const) expect(Math.abs(none.ground[k] - hero.ground[k])).toBeLessThan(0.01 * MM);
    expect(dist(none.restCup, hero.restCup)).toBeLessThan(0.01 * MM);
    expect(dist(none.eye.water, hero.eye.water)).toBeLessThan(0.01 * MM);
  });
});

// ------------------------------------------------------------------------------------------------ states

describe('トビハゼ behaviour: the eleven states', () => {
  it('reaches every state from the brain\'s intents and the depth at the body, and emits each state\'s id as it enters', () => {
    const seen = new Set<TobiState>();
    const bad: string[] = [];
    const watch = (b: TobiApi, env: TobiEnv, seconds: number, each?: () => void) => {
      let last: TobiState | null = null;
      run(b, env, seconds, (f) => {
        each?.();
        seen.add(f.state);
        for (const e of f.events) if (!(EVENTS as readonly string[]).includes(e)) bad.push(`unknown event ${e}`);
        if (last !== null && f.state !== last && !f.events.includes(STATE_EVENT[f.state])) bad.push(`${last} → ${f.state} without '${STATE_EVENT[f.state]}'`);
        last = f.state;
      });
    };
    const scenario = (x: number, h: number, intent: TobiIntent, env: TobiEnv, seconds: number) => { const b = make('hero', x, 0, h); b.setIntent(intent); watch(b, env, seconds); return b; };
    scenario(0.5, 0, { kind: 'rest', seconds: 30 }, beach, 30);                                                         // IDLE, LAND_REST
    scenario(0.5, 0, { kind: 'wander', target: { x: 0.6, z: 0.15 }, seconds: 20 }, beach, 12);                         // LAND_CRAWL
    scenario(0.5, 0, { kind: 'wander', target: { x: 1.2, z: 0.6 }, seconds: 20 }, beach, 15);                          // LAND_HOP
    scenario(0.5, 0, { kind: 'forage', seconds: 12 }, beach, 14);                                                      // FORAGE
    scenario(0.5, 0, { kind: 'burrow', seconds: 6 }, beach, 25);                                                       // BURROW
    scenario(0.5, 0, { kind: 'flee', from: { x: 1, z: 0 }, urgency: 1, seconds: 4 }, { ...beach, player: { x: 1, z: 0 }, alert: 1 }, 8); // ESCAPE
    scenario(0.5, Math.PI, { kind: 'moveTo', target: { x: -0.6, z: 0 }, seconds: 20 }, beach, 20);                    // WATER_ENTRY
    scenario(-1, 0, { kind: 'moveTo', target: { x: 0.3, z: 0.1 }, seconds: 20 }, beach, 25);                          // SWIM, SHALLOW_WATER, WATER_EXIT
    for (const s of STATES) expect(seen, `never ${s}`).toContain(s);
    expect(bad).toEqual([]);
  }, 60_000);

  it('lives through hours of random intents on a tidal beach: no NaN, never under the mud, every intent finished', () => {
    const KINDS = ['rest', 'wander', 'moveTo', 'flee', 'forage', 'display', 'burrow', 'special'] as const;
    let nan = 0, under = 0, stuck = 0;
    const seen = new Set<TobiState>();
    for (let k = 0; k < 6; k++) {
      const tier = TIERS[k % 3], r = new Rng(k * 7 + 1);
      let tide = -0.05;
      const player = { x: 3, y: 1.5, z: 0 };
      const env: TobiEnv = { groundY: (x, z) => 0.04 * x + 0.003 * Math.sin(x * 7 + z * 3), waterY: () => tide, canBurrow: true, player, alert: 0 };
      const b = make(tier, r.range(-0.5, 1), 0, r.range(0, 6), r, r.range(0.03, 0.1));
      let busyFor = 0;
      run(b, env, 600, (f, i) => {
        const t = i / 30;
        tide = -0.05 + 0.08 * Math.sin(t / 120);
        player.x = b.pos.x + 3 * Math.cos(t / 30); player.z = b.pos.z + 3 * Math.sin(t / 30);
        env.alert = Math.max(0, 1 - Math.hypot(player.x - b.pos.x, player.z - b.pos.z) / 3);
        seen.add(f.state);
        if ([f.root.x, f.root.y, f.root.z, ...f.root.quat, f.eyes.L.yaw, f.eyes.R.pitch, f.head.gape].some((v) => !Number.isFinite(v))) nan++;
        if (!f.hidden && f.state !== 'BURROW' && f.root.y < env.groundY(f.root.x, f.root.z) - 0.002) under++;
        busyFor = b.busy ? busyFor + 1 / 30 : 0;
        if (busyFor > 90) { stuck++; busyFor = 0; }
        if (!b.busy || busyFor === 0) {
          const kind = KINDS[Math.floor(r.next() * KINDS.length)], a = r.range(0, 6.28), d = r.range(0.05, 1.5);
          if (!b.busy) b.setIntent({ kind, target: { x: b.pos.x + Math.sin(a) * d, z: b.pos.z + Math.cos(a) * d }, from: { x: player.x, z: player.z }, urgency: kind === 'flee' ? 1 : r.next(), seconds: r.range(2, 20), param: kind === 'special' ? ['yawn', 'roll', 'water_entry'][Math.floor(r.next() * 3)] : 'alert' });
        }
      }, 1 / 30);
    }
    expect(nan).toBe(0);
    expect(under).toBe(0);
    expect(stuck).toBe(0);
    for (const s of STATES) expect(seen, `never ${s}`).toContain(s);
  }, 60_000);

  it('follows the tide: it keeps ahead of the rising water up the mud (TideWait), and lies on the bottom once it is under', () => {
    let water = 0.005;
    const env: TobiEnv = { groundY: (x) => 0.05 * x, waterY: () => water };
    const b = make('hero', 0.2, 0, -Math.PI / 2);
    b.setIntent({ kind: 'rest', seconds: 600 });
    const media = new Set<string>(), states = new Set<string>();
    const x0 = b.pos.x;
    // a flood tide of 0.2 mm/s (≈ 0.7 m an hour, the fastest on 葛西), then the water over it at once
    run(b, env, 150, (f) => {
      water += 0.0002 / 60;
      media.add(f.medium);
      states.add(f.state);
      if (!b.busy) b.setIntent({ kind: 'rest', seconds: 600 });
    });
    expect(b.pos.x - x0).toBeGreaterThan(0.05);
    expect(states).toContain('LAND_CRAWL');
    water = b.pos.x * 0.05 + 0.05;
    run(b, env, 5, (f) => { media.add(f.medium); states.add(f.state); });
    expect(media).toContain('water');
    expect(b.state).toBe('IDLE');
  }, 30_000);

  it('handles the tank (always flooded): rests on the bottom, swims, never a land state, inside the walls', () => {
    const tank: TobiEnv = { groundY: () => 0.03, waterY: () => 0.3, bounds: { minX: -0.2, maxX: 0.2, minZ: -0.1, maxZ: 0.1 }, canBurrow: true, player: { x: 0, y: 1, z: 2 } };
    const b = make('lod1', 0, 0, 0, 3);
    const r = new Rng(9);
    const seen = new Set<TobiState>();
    run(b, tank, 300, (f) => {
      if (!b.busy) {
        const u = r.next();
        if (u < 0.5) b.setIntent({ kind: 'rest', seconds: 6 + 20 * r.next() });
        else if (u < 0.8) b.setIntent({ kind: 'wander', target: { x: r.range(-0.2, 0.2), z: r.range(-0.1, 0.1) }, urgency: 0.3, seconds: 8 });
        else if (u < 0.9) b.setIntent({ kind: 'special', param: 'yawn', seconds: 3 });
        else if (u < 0.95) b.setIntent({ kind: 'forage', seconds: 5 });
        else b.setIntent({ kind: 'burrow', seconds: 10 });
      }
      seen.add(f.state);
      expect(f.root.x).toBeGreaterThanOrEqual(-0.2 + 0.03);
      expect(f.root.x).toBeLessThanOrEqual(0.2 - 0.03);
      expect(f.hidden).toBe(false);
      // under the surface, over the bottom
      expect(f.root.y).toBeLessThan(0.3);
      expect(f.root.y).toBeGreaterThan(0.03);
    });
    expect([...seen].every((s) => s === 'IDLE' || s === 'SWIM' || s === 'FORAGE')).toBe(true);
    expect(seen).toContain('SWIM');
    expect(seen).toContain('IDLE');
  }, 30_000);

  it('handles the case (a flat floor under 13 cm of water, nothing to dig into) and the room tank\'s single zero-dt update', () => {
    const kase: TobiEnv = { groundY: () => 1.2, waterY: () => 1.33, bounds: { minX: -0.1, maxX: 0.1, minZ: -0.07, maxZ: 0.07 }, canBurrow: false };
    const b = make('lod1');
    b.setIntent({ kind: 'burrow', seconds: 5 });
    run(b, kase, 6, (f) => { expect(f.hidden).toBe(false); expect(f.medium).toBe('water'); });
    expect(b.catchable).toBe(true);
    const room = make('lod2');
    const f = room.update(0, { groundY: () => 0.02, waterY: () => 0.3 });
    expect(f.state).toBe('IDLE');
    expect(f.root.y).toBeGreaterThan(0.02);
    expect(Number.isFinite(f.root.quat[3])).toBe(true);
  });

  it('goes down its burrow out of sight (hidden, not catchable), peeks out and comes out again', () => {
    const b = make('hero', 0.5, 0);
    b.setIntent({ kind: 'burrow', seconds: 4 });
    let hidden = 0, peeked = false, out = false;
    run(b, beach, 30, (f) => {
      if (f.hidden) { hidden++; expect(b.catchable).toBe(false); }
      if (f.phase === 'peek') { peeked = true; expect(b.catchable).toBe(false); }
      if (peeked && f.state !== 'BURROW') out = true;
    });
    expect(hidden).toBeGreaterThan(60 * 3);
    expect(peeked).toBe(true);
    expect(out).toBe(true);
  }, 20_000);
});

// ------------------------------------------------------------------------------------------------ no sliding

describe('トビハゼ behaviour: no sliding', () => {
  const grounds: [string, TobiEnv][] = [['flat', flat], ['10° slope', slope(10)], ['bumpy', bumpy]];
  const drifts: Record<string, number> = {};

  for (const tier of TIERS) for (const [gname, env] of grounds) {
    it(`${tier}, ${gname}: every welded contact stays put through its stance (60 s of crawling with turns)`, () => {
      const rig = RIG[tier];
      const b = make(tier, 0, 0, 0.3, 21);
      const next = wanderer(b, 5);
      const start = new Map<string, { plan: V3; real: V3 | null }>();
      let worst = 0, worstPlan = 0, stances = 0, turned = 0, headingWhileStanding = 0, lastH = Number.NaN;
      let prev = new Set<string>();
      run(b, env, 60, (f) => {
        next();
        const now = new Set<string>();
        for (const c of f.contacts) {
          if (!c.welded) continue;
          now.add(c.name);
          const real = actual(rig, f, c.name);
          if (!prev.has(c.name)) { start.set(c.name, { plan: [...c.world] as V3, real }); if (c.name === 'crutchL0') stances++; continue; }
          const s0 = start.get(c.name)!;
          worstPlan = Math.max(worstPlan, dist(c.world, s0.plan));
          if (real && s0.real) worst = Math.max(worst, dist(real, s0.real));
        }
        // turning: never while a crutch stands where it stood the frame before (only in the recovery, on the cup)
        if (Number.isFinite(lastH)) {
          const dh = Math.abs(Math.atan2(Math.sin(f.root.heading - lastH), Math.cos(f.root.heading - lastH)));
          turned += dh;
          if ([...now].some((n) => n.startsWith('crutch') && prev.has(n))) headingWhileStanding = Math.max(headingWhileStanding, dh);
        }
        lastH = f.root.heading;
        prev = now;
      });
      drifts[`${tier} ${gname}`] = worst;
      console.log(`[tobihaze no-slide] ${tier} ${gname}: ${stances} stances, turned ${(turned * 180 / Math.PI).toFixed(0)}°, worst weld drift ${(worst / MM).toFixed(4)} mm (planned ${(worstPlan / MM).toFixed(6)} mm)`);
      expect(stances).toBeGreaterThan(30);
      expect(turned).toBeGreaterThan(Math.PI);
      expect(worstPlan).toBeLessThan(1e-9);
      expect(headingWhileStanding).toBeLessThan(1e-9);
      // the hero's and lod1's crutches roll on their tips (the GLB's crawl cycle, its keys lerped): ≤ 0.1 mm a stance;
      // lod2's arm is one joint (J_pecL turned as the hero's): its blade card's tip wanders a few millimetres, which a
      // 40 m view does not show — the behaviour's plan is the same weld for it
      expect(worst).toBeLessThan(tier === 'lod2' ? 3 * MM : 0.1 * MM);
    }, 30_000);
  }

  it('documents what lod2\'s one-joint arm can do: the shoulder-to-weld distance through the stance', () => {
    const rig = RIG.lod2, seg = rig.crawl.segs[0], sh = rig.index.J_pecL;
    let lo = Infinity, hi = -Infinity;
    for (let ph = 0; ph < rig.crawl.duty; ph += 0.01) {
      const W = rigFK(rig, crawlPose(rig, ph));
      const d = dist(W.p[sh], seg.L);
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    // a rigid card on one joint can be aimed at the weld, but not stretched to it: the best it can do is this range
    console.log(`[tobihaze no-slide] lod2: shoulder–weld ${(lo / MM).toFixed(2)}–${(hi / MM).toFixed(2)} mm through the stance (an aimed one-joint arm misses by ≤ ${((hi - lo) / 2 / MM).toFixed(2)} mm)`);
    expect(hi - lo).toBeLessThan(6 * MM);
  });

  it('hops leave no planted contact moving: welded through the coil and after the landing, nothing planted in the push or the air', () => {
    for (const tier of TIERS) {
      const rig = RIG[tier];
      const b = make(tier, 0, 0, 0, 4);
      const r = new Rng(2);
      let hops = 0, prev = new Set<string>();
      const start = new Map<string, { plan: V3; real: V3 | null }>();
      let worst = 0, worstPlan = 0, landing = 0, lastStage = '';
      run(b, bumpy, 40, (f) => {
        if (!b.busy) {
          const a = r.range(0, Math.PI * 2), d = r.range(0.25, 0.6);
          b.setIntent({ kind: r.next() < 0.5 ? 'flee' : 'wander', target: { x: b.pos.x + Math.sin(a) * d, z: b.pos.z + Math.cos(a) * d }, from: { x: b.pos.x - Math.sin(a), z: b.pos.z - Math.cos(a) }, urgency: 1, seconds: 6 });
        }
        if (f.hop && (f.hop.stage === 'push' || f.hop.stage === 'air')) expect(f.contacts.filter((c) => c.welded)).toEqual([]);
        if (f.hop?.stage === 'land' && lastStage === 'air') {
          hops++;
          for (const c of f.contacts) if (c.name.startsWith('sole')) landing = Math.max(landing, Math.abs(c.world[1] - bumpy.groundY(c.world[0], c.world[2])));
        }
        lastStage = f.hop?.stage ?? '';
        const now = new Set<string>();
        for (const c of f.contacts) {
          if (!c.welded) continue;
          now.add(c.name);
          const real = actual(rig, f, c.name);
          if (!prev.has(c.name)) { start.set(c.name, { plan: [...c.world] as V3, real }); continue; }
          const s0 = start.get(c.name)!;
          worstPlan = Math.max(worstPlan, dist(c.world, s0.plan));
          if (real && s0.real) worst = Math.max(worst, dist(real, s0.real));
        }
        prev = now;
      });
      console.log(`[tobihaze hops] ${tier}: ${hops} hops, planted drift ${(worst / MM).toFixed(4)} mm, soles at landing within ${(landing / MM).toFixed(3)} mm of the mud`);
      expect(hops).toBeGreaterThan(10);
      expect(worstPlan).toBeLessThan(1e-9);
      expect(worst).toBeLessThan(tier === 'lod2' ? 0.3 * MM : 0.02 * MM);
      expect(landing).toBeLessThan(0.5 * MM);
    }
  }, 40_000);

  it('turns only about the pelvic cup in the recovery (the cup is the one welded contact then, and stays)', () => {
    const rig = RIG.hero;
    const b = make('hero', 0, 0, 0, 8);
    // a goal behind it: it must turn through ±180° crutching
    b.setIntent({ kind: 'moveTo', target: { x: 0, z: -0.25 }, seconds: 30 });
    let recoveries = 0, maxTurn = 0;
    let cup0: V3 | null = null, h0 = 0;
    run(b, slope(6), 20, (f) => {
      const cup = f.contacts.find((c) => c.name === 'cup' && c.welded && f.crawl);
      if (cup) {
        const real = actual(rig, f, 'cup')!;
        if (!cup0) { cup0 = real; h0 = f.root.heading; recoveries++; }
        expect(dist(real, cup0)).toBeLessThan(0.01 * MM);
        maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(f.root.heading - h0), Math.cos(f.root.heading - h0))));
      } else cup0 = null;
    });
    expect(recoveries).toBeGreaterThan(5);
    expect(maxTurn).toBeGreaterThan(0.3);
    expect(maxTurn).toBeLessThanOrEqual((TOBI.crawl.maxTurnDeg * Math.PI) / 180 + 1e-6);
  }, 20_000);
});

// ------------------------------------------------------------------------------------------------ transitions

describe('トビハゼ behaviour: transitions keep the fins out of the mud', () => {
  for (const tier of TIERS) {
    it(`${tier}: no fin or belly point goes into the ground beyond 0.05 mm through any blend on the ground`, () => {
      const rig = RIG[tier];
      let worst = Infinity, at = '', blends = 0;
      const pairs = new Set<string>();
      const check = (b: TobiApi, env: TobiEnv, seconds: number, each?: (i: number) => void) => run(b, env, seconds, (f, i) => {
        each?.(i);
        if (!f.stateBlend || f.hop || f.swim || f.hidden || f.phase === 'peek' || f.state === 'BURROW') return;
        blends++;
        pairs.add(`${f.stateBlend.from}>${f.stateBlend.to}`);
        const { low, name } = lowestOverGround(rig, f, env);
        if (low < worst) { worst = low; at = `${f.stateBlend.from}>${f.stateBlend.to} u ${f.stateBlend.u.toFixed(2)} ${name} (${f.state})`; }
      });
      // resting: lying down and propping up again, with an observer coming near and going away
      for (const env of [flat, slope(8)]) {
        const b = make(tier, 0, 0, 0.7, 31), observer = { x: 20, z: 0 };
        b.setIntent({ kind: 'rest', seconds: 200 });
        check(b, { ...env, player: observer }, 90, (i) => { observer.x = Math.floor(i / 600) % 2 ? 0.6 : 20; });
        // crawling bouts: re-planting into the crawl and out of it
        const c = make(tier, 0, 0, 0.2, 32), w = wanderer(c, 7, 0.4);
        check(c, env, 40, () => w());
      }
      // the flood under a resting fish, and out of the water
      let water = -0.015;
      const flood: TobiEnv = { groundY: () => 0, waterY: () => water };
      const d = make(tier, 0, 0, 0, 33);
      d.setIntent({ kind: 'rest', seconds: 100 });
      check(d, flood, 60, () => { water += 0.0004 / 60; });
      const e = make(tier, -1, 0, 0, 34);
      e.setIntent({ kind: 'moveTo', target: { x: 0.3, z: 0.1 }, seconds: 20 });
      check(e, beach, 25);
      console.log(`[tobihaze transitions] ${tier}: ${blends} frames in blends (${[...pairs].join(', ')}), lowest ${(worst / MM).toFixed(4)} mm at ${at}`);
      expect(blends).toBeGreaterThan(100);
      expect(worst).toBeGreaterThan(-0.05 * MM);
    }, 60_000);
  }
});

// ------------------------------------------------------------------------------------------------ a tier change

describe('トビハゼ behaviour: a tier change keeps the state', () => {
  it('serializes mid-stride and goes on with another tier\'s rig exactly where it was', () => {
    const ra = new Rng(41);
    const a = make('hero', 0, 0, 0.4, ra), next = wanderer(a, 3);
    let f: TobiFrame | null = null;
    run(a, slope(5), 3.31, (fr) => { next(); f = fr; });
    const frame0 = f as unknown as TobiFrame;
    expect(['LAND_CRAWL', 'LAND_HOP', 'IDLE']).toContain(frame0.state);
    const snap = a.serialize();
    // (a plain object: JSON round trip)
    // (the driver keeps one random stream per individual whatever the tier: the same one goes on here)
    const b = make('lod1', 9, 9, 2, Object.assign(new Rng(0), ra));
    b.restore(JSON.parse(JSON.stringify(snap)) as typeof snap);
    b.setRig(EXTRAS.lod1);
    a.setRig(EXTRAS.lod1);
    const fa = a.update(1 / 60, slope(5)), fb = b.update(1 / 60, slope(5));
    expect(fb.state).toBe(fa.state);
    expect(fb.phase).toBe(fa.phase);
    expect(fb.root.x).toBeCloseTo(fa.root.x, 9);
    expect(fb.root.y).toBeCloseTo(fa.root.y, 9);
    expect(fb.root.heading).toBeCloseTo(fa.root.heading, 9);
    // the welds it stood on are where they were before the change
    for (const c of fa.contacts) if (c.welded) { const o = frame0.contacts.find((k) => k.name === c.name && k.welded); if (o) expect(dist(o.world, c.world)).toBeLessThan(1e-9); }
    expect(fb.contacts.map((c) => c.name)).toEqual(fa.contacts.map((c) => c.name));
  });
});

// ------------------------------------------------------------------------------------------------ the numbers

describe('トビハゼ behaviour: kinematics against behaviour.md §3', () => {
  it('crutches at 0.45–0.55 s a cycle, duty 0.6, one GLB stride a cycle (≈ 0.375 BL/s)', () => {
    const b = make('hero', 0, 0, 0, 51);
    b.setIntent({ kind: 'moveTo', target: { x: 0, z: 2 }, seconds: 60 });
    // each cycle from one touch-down of the crutches to the next: its length, its share standing on them, the way made
    const cycles: { period: number; duty: number; advance: number }[] = [];
    let t = 0, prevWelded = false, t0 = -1, standing = 0, frames = 0, p0: V3 = [0, 0, 0];
    run(b, flat, 40, (f) => {
      t += 1 / 60;
      const w = f.contacts.some((c) => c.name.startsWith('crutchL') && c.welded);
      if (f.state === 'LAND_CRAWL' && w && !prevWelded) {
        const p: V3 = [f.root.x, f.root.y, f.root.z];
        if (t0 >= 0) cycles.push({ period: t - t0, duty: standing / frames, advance: dist(p, p0) });
        t0 = t; standing = 0; frames = 0; p0 = p;
      }
      frames++;
      if (w) standing++;
      prevWelded = w;
    });
    const steady = cycles.filter((c) => c.period < 0.7);
    expect(steady.length).toBeGreaterThan(20);
    const mean = (k: 'period' | 'duty' | 'advance') => steady.reduce((a, c) => a + c[k], 0) / steady.length;
    expect(mean('period')).toBeGreaterThanOrEqual(TOBI.crawl.cycleS[0] - 0.02);
    expect(mean('period')).toBeLessThanOrEqual(TOBI.crawl.cycleS[1] + 0.02);
    expect(mean('duty')).toBeCloseTo(0.6, 1);
    // one stride a cycle (15 mm at TL 80), so ≈ 0.375 BL/s at 0.5 s
    expect(mean('advance')).toBeCloseTo(RIG.hero.crawl.stride, 3);
    console.log(`[tobihaze crawl] cycle ${mean('period').toFixed(3)} s, duty ${mean('duty').toFixed(3)}, ${(mean('advance') / MM).toFixed(2)} mm a cycle, ${(mean('advance') / mean('period') / 0.08).toFixed(3)} BL/s`);
  }, 20_000);

  it('hops 1–3 body lengths on a ballistic arc: 0.08–0.25 s in the air, its apex 10–45 mm', () => {
    const b = make('hero', 0, 0, 0, 52);
    const r = new Rng(5);
    const hops: { range: number; air: number; apex: number }[] = [];
    let cur: { x: number; z: number; y0: number; t: number; apex: number } | null = null;
    run(b, flat, 40, (f) => {
      if (!b.busy) { const a = r.range(-0.3, 0.3); b.setIntent({ kind: 'wander', target: { x: b.pos.x + Math.sin(a) * 0.5, z: b.pos.z + Math.cos(a) * 0.5 }, urgency: 0.9, seconds: 10 }); }
      if (f.hop?.stage === 'push' && !cur) cur = { x: f.root.x, z: f.root.z, y0: f.root.y, t: 0, apex: 0 };
      if (cur && f.hop?.stage === 'air') { cur.t += 1 / 60; cur.apex = Math.max(cur.apex, f.root.y - cur.y0); }
      if (cur && f.hop?.stage === 'land') { hops.push({ range: Math.hypot(f.root.x - cur.x, f.root.z - cur.z) / 0.08, air: cur.t, apex: cur.apex }); cur = null; }
    });
    expect(hops.length).toBeGreaterThan(10);
    for (const h of hops) {
      expect(h.range).toBeGreaterThan(0.7);
      expect(h.range).toBeLessThanOrEqual(TOBI.hop.rangeMaxBL + 0.05);
      expect(h.air).toBeGreaterThan(0.06);
      expect(h.air).toBeLessThan(0.27);
      expect(h.apex).toBeGreaterThan(0.008);
      expect(h.apex).toBeLessThan(0.045);
    }
  }, 20_000);

  it('swims at 1.5–2.3 BL/s, a burst when it flees', () => {
    const deep: TobiEnv = { groundY: () => -1, waterY: () => 0 };
    const b = make('hero', 0, 0, 0, 53);
    b.setIntent({ kind: 'wander', target: { x: 0, z: 3 }, seconds: 20 });
    const v: number[] = [];
    run(b, deep, 6, (f) => { if (f.swim && f.state === 'SWIM') v.push(f.swim.speed); });
    const cruise = Math.max(...v);
    expect(cruise).toBeGreaterThanOrEqual(TOBI.swim.cruiseBL[0] - 0.05);
    expect(cruise).toBeLessThanOrEqual(TOBI.swim.cruiseBL[1] + 0.05);
    b.setIntent({ kind: 'flee', from: { x: 0, z: b.pos.z - 0.5 }, urgency: 1, seconds: 4 });
    let burst = 0;
    run(b, deep, 2, (f) => { if (f.swim) burst = Math.max(burst, f.swim.speed); });
    expect(burst).toBeGreaterThan(cruise);
  });

  it('strikes by pivoting over its planted soles with the jaws open onto the mud', () => {
    const rig = RIG.hero;
    const b = make('hero', 0, 0, 0, 54);
    let strikes = 0, gape = 0, pitch = 0, chinLow = Infinity, soleDrift = 0;
    let soles: V3[] | null = null;
    run(b, flat, 90, (f) => {
      if (!b.busy) b.setIntent({ kind: 'forage', seconds: 30 });
      if (f.phase === 'strike') {
        if (!soles) { soles = f.contacts.filter((c) => c.name.startsWith('sole')).map((c) => [...c.world] as V3); strikes++; }
        for (const c of f.contacts) if (c.name.startsWith('sole')) soleDrift = Math.max(soleDrift, Math.min(...soles.map((s) => dist(s, c.world))));
        gape = Math.max(gape, f.head.gape);
        pitch = Math.max(pitch, f.root.pitch);
        const chin = rig.contacts.land!.find((c) => c.name === 'chin')!;
        const p = toWorld(f, rigPoint(rig, rigFK(rig, poseOf(rig, f)), chin.bone, chin.local));
        chinLow = Math.min(chinLow, p[1]);
      } else soles = null;
    });
    expect(strikes).toBeGreaterThanOrEqual(3);
    expect(gape).toBeCloseTo(1, 1);
    expect(pitch).toBeGreaterThan(0.2);
    expect(soleDrift).toBeLessThan(1e-9);
    // the chin comes down to the mud (within a millimetre of it), never into it
    expect(chinLow).toBeLessThan(1.2 * MM);
    expect(chinLow).toBeGreaterThan(-0.05 * MM);
  }, 20_000);
});

// ------------------------------------------------------------------------------------------------ the eyes and the face

describe('トビハゼ behaviour: eyes, breathing, display', () => {
  it('moves each eye on its own (saccades) and fixes the observer with the eye that can see it', () => {
    const b = make('hero', 0, 0, 0, 61);
    b.setIntent({ kind: 'rest', seconds: 100 });
    let apart = 0, frames = 0, jumpsL = 0, jumpsR = 0, lastL = 0, lastR = 0;
    run(b, flat, 60, (f) => {
      frames++;
      if (Math.abs(f.eyes.L.yaw - f.eyes.R.yaw) > 3) apart++;
      if (Math.abs(f.eyes.L.yaw - lastL) > 0.8) jumpsL++;
      if (Math.abs(f.eyes.R.yaw - lastR) > 0.8) jumpsR++;
      lastL = f.eyes.L.yaw; lastR = f.eyes.R.yaw;
      for (const e of [f.eyes.L, f.eyes.R]) { expect(e.yaw).toBeGreaterThanOrEqual(TOBI.eyes.yaw[0] - 1e-6); expect(e.yaw).toBeLessThanOrEqual(TOBI.eyes.yaw[1] + 1e-6); }
    });
    expect(apart / frames).toBeGreaterThan(0.3);
    expect(jumpsL).toBeGreaterThan(10);
    expect(jumpsR).toBeGreaterThan(10);
    // the observer 1.5 m off the fish's left side (it faces +z; its left is +x), at eye height: the left eye turns to
    // it (out 90°: gaze yaw ≈ 71.7 − 90), the right one cannot see it
    const c = make('hero', 0, 0, 0, 62);
    c.setIntent({ kind: 'rest', seconds: 100 });
    let fL = 0;
    run(c, { ...flat, player: { x: 1.5, y: 0.02, z: 0 }, alert: 0.6 }, 3, (f) => { fL = f.eyes.L.yaw; });
    expect(fL).toBeLessThan(-5);
    expect(fL).toBeGreaterThan(-25);
  });

  it('blinks each eye on its own at the measured intervals (median ≈ 85 s on wet mud, ≈ 20 s drying), never under water', () => {
    /** blink starts per eye over an hour on mud of this wetness (HabitatSample.wetness) */
    const blinks = (wetness: number, seed: number) => {
      const sample = () => ({ wetness, substrate: 'mud' }) as unknown as ReturnType<NonNullable<TobiEnv['sample']>>;
      const b = make('hero', 0, 0, 0, seed);
      b.setIntent({ kind: 'rest', seconds: 1e5 });
      const starts: [number[], number[]] = [[], []];
      const prev = [0, 0];
      let t = 0;
      run(b, { ...flat, sample }, 3600, (f) => {
        t += 1 / 20;
        if (!b.busy) b.setIntent({ kind: 'rest', seconds: 1e5 });
        const v = [f.eyes.blink.L, f.eyes.blink.R];
        for (let i = 0; i < 2; i++) { if (t > 600 && v[i] > 0.5 && prev[i] <= 0.5) starts[i].push(t); prev[i] = v[i]; }
      }, 1 / 20);
      return starts;
    };
    const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const intervals = (s: [number[], number[]]) => s.flatMap((e) => e.slice(1).map((x, i) => x - e[i]));
    const wet = blinks(1, 63), dry = blinks(0, 64);
    const wetMedian = median(intervals(wet)), dryMedian = median(intervals(dry));
    console.log(`[tobihaze eyes] blinks a minute per eye: wet mud ${((wet[0].length + wet[1].length) / 2 / 50).toFixed(2)}, dry mud ${((dry[0].length + dry[1].length) / 2 / 50).toFixed(2)}; median interval wet ${wetMedian.toFixed(0)} s, dry ${dryMedian.toFixed(0)} s (Aiello 2023: ≈ 85 s, ≈ 20 s)`);
    expect(wetMedian).toBeGreaterThan(55);
    expect(wetMedian).toBeLessThan(120);
    expect(dryMedian).toBeGreaterThan(12);
    expect(dryMedian).toBeLessThan(35);
    // one eye or both: not always together, sometimes together
    const both = dry[0].filter((x) => dry[1].some((y) => Math.abs(x - y) < 0.3)).length;
    expect(both).toBeLessThan(dry[0].length);
    expect(both).toBeGreaterThan(0);
    // under water: none
    const w = make('hero', 0, 0, 0, 65);
    w.setIntent({ kind: 'rest', seconds: 1e5 });
    let under = 0;
    run(w, { groundY: () => 0, waterY: () => 0.1 }, 900, (f) => { if (f.eyes.blink.L > 0.5 || f.eyes.blink.R > 0.5) under++; if (!w.busy) w.setIntent({ kind: 'rest', seconds: 1e5 }); }, 1 / 20);
    expect(under).toBe(0);
  }, 60_000);

  it('breathes: throat pulses every 2–6 s on land, the gill slits 0.7–1.5 Hz in the water', () => {
    const b = make('hero', 0, 0, 0, 65);
    b.setIntent({ kind: 'rest', seconds: 100 });
    let pulses = 0, up = false;
    run(b, flat, 60, (f) => { if (f.head.gulp > 0.5 && !up) pulses++; up = f.head.gulp > 0.5; });
    expect(pulses).toBeGreaterThanOrEqual(10);
    expect(pulses).toBeLessThanOrEqual(30);
    const w = make('hero', 0, 0, 0, 66);
    w.setIntent({ kind: 'rest', seconds: 100 });
    let crossings = 0, last = 0;
    run(w, { groundY: () => 0, waterY: () => 0.2 }, 30, (f) => { if (f.head.vent > 0.5 && last <= 0.5) crossings++; last = f.head.vent; });
    expect(crossings / 30).toBeGreaterThanOrEqual(0.65);
    expect(crossings / 30).toBeLessThanOrEqual(1.55);
  });

  it('displays: the first dorsal up before the others, the cheeks inflated, the head up; the eye roll when it dries', () => {
    const b = make('hero', 0, 0, 0, 67);
    b.setIntent({ kind: 'display', param: 'inflate', seconds: 4 });
    let firstD1 = -1, firstMedian = -1, inflate = 0, raise = 0, t = 0;
    const ev = new Set<string>();
    run(b, flat, 4, (f) => {
      t += 1 / 60;
      if (f.fins.d1 > 0.5 && firstD1 < 0) firstD1 = t;
      if (f.fins.median > 0.8 && firstMedian < 0) firstMedian = t;
      inflate = Math.max(inflate, f.head.inflate);
      raise = Math.max(raise, f.prop?.raise ?? 0);
      for (const e of f.events) ev.add(e);
    });
    expect(ev).toContain('display');
    expect(firstD1).toBeGreaterThan(0);
    expect(firstMedian).toBeGreaterThan(firstD1);
    expect(inflate).toBeGreaterThan(0.85);
    expect(raise).toBeGreaterThan(20);
    expect(raise).toBeLessThanOrEqual(25);
    const r = make('hero', 0, 0, 0, 68);
    r.setIntent({ kind: 'special', param: 'roll', seconds: 6 });
    const rev = new Set<string>();
    let rolled = 0;
    run(r, flat, 6, (f) => { for (const e of f.events) rev.add(e); rolled = Math.max(rolled, Math.abs(f.root.roll)); if (f.phase === 'roll') { expect(f.eyes.blink.L).toBeGreaterThan(0.2); } });
    expect(rev).toContain('eye_roll');
    expect(rolled).toBeGreaterThan(1);
  });
});

// ------------------------------------------------------------------------------------------------ cost

describe('トビハゼ behaviour: the cost of an update', () => {
  it('updates an individual in microseconds whatever it is doing', () => {
    const now = () => performance.now();
    const modes: [string, (b: TobiApi) => void, TobiEnv][] = [
      ['idle (prop)', (b) => b.setIntent({ kind: 'rest', seconds: 1e4 }), flat],
      ['crawl', (b) => b.setIntent({ kind: 'moveTo', target: { x: b.pos.x, z: b.pos.z + 5 }, seconds: 1e4 }), bumpy],
      ['hop chain', (b) => b.setIntent({ kind: 'moveTo', target: { x: b.pos.x, z: b.pos.z + 50 }, urgency: 1, seconds: 1e4 }), bumpy],
      ['swim', (b) => b.setIntent({ kind: 'wander', target: { x: b.pos.x, z: b.pos.z + 50 }, seconds: 1e4 }), { groundY: () => -1, waterY: () => 0 }],
    ];
    const out: string[] = [];
    for (const [name, start, env] of modes) for (const tier of ['hero', 'lod2'] as const) {
      const fish = Array.from({ length: 40 }, (_, i) => { const b = make(tier, i * 0.3, 0, 0, 100 + i); start(b); return b; });
      for (const b of fish) for (let k = 0; k < 30; k++) b.update(1 / 60, env);
      const t0 = now();
      const N = 300;
      for (let k = 0; k < N; k++) for (const b of fish) b.update(1 / 60, env);
      const us = ((now() - t0) * 1000) / (N * fish.length);
      out.push(`${name} ${tier} ${us.toFixed(2)} µs`);
      expect(us).toBeLessThan(40);
    }
    console.log(`[tobihaze cost] per update: ${out.join(', ')}`);
  }, 30_000);

  it('builds a tier\'s rig tables once (cached per extras)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) tobiRig(EXTRAS.hero);
    expect(performance.now() - t0).toBeLessThan(20);
    expect(tobiRig(EXTRAS.hero)).toBe(RIG.hero);
  });
});
