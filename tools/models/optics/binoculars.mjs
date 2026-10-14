// 8x42 roof-prism binoculars for bird watching (built by tools/models/digging/build.mjs --set optics).
// Root space: metres, +Y up, +Z the way the binoculars look, origin midway between the eyecups.
import { lathe, ring, m4, MeshData } from '../nets/geom.mjs';
import { sampled, knurl, ribs, roundedBlock } from '../nets/parts.mjs';

const HALF_IPD = 0.032; // half the distance between the eyes (64 mm)
const part = (material, mesh, kg) => ({ material, mesh, kg });

/** one barrel built on the Z axis; sx = +1 right, -1 left */
function barrel(Q, sx) {
  const parts = [];
  // twist-up rubber eyecup with a rolled lip, open toward the eye
  const cup = lathe([[0.012, 0.0118], [0.012, 0.0118], [-0.002, 0.0122], [-0.004, 0.0146], [-0.0036, 0.0178], [-0.0012, 0.0193], [0.024, 0.0193], [0.024, 0.0174]], Q.lathe, { tile: [0.02, 0.02] });
  parts.push(part('vinyl_black', cup, 0.012));
  // eyepiece housing; the right one carries the knurled dioptre ring
  const ep = lathe([[0.023, 0.0174], [0.023, 0.0174], ...sampled(0.023, 0.044, Q.steps, (z, t) => 0.0176 + 0.0012 * t)], Q.lathe, {
    rMod: sx > 0 ? knurl(64, 0.0003, 0.029, 0.038) : null, tile: [0.03, 0.03],
  });
  parts.push(part('alu_gunmetal', ep, 0.035));
  // rubber-armoured body: swells from the eyepiece, thumb hollows underneath, rounded front shoulder
  const body = lathe([[0.04, 0.0186], [0.04, 0.0186], ...sampled(0.04, 0.142, Q.steps * 2, (z, t) => 0.0195 + 0.0062 * Math.sqrt(Math.min(1, (z - 0.04) / 0.016)) - 0.0008 * Math.max(0, (z - 0.13) / 0.012) ** 2), [0.142, 0.0244], [0.142, 0.0244]], Q.lathe, {
    rMod: (a, z, r) => (z > 0.055 && z < 0.09 && Math.sin(a) < -0.3 ? r - 0.0016 * Math.sin(Math.PI * (z - 0.055) / 0.035) * (-Math.sin(a) - 0.3) / 0.7 : r),
    tile: [0.02, 0.02],
  });
  parts.push(part('armor_olive', body, 0.155));
  // objective rim and the recessed lens cell
  const rim = lathe([[0.141, 0.0246], [0.141, 0.0246], [0.1495, 0.0262], [0.152, 0.0258], [0.152, 0.0228], [0.152, 0.0228], [0.144, 0.0224], [0.143, 0.0214], [0.143, 0.0214]], Q.lathe, { rMod: ribs(48, 0.0002, 0.143, 0.149), tile: [0.03, 0.03] });
  parts.push(part('alu_gunmetal', rim, 0.02));
  // glass: a shallow dome behind the rim and the eye lens deep in the cup
  const obj = lathe(sampled(0.1425, 0.1445, 4, (z, t) => 0.0214 * Math.sqrt(Math.max(0, 1 - t * t))).concat([[0.1445, 0]]), Q.lathe, { tile: [0.05, 0.05] });
  const eye = lathe(sampled(0.0118, 0.0105, 4, (z, t) => 0.0118 * Math.sqrt(Math.max(0, 1 - t * t))).concat([[0.0105, 0]]), Q.latheSmall * 2, { tile: [0.05, 0.05] });
  // the eye lens faces -Z: reverse its winding so it shows from the eyecup side
  for (let t = 0; t < eye.idx.length; t += 3) { const a = eye.idx[t + 1]; eye.idx[t + 1] = eye.idx[t + 2]; eye.idx[t + 2] = a; }
  for (let i = 0; i < eye.nrm.length; i++) eye.nrm[i] = -eye.nrm[i];
  parts.push(part('lens', obj.append(eye), 0.06));
  for (const p of parts) p.mesh.transform(m4.translate(sx * HALF_IPD, 0, 0));
  return parts;
}

function binoculars(Q) {
  const parts = [...barrel(Q, 1), ...barrel(Q, -1)];
  // central hinge with an eyepiece bridge and an objective bridge
  const hinge = lathe(sampled(0.046, 0.134, Q.steps, () => 0.0082), Q.lathe, { tile: [0.02, 0.02] });
  const bridges = new MeshData();
  for (const [z0, z1] of [[0.044, 0.058], [0.118, 0.134]]) {
    // a block built along Z (its x half-size becomes the depth along Z) turned to run across X
    const b = roundedBlock(-HALF_IPD, HALF_IPD, (z1 - z0) / 2, 0.0072, Q.latheSmall, 3, 0.002);
    b.transform(m4.chain(m4.translate(0, 0.002, (z0 + z1) / 2), m4.rotY(Math.PI / 2)));
    bridges.append(b);
  }
  parts.push(part('armor_olive', hinge.append(bridges), 0.07));
  // focus wheel on top of the hinge, between the eyepieces
  const wheel = lathe([[0.05, 0], [0.05, 0.011], [0.05, 0.011], ...sampled(0.0505, 0.0715, 4, () => 0.0118), [0.072, 0.011], [0.072, 0.011], [0.072, 0]], Q.lathe, { rMod: ribs(40, 0.0007, 0.051, 0.071), tile: [0.012, 0.012] });
  wheel.transform(m4.translate(0, 0.0105, 0));
  parts.push(part('rubber_black', wheel, 0.02));
  if (Q.detail < 2) {
    // strap lugs on the outer sides of the eyepiece ends
    const lugs = new MeshData();
    for (const sx of [-1, 1]) lugs.append(ring([sx * (HALF_IPD + 0.0205), 0.006, 0.05], [0, 0, 1], 0.0042, 0.0012, 6, 16, [0.008, 0.02]));
    parts.push(part('alu_gunmetal', lugs, 0.006));
  }
  for (const p of parts) p.mesh.shade((pt, n) => ({ dirt: 0.1 + 0.4 * Math.max(0, -n[1]) }));
  return {
    parts,
    nodes: {
      Grip_Main: [HALF_IPD, -0.004, 0.09],
      Grip_Support: [-HALF_IPD, -0.004, 0.09],
      Eye_L: [-HALF_IPD, 0, -0.004],
      Eye_R: [HALF_IPD, 0, -0.004],
      Objective_Center: [0, 0, 0.152],
    },
  };
}

export const OPTICS = [
  {
    id: 'obs_binoculars', ja: '双眼鏡', en: 'Binoculars 8x42', build: binoculars, use: '野鳥観察',
    spec: { magnification: 8, objective_mm: 42, fov_deg: 7.5, total_cm: 15.6, width_cm: 12.8, mass_g: 650 },
    materials: 'ダハプリズム式 8×42。オリーブ色のラバー外装、ガンメタのアルミ接眼部と対物リム（右に視度調整リング）、中央ヒンジと 2 本のブリッジ、ゴムのピントリング、ツイストアップ見口、マルチコート（虹色反射）のレンズ、ストラップ環',
  },
];
