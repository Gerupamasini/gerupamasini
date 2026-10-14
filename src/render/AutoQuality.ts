import { QUALITY_ORDER, QUALITY_PRESETS, type Quality } from '../core/Settings';

/** the tiers the measurement chooses among (最高 is only ever the player's own choice) */
const ORDER = QUALITY_ORDER.slice(0, QUALITY_ORDER.indexOf('high') + 1);

/** seconds at a new tier before measuring (its shaders compiled, its models loaded, the first frames' stalls over) */
const SETTLE = 2.5;
/** seconds measured */
const WINDOW = 3;
/** at most this many tier changes in one run */
const MAX_STEPS = 3;

export type AutoVerdict = { kind: 'measuring' } | { kind: 'change'; to: Quality } | { kind: 'done'; quality: Quality };

/**
 * Chooses the flat's tier from what this computer measures in the flat itself: the GPU's time per frame at the
 * tier's full size (the dynamic resolution held still meanwhile), or, without a GPU timer, the frame time.
 *  - over 1.3 × the tier's frame time: a tier down (to 超軽量 at the lowest)
 *  - under half the next tier's frame time: a tier up (to 高 at most), but never back up after a step down
 * Then the next tier is measured the same way, until one stays (or after three changes).
 */
export class AutoQuality {
  private tier: Quality;
  private time = 0;
  private sum = 0;
  private n = 0;
  private steps = 0;
  private wentDown = false;
  private finished = false;

  constructor(start: Quality) {
    this.tier = ORDER.includes(start) ? start : 'high';
  }

  get done(): boolean {
    return this.finished;
  }

  /** The tier being measured (or chosen). */
  get quality(): Quality {
    return this.tier;
  }

  /** One frame in the flat: its length (s) and the GPU's time for it (ms; NaN when the browser has no timer). */
  update(dt: number, gpuMs: number): AutoVerdict {
    if (this.finished) return { kind: 'done', quality: this.tier };
    this.time += dt;
    if (this.time < SETTLE) return { kind: 'measuring' };
    const timed = Number.isFinite(gpuMs);
    this.sum += timed ? gpuMs : dt * 1000;
    this.n++;
    if (this.time < SETTLE + WINDOW) return { kind: 'measuring' };
    const ms = this.sum / this.n;
    const i = ORDER.indexOf(this.tier);
    const target = 1000 / QUALITY_PRESETS[this.tier].targetFps;
    let to: Quality | null = null;
    if (ms > target * 1.3 && i > 0) to = ORDER[i - 1];
    else if (timed && !this.wentDown && i < ORDER.length - 1 && ms < 0.5 * (1000 / QUALITY_PRESETS[ORDER[i + 1]].targetFps)) to = ORDER[i + 1];
    if (!to || this.steps >= MAX_STEPS) {
      this.finished = true;
      return { kind: 'done', quality: this.tier };
    }
    if (ORDER.indexOf(to) < i) this.wentDown = true;
    this.steps++;
    this.tier = to;
    this.time = this.sum = this.n = 0;
    return { kind: 'change', to };
  }
}
