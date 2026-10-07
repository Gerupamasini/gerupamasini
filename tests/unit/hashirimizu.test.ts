import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { Group, Object3D, Vector3 } from 'three';
import * as shape from '../../src/world/maps/hashirimizu/shape';
import { MapSchema } from '../../src/data/schemas/map';
import { SpeciesSchema, isAquatic, type SpeciesDef } from '../../src/data/schemas/species';
import { featureTagsOf } from '../../src/world/Habitat';
import { DRIVERS } from '../../src/creatures/drivers/index';
import { generateIndividual } from '../../src/creatures/Individual';
import type { DriverContext } from '../../src/creatures/drivers/Driver';

const root = fileURLToPath(new URL('../../', import.meta.url));
const json = (rel: string) => JSON.parse(readFileSync(root + 'public/data/' + rel, 'utf8'));
const map = MapSchema.parse(json('maps/hashirimizu.json'));
const { heightAt, offshore, ZERO_X, REF_TIDE } = shape;
/** the ground d metres from the shore, averaged along the coast (the alongshore undulation is a few cm) */
const meanH = (d: number) => { let s = 0, n = 0; for (let z = -36; z <= 36; z += 3) { s += heightAt(ZERO_X + d, z); n++; } return s / n; };

describe('走水: one gentle, constant slope', () => {
  it('falls steadily seaward with no cliff or step, from the beach to beyond the waders', () => {
    for (const z of [-30, -12, 0, 9, 24, 33]) {
      let prev = heightAt(ZERO_X - 9.5, z);
      for (let d = -9.25; d <= 45; d += 0.25) {
        const h = heightAt(ZERO_X + d, z);
        // never steeper than 1 in 7 over a quarter metre (the beach face), and seaward of the beach no rise worth a step
        expect(prev - h).toBeLessThan(0.25 * 0.15);
        if (d > 0.5) expect(h - prev).toBeLessThan(0.02);
        prev = h;
      }
    }
  });
  it('has a nearly constant gradient past the beach, a little gentler over the clam flat', () => {
    const slope = (a: number, b: number) => (meanH(a) - meanH(b)) / (b - a);
    const beach = slope(0, 5), clams = slope(5, 12), grass = slope(12, 22), deep = slope(22, 35);
    expect(clams).toBeLessThan(grass);
    expect(clams).toBeLessThan(beach);
    for (const s of [clams, grass, deep]) { expect(s).toBeGreaterThan(0.03); expect(s).toBeLessThan(0.07); }
    expect(Math.abs(grass - deep)).toBeLessThan(0.015);
  });
  it('puts the eelgrass under 30–80 cm of water at the exploring tide, and the waders stop past 22 m', () => {
    const depth = (d: number, tide = REF_TIDE) => tide - meanH(d);
    expect(depth(12)).toBeGreaterThan(0.25);
    expect(depth(12)).toBeLessThan(0.36);
    expect(depth(22)).toBeGreaterThan(0.72);
    expect(depth(22)).toBeLessThan(0.88);
    const wade = map.wading!.maxDepth_m;
    let limit = 0;
    for (let d = 0; d < 60; d += 0.1) if (depth(d) < wade) limit = d;
    expect(limit).toBeGreaterThan(23);
    expect(limit).toBeLessThan(29);
    // the tide moves it: spring low water opens the outer meadow, a high tide keeps the player near the beach
    let lowLimit = 0, highLimit = 0;
    for (let d = 0; d < 60; d += 0.1) { if (depth(d, -0.85) < wade) lowLimit = d; if (depth(d, 0.8) < wade) highLimit = d; }
    expect(lowLimit).toBeGreaterThan(limit + 8);
    expect(highLimit).toBeLessThan(6);
  });
  it('dries the clam flat at spring low water and covers it at the exploring tide', () => {
    for (const d of [6, 9, 11.5]) { expect(meanH(d)).toBeGreaterThan(-0.85); expect(meanH(d)).toBeLessThan(REF_TIDE); }
  });
  it('baked height and substrate maps match the shape (re-run tools/terrain/bake-hashirimizu.mjs after a change)', () => {
    const h = PNG.sync.read(readFileSync(root + 'public/data/maps/hashirimizu/height.png'));
    const s = PNG.sync.read(readFileSync(root + 'public/data/maps/hashirimizu/substrate.png'));
    expect(h.width).toBe(map.resolution);
    const N = map.resolution, cell = map.size_m / (N - 1);
    for (const [i, j] of [[10, 10], [100, 200], [150, 190], [200, 40], [300, 300], [384, 192]]) {
      const k = (j * N + i) * 4, x = -map.size_m / 2 + i * cell, z = -map.size_m / 2 + j * cell;
      const v = (h.data[k] * 256 + h.data[k + 1]) / 65535;
      expect(map.height.min_tp_m + v * (map.height.max_tp_m - map.height.min_tp_m)).toBeCloseTo(heightAt(x, z), 3);
      expect(s.data[k]).toBe(shape.substrateAt(x, z));
    }
  });
});

describe('走水: zones and patches', () => {
  it('lays the eelgrass from the clam flat outward in dense beds, sparse plants and open sand', () => {
    const cls = { dense: 0, sparse: 0, clump: 0, bare: 0 };
    let inner = 0;
    for (let d = 12; d <= 30; d += 0.5) for (let z = -38; z <= 38; z += 0.5) {
      const f = shape.eelgrassField(ZERO_X + d, z);
      if (f > 0.6) cls.dense++; else if (f > 0.53) cls.sparse++; else if (f > 0.47) cls.clump++; else cls.bare++;
    }
    for (let d = 0; d < 10; d += 0.5) for (let z = -38; z <= 38; z += 1) inner = Math.max(inner, shape.eelgrassZone(ZERO_X + d, z));
    const n = cls.dense + cls.sparse + cls.clump + cls.bare;
    expect(cls.dense / n).toBeGreaterThan(0.2);
    expect(cls.bare / n).toBeGreaterThan(0.25);
    expect((cls.sparse + cls.clump) / n).toBeGreaterThan(0.04);
    expect(inner).toBe(0);
  });
  it('has denser eelgrass to the right (south) than to the left', () => {
    let gl = 0, gr = 0;
    for (let d = 0; d <= 28; d += 0.5) for (let z = 13; z <= 38; z += 0.5) {
      gl += shape.eelgrassField(ZERO_X + d, -z); gr += shape.eelgrassField(ZERO_X + d, z);
    }
    expect(gr).toBeGreaterThan(gl);
  });
  it('is open sand between the seawall and the sea: no stone, no gravel', () => {
    for (let d = -9.5; d <= 40; d += 0.5) for (let z = -38; z <= 38; z += 1) expect(shape.substrateAt(ZERO_X + d, z)).not.toBe(3);
  });
  it('tags the bed, its margin on both sides and the open sand among it', () => {
    expect(featureTagsOf(0.8, 0.7, 0.9, 1)).toEqual(['eelgrass']);
    expect(featureTagsOf(0.8, 0.02, 0.9, 1)).toEqual(['eelgrass', 'eelgrass_edge']);
    expect(featureTagsOf(0.2, 0.1, 0.6, 1)).toEqual(['eelgrass_edge']);
    expect(featureTagsOf(0, 0, 0.7, 1)).toEqual(['eelgrass_edge', 'bare']);
    expect(featureTagsOf(0, 0, 0, 1)).toEqual(['bare']);
    expect(featureTagsOf(0, 0, 0, 0)).toEqual([]);
  });
});

describe('走水: who lives where', () => {
  const manifest = json('manifest.json') as { species: string[] };
  const species: SpeciesDef[] = manifest.species.map((id) => SpeciesSchema.parse(json(`species/${id}.json`)));
  // (a rule without `maps` holds on every flat, 走水 included)
  const here = (tag: string) => species.filter((sp) => sp.spawn.some((r) => (!r.maps || r.maps.includes('hashirimizu')) && r.tags.includes(tag as never))).map((sp) => sp.names.ja);
  // 走水 has gobies, shrimps, shellfish, the hermit crab and the ハク schools only (the crab and the worm stay out of the manifest)
  it('puts the right animals at each hotspot', () => {
    expect(here('eelgrass_edge')).toEqual(expect.arrayContaining(['マハゼ', 'シラタエビ', 'ユビナガホンヤドカリ', 'ボラ']));
    expect(here('eelgrass')).toEqual(expect.arrayContaining(['シラタエビ']));
    expect(here('bare')).toEqual(expect.arrayContaining(['マハゼ', 'アラムシロ']));
    expect([...here('small_pool'), ...here('pool')]).toEqual(expect.arrayContaining(['ユビナガホンヤドカリ', 'アラムシロ']));
    // the clam flat (shallow water and the sand it leaves at low water)
    expect([...here('shallow'), ...here('exposed_sand')]).toEqual(expect.arrayContaining(['ハマグリ', 'ユビナガホンヤドカリ']));
    for (const name of ['ケフサイソガニ', 'ミズヒキゴカイ', 'シロチドリ', 'エドハゼ']) for (const tag of ['eelgrass_edge', 'eelgrass', 'bare', 'pool', 'shallow', 'exposed_sand', 'waterline']) expect(here(tag)).not.toContain(name);
  });
  it('keeps the 葛西 animals to the 葛西 flat and the shore ones to 走水', () => {
    // (アサリ are laid by the clam field and マガキ by the reef, not by spawn rules; the hermit crab lives on both flats)
    const everywhere = new Set(['ruditapes_philippinarum', 'crassostrea_gigas', 'pagurus_minutus', 'mugil_cephalus']);
    for (const sp of species) if (!everywhere.has(sp.id)) for (const r of sp.spawn) expect(r.maps, `${sp.id}`).toBeDefined();
    const edo = species.find((sp) => sp.id === 'gymnogobius_macrognathos')!;
    expect(edo.spawn.every((r) => !r.maps!.includes('hashirimizu'))).toBe(true);
    const plover = species.find((sp) => sp.id === 'charadrius_alexandrinus')!;
    expect(plover.spawn.every((r) => !r.maps!.includes('hashirimizu'))).toBe(true);
  });
  it('has a driver with a model for every species, and keeps the crawling snail in the water', () => {
    for (const sp of species) expect(DRIVERS[sp.model.driver ?? ''], sp.id).toBeDefined();
    const snail = species.find((sp) => sp.id === 'reticunassa_festiva')!;
    expect(isAquatic(snail)).toBe(true);
  });
});

describe('走水: the shore animals move', () => {
  const species = (id: string) => SpeciesSchema.parse(json(`species/${id}.json`));
  const floor = { heightAt: () => 0, waterAt: () => 0.3 };
  const ctx = (extra: Partial<DriverContext> = {}): DriverContext => ({ floor, player: new Vector3(5, 0, 5), simScale: 1, nowMs: 0, locked: true, ...extra });
  function run(id: string, kind: 'wander' | 'flee' | 'rest', secs: number, extra: Partial<DriverContext> = {}) {
    const sp = species(id);
    const entry = DRIVERS[sp.model.driver!];
    const ind = generateIndividual(sp, 4242, 0, 0, 7, 0, 0);
    const holder = entry.placeholder!();
    const scene = new Group();
    scene.add(holder.root);
    const d = entry.create();
    const events: string[] = [];
    d.onEvent((e) => events.push(e.behaviorId));
    d.attach(holder.root, ind, {}, {}, []);
    const target = new Vector3(0.3, 0, 0.1);
    d.setIntent({ id: 1, kind, urgency: kind === 'flee' ? 1 : 0.5, seconds: secs, target });
    let t = 0;
    for (; t < secs; t += 1 / 30) d.update(1 / 30, ctx({ ...extra, nowMs: t * 1000 }));
    let meshes = 0;
    holder.root.traverse((o: Object3D) => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
    const out = { ind, d, events, meshes, pos: ind.pos.clone() };
    d.dispose();
    return out;
  }
  it('crabs walk sideways to where they are sent and run from a threat', () => {
    const w = run('hemigrapsus_penicillatus', 'wander', 16);
    expect(w.meshes).toBeGreaterThan(20);
    expect(w.pos.distanceTo(new Vector3(0.3, 0, 0.1))).toBeLessThan(0.02);
    expect(w.events).toContain('walk');
    // facing across the line it walked
    const across = Math.abs(Math.cos(w.ind.heading - Math.atan2(0.3, 0.1)));
    expect(across).toBeLessThan(0.3);
    const f = run('hemigrapsus_penicillatus', 'flee', 3);
    expect(f.events).toEqual(expect.arrayContaining(['scuttle', 'hide']));
  });
  it('hermit crabs and snails withdraw instead of running', () => {
    const h = run('pagurus_minutus', 'flee', 2);
    expect(h.events).toContain('withdraw');
    expect(h.pos.length()).toBeLessThan(1e-6);
    const s = run('reticunassa_festiva', 'flee', 2);
    expect(s.events).toContain('withdraw');
  });
  it('a mullet school stays in the water near the surface, and never leaves a tank', () => {
    const m = run('mugil_cephalus', 'wander', 6);
    expect(m.pos.y).toBeGreaterThan(0.1);
    expect(m.pos.y).toBeLessThan(0.3);
    const b = { minX: -0.2, maxX: 0.2, minZ: -0.1, maxZ: 0.1 };
    const t = run('mugil_cephalus', 'flee', 6, { bounds: b });
    expect(Math.abs(t.pos.x)).toBeLessThanOrEqual(0.2 + 1e-6);
    expect(Math.abs(t.pos.z)).toBeLessThanOrEqual(0.1 + 1e-6);
  });
  it('a crab a few metres off is one baked mesh, the full articulated model up close', () => {
    const sp = species('hemigrapsus_penicillatus');
    const entry = DRIVERS[sp.model.driver!];
    const ind = generateIndividual(sp, 77, 0, 0, 7, 0, 0);
    const holder = entry.placeholder!();
    const d = entry.create();
    d.attach(holder.root, ind, {}, {}, []);
    const drawn = () => { let n = 0; const walk = (o: Object3D) => { if (!o.visible) return; if ((o as { isMesh?: boolean }).isMesh) n++; o.children.forEach(walk); }; walk(holder.root); return n; };
    d.update(1 / 30, ctx({ locked: false, player: new Vector3(8, 0, 0) }));
    expect(drawn()).toBe(1);
    d.update(1 / 30, ctx({ locked: false, player: new Vector3(1, 0, 0) }));
    expect(drawn()).toBeGreaterThan(20);
    d.dispose();
  });
  it('a worm in the flat stays down its burrow', () => {
    const r = run('cirriformia_comosa', 'wander', 4);
    expect(r.pos.x).toBe(0);
    expect(r.pos.z).toBe(0);
  });
});
