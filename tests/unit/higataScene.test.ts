import { describe, it, expect } from 'vitest';
import * as poseJs from '../../src/scene-higata/fish/pose.js';
import * as terrainJs from '../../src/scene-higata/world/Terrain.js';
import * as wavesJs from '../../src/scene-higata/world/waves.js';

// the scene is plain JavaScript: use its modules untyped
const createPoseModel = (poseJs as any).createPoseModel as (body?: unknown) => any;
const Mudflat = (terrainJs as any).Mudflat as new (o: { seed: number }) => any;
const createWaves = (wavesJs as any).createWaves as (o: { depth: number }) => any;

// axial geometry of the adult エドハゼ as stored in its glTF rig extras
const EDO_BODY = {
  tlMM: 45.3,
  spine: [['J_head', 8.2], ['J_root', 12], ['J_sp1', 15], ['J_sp2', 18.6], ['J_sp3', 22.2], ['J_sp4', 25.8], ['J_sp5', 29.4], ['J_sp6', 33], ['J_sp7', 36.4], ['J_caudal', 39.5], ['J_caudal2', 42.4]],
  restFold: { d1: 0.1, d2: 0.08, anal: 0.08, caudal: 0.37 },
};

describe('higata scene: pose models', () => {
  it('keeps the geometry of two species apart', () => {
    const maha = createPoseModel();
    const edo = createPoseModel(EDO_BODY);
    expect(maha.TL_MM).toBe(50.5);
    expect(edo.TL_MM).toBe(45.3);
    expect(maha.SPINE.find((s: [string, number]) => s[0] === 'J_root')[1]).toBe(13);
    expect(edo.SPINE.find((s: [string, number]) => s[0] === 'J_root')[1]).toBe(12);
    expect(maha.REST_FOLD.d1).toBe(0.55);
    expect(edo.REST_FOLD.d1).toBe(0.1);
    // a straight, resting body has no lateral bend
    const { local } = maha.spineAngles(0, 0, 0);
    for (const v of Object.values(local)) expect(Math.abs(v as number)).toBeLessThan(1e-9);
  });

  it('turns a dorsoventral path bend into joint rotations', () => {
    const edo = createPoseModel(EDO_BODY);
    const axes = { headUp: [-1, 0, 0], jaw: [1, 0, 0], suspL: [0, 0, 1], suspR: [0, 0, -1], jawJointL: [0.00145, -0.002, 0.019], symphysis: [0, -0.0014, 0.0227], jawSpreadK: 0.67, hyoid: [-1, 0, 0], opercL: [0, -1, 0], opercR: [0, 1, 0], pecL: [0, -1, 0], pecR: [0, 1, 0], pecDepL: [0, 0, -1], pecDepR: [0, 0, 1] };
    const p = edo.defaultPose();
    p.segPitch = { J_sp1: -0.5, J_sp2: -1.0 };
    const pose = edo.computePose(p, axes);
    // J_sp2 bends by the difference to its parent segment, not by its absolute pitch
    const angle = (q: number[]) => 2 * Math.atan2(Math.hypot(q[0], q[1], q[2]), q[3]);
    expect(angle(pose.q.J_sp1)).toBeCloseTo(0.5, 5);
    expect(angle(pose.q.J_sp2)).toBeCloseTo(0.5, 5);
  });
});

describe('higata scene: mudflat', () => {
  const flat = new Mudflat({ seed: 14 });

  it('is a gently rippled surface around y = 0', () => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 400; i++) {
      const x = (i % 20) / 20 - 0.5, z = Math.floor(i / 20) / 20 - 0.5;
      const h = flat.height(x, z);
      expect(Number.isFinite(h)).toBe(true);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    expect(lo).toBeGreaterThan(-0.03);
    expect(hi).toBeLessThan(0.03);
  });

  it('has burrow openings that are holes with their rim at the surface', () => {
    const near = flat.burrows.filter((b: { far?: boolean }) => !b.far);
    expect(near.length).toBeGreaterThan(5);
    for (const b of near) {
      expect(flat.holeAt(b.x, b.z)).toBe(b);
      expect(flat.holeAt(b.x + b.r * 1.5, b.z)).not.toBe(b);
      // just outside the opening the surface sits close to the rim (no step into the shaft)
      expect(Math.abs(flat.height(b.x + b.r * 1.05, b.z) - b.rimY)).toBeLessThan(0.004);
    }
  });
});

describe('higata scene: ripples', () => {
  it('is a slow swell: shortest component ≥ 5 cm, travelling at the finite-depth wave speed', () => {
    const w = createWaves({ depth: 0.1 });
    const A = w.uniforms.uWaveA.value, B = w.uniforms.uWaveB.value;
    const last = A.length - 1;
    expect(2 * Math.PI / A[last].z).toBeGreaterThan(0.05);
    for (const a of A) expect(a.w * a.z).toBeLessThan(0.02); // gentle: steepness a·k
    const c = B[last].x / A[last].z; // phase speed of the shortest component (λ = 7 cm)
    expect(c).toBeGreaterThan(Math.sqrt(9.81 / A[last].z)); // capillarity adds a little
    expect(c).toBeLessThan(0.4);
  });
});
