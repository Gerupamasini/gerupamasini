// Pose-test shots (render.mjs --shots shots-pose.mjs, on a build-pose.mjs GLB): the face in clay and in x-ray from
// the side, the front, 3/4 and below, framed on a box round the face (fish frame, HL).
import { HL, toObject } from './anatomy.mjs';

const box = (s0, s1, y0, y1, z0, z1) => {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
const face = box(-0.10, 0.75, -0.18, 0.78, -0.36, 0.36), sideBox = box(-0.10, 0.75, -0.18, 0.78, 0, 0.36);
const v = (name, mode, view) => ({ name, mode, view: { margin: 0.02, fov: 24, fit: face, ...view } });
export const SHOTS = [
  v('c_side', 'clay', { azim: 90, elev: 0, fit: sideBox }),
  v('c_q34', 'clay', { azim: 40, elev: 12 }),
  v('c_front', 'clay', { azim: 0, elev: 5 }),
  v('c_low', 'clay', { azim: 30, elev: -25 }),
  v('x_side', 'xray', { azim: 90, elev: 0, fit: sideBox }),
  v('x_q34', 'xray', { azim: 40, elev: 12 }),
];
