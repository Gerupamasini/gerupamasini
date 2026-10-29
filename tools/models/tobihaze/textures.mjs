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
// Map channels (contract §2, §5; the pattern and surface keys' requests; round T3 the standard glTF channels):
//   baseColor RGBA  sRGB albedo (the master's: the skin at MASTER_WETNESS); A = pattern `bars` (the excitement
//                   crossbands' mask: a runtime uniform darkens by it; the opaque skin ignores A)
//   normal RGB      tangent space, +y = cross(n, t)·w (glTF: up the image, −v; the meshes' own tangents); the clearcoat's
//                   normal too, at clearcoatNormalTexture.scale ≪ 1 (round T3: build.mjs FILM_NORMAL_SCALE — the film
//                   levels the skin's granules)
//   ORM RGBA        (round T3, masterChannels; T2's 'film map' had R the film and A the occlusion, which no renderer read)
//                   the glTF channels every loader reads — R the ambient occlusion (occlusionTexture), G the roughness
//                   at the master wetness (metallicRoughnessTexture; the clearcoat's roughness through
//                   clearcoatRoughnessTexture, which reads G, × a factor), B 0 (the metalness: metallicFactor 0 as well) —
//                   and A the wet retention (where the film stays as the fish dries: only the runtime's wetness rule reads
//                   it). The master is the wet fish (MASTER_WETNESS 1: u1's film whole over the head and the back): its
//                   film is the clearcoat's constant factor 1, no map. The surface module gives the WET-state roughness,
//                   the retention and the occlusion per texel
// Round T2 integrator (the keys' requests, each tested on the merged build, ref/work/t2_build):
//   the colour × surface.skinDetail's `albedo` (ALBEDO_AO: the creases, the unbanded pits / pores / nostril, the trunk's
//   scale pockets about their mean) in place of CAVITY_ALBEDO, at the hero and at lod1's 1024 colour pass too (want.albedo:
//   the surface's fields at the colour's size), not lod2's lit pass; the film map's R × surface.specularOcclusion(ao)
//   (the surface key's tested patch, t2_surface/py/patch_request.py); the baseColor's A in the iris rect = paintEye's
//   `glow` (hero, lod1: the runtime pupil variant's mask); the cap's pattern part EYE_SKIN_PART 'eyeSkin'
// Round T3 (key tech; ref/work/t3_tech): the ORM's standard channels (above; the occlusion back in every renderer); the two
//   eye caps each their own skin (fishmesh BODY_LAYOUT eyeSkinL / eyeSkinR: the right globe's cap baked at its own place,
//   EYE_MIRROR off); the eyes' rects R 1 (no occlusion on a globe that turns), the teeth's 0.3 (inside the mouth); the
//   `hidden` chart (the cap closing the skin inside each globe, seen at the window's posterior lip in the blink) the
//   socket's colour in shade (paintHidden); lod2's baked light no brighter than the hero under a sun (LOD2_LIGHT); the
//   caudal's sheath an island of its own in the fin atlas (build.mjs moves its UVs), opaque and the body's colour
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
 * 'eyeSkin', 1.5× with 'head'; the eyefin key's p5 test alike). --eye-skin-part eyeSkin restores the pattern key's.
 * Round T2 integrator (the pattern key's request): 'eyeSkin'. The T2 pattern gives the cap layer to part 'eyeSkin' and to
 * the head skin within ~1.1 globe radii alike, so on the cap at rest the two are the same colour (1,884 cap vertices of
 * the hero's left globe: |ΔL*| 0.000 mean and max, t2_build/js/capcmp.mjs) — the part now says what the texel is. */
export const EYE_SKIN_PART = 'eyeSkin';

/**
 * The right eye's turret mirrored (round T1 integrator, the eyefin key's request): both globes read the eyeSkin rect, baked
 * from the LEFT globe at rest, so Eye_R's cap is the left cap's mirror image; the head skin round the right globe takes
 * the left's colour and relief mirrored too (the point and normal z → −z, the relief's dn back), so the cap meets its
 * turret as Eye_L's does. Full inside `inner` × the globe's radius of the right globe's centre, fading out over `fade`
 * mm; the midline (z 0) is its own mirror, so the two turrets stay continuous where they meet. Skin parts only (not the
 * cap, the window, the teeth).
 * Round T3: OFF by default (bakeTier o.eyeMirror true turns it on: a comparison only). Each cap has its own rect
 * (fishmesh BODY_LAYOUT eyeSkinL / eyeSkinR) baked from its own globe at rest, so the right turret is its own skin and
 * meets its own cap (the eye finding's P3: the caps' high-pass NCC 0.745, mirror clones).
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

/**
 * The master's wetness (round T3: 1 — T2's 0.65): the static GLB material is the skin at this value of the runtime's
 * wetness uniform. A plain glTF loader can vary the clearcoat only through a texture's R, which is the occlusion's
 * (glTF: occlusionTexture and clearcoatTexture both read R), so the static film is the clearcoat's constant factor —
 * whole, as on u1 (the owner's photo: the film over the head and the back mirrors the sky) — and the master is the wet
 * fish: every texel at local wetness 1, the ORM's G the WET state's roughness. The drying (the dorsum first: the
 * retention) is the runtime's rule on the ORM's A (build.mjs runtimeParams; a land state's wetness ~0.65 gives T2's
 * damp dorsum back).
 */
export const MASTER_WETNESS = 1;
const sstepT = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/**
 * The ORM texel (round T3: the glTF channels) from the surface's WET-state roughness, its retention and occlusion:
 * [R the occlusion, G the roughness at the master wetness, B 0 (metal), A the retention]. G = mix(dry, wet, wl0), the
 * local wetness wl0 = clamp(w0·(1 + γ) − γ·(1 − retain)), dry = WET.dry.roughness + (wet − WET.wet.roughness)·WET.carry
 * (surface.WET's rule, the runtime's port: build.mjs runtimeParams; at w0 = 1, G = the wet state's roughness).
 */
export function masterChannels(roughWet, retain, ao, W, w0 = MASTER_WETNESS) {
  const g = W.gamma ?? 1.2, wl = clamp01(w0 * (1 + g) - g * (1 - retain));
  const dry = (W.dry?.roughness ?? 0.6) + (roughWet - (W.wet?.roughness ?? 0.35)) * (W.carry ?? 0.5);
  return [ao, dry + (roughWet - dry) * wl, 0, retain];
}

/** The scales' pockets in the trunk's albedo (round T1 integrator; the pattern and surface keys' requests: A007's scale
 * margins, the contract's "scales visible on the trunk in close-ups"; the relief alone, 0.9° rms, does not show them under
 * the busy pattern): albedo × (1 − k·(min(cavity, max) − mean)), surface.skinDetail's cavity (the scale pockets 0.35, the
 * pits, the creases; clamped at `max` so the creases, already in the occlusion, are not darkened twice) about its trunk
 * mean (the build report's trunkCavity.meanClamped), so the trunk's mean colour — and the lower tiers, whose colour passes
 * have no surface and whose texels cannot hold a scale — keep the pattern's calibration; only where the colour pass has the
 * surface (the hero's 2048). Photo-camera check (photo light): region means unchanged within ΔE 1, the lower flank's
 * pattern contrast 0.69 → 0.70. null: off (--cav-albedo off). */
export const CAVITY_ALBEDO = { k: 0.35, max: 0.5, mean: 0.148 };
/** (round T2, the colour key's seam finding: the pockets weighted by position — w = smoothstep(s0, s1, s), fish mm — on
 * every skin chart behind the head, not by chart: T1 applied them to the body charts only, which begin at s 0.43 HL,
 * a 4.7–6.1 % luminance step across the cheek where the head chart meets them) */
const CAVITY_RAMP = [0.95 * HL, 1.15 * HL];

/** The texel's skin size per map size (pattern.mjs: hero 2048 0.031 mm, lod1 1024 0.062, lod2 256 0.25). */
export const texelMM = (size) => (0.031 * 2048) / size;

/** lod2's baked light (contract §2: AO × a soft key): a soft overhead key a little from the front (fish frame: s back,
 * y up, z left) as a ratio of the sculpt's normal's light to the mesh's, the occlusion softened; both clamped. Round T3
 * (the tech finding's P4: the baked key added to the field's sun, lod2 − hero +1.4 / +2.9 L* side / top under 'game'): the
 * ratio no brighter than 1.05 — the sculpt's detail darkens the far mesh's light, it never adds a second sun. Round T3
 * integrator: 1.0 (with build.mjs LOD2_SPECULAR 0.35) — the merged colour put the game side at +1.67 with 1.05 / 0.4. */
export const LOD2_LIGHT = { dir: [-0.35, 1, 0.15], wrap: 0.35, ratio: [0.72, 1.0], ao: 0.5 };

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
 * @param extra [{ position (fish mm), normal, tangent, uv, indices, part: name | (t) → name, side?: +1 | −1 }] (the eye:
 *              'eyeSkin' for its skin triangles, 'iris' for the window's; round T3: `side` the globe's — the left globe
 *              whole at rest, the right one's skin cap, each cap in its own rect — kept per triangle in triSide)
 */
export function bakeMesh(skin, extra = []) {
  const names = (skin.charts ?? []).map((c) => (typeof c === 'string' ? c : c.name));
  const parts = [skin, ...extra];
  const nv = parts.reduce((a, m) => a + m.position.length / 3, 0), ni = parts.reduce((a, m) => a + m.indices.length, 0);
  const out = { position: new Float32Array(nv * 3), normal: new Float32Array(nv * 3), tangent: new Float32Array(nv * 4), uv: new Float32Array(nv * 2), indices: new Uint32Array(ni), triPart: new Uint8Array(ni / 3), triSide: new Int8Array(ni / 3) };
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
      out.triSide[i0 / 3 + t] = k === 0 ? 0 : m.side ?? 1;
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
      if (S.want.surface || S.want.lit || S.want.albedo) {
        sd = S.test ? testDetail(S.test, pos, nrm, 25 * texelMM(W)) : M.surface.skinDetail(pos, nrm, sPart, S.sctx, undefined, S.edge ? { edge: S.edge[p] } : {});
        // (the right turret: the left's relief mirrored, EYE_MIRROR)
        const mw = S.test || NO_MIRROR.has(part) || S.eyeMirror === false ? 0 : eyeMirrorWeight(pos);
        if (mw > 0) {
          const m = M.surface.skinDetail([pos[0], pos[1], -pos[2]], [nrm[0], nrm[1], -nrm[2]], sPart, S.sctx, undefined, S.edge ? { edge: S.edge[p] } : {});
          const dm = [m.dn[0], m.dn[1], -m.dn[2]], mix = (a, b) => (a ?? 0) + ((b ?? 0) - (a ?? 0)) * mw;
          sd = { ...sd, dn: [mix(sd.dn[0], dm[0]), mix(sd.dn[1], dm[1]), mix(sd.dn[2], dm[2])], rough: mix(sd.rough, m.rough), ao: mix(sd.ao ?? 1, m.ao ?? 1), wet: mix(sd.wet, m.wet), cavity: mix(sd.cavity, m.cavity), ...(sd.albedo !== undefined ? { albedo: mix(sd.albedo, m.albedo ?? 1) } : {}), ...(sd.pocket !== undefined ? { pocket: mix(sd.pocket, m.pocket ?? 0) } : {}) };
        }
        hi[0] = nrm[0] + sd.dn[0]; hi[1] = nrm[1] + sd.dn[1]; hi[2] = nrm[2] + sd.dn[2]; unit(hi);
      }
      if (S.want.surface) {
        unit(interp(frames.t, t, w3, T)); unit(interp(frames.b, t, w3, B)); unit(interp(frames.n, t, w3, Nf));
        encodeTangentNormal(hi, T, B, Nf, enc);
        S.nrm[p * 3] = enc[0]; S.nrm[p * 3 + 1] = enc[1]; S.nrm[p * 3 + 2] = enc[2];
        // (the occlusion, the WET-state roughness, the wet retention — finishMap writes the film map from them; round T2: the
        // eye's rects keep their film, retention 1 — the eye is always wet — and the Eye reads no metalness)
        if (sd.pocket !== undefined && !S.want.colour) { S.cav[p] = sd.pocket; S.cavOn[p] = pos[0] >= CAVITY_RAMP[1] ? 1 : 2; }
        S.orm[p * 3] = sd.ao ?? 1; S.orm[p * 3 + 1] = sd.rough ?? 0.5; S.orm[p * 3 + 2] = part === 'eyeSkin' || part === 'iris' ? 1 : sd.wet ?? 0;
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
        // (the scales' pockets in the albedo, CAVITY_ALBEDO: the skin behind the head by position, CAVITY_RAMP — round T2 —
        // where this pass has the surface too)
        if (sd && (S.want.surface || S.want.albedo) && sd.albedo !== undefined && !S.test) {
          // (the surface's colour share: creases, fine cavities, the scale pockets — surface.ALBEDO_AO; round T2 integrator:
          // lod1's colour pass at 1024 too — `want.albedo`, the surface's fields at the colour's own size — so lod1's colour
          // is the hero's: the surface key's request)
          f *= sd.albedo;
          if (sd.pocket !== undefined) { S.cav[p] = sd.pocket; S.cavOn[p] = pos[0] >= CAVITY_RAMP[1] ? 1 : 2; }
        }
        const cw = sd && S.want.surface && sd.albedo === undefined && (part === 'body' || part === 'patch' || part === 'head') ? sstepT(CAVITY_RAMP[0], CAVITY_RAMP[1], pos[0]) : 0;
        if (cw > 0) {
          S.cav[p] = sd.cavity ?? 0; S.cavOn[p] = cw >= 1 ? 1 : 2;
          if (S.cavAlbedo) f *= 1 - cw * S.cavAlbedo.k * (Math.min(sd.cavity ?? 0, S.cavAlbedo.max ?? 1) - S.cavAlbedo.mean);
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
  if ((S.want.surface || S.want.lit || S.want.albedo) && !S.test) {
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
  // (round T3, the surface key's request: each texel's distance in texels from its chart's edge — a two-pass chamfer from
  // the texels no triangle covers (mask 0) and the extrapolated ones (mask 3), which sit at 0, less half a texel — for
  // skinDetail's o.edge, so the relief and the field term fade to the mesh normal at the seams (surface.mjs SEAM_FADE))
  const edge = shared(Float32Array, N);
  { const M = ras.mask, INF = 1e9;
    for (let p = 0; p < N; p++) edge[p] = M[p] === 1 || M[p] === 2 ? INF : 0;
    const a = 1, b = Math.SQRT2;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (!edge[p]) continue; let v = edge[p];
      if (x > 0) v = Math.min(v, edge[p - 1] + a); if (y > 0) { v = Math.min(v, edge[p - W] + a); if (x > 0) v = Math.min(v, edge[p - W - 1] + b); if (x < W - 1) v = Math.min(v, edge[p - W + 1] + b); } edge[p] = v; }
    for (let y = W - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const p = y * W + x; if (!edge[p]) continue; let v = edge[p];
      if (x < W - 1) v = Math.min(v, edge[p + 1] + a); if (y < W - 1) { v = Math.min(v, edge[p + W] + a); if (x < W - 1) v = Math.min(v, edge[p + W + 1] + b); if (x > 0) v = Math.min(v, edge[p + W - 1] + b); } edge[p] = v; }
    for (let p = 0; p < N; p++) if (edge[p] > 0) edge[p] -= 0.5;
  }
  const D = {
    tobihazeBake: true, W, H: W, ss: o.ss ?? 2, want, test: o.test ?? null, fieldTier: o.fieldTier ?? 'hero', colourSize: W,
    patternOpts: o.patternOpts ?? null, surfaceOpts: o.surfaceOpts ?? null, eyeSkinPart: o.eyeSkinPart ?? EYE_SKIN_PART, eyeMirror: o.eyeMirror ?? false, cavAlbedo: o.cavAlbedo === undefined ? CAVITY_ALBEDO : o.cavAlbedo, urls,
    edge, tri: toShared(ras.tri), uv: toShared(mesh.uv), indices: toShared(mesh.indices), position: toShared(mesh.position), normal: toShared(mesh.normal),
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
  const W = R.W;
  const sp = o.eyeSkinPart ?? EYE_SKIN_PART;
  // (round T3: each cap its own rect — eyeSkinL painted with the window, eyeSkinR alone — and its own skin: the painter
  // gives the LEFT globe's point at rest, which for the right cap is mirrored to the right globe's own point (the right
  // globe is the left's mirror image, the same UV at the mirrored point: checked, 0 m); without the split, one cap as T2)
  const skinAt = (side) => (ctx.pctx && !M.pattern.stub ? (p, n) => M.pattern.skinColour(side > 0 ? p : [p[0], p[1], -p[2]], side > 0 ? n : [n[0], n[1], -n[2]], sp, ctx.pctx).rgb : undefined);
  const split = !!(layout.eyeSkinL && layout.eyeSkinR && R.triSide);
  const calls = split ? [{ side: 1, rects: { iris: layout.iris, eyeSkin: layout.eyeSkinL } }, { side: -1, rects: { eyeSkin: layout.eyeSkinR } }] : [{ side: 0, rects: { iris: layout.iris, eyeSkin: layout.eyeSkin } }];
  const byte = (a) => a instanceof Uint8Array || a instanceof Uint8ClampedArray;
  const v01 = (a, q) => (byte(a) ? a[q] / 255 : a[q]);
  const s8lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  let n = 0;
  for (const call of calls) {
  const rects = call.rects;
  const E = M.eye.paintEye(rects, W, { tier: o.fieldTier, skin: skinAt(call.side || 1), skinRough: M.surface.WET?.eye?.skin, ...(o.eyeOpts ?? {}) });
  for (const key of ['iris', 'eyeSkin']) {
    if (!rects[key]) continue;
    const [x0, y0, x1, y1] = rectPx(rects[key], W);
    const whole = !!E.rgb, layer = whole ? E : E[key];
    if (!layer) continue;
    const glow = o.fieldTier !== 'lod2' && o.eyeGlow !== false ? layer.glow ?? null : null;
    const code = key === 'iris' ? 1 : 2;
    for (let y = Math.max(0, y0 - 8); y < Math.min(W, y1 + 8); y++) for (let x = Math.max(0, x0 - 8); x < Math.min(W, x1 + 8); x++) {
      const p = y * W + x, t = R.tri[p];
      if (t < 0 || PARTS[R.triPart[t]] !== key) continue;
      if (key === 'eyeSkin' && call.side && R.triSide[t] !== call.side) continue;
      let q;
      if (whole) { if (E.mask && E.mask[p] !== code) continue; q = p; } else { if (x < x0 || x >= x1 || y < y0 || y >= y1) continue; q = (y - y0) * (layer.w ?? x1 - x0) + (x - x0); }
      if (want.colour) {
        const c = byte(layer.rgb) ? [0, 1, 2].map((i) => s8lin(layer.rgb[q * 3 + i])) : [layer.rgb[q * 3], layer.rgb[q * 3 + 1], layer.rgb[q * 3 + 2]];
        // (round T2 integrator, the eyefin key's request: the baseColor's A in the iris rect is the pupil glow's mask —
        // paintEye `glow`, the weight of the glow colour in the texel — for the runtime's pupil variant, iris.mjs
        // EYE_MATERIAL.extras.runtime.pupil; hero and lod1 only (lod2's merged eye has no variant: 0); the cap's A 0)
        const gl = key === 'iris' && glow ? (byte(glow) ? glow[q] / 255 : glow[q]) : 0;
        R.col[p * 3] = c[0]; R.col[p * 3 + 1] = c[1]; R.col[p * 3 + 2] = c[2]; R.bars[p] = gl;
      }
      if (want.surface) {
        if (layer.rough) R.orm[p * 3 + 1] = v01(layer.rough, q);
        // (round T3: no occlusion on either of the eye's rects — the globe turns, lifts and drops, so any shade baked on
        // it is wrong in some pose: the eye finding's P5 and the tech finding's P1; the Eye material has no
        // occlusionTexture, and the ORM's R is 1 here for a loader that applies it anyway; the painter's metal is not
        // used: the Eye material is not metallic; retention 1, the eye always wet)
        if (key === 'iris') { R.nrm[p * 3] = 0; R.nrm[p * 3 + 1] = 0; R.nrm[p * 3 + 2] = 1; }
        R.orm[p * 3] = 1;
        R.orm[p * 3 + 2] = 1;
      }
      R.done[p] = 1; n++;
    }
  }
  }
  return n;
}

/**
 * The `hidden` chart (round T3, the eye finding's P2): the cap that closes the skin inside each globe was painted as the
 * interior's pale lining (L* 90) and shows as a white wedge at the window's posterior lip in the blink (the globe drops
 * into the cup and uncovers it). Painted instead as the eye's socket in its own shade: the median linear colour of the
 * tier's socket charts (else the left cap's) × HIDDEN.shade, the occlusion HIDDEN.ao, its roughness the socket's,
 * retention 1. The rect and the texels its triangles reach past it. The values are measured (t3_tech py/wedge.py: the
 * chart's pixels found by a magenta-marked variant, their median L* against the 6 px ring around them, at B010's camera
 * with the globe 0.05 / 0.08 / 0.10 down and from the side, under the photo and game rigs): T2's lining +22..+37 L*
 * (the white wedge); shade 0.6 / ao 0.3 gave a dark sliver, −5..−29; shade 0.95 / ao 0.85 sits within about ±6 of its
 * ring, with no pixel above the ring's p90.
 */
export const HIDDEN = { shade: 0.95, ao: 0.85, pad: 3 };
function paintHidden(R, layout, want) {
  if (!layout.hidden) return 0;
  const W = R.W, [hx0, hy0, hx1, hy1] = rectPx(layout.hidden, W), pad = HIDDEN.pad;
  // the source: the sockets (hero, lod1), else the left cap's rect
  const src = [layout.socketL, layout.socketR].filter(Boolean);
  if (!src.length) src.push(layout.eyeSkinL ?? layout.eyeSkin);
  const cs = [[], [], []], rs = [];
  for (const r of src) {
    const [x0, y0, x1, y1] = rectPx(r, W);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = y * W + x; if (!R.done[p] || R.tri[p] < 0) continue; for (let i = 0; i < 3; i++) cs[i].push(R.col[p * 3 + i]); rs.push(R.orm[p * 3 + 1]); }
  }
  const med = (a) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
  const c = cs.map(med), rough = med(rs);
  // (the whole rect and its pad, painted or not: the chart's triangles are next to no area in UV — "one texel" — so in T2
  // the texels round them took the gutter fill from the nearest painted texel, the teeth's swatch (#ece2ca, the wedge's
  // sRGB 236, 226, 202); a texel another chart painted is left alone)
  let n = 0;
  for (let y = Math.max(0, hy0 - pad); y < Math.min(W, hy1 + pad); y++) for (let x = Math.max(0, hx0 - pad); x < Math.min(W, hx1 + pad); x++) {
    const p = y * W + x, t = R.tri[p];
    if (R.done[p] && t >= 0 && (R.triSide?.[t] || PARTS[R.triPart[t]] !== 'interior')) continue;
    if (want.colour && c[0] !== null) { for (let i = 0; i < 3; i++) R.col[p * 3 + i] = c[i] * HIDDEN.shade; R.bars[p] = 0; }
    if (want.surface) { R.orm[p * 3] = HIDDEN.ao; if (rough !== null) R.orm[p * 3 + 1] = rough; R.orm[p * 3 + 2] = 1; R.nrm[p * 3] = 0; R.nrm[p * 3 + 1] = 0; R.nrm[p * 3 + 2] = 1; }
    R.done[p] = 1; n++;
  }
  return n;
}

/** The teeth's occlusion (round T3, the tech finding's P5(c)): they sit inside the mouth, which the sky barely reaches —
 * the ORM's R at the swatch (the indirect light × it; T2 wrote 1). */
export const TEETH_AO = 0.3;
/** The teeth's swatch rect: their constant UV reads its centre; the whole rect painted alike. */
function paintTeeth(R, M, layout, want) {
  if (!layout.teeth) return 0;
  const [x0, y0, x1, y1] = rectPx(layout.teeth, R.W);
  const c = want.colour ? M.pattern.skinColour([5, 2, 0], [0, -1, 0], 'teeth', R.pctx ?? M.pattern.patternContext?.(null, {}) ?? {}) : null;
  const s = want.surface ? (M.surface.skinDetail([5, 2, 0], [0, -1, 0], 'teeth', R.sctx ?? {}) ?? {}) : null;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = y * R.W + x;
    if (c) { R.col.set(c.rgb, p * 3); R.bars[p] = 0; }
    if (s) { R.orm[p * 3] = Math.min(s.ao ?? 1, TEETH_AO); R.orm[p * 3 + 1] = s.rough ?? 0.3; R.orm[p * 3 + 2] = 1; R.nrm[p * 3] = 0; R.nrm[p * 3 + 1] = 0; R.nrm[p * 3 + 2] = 1; }
    R.done[p] = 1;
  }
  return (x1 - x0) * (y1 - y0);
}

// ------------------------------------------------------------------------------------------------- maps
/** Floats → 8-bit maps, the gutters filled (bake.fillNearest). Returns { image: { W, H, ch, data }, have }. The ORM
 * (kind 'orm') RGBA from masterChannels at `w0` with the surface's WET (round T3: R occlusion, G roughness, B 0, A the
 * retention; T2's specular occlusion on the film's R is gone with the film's map: three applies the occlusion map to the
 * clearcoat's indirect light itself — specOcc unused, kept in the signature for a caller that passes it). */
function finishMap(R, kind, W = {}, w0 = MASTER_WETNESS, specOcc = null) {
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
    ch = 4; data = new Uint8Array(N * 4);
    for (let p = 0; p < N; p++) {
      const c = masterChannels(R.orm[p * 3 + 1], R.orm[p * 3 + 2], R.orm[p * 3], W, w0);
      for (let i = 0; i < 4; i++) data[p * 4 + i] = Math.round(255 * clamp01(c[i]));
    }
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
    // (round T2 integrator: a colour pass without the surface — lod1's 1024 — still takes the surface's colour share,
    // skinDetail's `albedo`, when the module gives one: ALBEDO_AO; not lod2's lit pass, whose occlusion is in its light)
    want.albedo = want.colour && !want.surface && !want.lit && !o.test && !!M.surface.ALBEDO_AO && o.surfaceAlbedo !== false;
    const R = await runPass(tierMesh, px, want, { ...o, fieldTier: o.fieldTier ?? 'hero' }, M, urls, log);
    // the eye's window from its painter, the teeth's swatch (main thread: one call each)
    const ctxs = {};
    if (want.colour) ctxs.pctx = M.pattern.patternContext((await import('./body.mjs')).fishSDFmm(HL), { texelMM: texelMM(px) });
    if (want.surface && !o.test) ctxs.sctx = M.surface.surfaceContext((await import('./fishmesh.mjs')).tierField(o.fieldTier ?? 'hero'), { size: px, tier: o.fieldTier ?? 'hero' });
    Object.assign(R, ctxs);
    R.triSide = tierMesh.triSide ?? null;
    // (the convention test leaves the window to the test's relief and the teeth flat grey)
    const eyeTexels = layout && !o.test ? paintEyeInto(R, M, layout, want, o, ctxs) : 0;
    const teethTexels = layout && !o.lit && !o.test ? paintTeeth(R, M, layout, want) : 0;
    // (round T3: the hidden chart in the socket's shade — after the eyes, whose cap is the source where a tier has no socket)
    const hiddenTexels = layout && !o.test && o.paintHidden !== false ? paintHidden(R, layout, want) : 0;
    const passStats = { px, kinds, eyeTexels, teethTexels, hiddenTexels, maps: {} };
    // (the trunk's cavity where this pass has both the colour and the surface: CAVITY_ALBEDO's mean)
    if (want.surface && !o.test) {
      const v = [];
      for (let p = 0; p < px * px; p++) { const t = R.tri[p]; if (t >= 0 && R.done[p] && R.cavOn[p] === 1) v.push(R.cav[p]); }
      v.sort((a, b) => a - b);
      const q = (f) => +(v[Math.min(v.length - 1, Math.floor(f * v.length))] ?? 0).toFixed(4);
      const cm = (o.cavAlbedo === undefined ? CAVITY_ALBEDO : o.cavAlbedo)?.max ?? 0.5;
      passStats.trunkCavity = { texels: v.length, mean: +(v.reduce((a, x) => a + x, 0) / Math.max(1, v.length)).toFixed(4), [`meanClamped${cm}`]: +(v.reduce((a, x) => a + Math.min(x, cm), 0) / Math.max(1, v.length)).toFixed(4), p50: q(0.5), p90: q(0.9), p99: q(0.99) };
    }
    for (const k of kinds) {
      const F = finishMap(R, k, M.surface.WET ?? {}, o.masterWetness ?? MASTER_WETNESS, M.surface.specularOcclusion ?? null);
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
 * Round T3: a mesh with `sheathIsland` (build.mjs moved its sheath's UVs onto an island of their own) gets that island
 * painted with A 1 and the atlas's own colour at the sheath's former UVs (`uv0`), else the body's colour at the
 * sheath's points (its `position`, fish mm; `normal`).
 * @param defs fins.finDefinitions()   @param o { meshes: [{ uv, indices, sheathTris?: [first, count], sheathIsland?,
 *   uv0?, position?, normal? }], tier, fin, pattern }
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
  // (round T3, the eyefin key's request: the blade's water copy — finatlas.mjs FIN_BLADE.copy, the pectoral blade painted
  // again at its UVs + offset — counts as covered, so the gutter fill and the clearing below leave it as painted)
  const BC = M.fin.FIN_BLADE?.copy, copies = [];
  if (BC) for (const m of o.meshes ?? []) if ((BC.of ?? []).includes(m.name)) copies.push({ name: `${m.name} (copy)`, uv: Float32Array.from(m.uv, (v, i) => v + BC.offset[i % 2]), indices: m.indices });
  // the meshes' coverage, and the sheath's texels
  const have = new Uint8Array(size * size);
  let sheath = 0, shared = 0, island = 0;
  const w3 = [0, 0, 0];
  for (const m of [...(o.meshes ?? []), ...copies]) {
    const r = texelTriangles(m, size, size, { reach: 1 });
    for (let p = 0; p < size * size; p++) if (r.tri[p] >= 0) have[p] = 1;
    if (!m.sheathTris) continue;
    // (the sheath's texels — rasterised on their own, the membrane's apart: a texel both cover is the membrane's and keeps
    // its A, counted in `shared`)
    const [s0, sn] = m.sheathTris, inSh = (t) => t >= s0 && t < s0 + sn;
    const rs = texelTriangles(m, size, size, { keep: inSh }), rm = texelTriangles(m, size, size, { keep: (t) => !inSh(t) });
    // (round T3: the sheath on an island of its own — build.mjs moved its UVs to the atlas's free quadrant, `sheathIsland`
    // — so no membrane texel is its: A 1 and the body's own colour there, the pattern's skin at the sheath's point (fish
    // mm, the fin mesh's bind position), so the body's pattern runs on over the seam; hero and lod1 alike: the tech
    // finding's P3, lod1's sheath 25.9 % of its texels under A 0.9 in T2)
    // With `uv0` (the UVs the sheath had before the move) the island takes the atlas's own colour at those UVs instead:
    // the hero's sheath looks as it did (its FinOpaque read those texels' RGB) and meets the membrane without a seam —
    // the pattern's skin there met the membrane's root along the triangles' zigzag edge as a pale cuff with a sawtooth
    // border (the island's first build). Only A changes: 1, at hero and lod1 alike.
    const isl = m.sheathIsland && (m.uv0 || (m.position && skin));
    const src = m.uv0 ? Uint8Array.from(data) : null;
    const bil = (u, v, i) => {
      const fx = Math.min(size - 1, Math.max(0, u * size - 0.5)), fy = Math.min(size - 1, Math.max(0, v * size - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
      const at = (x, y) => src[(y * size + x) * 4 + i];
      return (at(x0, y0) * (1 - ax) + at(x1, y0) * ax) * (1 - ay) + (at(x0, y1) * (1 - ax) + at(x1, y1) * ax) * ay;
    };
    for (let p = 0; p < size * size; p++) {
      if (rs.tri[p] < 0) continue;
      if (rm.tri[p] >= 0) { shared++; continue; }
      if (data[p * 4 + 3] < 255) { data[p * 4 + 3] = 255; sheath++; }
      if (!isl) continue;
      const t = rs.tri[p], x = p % size, y = (p / size) | 0, I = m.indices;
      baryPx(m.uv, I, t, x + 0.5, y + 0.5, size, size, w3);
      if (m.uv0) {
        const u0 = m.uv0[I[t * 3] * 2] * w3[0] + m.uv0[I[t * 3 + 1] * 2] * w3[1] + m.uv0[I[t * 3 + 2] * 2] * w3[2];
        const v0 = m.uv0[I[t * 3] * 2 + 1] * w3[0] + m.uv0[I[t * 3 + 1] * 2 + 1] * w3[1] + m.uv0[I[t * 3 + 2] * 2 + 1] * w3[2];
        for (let i = 0; i < 3; i++) data[p * 4 + i] = Math.round(bil(u0, v0, i));
        island++;
        continue;
      }
      const P3 = [0, 1, 2].map((c) => m.position[I[t * 3] * 3 + c] * w3[0] + m.position[I[t * 3 + 1] * 3 + c] * w3[1] + m.position[I[t * 3 + 2] * 3 + c] * w3[2]);
      const N3 = m.normal ? [0, 1, 2].map((c) => m.normal[I[t * 3] * 3 + c] * w3[0] + m.normal[I[t * 3 + 1] * 3 + c] * w3[1] + m.normal[I[t * 3 + 2] * 3 + c] * w3[2]) : [0, 0, 1];
      const c = skin(P3, N3);
      for (let i = 0; i < 3; i++) data[p * 4 + i] = toSRGB8(c[i]);
      island++;
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
    for (const m of [...o.meshes, ...copies]) { const r = texelTriangles(m, size, size, { reach: 2.5 }); for (let p = 0; p < size * size; p++) if (r.tri[p] >= 0) near[p] = 1; }
    for (let p = 0; p < size * size; p++) if (!near[p] && data[p * 4 + 3]) { data[p * 4 + 3] = 0; cleared++; }
  }
  return { image: { W: size, H: size, ch: 4, data }, material: M.fin.FIN_MATERIAL ?? STUBS.fin.FIN_MATERIAL, fin: M.fin, stats: { sheathTexels: sheath, sheathShared: shared, sheathIsland: island, cleared, module: M.fin.stub ? 'stub' : 'finatlas.mjs' } };
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
