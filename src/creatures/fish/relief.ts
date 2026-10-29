import { eyePhi, profilesOf, sectionPoint, smooth, type FishSpec, type Section } from './spec';

const PT: [number, number] = [0, 0], PX: [number, number] = [0, 0];
// (each eye's centre on the section, worked out once a section: the painter asks a column's texels in turn)
let memoSpec: FishSpec | null = null, memoS = NaN;
const MEMO: { pc: number; x: number; y: number }[] = [];

/**
 * The head's anatomy drawn into the skin's normal map and its tone (the far tiers and the hero alike): the lips rolled
 * round the gape and the crease between them, the maxilla's plate above the gape and the groove round its hind end,
 * the raised rim of the orbit and the shadow at the eye's edge, the two nostrils, the preopercle's margin and the gill
 * cover's free edge standing proud of the body with a shadow under it.
 *
 * Heights are in TL units (outward), `ao` darkens the creases, `plate` is 1 on the gill cover's bony plate (glossier).
 */
export interface Relief { h: number; ao: number; plate: number }

const g2 = (x: number, w: number) => Math.exp(-((x / w) ** 2));

export function headRelief(spec: FishSpec, s: number, y: number, phi: number, sec: Section, out: Relief): Relief {
  out.h = 0; out.ao = 1; out.plate = 0;
  const r = spec.relief ?? {};
  const side = smooth(0.12, 0.42, Math.sin(phi) ** 2);
  if (side <= 0) return out;
  const P = profilesOf(spec), m = spec.mouth, c = m.corner, oper = spec.oper;
  const sideSign = Math.sin(phi) >= 0 ? 1 : -1;
  // the gape: a crease between two rolled lips, darkest into the corner
  if (s < c + 0.012) {
    const g = P.gape(Math.min(s, c)) * (sec.top / Math.max(1e-4, P.top(Math.max(s, 0.6 * spec.snoutCap))));
    const dy = y - g;
    const along = smooth(0, 0.006, s) * (1 - smooth(c - 0.002, c + 0.008, s));
    const lips = r.lips ?? 1;
    out.h += side * along * lips * (0.0003 * g2(Math.abs(dy) - 0.0026, 0.0016) - 0.0005 * g2(dy, 0.0011));
    out.ao *= 1 - side * along * 0.45 * g2(dy, 0.0012);
    // the maxilla: a plate above the gape, a groove along its upper edge and round its rounded hind end
    const mxH = (r.maxilla ?? 0.016) * (0.45 + 0.55 * Math.min(1, s / c));
    if (mxH > 0) {
      const top = g + mxH;
      const inPlate = smooth(-0.001, 0.001, dy) * (1 - smooth(top - 0.001, top + 0.001, y)) * smooth(0.2 * c, 0.4 * c, s) * (1 - smooth(c + 0.004, c + 0.01, s));
      const grooveTop = g2(y - top, 0.0009) * smooth(0.25 * c, 0.45 * c, s) * (1 - smooth(c + 0.004, c + 0.011, s));
      const grooveBack = g2(s - (c + 0.0085), 0.0012) * smooth(g - 0.003, g, y) * (1 - smooth(top, top + 0.002, y));
      out.h += side * (0.0005 * inPlate - 0.0008 * (grooveTop + grooveBack));
      out.ao *= 1 - side * 0.12 * (grooveTop + grooveBack);
    }
  }
  // the orbit and the nostrils, about each eye on this side
  if (spec !== memoSpec || s !== memoS) {
    memoSpec = spec; memoS = s;
    spec.eyes.forEach((e, k) => { const pc = eyePhi(e, sec), c = sectionPoint(sec, pc, PT); MEMO[k] = { pc, x: c[0], y: c[1] }; });
  }
  for (let k = 0; k < spec.eyes.length; k++) {
    const e = spec.eyes[k];
    if (e.side && e.side !== sideSign) continue;
    // (measured across the skin: the eye's centre on this section, not only its height, so an eye on top of a flat
    // head is ringed round as one on a flank)
    const { pc, x: cx, y: cy } = MEMO[k];
    const x = sectionPoint(sec, phi, PX)[0] * sideSign;
    const across = Math.hypot(x - cx, y - cy) * ((phi < Math.PI ? phi : 2 * Math.PI - phi) <= pc ? 1 : -1);
    const d = Math.hypot(s - e.s, across) / e.r;
    if (d < 3) {
      const k = (r.orbit ?? 1) * e.r;
      out.h += side * 0.035 * k * g2(d - 1.3, 0.3);
      out.ao *= 1 - side * 0.1 * g2(d - 1.04, 0.12);
      for (const [ds, dyy] of [[-1.55, 0.35], [-2.15, 0.18]]) {
        const pit = g2(Math.hypot(s - (e.s + ds * e.r), across - dyy * e.r), 0.16 * e.r);
        out.h -= side * 0.03 * e.r * pit;
        out.ao *= 1 - side * 0.18 * pit;
      }
    }
  }
  // the preopercle's margin: a ridge with a fine groove behind it, curving down and forward
  if (y < oper.top * 0.85 && y > -oper.bot) {
    const hh = y >= 0 ? sec.top : sec.bot, v = y / Math.max(1e-4, hh);
    const pre = oper.s - (r.preDepth ?? 0.055) - 0.035 * Math.max(0, -v) ** 2 + 0.01 * v;
    const k = (r.pre ?? 1) * side;
    out.h += k * (0.0009 * g2(s - pre + 0.002, 0.0016) - 0.0007 * g2(s - pre - 0.0012, 0.0009));
    out.ao *= 1 - k * 0.12 * g2(s - pre - 0.0012, 0.0012);
    // the gill cover: proud of the body up to its free edge, the edge throwing a soft shadow back onto the shoulder
    const edge = oper.s - oper.sweep * v * v;
    // (fading out toward the top and bottom of the opening, where the membrane runs into the body)
    const plate = smooth(edge - 0.07, edge - 0.03, s) * (1 - smooth(edge - 0.0012, edge + 0.0006, s));
    const ends = 1 - 0.6 * smooth(0.45, 0.95, Math.abs(v));
    out.h += side * 0.001 * plate * ends;
    out.plate = Math.max(out.plate, side * plate);
    out.ao *= 1 - side * 0.16 * ends * (s > edge ? g2(s - edge - 0.002, 0.005) : 0);
  }
  return out;
}

/**
 * The head's larger forms, for the geometry (a factor on the section's half-width at (s, y)): the gill cover's convex
 * plate, the hollow under and behind the eye and the one in front of it above the jaw, the maxilla standing out of the
 * cheek, the lips' fullness along the gape. The relief above draws the fine lines on top of them.
 */
export function headWidth(spec: FishSpec, s: number, y: number, sec: Section): number {
  if (s > spec.oper.s + 0.02 || spec.flat) return 1;
  const r = spec.relief ?? {}, P = profilesOf(spec), m = spec.mouth, oper = spec.oper, e = spec.eyes[0];
  const hh = y >= 0 ? sec.top : sec.bot, v = y / Math.max(1e-4, hh);
  let k = 0;
  // the gill cover: a low dome over its plate
  k += 0.05 * g2(s - (oper.s - 0.035), 0.04) * g2(v + 0.05, 0.45);
  // under and behind the eye (the suborbital), in front of it above the jaw (the preorbital)
  k -= 0.035 * g2(s - (e.s + 1.2 * e.r), 2 * e.r) * g2(y - (e.y - 1.7 * e.r), 1.2 * e.r);
  k -= 0.03 * g2(s - (e.s - 1.9 * e.r), 1.3 * e.r) * g2(y - (e.y - 0.3 * e.r), 1.2 * e.r);
  // the maxilla out of the cheek, the lips along the gape
  if (s < m.corner + 0.01) {
    const g = P.gape(Math.min(s, m.corner)) * (sec.top / Math.max(1e-4, P.top(Math.max(s, 0.6 * spec.snoutCap))));
    const mxH = (r.maxilla ?? 0.016) * (0.45 + 0.55 * Math.min(1, s / m.corner));
    k += 0.03 * smooth(0.2 * m.corner, 0.5 * m.corner, s) * (1 - smooth(m.corner, m.corner + 0.01, s)) * g2(y - (g + 0.5 * mxH), 0.6 * mxH);
    k += 0.025 * (r.lips ?? 1) * smooth(0, 0.01, s) * (1 - smooth(m.corner - 0.004, m.corner + 0.004, s)) * g2(Math.abs(y - g) - 0.0025, 0.002);
  }
  return 1 + k;
}
