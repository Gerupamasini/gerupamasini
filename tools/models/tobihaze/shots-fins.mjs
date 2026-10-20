// The fins' comparison shots (render.mjs --shots shots-fins.mjs). Mode 'textured' keeps the GLB's own materials, so
// the membranes stay double-sided ('clay' would swap in the viewer's one-sided clay).
//   FIN_SHOTS picks a batch:
//     relax | rest | land | water  round B2's posed sheets: the fish (out/fins/posed-clay.mjs) in its bind pose, at rest with
//                                  every fin folded (A030, B067, A040), propped on the planted pectorals (A070, A005,
//                                  u1, B010) and swimming with the paddles spread (A061); the caudal junction and the
//                                  pectoral fan close up. FIN_GLB_DIR (repo-relative; default the fins' scratch dir) and
//                                  FIN_BODY (default thin) name p-<body>-<pose>.glb
//     fish | fins | all            round B1's: the whole fish orthographic and the fins close up, once per state with
//                                  FIN_STATES=rest,fold,… from <FIN_GLB_DIR>/g-<state>.glb
//     wide | tall                  the photo overlays (2400 × 1000 / 1000 × 2400, 448 px/HL)
//     <names,…>                    those shots
// The cameras: the trunk round's photo matches (shots-final.mjs: A070 azim 92 elev 5; A005 azim 70 elev 24; u1 azim
// −104 elev 3; B010 azim 72 elev 30; A030 azim −90 elev 4; A061 azim 92 elev 55), B067 a near-lateral of the left side.
const tex = (name, view, model) => ({ name, mode: 'textured', ...(model ? { model } : {}), view: { margin: 0.06, ...view } });

const FISH = [
  tex('f_side', { fit: 'body', azim: 90, elev: 0, ortho: true }),
  tex('f_top', { fit: 'body', azim: 0, elev: 90, ortho: true, topUp: 1 }),
  tex('f_front', { fit: 'body', azim: 0, elev: 0, ortho: true }),
  tex('f_under', { fit: 'body', azim: 0, elev: -90, ortho: true, topUp: 1 }),
  tex('f_q34', { fit: 'body', azim: 50, elev: 22, fov: 25 }),
  tex('f_q34r', { fit: 'body', azim: 140, elev: 18, fov: 25 }),
];
const FINS = [
  tex('c_d1', { fit: 'd1', azim: 90, elev: 0, ortho: true }),
  tex('c_d1q', { fit: 'd1', azim: 55, elev: 25, fov: 22 }),
  tex('c_median', { fit: 'median', azim: 90, elev: 0, ortho: true }),
  tex('c_caudal', { fit: 'caudal', azim: 90, elev: 0, ortho: true }),
  tex('c_caudalq', { fit: 'caudal', azim: 130, elev: 25, fov: 22 }),
  tex('c_pect', { fit: 'pect', azim: 90, elev: 0, ortho: true }),
  tex('c_pectq', { fit: 'chest', azim: 40, elev: 12, fov: 24 }),
  tex('c_pelvic', { fit: 'pelvic', azim: 70, elev: -25, fov: 24 }),
  tex('c_chestunder', { fit: 'chest', azim: 0, elev: -90, ortho: true, topUp: 1 }),
  tex('m_d1', { fit: 'd1', azim: 70, elev: 12, fov: 14, margin: -0.45, shift: [0.05, 0.12] }),
  tex('m_caudal', { fit: 'caudal', azim: 110, elev: 18, fov: 14, margin: -0.4, shift: [-0.12, 0] }),
  tex('m_pect', { fit: 'pect', azim: 75, elev: 5, fov: 14, margin: -0.35, shift: [0, -0.1] }),
  tex('m_d2', { fit: 'd2', azim: 70, elev: 20, fov: 10, margin: -0.7, shift: [0.05, 0.2] }),
  tex('m_d2base', { fit: 'd2', azim: 120, elev: 8, fov: 10, margin: -0.7, shift: [0.0, -0.25] }),
];
const sil = (name, view) => ({ name, mode: 'silhouette', view: { margin: 0.06, ...view } });
const WIDE = [sil('s_side', { fit: 'body', azim: 90, elev: 0, ortho: true }), tex('w_side', { fit: 'body', azim: 90, elev: 0, ortho: true })];
const TALL = [sil('s_top', { fit: 'body', azim: 0, elev: 90, ortho: true, topUp: 1 }), tex('w_top', { fit: 'body', azim: 0, elev: 90, ortho: true, topUp: 1 })];

// ---- round B2: the posed fish
const dir = process.env.FIN_GLB_DIR ?? 'tools/models/tobihaze/out/fins';
const body = process.env.FIN_BODY ?? 'thin';
const g = (pose) => `${dir}/p-${body}-${pose}.glb`;
const POSED = {
  relax: [
    tex('relax_side', { fit: 'body', azim: 90, elev: 0, ortho: true }, g('relax')),
    tex('relax_q34', { fit: 'body', azim: 50, elev: 22, fov: 25 }, g('relax')),
    tex('relax_front', { fit: 'chest', azim: 0, elev: 8, ortho: true }, g('relax')),
    tex('relax_pect', { fit: 'pect', azim: 75, elev: 5, fov: 20 }, g('relax')),
    tex('relax_junction', { fit: 'junction', azim: 90, elev: 0, ortho: true }, g('relax')),
    tex('relax_junction_q', { fit: 'junction', azim: 125, elev: 28, fov: 18 }, g('relax')),
    tex('relax_junction_top', { fit: 'junction', azim: 0, elev: 90, ortho: true, topUp: 1 }, g('relax')),
    tex('relax_caudal', { fit: 'caudal', azim: 90, elev: 0, ortho: true }, g('relax')),
    tex('relax_pelvic_front', { fit: 'pelvic', azim: 0, elev: -6, ortho: true, margin: 0.2 }, g('relax')),
    tex('relax_pelvic_q', { fit: 'pelvic', azim: 60, elev: -25, fov: 24, margin: 0.2 }, g('relax')),
  ],
  rest: [
    tex('rest_A030', { fit: 'body', azim: -90, elev: 4, fov: 8 }, g('rest')),
    tex('rest_B067', { fit: 'chest', azim: 92, elev: 6, fov: 22, margin: 0.12 }, g('rest')),
    tex('rest_top_A040', { fit: 'chest', azim: 0, elev: 90, ortho: true, topUp: 1, margin: 0.1 }, g('rest')),
    tex('rest_under', { fit: 'chest', azim: 0, elev: -90, ortho: true, topUp: 1, margin: 0.1 }, g('rest')),
    tex('rest_front', { fit: 'chest', azim: 0, elev: 2, ortho: true, margin: 0.1 }, g('rest')),
    tex('rest_junction', { fit: 'junction', azim: 90, elev: 0, ortho: true }, g('rest')),
    tex('rest_d1', { fit: 'd1', azim: 90, elev: 0, ortho: true, margin: 0.4 }, g('rest')),
    tex('rest_pelvic_side', { fit: 'pelvic', azim: 90, elev: -4, ortho: true, margin: 0.6 }, g('rest')),
  ],
  land: [
    tex('land_A070', { fit: 'chest', azim: 92, elev: 5, fov: 22, margin: 0.15 }, g('land')),
    tex('land_A005', { fit: 'chest', azim: 70, elev: 24, fov: 24, margin: 0.12 }, g('land')),
    tex('land_u1', { fit: 'chest', azim: -104, elev: 3, fov: 30, margin: 0.2 }, g('land')),
    tex('land_B010', { fit: 'chest', azim: 72, elev: 30, fov: 24, margin: 0.1 }, g('land')),
    tex('land_front', { fit: 'chest', azim: 0, elev: 4, ortho: true, margin: 0.08 }, g('land')),
    tex('land_sole', { fit: 'pect', azim: 120, elev: 35, fov: 20, margin: 0.15 }, g('land')),
  ],
  water: [
    tex('water_A061', { fit: 'body', azim: 92, elev: 55, fov: 14 }, g('water')),
    tex('water_top', { fit: 'chest', azim: 0, elev: 90, ortho: true, topUp: 1, margin: 0.1 }, g('water')),
    tex('water_pect', { fit: 'pect', azim: 80, elev: 60, fov: 22, margin: 0.1 }, g('water')),
    tex('water_side', { fit: 'body', azim: 90, elev: 8, fov: 14 }, g('water')),
  ],
};

const pick = process.env.FIN_SHOTS ?? 'all';
const ALL = [...FISH, ...FINS, ...WIDE, ...TALL, ...Object.values(POSED).flat()];
const base = POSED[pick] ?? (pick === 'fish' ? FISH : pick === 'fins' ? FINS : pick === 'wide' ? WIDE : pick === 'tall' ? TALL : pick === 'all' ? [...FISH, ...FINS]
  : ALL.filter((s) => pick.split(',').includes(s.name)));
const states = process.env.FIN_STATES?.split(',').filter(Boolean);
export const SHOTS = states
  ? states.flatMap((st) => base.map((s) => ({ ...s, name: `${st}_${s.name}`, model: `${dir}/g-${st}.glb` })))
  : base;
