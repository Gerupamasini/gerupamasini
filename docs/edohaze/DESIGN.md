# Edohaze — technical design & integration

> This document covers the lightweight real-time creature used by the mudflat game (`game.html`,
> `src/creatures/edohaze/`). The photoreal adult model built with the same procedural pipeline as the
> マハゼ (`models/edohaze.glb`, `tools/edohaze/`, viewer `index.html?species=edohaze`), fitted to the
> 70-photo measurements, is documented in [HQ_MODEL.md](HQ_MODEL.md).

`src/creatures/edohaze/` contains a self-contained real-time creature for Three.js (r186).
The species research that every number traces back to is in [RESEARCH.md](RESEARCH.md);
the scientific self-review and known uncertainties are in [VALIDATION.md](VALIDATION.md).

## Host project

The repository was empty at the start (only `.gitignore`), so there was no existing renderer,
loop, or terrain to integrate with. A minimal host was added and the creature was written
against a small **world adapter interface**, so it can be dropped into a different game later
without changes.

| Concern | Host implementation | Where |
|---|---|---|
| Renderer | `WebGLRenderer`, sRGB output, ACES Filmic, PCF shadows | `src/main.js` |
| Scene / camera | Perspective 40°, near 2 mm, far 30 m; OrbitControls | `src/main.js` |
| Loop / deltaTime | `THREE.Timer`, dt clamped to 1/20 s, `timeScale` multiplier | `src/main.js` |
| Coordinates / scale | **1 unit = 1 m**, +Y up; fish local +Z = snout, +Y = dorsal, +X = left | everywhere |
| Terrain | Analytic height function (exact for fish queries), ripples, burrow mounds, burrow holes in shader | `src/world/MudflatWorld.js` |
| Water | Tide (compressed semidiurnal), spectral Beer–Lambert sun attenuation, FogExp2, PMREM underwater environment, surface from below | `src/world/Water.js` |
| Caustics | Procedural GLSL, shared by terrain and fish (`EdohazeShaders.js`) | |
| Suspended sediment | GPU points drifting in the current | `src/world/Sediment.js` |
| Habitat objects | `CrustaceanBurrow` (ニホンスナモグリ / アナジャコ types) | `src/habitat/CrustaceanBurrow.js` |
| Threats / prey | Hand net (click to sweep), predator proxy, camera-as-diver, epibenthic prey | `src/world/Actors.js` |
| Assets | None to load: all geometry and textures are procedural | |

Run it with `npm install && npm run dev`. Controls: click the substrate to sweep the net, drag to orbit, press `F` to cycle the followed fish. The lil-gui panel has tide, month, daylight, visibility, forced LOD, and the debug overlay.

## Module map

| File | Responsibility |
|---|---|
| `Edohaze.js` | Facade: builds rig, LODs, and materials; owns animator, locomotion, and behaviour; documents the world-adapter contract |
| `EdohazeParams.js` | Morphometrics (%SL), fin-ray counts, profile curves, locomotor constants. Each value is tagged confirmed / inferred / game |
| `EdohazeModel.js` | Lofted body with lip-split topology, feature displacement fields, lip roll and buccal lining, fin-ray fin grids, eye assembly |
| `EdohazeRig.js` | Bones and skin weights (cosine-blended axial hats, mandible, opercula) |
| `EdohazeMaterial.js` | Body PBR plus translucency, caustics, and chromatophore state; fin-ray vertex posing and fragment ray pattern; eye materials |
| `EdohazeTextures.js` / `EdohazeTextureWorker.js` | Procedural skin maps at physical scale; low-res set synchronously, hi-res set from a Web Worker |
| `EdohazeShaders.js` | Shared uniforms (`EdohazeShared`), caustics and translucency GLSL |
| `EdohazeAnimator.js` | Traveling-wave body, C-start, pectoral controller, median fins, ventilation / jaw / cough / strike, eye saccades |
| `EdohazeLocomotion.js` | Rigid-body kinematics and gaits: perch, hop, swim, hover, escape, burrow |
| `EdohazeBehavior.js` | Internal state, perception, threat model, utility and softmax state selection, per-state logic, intents |
| `EdohazeLOD.js` | Projected-size LOD with hysteresis; half-rate animation at LOD2 |
| `EdohazeDebug.js` | Skeleton, bone axes, velocity, target / threat / burrow lines, state and internal-variable labels |

## Geometry (Phase 6)

* **Body:** each ring is a superellipse cross-section with separate dorsal and ventral radii and exponents (round head, "cylindrical" trunk, flatter benthic belly). Feature fields are added on top: mouth cleft, upper-lip / maxilla ridge (ending below the rear of the eye), cheek (adductor) bulge, interorbital groove, preopercular groove, opercular margin crease and flap, pectoral-base lobe, urogenital papilla, and the orbit socket plus rim. There are **no barbels anywhere** (the Chikuzen-haze check).
* **Lip-split topology:** every ring duplicates vertices on the lip line. Ahead of the rictus the lower segment is weighted to `Jaw`; behind it the duplicates share weights and get welded normals. This makes the gape open for real. A lip-roll ring and a dark **buccal lining** (an inset skinned loft with the same split) mean an open mouth shows tissue, not an empty shell.
* **Fins:** ray-aligned grids with attributes (base point, ray angle, ray length, u, v). The vertex shader rebuilds every vertex from `uErect`, `uSpread`, `uBend`, `uWaveAmp/Phase/K`, `uCup`, and `uTwist`, and normals are analytic. So each fin folds, spreads, cups, and undulates on its own. Fin-ray counts come from the confirmed fin formula: D1 VII, D2 I+12, A I+10.
* **Eyes:** sclera ball, iris spherical-cap annulus (procedural texture), pupil cavity, protruding spherical lens (a teleost trait), and a cornea shell for the corneal highlight. Each eye sits on its own bone.

## Rig (Phase 8)

`Root → Spine01 → Spine02 → Spine03 → Spine04 → CaudalPeduncle → Tail`. `Head`, `PectoralFin_L/R`, and `PelvicFin` are children of `Spine01`. `Jaw`, `Operc_L/R`, and `Eye_L/R` are children of `Head`. `DorsalFin1` sits under `Spine02`; `DorsalFin2` and `AnalFin` sit under `Spine03`. Axial weights use cosine hats between node centres, which gives C¹-continuous weights and no visible kinks at bone boundaries.

## Swimming biomechanics (Phase 9)

* Lateral wave `h(x,t) = A·env(x)·sin(kx − φ)` with `φ̇ = 2πf`. Integrating the phase means frequency changes never pop. The envelope is `0.1 + 0.9·((s−0.15)/0.85)^1.8`, and λ = 0.95 BL. Segment yaw is `atan(∂h/∂x)`, and each bone's local yaw is that minus its parent's yaw.
* f and A are spring-driven from speed **and** thrust demand (acceleration). They spin up quickly and wind down slowly, so a hop shows high-frequency beats and then a straight glide.
* Turning adds arc curvature proportional to yaw rate. The C-start uses an underdamped curvature spring: C-bend in about 40 ms, then counter-stroke, then burst.
* Pectoral modes are perch, hover sculling, slow rowing, swim (adducted), burst (clamped), brake (flared), and burrow. Yaw correction uses asymmetric abduction and pitch correction uses symmetric depression. Rest flicks happen at random intervals, independently per side.
* Micro-animation: ventilation at 1.4–3.2 Hz (scaled by stress and noise), buccal-then-opercular phase lag, occasional "cough", suction strike (gape in about 25 ms with late opercular abduction), eye saccade/fixation per eye, and non-periodic body sway.

## Behaviour (Phase 10)

Internal variables per fish are `hunger`, `fear`, `curiosity`, `energy`, `shelterNeed`, and `activity`. Personality is derived from `personalitySeed`: boldness, exploration, activity, hover tendency, reactivity, home fidelity, decision temperature, and mean rest duration.

**Threat risk** combines the following, and fear is a leaky integrator of risk:

* **looming rate** (size × closing speed / d²)
* size-scaled proximity
* heading toward the fish
* visibility: turbidity, daylight, caudal blind zone, inside a burrow or peeking
* current activity

The fast-start fires on a looming threshold or on high risk, with a 12–62 ms latency and a 2 s refractory period.

**Escape sequence:** C-start toward the best burrow that is not in the threat's direction (or away, with a random protean component), then burst, then urgent approach, then head-first entry, then hide. With no refuge available: burst, then **FREEZE**.

**Burrow cycle:** approach, then head-first entry (position blended to avoid pops), then hide. After that the fish turns around unseen and **peeks** with its head out and eyes above the rim, withdrawing tail-first if alarmed. Exit is head-first, followed by settling 1–2 BL away. Burrows that are drained at low tide are not used for peeking; exposure raises `shelterNeed`.

**Breeding season (March–May):** males own a burrow (`GUARD`) and chase intruding males.

## LOD (Phase 12)

| | LOD0 close-up | LOD1 normal | LOD2 far |
|---|---|---|---|
| Triangles (per fish) | ~42 k | ~8 k | ~1 k |
| Draw calls | 21 | 19 | 7 |
| Body rings × ring verts | 170 × 67 | 70 × 33 | 24 × 13 |
| Fins | all 7, 4 grid columns per ray | all, 2 per ray | caudal, D2, pectorals |
| Eyes | full assembly (40 seg) | full (16 seg) | single sphere |
| Material | normal, clearcoat, iridescence | normal, clearcoat | albedo + ORM only |
| Animation | full rate | full rate | half rate, no eyes |

Selection uses projected length in pixels (above 110 px → LOD0, 34–110 px → LOD1), with 15% hysteresis.

Skin maps are shared per pigment variant (4 variants). Per-fish individuality comes from uniforms (`uTint`, `uDarken`, `uPale`) and procedural asymmetry.

**Possible next steps:** instancing LOD2 (a shared skeleton texture) for hundreds of fish, and merging the eye parts into one draw call.

## Validation tooling

* `tools/shot.mjs "<query>" out.png`: headless render using SwiftShader. Query options: `shot=profile|top|front34|rear34|belly|head|wide`, `pause`, `pose`, `neutral` (white light, no water tint, for judging albedo), `nogui`, `t` (warm-up seconds), `fish`, `seed`.
* `tools/filmstrip.mjs out.png escape|hop N stepMs`: frame sequence from above.
* `tools/simtest.mjs seconds`: behaviour statistics: state occupancy, transitions, escapes, burrow entries, NaN checks, and ground penetration.
