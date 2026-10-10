import { ClampToEdgeWrapping, DataTexture, Group, LinearFilter, RedFormat, UnsignedByteType, Vector2, type Camera } from 'three';
import { Rng } from '../../core/Rng';
import type { Substrate } from '../../data/schemas';
import type { Quality } from '../../core/Settings';
import type { Habitat } from '../Habitat';
import type { Terrain } from '../Terrain';
import type { SurfField } from '../Water';
import { AmamoKit, type Lod } from './kit';
import { AmamoPatch, patchOutline, type GroundSampler, type Grown, type PatchKind, type PatchOptions, type ShootSpec } from './AmamoPatch';
import { MOTION, ZONE, smoothstep } from './params';

/** How much of the meadow is drawn, and in how much detail. */
export interface MeadowQuality {
  /** fraction of the shoots drawn (the instances are shuffled, so this thins uniformly) */
  density: number;
  /** distance from a patch's edge (m) where tiers 0 / 1 / 2 end; beyond, the terrain's cover tint stands in */
  lod: readonly [number, number, number];
  /** the coarsest tier that casts shadows (-1: none) */
  shadowLod: number;
}

export const MEADOW_QUALITY: Record<Quality, MeadowQuality> = {
  // 超軽量: a third of the shoots, the detailed tiers only within arm's reach, the far meadow is the cover painted on the bed
  minimal: { density: 0.35, lod: [2.5, 7, 18], shadowLod: -1 },
  low: { density: 0.6, lod: [3.5, 11, 28], shadowLod: -1 },
  // (the blades' shadows on the bed are faint, and drawing them costs more triangles than the blades themselves:
  // mid casts none, high only from the nearest tier)
  mid: { density: 1, lod: [4.5, 13, 36], shadowLod: -1 },
  high: { density: 1, lod: [7, 22, 52], shadowLod: 0 },
};

/** What the meadow needs from the world each frame. */
export interface MeadowEnv {
  tideLevel: number;
  /** m per hour, positive while the tide rises */
  tideRate: number;
  /** wind waves: direction of travel (rad, in the xz plane) and strength (1 = the usual light breeze) */
  windDir: number;
  waveGain: number;
}

/** A map's own say in where the beds go (all optional: the default is the T.P. band and a noise field). */
export interface MeadowLayout {
  /** 0..1, replaces the height band (substrate and pits still apply) */
  suitability?(x: number, z: number): number;
  /** 0..1, replaces the meadow noise field; with `thresholds` it decides dense / sparse / pioneer / bare */
  field?(x: number, z: number): number;
  thresholds?: readonly [number, number, number];
  /** spacing of the candidate clones (m) */
  step?: number;
  /** blow-out holes inside dense clones (default true; a designed field brings its own) */
  holes?: boolean;
}

export interface PatchSpec {
  index: number;
  x: number;
  z: number;
  r: number;
  density: number;
  kind: PatchKind;
  seed: number;
  vigour: number;
  outline: (a: number) => number;
  /** earlier clones that overlap this one (where they overlap, the ground is theirs) */
  prior: PatchSpec[];
}

const SUBSTRATE_WEIGHT: Record<Substrate, number> = { sand: 1, muddy_sand: 1, mud: 0.55, gravel: 0.25, channel: 0.12, rock: 0 };
/** cover texture size over the map */
const COVER_RES = 512;
/** patches are built when the camera comes within the last tier's reach plus this, and dropped a little farther out */
const STREAM_MARGIN = 6;
const DROP_MARGIN = 14;
/** time per frame spent growing clones that come into range (ms) */
const STREAM_BUDGET_MS = 4;

/** integer lattice hash in 0..1 */
function hash2(i: number, j: number, seed: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/** smooth value noise in 0..1 */
function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  let fx = x - xi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const h = (i: number, j: number) => hash2(i, j, seed);
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}
const fbm = (x: number, z: number, seed: number) => 0.55 * vnoise(x, z, seed) + 0.3 * vnoise(x * 2.03, z * 2.03, seed + 1) + 0.15 * vnoise(x * 4.1, z * 4.1, seed + 2);

/**
 * The アマモ beds of a flat (the vegetation system). Where the ground lies between about the spring low-water mark and
 * the flat's seaward edge, on sand or muddy sand, a meadow-scale noise field decides what grows: dense clones that run
 * together into a meadow with bare blow-out holes, sparser clones around them, and pioneer clumps out on the bare sand
 * beyond the edge. Every clone is a deterministic spec; its shoots are only grown (AmamoPatch) when the camera comes
 * near, and dropped when it leaves. Patches near the camera get the full blade, farther ones fewer and coarser blades,
 * then only the terrain's cover tint. Hidden as well: patches whose canopy is too deep in the silty water to be seen.
 */
export class AmamoMeadow {
  readonly group = new Group();
  readonly kit = new AmamoKit();
  readonly specs: PatchSpec[] = [];
  readonly live = new Map<number, AmamoPatch>();
  /** cover 0..1 over the map (R8, terrain uv), for the terrain shader and gameplay */
  readonly coverTexture: DataTexture;
  private readonly cover: Uint8Array;
  readonly seaward = new Vector2(0, 1);
  private readonly along = new Vector2(1, 0);
  private readonly current = new Vector2();
  private quality: MeadowQuality = MEADOW_QUALITY.mid;
  private frame = 0;
  private streamAcc = 1e9;
  private readonly lastStream = new Vector2(1e9, 1e9);
  private pending: PatchSpec[] = [];
  /** the clone being grown a little each frame */
  private building: { spec: PatchSpec; opts: PatchOptions; it: Generator<void, Grown, void> } | null = null;
  /** spatial hash of the specs (8 m cells) */
  private readonly cells = new Map<number, number[]>();
  private readonly ground: GroundSampler;

  constructor(private readonly terrain: Terrain, habitat: Habitat | null, seed: number, private readonly layout: MeadowLayout = {}) {
    this.group.name = 'amamo';
    const suit = (x: number, z: number) => this.suitability(x, z);
    const holeSeed = seed + 77;
    // bare holes in the meadow (blow-outs scoured by waves and rays): a few metres across
    const hole = layout.holes === false ? () => false : (x: number, z: number) => fbm(x / 6.5, z / 6.5, holeSeed) < 0.3;
    this.ground = {
      heightAt: (x, z) => terrain.heightAt(x, z),
      poolAt: habitat ? (x, z) => { const s = habitat.spillAt(x, z); return s > terrain.heightAt(x, z) + 0.02 ? s : -1e3; } : undefined,
      accept: (x, z) => suit(x, z) > 0.12 && !hole(x, z),
    };
    this.computeSeaward();
    this.place(seed);
    this.cover = new Uint8Array(COVER_RES * COVER_RES);
    this.rasterCover(hole);
    this.coverTexture = new DataTexture(this.cover, COVER_RES, COVER_RES, RedFormat, UnsignedByteType);
    this.coverTexture.magFilter = this.coverTexture.minFilter = LinearFilter;
    this.coverTexture.wrapS = this.coverTexture.wrapT = ClampToEdgeWrapping;
    this.coverTexture.needsUpdate = true;
  }

  /** 0..1: how well アマモ would grow here (height band, substrate, no pits, inside the map). */
  suitability(x: number, z: number): number {
    const t = this.terrain;
    if (!t.inside(x, z, this.layout.suitability ? 2 : 8)) return 0;
    const h = t.heightAt(x, z);
    const band = this.layout.suitability ? this.layout.suitability(x, z) : smoothstep(ZONE.top, ZONE.top - 0.25, h) * smoothstep(ZONE.bottom, ZONE.bottom + 0.3, h);
    if (band <= 0) return 0;
    if (t.pitMaskAt(x, z) > 0) return 0;
    return band * SUBSTRATE_WEIGHT[t.substrateAt(x, z)];
  }

  /** The sea's side of the flat: the mean downhill direction over the eelgrass band. */
  private computeSeaward(): void {
    const t = this.terrain;
    let sx = 0, sz = 0;
    for (let z = -t.half + 10; z < t.half - 10; z += 6) for (let x = -t.half + 10; x < t.half - 10; x += 6) {
      const h = t.heightAt(x, z);
      if (h > ZONE.top + 0.3 || h < ZONE.bottom) continue;
      sx -= t.heightAt(x + 2, z) - t.heightAt(x - 2, z);
      sz -= t.heightAt(x, z + 2) - t.heightAt(x, z - 2);
    }
    if (Math.hypot(sx, sz) > 1e-6) this.seaward.set(sx, sz).normalize();
    this.along.set(-this.seaward.y, this.seaward.x);
  }

  /** Lay out the clones over the flat (specs only; shoots are grown on demand). */
  private place(seed: number): void {
    const t = this.terrain;
    const rng = new Rng(seed);
    const fieldSeed = seed + 11;
    const L = this.layout;
    const step = L.step ?? 2.0, margin = L.field ? 2 : 8, jit = step * 0.4;
    const cands: { x: number; z: number; q: number }[] = [];
    for (let z = -t.half + margin; z < t.half - margin; z += step) for (let x = -t.half + margin; x < t.half - margin; x += step) {
      const px = x + rng.range(-jit, jit), pz = z + rng.range(-jit, jit);
      const s = this.suitability(px, pz);
      if (s < 0.2) continue;
      if (L.field) { cands.push({ x: px, z: pz, q: L.field(px, pz) }); continue; }
      // meadow field: large beds (~40 m) broken up at the 10 m scale
      const m = 0.7 * fbm(px / 42, pz / 42, fieldSeed) + 0.3 * fbm(px / 11, pz / 11, fieldSeed + 5);
      cands.push({ x: px, z: pz, q: m * (0.55 + 0.45 * s) });
    }
    // dense cores first, so where clones overlap the older (denser) one keeps its ground
    const [tD, tS, tP] = L.thresholds ?? [0.6, 0.53, 0.47];
    const kindOf = (q: number): PatchKind | null => (q > tD ? 'dense' : q > tS ? 'sparse' : q > tP ? 'pioneer' : null);
    const order: PatchKind[] = ['dense', 'sparse', 'pioneer'];
    for (const kind of order) for (const c of cands) {
      if (kindOf(c.q) !== kind) continue;
      const p = kind === 'dense' ? 0.8 : kind === 'sparse' ? 0.4 : 0.07;
      if (!rng.chance(p)) continue;
      const r = kind === 'dense' ? rng.range(1.5, 2.5) : kind === 'sparse' ? rng.range(1.0, 2.0) : rng.range(0.25, 0.7);
      // not on top of another clone's middle
      if (this.specsNear(c.x, c.z, 4).some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 0.55 * Math.max(o.r, r))) continue;
      const dens = kind === 'dense' ? ZONE.denseDensity : kind === 'sparse' ? ZONE.sparseDensity : ZONE.pioneerDensity;
      const density = rng.range(dens[0], dens[1]);
      const pseed = Math.floor(rng.next() * 4294967295) >>> 0;
      const vigour = rng.range(0.88, 1.12) * (kind === 'pioneer' ? 0.85 : 1);
      const prior = this.specsNear(c.x, c.z, r * 1.3).filter((o) => Math.hypot(o.x - c.x, o.z - c.z) < (o.r + r) * 1.3);
      const spec: PatchSpec = { index: this.specs.length, x: c.x, z: c.z, r, kind, density, seed: pseed, vigour, outline: patchOutline(pseed, r, kind), prior };
      this.specs.push(spec);
      const key = this.cellKey(c.x, c.z);
      let list = this.cells.get(key);
      if (!list) { list = []; this.cells.set(key, list); }
      list.push(spec.index);
    }
  }

  private cellKey(x: number, z: number): number { return Math.floor((z + 2000) / 8) * 1000 + Math.floor((x + 2000) / 8); }

  /** Specs whose centre lies within r (+ their own radius) of a point. */
  specsNear(x: number, z: number, r: number): PatchSpec[] {
    const out: PatchSpec[] = [];
    const reach = r + 3;
    for (let j = Math.floor((z - reach + 2000) / 8); j <= Math.floor((z + reach + 2000) / 8); j++) {
      for (let i = Math.floor((x - reach + 2000) / 8); i <= Math.floor((x + reach + 2000) / 8); i++) {
        for (const k of this.cells.get(j * 1000 + i) ?? []) {
          const s = this.specs[k];
          if (Math.hypot(s.x - x, s.z - z) <= r + s.r * 1.4) out.push(s);
        }
      }
    }
    return out;
  }

  /** Is (x, z) inside the outline of a clone laid out before this one? (Overlaps belong to the earlier clone.) */
  private claimed(x: number, z: number, spec: PatchSpec): boolean {
    for (const o of spec.prior) {
      const dx = x - o.x, dz = z - o.z, d2 = dx * dx + dz * dz;
      if (d2 > o.r * o.r * 1.6) continue;
      if (Math.sqrt(d2) < o.outline(Math.atan2(dz, dx)) * 0.97) return true;
    }
    return false;
  }

  /** Cover 0..1 at a point (0 outside the beds). */
  coverAt(x: number, z: number): number {
    const t = this.terrain;
    const i = Math.round(((x + t.half) / t.size) * (COVER_RES - 1)), j = Math.round(((z + t.half) / t.size) * (COVER_RES - 1));
    if (i < 0 || j < 0 || i >= COVER_RES || j >= COVER_RES) return 0;
    return this.cover[j * COVER_RES + i] / 255;
  }

  private rasterCover(hole: (x: number, z: number) => boolean): void {
    const t = this.terrain, N = COVER_RES, cell = t.size / (N - 1);
    const acc = new Float32Array(N * N);
    for (const s of this.specs) {
      const R = s.r * 1.3;
      const i0 = Math.max(0, Math.floor((s.x - R + t.half) / cell)), i1 = Math.min(N - 1, Math.ceil((s.x + R + t.half) / cell));
      const j0 = Math.max(0, Math.floor((s.z - R + t.half) / cell)), j1 = Math.min(N - 1, Math.ceil((s.z + R + t.half) / cell));
      // a meadow of ~90 shoots per m² reads as full cover
      const k = Math.min(1, s.density / 85);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -t.half + i * cell, z = -t.half + j * cell, dx = x - s.x, dz = z - s.z;
        const rel = Math.hypot(dx, dz) / s.outline(Math.atan2(dz, dx));
        if (rel > 1) continue;
        if (s.kind === 'dense' && hole(x, z)) continue;
        const v = k * (1 - 0.55 * smoothstep(0.55, 1.0, rel)) * smoothstep(0.08, 0.3, this.suitability(x, z));
        acc[j * N + i] = Math.max(acc[j * N + i], v);
      }
    }
    // soften by a texel
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let sum = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const ww = di === 0 && dj === 0 ? 2 : 1;
        sum += acc[jj * N + ii] * ww; w += ww;
      }
      this.cover[j * N + i] = Math.round(Math.min(1, sum / w) * 255);
    }
  }

  setQuality(q: MeadowQuality): void {
    this.quality = q;
    for (const p of this.live.values()) if (p.lod !== -1) p.setLod(p.lod, q.density, q.shadowLod);
    this.streamAcc = 1e9;
  }

  /** The tier a patch should be drawn at from distance d (m from its edge), with a metre of hysteresis. */
  pickLod(d: number, current: Lod | -1): Lod | -1 {
    const L = this.quality.lod;
    let lod: Lod | -1 = d < L[0] ? 0 : d < L[1] ? 1 : d < L[2] ? 2 : -1;
    if (current !== -1 && (lod === -1 || lod > current) && d < L[current] + 1) lod = current;
    return lod;
  }

  /** Is the whole canopy so deep in the turbid water that the view through it cannot reach it? */
  hiddenByWater(p: AmamoPatch, cx: number, cy: number, cz: number, level: number): boolean {
    const top = p.groundY + p.meanLength * 0.8;
    if (top > level - 0.03) return false;
    const dh = Math.max(0, Math.hypot(p.cx - cx, p.cz - cz) - p.reach);
    if (cy <= level) return dh > 8;
    const drop = Math.max(cy - top, 0.05);
    const path = Math.hypot(dh, drop) * Math.min(1, (level - top) / drop);
    // the water pass fades the bed by exp(-0.6..0.8 per metre of path): beyond ~7 m nothing is left
    return path > 7;
  }

  /** Which clones should be grown around (cx, cz), nearest first; drop the ones left far behind. */
  private plan(cx: number, cz: number): void {
    const reach = this.quality.lod[2] + STREAM_MARGIN;
    this.pending = this.specsNear(cx, cz, reach)
      .map((s) => ({ s, d: Math.hypot(s.x - cx, s.z - cz) - s.r }))
      .filter((o) => o.d < reach && !this.live.has(o.s.index) && o.s !== this.building?.spec)
      .sort((a, b) => a.d - b.d)
      .map((o) => o.s);
    for (const [k, p] of this.live) {
      if (Math.hypot(p.cx - cx, p.cz - cz) - p.reach > this.quality.lod[2] + DROP_MARGIN) { p.dispose(); this.live.delete(k); }
    }
    this.lastStream.set(cx, cz);
    this.streamAcc = 0;
  }

  private optionsFor(s: PatchSpec): PatchOptions {
    return {
      x: s.x, z: s.z, radius: s.r, density: s.density, kind: s.kind, seed: s.seed, vigour: s.vigour, kit: this.kit,
      ground: { ...this.ground, accept: (x, z) => this.ground.accept!(x, z) && !this.claimed(x, z, s) },
    };
  }

  private adopt(s: PatchSpec, patch: AmamoPatch): void {
    patch.setLod(-1);
    this.live.set(s.index, patch);
    this.group.add(patch);
  }

  /**
   * Grow pending clones nearest first, within a time budget (ms): one clone may take several frames. Clones nearer
   * than `near` m are grown at once, whatever the budget.
   */
  private grow(budgetMs: number, near = -1, cx = 0, cz = 0): void {
    const t0 = performance.now();
    while (this.pending.length || this.building) {
      if (!this.building) {
        const s = this.pending.shift()!;
        if (this.live.has(s.index)) continue;
        if (near > 0 && Math.hypot(s.x - cx, s.z - cz) - s.r < near) { this.adopt(s, new AmamoPatch(this.optionsFor(s))); continue; }
        const opts = this.optionsFor(s);
        this.building = { spec: s, opts, it: AmamoPatch.growSteps(opts) };
      }
      const b = this.building;
      let r = b.it.next();
      while (!r.done && performance.now() - t0 < budgetMs) r = b.it.next();
      if (!r.done) return;
      this.building = null;
      if (!this.live.has(b.spec.index)) this.adopt(b.spec, new AmamoPatch(b.opts, r.value));
      if (performance.now() - t0 >= budgetMs) return;
    }
  }

  /** On arrival (or after a teleport): grow everything within the detailed tiers now, the rest over the next frames. */
  prime(x: number, z: number): void {
    this.building = null;
    this.plan(x, z);
    this.grow(0, this.quality.lod[1] + 2, x, z);
  }

  update(dt: number, camera: Camera, env: MeadowEnv): void {
    const u = this.kit.uniforms;
    u.uAmTime.value += dt;
    u.uAmWater.value = env.tideLevel;
    // the tidal current: landward on the flood, seaward on the ebb, strongest at mid-tide; a little alongshore drift
    const r = Math.max(-1, Math.min(1, env.tideRate / MOTION.tideRateAtPeak));
    const tx = -this.seaward.x * r * MOTION.tidalCurrent + this.along.x * MOTION.residualCurrent;
    const tz = -this.seaward.y * r * MOTION.tidalCurrent + this.along.y * MOTION.residualCurrent;
    const k = 1 - Math.exp(-dt * 0.3);
    this.current.x += (tx - this.current.x) * k;
    this.current.y += (tz - this.current.y) * k;
    u.uAmCurrent.value.copy(this.current);
    u.uAmWave.value.set(Math.cos(env.windDir), Math.sin(env.windDir), MOTION.waveOrbital * env.waveGain, 0.6);
    u.uAmSeaward.value.copy(this.seaward);

    const cam = camera.position;
    this.frame++;
    this.streamAcc += dt;
    const moved = Math.hypot(cam.x - this.lastStream.x, cam.z - this.lastStream.y);
    if (moved > 15) this.prime(cam.x, cam.z);
    else if (this.streamAcc > 0.5 || moved > 4) this.plan(cam.x, cam.z);
    // a few milliseconds a frame for growing the clones coming into range
    if (this.pending.length || this.building) this.grow(STREAM_BUDGET_MS);

    // tiers: patches near the camera are checked every frame, far ones every few frames (staggered)
    for (const p of this.live.values()) {
      const d = Math.max(0, Math.hypot(p.cx - cam.x, p.cz - cam.z) - p.reach);
      const period = d < 12 ? 1 : d < 30 ? 4 : 12;
      if (p.lod !== -1 && (this.frame + p.shootCount) % period !== 0) continue;
      let lod = this.pickLod(d, p.lod);
      if (lod !== -1 && this.hiddenByWater(p, cam.x, cam.y, cam.z, env.tideLevel)) lod = -1;
      if (lod !== p.lod || p.visible !== (lod !== -1)) p.setLod(lod, this.quality.density, this.quality.shadowLod);
    }
  }

  /**
   * Grown shoots within r of (x, z) (only patches near the camera are grown), nearest first, at most `max`. For the
   * animals that live among the blades (flow.ts gives the CPU twin of a shoot's motion).
   */
  shootsNear(x: number, z: number, r: number, max = 24): ShootSpec[] {
    const found: { s: ShootSpec; d: number }[] = [];
    for (const p of this.live.values()) {
      if (Math.hypot(p.cx - x, p.cz - z) > r + p.reach + 0.05) continue;
      // only shoots drawn at the near tiers (the instances are shuffled: the first ones are the ones drawn)
      const drawn = Math.min(p.shoots.length, Math.round(p.shootCount * this.quality.density * 0.8));
      for (let i = 0; i < drawn; i++) {
        const s = p.shoots[i];
        const d = Math.hypot(s.x - x, s.z - z);
        if (d <= r) found.push({ s, d });
      }
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, max).map((o) => o.s);
  }

  /** On an open shore: the surf's surface, which the blades afloat ride and which the shoots stay under. */
  setSurf(field: SurfField | null): void {
    const u = this.kit.uniforms;
    u.tAmSurf.value = field?.texture ?? null;
    u.uAmSurf.value.set(field?.half ?? 1, field ? 1 : 0);
  }

  /** The nearest clone of a kind (or any), by its centre. */
  nearest(x: number, z: number, kind?: PatchKind): PatchSpec | null {
    let best: PatchSpec | null = null, bd = Infinity;
    for (const s of this.specs) {
      if (kind && s.kind !== kind) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  stats(): { specs: number; live: number; visible: number; lod: [number, number, number]; shoots: number; vertices: number } {
    const lod: [number, number, number] = [0, 0, 0];
    let visible = 0, shoots = 0, vertices = 0;
    for (const p of this.live.values()) {
      if (!p.visible || p.lod === -1) continue;
      visible++; lod[p.lod]++; shoots += p.leafCluster.count; vertices += p.drawnVertices;
    }
    return { specs: this.specs.length, live: this.live.size, visible, lod, shoots, vertices };
  }

  dispose(): void {
    for (const p of this.live.values()) p.dispose();
    this.live.clear();
    this.coverTexture.dispose();
    this.kit.dispose();
    this.group.removeFromParent();
  }
}
