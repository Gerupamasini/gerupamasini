// Gill slit: a thin dark-red sheet just under the skin along the free margin of the gill cover (both sides).  It stays on the body when the opercle plate lifts
// (breathing flare / strike), so the gap shows the gill chamber instead of the inside of the skin.  Pure data.
const lerp = (a, b, t) => a + (b - a) * t;

/** u of a margin polyline (top -> bottom, v decreasing) at height v */
function uAt(m, v) {
  if (v >= m[0][1]) return m[0][0];
  for (let i = 1; i < m.length; i++) if (v >= m[i][1]) { const t = (v - m[i - 1][1]) / (m[i][1] - m[i - 1][1] || -1e-9); return lerp(m[i - 1][0], m[i][0], t); }
  return m[m.length - 1][0];
}

export function buildGillSlit({ surface, head, nt = 28, nu = 5, inset = 0.0008 }) {
  const spec = head.spec; if (!spec.opercle) return null;
  const m = spec.opercle.margin, HLs = head.HLs, cap = surface.cap, TAU = Math.PI * 2;
  const vTop = m[0][1], vBot = m[m.length - 1][1];
  const positions = [], uvs = [], sAttr = [], aAttr = [], idx = [];
  for (const side of [1, -1]) {
    const base = positions.length / 3;                                  // vertex index of this side's first vertex
    for (let it = 0; it < nt; it++) {
      const tt = it / (nt - 1), v = lerp(vTop - 0.004, vBot + 0.004, tt), um = uAt(m, v);
      for (let ju = 0; ju < nu; ju++) {
        const du = lerp(-0.075, 0.012, ju / (nu - 1)), u = um + du, s = u * HLs - cap, y = head.y0 + v * head.HLm;
        const a = surface.alphaAtHeight(s, y), alpha = side > 0 ? a : TAU - a;
        const p = surface.point(s, alpha, -inset * (0.6 + 0.4 * (1 - ju / (nu - 1))));
        positions.push(p[0], p[1], p[2]); uvs.push(ju / (nu - 1), tt); sAttr.push(s); aAttr.push(alpha);
      }
    }
    for (let it = 0; it < nt - 1; it++) for (let ju = 0; ju < nu - 1; ju++) {
      const a = base + it * nu + ju, b = a + 1, d = a + nu, c = d + 1;       // (it: alpha direction, ju: s direction)
      if (side > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
  }
  return { positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), indices: Uint32Array.from(idx), attrs: { _S: Float32Array.from(sAttr), _ALPHA: Float32Array.from(aAttr) } };
}
