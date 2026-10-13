import { describe, expect, it } from 'vitest';
import { Group, Vector3, type Mesh } from 'three';
import { CARAPACE, legSpecs, marginTeeth, MODEL_CW } from '../../src/creatures/species/gazami/anatomy';
import { LODS, outline, rigDefinition } from '../../src/creatures/species/gazami/geometry';
import { gazamiGeometry, gazamiRig, buildModel, disposeModel } from '../../src/creatures/species/gazami/model';
import { applyPose, bindLeg, createBones, legTip, planarOf, solveLeg } from '../../src/creatures/species/gazami/rig';
import { neutralFoot, stillPose } from '../../src/creatures/species/gazami/poses';
import { createCrabBehavior, MODES, type Mode } from '../../src/creatures/species/gazami/behavior';
import { GazamiLook } from '../../src/creatures/species/gazami/materials';
import { lookSpecFor, chelaScaleFor } from '../../src/creatures/species/gazami/GazamiDriver';
import { PART } from '../../src/creatures/species/gazami/mesh';
import { Rng } from '../../src/core/Rng';

/** a sandy bottom with low ripples under 40 cm of water */
const ground = (x: number, z: number) => 0.0012 * Math.sin((x * 0.8 + z * 0.6) / 0.06 * 2 * Math.PI) + 0.003 * Math.sin(x * 3.1) * Math.cos(z * 2.3);
const world = (extra: Record<string, unknown> = {}) => ({ ground, waterY: () => 0.4, canBurrow: () => true, ...extra });
const CW = 0.08;
const make = (seed = 3, extra: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) => {
  const r = new Rng(seed);
  return createCrabBehavior({ world: world(extra), rng: () => r.next(), rig: gazamiRig(), scale: CW, start: { x: 0, z: 0, heading: 0 }, autonomous: false, ...opts });
};
const run = (b: ReturnType<typeof make>, seconds: number, each?: () => void) => { for (let i = 0; i < seconds * 60; i++) { b.update(1 / 60); each?.(); } };
const fwd = (h: number) => new Vector3(Math.sin(h), 0, Math.cos(h));

describe('ガザミ: the body plan measured on the photographs', () => {
  it('has the very broad carapace of a portunid, widest at the lateral spines', () => {
    const teeth = marginTeeth();
    const spine = teeth.find((t) => t.name === 'T9')!;
    const CL = CARAPACE.front - CARAPACE.back;
    // CL / CW ≈ 0.47 (61: 0.46, 19: 0.48, 39: 0.47)
    expect(CL / 100).toBeGreaterThan(0.44);
    expect(CL / 100).toBeLessThan(0.5);
    // the spines' tips are the widest point (CW = 100 at their tips), 57 % of the length back from the front
    expect(spine.tip[0]).toBeCloseTo(50, 0);
    const fromFront = (CARAPACE.front + 0.6 - spine.tip[1]) / CL;
    expect(fromFront).toBeGreaterThan(0.5);
    expect(fromFront).toBeLessThan(0.64);
    // a long spine: ≈ 0.13 CW from its base
    expect(spine.length / 100).toBeGreaterThan(0.1);
  });

  it('has nine anterolateral teeth a side, the ninth the lateral spine, and four frontal teeth', () => {
    const teeth = marginTeeth();
    expect(teeth.filter((t) => /^T\d$/.test(t.name)).length).toBe(9);
    expect(teeth.filter((t) => /^F/.test(t.name)).length).toBe(2);   // a side: four between the orbits
    const al = teeth.filter((t) => /^T[2-8]$/.test(t.name));
    for (const t of al) { expect(t.length).toBeGreaterThan(2.5); expect(t.length).toBeLessThan(4); }
  });

  it('has the long male cheliped and walking legs in the photographs’ proportions', () => {
    const [P1, P2, P3, P4, P5] = legSpecs();
    const L = (s: typeof P1, n: string) => s.articles.find((a) => a.name === n)!.length;
    // cheliped (61): merus 0.32, carpus 0.11, palm 0.34, fingers 0.26 CW
    expect(L(P1, 'me') / 100).toBeCloseTo(0.315, 1);
    expect(L(P1, 'ca') / 100).toBeCloseTo(0.11, 1);
    expect(L(P1, 'pr') / 100).toBeGreaterThan(0.55);   // palm and fixed finger
    // walking legs: merus : carpus : propodus : dactylus ≈ 0.36 : 0.13 : 0.24 : 0.27
    for (const s of [P2, P3, P4]) {
      const tot = L(s, 'me') + L(s, 'ca') + L(s, 'pr') + L(s, 'da');
      expect(L(s, 'me') / tot).toBeCloseTo(0.36, 1);
      expect(L(s, 'ca') / tot).toBeCloseTo(0.13, 1);
      expect(L(s, 'da') / tot).toBeGreaterThan(0.22);
    }
    expect(L(P2, 'me')).toBeGreaterThan(L(P4, 'me'));
    // the paddle: the propodus and dactylus flat and broad (61: 18.5 × 11.5, 16 × 12.5)
    for (const n of ['pr', 'da']) {
      const a = P5.articles.find((x) => x.name === n)!;
      const wide = Math.max(...a.sections.map((k) => k.hz)), thick = Math.max(...a.sections.map((k) => k.hy));
      expect(a.blade).toBe(true);
      expect(wide / thick).toBeGreaterThan(n === 'da' ? 4 : 2.5);
      expect((2 * wide) / a.length).toBeGreaterThan(0.6);
    }
  });

  it('builds an outline whose rays never fold back, in every tier, and the two sides are not mirror images', () => {
    for (const lod of LODS) {
      const { loop, teeth } = outline(lod);
      const c = CARAPACE.centre;
      let prev = -1;
      for (const p of loop) {
        let a = Math.atan2(p.x - c[0], p.z - c[1]);
        if (a < 0) a += 2 * Math.PI;
        expect(a).toBeGreaterThan(prev - 1e-9);
        prev = a;
      }
      // a side: two frontal teeth, the inner orbital angle, T1 … T9
      expect(teeth.length).toBe(24);
    }
    const { teeth } = outline(LODS[0]);
    const L = teeth.filter((t) => t.sg > 0), R = teeth.filter((t) => t.sg < 0);
    let diff = 0;
    for (const l of L) { const r = R.find((x) => x.t.spec.name === l.t.spec.name)!; diff += Math.abs(l.t.tip[0] + r.t.tip[0]) + Math.abs(l.t.tip[1] - r.t.tip[1]); }
    expect(diff).toBeGreaterThan(0.5);
  });

  it('keeps the teeth, spines, claws and paddles in all three tiers, each lighter than the last', () => {
    const tris = ([0, 1, 2] as const).map((t) => gazamiGeometry(t).triangles);
    expect(tris[0]).toBeGreaterThan(tris[1]);
    expect(tris[1]).toBeGreaterThan(tris[2]);
    for (const t of [0, 1, 2] as const) {
      const g = gazamiGeometry(t).shell;
      const part = g.getAttribute('aPart');
      const has = (p: number) => { for (let i = 0; i < part.count; i++) if (Math.round(part.getX(i)) === p) return true; return false; };
      for (const p of [PART.DORSUM, PART.PALM, PART.FINGER, PART.PADDLE_PR, PART.PADDLE_DA, PART.DACTYL]) expect(has(p), `tier ${t} part ${p}`).toBe(true);
      // the widest point of the shell is the spines (CW 0.1 m)
      const pos = g.getAttribute('position');
      let maxX = 0;
      for (let i = 0; i < pos.count; i++) if (Math.round(part.getX(i)) === PART.DORSUM) maxX = Math.max(maxX, Math.abs(pos.getX(i)));
      expect(maxX).toBeGreaterThan(MODEL_CW * 0.48);
      expect(maxX).toBeLessThan(MODEL_CW * 0.53);
    }
    expect(gazamiGeometry(0).setae).not.toBeNull();
  });

  it('builds outward-facing shells (the triangles wind round their normals)', () => {
    const g = gazamiGeometry(1).shell;
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), idx = g.getIndex()!;
    let agree = 0, total = 0;
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), fn = new Vector3(), vn = new Vector3();
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(p, idx.getX(i)); b.fromBufferAttribute(p, idx.getX(i + 1)); c.fromBufferAttribute(p, idx.getX(i + 2));
      fn.subVectors(b, a).cross(c.clone().sub(a));
      if (fn.lengthSq() < 1e-16) continue;
      vn.fromBufferAttribute(n, idx.getX(i));
      total++;
      if (fn.dot(vn) > 0) agree++;
    }
    expect(agree / total).toBeGreaterThan(0.97);
    // and the dorsum faces up
    const part = g.getAttribute('aPart');
    let up = 0, cnt = 0;
    for (let i = 0; i < part.count; i++) if (Math.round(part.getX(i)) === PART.DORSUM) { cnt++; if (n.getY(i) > 0) up++; }
    expect(up / cnt).toBeGreaterThan(0.9);
  });
});

describe('ガザミ: the rig and the legs', () => {
  it('has 70 bones with the named chains', () => {
    const rig = rigDefinition();
    expect(rig.defs.length).toBe(70);
    for (const n of ['J_root', 'J_body', 'J_P1L_da', 'J_P5R_da', 'J_eye_L', 'J_mxp_R']) expect(rig.byName[n]).toBeDefined();
    expect(rig.legs.length).toBe(10);
  });

  it('reaches every walking foot with the IK, standing low or tall', () => {
    const rig = gazamiRig();
    for (const leg of rig.legs.filter((l) => l.id !== 'P1' && l.id !== 'P5')) {
      for (const lift of [3, 9, 16]) {
        const t = neutralFoot(leg, lift, 1);
        const P = bindLeg(leg.id);
        const miss = solveLeg(leg, planarOf(leg), t, -1.1, P);
        expect(miss).toBeLessThan(0.2);
        expect(legTip(leg, planarOf(leg), P).distanceTo(t)).toBeLessThan(0.3);
      }
    }
  });

  it('poses the bones (the chelae scaled per individual: the male’s longer, one claw larger)', () => {
    const rig = gazamiRig();
    const root = new Group();
    const { bones } = createBones(rig, root);
    applyPose(root, bones, rig, stillPose(rig, 'rest'), [1.05, 1]);
    expect(bones.J_P1L_cx.scale.x).toBeCloseTo(1.05);
    const m = chelaScaleFor('crab#1', 'm', 120), f = chelaScaleFor('crab#1', 'f', 120);
    expect(Math.max(...m)).toBeGreaterThan(Math.max(...f));
  });
});

describe('ガザミ: the seven behaviours', () => {
  it('enters every mode', () => {
    const b = make(5);
    const seen = new Set<Mode>([b.state.mode]);
    const each = () => seen.add(b.state.mode);
    b.walk({ x: 0.3, z: 0.05 }); run(b, 2, each);
    b.forage(3); run(b, 3, each);
    b.burrow(6); run(b, 4, each);
    b.defend(new Vector3(0.4, 0, 0.4), 2); run(b, 2, each);
    b.escape(new Vector3(0.3, 0, 0)); run(b, 1, each);
    b.swim({ x: -0.6, z: -0.2 }); run(b, 1.5, each);
    b.idle(2); run(b, 2, each);
    for (const m of MODES) expect(seen.has(m), m).toBe(true);
  });

  it('walks sideways on planted feet', () => {
    const b = make(7);
    b.walk({ x: 0.5, z: 0.1 });
    let side = 0, ahead = 0, slips = 0, stances = 0;
    const prev = new Map<string, Vector3>();
    run(b, 3, () => {
      const v = b.state.vel;
      if (v.length() > CW * 0.5) {
        const f = fwd(b.state.heading);
        ahead += Math.abs(v.dot(f));
        side += Math.sqrt(Math.max(0, v.lengthSq() - v.dot(f) ** 2));
      }
    });
    expect(side).toBeGreaterThan(ahead * 2.5);
    // (feet: the foot a planted leg stands on stays where it is; checked on the pose's tips through the frames)
    const rig = gazamiRig();
    const root = new Group();
    const { bones } = createBones(rig, root);
    b.walk({ x: b.state.pos.x + 0.4, z: b.state.pos.z });
    run(b, 0.5);
    for (let i = 0; i < 90; i++) {
      b.update(1 / 60);
      applyPose(root, bones, rig, b.pose);
      root.scale.setScalar(CW / 0.1);
      root.updateMatrixWorld(true);
      for (const k of ['P2L', 'P3L', 'P4L', 'P2R', 'P3R', 'P4R']) {
        const leg = rig.legs.find((l) => `${l.id}${l.side}` === k)!;
        const tip = bones[`J_${k}_da`].localToWorld(new Vector3(leg.lengths[5] * 0.001, 0, 0));
        const old = prev.get(k);
        if (old && Math.abs(tip.y - ground(tip.x, tip.z)) < CW * 0.06 && Math.abs(old.y - ground(old.x, old.z)) < CW * 0.06) {
          stances++;
          if (old.distanceTo(tip) > CW * 0.08) slips++;
        }
        prev.set(k, tip);
      }
    }
    expect(stances).toBeGreaterThan(50);
    expect(slips / stances).toBeLessThan(0.15);
  });

  it('swims on its paddles with the walking legs tucked, between the bottom and the surface', () => {
    const b = make(9);
    b.swim({ x: -1.2, z: 0.2 });
    run(b, 1);
    const promos: number[] = [];
    let minAlt = 1, maxY = -1;
    run(b, 2.5, () => {
      promos.push(b.pose.legs.P5L.promo);
      minAlt = Math.min(minAlt, b.state.alt);
      maxY = Math.max(maxY, b.state.pos.y);
      if (b.state.mode === 'SWIM' && b.state.phase === 'cruise') {
        for (const k of ['P2L', 'P3L', 'P4R']) expect(b.pose.legs[k].mc).toBeLessThan(-1.1);
      }
    });
    expect(b.state.mode).toBe('SWIM');
    const mean = promos.reduce((a, c) => a + c, 0) / promos.length;
    const sd = Math.sqrt(promos.reduce((a, c) => a + (c - mean) ** 2, 0) / promos.length);
    // the paddles beat (several times a second, ± ≈ 0.4 rad)
    expect(sd).toBeGreaterThan(0.25);
    expect(minAlt).toBeGreaterThan(CW * 0.2);
    expect(maxY).toBeLessThan(0.4 - CW * 0.3);
    // sideways travel in the water too
    const f = fwd(b.state.heading), v = b.state.vel;
    expect(Math.abs(v.dot(f))).toBeLessThan(v.length() * 0.6);
  });

  it('cannot swim in water too shallow for it: it walks', () => {
    const b = make(2, { waterY: () => 0.03 });
    b.swim({ x: 0.5, z: 0 });
    expect(b.state.mode).toBe('WALK');
  });

  it('buries itself to the eyes, and not where there is nothing to dig into', () => {
    const b = make(11);
    b.burrow(30);
    run(b, 8);
    expect(b.state.phase).toBe('buried');
    expect(b.state.bury).toBeGreaterThan(0.8);
    expect(b.pose.lift).toBeLessThan(-10);
    expect(b.state.sandCoat).toBeGreaterThan(0.3);
    const c = make(11, { canBurrow: () => false });
    c.burrow(30);
    expect(c.state.mode).toBe('IDLE');
  });

  it('flees away from the danger, and bursts out of the sand to do it', () => {
    const b = make(13, {}, { startBuried: true });
    expect(b.state.bury).toBeGreaterThan(0.8);
    const danger = new Vector3(-0.15, 0, 0.05);
    b.escape(danger);
    const d0 = b.state.pos.distanceTo(danger);
    run(b, 1.5);
    expect(b.state.bury).toBeLessThan(0.2);
    expect(b.state.pos.distanceTo(danger)).toBeGreaterThan(d0 + CW * 3);
  });

  it('faces the danger with its claws raised and spread, the fingers open', () => {
    const b = make(17);
    const danger = new Vector3(0.3, 0, -0.2);
    b.defend(danger, 5);
    run(b, 2);
    const h = Math.atan2(danger.x - b.state.pos.x, danger.z - b.state.pos.z);
    let dh = Math.abs(h - b.state.heading) % (2 * Math.PI);
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    expect(dh).toBeLessThan(0.35);
    // the fingertips held high over the carapace (≈ 0.6 CW over the bottom), the fingers gaping
    const rig = gazamiRig();
    const root = new Group();
    const { bones } = createBones(rig, root);
    applyPose(root, bones, rig, b.pose);
    root.scale.setScalar(CW / 0.1);
    root.updateMatrixWorld(true);
    for (const s of ['L', 'R']) {
      const tip = bones[`J_P1${s}_da`].localToWorld(new Vector3(0.0275, 0, 0));
      expect(tip.y - b.state.pos.y).toBeGreaterThan(CW * 0.5);
    }
    expect(b.pose.legs.P1L.pd).toBeGreaterThan(0.25);
    expect(b.pose.lift).toBeGreaterThan(13);
    expect(b.pose.pitch).toBeGreaterThan(0.1);
  });

  it('stays in its tank', () => {
    const bounds = { minX: -0.2, maxX: 0.2, minZ: -0.15, maxZ: 0.15 };
    const b = make(19, { bounds: () => bounds });
    b.escape(new Vector3(-0.1, 0, 0));
    run(b, 3);
    b.swim({ x: 2, z: 2 });
    run(b, 3);
    expect(Math.abs(b.state.pos.x)).toBeLessThan(0.2);
    expect(Math.abs(b.state.pos.z)).toBeLessThan(0.15);
  });
});

describe('ガザミ: the look', () => {
  it('gives every individual its own look and the sexes their abdomen', () => {
    const a = lookSpecFor('portunus#1', 'm', 120), b = lookSpecFor('portunus#2', 'f', 30);
    expect(a.seed).not.toBe(b.seed);
    expect(b.juvenile).toBeGreaterThan(0.5);
    expect(b.sex).toBe(1);
    const look = new GazamiLook(b);
    expect(look.uniforms.uSex.value).toBe(1);
    const m = buildModel(look);
    expect(m.shells.length).toBe(3);
    expect(m.setae).not.toBeNull();
    // both abdomens are in the shell; the material keeps the individual's
    const flag = (m.shells[0] as Mesh).geometry.getAttribute('aAux');
    const flags = new Set<number>();
    for (let i = 0; i < flag.count; i++) flags.add(Math.round(flag.getY(i)));
    expect(flags.has(1) && flags.has(2)).toBe(true);
    disposeModel(m);
  });
});
