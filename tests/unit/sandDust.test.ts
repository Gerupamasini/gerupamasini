import { afterEach, describe, expect, it } from 'vitest';
import { BufferAttribute, Group, Vector3 } from 'three';
import { SAND_DUST, SandDust, sandDustFor } from '../../src/creatures/fx/SandDust';
import type { Floor } from '../../src/creatures/drivers/Driver';
import { WaterMotion } from '../../src/creatures/physics/water';

// The sand the fishes and rays throw up (creatures/fx/SandDust): one layer per parent group, silt that hangs and
// sinks back slowly, grains that fall straight back, nothing where there is nothing to throw, and the quality preset's share.

const flat: Floor = { heightAt: () => 0, waterAt: () => 0.4 };
const ctx = { floor: flat };

function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** heights of the live particles (m) and their kinds */
function particles(d: SandDust): { y: number[]; kind: number[]; alpha: number[] } {
  const pos = d.points.geometry.getAttribute('position') as BufferAttribute;
  const tint = d.points.geometry.getAttribute('aTint') as BufferAttribute;
  const dust = d.points.geometry.getAttribute('aDust') as BufferAttribute;
  const y: number[] = [], kind: number[] = [], alpha: number[] = [];
  for (let i = 0; i < d.count; i++) { y.push(pos.getY(i)); kind.push(tint.getW(i)); alpha.push(dust.getY(i)); }
  return { y, kind, alpha };
}

function run(d: SandDust, src: ReturnType<SandDust['source']>, seconds: number, c: { floor: Floor; water?: WaterMotion | null } = ctx): void {
  for (let t = 0; t < seconds; t += 1 / 60) src.tick(1 / 60, c);
}

afterEach(() => { SAND_DUST.enabled = true; SAND_DUST.amount = 1; });

describe('sand dust', () => {
  it('is one layer per parent group, shared by every animal in it', () => {
    const parent = new Group();
    const a = sandDustFor(parent), b = sandDustFor(parent);
    expect(a).toBe(b);
    expect(parent.children.filter((o) => o === a.points)).toHaveLength(1);
    expect(sandDustFor(new Group())).not.toBe(a);
  });

  it('throws silt up that slows in the water, hangs and sinks back; grains fall straight back and are gone in a second or two', () => {
    const d = new SandDust(), src = d.source(rng(3));
    src.tick(1 / 60, ctx);
    const at = new Vector3(0, 0.002, 0);
    src.silt(at, new Vector3(0, 0.05, 0), 20, 0.01, 0.01, 3, 0.5);
    src.grains(at, new Vector3(0, 0.1, 0), 30, 0.01);
    expect(d.count).toBe(50);
    run(d, src, 0.6);
    const mid = particles(d);
    const siltY = mid.y.filter((_, i) => mid.kind[i] < 0.5), grainY = mid.y.filter((_, i) => mid.kind[i] > 0.5);
    // the cloud has risen a centimetre or two and no further (the water stops it at once)
    expect(Math.max(...siltY)).toBeGreaterThan(0.012);
    expect(Math.max(...siltY)).toBeLessThan(0.08);
    expect(Math.max(...mid.alpha)).toBeGreaterThan(0.05);
    // the grains are coming down (or down already)
    run(d, src, 1.6);
    const late = particles(d);
    expect(late.kind.filter((k) => k > 0.5)).toHaveLength(0);
    expect(late.kind.filter((k) => k < 0.5).length).toBeGreaterThan(5);
    // nothing goes under the bed
    for (const y of late.y) expect(y).toBeGreaterThanOrEqual(0);
    run(d, src, 6);
    expect(d.count).toBe(0);
    expect(d.points.visible).toBe(false);
  });

  it('a cloud over mud hangs longer than one over clean sand', () => {
    const life = (substrate: string): number => {
      const d = new SandDust(), src = d.source(rng(5));
      src.setBed(substrate);
      src.tick(1 / 60, ctx);
      src.silt(new Vector3(), new Vector3(0, 0.03, 0), 40, 0.01, 0.01, 2, 0.5);
      let t = 0;
      while (d.count > 0 && t < 20) { src.tick(1 / 30, ctx); t += 1 / 30; }
      return t;
    };
    expect(life('mud')).toBeGreaterThan(life('sand') * 1.3);
  });

  it('the swell carries a cloud to and fro', () => {
    const water = new WaterMotion({ windDir: 0, swell: 0.08 });
    water.still = 1;
    const c = { floor: flat, water };
    const d = new SandDust(), src = d.source(rng(9));
    src.tick(1 / 60, c);
    src.silt(new Vector3(0, 0.02, 0), new Vector3(), 10, 0.001, 0.01, 8, 0.5);
    const xs: number[] = [];
    for (let k = 0; k < 240; k++) {
      water.update(k / 60, 0.4, 1, 1 / 60);
      src.tick(1 / 60, c);
      const pos = d.points.geometry.getAttribute('position') as BufferAttribute;
      let m = 0;
      for (let i = 0; i < d.count; i++) m += pos.getX(i);
      xs.push(m / Math.max(1, d.count));
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.005);
  });

  it('moves once a frame however many animals step it, and goes on when the one stepping it leaves', () => {
    const d = new SandDust(), a = d.source(rng(1)), b = d.source(rng(2));
    a.tick(1 / 60, ctx);
    a.grains(new Vector3(), new Vector3(0, 0.2, 0), 1, 0);
    const y0 = particles(d).y[0];
    a.tick(1 / 60, ctx);
    const y1 = particles(d).y[0];
    // the second animal in the same frame does not move it again
    b.tick(1 / 60, ctx);
    expect(particles(d).y[0]).toBe(y1);
    expect(y1).not.toBe(y0);
    a.release();
    b.tick(1 / 60, ctx);
    expect(particles(d).y[0]).not.toBe(y1);
    // one updated every frame takes over from one updated every 2nd frame (with the time of both)
    const e = new SandDust(), far = e.source(rng(3)), near = e.source(rng(4));
    far.tick(2 / 60, ctx);
    far.grains(new Vector3(), new Vector3(0, 0.2, 0), 1, 0);
    near.tick(1 / 60, ctx);
    const z1 = particles(e).y[0];
    far.tick(2 / 60, ctx);
    expect(particles(e).y[0]).toBe(z1);
  });

  it('throws nothing where there is nothing to throw, when far, or with the preset off; the preset thins it', () => {
    const d = new SandDust(), src = d.source(rng(4));
    src.tick(1 / 60, { floor: flat, canBurrow: false });
    src.kick(new Vector3(), new Vector3(0, 0.05, 0), 20, 0.01, 0.01);
    expect(d.count).toBe(0);
    src.tick(1 / 60, ctx);
    src.near = false;
    src.kick(new Vector3(), new Vector3(0, 0.05, 0), 20, 0.01, 0.01);
    expect(d.count).toBe(0);
    src.near = true;
    SAND_DUST.enabled = false;
    src.kick(new Vector3(), new Vector3(0, 0.05, 0), 20, 0.01, 0.01);
    expect(d.count).toBe(0);
    SAND_DUST.enabled = true;
    SAND_DUST.amount = 0.5;
    src.silt(new Vector3(), new Vector3(0, 0.05, 0), 200, 0.01, 0.01);
    expect(d.count).toBeGreaterThan(70);
    expect(d.count).toBeLessThan(130);
  });

  it('never holds more than its pool, and a steady stir emits at its rate', () => {
    const d = new SandDust(), src = d.source(rng(6));
    src.tick(1 / 60, ctx);
    for (let k = 0; k < 40; k++) src.silt(new Vector3(), new Vector3(), 100, 0.01, 0.01, 30);
    expect(d.count).toBe(2048);
    const e = new SandDust(), s2 = e.source(rng(7));
    s2.tick(1 / 60, ctx);
    for (let k = 0; k < 60; k++) s2.stream(1 / 60, 30, new Vector3(), new Vector3(), 0.01, 0.01, 30);
    expect(e.count).toBeGreaterThanOrEqual(28);
    expect(e.count).toBeLessThanOrEqual(31);
  });
});
