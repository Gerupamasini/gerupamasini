import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { polyV, splineV, distPolyline, sdPolygon, applyHead, createHead, syncEyeParams } from '../../tools/build-assets/head.mjs';
import { loadParams, createSurface } from '../../tools/build-assets/surface.mjs';
import { applyStage } from '../../tools/build-assets/stages.mjs';

test('polyline helpers', () => {
  const pts = [[0, 0], [1, 1], [2, 0]];
  assert.equal(polyV(pts, 0.5), 0.5); assert.equal(polyV(pts, 1.5), 0.5); assert.equal(polyV(pts, -1), 0); assert.equal(polyV(pts, 3), 0);
  assert.ok(Math.abs(splineV(pts, 1) - 1) < 1e-9);
  assert.ok(Math.abs(distPolyline(pts, 1, 2).d - 1) < 1e-9);
  assert.ok(sdPolygon([[0, 0], [1, 0], [1, 1], [0, 1]], 0.5, 0.5) > 0.49 && sdPolygon([[0, 0], [1, 0], [1, 1], [0, 1]], 2, 0.5) < -0.99);
});

const specFile = new URL('../../assets/src/head_adult.json', import.meta.url);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const base = applyStage(loadParams(), JSON.parse(fs.readFileSync(new URL('../../assets/src/stage_adult.json', import.meta.url), 'utf8')), 'adult');

test('head spec: heights are positive, monotone enough and join the body without a step', () => {
  const p = applyHead(base, spec), S = createSurface(p), HL = spec.HL_over_SL;
  const d = (s) => 2 * S.section(s).h;
  for (let s = 0; s < 0.5; s += 0.01) assert.ok(d(s) > 0, `depth at ${s}`);
  const a = d(HL - 0.02), b = d(HL + 0.02);
  assert.ok(Math.abs(b - a) / a < 0.12, `step at the junction ${a} -> ${b}`);
  for (let s = 0; s < 0.5; s += 0.005) assert.ok(Math.abs(d(s + 0.005) - d(s)) < 0.02, `jump at ${s}`);
});

test('head object: landmarks sit where the spec says (chord coordinates round trip)', () => {
  const p = applyHead(base, spec), S = createSurface(p); syncEyeParams(S, p, spec);
  const h = createHead(S, p, spec), [x, y] = h.fromUV(0.5, -0.1), [u, v] = h.toUV(x, y);
  assert.ok(Math.abs(u - 0.5) < 1e-9 && Math.abs(v + 0.1) < 1e-9);
  const lm = h.landmarks(); assert.ok(lm.snout_tip && lm.eye_center && lm.mouth_corner && lm.opercle_post_mid);
  assert.ok(lm.snout_tip[0] > lm.eye_center[0] && lm.eye_center[0] > lm.opercle_post_mid[0], 'order snout > eye > opercle along +x');
  assert.ok(lm.mouth_corner[1] < lm.eye_center[1], 'mouth corner below the eye');
});

import { buildBody } from '../../tools/build-assets/loft.mjs';
const LOFT = { n_upper: 12, n_lower: 14, col_warp: 1.35, steps: [[0, 0.30, 0.005], [0.30, 0.90, 0.0167], [0.90, 1.0, 0.025]] };
function makeBody(extra = {}) {
  const p = applyHead(base, spec), S = createSurface(p); syncEyeParams(S, p, spec);
  const h = createHead(S, p, spec);
  return { S, p, h, b: buildBody(S, p, { ...LOFT, head: h, ...extra }) };
}

test('loft: the closing fans at the snout and the tail face outward (no hole in the cap)', () => {
  const { b } = makeBody(); const P = b.positions, I = b.indices;
  let tipBad = 0, tipN = 0, tailBad = 0, tailN = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, c = I[t + 1] * 3, d = I[t + 2] * 3;
    const ux = P[c] - P[a], uy = P[c + 1] - P[a + 1], uz = P[c + 2] - P[a + 2], vx = P[d] - P[a], vy = P[d + 1] - P[a + 1], vz = P[d + 2] - P[a + 2];
    const nx = uy * vz - uz * vy; const cx = (P[a] + P[c] + P[d]) / 3;
    if (cx > 0.0961) { tipN++; if (nx < 0) tipBad++; }          // the closing fan and the first cap rings (x > 96.1 mm)
    if (cx < -0.0945) { tailN++; if (nx > 0) tailBad++; }
  }
  assert.ok(tipN >= 20 && tailN > 10, `fans found ${tipN}/${tailN}`);
  assert.equal(tipBad, 0, `${tipBad}/${tipN} inward triangles at the snout`); assert.equal(tailBad, 0, `${tailBad}/${tailN} inward triangles at the tail`);
});

test('loft: head atlas split covers rings up to the split and the UVs span 0..1', () => {
  const { b } = makeBody({ headSplit: 0.27 }); const sp = b.split;
  assert.ok(sp && sp.indicesHead.length > 0 && sp.indicesBody.length > 0);
  assert.equal(sp.indicesHead.length + sp.indicesBody.length, b.indices.length, 'head + body index lists partition the skin');
  let mx = 0, mn = 1; for (let v = 0; v < sp.uvsHead.length; v += 2) { mx = Math.max(mx, sp.uvsHead[v]); mn = Math.min(mn, sp.uvsHead[v]); }
  assert.ok(mn === 0 && Math.abs(mx - 1) < 1e-6, `head u range ${mn}..${mx}`);
});

test('head: skin-weight masks live on the gill cover / maxilla and nowhere else', () => {
  const { S, h } = makeBody(); const HLs = h.HLs, cap = S.cap;
  const at = (u, v) => { const s = u * HLs - cap, y = h.y0 + v * h.HLm; return S.point(s, S.alphaAtHeight(s, y)); };
  const pOp = at(0.9, 0.0), pEye = at(0.3, 0.03), pTail = at(1.4, 0.0), pMax = at(0.3, -0.12);
  assert.ok(h.opercleWeight(pOp[0], pOp[1], Math.PI / 2) > 0.2, 'plate weight on the gill cover');
  assert.equal(h.opercleWeight(pEye[0], pEye[1], Math.PI / 2), 0); assert.equal(h.opercleWeight(pTail[0], pTail[1], Math.PI / 2), 0);
  assert.ok(h.maxillaWeight(pMax[0], pMax[1], Math.PI / 2) > 0.05, 'maxilla strap weight'); assert.equal(h.maxillaWeight(pOp[0], pOp[1], Math.PI / 2), 0);
});

test('head: 3-D landmarks are ordered and on the right side', () => {
  const { h } = makeBody(); const L = h.landmarks3d();
  for (const n of ['snout_tip', 'mouth_corner', 'eye_center', 'opercle_post_mid', 'nostril', 'preopercle_mid']) assert.ok(L[n], n);
  assert.ok(L.mouth_corner[2] > 0 && L.eye_center[2] > 0 && L.opercle_post_mid[2] > 0, 'right side = +z');
  assert.ok(L.snout_tip[0] > L.nostril[0] && L.nostril[0] > L.eye_center[0] && L.eye_center[0] > L.opercle_post_mid[0]);
  assert.ok(L.eye_center[2] > L.snout_tip[2], 'the eye is lateral to the tip');
});
