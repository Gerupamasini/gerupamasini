import { describe, expect, it } from 'vitest';
import { BufferGeometry, Group, Matrix4, Object3D, Vector3 } from 'three';
import {
  MODEL_SH, PSI_CANAL, PSI_COVER, SECTION_LEN, SHELL, carryRotation, growth, sectionAt, shellPoint,
} from '../../src/creatures/species/aramushiro/anatomy';
import { LANDMARKS, callusAt, sculpt, shellGeometry, shellHeight, shellTriangles } from '../../src/creatures/species/aramushiro/shell';
import { PART, PART_NAMES, REST, softMergedGeometry, softPartGeometry, softTriangles } from '../../src/creatures/species/aramushiro/body';
import { Aramushiro, BURY, PACE, type SnailEnv } from '../../src/creatures/species/aramushiro/behavior';
import { CarrionField } from '../../src/creatures/species/aramushiro/carrion';
import { buildModel } from '../../src/creatures/species/aramushiro/model';
import { lookFor } from '../../src/creatures/species/aramushiro/materials';
import { AramushiroDriver } from '../../src/creatures/species/aramushiro/AramushiroDriver';
import { DRIVERS } from '../../src/creatures/drivers/index';
import type { DriverContext } from '../../src/creatures/drivers/Driver';
import { Rng } from '../../src/core/Rng';

const TAU = Math.PI * 2;

/** share of triangles whose winding agrees with their vertices' normals */
function outward(g: BufferGeometry): number {
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), idx = g.index!;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), m = new Vector3(), vn = new Vector3();
  let agree = 0, total = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const ia = idx.getX(i), ib = idx.getX(i + 1), ic = idx.getX(i + 2);
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    if (n.lengthSq() < 1e-26) continue;
    vn.fromBufferAttribute(nrm, ia).add(m.fromBufferAttribute(nrm, ib)).add(m.fromBufferAttribute(nrm, ic));
    total++;
    if (n.dot(vn) > 0) agree++;
  }
  return agree / total;
}

describe('アラムシロ shell', () => {
  it('is dextral: carried with the outer lip on the right, the rotation is proper (no mirror)', () => {
    expect(carryRotation().determinant()).toBeCloseTo(1, 6);
    // seen from the apex the whorls grow clockwise: θ increasing turns +x toward +z (x right, z down the screen)
    const a = shellPoint(-TAU * 2, 0.15), b = shellPoint(-TAU * 2 + 0.3, 0.15);
    expect(Math.atan2(b.z, b.x) - Math.atan2(a.z, a.x)).toBeGreaterThan(0);
  });
  it('has the proportions of the photographed shells: H/W ≈ 1.8, the body whorl over half the height', () => {
    const g = shellGeometry(0);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const h = bb.max.y - bb.min.y, w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    expect(h / w).toBeGreaterThan(1.6);
    expect(h / w).toBeLessThan(2.0);
    expect(shellHeight()).toBeGreaterThan(0.9 * MODEL_SH);
    // the suture above the body whorl at 0.44 SH from the apex: the body whorl is the lower 56 %
    expect(sectionAt(0).v).toBeCloseTo(0.44, 2);
    // the next whorl covers this one just below its periphery
    expect(PSI_COVER).toBeGreaterThan(0.1);
    expect(PSI_COVER).toBeLessThan(PSI_CANAL);
    expect(SHELL.whorls).toBeGreaterThan(6.5);
    expect(growth(-TAU)).toBeCloseTo(1 / SHELL.W, 6);
  });
  it('carries granules on the shoulder and spiral cords on the base, none on the protoconch or the callus', () => {
    const fineAt = (w: number, a: number) => sculpt(w, a).fine;
    // the strongest granule of the sub-sutural row over a rib period
    let shoulder = 0, base = 0, proto = 0;
    for (let k = 0; k < 60; k++) {
      const w = 1.5 + k / (60 * SHELL.ribs);
      shoulder = Math.max(shoulder, fineAt(w, SHELL.cord * 0.62));
      base = Math.max(base, fineAt(0.5 + k / (60 * SHELL.ribs), 0.55 * SECTION_LEN + 0.0));
      proto = Math.max(proto, fineAt(SHELL.whorls - 0.5, SHELL.cord * 0.62));
    }
    expect(shoulder).toBeGreaterThan(0.015);
    expect(proto).toBe(0);
    // the base: cords only (lower than the granules)
    expect(base).toBeLessThan(shoulder * 0.6);
    // the parietal callus is smooth
    const a = PSI_COVER * SECTION_LEN + 0.1;
    expect(callusAt(1.02, a)).toBeGreaterThan(0.9);
    expect(fineAt(1.02, a)).toBeLessThan(1e-4);
  });
  it('stays inside its per-tier triangle budgets and faces outward', () => {
    expect(shellTriangles(0)).toBeLessThan(70000);
    expect(shellTriangles(1)).toBeLessThan(7000);
    expect(shellTriangles(2)).toBeLessThan(800);
    for (const lod of [0, 1, 2] as const) expect(outward(shellGeometry(lod))).toBeGreaterThan(0.96);
    expect(shellGeometry(1)).toBe(shellGeometry(1));
  });
  it('has its aperture in the plane of the lip, under the foot when carried', () => {
    expect(Math.abs(LANDMARKS.aperture.z)).toBeLessThan(0.0004);
    expect(REST.aperture.y).toBeGreaterThan(0);
    expect(REST.aperture.y).toBeLessThan(0.6 * MODEL_SH);
    // the apex back and up, the canal forward
    const apex = new Vector3().applyMatrix4(REST.shellM);
    expect(apex.z).toBeLessThan(REST.canal.z);
    expect(apex.y).toBeGreaterThan(REST.canal.y);
  });
});

describe('アラムシロ soft parts', () => {
  it('builds every part facing outward, the far tiers small', () => {
    for (const p of Object.values(PART)) expect(outward(softPartGeometry(p)), PART_NAMES[p]).toBeGreaterThan(0.97);
    expect(outward(softMergedGeometry())).toBeGreaterThan(0.97);
    expect(softTriangles(0)).toBeLessThan(12000);
    expect(softTriangles(1)).toBeLessThan(2000);
  });
  it('names the model the way the brief asks: AramushiroRoot, Shell, SoftBody, Foot, Tentacle_L/R, Siphon', () => {
    const m = buildModel(lookFor(0, 0.3), 1);
    for (const name of ['AramushiroRoot', 'Shell', 'SoftBody', 'Foot', 'Tentacle_L', 'Tentacle_R', 'Siphon', 'Proboscis', 'Operculum']) {
      expect(m.root.getObjectByName(name), name).toBeDefined();
    }
    expect(m.lod.levels.length).toBe(3);
    // one draw at the far tier, two at the middle
    expect(m.lod.levels[2].object.children.length).toBe(1);
    expect(m.lod.levels[1].object.children.length).toBe(2);
    m.dispose();
  });
});

// ------------------------------------------------------------------ behaviour

const flat = (depth = 0.2) => ({ heightAt: () => 0, waterAt: () => depth, sampleAt: () => ({ substrate: 'sand' }) as never });
function env(extra: Partial<SnailEnv> = {}): SnailEnv {
  return { floor: flat(), canBurrow: true, t: 0, scent: null, current: null, minDepth: 0.015, ...extra };
}
function run(s: Aramushiro, e: SnailEnv, secs: number, dt = 1 / 20): void {
  for (let t = 0; t < secs; t += dt) { e.t += dt; s.update(dt, e); }
}
const snail = (seed = 5) => new Aramushiro(0.012, new Rng(seed), `s${seed}`);

describe('アラムシロ behaviour', () => {
  it('glides toward where it is sent at a snail\'s pace, the foot reaching and hauling', () => {
    const s = snail();
    const e = env();
    s.crawlTo(new Vector3(0.5, 0, 0), 300);
    let reach = 0, haul = 0;
    for (let t = 0; t < 30; t += 0.05) {
      s.update(0.05, e);
      reach = Math.max(reach, s.pose.reach);
      haul = Math.max(haul, s.pose.haul);
    }
    const d = s.pos.length();
    const expected = PACE.crawl * 0.012 * 30;
    expect(d).toBeGreaterThan(expected * 0.4);
    expect(d).toBeLessThan(expected * 1.3);
    expect(reach).toBeGreaterThan(0.5);
    expect(haul).toBeGreaterThan(0.5);
    expect(s.state).toBe('CRAWL');
  });
  it('withdraws into its shell at a threat — the shell falls, the operculum shuts — and comes out again', () => {
    const s = snail();
    const e = env();
    s.rest(10);
    run(s, e, 1);
    s.hide(3);
    run(s, e, 0.3);
    expect(s.pose.retractTubes).toBeGreaterThan(0.6);
    run(s, e, 2);
    expect(s.state).toBe('HIDE_IN_SHELL');
    expect(s.pose.retractFoot).toBeGreaterThan(0.95);
    expect(s.pose.shellFall).toBeGreaterThan(0.95);
    expect(s.pose.shut).toBeGreaterThan(0.95);
    run(s, e, 6);
    expect(s.state).toBe('IDLE');
    expect(s.pose.shut).toBeLessThan(0.05);
    expect(s.pose.retractFoot).toBeLessThan(0.1);
  });
  it('buries itself in soft sand with the siphon up, but not where there is nothing to dig into', () => {
    const s = snail();
    const e = env();
    s.burrow(60, e);
    run(s, e, 70);
    expect(s.state).toBe('BURROW');
    expect(s.sub).toBe('buried');
    expect(s.sink).toBeCloseTo(BURY * 0.012, 4);
    expect(s.pose.siphonPitch).toBeGreaterThan(1.2);
    const t = snail(9);
    const e2 = env({ canBurrow: false });
    t.burrow(60, e2);
    run(t, e2, 20);
    expect(t.state).not.toBe('BURROW');
    expect(t.sink).toBe(0);
  });
  it('smells carrion down the current, heads up to it, takes a place at its edge and feeds with the proboscis', () => {
    const field = new CarrionField(flat(), 3, 0);
    const food = field.add(0, 0, 0.5);
    const s = snail(11);
    // half a metre down the current from the meat
    s.pos.set(0, 0, 0.5);
    s.heading = 0;
    const e = env({ scent: field, current: { x: 0, y: 0.02 } });
    s.rest(5);
    let fed = false, prob = 0;
    for (let t = 0; t < 3000 && !fed; t += 0.1) {
      e.t += 0.1;
      s.update(0.1, e);
      if (!s.done) continue;
      if (s.state === 'FEED') fed = true;
      else s.rest(5);
    }
    for (let t = 0; t < 2000 && s.state !== 'FEED'; t += 0.1) { e.t += 0.1; s.update(0.1, e); }
    expect(s.state).toBe('FEED');
    run(s, e, 10, 0.1);
    prob = s.pose.probExt;
    expect(prob).toBeGreaterThan(0.2);
    expect(food.slots.has(s.id)).toBe(true);
    const meat = food.meat;
    run(s, e, 60, 0.1);
    expect(food.meat).toBeLessThan(meat);
    // its mouth at the food, not on it
    const d = Math.hypot(s.pos.x - food.x, s.pos.z - food.z);
    expect(d).toBeGreaterThan(food.r);
    expect(d).toBeLessThan(food.r + 0.012 * 1.2);
  });
  it('does not smell carrion up the current from far off', () => {
    const field = new CarrionField(flat(), 3, 0);
    field.add(0, 0, 0.5);
    const s = snail(12);
    s.pos.set(0, 0, -1.2);
    const e = env({ scent: field, current: { x: 0, y: 0.02 } });
    s.rest(30);
    run(s, e, 20);
    expect(s.food).toBeNull();
  });
  it('keeps out of water too shallow for it', () => {
    const s = snail(13);
    const e = env({ floor: { heightAt: () => 0, waterAt: (x: number) => (x > 0.05 ? 0.005 : 0.1) } });
    s.crawlTo(new Vector3(0.5, 0, 0), 600);
    run(s, e, 120);
    expect(s.pos.x).toBeLessThan(0.06);
  });
});

describe('アラムシロ carrion', () => {
  it('shares a piece round its edge and refuses a crowd', () => {
    const field = new CarrionField(flat(), 3, 0);
    const f = field.add(0, 0, 0.5);
    const got: number[] = [];
    for (let i = 0; i < 40; i++) { const a = field.claim(f, `s${i}`, 0); if (a !== null) got.push(a); }
    expect(got.length).toBeGreaterThan(6);
    expect(got.length).toBeLessThan(40);
    // no two in the same place
    for (let i = 0; i < got.length; i++) for (let j = i + 1; j < got.length; j++) expect(Math.abs(Math.atan2(Math.sin(got[i] - got[j]), Math.cos(got[i] - got[j])))).toBeGreaterThan(0.1);
    expect(field.claim(f, 's0', 2)).toBe(got[0]);
    field.release(f, 's0');
    expect(f.slots.has('s0')).toBe(false);
  });
  it('lays the same pieces in the same places for a day', () => {
    const a = new CarrionField(flat(), 77), b = new CarrionField(flat(), 77);
    a.update(0, 0, 1); b.update(0, 0, 1);
    expect(a.items.length).toBeGreaterThan(0);
    expect(a.items.map((i) => [i.x, i.z])).toEqual(b.items.map((i) => [i.x, i.z]));
  });
});

describe('アラムシロ driver', () => {
  const ctx = (extra: Partial<DriverContext> = {}): DriverContext => ({ floor: flat(), player: new Vector3(5, 0, 5), simScale: 1, nowMs: 0, locked: true, canBurrow: true, ...extra });
  function attached() {
    const entry = DRIVERS.aramushiro;
    const holder = entry.placeholder!();
    const scene = new Group();
    scene.add(holder.root);
    const d = entry.create() as AramushiroDriver;
    const ind = {
      id: 'reticunassa_festiva#1a2b', species: {} as never, pos: new Vector3(), home: new Vector3(), heading: 0, length_mm: 12, weight_g: 0.4, sex: 'f' as const, stage: 'adult',
      traits: [], gravid: false, dress: false, lengthPct: 50, wariness: 1, alert: 0, energy: 1, lod: 0 as const,
      brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' }, rng: new Rng(3), cell: 0, ruleIndex: 0, mismatchSince: 0,
      spawnedAt: 0, strandedSince: 0,
    };
    d.attach(holder.root, ind as never);
    return { d, root: holder.root as Object3D, ind, scene };
  }
  it('is registered, sized to the individual, and withdraws at a threat', () => {
    const { d, root } = attached();
    expect(root.scale.x).toBeCloseTo(12 / AramushiroDriver.MODEL_MM, 6);
    const events: string[] = [];
    d.onEvent((e) => events.push(e.behaviorId));
    d.update(1 / 30, ctx());
    d.setIntent({ id: 1, kind: 'flee', urgency: 1, seconds: 3 });
    for (let t = 0; t < 2; t += 1 / 30) d.update(1 / 30, ctx({ nowMs: t * 1000 }));
    expect(events).toContain('withdraw');
    expect(d.behaviour!.state).toBe('HIDE_IN_SHELL');
    d.dispose();
  });
  it('lies down in the sand when buried, and leaves a trail as it crawls', () => {
    const { d, root, scene } = attached();
    d.update(1 / 30, ctx());
    d.setIntent({ id: 2, kind: 'wander', urgency: 0.3, seconds: 60, target: new Vector3(0.3, 0, 0) });
    for (let t = 0; t < 30; t += 1 / 20) d.update(1 / 20, ctx({ nowMs: t * 1000 }));
    const marks = scene.getObjectByName('AramushiroSandMarks') as unknown as { count: number };
    expect(marks.count).toBeGreaterThan(4);
    d.setIntent({ id: 3, kind: 'burrow', urgency: 0.3, seconds: 60 });
    for (let t = 0; t < 70; t += 1 / 10) d.update(1 / 10, ctx({ nowMs: 30000 + t * 1000 }));
    expect(root.position.y).toBeLessThan(-0.4 * 0.012);
    // the siphon still reaches out of the sand
    const m = d.modelOf!.mats.pose.uPartM.value[PART.siphon];
    const base = new Vector3().setFromMatrixPosition(new Matrix4().multiplyMatrices(root.matrixWorld, m));
    expect(base.y).toBeLessThan(0);
    d.dispose();
  });
  it('keeps its full detail when watched, its tiers otherwise', () => {
    const { d } = attached();
    d.update(1 / 30, ctx({ locked: true }));
    const lod = d.modelOf!.lod;
    expect(lod.autoUpdate).toBe(false);
    expect(lod.levels[0].object.visible).toBe(true);
    d.update(1 / 30, ctx({ locked: false }));
    expect(lod.autoUpdate).toBe(true);
    d.dispose();
  });
});
