import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { computePose, defaultPose, bendFromMidline, SPINE } from '../../src/creatures/species/tobihaze/pose.js';
import { Motor, type MotorWorld, type TobiRig } from '../../src/creatures/species/tobihaze/Motor';

const rig: TobiRig = {
  tlMM: 80, slMM: 64, s0MM: 17, spine: SPINE, eyeRetract_m: 0.0025, eyeRadius_m: 0.0021,
  pec: { base: [0.004, 0.003, 0], wrist: [0.008, -0.0002, -0.0045], dir: [0.48, -0.5, -0.72], width: [0, 1, 0], normal: [1, 0, 0], armLen_m: 0.0064, handLen_m: 0.0076 },
  contacts: { pelvicY_m: -0.002, bellyY: SPINE.map(([n]) => [n, 0]) as [string, number][] },
};

/** a flat of mud sloping down toward +z, with water above z = 0.4 */
function flat(waterY = 0): MotorWorld {
  return {
    ground: (_x, z) => -0.05 * z,
    water: () => waterY,
    fx: null,
    wetGround: 0.9,
    soft: 1,
    sand: false,
    drying: 0.5,
    detail: false,
  };
}

function motor(heading = Math.PI) {
  let s = 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return new Motor(new Object3D(), {}, [], rig, 1, heading, rnd);
}

describe('tobihaze pose model', () => {
  it('produces unit quaternions for every joint', () => {
    const p = defaultPose();
    for (const [n] of SPINE) { p.bend[n] = 0.4; p.lift[n] = -0.3; }
    p.eyeL.yaw = 0.5; p.eyeR.pitch = -0.4; p.eyeL.retract = 1;
    const { q, t, morph } = computePose(p, { eyeRetract_m: 0.0025 });
    for (const v of Object.values(q)) expect(Math.hypot(...v)).toBeCloseTo(1, 6);
    // a retracted eye sinks into the orbit
    expect(t.J_eyeL[1]).toBeLessThan(-0.002);
    expect(morph.Head).toHaveLength(3);
  });

  it('a straight midline gives no bend', () => {
    const b = bendFromMidline(() => 0);
    for (const v of Object.values(b)) expect(Math.abs(v)).toBeLessThan(1e-9);
  });
});

describe('tobihaze motor', () => {
  it('crutches over the mud at about half a body length per second', () => {
    const m = motor(Math.PI);
    const w = flat(-10);
    m.place(0, 0, Math.PI, w);
    const target = new Vector3(0, 0, -0.5);
    m.travel(target, 0.1, 0.2);
    const dt = 1 / 60;
    let t = 0;
    while (t < 4 && !m.done) { m.update(dt, w); t += dt; }
    const moved = -m.pos.z;
    const speed = moved / t;
    expect(m.medium).toBe('land');
    // ~2.1 strokes/s × ~0.24 TL per stroke (Pace & Gibb 2009) ≈ 0.4–0.6 TL/s
    expect(speed / 0.08).toBeGreaterThan(0.3);
    expect(speed / 0.08).toBeLessThan(0.9);
  });

  it('jumps a few body lengths and lands on the mud', () => {
    const m = motor(0);
    const w = flat(-10);
    m.place(0, -0.3, 0, w);
    m.hopToward(Math.PI, 0.2);
    const z0 = m.pos.z;
    let airborne = 0;
    for (let k = 0; k < 120; k++) { m.update(1 / 60, w); if (m.pos.y > w.ground(m.pos.x, m.pos.z) + 0.01) airborne++; }
    expect(airborne).toBeGreaterThan(5);
    // it turned to face the jump and went that way
    expect(z0 - m.pos.z).toBeGreaterThan(0.1);
    expect(m.gait === 'stand' || m.gait === 'hop').toBe(true);
  });

  it('switches to swimming in deep water and back to crawling on the mud', () => {
    const m = motor(0);
    const deep: MotorWorld = { ...flat(0), ground: () => -0.06 };
    m.place(0, 0, 0, deep);
    expect(m.medium).toBe('water');
    expect(m.gait).toBe('swim');
    const dry = flat(-10);
    m.travel(new Vector3(0, 0, -0.2), 0.08, 0.3);
    m.update(1 / 60, dry);
    m.update(1 / 60, dry);
    expect(m.medium).toBe('land');
    expect(m.gait).toBe('crawl');
  });

  it('dries in the air and is wet again in the water', () => {
    const m = motor(0);
    const w = flat(-10);
    m.place(0, 0, 0, w);
    for (let k = 0; k < 60 * 30; k++) m.update(1 / 60, { ...w, drying: 1, wetGround: 0 });
    expect(m.moisture).toBeLessThan(0.95);
    const wet: MotorWorld = { ...flat(0.05), ground: () => -0.06 };
    for (let k = 0; k < 120; k++) m.update(1 / 60, wet);
    expect(m.moisture).toBeGreaterThan(0.99);
  });
});
