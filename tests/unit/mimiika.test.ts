import { describe, expect, it } from 'vitest';
import { Euler, Group, Quaternion, Vector3, type Bone, type BufferAttribute, type Mesh, type SkinnedMesh } from 'three';
import { ARMS, EYE, FIN, FUNNEL, HEAD_PROFILE, ML_MM, TENTACLE, Z_ROOT, armBase, bellyDepth, funnelSection, profileAt, surfacePoint, toModel } from '../../src/creatures/species/mimiika/anatomy';
import { LODS, buildArms, buildBody, buildFin, buildFunnel, rigDefinition } from '../../src/creatures/species/mimiika/geometry';
import { createSquidBehavior, MODES, type Mode } from '../../src/creatures/species/mimiika/behavior';
import { ARM_AIM_MAX, applyPose, armEyeGap, armExtOf, armJoints, armThin, armThinAt, armTip, emptyPose, type Pose } from '../../src/creatures/species/mimiika/rig';
import { buildModel, disposeModel, type MimiikaModel } from '../../src/creatures/species/mimiika/model';
import { MimiikaLook, sandGrain } from '../../src/creatures/species/mimiika/materials';
import { MimiikaDriver, lookSpecFor } from '../../src/creatures/species/mimiika/MimiikaDriver';
import { SandFX } from '../../src/creatures/species/akaei/SandFX';
import type { Individual } from '../../src/creatures/Individual';
import type { DriverContext } from '../../src/creatures/drivers/Driver';
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
    // the head's skin over the eyes' domes faces out of the eye (an inverted band there mirrored the surroundings)
    for (const t of [LODS[0], LODS[1]]) {
      const h = buildBody(rig, t).head, hp = h.getAttribute('position'), hn = h.getAttribute('normal');
      let near = 0;
      for (let i = 0; i < hp.count; i++) {
        const q = new Vector3(hp.getX(i) * 1000, hp.getY(i) * 1000, hp.getZ(i) * 1000 + Z_ROOT);
        const C = new Vector3(EYE.x * Math.sign(q.x || 1), EYE.y, EYE.z);
        if (q.distanceTo(C) > EYE.r + EYE.skin + 2 * EYE.fillet) continue;
        near++;
        expect(new Vector3(hn.getX(i), hn.getY(i), hn.getZ(i)).dot(q.sub(C)), `head vertex near the eye`).toBeGreaterThan(0);
      }
      expect(near).toBeGreaterThan(100);
    }
    const fin = buildFin(rig, LODS[0], 1);
    expect(fin.getAttribute('aFin').count).toBe(fin.getAttribute('position').count);
  });

  it('has globe eyes standing out of the head under tight lid skin, the ball never through it', () => {
    // the globe ≈ 0.29 ML across, its top above the head's dorsal midline (the two humps of a front view)
    expect((2 * (EYE.r + EYE.skin)) / ML_MM).toBeGreaterThan(0.26);
    expect((2 * (EYE.r + EYE.skin)) / ML_MM).toBeLessThan(0.32);
    expect(EYE.y + EYE.r + EYE.skin).toBeGreaterThan(surfacePoint(EYE.z, 0, HEAD_PROFILE)[1] + 0.3);
    // the skin over the dome is a sphere just round the ball (projected from deep inside the head, so its facets are small)
    const rig = rigDefinition();
    const d0 = buildBody(rig, LODS[0]).domeMin, d1 = buildBody(rig, LODS[1]).domeMin;
    expect(d0).toBeGreaterThan(EYE.r + 0.02);
    expect(d0).toBeLessThan(EYE.r + EYE.skin + 0.01);
    expect(d1).toBeGreaterThan(EYE.r - 0.4);
    // a point of the head at the opening's axis lies on the dome
    const g = new Vector3(...EYE.gaze).normalize();
    const onAxis = surfacePoint(EYE.z + g.z * 3, Math.atan2(EYE.x + g.x * 3, EYE.y + g.y * 3), HEAD_PROFILE);
    expect(Math.hypot(onAxis[0] - EYE.x, onAxis[1] - EYE.y, onAxis[2] - EYE.z)).toBeCloseTo(EYE.r + EYE.skin, 1);
  });

  it('has a funnel that comes out from under the mantle and opens forward under the eyes', () => {
    // the opening: under the eye, about 0.45 of its dome across (29: outer 3.2 mm)
    expect(FUNNEL.z1).toBeGreaterThan(EYE.z - EYE.r);
    expect(FUNNEL.z1).toBeLessThan(EYE.z + EYE.r);
    const tip = funnelSection(FUNNEL.z1), dome = 2 * (EYE.r + EYE.skin);
    expect((2 * tip.a) / dome).toBeGreaterThan(0.4);
    expect((2 * tip.a) / dome).toBeLessThan(0.55);
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
    // the bore about half the mouth across inside a thick lip (29: outer 3.2, bore 1.6 mm; 20: bore 0.51-0.56 of it)
    expect((2 * (tip.a - FUNNEL.lip)) / dome).toBeGreaterThan(0.2);
    expect((2 * (tip.a - FUNNEL.lip)) / dome).toBeLessThan(0.3);
    // the head's skin (in its funnel groove) never shows inside the bore: it stays above the bore's dorsal half
    const headY = (x: number, z: number) => {
      let lo = Math.PI / 2, hi = Math.PI;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (surfacePoint(z, m, HEAD_PROFILE)[0] > x) lo = m; else hi = m; }
      return surfacePoint(z, (lo + hi) / 2, HEAD_PROFILE)[1];
    };
    let bore = 0;
    for (let i = 0; i < fp.count; i++) {
      const q = mm(fp, i);
      if (fs.getZ(i) !== 2 || fs.getY(i) < 0.6 || Math.abs(q[0]) < 0.05) continue;
      bore++;
      expect(headY(Math.abs(q[0]), q[2]), `bore vertex ${q.map((v) => v.toFixed(2))}`).toBeGreaterThan(q[1]);
    }
    expect(bore).toBeGreaterThan(8);
    // the mantle's edge lies over the funnel without cutting it: its lining stays under the tube where they overlap
    let lin = 0;
    for (let i = 0; i < mp.count; i++) {
      const q = mm(mp, i);
      if (ms.getY(i) !== 1 || q[2] < FUNNEL.zOut - 1.2 || q[1] > -2) continue;
      const S = funnelSection(q[2]);
      if (Math.abs(q[0]) > S.a * 0.95) continue;
      lin++;
      expect(q[1], `lining vertex ${q.map((v) => v.toFixed(2))}`).toBeLessThan(S.yc - S.b * Math.sqrt(1 - (q[0] / S.a) ** 2) + 0.02);
    }
    expect(lin).toBeGreaterThan(4);
    // and its opening is clear of the arms' bases and of the eyes
    for (const a of ARMS) {
      const B = armBase(a).pos;
      expect(Math.hypot(B[0], B[1] - tip.yc, B[2] - FUNNEL.z1), a.name).toBeGreaterThan(tip.b + a.rBase + 0.5);
    }
    expect(Math.hypot(EYE.x - tip.a, EYE.y - tip.yc, EYE.z - FUNNEL.z1)).toBeGreaterThan(EYE.r + 0.5);
  });

  it('swings its funnel aside up the flank as it rests, the mouth under the back of the eye (20, 29)', () => {
    const m = buildModel(new MimiikaLook(lookSpecFor('squid#4')), [0]);
    const rig = rigDefinition();
    const P = emptyPose();
    // the mouth's centre at rest, carried by the tip's bone
    const S = funnelSection(FUNNEL.z1);
    const rest = new Vector3(0, S.yc / 1000, (FUNNEL.z1 - Z_ROOT) / 1000);
    const tipBone = rig.byName.J_funnelTip;
    for (const side of [1, -1]) {
      P.funnelSide = side;
      applyPose(m.root, m.bones, P);
      const b = m.bones.J_funnelTip;
      const q = rest.clone().applyMatrix4(rig.defs[tipBone].inverse).applyMatrix4(m.root.matrixWorld.clone().invert().multiply(b.matrixWorld));
      const mm = [q.x * 1000, q.y * 1000, q.z * 1000 + Z_ROOT];
      // on the flank (not hanging under the chin), level with the lower part of the head, in front of the mantle's margin
      expect(mm[0] * side, `side ${side}: ${mm.map((v) => v.toFixed(2))}`).toBeGreaterThan(3.6);
      expect(mm[0] * side).toBeLessThan(5.4);
      expect(mm[1]).toBeGreaterThan(-4.2);
      expect(mm[1]).toBeLessThan(-2.4);
      expect(mm[2]).toBeGreaterThan(-1.2);
      expect(mm[2]).toBeLessThan(1.6);
    }
    disposeModel(m);
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

describe('ミミイカ: burying (settle, jets, arm II strokes, buried, out again)', () => {
  const flat = (extra: Record<string, unknown> = {}) => ({ ground: () => 0, waterY: () => 0.3, ...extra });
  const IIL = ARMS.findIndex((a) => a.name === 'IIL'), IIR = ARMS.findIndex((a) => a.name === 'IIR');
  const shownPitch = (q: Quaternion) => -new Euler().setFromQuaternion(q, 'YXZ').x;
  const PATTERNS = ['FBFB', 'BFB', 'FBFBFB', 'FBBFB'];
  const T = 60;
  interface Frame {
    phase: string; mode: string; t: number; bury: number; pitch: number; shown: number; roll: number; funnelYaw: number; funnelSide: number;
    fold: number; amp: number; mantle: number; sc: number; hc: number; stroke: { k: number; u: number; dir: string } | null;
    ext: number[]; aimW: number[]; tipL: Vector3; tipR: Vector3; gap: number; J: Vector3[]; tips: Vector3[];
    fx: { pos: Vector3; count: number }[]; pos: Vector3; quat: Quaternion; heading: number;
    /** each arm's highest joint and the crown's underside over the sand (model mm) */
    top: number[]; crown: number;
  }
  /** the crown's underside, root frame (model mm) */
  const CROWN_UNDER = new Vector3(0, -2.7, 15.4);
  const _j: Vector3[] = [];
  /** a burial on flat sand (heading 0.4), recorded every frame */
  function burial(seed: number, K = 1, secs = 30, before?: (b: ReturnType<typeof createSquidBehavior>) => void) {
    const r = new Rng(seed);
    const b = createSquidBehavior({ world: flat(), rng: () => r.next(), scale: K, start: { x: 0, z: 0, heading: 0.4 }, autonomous: false });
    b.update(1 / T);
    b.burrow(60);
    const F: Frame[] = [];
    for (let i = 0; i < secs * T; i++) {
      before?.(b);
      b.update(1 / T);
      const st = b.state, P = b.pose;
      F.push({
        phase: st.phase, mode: st.mode, t: st.t, bury: st.bury, pitch: st.pitch, shown: shownPitch(P.quat), roll: st.roll, funnelYaw: P.funnelYaw, funnelSide: P.funnelSide,
        fold: Math.max(P.finFold[0], P.finFold[1]), amp: Math.max(P.finAmp[0], P.finAmp[1]), mantle: P.mantle, sc: st.sandCoat, hc: st.headCover,
        stroke: st.stroke ? { ...st.stroke } : null, ext: [...P.armExt], aimW: [...P.armAimW],
        tipL: armTip(P, IIL, new Vector3()), tipR: armTip(P, IIR, new Vector3()), gap: P.armAimW[IIL] > 0 ? Math.min(armEyeGap(P, IIL), armEyeGap(P, IIR)) : 9,
        J: armJoints(P, IIL, []).map((v) => v.clone()), tips: ARMS.map((_, i) => armTip(P, i, new Vector3())),
        fx: b.fx.flatMap((e) => (e.kind === 'sand' ? [{ pos: e.pos.clone(), count: e.count }] : [])), pos: st.pos.clone(), quat: P.quat.clone(), heading: st.heading,
        top: ARMS.map((_, n) => Math.max(...armJoints(P, n, _j).map((v) => v.clone().multiplyScalar(0.001 * K).applyQuaternion(P.quat).add(st.pos).y / (0.001 * K)))),
        crown: CROWN_UNDER.clone().multiplyScalar(0.001 * K).applyQuaternion(P.quat).add(st.pos).y / (0.001 * K),
      });
      b.fx.length = 0;
    }
    return { b, F, plan: b.state.plan!, K };
  }
  /** a point of the root's frame (model mm) in the world, in model mm (the sand is at 0) */
  const world = (f: Frame, p: Vector3, K: number) => p.clone().multiplyScalar(0.001 * K).applyQuaternion(f.quat).add(f.pos).multiplyScalar(1000 / K);
  const fwdOf = (f: Frame) => new Vector3(Math.sin(f.heading), 0, Math.cos(f.heading));
  const leftOf = (f: Frame) => new Vector3(Math.cos(f.heading), 0, -Math.sin(f.heading));
  const first = (F: Frame[], p: string) => F.findIndex((f) => f.phase === p);
  let cache: ReturnType<typeof burial>[] | null = null;
  const all = () => (cache ??= Array.from({ length: 20 }, (_, i) => burial(i + 1)));

  it('settles, blows, (pauses,) strokes and lies buried, in a bobtail\'s time; the draws are in st.plan', () => {
    const counts = new Set<number>();
    for (const { F, plan } of all()) {
      const seq = F.map((f) => f.phase).filter((p, i, a) => i === 0 || p !== a[i - 1]);
      expect(seq).toEqual(plan.gap > 0 ? ['settle', 'blow', 'gap', 'sweep', 'buried'] : ['settle', 'blow', 'sweep', 'buried']);
      const at = (p: string) => first(F, p) / T;
      expect(at('blow')).toBeGreaterThan(0.99);
      expect(at('blow')).toBeLessThan(2.55);
      const blow = (plan.gap > 0 ? at('gap') : at('sweep')) - at('blow');
      expect(blow).toBeCloseTo(plan.blow, 1);
      expect(blow).toBeGreaterThan(3.4);
      expect(blow).toBeLessThan(9.2);
      if (plan.gap > 0) { expect(at('sweep') - at('gap')).toBeLessThan(1.05); expect(plan.gap).toBeGreaterThan(0.19); }
      const sweep = at('buried') - at('sweep');
      expect(sweep).toBeGreaterThan(0.3 + 4 * 1.1 - 0.05);
      expect(sweep).toBeLessThan(0.3 + 8 * 1.6 + 0.05);
      // (S. parva 16–42 s; ミミイカ 「あっという間」: about 12–26 s here)
      expect(at('buried')).toBeLessThan(26);
      // J1 backward, a pause, then one of the runs; 4, 6 or 8 strokes of 1.1–1.6 s
      expect(plan.jets[0]).toBe('B');
      expect(PATTERNS).toContain(plan.jets.slice(1).join(''));
      expect(plan.jetT[0]).toBeCloseTo(0.15, 9);
      expect(plan.jetT[1] - plan.jetT[0]).toBeGreaterThanOrEqual(0.8);
      expect(plan.jetT[1] - plan.jetT[0]).toBeLessThanOrEqual(1.3);
      for (let j = 2; j < plan.jets.length; j++) { expect(plan.jetT[j] - plan.jetT[j - 1]).toBeGreaterThanOrEqual(0.9); expect(plan.jetT[j] - plan.jetT[j - 1]).toBeLessThanOrEqual(1.4); }
      expect(plan.blow).toBeCloseTo(plan.jetT[plan.jets.length - 1] + 0.7, 9);
      expect([4, 6, 8]).toContain(plan.strokes);
      for (const d of plan.strokeT) { expect(d).toBeGreaterThanOrEqual(1.1); expect(d).toBeLessThanOrEqual(1.6); }
      counts.add(plan.strokes);
    }
    expect(counts.size).toBeGreaterThan(1);
  }, 60000);

  it('jets backward and forward along its axis: a mantle squeeze each, sand behind or in front, the body tipping with each', () => {
    for (const { F, plan, K } of all()) {
      const blow = F.filter((f) => f.phase === 'blow');
      let dips = 0;
      blow.forEach((f, i) => { if (f.mantle < 0.95 && (i === 0 || blow[i - 1].mantle >= 0.95)) dips++; });
      expect(dips).toBe(plan.jets.length);
      for (const f of blow) {
        if (!f.fx.length) continue;
        let j = 0;
        while (j < plan.jets.length - 1 && plan.jetT[j + 1] <= f.t + 1e-9) j++;
        for (const e of f.fx) {
          const d = e.pos.clone().sub(f.pos).dot(fwdOf(f)) / (0.001 * K);
          if (plan.jets[j] === 'B') expect(d, `jet ${j} B`).toBeLessThan(-5);
          else expect(d, `jet ${j} F`).toBeGreaterThan(10);
        }
      }
      // no jet to the sides, no rocking (the funnel along the axis, the body level on flat sand)
      for (const f of F) if (f.mode === 'BURROW') { expect(Math.abs(f.funnelYaw)).toBeLessThan(0.02); expect(Math.abs(f.roll)).toBeLessThan(0.01); }
      // the tip over the damped pitch shows in the pose: the tail down with a backward jet, the head with a forward one
      plan.jets.forEach((d, j) => {
        const w = blow.filter((f) => f.t > plan.jetT[j] && f.t <= plan.jetT[j] + 0.3).map((f) => f.shown - f.pitch);
        if (d === 'B') expect(Math.max(...w), `B jet ${j}`).toBeGreaterThan(0.03);
        else expect(Math.min(...w), `F jet ${j}`).toBeLessThan(-0.02);
      });
    }
  }, 60000);

  it('sinks a step with each jet to three quarters, then all the way as it strokes, never rising', () => {
    for (const { F, plan } of all()) {
      const blow = F.filter((f) => f.phase === 'blow');
      const at = (t: number) => blow.find((f) => f.t >= t) ?? blow[blow.length - 1];
      expect(at(plan.jetT[0] + 0.6).bury).toBeGreaterThan(0.13);
      const end = blow[blow.length - 1].bury;
      expect(end).toBeGreaterThan(0.7);
      expect(end).toBeLessThan(0.8);
      // stepped: most of each jet's sinking within 0.6 s of it
      plan.jets.forEach((_, j) => {
        const next = j + 1 < plan.jets.length ? plan.jetT[j + 1] : plan.blow;
        const all = at(next).bury - at(plan.jetT[j]).bury, soon = at(plan.jetT[j] + 0.6).bury - at(plan.jetT[j]).bury;
        expect(soon, `jet ${j}`).toBeGreaterThan(0.75 * all);
      });
      for (let i = 1; i < F.length; i++) if (F[i].mode === 'BURROW') expect(F[i].bury).toBeGreaterThan(F[i - 1].bury - 1e-3);
      const b = first(F, 'buried');
      expect(F[b + 3 * T].bury).toBeGreaterThan(0.97);
    }
  }, 60000);

  it('keeps its fins pressed flat (a mild beat against the first jet only)', () => {
    for (const { F, plan } of all()) {
      const b0 = first(F, 'blow');
      const beat = F.filter((f) => f.phase === 'blow' && f.t > plan.jetT[0] && f.t < plan.jetT[0] + 0.4);
      expect(Math.max(...beat.map((f) => f.amp))).toBeGreaterThan(0.1);
      expect(Math.max(...beat.map((f) => f.amp))).toBeLessThan(0.35);
      for (const f of F.slice(b0 + 1.2 * T)) { expect(f.fold).toBeLessThan(-0.85); expect(f.amp).toBeLessThan(0.06); }
    }
  }, 60000);

  it('strokes with arm pair II alone, both arms in exact mirror sync, stretched to twice their length once a stroke', () => {
    for (const { F, plan } of all()) {
      const b0 = first(F, 'blow');
      let armed = true, peaks = 0;
      const peak = new Map<number, number>();
      F.forEach((f, i) => {
        if (f.phase === 'sweep') {
          ARMS.forEach((a, n) => { if (a.pair !== 1) { expect(f.aimW[n]).toBe(0); expect(f.ext[n]).toBe(1); } });
          if (f.stroke && f.stroke.u >= 0.05) { expect(f.aimW[IIL]).toBeGreaterThan(0.95); }
          if (f.stroke) peak.set(f.stroke.k, Math.max(peak.get(f.stroke.k) ?? 0, f.ext[IIL]));
        }
        if (f.ext[IIL] < 1.6) armed = true;
        if (armed && f.ext[IIL] > 1.9) { peaks++; armed = false; }
        // L and R the same, mirrored (from the first jet on: the pair's own small motions taken over)
        if (i > b0) {
          expect(f.ext[IIR]).toBe(f.ext[IIL]);
          expect(f.aimW[IIR]).toBe(f.aimW[IIL]);
          expect(f.tipL.clone().setX(-f.tipL.x).distanceTo(f.tipR)).toBeLessThan(0.05);
        }
      });
      expect(peaks).toBe(plan.strokes);
      expect(peak.size).toBe(plan.strokes);
      for (const v of peak.values()) { expect(v).toBeGreaterThan(1.9); expect(v).toBeLessThan(2.1); }
    }
  }, 60000);

  it('reaches out low over the sand (forward, 45°, sideways, back and out), and arches back over the head, clear of the eyes', () => {
    const AZ: Record<string, [number, number]> = { F: [0, 20], FL: [35, 60], L: [70, 100], BL: [105, 135] };
    const headTop = new Vector3(0, surfacePoint(0.6, 0, HEAD_PROFILE)[1], 0.6 - Z_ROOT), backTop = new Vector3(0, surfacePoint(-4.5, 0)[1], -4.5 - Z_ROOT);
    for (const { F, plan, K } of all()) {
      for (let k = 0; k < plan.strokes; k++) {
        const S = F.filter((f) => f.phase === 'sweep' && f.stroke?.k === k);
        const dir = S[0].stroke!.dir;
        expect(dir).toBe(['F', 'FL', 'L', 'BL'][k % 4]);
        // the scoop: the tip on the sand, about 1.1 ML out from the crown
        const sc = S.find((f) => f.stroke!.u >= 0.36)!;
        const tip = world(sc, sc.tipL, K), crown = world(sc, new Vector3(2.1, 0.35, 14.8), K);
        expect(tip.y, `stroke ${k} tip height`).toBeGreaterThan(-2.5);
        expect(tip.y).toBeLessThan(1.0);
        const d = tip.clone().sub(crown).setY(0);
        expect(d.length(), `stroke ${k} reach`).toBeGreaterThan(24);
        expect(d.length()).toBeLessThan(31);
        const base = world(sc, sc.J[0], K), v = tip.clone().sub(base);
        const az = (Math.atan2(v.dot(leftOf(sc)), v.dot(fwdOf(sc))) * 180) / Math.PI;
        expect(az, `stroke ${k} ${dir} azimuth`).toBeGreaterThan(AZ[dir][0]);
        expect(az).toBeLessThan(AZ[dir][1]);
        // over the head (forward strokes) or the front of the back (the others), the tips in and down above it
        const ar = S.find((f) => f.stroke!.u >= 0.76)!;
        const to = dir === 'F' || dir === 'FL' ? headTop : backTop;
        expect(Math.hypot(ar.tipL.x - to.x, ar.tipL.z - to.z), `stroke ${k} over the ${to === headTop ? 'head' : 'back'}`).toBeLessThan(5.5);
        expect(ar.tipL.y - to.y).toBeGreaterThan(to === headTop ? 2.5 : 1.5);
        expect(ar.tipL.y - to.y).toBeLessThan(to === headTop ? 6 : 5.5);
        // the arch's top about an eye's height over the eyes
        const apex = Math.max(...S.filter((f) => f.stroke!.u > 0.6 && f.stroke!.u < 0.9).flatMap((f) => f.J.map((p) => world(f, p, K).y)));
        expect(apex, `stroke ${k} apex`).toBeGreaterThan(8);
        expect(apex).toBeLessThan(13.5);
      }
      for (const f of F) {
        // the arm's skin stays clear of the eyes' domes; the tips never cross the midline
        expect(f.gap).toBeGreaterThan(0.3);
        if (f.phase === 'sweep') expect(f.tipL.x).toBeGreaterThan(0.5);
      }
    }
  }, 60000);

  it('is coated as it buries: falling grains on the back from the jets, then the head from the forward strokes, the back from the others', () => {
    for (const { F, plan } of all()) {
      const blowEnd = F[first(F, plan.gap > 0 ? 'gap' : 'sweep') - 1];
      expect(blowEnd.sc).toBeGreaterThan(0.15);
      expect(blowEnd.sc).toBeLessThan(0.35);
      expect(F.filter((f) => f.phase === 'blow').every((f) => f.hc === 0)).toBe(true);
      const sw = F.filter((f) => f.phase === 'sweep' && f.stroke);
      for (let i = 1; i < sw.length; i++) {
        const dh = sw[i].hc - sw[i - 1].hc;
        expect(Math.abs(dh)).toBeLessThan(0.03);
        if (Math.abs(dh) > 1e-12) { expect(sw[i].stroke!.u).toBeGreaterThan(0.57); expect(sw[i - 1].stroke!.u).toBeLessThan(0.93); }
      }
      for (let k = 0; k < plan.strokes; k++) {
        const S = sw.filter((f) => f.stroke!.k === k), a = S[0], z = S[S.length - 1];
        if (z.hc > 0.999 || z.sc > 0.999) continue;
        const head = a.stroke!.dir === 'F' || a.stroke!.dir === 'FL';
        if (head) expect(z.hc - a.hc, `stroke ${k}`).toBeGreaterThan(z.sc - a.sc);
        else expect(z.sc - a.sc, `stroke ${k}`).toBeGreaterThan(z.hc - a.hc);
      }
      // (× 8 / n: about as much cover whatever the number of strokes), made up to the full coat in 1.5 s
      const b = first(F, 'buried');
      expect(F[b - 1].hc).toBeGreaterThan(0.75);
      expect(F[b + 1.5 * T].hc).toBeGreaterThanOrEqual(0.85);
      expect(F[b + 1.5 * T].sc).toBeGreaterThanOrEqual(0.9);
    }
  }, 60000);

  it('lies buried with only the eyes out, pupils turned up, the mantle still, the funnel to one side, every arm under the sand', () => {
    for (const seed of [2, 5, 9]) {
      const { b, F, K } = burial(seed, 1, 26);
      const i = first(F, 'buried');
      // (1 s in: arm II has blended back)
      for (const p of F[i + T].tips) expect(world(F[i + T], p, K).y).toBeLessThan(0.5);
      expect(F[i + T].aimW[IIL]).toBeLessThan(0.01);
      const still = F.slice(i + 3 * T, i + 5 * T);
      for (const f of still) { expect(Math.abs(f.mantle - 1)).toBeLessThan(0.002); expect(Math.abs(f.funnelSide)).toBeGreaterThan(0.9); }
      expect(b.state.phase).toBe('buried');
      expect(b.pose.gazeUp).toBeGreaterThan(0.35);
      expect(b.pose.eyes[0].y).toBeGreaterThan(EYE.gaze[1] + 0.2);
      const m = buildModel(new MimiikaLook(lookSpecFor('squid#2')), [2]);
      applyPose(m.root, m.bones, b.pose);
      const eye = new Vector3();
      (m.bones.J_eye_L as Bone).getWorldPosition(eye);
      expect(eye.y + EYE.r / 1000).toBeGreaterThan(0.001);
      expect(new Vector3(0, 9.88 / 1000, -4.5 / 1000).applyMatrix4(m.root.matrixWorld).y).toBeLessThan(0.003);
      disposeModel(m);
    }
  }, 60000);

  it('keeps its arms folded down under the head through the jets and the strokes (no legs), the head coming up only as it goes in', () => {
    const I = ARMS.flatMap((a, n) => (a.pair === 0 ? [n] : [])), notII = ARMS.flatMap((a, n) => (a.pair !== 1 ? [n] : []));
    for (const { F, plan } of all()) {
      for (const f of F) {
        if ((f.phase === 'blow' && f.t > plan.jetT[0] + 0.4) || f.phase === 'gap') {
          // braced on the sand in front of the crown (40–42): no tip over the crown's underside, no arm arched up off
          // the sand, the crown down near the sand
          expect(Math.max(...f.tips.map((p) => world(f, p, 1).y)) - f.crown, 'a tip raised in the jets').toBeLessThan(1.0);
          expect(Math.max(...f.top) - f.crown, 'an arm arched up in the jets').toBeLessThan(4.0);
          expect(f.crown).toBeLessThan(6.5);
        }
        // (head-up only as deep as it is: not tipped up on its arms from the first jet)
        if (f.phase === 'blow' && f.bury < 0.3) expect(f.pitch).toBeLessThan(0.15);
        if (f.phase === 'sweep') {
          // arms I do not stand up between the eyes, and the bracing arms stay down
          expect(Math.max(...I.map((n) => f.top[n]))).toBeLessThan(3.6);
          expect(Math.max(...notII.map((n) => world(f, f.tips[n], 1).y))).toBeLessThan(1.5);
        }
      }
      // buried, no part of any arm stands up out of the sand in front of the head (16): every joint under it
      const b = first(F, 'buried');
      for (const f of F.slice(b + 1.5 * T, b + 3 * T)) expect(Math.max(...f.top)).toBeLessThan(-0.4);
    }
  }, 60000);

  it('leaves the sand however deep it is: nothing else keeps it sunk (an escape in the jets, a rise cut short, a night shed)', () => {
    const sit = (b: ReturnType<typeof createSquidBehavior>) => b.pos.y - b.state.alt - 0.00875;
    // fled while the jets had it a third in, it lands out of the sand whichever way it lands (or starts a new burial)
    let landedOut = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = new Rng(seed);
      const b = createSquidBehavior({ world: flat(), rng: () => r.next(), scale: 1, start: { x: 0, z: 0 }, autonomous: false });
      b.burrow(60);
      let hit = false;
      for (let i = 0; i < 15 * T && !hit; i++) { b.update(1 / T); hit = b.state.phase === 'blow' && b.state.bury > 0.3 && b.state.bury <= 0.4; }
      if (!hit) continue;
      b.escape(new Vector3(0.05, 0, 0));
      expect(b.state.buryGoal).toBe(0);
      while (b.state.mode === 'ESCAPE') b.update(1 / T);
      for (let i = 0; i < 4 * T && b.state.mode !== 'BURROW'; i++) b.update(1 / T);
      if (b.state.mode !== 'BURROW') { landedOut++; expect(b.state.bury).toBeLessThan(1e-3); expect(Math.abs(sit(b))).toBeLessThan(1e-5); }
    }
    expect(landedOut).toBeGreaterThan(0);
    // cut short as it rises, it is right out of the sand in whatever it does next
    for (const seed of [5, 7]) for (const cut of ['hunt', 'rest', 'freeze', 'escape'] as const) {
      const r = new Rng(seed);
      const b = createSquidBehavior({ world: flat(), rng: () => r.next(), scale: 1, start: { x: 0, z: 0 }, autonomous: false, startBuried: true });
      b.update(1 / T);
      b.hover(10);
      while (!(b.state.phase === 'emerge' && b.state.bury < 0.26)) b.update(1 / T);
      if (cut === 'escape') b.escape(new Vector3(0.05, 0, 0)); else b[cut]();
      for (let i = 0; i < 6 * T && b.state.mode !== 'BURROW'; i++) b.update(1 / T);
      if (b.state.mode !== 'BURROW') { expect(b.state.bury, `${seed} ${cut}`).toBeLessThan(1e-3); expect(b.state.buryGoal).toBe(0); }
    }
    // the night shed: once it is off the bottom, not a trace of the burial left
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = new Rng(seed);
      const b = createSquidBehavior({ world: flat(), rng: () => r.next(), scale: 1, start: { x: 0, z: 0 }, autonomous: false, startBuried: true });
      b.setSurroundings(0.3, true);
      b.hover(8);
      for (let i = 0; i < 6 * T; i++) b.update(1 / T);
      expect(b.state.mode).toBe('HOVER');
      expect(b.state.buryGoal).toBe(0);
      expect(b.pose.bury).toBeLessThan(1e-6);
    }
    // an ambush in the sand cut short by a hover: it rises slowly with its coat (it does not pop out, nor hang sunk)
    const a = make(9, {}, { startBuried: true });
    run(a, 0.5);
    a.hunt();
    run(a, 1);
    expect(a.state.phase).toBe('ambush');
    a.hover(6);
    expect(a.state.mode).toBe('BURROW');
    expect(a.state.phase).toBe('emerge');
    run(a, 4);
    expect(a.state.mode).toBe('HOVER');
    expect(a.state.bury).toBeLessThan(1e-3);
  }, 60000);

  it('stays in the sand when asked to burrow, rest or keep still while it ambushes from it, and lies buried that long after', () => {
    for (const ask of ['burrow', 'rest', 'freeze'] as const) for (const seed of [11, 12, 13]) {
      const b = make(seed, {}, { startBuried: true });
      run(b, 0.5);
      b.hunt();
      run(b, 2);
      expect(b.state.mode).toBe('HUNT');
      b[ask](60);
      // (the hunt goes on from the sand: not out and in again)
      expect(b.state.mode).toBe('HUNT');
      let minBury = 1, settle = false, t = 0;
      while (b.state.mode === 'HUNT' && t < 20) { b.update(1 / 60); t += 1 / 60; minBury = Math.min(minBury, b.state.bury); if (b.state.phase === 'settle') settle = true; }
      expect(settle).toBe(false);
      expect(minBury, `${ask} ${seed}`).toBeGreaterThan(0.5);
      expect(b.state.mode).toBe('BURROW');
      expect(b.state.phase).toBe('buried');
      // (the request is still running: not settled until it has lain there as long as it was asked)
      expect(b.state.dur).toBeGreaterThanOrEqual(60);
      expect(b.settled).toBe(false);
    }
  }, 60000);

  it('comes out slowly: by day with its coat on, at night dropping it on the bottom before it moves off', () => {
    const buried = (seed: number, night: boolean) => {
      const r = new Rng(seed);
      const b = createSquidBehavior({ world: flat(), rng: () => r.next(), scale: 1, start: { x: 0, z: 0 }, autonomous: false, startBuried: true });
      b.setSurroundings(0.3, night);
      run(b, 2);
      b.fx.length = 0;
      return b;
    };
    for (const night of [false, true]) {
      for (const seed of [1, 2, 3]) {
        const b = buried(seed, night);
        expect(b.state.plan).toBeNull();
        b.hover(10);
        expect(b.state.phase).toBe('emerge');
        let t = 0, bury = b.state.bury, sheds = 0, lastT = -1, shedT = -1, coatAtShed = 1;
        const dur = b.state.dur;
        while (b.state.mode === 'BURROW' && t < 5) {
          // (the driver asks again every frame where there is no sand: only the command waiting changes)
          b.hover(6);
          b.update(1 / T); t += 1 / T;
          if (b.state.mode === 'BURROW') { expect(b.state.dur).toBe(dur); expect(b.state.t).toBeGreaterThan(lastT); lastT = b.state.t; }
          expect(b.state.bury).toBeLessThan(bury + 1e-9);
          bury = b.state.bury;
          for (const e of b.fx) if (e.kind === 'sand' && e.count >= 12) { sheds++; shedT = t; coatAtShed = b.state.bury; }
          b.fx.length = 0;
          if (shedT < 0) expect(b.state.sandCoat).toBeGreaterThan(0.8);
          else if (t > shedT + 0.25) expect(b.state.sandCoat).toBeLessThan(0.05);
        }
        expect(b.state.mode).toBe('HOVER');
        expect(t).toBeGreaterThan(1.3);
        if (night) {
          expect(t).toBeLessThan(3.3);
          expect(sheds).toBe(1);
          expect(b.state.shedAt).toBeGreaterThan(0);
          // (on the bottom, out of the sand)
          expect(coatAtShed).toBeLessThan(0.08);
        } else {
          expect(t).toBeLessThan(2.8);
          expect(sheds).toBe(0);
          expect(b.state.shedAt).toBe(-1);
          expect(b.state.sandCoat).toBeGreaterThan(0.8);
          // it keeps low with its coat on, and the coat (the head's too, as shown) comes off only slowly (Shears 1988)
          for (let i = 0; i < 5 * T; i++) b.update(1 / T);
          expect(b.state.alt).toBeLessThan(0.65 * ML);
          expect(b.state.sandCoat).toBeGreaterThan(0.65);
          expect(b.pose.headCover).toBeGreaterThan(0.55);
        }
      }
    }
    // burrow() while it rises: back down with the coat on; once the coat is off, it starts again
    const a = buried(4, true);
    a.hover(10); run(a, 0.5);
    a.burrow(30);
    expect(a.state.phase).toBe('buried');
    expect(a.state.sandCoat).toBeGreaterThan(0.8);
    const c = buried(4, true);
    c.hover(10);
    while (c.state.shedAt < 0) c.update(1 / T);
    c.burrow(30);
    expect(c.state.phase).toBe('settle');
    // fleeing from the sand: the coat dropped at once, one burst
    const e = buried(5, false);
    e.escape(new Vector3(0.05, 0, 0));
    let bursts = 0;
    run(e, 0.25, () => { bursts += e.fx.filter((x) => x.kind === 'sand' && x.count >= 30).length; e.fx.length = 0; });
    expect(bursts).toBe(1);
    expect(e.state.sandCoat).toBe(0);
    expect(e.state.headCover).toBe(0);
  }, 60000);

  it('blends arm II back when the burial is cut short, and keeps its own time when asked again', () => {
    for (const cut of ['hunt', 'escape'] as const) {
      let done = false, i0 = -1;
      const { F } = burial(3, 1, 18, (b) => {
        if (!done && b.state.stroke?.k === 2 && b.state.stroke.u > 0.3) { done = true; if (cut === 'hunt') b.hunt(); else b.escape(new Vector3(0.05, 0, 0)); }
      });
      i0 = F.findIndex((f) => f.mode !== 'BURROW');
      expect(F[i0].mode).toBe(cut === 'hunt' ? 'HUNT' : 'ESCAPE');
      expect(F[i0 - 1].ext[IIL]).toBeGreaterThan(1.8);
      for (let i = i0; i < i0 + T; i++) expect(Math.abs(F[i].ext[IIL] - F[i - 1].ext[IIL])).toBeLessThan(0.15);
      expect(F[i0 + T].ext[IIL]).toBeLessThan(1.05);
      expect(F[i0 + T].aimW[IIL]).toBeLessThan(0.05);
    }
    // the brain asking to burrow every frame does not stretch the phases (only the burial that follows)
    const a = burial(6, 1, 25), b = burial(6, 1, 25, (s) => s.burrow(20));
    for (const p of ['blow', 'sweep', 'buried']) expect(first(b.F, p)).toBe(first(a.F, p));
  }, 60000);

  it('in a case or tank without sand never starts a burial, even on an intent given before its first frame', () => {
    const floor = { heightAt: () => 0, waterAt: () => 0.06 };
    const ctx = { floor, player: new Vector3(0, 1, 0.5), simScale: 1, nowMs: 0, bounds: { minX: -0.1, maxX: 0.1, minZ: -0.05, maxZ: 0.05 }, canBurrow: false } as unknown as DriverContext;
    let out = 0, born = 0;
    for (let n = 0; n < 12; n++) {
      const d = new MimiikaDriver(), holder = MimiikaDriver.makeModel().root;
      new Group().add(holder);
      const r = new Rng(n + 1);
      const ind = { id: `case#${n}`, length_mm: 14, pos: new Vector3(), home: new Vector3(), heading: 0, alert: 0, rng: { next: () => r.next(), chance: (p: number) => r.next() < p } } as unknown as Individual;
      d.attach(holder, ind);
      const s = d.behaviour!, wasBuried = s.state.mode === 'BURROW';
      if (wasBuried) born++; else out++;
      // (the case gives its first intent before the driver's first update: it waits for the context)
      d.setIntent({ id: 1, kind: 'special', urgency: 0, seconds: 3, param: 'yawn' });
      let restarts = 0, lastT = -1, intents = 1;
      for (let f = 0; f < 30 * 60; f++) {
        if (!d.busy) d.setIntent({ id: 2 + intents++, kind: 'rest', urgency: 0, seconds: 4 });
        d.update(1 / 60, ctx);
        const st = s.state;
        if (!wasBuried) expect(st.mode).not.toBe('BURROW');
        if (st.mode === 'HOVER' && st.t < lastT - 1e-9) restarts++;
        lastT = st.mode === 'HOVER' ? st.t : -1;
        if (f > 5 * 60) expect(st.bury, ind.id).toBeLessThan(0.05);
      }
      // (asked again by the case now and then, not every frame)
      expect(restarts).toBeLessThan(10);
      // (and done with it in time: the case gets to give it another)
      expect(intents).toBeGreaterThan(1);
      d.dispose();
    }
    expect(out).toBeGreaterThan(0);
    expect(born).toBeGreaterThan(0);
  }, 60000);

  it('buries the same way at 14 mm and at 40 mm (the sand and the strokes in proportion)', () => {
    for (const K of [0.56, 1.6]) for (const seed of [7, 8]) {
      const { F, plan } = burial(seed, K, 27);
      expect(first(F, 'buried') / T).toBeLessThan(26);
      const blowEnd = F[first(F, plan.gap > 0 ? 'gap' : 'sweep') - 1];
      expect(blowEnd.bury).toBeGreaterThan(0.7);
      for (const f of F) {
        expect(f.gap).toBeGreaterThan(0.3);
        if (f.phase !== 'settle') expect(f.tipL.clone().setX(-f.tipL.x).distanceTo(f.tipR)).toBeLessThan(0.05);
        for (const e of f.fx) if (f.phase === 'blow') expect(Math.abs(e.pos.clone().sub(f.pos).dot(fwdOf(f))) / (0.001 * K)).toBeGreaterThan(5);
      }
      const sc = F.find((f) => f.phase === 'sweep' && f.stroke && f.stroke.u >= 0.36)!;
      const tip = world(sc, sc.tipL, K);
      expect(tip.y).toBeGreaterThan(-2.5);
      expect(tip.y).toBeLessThan(1.0);
    }
  }, 60000);
});

describe('ミミイカ: the model in a scene', () => {
  it('poses without NaN and the arms follow their curls', () => {
    const m = buildModel(new MimiikaLook(lookSpecFor('squid#3')));
    new Group().add(m.root);
    const b = make(31);
    b.burrow(20);
    // (the whole burial, into the sand and out again)
    for (let s = 0; s < 25; s++) {
      run(b, 1);
      if (s === 20) b.hover(5);
      applyPose(m.root, m.bones, b.pose);
      m.root.traverse((o) => { for (const e of o.matrixWorld.elements) expect(Number.isFinite(e)).toBe(true); });
    }
    disposeModel(m);
  });
});

describe('ミミイカ: the arm rig for burying (aim, stretch, thinning, FK)', () => {
  const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0);
  const IIL = ARMS.findIndex((a) => a.name === 'IIL'), IIR = ARMS.findIndex((a) => a.name === 'IIR');
  const sm = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const model = () => { const m = buildModel(new MimiikaLook(lookSpecFor('squid#rig')), [0]); const holder = new Group(); holder.add(m.root); return { m, holder }; };
  /** a pose with every arm joint curled and swung differently, the head turned (no aim, no stretch) */
  const curled = () => {
    const P = emptyPose();
    P.pos.set(0.01, 0.02, -0.03);
    P.quat.setFromEuler(new Euler(-0.3, 0.7, 0.05, 'YXZ'));
    P.headPitch = 0.12; P.headYaw = -0.07;
    for (let j = 0; j < 40; j++) { P.armCurl[j] = 0.9 * Math.sin(j * 1.7 + 0.3); P.armSwing[j] = 0.4 * Math.cos(j * 2.3 + 1.1); }
    return P;
  };
  /** the body sunk to `bury` and pitched as the behaviour does (BURIED_PITCH), head pitch 0.05 */
  const sunk = (bury: number) => {
    const P = emptyPose();
    P.pos.set(0, (8.75 - 15.75 * bury) * 0.001, 0);
    P.quat.setFromEuler(new Euler(-(0.04 + sm(bury) * 0.32), 0, 0, 'YXZ'));
    P.headPitch = 0.05;
    return P;
  };
  /** a direction in the level frame (x the arm's own side out, y up, z forward; ψ from forward to the side, ε up) → head frame */
  const toHead = (P: Pose, d: Vector3) => d.applyQuaternion(P.quat.clone().multiply(new Quaternion().setFromAxisAngle(X, -P.headPitch)).multiply(new Quaternion().setFromAxisAngle(Y, P.headYaw)).invert()).normalize();
  type Key = { psi: number; elev: number; bend: number[]; curl: number[]; ext: number };
  const aimArm = (P: Pose, i: number, k: Key) => {
    const s = ARMS[i].side;
    P.armAim[i].copy(toHead(P, new Vector3(Math.sin(k.psi) * Math.cos(k.elev) * s, Math.sin(k.elev), Math.cos(k.psi) * Math.cos(k.elev))));
    P.armBend[i].copy(toHead(P, new Vector3(k.bend[0] * s, k.bend[1], k.bend[2])));
    P.armAimW[i] = 1; P.armExt[i] = k.ext;
    for (let j = 0; j < 5; j++) P.armCurl[i * 5 + j] = k.curl[j];
  };
  /** an arm's skinned vertices (world), thinned about their rest axis as the vertex shader does, and their rest t */
  const meshArm = (m: MimiikaModel, P: Pose, i: number) => {
    const arms = m.parts.Arms as SkinnedMesh, g = arms.geometry;
    const aArm = g.getAttribute('aArm') as BufferAttribute, aSkin = g.getAttribute('aSkin') as BufferAttribute, pos = g.getAttribute('position') as BufferAttribute;
    const B = armBase(ARMS[i]), base = new Vector3(...toModel(B.pos)), dir = new Vector3(...B.dir), ext = armExtOf(P, i);
    const out: { p: Vector3; tt: number }[] = [];
    for (let v = 0; v < aArm.count; v++) {
      if (Math.round(aArm.getW(v)) !== i + 1) continue;
      const ax = new Vector3(aArm.getX(v), aArm.getY(v), aArm.getZ(v));
      const p = new Vector3().fromBufferAttribute(pos, v).sub(ax).multiplyScalar(armThinAt(ext, aSkin.getY(v))).add(ax);
      arms.applyBoneTransform(v, p);
      out.push({ p: p.applyMatrix4(arms.matrixWorld), tt: ax.clone().sub(base).dot(dir) * 1000 / ARMS[i].length });
    }
    return out;
  };

  it('poses exactly as before when no arm is aimed or stretched (aimW 0, ext 1)', () => {
    // the joints and tips of every arm, and skinned vertices, measured before the aim and stretch were added (mm)
    const JOINTS = [
    18.9496, 26.2604, -19.8924, 20.5556, 26.8753, -18.3953, 20.8984, 26.1417, -16.264, 22.3401, 25.9765, -14.5055, 23.9609, 27.1881, -13.4548, 24.9181, 27.4124, -11.3977,
    20.2393, 25.4868, -20.3893, 22.1121, 25.093, -18.1839, 24.4808, 26.5654, -17.3192, 26.6973, 28.4659, -17.2792, 29.0962, 28.3651, -15.6175, 30.7755, 28.9063, -13.2908,
    20.8022, 24.0601, -20.0178, 23.9408, 22.9539, -20.482, 27.0449, 21.6728, -20.3691, 29.6667, 22.8387, -18.6208, 32.5345, 22.3419, -16.9419, 35.4601, 20.8303, -17.609,
    20.2926, 23.0345, -19.1021, 21.5679, 24.7212, -17.3283, 20.8944, 26.5245, -15.3503, 22.2874, 28.1466, -13.605, 24.4839, 28.886, -12.1064, 24.6513, 30.4227, -9.8198,
    17.6383, 26.1346, -18.8941, 18.1509, 26.5105, -16.7045, 18.0088, 28.4831, -15.5702, 17.9739, 30.4897, -14.4881, 18.179, 30.8189, -12.2414, 19.011, 31.8434, -10.3822,
    16.9218, 25.1684, -17.8637, 15.2611, 25.959, -15.5958, 14.7802, 26.4374, -12.7557, 16.2337, 27.8274, -10.6388, 16.1324, 28.1624, -7.7398, 14.4871, 28.434, -5.3428,
    17.3045, 23.7244, -17.3549, 19.5496, 25.7669, -15.9135, 22.725, 26.8068, -15.5604, 24.1129, 28.3895, -12.9416, 25.155, 29.8146, -10.0828, 28.3196, 30.6066, -9.2782,
    18.4379, 22.8565, -17.6901, 18.7516, 23.2359, -14.9743, 18.7799, 21.3428, -12.9661, 19.295, 20.1079, -10.5521, 19.3371, 21.0865, -7.9717, 20.286, 20.5835, -5.4292,
    ];
    const VERTS = [
    0, 18.1967, 27.0423, -21.142, 667, 22.6036, 25.4332, -14.5046, 1334, 21.6427, 25.8486, -14.5225, 2001, 30.3601, 28.636, -13.5382,
    2668, 28.9101, 28.0531, -15.5327, 3335, 26.7666, 28.5197, -16.5767, 4002, 22.0591, 23.3769, -19.2742, 4669, 32.2799, 22.4827, -16.5125,
    5336, 29.8579, 23.2763, -18.1661, 6003, 24.8971, 30.2235, -10.2586, 6670, 24.2824, 28.9757, -11.8437, 7337, 22.6256, 28.9209, -13.1687,
    8004, 18.9373, 26.1769, -16.7881, 8671, 18.9349, 31.2133, -11.1911, 9338, 18.2521, 30.836, -11.4343, 10005, 15.5677, 27.08, -12.5297,
    10672, 15.9312, 25.4976, -15.0816, 11339, 15.6689, 28.1561, -6.4303, 12006, 23.5191, 28.1771, -14.8941, 12673, 20.2393, 25.4349, -16.5766,
    13340, 26.5321, 29.9421, -9.9086, 14007, 18.6816, 21.5926, -12.0916, 14674, 19.5268, 22.7977, -13.5869, 15341, 20.0765, 21.0485, -6.4202,
    ];
    const { m, holder } = model();
    const P = curled();
    expect([...P.armExt]).toEqual(new Array(8).fill(1));
    expect([...P.armAimW]).toEqual(new Array(8).fill(0));
    applyPose(holder, m.bones, P);
    const v = new Vector3();
    ARMS.forEach((a, i) => {
      for (let k = 0; k <= 5; k++) {
        if (k < 5) m.bones[`J_arm${a.name}_${k}`].getWorldPosition(v);
        else v.set(0, 0, a.length / 5 / 1000).applyMatrix4(m.bones[`J_arm${a.name}_4`].matrixWorld);
        const e = JOINTS.slice((i * 6 + k) * 3, (i * 6 + k) * 3 + 3);
        expect(v.distanceTo(new Vector3(...e).multiplyScalar(0.001)) * 1000).toBeLessThan(2e-4);
      }
      // the same rotations as the old rest × curl × swing, bit for bit; the rest positions; no scale
      for (let k = 0; k < 5; k++) {
        const b = m.bones[`J_arm${a.name}_${k}`], rest = b.userData.rest as { quat: Quaternion; pos: Vector3 }, j = i * 5 + k;
        const q = rest.quat.clone().multiply(new Quaternion().setFromAxisAngle(X, P.armCurl[j])).multiply(new Quaternion().setFromAxisAngle(Y, P.armSwing[j]));
        expect(b.quaternion.toArray()).toEqual(q.toArray());
        expect(b.position.toArray()).toEqual(rest.pos.toArray());
        expect(b.scale.toArray()).toEqual([1, 1, 1]);
      }
    });
    const arms = m.parts.Arms as SkinnedMesh;
    for (let n = 0; n < VERTS.length; n += 4) {
      arms.getVertexPosition(VERTS[n], v);
      v.applyMatrix4(arms.matrixWorld);
      expect(v.distanceTo(new Vector3(VERTS[n + 1], VERTS[n + 2], VERTS[n + 3]).multiplyScalar(0.001)) * 1000).toBeLessThan(2e-4);
    }
    // aimed at its own rest frame (the default aim and bend), an arm stays where it was
    const P2 = curled();
    P2.armAimW.fill(1);
    applyPose(holder, m.bones, P2);
    ARMS.forEach((a, i) => {
      const b = m.bones[`J_arm${a.name}_0`], rest = b.userData.rest as { quat: Quaternion };
      const q = rest.quat.clone().multiply(new Quaternion().setFromAxisAngle(X, P2.armCurl[i * 5])).multiply(new Quaternion().setFromAxisAngle(Y, P2.armSwing[i * 5]));
      expect(Math.abs(b.quaternion.dot(q))).toBeGreaterThan(1 - 1e-9);
    });
    disposeModel(m);
  });

  it('gives the FK joints and tip of the bones and the skinned mesh (stretched, aimed, curled, at any size)', () => {
    const { m, holder } = model();
    holder.scale.setScalar(0.56);
    const arms = m.parts.Arms as SkinnedMesh, g = arms.geometry;
    const aSkin = g.getAttribute('aSkin') as BufferAttribute, aArm = g.getAttribute('aArm') as BufferAttribute;
    // each arm's tube tip (its last ring closes on the axis)
    const tipV = ARMS.map((_, i) => { let best = -1, bi = -1; for (let v = 0; v < aSkin.count; v++) if (Math.round(aArm.getW(v)) === i + 1 && Math.abs(aSkin.getX(v) - 2) < 0.01 && aSkin.getY(v) > best) { best = aSkin.getY(v); bi = v; } return bi; });
    const keys: Key[] = [
      { psi: 0.15, elev: 0.05, bend: [0, -1, 0], curl: [0, 0.02, 0.04, 0.08, 0.15], ext: 2 },
      { psi: 1.45, elev: 0.1, bend: [0, -1, 0], curl: [0, 0.3, -0.2, 0.25, 0.4], ext: 2 },
      { psi: 1.55, elev: 0.95, bend: [-0.65, -0.3, -0.7], curl: [0, 0.4, 0.6, 0.75, 0.7], ext: 1.35 },
      { psi: 2.3, elev: 0.6, bend: [-0.45, -0.3, -0.85], curl: [0.1, 0.4, 0.55, 0.7, 0.65], ext: 2.2 },
    ];
    const J: Vector3[] = [], v = new Vector3(), w = new Vector3();
    for (const k of keys) {
      const P = sunk(0.85);
      P.headYaw = 0.04;
      for (const i of [IIL, IIR]) aimArm(P, i, k);
      P.armExt[0] = 0.7;
      applyPose(holder, m.bones, P);
      ARMS.forEach((a, i) => {
        armJoints(P, i, J);
        for (let n = 0; n < 5; n++) {
          m.bones[`J_arm${a.name}_${n}`].getWorldPosition(v);
          expect(w.copy(J[n]).multiplyScalar(0.001).applyMatrix4(holder.matrixWorld).distanceTo(v)).toBeLessThan(1e-9);
        }
        arms.getVertexPosition(tipV[i], v);
        v.applyMatrix4(arms.matrixWorld);
        expect(armTip(P, i, w).multiplyScalar(0.001).applyMatrix4(holder.matrixWorld).distanceTo(v)).toBeLessThan(1e-6);
      });
    }
    // straight and stretched to twice its length, the arm is twice as long, its tip on the aim
    const P = sunk(0);
    // (head on straight: its frame is the root's)
    P.headPitch = 0;
    P.armAim[IIL].set(0.4, 0.1, 1).normalize(); P.armAimW[IIL] = 1; P.armExt[IIL] = 2;
    armJoints(P, IIL, J);
    const d = J[5].clone().sub(J[0]);
    expect(d.length()).toBeCloseTo(2 * ARMS[IIL].length, 6);
    expect(d.normalize().dot(P.armAim[IIL])).toBeGreaterThan(1 - 1e-9);
    // the range is clamped
    P.armExt[IIL] = 5;
    expect(armExtOf(P, IIL)).toBe(2.2);
    disposeModel(m);
  });

  it('turns the first bone of an arm at most ≈ 50°, the rest at joints 1 and 2, and curls it towards the bend; L and R mirror', () => {
    const { m, holder } = model();
    const P = sunk(1);
    aimArm(P, IIL, { psi: 2.2, elev: 0.9, bend: [-0.45, -0.3, -0.85], curl: [0, 0, 0, 0, 0], ext: 1.6 });
    applyPose(holder, m.bones, P);
    const rest = new Vector3(...armBase(ARMS[IIL]).dir);
    const J = armJoints(P, IIL, []);
    const seg = (k: number) => J[k + 1].clone().sub(J[k]).normalize();
    // (the head frame is the root's turned by the head on the neck)
    const head = new Quaternion().setFromAxisAngle(X, -P.headPitch).multiply(new Quaternion().setFromAxisAngle(Y, P.headYaw));
    expect(Math.acos(seg(0).dot(rest.clone().applyQuaternion(head)))).toBeLessThan(ARM_AIM_MAX + 1e-6);
    expect(Math.acos(seg(0).dot(rest.clone().applyQuaternion(head)))).toBeGreaterThan(ARM_AIM_MAX - 1e-6);
    const aim = P.armAim[IIL].clone().applyQuaternion(head);
    for (const k of [2, 3, 4]) expect(seg(k).dot(aim)).toBeGreaterThan(1 - 1e-9);
    // a curl bends the arm towards the bend (its oral side)
    const tip0 = armTip(P, IIL, new Vector3());
    for (let j = 1; j < 5; j++) P.armCurl[IIL * 5 + j] = 0.3;
    const bend = P.armBend[IIL].clone().applyQuaternion(head);
    expect(armTip(P, IIL, new Vector3()).sub(tip0).dot(bend)).toBeGreaterThan(2);
    // the right arm with the mirrored aim, bend and swing is the left one's mirror image
    for (let j = 0; j < 5; j++) { P.armSwing[IIL * 5 + j] = 0.1 * j; P.armSwing[IIR * 5 + j] = -0.1 * j; P.armCurl[IIR * 5 + j] = P.armCurl[IIL * 5 + j]; }
    P.armAim[IIR].copy(P.armAim[IIL]).setX(-P.armAim[IIL].x); P.armBend[IIR].copy(P.armBend[IIL]).setX(-P.armBend[IIL].x);
    P.armAimW[IIR] = 1; P.armExt[IIR] = P.armExt[IIL];
    const L = armJoints(P, IIL, []), R = armJoints(P, IIR, []);
    for (let k = 0; k <= 5; k++) expect(L[k].clone().setX(-L[k].x).distanceTo(R[k])).toBeLessThan(1e-6);
    disposeModel(m);
  });

  it('keeps the arm\'s skin clear of the eyes\' domes and out of the body, wherever arm II is aimed', () => {
    const { m, holder } = model();
    const Rd = EYE.r + EYE.skin;
    const inBody = (pRoot: Vector3) => {
      const z = pRoot.z + Z_ROOT, pr = profileAt(z);
      if (z < -25 || z > 8.9 || pr.w < 0.05) return 9;
      const dy = pRoot.y - pr.c;
      return Math.pow(Math.abs(pRoot.x) / pr.w, 2.3) + Math.pow(Math.abs(dy) / (dy < 0 ? pr.h * 0.95 : pr.h), 2.3);
    };
    // the extreme aims of the burying strokes: all round from forward to far back, along the sand to steeply up,
    // suckers down (reaching) or inwards and back (arching over the head), at rest length and stretched; and the
    // spec's arch keys with their curls
    const keys: Key[] = [];
    for (const psi of [0, 0.8, 1.6, 2.4]) for (const elev of [-0.2, 0.4, 1.0, 1.4]) for (const ext of [1, 2]) {
      keys.push({ psi, elev, bend: [0, -1, 0], curl: [0, 0, 0, 0, 0], ext });
      if (elev > 0) keys.push({ psi, elev, bend: [-0.65, -0.3, -0.7], curl: [0, 0, 0, 0, 0], ext });
    }
    keys.push({ psi: 0.5, elev: 0.9, bend: [0, -1, 0], curl: [0, 0.1, 0.15, 0.2, 0.3], ext: 1.15 });
    keys.push({ psi: 1.2, elev: 0.55, bend: [-0.3, -0.8, -0.5], curl: [0, 0.2, 0.3, 0.4, 0.45], ext: 1.75 });
    keys.push({ psi: 1.55, elev: 0.95, bend: [-0.65, -0.3, -0.7], curl: [0, 0.4, 0.6, 0.75, 0.7], ext: 1.35 });
    keys.push({ psi: 1.75, elev: 0.95, bend: [-0.45, -0.3, -0.85], curl: [0, 0.4, 0.55, 0.7, 0.65], ext: 1.65 });
    let worstEye = Infinity, worstFk = Infinity, worstBody = Infinity;
    const eyeC = new Vector3(), inv = holder.matrixWorld.clone();
    for (const bury of [0.78, 1]) for (const k of keys) {
      const P = sunk(bury);
      aimArm(P, IIL, k);
      applyPose(holder, m.bones, P);
      inv.copy(holder.matrixWorld).invert();
      m.bones.J_eye_L.getWorldPosition(eyeC);
      let eye = Infinity;
      for (const { p, tt } of meshArm(m, P, IIL)) {
        if (tt >= 0) eye = Math.min(eye, p.distanceTo(eyeC) * 1000 - Rd);
        // (beyond its base, which sits in the crown)
        if (tt > 0.2) worstBody = Math.min(worstBody, inBody(p.clone().applyMatrix4(inv).multiplyScalar(1000)));
      }
      worstEye = Math.min(worstEye, eye);
      // the FK estimate is a lower bound, within a few tenths of a mm
      const fk = armEyeGap(P, IIL);
      expect(fk).toBeLessThan(eye + 0.02);
      expect(fk).toBeGreaterThan(eye - 0.6);
      worstFk = Math.min(worstFk, fk);
    }
    expect(worstEye).toBeGreaterThan(0.3);
    expect(worstFk).toBeGreaterThan(0.3);
    expect(worstBody).toBeGreaterThan(1);
    disposeModel(m);
  });

  it('thins a stretched arm about its own axis, and not at all at rest length', () => {
    expect(armThin(1)).toBe(1);
    expect(armThin(0.6)).toBe(1);
    expect(armThin(2)).toBeCloseTo(Math.SQRT1_2, 12);
    for (let t = -0.1; t <= 1; t += 0.05) expect(armThinAt(1, t)).toBe(1);
    // the base on the crown keeps its girth
    expect(armThinAt(2, 0)).toBe(1);
    expect(armThinAt(2, 0.5)).toBeCloseTo(Math.SQRT1_2, 12);
    for (const t of [0, 1, 2] as const) {
      const m = buildModel(new MimiikaLook(lookSpecFor('squid#thin')), [t]);
      // every skin part carries aArm (zeros off the arms: a stale attribute value cannot thin them)
      for (const name of ['Mantle', 'Head', 'Funnel', 'Tentacles', 'Arms'] as const) {
        const part = m.parts[name];
        if (!part) continue;
        const a = part.geometry.getAttribute('aArm') as BufferAttribute;
        expect(a.count).toBe(part.geometry.getAttribute('position').count);
        if (name !== 'Arms') { for (let v = 0; v < a.count; v++) expect(a.getW(v)).toBe(0); continue; }
        // on the arms: the arm's index + 1 and a point on its rest axis
        for (let v = 0; v < a.count; v += 7) {
          const i = Math.round(a.getW(v)) - 1;
          expect(i).toBeGreaterThanOrEqual(0);
          const B = armBase(ARMS[i]), base = new Vector3(...toModel(B.pos)), dir = new Vector3(...B.dir);
          const q = new Vector3(a.getX(v), a.getY(v), a.getZ(v)).sub(base);
          expect(q.addScaledVector(dir, -q.dot(dir)).length()).toBeLessThan(1e-9);
        }
      }
      // the driver passes each arm's stretch to the shader: 1 at rest length
      const P = emptyPose();
      MimiikaDriver.applyMaterials(m, P);
      expect([...m.look.uniforms.uArmThin.value]).toEqual(new Array(8).fill(1));
      P.armExt[IIL] = 2;
      MimiikaDriver.applyMaterials(m, P);
      expect(m.look.uniforms.uArmThin.value[IIL]).toBeCloseTo(Math.SQRT1_2, 6);
      expect(m.look.uniforms.uArmThin.value[IIR]).toBe(1);
      disposeModel(m);
    }
    // the skin's vertex shader declares and applies it; the fade and the grains are uniforms
    const look = new MimiikaLook(lookSpecFor('squid#glsl'));
    const chunks = ['common', 'beginnormal_vertex', 'begin_vertex', 'project_vertex', 'color_fragment', 'roughnessmap_fragment', 'normal_fragment_maps', 'lights_physical_fragment', 'lights_fragment_begin', 'lights_fragment_maps', 'emissivemap_fragment', 'opaque_fragment'].map((c) => `#include <${c}>`).join('\n') + '\nvoid main() {';
    for (const mat of [look.skin, look.skinLow, look.fins, look.finsLow]) {
      const shader = { uniforms: {}, vertexShader: chunks, fragmentShader: chunks } as unknown as Parameters<NonNullable<typeof mat.onBeforeCompile>>[0];
      mat.onBeforeCompile(shader, null as never);
      const skin = mat === look.skin || mat === look.skinLow;
      if (skin) {
        expect(shader.vertexShader).toContain('attribute vec4 aArm;');
        expect(shader.vertexShader).toContain('uniform float uArmThin[8];');
        expect(shader.fragmentShader).toContain('uniform float uSandFade;');
        expect(shader.fragmentShader).toContain('smoothstep(0.0, uSandFade, vWPos.y - uGroundY)');
      }
      expect(shader.fragmentShader).toContain('uniform float uGrain;');
      expect(shader.fragmentShader).toContain('p / uGrain + 51.0');
      expect(shader.fragmentShader).not.toContain('p / 0.3 + 51.0');
      for (const u of ['uArmThin', 'uSandFade', 'uGrain']) expect(shader.uniforms).toHaveProperty(u);
    }
    look.dispose();
  });

  it('leaves the アカエイ\'s sand exactly as it was, and settles the squid\'s on the sand under it', () => {
    const runFx = (fx: SandFX) => {
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const out: number[] = [];
      for (let f = 0; f < 240; f++) {
        if (f % 9 === 0) fx.emit(new Vector3(0.05 * Math.sin(f), 0.02, 0.05), new Vector3(0.03, f % 2 ? 0.05 : -0.09, -0.02), 9, 0.03, 0.05, 1.5 + (f % 3), 0.5, rnd);
        fx.update(1 / 60, (x, z) => 0.01 * Math.sin(x * 9) + 0.004 * z);
        if (f % 40 === 39) out.push(...(fx.points.geometry.getAttribute('position').array as Float32Array), ...(fx.points.geometry.getAttribute('aPuff').array as Float32Array));
      }
      fx.dispose();
      return out;
    };
    const a = runFx(new SandFX(new Group())), b = runFx(new SandFX(new Group(), { floor: 0.004, everyFrame: false, killOnFloor: false }));
    expect(a).toEqual(b);
    // the ray's default: one sprite in eight is held 4 mm over the sand from the start, the others only late in life;
    // the clouds swell 1.8–3.2×
    const ray = new SandFX(new Group());
    ray.emit(new Vector3(0, 0.001, 0), new Vector3(0, -0.2, 0), 16, 0, 0.01, 10, 0.5, () => 0.5);
    for (let f = 0; f < 6; f++) ray.update(1 / 60, () => 0);
    const y = ray.points.geometry.getAttribute('position') as BufferAttribute, puff = ray.points.geometry.getAttribute('aPuff') as BufferAttribute;
    expect(y.getY(0)).toBeCloseTo(0.004, 9);
    expect(y.getY(8)).toBeCloseTo(0.004, 9);
    expect(y.getY(3)).toBeLessThan(0);
    for (let f = 0; f < 560; f++) ray.update(1 / 60, () => 0);
    expect(puff.getX(1) / 0.01).toBeGreaterThan(1.8);
    ray.dispose();
    // the squid's: floor ∝ size (never under 0.3 mm), tested every frame; poured grains (kill) vanish into the sand
    // and barely swell
    expect(MimiikaDriver.sandFxOptions(0.56)).toEqual({ floor: 0.0008 * 0.56, everyFrame: true, tone: 1.05, sink: 0.012 });
    expect(MimiikaDriver.sandFxOptions(0.2).floor).toBe(0.0003);
    const squid = new SandFX(new Group(), MimiikaDriver.sandFxOptions(0.56));
    squid.emit(new Vector3(0, 0.003, 0), new Vector3(0, -0.02, 0), 4, 0, 0.002, 10, 0.5, () => 0.5);
    squid.emit(new Vector3(0, 0.003, 0), new Vector3(0, -0.02, 0), 4, 0, 0.002, 10, 0.5, () => 0.5, 1.1, true);
    for (let f = 0; f < 60; f++) squid.update(1 / 60, () => 0);
    const sy = squid.points.geometry.getAttribute('position') as BufferAttribute, sp = squid.points.geometry.getAttribute('aPuff') as BufferAttribute;
    for (let i = 0; i < 4; i++) { expect(sy.getY(i)).toBeCloseTo(0.0008 * 0.56, 9); expect(sp.getY(i)).toBeGreaterThan(0); }
    for (let i = 4; i < 8; i++) expect(sp.getY(i)).toBe(0);
    // its silt hangs in the water (a ray's cloud 5 mm up is down on the sand in about 0.7 s, the squid's not yet), but a
    // single grain sinks as fast as ever
    const hang = (o: ConstructorParameters<typeof SandFX>[1], kill: boolean) => {
      const fx = new SandFX(new Group(), o);
      fx.emit(new Vector3(0, 0.005, 0), new Vector3(), 1, 0, 0.002, 10, 0.5, () => 0.5, kill ? 1.1 : undefined, kill);
      let t = 0;
      const y = fx.points.geometry.getAttribute('position') as BufferAttribute, a = fx.points.geometry.getAttribute('aPuff') as BufferAttribute;
      while (t < 5 && a.getY(0) >= 0 && y.getY(0) > 0.0005 + 1e-6) { fx.update(1 / 60, () => 0); t += 1 / 60; if (kill && a.getY(0) === 0 && t > 0.05) break; }
      fx.dispose();
      return t;
    };
    expect(hang({ floor: 0.0005 }, false)).toBeLessThan(0.9);
    expect(hang({ ...MimiikaDriver.sandFxOptions(0.56), floor: 0.0005 }, false)).toBeGreaterThan(1.1);
    expect(hang({ ...MimiikaDriver.sandFxOptions(0.56), floor: 0.0005 }, true)).toBeCloseTo(hang({ floor: 0.0005, killOnFloor: true }, true), 5);
    // and is the bed's own tone (the ray's a little paler)
    const tone = (o?: ConstructorParameters<typeof SandFX>[1]) => { const fx = new SandFX(new Group(), o); const v = (fx.points.material as unknown as { uniforms: { uTone: { value: number } } }).uniforms.uTone.value; fx.dispose(); return v; };
    expect(tone()).toBe(1.7);
    expect(tone(MimiikaDriver.sandFxOptions(1))).toBe(1.05);
    const grains = new SandFX(new Group(), MimiikaDriver.sandFxOptions(0.56));
    grains.emit(new Vector3(0, 0.01, 0), new Vector3(0, 0, 0), 1, 0, 0.002, 1, 0.5, () => 0.5, 1.1, true);
    for (let f = 0; f < 55; f++) grains.update(1 / 60, () => 0);
    expect((grains.points.geometry.getAttribute('aPuff') as BufferAttribute).getX(0)).toBeLessThan(0.002 * 0.75 * 1.1 + 1e-9);
    squid.dispose(); grains.dispose();
  });

  it('scales the sand on its skin with its size: the fade into the bed 2.2 mm × K, grains ≈ 0.45 mm', () => {
    for (const length_mm of [5, 14, 40]) {
      const d = new MimiikaDriver(), holder = MimiikaDriver.makeModel().root;
      new Group().add(holder);
      const ind = { id: `squid#${length_mm}`, length_mm, pos: new Vector3(), home: new Vector3(), heading: 0 } as unknown as Individual;
      d.attach(holder, ind);
      const K = length_mm / 25, u = d.view!.look.uniforms;
      expect(u.uSandFade.value).toBeCloseTo(0.0022 * K, 12);
      // (medium sand, as stuck on the coat of 21: 2–4 % of the mantle, coarse enough to read as grains; the model's
      // grain is never under 0.45 mm nor over 1.2 mm, so that a tiny squid's is not a blur of specks)
      expect(u.uGrain.value).toBeCloseTo(Math.min(1.2, Math.max(0.45, 0.45 / K)), 12);
      if (length_mm >= 14) expect((u.uGrain.value * K) / length_mm).toBeGreaterThan(0.015);
      if (length_mm >= 14) expect((u.uGrain.value * K) / length_mm).toBeLessThan(0.04);
      expect(u.uGrain.value).toBeCloseTo(sandGrain(K), 12);
      // (the stretched arms are not culled at the screen's edge)
      expect((d.view!.parts.Arms as SkinnedMesh).boundingSphere!.radius).toBe(0.05);
      d.dispose();
    }
  });
});
