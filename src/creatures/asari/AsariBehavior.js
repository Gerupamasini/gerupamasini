/**
 * アサリ behaviour: seven states, all motion procedural (springs + a little noise, no clips).
 *
 * Burrowing follows the bivalve digging cycle (Trueman 1966; Stanley 1970, Venerid burrowing):
 *   probe — the foot extends into the sand while the valves are slightly open
 *   anchor — the foot tip dilates (terminal anchor)
 *   adductor — the valves snap shut, jetting water that loosens the sand under the shell
 *   retract — the pedal retractors pull the shell down toward the foot, rocking it
 *   relax — the valves reopen against the sand (penetration anchor), the foot thins again
 * A clam left lying on the surface first levers itself upright, then sinks anterior-ventral end first and
 * finishes posterior end up with only the short fused siphons at the surface.
 *
 * Outputs are in shell lengths / radians; the driver turns them into transforms.
 */

export const STATE = {
  BURIED: 'BURIED',
  FILTER_FEEDING: 'FILTER_FEEDING',
  SIPHON_EXTEND: 'SIPHON_EXTEND',
  SIPHON_RETRACT: 'SIPHON_RETRACT',
  BURROW: 'BURROW',
  EMERGE_SLIGHTLY: 'EMERGE_SLIGHTLY',
  CLOSE_SHELL: 'CLOSE_SHELL',
  /** lying whole on the surface: just set down, or nothing to dig into */
  SURFACE_REST: 'SURFACE_REST',
};

/** behaviour ids reported to the 図鑑 */
const EVENT = {
  FILTER_FEEDING: 'filter_feeding',
  SIPHON_EXTEND: 'siphon_extend',
  SIPHON_RETRACT: 'siphon_retract',
  BURROW: 'burrow',
  EMERGE_SLIGHTLY: 'emerge',
  CLOSE_SHELL: 'close_shell',
};

const EMERGE_DEPTH = 0.62;

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** exponential approach, frame-rate independent */
const damp = (v, target, rate, dt) => target + (v - target) * Math.exp(-rate * dt);

/** smooth 1D value noise in [-1, 1] */
function noise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 101.3) * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export class AsariBehavior {
  /**
   * @param {() => number} rand uniform [0,1)
   * @param {boolean} onSurface start lying on the sand (dug up / washed out) instead of buried
   */
  constructor(rand, onSurface = false) {
    this.rand = rand;
    this.seed = rand() * 100;
    this.t = 0;
    // on the surface: a pause lying whole, then (where it can) the dig
    this.state = onSurface ? STATE.SURFACE_REST : STATE.BURIED;
    this.timer = onSurface ? 1.5 + rand() * 3 : 1 + rand() * 4;
    this.canBurrow = true;
    /** 0 lying on the surface .. 1 buried upright */
    this.burial = onSurface ? 0 : 1;
    this.burialTarget = 1;
    // outputs
    this.gape = 0.1;
    this.foot = { ext: 0, swell: 0, bend: 0 };
    this.siphonExt = 0;
    this.siphonOpen = 0;
    this.rock = 0;
    this.roll = 0;
    this.pull = 0;         // shell lengths moved toward the foot this stroke
    this.disturb = 0;      // sand disturbance for the decal
    this.breath = 0;
    // digging cycle
    this.cycle = 0;
    this.cycleT = 2.6;
    this.strokeStart = 0;
    this.rollSign = 1;
    this.calm = 0;
    this.listeners = [];
  }

  onEvent(cb) { this.listeners.push(cb); }

  go(state, timer = 0) {
    if (this.state === state) return;
    this.state = state;
    this.timer = timer;
    const id = EVENT[state];
    if (id) for (const l of this.listeners) l(id);
  }

  beginBurrow(target = 1) {
    this.burialTarget = target;
    this.cycle = 0;
    this.cycleT = 2.2 + this.rand() * 0.8;
    this.strokeStart = this.burial;
    this.go(STATE.BURROW);
  }

  /** brain intent: 'reposition' (emerge a little and dig in again) | 'threat' */
  request(kind) {
    if (kind === 'threat') { this.calm = 0; this.threatHold = 3; }
    else if (kind === 'reposition' && (this.state === STATE.BURIED || this.state === STATE.FILTER_FEEDING) && this.burial > 0.95) {
      this.go(STATE.EMERGE_SLIGHTLY, 0);
      this.burialTarget = EMERGE_DEPTH;
    }
  }

  /**
   * @param {number} dt seconds (sim time)
   * @param {{ threat: boolean, submerged: boolean, canBurrow?: boolean }} env
   */
  update(dt, env) {
    this.t += dt;
    this.timer -= dt;
    this.canBurrow = env.canBurrow ?? true;
    // nothing to dig into (an acrylic floor): whatever it was doing, it comes up and lies whole
    if (!this.canBurrow && this.state !== STATE.SURFACE_REST) {
      this.burial = Math.max(0, this.burial - dt * 0.6);
      if (this.burial <= 0) this.go(STATE.SURFACE_REST, 0);
    }
    this.threatHold = Math.max(0, (this.threatHold ?? 0) - dt);
    const threat = env.threat || this.threatHold > 0;
    this.calm = threat ? 0 : this.calm + dt;
    const n = (f, o = 0) => noise1(this.t * f + o, this.seed);
    // spring targets for the states that are not cycle-driven
    let gapeT = 0.12, extT = 0, openT = 0, extRate = 1.2, gapeRate = 2, footT = 0;

    switch (this.state) {
      case STATE.SURFACE_REST: {
        // valves a little apart, the siphons out a touch when under water; the dig starts once it has settled
        gapeT = threat ? 0 : 0.3; extT = env.submerged && !threat ? 0.45 : 0; openT = extT > 0 ? 0.4 : 0; extRate = 0.8;
        if (this.canBurrow && this.timer <= 0 && !threat) this.beginBurrow();
        break;
      }
      case STATE.BURROW: {
        if (!this.canBurrow) break;
        this.dig(dt, threat);
        break;
      }
      case STATE.BURIED: {
        gapeT = threat ? 0 : 0.1;
        if (this.burial < 0.95) { if (this.canBurrow) this.beginBurrow(); break; }
        if (this.timer <= 0 && !threat && env.submerged && this.calm > 2) this.go(STATE.SIPHON_EXTEND, 3 + this.rand() * 2);
        break;
      }
      case STATE.SIPHON_EXTEND: {
        // the valves part first; only then do the siphons push out through the posterior gape
        gapeT = 0.65; extT = this.gape > 0.45 ? 1 : 0; openT = this.gape > 0.45 ? 0.55 : 0; extRate = 0.9;
        if (threat || !env.submerged) { this.go(STATE.SIPHON_RETRACT, 0.6); break; }
        if (this.timer <= 0 && this.siphonExt > 0.9) this.go(STATE.FILTER_FEEDING, 20 + this.rand() * 50);
        break;
      }
      case STATE.FILTER_FEEDING: {
        // slow irregular pumping: the inhalant rim opens and narrows, the siphons telescope a little
        const pump = 0.5 + 0.5 * Math.sin(this.t * 1.3 + n(0.3) * 2.5);
        gapeT = 0.5 + 0.08 * n(0.4, 7);
        extT = 0.93 + 0.05 * n(0.25, 3) - 0.03 * pump;
        openT = 0.65 + 0.3 * pump;
        if (threat || !env.submerged) { this.go(STATE.SIPHON_RETRACT, 0.6); break; }
        if (this.timer <= 0) {
          if (this.rand() < 0.12) this.request('reposition');
          else if (this.rand() < 0.35) this.go(STATE.SIPHON_RETRACT, 0.6);   // spontaneous withdrawal
          else this.timer = 15 + this.rand() * 40;
        }
        break;
      }
      case STATE.SIPHON_RETRACT: {
        // withdrawal is fast: the siphon retractors snap the tubes back under the sand
        // the valves stay parted until the siphons are in
        gapeT = Math.max(0.12, this.siphonExt); extT = 0; openT = 0; extRate = 9;
        if (this.timer <= 0 && this.siphonExt < 0.08) {
          if (threat || !env.submerged) this.go(STATE.CLOSE_SHELL, 0.4);
          else this.go(STATE.BURIED, 3 + this.rand() * 6);
        }
        break;
      }
      case STATE.CLOSE_SHELL: {
        gapeT = 0; gapeRate = 14;
        if (this.timer <= 0) this.go(STATE.BURIED, 8 + this.rand() * 10);
        break;
      }
      case STATE.EMERGE_SLIGHTLY: {
        // the foot pushes down, the shell works up until the posterior margin breaks the surface, then digs in again
        if (this.burial > EMERGE_DEPTH + 0.01) {
          const ph = (this.t * 0.45) % 1;
          footT = ph < 0.5 ? 0.7 : 0.2;
          gapeT = ph < 0.6 ? 0.5 : 0.15;
          this.burial = Math.max(EMERGE_DEPTH, this.burial - dt * (ph > 0.6 ? 0.05 : 0.008));
          extT = 0.5; openT = 0.3;
          this.timer = 4 + this.rand() * 6;
        } else {
          gapeT = 0.4; extT = 0.9; openT = 0.6;
          if (this.timer <= 0 || threat) this.beginBurrow(1);
        }
        this.disturb = Math.max(this.disturb, 0.5);
        if (threat) this.beginBurrow(1);
        break;
      }
    }

    if (this.state !== STATE.BURROW) {
      this.gape = damp(this.gape, gapeT, gapeRate, dt);
      this.siphonExt = damp(this.siphonExt, extT, extRate, dt);
      this.siphonOpen = damp(this.siphonOpen, openT, extRate * 1.5, dt);
      this.foot.ext = damp(this.foot.ext, footT, 3, dt);
      this.foot.swell = damp(this.foot.swell, 0, 3, dt);
      this.foot.bend = damp(this.foot.bend, 0, 3, dt);
      this.rock = damp(this.rock, 0, 2, dt);
      this.roll = damp(this.roll, 0, 2, dt);
      this.pull = 0;
      this.disturb = damp(this.disturb, 0, 0.15, dt);
    }
    // micro animation — never a pure sine
    this.gapeOut = Math.max(0, this.gape + 0.025 * n(0.7, 11) * (this.gape > 0.02 ? 1 : 0));
    this.breath = 0.5 + 0.5 * Math.sin(this.t * 0.9 + n(0.2, 5) * 2);
    this.swayY = (0.07 * n(0.35, 13) + 0.03 * n(1.7, 17)) * this.siphonExt;
    this.swayZ = (0.07 * n(0.31, 19) + 0.03 * n(1.9, 23)) * this.siphonExt;
    this.extOut = this.siphonExt * (1 + 0.04 * n(0.5, 29));
    this.openOut = Math.min(1, Math.max(0, this.siphonOpen + 0.08 * n(1.1, 31) * this.siphonExt));
    return this.state;
  }

  /** one digging cycle after another until burialTarget is reached */
  dig(dt, threat) {
    const T = this.cycleT * (threat ? 0.8 : 1);
    this.cycle += dt / T;
    const tau = this.cycle % 1;
    if (this.cycle >= 1) {
      this.cycle = 0;
      this.cycleT = 2.2 + this.rand() * 0.9 + this.burial * 0.8;   // deeper is harder
      this.strokeStart = this.burial;
      this.rollSign = this.rand() < 0.5 ? -1 : 1;
      if (this.burial >= this.burialTarget - 0.002) {
        this.foot.ext = 0.3;
        this.go(STATE.SIPHON_EXTEND, 2.5);
        this.timer = 2.5;
        return;
      }
    }
    // the first strokes mostly lever the shell upright, later ones sink it; each stroke gains less
    const gain = this.burial < 0.3 ? 0.1 : 0.085 * (1.15 - this.burial * 0.4);
    const f = this.foot;
    if (tau < 0.45) {                       // probe
      const u = sm(0, 0.45, tau);
      f.ext = 0.3 + 0.7 * u; f.swell = 0; f.bend = 0.15 * u;
      this.gape = 0.55;
    } else if (tau < 0.55) {                // anchor
      f.ext = 1; f.swell = sm(0.45, 0.55, tau); f.bend = 0.15 + 0.35 * f.swell;
      this.gape = 0.55;
    } else if (tau < 0.62) {                // adductor: valves snap shut, water jet
      f.swell = 1;
      this.gape = 0.55 * (1 - sm(0.55, 0.6, tau));
      this.disturb = Math.min(1, this.disturb + dt * 6);
    } else if (tau < 0.85) {                // retract: pulled down toward the anchored foot
      const u = sm(0.62, 0.85, tau);
      f.ext = 1 - 0.7 * u; f.swell = 1 - 0.3 * u; f.bend = 0.5 - 0.2 * u;
      this.burial = Math.min(this.burialTarget, this.strokeStart + gain * u);
      this.gape = 0;
      this.pull = 0.05 * Math.sin(u * Math.PI);
    } else {                                // relax: valves reopen, foot slackens
      const u = sm(0.85, 1, tau);
      f.swell = 0.7 * (1 - u); f.ext = 0.3; f.bend = 0.3 * (1 - u);
      this.gape = 0.4 * u;
      this.pull = 0;
    }
    // rocking: anterior end dips during the pull, then the posterior; plus a little side to side
    const stroke = tau > 0.55 ? Math.sin(((tau - 0.55) / 0.45) * Math.PI * 2) : 0;
    this.rock = 0.14 * stroke * (1 - this.burial * 0.5);
    this.roll = 0.06 * this.rollSign * Math.sin(Math.min(1, Math.max(0, (tau - 0.55) / 0.45)) * Math.PI);
    this.disturb = Math.max(this.disturb * Math.exp(-dt * 0.8), 0.45);
    this.siphonExt = damp(this.siphonExt, 0, 6, dt);
    this.siphonOpen = damp(this.siphonOpen, 0, 6, dt);
  }
}
