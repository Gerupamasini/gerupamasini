// Fire goby / ハタタテハゼ (Nemateleotris magnifica) — procedural model.
// Same conventions as fish.js: snout tip s = 0, caudal peduncle s = 1, fish faces +x,
// x = 0.5 - s. Outline and fin shapes traced from side-view photographs (iNaturalist).
import * as THREE from 'three';
import { spline, polyline, buildFin, addSwim } from './fish.js';

const S0 = -0.03, S1 = 1.3, Y0 = -0.52, Y1 = 0.6;   // shared painting space (buildFin UVs)
const sx = (s) => 0.5 - s;

export const GOBY = {
  top: spline([[0, 0.008], [0.01, 0.036], [0.03, 0.07], [0.06, 0.1], [0.1, 0.124], [0.15, 0.14], [0.25, 0.152],
    [0.4, 0.146], [0.6, 0.122], [0.8, 0.09], [0.93, 0.066], [1.0, 0.054]]),
  bottom: spline([[0, -0.012], [0.012, -0.026], [0.04, -0.042], [0.09, -0.056], [0.16, -0.066], [0.25, -0.071],
    [0.4, -0.072], [0.6, -0.064], [0.8, -0.054], [0.93, -0.044], [1.0, -0.04]]),
  width: spline([[0, 0.01], [0.03, 0.022], [0.08, 0.032], [0.16, 0.036], [0.3, 0.034], [0.5, 0.028], [0.7, 0.021],
    [0.9, 0.02], [1.0, 0.014]]),
  eye: { s: 0.062, y: 0.045, r: 0.026 },
};

function buildBody() {
  const NS = 180, NR = 96, { top, bottom, width } = GOBY;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < NS; i++) {
    const t = i / (NS - 1), s = 0.002 + 0.998 * (0.35 * t * t + 0.65 * t);
    const tp = top(s), bt = bottom(s), c = (tp + bt) / 2, hh = (tp - bt) / 2, w = width(s);
    for (let j = 0; j < NR; j++) {
      const th = (j / NR) * Math.PI * 2, yn = Math.cos(th);
      // rounder cross-section than the butterflyfish; flattened belly
      let z = Math.sign(Math.sin(th)) * w * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(yn), 2.4)), 0.5) * (1 + 0.1 * yn);
      pos.push(sx(s), c + hh * yn, z);
      uv.push((s - S0) / (S1 - S0), (c + hh * yn - Y0) / (Y1 - Y0));
    }
  }
  for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NR; j++) {
    const a = i * NR + j, b = i * NR + (j + 1) % NR, c = a + NR, d = b + NR;
    idx.push(a, c, b, b, c, d);
  }
  const tip = pos.length / 3; pos.push(sx(0) + 0.002, (top(0) + bottom(0)) / 2, 0); uv.push((0 - S0) / (S1 - S0), (0 - Y0) / (Y1 - Y0));
  for (let j = 0; j < NR; j++) idx.push(tip, j, (j + 1) % NR);
  const end = pos.length / 3, last = (NS - 1) * NR; pos.push(sx(1), (top(1) + bottom(1)) / 2, 0); uv.push((1 - S0) / (S1 - S0), 0.5);
  for (let j = 0; j < NR; j++) idx.push(end, last + (j + 1) % NR, last + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function finLayouts() {
  const { top, bottom } = GOBY;
  const even = (a, b, n, f) => Array.from({ length: n }, (_, i) => { const s = a + (b - a) * i / (n - 1); return [s, f(s)]; });
  // first dorsal: the "flag" — 6 long spines, the front ones longest, curving back
  // The flag is a narrow blade: spines packed together, the front one longest; the fin's
  // leading edge sweeps up and back in one curve (traced), the trailing edge runs close behind.
  const flagBase = even(0.24, 0.36, 7, (s) => top(s) - 0.003);
  // spine 0 runs along the leading edge to the tip; the others end on the trailing edge,
  // which runs from just behind the last spine up to meet the tip
  const trail = polyline([[0.5, 0.545], [0.46, 0.49], [0.42, 0.41], [0.395, 0.32], [0.385, 0.24], [0.38, 0.17]], 6);
  const flagTip = [[0.5, 0.56], ...trail];
  // second dorsal and anal: long, low, running almost to the caudal
  const d2Base = even(0.43, 0.985, 24, (s) => top(s) - 0.003);
  const d2Tip = polyline([[0.45, 0.2], [0.56, 0.215], [0.72, 0.195], [0.87, 0.165], [0.98, 0.13], [1.05, 0.1], [1.08, 0.07], [1.0, 0.05]], 24);
  const aBase = even(0.5, 0.985, 22, (s) => bottom(s) + 0.003);
  const aTip = polyline([[0.51, -0.1], [0.6, -0.115], [0.79, -0.125], [0.95, -0.12], [1.05, -0.1], [1.08, -0.075], [1.0, -0.04]], 22);
  // caudal: rounded / slightly lanceolate
  const cBase = even(0, 1, 17, (f) => 0).map(([f]) => { const s = 0.97; return [s, top(s) - 0.004 - f * (top(s) - bottom(s) - 0.008)]; });
  const cTip = polyline([[1.1, 0.07], [1.17, 0.045], [1.205, 0.005], [1.2, -0.035], [1.16, -0.068], [1.1, -0.084]], 17);
  return { flag: { base: flagBase, tip: flagTip }, d2: { base: d2Base, tip: d2Tip }, anal: { base: aBase, tip: aTip }, caudal: { base: cBase, tip: cTip } };
}

// Colour pattern, evaluated per fragment from the painting-space position (crisp at any zoom).
const GOBY_PAINT = /* glsl */`
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
uniform float uGKind;   // 0 body, 1 flag, 2 second dorsal, 3 anal, 4 caudal, 5 pectoral, 6 pelvic
varying vec2 vFinG;
vec4 gobyColor(vec2 p){
  float s = p.x, y = p.y;
  vec3 pearl = vec3(0.8, 0.83, 0.85);
  vec3 lemon = vec3(0.82, 0.86, 0.3);
  vec3 orange = vec3(0.72, 0.26, 0.12), red = vec3(0.42, 0.08, 0.04), maroon = vec3(0.2, 0.035, 0.03);
  // body gradient: pearl -> orange -> red -> maroon toward the tail
  vec3 c = pearl;
  c = mix(c, vec3(0.91, 0.38, 0.12), smoothstep(0.44, 0.66, s + 0.15 * y));
  c = mix(c, red, smoothstep(0.62, 0.85, s + 0.1 * y));
  c = mix(c, maroon, smoothstep(0.85, 1.05, s));
  c = mix(c, maroon, smoothstep(0.9, 1.12, s));
  float a = 1.0;
  if (uGKind < 0.5) {
    // head: lemon-chartreuse snout and cheeks, fading back over the gill cover
    float head = (1.0 - smoothstep(0.1, 0.22, s + 0.35 * max(-y, 0.0))) * smoothstep(-0.05, 0.01, y);
    c = mix(c, lemon, head * 0.85);
    c = mix(c, vec3(0.93, 0.93, 0.95), smoothstep(-0.02, -0.05, y) * (1.0 - smoothstep(0.3, 0.5, s)) * 0.5);   // pale belly
    // violet line along the top of the head from the snout to the flag
    float topY = mix(0.03, 0.14, smoothstep(0.0, 0.25, s));
    float vl = (1.0 - smoothstep(0.004, 0.009, abs(y - (topY - 0.004)))) * (1.0 - smoothstep(0.22, 0.26, s));
    c = mix(c, vec3(0.62, 0.52, 0.82), vl * 0.6);
    // violet-blue speckles on the head and gill cover
    vec2 q = p * 90.0; float sp = step(0.93, gh(floor(q))) * (1.0 - smoothstep(0.18, 0.32, length(fract(q) - 0.5) * 2.0 * 0.5));
    c = mix(c, vec3(0.55, 0.65, 1.0), sp * (1.0 - smoothstep(0.1, 0.3, s)) * 0.8);
    // subtle gill-cover edge
    float op = 1.0 - smoothstep(0.0, 0.004, abs(length((p - vec2(0.12, 0.02)) * vec2(1.0, 0.8)) - 0.075));
    c *= 1.0 - 0.1 * op * step(y, 0.07);
    // mouth: oblique, upturned
    float m = 1.0 - smoothstep(0.0015, 0.004, abs((y + 0.004) - (s - 0.0) * -0.6) + max(s - 0.025, 0.0) * 4.0);
    c = mix(c, vec3(0.35, 0.25, 0.2), m * 0.8);
  } else {
    float r = vFinG.x, t = vFinG.y;
    float ray = 1.0 - smoothstep(0.03, 0.12, abs(fract(r + 0.5) - 0.5));
    if (uGKind < 1.5) {
      // flag: translucent white with a faint yellow wash and a red leading edge near the tip
      c = mix(vec3(0.95, 0.95, 0.9), vec3(1.0, 0.96, 0.8), 0.4 * t);
      c = mix(c, vec3(0.85, 0.2, 0.1), smoothstep(0.82, 0.95, t) * smoothstep(0.3, 1.2, r) * 0.9);   // red line along the trailing edge
      a = mix(0.62, 0.45, t);
      a = mix(a, 0.75, ray * 0.3);
    } else if (uGKind < 3.5) {
      // second dorsal / anal: body colour with dark submarginal lines and a dark edge
      float l1 = smoothstep(0.62, 0.66, t) * (1.0 - smoothstep(0.7, 0.74, t));
      float l2 = smoothstep(0.9, 0.95, t);
      c = mix(c, maroon * 0.6, max(l1 * 0.85, l2 * 0.9));
      c = mix(c, maroon, smoothstep(0.7, 1.0, s) * 0.6);
      c = mix(c, vec3(1.0, 0.55, 0.3), (smoothstep(0.76, 0.8, t) - smoothstep(0.84, 0.88, t)) * 0.4);   // bright band between
      a = mix(0.85, 0.5, t);
    } else if (uGKind < 4.5) {
      // caudal: red with blackish streaks along the upper and lower lobes, dark centre
      float band = smoothstep(0.08, 0.02, abs(r / 16.0 - 0.18)) + smoothstep(0.08, 0.02, abs(r / 16.0 - 0.82));
      c = mix(red, maroon, 0.5 + 0.3 * t);
      c = mix(c, vec3(0.08, 0.03, 0.03), band * 0.85);
      c = mix(c, vec3(0.1, 0.03, 0.03), smoothstep(0.85, 0.97, t));
      a = mix(0.95, 0.75, t);
    } else if (uGKind < 5.5) {
      c = vec3(0.95, 0.93, 0.85); a = mix(0.07, 0.02, t); a = mix(a, 0.14, ray * 0.4);
    } else {
      c = vec3(0.97, 0.97, 0.95); a = mix(0.9, 0.55, t);
    }
    c = mix(c, c * 1.04 + 0.01, ray * (uGKind < 1.5 ? 0.1 : 0.25));
    a *= smoothstep(0.0, 0.04, 1.0 - t + 0.02);
  }
  c *= 0.97 + 0.06 * gn(p * 60.0);
  return vec4(c, a);
}
`;

function gobyMaterial(kind, uniforms) {
  const fin = kind > 0;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: fin ? 0.5 : 0.38, metalness: 0.0,
    clearcoat: fin ? 0.1 : 0.45, clearcoatRoughness: 0.25,
    iridescence: fin ? 0 : 0.15, iridescenceThicknessRange: [200, 500],
    sheen: fin ? 0 : 0.3, sheenColor: new THREE.Color(0.8, 0.85, 1.0),
    transparent: fin, side: fin ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.userData.gobyKind = kind;
  addSwim(m, { ...uniforms, uGKind: { value: kind } }, {
    key: 'goby' + kind, noBend: kind >= 5,
    frag: (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 fin; varying vec2 vFinG; varying vec2 vPaint;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvFinG = fin; vPaint = vec2(${S0}, ${Y0}) + uv * vec2(${S1 - S0}, ${Y1 - Y0});`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPaint;\n' + GOBY_PAINT)
        .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec4 gc = gobyColor(vPaint); diffuseColor.rgb *= gc.rgb; diffuseColor.a *= gc.a; }');
    },
  });
  return m;
}

function eyeTexture() {
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = x < W / 2 ? W * 0.25 : W * 0.75, dx = x - cx, dy = y - H / 2, r = Math.hypot(dx, dy);
    let col;
    if (r < 17) col = [4, 4, 6];                                   // pupil
    else if (r < 33) {                                             // iris: pale gold-white with a violet upper rim
      const f = (r - 17) / 16, up = Math.max(0, -dy / r);
      col = [225 - 60 * f, 220 - 50 * f, 170 - 40 * f].map((v, i) => v * (1 - up * 0.55) + up * 0.55 * [175, 120, 230][i]);
    } else col = [150, 120, 190];
    const o = (y * W + x) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createFireGoby() {
  const uniforms = { uPhase: { value: 0 }, uAmp: { value: 0 }, uTurn: { value: 0 }, uFlap: { value: 0 }, uGlow: { value: 1 } };
  const group = new THREE.Group(); group.name = 'Nemateleotris magnifica';
  group.add(new THREE.Mesh(buildBody(), gobyMaterial(0, uniforms)));
  const L = finLayouts();
  const flagMesh = new THREE.Mesh(buildFin({ ...L.flag, sub: 4, segs: 20, pleat: 0.0008, scallop: 0.01, bow: 0.16 }), gobyMaterial(1, uniforms));
  const d2 = new THREE.Mesh(buildFin({ ...L.d2, sub: 3, segs: 10, pleat: 0.0015, scallop: 0.02 }), gobyMaterial(2, uniforms));
  const an = new THREE.Mesh(buildFin({ ...L.anal, sub: 3, segs: 10, pleat: 0.0015, scallop: 0.02 }), gobyMaterial(3, uniforms));
  const cd = new THREE.Mesh(buildFin({ ...L.caudal, sub: 3, segs: 14, pleat: 0.0015, scallop: 0.015 }), gobyMaterial(4, uniforms));
  for (const m of [flagMesh, d2, an, cd]) m.renderOrder = 2;
  group.add(d2, an, cd);
  const flagPivot = new THREE.Group();          // hinge at the front of the flag's base
  const hx = sx(0.24), hy = GOBY.top(0.24);
  flagPivot.position.set(hx, hy, 0); flagMesh.position.set(-hx, -hy, 0);
  flagPivot.add(flagMesh); group.add(flagPivot);
  // eyes: large, high on the head
  const { eye } = GOBY, eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(), roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.1, envMapIntensity: 0.4 });
  addSwim(eyeMat, uniforms, { key: 'gobyeye' });
  for (const side of [1, -1]) {
    const w = GOBY.width(eye.s) * 0.85;
    const g = new THREE.SphereGeometry(eye.r, 32, 24); g.rotateY(side > 0 ? 0 : Math.PI); g.scale(1, 1, 0.4);
    g.translate(sx(eye.s), eye.y, side * (w - eye.r * 0.15));
    group.add(new THREE.Mesh(g, eyeMat));
  }
  // paired fins: clear rounded pectorals, long thread-like white pelvics
  const pairs = [];
  const paired = (len, span, n, shape, kind, pos, rot) => {
    const base = [], tip = [];
    for (let i = 0; i < n; i++) { const f = i / (n - 1); base.push([0.5, (f - 0.5) * span]); const l = len * shape(f); tip.push([0.5 + l, (f - 0.5) * span * 1.5 - l * 0.2]); }
    const m = new THREE.Mesh(buildFin({ base, tip, sub: 3, segs: 10, pleat: 0.0015, scallop: 0.03 }), gobyMaterial(kind, uniforms));
    m.position.set(-0.0, 0, 0);
    const piv = new THREE.Group(); piv.add(m); piv.position.set(...pos); piv.rotation.set(...rot); group.add(piv); return piv;
  };
  for (const side of [1, -1]) {
    const pec = paired(0.13, 0.06, 12, (f) => 0.6 + 0.4 * Math.sin(Math.PI * f), 5, [sx(0.19), -0.01, side * 0.048], [side * -0.2, side * 0.3, -0.2]);
    pec.userData = { side, kind: 'pec' }; pairs.push(pec);
    const pel = paired(0.19, 0.012, 3, (f) => 1 - 0.3 * f, 6, [sx(0.24), GOBY.bottom(0.24) + 0.006, side * 0.01], [side * 0.06, side * 0.03, 0.08]);
    pel.userData = { side, kind: 'pel' }; pairs.push(pel);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  for (const p of pairs) p.traverse((o) => { o.castShadow = false; });   // thin clear fins: no solid shadow

  let phase = 0, pecPhase = 0, flagT = 0;
  function update(dt, t, { amp = 0.02, freq = 1.0, turn = 0, flick = 0 } = {}) {
    phase += dt * freq * Math.PI * 2;
    pecPhase += dt * Math.PI * 2 * 1.4;
    uniforms.uPhase.value = phase; uniforms.uAmp.value = amp; uniforms.uTurn.value = turn;
    // the flag is raised and lowered in little flicks (signalling)
    flagT = Math.max(0, flagT - dt * 2.5); if (flick) flagT = 1;
    flagPivot.rotation.z = -0.35 * flagT * (0.5 + 0.5 * Math.sin(t * 16));
    for (const p of pairs) {
      const { side, kind } = p.userData;
      if (kind === 'pec') { const f = Math.sin(pecPhase + (side > 0 ? 0 : 0.5)); p.rotation.set(side * (-0.2 + 0.35 * f), side * (0.3 + 0.3 * f), -0.2); }
      else p.rotation.set(side * (0.06 + 0.02 * Math.sin(t * 0.8)), side * 0.03, 0.08);
    }
  }
  return { group, update, uniforms };
}
