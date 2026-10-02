import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurface, loadParams } from '../../tools/build-assets/surface.mjs';
import { buildEyes, eyePartToBody, socketDisplacement, SOCKET_LOFT } from '../../tools/build-assets/eyes.mjs';
import { buildBody } from '../../tools/build-assets/loft.mjs';

const params = loadParams();
const surface = createSurface(params);
const SL = surface.SL;
const Ro = 0.5 * params.eye.outer_d_over_sl.v * SL;
const eyes = buildEyes({ surface, params, seed: 1 });
const exact = buildEyes({ surface, params, seed: 1, genome: { variation: 0 } });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const apply = (m, p, o) => [m[0] * p[o] + m[4] * p[o + 1] + m[8] * p[o + 2] + m[12], m[1] * p[o] + m[5] * p[o + 1] + m[9] * p[o + 2] + m[13], m[2] * p[o] + m[6] * p[o + 1] + m[10] * p[o + 2] + m[14]];
const luma = (img, x, y) => { const k = (y * img.width + x) * 4; return 0.2126 * img.data[k] + 0.7152 * img.data[k + 1] + 0.0722 * img.data[k + 2]; };

test('structure: two eyes, right = +Z, mirrored centres, gaze lateral + ~10 deg forward', () => {
  for (const side of ['left', 'right']) {
    const e = eyes[side];
    assert.equal(e.center.length, 3); assert.equal(e.axis.length, 3);
    for (const part of ['ball', 'cornea', 'orbit']) {
      const g = e.parts[part];
      for (const k of ['positions', 'normals', 'uvs', 'indices']) assert.ok(g[k] && g[k].length > 0, `${side}.${part}.${k}`);
    }
    near(len(e.axis), 1, 1e-9, 'axis unit');
  }
  assert.ok(eyes.right.center[2] > 0 && eyes.left.center[2] < 0);
  near(eyes.right.center[2], -eyes.left.center[2], 1e-12); near(eyes.right.center[0], eyes.left.center[0], 1e-12); near(eyes.right.center[1], eyes.left.center[1], 1e-12);
  const yaw = Math.atan2(eyes.right.axis[0], eyes.right.axis[2]) * 180 / Math.PI;
  near(yaw, 10, 0.01, 'forward yaw'); assert.ok(Math.abs(eyes.right.axis[1]) < 1e-9, 'horizontal gaze');
  assert.ok(eyes.left.axis[2] < 0 && eyes.left.axis[0] > 0, 'left gaze: -Z and forward');
  assert.equal(eyes.right.bone, 'eye_R'); assert.equal(eyes.left.bone, 'eye_L');
});

test('position and size follow params (02 §2.3 / §2.7)', () => {
  const r = eyes.report;
  near(r.outer_d_over_sl, 0.056, 1e-12); near(r.outer_radius_m, Ro, 1e-9);
  assert.ok(eyes.right.radius < Ro && eyes.right.radius > 0.7 * Ro, 'ball radius is inside the outer (orbit-inclusive) radius');
  // the skin point under the eye: s ~ 0.095, centre at 1/3 of the head height from the top
  const P = r.skin_point_right; near(surface.xToS(P[0]), params.eye.center_s.v, 1e-6);
  const sec = surface.section(params.eye.center_s.v); const top = (sec.c + sec.h) * SL, bot = (sec.c - sec.h) * SL;
  near((top - P[1]) / (top - bot), params.eye.center_height_frac_from_top.v, 1e-6, 'height fraction from the top');
  // eyeball centre is inside the body (below the skin), on the same side
  const cs = surface.xToS(eyes.right.center[0]); assert.ok(Math.abs(cs - 0.095) < 0.01, `centre s=${cs}`);
  assert.ok(eyes.right.center[2] < surface.section(cs).w * SL, 'centre inside the half width');
  // exact spec defaults with variation = 0
  near(exact.report.iris_ring_d_over_outer, 0.64, 1e-12); near(exact.report.pupil_d_over_outer, 0.50, 1e-12);
  // seeded jitter stays inside the spec ranges (iris 0.52-0.9, pupil 0.35-0.70, pupil <= iris - 0.04)
  assert.ok(r.iris_ring_d_over_outer >= 0.52 && r.iris_ring_d_over_outer <= 0.9);
  assert.ok(r.pupil_d_over_outer >= 0.35 && r.pupil_d_over_outer <= r.iris_ring_d_over_outer - 0.04 + 1e-12);
  // the aperture (visible eyeball opening) lies between the iris ring and the outer radius
  assert.ok(r.aperture_mean_m > 0.64 * Ro && r.aperture_mean_m < Ro, `aperture ${r.aperture_mean_m / Ro}`);
});

test('growth: eye diameter ratio falls with size (mt_eye_size) and genome overrides work', () => {
  const parr = buildEyes({ surface, params, genome: { mt_eye_size: 1 } }), adult = buildEyes({ surface, params, genome: { mt_eye_size: -1 } });
  near(parr.report.outer_d_over_sl, 0.058, 1e-12); near(adult.report.outer_d_over_sl, 0.046, 1e-12);
  assert.ok(parr.right.outer_radius > adult.right.outer_radius);
  near(buildEyes({ surface, params, genome: { eye_outer_d_over_sl: 0.05 } }).report.outer_d_over_sl, 0.05, 1e-12);
  // pupil never exceeds iris ring - 0.04
  const big = buildEyes({ surface, params, genome: { pupil_d_over_outer: 0.7, iris_ring_d_over_outer: 0.64 } });
  near(big.report.pupil_d_over_outer, 0.60, 1e-12); assert.ok(big.report.adjusted.length > 0);
});

test('geometry is finite, indexed, with unit normals and UV in [0,1] (ball / cornea)', () => {
  for (const side of ['left', 'right']) for (const part of ['ball', 'cornea', 'orbit']) {
    const g = eyes[side].parts[part]; const n = g.positions.length / 3;
    assert.equal(g.normals.length, g.positions.length); assert.equal(g.uvs.length, n * 2); assert.equal(g.indices.length % 3, 0);
    for (const a of [g.positions, g.normals, g.uvs]) for (const v of a) assert.ok(Number.isFinite(v));
    for (const i of g.indices) assert.ok(i < n);
    for (let v = 0; v < n; v++) near(Math.hypot(g.normals[v * 3], g.normals[v * 3 + 1], g.normals[v * 3 + 2]), 1, 1e-4, `${side}.${part} normal ${v}`);
    for (const u of g.uvs) assert.ok(u >= -1e-6 && u <= 1 + 1e-6, `${part} uv ${u}`);
  }
});

test('ball: dense front, spherical radius, recessed iris; cornea: front-only thin shell outside the ball', () => {
  const { ball, cornea } = eyes.right.parts; const Rb = eyes.right.radius;
  let front = 0, minR = 1e9, maxR = 0, maxZ = -1e9;
  for (let v = 0; v < ball.positions.length; v += 3) {
    const x = ball.positions[v], y = ball.positions[v + 1], z = ball.positions[v + 2]; const r = Math.hypot(x, y, z);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r); maxZ = Math.max(maxZ, z);
    if (z > 0 && Math.hypot(x, y) < 0.7 * Ro) front++;
  }
  assert.ok(front > 4000, `front vertices ${front}`);                         // dense iris/pupil/sclera front
  assert.ok(maxR <= Rb + 1e-9 && minR > Rb - 0.25 * Ro, `ball radius range ${minR / Ro}..${maxR / Ro}`);
  assert.ok(maxZ <= Rb + 1e-9 && maxZ > Rb - 0.2 * Ro);
  const gaps = []; let zmin = 1e9;
  for (let v = 0; v < cornea.positions.length; v += 3) {
    const r = Math.hypot(cornea.positions[v], cornea.positions[v + 1], cornea.positions[v + 2]); gaps.push(r - Rb); zmin = Math.min(zmin, cornea.positions[v + 2]);
  }
  assert.ok(Math.min(...gaps) > 0, 'cornea outside the ball'); assert.ok(Math.max(...gaps) < 0.12 * Ro, `cornea gap ${Math.max(...gaps) / Ro}`);
  assert.ok(zmin > 0, 'cornea is front only');
  // iris plane is recessed behind the cornea apex (06 §6.6.1: ~0.05 outer diameter)
  let corApex = -1e9; for (let v = 2; v < cornea.positions.length; v += 3) corApex = Math.max(corApex, cornea.positions[v]);
  let poleZ = null; for (let v = 0; v < ball.positions.length; v += 3) if (Math.hypot(ball.positions[v], ball.positions[v + 1]) < 1e-12 && ball.positions[v + 2] > 0) poleZ = ball.positions[v + 2];
  const recess = (corApex - poleZ) / (2 * Ro);   // cornea apex -> pupil floor (iris recess 0.065 + pupil extra 0.02 of the outer diameter)
  assert.ok(recess > 0.05 && recess < 0.12, `recess/outer = ${recess}`);
});

test('triangles face outward (ball, cornea) and the orbit ring faces the same way as the skin', () => {
  for (const side of ['left', 'right']) {
    for (const part of ['ball', 'cornea']) {
      const g = eyes[side].parts[part]; let good = 0, total = 0;
      for (let t = 0; t < g.indices.length; t += 3) {
        const a = g.indices[t] * 3, b = g.indices[t + 1] * 3, c = g.indices[t + 2] * 3; const P = g.positions;
        const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const m = [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
        total++; if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 0) good++;
      }
      assert.ok(good / total > 0.99, `${side}.${part} outward ${good}/${total}`);
    }
    const o = eyes[side].parts.orbit; let ok = 0, tot = 0;
    const nb = (() => { const d = eyes[side].orbit_normal, B = eyes[side].basis; return [d[0] * B.x[0] + d[1] * B.x[1] + d[2] * B.x[2], d[0] * B.y[0] + d[1] * B.y[1] + d[2] * B.y[2], d[0] * B.z[0] + d[1] * B.z[1] + d[2] * B.z[2]]; })();
    for (let t = 0; t < o.indices.length; t += 3) {
      const a = o.indices[t] * 3, b = o.indices[t + 1] * 3, c = o.indices[t + 2] * 3; const P = o.positions;
      const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (Math.hypot(...n) < 1e-18) continue; tot++;
      // top half of the profile faces the skin normal direction; the buried underside faces away - the crest region must dominate visually
      if (n[0] * nb[0] + n[1] * nb[1] + n[2] * nb[2] > 0) ok++;
    }
    assert.ok(ok / tot > 0.55, `${side}.orbit outward fraction ${ok / tot}`);
  }
});

test('left eye is the exact mirror of the right eye in body space', () => {
  for (const part of ['ball', 'cornea', 'orbit']) {
    const R = eyes.right.parts[part], L = eyes.left.parts[part];
    assert.equal(R.positions.length, L.positions.length); assert.equal(R.indices.length, L.indices.length);
    let worst = 0;
    for (let v = 0; v < R.positions.length; v += 3) {
      const pr = apply(eyes.right.matrix, R.positions, v), pl = apply(eyes.left.matrix, L.positions, v);
      worst = Math.max(worst, Math.abs(pr[0] - pl[0]), Math.abs(pr[1] - pl[1]), Math.abs(pr[2] + pl[2]));
    }
    assert.ok(worst < 1e-7, `${part} mirror error ${worst}`);
  }
  // proper rotations (det = +1) for both eyes: no negative scale needed
  for (const s of ['left', 'right']) { const { x, y, z } = eyes[s].basis; const c = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]]; near(c[0] * x[0] + c[1] * x[1] + c[2] * x[2], 1, 1e-9, 'det'); }
  // ball centre in body space = matrix translation = EyeAsset.center
  for (const s of ['left', 'right']) { const m = eyes[s].matrix; near(m[12], eyes[s].center[0], 1e-12); near(m[14], eyes[s].center[2], 1e-12); }
});

test('eyePartToBody returns body-space geometry consistent with the matrix', () => {
  for (const side of ['left', 'right']) {
    const e = eyes[side], b = eyePartToBody(e, 'ball');
    // the pupil pole (local origin axis) lands on the gaze line through the centre
    const v0 = [b.positions[0], b.positions[1], b.positions[2]];
    const d = [v0[0] - e.center[0], v0[1] - e.center[1], v0[2] - e.center[2]];
    near(len(d), Math.abs(e.parts.ball.positions[2]), 1e-9); near((d[0] * e.axis[0] + d[1] * e.axis[1] + d[2] * e.axis[2]) / len(d), 1, 1e-9, 'pole on the gaze axis');
    for (let i = 0; i < b.normals.length; i += 3) near(Math.hypot(b.normals[i], b.normals[i + 1], b.normals[i + 2]), 1, 1e-4);
  }
  // eye centre is inside the body: the ball pole sticks out of the bare surface by a few tenths of the outer radius at most
  const pole = eyePartToBody(eyes.right, 'ball'); const sP = surface.xToS(pole.positions[0]);
  assert.ok(sP > 0.08 && sP < 0.12);
});

test('orbit ring wraps the visible aperture and stays on the skin around the eye', () => {
  const e = eyes.right, o = e.parts.orbit; const B = e.basis; const rep = eyes.report;
  const P0 = rep.skin_point_right; let rmin = 1e9, rmax = 0, nearSkin = 0, n = 0;
  for (let v = 0; v < o.positions.length; v += 3) {
    const p = apply(e.matrix, o.positions, v); const d = [p[0] - P0[0], p[1] - P0[1], p[2] - P0[2]];
    const nrm = rep.skin_normal_right; const h = d[0] * nrm[0] + d[1] * nrm[1] + d[2] * nrm[2];
    const r = Math.hypot(d[0] - h * nrm[0], d[1] - h * nrm[1], d[2] - h * nrm[2]);
    rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); n++; if (Math.abs(h) < 1.2 * Ro) nearSkin++;
  }
  assert.ok(rmin < 0.85 * Ro && rmax > 0.98 * Ro && rmax < 1.4 * Ro, `orbit radial range ${rmin / Ro}..${rmax / Ro}`);
  assert.ok(nearSkin === n, 'orbit vertices stay near the skin plane');
  assert.ok(B.z[2] > 0.9);
});

test('iris texture: black round pupil, thin gold ring at the spec radii, dark rim, sRGB RGBA', () => {
  const T = exact.textures.iris; assert.equal(T.width, 512); assert.equal(T.height, 512); assert.equal(T.data.length, 512 * 512 * 4);
  for (let i = 3; i < T.data.length; i += 4) { assert.equal(T.data[i], 255); }
  const c = 256; assert.ok(luma(T, c, c) < 45, 'pupil is black');
  const tp = exact.report.pupil_d_over_outer, ti = exact.report.iris_ring_d_over_outer;
  const radii = [];
  for (let a = 0; a < 16; a++) {
    const ph = a / 16 * Math.PI * 2; let r = 0;
    for (; r < 256; r += 0.5) { const x = Math.round(c + r * Math.cos(ph) - 0.5), y = Math.round(c - r * Math.sin(ph) - 0.5); if (luma(T, x, y) > 70) break; }
    radii.push(r / 256);
  }
  const mean = radii.reduce((s, v) => s + v, 0) / radii.length;
  near(mean, tp, 0.02, 'pupil radius from the texture'); for (const r of radii) near(r, mean, 0.012, 'round pupil');
  // gold: warm (R > G > B) and bright at the middle of the ring; dark beyond the ring edge; very dark at the orbit rim
  let warm = 0;
  for (let a = 0; a < 24; a++) {
    const ph = a / 24 * Math.PI * 2, r = 0.5 * (tp + ti) * 256; const k = (Math.round(c - r * Math.sin(ph)) * 512 + Math.round(c + r * Math.cos(ph))) * 4;
    const R = T.data[k], G = T.data[k + 1], B = T.data[k + 2]; if (R > G && G > B && R > 90) warm++;
  }
  assert.ok(warm >= 20, `gold ring warm pixels ${warm}/24`);
  const edge = Math.round(c + (ti + 0.045) * 256); assert.ok(luma(T, edge, c) < 80, 'dark margin outside the ring');
  assert.ok(luma(T, Math.round(c + 0.97 * 256), c) < 50, 'dark rim at the orbit');
});

test('normal map (green = up) and ORM (R=AO, G=roughness, B=metal) maps are linear data of the same size', () => {
  const N = eyes.textures.iris_normal, O = eyes.textures.iris_orm;
  assert.equal(N.width, 512); assert.equal(O.width, 512);
  const k = (256 * 512 + 256) * 4; // centre: flat
  near(N.data[k], 128, 6); near(N.data[k + 1], 128, 6); assert.ok(N.data[k + 2] > 230);
  assert.ok(O.data[k] > 240, 'no AO at the pupil'); assert.ok(O.data[k + 1] < 60, 'glossy pupil'); assert.equal(O.data[k + 2], 0, 'pupil is not metallic');
  const edge = (256 * 512 + 505) * 4; assert.ok(O.data[edge] < 150, 'AO darkens the orbit rim');
  // normals are unit-length
  for (let i = 0; i < N.data.length; i += 4 * 997) {
    const x = N.data[i] / 255 * 2 - 1, y = N.data[i + 1] / 255 * 2 - 1, z = N.data[i + 2] / 255 * 2 - 1; near(Math.hypot(x, y, z), 1, 0.03);
  }
  // orbit strip: dark inner edge, head colour at the outer edge
  const OR = eyes.textures.orbit; assert.ok(luma(OR, 10, 2) < luma(OR, 10, OR.height - 2));
});

test('deterministic by seed; different seeds make different individuals', () => {
  const a = buildEyes({ surface, params, seed: 7 }), b = buildEyes({ surface, params, seed: 7 }), c = buildEyes({ surface, params, seed: 8 });
  assert.deepEqual(a.textures.iris.data, b.textures.iris.data); assert.deepEqual(a.right.parts.ball.positions, b.right.parts.ball.positions);
  assert.deepEqual(a.report.iris_gold, b.report.iris_gold);
  assert.notDeepEqual(a.textures.iris.data, c.textures.iris.data);
  assert.notEqual(a.report.pupil_d_over_outer, c.report.pupil_d_over_outer);
  // individual variation of gold density
  const lo = buildEyes({ surface, params, genome: { iris_gold: 0.1 } }), hi = buildEyes({ surface, params, genome: { iris_gold: 1.0 } });
  const sat = (img) => { let s = 0, n = 0; for (let y = 0; y < 512; y += 7) for (let x = 0; x < 512; x += 7) { const k = (y * 512 + x) * 4; if (luma(img, x, y) > 100) { s += img.data[k] - img.data[k + 2]; n++; } } return s / n; };
  assert.ok(sat(hi.textures.iris) > sat(lo.textures.iris) + 20, 'more gold = more saturated');
});

test('orbit outline is a smooth round curve (no polygon / notches)', () => {
  for (const side of ['left', 'right']) {
    const e = eyes[side], o = e.parts.orbit, L = e.orbit_layout, rep = eyes.report;
    const P0 = side === 'right' ? rep.skin_point_right : [rep.skin_point_right[0], rep.skin_point_right[1], -rep.skin_point_right[2]];
    const nr = side === 'right' ? rep.skin_normal_right : [rep.skin_normal_right[0], rep.skin_normal_right[1], -rep.skin_normal_right[2]];
    const rad = [];
    for (let i = 0; i < L.around; i++) {
      const p = apply(e.matrix, o.positions, (i * L.profile + L.outer_index) * 3); const d = [p[0] - P0[0], p[1] - P0[1], p[2] - P0[2]];
      const h = d[0] * nr[0] + d[1] * nr[1] + d[2] * nr[2]; rad.push(Math.hypot(d[0] - h * nr[0], d[1] - h * nr[1], d[2] - h * nr[2]));
    }
    const mean = rad.reduce((a, b) => a + b, 0) / rad.length;
    near(mean, 1.05 * Ro, 0.04 * Ro, 'mean outer radius');
    for (const r of rad) near(r, mean, 0.02 * mean, 'round outline');
    assert.ok(L.around >= 128, 'enough segments around the ring');
    // UV seam duplicate column has the same position
    const a = o.positions.slice(0, 3), b = o.positions.slice(L.around * L.profile * 3, L.around * L.profile * 3 + 3);
    for (let k = 0; k < 3; k++) near(a[k], b[k], 1e-9, 'seam');
  }
});

test('loft eye socket in loft.mjs matches SOCKET_LOFT (kept in sync) and is resolved by the loft mesh', () => {
  const body = buildBody(surface, params); const Ro2 = Ro;
  const P0 = eyes.report.skin_point_right; let worst = 0, n = 0;
  for (let v = 0; v < body.positions.length / 3; v++) {
    const s = body.attrs._S[v], a = body.attrs._ALPHA[v]; if (s < 0 || a < 0.2 || a > 1.6) continue; // right flank around the eye
    const plain = surface.point(s, a); const rr = Math.hypot(plain[0] - P0[0], plain[1] - P0[1], plain[2] - P0[2]); if (rr > 2.4 * Ro2) continue;
    const nrm = surface.normal(s, a); const p = [body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2]];
    const d = (p[0] - plain[0]) * nrm[0] + (p[1] - plain[1]) * nrm[1] + (p[2] - plain[2]) * nrm[2];
    worst = Math.max(worst, Math.abs(d - socketDisplacement(rr, Ro2, SOCKET_LOFT))); n++;
  }
  assert.ok(n > 100, `loft vertices around the eye: ${n}`); assert.ok(worst < 0.15e-3, `loft vs SOCKET_LOFT displacement mismatch ${worst * 1e3} mm`);
  // smoothness: the socket's curvature per loft ring spacing stays moderate (< 20 degrees of slope change per 0.76 mm ring)
  const step = 0.004 * SL; let maxSlopeChange = 0;
  for (let r = 0.2 * Ro2; r < 2.6 * Ro2; r += 0.05 * Ro2) {
    const d0 = socketDisplacement(r - step, Ro2), d1 = socketDisplacement(r, Ro2), d2 = socketDisplacement(r + step, Ro2);
    maxSlopeChange = Math.max(maxSlopeChange, Math.abs(Math.atan2(d2 - d1, step) - Math.atan2(d1 - d0, step)));
  }
  assert.ok(maxSlopeChange * 180 / Math.PI < 12, `socket slope change per ring ${maxSlopeChange * 180 / Math.PI} deg`);
});
