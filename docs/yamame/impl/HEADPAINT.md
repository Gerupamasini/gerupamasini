# Head texture painter (`tools/build-assets/headpaint.mjs`)

Procedural albedo / normal / ORM atlas for the `M_Head` primitive plus the mouth lining.  Node only, deterministic per seed, no new dependencies.
Everything is derived from `surface`, `head` and `spec` (`assets/src/head_adult.json`); no landmark is hard-coded, so it follows the head spec as it evolves.

## Contract

* `generateHeadTextures({ surface, params, head, spec, seed, bodyTex, sEnd })` -> `{ albedo, normal, orm, mouth, render, report }`
  (`{width, height, data: Uint8Array RGBA8}`, default 1536 x 2048).  Atlas: `u = (s + cap) / (sEnd + cap)`, `v = alpha / 2PI`, texel `(x, y) -> (x/(W-1), y/(H-1))`.
  Last row == first row (dorsal midline wraps exactly); left and right flank use independent noise (3-D lattice on the physical surface point), spots and pores are placed per side.
* `bakeHeadIntoBody({ surface, bodyTex, headTex, sEnd })` overwrites the head part of the body atlas (s < sEnd - 0.008, feathered over 0.004) with a down-sampled copy
  (linear-light albedo, vector-averaged normals) so LOD1+ match the hero head.
* `generateMouthTexture({ seed, size })` (also returned as `.mouth` = `{ albedo, orientation: 'along-u', roughness }`): x = lips -> throat, y = roof .. left cheek .. floor .. right cheek.  Not wired by the painter.
* `render` = `{ clearcoat, clearcoat_roughness, iridescence }` the maps were calibrated with.  If `params.render.head` is unset the painter writes it there (write-glb already reads `params.render.head`).
* `sampleAtlas(img, u, v)` bilinear RGBA8 sampler (v wraps).

## Pipeline

1. **Coarse grid** (every 2nd texel): surface point / FD normal, chord coordinates (u, v), height fraction `t` (0 dorsal outline .. 1 throat), signed distances to the spec features
   (maxilla / dentary polygons, gape line, preopercle line, opercle margin, nostrils, eye), eye distance in eye radii, relief from `head.displacement` with `fine = true` and `fine = false`
   (the geometry one on every 3rd node).  Residual `fine - geometry` is what the loft mesh cannot carry -> normal map (x `reliefGain` 0.5, poles faded).  Old head.mjs without `fine`: high-pass instead.
   Cavity AO = two-scale (0.2 mm / 0.9 mm) curvature of the fine relief.  Low-frequency design noise (blotches, hue fields, cap-border wobble) is sampled here too.
2. **Discrete features**: 5-20 head spots (area-uniform on the cap, bigger/denser towards the nape, 0.07-0.4 eye diameters, irregular outlines), ~40 sensory pores
   (mandibular row, preopercle row, snout row, infraorbital arc; tiny dark dots with a faint pale rim and a dimple in the relief).
3. **Per texel** (full resolution): dark ragged cap (olive-brown mottling, nape scale lattice, copper flecks, dorsal ridge darker) -> bronze/gold band -> pearly cheek/opercle
   (gold, lilac, olive, blue-silver, pink hue patches; iridophore glitter) -> white throat; snout side; maxilla strap with dark upper groove; dentary + suture + chin speckle; lilac lips and near-black
   gape line; opercle plate (rays + growth lines, melanophore smudges, gold free-edge band, copper flush, shadow gap) and pale preopercle edge; nostril pits with rim; dark orbit ring + optional
   post-orbital smear; branchiostegal ribs; spots, pores, melanophore speckle and flecks; skin grain.  The same pass writes roughness (wet lips/jaw/opercle, dull cap, water-film streaks),
   metalness (pearly on opercle/rim/jaw, ~0 on cap and mouth), painted AO (pigment depth also cuts the env-reflection veil on black pigment).
4. **Normal map** from relief residual + micro relief (grain, pores, cheek scale rims, opercle rays) with the real mm-per-texel of the grid (soft tilt limit 42 deg; micro-only tilt < 15 deg).
5. **Seam**: every map cross-fades into `bodyTex` between s = sEnd - 0.024 and sEnd - 0.008 (colour, normal, ORM, cavity AO), so the head atlas equals the body atlas at s = sEnd.

## Look knobs (`look` argument, or `HEADPAINT_LOOK='{"silver":1}'` for dev)

Per-seed random: `capFrac` (0.2-0.34 of head height at the cheek column), `nSpots` (9-17), `smear` (post-orbital smudge, ~50 % of seeds), `warm` (copper flush), `hueBias`, `silver`
(0 = bronze-olive adult, 1 = silvery lilac-white).  Fixed: `LOOK.palette` (photo-like sRGB per region), `LOOK.gain` 0.42 (photo appearance -> linear albedo), `metalScale`, `chroma`, `reliefGain`.
Dev switches: `HEADPAINT_SCALE=0.5` renders the atlas at half size (fast look-dev builds), `debug: true` returns the coarse fields.

## Calibration

Renders of `viewer/dev/still.html` (RoomEnvironment + sun + ACES) show a large neutral specular veil: `rendered ~ 1.8 * albedo + ~0.09` (linear).  The dark cap therefore bottoms out at about
sRGB (90, 78, 62) whatever the albedo; the palette is set so that the *rendered* regions match the photo medians (cap ~ 93,79,65; snout 85,78,63; cheek ~ 165,150,135; opercle ~ 175,160,140;
strap ~ 136,116,94), see `report.regions` (photo-equivalent medians as painted) and `report.json_targets`.

## Known limits / things to know

* The atlas parametrisation (s, alpha) is very anisotropic around the widest line of the section (superellipse exponent > 2): just above it one texel row can span up to ~0.4 mm vs 0.034 mm along s,
  so features there (eye, upper cheek) are stretched; this cannot be fixed from the texture side.
* The polylines of the spec (preopercle, opercle margin, maxilla/dentary) have corners; the painter follows them exactly so paint and relief agree, which shows the corners.
* Time at 1536 x 2048: ~20 s on one core (+ 0.4 s bake); textures add ~3 MB to the GLB (albedo/ORM JPEG ~0.5 MB each, normal PNG ~2 MB).
