// The トビハゼ's texture bake (round T1, key `tech`): the maps of every tier from the fish-frame functions of the
// pattern (pattern.mjs skinColour), surface (surface.mjs skinDetail) and eye / fin (iris.mjs paintEye, finatlas.mjs
// paintFinAtlas) modules — texture_contract.md §2–§5. The bake is position based (bake.mjs): a texel's values are the
// functions at the fish-frame point under it, so the charts' seams are continuous and every tier bakes the same fish.
//
//   bakeTier(tierMesh, { size, maps, fish, pattern, surface, eye, ... }) → { baseColor, normal, orm, stats }
//     per map size (lod1's colour at 1024, its normal and ORM at 512): the triangle under each texel (bake.texelTriangles,
//     the triangles extrapolated 1.5 texels past the charts' edges: the surface key's request), then per texel — in
//     worker threads (textures.mjs is its own worker) —
//       colour   pattern.skinColour at ss × ss sub-samples of the texel (the texel's triangle's plane, unclamped), the
//                linear mean: a 2× supersample box-filtered; `bars` (the excitement crossbands' mask) likewise
//       surface  surface.skinDetail at the texel's centre (its relief is band-limited for the map's own texel: one
//                footprint per map, ctx.fpRef): the detailed normal n + dn in the tier's own tangent frame as three.js
//                shades it (bake.shaderFrames / encodeTangentNormal: the GLB's int8 attributes, tbn = (t, b, n) not
//                re-orthogonalised, b = normalize(n × t)·w), the occlusion, the wet-state roughness, the wet retention
//       eye      the window (iris rect) from eye.paintEye; the skin cap (eyeSkin rect) as head skin at the LEFT globe at
//                rest (both globes read the rect; the right is the left's mirror image with its own tangents, so one
//                normal map serves both: verified on Eye_R in the convention test)
//       teeth    the swatch rect filled with the teeth's values (their UV is one point)
//     then every texel nobody painted filled with its nearest painted texel's value (bake.fillNearest: the gutters carry
//     each chart's edge outward to the half-way line, so no bilinear lookup or mip level reads an unpainted texel;
//     bake.mipBleed measures what each level borrows), and encoded (8-bit; tools/lib/png.mjs)
//   lod2 (contract §2): the colour only, with the lighting detail its coarse mesh lost baked in (surfaceContext
//     { relief: false }: the sculpt's normal against the mesh's under a soft overhead key, and the occlusion)
//   finAtlas(size, defs, { tier, finMeshes }) the fin atlas (contract §2: RGBA, A the membrane's coverage) from
//     finatlas.paintFinAtlas, the colour carried under A = 0 (no dark fringe in the mips), the caudal's sheath opaque
//
// Map channels (contract §2, §5; the pattern and surface keys' requests):
//   baseColor RGBA  sRGB albedo; A = pattern `bars` (the excitement crossbands' mask: a runtime uniform darkens by it;
//                   the opaque skin ignores A)
//   normal RGB      tangent space, +y = cross(n, t)·w (glTF: up the image, −v; the meshes' own tangents)
//   ORM RGB         R occlusion, G roughness (the WET state), B wet retention (surface.WET: metallicFactor 0, so three.js
//                   reads no metalness from it)
//
// Modules: each of pattern / surface / eye / fin is a module namespace, a path, or (default) the sibling file
// (./pattern.mjs, ./surface.mjs, ./iris.mjs, ./finatlas.mjs) when it exists — else the stub below with the contract's
// signatures (texture_contract.md §3), so the bake runs before every key's file has arrived. Workers need paths.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import jpeg from 'jpeg-js';
import { texelTriangles, baryPx, shaderFrames, encodeTangentNormal, fillNearest, mipBleed, islands, toSRGB8, hexLin } from './bake.mjs';
import { encodePNG } from '../../lib/png.mjs';
import { HL, EYE_MM } from './anatomy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The parts a texel can be (the order is the code stored per triangle). */
export const PARTS = ['body', 'head', 'lobe', 'lip', 'interior', 'eyeSkin', 'iris', 'teeth', 'patch'];
const PART = Object.fromEntries(PARTS.map((p, i) => [p, i]));
/** A body-atlas chart's part (fishmesh BODY_LAYOUT; pattern.mjs CHART_PART when it has one). `patch` holds islands
 * from anywhere: the pattern resolves it by position (part null), the surface treats it as skin. */
export const CHART_PART = {
  bodyL: 'body', bodyR: 'body', tailCap: 'body', head: 'head', domeL: 'head', domeR: 'head', lobeL: 'lobe', lobeR: 'lobe',
  socketL: 'interior', socketR: 'interior', gillRoofL: 'interior', gillFloorL: 'interior', gillRoofR: 'interior', gillFloorR: 'interior',
  mouthRoof: 'interior', mouthFloor: 'interior', hidden: 'interior', teeth: 'teeth', eyeSkin: 'eyeSkin', iris: 'iris', patch: 'patch',
};

/** The pattern's part for the eye's skin cap (the eyeSkin rect, the LEFT globe at rest): 'head' (the head's own skin
 * function: at rest the cap's colour is the turret's at the same point) rather than pattern.mjs's 'eyeSkin' (the head's
 * function with a finer granule cell and an olive blend), which leaves a seam where the globe leaves its turret (round T1
 * integrator: the front close-up at rest, the column step across the cap's medial edge 2.8× its neighbours with
 * 'eyeSkin', 1.5× with 'head'; the eyefin key's p5 test alike). --eye-skin-part eyeSkin restores the pattern key's. */
export const EYE_SKIN_PART = 'head';

/**
 * The right eye's turret mirrored (round T1 integrator, the eyefin key's request): both globes read the eyeSkin rect, baked
 * from the LEFT globe at rest, so Eye_R's cap is the left cap's mirror image; the head skin round the right globe takes
 * the left's colour and relief mirrored too (the point and normal z → −z, the relief's dn back), so the cap meets its
 * turret as Eye_L's does. Full inside `inner` × the globe's radius of the right globe's centre, fading out over `fade`
 * mm; the midline (z 0) is its own mirror, so the two turrets stay continuous where they meet. Skin parts only (not the
 * cap, the window, the teeth).
 */
export const EYE_MIRROR = { inner: 1.12, fade: 0.6 };
const MIRROR_C = [EYE_MM.center[0], EYE_MM.center[1], -EYE_MM.center[2]];
const MIRROR_R0 = EYE_MIRROR.inner * EYE_MM.radius, MIRROR_R1 = MIRROR_R0 + EYE_MIRROR.fade;
/** The mirror's weight at a fish-frame point (0 outside the right turret's zone). */
export function eyeMirrorWeight(p) {
  if (p[2] >= 0) return 0;
  const d = Math.hypot(p[0] - MIRROR_C[0], p[1] - MIRROR_C[1], p[2] - MIRROR_C[2]);
  if (d <= MIRROR_R0) return 1;
  if (d >= MIRROR_R1) return 0;
  const t = (d - MIRROR_R0) / (MIRROR_R1 - MIRROR_R0);
  return 1 - t * t * (3 - 2 * t);
}
const NO_MIRROR = new Set(['eyeSkin', 'iris', 'teeth']);

/** The scales' pockets in the trunk's albedo (round T1 integrator; the pattern and surface keys' requests: A007's scale
 * margins, the contract's "scales visible on the trunk in close-ups"; the relief alone, 0.9° rms, does not show them under
 * the busy pattern): albedo × (1 − k·(min(cavity, max) − mean)), surface.skinDetail's cavity (the scale pockets 0.35, the
 * pits, the creases; clamped at `max` so the creases, already in the occlusion, are not darkened twice) about its trunk
 * mean (the build report's trunkCavity.meanClamped), so the trunk's mean colour — and the lower tiers, whose colour passes
 * have no surface and whose texels cannot hold a scale — keep the pattern's calibration; only where the colour pass has the
 * surface (the hero's 2048). Photo-camera check (photo light): region means unchanged within ΔE 1, the lower flank's
 * pattern contrast 0.69 → 0.70. null: off (--cav-albedo off). */
export const CAVITY_ALBEDO = { k: 0.35, max: 0.5, mean: 0.148 };
/** (the patch islands behind this s, mm — past the opercle's margin, ~1.05 HL — are the trunk's) */
const CAVITY_TRUNK_S = 1.05 * HL;

/** The texel's skin size per map size (pattern.mjs: hero 2048 0.031 mm, lod1 1024 0.062, lod2 256 0.25). */
export const texelMM = (size) => (0.031 * 2048) / size;

/** lod2's baked light (contract §2: AO × a soft key): a soft overhead key a little from the front (fish frame: s back,
 * y up, z left) as a ratio of the sculpt's normal's light to the mesh's, the occlusion softened; both clamped. */
export const LOD2_LIGHT = { dir: [-0.35, 1, 0.15], wrap: 0.35, ratio: [0.72, 1.2], ao: 0.5 };

// ------------------------------------------------------------------------------------------------- stub modules
// (the contract's signatures; the integrator's files replace them: bakeTier takes the sibling file when it exists)
const SL = (h) => hexLin(h);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const STUBS = {
  pattern: {
    stub: true,
    PALETTE: { dorsum: '#8c7b66', flankUpper: '#8a7c68', flankLower: '#cdc8b8', belly: '#d6d8cd', saddle: '#3a2c20', teeth: '#ece2ca', pectLobe: '#b0956a' },
    patternContext(fish, o = {}) { return { fish, texelMM: o.texelMM ?? 0.031, pal: Object.fromEntries(Object.entries(STUBS.pattern.PALETTE).map(([k, h]) => [k, SL(h)])) }; },
    skinColour(p, n, part, ctx) {
      const P = ctx.pal;
      if (part === 'teeth') return { rgb: P.teeth.slice(), bars: 0 };
      // countershading by height: the head's floor at y 0, the back at ~0.75 HL; saddles at the research's u
      const v = 1 - clamp01(p[1] / (0.75 * HL)), u = p[0] / 80;
      const c = P.dorsum.map((d, i) => d + (P.flankUpper[i] - d) * smooth(0.15, 0.35, v));
      for (let i = 0; i < 3; i++) c[i] += (P.flankLower[i] - c[i]) * smooth(0.5, 0.62, v);
      for (let i = 0; i < 3; i++) c[i] += (P.belly[i] - c[i]) * smooth(0.78, 0.9, v);
      let s = 0;
      for (const su of [0.25, 0.35, 0.46, 0.57, 0.68, 0.79]) s = Math.max(s, (1 - smooth(0.015, 0.03, Math.abs(u - su + 0.04 * v))) * (1 - smooth(0.3, 0.45, v)));
      for (let i = 0; i < 3; i++) c[i] += (P.saddle[i] - c[i]) * 0.75 * s;
      if (part === 'lobe') for (let i = 0; i < 3; i++) c[i] = P.pectLobe[i];
      return { rgb: c, bars: s };
    },
  },
  surface: {
    stub: true,
    WET: { wet: { roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.12 }, eye: { clearcoat: 1, clearcoatRoughness: 0.03, window: 0.05, skin: 0.28 } },
    surfaceContext(fish, o = {}) { return { fish, size: o.size ?? 2048, relief: o.relief !== false }; },
    aoField(fish, p, n) {
      let occ = 0;
      for (const d of [0.15, 0.4, 0.9]) occ += clamp01((d - fish(p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d)) / d);
      return clamp01(1 - occ / 3);
    },
    skinDetail(p, n, part, ctx) {
      if (part === 'teeth' || part === 'iris') return { dn: [0, 0, 0], rough: 0.3, ao: 1, cavity: 0, wet: 1 };
      const f = ctx.fish, d = 0.03;
      const g = [f(p[0] + d, p[1], p[2]) - f(p[0] - d, p[1], p[2]), f(p[0], p[1] + d, p[2]) - f(p[0], p[1] - d, p[2]), f(p[0], p[1], p[2] + d) - f(p[0], p[1], p[2] - d)];
      const l = Math.hypot(...g) || 1, nn = Math.hypot(...n) || 1;
      const ok = g[0] * n[0] + g[1] * n[1] + g[2] * n[2] > 0.5 * l * nn && part !== 'eyeSkin';
      const dn = ok ? [g[0] / l - n[0] / nn, g[1] / l - n[1] / nn, g[2] / l - n[2] / nn] : [0, 0, 0];
      return { dn, rough: 0.4, ao: STUBS.surface.aoField(f, p, [n[0] / nn, n[1] / nn, n[2] / nn]), cavity: 0, wet: 0.5 };
    },
  },
  eye: {
    stub: true,
    EYE_MATERIAL: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.03, ior: 1.376 },
    /** rects: { iris: [x0, y0, x1, y1], eyeSkin: [...] } (shares of the atlas) → { iris: { w, h, rgb (linear), rough } } (the
     * window only; the skin cap stays the pattern's) */
    paintEye(rects, size) {
      const [x0, y0, x1, y1] = rects.iris.map((v) => Math.round(v * size)), w = x1 - x0, h = y1 - y0, rgb = new Float32Array(w * h * 3), rough = new Float32Array(w * h);
      const pupil = SL('#0c1a18'), ring = SL('#c9a24e'), iris = SL('#927652');
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        // (eye.mjs: u = azimuth / 2π across, ρ = 2·v down the window rect: the pupil inside ρ ≈ 0.6 · 0.5 of the window)
        const phi = ((x + 0.5) / w) * Math.PI * 2, rho = ((y + 0.5) / h) * 0.5, rp = 0.17 * (1 + 0.18 * Math.cos(2 * phi));
        const c = rho < rp ? pupil : rho < rp + 0.025 ? ring : iris;
        rgb.set(c, (y * w + x) * 3); rough[y * w + x] = 0.05;
      }
      return { iris: { w, h, rgb, rough } };
    },
  },
  fin: {
    stub: true,
    FIN_MATERIAL: { roughness: 0.4, clearcoatFactor: 0.4, clearcoatRoughnessFactor: 0.15, ior: 1.36 },
    /** → { rgba: Uint8Array size² × 4 (sRGB, A coverage) } */
    paintFinAtlas(size, defs) {
      const rgba = new Uint8Array(size * size * 4), k = size / 2048, col = [200, 185, 160];
      for (const d of defs) {
        const [rx, ry, rw, rh] = d.rect.map((v) => Math.round(v * k));
        for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
          const q = (y * size + x) * 4, t = (y - ry) / rh;
          rgba[q] = col[0] * (1 - 0.3 * t); rgba[q + 1] = col[1] * (1 - 0.3 * t); rgba[q + 2] = col[2] * (1 - 0.3 * t); rgba[q + 3] = 150;
        }
      }
      return { rgba };
    },
  },
};

/** The modules' sibling files (contract §3). */
const SIBLING = { pattern: 'pattern.mjs', surface: 'surface.mjs', eye: 'iris.mjs', fin: 'finatlas.mjs' };

/**
 * The modules a bake uses: each a namespace (kept), a path (imported) or undefined (the sibling file if it exists, else
 * the stub). Returns { mods, urls } (urls: what a worker imports; null for a namespace given as such, 'stub').
 */
export async function loadModules(spec = {}) {
  const mods = {}, urls = {};
  for (const [k, file] of Object.entries(SIBLING)) {
    const s = spec[k];
    if (s && typeof s === 'object') { mods[k] = s; urls[k] = s.stub ? 'stub' : null; continue; }
    const p = s ? path.resolve(s) : path.join(here, file);
    if (!fs.existsSync(p)) {
      if (s) throw new Error(`textures: no ${k} module at ${p}`);
      mods[k] = STUBS[k]; urls[k] = 'stub'; continue;
    }
    const url = pathToFileURL(p).href;
    mods[k] = await import(url); urls[k] = url;
  }
  return { mods, urls };
}

// ------------------------------------------------------------------------------------------------- the tier's mesh
/**
 * One mesh for the bake: the skin plus the extra meshes on the body atlas (the left eye globe at rest, fish frame),
 * every triangle with its part code.
 * @param skin  { position (fish mm), normal, tangent (4: xyz, w), uv, indices, triChart (Int per triangle), charts
 *              ([{ name }] or names) } — a tier's skin (fishmesh bodyTierMesh) or H.tier
 * @param extra [{ position (fish mm), normal, tangent, uv, indices, part: name | (t) → name }] (the eye: 'eyeSkin' for its
 *              skin triangles, 'iris' for the window's)
 */
export function bakeMesh(skin, extra = []) {
  const names = (skin.charts ?? []).map((c) => (typeof c === 'string' ? c : c.name));
  const parts = [skin, ...extra];
  const nv = parts.reduce((a, m) => a + m.position.length / 3, 0), ni = parts.reduce((a, m) => a + m.indices.length, 0);
  const out = { position: new Float32Array(nv * 3), normal: new Float32Array(nv * 3), tangent: new Float32Array(nv * 4), uv: new Float32Array(nv * 2), indices: new Uint32Array(ni), triPart: new Uint8Array(ni / 3) };
  let v0 = 0, i0 = 0;
  parts.forEach((m, k) => {
    const n = m.position.length / 3, nt = m.indices.length / 3;
    out.position.set(m.position, v0 * 3); out.normal.set(m.normal, v0 * 3); out.uv.set(m.uv, v0 * 2);
    if (m.tangent) out.tangent.set(m.tangent, v0 * 4); else for (let v = 0; v < n; v++) out.tangent.set([1, 0, 0, 1], (v0 + v) * 4);
    for (let i = 0; i < m.indices.length; i++) out.indices[i0 + i] = m.indices[i] + v0;
    for (let t = 0; t < nt; t++) {
      let part;
      if (k === 0) part = CHART_PART[names[skin.triChart?.[t]]] ?? 'patch';
      else part = typeof m.part === 'function' ? m.part(t) : m.part;
      out.triPart[i0 / 3 + t] = PART[part] ?? PART.patch;
    }
    v0 += n; i0 += m.indices.length;
  });
  return out;
}

/** An eye mesh (eyemesh.eyeMeshForTier's `whole`: object frame, metres, about the globe's centre) in the fish frame at
 * rest (mm): object (x, y, z) = fish (z, y, −s) about the centre (anatomy.dirToObject inverted), side ±1. */
export function eyeToFish(whole, side = 1) {
  const n = whole.position.length / 3, c = [EYE_MM.center[0], EYE_MM.center[1], EYE_MM.center[2] * side];
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), tangent = whole.tangent ? new Float32Array(n * 4) : null;
  for (let v = 0; v < n; v++) {
    const P = [whole.position[v * 3], whole.position[v * 3 + 1], whole.position[v * 3 + 2]].map((x) => x * 1000);
    position[v * 3] = -P[2] + c[0]; position[v * 3 + 1] = P[1] + c[1]; position[v * 3 + 2] = P[0] + c[2];
    normal[v * 3] = -whole.normal[v * 3 + 2]; normal[v * 3 + 1] = whole.normal[v * 3 + 1]; normal[v * 3 + 2] = whole.normal[v * 3];
    if (tangent) { tangent[v * 4] = -whole.tangent[v * 4 + 2]; tangent[v * 4 + 1] = whole.tangent[v * 4 + 1]; tangent[v * 4 + 2] = whole.tangent[v * 4]; tangent[v * 4 + 3] = whole.tangent[v * 4 + 3]; }
  }
  return { position, normal, tangent, uv: whole.uv, indices: whole.indices, ranges: whole.ranges };
}

// ------------------------------------------------------------------------------------------------- per-texel work
/** Shared state of one pass (main thread or worker): the mesh, the texels' triangles, the outputs. */
function passState(D) {
  const S = { ...D };
  S.frames = { n: D.fn, t: D.ft, b: D.fb };
  return S;
}

/** The detail a convention test bakes instead of the surface's (o.test): 'domes' raised hemispheres on a 3D lattice
 * (fish mm, cell `cell`), so a wrong green or a frame that flips at a seam shows as lit-from-the-wrong-side domes or a
 * break in the lattice across the seam. */
export function testDetail(kind, p, n, cell = 0.9) {
  const nl = Math.hypot(n[0], n[1], n[2]) || 1, N = [n[0] / nl, n[1] / nl, n[2] / nl];
  if (kind !== 'domes') return { dn: [0, 0, 0], rough: 0.5, ao: 1, wet: 1 };
  // the nearest lattice centre; the dome's slope (radius r) tilts the normal away from it
  const c = p.map((x) => (Math.floor(x / cell) + 0.5) * cell), d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const dt = [d[0] - N[0] * (d[0] * N[0] + d[1] * N[1] + d[2] * N[2]), d[1] - N[1] * (d[0] * N[0] + d[1] * N[1] + d[2] * N[2]), d[2] - N[2] * (d[0] * N[0] + d[1] * N[1] + d[2] * N[2])];
  const r = 0.36 * cell, q = Math.hypot(...dt) / r;
  if (q >= 1) return { dn: [0, 0, 0], rough: 0.5, ao: 1, wet: 1 };
  // a spherical cap's normal: tilt sin = q · 0.8
  const s = 0.8 * q, cz = Math.sqrt(1 - s * s), l = Math.hypot(...dt) || 1;
  const hi = [N[0] * cz + (dt[0] / l) * s, N[1] * cz + (dt[1] / l) * s, N[2] * cz + (dt[2] / l) * s];
  return { dn: [hi[0] - N[0], hi[1] - N[1], hi[2] - N[2]], rough: 0.5, ao: 1, wet: 1 };
}

/**
 * Rows y0…y1 of a pass: per texel with a triangle, the colour (ss² sub-samples), the surface at the centre, the
 * encoded normal, the ORM, lod2's lit factor.
 */
function evalRows(S, M, y0, y1) {
  const { W, H, ss, tri, uv, indices: I, position: P, normal: N, triPart, frames } = S;
  const w3 = [0, 0, 0], hi = [0, 0, 0], enc = [0, 0, 1], T = [0, 0, 0], B = [0, 0, 0], Nf = [0, 0, 0];
  const L = LOD2_LIGHT, ll = Math.hypot(...L.dir), ld = L.dir.map((x) => x / ll);
  const lightOf = (n) => (1 - L.wrap) * Math.max(0, n[0] * ld[0] + n[1] * ld[1] + n[2] * ld[2]) + L.wrap;
  const interp = (A, t, w, out) => {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    out[0] = A[a] * w[0] + A[b] * w[1] + A[c] * w[2]; out[1] = A[a + 1] * w[0] + A[b + 1] * w[1] + A[c + 1] * w[2]; out[2] = A[a + 2] * w[0] + A[b + 2] * w[1] + A[c + 2] * w[2];
    return out;
  };
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; };
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x, t = tri[p];
      if (t < 0) continue;
      const pc = triPart[t], part = PARTS[pc];
      if (part === 'iris' && !S.want.irisSurface && !S.test) { S.done[p] = 1; continue; } // (the eye painter's: main thread)
      // the centre
      baryPx(uv, I, t, x + 0.5, y + 0.5, W, H, w3);
      const pos = interp(P, t, w3, [0, 0, 0]), nrm = unit(interp(N, t, w3, [0, 0, 0]));
      const sPart = part === 'patch' ? 'body' : part;
      let sd = null;
      if (S.want.surface || S.want.lit) {
        sd = S.test ? testDetail(S.test, pos, nrm, 25 * texelMM(W)) : M.surface.skinDetail(pos, nrm, sPart, S.sctx);
        // (the right turret: the left's relief mirrored, EYE_MIRROR)
        const mw = S.test || NO_MIRROR.has(part) || S.eyeMirror === false ? 0 : eyeMirrorWeight(pos);
        if (mw > 0) {
          const m = M.surface.skinDetail([pos[0], pos[1], -pos[2]], [nrm[0], nrm[1], -nrm[2]], sPart, S.sctx);
          const dm = [m.dn[0], m.dn[1], -m.dn[2]], mix = (a, b) => (a ?? 0) + ((b ?? 0) - (a ?? 0)) * mw;
          sd = { ...sd, dn: [mix(sd.dn[0], dm[0]), mix(sd.dn[1], dm[1]), mix(sd.dn[2], dm[2])], rough: mix(sd.rough, m.rough), ao: mix(sd.ao ?? 1, m.ao ?? 1), wet: mix(sd.wet, m.wet), cavity: mix(sd.cavity, m.cavity) };
        }
        hi[0] = nrm[0] + sd.dn[0]; hi[1] = nrm[1] + sd.dn[1]; hi[2] = nrm[2] + sd.dn[2]; unit(hi);
      }
      if (S.want.surface) {
        unit(interp(frames.t, t, w3, T)); unit(interp(frames.b, t, w3, B)); unit(interp(frames.n, t, w3, Nf));
        encodeTangentNormal(hi, T, B, Nf, enc);
        S.nrm[p * 3] = enc[0]; S.nrm[p * 3 + 1] = enc[1]; S.nrm[p * 3 + 2] = enc[2];
        // (B: the wet retention; on the eye's rects 0 — the Eye material may read B as metalness, the eye painter's)
        S.orm[p * 3] = sd.ao ?? 1; S.orm[p * 3 + 1] = sd.rough ?? 0.5; S.orm[p * 3 + 2] = part === 'eyeSkin' || part === 'iris' ? 0 : sd.wet ?? 0;
      }
      if (S.want.colour && S.test) { S.col[p * 3] = S.col[p * 3 + 1] = S.col[p * 3 + 2] = 0.3; S.bars[p] = 0; }
      else if (S.want.colour) {
        let r = 0, g = 0, b = 0, br = 0;
        // (the eye's skin cap: the pattern's part for it, S.eyeSkinPart — 'head' by default, see EYE_SKIN_PART)
        const pp = part === 'patch' ? null : part === 'eyeSkin' ? S.eyeSkinPart ?? EYE_SKIN_PART : part;
        for (let j = 0; j < ss; j++)
          for (let i = 0; i < ss; i++) {
            const sx = x + (i + 0.5) / ss, sy = y + (j + 0.5) / ss;
            baryPx(uv, I, t, sx, sy, W, H, w3);
            const q = interp(P, t, w3, [0, 0, 0]), nq = unit(interp(N, t, w3, [0, 0, 0]));
            const mw = NO_MIRROR.has(part) || S.eyeMirror === false ? 0 : eyeMirrorWeight(q);
            const c = mw < 1 ? M.pattern.skinColour(q, nq, pp, S.pctx) : null;
            const cm = mw > 0 ? M.pattern.skinColour([q[0], q[1], -q[2]], [nq[0], nq[1], -nq[2]], pp, S.pctx) : null;
            if (!cm) { r += c.rgb[0]; g += c.rgb[1]; b += c.rgb[2]; br += c.bars ?? 0; }
            else if (!c) { r += cm.rgb[0]; g += cm.rgb[1]; b += cm.rgb[2]; br += cm.bars ?? 0; }
            else {
              r += c.rgb[0] + (cm.rgb[0] - c.rgb[0]) * mw; g += c.rgb[1] + (cm.rgb[1] - c.rgb[1]) * mw; b += c.rgb[2] + (cm.rgb[2] - c.rgb[2]) * mw;
              br += (c.bars ?? 0) + ((cm.bars ?? 0) - (c.bars ?? 0)) * mw;
            }
          }
        const k = 1 / (ss * ss);
        let f = 1;
        if (S.want.lit) {
          const ratio = Math.min(L.ratio[1], Math.max(L.ratio[0], lightOf(hi) / Math.max(1e-3, lightOf(nrm))));
          f = ratio * (1 - L.ao + L.ao * (sd.ao ?? 1));
        }
        // (the scales' pockets in the albedo, CAVITY_ALBEDO: the trunk's texels, where this pass has the surface too)
        if (sd && S.want.surface && (part === 'body' || (part === 'patch' && pos[0] > CAVITY_TRUNK_S))) {
          S.cav[p] = sd.cavity ?? 0; S.cavOn[p] = 1;
          if (S.cavAlbedo) f *= 1 - S.cavAlbedo.k * (Math.min(sd.cavity ?? 0, S.cavAlbedo.max ?? 1) - S.cavAlbedo.mean);
        }
        S.col[p * 3] = r * k * f; S.col[p * 3 + 1] = g * k * f; S.col[p * 3 + 2] = b * k * f; S.bars[p] = br * k;
      }
      S.done[p] = 1;
    }
}

/** The contexts a pass's functions need (built once per worker; deterministic, so every worker builds the same). */
async function passContexts(S, M) {
  const { tierField } = await import('./fishmesh.mjs');
  const { fishSDFmm } = await import('./body.mjs');
  if (S.want.colour) S.pctx = M.pattern.patternContext(fishSDFmm(HL), { texelMM: texelMM(S.colourSize ?? S.W), ...(S.patternOpts ?? {}) });
  if ((S.want.surface || S.want.lit) && !S.test) {
    // (the tier's own field: the hero's full sculpt, lod1's sealed one, lod2's far one; lod2's lit colour without relief)
    const fish = tierField(S.fieldTier ?? 'hero');
    S.sctx = M.surface.surfaceContext(fish, { size: S.W, tier: S.fieldTier ?? 'hero', ...(S.want.lit ? { relief: false } : {}), ...(S.surfaceOpts ?? {}) });
  }
}

// ------------------------------------------------------------------------------------------------- workers
if (!isMainThread && workerData?.tobihazeBake) {
  const D = workerData;
  const M = {};
  for (const [k, u] of Object.entries(D.urls)) M[k] = u === 'stub' || !u ? STUBS[k] : await import(u);
  const S = passState(D);
  await passContexts(S, M);
  parentPort.postMessage({ kind: 'ready' });
  parentPort.on('message', (m) => {
    if (m.kind === 'rows') { evalRows(S, M, m.y0, m.y1); parentPort.postMessage({ kind: 'done', y0: m.y0, y1: m.y1 }); }
    if (m.kind === 'exit') process.exit(0);
  });
}

const shared = (T, n) => new T(new SharedArrayBuffer(n * T.BYTES_PER_ELEMENT));
const toShared = (a) => { const s = shared(a.constructor, a.length); s.set(a); return s; };

/** One pass at size W: rasterise, evaluate (workers when the modules have paths), return the float outputs. */
async function runPass(mesh, W, want, o, M, urls, log) {
  const t0 = Date.now();
  const ras = texelTriangles(mesh, W, W, { reach: o.reach ?? 1.5 });
  const N = W * W, frames = shaderFrames(mesh.normal, mesh.tangent);
  const D = {
    tobihazeBake: true, W, H: W, ss: o.ss ?? 2, want, test: o.test ?? null, fieldTier: o.fieldTier ?? 'hero', colourSize: W,
    patternOpts: o.patternOpts ?? null, surfaceOpts: o.surfaceOpts ?? null, eyeSkinPart: o.eyeSkinPart ?? EYE_SKIN_PART, eyeMirror: o.eyeMirror ?? true, cavAlbedo: o.cavAlbedo === undefined ? CAVITY_ALBEDO : o.cavAlbedo, urls,
    tri: toShared(ras.tri), uv: toShared(mesh.uv), indices: toShared(mesh.indices), position: toShared(mesh.position), normal: toShared(mesh.normal),
    triPart: toShared(mesh.triPart), fn: toShared(frames.n), ft: toShared(frames.t), fb: toShared(frames.b),
    col: shared(Float32Array, N * 3), bars: shared(Float32Array, N), cav: shared(Float32Array, N), cavOn: shared(Uint8Array, N), nrm: shared(Float32Array, N * 3), orm: shared(Float32Array, N * 3), done: shared(Uint8Array, N),
  };
  const nW = o.workers ?? Math.max(1, Math.min(4, os.cpus().length - 1));
  const canWork = nW > 1 && Object.values(urls).every((u) => u !== null);
  if (!canWork) {
    const S = passState(D); await passContexts(S, M); evalRows(S, M, 0, W);
  } else {
    const rows = [], chunk = Math.max(4, Math.round(W / 128));
    for (let y = 0; y < W; y += chunk) rows.push([y, Math.min(W, y + chunk)]);
    // (row chunks handed out one at a time as each worker finishes: the rows' costs differ — the head's charts are dearer)
    await new Promise((resolve, reject) => {
      let left = rows.length, live = 0;
      for (let k = 0; k < nW; k++) {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: D });
        live++;
        const next = () => { const r = rows.shift(); if (r) w.postMessage({ kind: 'rows', y0: r[0], y1: r[1] }); else w.postMessage({ kind: 'exit' }); };
        w.on('message', (m) => { if (m.kind === 'ready') next(); else if (m.kind === 'done') { left--; next(); } });
        w.on('error', reject);
        w.on('exit', () => { live--; if (!live) (left ? reject(new Error(`textures: ${left} row chunks not baked`)) : resolve()); });
      }
    });
  }
  let painted = 0;
  for (let p = 0; p < N; p++) if (D.done[p]) painted++;
  log?.(`  pass ${W}² (${Object.entries(want).filter(([, v]) => v).map(([k]) => k).join(', ')}): ${painted} texels (${((100 * painted) / N).toFixed(1)} %, ${((100 * ras.mask.reduce((a, m) => a + (m === 3 ? 1 : 0), 0)) / N).toFixed(2)} % extrapolated) in ${((Date.now() - t0) / 1000).toFixed(1)} s${canWork ? ` (${nW} workers)` : ''}`);
  return { W, ras, ...D };
}

// ------------------------------------------------------------------------------------------------- the eye's window, the teeth
/** The atlas rect [x0, y0, x1, y1] (share) in whole texels at size W: the texels whose centres fall inside. */
const rectPx = (r, W) => [Math.round(r[0] * W), Math.round(r[1] * W), Math.round(r[2] * W), Math.round(r[3] * W)];

/**
 * The eye painter's rects into a pass's outputs: eye.paintEye(rects, size, o) with rects the layout's iris and eyeSkin
 * rects (shares of the atlas, as BODY_LAYOUT gives them) and o { skin: (p, n) → linear rgb — the pattern's colour at the
 * LEFT globe's point at rest, part EYE_SKIN_PART ('head': the cap is the turret's own skin at rest, seamless on Eye_L, and on Eye_R through EYE_MIRROR), skinRough (surface WET.eye.skin), tier }.
 * It returns either whole-atlas arrays { rgb (size² · 3 linear), rough, metal?, ao?, irid?, mask (1 the window, 2 the
 * skin cap, 0 untouched) } (iris.mjs) or per-rect layers { iris: { w, h, rgb, rough } } (the stub). Written only where
 * the texel's triangle is the eye's own part (the window's on the iris rect, the cap's on eyeSkin); the window's normal
 * flat, its occlusion 1, the cap's normal left to the surface (its granules). ORM B in the eye's rects: the painter's
 * metal (the Eye material reads B as metalness: iris.mjs EYE_MATERIAL), else 1 (the eye is always wet).
 * @returns the texels written
 */
function paintEyeInto(R, M, layout, want, o, ctx) {
  const W = R.W, rects = { iris: layout.iris, eyeSkin: layout.eyeSkin };
  const sp = o.eyeSkinPart ?? EYE_SKIN_PART;
  const skin = ctx.pctx && !M.pattern.stub ? (p, n) => M.pattern.skinColour(p, n, sp, ctx.pctx).rgb : undefined;
  const E = M.eye.paintEye(rects, W, { tier: o.fieldTier, skin, skinRough: M.surface.WET?.eye?.skin, ...(o.eyeOpts ?? {}) });
  const byte = (a) => a instanceof Uint8Array || a instanceof Uint8ClampedArray;
  const v01 = (a, q) => (byte(a) ? a[q] / 255 : a[q]);
  const s8lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  let n = 0;
  for (const key of ['iris', 'eyeSkin']) {
    const [x0, y0, x1, y1] = rectPx(rects[key], W);
    const whole = !!E.rgb, layer = whole ? E : E[key];
    if (!layer) continue;
    const code = key === 'iris' ? 1 : 2;
    for (let y = Math.max(0, y0 - 8); y < Math.min(W, y1 + 8); y++) for (let x = Math.max(0, x0 - 8); x < Math.min(W, x1 + 8); x++) {
      const p = y * W + x, t = R.tri[p];
      if (t < 0 || PARTS[R.triPart[t]] !== key) continue;
      let q;
      if (whole) { if (E.mask && E.mask[p] !== code) continue; q = p; } else { if (x < x0 || x >= x1 || y < y0 || y >= y1) continue; q = (y - y0) * (layer.w ?? x1 - x0) + (x - x0); }
      if (want.colour) {
        const c = byte(layer.rgb) ? [0, 1, 2].map((i) => s8lin(layer.rgb[q * 3 + i])) : [layer.rgb[q * 3], layer.rgb[q * 3 + 1], layer.rgb[q * 3 + 2]];
        R.col[p * 3] = c[0]; R.col[p * 3 + 1] = c[1]; R.col[p * 3 + 2] = c[2]; R.bars[p] = 0;
      }
      if (want.surface) {
        if (layer.rough) R.orm[p * 3 + 1] = v01(layer.rough, q);
        if (key === 'iris') { R.orm[p * 3] = layer.ao ? v01(layer.ao, q) : 1; R.nrm[p * 3] = 0; R.nrm[p * 3 + 1] = 0; R.nrm[p * 3 + 2] = 1; }
        else if (layer.ao) R.orm[p * 3] = v01(layer.ao, q);
        R.orm[p * 3 + 2] = layer.metal ? v01(layer.metal, q) : 0;
      }
      R.done[p] = 1; n++;
    }
  }
  return n;
}

/** The teeth's swatch rect: their constant UV reads its centre; the whole rect painted alike. */
function paintTeeth(R, M, layout, want) {
  if (!layout.teeth) return 0;
  const [x0, y0, x1, y1] = rectPx(layout.teeth, R.W);
  const c = want.colour ? M.pattern.skinColour([5, 2, 0], [0, -1, 0], 'teeth', R.pctx ?? M.pattern.patternContext?.(null, {}) ?? {}) : null;
  const s = want.surface ? (M.surface.skinDetail([5, 2, 0], [0, -1, 0], 'teeth', R.sctx ?? {}) ?? {}) : null;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = y * R.W + x;
    if (c) { R.col.set(c.rgb, p * 3); R.bars[p] = 0; }
    if (s) { R.orm[p * 3] = s.ao ?? 1; R.orm[p * 3 + 1] = s.rough ?? 0.3; R.orm[p * 3 + 2] = s.wet ?? 1; R.nrm[p * 3] = 0; R.nrm[p * 3 + 1] = 0; R.nrm[p * 3 + 2] = 1; }
    R.done[p] = 1;
  }
  return (x1 - x0) * (y1 - y0);
}

// ------------------------------------------------------------------------------------------------- maps
/** Floats → 8-bit maps, the gutters filled (bake.fillNearest). Returns { image: { W, H, ch, data }, have }. */
function finishMap(R, kind) {
  const N = R.W * R.W, have = Uint8Array.from(R.done);
  let ch, data;
  if (kind === 'baseColor') {
    ch = 4; data = new Uint8Array(N * 4);
    for (let p = 0; p < N; p++) { for (let i = 0; i < 3; i++) data[p * 4 + i] = toSRGB8(R.col[p * 3 + i]); data[p * 4 + 3] = Math.round(255 * clamp01(R.bars[p])); }
  } else if (kind === 'normal') {
    ch = 3; data = new Uint8Array(N * 3);
    for (let p = 0; p < N; p++) {
      if (!have[p]) { data[p * 3] = 128; data[p * 3 + 1] = 128; data[p * 3 + 2] = 255; continue; }
      for (let i = 0; i < 3; i++) data[p * 3 + i] = Math.round((R.nrm[p * 3 + i] * 0.5 + 0.5) * 255);
    }
  } else {
    ch = 3; data = new Uint8Array(N * 3);
    for (let p = 0; p < N; p++) for (let i = 0; i < 3; i++) data[p * 3 + i] = Math.round(255 * clamp01(R.orm[p * 3 + i]));
  }
  const raw = Uint8Array.from(data);
  const src = fillNearest(data, ch, R.W, R.W, have);
  let left = 0; for (let p = 0; p < N; p++) if (src[p] < 0) left++;
  return { image: { W: R.W, H: R.W, ch, data }, raw, have, unfilled: left };
}

/**
 * A tier's body-atlas maps.
 * @param tierMesh bakeMesh() (the skin + the left eye at rest), fish frame
 * @param o {
 *   maps: { baseColor: px, normal?: px, orm?: px } (the contract's sizes; lod2 { baseColor: 256 } and `lit`),
 *   layout (fishmesh BODY_LAYOUT / BODY_LAYOUT_LOD2), fieldTier 'hero' | 'lod1' | 'lod2' (the surface's field),
 *   pattern, surface, eye (modules or paths; default the sibling files or the stubs), lit (lod2: the light baked in),
 *   ss (colour supersampling, 2), reach (extrapolated texels, 1.5), workers, test ('domes': the convention test's
 *   detail instead of the surface's), mips (levels to measure with bake.mipBleed, 0 = none), log }
 * @returns { images: { baseColor, normal?, orm? } ({ W, H, ch, data } 8-bit, filled), stats, modules }
 */
export async function bakeTier(tierMesh, o = {}) {
  const log = o.log ?? (() => {});
  const { mods: M, urls } = await loadModules({ pattern: o.pattern, surface: o.surface, eye: o.eye });
  const maps = o.maps ?? { baseColor: o.size ?? 2048, normal: o.size ?? 2048, orm: o.size ?? 2048 };
  const layout = o.layout;
  // the passes: one per size, each evaluating what its maps need (lod1: colour at 1024, normal + ORM at 512)
  const bySize = new Map();
  for (const [k, px] of Object.entries(maps)) { if (!px) continue; if (!bySize.has(px)) bySize.set(px, []); bySize.get(px).push(k); }
  const images = {}, stats = { modules: Object.fromEntries(Object.entries(urls).map(([k, u]) => [k, u === 'stub' ? 'stub' : u ? path.basename(fileURLToPath(u)) : 'namespace'])), passes: [] };
  for (const [px, kinds] of [...bySize.entries()].sort((a, b) => b[0] - a[0])) {
    const want = { colour: kinds.includes('baseColor'), surface: kinds.includes('normal') || kinds.includes('orm'), lit: !!o.lit && kinds.includes('baseColor'), irisSurface: false };
    const R = await runPass(tierMesh, px, want, { ...o, fieldTier: o.fieldTier ?? 'hero' }, M, urls, log);
    // the eye's window from its painter, the teeth's swatch (main thread: one call each)
    const ctxs = {};
    if (want.colour) ctxs.pctx = M.pattern.patternContext((await import('./body.mjs')).fishSDFmm(HL), { texelMM: texelMM(px) });
    if (want.surface && !o.test) ctxs.sctx = M.surface.surfaceContext((await import('./fishmesh.mjs')).tierField(o.fieldTier ?? 'hero'), { size: px, tier: o.fieldTier ?? 'hero' });
    Object.assign(R, ctxs);
    // (the convention test leaves the window to the test's relief and the teeth flat grey)
    const eyeTexels = layout && !o.test ? paintEyeInto(R, M, layout, want, o, ctxs) : 0;
    const teethTexels = layout && !o.lit && !o.test ? paintTeeth(R, M, layout, want) : 0;
    const passStats = { px, kinds, eyeTexels, teethTexels, maps: {} };
    // (the trunk's cavity where this pass has both the colour and the surface: CAVITY_ALBEDO's mean)
    if (want.colour && want.surface && !o.test) {
      const v = [];
      for (let p = 0; p < px * px; p++) { const t = R.tri[p]; if (t >= 0 && R.done[p] && (R.triPart[t] === PART.body || R.triPart[t] === PART.patch) && R.cavOn[p]) v.push(R.cav[p]); }
      v.sort((a, b) => a - b);
      const q = (f) => +(v[Math.min(v.length - 1, Math.floor(f * v.length))] ?? 0).toFixed(4);
      const cm = (o.cavAlbedo === undefined ? CAVITY_ALBEDO : o.cavAlbedo)?.max ?? 0.5;
      passStats.trunkCavity = { texels: v.length, mean: +(v.reduce((a, x) => a + x, 0) / Math.max(1, v.length)).toFixed(4), [`meanClamped${cm}`]: +(v.reduce((a, x) => a + Math.min(x, cm), 0) / Math.max(1, v.length)).toFixed(4), p50: q(0.5), p90: q(0.9), p99: q(0.99) };
    }
    for (const k of kinds) {
      const F = finishMap(R, k);
      images[k] = F.image;
      const ms = { unfilled: F.unfilled, painted: F.have.reduce((a, v) => a + (v ? 1 : 0), 0) };
      if (o.mips) {
        const isl = islands(F.have, px, px), chans = k === 'baseColor' ? [0, 1, 2] : [0, 1, 2];
        ms.mips = mipBleed(F.image.data, F.image.ch, px, px, F.have, { levels: o.mips, step: o.mipStep ?? 3, channels: chans, isl });
        if (o.mipsRaw) ms.mipsRaw = mipBleed(F.raw, F.image.ch, px, px, F.have, { levels: o.mips, step: o.mipStep ?? 3, channels: chans, isl });
        ms.islands = isl.boxes.length;
      }
      if (o.keepRaw) images[`${k}Raw`] = { ...F.image, data: F.raw };
      passStats.maps[k] = ms;
    }
    stats.passes.push(passStats);
  }
  return { images, stats, modules: M };
}

// ------------------------------------------------------------------------------------------------- the fin atlas
/**
 * The fin atlas at `size` (contract §2: RGBA, A the membrane's coverage): finatlas.paintFinAtlas(size, defs, o), then
 * the colour carried into every texel the fins' UVs do not cover or whose A is 0 (from the nearest covered texel: a
 * bilinear or mip lookup at a membrane's edge blends its own colour, not black) — A left as painted — and the caudal's
 * sheath opaque: the texels under its triangles A = 255 (build.mjs: the fin mesh's `sheathTris` [first, count]).
 * @param defs fins.finDefinitions()   @param o { meshes: [{ uv, indices, sheathTris?: [first, count] }], tier, fin }
 * @returns { image: { W, H, ch: 4, data }, material (the module's FIN_MATERIAL), stats }
 */
export async function finAtlas(size, defs, o = {}) {
  const { mods: M } = await loadModules({ fin: o.fin });
  // (the caudal's fleshy base takes the body's skin colour over the seam: the pattern's, o.pattern)
  let skin;
  if (o.pattern && !o.pattern.stub) {
    const pctx = o.pattern.patternContext((await import('./body.mjs')).fishSDFmm(HL), { texelMM: texelMM(size) });
    skin = (p, n) => o.pattern.skinColour(p, n, 'body', pctx).rgb;
  }
  const P = M.fin.paintFinAtlas(size, defs, { tier: o.tier, skin, ...(o.finOpts ?? {}) });
  let data = P.rgba;
  if (!(data instanceof Uint8Array)) {
    // (linear floats RGB + A 0..1)
    const f = data; data = new Uint8Array(size * size * 4);
    for (let p = 0; p < size * size; p++) { for (let i = 0; i < 3; i++) data[p * 4 + i] = toSRGB8(f[p * 4 + i]); data[p * 4 + 3] = Math.round(255 * clamp01(f[p * 4 + 3])); }
  }
  // the meshes' coverage, and the sheath's texels
  const have = new Uint8Array(size * size);
  let sheath = 0, shared = 0;
  for (const m of o.meshes ?? []) {
    const r = texelTriangles(m, size, size, { reach: 1 });
    for (let p = 0; p < size * size; p++) if (r.tri[p] >= 0) have[p] = 1;
    if (!m.sheathTris) continue;
    // (the sheath's texels — rasterised on their own, the membrane's apart: a texel both cover is the membrane's and keeps
    // its A, counted in `shared`)
    const [s0, sn] = m.sheathTris, inSh = (t) => t >= s0 && t < s0 + sn;
    const rs = texelTriangles(m, size, size, { keep: inSh }), rm = texelTriangles(m, size, size, { keep: (t) => !inSh(t) });
    for (let p = 0; p < size * size; p++) {
      if (rs.tri[p] < 0) continue;
      if (rm.tri[p] >= 0) { shared++; continue; }
      if (data[p * 4 + 3] < 255) { data[p * 4 + 3] = 255; sheath++; }
    }
  }
  if (!o.meshes?.length) for (let p = 0; p < size * size; p++) have[p] = data[p * 4 + 3] > 0 ? 1 : 0;
  for (let p = 0; p < size * size; p++) if (data[p * 4 + 3] === 0) have[p] = 0;
  // (the colour only: a 3-channel copy filled, written back; A untouched)
  const rgb = new Uint8Array(size * size * 3);
  for (let p = 0; p < size * size; p++) for (let i = 0; i < 3; i++) rgb[p * 3 + i] = data[p * 4 + i];
  fillNearest(rgb, 3, size, size, have);
  for (let p = 0; p < size * size; p++) for (let i = 0; i < 3; i++) data[p * 4 + i] = rgb[p * 3 + i];
  // (outside the meshes' UVs A = 0: what a painter left in a rect's corner never shows)
  let cleared = 0;
  if (o.meshes?.length) {
    const near = new Uint8Array(size * size);
    for (const m of o.meshes) { const r = texelTriangles(m, size, size, { reach: 2.5 }); for (let p = 0; p < size * size; p++) if (r.tri[p] >= 0) near[p] = 1; }
    for (let p = 0; p < size * size; p++) if (!near[p] && data[p * 4 + 3]) { data[p * 4 + 3] = 0; cleared++; }
  }
  return { image: { W: size, H: size, ch: 4, data }, material: M.fin.FIN_MATERIAL ?? STUBS.fin.FIN_MATERIAL, fin: M.fin, stats: { sheathTexels: sheath, sheathShared: shared, cleared, module: M.fin.stub ? 'stub' : 'finatlas.mjs' } };
}

// ------------------------------------------------------------------------------------------------- encoding
/** An 8-bit image as PNG (lossless; the master format) or JPEG (RGB only). */
export function encodeImage(img, fmt = 'png', quality = 95) {
  if (fmt === 'png') return encodePNG(img.W, img.H, img.ch, img.data);
  const rgba = Buffer.alloc(img.W * img.H * 4);
  for (let p = 0; p < img.W * img.H; p++) { for (let i = 0; i < 3; i++) rgba[p * 4 + i] = img.data[p * img.ch + Math.min(i, img.ch - 1)]; rgba[p * 4 + 3] = 255; }
  return jpeg.encode({ data: rgba, width: img.W, height: img.H }, quality).data;
}

/** A box-filtered 2× reduction of an 8-bit image (lod tiers that take a larger bake's map). */
export function halve(img) {
  const W = img.W >> 1, H = img.H >> 1, ch = img.ch, d = new Uint8Array(W * H * ch);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < ch; c++) {
    const s = img.data[((2 * y) * img.W + 2 * x) * ch + c] + img.data[((2 * y) * img.W + 2 * x + 1) * ch + c] + img.data[((2 * y + 1) * img.W + 2 * x) * ch + c] + img.data[((2 * y + 1) * img.W + 2 * x + 1) * ch + c];
    d[(y * W + x) * ch + c] = Math.round(s / 4);
  }
  return { W, H, ch, data: d };
}
