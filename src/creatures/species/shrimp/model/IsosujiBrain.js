import * as THREE from 'three';
import { Brain } from './Brain.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const gauss = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/**
 * イソスジエビ behaviour on the rocky shore and in the アマモ場. It keeps the シラタエビ brain (drives, personality,
 * softmax choice with inertia, the giant-fibre reflex) and changes the repertoire:
 *   IDLE, WALK, FORAGE, SLOW_SWIM, HIDE, ESCAPE_BACKWARD (+ CLING on eelgrass, FEED, GROOM, INVESTIGATE).
 * Differences: nocturnal and cover-bound, swims only in short hops, walks over rock, escapes backward
 * then goes straight into cover, and holds on to eelgrass blades where there is a meadow.
 * World hooks used when present: groundY, nearestBlade, isFree, nearestShelter (shelter.kind 'amamo').
 */
export class IsosujiBrain extends Brain {
  constructor(shrimp, rng = Math.random) {
    super(shrimp, rng);
    this.behavior = 'IDLE';
    this.persona.swimminess = 0.3 + rng() * 0.5; // swims less than シラタエビ
    this.cling = null; // { blade, h, side, headUp, startH } while on a blade
  }

  stimulus(point, strength) {
    const sh = this.shrimp;
    const d = sh.position.distanceTo(point);
    const perceived = (strength * (1.3 - this.persona.boldness * 0.5)) / (1 + (d / 0.05) ** 2);
    this.s.fear = clamp01(this.s.fear + perceived);
    this.lastStimulus = { point: point.clone(), t: sh.time, strength: perceived };
    const threshold = 0.26 + sh.brainNoise() * 0.08;
    if (perceived > threshold && sh.canFlip()) {
      // ESCAPE_BACKWARD: abdominal flexion throws the animal backward (off the blade too)
      this.cling = null;
      this.intent.cling = null;
      sh.startTailFlip(point, perceived);
      this.setBehavior('ESCAPE_BACKWARD', 1.2);
    } else if (perceived > 0.05) {
      sh.startle(point, perceived);
      if (this.behavior !== 'ESCAPE_BACKWARD' && this.behavior !== 'CLING' && perceived > 0.12) {
        this.setBehavior(Math.random() < this.persona.boldness * 0.6 ? 'INVESTIGATE' : 'HIDE', 3);
      }
    }
  }

  update(dt, world) {
    const sh = this.shrimp;
    const s = this.s;
    const daylight = world.daylight;
    this.timeInBehavior += dt;
    const beh = this.behavior;

    // --- Drives (as シラタエビ; hiding and clinging rest the animal)
    const moving = sh.speed > 0.004 ? 1 : 0;
    const resting = beh === 'IDLE' || beh === 'HIDE' || (beh === 'CLING' && sh.mode === 'cling');
    s.hunger = clamp01(s.hunger + dt * 0.006 * (1 + moving * 0.5));
    s.fear = clamp01(s.fear - dt * 0.1 * (beh === 'HIDE' || beh === 'CLING' ? 1.8 : 1));
    s.fatigue = clamp01(s.fatigue + dt * (sh.mode === 'water' ? 0.018 : moving * 0.004) - dt * (resting ? 0.02 : 0.003));
    s.curiosity = clamp01(s.curiosity + dt * (beh === 'WALK' || beh === 'INVESTIGATE' ? -0.03 : 0.01));
    s.dirt = clamp01(s.dirt + dt * 0.006 - (beh === 'GROOM' ? dt * 0.08 : 0));
    // strongly nocturnal: out on the rock at night, in the crevices and weed by day [LIT]
    s.activityLevel = clamp01(this.persona.activity * (0.2 + 0.8 * (1 - daylight)) * (1 - s.fatigue * 0.7));
    s.shelterPreference = clamp01(0.3 + daylight * 0.6 + s.fear * 0.6 - this.persona.boldness * 0.2);

    // --- Perception
    const food = world.nearestFood(sh.position, 0.25);
    const foodDist = food ? food.position.distanceTo(sh.position) : Infinity;
    const smell = food ? clamp01(1 - foodDist / 0.25) * (1 + 0.5 * world.upstreamness(sh.position, food.position)) : 0;
    this.focusFood = food;
    const shelter = world.nearestShelter(sh.position);
    const blade = world.nearestBlade ? world.nearestBlade(sh.position, 0.14) : null;
    const neighbors = world.neighbors(sh, s.socialDistance * 1.5);

    // a finished escape goes straight into cover
    if (beh === 'ESCAPE_BACKWARD' && !sh.flip && this.timeInBehavior > 0.25) {
      s.fear = Math.max(s.fear, 0.6);
      this.setBehavior(blade && blade.dist < 0.08 ? 'CLING' : 'HIDE', 6 + Math.random() * 10);
    }

    // --- Decision
    if (sh.time >= this.nextDecision && !sh.flip) {
      const act = s.activityLevel;
      const inMeadow = blade ? 1 - clamp01(blade.dist / 0.14) : 0;
      const sc = {
        IDLE: 0.22 + s.fatigue * 0.6 + (1 - act) * 0.3,
        WALK: 0.3 * act,
        FORAGE: 0.08 + s.hunger * 0.8 * act * (food ? 0.4 : 1),
        SLOW_SWIM: 0.07 * act * this.persona.swimminess * (1 - s.fatigue),
        HIDE: s.shelterPreference * 0.5 * (shelter ? 1 : 0) + s.fear * 0.9,
        // in the アマモ場 the animal lives on the blades
        CLING: inMeadow * (0.45 + 0.3 * daylight + s.fear * 0.4),
        FEED: food && foodDist < 0.012 ? 1.3 * (0.3 + s.hunger) : 0,
        GROOM: 0.05 + s.dirt * 0.6,
        INVESTIGATE: smell * (0.4 + s.hunger) + (this.lastStimulus && sh.time - this.lastStimulus.t < 8 ? s.curiosity * this.persona.boldness * 0.4 : 0),
        ESCAPE_BACKWARD: 0,
      };
      sc.WALK += neighbors.length * 0.15 * (1 - this.persona.sociability);
      sc[this.behavior] = (sc[this.behavior] ?? 0) + (this.timeInBehavior < 15 ? 0.12 : -0.1) + (this.behavior === 'CLING' && sh.mode === 'cling' ? 0.25 : 0);
      for (const k in sc) sc[k] = Math.max(0, sc[k] * Math.exp(gauss() * 0.18));
      this.scores = sc;
      const T = 0.1;
      let sum = 0;
      const ex = {};
      for (const k in sc) sum += ex[k] = Math.exp(sc[k] / T);
      let r = Math.random() * sum;
      let pick = 'IDLE';
      for (const k in ex) {
        r -= ex[k];
        if (r <= 0) {
          pick = k;
          break;
        }
      }
      const durations = { IDLE: [2, 8], WALK: [3, 8], FORAGE: [5, 14], SLOW_SWIM: [2, 5], HIDE: [8, 25], CLING: [15, 40], FEED: [4, 9], GROOM: [3, 7], INVESTIGATE: [3, 7], ESCAPE_BACKWARD: [1, 2] };
      const [a, b] = durations[pick];
      if (pick !== 'CLING' && this.behavior === 'CLING') this.cling = null;
      this.setBehavior(pick, a + Math.random() * (b - a));
      if (pick === 'GROOM') this.intent.groomPart = Math.random() < 0.65 ? 'antenna' : Math.random() < 0.5 ? 'body' : 'eye';
    }

    // --- Execute
    const it = this.intent;
    it.target = null;
    it.face = null;
    it.cling = null;
    it.antenna = 'rest';
    it.arms = 'rest';
    it.rheotaxis = world.flowSpeed > 0.004 ? s.flowPreference : 0;
    it.mode = 'ground';
    it.speed = 0;
    const walkSpeed = sh.walkSpeed;
    const floorAt = (x, z) => (world.groundY ? world.groundY(x, z, 0.3) : world.heightAt(x, z));
    const pickPoint = (radius, yMode = 'ground') => {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = radius * (0.4 + Math.random() * 0.6);
        const p = new THREE.Vector3(sh.position.x + Math.cos(a) * r, 0, sh.position.z + Math.sin(a) * r);
        if (!world.isFree(p, 0.012)) continue;
        // targets may lie on top of rock: the legs walk over it
        p.y = floorAt(p.x, p.z) + (yMode === 'ground' ? 0 : 0.015 + Math.random() * 0.03);
        return p;
      }
      return null;
    };
    const ensureTarget = (radius, yMode) => {
      if (!this.hasTarget || sh.position.distanceTo(this.target) < 0.012) {
        const p = pickPoint(radius, yMode);
        if (p) {
          this.target.copy(p);
          this.hasTarget = true;
        }
      }
      return this.hasTarget ? this.target : null;
    };

    switch (this.behavior) {
      case 'IDLE':
        // still, with the antennules flicking and the antennae slowly sweeping (Shrimp.animate)
        break;
      case 'WALK':
        it.target = ensureTarget(0.12);
        it.speed = walkSpeed * (0.6 + s.activityLevel * 0.5);
        break;
      case 'FORAGE':
        it.target = ensureTarget(0.05);
        it.speed = walkSpeed * 0.3;
        it.arms = 'forage';
        it.antenna = 'sweep';
        s.hunger = clamp01(s.hunger - dt * 0.004); // grazing the film on the rock
        break;
      case 'SLOW_SWIM': {
        // a short hop to another rock or patch of weed, then down again
        if (!this.hasTarget) ensureTarget(0.15, 'water');
        it.mode = 'water';
        it.target = this.hasTarget ? this.target : null;
        it.speed = sh.swimSpeed * 0.6;
        if (this.hasTarget && sh.position.distanceTo(this.target) < 0.015) this.setBehavior('IDLE', 2 + Math.random() * 4);
        break;
      }
      case 'HIDE':
        if (shelter && shelter.kind === 'amamo' && blade) {
          this.setBehavior('CLING', 15 + Math.random() * 20);
          break;
        }
        if (shelter) {
          it.target = shelter.position;
          it.speed = walkSpeed * (0.6 + s.fear);
          if (sh.position.distanceTo(shelter.position) < 0.015) {
            // backed into the crevice, head and antennae toward the opening
            it.target = null;
            it.face = shelter.facing;
          }
        }
        it.antenna = s.fear > 0.3 ? 'back' : 'rest';
        break;
      case 'CLING': {
        if (!blade && !this.cling) {
          this.nextDecision = 0;
          break;
        }
        if (!this.cling && blade) {
          // walk to the foot of the blade, on one face of it
          const side = blade.facing;
          const goal = blade.base.clone().addScaledVector(blade.normal, side * 0.004);
          goal.y = floorAt(goal.x, goal.z);
          if (Math.hypot(goal.x - sh.position.x, goal.z - sh.position.z) > 0.01) {
            it.target = goal;
            it.speed = walkSpeed * (0.7 + s.fear);
            break;
          }
          this.cling = { blade: blade.index, h: 0, side, headUp: Math.random() < 0.75, startH: 0.008, len: blade.length, nextMove: 0 };
        }
        const c = this.cling;
        if (sh.time >= c.nextMove) {
          // climb to a new station on the blade now and then
          c.h = c.len * (0.15 + Math.random() * 0.55);
          c.nextMove = sh.time + 6 + Math.random() * 12;
        }
        it.cling = c;
        // picking at the epiphyte film on the leaf, antennae out into the current
        const picking = Math.sin(sh.time * 0.4 + this.persona.boldness * 6) > 0.2;
        it.arms = picking ? 'forage' : 'rest';
        it.antenna = picking ? 'sweep' : 'rest';
        if (picking) s.hunger = clamp01(s.hunger - dt * 0.003);
        break;
      }
      case 'GROOM':
        it.arms = 'groom';
        break;
      case 'FEED':
        if (food && foodDist < 0.02) {
          it.face = food.position;
          it.arms = 'feed';
          it.antenna = 'forward';
          food.consume(dt * 0.02);
          s.hunger = clamp01(s.hunger - dt * 0.05);
        } else this.nextDecision = 0;
        break;
      case 'INVESTIGATE': {
        const goal = food ? food.position : this.lastStimulus ? this.lastStimulus.point : null;
        if (goal) {
          const approach = new THREE.Vector3().subVectors(sh.position, goal).setY(0);
          const stop = food ? 0.008 : 0.04;
          if (approach.length() > stop) {
            it.target = goal.clone().add(approach.normalize().multiplyScalar(stop));
            it.target.y = floorAt(it.target.x, it.target.z);
          }
          it.face = goal;
          it.speed = walkSpeed * (food ? 0.6 : 0.35);
          if (food && foodDist < 0.012) this.nextDecision = 0;
        }
        it.antenna = 'forward';
        break;
      }
      case 'ESCAPE_BACKWARD':
        it.mode = sh.mode === 'cling' ? 'water' : sh.mode;
        it.antenna = 'back';
        break;
    }

    // social spacing on the ground (not while holding a blade)
    if (sh.mode !== 'cling') {
      for (const n of neighbors) {
        const d = n.position.distanceTo(sh.position);
        if (d < s.socialDistance && d > 1e-4) {
          sh.socialPush.subVectors(sh.position, n.position).setY(0).multiplyScalar((s.socialDistance - d) / d);
          if (d < 0.02 && Math.random() < dt * 0.5) this.stimulus(n.position, 0.08);
        }
      }
    }
  }
}
