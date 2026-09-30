// Development GUI (lil-gui): animation, locomotion, fins, materials, eyes,
// AI, LOD, lighting / water, and debug views.

import GUI from 'lil-gui';
import * as THREE from 'three';
import { U } from '../render/SharedUniforms.js';
import { ANIMS } from '../fish/AnimDemo.js';
import { STATES } from '../ai/Brain.js';
import { COLOR_TYPES } from '../fish/Fish.js';

export function buildGUI(app) {
  const gui = new GUI({ title: 'Comet Goldfish — Debug', width: 320 });
  const fs = app.fishSystem;
  const all = () => fs.fish;
  const sel = () => app.selected;

  // ------------------------------------------------------------ simulation
  const sim = gui.addFolder('Simulation');
  const simP = {
    fishCount: fs.fish.length,
    feed: () => app.feed(),
    tap: () => app.tapGlass(),
    loom: () => app.loom(),
    startleAll: () => {
      for (const f of all()) if (f.brain) f.brain.triggerStartle(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), 1, app.time);
    },
    nextFish: () => app.selectNext(),
    hungerMinutes: 6,
  };
  sim.add(app, 'timeScale', 0.02, 2, 0.01).name('time scale (slow-mo)');
  sim.add(app, 'paused');
  if (app.world) {
    sim.add(simP, 'fishCount', 1, 40, 1).name('fish count').onFinishChange((v) => app.setFishCount(v));
    sim.add(simP, 'feed').name('feed (F)');
    sim.add(simP, 'tap').name('tap glass (T)');
    sim.add(simP, 'loom').name('overhead shadow (L)');
    sim.add(simP, 'startleAll').name('startle all');
    sim.add(simP, 'hungerMinutes', 1, 30, 0.5).name('hunger build-up (min)').onChange((v) => {
      for (const f of all()) if (f.brain) f.brain.params.hungerTime = v * 60;
    });
  }
  sim.add(simP, 'nextFish').name('select next fish (N)');
  sim.add(app, 'cameraMode', ['orbit', 'follow']).name('camera (C)').listen();

  // ------------------------------------------------------------ animation
  const an = gui.addFolder('Animation');
  const anP = { anim: app.anim.anim, target: app.animTarget };
  an.add(anP, 'anim', ANIMS).name('animation').onChange((v) => app.anim.set(v));
  if (app.world) an.add(app, 'animTarget', ['selected', 'all']).name('apply to');
  const mot = {
    swimSpeed: 0,
    overrideSpeed: false,
    tailAmp: 1,
    tailFreq: 1,
    finStiffness: 1,
    finDrag: 1,
    breathing: 1,
  };
  an.add(mot, 'overrideSpeed').name('override swim speed').onChange((v) => {
    const f = sel();
    if (f) f.loc.override.enabled = v;
  });
  an.add(mot, 'swimSpeed', 0, 6, 0.05).name('swim speed (BL/s)').onChange((v) => {
    for (const f of all()) f.loc.override.speed = v;
  });
  an.add(mot, 'tailAmp', 0, 2.5, 0.01).name('tail amplitude ×').onChange((v) => all().forEach((f) => (f.loc.globalMul.amp = v)));
  an.add(mot, 'tailFreq', 0.2, 2.5, 0.01).name('tail frequency ×').onChange((v) => all().forEach((f) => (f.loc.globalMul.freq = v)));
  an.add(mot, 'finStiffness', 0.2, 2.5, 0.01).name('fin stiffness ×').onChange((v) => all().forEach((f) => (f.rig.stiffnessMul = v)));
  an.add(mot, 'finDrag', 0.2, 3, 0.01).name('fin water drag ×').onChange((v) => all().forEach((f) => (f.rig.dragMul = v)));
  an.add(mot, 'breathing', 0, 3, 0.01).name('breathing speed ×').onChange((v) => all().forEach((f) => (f.loc.globalMul.breath = v)));
  an.close();

  // ------------------------------------------------------------ materials
  const mat = gui.addFolder('Material');
  mat.add(U.uScaleIntensity, 'value', 0, 2.5, 0.01).name('scale intensity');
  mat.add(U.uRoughness, 'value', 0.05, 1, 0.01).name('roughness');
  mat.add(U.uGuanine, 'value', 0, 1.2, 0.01).name('guanine reflectance');
  mat.add(U.uIridescence, 'value', 0, 1, 0.01).name('iridescence');
  mat.add(U.uSSS, 'value', 0, 2, 0.01).name('subsurface');
  mat.add(U.uFinOpacity, 'value', 0.1, 1.6, 0.01).name('fin opacity');
  mat.add(U.uFinTransmission, 'value', 0, 3, 0.01).name('fin transmission');
  mat.add(U.uFinRoughness, 'value', 0.05, 1, 0.01).name('fin roughness');
  const colP = {
    red: '#' + U.uColRed.value.getHexString(THREE.SRGBColorSpace),
    orange: '#' + U.uColOrange.value.getHexString(THREE.SRGBColorSpace),
    yellow: '#' + U.uColYellow.value.getHexString(THREE.SRGBColorSpace),
    white: '#' + U.uColWhite.value.getHexString(THREE.SRGBColorSpace),
  };
  for (const k of ['red', 'orange', 'yellow', 'white']) {
    const u = U['uCol' + k[0].toUpperCase() + k.slice(1)];
    mat.addColor(colP, k).onChange((v) => u.value.set(v));
  }
  const colorType = { selectedColor: sel() ? COLOR_TYPES[sel().variation.colorType] : 'sarasa' };
  mat.add(colorType, 'selectedColor', COLOR_TYPES).name('selected fish colour').onChange((v) => {
    const f = sel();
    if (f) f.variation.colorType = COLOR_TYPES.indexOf(v);
  });
  mat.close();

  const eye = gui.addFolder('Eyes');
  eye.add(U.uPupil, 'value', 0.2, 0.7, 0.01).name('pupil size');
  eye.add(U.uIrisMetal, 'value', 0, 1, 0.01).name('iris guanine sheen');
  const eyeP = { gold: '#' + U.uIrisGold.value.getHexString(THREE.SRGBColorSpace), red: '#' + U.uIrisRed.value.getHexString(THREE.SRGBColorSpace) };
  eye.addColor(eyeP, 'gold').name('iris gold').onChange((v) => U.uIrisGold.value.set(v));
  eye.addColor(eyeP, 'red').name('iris red').onChange((v) => U.uIrisRed.value.set(v));
  eye.close();

  // ------------------------------------------------------------ AI
  if (app.world) {
    const ai = gui.addFolder('AI');
    const aiP = { forceState: 'none' };
    ai.add(aiP, 'forceState', ['none', ...STATES]).name('force state (selected)').onChange((v) => {
      const f = sel();
      if (f && f.brain) f.brain.forced = v === 'none' ? null : v;
      app.anim.set('AI');
    });
    const info = { state: '', personality: '' };
    ai.add(info, 'state').name('current state').listen().disable();
    ai.add(info, 'personality').name('personality').listen().disable();
    setInterval(() => {
      const f = sel();
      if (!f || !f.brain) return;
      info.state = `${f.brain.state} (${f.loc.gait})`;
      const p = f.personality;
      info.personality = `act ${p.activity.toFixed(2)} bold ${p.boldness.toFixed(2)} cur ${p.curiosity.toFixed(2)} soc ${p.sociality.toFixed(2)} depth ${p.preferredDepth.toFixed(2)} turn ${p.turnBias.toFixed(2)}`;
    }, 300);
    ai.close();
  }

  // ------------------------------------------------------------ LOD
  const lod = gui.addFolder('LOD');
  lod.add(fs, 'forceLOD', { auto: -1, LOD0: 0, LOD1: 1, LOD2: 2 }).name('force LOD');
  lod.add(fs.lodPixels, '0', 60, 600, 1).name('LOD0 above (px/SL)');
  lod.add(fs.lodPixels, '1', 10, 300, 1).name('LOD1 above (px/SL)');
  lod.close();

  // ------------------------------------------------------------ lighting & water
  const li = gui.addFolder('Lighting & Water');
  const r = app.renderer;
  const lp = { exposure: r.toneMappingExposure, toneMapping: 'Neutral', env: app.scene.environmentIntensity ?? 1, keyIntensity: 0, azimuth: 8, elevation: 72, bloom: app.post ? app.post.bloom.strength : 0, post: app.usePost };
  li.add(lp, 'exposure', 0.2, 3, 0.01).onChange((v) => (r.toneMappingExposure = v));
  li.add(lp, 'toneMapping', ['Neutral', 'AgX', 'ACES']).onChange((v) => {
    r.toneMapping = { Neutral: THREE.NeutralToneMapping, AgX: THREE.AgXToneMapping, ACES: THREE.ACESFilmicToneMapping }[v];
  });
  li.add(lp, 'env', 0, 3, 0.01).name('environment').onChange((v) => (app.scene.environmentIntensity = v));
  const key = app.world ? app.world.key : app.studioLights.key;
  lp.keyIntensity = key.intensity;
  li.add(lp, 'keyIntensity', 0, 10, 0.01).name('key light').onChange((v) => (key.intensity = v));
  if (app.world) {
    li.add(lp, 'azimuth', -180, 180, 1).onChange(() => app.world.setLightAngle(lp.azimuth, lp.elevation));
    li.add(lp, 'elevation', 20, 90, 1).onChange(() => app.world.setLightAngle(lp.azimuth, lp.elevation));
    li.add(U.uCausticParams.value, 'y', 0, 2.5, 0.01).name('caustics');
    li.add(app.world.caustics, 'speed', 0, 3, 0.01).name('caustics speed');
    li.add(U.uWaterDensity, 'value', 0, 4, 0.01).name('water turbidity');
    li.add(app.world.particles.material.uniforms.uIntensity, 'value', 0, 3, 0.01).name('particles');
    li.add(app.world.shafts.material.uniforms.uIntensity, 'value', 0, 0.3, 0.001).name('light shafts');
    li.add(app.world.bubbles, 'enabled').name('air stone bubbles');
    li.add(app.world.surface, 'useReflection').name('surface TIR reflection');
    li.add(app.world, 'currentStrength', 0, 0.06, 0.001).name('filter current (m/s)');
  }
  if (app.post) {
    li.add(lp, 'post').name('post-processing').onChange((v) => (app.usePost = v));
    li.add(app.post.bloom, 'strength', 0, 1.5, 0.01).name('bloom');
  }
  li.close();

  // ------------------------------------------------------------ debug views
  const dbg = gui.addFolder('Debug View');
  const dv = { view: 'shaded', wireframe: false };
  dbg.add(dv, 'view', ['shaded', 'normals', 'albedo/pattern', 'scale normals']).onChange((v) => {
    U.uDebugView.value = { shaded: 0, normals: 1, 'albedo/pattern': 2, 'scale normals': 3 }[v];
  });
  dbg.add(dv, 'wireframe').onChange((v) => fs.setWireframe(v));
  const flags = app.debugDraw.flags;
  dbg.add(flags, 'skeleton');
  dbg.add(flags, 'collision');
  dbg.add(flags, 'velocity');
  dbg.add(flags, 'target').name('AI target');
  dbg.add(flags, 'labels').name('current state');
  dbg.close();
  if (window.innerWidth < 900) gui.close();
  return gui;
}
