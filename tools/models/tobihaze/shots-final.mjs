// The owner's final comparison set (render.mjs --shots shots-final.mjs), on the tier GLBs of build.mjs (skinned, with
// their blend shapes; posed by the viewer from each shot's `pose`, nothing baked):
//   views   the hero in its bind pose from the reference photos' cameras: front (B002), side (A030; u1, the right side
//           low and close), top (A036), 3/4 (A005; B010)
//   macro   the face close up from u1's and B010's cameras
//   poses   Land: propped on the pectorals, the front raised 15°, the soles planted flat, the eyes up (A070, A005; u1,
//           B010); Rest: prone, the arms laid back flush on the flank, every fin folded (A030); Water: swimming, the
//           pectorals forward as paddles and spread, the caudal spread, the dorsal fins folded (A061)
//   tiers   hero, lod1 and lod2 from the side, above, the front, 3/4 and below (orthographic but the 3/4)
//   b1      round B1's tier GLBs (FINAL_B1, default tools/models/tobihaze/out/b1ref) in the side, front, top, land and
//           water views, for the B1 → B2 sheet (B1's own poses: its shots-final's LAND and WATER)
// FINAL_SET=views|macro|poses|tiers|b1|all (default all but b1) picks a batch (keep a batch near ten shots: SwiftShader is
// slow); FINAL_DIR (repo-relative, default tools/models/tobihaze/out/tiers) is where the tobihaze.<tier>.glb files are.
//
// The poses are the rig's reference states as build.mjs wrote them (FINAL_DIR/states.json, the GLBs' extras
// tobihaze.states, per tier): rig.mjs statePose solved once on the hero and carried to every tier —
//   land   solveArmPlant: the front raised by J_root pitch −15° with J_sp1 … J_sp3 bent back +15° (shares 0.2 / 0.3 / 0.5),
//          each arm's IK (AXES ranges and coupled limits) planting the sole (fins.mjs plant 1) flat on the ground under
//          the rear body, the pelvic cup pressed onto the same ground (J_pelvic pitch), the caudal and anal folded, D2
//          lowered, the eyes lifted to the alert 0.06 HL with their eyesUp correctives (0.75)
//   rest   fins.mjs's rest pose of the arms (the shoulder as channels, the elbow as its quaternion) + 4° abduction, every
//          fin folded (the pectoral fold is authored in that pose: the blade furled flat on the flank)
//   water  half the rig's swim wave over the rear two thirds, the paddles forward and out (swing 51.5°, abduction 43.5°:
//          inside the shoulder's coupled limits), the elbow −20°, the pectorals and the caudal spread, D1 folded
// The cameras are the trunk round's photo matches (shots-body.mjs m_*: A030 / A002 near-lateral telephoto, u1 a low
// close shot of the right side, A005 / B010 above the left side, B002 from about 30° above the snout, A036 from above).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HL, toObject } from './anatomy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const dir = process.env.FINAL_DIR ?? 'tools/models/tobihaze/out/tiers';
const b1dir = process.env.FINAL_B1 ?? 'tools/models/tobihaze/out/b1ref';
const glb = (t, d = dir) => `${d}/tobihaze.${t}.glb`;
const box = (s0, s1, y0, y1, z0, z1) => {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
const chest = box(0.70, 1.80, -0.40, 0.75, -0.62, 0.62);
const face = box(-0.04, 0.56, -0.04, 0.80, -0.38, 0.38);

/** The reference states' poses per tier (build.mjs: FINAL_DIR/states.json). */
const statesFile = path.join(root, dir, 'states.json');
const STATES = fs.existsSync(statesFile) ? JSON.parse(fs.readFileSync(statesFile, 'utf8')) : {};
const statePose = (state, tier = 'hero') => {
  const s = STATES[tier]?.[state];
  if (!s) throw new Error(`shots-final: no ${state} state for ${tier} in ${statesFile} (run build.mjs first)`);
  // (a ground plane under the fish on land and at rest; none in the water)
  return { ...structuredClone(s.pose), ...(state === 'water' ? {} : { ground: true }) };
};
export const LAND = STATES.hero ? statePose('land') : null;
export const REST = STATES.hero ? statePose('rest') : null;
export const WATER = STATES.hero ? statePose('water') : null;

/** Round B1's own Land and Water poses (its shots-final), for its GLBs in the B1 → B2 sheet. */
const B1_LAND = {
  J_root: { pitch: -10 }, J_sp1: { pitch: 2 }, J_sp2: { pitch: 2 }, J_sp3: { pitch: 2 }, J_sp4: { pitch: 1 }, J_pelvic: { pitch: -10 },
  J_eyeL: { t: [0, 0.03, 0] }, J_eyeR: { t: [0, 0.03, 0] },
  J_pecL: { swing: 5, abduction: -25 }, J_pecR: { swing: 5, abduction: -25 },
  J_pecElbowL: { flexion: -28 }, J_pecElbowR: { flexion: -28 },
  morph: { Fin_Pectoral_L: { plant: 1, plantMid: 0 }, Fin_Pectoral_R: { plant: 1, plantMid: 0 }, Fin_Caudal: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Dorsal2: { fold: 0.3 } },
  ground: true,
};
const b1wave = (amp, phase, k) => Object.fromEntries(['J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'].map((j, i) => [j, { yaw: +(amp[i] * Math.sin(phase + k * i)).toFixed(2) }]));
const B1_WATER = {
  ...b1wave([1, 2, 3.5, 5, 6.5, 7.5, 8, 9], 0.3, 1.0),
  J_pecL: { swing: 51.5, abduction: 43.5 }, J_pecR: { swing: 51.5, abduction: 43.5 },
  J_pecElbowL: { flexion: -20 }, J_pecElbowR: { flexion: -20 },
  morph: { Fin_Pectoral_L: { spread: 1 }, Fin_Pectoral_R: { spread: 1 }, Fin_Caudal: { spread: 1 }, Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 0.8 }, Fin_Anal: { fold: 0.8 } },
};

const shot = (name, model, view, pose) => ({ name, mode: 'clay', model, view: { margin: 0.06, ...view, ...(pose ? { pose } : {}) } });
const CAM = {
  front_B002: { azim: 0, elev: 28, fov: 30, fit: chest, margin: 0.05 },
  side_A030: { azim: -90, elev: 4, fov: 8, fit: 'all' },
  side_u1: { azim: -104, elev: 3, fov: 36, fit: chest, margin: 0.25 },
  top_A036: { azim: 0, elev: 90, topUp: -1, fov: 8, fit: 'all' },
  q34_A005: { azim: 70, elev: 24, fov: 22, fit: 'all' },
  q34_B010: { azim: 72, elev: 30, fov: 24, fit: chest, margin: 0.1 },
  land_A070: { azim: 92, elev: 5, fov: 10, fit: 'all' },
  water_A061: { azim: 92, elev: 55, fov: 14, fit: 'all' },
};
const VIEWS = ['front_B002', 'side_A030', 'side_u1', 'top_A036', 'q34_A005', 'q34_B010'].map((k) => shot(`v_${k}`, glb('hero'), CAM[k]));
const MACRO = [
  shot('m_face_u1', glb('hero'), { azim: -100, elev: 3, fov: 30, fit: face, margin: 0.14 }),
  shot('m_face_B010', glb('hero'), { azim: 66, elev: 34, fov: 30, fit: face, margin: 0.14 }),
  shot('m_face_front', glb('hero'), { azim: 0, elev: 12, fov: 24, fit: face, margin: 0.1 }),
];
const POSES = LAND ? [
  shot('p_land_A070', glb('hero'), CAM.land_A070, LAND),
  shot('p_land_A005', glb('hero'), CAM.q34_A005, LAND),
  shot('p_land_u1', glb('hero'), CAM.side_u1, LAND),
  shot('p_land_B010', glb('hero'), CAM.q34_B010, LAND),
  shot('p_rest_A030', glb('hero'), CAM.side_A030, REST),
  shot('p_water_A061', glb('hero'), CAM.water_A061, WATER),
  shot('p_water_side', glb('hero'), { azim: 90, elev: 8, fov: 14, fit: 'all' }, WATER),
] : [];
const TIER_VIEWS = {
  side: { azim: 90, elev: 0, ortho: true, fit: 'all' },
  top: { azim: 0, elev: 90, ortho: true, topUp: 1, fit: 'all' },
  front: { azim: 0, elev: 0, ortho: true, fit: 'all' },
  q34: { azim: 40, elev: 20, fov: 25, fit: 'all' },
  under: { azim: 0, elev: -90, ortho: true, topUp: 1, fit: 'all' },
};
const TIERS = ['hero', 'lod1', 'lod2'].flatMap((t) => Object.entries(TIER_VIEWS).map(([k, v]) => shot(`t_${t}_${k}`, glb(t), v)));
// the tiers in the land state too (the far tier's cards planted and folded as the near tiers' fins)
const TIER_LAND = STATES.lod2 ? ['hero', 'lod1', 'lod2'].map((t) => shot(`tl_${t}_side`, glb(t), { azim: 90, elev: 3, ortho: true, fit: 'all' }, statePose('land', t))) : [];
// round B1 → B2: the same cameras on both rounds' hero GLBs (B1 in its own Land and Water poses)
const CMP = [['side', CAM.side_A030], ['front', CAM.front_B002], ['top', CAM.top_A036]];
const B1 = [
  ...CMP.map(([k, v]) => shot(`c_b1_${k}`, glb('hero', b1dir), v)),
  shot('c_b1_land', glb('hero', b1dir), CAM.land_A070, B1_LAND),
  shot('c_b1_water', glb('hero', b1dir), CAM.water_A061, B1_WATER),
  ...CMP.map(([k, v]) => shot(`c_b2_${k}`, glb('hero'), v)),
  ...(LAND ? [shot('c_b2_land', glb('hero'), CAM.land_A070, LAND), shot('c_b2_water', glb('hero'), CAM.water_A061, WATER)] : []),
];

const set = process.env.FINAL_SET ?? 'all';
const SETS = { views: VIEWS, macro: MACRO, poses: POSES, tiers: [...TIERS, ...TIER_LAND], b1: B1 };
const ALL = [...VIEWS, ...MACRO, ...POSES, ...TIERS, ...TIER_LAND];
export const SHOTS = set === 'all' ? ALL : set.split(',').flatMap((k) => SETS[k] ?? [...ALL, ...B1].filter((s) => s.name === k));
