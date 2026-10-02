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
