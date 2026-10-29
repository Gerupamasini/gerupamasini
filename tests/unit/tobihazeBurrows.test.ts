import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { Rng } from '../../src/core/Rng';
import { MapSchema, SpeciesSchema, type Substrate } from '../../src/data/schemas';
import { Terrain } from '../../src/world/Terrain';
import { Habitat } from '../../src/world/Habitat';
import { Spawner } from '../../src/creatures/Spawner';
import { generateIndividual } from '../../src/creatures/Individual';
import { createTobihaze, type TobiApi, type TobiEnv, type TobiFrame } from '../../src/creatures/species/tobihaze/behavior';
import { BURROW_SUBSTRATES, burrowSeed, diggable, MAX_BURROWS, planBurrows, type TobiBurrow } from '../../src/creatures/species/tobihaze/burrows';
import { BurrowLayer, openingGround } from '../../src/creatures/species/tobihaze/burrowLayer';
import { TobihazeDriver } from '../../src/creatures/species/tobihaze/TobihazeDriver';
import type { BehaviorEvent, DriverContext, Floor } from '../../src/creatures/drivers/Driver';

/**
 * トビハゼ's burrows: laid out by the spot (burrows.ts), on mud only, the same for the behaviour that dives into them and
 * the layer that draws them; the fish down the hole is right under the opening, its head looks out through the middle
 * of it, and the driver puts each opening on the ground exactly where the behaviour has it.
 */

const pub = (rel: string) => fileURLToPath(new URL(`../../public/data/${rel}`, import.meta.url));
const json = (rel: string) => JSON.parse(fs.readFileSync(pub(rel), 'utf8'));
const sp = SpeciesSchema.parse(json('species/periophthalmus_modestus.json'));
const L = 0.072;

/** mud for x > 0, sand for x < 0 (and rock past x > 30), a gentle slope up +x, the water at −0.2 */
const halfMud = (x: number, _z = 0): Substrate => (x > 30 ? 'rock' : x > 0 ? 'mud' : 'sand');
const env = (sub: (x: number, z: number) => Substrate = halfMud, extra: Partial<TobiEnv> = {}): TobiEnv => ({
  groundY: (x, z) => 0.02 * x + 0.003 * Math.sin(z * 3),
  waterY: () => -0.2,
  sample: (x, z) => ({ substrate: sub(x, z), depth: -1, exposed: true, wetness: 0.5, distToWater: 5, inPool: false, tags: ['exposed_mud'], waterLevel: -0.2, groundHeight: 0 }),
  canBurrow: true,
  ...extra,
});
const run = (b: TobiApi, e: TobiEnv, seconds: number, each?: (f: TobiFrame) => void, dt = 1 / 30) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) each?.(b.update(dt, e));
};
const make = (x: number, z: number, home = { x, z }, seed = 5) => {
  const r = new Rng(seed);
  return createTobihaze({ rng: () => r.next(), length: L, start: { x, z, heading: 0.3 }, home });
};

describe('トビハゼ burrows: the layout', () => {
  it('digs where the species lives: its exposed-mud spawn rows\' substrates, no other', () => {
    const rows = sp.spawn.filter((r) => r.tags.includes('exposed_mud'));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect([...(r.substrate ?? [])].sort()).toEqual([...BURROW_SUBSTRATES].sort());
    for (const s of ['sand', 'gravel', 'rock'] as Substrate[]) expect(BURROW_SUBSTRATES.has(s)).toBe(false);
  });

  it('is the spot\'s: the same home gives the same burrows (whatever the fish), another home others', () => {
    const e = env();
    const a = planBurrows({ x: 3.21, z: -7.4 }, L, e), b = planBurrows({ x: 3.21, z: -7.4 }, 0.06, e);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.map((h) => [h.x, h.z, h.kind, h.az])).toEqual(b.map((h) => [h.x, h.z, h.kind, h.az]));
    expect(planBurrows({ x: 3.21, z: -7.4 }, L, e)).toEqual(a);
    const c = planBurrows({ x: 5.5, z: 2 }, L, e);
    expect(c[0].x).not.toBe(a[0].x);
    expect(burrowSeed(1, 2)).toBe(burrowSeed(1.001, 2.001));
  });

  it('a Y of two openings at the home, two crab holes about, every one on mud', () => {
    const e = env();
    for (let i = 0; i < 200; i++) {
      const home = { x: -1.5 + (i % 20) * 0.6, z: Math.floor(i / 20) * 1.3 };
      const list = planBurrows(home, L, e);
      for (const h of list) {
        expect(halfMud(h.x, h.z), JSON.stringify(h)).toBe('mud');
        expect(h.r).toBeGreaterThan(0.008);
        expect(h.r).toBeLessThan(0.021);
      }
      const own = list.find((h) => h.kind === 'own');
      if (home.x > 0.01) {
        // its own at the home itself on mud; the second opening 8–18 cm off
        expect(own).toBeDefined();
        expect(own!.x).toBe(home.x); expect(own!.z).toBe(home.z);
        const two = list.find((h) => h.kind === 'own2');
        if (two) { const d = Math.hypot(two.x - own!.x, two.z - own!.z); expect(d).toBeGreaterThanOrEqual(0.08); expect(d).toBeLessThanOrEqual(0.18); }
      } else if (own) {
        // on sand: the nearest mud, within 1.6 m
        expect(Math.hypot(own.x - home.x, own.z - home.z)).toBeLessThanOrEqual(1.6 + 1e-9);
      }
      expect(list.filter((h) => h.kind === 'crab').length).toBeLessThanOrEqual(2);
    }
    // stones (a fish of the waterline rows): no burrow at all; nothing to dig into: none
    expect(planBurrows({ x: 2, z: 0 }, L, env(() => 'rock'))).toEqual([]);
    expect(planBurrows({ x: 2, z: 0 }, L, env(halfMud, { canBurrow: false }))).toEqual([]);
    // a tank or a case's walls: inside them
    const box = { minX: -0.2, maxX: 0.2, minZ: -0.1, maxZ: 0.1 };
    for (const h of planBurrows({ x: 0.1, z: 0 }, L, { canBurrow: true, bounds: box })) expect(diggable({ bounds: box }, h.x, h.z)).toBe(true);
  });

  it('on 葛西: round the homes the spawner gives, every opening on the flat\'s mud', () => {
    const map = MapSchema.parse(json('maps/kasai_west.json'));
    const hp = PNG.sync.read(fs.readFileSync(pub(`maps/${map.height.file}`))), sb = PNG.sync.read(fs.readFileSync(pub(`maps/${map.substrate.file}`)));
    const heights = new Float32Array(hp.width * hp.height), substrate = new Uint8Array(heights.length);
    for (let i = 0; i < heights.length; i++) {
      heights[i] = map.height.min_tp_m + (((hp.data[i * 4] << 8) | hp.data[i * 4 + 1]) / 65535) * (map.height.max_tp_m - map.height.min_tp_m);
      substrate[i] = sb.data[i * 4];
    }
    const terrain = new Terrain({ n: hp.width, size: map.size_m, heights, substrate }, map.substrate.palette);
    const hab = new Habitat(terrain, map.habitat?.coarse_m ?? 5);
    const now = 1e9;
    hab.update(now, -1.0);
    const spawner = new Spawner(hab, [sp], new Set());
    const e: TobiEnv = { groundY: (x, z) => terrain.heightAt(x, z), waterY: (x, z) => hab.waterAt(x, z), sample: (x, z) => hab.sample(x, z, now), canBurrow: true };
    let homes = 0, holes = 0, ownOnMud = 0;
    const floor: Floor = { heightAt: (x, z) => terrain.heightAt(x, z), surfaceAt: (x, z) => terrain.surfaceAt(x, z), waterAt: (x, z) => hab.waterAt(x, z) };
    const n = new Vector3();
    for (const [px, pz] of [[-117, -20], [-60, 10], [0, 0], [40, -40], [-90, 60]]) {
      const reqs = spawner.plan(px, pz, { tod: 'day', season: 'summer', tidePhase: 'low', mapId: 'kasai_west', gameMs: now, day: 3 }, [], 0, 1);
      for (const r of reqs) {
        homes++;
        const list = planBurrows({ x: r.x, z: r.z }, L, e);
        if (list[0]?.kind === 'own') ownOnMud++;
        for (const h of list) {
          holes++;
          expect(BURROW_SUBSTRATES.has(terrain.substrateAt(h.x, h.z)), `${terrain.substrateAt(h.x, h.z)} at ${h.x}, ${h.z}`).toBe(true);
          // on the ground: the drawn surface and the behaviour's ground, within millimetres, never under either
          const y = openingGround(floor, h.x, h.z, n);
          expect(y).toBeGreaterThanOrEqual(terrain.heightAt(h.x, h.z));
          expect(y).toBeGreaterThanOrEqual(terrain.surfaceAt(h.x, h.z));
          expect(y - terrain.heightAt(h.x, h.z)).toBeLessThan(0.01);
          expect(n.y).toBeGreaterThan(0.9);
        }
      }
    }
    console.log(`[tobihaze burrows] 葛西: ${homes} homes, ${holes} openings, ${ownOnMud} with their own burrow`);
    expect(homes).toBeGreaterThan(5);
    expect(ownOnMud / homes).toBeGreaterThan(0.8);
  });
});

describe('トビハゼ burrows: the behaviour uses them', () => {
  it('knows the spot\'s burrows from its first update, and keeps them through serialize / restore', () => {
    const e = env();
    const b = make(2, 1);
    expect(b.burrows.length).toBe(0);
    b.update(1 / 30, e);
    expect(b.burrows).toEqual(planBurrows({ x: 2, z: 1 }, L, e));
    const snap = b.serialize();
    const c = make(7, 7, { x: 7, z: 7 }, 9);
    c.restore(JSON.parse(JSON.stringify(snap)) as typeof snap);
    c.update(1 / 30, e);
    expect(c.burrows).toEqual(b.burrows);
  });

  it('dives into one of them, hides right under the opening, looks out through its middle, says so, and comes out', () => {
    const e = env(halfMud, { player: { x: 40, z: 40 } });
    const b = make(2, 1);
    b.update(1 / 30, e);
    const holes = b.burrows.map((h) => ({ ...h }));
    const events: string[] = [];
    let hiddenAt: TobiBurrow | null = null, hiddenFrames = 0, peekFrames = 0, out = false, worstPeek = 0, worstHidden = 0;
    b.setIntent({ kind: 'burrow', seconds: 4 });
    run(b, e, 40, (f) => {
      events.push(...f.events);
      const at = (x: number, z: number) => holes.find((h) => Math.hypot(h.x - x, h.z - z) < 0.2) ?? null;
      if (f.hidden) {
        hiddenFrames++;
        const h = at(f.root.x, f.root.z);
        expect(h).not.toBeNull();
        hiddenAt = h;
        worstHidden = Math.max(worstHidden, Math.hypot(f.root.x - h!.x, f.root.z - h!.z));
        expect(f.root.y).toBeLessThan(e.groundY(h!.x, h!.z));
      }
      if (f.phase === 'peek' && hiddenAt) {
        peekFrames++;
        // the body's axis (the root's forward) meets the mud at the middle of the opening
        const q = new Quaternion(...f.root.quat), fwd = new Vector3(0, 0, 1).applyQuaternion(q);
        const h = hiddenAt as TobiBurrow, gy = e.groundY(h.x, h.z);
        const t = (gy - f.root.y) / fwd.y;
        worstPeek = Math.max(worstPeek, Math.hypot(f.root.x + fwd.x * t - h.x, f.root.z + fwd.z * t - h.z));
        // the head out, nose up
        expect(fwd.y).toBeGreaterThan(0.8);
      }
      if (peekFrames && !f.hidden && f.state !== 'BURROW') out = true;
    });
    expect(hiddenFrames).toBeGreaterThan(30 * 3);
    expect(worstHidden).toBeLessThan(1e-9);
    expect(peekFrames).toBeGreaterThan(0);
    expect(worstPeek).toBeLessThan(0.001);
    expect(out).toBe(true);
    // the encyclopedia's id as it goes in, and again as it looks out
    expect(events.filter((x) => x === 'burrow').length).toBeGreaterThanOrEqual(2);
  }, 20_000);

  it('goes in through the opening: the body crosses the mud at the hole\'s middle as it pitches down', () => {
    const e = env(halfMud, { player: { x: 40, z: 40 } });
    const b = make(2, 1);
    b.update(1 / 30, e);
    b.setIntent({ kind: 'burrow', seconds: 4 });
    let worst = 0, frames = 0;
    run(b, e, 20, (f) => {
      const h = b.burrows.find((k) => Math.hypot(k.x - f.root.x, k.z - f.root.z) < 0.15);
      if (f.phase !== 'enter' || !h) return;
      const q = new Quaternion(...f.root.quat), fwd = new Vector3(0, 0, 1).applyQuaternion(q);
      if (fwd.y > -0.7) return;       // (pitched down most of the way)
      frames++;
      const gy = e.groundY(h.x, h.z), t = (gy - f.root.y) / fwd.y;
      worst = Math.max(worst, Math.hypot(f.root.x + fwd.x * t - h.x, f.root.z + fwd.z * t - h.z));
    }, 1 / 120);
    expect(frames).toBeGreaterThan(0);
    // within the opening (the hole's radius: 1.2 cm for this fish)
    expect(worst).toBeLessThan(0.006);
  }, 20_000);

  it('far from them, finds a crab\'s hole on its way only where there is mud, else rests', () => {
    const strip = (x: number, z: number): Substrate => (Math.abs(z) < 0.3 ? 'mud' : 'sand');
    const e = env(strip, { player: { x: 40, z: 40 } });
    for (const [z, heading] of [[0, 0.2], [0.25, 1.4], [3, 0]] as [number, number][]) {
      const r = new Rng(3);
      const b = createTobihaze({ rng: () => r.next(), length: L, start: { x: 5, z, heading }, home: { x: 40, z: 9 } });
      for (let k = 0; k < 6; k++) {
        b.setIntent({ kind: 'burrow', seconds: 3 });
        run(b, e, 15, (f) => { if (f.hidden) expect(strip(f.root.x, f.root.z)).toBe('mud'); });
      }
      for (const h of b.burrows) expect(strip(h.x, h.z), JSON.stringify(h)).toBe('mud');
      expect(b.burrows.length).toBeLessThanOrEqual(MAX_BURROWS);
      if (z >= 3) expect(b.burrows.filter((h) => h.made).length).toBe(0);
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------------------------------- the driver
const TIER_GLB = new URL('../../src/assets/models/tobihaze/tobihaze.lod2.glb', import.meta.url).pathname;
function lod2Extras(): Record<string, unknown> {
  if (existsSync(TIER_GLB)) {
    const fd = openSync(TIER_GLB, 'r');
    const head = new Uint8Array(20);
    readSync(fd, head, 0, 20, 0);
    const len = head[12] | (head[13] << 8) | (head[14] << 16) | (head[15] << 24);
    const buf = new Uint8Array(len);
    readSync(fd, buf, 0, len, 20);
    closeSync(fd);
    const j = JSON.parse(new TextDecoder().decode(buf)) as { nodes: { extras?: { tobihaze?: { tier?: string } } }[] };
    const node = j.nodes.find((n) => n.extras?.tobihaze?.tier);
    if (node?.extras) return node.extras as Record<string, unknown>;
  }
  const fx = JSON.parse(readFileSync(new URL('./fixtures/tobihaze-rig.json', import.meta.url).pathname, 'utf8')) as { tiers: Record<string, Record<string, unknown>> };
  return fx.tiers.lod2;
}

describe('トビハゼ burrows: the driver draws them where the behaviour has them', () => {
  const ground = (x: number, z: number) => 0.31 + 0.015 * x - 0.01 * z;
  const floor: Floor = {
    heightAt: ground, surfaceAt: (x, z) => ground(x, z) + 0.0015, waterAt: () => -1,
    sampleAt: (x, z) => ({ substrate: halfMud(x, z), depth: -1, exposed: true, wetness: 0.5, distToWater: 5, inPool: false, tags: ['exposed_mud'], waterLevel: -1, groundHeight: ground(x, z) }),
  };
  const setup = (ctxExtra: Partial<DriverContext> = {}) => {
    const parent = new Group(), root = new Object3D();
    parent.add(root);
    const ind = generateIndividual(sp, 77, 3, 2, 0, 0, 0, [70, 70]);
    const d = new TobihazeDriver();
    const warn = console.warn;
    console.warn = () => undefined;
    d.attach(root, ind, lod2Extras(), {}, []);
    console.warn = warn;
    const ctx: DriverContext = { floor, player: new Vector3(30, 0, 30), simScale: 1, nowMs: 0, ...ctxExtra };
    d.update(1 / 30, ctx);
    return { d, parent, ctx, ind };
  };
  const layerOf = (parent: Group) => parent.children.find((o) => o.name === 'TobihazeBurrows') as BurrowLayer['mesh'] | undefined;

  it('one instanced draw, an opening per burrow, on the ground at its place', () => {
    const { d, parent, ind } = setup();
    const beh = d.behaviour!;
    const mesh = layerOf(parent)!;
    expect(mesh).toBeDefined();
    expect(beh.burrows.length).toBeGreaterThanOrEqual(3);
    expect(beh.burrows).toEqual(planBurrows({ x: ind.home.x, z: ind.home.z }, ind.length_mm / 1000, { sample: floor.sampleAt!, canBurrow: true }));
    const m = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), n = new Vector3();
    const attr = mesh.geometry.getAttribute('aHole');
    let drawn = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      // (a free slot is a zero matrix)
      if (m.elements[5] === 0) continue;
      m.decompose(p, q, s);
      drawn++;
      const h = beh.burrows.find((k) => Math.hypot(k.x - p.x, k.z - p.z) < 0.002)!;
      expect(h, `opening ${i}`).toBeDefined();
      const y = openingGround(floor, h.x, h.z, n);
      expect(y).toBeCloseTo(ground(h.x, h.z) + 0.0015, 9);
      // a hair over the drawn ground along its normal, the quad's +Y the ground's normal
      expect(p.y - y).toBeGreaterThan(0);
      expect(p.y - y).toBeLessThan(0.001);
      expect(new Vector3(0, 1, 0).applyQuaternion(q).dot(n)).toBeGreaterThan(0.9999);
      expect(attr.getX(i)).toBe(h.kind === 'own' ? 0 : h.kind === 'own2' ? 1 : 2);
      // the quad is the opening's radius × its extent
      expect(s.x / (2 * attr.getY(i))).toBeCloseTo(h.r, 6);
    }
    expect(drawn).toBe(beh.burrows.length);
    d.dispose();
    // gone with the fish (the spot's: back where they were when it comes back)
    let left = 0;
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); if (m.elements[5] !== 0) left++; }
    expect(left).toBe(0);
  });

  it('the hidden fish is at the opening; the encyclopedia hears the burrow; none drawn in a tank or the case', () => {
    const { d, ctx, parent } = setup();
    const events: string[] = [];
    d.onEvent((e: BehaviorEvent) => events.push(e.behaviorId));
    d.setIntent({ id: 1, kind: 'burrow', urgency: 0.3, seconds: 5 });
    let hid = false;
    for (let i = 0; i < 30 * 20; i++) {
      d.update(1 / 30, ctx);
      if (d.hidden) {
        hid = true;
        const pos = (d as unknown as { ind: { pos: Vector3 } }).ind.pos;
        expect(d.behaviour!.burrows.some((h) => Math.hypot(h.x - pos.x, h.z - pos.z) < 1e-9)).toBe(true);
      }
    }
    expect(hid).toBe(true);
    expect(events).toContain('burrow');
    d.dispose();
    // in a tank (walls) or the case (nothing to dig): no layer at all
    const t = setup({ bounds: { minX: -0.3, maxX: 0.3, minZ: -0.2, maxZ: 0.2 } });
    expect(layerOf(t.parent)).toBeUndefined();
    const c = setup({ canBurrow: false });
    expect(layerOf(c.parent)).toBeUndefined();
    expect(parent.children.length).toBeGreaterThan(0);
  });
});
