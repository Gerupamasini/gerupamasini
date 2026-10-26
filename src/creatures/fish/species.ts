import { countershade, fbm, hex, noise, paint, rays, shade, spots, tint } from './skin';
import { smooth, type FinId, type FinOut, type FishSpec, type SkinOut, type SkinSample } from './spec';

/**
 * The nine coastal fishes. Each outline is fitted to the mean silhouette of the species' photographs: 52–163 collected per
 * species, all segmented and aligned (snout → peduncle level, TL = 1), 8–26 clean lateral (マゴチ: dorsal) views chosen
 * and averaged, the dorsal / ventral tables corrected until the model's body follows them (tools/models/fish/measure/;
 * the photographs used and the medians in docs/models/fish/reference.json). Eyes, mouth, gill cover, fins and marks
 * were read off head close-ups set beside the model's. Proportions in shares of TL; what identifies each species at a
 * glance is noted.
 */

// ------------------------------------------------------------------------------------------------ fins
interface FinStyle {
  c: number;
  a: number;
  ray?: number;
  rayA?: number;
  edge?: number;
  edgeW?: number;
  edgeA?: number;
  spots?: { c: number; n: number; r: number; a?: number };
  base?: number;
  baseW?: number;
}

/** a fin painter: ray lines, membrane, a margin, spots, notches between the spines, a filament */
function finPainter(styles: Partial<Record<FinId, Partial<FinStyle>>> & { def: FinStyle }, counts: Record<FinId, number>, spines: Partial<Record<FinId, number>> = {}, filament?: { id: FinId; from: number; membrane: number }) {
  return (id: FinId, u: number, v: number, out: FinOut): void => {
    const st: FinStyle = { ...styles.def, ...(styles[id] ?? {}) };
    const n = counts[id];
    const r = rays(u, n, 0.28);
    const C = hex(st.c), R = hex(st.ray ?? st.c);
    out.r = C[0] + (R[0] - C[0]) * r; out.g = C[1] + (R[1] - C[1]) * r; out.b = C[2] + (R[2] - C[2]) * r;
    let a = st.a + ((st.rayA ?? Math.min(1, st.a + 0.25)) - st.a) * r;
    if (st.base !== undefined) tint(out, st.base, 1 - smooth(0, st.baseW ?? 0.3, v));
    if (st.spots) {
      const sp = spots(u * n * 0.5, v * 6, 1, st.spots.r, id.charCodeAt(0));
      tint(out, st.spots.c, sp * (st.spots.a ?? 0.85));
      a = Math.max(a, sp * 0.8);
    }
    if (st.edge !== undefined) {
      const e = smooth(1 - (st.edgeW ?? 0.15), 1 - 0.5 * (st.edgeW ?? 0.15), v);
      tint(out, st.edge, e);
      if (st.edgeA !== undefined) a = a + (st.edgeA - a) * e;
    }
    // spines: the membrane runs from each spine's tip down to the next spine's middle
    const k = spines[id] ?? 0;
    const f = u * (n - 1);
    if (k > 0 && f < k - 0.5) {
      const d = f - Math.floor(f);
      const lim = 1 - 0.42 * d;
      if (v > lim && r < 0.6) a = 0;
    }
    if (filament && filament.id === id && u > filament.from) {
      // past the membrane only the last ray goes on (コノシロ's filament)
      const lim = filament.membrane;
      if (v > lim && u < 0.985) a = 0;
    }
    // the free margin thins out
    a *= 1 - smooth(0.92, 1.0, v) * (r > 0.5 ? 0.4 : 1);
    // (fins read as solid at a distance: the membrane is thin but pigmented)
    out.a = Math.min(0.95, a * (id === 'p' ? 1.15 : 1.45));
  };
}

// ------------------------------------------------------------------------------------------------ skin helpers
/** a lateral line: a thin line following the back at height `h0` (+ arched at the front) */
function lateralLine(p: SkinSample, h0: number, arch = 0, w = 0.03): number {
  const target = h0 + arch * Math.exp(-(((p.s - 0.3) / 0.18) ** 2));
  return (1 - smooth(w * 0.5, w, Math.abs(p.h - target))) * smooth(0.22, 0.3, p.s) * (1 - smooth(0.82, 0.86, p.s));
}

/** fine mottling of the skin (0..1 around 0.5) */
const mottle = (p: SkinSample, scale: number, seed: number) => fbm(p.s * scale, p.phi * scale * 0.16, seed, 3);

/** dark scale-row dots: one at the base of each scale (メジナ, コノシロ) */
function scaleDots(p: SkinSample, along: number, rows: number, r: number, seed: number): number {
  const x = p.s * along, y = (p.h * 0.5 + 0.5) * rows;
  const fx = x - Math.floor(x + ((Math.floor(y) & 1) ? 0.5 : 0)), fy = y - Math.floor(y);
  const d = Math.hypot(fx - 0.5, (fy - 0.5) * 1.2);
  void seed;
  return 1 - smooth(r * 0.6, r, d);
}

function eyeRim(p: SkinSample, s: number, y: number, r: number): number {
  return Math.exp(-(((p.s - s) / (r * 1.6)) ** 2) - (((p.y - y) / (r * 1.6)) ** 2));
}

// ------------------------------------------------------------------------------------------------ スズキ
/**
 * スズキ (Lateolabrax japonicus), the セイゴ / フッコ of the bay: an elongate, compressed perch (depth 0.22 TL) with a
 * long head (0.28 TL) and a pointed snout, a large terminal mouth whose lower jaw juts and whose maxilla reaches under
 * the eye, a moderate eye high on the head; two dorsals just touching (12 spines, then the soft), a slightly forked
 * tail; a serrate preopercle and an opercle with a dark edge; blue-grey olive back, bright silver flanks, small
 * black spots scattered on the back and the dorsal fins of the young.
 */
const SUZUKI: FishSpec = {
  id: 'suzuki', sizeClass: 'XL', modelTL: 0.4, depth: 0.22, pivot: 0.36, caudalBase: 0.8, headJoint: 0.2,
  top: [[0, 0.002], [0.02, 0.017], [0.05, 0.0334], [0.1, 0.059], [0.15, 0.0765], [0.2, 0.0929], [0.3, 0.1045], [0.4, 0.1008], [0.5, 0.0871], [0.6, 0.0734], [0.7, 0.0497], [0.8, 0.0333]],
  bot: [[0, 0.0094], [0.02, 0.0235], [0.05, 0.0384], [0.1, 0.0656], [0.15, 0.0821], [0.2, 0.0936], [0.3, 0.1079], [0.4, 0.1135], [0.5, 0.1045], [0.6, 0.0908], [0.7, 0.0806], [0.8, 0.0395]],
  width: [[0, 0.01125], [0.02, 0.02363], [0.05, 0.0315], [0.1, 0.0434], [0.15, 0.051], [0.2, 0.05655], [0.3, 0.0588], [0.4, 0.05638], [0.5, 0.0481], [0.6, 0.036], [0.7, 0.021], [0.8, 0.01406]],
  nTop: [[0, 2.1], [0.3, 2.0], [0.8, 2.0]], nBot: [[0, 2.2], [0.3, 2.0], [0.8, 2.0]],
  snoutCap: 0.025,
  eyes: [{ s: 0.1, y: 0.024, r: 0.022, bulge: 0.007, pupil: 0.55, iris: [0xd8cc98, 0x9a8a60], rim: 0x1e2020 }],
  mouth: { corner: 0.105, gape: [[0, -0.002], [0.05, -0.012], [0.105, -0.03]], open: 0.6, inside: 0.75 },
  oper: { s: 0.27, sweep: 0.025, top: 0.085, bot: 0.09, step: 0.003 },
  fins: {
    median: [
      { id: 'd1', s0: 0.29, s1: 0.45, len: [[0, 0.04], [0.15, 0.1], [0.35, 0.11], [0.7, 0.06], [1, 0.025]], rake: [0.35, 0.6], rays: 12, spines: 12 },
      { id: 'd2', s0: 0.47, s1: 0.64, len: [[0, 0.07], [0.15, 0.08], [0.5, 0.065], [1, 0.035]], rake: [0.6, 0.95], rays: 13 },
      { id: 'a', s0: 0.56, s1: 0.66, len: [[0, 0.03], [0.25, 0.05], [0.6, 0.042], [1, 0.025]], rake: [0.6, 0.95], rays: 10, spines: 3 },
    ],
    caudal: { len: 0.205, centre: 0.6, tip: 1, p: 1.4, spread: 0.22, rays: 17, base: 1.05 },
    pectoral: { s: 0.275, y: -0.03, base: 0.04, len: [[0, 0.12], [0.3, 0.14], [1, 0.06]], dirs: [0.12, -0.5], rest: 0.25, rays: 16 },
    pelvic: { s: 0.27, y: 0, base: 0.03, len: [[0, 0.12], [1, 0.07]], dirs: [0.35, 0.05], rest: 0.5, rays: 6 },
  },
  scales: { along: 76, around: 40, depth: 0.35 },
  wet: 0.6,
  skin(p, o) {
    countershade(o, p.h, 0x56636c, 0xbfc6ca, 0xeef0ee, 0.42, -0.4, 0.2);
    o.metal = 0.25 + 0.45 * (1 - smooth(0.3, 0.7, p.h)) * smooth(-0.9, -0.3, p.h);
    o.rough = 0.34 + 0.12 * smooth(0.3, 0.8, p.h);
    shade(o, 0.92 + 0.16 * mottle(p, 40, 1));
    // young fish: small black spots over the back
    const sp = spots(p.s * 60, p.phi * 9.5, 1, 0.22, 3, 0.4, 0.45) * smooth(0.15, 0.45, p.h) * smooth(0.12, 0.2, p.s);
    tint(o, 0x1e2226, 0.55 * sp);
    tint(o, 0x2e3438, 0.45 * lateralLine(p, 0.5, 0.06));
    // the crown and snout darker, the cheek silver
    tint(o, 0x3e464c, 0.4 * smooth(0.3, 0.8, p.h) * (1 - smooth(0.1, 0.25, p.s)));
    tint(o, 0x24282a, 0.35 * eyeRim(p, 0.1, 0.024, 0.022));
  },
  fin: finPainter({
    def: { c: 0x8a9096, a: 0.55, ray: 0x5e666e, rayA: 0.85 },
    d1: { c: 0x5e666c, a: 0.7, spots: { c: 0x1e2226, n: 1, r: 0.18, a: 0.6 } },
    d2: { c: 0x5e666c, a: 0.7, spots: { c: 0x1e2226, n: 1, r: 0.15, a: 0.45 } },
    c: { c: 0x7a8288, edge: 0x3a4248, edgeW: 0.18, a: 0.6 },
    p: { c: 0xb8bcc0, a: 0.35, rayA: 0.6 },
    v: { c: 0xe8e8e4, a: 0.55 },
    a: { c: 0xd8dad8, a: 0.55 },
  }, { d1: 12, d2: 13, a: 10, c: 17, p: 16, v: 6 }, { d1: 12, a: 3 }),
  swim: { lambda: 1.0, env: [0.15, -0.5, 1.3], amp: 0.09, stride: 0.65 },
  behavior: { habit: 'cruiser', forage: 'hunt', cruise: 0.9, burst: 8, level: 0.45, minLift: 0.4, school: 0.25, spacing: 2.2, extras: ['strike'] },
};

// ------------------------------------------------------------------------------------------------ メジナ
/**
 * メジナ (Girella punctata), the young of the rocky shore pools: a deep oval body (depth 0.36 TL, the back higher than
 * the belly is deep, the long dorsal and anal fins a large share of the outline) with a short head, a
 * blunt rounded snout and a small terminal mouth, a large eye; one long dorsal (14 spines, then the soft), a slightly
 * forked tail on a deep peduncle; dark olive-grey with a dark dot at the base of every scale in rows (punctata), the
 * gill cover's free edge black, dusky fins.
 */
const MEJINA: FishSpec = {
  id: 'mejina', sizeClass: 'L', modelTL: 0.2, depth: 0.36, pivot: 0.38, caudalBase: 0.77, headJoint: 0.18,
  top: [[0, 0.015], [0.02, 0.04], [0.05, 0.07], [0.1, 0.11], [0.15, 0.14], [0.2, 0.162], [0.3, 0.198], [0.4, 0.185], [0.5, 0.155], [0.6, 0.115], [0.7, 0.085], [0.77, 0.065]],
  bot: [[0, 0.015], [0.02, 0.033], [0.05, 0.06], [0.1, 0.09], [0.15, 0.115], [0.2, 0.135], [0.3, 0.165], [0.4, 0.165], [0.5, 0.145], [0.6, 0.12], [0.7, 0.082], [0.77, 0.06]],
  width: [[0, 0.012], [0.02, 0.022], [0.05, 0.03375], [0.1, 0.047], [0.15, 0.05415], [0.2, 0.06197], [0.3, 0.0684], [0.4, 0.06912], [0.5, 0.06105], [0.6, 0.0465], [0.7, 0.027], [0.77, 0.01688]],
  nTop: [[0, 2.1], [0.5, 2.0]], nBot: [[0, 2.1], [0.5, 2.0]],
  snoutCap: 0.03,
  eyes: [{ s: 0.1, y: 0.035, r: 0.03, bulge: 0.009, pupil: 0.55, iris: [0x6a8c8c, 0x2c3a3c], rim: 0x141818 }],
  mouth: { corner: 0.045, gape: [[0, -0.012], [0.045, -0.02]], open: 0.5, inside: 0.35 },
  oper: { s: 0.24, sweep: 0.03, top: 0.15, bot: 0.13, step: 0.004 },
  fins: {
    median: [
      { id: 'd1', s0: 0.3, s1: 0.52, len: [[0, 0.03], [0.4, 0.045], [1, 0.06]], rake: [0.5, 0.75], rays: 14, spines: 14 },
      { id: 'd2', s0: 0.52, s1: 0.72, len: [[0, 0.065], [0.4, 0.07], [1, 0.04]], rake: [0.75, 1.05], rays: 14 },
      { id: 'a', s0: 0.54, s1: 0.71, len: [[0, 0.04], [0.5, 0.075], [1, 0.06]], rake: [0.7, 1.05], rays: 14, spines: 3 },
    ],
    caudal: { len: 0.235, centre: 0.78, tip: 1, p: 1.3, spread: 0.2, rays: 17, base: 1.0 },
    pectoral: { s: 0.27, y: -0.03, base: 0.06, len: [[0, 0.12], [0.3, 0.13], [1, 0.05]], dirs: [0.2, -0.6], rest: 0.3, rays: 18 },
    pelvic: { s: 0.3, y: 0, base: 0.03, len: [[0, 0.11], [1, 0.06]], dirs: [0.35, 0.05], rest: 0.5, rays: 6 },
  },
  scales: { along: 55, around: 46, depth: 0.4 },
  wet: 0.55,
  skin(p, o) {
    countershade(o, p.h, 0x3c423c, 0x5c645c, 0x8e968e, 0.4, -0.45, 0.35);
    o.metal = 0.12; o.rough = 0.48;
    shade(o, 0.9 + 0.2 * mottle(p, 30, 2));
    // a dark dot at the base of each scale, in rows along the body
    const d = scaleDots(p, 55, 26, 0.32, 1) * smooth(0.2, 0.28, p.s) * (1 - smooth(-0.6, -0.9, p.h) * 0.6);
    tint(o, 0x1e2220, 0.4 * d * (0.6 + 0.4 * noise(p.s * 55, p.h * 13, 4)));
    // the gill cover's free margin black
    const edge = 0.24 - 0.03 * p.h * p.h;
    tint(o, 0x0e1010, 0.55 * (1 - smooth(0.0, 0.006, Math.abs(p.s - edge + 0.003))) * (Math.abs(p.h) < 0.75 ? 1 : 0));
    tint(o, 0x1a1e1c, 0.3 * eyeRim(p, 0.1, 0.035, 0.03));
  },
  fin: finPainter({
    def: { c: 0x2e3430, a: 0.75, ray: 0x1e2220, rayA: 0.95 },
    p: { c: 0x8a9088, a: 0.35, rayA: 0.6 },
    c: { c: 0x3e4640, a: 0.65, edge: 0x1c201e, edgeW: 0.1 },
  }, { d1: 14, d2: 14, a: 14, c: 17, p: 18, v: 6 }, { d1: 14, a: 3 }),
  swim: { lambda: 1.05, env: [0.2, -0.6, 1.3], amp: 0.07, stride: 0.6 },
  behavior: { habit: 'reef', forage: 'pick', cruise: 0.8, burst: 7, level: 0.3, minLift: 0.25, school: 0.45, spacing: 1.6, extras: [] },
};

// ------------------------------------------------------------------------------------------------ シロギス
/**
 * シロギス (Sillago japonica): slender and nearly round (depth 0.15 TL) with a long conical snout and a small mouth
 * a little under its tip, a large eye high on the head; a tall triangular spiny first dorsal and a long soft second
 * over a long anal fin; pale sandy, translucent above, pearly below; yellowish transparent fins, the second dorsal with
 * rows of faint dots.
 */
const KISU: FishSpec = {
  id: 'kisu', sizeClass: 'L', modelTL: 0.2, depth: 0.15, pivot: 0.38, caudalBase: 0.83, headJoint: 0.2,
  top: [[0, 0.0064], [0.02, 0.0146], [0.05, 0.0335], [0.1, 0.0533], [0.2, 0.0807], [0.3, 0.0903], [0.4, 0.0889], [0.5, 0.0856], [0.6, 0.073], [0.7, 0.0542], [0.83, 0.0258]],
  bot: [[0, 0.0145], [0.02, 0.0207], [0.05, 0.0336], [0.1, 0.0422], [0.2, 0.0577], [0.3, 0.0646], [0.4, 0.0685], [0.5, 0.0626], [0.6, 0.0559], [0.7, 0.0503], [0.83, 0.037]],
  width: [[0, 0.009], [0.02, 0.02025], [0.05, 0.034], [0.1, 0.046], [0.2, 0.05655], [0.3, 0.05738], [0.4, 0.05513], [0.5, 0.049], [0.6, 0.0372], [0.7, 0.02475], [0.83, 0.01475]],
  nTop: [[0, 2.0], [0.5, 2.0]], nBot: [[0, 2.0], [0.4, 2.2]],
  snoutCap: 0.012,
  eyes: [{ s: 0.115, y: 0.018, r: 0.019, bulge: 0.007, pupil: 0.55, iris: [0xe8e0c8, 0xa09880], rim: 0x2a2620 }],
  mouth: { corner: 0.05, gape: [[0, 0.0], [0.05, -0.008]], open: 0.5, inside: 0.6 },
  oper: { s: 0.23, sweep: 0.02, top: 0.05, bot: 0.05, step: 0.002 },
  fins: {
    median: [
      { id: 'd1', s0: 0.3, s1: 0.42, len: [[0, 0.05], [0.2, 0.086], [0.5, 0.06], [1, 0.02]], rake: [0.35, 0.7], rays: 11, spines: 11 },
      { id: 'd2', s0: 0.45, s1: 0.75, len: [[0, 0.05], [0.2, 0.055], [1, 0.035]], rake: [0.7, 1.0], rays: 21 },
      { id: 'a', s0: 0.47, s1: 0.76, len: [[0, 0.035], [0.2, 0.045], [1, 0.03]], rake: [0.7, 1.0], rays: 23, spines: 2 },
    ],
    caudal: { len: 0.175, centre: 0.75, tip: 1, p: 1.3, spread: 0.23, rays: 17, base: 1.1 },
    pectoral: { s: 0.265, y: 0.0, base: 0.025, len: [[0, 0.1], [0.4, 0.11], [1, 0.05]], dirs: [0.1, -0.4], rest: 0.25, rays: 16 },
    pelvic: { s: 0.3, y: 0, base: 0.02, len: [[0, 0.09], [1, 0.05]], dirs: [0.35, 0.05], rest: 0.5, rays: 6 },
  },
  scales: { along: 70, around: 30, depth: 0.25 },
  wet: 0.65,
  skin(p, o) {
    countershade(o, p.h, 0xa8916a, 0xd2c8b0, 0xf2efe6, 0.35, -0.35, 0.3);
    o.metal = 0.15 + 0.35 * (1 - smooth(0.2, 0.6, p.h)) * smooth(-0.9, -0.2, p.h);
    o.rough = 0.38;
    shade(o, 0.94 + 0.1 * mottle(p, 50, 3));
    // a faint silvery band along the mid-flank and the lateral line
    tint(o, 0xf0ece0, 0.25 * (1 - smooth(0.05, 0.2, Math.abs(p.h - 0.05))) * smooth(0.25, 0.35, p.s));
    tint(o, 0xa89470, 0.35 * lateralLine(p, 0.55, 0.05, 0.025));
    tint(o, 0x9a8460, 0.3 * smooth(0.5, 0.9, p.h) * (1 - smooth(0.02, 0.1, p.s)));
  },
  fin: finPainter({
    def: { c: 0xe8dcae, a: 0.32, ray: 0xd8c890, rayA: 0.6 },
    d1: { c: 0xe8e0c0, a: 0.3, edge: 0x8a7a5a, edgeW: 0.12 },
    d2: { spots: { c: 0x8a7656, n: 1, r: 0.14, a: 0.6 } },
    c: { c: 0xd8cca0, edge: 0x7a6a50, edgeW: 0.12, a: 0.38 },
    v: { c: 0xf0e4b0, a: 0.55 },
    a: { c: 0xf0e0b0, a: 0.5 },
  }, { d1: 11, d2: 21, a: 23, c: 17, p: 16, v: 6 }, { d1: 11, a: 2 }),
  swim: { lambda: 0.95, env: [0.15, -0.55, 1.4], amp: 0.09, stride: 0.65 },
  behavior: { habit: 'sandForager', forage: 'dig', cruise: 0.9, burst: 9, level: 0.06, minLift: 0.12, school: 0.3, spacing: 2.2, extras: ['bury', 'rest'] },
};

// ------------------------------------------------------------------------------------------------ マゴチ
/**
 * マゴチ (Platycephalus sp. 2): a flathead. The head is flat and wide (0.2 TL across, 0.06 deep) with a broad rounded
 * snout, a wide terminal mouth whose lower jaw juts, small eyes on top looking up; the body tapers from the depressed
 * front to a compressed tail; two dorsals, large fan pectorals and wide-set pelvics it props on, a truncate tail;
 * sandy brown above finely spotted with dark brown and a few faint saddles, white below, the tail barred.
 */
const MAGOCHI: FishSpec = {
  id: 'magochi', sizeClass: 'XL', modelTL: 0.45, depth: 0.09, pivot: 0.36, caudalBase: 0.86, headJoint: 0.22,
  top: [[0, 0.008], [0.03, 0.013], [0.1, 0.023], [0.18, 0.033], [0.3, 0.043], [0.4, 0.049], [0.5, 0.047], [0.6, 0.042], [0.7, 0.035], [0.8, 0.028], [0.86, 0.026]],
  bot: [[0, 0.006], [0.03, 0.01], [0.1, 0.017], [0.2, 0.027], [0.3, 0.036], [0.4, 0.041], [0.5, 0.04], [0.6, 0.035], [0.7, 0.028], [0.8, 0.024], [0.86, 0.022]],
  width: [[0, 0.02], [0.02, 0.04], [0.05, 0.06], [0.1, 0.08], [0.18, 0.095], [0.25, 0.1], [0.32, 0.09], [0.42, 0.075], [0.55, 0.062], [0.7, 0.04], [0.8, 0.028], [0.86, 0.02]],
  nTop: [[0, 3.0], [0.3, 2.7], [0.5, 2.1], [0.8, 2.0]], nBot: [[0, 3.2], [0.3, 3.0], [0.6, 2.1], [0.8, 2.0]],
  snoutCap: 0.02,
  eyes: [{ s: 0.128, y: 0.03, r: 0.016, bulge: 0.009, pupil: 0.5, iris: [0xbaa478, 0x5a4a32], rim: 0x2a2218, up: 0.75, fwd: 0.1 }],
  mouth: { corner: 0.11, gape: [[0, 0.008], [0.05, 0.0], [0.11, -0.006]], open: 0.55, inside: 0.6 },
  oper: { s: 0.3, sweep: 0.03, top: 0.035, bot: 0.03, step: 0.003 },
  fins: {
    median: [
      { id: 'd1', s0: 0.31, s1: 0.4, len: [[0, 0.028], [0.2, 0.05], [1, 0.012]], rake: [0.5, 0.85], rays: 9, spines: 9 },
      { id: 'd2', s0: 0.42, s1: 0.72, len: [[0, 0.045], [0.5, 0.045], [1, 0.03]], rake: [0.8, 1.05], rays: 13 },
      { id: 'a', s0: 0.43, s1: 0.72, len: [[0, 0.04], [1, 0.03]], rake: [0.8, 1.05], rays: 13 },
    ],
    caudal: { len: 0.14, centre: 1.0, tip: 0.84, p: 2, spread: 0.55, rays: 15, base: 1.2 },
    pectoral: { s: 0.31, y: -0.02, base: 0.04, len: [[0, 0.055], [0.4, 0.075], [1, 0.055]], dirs: [0.3, -0.9], rest: 0.2, roll: 1.3, rays: 19 },
    pelvic: { s: 0.33, y: 0, base: 0.03, len: [[0, 0.12], [0.5, 0.13], [1, 0.09]], dirs: [0.65, 0.1], rest: 1.4, rays: 6 },
  },
  scales: { along: 85, around: 34, depth: 0.28 },
  wet: 0.5,
  skin(p, o) {
    // seen from above it is the sand: brown, finely dark-spotted, a few faint saddles; white below
    const up = smooth(-0.55, -0.1, p.h);
    paint(o, 0xf0ece2, 0x8c7c62, up);
    shade(o, 0.88 + 0.24 * mottle(p, 26, 4));
    const sp = spots(p.s * 140, p.phi * 22, 1, 0.3, 5, 0.45, 0.7) * up;
    tint(o, 0x3a2e22, 0.75 * sp);
    const saddle = smooth(0.55, 0.85, 0.5 + 0.5 * Math.sin(p.s * 38 + 1.2)) * smooth(0.35, 0.45, p.s) * up;
    tint(o, 0x56442e, 0.4 * saddle);
    // the head's bony ridges catch the light as pale lines
    const ridge = (1 - smooth(0.004, 0.01, Math.abs(p.h - 0.5))) * (1 - smooth(0.2, 0.3, p.s));
    tint(o, 0xb8a888, 0.4 * ridge);
    o.metal = 0.05; o.rough = 0.55 - 0.1 * (1 - up);
  },
  fin: finPainter({
    def: { c: 0xa49478, a: 0.5, ray: 0x6a5a44, rayA: 0.85, spots: { c: 0x2e241a, n: 1, r: 0.22, a: 0.7 } },
    c: { c: 0x9a8a70, spots: { c: 0x221a12, n: 1, r: 0.3, a: 0.8 }, edge: 0x2a2018, edgeW: 0.1 },
    p: { c: 0xb0a080, a: 0.55 },
    v: { c: 0xece6da, a: 0.5, spots: undefined },
    a: { c: 0xe8e2d4, a: 0.45, spots: undefined, edge: 0x6a5a48, edgeW: 0.15 },
  }, { d1: 9, d2: 13, a: 13, c: 15, p: 19, v: 6 }, { d1: 9 }),
  swim: { lambda: 0.85, env: [0.25, -0.5, 1.2], amp: 0.1, stride: 0.55 },
  behavior: { habit: 'ambusher', forage: 'ambush', cruise: 0.6, burst: 6, level: 0, minLift: 0, school: 0, spacing: 3, extras: ['bury', 'strike', 'rest'] },
};

// ------------------------------------------------------------------------------------------------ ヒラメ
/**
 * ヒラメ (Paralichthys olivaceus): a left-eyed flatfish (左ヒラメ) lying on its blind right side. Oval-elongate (depth
 * 0.36 TL without the fins), a big mouth with the lower jaw a little forward, the gape reaching under the eyes (unlike
 * a カレイ's small mouth); the dorsal fin begins in front of the upper eye; the tail rounded; the eyed side olive brown,
 * mottled, with small white spots and a few dark ocelli; the blind side white.
 */
const HIRAME: FishSpec = {
  id: 'hirame', sizeClass: 'XL', modelTL: 0.35, depth: 0.36, pivot: 0.4, caudalBase: 0.78, headJoint: 0.2, flat: 1,
  top: [[0, 0.025], [0.02, 0.035], [0.05, 0.05], [0.1, 0.08], [0.2, 0.12], [0.3, 0.14], [0.4, 0.145], [0.5, 0.135], [0.6, 0.11], [0.7, 0.07], [0.78, 0.044]],
  bot: [[0, 0.025], [0.02, 0.035], [0.05, 0.05], [0.1, 0.08], [0.2, 0.11], [0.3, 0.13], [0.4, 0.135], [0.5, 0.12], [0.6, 0.09], [0.7, 0.055], [0.78, 0.04]],
  width: [[0, 0], [0.04, 0.02], [0.1, 0.038], [0.2, 0.046], [0.35, 0.048], [0.5, 0.043], [0.65, 0.033], [0.78, 0.02], [0.84, 0.014]],
  widthR: [[0, 0], [0.04, 0.013], [0.1, 0.022], [0.2, 0.028], [0.35, 0.029], [0.5, 0.026], [0.65, 0.02], [0.78, 0.012], [0.84, 0.009]],
  nTop: [[0, 1.8], [0.3, 1.55], [0.8, 1.6]], nBot: [[0, 1.8], [0.3, 1.55], [0.8, 1.6]],
  snoutCap: 0.03,
  eyes: [
    { s: 0.088, y: -0.012, r: 0.02, bulge: 0.012, pupil: 0.55, iris: [0xc8ac60, 0x6a5430], rim: 0x221a12, side: 1, fwd: 0.05 },
    { s: 0.07, y: 0.035, r: 0.02, bulge: 0.012, pupil: 0.55, iris: [0xc8ac60, 0x6a5430], rim: 0x221a12, side: 1, fwd: 0.05 },
  ],
  mouth: { corner: 0.11, gape: [[0, -0.004], [0.11, -0.035]], open: 0.65, inside: 0.7 },
  oper: { s: 0.24, sweep: 0.03, top: 0.11, bot: 0.1, step: 0.002 },
  fins: {
    median: [
      { id: 'd2', s0: 0.07, s1: 0.76, len: [[0, 0.028], [0.2, 0.058], [0.5, 0.074], [0.75, 0.06], [1, 0.03]], rake: [0.3, 0.7], rays: 76, ripple: 1 },
      { id: 'a', s0: 0.2, s1: 0.76, len: [[0, 0.04], [0.3, 0.085], [0.6, 0.085], [1, 0.035]], rake: [0.3, 0.7], rays: 58, ripple: 1 },
    ],
    caudal: { len: 0.225, centre: 1.0, tip: 0.9, p: 2, spread: 0.2, rays: 18, base: 1.1 },
    pectoral: { s: 0.24, y: 0.0, base: 0.02, len: [[0, 0.08], [1, 0.04]], dirs: [0.3, -0.3], rest: 0.1, rays: 11 },
    pelvic: { s: 0.22, y: 0, base: 0.02, len: [[0, 0.05], [1, 0.03]], dirs: [0.4, 0.1], rest: 0.3, rays: 6 },
  },
  scales: { along: 110, around: 64, depth: 0.2 },
  wet: 0.5,
  skin(p, o) {
    if (p.side < 0) {
      // the blind side: white, a little translucent at the fin bases
      paint(o, 0xf4f2ec, 0xe4e0d6, smooth(0.6, 0.95, Math.abs(p.h)));
      o.rough = 0.45; o.metal = 0.05;
      return;
    }
    paint(o, 0x6c5c40, 0x56482e, mottle(p, 18, 6));
    shade(o, 0.85 + 0.3 * fbm(p.s * 9, p.h * 3, 9, 3));
    const white = spots(p.s * 90, p.h * 30, 1, 0.22, 7, 0.4, 0.55);
    tint(o, 0xd8d0b4, 0.6 * white);
    const oc = spots(p.s * 12, p.h * 4, 1, 0.24, 11, 0.3, 0.5) * smooth(0.25, 0.32, p.s);
    tint(o, 0x2c2214, 0.55 * oc);
    o.rough = 0.55; o.metal = 0.04;
  },
  fin: finPainter({
    def: { c: 0x62523a, a: 0.7, ray: 0x4a3c28, rayA: 0.9, spots: { c: 0x1e160e, n: 1, r: 0.2, a: 0.6 } },
    c: { c: 0x5e4e38, edge: 0x2e2418, edgeW: 0.12 },
    p: { c: 0x6a5a40, a: 0.6, spots: undefined },
    v: { c: 0xe0dad0, a: 0.5, spots: undefined },
  }, { d1: 2, d2: 76, a: 58, c: 18, p: 11, v: 6 }),
  swim: { lambda: 0.9, env: [0.3, -0.4, 1.1], amp: 0.07, stride: 0.6 },
  behavior: { habit: 'flatfish', forage: 'ambush', cruise: 0.6, burst: 6, level: 0, minLift: 0, school: 0, spacing: 3, extras: ['bury', 'strike', 'rest'] },
};

// ------------------------------------------------------------------------------------------------ ボラ（成魚）
/**
 * ボラ (Mugil cephalus), the adult: elongate, round in front with a broad flat head and a short blunt snout, a small
 * terminal mouth, the eye half covered by a clear fatty eyelid; two widely separated dorsals (4 spines; then a soft
 * one over the anal), pectorals high on the flank with a blue-black spot at their base, a deeply forked tail; large
 * scales, the dark blue-grey back and the silver flanks lined with dark stripes along the scale rows.
 */
const BORA: FishSpec = {
  id: 'bora', sizeClass: 'XL', modelTL: 0.45, depth: 0.2, pivot: 0.36, caudalBase: 0.8, headJoint: 0.19,
  top: [[0, 0.0209], [0.02, 0.0306], [0.05, 0.0447], [0.1, 0.058], [0.15, 0.069], [0.2, 0.0734], [0.3, 0.0828], [0.4, 0.0816], [0.5, 0.083], [0.6, 0.064], [0.7, 0.0514], [0.8, 0.0413]],
  bot: [[0, 0.0148], [0.02, 0.0242], [0.05, 0.0426], [0.1, 0.0622], [0.15, 0.0762], [0.2, 0.0892], [0.3, 0.1044], [0.4, 0.1105], [0.5, 0.1026], [0.6, 0.0828], [0.7, 0.055], [0.8, 0.0437]],
  width: [[0, 0.018], [0.02, 0.026], [0.05, 0.04], [0.1, 0.05], [0.2, 0.058], [0.3, 0.06], [0.4, 0.058], [0.5, 0.05], [0.6, 0.04], [0.7, 0.03], [0.8, 0.021]],
  nTop: [[0, 2.8], [0.2, 2.4], [0.4, 2.0]], nBot: [[0, 2.1], [0.5, 2.0]],
  snoutCap: 0.03,
  eyes: [{ s: 0.056, y: 0.016, r: 0.022, bulge: 0.007, pupil: 0.55, iris: [0xe0d8b8, 0x9a9278], rim: 0x26282a, lid: 0.45 }],
  mouth: { corner: 0.04, gape: [[0, -0.004], [0.04, -0.012]], open: 0.45, inside: 0.45 },
  oper: { s: 0.205, sweep: 0.025, top: 0.075, bot: 0.085, step: 0.003 },
  fins: {
    median: [
      { id: 'd1', s0: 0.38, s1: 0.43, len: [[0, 0.09], [0.4, 0.078], [1, 0.032]], rake: [0.35, 0.7], rays: 4, spines: 4 },
      { id: 'd2', s0: 0.6, s1: 0.68, len: [[0, 0.08], [0.2, 0.074], [1, 0.03]], rake: [0.6, 0.95], rays: 9 },
      { id: 'a', s0: 0.6, s1: 0.69, len: [[0, 0.07], [0.2, 0.07], [1, 0.03]], rake: [0.6, 0.95], rays: 11, spines: 3 },
    ],
    caudal: { len: 0.206, centre: 0.4, tip: 1.0, p: 1.1, spread: 0.36, rays: 16, base: 1.1 },
    pectoral: { s: 0.22, y: 0.03, base: 0.025, len: [[0, 0.12], [0.3, 0.12], [1, 0.055]], dirs: [0.15, -0.4], rest: 0.2, rays: 16 },
    pelvic: { s: 0.32, y: 0, base: 0.025, len: [[0, 0.09], [1, 0.05]], dirs: [0.3, 0.0], rest: 0.4, rays: 6 },
  },
  scales: { along: 42, around: 30, depth: 0.45 },
  wet: 0.6,
  skin(p, o) {
    countershade(o, p.h, 0x4a585e, 0xbcc4c6, 0xeceeec, 0.45, -0.45, 0.2);
    o.metal = 0.2 + 0.5 * (1 - smooth(0.35, 0.75, p.h)) * smooth(-0.9, -0.3, p.h);
    o.rough = 0.32 + 0.15 * smooth(0.4, 0.8, p.h);
    shade(o, 0.93 + 0.12 * mottle(p, 36, 8));
    // dark stripes along the scale rows, strongest on the upper flank
    const st = Math.pow(0.5 + 0.5 * Math.cos(p.h * Math.PI * 7.5), 3) * smooth(-0.45, 0.0, p.h) * smooth(0.22, 0.3, p.s);
    tint(o, 0x3a4448, 0.42 * st);
    // the blue-black spot at the pectoral's base
    tint(o, 0x1c2430, 0.8 * Math.exp(-(((p.s - 0.252) / 0.012) ** 2) - (((p.y - 0.034) / 0.012) ** 2)));
    tint(o, 0x2e3438, 0.35 * eyeRim(p, 0.056, 0.016, 0.022));
  },
  fin: finPainter({
    def: { c: 0x7c868a, a: 0.55, ray: 0x5a6468, rayA: 0.85 },
    d1: { c: 0x5a6468, a: 0.65 },
    c: { c: 0x6e787c, edge: 0x3a4246, edgeW: 0.15, a: 0.6 },
    p: { c: 0x8a9294, a: 0.45 },
    v: { c: 0xe0dccc, a: 0.55 },
    a: { c: 0xd4d2c4, a: 0.55 },
  }, { d1: 4, d2: 9, a: 11, c: 16, p: 16, v: 6 }, { d1: 4, a: 3 }),
  swim: { lambda: 1.0, env: [0.15, -0.5, 1.3], amp: 0.085, stride: 0.7 },
  behavior: { habit: 'schooler', forage: 'graze', cruise: 1.0, burst: 8, level: 0.6, minLift: 0.5, school: 0.7, spacing: 1.6, extras: ['leap'] },
};

// ------------------------------------------------------------------------------------------------ サッパ
/**
 * サッパ (Sardinella zunasi): a small, strongly compressed herring (depth 0.23 TL, width a third of that) with a keel
 * of scutes along the belly, a small upturned mouth, a large eye with fatty eyelids, one dorsal at mid-body, a deeply
 * forked tail; blue-green back sharply over bright silver flanks; translucent fins, the tail yellowish with a dusky
 * edge.
 */
const SAPPA: FishSpec = {
  id: 'sappa', sizeClass: 'L', modelTL: 0.13, depth: 0.23, pivot: 0.38, caudalBase: 0.79, headJoint: 0.18,
  top: [[0, 0.0191], [0.02, 0.0307], [0.05, 0.0471], [0.1, 0.0685], [0.15, 0.083], [0.2, 0.0916], [0.3, 0.1019], [0.4, 0.104], [0.5, 0.0928], [0.6, 0.0716], [0.7, 0.0556], [0.79, 0.0365]],
  bot: [[0, 0.0111], [0.02, 0.0249], [0.05, 0.047], [0.1, 0.0766], [0.15, 0.0936], [0.2, 0.1097], [0.3, 0.1255], [0.4, 0.1254], [0.5, 0.1126], [0.6, 0.0904], [0.7, 0.0607], [0.79, 0.0373]],
  width: [[0, 0.0075], [0.02, 0.0132], [0.05, 0.0192], [0.1, 0.0273], [0.15, 0.033], [0.2, 0.039], [0.3, 0.04275], [0.4, 0.04347], [0.5, 0.0387], [0.6, 0.0289], [0.7, 0.0176], [0.79, 0.0105]],
  nTop: [[0, 2.0], [0.5, 2.0]], nBot: [[0, 2.0], [0.15, 1.4], [0.65, 1.4], [0.8, 2.0]],
  snoutCap: 0.022,
  eyes: [{ s: 0.078, y: 0.012, r: 0.025, bulge: 0.008, pupil: 0.55, iris: [0xe8e0c8, 0xa8a080], rim: 0x26282a, lid: 0.35 }],
  mouth: { corner: 0.055, gape: [[0, 0.004], [0.055, -0.01]], open: 0.6, inside: 0.4 },
  oper: { s: 0.18, sweep: 0.02, top: 0.1, bot: 0.095, step: 0.002 },
  fins: {
    median: [
      { id: 'd2', s0: 0.4, s1: 0.52, len: [[0, 0.08], [0.2, 0.084], [1, 0.024]], rake: [0.4, 0.85], rays: 17 },
      { id: 'a', s0: 0.68, s1: 0.78, len: [[0, 0.035], [1, 0.02]], rake: [0.6, 0.9], rays: 18 },
    ],
    caudal: { len: 0.216, centre: 0.48, tip: 1, p: 1.0, spread: 0.3, rays: 19, base: 1.1 },
    pectoral: { s: 0.18, y: -0.06, base: 0.02, len: [[0, 0.11], [1, 0.05]], dirs: [0.0, -0.5], rest: 0.15, rays: 15 },
    pelvic: { s: 0.45, y: 0, base: 0.015, len: [[0, 0.06], [1, 0.035]], dirs: [0.3, 0.0], rest: 0.4, rays: 8 },
  },
  scales: { along: 42, around: 26, depth: 0.3 },
  wet: 0.7,
  skin(p, o) {
    countershade(o, p.h, 0x2e525a, 0xd2d8dc, 0xf2f4f2, 0.5, -0.55, 0.1);
    o.metal = 0.2 + 0.65 * (1 - smooth(0.4, 0.62, p.h));
    o.rough = 0.24 + 0.14 * smooth(0.45, 0.7, p.h);
    shade(o, 0.95 + 0.1 * mottle(p, 40, 9));
    // a faint gold band where the back meets the silver
    tint(o, 0xc8c088, 0.25 * (1 - smooth(0.02, 0.1, Math.abs(p.h - 0.42))) * smooth(0.2, 0.3, p.s));
    // the scutes along the keel
    tint(o, 0xfafaf4, 0.4 * smooth(0.92, 0.99, -p.h) * (0.5 + 0.5 * Math.sin(p.s * 160)));
  },
  fin: finPainter({
    def: { c: 0xd0d0c8, a: 0.3, ray: 0xb8b8b0, rayA: 0.55 },
    d2: { c: 0x8a9a98, a: 0.45, edge: 0x4a5a5c, edgeW: 0.2 },
    c: { c: 0xd8c880, a: 0.5, ray: 0xc0b070, edge: 0x5a5a4a, edgeW: 0.14, edgeA: 0.75 },
  }, { d1: 2, d2: 17, a: 18, c: 19, p: 15, v: 8 }),
  swim: { lambda: 1.0, env: [0.15, -0.5, 1.35], amp: 0.09, stride: 0.7 },
  behavior: { habit: 'schooler', forage: 'filter', cruise: 1.6, burst: 12, level: 0.5, minLift: 0.5, school: 1.0, spacing: 1.1, extras: [] },
};

// ------------------------------------------------------------------------------------------------ コノシロ
/**
 * コノシロ (Konosirus punctatus): a gizzard shad, a little deeper than the サッパ (depth 0.26 TL), with a blunt snout
 * overhanging a small subterminal mouth, a keeled belly; the last dorsal ray drawn out into a long filament; a large
 * black spot behind the gill cover above the lateral line and rows of small dark dots along the upper flank; silver
 * with a golden head, yellowish fins and a deeply forked tail.
 */
const KONOSHIRO: FishSpec = {
  id: 'konoshiro', sizeClass: 'L', modelTL: 0.2, depth: 0.26, pivot: 0.38, caudalBase: 0.79, headJoint: 0.18,
  top: [[0, 0.0196], [0.02, 0.0322], [0.05, 0.0468], [0.1, 0.0711], [0.15, 0.0912], [0.2, 0.1057], [0.3, 0.1197], [0.4, 0.1244], [0.5, 0.112], [0.6, 0.08], [0.7, 0.0563], [0.79, 0.0329]],
  bot: [[0, 0.0218], [0.02, 0.0335], [0.05, 0.0472], [0.1, 0.0744], [0.15, 0.0928], [0.2, 0.1071], [0.3, 0.1288], [0.4, 0.1365], [0.5, 0.1208], [0.6, 0.0969], [0.7, 0.0626], [0.79, 0.0317]],
  width: [[0, 0.012], [0.02, 0.015], [0.05, 0.018], [0.1, 0.028], [0.15, 0.03705], [0.2, 0.0444], [0.3, 0.0522], [0.4, 0.05425], [0.5, 0.0493], [0.6, 0.0368], [0.7, 0.021], [0.79, 0.01064]],
  nTop: [[0, 2.1], [0.5, 2.0]], nBot: [[0, 2.0], [0.12, 1.35], [0.65, 1.35], [0.8, 2.0]],
  snoutCap: 0.035,
  eyes: [{ s: 0.075, y: 0.008, r: 0.021, bulge: 0.007, pupil: 0.55, iris: [0xe0d098, 0x9a8a60], rim: 0x26261e, lid: 0.45 }],
  mouth: { corner: 0.045, gape: [[0, -0.012], [0.045, -0.02]], open: 0.45, inside: 0.4 },
  oper: { s: 0.21, sweep: 0.025, top: 0.1, bot: 0.11, step: 0.002 },
  fins: {
    median: [
      { id: 'd2', s0: 0.4, s1: 0.52, len: [[0, 0.09], [0.2, 0.09], [0.85, 0.04], [0.93, 0.08], [1, 0.25]], rake: [0.5, 1.2], rays: 16 },
      { id: 'a', s0: 0.6, s1: 0.78, len: [[0, 0.04], [1, 0.02]], rake: [0.6, 0.9], rays: 22 },
    ],
    caudal: { len: 0.216, centre: 0.43, tip: 1, p: 1.0, spread: 0.32, rays: 19, base: 1.1 },
    pectoral: { s: 0.2, y: -0.08, base: 0.02, len: [[0, 0.1], [1, 0.045]], dirs: [0.0, -0.5], rest: 0.15, rays: 16 },
    pelvic: { s: 0.44, y: 0, base: 0.015, len: [[0, 0.06], [1, 0.03]], dirs: [0.3, 0.0], rest: 0.4, rays: 8 },
  },
  scales: { along: 52, around: 32, depth: 0.3 },
  wet: 0.7,
  skin(p, o) {
    countershade(o, p.h, 0x3e5a66, 0xcfd3d4, 0xf2f2ee, 0.5, -0.55, 0.15);
    o.metal = 0.2 + 0.6 * (1 - smooth(0.4, 0.65, p.h));
    o.rough = 0.26 + 0.12 * smooth(0.45, 0.7, p.h);
    shade(o, 0.95 + 0.1 * mottle(p, 40, 10));
    // the golden head and gill cover
    tint(o, 0xd8c288, 0.45 * (1 - smooth(0.15, 0.2, p.s)) * smooth(-0.6, -0.1, p.h) * (1 - smooth(0.4, 0.7, p.h)));
    // rows of dark dots along the upper flank
    const rows = scaleDots(p, 52, 16, 0.28, 2) * smooth(0.05, 0.2, p.h) * (1 - smooth(0.8, 0.95, p.h)) * smooth(0.24, 0.3, p.s);
    tint(o, 0x2a3034, 0.55 * rows);
    // the black shoulder spot
    tint(o, 0x14181a, 0.95 * Math.exp(-(((p.s - 0.235) / 0.016) ** 2) - (((p.y - 0.045) / 0.02) ** 2)));
    tint(o, 0xfafaf4, 0.35 * smooth(0.92, 0.99, -p.h) * (0.5 + 0.5 * Math.sin(p.s * 170)));
  },
  fin: finPainter({
    def: { c: 0xd8cc98, a: 0.4, ray: 0xc8b878, rayA: 0.65 },
    d2: { c: 0xb8ae80, a: 0.5, edge: 0x5a5440, edgeW: 0.15 },
    c: { c: 0xd8c070, a: 0.55, ray: 0xc8a850, edge: 0x5a5030, edgeW: 0.12, edgeA: 0.8 },
  }, { d1: 2, d2: 16, a: 22, c: 19, p: 16, v: 8 }, {}, { id: 'd2', from: 0.9, membrane: 0.42 }),
  swim: { lambda: 1.0, env: [0.15, -0.5, 1.35], amp: 0.09, stride: 0.7 },
  behavior: { habit: 'schooler', forage: 'filter', cruise: 1.3, burst: 10, level: 0.4, minLift: 0.4, school: 0.9, spacing: 1.3, extras: ['flash'] },
};

// ------------------------------------------------------------------------------------------------ イシモチ
/**
 * イシモチ (シログチ, Pennahia argentata): a croaker with a large rounded head (0.3 TL) and a blunt snout, a large
 * oblique terminal mouth, a big eye; the dorsal deeply notched between the tall spiny part and the long soft one, a
 * short anal fin, a wedge-shaped tail; silvery with a pink-purple sheen, a black spot at the upper corner of the gill
 * cover, the lateral line arched high; the mouth white inside.
 */
const ISHIMOCHI: FishSpec = {
  id: 'ishimochi', sizeClass: 'L', modelTL: 0.25, depth: 0.27, pivot: 0.37, caudalBase: 0.79, headJoint: 0.2,
  top: [[0, 0.0367], [0.02, 0.0528], [0.05, 0.0732], [0.1, 0.1019], [0.15, 0.1243], [0.2, 0.1396], [0.3, 0.1554], [0.4, 0.1489], [0.5, 0.143], [0.6, 0.1164], [0.7, 0.0675], [0.79, 0.0443]],
  bot: [[0, 0.0347], [0.02, 0.0448], [0.05, 0.0596], [0.1, 0.07], [0.15, 0.0823], [0.2, 0.1026], [0.3, 0.1205], [0.4, 0.1283], [0.5, 0.1226], [0.6, 0.1117], [0.7, 0.0889], [0.79, 0.0407]],
  width: [[0, 0.01575], [0.02, 0.02048], [0.05, 0.027], [0.1, 0.04125], [0.15, 0.052], [0.2, 0.05875], [0.3, 0.0624], [0.4, 0.05865], [0.5, 0.0484], [0.6, 0.035], [0.7, 0.0198], [0.79, 0.01386]],
  nTop: [[0, 2.0], [0.5, 2.0]], nBot: [[0, 2.1], [0.5, 2.0]],
  snoutCap: 0.03,
  eyes: [{ s: 0.093, y: 0.03, r: 0.027, bulge: 0.009, pupil: 0.55, iris: [0xdcd4c0, 0x8a7e6c], rim: 0x221e1e }],
  mouth: { corner: 0.08, gape: [[0, -0.008], [0.08, -0.03]], open: 0.55, inside: 0.9 },
  oper: { s: 0.26, sweep: 0.03, top: 0.12, bot: 0.1, step: 0.003 },
  fins: {
    median: [
      { id: 'd1', s0: 0.25, s1: 0.4, len: [[0, 0.06], [0.2, 0.11], [0.5, 0.08], [1, 0.022]], rake: [0.3, 0.7], rays: 10, spines: 10 },
      { id: 'd2', s0: 0.42, s1: 0.76, len: [[0, 0.06], [0.2, 0.064], [1, 0.04]], rake: [0.7, 1.0], rays: 27 },
      { id: 'a', s0: 0.6, s1: 0.7, len: [[0, 0.05], [0.2, 0.075], [1, 0.035]], rake: [0.6, 0.95], rays: 9, spines: 2 },
    ],
    caudal: { len: 0.216, centre: 1.0, tip: 0.65, p: 1.3, spread: 0.12, rays: 17, base: 1.0 },
    pectoral: { s: 0.26, y: -0.03, base: 0.03, len: [[0, 0.12], [0.3, 0.13], [1, 0.05]], dirs: [0.15, -0.5], rest: 0.25, rays: 16 },
    pelvic: { s: 0.26, y: 0, base: 0.025, len: [[0, 0.1], [1, 0.05]], dirs: [0.35, 0.05], rest: 0.5, rays: 6 },
  },
  scales: { along: 52, around: 40, depth: 0.35 },
  wet: 0.6,
  skin(p, o) {
    countershade(o, p.h, 0x8a8088, 0xd6d2d2, 0xf6f2ea, 0.45, -0.5, 0.3);
    tint(o, 0xe6c4c4, 0.25 * smooth(-0.3, 0.1, p.h) * (1 - smooth(0.3, 0.6, p.h)));
    o.metal = 0.15 + 0.5 * (1 - smooth(0.3, 0.7, p.h)) * smooth(-0.95, -0.4, p.h);
    o.rough = 0.34;
    shade(o, 0.94 + 0.1 * mottle(p, 40, 12));
    tint(o, 0x6a6064, 0.45 * lateralLine(p, 0.62, 0.12, 0.028));
    // the black spot on the upper gill cover
    tint(o, 0x161214, 0.92 * Math.exp(-(((p.s - 0.235) / 0.016) ** 2) - (((p.y - 0.035) / 0.02) ** 2)));
    tint(o, 0x3a3436, 0.3 * eyeRim(p, 0.093, 0.03, 0.027));
  },
  fin: finPainter({
    def: { c: 0xd6d0bc, a: 0.4, ray: 0xbcb498, rayA: 0.65 },
    d1: { c: 0x9a948a, a: 0.5 },
    d2: { c: 0xa8a294, a: 0.5 },
    c: { c: 0xb8b2a2, a: 0.5, edge: 0x6a6460, edgeW: 0.12 },
    v: { c: 0xf0e8c8, a: 0.55 },
    a: { c: 0xf0e8c8, a: 0.55 },
  }, { d1: 10, d2: 27, a: 9, c: 17, p: 16, v: 6 }, { d1: 10, a: 2 }),
  swim: { lambda: 1.0, env: [0.15, -0.5, 1.3], amp: 0.085, stride: 0.65 },
  behavior: { habit: 'bottomShoal', forage: 'peck', cruise: 0.7, burst: 7, level: 0.12, minLift: 0.25, school: 0.5, spacing: 1.8, extras: ['rest'] },
};

export const FISH_SPECS: Record<string, FishSpec> = {
  suzuki: SUZUKI, mejina: MEJINA, kisu: KISU, magochi: MAGOCHI, hirame: HIRAME,
  bora: BORA, sappa: SAPPA, konoshiro: KONOSHIRO, ishimochi: ISHIMOCHI,
};

export { noise };
export type { SkinOut };
