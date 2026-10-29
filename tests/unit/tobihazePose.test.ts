import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { Bone, Group, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import {
  applyPose, bindPose, createPose, crawlWelds, GAPE_HALF, pointOf, poseFor, poseInto, poseRig, worldOf, type PoseFrame, type PoseRig, type PoseWorld,
} from '../../src/creatures/species/tobihaze/pose.js';

/**
 * トビハゼ's pose module (src/creatures/species/tobihaze/pose.js) against the shipped GLBs' own extras: the reference
 * states come out as the build wrote them, the welded contacts carried through the skeleton stay where a behaviour puts
 * them (a stub of behavior.ts's crawl and prop, the same rules: the root still through a stance, turned about the
 * pelvic cup in the recovery, a stride on at the cycle's end), the transitions keep the fins out of the mud, the eyes
 * and the head move as their channels say, and every tier binds.
 */

type Tier = 'hero' | 'lod1' | 'lod2';
const TIERS: Tier[] = ['hero', 'lod1', 'lod2'];
const glbPath = (tier: Tier) => new URL(`../../src/assets/models/tobihaze/tobihaze.${tier}.glb`, import.meta.url).pathname;

interface GlbJson {
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: { name?: string; translation?: number[]; rotation?: number[]; children?: number[]; mesh?: number; skin?: number; extras?: Record<string, unknown> }[];
  meshes: { name?: string; primitives: { targets?: unknown[] }[]; extras?: { targetNames?: string[] } }[];
  skins: { joints: number[] }[];
}
const JSONS: Partial<Record<Tier, GlbJson>> = {};
function glb(tier: Tier): GlbJson {
  if (!JSONS[tier]) { const b = readFileSync(glbPath(tier)); JSONS[tier] = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as GlbJson; }
  return JSONS[tier]!;
}
/** the root node's extras (LoadedModel.extras) */
function extrasOf(tier: Tier): Record<string, unknown> {
  const J = glb(tier);
  return J.nodes[J.scenes[J.scene ?? 0].nodes[0]].extras!;
}
interface X {
  tier: string; hlMM: number;
  axes: { joints: Record<string, { order?: string[]; channels?: Record<string, { axis: number[]; range?: number[] }>; slide?: { dir: number[]; mPerUnit: number }; translate?: { liftM: number; dropM: number } }>; eyes?: Record<string, { gaze: { yaw: { range: number[] }; pitch: { range: number[] }; default: { yaw: number; pitch: number } } }>; head?: { poses: Record<string, Record<string, Record<string, number>>> } };
  states: Record<string, { pose: Record<string, unknown>; groundM: number }>;
  prop: { frames: { raise: number; pose: Record<string, unknown> }[]; common?: Record<string, unknown> };
  crawl: { frames: { phase: number; pose: Record<string, unknown> }[]; common?: Record<string, unknown>; duty: number; strideMM: number };
  transitions: Record<string, { from: string; to: string; lift: Record<string, Record<string, number>> }>;
  contacts: Record<string, { name: string; bone: string; local: [number, number, number] }[]>;
}
const tx = (tier: Tier) => extrasOf(tier).tobihaze as X;
const rigOf = (tier: Tier) => poseRig(extrasOf(tier));

/** a joint's local rotation composed straight from the extras with three (R = R(order[0]) · R(order[1]) · …) */
function refQuat(x: X, name: string, e: unknown): Quaternion {
  const q = new Quaternion();
  if (Array.isArray(e)) return q.fromArray(e as number[]).normalize();
  const A = x.axes.joints[name], v = (e ?? {}) as Record<string, number>;
  for (const c of A.order ?? Object.keys(A.channels ?? {})) {
    if (typeof v[c] !== 'number' || !A.channels?.[c]) continue;
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(...(A.channels[c].axis as [number, number, number])).normalize(), (v[c] * Math.PI) / 180));
  }
  return q;
}
/** a joint's translation from the extras (t in head lengths along the fish frame [s, y, z], the slide along its dir) */
function refT(x: X, name: string, e: unknown): Vector3 {
  const v = (Array.isArray(e) ? {} : e ?? {}) as { t?: number[]; slide?: number }, hl = x.hlMM / 1000, out = new Vector3();
  if (v.t) out.set(v.t[2] * hl, v.t[1] * hl, -v.t[0] * hl);
  const sl = x.axes.joints[name]?.slide;
  if (sl && v.slide) out.addScaledVector(new Vector3(...(sl.dir as [number, number, number])), v.slide * sl.mPerUnit);
  return out;
}
const angleBetween = (a: Quaternion, b: ArrayLike<number>) => 2 * Math.acos(Math.min(1, Math.abs(a.x * b[0] + a.y * b[1] + a.z * b[2] + a.w * b[3])));
/** a frame that adds nothing to a pose: the eyes where the pose has them, the gaze at its rest */
function bareFrame(x: X, pose: string, P: Record<string, unknown>, extra: Partial<PoseFrame> = {}): PoseFrame {
  // (lod2's eyes are its Body's: their lift the alert blend shape's, 0.03 HL at 1)
  const alert = ((P.morph as Record<string, Record<string, number>> | undefined)?.Body?.alert ?? 0) * 0.03;
  const hl = x.hlMM / 1000, lift = (S: string) => (((P[`J_eye${S}`] as { t?: number[] } | undefined)?.t?.[1] ?? alert) * hl);
  return { pose, eyes: { L: { lift: lift('L') }, R: { lift: lift('R') }, blink: { L: 0, R: 0 } }, ...extra };
}
const newWorld = (rig: PoseRig): PoseWorld => ({ q: new Float64Array(rig.joints.length * 4), p: new Float64Array(rig.joints.length * 3) });

describe('トビハゼ pose: the reference states as the GLBs ship them', () => {
  it('ships the three tiers with their rig extras', () => {
    for (const tier of TIERS) {
      expect(existsSync(glbPath(tier))).toBe(true);
      const x = tx(tier);
      expect(x.tier).toBe(tier);
      expect(Object.keys(x.states).sort()).toEqual(['land', 'reach', 'rest', 'swim', 'water']);
    }
  });

  for (const tier of TIERS) {
    it(`${tier}: every state's joints and fin weights come out as states.json has them`, () => {
      const x = tx(tier), rig = rigOf(tier);
      // (states.json beside the built tiers, when the build's scratch is there, is the same as the GLB's extras)
      const sj = new URL('../../tools/models/tobihaze/out/tiers/states.json', import.meta.url).pathname;
      const shipped = existsSync(sj) ? (JSON.parse(readFileSync(sj, 'utf8')) as Record<string, Record<string, { pose: unknown }>>)[tier] : null;
      for (const [state, S] of Object.entries(x.states)) {
        if (shipped?.[state]) expect(JSON.stringify(shipped[state].pose)).toBe(JSON.stringify(S.pose));
        const P = S.pose, out = poseFor(bareFrame(x, state, P), extrasOf(tier), tier);
        for (const j of rig.joints) {
          expect(angleBetween(refQuat(x, j.name, P[j.name]), out.q[j.name]), `${tier} ${state} ${j.name}`).toBeLessThan(1e-7);
          expect(refT(x, j.name, P[j.name]).distanceTo(new Vector3(...out.t[j.name])), `${tier} ${state} ${j.name} t`).toBeLessThan(1e-9);
        }
        for (const [fin, ws] of Object.entries((P.morph ?? {}) as Record<string, Record<string, number>>)) {
          for (const [t, w] of Object.entries(ws)) {
            const name = fin.startsWith('Fin_') ? `${t}_${fin}` : t;
            // (lod2's pitchDown/Up are driven by J_pelvic, which lod2 does not ship: its states have them at 0)
            if (name in out.weights) expect(out.weights[name], `${tier} ${state} ${name}`).toBeCloseTo(w, 6);
          }
        }
      }
    });

    it(`${tier}: the prop and the crawl meet their keys`, () => {
      const x = tx(tier), rig = rigOf(tier), ex = extrasOf(tier);
      const merge = (common: Record<string, unknown> | undefined, pose: Record<string, unknown>) => ({ ...(common ?? {}), ...pose });
      for (const f of x.prop.frames) {
        const P = merge(x.prop.common, f.pose), out = poseFor(bareFrame(x, 'prop', P, { prop: { raise: f.raise } }), ex);
        for (const j of rig.joints) expect(angleBetween(refQuat(x, j.name, P[j.name]), out.q[j.name]), `prop ${f.raise} ${j.name}`).toBeLessThan(1e-7);
      }
      for (const f of x.crawl.frames) {
        if (f.phase >= 1) continue;
        const P = merge(x.crawl.common, f.pose), out = poseFor(bareFrame(x, 'crawl', P, { crawl: { phase: f.phase } }), ex);
        // (the stance's weld hold may touch the arm by the keys' own residue, a few micrometres: under 0.05°)
        for (const j of rig.joints) expect(angleBetween(refQuat(x, j.name, P[j.name]), out.q[j.name]), `crawl ${f.phase} ${j.name}`).toBeLessThan(0.05 * Math.PI / 180);
        const tRoot = refT(x, 'J_root', P.J_root);
        expect(tRoot.distanceTo(new Vector3(...out.t.J_root))).toBeLessThan(1e-9);
      }
    });
  }
});

// ------------------------------------------------------------------------------------------------ the welds

/** a plane of mud: y = gx·x + gz·z */
interface Slope { gx: number; gz: number }
const normalOf = (s: Slope) => new Vector3(-s.gx, 1, -s.gz).normalize();
/** the root's attitude on the slope facing `heading` (the model: +X its left, +Y up, +Z forward) */
function attitude(s: Slope, heading: number): Quaternion {
  const up = normalOf(s), f0 = new Vector3(Math.sin(heading), 0, Math.cos(heading));
  const fwd = f0.addScaledVector(up, -f0.dot(up)).normalize(), left = new Vector3().crossVectors(up, fwd);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(left, up, fwd));
}
const toWorld = (P: Vector3, Q: Quaternion, scale: number, m: ArrayLike<number>) => new Vector3(m[0], m[1], m[2]).multiplyScalar(scale).applyQuaternion(Q).add(P);
const smoothU = (u: number) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };

/**
 * A stub of the behaviour's crawl (behavior.ts: the root still through the stance, the crutches welded where the cycle's
 * segment touched; in the recovery the root turned about the pelvic cup, the cup welded; a stride on at the cycle's
 * end), run for `seconds` at `fps`, the pose carried through the skeleton: the contacts' worst drift per stance (mm).
 */
function crawlDrift(tier: Tier, o: { seconds: number; fps: number; slope: Slope; scale: number; cycleS?: number }) {
  const rig = rigOf(tier), C = rig.crawl!, cw = crawlWelds(rig)!, x = tx(tier);
  const out = createPose(rig), W = newWorld(rig);
  const pel = x.contacts.land.find((c) => c.name === 'pelvic')!, cupLocal: [number, number, number] = [0, pel.local[1], pel.local[2]];
  // the cup through the recovery (the body still): its place in the model frame
  poseInto(rig, { pose: 'crawl', crawl: { phase: (C.duty + 1) / 2 } }, out); worldOf(rig, out, W);
  const cupModel = [...pointOf(rig, W, pel.bone, cupLocal)];
  const s = o.scale, stride = (C.strideMM / 1000) * s, cycle = o.cycleS ?? C.cycleS, up = normalOf(o.slope);
  let heading = 0.3, P = new Vector3(0, 0, 0), Q = attitude(o.slope, heading);
  P.y = -(rig.crawl!.groundM ?? 0) * s;
  let phase = 0, n = 0, turn = 0, cupW = new Vector3(), Q0 = Q.clone(), Q1 = Q.clone();
  const drift = { stance: 0, recovery: 0, wrap: 0, stances: 0 };
  let stanceMax = 0;
  const dt = 1 / o.fps;
  for (let i = 0; i < o.seconds * o.fps; i++) {
    const was = phase;
    phase += dt / cycle;
    if (was < C.duty && phase >= C.duty) {
      // the recovery: the cup welded, the turn planned (the behaviour caps it at 32°)
      cupW = toWorld(P, Q, s, cupModel);
      turn = 0.45 * Math.sin(n * 1.7) ;
      Q0 = Q.clone(); Q1 = new Quaternion().setFromAxisAngle(up, turn).multiply(Q0);
      drift.stance = Math.max(drift.stance, stanceMax); drift.stances++; stanceMax = 0;
    }
    if (phase >= C.duty) {
      const u = (Math.min(phase, 1) - C.duty) / (1 - C.duty);
      Q = Q0.clone().slerp(Q1, smoothU(u));
      P = cupW.clone().sub(new Vector3(...cupModel).multiplyScalar(s).applyQuaternion(Q));
    }
    if (phase >= 1) {
      // the cycle is over: the root takes over the stride J_root carried (J_root's place the same either side of it)
      const ri = rig.index.J_root, rootAt = (ph: number) => { poseInto(rig, { pose: 'crawl', crawl: { phase: ph } }, out); worldOf(rig, out, W); return toWorld(P, Q, s, [W.p[ri * 3], W.p[ri * 3 + 1], W.p[ri * 3 + 2]]); };
      const before = rootAt(1 - 1e-9);
      P.add(new Vector3(0, 0, stride).applyQuaternion(Q));
      drift.wrap = Math.max(drift.wrap, rootAt(0).distanceTo(before) * 1000);
      phase -= 1; n++;
    }
    const frame: PoseFrame = { pose: 'crawl', crawl: { phase, turn: phase >= C.duty ? turn : 0 }, eyes: { L: { yaw: 20, pitch: 5, lift: 0.0004 }, R: { yaw: -5, pitch: 0, lift: 0.0004 }, blink: { L: 0, R: 0 } }, head: { gulp: 0.3 }, fins: { d1: 0.3, median: 0.3, caudal: 0 } };
    poseInto(rig, frame, out); worldOf(rig, out, W);
    if (phase < C.duty) {
      let k = 0;
      while (k + 1 < cw.segs.length && phase >= cw.segs[k + 1].from) k++;
      // (the behaviour's welds: the segment's spot under the root of this cycle)
      for (const S of ['L', 'R'] as const) {
        const want = toWorld(P, Q, s, S === 'L' ? cw.segs[k].weldL : cw.segs[k].weldR);
        const got = toWorld(P, Q, s, pointOf(rig, W, cw.bone[S], cw.segs[k][S]));
        stanceMax = Math.max(stanceMax, got.distanceTo(want) * 1000);
      }
    } else {
      const got = toWorld(P, Q, s, pointOf(rig, W, pel.bone, cupLocal));
      drift.recovery = Math.max(drift.recovery, got.distanceTo(cupW) * 1000);
    }
  }
  return drift;
}

describe('トビハゼ pose: no contact the behaviour welds slides (60 s of crawling with turns)', () => {
  const slopes: [string, Slope][] = [['flat', { gx: 0, gz: 0 }], ['sloped', { gx: 0.18, gz: -0.1 }]];
  for (const tier of TIERS) for (const [name, slope] of slopes) {
    it(`${tier}, ${name} mud: the crutches' tips and the recovery's cup hold`, () => {
      // (a 100 mm fish, the largest: the drift grows with the size)
      const d = crawlDrift(tier, { seconds: 60, fps: 60, slope, scale: 100 / 80 });
      console.log(`[tobihaze pose] ${tier} ${name}: ${d.stances} stances, worst tip drift ${d.stance.toFixed(4)} mm, cup ${d.recovery.toFixed(4)} mm, the body's step over the cycle's end ${d.wrap.toFixed(4)} mm`);
      expect(d.stances).toBeGreaterThan(100);
      // lod2's arm is the shoulder alone (its furled card carries no junction): its tip wanders ~2 mm through a stance,
      // under half a pixel at the distances lod2 is drawn at (beyond ~10 m)
      expect(d.stance).toBeLessThan(tier === 'lod2' ? 3.2 : 0.1);
      expect(d.recovery).toBeLessThan(0.1);
      // (no jump where the cycle wraps: the body still on its cup there, J_root's stride handed to the root)
      expect(d.wrap).toBeLessThan(0.05);
    });
  }

  it('the same at 20 fps (the phase, not the frame rate, places the body)', () => {
    for (const tier of ['hero', 'lod1'] as const) expect(crawlDrift(tier, { seconds: 20, fps: 20, slope: { gx: 0.1, gz: 0.05 }, scale: 1 }).stance).toBeLessThan(0.1);
  });

  for (const tier of TIERS) {
    it(`${tier}: the prop's soles stay planted while the front rises and sinks (10–25°)`, () => {
      const rig = rigOf(tier), x = tx(tier), out = createPose(rig), W = newWorld(rig);
      const soles = x.contacts.land.filter((c) => /^sole/.test(c.name));
      poseInto(rig, { pose: 'prop', prop: { raise: 15 } }, out); worldOf(rig, out, W);
      const at = soles.map((c) => [...pointOf(rig, W, c.bone, c.local)]);
      let worst = 0;
      for (let i = 0; i <= 600; i++) {
        const raise = 17.5 - 7.5 * Math.cos((i / 600) * 4 * Math.PI);
        poseInto(rig, { pose: 'prop', prop: { raise } }, out); worldOf(rig, out, W);
        soles.forEach((c, k) => { const p = pointOf(rig, W, c.bone, c.local); worst = Math.max(worst, Math.hypot(p[0] - at[k][0], p[1] - at[k][1], p[2] - at[k][2]) * 1000); });
      }
      console.log(`[tobihaze pose] ${tier} prop 10–25°: worst sole drift ${worst.toFixed(4)} mm`);
      // (lod2: the one-joint arm takes the hero's shoulder; its card's sole follows to ~4 mm over the whole range)
      expect(worst).toBeLessThan(tier === 'lod2' ? 4.5 : 0.1);
    });
  }
});

// ------------------------------------------------------------------------------------------------ transitions

describe('トビハゼ pose: the transitions lift the fins off the mud', () => {
  const isPec = (n: string) => /^(sole|blade)/.test(n);
  const side = (n: string) => (/L(Front|Back)?$/.test(n) ? 'L' : 'R');
  for (const tier of ['hero', 'lod1'] as const) {
    it(`${tier}: each extras transition keeps the arms in range, meets its ends and never puts a pectoral under the ground`, () => {
      const rig = rigOf(tier), x = tx(tier), out = createPose(rig), W = newWorld(rig), ex = extrasOf(tier);
      for (const T of Object.values(x.transitions)) {
        const A = x.contacts[T.from], B = x.contacts[T.to], gA = x.states[T.from].groundM, gB = x.states[T.to].groundM;
        let worst = Infinity, lifted = 0;
        for (let i = 0; i <= 40; i++) {
          const u = i / 40, e = smoothU(u);
          const f = bareFrame(x, T.to, x.states[T.to].pose, { stateBlend: { from: T.from, to: T.to, u } });
          poseInto(rig, f, out); worldOf(rig, out, W);
          for (const j of rig.joints) for (let k = 0; k < j.order.length; k++) {
            const q = out.q.subarray(j.i * 4, j.i * 4 + 4);
            expect(Number.isFinite(q[0] + q[1] + q[2] + q[3])).toBe(true);
          }
          const g = gA + (gB - gA) * e;
          for (const c of A.filter((c) => isPec(c.name))) {
            const d = B.find((b) => b.name === c.name) ?? B.find((b) => isPec(b.name) && side(b.name) === side(c.name));
            const ya = pointOf(rig, W, c.bone, c.local)[1], yb = d ? pointOf(rig, W, d.bone, d.local)[1] : ya;
            worst = Math.min(worst, (ya + (yb - ya) * e - g) * 1000);
          }
          if (i === 20) lifted = (poseFor(f, ex).q.J_pecL ? 1 : 0);
        }
        console.log(`[tobihaze pose] ${tier} ${T.from}>${T.to}: lowest pectoral contact ${worst.toFixed(3)} mm over the ground`);
        expect(lifted).toBe(1);
        expect(worst, `${T.from}>${T.to}`).toBeGreaterThan(-0.15);
      }
    });
  }
});

// ------------------------------------------------------------------------------------------------ eyes, head, swim, hop

describe('トビハゼ pose: the turret eyes and the head', () => {
  for (const tier of ['hero', 'lod1'] as const) {
    it(`${tier}: each eye moves on its own — translated only for its lift and blink, its globe turned for the gaze`, () => {
      const rig = rigOf(tier), x = tx(tier), hl = x.hlMM / 1000;
      const base: PoseFrame = { pose: 'prop', prop: { raise: 15 } };
      const f = (L: object, R: object, blink = { L: 0, R: 0 }) => poseFor({ ...base, eyes: { L, R, blink } }, extrasOf(tier));
      const a = f({ yaw: 40, pitch: 10, lift: 0.03 * hl }, { yaw: -10, pitch: -5, lift: 0.03 * hl });
      // J_eye never turns, its Eye node does, each its own way
      for (const S of ['L', 'R']) expect(angleBetween(new Quaternion(), a.q[`J_eye${S}`])).toBeLessThan(1e-12);
      expect(angleBetween(new Quaternion(...a.eyeNodes.L), a.eyeNodes.R)).toBeGreaterThan(0.3);
      // the alert lift and its corrective; the blink drops the eye 0.1 HL with its blend shape, the other eye open
      expect(a.t.J_eyeL[1]).toBeCloseTo(0.03 * hl, 9);
      expect(a.weights.eyesUpL).toBeCloseTo(0.03 / 0.08, 6);
      const b = f({ yaw: 60, pitch: 30, lift: 0.03 * hl }, { yaw: 60, pitch: 30, lift: 0.03 * hl }, { L: 1, R: 0 });
      expect(b.t.J_eyeL[1]).toBeCloseTo(-x.axes.joints.J_eyeL.translate!.dropM, 9);
      expect(b.weights.blinkL).toBeCloseTo(1, 4);
      expect(b.weights.eyesUpL).toBe(0);
      expect(b.weights.blinkR).toBe(0);
      // (the lid closes over the resting window: the dropped eye's gaze within 20° of the rest, the open one's free)
      const yawOf = (q: number[]) => 2 * Math.atan2(Math.hypot(q[0], q[1], q[2]), q[3]) * 180 / Math.PI;
      expect(yawOf(b.eyeNodes.L)).toBeLessThan(20 * Math.SQRT2 + 1e-6);
      expect(yawOf(b.eyeNodes.R)).toBeGreaterThan(50);
      // the gaze is held in its ranges
      const c = f({ yaw: 500, pitch: -500, lift: 1 }, { yaw: 0, pitch: 0, lift: -1 });
      const E = x.axes.eyes!.L.gaze;
      expect(yawOf(c.eyeNodes.L)).toBeLessThan(Math.hypot(E.yaw.range[1], E.pitch.range[0]) + 1e-6);
      expect(c.t.J_eyeL[1]).toBeLessThanOrEqual(x.axes.joints.J_eyeL.translate!.liftM + 1e-12);
      expect(c.t.J_eyeR[1]).toBe(0);
    });

    it(`${tier}: the gape, the pump, the cheeks and the vents on the head's joints`, () => {
      const x = tx(tier), ex = extrasOf(tier), H = x.axes.head!.poses;
      const head = (h: PoseFrame['head']) => poseFor({ pose: 'rest', head: h }, ex);
      const ref = (name: string, joint: string) => refQuat(x, joint, H[name][joint]);
      // gapeHalf at 32/70 and gapeFull at 1 (the tier's own: lod1's jaw stops at 30°)
      const half = head({ gape: GAPE_HALF }), full = head({ gape: 1 });
      for (const j of Object.keys(H.gapeHalf).filter((k) => k.startsWith('J_') && k in x.axes.joints)) expect(angleBetween(ref('gapeHalf', j), half.q[j]), j).toBeLessThan(1e-7);
      for (const j of Object.keys(H.gapeFull).filter((k) => k.startsWith('J_') && k in x.axes.joints)) expect(angleBetween(ref('gapeFull', j), full.q[j]), j).toBeLessThan(1e-7);
      if (tier === 'hero') { expect(full.weights.gape).toBeCloseTo(1, 6); expect(full.weights.gum).toBeCloseTo(1, 6); expect(half.weights.gape).toBeCloseTo(GAPE_HALF, 6); }
      // the cheeks: inflatedHalf at 0.5, inflated at 1, with their blend shapes
      const ih = head({ inflate: 0.5 }), inf = head({ inflate: 1 });
      for (const j of ['J_suspL', 'J_opercL', 'J_hyoid']) {
        expect(angleBetween(ref('inflatedHalf', j), ih.q[j]), j).toBeLessThan(1e-7);
        expect(angleBetween(ref('inflated', j), inf.q[j]), j).toBeLessThan(1e-7);
      }
      expect(ih.weights.inflate).toBeCloseTo(0.5, 9); expect(ih.weights.inflateMid).toBeCloseTo(1, 9);
      expect(inf.weights.inflate).toBeCloseTo(1, 9); expect(inf.weights.inflateMid).toBeCloseTo(0, 9);
      // the pump and the vents
      const g = head({ gulp: 1 }), v = head({ vent: 1 }), vi = head({ vent: 1, inflate: 1 });
      expect(g.weights.throat).toBe(1);
      expect(angleBetween(ref('gulp', 'J_hyoid'), g.q.J_hyoid)).toBeLessThan(1e-7);
      expect(angleBetween(ref('vent', 'J_opercL'), v.q.J_opercL)).toBeLessThan(1e-7);
      // (the vents shut while the cheeks are full)
      expect(angleBetween(ref('inflated', 'J_opercL'), vi.q.J_opercL)).toBeLessThan(1e-7);
    });
  }

  it('lod2: the merged eyes are its Body\'s alert blend shape, closed by a blink', () => {
    const ex = extrasOf('lod2'), hl = tx('lod2').hlMM / 1000;
    const up = poseFor({ pose: 'prop', eyes: { L: { lift: 0.03 * hl }, R: { lift: 0.03 * hl }, blink: { L: 0, R: 0 } } }, ex);
    const shut = poseFor({ pose: 'prop', eyes: { L: { lift: 0.03 * hl }, R: { lift: 0.03 * hl }, blink: { L: 1, R: 1 } } }, ex);
    const down = poseFor({ pose: 'rest', eyes: { L: { lift: 0 }, R: { lift: 0 }, blink: { L: 0, R: 0 } } }, ex);
    expect(up.weights.alert).toBeCloseTo(1, 9);
    expect(shut.weights.alert).toBe(0);
    expect(down.weights.alert).toBe(0);
  });
});

describe('トビハゼ pose: swimming and hopping bend the spine within its budget', () => {
  for (const tier of TIERS) {
    it(`${tier}: the travelling wave, the turn, the J-curl and the arch stay in range and in the curl budget`, () => {
      const rig = rigOf(tier), out = createPose(rig);
      const yaws = (f: PoseFrame) => {
        poseInto(rig, f, out);
        const v: number[] = [];
        for (const nm of ['J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal']) {
          const j = rig.joints[rig.index[nm]], q = out.q.subarray(j.i * 4, j.i * 4 + 4);
          // (yaw about the joint's −Y: the angle of the rotation's Y part)
          v.push((2 * Math.atan2(-q[1], q[3]) * 180) / Math.PI);
        }
        return v;
      };
      const sum = (v: number[]) => v.reduce((a, b) => a + Math.abs(b), 0);
      const a = yaws({ pose: 'swim', swim: { phase: 0, amp: 1, speed: 2 } }), b = yaws({ pose: 'swim', swim: { phase: 0.25, amp: 1, speed: 2 } });
      // the wave travels: a quarter cycle on, the tail's bend has moved
      expect(Math.abs(a[7] - b[7])).toBeGreaterThan(2);
      // the rear two thirds carry it (the stiff front bends little)
      expect(Math.abs(a[0])).toBeLessThan(Math.max(...a.slice(4).map(Math.abs)));
      for (let ph = 0; ph < 1; ph += 0.05) expect(sum(yaws({ pose: 'swim', swim: { phase: ph, amp: 1.5, turn: 3 } }))).toBeLessThanOrEqual(220 + 1e-6);
      // the J-curl of the land jump (sharpest at two thirds of the length), the tail to the left at +1
      const j = yaws({ pose: 'prop', hop: { stage: 'coil', curl: 1 } });
      expect(j.indexOf(Math.max(...j))).toBeGreaterThanOrEqual(3);
      expect(sum(j)).toBeLessThanOrEqual(220 + 1e-6);
      expect(j.every((y) => y >= 0)).toBe(true);
      // every channel inside its range whatever the frame asks
      poseInto(rig, { pose: 'swim', swim: { phase: 0.3, amp: 1.5, turn: -4 }, hop: { curl: -1, arch: 1, stage: 'air' }, head: { gape: 1, inflate: 1, gulp: 1, vent: 1 }, fins: { d1: 1, median: 1, caudal: 1 } }, out);
      for (const jt of rig.joints) for (let k = 0; k < 4; k++) expect(Number.isFinite(out.q[jt.i * 4 + k])).toBe(true);
      for (const w of out.w) { expect(w).toBeGreaterThanOrEqual(-1); expect(w).toBeLessThanOrEqual(1); }
    });
  }
});

// ------------------------------------------------------------------------------------------------ binding

/** The GLB's node graph as three objects (bones, meshes with their blend shapes by name), as GLTFLoader builds it. */
function modelOf(tier: Tier) {
  const J = glb(tier), joints = new Set(J.skins.flatMap((s) => s.joints)), root = new Group();
  const bones: Record<string, Object3D> = {}, meshes: Object3D[] = [];
  const nodes = J.nodes.map((n, i) => {
    let node: Object3D;
    if (n.mesh !== undefined) {
      const md = J.meshes[n.mesh], names = md.extras?.targetNames ?? [];
      const make = (name: string) => { const m = new Mesh(); m.name = name; if (names.length) { m.morphTargetDictionary = Object.fromEntries(names.map((t, k) => [t, k])); m.morphTargetInfluences = names.map(() => 0); } meshes.push(m); return m; };
      if (md.primitives.length === 1) node = make(n.name ?? '');
      else { node = new Group(); md.primitives.forEach((_, k) => node.add(make(`${n.name}_${k}`))); }
    } else node = joints.has(i) ? new Bone() : new Object3D();
    node.name = n.name ?? '';
    if (n.translation) node.position.fromArray(n.translation);
    if (n.rotation) node.quaternion.fromArray(n.rotation);
    if (joints.has(i)) bones[node.name] = node;
    return node;
  });
  J.nodes.forEach((n, i) => { for (const c of n.children ?? []) nodes[i].add(nodes[c]); });
  for (const i of J.scenes[J.scene ?? 0].nodes) root.add(nodes[i]);
  return { root, bones, meshes };
}

describe('トビハゼ pose: every tier binds and three agrees with the module', () => {
  for (const tier of TIERS) {
    it(`${tier}: the bones, the Eye nodes and the blend shapes by name; three's world matrices give the module's contacts`, () => {
      const rig = rigOf(tier), x = tx(tier), model = modelOf(tier), bind = bindPose(rig, model);
      expect(bind.missing).toEqual([]);
      expect(bind.joints.length).toBe(rig.joints.length);
      expect(bind.eyes.filter(Boolean).length).toBe(tier === 'lod2' ? 0 : 2);
      // every blend shape a pose or the head weights reaches a mesh that has it
      const bound = new Set(bind.morphs.map((m) => rig.targets[m.k]));
      const meshTargets = new Set(model.meshes.flatMap((m) => Object.keys((m as Mesh).morphTargetDictionary ?? {})));
      for (const t of meshTargets) expect(bound.has(t), `${tier}: ${t} unbound`).toBe(true);
      const out = createPose(rig), W = newWorld(rig);
      for (const [state, cs] of Object.entries(x.contacts)) {
        poseInto(rig, { pose: state, head: { gape: 0.3, inflate: 0.4 }, eyes: { L: { yaw: 30, pitch: 5, lift: 0.0003 }, R: { yaw: 0, pitch: 0, lift: 0 }, blink: { L: 0, R: 0.5 } } }, out);
        applyPose(bind, out);
        model.root.updateMatrixWorld(true);
        worldOf(rig, out, W);
        for (const c of cs) {
          const p3 = new Vector3(...c.local).applyMatrix4(bones(model, c.bone).matrixWorld), p = pointOf(rig, W, c.bone, c.local);
          // (within 10 µm: the extras' pivots are the nodes' translations rounded to the micrometre, down a chain of six)
          expect(p3.distanceTo(new Vector3(p[0], p[1], p[2])), `${tier} ${state} ${c.name}`).toBeLessThan(1e-5);
        }
        // the Eye nodes sit on their joints and turn with the gaze
        if (tier !== 'lod2') {
          const eye = model.root.getObjectByName('Eye_L')!, je = bones(model, 'J_eyeL');
          expect(eye.getWorldPosition(new Vector3()).distanceTo(je.getWorldPosition(new Vector3()))).toBeLessThan(1e-12);
          expect(eye.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0.1);
        }
        for (const m of model.meshes) for (const w of (m as Mesh).morphTargetInfluences ?? []) expect(Number.isFinite(w)).toBe(true);
      }
    });
  }
  const bones = (m: ReturnType<typeof modelOf>, name: string) => m.bones[name] ?? m.root.getObjectByName(name)!;
});

describe('トビハゼ pose: the cost', () => {
  it('poses a frame in a few microseconds on every tier', () => {
    for (const tier of TIERS) {
      const rig = rigOf(tier), out = createPose(rig), hl = tx(tier).hlMM / 1000;
      const frame = (i: number): PoseFrame => ({
        pose: 'crawl', crawl: { phase: (i * 0.0131) % 1, turn: 0.2 }, eyes: { L: { yaw: 10 + (i % 7), pitch: 3, lift: 0.03 * hl }, R: { yaw: 20, pitch: 0, lift: 0.03 * hl }, blink: { L: 0, R: (i % 13) / 13 } },
        head: { gape: 0.05, gulp: 0.3, inflate: 0.2, vent: 0 }, fins: { d1: 0.4, median: 0.3, caudal: 0 },
      });
      for (let i = 0; i < 2000; i++) poseInto(rig, frame(i), out);
      const t0 = performance.now(), N = 20000;
      for (let i = 0; i < N; i++) poseInto(rig, frame(i), out);
      const us = ((performance.now() - t0) * 1000) / N;
      console.log(`[tobihaze pose] ${tier}: ${rig.joints.length} joints, ${rig.targets.length} blend shapes, ${us.toFixed(2)} µs a frame (crawl, eyes, head, fins)`);
      // (a generous bound: CI machines vary; the far tier is the cheapest)
      expect(us).toBeLessThan(150);
    }
  });
});
