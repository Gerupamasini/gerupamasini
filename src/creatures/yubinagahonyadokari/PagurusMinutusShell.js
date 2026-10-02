// Gastropod shells for ユビナガホンヤドカリ (Pagurus minutus).
//
// A shell is NOT a prop here: it is a rigid body the crab carries. Geometry, mass, centre of mass,
// inertia, aperture size and internal (lumen) volume are all derived from ONE analytic model, so the
// numbers the behaviour uses (shell evaluation) and the numbers the physics uses (wobble, ground
// contact) are consistent with what is drawn.
//
// Model: a logarithmic helico-spiral tube (Raup 1966; Cortie 1989). For a growth angle θ ≤ 0
// (θ = 0 at the aperture, θ → −∞ at the apex) the generating curve (the cross-section of the whorl
// tube, drawn in the plane through the coiling axis) is scaled by s(θ) = W^(θ/2π) and rotated by θ
// about the axis. Coiling is dextral (aperture on the right with the apex up), as in every shell
// species used by P. minutus in the field.
//
// Shell-local frame (metres after scaling, origin = aperture centre "seat" where the crab grips):
//   +Y = coiling axis toward the apex, +Z = aperture normal (outward), +X = radial (away from axis).
// With the crab's frame (+Z forward, +Y up, +X left) this means the columella lies on the crab's
// right, matching the dextral twist of the paguroid abdomen.
import * as THREE from 'three';
import { TAU, clamp, lerp, hash1, noise1, SeededRandom, rotationError } from './PagurusMinutusUtil.js';

export const SHELL_DENSITY_KG_M3 = 2700; // aragonite/calcite with organic matrix

/**
 * carry: apex elevation and the crab's grip point (ShellAnchor, SL units in the body frame), chosen so the
 * body leaves the aperture without intersecting the shell (verified geometrically, see tests).
 * hideFit: shell size / shield length at which the crab withdraws completely (cephalothorax, folded legs
 * and antennae inside, claws closing the opening); measured with the analytic shell and the withdrawal
 * search in PagurusMinutusAnimator.js (≤ ≈ 3 % of the body mesh left outside the opening) [S].
 *
 * The five shell species built first. Field use of P. minutus (see docs/creatures/yubinagahonyadokari/01_research.md):
 *  - Batillaria (ホソウミニナ/ウミニナ): ~40 % (Waka River) to 77.5 % (Azuma et al. 2013)  [本種で直接確認]
 *  - Umbonium moniliferum (イボキサゴ): ~40 % (Waka River)                               [本種で直接確認]
 *  - Reticunassa festiva (アラムシロ), Reishia clavigera (イボニシ): listed by field guides [本種で直接確認]
 *  - Lunella coreensis (スガイ): turbinid shells appear in the photo set; species id of the shell
 *    is an inference from the photos                                                    [写真から推定]
 * Shape parameters are fitted to typical shell proportions (H/W ratio, spire angle, whorl count),
 * not to individual specimens. Generating-curve units: Rc0 = 1 (radius of the tube centre at the aperture).
 */
export const SHELL_SPECIES = {
  batillaria_attramentaria: {
    ja: 'ホソウミニナ', sci: 'Batillaria attramentaria', family: 'Batillariidae',
    evidence: 'direct', sizeMeasure: 'height', size_mm: [12, 34], typical_mm: 18,
    hideFit: 6.6,
    whorls: 12, W: 1.42, T: 8.8, a: 0.98, b: 1.9, tilt: 0.1, profileN: 2.7,
    canal: { phi: -1.95, len: 0.22, width: 0.38 }, shoulder: null,
    thickness: 0.16, lip: { amp: 0.04, span: 0.12 }, apexErosion: 0.25,
    sculpture: { cords: { n: 5, amp: 0.022, sharp: 2.5 }, ribs: { n: 18, amp: 0.014, sharp: 2, focus: 0.9 }, nodules: 0.012, varix: 0.0 },
    color: {
      base: '#4d443b', alt: '#2c2723', band: '#b8ab95', pattern: 'band', bandPhi: 0.95, bandWidth: 0.3,
      interior: '#5a4b46', interiorBand: '#c8bfb5', nacre: 0, gloss: 0.22, lipColor: '#2e2a28',
    },
    lipIncline: 0.45,
    carry: { apexElevationDeg: 6, anchorY: 0.15, anchorZ: -0.85 },
  },
  umbonium_moniliferum: {
    ja: 'イボキサゴ', sci: 'Umbonium moniliferum', family: 'Trochidae',
    evidence: 'direct', sizeMeasure: 'width', size_mm: [7, 20], typical_mm: 13, // shell diameter ≈ 2 cm max (field guides)
    hideFit: 4.2,
    whorls: 7, W: 1.8, T: 1.6, a: 0.75, b: 0.55, tilt: -0.35,
    canal: null, shoulder: { phi: 0.55, amp: 0.1, width: 0.5 },
    thickness: 0.24, lip: { amp: 0.0, span: 0.1 }, apexErosion: 0,
    sculpture: { cords: { n: 3, amp: 0.006, sharp: 1.5 }, ribs: { n: 0, amp: 0, sharp: 1, focus: 1 }, nodules: 0, varix: 0 },
    umbilicalCallus: { radius: 0.66, height: 0.18, color: '#e9e2d7' },
    color: {
      base: '#8d8590', alt: '#57505c', band: '#d8cfc8', pattern: 'zigzag', bandPhi: 0.0, bandWidth: 0.0,
      interior: '#d9d3cf', interiorBand: '#cfc8c4', nacre: 0.55, gloss: 0.9, lipColor: '#c5bdb8',
    },
    lipIncline: 0.2,
    carry: { apexElevationDeg: 52, anchorY: 0.15, anchorZ: -0.55 },
  },
  reticunassa_festiva: {
    ja: 'アラムシロ', sci: 'Reticunassa festiva', family: 'Nassariidae',
    evidence: 'direct', sizeMeasure: 'height', size_mm: [8, 21], typical_mm: 14, // shell height ≈ 2 cm max (field guides)
    hideFit: 4.55,
    whorls: 8, W: 1.6, T: 3.6, a: 0.75, b: 1.0, tilt: 0.15,
    canal: { phi: -2.0, len: 0.3, width: 0.32 }, shoulder: null,
    thickness: 0.23, lip: { amp: 0.1, span: 0.14 }, apexErosion: 0.05,
    sculpture: { cords: { n: 6, amp: 0.03, sharp: 2.2 }, ribs: { n: 14, amp: 0.04, sharp: 2.4, focus: 0.7 }, nodules: 0.035, varix: 0.0 },
    color: {
      base: '#6f6259', alt: '#3f3631', band: '#a89383', pattern: 'band', bandPhi: -0.15, bandWidth: 0.35,
      interior: '#cfc4b8', interiorBand: '#8b7a6d', nacre: 0, gloss: 0.5, lipColor: '#efe6d6', callus: '#f1e7cf',
    },
    lipIncline: 0.4,
    carry: { apexElevationDeg: 14, anchorY: 0.15, anchorZ: -0.7 },
  },
  reishia_clavigera: {
    ja: 'イボニシ', sci: 'Reishia clavigera', family: 'Muricidae',
    evidence: 'direct', sizeMeasure: 'height', size_mm: [12, 30], typical_mm: 20,
    hideFit: 4.0,
    whorls: 7, W: 1.95, T: 2.6, a: 0.72, b: 1.05, tilt: 0.18,
    canal: { phi: -1.9, len: 0.5, width: 0.3 }, shoulder: { phi: 0.75, amp: 0.12, width: 0.45 },
    thickness: 0.24, lip: { amp: 0.08, span: 0.12 }, apexErosion: 0.15,
    sculpture: {
      cords: { n: 9, amp: 0.012, sharp: 1.6 }, ribs: { n: 9, amp: 0.0, sharp: 3, focus: 0.6 },
      nodules: 0.13, noduleRows: [0.7, 0.05, -0.65], noduleN: 9,
    },
    color: {
      base: '#5d5a52', alt: '#2c2a27', band: '#8f887a', pattern: 'nodule', bandPhi: 0, bandWidth: 0,
      interior: '#6b4f62', interiorBand: '#d7cfc6', nacre: 0, gloss: 0.3, lipColor: '#3b2e35',
    },
    lipIncline: 0.38,
    carry: { apexElevationDeg: 16, anchorY: 0.6, anchorZ: -1.0 },
  },
  lunella_coreensis: {
    ja: 'スガイ', sci: 'Lunella coreensis', family: 'Turbinidae',
    evidence: 'photo', sizeMeasure: 'width', size_mm: [8, 25], typical_mm: 14,
    hideFit: 3.7,
    whorls: 6, W: 2.2, T: 2.3, a: 0.95, b: 1.05, tilt: -0.05,
    canal: null, shoulder: { phi: 0.85, amp: 0.05, width: 0.6 },
    thickness: 0.2, lip: { amp: 0.03, span: 0.1 }, apexErosion: 0.1,
    sculpture: { cords: { n: 8, amp: 0.026, sharp: 2.0 }, ribs: { n: 46, amp: 0.012, sharp: 1.5, focus: 1.0 }, nodules: 0.018, varix: 0 },
    umbilicalCallus: { radius: 0.55, height: 0.12, color: '#e6e1d2' },
    color: {
      base: '#5a5e44', alt: '#3c3f2d', band: '#a39a72', pattern: 'streak', bandPhi: 0, bandWidth: 0,
      interior: '#e9e6df', interiorBand: '#d9d4cb', nacre: 0.8, gloss: 0.4, lipColor: '#cfc8b4',
    },
    lipIncline: 0.25,
    carry: { apexElevationDeg: 42, anchorY: 0.3, anchorZ: -0.85 },
  },
};

export const SHELL_SPECIES_KEYS = Object.keys(SHELL_SPECIES);

// ---------------------------------------------------------------------------------------------
// Analytic model
// ---------------------------------------------------------------------------------------------

const bump = (x, w) => Math.exp(-(x * x) / (w * w));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Generating curve (whorl cross-section) before growth scaling: returns [u (radial), v (axial)]. */
function genCurve(sp, phi, out) {
  let r = 1;
  if (sp.canal) r += sp.canal.len * bump(angDiff(phi, sp.canal.phi), sp.canal.width);
  if (sp.shoulder) r += sp.shoulder.amp * bump(angDiff(phi, sp.shoulder.phi), sp.shoulder.width);
  // superellipse section: profileN > 2 flattens the whorl's sides (flat-sided Batillaria whorls) [P]
  const e = 2 / (sp.profileN ?? 2);
  const cp = Math.cos(phi), sn = Math.sin(phi);
  const u0 = sp.a * Math.sign(cp) * Math.pow(Math.abs(cp), e) * r, v0 = sp.b * Math.sign(sn) * Math.pow(Math.abs(sn), e) * r;
  const c = Math.cos(sp.tilt), s = Math.sin(sp.tilt);
  out[0] = u0 * c - v0 * s;
  out[1] = u0 * s + v0 * c;
  return out;
}

const _g0 = [0, 0], _g1 = [0, 0];
/** outward unit normal of the generating curve at phi */
function genNormal(sp, phi, out) {
  const e = 1e-3;
  genCurve(sp, phi - e, _g0);
  genCurve(sp, phi + e, _g1);
  const tx = _g1[0] - _g0[0], ty = _g1[1] - _g0[1];
  const l = Math.hypot(tx, ty) || 1;
  out[0] = ty / l;
  out[1] = -tx / l;
  return out;
}

/** surface relief (sculpture), in generating-curve units before growth scaling */
function sculpture(sp, theta, phi) {
  const sc = sp.sculpture;
  let h = 0;
  const per = 0.5 + 0.5 * Math.cos(phi); // 1 at periphery, 0 at columella
  if (sc.cords && sc.cords.amp > 0) {
    const c = Math.pow(0.5 + 0.5 * Math.cos(phi * sc.cords.n * 1.0 + 0.4), sc.cords.sharp);
    h += sc.cords.amp * c * (0.35 + 0.65 * per);
  }
  let rib = 0;
  if (sc.ribs && sc.ribs.n > 0) {
    rib = Math.pow(0.5 + 0.5 * Math.cos(theta * sc.ribs.n), sc.ribs.sharp);
    h += sc.ribs.amp * rib * lerp(1, per, sc.ribs.focus);
  }
  if (sc.noduleRows) {
    const ang = Math.pow(0.5 + 0.5 * Math.cos(theta * sc.noduleN), 3);
    for (const row of sc.noduleRows) h += sc.nodules * ang * bump(angDiff(phi, row), 0.28);
  } else if (sc.nodules > 0 && sc.cords && sc.ribs && sc.ribs.n > 0) {
    const c = Math.pow(0.5 + 0.5 * Math.cos(phi * sc.cords.n + 0.4), 3);
    h += sc.nodules * c * rib * (0.3 + 0.7 * per);
  }
  return h;
}

/** growth angle at which the lip ends for a given φ: the outer lip slants from the suture (apex side,
 * φ = +π/2) back toward the anterior canal (φ = −π/2), so the aperture faces partly anteriorly */
function lipEnd(sp, phi) {
  const f = 0.5 + 0.5 * Math.sin(phi);
  return -(sp.lipIncline ?? 0) * f * f;
}

function growth(sp, theta) {
  return Math.pow(sp.W, theta / TAU);
}

function thicknessAt(sp, theta) {
  const base = sp.thickness * 0.5 * (sp.a + sp.b);
  const lip = sp.lip ? sp.lip.amp * Math.exp(theta / Math.max(0.02, sp.lip.span)) : 0;
  return base + lip * Math.min(sp.a, sp.b);
}

/** 3D point of the analytic shell (pre-normalisation, apex at origin). layer: 0 outer, 1 inner */
function shellPoint(sp, theta, phi, layer, out) {
  const s = growth(sp, theta);
  genCurve(sp, phi, _g0);
  const n = genNormal(sp, phi, _g1);
  let off = 0;
  if (layer === 0) off = sculpture(sp, theta, phi);
  else off = -thicknessAt(sp, theta);
  const u = 1 + _g0[0] + n[0] * off;
  const v = -sp.T + _g0[1] + n[1] * off;
  const rho = s * u, h = s * v;
  return out.set(rho * Math.cos(theta), h, rho * Math.sin(theta));
}

// ---------------------------------------------------------------------------------------------
// Physics: mass, CoM, inertia, lumen volume (numerical integration with Pappus' volume element)
// ---------------------------------------------------------------------------------------------

/** ellipse-like containment test for the (unsculpted) generating region, in local whorl coords */
function insideGen(sp, du, dv, shrink) {
  // polar test against the generating curve at the same polar angle (curve is star-shaped)
  const c = Math.cos(-sp.tilt), s = Math.sin(-sp.tilt);
  const x = du * c - dv * s, y = du * s + dv * c;
  // parameter of the curve point on this ray (inverse of the superellipse mapping in genCurve)
  const ie = (sp.profileN ?? 2) / 2;
  const tx = x / sp.a, ty = y / sp.b;
  const phi = ie === 1 ? Math.atan2(ty, tx) : Math.atan2(Math.sign(ty) * Math.pow(Math.abs(ty), ie), Math.sign(tx) * Math.pow(Math.abs(tx), ie));
  genCurve(sp, phi, _g0);
  const R = Math.hypot(_g0[0], _g0[1]) - shrink;
  return Math.hypot(du, dv) <= R;
}

/**
 * Integrates the solid and the lumen. Returns normalised quantities in "Rc0 units" (apex at origin).
 * The lumen of each whorl excludes the space taken by the previous whorl (whorls overlap).
 */
function integrateShell(sp, thetaEnd = 0) {
  const theta0 = -TAU * sp.whorls * (1 - (sp.apexErosion || 0) * 0.35);
  const nTh = Math.round(sp.whorls * 72);
  const G = 22; // grid per axis in the cross-section
  let mMat = 0, mLum = 0, mLumLast = 0;
  const com = new THREE.Vector3(), lumCom = new THREE.Vector3();
  // second moments about origin for the inertia tensor
  let Ixx = 0, Iyy = 0, Izz = 0, Ixy = 0, Ixz = 0, Iyz = 0;
  const dTh = (thetaEnd - theta0) / nTh;
  const rmax = Math.max(sp.a, sp.b) * 1.5;
  const thick = sp.thickness * 0.5 * (sp.a + sp.b);
  for (let i = 0; i < nTh; i++) {
    const th = theta0 + (i + 0.5) * dTh;
    const s = growth(sp, th);
    const sPrev = growth(sp, th - TAU);
    const t = thicknessAt(sp, th) / Math.max(1e-6, 1); // generating units
    const meanRelief = (sp.sculpture.cords?.amp ?? 0) * 0.4 + (sp.sculpture.ribs?.amp ?? 0) * 0.3 + (sp.sculpture.nodules ?? 0) * 0.25;
    const step = (2 * rmax) / G;
    const ct = Math.cos(th), st = Math.sin(th);
    for (let gx = 0; gx < G; gx++) {
      for (let gy = 0; gy < G; gy++) {
        const du = -rmax + (gx + 0.5) * step, dv = -rmax + (gy + 0.5) * step;
        const inOuter = insideGen(sp, du, dv, -meanRelief);
        if (!inOuter) continue;
        const u = 1 + du, v = -sp.T + dv;
        const rho = s * u, h = s * v;
        if (rho <= 0) continue;
        const dV = rho * (s * step) * (s * step) * dTh; // Pappus: ρ dρ dh dθ
        const x = rho * ct, y = h, z = rho * st;
        const inInner = insideGen(sp, du, dv, t);
        if (!inInner) {
          mMat += dV;
          com.x += x * dV; com.y += y * dV; com.z += z * dV;
          Ixx += (y * y + z * z) * dV; Iyy += (x * x + z * z) * dV; Izz += (x * x + y * y) * dV;
          Ixy += x * y * dV; Ixz += x * z * dV; Iyz += y * z * dV;
        } else {
          // lumen: exclude the previous whorl (same 3D point in the previous whorl's coordinates)
          const uPrev = rho / sPrev - 1, vPrev = h / sPrev + sp.T;
          const inPrev = insideGen(sp, uPrev, vPrev, -thick * 0.5);
          if (!inPrev) {
            mLum += dV;
            lumCom.x += x * dV; lumCom.y += y * dV; lumCom.z += z * dV;
            if (th > thetaEnd - TAU) mLumLast += dV;
          }
        }
      }
    }
  }
  com.multiplyScalar(1 / Math.max(1e-12, mMat));
  lumCom.multiplyScalar(1 / Math.max(1e-12, mLum));
  // inertia tensor about CoM (unit density)
  const m = mMat, c = com;
  const I = new THREE.Matrix3().set(
    Ixx - m * (c.y * c.y + c.z * c.z), -(Ixy - m * c.x * c.y), -(Ixz - m * c.x * c.z),
    -(Ixy - m * c.x * c.y), Iyy - m * (c.x * c.x + c.z * c.z), -(Iyz - m * c.y * c.z),
    -(Ixz - m * c.x * c.z), -(Iyz - m * c.y * c.z), Izz - m * (c.x * c.x + c.y * c.y),
  );
  return { materialVolume: mMat, lumenVolume: mLum, lumenVolumeLastWhorl: mLumLast, com, lumCom, inertia: I };
}

/** bounding measures of the analytic shell (pre-normalisation) and the aperture seat point */
function measureShell(sp) {
  const theta0 = -TAU * sp.whorls;
  const p = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity, maxR = 0;
  for (let i = 0; i <= 240; i++) {
    const th = lerp(theta0, 0, i / 240);
    for (let j = 0; j < 48; j++) {
      shellPoint(sp, th, (j / 48) * TAU, 0, p);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      maxR = Math.max(maxR, Math.hypot(p.x, p.z));
    }
  }
  const height = maxY - minY, width = 2 * maxR;
  return { height, width, minY, maxY };
}

/**
 * Classify a point given in a shell's local frame (metres, origin = aperture seat) for a shell of
 * `size_mm`: 'lumen' (inside the whorl tube), 'wall' (inside the shell material) or 'outside'.
 * Used to verify that the hidden abdomen stays inside the shell.
 */
export function classifyShellPoint(key, size_mm, p) {
  const d = shellSpeciesData(key);
  const sp = d.sp;
  const k = size_mm / 1000;
  const x = (p.x / k + d.seat.x) / d.norm, y = (p.y / k + d.seat.y) / d.norm, z = (p.z / k + d.seat.z) / d.norm;
  const rho = Math.hypot(x, z);
  const phi0 = Math.atan2(z, x);
  const theta0 = -TAU * sp.whorls;
  for (let j = 0; j <= sp.whorls + 1; j++) {
    const th = phi0 - TAU * j;
    if (th > 1e-6 || th < theta0) continue;
    const s = growth(sp, th);
    const u = rho / s - 1, v = y / s + sp.T;
    if (insideGen(sp, u, v, 0)) {
      if (!insideGen(sp, u, v, thicknessAt(sp, th))) return 'wall';
      // the older whorl intrudes into this tube: that space belongs to it
      const sPrev = growth(sp, th - TAU);
      return insideGen(sp, rho / sPrev - 1, y / sPrev + sp.T, 0) ? 'wall' : 'lumen';
    }
  }
  return 'outside';
}

/**
 * Effective lumen along the whorl from the aperture inward: for each growth angle, the region inside
 * the inner tube wall but outside the older whorl. Returns centroid (pre-normalisation coords) and the
 * half-widths along the radial and axial directions (2σ of the region), used to lay and squeeze the
 * abdomen.
 */
function effectiveLumen(sp) {
  const N = 120, G = 26;
  const out = [];
  const rmax = Math.max(sp.a, sp.b) * 1.3;
  for (let i = 0; i < N; i++) {
    const th = -(i / (N - 1)) * TAU * 2.2;
    const s = growth(sp, th), sPrev = growth(sp, th - TAU);
    const t = thicknessAt(sp, th);
    let n = 0, mu = 0, mv = 0, uu = 0, vv = 0;
    for (let gx = 0; gx < G; gx++) for (let gy = 0; gy < G; gy++) {
      const du = -rmax + ((gx + 0.5) / G) * 2 * rmax, dv = -rmax + ((gy + 0.5) / G) * 2 * rmax;
      if (!insideGen(sp, du, dv, t)) continue;
      const rho = s * (1 + du), h = s * (-sp.T + dv);
      if (insideGen(sp, rho / sPrev - 1, h / sPrev + sp.T, 0)) continue;
      n++; mu += du; mv += dv; uu += du * du; vv += dv * dv;
    }
    if (n < 3) { out.push({ th, u: 0, v: 0, ra: 0.05 * s, rb: 0.05 * s, s }); continue; }
    mu /= n; mv /= n;
    const su = Math.sqrt(Math.max(1e-6, uu / n - mu * mu)), sv = Math.sqrt(Math.max(1e-6, vv / n - mv * mv));
    out.push({ th, u: mu, v: mv, ra: 2 * su * s, rb: 2 * sv * s, s });
  }
  return out;
}

// cache of normalised species data (geometry-independent)
const speciesCache = new Map();

/** normalised (size = 1) analytic data for a shell species */
export function shellSpeciesData(key) {
  let d = speciesCache.get(key);
  if (d) return d;
  const sp = SHELL_SPECIES[key];
  if (!sp) throw new Error(`unknown shell species ${key}`);
  const meas = measureShell(sp);
  const norm = 1 / (sp.sizeMeasure === 'width' ? meas.width : meas.height);
  const integ = integrateShell(sp);
  // seat = centroid of the inner lip ring; aperture normal by Newell's method on that ring
  const ring = [];
  for (let j = 0; j < 48; j++) {
    const phi = (j / 48) * TAU;
    ring.push(shellPoint(sp, lipEnd(sp, phi), phi, 1, new THREE.Vector3()));
  }
  const seat = new THREE.Vector3();
  for (const q of ring) seat.add(q);
  seat.multiplyScalar(1 / ring.length);
  const apN = new THREE.Vector3();
  for (let j = 0; j < ring.length; j++) {
    const a = ring[j], b = ring[(j + 1) % ring.length];
    apN.x += (a.y - b.y) * (a.z + b.z);
    apN.y += (a.z - b.z) * (a.x + b.x);
    apN.z += (a.x - b.x) * (a.y + b.y);
  }
  apN.normalize();
  // outward = along the growth direction at the aperture (+Z at θ = 0)
  if (apN.z < 0) apN.negate();
  // aperture size: extent of the inner generating curve at θ = 0
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let j = 0; j < 96; j++) {
    const phi = (j / 96) * TAU;
    genCurve(sp, phi, _g0);
    const n = genNormal(sp, phi, _g1);
    const t = thicknessAt(sp, 0);
    const u = _g0[0] - n[0] * t, v = _g0[1] - n[1] * t;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  const n3 = norm * norm * norm, n5 = n3 * norm * norm;
  d = {
    key, sp, norm, meas,
    seat: seat.multiplyScalar(norm),
    apertureNormal: apN.clone(),
    apertureWidth: (uMax - uMin) * norm,
    apertureHeight: (vMax - vMin) * norm,
    materialVolume: integ.materialVolume * n3,
    lumenVolume: integ.lumenVolume * n3,
    lumenVolumeLastWhorl: integ.lumenVolumeLastWhorl * n3,
    com: integ.com.clone().multiplyScalar(norm),
    lumCom: integ.lumCom.clone().multiplyScalar(norm),
    inertia: integ.inertia.clone().multiplyScalar(n5),
  };
  // express CoM relative to the seat (shell-local frame origin)
  d.comLocal = d.com.clone().sub(d.seat);
  d.lumenPath = effectiveLumen(sp);
  speciesCache.set(key, d);
  return d;
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

export const SHELL_LOD = [
  { perWhorl: 72, ring: 44, inner: 1.4 }, // LOD0 macro
  { perWhorl: 30, ring: 22, inner: 1.1 }, // LOD1 gameplay
  { perWhorl: 12, ring: 10, inner: 0.5 }, // LOD2 distant
];

const geoCache = new Map();

/**
 * Builds (and caches) the shell mesh geometry in normalised units (size measure = 1, origin = seat).
 * `variant` selects a damage pattern (0..3); `damage` 0..1 chips the outer lip.
 * Attributes: position, normal, aShell (θ in whorls, φ/2π, part, depth), aRelief (sculpture 0..1).
 * part: 0 outer surface, 1 inner surface (lumen wall), 2 lip, 3 apex cap, 4 umbilical callus.
 */
export function buildShellGeometry(key, lod = 1, damage = 0, variant = 0) {
  const dq = Math.round(clamp(damage, 0, 1) * 4) / 4;
  const ck = `${key}|${lod}|${dq}|${variant & 3}`;
  const cached = geoCache.get(ck);
  if (cached) return cached;
  const data = shellSpeciesData(key);
  const sp = data.sp;
  const L = SHELL_LOD[clamp(lod, 0, 2)];
  const norm = data.norm, seat = data.seat;
  const erosion = sp.apexErosion || 0;
  const theta0 = -TAU * sp.whorls * (1 - erosion * 0.35);
  const ring = L.ring;
  // per-column end angle (lip chips)
  const ends = new Float32Array(ring + 1);
  for (let j = 0; j <= ring; j++) {
    const phi = (j / ring) * TAU;
    const n = noise1(phi * 2.2 + variant * 13.1, 31 + variant) * 0.6 + noise1(phi * 6.1 + variant * 7.3, 77) * 0.4;
    ends[j] = lipEnd(sp, phi) - dq * 0.55 * Math.max(0, n + 0.15);
  }
  ends[ring] = ends[0];
  // row parameter λ with density ∝ growth^0.55 (fewer rows on the tiny apical whorls)
  const lambdas = [];
  {
    const total = -theta0;
    let th = 0;
    lambdas.push(1);
    const base = TAU / L.perWhorl;
    while (th > theta0 + 1e-6) {
      const s = growth(sp, th);
      th -= base / clamp(Math.pow(s, 0.55), 0.2, 1);
      lambdas.push(Math.max(0, (th - theta0) / total));
    }
    lambdas.reverse();
    lambdas[0] = 0;
  }
  const rows = lambdas.length;
  const pos = [], nor = [], aSh = [], aRel = [], idx = [];
  const p = new THREE.Vector3();
  const addV = (x, y, z, th, phi, part, depth, relief) => {
    pos.push((x * norm) - seat.x, (y * norm) - seat.y, (z * norm) - seat.z);
    nor.push(0, 0, 0);
    aSh.push(th / TAU, phi / TAU, part, depth);
    aRel.push(relief);
    return pos.length / 3 - 1;
  };
  const reliefMax = Math.max(1e-6, (sp.sculpture.cords?.amp ?? 0) + (sp.sculpture.ribs?.amp ?? 0) + (sp.sculpture.nodules ?? 0));
  // outer surface
  const outerStart = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j <= ring; j++) {
      const phi = (j / ring) * TAU;
      const th = lerp(theta0, ends[j], lambdas[i]);
      shellPoint(sp, th, phi, 0, p);
      addV(p.x, p.y, p.z, th, phi, 0, 0, sculpture(sp, th, phi) / reliefMax);
    }
  }
  const W = ring + 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < ring; j++) {
      const a = outerStart + i * W + j, b = a + 1, c = a + W, d = c + 1;
      // (x, z) = ρ(cos θ, sin θ) with θ growing toward the aperture is left-handed in φ: this order faces out
      idx.push(a, b, c, b, d, c);
    }
  }
  // inner surface (lumen wall), last `inner` whorls only – deeper is never visible
  const innerStart = pos.length / 3;
  const innerRows = Math.max(4, Math.round(L.inner * L.perWhorl));
  const thInnerStart = Math.max(theta0, -TAU * L.inner);
  for (let i = 0; i < innerRows; i++) {
    const lam = i / (innerRows - 1);
    for (let j = 0; j <= ring; j++) {
      const phi = (j / ring) * TAU;
      const th = lerp(thInnerStart, ends[j], lam);
      shellPoint(sp, th, phi, 1, p);
      addV(p.x, p.y, p.z, th, phi, 1, clamp(-th / TAU, 0, 2), 0);
    }
  }
  for (let i = 0; i < innerRows - 1; i++) {
    for (let j = 0; j < ring; j++) {
      const a = innerStart + i * W + j, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, c, b, b, c, d); // reversed winding: faces into the lumen
    }
  }
  // lip: strip joining outer last row and inner last row (rounded with a mid row)
  const lipStart = pos.length / 3;
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j <= ring; j++) {
      const phi = (j / ring) * TAU;
      const th = ends[j];
      const o = shellPoint(sp, th, phi, 0, new THREE.Vector3());
      const inn = shellPoint(sp, th, phi, 1, new THREE.Vector3());
      const q = o.clone().lerp(inn, k / 2);
      if (k === 1) {
        // bulge the lip slightly outward along the growth direction
        const t = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
        q.addScaledVector(t, thicknessAt(sp, th) * growth(sp, th) * 0.45);
      }
      addV(q.x, q.y, q.z, th, phi, 2, 0, 0);
    }
  }
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < ring; j++) {
      const a = lipStart + k * W + j, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // apex cap (fan) closing the first outer ring
  {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < ring; j++) { const o = (outerStart + j) * 3; cx += pos[o]; cy += pos[o + 1]; cz += pos[o + 2]; }
    cx /= ring; cy /= ring; cz /= ring;
    // apex tip slightly above the ring (rounded protoconch or eroded septum)
    const sA = growth(sp, theta0) * norm;
    const tip = pos.length / 3;
    pos.push(cx, cy + sA * (erosion > 0.05 ? 0.15 : 0.6) * sp.b, cz);
    nor.push(0, 0, 0);
    aSh.push(theta0 / TAU, 0, 3, 0);
    aRel.push(0);
    for (let j = 0; j < ring; j++) idx.push(tip, outerStart + j + 1, outerStart + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aShell', new THREE.Float32BufferAttribute(aSh, 4));
  g.setAttribute('aRelief', new THREE.Float32BufferAttribute(aRel, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld normals across the φ seam of outer/inner surfaces
  weldSeamNormals(g, outerStart, rows, W);
  weldSeamNormals(g, innerStart, innerRows, W);
  // umbilical callus lens (Umbonium, Lunella)
  let geo = g;
  if (sp.umbilicalCallus) {
    const uc = sp.umbilicalCallus;
    // the umbilicus: the gap at the axis under the inner (columellar) side of the body whorl. Find the
    // inner-base points of the last whorl closest to the axis; the callus lens fills the gap among them.
    const q = new THREE.Vector3();
    let ySum = 0, rSum = 0, cnt = 0;
    for (let i = 0; i < 24; i++) {
      const th = -TAU * (i / 24);
      let best = Infinity, by = 0;
      for (let k = 0; k <= 8; k++) {
        shellPoint(sp, th, Math.PI + (k / 8) * Math.PI * 0.5, 0, q);
        const rho = Math.hypot(q.x, q.z);
        if (rho < best) { best = rho; by = q.y; }
      }
      ySum += by; rSum += best; cnt++;
    }
    const yC = ySum / cnt, rC = rSum / cnt;
    const R = Math.max(uc.radius, rC * 1.2);
    const lens = new THREE.SphereGeometry(R * norm, lod === 0 ? 28 : lod === 1 ? 16 : 8, lod === 0 ? 10 : 6, 0, TAU, Math.PI * 0.5, Math.PI * 0.5);
    lens.scale(1, uc.height / R, 1);
    lens.translate(-seat.x, yC * norm - seat.y, -seat.z);
    const n = lens.attributes.position.count;
    const aS = new Float32Array(n * 4), aR = new Float32Array(n);
    for (let k = 0; k < n; k++) { aS[k * 4 + 2] = 4; }
    lens.setAttribute('aShell', new THREE.BufferAttribute(aS, 4));
    lens.setAttribute('aRelief', new THREE.BufferAttribute(aR, 1));
    lens.deleteAttribute('uv');
    geo = mergeIndexed([g, lens]);
  }
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.userData.shellKey = key;
  geoCache.set(ck, geo);
  return geo;
}

function weldSeamNormals(g, start, rows, W) {
  const n = g.attributes.normal;
  for (let i = 0; i < rows; i++) {
    const a = start + i * W, b = a + W - 1;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
}

/** merge indexed geometries that share the same attribute set */
export function mergeIndexed(list) {
  const names = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  let vtx = 0;
  const idx = [];
  const arrays = {};
  for (const name of names) arrays[name] = [];
  for (const g of list) {
    const count = g.attributes.position.count;
    for (const name of names) {
      const a = g.attributes[name];
      for (let k = 0; k < a.array.length; k++) arrays[name].push(a.array[k]);
    }
    const gi = g.index ? g.index.array : [...Array(count).keys()];
    for (let k = 0; k < gi.length; k++) idx.push(gi[k] + vtx);
    vtx += count;
  }
  for (const name of names) out.setAttribute(name, new THREE.Float32BufferAttribute(arrays[name], list[0].attributes[name].itemSize));
  out.setIndex(idx);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shell instance
// ---------------------------------------------------------------------------------------------

let shellMaterialFactory = null;
/** PagurusMinutusMaterial registers its factory here (avoids a circular import) */
export function setShellMaterialFactory(fn) {
  shellMaterialFactory = fn;
}

/**
 * A concrete shell: species + size + condition. `props` holds everything the behaviour and the
 * physics need (SI units plus mm/g conveniences).
 */
export class Shell {
  /**
   * @param {{species: string, size_mm?: number, damage?: number, fouling?: number, silt?: number, seed?: number, lod?: number}} o
   */
  constructor(o) {
    const key = o.species;
    const data = shellSpeciesData(key);
    const sp = data.sp;
    const rng = new SeededRandom((o.seed ?? 1) * 7919 + 13);
    this.key = key;
    this.data = data;
    this.size_mm = o.size_mm ?? sp.typical_mm;
    this.damage = clamp(o.damage ?? 0, 0, 1);
    this.fouling = clamp(o.fouling ?? rng.range(0, 0.5), 0, 1);
    // film of fine mud on shells carried over sand-mud flats: matte, grey-beige, thickest in the sutures (photos 008, 050, 064)
    this.silt = clamp(o.silt ?? 0.35 + 0.45 * hash1((o.seed ?? 1) * 31 + 7), 0, 1);
    this.variant = (o.seed ?? 1) & 3;
    this.seed = o.seed ?? 1;
    this.lod = o.lod ?? 1;
    const k = this.size_mm / 1000; // metres per normalised unit
    this.scale = k;
    // damage removes a bit of the lip (≈ last 0.3 rad on average at damage 1)
    const lipLoss = 1 - this.damage * 0.06;
    const matVol_m3 = data.materialVolume * k * k * k * lipLoss;
    const mass_kg = matVol_m3 * SHELL_DENSITY_KG_M3;
    this.props = {
      species: key,
      ja: sp.ja,
      sci: sp.sci,
      coiling: 'dextral',
      size_mm: this.size_mm,
      sizeMeasure: sp.sizeMeasure,
      mass: mass_kg, // kg
      mass_g: mass_kg * 1000,
      volume: matVol_m3, // shell material volume, m³
      internalVolume: data.lumenVolume * k * k * k, // m³
      internalVolume_mm3: data.lumenVolume * this.size_mm ** 3,
      usableVolume_mm3: Math.min(data.lumenVolume, data.lumenVolumeLastWhorl * 1.4) * this.size_mm ** 3 * (1 - this.damage * 0.15),
      apertureWidth: data.apertureWidth * k, // m
      apertureHeight: data.apertureHeight * k,
      apertureWidth_mm: data.apertureWidth * this.size_mm,
      apertureHeight_mm: data.apertureHeight * this.size_mm,
      centerOfMass: data.comLocal.clone().multiplyScalar(k), // m, shell-local (origin = aperture seat)
      inertia: data.inertia.clone().multiplyScalar(SHELL_DENSITY_KG_M3 * k ** 5), // kg·m² about CoM
      damage: this.damage,
      fouling: this.fouling,
      silt: this.silt,
      thicknessIndex: sp.thickness,
      evidence: sp.evidence,
    };
    this.object3D = new THREE.Group();
    this.object3D.name = 'Shell';
    this.mesh = null;
    this.setLOD(this.lod);
    // contact hull: points on the outer surface (shell-local, metres) used for ground/obstacle contact
    this.hull = this._hullPoints();
    this.radius = this.hull.reduce((m, q) => Math.max(m, q.length()), 0);
    this.carry = this._carryFrame();
    this.abdomenPath = this._abdomenPath();
  }

  setLOD(lod) {
    this.lod = clamp(lod, 0, 2);
    const geo = buildShellGeometry(this.key, this.lod, this.damage, this.variant);
    if (!this.mesh) {
      const mat = shellMaterialFactory ? shellMaterialFactory(this) : new THREE.MeshStandardMaterial({ color: 0x777066, roughness: 0.6 });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.name = 'ShellMesh';
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      this.mesh.scale.setScalar(this.scale);
      this.object3D.add(this.mesh);
    } else {
      this.mesh.geometry = geo;
    }
  }

  _hullPoints() {
    const sp = this.data.sp, d = this.data;
    const pts = [];
    const p = new THREE.Vector3();
    const theta0 = -TAU * sp.whorls * (1 - (sp.apexErosion || 0) * 0.35);
    // apex
    shellPoint(sp, theta0, 0, 0, p);
    pts.push(p.clone());
    // periphery of last 1.5 whorls (8 around) + aperture lip (6)
    for (let i = 0; i < 10; i++) {
      const th = -TAU * 1.5 * (i / 9);
      for (const phi of [0, -Math.PI * 0.5, Math.PI * 0.5, Math.PI * 0.75]) {
        shellPoint(sp, th, phi, 0, p);
        pts.push(p.clone());
      }
    }
    for (let j = 0; j < 8; j++) {
      const phi = (j / 8) * TAU;
      shellPoint(sp, lipEnd(sp, phi), phi, 0, p);
      pts.push(p.clone());
    }
    return pts.map((q) => q.multiplyScalar(d.norm).sub(d.seat).multiplyScalar(this.scale));
  }

  /**
   * Carry frame: rotation from shell-local to the crab's ShellAnchor frame. Baseline (identity) has
   * the apex up and the aperture forward; the shell is pitched apex-backward to the species' carry
   * elevation and rolled so its centre of mass sits over the crab (partially – crabs carry shells
   * slightly canted toward the columella side).
   */
  _carryFrame() {
    // apex pitched backward to the species' carry elevation, then rolled about the axis until the
    // aperture faces the substrate (snail-like posture: aperture down, spire up-back)
    const elev = THREE.MathUtils.degToRad(this.data.sp.carry.apexElevationDeg);
    const A = new THREE.Vector3(0, Math.sin(elev), -Math.cos(elev));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), A);
    const n = this.data.apertureNormal.clone().applyQuaternion(q);
    const down = new THREE.Vector3(0, -1, 0);
    const np = n.clone().addScaledVector(A, -n.dot(A)).normalize();
    const dp = down.clone().addScaledVector(A, -down.dot(A)).normalize();
    const ang = Math.atan2(new THREE.Vector3().crossVectors(np, dp).dot(A), np.dot(dp));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(A, ang));
    this.apertureNormal = this.data.apertureNormal.clone();
    return { quaternion: q, elevation: elev, roll: ang };
  }

  /**
   * Centre line of the whorl tube from the aperture inward, in shell-local metres. The crab's soft
   * abdomen follows this path (it grips the columella with its uropods), so the hidden abdomen is
   * posed by the actual shell it lives in.
   * @returns {(u: number, out: THREE.Vector3) => THREE.Vector3} u = distance along the path in metres
   */
  _abdomenPath() {
    const d = this.data, k = this.scale;
    const L = d.lumenPath;
    const N = L.length;
    const pts = [], len = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const e = L[i];
      const rho = e.s * (1 + e.u), h = e.s * (-d.sp.T + e.v);
      pts.push(new THREE.Vector3(rho * Math.cos(e.th), h, rho * Math.sin(e.th)).multiplyScalar(d.norm).sub(d.seat).multiplyScalar(k));
      len[i] = i === 0 ? 0 : len[i - 1] + pts[i].distanceTo(pts[i - 1]);
    }
    const total = len[N - 1];
    const locate = (u) => {
      const x = clamp(u, 0, total);
      let lo = 0, hi = N - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (len[m] < x) lo = m; else hi = m; }
      return [lo, hi, (x - len[lo]) / Math.max(1e-9, len[hi] - len[lo])];
    };
    const fn = (u, out) => {
      const [lo, hi, f] = locate(u);
      return out.copy(pts[lo]).lerp(pts[hi], f);
    };
    fn.total = total;
    /** effective lumen half-widths (m) along radial / axial directions; writes the radial unit vector */
    fn.lumenAt = (u, outRadial) => {
      const [lo, hi, f] = locate(u);
      const a = L[lo], b = L[hi];
      if (outRadial) outRadial.set(Math.cos(lerp(a.th, b.th, f)), 0, Math.sin(lerp(a.th, b.th, f)));
      return { ra: lerp(a.ra, b.ra, f) * d.norm * k, rb: lerp(a.rb, b.rb, f) * d.norm * k };
    };
    fn.radiusAt = (u) => {
      const r = fn.lumenAt(u);
      return Math.min(r.ra, r.rb);
    };
    return fn;
  }

  /** world-space hull points (allocation-free; reuses internal array) */
  hullWorld(out = []) {
    const m = this.object3D.matrixWorld;
    for (let i = 0; i < this.hull.length; i++) {
      if (!out[i]) out[i] = new THREE.Vector3();
      out[i].copy(this.hull[i]).applyMatrix4(m);
    }
    out.length = this.hull.length;
    return out;
  }

  dispose() {
    this.object3D.removeFromParent();
    // geometries are cached and shared; materials are owned by the material cache
  }
}

// ---------------------------------------------------------------------------------------------
// Dynamics: spring-damper coupling between the crab's grip (ShellAnchor) and the shell
// ---------------------------------------------------------------------------------------------

const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion();
const _m0 = new THREE.Matrix4();

/**
 * The crab holds the shell's columella with uropods and the rasps of P4/P5, so the shell is not free:
 * it is a stiff, damped rotational spring around the grip point with small translational compliance.
 * What makes it move:
 *  - inertia: anchor linear acceleration (body bob, start/stop) and angular acceleration (turns)
 *    produce pseudo-torques about the grip → the shell lags and settles
 *  - gravity: change of the gravity torque when the body pitches/rolls (on slopes the shell sags)
 *  - ground contact: hull points below the substrate are pushed out (dragging shells tip and bump)
 * Natural frequency and damping are per-shell (heavier shells: lower f0). Deviation is soft-limited
 * so the shell never swings like a pendulum.
 */
export class ShellDynamics {
  constructor(shell, opts = {}) {
    this.shell = shell;
    const m = shell.props.mass;
    const mRef = 3e-4; // 0.3 g
    this.f0 = (opts.f0 ?? 7.5) * Math.pow(mRef / Math.max(1e-6, m), 0.18);
    this.zeta = opts.zeta ?? 0.55;
    this.maxAngle = opts.maxAngle ?? THREE.MathUtils.degToRad(11);
    this.inertialGain = opts.inertialGain ?? 1.0;
    this.contactStiffness = opts.contactStiffness ?? 1;
    this.gripCompliance = opts.gripCompliance ?? 0.04; // fraction of shell size the grip yields
    this.qOff = new THREE.Quaternion(); // rotational deviation (anchor frame)
    this.omega = new THREE.Vector3(); // rad/s, anchor frame
    this.pOff = new THREE.Vector3(); // m, anchor frame
    this.vel = new THREE.Vector3();
    this.prevAnchorPos = new THREE.Vector3();
    this.prevAnchorVel = new THREE.Vector3();
    this.prevAnchorQuat = new THREE.Quaternion();
    this.prevAnchorOmega = new THREE.Vector3();
    this.first = true;
    this.contactCount = 0;
    this.contactDepth = 0;
    this.hullW = [];
    this.lastContactPoints = [];
    // rotational inertia about the grip, averaged to a scalar per axis (parallel-axis theorem)
    const I = shell.props.inertia.elements;
    const r = shell.props.centerOfMass;
    this.Igrip = new THREE.Vector3(
      I[0] + m * (r.y * r.y + r.z * r.z),
      I[4] + m * (r.x * r.x + r.z * r.z),
      I[8] + m * (r.x * r.x + r.y * r.y),
    );
  }

  reset() {
    this.qOff.identity();
    this.omega.set(0, 0, 0);
    this.pOff.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.first = true;
  }

  /**
   * @param {number} dt seconds
   * @param {THREE.Object3D} anchor the crab's ShellAnchor bone (world matrix up to date)
   * @param {(x:number,z:number)=>number} groundAt ground height
   * @param {{carryBlend?: number, holdStrength?: number}} [o] holdStrength 0..1 (withdrawn crabs clamp hard)
   */
  update(dt, anchor, groundAt, o = {}) {
    const shell = this.shell;
    const obj = shell.object3D;
    anchor.matrixWorld.decompose(_v0, _q0, _v1);
    const anchorPos = _v0, anchorQuat = _q0;
    if (this.first || dt <= 0) {
      this.prevAnchorPos.copy(anchorPos);
      this.prevAnchorQuat.copy(anchorQuat);
      this.prevAnchorVel.set(0, 0, 0);
      this.prevAnchorOmega.set(0, 0, 0);
      this.first = false;
    }
    const h = Math.max(1e-4, dt);
    // anchor kinematics (world)
    const vel = _v2.copy(anchorPos).sub(this.prevAnchorPos).divideScalar(h);
    const acc = _v3.copy(vel).sub(this.prevAnchorVel).divideScalar(h);
    // clamp spikes from teleports / LOD re-attach
    if (acc.length() > 6) acc.setLength(6);
    this.prevAnchorVel.copy(vel);
    this.prevAnchorPos.copy(anchorPos);
    const omegaW = rotationError(this.prevAnchorQuat, anchorQuat, new THREE.Vector3()).divideScalar(h);
    if (omegaW.length() > 20) omegaW.setLength(20);
    const alphaW = omegaW.clone().sub(this.prevAnchorOmega).divideScalar(h);
    if (alphaW.length() > 400) alphaW.setLength(400);
    this.prevAnchorOmega.copy(omegaW);
    this.prevAnchorQuat.copy(anchorQuat);
    const invQ = _q1.copy(anchorQuat).invert();
    const accA = acc.applyQuaternion(invQ); // anchor frame
    const alphaA = alphaW.applyQuaternion(invQ);
    const gA = _v1.set(0, -9.81, 0).applyQuaternion(invQ);
    const w0 = TAU * this.f0;
    const hold = o.holdStrength ?? 1;
    const k = w0 * w0 * (0.6 + 0.8 * hold);
    const c = 2 * this.zeta * w0 * (0.8 + 0.4 * hold);
    const m = shell.props.mass;
    const carryQ = shell.carry.quaternion;
    const comRest = shell.props.centerOfMass.clone().applyQuaternion(carryQ);
    // gravity torque at rest is held by the crab's grip; only its change acts on the shell
    const comNow = shell.props.centerOfMass.clone().applyQuaternion(_q1.copy(this.qOff).multiply(carryQ));
    const sub = Math.max(1, Math.ceil(h / (1 / 240)));
    const sh = h / sub;
    const groundY = [];
    // ground contact (world → anchor frame torques), evaluated once per frame
    const contactTorque = new THREE.Vector3();
    const contactForce = new THREE.Vector3();
    this.contactCount = 0;
    this.contactDepth = 0;
    obj.updateMatrixWorld(true);
    const hw = shell.hullWorld(this.hullW);
    this.lastContactPoints.length = 0;
    for (let i = 0; i < hw.length; i++) {
      const p = hw[i];
      const gy = groundAt(p.x, p.z);
      groundY[i] = gy;
      const pen = gy - p.y;
      if (pen > 0) {
        this.contactCount++;
        this.contactDepth = Math.max(this.contactDepth, pen);
        this.lastContactPoints.push(p.clone());
        // lever arm from the grip, in anchor frame
        const r = _v2.copy(p).sub(anchorPos).applyQuaternion(invQ);
        const up = _v3.set(0, 1, 0).applyQuaternion(invQ);
        // normalised: penetration over shell size → acceleration
        const f = up.multiplyScalar(this.contactStiffness * w0 * w0 * 3.0 * pen / Math.max(1e-5, shell.radius));
        contactTorque.add(new THREE.Vector3().crossVectors(r, f).divideScalar(Math.max(1e-6, r.lengthSq() / shell.radius)));
        contactForce.add(f.multiplyScalar(shell.radius * 0.6));
      }
    }
    for (let s = 0; s < sub; s++) {
      // rotational deviation as axis-angle
      const dev = rotationError(new THREE.Quaternion(), this.qOff, new THREE.Vector3());
      // pseudo-torques per unit inertia
      const r = comNow; // lever arm to CoM (anchor frame)
      const fInertial = accA.clone().multiplyScalar(-m * this.inertialGain);
      const tauInertial = new THREE.Vector3().crossVectors(r, fInertial);
      const tauGravity = new THREE.Vector3().crossVectors(r, gA.clone().multiplyScalar(m)).sub(new THREE.Vector3().crossVectors(comRest, new THREE.Vector3(0, -9.81 * m, 0)));
      const alpha = new THREE.Vector3(
        (tauInertial.x + tauGravity.x * 0.35) / this.Igrip.x,
        (tauInertial.y + tauGravity.y * 0.35) / this.Igrip.y,
        (tauInertial.z + tauGravity.z * 0.35) / this.Igrip.z,
      );
      // scale the physical pseudo-torque down to the grip's effective compliance
      alpha.multiplyScalar(0.02);
      alpha.addScaledVector(alphaA, -0.35 * this.inertialGain); // lag behind body rotation
      alpha.addScaledVector(dev, -k).addScaledVector(this.omega, -c);
      alpha.add(contactTorque);
      this.omega.addScaledVector(alpha, sh);
      const wl = this.omega.length();
      if (wl > 1e-9) {
        _q1.setFromAxisAngle(_v2.copy(this.omega).divideScalar(wl), wl * sh);
        this.qOff.premultiply(_q1).normalize();
      }
      // soft limit
      const ang = 2 * Math.acos(clamp(Math.abs(this.qOff.w), -1, 1));
      if (ang > this.maxAngle) {
        this.qOff.slerp(_q1.identity(), 1 - this.maxAngle / ang);
        this.omega.multiplyScalar(0.5);
      }
      // translational compliance (grip yields a little)
      const kl = w0 * w0 * 1.6, cl = 2 * 0.7 * w0 * 1.2;
      const aLin = accA.clone().multiplyScalar(-0.04 * this.inertialGain).addScaledVector(this.pOff, -kl).addScaledVector(this.vel, -cl).add(contactForce);
      this.vel.addScaledVector(aLin, sh);
      this.pOff.addScaledVector(this.vel, sh);
      const lim = this.gripCompliance * shell.size_mm * 1e-3;
      if (this.pOff.length() > lim) this.pOff.setLength(lim);
    }
    // compose world transform: anchor * offset * carry
    _q1.copy(anchorQuat).multiply(this.qOff).multiply(carryQ);
    obj.quaternion.copy(_q1);
    obj.position.copy(this.pOff).applyQuaternion(anchorQuat).add(anchorPos);
    obj.scale.set(1, 1, 1);
    if (obj.parent) {
      // express in parent space
      _m0.compose(obj.position, obj.quaternion, obj.scale);
      obj.parent.updateMatrixWorld();
      _m0.premultiply(new THREE.Matrix4().copy(obj.parent.matrixWorld).invert());
      _m0.decompose(obj.position, obj.quaternion, obj.scale);
    }
    obj.updateMatrixWorld(true);
  }

  /** lowest clearance (m) between the hull and the ground right now (negative = penetrating) */
  clearance(groundAt) {
    const hw = this.shell.hullWorld(this.hullW);
    let min = Infinity;
    for (const p of hw) min = Math.min(min, p.y - groundAt(p.x, p.z));
    return min;
  }
}

// ---------------------------------------------------------------------------------------------
// Shell evaluation (used by shell inspection / exchange)
// ---------------------------------------------------------------------------------------------

/**
 * Suitability of a shell for a crab, 0..1, with the components the crab can assess with its chelae
 * and antennae during inspection (aperture, internal space, weight, damage). Grounded in:
 *  - Pagurus spp. prefer shells whose internal volume and aperture match body size; too-large shells
 *    hinder movement, too-small shells limit growth (Elwood & Neil 1992; Kumamoto Univ. lecture)  [近縁から推定]
 *  - P. minutus/P. dubius: no species selectivity in the lab, durable thick shells persist and are
 *    used more in the field (J. Crust. Biol. 41(1) 2021)                                         [本種で直接確認]
 *  - Shell use differs by sex and season (males take Umbonium-type shells in the breeding season)  [本種で直接確認]
 * @param {{bodyVolume_mm3:number, chelaWidth_mm:number, shieldLength_mm:number, sex?:string, breeding?:boolean}} crab
 * @param {Shell['props']} p
 */
export function evaluateShell(crab, p) {
  // abdomen + retracted cephalothorax need about 1.3× body volume of usable lumen (last ~1.5 whorls)
  const volRatio = p.usableVolume_mm3 / Math.max(1e-6, crab.bodyVolume_mm3 * 1.3);
  const volume = Math.exp(-Math.pow(Math.log(Math.max(1e-3, volRatio)) / 0.45, 2));
  // aperture: the cephalothorax must pass through its narrow side and the major chela must close it [S]
  const apEff = Math.sqrt(p.apertureWidth_mm * p.apertureHeight_mm);
  const apRatio = apEff / Math.max(1e-3, crab.shieldLength_mm * 1.05);
  const passRatio = Math.min(p.apertureWidth_mm, p.apertureHeight_mm) / Math.max(1e-3, crab.shieldLength_mm * PASSAGE_SL);
  const aperture = Math.exp(-Math.pow(Math.log(Math.max(1e-3, apRatio)) / 0.35, 2)) * smoothstep01((passRatio - 0.8) / 0.2);
  // weight relative to body: heavy shells cost locomotion [G: Coenobita, Pagurus]
  const bodyMass_g = crab.bodyVolume_mm3 * 1.06e-3;
  const wRatio = p.mass_g / Math.max(1e-6, bodyMass_g);
  const weight = 1 / (1 + Math.pow(Math.max(0, wRatio - 3.5) / 3, 2));
  const integrity = 1 - 0.8 * p.damage;
  const durability = clamp(0.75 + p.thicknessIndex, 0.8, 1.0);
  let speciesBias = 1;
  if (crab.breeding && crab.sex === 'm' && p.species === 'umbonium_moniliferum') speciesBias = 1.08;
  const score = clamp(volume * 0.38 + aperture * 0.27 + weight * 0.15 + integrity * 0.2, 0, 1) * durability * speciesBias;
  return { score: clamp(score, 0, 1), volume, aperture, weight, integrity, volRatio, apRatio, passRatio, wRatio };
}

const smoothstep01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/**
 * The narrow side of the aperture must let the cephalothorax pass so the crab can withdraw completely:
 * ≈ 0.75 SL (shield width ≈ SL / 1.05; the branchiostegites and leg bases fold in) [S]
 */
export const PASSAGE_SL = 0.75;

/**
 * Room the withdrawn crab needs in the lumen, from the aperture inward (SL): the cephalothorax (shield +
 * posterior carapace ≈ 1.85 SL, width ≈ 0.92 SL, height ≈ 0.5 SL) with the face ≈ 0.6 SL behind the
 * lid, then the soft abdomen, which can shorten to ≈ 60 % of its relaxed 4.4 SL [S].
 */
const HIDE_ROOM = [
  { depth: 0.8, narrow: 0.27, wide: 0.42 },
  { depth: 1.8, narrow: 0.22, wide: 0.34 },
  { depth: 2.4, narrow: 0.17, wide: 0.26 },
];
const HIDE_PATH_SL = 2.6 + 0.6 * 4.4;

/** lumen centreline and half-widths per mm of shell size, from the aperture inward (cached) */
const LUMEN_PROFILE = new Map();
function lumenProfile(key) {
  let pr = LUMEN_PROFILE.get(key);
  if (pr) return pr;
  const d = shellSpeciesData(key);
  const L = d.lumenPath;
  const N = L.length;
  const arc = new Float32Array(N), narrow = new Float32Array(N), wide = new Float32Array(N);
  let prev = null;
  for (let i = 0; i < N; i++) {
    const e = L[i];
    const rho = e.s * (1 + e.u), h = e.s * (-d.sp.T + e.v);
    // shell units are normalised so that size_mm = 1 ↔ 1 mm: positions × norm are mm per mm of size
    const p = new THREE.Vector3(rho * Math.cos(e.th), h, rho * Math.sin(e.th)).multiplyScalar(d.norm);
    arc[i] = prev ? arc[i - 1] + p.distanceTo(prev) : 0;
    prev = p;
    narrow[i] = Math.min(e.ra, e.rb) * d.norm;
    wide[i] = Math.max(e.ra, e.rb) * d.norm;
  }
  const at = (a) => {
    let i = 0;
    while (i < N - 2 && arc[i + 1] < a) i++;
    const f = clamp((a - arc[i]) / Math.max(1e-9, arc[i + 1] - arc[i]), 0, 1);
    return [lerp(narrow[i], narrow[i + 1], f), lerp(wide[i], wide[i + 1], f)];
  };
  pr = { total: arc[N - 1], at };
  LUMEN_PROFILE.set(key, pr);
  return pr;
}

/**
 * Smallest shell (mm, in the species' size measure) a crab can withdraw into completely: the narrow side
 * of the aperture passes the cephalothorax, and the lumen behind it is wide and long enough to hold the
 * hidden body and the (shortened) abdomen.
 */
export function minFitSize(key, shieldLength_mm) {
  const d = shellSpeciesData(key);
  const SLm = shieldLength_mm;
  const s0 = (PASSAGE_SL * SLm) / Math.min(d.apertureWidth, d.apertureHeight);
  const pr = lumenProfile(key);
  const ok = (S) => pr.total * S >= HIDE_PATH_SL * SLm && HIDE_ROOM.every((r) => {
    const [n, w] = pr.at((r.depth * SLm) / S);
    return n * S >= r.narrow * SLm && w * S >= r.wide * SLm;
  });
  let fit = s0;
  if (!ok(s0)) {
    let lo = s0, hi = s0 * 1.1;
    while (!ok(hi) && hi < s0 * 6) { lo = hi; hi *= 1.1; }
    for (let k = 0; k < 24; k++) { const m = 0.5 * (lo + hi); if (ok(m)) hi = m; else lo = m; }
    fit = hi;
  }
  // complete withdrawal (claws closing the opening) needs more room than these minimum dimensions
  return Math.max(fit, (d.sp.hideFit ?? 0) * SLm);
}

/** pick a natural shell for a crab of given shield length (field-like distribution) */
export function chooseShellFor(shieldLength_mm, rng, prefer = null) {
  const keys = SHELL_SPECIES_KEYS;
  // field frequencies (Waka River / Azuma et al.): Batillaria and Umbonium dominate
  const weights = { batillaria_attramentaria: 0.42, umbonium_moniliferum: 0.36, reticunassa_festiva: 0.1, reishia_clavigera: 0.06, lunella_coreensis: 0.06 };
  // only species that come large enough for this crab to withdraw into (large crabs leave the small
  // Umbonium and Reticunassa shells) [S]
  const fits = (k) => minFitSize(k, shieldLength_mm) <= SHELL_SPECIES[k].size_mm[1] * 1.04;
  let key = prefer;
  if (!key) {
    const cand = keys.filter(fits);
    const pool = cand.length ? cand : keys;
    const total = pool.reduce((a, k) => a + (weights[k] ?? 0), 0);
    let r = rng.next() * total, acc = 0;
    for (const k of pool) { acc += weights[k] ?? 0; if (r <= acc) { key = k; break; } }
    key = key ?? pool[0];
  }
  const sp = SHELL_SPECIES[key];
  // from just big enough to withdraw into, up to ~30 % roomier
  const size = clamp(minFitSize(key, shieldLength_mm) * (1.0 + rng.next() * 0.3), sp.size_mm[0], sp.size_mm[1]);
  const damage = rng.chance(0.25) ? rng.range(0.15, 0.7) : rng.range(0, 0.1);
  return { species: key, size_mm: size, damage, fouling: rng.range(0.05, 0.75), seed: Math.floor(rng.next() * 1e6) };
}

export { hash1 };
