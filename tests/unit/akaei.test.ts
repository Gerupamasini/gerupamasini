import { describe, expect, it } from 'vitest';
import { BufferGeometry } from 'three';
import { DISC, MORPH, dorsalHeight, halfWidth, ventralDepth } from '../../src/creatures/species/akaei/morphology';
import { BONE_COUNT, akaeiGeometries, triangleCount, type Lod } from '../../src/creatures/species/akaei/geometry';

function finite(g: BufferGeometry): boolean {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name).array as ArrayLike<number>;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  }
  return true;
}

describe('アカエイ morphology', () => {
  it('has the disc proportions of the species', () => {
    let w = 0;
    for (let z = MORPH.zRear; z < MORPH.zSnout; z += 0.001) w = Math.max(w, halfWidth(z));
    expect(w * 2).toBeCloseTo(1, 2);
    // disc width 1.1–1.2 × disc length
    expect(1 / DISC.length).toBeGreaterThan(1.1);
    expect(1 / DISC.length).toBeLessThan(1.25);
    // the trunk is domed and much thicker than the margin
    expect(dorsalHeight(0, 0) + ventralDepth(0, 0)).toBeGreaterThan(0.08);
    expect(dorsalHeight(0.48, 0.04) + ventralDepth(0.48, 0.04)).toBeLessThan(0.01);
    // the eyes sit on the head, the spiracles right behind them
    expect(MORPH.spiracle.z).toBeLessThan(MORPH.eye.z);
    expect(MORPH.eye.z - MORPH.spiracle.z).toBeLessThan(0.08);
    // the mouth and gills are inside the trunk (the rigid part of the disc)
    for (const g of MORPH.gills) expect(g.x).toBeLessThan(0.12);
  });
});

describe('アカエイ outline against the photos and the literature', () => {
  const at = (along: number) => halfWidth(MORPH.zSnout - along);
  it('has the snout angle and disc ratio of the redescription (Hemitrygon akajei: 110–124°, DW/DL 1.06–1.16)', () => {
    const angle = (2 * Math.atan(at(0.12) / 0.12) * 180) / Math.PI;
    expect(angle).toBeGreaterThan(110);
    expect(angle).toBeLessThan(124);
    const ratio = 1 / (MORPH.zSnout - MORPH.zRear);
    expect(ratio).toBeGreaterThan(1.06);
    expect(ratio).toBeLessThan(1.16);
  });
  it('follows the outline traced on photos 045 and 052 (posterior margin)', () => {
    // [distance behind the snout, half-width] in DW, both photos agree within ~0.01 here
    for (const [a, w] of [[0.525, 0.45], [0.625, 0.39], [0.72, 0.32], [0.8, 0.24]]) expect(Math.abs(at(a) - w)).toBeLessThan(0.03);
  });
});

describe('アカエイ geometry', () => {
  for (const lod of [0, 1, 2] as Lod[]) {
    it(`LOD${lod} is finite, skinned within the skeleton and outward-facing`, () => {
      const g = akaeiGeometries(lod);
      for (const geo of Object.values(g)) {
        if (!geo) continue;
        expect(finite(geo)).toBe(true);
        const si = geo.getAttribute('skinIndex').array as ArrayLike<number>;
        for (let i = 0; i < si.length; i++) expect(si[i]).toBeLessThan(BONE_COUNT);
      }
      // the back's normals face up, the belly's down
      const n = g.disc.getAttribute('normal'), plan = g.disc.getAttribute('aPlan');
      let up = 0, down = 0;
      for (let i = 0; i < n.count; i++) {
        if (Math.abs(plan.getX(i)) / plan.getW(i) > 0.6) continue;
        if (plan.getZ(i) > 0.5) up += n.getY(i);
        else if (plan.getZ(i) < -0.5) down += n.getY(i);
      }
      expect(up).toBeGreaterThan(0);
      expect(down).toBeLessThan(0);
    });
  }
  it('gets lighter with each LOD', () => {
    const t0 = triangleCount(akaeiGeometries(0)), t1 = triangleCount(akaeiGeometries(1)), t2 = triangleCount(akaeiGeometries(2));
    expect(t0).toBeLessThan(60000);
    expect(t1).toBeLessThan(t0 / 3);
    expect(t2).toBeLessThan(2000);
  });
});

import { readFileSync } from 'node:fs';
import { Group, Vector3 } from 'three';
import { SpeciesSchema } from '../../src/data/schemas';
import { generateIndividual, minDepthFor } from '../../src/creatures/Individual';
import { AkaeiDriver, AKAEI_EVENTS } from '../../src/creatures/species/akaei/AkaeiDriver';
import { AkaeiModel, AkaeiPose } from '../../src/creatures/species/akaei/AkaeiModel';
import type { DriverContext, Intent } from '../../src/creatures/drivers/Driver';

const root = new URL('../../', import.meta.url).pathname;
const species = SpeciesSchema.parse(JSON.parse(readFileSync(root + 'public/data/species/hemitrygon_akajei.json', 'utf8')));

function rig(initial: 'rest' | 'buried' = 'rest', length = 820) {
  const ind = generateIndividual(species, 11, 0, 0, 0, 0, 0, [length, length]);
  const scene = new Group();
  const holder = AkaeiDriver.makeModel().root;
  scene.add(holder);
  const d = new AkaeiDriver();
  d.initial = initial;
  d.attach(holder, ind);
  const events: string[] = [];
  d.onEvent((e) => events.push(e.behaviorId));
  const ctx: DriverContext = { floor: { heightAt: () => 0, waterAt: () => 0.6 }, player: new Vector3(20, 0, 20), simScale: 1, nowMs: 0, minDepth: minDepthFor(species, ind.length_mm) };
  const run = (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) d.update(1 / 60, ctx); };
  let id = 1;
  const intent = (kind: Intent['kind'], extra: Partial<Intent> = {}) => d.setIntent({ id: id++, kind, urgency: 0.5, seconds: 20, ...extra });
  return { ind, d, run, intent, events, scene };
}

describe('アカエイ rig', () => {
  it('has the named parts on one skeleton', () => {
    const m = new AkaeiModel({ tint: new (require_color())(1, 1, 1), dark: 0.5, seed: 1 }, 1);
    const names = m.root.children.map((c) => c.name);
    for (const n of ['DiscBody', 'Tail', 'Eye_L', 'Eye_R', 'Spiracle_L', 'Spiracle_R', 'MouthAndGillArea']) expect(names).toContain(n);
    expect(m.disc.skeleton).toBe(m.tail.skeleton);
    // the head stays still while the margins swing
    const p = new AkaeiPose();
    p.amp = 0.1; p.phase = 1;
    m.pose(p);
    const head = m.bones.find((b) => b.name === 'Disc_2_4')!, rim = m.bones.find((b) => b.name === 'Disc_6_8')!;
    let hMin = 1, hMax = -1, rMin = 1, rMax = -1;
    for (let k = 0; k < 16; k++) {
      p.phase = (k / 16) * Math.PI * 2;
      m.pose(p);
      hMin = Math.min(hMin, head.position.y); hMax = Math.max(hMax, head.position.y);
      rMin = Math.min(rMin, rim.position.y); rMax = Math.max(rMax, rim.position.y);
    }
    expect(hMax - hMin).toBeLessThan(0.01);
    expect(rMax - rMin).toBeGreaterThan(0.12);
    m.dispose();
  });
});

describe('アカエイ behaviour', () => {
  it('rests on the bottom with its belly on the sand', () => {
    const { d, run, ind } = rig('rest');
    run(2);
    expect(d.state).toBe('BOTTOM_REST');
    expect(d.grounded).toBeGreaterThan(0.95);
    expect(ind.pos.y).toBeLessThan(0.05);
  });
  it('glides to a target off the bottom and reports it', () => {
    const { d, run, intent, events, ind } = rig('rest');
    run(0.5);
    intent('wander', { target: new Vector3(3, 0, 0) });
    run(1.5);
    expect(d.state).toBe('GLIDE_SWIM');
    expect(d.grounded).toBeLessThan(0.3);
    expect(events).toContain(AKAEI_EVENTS.GLIDE_SWIM);
    run(12);
    expect(Math.hypot(ind.pos.x - 3, ind.pos.z)).toBeLessThan(0.4);
    expect(d.busy).toBe(false);
  });
  it('burrows: settles, flaps, sinks in and is covered in sand', () => {
    const { d, run, intent, events } = rig('rest');
    run(1);
    intent('burrow', { seconds: 30 });
    run(1.2);
    expect(d.phase).toBe('dig');
    run(5);
    expect(d.phase).toBe('buried');
    expect(d.sink).toBeGreaterThan(0.025);
    expect(d.sand).toBeGreaterThan(0.6);
    expect(events).toContain(AKAEI_EVENTS.BURROW_IN_SAND);
  });
  it('forages: searches low, then pumps on a spot with the mouth open', () => {
    const { d, run, intent, events } = rig('rest');
    run(0.5);
    intent('forage', { seconds: 30 });
    let pulsed = false, mouth = 0;
    for (let i = 0; i < 20 * 4; i++) { run(0.25); if (d.phase === 'pulse') { pulsed = true; mouth = Math.max(mouth, d.openings.mouth); } }
    expect(pulsed).toBe(true);
    expect(mouth).toBeGreaterThan(0.5);
    expect(events).toContain(AKAEI_EVENTS.FORAGE);
  });
  it('escapes from under the sand fast, shedding its cover', () => {
    const { d, run, intent, events, ind } = rig('buried');
    run(1);
    expect(d.sand).toBeGreaterThan(0.8);
    const start = ind.pos.clone();
    intent('flee', { target: new Vector3(-4, 0, 0), from: new Vector3(1, 0, 0), seconds: 4 });
    run(1.2);
    expect(d.state).toBe('ESCAPE');
    expect(ind.pos.distanceTo(start)).toBeGreaterThan(0.6);
    expect(ind.pos.x).toBeLessThan(start.x);
    expect(d.sand).toBeLessThan(0.3);
    expect(events).toContain(AKAEI_EVENTS.ESCAPE);
  });
  it('holds its tail as a firm rod: straight in a straight glide, a gentle arc in a turn, never kinked', () => {
    const { d, run, intent } = rig('rest');
    const bends = () => {
      const P = d.tailPoints;
      let maxA = 0;
      for (let j = 2; j < P.length / 3; j++) {
        const ax = P[j * 3 - 3] - P[j * 3 - 6], ay = P[j * 3 - 2] - P[j * 3 - 5], az = P[j * 3 - 1] - P[j * 3 - 4];
        const bx = P[j * 3] - P[j * 3 - 3], by = P[j * 3 + 1] - P[j * 3 - 2], bz = P[j * 3 + 2] - P[j * 3 - 1];
        const c = (ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz));
        maxA = Math.max(maxA, Math.acos(Math.min(1, c)));
      }
      return maxA;
    };
    // straight ahead (the ray faces its heading): the tip stays on the line of the body
    intent('wander', { target: new Vector3(Math.sin(d.heading) * 8, 0, Math.cos(d.heading) * 8) });
    run(4);
    const P = d.tailPoints, n = P.length / 3;
    const bx = P[3] - P[0], bz = P[5] - P[2], L = Math.hypot(bx, bz);
    const tx = P[(n - 1) * 3] - P[0], tz = P[(n - 1) * 3 + 2] - P[2];
    const off = Math.abs(tx * bz - tz * bx) / L;
    expect(off / Math.hypot(tx, tz)).toBeLessThan(0.05);
    // a hard turn: every joint stays within its limit
    intent('flee', { target: new Vector3(-6, 0, 0), from: new Vector3(4, 0, 0), seconds: 4 });
    let worst = 0;
    for (let i = 0; i < 90; i++) { run(1 / 60); worst = Math.max(worst, bends()); }
    expect(worst).toBeLessThan(0.17);
  });
  it('switches LOD with distance and never leaves the water surface', () => {
    const { d, run, intent, ind } = rig('rest');
    intent('wander', { target: new Vector3(5, 0, 0) });
    for (let i = 0; i < 60 * 6; i++) { run(1 / 60); expect(ind.pos.y).toBeLessThan(0.6); }
    expect(d.lod).toBe(2);
  });
});

function require_color() { return Color; }
import { Color } from 'three';
