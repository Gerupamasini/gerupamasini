import * as THREE from 'three';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const gauss = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/**
 * Utility AI with internal drives, personality, stochastic selection (softmax),
 * commitment/hysteresis and reflex interrupts. The brain never animates; it
 * emits an `intent` consumed by the locomotion/animation controller.
 */
export class Brain {
  constructor(shrimp, rng = Math.random) {
    this.shrimp = shrimp;
    // Personality: stable individual differences.
    this.persona = {
      boldness: 0.3 + rng() * 0.7,
      activity: 0.6 + rng() * 0.8,
      sociability: rng(),
      swimminess: 0.4 + rng() * 0.8,
    };
    this.s = {
      hunger: 0.2 + rng() * 0.5,
      fear: 0,
      curiosity: 0.3 + rng() * 0.5,
      fatigue: rng() * 0.3,
      dirt: rng() * 0.5, // grooming need
      shelterPreference: 0.5,
      flowPreference: 0.5 + rng() * 0.3,
      socialDistance: 0.05 + rng() * 0.04, // m (~1-2 body lengths)
      activityLevel: 0.5,
    };
    this.behavior = 'idle';
    this.timeInBehavior = 0;
    this.minDuration = 2;
    this.nextDecision = 0;
    this.target = new THREE.Vector3();
    this.hasTarget = false;
    this.focusFood = null;
    this.lastStimulus = null;
    this.scores = {};
    this.intent = {
      mode: 'ground', // ground | water
      target: null,
      speed: 0,
      antenna: 'rest', // rest | sweep | forward | flick | back
      arms: 'rest', // rest | forage | feed | groom
      groomPart: 'antenna',
      face: null, // Vector3 to face when stationary
      rheotaxis: 0,
      hoverHeight: 0.05,
    };
  }

  /** Called when a stimulus occurs (tap, shadow, contact). */
  stimulus(point, strength) {
    const sh = this.shrimp;
    const d = sh.position.distanceTo(point);
    const perceived = (strength * (1.3 - this.persona.boldness * 0.5)) / (1 + (d / 0.05) ** 2);
    this.s.fear = clamp01(this.s.fear + perceived);
    this.lastStimulus = { point: point.clone(), t: sh.time, strength: perceived };
    // Reflex layer (Mauthner-like giant-fibre escape bypasses deliberation).
    const threshold = 0.28 + (sh.brainNoise() * 0.08);
    if (perceived > threshold && sh.canFlip()) {
      sh.startTailFlip(point, perceived);
      this.setBehavior('flee', 1.5);
    } else if (perceived > 0.05) {
      sh.startle(point, perceived);
      if (this.behavior !== 'flee' && perceived > 0.12) this.setBehavior(Math.random() < this.persona.boldness ? 'investigate' : 'hide', 2);
    }
  }

  setBehavior(b, minDur) {
    if (b !== this.behavior) {
      this.behavior = b;
      this.timeInBehavior = 0;
      this.hasTarget = false;
    }
    this.minDuration = minDur;
    this.nextDecision = this.shrimp.time + minDur;
  }

  update(dt, world) {
    const sh = this.shrimp;
    const s = this.s;
    const daylight = world.daylight; // 0 night .. 1 day
    this.timeInBehavior += dt;

    // --- Drive dynamics ---
    const moving = sh.speed > 0.005 ? 1 : 0;
    s.hunger = clamp01(s.hunger + dt * 0.006 * (1 + moving * 0.5));
    s.fear = clamp01(s.fear - dt * 0.12 * (this.behavior === 'hide' ? 1.8 : 1));
    s.fatigue = clamp01(s.fatigue + dt * (sh.mode === 'water' ? 0.012 : moving * 0.004) - dt * (this.behavior === 'idle' || this.behavior === 'hide' ? 0.02 : 0.003));
    s.curiosity = clamp01(s.curiosity + dt * (this.behavior === 'explore' || this.behavior === 'investigate' ? -0.03 : 0.01));
    s.dirt = clamp01(s.dirt + dt * (sh.mode === 'ground' ? 0.008 : 0.004) - (this.behavior === 'groom' ? dt * 0.08 : 0));
    // Palaemonids are more active at night [R]; shelter preference rises by day.
    s.activityLevel = clamp01(this.persona.activity * (0.35 + 0.65 * (1 - daylight)) * (1 - s.fatigue * 0.7));
    s.shelterPreference = clamp01(0.25 + daylight * 0.5 + s.fear * 0.6 - this.persona.boldness * 0.2);

    // --- Perception ---
    const food = world.nearestFood(sh.position, 0.25);
    const foodDist = food ? food.position.distanceTo(sh.position) : Infinity;
    // Chemoreception: plumes carry downstream, so detection is better if food is upstream.
    const smell = food ? clamp01(1 - foodDist / 0.25) * (1 + 0.5 * world.upstreamness(sh.position, food.position)) : 0;
    this.focusFood = food;
    const shelter = world.nearestShelter(sh.position);
    const neighbors = world.neighbors(sh, s.socialDistance * 1.5);
    const crowd = neighbors.length;

    // --- Decision ---
    const mustDecide = sh.time >= this.nextDecision && !sh.flip;
    if (mustDecide) {
      const act = s.activityLevel;
      const sc = {
        idle: 0.25 + s.fatigue * 0.6 + (1 - act) * 0.3,
        walk: 0.3 * act,
        forage: s.hunger * 0.7 * act * (food ? 0.4 : 1),
        explore: s.curiosity * 0.55 * act,
        swim: 0.22 * act * this.persona.swimminess * (1 - s.fatigue) * (1 - daylight * 0.5),
        hover: 0.12 + 0.18 * this.persona.swimminess * (1 - s.fatigue) * (world.flowSpeed > 0.01 ? s.flowPreference : 0.6),
        groom: 0.08 + s.dirt * 0.65,
        feed: food && foodDist < 0.012 ? 1.3 * (0.3 + s.hunger) : 0,
        investigate: smell * (0.4 + s.hunger) + (this.lastStimulus && sh.time - this.lastStimulus.t < 8 ? s.curiosity * this.persona.boldness * 0.5 : 0),
        hide: s.shelterPreference * 0.45 * (shelter ? 1 : 0) + s.fear * 0.9,
        flee: 0,
      };
      sc.walk += crowd * 0.15 * (1 - this.persona.sociability); // spread out
      sc[this.behavior] = (sc[this.behavior] ?? 0) + (this.timeInBehavior < 15 ? 0.12 : -0.1); // inertia vs boredom
      // Multiplicative noise so identical conditions still diverge.
      for (const k in sc) sc[k] = Math.max(0, sc[k] * Math.exp(gauss() * 0.18));
      this.scores = sc;
      // Softmax sample
      const T = 0.1;
      let sum = 0;
      const ex = {};
      for (const k in sc) sum += ex[k] = Math.exp(sc[k] / T);
      let r = Math.random() * sum;
      let pick = 'idle';
      for (const k in ex) {
        r -= ex[k];
        if (r <= 0) {
          pick = k;
          break;
        }
      }
      const durations = { idle: [2, 8], walk: [3, 8], forage: [5, 14], explore: [4, 10], swim: [3, 7], hover: [3, 9], groom: [3, 7], feed: [4, 9], investigate: [3, 7], hide: [8, 25], flee: [1, 2] };
      const [a, b] = durations[pick];
      this.setBehavior(pick, a + Math.random() * (b - a));
      if (pick === 'groom') this.intent.groomPart = Math.random() < 0.65 ? 'antenna' : Math.random() < 0.5 ? 'body' : 'eye';
    }

    // --- Execute: set intent ---
    const it = this.intent;
    it.target = null;
    it.face = null;
    it.antenna = 'rest';
    it.arms = 'rest';
    it.rheotaxis = world.flowSpeed > 0.004 ? s.flowPreference : 0;
    it.mode = 'ground';
    it.speed = 0;
    const walkSpeed = sh.walkSpeed;
    const pickPoint = (radius, yMode = 'ground') => {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = radius * (0.4 + Math.random() * 0.6);
        const p = new THREE.Vector3(sh.position.x + Math.cos(a) * r, 0, sh.position.z + Math.sin(a) * r);
        if (!world.isFree(p, 0.015)) continue;
        p.y = yMode === 'ground' ? world.heightAt(p.x, p.z) : world.heightAt(p.x, p.z) + 0.03 + Math.random() * 0.08;
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
      case 'idle':
        it.antenna = Math.random() < 0.02 ? 'flick' : 'rest';
        it.face = null;
        break;
      case 'walk':
        it.target = ensureTarget(0.12);
        it.speed = walkSpeed * (0.6 + s.activityLevel * 0.5);
        break;
      case 'forage':
        it.target = ensureTarget(0.06);
        it.speed = walkSpeed * 0.35;
        it.arms = 'forage';
        it.antenna = 'sweep';
        s.hunger = clamp01(s.hunger - dt * 0.004); // biofilm grazing
        break;
      case 'explore':
        it.target = ensureTarget(0.15);
        it.speed = walkSpeed * 0.5;
        it.antenna = 'sweep';
        break;
      case 'swim':
        it.mode = 'water';
        it.target = ensureTarget(0.18, 'water');
        it.speed = sh.swimSpeed;
        break;
      case 'hover':
        it.mode = 'water';
        if (!this.hasTarget) {
          this.target.copy(sh.position);
          this.target.y = Math.max(sh.position.y, world.heightAt(sh.position.x, sh.position.z) + 0.02 + Math.random() * 0.04);
          this.hasTarget = true;
        }
        it.target = this.target;
        it.speed = 0;
        it.antenna = Math.random() < 0.5 ? 'rest' : 'flick';
        break;
      case 'groom':
        it.arms = 'groom';
        break;
      case 'feed':
        if (food && foodDist < 0.02) {
          it.face = food.position;
          it.arms = 'feed';
          it.antenna = 'forward';
          food.consume(dt * 0.02);
          s.hunger = clamp01(s.hunger - dt * 0.05);
        } else this.nextDecision = 0;
        break;
      case 'investigate': {
        const goal = food ? food.position : this.lastStimulus ? this.lastStimulus.point : null;
        if (goal) {
          const approach = new THREE.Vector3().subVectors(sh.position, goal).setY(0);
          const stop = food ? 0.008 : 0.04; // keep distance from unknown stimulus
          if (approach.length() > stop) {
            it.target = goal.clone().add(approach.normalize().multiplyScalar(stop));
            it.target.y = world.heightAt(it.target.x, it.target.z);
          }
          it.face = goal;
          it.speed = walkSpeed * (food ? 0.6 : 0.35);
          if (food && foodDist < 0.012) this.nextDecision = 0;
        }
        it.antenna = 'forward';
        break;
      }
      case 'hide':
        if (shelter) {
          it.target = shelter.position;
          it.speed = walkSpeed * (0.6 + s.fear);
          if (sh.position.distanceTo(shelter.position) < 0.015) {
            it.target = null;
            it.face = shelter.facing;
          }
        }
        it.antenna = s.fear > 0.3 ? 'back' : 'rest';
        break;
      case 'flee':
        it.mode = sh.mode;
        it.antenna = 'back';
        break;
    }

    // Social spacing: nudge target away from neighbours closer than socialDistance.
    for (const n of neighbors) {
      const d = n.position.distanceTo(sh.position);
      if (d < s.socialDistance && d > 1e-4) {
        sh.socialPush.subVectors(sh.position, n.position).setY(0).multiplyScalar((s.socialDistance - d) / d);
        if (d < 0.02 && Math.random() < dt * 0.5) {
          // Antennal contact can trigger a small startle or investigation.
          this.stimulus(n.position, 0.08);
        }
      }
    }
  }
}
