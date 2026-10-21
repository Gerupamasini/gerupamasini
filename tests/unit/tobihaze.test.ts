import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { Vector3 } from 'three';
import { BehaviorTreeSchema, MapSchema, SpeciesSchema, isAquatic, type BTNode, type SpawnRule, type TidePhase } from '../../src/data/schemas';
import { checkSpecies, measure, modelUses, sizeClass } from '../../tools/models/budget.mjs';
import { DRIVERS } from '../../src/creatures/drivers/index';
import { BehaviorTree, type PerceptionContext } from '../../src/creatures/brain/BehaviorTree';
import { generateIndividual } from '../../src/creatures/Individual';
import { Spawner } from '../../src/creatures/Spawner';
import { Terrain } from '../../src/world/Terrain';
import { Habitat, type HabitatSample } from '../../src/world/Habitat';
import { LeveeLine } from '../../src/world/LeveeLine';
import type { Season } from '../../src/core/Time';
import type { TimeOfDay } from '../../src/world/Sun';

// トビハゼ (Periophthalmus modestus): its data, its behaviour tree and its model files, as the runtime contract of round R1
// fixes them (docs/models/tobihaze/README.md). The species lives on the upper mud of 葛西 (kasai_west) only, out of the
// water (`aquatic: false`), in the three GLB tiers under the class-M budget (tools/models/budget.json); its driver
// (src/creatures/species/tobihaze/) emits exactly the encyclopedia's behaviour ids. The renderless state machine, the
// pose module and the no-slide gates have their own tests (tobihazeBehavior, tobihazePose).

const pub = (rel: string) => fileURLToPath(new URL(`../../public/data/${rel}`, import.meta.url));
const json = (rel: string) => JSON.parse(fs.readFileSync(pub(rel), 'utf8')) as unknown;
const sp = SpeciesSchema.parse(json('species/periophthalmus_modestus.json'));
const manifest = json('manifest.json') as { species: string[]; behaviors: string[] };
const tree = BehaviorTreeSchema.parse(json('behaviors/mudskipper_flat.json'));

/** the driver's event ids (runtime contract §2): the encyclopedia records exactly these */
const EVENTS = ['rest', 'crawl', 'hop', 'swim', 'shallow', 'forage', 'burrow', 'escape', 'water_entry', 'water_exit', 'display', 'blink'];
const TIERS = ['hero', 'lod1', 'lod2'] as const;
type Tier = (typeof TIERS)[number];

// ------------------------------------------------------------------------------------------------- the model files
interface Gltf {
  scenes: { nodes: number[] }[];
  nodes: { name?: string; mesh?: number; skin?: number; children?: number[]; extras?: Record<string, unknown> }[];
  meshes: { name: string; primitives: { material: number; indices?: number; attributes: Record<string, number>; targets?: unknown[] }[]; extras?: { targetNames?: string[] } }[];
  materials: Record<string, unknown>[];
  accessors: { count: number }[];
  skins: { joints: number[] }[];
  animations?: { name?: string }[];
  images?: unknown[];
}
const masterPath = (rel: string) => fileURLToPath(new URL(`../../src/assets/models/${rel}`, import.meta.url));
const packedPath = (rel: string) => fileURLToPath(new URL(`../../src/assets/models-packed/${rel}`, import.meta.url));
/** a master's JSON chunk only (the hero file is 20 MB) */
const master = (rel: string): Gltf => {
  const fd = fs.openSync(masterPath(rel), 'r');
  try {
    const head = new Uint8Array(20);
    fs.readSync(fd, head, 0, 20, 0);
    const bytes = new Uint8Array(new DataView(head.buffer).getUint32(12, true));
    fs.readSync(fd, bytes, 0, bytes.length, 20);
    return JSON.parse(new TextDecoder().decode(bytes)) as Gltf;
  } finally {
    fs.closeSync(fd);
  }
};
const files = { hero: sp.model.hero!, lod1: sp.model.lod1!, lod2: sp.model.lod2! };
const glb = Object.fromEntries(TIERS.map((t) => [t, master(files[t])])) as Record<Tier, Gltf>;
interface Extras { tier: string; tlMM: number; joints: string[]; footprint: { width: number; height: number; core: number; ahead: number }; contacts: Record<string, { bone: string }[]>; states: Record<string, { pose: Record<string, unknown> }>; crawl: { frames: { pose: Record<string, unknown> }[] }; prop: { frames: { pose: Record<string, unknown> }[] } }
const root = (j: Gltf) => j.nodes[j.scenes[0].nodes[0]];
const extras = (j: Gltf) => (root(j).extras as { tobihaze: Extras }).tobihaze;
const skin = (j: Gltf) => j.skins[0].joints.map((k) => j.nodes[k].name!);
const tris = (j: Gltf) => j.meshes.reduce((a, m) => a + m.primitives.reduce((b, p) => b + Math.floor(j.accessors[p.indices ?? p.attributes.POSITION].count / 3), 0), 0);
const roleOf = (m: Record<string, unknown>) => ((m.extras as { tobihaze?: { role?: string; pass?: string } } | undefined)?.tobihaze ?? {});
/** what decides a material's shader program: blending, alpha test, sidedness, which maps it samples, its extensions */
function features(m: Record<string, unknown>) {
  const pbr = (m.pbrMetallicRoughness ?? {}) as Record<string, unknown>;
  const ext = (m.extensions ?? {}) as Record<string, Record<string, unknown>>;
  const maps = [...Object.keys(pbr), ...Object.keys(m), ...Object.entries(ext).flatMap(([e, v]) => Object.keys(v).map((k) => `${e}.${k}`))].filter((k) => k.endsWith('Texture')).sort();
  return { alphaMode: (m.alphaMode as string | undefined) ?? 'OPAQUE', alphaCutoff: m.alphaMode === 'MASK' ? ((m.alphaCutoff as number | undefined) ?? 0.5) : null, doubleSided: !!m.doubleSided, maps, extensions: Object.keys(ext).sort() };
}

/** the joints the driver and the pose module address, per tier (lod2 keeps 12, lod1 26 of the hero's 33) */
const JOINTS: Record<Tier, string[]> = {
  lod2: ['J_root', 'J_head', 'J_pecL', 'J_pecR', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'],
  lod1: [],
  hero: [],
};
JOINTS.lod1 = [...JOINTS.lod2, 'J_jaw', 'J_hyoid', 'J_suspL', 'J_suspR', 'J_opercL', 'J_opercR', 'J_eyeL', 'J_eyeR', 'J_pecFinL', 'J_pecFinR', 'J_pecMidL', 'J_pecMidR', 'J_pelvic', 'J_caudal2'];
JOINTS.hero = [...JOINTS.lod1, 'J_premax', 'J_maxL', 'J_maxR', 'J_imj', 'J_pecTipL', 'J_pecTipR', 'J_caudal3'];
/** the blend shapes the driver sets by name (blink by the eye drop, the turret up, cheeks, throat, mouth) */
const HEAD_MORPHS: Record<Tier, string[]> = {
  hero: ['blinkL', 'blinkR', 'eyesUpL', 'eyesUpR', 'inflate', 'inflateMid', 'throat', 'gape', 'gum'],
  lod1: ['blinkL', 'blinkR', 'eyesUpL', 'eyesUpR', 'inflate', 'inflateMid', 'throat'],
  lod2: ['alert'],
};
const FIN_MORPHS = ['fold_Fin_Dorsal1', 'spread_Fin_Dorsal1', 'fold_Fin_Dorsal2', 'fold_Fin_Anal', 'fold_Fin_Caudal', 'spread_Fin_Caudal', 'flex_Fin_Caudal',
  ...['L', 'R'].flatMap((s) => ['fold', 'spread', 'furl', 'plant'].map((t) => `${t}_Fin_Pectoral_${s}`))];

// --------------------------------------------------------------------------------------------------------- the data
describe('トビハゼ: the species data', () => {
  it('is listed after マハゼ with its own tree, a GLB form in three tiers and the トビハゼ driver', () => {
    expect(manifest.species[0]).toBe('acanthogobius_flavimanus');
    expect(manifest.species).toContain('periophthalmus_modestus');
    expect(manifest.behaviors).toContain('mudskipper_flat');
    expect(sp.brain.tree).toBe('mudskipper_flat');
    expect(sp.model.driver).toBe('tobihaze');
    expect(files).toEqual({ hero: 'tobihaze/tobihaze.hero.glb', lod1: 'tobihaze/tobihaze.lod1.glb', lod2: 'tobihaze/tobihaze.lod2.glb' });
    for (const t of TIERS) expect(fs.existsSync(masterPath(files[t])), files[t]).toBe(true);
    // the model's own total length at scale 1 (the drivers scale the root by length / modelLength_mm)
    for (const t of TIERS) expect(extras(glb[t]).tlMM, t).toBe(sp.model.modelLength_mm);
    expect(sp.model.modelLength_mm).toBe(80);
    const tools = new Set((json('items/tools.json') as { tools: { id: string; type: string }[] }).tools.filter((x) => x.type === 'capture').map((x) => x.id));
    // the hand nets only: a walker is not dug up (App.dig takes burrowers), and it is caught out on the mud
    for (const id of sp.capture.tools) expect(tools.has(id), id).toBe(true);
  });

  it('walks on the mud and is never kept in the water', () => {
    expect(sp.locomotion).toBe('walk');
    expect(sp.aquatic).toBe(false);
    expect(isAquatic(sp)).toBe(false);
  });

  it('is a class-M fish of up to 10 cm, about 5 g at 8 cm (W = 0.0091 TL³·⁰³¹, Baeck & Park 2015)', () => {
    expect(sp.size.length_mm.max).toBe(100);
    expect(sizeClass(sp.size.length_mm.max)).toBe('M');
    const w = (mm: number) => sp.size.weightCoef.a * mm ** sp.size.weightCoef.b;
    expect(Math.abs(w(80) / (0.0091 * 8 ** 3.031) - 1)).toBeLessThan(0.02);
    expect(w(80)).toBeCloseTo(5.0, 0);
    // the juveniles (≤ 40 mm) are the tide-pool rule's, and every one it draws is one
    const pool = sp.spawn.find((r) => r.tags.includes('small_pool'))!;
    expect(pool.length_mm).toEqual([20, 40]);
    for (let seed = 1; seed <= 50; seed++) expect(generateIndividual(sp, seed, 0, 0, 0, 0, 0, pool.length_mm).stage).toBe('juvenile');
  });

  it('lives on 葛西 only, out of the water from spring to autumn, by day (dormant in its burrow at night and in winter)', () => {
    for (const [i, r] of sp.spawn.entries()) {
      expect(r.maps, `rule ${i}`).toEqual(['kasai_west']);
      expect(r.season, `rule ${i}`).toBeDefined();
      expect(r.season!, `rule ${i}`).not.toContain('winter');
      expect(r.time, `rule ${i}`).toBeDefined();
      expect(r.time!, `rule ${i}`).not.toContain('night');
      // never in water deeper than its eyes (the brain moves it up the shore when the tide comes)
      expect(r.depth_m![1], `rule ${i}`).toBeLessThanOrEqual(0.15);
      // (the spawner caps the whole species at a rule's maxPopulation)
      expect(r.maxPopulation, `rule ${i}`).toBeLessThanOrEqual(20);
    }
    // the cooler seasons only by day (no temperature in the game: the season and the hour stand in for 15–18 °C)
    for (const r of sp.spawn) if (r.season!.some((s) => s === 'spring' || s === 'autumn')) expect(r.time).toEqual(['day']);
  });

  it('records exactly the driver\'s behaviour ids, and only clips the species names', () => {
    const ids = sp.encyclopedia.behaviors.map((b) => b.id);
    expect([...ids].sort()).toEqual([...EVENTS].sort());
    expect(new Set(ids).size).toBe(ids.length);
    const clips = new Set([sp.model.clips.idle, sp.model.clips.move, ...sp.model.clips.special]);
    for (const b of sp.encyclopedia.behaviors) if (b.clip) expect(clips.has(b.clip), b.id).toBe(true);
    for (const b of sp.encyclopedia.behaviors) expect(b.ja.length, b.id).toBeGreaterThan(0);
  });

  it('the driver\'s sources emit every recorded id (checked once they exist)', () => {
    // (the behaviour and pose keys' files: every id is an event they emit, so it has to appear as a string there)
    const dir = (f: string) => fileURLToPath(new URL(`../../src/creatures/species/tobihaze/${f}`, import.meta.url));
    const srcs = ['behavior.ts', 'TobihazeDriver.ts'].filter((f) => fs.existsSync(dir(f))).map((f) => fs.readFileSync(dir(f), 'utf8'));
    if (!srcs.length) return;
    const text = srcs.join('\n');
    for (const id of EVENTS) expect(new RegExp(`['"\`]${id}['"\`]`).test(text), `event '${id}' in the driver's sources`).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------- the driver
describe('トビハゼ: the driver entry', () => {
  const entry = DRIVERS[sp.model.driver ?? ''];
  // (src/creatures/drivers/index.ts is the pose key's: until its entry lands the field, the tank and the case skip the species)
  it.skipIf(!entry)(`has a DRIVERS entry whose contact body is the model's footprint${entry ? '' : ' (skipped: the tobihaze entry is not registered yet)'}`, () => {
    const d = entry!.create();
    for (const k of ['attach', 'detach', 'setIntent', 'update', 'onEvent', 'anchor', 'dispose'] as const) expect(typeof d[k], k).toBe('function');
    // the body the animals push each other with (physics/contacts.ts): the GLB's measured footprint, in shares of TL
    const f = extras(glb.hero).footprint;
    expect(entry!.body).toBeDefined();
    expect(Math.abs(entry!.body!.width - f.width)).toBeLessThan(0.03);
    expect(Math.abs(entry!.body!.height - f.height)).toBeLessThan(0.03);
    d.dispose();
  });
});

// ------------------------------------------------------------------------------------------------- the brain
// The tree uses only the engine's own conditions and actions (BehaviorTree.ts); the driver turns each intent into one of
// the 11 states by where the fish is (depth = waterAt − heightAt):
//   flee → ESCAPE (hops to water or a burrow; WATER_ENTRY when it reaches water) · burrow → BURROW (night, the flood, a
//   short retreat) · moveTo from the water (move_to_waterline) → SWIM / SHALLOW_WATER, then WATER_EXIT · moveTo from the
//   mud (move_to_deeper) → WATER_ENTRY, SHALLOW_WATER · rest → LAND_REST, IDLE on land / SHALLOW_WATER, IDLE in water ·
//   wander → LAND_CRAWL (short) or LAND_HOP (long) · forage → FORAGE · display 'alert' → IDLE propped, head up, eyes
//   locked · display 'inflate' → the cheek and fin display.
describe('トビハゼ: the behaviour tree', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../../src/creatures/brain/BehaviorTree.ts', import.meta.url)), 'utf8');
  const between = (a: string, b: string) => src.slice(src.indexOf(a), src.indexOf(b));
  const cases = (s: string) => new Set([...s.matchAll(/case '([a-z_]+)'/g)].map((m) => m[1]));
  const conditions = cases(between('private condition(', 'private action(')), actions = cases(between('private action(', 'private pickTarget('));
  const nodes: BTNode[] = [];
  const walk = (n: BTNode) => { nodes.push(n); if ('children' in n) n.children.forEach(walk); if ('child' in n) walk(n.child); };
  walk(tree.root);

  it('uses only the engine\'s conditions and actions, and every $param is the species\'', () => {
    expect(conditions.size).toBeGreaterThan(8);
    expect(actions.size).toBeGreaterThan(8);
    for (const n of nodes) {
      if (n.type === 'condition') expect(conditions.has(n.name) && n.name !== 'neighbor_within', n.name).toBe(true);
      if (n.type === 'action') expect(actions.has(n.name) && n.name !== 'move_to', n.name).toBe(true);
      if (n.type === 'condition' || n.type === 'action') for (const v of Object.values(n.args)) if (typeof v === 'string' && v.startsWith('$')) expect(sp.brain.params[v.slice(1)], v).toBeDefined();
    }
    // the escape is the one interrupt
    expect(nodes.filter((n) => n.type === 'action' && n.interrupt).map((n) => (n as { name: string }).name)).toEqual(['flee']);
  });

  // a 1:50 shore: dry mud up the +x side, the water's edge at x = 0 (the brain samples it through the habitat)
  const slope = 0.02;
  const at = (x: number, level = 0): HabitatSample => {
    const ground = slope * x, depth = level - ground, exposed = depth <= 0;
    const dist = exposed ? Math.ceil(-depth / slope / 5) * 5 : 0;
    return { depth, substrate: 'mud', exposed, wetness: exposed ? 0.6 : 1, distToWater: dist, inPool: false, tags: exposed ? (dist <= 5 ? ['exposed_mud', 'waterline'] : ['exposed_mud']) : ['shallow'], waterLevel: level, groundHeight: ground };
  };
  const bt = new BehaviorTree(tree, sp);
  /** the intents of `n` fresh decisions by one fish standing at x (the brain idle each time) */
  function decide(x: number, o: { n?: number; length?: number; tod?: TimeOfDay; tide?: TidePhase; player?: number; alert?: number; seed?: number } = {}) {
    const ind = generateIndividual(sp, o.seed ?? 7, x, 0, 0, 0, 0, [o.length ?? 70, o.length ?? 70]);
    const habitat = { sample: (px: number) => at(px) } as unknown as Habitat;
    const out = [];
    for (let i = 0; i < (o.n ?? 400); i++) {
      ind.alert = o.alert ?? 0;
      ind.brain.done = true;
      const player = new Vector3(x + (o.player ?? 30), 0, 0);
      const ctx: PerceptionContext = { ind, sample: at(x), habitat, tidePhase: o.tide ?? 'falling', tod: o.tod ?? 'day', season: 'summer', playerPos: player, playerDist: o.player ?? 30, playerRunning: false, nowSec: 1000 + i * 30, aquatic: false };
      const it = bt.tick(ctx);
      if (it) out.push(it);
    }
    return out;
  }
  const kinds = (xs: { kind: string; param?: string }[]) => xs.reduce<Record<string, number>>((a, i) => { const k = i.param ? `${i.kind}:${i.param}` : i.kind; a[k] = (a[k] ?? 0) + 1; return a; }, {});

  it('on the mud by day: rests, crawls, hops, forages, goes down to the water, displays, ducks into a burrow', () => {
    const xs = decide(3);
    const k = kinds(xs);
    for (const key of ['rest', 'wander', 'forage', 'moveTo', 'display:inflate', 'burrow']) expect(k[key] ?? 0, key).toBeGreaterThan(0);
    // rest the most, then the short moves; the water trips and displays are occasional (cooldowns)
    expect(k.rest).toBeGreaterThan(k.forage);
    const moves = xs.filter((i) => i.kind === 'wander').map((i) => i.target!.distanceTo(new Vector3(3, 0, 0)));
    expect(moves.some((d) => d <= 0.3), 'crawls').toBe(true);
    expect(moves.some((d) => d >= 0.6), 'hops').toBe(true);
    // the trip to the water ends in it (WATER_ENTRY), the wanders on the mud
    for (const i of xs.filter((i) => i.kind === 'moveTo')) expect(at(i.target!.x).depth).toBeGreaterThanOrEqual(0.02);
    for (const i of xs.filter((i) => i.kind === 'wander')) expect(at(i.target!.x).exposed).toBe(true);
  });

  it('in the shallow film rests with its eyes out, forages or climbs out; flooded deeper, an adult heads for the edge', () => {
    const film = kinds(decide(-0.5));
    for (const key of ['rest', 'forage', 'moveTo']) expect(film[key] ?? 0, key).toBeGreaterThan(0);
    const deep = decide(-3);
    expect(deep.length).toBe(400);
    for (const i of deep) {
      expect(i.kind).toBe('moveTo');
      expect(at(i.target!.x).exposed).toBe(true);
    }
    // a juvenile mostly stays in its pool (Tama River: the young keep to the tide pools), an adult in the film climbs out
    const young = decide(-3, { length: 30 }), share = (xs: { kind: string }[], k: string) => xs.filter((i) => i.kind === k).length / xs.length;
    expect(share(young, 'rest') + share(young, 'forage')).toBeGreaterThan(0.8);
    expect(share(young, 'moveTo')).toBeLessThan(0.2);
    expect(share(decide(-0.5), 'moveTo')).toBeGreaterThan(0.25);
  });

  it('goes down its burrow at night (most of the time) and some before the rising tide reaches it', () => {
    const night = decide(3, { tod: 'night' });
    const share = night.filter((i) => i.kind === 'burrow').length / night.length;
    expect(share).toBeGreaterThan(0.75);
    expect(share).toBeLessThan(0.95);
    const flood = decide(-0.5, { tide: 'rising' });
    const f = flood.filter((i) => i.kind === 'burrow').length / flood.length;
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThan(0.35);
  });

  it('freezes alert when watched from close, and escapes (an interrupt) when the player comes within its flight distance', () => {
    const watched = kinds(decide(3, { alert: 0.8, player: 4 }));
    expect(watched['display:alert']).toBe(400);
    const ind = generateIndividual(sp, 9, 3, 0, 0, 0, 0, [70, 70]);
    ind.alert = 1;
    ind.brain.done = false;
    ind.brain.busyUntil = 1e9;
    ind.brain.lastIntentKind = 'rest';
    const ctx: PerceptionContext = { ind, sample: at(3), habitat: { sample: (px: number) => at(px) } as unknown as Habitat, tidePhase: 'falling', tod: 'day', season: 'summer', playerPos: new Vector3(4, 0, 0), playerDist: 1, playerRunning: false, nowSec: 1, aquatic: false };
    const it = bt.tick(ctx)!;
    expect(it.kind).toBe('flee');
    expect(it.param).toBe('escape');
    // away from the player by the flee run (the driver's own search for water or a burrow comes first)
    expect(it.target!.distanceTo(ind.pos)).toBeCloseTo(sp.brain.params.fleeRun_m as number, 5);
  });
});

// -------------------------------------------------------------------------------------------- where it spawns on 葛西
describe('トビハゼ: where it appears on 葛西', () => {
  const map = MapSchema.parse(json('maps/kasai_west.json'));
  const h = PNG.sync.read(fs.readFileSync(pub(`maps/${map.height.file}`))), s = PNG.sync.read(fs.readFileSync(pub(`maps/${map.substrate.file}`)));
  const heights = new Float32Array(h.width * h.height), substrate = new Uint8Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = map.height.min_tp_m + (((h.data[i * 4] << 8) | h.data[i * 4 + 1]) / 65535) * (map.height.max_tp_m - map.height.min_tp_m);
    substrate[i] = s.data[i * 4];
  }
  const terrain = new Terrain({ n: h.width, size: map.size_m, heights, substrate }, map.substrate.palette);
  const hab = new Habitat(terrain, map.habitat?.coarse_m ?? 5);
  const spawner = new Spawner(hab, [], new Set());
  const levee = new LeveeLine(map.levee!);
  const toLevee = (x: number, z: number) => { let d = Infinity; for (let s0 = 0; s0 <= levee.length; s0 += 2) { const p = levee.at(s0); d = Math.min(d, Math.hypot(p.x - x, p.z - z)); } return d; };
  let now = 1e9;
  /** the coarse cells each rule matches at a tide level, with their heights (T.P.) and substrates */
  function cells(level: number, tidePhase: TidePhase, tod: TimeOfDay = 'day', season: Season = 'summer') {
    hab.update((now += 4000), level);
    const env = { tod, season, tidePhase, mapId: 'kasai_west', gameMs: now, day: 1 };
    return sp.spawn.map((r: SpawnRule) => {
      const out: { k: number; h: number; sub: string }[] = [];
      for (let k = 0; k < hab.cn * hab.cn; k++) if (spawner.ruleMatches(r, k, env)) out.push({ k, h: hab.coarseHeight[k], sub: terrain.palette[hab.coarseSubstrate[k]] });
      return out;
    });
  }
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const centre = (k: number) => hab.coarseCenter(k % hab.cn, Math.floor(k / hab.cn));

  it('at a summer low water: on the exposed mud, the most on the upper flat (T.P. −0.1…+0.6: more than 3× the fish a cell of the lower shore)', () => {
    const by = cells(-1.0, 'low');
    const all = by.flat();
    expect(all.length).toBeGreaterThan(200);
    for (const c of all) expect(['mud', 'muddy_sand', 'channel', 'rock', 'gravel'], c.sub).toContain(c.sub);
    // the adults out on the mud, expected per cell (density × cell area) summed over their rules: the upper band
    // against the rest (Geum estuary: 2.6/m² on the high shore, 0.5 on the low; the young keep to the pools)
    const per = new Map<number, number>();
    by.forEach((cs, i) => { if (sp.spawn[i].tags.includes('exposed_mud')) for (const c of cs) per.set(c.k, (per.get(c.k) ?? 0) + sp.spawn[i].density_per_100m2 * 0.25); });
    const upper: number[] = [], lower: number[] = [];
    for (const [k, w] of per) (hab.coarseHeight[k] >= -0.1 ? upper : lower).push(w);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(upper.length).toBeGreaterThan(50);
    expect(mean(upper) / mean(lower)).toBeGreaterThan(3);
    // the dense rule's cells sit in the home band
    const dense = by[0].map((c) => c.h);
    expect(median(dense)).toBeGreaterThan(-0.1);
    expect(median(dense)).toBeLessThan(0.6);
  });

  it('as the tide comes in: along the edge of what is left of the upper mud, then on the stones at the levee', () => {
    const rising = cells(0.25, 'rising').flat();
    expect(rising.length).toBeGreaterThan(20);
    expect(median(rising.map((c) => c.h))).toBeGreaterThan(0.2);
    // a spring high water: only the riprap and the reed toe's sand at the waterline, by the levee
    const high = cells(0.7, 'high').flat();
    expect(high.length).toBeGreaterThan(10);
    for (const c of high) {
      expect(['rock', 'gravel', 'sand', 'muddy_sand', 'mud']).toContain(c.sub);
      const [x, z] = centre(c.k);
      expect(toLevee(x, z), `cell ${c.k}`).toBeLessThan(25);
    }
  });

  it('never at night or in winter, in spring and autumn only by day, and its young in the tide pools', () => {
    expect(cells(-1.0, 'low', 'night').flat()).toEqual([]);
    expect(cells(-1.0, 'low', 'day', 'winter').flat()).toEqual([]);
    expect(cells(-1.0, 'low', 'dusk', 'autumn').flat()).toEqual([]);
    expect(cells(-1.0, 'low', 'day', 'spring').flat().length).toBeGreaterThan(100);
    const pools = cells(-1.0, 'low', 'day', 'autumn')[sp.spawn.findIndex((r) => r.tags.includes('small_pool'))];
    expect(pools.length).toBeGreaterThan(10);
  });
});

// ------------------------------------------------------------------------------------------------ the model files
describe('トビハゼ: the model files', () => {
  it('carry the joints the driver poses in every tier, each tier\'s a subset of the one above', () => {
    for (const t of TIERS) {
      const names = skin(glb[t]);
      expect(extras(glb[t]).tier).toBe(t);
      expect(extras(glb[t]).joints, t).toEqual(names);
      expect([...names].sort(), t).toEqual([...JOINTS[t]].sort());
      // (a joint and a mesh never share a name: three makes the names unique per file)
      const all = glb[t].nodes.map((n) => n.name);
      expect(new Set(all).size, t).toBe(all.length);
    }
    for (const j of skin(glb.lod2)) expect(skin(glb.lod1)).toContain(j);
    for (const j of skin(glb.lod1)) expect(skin(glb.hero)).toContain(j);
  });

  it('weld their ground contacts and pose their states on that tier\'s own joints', () => {
    for (const t of TIERS) {
      const names = new Set(skin(glb[t])), x = extras(glb[t]);
      for (const state of ['land', 'reach', 'rest', 'water', 'swim']) {
        expect(x.contacts[state]?.length, `${t} ${state}`).toBeGreaterThan(0);
        for (const c of x.contacts[state]) expect(names.has(c.bone), `${t} ${state} ${c.bone}`).toBe(true);
        for (const j of Object.keys(x.states[state].pose).filter((k) => k.startsWith('J_'))) expect(names.has(j), `${t} ${state} ${j}`).toBe(true);
      }
      for (const f of [...x.crawl.frames, ...x.prop.frames]) for (const j of Object.keys(f.pose).filter((k) => k.startsWith('J_'))) expect(names.has(j), `${t} ${j}`).toBe(true);
      expect(x.crawl.frames.length, t).toBeGreaterThan(8);
    }
  });

  it('hang each turret eye on its own joint (hero, lod1) and name every blend shape the driver sets', () => {
    for (const t of ['hero', 'lod1'] as const) {
      const j = glb[t];
      for (const s of ['L', 'R']) {
        const joint = j.nodes.find((n) => n.name === `J_eye${s}`)!;
        expect((joint.children ?? []).map((k) => j.nodes[k].name), t).toContain(`Eye_${s}`);
      }
    }
    for (const t of TIERS) {
      const names = new Set<string>();
      for (const m of glb[t].meshes) {
        const n = m.primitives[0].targets?.length ?? 0;
        // three names the morph targets from the mesh's extras only (GLTFLoader), one name per target
        if (n) expect(m.extras?.targetNames?.length, `${t} ${m.name}`).toBe(n);
        for (const p of m.primitives) expect(p.targets?.length ?? 0, `${t} ${m.name}`).toBe(n);
        for (const name of m.extras?.targetNames ?? []) names.add(name);
      }
      for (const name of [...HEAD_MORPHS[t], ...FIN_MORPHS]) expect(names.has(name), `${t} ${name}`).toBe(true);
    }
  });

  it('keep the same material features on the hero and lod1 (one program each), lod2 only alpha-tested', () => {
    const lod1 = glb.lod1.materials, hero = glb.hero.materials;
    for (const m of lod1) {
      const h = hero.find((x) => x.name === m.name);
      expect(h, String(m.name)).toBeDefined();
      expect(features(m), String(m.name)).toEqual(features(h!));
      expect(roleOf(m).role).toBe(roleOf(h!).role);
    }
    // the hero's own extra: its fins' opaque parts (the sheath, the fleshy roots) drawn with depth, on the fin atlas
    const fin = features(hero.find((x) => roleOf(x).role === 'fin' && !roleOf(x).pass)!);
    for (const h of hero.filter((x) => !lod1.some((m) => m.name === x.name))) {
      expect(roleOf(h)).toMatchObject({ role: 'fin', pass: 'opaque' });
      expect(features(h).maps).toEqual(fin.maps);
      expect(features(h).alphaMode).toBe('OPAQUE');
    }
    expect(fin.alphaMode).toBe('BLEND');
    expect(new Set(lod1.map((m) => roleOf(m).role))).toEqual(new Set(['body', 'fin', 'eye']));
    // lod2: the same roles, the fins made opaque by their alpha test (the one change CLAUDE.md allows)
    for (const m of glb.lod2.materials) {
      expect(['body', 'fin'], String(m.name)).toContain(roleOf(m).role);
      if (roleOf(m).role === 'fin') expect(features(m).alphaMode).toBe('MASK');
    }
    // nothing for the マハゼ hero pipeline to pick up (its roles live under extras.mahaze)
    for (const t of TIERS) expect(JSON.stringify(glb[t]).includes('"mahaze"'), t).toBe(false);
  });

  it('are lighter at each tier in the masters (triangles, materials, joints, maps)', () => {
    const m = TIERS.map((t) => ({ t, tris: tris(glb[t]), materials: glb[t].materials.length, joints: skin(glb[t]).length }));
    expect(m[1].tris).toBeLessThan(m[0].tris);
    expect(m[2].tris).toBeLessThan(m[1].tris);
    expect(m[1].joints).toBeLessThan(m[0].joints);
    expect(m[2].joints).toBeLessThan(m[1].joints);
    expect(m[2].materials).toBeLessThan(m[1].materials);
    expect(glb.lod2.images!.length).toBeLessThanOrEqual(glb.lod1.images!.length);
  });

  it('name the clips the 図鑑 plays when they carry clips (baked by tools/models/tobihaze/clips.mjs)', () => {
    for (const t of ['hero', 'lod1'] as const) {
      const names = new Set((glb[t].animations ?? []).map((a) => a.name));
      if (!names.size) continue;
      for (const c of [sp.model.clips.idle, sp.model.clips.move, ...sp.model.clips.special]) expect(names.has(c), `${t} ${c}`).toBe(true);
    }
  });
});

// ------------------------------------------------------------------------------------------------------ the budget
interface Row { file: string; tier: string; cls: string; m: Record<string, number>; bad: string[] }
const rows = checkSpecies(sp) as Row[];
const packed = rows.length > 0;
describe(`トビハゼ: the packed files within the class-M budget${packed ? '' : ' (skipped: not packed yet — npm run models:pack -- tobihaze)'}`, { timeout: 60_000 }, () => {
  it.skipIf(!packed)('every file fits its tier', () => {
    const uses = modelUses(sp) as Map<string, Set<string>>;
    expect(rows.length).toBe([...uses.values()].reduce((a, t) => a + t.size, 0));
    for (const r of rows) {
      expect(r.cls).toBe('M');
      expect(r.bad, `${r.file} (${r.cls} ${r.tier}) over: ${r.bad.map((k) => `${k} ${r.m[k]}`).join(', ')}`).toEqual([]);
    }
  });

  it.skipIf(!packed)('each level is really lighter than the one above (triangles, map size, download, GPU)', () => {
    const t = Object.fromEntries(rows.map((r) => [r.tier, r])) as Record<Tier, Row>;
    for (const k of ['tris', 'mapPx', 'downloadMB', 'gpuMB']) {
      expect(t.lod1.m[k], `lod1 ${k}`).toBeLessThan(t.hero.m[k]);
      expect(t.lod2.m[k], `lod2 ${k}`).toBeLessThan(t.lod1.m[k]);
    }
  });

  it.skipIf(!packed)('keeps 葛西\'s far models (every lod2 that spawns there) within 8 MB to download and 16 MB on the GPU', () => {
    let mb = 0, gpu = 0;
    const seen = new Set<string>();
    for (const id of manifest.species) {
      const s = SpeciesSchema.parse(json(`species/${id}.json`));
      if (!s.spawn.some((r) => r.maps?.includes('kasai_west'))) continue;
      for (const [rel, tiers] of modelUses(s) as Map<string, Set<string>>) {
        if (!tiers.has('lod2') || seen.has(rel) || !fs.existsSync(packedPath(rel))) continue;
        seen.add(rel);
        const m = measure(packedPath(rel)) as Record<string, number>;
        mb += m.downloadMB; gpu += m.gpuMB;
      }
    }
    expect(seen.has(files.lod2)).toBe(true);
    expect(mb).toBeLessThanOrEqual(8);
    expect(gpu).toBeLessThanOrEqual(16);
  });
});
