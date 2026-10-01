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
 * motivation, preferred depth N(0.45,0.16), laterality (2/3 unbiased, rest
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
    // comets use the whole water column; most individuals favour mid-water
    preferredDepth: clamp(rng.normal(0.45, 0.16), 0.1, 0.85),
    turnBias,
    burstCoast: rng.range(0, 1),
    // calmness: how long this individual tends to hold still once it stops
    // (placid fish linger, busy ones set off sooner)
    calm: clamp(Math.exp(rng.normal(0, 0.15)) * (1.12 - 0.12 * clamp(Math.exp(0.3 * (0.6 * g1 + 0.8 * g2) - 0.045), 0.5, 1.6)), 0.75, 1.35),
  };
}

export function makeVariation(rng, forceType = null) {
  const typeIdx = forceType !== null ? forceType : rng.weighted([0.55, 0.18, 0.1, 0.08, 0.09]);
  const type = COLOR_TYPES[typeIdx];
  const v = {
    // individuals in one tank differ clearly in size (about +-25 %) and in
    // build: slim, torpedo-like fish next to deep-bodied ones (body depth
    // roughly 0.28 .. 0.37 SL); deeper fish are also a little broader
    SL: clamp(rng.normal(0.095, 0.016), 0.071, 0.122),
    depthScale: clamp(rng.normal(1.03, 0.065), 0.87, 1.16),
    widthScale: clamp(rng.normal(1, 0.04), 0.9, 1.1),
    caudalLobe: clamp(rng.normal(0.76, 0.08), 0.6, 0.98),
    caudalFork: rng.range(0.22, 0.28),
    dorsalHeight: rng.range(0.22, 0.28),
    pectoralLength: rng.range(0.27, 0.33),
    pelvicLength: rng.range(0.3, 0.38),
    analLength: rng.range(0.19, 0.25),
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
  v.widthScale = clamp(v.widthScale + 0.45 * (v.depthScale - 1.0), 0.86, 1.16);
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
  // Pigment individuality (from a sub-generator seeded by this fish, so the
  // draws above and the personality that follows keep their values):
  // carotenoid density (pale orange-red .. deep crimson), saturation (clean ..
  // slightly greyed / dusky) and how pale the belly is. Real comets in one
  // tank range from deep blood red to orange and pale golden orange.
  const cr = new RNG(Math.floor(v.seed * 1e7) + 0x2545f491);
  v.pigDark = cr.next();
  v.pigSat = clamp(0.55 + 0.45 * cr.next() * (1.3 - 0.3 * v.pigDark), 0, 1);
  v.bellyPale = cr.next();
  if (type === 'red' || type === 'orange') {
    // solid fish spread over the whole red .. orange range
    v.hueShift = cr.range(-0.35, 0.75);
  }
  return v;
}

let _id = 0;


export class Fish {
  static prof = { brain: 0, loc: 0, rig: 0, n: 0 };
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
    // the fin rays are attached to the standard body profile: move their
    // roots with this individual's body depth / width (the body and the eyes
    // are scaled the same way), so the dorsal / anal / paired fins neither
    // float above a slim back nor sink into a deep one
    for (const ch of this.rig.chains) {
      ch.rootLocal.y *= this.variation.depthScale;
      ch.rootLocal.z *= this.variation.widthScale;
    }
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
    const P = Fish.prof;
    let t0 = performance.now();
    if (this.brain) this.brain.update(dt, time, world);
    let t1 = performance.now();
    P.brain += t1 - t0;
    this.loc.update(dt, time);
    t0 = performance.now();
    P.loc += t0 - t1;
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
    t1 = performance.now();
    this.rig.update(dt, dt > 1 / 45 ? 3 : 2);
    P.rig += performance.now() - t1;
    P.n++;
  }

  /** misc texels (5 x vec4) for the rig texture row */
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
    // head articulation: premaxillary protrusion, throat expansion, yawn, spare
    data[o++] = L.protrusion;
    data[o++] = L.throat;
    data[o++] = L.yawnLevel;
    // pigment tone packed as three 6-bit fields (exact in float32)
    const q6 = (x) => Math.round(clamp(x, 0, 1) * 63);
    data[o++] = q6(v.pigDark) * 4096 + q6(v.pigSat) * 64 + q6(v.bellyPale);
    return o;
  }
}
