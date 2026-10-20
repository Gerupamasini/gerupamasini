// The pectoral system's comparison shots (round B3; render.mjs --shots shots-pect.mjs): the arm close up and the whole
// fish at the photos' cameras in the rig's states, on the tier GLBs of build.mjs (skinned, with their blend shapes;
// posed by the viewer from each shot's `pose`: nothing baked). PECT_SHOTS picks a batch:
//   lobe    the bind arm close up (side, front, from above, 3/4, below, behind) on PECT_GLB (default the hero tier)
//   prop    propped on the planted pectorals (rig statePose 'land'): A070, A005, B010, u1 cameras, the arm close up
//   reach   the arm reaching forward (statePose 'reach'): A023, A070
//   rest    prone, the arms folded back flat on the flank (statePose 'rest'): A030, B067, from above
//   water   the paddles spread beside the flank (statePose 'water'): A061, A042, from above and the side
//   crawl   the crawl's stance (rig crawlFrames): PECT_FRAMES frames from the side and the front, the welded tip marked
// The poses come from PECT_STATES (repo-relative JSON, default tools/models/tobihaze/out/pectoral/states.json, written
// by out/pectoral/t_pect.mjs --write from rig.mjs statePose / crawlFrames: the same source build.mjs writes into the GLBs) or,
// without it, the hero GLB's own extras (FINAL_DIR/states.json: land, rest, water).
// The cameras are the trunk round's photo matches (shots-final.mjs: A070 azim 92 elev 5; A005 azim 70 elev 24; u1
// azim −104 elev 3; B010 azim 72 elev 30; A030 azim −90 elev 4; A061 azim 92 elev 55); A023 from the photo (the left
// side from in front and above), B067 a near-lateral of the left side, A042 from above the left side.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HL, toObject } from './anatomy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const tierDir = process.env.FINAL_DIR ?? 'tools/models/tobihaze/out/tiers';
const glb = process.env.PECT_GLB ?? `${tierDir}/tobihaze.hero.glb`;
const box = (s0, s1, y0, y1, z0, z1) => {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
const armL = box(0.85, 1.75, -0.35, 0.55, 0.05, 0.95);
const chest = box(0.55, 1.95, -0.45, 0.80, -0.95, 0.95);
const front = box(0.0, 2.2, -0.45, 0.85, -0.95, 0.95);

const statesFile = path.join(root, process.env.PECT_STATES ?? 'tools/models/tobihaze/out/pectoral/states.json');
const finalFile = path.join(root, tierDir, 'states.json');
const STATES = fs.existsSync(statesFile) ? JSON.parse(fs.readFileSync(statesFile, 'utf8')) : fs.existsSync(finalFile) ? JSON.parse(fs.readFileSync(finalFile, 'utf8')).hero ?? {} : {};
const pose = (st, extra = {}) => (STATES[st] ? { ...structuredClone(STATES[st].pose ?? STATES[st]), ...(st === 'water' ? {} : { ground: true }), ...extra } : null);

const clay = (name, view, p = null) => ({ name, mode: 'clay', model: glb, view: { margin: 0.06, ...view, ...(p ? { pose: p } : {}) } });
const CAM = {
  A070: { azim: 92, elev: 5, fov: 10, fit: 'all' },
  A070c: { azim: 92, elev: 5, fov: 22, fit: chest, margin: 0.12 },
  A005: { azim: 70, elev: 24, fov: 22, fit: 'all' },
  A005c: { azim: 70, elev: 24, fov: 24, fit: chest, margin: 0.1 },
  B010: { azim: 72, elev: 30, fov: 24, fit: chest, margin: 0.1 },
  u1: { azim: -104, elev: 3, fov: 36, fit: chest, margin: 0.25 },
  A023: { azim: 60, elev: 35, fov: 22, fit: front, margin: 0.08 },
  A030: { azim: -90, elev: 4, fov: 8, fit: 'all' },
  A030c: { azim: -90, elev: 4, fov: 22, fit: chest, margin: 0.1 },
  B067: { azim: 92, elev: 6, fov: 22, fit: chest, margin: 0.12 },
  top: { azim: 0, elev: 90, ortho: true, topUp: -1, fit: chest, margin: 0.1 },
  A061: { azim: 92, elev: 55, fov: 14, fit: 'all' },
  A061c: { azim: 92, elev: 55, fov: 22, fit: chest, margin: 0.1 },
  A042: { azim: 70, elev: 70, fov: 22, fit: chest, margin: 0.1 },
  side: { azim: 90, elev: 3, ortho: true, fit: chest, margin: 0.08 },
  frontV: { azim: 0, elev: 4, ortho: true, fit: chest, margin: 0.08 },
};
const LOBE = [
  clay('lobe_side', { azim: 90, elev: 0, ortho: true, fit: armL }),
  clay('lobe_front', { azim: 0, elev: 0, ortho: true, fit: armL }),
  clay('lobe_top', { azim: 0, elev: 90, ortho: true, topUp: -1, fit: armL }),
  clay('lobe_q34', { azim: 50, elev: 20, fov: 22, fit: armL }),
  clay('lobe_under', { azim: 30, elev: -40, fov: 22, fit: armL }),
  clay('lobe_back', { azim: 150, elev: 10, fov: 22, fit: armL }),
];
const P = (st, list) => (STATES[st] ? list.map(([n, c, ex]) => clay(`${st}_${n}`, { ...CAM[c], ...(ex ?? {}) }, pose(st))) : []);
const PROP = P('land', [['A070', 'A070'], ['A070c', 'A070c'], ['A005', 'A005'], ['A005c', 'A005c'], ['B010', 'B010'], ['u1', 'u1'], ['front', 'frontV'], ['top', 'top']]);
const REACH = P('reach', [['A023', 'A023'], ['A070', 'A070c'], ['side', 'side'], ['front', 'frontV']]);
const REST = P('rest', [['A030', 'A030'], ['A030c', 'A030c'], ['B067', 'B067'], ['top', 'top'], ['front', 'frontV']]);
const WATER = P('water', [['A061', 'A061'], ['A061c', 'A061c'], ['A042', 'A042'], ['top', 'top'], ['side', 'side'], ['front', 'frontV']]);
// the crawl's frames (states.json crawl: [{ phase, pose, weldMM (fish mm, the first frame's frame: the world) }]): from
// the side (orthographic) and from in front and above, every frame through one fixed camera (the fish moves through it
// over the welded tips; CRAWL_BOX exported so the strip can mark the weld in the images)
const CR = STATES.crawl ?? [];
export const CRAWL_BOX = box(-1.0, 2.4, -0.45, 0.75, -0.9, 0.9);
export const CRAWL_VIEWS = { side: { ...CAM.side, fit: CRAWL_BOX, margin: 0.04 }, q34: { azim: 55, elev: 18, fov: 24, fit: CRAWL_BOX, margin: 0.04 } };
const CRAWL = CR.flatMap((f, i) => Object.entries(CRAWL_VIEWS).map(([k, v]) => clay(`crawl_${String(i).padStart(2, '0')}_${k}`, v, { ...f.pose, ground: true })));
const SETS = { lobe: LOBE, prop: PROP, reach: REACH, rest: REST, water: WATER, crawl: CRAWL };
const pick = process.env.PECT_SHOTS ?? 'lobe';
export const SHOTS = pick.split(',').flatMap((k) => SETS[k] ?? Object.values(SETS).flat().filter((s) => s.name === k));
