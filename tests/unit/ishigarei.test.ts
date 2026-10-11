import { describe, expect, it } from 'vitest';
import { Group, Vector3, type Object3D } from 'three';
import { EYES, FINS, MOUTH, SL_MM, SPINE, dorsalEdge, ventralEdge, surfaceY, eyeCentre, thickTop, thickBot, cleftX } from '../../src/creatures/species/ishigarei/anatomy.js';
import { LODS, buildBody, buildFins, buildEye, buildLips, rigDefinition } from '../../src/creatures/species/ishigarei/geometry.js';
import { createFlounderBehavior, MODES } from '../../src/creatures/species/ishigarei/behavior.js';
import { applyPose, createBones, jawAxis } from '../../src/creatures/species/ishigarei/rig.js';
import { Rng } from '../../src/core/Rng';

/** a rippled sandy bottom: current ripples of 6 cm and a gentle swell, under 30 cm of water */
const ground = (x: number, z: number) => 0.0018 * Math.sin((x * 0.8 + z * 0.6) / 0.061 * 2 * Math.PI) + 0.004 * Math.sin(x * 3.1) * Math.cos(z * 2.3);
function world(extra: Record<string, unknown> = {}) {
  return {
    ground,
    normal: (x: number, z: number, s: number, out: Vector3) => {
      const e = Math.max(0.002, s * 0.5);
      return out.set(-(ground(x + e, z) - ground(x - e, z)), 2 * e, -(ground(x, z + e) - ground(x, z - e))).normalize();
    },
    waterY: () => 0.3,
    others: () => [],
    ...extra,
  };
}

describe('イシガレイ juvenile: anatomy', () => {
  it('is right-eyed: both eyes on the eyed side, the upper eye at the dorsal profile, a little behind the lower', () => {
    for (const e of EYES) {
      const [, , y] = eyeCentre(e);
      expect(y + e.r).toBeGreaterThan(surfaceY(e.s, e.x, 1) + 1.0);
    }
    const [lower, upper] = EYES;
    expect(upper.x).toBeGreaterThan(lower.x + 2.5);
    expect(upper.s).toBeGreaterThan(lower.s);
    expect(dorsalEdge(upper.s) - upper.x).toBeLessThan(2.6);
    const gap = Math.hypot(upper.s - lower.s, upper.x - lower.x) - upper.r - lower.r;
    expect(gap).toBeGreaterThan(0.1);
    expect(gap).toBeLessThan(1.2);
  });

  it('has the proportions of a juvenile flounder', () => {
    let depth = 0;
    for (let s = 0; s <= SL_MM; s += 0.5) depth = Math.max(depth, dorsalEdge(s) - ventralEdge(s));
    expect(depth / SL_MM).toBeGreaterThan(0.4);
    expect(depth / SL_MM).toBeLessThan(0.5);
    expect((thickTop(14) + thickBot(14)) / depth).toBeLessThan(0.25);
    expect(thickTop(20)).toBeGreaterThan(thickBot(20));
    expect(Math.abs(FINS.dorsal.s0 - EYES[1].s)).toBeLessThan(1.0);
    expect(FINS.anal.s0).toBeGreaterThan(FINS.pelvic.s + 3);
  });

  it('has a small terminal mouth as in the photographs', () => {
    const lower = EYES[0];
    // the corner of the mouth under the front edge of the lower eye, further back on the blind side
    expect(Math.abs(MOUTH.cornerTop.s - (lower.s - lower.r))).toBeLessThan(0.6);
    expect(MOUTH.cornerBot.s).toBeGreaterThan(MOUTH.cornerTop.s + 0.3);
    // the cleft runs back and slightly ventrally (about 20°)
    const slope = Math.atan2(cleftX(0, 1) - cleftX(MOUTH.cornerTop.s, 1), MOUTH.cornerTop.s) * 180 / Math.PI;
    expect(slope).toBeGreaterThan(12);
    expect(slope).toBeLessThan(28);
    // the lips stand out in front of the head, the lower jaw a little ahead of the upper; the snout drawn in
    expect(MOUTH.lowerTip).toBeLessThan(MOUTH.upperTip);
    expect(MOUTH.upperTip).toBeLessThan(0);
    expect(dorsalEdge(1.5)).toBeLessThan(0.5 * (dorsalEdge(0.6) + dorsalEdge(2.6)));
    expect(MOUTH.lip.lower).toBeGreaterThan(MOUTH.lip.upper);
  });
});

describe('イシガレイ juvenile: geometry', () => {
  const rig = rigDefinition();
  it('builds every tier without NaN and with normalised weights, each tier much lighter than the last', () => {
    const tris: number[] = [];
    for (const lod of LODS) {
      const b = buildBody(rig, lod), fins = buildFins(rig, lod);
      let n = 0;
      for (const g of [b.body, b.head, ...Object.values(fins)].filter(Boolean)) {
        for (const v of g.attributes.position.array as Float32Array) expect(Number.isFinite(v)).toBe(true);
        const w = g.attributes.skinWeight;
        for (let i = 0; i < w.count; i++) expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 4);
        n += g.index!.count / 3;
      }
      for (const e of EYES) { const g = buildEye(e, lod); if (g) n += g.index!.count / 3; }
      tris.push(n);
    }
    expect(tris[0]).toBeGreaterThan(15000);
    expect(tris[1]).toBeLessThan(tris[0] * 0.35);
    expect(tris[2]).toBeLessThan(1500);
  });

  it('wraps the lips round the front of the snout, the lower lip on the jaw and ahead of the upper', () => {
    const up = buildLips(rig, LODS[0], 1), lo = buildLips(rig, LODS[0], -1);
    const front = (g: typeof up) => { let z = -1; const p = g.attributes.position; for (let i = 0; i < p.count; i++) z = Math.max(z, p.getZ(i)); return z; };
    // model +Z is forward: the lips lead the head, the lower lip furthest
    expect(front(lo)).toBeGreaterThan(front(up));
    const ji = rig.byName.J_jaw, pi = rig.byName.J_premax;
    const owner = (g: typeof up, bone: number) => { const s = g.attributes.skinIndex, w = g.attributes.skinWeight; let k = 0; for (let i = 0; i < s.count; i++) if (s.getX(i) === bone && w.getX(i) > 0.5) k++; return k / s.count; };
    expect(owner(lo, ji)).toBeGreaterThan(0.95);
    expect(owner(up, pi)).toBeGreaterThan(0.5);
  });
});

describe('イシガレイ juvenile: behaviour', () => {
  it('rests, glides near the bottom, buries, forages and escapes without NaN or leaving the bottom far', () => {
    const r = new Rng(5);
    let threat: { pos: Vector3; vel: Vector3 } | null = null;
    const b = createFlounderBehavior({ world: world({ threat: () => threat }), rng: () => r.next(), scale: 1, start: { x: 0.02, z: -0.03, heading: 0.4 }, home: { x: 0, z: 0 }, range: 0.18 });
    const time: Record<string, number> = Object.fromEntries(MODES.map((m: string) => [m, 0]));
    let maxLift = 0, minGap = 1, maxBury = 0;
    for (let t = 0; t < 900; t += 1 / 60) {
      const ph = t % 90;
      threat = ph > 60 && ph < 60.5 ? { pos: new Vector3(b.pos.x + 0.25 * (1 - (ph - 60) / 0.5) + 0.02, b.pos.y + 0.03, b.pos.z), vel: new Vector3(-0.5, -0.2, 0) } : null;
      const P = b.update(1 / 60);
      time[b.state.mode] += 1 / 60;
      expect(Number.isFinite(P.pos.x + P.pos.y + P.pos.z)).toBe(true);
      minGap = Math.min(minGap, P.pos.y - ground(P.pos.x, P.pos.z));
      maxLift = Math.max(maxLift, P.lift);
      maxBury = Math.max(maxBury, P.bury);
    }
    for (const m of MODES) expect(time[m], m).toBeGreaterThan(0);
    expect(time.BOTTOM_REST + time.BURROW_IN_SAND).toBeGreaterThan(0.5 * 900);
    expect(minGap).toBeGreaterThan(-0.0005);
    expect(maxLift).toBeLessThan(0.04);
    expect(maxLift).toBeGreaterThan(0.004);
    expect(maxBury).toBeGreaterThan(0.75);
  });

  it('obeys the brain: does nothing of its own, carries out each intent and settles again', () => {
    const r = new Rng(9);
    const b = createFlounderBehavior({ world: world(), rng: () => r.next(), scale: 1, start: { x: 0, z: 0, heading: 0 }, autonomous: false });
    for (let t = 0; t < 120; t += 1 / 60) b.update(1 / 60);
    expect(b.state.mode).toBe('BOTTOM_REST');
    b.glide({ x: 0.25, z: 0.1 });
    let left = false;
    for (let t = 0; t < 20 && !(left && b.settled); t += 1 / 60) { b.update(1 / 60); left ||= b.state.mode === 'GLIDE_SWIM'; }
    expect(left).toBe(true);
    expect(b.settled).toBe(true);
    expect(Math.hypot(b.pos.x - 0.25, b.pos.z - 0.1)).toBeLessThan(0.12);
    b.burrow(30);
    for (let t = 0; t < 6; t += 1 / 60) b.update(1 / 60);
    expect(b.state.phase).toBe('buried');
    expect(b.pose.bury).toBeGreaterThan(0.7);
  });

  it('stays under the falling tide', () => {
    const r = new Rng(3);
    let water = 0.3;
    const b = createFlounderBehavior({ world: world({ waterY: () => water }), rng: () => r.next(), scale: 1, start: { x: 0, z: 0, heading: 0 }, autonomous: false });
    b.glide({ x: 0.3, z: 0 });
    for (let t = 0; t < 8; t += 1 / 60) { water = Math.max(0.012, water - 0.04 / 60); const P = b.update(1 / 60); expect(P.pos.y + 0.003).toBeLessThan(water + 0.004); }
  });

  it('drapes its skeleton over the ripples (forward kinematics)', () => {
    const rig = rigDefinition(), root = new Group(), axis = jawAxis();
    const { bones } = createBones(rig, root) as unknown as { bones: Record<string, Object3D> };
    const r = new Rng(11);
    const b = createFlounderBehavior({ world: world(), rng: () => r.next(), scale: 1, start: { x: 0.03, z: 0.01, heading: 1.1 }, autonomous: false });
    let worst = 0;
    const v = new Vector3();
    for (let t = 0; t < 4; t += 1 / 60) {
      const P = b.update(1 / 60);
      applyPose(root, bones, P, axis);
      if (t < 1.5) continue;
      for (const [name, s] of SPINE as [string, number][]) {
        if (s > 56) continue;
        bones[name].getWorldPosition(v);
        worst = Math.max(worst, Math.abs(v.y - ground(v.x, v.z) - thickBot(s) * 0.001));
      }
    }
    expect(worst).toBeLessThan(0.0014);
  });
});
