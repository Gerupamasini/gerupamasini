// The whole-fish skin as a render mesh per tier: the sculpt of body.mjs meshed at the tier's cell size, split into UV
// charts (charts.mjs) and simplified to the tier's triangle target (tiers.mjs). The body texture is square (2048² on the
// hero); its layout:
//   body    the trunk and tail, a cylinder about the body's axis (seam on the ventral midline)       [0, 0] – [1, 0.55]
//   head    the face, snout and eye turret, azimuthal about the forward axis                         [0, 0.56] – [0.36, 0.92]
//   socket  the inside of each dermal cup                                                            L [0.37, 0.56], R [0.46, 0.56], 0.08 square
//   lobe    each pectoral arm, a cylinder about its own axis (seam against the flank)                 L [0.56, 0.56], R [0.56, 0.72], 0.16 × 0.14
// The texel density is about 0.0019 HL (0.03 mm) per texel on the hero in every chart; [0.80, 0.56] – [1, 1] is free.
import { HL, HEAD } from './anatomy.mjs';
import { HEAD_SCULPT } from './head.mjs';
import { BODY_SCULPT, fishSDFmm, trunkProfile } from './body.mjs';
import { azimuthal, cylinder, limb, vec } from './charts.mjs';
import { tierMesh, ready } from './tiers.mjs';
import { smoothstep } from './sdf.mjs';

export { ready };

/** The meshing box (fish mm): snout to the peduncle's end, the pectoral lobes and the eye domes inside. */
export const BODY_BOX = { min: [-0.08 * HL, -0.16 * HL, -0.62 * HL], max: [4.32 * HL, 0.85 * HL, 0.62 * HL] };

export const BODY_LAYOUT = {
  body: [0, 0, 1, 0.55],
  head: [0, 0.56, 0.36, 0.92],
  socketL: [0.37, 0.56, 0.45, 0.64],
  socketR: [0.46, 0.56, 0.54, 0.64],
  lobeL: [0.56, 0.56, 0.72, 0.70],
  lobeR: [0.56, 0.72, 0.72, 0.86],
};

/** The charts (fish mm) and the per-vertex chart choice. */
export function bodyCharts(K = BODY_SCULPT) {
  const prof = trunkProfile(K);
  const sC = 0.45 * HL, yC = 0.30 * HL;
  // the body's axis: the head's centre line ahead of the gill opening, the trunk's mid-height behind it
  const axisY = (s) => {
    const sh = s / HL, w = smoothstep(1.0, 1.4, sh);
    return w <= 0 ? yC : (1 - w) * yC + w * prof.at(Math.max(1.05, sh)).yc * HL;
  };
  const E = HEAD.eye, g = vec.norm(HEAD_SCULPT.cup.open);
  const P = K.pectoral, mm = (v) => v.map((c) => c * HL);
  const lobe = (side) => {
    const m = (v) => [v[0], v[1], v[2] * side];
    return { a: mm(m(P.shoulder)), b: mm(m(P.wrist)), out: [0, 0, side] };
  };
  const LL = lobe(1), LR = lobe(-1);
  const charts = [
    { name: 'head', rect: BODY_LAYOUT.head, project: azimuthal([sC, yC, 0], [-1, 0, 0], [0, 1, 0], Math.PI * 0.56) },
    { name: 'body', rect: BODY_LAYOUT.body, wrapV: true, project: cylinder(sC - 0.02 * HL, 4.30 * HL, axisY) },
    { name: 'socketL', rect: BODY_LAYOUT.socketL, project: azimuthal([E.s * HL, E.y * HL, E.z * HL], [-g[0], -g[1], -g[2]], [1, 0, 0], Math.PI * 0.75) },
    { name: 'socketR', rect: BODY_LAYOUT.socketR, project: azimuthal([E.s * HL, E.y * HL, -E.z * HL], [-g[0], -g[1], g[2]], [1, 0, 0], Math.PI * 0.75) },
    { name: 'lobeL', rect: BODY_LAYOUT.lobeL, wrapV: true, project: limb(LL.a, LL.b, LL.out) },
    { name: 'lobeR', rect: BODY_LAYOUT.lobeR, wrapV: true, project: limb(LR.a, LR.b, LR.out) },
  ];
  const re = (E.d / 2) * HL, rIn = re + (HEAD_SCULPT.cup.gap + HEAD_SCULPT.cup.thick * 0.6) * HL;
  const rLobe = Math.max(...P.radius) * HL;
  const inLobe = (p, L) => {
    const ax = vec.sub(L.b, L.a), len = Math.hypot(...ax), u = vec.scale(ax, 1 / len);
    const d = vec.sub(p, L.a), t = vec.dot(d, u) / len;
    if (t < 0.18) return false;
    const q = vec.sub(d, vec.scale(u, Math.min(1, t) * len));
    return Math.hypot(...q) < rLobe * 1.35;
  };
  const prefer = (p, n) => {
    for (const [ci, side] of [[2, 1], [3, -1]]) {
      const c = [E.s * HL, E.y * HL, E.z * HL * side];
      const d = vec.sub(c, p), l = Math.hypot(...d);
      if (l < rIn && vec.dot(n, d) / l > 0.15) return ci;
    }
    if (p[2] > 0 && inLobe(p, LL)) return 4;
    if (p[2] < 0 && inLobe(p, LR)) return 5;
    return p[0] < sC ? 0 : 1;
  };
  return { charts, prefer, axisY };
}

/**
 * The body's render mesh for a tier.
 * @param o { h: cell (mm), target: triangles, permissive?, log? }
 * @returns tiers.tierMesh's result (fish mm)
 */
export function bodyTierMesh(o, K = BODY_SCULPT) {
  const { charts, prefer } = bodyCharts(K);
  return tierMesh(fishSDFmm(HL, K), BODY_BOX, { ...o, charts, prefer });
}
