// Close-up face and mouth shots (render.mjs --shots shots-face.mjs), at the cameras of the macro mouth photos:
// B007 (3/4 front, low), B064 / B065 (antero-lateral), B020 (front 3/4 from above), B001 (front, low), B010 (3/4 above).
const clay = (name, view) => ({ name, mode: 'clay', view: { fit: 'face', margin: 0.04, fov: 28, ...view } });
export const SHOTS = [
  clay('f_B007', { azim: -38, elev: 4 }),
  clay('f_B064', { azim: -62, elev: 12 }),
  clay('f_B020', { azim: -30, elev: 32 }),
  clay('f_B001', { azim: -12, elev: 12 }),
  clay('f_side', { azim: -90, elev: 0 }),
  clay('f_front', { azim: 0, elev: 0 }),
  clay('f_low', { azim: -25, elev: -12 }),
  clay('f_B010', { azim: -66, elev: 34 }),
];
