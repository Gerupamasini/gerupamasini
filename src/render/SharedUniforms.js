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
  // R,G,B; aquarium water adds a little DOM/particle extinction.
  uWaterAbsorb: { value: new THREE.Vector3(0.62, 0.16, 0.12) },
  uWaterScatter: { value: new THREE.Color(0.012, 0.03, 0.036) },
  uWaterDensity: { value: 1.0 },

  // body pigments (sRGB anchors from the research report §7, tuned on photos)
  uColRed: { value: srgb('#d0290c') },
  uColOrange: { value: srgb('#e0661c') },
  uColYellow: { value: srgb('#e8b83a') },
  uColWhite: { value: srgb('#e6eaee') },
  uColGill: { value: srgb('#b32831') },
  uScaleIntensity: { value: 1.0 },
  uRoughness: { value: 0.34 },
  uGuanine: { value: 0.55 },
  uIridescence: { value: 0.3 },
  uSSS: { value: 0.6 },
  uTranslucency: { value: 1.0 }, // tissue translucency (scales the mean free path)
  uKeyShadowMatrix: { value: new THREE.Matrix4() }, // world -> key-light shadow map
  uKeyShadowOn: { value: 0 },

  // fins
  uFinOpacity: { value: 1.0 },
  uFinTransmission: { value: 1.0 },
  uFinRoughness: { value: 0.32 },

  // eyes
  uIrisGold: { value: srgb('#c9973c') },
  uIrisRed: { value: srgb('#b8481e') },
  uIrisSilver: { value: srgb('#b8bcc0') },
  uPupil: { value: 0.46 }, // pupil radius / eyeball radius: ~half the visible eye
  uIrisMetal: { value: 0.3 },
};
