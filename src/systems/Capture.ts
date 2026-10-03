import { signal } from '@preact/signals';
import type { Individual } from '../creatures/Individual';
import type { ToolDef } from '../data/schemas';
import type { ToolId } from '../ui/store';

export type CapturePhase = 'swing' | 'lift' | 'check' | 'done';

export interface CaptureState {
  toolId: ToolId;
  toolName: string;
  result: 'success' | 'fail';
  /** swing: the tool goes through the water or the sand; lift: it comes up to the eye; check: look at it; done: lower it */
  phase: CapturePhase;
  /** seconds into the phase */
  elapsed: number;
  /** what came up can be seen (the water or the sand has fallen away) */
  revealed: boolean;
  /** what came up: "マハゼ 6.9 cm ・ シラタエビ 3.1 cm" */
  catchText: string;
}

/** seconds each phase takes */
export const CAPTURE_PHASE_SEC: Record<CapturePhase, number> = { swing: 0.42, lift: 0.8, check: 2.3, done: 0.3 };
/** an empty net or scoop comes straight back: no looking, no words */
export const EMPTY_PHASE_SEC: Record<CapturePhase, number> = { swing: 0.42, lift: 0.35, check: 0.2, done: 0.2 };
/** seconds into `check` at which what came up can be seen */
export const REVEAL_SEC = 0.55;

export function catchLabel(inds: Individual[]): string {
  return inds.map((ind) => `${ind.species.names.ja} ${(ind.length_mm / 10).toFixed(1)} cm`).join(' ・ ');
}

/**
 * A capture attempt as it plays out in first person. Whether anything is in the net or on the shovel is decided
 * the moment the tool is swung — by where it went and whether the animal got away — not by a bar: the caller
 * works that out and hands over what was caught. The sequence then shows it: the tool sweeps, comes up to the
 * eye, and only when the water or the sand has fallen away does the result show.
 */
export class Capture {
  readonly state = signal<CaptureState | null>(null);
  private caught: Individual[] = [];
  private running = false;
  /** debug: every animal in the zone is caught (smoke tests) */
  forceCatch = false;
  /** the tool has passed through: the animals are in it or gone */
  onSwung: ((caught: Individual[]) => void) | null = null;
  /** the sequence has finished */
  onResolved: ((caught: Individual[]) => void) | null = null;

  get active(): boolean {
    return this.running;
  }

  get catches(): readonly Individual[] {
    return this.caught;
  }

  start(tool: ToolDef, caught: Individual[]): void {
    this.caught = caught;
    this.running = true;
    this.state.value = {
      toolId: tool.id as ToolId, toolName: tool.ja, result: caught.length ? 'success' : 'fail', phase: 'swing', elapsed: 0, revealed: false,
      catchText: catchLabel(caught),
    };
  }

  /** Seen enough: lower the tool now (while looking at what came up). */
  skip(): void {
    const st = this.state.value;
    if (!st || st.phase !== 'check') return;
    this.state.value = { ...st, phase: 'done', elapsed: 0, revealed: true };
  }

  update(dt: number): void {
    const st = this.state.value;
    if (!st || !this.running) return;
    const elapsed = st.elapsed + dt;
    const limit = (st.result === 'fail' ? EMPTY_PHASE_SEC : CAPTURE_PHASE_SEC)[st.phase];
    if (elapsed < limit) {
      const revealed = st.revealed || (st.phase === 'check' && elapsed >= REVEAL_SEC);
      this.state.value = { ...st, elapsed, revealed };
      return;
    }
    switch (st.phase) {
      case 'swing':
        this.state.value = { ...st, phase: 'lift', elapsed: 0 };
        this.onSwung?.(this.caught);
        break;
      case 'lift':
        this.state.value = { ...st, phase: 'check', elapsed: 0 };
        break;
      case 'check':
        this.state.value = { ...st, phase: 'done', elapsed: 0, revealed: true };
        break;
      default: {
        const caught = this.caught;
        this.caught = [];
        this.running = false;
        this.state.value = null;
        this.onResolved?.(caught);
      }
    }
  }
}
