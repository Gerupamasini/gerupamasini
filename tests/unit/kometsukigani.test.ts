import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SpeciesSchema } from '../../src/data/schemas';
import { spawnsOnMap } from '../../src/creatures/Spawner';
import { Box3, Group, Matrix4, Vector3 } from 'three';
import { ScopimeraColony } from '../../src/creatures/kometsukigani/ScopimeraColony.js';
import { ScopimeraDriver, ScopimeraGlobosa, flatProbe, makeEnv, seasonFor } from '../../src/creatures/kometsukigani/ScopimeraGlobosa.js';
import { generateIndividual } from '../../src/creatures/Individual';
import { breedingFactor, seasonalActivity, STATE } from '../../src/creatures/kometsukigani/ScopimeraGlobosaBehavior.js';
import { createRigInstance } from '../../src/creatures/kometsukigani/ScopimeraGlobosaRig.js';
import { crabTriangles } from '../../src/creatures/kometsukigani/ScopimeraGlobosaGeometry.js';
import { STANCE } from '../../src/creatures/kometsukigani/ScopimeraGlobosaMorphology.js';
import { SandPellets } from '../../src/creatures/kometsukigani/SandPellets.js';
import { lodFor, updateEvery } from '../../src/creatures/kometsukigani/ScopimeraGlobosaLOD.js';

const DT = 1 / 60;

/** a burrow at the origin, its shaft straight down */
function burrowEnv(cw: number) {
  const env = makeEnv(flatProbe(0));
  env.burrow = { e: new Vector3(0, 0, 0), axis: new Vector3(0, -1, 0), r: cw * 0.45, az: 0 };
  env.season = seasonFor(280);
  return env;
}

describe('コメツキガニ: rig and geometry', () => {
  it('builds three levels of detail within their budgets', () => {
    // close-up (with the setae), near (4–22 px across), far (4 px and less)
    expect(crabTriangles(0)).toBeLessThan(60000);
    expect(crabTriangles(1)).toBeLessThan(6500);
    expect(crabTriangles(2)).toBeLessThan(1600);
  });

  it('walking-leg IK puts every dactylus tip on any target inside the leg\'s reach', () => {
    const rig = createRigInstance();
    const out = new Vector3();
    for (const leg of rig.legs) {
      // feeding crouch, calm, alert: the coxa socket 0.25 … 0.46 CW over the sand
      for (const drop of [0.25, 0.36, 0.46]) {
        const r0 = leg.minReach(drop), r1 = leg.maxReach(drop);
        expect(r1 - r0).toBeGreaterThan(0.25);
        for (let k = 0; k <= 4; k++) {
          const target = leg.homeFoot(new Vector3(), r0 + ((r1 - r0) * k) / 4, 0, 0);
          target.y = leg.base.y - drop;
          leg.solve(target);
          leg.footBody(out);
          expect(out.distanceTo(target)).toBeLessThan(2e-3);
          // and the knee stays a crab's knee: bent, never straight, never cramped
          expect(leg.gamma).toBeGreaterThan(Math.PI * 0.33);
          expect(leg.gamma).toBeLessThan(Math.PI * 0.79);
        }
      }
    }
  });

  it('the calm stance stands well inside every leg\'s reach', () => {
    const rig = createRigInstance();
    rig.legs.forEach((leg, i) => {
      const drop = STANCE.bodyHeight.calm + leg.base.y;
      const r = STANCE.footReach[i % 4];
      expect(r).toBeLessThan(leg.maxReach(drop) - 0.04);
      expect(r).toBeGreaterThan(leg.minReach(drop) + 0.1);
    });
  });

  it('the basi-ischium joint stays fused', () => {
    const rig = createRigInstance();
    const leg = rig.legs[1];
    leg.solve(leg.homeFoot(new Vector3(), 0.9, 0.3, 0));
    expect(leg.ischium.quaternion.angleTo(leg.ischium.quaternion.clone().identity())).toBe(0);
  });
});

describe('コメツキガニ: locomotion', () => {
  /** walk for 4 s; returns how far planted feet moved (CW, worst frame), steps taken, worst IK miss (CW), achieved speed */
  function walk(v: number, turnRate: number, sideways = true) {
    const cw = 0.009;
    const crab = new ScopimeraGlobosa({ seed: 42, sex: 'm', cw_mm: 9 });
    const a = crab.animator;
    const probe = flatProbe(0);
    a.placeAt(0, 0, 0, probe);
    const prev = a.feet.map((f) => ({ planted: f.planted, w: f.w.clone() }));
    const foot = new Vector3();
    let slide = 0, steps = 0, miss = 0, dist = 0;
    for (let k = 0; k < 240; k++) {
      const h = a.heading;
      if (sideways) a.cmd.vel.set(Math.cos(h), 0, -Math.sin(h)).multiplyScalar(cw * v);
      else a.cmd.vel.set(Math.sin(h), 0, Math.cos(h)).multiplyScalar(cw * v);
      a.cmd.maxSpeed = cw * Math.max(v, 1) * 1.1;
      a.cmd.turnRate = Math.max(turnRate, 0.01);
      a.cmd.yaw = h + (turnRate > 0 ? 1 : 0);
      const p0 = a.pos.clone();
      a.update(DT, probe);
      if (k >= 30) dist += a.pos.distanceTo(p0);
      crab.root.updateMatrixWorld(true);
      const bodyWorld = new Matrix4().multiplyMatrices(crab.root.matrixWorld, crab.model.rig.body.matrix);
      a.feet.forEach((f, i) => {
        if (prev[i].planted && f.planted) slide = Math.max(slide, f.w.distanceTo(prev[i].w) / cw);
        if (prev[i].planted && !f.planted) steps++;
        prev[i].planted = f.planted;
        prev[i].w.copy(f.w);
        if (f.planted && k >= 30) {
          a.rig.legs[i].footBody(foot).applyMatrix4(bodyWorld);
          miss = Math.max(miss, foot.distanceTo(f.w) / cw);
        }
      });
    }
    return { slide, steps, miss, speed: dist / cw / (210 / 60) };
  }

  it('planted feet stay welded to the sand at feeding and walking pace, and the legs reach them', () => {
    // a feeding step (1.4 CW/s, forward), walking home sideways (3 CW/s) on a gentle curve, turning on the spot
    for (const [v, turn, sideways] of [[1.4, 0, false], [1.4, 0, true], [3, 0.6, true], [0, 2, true]] as const) {
      const r = walk(v, turn, sideways);
      // not a hair at feeding pace or turning; setting off briskly a trailing foot may give ~0.1 mm once
      expect(r.slide).toBeLessThan(v >= 3 ? 0.02 : 1e-9);
      expect(r.miss).toBeLessThan(0.05);
      expect(r.steps).toBeGreaterThan(8);
      if (v > 0) expect(r.speed).toBeGreaterThan(v * 0.9);
    }
  });

  it('at a sprint the feet blur but the body keeps its height and pace', () => {
    const r = walk(20, 0);
    expect(r.speed).toBeGreaterThan(18);
    expect(r.steps).toBeGreaterThan(200);
  });

  it('a body over uneven ground follows the planted feet', () => {
    const crab = new ScopimeraGlobosa({ seed: 7, sex: 'f', cw_mm: 8 });
    const a = crab.animator;
    // a slope rising toward +x: the left legs stand higher, the body rolls to match
    const slope = { heightAt: (x: number) => x * 0.3 };
    a.placeAt(0, 0, 0, slope);
    for (let k = 0; k < 90; k++) a.update(DT, slope);
    expect(a.rig.body.rotation.z).toBeGreaterThan(0.05);
  });
});

describe('コメツキガニ: behaviour', () => {
  it('comes out at low tide, feeds, and leaves pellets', () => {
    const crab = new ScopimeraGlobosa({ seed: 1234, sex: 'f', cw_mm: 8 });
    const env = burrowEnv(crab.cw);
    crab.placeAt(0, 0, 0, env.probe, true);
    crab.behavior.plugged = false;
    const events: string[] = [];
    crab.on((id: string) => events.push(id));
    let pellets = 0;
    // feeding pellets only (the lumps it carries up while clearing the burrow come through here too)
    crab.onPellet = (_p: unknown, _r: number, kind: string) => { if (kind === 'feed') pellets++; };
    for (let k = 0; k < 60 * 240 && pellets < 2; k++) crab.update(DT, env);
    expect(events).toContain('peek');
    expect(events).toContain('emerge');
    expect(events).toContain('feed');
    expect(pellets).toBeGreaterThan(0);
  });

  it('bolts for its burrow when something big comes close, and goes in', () => {
    const crab = new ScopimeraGlobosa({ seed: 99, sex: 'm', cw_mm: 9 });
    const env = burrowEnv(crab.cw);
    crab.placeAt(crab.cw * 3, 0, 0, env.probe, false);
    crab.behavior.plugged = false;
    crab.behavior.setState(STATE.IDLE);
    crab.behavior.idleFor = 10;
    for (let k = 0; k < 30; k++) crab.update(DT, env);
    env.threat = { pos: new Vector3(0.3, 0, 0.3), level: 1, kind: 'player' };
    const events: string[] = [];
    crab.on((id: string) => events.push(id));
    for (let k = 0; k < 60 * 4; k++) crab.update(DT, env);
    expect(events).toContain('retreat');
    expect([STATE.HIDE, STATE.RETREAT]).toContain(crab.state);
    expect(crab.hidden).toBe(true);
  });

  it('never warps: out of the burrow, feeding, bolting and back in, the body moves continuously', () => {
    const crab = new ScopimeraGlobosa({ seed: 77, sex: 'm', cw_mm: 9 });
    const env = burrowEnv(crab.cw);
    crab.placeAt(0, 0, 0, env.probe, true);
    crab.behavior.plugged = false;
    const events: string[] = [];
    crab.on((id: string) => events.push(id));
    const prev = new Vector3(), cur = new Vector3();
    let worst = 0, fedAt = -1, lowest = Infinity;
    crab.update(DT, env);
    crab.anchor(prev);
    for (let k = 0; k < 60 * 300; k++) {
      // once it has fed a while, something large comes close
      if (fedAt < 0 && events.includes('pellet')) fedAt = k;
      if (fedAt >= 0 && k === fedAt + 120) env.threat = { pos: new Vector3(crab.cw * 6, 0, crab.cw * 6), level: 1, kind: 'player' };
      crab.update(DT, env);
      crab.anchor(cur);
      worst = Math.max(worst, cur.distanceTo(prev) / crab.cw);
      lowest = Math.min(lowest, cur.y);
      prev.copy(cur);
      if (events.includes('retreat') && crab.hidden && k > fedAt + 400) break;
    }
    expect(events).toContain('emerge');
    expect(events).toContain('pellet');
    expect(events).toContain('retreat');
    // a sprint covers ~0.37 CW a frame at 60 fps; nothing else may move the body (or the camera's anchor) faster
    expect(worst).toBeLessThan(0.45);
    // and the observation camera's anchor never follows the crab below the sand
    expect(lowest).toBeGreaterThan(0);
  });

  it('waves only in the breeding season, males with a burrow', () => {
    const run = (sex: 'm' | 'f', doy: number) => {
      const crab = new ScopimeraGlobosa({ seed: 5, sex, cw_mm: 9.5 });
      const env = burrowEnv(crab.cw);
      env.season = seasonFor(doy);
      crab.placeAt(crab.cw * 0.5, 0, 0, env.probe, false);
      crab.behavior.plugged = false;
      crab.behavior.setState(STATE.IDLE);
      crab.behavior.courtshipDrive = sex === 'm' ? 0.9 : 0;
      const events: string[] = [];
      crab.on((id: string) => events.push(id));
      for (let k = 0; k < 60 * 30; k++) crab.update(DT, env);
      return events.includes('wave');
    };
    expect(run('m', 185)).toBe(true);
    expect(run('m', 300)).toBe(false);
    expect(run('f', 185)).toBe(false);
  });

  it('seasons: breeding April–August, surface activity April–November', () => {
    expect(breedingFactor(185)).toBeGreaterThan(0.9);
    expect(breedingFactor(280)).toBe(0);
    expect(seasonalActivity(200)).toBe(1);
    expect(seasonalActivity(20)).toBe(0);
    expect(STANCE.bodyHeight.feed).toBeLessThan(STANCE.bodyHeight.calm);
  });
});

describe('コメツキガニ: where it lives', () => {
  const root = new URL('../../', import.meta.url).pathname;
  const species = SpeciesSchema.parse(JSON.parse(readFileSync(root + 'public/data/species/scopimera_globosa.json', 'utf8')));
  const manifest = JSON.parse(readFileSync(root + 'public/data/manifest.json', 'utf8')) as { maps: string[] };

  it('is introduced on the 葛西 flat only', () => {
    for (const rule of species.spawn) expect(rule.maps).toEqual(['kasai_west']);
    for (const map of manifest.maps) expect(spawnsOnMap(species, map)).toBe(map === 'kasai_west');
  });

  it('burrows most thickly in muddy sand, sparsely in sand, and more sparsely still in the sand toward the shore', () => {
    // a flat of one substrate and height, through the colony's own density rule (patches identical between calls)
    const density = (sub: string, h: number, x: number, z: number) => ScopimeraColony.prototype.densityAt.call({
      seed: 1003,
      terrain: { inside: () => true, substrateAt: () => sub, pitMaskAt: () => 0, heightAt: () => h },
    }, x, z) as number;
    // a spot inside a patch
    let spot: [number, number] | null = null;
    for (let x = -100; x < 100 && !spot; x += 1.7) for (let z = -100; z < 100 && !spot; z += 1.3) if (density('muddy_sand', 0.2, x, z) > 6) spot = [x, z];
    expect(spot).not.toBeNull();
    const [x, z] = spot!;
    const muddy = density('muddy_sand', -0.1, x, z), sandLow = density('sand', -0.1, x, z), sandHigh = density('sand', 0.6, x, z);
    expect(sandLow / muddy).toBeCloseTo(0.3, 2);
    expect(sandHigh / density('muddy_sand', 0.6, x, z)).toBeCloseTo(0.09, 2);
    expect(density('mud', 0.2, x, z)).toBe(0);
  });

  it('is placed by its colony, not by the spawner', () => {
    expect(species.placement).toBe('world');
  });

  it('caught, it lies in the net at its own size: the net scales the preview\'s holder, never the crab\'s root', () => {
    const g = ScopimeraDriver.makePreview();
    // the net and the shovel set the holder's scale to length / modelLength (a 5 mm crab: 0.5)
    expect(g.scale.x).toBe(1);
    g.scale.setScalar(5 / species.model.modelLength_mm);
    g.updateMatrixWorld(true);
    const size = new Box3().setFromObject(g).getSize(new Vector3());
    // a carapace 5 mm wide, its legs spread: about 1 cm across, nowhere near the 0.5 m of a root scaled to 0.5
    expect(Math.max(size.x, size.z)).toBeGreaterThan(0.004);
    expect(Math.max(size.x, size.z)).toBeLessThan(0.03);
    g.userData.disposer();
  });

  it('in the field case it stays where it walks when the case keeps its root inside the walls', () => {
    // the case's animals live in a group at the world origin; the case stands far from it and clamps each root
    const animals = new Group(), root = new Group();
    animals.add(root);
    const ind = generateIndividual(species, 7, 0, 0, 0, 0, 0, [8, 8]);
    ind.pos.set(40, 0.2, -25);
    const d = new ScopimeraDriver();
    d.attach(root, ind);
    const B = { minX: 39.9, maxX: 40.1, minZ: -25.05, maxZ: -24.95 };
    const ctx = { floor: { heightAt: () => 0.2, waterAt: () => 0.33 }, player: new Vector3(40, 1.5, -24), simScale: 1, nowMs: 0, bounds: B, canBurrow: false };
    for (let i = 0; i < 90; i++) {
      d.update(1 / 30, ctx);
      root.position.x = Math.min(B.maxX, Math.max(B.minX, root.position.x));
      root.position.z = Math.min(B.maxZ, Math.max(B.minZ, root.position.z));
    }
    animals.updateMatrixWorld(true);
    const body = new Vector3().setFromMatrixPosition(d.crab!.model.lods[1].matrixWorld);
    expect(body.distanceTo(ind.pos)).toBeLessThan(0.02);
    expect(body.x).toBeGreaterThan(B.minX - 0.02);
    expect(body.x).toBeLessThan(B.maxX + 0.02);
    d.dispose();
  });
});

describe('コメツキガニ: pellets and cost', () => {
  it('washes away the pellets the water covers, each where it lies, within half a minute', () => {
    const P = new SandPellets();
    // one 0.5 m cell, a pool over its western half (x < 0.2) and dry sand east of it
    P.add(0.1, 0, 0.1, 0.001, 'feed', 0, 0.3);
    P.add(0.4, 0, 0.1, 0.001, 'feed', 0, 0.6);
    const waterAt = (x: number) => (x < 0.2 ? 0.02 : -1);
    const cam = new Vector3(0.25, 1.5, 0.25);
    for (let t = 0; t < 40; t++) P.update(1, cam, waterAt);
    expect(P.total).toBe(1);
    expect(P.heightAt(0.4, 0.1)).toBeGreaterThan(0);
    expect(P.heightAt(0.1, 0.1)).toBe(-Infinity);
  });

  it('draws each pellet by the camera with the detail of its own distance', () => {
    const P = new SandPellets();
    P.add(0.05, 0, 0.05, 0.001, 'feed', 0, 0.3);           // at the observation camera's feet
    P.add(0.3, 0, 0.3, 0.001, 'feed', 0, 0.6);             // in the same 0.5 m cell, 0.4 m off
    P.update(0, new Vector3(0.05, 0.05, 0.0), null);
    const tris = P.group.children.map((m) => (m as unknown as { geometry: { index: { count: number } | null; attributes: { position: { count: number } } }; count: number }))
      .map((m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * m.count).sort((x, y) => x - y);
    expect(tris).toEqual([20, 180]);
  });

  it('draws a share of the pixel-sized far pellets, grown to cover the same sand', () => {
    const P = new SandPellets();
    for (let k = 0; k < 300; k++) P.add(0.1 + (k % 20) * 0.015, 0, 0.1 + Math.floor(k / 20) * 0.02, 0.001, 'feed', 0, (k * 0.618) % 1);
    P.update(0, new Vector3(-2.2, 1.5, 0.25), null);            // a standing eye 2.7 m off
    const m = P.group.children[0] as unknown as { count: number };
    expect(m.count).toBeGreaterThan(80);
    expect(m.count).toBeLessThan(120);
    expect(P.total).toBe(300);
  });

  it('a far crab, or one down its burrow, is updated less often than a near one', () => {
    expect(updateEvery(0, 0.3, false)).toBe(1);
    expect(updateEvery(1, 0.8, false)).toBe(1);
    expect(updateEvery(1, 2, false)).toBe(2);
    expect(updateEvery(1, 0.8, true)).toBe(4);
    expect(updateEvery(2, 8, false)).toBe(4);
    // a lighter tier's own LOD limits
    expect(lodFor(1.7, 1, false, [0.35, 1.4])).toBe(2);
    expect(lodFor(1.7, 1)).toBe(1);
  });
});
