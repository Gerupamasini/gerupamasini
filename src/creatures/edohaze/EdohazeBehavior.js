import * as THREE from 'three';
import { MORPH, HABITAT } from './EdohazeParams.js';
import { clamp, lerp, smoothstep, wrapAngle, mulberry32 } from './EdohazeMath.js';

// ---------------------------------------------------------------------------
// Behaviour AI.  States were chosen from the literature review
// (docs/edohaze/RESEARCH.md §6).  MUD_DIVE was removed (no record for this
// species); FREEZE replaces it.  IDLE merged into BOTTOM_REST, SLOW_SWIM into
// EXPLORE (saltatory hops).  GUARD: breeding-season males keep a burrow (eggs
// are guarded by males inside shrimp burrows — confirmed).
//
// Transitions = utility scores (internal state × environment × personality)
// sampled through a softmax, with hysteresis and minimum dwell times; threats
// interrupt through a looming/risk integrator with a short reaction latency.
// ---------------------------------------------------------------------------

export const S = Object.freeze({
  BOTTOM_REST: 'BOTTOM_REST', HOVER: 'HOVER', EXPLORE: 'EXPLORE', FORAGE: 'FORAGE', FEED: 'FEED',
  INVESTIGATE: 'INVESTIGATE', BURROW_APPROACH: 'BURROW_APPROACH', BURROW_ENTER: 'BURROW_ENTER',
  BURROW_HIDE: 'BURROW_HIDE', BURROW_EXIT: 'BURROW_EXIT', ESCAPE: 'ESCAPE', FREEZE: 'FREEZE', GUARD: 'GUARD',
});

export function makePersonality(seed) {
  const r = mulberry32(seed * 31 + 7);
  const n = () => (r() + r() + r()) / 3; // bell-ish
  return {
    seed,
    boldness: n(),            // lower fear gain, closer flight distances
    exploration: n(),         // excursion length / curiosity gain
    activity: lerp(0.7, 1.3, n()),
    hoverTendency: r() * 0.6, // rare near-bottom hovering
    reactivity: lerp(0.7, 1.3, n()),
    homeFidelity: n(),        // stays near its burrow
    temperature: lerp(0.12, 0.3, r()), // decision noise
    restMean: lerp(4, 14, r()),        // s
  };
}

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

export class EdohazeBehavior {
  constructor(fish, world, personality) {
    this.fish = fish; this.world = world; this.p = personality;
    this.rand = mulberry32(personality.seed * 97 + 1);
    this.L = fish.SL * MORPH.tlOverSl;
    this.internal = {
      hunger: 0.3 + this.rand() * 0.4, fear: 0, curiosity: 0.3 + this.rand() * 0.3,
      energy: 0.7 + this.rand() * 0.3, shelterNeed: 0.2, activity: 0.6,
    };
    this.state = S.BOTTOM_REST; this.stateT = 0; this.dwell = 3; this.data = {};
    this.homeBurrow = null; this.knownBurrows = [];
    this.perceptT = this.rand() * 0.1;
    this.threat = null; this.threatRisk = 0; this.pendingEscape = null;
    this.prey = null; this.stimulus = null;
    this.intent = { alert: 0, fear: 0, pecMode: 'perch', yawCorr: 0, pitchCorr: 0, gaze: [], headPitch: 0, lookYaw: 0, converge: false, exertion: 0 };
    this.lastShelter = 0; this.time = 0;
    this.history = [];
  }

  get loco() { return this.fish.loco; }

  // ------------------------------------------------------------------ main
  update(dt) {
    this.time += dt; this.stateT += dt;
    this.perceptT -= dt;
    if (this.perceptT <= 0) { this._perceive(); this.perceptT = 0.1; }
    this._internal(dt);

    // escape latency (Mauthner-type fast start ~10–30 ms + processing)
    if (this.pendingEscape) {
      this.pendingEscape.t -= dt;
      if (this.pendingEscape.t <= 0) { const pe = this.pendingEscape; this.pendingEscape = null; this._beginEscape(pe); }
    }
    const fn = this['_st_' + this.state];
    if (fn) fn.call(this, dt);
    this._intentCommon(dt);
  }

  setState(s, data = {}, dwell = 0) {
    if (this.state === s && !data.force) return;
    const leaving = this.state;
    if ((leaving === S.BURROW_HIDE || leaving === S.GUARD) && s !== S.BURROW_HIDE && s !== S.BURROW_EXIT && s !== S.GUARD) {
      /* keep occupancy until actually out */
    }
    this.history.push({ t: this.time, from: leaving, to: s }); if (this.history.length > 20) this.history.shift();
    this.state = s; this.stateT = 0; this.data = data; this.dwell = dwell;
  }

  // ------------------------------------------------------------------ perception
  _perceive() {
    const W = this.world, pos = this.loco.pos, L = this.L;
    // burrows: remember nearby ones (spatial memory)
    const burrows = W.getBurrows ? W.getBurrows() : [];
    this.knownBurrows = burrows.filter((b) => b.opening.distanceTo(pos) < 0.6);
    if (!this.homeBurrow || this.homeBurrow.opening.distanceTo(pos) > 0.9) {
      this.homeBurrow = this._nearestBurrow(pos, 0.6, false);
    }
    // threats
    const threats = W.getThreats ? W.getThreats() : [];
    let best = null, bestR = 0;
    const fwd = this.loco.forward(tmpV2);
    const visRange = W.getVisibility ? W.getVisibility() : 1.2;
    const daylight = W.getDaylight ? W.getDaylight() : 1;
    const inside = this.state === S.BURROW_HIDE && !this.data.peek;
    for (const th of threats) {
      if (th.visible === false) continue;
      const rel = tmpV.copy(pos).sub(th.position);
      const d = Math.max(rel.length(), 0.005);
      rel.divideScalar(d);
      const closing = th.velocity ? th.velocity.dot(rel) : 0;
      const size = th.size || 0.1;
      const loom = size * Math.max(closing, 0) / (d * d + size * size * 0.25);   // rad/s
      const cosA = -fwd.dot(rel);                                             // 1 = threat in front
      const fov = cosA < -0.85 ? 0.35 : 1;                                   // caudal blind zone
      let vis = Math.exp(-d / visRange) * lerp(0.35, 1, daylight) * fov;
      if (inside) vis *= 0.05;
      else if (this.data.peek) vis *= (th.position.y > pos.y - 0.02 ? 0.9 : 0.3);
      const sizeRatio = clamp(size / L, 0.5, 30);
      const flightDist = 0.06 * Math.sqrt(sizeRatio) * lerp(1.4, 0.7, this.p.boldness);
      const prox = smoothstep(flightDist * 2.5, flightDist * 0.4, d);
      const heading = th.velocity && th.velocity.lengthSq() > 1e-6 ? Math.max(0, th.velocity.clone().normalize().dot(rel)) : 0;
      let actMod = 1;
      if (this.state === S.FEED) actMod = 0.6; else if (this.state === S.FORAGE) actMod = 0.8; else if (this.state === S.BURROW_HIDE) actMod = 0.5;
      const risk = vis * actMod * this.p.reactivity * (loom / 0.9 + 0.55 * prox * Math.log2(1 + sizeRatio) / 3 + 0.35 * heading * prox);
      if (risk > bestR) { bestR = risk; best = { th, d, loom, dir: rel.clone(), vis, size, closing }; }
    }
    this.threat = best; this.threatRisk = bestR;
    // prey
    this.prey = null;
    if (W.getPrey && !inside) {
      let bd = 1e9;
      for (const pr of W.getPrey()) {
        if (!pr.alive) continue;
        const d = pr.position.distanceTo(pos);
        const detect = 6 * L * Math.exp(-d / visRange) * lerp(0.4, 1, daylight);
        if (d < detect && d < bd) { bd = d; this.prey = pr; }
      }
    }
    // novel stimuli: slow, non-threatening movers within ~15 BL
    this.stimulus = null;
    if (best && best.d < 15 * L && bestR < 0.35 && best.closing < 0.04 && !inside) this.stimulus = best.th;

    // escape decision
    const I = this.internal;
    const loomThresh = lerp(0.6, 1.4, this.p.boldness);
    if (best && !this.pendingEscape && this.state !== S.ESCAPE && this.state !== S.BURROW_ENTER && !inside) {
      // refractory after a fast-start: only strong looming re-triggers (prevents
      // flee→flee loops; fish in follow-through are already fleeing)
      const refractory = this.time - (this.lastEscapeT ?? -99) < 2.0 || (this.state === S.BURROW_APPROACH && this.data.urgent);
      const loomHit = best.loom > loomThresh * (refractory ? 2.2 : 1) && best.vis > 0.15;
      const trigger = loomHit || (!refractory && (bestR > 1.2 || (I.fear > 0.8 && bestR > 0.5)));
      if (trigger) this.pendingEscape = { t: 0.012 + this.rand() * 0.05, threat: best };
      else if (this.data.peek && (bestR > 0.35 || I.fear > 0.35)) this._withdraw(true);
    }
  }

  _nearestBurrow(pos, maxD, needRoom = true, awayDir = null) {
    let best = null, bs = -1e9;
    for (const b of this.knownBurrows.length ? this.knownBurrows : (this.world.getBurrows ? this.world.getBurrows() : [])) {
      const d = b.opening.distanceTo(pos);
      if (d > maxD) continue;
      if (!b.isFlooded(this.world.getWaterLevel())) continue;
      if (needRoom && !b.hasRoom(this.fish)) continue;
      if (b.owner && b.owner !== this.fish && this.world.isBreedingSeason?.()) continue;
      let sc = -d * 10 + (b === this.homeBurrow ? 1.5 : 0) + (b.owner === this.fish ? 3 : 0);
      if (awayDir) {
        const dirB = tmpV.copy(b.opening).sub(pos).setY(0).normalize();
        const a = dirB.dot(awayDir);
        if (a < -0.35 && d > 3 * this.L) continue; // would run toward the threat
        sc += a * 1.5;
      }
      if (sc > bs) { bs = sc; best = b; }
    }
    return best;
  }

  // ------------------------------------------------------------------ internal state
  _internal(dt) {
    const I = this.internal, P = this.p, L = this.L;
    const loco = this.loco;
    const moving = clamp(Math.abs(loco.speed) / (3 * L), 0, 1);
    const W = this.world;
    const daylight = W.getDaylight ? W.getDaylight() : 1;
    const g = W.getGroundHeight(loco.pos.x, loco.pos.z);
    const depth = W.getWaterLevel() - g;
    const exposure = 1 - smoothstep(HABITAT.exposedDepthBL * L, HABITAT.exposedDepthBL * L * 4, depth);
    I.hunger = clamp(I.hunger + dt * 0.0035 * P.activity, 0, 1);
    I.energy = clamp(I.energy - dt * (0.012 * moving + 0.25 * loco.burst) + dt * (moving < 0.05 ? 0.01 : 0), 0, 1);
    // fear: leaky integrator of risk
    const gain = lerp(1.6, 0.8, P.boldness);
    I.fear = clamp(I.fear + dt * (this.threatRisk * gain - I.fear * (this.state === S.BURROW_HIDE ? 0.35 : 0.18)), 0, 1);
    I.curiosity = clamp(I.curiosity + dt * (0.006 * P.exploration - 0.004 * I.curiosity + (this.stimulus ? 0.05 : 0)) - dt * I.fear * 0.05, 0, 1);
    const inShelter = this.state === S.BURROW_HIDE;
    if (inShelter) this.lastShelter = this.time;
    const sinceShelter = this.time - this.lastShelter;
    const breeding = W.isBreedingSeason ? W.isBreedingSeason() : false;
    const guardDrive = breeding && this.fish.sex === 'male' && this.homeBurrow ? 0.35 : 0;
    I.shelterNeed = clamp(0.15 + exposure * 0.9 + I.fear * 0.5 + smoothstep(120, 400, sinceShelter) * 0.25 + guardDrive + (1 - daylight) * 0.1 - (inShelter ? 0.1 : 0), 0, 1);
    const tideRising = W.getTideRate ? clamp(W.getTideRate() * 3000, -1, 1) : 0;
    I.activity = clamp(P.activity * lerp(0.55, 1.0, daylight) * (1 + 0.15 * tideRising) * (0.6 + 0.4 * I.energy) * (1 - 0.6 * I.fear), 0, 1.3);
    this.exposure = exposure;
  }

  // ------------------------------------------------------------------ decisions
  _decide() {
    const I = this.internal, P = this.p;
    const breeding = this.world.isBreedingSeason ? this.world.isBreedingSeason() : false;
    const U = {};
    U[S.BOTTOM_REST] = 0.25 + (1 - I.energy) * 0.8 + (1 - Math.min(I.activity, 1)) * 0.5;
    U[S.HOVER] = P.hoverTendency * I.activity * (1 - I.fear) * 0.45 * (1 - this.exposure);
    U[S.EXPLORE] = (I.curiosity * 0.7 + I.activity * 0.45 + P.exploration * 0.3) * (1 - I.fear) - I.shelterNeed * 0.4;
    U[S.FORAGE] = I.hunger * 1.25 * (1 - 0.8 * I.fear) * Math.min(I.activity + 0.2, 1) + (this.prey ? 0.4 : 0);
    U[S.INVESTIGATE] = this.stimulus ? I.curiosity * (0.5 + P.boldness) * (1 - I.fear) : -1;
    const b = this._nearestBurrow(this.loco.pos, 0.5);
    U[S.BURROW_APPROACH] = b ? I.shelterNeed * 1.1 + I.fear * 0.8 + P.homeFidelity * 0.15 : -1;
    if (breeding && this.fish.sex === 'male' && this.homeBurrow) U[S.GUARD] = 0.9;
    // hysteresis: small bonus to continue
    if (U[this.state] !== undefined) U[this.state] += 0.12;
    const keys = Object.keys(U);
    const T = P.temperature;
    const mx = Math.max(...keys.map((k) => U[k]));
    let sum = 0; const ex = keys.map((k) => { const e = Math.exp((U[k] - mx) / T); sum += e; return e; });
    let r = this.rand() * sum;
    for (let i = 0; i < keys.length; i++) { r -= ex[i]; if (r <= 0) return { s: keys[i], burrow: b, U }; }
    return { s: keys[keys.length - 1], burrow: b, U };
  }

  _nextFromRest() {
    const { s, burrow, U } = this._decide();
    this.lastUtilities = U;
    switch (s) {
      case S.BOTTOM_REST: this.setState(S.BOTTOM_REST, { force: true }, this._expRand(this.p.restMean)); break;
      case S.HOVER: this.setState(S.HOVER, { h: 0.5 + this.rand() * 0.8 }, 2 + this.rand() * 4); break;
      case S.EXPLORE: this.setState(S.EXPLORE, { hops: 2 + Math.floor(this.rand() * 5 * (0.5 + this.p.exploration)) }); break;
      case S.FORAGE: this.setState(S.FORAGE, { budget: 12 + this.rand() * 20 }); break;
      case S.INVESTIGATE: this.setState(S.INVESTIGATE, { stim: this.stimulus }, 3 + this.rand() * 6); break;
      case S.BURROW_APPROACH: this.setState(S.BURROW_APPROACH, { burrow, urgent: false }); break;
      case S.GUARD: this.setState(S.BURROW_APPROACH, { burrow: this.homeBurrow, urgent: false, guard: true }); break;
    }
  }
  _expRand(mean) { return -Math.log(1 - this.rand() * 0.95) * mean * 0.7 + mean * 0.3; }

  // ------------------------------------------------------------------ states
  _st_BOTTOM_REST(dt) {
    const d = this.data;
    if (d.faceYaw === undefined || this.stateT > (d.nextLook || 0)) {
      // occasional re-orientation by pectoral pivot toward something salient
      const focus = this.threat?.th.position || this.prey?.position;
      d.faceYaw = focus ? Math.atan2(focus.x - this.loco.pos.x, focus.z - this.loco.pos.z) : this.loco.yaw + (this.rand() - 0.5) * 1.2;
      d.nextLook = this.stateT + 2 + this.rand() * 6;
    }
    this.loco.setCommand({ type: 'perch', faceYaw: d.faceYaw, turnRate: 0.8, headUp: 0.05 });
    this.intent.pecMode = 'perch';
    if (this.stateT > this.dwell) this._nextFromRest();
  }

  _st_HOVER() {
    const d = this.data;
    this.loco.setCommand({ type: 'hover', height: d.h, target: this.loco.pos, faceYaw: this.loco.yaw });
    this.intent.pecMode = 'hover'; this.intent.hoverMode = true;
    if (this.stateT > this.dwell || this.internal.fear > 0.3) { this.intent.hoverMode = false; this.setState(S.BOTTOM_REST, {}, 2 + this.rand() * 4); }
  }

  _st_EXPLORE() {
    const d = this.data, loco = this.loco;
    const hopDone = !d.target || (loco.hop && loco.hop.done);
    if (hopDone && d.target && d.landedAt === undefined) {
      d.landedAt = this.stateT; d.pause = 0.3 + this.rand() * 2.2;   // look around between hops
      loco.setCommand({ type: 'perch', faceYaw: loco.yaw });
      if (--d.hops <= 0) { this.setState(S.BOTTOM_REST, {}, this._expRand(this.p.restMean * 0.6)); return; }
    }
    if (!d.target || (hopDone && this.stateT > d.landedAt + d.pause)) {
      d.target = this._pickHopTarget(1 + this.rand() * 3.5 * (0.6 + this.p.exploration));
      d.landedAt = undefined;
      loco.setCommand({ type: 'hop', target: d.target, urgency: 0.2 + this.rand() * 0.2 });
    }
    this.intent.pecMode = 'perch';
  }

  _pickHopTarget(distBL) {
    const L = this.L, loco = this.loco;
    let best = null, bs = -1e9;
    for (let k = 0; k < 8; k++) {
      const a = loco.yaw + (this.rand() - 0.5) * 2.6;
      const dist = distBL * L * (0.7 + this.rand() * 0.6);
      const p = new THREE.Vector3(loco.pos.x + Math.sin(a) * dist, 0, loco.pos.z + Math.cos(a) * dist);
      p.y = this.world.getGroundHeight(p.x, p.z);
      let sc = 0;
      // stay within home range around home burrow
      if (this.homeBurrow) sc -= Math.max(0, p.distanceTo(this.homeBurrow.opening) - lerp(0.35, 0.15, this.p.homeFidelity)) * 8;
      // prefer water depth (avoid shallows), preferred substrate
      const depth = this.world.getWaterLevel() - p.y;
      sc -= smoothstep(6 * L, 1.5 * L, depth) * 3;
      const sub = this.world.getSubstrate ? this.world.getSubstrate(p.x, p.z) : 'sandy_mud';
      if (!HABITAT.preferredSubstrate.includes(sub)) sc -= 0.5;
      // conspecific spacing
      for (const o of this.world.getConspecifics ? this.world.getConspecifics() : []) {
        if (o === this.fish) continue;
        const dd = o.loco.pos.distanceTo(p); if (dd < 2 * L) sc -= (2 * L - dd) / L;
      }
      // bounds
      if (this.world.inBounds && !this.world.inBounds(p)) sc -= 100;
      sc += this.rand() * 0.5;
      if (sc > bs) { bs = sc; best = p; }
    }
    return best;
  }

  _st_FORAGE() {
    const d = this.data, L = this.L, loco = this.loco;
    this.intent.pecMode = 'perch';
    if (this.prey && this.prey.alive) {
      const pp = this.prey.position;
      const dist = tmpV.copy(pp).sub(loco.pos).setY(0).length();
      if (dist < 0.9 * L) { this.setState(S.FEED, { prey: this.prey }); return; }
      if (!loco.hop || loco.hop.done || loco.cmd.type !== 'hop') {
        const tgt = pp.clone().sub(tmpV.copy(pp).sub(loco.pos).setY(0).normalize().multiplyScalar(0.6 * L));
        if (!d.waitUntil || this.stateT > d.waitUntil) {
          loco.setCommand({ type: 'hop', target: tgt, urgency: 0.35 });
          d.waitUntil = this.stateT + 0.4 + this.rand() * 0.8; // fixate between approach hops
        } else loco.setCommand({ type: 'perch', faceYaw: Math.atan2(pp.x - loco.pos.x, pp.z - loco.pos.z), turnRate: 1.5 });
      }
    } else {
      // search: scan, short hops; occasional substrate pick [game supplement]
      if (!loco.hop || loco.hop.done) {
        if (!d.next || this.stateT > d.next) {
          if (this.rand() < 0.25) { this.setState(S.FEED, { prey: null, pick: true }); return; }
          loco.setCommand({ type: 'hop', target: this._pickHopTarget(1.5 + this.rand() * 2), urgency: 0.25 });
          d.next = this.stateT + 1 + this.rand() * 3;
        } else loco.setCommand({ type: 'perch', faceYaw: loco.yaw + Math.sin(this.stateT * 0.7) * 0.4, turnRate: 0.6 });
      }
    }
    if (this.stateT > d.budget || this.internal.hunger < 0.08) this.setState(S.BOTTOM_REST, {}, this._expRand(this.p.restMean * 0.5));
  }

  _st_FEED() {
    const d = this.data, L = this.L, loco = this.loco;
    const pp = d.prey ? d.prey.position : tmpV2.copy(loco.pos).add(loco.forward(tmpV).setY(0).normalize().multiplyScalar(0.6 * L));
    if (!d.phase) {
      d.phase = 'aim'; d.aimYaw = Math.atan2(pp.x - loco.pos.x, pp.z - loco.pos.z);
    }
    if (d.phase === 'aim') {
      loco.setCommand({ type: 'perch', faceYaw: d.aimYaw, turnRate: 3, headUp: -0.12 });
      this.intent.converge = true; this.intent.headPitch = -0.08;
      if (this.stateT > 0.25 + this.rand() * 0.2 && Math.abs(wrapAngle(d.aimYaw - loco.yaw)) < 0.12) {
        d.phase = 'strike'; d.t0 = this.stateT;
        this.fish.animator.triggerStrike();
        loco.setCommand({ type: 'swim', target: pp.clone(), speed: 4, urgency: 1, height: 0.15 });
      }
    } else if (d.phase === 'strike') {
      if (this.stateT - d.t0 > 0.08) {
        if (d.prey && d.prey.alive && d.prey.position.distanceTo(loco.pos) < 0.9 * L) {
          this.world.consumePrey?.(d.prey); this.internal.hunger = clamp(this.internal.hunger - 0.22, 0, 1);
        } else if (d.pick) this.internal.hunger = clamp(this.internal.hunger - 0.02, 0, 1);
        d.phase = 'handle'; d.t0 = this.stateT; this.intent.converge = false;
      }
    } else if (d.phase === 'handle') {
      loco.setCommand({ type: 'perch', faceYaw: loco.yaw });
      this.intent.headPitch = 0;
      if (this.stateT - d.t0 > 0.5 + this.rand() * 0.8) this.setState(S.FORAGE, { budget: 8 + this.rand() * 10 });
    }
    this.intent.pecMode = 'perch';
  }

  _st_INVESTIGATE() {
    const d = this.data, L = this.L, loco = this.loco;
    const st = d.stim;
    if (!st) { this.setState(S.BOTTOM_REST, {}, 3); return; }
    const to = tmpV.copy(st.position).sub(loco.pos).setY(0);
    const dist = to.length(); const yaw = Math.atan2(to.x, to.z);
    const keep = lerp(12, 5, this.p.boldness) * L;
    if (dist > keep * 1.3 && (!loco.hop || loco.hop.done) && this.stateT > (d.next || 0)) {
      loco.setCommand({ type: 'hop', target: loco.pos.clone().add(to.normalize().multiplyScalar(Math.min(dist - keep, 3 * L))), urgency: 0.2 });
      d.next = this.stateT + 0.8 + this.rand() * 1.5;
    } else if (!loco.hop || loco.hop.done || loco.cmd.type !== 'hop') loco.setCommand({ type: 'perch', faceYaw: yaw, turnRate: 1.4, headUp: 0.1 });
    this.intent.alert = Math.max(this.intent.alert, 0.7); this.intent.headPitch = 0.06;
    this.internal.curiosity = clamp(this.internal.curiosity - 0.02 * 0.016, 0, 1);
    if (this.stateT > this.dwell || this.internal.fear > 0.45) this.setState(S.BOTTOM_REST, {}, 2 + this.rand() * 4);
  }

  _st_BURROW_APPROACH() {
    const d = this.data, L = this.L, loco = this.loco; const b = d.burrow;
    if (!b || !b.isFlooded(this.world.getWaterLevel())) { this.setState(S.FREEZE, {}, 3); return; }
    const above = b.pointAt(-0.012, new THREE.Vector3());
    const to = tmpV.copy(above).sub(loco.pos); const dist = to.length();
    if (dist < 0.3 * L) { this.setState(S.BURROW_ENTER, { burrow: b, urgent: d.urgent, guard: d.guard }); return; }
    if (d.urgent || dist < 3 * L) {
      loco.setCommand({ type: 'swim', target: above, speed: d.urgent ? 9 : 1.4, urgency: d.urgent ? 1 : 0.2, height: 0.3 });
      this.intent.pecMode = d.urgent ? 'swim' : 'slow';
    } else {
      if (!loco.hop || loco.hop.done || loco.cmd.type !== 'hop') {
        if (this.stateT > (d.next || 0)) {
          const step = Math.min(dist - 2 * L, 4 * L);
          loco.setCommand({ type: 'hop', target: loco.pos.clone().add(to.setY(0).normalize().multiplyScalar(step)), urgency: 0.3 });
          d.next = this.stateT + 0.3 + this.rand() * 0.8;
        } else loco.setCommand({ type: 'perch', faceYaw: Math.atan2(to.x, to.z), turnRate: 2 });
      }
      this.intent.pecMode = 'perch';
    }
    if (this.stateT > 12) this.setState(S.BOTTOM_REST, {}, 3);
  }

  _st_BURROW_ENTER() {
    const d = this.data, loco = this.loco; const b = d.burrow;
    if (!d.started) {
      d.started = true;
      loco.setCommand({ type: 'burrow', burrow: b, startD: -0.012, dir: 1, speed: d.urgent ? 0.35 : 0.06, headIn: true, targetD: b.usableDepth * 0.8 });
      b.occupants.add(this.fish);
      if (d.guard) b.owner = this.fish;
    }
    this.intent.pecMode = 'burrow';
    if (loco.burrow && loco.burrow.arrived) this.setState(S.BURROW_HIDE, { burrow: b, guard: d.guard, minHide: d.urgent ? 6 + this.rand() * 20 : 2 + this.rand() * 6 });
  }

  _st_BURROW_HIDE() {
    const d = this.data, loco = this.loco, b = d.burrow, I = this.internal, SL = this.fish.SL;
    const flooded = b.isFlooded(this.world.getWaterLevel());
    this.intent.pecMode = 'burrow';
    if (!d.peek) {
      if (this.stateT > d.minHide && I.fear < 0.3 && flooded) {
        // turn around inside (unseen) and come up to the entrance, head first
        d.peek = true; d.peekT = this.stateT; d.peekDur = 4 + this.rand() * 25 * (d.guard ? 3 : 1);
        loco.setCommand({ type: 'burrow', burrow: b, startD: loco.burrow.d, dir: -1, speed: 0.05, headIn: false, targetD: 0.12 * SL }); // snout ~0.28 SL out, eyes above the rim
      }
    } else {
      // at the entrance: head protruding, scanning
      this.intent.headPitch = 0.0; this.intent.alert = Math.max(this.intent.alert, 0.35);
      if (!flooded || I.fear > 0.35) { this._withdraw(I.fear > 0.35); return; }
      if (this.stateT - d.peekT > d.peekDur) {
        const { s } = this._decide();
        if (s === S.BURROW_APPROACH || s === S.BOTTOM_REST && this.rand() < 0.5 || s === S.GUARD) { d.peekT = this.stateT; d.peekDur = 3 + this.rand() * 15; }
        else this.setState(S.BURROW_EXIT, { burrow: b, guard: d.guard });
      }
    }
  }

  _withdraw(fast) {
    const loco = this.loco; const b = this.data.burrow;
    if (!b || !loco.burrow) return;
    this.data.peek = false; this.data.minHide = this.stateT + (fast ? 8 + this.rand() * 20 : 3);
    loco.setCommand({ type: 'burrow', burrow: b, startD: loco.burrow.d, dir: 1, speed: fast ? 0.3 : 0.08, headIn: false, targetD: b.usableDepth * 0.75 });
  }

  _st_BURROW_EXIT() {
    const d = this.data, loco = this.loco, b = d.burrow, L = this.L;
    if (!d.phase) { d.phase = 'rise'; loco.setCommand({ type: 'burrow', burrow: b, startD: loco.burrow ? loco.burrow.d : 0, dir: -1, speed: 0.06, headIn: false, targetD: -0.02 }); }
    if (d.phase === 'rise' && loco.burrow && loco.burrow.arrived) {
      d.phase = 'out'; b.occupants.delete(this.fish);
      const a = this.rand() * Math.PI * 2, r = (1 + this.rand() * 1.5) * L;
      const tgt = new THREE.Vector3(b.opening.x + Math.sin(a) * r, 0, b.opening.z + Math.cos(a) * r);
      tgt.y = this.world.getGroundHeight(tgt.x, tgt.z) + 0.5 * L;
      d.tgt = tgt;
      loco.setCommand({ type: 'swim', target: tgt, speed: 1.3, urgency: 0.2, height: 0.5 });
    }
    if (d.phase === 'out') {
      this.intent.pecMode = 'slow';
      if (loco.pos.distanceTo(d.tgt) < 0.5 * L || this.stateT > 4) this.setState(d.guard ? S.GUARD : S.BOTTOM_REST, { burrow: b }, 3 + this.rand() * 5);
    } else this.intent.pecMode = 'burrow';
  }

  _st_GUARD() {
    // breeding male: short excursions next to the nest burrow, chase intruders, return
    const b = this.homeBurrow || this.data.burrow, loco = this.loco, L = this.L;
    this.intent.pecMode = 'perch'; this.intent.alert = Math.max(this.intent.alert, 0.5);
    if (!b) { this.setState(S.BOTTOM_REST, {}, 3); return; }
    let intruder = null;
    for (const o of this.world.getConspecifics ? this.world.getConspecifics() : []) {
      if (o === this.fish || o.sex !== 'male' || o.behavior.state === S.BURROW_HIDE) continue;
      if (o.loco.pos.distanceTo(b.opening) < 3 * L) { intruder = o; break; }
    }
    if (intruder && !this.data.chaseT) {
      this.data.chaseT = this.stateT;
      loco.setCommand({ type: 'swim', target: intruder.loco.pos.clone(), speed: 6, urgency: 0.8, height: 0.3 });
      intruder.behavior.internal.fear = Math.min(1, intruder.behavior.internal.fear + 0.5);
    } else if (this.data.chaseT && this.stateT - this.data.chaseT > 0.5) {
      this.data.chaseT = 0; this.setState(S.BURROW_APPROACH, { burrow: b, guard: true });
    } else if (!this.data.chaseT) {
      loco.setCommand({ type: 'perch', faceYaw: loco.yaw });
      if (this.stateT > this.dwell) this.setState(S.BURROW_APPROACH, { burrow: b, guard: true });
    }
  }

  _beginEscape(pe) {
    const th = pe.threat; const loco = this.loco; const L = this.L;
    // leave burrow bookkeeping if we were peeking
    if (this.state === S.BURROW_HIDE && this.data.peek) { this._withdraw(true); return; }
    const away = th.dir.clone().setY(0).normalize();
    const b = this._nearestBurrow(loco.pos, 0.3, true, away);
    let dir = away;
    if (b) {
      const toB = b.opening.clone().sub(loco.pos).setY(0);
      if (toB.length() < 1.2 * L) dir = toB.normalize();
      else dir = toB.normalize().lerp(away, 0.25).normalize();
    } else {
      // no refuge: escape away with a random lateral component (protean)
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (this.rand() - 0.5) * 1.2);
    }
    this.internal.fear = Math.max(this.internal.fear, 0.8);
    this.lastEscapeT = this.time;
    this.setState(S.ESCAPE, { burrow: b, threat: th.th });
    loco.setCommand({ type: 'escape', dir, intensity: clamp(th.loom, 0.6, 1.2) });
  }

  _st_ESCAPE() {
    const d = this.data, loco = this.loco;
    this.intent.pecMode = 'burst';
    if (loco.escape && loco.escape.t > 0.25) {
      if (d.burrow && d.burrow.hasRoom(this.fish)) { this.setState(S.BURROW_APPROACH, { burrow: d.burrow, urgent: true }); return; }
      if (loco.escape.done) this.setState(S.FREEZE, {}, lerp(2, 9, this.internal.fear) * (1.3 - this.p.boldness * 0.6));
    }
  }

  _st_FREEZE() {
    // cryptic immobility on the substrate: no fin flicks, fins lowered, fast ventilation
    this.loco.setCommand({ type: 'freeze' });
    this.intent.pecMode = 'perch'; this.intent.alert = 0.2; this.intent.freeze = true;
    if (this.stateT > this.dwell && this.internal.fear < 0.5) {
      this.intent.freeze = false;
      const b = this._nearestBurrow(this.loco.pos, 0.35);
      if (b && this.rand() < 0.6) this.setState(S.BURROW_APPROACH, { burrow: b, urgent: false });
      else this.setState(S.BOTTOM_REST, {}, 3 + this.rand() * 5);
    }
  }

  // ------------------------------------------------------------------ intents for animator
  _intentCommon(dt) {
    const I = this.internal, it = this.intent, loco = this.loco;
    it.fear = I.fear;
    const baseAlert = clamp(I.fear * 1.4 + (this.threatRisk > 0.1 ? 0.3 : 0), 0, 1);
    it.alert = this.state === S.FREEZE ? 0.15 : Math.max(baseAlert, this.state === S.INVESTIGATE ? 0.7 : 0, this.data.peek ? 0.35 : 0);
    it.exertion = clamp(1 - I.energy, 0, 1) * 0.5;
    if (this.state !== S.FEED && this.state !== S.INVESTIGATE) it.headPitch = loco.mode === 'perch' ? 0.03 : 0;
    if (this.state !== S.FEED) it.converge = false;
    // fin control corrections derived from heading/altitude errors
    it.yawCorr = clamp(loco.yawRate * 0.6, -1, 1) * (loco.mode === 'hover' || loco.mode === 'perch' ? 1 : 0.3);
    it.pitchCorr = clamp(-loco.vel.y / this.L * 0.5, -1, 1);
    if (this.state === S.FREEZE) it.pecMode = 'perch';
    // gaze targets (head-local directions)
    it.gaze.length = 0;
    const add = (p, w, kind) => { if (!p) return; it.gaze.push({ local: this.fish.toHeadLocal(p), weight: w, kind }); };
    if (this.threat) add(this.threat.th.position, 0.4 + this.threatRisk, 'threat');
    if (this.prey) add(this.prey.position, this.state === S.FORAGE || this.state === S.FEED ? 0.9 : 0.25, 'prey');
    if (this.stimulus) add(this.stimulus.position, 0.5, 'novel');
    const others = this.world.getConspecifics ? this.world.getConspecifics() : [];
    for (const o of others) if (o !== this.fish && !o.loco.hidden && o.loco.pos.distanceTo(loco.pos) < 8 * this.L) add(o.loco.pos, 0.15 + 0.2 * clamp(Math.abs(o.loco.speed) / this.L, 0, 1), 'conspecific');
    // chromatophores: slow background matching + acute stress paling
    const sub = this.world.getSubstrate ? this.world.getSubstrate(loco.pos.x, loco.pos.z) : 'sandy_mud';
    const darkBg = sub === 'mud' ? 0.8 : sub === 'sandy_mud' ? 0.45 : 0.1;
    const pf = this.fish.materials.perFish;
    pf.uDarken.value += (darkBg - pf.uDarken.value) * Math.min(1, dt * 0.02);
    pf.uPale.value += (clamp(I.fear * 0.35, 0, 0.35) - pf.uPale.value) * Math.min(1, dt * 0.5);
  }

  get debugInfo() {
    return {
      state: this.state, t: this.stateT, ...this.internal, threatRisk: this.threatRisk,
      threat: this.threat?.th, burrow: this.data.burrow || this.homeBurrow, peek: !!this.data.peek,
      target: this.loco.hop && !this.loco.hop.done ? this.loco.hop.target : this.loco.cmd.target,
    };
  }
}
