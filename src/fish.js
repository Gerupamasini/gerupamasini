// Threadfin butterflyfish (トゲチョウチョウオ, Chaetodon auriga) — procedural model.
//
// Fish space: snout tip at x = +0.5, caudal peduncle end at x = -0.5 (body length 1),
// y up, z = left/right. "s" is the normalised position from snout (0) to peduncle (1).
// All of the colour pattern is painted in a side-view (s, y) space by a GPU bake, so
// the body and the median fins share one continuous painting, like the real animal.
import * as THREE from 'three';
import { createFishEye } from './eye.js';

// ---------------------------------------------------------------- anatomy ---------

// Catmull-Rom through (s, v) control points, evaluated at s.
export function spline(pts) {
  return (s) => {
    if (s <= pts[0][0]) return pts[0][1];
    const n = pts.length;
    if (s >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (s > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    const t = (s - p1[0]) / (p2[0] - p1[0]);
    // non-uniform tangents scaled to the segment
    const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * (p2[0] - p1[0]);
    const m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * (p2[0] - p1[0]);
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}

// Dorsal and ventral body outline (without fins), half width.
// Outline traced from a public-domain side-view photograph (iNaturalist photo 67560751, CC0)
// and cross-checked on three other side views: snout tip s = 0, caudal peduncle s = 1.
// The snout is long and low, the forehead rises steeply from s = 0.12, and the belly is
// shallow; the dorsal and anal fins make the rear of the fish tall and square.
export const ANATOMY = {
  top: spline([[0, 0.013], [0.012, 0.019], [0.0369, 0.0305], [0.0917, 0.0585], [0.124, 0.08], [0.1353, 0.104], [0.153, 0.139], [0.171, 0.172],
    [0.19, 0.21], [0.212, 0.243], [0.238, 0.27], [0.266, 0.287], [0.294, 0.301], [0.35, 0.304], [0.45, 0.296], [0.6, 0.274],
    [0.75, 0.232], [0.85, 0.17], [0.91, 0.1], [0.95, 0.055], [0.975, 0.04], [1.0, 0.035]]),   // slender caudal peduncle (side-view photos)
  bottom: spline([[0, -0.013], [0.0164, -0.019], [0.046, -0.026], [0.089, -0.046], [0.129, -0.075], [0.171, -0.099],
    [0.2125, -0.124], [0.254, -0.148], [0.297, -0.168], [0.34, -0.186], [0.384, -0.199], [0.45, -0.21], [0.55, -0.205],
    [0.65, -0.19], [0.75, -0.165], [0.85, -0.124], [0.91, -0.08], [0.95, -0.046], [0.975, -0.036], [1.0, -0.033]]),
  width: spline([[0, 0.009], [0.012, 0.011], [0.03, 0.013], [0.06, 0.015], [0.1, 0.019], [0.15, 0.027], [0.25, 0.037], [0.38, 0.041], [0.5, 0.039],
    [0.65, 0.041], [0.8, 0.027], [0.88, 0.016], [0.93, 0.0095], [0.96, 0.0062], [0.985, 0.0035], [1.0, 0.0022]]),   // thin, compressed peduncle
  eye: { s: 0.16, y: 0.03, r: 0.033 },
};

// painting space
const DEPTH = 1.09;
const S0 = -0.03, S1 = 1.3, Y0 = -0.52, Y1 = 0.6;
const toUV = (s, y) => [(s - S0) / (S1 - S0), (y - Y0) / (Y1 - Y0)];
const sx = (s) => 0.5 - s; // s -> fish-space x

// ------------------------------------------------------------- body mesh ----------

function lensZ(yn, w, s = 0.5) {
  // cross-section: thick above the midline, sharp dorsal/ventral keels feeding the fins
  const a = Math.max(0, 1 - Math.pow(Math.abs(yn), 2.1));
  const z = w * Math.pow(a, 0.62) * (1 + 0.12 * yn);
  // where a median fin sits on the keel, the flank sweeps into it with a concave, scaled
  // fin root (as in real chaetodontids) instead of meeting a flat fin at a crease
  const k = yn < 0 ? THREE.MathUtils.smoothstep(s, 0.46, 0.6) : THREE.MathUtils.smoothstep(s, 0.27, 0.36);
  if (k <= 0) return z;
  const e = 1 - Math.abs(yn), E = 0.6, finT = Math.min(0.013, w * 0.9 * Math.min(1, ANATOMY.width(s) / 0.014));   // never wider than the body (thin peduncle)
  if (e >= E) return z;
  const aE = 1 - Math.pow(1 - E, 2.1), zE = w * Math.pow(aE, 0.62) * (1 + 0.12 * yn);
  const root = finT + (zE - finT) * Math.pow(e / E, 1.7);     // concave, flush with the fin shell at the keel
  return z + (Math.min(root, Math.max(z, finT)) - z) * k;
}

function buildBody() {
  const NS = 220, NR = 160;
  const { top, bottom, width } = ANATOMY;
  const pos = [], uv = [], idx = [];
  // s distribution denser at the snout
  const sAt = (i) => { const t = i / (NS - 1); return 0.004 + (1 - 0.004) * (t * t * 0.35 + t * 0.65); };
  for (let i = 0; i < NS; i++) {
    const s = sAt(i);
    const tp = top(s), bt = bottom(s), c = (tp + bt) / 2, hh = (tp - bt) / 2;
    let w = width(s);
    for (let j = 0; j < NR; j++) {
      const th = (j / NR) * Math.PI * 2;
      const yn = Math.cos(th);
      const y = c + hh * yn;
      let z = Math.sign(Math.sin(th)) * lensZ(yn, w, s);
      // head: cheek / operculum bulge, forehead dip in front of the eye
      const cheek = Math.exp(-(((s - 0.22) / 0.07) ** 2) - (((y + 0.03) / 0.09) ** 2));
      z *= 1 + 0.04 * cheek;
      // slight concave predorsal profile (nape) is in the outline; snout is a tube
      pos.push(sx(s), y, z);
      uv.push(...toUV(s, y));
    }
  }
  for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NR; j++) {
    const a = i * NR + j, b = i * NR + (j + 1) % NR, c = (i + 1) * NR + j, d = (i + 1) * NR + (j + 1) % NR;
    idx.push(a, c, b, b, c, d);
  }
  // snout cap (mouth)
  const tipI = pos.length / 3;
  pos.push(sx(0) - 0.006, (top(0) + bottom(0)) / 2 - 0.002, 0); uv.push(...toUV(0, 0));
  for (let j = 0; j < NR; j++) idx.push(tipI, j, (j + 1) % NR);
  // peduncle cap
  const endI = pos.length / 3, last = (NS - 1) * NR;
  pos.push(sx(1.0), (top(1) + bottom(1)) / 2, 0); uv.push(...toUV(1, 0));
  for (let j = 0; j < NR; j++) idx.push(endI, last + (j + 1) % NR, last + j);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------- fin meshes ---------

// A fin is a fan of rays, each from base[i] to tip[i] in side-view (s, y) space.
// Membranes are subdivided between rays; the free edge is scalloped between ray tips and
// the membrane is pleated (rays alternately forward/back) like a real folded fin.
// thick > 0 builds a closed thin shell: fleshy at the root, thinning to the edge, with the
// rays standing slightly proud of the membrane on both faces.
export function buildFin({ base, tip, sub = 4, segs = 16, pleat = 0.0035, scallop = 0.06, bow = 0.0, zOff = 0, flat = false, spines = -1, spineScallop = 0.14, thick = 0, ridge = 0.25, thickAt = null }) {
  const nR = base.length;
  const pos = [], uv = [], fin = [], idx = [], side = [];
  const cols = (nR - 1) * sub + 1;
  for (let c = 0; c < cols; c++) {
    const r = c / sub, i0 = Math.min(Math.floor(r), nR - 2), f = r - i0;
    const lerp2 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    const b = lerp2(base[i0], base[i0 + 1], f);
    const tp = lerp2(tip[i0], tip[i0 + 1], f);
    const between = Math.sin(Math.PI * f); // 0 on rays, 1 mid-membrane
    const reach = 1 - (r < spines ? spineScallop : scallop) * Math.pow(between, 0.7);
    for (let k = 0; k <= segs; k++) {
      const t = (k / segs) * reach;
      let s = b[0] + (tp[0] - b[0]) * t, y = b[1] + (tp[1] - b[1]) * t;
      // rays bow a little (soft rays curve backwards)
      const dx = tp[0] - b[0], dy = tp[1] - b[1];
      const bw = bow * Math.sin(Math.PI * t);
      s += -dy * bw; y += dx * bw;
      const z = flat ? 0 : pleat * Math.pow(t, 0.8) * Math.cos(Math.PI * r) + zOff;
      const th = thick * (thickAt ? thickAt(b[0]) : 1) * THREE.MathUtils.smoothstep(Math.hypot(dx, dy), 0.0, 0.07) * (Math.pow(1 - t, 3.0) * 0.94 + 0.06 * (1 - 0.6 * t) + ridge * (1 - between) * (1 - t));   // fleshy root, thin edge
      pos.push(sx(s), y, z + th);
      uv.push(...toUV(s, y));
      fin.push(r, t / 1.0);
      side.push(sx(s), y, z - th);
    }
  }
  const rows = segs + 1;
  for (let c = 0; c < cols - 1; c++) for (let k = 0; k < segs; k++) {
    const a = c * rows + k, b2 = a + 1, cc = a + rows, d = cc + 1;
    idx.push(a, cc, b2, b2, cc, d);
  }
  if (thick > 0) {
    // back face (reversed winding) and a strip closing the free edge
    const n0 = pos.length / 3;
    pos.push(...side); uv.push(...uv.slice(0, n0 * 2)); fin.push(...fin.slice(0, n0 * 2));
    for (let c = 0; c < cols - 1; c++) for (let k = 0; k < segs; k++) {
      const a = n0 + c * rows + k, b2 = a + 1, cc = a + rows, d = cc + 1;
      idx.push(a, b2, cc, b2, d, cc);
    }
    for (let c = 0; c < cols - 1; c++) {
      const a = c * rows + segs, b2 = a + rows, a2 = a + n0, b3 = b2 + n0;
      idx.push(a, a2, b2, b2, a2, b3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('fin', new THREE.Float32BufferAttribute(fin, 2)); // (ray coordinate, 0 base..1 edge)
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// sample a closed-ish outline spline by arclength-ish parameter
export function polyline(pts, n) {
  // pts: [[s,y],...] ; returns n points evenly spaced along the polyline, Catmull-Rom smoothed
  const P = [];
  const m = pts.length;
  for (let i = 0; i < m - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, m - 1)];
    for (let k = 0; k < 20; k++) {
      const t = k / 20, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      P.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  P.push(pts[m - 1]);
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const out = [];
  for (let k = 0; k < n; k++) {
    const d = (k / (n - 1)) * L[L.length - 1];
    let i = 1; while (i < L.length - 1 && L[i] < d) i++;
    const f = (d - L[i - 1]) / (L[i] - L[i - 1] || 1);
    out.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]);
  }
  return out;
}

function finLayouts() {
  const { top, bottom } = ANATOMY;
  // outer edges from the traced photograph
  const nD = 37;
  const dBase = [], dTip = polyline([[0.3, 0.312], [0.3459, 0.3226], [0.3957, 0.3313], [0.445, 0.3383], [0.4932, 0.3407], [0.541, 0.3414],
    [0.5886, 0.3411], [0.6346, 0.3345], [0.6806, 0.328], [0.7262, 0.3197], [0.7722, 0.3131], [0.8177, 0.3048], [0.8631, 0.2955],
    [0.9073, 0.2818], [0.9518, 0.269], [0.9949, 0.2508], [1.03, 0.236], [1.058, 0.222], [1.066, 0.205],
    [1.05, 0.172], [1.025, 0.138], [1.0, 0.108], [0.99, 0.09], [0.978, 0.072], [0.972, 0.058]], nD);   // rear edge runs down onto the peduncle, meeting the caudal root   // near-vertical rear edge down to a sharp notch (aligned photo)   // deep, open notch above the peduncle
  for (let i = 0; i < nD; i++) { const s = 0.295 + (0.968 - 0.295) * (i / (nD - 1)); dBase.push([s, top(s) - 0.003]); }
  const nA = 26;
  const aBase = [], aTip = polyline([[0.49, -0.212], [0.592, -0.2264], [0.6847, -0.2368], [0.7547, -0.2426], [0.8265, -0.2412],
    [0.8758, -0.2342], [0.9487, -0.2283], [1.0, -0.216], [1.04, -0.2], [1.066, -0.178], [1.08, -0.15],
    [1.078, -0.13], [1.058, -0.112], [1.03, -0.092], [1.0, -0.075], [0.985, -0.062], [0.972, -0.052]], nA);   // rounded rear lobe
  for (let i = 0; i < nA; i++) { const s = 0.48 + (0.968 - 0.48) * (i / (nA - 1)); aBase.push([s, bottom(s) + 0.012 * THREE.MathUtils.smoothstep(s, 0.48, 0.6)]); }   // root sunk into the fleshy keel
  const nC = 19;
  // caudal: rises from the narrow peduncle and flares into a broad, short fan
  const cBase = [], cTip = polyline([[1.07, 0.205], [1.108, 0.13], [1.13, 0.07], [1.136, 0.04], [1.142, -0.02], [1.144, -0.07], [1.136, -0.11], [1.11, -0.145], [1.08, -0.16]], nC);   // lower corner tucked behind the anal lobe   // shorter fan, steep upper corner (aligned photo)   // truncate, faintly concave, angular corners
  for (let i = 0; i < nC; i++) { const f = i / (nC - 1), s = 0.955 + 0.012 * Math.sin(Math.PI * f); cBase.push([s, top(s) - 0.004 - f * (top(s) - bottom(s) - 0.008)]); }
  return { dorsal: { base: dBase, tip: dTip }, anal: { base: aBase, tip: aTip }, caudal: { base: cBase, tip: cTip } };
}

// pectoral / pelvic fins are built in their own local frame (x back along the fin, y span)
function buildPairedFin({ len, span, n, shape, pleat = 0.002 }) {
  const base = [], tip = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    base.push([0, (f - 0.5) * span]);
    const L = len * shape(f);
    tip.push([L, (f - 0.5) * span * 1.6 - L * 0.25]);
  }
  const g = buildFin({ base, tip, sub: 3, segs: 12, pleat, scallop: 0.02 });
  return g;
}

// ---------------------------------------------------------- texture bake ----------

const PAINT_GLSL = /* glsl */`
uniform vec2 uOutline[96];   // (top, bottom) at s = i/95
uniform vec2 uOcellus;       // eyespot centre in (s,y)
uniform vec2 uTexel;         // size of one texel in (s,y)
uniform sampler2D uPattern;  // traced pattern masks
uniform sampler2D uPhoto; uniform float uPhotoMix;
float stCoreEarly(float b, float s){ return smoothstep(0.6, 0.85, b) * smoothstep(0.26, 0.3, s); }
varying vec2 vP;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, r=0.; for(int i=0;i<5;i++){ r+=a*vnoise(p); p*=2.03; a*=.5;} return r; }

vec2 outline(float s){
  float f = clamp(s, 0., 1.) * 95.; int i = int(floor(f)); int j = min(i+1, 95);
  return mix(uOutline[i], uOutline[j], fract(f));
}
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }

// --- overlapping cycloid scales; returns height, writes per-scale id
float scales(vec2 p, out float sid, out float rim){
  float sz = 0.0135;
  vec2 q = vec2(p.x, p.y*1.1) / sz;
  float r0 = floor(q.y);
  float best = 1e9; float h = 0.; sid = 0.; rim = 0.;
  for (int dr=-1; dr<=1; dr++){
    float r = r0 + float(dr);
    float off = mod(r, 2.) * .5;
    float c0 = floor(q.x - off);
    for (int dc=-1; dc<=1; dc++){
      float c = c0 + float(dc);
      vec2 ctr = vec2(c + off + .5, r + .5);
      ctr += (vec2(hash(ctr+3.1), hash(ctr+7.7)) - .5) * 0.12;
      vec2 d = q - ctr;
      float dist = length(d * vec2(0.95, 1.0));
      if (dist < 0.78 && ctr.x < best) {
        best = ctr.x;
        float e = smoothstep(0.64, 0.78, dist) * smoothstep(-0.2, 0.3, d.x);  // free posterior margin
        h = 0.45 + 0.55*smoothstep(-0.9, 0.6, d.x) - 0.35*e;
        // radiating circuli / ridges on the exposed field
        h += 0.02 * sin(atan(d.y, d.x) * 14.0) * smoothstep(0.2, 0.6, dist) * step(0.0, d.x);
        sid = hash(ctr);
        rim = e;
      }
    }
  }
  return h;
}

// ---- stripe field, fitted to photographs -------------------------------------------
// Two families of dark stripes at ~right angles. "B" covers the lower and middle body and
// rises toward the head (flattening near the belly); "A" fills the upper front and turns
// vertical near the eye band. They meet along a line running from low behind the gill cover
// up and back to the soft dorsal, where they form rounded arches.
uniform float uSpB; uniform float uSpA; uniform float uSlopeB; uniform float uSlopeA;
uniform vec4 uLocus;      // two points of the A/B meeting line
uniform vec2 uYellowP;    // a point on the B stripe that bounds the yellow field
uniform vec4 uYellowL;    // the white/yellow boundary crosses the stripes along this line
float fieldB(vec2 p){ float m = uSlopeB * mix(0.45, 1.0, smoothstep(-0.25, 0.05, p.y)); return (p.y + m * p.x) / uSpB; }
// A stripes continue the B stripes across the meeting line: follow the A direction from p
// back to that line and take the B stripe arriving there. With the line close to the
// bisector of the two directions the stripes join in rounded arches of equal spacing.
float fieldA(vec2 p){
  vec2 a = uLocus.xy, d = normalize(uLocus.zw - uLocus.xy), nL = vec2(-d.y, d.x);
  float ang = radians(mix(74.0, uSlopeA, smoothstep(0.19, 0.3, p.x)));
  vec2 dA = vec2(cos(ang), sin(ang));
  float n = dot(p - a, nL);
  return fieldB(p - dA * (n / dot(dA, nL)));
}
float locusSide(vec2 p){ vec2 a = uLocus.xy, d = normalize(uLocus.zw - uLocus.xy); vec2 n = vec2(-d.y, d.x); return dot(p - a, n); }

// eye band: a short, broad capsule from just above the eye to below the cheek
float eyeBand(vec2 p){ float d = sdSeg(p, vec2(0.163, 0.115), vec2(0.18, -0.14)); return d + 0.004 - 0.006 * smoothstep(0.08, -0.1, p.y); }

struct Paint { vec3 col; float alpha; float h; float rough; float metal; float ao; };

float stripe(float f, float w){          // 1 on a stripe (width w in stripe units), antialiased
  float d = abs(fract(f) - 0.5);
  float aa = fwidth(f) * 0.0 + 0.02;
  return smoothstep(0.5 - w * 0.5 - aa, 0.5 - w * 0.5 + aa, d);
}

Paint paint(vec2 p){
  Paint o;
  float s = p.x, y = p.y;
  vec2 ol = outline(s);
  float top = ol.x, bot = ol.y;
  bool inBody = s >= 0. && s <= 1.0 && y <= top && y >= bot;
  bool behind = s > 0.975 && abs(y) < 0.045 + (s - 0.975) * 0.6;          // the caudal fan
  bool dorsal = !inBody && y > 0.0 && s < 1.12 && !behind;
  bool anal = !inBody && y < 0.0 && s < 1.12 && s > 0.3 && !behind;
  bool caudal = !inBody && !dorsal && !anal;
  float yn = clamp((y - (top+bot)*.5) / max((top-bot)*.5, 1e-3), -1., 1.);

  vec3 white  = vec3(0.84, 0.855, 0.86);     // pearl grey-white
  vec3 yellow = vec3(1.0, 0.78, 0.0);
  vec3 orange = vec3(1.0, 0.62, 0.0);
  vec3 brown  = vec3(0.46, 0.25, 0.05);
  vec3 ink    = vec3(0.3, 0.29, 0.285);      // soft grey-brown

  // --- pattern masks traced from a photograph of a real fish (see tools/masks2.py):
  //     r = yellow field (+ gap lines), g = brown zone (s > 0.32) or eye band (s < 0.32), b = stripe distance
  // the traced stripes are ruler-straight; in life they bow with the curve of the flank:
  // the lower (rearward-descending) set sags in the middle, the upper set bows forward, and
  // every line wanders slightly. Warp the lookup of the traced masks and photo accordingly.
  vec2 pw = p;
  {
    float lower = smoothstep(0.12, -0.05, y + (s - 0.45) * 0.4) * smoothstep(0.28, 0.4, s);
    pw.y += 0.02 * sin(clamp((s - 0.3) / 0.7, 0.0, 1.0) * 3.1416) * lower;
    float upper = smoothstep(0.05, 0.18, y) * (1.0 - smoothstep(0.5, 0.62, s)) * smoothstep(0.2, 0.28, s);
    pw.x -= 0.022 * sin(clamp((y - 0.0) / 0.32, 0.0, 1.0) * 3.1416) * upper;
    float inF = smoothstep(0.24, 0.3, s) * (inBody ? 1.0 : 0.0);
    pw += inF * vec2(0.0025 * sin(p.y * 31.0 + p.x * 7.0), 0.003 * sin(p.x * 23.0 - p.y * 11.0 + 1.3));
  }
  vec4 pm = texture2D(uPattern, (pw - vec2(${S0.toFixed(4)}, ${Y0.toFixed(4)})) / vec2(${(S1 - S0).toFixed(4)}, ${(Y1 - Y0).toFixed(4)}));
  float aa = 0.12;
  float Y  = smoothstep(0.1, 0.4, pm.r);          // r: 0..0.5 yellow field, 0.5..1 thin yellow gap lines
  float Br = s < 0.32 ? 0.0 : pm.g;
  // b = distance field to stripe centre lines: thin stripes on the white, widening into
  // dark bands in the dusky zone so that only thin yellow gaps remain between them
  float thr = 0.7;    // stripes ~40% of the spacing, as in photographs   // half-width 7.5 px of the 36 px field
  float stV = smoothstep(thr - 0.07, thr + 0.07, pm.b);
  float ylV = 0.0;
  float st = stV * (0.85 + 0.15 * vnoise(p * 70.0));
  float yl = smoothstep(0.3, 0.7, ylV);
  float bandM = s < 0.32 ? smoothstep(0.5 - aa, 0.5 + aa, pm.g) : 0.0;
  if (caudal) { Y = 1.0; st = 0.0; bandM = 0.0; }
  if (anal && s > 0.45) Y = max(Y, smoothstep(0.45, 0.6, s));   // anal fin yellow
  vec3 yel = mix(yellow, orange, clamp(smoothstep(0.55, 1.05, s) * 0.45 + Br * 0.5 + smoothstep(0.0, 0.3, y) * 0.25, 0.0, 1.0));
  yel = mix(yel, vec3(1.0, 0.86, 0.3), smoothstep(-0.05, -0.25, y) * 0.5);
  // dusky zone: dark brown, with thin bright yellow lines along the middle of each gap
  float Brn = smoothstep(0.04, 0.45, Br);
  vec3 warmCol = mix(yel, brown * mix(0.7, 0.5, smoothstep(0.1, 0.3, y)), Brn * 0.8);
  float gapLine = clamp((pm.r - 0.52) * 2.2, 0.0, 1.0) * smoothstep(0.15, 0.5, Brn);
  warmCol = mix(warmCol, vec3(1.0, 0.86, 0.1), gapLine);   // gaps in the dusky zone stay yellow-orange
  vec3 col = mix(white, warmCol, Y);
  col = mix(col, mix(ink, brown * mix(0.5, 0.32, Br), Y), st);
  // photographic albedo (de-lit CC0 photo in painting space) replaces the mask painting
  // wherever it covers the fish; the masks remain as a fallback outside it
  vec4 ph = texture2D(uPhoto, (pw - vec2(${S0.toFixed(4)}, ${Y0.toFixed(4)})) / vec2(${(S1 - S0).toFixed(4)}, ${(Y1 - Y0).toFixed(4)}));
  ph.a *= (1.0 - smoothstep(0.82, 0.9, s)) * (1.0 - smoothstep(0.6, 0.85, abs(yn)) * smoothstep(0.6, 0.75, s));   // photo outline edge / hot spot: painted yellow on the peduncle and along the fin roots   // the photo has a sunlit hot spot on the peduncle: use the painted yellow there
  col = mix(col, ph.rgb, ph.a * uPhotoMix);
  // the photo's dusky saddle is darkened by shadow and motion blur; in life it is a narrower
  // amber-brown transition, so lift dark warm tones in the yellow zone back toward orange
  {
    float lum = dot(col, vec3(0.3, 0.55, 0.15));
    float warm = smoothstep(1.2, 2.2, col.r / max(col.b, 0.02)) * smoothstep(0.42, 0.12, lum) * (1.0 - stCoreEarly(pm.b, s));
    col = mix(col, mix(yel, orange, 0.5) * 0.72, warm * 0.55 * ph.a * uPhotoMix);
    // blurred reflection in the photo left a grey-green haze at the shoulder: pull greenish tints back to pearl white
    float greenish = smoothstep(0.0, 0.05, col.g - col.r) * smoothstep(0.0, 0.08, col.g - col.b) * smoothstep(0.3, 0.38, s) * (1.0 - smoothstep(0.62, 0.7, s));
    col = mix(col, white * (0.92 + 0.08 * lum), greenish * 0.8 * ph.a * uPhotoMix);
  }
  float rearK = 0.0;
  // rear body: in photographs the area behind the dusky band, the peduncle and the flesh
  // along the soft dorsal and anal fin bases are clear yellow, continuous with the fins
  if (inBody) {
    // the dusky band is only ~0.07 body lengths wide, just behind the diagonal rear edge of
    // the white striped field (from the soft dorsal origin down to the anal fin); behind it
    // the body is solid yellow, deepening to orange-yellow toward the top
    // distance to the white field, probed along the boundary normal (toward the head and belly)
    vec2 PU = vec2(${S0.toFixed(4)}, ${Y0.toFixed(4)}), PS = vec2(${(S1 - S0).toFixed(4)}, ${(Y1 - Y0).toFixed(4)});
    #define WHITE_AT(o) smoothstep(0.42, 0.6, min(min(texture2D(uPhoto, (pw + (o) - PU) / PS).r, texture2D(uPhoto, (pw + (o) - PU) / PS).g), texture2D(uPhoto, (pw + (o) - PU) / PS).b))
    float here = WHITE_AT(vec2(0.0));
    float nearWhite = max(WHITE_AT(vec2(-0.025, -0.025)), WHITE_AT(vec2(-0.048, -0.045)) * 0.85);
    float rearY = max(smoothstep(0.8, 0.93, s) * max(smoothstep(0.02, 0.07, y - bot), smoothstep(0.93, 0.98, s)), max(1.0 - nearWhite, smoothstep(0.02, -0.07, y) * smoothstep(0.68, 0.8, s)) * (1.0 - here) * smoothstep(0.4, 0.5, s));
    float nearDorsal = smoothstep(0.55, 0.7, s) * smoothstep(0.07, 0.0, top - y);
    float nearAnal = smoothstep(0.62, 0.75, s) * smoothstep(0.05, 0.0, y - bot) * smoothstep(0.02, -0.08, y);
    float k = max(rearY, nearDorsal);
    rearK = k;   // (the belly above the anal fin stays white, as photographed)
    col = mix(col, mix(vec3(0.99, 0.76, 0.07), vec3(0.97, 0.66, 0.03), smoothstep(-0.05, 0.25, y)), k);   // baked texture is sRGB
  }
  // the photo's stripes are soft (motion + JPEG); reinforce them with the traced stripe field
  float stCore = smoothstep(0.7, 0.9, pm.b) * smoothstep(0.26, 0.3, s) * (1.0 - Y * 0.6);
  col = mix(col, col * vec3(0.3, 0.3, 0.34), stCore * 0.6 * uPhotoMix);
  float stripeMask = 1.0;
  float eb = 1.0;
  float h = 0.0, rough = 0.4, metal = 0.12, ao = 1.0, alpha = 1.0;

  if (inBody) {
    // subtle scales: visible mostly as sheen, not relief
    float sid, rim;
    // scales fade out toward the median-fin roots and over the yellow rear, so body and fins
    // share one material there (no rim where they meet)
    float scaleMask = 0.6 * smoothstep(0.27, 0.36, s) * (1. - smoothstep(0.55, 0.95, abs(yn)) * smoothstep(0.4, 0.6, s)) * (1. - smoothstep(0.8, 1.0, abs(yn))) * (1.0 - 0.7 * rearK);
    float sh = scales(p, sid, rim);
    h = sh * scaleMask * 0.16;
    col *= mix(1.0, 0.985 + 0.03*sid, scaleMask);
    metal = mix(0.05, 0.3 + 0.15*sid, scaleMask) * (1. - Y*0.6) * (1. - st);
    rough = mix(0.45, 0.3 + 0.1*sid, scaleMask);
    // lavender-grey shading of the white in the shadowed belly and around the gill cover
    col = mix(col, col * vec3(0.93, 0.93, 0.98), smoothstep(0.2, -0.9, yn) * 0.5 * (1.0 - Y));
    // head: snout white-grey, darker tip; lips; gill cover rim
    float snout = 1. - smoothstep(0.02, 0.1, s);
    col = mix(col, vec3(0.8, 0.79, 0.78), snout * 0.7);
    col = mix(col, vec3(0.5, 0.48, 0.5), 1. - smoothstep(0.005, 0.016, s));          // thin grey lips
    float slit = (1. - smoothstep(0.0012, 0.003, abs(y + 0.001))) * (1. - smoothstep(0.004, 0.012, s));
    col = mix(col, vec3(0.2, 0.15, 0.15), slit); h -= 0.8 * slit;
    float opR = length((p - vec2(0.14, 0.0)) * vec2(1.0, 0.75));
    float op = (1. - smoothstep(0.0, 0.007, abs(opR - 0.115))) * smoothstep(0.12, -0.05, y) * step(0.15, s);
    col = mix(col, vec3(0.93, 0.93, 0.95), (1. - smoothstep(0.004, 0.012, abs(opR - 0.125))) * smoothstep(0.1, -0.05, y) * step(0.2, s) * 0.5 * (1.0 - bandM));   // pale gill-cover margin
    h -= 0.35 * op; col *= 1. - 0.06 * op;
    for (int k = 0; k < 2; k++) {   // nostrils
      vec2 nc = vec2(0.105 + 0.012*float(k), 0.075 + 0.004*float(k));
      float pit = 1. - smoothstep(0.002, 0.004, length((p - nc) * vec2(1.0, 1.3)));
      h -= 0.9 * pit; col = mix(col, vec3(0.35, 0.33, 0.32), pit * 0.7);
    }
    // eye band: vertical, rounded above the eye, running down to the throat (as in photographs)
    float t01 = clamp((0.075 - y) / 0.22, 0.0, 1.0);   // 0 at the top of the band, 1 at the throat
    float wob = 0.004 * (fbm(p * 60.0) - 0.5);
    float wob2 = 0.006 * (fbm(p * 25.0) - 0.5);
    float fr = mix(0.136, 0.124, t01) + 0.008 * sin(t01 * 3.1416) + wob + wob2, bk = mix(0.19, 0.228, t01) + 0.016 * sin(t01 * 3.1416) - wob + wob2;   // convex rear edge, organic outline   // narrow above the eye, wide at the throat
    float dB = max(max(fr - s, s - bk), 0.0);
    // above the eye the band narrows and runs on up over the nape to the dorsal profile
    if (y > 0.075) { float u2 = clamp((y - 0.075) / 0.12, 0.0, 1.0); fr = mix(fr, 0.146, u2); bk = mix(bk, 0.178, u2); }
    float topCap = length(vec2((s - (fr + bk) * 0.5) / ((bk - fr) * 0.5), (y - 0.28) / 0.04)) - 1.0;
    float inBand = step(0.0, -max(fr - s, s - bk)) * (y < 0.28 ? 1.0 : step(topCap, 0.0));
    float edgeD = min(min(s - fr, bk - s), y < 0.28 ? 1.0 : -topCap * 0.02);
    float band = smoothstep(-0.0015, 0.0025, edgeD) * inBand;
    // the photo's own band sits too far back and low (the eye was at its upper edge): clear its
    // dark pixels outside the anatomical band, then paint the band procedurally everywhere
    float phLum = dot(col, vec3(0.3, 0.55, 0.15));
    float phDark = smoothstep(0.6, 0.3, phLum) * step(0.04, s) * (1.0 - smoothstep(0.25, 0.265, s)) * step(-0.3, y) * step(y, 0.2);
    col = mix(col, white * (0.95 + 0.05 * fbm(p * 40.0)), phDark * (1.0 - band) * ph.a * uPhotoMix);
    float bandRim = (1.0 - smoothstep(0.0, 0.006, -edgeD)) * (1.0 - band) * step(fr - 0.012, s) * step(s, bk + 0.012);
    col = mix(col, vec3(0.98, 0.985, 1.0), bandRim * 0.0);
    col = mix(col, vec3(0.045, 0.036, 0.034), band);
    metal = mix(metal, 0.0, band); rough = mix(rough, 0.32, band);
    // faint pale sheen along the back of the white field
    col *= 0.975 + 0.05 * fbm(p * 30.);
  } else if (dorsal) {
    // spinous part carries the white + stripes, soft part is yellow
    float r = length(((p - uOcellus) * mat2(0.985, 0.17, -0.17, 0.985)) * vec2(1.0, 1.7));
    float spot = 1. - smoothstep(0.036 - uTexel.x, 0.036 + uTexel.x, r);
    float ring = (1. - smoothstep(0.046, 0.05, r)) * (1.0 - spot);          // pale yellow ring around the eyespot
    col = mix(col, vec3(1.0, 0.9, 0.35), ring * 0.8);
    col = mix(col, vec3(0.03, 0.025, 0.025), spot);
    alpha = 0.5 + 0.5 * spot;
    rough = 0.45; metal = 0.0;
  } else if (anal) {
    rough = 0.45; metal = 0.0; alpha = 0.5;
  } else {
    col = mix(yel, vec3(1.0, 0.85, 0.3), smoothstep(1.08, 1.16, s));
    rough = 0.45; metal = 0.0; alpha = 0.5;
  }
  if (!inBody) {
    col *= 0.97 + 0.06 * fbm(p * 50.);
    float sheath = dorsal ? 1. - smoothstep(0.003, 0.02, y - top) : anal ? 1. - smoothstep(0.003, 0.02, bot - y) : 1. - smoothstep(0.99, 1.03, s);
    if (sheath > 0.0) { float a2, b2; h = scales(p * 1.7 + 3.0, a2, b2) * sheath * 0.4; alpha = mix(alpha, 1.0, sheath); }
  }
  o.col = col; o.alpha = alpha; o.h = h; o.rough = rough; o.metal = metal; o.ao = ao;
  return o;
}
`;

function bakeTextures(renderer, W, H, ocellus, pattern, photo) {
  const { top, bottom } = ANATOMY;
  const outline = [];
  for (let i = 0; i < 96; i++) { const s = i / 95; outline.push(new THREE.Vector2(top(s), bottom(s))); }
  const texel = new THREE.Vector2((S1 - S0) / W, (Y1 - Y0) / H);
  const common = {
    uOutline: { value: outline }, uOcellus: { value: new THREE.Vector2(...ocellus) }, uTexel: { value: texel }, uPattern: { value: pattern }, uPhoto: { value: photo }, uPhotoMix: { value: photo ? 1 : 0 },
    // stripe field measured from photographs (see PAINT_GLSL)
    uSpB: { value: 0.086 }, uSpA: { value: 0.06 }, uSlopeB: { value: 0.75 }, uSlopeA: { value: 62.0 },
    uLocus: { value: new THREE.Vector4(0.41, -0.2, 0.33, 0.36) }, uYellowP: { value: new THREE.Vector2(0.5, 0.33) }, uYellowL: { value: new THREE.Vector4(0.47, 0.35, 0.86, -0.23) },
  };
  const vert = `varying vec2 vP; void main(){ vP = vec2(${S0.toFixed(4)}, ${Y0.toFixed(4)}) + uv * vec2(${(S1 - S0).toFixed(4)}, ${(Y1 - Y0).toFixed(4)}); gl_Position = vec4(position.xy, 0., 1.); }`;
  const passes = {
    albedo: `void main(){ Paint a = paint(vP); gl_FragColor = vec4(a.col, a.alpha); }`,
    normal: `void main(){
      Paint c = paint(vP), px = paint(vP + vec2(uTexel.x, 0.)), py = paint(vP + vec2(0., uTexel.y));
      float k = 0.0014;   // bump height in fish units for h = 1
      vec3 n = normalize(vec3(-(px.h - c.h) * k / uTexel.x, -(py.h - c.h) * k / uTexel.y, 1.0));
      gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); }`,
    orm: `void main(){ Paint a = paint(vP); gl_FragColor = vec4(a.ao, a.rough, a.metal, 1.0); }`,
  };
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  scene.add(quad);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false });
  const out = {};
  const prevRT = renderer.getRenderTarget();
  for (const [name, main] of Object.entries(passes)) {
    quad.material = new THREE.ShaderMaterial({ uniforms: common, vertexShader: vert, fragmentShader: PAINT_GLSL + main });
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const buf = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    const tex = new THREE.DataTexture(buf, W, H, THREE.RGBAFormat);
    tex.colorSpace = name === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    out[name] = tex;
    quad.material.dispose();
  }
  renderer.setRenderTarget(prevRT);
  rt.dispose();
  return out;
}

// ---------------------------------------------------------- swim deformation ------

// Injected into every fish material: carangiform-ish travelling wave, amplitude growing
// toward the tail (butterflyfish cruise mostly on pectorals, so it is gentle), plus
// matching normal rotation so the lighting follows the bend.
const SWIM_PARS = /* glsl */`
uniform float uPhase; uniform float uAmp; uniform float uTurn;
// Lateral spine slope dz/ds: a travelling wave growing toward the tail, plus a C-shaped
// bend for turning (stiff head, flexible tail).
float spineSlope(float s){
  float k = 5.2;
  float A  = uAmp * (0.05 + 0.25*s*s + 0.6*max(s-0.45,0.)*max(s-0.45,0.));
  float dA = uAmp * (0.5*s + 1.2*max(s-0.45,0.));
  float ph = uPhase - k*s;
  float st = s - 0.36;
  float flex = st < 0.0 ? 0.6 : 1.0 + 0.6 * st;
  float dTurn = uTurn * 2.0 * st * flex;
  return dA*sin(ph) - A*k*cos(ph) + dTurn;
}
// The spine is bent like a real backbone: each piece keeps its length (integrated tangent
// angles from a pivot 1/3 back), and every cross-section is rotated with the spine instead
// of being sheared sideways, so the body never stretches or thins in a bend.
vec3 swimBend(vec3 p, inout vec3 n){
  float s = 0.5 - p.x;
  const float S0 = 0.36;
  const int N = 12;
  float ds = (s - S0) / float(N);
  vec2 q = vec2(0.5 - S0, 0.0);          // spine point (x, z) at the pivot
  for (int i = 0; i < N; i++) {
    float sm = S0 + (float(i) + 0.5) * ds;
    float th = atan(spineSlope(sm));
    q += vec2(-cos(th), sin(th)) * ds;   // s increases toward -x
  }
  float th = atan(spineSlope(s));
  float c = cos(th), sn = sin(th);
  // rotate the section about y: local z (thickness) follows the spine normal
  vec3 r = vec3(q.x - p.z * sn, p.y, q.y + p.z * c);
  n = vec3(n.x * c - n.z * sn, n.y, n.x * sn + n.z * c);
  return r;
}
`;

export function addSwim(material, uniforms, extra = {}) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    const bend = extra.noBend ? '' : 'swimPos = swimBend(swimPos, objectNormal);';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SWIM_PARS)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 swimPos = position;\n' + bend)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = swimPos;');
    if (extra.frag) extra.frag(sh);
  };
  material.customProgramCacheKey = () => 'fish-' + (extra.key || 'x');
}

// ---------------------------------------------------------- assets ----------------

export function loadPhoto(url = new URL('../assets/auriga_photo.webp', import.meta.url).href) {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.premultiplyAlpha = false;
    return t;
  });
}

export function loadPattern(url = new URL('../assets/auriga_pattern.png', import.meta.url).href) {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = THREE.NoColorSpace;
    t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  });
}

// ---------------------------------------------------------- assembly --------------

export function createButterflyfish(renderer, opts = {}) {
  const texW = opts.texSize || 4096;
  const texH = Math.round(texW * (Y1 - Y0) / (S1 - S0) / 16) * 16;
  const layouts = finLayouts();
  // ocellus sits in the soft dorsal near its posterior margin
  const oi = Math.round(layouts.dorsal.base.length * 0.8);
  const ob = layouts.dorsal.base[oi], ot = layouts.dorsal.tip[oi];
  const ocellus = [0.95, 0.222];   // black oval under the rear corner of the soft dorsal (traced)
  const tex = opts.textures || bakeTextures(renderer, texW, texH, ocellus, opts.pattern, opts.photo || null);

  const uniforms = { uPhase: { value: 0 }, uAmp: { value: 0.0 }, uTurn: { value: 0 }, uFlap: { value: 0 }, uGlow: { value: 1.0 } };
  const group = new THREE.Group();
  group.name = 'Chaetodon auriga';

  // -- body
  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: tex.albedo, normalMap: tex.normal, normalScale: new THREE.Vector2(1, 1),
    roughnessMap: tex.orm, metalnessMap: tex.orm, aoMap: tex.orm, aoMapIntensity: 1.0,
    roughness: 1, metalness: 1,
    clearcoat: 0.3, clearcoatRoughness: 0.25,
    iridescence: 0.1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 520],
    sheen: 0.25, sheenColor: new THREE.Color(0.7, 0.8, 1.0), sheenRoughness: 0.5,
  });
  tex.orm.channel = 0;
  addSwim(bodyMat, uniforms, { key: 'body' });
  const body = new THREE.Mesh(buildBody(), bodyMat);
  body.name = 'body';
  group.add(body);

  // -- median fins share the painting; rays, membranes and margins come from the fin attribute
  const finFrag = (kind) => (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 fin; varying vec2 vFin;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFin = fin;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFin; uniform float uKind; uniform float uSpines;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float r = vFin.x, t = vFin.y;
          float dr = abs(fract(r + 0.5) - 0.5);            // 0 on a ray
          float fw = fwidth(r) * 1.2 + 0.02;
          float rid = floor(r + 0.5);
          float rh = fract(sin(rid * 91.7) * 43758.5);
          // soft rays fork in their distal half: a second, fainter line appears beside each ray
          float fork = smoothstep(0.45, 0.7, t) * (1.0 - smoothstep(0.0, 0.0, uSpines - r));
          float dr2 = abs(dr - 0.09 * fork);
          float ray = 1.0 - smoothstep(0.025, 0.025 + fw, min(dr, dr2 + 0.01 * (1.0 - fork)));
          ray *= 0.75 + 0.25 * rh;
          ray *= 0.85 + 0.15 * step(0.5, fract(t * 22.0 + rh));   // segmented joints
          bool spine = r < uSpines + 0.01;
          float kind = uKind;
          // median fins are nearly opaque in life; spines show only faintly through the membrane
          float memA = 0.96;
          if (kind < 1.5 && spine) memA = mix(0.95, 0.8, t);
          if (kind > 1.5 && kind < 2.5) memA = mix(0.98, 0.72, smoothstep(0.9, 0.97, t));      // caudal: clear margin
          if (kind > 2.5) memA = kind < 3.5 ? mix(0.06, 0.02, t) : mix(0.92, 0.75, t);             // pectoral / pelvic
          vec3 c = diffuseColor.rgb * (kind < 2.5 ? 0.9 : 1.0);
          #ifdef USE_MAP
          float opaque = clamp((diffuseColor.a - 0.5) * 2.0, 0.0, 1.0);
          #else
          float opaque = 0.0;
          #endif
          if (kind < 0.5) {
            // soft dorsal: clean lemon-yellow in photographs (the photo texture reads orange here)
            // soft dorsal: rich golden yellow like the rear body (photographs), paler toward the edge
            float soft = smoothstep(uSpines - 1.0, uSpines + 3.0, r);
            vec3 gold = mix(vec3(0.97, 0.47, 0.005), vec3(0.98, 0.56, 0.012), smoothstep(0.3, 0.9, t));   // linear-space golden
            c = mix(c, gold, soft * 0.7 * smoothstep(0.12, 0.3, dot(c, vec3(0.3, 0.55, 0.15))));   // keep the ocellus
            ray *= mix(1.0, 0.35, soft);
            // thin dark line along the whole dorsal edge
            c = mix(c, vec3(0.06, 0.05, 0.05), smoothstep(0.93, 0.965, t) * 0.9);
            // broad black band of constant width along the rear edge, from under the ocellus
            // down into the notch above the peduncle
            int ri = int(clamp(floor(r), 0.0, 38.0));
            vec2 SH = mix(uFinSH[ri], uFinSH[ri + 1], clamp(r - float(ri), 0.0, 1.0));
            float fromEdge = (1.0 - t) * max(SH.y, 1e-3);
            float rear = smoothstep(uRays - 11.0, uRays - 8.5, r);
            float bw = 0.042 + 0.03 * smoothstep(uRays - 9.0, uRays - 3.5, r) * (1.0 - smoothstep(uRays - 2.0, uRays - 0.2, r));   // broad black wedge behind the eyespot, narrowing into the notch
            c = mix(c, vec3(0.035, 0.03, 0.03), rear * (1.0 - smoothstep(bw - 0.004, bw + 0.004, fromEdge)));
          }
          if (kind > 0.5 && kind < 1.5) {
            // anal fin, as photographed from the side: the fin is pearl white inside, continuous
            // with the belly; yellow is a band of fixed width along the outer edge that begins as
            // a thin line under the belly, widens toward the rear and fills the rounded rear
            // lobe; a thin dark submarginal line and a pale blue-white rim follow the lobe only
            int ri = int(clamp(floor(r), 0.0, 24.0));
            vec2 A = uFinSH[ri], B = uFinSH[ri + 1];
            vec2 SH = mix(A, B, clamp(r - float(ri), 0.0, 1.0));
            float sR = SH.x, hR = max(SH.y, 1e-3);
            float fromEdge = (1.0 - t) * hR;                              // distance to the free edge
            float bandW = mix(0.007, 0.04, smoothstep(0.55, 0.85, sR)) + smoothstep(0.85, 0.97, sR) * 0.035;
            float dBand = fromEdge - bandW;
            // the white field ends in a rounded corner over the rear lobe: everything behind the
            // diagonal rear edge of the white (continued from the flank) is yellow
            #ifdef USE_MAP
            vec2 pp = vec2(${S0.toFixed(4)}, ${Y0.toFixed(4)}) + vMapUv * vec2(${(S1 - S0).toFixed(4)}, ${(Y1 - Y0).toFixed(4)});
            // curved rear edge of the white field, bulging backwards over the lobe
            float sb = 0.9 + 0.91 * (-0.09 - pp.y) + 2.2 * (pp.y + 0.16) * (pp.y + 0.16) + 0.004 * sin(pp.y * 70.0);
            float dBehind = sb - pp.x;
            float kS = 0.035;                                           // smooth union: rounded corner
            float hS = clamp(0.5 + 0.5 * (dBehind - dBand) / kS, 0.0, 1.0);
            dBand = mix(dBehind, dBand, hS) - kS * hS * (1.0 - hS);
            #endif
            dBand += 0.003 * sin(sR * 60.0 + t * 5.0);                  // slightly irregular, not ruled
            float yb = 1.0 - smoothstep(-0.008, 0.008, dBand);
            vec3 yl2 = mix(vec3(0.98, 0.6, 0.012), vec3(0.96, 0.46, 0.004), smoothstep(0.8, 0.98, sR));
            c = mix(vec3(0.84, 0.855, 0.86), yl2, yb);
            float lobe = smoothstep(0.8, 0.92, sR);
            c = mix(c, vec3(0.2, 0.12, 0.05), (1.0 - smoothstep(0.004, 0.0065, abs(fromEdge - 0.011))) * lobe * 0.8);   // dark submarginal line
            c = mix(c, vec3(0.8, 0.88, 0.95), (1.0 - smoothstep(0.003, 0.0055, fromEdge)) * 0.7 * (1.0 - smoothstep(0.9, 0.94, sR)));   // rim stops where the lobe turns up into the notch                     // pale rim
            c = mix(c, vec3(0.16, 0.09, 0.03), (1.0 - smoothstep(0.002, 0.0045, fromEdge)) * smoothstep(0.9, 0.95, sR) * 0.85);   // thin dark edge where the lobe crosses the caudal
            if (spine) c = mix(c, vec3(0.9, 0.9, 0.88), 0.7);
            c *= mix(0.86, 1.0, smoothstep(0.0, 0.35, t));   // root shaded like the curving belly it grows from
            ray *= 0.2;
          }
          if (kind > 1.5 && kind < 2.5) {
            // caudal: yellow, a thin dark submarginal bar, then a clear margin
            // (photographs: solid yellow fan, one thin dark submarginal line, narrow clear edge)
            // deep golden at the root, clearer lemon toward the edge (as photographed)
            vec3 gold = mix(vec3(0.97, 0.5, 0.006), vec3(0.97, 0.58, 0.014), smoothstep(0.1, 0.75, t));   // root = body rear colour (sRGB ~0.99,0.74,0.07)
            c = mix(c, gold, 0.92);
            float bar = smoothstep(0.875, 0.89, t) * (1.0 - smoothstep(0.905, 0.92, t));
            c = mix(c, vec3(0.22, 0.13, 0.03), bar * 0.75);
            ray *= 0.3;
            c = mix(c, vec3(0.5, 0.52, 0.55), smoothstep(0.925, 0.945, t));   // narrow grey translucent margin
          }
          if (kind > 2.5 && kind < 3.5) { c = mix(vec3(0.98, 0.9, 0.6), vec3(0.9), t); ray *= 0.6; }
          if (kind > 3.5) { c = mix(vec3(0.97, 0.86, 0.45), vec3(0.98, 0.95, 0.8), t); c = mix(c, vec3(0.25, 0.2, 0.15), (1.0 - smoothstep(0.0, 0.6, r)) * 0.7); }   // pelvics: yellow-white, dark leading spine
          // rays: faint ridges only (the membrane is thick)
          vec3 rayC = spine ? c * 1.06 + 0.02 : c * 1.05 + 0.015;
          c = mix(c, rayC, ray * 0.07 * (kind > 1.5 && kind < 2.5 ? smoothstep(0.3, 0.75, t) : 1.0));
          float a = mix(memA, kind > 2.5 && kind < 3.5 ? 0.16 : (kind > 1.5 && kind < 2.5 ? mix(0.98, 0.75, smoothstep(0.9, 0.97, t)) : 0.98), ray);
          a = mix(a, 1.0, opaque);
          a *= smoothstep(0.0, 0.03, 1.0 - t + 0.02);
          if (kind > 2.5 && kind < 3.5) a *= smoothstep(0.05, 0.45, abs(dot(normalize(vNormal), normalize(vViewPosition))));
          diffuseColor = vec4(c, a);
          vFinGlow = c * (1.0 - a) * 0.35;
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vFinGlow * uGlow;')
      .replace('varying vec2 vFin; uniform float uKind;', 'varying vec2 vFin; vec3 vFinGlow; uniform float uGlow; uniform float uRays; uniform float uKind; uniform vec2 uFinSH[40];');
  };
  const mkFinMat = (kind, spines, rays = 0) => {
    const m = new THREE.MeshPhysicalMaterial({
      map: kind < 3 ? tex.albedo : null, color: 0xffffff,
      roughness: 0.55, metalness: 0.0, transparent: true, side: THREE.DoubleSide,
      clearcoat: kind === 3 ? 0.0 : 0.22, clearcoatRoughness: 0.25, depthWrite: true,
      sheen: 0.0, sheenColor: new THREE.Color(1, 1, 1), sheenRoughness: 0.6,
    });
    // per-ray (s at the base, ray length) so the fin shader can paint bands of fixed width from the edge
    const L = kind === 1 ? layouts.anal : kind === 0 ? layouts.dorsal : null;
    const sh = Array.from({ length: 40 }, (_, i) => L && L.base[i] ? new THREE.Vector2(L.base[i][0], Math.hypot(L.tip[i][0] - L.base[i][0], L.tip[i][1] - L.base[i][1])) : new THREE.Vector2());
    const u = { uKind: { value: kind }, uSpines: { value: spines }, uGlow: uniforms.uGlow, uRays: { value: rays }, uFinSH: { value: sh } };
    addSwim(m, { ...uniforms, ...u }, { key: 'fin' + kind, frag: finFrag(kind), noBend: kind >= 3 });
    return m;
  };

  const dorsal = new THREE.Mesh(buildFin({ ...layouts.dorsal, thickAt: (s) => Math.min(1, ANATOMY.width(s) / 0.014), ridge: 0.08, sub: 4, segs: 18, pleat: 0.0005, scallop: 0.004, spines: 12, spineScallop: 0.13, bow: -0.02, thick: 0.012 }), mkFinMat(0, 12, 37));
  const anal = new THREE.Mesh(buildFin({ ...layouts.anal, thickAt: (s) => Math.min(1, ANATOMY.width(s) / 0.014), ridge: 0.02, sub: 4, segs: 16, pleat: 0.0002, scallop: 0.004, spines: 2, spineScallop: 0.05, bow: 0.02, thick: 0.012 }), mkFinMat(1, 2, 25));
  const caudal = new THREE.Mesh(buildFin({ ...layouts.caudal, ridge: 0.0, sub: 4, segs: 16, pleat: 0.00012, scallop: 0.002, thick: 0.011, thickAt: (s) => Math.max(0.5, Math.min(1, ANATOMY.width(Math.min(s, 1)) / 0.012)) }), mkFinMat(2, -1));
  dorsal.name = 'dorsal'; anal.name = 'anal'; caudal.name = 'caudal';
  // the caudal fan tucks under the rear edges of the soft dorsal and anal fins (no gap, no z-fight)
  Object.assign(caudal.material, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
  for (const m of [dorsal, anal, caudal]) { m.renderOrder = 2; group.add(m); }

  // -- stout dorsal & anal spines as real geometry
  const spineMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f0ea, roughness: 0.35, clearcoat: 0.4, transparent: false });
  addSwim(spineMat, uniforms, { key: 'spine' });
  const spineGeos = [];
  const addSpines = (L, n, r0) => {
    for (let i = 0; i < n; i++) {
      const b = L.base[i], t = L.tip[i];
      const a = new THREE.Vector3(sx(b[0]), b[1], 0), c = new THREE.Vector3(sx(t[0]), t[1], 0);
      const len = a.distanceTo(c);
      const g = new THREE.CylinderGeometry(r0 * 0.15, r0, len, 7, 6, false);
      g.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
      g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
      spineGeos.push(g);
    }
  };
  // spines are sheathed in thick membrane in this species; no separate geometry

  // -- filament: the "thread" trailing from the soft dorsal
  // the thread grows from the dorsal edge just ahead of the rear corner
  let fi = 0; layouts.dorsal.tip.forEach((p, i) => { if (Math.hypot(p[0] - 1.095, p[1] - 0.197) < Math.hypot(layouts.dorsal.tip[fi][0] - 1.095, layouts.dorsal.tip[fi][1] - 0.197)) fi = i; });
  const fb0 = layouts.dorsal.base[fi], fb1 = layouts.dorsal.tip[fi];
  const fm = [fb0[0] + (fb1[0] - fb0[0]) * 0.9, fb0[1] + (fb1[1] - fb0[1]) * 0.9];
  const fb = fb1;
  const filCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx(fm[0]), fm[1], 0), new THREE.Vector3(sx(fb[0]), fb[1], 0),
    new THREE.Vector3(sx(fb[0] + 0.1), fb[1] - 0.03, 0.003), new THREE.Vector3(sx(fb[0] + 0.2), fb[1] - 0.07, 0.006),
    new THREE.Vector3(sx(fb[0] + 0.3), fb[1] - 0.12, 0.002), new THREE.Vector3(sx(fb[0] + 0.4), fb[1] - 0.17, -0.004)]);
  const filGeo = new THREE.TubeGeometry(filCurve, 96, 0.0035, 6, false);
  // taper
  const fp = filGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const seg = Math.floor(i / 7) / 96;
    const ctr = filCurve.getPointAt(Math.min(seg, 1));
    const v = new THREE.Vector3().fromBufferAttribute(fp, i);
    v.sub(ctr).multiplyScalar(1 - 0.85 * Math.pow(seg, 0.6)).add(ctr);
    fp.setXYZ(i, v.x, v.y, v.z);
  }
  filGeo.computeVertexNormals();
  {  // yellow at the base fading to translucent white at the tip
    const fc = [];
    for (let i = 0; i < fp.count; i++) { const f = Math.min(1, Math.floor(i / 7) / 96); fc.push(1.0, 0.62 + 0.25 * f, 0.08 + 0.4 * f); }
    filGeo.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
  }
  const filMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.3, sheen: 0.4, sheenColor: new THREE.Color(1, 1, 0.9) });
  addSwim(filMat, uniforms, { key: 'fil' });
  const fil = new THREE.Mesh(filGeo, filMat);
  group.add(fil);


  // -- eyes: a real globe bulging within the band: black pupil, dark bronze iris grading to
  //    a silvery blue-grey outer ring, dark limbus, glossy cornea
  const { eye } = ANATOMY;
  const eyeMeshes = [];
  for (const side of [1, -1]) {
    const w = ANATOMY.width(eye.s) * 1.03 * lensZN(eye.y);
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(sx(eye.s), eye.y, side * (w - eye.r * 0.55)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(side * -0.08, side > 0 ? 0.18 : Math.PI - 0.18, 0)),   // looks slightly forward
      new THREE.Vector3(1, 1 / DEPTH, 1));
    const e = createFishEye({
      r: eye.r, matrix: M, pupilA: 0.5, irisA: 0.9,
      pupil: [0.005, 0.005, 0.008], irisIn: [0.16, 0.11, 0.05], irisOut: [0.07, 0.05, 0.035], limbus: [0.04, 0.04, 0.05], sclera: [0.05, 0.05, 0.055],
      patch: (m, k) => addSwim(m, uniforms, { key: 'auriga-' + k }),
    });
    group.add(e); eyeMeshes.push(e);
  }

  // -- mouth: small terminal mouth with thin lips at the tip of the snout
  {
    const tipY = (ANATOMY.top(0) + ANATOMY.bottom(0)) / 2 - 0.002;
    const lipMat = new THREE.MeshPhysicalMaterial({ color: 0xd8d2c6, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    addSwim(lipMat, uniforms, { key: 'lip' });

    const mg = new THREE.CircleGeometry(0.0055, 24);
    mg.rotateY(Math.PI / 2); mg.scale(1, 0.55, 1);
    mg.translate(sx(0) - 0.0025, tipY, 0);
    const mm = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.8 });
    addSwim(mm, uniforms, { key: 'mouth' });
    group.add(new THREE.Mesh(mg, mm));
  }

  // -- paired fins
  const pecMat = mkFinMat(3, -1);
  const pelMat = mkFinMat(4, 0);
  const pairs = [];
  for (const side of [1, -1]) {
    // pectoral: rounded, clear, long, set low behind the gill cover
    const pg = buildPairedFin({ len: 0.2, span: 0.07, n: 14, shape: (f) => 0.55 + 0.45 * Math.sin(Math.PI * Math.pow(f, 0.8)) });
    const pec = new THREE.Mesh(pg, pecMat);
    const pecPivot = new THREE.Group();
    pecPivot.position.set(sx(0.29), -0.045, side * 0.052);
    pec.position.set(-0.5, 0, 0); // local fin coords have base at x = 0.5
    pecPivot.add(pec);
    pecPivot.rotation.set(side * -0.15, side * 0.35, -0.25);
    pecPivot.userData = { side, kind: 'pec' };
    group.add(pecPivot);
    pairs.push(pecPivot);
    // pelvic: white, with a stout spine, points down/back
    const vg = buildPairedFin({ len: 0.17, span: 0.025, n: 7, shape: (f) => 1.0 - 0.6 * Math.pow(f, 0.8) });
    const pel = new THREE.Mesh(vg, pelMat);
    const pelPivot = new THREE.Group();
    pelPivot.position.set(sx(0.31), ANATOMY.bottom(0.31) + 0.012, side * 0.01);
    pel.position.set(-0.5, 0, 0);
    pelPivot.add(pel);
    pelPivot.rotation.set(side * 0.05, side * 0.04, 0.12);   // held close along the belly
    pelPivot.userData = { side, kind: 'pel' };
    group.add(pelPivot);
    pairs.push(pelPivot);
  }

  // The traced photo was taken slightly from above, which foreshortens the height; across the
  // other side views the fish is ~9% deeper. Eyes are counter-scaled so they stay round.
  group.scale.y = DEPTH;
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  for (const p of pairs) p.traverse((o) => { o.castShadow = false; });   // clear/thin paired fins cast no solid shadow

  let phase = 0, pecPhase = 0;
  function update(dt, t, { amp = 0.04, freq = 1.6, turn = 0 } = {}) {
    phase += dt * freq * Math.PI * 2;
    // pectorals: accumulated phase so the rate can change smoothly; ~0.8-1.3 beats/s
    pecPhase += dt * Math.PI * 2 * (0.75 + 0.3 * Math.min(freq, 2) + 0.6 * Math.abs(turn));
    uniforms.uPhase.value = phase;
    uniforms.uAmp.value = amp;
    uniforms.uTurn.value = turn;
    for (const p of pairs) {
      const { side, kind } = p.userData;
      if (kind === 'pec') {
        // the fin on the outside of a turn beats harder, the inner one is held in as a brake
        const a = THREE.MathUtils.clamp(1 - side * turn * 2.5, 0.3, 2.0);
        const f = Math.sin(pecPhase + (side > 0 ? 0 : 0.35)) * a;
        p.rotation.set(side * (-0.1 + 0.2 * f), side * (0.4 + 0.22 * f), -0.25 + 0.06 * f);
      } else {
        const f = Math.sin(t * 0.6 + side);
        p.rotation.set(side * (0.05 + 0.03 * f), side * 0.04, 0.12 + 0.04 * f);
      }
    }
  }

  return { group, update, textures: tex, uniforms };
}

function lensZN(y) {
  const { eye, top, bottom } = ANATOMY;
  const tp = top(eye.s), bt = bottom(eye.s);
  const yn = (y - (tp + bt) / 2) / ((tp - bt) / 2);
  return Math.pow(Math.max(0, 1 - Math.pow(Math.abs(yn), 2.1)), 0.62) * (1 + 0.12 * yn);
}

function makeEyeTexture() {
  // equirectangular 512x256: an angular radius maps to the same pixel radius in u and v,
  // so circles around the outward pole (u = 0.25 / 0.75, v = 0.5) are drawn as circles.
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const rnd = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let cx = x < W / 2 ? W * 0.25 : W * 0.75;
    const dx = x - cx, dy = y - H / 2, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    // radii in pixels (1 px = 0.7 deg): pupil ~26 deg, iris ~50 deg
    const pupil = 34, iris = 70;
    let col;
    if (r < pupil) {
      col = [3, 3, 4];
    } else if (r < iris) {
      const f = (r - pupil) / (iris - pupil);
      const fib = 0.75 + 0.25 * Math.sin(a * 60 + rnd(Math.floor(a * 30)) * 6) * rnd(Math.floor(a * 90) + 7);
      // thin bright golden collar next to the pupil, darker bronze outward
      // real eye: black pupil, very dark brown iris with a faint bronze ring; it disappears into the band
      const collar = 0.06 * Math.exp(-Math.pow((f - 0.12) / 0.06, 2));
      const base = [26, 18, 11].map((v) => v * (1 - 0.6 * f));
      col = base.map((v, i) => v * fib + collar * [150, 115, 55][i]);
    } else {
      col = [6, 5, 5];
    }
    const o = (y * W + x) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function mergeGeos(geos) {
  let n = 0, m = 0;
  for (const g of geos) { n += g.attributes.position.count; m += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(m);
  let o = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + o;
    o += g.attributes.position.count; oi += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
