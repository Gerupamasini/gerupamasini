// Behavioural-ecology controller for a ヒメハゼ actor (HimehazeActor + src/fish/Behavior.js).
//
// Utility scoring over internal drives and external stimuli selects a state; each state is a short script
// that issues motor actions to the low-level controller (hop, dart, escape, strike, bury, look, setAlert,
// erectFins), which owns the biomechanics (head-led C-bends, pectoral strokes, ground contact, breathing).
//
// Evidence tags: [F] literature, [P] reference photos/video, [R] related gobies, [G] game assumption.
//  F  sandy/muddy bottoms of inner bays and tidal flats; often shallowly buried with only the head out,
//     dives into the sand when alarmed; day feeder (copepods, gammarid amphipods, polychaetes; mysids,
//     crangonid shrimps, small crabs; larger fish take more polychaetes/crabs); males guard eggs in a buried
//     bivalve shell / burrow and radial ditches form around the spawning site by digging + sweeping sand out.
//  P  rests perched on the pelvic disc, front propped on fanned pectorals (070, 067, 069, 024); fins
//     folded or half raised at rest, raised when alert or handled (001, 007, 014, 019, 024).
//  R  saltatory search (hop → stop → look), suction strike, C-start escape, lateral display between males.
//  G  thresholds, timings and the utility weights.
import * as THREE from 'three';
import { mulberry32 } from '../fish/Behavior.js';

export const STATES = ['IDLE', 'SCAN', 'CRAWL', 'SHORT_SWIM', 'FREEZE', 'ESCAPE', 'BURY', 'FORAGE', 'REST', 'COURTSHIP', 'TERRITORIAL'];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const damp = (c, t, l, dt) => c + (t - c) * (1 - Math.exp(-l * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z); // Behavior heading convention (0 = +Z)

// Prey preference by fish size [F: Korean stomach-content study (1–2 cm fish: amphipods, polychaetes,
// copepods; with growth polychaetes & crabs increase, copepods decrease); mysids/crangonids by habitat]
export function preyPreference(TLm) {
  const big = clamp((TLm * 100 - 3) / 5, 0, 1);
  return { copepod: 1 - 0.7 * big, amphipod: 0.9, polychaete: 0.4 + 0.6 * big, crab: 0.05 + 0.5 * big, mysid: 0.5 };
}

export class HimehazeEcology {
  /**
   * @param {HimehazeActor} actor
   * @param {object} world   see README "World interface"
   * @param {object} o       { male, breeding, nest, home }
   */
  constructor(actor, world, { male = false, breeding = false, nest = null, home = null } = {}) {
    this.actor = actor;
    this.B = actor.behavior;
    this.world = world;
    this.rng = mulberry32(actor.seed * 7 + 11);
    const r = this.rng;
    this.male = male;
    this.nest = nest;
    this.home = (home ?? actor.position).clone().setY(0);
    // internal drives 0…1
    this.hunger = 0.3 + 0.4 * r();
    this.fear = 0;
    this.energy = 0.7 + 0.3 * r();
    this.curiosity = 0.2 + 0.3 * r();
    this.territoriality = male ? 0.4 + 0.3 * r() : 0.1;
    this.breedingDrive = male && breeding ? 0.6 + 0.3 * r() : 0;
    this.boldness = 0.3 + 0.5 * r(); // personality [G]
    this.state = 'IDLE'; this.t = 0; this.dur = 2; this.sub = {};
    this.P = {};
    this.debug = '';
    this._ray = new THREE.Raycaster();
    this._landed = false;
  }

  get pos() { return this.actor.position; }

  // ------------------------------------------------------------------ perception
  perceive() {
    const w = this.world, p = this.pos, TL = this.actor.TL;
    const head = this.B.heading();
    const P = {};
    let threat = null, level = 0;
    for (const pr of w.predators) {
      if (!pr.danger) continue;
      const d = pr.position.distanceTo(p);
      const lv = clamp(1 - d / (pr.radius || 0.8), 0, 1) * pr.danger;
      if (lv > level) { level = lv; threat = pr.position; }
    }
    if (w.player) {
      // looming: approach speed matters more than distance [R]
      const d = w.player.position.distanceTo(p);
      const toFish = p.clone().sub(w.player.position).normalize();
      const approach = w.player.velocity ? w.player.velocity.dot(toFish) : 0;
      const lv = clamp(1 - d / 0.2, 0, 1) * 0.8 + clamp(approach * 2.5, 0, 0.6) * clamp(1 - d / 0.45, 0, 1);
      if (lv > level) { level = lv; threat = w.player.position; }
      P.distanceToPlayer = d;
    }
    P.threat = threat;
    P.threatLevel = level * (1.2 - 0.4 * this.boldness) * (this.B.state.bury > 0.5 ? 0.5 : 1);
    // food: detected visually in a ~270° field (dorsolateral eyes, blind behind) within a size-dependent range
    const pref = preyPreference(TL);
    let food = null, best = 0;
    for (const f of w.food) {
      if (f.eaten) continue;
      const d = f.position.distanceTo(p);
      const range = (f.visible ?? 1) * (0.06 + f.size * 30);
      if (d > range || f.size > TL * 0.07) continue;
      if (Math.abs(wrap(angleTo(p, f.position) - head)) > 2.4) continue;
      const sc = (pref[f.type] ?? 0.3) * (1 - d / range) * (f.moving ? 1.3 : 1);
      if (sc > best) { best = sc; food = f; }
    }
    P.food = food;
    P.distanceToFood = food ? food.position.distanceTo(p) : Infinity;
    let cs = null, csd = Infinity;
    for (const o of w.fishes) { if (o === this) continue; const d = o.pos.distanceTo(p); if (d < csd) { csd = d; cs = o; } }
    P.conspecific = cs; P.distanceToConspecific = csd;
    let sh = null, shd = Infinity;
    for (const s of w.shelters) { const d = s.position.distanceTo(p); if (d < shd) { shd = d; sh = s; } }
    P.shelter = sh; P.distanceToShelter = shd;
    P.distanceToBottom = Math.max(0, this.actor.root.position.y - (w.heightAt ? w.heightAt(p.x, p.z) : 0));
    P.waterCurrent = w.current; P.timeOfDay = w.timeOfDay; P.tideState = w.tide;
    return (this.P = P);
  }

  _drives(dt) {
    const P = this.P;
    const busy = !this.B.isIdle();
    this.hunger = clamp(this.hunger + dt * 0.004, 0, 1);
    this.energy = clamp(this.energy + dt * (busy ? -0.012 : 0.004), 0, 1);
    // fear rises fast and decays slowly [R]
    this.fear = P.threatLevel > this.fear ? damp(this.fear, P.threatLevel, 8, dt) : damp(this.fear, P.threatLevel, 0.25, dt);
    this.curiosity = clamp(this.curiosity + dt * 0.004 - (this.state === 'SCAN' ? dt * 0.02 : 0), 0, 1);
    // day feeder [F]; night → rest, partly buried [G]
    this.daylight = clamp(Math.sin(((this.world.timeOfDay - 6) / 12) * Math.PI) * 1.5, 0, 1);
  }

  _decide() {
    const P = this.P, r = this.rng;
    const s = {
      ESCAPE: this.fear > 0.55 && P.threat ? 2 + this.fear : 0,
      FREEZE: this.fear > 0.25 && this.fear <= 0.55 ? 1.2 + this.fear : 0,
      FORAGE: this.hunger * (P.food ? 1.3 : 0.7) * (0.3 + 0.7 * this.daylight) * (1 - this.fear),
      SCAN: 0.2 + 0.35 * this.curiosity + (P.distanceToPlayer < 0.3 ? 0.15 : 0),
      IDLE: 0.45 + 0.3 * (1 - this.energy),
      CRAWL: 0.25 + 0.25 * this.curiosity * this.daylight + (this.pos.distanceTo(this.home) > 0.25 ? 0.3 : 0),
      SHORT_SWIM: 0.08 + 0.15 * this.energy * this.daylight + (this.pos.distanceTo(this.home) > 0.5 ? 0.4 : 0),
      REST: 0.9 * (1 - this.daylight) + 0.6 * (1 - this.energy),
      COURTSHIP: this.male && this.nest ? this.breedingDrive * (0.6 + 0.4 * this.daylight) * (0.4 + 0.6 * this.energy) * (1 - this.fear) : 0,
      TERRITORIAL: this.male && P.conspecific?.male && P.distanceToConspecific < 0.1 ? this.territoriality * (this.nest ? 1.3 : 0.6) : 0,
    };
    s[this.state] = (s[this.state] || 0) * 1.15; // hysteresis
    let best = 'IDLE', bv = -1;
    for (const [k, v] of Object.entries(s)) { const j = v * (0.9 + 0.2 * r()); if (j > bv) { bv = j; best = k; } }
    return best;
  }

  _enter(state) {
    const r = this.rng;
    const was = this.state;
    this.state = state; this.t = 0; this.sub = {};
    const B = this.B;
    if (was === 'FREEZE' || was === 'TERRITORIAL' || was === 'COURTSHIP') { B.setAlert(null); B.erectFins(null); }
    if (was === 'BURY' || was === 'REST') B.bury(false);
    B.look(null);
    this.dur = {
      IDLE: 3 + 8 * r(), SCAN: 2 + 3 * r(), CRAWL: 2 + 2 * r(), SHORT_SWIM: 2.5, FREEZE: 1 + 2.5 * r(), ESCAPE: 3,
      BURY: 5 + 10 * r(), FORAGE: 8 + 10 * r(), REST: 15 + 20 * r(), COURTSHIP: 10 + 10 * r(), TERRITORIAL: 3 + 2 * r(),
    }[state];
  }

  _wanderHeading(spread = 1.0) {
    const p = this.pos, r = this.rng;
    const toHome = this.home.clone().sub(p).setY(0);
    let a = this.B.heading() + (r() * 2 - 1) * spread;
    if (toHome.length() > 0.2) a = Math.atan2(toHome.x, toHome.z) + (r() * 2 - 1) * 0.5;
    const cs = this.P.conspecific;
    if (cs && this.P.distanceToConspecific < 0.06) a = angleTo(cs.pos, p);
    return a;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    this.perceive();
    this._drives(dt);
    this.t += dt;
    this.clock = (this.clock ?? 0) + dt;
    const B = this.B, P = this.P, r = this.rng;
    // interrupts: danger overrides everything but an escape in progress
    if (this.state !== 'ESCAPE' && this.fear > 0.55 && P.threat) this._enter('ESCAPE');
    else if (!['ESCAPE', 'FREEZE', 'BURY'].includes(this.state) && this.fear > 0.3) this._enter('FREEZE');
    else if (this.t > this.dur && B.isIdle()) this._enter(this._decide());

    const sub = this.sub;
    switch (this.state) {
      case 'IDLE': {
        // perched on the pelvic disc; occasional D1 flick, slow re-orientation into the current (rheotaxis) [R]
        if (!sub.next) sub.next = 1 + 4 * r();
        if (this.t > sub.next && B.isIdle()) {
          const cur = this.world.current;
          if (cur && cur.lengthSq() > 1e-6 && r() < 0.5) B.hop(Math.atan2(-cur.x, -cur.z));
          else if (r() < 0.4) B.flick();
          sub.next = this.t + 3 + 6 * r();
        }
        break;
      }
      case 'SCAN': {
        // eyes first; head and body follow only when the target is out of eye range
        if (!sub.until || this.t > sub.until) {
          const a = B.heading() + (r() * 2 - 1) * 2.2, d = 0.05 + 0.2 * r();
          const p = this.pos;
          sub.pt = P.distanceToPlayer < 0.6 && r() < 0.5 ? this.world.player.position.clone()
            : new THREE.Vector3(p.x + Math.sin(a) * d, p.y + 0.01, p.z + Math.cos(a) * d);
          sub.until = this.t + 0.6 + 1.2 * r();
          B.look(sub.pt);
        }
        B.setAlert(0.6);
        break;
      }
      case 'CRAWL': {
        // saltatory movement: hop, stop, look [R]
        if (B.isIdle() && (!sub.next || this.t > sub.next)) { B.hop(this._wanderHeading(0.8)); sub.next = this.t + 0.8 + 1.5 * r(); }
        break;
      }
      case 'SHORT_SWIM': {
        if (!sub.done && B.isIdle()) { B.dart(0.08 + 0.15 * r(), this._wanderHeading(1.4)); sub.done = true; }
        break;
      }
      case 'FREEZE': {
        // motionless, alert posture, fins raised, eyes locked on the threat
        B.setAlert(1); B.erectFins(0.9); B.look(P.threat);
        if (this.t > this.dur) this.fear *= 0.9;
        break;
      }
      case 'ESCAPE': {
        if (!sub.fired) {
          const th = P.threat || this.pos;
          const away = angleTo(th, this.pos) + (r() * 2 - 1) * 0.7; // unpredictable escape trajectories [R]
          B.escape(away, 0.2 + 0.25 * r());
          sub.fired = true; this._landed = false;
        }
        if (this._landed || this.t > 2.5) {
          // land, then hide in the sand [F: 砂に潜る] or freeze
          this.fear *= 0.8;
          this._enter(r() < 0.6 ? 'BURY' : 'FREEZE');
        }
        break;
      }
      case 'BURY': {
        if (!sub.in) { B.bury(true); sub.in = true; }
        B.look(P.threat);
        if (this.fear > 0.6 && this.t > 1) this.fear *= 0.98; // feels safe once buried
        break;
      }
      case 'REST': {
        // night / exhausted: low activity; partly buried at night [G]
        if (!sub.in && this.daylight < 0.3) { B.bury(true); sub.in = true; }
        break;
      }
      case 'FORAGE': this._forage(dt); break;
      case 'COURTSHIP': this._courtship(dt); break;
      case 'TERRITORIAL': {
        // lateral display with erect fins, then a short charge [R/G]
        const o = P.conspecific;
        if (!o) { this.t = this.dur; break; }
        B.erectFins(1); B.setAlert(0.9); B.look(o.pos);
        if (!sub.charged && this.t > 1.5 && B.isIdle()) { B.dart(Math.min(0.06, P.distanceToConspecific), angleTo(this.pos, o.pos)); sub.charged = true; }
        break;
      }
    }
    this.actor.update(dt);
    this.debug = `${this.state} H${this.hunger.toFixed(2)} F${this.fear.toFixed(2)} E${this.energy.toFixed(2)}`;
  }

  /** Called by the actor's onEvent hook (see HimehazeActor) */
  onEvent(type) { if (type === 'land') this._landed = true; }

  // search (hop → stop → look) → fixate (eyes → head → body) → approach → suction strike → handle
  _forage(dt) {
    const B = this.B, P = this.P, r = this.rng, sub = this.sub;
    sub.step ??= 'search';
    if (sub.step === 'search' && P.food) { sub.step = 'fixate'; sub.prey = P.food; sub.t0 = this.t; }
    if (sub.prey?.eaten && sub.step !== 'handle') { sub.step = 'search'; sub.prey = null; }
    const prey = sub.prey;
    switch (sub.step) {
      case 'search':
        if (B.isIdle() && (!sub.next || this.t > sub.next)) { B.hop(this._wanderHeading(0.9)); sub.next = this.t + 1.0 + 1.2 * r(); }
        break;
      case 'fixate':
        B.look(prey.position); B.setAlert(0.7);
        if (this.t - sub.t0 > 0.35) sub.step = 'approach';
        break;
      case 'approach': {
        B.look(prey.position);
        const snout = this.actor.TL * 0.42; // pelvic pivot → snout
        const d = prey.position.distanceTo(this.pos) - snout;
        const a = angleTo(this.pos, prey.position);
        if (d < this.actor.TL * 0.25 && Math.abs(wrap(a - B.heading())) < 0.3) { sub.step = 'strike'; sub.t0 = this.t; break; }
        if (B.isIdle()) {
          if (d > 0.05) B.dart(Math.min(d - 0.02, 0.12), a);
          else B.hop(a);
        }
        if (this.t - sub.t0 > 8) { sub.step = 'search'; sub.prey = null; }
        break;
      }
      case 'strike':
        if (!sub.struck) { B.strike(); sub.struck = true; }
        if (this.t - sub.t0 > 0.06 && !sub.resolved) {
          sub.resolved = true;
          const p = 0.75 - prey.size * 40 + (prey.moving ? -0.1 : 0.1); // capture success [G]
          if (r() < p) { this.world.eat(prey); this.hunger = clamp(this.hunger - 0.1 - prey.size * 30, 0, 1); }
          sub.step = 'handle'; sub.t0 = this.t;
        }
        break;
      case 'handle':
        // winnowing: sand expelled through the gill openings after a bottom strike [R]
        B.look(null);
        if (!sub.winnow && this.t - sub.t0 > 0.3) { this.world.sand?.(this.pos, 0.1, B.heading()); sub.winnow = true; }
        if (this.t - sub.t0 > 1.2) { sub.step = 'search'; sub.prey = null; sub.struck = sub.resolved = sub.winnow = false; if (this.hunger < 0.2) this.t = this.dur; }
        break;
    }
  }

  // Nest-holding male. Nest maintenance [F]: dig outward from the nest along a ditch and sweep sand back out,
  // repeatedly (radial ditches). Display to a female [R/G]: fins erect, lateral presentation, lead to the nest.
  _courtship(dt) {
    const B = this.B, P = this.P, r = this.rng, sub = this.sub, nest = this.nest.position;
    const female = P.conspecific && !P.conspecific.male && P.distanceToConspecific < 0.25 ? P.conspecific : null;
    const fromNest = Math.hypot(nest.x - this.pos.x, nest.z - this.pos.z);
    sub.step ??= 'maintain';
    // a display bout lasts ~6–12 s; the male then returns to the nest and does not display again for a while [G]
    if (female && sub.step === 'maintain' && this.clock > (this._cool ?? 0) && fromNest < 0.15) { sub.step = 'display'; sub.t0 = this.t; sub.until = this.t + 6 + 6 * r(); }
    if (sub.step === 'display' && (this.t > sub.until || fromNest > 0.2)) { sub.step = 'maintain'; this._cool = this.clock + 12 + 10 * r(); B.erectFins(null); B.setAlert(null); }
    if (sub.step === 'maintain') {
      if (!B.isIdle()) return;
      if (fromNest > 0.06) { B.dart(Math.min(fromNest - 0.02, 0.15), angleTo(this.pos, nest)); return; }
      const out = sub.out ?? true;
      sub.ditch ??= this.nest.ditches[Math.floor(r() * this.nest.ditches.length)];
      const target = out ? new THREE.Vector3(nest.x + Math.sin(sub.ditch) * 0.07, 0, nest.z + Math.cos(sub.ditch) * 0.07) : nest;
      const d = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
      if (d > 0.015) B.hop(angleTo(this.pos, target));
      else {
        this.world.sand?.(this.pos, 0.3, B.heading() + Math.PI); // dig / sweep puff
        B.flick();
        sub.out = !out; if (sub.out) sub.ditch = null;
      }
    } else {
      if (!female) { sub.step = 'maintain'; B.erectFins(null); B.setAlert(null); return; }
      B.erectFins(1); B.setAlert(0.8); B.look(female.pos);
      const ph = (this.t - sub.t0) % 4;
      if (B.isIdle()) {
        if (ph < 1.5) B.hop(angleTo(this.pos, female.pos) + Math.PI / 2); // present the flank
        else if (ph < 2.5) B.dart(0.04, angleTo(this.pos, female.pos));
        else B.hop(angleTo(this.pos, nest));                         // lead toward the nest
      }
    }
  }
}
