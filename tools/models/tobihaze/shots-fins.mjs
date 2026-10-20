// The fins' comparison shots (render.mjs --shots shots-fins.mjs): the whole fish orthographic from the side (the
// fish's left, snout to the left as in A070 / A030), above, the front and below, a 3/4 view, and close-ups of every fin
// (the regions d1, d2, anal, median, caudal, pect, pelvic, chest of a GLB that carries them in its root's extras, as
// the fins' scratch builder writes). Mode 'textured' keeps the GLB's own materials, so the single-sheet membranes stay
// double-sided ('clay' would swap in the viewer's one-sided clay).
//   FIN_SHOTS=all|fish|fins|<names,…> (default all) picks a batch; FIN_STATES=rest,fold,… renders each shot once per
//   state from <FIN_GLB_DIR>/g-<state>.glb (repo-relative, default the fins' scratch dir), named <state>_<shot>.
const tex = (name, view) => ({ name, mode: 'textured', view: { margin: 0.06, ...view } });

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
  // macros: the rays' ridges, segments and branches, the membrane's pleats and margin
  tex('m_d1', { fit: 'd1', azim: 70, elev: 12, fov: 14, margin: -0.45, shift: [0.05, 0.12] }),
  tex('m_caudal', { fit: 'caudal', azim: 110, elev: 18, fov: 14, margin: -0.4, shift: [-0.12, 0] }),
  tex('m_pect', { fit: 'pect', azim: 75, elev: 5, fov: 14, margin: -0.35, shift: [0, -0.1] }),
  tex('m_d2', { fit: 'd2', azim: 70, elev: 20, fov: 10, margin: -0.7, shift: [0.05, 0.2] }),
  tex('m_d2base', { fit: 'd2', azim: 120, elev: 8, fov: 10, margin: -0.7, shift: [0.0, -0.25] }),
];
// the photo overlays (render at 2400 × 1000: 448.4 px/HL, the snout at x 90; the fish frame's y 0.4 HL at y 500)
const sil = (name, view) => ({ name, mode: 'silhouette', view: { margin: 0.06, ...view } });
const WIDE = [
  sil('s_side', { fit: 'body', azim: 90, elev: 0, ortho: true }),
  tex('w_side', { fit: 'body', azim: 90, elev: 0, ortho: true }),
];
// (render at 1000 × 2400: 448.3 px/HL, the snout up, the fish's left on the image's left)
const TALL = [
  sil('s_top', { fit: 'body', azim: 0, elev: 90, ortho: true, topUp: 1 }),
  tex('w_top', { fit: 'body', azim: 0, elev: 90, ortho: true, topUp: 1 }),
];
const pick = process.env.FIN_SHOTS ?? 'all';
const base = pick === 'fish' ? FISH : pick === 'fins' ? FINS : pick === 'wide' ? WIDE : pick === 'tall' ? TALL : pick === 'all' ? [...FISH, ...FINS]
  : [...FISH, ...FINS, ...WIDE, ...TALL].filter((s) => pick.split(',').includes(s.name));
const states = process.env.FIN_STATES?.split(',').filter(Boolean);
const dir = process.env.FIN_GLB_DIR ?? 'tools/models/tobihaze/out/fins';
export const SHOTS = states
  ? states.flatMap((st) => base.map((s) => ({ ...s, name: `${st}_${s.name}`, model: `${dir}/g-${st}.glb` })))
  : base;
