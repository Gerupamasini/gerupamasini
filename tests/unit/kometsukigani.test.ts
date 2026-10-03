import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { ScopimeraGlobosa, flatProbe, makeEnv, seasonFor } from '../../src/creatures/kometsukigani/ScopimeraGlobosa.js';
import { breedingFactor, seasonalActivity, STATE } from '../../src/creatures/kometsukigani/ScopimeraGlobosaBehavior.js';
import { createRigInstance } from '../../src/creatures/kometsukigani/ScopimeraGlobosaRig.js';
import { crabTriangles } from '../../src/creatures/kometsukigani/ScopimeraGlobosaGeometry.js';
import { STANCE } from '../../src/creatures/kometsukigani/ScopimeraGlobosaMorphology.js';

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
    expect(crabTriangles(0)).toBeLessThan(110000);
    expect(crabTriangles(1)).toBeLessThan(30000);
    expect(crabTriangles(2)).toBeLessThan(7000);
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
