// Macro shots of the mouth and the eye (render.mjs --shots shots-macro.mjs), framed on boxes given in the fish frame
// (HL): the mouth from the side, the front, below and 3/4; the left eye from the side, the front-side and above.
import { HL, toObject } from './anatomy.mjs';

const box = (s0, s1, y0, y1, z0, z1) => {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
const mouth = box(-0.02, 0.42, -0.01, 0.32, -0.33, 0.33), mouthL = box(-0.02, 0.42, -0.01, 0.32, 0.0, 0.33);
const eye = box(0.18, 0.48, 0.40, 0.78, 0.0, 0.28);
const clay = (name, view) => ({ name, mode: 'clay', view: { margin: 0.04, fov: 24, ...view } });
export const SHOTS = [
  clay('m_side', { fit: mouthL, azim: 90, elev: 0 }),
  clay('m_front', { fit: mouth, azim: 0, elev: 0 }),
  clay('m_q34', { fit: mouth, azim: 40, elev: 8 }),
  clay('m_low', { fit: mouth, azim: 25, elev: -25 }),
  clay('m_under', { fit: mouth, azim: 0, elev: -70 }),
  clay('e_side', { fit: eye, azim: 90, elev: 0 }),
  clay('e_q34', { fit: eye, azim: 45, elev: 10 }),
  clay('e_top', { fit: eye, azim: 60, elev: 50 }),
];
