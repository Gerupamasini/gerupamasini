// Fire goby / ハタタテハゼ (Nemateleotris magnifica) — procedural model.
// Same conventions as fish.js: snout tip s = 0, caudal peduncle s = 1, fish faces +x,
// x = 0.5 - s. Outline and fin shapes traced from side-view photographs (iNaturalist).
import * as THREE from 'three';
import { spline, polyline, buildFin, addSwim } from './fish.js';
import { createFishEye } from './eye.js';

const S0 = -0.03, S1 = 1.3, Y0 = -0.52, Y1 = 0.6;   // shared painting space (buildFin UVs)
const sx = (s) => 0.5 - s;
const GDEPTH = 1.0;   // slender: ~5:1 standard length to depth, as in the side-view references

export const GOBY = {
  // averaged from two traced side views (iNaturalist, CC0 / CC BY-NC); slender body, blunt head
  // head re-traced from close side / 3-4 / front photographs: short blunt rounded snout,
  // the dorsal profile rising evenly over large eyes set high and forward, oblique mouth
  top: spline([[0, 0.036], [0.012, 0.056], [0.03, 0.072], [0.06, 0.09], [0.1, 0.104], [0.15, 0.12], [0.25, 0.136],
    [0.4, 0.138], [0.6, 0.124], [0.8, 0.094], [0.93, 0.066], [1.0, 0.052]]),
  bottom: spline([[0, 0.008], [0.012, -0.01], [0.035, -0.03], [0.07, -0.046], [0.13, -0.056], [0.25, -0.06],
    [0.4, -0.062], [0.6, -0.062], [0.8, -0.054], [0.93, -0.044], [1.0, -0.038]]),
  // laterally compressed behind the head, tapering to a thin peduncle that runs into the tail
  // the head is broad and rounded seen from the front (width ~0.7 of depth), the body behind
  // it compressed
  width: spline([[0, 0.03], [0.02, 0.043], [0.05, 0.05], [0.09, 0.053], [0.15, 0.051], [0.22, 0.043], [0.3, 0.036],
    [0.5, 0.025], [0.7, 0.017], [0.88, 0.011], [0.96, 0.008], [1.0, 0.004]]),
  eye: { s: 0.068, y: 0.052, r: 0.038 },
  mouth: [[0.0, 0.026], [0.046, 0.003]],     // cleft: from the snout tip back and down to below the eye front
};

function buildBody() {
  const NS = 180, NR = 96, { top, bottom, width } = GOBY;
  const pos = [], uv = [], idx = [], ynA = [], zA = [];
  const { eye, mouth } = GOBY;
  const [m0, m1] = mouth;
  for (let i = 0; i < NS; i++) {
    const t = i / (NS - 1), s = 0.0005 + 0.9995 * (0.5 * t * t + 0.5 * t);
    // round the snout off like a dome instead of ending in a flat cap
    const kTip = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, 1 - s / 0.03), 2)));
    const tp = top(s), bt = bottom(s), c = (tp + bt) / 2, hh = (tp - bt) / 2 * kTip, w = width(s) * kTip;
    for (let j = 0; j < NR; j++) {
      const th = (j / NR) * Math.PI * 2, yn = Math.cos(th), sd = Math.sign(Math.sin(th)) || 1;
      let y = c + hh * yn;
      const ne = 2.0 + 0.5 * (1 - THREE.MathUtils.smoothstep(s, 0.12, 0.25));   // fuller, rounder head section
      let z = sd * w * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(yn), ne)), 1 / ne) * (1 + 0.1 * yn);
      // eye socket: the skin is drawn back around the globe and forms a soft raised rim
      const de = Math.hypot(s - eye.s, (y - eye.y) * 1.05) / eye.r;
      if (de < 1.5 && yn > -0.3) z *= 1 - 0.36 * Math.exp(-Math.pow(de / 1.0, 4));   // socket only: the skin runs straight onto the eye (no rim)
      // gill cover: a soft bulge ending in a free edge (a small step down onto the body)
      const dO = Math.hypot(s - 0.11, (y - 0.02) * 0.8) - 0.07;
      if (y < 0.07 && s > 0.1 && s < 0.2) z *= 1 + 0.035 * THREE.MathUtils.smoothstep(dO, -0.035, -0.002) * (1 - THREE.MathUtils.smoothstep(dO, -0.002, 0.004));
      // mouth: a cleft running obliquely back from the snout tip, lips rolled either side
      if (s < m1[0] + 0.012 && yn < 0.4) {
        const u = THREE.MathUtils.clamp(s / m1[0], 0, 1), ym = m0[1] + (m1[1] - m0[1]) * u, dy = y - ym;
        const fall = 1 - THREE.MathUtils.smoothstep(s, m1[0] - 0.004, m1[0] + 0.01);
        z *= 1 - fall * (0.16 * Math.exp(-Math.pow(dy / 0.0022, 2)) - 0.05 * Math.exp(-Math.pow((Math.abs(dy) - 0.006) / 0.003, 2)));   // cleft with thick rolled lips
      }
      pos.push(sx(s), y, z);
      ynA.push(yn); zA.push(z);
      uv.push((s - S0) / (S1 - S0), (y - Y0) / (Y1 - Y0));
    }
  }
  for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NR; j++) {
    const a = i * NR + j, b = i * NR + (j + 1) % NR, c = a + NR, d = b + NR;
    idx.push(a, c, b, b, c, d);
  }
  const tip = pos.length / 3; pos.push(sx(0), (top(0) + bottom(0)) / 2, 0); ynA.push(0); zA.push(0); uv.push((0 - S0) / (S1 - S0), ((top(0) + bottom(0)) / 2 - Y0) / (Y1 - Y0));
  for (let j = 0; j < NR; j++) idx.push(tip, j, (j + 1) % NR);
  const end = pos.length / 3, last = (NS - 1) * NR; pos.push(sx(1), (top(1) + bottom(1)) / 2, 0); ynA.push(0); zA.push(0); uv.push((1 - S0) / (S1 - S0), 0.5);
  for (let j = 0; j < NR; j++) idx.push(end, last + (j + 1) % NR, last + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('gyn', new THREE.Float32BufferAttribute(ynA, 1));
  g.setAttribute('gz', new THREE.Float32BufferAttribute(zA, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function finLayouts() {
  const { top, bottom } = GOBY;
  const even = (a, b, n, f) => Array.from({ length: n }, (_, i) => { const s = a + (b - a) * i / (n - 1); return [s, f(s)]; });
  // first dorsal: the "flag" — 6 long spines, the front ones longest, curving back
  // The flag is a narrow blade: spines packed together, the front one longest; the fin's
  // leading edge sweeps up and back in one curve (traced), the trailing edge runs close behind.
  const flagBase = even(0.29, 0.37, 7, (s) => top(s) - 0.003);   // narrow base
  // spine 0 runs along the leading edge to the tip; the others end on the trailing edge,
  // which runs from just behind the last spine up to meet the tip
  // trailing edge hugs the leading spine above the lowest fifth: a slender ray, membrane at the base
  const trail = polyline([[0.64, 0.56], [0.6, 0.53], [0.54, 0.46], [0.48, 0.37], [0.43, 0.26], [0.395, 0.16]], 6);
  const flagTip = [[0.645, 0.565], ...trail];   // reclined, curving back (side-view photos)
  // second dorsal and anal: long, low, running almost to the caudal
  // traced from the CC0 side view: low fins whose edges run nearly parallel to the body
  const d2Base = even(0.38, 0.97, 26, (s) => top(s) - 0.003);
  const d2Tip = polyline([[0.385, 0.152], [0.46, 0.156], [0.53, 0.162], [0.62, 0.162], [0.72, 0.148], [0.82, 0.128], [0.92, 0.104], [1.0, 0.084], [1.05, 0.074], [1.04, 0.06]], 26);   // (photo) low membrane behind the flag, then a band ~0.035 high with a dark margin   // low, hugging the back   // tall, reaching the caudal
  const aBase = even(0.56, 0.97, 22, (s) => bottom(s) + 0.003);
  const aTip = polyline([[0.565, -0.082], [0.64, -0.1], [0.74, -0.108], [0.85, -0.108], [0.95, -0.1], [1.02, -0.088], [1.05, -0.078], [1.03, -0.062]], 22);
  // caudal: rounded / slightly lanceolate
  const cBase = even(0, 1, 17, (f) => 0).map(([f]) => { const s = 0.955 + 0.025 * Math.sin(Math.PI * f); return [s, top(s) - 0.004 - f * (top(s) - bottom(s) - 0.008)]; });
  const cTip = polyline([[1.06, 0.07], [1.16, 0.076], [1.25, 0.068], [1.295, 0.04], [1.305, 0.0], [1.3, -0.045], [1.26, -0.078], [1.16, -0.088], [1.06, -0.082]], 17);   // (photo) broad, truncate-rounded caudal   // long lanceolate caudal
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
      c = mix(c, vec3(0.5, 0.1, 0.05), (1.0 - smoothstep(0.15, 0.55, r)) * smoothstep(0.05, 0.2, t) * 0.85);   // (photo) red-brown line along the leading spine
      a = mix(0.9, 0.55, smoothstep(0.3, 1.0, t));
    } else if (uGKind < 3.5) {
      // second dorsal / anal: the body colour continues into the fin (they read as one wedge),
      // translucent toward the edge with a fine dark margin
      c = mix(c, c * 0.85, smoothstep(0.5, 1.0, t));
      c = mix(c, maroon * 0.4, smoothstep(0.72, 0.88, t) * 0.85);
      a = mix(0.92, 0.55, smoothstep(0.2, 1.0, t));
    } else if (uGKind < 4.5) {
      // caudal: red with blackish streaks along the upper and lower lobes, dark centre
      // caudal: maroon-brown, darkening outward, faint dark streaks near the upper and lower edges
      float band = smoothstep(0.08, 0.02, abs(r / 16.0 - 0.12)) + smoothstep(0.08, 0.02, abs(r / 16.0 - 0.88));
      c = mix(vec3(0.11, 0.016, 0.01), vec3(0.03, 0.006, 0.005), smoothstep(0.1, 0.7, t)) * (0.85 + 0.15 * ray);
      c = mix(c, vec3(0.08, 0.03, 0.03), band * 0.5);
      a = mix(0.95, 0.7, t);
    } else if (uGKind < 5.5) {
      c = vec3(0.95, 0.94, 0.88); a = mix(0.12, 0.03, t); a = mix(a, 0.3, ray * 0.6);   // clear pectoral with visible rays
    } else {
      c = mix(vec3(0.92, 0.92, 0.66), vec3(0.97, 0.97, 0.94), smoothstep(0.0, 0.35, t)); c *= 0.95 + 0.05 * ray; float rw = mix(0.2, 0.05, t); a = mix(0.0, 0.92, 1.0 - smoothstep(rw * 0.5, rw, abs(fract(r + 0.5) - 0.5)));   // rays taper to a point, faint membrane   // two stout white rays, clear membrane between
    }
    c = mix(c, c * 1.02, ray * 0.04);
    a *= smoothstep(0.0, 0.04, 1.0 - t + 0.02);
  }
  // photographic albedo (CC0 photo warped onto the model) on the body and median fins
  if (uGKind < 0.5 || (uGKind > 1.5 && uGKind < 3.5)) {
    vec4 ph = texture2D(uGPhoto, (p - vec2(${S0}, ${Y0})) / vec2(${S1 - S0}, ${Y1 - Y0}));
    c = mix(c, ph.rgb, ph.a * uGPhotoMix);
    // soft fins carry the flank colour (orange -> red -> maroon) rather than the photo's pale fins
    // rear half: flame orange-red deepening to maroon (linear-space values measured from the side-view photos)
    {
      float g2 = s + 0.15 * y + (uGKind > 1.5 ? 0.03 : 0.0);
      vec3 rear = mix(vec3(0.79, 0.16, 0.022), vec3(0.42, 0.05, 0.015), smoothstep(0.76, 0.9, g2));   // (photo) pale -> orange -> red
      rear = mix(rear, vec3(0.06, 0.005, 0.005), smoothstep(0.9, 1.04, g2));                        // maroon-black peduncle and tail
      c = mix(c, rear, smoothstep(0.52, 0.78, g2) * 0.95);   // long, soft transition
      if (uGKind > 1.5) c = mix(c, vec3(0.06, 0.01, 0.008), smoothstep(0.66, 0.84, vFinG.y) * 0.85 * smoothstep(0.5, 0.62, s));   // dark fin margin
      if (uGKind > 1.5 && uGKind < 3.5) c = mix(c, vec3(0.03, 0.006, 0.005), smoothstep(0.93, 1.0, s) * 0.8);   // near-black rear edge
      if (uGKind > 1.5 && uGKind < 2.5) c = mix(c, vec3(0.8, 0.8, 0.82), (1.0 - smoothstep(0.46, 0.6, s)) * 0.9);   // low pale membrane behind the flag
    }
    if (uGKind < 0.5) {
      // ---- face, from close-ups in several views (linear-space colours sampled from them):
      // lime-yellow snout, cheeks and ring around the eye; pale lilac-white throat and body;
      // a vivid violet stripe along the dorsal midline from between the eyes to the flag;
      // fine violet-blue speckles behind / below the eye and over the nape; oblique mouth
      float yn = vGYn;
      vec3 lilac = vec3(0.64, 0.63, 0.74), lime = vec3(0.58, 0.66, 0.2), limeHi = vec3(0.68, 0.74, 0.3);
      vec2 E = vec2(${GOBY.eye.s.toFixed(3)}, ${GOBY.eye.y.toFixed(3)});
      float headT = s + 0.07 * max(0.0, -yn) - 0.05 * max(0.0, yn);
      float face = (1.0 - smoothstep(0.085, 0.14, headT)) * (1.0 - smoothstep(0.75, 0.95, yn) * smoothstep(0.1, 0.16, s));   // lime cap over the head as far back as the eyes
      float ring = 1.0 - smoothstep(0.035, 0.05, length((p - E) * vec2(1.0, 1.1)));       // yellow skin all round the eye
      face = max(face, ring);
      face *= 1.0 - smoothstep(-0.25, -0.7, yn) * smoothstep(0.0, 0.02, s) * 0.85;       // cheek and throat pale, only tinged yellow
      vec3 base = mix(c, lilac, smoothstep(0.06, 0.2, s) * (1.0 - smoothstep(0.24, 0.34, s)) * 0.55);   // clean pale head behind the face
      c = mix(base, mix(lime, limeHi, smoothstep(0.02, -0.06, s - 0.04) * 0.5), face);
      // violet crown stripe (both sides meet at the top, so yn ~ 1)
      float az = abs(vGZ), onTop = step(0.0, yn);
      float cw = mix(0.0025, 0.006, smoothstep(0.05, 0.2, s));                              // narrow between the eyes, widening to the flag
      float crown = onTop * (1.0 - smoothstep(cw, cw + 0.002, az)) * smoothstep(0.03, 0.055, s) * (1.0 - smoothstep(0.28, 0.3, s));
      
      // seen from the side the stripe shows as a lavender line along the dorsal profile
      float lat = onTop * (1.0 - smoothstep(cw - 0.001, cw + 0.004, az)) * smoothstep(0.035, 0.06, s) * (1.0 - smoothstep(0.27, 0.3, s));
      c = mix(c, vec3(0.4, 0.22, 0.8), lat * 0.92);
      c = mix(c, vec3(0.5, 0.42, 0.85), onTop * (1.0 - smoothstep(cw + 0.002, cw + 0.006, az)) * (1.0 - crown) * smoothstep(0.03, 0.06, s) * (1.0 - smoothstep(0.23, 0.26, s)) * 0.35);
      // speckles: small round violet-blue dots, densest behind the eye and on the nape
      vec2 q = p * vec2(95.0, 95.0); vec2 cell = floor(q); vec2 fq = fract(q) - 0.5 - (vec2(gh(cell + 1.3), gh(cell + 7.1)) - 0.5) * 0.5;
      float dot_ = step(0.45, gh(cell)) * (1.0 - smoothstep(0.1, 0.18, length(fq)));
      float spReg = smoothstep(0.045, 0.08, s) * (1.0 - smoothstep(0.15, 0.22, s)) * smoothstep(-0.55, -0.1, yn) * (1.0 - smoothstep(0.84, 0.9, yn)) * (1.0 - ring * 0.8);
      c = mix(c, vec3(0.32, 0.45, 1.0), dot_ * spReg * 0.9);   // (photo) bright pale-cyan speckles behind and below the eye
      c = mix(c, vec3(0.86, 0.86, 0.92), dot_ * smoothstep(0.17, 0.24, s) * (1.0 - smoothstep(0.34, 0.42, s)) * smoothstep(-0.3, 0.2, yn) * 0.45);   // fine pale dots on the nape and upper flank
      // gill cover edge: a faint curved crease behind the cheek
      float op = 1.0 - smoothstep(0.0, 0.0035, abs(length((p - vec2(0.11, 0.02)) * vec2(1.0, 0.8)) - 0.07));
      c *= 1.0 - 0.22 * op * step(y, 0.07) * step(0.12, s);
      c *= 1.0 + 0.08 * (1.0 - smoothstep(0.0, 0.01, length((p - vec2(0.11, 0.02)) * vec2(1.0, 0.8)) - 0.0735)) * step(0.0, length((p - vec2(0.11, 0.02)) * vec2(1.0, 0.8)) - 0.0735) * step(y, 0.07) * step(0.12, s);   // lit edge of the gill-cover fold
      // mouth: dark cleft with pale lips
      vec2 M0 = vec2(${GOBY.mouth[0][0].toFixed(3)}, ${GOBY.mouth[0][1].toFixed(3)}), M1 = vec2(${GOBY.mouth[1][0].toFixed(3)}, ${GOBY.mouth[1][1].toFixed(3)});
      float u = clamp((s - M0.x) / (M1.x - M0.x), 0.0, 1.0), ym = mix(M0.y, M1.y, u), dm = abs(y - ym);
      float inM = 1.0 - smoothstep(M1.x - 0.004, M1.x + 0.003, s);
      c = mix(c, vec3(0.86, 0.86, 0.62), (1.0 - smoothstep(0.002, 0.005, abs(dm - 0.005))) * inM * 0.3);   // thick pale lips
      c = mix(c, vec3(0.16, 0.1, 0.09), (1.0 - smoothstep(0.0008, 0.002, dm)) * inM * 0.7);
    }
  }
  if (uGKind > 1.5 && uGKind < 4.5) {
    // soft rays: darker, slightly glossy lines with translucent membrane between them
    float rr = vFinG.x, ray2 = 1.0 - smoothstep(0.04, 0.16, abs(fract(rr + 0.5) - 0.5));
    c = mix(c * 1.12, c * 0.72, ray2);
    a = mix(a * 0.82, min(1.0, a * 1.1), ray2);
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
        .replace('#include <common>', '#include <common>\nattribute vec2 fin; attribute float gyn; attribute float gz; varying vec2 vFinG; varying vec2 vPaint; varying float vGYn; varying float vGZ;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvFinG = fin; vGYn = gyn; vGZ = gz; vPaint = vec2(${S0}, ${Y0}) + uv * vec2(${S1 - S0}, ${Y1 - Y0});`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPaint; varying float vGYn; varying float vGZ;\n' + GOBY_PAINT)
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
  const flagMesh = new THREE.Mesh(buildFin({ ...L.flag, sub: 4, segs: 20, pleat: 0.0008, scallop: 0.01, bow: 0.05 }), gobyMaterial(1, uniforms));
  const d2 = new THREE.Mesh(buildFin({ ...L.d2, sub: 3, segs: 10, pleat: 0.0004, scallop: 0.008 }), gobyMaterial(2, uniforms));
  const an = new THREE.Mesh(buildFin({ ...L.anal, sub: 3, segs: 10, pleat: 0.0004, scallop: 0.008 }), gobyMaterial(3, uniforms));
  const cd = new THREE.Mesh(buildFin({ ...L.caudal, sub: 3, segs: 14, pleat: 0.0005, scallop: 0.006 }), gobyMaterial(4, uniforms));
  for (const m of [flagMesh, d2, an, cd]) m.renderOrder = 2;
  group.add(d2, an, cd);
  const flagPivot = new THREE.Group();          // hinge at the front of the flag's base
  const hx = sx(0.29), hy = GOBY.top(0.29);
  flagPivot.position.set(hx, hy, 0); flagMesh.position.set(-hx, -hy, 0);
  flagPivot.add(flagMesh); group.add(flagPivot);
  // eyes: large, high on the head
  // eyes: large globes set high on the head — black pupil, silvery-white iris flushed
  // pink-violet above, lemon skin around, glossy cornea
  const { eye } = GOBY;
  for (const side of [1, -1]) {
    // globe centre just inside the local skin surface (read from the same section formula)
    const tp = GOBY.top(eye.s), bt = GOBY.bottom(eye.s), yn = (eye.y - (tp + bt) / 2) / ((tp - bt) / 2);
    const ne = 2.5 - 0.5 * THREE.MathUtils.smoothstep(eye.s, 0.12, 0.25);
    const zs = GOBY.width(eye.s) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(yn), ne)), 1 / ne) * (1 + 0.1 * yn);
    // eyes look sideways, a little forward and up (dorsolateral, as in the front views)
    const dir = new THREE.Vector3(0.28, 0.32, side).normalize();
    const M = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    M.setPosition(sx(eye.s), eye.y, side * (zs - eye.r * 0.84));
    M.multiply(new THREE.Matrix4().makeScale(1.12, 0.94, 1));   // the eye reads a little wider than high (photos)
    M.multiply(new THREE.Matrix4().makeScale(1, 1, 1));
    group.add(createFishEye({
      r: eye.r, matrix: M, pupilA: 0.56, irisA: 1.02, pupilAspect: 1.35,
      azV: [0.36, 0.03, 0.27], azH: [0.42, 0.66, 0.8], azMix: 0.85,   // (photos) magenta arcs above / below, pale blue-white in front / behind
      // close-ups: large black pupil, a bright silvery ring, then magenta-violet crescents
      pupil: [0.003, 0.003, 0.006], irisIn: [0.55, 0.6, 0.78], irisOut: [0.5, 0.07, 0.42], limbus: [0.1, 0.04, 0.12],
      sclera: [0.66, 0.74, 0.16], upper: [0.7, 0.2, 0.75], upperAmt: 0.35,
      patch: (m, k) => addSwim(m, uniforms, { key: 'goby-' + k }),
    }));
  }
  // paired fins: clear rounded pectorals, long thread-like white pelvics
  const pairs = [];
  const paired = (len, span, n, shape, kind, pos, rot) => {
    const base = [], tip = [];
    for (let i = 0; i < n; i++) { const f = i / (n - 1); base.push([0.5, (f - 0.5) * span]); const l = len * shape(f); tip.push([0.5 + l, (f - 0.5) * span * 1.5 - l * 0.2]); }
    const m = new THREE.Mesh(buildFin({ base, tip, sub: 3, segs: 10, pleat: 0.0015, scallop: kind === 6 ? 0.0 : 0.03, bow: kind === 6 ? 0.06 : 0 }), gobyMaterial(kind, uniforms));   // pelvic rays curve slightly
    m.position.set(-0.0, 0, 0);
    const piv = new THREE.Group(); piv.add(m); piv.position.set(...pos); piv.rotation.set(...rot); group.add(piv); return piv;
  };
  for (const side of [1, -1]) {
    const pec = paired(0.13, 0.06, 12, (f) => 0.6 + 0.4 * Math.sin(Math.PI * f), 5, [sx(0.19), -0.01, side * 0.048], [side * -0.2, side * 0.3, -0.2]);
    pec.userData = { side, kind: 'pec' }; pairs.push(pec);
    const pel = paired(0.21, 0.035, 2, (f) => 1 - 0.25 * f, 6, [sx(0.26), GOBY.bottom(0.26) + 0.008, side * 0.012], [side * 0.12, side * 0.05, 0.3]);   // (photo) two long, stout white rays angled back and down
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
      else p.rotation.set(side * (0.08 + 0.02 * Math.sin(t * 0.8)), side * 0.05, 0.3 + 0.05 * Math.sin(t * 0.6));
    }
  }
  return { group, update, uniforms };
}
