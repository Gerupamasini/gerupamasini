// The マハゼ skeleton the translucent body shaders draw (hero/BodyMaterial.js, bodyTranslucency.ts), in fractions that
// carry over between gobies. Measured on a CT scan of a mudskipper's skeleton (ムツゴロウ CT scan, Blue-spotted
// Mudskipper, by ffish.asia / floraZia.com, CC BY-NC-SA 4.0; a reference only, nothing of it is shipped):
//   * the vertebral column rises from the skull (60 % of the body's depth above the belly) to its highest over the body
//     cavity (70 %), drops to 56 % at the vent and to about the middle in the caudal peduncle
//   * its centra keep nearly the same size to the tail: 1.9–2.2 % SL high, 2.9 % SL long
//   * neural spines on every vertebra (short over the cavity), haemal spines only on the caudal vertebrae behind the
//     vent; both lean back about 42° from the vertical (dx/dy 0.9)
//   * a pair of pleural ribs on each abdominal vertebra from the third on, down the body wall around the cavity to near
//     the belly, leaning back about 30° (dx/dy 0.6)
// The エドハゼ and the ヒメハゼ keep the earlier, plain column (COLUMN_PLAIN) and spines.

/** the column's height in the section (hn: −1 belly … 1 back, from the section's centre line) at its first centrum, over
 * the middle of the body cavity, at the vent and at the caudal base; its radius at the first centrum and the last (mm at
 * the hero's 41 mm SL; the shaders' Gaussian tube) */
export const COLUMN = { hn: [0.2, 0.38, 0.12, 0.0], radius: [0.38, 0.3] };
/** the earlier column: level with the section's centre line, thinning to the tail */
export const COLUMN_PLAIN = { hn: [0.06, 0.06, 0.06, 0.06], radius: [0.34, 0.17] };
/** how far back the spines and ribs lean (mm back per mm away from the column) */
export const SLANT = { spine: 0.9, rib: 0.6 };

const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
/** the column's height in the section (hn) at s mm from the snout: first centrum `start`, the `vent`, standard length `sl` */
export function columnHn(s, start, vent, sl, hn = COLUMN.hn) {
  const m = 0.5 * (start + vent);
  if (s < m) return hn[0] + (hn[1] - hn[0]) * ss(start, m, s);
  if (s < vent) return hn[1] + (hn[2] - hn[1]) * ss(m, vent, s);
  return hn[2] + (hn[3] - hn[2]) * ss(vent, sl, s);
}

/** GLSL of columnHn (hn: the four heights) */
export const COLUMN_GLSL = /* glsl */ `
float gobyColumnHn(float s, float start, float vent, float sl, vec4 hn) {
  float m = 0.5 * (start + vent);
  if (s < m) return mix(hn.x, hn.y, smoothstep(start, m, s));
  if (s < vent) return mix(hn.y, hn.z, smoothstep(m, vent, s));
  return mix(hn.z, hn.w, smoothstep(vent, sl, s));
}
`;
