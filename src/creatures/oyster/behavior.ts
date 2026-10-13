/**
 * What an oyster does: open a little to feed when the water is over it, shut fast when something touches or shakes
 * it, stay shut while the tide is out. Five states, no planner:
 *
 *   LOW_TIDE_CLOSED  out of the water: shut (an exposed oyster holds its water in and waits)
 *   SUBMERGED        covered again: still shut for a while, then opening slowly (minutes in life, seconds here)
 *   FILTER_FEEDING   open by its feeding gape (a few millimetres at the margin), the gape breathing a little, now and
 *                    then a quick "cough" (a partial snap shut and slow reopening that flushes pseudofaeces)
 *   CLOSED           resting shut under water for a spell; oysters do not feed all the time
 *   THREAT_CLOSE     touched, shaken by footsteps, shaded or hit by a sudden change in the water: snapped shut in a
 *                    fraction of a second and held, then back to SUBMERGED (or LOW_TIDE_CLOSED if the water left)
 *
 * Opening is slow and closing fast, as in the valvometry records: adductor contraction is quick, the ligament's
 * reopening slow.
 */
export type OysterState = 'CLOSED' | 'FILTER_FEEDING' | 'THREAT_CLOSE' | 'LOW_TIDE_CLOSED' | 'SUBMERGED';

export interface OysterSenses {
  /** water over the shell (m); ≤ 0 means exposed */
  depth: number;
  /** strongest disturbance felt this step, 0..1 (touch 1, a run nearby ~0.6, a walk ~0.3) */
  stimulus: number;
  /** the water level jumped (a wave of a tide tick, a debug jump): a shock */
  shock?: boolean;
}

const OPEN_DELAY = [2.5, 9];      // seconds shut after being covered before opening starts
const OPEN_RATE = 0.12;           // fraction of the feeding gape per second while opening
const CLOSE_TAU = 0.09;           // snap closure time constant (s)
const HOLD = [5, 16];             // seconds held shut after a threat
const THRESHOLD = 0.28;           // stimulus that makes it shut

export class OysterBehavior {
  state: OysterState = 'LOW_TIDE_CLOSED';
  /** current gape (radians) */
  gape = 0;
  /** seconds in the current state */
  t = 0;
  private wait = 0;
  private cough = 0;
  private rand: () => number;

  constructor(readonly gapeMax: number, seed: number, start: OysterState = 'LOW_TIDE_CLOSED') {
    let a = seed >>> 0 || 1;
    this.rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.enter(start);
    if (start === 'FILTER_FEEDING') this.gape = gapeMax;
  }

  private range(r: number[]): number { return r[0] + (r[1] - r[0]) * this.rand(); }

  private enter(s: OysterState): void {
    this.state = s;
    this.t = 0;
    if (s === 'SUBMERGED') this.wait = this.range(OPEN_DELAY);
    else if (s === 'THREAT_CLOSE') this.wait = this.range(HOLD);
    else if (s === 'CLOSED') this.wait = this.range([8, 30]);
    else if (s === 'FILTER_FEEDING') this.wait = this.range([25, 90]);
  }

  /** Advance by dt seconds. Returns the gape (radians). */
  update(dt: number, senses: OysterSenses): number {
    this.t += dt;
    const wet = senses.depth > 0.005;
    const threat = senses.stimulus >= THRESHOLD || !!senses.shock;
    // transitions
    if (threat && this.state !== 'LOW_TIDE_CLOSED') this.enter('THREAT_CLOSE');
    else if (!wet && this.state !== 'LOW_TIDE_CLOSED' && this.state !== 'THREAT_CLOSE') this.enter('LOW_TIDE_CLOSED');
    switch (this.state) {
      case 'LOW_TIDE_CLOSED':
        if (wet) this.enter('SUBMERGED');
        break;
      case 'THREAT_CLOSE':
        if (this.t > this.wait) this.enter(wet ? 'SUBMERGED' : 'LOW_TIDE_CLOSED');
        break;
      case 'SUBMERGED':
        if (this.t > this.wait && this.gape >= this.gapeMax * 0.97) this.enter('FILTER_FEEDING');
        break;
      case 'FILTER_FEEDING':
        if (this.t > this.wait) this.enter(this.rand() < 0.35 ? 'CLOSED' : 'FILTER_FEEDING');
        // the occasional cough
        if (this.cough <= 0 && this.rand() < dt / 40) this.cough = 1;
        break;
      case 'CLOSED':
        if (this.t > this.wait) this.enter('SUBMERGED');
        break;
    }
    // the gape follows: fast shut, slow open
    let target = 0;
    if (this.state === 'FILTER_FEEDING') target = this.gapeMax;
    else if (this.state === 'SUBMERGED' && this.t > this.wait) target = this.gapeMax;
    if (this.cough > 0) {
      this.cough -= dt / 3;
      if (this.cough > 0.85) target *= 0.25;
    }
    if (target < this.gape) this.gape += (target - this.gape) * Math.min(1, dt / (this.state === 'THREAT_CLOSE' ? CLOSE_TAU : 0.6));
    else this.gape = Math.min(target, this.gape + this.gapeMax * OPEN_RATE * dt);
    if (this.gape < 1e-4) this.gape = 0;
    return this.gape;
  }

  /** Something touched this oyster right now. */
  touch(): void {
    if (this.state !== 'LOW_TIDE_CLOSED') this.enter('THREAT_CLOSE');
  }
}

/**
 * How much a player disturbs an oyster at a distance: footfalls carry through rock and mud; a touch (within a hand's
 * reach of the shell) always shuts it.
 */
export function playerStimulus(dist: number, speed: number, running: boolean): number {
  if (dist < 0.25) return 1;
  const shake = running ? 0.75 : speed > 0.05 ? 0.38 : 0;
  const reach = running ? 4 : 1.6;
  return shake * Math.max(0, 1 - dist / reach);
}
