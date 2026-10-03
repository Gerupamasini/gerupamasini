import { Vector3 } from 'three';
import { STANCE } from './ScopimeraGlobosaMorphology.js';
import { clamp, expInterval, lerp, rrange, smoothstep, wrapAngle } from './util.js';

/**
 * Behaviour of one コメツキガニ: a state machine over what the animal is doing, driven by a few internal drives and a
 * personality, reading a perception snapshot each tick and writing the animator's command.
 *
 *   IN_BURROW → EMERGING (unplug → rise → peek → climb out) → IDLE ⇄ FEED / WALK / INVESTIGATE / WAVE / DIG
 *   any surface state → ALERT (pause, orient) → back to work, BACK_OFF to the mouth, or RETREAT (sprint, go in
 *   sideways) → HIDE (deep, latency) → EMERGING again …       burrowless crabs WANDER and dig in when pressed.
 *
 * What is the species' own (literature, docs/creatures/kometsukigani/RESEARCH.md):
 *   • surface activity at daytime low tide, a part of each exposure, April–November; overwinters in the burrow
 *   • deposit feeding: chelae scoop surface sand to the mouth, the sorted sand is pressed into a pellet above the
 *     mouth, pinched off and dropped; trips radiate from the burrow, each turned a little the same way
 *   • burrow-holding males wave in the breeding season (Apr–Aug): stretch up, both chelae high, swing forward-down;
 *     neighbours' waving changes the rate; larger males wave more; waving stops once paired
 *   • residents defend the burrow; a small resident runs home or freezes; egg-carrying females stay plugged in
 *   • flight in stages (watch, then run home), earlier when far from the burrow (as in fiddler crabs) [R]
 */

export const STATE = {
  IN_BURROW: 'IN_BURROW', EMERGING: 'EMERGING', IDLE: 'IDLE', FEED: 'FEED', WALK: 'WALK', INVESTIGATE: 'INVESTIGATE',
  WAVE: 'WAVE', ALERT: 'ALERT', RETREAT: 'RETREAT', HIDE: 'HIDE', DIG: 'DIG', DEFEND: 'DEFEND', WANDER: 'WANDER',
};

const _v = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3();

/** day-of-year helpers (JST month/day → 0..365) */
export function breedingFactor(doy) {
  // April–August, peak mid-June to late July (Wada 1981; Hasegawa et al. 2022) [L]
  return smoothstep(100, 150, doy) * (1 - smoothstep(205, 245, doy));
}
export function seasonalActivity(doy) {
  // on the surface April–November [L]; slow at the edges of the season
  return smoothstep(80, 120, doy) * (1 - smoothstep(305, 335, doy));
}

export class CrabBehavior {
  /**
   * @param o {{ rand: () => number, sex: 'm'|'f', cw_mm: number, resident: boolean, ovigerous?: boolean }}
   */
  constructor({ rand, sex, cw_mm, resident = true, ovigerous = false }) {
    this.rand = rand;
    this.sex = sex;
    this.cw_mm = cw_mm;
    this.cw = cw_mm / 1000;
    this.resident = resident;
    this.ovigerous = ovigerous;
    // personality: individuals never move the same
    this.p = {
      boldness: rrange(rand, 0.7, 1.35),
      curiosity: rrange(rand, 0.2, 1),
      feedSpeed: rrange(rand, 0.85, 1.2),
      excursion: rrange(rand, 6, 15),            // trip length (CW)
      turn: rand() < 0.5 ? 1 : -1,               // trips rotate clockwise or anticlockwise [R]
      turnStep: rrange(rand, 0.25, 0.7),         // rad between trips
      waveVigor: rrange(rand, 0.6, 1.2),
      jitter: rrange(rand, 0.7, 1.3),
      emergeDelay: rrange(rand, 0.6, 1.6),
      synchronous: rand() < 0.2,                  // some scoop with both chelae together
    };
    // internal state
    this.hunger = rrange(rand, 0.4, 0.9);
    this.fear = 0;
    this.activity = 0;
    this.courtshipDrive = sex === 'm' ? rrange(rand, 0.2, 0.7) : 0;
    this.burrowAttachment = resident ? rrange(rand, 0.75, 1) : 0;
    this.state = resident ? STATE.IN_BURROW : STATE.WANDER;
    this.sub = 0;
    this.t = 0;
    this.timer = 0;
    this.events = [];
    this.pellet = 0;            // growth of the pellet at the mouth 0..1
    this.scoops = 0;
    this.scoopsPerPellet = Math.round(rrange(rand, 4, 7));
    this.tripAngle = rand() * Math.PI * 2;
    this.tripOut = 0;           // CW travelled on this trip
    this.tripStart = new Vector3();
    this.feedDir = new Vector3(0, 0, 1);
    this.target = new Vector3();
    this.goal = null;           // world target for WALK
    this.afterWalk = null;
    this.threat = null;         // { pos, level, kind }
    this.lastThreatPos = new Vector3();
    this.hideFor = 0;
    this.d = 1.8;               // depth in the burrow (CW along the shaft)
    this.plugged = true;
    this.unplugLeft = 0;
    this.waveBout = 0;
    this.waveGap = 0;
    this.paired = false;
    this.lastEvent = '';
    this.mouthWet = 0.6;
    this.tipSand = 0;
    this.wet = 0.8;
    this.sandCoat = 0.25;
    this.idleFor = 0;
    this.digLeft = 0;
    this.sinceSurface = 0;
    this.investigate = null;
    this.defendTarget = null;
    this.burrowFresh = 0;
    this.debug = '';
    this.waveSeen = false;
  }

  emit(id) {
    this.events.push(id);
    this.lastEvent = id;
  }

  /** drain events (behaviour ids for the 図鑑) */
  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  get onSurface() {
    return this.state !== STATE.IN_BURROW && this.state !== STATE.HIDE && !(this.state === STATE.EMERGING && this.d > 0.05) && !(this.state === STATE.RETREAT && this.sub >= 2 && this.d > 0.3);
  }

  /** how much of the crab can be seen: 0 deep in the burrow … 1 out */
  get exposure() {
    if (this.state === STATE.IN_BURROW || this.state === STATE.HIDE) return 0;
    if (this.state === STATE.EMERGING || this.state === STATE.RETREAT) return clamp(1 - (this.d + 0.1) / 0.7, 0, 1);
    return 1;
  }

  // ======================================================================================== tick

  /**
   * @param dt seconds
   * @param env perception snapshot (see ScopimeraGlobosa.js)
   * @param anim CrabAnimator
   */
  update(dt, env, anim) {
    this.t += dt;
    this.dtLast = dt;
    this.timer -= dt;
    const cmd = anim.cmd;
    this.updateDrives(dt, env, anim);
    const st = this.state;
    // threats interrupt everything on the surface (a peeking or dug-in crab handles its own)
    if (this.onSurface && st !== STATE.RETREAT && st !== STATE.EMERGING && !(st === STATE.WANDER && this.sub === 1)) {
      const lvl = this.threat ? this.threat.level : 0;
      if (lvl > this.retreatAt(env, anim)) { this.startRetreat(env, anim); }
      else if (lvl > 0.18 && st !== STATE.ALERT && this.fearCooldown <= 0) { this.startAlert(env, anim, lvl); }
    }
    this.fearCooldown = (this.fearCooldown ?? 0) - dt;
    switch (this.state) {
      case STATE.IN_BURROW: this.inBurrow(dt, env, anim); break;
      case STATE.HIDE: this.hide(dt, env, anim); break;
      case STATE.EMERGING: this.emerging(dt, env, anim); break;
      case STATE.IDLE: this.idle(dt, env, anim); break;
      case STATE.FEED: this.feed(dt, env, anim); break;
      case STATE.WALK: this.walk(dt, env, anim); break;
      case STATE.INVESTIGATE: this.investigateTick(dt, env, anim); break;
      case STATE.WAVE: this.wave(dt, env, anim); break;
      case STATE.ALERT: this.alert(dt, env, anim); break;
      case STATE.RETREAT: this.retreat(dt, env, anim); break;
      case STATE.DIG: this.dig(dt, env, anim); break;
      case STATE.DEFEND: this.defend(dt, env, anim); break;
      case STATE.WANDER: this.wander(dt, env, anim); break;
      default: this.setState(STATE.IDLE);
    }
    // surface wetness: dries in the sun, wets in the burrow / under water / while feeding (respiratory water)
    const wetTarget = env.submerged || !this.onSurface ? 1 : this.state === STATE.FEED ? 0.55 : 0.32;
    this.wet += (wetTarget - this.wet) * Math.min(1, dt * (wetTarget > this.wet ? 0.8 : 0.02 * (0.5 + env.light)));
    this.mouthWet += ((this.state === STATE.FEED ? 1 : 0.4) - this.mouthWet) * Math.min(1, dt * 0.5);
    this.tipSand += ((this.state === STATE.FEED ? 1 : 0.15) - this.tipSand) * Math.min(1, dt * 0.15);
    this.debug = `${this.state}${this.sub ? '.' + this.sub : ''} h${this.hunger.toFixed(2)} f${this.fear.toFixed(2)} a${this.activity.toFixed(2)}${this.sex === 'm' ? ` c${this.courtshipDrive.toFixed(2)}` : ''}`;
  }

  updateDrives(dt, env, anim) {
    const active = this.onSurface ? 1 : 0;
    // hunger grows with time and work; feeding pays it back per scoop
    this.hunger = clamp(this.hunger + dt * (0.0025 + 0.002 * active) * (0.5 + env.season.activity), 0, 1);
    // fear: the strongest current threat, decaying with the crab's boldness
    const lvl = this.threat ? this.threat.level : 0;
    this.fear = Math.max(lvl, this.fear - dt * 0.035 * this.p.boldness);
    // readiness to be on the surface: exposed, settled for a while, daylight, the season, the tide not coming
    const settle = smoothstep(60 * this.p.emergeDelay, 600 * this.p.emergeDelay, env.sinceExposed);
    const tideOk = env.exposed && !env.floodSoon ? 1 : 0;
    this.activity = tideOk * settle * lerp(0.25, 1, env.light) * env.season.activity * (this.ovigerous ? 0.1 : 1);
    // courtship builds in the breeding season in burrow-holding males, discharged by waving; pairing ends it
    if (this.sex === 'm' && this.resident && !this.paired) {
      const size = smoothstep(6, 10, this.cw_mm);
      this.courtshipDrive = clamp(this.courtshipDrive + dt * 0.012 * env.season.breeding * (0.5 + size) * this.p.waveVigor * (env.neighborWaving ? 1.6 : 1), 0, 1);
    } else this.courtshipDrive = Math.max(0, this.courtshipDrive - dt * 0.01);
    // attachment to the burrow: strong while near it, eroding on long trips
    if (this.resident) {
      const far = env.burrow ? anim.pos.distanceTo(env.burrow.e) / this.cw : 0;
      this.burrowAttachment = clamp(this.burrowAttachment + dt * (far < 4 ? 0.01 : -0.002), 0.3, 1);
    }
    this.threat = env.threat;
    if (this.threat) this.lastThreatPos.copy(this.threat.pos);
  }

  /** above this threat level the crab bolts for its burrow — earlier when farther from it (fiddler crabs) [R] */
  retreatAt(env, anim) {
    if (!env.burrow) return 0.75;
    const far = anim.pos.distanceTo(env.burrow.e) / this.cw;
    return clamp(0.68 - far * 0.012, 0.42, 0.68) * (0.85 + 0.15 * this.p.boldness);
  }

  setState(s, sub = 0) {
    this.state = s;
    this.sub = sub;
    this.timer = 0;
  }

  // ======================================================================================== in the burrow

  inBurrow(dt, env, anim) {
    const cmd = anim.cmd;
    this.restInBurrow(cmd, env, dt);
    // high water: plug the entrance from inside (an air pocket keeps the crab) [R]
    if (!env.exposed && !this.plugged && this.d > 1.2) { this.plugged = true; this.emit('plug'); }
    if (env.exposed && this.activity > 0.25 && this.fear < 0.15 && this.rand() < dt * 0.06 * this.activity * (0.6 + this.hunger)) {
      this.setState(STATE.EMERGING, this.plugged ? 0 : 1);
      this.unplugLeft = this.plugged ? Math.ceil(rrange(this.rand, 1, 3)) : 0;
      this.timer = rrange(this.rand, 1.5, 4);
    }
  }

  restInBurrow(cmd, env, dt) {
    this.d += (2.1 - this.d) * Math.min(1, dt * 0.5);
    cmd.burrow = this.burrowCmd(env, this.d, 0, 1);
    cmd.eyeFold = 1;
    cmd.chelaRest = 'tuck';
    cmd.mouth = 0;
  }

  burrowCmd(env, d, roll, headUp) {
    const b = env.burrow;
    if (!b) return null;
    const c = this._bcmd ??= { e: new Vector3(), axis: new Vector3(), r: 0, d: 0, roll: 0, headUp: 1 };
    c.e.copy(b.e); c.axis.copy(b.axis); c.r = b.r; c.d = d;
    // how it lies in the shaft (rolled onto a side, head up) changes over a moment, never at once
    const k = 1 - Math.exp(-7 * (this.dtLast || 1 / 60));
    c.roll += (roll - c.roll) * k;
    c.headUp += (headUp - c.headUp) * k;
    return c;
  }

  hide(dt, env, anim) {
    const cmd = anim.cmd;
    this.restInBurrow(cmd, env, dt);
    this.hideFor -= dt * (env.observedCalm ? 1.3 : 1);
    if (this.hideFor <= 0 && env.exposed && this.fear < 0.2) this.setState(STATE.EMERGING, 1), this.timer = rrange(this.rand, 0.5, 2);
    if (!env.exposed && !this.plugged) { this.plugged = true; this.emit('plug'); }
  }

  /**
   * Coming out: open the plug (wet sand pushed out as lumps), rise until the eyestalks clear the rim, look around
   * for a while, come up to the rim, climb out. Any scare sends it straight back down.
   */
  emerging(dt, env, anim) {
    const cmd = anim.cmd;
    cmd.chelaRest = 'tuck';
    cmd.mouth = 0;
    if (this.fear > 0.3 || !env.exposed) { this.setState(STATE.HIDE); this.hideFor = rrange(this.rand, 15, 60) / this.p.boldness; return; }
    if (this.sub === 0) {
      // unplugging: work up to just under the mouth and shove sand out
      this.d += (0.5 - this.d) * Math.min(1, dt * 1.2);
      cmd.burrow = this.burrowCmd(env, this.d, 0, 1);
      cmd.eyeFold = 0.8;
      if (this.timer <= 0 && this.d < 0.7) {
        if (this.unplugLeft > 0) {
          this.unplugLeft--;
          this.emit('dig');
          env.onExcavate?.(1);
          this.timer = rrange(this.rand, 1.2, 2.6);
        } else {
          this.plugged = false;
          this.sub = 1;
          this.timer = rrange(this.rand, 0.8, 2);
        }
      }
    } else if (this.sub === 1) {
      // rise: the eyestalks come up first (head / eye emergence)
      this.d += (0.1 - this.d) * Math.min(1, dt * 1.1);
      cmd.burrow = this.burrowCmd(env, this.d, 0, 1);
      cmd.eyeFold = Math.max(0, cmd.eyeFold - dt * 1.5);
      cmd.scan = 1; cmd.alert = 0.8;
      if (this.d < 0.16 && this.timer <= 0) {
        this.sub = 2;
        this.timer = rrange(this.rand, 2, 9) / this.p.boldness;
        this.emit('peek');
      }
    } else if (this.sub === 2) {
      // peek: only the eyestalks above the rim; scan
      this.d = 0.1 + Math.sin(this.t * 0.7) * 0.012;
      cmd.burrow = this.burrowCmd(env, this.d, 0, 1);
      cmd.eyeFold = 0;
      cmd.scan = 1; cmd.alert = 0.7;
      cmd.look = this.fear > 0.05 ? this.lastThreatPos : null;
      if (this.timer <= 0) { this.sub = 3; this.timer = 0; }
    } else if (this.sub === 3) {
      // up to the rim and out: the shaft hands over to the gait
      this.d -= dt * (this.d > -0.1 ? 0.35 : 0.9);
      cmd.burrow = this.burrowCmd(env, this.d, 0, 1);
      cmd.eyeFold = 0;
      if (this.d <= -0.6) {
        cmd.burrow = null;
        this.d = 0;
        anim.settleFromBurrow();
        this.emit('emerge');
        this.sinceSurface = 0;
        this.setState(STATE.IDLE);
        this.idleFor = rrange(this.rand, 1, 4);
        // after a while closed, the burrow often needs clearing first
        if (this.rand() < 0.35) { this.setState(STATE.DIG); this.digLeft = Math.ceil(rrange(this.rand, 1, 3)); }
      }
    }
  }

  // ======================================================================================== on the surface

  idle(dt, env, anim) {
    const cmd = anim.cmd;
    this.surfacePosture(cmd, 'calm');
    cmd.vel.set(0, 0, 0);
    cmd.scan = 0.6;
    cmd.look = null;
    this.idleFor -= dt;
    if (this.idleFor > 0) return;
    // the tide is coming or the sun has gone: home
    if (!this.activityOk(env)) { this.goHome(env, anim, false); return; }
    // a neighbour close by catches the eye
    const nb = env.nearest;
    if (nb && nb.dist < 6 * this.cw && this.rand() < this.p.curiosity) {
      if (this.resident && nb.wandering && env.burrow && nb.pos.distanceTo(env.burrow.e) < 4 * this.cw && nb.cw_mm <= this.cw_mm * 1.15) { this.startDefend(nb); return; }
      this.investigate = nb.pos.clone(); this.setState(STATE.INVESTIGATE); this.timer = rrange(this.rand, 1.5, 4); return;
    }
    // a male with a burrow in the breeding season advertises
    if (this.sex === 'm' && this.resident && !this.paired && env.burrow && this.courtshipDrive > 0.55 && env.season.breeding > 0.2 && this.hunger < 0.85) {
      if (anim.pos.distanceTo(env.burrow.e) < 2.5 * this.cw) { this.setState(STATE.WAVE); this.waveBout = Math.round(rrange(this.rand, 3, 9)); this.waveGap = 0; this.waveSeen = false; return; }
      this.goHome(env, anim, true); return;
    }
    if (env.burrow && this.rand() < 0.04) { this.setState(STATE.DIG); this.digLeft = Math.ceil(rrange(this.rand, 1, 2)); return; }
    if (this.hunger > 0.25 || this.rand() < 0.6) { this.startTrip(env, anim); return; }
    this.idleFor = rrange(this.rand, 2, 6);
  }

  activityOk(env) {
    return env.exposed && !env.floodSoon && this.activity > 0.12;
  }

  surfacePosture(cmd, kind) {
    cmd.burrow = null;
    cmd.height = STANCE.bodyHeight[kind] ?? STANCE.bodyHeight.calm;
    cmd.pitch = kind === 'feed' ? 0.14 : 0;
    cmd.roll = 0;
    cmd.spread = 1;
    cmd.tiptoe = 0;
    cmd.eyeFold = 0;
    cmd.chelaRest = kind === 'alert' ? 'guard' : 'fold';
    cmd.mouth = kind === 'feed' ? 0.6 : 0.08;
    cmd.freeze = false;
    cmd.alert = kind === 'alert' ? 1 : 0.1;
    cmd.maxSpeed = 0.04;
    cmd.turnRate = 3;
  }

  /** a feeding trip: out along a radius from the burrow, each trip turned a little further the same way */
  startTrip(env, anim) {
    if (env.burrow) {
      this.tripAngle += this.p.turn * this.p.turnStep * (0.6 + 0.8 * this.rand());
      this.feedDir.set(Math.sin(this.tripAngle), 0, Math.cos(this.tripAngle));
      this.tripStart.copy(env.burrow.e);
    } else {
      this.feedDir.set(Math.sin(anim.heading), 0, Math.cos(anim.heading));
      this.tripStart.copy(anim.pos);
    }
    this.tripOut = 0;
    this.setState(STATE.FEED, 0);
    this.timer = rrange(this.rand, 0.4, 1.4);
    this.emit('feed');
  }

  /**
   * Feeding: scan the sand → scoop (the chelae alternate; some crabs use both together) → the mouthparts work →
   * the pellet is pinched off and dropped → a short step outward → again. The trip ends when it is long enough,
   * the crab is full, or something calls it home; it then walks back to the burrow.
   */
  feed(dt, env, anim) {
    const cmd = anim.cmd;
    this.surfacePosture(cmd, 'feed');
    cmd.scan = 0.25;
    cmd.turnRate = 1.6;          // a feeding crab shuffles round, it does not spin
    // face the way the trip goes (a little wander)
    const yaw = Math.atan2(this.feedDir.x, this.feedDir.z) + Math.sin(this.t * 0.3 + this.p.turn) * 0.25;
    cmd.yaw = yaw;
    cmd.vel.set(0, 0, 0);
    if (!this.activityOk(env)) { this.goHome(env, anim, false); return; }
    // look at the sand being worked
    _v.copy(anim.pos).addScaledVector(this.feedDir, this.cw * 0.6);
    cmd.look = _v;
    const sub = this.sub;
    if (sub === 0) {
      // surface scan: a pause, perhaps a touch of the sand
      if (this.timer <= 0) {
        if (this.rand() < 0.3) {
          const side = this.rand() < 0.5 ? 0 : 1;
          anim.play(side, 'probe', this.scoopPoint(anim, side, _v2));
        }
        this.sub = 1;
        this.scoops = 0;
      }
    } else if (sub === 1) {
      // sediment pickup: alternate the chelae
      const sp = this.p.feedSpeed;
      for (let s = 0; s < 2; s++) {
        if (anim.chelaBusy(s)) continue;
        if (this.p.synchronous ? anim.chelaBusy(1 - s) : (this.lastScoopSide === s && !anim.chelaBusy(1 - s) && this.scoops > 0)) continue;
        if (this.scoops >= this.scoopsPerPellet) break;
        if (this.scoopGap > 0) continue;
        anim.play(s, 'scoop', this.scoopPoint(anim, s, _v2));
        this.lastScoopSide = s;
        this.scoops++;
        this.scoopGap = rrange(this.rand, 0.12, 0.35) / sp;
      }
      this.scoopGap = (this.scoopGap ?? 0) - dt;
      cmd.mouth = 0.9;
      if (this.scoops >= this.scoopsPerPellet && !anim.chelaBusy(0) && !anim.chelaBusy(1)) {
        this.sub = 2;
        this.timer = rrange(this.rand, 0.4, 1.2) / sp;
      }
    } else if (sub === 2) {
      // mouthpart processing: the third maxillipeds flutter, the pellet firms up
      cmd.mouth = 1;
      if (this.timer <= 0) {
        this.sub = 3;
        // pinch it off with the chela on the outer side of the trip and drop it beside/behind the leading legs
        const side = this.rand() < 0.5 ? 0 : 1;
        const sgn = side === 0 ? 1 : -1;
        const right = _v3.set(Math.cos(anim.heading), 0, -Math.sin(anim.heading));    // body +X in the world
        const drop = _v2.copy(anim.pos).addScaledVector(right, sgn * this.cw * rrange(this.rand, 0.35, 0.6)).addScaledVector(this.feedDir, this.cw * rrange(this.rand, -0.15, 0.25));
        drop.y = env.probe.heightAt(drop.x, drop.z);
        anim.play(side, 'discard', drop);
      }
    } else if (sub === 3) {
      cmd.mouth = 0.4;
      if (!anim.chelaBusy(0) && !anim.chelaBusy(1)) {
        this.sub = 4;
        this.stepLeft = this.cw * rrange(this.rand, 0.12, 0.3);
        this.emit('pellet');
      }
    } else if (sub === 4) {
      // a short step outward
      const v = this.cw * 1.4;
      cmd.vel.copy(this.feedDir).multiplyScalar(v);
      cmd.maxSpeed = v;
      this.stepLeft -= v * dt;
      this.tripOut += (v * dt) / this.cw;
      if (this.stepLeft <= 0) {
        cmd.vel.set(0, 0, 0);
        const done = this.tripOut > this.p.excursion || this.hunger < 0.08 || (this.resident && this.burrowAttachment > 0.9 && this.tripOut > this.p.excursion * 0.7 && this.rand() < 0.2);
        if (done && this.resident && env.burrow) { this.goHome(env, anim, false, true); return; }
        if (done) { this.setState(STATE.IDLE); this.idleFor = rrange(this.rand, 1, 4); return; }
        this.sub = this.rand() < 0.25 ? 0 : 1;
        this.timer = rrange(this.rand, 0.2, 0.9);
        this.scoops = 0;
      }
    }
  }

  /** a point on the sand ahead of the mouth, on that cheliped's side, for a scoop (world) */
  scoopPoint(anim, side, out) {
    const sgn = side === 0 ? 1 : -1;
    const fwd = _v3.set(Math.sin(anim.heading), 0, Math.cos(anim.heading));
    const right = { x: Math.cos(anim.heading), z: -Math.sin(anim.heading) };
    const ahead = rrange(this.rand, 0.55, 0.78), lateral = sgn * rrange(this.rand, 0.05, 0.2);
    out.set(anim.pos.x + fwd.x * ahead * this.cw + right.x * lateral * this.cw, 0, anim.pos.z + fwd.z * ahead * this.cw + right.z * lateral * this.cw);
    out.y = this._probe ? this._probe.heightAt(out.x, out.z) : anim.pos.y;
    return out;
  }

  /** consume a scoop deposited at the mouth (from the animator's event) */
  onDeposit(anim) {
    this.hunger = Math.max(0, this.hunger - 0.012);
    this.pellet = Math.min(1, this.pellet + 1 / this.scoopsPerPellet);
    anim.model.setMouthPellet(this.pellet);
  }

  onPinch() {
    this.pellet = 0;
  }

  goHome(env, anim, thenWave = false, endOfTrip = false) {
    if (!env.burrow) { this.setState(STATE.IDLE); this.idleFor = 2; return; }
    this.goal = env.burrow.e.clone();
    this.afterWalk = thenWave ? 'wave' : endOfTrip ? 'idleHome' : 'enter';
    this.setState(STATE.WALK);
    this.walkSpeed = endOfTrip ? 3.2 : 2.4;
  }

  /** walking to a goal: sideways, the way crabs prefer, turning the body so the goal lies to one side */
  walk(dt, env, anim) {
    const cmd = anim.cmd;
    this.surfacePosture(cmd, 'calm');
    if (!this.goal) { this.setState(STATE.IDLE); return; }
    _v.subVectors(this.goal, anim.pos); _v.y = 0;
    const dist = _v.length();
    const arrive = this.afterWalk === 'enter' ? 0.25 * this.cw : 0.5 * this.cw;
    if (dist < arrive) {
      cmd.vel.set(0, 0, 0);
      const next = this.afterWalk;
      this.goal = null;
      if (next === 'enter') { this.startEnter(env, anim, false); return; }
      if (next === 'wave') { this.setState(STATE.WAVE); this.waveBout = Math.round(rrange(this.rand, 3, 9)); this.waveGap = 0.5; this.waveSeen = false; return; }
      this.setState(STATE.IDLE); this.idleFor = rrange(this.rand, 0.8, 3);
      if (!this.activityOk(env)) this.startEnter(env, anim, false);
      return;
    }
    this.moveSideways(anim, _v.normalize(), Math.min(this.cw * (this.walkSpeed ?? 2.5), dist * 4));
    cmd.look = this.goal;
  }

  /** move along dir at speed v with the body turned so the motion is lateral (whichever side needs less turning) */
  moveSideways(anim, dir, v, sideBias = 0) {
    const cmd = anim.cmd;
    const a = Math.atan2(dir.x, dir.z);
    const y1 = a + Math.PI / 2, y2 = a - Math.PI / 2;
    const e1 = Math.abs(wrapAngle(y1 - anim.heading)), e2 = Math.abs(wrapAngle(y2 - anim.heading));
    cmd.yaw = (e1 + sideBias < e2 ? y1 : y2);
    // a crab can go a little obliquely while it turns
    cmd.vel.copy(dir).multiplyScalar(v);
    cmd.maxSpeed = v;
  }

  investigateTick(dt, env, anim) {
    const cmd = anim.cmd;
    this.surfacePosture(cmd, 'alert');
    cmd.vel.set(0, 0, 0);
    if (this.investigate) {
      _v.subVectors(this.investigate, anim.pos);
      cmd.yaw = Math.atan2(_v.x, _v.z);
      cmd.look = this.investigate;
      cmd.look2 = this.investigate;
    }
    cmd.scan = 0.3;
    if (this.timer <= 0) { this.investigate = null; cmd.look2 = null; this.setState(STATE.IDLE); this.idleFor = rrange(this.rand, 0.5, 2); }
  }

  startDefend(nb) {
    this.defendTarget = nb;
    this.setState(STATE.DEFEND);
    this.timer = rrange(this.rand, 1.5, 3.5);
    this.emit('fight');
    nb.onRepel?.(this);
  }

  /** a resident meets an intruder at its burrow: face it, chelae up, a lunge or two */
  defend(dt, env, anim) {
    const cmd = anim.cmd;
    this.surfacePosture(cmd, 'alert');
    cmd.chelaRest = 'guard';
    cmd.spread = 1.06;
    cmd.tiptoe = 1;
    const nb = this.defendTarget;
    if (nb) {
      _v.subVectors(nb.pos, anim.pos); _v.y = 0;
      cmd.yaw = Math.atan2(_v.x, _v.z);
      cmd.look = nb.pos; cmd.look2 = nb.pos;
      const lunge = Math.sin(this.t * 6) > 0.6 ? 1 : 0;
      cmd.vel.copy(_v.normalize()).multiplyScalar(this.cw * 1.2 * lunge);
      cmd.maxSpeed = this.cw * 1.5;
    }
    if (this.timer <= 0) { this.defendTarget = null; cmd.look2 = null; this.setState(STATE.IDLE); this.idleFor = 1; }
  }

  /**
   * Waving (male, breeding season, at his burrow): bouts of vertical waves — raised on the legs, both chelae up,
   * then swept forward and down — with irregular gaps; a female or a waving neighbour nearby speeds it up.
   */
  wave(dt, env, anim) {
    const cmd = anim.cmd;
    this.surfacePosture(cmd, 'alert');
    cmd.vel.set(0, 0, 0);
    cmd.alert = 0.4;
    // face the nearest neighbour (females especially) if there is one
    const nb = env.nearestFemale ?? env.nearest;
    if (nb && nb.dist < 25 * this.cw) { _v.subVectors(nb.pos, anim.pos); cmd.yaw = Math.atan2(_v.x, _v.z); cmd.look = nb.pos; }
    const busy = anim.chelaBusy(0) || anim.chelaBusy(1);
    // stretch up on the legs while the chelae are up: the feet stay where they are, the legs straighten under
    // the body (as far as the planted legs allow) and the dactyli stand on their tips
    cmd.tiptoe = busy ? 1 : 0.3;
    cmd.height = busy ? STANCE.bodyHeight.alert * 1.12 : STANCE.bodyHeight.alert;
    if (!busy) {
      this.waveGap -= dt;
      if (this.waveGap <= 0) {
        if (this.waveBout <= 0 || !this.activityOk(env) || this.hunger > 0.95) {
          this.courtshipDrive = Math.max(0, this.courtshipDrive - 0.35);
          this.setState(STATE.IDLE); this.idleFor = rrange(this.rand, 2, 6);
          return;
        }
        anim.play(0, 'wave');
        anim.play(1, 'wave');
        // one 図鑑 event per bout, on its first wave
        if (!this.waveSeen) { this.waveSeen = true; this.emit('wave'); }
        this.waveBout--;
        const excite = (nb && nb.female && nb.dist < 15 * this.cw ? 0.55 : 1) * (env.neighborWaving ? 0.8 : 1);
        this.waveGap = rrange(this.rand, 0.25, 1.4) * excite / this.p.waveVigor;
      }
    }
  }

  /** burrow upkeep: go in head first, come back up with a lump of wet sand and drop it by the mouth */
  dig(dt, env, anim) {
    const cmd = anim.cmd;
    if (!env.burrow) { this.setState(STATE.IDLE); return; }
    if (this.sub === 0) {
      // walk to the mouth
      this.surfacePosture(cmd, 'calm');
      _v.subVectors(env.burrow.e, anim.pos); _v.y = 0;
      if (_v.length() > 0.3 * this.cw) { this.moveSideways(anim, _v.normalize(), this.cw * 2); return; }
      cmd.vel.set(0, 0, 0);
      this.sub = 1; this.d = -0.6; this.timer = 0;
    } else if (this.sub === 1) {
      // down in
      this.d = Math.min(1.1, this.d + dt * 1.6);
      cmd.burrow = this.burrowCmd(env, this.d, 0, 1);
      cmd.eyeFold = 0.6;
      cmd.chelaRest = 'tuck';
      if (this.d >= 1.1) { this.sub = 2; this.timer = rrange(this.rand, 0.8, 2.5); }
    } else if (this.sub === 2) {
      cmd.burrow = this.burrowCmd(env, this.d, 0, 1);
      if (this.timer <= 0) { this.sub = 3; }
    } else if (this.sub === 3) {
      // up with the load
      this.d = Math.max(-0.6, this.d - dt * 1.4);
      cmd.burrow = this.burrowCmd(env, this.d, 0, 1);
      cmd.eyeFold = 0;
      if (this.d <= -0.6) {
        cmd.burrow = null;
        anim.settleFromBurrow();
        this.sub = 4;
        const side = this.rand() < 0.5 ? 0 : 1;
        const a = rrange(this.rand, 0, Math.PI * 2);
        const drop = _v2.set(env.burrow.e.x + Math.sin(a) * this.cw * rrange(this.rand, 0.7, 1.1), 0, env.burrow.e.z + Math.cos(a) * this.cw * rrange(this.rand, 0.7, 1.1));
        drop.y = env.probe.heightAt(drop.x, drop.z);
        anim.play(side, 'dig', drop);
        this.emit('dig');
      }
    } else if (this.sub === 4) {
      this.surfacePosture(cmd, 'calm');
      cmd.vel.set(0, 0, 0);
      if (!anim.chelaBusy(0) && !anim.chelaBusy(1)) {
        this.digLeft--;
        if (this.digLeft > 0) { this.sub = 1; this.d = -0.6; }
        else { this.setState(STATE.IDLE); this.idleFor = rrange(this.rand, 1, 3); }
      }
    }
  }

  // ======================================================================================== threat responses

  /** alert pause → orientation: freeze, raise up, both eyestalks on the threat; then decide */
  startAlert(env, anim, lvl) {
    this.prevState = this.state === STATE.ALERT ? this.prevState : this.state;
    this.setState(STATE.ALERT);
    this.timer = rrange(this.rand, 0.3, 1.2) + lvl * 1.5;
    this.alertLevel = lvl;
    this.emit('freeze');
  }

  alert(dt, env, anim) {
    const cmd = anim.cmd;
    this.surfacePosture(cmd, 'alert');
    cmd.vel.set(0, 0, 0);
    cmd.freeze = this.timer > 0.2;
    if (this.threat) { cmd.look = this.threat.pos; cmd.look2 = this.threat.pos; }
    const lvl = this.threat ? this.threat.level : 0;
    // small residents far from home sometimes simply sit tight (camouflage) [L]
    if (this.timer > 0) return;
    cmd.look2 = null;
    if (lvl > 0.42 && env.burrow) {
      // back off: to the mouth of the burrow, then watch from there
      const far = anim.pos.distanceTo(env.burrow.e) / this.cw;
      if (far > 0.8) { this.goal = env.burrow.e.clone(); this.afterWalk = 'idleHome'; this.walkSpeed = 4.5; this.setState(STATE.WALK); return; }
      this.timer = rrange(this.rand, 0.5, 1.5);
      return;
    }
    if (lvl > 0.18) { this.timer = rrange(this.rand, 0.4, 1.0); return; }
    this.fearCooldown = 1.5;
    const back = this.prevState && this.prevState !== STATE.ALERT && this.prevState !== STATE.RETREAT ? this.prevState : STATE.IDLE;
    this.setState(back === STATE.FEED ? STATE.FEED : STATE.IDLE, back === STATE.FEED ? 0 : 0);
    this.idleFor = rrange(this.rand, 0.3, 1.5);
  }

  startRetreat(env, anim) {
    if (!env.burrow) {
      // no burrow: run away from the threat and dig in where it stops
      this.setState(STATE.RETREAT, 5);
      this.timer = rrange(this.rand, 0.6, 1.4);
      this.emit('retreat');
      return;
    }
    this.setState(STATE.RETREAT, 0);
    this.emit('retreat');
  }

  /** rapid retreat: a sideways sprint to the mouth, then in sideways (leading legs first, the body rolling down) */
  retreat(dt, env, anim) {
    const cmd = anim.cmd;
    if (this.sub === 0) {
      this.surfacePosture(cmd, 'alert');
      cmd.chelaRest = 'tuck';
      cmd.scan = 0; cmd.alert = 1;
      _v.subVectors(env.burrow.e, anim.pos); _v.y = 0;
      const dist = _v.length();
      if (dist < 0.35 * this.cw) { this.startEnter(env, anim, true); return; }
      const v = this.cw * 22 * clamp(dist / this.cw / 2, 0.45, 1);
      this.moveSideways(anim, _v.normalize(), v);
      cmd.turnRate = 12;
      cmd.maxSpeed = this.cw * 22;
    } else if (this.sub === 1 || this.sub === 2) {
      // going in: roll onto the side and slide down
      const k = this.sub === 1 ? 1 : 0.6;
      this.d = Math.min(2.1, this.d + dt * (this.fast ? 4.2 : 1.8) * k);
      this.roll = Math.min(1.25, (this.roll ?? 0) + dt * 6);
      cmd.burrow = this.burrowCmd(env, this.d, this.roll * (this.enterSide ?? 1), 0.35);
      cmd.eyeFold = 1;
      cmd.chelaRest = 'tuck';
      if (this.d > 0.5 && this.sub === 1) this.sub = 2;
      if (this.d >= 2.05) {
        this.roll = 0;
        this.setState(STATE.HIDE);
        this.hideFor = this.fast ? rrange(this.rand, 20, 120) * (1.4 - 0.5 * this.p.boldness) * (0.5 + this.fear) : rrange(this.rand, 5, 25);
        if (!env.exposed) { this.plugged = true; this.emit('plug'); }
      }
    } else if (this.sub === 5) {
      // burrowless: flee straight away from the threat
      this.surfacePosture(cmd, 'alert');
      _v.subVectors(anim.pos, this.threat ? this.threat.pos : this.lastThreatPos); _v.y = 0;
      if (_v.lengthSq() < 1e-8) _v.set(1, 0, 0);
      this.moveSideways(anim, _v.normalize(), this.cw * 20);
      cmd.maxSpeed = this.cw * 20;
      cmd.turnRate = 10;
      if (this.timer <= 0) { this.setState(STATE.WANDER, 1); this.d = -0.5; this.timer = rrange(this.rand, 5, 20); }
    }
  }

  /** start going down the burrow: fast (fleeing, sideways) or calm (end of the day / tide) */
  startEnter(env, anim, fast) {
    if (!env.burrow) { this.setState(STATE.IDLE); return; }
    this.setState(STATE.RETREAT, 1);
    this.fast = fast;
    this.d = -0.5;
    this.roll = 0;
    // which side leads: the side facing the hole
    _v.subVectors(env.burrow.e, anim.pos);
    const right = Math.cos(anim.heading) * _v.x - Math.sin(anim.heading) * _v.z;
    this.enterSide = right >= 0 ? -1 : 1;
    if (!fast) this.emit('enter');
  }

  // ======================================================================================== wanderers

  /**
   * Wandering crabs have no burrow: they feed as they go (large crabs in loose droves on the lower flat [L]),
   * and when pressed run, then dig themselves into the sand.
   */
  wander(dt, env, anim) {
    const cmd = anim.cmd;
    if (this.sub === 1) {
      // dug in: only the eyestalks above the sand
      this.d = Math.min(0.3, this.d + dt * 0.8);
      const c = this._digCmd ??= { e: new Vector3(), axis: new Vector3(0, -1, 0), r: 0, d: 0, roll: 0, headUp: 0 };
      if (this.d < -0.45) c.e.copy(anim.pos);
      c.r = this.cw; c.d = this.d;
      cmd.burrow = c;
      cmd.eyeFold = this.fear > 0.5 ? 1 : 0;
      if (this.timer <= 0 && this.fear < 0.15 && this.activityOk(env)) {
        this.d = 0; cmd.burrow = null;
        anim.settleFromBurrow();
        this.sub = 0;
      }
      return;
    }
    if (!this.activityOk(env)) {
      // the tide: dig in where it stands
      this.sub = 1; this.d = -0.5; this.timer = 120; this.emit('dig');
      return;
    }
    // feed as it goes
    if (this.state === STATE.WANDER && this.timer <= 0) {
      this.startTrip({ ...env, burrow: null }, anim);
      this.p.excursion = rrange(this.rand, 4, 10);
      this.resident = false;
    }
  }
}
