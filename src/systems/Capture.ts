import { signal } from '@preact/signals';
import type { Individual } from '../creatures/Individual';
import type { ToolDef } from '../data/schemas';

export type CapturePhase = 'aim' | 'swing' | 'lift' | 'check' | 'done';

export interface CaptureState {
  speciesName: string;
  toolName: string;
  cursor: number;
  bandStart: number;
  bandEnd: number;
  result: 'none' | 'success' | 'fail';
  /** aim: the timing bar; swing: the net sweeps; lift: it comes up to the eye; check: look inside; done: lower it */
  phase: CapturePhase;
  /** seconds into the phase */
  elapsed: number;
  /** the bag's contents can be seen (the water has run out) */
  revealed: boolean;
  /** what came up: "マハゼ 6.9 cm" */
  catchText: string;
}

/** seconds each phase after the swing takes */
export const CAPTURE_PHASE_SEC: Record<Exclude<CapturePhase, 'aim'>, number> = { swing: 0.42, lift: 0.8, check: 2.3, done: 0.3 };
/** seconds into `check` at which the water has drained enough to see what is in the bag */
export const REVEAL_SEC = 0.55;

/**
 * タモ (dip net) capture. Aim is a timing bar: a cursor sweeps, click while it is inside the band. The swing is
 * then played out in first person: the net sweeps through the water, comes up to the eye and is looked into,
 * and only then does the result show — the moment of ガサガサ.
 */
export class Capture {
  readonly state = signal<CaptureState | null>(null);
  private target: Individual | null = null;
  private dir = 1;
  private speed = 1;
  /** the net has passed through the water: the animal is in the bag or gone */
  onSwung: ((ind: Individual, success: boolean) => void) | null = null;
  /** the sequence has finished */
  onResolved: ((ind: Individual, success: boolean) => void) | null = null;

  get active(): boolean {
    return this.target !== null;
  }

  get targetIndividual(): Individual | null {
    return this.target;
  }

  start(ind: Individual, tool: ToolDef): void {
    const diff = ind.species.capture.baseDifficulty;
    const alertPenalty = ind.species.capture.alertPenalty * ind.alert;
    const width = Math.max(0.08, (tool.params.bandWidth ?? 0.24) * (1 - 0.5 * diff) * (1 - alertPenalty));
    const start = 0.15 + ind.rng.next() * (0.7 - width);
    this.speed = (tool.params.barSpeed ?? 1.1) * (0.8 + 0.6 * diff) * (1 + 0.5 * ind.alert);
    this.dir = 1;
    this.target = ind;
    this.state.value = {
      speciesName: ind.species.names.ja, toolName: tool.ja, cursor: 0, bandStart: start, bandEnd: start + width,
      result: 'none', phase: 'aim', elapsed: 0, revealed: false, catchText: `${ind.species.names.ja} ${(ind.length_mm / 10).toFixed(1)} cm`,
    };
  }

  /** Player pressed the button: the net is swung. */
  attempt(): void {
    const st = this.state.value;
    if (!st || !this.target || st.phase !== 'aim') return;
    const ok = st.cursor >= st.bandStart && st.cursor <= st.bandEnd;
    this.state.value = { ...st, result: ok ? 'success' : 'fail', phase: 'swing', elapsed: 0 };
  }

  update(dt: number): void {
    const st = this.state.value;
    if (!st || !this.target) return;
    if (st.phase === 'aim') {
      let c = st.cursor + this.dir * this.speed * dt;
      if (c > 1) { c = 1; this.dir = -1; }
      if (c < 0) { c = 0; this.dir = 1; }
      this.state.value = { ...st, cursor: c };
      return;
    }
    const elapsed = st.elapsed + dt;
    const limit = CAPTURE_PHASE_SEC[st.phase];
    if (elapsed < limit) {
      const revealed = st.revealed || (st.phase === 'check' && elapsed >= REVEAL_SEC);
      if (elapsed !== st.elapsed || revealed !== st.revealed) this.state.value = { ...st, elapsed, revealed };
      return;
    }
    const ind = this.target, ok = st.result === 'success';
    switch (st.phase) {
      case 'swing':
        this.state.value = { ...st, phase: 'lift', elapsed: 0 };
        this.onSwung?.(ind, ok);
        break;
      case 'lift':
        this.state.value = { ...st, phase: 'check', elapsed: 0 };
        break;
      case 'check':
        this.state.value = { ...st, phase: 'done', elapsed: 0, revealed: true };
        break;
      default:
        this.target = null;
        this.state.value = null;
        this.onResolved?.(ind, ok);
    }
  }

  /** Give up (only while still aiming). */
  cancel(): boolean {
    const st = this.state.value;
    if (st && st.phase !== 'aim') return false;
    this.target = null;
    this.state.value = null;
    return true;
  }
}
