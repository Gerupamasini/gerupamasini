// Goldfish behaviour: drives -> utility selection (softmax + hysteresis +
// minimum dwell) -> state behaviour -> steering blend -> locomotion commands.
// Startle is an interrupt driven by environmental stimuli with a per-fish
// threshold, habituation per stimulus type, refractory period and social
// contagion. Parameters follow docs/RESEARCH_REPORT.md §5 (behaviour).

import * as THREE from 'three';
import { clamp, lerp, smoothstep, wrapAngle, jitterDuration } from '../core/math.js';
import { fbm1 } from '../core/random.js';
import { TANK } from '../world/TankConfig.js';
import { avoidObstacles, separation, shoal } from './Steering.js';

export const STATES = ['rest', 'wander', 'cruise', 'pause', 'forage', 'approachFood', 'surfaceFeed', 'shoal', 'wallFollow', 'startle', 'freeze'];

const MIN_DWELL = { rest: 15, wander: 8, cruise: 10, pause: 3.5, forage: 4, approachFood: 0.5, surfaceFeed: 1, shoal: 8, wallFollow: 8, startle: 0.4, freeze: 4 };

// the mouth stops this far above the base of the gravel bed (pebble tops
// reach ~4 mm above it)
const HEAD_CLEAR = 0.0055;

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _s = new THREE.Vector3();
const _h = new THREE.Vector3();
const _g = new THREE.Vector3();

export class Brain {
  constructor(fish, school) {
    this.fish = fish;
    this.school = school;
    const P = fish.personality;
    const r = fish.rng;
    this.drives = {
      hunger: r.range(0.25, 0.6),
      fatigue: r.range(0.1, 0.5),
      fear: 0,
      social: r.range(0.2, 0.5),
      curiosity: r.range(0.3, 0.7),
    };
    this.state = 'wander';
    this.stateTime = 0;
    this.stateDur = 20;
    this.started = false; // the first update picks a staggered initial state
    this.nextEval = r.range(0.2, 1.0);
    this.target = new THREE.Vector3();
    this.hasTarget = false;
    this.food = null;
    this.phase = 'go';
    this.phaseTime = 0;
    this.sub = {};
    this.hab = { tap: 0, loom: 0, social: 0 };
    // yawning: spontaneous (one every few minutes per fish), somewhat more
    // frequent at rest and when fatigued, and typically at the transition
    // from rest to activity (arousal change)
    this.yawnTimer = jitterDuration(fish.rng, 140, 0.5);
    this.lastStimulusTime = -1;
    this.pendingContagion = [];
    this.utilities = {};
    this.desired = new THREE.Vector3();
    this.forced = null;
    this.startled = 0; // time since last startle (for neighbours)
    this.startleTime = -99;
    this.activityRhythm = { period: r.range(180, 480), phase: r.range(0, 6.28) };
    this.visits = new Float32Array(8 * 3 * 3).fill(-999);
    this.params = { hungerTime: 360 };
    this._pickWanderTarget(null, true);
  }

  // ------------------------------------------------------------------ perception
  _neighbours(maxDist) {
    const me = this.fish;
    const out = [];
    for (const o of this.school.fish) {
      if (o === me) continue;
      const delta = new THREE.Vector3().subVectors(o.loc.pos, me.loc.pos);
      const dist = delta.length();
      if (dist < maxDist) out.push({ fish: o, delta, dist });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  _visibleFood(world) {
    const me = this.fish;
    const head = me.headPosition(_h);
    const fwd = me.loc.forward;
    let best = null;
    let bestScore = Infinity;
    for (const f of world.food.available) {
      // items where the fish recently gave up (wedged under or behind a rock)
      if (this.giveUp && world.time < this.giveUp.until && f.pos.distanceTo(this.giveUp.pos) < 2 * me.SL) continue;
      const d = _v.subVectors(f.pos, head);
      const dist = d.length();
      // vision: wide field (~300°, blind cone behind); smell: short range for bottom food
      const cos = d.dot(fwd) / Math.max(dist, 1e-5);
      const seen = (dist < 0.55 && cos > -0.55) || (f.state === 'bottom' && dist < 0.16);
      if (!seen) continue;
      // an item another fish is already going for is less attractive (the
      // group spreads over the pellets instead of piling onto one)
      const score = dist * (1.4 - 0.4 * cos) + (f.claimed && f.claimed !== me ? 0.15 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ stimuli
  _processStimuli(world, time, neigh) {
    const me = this.fish;
    const P = me.personality;
    let threat = 0;
    let src = null;
    let type = null;
    for (const s of world.stimuli) {
      if (s.time <= this.lastStimulusTime) continue;
      const d = me.loc.pos.distanceTo(s.pos);
      let t = 0;
      if (s.type === 'tap') t = s.intensity * Math.exp(-d / 0.38);
      else if (s.type === 'loom') {
        const hd = Math.hypot(me.loc.pos.x - s.pos.x, me.loc.pos.z - s.pos.z);
        t = s.intensity * Math.exp(-hd / 0.25) * (me.loc.pos.y > TANK.water * 0.5 ? 1 : 0.6);
      }
      if (t > threat) {
        threat = t;
        src = s.pos;
        type = s.type;
      }
    }
    for (const s of world.stimuli) this.lastStimulusTime = Math.max(this.lastStimulusTime, s.time);
    // social contagion from startled neighbours (delayed ~60–150 ms)
    for (const n of neigh) {
      const b = n.fish.brain;
      if (!b) continue;
      if (time - b.startleTime < 0.02 && n.dist < 3.5 * me.SL) {
        this.pendingContagion.push({ at: time + me.rng.range(0.06, 0.15), from: n.fish.loc.pos.clone(), t: 0.62 * Math.exp(-n.dist / (3 * me.SL)) });
      }
    }
    this.pendingContagion = this.pendingContagion.filter((c) => {
      if (c.at <= time) {
        if (c.t > threat) {
          threat = c.t;
          src = c.from;
          type = 'social';
        }
        return false;
      }
      return true;
    });
    if (!src) return false;
    const resting = this.state === 'rest' || this.state === 'freeze';
    const theta = 0.38 * (1.4 - P.fearfulness) * (1 + this.hab[type]) * (resting ? 1.4 : 1);
    const p = 1 / (1 + Math.exp(-(threat - theta) / 0.07));
    this.hab[type] = Math.min(2.5, this.hab[type] + 0.25 * Math.min(1, threat * 1.5));
    if (me.rng.next() < p && me.loc.refractory <= 0) {
      const away = new THREE.Vector3().subVectors(me.loc.pos, src);
      away.y *= 0.3;
      if (away.lengthSq() < 1e-8) away.set(me.rng.range(-1, 1), 0, me.rng.range(-1, 1));
      away.normalize();
      this.triggerStartle(away, threat, time);
      return true;
    } else if (threat > theta * 0.45) {
      // alarmed but no escape: fear rises, brief pause / flinch
      this.drives.fear = Math.min(1, this.drives.fear + 0.25 * threat);
      // (a resting or freezing fish just stays put)
      if (this.state !== 'approachFood' && this.state !== 'surfaceFeed' && this.state !== 'freeze' && this.state !== 'rest') this._enter('pause', time, 3 + 2.5 * P.fearfulness);
    }
    return false;
  }

  triggerStartle(awayDir, intensity, time) {
    const me = this.fish;
    if (!me.loc.startle(awayDir, clamp(intensity + 0.3, 0.6, 1.2))) return;
    this.drives.fear = 1;
    this.startleTime = time;
    this.fleeDir = awayDir.clone();
    this._enter('startle', time, 0.9 + me.rng.range(0, 1.2));
  }

  // ------------------------------------------------------------------ utility
  _evaluate(time, neigh, foodSeen) {
    const P = this.fish.personality;
    const D = this.drives;
    const act = P.activity * (0.75 + 0.5 * (0.5 + 0.5 * Math.sin((time / this.activityRhythm.period) * 6.28 + this.activityRhythm.phase)));
    const nearForagers = neigh.filter((n) => n.dist < 4 * this.fish.SL && n.fish.brain && n.fish.brain.state === 'forage').length;
    // grazing motivation saturates: a fish that has not been fed for a while
    // still spends most of its time doing other things
    const graze = Math.min(D.hunger, 0.55);
    const U = {
      rest: 0.05 + 0.85 * Math.pow(D.fatigue, 1.5) * (1 - 0.5 * graze) * (1.3 - act * 0.4),
      wander: 0.32 * (0.55 + D.curiosity) * (0.55 + 0.45 * act) * (1 - 0.75 * D.fear),
      cruise: 0.2 * act * (1 - 0.6 * D.fear) * (1 - 0.5 * D.fatigue),
      pause: 0.26,
      forage: graze * 0.85 * (0.65 + 0.2 * Math.min(2, nearForagers)) * (1 - 0.8 * D.fear) * P.feedMotivation,
      // (a fish that has just eaten several pellets is in less of a hurry)
      approachFood: foodSeen ? ((0.5 + D.hunger) * (1.25 - 0.6 * D.fear * P.fearfulness) * P.feedMotivation) / (1 + 0.3 * (this.gorged || 0)) : 0,
      shoal: 0.14 + D.social * P.sociality * 0.75 + 0.45 * D.fear * P.sociality,
      wallFollow: D.fear * P.thigmotaxis * 0.7,
    };
    // after a feeding bout the fish tend to settle (pause, rest) for a while
    const sated = this.postFeed !== undefined ? Math.exp(-(time - this.postFeed) / 25) : 0;
    U.pause += 0.6 * sated;
    U.rest += 0.3 * sated;
    if (foodSeen && foodSeen.state === 'surface') {
      U.surfaceFeed = U.approachFood;
      U.approachFood = 0;
    } else U.surfaceFeed = 0;
    this.utilities = U;
    // hysteresis
    if (U[this.state] !== undefined) U[this.state] += 0.15;
    // softmax selection
    const T = 0.1;
    const keys = Object.keys(U);
    let max = -Infinity;
    for (const k of keys) max = Math.max(max, U[k]);
    const w = keys.map((k) => Math.exp((U[k] - max) / T));
    const idx = this.fish.rng.weighted(w);
    return keys[idx];
  }

  _enter(state, time, dur = null) {
    const r = this.fish.rng;
    const P = this.fish.personality;
    // waking up: leaving rest / a long pause is often marked by a yawn
    if (state !== 'startle' && state !== 'freeze' && ((this.state === 'rest' && this.phase === 'down' && r.next() < 0.15) || (this.state === 'pause' && this.stateTime > 8 && r.next() < 0.12))) {
      this.yawnTimer = Math.min(this.yawnTimer, r.range(0.4, 2.0));
    }
    this.state = state;
    this.stateTime = 0;
    this.phase = 'go';
    this.phaseTime = 0;
    this.sub = {};
    const base = { rest: 45, wander: 35, cruise: 22, pause: 5.5, forage: 12, approachFood: 10, surfaceFeed: 8, shoal: 30, wallFollow: 18, startle: 1.5, freeze: 4 + 2.5 * P.fearfulness };
    this.stateDur = dur ?? jitterDuration(r, base[state] ?? 10, state === 'rest' ? 0.5 : state === 'freeze' ? 0.25 : 0.4);
    if (state === 'rest') this.stateDur = Math.max(15, this.stateDur);
    // freezing after a fright lasts a few seconds, then the fish resumes
    if (state === 'freeze') this.stateDur = clamp(this.stateDur, 3.5, 6.5);
    if (state === 'pause') {
      // a fish that has just fed lingers longer
      if (this.postFeed !== undefined && time - this.postFeed < 30) this.stateDur *= 1.6;
      this.stateDur = Math.max(3.5, this.stateDur);
    }
    if (state === 'wander') this._pickWanderTarget(null, true);
    if (state === 'rest') this.target.copy(this._restSpot());
    if (state === 'shoal') {
      this.sub.drifting = r.next() < 0.5;
      this.sub.driftT = r.range(2, 8);
    }
    if (state === 'cruise') {
      this.sub.dirX = this.fish.loc.forward.x >= 0 ? 1 : -1;
      this.sub.z = r.range(-TANK.D / 2 + 0.07, TANK.D / 2 - 0.06);
      this.sub.y = this._prefY() + r.range(-0.04, 0.04);
    }
    if (state === 'forage') {
      this.sub.pecks = r.int(2, 6);
      this.target.copy(this._forageSpot());
    }
    if (state === 'freeze') this.target.copy(this._coverSpot());
    if (state === 'wallFollow') {
      this.sub.dirX = r.sign();
      const off = r.range(0.045, 0.1);
      this.sub.z = r.next() < 0.5 ? -TANK.D / 2 + off : TANK.D / 2 - off;
      this.sub.yK = r.range(0.7, 1.25);
    }
  }

  _prefY() {
    const P = this.fish.personality;
    const fearDown = this.drives.fear * 0.15;
    const now = this.worldRef ? this.worldRef.time : 0; // simulation time keeps runs reproducible
    return lerp(0.05, TANK.water - 0.04, clamp(P.preferredDepth - fearDown + 0.1 * fbm1(this.fish.id * 3.7 + now * 0.02, 1), 0.04, 0.92));
  }

  /**
   * A resting place on the bottom: the belly just clears the gravel (the
   * ventral profile is ~0.16 SL below the body axis), away from rocks, plants
   * and walls and from other resting fish, not too far away, mildly
   * preferring the sheltered back half of the tank.
   */
  _restSpot() {
    const r = this.fish.rng;
    const me = this.fish;
    const SL = me.SL;
    const world = this.worldRef;
    let best = null;
    let bestS = -Infinity;
    const here = me.loc.pos;
    for (let k = 0; k < 8; k++) {
      // mostly somewhere below / near the fish, sometimes anywhere
      const p = k < 5 ? new THREE.Vector3(clamp(here.x + r.range(-0.2, 0.2), -0.5, 0.5), 0, clamp(here.z + r.range(-0.12, 0.12), -0.16, 0.14)) : new THREE.Vector3(r.range(-0.5, 0.5), 0, r.range(-0.16, 0.14));
      p.y = this._ground(p.x, p.z) + r.range(0.19, 0.23) * SL;
      let s = r.range(0, 0.3) - p.distanceTo(me.loc.pos) * 2.5 - p.z * 0.6;
      if (world) {
        const clear = world.distance(p, _g, { ignoreFloor: true, softPlants: false });
        s -= clear < 0.7 * SL ? 2 : 0;
      }
      for (const o of this.school.fish) {
        if (o === me || !o.brain || o.brain.state !== 'rest') continue;
        if (o.brain.target.distanceTo(p) < 1.6 * SL) s -= 1.5;
      }
      if (s > bestS) {
        bestS = s;
        best = p;
      }
    }
    return best;
  }

  _coverSpot() {
    // low in the tank, near plants/rocks at the back, away from the threat
    const r = this.fish.rng;
    const spots = [new THREE.Vector3(-0.42, 0, -0.1), new THREE.Vector3(0.4, 0, -0.08), new THREE.Vector3(0.06, 0, -0.06), new THREE.Vector3(-0.2, 0, 0.0)];
    let best = spots[0];
    let bestS = -Infinity;
    for (const s of spots) {
      const sc = (this.fleeDir ? s.clone().sub(this.fish.loc.pos).normalize().dot(this.fleeDir) : 0) - s.distanceTo(this.fish.loc.pos) * 0.8 + r.range(0, 0.3);
      if (sc > bestS) {
        bestS = sc;
        best = s;
      }
    }
    // low, close to the cover but with room to hold station beside it
    const SL = this.fish.SL;
    const p = new THREE.Vector3();
    for (let k = 0; k < 8; k++) {
      p.copy(best);
      p.x += r.range(-0.05, 0.05) * (1 + k * 0.4);
      p.z += r.range(-0.04, 0.04) * (1 + k * 0.4);
      p.y = this._ground(p.x, p.z) + r.range(0.25, 0.45) * SL;
      if (this._clearance(p) > 0.6 * SL) break;
    }
    return p;
  }

  _forageSpot() {
    const r = this.fish.rng;
    const me = this.fish.loc.pos;
    let best = null;
    // prefer food lying on the gravel nearby
    if (this.worldRef) {
      for (const f of this.worldRef.food.available) {
        if (f.state === 'bottom' && f.pos.distanceTo(me) < 0.35) {
          best = f.pos.clone();
          break;
        }
      }
    }
    if (!best) {
      // a patch of open gravel nearby (not under or behind a rock)
      for (let k = 0; k < 6; k++) {
        best = new THREE.Vector3(clamp(me.x + r.range(-0.2, 0.2), -0.52, 0.52), 0, clamp(me.z + r.range(-0.12, 0.12), -0.17, 0.17));
        best.y = this._ground(best.x, best.z);
        if (this._clearance(_g.copy(best).setY(best.y + 0.55 * this.fish.SL)) > 0.5 * this.fish.SL) break;
      }
    }
    best.y = this._ground(best.x, best.z);
    return best;
  }

  /** Free space around p (walls, rocks, plants; the floor is ignored). */
  _clearance(p) {
    return this.worldRef ? this.worldRef.distance(p, null, { ignoreFloor: true, softPlants: false }) : 1;
  }

  _ground(x, z) {
    return this.worldRef ? this.worldRef.groundHeight(x, z) : 0.03;
  }

  _pickWanderTarget(world, first = false) {
    const r = this.fish.rng;
    const P = this.fish.personality;
    let best = null;
    let bestS = -Infinity;
    const now = this.worldRef ? this.worldRef.time : 0;
    for (let k = 0; k < 8; k++) {
      const p = new THREE.Vector3(r.range(-0.53, 0.53), 0, r.range(-0.18, 0.18));
      p.y = clamp(this._prefY() + r.normal(0, 0.07), this._ground(p.x, p.z) + 0.04, TANK.water - 0.04);
      // novelty: prefer cells not visited recently
      const cell = this._cell(p);
      const since = now - this.visits[cell];
      let s = Math.min(1, since / 60) * (0.5 + P.curiosity);
      // thigmotaxis: attraction to the glass walls
      const wallD = Math.min(TANK.L / 2 - Math.abs(p.x), TANK.D / 2 - Math.abs(p.z));
      s += P.thigmotaxis * 0.4 * (1 - Math.min(1, wallD / 0.12)) * (0.5 + this.drives.fear);
      // not too close, not too far
      const d = p.distanceTo(this.fish.loc.pos);
      s -= Math.abs(d - 0.35) * 0.8;
      // turn bias (laterality) for targets to one side
      const toP = p.clone().sub(this.fish.loc.pos);
      const side = Math.sign(toP.x * -Math.sin(this.fish.loc.yaw) - toP.z * Math.cos(this.fish.loc.yaw));
      s += side * P.turnBias * 0.15;
      s += r.range(0, 0.25);
      if (this._clearance(p) < 0.5 * this.fish.SL) s -= 2;
      if (s > bestS) {
        bestS = s;
        best = p;
      }
    }
    this.target.copy(best);
    this.hasTarget = true;
    // most wander legs end in a pause; once in a while a leg starts with a
    // purposeful dash (a burst, then a long glide)
    this.sub.pauseAt = r.next() < 0.75;
    this.sub.dashT = !first && r.next() < 0.08 && best.distanceTo(this.fish.loc.pos) > 0.25 ? r.range(0.35, 0.6) : 0;
  }

  _cell(p) {
    const ix = clamp(Math.floor(((p.x + TANK.L / 2) / TANK.L) * 8), 0, 7);
    const iy = clamp(Math.floor((p.y / TANK.water) * 3), 0, 2);
    const iz = clamp(Math.floor(((p.z + TANK.D / 2) / TANK.D) * 3), 0, 2);
    return ix * 9 + iy * 3 + iz;
  }

  // ------------------------------------------------------------------ update
  update(dt, time, world) {
    this.worldRef = world;
    const me = this.fish;
    const L = me.loc;
    const P = me.personality;
    const D = this.drives;
    const SL = me.SL;
    this.stateTime += dt;
    this.phaseTime += dt;
    this.visits[this._cell(L.pos)] = time;
    if (!this.started) {
      // fish do not all start out doing the same thing at the same moment
      this.started = true;
      const r = me.rng;
      const pick = r.weighted([0.45, 0.2, 0.15, 0.1, 0.1]);
      this._enter(['wander', 'pause', 'shoal', 'rest', 'forage'][pick], time);
      if (this.state === 'pause') this.stateDur = r.range(2, 12);
      this.stateTime = r.range(0, 0.6) * this.stateDur;
    }

    const neigh = this._neighbours(8 * SL);
    const foodSeen = this._visibleFood(world);

    // ---- drives
    const U = L.speed / SL;
    D.hunger = clamp(D.hunger + (dt * P.feedMotivation) / this.params.hungerTime, 0, 1);
    // fatigue builds up with activity (faster when swimming fast) and is
    // only really paid off by resting on the bottom: rest bouts recur every
    // few minutes
    const fatigueRate = L.restLevel > 0.5 ? -0.012 : U < 0.12 ? 0.0008 : 0.0022 + 0.004 * Math.max(0, U - 0.3);
    D.fatigue = clamp(D.fatigue + dt * fatigueRate, 0, 1);
    const fearHalf = 45 * (0.5 + P.fearfulness);
    D.fear *= Math.pow(0.5, dt / fearHalf);
    const nn = neigh.length ? neigh[0].dist / SL : 99;
    D.social = clamp(D.social + dt * (nn > 4 ? 1 / 40 : -1 / 20), 0, 1);
    D.curiosity = clamp(D.curiosity + dt * (this.state === 'wander' ? -1 / 90 : 1 / 70), 0, 1);
    for (const k in this.hab) this.hab[k] *= Math.exp(-dt / 90);
    if (this.gorged) this.gorged *= Math.exp(-dt / 60);

    // ---- stimuli (interrupt)
    if (this.state !== 'startle') this._processStimuli(world, time, neigh);

    // ---- yawning
    {
      const calm = this.state === 'rest' || this.state === 'pause';
      const busy = this.state === 'startle' || this.state === 'freeze' || this.state === 'approachFood' || this.state === 'surfaceFeed' || L.cstart || L.gait === 'burst';
      this.yawnTimer -= dt * (calm ? 1.1 : 1) * (1 + 0.8 * D.fatigue) * (D.fear > 0.5 ? 0.75 : 1);
      if (this.yawnTimer <= 0) {
        if (!busy && !L.mouthProgram) {
          L.mouthAction('yawn');
          this.yawnTimer = jitterDuration(me.rng, 300, 0.45);
        } else this.yawnTimer = 3.0;
      }
    }

    // ---- selection
    this.nextEval -= dt;
    const locked = this.state === 'startle' || (this.state === 'freeze' && this.stateTime < this.stateDur);
    if (this.forced && this.forced !== this.state && this.state !== 'startle') {
      if (this.forced === 'startle') {
        const away = new THREE.Vector3(me.rng.range(-1, 1), 0, me.rng.range(-1, 1)).normalize();
        this.triggerStartle(away, 0.9, time);
      } else this._enter(this.forced, time);
    } else if (!this.forced && !locked && (this.nextEval <= 0 || this.stateTime > this.stateDur)) {
      this.nextEval = me.rng.range(0.5, 1.1);
      // a rest or a pause is sat out (unless food or a threat interrupts it)
      const committed = this.state === 'rest' || this.state === 'pause';
      const minOk = this.stateTime > (committed ? Math.max(this.stateDur, MIN_DWELL[this.state]) : MIN_DWELL[this.state] ?? 2);
      const urgentFood = foodSeen && this.state !== 'approachFood' && this.state !== 'surfaceFeed' && D.fear < 0.6;
      if (minOk || urgentFood || this.stateTime > this.stateDur) {
        const next = this._evaluate(time, neigh, foodSeen);
        if (next !== this.state || this.stateTime > this.stateDur) this._enter(next, time);
      }
    }

    // a fish counts as standing still when it has (almost) no forward speed
    // and its tail is quiet
    const stillNow = U < 0.12 && L.amp < 0.02;
    if (stillNow) {
      if (!this.stillT) this.holdMin = me.rng.range(2.6, 3.8);
      this.stillT = (this.stillT || 0) + dt;
    } else this.stillT = 0;

    // ---- behaviour
    const cmd = L.cmd;
    cmd.brake = false;
    cmd.urgency = 0;
    cmd.pitchBias = 0;
    cmd.lookAt = null;
    cmd.hoverPrecision = 0;
    cmd.rest = 0;
    cmd.steady = false;
    cmd.pitchLimit = 0.62;
    cmd.finsClamped = clamp(D.fear * 0.6 * P.fearfulness, 0, 0.7);
    const des = this.desired.set(0, 0, 0);
    let speedCap = 6 * SL;
    let avoidOpts = {};
    let sepW = 1;
    let face = null; // preferred heading while hovering (null: keep the current one)
    const act = P.activity;

    switch (this.state) {
      case 'rest': {
        // settle on the bottom: swim to a point above the spot, sink onto it
        // with the pectorals, then lie still with the fins folded
        avoidOpts = { ignoreFloor: true };
        sepW = 0.5;
        const tgt = this.target;
        if (this.phase === 'go') {
          const to = _v.copy(tgt).setY(tgt.y + 0.45 * SL).sub(L.pos);
          const d = to.length();
          des.copy(to).normalize().multiplyScalar(Math.min(0.6 * SL, d * 1.2));
          // close enough: the pectorals do the rest
          if (d < 0.8 * SL || this.phaseTime > 20) {
            if (d >= 0.8 * SL) tgt.set(L.pos.x, this._ground(L.pos.x, L.pos.z) + 0.21 * SL, L.pos.z);
            this.phase = 'sink';
            this.phaseTime = 0;
          }
        } else if (this.phase === 'sink') {
          const to = _v.subVectors(tgt, L.pos);
          const d = to.length();
          des.copy(to).multiplyScalar(1.4).clampLength(0, 0.19 * SL);
          cmd.pitchBias = -0.06;
          cmd.rest = 0.5 * smoothstep(0.6 * SL, 0.1 * SL, d);
          if (d < 0.06 * SL || this.phaseTime > 10) {
            this.phase = 'down';
            this.phaseTime = 0;
            this.sub.lookT = me.rng.range(12, 35);
            // the rest itself starts now
            this.stateTime = 0;
            this.stateDur = Math.max(12, jitterDuration(me.rng, 26, 0.5));
          }
        } else {
          // lying on the bottom; now and then a slow re-orientation
          cmd.rest = 1;
          des.subVectors(tgt, L.pos).multiplyScalar(0.8).clampLength(0, 0.05 * SL);
          if (this.phaseTime > this.sub.lookT) {
            const yaw = L.yaw + me.rng.range(-0.8, 0.8);
            this.sub.face = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
            this.sub.lookT = me.rng.range(12, 35);
            this.phaseTime = 0;
          }
          if (this.sub.face) face = this.sub.face;
        }
        break;
      }
      case 'wander': {
        const to = _v.subVectors(this.target, L.pos);
        const d = to.length();
        const spd = (0.3 + 0.45 * D.curiosity) * act * SL;
        if (this.phase === 'go') {
          // a leg that ends in a pause slows down toward its end; otherwise
          // the fish swims on through the waypoint
          let v = spd * (this.sub.pauseAt ? smoothstep(0, 0.12, d) : 1) + 0.05 * SL;
          if (this.sub.dashT > 0) {
            this.sub.dashT -= dt;
            v = Math.max(v, 3 * SL);
          }
          des.copy(to).normalize().multiplyScalar(v);
          if (d < (this.sub.pauseAt ? 0.06 : 0.09)) {
            if (this.sub.pauseAt) {
              this.phase = 'pause';
              this.phaseTime = 0;
              this.sub.pauseDur = me.rng.range(3.5, 10);
              this.sub.face = null;
              this.sub.lookT = me.rng.range(3, 7);
            } else this._pickWanderTarget(world);
          }
        } else {
          des.set(0, 0, 0);
          cmd.hoverPrecision = 0.4;
          // during a longer pause the fish may slowly turn to look around
          if (this.phaseTime > this.sub.lookT) {
            const yaw = L.yaw + me.rng.range(-0.7, 0.7);
            this.sub.face = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
            this.sub.lookT = this.phaseTime + me.rng.range(3, 7);
          }
          if (this.sub.face) face = this.sub.face;
          if (this.phaseTime > this.sub.pauseDur) {
            this.phase = 'go';
            this._pickWanderTarget(world);
          }
        }
        break;
      }
      case 'cruise': {
        const x = this.sub.dirX * 0.5;
        const tgt = _a.set(x, this.sub.y, this.sub.z);
        const to = _v.subVectors(tgt, L.pos);
        if (Math.abs(L.pos.x - x) < 0.07) {
          this.sub.dirX *= -1;
          this.sub.z = clamp(this.sub.z + me.rng.range(-0.08, 0.08), -0.16, 0.16);
          this.sub.y = clamp(this.sub.y + me.rng.range(-0.05, 0.05), 0.08, TANK.water - 0.05);
        }
        des.copy(to).normalize().multiplyScalar((0.9 + 0.5 * act) * SL * (1 - 0.4 * D.fatigue));
        cmd.steady = true; // patrolling the tank: continuous tail beat
        break;
      }
      case 'pause': {
        des.set(0, 0, 0);
        cmd.hoverPrecision = 0.6;
        if (this.stateTime > this.stateDur) this.nextEval = 0;
        break;
      }
      case 'forage':
        this._forage(dt, time, world, des, cmd);
        avoidOpts = { ignoreFloor: true };
        sepW = 0.6;
        break;
      case 'approachFood':
        this._approachFood(dt, time, world, des, cmd, foodSeen);
        avoidOpts = { ignoreFloor: this.food && this.food.state === 'bottom' };
        sepW = 0.5;
        break;
      case 'surfaceFeed':
        this._surfaceFeed(dt, time, world, des, cmd, foodSeen);
        avoidOpts = { ignoreSurface: true };
        sepW = 0.5;
        break;
      case 'shoal': {
        shoal(me, neigh.slice(0, 7), des, { cohesion: 1, alignment: 0.3, preferred: 2.2 + 1.5 * (1 - D.fear) });
        // stay with the group; drift along slowly for a while, then hold
        // station for a while (each fish on its own schedule)
        if (this.stateTime > this.sub.driftT) {
          this.sub.drifting = !this.sub.drifting;
          this.sub.driftT = this.stateTime + (this.sub.drifting ? me.rng.range(4, 10) : me.rng.range(3, 12));
        }
        if (this.sub.drifting) {
          const wanderDir = _a.set(Math.cos(time * 0.2 + me.id), 0.2 * Math.sin(time * 0.13 + me.id * 2), Math.sin(time * 0.17 + me.id)).normalize();
          des.addScaledVector(wanderDir, 0.35 * SL * act);
        }
        break;
      }
      case 'wallFollow': {
        const tgt = _a.set(this.sub.dirX * 0.5, this._prefY() * this.sub.yK, this.sub.z);
        if (Math.abs(L.pos.x - tgt.x) < 0.08) this.sub.dirX *= -1;
        des.subVectors(tgt, L.pos).normalize().multiplyScalar((0.6 + 0.3 * act) * SL);
        break;
      }
      case 'startle': {
        // after the C-start, flee away from the threat, downward toward cover
        if (!L.cstart) {
          const cover = this.sub.cover || (this.sub.cover = this._coverSpot());
          des.copy(this.fleeDir).multiplyScalar(0.6).add(_a.subVectors(cover, L.pos).normalize()).normalize().multiplyScalar(3.5 * SL);
          cmd.urgency = 1;
          if (this.stateTime > this.stateDur) this._enter('freeze', time);
        } else des.copy(this.fleeDir).multiplyScalar(4 * SL);
        break;
      }
      case 'freeze': {
        // get down beside cover, then hold still with the fins clamped
        avoidOpts = { ignoreFloor: true };
        const to = _v.subVectors(this.target, L.pos);
        const d = to.length();
        if (this.phase === 'go') {
          des.copy(to).normalize().multiplyScalar(Math.min(0.8 * SL, d * 3));
          if (d < 0.8 * SL || this.phaseTime > 3) {
            this.phase = 'hold';
            this.target.copy(L.pos);
            this.sub.held = false;
          }
        } else {
          des.copy(to).clampLength(0, 0.06 * SL);
          // once it has come to a stop in cover the fish holds still for a
          // few seconds
          if (stillNow && !this.sub.held) {
            this.sub.held = true;
            this.stateDur = Math.max(this.stateDur, this.stateTime + me.rng.range(3, 4));
          }
        }
        cmd.finsClamped = 0.85;
        cmd.hoverPrecision = this.phase === 'go' ? 0.8 : 0.2; // frozen: fins held still
        if (this.stateTime > this.stateDur) this.nextEval = 0;
        break;
      }
    }

    // ---- steering blend: avoidance & separation steer, they do not add thrust
    const goalSpeed = Math.min(des.length(), speedCap);
    const goalDir = goalSpeed > 1e-5 ? _v.copy(des).divideScalar(goalSpeed) : _v.copy(L.forward).setY(0).normalize();
    const feeding = this.state === 'forage' || this.state === 'approachFood' || this.state === 'surfaceFeed';
    // once a fish has come to a halt it stays put for a few seconds before it
    // sets off again (no flicker between stopping and swimming); feeding,
    // fright and an obstacle right at the body override this. Hovering vs
    // swimming has some hysteresis for the same reason.
    let hovering = goalSpeed < (this.wasHovering ? 0.28 : 0.2) * SL && this.state !== 'startle';
    this.wasHovering = hovering;
    // (grazing counts as feeding only once the fish works the gravel)
    const exempt = this.state === 'approachFood' || this.state === 'surfaceFeed' || (this.state === 'forage' && this.phase !== 'go') || this.state === 'startle' || (this.state === 'freeze' && this.phase === 'go');
    const holding = !hovering && stillNow && this.stillT < this.holdMin && !exempt;
    if (holding) hovering = true;
    avoidOpts.intent = hovering ? 0 : 1;
    const avoid = avoidObstacles(me, world, _a, avoidOpts);
    const sep = separation(me, neigh.slice(0, 6), _s).multiplyScalar(sepW);
    const sepLen = sep.length();
    const push = avoid.length() + sepLen;
    cmd.hoverVel.set(0, 0, 0);
    // getting out of the way of a wall, once started, lasts a moment (no
    // flickering between holding station and swimming off); a hovering fish
    // crowded by a neighbour shuffles aside with its pectorals instead
    this.escapeT = Math.max(0, (this.escapeT || 0) - dt);
    if (hovering && (avoid.danger >= 0.9 || (sepLen >= 2.5 && !stillNow))) this.escapeT = 0.8;
    const crowded = hovering && sepLen >= 2.5;
    if (hovering && this.escapeT <= 0) {
      // pectoral station keeping: gentle nudges from walls and neighbours
      // move a hovering fish slowly without turning it or engaging the tail
      cmd.hoverVel.copy(avoid).multiplyScalar(0.1 * SL).addScaledVector(sep, (crowded ? 0.12 : 0.08) * SL);
      if (holding) {
        // about to set off: it may already pivot toward its goal on the pectorals
        cmd.speed = 0;
        if (Math.hypot(goalDir.x, goalDir.z) > 0.3) cmd.dir.set(goalDir.x, 0, goalDir.z).normalize();
        else {
          const f = L.forward;
          cmd.dir.set(f.x, 0, f.z).normalize();
        }
      } else if (feeding && !(this.state === 'forage' && Math.abs(des.y) > 2 * Math.hypot(des.x, des.z))) {
        // fine positioning on food: creep along the heading toward it
        cmd.dir.copy(goalDir);
        cmd.speed = goalSpeed / SL;
      } else {
        // the small goal offset is rowed out with the pectorals; the fish
        // keeps (or slowly turns to) its own heading
        cmd.hoverVel.add(des);
        cmd.speed = 0;
        if (face) cmd.dir.copy(face);
        else if (Math.hypot(des.x, des.z) > 0.06 * SL) cmd.dir.set(des.x, 0, des.z).normalize();
        else {
          const f = L.forward;
          cmd.dir.set(f.x, 0, f.z).normalize();
        }
      }
      cmd.hoverVel.clampLength(0, (crowded ? 0.3 : 0.15) * SL);
    } else {
      const steer = _h.copy(goalDir).multiplyScalar(hovering ? 0.3 : 1).add(avoid).add(sep);
      let speed = goalSpeed;
      // slow down when heading into an obstacle; get out of the way when a
      // hovering fish is crowded or about to touch something
      speed *= 1 - 0.55 * avoid.danger;
      if (hovering) speed = Math.max(speed, clamp(push * 0.25, 0.25, 0.5) * SL);
      if (steer.lengthSq() > 1e-8) cmd.dir.copy(steer).normalize();
      else cmd.dir.copy(goalDir);
      cmd.speed = speed / SL;
    }
    if (this.state === 'startle' && L.cstart) cmd.speed = 4;
    // blocked: trying to swim but pinned against a rock or the glass ->
    // the behaviour picks another goal
    this.blockedT = cmd.speed > 0.3 && L.speed / SL < 0.15 && !L.cstart ? (this.blockedT || 0) + dt : 0;
    this.blocked = this.blockedT > 2.5;
    if (this.blocked) {
      this.blockedT = 0;
      if (this.state === 'wander') this._pickWanderTarget(world);
      else if (this.state === 'rest' && this.phase === 'go') this.target.copy(this._restSpot());
      else if (this.state === 'cruise') this.sub.dirX *= -1;
    }
    if (!cmd.lookAt && neigh.length && me.rng.next() < 0.002) this.sub.glance = neigh[0].fish;
  }

  // ------------------------------------------------------------ feeding
  /** One food item swallowed: less hungry, and a run of pellets sates for a while. */
  _ate() {
    this.drives.hunger = Math.max(0, this.drives.hunger - 0.08);
    this.gorged = (this.gorged || 0) + 1;
  }

  _forage(dt, time, world, des, cmd) {
    const me = this.fish;
    const L = me.loc;
    const SL = me.SL;
    const head = me.headPosition(_h);
    const spot = this.target;
    cmd.lookAt = spot;
    switch (this.phase) {
      case 'go': {
        // swim to a point above the spot
        const above = _a.copy(spot).setY(spot.y + 0.55 * SL);
        const to = _v.subVectors(above, L.pos);
        const d = to.length();
        des.copy(to).normalize().multiplyScalar(Math.min(0.7 * SL, d * 2.5) + 0.03 * SL);
        if (d < 0.25 * SL) {
          this.phase = 'tilt';
          this.phaseTime = 0;
        } else if (this.phaseTime > 8 || this.blocked) {
          // cannot get there: try another patch
          this.target.copy(this._forageSpot());
          this.phaseTime = 0;
        }
        break;
      }
      case 'tilt': {
        // head-down posture (≈35°), sink toward the gravel
        cmd.pitchBias = -0.62;
        cmd.hoverPrecision = 1;
        // creep down with the pectorals until the mouth touches the pebble
        // tops (never into the gravel)
        const to = _v.subVectors(_a.copy(spot).setY(spot.y + HEAD_CLEAR), head);
        des.copy(to).multiplyScalar(1.4).clampLength(0, 0.2 * SL);
        if (to.length() < 0.06 * SL || this.phaseTime > 3) {
          L.mouthAction('peck');
          this.phase = 'peck';
          this.phaseTime = 0;
          // eat food lying here
          for (const f of world.food.available) {
            if (f.pos.distanceTo(head) < 0.2 * SL) {
              world.food.remove(f);
              this._ate();
              break;
            }
          }
        }
        break;
      }
      case 'peck': {
        cmd.pitchBias = -0.62;
        cmd.hoverPrecision = 1;
        if (this.phaseTime > 0.25) {
          this.phase = 'sort';
          this.phaseTime = 0;
          // the mouthful is sorted for a few seconds while the fish holds still
          this.sub.sortDur = me.rng.range(1.8, 3.4);
        }
        break;
      }
      case 'sort': {
        // lift slightly while sorting the mouthful (palatal organ), then spit grit
        cmd.pitchBias = -0.35;
        cmd.hoverPrecision = 1;
        des.set(0, 0.12 * SL, 0);
        if (this.phaseTime > this.sub.sortDur) {
          if (me.rng.next() < 0.55) {
            L.mouthAction('spit');
            world.puffs.emit(me.headPosition(new THREE.Vector3()), L.forward, me.rng.int(3, 8));
          }
          this.drives.hunger = Math.max(0, this.drives.hunger - 0.012);
          this.sub.pecks--;
          if (this.sub.pecks <= 0) {
            this.nextEval = 0;
            this.stateTime = this.stateDur + 1;
          } else {
            const next = this._forageSpot();
            next.x = clamp(spot.x + me.rng.range(-2, 2) * SL, -0.53, 0.53);
            next.z = clamp(spot.z + me.rng.range(-1.2, 1.2) * SL, -0.18, 0.18);
            next.y = this._ground(next.x, next.z);
            this.target.copy(next);
            this.phase = 'go';
          }
          this.phaseTime = 0;
        }
        break;
      }
    }
  }

  _approachFood(dt, time, world, des, cmd, foodSeen) {
    const me = this.fish;
    const L = me.loc;
    const SL = me.SL;
    if (!this.food || !world.food.available.includes(this.food)) this.food = foodSeen;
    if (this.food !== this.sub.foodItem) {
      this.sub.foodItem = this.food;
      this.sub.foodT = 0;
    }
    this.sub.foodT += dt;
    if (this.food && this.sub.foodT > 8) {
      // cannot get at it: give up on this spot for a while
      this.giveUp = { pos: this.food.pos.clone(), until: time + 30 };
      this.food = null;
    }
    if (!this.food) {
      this.postFeed = time;
      this.nextEval = 0;
      this.stateTime = this.stateDur + 1;
      return;
    }
    const f = this.food;
    f.claimed = me;
    const head = me.headPosition(_h);
    // lead sinking food slightly; on the gravel, aim the mouth at the pebble
    // tops above the item
    const aim = _a.copy(f.pos).addScaledVector(f.vel, 0.3);
    aim.y = Math.max(aim.y, this._ground(aim.x, aim.z) + HEAD_CLEAR);
    const to = _v.subVectors(aim, head);
    const d = to.length();
    cmd.lookAt = f.pos;
    cmd.urgency = 0.5;
    const hunger = this.drives.hunger;
    const vmax = (1.3 + 1.4 * hunger) * SL;
    const cosF = to.dot(L.forward) / Math.max(d, 1e-5);
    // home in: a purposeful dash while far, slowing down on the final
    // approach (and to turn when the item is off to the side or behind)
    let v = Math.min(vmax, 1.6 * d + 0.1 * SL) * lerp(0.45, 1, smoothstep(-0.2, 0.7, cosF));
    if (f.state === 'bottom') {
      // tilt head-down and creep onto a pellet on the gravel with the pectorals
      cmd.pitchBias = -0.6 * smoothstep(1.2 * SL, 0.2 * SL, d);
      v = Math.min(v, lerp(0.2 * SL, v, smoothstep(0.9 * SL, 1.6 * SL, d)));
      if (d < 0.9 * SL) cmd.hoverPrecision = 1;
    }
    cmd.steady = d > 1.5 * SL;
    des.copy(to).normalize().multiplyScalar(v);
    if (d < 0.28 * SL) {
      const cos = cosF;
      if (cos > 0.5 && (!this.sub.strikeT || time - this.sub.strikeT > 0.5)) {
        this.sub.strikeT = time;
        L.mouthAction('strike');
        // suction: most strikes succeed
        if (me.rng.next() < 0.88) {
          world.food.remove(f);
          this._ate();
          this.food = null;
        } else {
          f.vel.add(new THREE.Vector3(me.rng.range(-0.05, 0.05), 0.02, me.rng.range(-0.05, 0.05)));
        }
      } else cmd.hoverPrecision = 0.7;
    }
  }

  _surfaceFeed(dt, time, world, des, cmd, foodSeen) {
    const me = this.fish;
    const L = me.loc;
    const SL = me.SL;
    if (!this.food || !world.food.available.includes(this.food) || this.food.state !== 'surface') {
      this.food = foodSeen && foodSeen.state === 'surface' ? foodSeen : null;
    }
    if (!this.food) {
      // back down after feeding
      this.postFeed = time;
      des.set(0, -0.4 * SL, 0);
      if (this.stateTime > 1.5) {
        this.nextEval = 0;
        this.stateTime = this.stateDur + 1;
      }
      return;
    }
    const f = this.food;
    f.claimed = me;
    cmd.lookAt = f.pos;
    const head = me.headPosition(_h);
    const below = _a.copy(f.pos).setY(TANK.water - 0.7 * SL);
    if (this.phase === 'go') {
      cmd.steady = true;
      const to = _v.subVectors(below, L.pos);
      des.copy(to).normalize().multiplyScalar(Math.min(1.6 * SL, to.length() * 4));
      if (to.length() < 0.4 * SL) {
        this.phase = 'rise';
        this.phaseTime = 0;
      }
    } else if (this.phase === 'rise') {
      // head up toward the item, mouth opening synchronised with head lift
      cmd.pitchBias = 0.75;
      cmd.pitchLimit = 0.95;
      cmd.hoverPrecision = 0.8;
      const to = _v.subVectors(f.pos, head);
      des.copy(to).normalize().multiplyScalar(Math.min(0.9 * SL, to.length() * 5 + 0.1 * SL));
      if (to.length() < 0.16 * SL || this.phaseTime > 3) {
        L.mouthAction('gulp');
        world.surface.addRipple(f.pos.x, f.pos.z, 1.0);
        world.food.remove(f);
        this._ate();
        this.food = null;
        this.phase = 'go';
        this.phaseTime = 0;
      }
    }
  }
}
