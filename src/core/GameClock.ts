export interface TicketState {
  /** game time (epoch ms) being reproduced */
  targetGameMs: number;
  /** real time when the ticket was activated */
  startedRealMs: number;
  /** seconds of effect remaining (counts down only while not paused) */
  remainingSec: number;
  paused: boolean;
  phase: 'active' | 'ending';
}

export const TICKET_DURATION_SEC = 30 * 60;
export const TICKET_ENDING_SEC = 10;
export const TICKET_RANGE_DAYS = 3;

/**
 * Game clock. Game time equals real time unless a 潮時チケット is active, in which case the clock is
 * offset to the chosen moment. Creatures use `nowGame()`; saves and statistics use `nowReal()`.
 */
export class GameClock {
  ticket: TicketState | null = null;
  private offsetMs = 0;
  private endingFromOffset = 0;
  private endingT = 0;
  private lastReal = Date.now();
  /** Called when the ticket runs out or is cancelled (after the ending blend). */
  onTicketEnd: (() => void) | null = null;
  onTicketWarning: (() => void) | null = null;
  private warned = false;

  nowReal(): number {
    return Date.now();
  }

  nowGame(): number {
    return this.nowReal() + this.offsetMs;
  }

  /** Offset (ms) between game and real time; 0 when no ticket is active. */
  get offset(): number {
    return this.offsetMs;
  }

  useTicket(targetGameMs: number): void {
    const now = this.nowReal();
    this.ticket = { targetGameMs, startedRealMs: now, remainingSec: TICKET_DURATION_SEC, paused: false, phase: 'active' };
    this.offsetMs = targetGameMs - now;
    this.warned = false;
  }

  cancelTicket(): void {
    if (!this.ticket || this.ticket.phase === 'ending') return;
    this.ticket.phase = 'ending';
    this.ticket.remainingSec = 0;
    this.endingFromOffset = this.offsetMs;
    this.endingT = 0;
  }

  setPaused(paused: boolean): void {
    if (this.ticket) this.ticket.paused = paused;
  }

  update(): void {
    const now = this.nowReal();
    const dt = Math.min(5, Math.max(0, (now - this.lastReal) / 1000));
    this.lastReal = now;
    const t = this.ticket;
    if (!t) return;
    if (t.phase === 'active') {
      if (!t.paused) t.remainingSec -= dt;
      if (!this.warned && t.remainingSec <= 60) {
        this.warned = true;
        this.onTicketWarning?.();
      }
      if (t.remainingSec <= 0) this.cancelTicket();
      return;
    }
    // ending: blend the offset back to real time
    this.endingT += dt;
    const k = Math.min(1, this.endingT / TICKET_ENDING_SEC);
    const e = k * k * (3 - 2 * k);
    this.offsetMs = this.endingFromOffset * (1 - e);
    if (k >= 1) {
      this.offsetMs = 0;
      this.ticket = null;
      this.onTicketEnd?.();
    }
  }

  serialize(): TicketState | null {
    return this.ticket ? { ...this.ticket } : null;
  }

  restore(state: TicketState | null): void {
    if (!state || state.phase === 'ending' || state.remainingSec <= 0) {
      this.ticket = null;
      this.offsetMs = 0;
      return;
    }
    // the reproduced moment is kept fixed relative to the original activation, so the tide continues
    // from where it was when the game was closed
    const elapsedReal = this.nowReal() - state.startedRealMs;
    const elapsedGame = Math.min(elapsedReal, (TICKET_DURATION_SEC - state.remainingSec) * 1000);
    this.ticket = { ...state, paused: false };
    this.offsetMs = state.targetGameMs + elapsedGame - this.nowReal();
    this.warned = state.remainingSec <= 60;
  }
}
