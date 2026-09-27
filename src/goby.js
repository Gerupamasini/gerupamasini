// Fire goby / ハタタテハゼ (Nemateleotris magnifica) — procedural model.
// Same conventions as fish.js: snout tip s = 0, caudal peduncle s = 1, fish faces +x,
// x = 0.5 - s. Outline and fin shapes traced from side-view photographs (iNaturalist).
import * as THREE from 'three';
import { spline, polyline, buildFin, addSwim } from './fish.js';
import { createFishEye } from './eye.js';

const S0 = -0.03, S1 = 1.3, Y0 = -0.52, Y1 = 0.6;   // shared painting space (buildFin UVs)
const sx = (s) => 0.5 - s;
const GDEPTH = 1.15;

export const GOBY = {
  // averaged from two traced side views (iNaturalist, CC0 / CC BY-NC); slender body, blunt head
  top: spline([[0, 0.01], [0.01, 0.034], [0.03, 0.062], [0.06, 0.088], [0.1, 0.108], [0.15, 0.12], [0.25, 0.132],
    [0.4, 0.13], [0.6, 0.11], [0.8, 0.078], [0.93, 0.05], [1.0, 0.036]]),
  bottom: spline([[0, -0.01], [0.012, -0.024], [0.04, -0.038], [0.09, -0.05], [0.16, -0.057], [0.25, -0.06],
    [0.4, -0.06], [0.6, -0.054], [0.8, -0.044], [0.93, -0.033], [1.0, -0.027]]),
  // laterally compressed behind the head, tapering to a thin peduncle that runs into the tail
  width: spline([[0, 0.011], [0.03, 0.024], [0.08, 0.034], [0.16, 0.037], [0.3, 0.032], [0.5, 0.024], [0.7, 0.016],
    [0.88, 0.01], [0.96, 0.006], [1.0, 0.002]]),
  eye: { s: 0.066, y: 0.044, r: 0.036 },
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
      // head rounded, body behind it a compressed lens that feeds the fin bases
      const lensK = THREE.MathUtils.smoothstep(s, 0.15, 0.45);
      let z = Math.sign(Math.sin(th)) * w * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(yn), 2.4 - 0.4 * lensK)), 0.5 + 0.15 * lensK) * (1 + 0.1 * yn);
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
  const flagBase = even(0.25, 0.33, 7, (s) => top(s) - 0.003);   // narrow base
  // spine 0 runs along the leading edge to the tip; the others end on the trailing edge,
  // which runs from just behind the last spine up to meet the tip
  const trail = polyline([[0.608, 0.57], [0.57, 0.545], [0.51, 0.49], [0.44, 0.39], [0.385, 0.27], [0.35, 0.17]], 6);
  const flagTip = [[0.615, 0.572], ...trail];
  // second dorsal and anal: long, low, running almost to the caudal
  // traced from the CC0 side view: low fins whose edges run nearly parallel to the body
  const d2Base = even(0.4, 0.97, 24, (s) => top(s) - 0.003);
  const d2Tip = polyline([[0.41, 0.152], [0.55, 0.16], [0.7, 0.148], [0.85, 0.118], [0.97, 0.088], [1.02, 0.068], [0.99, 0.052]], 24);
  const aBase = even(0.46, 0.97, 22, (s) => bottom(s) + 0.003);
  const aTip = polyline([[0.47, -0.075], [0.6, -0.085], [0.75, -0.088], [0.9, -0.082], [0.99, -0.07], [1.02, -0.055], [0.99, -0.04]], 22);
  // caudal: rounded / slightly lanceolate
  const cBase = even(0, 1, 17, (f) => 0).map(([f]) => { const s = 0.94 + 0.03 * Math.sin(Math.PI * f); return [s, top(s) - 0.004 - f * (top(s) - bottom(s) - 0.008)]; });
  const cTip = polyline([[1.1, 0.06], [1.19, 0.05], [1.24, 0.01], [1.24, -0.03], [1.2, -0.068], [1.1, -0.078]], 17);   // long, rounded caudal
  return { flag: { base: flagBase, tip: flagTip }, d2: { base: d2Base, tip: d2Tip }, anal: { base: aBase, tip: aTip }, caudal: { base: cBase, tip: cTip } };
}

// Colour pattern, evaluated per fragment from the painting-space position (crisp at any zoom).
const GOBY_PAINT = /* glsl */`
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
uniform float uGKind;   // 0 body, 1 flag, 2 second dorsal, 3 anal, 4 caudal, 5 pectoral, 6 pelvic
uniform sampler2D uGPhoto; uniform float uGPhotoMix;
varying vec2 vFinG;
vec4 gobyColor(vec2 p){
  float s = p.x, y = p.y;
  // palette sampled along the body in side-view photos (white-balanced)
  vec3 pearl = vec3(0.74, 0.78, 0.82);
  vec3 lemon = vec3(0.8, 0.86, 0.38);
  vec3 tan_ = vec3(0.84, 0.66, 0.54), orange = vec3(0.86, 0.45, 0.26), red = vec3(0.62, 0.22, 0.12), maroon = vec3(0.26, 0.09, 0.08);
  // one long soft gradient: pearl -> tan -> orange -> brick red -> maroon at the tail
  float g = s + 0.12 * y;
  vec3 c = pearl;
  c = mix(c, tan_,   smoothstep(0.34, 0.5, g));
  c = mix(c, orange, smoothstep(0.46, 0.64, g));
  c = mix(c, red,    smoothstep(0.6, 0.82, g));
  c = mix(c, maroon, smoothstep(0.8, 1.02, g));
  float a = 1.0;
  if (uGKind < 0.5) {
    // head: lemon-chartreuse snout and cheeks, fading back over the gill cover
    // lemon-lime around the eye and over the snout, fading into the pearl body behind the eye
    float head = (1.0 - smoothstep(0.08, 0.16, length((p - vec2(0.03, 0.035)) * vec2(1.0, 1.25)))) ;
    c = mix(c, lemon, head * 0.9);
    c = mix(c, vec3(0.93, 0.93, 0.95), smoothstep(-0.02, -0.05, y) * (1.0 - smoothstep(0.3, 0.5, s)) * 0.5);   // pale belly
    // violet line along the top of the head from the snout to the flag
    float topY = mix(0.03, 0.14, smoothstep(0.0, 0.25, s));
    float vl = (1.0 - smoothstep(0.004, 0.009, abs(y - (topY - 0.004)))) * (1.0 - smoothstep(0.22, 0.26, s));
    c = mix(c, vec3(0.66, 0.5, 0.86), vl * 0.75);
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
      // colours sampled from the side-view photos: pearly cream, lemon at the root, fine
      // spine striations, a thin red line along the rear edge low down, clearer toward the tip
      c = mix(vec3(0.9, 0.9, 0.83), vec3(0.94, 0.93, 0.86), t);
      c = mix(c, vec3(0.9, 0.88, 0.55), (1.0 - smoothstep(0.0, 0.28, t)) * 0.7);
      float stri = 0.5 + 0.5 * sin(r * 6.2832);
      c *= 0.94 + 0.06 * stri;
      c = mix(c, vec3(0.72, 0.18, 0.1), smoothstep(5.2, 5.8, r) * (1.0 - smoothstep(0.35, 0.65, t)) * 0.8);
      a = mix(0.9, 0.55, smoothstep(0.3, 1.0, t));
    } else if (uGKind < 3.5) {
      // second dorsal / anal: the body colour continues into the fin (they read as one wedge),
      // translucent toward the edge with a fine dark margin
      c = mix(c, c * 0.85, smoothstep(0.5, 1.0, t));
      c = mix(c, maroon * 0.5, smoothstep(0.9, 0.97, t) * 0.8);
      a = mix(0.92, 0.55, smoothstep(0.2, 1.0, t));
    } else if (uGKind < 4.5) {
      // caudal: red with blackish streaks along the upper and lower lobes, dark centre
      // caudal: maroon-brown, darkening outward, faint dark streaks near the upper and lower edges
      float band = smoothstep(0.08, 0.02, abs(r / 16.0 - 0.12)) + smoothstep(0.08, 0.02, abs(r / 16.0 - 0.88));
      c = mix(vec3(0.3, 0.06, 0.045), vec3(0.14, 0.035, 0.035), t) * (0.85 + 0.15 * ray);
      c = mix(c, vec3(0.08, 0.03, 0.03), band * 0.5);
      a = mix(0.95, 0.7, t);
    } else if (uGKind < 5.5) {
      c = vec3(0.95, 0.94, 0.88); a = mix(0.12, 0.03, t); a = mix(a, 0.3, ray * 0.6);   // clear pectoral with visible rays
    } else {
      c = mix(vec3(0.92, 0.92, 0.66), vec3(0.97, 0.97, 0.94), smoothstep(0.0, 0.35, t)); c *= 0.95 + 0.05 * ray; a = mix(0.7, 0.35, t);   // white pelvic, lemon root
    }
    c = mix(c, c * 1.02, ray * 0.04);
    a *= smoothstep(0.0, 0.04, 1.0 - t + 0.02);
  }
  // photographic albedo (CC0 photo warped onto the model) on the body and median fins
  if (uGKind < 0.5 || (uGKind > 1.5 && uGKind < 3.5)) {
    vec4 ph = texture2D(uGPhoto, (p - vec2(${S0}, ${Y0})) / vec2(${S1 - S0}, ${Y1 - Y0}));
    c = mix(c, ph.rgb, ph.a * uGPhotoMix);
    // soft fins carry the flank colour (orange -> red -> maroon) rather than the photo's pale fins
    if (uGKind > 1.5) c = mix(c, mix(vec3(0.9, 0.42, 0.14), vec3(0.45, 0.08, 0.05), smoothstep(0.55, 1.0, s)), smoothstep(0.45, 0.62, s) * 0.75);
    if (uGKind < 0.5) {
      // brighter lemon face, lavender nape stripe, violet freckles, upturned mouth
      float face = 1.0 - smoothstep(0.07, 0.15, length((p - vec2(0.035, 0.03)) * vec2(1.0, 1.2)));
      c = mix(c, vec3(0.93, 0.91, 0.45), face * 0.6);
      float topY = mix(0.03, 0.13, smoothstep(0.0, 0.25, s));
      float vl = (1.0 - smoothstep(0.003, 0.007, abs(y - (topY - 0.006)))) * (1.0 - smoothstep(0.22, 0.28, s)) * smoothstep(0.02, 0.05, s);
      c = mix(c, vec3(0.73, 0.65, 0.9), vl * 0.8);
      vec2 q = p * 110.0; float sp = step(0.9, gh(floor(q))) * (1.0 - smoothstep(0.15, 0.3, length(fract(q) - 0.5)));
      c = mix(c, vec3(0.62, 0.55, 0.95), sp * (1.0 - smoothstep(0.08, 0.2, s)) * 0.7);
      float m = 1.0 - smoothstep(0.0015, 0.0035, abs((y + 0.006) + s * 0.5) + max(s - 0.03, 0.0) * 4.0);
      c = mix(c, vec3(0.3, 0.2, 0.18), m * 0.85);
    }
  }
  c *= 0.98 + 0.04 * gn(p * 60.0);
  return vec4(c, a);
}
`;

let photoTex = null;
export function loadGobyPhoto(url = new URL('../assets/goby_photo.webp', import.meta.url).href) {
  return new THREE.TextureLoader().loadAsync(url).then((t) => { t.colorSpace = THREE.SRGBColorSpace; photoTex = t; return t; });
}

function gobyMaterial(kind, uniforms) {
  const fin = kind > 0;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: fin ? 0.5 : 0.38, metalness: 0.0,
    clearcoat: fin ? 0.1 : 0.2, clearcoatRoughness: 0.35,
    iridescence: fin ? 0 : 0.15, iridescenceThicknessRange: [200, 500],
    sheen: fin ? 0 : 0.3, sheenColor: new THREE.Color(0.8, 0.85, 1.0),
    transparent: fin, side: fin ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.userData.gobyKind = kind;
  addSwim(m, { ...uniforms, uGKind: { value: kind }, uGPhoto: { value: photoTex }, uGPhotoMix: { value: photoTex ? 1 : 0 } }, {
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
    // large black pupil, a broad silvery-white iris flushed pink-violet above, lemon skin around
    if (r < 21) col = [5, 5, 8];
    else if (r < 38) {
      const f = (r - 21) / 17, up = Math.max(0, -dy / r);
      col = [232 - 30 * f, 236 - 30 * f, 238 - 40 * f].map((v, i) => v * (1 - up * 0.6) + up * 0.6 * [215, 150, 215][i]);
    } else col = [205, 220, 100];
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
  const d2 = new THREE.Mesh(buildFin({ ...L.d2, sub: 3, segs: 10, pleat: 0.0004, scallop: 0.008 }), gobyMaterial(2, uniforms));
  const an = new THREE.Mesh(buildFin({ ...L.anal, sub: 3, segs: 10, pleat: 0.0004, scallop: 0.008 }), gobyMaterial(3, uniforms));
  const cd = new THREE.Mesh(buildFin({ ...L.caudal, sub: 3, segs: 14, pleat: 0.0005, scallop: 0.006 }), gobyMaterial(4, uniforms));
  for (const m of [flagMesh, d2, an, cd]) m.renderOrder = 2;
  group.add(d2, an, cd);
  const flagPivot = new THREE.Group();          // hinge at the front of the flag's base
  const hx = sx(0.24), hy = GOBY.top(0.24);
  flagPivot.position.set(hx, hy, 0); flagMesh.position.set(-hx, -hy, 0);
  flagPivot.add(flagMesh); group.add(flagPivot);
  // eyes: large, high on the head
  // eyes: large globes set high on the head — black pupil, silvery-white iris flushed
  // pink-violet above, lemon skin around, glossy cornea
  const { eye } = GOBY;
  for (const side of [1, -1]) {
    const w = GOBY.width(eye.s);
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(sx(eye.s), eye.y, side * (w - eye.r * 0.5)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(side * -0.15, side > 0 ? 0.25 : Math.PI - 0.25, 0)),
      new THREE.Vector3(1, 1 / GDEPTH, 1));
    group.add(createFishEye({
      r: eye.r, matrix: M, pupilA: 0.68, irisA: 0.95,
      pupil: [0.004, 0.004, 0.008], irisIn: [0.9, 0.9, 0.78], irisOut: [0.82, 0.74, 0.9], limbus: [0.55, 0.42, 0.72],
      sclera: [0.72, 0.8, 0.36], upper: [0.8, 0.45, 0.82], upperAmt: 0.75,
      patch: (m, k) => addSwim(m, uniforms, { key: 'goby-' + k }),
    }));
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
  group.scale.y = GDEPTH;   // photographed adults are ~15% deeper than the first trace
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
