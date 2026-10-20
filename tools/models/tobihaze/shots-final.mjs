// The owner's final comparison set for round B1 (render.mjs --shots shots-final.mjs), on the tier GLBs of build.mjs
// (skinned, with their blend shapes; posed by the viewer from each shot's `pose`, nothing baked):
//   views   the hero in its bind pose from the reference photos' cameras: front (B002), side (A030; u1, the right side
//           low and close), top (A036), 3/4 (A005; B010)
//   macro   the face close up from u1's and B010's cameras
//   poses   Land: propped on the pectorals, the front raised, the blades planted, the eyes up (A070, A005; u1, B010);
//           Rest: prone, the arms folded back, every fin folded (A030);
//           Water: swimming, the pectorals out as paddles and spread, the caudal spread, the dorsal fins folded (A061)
//   tiers   hero, lod1 and lod2 from the side, above, the front, 3/4 and below (orthographic but the 3/4)
// FINAL_SET=views|macro|poses|tiers|all (default all) picks a batch (keep a batch near ten shots: SwiftShader is slow);
// FINAL_DIR (repo-relative, default tools/models/tobihaze/out/tiers) is where the tobihaze.<tier>.glb files are.
// The cameras are the trunk round's photo matches (shots-body.mjs m_*; elevation and turn estimated from each photo:
// A030 / A002 near-lateral telephoto, u1 a low close shot of the right side, A005 / B010 above the left side, B002
// from about 30° above the snout, A036 from straight above), the poses the rig round's (scratchpad b1_rig poses.mjs:
// landProp's arm angles solved within AXES' ranges, swim's travelling wave), by the rig's channel names (the viewer
// reads their axes from the GLB's root extras).
import { HL, toObject } from './anatomy.mjs';

const dir = process.env.FINAL_DIR ?? 'tools/models/tobihaze/out/tiers';
const glb = (t) => `${dir}/tobihaze.${t}.glb`;
const box = (s0, s1, y0, y1, z0, z1) => {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
const chest = box(0.70, 1.80, -0.40, 0.75, -0.62, 0.62);
const face = box(-0.04, 0.56, -0.04, 0.80, -0.38, 0.38);

/** Propped on the pectorals (A070, A005, B010): the body block pitched nose-up 10° about the root and the trunk bent back
 * down behind it (2° at each of the first three spine joints, 1° at the fourth) so the belly rests behind the arms (the
 * head is not pitched further on its vertebra: the girdle rides it, and 5° more lifted the blades 0.3 mm off); the
 * forearms standing as legs (shoulder swing 5°, abduction −25°, the elbow straight at −28°: AXES' limits), the blades
 * planted flat (fins.mjs plant; its corrective 4w(1−w) = 0 at w 1), the pelvic cup pressed down (−10°), the anal fin and
 * the caudal folded, D2 lowered, the eyes raised (+0.03 HL). Solved on the hero (scratch land_solve.mjs) so the belly,
 * the pelvic cup and the blades share the ground: the blades 0.67 mm above it, the pelvic 0.04, the tail 0.9, the chin
 * 6.2 mm up (the arm at full stretch is a little short to carry the chest off the ground as A070 does: the runtime's
 * prop is an IK task, rig round). */
export const LAND = {
  J_root: { pitch: -10 }, J_sp1: { pitch: 2 }, J_sp2: { pitch: 2 }, J_sp3: { pitch: 2 }, J_sp4: { pitch: 1 }, J_pelvic: { pitch: -10 },
  J_eyeL: { t: [0, 0.03, 0] }, J_eyeR: { t: [0, 0.03, 0] },
  J_pecL: { swing: 5, abduction: -25 }, J_pecR: { swing: 5, abduction: -25 },
  J_pecElbowL: { flexion: -28 }, J_pecElbowR: { flexion: -28 },
  morph: { Fin_Pectoral_L: { plant: 1, plantMid: 0 }, Fin_Pectoral_R: { plant: 1, plantMid: 0 }, Fin_Caudal: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Dorsal2: { fold: 0.3 } },
  ground: true,
};
/** Resting prone (A030): the arms folded back along the flank (the rig round's armFold: swing −40.75°, abduction −25°,
 * the elbow straight), every fin folded, the body straight on the ground. */
export const REST = {
  J_pecL: { swing: -40.75, abduction: -25 }, J_pecR: { swing: -40.75, abduction: -25 },
  J_pecElbowL: { flexion: -28 }, J_pecElbowR: { flexion: -28 },
  morph: { fold: 1 },
  ground: true,
};
/** Swimming (A061): a gentle carangiform wave over the rear two thirds (yaw by joint, half the rig round's swim), the
 * pectorals out and forward as paddles with their fans spread (swing 51.5°, abduction 43.5°, elbow −20°), the caudal
 * spread, the dorsal and anal fins folded as A061's are. */
const wave = (amp, phase, k) => Object.fromEntries(['J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'].map((j, i) => [j, { yaw: +(amp[i] * Math.sin(phase + k * i)).toFixed(2) }]));
export const WATER = {
  ...wave([1, 2, 3.5, 5, 6.5, 7.5, 8, 9], 0.3, 1.0),
  J_pecL: { swing: 51.5, abduction: 43.5 }, J_pecR: { swing: 51.5, abduction: 43.5 },
  J_pecElbowL: { flexion: -20 }, J_pecElbowR: { flexion: -20 },
  morph: {
    Fin_Pectoral_L: { spread: 1 }, Fin_Pectoral_R: { spread: 1 }, Fin_Caudal: { spread: 1 },
    Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 0.8 }, Fin_Anal: { fold: 0.8 },
  },
};

const shot = (name, model, view, pose) => ({ name, mode: 'clay', model, view: { margin: 0.06, ...view, ...(pose ? { pose } : {}) } });
const VIEWS = [
  shot('v_front_B002', glb('hero'), { azim: 0, elev: 28, fov: 30, fit: chest, margin: 0.05 }),
  shot('v_side_A030', glb('hero'), { azim: -90, elev: 4, fov: 8, fit: 'all' }),
  shot('v_side_u1', glb('hero'), { azim: -104, elev: 3, fov: 36, fit: chest, margin: 0.25 }),
  shot('v_top_A036', glb('hero'), { azim: 0, elev: 90, topUp: -1, fov: 8, fit: 'all' }),
  shot('v_q34_A005', glb('hero'), { azim: 70, elev: 24, fov: 22, fit: 'all' }),
  shot('v_q34_B010', glb('hero'), { azim: 72, elev: 30, fov: 24, fit: chest, margin: 0.1 }),
];
const MACRO = [
  shot('m_face_u1', glb('hero'), { azim: -100, elev: 3, fov: 30, fit: face, margin: 0.14 }),
  shot('m_face_B010', glb('hero'), { azim: 66, elev: 34, fov: 30, fit: face, margin: 0.14 }),
  shot('m_face_front', glb('hero'), { azim: 0, elev: 12, fov: 24, fit: face, margin: 0.1 }),
];
const POSES = [
  shot('p_land_A070', glb('hero'), { azim: 92, elev: 5, fov: 10, fit: 'all' }, LAND),
  shot('p_land_A005', glb('hero'), { azim: 70, elev: 24, fov: 22, fit: 'all' }, LAND),
  shot('p_land_u1', glb('hero'), { azim: -104, elev: 3, fov: 36, fit: chest, margin: 0.25 }, LAND),
  shot('p_land_B010', glb('hero'), { azim: 72, elev: 30, fov: 24, fit: chest, margin: 0.1 }, LAND),
  shot('p_rest_A030', glb('hero'), { azim: -90, elev: 4, fov: 8, fit: 'all' }, REST),
  shot('p_water_A061', glb('hero'), { azim: 92, elev: 55, fov: 14, fit: 'all' }, WATER),
  shot('p_water_side', glb('hero'), { azim: 90, elev: 8, fov: 14, fit: 'all' }, WATER),
];
const TIER_VIEWS = {
  side: { azim: 90, elev: 0, ortho: true, fit: 'all' },
  top: { azim: 0, elev: 90, ortho: true, topUp: 1, fit: 'all' },
  front: { azim: 0, elev: 0, ortho: true, fit: 'all' },
  q34: { azim: 40, elev: 20, fov: 25, fit: 'all' },
  under: { azim: 0, elev: -90, ortho: true, topUp: 1, fit: 'all' },
};
const TIERS = ['hero', 'lod1', 'lod2'].flatMap((t) => Object.entries(TIER_VIEWS).map(([k, v]) => shot(`t_${t}_${k}`, glb(t), v)));

const set = process.env.FINAL_SET ?? 'all';
const SETS = { views: VIEWS, macro: MACRO, poses: POSES, tiers: TIERS };
export const SHOTS = set === 'all' ? [...VIEWS, ...MACRO, ...POSES, ...TIERS] : set.split(',').flatMap((k) => SETS[k] ?? [...VIEWS, ...MACRO, ...POSES, ...TIERS].filter((s) => s.name === k));
