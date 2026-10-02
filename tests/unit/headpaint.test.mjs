import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadParams, createSurface } from '../../tools/build-assets/surface.mjs';
import { applyStage } from '../../tools/build-assets/stages.mjs';
import { applyHead, createHead, syncEyeParams } from '../../tools/build-assets/head.mjs';
import { generateBodyTextures } from '../../tools/build-assets/textures.mjs';
import { generateHeadTextures, bakeHeadIntoBody, generateMouthTexture, sampleAtlas } from '../../tools/build-assets/headpaint.mjs';

const spec = JSON.parse(fs.readFileSync(new URL('../../assets/src/head_adult.json', import.meta.url), 'utf8'));
const base = applyStage(loadParams(), JSON.parse(fs.readFileSync(new URL('../../assets/src/stage_adult.json', import.meta.url), 'utf8')), 'adult');
const params = applyHead(base, spec);
const surface = createSurface(params); syncEyeParams(surface, params, spec);
const head = createHead(surface, params, spec);
const S_END = 0.27, W = 192, H = 256;
const bodyTex = generateBodyTextures({ surface, params, seed: 1, genome: {}, width: 512, height: 256 });
const hash = (img) => crypto.createHash('sha1').update(img.data).digest('hex');
const run = (seed = 1, bt = bodyTex) => generateHeadTextures({ surface, params: structuredClone(params), head, spec, seed, bodyTex: bt, sEnd: S_END, width: W, height: H });
const A = run(1);

test('head atlas: sizes, opaque RGBA8, report', () => {
  for (const k of ['albedo', 'normal', 'orm']) {
    const im = A[k]; assert.equal(im.width, W); assert.equal(im.height, H); assert.equal(im.data.length, W * H * 4);
    for (let i = 3; i < im.data.length; i += 4) assert.equal(im.data[i], 255);
  }
  assert.ok(A.report.regions.cap && A.report.regions.cheek && A.report.regions.opercle, 'region medians reported');
  assert.ok(A.report.regions.cap.median_srgb_photo_equiv, 'cap painted');
  assert.deepEqual(A.mouth.albedo.width, 256);
  assert.ok(A.render && A.render.clearcoat > 0);
});

test('head atlas: deterministic per seed, different between seeds', () => {
  const B = run(1), C = run(2);
  for (const k of ['albedo', 'normal', 'orm']) { assert.equal(hash(A[k]), hash(B[k]), `${k} deterministic`); }
  assert.notEqual(hash(A.albedo), hash(C.albedo), 'seed changes the spots / patches');
});

test('head atlas: value ranges (normals unit length and sane tilt, roughness / metalness / AO bounded, colours not clipped)', () => {
  const n = A.normal.data; let maxTilt = 0, badLen = 0;
  for (let i = 0; i < n.length; i += 4) {
    const x = n[i] / 127.5 - 1, y = n[i + 1] / 127.5 - 1, z = n[i + 2] / 127.5 - 1, l = Math.hypot(x, y, z);
    if (Math.abs(l - 1) > 0.03) badLen++;
    maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, z / l)));
  }
  assert.ok(badLen < n.length / 4 * 0.001, `normal length off for ${badLen} texels`);
  assert.ok(maxTilt * 180 / Math.PI < 52, `max tilt ${(maxTilt * 180 / Math.PI).toFixed(1)} deg`);
  const o = A.orm.data; let rmin = 255, rmax = 0, mmax = 0, amin = 255;
  for (let i = 0; i < o.length; i += 4) { amin = Math.min(amin, o[i]); rmin = Math.min(rmin, o[i + 1]); rmax = Math.max(rmax, o[i + 1]); mmax = Math.max(mmax, o[i + 2]); }
  assert.ok(rmin >= 0.05 * 255 - 1 && rmax <= 255, 'roughness range');
  assert.ok(mmax / 255 <= 0.75, `metalness max ${mmax / 255}`);
  assert.ok(amin >= 20, `AO min ${amin}`);
  let sat = 0; const a = A.albedo.data; for (let i = 0; i < a.length; i += 4) if (a[i] === 255 && a[i + 1] === 255 && a[i + 2] === 255) sat++;
  assert.equal(sat, 0, 'no white clipping in the albedo');
});

test('head atlas: dorsal midline wraps (last row == first row, neighbouring rows continuous), flanks are not mirror copies', () => {
  for (const k of ['albedo', 'normal', 'orm']) {
    const d = A[k].data, rb = W * 4;
    for (let i = 0; i < rb; i++) assert.equal(d[(H - 1) * rb + i], d[i], `${k} row wrap`);
    // continuity across the seam: the step between the rows either side of v = 0 is not larger than a typical neighbouring-row step elsewhere
    const step = (y0, y1) => { let s = 0; for (let i = 0; i < rb; i++) s += Math.abs(d[y0 * rb + i] - d[y1 * rb + i]); return s / rb; };
    let typ = 0; for (let y = 8; y < H - 9; y += 8) typ = Math.max(typ, step(y, y + 1));
    assert.ok(step(H - 2, 0) <= typ * 1.5 + 1 && step(0, 1) <= typ * 1.5 + 1, `${k} seam step ${step(H - 2, 0).toFixed(2)} / ${step(0, 1).toFixed(2)} vs typical ${typ.toFixed(2)}`);
  }
  // right flank (rows 1..H/2) vs left flank mirrored (rows H-1-y): similar colour field, but different noise / spots
  const d = A.albedo.data, rb = W * 4; let diff = 0, n = 0, mean = 0;
  for (let y = 4; y < H / 2 - 4; y++) for (let x = 0; x < W * 0.9; x++) for (let c = 0; c < 3; c++) { const p = d[y * rb + x * 4 + c], q = d[(H - 1 - y) * rb + x * 4 + c]; diff += Math.abs(p - q); mean += p; n++; }
  assert.ok(diff / n > 0.8, `flanks must not be exact mirror images (mean |dL-R| ${(diff / n).toFixed(2)})`);
  assert.ok(diff / n < 0.25 * mean / n, `flanks should be similar (mean |dL-R| ${(diff / n).toFixed(2)})`);
});

test('head atlas: no colour / normal / ORM jump at the head-body seam (s = sEnd)', () => {
  const x = W - 1, tmp = [0, 0, 0, 0]; let worst = 0;
  for (const [k, tol] of [['albedo', 3], ['normal', 3], ['orm', 3]]) {
    let m = 0;
    for (let y = 0; y < H; y++) { sampleAtlas(bodyTex[k], S_END, y / (H - 1), tmp); for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(A[k].data[(y * W + x) * 4 + c] - tmp[c])); }
    assert.ok(m <= tol + 1, `${k} seam max difference ${m.toFixed(1)}`); worst = Math.max(worst, m);
  }
  // the cross-fade is gradual: the step between the last two columns is no larger than the body atlas' own step there
  const d = A.albedo.data, tb = [0, 0, 0, 0], tc = [0, 0, 0, 0]; let m = 0, mb = 0;
  for (let y = 0; y < H; y++) {
    sampleAtlas(bodyTex.albedo, S_END, y / (H - 1), tb); sampleAtlas(bodyTex.albedo, S_END - (S_END + surface.cap) / (W - 1), y / (H - 1), tc);
    for (let c = 0; c < 3; c++) { m = Math.max(m, Math.abs(d[(y * W + W - 1) * 4 + c] - d[(y * W + W - 2) * 4 + c])); mb = Math.max(mb, Math.abs(tb[c] - tc[c])); }
  }
  assert.ok(m <= mb + 4, `last-column step ${m} vs body ${mb.toFixed(1)}`);
});

test('bakeHeadIntoBody: head region replaced by the down-sampled head atlas, rest untouched, wrap row kept', () => {
  const bt = { albedo: { ...bodyTex.albedo, data: new Uint8Array(bodyTex.albedo.data) }, normal: { ...bodyTex.normal, data: new Uint8Array(bodyTex.normal.data) }, orm: { ...bodyTex.orm, data: new Uint8Array(bodyTex.orm.data) } };
  const before = new Uint8Array(bodyTex.albedo.data);
  bakeHeadIntoBody({ surface, bodyTex: bt, headTex: A, sEnd: S_END });
  const Wb = bt.albedo.width, Hb = bt.albedo.height;
  // untouched beyond sEnd
  for (let y = 0; y < Hb - 1; y += 7) for (let x = Math.ceil(0.272 * (Wb - 1)); x < Wb; x += 5) for (let c = 0; c < 3; c++) assert.equal(bt.albedo.data[(y * Wb + x) * 4 + c], before[(y * Wb + x) * 4 + c]);
  // head region now looks like the head atlas (compare a few samples)
  const tmp = [0, 0, 0, 0]; let md = 0, cnt = 0;
  for (let y = 8; y < Hb - 8; y += 9) for (let xb = 6; xb < 0.2 * (Wb - 1); xb += 7) {
    const s = xb / (Wb - 1); sampleAtlas(A.albedo, (s + surface.cap) / (S_END + surface.cap), y / (Hb - 1), tmp);
    for (let c = 0; c < 3; c++) { md += Math.abs(bt.albedo.data[(y * Wb + xb) * 4 + c] - tmp[c]); cnt++; }
  }
  assert.ok(md / cnt < 14, `baked region matches the head atlas (mean |d| ${(md / cnt).toFixed(1)})`);
  assert.ok(md / cnt >= 0, 'sampled');
  // continuous at the end of the baked zone: no new step compared with the original body atlas
  const stepAt = (img, y, x) => { let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(img.data[(y * Wb + x) * 4 + c] - img.data[(y * Wb + x + 1) * 4 + c])); return m; };
  let worstNew = 0; for (let y = 0; y < Hb - 1; y += 2) for (let x = Math.round(0.257 * (Wb - 1)); x < Math.round(0.268 * (Wb - 1)); x++) worstNew = Math.max(worstNew, stepAt(bt.albedo, y, x) - stepAt({ data: before }, y, x));
  assert.ok(worstNew < 14, `new step introduced by the bake ${worstNew}`);
  for (const k of ['albedo', 'normal', 'orm']) for (let i = 0; i < Wb * 4; i++) assert.equal(bt[k].data[(Hb - 1) * Wb * 4 + i], bt[k].data[i], `${k} wrap row`);
});

test('mouth lining texture: size, wrap, pale at the lips and dark at the throat', () => {
  const m = generateMouthTexture({ seed: 1, size: 64 }).albedo; assert.equal(m.width, 64);
  for (let x = 0; x < 64; x++) for (let c = 0; c < 3; c++) assert.equal(m.data[(63 * 64 + x) * 4 + c], m.data[x * 4 + c]);
  const lum = (x, y) => (m.data[(y * 64 + x) * 4] + m.data[(y * 64 + x) * 4 + 1] + m.data[(y * 64 + x) * 4 + 2]) / 3;
  assert.ok(lum(2, 32) > lum(62, 32) + 40, 'lips brighter than the throat');
});
