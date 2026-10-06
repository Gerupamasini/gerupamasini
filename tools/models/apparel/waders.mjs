// Chest waders (胴長) with bonded rubber boots, standing as if worn (built by
// tools/models/digging/build.mjs --set apparel). Root space: metres, +Y up, +Z the way the toes point,
// origin on the ground between the feet. Sized for a wearer of about 170 cm (boots 26.5 cm).
import { grid, sweep, m4, v3, MeshData, TAU, smooth, lerp } from '../nets/geom.mjs';
import { roundedBlock } from '../nets/parts.mjs';
import { perlin3 } from '../../lib/noise.mjs';

const part = (material, mesh, kg) => ({ material, mesh, kg });
/** piecewise-linear table lookup: rows [y, ...values] */
const table = (rows, y) => {
  if (y <= rows[0][0]) return rows[0].slice(1);
  for (let k = 1; k < rows.length; k++) if (y <= rows[k][0]) {
    const t = (y - rows[k - 1][0]) / (rows[k][0] - rows[k - 1][0]);
    return rows[k].slice(1).map((v, i) => lerp(rows[k - 1][i + 1], v, smooth(0, 1, t)));
  }
  return rows[rows.length - 1].slice(1);
};

// leg cross-section (half width x, half depth z, centre x offset magnitude) by height
// (the bottom tucks inside the boot shaft; the top is as wide as the hips so the legs cover the seat)
const LEG = [[0.22, 0.056, 0.064, 0.124], [0.3, 0.062, 0.072, 0.123], [0.4, 0.077, 0.086, 0.118], [0.5, 0.075, 0.081, 0.113], [0.62, 0.09, 0.096, 0.106], [0.76, 0.106, 0.114, 0.096], [0.86, 0.112, 0.124, 0.088], [0.96, 0.11, 0.122, 0.084]];
// torso: half width, half depth, front bulge
const TORSO = [[0.76, 0.16, 0.11, 0.0], [0.84, 0.186, 0.124, 0.0], [1.0, 0.176, 0.122, 0.006], [1.18, 0.182, 0.13, 0.016], [1.3, 0.178, 0.126, 0.014]];
const topY = (a) => 1.265 + 0.035 * Math.cos(a); // front higher than the back

/** fabric folds: horizontal creases at knee / ankle / waist plus slack */
function folds(x, y, z, seed, amp) {
  const n = perlin3(x * 9, y * 7, z * 9, seed);
  const crease = Math.sin(y * 70 + n * 3) * (0.5 + 0.5 * perlin3(x * 3, y * 2, z * 3, seed + 3));
  return amp * (0.6 * n + 0.4 * crease);
}

function leg(Q, side) {
  const nu = Q.clothU, nv = Q.clothV;
  const y0 = 0.22, y1 = 0.96;
  const g = grid({
    nu, nv, closedU: true, uvFn: 'arc', tile: [1, 1], flip: false,
    posFn: (i, j) => {
      const a = (i / nu) * TAU, y = y0 + ((y1 - y0) * j) / nv;
      const [rx, rz, cx] = table(LEG, y);
      const knee = Math.exp(-(((y - 0.5) / 0.06) ** 2));
      const env = (0.4 + 0.6 * Math.max(knee, Math.exp(-(((y - 0.36) / 0.04) ** 2)))) * smooth(0.3, 0.34, y);
      const zc = -0.01 * (1 - smooth(0.3, 0.45, y));
      const x = side * cx + Math.sin(a) * rx, z = zc + Math.cos(a) * rz + 0.012 * knee;
      const r = folds(x, y, z, side > 0 ? 11 : 17, 0.0055 * env);
      return [x + Math.sin(a) * r, y, z + Math.cos(a) * r];
    },
  });
  for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] /= 0.012; g.uv[i + 1] /= 0.012; }
  g.shade((p) => ({ dirt: 0.25 + 0.75 * smooth(0.7, 0.3, p[1]) }));
  return g;
}

function torso(Q) {
  const nu = Q.clothU * 2, nv = Q.clothV;
  const g = grid({
    nu, nv, closedU: true, uvFn: 'arc', tile: [1, 1], flip: false,
    posFn: (i, j) => {
      const a = (i / nu) * TAU, v = j / nv;
      const yTop = topY(a);
      // a rounded seat below the hips (the legs pass through it), straight sides up to the chest
      const yb = 0.76, yh = 0.84;
      const y = v < 0.15 ? lerp(yb, yh, v / 0.15) : lerp(yh, yTop, (v - 0.15) / 0.85);
      const seat = v < 0.15 ? Math.sqrt(1 - (1 - v / 0.15) ** 2) : 1;
      const [rx, rz, bulge] = table(TORSO, y);
      const belt = Math.exp(-(((y - 1.0) / 0.04) ** 2));
      let x = Math.sin(a) * rx * seat * (1 - 0.06 * belt), z = Math.cos(a) * rz * seat * (1 - 0.06 * belt) + bulge * Math.max(0, Math.cos(a));
      const r = folds(x, y, z, 23, 0.004 + 0.006 * belt) * seat;
      return [x + Math.sin(a) * r, y, z + Math.cos(a) * r];
    },
  });
  for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] /= 0.012; g.uv[i + 1] /= 0.012; }
  g.shade((p) => ({ dirt: 0.15 + 0.3 * smooth(0.95, 0.7, p[1]) }));
  return g;
}

/** a point on the torso surface (outside) at angle a and height y, pushed out by `off` */
function torsoPoint(a, y, off = 0) {
  const [rx, rz, bulge] = table(TORSO, y);
  const belt = Math.exp(-(((y - 1.0) / 0.04) ** 2));
  const x = Math.sin(a) * (rx * (1 - 0.06 * belt) + off), z = Math.cos(a) * (rz * (1 - 0.06 * belt) + off) + bulge * Math.max(0, Math.cos(a));
  return [x, y, z];
}

/** a flat strap (webbing) along a path; width w across, thickness th, the flat side facing `upFn` */
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

function boot(Q, side) {
  const x0 = side * 0.124;
  const m = new MeshData();
  // shaft: an elliptical tube from the ankle up to the calf, flared lip
  const shaft = grid({
    nu: Q.clothU, nv: 10, closedU: true, uvFn: 'arc', tile: [0.02, 0.02], flip: false,
    posFn: (i, j) => {
      const a = (i / Q.clothU) * TAU, y = 0.03 + (0.285 * j) / 10;
      const flare = 1 + 0.08 * smooth(0.27, 0.315, y);
      return [x0 + Math.sin(a) * 0.066 * flare, y, -0.008 + Math.cos(a) * 0.076 * flare];
    },
  });
  m.append(shaft);
  // a rolled lip gives the shaft top its rubber thickness
  const lip = [];
  for (let k = 0; k < Q.clothU; k++) { const a = (k / Q.clothU) * TAU; lip.push([x0 + Math.sin(a) * 0.066 * 1.08, 0.315, -0.008 + Math.cos(a) * 0.076 * 1.08]); }
  m.append(sweep(lip, [[0.003, 0], [0, 0.003], [-0.003, 0], [0, -0.003]].map(([px, py]) => [px, py]), { closed: true, up: [0, 1, 0], tile: [0.02, 0.02] }));
  // foot: superellipse sections from heel to toe on a flat bottom; the instep slopes down to a low toe
  const z0 = -0.072, z1 = 0.19, yb = 0.022;
  const nz = Math.round(Q.clothV / 3), na = Q.clothU;
  const foot = grid({
    nu: na, nv: nz, closedU: true, uvFn: 'arc', tile: [0.02, 0.02], flip: true,
    posFn: (i, j) => {
      const a = (i / na) * TAU, t = j / nz, z = lerp(z0, z1, t);
      const ends = Math.sqrt(Math.max(0, Math.min(1, t / 0.12))) * Math.sqrt(Math.max(0, Math.min(1, (1 - t) / 0.22)));
      const top = lerp(0.13, 0.058, smooth(0.25, 0.85, t));
      const w = 0.054 * (1 - 0.15 * smooth(0.55, 1, t)) * Math.max(0.01, Math.sqrt(ends));
      const full = (top - yb) / 2, e = Math.max(0.01, Math.sqrt(ends));
      const hh = full * e;
      // toward the toe the section closes on a point about a third of the way up: a rounded nose
      const cy = yb + full * e + (1 - e) * full * 0.6 * (t > 0.5 ? 1 : 0);
      const c = Math.cos(a), sn = Math.sin(a);
      const se = Math.pow(Math.pow(Math.abs(c), 2.4) + Math.pow(Math.abs(sn), 2.4), -1 / 2.4);
      return [x0 + sn * se * w, cy + c * se * hh, z];
    },
  });
  m.append(foot);
  m.shade(() => ({ dirt: 0.85 }));
  // lugged sole and heel
  const sole = roundedBlock(-0.088, 0.186, 0.056, 0.014, Q.lathe, 3.2, 0.006, (z) => 1 - 0.3 * smooth(0.06, 0.186, z));
  sole.transform(m4.translate(x0, 0.012, 0));
  sole.shade(() => ({ dirt: 1 }));
  return { upper: m, sole };
}

function waders(Q) {
  const parts = [];
  const shell = new MeshData().append(leg(Q, 1)).append(leg(Q, -1)).append(torso(Q));
  parts.push(part('wader_pvc', shell, 0.85));
  // the inside of the chest opening (darker lining) and a bound top edge
  const N = Q.clothU * 2;
  const lining = grid({
    nu: N, nv: 4, closedU: true, uvFn: 'arc', tile: [0.012, 0.012], flip: true,
    posFn: (i, j) => { const a = (i / N) * TAU; return torsoPoint(a, topY(a) - 0.12 * (1 - j / 4), -0.004); },
  });
  parts.push(part('wader_lining', lining, 0));
  const edge = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * TAU; edge.push(torsoPoint(a, topY(a), -0.002)); }
  parts.push(part('tape_black', sweep(edge, [[-0.0045, -0.006], [0.0045, -0.006], [0.0045, 0.003], [0, 0.0055], [-0.0045, 0.003]], { closed: true, up: [0, 1, 0], tile: [0.008, 0.008] }), 0.04));
  // knee reinforcement patches
  for (const sd of [1, -1]) {
    const pg = grid({
      nu: 10, nv: 8, closedU: false, uvFn: 'arc', tile: [0.012, 0.012], flip: false,
      posFn: (i, j) => {
        const a = -0.85 + (1.7 * i) / 10, y = 0.44 + (0.15 * j) / 8;
        const [rx, rz, cx] = table(LEG, y);
        const knee = Math.exp(-(((y - 0.5) / 0.06) ** 2));
        return [sd * cx + Math.sin(a) * (rx + 0.0035), y, Math.cos(a) * (rz + 0.0035) + 0.012 * knee];
      },
    });
    parts.push(part('wader_patch', pg, 0.05));
  }
  // chest pocket with a flap
  const pocket = (y0, y1, off, aw) => grid({
    nu: 10, nv: 6, closedU: false, uvFn: 'arc', tile: [0.012, 0.012], flip: false,
    posFn: (i, j) => torsoPoint(-aw + (2 * aw * i) / 10, y0 + ((y1 - y0) * j) / 6, off),
  });
  parts.push(part('wader_patch', pocket(1.06, 1.2, 0.006, 0.5).append(pocket(1.17, 1.215, 0.011, 0.53)), 0.05));
  // belt with a side-release buckle at the front
  const beltPath = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * TAU; beltPath.push(torsoPoint(a, 1.0, 0.004)); }
  parts.push(part('tape_black', strap(beltPath, 0.038, 0.003, (k) => v3.norm([Math.sin((k / N) * TAU), 0, Math.cos((k / N) * TAU)]), true), 0.08));
  const buckles = new MeshData();
  const bk = roundedBlock(-0.03, 0.03, 0.022, 0.006, Q.latheSmall, 3, 0.003);
  bk.transform(m4.chain(m4.translate(...torsoPoint(0, 1.0, 0.011)), m4.rotY(Math.PI / 2), m4.rotZ(Math.PI / 2)));
  buckles.append(bk);
  // suspenders: from the chest corners over the shoulders, crossing at the back
  for (const sd of [1, -1]) {
    const front = torsoPoint(sd * 0.55, topY(sd * 0.55) - 0.01, 0.004);
    const back = torsoPoint(Math.PI - sd * 0.5, topY(Math.PI) - 0.01, 0.004);
    const path = catmull([front, [sd * 0.11, 1.4, 0.11], [sd * 0.15, 1.5, 0.02], [sd * 0.12, 1.48, -0.08], [-sd * 0.02, 1.38, -0.13], back], Q.strapN);
    const upFn = (k) => {
      const p = path[Math.min(path.length - 1, k)];
      return v3.norm([p[0] * 0.8, Math.max(0, p[1] - 1.3) * 3, p[2]]);
    };
    parts.push(part('tape_black', strap(path, 0.035, 0.0025, upFn), 0.06));
    const sb = roundedBlock(-0.025, 0.025, 0.02, 0.005, Q.latheSmall, 3, 0.003);
    const at = path[Math.round(path.length * 0.12)];
    sb.transform(m4.chain(m4.translate(at[0], at[1], at[2] + 0.006), m4.rotX(-Math.PI / 2)));
    buckles.append(sb);
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
    materials: 'PVC コーティングのナイロン（オリーブ）、膝の補強当て、胸ポケットとフラップ、黒い縁取り、ゴムの長靴（底はラグパターン）を胴に接着、肩で交差するサスペンダーとバックル、腰のベルト',
  },
];
