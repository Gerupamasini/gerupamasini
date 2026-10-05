// The six hand nets of 干潟図鑑. Each builder returns a description the GLB writer turns into nodes:
//   handle: [{ name, z, parts: [part] }]  (shaft sections chained along +Z; z = section origin in root)
//   tipZ    root z of the frame pivot;  pivotRot: [x, y, z, w] (frame bend)
//   frame:  [part] in frame-local space;  bag: { prims: [{ material, mesh, targets }] }
//   mouth:  centre (frame local); grips: { main, support } (root);  info: catalogue data
// part = { material, mesh: MeshData, kg }  (kg: estimated mass from the real material density)
import { lathe, sweep, circleProfile, ring, m4, v3, MeshData, pathLength, TAU, smooth } from './geom.mjs';
import { roundHoop, dFrame, teardropProfile, offsetLoop, lacing, pipeProfile, sampled, foamGrip, ribs, hexFlats, knurl, latheAlong, roundedBlock } from './parts.mjs';
import { buildBag, subRows } from './bag.mjs';

const RHO = { stainless: 7930, steel: 7850, alu: 2700, beech: 720, eva: 110, tpr: 1150, vinyl: 1300, pom: 1410, carbon: 1550, rubber: 1100 };
const tubeKg = (ro, ri, L, rho) => Math.PI * (ro * ro - ri * ri) * L * rho;
const wireKg = (r, L, rho) => Math.PI * r * r * L * rho;
const sleeveKg = (m, rCore, rho) => {
  // a foam / rubber sleeve: mesh volume minus the core it is moulded on
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 2; i < m.pos.length; i += 3) { zmin = Math.min(zmin, m.pos[i]); zmax = Math.max(zmax, m.pos[i]); }
  return Math.max(0, m.volume() - Math.PI * rCore * rCore * (zmax - zmin)) * rho;
};
function areaOf(m) {
  let a = 0;
  const P = m.pos;
  for (let t = 0; t < m.idx.length; t += 3) {
    const i = m.idx[t] * 3, j = m.idx[t + 1] * 3, k = m.idx[t + 2] * 3;
    a += v3.len(v3.cross([P[j] - P[i], P[j + 1] - P[i + 1], P[j + 2] - P[i + 2]], [P[k] - P[i], P[k + 1] - P[i + 1], P[k + 2] - P[i + 2]])) / 2;
  }
  return a;
}
const part = (material, mesh, kg) => ({ material, mesh, kg });

/** dirt / ao shading for frame parts: mud sits on the underside and near the joint */
const frameShade = (m, mouthCenter) => m.shade((p, n) => ({ dirt: 0.25 + 0.55 * smooth(0.2, -0.9, n[1]) + 0.2 * smooth(0.06, 0, Math.abs(p[2])) }));
const handleShade = (m, tipZ) => m.shade((p) => ({ dirt: 0.05 + 0.5 * smooth(tipZ - 0.35, tipZ, p[2]) }));

// ---------------------------------------------------------------- shared assemblies

function wireHoop(Q, { R, rw, legHalf, z0, legIn, neck, phi0, material = 'stainless' }) {
  const h = roundHoop({ R, legHalf, z0, legIn, neck, phi0, samples: Q.hoopN });
  const mesh = sweep(h.wire, circleProfile(rw, Q.wireSegs), { up: [0, 1, 0], tile: [rw * TAU, 0.03], capEnds: true });
  return { h, wire: part(material, mesh, wireKg(rw, pathLength(h.wire), RHO.stainless)) };
}

function tapeHem(Q, h, rw, { material, extra = 1.3e-3, tail = 6e-3, th = 0.5e-3 }) {
  const rr = rw + extra;
  const mesh = sweep(h.mouth, teardropProfile(rr, tail, th, Q.hemSegs), { closed: true, up: [0, 1, 0], tile: [0.008, 0.008] });
  const kg = pathLength(h.mouth, true) * (Math.PI * rr + 2 * tail) * 0.28; // ~280 g/m2 polyester tape
  return { part: part(material, mesh, kg), bagMouth: offsetLoop(h.mouth, h.center, 0, -tail - th * 0.4) };
}

function canvasCollar(Q, h, rw, { tail, th = 1.2e-3, extra = 1.8e-3, gsm = 0.6 }) {
  const rr = rw + extra;
  const mesh = sweep(h.mouth, teardropProfile(rr, tail, th, Q.hemSegs + 4), { closed: true, up: [0, 1, 0], tile: [0.012, 0.012] });
  const parts = [part('canvas', mesh, pathLength(h.mouth, true) * (Math.PI * rr + 2 * tail) * gsm)];
  if (Q.detail === 0) {
    // two rows of lock stitching on each face of the collar
    for (const y of [-(rr + 3.5e-3), -(tail - 4.5e-3)]) {
      for (const side of [-1, 1]) {
        const t = -y / tail;
        const half = rr - (rr - th) * t * (2 - t);
        const loop = offsetLoop(h.mouth, h.center, side * (Math.max(th, half) + 0.12e-3), y);
        parts.push(part('thread', sweep(loop, circleProfile(0.32e-3, 4, 0.2e-3), { closed: true, up: [0, 1, 0], tile: [0.002, 0.004] }), 0));
      }
    }
  }
  return { parts, bagMouth: offsetLoop(h.mouth, h.center, 0, -tail - th * 0.3) };
}

function netBag(Q, mouth, { depth, p, taper, folds, seed, material, pitch, cellsPerTile, gsm, flatBottom = 0, skirt = null }) {
  const bag = buildBag({ mouth, depth, p, taper, folds, seed, nu: Q.bagNU, nv: Q.bagNV, flatBottom });
  const tileU = cellsPerTile[0] * pitch, tileV = cellsPerTile[1] * pitch;
  const scaleUV = (mesh, tu, tv) => { for (let i = 0; i < mesh.uv.length; i += 2) { mesh.uv[i] /= tu; mesh.uv[i + 1] /= tv; } return mesh; };
  const prims = [];
  if (skirt) {
    const js = Math.round(Q.bagNV * skirt.from);
    const top = subRows(bag, 0, js), bot = subRows(bag, js, Q.bagNV);
    prims.push({ material, mesh: scaleUV(top.mesh, tileU, tileV), targets: top.targets, kg: areaOf(top.mesh) * gsm });
    prims.push({ material: skirt.material, mesh: scaleUV(bot.mesh, 0.012, 0.012), targets: bot.targets, kg: areaOf(bot.mesh) * skirt.gsm });
  } else {
    prims.push({ material, mesh: scaleUV(bag.rest, tileU, tileV), targets: bag.targets, kg: areaOf(bag.rest) * gsm });
  }
  return { bag, prims };
}

/** a rigid primitive riding along with the bag bottom (gather knot) */
function bottomRider(bag, mesh, material, kg) {
  const n = mesh.vertexCount;
  const targets = bag.targets.map((t, ti) => {
    const d = bag.bottomDelta[ti];
    const dpos = new Float32Array(n * 3), dnrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { dpos[i * 3] = d[0]; dpos[i * 3 + 1] = d[1]; dpos[i * 3 + 2] = d[2]; }
    return { name: t.name, dpos, dnrm };
  });
  return { material, mesh, targets, kg };
}

function endCap(Q, z0, z1, r, material = 'rubber_black') {
  const L = z1 - z0;
  const prof = [[z0, 0], ...sampled(z0, z0 + L * 0.35, 6, (z, t) => r * (0.55 + 0.45 * Math.sqrt(1 - (1 - t) ** 2))), [z1 - L * 0.12, r], [z1 - L * 0.04, r * 1.02], [z1, r * 0.92], [z1, r * 0.92], [z1, 0]];
  const mesh = lathe(prof, Q.lathe, { rMod: ribs(24, r * 0.025, z0 + L * 0.35, z1 - L * 0.15), tile: [0.02, 0.02] });
  return part(material, mesh, mesh.volume() * RHO.vinyl * 0.6);
}

function hexFerrule(Q, { zA, zB, zHex0, zHex1, across, rRound, rFront, material = 'stainless' }) {
  const prof = [[zA, 0], [zA, rRound * 0.8], [zA, rRound * 0.8], [zA + 0.0006, rRound], [zHex1, rRound], [zHex1 + 0.001, rRound * 0.97], ...sampled(zHex1 + 0.002, zB - 0.0015, 8, (z, t) => rRound * 0.97 + (rFront - rRound * 0.97) * t * t * (3 - 2 * t)), [zB, rFront * 0.85], [zB, rFront * 0.85], [zB, 0]];
  const mesh = lathe(prof, Q.lathe, { rMod: hexFlats(across, zHex0, zHex1), tile: [0.03, 0.03] });
  return part(material, mesh, mesh.volume() * RHO.stainless * 0.55);
}

// ---------------------------------------------------------------- 1. 小型タモ

function netSmall(Q) {
  const butt = -0.07, tip = 0.38;
  const wood = lathe(sampled(butt, tip - 0.004, Q.steps * 2, (z) => {
    const d = z - butt;
    const dome = d < 0.009 ? Math.sqrt(Math.max(0, 1 - (1 - d / 0.009) ** 2)) * 0.88 + 0.12 * (d / 0.009) : 1;
    return (0.0112 + 0.0005 * Math.exp(-((z / 0.06) ** 2)) - 0.0007 * smooth(0.12, 0.33, z)) * dome;
  }), Q.lathe, { tile: [0.07, 0.14] });
  const handleParts = [part('beech', wood, wood.volume() * RHO.beech)];
  if (Q.detail < 2) {
    // screw eye in the butt and a braided lanyard through it
    const eye = ring([0, -0.0, butt - 0.0052], [1, 0, 0], 0.0042, 0.0009, Q.detail ? 6 : 10, Q.detail ? 12 : 24, [0.006, 0.03]);
    const shank = lathe(pipeProfile(butt - 0.0015, butt + 0.002, 0.0012), 8);
    const loopPath = [];
    const N = Q.detail ? 24 : 48;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      // a teardrop hanging below the eye, slightly swung back
      const y = -0.045 + 0.045 * Math.cos(a) - 0.004;
      const z = butt - 0.0062 + 0.012 * Math.sin(a) * (0.35 + 0.65 * (1 - Math.cos(a)) / 2) - 0.01 * (1 - Math.cos(a)) / 2;
      loopPath.push([0.0008 * Math.sin(a * 2), y, z]);
    }
    const cord = sweep(loopPath, circleProfile(0.0014, Q.detail ? 5 : 8), { closed: true, up: [1, 0, 0], tile: [0.0088, 0.012] });
    handleParts.push(part('stainless', eye.append(shank), 0.0015), part('cord_navy', cord, 0.003));
  }
  // frame: crimped ferrule + 3.2 mm stainless wire + white binding tape
  const rw = 0.0016;
  const ferProf = [[-0.052, 0], [-0.052, 0.0118], [-0.052, 0.0118], [-0.0515, 0.0123], ...sampled(-0.051, -0.001, Q.steps, (z) => {
    const g1 = Math.exp(-(((z + 0.044) / 0.0011) ** 2)), g2 = Math.exp(-(((z + 0.007) / 0.0011) ** 2));
    return 0.0123 - 0.00055 * (g1 + g2);
  }), [0, 0.0121], [0.0015, 0.0105], ...sampled(0.003, 0.012, 5, (z, t) => 0.0098 - 0.0058 * t * (2 - t)), [0.0125, 0.0036], [0.0125, 0.0036], [0.0125, 0]];
  const ferrule = lathe(ferProf, Q.lathe, { tile: [0.03, 0.03] });
  const { h, wire } = wireHoop(Q, { R: 0.1, rw, legHalf: rw * 1.1, z0: 0.012, legIn: 0.045, neck: 0.03, phi0: 0.55 });
  const hem = tapeHem(Q, h, rw, { material: 'tape_white', extra: 1.3e-3, tail: 6e-3 });
  const { bag, prims } = netBag(Q, hem.bagMouth, { depth: 0.16, p: 2.2, taper: 0.18, folds: 0.085, seed: 3, material: 'net_white', pitch: 0.0037, cellsPerTile: [8, 8], gsm: 0.045 });
  const frame = [part('stainless', ferrule, tubeKg(0.0123, 0.0113, 0.052, RHO.stainless) + 0.004), wire, hem.part];
  return {
    handle: [{ name: 'Handle', z: 0, parts: handleParts }], tipZ: tip, pivotRot: [0, 0, 0, 1], frame, bag: { prims }, bagInfo: bag,
    mouth: h.center, grips: { main: [0, 0, 0], support: [0, 0, 0.2] },
  };
}

// ---------------------------------------------------------------- 2. 浅瀬タモ

function netShallow(Q) {
  const butt = -0.09, tip = 0.71, r = 0.01;
  const cap = endCap(Q, butt, butt + 0.018, 0.0112);
  const eva = lathe(foamGrip(butt + 0.016, 0.15, r, 0.0138, Q.steps * 2), Q.lathe, { tile: [0.025, 0.025] });
  const pipe = lathe(pipeProfile(0.14, tip - 0.028, r, 0.0004), Q.lathe, { tile: [0.03, 0.03] });
  const fit = lathe(pipeProfile(tip - 0.03, tip, r + 0.0008, 0.0007), Q.lathe, { rMod: knurl(60, 0.00025, tip - 0.024, tip - 0.008), tile: [0.03, 0.03] });
  const handleParts = [cap, part('eva_black', eva, sleeveKg(eva, r, RHO.eva)), part('alu_olive', pipe, tubeKg(r, r - 0.001, tip - 0.14, RHO.alu)), part('alu_natural', fit, fit.volume() * RHO.alu * 0.7)];
  const rw = 0.002;
  const fer = hexFerrule(Q, { zA: 0, zB: 0.046, zHex0: 0.002, zHex1: 0.015, across: 0.017, rRound: 0.0105, rFront: 0.0052 });
  const { h, wire } = wireHoop(Q, { R: 0.15, rw, legHalf: rw * 1.1, z0: 0.046, legIn: 0.04, neck: 0.045, phi0: 0.6 });
  const hem = tapeHem(Q, h, rw, { material: 'tape_black', extra: 1.4e-3, tail: 7e-3 });
  const { bag, prims } = netBag(Q, hem.bagMouth, { depth: 0.28, p: 2.2, taper: 0.22, folds: 0.095, seed: 5, material: 'net_green', pitch: 0.0025, cellsPerTile: [8, 8], gsm: 0.06 });
  return {
    handle: [{ name: 'Handle', z: 0, parts: handleParts }], tipZ: tip, pivotRot: [0, 0, 0, 1], frame: [fer, wire, hem.part], bag: { prims }, bagInfo: bag,
    mouth: h.center, grips: { main: [0, 0, 0], support: [0, 0, 0.36] },
  };
}

// ---------------------------------------------------------------- 3. 微細目タモ

function netFine(Q) {
  const butt = -0.075, tip = 0.525, r = 0.009;
  const cap = endCap(Q, butt, butt + 0.013, 0.0108);
  const gripProf = [[butt + 0.011, r], [butt + 0.011, r], ...sampled(butt + 0.011, 0.085, Q.steps * 2, (z, t) => {
    const flare = 0.0012 * Math.exp(-(((z - 0.076) / 0.004) ** 2));
    return r + (0.0118 - r + flare) * smooth(0, 0.06, t) * (1 - smooth(0.975, 1, t));
  }), [0.085, r], [0.085, r]];
  const grip = lathe(gripProf, Q.lathe, { tile: [0.012, 0.012] });
  const pipe = lathe(pipeProfile(0.08, tip - 0.004, r, 0.0004), Q.lathe, { tile: [0.03, 0.03] });
  const handleParts = [cap, part('rubber_black', grip, sleeveKg(grip, r, RHO.tpr)), part('stainless_polished', pipe, tubeKg(r, r - 0.0007, tip - 0.08, RHO.stainless))];
  const rw = 0.002;
  const ferProf = [[-0.032, 0], [-0.032, 0.0097], [-0.032, 0.0097], [-0.0315, 0.0101], [-0.002, 0.0101], ...sampled(0, 0.03, 8, (z, t) => 0.0101 - 0.0049 * t * t * (3 - 2 * t)), [0.0305, 0.0045], [0.0305, 0.0045], [0.0305, 0]];
  const ferrule = lathe(ferProf, Q.lathe, { tile: [0.03, 0.03] });
  const { h, wire } = wireHoop(Q, { R: 0.125, rw, legHalf: rw * 1.1, z0: 0.0305, legIn: 0.04, neck: 0.035, phi0: 0.6 });
  const col = canvasCollar(Q, h, rw, { tail: 0.035 });
  const { bag, prims } = netBag(Q, col.bagMouth, { depth: 0.22, p: 2.0, taper: 0.24, folds: 0.07, seed: 7, material: 'net_woven', pitch: 0.00095, cellsPerTile: [16, 16], gsm: 0.07 });
  return {
    handle: [{ name: 'Handle', z: 0, parts: handleParts }], tipZ: tip, pivotRot: [0, 0, 0, 1], frame: [part('stainless', ferrule, tubeKg(0.0101, 0.009, 0.032, RHO.stainless) + 0.006), wire, ...col.parts], bag: { prims }, bagInfo: bag,
    mouth: h.center, grips: { main: [0, 0, 0], support: [0, 0, 0.26] },
  };
}

// ---------------------------------------------------------------- 4. 深場タモ

function netDeep(Q) {
  const butt = -0.09, ro = 0.014, ri = 0.012, zc = 0.69, tip = 1.41;
  const cap = endCap(Q, butt, butt + 0.016, 0.0152);
  const eva = lathe(foamGrip(butt + 0.013, 0.17, ro, 0.0176, Q.steps * 2), Q.lathe, { tile: [0.025, 0.025] });
  const outer = lathe(pipeProfile(0.16, zc - 0.03, ro, 0.0004), Q.lathe, { tile: [0.03, 0.03] });
  const collarProf = [[zc - 0.05, ro], [zc - 0.05, ro], ...sampled(zc - 0.05, zc, Q.steps, (z, t) => ro + 0.0034 * smooth(0, 0.12, t) * (1 - 0.35 * smooth(0.7, 1, t))), [zc, ri + 0.0008], [zc, ri + 0.0008]];
  const collar = lathe(collarProf, Q.lathe * 2, { rMod: ribs(18, 0.0011, zc - 0.044, zc - 0.012), tile: [0.02, 0.02] });
  const s1 = [cap, part('eva_black', eva, sleeveKg(eva, ro, RHO.eva)), part('alu_silver', outer, tubeKg(ro, ro - 0.0009, zc - 0.16, RHO.alu)), part('plastic_black', collar, sleeveKg(collar, ro, RHO.pom))];
  // inner section (slides into the outer one; its node can be translated along -Z to collapse)
  const L2 = tip - zc;
  const inner = lathe(pipeProfile(-0.12, L2 - 0.028, ri, 0.0004), Q.lathe, { tile: [0.03, 0.03] });
  const fit = lathe(pipeProfile(L2 - 0.03, L2, ri + 0.0008, 0.0007), Q.lathe, { rMod: knurl(60, 0.00025, L2 - 0.024, L2 - 0.008), tile: [0.03, 0.03] });
  const s2 = [part('alu_silver', inner, tubeKg(ri, ri - 0.0008, L2 + 0.12, RHO.alu)), part('stainless', fit, fit.volume() * RHO.stainless * 0.5)];
  const rw = 0.0025;
  const fer = hexFerrule(Q, { zA: 0, zB: 0.05, zHex0: 0.002, zHex1: 0.017, across: 0.021, rRound: 0.0128, rFront: 0.0062 });
  const { h, wire } = wireHoop(Q, { R: 0.175, rw, legHalf: rw * 1.1, z0: 0.05, legIn: 0.04, neck: 0.05, phi0: 0.62 });
  // selvage rope laced to the wire with twine
  const rr = 0.0022;
  const ropeLoop = offsetLoop(h.mouth, h.center, 0, -(rw + rr));
  const rope = sweep(ropeLoop, circleProfile(rr, Q.wireSegs), { closed: true, up: [0, 1, 0], tile: [rr * TAU, 0.012] });
  const frame = [fer, wire, part('rope_green', rope, pathLength(ropeLoop, true) * 0.004)];
  if (Q.detail < 2) frame.push(part('twine_green', lacing(h.mouth, { every: Q.detail ? 0.07 : 0.035, rw, rr, twine: 0.0006, segs: Q.detail ? 4 : 6, loopSegs: Q.detail ? 8 : 14 }), 0.004));
  const bagMouth = offsetLoop(h.mouth, h.center, 0, -(rw + 2 * rr) + 0.0005);
  const { bag, prims } = netBag(Q, bagMouth, { depth: 0.42, p: 2.0, taper: 0.26, folds: 0.1, seed: 9, material: 'net_knotted', pitch: 0.0052, cellsPerTile: [6, 8.05], gsm: 0.12 });
  // the bottom gathered and tied off with twine
  const knotMesh = lathe(sampled(-0.012, 0.012, Q.steps, (z, t) => 0.0075 * Math.sin(Math.PI * t) ** 0.7 * (1 + 0.12 * Math.sin(t * 19))), Q.latheSmall, { tile: [0.012, 0.012] });
  knotMesh.transform(m4.chain(m4.translate(...v3.add(bag.bottom, [0, 0.004, 0])), m4.rotX(Math.PI / 2)));
  knotMesh.shade(() => ({ dirt: 1 }));
  prims.push(bottomRider(bag, knotMesh, 'twine_green', 0.003));
  return {
    handle: [{ name: 'Handle', z: 0, parts: s1 }, { name: 'Handle_Inner', z: zc, parts: s2 }], tipZ: tip, pivotRot: [0, 0, 0, 1], frame, bag: { prims }, bagInfo: bag,
    mouth: h.center, grips: { main: [0, 0, 0], support: [0, 0, 0.5] },
  };
}

// ---------------------------------------------------------------- 5. D型底さらい網

function netDFrame(Q) {
  const butt = -0.08, r = 0.0125, sock0 = 0.7, tip = 0.82, bend = 0.6;
  const cap = endCap(Q, butt, butt + 0.02, 0.0137, 'vinyl_black');
  const grip = lathe(foamGrip(butt + 0.017, 0.1, r, 0.0152, Q.steps * 2), Q.lathe, { tile: [0.012, 0.012] });
  const pipe = lathe(pipeProfile(0.09, sock0 + 0.01, r, 0.0004), Q.lathe, { tile: [0.03, 0.03] });
  const sockProf = [[sock0, r], [sock0, r], [sock0, r + 0.0018], [sock0 + 0.0015, r + 0.0032], [tip - 0.006, r + 0.0032], [tip - 0.002, r + 0.0025], [tip, r + 0.0012], [tip, r + 0.0012], [tip, 0]];
  const socket = lathe(sockProf, Q.lathe, { tile: [0.04, 0.04] });
  const handleParts = [cap, part('rubber_black', grip, sleeveKg(grip, r, RHO.tpr)), part('alu_natural', pipe, tubeKg(r, r - 0.0012, sock0 + 0.01 - 0.09, RHO.alu)), part('steel_black', socket, tubeKg(r + 0.0032, r, tip - sock0, RHO.steel))];
  // through bolt and nut clamping the handle in the socket
  const zb = sock0 + 0.03, rs = r + 0.0032;
  const head = latheAlong([[0, 0], [0, 0.0055], [0, 0.0055], [0.0035, 0.0055], [0.0035, 0.0055], [0.0042, 0.0045], [0.0042, 0]], Q.latheSmall, [rs - 0.0003, 0, zb], [1, 0, 0], { rMod: hexFlats(0.0095, 0, 0.0036), tile: [0.02, 0.02] });
  const nut = latheAlong([[0, 0], [0, 0.0055], [0, 0.0055], [0.0045, 0.0055], [0.0045, 0.0055], [0.0045, 0.0022], [0.0045, 0.0022], [0.0062, 0.0018], [0.0068, 0]], Q.latheSmall, [-rs + 0.0003, 0, zb], [-1, 0, 0], { rMod: hexFlats(0.0095, 0, 0.0046), tile: [0.02, 0.02] });
  if (Q.detail < 2) handleParts.push(part('zinc', head.append(nut), 0.012));
  // frame (bent down by `bend` at the socket mouth): solid stem, welded to an 8 mm steel D rod
  const rw = 0.004;
  const d = dFrame({ W: 0.35, D: 0.25, zApex: 0.035, fillet: 0.03, samples: Q.hoopN });
  const rod = sweep(d.mouth, circleProfile(rw, Q.wireSegs), { closed: true, up: [0, 1, 0], tile: [rw * TAU, 0.04] });
  const stem = lathe(pipeProfile(-0.004, 0.036, 0.0052, 0.0006), Q.latheSmall, { tile: [0.03, 0.03] });
  const weld = lathe(sampled(0.026, 0.044, 6, (z, t) => 0.0062 * Math.sin(Math.PI * t) ** 0.5 + 0.0035), Q.latheSmall, { rMod: (a, z, rr) => rr * (1 + 0.06 * Math.sin(a * 7 + z * 900)), tile: [0.02, 0.02] });
  const frame = [part('steel_black', rod, wireKg(rw, pathLength(d.mouth, true), RHO.steel)), part('steel_black', stem.append(weld), wireKg(0.0052, 0.04, RHO.steel) + 0.006)];
  const col = canvasCollar(Q, { mouth: d.mouth, center: d.center }, rw, { tail: 0.05, th: 1.5e-3, extra: 2.2e-3, gsm: 0.65 });
  frame.push(...col.parts);
  const { bag, prims } = netBag(Q, col.bagMouth, { depth: 0.3, p: 3.0, taper: 0.08, folds: 0.07, seed: 11, material: 'net_gray', pitch: 0.0025, cellsPerTile: [8, 8], gsm: 0.06, flatBottom: 0.6, skirt: { from: 0.74, material: 'canvas', gsm: 0.65 } });
  return {
    handle: [{ name: 'Handle', z: 0, parts: handleParts }], tipZ: tip, pivotRot: [Math.sin(bend / 2), 0, 0, Math.cos(bend / 2)], frame, bag: { prims }, bagInfo: bag,
    mouth: d.center, grips: { main: [0, 0, 0], support: [0, 0, 0.42] },
  };
}

// ---------------------------------------------------------------- 6. 高級軽量タモ

function netPremium(Q) {
  const butt = -0.085, z2 = 0.47, z3 = 0.97, tip = 1.415;
  const capProf = [[butt - 0.003, 0], [butt - 0.003, 0.0105], [butt - 0.003, 0.0105], [butt - 0.0022, 0.0112], [butt, 0.0112], [butt, 0.0112], [butt, 0.0136], [butt + 0.0012, 0.0146], [butt + 0.022, 0.0146], [butt + 0.0245, 0.0132], [butt + 0.0245, 0.0132], [butt + 0.0245, 0.0128]];
  const capM = lathe(capProf.slice(5), Q.lathe, { rMod: knurl(90, 0.0002, butt + 0.005, butt + 0.017), tile: [0.03, 0.03] });
  const pad = lathe(capProf.slice(0, 5), Q.latheSmall, { tile: [0.02, 0.02] });
  const eva = lathe(foamGrip(butt + 0.024, 0.16, 0.0128, 0.0156, Q.steps * 2), Q.lathe, { tile: [0.025, 0.025] });
  const carbon = (z0, z1, r0, r1) => lathe(sampled(z0, z1, 6, (z, t) => r0 + (r1 - r0) * t), Q.lathe, { tile: [0.024, 0.024] });
  const ringAt = (z, r) => lathe(pipeProfile(z - 0.007, z, r + 0.0006, 0.0004, false), Q.lathe, { tile: [0.03, 0.03] });
  const c1 = carbon(0.15, z2, 0.0128, 0.0121);
  const s1 = [part('alu_champagne', capM, 0.012), part('rubber_black', pad, 0.002), part('eva_gray', eva, sleeveKg(eva, 0.0128, RHO.eva * 1.6)), part('carbon', c1, tubeKg(0.0125, 0.0115, z2 - 0.15, RHO.carbon)), part('alu_champagne', ringAt(z2, 0.0121), 0.002)];
  const c2 = carbon(-0.03, z3 - z2, 0.0113, 0.0104);
  const s2 = [part('carbon', c2, tubeKg(0.0109, 0.01, z3 - z2 + 0.03, RHO.carbon)), part('alu_champagne', ringAt(z3 - z2, 0.0104), 0.0015)];
  const L3 = tip - z3;
  const c3 = carbon(-0.03, L3 - 0.034, 0.0096, 0.0088);
  const tipCollar = lathe(pipeProfile(L3 - 0.036, L3, 0.0101, 0.0006), Q.lathe, { rMod: knurl(70, 0.00018, L3 - 0.026, L3 - 0.012), tile: [0.03, 0.03] });
  const s3 = [part('carbon', c3, tubeKg(0.0092, 0.0084, L3, RHO.carbon)), part('alu_champagne', tipCollar, tubeKg(0.0101, 0.0088, 0.036, RHO.alu))];
  // folding joint: clevis on the frame side, knurled lock knob on +X, pin head on -X
  const clevis = roundedBlock(-0.004, 0.03, 0.0102, 0.0084, Q.lathe, 3.2, 0.0012);
  const yoke = roundedBlock(0.028, 0.056, 0.0105, 0.0064, Q.lathe, 3, 0.001, (z) => 1 - 0.15 * smooth(0.03, 0.056, z));
  const knobProf = [[0, 0], [0, 0.0088], [0, 0.0088], [0.0006, 0.0092], [0.0074, 0.0092], [0.0074, 0.0092], [0.008, 0.0085], [0.0095, 0.006], [0.0101, 0.0032], [0.0103, 0]];
  const knob = latheAlong(knobProf, Q.lathe, [0.0102, 0, 0.0125], [1, 0, 0], { rMod: knurl(48, 0.0003, 0.0008, 0.0072), tile: [0.03, 0.03] });
  const pinHead = latheAlong([[0, 0], [0, 0.0058], [0, 0.0058], [0.0016, 0.0058], [0.0022, 0.005], [0.0024, 0]], Q.latheSmall, [-0.0102, 0, 0.0125], [-1, 0, 0], { tile: [0.02, 0.02] });
  const rw = 0.0035;
  const { h, wire } = wireHoop(Q, { R: 0.16, rw, legHalf: 0.0046, z0: 0.054, legIn: 0.02, neck: 0.042, phi0: 0.6, material: 'alu_gunmetal' });
  wire.kg = tubeKg(rw, rw - 0.0007, pathLength(h.wire), RHO.alu);
  const hem = tapeHem(Q, h, rw, { material: 'rubber_bead', extra: 1.0e-3, tail: 4.5e-3, th: 1.0e-3 });
  hem.part.kg *= 2.2;
  const { bag, prims } = netBag(Q, hem.bagMouth, { depth: 0.26, p: 2.3, taper: 0.14, folds: 0.042, seed: 13, material: 'net_rubber', pitch: 0.0026, cellsPerTile: [8, 7.125], gsm: 0.24 });
  const frame = [part('alu_champagne', clevis, clevis.volume() * RHO.alu * 0.8), part('alu_gunmetal', yoke, yoke.volume() * RHO.alu * 0.8), part('alu_champagne', knob.append(pinHead), 0.006), wire, hem.part];
  return {
    handle: [{ name: 'Handle', z: 0, parts: s1 }, { name: 'Handle_Mid', z: z2, parts: s2 }, { name: 'Handle_Tip', z: z3, parts: s3 }], tipZ: tip, pivotRot: [0, 0, 0, 1], frame, bag: { prims }, bagInfo: bag,
    mouth: h.center, grips: { main: [0, 0, 0], support: [0, 0, 0.5] }, foldAxis: [1, 0, 0],
  };
}

function flipWinding(m) {
  for (let t = 0; t < m.idx.length; t += 3) { const a = m.idx[t + 1]; m.idx[t + 1] = m.idx[t + 2]; m.idx[t + 2] = a; }
}

// ---------------------------------------------------------------- catalogue

export const NETS = [
  {
    id: 'net_small', ja: '小型タモ', en: 'Compact hand net', build: netSmall,
    spec: { hoop_cm: '20 (Φ)', handle_cm: 45, mesh_mm: 3, bagDepth_cm: 16 },
    materials: 'ステンレス SUS304 線 Φ3.2 mm の丸枠、ブナ丸棒 Φ22 mm の柄、圧着ステンレス口金、ポリエステル無結節（ラッセル）網 3 mm、ポリエステル縁テープ、組紐ストラップ',
    use: '万能・序盤',
  },
  {
    id: 'net_shallow', ja: '浅瀬タモ', en: 'Shallow-water net', build: netShallow,
    spec: { hoop_cm: '30 (Φ)', handle_cm: 80, mesh_mm: 2, bagDepth_cm: 28 },
    materials: 'ステンレス線 Φ4 mm の丸枠と六角口金（ねじ込み式）、アルミパイプ Φ20 mm（オリーブアルマイト）、EVA グリップ、ゴムエンドキャップ、ナイロン無結節網 2 mm（深緑）',
    use: '小魚・エビ',
  },
  {
    id: 'net_fine', ja: '微細目タモ', en: 'Fine-mesh net', build: netFine,
    spec: { hoop_cm: '25 (Φ)', handle_cm: 60, mesh_mm: 0.8, bagDepth_cm: 22 },
    materials: 'ステンレス線 Φ4 mm の丸枠、綿帆布（11 号相当）の縁布と本縫い、ポリエステル平織モノフィラメント 0.8 mm（約 20 メッシュ）、ステンレスパイプ Φ18 mm、TPR ローレットグリップ',
    use: '稚魚・小型甲殻類',
  },
  {
    id: 'net_deep', ja: '深場タモ', en: 'Long-reach net', build: netDeep,
    spec: { hoop_cm: '35 (Φ)', handle_cm: 150, mesh_mm: 4, bagDepth_cm: 42 },
    materials: 'ステンレス線 Φ5 mm の丸枠、PE 撚りロープの縁を撚糸で枠に綴じ付け、PE 有結節網 4 mm（底を絞り結び）、2 段伸縮アルミ柄 Φ28/24 mm（ツイストロック）、EVA グリップ',
    use: '水路・深めの場所',
  },
  {
    id: 'net_dframe', ja: 'D型底さらい網', en: 'D-frame dip net', build: netDFrame,
    spec: { hoop_cm: '35 × 25 (D)', handle_cm: 90, mesh_mm: 2, bagDepth_cm: 30 },
    materials: '鋼丸棒 Φ8 mm の D 型枠（黒粉体塗装）、溶接ソケットとボルト固定、厚手綿帆布の縁布と底当て（スカート）、ナイロン無結節網 2 mm、アルミパイプ Φ25 mm',
    use: '底生生物',
  },
  {
    id: 'net_premium', ja: '高級軽量タモ', en: 'Premium ultralight net', build: netPremium,
    spec: { hoop_cm: '32 (Φ)', handle_cm: 150, mesh_mm: 2, bagDepth_cm: 26 },
    materials: 'アルミ 7075 パイプ Φ7 mm の丸枠（ガンメタアルマイト）、削り出し折りたたみジョイント（シャンパンゴールド）、3 本継ぎカーボン柄（2×2 綾織・クリア塗装）、高密度 EVA、ラバーコート無結節網 2 mm',
    use: '万能上位',
  },
];
