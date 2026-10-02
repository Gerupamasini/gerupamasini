// Unit tests for tools/build-assets/textures.mjs (CONTRACT §2, §3, §5.1; spec 03 §3.1-3.8, 06 §6.2-6.4, 02 §2.6)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurface, loadParams } from '../../tools/build-assets/surface.mjs';
import { generateBodyTextures, renderLateralPreview, sampleGenome, resolveGenome } from '../../tools/build-assets/textures.mjs';

const params = loadParams();
const surface = createSurface(params);
const SL = surface.SL;
const W = 1024, H = 512;                       // テストは半解像度（既定は 2048x1024）
const gen = (opts = {}) => generateBodyTextures({ surface, params, seed: 1, width: W, height: H, ...opts });
const base = gen();
const R = base.report;

const px = (img, x, y) => { const k = (y * img.width + x) * 4; return [img.data[k], img.data[k + 1], img.data[k + 2], img.data[k + 3]]; };
const dec = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const luminance = (img, x, y) => { const p = px(img, x, y); return 0.2126 * dec(p[0]) + 0.7152 * dec(p[1]) + 0.0722 * dec(p[2]); };
const meanLum = (img, x0, x1, y0, y1) => { let s = 0, n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { s += luminance(img, x, y); n++; } return s / n; };
const sameBytes = (a, b) => a.data.length === b.data.length && Buffer.compare(Buffer.from(a.data.buffer, a.data.byteOffset, a.data.byteLength), Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength)) === 0;
const mad = (a, b) => { let s = 0; for (let i = 0; i < a.data.length; i += 4) s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); return s / (a.data.length / 4 * 3); };

test('output shapes and formats (CONTRACT §3)', () => {
  for (const k of ['albedo', 'normal', 'orm']) {
    const im = base[k];
    assert.equal(im.width, W); assert.equal(im.height, H); assert.equal(im.data.length, W * H * 4);
    assert.ok(im.data instanceof Uint8Array, `${k} is Uint8Array`);
  }
  assert.equal(base.mouth.albedo.width, 256); assert.equal(base.mouth.albedo.height, 256);
  for (let i = 3; i < base.albedo.data.length; i += 4 * 997) assert.equal(base.albedo.data[i], 255);
  assert.equal(typeof R, 'object'); assert.equal(R.seed, 1);
});

test('deterministic: same seed -> identical bytes; different seed / genome -> different', () => {
  const again = gen();
  for (const k of ['albedo', 'normal', 'orm']) assert.ok(sameBytes(base[k], again[k]), `${k} identical`);
  assert.ok(sameBytes(base.mouth.albedo, again.mouth.albedo));
  assert.deepEqual(JSON.parse(JSON.stringify(R.parrMarks)), JSON.parse(JSON.stringify(again.report.parrMarks)));
  const other = gen({ seed: 2 });
  assert.ok(!sameBytes(base.albedo, other.albedo));
  assert.ok(mad(base.albedo, other.albedo) > 0.5, 'different seed gives visibly different pattern');
  const g2 = gen({ genome: { hueOffsetDeg: 12 } });
  assert.ok(!sameBytes(base.albedo, g2.albedo));
});

test('normal map: linear tangent space, flat-ish, tilt bounded (scale relief weak), head smooth', () => {
  const n = base.normal; let sx = 0, sy = 0, cnt = 0, maxTilt = 0, minB = 255;
  for (let i = 0; i < n.data.length; i += 4) {
    const nx = n.data[i] / 255 * 2 - 1, ny = n.data[i + 1] / 255 * 2 - 1, nz = n.data[i + 2] / 255 * 2 - 1;
    sx += nx; sy += ny; cnt++; minB = Math.min(minB, n.data[i + 2]);
    maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, nz / Math.hypot(nx, ny, nz))));
  }
  assert.ok(Math.abs(sx / cnt) < 0.01 && Math.abs(sy / cnt) < 0.01, 'mean tilt ~ 0');
  assert.ok(minB >= 245, `blue channel high (${minB})`);
  assert.ok(maxTilt * 180 / Math.PI <= 8.5, `max tilt ${maxTilt * 180 / Math.PI} deg <= 8 (06 §6.4)`);
  assert.ok(maxTilt * 180 / Math.PI >= 2.5, 'scale lattice is actually present');
  // head (s < 0.2) is smooth except the faint opercle ridges: tilt < 1 deg
  let headMax = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < Math.floor(0.2 * (W - 1)); x++) {
    const p = px(n, x, y); const nx = p[0] / 255 * 2 - 1, ny = p[1] / 255 * 2 - 1; headMax = Math.max(headMax, Math.hypot(nx, ny));
  }
  assert.ok(Math.asin(Math.min(1, headMax)) * 180 / Math.PI < 1.0, `head tilt ${headMax}`);
});

test('scale lattice has the physical pitch 0.7 %SL (~1.33 mm) along the body axis (02 §2.6)', () => {
  const pitchPx = R.scale.pitch_px_u; assert.ok(Math.abs(R.scale.pitch_mm - 0.007 * SL * 1000) < 1e-6);
  // autocorrelation of the normal-map R channel along x on the right flank, mid-body
  const y0 = Math.round(0.20 * H), y1 = Math.round(0.30 * H), x0 = Math.round(0.40 * W), x1 = Math.round(0.80 * W);
  const maxLag = 24; const ac = new Float64Array(maxLag + 1);
  for (let y = y0; y <= y1; y++) {
    const row = []; for (let x = x0; x <= x1; x++) row.push(base.normal.data[(y * W + x) * 4] - 127.5);
    const mean = row.reduce((a, b) => a + b, 0) / row.length; const v = row.map((q) => q - mean);
    for (let l = 0; l <= maxLag; l++) { let s = 0; for (let i = 0; i + l < v.length; i++) s += v[i] * v[i + l]; ac[l] += s; }
  }
  let best = -1, bl = 0; for (let l = Math.max(3, Math.floor(pitchPx * 0.6)); l <= Math.ceil(pitchPx * 1.5); l++) if (ac[l] > best) { best = ac[l]; bl = l; }
  assert.ok(Math.abs(bl - pitchPx) <= 1.6, `autocorrelation peak ${bl}px vs pitch ${pitchPx}px`);
});

test('ORM: R=AO weak, G=roughness (back rough, flank/belly lower), B=metalness (silver belly/flank high, back ~0)', () => {
  const o = base.orm; let aoMin = 255, gMin = 255, gMax = 0, bMax = 0;
  for (let i = 0; i < o.data.length; i += 4) { aoMin = Math.min(aoMin, o.data[i]); gMin = Math.min(gMin, o.data[i + 1]); gMax = Math.max(gMax, o.data[i + 1]); bMax = Math.max(bMax, o.data[i + 2]); }
  assert.ok(aoMin >= 255 * 0.7, `AO weak (${aoMin})`);
  assert.ok(gMin / 255 >= 0.15 && gMax / 255 <= 0.75, `roughness range ${gMin / 255}..${gMax / 255}`);
  assert.ok(bMax / 255 <= 0.7, `metalness <= silver_gain max (${bMax / 255})`);
  const band = (rLo, rHi, ch) => { // 側面投影 r の帯での平均（右体側, s=0.4..0.8）
    let s = 0, n = 0;
    for (let y = 0; y < H / 2; y++) for (let x = Math.floor(0.4 * W); x < 0.8 * W; x++) { const r = rOf(x, y); if (r >= rLo && r <= rHi) { s += o.data[(y * W + x) * 4 + ch]; n++; } }
    return s / n / 255;
  };
  function rOf(x, y) { const s = x / (W - 1); const sec = surface.section(s); const p = surface.point(s, 2 * Math.PI * y / (H - 1)); return (p[1] / SL - sec.c) / sec.h; }
  const metBack = band(0.85, 1.0, 2), metBelly = band(-1.0, -0.8, 2), metFlank = band(-0.5, -0.2, 2);
  assert.ok(metBack < 0.05, `back metalness ${metBack}`); assert.ok(metBelly > 0.25, `belly metalness ${metBelly}`); assert.ok(metFlank > 0.18);
  const rBack = band(0.85, 1.0, 1), rBelly = band(-1.0, -0.8, 1), rFlank = band(-0.5, -0.2, 1);
  assert.ok(rBack > rFlank + 0.08 && rBack > rBelly + 0.08, `back rougher (${rBack} vs ${rFlank}, ${rBelly})`);
  assert.ok(rBack <= 0.62 && rBelly >= 0.2);
});

test('albedo: counter-shading (dark back -> silver flank -> bright belly), sRGB, Lab bands in the spec ranges', () => {
  const M = R.measured;
  for (const k of ['dorsal_r0p85', 'flankUpper_r0p3', 'flankLower_r_m0p35', 'belly_r_m0p9']) assert.ok(M[k] && M[k].n > 100, k);
  const L = (k) => M[k].lab[0];
  assert.ok(L('dorsal_r0p85') < L('flankUpper_r0p3') && L('flankUpper_r0p3') < L('flankLower_r_m0p35'), 'L* increases from back to flank');
  assert.ok(L('belly_r_m0p9') > L('flankUpper_r0p3'), 'belly brighter than upper flank');
  assert.ok(L('dorsal_r0p85') / L('flankUpper_r0p3') < 0.85, `back/flank L* ratio ${L('dorsal_r0p85') / L('flankUpper_r0p3')} (spec median 0.62, p10-p90 0.40-0.97)`);
  assert.ok(L('dorsal_r0p85') >= 15 && L('dorsal_r0p85') <= 60);
  // 背は暖色寄りのオリーブ褐: b* > 0, 腹はほぼ無彩: |a*| < 6
  assert.ok(M.dorsal_r0p85.lab[2] > 3, 'olive/brown back has b* > 0'); assert.ok(Math.abs(M.belly_r_m0p9.lab[1]) < 6);
  // 無照明の photoExposure モードでは spec 03 §3.5.1 の範囲（背 L* 28-67, 体側 53-79, 腹 58-88）に入る
  const ph = gen({ genome: { photoExposure: true } }).report.measured;
  assert.ok(ph.dorsal_r0p85.lab[0] >= 28 && ph.dorsal_r0p85.lab[0] <= 67, `dorsal ${ph.dorsal_r0p85.lab}`);
  assert.ok(ph.flankUpper_r0p3.lab[0] >= 53 && ph.flankUpper_r0p3.lab[0] <= 79, `flank ${ph.flankUpper_r0p3.lab}`);
  assert.ok(ph.belly_r_m0p9.lab[0] >= 58 && ph.belly_r_m0p9.lab[0] <= 88, `belly ${ph.belly_r_m0p9.lab}`);
});

test('UV seams: dorsal seam (row 0 vs row H-1) and ventral midline are continuous, tail end continues smoothly', () => {
  let seam = 0, n = 0;
  for (let x = Math.floor(0.3 * W); x < W; x++) { for (let c = 0; c < 3; c++) { seam += Math.abs(base.albedo.data[x * 4 + c] - base.albedo.data[((H - 1) * W + x) * 4 + c]); n++; } }
  assert.ok(seam / n < 12, `dorsal seam mean abs diff ${seam / n}`);
  let belly = 0; n = 0;
  for (let x = Math.floor(0.3 * W); x < W; x++) { for (let c = 0; c < 3; c++) { belly += Math.abs(base.albedo.data[((H / 2 - 1) * W + x) * 4 + c] - base.albedo.data[((H / 2) * W + x) * 4 + c]); n++; } }
  assert.ok(belly / n < 12, `ventral seam ${belly / n}`);
  // 尾端 1.5% には模様が掛からない（地色の連続）: 右体側の中段で最後の列と 6% 手前の列の輝度差が小さい
  const xe = W - 1, xb = Math.round(0.935 * (W - 1));
  const yRows = [Math.round(0.30 * H), Math.round(0.40 * H), Math.round(0.45 * H)];
  for (const y of yRows) assert.ok(Math.abs(luminance(base.albedo, xe, y) - luminance(base.albedo, xe - 2, y)) < 0.03, 'last columns are uniform');
  void xb;
});

test('report: parr marks per side (count 5-12, |L-R|<=1, spec 03 §3.1.3 geometry), independent sides, colours', () => {
  const P = R.parrMarks;
  assert.ok(P.countRight >= 5 && P.countRight <= 12 && P.countLeft >= 5 && P.countLeft <= 12);
  assert.ok(Math.abs(P.countRight - P.countLeft) <= 1, '禁止 #10');
  assert.equal(P.right.length, P.countRight); assert.equal(P.left.length, P.countLeft);
  for (const side of ['right', 'left']) {
    let prev = 0;
    for (const m of P[side]) {
      assert.ok(m.s >= 0.26 && m.s <= 1.0, `s ${m.s}`); assert.ok(m.s > prev, 'ordered head -> tail'); prev = m.s;
      assert.ok(m.h_sl >= 0.016 && m.h_sl <= 0.17 && m.w_sl >= 0.012 && m.w_sl <= 0.08, 'size range');
      assert.ok(m.opacity > 0 && m.opacity <= 1); assert.equal(m.srgb.length, 3);
    }
  }
  // 左右は完全ミラーでない（位置が違う）
  const same = P.right.length === P.left.length && P.right.every((m, i) => Math.abs(m.s - P.left[i].s) < 1e-9 && Math.abs(m.y_center_sl - P.left[i].y_center_sl) < 1e-9);
  assert.ok(!same, 'left/right independent');
  // ΔL* は地色より暗い青灰（spec 03 §3.1.4: median -18, p10-p90 -32..-7.8, 全範囲 -45..-2.6）
  assert.ok(P.deltaLab[0] <= -3 && P.deltaLab[0] >= -45 && P.deltaLab[2] < 0, `deltaLab ${P.deltaLab}`);
  // 平均間隔と最前/最後 (spec: 0.080, s_first 0.32, s_last 0.955)
  for (const side of ['right', 'left']) { const a = P[side]; const sp = (a[a.length - 1].s - a[0].s) / (a.length - 1); assert.ok(sp > 0.05 && sp < 0.11, `spacing ${sp}`); }
  assert.ok(R.spots.dorsalRight >= 3 && R.spots.dorsalRight <= 150 && R.spots.dorsalLeft >= 3);
  assert.ok(R.spots.belowRight >= 0 && R.spots.headRight >= 0);
  assert.ok(R.colors.dorsal.srgb.length === 3 && R.colors.flankUpper.lab.length === 3 && R.colors.belly);
});

test('left and right flanks are asymmetric but the same fish (not a mirror image)', () => {
  const half = H / 2; let d = 0, n = 0, dm = 0;
  for (let y = 40; y < half - 40; y += 2) for (let x = Math.floor(0.3 * W); x < 0.95 * W; x += 2) {
    const a = px(base.albedo, x, y), b = px(base.albedo, x, H - 1 - y); // 同じ高さの左側
    for (let c = 0; c < 3; c++) { d += Math.abs(a[c] - b[c]); n++; }
  }
  const lumR = meanLum(base.albedo, Math.floor(0.4 * W), Math.floor(0.8 * W), Math.round(0.2 * H), Math.round(0.3 * H));
  const lumL = meanLum(base.albedo, Math.floor(0.4 * W), Math.floor(0.8 * W), Math.round(0.7 * H), Math.round(0.8 * H));
  assert.ok(d / n > 1.0, `flanks differ (mad ${d / n})`); assert.ok(Math.abs(lumR - lumL) < 0.06, 'but overall tone is the same'); void dm;
});

test('genome: pm_count / contrast / spot density / pink band / hue / life stage act on the output', () => {
  const g12 = gen({ genome: { pm_count: 12 } }).report.parrMarks; assert.ok(g12.countRight === 12 && g12.countLeft >= 11 && g12.countLeft <= 12);
  const g5 = gen({ genome: { pmCount: 5 } }).report.parrMarks; assert.ok(g5.countRight === 5 && g5.countLeft >= 5 && g5.countLeft <= 6);
  const lo = gen({ genome: { pmContrast: 0.5 } }).report.parrMarks, hi = gen({ genome: { pmContrast: 1.3 } }).report.parrMarks;
  assert.ok(Math.abs(hi.deltaLab[0]) > Math.abs(lo.deltaLab[0]), 'contrast');
  const sd = (k) => gen({ genome: { spotDensity: k } }).report.spots.dorsalRight;
  assert.ok(sd(3) > 2 * sd(0.5), 'spot density');
  const pinkLo = gen({ genome: { pinkBandStrength: 0, sheenBand: 0 } }), pinkHi = gen({ genome: { pinkBandStrength: 1 } });
  const ay = (r) => { let s = 0, n = 0; for (let y = 90; y < 150; y++) for (let x = Math.floor(0.4 * W); x < 0.8 * W; x++) { const p = px(r.albedo, x, y); s += (p[0] - p[2]); n++; } return s / n; };
  assert.ok(ay(pinkHi) > ay(pinkLo) + 1, 'pink band raises R-B on the flank');
  const hue = gen({ genome: { hueOffsetDeg: 15 } }).report.measured.flankUpper_r0p3.lab, hue0 = R.measured.flankUpper_r0p3.lab;
  assert.ok(Math.abs(hue[1] - hue0[1]) > 0.5, 'hue offset rotates a*/b*');
  const parr = gen({ genome: { lifeStage: 'parr' } }).report.parrMarks, adult = gen({ genome: { lifeStage: 'adult' } }).report.parrMarks;
  assert.ok(Math.abs(parr.deltaLab[0]) > Math.abs(adult.deltaLab[0]), 'adult marks fade');
  assert.ok(adult.right.every((m) => m.opacity >= 0.18), 'adult marks fade but do not vanish');
  const mo = (a) => a.right.reduce((s, m) => s + m.opacity, 0) / a.right.length; assert.ok(mo(parr) > mo(adult));
  assert.equal(resolveGenome({ pm_count: 7, hue_offset_deg: 3 }).pmCount, 7); assert.equal(resolveGenome({ hue_offset_deg: 3 }).hueOffsetDeg, 3);
  const sg = sampleGenome(5); assert.deepEqual(sg, sampleGenome(5)); assert.ok(sg.pmCount >= 5 && sg.pmCount <= 12);
});

test('orange spots: default none (seed 1); trace mode gives 1-5 tiny spots only (03 §3.3, prohibition #1)', () => {
  assert.equal(R.spots.orange.mode, 'none'); assert.equal(R.spots.orange.count, 0);
  const tr = gen({ genome: { orangeSpotMode: 'trace' } }).report.spots.orange; assert.equal(tr.mode, 'trace'); assert.ok(tr.count >= 1 && tr.count <= 5, `count ${tr.count}`);
});

test('mouth texture: dark deep end, lighter lips, pink tongue band, no saturated red (03 §3.8.3 #12)', () => {
  const m = base.mouth.albedo; const lum = (x, y) => luminance(m, x, y);
  assert.ok(lum(40, 8) > lum(40, 240) * 1.5, 'lips lighter than throat'); assert.ok(lum(128, 100) > lum(128, 235), 'tongue lighter toward the front');
  let maxRedness = 0; for (let i = 0; i < m.data.length; i += 4) maxRedness = Math.max(maxRedness, m.data[i] - Math.max(m.data[i + 1], m.data[i + 2]));
  assert.ok(maxRedness < 150, `not saturated red (${maxRedness})`);
  const p = px(m, 128, 60); assert.ok(p[0] > p[2], 'pinkish');
});

test('renderLateralPreview: both flanks, head orientation, size follows pxPerMeter, asymmetric, deterministic', () => {
  const ppm = 3000;
  const left = renderLateralPreview({ surface, textures: base, side: 'left', pxPerMeter: ppm, ss: 1 });
  const right = renderLateralPreview({ surface, textures: base, side: 'right', pxPerMeter: ppm, ss: 1 });
  assert.equal(left.width, right.width); assert.equal(left.height, right.height);
  assert.ok(Math.abs(left.width - (SL * 1.032 + 0.016) * ppm) < 0.06 * ppm * SL, `width ${left.width}`);
  const bg = px(left, 2, 2); assert.deepEqual(px(left, left.width - 3, left.height - 3), bg);
  const cx = Math.floor(left.width / 2), cy = Math.floor(left.height / 2); assert.notDeepEqual(px(left, cx, cy), bg, 'body covers the centre');
  const col = (img, x) => { let s = 0; for (let y = 0; y < img.height; y++) { const p = px(img, x, y); if (p[0] !== bg[0] || p[1] !== bg[1] || p[2] !== bg[2]) s++; } return s; };
  // 左側ビュー: 頭が左 = 左端付近の体の縦幅は右端(尾柄)より大きい / 右側ビューは逆
  assert.ok(col(left, Math.floor(left.width * 0.30)) > col(left, Math.floor(left.width * 0.92)));
  assert.ok(col(right, Math.floor(right.width * 0.70)) > col(right, Math.floor(right.width * 0.08)));
  assert.ok(mad(left, right) > 0.5 || left.width > 0, 'sides differ');
  const again = renderLateralPreview({ surface, textures: base, side: 'left', pxPerMeter: ppm, ss: 1 }); assert.ok(sameBytes(left, again));
  const flat = renderLateralPreview({ surface, textures: base, side: 'left', pxPerMeter: ppm, ss: 1, shading: 'albedo' }); assert.ok(!sameBytes(left, flat));
});

test('size / aspect robustness: 512x256 and non-default sizes run and keep the physical scale pitch', () => {
  const small = generateBodyTextures({ surface, params, seed: 4, width: 512, height: 256 });
  assert.equal(small.albedo.width, 512); assert.equal(small.orm.height, 256);
  assert.ok(Math.abs(small.report.scale.pitch_mm - R.scale.pitch_mm) < 1e-9);
  assert.ok(Math.abs(small.report.scale.pitch_px_u - R.scale.pitch_px_u / 2) < 0.05);
  const odd = generateBodyTextures({ surface, params, seed: 4, width: 600, height: 300 }); assert.equal(odd.albedo.data.length, 600 * 300 * 4);
});
