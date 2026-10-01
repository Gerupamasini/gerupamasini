import { signal } from '@preact/signals';
import type { Individual } from '../creatures/Individual';
import type { ToolDef } from '../data/schemas';

export interface CaptureState {
  speciesName: string;
  cursor: number;
  bandStart: number;
  bandEnd: number;
  result: 'none' | 'success' | 'fail';
  toolName: string;
}

/** Timing mini-game for the hand net: a cursor sweeps a bar; click while it is inside the band. */
export class Capture {
  readonly state = signal<CaptureState | null>(null);
  private target: Individual | null = null;
  private dir = 1;
  private speed = 1;
  private resultTimer = 0;
  onResolved: ((ind: Individual, success: boolean) => void) | null = null;

  get active(): boolean {
    return this.target !== null;
  }

  start(ind: Individual, tool: ToolDef): void {
    const diff = ind.species.capture.baseDifficulty;
    const alertPenalty = ind.species.capture.alertPenalty * ind.alert;
    const width = Math.max(0.08, (tool.params.bandWidth ?? 0.24) * (1 - 0.5 * diff) * (1 - alertPenalty));
    const start = 0.15 + ind.rng.next() * (0.7 - width);
    this.speed = (tool.params.barSpeed ?? 1.1) * (0.8 + 0.6 * diff) * (1 + 0.5 * ind.alert);
    this.dir = 1;
    this.resultTimer = 0;
    this.target = ind;
    this.state.value = { speciesName: ind.species.names.ja, cursor: 0, bandStart: start, bandEnd: start + width, result: 'none', toolName: tool.ja };
  }

  /** Player pressed the button. */
  attempt(): void {
    const st = this.state.value;
    if (!st || !this.target || st.result !== 'none') return;
    const ok = st.cursor >= st.bandStart && st.cursor <= st.bandEnd;
    this.state.value = { ...st, result: ok ? 'success' : 'fail' };
    this.resultTimer = ok ? 0.9 : 1.2;
  }

  update(dt: number): void {
    const st = this.state.value;
    if (!st || !this.target) return;
    if (st.result === 'none') {
      let c = st.cursor + this.dir * this.speed * dt;
      if (c > 1) { c = 1; this.dir = -1; }
      if (c < 0) { c = 0; this.dir = 1; }
      this.state.value = { ...st, cursor: c };
      return;
    }
    this.resultTimer -= dt;
    if (this.resultTimer <= 0) {
      const ind = this.target, ok = st.result === 'success';
      this.target = null;
      this.state.value = null;
      this.onResolved?.(ind, ok);
    }
  }

  cancel(): void {
    this.target = null;
    this.state.value = null;
  }
}
