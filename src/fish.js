// Threadfin butterflyfish (トゲチョウチョウオ, Chaetodon auriga) — procedural model.
//
// Fish space: snout tip at x = +0.5, caudal peduncle end at x = -0.5 (body length 1),
// y up, z = left/right. "s" is the normalised position from snout (0) to peduncle (1).
// All of the colour pattern is painted in a side-view (s, y) space by a GPU bake, so
// the body and the median fins share one continuous painting, like the real animal.
import * as THREE from 'three';

// ---------------------------------------------------------------- anatomy ---------

// Catmull-Rom through (s, v) control points, evaluated at s.
function spline(pts) {
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
export const ANATOMY = {
  top: spline([[0, 0.012], [0.03, 0.028], [0.06, 0.05], [0.09, 0.083], [0.12, 0.122], [0.16, 0.175], [0.23, 0.245], [0.32, 0.3],
    [0.42, 0.33], [0.5, 0.325], [0.6, 0.295], [0.7, 0.24], [0.8, 0.17], [0.88, 0.115], [0.95, 0.085], [1.0, 0.075]]),
  bottom: spline([[0, -0.01], [0.03, -0.021], [0.06, -0.038], [0.1, -0.072], [0.14, -0.112], [0.2, -0.168], [0.28, -0.228],
    [0.37, -0.27], [0.46, -0.28], [0.55, -0.265], [0.65, -0.225], [0.75, -0.165], [0.85, -0.11], [0.93, -0.08], [1.0, -0.07]]),
  width: spline([[0, 0.0065], [0.03, 0.011], [0.06, 0.016], [0.1, 0.025], [0.15, 0.037], [0.25, 0.052], [0.38, 0.056], [0.5, 0.052],
    [0.65, 0.045], [0.8, 0.03], [0.92, 0.021], [1.0, 0.018]]),
  eye: { s: 0.155, y: 0.066, r: 0.033 },
};

// painting space
const S0 = -0.03, S1 = 1.3, Y0 = -0.52, Y1 = 0.6;
const toUV = (s, y) => [(s - S0) / (S1 - S0), (y - Y0) / (Y1 - Y0)];
const sx = (s) => 0.5 - s; // s -> fish-space x

// ------------------------------------------------------------- body mesh ----------

function lensZ(yn, w) {
  // cross-section: thick above the midline, sharp dorsal/ventral keels feeding the fins
  const a = Math.max(0, 1 - Math.pow(Math.abs(yn), 2.1));
  return w * Math.pow(a, 0.62) * (1 + 0.12 * yn);
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
      let z = Math.sign(Math.sin(th)) * lensZ(yn, w);
      // head: cheek / operculum bulge, forehead dip in front of the eye
      const cheek = Math.exp(-(((s - 0.22) / 0.07) ** 2) - (((y + 0.03) / 0.09) ** 2));
      z *= 1 + 0.1 * cheek;
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
function buildFin({ base, tip, sub = 4, segs = 16, pleat = 0.0035, scallop = 0.06, bow = 0.0, zOff = 0, flat = false, spines = -1, spineScallop = 0.14 }) {
  const nR = base.length;
  const pos = [], uv = [], fin = [], idx = [];
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
      pos.push(sx(s), y, z);
      uv.push(...toUV(s, y));
      fin.push(r, t / 1.0);
    }
  }
  const rows = segs + 1;
  for (let c = 0; c < cols - 1; c++) for (let k = 0; k < segs; k++) {
    const a = c * rows + k, b2 = a + 1, cc = a + rows, d = cc + 1;
    idx.push(a, cc, b2, b2, cc, d);
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
function polyline(pts, n) {
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
  // Dorsal: XIII spines + ~23 soft rays. Base runs along the back; the outline grows from
  // the short first spine to the tall rounded soft portion, which trails back past the peduncle.
  const nD = 37;
  const dBase = [], dTip = polyline([[0.29, 0.335], [0.36, 0.4], [0.45, 0.445], [0.55, 0.47], [0.65, 0.47],
    [0.75, 0.44], [0.85, 0.39], [0.95, 0.325], [1.035, 0.262], [1.02, 0.19], [0.97, 0.11]], nD);
  for (let i = 0; i < nD; i++) { const s = 0.27 + (0.93 - 0.27) * (i / (nD - 1)); dBase.push([s, top(s) - 0.004]); }
  // Anal: III spines + ~20 soft rays
  const nA = 24;
  const aBase = [], aTip = polyline([[0.53, -0.305], [0.6, -0.36], [0.69, -0.39], [0.79, -0.375], [0.89, -0.33],
    [0.98, -0.265], [1.03, -0.2], [1.0, -0.13], [0.96, -0.09]], nA);
  for (let i = 0; i < nA; i++) { const s = 0.5 + (0.93 - 0.5) * (i / (nA - 1)); aBase.push([s, bottom(s) + 0.004]); }
  // Caudal: 17 principal rays, truncate to slightly rounded
  const nC = 19;
  const cBase = [], cTip = polyline([[1.2, 0.175], [1.225, 0.1], [1.232, 0.0], [1.225, -0.1], [1.2, -0.175]], nC);
  for (let i = 0; i < nC; i++) { const f = i / (nC - 1); cBase.push([0.985, 0.068 - f * 0.132]); }
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
  float sz = 0.0235;
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

// signed chevron coordinate: two families of fine lines at right angles meeting on a diagonal
float chevrons(vec2 p, out float side){
  vec2 p0 = vec2(0.50, 0.0);
  vec2 bd = normalize(vec2(-0.38, 1.0));   // boundary runs from lower-rear up to the front of the soft dorsal
  vec2 bn = vec2(bd.y, -bd.x);
  float along = dot(p - p0, bd), across = dot(p - p0, bn);
  side = across;
  float a = (along + abs(across)) * 0.70710678;
  float sp = 0.034;
  float d = abs(fract(a / sp) - 0.5) * sp;   // distance to nearest line
  return d;
}

// eye band centre line: nape -> eye -> lower edge of the gill cover
float eyeBand(vec2 p){
  vec2 a = vec2(0.105, 0.2), b = vec2(0.155, 0.066), c = vec2(0.19, -0.06), d = vec2(0.21, -0.2);
  return min(min(sdSeg(p,a,b), sdSeg(p,b,c)), sdSeg(p,c,d));
}

struct Paint { vec3 col; float alpha; float h; float rough; float metal; float ao; };

Paint paint(vec2 p){
  Paint o;
  float s = p.x, y = p.y;
  vec2 ol = outline(s);
  float top = ol.x, bot = ol.y;
  bool inBody = s >= 0. && s <= 1.0 && y <= top && y >= bot;
  float yn = clamp((y - (top+bot)*.5) / max((top-bot)*.5, 1e-3), -1., 1.);

  // base palette (sRGB)
  vec3 white  = vec3(0.88, 0.875, 0.845);
  vec3 cream  = vec3(0.93, 0.90, 0.80);
  vec3 yellow = vec3(1.00, 0.77, 0.02);
  vec3 orange = vec3(0.99, 0.56, 0.0);
  vec3 black  = vec3(0.035, 0.03, 0.03);
  vec3 lineW  = vec3(0.23, 0.21, 0.21);
  vec3 lineY  = vec3(0.62, 0.33, 0.06);

  // yellow field: posterior body, soft dorsal, anal, caudal base
  float yb = smoothstep(0.6, 0.8, s - 0.38*y + 0.03*(fbm(p*14.)-.5));
  float yDors = smoothstep(0.52, 0.66, s) * step(top, y);        // soft dorsal region
  float yAnal = smoothstep(0.52, 0.58, s) * step(y, bot);
  float yCaud = step(1.0, s);
  float Y = max(yb, max(yDors, max(yAnal, yCaud)));
  if (inBody) Y = yb;

  vec3 col = mix(white, cream, smoothstep(0.2, 1.0, yn)*0.25);
  col = mix(col, vec3(0.91,0.905,0.89), smoothstep(0.1, -0.9, yn)*0.6);   // pale belly
  col = mix(col, mix(yellow, orange, smoothstep(0.85, 1.05, s)*0.6), Y);

  float h = 0.0, rough = 0.42, metal = 0.18, ao = 1.0, alpha = 1.0;

  if (inBody) {
    // --- scales (none on the snout, fine on the head behind the eye band)
    float sid, rim;
    float scaleMask = smoothstep(0.23, 0.30, s) * (1. - smoothstep(0.82, 1.0, abs(yn)));
    float sh = scales(p, sid, rim);
    h = sh * scaleMask;
    col *= mix(1.0, 0.965 + 0.06*sid, scaleMask);
    col = mix(col, col*0.93, rim*scaleMask*0.6);
    ao = mix(1.0, 0.86 + 0.14*smoothstep(0.1, 0.9, sh), scaleMask);
    metal = mix(0.08, 0.35 + 0.2*sid, scaleMask) * (1.-Y*0.5);
    rough = mix(0.5, 0.28 + 0.15*sid, scaleMask);

    // --- chevron lines, fading out toward the head and the dorsal/ventral keels
    float side; float d = chevrons(p, side);
    float lw = 0.0023 + 0.0008*vnoise(p*60.);
    float ln = 1. - smoothstep(lw - uTexel.x, lw + uTexel.x, d);
    float lineMask = smoothstep(0.27, 0.34, s) * (1. - smoothstep(0.86, 0.99, abs(yn))) * (1. - smoothstep(0.93, 1.0, s));
    // lines are rows of pigment on the scales: modulate slightly by scale
    ln *= lineMask * (0.62 + 0.38*sid) * (0.75 + 0.25*smoothstep(0.25, 0.7, vnoise(p*95.)));
    col = mix(col, mix(lineW, lineY, Y), ln*0.95);

    // --- lateral line: high arch under the dorsal fin
    float ll = abs(y - (top - 0.055 - 0.02*s));
    col *= 1. - 0.08*(1.-smoothstep(0.0, 0.003, ll))*smoothstep(0.28,0.35,s)*(1.-smoothstep(0.8,0.9,s));

    // --- head: forehead/snout greyish-cream, mouth, gill cover edge
    float snout = 1. - smoothstep(0.02, 0.13, s);
    col = mix(col, vec3(0.82, 0.80, 0.74), snout*smoothstep(-0.2, 0.8, yn)*0.6);
    col = mix(col, vec3(0.9, 0.87, 0.74), smoothstep(0.3, 0.95, yn)*(1.-smoothstep(0.05, 0.25, s))*0.35);
    // lips: slightly pinkish-grey rim, mouth corner crease
    col = mix(col, vec3(0.78, 0.72, 0.68), 1. - smoothstep(0.004, 0.012, s));
    float mouth = 1. - smoothstep(0.001, 0.0026, sdSeg(p, vec2(0.004, -0.002), vec2(0.013, -0.004)));
    col = mix(col, vec3(0.35,0.3,0.28), mouth*0.8); h -= 0.5*mouth;
    // operculum: curved rim behind the eye band
    float opR = length((p - vec2(0.15, 0.0)) * vec2(1.0, 0.72));
    float op = 1. - smoothstep(0.0, 0.006, abs(opR - 0.125));
    op *= smoothstep(0.2, -0.1, y) * smoothstep(-0.25, -0.05, y + 0.0);
    h += -0.4 * op * (1.-scaleMask*0.5);
    col *= 1. - 0.12*op;
    // nostrils: two tiny pits in front of the eye
    for (int k = 0; k < 2; k++) {
      vec2 nc = vec2(0.112 + 0.012*float(k), 0.078 + 0.004*float(k));
      float nd = length((p - nc) * vec2(1.0, 1.3));
      float pit = 1. - smoothstep(0.0022, 0.0042, nd);
      h -= 0.9 * pit; col = mix(col, vec3(0.3, 0.28, 0.26), pit*0.7);
    }
    // preopercle: fine curved groove behind and below the eye
    float pr = length((p - vec2(0.13, 0.03)) * vec2(1.0, 0.8));
    float pre = (1. - smoothstep(0.0, 0.0035, abs(pr - 0.082))) * smoothstep(0.06, -0.04, y) * step(0.15, s);
    h -= 0.35 * pre;
    // pectoral-fin base shadow
    ao *= 1. - 0.25*exp(-pow(length((p - vec2(0.3, -0.05))*vec2(1.3, 1.0))/0.03, 2.));

    // --- eye band (black, narrow white borders), goes through the eye
    float eb = eyeBand(p);
    float bw = 0.031 + 0.004*smoothstep(0.1, -0.15, y);
    float band = 1. - smoothstep(bw - uTexel.x*1.5, bw + uTexel.x*1.5, eb);
    float border = (1. - smoothstep(bw, bw + 0.012, eb)) * (1.-band);
    col = mix(col, vec3(0.98), border*0.5);
    col = mix(col, black, band);
    metal = mix(metal, 0.0, band); rough = mix(rough, 0.35, band);

    // subtle mottling
    col *= 0.97 + 0.06*fbm(p*40.);
  } else {
    // --- fins: base colour, soft rays get their own shading in the fin material
    bool dorsal = y > top && s < 1.02;
    bool anal = y < bot && s < 1.02;
    alpha = 0.5;
    rough = 0.45; metal = 0.0;
    if (dorsal) {
      // spinous part white-translucent, soft part yellow with a subtle dark submarginal zone
      col = mix(vec3(0.92, 0.92, 0.9), yellow, smoothstep(0.5, 0.66, s));
      col = mix(col, orange, smoothstep(0.75, 1.0, s)*0.4);
      // ocellus: black eyespot with a thin pale ring
      float r = length((p - uOcellus) * vec2(1.0, 1.1));
      float ring = 1. - smoothstep(0.0, 0.004, abs(r - 0.031));
      float spot = 1. - smoothstep(0.026 - uTexel.x, 0.026 + uTexel.x, r);
      col = mix(col, vec3(1.0, 0.97, 0.85), ring*0.9);
      col = mix(col, black, spot);
      alpha = 0.5 + 0.5*max(spot, ring*0.6);
    } else if (anal) {
      col = mix(vec3(0.95, 0.93, 0.88), yellow, smoothstep(0.52, 0.6, s));
      col = mix(col, orange, smoothstep(0.7, 0.95, s)*0.35);
    } else {
      // caudal
      col = mix(yellow, vec3(0.95,0.9,0.7), smoothstep(1.06, 1.14, s));
    }
    col *= 0.96 + 0.08*fbm(p*50.);
  }

  o.col = col; o.alpha = alpha; o.h = h; o.rough = rough; o.metal = metal; o.ao = ao;
  return o;
}
`;

function bakeTextures(renderer, W, H, ocellus) {
  const { top, bottom } = ANATOMY;
  const outline = [];
  for (let i = 0; i < 96; i++) { const s = i / 95; outline.push(new THREE.Vector2(top(s), bottom(s))); }
  const texel = new THREE.Vector2((S1 - S0) / W, (Y1 - Y0) / H);
  const common = {
    uOutline: { value: outline }, uOcellus: { value: new THREE.Vector2(...ocellus) }, uTexel: { value: texel },
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
vec3 swimBend(vec3 p, inout vec3 n){
  float s = 0.5 - p.x;
  float k = 5.2;
  float A  = uAmp * (0.05 + 0.25*s*s + 0.6*max(s-0.45,0.)*max(s-0.45,0.));
  float dA = uAmp * (0.5*s + 1.2*max(s-0.45,0.));
  float ph = uPhase - k*s;
  // turning: the whole body arcs (curvature ~ uTurn)
  float turnZ = uTurn * (s-0.35)*(s-0.35);
  float dTurn = uTurn * 2.*(s-0.35);
  float z = A*sin(ph) - uAmp*0.03*sin(uPhase) + turnZ;
  float dzds = dA*sin(ph) - A*k*cos(ph) + dTurn;
  vec3 T = normalize(vec3(1.0, 0.0, -dzds));
  n = vec3(n.x*T.x - n.z*T.z, n.y, n.x*T.z + n.z*T.x);
  // keep length along the arc roughly constant
  return vec3(p.x - 0.5*z*dzds, p.y, p.z + z);
}
`;

function addSwim(material, uniforms, extra = {}) {
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

// ---------------------------------------------------------- assembly --------------

export function createButterflyfish(renderer, opts = {}) {
  const texW = opts.texSize || 4096;
  const texH = Math.round(texW * (Y1 - Y0) / (S1 - S0) / 16) * 16;
  const layouts = finLayouts();
  // ocellus sits in the soft dorsal near its posterior margin
  const oi = Math.round(layouts.dorsal.base.length * 0.8);
  const ob = layouts.dorsal.base[oi], ot = layouts.dorsal.tip[oi];
  const ocellus = [ob[0] + (ot[0] - ob[0]) * 0.66, ob[1] + (ot[1] - ob[1]) * 0.66];
  const tex = opts.textures || bakeTextures(renderer, texW, texH, ocellus);

  const uniforms = { uPhase: { value: 0 }, uAmp: { value: 0.0 }, uTurn: { value: 0 }, uFlap: { value: 0 }, uGlow: { value: 1.0 } };
  const group = new THREE.Group();
  group.name = 'Chaetodon auriga';

  // -- body
  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: tex.albedo, normalMap: tex.normal, normalScale: new THREE.Vector2(1, 1),
    roughnessMap: tex.orm, metalnessMap: tex.orm, aoMap: tex.orm, aoMapIntensity: 1.0,
    roughness: 1, metalness: 1,
    clearcoat: 0.4, clearcoatRoughness: 0.22,
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
          float ray = 1.0 - smoothstep(0.03, 0.03 + fw, dr);
          bool spine = r < uSpines + 0.01;
          float kind = uKind;
          // membrane translucency: thinner toward the edge
          float memA = mix(0.88, 0.55, smoothstep(0.1, 1.0, t));
          if (kind < 0.5) {             // dorsal
            if (spine) { memA = mix(0.72, 0.35, t); }
          } else if (kind < 1.5) {       // anal
            if (spine) { memA = mix(0.75, 0.4, t); }
          } else if (kind < 2.5) {       // caudal: yellow base, clear distal half, dark submarginal bar
            memA = mix(0.95, 0.5, smoothstep(0.35, 0.8, t));
          } else {                       // pectoral (clear) / pelvic (white)
            memA = kind < 3.5 ? mix(0.16, 0.05, t) : mix(0.92, 0.75, t);
          }
          vec3 c = diffuseColor.rgb;
          #ifdef USE_MAP
          float opaque = clamp((diffuseColor.a - 0.5) * 2.0, 0.0, 1.0);
          #else
          float opaque = 0.0;
          #endif
          // soft-ray fins: dark submarginal line and pale translucent margin
          if (kind < 1.5 && !spine) {
            float sub = smoothstep(0.80, 0.84, t) * (1.0 - smoothstep(0.88, 0.91, t));
            c = mix(c, vec3(0.08, 0.05, 0.03), sub * 0.85);
            float mar = smoothstep(0.9, 0.95, t);
            c = mix(c, vec3(0.95, 0.95, 0.9), mar * 0.8); memA = mix(memA, 0.35, mar);
          }
          if (kind > 1.5 && kind < 2.5) {
            float bar = smoothstep(0.66, 0.7, t) * (1.0 - smoothstep(0.76, 0.8, t));
            c = mix(c, vec3(0.06, 0.05, 0.05), bar * 0.9);
            memA = mix(memA, 0.92, bar);
            c = mix(c, vec3(0.92, 0.92, 0.9), smoothstep(0.8, 0.9, t) * 0.7);
          }
          if (kind > 2.5 && kind < 3.5) { c = mix(vec3(0.98, 0.88, 0.55), vec3(0.9), t); ray *= 0.6; }
          if (kind > 3.5) c = vec3(0.96, 0.96, 0.94);
          // rays are denser and lighter; spines are white and stiff
          vec3 rayC = spine ? vec3(0.97) : mix(c, c * 1.12 + 0.04, 0.8);
          c = mix(c, rayC, ray * (spine ? 0.9 : 0.4));
          float a = mix(memA, spine ? 0.98 : (kind > 2.5 && kind < 3.5 ? 0.3 : 0.93), ray);
          a = mix(a, 1.0, opaque);
          a *= smoothstep(0.0, 0.03, 1.0 - t + 0.02);        // feather the very edge
          diffuseColor = vec4(c, a);
          vFinGlow = c * (1.0 - a) * 0.35;
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vFinGlow * uGlow;')
      .replace('varying vec2 vFin; uniform float uKind;', 'varying vec2 vFin; vec3 vFinGlow; uniform float uGlow; uniform float uKind;');
  };
  const mkFinMat = (kind, spines) => {
    const m = new THREE.MeshPhysicalMaterial({
      map: kind < 3 ? tex.albedo : null, color: 0xffffff,
      roughness: 0.42, metalness: 0.0, transparent: true, side: THREE.DoubleSide,
      clearcoat: kind === 3 ? 0.15 : 0.3, clearcoatRoughness: 0.25, depthWrite: true,
      sheen: kind === 3 ? 0.0 : 0.15, sheenColor: new THREE.Color(1, 1, 1), sheenRoughness: 0.6,
    });
    const u = { uKind: { value: kind }, uSpines: { value: spines }, uGlow: uniforms.uGlow };
    addSwim(m, { ...uniforms, ...u }, { key: 'fin' + kind, frag: finFrag(kind), noBend: kind >= 3 });
    return m;
  };

  const dorsal = new THREE.Mesh(buildFin({ ...layouts.dorsal, sub: 4, segs: 18, pleat: 0.004, scallop: 0.012, spines: 12, spineScallop: 0.16, bow: -0.04 }), mkFinMat(0, 12));
  const anal = new THREE.Mesh(buildFin({ ...layouts.anal, sub: 4, segs: 16, pleat: 0.004, scallop: 0.012, spines: 2, spineScallop: 0.15, bow: 0.04 }), mkFinMat(1, 2));
  const caudal = new THREE.Mesh(buildFin({ ...layouts.caudal, sub: 4, segs: 16, pleat: 0.003, scallop: 0.01 }), mkFinMat(2, -1));
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
  addSpines(layouts.dorsal, 13, 0.0032);
  addSpines(layouts.anal, 3, 0.0036);

  // -- filament: the "thread" trailing from the soft dorsal
  let fi = 0; layouts.dorsal.tip.forEach((p, i) => { if (p[0] > layouts.dorsal.tip[fi][0]) fi = i; });
  const fb0 = layouts.dorsal.base[fi], fb1 = layouts.dorsal.tip[fi];
  const fm = [fb0[0] + (fb1[0] - fb0[0]) * 0.55, fb0[1] + (fb1[1] - fb0[1]) * 0.55];
  const fb = fb1;
  const filCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx(fm[0]), fm[1], 0), new THREE.Vector3(sx(fb[0]), fb[1], 0),
    new THREE.Vector3(sx(fb[0] + 0.06), fb[1] - 0.02, 0.003), new THREE.Vector3(sx(fb[0] + 0.13), fb[1] - 0.03, 0.006),
    new THREE.Vector3(sx(fb[0] + 0.21), fb[1] - 0.06, 0.002), new THREE.Vector3(sx(fb[0] + 0.29), fb[1] - 0.07, -0.004)]);
  const filGeo = new THREE.TubeGeometry(filCurve, 96, 0.0048, 6, false);
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
  const filMat = new THREE.MeshPhysicalMaterial({ color: 0xf6d27a, roughness: 0.45, clearcoat: 0.3 });
  addSwim(filMat, uniforms, { key: 'fil' });
  const fil = new THREE.Mesh(filGeo, filMat);
  group.add(fil);

  // merge spines
  const spineGeo = mergeGeos(spineGeos);
  const spines = new THREE.Mesh(spineGeo, spineMat);
  group.add(spines);

  // -- eyes: dark globe with a thin golden-brown iris ring and a glossy cornea
  const { eye } = ANATOMY;
  const eyeTex = makeEyeTexture();
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 });
  addSwim(eyeMat, uniforms, { key: 'eye' });
  const corneaMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.0, transmission: 0, transparent: true, opacity: 0.12, clearcoat: 1, clearcoatRoughness: 0, ior: 1.38 });
  addSwim(corneaMat, uniforms, { key: 'cornea' });
  const rimMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0a0a, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  addSwim(rimMat, uniforms, { key: 'rim' });
  for (const side of [1, -1]) {
    const w = ANATOMY.width(eye.s) * 1.18 * lensZN(eye.y);
    const g = new THREE.SphereGeometry(eye.r, 48, 32);
    g.rotateY(side > 0 ? 0 : Math.PI);   // texture pupil faces +z (outward)
    g.scale(1, 1, 0.3);
    g.translate(sx(eye.s), eye.y, side * (w - eye.r * 0.24));

    const m = new THREE.Mesh(g, eyeMat);
    group.add(m);
    const cg = new THREE.SphereGeometry(eye.r * 1.03, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.42);
    cg.rotateX(Math.PI / 2 * side);
    cg.scale(1, 1, 0.4);
    cg.translate(sx(eye.s), eye.y, side * (w - eye.r * 0.26));
    group.add(new THREE.Mesh(cg, corneaMat));
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
    const vg = buildPairedFin({ len: 0.14, span: 0.03, n: 7, shape: (f) => 1.0 - 0.55 * Math.pow(f, 0.8) });
    const pel = new THREE.Mesh(vg, pelMat);
    const pelPivot = new THREE.Group();
    pelPivot.position.set(sx(0.31), ANATOMY.bottom(0.31) + 0.012, side * 0.01);
    pel.position.set(-0.5, 0, 0);
    pelPivot.add(pel);
    pelPivot.rotation.set(side * 0.18, side * 0.12, 0.9);
    pelPivot.userData = { side, kind: 'pel' };
    group.add(pelPivot);
    pairs.push(pelPivot);
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  let phase = 0;
  function update(dt, t, { amp = 0.04, freq = 1.6, turn = 0 } = {}) {
    phase += dt * freq * Math.PI * 2;
    uniforms.uPhase.value = phase;
    uniforms.uAmp.value = amp;
    uniforms.uTurn.value = turn;
    for (const p of pairs) {
      const { side, kind } = p.userData;
      if (kind === 'pec') {
        const f = Math.sin(t * 5.2 * (0.6 + freq * 0.3));
        p.rotation.set(side * (-0.15 + 0.35 * f), side * (0.35 + 0.35 * f), -0.25 + 0.1 * f);
      } else {
        const f = Math.sin(t * 1.3 + side);
        p.rotation.set(side * (0.18 + 0.05 * f), side * 0.12, 0.9 + 0.06 * f);
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
      const collar = Math.exp(-Math.pow((f - 0.1) / 0.07, 2));
      const base = [72, 52, 26].map((v) => v * (1 - 0.65 * f));
      col = base.map((v, i) => v * fib + collar * [150, 115, 55][i]);
    } else {
      col = [10, 9, 8];
    }
    const o = (y * W + x) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mergeGeos(geos) {
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
