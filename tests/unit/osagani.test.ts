import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { CHELA_MALE, CW_MM, EYE, WALKING, chelaFor, legSpecs } from '../../src/creatures/species/osagani/anatomy';
import { LODS, outline } from '../../src/creatures/species/osagani/geometry';
import { osaganiGeometry, osaganiRig } from '../../src/creatures/species/osagani/model';
import { applyPose, createBones, legKey, legTip, planarOf } from '../../src/creatures/species/osagani/rig';
import { neutralFoot, stillPose } from '../../src/creatures/species/osagani/poses';
import { createCrabBehavior, MODES, type CrabWorld } from '../../src/creatures/species/osagani/behavior';
import budget from '../../tools/models/budget.json';

const rig = osaganiRig();

/** a bumpy mud flat (mm-scale ripples over a gentle tilt) */
const bumpy = (x: number, z: number) => 0.004 * Math.sin(x * 9) * Math.cos(z * 7) + 0.0015 * Math.sin(x * 61 + z * 37) + 0.02 * x;
const world = (ground = bumpy, water = -1): CrabWorld => ({ ground, waterY: () => water });

/** the walking legs' dactylus tips in the world from the bones (the pose as drawn) */
function tips(beh: ReturnType<typeof createCrabBehavior>, root: Group, bones: Record<string, import('three').Bone>, scale: number) {
  root.scale.setScalar(scale);
  applyPose(root, bones, rig, beh.pose, 1);
  return rig.legs.filter((l) => l.id !== 'P1').map((leg) => {
    const da = bones[`J_${leg.id}${leg.side}_da`];
    return { leg, p: new Vector3(leg.lengths[5] / 1000, 0, 0).applyMatrix4(da.matrixWorld) };
  });
}

describe('ヤマトオサガニ: the body plan', () => {
  it('a transversely rectangular carapace: CL ≈ 0.56 CW (the scan), the sides nearly parallel, three anterolateral teeth', () => {
    const loop = outline(LODS[0]);
    const xs = loop.map((e) => e.x), zs = loop.map((e) => e.z);
    const cw = Math.max(...xs) - Math.min(...xs);
    const cl = Math.max(...zs) - Math.min(...zs);
    expect(cw).toBeGreaterThan(CW_MM * 0.98);
    expect(cw).toBeLessThan(CW_MM * 1.06);
    // (the CC0 scan's specimen: shorter than Wada's (2018) Shirahama males, CL ≈ 0.68 of the width between the
    // external orbital angles)
    expect(cl / cw).toBeGreaterThan(0.5);
    expect(cl / cw).toBeLessThan(0.6);
    // nearly as wide at mid-length as at the external orbital teeth (not an ellipse)
    const half = (z: number) => Math.max(...loop.filter((e) => Math.abs(e.z - z) < 0.6 && e.x > 0).map((e) => e.x));
    expect(half(0) / half(5.9)).toBeGreaterThan(0.95);
    // the posterior margin broad and straight
    expect(half(Math.min(...zs) + 1.5) * 2 / cw).toBeGreaterThan(0.55);
    // the teeth: three outward tips on the anterolateral margin of each side
    const left = loop.filter((e) => e.x > 14 && e.z > 0.5 && e.z < 11);
    let tipsN = 0;
    for (let i = 1; i < left.length - 1; i++) if (left[i].kind === 'T') tipsN++;
    expect(tipsN).toBe(3);
  });

  it('long, slender eyestalks with a collar, a waist and a wider cornea, set close to the midline', () => {
    const len = EYE.basal + EYE.stalk + EYE.cornea;
    expect(len / CW_MM).toBeGreaterThan(0.36);
    expect(EYE.stalkR * 2 / EYE.stalk).toBeLessThan(0.12);
    expect(EYE.basalR).toBeGreaterThan(EYE.stalkR * 1.3);
    expect(EYE.waist).toBeLessThan(EYE.stalkR);
    expect(EYE.corneaR).toBeGreaterThan(EYE.stalkR * 1.15);
    expect(EYE.base[0] * 2 / CW_MM).toBeLessThan(0.3);
  });

  it('the walking legs: P4 ≥ P3 > P2 > P5, the articles in proportion (merus longest, carpus shortest of the three)', () => {
    const len = (k: 'P2' | 'P3' | 'P4' | 'P5') => { const w = WALKING[k]; return w.me + w.ca + w.pr + w.da; };
    expect(len('P4')).toBeGreaterThanOrEqual(len('P3'));
    expect(len('P3')).toBeGreaterThan(len('P2'));
    expect(len('P2')).toBeGreaterThan(len('P5'));
    expect(len('P4') / CW_MM).toBeGreaterThan(0.9);
    expect(len('P5') / CW_MM).toBeLessThan(0.75);
    for (const k of ['P2', 'P3', 'P4', 'P5'] as const) {
      const w = WALKING[k];
      expect(w.me / len(k)).toBeGreaterThan(0.38);
      expect(w.ca).toBeLessThan(w.pr);
      expect(w.da).toBeLessThan(w.pr);
    }
  });

  it('no leg article is a cylinder: compressed sections, a necked joint, tapering to a sharp dactylus', () => {
    for (const spec of legSpecs()) {
      if (spec.id === 'P1') continue;
      const art = (n: string) => spec.articles.find((a) => a.name === n)!;
      const me = art('me'), da = art('da');
      const mid = me.sections.reduce((a, b) => (b.hy > a.hy ? b : a));
      // the merus a deep blade standing in the knee's plane: half as thick as high or less, deep for its length, its
      // dorsal margin a keel (a teardrop section: the scan's legs)
      expect(mid.hy / mid.hz).toBeGreaterThan(1.5);
      expect((mid.hy * 2) / me.length).toBeGreaterThan(0.25);
      expect(me.tear ?? 0).toBeGreaterThan(0.2);
      // the dactylus flattened the other way: broader across the leg's plane than in it
      const dmid = da.sections[1];
      expect(dmid.hz).toBeGreaterThan(dmid.hy);
      // necks at the joints
      for (const n of ['bi', 'me', 'ca', 'pr', 'da']) expect(art(n).neck ?? 0).toBeGreaterThan(0.03);
      // the dactylus ends in a point
      expect(da.sections[da.sections.length - 1].hy).toBeLessThan(0.05);
      // slighter from the merus out to the dactylus (the sections' areas; P5's propodus a flat oval as high as its carpus)
      const area = (a: typeof me) => Math.max(...a.sections.map((s) => s.hy * s.hz));
      expect(area(art('ca'))).toBeLessThan(area(me));
      expect(area(art('pr'))).toBeLessThan(area(me));
      expect(area(da)).toBeLessThan(area(art('pr')) / 2);
    }
  });

  it("the mature male's chela large (propodus ≈ 0.95 CW) with deflexed fingers; the female's small", () => {
    // from the palm's joint to the closed fingertip, and the fingers ≈ 40° below the palm's axis (A45, square-on)
    expect(Math.hypot(...CHELA_MALE.tip) / CW_MM).toBeGreaterThan(0.85);
    expect(CHELA_MALE.fingerAngle).toBeLessThan(-0.5);
    expect(CHELA_MALE.fingerAngle).toBeGreaterThan(-0.9);
    // the palm tallest distally, where the fingers spring from it
    const hy = CHELA_MALE.palm.sections.map((s) => s.hy);
    expect(hy[hy.length - 1]).toBeGreaterThanOrEqual(Math.max(...hy));
    expect(hy[hy.length - 1] * 2 / CHELA_MALE.palm.length).toBeGreaterThan(0.5);
    expect(chelaFor('f', 35).male).toBe(false);
    expect(chelaFor('m', 35).male).toBe(true);
    expect(chelaFor('m', 14).male).toBe(false);
    expect(chelaFor('m', 24).arm).toBeLessThan(chelaFor('m', 38).arm);
  });
});

describe('ヤマトオサガニ: the tiers within the model budget (M class)', () => {
  const lim = budget.limits;
  it('triangles and joints per tier', () => {
    const g0 = osaganiGeometry(0), g1 = osaganiGeometry(1), g2 = osaganiGeometry(2);
    expect(g0.triangles).toBeLessThanOrEqual(lim.hero.M.tris);
    expect(g1.triangles).toBeLessThanOrEqual(lim.lod1.M.tris);
    expect(g2.triangles).toBeLessThanOrEqual(lim.lod2.M.tris);
    // really lighter at each step
    expect(g1.triangles).toBeLessThan(g0.triangles / 5);
    expect(g2.triangles).toBeLessThan(g1.triangles / 5);
    expect(g0.bones.length).toBeLessThanOrEqual(lim.hero.M.joints);
    expect(g1.bones.length).toBeLessThanOrEqual(lim.lod1.M.joints);
    expect(g2.bones.length).toBeLessThanOrEqual(lim.lod2.M.joints);
  });
  it('no broken vertices', () => {
    for (const t of [0, 1, 2] as const) {
      const p = osaganiGeometry(t).shell.attributes.position.array;
      for (let i = 0; i < p.length; i++) expect(Number.isFinite(p[i])).toBe(true);
    }
  });
});

describe('ヤマトオサガニ: legs on the mud', () => {
  it('the IK puts every dactylus on its target (the knee yaw allowed for)', () => {
    for (const kind of ['stand', 'rest'] as const) {
      const P = stillPose(rig, kind);
      for (const leg of rig.legs) {
        if (leg.id === 'P1') continue;
        const want = neutralFoot(leg, P.lift, kind === 'rest' ? 1.5 : 1);
        const got = legTip(leg, planarOf(leg), P.legs[legKey(leg.id, leg.side)]);
        expect(got.distanceTo(want)).toBeLessThan(0.3);
      }
    }
  });

  it('standing: the meri raised above the horizontal, the distal legs steeply down', () => {
    const P = stillPose(rig, 'stand');
    for (const leg of rig.legs) {
      if (leg.id === 'P1' || leg.id === 'P5') continue;
      const L = P.legs[legKey(leg.id, leg.side)];
      expect(L.pitch + L.lev).toBeGreaterThan(0.1);
      expect(L.pitch + L.lev + L.mc + L.cp).toBeLessThan(-0.9);
    }
  });

  it('walking sideways it steps: each foot lifts and lands, planted feet stay on the mud and none goes into it', () => {
    const root = new Group();
    const { bones } = createBones(rig, root);
    const cw = 0.035;
    const beh = createCrabBehavior({ world: world(), rng: mulberry(7), rig, scale: cw, start: { x: 0, z: 0, heading: 0.3 } });
    beh.walk({ x: 0.25, z: 0.05 });
    const lifts = new Map<string, number>();
    const wasUp = new Map<string, boolean>();
    let worst = 0;
    const start = beh.pos.clone();
    for (let i = 0; i < 120; i++) {
      beh.update(1 / 40, 0);
      for (const { leg, p } of tips(beh, root, bones, 1)) {
        const g = bumpy(p.x, p.z);
        const k = legKey(leg.id, leg.side);
        const up = p.y - g > cw * 0.03;
        if (up && !wasUp.get(k)) lifts.set(k, (lifts.get(k) ?? 0) + 1);
        wasUp.set(k, up);
        worst = Math.min(worst, p.y - g);
      }
    }
    // (a little below the mean surface where a dactylus tip pricks into it, never through it)
    expect(worst).toBeGreaterThan(-cw * 0.03);
    for (const leg of rig.legs) if (leg.id !== 'P1') expect(lifts.get(legKey(leg.id, leg.side)) ?? 0).toBeGreaterThanOrEqual(2);
    // it went sideways (not forward)
    const moved = beh.pos.clone().sub(start);
    expect(moved.length()).toBeGreaterThan(cw * 2);
    const fwd = new Vector3(Math.sin(beh.state.heading), 0, Math.cos(beh.state.heading));
    expect(Math.abs(moved.clone().normalize().dot(fwd))).toBeLessThan(0.5);
  });

  it('standing still on bumpy mud every foot is on the mud', () => {
    const root = new Group();
    const { bones } = createBones(rig, root);
    const beh = createCrabBehavior({ world: world(), rng: mulberry(3), rig, scale: 0.035, start: { x: 0.1, z: -0.2, heading: 1.1 } });
    beh.idle(10);
    for (let i = 0; i < 40; i++) beh.update(1 / 40, 0);
    for (const { p } of tips(beh, root, bones, 1)) expect(Math.abs(p.y - bumpy(p.x, p.z))).toBeLessThan(0.0012);
  });
});

describe('ヤマトオサガニ: behaviour round the burrow', () => {
  const burrow = { x: 0.12, z: 0.05, az: 0.7 };
  const mk = (seed = 5, extra = {}) => createCrabBehavior({ world: world((x, z) => 0.01 * Math.sin(x * 5)), rng: mulberry(seed), rig, scale: 0.035, start: { x: 0, z: 0, heading: 0 }, burrow, ...extra });
  const run = (b: ReturnType<typeof mk>, s: number, tier: 0 | 1 | 2 = 0) => { for (let i = 0; i < s * 40; i++) b.update(1 / 40, tier); };

  it('has the seven states', () => {
    expect([...MODES]).toEqual(['IDLE', 'WALK', 'FORAGE', 'BURROW_ENTRY', 'BURROW_EXIT', 'DEFEND', 'ESCAPE']);
  });

  it('goes back to its burrow and down it, out of sight; comes out eyestalks first', () => {
    const b = mk();
    b.enterBurrow(30);
    expect(b.state.mode).toBe('BURROW_ENTRY');
    run(b, 6);
    expect(b.state.phase).toBe('in');
    expect(b.hidden).toBe(true);
    expect(Math.hypot(b.pos.x - burrow.x, b.pos.z - burrow.z)).toBeLessThan(0.01);
    // down the shaft: below the mud
    expect(b.pose.pos.y).toBeLessThan(0.01 * Math.sin(burrow.x * 5) - 0.02);
    b.exitBurrow(1.5);
    run(b, 0.8);
    expect(b.state.mode).toBe('BURROW_EXIT');
    expect(b.state.phase).toBe('peek');
    expect(b.hidden).toBe(false);
    // only the eyestalks out: up, while the carapace is under the mud's level
    expect(b.pose.eyeRaise[0]).toBeGreaterThan(0.9);
    expect(b.pose.lift).toBeLessThan(-15);
    // and no leg over the mud: the long walking legs folded beside the body, the claws drawn in
    {
      const root = new Group();
      const { bones } = createBones(rig, root);
      applyPose(root, bones, rig, b.pose, 1);
      const ground = (x: number) => 0.01 * Math.sin(x * 5);
      for (const leg of rig.legs) for (const a of ['me', 'ca', 'pr', 'da'] as const) {
        const p = new Vector3().setFromMatrixPosition(bones[`J_${leg.id}${leg.side}_${a}`].matrixWorld);
        expect(p.y).toBeLessThan(ground(p.x));
      }
    }
    run(b, 3);
    expect(b.state.burrow).toBeLessThan(0.05);
    expect(b.state.mode).toBe('IDLE');
  });

  it('a danger near: it runs home and goes down; far from home it runs away', () => {
    const b = mk(9);
    b.escape(new Vector3(-0.3, 0, -0.1));
    expect(b.state.mode).toBe('ESCAPE');
    run(b, 0.3);
    expect(b.state.vel.length()).toBeGreaterThan(0.035 * 2);
    run(b, 4);
    expect(b.hidden).toBe(true);
    const far = createCrabBehavior({ world: world(), rng: mulberry(4), rig, scale: 0.035, start: { x: 0, z: 0, heading: 0 }, burrow: { x: 5, z: 5, az: 0 } });
    far.escape(new Vector3(0.1, 0, 0));
    expect(far.state.phase).toBe('run');
    run(far, 1);
    expect(far.pos.x).toBeLessThan(-0.05);
  });

  it('defends facing the danger, tall, the claws raised', () => {
    const b = mk(2);
    const from = new Vector3(0, 0, 0.5);
    b.defend(from, 5);
    run(b, 1.5);
    expect(b.state.mode).toBe('DEFEND');
    const h = Math.atan2(from.x - b.pos.x, from.z - b.pos.z);
    expect(Math.abs(Math.atan2(Math.sin(h - b.state.heading), Math.cos(h - b.state.heading)))).toBeLessThan(0.3);
    expect(b.pose.lift).toBeGreaterThan(9);
    expect(b.pose.legs.P1L.lev).toBeGreaterThan(0.7);
  });

  it('forages: the claws take turns at the mud, the maxillipeds work', () => {
    const b = mk(11);
    b.forage(10);
    let maxL = -9, minL = 9;
    for (let i = 0; i < 120; i++) { b.update(1 / 40, 0); maxL = Math.max(maxL, b.pose.legs.P1L.lev); minL = Math.min(minL, b.pose.legs.P1L.lev); }
    expect(b.state.mode).toBe('FORAGE');
    expect(maxL - minL).toBeGreaterThan(0.15);
    expect(b.pose.mxp).toBeGreaterThan(0);
  });

  it("the male's fingertips at the mud's surface, not in it: standing, resting low by the burrow, feeding", () => {
    const root = new Group();
    const { bones } = createBones(rig, root);
    const ground = (x: number) => 0.01 * Math.sin(x * 5);
    const b = mk(21);
    const arm = chelaFor('m', 35).arm, tip = new Vector3();
    const seen = new Set<string>();
    let low = 1;
    const check = () => {
      if (b.state.burrow > 0.02 || b.state.mode === 'DEFEND') return;
      seen.add(`${b.state.mode}/${b.state.phase}`);
      applyPose(root, bones, rig, b.pose, arm);
      for (const s of ['L', 'R']) {
        tip.set(CHELA_MALE.tip[0] / 1000, CHELA_MALE.tip[1] / 1000, 0).applyMatrix4(bones[`J_P1${s}_pr`].matrixWorld);
        low = Math.min(low, tip.y - ground(tip.x));
      }
    };
    const go = (s: number) => { for (let i = 0; i < s * 40; i++) { b.update(1 / 40, 0); check(); } };
    b.idle(4); go(3);
    b.enterBurrow(30); go(6);
    b.exitBurrow(1.5); go(4);
    b.forage(10); go(6);
    expect(seen.has('IDLE/mouth')).toBe(true);
    expect(seen.has('FORAGE/scoop')).toBe(true);
    expect(low).toBeGreaterThan(-0.0012);
  });

  it('every state runs at every tier without broken numbers', () => {
    for (const tier of [0, 1, 2] as const) {
      const b = mk(13 + tier, { autonomous: true });
      run(b, 25, tier);
      for (const v of [b.pos.x, b.pos.y, b.pos.z, b.pose.lift, ...Object.values(b.pose.legs).flatMap((l) => Object.values(l))]) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

function mulberry(a: number) {
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
