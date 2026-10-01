// Behaviour-ecology AI for ヒメハゼ: utility scoring selects a state; each state is a small scripted
// sequence that outputs a MotorCommand for HimehazeAnimator and moves the fish over the substrate.
//
// Evidence tags used in comments: F = literature, P = photo/video judgement, R = related species,
// G = game assumption. Randomness is a seeded per-individual RNG used for variability *within* a
// biologically structured decision, never for direction-less wandering.
import * as THREE from 'three';

export const STATES = {
  IDLE_BOTTOM: 'IDLE_BOTTOM', SCAN: 'SCAN', CRAWL: 'CRAWL', SHORT_SWIM: 'SHORT_SWIM',
  FREEZE: 'FREEZE', BURST_ESCAPE: 'BURST_ESCAPE', BURY: 'BURY', FORAGE: 'FORAGE', REST: 'REST',
  COURTSHIP: 'COURTSHIP', TERRITORIAL: 'TERRITORIAL',
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const damp = (c, t, l, dt) => c + (t - c) * (1 - Math.exp(-l * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const V = () => new THREE.Vector3();
const _v = V(), _v2 = V(), _gs = V(), _up = new THREE.Vector3(0, 1, 0);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Prey preference by fish size (F: Korean stomach-content study – small fish (1-2 cm) mostly gammarid
// amphipods, polychaetes, copepods; with growth polychaetes & crabs increase and copepods decrease).
export function preyPreference(TLm) {
  const cm = TLm * 100;
  const big = clamp((cm - 3) / 5, 0, 1);
  return {
    copepod: 1.0 - 0.7 * big,
    amphipod: 0.9,
    polychaete: 0.4 + 0.6 * big,
    crab: 0.05 + 0.5 * big,
    mysid: 0.5,          // F (environment-dependent use of mysids / small shrimps reported)
  };
}

export class HimehazeBehavior {
  /**
   * @param {Himehaze} fish
   * @param {object} world  see README "World interface"
   */
  constructor(fish, world, opts = {}) {
    this.fish = fish;
    this.world = world;
    this.rng = mulberry(fish.variation.seed * 7 + 1);
    const r = this.rng;
    // internal drives 0..1
    this.hunger = 0.3 + r() * 0.4;
    this.fear = 0;
    this.energy = 0.7 + r() * 0.3;
    this.curiosity = 0.2 + r() * 0.3;
    this.territoriality = fish.variation.male ? 0.4 + r() * 0.3 : 0.1;
    this.breedingDrive = fish.variation.male && fish.variation.breeding ? 0.6 + r() * 0.3 : 0;
    this.boldness = 0.3 + r() * 0.5;   // personality (G)

    // kinematic state
    this.pos = fish.position.clone();
    this.heading = opts.heading ?? r() * Math.PI * 2;  // yaw around world Y
    this.vel = V();
    this.altitude = 0;           // metres above contact height
    this.buried = 0;             // 0..1 depth into sand (eyes stay exposed)
    this.up = new THREE.Vector3(0, 1, 0);
    this.home = opts.home ? opts.home.clone() : this.pos.clone();  // nest / home range centre
    this.nest = opts.nest || null;

    this.state = STATES.IDLE_BOTTOM;
    this.stateT = 0;
    this.stateDur = 2;
    this.sub = {};
    this.cmd = { gait: 'idle', thrust: 0.5, turn: 0, finErect: 0.6, pectoral: 'flutter', gaze: null };
    this.target = null;
    this.debug = '';
    this.threat = null;
    this.lastThreatDist = Infinity;
    this.ray = new THREE.Raycaster();
    this.ray.far = 2;
    this.ground = { y: 0, normal: new THREE.Vector3(0, 1, 0) };
    this._groundSample(this.pos);
    this.pos.y = this.ground.y + fish.contactOffset;
  }

  // ---------------------------------------------------------------- perception
  // Three downward rays (head, pelvic disc, tail). Height = highest supporting point so ripple crests
  // under the head/tail never intersect the body; normal = centre normal tilted by the head–tail slope.
  _groundSample(p) {
    const L = this.fish.TL * 0.28;
    const fx = Math.cos(this.heading), fz = -Math.sin(this.heading);
    const c = this.world.raycastGround(this.ray, p);
    if (!c) return this.ground;
    const h = this.world.raycastGround(this.ray, _gs.set(p.x + fx * L, p.y, p.z + fz * L));
    const t = this.world.raycastGround(this.ray, _gs.set(p.x - fx * L * 1.6, p.y, p.z - fz * L * 1.6));
    const yh = h ? h.point.y : c.point.y, yt = t ? t.point.y : c.point.y;
    // body is rigid-ish over this span: the lowest belly point sits at the support line
    const support = Math.max(c.point.y, (yh + yt) / 2);
    this.ground.y = support;
    const slope = (yh - yt) / (L * 2.6);
    this.ground.normal.copy(c.normal).addScaledVector(_gs.set(fx, 0, fz), -slope).normalize();
    return this.ground;
  }

  perceive() {
    const w = this.world, p = this.pos, TL = this.fish.TL;
    const fwd = _v.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const P = {};
    // threats: predators and the player/camera. Approach speed matters more than distance (R: looming).
    let threat = null, tLevel = 0;
    for (const pr of w.predators) {
      const d = pr.position.distanceTo(p);
      const lv = clamp(1 - d / (pr.radius || 0.8), 0, 1) * (pr.danger ?? 1);
      if (lv > tLevel) { tLevel = lv; threat = pr.position; }
    }
    if (w.player) {
      const d = w.player.position.distanceTo(p);
      const approach = w.player.velocity ? -w.player.velocity.dot(_v2.copy(p).sub(w.player.position).normalize()) : 0;
      const lv = clamp(1 - d / 0.22, 0, 1) * 0.8 + clamp(-approach * 2, 0, 0.5) * clamp(1 - d / 0.5, 0, 1);
      if (lv > tLevel) { tLevel = lv; threat = w.player.position; }
      P.distanceToPlayer = d;
    }
    P.threatLevel = tLevel * (1.2 - this.boldness * 0.4) * (this.buried > 0.5 ? 0.5 : 1);
    P.threat = threat;
    // food: visual detection in a forward-biased field; small prey detected at shorter range (G/R)
    let best = null, bestScore = 0;
    const pref = preyPreference(TL);
    for (const f of w.food) {
      if (f.eaten) continue;
      const d = f.position.distanceTo(p);
      const range = (f.visible ?? 1) * (0.08 + f.size * 30);   // e.g. 1 mm copepod ≈ 11 cm, 5 mm amphipod ≈ 23 cm
      if (d > range) continue;
      const dir = _v2.copy(f.position).sub(p).setY(0).normalize();
      const ang = Math.acos(clamp(dir.dot(fwd), -1, 1));
      if (ang > 2.4) continue;            // dorsolateral eyes: ~275° horizontal field, blind behind (P/G)
      const gape = TL * 0.06;             // max prey size ~ gape (G)
      if (f.size > gape) continue;
      const sc = (pref[f.type] ?? 0.3) * (1 - d / range) * (f.moving ? 1.3 : 1);
      if (sc > bestScore) { bestScore = sc; best = f; }
    }
    P.food = best; P.distanceToFood = best ? best.position.distanceTo(p) : Infinity;
    // shelter & conspecifics
    let sh = null, shd = Infinity;
    for (const s of w.shelters) { const d = s.position.distanceTo(p); if (d < shd) { shd = d; sh = s; } }
    P.shelter = sh; P.distanceToShelter = shd;
    let cs = null, csd = Infinity;
    for (const o of w.fishes) { if (o === this) continue; const d = o.pos.distanceTo(p); if (d < csd) { csd = d; cs = o; } }
    P.conspecific = cs; P.distanceToConspecific = csd;
    P.distanceToBottom = this.altitude;
    P.waterCurrent = w.current;
    P.timeOfDay = w.timeOfDay;
    P.tideState = w.tide;
    this.P = P;
    return P;
  }

  // ---------------------------------------------------------------- drives
  _updateDrives(dt) {
    const P = this.P;
    const active = this.cmd.gait === 'swim' || this.cmd.gait === 'burst' || this.cmd.gait === 'crawl';
    this.hunger = clamp(this.hunger + dt * 0.006, 0, 1);
    this.energy = clamp(this.energy + dt * (active ? -0.01 : 0.004) * (this.cmd.gait === 'burst' ? 4 : 1), 0, 1);
    // fear rises fast, decays slowly (R: prey-fish alarm dynamics)
    const target = P.threatLevel;
    this.fear = target > this.fear ? damp(this.fear, target, 8, dt) : damp(this.fear, target, 0.25, dt);
    this.curiosity = clamp(this.curiosity + dt * 0.004 - (this.state === STATES.SCAN ? dt * 0.02 : 0), 0, 1);
    // G: diurnal activity assumption (visual predator of benthos). Night → lower activity.
    const tod = this.world.timeOfDay;
    this.daylight = clamp(Math.sin(((tod - 6) / 12) * Math.PI) * 1.5, 0, 1);
  }

  // ---------------------------------------------------------------- decision (utility)
  _decide() {
    const P = this.P, male = this.fish.variation.male;
    const s = {};
    s[STATES.BURST_ESCAPE] = this.fear > 0.55 && P.threat ? 2 + this.fear : 0;
    s[STATES.FREEZE] = this.fear > 0.25 && this.fear <= 0.55 ? 1.2 + this.fear : 0;
    s[STATES.FORAGE] = this.hunger * (P.food ? 1.2 : 0.55) * (0.3 + 0.7 * this.daylight) * (1 - this.fear);
    s[STATES.SCAN] = 0.25 + this.curiosity * 0.5 + (P.distanceToPlayer < 0.6 ? 0.2 : 0);
    s[STATES.IDLE_BOTTOM] = 0.35 + (1 - this.energy) * 0.3;
    s[STATES.CRAWL] = 0.32 + this.curiosity * 0.25 * this.daylight;
    s[STATES.SHORT_SWIM] = 0.1 + this.energy * 0.15 * this.daylight + (this.pos.distanceTo(this.home) > 0.6 ? 0.4 : 0);
    s[STATES.REST] = (1 - this.daylight) * 0.9 + (1 - this.energy) * 0.6;
    // breeding: nest-holding males (F: males build radially ditched nests)
    s[STATES.COURTSHIP] = male && this.nest ? this.breedingDrive * (0.6 + 0.4 * this.daylight) * (1 - this.fear) : 0;
    // male–male: lateral display / chase near nest (R: common in gobiids; not documented for this species)
    s[STATES.TERRITORIAL] = male && P.conspecific && P.conspecific.fish.variation.male && P.distanceToConspecific < 0.12
      ? this.territoriality * (this.nest ? 1.3 : 0.6) : 0;
    // hysteresis: current state gets a small bonus to avoid dithering
    s[this.state] = (s[this.state] || 0) * 1.15;
    // variability: seeded jitter (±10 %)
    let best = STATES.IDLE_BOTTOM, bv = -1;
    for (const [k, val] of Object.entries(s)) { const j = val * (0.9 + this.rng() * 0.2); if (j > bv) { bv = j; best = k; } }
    return best;
  }

  _enter(state) {
    const r = this.rng;
    this.state = state; this.stateT = 0; this.sub = { phase: 0 };
    switch (state) {
      case STATES.IDLE_BOTTOM: this.stateDur = 1.5 + r() * 4; break;
      case STATES.SCAN: this.stateDur = 1.5 + r() * 2.5; this.sub.looks = 0; break;
      case STATES.CRAWL: this.stateDur = 0.6 + r() * 1.5; this.sub.hops = 1 + Math.floor(r() * 3); break;
      case STATES.SHORT_SWIM: this.stateDur = 0.6 + r() * 0.8; break;
      case STATES.FREEZE: this.stateDur = 0.8 + r() * 2.0; break;
      case STATES.BURST_ESCAPE: this.stateDur = 0.35 + r() * 0.25; break;
      case STATES.BURY: this.stateDur = 4 + r() * 6; break;
      case STATES.FORAGE: this.stateDur = 6 + r() * 6; this.sub.step = 'search'; break;
      case STATES.REST: this.stateDur = 6 + r() * 10; break;
      case STATES.COURTSHIP: this.stateDur = 6 + r() * 6; this.sub.step = 'maintain'; break;
      case STATES.TERRITORIAL: this.stateDur = 1.5 + r() * 1.5; break;
    }
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.perceive();
    this._updateDrives(dt);
    this.stateT += dt;

    // interrupts: danger overrides everything except an ongoing escape
    const esc = this.state === STATES.BURST_ESCAPE;
    if (!esc && this.fear > 0.55 && this.P.threat && this.state !== STATES.BURY) this._enter(STATES.BURST_ESCAPE);
    else if (!esc && this.fear > 0.3 && [STATES.IDLE_BOTTOM, STATES.CRAWL, STATES.FORAGE, STATES.SCAN, STATES.REST, STATES.COURTSHIP].includes(this.state) && this.sub.froze !== true) {
      this._enter(STATES.FREEZE); this.sub.froze = true;
    } else if (this.stateT > this.stateDur) this._enter(this._decide());

    const cmd = this.cmd;
    cmd.cstart = 0; cmd.strike = false; cmd.dig = false;
    let desiredSpeed = 0, lift = 0, turnTo = null, turnRate = 3;

    switch (this.state) {
      case STATES.IDLE_BOTTOM: {
        // perched on pelvic disc + pectorals; micro posture corrections; orient into current (R: rheotaxis)
        cmd.gait = 'idle'; cmd.thrust = 0.4; cmd.pectoral = 'flutter'; cmd.finErect = 0.55; cmd.gaze = null;
        const cur = this.world.current;
        if (cur && cur.lengthSq() > 1e-6) turnTo = Math.atan2(cur.z, -cur.x) ;
        turnRate = 0.4;
        break;
      }
      case STATES.SCAN: {
        // eyes first; head/body follow only for larger angles (handled by animator + headDemand)
        cmd.gait = 'idle'; cmd.pectoral = 'brace'; cmd.finErect = 0.85;
        if (!this.sub.pt || this.stateT > this.sub.next) {
          const a = this.heading + (this.rng() * 2 - 1) * 2.0;
          const d = 0.08 + this.rng() * 0.2;
          this.sub.pt = new THREE.Vector3(this.pos.x + Math.cos(a) * d, this.pos.y + 0.01, this.pos.z - Math.sin(a) * d);
          if (this.P.distanceToPlayer < 0.8 && this.rng() < 0.5) this.sub.pt = this.world.player.position.clone();
          this.sub.next = this.stateT + 0.5 + this.rng() * 1.2;
        }
        cmd.gaze = this.sub.pt;
        // body turn only if eyes+head cannot reach (≈ eyes → head → body ordering)
        if (Math.abs(this.fish.animator.headDemand) > 0.25) { turnTo = this.heading + this.fish.animator.headDemand; turnRate = 1.5; }
        break;
      }
      case STATES.CRAWL: {
        // saltatory "scoot": pectoral stroke + 1-2 tail beats → 1-4 cm glide, then stop (P: video)
        const hopT = this.stateT % 0.45;
        const stroking = hopT < 0.16;
        cmd.gait = stroking ? 'crawl' : 'idle'; cmd.thrust = stroking ? 0.8 : 0.3;
        cmd.pectoral = stroking ? 'stroke' : 'brace'; cmd.finErect = 0.6;
        if (!this.sub.dir) this.sub.dir = this._chooseWanderHeading();
        turnTo = this.sub.dir; turnRate = 5;
        desiredSpeed = stroking ? 1.8 * this.fish.TL : 0;
        if (stroking && hopT < 0.02) this.world.sand(this.pos, 0.15, this.heading);
        cmd.gaze = null;
        break;
      }
      case STATES.SHORT_SWIM: {
        cmd.gait = 'swim'; cmd.thrust = 0.8; cmd.pectoral = 'tuck'; cmd.finErect = 0.3;
        if (!this.sub.dir) { this.sub.dir = this._chooseWanderHeading(true); this.world.sand(this.pos, 0.35, this.heading); }
        turnTo = this.sub.dir; turnRate = 4;
        desiredSpeed = 6 * this.fish.TL; lift = 0.012 + 0.01 * Math.sin(Math.min(1, this.stateT / this.stateDur) * Math.PI);
        break;
      }
      case STATES.FREEZE: {
        // motionless except breathing & eyes locked on threat; fins erect a little (alert)
        cmd.gait = 'rest'; cmd.thrust = 0.1; cmd.pectoral = 'brace'; cmd.finErect = 0.9;
        cmd.gaze = this.P.threat;
        if (this.stateT > this.stateDur) this.sub.froze = false;
        break;
      }
      case STATES.BURST_ESCAPE: {
        if (this.stateT < 1e-6 || !this.sub.dir) {
          const th = this.P.threat || this.pos;
          const away = Math.atan2(-(this.pos.z - th.z), this.pos.x - th.x);
          // escape angle variable (R: C-start escape trajectories are unpredictable, ~90-180° away)
          this.sub.dir = away + (this.rng() * 2 - 1) * 0.7;
          const side = Math.sign(wrapAngle(this.sub.dir - this.heading)) || 1;
          cmd.cstart = side;
          this.world.sand(this.pos, 1.0, this.heading);
          this.sub.v0 = 16 * this.fish.TL;    // ~16 BL/s peak (R: small-fish fast-start)
        }
        cmd.gait = 'burst'; cmd.thrust = 1; cmd.pectoral = 'tuck'; cmd.finErect = 0.05; cmd.gaze = null;
        turnTo = this.sub.dir; turnRate = this.stateT < 0.06 ? 60 : 8;
        const k = this.stateT / this.stateDur;
        desiredSpeed = this.sub.v0 * (1 - 0.6 * k);
        lift = 0.015 * Math.sin(Math.min(1, k) * Math.PI);
        if (this.stateT + 1 / 60 >= this.stateDur) {
          // land, then bury/hide or freeze (F: burrows into sand when alarmed)
          this.sub.landed = true;
          this.world.sand(this.pos, 0.8, this.heading);
          this.fear *= 0.8;
          this._enter(this.rng() < 0.55 ? STATES.BURY : STATES.FREEZE);
          if (this.state === STATES.FREEZE) this.sub.froze = true;
        }
        break;
      }
      case STATES.BURY: {
        // body wriggle sinks the fish so only the dorsal head & eyes remain exposed (F: 砂に潜る)
        cmd.gait = 'rest'; cmd.pectoral = 'tuck'; cmd.finErect = 0.0;
        cmd.gaze = this.P.threat;
        if (this.stateT < 0.6) { cmd.dig = true; this.buried = damp(this.buried, 0.85, 4, dt); if (this.rng() < 0.15) this.world.sand(this.pos, 0.2, this.heading); }
        if (this.stateT > this.stateDur - 0.4) { this.buried = damp(this.buried, 0, 8, dt); cmd.dig = true; }
        break;
      }
      case STATES.FORAGE: this._forage(dt, cmd, (s, t, r, l) => { desiredSpeed = s; turnTo = t; turnRate = r; lift = l || 0; }); break;
      case STATES.REST: {
        cmd.gait = 'rest'; cmd.thrust = 0.2; cmd.pectoral = 'rest'; cmd.finErect = 0.2; cmd.gaze = null;
        this.buried = damp(this.buried, 0.3 * (1 - this.daylight), 0.5, dt);   // G: partial burial at night
        break;
      }
      case STATES.COURTSHIP: this._courtship(dt, cmd, (s, t, r, l) => { desiredSpeed = s; turnTo = t; turnRate = r; lift = l || 0; }); break;
      case STATES.TERRITORIAL: {
        // R/G: lateral display with fins erect, gape; brief charge if rival persists
        const o = this.P.conspecific;
        cmd.gait = this.stateT < 1 ? 'hover' : 'crawl'; cmd.thrust = 0.8; cmd.pectoral = 'brace'; cmd.finErect = 1.0;
        if (o) {
          const a = Math.atan2(-(o.pos.z - this.pos.z), o.pos.x - this.pos.x);
          turnTo = this.stateT < 1 ? a + Math.PI / 2 : a;   // present flank, then charge
          turnRate = 3; desiredSpeed = this.stateT < 1 ? 0 : 3 * this.fish.TL;
          cmd.gaze = o.pos;
          if (this.stateT < 1 && Math.sin(this.stateT * 12) > 0.8) cmd.strike = false;
        }
        break;
      }
    }
    if (this.state !== STATES.BURY && this.state !== STATES.REST) this.buried = damp(this.buried, 0, 3, dt);

    // ---- locomotion integration
    if (turnTo !== null) {
      const err = wrapAngle(turnTo - this.heading);
      const rate = clamp(err * turnRate, -turnRate * 1.5, turnRate * 1.5);
      this.heading += rate * dt;
      cmd.turn = rate;
    } else cmd.turn = 0;
    const fwd = _v.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const speed = damp(this.vel.length(), desiredSpeed, desiredSpeed > this.vel.length() ? 20 : 5, dt);
    this.vel.copy(fwd).multiplyScalar(speed);
    // water current drifts a hovering fish; a perched fish holds station with its pelvic disc (R)
    if (this.world.current && this.altitude > 0.003) this.vel.addScaledVector(this.world.current, 0.5);
    this.pos.addScaledVector(this.vel, dt);
    this.world.clampToArena?.(this.pos);

    // ---- bottom following: raycast, contact height & normal alignment
    this._groundSample(this.pos);
    this.altitude = damp(this.altitude, lift, lift > this.altitude ? 10 : 6, dt);
    const buryDepth = this.buried * this.fish.contactOffset * 1.25;
    const targetY = this.ground.y + this.fish.contactOffset - 0.0006 + this.altitude - buryDepth;
    this.pos.y = damp(this.pos.y, targetY, 25, dt);
    if (this.pos.y < this.ground.y + 0.3 * this.fish.contactOffset - buryDepth) this.pos.y = this.ground.y + 0.3 * this.fish.contactOffset - buryDepth;
    // align to substrate normal when on bottom; level when swimming
    const onBottom = clamp(1 - this.altitude / 0.01, 0, 1);
    const n = _v2.copy(_up).lerp(this.ground.normal, onBottom).normalize();
    this.up.lerp(n, 1 - Math.exp(-8 * dt)).normalize();
    this._applyTransform();

    this.fish.animator.update(dt, cmd);
    this.debug = `${this.state}  H${this.hunger.toFixed(2)} F${this.fear.toFixed(2)} E${this.energy.toFixed(2)}`;
  }

  _applyTransform() {
    const f = this.fish;
    f.position.copy(this.pos);
    const fwd = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    // project forward onto plane of up
    fwd.addScaledVector(this.up, -fwd.dot(this.up)).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, this.up).normalize();
    const m = new THREE.Matrix4().makeBasis(fwd, this.up, right);
    f.quaternion.setFromRotationMatrix(m);
  }

  _chooseWanderHeading(far = false) {
    // not random walk: bias toward home range centre, away from other fish, with some exploration
    const toHome = _v2.copy(this.home).sub(this.pos);
    const dHome = toHome.length();
    let a = this.heading + (this.rng() * 2 - 1) * (far ? 1.4 : 0.9);
    if (dHome > 0.25) {
      const h = Math.atan2(-toHome.z, toHome.x);
      a = h + (this.rng() * 2 - 1) * 0.5;
    }
    const cs = this.P.conspecific;
    if (cs && this.P.distanceToConspecific < 0.08) a = Math.atan2(-(this.pos.z - cs.pos.z), this.pos.x - cs.pos.x);
    return a;
  }

  // FORAGE: search (saltatory hop-look) → fixate → approach / lunge → strike (suction) → handle → settle
  _forage(dt, cmd, out) {
    const P = this.P, sub = this.sub, TL = this.fish.TL;
    if (P.food && sub.step === 'search') { sub.step = 'fixate'; sub.prey = P.food; sub.t = 0; }
    sub.t = (sub.t || 0) + dt;
    const prey = sub.prey;
    if (prey && prey.eaten && sub.step !== 'handle') { sub.step = 'search'; sub.prey = null; }
    switch (sub.step) {
      case 'search': {
        cmd.gaze = null; cmd.finErect = 0.6;
        const cyc = sub.t % 1.6;
        if (cyc < 0.18) { cmd.gait = 'crawl'; cmd.pectoral = 'stroke'; out(1.6 * TL, sub.dir ?? (sub.dir = this._chooseWanderHeading()), 5); }
        else { cmd.gait = 'idle'; cmd.pectoral = 'brace'; out(0, null, 0); if (cyc > 1.55) sub.dir = this._chooseWanderHeading(); }
        break;
      }
      case 'fixate': {
        // eyes lock on; head turns; body aligns (eyes → head → body)
        cmd.gaze = prey.position; cmd.gait = 'idle'; cmd.pectoral = 'brace'; cmd.finErect = 0.8;
        const a = Math.atan2(-(prey.position.z - this.pos.z), prey.position.x - this.pos.x);
        const aligned = Math.abs(wrapAngle(a - this.heading)) < 0.12;
        out(0, sub.t > 0.25 ? a : null, 3);
        if (aligned && sub.t > 0.5) { sub.step = 'approach'; sub.t = 0; }
        break;
      }
      case 'approach': {
        cmd.gaze = prey.position;
        const d = prey.position.distanceTo(this.pos) - 0.3 * TL;   // snout is ~0.3 TL ahead of root
        const a = Math.atan2(-(prey.position.z - this.pos.z), prey.position.x - this.pos.x);
        const strikeRange = 0.12 * TL;
        if (d < strikeRange) { sub.step = 'strike'; sub.t = 0; break; }
        // short hop(s) toward prey or a final lunge; pause between hops (P)
        const hop = sub.t % 0.5 < 0.2;
        cmd.gait = hop ? 'crawl' : 'idle'; cmd.pectoral = hop ? 'stroke' : 'brace'; cmd.finErect = 0.7;
        const lunge = d < 0.6 * TL;
        out(hop || lunge ? (lunge ? 5 : 2.2) * TL : 0, a, 6, prey.position.y - this.ground.y > 0.02 ? 0.01 : 0);
        if (sub.t > 5) { sub.step = 'search'; sub.prey = null; }
        break;
      }
      case 'strike': {
        cmd.gaze = prey.position; cmd.strike = sub.t < 0.02; cmd.gait = 'crawl'; cmd.thrust = 1; cmd.pectoral = 'stroke';
        out(3 * TL, null, 0);
        if (sub.t > 0.04 && !prey.eaten) {
          // suction capture succeeds with size-dependent probability (G)
          const p = 0.75 - prey.size * 40 + (prey.moving ? -0.1 : 0.1);
          if (this.rng() < p) { this.world.eat(prey); this.hunger = clamp(this.hunger - 0.08 - prey.size * 20, 0, 1); this.world.sand(this.pos, 0.2, this.heading); }
          sub.step = 'handle'; sub.t = 0;
        }
        break;
      }
      case 'handle': {
        // winnowing: sand expelled via opercula after a bottom strike (P: common in sand-dwelling gobies)
        cmd.gait = 'rest'; cmd.pectoral = 'brace'; cmd.gaze = null;
        out(0, null, 0);
        if (sub.t > 0.3 && sub.t < 0.35) this.world.sand(this.pos, 0.1, this.heading);
        if (sub.t > 1.2) { sub.step = this.hunger > 0.2 ? 'search' : 'done'; sub.prey = null; if (sub.step === 'done') this.stateT = this.stateDur; }
        break;
      }
      default: out(0, null, 0);
    }
  }

  // COURTSHIP (male with nest)
  //  F: male excavates nest; radial ditches form by repeated digging from nest outward + sweeping sand out.
  //  R/G: display to female (erect fins, dark D1 shown, approach–retreat leading to nest) – gobiid general,
  //       not directly documented for F. gymnauchen → flagged 'estimated' in README.
  _courtship(dt, cmd, out) {
    const sub = this.sub, nest = this.nest.position;
    const P = this.P;
    sub.t = (sub.t || 0) + dt;
    const female = P.conspecific && !P.conspecific.fish.variation.male && P.distanceToConspecific < 0.3 ? P.conspecific : null;
    if (female && sub.step === 'maintain') { sub.step = 'display'; sub.t = 0; }
    const toNest = Math.atan2(-(nest.z - this.pos.z), nest.x - this.pos.x);
    const dN = Math.hypot(nest.x - this.pos.x, nest.z - this.pos.z);
    switch (sub.step) {
      case 'maintain': {
        // choose a ditch direction, dig outward from nest, sweep back; repeat (F)
        if (!sub.ditch) { sub.ditch = (this.nest.ditches ?? [0])[Math.floor(this.rng() * (this.nest.ditches?.length ?? 1))]; sub.out = true; }
        const tgt = sub.out
          ? new THREE.Vector3(nest.x + Math.cos(sub.ditch) * 0.07, 0, nest.z - Math.sin(sub.ditch) * 0.07)
          : nest;
        const a = Math.atan2(-(tgt.z - this.pos.z), tgt.x - this.pos.x);
        const d = Math.hypot(tgt.x - this.pos.x, tgt.z - this.pos.z);
        cmd.dig = d < 0.02; cmd.gait = d > 0.015 ? 'crawl' : 'idle'; cmd.pectoral = d > 0.015 ? 'stroke' : 'brace'; cmd.finErect = 0.7;
        out(d > 0.015 ? 1.5 * this.fish.TL : 0, a, 4);
        if (cmd.dig && this.rng() < 0.2) this.world.sand(this.pos, 0.25, this.heading + Math.PI);
        if (d < 0.015) { sub.out = !sub.out; if (sub.out) sub.ditch = null; }
        cmd.gaze = null;
        break;
      }
      case 'display': {
        if (!female) { sub.step = 'maintain'; break; }
        // lateral display beside female with fins fully erect, brief quivering, then lead to nest (R/G)
        const a = Math.atan2(-(female.pos.z - this.pos.z), female.pos.x - this.pos.x);
        cmd.gaze = female.pos; cmd.finErect = 1.0; cmd.pectoral = 'brace';
        const phase = sub.t % 3.0;
        if (phase < 1.4) { cmd.gait = 'hover'; cmd.thrust = 0.6; out(0, a + Math.PI / 2, 3, 0.004); }
        else if (phase < 2.0) { cmd.gait = 'crawl'; out(2.5 * this.fish.TL, a, 5); }
        else { cmd.gait = 'crawl'; out(2.5 * this.fish.TL, toNest, 5); }
        if (dN < 0.02 && phase > 2.5) cmd.dig = true;
        break;
      }
    }
  }
}
