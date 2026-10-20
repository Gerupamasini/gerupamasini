// Rig pose shots (render.mjs --shots shots-rig.mjs, on a posed whole-fish GLB): the fish framed whole from the side,
// 3/4 above and below, from above and behind; close-ups of the left pectoral arm (its root on the flank, the elbow and
// the wrist, from the side, from below and from behind) and of the head (face, side, front, below). The posed GLBs carry
// their own regions in the root's extras: `fish` (the posed bounding box), `armL` / `armR` (round the posed arm), `head`.
// Every view also comes as x_<name>, drawn in the GLB's own colours (the stretch and weight maps written as vertex
// colours) instead of clay.
// Body poses: --only p_side,p_q34,p_top,p_low,p_rear,a_side,a_low,a_back; head poses: --only h_q34,h_side,h_front,h_low.
//
// Round B3: with RIG_STATES=<dir> (repo-relative; build.mjs's tobihaze.<tier>.glb and states.json there) the shots are
// instead the tier GLBs posed by the viewer in their reference states (rig.statePose(state, tier), as build.mjs wrote them),
// on a ground plane: the land and rest states lying on it from the side (each tier) and low along the ground, the tail
// and the chest close, the alert eyes (hero and lod1, the eyes-up corrective driven by the lift), a blink in the land
// state (the corrective's drive going to 0 with the eye's drop), the vent pose (the gill slit opened by the covers'
// joints alone) and the propped land state at RIG_RAISE's raises (states.json `land<raise>` entries, if written).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VIEWS = {
  p_side: { fit: 'fish', azim: 90, elev: 0, ortho: true },
  p_q34: { fit: 'fish', azim: 40, elev: 20 },
  p_top: { fit: 'fish', azim: 0, elev: 90, ortho: true, topUp: 1 },
  p_low: { fit: 'fish', azim: 55, elev: -18 },
  p_rear: { fit: 'fish', azim: 145, elev: 22 },
  p_front: { fit: 'fish', azim: 10, elev: 8 },
  a_side: { fit: 'armL', azim: 90, elev: 5, margin: 0.25, fov: 22 },
  a_low: { fit: 'armL', azim: 30, elev: -35, margin: 0.25, fov: 22 },
  a_back: { fit: 'armL', azim: 150, elev: 15, margin: 0.25, fov: 22 },
  a_front: { fit: 'armL', azim: 20, elev: 10, margin: 0.25, fov: 22 },
  h_q34: { fit: 'head', azim: 40, elev: 12, margin: 0.04, fov: 24 },
  h_side: { fit: 'head', azim: 90, elev: 0, margin: 0.04, fov: 24 },
  h_front: { fit: 'head', azim: 0, elev: 5, margin: 0.04, fov: 24 },
  h_low: { fit: 'head', azim: 30, elev: -25, margin: 0.04, fov: 24 },
};
const view = (v) => ({ margin: 0.06, fov: 25, ...v });

function stateShots(dir) {
  const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..', '..', '..');
  const ST = JSON.parse(fs.readFileSync(path.join(root, dir, 'states.json'), 'utf8'));
  const glb = (t) => `${dir}/tobihaze.${t}.glb`;
  const shot = (name, t, v, pose) => ({ name, mode: 'clay', model: glb(t), view: { margin: 0.06, fov: 25, ...v, ...(pose ? { pose } : {}) } });
  const S = (t, st, extra = {}) => ({ ...structuredClone(ST[t][st].pose), ...extra, ...(st === 'water' ? {} : { ground: true }) });
  const eyes = (t) => ({ J_eyeL: { t: [0, -0.1, 0] }, J_eyeR: { t: [0, -0.1, 0] } });
  const tiers = ['hero', 'lod1', 'lod2'].filter((t) => ST[t]);
  const out = [];
  for (const t of tiers) for (const st of ['land', 'rest']) out.push(shot(`${st}_side_${t}`, t, { fit: 'all', azim: 90, elev: 2, ortho: true }, S(t, st)));
  out.push(
    shot('land_A070', 'hero', { fit: 'all', azim: 92, elev: 5, fov: 10 }, S('hero', 'land')),
    shot('land_low', 'hero', { fit: 'all', azim: 120, elev: 1, fov: 14 }, S('hero', 'land')),
    shot('land_tail', 'hero', { fit: 'tail', azim: 90, elev: 1, fov: 14, margin: 0.15 }, S('hero', 'land')),
    shot('land_chest', 'hero', { fit: 'chest', azim: 70, elev: -4, fov: 18, margin: 0.1 }, S('hero', 'land')),
    shot('rest_A030', 'hero', { fit: 'all', azim: -90, elev: 4, fov: 8 }, S('hero', 'rest')),
    shot('rest_low', 'hero', { fit: 'all', azim: 60, elev: 1, fov: 14 }, S('hero', 'rest')),
    shot('rest_tail', 'hero', { fit: 'tail', azim: 90, elev: 1, fov: 14, margin: 0.15 }, S('hero', 'rest')),
  );
  for (const t of tiers.filter((x) => x !== 'lod2')) {
    out.push(
      shot(`eyes_land_side_${t}`, t, { fit: 'head', azim: 90, elev: 4, fov: 24, margin: 0.06 }, S(t, 'land')),
      shot(`eyes_land_q34_${t}`, t, { fit: 'head', azim: 35, elev: 18, fov: 24, margin: 0.06 }, S(t, 'land')),
      shot(`eyes_land_blink_${t}`, t, { fit: 'head', azim: 60, elev: 10, fov: 24, margin: 0.06 }, S(t, 'land', eyes(t))),
    );
  }
  out.push(
    shot('vent_side', 'hero', { fit: 'head', azim: 100, elev: 6, fov: 24, margin: 0.06 }, { J_opercL: { angle: 18 }, J_opercR: { angle: 18 }, J_suspL: { angle: 4 }, J_suspR: { angle: 4 } }),
    shot('vent_rear', 'hero', { fit: 'head', azim: 150, elev: 12, fov: 24, margin: 0.06 }, { J_opercL: { angle: 18 }, J_opercR: { angle: 18 }, J_suspL: { angle: 4 }, J_suspR: { angle: 4 } }),
  );
  for (const k of Object.keys(ST.hero).filter((k) => /^land\d+$/.test(k))) out.push(shot(`${k}_side`, 'hero', { fit: 'all', azim: 90, elev: 2, ortho: true }, S('hero', k)), shot(`${k}_q34`, 'hero', { fit: 'all', azim: 60, elev: 10, fov: 18 }, S('hero', k)));
  return out;
}

export const SHOTS = process.env.RIG_STATES ? stateShots(process.env.RIG_STATES) : [
  ...Object.entries(VIEWS).map(([name, v]) => ({ name, mode: 'clay', view: view(v) })),
  ...Object.entries(VIEWS).map(([name, v]) => ({ name: `x_${name}`, mode: 'textured', view: view(v) })),
];
