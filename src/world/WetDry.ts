import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType, Vector2 } from 'three';
import { sunPosition } from './Sun';

/** how far back the tide is followed (a height out of the water longer than this counts as long dry) */
const HISTORY_H = 30;
const STEP_MIN = 5;
/** the drying of a height left dry for longer than the history (in drying hours) */
const LONG_DRY_H = 48;

/**
 * How fast the surface dries, in drying hours per hour: the sun drives evaporation, the night still drains the pores.
 * A warm season dries faster (a broad annual swing, warmest in late July).
 */
export function dryingRate(sunElevationDeg: number, ms: number): number {
  const s = Math.min(1, Math.max(0, (sunElevationDeg + 2) / 47));
  const sun = s * s * (3 - 2 * s);
  const day = (ms / 86400000) % 365.2422;
  const season = 1 + 0.25 * Math.cos((2 * Math.PI * (day - 205)) / 365.2422);
  return (0.35 + 0.85 * sun) * season;
}

/**
 * Per substrate, how quickly each stage of wetness goes (in drying hours): the glossy film of water left on the surface
 * as the tide falls (it drains into the sediment and runs off), and the darkness of the pore water itself (sand above
 * the water table dries in hours; mud holds its water through the whole low tide).
 */
export const DRYING = {
  film: { sand: 0.3, mud: 1.2 },
  moist: { sand: 2.5, mud: 30 },
} as const;

/**
 * How long each height of the flat has been out of the water, as drying: a strip over the flat's heights the terrain
 * shader reads (R the film left on sand, G on mud, B the moisture of sand, A of mud, each 1 just exposed and 0 dry).
 * Everything below the current water reads 1. Followed from the tide model itself, so a ticket or the debug clock
 * that moves the time gives the flat the drying it would have had.
 */
export class WetDry {
  readonly texture: DataTexture;
  /** the heights (m) the strip spans, from its first texel to its last */
  readonly range: Vector2;
  private readonly data: Uint8Array;
  private readonly bins: number;
  private lastMs = Number.NaN;
  private lastLevel = Number.NaN;

  constructor(yMin: number, yMax: number, bins = 256) {
    this.bins = bins;
    this.range = new Vector2(yMin, Math.max(yMax, yMin + 0.01));
    this.data = new Uint8Array(bins * 4).fill(255);
    this.texture = new DataTexture(this.data, bins, 1, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.needsUpdate = true;
  }

  /**
   * Follow the tide back from `nowMs` and refresh the strip. Cheap enough for every few seconds; skipped when neither
   * the time (by a minute) nor the water (by a centimetre) moved. `level` is the water now (the debug override may
   * hold it away from the model's).
   */
  update(levelAt: (ms: number) => number, nowMs: number, level: number, lat: number, lon: number): void {
    if (Math.abs(nowMs - this.lastMs) < 60000 && Math.abs(level - this.lastLevel) < 0.01) return;
    this.lastMs = nowMs;
    this.lastLevel = level;
    const n = Math.round((HISTORY_H * 60) / STEP_MIN);
    const stepH = STEP_MIN / 60;
    // the water and the drying dose (from now back to each sample), sample 0 being now
    const lv = new Float32Array(n + 1), dose = new Float32Array(n + 1);
    lv[0] = level;
    let acc = 0, rPrev = dryingRate(sunPosition(nowMs, lat, lon).elevation, nowMs);
    for (let k = 1; k <= n; k++) {
      const t = nowMs - k * STEP_MIN * 60000;
      lv[k] = levelAt(t);
      const r = dryingRate(sunPosition(t, lat, lon).elevation, t);
      acc += 0.5 * (r + rPrev) * stepH;
      rPrev = r;
      dose[k] = acc;
    }
    const { film, moist } = DRYING;
    const [y0, y1] = [this.range.x, this.range.y];
    for (let b = 0; b < this.bins; b++) {
      const y = y0 + ((y1 - y0) * b) / (this.bins - 1);
      let d: number;
      if (y <= level) d = 0;
      else {
        // the last time the water stood at this height: between the first sample back that reaches it and the one after
        let k = 1;
        while (k <= n && lv[k] < y) k++;
        if (k > n) d = acc + LONG_DRY_H;
        else {
          const f = (y - lv[k - 1]) / Math.max(1e-6, lv[k] - lv[k - 1]);
          d = dose[k - 1] + (dose[k] - dose[k - 1]) * Math.min(1, Math.max(0, f));
        }
      }
      const o = b * 4;
      this.data[o] = Math.round(255 * Math.exp(-d / film.sand));
      this.data[o + 1] = Math.round(255 * Math.exp(-d / film.mud));
      this.data[o + 2] = Math.round(255 * Math.exp(-d / moist.sand));
      this.data[o + 3] = Math.round(255 * Math.exp(-d / moist.mud));
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
