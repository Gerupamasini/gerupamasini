// Behaviour of ユビナガホンヤドカリ: perception → internal state → utility-based choice of activity,
// with a reflex layer for threats. Not a rigid state machine: every calm activity is scored from the
// internal state, the environment and the individual's personality, with noise and hysteresis.
//
// States kept from the brief (01_research.md):
//   IDLE, EXPLORE, FORAGE (deposit feeding on the sediment surface), FEED (discrete food item),
//   INVESTIGATE, REST, THREAT_ALERT, RETREAT, HIDE_IN_SHELL, EMERGE, SHELL_INSPECT, SHELL_CHANGE
// Removed as separate states: WALK (it is the locomotion layer used by every state) and CLIMB (an
// automatic locomotion mode on slopes and objects – P. minutus climbs walls and algae [D], but climbing
// is not a distinct decision).
// Breeding season (Nov–Apr [D]): precopulatory mate guarding – MATE_GUARD (male: approach, grasp the
// female's shell rim with the minor (left) chela [D], carry her, shake bouts [G: P. filholi]; a rival
// with a larger major chela may take her over [D: escalation decided by major-chela size]) and GUARDED
// (female: held, withdrawn). Real guarding lasts days [D]; the game compresses it to a few minutes [S].
import * as THREE from 'three';
import { evaluateShell } from './PagurusMinutusShell.js';
import { clamp, damp, lerp, smoothstep, fbm1, SeededRandom, wrapAngle } from './PagurusMinutusUtil.js';

export const STATE = {
  IDLE: 'IDLE', EXPLORE: 'EXPLORE', FORAGE: 'FORAGE', FEED: 'FEED', INVESTIGATE: 'INVESTIGATE', REST: 'REST',
  THREAT_ALERT: 'THREAT_ALERT', RETREAT: 'RETREAT', HIDE_IN_SHELL: 'HIDE_IN_SHELL', EMERGE: 'EMERGE',
  SHELL_INSPECT: 'SHELL_INSPECT', SHELL_CHANGE: 'SHELL_CHANGE', MATE_GUARD: 'MATE_GUARD', GUARDED: 'GUARDED',
};
const CALM = new Set([STATE.IDLE, STATE.EXPLORE, STATE.FORAGE, STATE.FEED, STATE.INVESTIGATE, STATE.REST, STATE.SHELL_INSPECT]);

/** encyclopedia behaviour ids emitted when a state starts */
const EVENT_OF = {
  EXPLORE: 'walk', REST: 'rest', FORAGE: 'forage', FEED: 'feed', HIDE_IN_SHELL: 'withdraw', EMERGE: 'emerge',
  SHELL_INSPECT: 'shell_inspect', SHELL_CHANGE: 'shell_change', THREAT_ALERT: 'alert', INVESTIGATE: 'investigate',
};

const SUBSTRATE_FOOD = { mud: 1.0, muddy_sand: 0.85, sand: 0.5, gravel: 0.3, channel: 0.7 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Behavior {
  constructor(crab) {
    this.crab = crab;
    const rng = (this.rng = new SeededRandom(crab.seed * 977 + 3));
    // personality (personalitySeed): consistent individual differences – e.g. hiding time varies 2–4×
    // between individuals in Pagurus startle tests [G]
    this.personality = {
      seed: crab.seed,
      boldness: clamp(0.5 + 0.22 * rng.normal(), 0.05, 0.95),
      exploration: clamp(0.5 + 0.2 * rng.normal(), 0.1, 0.95),
      sociality: clamp(0.5 + 0.2 * rng.normal(), 0.05, 0.95),
      appetite: clamp(1 + 0.15 * rng.normal(), 0.7, 1.3),
    };
    this.internal = {
      hunger: rng.range(0.2, 0.65),
      fear: 0,
      curiosity: this.personality.exploration,
      energy: rng.range(0.55, 0.95),
      shellSatisfaction: 0.7,
      activity: 0.7,
    };
    this.state = STATE.IDLE;
    this.stateTime = 0;
    this.stateDur = 2;
    this.sub = '';
    this.subTime = 0;
    this.data = {};
    this.lastTurn = rng.chance(0.5) ? 1 : -1;
    this.tickTimer = 0;
    this.time = 0;
    this.threat = { level: 0, pos: new THREE.Vector3(), has: false, ext: 0, extPos: new THREE.Vector3(), approach: 0 };
    this.prevPlayerDist = null;
    this.prevPlayerPos = new THREE.Vector3();
    this.playerSpeed = 0;
    this.envInfo = { depth: 0.1, exposed: false, exposedFor: 0, substrate: 'muddy_sand', wet: 1, activityEnv: 1, sunUp: true };
    this.suggestion = null;
    this.events = [];
    this.cmd = {
      loco: { moveTarget: null, speed: 1.4, posture: 'stand', freeze: false, legsActive: true, backward: false, urgent: false, shuffle: false, face: null },
      anim: { retract: 0, urgent: false, attention: [], sniff: 0.15, explore: 0.5, chelaR: { mode: 'rest' }, chelaL: { mode: 'rest' }, mouth: 0, alert: 0, lean: 0 },
    };
    this.moveTarget = new THREE.Vector3();
    this.guardCooldownUntil = 0;
    this.lastEnv = null;
  }

  emit(id) {
    this.events.push(id);
  }

  // ── external suggestions from the game's behaviour tree ────────────────────────────────────
  suggest(intent, playerPos) {
    const k = intent.kind;
    if (k === 'flee') {
      this.threat.ext = Math.max(this.threat.ext, 0.65 + 0.35 * (intent.urgency ?? 1));
      this.threat.extPos.copy(intent.from ?? playerPos ?? this.crab.loco.position);
      return;
    }
    this.suggestion = { kind: k, target: intent.target ? intent.target.clone() : null, until: this.time + Math.max(2, intent.seconds || 6), param: intent.param };
  }

  // ── perception ─────────────────────────────────────────────────────────────────────────────
  perceive(dt, env) {
    const crab = this.crab;
    const pos = crab.loco.position;
    const e = this.envInfo;
    // water / exposure / substrate
    const ground = env.groundAt(pos.x, pos.z);
    const water = env.waterAt ? env.waterAt(pos.x, pos.z) : ground + 0.1;
    e.depth = water - ground;
    const exposed = e.depth <= 0.002;
    if (exposed) e.exposedFor += dt; else e.exposedFor = 0;
    e.exposed = exposed;
    const s = env.sample ? env.sample : null;
    if (s) {
      e.substrate = s.substrate ?? e.substrate;
      e.distToWater = s.distToWater ?? 0;
      e.inPool = !!s.inPool;
    }
    e.sunUp = (env.sunElevation ?? 30) > -2;
    // wet film: wet while submerged, dries over ~15 min of exposure
    e.wet = exposed ? Math.max(0.2, Math.exp(-e.exposedFor / 900)) : 1;
    // activity from the environment (01_research.md §3.6, game supplement)
    let water_f;
    if (!exposed) water_f = e.depth < 0.01 ? 0.7 : 1.0;
    else water_f = lerp(0.45, 0.2, smoothstep(0, 1800, e.exposedFor));
    const light = e.sunUp ? 0.9 : 1.0;
    const season = env.season === 'winter' ? 0.6 : 1.0;
    const heat = exposed && (env.sunElevation ?? 0) > 50 ? 0.5 : 1.0;
    e.activityEnv = water_f * light * season * heat;
    // ── threat: visual looming, vibration, game alert, explicit flee — integrated as ONE cue (max) [D]
    const th = this.threat;
    let sVis = 0, sVib = 0;
    if (env.player) {
      const d = Math.hypot(env.player.x - pos.x, env.player.z - pos.z);
      if (this.prevPlayerDist !== null && dt > 0) {
        th.approach = damp(th.approach, (this.prevPlayerDist - d) / dt, 4, dt);
        this.playerSpeed = damp(this.playerSpeed, this.prevPlayerPos.distanceTo(env.player) / dt, 4, dt);
      }
      this.prevPlayerDist = d;
      this.prevPlayerPos.copy(env.player);
      const R = env.tank ? 0.0 : 2.2;
      if (R > 0) {
        sVis = Math.pow(clamp((R - d) / R, 0, 1), 1.2) * (0.55 + 0.9 * clamp(th.approach / 0.6, 0, 1));
        sVib = clamp((this.playerSpeed - 1.8) / 2, 0, 1) * clamp((5 - d) / 5, 0, 1);
      }
      if (sVis > 0.05) th.pos.copy(env.player);
    }
    th.ext = Math.max(0, th.ext - dt * 0.12);
    const sAlert = (env.alert ?? 0) * 0.55;
    let S = Math.max(sVis, sVib, sAlert, th.ext);
    if (th.ext > S - 1e-3 && th.ext > 0) th.pos.copy(th.extPos);
    S *= lerp(1.3, 0.75, this.personality.boldness);
    th.level = S;
    th.has = S > 0.08;
    // fear follows the stimulus up quickly, decays slowly (bold individuals recover faster)
    const I = this.internal;
    if (S > I.fear) I.fear = damp(I.fear, S, 6, dt);
    else I.fear = damp(I.fear, S, 1 / lerp(22, 7, this.personality.boldness), dt);
  }

  // ── internal dynamics ──────────────────────────────────────────────────────────────────────
  metabolize(dt) {
    const I = this.internal, P = this.personality, crab = this.crab;
    const moving = Math.abs(crab.loco.speed) > 0.2;
    I.hunger = clamp(I.hunger + (dt / 900) * (0.6 + 0.4 * I.activity) * P.appetite, 0, 1);
    I.energy = clamp(I.energy + dt * (moving ? -0.0035 : this.state === STATE.REST ? 0.012 : 0.003), 0, 1);
    I.curiosity = clamp(I.curiosity + ((P.exploration - I.curiosity) / 90) * dt + 0.02 * fbm1(this.time * 0.05, crab.seed) * dt, 0, 1);
    const rhythm = 0.85 + 0.3 * fbm1(this.time / 600, crab.seed + 9);
    I.activity = clamp(this.envInfo.activityEnv * (0.7 + 0.3 * I.energy) * rhythm, 0, 1);
  }

  // ── main update ────────────────────────────────────────────────────────────────────────────
  update(dt, env) {
    this.time += dt;
    this.stateTime += dt;
    this.subTime += dt;
    if (this.suggestion && this.time > this.suggestion.until) this.suggestion = null;
    this.lastEnv = env;
    this.perceive(dt, env);
    this.metabolize(dt);
    if (this.state === STATE.GUARDED) { this.run(dt, env); return this.cmd; }
    const I = this.internal;
    const fear = I.fear, S = this.threat.level;
    // ── reflex layer ──
    const hideT = 0.68;
    if (S > hideT && this.state !== STATE.HIDE_IN_SHELL && !(this.state === STATE.SHELL_CHANGE && this.sub !== 'inspect')) {
      this.enter(STATE.HIDE_IN_SHELL, env);
    } else if (CALM.has(this.state) && fear > 0.32 && this.state !== STATE.SHELL_CHANGE) {
      this.enter(fear > 0.5 ? STATE.RETREAT : STATE.THREAT_ALERT, env);
    }
    // ── periodic re-decision for interruptible activities ──
    this.tickTimer -= dt;
    const tickEvery = (env.lod ?? 1) >= 2 ? 0.5 : 0.15;
    if (this.tickTimer <= 0) {
      this.tickTimer = tickEvery;
      if (this.stateDone() || (CALM.has(this.state) && this.interruptible() && this.rng.chance(0.08))) this.choose(env);
    }
    this.run(dt, env);
    if (this.crab.loco.climbing > 0.6 && this.rng.chance(dt * 0.2)) this.emit('climb');
    return this.cmd;
  }

  interruptible() {
    return this.state === STATE.IDLE || this.state === STATE.EXPLORE || this.state === STATE.REST || (this.state === STATE.FORAGE && this.stateTime > 4);
  }

  stateDone() {
    return this.data.done || this.stateTime > this.stateDur;
  }

  /** utility-based choice among calm activities */
  choose(env) {
    const I = this.internal, P = this.personality, e = this.envInfo;
    // withdrawal ends only through EMERGE (run); emergence and shell exchange end when their sequence is done
    if (this.state === STATE.HIDE_IN_SHELL || this.state === STATE.GUARDED) return;
    if (this.state === STATE.MATE_GUARD && !this.stateDone()) return;
    if ((this.state === STATE.EMERGE || this.state === STATE.SHELL_CHANGE) && !this.data.done && this.stateTime < this.stateDur) return;
    if (this.state === STATE.THREAT_ALERT || this.state === STATE.RETREAT) {
      if (!this.stateDone()) return;
      if (I.fear > 0.45) { this.enter(STATE.HIDE_IN_SHELL, env); return; }
    }
    const crab = this.crab;
    const world = crab.world;
    const pos = crab.loco.position;
    const SL = crab.SL;
    const calm = 1 - smoothstep(0.1, 0.4, I.fear);
    // detections
    const smellR = e.exposed ? 6 * SL : 90 * SL; // odour travels in water, barely in air
    const foods = world ? world.nearbyFood(pos, smellR) : [];
    const food = foods.find((f) => f.food.amount > 0.05);
    const shells = world ? world.nearbyShells(pos, 24 * SL) : [];
    const shell = shells.find((s) => !s.entry.handledBy && (!s.entry.rejectedBy.has(crab.id) || this.time - s.entry.rejectedBy.get(crab.id) > 240));
    const seekWater = e.exposed && (e.distToWater ?? 99) < 3 ? 0.55 : 0;
    const mate = this.findMate();
    const sub = SUBSTRATE_FOOD[e.substrate] ?? 0.6;
    const sug = this.suggestion?.kind;
    const scores = {
      [STATE.REST]: 0.2 + 0.6 * (1 - I.activity) + 0.45 * (1 - I.energy) + (e.exposed && !seekWater ? 0.35 : 0) + (sug === 'rest' ? 0.4 : 0),
      [STATE.IDLE]: 0.3,
      [STATE.EXPLORE]: (I.activity * (0.3 + 0.6 * I.curiosity) + seekWater + (sug === 'wander' || sug === 'moveTo' ? 0.45 : 0)) * calm,
      [STATE.FORAGE]: (I.activity * I.hunger * sub * 1.35 * (e.exposed ? lerp(0.6, 0.15, smoothstep(0, 900, e.exposedFor)) : 1) + (sug === 'forage' ? 0.4 : 0)) * calm,
      [STATE.FEED]: food ? (0.45 + 1.2 * I.hunger) * calm * (1 - smoothstep(0, smellR, food.d) * 0.5) : 0,
      [STATE.SHELL_INSPECT]: shell ? (0.2 + 1.3 * (1 - I.shellSatisfaction)) * (0.6 + 0.4 * I.curiosity) * calm : 0,
      [STATE.INVESTIGATE]: 0,
      [STATE.MATE_GUARD]: mate ? (0.55 + 0.75 * I.activity) * calm * (1 - 0.4 * I.hunger) : 0,
    };
    // first contact with a neighbour or a novel object: brief investigation
    const nb = world ? world.neighbors(pos, 4 * SL, crab) : [];
    if (nb.length && this.rng.chance(0.5)) scores[STATE.INVESTIGATE] = 0.35 * I.curiosity * calm;
    let best = STATE.IDLE, bs = -Infinity;
    for (const [st, sc] of Object.entries(scores)) {
      const v = sc + this.rng.next() * 0.15 + (st === this.state && !this.stateDone() ? 0.12 : 0) - (st === this.state && this.stateDone() ? 0.1 : 0);
      if (v > bs) { bs = v; best = st; }
    }
    if (best === STATE.FEED) this.data.next = { food: food.food };
    else if (best === STATE.SHELL_INSPECT) this.data.next = { entry: shell.entry };
    else if (best === STATE.INVESTIGATE) this.data.next = { other: nb[0].crab };
    else if (best === STATE.MATE_GUARD) this.data.next = { female: mate };
    else this.data.next = {};
    this.enter(best, env, this.data.next);
  }

  enter(state, env, extra = {}) {
    const prev = this.state;
    // release anything we were handling
    if (prev === STATE.SHELL_INSPECT && this.data.entry && state !== STATE.SHELL_CHANGE) this.releaseInspected();
    if (prev === STATE.FEED && this.data.food) this.data.food.claimedBy?.delete(this.crab.id);
    if (prev === STATE.SHELL_CHANGE && this.sub !== 'done') this.crab.abortShellChange?.();
    if (prev === STATE.MATE_GUARD) {
      const f = this.crab.partner;
      if (f && f.guardedBy === this.crab) f.releaseFromGuard();
      this.guardCooldownUntil = this.time + this.rng.range(30, 90);
    }
    this.state = state;
    this.stateTime = 0;
    this.sub = '';
    this.subTime = 0;
    this.data = { ...extra };
    const r = this.rng, SL = this.crab.SL, I = this.internal, P = this.personality;
    switch (state) {
      case STATE.IDLE: this.stateDur = r.wait(3.5, 0.5); break;
      case STATE.REST: this.stateDur = Math.min(120, r.wait(25, 0.7)); break;
      case STATE.EXPLORE: this.stateDur = r.wait(14, 0.5); this.pickWaypoint(env); break;
      case STATE.FORAGE: this.stateDur = r.wait(20, 0.5); this.data.scoop = 0; this.data.side = r.chance(0.65) ? 'L' : 'R'; this.pickWaypoint(env, 2.5); break;
      case STATE.FEED: this.stateDur = 60; this.sub = 'approach'; this.data.bites = 0; this.data.food?.claimedBy?.add(this.crab.id); break;
      case STATE.INVESTIGATE: this.stateDur = r.wait(4, 0.4); break;
      case STATE.THREAT_ALERT: this.stateDur = lerp(1, 4, I.fear) * r.range(0.8, 1.3); break;
      case STATE.RETREAT: this.stateDur = r.range(1.2, 2.6); break;
      case STATE.HIDE_IN_SHELL: {
        // hiding time: log-normal, median by boldness; 2.6–70 s range [G: P. bernhardus]
        const med = lerp(26, 5, P.boldness);
        this.stateDur = clamp(r.wait(med, 0.55), 2.6, 70);
        break;
      }
      case STATE.EMERGE: this.stateDur = 12; this.data.hesitate = r.range(0.3, 1.6); this.sub = 'peek'; break;
      case STATE.SHELL_INSPECT: this.stateDur = 40; this.sub = 'approach'; this.data.acts = 0;
        if (this.data.entry) this.data.entry.handledBy = this.crab;
        break;
      case STATE.SHELL_CHANGE: this.stateDur = 15; this.sub = 'exit'; this.crab.beginShellChange(this.data.entry); break;
      // guarding lasts days in the field [D]; compressed for the game [S]
      case STATE.MATE_GUARD: this.stateDur = r.range(150, 320); this.sub = 'approach'; this.data.jerkAt = r.wait(10, 0.6); break;
      case STATE.GUARDED: this.stateDur = Infinity; break;
      default: this.stateDur = 3;
    }
    if (EVENT_OF[state]) this.emit(EVENT_OF[state]);
  }

  releaseInspected() {
    const entry = this.data.entry;
    if (entry && entry.handledBy === this.crab) entry.handledBy = null;
  }

  /** exploration waypoint: turn alternation (≈78 % alternating turns [D]), water seeking, home bias */
  pickWaypoint(env, scale = 1) {
    const crab = this.crab, SL = crab.SL, r = this.rng, e = this.envInfo;
    const pos = crab.loco.position;
    const sign = r.chance(0.78) ? -this.lastTurn : this.lastTurn;
    this.lastTurn = sign;
    let ang = crab.loco.heading + sign * r.range(0.25, 1.1);
    let dist = r.range(3, 11) * SL * scale;
    if (e.exposed && env.waterAt) {
      // walk toward the deepest nearby water (pools, runnels)
      let best = -Infinity;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = pos.x + Math.sin(a) * 12 * SL, z = pos.z + Math.cos(a) * 12 * SL;
        const d = env.waterAt(x, z) - env.groundAt(x, z);
        if (d > best) { best = d; ang = a; }
      }
      dist = 12 * SL;
    }
    const home = crab.home;
    if (home && Math.hypot(home.x - pos.x, home.z - pos.z) > 1.6) ang = Math.atan2(home.x - pos.x, home.z - pos.z) + r.range(-0.5, 0.5);
    if (this.suggestion?.target && (this.suggestion.kind === 'wander' || this.suggestion.kind === 'moveTo')) {
      ang = Math.atan2(this.suggestion.target.x - pos.x, this.suggestion.target.z - pos.z);
      dist = Math.min(dist * 1.5, Math.hypot(this.suggestion.target.x - pos.x, this.suggestion.target.z - pos.z));
    }
    // aggregation: sociable individuals drift toward neighbours
    const nb = crab.world ? crab.world.neighbors(pos, 30 * SL, crab) : [];
    if (nb.length && r.chance(this.personality.sociality * 0.5)) {
      const o = nb[Math.floor(r.next() * nb.length)].crab.loco.position;
      ang = lerp(ang, Math.atan2(o.x - pos.x, o.z - pos.z), 0.5);
    }
    this.moveTarget.set(pos.x + Math.sin(ang) * dist, 0, pos.z + Math.cos(ang) * dist);
  }

  // ── per-state behaviour → command ──────────────────────────────────────────────────────────
  run(dt, env) {
    const crab = this.crab, SL = crab.SL, I = this.internal, r = this.rng;
    const L = this.cmd.loco, A = this.cmd.anim;
    // defaults
    L.moveTarget = null; L.speed = 1.4; L.posture = 'stand'; L.freeze = false; L.legsActive = true; L.backward = false; L.urgent = false; L.shuffle = false; L.face = null; L.heightScale = 1;
    A.retract = 0; A.urgent = false; A.attention.length = 0; A.sniff = 0.15; A.explore = 0.45; A.chelaR = { mode: 'rest' }; A.chelaL = { mode: 'rest' }; A.mouth = 0; A.alert = 0; A.lean = 0;
    A.restless = false;
    const pos = crab.loco.position;
    if (this.threat.has) A.attention.push({ pos: this.threat.pos, w: clamp(this.threat.level * 1.5, 0, 1), kind: 'threat' });
    // weak tracking of a nearby player and of walking neighbours, also when they pose no threat [S]
    else if (env.player) {
      const dp = Math.hypot(env.player.x - pos.x, env.player.z - pos.z);
      if (dp < 1.5) A.attention.push({ pos: env.player, w: 0.3 * (1 - dp / 1.5), kind: 'player' });
    }
    if (crab.world && (crab.frame & 7) === 0) {
      let best = null, bs = 0;
      for (const { crab: o, d } of crab.world.neighbors(pos, 12 * SL, crab)) {
        const s = Math.abs(o.loco.speed) * (1 - d / (12 * SL));
        if (s > bs) { bs = s; best = o; }
      }
      this.data.mover = bs > 0.3 ? best : null;
    }
    if (this.data.mover?.active) A.attention.push({ pos: this.data.mover.loco.position, w: 0.45, kind: 'object' });
    switch (this.state) {
      case STATE.IDLE: {
        L.shuffle = r.chance(dt * 0.2);
        A.explore = 0.4 + 0.3 * I.curiosity;
        if (!this.data.look || r.chance(dt * 0.4)) {
          this.data.look = new THREE.Vector3(pos.x + (r.next() - 0.5) * 10 * SL, pos.y, pos.z + (r.next() - 0.3) * 10 * SL);
        }
        A.attention.push({ pos: this.data.look, w: 0.4, kind: 'object' });
        break;
      }
      case STATE.REST: {
        L.posture = 'rest';
        A.explore = 0.15; A.sniff = 0.08;
        L.shuffle = r.chance(dt * 0.05);
        break;
      }
      case STATE.EXPLORE: {
        L.moveTarget = this.moveTarget;
        L.speed = lerp(1.0, 1.9, I.activity) * (this.envInfo.exposed ? 0.8 : 1);
        A.explore = 0.85; A.sniff = 0.3;
        if (Math.hypot(this.moveTarget.x - pos.x, this.moveTarget.z - pos.z) < 0.8 * SL || crab.loco.stuck > 0.6) {
          // stop-and-go bouts: continue (60 %) or pause
          if (r.chance(0.6)) this.pickWaypoint(env);
          else this.data.done = true;
        }
        break;
      }
      case STATE.FORAGE: this.runForage(dt, env); break;
      case STATE.FEED: this.runFeed(dt, env); break;
      case STATE.INVESTIGATE: {
        const o = this.data.other;
        if (!o || !o.active) { this.data.done = true; break; }
        const op = o.loco.position;
        A.attention.push({ pos: op, w: 0.9, kind: 'object' });
        A.explore = 0.9; A.sniff = 0.6;
        const d = Math.hypot(op.x - pos.x, op.z - pos.z);
        if (d > 3.2 * SL) { L.moveTarget = op; L.speed = 0.9; L.arrive = 3 * SL; } else {
          L.face = op;
          A.chelaR = { mode: 'probe', target: _v.copy(op).setY(op.y + 0.3 * SL), pitch: -0.4 };
        }
        break;
      }
      case STATE.THREAT_ALERT: {
        L.freeze = true; L.posture = 'low';
        A.retract = 0.18; A.alert = 1; A.chelaR = { mode: 'alert' }; A.chelaL = { mode: 'alert' };
        A.explore = 0.05; A.sniff = 0.05;
        if (I.fear < 0.18 && this.stateTime > 1) this.data.done = true;
        break;
      }
      case STATE.RETREAT: {
        A.retract = 0.48; A.urgent = true; A.explore = 0;
        const away = _w.set(pos.x - this.threat.pos.x, 0, pos.z - this.threat.pos.z);
        if (away.lengthSq() < 1e-8) away.set(0, 0, -1);
        away.normalize();
        const facing = Math.sin(crab.loco.heading) * away.x + Math.cos(crab.loco.heading) * away.z;
        L.backward = facing < -0.2; // threat in front: back away without turning
        L.moveTarget = this.data.retreatTo ?? (this.data.retreatTo = new THREE.Vector3(pos.x + away.x * 5 * SL, 0, pos.z + away.z * 5 * SL));
        L.speed = 2.6; L.urgent = true; L.posture = 'low';
        break;
      }
      case STATE.HIDE_IN_SHELL: {
        A.retract = 1; A.urgent = this.stateTime < 0.6;
        L.posture = 'rest';
        L.legsActive = crab.animator.ch.legs < 0.35;
        // continued cues prolong hiding [D: hiding time ↑ with visual or chemical cues]
        if (this.threat.level > 0.25) this.stateDur = Math.max(this.stateDur, this.stateTime + 2.5);
        if (this.stateTime > this.stateDur && I.fear < 0.35) this.enter(STATE.EMERGE, env);
        break;
      }
      case STATE.EMERGE: {
        L.posture = 'low';
        L.legsActive = crab.animator.ch.legs < 0.5;
        if (this.sub === 'peek') {
          // antennae and eyes come out first, then a hesitation before the body follows [G, S]
          A.retract = 0.3;
          if (crab.animator.ch.eyes < 0.05) { this.sub = 'look'; this.subTime = 0; }
        } else if (this.sub === 'look') {
          A.retract = 0.3;
          A.explore = 0.3;
          if (this.subTime > this.data.hesitate) { this.sub = 'out'; this.subTime = 0; }
        } else {
          A.retract = 0;
          if (crab.animator.emerged) this.data.done = true;
        }
        if (this.threat.level > 0.4) this.enter(STATE.HIDE_IN_SHELL, env);
        break;
      }
      case STATE.SHELL_INSPECT: this.runInspect(dt, env); break;
      case STATE.SHELL_CHANGE: this.runShellChange(dt, env); break;
      case STATE.MATE_GUARD: this.runGuard(dt, env); break;
      case STATE.GUARDED: {
        // held by the rim of her shell: withdrawn, legs folded, carried along
        L.freeze = true; L.legsActive = false; L.posture = 'rest';
        A.retract = 1; A.explore = 0;
        break;
      }
    }
    // exposed for long: crouch and keep still more (shell resting on the substrate)
    if (this.envInfo.exposed && this.state === STATE.IDLE) L.posture = 'low';
  }

  // ── precopulatory mate guarding ────────────────────────────────────────────────────────────
  /** male in the breeding season: nearest smaller female that is free or held by a male with a smaller major chela */
  findMate() {
    const crab = this.crab, world = crab.world;
    if (crab.sex !== 'm' || !crab.breeding || !world || crab.partner || this.time < this.guardCooldownUntil) return null;
    const mine = crab.morph.chelaR * crab.shieldLength_mm;
    let best = null, bd = Infinity;
    for (const { crab: o, d } of world.neighbors(crab.loco.position, 22 * crab.SL, crab)) {
      if (o.sex !== 'f' || !o.active || o.change || o.shieldLength_mm > crab.shieldLength_mm * 0.98) continue;
      const g = o.guardedBy;
      // contests escalate only against a guard with a smaller major chela [D]
      if (g && g.morph.chelaR * g.shieldLength_mm >= mine * 1.05) continue;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** female: grasped by a guarding male */
  beGuarded(male, env) {
    const crab = this.crab;
    const old = crab.guardedBy;
    if (old && old !== male) { old.partner = null; old.behavior.onLostFemale(); }
    crab.guardedBy = male;
    crab.partner = male;
    male.partner = crab;
    this.enter(STATE.GUARDED, env);
  }

  /** female: let go – stays in her shell a little, then emerges */
  onReleased() {
    if (this.state !== STATE.GUARDED) return;
    this.enter(STATE.HIDE_IN_SHELL, this.lastEnv ?? {});
    this.stateDur = this.rng.range(2.6, 9);
  }

  /** male: the female was taken over by a rival */
  onLostFemale() {
    if (this.state === STATE.MATE_GUARD) { this.data.done = true; this.data.female = null; }
  }

  runGuard(dt, env) {
    const crab = this.crab, SL = crab.SL, r = this.rng;
    const L = this.cmd.loco, A = this.cmd.anim;
    const pos = crab.loco.position;
    const f = this.data.female;
    if (!f || !f.active) { this.data.done = true; return; }
    const fp = f.loco.position;
    A.attention.push({ pos: fp, w: 0.9, kind: 'object' });
    const reachD = (f.shell ? f.shell.radius * 0.6 : SL) + 1.8 * SL;
    const d = Math.hypot(fp.x - pos.x, fp.z - pos.z);
    if (this.sub === 'approach') {
      if (f.guardedBy && f.guardedBy !== crab) { this.sub = 'contest'; this.subTime = 0; return; }
      L.moveTarget = fp; L.speed = 1.8; L.arrive = reachD;
      A.explore = 0.8; A.sniff = 0.7;
      if (d < reachD * 1.1) { this.sub = 'grasp'; this.subTime = 0; }
      else if (this.subTime > 40) this.data.done = true;
    } else if (this.sub === 'contest') {
      // rival and guard raise their major chelae; the larger usually wins [D: decided by major-chela size]
      const g = f.guardedBy;
      if (!g) { this.sub = 'approach'; this.subTime = 0; return; }
      L.moveTarget = fp; L.speed = 1.2; L.arrive = reachD * 1.4; L.face = g.loco.position;
      A.alert = 1; A.chelaR = { mode: 'alert' };
      A.attention.push({ pos: g.loco.position, w: 1, kind: 'threat' });
      if (this.subTime > 2.2) {
        const mine = crab.morph.chelaR * crab.shieldLength_mm, theirs = g.morph.chelaR * g.shieldLength_mm;
        const pWin = 1 / (1 + Math.exp(-(mine / theirs - 1) * 14));
        this.emit('male_contest');
        if (r.chance(pWin)) { g.behavior.onLostFemale(); f.releaseFromGuard(); this.sub = 'grasp'; this.subTime = 0; }
        else { this.data.done = true; this.guardCooldownUntil = this.time + 60; }
      }
    } else if (this.sub === 'grasp') {
      if (f.guardedBy && f.guardedBy !== crab) { this.sub = 'contest'; this.subTime = 0; return; }
      L.face = fp;
      // the minor (left) chela takes the rim of her aperture [D]
      A.chelaL = { mode: 'reach', target: f.gripPointWorld(pos, _v), pitch: -0.55, gape: this.subTime < 0.6 ? 0.45 : 0.0 };
      if (this.subTime > 0.9) {
        f.behavior.beGuarded(crab, env);
        this.sub = 'guard'; this.subTime = 0;
        this.emit('mate_guard');
      }
    } else {
      // carrying her in front on the left; slow walks between pauses
      if (crab.partner !== f) { this.data.done = true; return; }
      if (this.subTime > (this.data.walkFor ?? 0)) { this.pickWaypoint(env, 0.6); this.data.walkFor = r.range(4, 12); this.subTime = 0; }
      L.moveTarget = this.moveTarget; L.speed = 0.9;
      // shaking bouts: the male jerks the female's shell to and fro [G: P. filholi]
      let jerk = 0;
      if (this.stateTime > this.data.jerkAt) {
        jerk = Math.sin((this.stateTime - this.data.jerkAt) * Math.PI * 2 * 4.5);
        if (this.stateTime > this.data.jerkAt + 0.8) this.data.jerkAt = this.stateTime + r.wait(12, 0.6);
      }
      const carry = _w.set(0.8, -0.34 + 0.22 * jerk, 2.0).applyMatrix4(crab.loco.bodyMatrix);
      A.chelaL = { mode: 'reach', target: carry, pitch: -0.4, gape: 0.0, fast: jerk !== 0 };
      // a rival close by: raise the major chela at him
      const rival = crab.world?.neighbors(pos, 6 * SL, crab).find((n) => n.crab.sex === 'm' && n.crab !== f);
      if (rival) { A.chelaR = { mode: 'alert' }; A.alert = 0.6; A.attention.push({ pos: rival.crab.loco.position, w: 1, kind: 'threat' }); }
      if (this.stateTime > this.stateDur) this.data.done = true;
    }
  }

  runForage(dt, env) {
    const crab = this.crab, SL = crab.SL, r = this.rng, I = this.internal;
    const L = this.cmd.loco, A = this.cmd.anim;
    const pos = crab.loco.position;
    A.explore = 0.35; A.sniff = 0.4;
    // slow stop-and-go over the surface
    if (this.subTime > (this.data.walkFor ?? 0) && this.sub !== 'scoop') {
      this.sub = 'scoop'; this.subTime = 0; this.data.phase = 'reach';
      this.data.side = r.chance(0.65) ? 'L' : 'R'; // minor chela more often [S]
      // scoop point on the substrate in front of the chosen chela
      const s = this.data.side === 'L' ? 1 : -1;
      _v.set(s * 0.45, 0, 1.75).multiplyScalar(SL);
      const h = crab.loco.heading;
      this.data.pt = new THREE.Vector3(pos.x + Math.cos(h) * _v.x + Math.sin(h) * _v.z, 0, pos.z - Math.sin(h) * _v.x + Math.cos(h) * _v.z);
      this.data.pt.y = env.groundAt(this.data.pt.x, this.data.pt.z) + 0.03 * SL;
    }
    if (this.sub === 'scoop') {
      const side = this.data.side;
      const key = side === 'L' ? 'chelaL' : 'chelaR';
      const ph = this.data.phase;
      if (ph === 'reach') { A[key] = { mode: 'reach', target: this.data.pt, pitch: -1.05, gape: 0.35 }; if (this.subTime > 0.55) { this.data.phase = 'grab'; this.subTime = 0; } }
      else if (ph === 'grab') { A[key] = { mode: 'reach', target: this.data.pt, pitch: -1.05, gape: 0.0 }; if (this.subTime > 0.25) { this.data.phase = 'lift'; this.subTime = 0; } }
      else if (ph === 'lift') { A[key] = { mode: 'toMouth', gape: 0.0 }; A.mouth = 0.6; if (this.subTime > 0.5) { this.data.phase = 'transfer'; this.subTime = 0; } }
      else { A[key] = { mode: 'toMouth', gape: 0.15 }; A.mouth = 1; if (this.subTime > r.range(0.4, 0.9)) {
        const q = SUBSTRATE_FOOD[this.envInfo.substrate] ?? 0.6;
        I.hunger = clamp(I.hunger - 0.012 * q, 0, 1);
        this.data.scoop++;
        this.sub = 'walk'; this.subTime = 0; this.data.walkFor = r.chance(0.5) ? 0 : r.range(0.6, 2.5);
        if (r.chance(0.35)) this.pickWaypoint(env, 0.3);
      } }
      L.freeze = true;
    } else {
      L.moveTarget = this.moveTarget; L.speed = 0.45; L.arrive = 0.5 * SL;
    }
    if (I.hunger < 0.12) this.data.done = true;
  }

  runFeed(dt, env) {
    const crab = this.crab, SL = crab.SL, r = this.rng, I = this.internal;
    const L = this.cmd.loco, A = this.cmd.anim;
    const f = this.data.food;
    if (!f || f.amount <= 0.02) { this.data.done = true; return; }
    const pos = crab.loco.position;
    const d = Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z);
    A.attention.push({ pos: f.pos, w: 1, kind: 'food' });
    A.sniff = 0.9; A.explore = 0.7;
    if (this.sub === 'approach') {
      // odour-guided approach: in water the antennules "sniff" hard; final approach slows down
      L.moveTarget = f.pos; L.speed = d > 8 * SL ? 1.8 : 1.0; L.arrive = 2.0 * SL;
      if (d < 2.4 * SL) { this.sub = 'pick'; this.subTime = 0; this.data.side = r.chance(0.55) ? 'R' : 'L'; this.emit('antennule_flick'); }
      if (this.stateTime > 40) this.data.done = true;
      return;
    }
    L.face = f.pos;
    L.freeze = d < 2.8 * SL;
    if (d > 3.2 * SL) { this.sub = 'approach'; return; }
    const key = this.data.side === 'L' ? 'chelaL' : 'chelaR';
    if (this.sub === 'pick') {
      A[key] = { mode: 'reach', target: _v.copy(f.pos).setY(f.pos.y + f.size * 0.2), pitch: -0.95, gape: this.subTime < 0.4 ? 0.4 : 0.0 };
      if (this.subTime > 0.65) {
        const got = crab.world.biteFood(f, r.range(0.05, 0.11));
        I.hunger = clamp(I.hunger - got * 0.35, 0, 1);
        crab.holdMorsel(this.data.side, f);
        this.sub = 'toMouth'; this.subTime = 0;
      }
    } else if (this.sub === 'toMouth') {
      A[key] = { mode: 'toMouth', gape: 0.0 };
      A.mouth = 0.5;
      if (this.subTime > 0.55) { this.sub = 'chew'; this.subTime = 0; this.data.chew = r.range(1.0, 2.6); }
    } else if (this.sub === 'chew') {
      // third maxillipeds work the morsel; the chela stays at the mouth
      A[key] = { mode: 'toMouth', gape: 0.08 };
      A.mouth = 1;
      if (this.subTime > this.data.chew) {
        crab.holdMorsel(null);
        this.data.bites++;
        if (I.hunger < 0.15 || this.data.bites > 7) this.data.done = true;
        else { this.sub = 'pick'; this.subTime = 0; this.data.side = r.chance(0.5) ? 'R' : 'L'; }
      }
    }
  }

  runInspect(dt, env) {
    const crab = this.crab, SL = crab.SL, r = this.rng, I = this.internal;
    const L = this.cmd.loco, A = this.cmd.anim;
    const entry = this.data.entry;
    if (!entry || !entry.free) { this.data.done = true; return; }
    const sp = entry.pos;
    const pos = crab.loco.position;
    const d = Math.hypot(sp.x - pos.x, sp.z - pos.z);
    A.attention.push({ pos: sp, w: 1, kind: 'object' });
    A.explore = 0.9; A.sniff = 0.5;
    const previouslyRejected = entry.rejectedBy.has(crab.id);
    const poorShell = 1 - I.shellSatisfaction;
    switch (this.sub) {
      case 'approach':
        L.moveTarget = sp; L.speed = 1.3 + 0.8 * poorShell; L.arrive = (entry.shell.radius / SL * 0.6 + 1.6) * SL;
        if (d < L.arrive * 1.15 || crab.loco.stuck > 0.7) { this.sub = 'touch'; this.subTime = 0; }
        if (this.stateTime > 25) this.data.done = true;
        break;
      case 'touch':
        // antennae and chelae run over the outer surface
        L.face = sp; L.freeze = true;
        A.chelaR = { mode: 'probe', target: _v.copy(sp).setY(sp.y + entry.shell.radius * 0.4), pitch: -0.6 };
        A.chelaL = { mode: 'probe', target: _w.copy(sp).setY(sp.y + entry.shell.radius * 0.2), pitch: -0.7 };
        if (this.subTime > (previouslyRejected ? 0.4 : r.range(0.6, 1.4))) { this.sub = 'rotate'; this.subTime = 0; crab.beginHandlingShell(entry); }
        break;
      case 'rotate':
        // the walking legs and chelae roll the shell until its aperture faces the crab
        L.face = sp; L.freeze = true; L.shuffle = r.chance(dt * 2);
        A.chelaR = { mode: 'hold', target: sp };
        A.chelaL = { mode: 'probe', target: _w.copy(sp).setY(sp.y + entry.shell.radius * 0.3), pitch: -0.5 };
        crab.handleShell(entry, smoothstep(0, 1.6, this.subTime));
        if (this.subTime > 1.7) { this.sub = 'probe'; this.subTime = 0; this.data.actDur = r.range(0.6, 1.4); }
        break;
      case 'probe': {
        // aperture exploration: the MAJOR cheliped is inserted (housed crabs keep the minor out) [G]
        L.face = sp; L.freeze = true;
        crab.handleShell(entry, 1);
        const seat = crab.handledSeatWorld(entry, _v);
        A.chelaR = { mode: 'probe', target: seat, pitch: -0.25 };
        if (this.subTime > this.data.actDur) {
          this.data.acts++;
          // hesitation: more aperture acts when the decision is close or the current shell is poor [G]
          const more = previouslyRejected ? 0 : Math.round(poorShell * 3);
          if (this.data.acts <= more && r.chance(0.6)) { this.subTime = 0; this.data.actDur = r.range(0.5, 1.2); }
          else { this.sub = 'evaluate'; this.subTime = 0; }
        }
        break;
      }
      case 'evaluate': {
        L.freeze = true;
        crab.handleShell(entry, 1);
        const cand = evaluateShell(crab.shellNeeds(), entry.shell.props).score + (r.next() - 0.5) * 0.08;
        const margin = 0.05;
        if (cand > I.shellSatisfaction + margin) {
          this.enter(STATE.SHELL_CHANGE, env, { entry, candScore: cand, oldScore: I.shellSatisfaction });
        } else {
          entry.rejectedBy.set(crab.id, this.time);
          crab.endHandlingShell(entry, true);
          this.releaseInspected();
          this.emit('shell_reject');
          this.data.done = true;
        }
        break;
      }
    }
  }

  runShellChange(dt, env) {
    const crab = this.crab, I = this.internal;
    const L = this.cmd.loco, A = this.cmd.anim;
    const speedUp = this.threat.level > 0.3 ? 2 : 1; // exposed abdomen: hurry if disturbed
    const res = crab.stepShellChange(dt * speedUp, L, A);
    this.sub = res.phase;
    if (res.phase === 'done') {
      I.shellSatisfaction = res.score;
      // "try-on": a worse fit than the old shell makes it go back for the old one [S]
      if (res.score < this.data.oldScore - 0.06 && res.oldEntry) {
        this.enter(STATE.SHELL_INSPECT, env, { entry: res.oldEntry });
      } else this.data.done = true;
    }
  }

  snapshot() {
    return { state: this.state, sub: this.sub, ...this.internal, threat: this.threat.level, personality: this.personality, env: this.envInfo };
  }
}

export { wrapAngle };
