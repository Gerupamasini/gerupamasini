// Body + head loft with an openable mouth (seam along the mouth line) and a mouth-cavity tube.
// Pure data (typed arrays); no three.js. See docs/yamame/impl/CONTRACT.md for conventions.
//
// Topology: rings (s) x sector columns (alpha). Key columns: 0 = dorsal midline, n1 = right mouth line,
// n1+n2 = ventral midline, n1+2*n2 = left mouth line, N = dorsal midline again (UV seam).
// In "seam rings" (snout cap .. mouth corner) the two mouth-line columns are split into an upper-arc copy and a
// lower-arc copy at the same position, so that the lower jaw can rotate and the gape opens.

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sgnPow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

export function buildBody(surface, params, opts = {}) {
  const SL = surface.SL;
  const cornerS = params.mouth.corner_s.v;                  // mouth corner / jaw hinge (SL)
  const rM = opts.mouth_line_r ?? -0.25;                      // [E] mouth line height in half-heights relative to the section centre
  const n1 = opts.n_upper ?? 14, n2 = opts.n_lower ?? 16;      // sectors: dorsal->mouth line (right), mouth line->belly
  const N = 2 * (n1 + n2);
  const jL = n1 + 2 * n2;                                      // left mouth column
  const cap = surface.cap;
  const eyeP = params.eye;
  const HL = params.head_length_over_sl.v;

  // ---- ring list --------------------------------------------------------------------------------------------------
  const rings = [];
  const capT = opts.capT ?? [0.985, 0.93, 0.85, 0.74, 0.60, 0.45, 0.30, 0.16, 0.06];       // t = -s/cap; scale = sqrt(1-t^2)
  for (const t of capT) rings.push({ s: -t * cap, cap: true });
  const pushRange = (a, b, step) => { for (let s = a; s < b - 1e-9; s += step) rings.push({ s: +s.toFixed(6), cap: false }); };
  for (const [a, b, st] of (opts.steps ?? [[0, 0.30, 0.004], [0.30, 0.90, 0.010], [0.90, 1.0, 0.0125]])) pushRange(a, b, st);
  rings.push({ s: 1.0, cap: false });
  const R = rings.length;
  const seamEnd = rings.findIndex((r) => !r.cap && r.s >= cornerS - 1e-9);  // first ring at/after the corner: lips merge here
  const seamRings = (i) => i < seamEnd;

  // ---- key angles -------------------------------------------------------------------------------------------------
  const alphaM = (() => { // right-side angle of the mouth line (constant: depends only on rM and the exponent)
    const n = rM >= 0 ? 2.2 : 2.0; return Math.acos(Math.max(-1, Math.min(1, sgnPow(rM, n / 2))));
  })();
  // with a head spec the mouth line follows the measured gape line, so its column angle differs from ring to ring
  const head = opts.head || null;
  const alphaMRing = rings.map((r) => {
    if (!head || !head.line) return alphaM;
    const sRing = Math.max(r.s, 0), yM = head.mouthLineHeight(sRing); if (yM == null) return alphaM;
    return surface.alphaAtHeight(sRing, yM * SL);
  });
  const colWarp = opts.col_warp ?? 1.0;                           // > 1 clusters the columns towards the mouth line (lips need ~0.25 mm spacing)
  const alphaOf = (j, i = 0) => {
    const aM = alphaMRing[i], q = colWarp;
    if (j <= n1) return aM * (1 - Math.pow(1 - j / n1, q));
    if (j <= n1 + n2) return aM + (Math.PI - aM) * Math.pow((j - n1) / n2, q);
    if (j <= jL) return Math.PI + (Math.PI - aM) * (1 - Math.pow(1 - (j - n1 - n2) / n2, q));
    return (TAU - aM) + aM * Math.pow((j - jL) / n1, q);
  };

  // ---- displacement field (outward, metres) ------------------------------------------------------------------------
  let sE = eyeP.center_s.v, hFracE = eyeP.center_height_frac_from_top.v;
  const eyeOuterR = 0.5 * eyeP.outer_d_over_sl.v * SL;
  let eyeY;
  if (head && head.eye) { const [ex, ey] = head.fromUV(head.eye.u, head.eye.v); sE = surface.xToS(ex); eyeY = ey; }
  else { const eyeSecs = surface.section(sE); eyeY = (eyeSecs.c + eyeSecs.h * (1 - 2 * hFracE)) * SL; }           // y of eye centre
  const eyeAlphaR = surface.alphaAtHeight(sE, eyeY);
  const eyeAlpha = [eyeAlphaR, TAU - eyeAlphaR];
  const eyeCentersSurf = eyeAlpha.map((a) => surface.point(sE, a));
  const opEdge = (alpha) => { // s of the gill-cover trailing edge as a function of alpha (bowed backwards at mid-height)
    const lat = Math.sin(alpha); return params.operculum.edge_s.v + 0.020 * Math.pow(Math.abs(lat), 1.4) - 0.010 * Math.pow(Math.abs(Math.cos(alpha)), 2);
  };
  const latMask = (alpha) => { // 1 on the flanks, fades towards the dorsal / ventral midlines
    const a = Math.abs(Math.sin(alpha)); return smooth(0.25, 0.75, a);
  };

  // nares: two pits per side on the snout (anterior one with a raised rim); positions [E], from photo impression: ~0.45 and ~0.65 of the way snout->eye
  const naresSurf = [];
  for (const side of [1, -1]) for (const [ns, na, rad, depth, rim] of [[0.040, 0.78, 0.0009, 0.00055, 0.00018], [0.062, 0.82, 0.0008, 0.0005, 0.0]]) {
    const a = side > 0 ? na : TAU - na; naresSurf.push({ c: surface.point(ns, a), rad, depth, rim });
  }

  const mk = opts.morph || {};
  function displacement(s, alpha) {
    if (head) return headDisplacement(s, alpha);
    let d = 0;
    for (const n of naresSurf) {
      const p0 = surface.point(s, alpha); const rr = Math.hypot(p0[0] - n.c[0], p0[1] - n.c[1], p0[2] - n.c[2]);
      if (rr < n.rad * 2.2) { const q = Math.max(0, 1 - (rr / n.rad) ** 2); d -= n.depth * q * q; if (n.rim) d += n.rim * Math.exp(-(((rr - n.rad * 1.35) / (n.rad * 0.35)) ** 2)); }
    }
    // eye pocket (skin pushed in so the eyeball sits in a socket; orbit ring hides the junction)
    for (let k = 0; k < 2; k++) {
      const p = surface.point(s, alpha); const c = eyeCentersSurf[k];
      const rr = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      // gentle, wide socket + soft orbital rim: every feature is wider than ~3 ring/sector spacings so the loft mesh resolves it
      // (a narrow rim, sigma 0.22 Ro, faceted). Keep eyes.mjs SOCKET_LOFT in sync with these numbers.
      const r0 = eyeOuterR * 1.65;
      if (rr < r0) { const q = 1 - (rr / r0) ** 2; d -= 0.55 * eyeOuterR * q * q; }
      // raised orbital rim just outside the socket
      const rim = Math.exp(-(((rr - eyeOuterR * 1.45) / (eyeOuterR * 0.50)) ** 2)); d += 0.07 * eyeOuterR * rim;
    }
    // cheek swelling in front of the gill cover
    if (s > 0.10 && s < 0.27) { d += 0.00030 * smooth(0.10, 0.17, s) * (1 - smooth(0.20, 0.26, s)) * latMask(alpha); }
    // gill-cover trailing edge: body behind it sits slightly lower
    const e = opEdge(alpha); d -= 0.00020 * smooth(e - 0.007, e + 0.011, s) * (1 - smooth(e + 0.02, e + 0.08, s)) * latMask(alpha);
    // thin raised flap right at the edge
    d += 0.00012 * Math.exp(-(((s - (e - 0.002)) / 0.0035) ** 2)) * latMask(alpha);
    // preopercle groove (arc in front of the gill cover)
    const sp = e - 0.052 + 0.016 * Math.pow(Math.abs(Math.cos(alpha)), 1.5);
    d -= 0.00012 * Math.exp(-(((s - sp) / 0.0022) ** 2)) * latMask(alpha) * smooth(0.05, 0.3, Math.abs(Math.cos(alpha)) + 0.15);
    // morph-target shapes (05 §5.1.3): cheek = mt_buccal_swell, branch = mt_branchiostegal (used only when building the morph deltas)
    if (mk.cheek) d += mk.cheek * 0.0014 * smooth(0.06, 0.14, s) * (1 - smooth(0.18, 0.26, s)) * latMask(alpha);
    if (mk.branch) d += mk.branch * 0.0016 * smooth(0.05, 0.10, s) * (1 - smooth(0.17, 0.24, s)) * smooth(0.35, 0.8, -Math.cos(alpha));
    // maxilla / supramaxilla plate: a slightly raised band above the mouth line, widening towards the corner (visible as the pale bar in reference photos)
    if (s > 0.012 && s < cornerS + 0.014) {
      const da = Math.min(alphaM - alpha, TAU - alphaM - (TAU - alpha)) ; const dr = (alpha <= Math.PI) ? alphaM - alpha : alpha - (TAU - alphaM);
      const wA = 0.10 + 0.30 * smooth(0.02, cornerS, s);
      d += 0.00030 * smooth(0.0, 0.05, dr) * (1 - smooth(wA * 0.55, wA, dr)) * smooth(0.012, 0.035, s) * (1 - smooth(cornerS - 0.004, cornerS + 0.014, s));
    }
    // lips: slightly raised ridge at the mouth line, fading out at the corner
    if (s < cornerS + 0.01) {
      const am = Math.min(Math.abs(alpha - alphaM), Math.abs(alpha - (TAU - alphaM)));
      d += 0.00018 * Math.exp(-((am / 0.10) ** 2)) * (1 - smooth(cornerS - 0.03, cornerS + 0.01, s));
    }
    return d;
  }

  // spec-driven head: all head features come from head.mjs; the morph shapes stay here
  function headDisplacement(s, alpha) {
    const p = surface.point(s, alpha), n = surface.normal(s, alpha);
    let d = head.displacement(s, alpha, { p, n, eyeCenters: eyeCentersSurf, eyeRo: eyeOuterR });
    if (mk.cheek) d += mk.cheek * 0.0014 * smooth(0.06, 0.14, s) * (1 - smooth(0.18, 0.26, s)) * latMask(alpha);
    if (mk.branch) d += mk.branch * 0.0016 * smooth(0.05, 0.10, s) * (1 - smooth(0.17, 0.24, s)) * smooth(0.35, 0.8, -Math.cos(alpha));
    return d;
  }

  // ---- vertices ---------------------------------------------------------------------------------------------------
  const pos = [], uv = [], sAttr = [], aAttr = [], jawAttr = [], regAttr = [];
  const up = Array.from({ length: R }, () => new Int32Array(N + 1).fill(-1));
  const lo = Array.from({ length: R }, () => new Int32Array(N + 1).fill(-1));
  const addVertex = (p, s, alpha, j, jawF) => {
    pos.push(p[0], p[1], p[2]); uv.push(Math.min(Math.max(s, 0), 1), j === N ? 1 : alpha / TAU);
    sAttr.push(s); aAttr.push(alpha); jawAttr.push(jawF); regAttr.push(0);
    return pos.length / 3 - 1;
  };
  const jawFactor = (s, alpha, lowerArc) => {
    if (!lowerArc) return 0;
    return 1 - smooth(cornerS - 0.012, cornerS + 0.035, s);
  };
  const lipPos = []; // per seam ring: positions of the four lip points + indices
  for (let i = 0; i < R; i++) {
    const { s } = rings[i];
    for (let j = 0; j <= N; j++) {
      const alpha = alphaOf(j, i);
      const d = displacement(s, alpha);
      const p = surface.point(s, alpha, d);
      if (head && head.spec.mouth?.overbite_over_hl && j > n1 && j < jL) {      // upper jaw overhangs: the free part of the lower jaw sits behind the upper tip, fading out with distance from the tip and from the gape line
        const uu = (s + cap) / head.HLs, aM = alphaMRing[i], aa = alpha <= Math.PI ? alpha : TAU - alpha;
        p[0] -= head.spec.mouth.overbite_over_hl * head.HLm * (1 - smooth(0, 0.30, uu)) * smooth(aM + 0.05, aM + 1.1, aa);
      }
      const isMouthCol = (j === n1 || j === jL) && seamRings(i);
      const lowerStart = (j >= n1 && j < jL);        // sectors beginning at column j that belong to the lower arc
      if (isMouthCol) {
        // upper-arc copy and lower-arc copy at identical position
        const idU = addVertex(p, s, alpha, j, 0);
        const idL = addVertex(p, s, alpha, j, jawFactor(s, alpha, true));
        up[i][j] = idU; lo[i][j] = idL;
      } else {
        const lowerArc = j > n1 && j < jL;
        const id = addVertex(p, s, alpha, j, jawFactor(s, alpha, lowerArc));
        up[i][j] = id; lo[i][j] = id;
      }
    }
  }
  // apex vertices (two coincident points: upper lip tip / lower lip tip)
  const apexX = surface.point(-cap, 0)[0], apexY = surface.section(0).c * SL;
  const r0y = (up[0][0] >= 0 && up[0][Math.round(N / 2)] >= 0) ? 0.5 * (pos[up[0][0] * 3 + 1] + pos[up[0][Math.round(N / 2)] * 3 + 1]) : apexY;
  const apexYh = head ? r0y : apexY;                               // the closing point sits on the axis of the first (tiny) cap ring
  const obApex = head && head.spec.mouth?.overbite_over_hl ? head.spec.mouth.overbite_over_hl * head.HLm * 0.45 : 0;
  const apexU = addVertex([apexX, apexYh, 0], -cap, 0, 0, 0);
  const apexL = addVertex([apexX, apexYh, 0], -cap, Math.PI, 0, 1);       // coincident with apexU in the rest pose (no slot at the lip tips); it follows the jaw when the mouth opens

  // ---- triangles --------------------------------------------------------------------------------------------------
  const idx = [], idxHead = [], idxBody = [];
  const headSplit = opts.headSplit ?? null;                      // s (SL) where the dedicated head texture atlas ends; rings behind it use the body atlas
  const quad = (a, b, c, d, toHead) => { idx.push(a, b, c, a, c, d); (toHead ? idxHead : idxBody).push(a, b, c, a, c, d); };
  for (let i = 0; i < R - 1; i++) {
    const toHead = headSplit != null && rings[i + 1].s <= headSplit + 1e-9;
    for (let j = 0; j < N; j++) {
      const lowerArc = j >= n1 && j < jL;
      const T = lowerArc ? lo : up;
      // winding for outward normals: s increases towards the tail; alpha increases dorsal->right->ventral
      quad(T[i][j], T[i + 1][j], T[i + 1][j + 1], T[i][j + 1], toHead);
    }
  }
  // snout fans (ring 0 -> apex)
  for (let j = 0; j < N; j++) {
    const lowerArc = j >= n1 && j < jL; const T = lowerArc ? lo : up; const apex = lowerArc ? apexL : apexU;
    idx.push(apex, T[0][j], T[0][j + 1]); idxHead.push(apex, T[0][j], T[0][j + 1]);       // winding: the closing fan faces +x (outward)
  }
  // tail end is left open (caudal fin base covers it); close with a small fan so the mesh is watertight
  const tailCenterS = 1.0; const tc = surface.point(tailCenterS, 0);
  const tcY = surface.section(1).c * SL;
  const tailC = addVertex([surface.sToX(1), tcY, 0], 1, 0, 0, 0);
  for (let j = 0; j < N; j++) { idx.push(tailC, up[R - 1][j + 1], up[R - 1][j]); idxBody.push(tailC, up[R - 1][j + 1], up[R - 1][j]); }       // faces -x (outward)

  // ---- normals (triangle accumulation; dorsal UV-seam duplicates share normals) -----------------------------------
  const P = Float32Array.from(pos); const nVert = P.length / 3; const nrm = new Float64Array(nVert * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { nrm[o] += nx; nrm[o + 1] += ny; nrm[o + 2] += nz; }
  }
  for (let i = 0; i < R; i++) { // join the dorsal seam duplicates (column 0 and N)
    const a = up[i][0] * 3, b = up[i][N] * 3;
    for (let k = 0; k < 3; k++) { const m = nrm[a + k] + nrm[b + k]; nrm[a + k] = m; nrm[b + k] = m; }
  }
  const normals = new Float32Array(nVert * 3);
  for (let v = 0; v < nVert; v++) {
    const l = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1;
    normals[v * 3] = nrm[v * 3] / l; normals[v * 3 + 1] = nrm[v * 3 + 1] / l; normals[v * 3 + 2] = nrm[v * 3 + 2] / l;
  }
  // apex / tail centre normals
  normals.set([1, 0, 0], apexU * 3); normals.set([1, 0, 0], apexL * 3); normals.set([-1, 0, 0], tailC * 3);

  // ---- mouth cavity tube ------------------------------------------------------------------------------------------
  const mouth = buildMouthTube({ surface, rings, seamEnd, up, lo, P, n1, jL, cornerS, SL, apexU, apexL });

  // ---- landmarks --------------------------------------------------------------------------------------------------
  const landmarks = {
    eye: eyeAlpha.map((a, k) => ({ side: k === 0 ? 'R' : 'L', alpha: a, surface: eyeCentersSurf[k], outerRadius: eyeOuterR })),
    eyeY, jaw_hinge: head && head.line ? [...head.fromUV(head.corner[0] - 0.01, head.corner[1] - 0.01), 0] : [surface.sToX(cornerS), surface.section(cornerS).c * SL + rM * surface.section(cornerS).h * SL * 1.0, 0],
    mouth_line_r: rM, alpha_mouth: alphaM, alpha_mouth_ring: alphaMRing, head_landmarks: head ? head.landmarks() : null, corner_s: cornerS, opercle_edge_s: params.operculum.edge_s.v,
    seam_end_ring: seamEnd, ring_s: rings.map((r) => r.s), N, n1, n2, jL,
  };
  const out = {
    positions: P, normals, uvs: Float32Array.from(uv), indices: Uint32Array.from(idx),
    attrs: { _S: Float32Array.from(sAttr), _ALPHA: Float32Array.from(aAttr), _JAW: Float32Array.from(jawAttr) },
    mouth, landmarks,
  };
  if (headSplit != null) {
    // dedicated head atlas: u_h = (s + cap) / (headSplit + cap), v as in the body atlas
    const uvH = new Float32Array(uv.length);
    for (let v = 0; v < sAttr.length; v++) { uvH[v * 2] = Math.min(1, Math.max(0, (sAttr[v] + cap) / (headSplit + cap))); uvH[v * 2 + 1] = uv[v * 2 + 1]; }
    out.split = { s_end: headSplit, cap, indicesHead: Uint32Array.from(idxHead), indicesBody: Uint32Array.from(idxBody), uvsHead: uvH };
  }
  return out;
}

// ---- mouth tube -------------------------------------------------------------------------------------------------
function buildMouthTube({ surface, rings, seamEnd, up, lo, P, n1, jL, cornerS, SL, apexU, apexL }) {
  const K1 = 7, K2 = 4;                                    // roof/floor samples, ribbon samples (excluding the lip points)
  const positions = [], uvs = [], jawF = [], idx = [];
  const loops = [];                                         // each loop = array of vertex ids (closed)
  const lips = [];                                          // per loop: lip-line anchor points (x, yLip, zR, zL) for the teeth module
  const extra = 6;                                          // rings behind the corner that shrink to the throat
  const ringIdx = []; for (let i = 0; i < seamEnd; i++) ringIdx.push(i);
  const totalLoops = ringIdx.length + extra;
  const pt = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const addV = (p, u, v, f) => { positions.push(p[0], p[1], p[2]); uvs.push(u, v); jawF.push(f); return positions.length / 3 - 1; };

  for (let li = 0; li < totalLoops; li++) {
    let UR, UL, shrink = 1, sRing;
    if (li < ringIdx.length) {
      const i = ringIdx[li]; sRing = rings[i].s;
      UR = pt(up[i][n1]); UL = pt(up[i][jL]);
      const tk = smooth(-surface.cap, 0.02, sRing);               // tuck the first loops inside the lip tips: the closed mouth must show no lining
      UR = [UR[0] - 0.0005 * (1 - tk), UR[1], UR[2] * (0.45 + 0.55 * tk)]; UL = [UL[0] - 0.0005 * (1 - tk), UL[1], UL[2] * (0.45 + 0.55 * tk)];
    } else {
      const i = seamEnd; const k = li - ringIdx.length + 1; sRing = rings[i].s + 0.0125 * k;
      const t = k / extra; shrink = Math.max(1 - t, 0.02);
      const secPt = surface.point(Math.max(sRing, 0), 0);
      UR = pt(up[i][n1]); UL = pt(up[i][jL]);
      UR = [surface.sToX(sRing), UR[1], UR[2] * shrink]; UL = [surface.sToX(sRing), UL[1], UL[2] * shrink];
    }
    const yLip = UR[1];
    const secS = Math.max(sRing, 0);
    const top = surface.point(secS, 0)[1], bot = surface.point(secS, Math.PI)[1];
    const tipTaper = li < ringIdx.length ? smooth(-surface.cap, 0.012, sRing) : 1;     // behind the tip the cavity opens gradually, so the closed lips hide the lining
    const roofH = 0.42 * (top - yLip) * shrink * tipTaper, floorH = 0.40 * (yLip - bot) * shrink * tipTaper;
    const bulge = Math.min(0.0012 * shrink, 0.45 * Math.abs(UR[2])) * tipTaper;
    const u = li / (totalLoops - 1);
    const loop = [];
    const zR = UR[2], zL = UL[2], x = UR[0];
    lips.push({ x, y: yLip, zR, zL, shrink });
    // roof: from UR over the top to UL
    loop.push(addV([x, yLip, zR], u, 0.0, 0));
    for (let k = 1; k <= K1; k++) { const t = k / (K1 + 1); loop.push(addV([x, yLip + roofH * Math.sin(Math.PI * t), zR + (zL - zR) * t], u, 0.25 * t, 0)); }
    // left ribbon: from UL down to LL (inward bulge)
    loop.push(addV([x, yLip, zL], u, 0.25, 0));
    for (let k = 1; k <= K2; k++) { const q = k / (K2 + 1); loop.push(addV([x, yLip, zL - Math.sign(zL || -1) * bulge * Math.sin(Math.PI * q)], u, 0.25 + 0.125 * q, q)); }
    // floor: from LL to LR (tongue raised in the middle slightly)
    loop.push(addV([x, yLip, zL], u, 0.375, 1));
    for (let k = 1; k <= K1; k++) { const t = k / (K1 + 1); const tongue = 0.35 * Math.sin(Math.PI * t); loop.push(addV([x, yLip - floorH * Math.sin(Math.PI * t) + floorH * tongue * 0.6, zL + (zR - zL) * t], u, 0.375 + 0.25 * t, 1)); }
    loop.push(addV([x, yLip, zR], u, 0.625, 1));
    // right ribbon: from LR up to UR
    for (let k = 1; k <= K2; k++) { const q = k / (K2 + 1); loop.push(addV([x, yLip, zR - Math.sign(zR || 1) * bulge * Math.sin(Math.PI * q)], u, 0.625 + 0.125 * q, 1 - q)); }
    loops.push(loop);
  }
  // apex point(s) at the front
  const apex = addV([P[apexU * 3], P[apexU * 3 + 1], P[apexU * 3 + 2]], 0, 0.5, 0.5);
  const M = loops[0].length;
  // fan from apex to first loop (inward-facing)
  // (no front wall: the sleeve stays open at the lip tips so that the gape shows the cavity, not a curtain; loop 0 is only ~0.7 mm wide when the mouth is closed)
  for (let li = 0; li < loops.length - 1; li++) {
    for (let m = 0; m < M; m++) {
      const a = loops[li][m], b = loops[li][(m + 1) % M], c = loops[li + 1][(m + 1) % M], d = loops[li + 1][m];
      idx.push(a, d, c, a, c, b);
    }
  }
  const last = loops[loops.length - 1];
  const throat = addV([positions[last[0] * 3] - 0.002, positions[last[0] * 3 + 1], 0], 1, 0.5, 0);
  for (let m = 0; m < M; m++) idx.push(throat, last[m], last[(m + 1) % M]);
  // normals: accumulate and flip so they face the cavity axis (inward)
  const Pm = Float32Array.from(positions); const nv = Pm.length / 3; const nrm = new Float64Array(nv * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = Pm[b] - Pm[a], uy = Pm[b + 1] - Pm[a + 1], uz = Pm[b + 2] - Pm[a + 2];
    const vx = Pm[c] - Pm[a], vy = Pm[c + 1] - Pm[a + 1], vz = Pm[c + 2] - Pm[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { nrm[o] += nx; nrm[o + 1] += ny; nrm[o + 2] += nz; }
  }
  const normals = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) { const l = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1; normals[v * 3] = nrm[v * 3] / l; normals[v * 3 + 1] = nrm[v * 3 + 1] / l; normals[v * 3 + 2] = nrm[v * 3 + 2] / l; }
  return { positions: Pm, normals, uvs: Float32Array.from(uvs), indices: Uint32Array.from(idx), attrs: { _JAW: Float32Array.from(jawF) }, lips };
}

export function meshStats(g) {
  const n = g.positions.length / 3; let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < n; i++) {
    const x = g.positions[i * 3], y = g.positions[i * 3 + 1], z = g.positions[i * 3 + 2];
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); minz = Math.min(minz, z); maxz = Math.max(maxz, z);
  }
  return { vertices: n, triangles: g.indices.length / 3, bbox: { x: [minx, maxx], y: [miny, maxy], z: [minz, maxz] } };
}
