// Fins: pleated membrane meshes with individual rays + a shared texture atlas.
import { section, topY, botY, surfaceAt, toObject, dirToObject, MALE } from './anatomy.mjs';
import { perlin3, fbm3, hash01, clamp, mix, smoothstep } from '../lib/noise.mjs';

const DEG = Math.PI / 180;
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const ATLAS = 2048;

// Rows of oval dots on the rays (centred on the ray, elongated along it), staggered on alternate rays.
// Measured on live 014/001 and specimens [P colour report §3.8]; brick-red in life (xantho/erythrophores
// over some melanin), pale orange-tan in pale specimens.
function rayDots(r, Lr, len, dRay, { first, pitch, l, w, maxFrac = 0.92, drop = 0.1, seed = 0, stagger = 0.5 }) {
  let v = 0;
  for (let j = 0; j < 14; j++) {
    const Lj = first + (j + (r % 2) * stagger) * pitch + (hash01(r, j, 2, 600 + seed) - 0.5) * pitch * 0.2;
    if (Lj > len * maxFrac) break;
    if (hash01(r, j, 1, 610 + seed) < drop) continue;
    const amp = 0.7 + 0.3 * hash01(r, j, 4, 620 + seed);
    v = Math.max(v, amp * Math.exp(-(((Lr - Lj) / l) ** 2) - ((dRay / w) ** 2)));
  }
  return v;
}
const INSET = 6;

function inPlaneBend(dir, normal) {
  // component of the posterior axis (+s) perpendicular to the ray, inside the fin plane
  let b = sub([1, 0, 0], mul(dir, dot([1, 0, 0], dir)));
  b = sub(b, mul(normal, dot(b, normal)));
  const l = Math.hypot(...b);
  return l < 1e-5 ? [0, 0, 0] : mul(b, 1 / l);
}

// ---------------------------------------------------------------------------
// Fin definitions (fish-space mm)

// angles: per-ray inclination (deg from the body axis, + dorsal / − ventral) or a0→a1 linear; curv: number or per-ray
function medianFin({ name, s0, s1, count, a0, a1, angles = null, lengths, dorsal, spines, curv, notch, pleat, sag, rect, branchT, segStart, pigment, membrane = null }) {
  const rays = [];
  const normal = [0, 0, 1];
  for (let k = 0; k < count; k++) {
    const f = k / (count - 1);
    const s = s0 + (s1 - s0) * f;
    const y = dorsal ? topY(s) - 0.14 : botY(s) + 0.14;
    const a = (angles ? angles[k] : a0 + (a1 - a0) * f) * DEG;
    const dir = nrm([Math.cos(a), Math.sin(a), 0]);
    const c = Array.isArray(curv) ? curv[k] : curv;
    rays.push({ base: [s, y, 0], dir, len: lengths[k], kind: k < spines ? 'spine' : 'soft', curv: c, bend: inPlaneBend(dir, normal), ang: a });
  }
  return { name, type: 'median', dorsal, rays, normal, notch, pleat, sag, rect, branchT, segStart, pigment, cup: 0, wave: 0.0, membrane };
}

function caudalFin(rect) {
  const rays = [];
  const normal = [0, 0, 1];
  const q = section(42.7);
  // dorsal procurrent rays (short, unbranched), principal rays, ventral procurrent rays
  const proc = [[40.9, 1.1, 13], [41.55, 2.1, 16], [42.2, 3.3, 18.5]];
  for (const [s, len, ang] of proc) {
    const dir = nrm([Math.cos(ang * DEG), Math.sin(ang * DEG), 0]);
    rays.push({ base: [s, topY(s) - 0.12, 0], dir, len, kind: 'spine', curv: 0, bend: [0, 0, 0], ang: ang * DEG });
  }
  const NP = 17;
  for (let k = 0; k < NP; k++) {
    const f = k / (NP - 1);
    const u = 2 * f - 1; // -1 dorsal … +1 ventral
    const s = 42.75 - 0.3 * Math.abs(u);
    const y = q.yc - u * 1.3;
    const ang = -u * 22 * DEG;
    // rounded, almost truncate caudal fin: rear margin nearly straight between y −6 and +8 %SL, corners rounded;
    // length 24 %SL from the hypural (TL ≈ 1.24 SL, intact/live fins 22.4–26.5); relaxed spread ≈ 19 %SL
    // (pinned 21–25) [P fin report §6: 031, 025, 007, 001]. Rays lengthen as 1/cos so the margin stays straight.
    const corner = 1 - 0.3 * Math.pow(smoothstep(0.55, 1, Math.abs(u)), 1.3);
    const len = (10.1 * corner) / Math.cos(ang);
    const dir = nrm([Math.cos(ang), Math.sin(ang), 0]);
    // 17 principal rays: the outermost of each lobe are unbranched (15 branched)
    rays.push({ base: [s, y, 0], dir, len, kind: 'soft', simple: k === 0 || k === NP - 1, curv: 0, bend: [0, 0, 0], ang });
  }
  for (const [s, len, ang] of proc.slice().reverse()) {
    const dir = nrm([Math.cos(-ang * DEG), Math.sin(-ang * DEG), 0]);
    rays.push({ base: [s, botY(s) + 0.12, 0], dir, len, kind: 'spine', curv: 0, bend: [0, 0, 0], ang: -ang * DEG });
  }
  return {
    name: 'Fin_Caudal', type: 'caudal', rays, normal, notch: 0.035, pleat: 0.035, sag: 0.025, rect, branchT: 0.5, segStart: 0.12, cup: 0, wave: 0.16,
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      // [P fin report §6] ray order: 3 dorsal procurrent, 17 principal (dorsal → ventral), 3 ventral procurrent
      // (a) ~6 vertical bands of rust-brown ovals (1.8 × 1.0 %SL, on the rays) over the upper two-thirds,
      //     band pitch 3 %SL, fading by x ≈ 118 %SL; the rear quarter clear
      const upper = smoothstep(0.7, 0.58, fAcross);
      const d = upper * rayDots(r, Lr, len, dRay, { first: 0.75, pitch: 1.29, l: 0.36 * (1 - 0.3 * t), w: 0.22, maxFrac: 0.76, drop: 0.08, seed: 1, stagger: 0.15 });
      // (b) caudal-base spot: the dense core sits on the body (body.mjs); on the fin it continues as a "<" of
      //     three dark streaks 3–4 %SL long along the rays at y +1, −1.5 and −3 %SL
      const streak = (fc, Lmm) => Math.exp(-(((fAcross - fc) / 0.024) ** 2)) * smoothstep(Lmm, 0.55 * Lmm, Lr);
      const base = Math.max(0.9 * smoothstep(0.08, 0.02, t) * smoothstep(0.5, 0.2, Math.abs(fAcross - 0.55) * 2),
        streak(0.38, 1.5), streak(0.68, 1.5), streak(0.86, 1.3));
      // (c) lower third unspotted, pale yellow, with a dark-brown streak (0.7 %SL) along the 2nd–3rd lowest
      //     principal rays from x 103 to 113 %SL (001, 014, 004)
      const lower = smoothstep(0.6, 0.72, fAcross) * smoothstep(0.95, 0.85, t);
      const lowStreak = Math.exp(-(((fAcross - 0.795) / 0.026) ** 2)) * smoothstep(1.0, 1.6, Lr) * smoothstep(5.8, 4.9, Lr);
      // (d) breeding male / some individuals: blue-black dash at the upper margin (001/014 only) [P, optional]
      const mspot = MALE ? Math.exp(-(((t - 0.5) / 0.12) ** 2) - (((fAcross - 0.14) / 0.06) ** 2)) : 0;
      return { mel: Math.max(0.28 * d, 0.9 * base, 0.4 * lowStreak, 1.0 * mspot), xan: 0.95 * d, yel: 0.45 * lower, irid: 0.05 };
    },
  };
}

function pectoralFin(side, rect) {
  const rays = [];
  const NR = 17; // pectoral rays: 15–18 in Favonigobius [R]; 17 used
  // fin held away from the flank; its lower half flares outward (plane tilted ~30° from vertical)
  const Xf = nrm([1, 0, 0.42 * side]);
  const up0 = nrm([0, 1, -0.58 * side]);
  const Yf = nrm(sub(up0, mul(Xf, dot(up0, Xf))));
  let normal = nrm(cross(Xf, Yf));
  if (normal[2] * side < 0) normal = mul(normal, -1);
  for (let k = 0; k < NR; k++) {
    const f = k / (NR - 1);
    // ray insertion line at 26.5–27 %SL, nearly vertical, from +1 to −7 %SL about the axis [P lateral fit; fin report §4]
    const s = 11.4 + 0.4 * f + 0.12 * f * f;
    const y = 4.0 - 3.3 * f;
    const sp = surfaceAt(s, y).p;
    const base = [s, y, side * (sp[2] - 0.12)];
    // upper rays sweep back at ~25°, lower rays point down-back (fan top stays at eye level)
    const psi = (25 - f * 82) * DEG;
    const dir = nrm(add(mul(Xf, Math.cos(psi)), mul(Yf, Math.sin(psi))));
    // rounded fan, middle rays longest: 19 %SL (tip at x ≈ 46 %SL, level with D1 spine 5), uppermost rays
    // about half of that, lowest ~13–14 %SL [P fin report §4: 026, A]; no free upper rays
    const x = (f - 0.5) / (f < 0.5 ? 0.5 : 0.58);
    const len = 8.2 * (0.5 + 0.5 * Math.pow(Math.max(0, 1 - x * x), 0.6));
    // uppermost and lowermost rays are simple (unbranched), the rest branch near their tips
    rays.push({ base, dir, len, kind: 'soft', simple: k < 2 || k === NR - 1, curv: 0.05, bend: inPlaneBend(dir, normal), psi });
  }
  return {
    name: side > 0 ? 'Fin_Pectoral_L' : 'Fin_Pectoral_R', type: 'pectoral', Xf, Yf, rays, normal, notch: 0.03, pleat: 0.06, sag: 0.03, rect, branchT: 0.45, segStart: 0.15, cup: 0.22, wave: 0.05,
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      // clear membrane, faintly dusky between the rays with fine melanophores along them; cream rays; 2–3 small
      // brown spots near the base; sparse dark specks on the upper rays [P colour report §2.4, 017; fin report §4]
      const onRay = Math.exp(-((dRay / 0.07) ** 2));
      const speck = 0.35 * rayDots(r, Lr, len, dRay, { first: 0.8, pitch: 1.1, l: 0.12, w: 0.06, drop: 0.5, seed: 3 }) * smoothstep(0.75, 0.25, fAcross);
      const baseSpots = 0.6 * rayDots(r, Lr, len, dRay, { first: 0.35, pitch: 0.55, l: 0.16, w: 0.12, maxFrac: 0.16, drop: 0.55, seed: 4 }) * smoothstep(0.85, 0.5, fAcross);
      const stipple = 0.06 * smoothstep(0.55, 0.85, hash01(Math.floor(Lr * 9), Math.floor(dRay * 30), r, 31)) * Math.exp(-((dRay / 0.12) ** 2));
      return { mel: Math.max(speck, baseSpots) + stipple + 0.03, xan: 0.25 * onRay + 0.1 * smoothstep(0.5, 0.0, t) + 0.25 * baseSpots, yel: 0.25 * onRay, irid: 0.1 * smoothstep(0.25, 0.0, t) };
    },
  };
}

// Pelvic sucker: the two pelvic fins (I,5 each) are fused into an oval, cup-shaped disc under the chest.
// The spines point forward-laterally and a membrane (frenum) closes the front, so the rim runs all the way
// round; the rim curls down to meet the substrate (the fish rests on it) and the centre stays vaulted.
// pelvic disc origin 27.3–28 %SL, folded tip reaching ~49 %SL [P] → long oval disc
// [P fin report §5: origin 27.5 %SL, length 21 (20–22) → tip at 48.5, 3–6 %SL short of the papilla; width ≈ 10 %SL]
export const PELVIC = { base: 11.95, front: 1.0, back: 8.9, halfWidth: 2.15, drop: 0.45 };
function pelvicDisc(rect) {
  const P = PELVIC;
  const c = P.back - (P.front + P.back) / 2; // oval centre, measured from the base along +s
  const a = (P.front + P.back) / 2, b = P.halfWidth;
  // distance from the base to the oval rim in the horizontal direction phi (0 = backwards, +90° = left)
  const rimR = (phi) => {
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const A = (cp * cp) / (a * a) + (sp * sp) / (b * b), B = (-2 * c * cp) / (a * a), C = (c * c) / (a * a) - 1;
    return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  };
  // left frenum edge, left spine, 5 + 5 soft rays, right spine, right frenum edge
  const layout = [[178.5, 'frenum'], [124, 'spine'], [88, 'soft'], [66, 'soft'], [46, 'soft'], [28, 'soft'], [10, 'soft'],
    [-10, 'soft'], [-28, 'soft'], [-46, 'soft'], [-66, 'soft'], [-88, 'soft'], [-124, 'spine'], [-178.5, 'frenum']];
  const y0 = botY(P.base) + 0.06;
  const rays = layout.map(([deg, kind]) => {
    const phi = deg * DEG;
    const len0 = rimR(phi);
    // the rim sits at a constant depth below the base: part slope, part down-curl near the rim
    const lin = 0.35 * P.drop, curl = 0.65 * P.drop;
    const h = [Math.cos(phi), 0, Math.sin(phi)];
    const dir = nrm([h[0] * len0, -lin, h[2] * len0]);
    const len = Math.hypot(len0, lin);
    const base = [P.base + 0.12 * Math.cos(phi), y0, 0.12 * Math.sin(phi)];
    return { base, dir, len, kind, curv: 0, bend: [0, 0, 0], phi, cup: curl / (0.12 * len) };
  });
  const normal = [0, -1, 0];
  return {
    name: 'Fin_Pelvic', type: 'pelvic', rays, normal, notch: 0.02, pleat: 0.015, sag: 0.02, rect, branchT: 0.55, segStart: 0.25, cup: 0, wave: 0,
    // translucent cream-white; breeding male: outer rays and membrane black, spine, innermost rays and frenum
    // pale [P colour report: 004, 051; fin report §5]
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      const o = Math.abs(fAcross * (n - 1) - (n - 1) / 2) / 4.5; // 0 = innermost rays, 1 = outermost soft ray
      const outer = smoothstep(0.2, 0.6, o) * smoothstep(1.2, 1.02, o);
      return MALE ? { mel: 0.7 * outer * smoothstep(0.08, 0.3, t), xan: 0.05, irid: 0.25 * (1 - outer) }
        : { mel: 0, xan: 0.06, yel: 0.12, irid: 0.42 * smoothstep(1.0, 0.2, t) };
    },
  };
}

export function finDefinitions() {
  const R = (x, y, w, h) => ({ x, y, w, h });
  const pc = (v) => (v * 43.0) / 100; // %SL → mm (SL 43 mm)
  // First dorsal: VI spines [F: FishBase D VI–VII; P 007 line detection]; spine bases 34.0–46.8 %SL, membrane to
  // 48.5; spread (pinned 031/025/026) heights 11–13 %SL with spines 1–3 longest; the rest geometry is the
  // spread fin — the 'fold' morph lowers it (live display ≈ 45°, folded tips at 50–53 %SL) [P fin report §1].
  // Breeding males: SPINE 1 drawn out into a filament 20–30 %SL long whose distal 8–10 %SL are free of membrane
  // and curve back (031/025: tip at 48 %SL, 054: ≈ 30 %SL) [P; F FishBase-derived: "first spine elongated"].
  // (Some Japanese accounts name spine 2 — conflict noted in README; the photos show spine 1.)
  const D1len = [12.2, 12.6, 12.3, 11.3, 9.8, 8.0].map(pc);
  const D1 = medianFin({
    name: 'Fin_Dorsal1', s0: pc(34.0), s1: pc(46.8), count: 6, angles: [64, 67, 70, 73, 76.5, 80], dorsal: true, spines: 6,
    curv: MALE ? [0.36, 0.06, 0.05, 0.04, 0.03, 0.02] : 0.05, notch: 0.1, pleat: 0.04, sag: 0.02,
    membrane: MALE ? D1len : null,
    lengths: MALE ? [pc(22), ...D1len.slice(1)] : D1len, rect: R(1024, 1024, 512, 512), branchT: 2, segStart: 2,
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      const a = fAcross * (n - 1);
      // clear, slightly warm membrane with 3–4 rows of rust spots (2.0 × 1.0 %SL, ~2 %SL apart), the top ones
      // larger and redder; spine 1 dark-banded (4–5 bands); margin pale [P fin report §1.3; 001, 026]
      const d = rayDots(r, Lr, len, dRay, { first: 0.6, pitch: 0.9, l: 0.32, w: 0.24, maxFrac: 0.82, drop: 0.1, seed: 5 });
      const band = r === 0 ? Math.exp(-((dRay / 0.09) ** 2)) * smoothstep(0.3, 0.75, Math.sin((Lr / 1.05) * Math.PI * 2 + 0.6)) : 0;
      // black spot in BOTH sexes on the last membrane (spines 5–6) at 40–55 % of the fin height:
      // 3.0 × 1.7 %SL horizontal oval, soft edge, near-black (sRGB ≈ 25,22,22) — absent in juveniles [P 004/006/025/026/007/001]
      const spot = smoothstep(1.0, 0.7, Math.hypot((a - 4.55) / 0.72, (t - 0.46) / 0.12));
      const margin = smoothstep(0.86, 0.97, t);
      let mel = (Math.max(0.3 * d, 0.75 * band) + 0.03) * (1 - 0.7 * margin);
      let xan = 0.95 * d, yel = 0, irid = 0.05 + 0.3 * margin;
      if (MALE) {
        // breeding male: a little duskier membrane with a pale margin, a yellow-green clear panel, brown basal spots
        // ringed with sky-blue; the filament (spine 1) dark-banded [P 031/025/054, fin report §1.3]. (054's black
        // reticulation is a peak-display state and left out of the base texture.)
        const panel = Math.exp(-(((fAcross - 0.6) / 0.16) ** 2) - (((t - 0.6) / 0.16) ** 2));
        const ring = smoothstep(0.15, 0.3, d) * smoothstep(0.75, 0.45, d) * smoothstep(0.45, 0.2, t);
        mel += 0.07 * (1 - margin) * (1 - panel) + (r === 0 ? 0.25 * Math.exp(-((dRay / 0.1) ** 2)) : 0);
        yel = 0.6 * panel; irid += 0.4 * ring;
      }
      mel = Math.max(mel, 0.85 * spot);
      return { mel, xan, yel, irid };
    },
  });
  // Second dorsal: I,9 [F; P 022: 10 insertions, pitch 3 %SL]; bases 54–81 %SL (base end 83.5); spread heights
  // 12 %SL over rays 1–3 falling to ~9.5 at the back; rays lean ~65°, the short spine more erect; folded tips 88–89
  // [P fin report §2: 031, 025, 026]
  if (MALE) D1.rays[0].width = 0.26; // the filament is a stout spine, visible as a dark line in photos (031, 054)
  const D2 = medianFin({
    name: 'Fin_Dorsal2', s0: pc(54), s1: pc(81), count: 10, angles: [76, 66, 65, 64, 64, 63, 62, 61, 60, 60], dorsal: true, spines: 1,
    curv: 0.03, notch: 0.07, pleat: 0.05, sag: 0.025,
    lengths: [9.3, 13.3, 13.2, 12.4, 11.7, 11.2, 11.0, 10.5, 10.6, 10.0].map(pc), rect: R(0, 1024, 1024, 512), branchT: 0.55, segStart: 0.18,
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      // 5 horizontal rows (h ≈ 1, 3, 5, 7, 9 %SL) of oval spots BETWEEN the rays (one per membrane panel), 2.3 × 0.9
      // %SL at the front/bottom shrinking to 1.6 × 0.8 at the back/top, rust to olive-brown, each framed by a
      // pale bluish-white iridescent net; distal 20 % plain [P fin report §2: live 001/014/054]
      const a = fAcross * (n - 1), k = Math.min(n - 2, Math.floor(a)), fr = a - k;
      let dmin = 9;
      for (let i = 0; i < 5; i++) {
        const tc = 0.085 + 0.16 * i + 0.035 * (hash01(k, i, 3, 700) - 0.5);
        const fc = 0.5 + 0.12 * (hash01(k, i, 5, 701) - 0.5);
        const sz = (1 - 0.3 * fAcross) * (1 - 0.07 * i) * (0.85 + 0.3 * hash01(k, i, 7, 702));
        if (hash01(k, i, 9, 703) < 0.08) continue; // the odd spot missing
        dmin = Math.min(dmin, Math.hypot((fr - fc) / (0.33 * sz), (t - tc) / (0.032 * sz)));
      }
      const spot = smoothstep(1.0, 0.7, dmin) * smoothstep(0.86, 0.78, t);
      const ring = smoothstep(0.95, 1.1, dmin) * smoothstep(1.55, 1.25, dmin) * smoothstep(0.84, 0.74, t);
      const olive = smoothstep(0.3, 0.9, fAcross);
      return { mel: 0.28 * spot + 0.03 + 0.15 * olive * spot, xan: 0.95 * spot * (1 - 0.3 * olive), yel: 0.25 * olive * spot, irid: 0.05 + 0.4 * ring };
    },
  });
  // Anal: I,9 [F; P 031 ray crossings]; bases 55–81 %SL; low, even fin h ≈ 7 %SL (0.57 × D2), rays lean 55–60°
  // (rear rays more), rear edge ≈ 89.5 %SL; folded tips 88–89 [P fin report §3]
  const AN = medianFin({
    name: 'Fin_Anal', s0: pc(55), s1: pc(81), count: 10, angles: [-62, -60, -58, -56, -54, -52, -50, -47, -45, -42], dorsal: false, spines: 1,
    curv: 0.03, notch: 0.06, pleat: 0.05, sag: 0.025,
    lengths: [4.6, 7.2, 7.9, 8.3, 8.6, 8.9, 9.2, 9.5, 9.8, 10.1].map(pc), rect: R(0, 1536, 1024, 512), branchT: 0.55, segStart: 0.18,
    // clear with a faint yellow tint and a few faint brown dashes on the rear rays (026); breeding male dusky
    // [P fin report §3; colour report §2.4: 051, 004]
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      const dash = smoothstep(0.65, 0.85, fAcross) * Math.exp(-((dRay / 0.06) ** 2)) * smoothstep(0.35, 0.5, t) * smoothstep(0.85, 0.7, t);
      return MALE ? { mel: 0.45 * Math.exp(-(((t - 0.55) / 0.22) ** 2)) + 0.08, xan: 0.05, yel: 0.15, irid: 0.1 }
        : { mel: 0.03 + 0.3 * dash, xan: 0.06, yel: 0.3 + 0.15 * smoothstep(0.5, 0.9, fAcross), irid: 0.22 * smoothstep(0.35, 0.0, t) };
    },
  });
  return [
    caudalFin(R(0, 0, 1024, 1024)),
    D1, D2, AN,
    pectoralFin(1, R(1024, 0, 1024, 1024)),
    pectoralFin(-1, R(1024, 0, 1024, 1024)),
    pelvicDisc(R(1536, 1024, 512, 512)),
  ];
}

// ---------------------------------------------------------------------------
// Geometry

function rayPoint(def, r, t) {
  let p = add(r.base, mul(r.dir, r.len * t));
  p = add(p, mul(r.bend, r.len * r.curv * t * t));
  p = add(p, mul(def.normal, (r.cup ?? def.cup) * t * t * r.len * 0.12));
  return p;
}

function catmull(p0, p1, p2, p3, f) {
  const f2 = f * f, f3 = f2 * f;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    out[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * f + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * f2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * f3);
  }
  return out;
}

export function finSurface(def, a, t) {
  const R = def.rays;
  const n = R.length;
  const k = clamp(Math.floor(a), 0, n - 2);
  const f = a - k;
  const p = catmull(
    rayPoint(def, R[Math.max(k - 1, 0)], t), rayPoint(def, R[k], t),
    rayPoint(def, R[k + 1], t), rayPoint(def, R[Math.min(k + 2, n - 1)], t), f,
  );
  const zig = (i) => (i === 0 || i === n - 1 ? 0 : def.pleat * (i % 2 ? 1 : -1)) * Math.pow(t, 0.8);
  let off = zig(k) * (1 - f) + zig(k + 1) * f + def.sag * Math.sin(Math.PI * f) * Math.pow(t, 1.2);
  off += def.wave * t * t * Math.sin(a * 0.45 + 0.7);
  return add(p, mul(def.normal, off));
}

// ---------------------------------------------------------------------------
// Morph targets (fish-space shapes evaluated on the same (a, t) grid as the mesh)

/** Rays rotated in a fin plane (spanned by u, v) from angle a0 to a1 about each ray base. */
function withRayAngles(def, angleOf, planeU, planeV, pleatK = 2.6) {
  const rays = def.rays.map((r, k) => {
    const ang = angleOf(r, k);
    const dir = nrm(add(mul(planeU, Math.cos(ang)), mul(planeV, Math.sin(ang))));
    return { ...r, dir, curv: r.curv * 0.3, bend: inPlaneBend(dir, def.normal) };
  });
  // the membrane gathers into deeper pleats as the rays close up
  return { ...def, rays, pleat: def.pleat * pleatK, sag: def.sag * 0.5, wave: def.wave * 0.3 };
}

function foldedDef(def) {
  if (def.type === 'median') {
    // rays lie back along the body (dorsal fins drop into their groove, the anal fin folds back)
    const sgn = def.dorsal ? 1 : -1;
    return withRayAngles(def, (r) => sgn * (0.07 + 0.06 * Math.abs(r.ang)), [1, 0, 0], [0, 1, 0]);
  }
  if (def.type === 'caudal') return withRayAngles(def, (r) => r.ang * 0.3, [1, 0, 0], [0, 1, 0]);
  if (def.type === 'pectoral') {
    // folded: the rays close into a narrow fan pointing straight back and the fin lies flat against the
    // flank (its lower half no longer flares out), as when a goby tucks its pectorals in for a dart
    const side = Math.sign(def.Xf[2]);
    const mid = -4 * DEG;
    return withRayAngles(def, (r) => mid - (r.psi - mid) * 0.08, nrm([1, 0, 0.12 * side]), [0, 1, 0]);
  }
  if (def.type === 'pelvic') {
    const rays = def.rays.map((r) => {
      const phi = r.phi * 0.55;
      const dir = nrm([Math.cos(phi), r.dir[1] * 0.3, Math.sin(phi)]);
      return { ...r, dir, cup: (r.cup ?? 0) * 0.25 };
    });
    return { ...def, rays, pleat: def.pleat * 2.5 };
  }
  return def;
}

function gridPositions(def, SUB, NT, disp) {
  const n = def.rays.length;
  const cols = (n - 1) * SUB + 1;
  const out = [];
  for (let j = 0; j <= NT; j++) {
    const t = j / NT;
    for (let i = 0; i < cols; i++) {
      const a = i / SUB;
      let p = finSurface(def, a, t);
      if (disp) p = add(p, disp(a, t, n));
      out.push(p);
    }
  }
  return out;
}

const rayLenAt = (def, a) => {
  const k = clamp(Math.floor(a), 0, def.rays.length - 2), f = a - k;
  return def.rays[k].len * (1 - f) + def.rays[k + 1].len * f;
};

/** Object-space morph deltas in the order of FIN_TARGETS[def.name]. */
export function buildFinTargets(def, SUB, NT, targetNames) {
  const rest = gridPositions(def, SUB, NT);
  const delta = (pts) => {
    const d = new Float32Array(rest.length * 3);
    // fish-space mm offset → object-space metres (X = z, Y = y, Z = −s)
    pts.forEach((p, i) => { const q = sub(p, rest[i]); d.set([q[2] / 1000, q[1] / 1000, -q[0] / 1000], i * 3); });
    return d;
  };
  const N = def.normal;
  const make = {
    fold: () => gridPositions(foldedDef(def), SUB, NT),
    // passive trailing flex: tips lag sideways (weight ±1 = tip deflected by ~30 % of its length)
    flex: () => gridPositions(def, SUB, NT, (a, t) => mul(N, (def.type === 'caudal' ? 0.32 : 0.22) * rayLenAt(def, a) * t * t)),
    // pectoral sculling: a travelling wave across the fin (sin / cos basis)
    waveS: () => gridPositions(def, SUB, NT, (a, t, n) => mul(N, 0.16 * rayLenAt(def, a) * Math.pow(t, 1.5) * Math.sin((2 * Math.PI * a) / ((n - 1) * 0.85)))),
    waveC: () => gridPositions(def, SUB, NT, (a, t, n) => mul(N, 0.16 * rayLenAt(def, a) * Math.pow(t, 1.5) * Math.cos((2 * Math.PI * a) / ((n - 1) * 0.85)))),
  };
  return targetNames.map((name) => delta(make[name]()));
}

export function buildFinMesh(def, SUB = 6, NT = 36) {
  const n = def.rays.length;
  const cols = (n - 1) * SUB + 1;
  const rows = NT + 1;
  const count = cols * rows;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const tangent = new Float32Array(count * 4);
  const uv = new Float32Array(count * 2);
  const fish = new Float32Array(count * 3);
  const rayT = new Float32Array(count);
  const baseS = new Float32Array(count);
  const { x, y, w, h } = def.rect;
  const e = 1e-3;
  for (let j = 0; j < rows; j++) {
    const t = j / NT;
    for (let i = 0; i < cols; i++) {
      const a = i / SUB;
      const idx = j * cols + i;
      const p = finSurface(def, a, t);
      const pa = sub(finSurface(def, Math.min(a + e, n - 1), t), finSurface(def, Math.max(a - e, 0), t));
      const pt = sub(finSurface(def, a, Math.min(t + e, 1)), finSurface(def, a, Math.max(t - e, 0)));
      let nn = nrm(cross(pa, pt));
      if (dot(nn, def.normal) < 0) nn = mul(nn, -1);
      const nO = dirToObject(nn);
      let tO = dirToObject(nrm(pa));
      tO = nrm(sub(tO, mul(nO, dot(nO, tO))));
      const bDesired = dirToObject(mul(pt, -1));
      const wsign = dot(cross(nO, tO), bDesired) >= 0 ? 1 : -1;
      position.set(toObject(p), idx * 3);
      fish.set(p, idx * 3);
      rayT[idx] = t;
      baseS[idx] = finSurface(def, a, 0)[0];
      normal.set(nO, idx * 3);
      tangent.set([tO[0], tO[1], tO[2], wsign], idx * 4);
      uv[idx * 2] = (x + INSET + (a / (n - 1)) * (w - 2 * INSET)) / ATLAS;
      uv[idx * 2 + 1] = (y + INSET + t * (h - 2 * INSET)) / ATLAS;
    }
  }
  const tris = [];
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = j * cols + i + 1, c = (j + 1) * cols + i + 1, d = (j + 1) * cols + i;
      tris.push(a, b, c, a, c, d);
    }
  // orient winding to agree with normals
  {
    const j = Math.floor(rows / 2), i = Math.floor(cols / 2);
    const a = j * cols + i, b = j * cols + i + 1, c = (j + 1) * cols + i + 1;
    const P = (k) => [position[k * 3], position[k * 3 + 1], position[k * 3 + 2]];
    const fn = cross(sub(P(b), P(a)), sub(P(c), P(a)));
    if (dot(fn, [normal[a * 3], normal[a * 3 + 1], normal[a * 3 + 2]]) < 0) {
      for (let k = 0; k < tris.length; k += 3) { const tmp = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = tmp; }
    }
  }
  return { position, normal, tangent, uv, indices: new Uint32Array(tris), fish, rayT, baseS };
}

// ---------------------------------------------------------------------------
// Atlas painting

export function paintFinAtlas(defs, log = () => {}) {
  const S = ATLAS;
  const color = new Uint8Array(S * S * 4);
  const data = new Uint8Array(S * S * 4);
  const normal = new Uint8Array(S * S * 3);
  const H = new Float32Array(S * S);
  const DU = new Float32Array(S * S).fill(0.01);
  const DV = new Float32Array(S * S).fill(0.01);
  for (let i = 0; i < S * S; i++) { normal[i * 3] = 128; normal[i * 3 + 1] = 128; normal[i * 3 + 2] = 255; }
  const srgb = (c) => { c = clamp(c); return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); };
  const painted = new Set();

  for (const def of defs) {
    const key = `${def.rect.x},${def.rect.y}`;
    if (painted.has(key)) continue;
    painted.add(key);
    log(`    atlas: ${def.name}`);
    const R = def.rays;
    const n = R.length;
    const { x, y, w, h } = def.rect;
    const iw = w - 2 * INSET, ih = h - 2 * INSET;
    // precompute spacing per ray interval at sampled t
    const NTS = 64;
    const spacing = [];
    for (let k = 0; k < n - 1; k++) {
      const row = new Float32Array(NTS + 1);
      for (let j = 0; j <= NTS; j++) {
        const t = j / NTS;
        row[j] = Math.max(Math.hypot(...sub(rayPoint(def, R[k + 1], t), rayPoint(def, R[k], t))), 0.02);
      }
      spacing.push(row);
    }
    const spAt = (a, t) => {
      const k = clamp(Math.floor(a), 0, n - 2);
      const jt = clamp(t, 0, 1) * NTS;
      const j0 = Math.floor(jt), j1 = Math.min(j0 + 1, NTS), f = jt - j0;
      return spacing[k][j0] * (1 - f) + spacing[k][j1] * f;
    };
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++) {
        const a = clamp(((px + 0.5 - x - INSET) / iw) * (n - 1), 0, n - 1);
        const tRaw = (py + 0.5 - y - INSET) / ih;
        const t = clamp(tRaw, 0, 1);
        const sp = spAt(a, t);
        const kNear = Math.round(a);
        const fAcross = a / (n - 1);
        // rays (with branching)
        let rayD = 0, dRay = 1e9, jointAll = 0;
        let rNear = kNear;
        for (let r = Math.max(0, kNear - 1); r <= Math.min(n - 1, kNear + 1); r++) {
          const ray = R[r];
          if (ray.kind === 'frenum') continue;
          const soft = ray.kind === 'soft';
          const width0 = ray.width ?? (soft ? 0.062 : 0.09);
          const width = width0 * (1 - (soft ? 0.55 : 0.7) * t);
          const centers = [];
          if (soft && !ray.simple && t > def.branchT && r > 0 && r < n - 1) {
            const d1 = 0.17 * smoothstep(def.branchT, def.branchT + 0.3, t);
            if (def.name === 'Fin_Caudal' && t > 0.8) {
              const d2 = 0.06 * smoothstep(0.8, 0.95, t);
              centers.push([r - d1 - d2, 0.55], [r - d1 + d2, 0.55], [r + d1 - d2, 0.55], [r + d1 + d2, 0.55]);
            } else centers.push([r - d1, 0.72], [r + d1, 0.72]);
          } else centers.push([r, 1]);
          for (const [ac, wf] of centers) {
            const dmm = Math.abs(a - ac) * sp;
            const ww = width * wf;
            let dens = Math.exp(-((dmm / (0.5 * ww)) ** 2));
            if (soft && t > def.segStart) {
              const Lr = t * ray.len;
              const ph = Lr / 0.27 + r * 0.37;
              const fr = ph - Math.floor(ph);
              const joint = Math.exp(-(((fr - 0.5) / 0.07) ** 2));
              dens *= 1 - 0.32 * joint;
              jointAll = Math.max(jointAll, joint * dens);
            }
            if (dens > rayD) rayD = dens;
            if (dmm < dRay) { dRay = dmm; rNear = r; }
          }
        }
        // membrane coverage with notched / frayed edge
        const fr = a - Math.floor(a);
        const L = R[clamp(Math.round(a), 0, n - 1)].len;
        let edge = 1 - def.notch * Math.pow(Math.sin(Math.PI * fr), 0.85);
        // free filament: the membrane stops well below the tip of an elongated spine (male D1 spine 2)
        if (def.membrane) {
          const k0 = clamp(Math.floor(a), 0, n - 2), f0 = a - k0;
          const reach = def.membrane[k0] * (1 - f0) + def.membrane[k0 + 1] * f0;
          edge = Math.min(edge, reach / Math.max(rayLenAt(def, a), 1e-3) - def.notch * 0.6 * Math.pow(Math.sin(Math.PI * fr), 0.85));
        }
        edge -= (0.035 / Math.max(L, 1)) * (0.5 + 0.5 * perlin3(a * 5.3, 0.5, 1.7, 77)) + (0.02 / Math.max(L, 1)) * Math.abs(perlin3(a * 23, 3.1, 0.2, 78));
        const covM = smoothstep(edge + 0.004, edge - 0.004, tRaw);
        const covR = smoothstep(0.12, 0.35, rayD) * smoothstep(1.004, 0.996, tRaw);
        let cov = Math.max(covM, covR);
        if (tRaw < 0) cov = 1;
        // pigment
        const ray = R[rNear];
        const pg = def.pigment(rNear, n, t * ray.len, ray.len, t, dRay, fAcross);
        const mel = clamp(pg.mel, 0, 2), xan = clamp(pg.xan), irid = clamp(pg.irid), yel = clamp(pg.yel ?? 0);
        // colours (linear)
        let cr = mix(0.8, 0.78, rayD), cg = mix(0.78, 0.7, rayD), cb = mix(0.72, 0.52, rayD);
        // xantho/erythrophores: brick-red to orange-tan dots (live 014/001/018: R:G:B ≈ 1 : 0.35 : 0.27) [P]
        cr *= mix(1, 0.95, xan); cg *= mix(1, 0.47, xan); cb *= mix(1, 0.27, xan);
        // pale yellow tint (anal fin, lower caudal third, male D1 panels): xanthophores without erythrophores
        cr *= mix(1, 0.97, yel); cg *= mix(1, 0.9, yel); cb *= mix(1, 0.55, yel);
        cr = mix(cr, 0.9, irid * 0.5); cg = mix(cg, 0.9, irid * 0.5); cb = mix(cb, 0.88, irid * 0.5);
        cr *= Math.exp(-mel * 2.4); cg *= Math.exp(-mel * 2.8); cb *= Math.exp(-mel * 3.1);
        const o = (py * S + px) * 4;
        const opacity = clamp(0.2 + 0.5 * rayD + 0.75 * mel + 0.35 * xan + 0.2 * yel + 0.3 * irid);
        color[o] = srgb(cr); color[o + 1] = srgb(cg); color[o + 2] = srgb(cb); color[o + 3] = Math.round(cov * opacity * 255);
        data[o] = Math.round(rayD * 255); data[o + 1] = Math.round(Math.min(1, mel) * 255); data[o + 2] = Math.round(irid * 255); data[o + 3] = Math.round(cov * 255);
        // height (mm)
        const pi = py * S + px;
        H[pi] = 0.02 * rayD - 0.007 * jointAll + 0.0015 * perlin3(a * 40, t * 6, 0.3, 79) * (1 - rayD);
        DU[pi] = (sp * (n - 1)) / iw;
        DV[pi] = Math.max(ray.len, 0.5) / ih;
      }
  }
  // normals from height
  for (let py = 0; py < S; py++)
    for (let px = 0; px < S; px++) {
      const i = py * S + px;
      const xm = Math.max(px - 1, 0), xp = Math.min(px + 1, S - 1), ym = Math.max(py - 1, 0), yp = Math.min(py + 1, S - 1);
      const gx = (H[py * S + xp] - H[py * S + xm]) / ((xp - xm) * DU[i]);
      const gy = (H[ym * S + px] - H[yp * S + px]) / ((yp - ym) * DV[i]);
      let nx = -gx, ny = -gy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      normal[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255);
      normal[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      normal[i * 3 + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
    }
  return { size: S, color, data, normal };
}
