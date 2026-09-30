import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { KentishPloverModel } from '../birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator, PREEN_VARIANTS } from '../birds/kentishPlover/KentishPloverAnimator.js';
import { GLSL, getPalette } from '../birds/kentishPlover/KentishPloverMaterials.js';
import { animation as ANIM } from '../birds/kentishPlover/KentishPloverConfig.js';

// Offline export of the LOD0 plover to GLB:
//  - plumage baked to vertex colours by evaluating the SAME GLSL functions on the GPU (one point per vertex)
//  - every action/locomotion cycle sampled at 30 fps into AnimationClips (in place, no root motion)
// Used by tools/export-glb.mjs (headless Chromium). The runtime demo keeps the procedural shaders.

const W = 1024;

function bakeVertexColors(renderer, geometry, kind, pal) {
  const n = geometry.getAttribute('position').count;
  const H = Math.ceil(n / W);
  const idx = new Float32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
  const uniforms = { uW: { value: W }, uH: { value: H } };
  let vtx;
  let frag;
  if (kind === 'body') {
    g.setAttribute('aRest', geometry.getAttribute('aRest'));
    g.setAttribute('aN', geometry.getAttribute('normal'));
    Object.assign(uniforms, GLSL.paletteUniforms(pal), { uMelanin: { value: 1 }, uWear: { value: 0.25 }, uSeed: { value: 0.3 }, uDetail: { value: 2 }, uFluff: { value: 0 } });
    vtx = `attribute float aIdx; attribute vec3 aRest; attribute vec3 aN; uniform float uW, uH; varying vec3 vR; varying vec3 vN;
      void main(){ vR = aRest; vN = aN; float x = mod(aIdx, uW); float y = floor(aIdx / uW);
      gl_Position = vec4((x + 0.5) / uW * 2.0 - 1.0, (y + 0.5) / uH * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = 1.0; }`;
    frag = `${GLSL.BODY_UNIFORMS_GLSL.replace(/varying[^;]*;/g, '')}\n${GLSL.BODY_FRAG_FUNCS}\nvarying vec3 vR; varying vec3 vN;
      void main(){ vec3 c = kpPlumage(vR, normalize(vN), 0.0); gl_FragColor = vec4(pow(c, vec3(1.0/2.2)), 1.0); }`;
  } else {
    g.setAttribute('uv', geometry.getAttribute('uv'));
    g.setAttribute('aFeather', geometry.getAttribute('aFeather'));
    const c = (h) => ({ value: new THREE.Color(h) });
    Object.assign(uniforms, { uMantle: c(pal.mantle), uMantleDark: c(pal.mantleDark), uFringe: c(pal.fringe), uFlightDark: c(pal.flightDark), uFlightMid: c(pal.flightMid), uTailDark: c(pal.tailDark), uWhite: c(pal.white), uUnder: c(pal.underparts), uWear: { value: 0.25 }, uDetail: { value: 2 }, uFold: { value: 1 } });
    vtx = `attribute float aIdx; attribute vec4 aFeather; uniform float uW, uH; varying vec4 vF; varying vec2 vUv2;
      void main(){ vF = aFeather; vUv2 = uv; float x = mod(aIdx, uW); float y = floor(aIdx / uW);
      gl_Position = vec4((x + 0.5) / uW * 2.0 - 1.0, (y + 0.5) / uH * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = 1.0; }`;
    frag = `${GLSL.FEATHER_FRAG.replace('varying vec4 vFeather;', '')}\nvarying vec4 vF; varying vec2 vUv2;
      void main(){ vec3 c = kpFeatherTop(floor(vF.x + 0.5), vF.y, vUv2, vF.z); gl_FragColor = vec4(pow(c, vec3(1.0/2.2)), 1.0); }`;
  }
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vtx, fragmentShader: frag });
  const pts = new THREE.Points(g, mat);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType });
  const scene = new THREE.Scene();
  scene.add(pts);
  const cam = new THREE.Camera();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  const buf = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  renderer.setRenderTarget(null);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // stored gamma-encoded → convert back to linear for glTF COLOR_0
    col[i * 3] = Math.pow(buf[i * 4] / 255, 2.2);
    col[i * 3 + 1] = Math.pow(buf[i * 4 + 1] / 255, 2.2);
    col[i * 3 + 2] = Math.pow(buf[i * 4 + 2] / 255, 2.2);
  }
  rt.dispose();
  return col;
}

function cleanGeometry(src, colors) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) if (src.getAttribute(k)) g.setAttribute(k, src.getAttribute(k));
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(src.index);
  return g;
}

const CLIPS = [
  ['01_Idle', 'stand', 6],
  ['02_Walk', 'walk', 1 / ANIM.walk.strideHz],
  ['03_Run', 'run', 1 / ANIM.run.strideHz],
  ['05_ForageSearch', 'forage', 4],
  ['06_Peck_worm', 'peck', null, 'polychaete'],
  ['06_Peck_crab', 'peck', null, 'crab'],
  ...PREEN_VARIANTS.map((v) => [`07_Preen_${v}`, 'preen', null, v]),
  ['07_Scratch', 'scratch', null],
  ['07_WingStretch', 'wingStretch', null],
  ['07_Shake', 'shake', null],
  ['08_Rest_oneLeg', 'restOneLeg', 4],
  ['08_Rest_tucked', 'restTucked', 4],
  ['08_Rest_sit', 'sit', 4],
  ['09_Alert', 'alert', 3],
  ['10_Takeoff', 'takeoff', null],
  ['11_Flight', 'flight', 1 / ANIM.flight.cruiseHz],
  ['12_Landing', 'landing', null],
];

function bakeClips(model) {
  const fps = 30;
  const clips = [];
  for (const [name, pose, dur, variant] of CLIPS) {
    const A = new KentishPloverAnimator(model, { seed: 5 });
    const tracks = new Map();
    let duration = dur;
    let sample;
    if (['walk', 'run', 'flight'].includes(pose)) {
      sample = (t) => A.previewAction(pose, t / duration);
    } else if (dur !== null) {
      A.previewAction(pose, 0);
      sample = (t) => {
        if (t > 0) A.update(1 / fps);
      };
    } else {
      A.previewAction(pose, 0, variant);
      const a = A.action;
      duration = a ? a.dur : 1;
      sample = (t) => A.previewAction(pose, t / duration, variant);
    }
    const frames = Math.max(2, Math.round(duration * fps) + 1);
    for (let f = 0; f < frames; f++) {
      const t = Math.min(duration, f / fps);
      sample(t);
      for (const bone of model.boneList) {
        let tr = tracks.get(bone.name);
        if (!tr) tracks.set(bone.name, (tr = { t: [], p: [], q: [] }));
        tr.t.push(t);
        tr.p.push(bone.position.x, bone.position.y, bone.position.z);
        tr.q.push(bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w);
      }
    }
    const kf = [];
    for (const [bn, tr] of tracks) {
      kf.push(new THREE.VectorKeyframeTrack(`${bn}.position`, tr.t, tr.p));
      kf.push(new THREE.QuaternionKeyframeTrack(`${bn}.quaternion`, tr.t, tr.q));
    }
    clips.push(new THREE.AnimationClip(name, duration, kf));
  }
  return clips;
}

export async function exportGLB(renderer) {
  const pal = getPalette('maleBreeding');
  const model = new KentishPloverModel({ palette: 'maleBreeding', lods: [0], shadows: false });
  const lod = model.lods[0];
  const [bodyM, featherM, bareM] = lod.meshes;
  const bodyCol = bakeVertexColors(renderer, bodyM.geometry, 'body', pal);
  const featherCol = bakeVertexColors(renderer, featherM.geometry, 'feather', pal);
  // bare parts: per-part colours
  const part = bareM.geometry.getAttribute('aPart');
  const bareCol = new Float32Array(part.count * 3);
  const pc = { 0: pal.bill, 1: pal.legs, 2: pal.bill, 3: pal.underparts, 4: '#8e6f6a', 5: pal.legs };
  for (let i = 0; i < part.count; i++) {
    const c = new THREE.Color(pc[Math.round(part.getX(i))] ?? pal.legs);
    bareCol.set([c.r, c.g, c.b], i * 3);
  }
  const root = new THREE.Group();
  root.name = 'KentishPlover_LOD0';
  const skel = model.skeleton;
  root.add(model.bones.root);
  const mk = (geo, col, name, extra = {}) => {
    const m = new THREE.SkinnedMesh(cleanGeometry(geo, col), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, ...extra }));
    m.name = name;
    root.add(m);
    m.bind(skel, bodyM.bindMatrix);
    return m;
  };
  mk(bodyM.geometry, bodyCol, 'Body_plumage');
  mk(featherM.geometry, featherCol, 'Feathers', { side: THREE.DoubleSide });
  mk(bareM.geometry, bareCol, 'Bill_Legs', { roughness: 0.45 });
  const eye = lod.meshes.find((m) => m.name.startsWith('eyeball'));
  const eyeCol = new Float32Array(eye.geometry.getAttribute('position').count * 3).fill(0.02);
  mk(eye.geometry, eyeCol, 'Eyes', { roughness: 0.1 });
  const clips = bakeClips(model);
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(root, { binary: true, animations: clips, onlyVisible: false });
  return { glb, clips: clips.map((c) => `${c.name} (${c.duration.toFixed(2)} s)`) };
}
