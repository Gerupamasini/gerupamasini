// The owner's final comparison set (render.mjs --shots shots-final.mjs), on the tier GLBs of build.mjs (skinned, with
// their blend shapes; posed by the viewer from each shot's `pose`, nothing baked). Round B3: every view in the natural
// pose its photo shows, not the bind (the technical half-raised pose):
//   views   front (B002: propped, from about 30° above the snout), side (A030: prone at rest; u1: propped, the right side
//           low and close), top (A036: prone at rest), 3/4 (A005, B010: propped on the planted pectorals)
//   macro   the face close up, propped with the eyes raised, from u1's and B010's cameras and from in front
//   poses   Land: propped (A070, A005, u1, B010); Reach: the arm forward (A023); Rest: prone (A030); Water: the paddles
//           spread beside the flank (A061, and from the side)
//   tiers   hero, lod1 and lod2 in the land state (side, 3/4, front: orthographic but the 3/4), at rest from above and in
//           the water from A061's camera
//   crawl   the crawl's cycle (round B4: rig.crawlCycle, written per tier by build.mjs into states.json `crawl`, 49 keys
//           over one cycle — the stance to `duty`, then the recovery): every 4th key of the hero from the side, the 3/4
//           and above through one fixed camera each (CRAWL_BOX / CRAWL_VIEWS, the sheet marks the bearing contacts), and
//           lod1's (every 8th) and lod2's (every 3rd of its 17) from the side
//   b2      round B2's tier GLBs (FINAL_B2, default tools/models/tobihaze/out/b2ref, with B2's own states.json) against
//           this round's with the same cameras and states: side (rest), front (land), top (rest), land, water, the
//           pectoral close up (land) and the caudal junction close up (rest)
//   b3      the same against round B3's (FINAL_B3, default tools/models/tobihaze/out/b3ref; round B4)
// FINAL_SET=views|macro|poses|tiers|crawl|b2|b3|all (default all but b2/b3; a list too) picks a batch (keep a batch near ten
// shots: SwiftShader is slow); FINAL_DIR (repo-relative, default tools/models/tobihaze/out/tiers) is where the
// tobihaze.<tier>.glb files and states.json are.
//
// The poses are the rig's reference states as build.mjs wrote them (FINAL_DIR/states.json, the GLBs' extras
// tobihaze.states, per tier): rig.mjs statePose solved once on the hero (round B3: the one source, no overrides) and
// carried to every tier (statePose(state, tier)) —
//   land   propped: the front raised 15° over J_sp1/J_sp2 (RIG.bend.prop), the rear and the folded caudal laid on the
//          ground (settleOnGround), each arm's IK (solveArmPlant 'prop': the lobe near-perpendicular, the junction bent,
//          the plant blend shape's sole flat on the ground beside and a little ahead of the shoulder), the pelvic cup
//          pressed by its 'press' shape with J_pelvic found by bisection, the eyes lifted to the alert 0.06 HL (the
//          eyesUp correctives driven by the joints)
//   reach  the arm reaching forward (A023, A070): the lobe forward and down, the planted blade's tip ahead of the shoulder
//   rest   prone: fins.mjs's rest pose of the lobes (the fold is authored in it) plus RIG.rest's offsets, every fin folded,
//          the whole underside laid on the ground (settleOnGround on J_root and the spine)
//   water  half the rig's swim wave over the rear two thirds, the paddles beside the flank (RIG.water), their fans and the
//          caudal spread, the dorsal and anal fins folded
// The cameras are the trunk round's photo matches (shots-body.mjs m_*: A030 / A002 near-lateral telephoto, u1 a low
// close shot of the right side, A005 / B010 above the left side, B002 from about 30° above the snout, A036 from above;
// A023 the pectoral round's).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HL, toObject } from './anatomy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const dir = process.env.FINAL_DIR ?? 'tools/models/tobihaze/out/tiers';
const b2dir = process.env.FINAL_B2 ?? 'tools/models/tobihaze/out/b2ref';
const b3dir = process.env.FINAL_B3 ?? 'tools/models/tobihaze/out/b3ref';
const glb = (t, d = dir) => `${d}/tobihaze.${t}.glb`;
const box = (s0, s1, y0, y1, z0, z1) => {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
const chest = box(0.70, 1.80, -0.40, 0.75, -0.62, 0.62);
const face = box(-0.04, 0.56, -0.04, 0.80, -0.38, 0.38);
const armL = box(0.85, 1.95, -0.60, 0.60, 0.05, 1.0);
const tail = box(3.60, 4.98, -0.20, 0.75, -0.30, 0.30);
const front = box(0.0, 2.2, -0.45, 0.85, -0.95, 0.95);

/** The reference states' poses per tier (build.mjs: <dir>/states.json). */
const readStates = (d) => { const f = path.join(root, d, 'states.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; };
const STATES = readStates(dir), STATES_B2 = readStates(b2dir), STATES_B3 = readStates(b3dir);
const stateOf = (S, state, tier = 'hero') => {
  const s = S[tier]?.[state];
  if (!s) return null;
  // (a ground plane under the fish on land and at rest; none in the water)
  return { ...structuredClone(s.pose), ...(state === 'water' ? {} : { ground: true }) };
};
export const LAND = stateOf(STATES, 'land'), REST = stateOf(STATES, 'rest'), WATER = stateOf(STATES, 'water'), REACH = stateOf(STATES, 'reach'), SWIM = stateOf(STATES, 'swim');

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
  reach_A023: { azim: 60, elev: 35, fov: 22, fit: front, margin: 0.08 },
  pec_close: { azim: 62, elev: 18, fov: 22, fit: armL, margin: 0.06 },
  tail_close: { azim: 88, elev: 4, fov: 16, fit: tail, margin: 0.06 },
};
const VIEWS = LAND ? [
  shot('v_front_B002', glb('hero'), CAM.front_B002, LAND),
  shot('v_side_A030', glb('hero'), CAM.side_A030, REST),
  shot('v_side_u1', glb('hero'), CAM.side_u1, LAND),
  shot('v_top_A036', glb('hero'), CAM.top_A036, REST),
  shot('v_q34_A005', glb('hero'), CAM.q34_A005, LAND),
  shot('v_q34_B010', glb('hero'), CAM.q34_B010, LAND),
] : [];
const MACRO = LAND ? [
  shot('m_face_u1', glb('hero'), { azim: -100, elev: 3, fov: 30, fit: face, margin: 0.14 }, LAND),
  shot('m_face_B010', glb('hero'), { azim: 66, elev: 34, fov: 30, fit: face, margin: 0.14 }, LAND),
  shot('m_face_front', glb('hero'), { azim: 0, elev: 12, fov: 24, fit: face, margin: 0.1 }, LAND),
] : [];
const POSES = LAND ? [
  shot('p_land_A070', glb('hero'), CAM.land_A070, LAND),
  shot('p_land_A005', glb('hero'), CAM.q34_A005, LAND),
  shot('p_land_u1', glb('hero'), CAM.side_u1, LAND),
  shot('p_land_B010', glb('hero'), CAM.q34_B010, LAND),
  shot('p_rest_A030', glb('hero'), CAM.side_A030, REST),
  shot('p_water_A061', glb('hero'), CAM.water_A061, WATER),
  shot('p_water_side', glb('hero'), { azim: 90, elev: 8, fov: 14, fit: 'all' }, WATER),
  ...(REACH ? [shot('p_reach_A023', glb('hero'), CAM.reach_A023, REACH)] : []),
  // (round B4: the swimming fish, B3's water: the swim wave, the caudal spread)
  ...(SWIM ? [shot('p_swim_side', glb('hero'), { azim: 90, elev: 8, fov: 14, fit: 'all' }, SWIM)] : []),
] : [];
const TIER_VIEWS = [
  ['land_side', 'land', { azim: 90, elev: 3, ortho: true, fit: 'all' }],
  ['land_q34', 'land', { azim: 40, elev: 20, fov: 25, fit: 'all' }],
  ['land_front', 'land', { azim: 0, elev: 5, ortho: true, fit: 'all' }],
  ['rest_top', 'rest', { azim: 0, elev: 90, ortho: true, topUp: -1, fit: 'all' }],
  ['water_A061', 'water', CAM.water_A061],
];
const TIERS = ['hero', 'lod1', 'lod2'].flatMap((t) => TIER_VIEWS.filter(([, st]) => STATES[t]?.[st]).map(([k, st, v]) => shot(`t_${t}_${k}`, glb(t), v, stateOf(STATES, st, t))));
// the crawl's frames from one fixed camera each (the fish moves through it over the welded tips)
export const CRAWL_BOX = box(-1.0, 2.4, -0.45, 0.75, -0.9, 0.9);
export const CRAWL_VIEWS = { side: { azim: 90, elev: 3, ortho: true, fit: CRAWL_BOX, margin: 0.04 }, q34: { azim: 55, elev: 18, fov: 24, fit: CRAWL_BOX, margin: 0.04 }, top: { azim: 0, elev: 90, topUp: -1, ortho: true, fit: CRAWL_BOX, margin: 0.04 } };
const crawlOf = (t) => STATES[t]?.crawl ?? [];
// (round B4: the cycle's keys, every `step`-th and the last; the frame index in the name is the key's own)
export const CRAWL_STEP = { hero: 4, lod1: 8, lod2: 3 };
const every = (F, k) => F.map((f, i) => [f, i]).filter(([, i], _, a) => i % k === 0 || i === a.length - 1);
const CRAWL = [
  ...every(crawlOf('hero'), CRAWL_STEP.hero).flatMap(([f, i]) => Object.entries(CRAWL_VIEWS).map(([k, v]) => shot(`crawl_hero_${String(i).padStart(2, '0')}_${k}`, glb('hero'), v, { ...f.pose, ground: true }))),
  ...['lod1', 'lod2'].flatMap((t) => every(crawlOf(t), CRAWL_STEP[t]).map(([f, i]) => shot(`crawl_${t}_${String(i).padStart(2, '0')}_side`, glb(t), CRAWL_VIEWS.side, { ...f.pose, ground: true }))),
];
// round B2 → B3: the same cameras on both rounds' hero GLBs, each in its own round's states
const CMP = [['side', 'side_A030', 'rest'], ['front', 'front_B002', 'land'], ['top', 'top_A036', 'rest'], ['land', 'land_A070', 'land'], ['water', 'water_A061', 'water'], ['pec', 'pec_close', 'land'], ['tail', 'tail_close', 'rest']];
const B2 = [
  ...CMP.filter(([, , st]) => STATES_B2.hero?.[st]).map(([k, c, st]) => shot(`c_b2_${k}`, glb('hero', b2dir), CAM[c], stateOf(STATES_B2, st))),
  ...CMP.filter(([, , st]) => STATES.hero?.[st]).map(([k, c, st]) => shot(`c_cur_${k}`, glb('hero'), CAM[c], stateOf(STATES, st))),
];

// round B3 → B4: the same cameras on both rounds' hero GLBs, each in its own round's states (c_b3_* round B3's, c_b4_*
// this round's)
const B3 = [
  ...CMP.filter(([, , st]) => STATES_B3.hero?.[st]).map(([k, c, st]) => shot(`c_b3_${k}`, glb('hero', b3dir), CAM[c], stateOf(STATES_B3, st))),
  ...CMP.filter(([, , st]) => STATES.hero?.[st]).map(([k, c, st]) => shot(`c_b4_${k}`, glb('hero'), CAM[c], stateOf(STATES, st))),
];

const set = process.env.FINAL_SET ?? 'all';
const SETS = { views: VIEWS, macro: MACRO, poses: POSES, tiers: TIERS, crawl: CRAWL, b2: B2, b3: B3 };
const ALL = [...VIEWS, ...MACRO, ...POSES, ...TIERS, ...CRAWL];
export const SHOTS = set === 'all' ? ALL : set.split(',').flatMap((k) => SETS[k] ?? [...ALL, ...B2, ...B3].filter((s) => s.name === k));
