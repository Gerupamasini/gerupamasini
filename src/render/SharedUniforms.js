// Uniforms shared (by reference) between every fish / environment material so
// the debug GUI and the world systems can drive them from one place.

import * as THREE from 'three';

const srgb = (hex) => new THREE.Color(hex); // Color.set() converts sRGB hex -> linear working space

export const U = {
  uTime: { value: 0 },
  uRig: { value: null },
  uDebugView: { value: 0 },

  // underwater light transport
  uCaustics: { value: null },
  uCausticParams: { value: new THREE.Vector4(0.26, 1.0, 0.46, 0) },
  uCausticLightDir: { value: new THREE.Vector3(0.25, 1, 0.15).normalize() },
  uWaterMin: { value: new THREE.Vector3(-0.6, 0, -0.225) },
  uWaterMax: { value: new THREE.Vector3(0.6, 0.46, 0.225) },
  // Pure-water absorption (Pope & Fry 1997) is ~[0.45, 0.064, 0.015] /m for
  // R,G,B; aquarium water adds dissolved organics (yellowing: blue absorbed)
  // and suspended particles (extinction + a blue-green in-scattered veil), so
  // the back of a 45 cm tank turns blue-green and loses contrast: a black
  // background reads as murky teal depth, never as a flat void.
  uWaterAbsorb: { value: new THREE.Vector3(1.5, 0.76, 0.8) },
  uWaterScatter: { value: new THREE.Color(0.05, 0.1, 0.1) },
  uWaterDensity: { value: 1.0 },

  // body pigments (sRGB anchors from the research report §7, tuned on photos)
  // the red is a deep, saturated carotenoid red (sarasa patches use it
  // unshifted; solid red / orange fish shift it toward orange individually)
  uColRed: { value: srgb('#d4160a') },
  uColOrange: { value: srgb('#e0661c') },
  uColYellow: { value: srgb('#e8b83a') },
  // white skin is a dense iridophore stack over pale flesh: pearly, i.e. a
  // warm-neutral diffuse part (light scattered back by the platelet stack)
  // plus a soft silvery sheen — neither paper nor a grey chrome mirror
  uColWhite: { value: srgb('#c2bcb2') },
  uColGill: { value: srgb('#b32831') },
  uScaleIntensity: { value: 1.0 },
  uRoughness: { value: 0.34 },
  uGuanine: { value: 0.62 },
  uIridescence: { value: 0.3 },
  uSSS: { value: 0.6 },
  uTranslucency: { value: 1.0 }, // tissue translucency (scales the mean free path)
  uKeyShadowMatrix: { value: new THREE.Matrix4() }, // world -> key-light shadow map
  uKeyShadowOn: { value: 0 },

  // fins
  uFinOpacity: { value: 0.85 },
  uFinTransmission: { value: 1.0 },
  uFinRoughness: { value: 0.32 },

  // eyes
  uIrisGold: { value: srgb('#c9973c') },
  uIrisRed: { value: srgb('#b8481e') },
  uIrisSilver: { value: srgb('#b8bcc0') },
  uPupil: { value: 0.46 }, // pupil radius / eyeball radius: ~half the visible eye
  uIrisMetal: { value: 0.15 }, // mostly diffuse guanine flecks: the iris stays readable at a distance
};
