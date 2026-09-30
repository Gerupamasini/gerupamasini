# シロチドリ (Kentish Plover, *Charadrius alexandrinus*) — Three.js

Research-driven real-time model, rig, procedural animation and behaviour AI of the Kentish Plover for a
tidal-flat game. Everything is built from documented evidence:
**Evidence (`docs/research.md`) → Specification (`docs/morphology.md`, `docs/behavior.md`, `docs/animation_reference.md`) → Implementation (`src/`) → Validation (`docs/validation.md`)**.

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5173  (demo)   /validation.html (shape & pose sheets)
npm run build
npm run validate -- sheet_stand=pose=stand          # headless screenshots → docs/validation/
npm run export-glb   # → assets/models/kentish_plover.glb (LOD0 + skeleton + all baked clips)
node tools/dev/simulate.mjs 480 10 1                 # headless behaviour statistics
```

Demo controls: **click** a bird to select · **WASD/arrows** walk, **Shift** run (the birds react to you) ·
**H** debug HUD · panel: camera mode, time scale, tide, number of birds, **Animation viewer** (plays each of
the 12 required motions on the selected bird). URL options: `?birds=20&tide=-0.5&context=nesting&cam=free`.

## Structure

```
src/
  birds/kentishPlover/
    KentishPloverConfig.js     all numbers (morphology, plumage, gait, FID thresholds, LOD) with evidence tags
    KentishPlover.js           entity: individual variation, ground locomotion, flight controller
    KentishPloverAI.js         drives + perception + utility selection + FSM (run–stop–peck, alarm, roost…)
    KentishPloverAnimator.js   layered procedural animation, IK, gaze, 12+ actions, GLB-bakeable
    KentishPloverMaterials.js  procedural plumage / feather / keratin / eye shaders
    KentishPloverModel.js      assembles per-LOD skinned meshes (shared geometry, per-bird skeleton)
    KentishPloverLOD.js        flock manager: LOD, update scheduling, spatial hash, far instanced impostors
    anatomy/                   SDF body sculpt + Surface Nets, skeleton, feather layout, wing fold, bill/legs/eyes
  world/                       Tide (M2), Terrain (substrate, wetness), SurfaceTypes, PreyField, Environment
  demo/                        demo scene, player, HUD
  validation/                  validation sheets and GLB exporter
docs/                          research, specifications, optimisation, validation (+ images)
tools/                         headless capture, GLB export, dev measurement/simulation scripts
```

## Key design decisions

- **Model**: body outline sculpted as a signed-distance field (smooth-union ellipsoids/capsules) and meshed with
  Surface Nets at three resolutions; flight feathers, coverts, scapulars, tail coverts and rectrices are real
  opaque feather geometry (no alpha overdraw); plumage is evaluated procedurally in the bird's rest space so
  markings stay sharp at any distance.
- **Rig**: avian skeleton (pelvis–thorax–3 cervical–head–jaw; femur–tibiotarsus–tarsometatarsus–3 toes;
  humerus–ulna–carpometacarpus with a bone per remex/lesser covert; pygostyle with 12 rectrices), 171 bones.
  Folded wing solved per feather so the stack wraps the flank.
- **Animation**: procedural and layered so feet are planted on uneven ground, the head is space-stabilised,
  and every individual moves slightly differently; clips can be baked to glTF.
- **AI**: utility-based activity choice + FSM; all stochastic events are hazard rates (frame-rate independent).
  Graded disturbance response (alert → walk away → run → fly) configured in `KentishPloverConfig.disturbance`.

Known limitations are listed honestly in `docs/validation.md §5` (notably: no photo/video comparison was possible
in the build environment, wingspan −10 % vs field-guide values).
