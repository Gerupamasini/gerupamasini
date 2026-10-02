// Individual variation (docs/yamame/spec/02 §2.9.2, 03 §3.8, 09 P7): one reproducible genome per seed. Body-scale part here; texture / fin / eye
// variation is drawn inside their own modules from the same seed (textures.sampleGenome, fins/eyes `variation`).
import { mulberry32 } from './eyes.mjs';

const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Body-shape scalars. SD values are [E] (02 §2.9.2: per-metric SD from n=3 adults is not enough; one "size" scalar couples depth and width). */
export function sampleBodyGenome(seed) {
  const r = mulberry32(seed * 2654435761 >>> 0);
  const z = gauss(r);                                   // 'robustness' axis shared by depth and width
  return {
    depth_scale: clamp(1 + 0.045 * z + 0.015 * gauss(r), 0.9, 1.12),
    width_scale: clamp(1 + 0.05 * z + 0.03 * gauss(r), 0.85, 1.18),
    sl_m: clamp(0.19 * (1 + 0.10 * gauss(r)), 0.15, 0.24),
  };
}
