import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Bone, Group, Mesh, Object3D, Quaternion, Vector3, Vector4 } from 'three';
import { Contacts, contactBody, type BodyBuild, type BodyMode, type ContactBody } from '../../src/creatures/physics/contacts';
import { bedPlane, bedTilt, fitBed } from '../../src/creatures/physics/bed';
import { WaterMotion, WaterRider, carryFor } from '../../src/creatures/physics/water';
import { AnimalContacts } from '../../src/creatures/physics/animals';
import type { Floor } from '../../src/creatures/drivers/Driver';
import { surfEta } from '../../src/world/surfCpu';
import { bindSurfZone, setSurfSea, surfUniforms } from '../../src/world/Surf';
import { SurfZone } from '../../src/world/SurfZone';
import { HASHIRIMIZU } from '../../src/world/maps/hashirimizu';
import { SpeciesSchema } from '../../src/data/schemas/species';
import { generateIndividual } from '../../src/creatures/Individual';
import { modelFor } from '../../src/creatures/models/choice';
import { MahazeDriver } from '../../src/creatures/species/mahaze/MahazeDriver';

const FISH: BodyBuild = { width: 0.16, height: 0.16 };
const flat = (level = 0.5): Floor => ({ heightAt: () => 0, waterAt: () => level });

/** a plane 1:20 beach (the sea to +x, the still waterline at x = 0 at a level of 0) under 走水's usual sea, its surf
 * zone made and bound to the uniforms the way World does */
function surfBeach() {
  const n = 97, size = 48, half = size / 2, cell = size / (n - 1), heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = -0.05 * (-half + i * cell);
  const s = HASHIRIMIZU.surf!, sea = { height: s.height, period: s.period, angle: s.angle ?? 0, spread: s.spread ?? 0.16 };
  const zone = new SurfZone({ n, size, heights }, s.seaward, sea);
  zone.update(0);
  const surf = surfUniforms(s);
  bindSurfZone(surf, zone);
  setSurfSea(surf, sea);
  const floor: Floor = { heightAt: (x, z) => zone.groundAt(x, z), waterAt: () => 0 };
  return { surf, floor };
}

function body(id: string, x: number, z: number, o: { build?: BodyBuild; len?: number; g?: number; heading?: number; y?: number; mode?: BodyMode; movable?: boolean } = {}): ContactBody {
  const b = contactBody(id, o.build ?? FISH, o.len ?? 0.05, o.g ?? 2);
  b.x = x; b.z = z; b.y = o.y ?? 0; b.heading = o.heading ?? 0; b.mode = o.mode ?? 'bed'; b.movable = o.movable ?? true;
  return b;
}

/** run the contacts for a while, each body taking its pushes (as a driver's nudge does) */
function settle(bodies: ContactBody[], floor: Floor, seconds = 1, bounds?: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
  const c = new Contacts();
  for (let t = 0; t < seconds; t += 1 / 60) {
    c.step(1 / 60, bodies, { floor, bounds });
    for (const b of bodies) { b.x += b.pushX; b.z += b.pushZ; }
  }
}

const gap = (a: ContactBody, b: ContactBody) => Math.hypot(a.x - b.x, a.z - b.z);

describe('contacts between the animals', () => {
  it('pushes two overlapping bodies apart until they no longer touch, the shortest way out', () => {
    // two 5 cm fish facing +x, one a little ahead of and beside the other: they part sideways
    const a = body('a', 0, 0, { heading: Math.PI / 2 }), b = body('b', 0.004, 0.002, { heading: Math.PI / 2 });
    settle([a, b], flat());
    expect(Math.abs(a.z - b.z)).toBeGreaterThan(a.shape.radius + b.shape.radius - 1e-4);
    expect(Math.abs(a.x - b.x - -0.004)).toBeLessThan(0.002);
    // nose to tail: they part along their line
    const c = body('c', 0, 0, { heading: Math.PI / 2 }), d = body('d', 0.045, 0, { heading: Math.PI / 2 });
    settle([c, d], flat());
    expect(gap(c, d)).toBeGreaterThan(2 * c.shape.half + c.shape.radius + d.shape.radius - 1e-4);
  });

  it('parts two lying side by side across their width, not along their length', () => {
    const a = body('a', 0, 0), b = body('b', 0.003, 0.001);
    settle([a, b], flat());
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(a.shape.radius + b.shape.radius - 1e-4);
    expect(Math.abs(a.z - b.z)).toBeLessThan(0.01);
  });

  it('lets the lighter one give way to the heavier', () => {
    const big = body('big', 0, 0, { g: 200, len: 0.2 }), small = body('small', 0.01, 0, { g: 1 });
    settle([big, small], flat());
    expect(Math.abs(big.x)).toBeLessThan(0.002);
    expect(small.x).toBeGreaterThan(big.shape.radius + small.shape.radius - 1e-4);
  });

  it('moves nothing fixed or without a driver that takes a push, and nothing down in the sand', () => {
    const oyster = body('oyster', 0, 0, { build: { ...FISH, fixed: true }, g: 50 });
    const crab = body('crab', 0.005, 0, { g: 5 });
    const rock = body('rock', 0.3, 0, { movable: false });
    const goby = body('goby', 0.302, 0);
    const clam = body('clam', 0.6, 0, { mode: 'away' });
    const shrimp = body('shrimp', 0.6, 0.001);
    settle([oyster, crab, rock, goby, clam, shrimp], flat());
    expect(oyster.x).toBe(0);
    expect(crab.x).toBeGreaterThan(oyster.shape.radius + crab.shape.radius - 1e-4);
    expect(rock.x).toBe(0.3);
    expect(goby.x - rock.x).toBeGreaterThan(rock.shape.radius + goby.shape.radius - 1e-4);
    // the shrimp walks over the buried clam
    expect(shrimp.x).toBe(0.6);
  });

  it('lets a fish swim over an animal on the bed', () => {
    const goby = body('goby', 0, 0), fry = body('fry', 0.002, 0, { y: 0.05, mode: 'water' });
    settle([goby, fry], flat());
    expect(goby.x).toBe(0);
    expect(fry.x).toBe(0.002);
  });

  it('leaves a school to its own spacing', () => {
    const school: BodyBuild = { ...FISH, flock: 'haku' };
    const a = body('a', 0, 0, { build: school }), b = body('b', 0.003, 0, { build: school });
    settle([a, b], flat());
    expect(a.x).toBe(0);
    expect(b.x).toBe(0.003);
  });

  it('makes way a little before they touch, then holds them apart', () => {
    const a = body('a', 0, 0), b = body('b', 0.0085, 0);
    // (8 mm wide fish: their sides 0.5 mm apart, inside the soft margin)
    const c = new Contacts();
    c.step(1 / 60, [a, b], { floor: flat() });
    expect(b.pushX).toBeGreaterThan(0);
    expect(c.touching).toBe(0);
  });

  it('never pushes an animal out of the water it needs', () => {
    // dry ground beyond x = 0.01
    const shore: Floor = { heightAt: (x) => (x > 0.01 ? 0.6 : 0), waterAt: () => 0.5 };
    const big = body('big', -0.006, 0, { g: 100, len: 0.1 }), small = body('small', 0.004, 0, { g: 1 });
    small.minDepth = 0.02;
    settle([big, small], shore);
    expect(shore.waterAt(small.x, small.z) - shore.heightAt(small.x, small.z)).toBeGreaterThan(0.02);
  });

  it('keeps a push inside the tank walls', () => {
    const a = body('a', 0, 0, { g: 50 }), b = body('b', 0.095, 0);
    settle([a, b], flat(), 1, { minX: -0.1, maxX: 0.1, minZ: -0.1, maxZ: 0.1 });
    expect(b.x).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('stays cheap for a crowded flat', () => {
    // 300 animals over a stretch of shore 30 m long, a dense clump of 60 among them
    const bodies: ContactBody[] = [];
    for (let i = 0; i < 240; i++) bodies.push(body(`b${i}`, ((i * 7919) % 3000) / 100, ((i * 104729) % 600) / 100, { heading: i }));
    for (let i = 0; i < 60; i++) bodies.push(body(`c${i}`, 10 + (i % 10) * 0.03, 3 + Math.floor(i / 10) * 0.03, { heading: i }));
    const c = new Contacts();
    for (let k = 0; k < 60; k++) { c.step(1 / 60, bodies, { floor: flat() }); for (const b of bodies) { b.x += b.pushX; b.z += b.pushZ; } }
    // the sweep measures only the near pairs: the clump's own and a few more, not all 45 000 (n² / 2)
    expect(c.measured).toBeLessThan(2500);
    expect(c.touching).toBe(0);
  });
});

describe('resting on the bed', () => {
  it('fits the plane of a slope under a body and turns it onto it', () => {
    const slope = { heightAt: (x: number) => 0.2 * x };
    const p = fitBed(slope, 0, 0, Math.PI / 2, 0.02, 0.005, bedPlane());
    expect(p.pitch).toBeCloseTo(Math.atan(0.2), 6);
    expect(p.roll).toBeCloseTo(0, 6);
    const up = new Vector3(0, 1, 0).applyQuaternion(bedTilt(p, 1, new Quaternion()));
    expect(up.x).toBeCloseTo(-0.2 / Math.hypot(0.2, 1), 6);
    expect(new Vector3(0, 1, 0).applyQuaternion(bedTilt(p, 0, new Quaternion())).y).toBe(1);
  });

  it('bridges a hollow narrower than the body, and rides over a hump under its middle', () => {
    const hollow = { heightAt: (x: number, z: number) => -0.01 * Math.max(0, 1 - Math.hypot(x, z) / 0.015) };
    const p = fitBed(hollow, 0, 0, 0, 0.02, 0.02, bedPlane());
    expect(p.ground).toBeCloseTo(-0.01, 6);
    expect(p.y).toBeCloseTo(0, 6);
    const hump = { heightAt: (x: number, z: number) => 0.01 * Math.max(0, 1 - Math.hypot(x, z) / 0.015) };
    expect(fitBed(hump, 0, 0, 0, 0.02, 0.02, bedPlane()).y).toBeCloseTo(0.01, 6);
  });
});

// ------------------------------------------------------------------ a goby on a slope (the real model's rig)

const species = SpeciesSchema.parse(JSON.parse(readFileSync(new URL('../../public/data/species/acanthogobius_flavimanus.json', import.meta.url).pathname, 'utf8')));

interface RigJson {
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: { name?: string; translation?: [number, number, number]; rotation?: [number, number, number, number]; scale?: [number, number, number]; children?: number[]; mesh?: number; extras?: Record<string, unknown> }[];
  meshes: { primitives: { material: number }[] }[];
  materials: { extras?: Record<string, unknown> }[];
  skins: { joints: number[] }[];
}

function modelRig(rel: string) {
  const buf = readFileSync(new URL(`../../src/assets/models/${rel}`, import.meta.url).pathname);
  const json: RigJson = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const joints = new Set(json.skins.flatMap((s) => s.joints)), root = new Group();
  const bones: Record<string, Object3D> = {}, meshes: Object3D[] = [];
  const nodes = json.nodes.map((n, i) => {
    const node = n.mesh !== undefined ? new Mesh() : joints.has(i) ? new Bone() : new Object3D();
    node.name = n.name ?? ''; node.userData = { ...n.extras };
    if (n.translation) node.position.fromArray(n.translation);
    if (n.rotation) node.quaternion.fromArray(n.rotation);
    if (n.scale) node.scale.fromArray(n.scale);
    if (node instanceof Bone) bones[node.name] = node;
    if (n.mesh !== undefined) {
      node.userData.mahaze = json.materials[json.meshes[n.mesh].primitives[0].material].extras?.mahaze;
      meshes.push(node);
    }
    return node;
  });
  json.nodes.forEach((n, i) => { for (const child of n.children ?? []) nodes[i].add(nodes[child]); });
  for (const i of json.scenes[json.scene ?? 0].nodes) root.add(nodes[i]);
  return { root, bones, meshes };
}

function goby(x: number, z: number, heading: number, seed = 1) {
  const ind = generateIndividual(species, seed, x, z, 0, 0, 0, [120, 120]);
  ind.heading = heading;
  const model = modelRig(modelFor(species, ind.stage).lod1!);
  const scene = new Group();
  scene.add(model.root);
  const driver = new MahazeDriver();
  driver.attach(model.root, ind, {}, model.bones, model.meshes);
  return { ...model, driver, ind };
}

describe('a goby lying on the bed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lies along a slope with its snout and its tail on the sand, not level with its middle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const slope: Floor = { heightAt: (x) => 0.25 * x, waterAt: () => 1 };
    // facing up the slope (+x)
    const g = goby(0.2, 0, Math.PI / 2);
    for (let i = 0; i < 120; i++) g.driver.update(1 / 60, { floor: slope, player: new Vector3(0, 1, 5), simScale: 1, nowMs: i * 16 });
    g.root.updateWorldMatrix(true, true);
    // the body's long axis follows the slope
    const fwd = new Vector3(0, 0, 1).applyQuaternion(g.root.quaternion);
    expect(Math.atan2(fwd.y, Math.hypot(fwd.x, fwd.z))).toBeGreaterThan(Math.atan(0.25) - 0.08);
    // and the snout and the tail are near the bed under them (a level fish would have its snout in the sand by
    // a centimetre and its tail a centimetre up)
    const box = { lo: Infinity, hi: -Infinity };
    for (const name of ['J_head', 'J_caudal2']) {
      const b = g.bones[name];
      if (!b) continue;
      const p = b.getWorldPosition(new Vector3());
      const above = p.y - slope.heightAt(p.x, p.z);
      box.lo = Math.min(box.lo, above); box.hi = Math.max(box.hi, above);
    }
    expect(box.hi - box.lo).toBeLessThan(0.006);
    g.driver.dispose();
  });

  it('two gobies set down on top of each other end up side by side, through their drivers', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const floor = flat(0.3);
    const a = goby(0, 0, 0, 1), b = goby(0.004, 0.002, 0, 2);
    const animals = [{ ind: a.ind, driver: a.driver }, { ind: b.ind, driver: b.driver }];
    const contacts = new AnimalContacts();
    for (let i = 0; i < 120; i++) {
      for (const g of [a, b]) g.driver.update(1 / 60, { floor, player: new Vector3(0, 1, 5), simScale: 1, nowMs: i * 16 });
      contacts.step(1 / 60, animals, { floor });
    }
    const w = (a.ind.length_mm / 1000) * 0.17;
    expect(Math.hypot(a.ind.pos.x - b.ind.pos.x, a.ind.pos.z - b.ind.pos.z)).toBeGreaterThan(w - 1e-3);
    // and the drawn fish moved with them
    expect(a.root.position.distanceTo(b.root.position)).toBeGreaterThan(w - 2e-3);
    a.driver.dispose(); b.driver.dispose();
  });
});

describe('the waves', () => {
  function ride(len: number, share: number, seconds = 24, level = 0.6): { range: number; mean: number; tilt: number } {
    const water = new WaterMotion({ windDir: 0.7, swell: 0.1 }), floor = flat(level), r = new WaterRider();
    const p = new Vector3(0, 0.3, 0);
    let lo = Infinity, hi = -Infinity, sum = 0, n = 0, tilt = 0;
    for (let t = 0; t < seconds; t += 1 / 60) {
      water.update(t, level, 1, 1 / 60);
      r.step(1 / 60, water, floor, p.x, p.y, p.z, 0.3, len, share);
      p.addScaledVector(r.vel, 1 / 60);
      if (t > 4) { lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); sum += p.x; n++; tilt = Math.max(tilt, Math.hypot(r.tiltX, r.tiltZ)); }
    }
    return { range: hi - lo, mean: sum / n, tilt };
  }

  it('carries a small fish to and fro, a few centimetres, and lets it keep its station', () => {
    const fry = ride(0.03, 1);
    expect(fry.range).toBeGreaterThan(0.01);
    expect(fry.range).toBeLessThan(0.15);
    expect(Math.abs(fry.mean)).toBeLessThan(0.03);
    // and rocks it with the surges, a little
    expect(fry.tilt).toBeGreaterThan(0.003);
    expect(fry.tilt).toBeLessThan(0.31);
  });

  it('hardly moves a large fish, and not at all one holding on to the bed', () => {
    const fry = ride(0.03, 1), big = ride(0.25, 1), holding = ride(0.03, 0);
    expect(big.range).toBeLessThan(fry.range * 0.15);
    expect(holding.range).toBe(0);
    expect(holding.tilt).toBe(0);
    expect(carryFor(0.03)).toBeGreaterThan(0.75);
    expect(carryFor(0.25)).toBeLessThan(0.07);
  });

  it('keeps still in a pool the ebb has left above the tide', () => {
    const w = new WaterMotion({ windDir: 0, swell: 0.1 });
    w.update(10, 0.2, 1, 10);
    const s = w.sample(flat(0.5), 0, 0.2, 0, { ux: 0, uy: 0, uz: 0, bed: 0, surface: 0 });
    expect(s.ux).toBe(0);
    expect(s.uz).toBe(0);
  });

  it('keeps the eelgrass\'s clock, so the fish and the blades go to and fro together', () => {
    const meadow = { uAmTime: { value: 12.3 }, uAmWave: { value: new Vector4(Math.cos(0.7), Math.sin(0.7), 0.1, 0.6) } };
    const a = new WaterMotion({ windDir: 0.7, swell: 0.1 }), b = new WaterMotion({ windDir: 0.7, swell: 0.1 });
    a.meadow = meadow;
    a.update(0, 0.5);
    b.update(0, 0.5, 1, 12.3);
    const out = () => ({ ux: 0, uy: 0, uz: 0, bed: 0, surface: 0 });
    const sa = a.sample(flat(0.5), 1, 0.2, 2, out()), sb = b.sample(flat(0.5), 1, 0.2, 2, out());
    expect(sa.ux).toBeCloseTo(sb.ux, 9);
    expect(sa.uz).toBeCloseTo(sb.uz, 9);
  });

  it('never carries a fish onto water too shallow for it', () => {
    const water = new WaterMotion({ windDir: 0, swell: 0.3 }), r = new WaterRider();
    // the water ends at x = 0.005
    const floor: Floor = { heightAt: (x) => (x > 0.005 ? 1 : 0), waterAt: () => 0.5 };
    const p = new Vector3(0, 0.2, 0);
    for (let t = 0; t < 20; t += 1 / 60) {
      water.update(t, 0.5, 1, 1 / 60);
      r.step(1 / 60, water, floor, p.x, p.y, p.z, 0, 0.03, 1, 0.02);
      p.addScaledVector(r.vel, 1 / 60);
      expect(p.x).toBeLessThanOrEqual(0.005);
    }
  });

  it('runs the water shoreward under the surf\'s crests and seaward under its troughs (走水)', () => {
    const { surf, floor } = surfBeach();
    const w = new WaterMotion({ windDir: 0, swell: 0, surf });
    const out = { ux: 0, uy: 0, uz: 0, bed: 0, surface: 0 };
    let crest = 0, trough = 0, hi = -Infinity, lo = Infinity;
    for (let t = 0; t < 30; t += 0.05) {
      w.update(t, 0);
      // 40 cm of water, where the bigger waves break
      w.sample(floor, 8, -0.2, 0, out);
      hi = Math.max(hi, out.surface); lo = Math.min(lo, out.surface);
      // seaward is +x on 走水
      if (out.surface > 0.03) crest += Math.sign(-out.ux);
      if (out.surface < -0.03) trough += Math.sign(out.ux);
    }
    expect(crest).toBeGreaterThan(0);
    expect(trough).toBeGreaterThan(0);
    // waves of some tens of centimetres, crest to trough
    expect(hi - lo).toBeGreaterThan(0.08);
    expect(hi - lo).toBeLessThan(0.6);
  });

  it('has no surf on a sheltered flat, and leaves the beach above the swash dry', () => {
    expect(surfEta(surfUniforms(null), 0, 0, 0.3, 5)).toBe(0);
    // 10 m up a 1:20 beach the surface is the sand's, 50 cm over the still level (2 mm under the sand: no water)
    const { surf } = surfBeach();
    for (let t = 0; t < 10; t += 0.5) expect(surfEta(surf, -10, 0, 0, t)).toBeCloseTo(0.498, 3);
  });

  it('carries nothing where the backwash has drained the sand to a film (走水)', () => {
    const { surf, floor } = surfBeach();
    const w = new WaterMotion({ windDir: 0, swell: 0, surf });
    const out = { ux: 0, uy: 0, uz: 0, bed: 0, surface: 0 };
    let bare = 0;
    for (let t = 0; t < 60; t += 0.05) {
      w.update(t, 0);
      // a few millimetres to a centimetre of still water at the waterline: the backwash drains it between the waves
      // to a film of a millimetre or less
      for (const x of [0.05, 0.1, 0.2]) for (const z of [-12, 0, 12]) {
        w.sample(floor, x, -0.05 * x - 0.001, z, out);
        if (out.surface - out.bed < 0.002) { bare++; expect(out.ux).toBe(0); }
      }
    }
    expect(bare).toBeGreaterThan(0);
  });
});
