import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import { FISH_SPECS } from '../../src/creatures/fish/species';
import { fishGeometry, BONE_COUNT } from '../../src/creatures/fish/body';
import { FishAgent, type FishEnv } from '../../src/creatures/fish/motion';
import { schoolFor } from '../../src/creatures/fish/school';
import { highPass, paintSkins } from '../../src/creatures/fish/paint';
import { PNG } from 'pngjs';
import { MapSchema, SpeciesSchema } from '../../src/data/schemas';
import { Spawner } from '../../src/creatures/Spawner';
import { Terrain } from '../../src/world/Terrain';
import { Habitat } from '../../src/world/Habitat';
import { Rng } from '../../src/core/Rng';

const BUDGET = JSON.parse(readFileSync('tools/models/budget.json', 'utf8')) as { limits: Record<'lod2' | 'lod1' | 'hero', Record<string, { tris: number; joints: number }>> };
const TIER = ['hero', 'lod1', 'lod2'] as const;

/** a sloping bed under 1.2 m of water at its deep end */
const env = (canBurrow = true): FishEnv => ({
  floor: { heightAt: (x: number) => -1.2 + 0.05 * x, waterAt: () => 0 },
  minDepth: 0.05,
  canBurrow,
});

describe('coastal fishes: geometry', () => {
  for (const [id, spec] of Object.entries(FISH_SPECS)) {
    it(`${id}: every tier within its size class's budget, lighter with distance, no NaN`, () => {
      let last = Infinity;
      for (const lod of [0, 1, 2] as const) {
        const g = fishGeometry(spec, lod);
        expect(g.triangles).toBeLessThan(BUDGET.limits[TIER[lod]][spec.sizeClass].tris);
        expect(g.triangles).toBeLessThan(last);
        last = g.triangles;
        for (const part of [g.body, g.fins, g.eyes]) {
          if (!part) continue;
          const p = part.getAttribute('position').array as Float32Array;
          expect(p.every(Number.isFinite)).toBe(true);
          const sw = part.getAttribute('skinWeight');
          for (let i = 0; i < sw.count; i++) expect(sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i)).toBeCloseTo(1, 4);
        }
      }
      expect(BONE_COUNT).toBeLessThanOrEqual(BUDGET.limits.lod2[spec.sizeClass].joints);
      expect(fishGeometry(spec, 2).eyes).toBeNull();
    });
  }

  it('the body faces outward (the loft winds its triangles the right way)', () => {
    const g = fishGeometry(FISH_SPECS.suzuki, 1).body;
    const pos = g.getAttribute('position'), col = g.getAttribute('color'), idx = g.index!;
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), m = new Vector3();
    let out = 0, total = 0;
    for (let i = 0; i < idx.count; i += 3) {
      // (the mouth's lining faces in)
      if (col.getX(idx.getX(i)) < 1 || col.getX(idx.getX(i + 1)) < 1 || col.getX(idx.getX(i + 2)) < 1) continue;
      a.fromBufferAttribute(pos, idx.getX(i)); b.fromBufferAttribute(pos, idx.getX(i + 1)); c.fromBufferAttribute(pos, idx.getX(i + 2));
      n.subVectors(b, a).cross(m.subVectors(c, a));
      if (n.lengthSq() < 1e-14) continue;
      const centre = m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (Math.hypot(centre.x, centre.y) < 0.01) continue;
      total++;
      if (n.x * centre.x + n.y * centre.y > 0) out++;
    }
    expect(out / total).toBeGreaterThan(0.95);
  });
});

describe('coastal fishes: behaviour', () => {
  const run = (id: string, intents: [string, number, string?][], canBurrow = true) => {
    const spec = FISH_SPECS[id];
    const rng = new Rng(7);
    const a = new FishAgent(spec, spec.modelTL, () => rng.next());
    const E = env(canBurrow);
    a.pos.set(0, -0.6, 0);
    const seen = new Set<string>();
    a.onEvent = (e) => seen.add(e);
    let minClear = Infinity;
    for (const [kind, secs, param] of intents) {
      a.request(kind, secs, kind === 'wander' ? new Vector3(a.pos.x + 1, 0, a.pos.z + 1) : null, param, kind === 'flee' ? new Vector3(a.pos.x - 0.3, a.pos.y, a.pos.z) : null);
      for (let t = 0; t < secs; t += 1 / 30) {
        a.update(1 / 30, E);
        expect(Number.isFinite(a.pos.x + a.pos.y + a.pos.z + a.heading + a.pose.amp + a.pose.curv)).toBe(true);
        if (a.state !== 'LEAP') minClear = Math.min(minClear, a.pos.y - E.floor.heightAt(a.pos.x, a.pos.z));
        expect(a.pos.y).toBeLessThanOrEqual(a.state === 'LEAP' ? 2 : 0.001);
      }
    }
    return { a, seen, minClear };
  };

  for (const id of Object.keys(FISH_SPECS)) {
    it(`${id}: IDLE / SWIM / TURN / FORAGE / ESCAPE run without leaving the water`, () => {
      const { seen, minClear } = run(id, [['rest', 3], ['wander', 6], ['forage', 8], ['flee', 3], ['wander', 4]]);
      expect(seen.has('escape')).toBe(true);
      expect(seen.has('forage') || seen.has('strike')).toBe(true);
      expect(minClear).toBeGreaterThan(-0.05 * FISH_SPECS[id].modelTL);
    });
  }

  it('a flatfish and a flathead bury themselves (where there is sand) and lie still', () => {
    for (const id of ['hirame', 'magochi']) {
      const { a, seen } = run(id, [['burrow', 4]]);
      expect(seen.has('buried')).toBe(true);
      expect(a.buried).toBeGreaterThan(0.5);
      expect(a.speed).toBeLessThan(0.01);
      const bare = run(id, [['burrow', 4]], false);
      expect(bare.a.buried).toBe(0);
    }
  });

  it('a school stays together and turns as one (コノシロ)', () => {
    const spec = FISH_SPECS.konoshiro, E = env();
    const school = schoolFor('test-school');
    const rng = new Rng(3);
    const fish = Array.from({ length: 12 }, (_, i) => {
      const a = new FishAgent(spec, 0.15, () => rng.next());
      a.pos.set((i % 4) * 0.08, -0.6, Math.floor(i / 4) * 0.08);
      school.add(a);
      return a;
    });
    school.request('SWIM', 30, null, true);
    const flashes: string[] = [];
    fish[0].onEvent = (e) => { if (e === 'flash') flashes.push(e); };
    for (const f of fish) f.onEvent = (e) => { if (e === 'flash') flashes.push(e); };
    for (let t = 0; t < 30; t += 1 / 30) for (const f of fish) f.update(1 / 30, E);
    const c = new Vector3();
    school.centre(c);
    const spread = Math.max(...fish.map((f) => Math.hypot(f.pos.x - c.x, f.pos.z - c.z)));
    expect(spread).toBeLessThan(1.2);
    // polarised: the headings agree
    const hx = fish.reduce((s, f) => s + Math.sin(f.heading), 0) / fish.length, hz = fish.reduce((s, f) => s + Math.cos(f.heading), 0) / fish.length;
    expect(Math.hypot(hx, hz)).toBeGreaterThan(0.6);
    expect(flashes.length).toBeGreaterThan(0);
  });

  it('at an easy pace a sea bass beats its tail and glides; a routine turn bends it gently, an escape into a C', () => {
    const spec = FISH_SPECS.suzuki, rng = new Rng(5), E = env();
    const a = new FishAgent(spec, spec.modelTL, () => rng.next());
    a.pos.set(0, -0.6, 0);
    let lo = Infinity, hi = 0, bend = 0;
    for (let k = 0; k < 4; k++) {
      a.request('wander', 6, new Vector3(a.pos.x + (k % 2 ? -1 : 1), 0, a.pos.z + 1), undefined, null);
      for (let t = 0; t < 6; t += 1 / 30) {
        a.update(1 / 30, E);
        if (a.state === 'SWIM' && t > 1) { lo = Math.min(lo, a.pose.amp); hi = Math.max(hi, a.pose.amp); }
        bend = Math.max(bend, Math.abs(a.pose.curv));
      }
    }
    expect(hi).toBeGreaterThan(0.05);
    expect(lo).toBeLessThan(0.02);
    expect(bend).toBeLessThanOrEqual(1.1);
    a.request('flee', 1, null, undefined, new Vector3(a.pos.x - 0.3, a.pos.y, a.pos.z));
    let c = 0;
    for (let t = 0; t < 0.5; t += 1 / 60) { a.update(1 / 60, E); c = Math.max(c, Math.abs(a.pose.curv)); }
    expect(c).toBeGreaterThan(2);
  });

  it('a sea bass stalks and strikes at a small fish nearby', () => {
    const E = env();
    const rng = new Rng(11);
    const bass = new FishAgent(FISH_SPECS.suzuki, 0.35, () => rng.next());
    const prey = new FishAgent(FISH_SPECS.sappa, 0.08, () => rng.next());
    bass.join('scene'); prey.join('scene');
    bass.pos.set(0, -0.6, 0); prey.pos.set(0, -0.55, 0.8);
    const seen = new Set<string>();
    bass.onEvent = (e) => seen.add(e);
    bass.request('forage', 20, null);
    for (let t = 0; t < 20 && !seen.has('strike'); t += 1 / 30) { bass.update(1 / 30, E); prey.update(1 / 30, E); }
    expect(seen.has('strike')).toBe(true);
    bass.leaveScene(); prey.leaveScene();
  });
});

describe('coastal fishes: the specimens\' photographs', () => {
  const SIZE = { body: [1024, 512], fins: [256, 384], eye: [128, 128] } as const;
  const jpegSize = (file: string): [number, number] => {
    // (the frame header's height and width)
    const b = readFileSync(file) as unknown as Uint8Array, u16 = (i: number) => (b[i] << 8) | b[i + 1];
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = u16(i + 2);
      if (m >= 0xc0 && m <= 0xc3) return [u16(i + 7), u16(i + 5)];
      i += 2 + len;
    }
    return [0, 0];
  };
  for (const id of ['suzuki', 'mejina', 'kisu', 'hirame', 'bora', 'sappa', 'konoshiro', 'ishimochi']) {
    it(`${id}: body, fins and eye in their textures' sizes`, () => {
      for (const part of ['body', 'fins', 'eye'] as const) expect(jpegSize(`src/assets/fish/${id}.${part}.jpg`)).toEqual(SIZE[part]);
    });
  }

  it('the photograph colours the near tiers; the far tier and a flatfish\'s blind side keep the painted skin', () => {
    const grey = (w: number, h: number, v: number) => ({ data: new Uint8Array(w * h * 4).fill(v), width: w, height: h });
    const spec = FISH_SPECS.hirame;
    const p = paintSkins(spec, { body: grey(1024, 512, 90), fins: grey(256, 384, 90), eye: grey(128, 128, 90) });
    expect(p.far).not.toBeNull();
    expect(p.albedo.length).toBe(1024 * 512 * 4);
    expect(p.far!.albedo.length).toBe(128 * 64 * 4);
    // a texel mid-flank on the eyed (left) side and its mirror on the blind side
    const at = (j: number) => p.albedo[(j * 1024 + 600) * 4];
    expect(Math.abs(at(128) - 90)).toBeLessThan(12);
    expect(Math.abs(at(384) - 90)).toBeGreaterThan(40);
  }, 60000);

  it('the high-pass of a flat photograph is flat, and bounded', () => {
    const w = 64, h = 32, rgb = new Uint8Array(w * h * 4).fill(120);
    expect(Math.max(...highPass(rgb, w, h, 3).map(Math.abs))).toBe(0);
    for (let o = 0; o < w * h; o++) rgb[o * 4] = rgb[o * 4 + 1] = rgb[o * 4 + 2] = (o * 37) % 255;
    const hp = highPass(rgb, w, h, 3);
    expect(Math.max(...hp)).toBeLessThanOrEqual(1);
    expect(Math.min(...hp)).toBeGreaterThanOrEqual(-1);
  });
});

describe('coastal fishes: on the 東なぎさ flat (Tokyo Bay)', () => {
  // the flat's real terrain and habitat, as the game builds them (no eelgrass on this map)
  const pub = (rel: string) => `public/data/${rel}`;
  const map = MapSchema.parse(JSON.parse(readFileSync(pub('maps/kasai_west.json'), 'utf8')));
  const h = PNG.sync.read(readFileSync(pub(`maps/${map.height.file}`))), s = PNG.sync.read(readFileSync(pub(`maps/${map.substrate.file}`)));
  const heights = new Float32Array(h.width * h.height), substrate = new Uint8Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = map.height.min_tp_m + (((h.data[i * 4] << 8) | h.data[i * 4 + 1]) / 65535) * (map.height.max_tp_m - map.height.min_tp_m);
    substrate[i] = s.data[i * 4];
  }
  const hab = new Habitat(new Terrain({ n: h.width, size: map.size_m, heights, substrate }, map.substrate.palette), map.habitat?.coarse_m ?? 5);
  const spawner = new Spawner(hab, [], new Set());
  const NINE = ['lateolabrax_japonicus', 'girella_punctata', 'sillago_japonica', 'platycephalus_sp2', 'paralichthys_olivaceus', 'mugil_cephalus', 'sardinella_zunasi', 'konosirus_punctatus', 'pennahia_argentata'];
  it('every one of the nine has a rule that finds water on the flat in an autumn day\'s tides (a rule no cell can meet is a fish never seen)', () => {
    let now = 1e9;
    for (const id of NINE) {
      const sp = SpeciesSchema.parse(JSON.parse(readFileSync(pub(`species/${id}.json`), 'utf8')));
      // (the ボラ of the coastal fishes: the adult, not the ハク)
      const rules = sp.spawn.filter((r) => (!r.maps || r.maps.includes('kasai_west')) && (id !== 'mugil_cephalus' || (r.length_mm?.[0] ?? 0) >= 200));
      let cells = 0;
      for (const level of [-0.8, -0.3, 0.2, 0.6, 1.0]) {
        hab.update((now += 4000), level);
        for (const tod of ['day', 'night'] as const) {
          const env = { tod, season: 'autumn' as const, tidePhase: 'high' as const, mapId: 'kasai_west', gameMs: now, day: 1 };
          for (const r of rules) for (let k = 0; k < hab.cn * hab.cn; k++) if (spawner.ruleMatches(r, k, env)) cells++;
        }
      }
      expect(cells, id).toBeGreaterThan(5);
    }
  }, 60000);
});
