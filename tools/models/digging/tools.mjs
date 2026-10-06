// The four digging tools of 干潟図鑑. Each builder returns
//   { parts: [{ material, mesh, kg }], nodes: { Grip_Main, Grip_Support, Tip, Blade_Center } (root
//   positions), marks: [cm, ...] }
// in root space: metres, +Y up (the working face of a blade looks up), +Z from the grip toward the
// working end, origin at the centre of the dominant-hand grip.
import { lathe, sweep, circleProfile, bezier, m4, v3, MeshData, pathLength, TAU, smooth, clamp } from '../nets/geom.mjs';
import { pipeProfile, sampled, foamGrip, knurl, ribs, latheAlong, roundedBlock } from '../nets/parts.mjs';
import { bladeShell, splitTriangles, marks } from './blade.mjs';
import { hash01 } from '../../lib/noise.mjs';

const RHO = { stainless: 7930, steel: 7850, beech: 720, ash: 650, pp: 910, tpr: 1150, brass: 8500 };
const part = (material, mesh, kg) => ({ material, mesh, kg });
const shellKg = (m, thick, rho) => {
  // area of the top face (first half of the shell's faces) x thickness
  let a = 0;
  const P = m.pos;
  for (let t = 0; t < m.idx.length; t += 3) {
    const i = m.idx[t] * 3, j = m.idx[t + 1] * 3, k = m.idx[t + 2] * 3;
    a += v3.len(v3.cross([P[j] - P[i], P[j + 1] - P[i + 1], P[j + 2] - P[i + 2]], [P[k] - P[i], P[k + 1] - P[i + 1], P[k + 2] - P[i + 2]])) / 2;
  }
  return (a / 2) * thick * rho;
};

/** closed Catmull-Rom loop through control points, n samples */
function catmullLoop(pts, n) {
  const out = [];
  const N = pts.length;
  for (let k = 0; k < n; k++) {
    const f = (k / n) * N, i = Math.floor(f), t = f - i;
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i % N], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    const t2 = t * t, t3 = t2 * t;
    out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
  }
  return out;
}

/** a small domed rivet head sitting on a surface point, facing n */
function rivet(Q, p, n, r) {
  return latheAlong(sampled(0, r * 0.55, 4, (z, t) => r * Math.sqrt(Math.max(0, 1 - t * t)) + 1e-5).concat([[r * 0.55, 0]]), Q.latheSmall, v3.sub(p, v3.mul(n, r * 0.1)), n, { tile: [0.02, 0.02] });
}

/** trowel blade: a pointed scoop. y0 = height of the blade face below the handle axis */
function trowelBlade({ W, L, zHeel, y0, dish, thick }) {
  // rounded shoulders at the heel, widest at 30 %, then a pointed oval to the tip
  const hw = (t) => (W / 2) * (t < 0.3 ? 0.42 + 0.58 * Math.pow(Math.sin((t / 0.3) * Math.PI / 2), 0.55) : Math.pow(Math.max(0, Math.cos(((t - 0.3) / 0.7) * Math.PI / 2)), 0.72));
  const surf = (s, t) => {
    const h = hw(t);
    const d = dish * W * (1 - 0.6 * t) * Math.pow(Math.abs(s), 1.8) * (h / (W / 2));
    return [s * h, y0 + d + 0.03 * L * t * t, zHeel + t * L];
  };
  return { surf, hw };
}

/** depth marks every cm from the tip (longer every 5 cm), up to maxCm */
function depthMarks(L, maxCm) {
  const list = [], cms = [];
  for (let cm = 1; cm <= maxCm && cm / 100 < L * 0.97; cm++) {
    const t = 1 - cm / 100 / L;
    const long = cm % 5 === 0;
    list.push({ t, s0: -0.82, s1: long ? -0.3 : -0.55 });
    cms.push(cm);
  }
  return { list, cms };
}

// ---------------------------------------------------------------- 1. ミニスコップ
function miniTrowel(Q) {
  const W = 0.07, L = 0.12, thick = 0.0012, zHeel = 0.085, y0 = -0.012;
  const { surf } = trowelBlade({ W, L, zHeel, y0, dish: 0.26, thick });
  const { mesh: blade } = bladeShell(surf, { nu: Q.bladeU, nv: Q.bladeV, thick, tile: [0.03, 0.03] });
  blade.shade((p) => ({ dirt: 0.35 + 0.65 * smooth(zHeel + 0.02, zHeel + L, p[2]) }));
  const parts = [part('stainless', blade, shellKg(blade, thick, RHO.stainless))];
  // the blade heel is pressed into a short tang that runs into the handle
  const tangPath = bezier([0, 0, 0.045], [0, 0, 0.075], [0, y0 - 0.002, zHeel - 0.012], [0, y0 - 0.0015, zHeel + 0.02], 14);
  const tang = sweep(tangPath, circleProfile(0.0042, Q.wireSegs, 0.0026), { up: [0, 1, 0], tile: [0.02, 0.03], capEnds: true });
  parts.push(part('stainless', tang, pathLength(tangPath) * Math.PI * 0.0042 * 0.0026 * RHO.stainless));
  // moulded PP handle with a soft TPR panel and a hanging hole boss
  const zB = -0.075, zF = 0.075;
  const handle = lathe(sampled(zB, zF, Q.steps * 2, (z, t) => {
    const end = Math.sqrt(clamp(t / 0.06)) * Math.sqrt(clamp((1 - t) / 0.05));
    return (0.0118 + 0.0022 * Math.sin(Math.PI * t * 0.9) - 0.0015 * smooth(0.75, 1, t)) * (0.35 + 0.65 * end);
  }), Q.lathe, { rMod: (a, z, r) => r * (1 - 0.12 * Math.abs(Math.sin(a))), tile: [0.02, 0.02] });
  parts.push(part('pp_green', handle, handle.volume() * RHO.pp * 0.75));
  const grip = lathe(sampled(-0.045, 0.045, Q.steps, (z, t) => 0.0125 + 0.0016 * Math.sin(Math.PI * t * 0.9) + 0.0006 * Math.sin(Math.PI * t)), Q.lathe, { rMod: (a, z, r) => r * (1 - 0.12 * Math.abs(Math.sin(a))), tile: [0.012, 0.012] });
  parts.push(part('tpr_gray', grip, 0.012));
  if (Q.detail < 2) {
    const m = depthMarks(L, 12);
    parts.push(part('engrave', marks(surf, m.list), 0));
  }
  return { parts, nodes: { Grip_Main: [0, 0, 0], Grip_Support: [0, 0, 0.03], Tip: surf(0, 1), Blade_Center: surf(0, 0.45) }, butt: zB };
}

// ---------------------------------------------------------------- 2. スコップ（移植ごて）
function trowel(Q) {
  const W = 0.1, L = 0.18, thick = 0.0013, zHeel = 0.136, y0 = -0.03;
  const { surf } = trowelBlade({ W, L, zHeel, y0, dish: 0.24, thick });
  const { mesh: blade } = bladeShell(surf, { nu: Q.bladeU, nv: Q.bladeV, thick, tile: [0.03, 0.03] });
  blade.shade((p) => ({ dirt: 0.35 + 0.65 * smooth(zHeel + 0.03, zHeel + L, p[2]) }));
  const parts = [part('stainless', blade, shellKg(blade, thick, RHO.stainless))];
  // cranked neck (goose neck) from the ferrule down to a plate riveted under the blade
  const zF = 0.13;
  const neckPath = bezier([0, 0, zF - 0.02], [0, 0, zF + 0.022], [0, y0 - 0.006, zHeel - 0.03], [0, y0 - 0.0045, zHeel + 0.012], 22);
  const neck = sweep(neckPath, circleProfile(0.0042, Q.wireSegs), { up: [0, 1, 0], tile: [0.026, 0.03], capEnds: true });
  const plate = roundedBlock(zHeel - 0.004, zHeel + 0.06, 0.009, 0.0022, Q.latheSmall, 2.4, 0.0008, (z) => 1 - 0.55 * smooth(zHeel + 0.02, zHeel + 0.06, z));
  plate.transform(m4.translate(0, y0 - thick - 0.0022, 0));
  parts.push(part('stainless', neck.append(plate), pathLength(neckPath) * Math.PI * 0.0042 ** 2 * RHO.stainless + 0.012));
  if (Q.detail < 2) {
    const heads = new MeshData();
    for (const t of [0.07, 0.24]) heads.append(rivet(Q, surf(0, t), [0, 1, 0], 0.0028));
    parts.push(part('stainless_polished', heads, 0.002));
  }
  // ash handle with a brass ferrule
  const zB = -0.12;
  const wood = lathe(sampled(zB, zF - 0.002, Q.steps * 2, (z, t) => {
    const dome = Math.sqrt(clamp(t / 0.035));
    return (0.0148 + 0.0018 * Math.sin(Math.PI * Math.min(1, t * 1.15)) - 0.0028 * smooth(0.82, 1, t)) * (0.4 + 0.6 * dome);
  }), Q.lathe, { tile: [0.07, 0.14] });
  parts.push(part('wood_varnish', wood, wood.volume() * RHO.ash));
  const fer = lathe(pipeProfile(zF - 0.03, zF + 0.002, 0.0128, 0.0008), Q.lathe, { tile: [0.03, 0.03] });
  parts.push(part('brass', fer, Math.PI * (0.0128 ** 2 - 0.0118 ** 2) * 0.032 * RHO.brass));
  if (Q.detail < 2) {
    const m = depthMarks(L, 20);
    parts.push(part('engrave', marks(surf, m.list), 0));
  }
  return { parts, nodes: { Grip_Main: [0, 0, 0], Grip_Support: [0, 0, 0.07], Tip: surf(0, 1), Blade_Center: surf(0, 0.45) }, butt: zB };
}

// ---------------------------------------------------------------- 3. シャベル（剣先）
function shovel(Q) {
  const W = 0.25, L = 0.3, thick = 0.0012, lift = 0.26;
  const zTop = 0.74; // blade top edge (where the socket ends)
  const yTop = 0.019; // the face runs in front of the socket axis; socket and frog sit behind it
  const hw = (t) => (W / 2) * (t < 0.42 ? 1 - 0.03 * t : Math.pow(Math.max(0, Math.cos(((t - 0.42) / 0.58) * Math.PI / 2)), 0.62));
  const ca = Math.cos(lift), sa = Math.sin(lift);
  const surf = (s, t) => {
    const h = hw(t);
    const u = t * L;
    const dish = 0.02 * s * s * (1 - 0.5 * t) + 0.006 * Math.sin(Math.PI * t);
    // blade plane rises toward the tip by the lift angle (so it lies flat when the shaft is raised)
    return [s * h, yTop + dish + u * sa, zTop + u * ca];
  };
  const { mesh, st } = bladeShell(surf, { nu: Q.bladeU, nv: Q.bladeV, thick, tile: [0.04, 0.04] });
  mesh.shade((p) => ({ dirt: 0.3 + 0.7 * smooth(zTop + 0.05, zTop + L, p[2]) }));
  // paint worn back to bare steel along the cutting edges toward the point
  const worn = (v) => {
    const [s, t] = st[v];
    const lateral = (1 - Math.abs(s)) * hw(t);
    const band = (0.003 + 0.014 * smooth(0.3, 1, t)) * (0.7 + 0.6 * hash01(Math.round(s * 40), Math.round(t * 60), 3));
    return lateral < band && t > 0.25;
  };
  const [paint, bare] = splitTriangles(mesh, (tri) => tri.filter(worn).length >= 2);
  const bladeKg = shellKg(mesh, thick, RHO.steel);
  const parts = [part('steel_black', paint, bladeKg * 0.85), part('steel_bare', bare, bladeKg * 0.15)];
  // rolled foot treads along the top edge either side of the socket
  for (const sg of [-1, 1]) {
    const path = [];
    for (let k = 0; k <= 10; k++) { const s = sg * (0.2 + 0.78 * (k / 10)); const p = surf(s, 0.004); path.push([p[0], p[1] + 0.004, p[2] - 0.002]); }
    const tread = sweep(sg > 0 ? path : path.reverse(), circleProfile(0.0055, Q.wireSegs, 0.0048), { up: [0, 0, 1], tile: [0.03, 0.04], capEnds: true });
    parts.push(part('steel_black', tread, pathLength(path) * 0.012 * thick * RHO.steel));
  }
  // closed-back socket and the frog (ridge pressed into the back of the blade)
  const zS0 = 0.58, rS = 0.0195;
  const sockProf = sampled(zS0, zTop + 0.012, Q.steps, (z, t) => rS * (0.93 + 0.07 * t) + 0.0012 * smooth(0, 0.05, t));
  const socket = lathe([[zS0, 0.0172], [zS0, 0.0172], ...sockProf, [zTop + 0.012, 0.004], [zTop + 0.012, 0.004], [zTop + 0.012, 0]], Q.lathe, { tile: [0.04, 0.04] });
  const frog = lathe(sampled(0, 1, Q.steps, (u, t) => 0.019 * Math.pow(1 - t, 0.9) + 0.0008), Q.latheSmall * 2, {
    rMod: (a, z, r) => (Math.sin(a) > 0 ? r * 0.2 : r),
    tile: [0.04, 0.04],
  });
  // frog local z (0..1) -> along the blade from the top edge to ~40 % of its length, under the face
  frog.transform(m4.chain(m4.translate(0, yTop - thick, zTop - 0.004), m4.rotX(-lift), m4.scale(1, 0.9, L * 0.42)));
  parts.push(part('steel_black', socket.append(frog), Math.PI * (rS ** 2 - 0.0175 ** 2) * (zTop - zS0) * RHO.steel + 0.06));
  if (Q.detail < 2) {
    const heads = new MeshData();
    for (const z of [zS0 + 0.03, zS0 + 0.1]) heads.append(rivet(Q, [0, rS * 0.98, z], [0, 1, 0], 0.0038));
    parts.push(part('steel_black', heads, 0.006));
  }
  // ash shaft, varnished
  const rShaft = 0.016;
  const shaft = lathe(pipeProfile(0.09, zS0 + 0.1, rShaft, 0.0015), Q.lathe, { tile: [0.07, 0.14] });
  parts.push(part('wood_varnish', shaft, Math.PI * rShaft ** 2 * (zS0 + 0.1 - 0.09) * RHO.ash));
  // polypropylene D grip: a collar on the shaft and the D loop (crossbar centred on the origin)
  const collar = lathe(sampled(0.082, 0.162, Q.steps, (z, t) => 0.0205 - 0.0025 * t + 0.0012 * Math.exp(-(((t - 0.08) / 0.06) ** 2))), Q.lathe, { rMod: ribs(16, 0.0006, 0.112, 0.152), tile: [0.02, 0.02] });
  const ctrl = [[0.0, 0, 0.115], [-0.03, 0, 0.098], [-0.056, 0, 0.05], [-0.058, 0, 0.004], [-0.03, 0, -0.012], [0.0, 0, -0.013], [0.03, 0, -0.012], [0.058, 0, 0.004], [0.056, 0, 0.05], [0.03, 0, 0.098]].map(([x, y, z]) => [x, y, z + 0.013]);
  const dPath = catmullLoop(ctrl, Q.hoopN);
  const dLoop = sweep(dPath, circleProfile(0.0105, Q.wireSegs, 0.0125), { closed: true, up: [0, 1, 0], tile: [0.02, 0.03] });
  parts.push(part('plastic_black', collar.append(dLoop), 0.13));
  const tip = surf(0, 1);
  return { parts, nodes: { Grip_Main: [0, 0, 0], Grip_Support: [0, 0, 0.52], Tip: tip, Blade_Center: surf(0, 0.4) }, butt: -0.0125 };
}

// ---------------------------------------------------------------- 4. 熊手（潮干狩り熊手）
function rake(Q) {
  const zB = -0.115, zF = 0.135;
  const wood = lathe(sampled(zB, zF - 0.002, Q.steps * 2, (z, t) => {
    const dome = Math.sqrt(clamp(t / 0.04));
    return (0.0145 + 0.0015 * Math.sin(Math.PI * t) - 0.0022 * smooth(0.85, 1, t)) * (0.4 + 0.6 * dome);
  }), Q.lathe, { tile: [0.07, 0.14] });
  const parts = [part('wood_red', wood, wood.volume() * RHO.beech)];
  const fer = lathe(pipeProfile(zF - 0.03, zF + 0.004, 0.0131, 0.0008), Q.lathe, { tile: [0.03, 0.03] });
  parts.push(part('zinc', fer, Math.PI * (0.0131 ** 2 - 0.0121 ** 2) * 0.034 * RHO.steel + 0.004));
  // tang and two braces welded to the cross bar
  const zBar = zF + 0.03;
  const tang = sweep([[0, 0, zF - 0.02], [0, 0, zBar]], circleProfile(0.0045, Q.wireSegs), { up: [0, 1, 0], tile: [0.028, 0.03], capEnds: true });
  for (const sg of [-1, 1]) {
    const brace = bezier([0, 0, zF + 0.002], [sg * 0.015, 0, zF + 0.012], [sg * 0.045, 0, zBar - 0.006], [sg * 0.055, 0, zBar], 8);
    tang.append(sweep(brace, circleProfile(0.0028, Q.wireSegs), { up: [0, 1, 0], tile: [0.018, 0.03], capEnds: true }));
  }
  // cross bar: 180 x 14 x 4 mm flat bar, standing on edge across X
  const bar = roundedBlock(-0.09, 0.09, 0.002, 0.007, Q.latheSmall, 6, 0.0012);
  bar.transform(m4.chain(m4.translate(0, -0.002, zBar), m4.rotY(Math.PI / 2)));
  parts.push(part('steel_black', tang.append(bar), 0.18 * 0.014 * 0.004 * RHO.steel + 0.04));
  // nine claws of 5 mm round steel: forward 1.5 cm, then curling down; tips worn bright
  const claws = new MeshData(), tips = new MeshData();
  let clawLen = 0;
  for (let k = 0; k < 9; k++) {
    const x = -0.08 + k * 0.02;
    const R = 0.035, n = Q.clawN;
    const path = [[x, -0.002, zBar - 0.002], [x, -0.002, zBar + 0.012]];
    for (let q = 1; q <= n; q++) {
      const a = (q / n) * (Math.PI * 0.6);
      path.push([x, -0.002 - R * (1 - Math.cos(a)), zBar + 0.012 + R * Math.sin(a)]);
    }
    const L = pathLength(path);
    clawLen = L;
    const split = Math.floor(path.length * 0.72);
    const r = (u) => 0.0025 * (1 - 0.62 * smooth(0.55, 1, u));
    const total = path.length - 1;
    const body = path.slice(0, split + 1), end = path.slice(split);
    claws.append(sweep(body, circleProfile(1, Q.wireSegs), { up: [1, 0, 0], tile: [0.014, 0.03], scaleFn: (u, kk) => r(kk / total), capEnds: true }));
    tips.append(sweep(end, circleProfile(1, Q.wireSegs), { up: [1, 0, 0], tile: [0.014, 0.03], scaleFn: (u, kk) => r((split + kk) / total), capEnds: true }));
  }
  claws.shade(() => ({ dirt: 0.75 })); tips.shade(() => ({ dirt: 1 }));
  const clawKg = 9 * Math.PI * 0.0025 ** 2 * clawLen * 0.85 * RHO.steel;
  parts.push(part('steel_black', claws, clawKg * 0.75), part('steel_bare', tips, clawKg * 0.25));
  const tipZ = zBar + 0.012 + 0.035 * Math.sin(Math.PI * 0.6);
  return { parts, nodes: { Grip_Main: [0, 0, 0], Grip_Support: [0, 0, 0.06], Tip: [0, -0.002 - 0.035 * (1 - Math.cos(Math.PI * 0.6)), tipZ], Blade_Center: [0, -0.02, zBar + 0.03] }, butt: zB, clawLen };
}

export const DIG_TOOLS = [
  {
    id: 'dig_mini', ja: 'ミニスコップ', en: 'Mini trowel', build: miniTrowel,
    spec: { blade_cm: [7, 12], handle_cm: 15, total_cm: 27, maxDepth_cm: 12, mass_g: 150 }, use: '精密採集',
    materials: 'ステンレス SUS410 板厚 1.2 mm のプレス刃（1 cm 刻みの深さ目盛を刻印）、刃元を絞ったタング、PP 樹脂の柄に TPR のグリップ',
  },
  {
    id: 'dig_trowel', ja: 'スコップ', en: 'Hand trowel', build: trowel,
    spec: { blade_cm: [10, 18], handle_cm: 25, total_cm: 43, maxDepth_cm: 20, mass_g: 320 }, use: '万能',
    materials: 'ステンレス板厚 1.3 mm の刃（深さ目盛付き）、Φ8.4 mm のステンレス丸棒を曲げた首（グースネック）を刃裏の当て板にリベット留め、タモ材の柄にニス、真鍮の口金',
  },
  {
    id: 'dig_shovel', ja: 'シャベル', en: 'Round-point shovel', build: shovel,
    spec: { blade_cm: [25, 30], handle_cm: 80, total_cm: 105, maxDepth_cm: 45, mass_g: 1400 }, use: '深掘り・大量掘削',
    materials: '炭素鋼板厚 1.2 mm の剣先刃（黒塗装、刃先は塗装が剥げて地金）、踏み返し、筒状ソケットと刃裏の補強リブ、リベット 2 本、タモ材 Φ32 mm の柄、PP の D グリップ',
  },
  {
    id: 'dig_rake', ja: '熊手', en: 'Clam rake', build: rake,
    spec: { blade_cm: [18, 8], handle_cm: 25, total_cm: 33, maxDepth_cm: 8, mass_g: 350 }, use: '表層探索',
    materials: 'Φ5 mm 鋼丸棒の爪 9 本（黒塗装、爪先は摩耗して地金）、180×14×4 mm の横板にタングと補強を溶接、亜鉛めっきの口金、赤く塗ったブナの柄',
  },
];
