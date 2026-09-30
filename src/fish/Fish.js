// One goldfish individual: morphology + colour variation, personality,
// locomotion (motor layer), rig (spine + fin dynamics) and — when attached —
// a behaviour brain.

import * as THREE from 'three';
import { RNG } from '../core/random.js';
import { clamp } from '../core/math.js';
import { Locomotion } from './Locomotion.js';
import { FishRig } from './FishRig.js';
import { clampToTank } from '../ai/Steering.js';

export const COLOR_TYPES = ['sarasa', 'red', 'orange', 'yellow', 'white'];

/**
 * Personality axes from the behaviour report (§6): activity (lognormal,
 * CV≈0.3), boldness (Beta(2,2)), exploration correlated with boldness,
 * sociality weakly anti-correlated, independent thigmotaxis, feeding
 * motivation, preferred depth N(0.3,0.15), laterality (2/3 unbiased, rest
 * biased with right:left ≈ 1.5:1).
 */
export function makePersonality(rng) {
  const g1 = rng.gauss();
  const g2 = rng.gauss();
  const g3 = rng.gauss();
  const beta22 = () => {
    // Beta(2,2) via order statistic of 3 uniforms
    const a = [rng.next(), rng.next(), rng.next()].sort((x, y) => x - y);
    return a[1];
  };
  const boldness = clamp(beta22() * 0.8 + 0.1 + g1 * 0.08, 0.02, 0.98);
  const lateralized = rng.next() < 1 / 3;
  let turnBias = rng.range(-0.15, 0.15);
  if (lateralized) turnBias = (rng.next() < 0.6 ? 1 : -1) * rng.range(0.3, 0.8);
  return {
    activity: clamp(Math.exp(0.3 * (0.6 * g1 + 0.8 * g2) - 0.045), 0.5, 1.6),
    boldness,
    fearfulness: 1 - boldness,
    curiosity: clamp(0.5 + 0.4 * (boldness - 0.5) + 0.2 * g2, 0.05, 1),
    sociality: clamp(0.55 - 0.2 * (boldness - 0.5) + 0.2 * g3, 0.05, 1),
    thigmotaxis: clamp(rng.next(), 0, 1),
    feedMotivation: rng.range(0.7, 1.3),
    preferredDepth: clamp(rng.normal(0.3, 0.15), 0.06, 0.85),
    turnBias,
    burstCoast: rng.range(0, 1),
  };
}

export function makeVariation(rng, forceType = null) {
  const typeIdx = forceType !== null ? forceType : rng.weighted([0.55, 0.18, 0.1, 0.08, 0.09]);
  const type = COLOR_TYPES[typeIdx];
  const v = {
    SL: clamp(rng.normal(0.095, 0.012), 0.07, 0.125),
    depthScale: clamp(rng.normal(1, 0.04), 0.9, 1.1),
    widthScale: clamp(rng.normal(1, 0.05), 0.88, 1.12),
    caudalLobe: clamp(rng.normal(0.76, 0.08), 0.6, 0.98),
    caudalFork: rng.range(0.22, 0.28),
    dorsalHeight: rng.range(0.26, 0.33),
    pectoralLength: rng.range(0.23, 0.29),
    pelvicLength: rng.range(0.25, 0.33),
    analLength: rng.range(0.17, 0.22),
    colorType: typeIdx,
    colorName: type,
    seed: rng.range(0, 100),
    redCoverage: rng.range(0.3, 0.62),
    hueShift: rng.range(-0.25, 0.35),
    sparkle: rng.range(0.8, 1.2),
    finAlpha: rng.range(0.9, 1.1),
    irisHue: 0.5,
    finRedCaudal: -0.3,
    finRedDorsal: -0.3,
    finRedOther: -0.3,
  };
  if (type === 'sarasa') {
    v.finRedCaudal = rng.next() < 0.55 ? rng.range(0.12, 0.45) : -0.3;
    v.finRedDorsal = rng.next() < 0.6 ? rng.range(0.2, 0.55) : -0.3;
    v.finRedOther = rng.next() < 0.35 ? rng.range(0.08, 0.3) : -0.3;
    v.irisHue = rng.range(0.2, 1.0);
  } else if (type === 'white') {
    v.irisHue = rng.range(1.3, 2.0);
  } else {
    v.finRedCaudal = rng.range(0.5, 0.9);
    v.finRedDorsal = rng.range(0.6, 0.95);
    v.finRedOther = rng.range(0.45, 0.85);
    v.irisHue = type === 'red' ? rng.range(0.5, 1.0) : rng.range(0.0, 0.5);
  }
  return v;
}

let _id = 0;

export class Fish {
  constructor(layout, { seed = Math.floor(Math.random() * 1e9), colorType = null, name = null } = {}) {
    this.id = _id++;
    this.rng = new RNG(seed);
    this.seed = seed;
    this.variation = makeVariation(this.rng, colorType);
    this.personality = makePersonality(this.rng);
    this.SL = this.variation.SL;
    this.name = name || `comet-${this.id}`;
    this.loc = new Locomotion(this);
    this.rig = new FishRig(layout, this.variation, this.SL);
    this.brain = null;
    this.row = -1;
    this.lod = 0;
    this.visible = true;
    this.distance = 0;
    this.boundRadius = this.SL * (1.1 + this.variation.caudalLobe * 0.6);
    this.flume = false;
    this.flumeAnchor = new THREE.Vector3();
  }

  get position() {
    return this.loc.pos;
  }

  /** Snout position (world). */
  headPosition(out = new THREE.Vector3()) {
    return out.copy(this.loc.forward).multiplyScalar(this.SL * 0.36).add(this.loc.pos);
  }

  update(dt, time, world) {
    if (this.brain) this.brain.update(dt, time, world);
    this.loc.update(dt, time);
    if (world && !this.flume) {
      clampToTank(this, world);
      world.flowAt(this.loc.pos, this.rig.flow);
    }
    if (this.flume) {
      // flume / treadmill: the fish holds station against a current
      this.rig.flow.copy(this.loc.vel).negate();
      this.loc.pos.copy(this.flumeAnchor);
    }
    this.rig.setSpine(this.loc.pos, this.loc.quat, this.loc.localP, this.loc.localQ);
    this.loc.writeFinPose(this.rig.pose);
    this.rig.update(dt, dt > 1 / 45 ? 3 : 2);
  }

  /** misc texels (4 x vec4) for the rig texture row */
  writeMisc(data, o) {
    const v = this.variation;
    const L = this.loc;
    data[o++] = L.mouth;
    data[o++] = L.operc[0];
    data[o++] = L.operc[1];
    data[o++] = this.SL;
    data[o++] = v.depthScale;
    data[o++] = v.widthScale;
    data[o++] = v.colorType;
    data[o++] = v.seed;
    data[o++] = v.redCoverage;
    data[o++] = v.hueShift;
    data[o++] = v.finRedCaudal;
    data[o++] = v.finRedDorsal;
    data[o++] = v.irisHue;
    data[o++] = v.sparkle;
    data[o++] = v.finAlpha;
    data[o++] = v.finRedOther;
    return o;
  }
}
