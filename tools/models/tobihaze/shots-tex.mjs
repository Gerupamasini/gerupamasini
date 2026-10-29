// The textures round's comparison shots (render.mjs --shots shots-tex.mjs, 'textured' mode): the skin's colour and
// pattern next to the photos it was matched to, at the photos' own cameras (shots-final.mjs's photo matches, plus B067's
// aquarium side and the u1 / B010 / front macros), each tier at the size it is drawn at, and close-ups of the pattern's
// places (the head top's vermiculation, the cheek's pale spots, the opercular bar and axilla, the flank's barcode and
// spot rows, the lobe, the lips, the eye's skin cap, the tail).
//   TEX_DIR   repo-relative directory of the textured tier GLBs (tobihaze.<tier>.glb) and their states.json (default
//             tools/models/tobihaze/out/tiers)
//   TEX_SET   photo | macro | detail | tiers | far | all (default all; a comma list, or shot names)
//   TEX_MODE  textured (default) | clay — the same cameras on the clay for before / after
//   TEX_LIGHT the viewer's light rig for the textured shots (default: the viewer's own, 'photo' — round T2's canonical
//             photo light, reference/tobihaze-viewer/main.js LIGHT.photo; 'studio' for the unlit ID passes)
// The photo each shot matches is in its name (u1, B010, A005, B067, A030, A070, A036, B002, B006, B050, B064).
// Round T3 (key pattern): u1, the owner's photo, is the primary reference — its side view and head close-ups under the
// canonical photo light (calibration), the viewer's own 'u1' rig and the game's noon ('game': a sanity check, the fish must
// read right in the game's own light too) — and the secondary photos are each matched with the runtime uniforms that
// make them one individual of the one texture (shot.material, the GLB's runtime rules as the viewer ports them): the
// barred morph (bars) at A030 / A070, the grey-mud morph (tint) at A030, an individual tint at B067 and B010.
//   TEX_SET u1 | morph | game (round T3) besides photo | macro | detail | tiers
// Round T2 (key pattern): the eye's skin cap close up from the side and from above (td_eye_side, td_eye_top: the caps
// finer and smoother than the head round them), the face from in front (td_face_front: B002's mottle, the lips), the
// lobe from the 3/4 (td_lobe) and the head top (tm_head_top_B050: the lengthwise vermiculation). The pattern key's
// measures run on these renders in the pattern's own frame (u = s/TL, v) through unlit ID passes of the same cameras
// (scratchpad ref/work/t2_pattern: py/trunk.py the band contrast per scale against u1, A030, A070, B067, B010;
// py/regions.py the region colours against the independent photos; py/tiers.py lod1 and lod2 against the hero at the
// same camera and size — render.mjs --width 360 / 140 / 48 for the switch sizes; py/cap.py the eye cap).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HL, toObject } from './anatomy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const dir = process.env.TEX_DIR ?? 'tools/models/tobihaze/out/tiers';
const mode = process.env.TEX_MODE ?? 'textured';
const light = process.env.TEX_LIGHT ?? null;
const glb = (t) => `${dir}/tobihaze.${t}.glb`;
const box = (s0, s1, y0, y1, z0, z1) => {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
const STATES = (() => { const f = path.join(root, dir, 'states.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; })();
const stateOf = (state, tier = 'hero') => {
  const s = STATES[tier]?.[state];
  return s ? { ...structuredClone(s.pose), ...(state === 'water' ? {} : { ground: true }) } : {};
};
const shot = (name, tier, view, state, extra = {}) => ({ name, mode, ...(light ? { light } : {}), model: glb(tier), view: { margin: 0.06, ...view, pose: stateOf(state, tier) }, ...extra });

const chest = box(0.70, 1.80, -0.40, 0.75, -0.62, 0.62);
const face = box(-0.04, 0.56, -0.04, 0.80, -0.38, 0.38);
const front = box(-0.05, 2.30, -0.30, 0.85, -0.62, 0.62);
const head = box(-0.04, 1.30, -0.10, 0.85, -0.45, 0.45);
const cheek = box(0.30, 1.30, -0.05, 0.62, 0.0, 0.45);
const flank = box(1.10, 3.60, -0.10, 0.70, 0.0, 0.40);
const tail = box(2.90, 4.40, 0.0, 0.62, 0.0, 0.30);
const eye = box(0.18, 0.50, 0.40, 0.80, 0.0, 0.26);
const eyes = box(0.18, 0.50, 0.40, 0.80, -0.26, 0.26);
const lips = box(-0.02, 0.45, -0.02, 0.40, 0.0, 0.32);
const lobe = box(0.95, 1.75, -0.45, 0.55, 0.10, 0.95);

/** The photo-matched cameras (shots-final.mjs CAM; B067 the aquarium's near-lateral left side at the fish's level). */
export const CAM = {
  front_B002: { azim: 0, elev: 28, fov: 30, fit: chest, margin: 0.05 },
  side_A030: { azim: -90, elev: 4, fov: 8, fit: 'all' },
  side_u1: { azim: -104, elev: 3, fov: 36, fit: chest, margin: 0.25 },
  top_A036: { azim: 0, elev: 90, topUp: -1, fov: 8, fit: 'all' },
  q34_A005: { azim: 70, elev: 24, fov: 22, fit: 'all' },
  q34_B010: { azim: 72, elev: 30, fov: 24, fit: chest, margin: 0.1 },
  land_A070: { azim: 92, elev: 5, fov: 10, fit: 'all' },
  side_B067: { azim: 88, elev: 2, fov: 20, fit: front, margin: 0.04 },
};
const PHOTO = [
  shot('tx_u1_side', 'hero', CAM.side_u1, 'land'),
  shot('tx_B010_q34', 'hero', CAM.q34_B010, 'land'),
  shot('tx_A005_q34', 'hero', CAM.q34_A005, 'land'),
  shot('tx_B067_side', 'hero', CAM.side_B067, 'rest'),
  shot('tx_A030_side', 'hero', CAM.side_A030, 'rest'),
  shot('tx_A070_land', 'hero', CAM.land_A070, 'land'),
  shot('tx_A036_top', 'hero', CAM.top_A036, 'rest'),
  shot('tx_B002_front', 'hero', CAM.front_B002, 'land'),
];
const MACRO = [
  shot('tm_face_u1', 'hero', { azim: -100, elev: 3, fov: 30, fit: face, margin: 0.14 }, 'land'),
  shot('tm_face_B010', 'hero', { azim: 66, elev: 34, fov: 30, fit: face, margin: 0.14 }, 'land'),
  shot('tm_face_front', 'hero', { azim: 0, elev: 12, fov: 24, fit: face, margin: 0.1 }, 'land'),
  shot('tm_head_top_B050', 'hero', { azim: 0, elev: 90, topUp: -1, fov: 24, fit: head, margin: 0.06 }, 'rest'),
];
const DETAIL = [
  shot('td_cheek_B006', 'hero', { azim: 90, elev: 8, fov: 22, fit: cheek, margin: 0.05 }, 'rest'),
  shot('td_opbar_B064', 'hero', { azim: 75, elev: 18, fov: 22, fit: box(0.55, 1.55, -0.05, 0.75, 0.0, 0.5), margin: 0.05 }, 'land'),
  shot('td_flank', 'hero', { azim: 90, elev: 6, fov: 18, fit: flank, margin: 0.04 }, 'rest'),
  shot('td_tail', 'hero', { azim: 90, elev: 6, fov: 18, fit: tail, margin: 0.04 }, 'rest'),
  shot('td_eye', 'hero', { azim: 60, elev: 20, fov: 22, fit: eye, margin: 0.08 }, 'rest'),
  shot('td_eye_top', 'hero', { azim: 0, elev: 70, fov: 22, fit: eyes, margin: 0.08 }, 'rest'),
  shot('td_eye_front', 'hero', { azim: 0, elev: 25, fov: 22, fit: eyes, margin: 0.08 }, 'land'),
  shot('td_face_front', 'hero', { azim: 0, elev: 12, fov: 24, fit: face, margin: 0.1 }, 'land'),
  shot('td_lips', 'hero', { azim: 50, elev: 5, fov: 22, fit: lips, margin: 0.06 }, 'rest'),
  shot('td_lobe', 'hero', { azim: 70, elev: 15, fov: 22, fit: lobe, margin: 0.05 }, 'land'),
  shot('td_belly', 'hero', { azim: 90, elev: -55, fov: 14, fit: 'all', margin: 0.05 }, 'water'),
];
// the tiers at their own distances: the same 3/4 land camera, lod1 and lod2 rendered small (render.mjs --width) — and
// all three large for the layout check
const TIERS = ['hero', 'lod1', 'lod2'].flatMap((t) => [
  shot(`tt_${t}_q34`, t, { azim: 40, elev: 20, fov: 25, fit: 'all' }, 'land'),
  shot(`tt_${t}_side`, t, { azim: 90, elev: 3, ortho: true, fit: 'all' }, 'rest'),
  shot(`tt_${t}_top`, t, { azim: 0, elev: 90, ortho: true, topUp: -1, fit: 'all' }, 'rest'),
]);
// round T3: u1 (the owner's photo) first — its side and head under the photo light, its own rig and the game's noon; the
// flank and the cheek close (the marks' edges, the head's mottle)
const U1 = [
  ...['photo', 'u1', 'game'].flatMap((l) => [
    shot(`tu_u1_side_${l}`, 'hero', CAM.side_u1, 'land', { light: l }),
    shot(`tu_u1_head_${l}`, 'hero', { azim: -100, elev: 3, fov: 30, fit: face, margin: 0.14 }, 'land', { light: l }),
  ]),
  shot('tu_u1_flank_close', 'hero', { azim: -100, elev: 4, fov: 12, fit: box(1.15, 2.6, 0.0, 0.7, 0.0, 0.4), margin: 0.03 }, 'land', { light: 'photo' }),
  shot('tu_u1_cheek_close', 'hero', { azim: -96, elev: 6, fov: 12, fit: box(0.3, 0.95, 0.1, 0.62, 0.0, 0.45), margin: 0.03 }, 'land', { light: 'photo' }),
];
// the runtime morphs at the secondary photos' cameras (RUNTIME_CONTRACT.md: bars, tint): one texture, each individual
const GREY = { hueDeg: 0, sat: 0.3, val: 1, contrast: 0.6, lift: { colour: '#8f8f8f', amount: 0.3 } };
const MORPH = [
  shot('tg_A030_barred', 'hero', CAM.side_A030, 'rest', { material: { bars: 1 } }),
  shot('tg_A030_greyBarred', 'hero', CAM.side_A030, 'rest', { material: { bars: 0.5, tint: GREY } }),
  shot('tg_A070_barred', 'hero', CAM.land_A070, 'land', { material: { bars: 1 } }),
  shot('tg_B067_tint', 'hero', CAM.side_B067, 'rest', { material: { tint: { hueDeg: -4, sat: 0.75, val: 0.72, contrast: 1.1 } } }),
  shot('tg_B010_tint', 'hero', CAM.q34_B010, 'land', { material: { tint: { hueDeg: -3, sat: 1.3, val: 1.12, contrast: 1 } } }),
];
// the game's noon at the photo cameras (sanity) and lod1 / lod2 there too
const GAME = [
  shot('tw_u1_side', 'hero', CAM.side_u1, 'land', { light: 'game' }),
  shot('tw_B010', 'hero', CAM.q34_B010, 'land', { light: 'game' }),
  shot('tw_top', 'hero', CAM.top_A036, 'rest', { light: 'game' }),
  shot('tw_lod1_q34', 'lod1', { azim: 40, elev: 20, fov: 25, fit: 'all' }, 'land', { light: 'game' }),
  shot('tw_lod2_q34', 'lod2', { azim: 40, elev: 20, fov: 25, fit: 'all' }, 'land', { light: 'game' }),
];
const SETS = { photo: PHOTO, macro: MACRO, detail: DETAIL, tiers: TIERS, u1: U1, morph: MORPH, game: GAME };
const set = process.env.TEX_SET ?? 'all';
const ALL = [...U1, ...PHOTO, ...MACRO, ...DETAIL, ...TIERS, ...MORPH, ...GAME];
export const SHOTS = set === 'all' ? ALL : set.split(',').flatMap((k) => SETS[k] ?? ALL.filter((s) => s.name === k));
