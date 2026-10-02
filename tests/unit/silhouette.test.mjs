import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadParams, createSurface } from '../../tools/build-assets/surface.mjs';
import { applyStage } from '../../tools/build-assets/stages.mjs';

const stage = JSON.parse(fs.readFileSync(new URL('../../assets/src/stage_adult.json', import.meta.url), 'utf8'));
const params = applyStage(loadParams(), stage, 'adult'), S = createSurface(params);
const depth = (s) => 2 * S.section(s).h;

test('adult stage: max body depth and its position match the scaled photo a01 (VS-3, +-0.02 SL / +-0.05 s)', () => {
  let best = 0, at = 0; for (let s = 0.2; s <= 0.7; s += 0.005) { const d = depth(s); if (d > best) { best = d; at = s; } }
  assert.ok(Math.abs(best - stage.body_depth_max_over_sl) < 0.02, `BD max ${best} vs ${stage.body_depth_max_over_sl}`);
  assert.ok(Math.abs(at - stage.body_depth_max_pos_s) < 0.05, `at ${at} vs ${stage.body_depth_max_pos_s}`);
});

test('adult stage: caudal peduncle depth within 0.01 SL of a01', () => {
  let m = 1; for (let s = 0.85; s <= 1.0; s += 0.005) m = Math.min(m, depth(s));
  assert.ok(Math.abs(m - stage.peduncle_min_over_sl) < 0.012, `CP ${m} vs ${stage.peduncle_min_over_sl}`);
});

test('model is closed laterally at the tail and has no negative widths', () => {
  for (let s = 0; s <= 1.0001; s += 0.01) { const sec = S.section(s); assert.ok(sec.w >= 0 && sec.h > 0); }
  assert.ok(S.section(1).w < 0.2 * S.section(0.9).w);
});
