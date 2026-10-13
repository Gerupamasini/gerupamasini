/** What the dynamic resolution aims at. */
export interface DynResConfig {
  /** the frame time aimed at, milliseconds (the tier's target frame rate) */
  targetMs: number;
  /** the scale (of the screen's width and height) the view is drawn at, at most: the tier's own */
  max: number;
  /** and at least */
  min: number;
}

const STEP = 0.05;
/** seconds after a change before the next: the frames at the new size must be measured first */
const SETTLE = 0.75;
/** the GPU's time is kept between these shares of the target (above: smaller; below: larger) */
const HIGH = 0.92, LOW = 0.7;

/**
 * Draws the 3D view smaller when the GPU cannot keep the frame rate, and larger again when it has room. With the
 * GPU's time measured, it keeps that time under the target; without, it can only see frames that come late, so it goes
 * down when they do (to 70 % of the tier's scale at most) and tries a step up after a quiet while.
 * A step down that does not lower the GPU's time (the frame is bound by something other than its pixels) is undone,
 * and the scale is held there for a while.
 */
export class DynamicResolution {
  /** steps below the tier's scale */
  private level = 0;
  private time = 0;
  private nextAt = 0;
  private gpu = Number.NaN;
  private dropped = false;
  private dropGpu = Number.NaN;
  private floorLevel = Infinity;
  private floorUntil = 0;
  private slow = 0;
  private quiet = 0;
  private upWait = 5;
  private lastUpAt = -Infinity;

  constructor(private cfg: DynResConfig) {}

  /** The scale to draw at now. */
  get scale(): number {
    return Math.max(this.cfg.min, this.cfg.max - this.level * STEP);
  }

  /** New bounds (the window resized): the steps taken are kept. */
  configure(cfg: DynResConfig): void {
    this.cfg = cfg;
  }

  /** A new tier (or scene): back to its own scale, everything measured forgotten. */
  reset(cfg: DynResConfig = this.cfg): void {
    this.cfg = cfg;
    this.level = 0;
    this.nextAt = this.time + SETTLE;
    this.gpu = Number.NaN;
    this.dropped = false;
    this.floorUntil = 0;
    this.slow = this.quiet = 0;
    this.upWait = 5;
  }

  /** One frame: its length (seconds) and the GPU's time for it (ms, NaN when unknown). True when the scale changed. */
  update(dt: number, gpuMs: number): boolean {
    this.time += dt;
    const target = this.cfg.targetMs;
    let want = 0;
    const timed = Number.isFinite(gpuMs);
    if (timed) {
      this.gpu = Number.isFinite(this.gpu) ? this.gpu + (gpuMs - this.gpu) * Math.min(1, dt * 4) : gpuMs;
      if (this.gpu > target * HIGH) want = -1;
      else if (this.gpu < target * LOW) want = 1;
    } else {
      if (dt * 1000 > target * 1.15) { this.slow += dt; this.quiet = 0; } else { this.quiet += dt; this.slow = Math.max(0, this.slow - dt); }
      if (this.slow > 1) want = -1;
      else if (this.quiet > this.upWait) want = 1;
    }
    if (this.time < this.nextAt) return false;
    // (timed: down to the floor itself, the last step cut short; untimed: no lower than 70 % of the tier's scale)
    const maxLevel = timed
      ? Math.max(0, Math.ceil((this.cfg.max - this.cfg.min) / STEP - 1e-6))
      : Math.max(0, Math.floor((this.cfg.max - Math.max(this.cfg.min, this.cfg.max * 0.7)) / STEP + 1e-6));
    if (want < 0) {
      if (timed && this.dropped && this.gpu > this.dropGpu * 0.97) {
        // the last step down bought nothing: undone, and held there
        this.dropped = false;
        this.floorLevel = this.level - 1;
        this.floorUntil = this.time + 20;
        return this.set(this.level - 1);
      }
      const limit = this.time < this.floorUntil ? Math.min(maxLevel, this.floorLevel) : maxLevel;
      if (this.level >= limit) return false;
      // (a step up that soon proves too much: the next try waits longer)
      if (!timed && this.time - this.lastUpAt < 3) this.upWait = Math.min(60, this.upWait * 2);
      this.dropped = true;
      this.dropGpu = this.gpu;
      this.slow = 0;
      return this.set(this.level + 1);
    }
    this.dropped = false;
    if (want > 0 && this.level > 0) {
      this.quiet = 0;
      this.lastUpAt = this.time;
      return this.set(this.level - 1);
    }
    return false;
  }

  private set(level: number): boolean {
    const before = this.scale;
    this.level = Math.max(0, level);
    this.nextAt = this.time + SETTLE;
    return this.scale !== before;
  }
}
