import { describe, expect, it } from 'vitest';
import { SurfZone } from '../../src/world/SurfZone';
import { abreu, breakerIndex, breakerType, breakingDepth, classifyDepth, iribarren, phaseSpeed, runup2, seaStateFor, swashEvent, swashFront, waveShape } from '../../src/world/surfPhysics';
import { heightAt, offshore, REF_TIDE, RES, SIZE, ZERO_X } from '../../src/world/maps/hashirimizu/shape';
import { HASHIRIMIZU } from '../../src/world/maps/hashirimizu';

/** a terrain grid from a height function over SIZE m at RES points (the bake's input) */
function grid(h: (x: number, z: number) => number, n = RES, size = SIZE) {
  const heights = new Float32Array(n * n), half = size / 2, cell = size / (n - 1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = h(-half + i * cell, -half + j * cell);
  return { n, size, heights };
}
const SEA = { height: 0.32, period: 3.8, angle: 0, spread: 0.18 };

describe('surf physics', () => {
  it('follows the literature values', () => {
    // Weggel: a little over 1 on a 1:20 beach for short waves, higher on steeper beds, near McCowan's 0.78 on flat ones
    expect(breakerIndex(0.05, 0.3, 3.8)).toBeGreaterThan(1.0);
    expect(breakerIndex(0.05, 0.3, 3.8)).toBeLessThan(1.15);
    expect(breakerIndex(0.11, 0.3, 3.8)).toBeGreaterThan(breakerIndex(0.05, 0.3, 3.8));
    expect(breakerIndex(0.01, 0.3, 3.8)).toBeLessThan(0.85);
    // Battjes' thresholds: the same wave spills on the clam flat and plunges on the beach face
    const Hb = 0.35;
    expect(breakerType(iribarren(0.04, Hb, 3.8))).toBe('spilling');
    expect(breakerType(iribarren(0.11, Hb, 3.8))).toBe('plunging');
    // the phase speed: √(gD) in the shallows, gT/2π in deep water
    expect(phaseSpeed(3.8, 0.2)).toBeCloseTo(Math.sqrt(9.81 * 0.2), 1);
    expect(phaseSpeed(3.8, 50)).toBeCloseTo((9.81 * 3.8) / (2 * Math.PI), 1);
    // run-up of a few tens of centimetres for these small waves, more on a steeper face
    expect(runup2(0.32, 3.8, 0.1)).toBeGreaterThan(0.12);
    expect(runup2(0.32, 3.8, 0.1)).toBeLessThan(0.35);
    // the depth a wave breaks in is about its height over the breaker index
    const Db = breakingDepth(0.32, 3.2, 0.05, 3.8);
    expect(Db).toBeGreaterThan(0.3);
    expect(Db).toBeLessThan(0.5);
  });

  it('runs the swash up fast and back slowly', () => {
    const s = swashEvent(0.2, 0.08);
    expect(s.reach).toBeCloseTo(2.5, 5);
    expect(swashFront(s, s.tUp)).toBeCloseTo(s.reach, 5);
    expect(swashFront(s, s.tUp * 0.5)).toBeGreaterThan(0.7 * s.reach);
    expect(s.tDown).toBeGreaterThan(1.3 * s.tUp);
    expect(swashFront(s, s.tUp + s.tDown)).toBeCloseTo(0, 5);
  });

  it('turns the waves peaked, then forward-leaning, as they shoal', () => {
    const deep = waveShape(0.3, 3.8, 6), mid = waveShape(0.3, 3.8, 1.2), near = waveShape(0.3, 3.8, 0.4);
    expect(deep.r).toBeLessThan(0.15);
    expect(mid.r).toBeGreaterThan(deep.r);
    expect(near.r).toBeGreaterThan(mid.r);
    // skewed (φ near -π/2) offshore, more asymmetric (φ toward 0) near the break
    expect(near.phi).toBeGreaterThan(mid.phi);
    // the waveform: zero mean, unit crest-to-trough height whatever its shape
    for (const [r, phi] of [[0.2, -1.5], [0.6, -0.8], [0.75, -0.1]]) {
      let lo = 9, hi = -9, mean = 0;
      for (let i = 0; i < 2000; i++) { const v = abreu((i / 2000) * 2 * Math.PI, r, phi); lo = Math.min(lo, v); hi = Math.max(hi, v); mean += v / 2000; }
      expect(hi - lo).toBeCloseTo(1, 2);
      expect(Math.abs(mean)).toBeLessThan(0.01);
    }
  });

  it('gives each day its own sea, the same for the same day', () => {
    const base = HASHIRIMIZU.surf!;
    const a = seaStateFor(base, 1234), b = seaStateFor(base, 1234), c = seaStateFor(base, 1235);
    expect(a).toEqual(b);
    expect(a.height).not.toBe(c.height);
    for (let d = 0; d < 200; d++) {
      const s = seaStateFor(base, d);
      expect(s.height).toBeGreaterThan(base.height * 0.4);
      expect(s.height).toBeLessThan(base.height * 2.4);
    }
  });

  it('classifies a profile from the sea to the land in order', () => {
    const kinds = [-0.5, -0.05, 0.05, 0.3, 1.5, 12].map((D) => classifyDepth(D, 0.32, 3.8, 3, 0.05));
    expect(kinds).toEqual(['land', 'swash', 'swash', 'breaker', 'shallow', 'deep']);
  });
});

describe('the surf zone on 走水', () => {
  const zone = new SurfZone(grid(heightAt), [1, 0], SEA);
  zone.update(REF_TIDE);
  const x = (d: number) => ZERO_X + d;

  it('brings the waves in later, and slower, the shallower the water', () => {
    // arrival time grows toward the shore and the crests' spacing (c · T) shrinks with the depth
    let prev = -Infinity;
    for (let d = 40; d >= 6; d -= 2) {
      const t = zone.arrivalAt(x(d), 0, REF_TIDE);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
    const pace = (d: number) => (zone.arrivalAt(x(d - 0.5), 0, REF_TIDE) - zone.arrivalAt(x(d + 0.5), 0, REF_TIDE));
    expect(pace(8)).toBeGreaterThan(pace(30) * 1.5);
  });

  it('gives the beach above the waterline the waterline time', () => {
    const wl = zone.arrivalAt(x(3.5), 5, REF_TIDE), beach = zone.arrivalAt(x(0), 5, REF_TIDE);
    expect(Math.abs(wl - beach)).toBeLessThan(0.6);
  });

  it('finds the breaker zone and the swash, and moves them with the tide', () => {
    const along = (level: number) => {
      zone.update(level);
      const out: string[] = [];
      for (let d = 30; d >= -6; d -= 0.25) { const k = zone.kindAt(x(d), 0, level); if (out[out.length - 1] !== k) out.push(k); }
      return out;
    };
    expect(along(REF_TIDE)).toEqual(['shallow', 'breaker', 'swash', 'land']);
    // the waterline at each tide: where the swash meets the breaker zone
    const edge = (level: number) => { zone.update(level); for (let d = -6; d < 40; d += 0.05) if (zone.kindAt(x(d), 0, level) === 'breaker') return d; return NaN; };
    const low = edge(-0.9), mid = edge(REF_TIDE), high = edge(0.9);
    expect(low).toBeGreaterThan(mid + 4);
    expect(high).toBeLessThan(mid - 3);
    // the open sandy shore shelters nothing and no rock is struck
    zone.update(REF_TIDE);
    expect(zone.shelterAt(x(8), 0, REF_TIDE)).toBeGreaterThan(0.95);
    expect(zone.impactAt(x(8), 0)).toBeLessThan(0.05);
    // the beach face above the clam flat is steeper (1:9 against 1:25)
    expect(zone.slopeAt(x(-3), 0)).toBeGreaterThan(zone.slopeAt(x(8), 0) * 2);
  });

  it('re-makes only what the tide moved', () => {
    const before = zone.bakes;
    zone.update(REF_TIDE + 0.001);
    zone.update(REF_TIDE + 0.002);
    expect(zone.bakes).toBe(before);
    zone.update(REF_TIDE + 0.05);
    expect(zone.bakes - before).toBeLessThanOrEqual(2);
  });
});

describe('the surf zone round a rock and over a bar', () => {
  // a plane 1:20 beach along z (sea to +x, waterline at x = 0), a rock standing out of the water 14 m out, a bar 22 m out
  const plane = (x: number) => -0.05 * x;
  const rock = (x: number, z: number) => 1.8 * Math.max(0, 1 - Math.hypot(x - 14, z) / 2.2);
  const bar = (x: number) => 0.62 * Math.exp(-(((x - 30) / 3) ** 2));
  const zone = new SurfZone(grid((x, z) => plane(x) + rock(x, z) + bar(x), 193, 96), [1, 0], { ...SEA, height: 0.5 });
  zone.update(0);

  it('shelters the water behind the rock, less and less further from it and to its sides', () => {
    const lee = zone.shelterAt(10, 0, 0), side = zone.shelterAt(10, 9, 0), far = zone.shelterAt(4, 0, 0);
    expect(lee).toBeLessThan(0.6);
    expect(side).toBeGreaterThan(0.9);
    expect(far).toBeGreaterThan(lee);
    // and the waves reach the lee from the sides, later than they reach the open water beside it
    expect(zone.arrivalAt(11, 0, 0)).toBeGreaterThan(zone.arrivalAt(11, 9, 0));
  });

  it('marks the rock face the waves strike', () => {
    expect(zone.impactAt(15.5, 0)).toBeGreaterThan(0.4);   // (its seaward foot is at x ≈ 15.3)
    expect(zone.impactAt(15.5, 12)).toBeLessThan(0.05);
  });

  it('remembers the bar the waves crossed: the trough behind it is still the breaker zone', () => {
    expect(zone.barAt(26, 20)).toBeGreaterThan(plane(26) + 0.2);
    expect(zone.kindAt(26, 20, 0)).toBe('breaker');
    // without the bar the same depth would be shoaling water
    expect(classifyDepth(-plane(26), 0.5, 3.8, 4.5, 0.05)).toBe('shallow');
  });
});

describe('the surf zone following the tide', () => {
  it('installs a far bracket after a jump and does not bake it again', () => {
    const zone = new SurfZone(grid(heightAt, 97, SIZE), [1, 0], SEA);
    zone.update(-0.3);
    const lv = () => zone.uniforms.uSurfLv.value;
    for (const level of [0.55, -0.9, 0.2]) {
      const before = zone.bakes;
      for (let f = 0; f < 5; f++) zone.update(level);
      expect(lv().x).toBeLessThanOrEqual(level);
      expect(lv().y).toBeGreaterThanOrEqual(level);
      expect(zone.bakes - before).toBe(2);
    }
  });
});

describe('the surf lab beach', () => {
  it('breaks the bigger waves on the bar, lets them re-form in the trough and break again on the face', async () => {
    const lab = await import('../../src/world/maps/surflab/shape');
    const zone = new SurfZone(lab.makeGrid(), [1, 0], { height: 0.6, period: 7, angle: -0.25, spread: 0.14 });
    zone.update(0.3);
    const out: string[] = [];
    for (let d = 70; d >= -8; d -= 0.25) { const k = zone.kindAt(lab.ZERO_X + d, 6, 0.3); if (out[out.length - 1] !== k) out.push(k); }
    // seaward to landward: past the bar, the bar's breaker zone, the trough, the inner breaker zone, the swash, the land
    expect(out.slice(-3)).toEqual(['breaker', 'swash', 'land']);
    expect(out.filter((k) => k === 'breaker').length).toBeGreaterThanOrEqual(2);
    expect(out.indexOf('breaker')).toBeLessThan(out.lastIndexOf('shallow'));
    // the face is steep (a shore break: the waves plunge on it) and the rocks are struck and shelter the water behind
    expect(zone.slopeAt(lab.ZERO_X + 2, 6)).toBeGreaterThan(0.11);
    let struck = 0;
    for (let z = -36; z <= -24; z += 0.5) for (let d = 12; d <= 26; d += 0.5) struck = Math.max(struck, zone.impactAt(lab.ZERO_X + d, z));
    expect(struck).toBeGreaterThan(0.4);
    expect(zone.shelterAt(lab.ZERO_X + 10, -30, 0.3)).toBeLessThan(zone.shelterAt(lab.ZERO_X + 10, 20, 0.3));
  });
});
