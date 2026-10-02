// Unit tests for tools/build-assets/fins.mjs  (CONTRACT §1, §3, §5.2; spec 02 §2.5, 03 §3.5, 05 §5.1.2, 06 §6.5)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurface, loadParams } from '../../tools/build-assets/surface.mjs';
import { buildFins, FIN_IDS, ATLAS_CELLS, ATLAS_SIZE } from '../../tools/build-assets/fins.mjs';

const params = loadParams();
const surface = createSurface(params);
const SL = surface.SL;
const FP = params.fins;
const TOL = 0.01;                       // 02 §2.9.1: fin dimensions are accepted within +-0.01 SL

const base = buildFins({ surface, params, seed: 1 });
const G = base.geometry;
const NV = G.positions.length / 3;

const rangeOf = (name) => base.ranges.find((r) => r.name === name);
const vertsOf = (name) => { const r = rangeOf(name); const out = []; for (let v = r.vertexStart; v < r.vertexStart + r.vertexCount; v++) out.push(v); return out; };
const P = (v) => [G.positions[v * 3], G.positions[v * 3 + 1], G.positions[v * 3 + 2]];

// implicit body function (< 1 inside the loft)
function bodyF(p) {
  const s = Math.min(Math.max(surface.xToS(p[0]), 0), 1); const sec = surface.section(s);
  const yy = (p[1] - sec.c * SL) / (sec.h * SL), zz = p[2] / (sec.w * SL);
  const n = yy >= 0 ? params.section.exponent_dorsal.v : params.section.exponent_ventral.v;
  return Math.pow(Math.abs(yy), n) + Math.pow(Math.abs(zz), n);
}

test('interface: typed arrays, consistent lengths, finite values, unit normals', () => {
  const { positions, normals, uvs, indices, attrs } = G;
  assert.ok(positions instanceof Float32Array && normals instanceof Float32Array && uvs instanceof Float32Array);
  assert.ok(indices instanceof Uint32Array);
  assert.equal(normals.length, positions.length);
  assert.equal(uvs.length / 2, NV);
  for (const k of ['_FINID', '_FINT', '_FINR']) { assert.ok(attrs[k] instanceof Float32Array, k); assert.equal(attrs[k].length, NV, k); }
  assert.equal(indices.length % 3, 0);
  for (const i of indices) assert.ok(i < NV);
  for (const a of [positions, normals, uvs, attrs._FINT, attrs._FINR]) for (const x of a) assert.ok(Number.isFinite(x));
  for (let v = 0; v < NV; v++) { const l = Math.hypot(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]); assert.ok(Math.abs(l - 1) < 1e-3, `normal ${v} length ${l}`); }
  for (const x of uvs) assert.ok(x >= 0 && x <= 1);
});

test('ranges: 8 fins cover the index buffer contiguously; _FINID matches the range id; _FINT/_FINR in [0,1]', () => {
  assert.deepEqual(base.ranges.map((r) => r.name), ['dorsal', 'adipose', 'pectoral_R', 'pectoral_L', 'pelvic_R', 'pelvic_L', 'anal', 'caudal']);
  let at = 0;
  for (const r of base.ranges) {
    assert.equal(r.id, FIN_IDS[r.name]);
    assert.equal(r.start, at); at += r.count; assert.equal(r.count % 3, 0);
    for (let i = r.start; i < r.start + r.count; i++) { const v = G.indices[i]; assert.equal(G.attrs._FINID[v], r.id, `${r.name} vertex ${v}`); }
  }
  assert.equal(at, G.indices.length);
  for (let v = 0; v < NV; v++) {
    assert.ok(G.attrs._FINT[v] >= -1e-6 && G.attrs._FINT[v] <= 1 + 1e-6, `_FINT ${G.attrs._FINT[v]}`);
    assert.ok(G.attrs._FINR[v] >= -1e-6 && G.attrs._FINR[v] <= 1 + 1e-6, `_FINR ${G.attrs._FINR[v]}`);
  }
  // every ray fin spans the whole leading..trailing range and root..tip range
  for (const name of ['dorsal', 'pectoral_R', 'pectoral_L', 'pelvic_R', 'pelvic_L', 'anal', 'caudal']) {
    const vs = vertsOf(name); const t = vs.map((v) => G.attrs._FINT[v]); const r = vs.map((v) => G.attrs._FINR[v]);
    assert.ok(Math.min(...t) < 0.01 && Math.max(...t) > 0.99, `${name} t span`);
    assert.ok(Math.min(...r) < 0.01 && Math.max(...r) > 0.85, `${name} r span`);
  }
});

test('dimensions match 02 §2.5 within +-0.01 SL', () => {
  const F = base.report.fins;
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= TOL, `${msg}: ${a.toFixed(4)} vs ${b}`);
  near(F.dorsal.base_len_over_SL, FP.dorsal.base_len, 'dorsal base'); near(F.dorsal.height_over_SL, FP.dorsal.height, 'dorsal height');
  near(F.anal.base_len_over_SL, FP.anal.base_len, 'anal base'); near(F.anal.height_over_SL, FP.anal.height, 'anal height');
  near(F.adipose.base_len_over_SL, FP.adipose.base_len, 'adipose base'); near(F.adipose.height_over_SL, FP.adipose.height, 'adipose height');
  near(F.pectoral_R.length_over_SL, FP.pectoral.length, 'pectoral R length'); near(F.pectoral_L.length_over_SL, FP.pectoral.length, 'pectoral L length');
  near(F.pelvic_R.length_over_SL, FP.pelvic.length, 'pelvic R length'); near(F.pelvic_L.length_over_SL, FP.pelvic.length, 'pelvic L length');
  near(F.caudal.span_over_SL, FP.caudal.span, 'caudal span'); near(F.caudal.length_over_SL, FP.caudal.length, 'caudal length');
  near(F.caudal.fork_depth_over_SL, FP.caudal.fork_depth, 'caudal fork');
  // independent check on the raw vertices: caudal span and tip line
  const vs = vertsOf('caudal'); let y0 = Infinity, y1 = -Infinity, x0 = Infinity;
  for (const v of vs) { const p = P(v); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); x0 = Math.min(x0, p[0]); }
  near((y1 - y0) / SL, FP.caudal.span, 'caudal span (vertices)'); near((surface.sToX(1) - x0) / SL, FP.caudal.length, 'caudal length (vertices)');
});

test('origins follow params: root lines start at origin_s, caudal outer rays overlap the peduncle', () => {
  const sOf = (v) => surface.xToS(P(v)[0]);
  const sheetRoots = (name) => vertsOf(name).filter((v) => G.attrs._FINR[v] === 0);
  for (const [name, key] of [['dorsal', 'dorsal'], ['anal', 'anal'], ['pectoral_R', 'pectoral'], ['pelvic_R', 'pelvic']]) {
    const smin = Math.min(...sheetRoots(name).map(sOf));
    assert.ok(Math.abs(smin - FP[key].origin_s) < 0.025, `${name} starts at s=${smin.toFixed(3)} (origin ${FP[key].origin_s})`);
  }
  const ad = vertsOf('adipose').map(sOf); assert.ok(Math.abs(Math.min(...ad) - FP.adipose.origin_s) < 0.01);
  // caudal: the sheet begins ahead of s = 1 (overlaps the peduncle, no sleeve) and ends 0.125 SL behind it
  const cs = vertsOf('caudal').map(sOf); assert.ok(Math.min(...cs) < 1 - 0.01 && Math.min(...cs) > 0.94);
  assert.ok(Math.max(...cs) > 1 + FP.caudal.length - 0.01);
});

test('roots are buried 0.3-0.5 mm in the skin (dorsal / anal midline)', () => {
  for (const [name, alpha] of [['dorsal', 0], ['anal', Math.PI]]) {
    const depths = [];
    for (const v of vertsOf(name)) {
      const p = P(v); if (G.attrs._FINR[v] !== 0 || Math.abs(p[2]) > 1e-6) continue;
      const skin = surface.point(surface.xToS(p[0]), alpha); depths.push((alpha === 0 ? skin[1] - p[1] : p[1] - skin[1]));
    }
    assert.ok(depths.length >= 10, `${name} root vertices`);
    const sheet = depths.filter((d) => d > 0.2e-3);                      // collar crest vertices lie above the skin (negative depth)
    assert.ok(sheet.length >= 8, `${name} has buried root vertices`);
    for (const d of sheet) assert.ok(d >= 0.3e-3 && d <= 0.55e-3, `${name} root depth ${(d * 1e3).toFixed(2)} mm`);
  }
});

test('paired fins stay outside the body (no flank penetration beyond 0.3 mm) and are mirrored with slight asymmetry', () => {
  for (const name of ['pectoral_R', 'pectoral_L', 'pelvic_R', 'pelvic_L']) {
    const sign = name.endsWith('_R') ? 1 : -1;
    for (const v of vertsOf(name)) {
      if (G.attrs._FINR[v] < 0.1) continue; const p = P(v);
      assert.ok(Math.sign(p[2]) === sign || Math.abs(p[2]) < 1e-5, `${name} on the wrong side`);
      assert.ok(bodyF(p) > 0.97, `${name} vertex ${v} inside the body (f=${bodyF(p).toFixed(3)})`);
    }
  }
  // bounding boxes mirror (within 15 %), but the meshes are not identical => individual left/right difference
  const bb = (name) => { const a = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const v of vertsOf(name)) { const p = P(v); for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], p[k]); a[k + 3] = Math.max(a[k + 3], p[k]); } } return a; };
  const r = bb('pectoral_R'), l = bb('pectoral_L');
  assert.ok(Math.abs(r[0] - l[0]) < 0.15 * (r[3] - r[0]) && Math.abs(r[3] - l[3]) < 0.15 * (r[3] - r[0]));
  assert.ok(Math.abs(r[2] + l[5]) < 0.15 * (r[5] - r[2]) + 1e-4);
  const rv = vertsOf('pectoral_R'), lv = vertsOf('pectoral_L'); assert.equal(rv.length, lv.length);
  let diff = 0; for (let i = 0; i < rv.length; i++) { const a = P(rv[i]), b = P(lv[i]); diff = Math.max(diff, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] + b[2])); }
  assert.ok(diff > 1e-4, 'left and right pectoral fins should differ slightly'); assert.ok(diff < 0.01, `... but only slightly (${diff})`);
});

test('ray counts are parameterised (params + genome override) and visible in the mesh', () => {
  const R = base.report.fins;
  assert.equal(R.dorsal.rays, FP.dorsal.rays); assert.equal(R.pectoral_R.rays, FP.pectoral.rays); assert.equal(R.pelvic_R.rays, FP.pelvic.rays);
  assert.equal(R.anal.rays, FP.anal.rays); assert.equal(R.caudal.rays, FP.caudal.principal_rays); assert.equal(R.caudal.rays, 19);
  // LOD0 has 2 columns per ray => (n-1)*2+1 distinct _FINT columns on the dorsal sheet
  const cols = (name) => new Set(vertsOf(name).filter((v) => G.attrs._FINR[v] > 0.3).map((v) => G.attrs._FINT[v].toFixed(4)));
  assert.ok(cols('dorsal').size >= (FP.dorsal.rays - 1) * 2 + 1);
  const g = buildFins({ surface, params, seed: 1, detail: 0.5, skipTextures: true, genome: { fin_ray_count: { dorsal: 11, pectoral: 14, pelvic: 8, anal: 11 } } });
  assert.equal(g.report.fins.dorsal.rays, 11); assert.equal(g.report.fins.pectoral_L.rays, 14); assert.equal(g.report.fins.pelvic_R.rays, 8); assert.equal(g.report.fins.anal.rays, 11);
  assert.equal(g.textures, null);
});

test('membrane is not a flat plate: the pleat relief is 0.1-0.3 mm and the margin is scalloped', () => {
  // out-of-plane (z) range of the dorsal sheet is small; the pleat shows as a z zig-zag between neighbouring columns
  const vs = vertsOf('dorsal').filter((v) => G.attrs._FINR[v] > 0.3 && G.attrs._FINR[v] < 0.6);
  const byT = new Map(); for (const v of vs) { const k = G.attrs._FINT[v].toFixed(4); (byT.get(k) ?? byT.set(k, []).get(k)).push(P(v)[2]); }
  const cols = [...byT.entries()].sort((a, b) => a[0] - b[0]).map(([, z]) => z.reduce((a, b) => a + b, 0) / z.length);
  // remove the slow trend, then look at the neighbour-to-neighbour alternation
  let alt = 0, n = 0; for (let i = 1; i < cols.length - 1; i++) { alt += Math.abs(cols[i] - 0.5 * (cols[i - 1] + cols[i + 1])); n++; }
  const mm = (alt / n) * 1e3; assert.ok(mm > 0.05 && mm < 0.4, `mean pleat amplitude ${mm.toFixed(3)} mm`);
  // distal margin: tip radius varies column to column (V notches)
  const tipR = new Map(); for (const v of vertsOf('caudal')) { if (G.attrs._FINR[v] > 0.9) { const k = G.attrs._FINT[v].toFixed(4); tipR.set(k, Math.max(tipR.get(k) ?? 0, G.attrs._FINR[v])); } }
  const vals = [...tipR.values()]; assert.ok(Math.max(...vals) - Math.min(...vals) > 0.01, 'margin should be scalloped / wobbling');
});

test('adipose fin is a closed fleshy lobe with real thickness', () => {
  const vs = vertsOf('adipose'); let zmin = Infinity, zmax = -Infinity, ymax = -Infinity;
  for (const v of vs) { const p = P(v); zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); ymax = Math.max(ymax, p[1]); }
  assert.ok((zmax - zmin) > 1.5e-3 && (zmax - zmin) < 5e-3, `adipose thickness ${(zmax - zmin) * 1e3} mm`);
  assert.ok(Math.abs(zmax + zmin) < 0.3e-3);
  const cell = ATLAS_CELLS.adipose; const a = base.textures.albedo;
  for (const [fx, fy] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.8]]) assert.equal(a.data[((cell.y + Math.floor(fy * cell.h)) * ATLAS_SIZE + cell.x + Math.floor(fx * cell.w)) * 4 + 3], 255, 'adipose is opaque');
});

test('textures: atlas images, alpha structure (rays opaque-ish, membrane translucent, margin thin), colours', () => {
  const { albedo, normal, orm } = base.textures;
  for (const im of [albedo, normal, orm]) { assert.equal(im.width, ATLAS_SIZE); assert.equal(im.height, ATLAS_SIZE); assert.ok(im.data instanceof Uint8Array); assert.equal(im.data.length, ATLAS_SIZE * ATLAS_SIZE * 4); }
  const at = (img, cell, t, r) => { const x = cell.x + Math.round(t * (cell.w - 1)), y = cell.y + Math.round(r * (cell.h - 1)); const i = (y * ATLAS_SIZE + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
  const D = ATLAS_CELLS.dorsal, n = FP.dorsal.rays;
  // along one row at r = 0.5: rays (t = j/(n-1)) have higher alpha than the membrane in between
  let rayA = 0, memA = 0; const m = n - 2;
  for (let j = 1; j <= m; j++) { rayA += at(albedo, D, j / (n - 1), 0.5)[3] / 255; memA += at(albedo, D, (j + 0.5) / (n - 1), 0.5)[3] / 255; }
  rayA /= m; memA /= m;
  assert.ok(rayA > memA + 0.15, `ray alpha ${rayA.toFixed(2)} vs membrane ${memA.toFixed(2)}`);
  assert.ok(memA > 0.25 && memA < 0.7, `membrane alpha ${memA.toFixed(2)} (06 §6.5: 0.3-0.7)`); assert.ok(rayA > 0.6 && rayA < 0.95, `ray alpha ${rayA.toFixed(2)}`);
  // thin at the tip, thicker at the base (06 §6.5: base 0.85)
  const tip = at(albedo, D, 0.5 + 0.5 / (n - 1), 0.995)[3] / 255, root = at(albedo, D, 0.5, 0.02)[3] / 255;
  assert.ok(tip < 0.2, `tip alpha ${tip}`); assert.ok(root > 0.75, `root alpha ${root}`);
  // normal map: unit length, tangent-space +Z (linear), ray ridges tilt it in x; ORM: metalness 0, roughness 0.4-0.7
  const Nn = ATLAS_CELLS.pectoral; let tilt = 0, cnt = 0;
  for (let y = Nn.y + 40; y < Nn.y + Nn.h - 40; y += 7) for (let x = Nn.x + 8; x < Nn.x + Nn.w - 8; x += 3) {
    const i = (y * ATLAS_SIZE + x) * 4; const nx = normal.data[i] / 127.5 - 1, ny = normal.data[i + 1] / 127.5 - 1, nz = normal.data[i + 2] / 127.5 - 1;
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 0.03); assert.ok(nz > 0.5); tilt += Math.abs(nx); cnt++;
    assert.equal(orm.data[i + 2], 0); assert.ok(orm.data[i + 1] > 100 && orm.data[i + 1] < 180); assert.ok(orm.data[i] > 150);
  }
  assert.ok(tilt / cnt > 0.02, 'ray ridges must tilt the normal map');
  // colours (03 §3.5.4): pectoral grey-yellow, amber near the root; dorsal grey-brown with minute dark dots; caudal lower-lobe margin orange (weak)
  const pc = ATLAS_CELLS.pectoral; const pr = at(albedo, pc, 0.5, 0.05), pd = at(albedo, pc, 0.5, 0.8);
  assert.ok(pr[0] > pr[1] && pr[1] > pr[2] && pr[0] - pr[2] > 80, `pectoral root amber ${pr}`); assert.ok(pd[0] - pd[2] > 30 && pd[0] - pd[2] < pr[0] - pr[2] + 20, `pectoral distal ${pd}`);
  let dark = 0; for (let y = D.y + 10; y < D.y + 200; y++) for (let x = D.x + 10; x < D.x + D.w - 10; x++) { const i = (y * ATLAS_SIZE + x) * 4; if (albedo.data[i] < 80 && albedo.data[i + 3] > 150) dark++; }
  assert.ok(dark > 30, `dorsal dark dots (${dark} px)`);
  const C = ATLAS_CELLS.caudal; const low = at(albedo, C, 0.98, 0.7), up = at(albedo, C, 0.02, 0.7);
  assert.ok(low[0] - low[2] > up[0] - up[2] + 15, `caudal lower margin should be warmer: ${low} vs ${up}`);
  const An = ATLAS_CELLS.anal; const lead = at(albedo, An, 0.01, 0.5); assert.ok(lead[0] > 200 && lead[1] > 190 && lead[2] > 180, `anal white leading edge ${lead}`);
});

test('LOD: triangle budget (detail 1 <= 7k, 0.5 <= 3.2k, 0.25 <= 1.2k) and consistency', () => {
  const t1 = G.indices.length / 3; assert.ok(t1 <= 7000, `detail 1: ${t1}`);
  const l1 = buildFins({ surface, params, seed: 1, detail: 0.5, skipTextures: true }), l2 = buildFins({ surface, params, seed: 1, detail: 0.25, skipTextures: true });
  const t05 = l1.geometry.indices.length / 3, t025 = l2.geometry.indices.length / 3;
  assert.ok(t05 <= 3200 && t05 < t1, `detail 0.5: ${t05}`); assert.ok(t025 <= 1200 && t025 < t05, `detail 0.25: ${t025}`);
  for (const l of [l1, l2]) { assert.deepEqual(l.ranges.map((r) => r.name), base.ranges.map((r) => r.name)); assert.equal(l.report.fins.caudal.rays, 19); }
  // the planform dimensions must survive the reduction
  assert.ok(Math.abs(l2.report.fins.dorsal.height_over_SL - FP.dorsal.height) <= TOL); assert.ok(Math.abs(l2.report.fins.caudal.span_over_SL - FP.caudal.span) <= TOL);
});

test('deterministic per seed; different seeds give different individuals; report carries ray-group info', () => {
  const again = buildFins({ surface, params, seed: 1 });
  assert.deepEqual(Array.from(again.geometry.positions), Array.from(G.positions));
  assert.deepEqual(Array.from(again.textures.albedo.data.subarray(0, 200000)), Array.from(base.textures.albedo.data.subarray(0, 200000)));
  const other = buildFins({ surface, params, seed: 7, detail: 0.5, skipTextures: true });
  assert.notDeepEqual(Array.from(other.geometry.positions.slice(0, 300)), Array.from(buildFins({ surface, params, seed: 1, detail: 0.5, skipTextures: true }).geometry.positions.slice(0, 300)));
  const rg = base.report.rayGroups; assert.equal(rg.pectoral.groups, 3); assert.equal(rg.pelvic.groups, 2); assert.equal(rg.dorsal.groups, 3); assert.equal(rg.anal.groups, 2); assert.equal(rg.caudal.groups, 5);
  // rest pose: dorsal rays lean backwards (-X) and up; anal backwards and down
  assert.ok(base.report.fins.dorsal.restDir[0] < -0.4 && base.report.fins.dorsal.restDir[1] > 0.3);
  assert.ok(base.report.fins.anal.restDir[0] < -0.4 && base.report.fins.anal.restDir[1] < -0.3);
  assert.ok(base.report.fins.pectoral_R.pivot[2] > 0 && base.report.fins.pectoral_L.pivot[2] < 0);
});

test('fin_damage notches the margin of the dorsal and pectoral fins', () => {
  const d = buildFins({ surface, params, seed: 1, detail: 0.5, skipTextures: true, genome: { fin_damage: 0.9 } });
  const clean = buildFins({ surface, params, seed: 1, detail: 0.5, skipTextures: true });
  // mean over the columns (distinct _FINT) of the largest _FINR reached = how far the membrane extends along the rays
  const reach = (b, name) => { const r = b.ranges.find((x) => x.name === name); const m = new Map(); for (let v = r.vertexStart; v < r.vertexStart + r.vertexCount; v++) { const k = b.geometry.attrs._FINT[v].toFixed(4); m.set(k, Math.max(m.get(k) ?? 0, b.geometry.attrs._FINR[v])); } const a = [...m.values()]; return { mean: a.reduce((x, y) => x + y, 0) / a.length, min: Math.min(...a) }; };
  for (const name of ['dorsal', 'pectoral_R']) {
    const a = reach(d, name), c = reach(clean, name);
    assert.ok(a.mean < c.mean - 0.01, `${name} mean reach ${a.mean.toFixed(3)} vs ${c.mean.toFixed(3)}`);
    assert.ok(a.min < c.min - 0.05, `${name} deepest bite ${a.min.toFixed(3)} vs ${c.min.toFixed(3)}`);
  }
});
