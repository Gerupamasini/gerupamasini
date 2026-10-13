import { Matrix4, Vector3 } from 'three';

/**
 * アラムシロ (Reticunassa festiva, syn. Nassarius festivus): the numbers the model is built from. Shell measures are in
 * shell heights (SH: apex to the tip of the siphonal canal) unless marked; the model is built at MODEL_SH and scaled to
 * the individual. From the 50 reference photographs (live snails crawling on sand and in clear dishes, shells on rulers
 * from the apex, the aperture and the back, the protoconch end-on) and the literature (see
 * docs/models/aramushiro/README.md): mean shell 11.4–12.1 × 6.6 mm (H/W ≈ 1.8), a distinct shoulder, white axial ribs
 * cut into granules by brown spiral grooves, a thickened outer lip (varix) toothed inside, a small parietal tooth, a
 * short deep siphonal canal; the foot with two anterior horns and two metapodial tentacles, the long siphon, the long
 * eversible proboscis.
 *
 * Shell frame: metres, apex at the origin, the coiling axis along −Y (apex to base), the growth angle θ = 0 at the
 * aperture and negative toward the apex. A point of the shell surface is s(θ)·(U(ψ)·e_r(θ) − V(ψ)·Ŷ) with
 * s = W^(θ/2π) and e_r(θ) = (cos θ, 0, sin θ) (dextral: seen from the apex the whorls grow clockwise); (U, V) is the generating curve (the section
 * of the whorl) at the aperture, ψ ∈ [0, 1) its arc-length parameter from the suture, outward round the flank, the
 * base and the canal and back up the columella.
 *
 * Animal frame (the root): metres, +Z forward, +Y up, +X the animal's left, origin on the ground under the middle of
 * the foot.
 */

/** the model's reference shell height (m); individuals are scaled from it */
export const MODEL_SH = 0.012;

export const SHELL = {
  /** whorl expansion per revolution */
  W: 1.47,
  /** whorls from the tip of the protoconch to the aperture */
  whorls: 7.3,
  /** the smooth embryonic whorls at the apex */
  protoconch: 1.7,
  /** axial ribs per whorl */
  ribs: 14,
  /** spacing of the spiral cords along the whorl's section (SH at the aperture) */
  cord: 0.064,
  /** heights of the sculpture at the aperture (SH): granules, cords, ribs */
  bead: 0.017,
  cordH: 0.007,
  ribH: 0.008,
  /** shell thickness at the aperture (SH), the lip and its varix */
  thick: 0.026,
  lipThick: 0.05,
  varixH: 0.026,
  /** how far back the varix stands from the lip (whorls) */
  varixAt: 0.04,
};

/**
 * The whorl's section at the aperture (U radial, V down from the apex; SH), from the suture outward. The suture S is
 * where this whorl lies on the one before (that whorl's section, scaled by 1/W, passes through S at its lower flank);
 * the curve's inner side runs inside the previous whorl down to the columella, so the suture is a clean groove and the
 * parietal wall seen in the aperture is the previous whorl itself.
 */
export const SECTION: readonly (readonly [number, number])[] = [
  [0.19, 0.44],    // 0 suture
  [0.212, 0.448],  // shoulder: the sub-sutural row of granules
  [0.234, 0.468],
  [0.251, 0.5],    // the shoulder's angle
  [0.264, 0.548],
  [0.273, 0.61],   // periphery
  [0.271, 0.675],
  [0.255, 0.745],
  [0.224, 0.81],
  [0.183, 0.864],
  [0.14, 0.912],   // base
  [0.103, 0.952],
  [0.08, 0.982],   // the canal's outer side
  [0.063, 1.0],    // canal tip
  [0.044, 0.996],
  [0.034, 0.97],   // the columella
  [0.034, 0.9],
  [0.04, 0.82],
  [0.052, 0.73],
  [0.074, 0.645],
  [0.106, 0.565],
  [0.142, 0.5],    // parietal wall, inside the previous whorl
  [0.172, 0.462],
];

/** index of the periphery and of the canal tip in SECTION */
export const SEC_PERIPHERY = 5;
export const SEC_CANAL = 13;

// ------------------------------------------------------------------ the curve, resampled by arc length

const DENSE = 2048;
interface Curve { u: Float32Array; v: Float32Array; len: number; knot: number[] }

/** a closed centripetal Catmull–Rom spline through SECTION, densely sampled, with its arc length */
function buildCurve(): Curve {
  const P = SECTION, n = P.length;
  const pts: [number, number][] = [];
  const knot: number[] = [];
  const per = DENSE / n;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const d = (a: readonly number[], b: readonly number[]) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-6;
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    knot.push(pts.length);
    for (let k = 0; k < per; k++) {
      const t = t1 + ((t2 - t1) * k) / per;
      const out: number[] = [0, 0];
      for (let c = 0; c < 2; c++) {
        const a1 = ((t1 - t) * p0[c] + (t - t0) * p1[c]) / (t1 - t0);
        const a2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1);
        const a3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2);
        const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0);
        const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
        out[c] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
      }
      pts.push([out[0], out[1]]);
    }
  }
  const N = pts.length;
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const len = cum[N];
  // resample uniformly in arc length
  const u = new Float32Array(DENSE + 1), v = new Float32Array(DENSE + 1);
  let j = 0;
  for (let k = 0; k <= DENSE; k++) {
    const target = (k / DENSE) * len;
    while (j < N - 1 && cum[j + 1] < target) j++;
    const a = pts[j], b = pts[(j + 1) % N];
    const f = (target - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    u[k] = a[0] + (b[0] - a[0]) * f;
    v[k] = a[1] + (b[1] - a[1]) * f;
  }
  return { u, v, len, knot: knot.map((i) => cum[i] / len) };
}

const CURVE = buildCurve();

/** the section's perimeter (SH) */
export const SECTION_LEN = CURVE.len;
/** ψ (arc fraction) of each SECTION point */
export const SECTION_PSI: readonly number[] = CURVE.knot;
export const PSI_PERIPHERY = CURVE.knot[SEC_PERIPHERY];
export const PSI_CANAL = CURVE.knot[SEC_CANAL];

/** the section at ψ (SH): U radial, V axial below the apex */
export function sectionAt(psi: number, out: { u: number; v: number } = { u: 0, v: 0 }): { u: number; v: number } {
  const p = (((psi % 1) + 1) % 1) * DENSE;
  const i = Math.floor(p), f = p - i;
  out.u = CURVE.u[i] + (CURVE.u[i + 1] - CURVE.u[i]) * f;
  out.v = CURVE.v[i] + (CURVE.v[i + 1] - CURVE.v[i]) * f;
  return out;
}

/** ψ of the point W·S on the curve: below it each spire whorl is covered by the next (the next suture) */
export const PSI_COVER = (() => {
  const S = SECTION[0], tu = S[0] * SHELL.W, tv = S[1] * SHELL.W;
  let best = 0, bd = Infinity;
  const p = { u: 0, v: 0 };
  for (let k = 0; k < 2000; k++) {
    const psi = (k / 2000) * PSI_CANAL;
    sectionAt(psi, p);
    const d = Math.hypot(p.u - tu, p.v - tv);
    if (d < bd) { bd = d; best = psi; }
  }
  return best;
})();

/** growth scale at θ (rad, 0 at the aperture) */
export const growth = (theta: number): number => Math.pow(SHELL.W, theta / (2 * Math.PI));
export const THETA_APEX = -SHELL.whorls * 2 * Math.PI;

/**
 * The termination of the whorl at the aperture, per ψ: the canal stands a little proud of the lip, the posterior
 * notch at the top of the aperture is cut back (the lip's edge meets the body whorl a little behind the aperture).
 */
export function thetaEnd(psi: number): number {
  const a = psi * SECTION_LEN;
  const canal = Math.exp(-(((a - PSI_CANAL * SECTION_LEN) / 0.06) ** 2));
  const notch = Math.exp(-((a / 0.035) ** 2)) + Math.exp(-(((a - SECTION_LEN) / 0.05) ** 2));
  return 0.16 * canal - 0.12 * notch;
}

/** a point of the unsculptured shell surface in the shell frame (SH units) */
export function shellPoint(theta: number, psi: number, out = new Vector3()): Vector3 {
  const s = growth(theta);
  const p = sectionAt(psi, tmpUV);
  // the protoconch: the first whorls round off to the tip, a little inflated
  const w = (theta - THETA_APEX) / (2 * Math.PI);
  let k = 1;
  if (w < 1.2) {
    const t = Math.max(0, w / 1.2);
    k = Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)) * 1.12;
  } else if (w < SHELL.protoconch) k = 1.12 - 0.12 * ((w - 1.2) / (SHELL.protoconch - 1.2));
  // inflate about the section's centre
  const cu = 0.17, cv = 0.66;
  const u = cu + (p.u - cu) * k, v = cv + (p.v - cv) * k;
  out.set(s * u * Math.cos(theta), -s * v, s * u * Math.sin(theta));
  return out;
}
const tmpUV = { u: 0, v: 0 };

/** the outward radial unit at θ and the growth direction (the aperture faces +e_θ at θ = 0) */
export function radialAt(theta: number, out = new Vector3()): Vector3 { return out.set(Math.cos(theta), 0, Math.sin(theta)); }
export function tangentAt(theta: number, out = new Vector3()): Vector3 { return out.set(-Math.sin(theta), 0, Math.cos(theta)); }

// ------------------------------------------------------------------ the shell on the animal

/** the angle of the coiling axis above the horizontal when the shell is carried (rad) */
export const CARRY_TILT = 0.42;

/**
 * Rotation of the shell frame into the animal frame as the shell is carried: the aperture faces down onto the foot,
 * the outer lip on the animal's right, the base forward, the apex back and up.
 */
export function carryRotation(tilt = CARRY_TILT, out = new Matrix4()): Matrix4 {
  // shell basis at the aperture: r (to the outer lip), t (the opening), a (apex → base)
  const r = radialAt(0), t = tangentAt(0), a = new Vector3(0, -1, 0);
  // animal targets
  const A = new Vector3(0, -Math.sin(tilt), Math.cos(tilt));
  const R = new Vector3(-1, 0, 0);
  const T = new Vector3().crossVectors(A, R).normalize();
  if (T.y > 0) T.negate();
  const S = new Matrix4().makeBasis(r, t, a);
  const D = new Matrix4().makeBasis(R, T, A);
  // (a mirror would mean the shell had come out sinistral)
  return out.copy(D).multiply(S.transpose());
}

/** the foot (SH): sole length from the front edge to the tail's fork, the width across the anterior horns */
export const FOOT = {
  length: 1.08,
  width: 0.72,
  /** thickness at the middle, at the margin */
  thick: 0.12,
  edge: 0.032,
  /** the metapodial tentacles' length */
  tails: 0.11,
  /** the centre of the foot is at the origin; its front edge at +front */
  front: 0.6,
};

/** the head and its parts (SH) */
export const HEAD = {
  /** the tentacles: length, diameter at the base and the tip; eyes on the outer side of the base */
  tentacle: 0.42,
  tentacleBase: 0.04,
  tentacleTip: 0.012,
  eyeAt: 0.13,
  eyeR: 0.011,
  /** the siphon: length, diameter, its flared mouth */
  siphon: 0.62,
  siphonR: 0.026,
  siphonFlare: 1.18,
  /** the proboscis, fully everted */
  proboscis: 1.25,
  proboscisR: 0.022,
};

/** the operculum (SH): an ovate horny plate with a serrated edge */
export const OPERCULUM = { length: 0.3, width: 0.17 };
