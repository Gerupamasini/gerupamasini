// Chest waders (胴長) with bonded rubber boots, standing as if worn (built by
// tools/models/digging/build.mjs --set apparel). Root space: metres, +Y up, +Z the way the toes point,
// origin on the ground between the feet. Sized for a wearer of about 170 cm (boots 26.5 cm).
//
// Waders are cut roomy: straight, baggy legs (no calf or knee shape), fabric that stacks in rings above
// the boots, drapes from the seat and gathers under the belt; taped seams down the legs; the left knee
// relaxed. Unworn suspenders hang down the back from their rear anchors.
import { grid, sweep, m4, v3, MeshData, TAU, smooth, lerp } from '../nets/geom.mjs';
import { roundedBlock } from '../nets/parts.mjs';
import { perlin3 } from '../../lib/noise.mjs';

const part = (material, mesh, kg) => ({ material, mesh, kg });
/** piecewise table lookup with smooth blending: rows [y, ...values] */
const table = (rows, y) => {
  if (y <= rows[0][0]) return rows[0].slice(1);
  for (let k = 1; k < rows.length; k++) if (y <= rows[k][0]) {
    const t = (y - rows[k - 1][0]) / (rows[k][0] - rows[k - 1][0]);
    return rows[k].slice(1).map((v, i) => lerp(rows[k - 1][i + 1], v, smooth(0, 1, t)));
  }
  return rows[rows.length - 1].slice(1);
};

/** smooth per-vertex normals from the faces (after displacing a mesh) */
function renormal(m) {
  const n = new Float64Array(m.pos.length);
  const P = m.pos;
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t] * 3, b = m.idx[t + 1] * 3, c = m.idx[t + 2] * 3;
    const f = v3.cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
    for (const k of [a, b, c]) { n[k] += f[0]; n[k + 1] += f[1]; n[k + 2] += f[2]; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    m.nrm[i] = n[i] / l; m.nrm[i + 1] = n[i + 1] / l; m.nrm[i + 2] = n[i + 2] / l;
  }
  return m;
}

// leg: half width x, half depth z, |centre x| by height. Roomy and nearly straight; the hem sits over the boot rim.
const LEG = [[0.285, 0.079, 0.088, 0.124], [0.34, 0.092, 0.1, 0.122], [0.45, 0.101, 0.107, 0.118], [0.6, 0.106, 0.112, 0.112], [0.75, 0.114, 0.12, 0.102], [0.86, 0.119, 0.127, 0.092], [0.96, 0.116, 0.125, 0.086]];
// torso: half width, half depth, front bulge
const TORSO = [[0.76, 0.17, 0.115, 0.0], [0.84, 0.2, 0.135, 0.0], [1.0, 0.19, 0.133, 0.008], [1.18, 0.194, 0.138, 0.02], [1.3, 0.19, 0.134, 0.018]];
const topY = (a) => 1.262 + 0.036 * Math.cos(a) + 0.006 * Math.sin(3 * a + 0.7); // front higher than the back, a little wavy
const BELT_Y = 1.0;

/** a leg's surface radius offset (fabric folds) at angle a, height y */
function legFold(a, y, side) {
  const s = side > 0 ? 11 : 29;
  const ca = Math.cos(a), sa = Math.sin(a);
  // broad slack bulges
  let d = 0.007 * perlin3(ca * 1.6, y * 4.5, sa * 1.6, s);
  // fabric stacked in rings above the boot, strongest at the front and sides
  const stack = smooth(0.29, 0.31, y) * (1 - smooth(0.36, 0.47, y));
  d += stack * 0.006 * Math.sin(y * (120 + 40 * perlin3(ca, 0.3, sa, s + 5)) + 4 * perlin3(ca * 2.5, y * 9, sa * 2.5, s + 1)) * (0.4 + 0.6 * Math.max(0, ca)) * (0.6 + 0.4 * perlin3(ca * 3, y * 12, sa * 3, s + 6));
  // creases behind the knee and a few diagonal ones across the shin
  const knee = Math.exp(-(((y - 0.5) / 0.07) ** 2));
  d += knee * 0.006 * Math.sin(y * 95 + a * 1.5 * side + 3 * perlin3(ca, y * 3, sa, s + 2)) * (0.5 + 0.5 * Math.max(0, -ca));
  // drape hanging from the seat at the back of the thighs
  const seat = smooth(0.62, 0.86, y) * Math.max(0, -ca);
  d += seat * 0.006 * Math.sin(a * 7 + 2 * perlin3(ca, y * 5, sa, s + 3));
  return d;
}

function leg(Q, side) {
  const nu = Q.clothU, nv = Q.clothV;
  const y0 = 0.285, y1 = 0.96;
  // the left knee is relaxed a little forward
  const bend = side < 0 ? 0.022 : 0.006;
  const g = grid({
    nu, nv, closedU: true, uvFn: 'arc', tile: [1, 1], flip: false,
    posFn: (i, j) => {
      const a = (i / nu) * TAU, y = y0 + ((y1 - y0) * j) / nv;
      const [rx, rz, cx] = table(LEG, y);
      const zc = bend * Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 0.3) / 0.6))) - 0.008 * (1 - smooth(0.3, 0.42, y));
      const r = legFold(a, y, side);
      return [side * cx + Math.sin(a) * (rx + r), y, zc + Math.cos(a) * (rz + r)];
    },
  });
  for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] /= 0.02; g.uv[i + 1] /= 0.02; }
  g.shade((p) => ({ dirt: 0.25 + 0.75 * smooth(0.75, 0.3, p[1]) }));
  return g;
}

/** taped seam strip along a leg (inside or outside) */
function legSeam(Q, side, inner) {
  const a0 = inner ? -side * Math.PI / 2 : side * Math.PI / 2;
  const bend = side < 0 ? 0.022 : 0.006;
  const nv = Q.clothV;
  return grid({
    nu: 2, nv, closedU: false, uvFn: 'arc', tile: [0.02, 0.02], flip: false,
    posFn: (i, j) => {
      const y = 0.29 + ((inner ? 0.79 : 0.95) - 0.29) * (j / nv);
      const a = a0 + (i - 1) * 0.045;
      const [rx, rz, cx] = table(LEG, y);
      const zc = bend * Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 0.3) / 0.6))) - 0.008 * (1 - smooth(0.3, 0.42, y));
      const r = legFold(a, y, side) + 0.0012 * (1 - Math.abs(i - 1) * 0.5);
      return [side * cx + Math.sin(a) * (rx + r), y, zc + Math.cos(a) * (rz + r)];
    },
  });
}

function torsoFold(a, y) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const belt = Math.exp(-(((y - BELT_Y) / 0.07) ** 2));
  // fabric gathered by the belt: tight vertical pleats just above and below it
  let d = belt * 0.008 * Math.sin(a * 23 + 3 * perlin3(ca * 2, y * 8, sa * 2, 41)) * (1 - Math.exp(-(((y - BELT_Y) / 0.022) ** 2)));
  d += 0.006 * perlin3(ca * 1.4, y * 4, sa * 1.4, 43);
  // horizontal sag under the chest where the panel hangs from the suspender anchors
  d += 0.003 * Math.sin(y * 60 + 2 * perlin3(ca, y * 4, sa, 44)) * smooth(1.06, 1.18, y) * (1 - smooth(1.18, 1.26, y));
  return d;
}

function torsoPoint(a, y, off = 0) {
  const [rx, rz, bulge] = table(TORSO, y);
  const belt = Math.exp(-(((y - BELT_Y) / 0.035) ** 2));
  const r = torsoFold(a, y) + off;
  const x = Math.sin(a) * (rx * (1 - 0.09 * belt) + r), z = Math.cos(a) * (rz * (1 - 0.09 * belt) + r) + bulge * Math.max(0, Math.cos(a));
  return [x, y, z];
}

function torso(Q) {
  const nu = Q.clothU * 2, nv = Q.clothV;
  const g = grid({
    nu, nv, closedU: true, uvFn: 'arc', tile: [1, 1], flip: false,
    posFn: (i, j) => {
      const a = (i / nu) * TAU, v = j / nv;
      const yTop = topY(a);
      const yb = 0.76, yh = 0.84;
      const y = v < 0.15 ? lerp(yb, yh, v / 0.15) : lerp(yh, yTop, (v - 0.15) / 0.85);
      const seat = v < 0.15 ? Math.sqrt(1 - (1 - v / 0.15) ** 2) : 1;
      const p = torsoPoint(a, y);
      return [p[0] * seat, y, p[2] * seat];
    },
  });
  for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] /= 0.02; g.uv[i + 1] /= 0.02; }
  g.shade((p) => ({ dirt: 0.15 + 0.3 * smooth(0.95, 0.7, p[1]) }));
  return g;
}

/** a flat strap (webbing) along a path; width w across, thickness th, flat side facing upFn(k) */
function strap(path, w, th, upFn, closed = false) {
  const prof = [[-w / 2, -th / 2], [w / 2, -th / 2], [w / 2, th / 2], [-w / 2, th / 2]];
  return sweep(path, prof, { closed, upFn, tile: [0.02, 0.02], capEnds: !closed });
}

function catmull(pts, n) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const f = (k / n) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t2 = t * t, t3 = t2 * t;
    out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
  }
  return out;
}

/** rubber boot: shaft with flex creases at the ankle, a foot last with a domed toe and heel counter, lugged sole */
function boot(Q, side) {
  const x0 = side * 0.124;
  const turn = m4.chain(m4.translate(x0, 0, 0), m4.rotY(side * 0.12), m4.translate(-x0, 0, 0)); // toes out a little
  const upper = new MeshData();
  const shaft = grid({
    nu: Q.clothU, nv: 14, closedU: true, uvFn: 'arc', tile: [0.02, 0.02], flip: true,
    posFn: (i, j) => {
      const a = (i / Q.clothU) * TAU, y = 0.035 + (0.27 * j) / 14;
      const ca = Math.cos(a), sa = Math.sin(a);
      const flare = 1 + 0.06 * smooth(0.26, 0.305, y) - 0.05 * Math.exp(-(((y - 0.12) / 0.04) ** 2));
      // rubber creases across the front of the ankle
      const crease = Math.exp(-(((y - 0.115) / 0.03) ** 2)) * Math.max(0, ca) * 0.0025 * Math.sin(y * 260 + sa * 2);
      // the front of the shaft sweeps forward into the instep
      const instep = Math.max(0, ca) ** 1.5 * 0.035 * (1 - smooth(0.035, 0.16, y));
      return [x0 + sa * (0.067 * flare + crease), y, -0.012 + ca * (0.077 * flare + crease) + instep];
    },
  });
  upper.append(shaft);
  // foot: sections along z on a flat bottom; the toe closes as a dome about mid-height, the heel is hidden in the shaft
  const z0 = -0.07, z1 = 0.19, yb = 0.022, nz = Math.round(Q.clothV / 2.5), na = Q.clothU;
  const foot = grid({
    nu: na, nv: nz, closedU: true, uvFn: 'arc', tile: [0.02, 0.02], flip: true,
    posFn: (i, j) => {
      const a = (i / na) * TAU, t = j / nz, z = lerp(z0, z1, t);
      const top = lerp(0.15, 0.072, smooth(0.25, 0.85, t));
      const full = (top - yb) / 2, w0 = 0.056 * (1 - 0.12 * smooth(0.55, 0.9, t));
      // spherical toe cap over the last 22 %
      const tc = Math.max(0, (t - 0.78) / 0.22);
      const cap = Math.sqrt(Math.max(0.0004, 1 - tc * tc));
      const cy = yb + full + tc * tc * 0.006; // a little toe spring
      const c = Math.cos(a), sn = Math.sin(a);
      const se = Math.pow(Math.pow(Math.abs(c), 2.3) + Math.pow(Math.abs(sn), 2.3), -1 / 2.3);
      return [x0 + sn * se * w0 * cap, cy + c * se * full * cap, z];
    },
  });
  upper.append(foot);
  // rolled lip at the shaft top (under the wader hem)
  const lip = [];
  for (let k = 0; k < Q.clothU; k++) { const a = (k / Q.clothU) * TAU; lip.push([x0 + Math.sin(a) * 0.071, 0.305, -0.012 + Math.cos(a) * 0.0816]); }
  upper.append(sweep(lip, [[0.003, 0], [0, 0.003], [-0.003, 0], [0, -0.003]], { closed: true, up: [0, 1, 0], tile: [0.02, 0.02] }));
  upper.transform(turn);
  upper.shade((p) => ({ dirt: 0.55 + 0.45 * smooth(0.3, 0.02, p[1]) }));
  // sole: a slab with chunky lugs stepping out along its lower edge
  const sole = roundedBlock(-0.085, 0.19, 0.058, 0.0145, Q.lathe, 3.4, 0.006, (z) => 1 - 0.22 * smooth(0.08, 0.19, z));
  for (let i = 0; i < sole.pos.length; i += 3) {
    const y = sole.pos[i + 1], z = sole.pos[i + 2];
    if (y < -0.002) {
      const lug = Math.sin(z * 170) > 0 ? 1 : 0;
      sole.pos[i] *= 1 + 0.06 * lug;
      sole.pos[i + 1] -= 0.002 * lug;
    }
  }
  renormal(sole);
  sole.transform(m4.chain(turn, m4.translate(x0, 0.0145, 0)));
  sole.shade(() => ({ dirt: 1 }));
  return { upper, sole };
}

function waders(Q) {
  const parts = [];
  const shell = new MeshData().append(leg(Q, 1)).append(leg(Q, -1)).append(torso(Q));
  // mottled wear: a faint large-scale variation in the baked occlusion so the coating is not uniform
  shell.shade((p) => ({ ao: 0.9 + 0.1 * (0.5 + 0.5 * perlin3(p[0] * 6, p[1] * 6, p[2] * 6, 77)) }));
  parts.push(part('wader_pvc', shell, 0.85));
  // seam tape down the legs and the hem bonded over the boot rims
  const seams = new MeshData();
  for (const sd of [1, -1]) for (const inner of [true, false]) seams.append(legSeam(Q, sd, inner));
  for (const sd of [1, -1]) {
    const hem = [];
    for (let k = 0; k < Q.clothU; k++) {
      const a = (k / Q.clothU) * TAU, y = 0.29;
      const [rx, rz, cx] = table(LEG, y);
      hem.push([sd * cx + Math.sin(a) * (rx + 0.001), y, -0.008 + Math.cos(a) * (rz + 0.001)]);
    }
    seams.append(sweep(hem, [[0.0015, -0.012], [0.0015, 0.012], [-0.001, 0.012], [-0.001, -0.012]], { closed: true, up: [0, 1, 0], tile: [0.02, 0.02] }));
  }
  parts.push(part('wader_patch', seams, 0.04));
  // the inside of the chest opening (darker lining) and a bound top edge
  const N = Q.clothU * 2;
  const lining = grid({
    nu: N, nv: 4, closedU: true, uvFn: 'arc', tile: [0.02, 0.02], flip: true,
    posFn: (i, j) => { const a = (i / N) * TAU; return torsoPoint(a, topY(a) - 0.12 * (1 - j / 4), -0.004); },
  });
  parts.push(part('wader_lining', lining, 0));
  const edge = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * TAU; edge.push(torsoPoint(a, topY(a), -0.002)); }
  parts.push(part('tape_black', sweep(edge, [[-0.0045, -0.006], [0.0045, -0.006], [0.0045, 0.003], [0, 0.0055], [-0.0045, 0.003]], { closed: true, up: [0, 1, 0], tile: [0.008, 0.008] }), 0.04));
  // knee reinforcement patches (following the folds)
  for (const sd of [1, -1]) {
    const bend = sd < 0 ? 0.022 : 0.006;
    const pg = grid({
      nu: 10, nv: 10, closedU: false, uvFn: 'arc', tile: [0.012, 0.012], flip: false,
      posFn: (i, j) => {
        const a = -0.85 + (1.7 * i) / 10, y = 0.43 + (0.16 * j) / 10;
        const [rx, rz, cx] = table(LEG, y);
        const zc = bend * Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 0.3) / 0.6)));
        const r = legFold(a, y, sd) + 0.0025;
        return [sd * cx + Math.sin(a) * (rx + r), y, zc + Math.cos(a) * (rz + r)];
      },
    });
    parts.push(part('wader_patch', pg, 0.05));
  }
  // chest pocket with a flap
  const pocket = (y0, y1, off, aw) => grid({
    nu: 10, nv: 6, closedU: false, uvFn: 'arc', tile: [0.012, 0.012], flip: false,
    posFn: (i, j) => torsoPoint(-aw + (2 * aw * i) / 10, y0 + ((y1 - y0) * j) / 6, off),
  });
  parts.push(part('wader_patch', pocket(1.07, 1.2, 0.005, 0.48).append(pocket(1.17, 1.215, 0.01, 0.51)), 0.05));
  // belt with a side-release buckle at the front
  const beltPath = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * TAU; const p = torsoPoint(a, BELT_Y, 0.004); beltPath.push(p); }
  // the belt rides on the gathered fabric: take the radius from the fold peaks, not the valleys
  for (let i = 0; i < N; i++) { const a = (i / N) * TAU; const n = v3.norm([Math.sin(a), 0, Math.cos(a)]); beltPath[i] = v3.add(beltPath[i], v3.mul(n, 0.008 - torsoFold(a, BELT_Y))); }
  parts.push(part('tape_black', strap(beltPath, 0.038, 0.003, (k) => v3.norm([Math.sin((k / N) * TAU), 0, Math.cos((k / N) * TAU)]), true), 0.08));
  const buckles = new MeshData();
  const bk = roundedBlock(-0.03, 0.03, 0.022, 0.006, Q.latheSmall, 3, 0.003);
  bk.transform(m4.chain(m4.translate(...v3.add(beltPath[0], [0, 0, 0.007])), m4.rotY(Math.PI / 2), m4.rotZ(Math.PI / 2)));
  buckles.append(bk);
  // suspenders, unbuckled: buckle halves stay at the front corners, the straps hang down the back
  for (const sd of [1, -1]) {
    const fa = sd * 0.55;
    const fp = torsoPoint(fa, topY(fa) - 0.025, 0.006);
    const fb = roundedBlock(-0.022, 0.022, 0.019, 0.005, Q.latheSmall, 3, 0.003);
    fb.transform(m4.chain(m4.translate(...fp), m4.rotY(fa), m4.rotX(-Math.PI / 2)));
    buckles.append(fb);
    // rear anchor near the top edge, crossing behind, hanging down the back with a slight sway
    const ba = Math.PI - sd * 0.35;
    const pts = [];
    const steps = 6;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const y = lerp(topY(ba) + 0.012, 0.86, t);
      const a = Math.PI - sd * 0.35 * (1 - t) + sd * 0.25 * t + 0.05 * Math.sin(t * 5 + sd);
      const p = torsoPoint(a, y, 0.006 + 0.01 * Math.sin(Math.PI * t));
      pts.push(p);
    }
    pts.unshift(v3.add(torsoPoint(ba, topY(ba) - 0.02, 0.004), [0, 0.0, 0]));
    const path = catmull(pts, Q.strapN);
    const upFn = (k) => { const p = path[Math.min(path.length - 1, k)]; return v3.norm([p[0], 0, p[2]]); };
    parts.push(part('tape_black', strap(path, 0.035, 0.0025, upFn), 0.06));
    const end = path[path.length - 1], dir = v3.norm(v3.sub(end, path[path.length - 3]));
    const tongue = roundedBlock(-0.02, 0.02, 0.017, 0.0045, Q.latheSmall, 3, 0.003);
    const ang = Math.atan2(end[0], end[2]);
    tongue.transform(m4.chain(m4.translate(...v3.add(end, v3.mul(dir, 0.012))), m4.rotY(ang), m4.rotX(-Math.PI / 2)));
    buckles.append(tongue);
  }
  parts.push(part('plastic_black', buckles, 0.04));
  for (const sd of [1, -1]) {
    const b = boot(Q, sd);
    parts.push(part('rubber_boot', b.upper, 0.38), part('rubber_black', b.sole, 0.16));
  }
  return {
    parts,
    nodes: {
      Hips: [0, 0.9, 0],
      Chest_Top: [0, 1.3, 0.13],
      Foot_L: [-0.124, 0, 0.05],
      Foot_R: [0.124, 0, 0.05],
    },
  };
}

export const APPAREL = [
  {
    id: 'wear_waders', ja: '胴長', en: 'Chest waders', build: waders, use: '干潟・浅瀬での移動',
    spec: { total_cm: 150, boot_cm: 26.5, chest_cm: 130, mass_g: 2400 },
    materials: 'PVC コーティングのナイロン（オリーブ、ゆとりのある裁断で足首にたまるしわ、ベルト下のギャザー）、脚の内外のシームテープ、膝の補強当て、胸ポケットとフラップ、内側の裏地と黒い縁取り、腰のベルトとバックル、外したサスペンダー（背中に垂れる）、ゴム長靴（足首のしわ、丸いつま先、ラグ付きの靴底）を接着',
  },
];
