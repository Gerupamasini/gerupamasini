import { describe, expect, it } from 'vitest';
import { Group, Vector3, type Bone, type Mesh } from 'three';
import { ARMS, EYE, FIN, FUNNEL, HEAD_PROFILE, ML_MM, TENTACLE, Z_ROOT, armBase, bellyDepth, funnelSection, surfacePoint } from '../../src/creatures/species/mimiika/anatomy';
import { LODS, buildArms, buildBody, buildFin, buildFunnel, rigDefinition } from '../../src/creatures/species/mimiika/geometry';
import { createSquidBehavior, MODES, type Mode } from '../../src/creatures/species/mimiika/behavior';
import { applyPose } from '../../src/creatures/species/mimiika/rig';
import { buildModel, disposeModel } from '../../src/creatures/species/mimiika/model';
import { MimiikaLook } from '../../src/creatures/species/mimiika/materials';
import { lookSpecFor } from '../../src/creatures/species/mimiika/MimiikaDriver';
import { Rng } from '../../src/core/Rng';

/** a sandy bottom with low ripples under 30 cm of water */
const ground = (x: number, z: number) => 0.0011 * Math.sin((x * 0.8 + z * 0.6) / 0.052 * 2 * Math.PI) + 0.003 * Math.sin(x * 3.1) * Math.cos(z * 2.3);
const world = (extra: Record<string, unknown> = {}) => ({ ground, waterY: () => 0.3, ...extra });
const make = (seed = 3, extra: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) => {
  const r = new Rng(seed);
  return createSquidBehavior({ world: world(extra), rng: () => r.next(), scale: 1, start: { x: 0, z: 0, heading: 0 }, autonomous: false, ...opts });
};
const run = (b: ReturnType<typeof make>, seconds: number, each?: () => void) => { for (let i = 0; i < seconds * 60; i++) { b.update(1 / 60); each?.(); } };
const ML = ML_MM / 1000;

describe('ミミイカ: the body plan', () => {
  it('has the round, short mantle of a bobtail squid', () => {
    let top = 0, w = 0;
    for (let z = -24; z <= 0; z += 0.25) { top = Math.max(top, surfacePoint(z, 0)[1]); w = Math.max(w, surfacePoint(z, Math.PI / 2)[0]); }
    const depth = top - bellyDepth();
    expect(depth / ML_MM).toBeGreaterThan(0.65);
    expect(depth / ML_MM).toBeLessThan(0.85);
    expect((2 * w) / ML_MM).toBeGreaterThan(0.72);
    expect((2 * w) / ML_MM).toBeLessThan(0.9);
  });

  it('has very large eyes, arms shorter than the mantle, long tentacles and mid-mantle ear-like fins', () => {
    expect((2 * EYE.r) / ML_MM).toBeGreaterThan(0.24);
    for (const a of ARMS) expect(a.length / ML_MM).toBeLessThan(0.75);
    // the third pair is the longest
    const len = (p: number) => ARMS.find((a) => a.pair === p)!.length;
    expect(len(2)).toBeGreaterThan(len(0));
    expect(len(2)).toBeGreaterThan(len(3));
    expect(TENTACLE.length / ML_MM).toBeGreaterThan(0.75);
    // the fins sit on the middle of the mantle, their base under half its length
    expect(-FIN.z0 / ML_MM).toBeGreaterThan(0.25);
    expect(-FIN.z1 / ML_MM).toBeLessThan(0.85);
    expect((FIN.z0 - FIN.z1) / ML_MM).toBeLessThan(0.5);
    expect(ARMS.length).toBe(8);
  });

  it('builds outward-facing skin (the triangles wind round their normals)', () => {
    const rig = rigDefinition();
    const geos = [buildBody(rig, LODS[1]).mantle, buildBody(rig, LODS[1]).head, buildArms(rig, LODS[1]), buildFunnel(rig, LODS[0]), buildFunnel(rig, LODS[1])];
    for (const g of geos) {
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
    }
    const fin = buildFin(rig, LODS[0], 1);
    expect(fin.getAttribute('aFin').count).toBe(fin.getAttribute('position').count);
  });

  it('has a funnel that comes out from under the mantle and opens forward under the eyes', () => {
    // the opening: under the eye, about two fifths of its diameter across
    expect(FUNNEL.z1).toBeGreaterThan(EYE.z - EYE.r);
    expect(FUNNEL.z1).toBeLessThan(EYE.z + EYE.r);
    const tip = funnelSection(FUNNEL.z1);
    expect((2 * tip.a) / (2 * EYE.r)).toBeGreaterThan(0.3);
    expect((2 * tip.a) / (2 * EYE.r)).toBeLessThan(0.55);
    // in front of the mantle's edge it hangs well below the head's ventral surface (it shows from the side)
    for (const z of [0, 1, 2, FUNNEL.z1]) {
      const S = funnelSection(z);
      expect(S.yc - S.b, `z ${z}`).toBeLessThan(surfacePoint(z, Math.PI, HEAD_PROFILE)[1] - 1.2);
    }
    // under the mantle it stays inside the mantle's outer skin (the edge lies over it, nothing pokes through)
    const rig = rigDefinition();
    const f = buildFunnel(rig, LODS[0]), mantle = buildBody(rig, LODS[0]).mantle;
    const fp = f.getAttribute('position'), fs = f.getAttribute('aSkin');
    const mp = mantle.getAttribute('position'), ms = mantle.getAttribute('aSkin');
    const mm = (a: typeof fp, i: number) => [a.getX(i) * 1000, a.getY(i) * 1000, a.getZ(i) * 1000 + Z_ROOT];
    const outer: number[][] = [];
    for (let i = 0; i < mp.count; i++) { const q = mm(mp, i); if (ms.getY(i) === 0 && q[1] < -2) outer.push(q); }
    let checked = 0;
    for (let i = 0; i < fp.count; i++) {
      const q = mm(fp, i);
      if (fs.getZ(i) !== 0 || q[2] > FUNNEL.zOut - 0.4) continue;
      const near = outer.filter((o) => Math.abs(o[0] - q[0]) < 0.6 && Math.abs(o[2] - q[2]) < 0.6);
      if (!near.length) continue;
      checked++;
      expect(q[1], `funnel vertex at ${q.map((v) => v.toFixed(2))}`).toBeGreaterThan(Math.min(...near.map((o) => o[1])) + 0.05);
    }
    expect(checked).toBeGreaterThan(30);
    // and its opening is clear of the arms' bases and of the eyes
    for (const a of ARMS) {
      const B = armBase(a).pos;
      expect(Math.hypot(B[0], B[1] - tip.yc, B[2] - FUNNEL.z1), a.name).toBeGreaterThan(tip.b + a.rBase + 0.5);
    }
    expect(Math.hypot(EYE.x - tip.a, EYE.y - tip.yc, EYE.z - FUNNEL.z1)).toBeGreaterThan(EYE.r + 0.5);
  });

  it('is built as MimiIkaRoot with Mantle, Head, Eye_L/R, Fin_L/R, Arms, Tentacles in three tiers', () => {
    const m = buildModel(new MimiikaLook(lookSpecFor('squid#1')));
    expect(m.root.name).toBe('MimiIkaRoot');
    const names = new Set<string>();
    m.root.traverse((o) => names.add(o.name));
    for (const n of ['Mantle', 'Head', 'Eye_L', 'Eye_R', 'Fin_L', 'Fin_R', 'Arms', 'Tentacles', 'Funnel', 'Viscera', 'LOD0', 'LOD1', 'LOD2']) expect(names, n).toContain(n);
    const tris = (lvl: number) => {
      let t = 0;
      m.lod.levels[lvl].object.traverse((o) => { const g = (o as Mesh).geometry; if (g) t += (g.index ? g.index.count : g.getAttribute('position').count) / 3; });
      return t;
    };
    expect(tris(0)).toBeGreaterThan(tris(1) * 2.5);
    expect(tris(1)).toBeGreaterThan(tris(2) * 2.5);
    expect(tris(2)).toBeLessThan(2500);
    disposeModel(m);
  });
});

describe('ミミイカ: behaviour', () => {
  it('reaches all seven modes through its commands', () => {
    const seen = new Set<Mode>();
    const b = make(5);
    const step = (s: number) => run(b, s, () => seen.add(b.state.mode));
    b.rest(2); step(2);
    b.hover(3); step(3);
    b.swim({ x: 0.2, z: 0.1 }); step(4);
    b.crawl({ x: b.pos.x + 0.03, z: b.pos.z }); step(3);
    b.burrow(5); step(9);
    b.hunt(); step(4);
    b.escape(new Vector3(0.05, 0, 0)); step(1);
    for (const m of MODES) expect(seen, m).toContain(m);
  });

  it('hovers on its fins over the sand and swims on fin waves, faster when it travels', () => {
    const b = make(7);
    b.hover(10);
    let amp = 0;
    run(b, 4, () => { amp = Math.max(amp, b.pose.finAmp[0]); });
    const alt = b.state.alt;
    expect(alt).toBeGreaterThan(0.3 * ML);
    expect(alt).toBeLessThan(1.5 * ML);
    b.swim({ x: 0.4, z: 0 });
    let sp = 0, ph0 = b.pose.finPh[0];
    run(b, 3, () => { sp = Math.max(sp, Math.hypot(b.state.vel.x, b.state.vel.z)); });
    const rate = (b.pose.finPh[0] - ph0) / 3 / (2 * Math.PI);
    expect(sp).toBeGreaterThan(0.5 * ML);
    expect(rate).toBeGreaterThan(2);
    expect(b.pose.finAmp[0]).toBeGreaterThan(0.3);
  });

  it('buries: sinks, throws sand over its head with the dorsal arms, and keeps its eyes out', () => {
    const b = make(11);
    b.burrow(30);
    let raised = 0, sand = 0;
    const armI = ARMS.findIndex((a) => a.pair === 0);
    run(b, 12, () => {
      // arm I curled back over the head: the sum of its joint curls goes strongly negative
      let c = 0;
      for (let k = 0; k < 5; k++) c += b.pose.armCurl[armI * 5 + k];
      raised = Math.min(raised, c);
      sand += b.fx.filter((e) => e.kind === 'sand').length;
      b.fx.length = 0;
    });
    expect(b.state.phase).toBe('buried');
    expect(b.state.bury).toBeGreaterThan(0.9);
    expect(raised).toBeLessThan(-1.2);
    expect(sand).toBeGreaterThan(8);
    expect(b.pose.headCover).toBeGreaterThan(0.6);
    expect(b.pose.sandCoat).toBeGreaterThan(0.6);
    // the eyes' tops stay above the sand, the top of the mantle not far above it (it is covered)
    const m = buildModel(new MimiikaLook(lookSpecFor('squid#2')), [2]);
    applyPose(m.root, m.bones, b.pose);
    const g = ground(b.pos.x, b.pos.z);
    const eye = new Vector3();
    (m.bones.J_eye_L as Bone).getWorldPosition(eye);
    expect(eye.y + EYE.r / 1000 - g).toBeGreaterThan(0.001);
    const mantleTop = new Vector3(0, 9.88 / 1000, -4.5 / 1000).applyMatrix4(m.root.matrixWorld);
    expect(mantleTop.y - g).toBeLessThan(0.003);
    disposeModel(m);
  });

  it('escapes mantle first, away from the threat, with ink and jets, then lands', () => {
    const b = make(13);
    run(b, 1);
    const from = new Vector3(0.06, 0, 0);
    b.escape(from);
    let ink = 0, minMantle = 1, maxSpeed = 0;
    run(b, 1.2, () => {
      ink += b.fx.filter((e) => e.kind === 'ink').length; b.fx.length = 0;
      minMantle = Math.min(minMantle, b.pose.mantle);
      maxSpeed = Math.max(maxSpeed, Math.hypot(b.state.vel.x, b.state.vel.z));
    });
    expect(ink).toBeGreaterThan(0);
    expect(minMantle).toBeLessThan(0.86);
    expect(maxSpeed).toBeGreaterThan(8 * ML);
    // it went away from the threat, arms still facing it (mantle first)
    expect(b.pos.x).toBeLessThan(-0.05);
    const fwdX = Math.sin(b.state.heading);
    expect(fwdX).toBeGreaterThan(0.5);
    run(b, 6);
    expect(b.state.alt).toBeLessThan(0.2 * ML);
  });

  it('hunts: watches the mysid, shoots the tentacles out and eats it', () => {
    let caught = 0, struck = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const b = make(seed);
      run(b, 1);
      b.hunt();
      let ext = 0, wasCaught = false;
      run(b, 14, () => { ext = Math.max(ext, b.pose.ten[0].ext); if (b.prey?.state === 'caught') wasCaught = true; });
      if (ext > 0.4) struck++;
      if (wasCaught) caught++;
    }
    expect(struck).toBeGreaterThanOrEqual(4);
    expect(caught).toBeGreaterThanOrEqual(3);
  });

  it('ambushes from the sand without leaving it', () => {
    let struck = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const b = make(seed, {}, { startBuried: true });
      run(b, 0.5);
      b.hunt();
      let ext = 0, minBury = 1;
      run(b, 12, () => { ext = Math.max(ext, b.pose.ten[0].ext); minBury = Math.min(minBury, b.state.bury); });
      if (ext > 0.4) { struck++; expect(minBury).toBeGreaterThan(0.45); }
    }
    expect(struck).toBeGreaterThanOrEqual(3);
  });

  it('stays in the water and above the sand, and does not bury where there is no sand', () => {
    const shallow = make(17, { waterY: () => 0.03 });
    shallow.hover(5);
    run(shallow, 4);
    expect(shallow.pos.y + 0.009).toBeLessThan(0.03 + 1e-4);
    const tank = make(19, { canBurrow: () => false });
    tank.burrow(20);
    run(tank, 8);
    expect(tank.state.mode).not.toBe('BURROW');
    expect(tank.state.bury).toBeLessThan(0.05);
    // and a free-running animal never sinks into the sand when it is not burying
    const r = new Rng(23);
    const free = createSquidBehavior({ world: world(), rng: () => r.next(), scale: 1, start: { x: 0, z: 0 }, autonomous: true });
    run(free, 60, () => {
      if (free.state.bury < 0.05) expect(free.pos.y - ground(free.pos.x, free.pos.z)).toBeGreaterThan(0.005);
    });
  });

  it('changes colour: pale and glassy when it hovers, darker on a dark bottom, a flash when startled', () => {
    const b = make(29);
    b.rest(20);
    run(b, 3);
    const restB = b.pose.chroma.b;
    b.setSurroundings(1, false);
    run(b, 3);
    expect(b.pose.chroma.b).toBeGreaterThan(restB);
    b.hover(10);
    run(b, 4);
    expect(b.pose.chroma.pale).toBeGreaterThan(0.3);
    expect(b.pose.chroma.b).toBeLessThan(restB);
    b.escape(new Vector3(0, 0, 0.05));
    run(b, 0.06);
    expect(b.pose.chroma.b).toBeGreaterThan(0.6);
  });
});

describe('ミミイカ: the model in a scene', () => {
  it('poses without NaN and the arms follow their curls', () => {
    const m = buildModel(new MimiikaLook(lookSpecFor('squid#3')));
    new Group().add(m.root);
    const b = make(31);
    b.burrow(20);
    run(b, 6);
    applyPose(m.root, m.bones, b.pose);
    m.root.traverse((o) => { expect(Number.isFinite(o.matrixWorld.elements[12])).toBe(true); });
    disposeModel(m);
  });
});
