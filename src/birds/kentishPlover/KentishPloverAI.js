import * as THREE from 'three';
import { KentishPloverConfig as CFG } from './KentishPloverConfig.js';
import { PREEN_VARIANTS } from './KentishPloverAnimator.js';
import { clamp, hazard, makeRng, wrapAngle, lerp } from '../../core/math.js';

// Behaviour AI for the Kentish Plover — Utility selection of activities + FSM execution.
// docs/behavior.md. No per-frame `Math.random() < p`: every stochastic decision is a hazard rate
// (per second) derived from internal state, so behaviour is frame-rate independent.

export const STATES = ['REST', 'IDLE', 'SCAN', 'WALK', 'RUN', 'FORAGE_SEARCH', 'PECK', 'EAT', 'PREEN', 'SOCIAL', 'ALERT', 'FLEE', 'TAKEOFF', 'FLY', 'LAND'];
const INTERRUPTIBLE = new Set(['IDLE', 'SCAN', 'WALK', 'RUN', 'FORAGE_SEARCH', 'PREEN', 'REST', 'SOCIAL', 'ALERT', 'FLEE']);

const _v = new THREE.Vector3();

export class KentishPloverAI {
  constructor(bird, { seed = 1 } = {}) {
    this.bird = bird;
    this.rng = makeRng(seed * 104729 + 7);
    const ind = bird.individual;
    this.drives = {
      hunger: ind.hunger,
      fear: 0,
      fatigue: this.rng.range(0.1, 0.4),
      alertness: 0.2,
      socialNeed: this.rng.range(0, 0.3),
      comfort: this.rng.range(0.1, 0.5), // need to preen
    };
    this.perception = {
      distanceToWater: 99,
      distanceToPrey: Infinity,
      distanceToBird: Infinity,
      distanceToHuman: Infinity,
      distanceToPlayer: Infinity,
      tideState: 'falling',
      timeOfDay: 12,
      surface: null,
      nearestBird: null,
      threat: null,
      threatLevel: 0,
      detectedPrey: null,
      foodHere: 0,
    };
    this.state = 'IDLE';
    this.stateTime = 0;
    this.stateDur = 1;
    this.activity = 'IDLE';
    this.activityTime = 0;
    this.target = null; // Vector3 or null
    this.targetPrey = null;
    this.purpose = null; // why we're moving
    this.persist = 0; // seconds a threat keeps approaching inside the walk-away zone
    this.habituation = 0;
    this.pecks = [];
    this.stats = { eaten: 0, pecks: 0, flights: 0 };
    this.log = [];
    this.lastAlarm = -99;
    this._enter('IDLE');
  }

  // ------------------------------------------------------------ helpers
  get anim() {
    return this.bird.animator;
  }
  get world() {
    return this.bird.world;
  }

  _enter(state, dur = null) {
    if (this.state !== state) {
      this.log.push(`${state}`);
      if (this.log.length > 12) this.log.shift();
    }
    this.state = state;
    this.stateTime = 0;
    this.stateDur = dur ?? 1;
    const A = this.anim;
    switch (state) {
      case 'IDLE':
        A.setPosture('relaxed');
        A.setGaze('idle');
        this.bird.stop();
        this.stateDur = dur ?? this.rng.range(1.5, 4);
        break;
      case 'SCAN': // head-up vigilance / stop-and-observe
        A.setPosture(this.drives.alertness > 0.6 ? 'alert' : 'relaxed');
        A.setGaze('idle');
        A.gaze.timer = 0;
        this.bird.stop();
        this.stateDur = dur ?? this.rng.range(0.6, 1.8);
        break;
      case 'FORAGE_SEARCH':
        A.setPosture('forage');
        A.setGaze('scan');
        this.bird.stop();
        this.stateDur = dur ?? this.rng.range(...CFG.foraging.scanDuration);
        break;
      case 'WALK':
        A.setPosture(this.purpose === 'prey' || this.purpose === 'relocate' ? 'forage' : 'relaxed');
        A.setGaze(this.purpose === 'prey' ? 'ground' : 'forward', this.targetPrey?.pos ?? null);
        break;
      case 'RUN':
        A.setPosture(this.purpose === 'chase' ? 'hunched' : 'run');
        A.setGaze(this.purpose === 'prey' ? 'ground' : 'forward', this.targetPrey?.pos ?? null);
        break;
      case 'ALERT':
        A.setPosture('alert');
        A.setGaze('fixate', this.perception.threat?.pos ?? null);
        this.bird.stop();
        this.stateDur = dur ?? this.rng.range(1.5, 3.5);
        break;
      case 'REST':
        A.setGaze('idle');
        this.bird.stop();
        this.restVariant = this.drives.fatigue > 0.75 && this.perception.surface?.key === 'drySand' ? 'sit' : this.rng() < 0.55 ? 'restOneLeg' : 'restTucked';
        A.setPosture(this.restVariant);
        this.stateDur = dur ?? this.rng.range(20, 60);
        break;
      case 'PREEN':
        A.setPosture('relaxed');
        A.setGaze('idle');
        this.bird.stop();
        this.preenQueue = this._preenSequence();
        this.stateDur = 999;
        break;
      default:
        break;
    }
  }

  _preenSequence() {
    // 2–5 bouts across body regions; often ending with a shake or wing stretch (S33)
    const n = 2 + Math.floor(this.rng() * 4);
    const q = [];
    for (let i = 0; i < n; i++) q.push({ action: 'preen', variant: this.rng.pick(PREEN_VARIANTS) });
    if (this.rng() < 0.35) q.splice(Math.floor(this.rng() * q.length), 0, { action: 'scratch' });
    const end = this.rng();
    if (end < 0.35) q.push({ action: 'shake' });
    else if (end < 0.6) q.push({ action: 'wingStretch' });
    return q;
  }

  // ------------------------------------------------------------ perception (AI rate)
  _perceive(dt) {
    const b = this.bird;
    const w = this.world;
    const P = this.perception;
    const p = b.pos;
    P.surface = w.terrain.surfaceAt(p.x, p.z);
    P.distanceToWater = w.terrain.distanceToWater(p.x, p.z, 30);
    P.tideState = w.tide.state;
    P.timeOfDay = w.tide.hourOfDay;
    P.foodHere = P.surface.preyFactor;
    // neighbours
    const nb = w.birds.neighbours(b, CFG.social.isolationRadius);
    let nearest = null;
    let nd = Infinity;
    for (const o of nb) {
      const d = o.pos.distanceTo(p);
      if (d < nd) {
        nd = d;
        nearest = o;
      }
    }
    P.nearestBird = nearest;
    P.distanceToBird = nd;
    P.neighbours = nb;
    // threats (player, future predators/dogs)
    let best = null;
    let bestLevel = 0;
    let bestEff = Infinity;
    P.distanceToHuman = Infinity;
    for (const t of w.threats) {
      const d = Math.hypot(t.pos.x - p.x, t.pos.z - p.z);
      if (t.type === 'human') P.distanceToHuman = Math.min(P.distanceToHuman, d);
      const { level, eff } = this._threatLevel(t, d);
      if (level > bestLevel || (level === bestLevel && eff < bestEff)) {
        best = t;
        bestLevel = level;
        bestEff = eff;
      }
    }
    P.distanceToPlayer = w.player ? Math.hypot(w.player.pos.x - p.x, w.player.pos.z - p.z) : Infinity;
    P.threat = best;
    P.threatLevel = bestLevel;
    P.threatEff = bestEff;
  }

  /** Graded response level 0..4 from the disturbance config (S11, S12, S37). */
  _threatLevel(t, d) {
    const D = CFG.disturbance;
    const type = D.threatTypes[t.type] ?? D.threatTypes.human;
    const season = D.contextScale[this.world.context ?? 'foraging'] ?? 1;
    const toBird = _v.set(this.bird.pos.x - t.pos.x, 0, this.bird.pos.z - t.pos.z);
    const dist = toBird.length() || 1e-3;
    toBird.divideScalar(dist);
    const tv = t.vel ? Math.hypot(t.vel.x, t.vel.z) : 0;
    const approach = t.vel ? (t.vel.x * toBird.x + t.vel.z * toBird.z) : 0;
    const directness = tv > 0.05 ? clamp(approach / tv, -1, 1) : 0;
    const speedF = Math.pow(Math.max(0.2, tv) / D.speedFactor.reference, D.speedFactor.exponent);
    const scale = season * type.distanceScale * (tv > 0.05 ? speedF : 0.75) * (1 + D.directnessWeight * directness) * this.bird.individual.fearThreshold * (1 - this.habituation);
    const eff = d / Math.max(0.05, scale);
    let level = 0;
    if (eff < D.alertDistance) level = 1;
    if (eff < D.walkAwayDistance) level = 2;
    if (eff < D.runAwayDistance) level = 3;
    if (eff < D.flightInitiationDistance) level = 4;
    t._approach = approach;
    return { level, eff };
  }

  // ------------------------------------------------------------ drives
  _updateDrives(dt) {
    const D = this.drives;
    const R = CFG.drives;
    const moving = this.bird.speed > 0.05 || this.bird.airborne;
    D.hunger = clamp(D.hunger + R.hungerRate * dt * (this.bird.airborne ? 2.5 : 1), 0, 1);
    D.fatigue = clamp(D.fatigue + (this.state === 'REST' ? -R.fatigueRecovery : R.fatigueRate * (moving ? 2 : 1) * (this.world.tide.daylight < 0.1 ? 1.5 : 1)) * dt, 0, 1);
    D.comfort = clamp(D.comfort + (this.state === 'PREEN' ? -1 / 25 : R.comfortRate * (this.bird.airborne ? 3 : 1)) * dt, 0, 1);
    const isolated = this.perception.distanceToBird > CFG.social.isolationRadius * 0.7;
    D.socialNeed = clamp(D.socialNeed + (isolated ? R.socialRate : -R.socialRate * 2) * dt, 0, 1);
    // fear: jumps to the level-driven floor, decays otherwise
    const floor = [0, 0.3, 0.5, 0.75, 1][this.perception.threatLevel];
    D.fear = D.fear < floor ? lerp(D.fear, floor, 1 - Math.exp(-6 * dt)) : D.fear * Math.exp(-CFG.disturbance.fearDecay * dt);
    D.alertness = clamp(Math.max(D.alertness * Math.exp(-0.08 * dt), D.fear * 1.1, this.perception.threatLevel >= 1 ? 0.7 : 0), 0, 1);
    // habituation to a threat that keeps its distance
    const t = this.perception.threat;
    if (t && this.perception.threatLevel <= 1 && this.perception.threatEff > CFG.disturbance.alertDistance * 0.6) this.habituation = Math.min(CFG.disturbance.habituationMax, this.habituation + CFG.disturbance.habituationRate * dt);
  }

  // ------------------------------------------------------------ activity selection (utility)
  _utilities() {
    const D = this.drives;
    const P = this.perception;
    const tide = this.world.tide;
    const highTide = tide.state === 'high' || (tide.state === 'rising' && (tide.level - tide.mean) / tide.amplitude > 0.55);
    const night = 1 - tide.daylight;
    const food = Math.max(P.foodHere, this._bestFoodNearby ?? 0);
    // tide drives the daily rhythm: feed while the flat is exposed, roost around high water (S15, S31)
    const r = (tide.level - tide.mean) / tide.amplitude;
    const tideForage = highTide ? 0.25 : 1 - 0.4 * Math.max(0, r);
    return {
      FORAGE: (0.35 + 0.65 * D.hunger) * (0.45 + 0.55 * food) * tideForage * (1 - D.fear),
      REST: (D.fatigue * 0.75 + (highTide ? 0.5 : 0) + night * 0.12) * (1 - D.fear) * (1 - D.hunger * 0.5),
      PREEN: D.comfort * 0.6 * (1 - D.hunger * 0.6) * (1 - D.fear),
      SOCIAL: D.socialNeed * 0.6 * (1 - D.fear),
      IDLE: 0.06,
    };
  }

  _chooseActivity() {
    const U = this._utilities();
    const cur = this.activity;
    let best = cur;
    let bestU = (U[cur] ?? 0) + 0.15; // hysteresis
    for (const [k, u] of Object.entries(U)) {
      if (u > bestU) {
        best = k;
        bestU = u;
      }
    }
    this.utilities = U;
    if (best !== this.activity) {
      this.activity = best;
      this.activityTime = 0;
      this._startActivity(best);
    }
  }

  _startActivity(a) {
    switch (a) {
      case 'FORAGE':
        this._forageNext();
        break;
      case 'REST':
        this._goRoost();
        break;
      case 'PREEN':
        this._enter('PREEN');
        break;
      case 'SOCIAL':
        this._goFlock();
        break;
      default:
        this._enter('IDLE');
    }
  }

  // ------------------------------------------------------------ run–stop–peck
  _forageNext() {
    // After a move ends: sometimes a head-up look (stop → observe → decide), else scan the ground.
    const vigil = 0.15 + this.drives.alertness * 0.5;
    if (this.state !== 'SCAN' && this.rng() < vigil) this._enter('SCAN', this.rng.range(0.4, 1.2));
    else this._enter('FORAGE_SEARCH');
  }

  _detectPrey(dt) {
    const b = this.bird;
    const F = CFG.foraging;
    const items = this.world.prey.query(b.pos, F.detectionRange, this._tmpItems || (this._tmpItems = []));
    const stationary = b.speed < 0.05 ? 1 : F.movingDetectionFactor;
    const light = 0.55 + 0.45 * this.world.tide.daylight; // plovers also feed at night (S15)
    let best = null;
    let bestD = Infinity;
    let nearest = Infinity;
    const fwdX = Math.sin(b.heading);
    const fwdZ = Math.cos(b.heading);
    for (const it of items) {
      if (it.claimedBy && it.claimedBy !== b) continue;
      const dx = it.pos.x - b.pos.x;
      const dz = it.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, d);
      if (!this.world.prey.cueActive(it)) continue;
      // lateral eyes: wide field of view but not directly behind
      const facing = (dx * fwdX + dz * fwdZ) / (d || 1);
      if (facing < -0.5) continue;
      const lambda = 1.5 * stationary * light * Math.exp(-d / it.def.detectRange) * (1 - this.drives.fear * 0.7) * (0.6 + 0.4 * (facing + 1) / 2);
      if (this.rng() < hazard(lambda, dt) && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    this.perception.distanceToPrey = nearest;
    return best;
  }

  _goForPrey(item) {
    const b = this.bird;
    this.targetPrey = item;
    item.claimedBy = b;
    this.perception.detectedPrey = item;
    const d = Math.hypot(item.pos.x - b.pos.x, item.pos.z - b.pos.z);
    // stop a bill-reach short of the prey: tipping forward over the feet with the bill 60–67° down puts the bill
    // tip ≈6 cm ahead of them (p007, p061; KentishPloverAnimator ACTIONS.peck)
    const reach = CFG.animation.peck.reach * b.individual.bodyScale;
    const dir = _v.set(item.pos.x - b.pos.x, 0, item.pos.z - b.pos.z).normalize();
    const stopAt = item.pos.clone().addScaledVector(dir, -reach);
    this.target = stopAt;
    this.purpose = 'prey';
    const sprint = item.def.approach === 'sprint';
    if (d - reach < 0.03) {
      this._peck();
      return;
    }
    if (sprint || d > CFG.foraging.walkToPreyMax) {
      const sp = sprint ? CFG.animation.run.maxSpeed * 0.85 : lerp(CFG.animation.run.speed * 0.7, CFG.animation.run.speed * 1.2, clamp(d / 2, 0, 1));
      b.moveTo(stopAt, { gait: 'run', speed: sp, arrive: 0.02, onArrive: (r) => (r === 'blocked' ? this._forageNext() : this._peck()) });
      this._enter('RUN');
    } else {
      b.moveTo(stopAt, { gait: 'walk', arrive: 0.02, onArrive: (r) => (r === 'blocked' ? this._forageNext() : this._peck()) });
      this._enter('WALK');
    }
  }

  _peck() {
    const b = this.bird;
    const it = this.targetPrey;
    if (!it || !it.alive) {
      this._forageNext();
      return;
    }
    b.faceTowards(it.pos);
    // eyes on the prey in the foraging stance; after the stop the bird fixates for a moment before it strikes
    // (the run's momentum is absorbed by the legs first) — a crab gets struck at once, before it runs
    this.anim.setPosture('forage');
    this.anim.setGaze('ground', it.pos);
    this._enter('PECK', 4);
    const F = CFG.foraging.peckFixation;
    this._peckAt = it.def.approach === 'sprint' ? this.rng.range(...F.sprint) : this.rng.range(...(this.bird.speed > 0.3 ? F.afterRun : F.afterWalk));
  }

  _strike() {
    const b = this.bird;
    const it = this.targetPrey;
    this._peckAt = null;
    if (!it || !it.alive) {
      if (it) it.claimedBy = null;
      this.targetPrey = null;
      b.faceTowards(null);
      this._forageNext();
      return;
    }
    this.stats.pecks++;
    this.anim.play('peck', { target: it.pos.clone(), preyType: it.type }, (ev) => {
      if (ev === 'catch') {
        const burrowed = it.burrowed > this.world.prey.time;
        const pSuccess = { polychaete: 0.72, crab: 0.55, amphipod: 0.8, insect: 0.7 }[it.type] * (burrowed ? 0.1 : 1);
        this._caught = this.rng() < pSuccess;
        if (this.anim.action?.name === 'peck') this.anim.action.params.caught = this._caught; // (prey in the bill or not)
        if (this._caught) this.world.prey.consume(it);
      }
      if (ev === 'done') {
        it.claimedBy = null;
        if (this._caught) {
          this.drives.hunger = clamp(this.drives.hunger - it.def.energy * 0.09, 0, 1);
          this.stats.eaten++;
          this._enter('EAT', this.rng.range(0.15, 0.4));
        } else this._forageNext();
        this.targetPrey = null;
        this.perception.detectedPrey = null;
        b.faceTowards(null);
      }
    });
  }

  _relocate() {
    // choose a short hop: 0.3–1.5 m, turn ≤ ~70°, biased to the preferred distance from water and to food
    const b = this.bird;
    const F = CFG.foraging;
    let bestP = null;
    let bestScore = -Infinity;
    const P = this.perception;
    const pref = P.surface?.def.preferredDistance;
    const nearWater = this.world.terrain.directionToWater(b.pos.x, b.pos.z, 20);
    const socialPull = this.drives.socialNeed;
    const flock = this.world.birds.centroid(b, 25);
    for (let i = 0; i < 6; i++) {
      const turn = this.rng.range(-F.relocateTurn, F.relocateTurn);
      const dist = this.rng.range(F.relocateDistance[0], F.relocateDistance[1]) * (P.foodHere < 0.2 ? 3 : 1);
      const h = b.heading + turn;
      const x = b.pos.x + Math.sin(h) * dist;
      const z = b.pos.z + Math.cos(h) * dist;
      const s = this.world.terrain.surfaceAt(x, z);
      if (!s.def.walkable || s.key === 'shallowWater') continue;
      let score = s.preyFactor * 2 - s.def.avoidance - s.def.walkCost * 0.2 + this.rng() * 0.3;
      if (nearWater && pref) {
        // keep within the preferred band from the water's edge
        const toward = (Math.sin(h) * nearWater.x + Math.cos(h) * nearWater.z) * dist;
        const newD = nearWater.d - toward;
        if (newD < pref[0]) score -= 0.5;
        if (newD > pref[1]) score -= 0.3 * (newD - pref[1]) / 5;
      }
      if (flock) score -= socialPull * Math.hypot(flock.x - x, flock.z - z) * 0.02;
      // personal space
      for (const o of P.neighbours ?? []) {
        const d2 = Math.hypot(o.pos.x - x, o.pos.z - z);
        if (d2 < b.individual.personalSpace) score -= 1.5 * (1 - d2 / b.individual.personalSpace);
      }
      if (score > bestScore) {
        bestScore = score;
        bestP = new THREE.Vector3(x, 0, z);
      }
    }
    if (!bestP) {
      this._enter('SCAN', 0.8);
      return;
    }
    this.target = bestP;
    this.purpose = 'relocate';
    const d = bestP.distanceTo(_v.set(b.pos.x, 0, b.pos.z));
    const run = d > 0.45 || this.rng() < 0.4;
    b.moveTo(bestP, { gait: run ? 'run' : 'walk', speed: run ? this.rng.range(0.8, 1.5) : undefined, arrive: 0.03, onArrive: () => this._forageNext() });
    this._enter(run ? 'RUN' : 'WALK');
  }

  /** Point `dist` metres up the local slope (away from the sea). */
  _upslope(dist) {
    const p = this.bird.pos;
    const T = this.world.terrain;
    const gx = T.heightAt(p.x + 1, p.z) - T.heightAt(p.x - 1, p.z);
    const gz = T.heightAt(p.x, p.z + 1) - T.heightAt(p.x, p.z - 1);
    const l = Math.hypot(gx, gz) || 1;
    const a = this.rng.range(-0.3, 0.3);
    const dx = (gx / l) * Math.cos(a) - (gz / l) * Math.sin(a);
    const dz = (gx / l) * Math.sin(a) + (gz / l) * Math.cos(a);
    return new THREE.Vector3(p.x + dx * dist, 0, p.z + dz * dist);
  }

  _longRelocate() {
    // search a ring for better foraging ground when the local surface is poor or flooding
    const b = this.bird;
    let best = null;
    let bestS = -Infinity;
    for (const r of [4, 9, 18, 30]) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + this.rng() * 0.3;
        const x = b.pos.x + Math.sin(a) * r;
        const z = b.pos.z + Math.cos(a) * r;
        const s = this.world.terrain.surfaceAt(x, z);
        if (!s.def.walkable || s.key === 'shallowWater') continue;
        const sc = s.preyFactor - r * 0.01 - s.def.avoidance;
        if (sc > bestS) {
          bestS = sc;
          best = new THREE.Vector3(x, 0, z);
        }
      }
    }
    this._bestFoodNearby = Math.max(0, bestS);
    return best;
  }

  // ------------------------------------------------------------ roost / flock
  _goRoost() {
    // roost on dry ground above the tide, near other resting birds (S31)
    const b = this.bird;
    const others = this.world.birds.all.filter((o) => o !== b && o.ai.state === 'REST');
    let target = null;
    if (others.length) {
      const o = others[Math.floor(this.rng() * others.length)];
      const a = this.rng() * Math.PI * 2;
      target = new THREE.Vector3(o.pos.x + Math.sin(a) * CFG.social.roostSpacing * 1.4, 0, o.pos.z + Math.cos(a) * CFG.social.roostSpacing * 1.4);
    } else {
      // walk up-shore until above the current high-water mark
      for (let r = 0; r < 40 && !target; r += 2) {
        const x = b.pos.x + this.rng.range(-2, 2);
        const z = b.pos.z + r;
        const s = this.world.terrain.surfaceAt(x, z);
        if ((s.key === 'drySand' || s.key === 'sand') && this.world.terrain.heightAt(x, z) > this.world.tide.mean + this.world.tide.amplitude * 0.95) target = new THREE.Vector3(x, 0, z);
      }
    }
    if (!target || target.distanceTo(_v.set(b.pos.x, 0, b.pos.z)) < 0.6) {
      this._enter('REST');
      return;
    }
    this.target = target;
    this.purpose = 'roost';
    const d = target.distanceTo(_v);
    if (d > 45) {
      this._takeoff(target, 'relocate');
      return;
    }
    b.moveTo(target, { gait: d > 3 ? 'run' : 'walk', speed: d > 3 ? 1.0 : undefined, arrive: 0.15, onArrive: () => this._enter('REST') });
    this._enter(d > 3 ? 'RUN' : 'WALK');
  }

  _goFlock() {
    const b = this.bird;
    const c = this.world.birds.centroid(b, 60);
    if (!c) {
      this._enter('IDLE');
      return;
    }
    const d = Math.hypot(c.x - b.pos.x, c.z - b.pos.z);
    this.purpose = 'social';
    if (d > 40) {
      this._takeoff(new THREE.Vector3(c.x, 0, c.z), 'social');
      return;
    }
    const t = new THREE.Vector3(lerp(b.pos.x, c.x, 0.8), 0, lerp(b.pos.z, c.z, 0.8));
    this.target = t;
    b.moveTo(t, { gait: d > 4 ? 'run' : 'walk', speed: d > 4 ? 1.1 : undefined, arrive: 0.5, onArrive: () => {
      this.drives.socialNeed *= 0.3;
      this.activity = 'IDLE';
      this._enter('SCAN');
    } });
    this._enter(d > 4 ? 'RUN' : 'WALK');
  }

  /** Aggressive displacement of a competitor near food (S30): short hunched run toward it. */
  _chase(other) {
    const b = this.bird;
    const dir = _v.set(other.pos.x - b.pos.x, 0, other.pos.z - b.pos.z).normalize();
    const dist = this.rng.range(...CFG.social.chaseDistance);
    const t = b.pos.clone().addScaledVector(dir, Math.min(dist, other.pos.distanceTo(b.pos) + 0.2));
    this.purpose = 'chase';
    this.target = t;
    b.moveTo(t, { gait: 'run', speed: 1.6, arrive: 0.05, onArrive: () => this._forageNext() });
    this.anim.play('threat');
    this._enter('RUN');
    other.ai.onChased(b);
  }

  onChased(by) {
    if (this.bird.airborne || this.state === 'TAKEOFF') return;
    const b = this.bird;
    const away = _v.set(b.pos.x - by.pos.x, 0, b.pos.z - by.pos.z).normalize();
    const t = b.pos.clone().addScaledVector(away, this.rng.range(0.8, 1.6));
    this.purpose = 'avoid';
    b.moveTo(t, { gait: 'run', speed: 1.5, arrive: 0.05, onArrive: () => this._forageNext() });
    this._enter('RUN');
  }

  // ------------------------------------------------------------ threat responses
  _respondToThreat(dt) {
    const P = this.perception;
    const L = P.threatLevel;
    const t = P.threat;
    const st = this.state;
    if (['TAKEOFF', 'FLY', 'LAND'].includes(st)) return true;
    // persistence: continued approach inside the walk-away zone escalates to flight
    if (L >= 2 && t && (t._approach ?? 0) > 0.25) this.persist += dt;
    else this.persist = Math.max(0, this.persist - dt * 0.5);
    let level = L;
    if (this.persist > CFG.disturbance.persistSeconds) level = 4;
    // flock alarm contagion may already have raised fear to flight level
    if (this.drives.fear > 0.92 && this.alarmFrom) level = 4;
    if (level >= 4) {
      this._takeoff(this._escapeLanding(t), 'flee');
      return true;
    }
    if (level === 3 || level === 2) {
      if (st === 'FLEE' && this.fleeLevel >= level) return true;
      this._flee(t, level);
      return true;
    }
    if (level === 1) {
      if (st === 'REST' || st === 'PREEN' || (st !== 'ALERT' && this.drives.fear > 0.28 && this.stateTime > 0.3 && this._alertCooldown <= 0)) {
        this.anim.stopAction();
        this._enter('ALERT');
        this._alertCooldown = this.rng.range(4, 9);
        return true;
      }
    }
    return false;
  }

  _flee(t, level) {
    const b = this.bird;
    const away = _v.set(b.pos.x - t.pos.x, 0, b.pos.z - t.pos.z).normalize();
    // slight sideways component + avoid water/vegetation
    let best = null;
    let bestS = -Infinity;
    for (const ang of [0, 0.4, -0.4, 0.8, -0.8]) {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const dx = away.x * c - away.z * s;
      const dz = away.x * s + away.z * c;
      const dist = level === 3 ? 5 : 3;
      const x = b.pos.x + dx * dist;
      const z = b.pos.z + dz * dist;
      const sf = this.world.terrain.surfaceAt(x, z);
      const sc = (sf.def.walkable && sf.key !== 'shallowWater' ? 1 : -5) - sf.def.avoidance - Math.abs(ang) * 0.3;
      if (sc > bestS) {
        bestS = sc;
        best = new THREE.Vector3(x, 0, z);
      }
    }
    this.purpose = 'avoid';
    this.fleeLevel = level;
    this.target = best;
    b.moveTo(best, {
      gait: level === 3 ? 'run' : 'walk',
      speed: level === 3 ? 1.6 : CFG.animation.walk.speed * 1.5,
      arrive: 0.1,
      onArrive: () => {
        this.fleeLevel = 0;
        this._enter('ALERT');
      },
    });
    this.anim.stopAction();
    this.anim.setPosture(level === 3 ? 'run' : 'alert');
    this.anim.setGaze('fixate', t.pos);
    this.state = 'FLEE';
    this.stateTime = 0;
    this.log.push('FLEE');
  }

  _escapeLanding(t) {
    const b = this.bird;
    // land 25–70 m away, away from the threat, on walkable, non-water ground
    const base = t ? Math.atan2(b.pos.x - t.pos.x, b.pos.z - t.pos.z) : this.rng() * Math.PI * 2;
    if (this.alarmFrom?.landing && this.alarmFrom.time > this.world.time - 3) {
      // follow the flock: land near the initiator's landing site
      const L = this.alarmFrom.landing;
      return new THREE.Vector3(L.x + this.rng.range(-2.5, 2.5), 0, L.z + this.rng.range(-2.5, 2.5));
    }
    for (let i = 0; i < 20; i++) {
      const a = base + this.rng.range(-0.9, 0.9);
      const r = this.rng.range(25, 70);
      const x = clamp(b.pos.x + Math.sin(a) * r, -110, 110);
      const z = clamp(b.pos.z + Math.cos(a) * r, -110, 80);
      const s = this.world.terrain.surfaceAt(x, z);
      if (s.def.walkable && s.key !== 'shallowWater' && s.key !== 'vegetation') return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(b.pos.x + Math.sin(base) * 30, 0, b.pos.z + Math.cos(base) * 30);
  }

  _takeoff(landing, reason) {
    const b = this.bird;
    this.anim.stopAction();
    this.landing = landing;
    this.flightReason = reason;
    b.stop();
    // pivot 60% of the way toward the landing point during the crouch (the ground yaw controller turns the bird;
    // setting the heading directly twisted the whole bird in one frame, and mixed wrapped/unwrapped angles)
    const toLanding = Math.atan2(landing.x - b.pos.x, landing.z - b.pos.z);
    const h = b.heading + wrapAngle(toLanding - b.heading) * 0.6;
    b.faceTowards(new THREE.Vector3(b.pos.x + Math.sin(h), b.pos.y, b.pos.z + Math.cos(h)));
    this._enter('TAKEOFF', 0.6);
    this.stats.flights++;
    if (reason === 'flee') this.world.birds.broadcastAlarm(b, landing);
    this.anim.play('takeoff', {}, (ev) => {
      if (ev === 'airborne') {
        b.faceTowards(null);
        b.startFlight(landing, { altitude: reason === 'flee' ? 3 : 2 });
        this._enter('FLY', 99);
      }
    });
  }

  onAlarm(from, landing, strength) {
    if (this.bird.airborne || this.state === 'TAKEOFF') return;
    this.drives.fear = clamp(this.drives.fear + strength, 0, 1);
    this.alarmFrom = { bird: from, landing, time: this.world.time };
  }

  onLandingStart() {
    this._enter('LAND', 2);
    this.anim.play('landing', {}, () => {});
  }

  onTouchdown() {
    this.alarmFrom = null;
    this.drives.comfort = clamp(this.drives.comfort + 0.1, 0, 1);
    this._pendingAfterLanding = true;
  }

  // ------------------------------------------------------------ main updates
  /** AI-rate update (perception, drives, decisions). */
  update(dt) {
    this._alertCooldown = (this._alertCooldown ?? 0) - dt;
    this._perceive(dt);
    this._updateDrives(dt);
    this.activityTime += dt;
    if (['FLY', 'TAKEOFF'].includes(this.state)) return;
    if (this.state === 'LAND') {
      if (this._pendingAfterLanding && !this.anim.busy && this.bird.speed < 0.05) {
        this._pendingAfterLanding = false;
        // stop → observe after landing
        this.activity = 'IDLE';
        this._enter('SCAN', this.rng.range(1, 2.2));
      }
      return;
    }
    if (this._respondToThreat(dt)) return;

    const s = this.state;
    const P = this.perception;
    // tide flooding the bird's spot, or the rising edge about to: move upslope (S31: birds retreat with the tide)
    const inWater = P.surface?.key === 'shallowWater' || P.surface?.key === 'deepWater';
    const edgeRising = this.world.tide.trend > 0 && P.distanceToWater < 0.5 && !inWater;
    if ((inWater || edgeRising) && !(this.purpose === 'escapeWater' && (s === 'WALK' || s === 'RUN'))) {
      const up = this._upslope(inWater ? 3 : 1.5);
      this.purpose = 'escapeWater';
      this.target = up;
      const deep = P.surface?.key === 'deepWater';
      this.bird.moveTo(up, { gait: deep ? 'run' : 'walk', speed: deep ? 1.0 : undefined, arrive: 0.1, onArrive: () => this._forageNext() });
      this._enter(deep ? 'RUN' : 'WALK');
      return;
    }

    switch (s) {
      case 'PECK':
        // fixation before the strike: the bird has stopped (feet planted) and looks at the prey
        if (this._peckAt != null && this.stateTime >= this._peckAt && (this.bird.speed < 0.1 || this.stateTime > 1)) this._strike();
        break;
      case 'FORAGE_SEARCH': {
        // stop → settle → look: no detection during the first ~0.3 s after stopping (head/eye stabilisation)
        const found = this.stateTime > CFG.foraging.lookLatency ? this._detectPrey(dt) : null;
        if (found) {
          this._goForPrey(found);
          break;
        }
        // occasional foot-trembling on wet mud (S21, S22)
        if (P.surface?.key === 'wetMud' && !this.anim.busy && this.rng() < hazard(CFG.foraging.footTrembleHazard, dt)) this.anim.play('footTremble');
        // competitor very close while feeding → displacement (S30)
        const nb = P.nearestBird;
        if (nb && P.distanceToBird < this.bird.individual.personalSpace * 0.5 && !nb.airborne && this.rng() < hazard(CFG.social.chaseHazard, dt)) {
          this._chase(nb);
          break;
        }
        if (this.stateTime > this.stateDur || this.rng() < hazard(CFG.foraging.giveUpHazard * 0.15, dt)) {
          if (this.activity !== 'FORAGE') {
            this._chooseActivity();
            if (this.activity !== 'FORAGE') break;
          }
          // poor ground → long relocation
          if (P.foodHere < 0.12) {
            const t = this._longRelocate();
            if (t && t.distanceTo(_v.set(this.bird.pos.x, 0, this.bird.pos.z)) > 3) {
              this.purpose = 'relocate';
              const d = t.distanceTo(_v);
              if (d > 40) this._takeoff(t, 'relocate');
              else {
                this.bird.moveTo(t, { gait: 'run', speed: 1.1, arrive: 0.3, onArrive: () => this._forageNext() });
                this._enter('RUN');
              }
              break;
            }
          }
          this._relocate();
        }
        break;
      }
      case 'SCAN':
        if (this.stateTime > this.stateDur) {
          this._chooseActivity();
          if (this.activity === 'FORAGE') this._enter('FORAGE_SEARCH');
          else if (this.state === 'SCAN') this._startActivity(this.activity);
        }
        break;
      case 'EAT':
        if (this.stateTime > this.stateDur) {
          this._chooseActivity();
          if (this.activity === 'FORAGE') this._forageNext();
        }
        break;
      case 'IDLE':
        if (this.stateTime > this.stateDur) this._chooseActivity();
        if (this.state === 'IDLE' && this.stateTime > this.stateDur) this._enter('IDLE');
        break;
      case 'ALERT':
        if (this.stateTime > this.stateDur && P.threatLevel <= 1) {
          this.activity = 'IDLE';
          this._enter('SCAN', this.rng.range(0.5, 1.5));
        }
        break;
      case 'FLEE':
        break;
      case 'PREEN':
        if (!this.anim.busy) {
          const next = this.preenQueue.shift();
          if (!next || this.drives.hunger > 0.85) {
            this.activity = 'IDLE';
            this._chooseActivity();
            if (this.state === 'PREEN') this._enter('IDLE');
          } else this.anim.play(next.action, { variant: next.variant });
        }
        break;
      case 'REST':
        if (this.stateTime > this.stateDur || this.drives.hunger > 0.8) {
          this._chooseActivity();
          if (this.activity === 'REST') this.stateTime = 0;
        }
        break;
      default:
        break;
    }
  }

  /** Per-frame cheap bookkeeping. */
  tick(dt) {
    this.stateTime += dt;
    // chasing prey: crab may dash for its burrow when approached slowly
    if (this.targetPrey && (this.state === 'WALK' || this.state === 'RUN')) {
      this.world.prey.disturb(this.targetPrey, this.bird.pos, this.bird.speed);
      this.perception.distanceToPrey = Math.hypot(this.targetPrey.pos.x - this.bird.pos.x, this.targetPrey.pos.z - this.bird.pos.z);
    }
  }
}
