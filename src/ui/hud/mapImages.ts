import type { World } from '../../app/World';

export const SUB_COLORS = ['#cdbb8e', '#a1906a', '#6e6a4c', '#aaa294', '#56604f'];
const SHORE = [0x6b, 0x84, 0x45], BEACH = [0xd8, 0xc7, 0x9d], ALGAE = [0x7a, 0x84, 0x4e];

/** Substrate colours shaded by height, one pixel per terrain cell. */
export function makeBaseImage(world: World): HTMLCanvasElement {
  const t = world.terrain, n = t.n;
  const base = document.createElement('canvas');
  base.width = n; base.height = n;
  const ctx = base.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  for (let k = 0; k < n * n; k++) {
    const hex = SUB_COLORS[t.substrate[k]] ?? '#777';
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const h = t.heights[k];
    // the shore: dry beach, then the green of the embankment
    if (h > 1.0) { const u = Math.min(1, (h - 1.0) / 0.5); r = r + (BEACH[0] - r) * u; g = g + (BEACH[1] - g) * u; b = b + (BEACH[2] - b) * u; }
    if (h > 1.7) { const u = Math.min(1, (h - 1.7) / 0.4); r = r + (SHORE[0] - r) * u; g = g + (SHORE[1] - g) * u; b = b + (SHORE[2] - b) * u; }
    // an algal film on the low mud
    if (t.substrate[k] === 2 && h < 0.1) { const u = Math.min(1, (0.1 - h) / 0.6) * 0.5; r = r + (ALGAE[0] - r) * u; g = g + (ALGAE[1] - g) * u; b = b + (ALGAE[2] - b) * u; }
    const shade = 0.82 + 0.22 * Math.max(-1, Math.min(1, h / 1.5));
    img.data[k * 4] = r * shade; img.data[k * 4 + 1] = g * shade; img.data[k * 4 + 2] = b * shade; img.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return base;
}

/** Water at the current tide (and pools above it) as a translucent layer; call again when the tide moved. */
export class WaterLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly img: ImageData;
  private lastTide = NaN;
  constructor(private readonly world: World) {
    const n = world.terrain.n;
    this.canvas = document.createElement('canvas');
    this.canvas.width = n; this.canvas.height = n;
    this.img = this.canvas.getContext('2d')!.createImageData(n, n);
  }
  update(): void {
    const w = this.world, t = w.terrain, n = t.n;
    if (Math.abs(w.tideLevel - this.lastTide) < 0.005) return;
    this.lastTide = w.tideLevel;
    const pl = w.habitat.poolLevels, d = this.img.data;
    for (let k = 0; k < n * n; k++) {
      const ground = t.heights[k];
      const pooled = pl[k] > this.lastTide + 0.01 && pl[k] > ground + 0.003;
      const level = pooled ? pl[k] : this.lastTide;
      const depth = level - ground;
      const o = k * 4;
      if (depth > 0) {
        const a = Math.min(0.9, 0.3 + depth * 0.7);
        // shallow water is pale turquoise, the creeks and the bay deepen to teal
        const u = Math.min(1, depth / 0.8);
        if (pooled) { d[o] = 92; d[o + 1] = 178; d[o + 2] = 186; } else { d[o] = 96 - 50 * u; d[o + 1] = 196 - 70 * u; d[o + 2] = 205 - 60 * u; }
        d[o + 3] = Math.round(a * 255);
      } else d[o + 3] = 0;
    }
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0);
  }
}
