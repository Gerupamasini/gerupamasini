import { ClampToEdgeWrapping, DataTexture, FloatType, LinearFilter, RGBAFormat, Vector4, type IUniform } from 'three';
import { breakerIndex, classifyDepth, type SeaState, type SurfZoneKind } from './surfPhysics';
import { bakeLevel, bakeStatic, groundAt, makeFrame, type BakeFrame, type LevelBake } from './surfZoneBake';

/** the terrain as the bake reads it */
export interface SurfZoneGrid { n: number; size: number; heights: Float32Array }

/** The zone's textures and the level bracket they were made for (shared by the water, the sand and the spray). */
export interface SurfZoneUniforms {
  /** RGBA: ground (T.P. m), arrival time at the lower and upper level of the bracket (s), seaward bed slope */
  tSurfZone: IUniform<DataTexture>;
  /** RGBA: highest ground seaward on the way in (m, a bar), shelter at the two levels (1 open .. 0 behind a rock),
   * where the waves strike a rock or a wall (0..1) */
  tSurfAux: IUniform<DataTexture>;
  /** x, y: the bracket's levels; z: the waves' speed at the map's outer edge (m/s); w: the depth there (m) */
  uSurfLv: IUniform<Vector4>;
}

/** the tide's bracket: the arrival times are made at its two ends and blended between them by the shaders */
const STEP = 0.04;

/**
 * Where the waves are on this shore, worked out from the terrain and the water level, so a new tide moves the
 * breaker zone and the waterline by itself (surfZoneBake does the work; a worker does it during play).
 *
 * The waves come in from the map's seaward edge. Their arrival time at each point is the eikonal of the linear
 * phase speed c(D) (√(gD) in the shallows): swept from the edge toward the land in the shore's own frame, every cell
 * reached straight on or by a diagonal step (crests bend up to 45° round an obstacle), then relaxed along the shore
 * (so the water behind a rock is reached from its sides, later, as diffraction does). The crests' spacing then
 * shrinks wherever the water shoals, over bars and holes as much as on a plane slope. Cells are told apart as the sea
 * (wet and joined to the outer edge), the land (joined to the landward edge: the beach, its pools, the seawall)
 * and rocks (dry islands in the sea). A beach cell takes the arrival time of the waterline below it, so the swash
 * up there keeps time with the bores that make it.
 *
 * Alongside: the highest ground each point's waves crossed on the way in (a bar breaks them early; deeper water
 * behind it lets them re-form), the shelter behind rocks (the straight-line shadow, blurred along the shore as the
 * waves go on by the Fresnel width √(λ x / 2π), so the lee is calmer but never cut off sharply), where the waves
 * strike a rock or a wall face-on (spray and foam there), and the bed slope (breaker index, run-up).
 *
 * The level's bracket is 4 cm: the shaders blend the arrival times made at its two ends, so the crests never jump as
 * the tide moves. During play the next bracket the tide is heading for is made ahead in a worker; a jump (a ticket,
 * the debug tide) is made at once.
 */
export class SurfZone {
  readonly n: number;
  readonly half: number;
  readonly cell: number;
  readonly uniforms: SurfZoneUniforms;
  private readonly frame: BakeFrame;
  private readonly zone: Float32Array;
  private readonly aux: Float32Array;
  private readonly heights: Float32Array;
  private sea: SeaState;
  /** bakes by bracket index (level / STEP) */
  private readonly cache = new Map<number, LevelBake>();
  private readonly pending = new Set<number>();
  /** the bracket index the textures hold (NaN: none yet) */
  private installed = NaN;
  private worker: Worker | null = null;
  private jobId = 0;
  /** bakes made for an older sea are not used */
  private seaEpoch = 0;
  /** how many level bakes were made on this thread (tests, debug) */
  bakes = 0;

  constructor(grid: SurfZoneGrid, seaward: readonly [number, number], sea: SeaState, opts: { worker?: boolean } = {}) {
    this.n = grid.n;
    this.half = grid.size / 2;
    this.cell = grid.size / (grid.n - 1);
    this.heights = grid.heights;
    this.sea = sea;
    this.frame = makeFrame(grid.heights, grid.n, grid.size, seaward);
    const N = this.n * this.n;
    this.zone = new Float32Array(N * 4);
    this.aux = new Float32Array(N * 4);
    const st = bakeStatic(this.frame, grid.heights);
    for (let k = 0; k < N; k++) {
      this.zone[k * 4] = this.heights[k]; this.zone[k * 4 + 3] = st.slope[k];
      this.aux[k * 4] = st.gmax[k]; this.aux[k * 4 + 1] = this.aux[k * 4 + 2] = 1;
    }
    const mk = (data: Float32Array) => {
      const t = new DataTexture(data, this.n, this.n, RGBAFormat, FloatType);
      t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.wrapS = t.wrapT = ClampToEdgeWrapping;
      t.needsUpdate = true;
      return t;
    };
    this.uniforms = { tSurfZone: { value: mk(this.zone) }, tSurfAux: { value: mk(this.aux) }, uSurfLv: { value: new Vector4(0, STEP, 5, 3) } };
    if (opts.worker && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./surfZone.worker.ts', import.meta.url), { type: 'module' });
        this.worker.postMessage({ type: 'frame', frame: this.frame });
        this.worker.onmessage = (e: MessageEvent<LevelBake & { id: number }>) => {
          const r = e.data, idx = Math.round(r.level / STEP);
          this.pending.delete(idx);
          if (r.id > this.seaEpoch) this.remember(idx, r);
        };
        this.worker.onerror = () => { this.worker?.terminate(); this.worker = null; this.pending.clear(); };
      } catch { this.worker = null; }
    }
  }

  /** the sea of the day changed (its period sets the waves' speed, so the arrival times are made again) */
  setSea(sea: SeaState): void {
    const again = sea.period !== this.sea.period;
    this.sea = sea;
    if (!again) return;
    this.cache.clear();
    this.pending.clear();
    this.seaEpoch = ++this.jobId;
    const lv = this.installed;
    this.installed = NaN;
    if (!Number.isNaN(lv)) this.update(lv * STEP + STEP * 0.5);
  }

  get seaState(): SeaState { return this.sea; }

  /**
   * Follow the water level (`rate`: m/s, which way the tide is going, for the bake ahead). Returns true when the
   * textures changed.
   */
  update(level: number, rate = 0): boolean {
    const idx = Math.floor(level / STEP);
    let changed = false;
    if (idx !== this.installed) {
      const near = !Number.isNaN(this.installed) && Math.abs(idx - this.installed) <= 2;
      for (const k of [idx, idx + 1]) {
        if (this.cache.has(k)) continue;
        // a jump (or no worker) is made at once; a step the worker was too slow for waits a frame or two
        if (!this.worker || !near) this.remember(k, this.bakeHere(k));
        else this.request(k);
      }
      if (this.cache.has(idx) && this.cache.has(idx + 1)) { this.install(idx); changed = true; }
    }
    // the bracket the tide is heading for, made ahead
    if (this.worker) {
      if (rate >= 0) this.request(idx + 2);
      if (rate <= 0) this.request(idx - 1);
    }
    return changed;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.uniforms.tSurfZone.value.dispose();
    this.uniforms.tSurfAux.value.dispose();
  }

  private bakeHere(idx: number): LevelBake {
    this.bakes++;
    return bakeLevel(this.frame, idx * STEP, this.sea.period);
  }

  private request(idx: number): void {
    if (!this.worker || this.cache.has(idx) || this.pending.has(idx)) return;
    this.pending.add(idx);
    this.worker.postMessage({ type: 'bake', id: ++this.jobId, level: idx * STEP, period: this.sea.period });
  }

  private remember(idx: number, b: LevelBake): void {
    this.cache.set(idx, b);
  }

  private install(idx: number): void {
    const a = this.cache.get(idx)!, b = this.cache.get(idx + 1)!;
    const N = this.n * this.n, z = this.zone, x = this.aux;
    for (let k = 0; k < N; k++) {
      z[k * 4 + 1] = a.t[k]; z[k * 4 + 2] = b.t[k];
      x[k * 4 + 1] = a.sh[k]; x[k * 4 + 2] = b.sh[k];
      // (4 cm of tide hardly moves where the waves strike)
      x[k * 4 + 3] = Math.max(a.imp[k], b.imp[k]);
    }
    this.installed = idx;
    // keep the bracket in use and its neighbours (the ones the tide may go to next); drop the rest
    for (const k of [...this.cache.keys()]) if (k < idx - 2 || k > idx + 3) this.cache.delete(k);
    this.uniforms.uSurfLv.value.set(a.level, b.level, 0.5 * (a.edgeSpeed + b.edgeSpeed), 0.5 * (a.edgeDepth + b.edgeDepth));
    this.uniforms.tSurfZone.value.needsUpdate = true;
    this.uniforms.tSurfAux.value.needsUpdate = true;
  }

  // ------------------------------------------------------------------ queries (CPU, for tests and the debug panel)
  private levelMix(level: number): number {
    const u = this.uniforms.uSurfLv.value;
    return Math.max(0, Math.min(1, (level - u.x) / (u.y - u.x)));
  }

  /** arrival time (s) at a point for the current level (blended in the bracket as the shaders do) */
  arrivalAt(x: number, z: number, level: number): number {
    const f = this.levelMix(level);
    return this.sample(this.zone, x, z, 1) * (1 - f) + this.sample(this.zone, x, z, 2) * f;
  }
  shelterAt(x: number, z: number, level: number): number {
    const f = this.levelMix(level);
    return this.sample(this.aux, x, z, 1) * (1 - f) + this.sample(this.aux, x, z, 2) * f;
  }
  impactAt(x: number, z: number): number { return this.sample(this.aux, x, z, 3); }
  barAt(x: number, z: number): number { return this.sample(this.aux, x, z, 0); }
  slopeAt(x: number, z: number): number { return this.sample(this.zone, x, z, 3); }
  groundAt(x: number, z: number): number { return groundAt(this.heights, this.n, this.half, this.cell, x, z); }

  /** what part of the shore a point is in, for the day's sea */
  kindAt(x: number, z: number, level: number): SurfZoneKind {
    const D = level - this.groundAt(x, z);
    // a point behind a bar that breaks the bigger waves is in the breaker zone however deep the trough is (ground
    // standing out of the water is no bar: its lee is sheltered)
    const Dbar = level - this.barAt(x, z);
    const Deff = D > 0 && Dbar > 0.03 ? Math.min(D, Dbar * 1.6) : D;
    return classifyDepth(Deff, this.sea.height, this.sea.period, this.uniforms.uSurfLv.value.w, this.slopeAt(x, z));
  }

  /** the breaker index for the day's sea on the slope at a point */
  breakerIndexAt(x: number, z: number): number {
    return breakerIndex(this.slopeAt(x, z), this.sea.height, this.sea.period);
  }

  private sample(data: Float32Array, x: number, z: number, c: number): number {
    const gx = Math.max(0, Math.min(this.n - 1.001, (x + this.half) / this.cell));
    const gz = Math.max(0, Math.min(this.n - 1.001, (z + this.half) / this.cell));
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, n = this.n;
    const at = (ii: number, jj: number) => data[(jj * n + ii) * 4 + c];
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fz) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fz;
  }
}
