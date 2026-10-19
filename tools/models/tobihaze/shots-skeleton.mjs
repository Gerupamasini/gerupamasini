// X-ray shots of the head skeleton inside the skin (render.mjs --shots shots-skeleton.mjs; build-skeleton.mjs output)
const x = (name, view, mode = 'xray') => ({ name, mode, view: { fit: 'head', margin: 0.06, ...view } });
export const SHOTS = [
  x('x_side', { azim: -90, elev: 0, ortho: true }),
  x('x_top', { azim: 0, elev: 90, ortho: true, topUp: 1 }),
  x('x_front', { azim: 0, elev: 0, ortho: true }),
  x('x_q34', { azim: -40, elev: 20, fov: 25 }),
  x('x_under', { azim: 0, elev: -90, ortho: true, topUp: 1 }),
  x('b_side', { azim: -90, elev: 0, ortho: true }, 'bones'),
  x('b_top', { azim: 0, elev: 90, ortho: true, topUp: 1 }, 'bones'),
  x('b_q34', { azim: -40, elev: 20, fov: 25 }, 'bones'),
];
