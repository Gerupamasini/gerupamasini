// Procedural comet-goldfish body mesh.
//
// The body is lofted from measured morphometric profiles (morphology.js) as a
// single continuous sheet parameterised by (row, theta):
//   rows  : buccal cavity (back pocket -> lip rim) followed by the body
//           (snout s = 0 -> the end of the fleshy caudal tongue s = S_END)
//   theta : 0 ventral midline -> PI/2 left flank -> PI dorsal ridge -> 2PI
// Head details (lips, nares, orbit, preopercle, opercular flap and gill slit)
// are added as displacement fields. Two dynamic states are baked as morph
// deltas consumed by the vertex shader:
//   * mouth open (protruded "O" gape)   aMorphMouth / aMorphMouthN
//   * opercular abduction (breathing)   aMorphOperc
// Scale layout coordinates (aScaleUV) follow the arc length around each
// cross-section so scale rows converge toward the caudal peduncle as in real
// fish (circumpeduncular scale count < mid-body count).

import * as THREE from 'three';
import { profile, head, sectionPoint, opercMarginS, preopercS } from './morphology.js';
import { smoothstep, clamp, lerp } from '../core/math.js';
import { noise3, RNG } from '../core/random.js';

// the scaled flesh runs on over the caudal fin base as a thin tongue that
// closes in a rounded margin on the fin (see morphology.js)
export const S_END = 1.116;

const tmp2 = [0, 0];

// Head relief (SL units unless noted). Kept as named constants so the face
// can be retuned against measured landmarks without touching the code.
export const HEAD_RELIEF = {
  nareDepth: 0.0042, // pit of the paired nostrils
  nareRadius: 0.0068,
  nareFlap: 0.0021, // the flap separating anterior and posterior naris
  opercPlate: 0.0026, // height of the opercle plate above the flank
  opercStepIn: 0.0065, // the plate's rounded step: from this far in front of the free margin...
  opercStepOut: 0.0045, // ...to this far behind it
  opercTuck: 0.0007, // shallow hollow where the flank tucks under the margin
  preopercRidge: 0.00045, // ridge of the preopercle (under skin, faint)
  // orbit, in eyeball radii: the head skin meets the eyeball in a smooth
  // union (fillet) instead of a socket with a raised rim
  orbitGap: 0.025, // skin stays this far beneath the ball where they meet
  orbitFillet: 0.16, // blend width of the union
  orbitSink: 0.3, // hidden skin inside the visible eye sinks this far...
  orbitSinkR: [0.74, 0.5], // ...between these radii
};

// ---------------------------------------------------------------------------
// Undisplaced surface
// ---------------------------------------------------------------------------
const _ring = { x: 0, y: 0, z: 0 };

/**
 * Lip ring (the margin of the gape) for angle theta around the mouth.
 * state 0: closed — a thin slit whose corners droop and sit behind the lips.
 * state 1: open — rounded-rectangular gape: the lower jaw (dentary) swings
 *          down and slightly back about the quadrate joint, the upper lip
 *          (premaxilla) stays; corners are set back.
 * state 2: open + premaxillary protrusion — the upper jaw slides forward and
 *          a little down, pulling the lips into a short tube (suction).
 */
function mouthRing(theta, state, out) {
  const a = -Math.cos(theta); // -1 lower lip .. +1 upper lip
  const b = Math.sin(theta); // lateral
  const b2 = b * b;
  if (state === 0) {
    out.x = -0.0045 * b2;
    out.y = head.mouthY + head.mouthClosedRH * a - 0.0038 * b2;
    out.z = head.mouthClosedRW * b;
    return out;
  }
  const e = 2 / 2.6; // superellipse -> rounded rectangle
  const sa = Math.sign(a) * Math.pow(Math.abs(a), e);
  const sb = Math.sign(b) * Math.pow(Math.abs(b), e);
  const lower = Math.max(0, -sa);
  const upper = Math.max(0, sa);
  out.y = head.mouthY + (sa >= 0 ? head.mouthOpenTop * sa : head.mouthOpenBot * sa);
  out.z = head.mouthOpenRW * sb * (1 - 0.14 * lower); // the lower jaw is a little narrower
  out.x = -0.003 - 0.0035 * b2 - 0.0045 * lower; // the gape sits within the face, not on a tube
  if (state === 2) {
    out.x += head.mouthProtrusion * (0.6 + 0.4 * upper);
    out.y -= 0.0022 * upper;
  }
  return out;
}

function mouthCentreY(state) {
  return state === 0 ? head.mouthY : head.mouthY + 0.5 * (head.mouthOpenTop - head.mouthOpenBot);
}

/** Base (undisplaced) surface point. u < 0: buccal cavity (c = -u), u >= 0: body s. */
function basePoint(u, theta, state, out) {
  mouthRing(theta, state, _ring);
  const blend = state === 0 ? 0.016 : 0.024;
  if (u < 0) {
    const c = Math.min(1, -u);
    // the cavity widens behind the lips (buccal chamber) and closes toward
    // the pharynx; its floor sinks with the hyoid when the mouth is open
    const shape = Math.sqrt(Math.max(0, 1 - Math.pow(c, 4))) * (1 + 0.55 * Math.sin(Math.PI * Math.min(1, c * 1.25)));
    const cy = mouthCentreY(state);
    const yc = cy - 0.18 * c * head.mouthDepth;
    let dy = (_ring.y - cy) * shape * 0.92;
    if (state === 0) dy = Math.sign(dy || -1) * Math.max(Math.abs(dy), 0.0016 * shape * 0.92);
    out.set(_ring.x - c * head.mouthDepth, yc + dy, _ring.z * shape * 0.92);
    return out;
  }
  const s = Math.min(u, S_END);
  sectionPoint(s, theta, tmp2);
  let x = -s;
  let y = tmp2[0];
  let z = tmp2[1];
  if (s < blend) {
    // rounded (quarter-ellipse) transition so the lips/snout read blunt
    const t = Math.min(1, s / blend);
    let w = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    w = w * w * (3 - 2 * w) * 0.35 + w * 0.65;
    x = lerp(_ring.x, x, w);
    y = lerp(_ring.y, y, w);
    z = lerp(_ring.z, z, w);
  }
  out.set(x, y, z);
  return out;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Analytic-ish normal of the undisplaced body (s >= 0) via central differences. */
export function baseNormal(s, theta, out) {
  const e = 1e-4;
  basePoint(s + e, theta, 0, _a);
  basePoint(Math.max(0, s - e), theta, 0, _b);
  basePoint(s, theta + e, 0, _c);
  basePoint(s, theta - e, 0, _d);
  const ts = _a.sub(_b);
  const tt = _c.sub(_d);
  out.crossVectors(tt, ts).normalize();
  return out;
}

/** Solve theta on the given side so that the section passes through height y. */
export function thetaForY(s, y, side = 1) {
  let lo = 0.0001;
  let hi = Math.PI - 0.0001;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    sectionPoint(s, mid, tmp2);
    if (tmp2[0] < y) lo = mid;
    else hi = mid;
  }
  const t = 0.5 * (lo + hi);
  return side > 0 ? t : 2 * Math.PI - t;
}

/** Point on the undisplaced body surface at (s, y) on a side. */
export function surfacePointAtY(s, y, side, out) {
  const th = thetaForY(s, y, side);
  basePoint(s, th, 0, out);
  return th;
}

/** Rest frame of an eyeball (centre, optical axis, radius) in fish-local SL units. */
export function eyeRest(side = 1) {
  const P = new THREE.Vector3();
  const th = surfacePointAtY(head.eyeS, head.eyeY, side, P);
  const N = baseNormal(head.eyeS, th, new THREE.Vector3());
  // goldfish eyes look laterally, very slightly forward and upward
  const axis = N.clone().add(new THREE.Vector3(0.1, 0.07, 0)).normalize();
  const R = head.eyeR;
  const center = P.clone().addScaledVector(axis, (head.eyeProtrusion - 1) * R);
  return { center, axis, radius: R, surface: P };
}

// ---------------------------------------------------------------------------
// Detail displacement (applied along the base normal)
// ---------------------------------------------------------------------------
function gauss(x, w) {
  const t = x / w;
  return Math.exp(-t * t);
}

function detailDisplacement(u, x, y, z, asymSeed, masks) {
  masks.gill = 0;
  masks.operc = 0;
  masks.opercFlap = 0;
  masks.lip = 0;
  if (u < 0) {
    masks.lip = -1; // buccal cavity
    return 0;
  }
  const s = -x;
  const side = z >= 0 ? 1 : -1;
  const lateral = Math.abs(z) / Math.max(1e-4, profile.hw(clamp(s, 0, S_END)));
  let d = 0;

  // lips: thick rolled lips around the gape
  const lip = gauss(s - 0.009, 0.01);
  d += 0.0044 * lip;
  masks.lip = smoothstep(0.02, 0.004, s);

  // gape line: lip fold / posterior end of the maxilla running back and down
  // from the mouth corner toward the front-lower edge of the orbit
  const ry = head.mouthY - 0.003 - (s - 0.012) * 0.48;
  if (s > 0.008 && s < 0.075) d -= 0.0016 * gauss(y - ry, 0.0035) * smoothstep(0.008, 0.02, s) * smoothstep(0.075, 0.05, s) * smoothstep(0.3, 0.8, lateral);

  // lower jaw: posterior outline of the dentary running from below the mouth
  // corner down and back to the chin / throat (a soft crease)
  if (s > 0.018 && s < 0.11 && y < head.mouthY - 0.004) {
    const ym = head.mouthY - 0.011 - (s - 0.018) * 0.62;
    d -= 0.0011 * gauss(y - ym, 0.0032) * smoothstep(0.018, 0.035, s) * smoothstep(0.11, 0.085, s);
  }

  // paired nares with the characteristic separating flap
  const dn = Math.hypot(s - head.nareS, y - head.nareY);
  if (dn < 0.022 && lateral > 0.4) {
    d -= HEAD_RELIEF.nareDepth * gauss(dn, HEAD_RELIEF.nareRadius);
    d += HEAD_RELIEF.nareFlap * gauss(s - head.nareS, 0.002) * gauss(y - head.nareY, 0.0055); // flap
  }

  // opercular series
  if (y > head.opercBotY - 0.02 && y < head.opercTopY + 0.015 && lateral > 0.25) {
    const vfade = smoothstep(head.opercBotY - 0.02, head.opercBotY + 0.012, y) * smoothstep(head.opercTopY + 0.015, head.opercTopY - 0.012, y);
    const e = s - opercMarginS(y); // + behind the free margin
    // the opercle is a thin plate lying on the flank: it stands slightly
    // proud and ends in a soft, rounded step at its free margin. A closed
    // gill cover shows no groove — only the step and its contact shadow
    // (a carved slit reads as a drawn or stitched seam).
    const plate = smoothstep(-0.085, -0.02, e) * smoothstep(HEAD_RELIEF.opercStepOut, -HEAD_RELIEF.opercStepIn, e);
    d += HEAD_RELIEF.opercPlate * plate * vfade;
    // the flank tucks under the free margin: a very shallow, wide hollow
    const tuck = smoothstep(-0.003, 0.004, e) * smoothstep(0.022, 0.007, e);
    d -= HEAD_RELIEF.opercTuck * tuck * vfade;
    masks.gill = tuck * vfade;
    masks.operc = smoothstep(-0.11, -0.01, e) * smoothstep(0.004, -0.002, e) * vfade;
    // hinge at the front, maximal abduction at the free margin
    // (the release behind the margin spans several mesh rows so the opened
    // slit is a smooth slope — a one-row step would show the grid as teeth)
    masks.opercFlap = Math.pow(smoothstep(-0.1, -0.001, e), 1.6) * Math.pow(smoothstep(0.016, 0.0, e), 1.5) * vfade * vfade;
    // preopercle ridge (subtle: covered by skin in goldfish)
    const ep = s - preopercS(y);
    d += HEAD_RELIEF.preopercRidge * gauss(ep, 0.009) * vfade;
    d -= HEAD_RELIEF.preopercRidge * 0.45 * gauss(ep - 0.011, 0.007) * vfade;
  }

  // very subtle nuchal/occipital hump & cranial fontanelle groove on the top of the head
  if (lateral < 0.35 && y > 0) d -= 0.0009 * gauss(s - 0.17, 0.05) * gauss(lateral, 0.12);

  // natural bilateral micro-asymmetry (different noise per side) — ±0.1 % SL
  // (faded out on the thin caudal tongue, which is barely thicker than the fin)
  const asymW = smoothstep(1.06, 0.96, s);
  d += 0.0007 * asymW * noise3(x * 22 + asymSeed, y * 22, side * 5.3 + asymSeed * 0.37);
  d += 0.0012 * asymW * side * noise3(x * 3.1 + asymSeed * 1.7, y * 3.1, 1.3); // low-frequency side bias
  return d;
}

// ---------------------------------------------------------------------------
// Row distribution: denser around the head where the details are
// ---------------------------------------------------------------------------
function bodyRows(n) {
  const density = (s) =>
    1 +
    2.2 * Math.exp(-(((s - 0.12) / 0.1) ** 2)) +
    1.2 * Math.exp(-(((s - 0.29) / 0.035) ** 2)) +
    1.8 * Math.exp(-((s / 0.02) ** 2)) +
    1.2 * Math.exp(-(((s - 1.07) / 0.04) ** 2)); // rounded margin of the caudal tongue
  const N = 2000;
  const cdf = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) {
    const s = ((i - 0.5) / N) * S_END;
    cdf[i] = cdf[i - 1] + density(s);
  }
  const total = cdf[N];
  const rows = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    while (j < N && cdf[j + 1] < target) j++;
    const f = (target - cdf[j]) / Math.max(1e-9, cdf[j + 1] - cdf[j]);
    rows.push(((j + clamp(f, 0, 1)) / N) * S_END);
  }
  rows[0] = 0;
  rows[n - 1] = S_END;
  return rows;
}

/** Non-uniform theta distribution: extra columns around the eyes / flank. */
function thetaTable(n) {
  const th0 = 1.62; // approx. angle of the eye on the left side
  const density = (t) =>
    1 + 1.25 * Math.exp(-(((t - th0) / 0.42) ** 2)) + 1.25 * Math.exp(-(((t - (2 * Math.PI - th0)) / 0.42) ** 2));
  const N = 4000;
  const cdf = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) cdf[i] = cdf[i - 1] + density(((i - 0.5) / N) * Math.PI * 2);
  const out = new Float64Array(n + 1);
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * cdf[N];
    while (j < N && cdf[j + 1] < target) j++;
    const f = (target - cdf[j]) / Math.max(1e-9, cdf[j + 1] - cdf[j]);
    out[k] = ((j + clamp(f, 0, 1)) / N) * Math.PI * 2;
  }
  out[0] = 0;
  out[n] = Math.PI * 2;
  // enforce exact mirror symmetry (left/right columns pair up)
  for (let k = 0; k <= n / 2; k++) out[n - k] = Math.PI * 2 - out[k];
  return out;
}

/** Scale-size factor along the body (1 = mid-flank). */
function scaleSize(s) {
  return lerp(0.8, 1.0, smoothstep(0.28, 0.45, s)) * lerp(1.0, 0.62, smoothstep(0.62, 0.97, s));
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
export function buildBodyGeometry({ nBody = 200, nCavity = 12, nTheta = 128, asymSeed = 3.7 } = {}) {
  const uRows = [];
  for (let k = 0; k < nCavity; k++) uRows.push(-1 + k / nCavity); // -1 .. just before 0
  for (const s of bodyRows(nBody)) uRows.push(s);
  const NR = uRows.length;
  const NC = nTheta + 1; // duplicated seam column
  const count = NR * NC;
  const thetas = thetaTable(nTheta);

  const P = [new Float32Array(count * 3), new Float32Array(count * 3), new Float32Array(count * 3)]; // closed, open, open+protruded
  const N0 = new Float32Array(count * 3); // undisplaced normal (closed)
  const maskArr = new Float32Array(count * 4);
  const mask2Arr = new Float32Array(count * 4);
  // local elliptic cross-section (centre height, half width, half height) used
  // by the shader to trace chords through the body for light transport
  const sectArr = new Float32Array(count * 4);
  const flap = new Float32Array(count);
  const v = new THREE.Vector3();
  const masks = {};

  // 1) undisplaced grids for all mouth states
  for (let st = 0; st < 3; st++) {
    for (let r = 0; r < NR; r++) {
      for (let c = 0; c < NC; c++) {
        const th = thetas[c];
        basePoint(uRows[r], th, st, v);
        const i = (r * NC + c) * 3;
        P[st][i] = v.x;
        P[st][i + 1] = v.y;
        P[st][i + 2] = v.z;
      }
    }
  }

  const gridNormals = (pos, out) => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let r = 0; r < NR; r++) {
      const r0 = Math.max(0, r - 1);
      const r1 = Math.min(NR - 1, r + 1);
      for (let c = 0; c < NC; c++) {
        const cc = c === nTheta ? 0 : c;
        const c0 = (cc - 1 + nTheta) % nTheta;
        const c1 = (cc + 1) % nTheta;
        const i0 = (r0 * NC + cc) * 3;
        const i1 = (r1 * NC + cc) * 3;
        const j0 = (r * NC + c0) * 3;
        const j1 = (r * NC + c1) * 3;
        a.set(pos[i1] - pos[i0], pos[i1 + 1] - pos[i0 + 1], pos[i1 + 2] - pos[i0 + 2]); // along rows
        b.set(pos[j1] - pos[j0], pos[j1 + 1] - pos[j0 + 1], pos[j1 + 2] - pos[j0 + 2]); // around
        n.crossVectors(b, a);
        if (n.lengthSq() < 1e-20) {
          // degenerate (closed pocket end / collapsed slit): fall back to radial
          const k = (r * NC + cc) * 3;
          n.set(0.2, pos[k + 1] - head.mouthY, pos[k + 2]);
        }
        n.normalize();
        const k = (r * NC + c) * 3;
        out[k] = n.x;
        out[k + 1] = n.y;
        out[k + 2] = n.z;
      }
    }
  };

  gridNormals(P[0], N0);
  const N1base = new Float32Array(count * 3);
  gridNormals(P[1], N1base);
  const N2base = new Float32Array(count * 3);
  gridNormals(P[2], N2base);

  // 2) detail displacement along base normals (same field for both states,
  //    evaluated once on the undisplaced CLOSED surface)
  const dispArr = new Float32Array(count);
  for (let st = 0; st < 3; st++) {
    const pos = P[st];
    const nrm = st === 0 ? N0 : st === 1 ? N1base : N2base;
    for (let r = 0; r < NR; r++) {
      for (let c = 0; c < NC; c++) {
        const idx = r * NC + c;
        const i = idx * 3;
        if (st === 0) dispArr[idx] = detailDisplacement(uRows[r], P[0][i], P[0][i + 1], P[0][i + 2], asymSeed, masks);
        let d = dispArr[idx];
        // open gape: fleshy lips roll outward into a thick "O"
        if (st >= 1 && uRows[r] >= 0) d += 0.0052 * gauss(uRows[r] - 0.005, 0.009);
        if (st >= 1 && uRows[r] < 0) d += 0.0025 * gauss(uRows[r], 0.12);
        pos[i] += nrm[i] * d;
        pos[i + 1] += nrm[i + 1] * d;
        pos[i + 2] += nrm[i + 2] * d;
        if (st === 0) {
          flap[idx] = masks.opercFlap;
          const s = uRows[r];
          const th = thetas[c];
          const a = -Math.cos(th);
          const hw = profile.hw(clamp(s, 0, S_END));
          // thin-ness proxy for translucency: thin at dorsal/ventral edges & peduncle
          const thick = 2 * hw * Math.sqrt(Math.max(0, 1 - a * a * 0.92)) + 0.006;
          maskArr[idx * 4 + 0] = 0; // scale mask (filled later)
          maskArr[idx * 4 + 1] = masks.gill;
          maskArr[idx * 4 + 2] = masks.lip;
          // signed distance behind the free opercular margin (gill slit
          // coordinate for the shader); far away elsewhere
          const yv = P[0][i + 1];
          maskArr[idx * 4 + 3] = s >= 0 && yv > head.opercBotY - 0.03 && yv < head.opercTopY + 0.02 ? s - opercMarginS(clamp(yv, head.opercBotY, head.opercTopY)) : 1.0;
          {
            const sc = clamp(s, 0.004, S_END);
            const T = profile.top(sc);
            const B = profile.bot(sc);
            sectArr[idx * 4] = 0.5 * (T + B);
            sectArr[idx * 4 + 1] = Math.max(profile.hw(sc), 0.004);
            sectArr[idx * 4 + 2] = Math.max(0.5 * (T - B), 0.004);
            // throat (hyoid / branchiostegal) expansion along the normal: the
            // floor of the head between the lower jaw and the isthmus bulges
            // during buccal expansion and strongly in a yawn
            sectArr[idx * 4 + 3] = s < 0 ? 0 : 0.011 * gauss(s - 0.16, 0.075) * smoothstep(0.05, -0.65, a) * smoothstep(0.015, 0.05, s);
          }
          mask2Arr[idx * 4 + 0] = masks.operc;
          mask2Arr[idx * 4 + 1] = a; // dorso-ventral coordinate (-1 belly .. +1 back)
          mask2Arr[idx * 4 + 2] = c < nTheta / 2 || c === nTheta ? 1 : -1;
          mask2Arr[idx * 4 + 3] = 0; // orbit mask (filled later)
        }
      }
    }
  }

  // 3) orbit: the transparent skin over the eye is continuous with the head
  // skin, so the head surface meets the protruding eyeball tangentially — a
  // smooth union of the two surfaces (a soft fillet), no socket and no
  // raised rim around a bead. Inside the visible eye the skin stays just
  // beneath the ball (hidden by it) and then sinks away.
  const eyes = [eyeRest(1), eyeRest(-1)];
  const smax = (a, b, k) => {
    const hh = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + hh * hh * k * 0.25;
  };
  const q = new THREE.Vector3();
  const radial = new THREE.Vector3();
  for (let st = 0; st < 3; st++) {
    const pos = P[st];
    for (let idx = 0; idx < count; idx++) {
      const i = idx * 3;
      const zSide = pos[i + 2] >= 0 ? 0 : 1;
      const E = eyes[zSide];
      q.set(pos[i] - E.center.x, pos[i + 1] - E.center.y, pos[i + 2] - E.center.z);
      const h = q.dot(E.axis);
      radial.copy(q).addScaledVector(E.axis, -h);
      const rho = radial.length();
      const R = E.radius;
      if (rho > 1.6 * R || h < -R) continue;
      const hb = rho < R ? Math.sqrt(R * R - rho * rho) : 0;
      let hn = smax(h, hb - HEAD_RELIEF.orbitGap * R, HEAD_RELIEF.orbitFillet * R);
      // well inside the visible eye: sink the hidden skin away from the ball
      hn -= HEAD_RELIEF.orbitSink * R * smoothstep(HEAD_RELIEF.orbitSinkR[0] * R, HEAD_RELIEF.orbitSinkR[1] * R, rho);
      const push = h - hn; // negative => outward along the axis
      pos[i] -= E.axis.x * push;
      pos[i + 1] -= E.axis.y * push;
      pos[i + 2] -= E.axis.z * push;
      if (st === 0) mask2Arr[idx * 4 + 3] = Math.max(mask2Arr[idx * 4 + 3], smoothstep(1.45 * R, 0.9 * R, rho));
    }
  }

  // 4) final normals
  const NF0 = new Float32Array(count * 3);
  const NF1 = new Float32Array(count * 3);
  const NF2 = new Float32Array(count * 3);
  gridNormals(P[0], NF0);
  gridNormals(P[1], NF1);
  gridNormals(P[2], NF2);

  // orientation check: mid-flank left side must face +z
  {
    const r = uRows.findIndex((u) => u >= 0.5);
    const c = Math.round(nTheta / 4);
    const k = (r * NC + c) * 3;
    if (NF0[k + 2] < 0) {
      for (const arr of [NF0, NF1, NF2, N0]) for (let i = 0; i < arr.length; i++) arr[i] = -arr[i];
    }
  }

  // 5) opercular abduction delta: flap swings laterally outward (and slightly back)
  const opercDelta = new Float32Array(count * 3);
  for (let idx = 0; idx < count; idx++) {
    const f = flap[idx];
    if (f <= 0) continue;
    const i = idx * 3;
    const amp = 0.0125 * f;
    opercDelta[i] = NF0[i] * amp - 0.003 * f;
    opercDelta[i + 1] = NF0[i + 1] * amp;
    opercDelta[i + 2] = NF0[i + 2] * amp;
  }

  // 6) tangents (along body, toward the tail) and scale layout UVs
  const tangent = new Float32Array(count * 3);
  const scaleUV = new Float32Array(count * 2);
  const vArc = new Float32Array(NC); // arc length weighted by the inverse local scale height
  const DS0 = 0.0255; // exposed scale length at mid-flank (≈28 lateral-line scales)
  const DV0 = 0.0305; // scale row spacing at mid-flank
  // cumulative U coordinate: integral ds / (DS0 * k(s))
  const Ucum = new Float32Array(NR);
  for (let r = 1; r < NR; r++) {
    const s0 = Math.max(0, uRows[r - 1]);
    const s1 = Math.max(0, uRows[r]);
    const sm = 0.5 * (s0 + s1);
    Ucum[r] = Ucum[r - 1] + (s1 - s0) / (DS0 * scaleSize(sm));
  }
  const U_LL0 = Ucum[uRows.findIndex((u) => u >= 0.3)];
  for (let r = 0; r < NR; r++) {
    const s = uRows[r];
    // arc length from ventral midline around the LEFT side of this row
    // scales are smaller toward the dorsal ridge and the belly than on the
    // mid-flank: the row height shrinks with the dorso-ventral coordinate
    vArc[0] = 0;
    for (let c = 1; c <= nTheta / 2; c++) {
      const i0 = (r * NC + c - 1) * 3;
      const i1 = (r * NC + c) * 3;
      const ds = Math.hypot(P[0][i1] - P[0][i0], P[0][i1 + 1] - P[0][i0 + 1], P[0][i1 + 2] - P[0][i0 + 2]);
      const am = -Math.cos(0.5 * (thetas[c - 1] + thetas[c]));
      vArc[c] = vArc[c - 1] + ds / (1 - 0.3 * am * am);
    }
    // lateral line height: runs slightly below mid-flank, parallel to the axis
    const sc = clamp(s, 0, 1);
    const T = profile.top(sc);
    const B = profile.bot(sc);
    const yLL = lerp(B, T, lerp(0.52, 0.5, smoothstep(0.3, 1.0, sc)));
    let arcLL = vArc[nTheta / 2] * 0.5;
    for (let c = 1; c <= nTheta / 2; c++) {
      const y0 = P[0][(r * NC + c - 1) * 3 + 1];
      const y1 = P[0][(r * NC + c) * 3 + 1];
      if ((y0 - yLL) * (y1 - yLL) <= 0 && y1 !== y0) {
        arcLL = lerp(vArc[c - 1], vArc[c], (yLL - y0) / (y1 - y0));
        break;
      }
    }
    const k = scaleSize(Math.max(0, s));
    const r0 = Math.max(0, r - 1);
    const r1 = Math.min(NR - 1, r + 1);
    for (let c = 0; c < NC; c++) {
      const idx = r * NC + c;
      const cm = c <= nTheta / 2 ? c : nTheta - c; // mirror to the left side
      scaleUV[idx * 2] = Ucum[r] - U_LL0;
      scaleUV[idx * 2 + 1] = (vArc[cm] - arcLL) / (DV0 * k);
      const i0 = (r0 * NC + c) * 3;
      const i1 = (r1 * NC + c) * 3;
      v.set(P[0][i1] - P[0][i0], P[0][i1 + 1] - P[0][i0 + 1], P[0][i1 + 2] - P[0][i0 + 2]).normalize();
      tangent[idx * 3] = v.x;
      tangent[idx * 3 + 1] = v.y;
      tangent[idx * 3 + 2] = v.z;
      // scale mask: scales start behind the opercular margin / occiput
      const y = P[0][idx * 3 + 1];
      const sStart = opercMarginS(clamp(y, head.opercBotY, head.opercTopY)) + 0.006;
      // (small scales run a little way onto the caudal tongue and fade out)
      maskArr[idx * 4] = s < 0 ? 0 : smoothstep(sStart, sStart + 0.022, s) * smoothstep(1.085, 1.02, s);
    }
  }

  // 7) morph deltas
  const mouthDelta = new Float32Array(count * 3);
  const mouthNDelta = new Float32Array(count * 3);
  const protDelta = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    mouthDelta[i] = P[1][i] - P[0][i];
    mouthNDelta[i] = NF1[i] - NF0[i];
    protDelta[i] = P[2][i] - P[1][i];
  }

  // 8) indices
  const indices = [];
  for (let r = 0; r < NR - 1; r++) {
    for (let c = 0; c < nTheta; c++) {
      const a = r * NC + c;
      const b = r * NC + c + 1;
      const d = (r + 1) * NC + c;
      const e = (r + 1) * NC + c + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  // winding check against the normal
  {
    const r = uRows.findIndex((u) => u >= 0.5);
    const c = Math.round(nTheta / 4);
    const a = r * NC + c;
    const b = r * NC + c + 1;
    const d = (r + 1) * NC + c;
    const pa = new THREE.Vector3().fromArray(P[0], a * 3);
    const pb = new THREE.Vector3().fromArray(P[0], b * 3);
    const pd = new THREE.Vector3().fromArray(P[0], d * 3);
    const gn = new THREE.Vector3().crossVectors(pd.sub(pa), pb.sub(pa));
    const nn = new THREE.Vector3().fromArray(NF0, a * 3);
    if (gn.dot(nn) < 0) {
      for (let i = 0; i < indices.length; i += 3) {
        const t = indices[i + 1];
        indices[i + 1] = indices[i + 2];
        indices[i + 2] = t;
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P[0], 3));
  g.setAttribute('normal', new THREE.BufferAttribute(NF0, 3));
  g.setAttribute('aTangent', new THREE.BufferAttribute(tangent, 3));
  g.setAttribute('aScaleUV', new THREE.BufferAttribute(scaleUV, 2));
  g.setAttribute('aMask', new THREE.BufferAttribute(maskArr, 4));
  g.setAttribute('aMask2', new THREE.BufferAttribute(mask2Arr, 4));
  g.setAttribute('aSect', new THREE.BufferAttribute(sectArr, 4));
  g.setAttribute('aMorphMouth', new THREE.BufferAttribute(mouthDelta, 3));
  g.setAttribute('aMorphMouthN', new THREE.BufferAttribute(mouthNDelta, 3));
  g.setAttribute('aMorphOperc', new THREE.BufferAttribute(opercDelta, 3));
  g.setAttribute('aMorphProt', new THREE.BufferAttribute(protDelta, 3));
  g.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  g.userData = { rows: NR, cols: NC, eyes };
  return g;
}

export { RNG };
