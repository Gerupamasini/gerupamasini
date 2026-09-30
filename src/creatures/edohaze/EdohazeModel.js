import * as THREE from 'three';
import { MORPH, S0, bodyProfile } from './EdohazeParams.js';
import { EdohazeRig, BONE_LAYOUT, packWeights } from './EdohazeRig.js';
import { clamp, smoothstep, gauss, lerp } from './EdohazeMath.js';

// ---------------------------------------------------------------------------
// Body surface. All construction happens in SL units and is scaled to metres.
// Silhouette-critical form lives in geometry; scale relief, papillae, pigment
// live in textures (EdohazeTextures.js).
// ---------------------------------------------------------------------------

export const RICTUS_S = 0.128;       // corner of mouth
const MAXILLA_END_S = 0.150;         // posterior tip of maxilla (large jaw; below rear of eye)
const EYE_R = MORPH.eyeDiameter / 2;

export const LOD_SPECS = [
  { rings: 170, nu: 22, nl: 26, finAcross: 4, finAlong: 14, eyeSeg: 40, mouth: true, gills: true },
  { rings: 70, nu: 9, nl: 11, finAcross: 2, finAlong: 7, eyeSeg: 16, mouth: true, gills: false },
  { rings: 24, nu: 3, nl: 5, finAcross: 1, finAlong: 3, eyeSeg: 8, mouth: false, gills: false },
];

function exps(s) {
  // superellipse exponents: round head, "cylindrical" trunk, flatter belly (benthic)
  const t = smoothstep(0.18, 0.40, s), p = smoothstep(0.75, 0.97, s);
  const up = lerp(lerp(2.0, 2.25, t), 2.0, p);
  const lo = lerp(lerp(2.05, 2.7, t), 2.1, p);
  return { up, lo };
}

function lipFrac(s) {
  // mouth line as fraction of ventral radius (negative = below axis); oblique mouth
  const t = clamp(s / RICTUS_S, 0, 1);
  return -(0.06 + 0.42 * t);
}

export function lipTheta(s) {
  const { lo } = exps(Math.min(s, RICTUS_S));
  const f = Math.abs(lipFrac(Math.min(s, RICTUS_S)));
  return Math.acos(-Math.pow(f, lo / 2)); // angle from dorsal, left side
}

// Base (un-featured) surface point in SL units.
export function basePoint(s, theta, out = new THREE.Vector3(), sex = 1) {
  const pr = bodyProfile(s, sex);
  const { up, lo } = exps(s);
  const c = Math.cos(theta), sn = Math.sin(theta);
  const n = c >= 0 ? up : lo;
  const x = pr.half * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
  const y = (c >= 0 ? pr.top : pr.bottom) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  return out.set(x, y, S0 - s);
}

function eyeCenter(side, sex = 1) {
  const e = BONE_LAYOUT.eye;
  const th = side === 'L' ? e.theta : 2 * Math.PI - e.theta;
  const p = basePoint(e.s, th, new THREE.Vector3(), sex);
  const n = new THREE.Vector3(p.x, p.y, 0).normalize();
  // interorbital narrow: pull eyes toward the dorsal midline a little
  const c = p.clone().addScaledVector(n, -EYE_R * e.sink);
  c.x *= 0.92;
  return { c, axis: n.clone().applyAxisAngle(new THREE.Vector3(0, side === 'L' ? 1 : -1, 0), -0.12).normalize() };
}

// Feature displacement (SL units). theta: 0..2π, left side 0..π.
function featurePoint(s, theta, sex, eyes) {
  const p = basePoint(s, theta, new THREE.Vector3(), sex);
  const th = theta > Math.PI ? 2 * Math.PI - theta : theta; // mirrored angle
  const side = theta > Math.PI ? -1 : 1;
  const nrm = new THREE.Vector3(p.x, p.y * 0.9, 0);
  if (nrm.lengthSq() < 1e-10) nrm.set(0, 1, 0); nrm.normalize();
  let d = 0;
  const thLip = lipTheta(s);
  const front = 1 - smoothstep(RICTUS_S - 0.01, RICTUS_S + 0.012, s);
  // mouth cleft (groove) + upper lip / maxilla ridge + lower lip swelling
  d -= 0.0055 * gauss(th - thLip, 0.045) * front;
  d += 0.0028 * gauss(th - (thLip - 0.16), 0.10) * (1 - smoothstep(MAXILLA_END_S - 0.02, MAXILLA_END_S + 0.004, s)) * smoothstep(0.0, 0.03, s);
  d += 0.0012 * gauss(th - (thLip + 0.14), 0.08) * front;
  // cheek (adductor mandibulae) bulge — large jaw → full cheeks
  d += 0.0095 * sex * gauss(s - 0.185, 0.05) * gauss(th - 1.72, 0.5);
  // interorbital groove & nape
  d -= 0.0045 * gauss(s - 0.105, 0.03) * gauss(th, 0.28);
  // preopercular groove
  d -= 0.0014 * gauss(s - 0.205, 0.006) * smoothstep(1.0, 1.3, th) * (1 - smoothstep(2.3, 2.6, th));
  // opercular margin: crease + overhanging flap lip in front of it
  const sOp = 0.262 + 0.012 * Math.cos(th * 1.3);
  const opMask = smoothstep(0.85, 1.15, th) * (1 - smoothstep(2.7, 2.95, th));
  d -= 0.005 * gauss(s - sOp, 0.0055) * opMask;
  d += 0.0022 * gauss(s - (sOp - 0.012), 0.009) * opMask;
  // pectoral base fleshy lobe
  d += 0.003 * gauss(s - 0.29, 0.012) * gauss(th - 1.62, 0.35);
  // urogenital papilla (just ahead of anal fin)
  d += 0.004 * gauss(s - 0.605, 0.008) * gauss(th - Math.PI, 0.13);
  // chin: slightly swollen symphysis (NO barbels — see Chikuzen-haze check)
  d += 0.002 * gauss(s - 0.02, 0.018) * gauss(th - Math.PI, 0.5);
  p.addScaledVector(nrm, d);

  // eye socket: skin wraps into the socket under the eyeball; raised orbital rim
  const e = side > 0 ? eyes.L : eyes.R;
  const toE = p.clone().sub(e.c); const de = toE.length();
  if (de < EYE_R * 1.02) p.copy(e.c).addScaledVector(toE.normalize(), EYE_R * 0.9);
  else if (de < EYE_R * 1.8) p.addScaledVector(nrm, 0.14 * EYE_R * gauss(de - 1.1 * EYE_R, 0.28 * EYE_R));
  return p;
}

function ringThetas(s, nu, nl) {
  const tl = lipTheta(s);
  const a = [];
  // segment 0: upper-left 0..tl ; segment 1: lower tl..2π-tl ; segment 2: upper-right 2π-tl..2π
  for (let i = 0; i <= nu; i++) a.push({ th: tl * i / nu, seg: 'upper' });
  for (let i = 0; i <= nl; i++) a.push({ th: tl + (2 * Math.PI - 2 * tl) * i / nl, seg: 'lower' });
  for (let i = 0; i <= nu; i++) a.push({ th: 2 * Math.PI - tl + tl * i / nu, seg: 'upper' });
  return a;
}

export function buildBodyGeometry(rig, spec, SL, sex = 1) {
  const eyes = { L: eyeCenter('L', sex), R: eyeCenter('R', sex) };
  const { rings, nu, nl } = spec;
  const R = 2 * (nu + 1) + (nl + 1);
  const pos = [], uv = [], sIdx = [], sW = [], thin = [];
  const segStarts = [0, nu + 1, nu + 1 + nl + 1];
  const segLens = [nu + 1, nl + 1, nu + 1];
  const sList = [];
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1);
    // dense at snout (features) and at caudal base
    let s = 0.5 - 0.5 * Math.cos(Math.PI * t);
    s = lerp(s, Math.pow(t, 1.35), 0.35);
    s = 0.003 + s * (1 - 0.003);
    sList.push(s);
    const ths = ringThetas(s, nu, nl);
    const pr = bodyProfile(s, sex);
    for (const { th, seg } of ths) {
      const p = featurePoint(s, th, sex, eyes);
      pos.push(p.x * SL, p.y * SL, p.z * SL);
      uv.push(s, th / (2 * Math.PI));
      const { idx, wt } = packWeights(rig.bodyWeights(s, th, seg, RICTUS_S));
      sIdx.push(...idx); sW.push(...wt);
      const rad = Math.hypot(p.x, p.y);
      const belly = smoothstep(0.3, 1.0, -Math.cos(th)) * (1 - smoothstep(0.62, 0.7, s)) * smoothstep(0.26, 0.32, s);
      thin.push(clamp(1 - rad / (pr.top + 0.02) * 0.9, 0, 1) * 0.6 + belly * 0.5);
    }
  }
  const idx = [];
  for (let r = 0; r < rings - 1; r++) {
    for (let g = 0; g < 3; g++) {
      for (let k = 0; k < segLens[g] - 1; k++) {
        const a = r * R + segStarts[g] + k, b = a + 1, c = a + R, d = b + R;
        idx.push(a, b, c, b, d, c); // outward-facing (CCW seen from outside)
      }
    }
  }
  // Mouth: lips roll inward (lip-roll ring) into a recessed buccal lining, so an
  // open gape shows lips then a dark cavity — not flat plates. `aInner` marks the
  // lining for the shader. Upper segments follow the Head, lower the Jaw.
  const inner = [];
  const addV = (x, y, z, u, v, w, th, inn) => {
    pos.push(x * SL, y * SL, z * SL); uv.push(u, v);
    const { idx: bi, wt } = packWeights(w); sIdx.push(...bi); sW.push(...wt); thin.push(th); inner[pos.length / 3 - 1] = inn;
    return pos.length / 3 - 1;
  };
  const addTip = (pt, w, v) => addV(pt.x, pt.y, pt.z, pt.z < 0 ? 1 : 0, v, w, 0.2, 0);
  const s0 = sList[0];
  const pr0 = bodyProfile(s0, sex);
  const yLip0 = lipFrac(s0) * pr0.bottom;
  const zc = S0 - s0;
  const cUp = new THREE.Vector3(0, 0.5 * (pr0.top + yLip0), zc), cLo = new THREE.Vector3(0, 0.5 * (yLip0 - pr0.bottom), zc);
  const rollRing = [];
  for (let j = 0; j < R; j++) {
    const seg = (j >= segStarts[1] && j < segStarts[2]) ? 'lower' : 'upper';
    const c = seg === 'lower' ? cLo : cUp;
    const px = pos[j * 3] / SL, py = pos[j * 3 + 1] / SL, pz = pos[j * 3 + 2] / SL;
    // lip roll: 45% toward the arc centre (and toward the lip line), 1.2% SL back
    const x = c.x + (px - c.x) * 0.55, y = c.y + (py - c.y) * 0.55 + (seg === 'lower' ? 0.25 : -0.25) * (yLip0 - c.y) * 0.45;
    rollRing.push(addV(x, y, pz - 0.012, 0.0, uv[j * 2 + 1], seg === 'lower' ? rig.bodyWeights(0.0, Math.PI, 'lower', RICTUS_S) : rig.bodyWeights(0.0, 0, 'upper', RICTUS_S), 0.3, 0.6));
  }
  for (let g = 0; g < 3; g++) for (let k = 0; k < segLens[g] - 1; k++) {
    const a = segStarts[g] + k, b = a + 1, c = rollRing[a], d = rollRing[b];
    idx.push(a, b, c, b, d, c);
  }
  const tipUp = addV(cUp.x, cUp.y - 0.004, zc - 0.035, 0, 0, rig.bodyWeights(0.0, 0, 'upper', RICTUS_S), 0.3, 1);
  const tipLo = addV(cLo.x, cLo.y + 0.004, zc - 0.035, 0, 0.5, rig.bodyWeights(0.0, Math.PI, 'lower', RICTUS_S), 0.3, 1);
  for (let g = 0; g < 3; g++) for (let k = 0; k < segLens[g] - 1; k++) {
    const a = rollRing[segStarts[g] + k], b = rollRing[segStarts[g] + k + 1];
    idx.push(a, b, g === 1 ? tipLo : tipUp);
  }
  // rear cap
  const last = (rings - 1) * R;
  const tail = addTip(new THREE.Vector3(0, 0, S0 - 1.0 - 0.004), rig.axialWeights(1), 0.25);
  for (let g = 0; g < 3; g++) for (let k = 0; k < segLens[g] - 1; k++) idx.push(tail, last + segStarts[g] + k, last + segStarts[g] + k + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  geo.setAttribute('aThin', new THREE.Float32BufferAttribute(thin, 1));
  const innerArr = new Float32Array(pos.length / 3); inner.forEach((v, i) => { innerArr[i] = v || 0; });
  geo.setAttribute('aInner', new THREE.BufferAttribute(innerArr, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Weld normals of coincident split vertices (UV seam everywhere; lips behind rictus)
  const nA = geo.attributes.normal;
  const weld = (i, j) => {
    const x = nA.getX(i) + nA.getX(j), y = nA.getY(i) + nA.getY(j), z = nA.getZ(i) + nA.getZ(j);
    const l = Math.hypot(x, y, z) || 1; nA.setXYZ(i, x / l, y / l, z / l); nA.setXYZ(j, x / l, y / l, z / l);
  };
  for (let r = 0; r < rings; r++) {
    const b = r * R;
    weld(b, b + R - 1); // dorsal seam
    if (sList[r] > RICTUS_S + 0.004) {
      weld(b + nu, b + segStarts[1]);
      weld(b + segStarts[1] + nl, b + segStarts[2]);
    }
  }
  geo.computeBoundingSphere();
  geo.boundingSphere.radius *= 1.6; // skinning headroom
  return { geo, eyes };
}

// Buccal lining: inset loft of the head (same lip split & weights) so the open
// gape and lateral mouth slit reveal a dark cavity instead of an empty shell.
export function buildMouthLining(rig, spec, SL, sex = 1) {
  const eyes = { L: eyeCenter('L', sex), R: eyeCenter('R', sex) };
  const rings = Math.max(8, Math.round(spec.rings * 0.18));
  const nu = Math.max(3, Math.round(spec.nu * 0.6)), nl = Math.max(4, Math.round(spec.nl * 0.6));
  const R = 2 * (nu + 1) + (nl + 1);
  const segStarts = [0, nu + 1, nu + 1 + nl + 1], segLens = [nu + 1, nl + 1, nu + 1];
  const pos = [], sIdx = [], sW = [], idx = [];
  const s0 = 0.012, s1 = 0.24;
  for (let r = 0; r < rings; r++) {
    const s = lerp(s0, s1, r / (rings - 1));
    const inset = lerp(0.72, 0.8, r / (rings - 1));
    for (const { th, seg } of ringThetas(s, nu, nl)) {
      const p = featurePoint(s, th, sex, eyes);
      const yc = lipFrac(Math.min(s, RICTUS_S)) * bodyProfile(s, sex).bottom * 0.5;
      pos.push(p.x * inset * SL, (yc + (p.y - yc) * inset) * SL, (p.z - 0.004) * SL);
      const { idx: bi, wt } = packWeights(rig.bodyWeights(s, th, seg, RICTUS_S)); sIdx.push(...bi); sW.push(...wt);
    }
  }
  for (let r = 0; r < rings - 1; r++) for (let g = 0; g < 3; g++) for (let k = 0; k < segLens[g] - 1; k++) {
    const a = r * R + segStarts[g] + k, b = a + 1, c = a + R, d = b + R; idx.push(a, b, c, b, d, c);
  }
  // close the rear (pharynx) end
  const last = (rings - 1) * R;
  pos.push(0, 0, (S0 - s1 - 0.01) * SL); const { idx: bi, wt } = packWeights(rig.axialWeights(s1)); sIdx.push(...bi); sW.push(...wt);
  const cap = pos.length / 3 - 1;
  for (let g = 0; g < 3; g++) for (let k = 0; k < segLens[g] - 1; k++) idx.push(cap, last + segStarts[g] + k, last + segStarts[g] + k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// Fins. Geometry is a ray-aligned grid (u across rays, v along rays). The
// vertex shader (EdohazeMaterial.finVertex) poses every vertex from base point,
// ray angle and length so that each fin can fold, spread, cup and undulate.
// ---------------------------------------------------------------------------

const deg = Math.PI / 180;
export function finDefs(sex = 1) {
  const P = (s) => bodyProfile(s, sex);
  const z = (s) => S0 - s;
  const defs = {};
  defs.dorsal1 = {
    rays: MORPH.rays.d1, spines: MORPH.rays.d1, bone: null,
    ref: [0, 1, 0], perp: [0, 0, -1], n: [1, 0, 0],
    base: (u) => { const s = lerp(MORPH.d1Origin, MORPH.d1End, u); return [0, P(s).top - 0.004, z(s)]; },
    ang: (u) => lerp(18, 58, u) * deg, fold: 84 * deg,
    len: (u) => 0.125 * (0.62 + 0.38 * Math.sin(Math.PI * (0.18 + 0.78 * u))) * (1 - 0.25 * smoothstep(0.8, 1, u)),
    scallop: 0.28, dots: 1.0, dotLimit: 1.0,
  };
  defs.dorsal2 = {
    rays: MORPH.rays.d2, spines: 1,
    ref: [0, 1, 0], perp: [0, 0, -1], n: [1, 0, 0],
    base: (u) => { const s = lerp(MORPH.d2Origin, MORPH.d2End, u); return [0, P(s).top - 0.003, z(s)]; },
    ang: (u) => lerp(26, 64, u) * deg, fold: 82 * deg,
    len: (u) => 0.13 * (0.72 + 0.28 * Math.sin(Math.PI * (0.25 + 0.75 * u))) * (1 - 0.3 * smoothstep(0.85, 1, u)),
    scallop: 0.12, dots: 1.0, dotLimit: 1.0,
  };
  defs.anal = {
    rays: MORPH.rays.anal, spines: 1,
    ref: [0, -1, 0], perp: [0, 0, -1], n: [1, 0, 0],
    base: (u) => { const s = lerp(MORPH.anOrigin, MORPH.anEnd, u); return [0, -P(s).bottom + 0.003, z(s)]; },
    ang: (u) => lerp(28, 64, u) * deg, fold: 82 * deg,
    len: (u) => 0.105 * (0.72 + 0.28 * Math.sin(Math.PI * (0.25 + 0.75 * u))) * (1 - 0.3 * smoothstep(0.85, 1, u)),
    scallop: 0.1, dots: 0.35, dotLimit: 1.0,
  };
  const pc = P(0.985);
  defs.caudal = {
    rays: MORPH.rays.caudal, spines: 0,
    ref: [0, 0, -1], perp: [0, -1, 0], n: [1, 0, 0],
    base: (u) => [0, lerp(pc.top * 0.95, -pc.bottom * 0.95, u), z(0.985)],
    ang: (u) => lerp(-60, 60, u) * deg, fold: 0,
    len: (u) => MORPH.caudalLength * (0.8 + 0.2 * Math.sin(Math.PI * u)) * (0.55 + 0.45 * smoothstep(0.0, 0.12, u) * (1 - smoothstep(0.88, 1.0, u))),
    scallop: 0.05, dots: 1.0, dotLimit: 0.62, // dotted rows do not reach the lower part (confirmed)
  };
  const pp = P(MORPH.pectoralBase);
  const pecBase = (sign) => (u) => {
    const y = lerp(0.022, -0.058, u);
    const s = MORPH.pectoralBase + 0.006 * Math.sin(Math.PI * u);
    const pb = basePoint(s, Math.acos(clamp(y / (y > 0 ? pp.top : pp.bottom), -1, 1)) * 1);
    return [sign * (Math.abs(pb.x) + 0.002), y, z(s)];
  };
  const pecLen = (u) => MORPH.pectoralLength * Math.pow(Math.sin(Math.PI * (0.06 + 0.9 * u)), 0.55) * (1 - 0.18 * u);
  defs.pectoralL = { rays: MORPH.rays.pectoral, spines: 0, bone: 'PectoralFin_L', ref: [0, 0, -1], perp: [0, -1, 0], n: [1, 0, 0], base: pecBase(1), ang: (u) => lerp(-62, 64, u) * deg, fold: 0, len: pecLen, scallop: 0.06, dots: 0.15, dotLimit: 1 };
  defs.pectoralR = { ...defs.pectoralL, bone: 'PectoralFin_R', n: [-1, 0, 0], base: pecBase(-1) };
  const pv = P(MORPH.pelvicOrigin);
  defs.pelvic = {
    rays: MORPH.rays.pelvic, spines: 0, bone: 'PelvicFin',
    ref: [0, -0.22, -0.975], perp: [1, 0, 0], n: [0, -0.975, 0.22],
    base: (u) => [lerp(-0.034, 0.034, u), -pv.bottom * 0.93, z(MORPH.pelvicOrigin) + 0.012 * Math.sin(Math.PI * u)],
    ang: (u) => lerp(-40, 40, u) * deg, fold: 0,
    len: (u) => MORPH.pelvicLength * (0.78 + 0.22 * Math.sin(Math.PI * u)),
    scallop: 0.04, dots: 0.0, dotLimit: 1, disc: 1,
  };
  return defs;
}

export function buildFinGeometry(def, rig, spec, SL) {
  const across = (def.rays - 1) * spec.finAcross + 1;
  const along = spec.finAlong + 1;
  const pos = [], base = [], fin = [], sIdx = [], sW = [], ang = [];
  const ref = new THREE.Vector3(...def.ref).normalize(), perp = new THREE.Vector3(...def.perp).normalize();
  for (let i = 0; i < across; i++) {
    const u = i / (across - 1);
    const b = def.base(u).map((x) => x * SL);
    const a = def.ang(u); const L = def.len(u) * SL;
    const dir = ref.clone().multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a));
    for (let j = 0; j < along; j++) {
      const v = Math.pow(j / (along - 1), 0.9);
      pos.push(b[0] + dir.x * L * v, b[1] + dir.y * L * v, b[2] + dir.z * L * v);
      base.push(...b); fin.push(u, v, L); ang.push(a);
      let w;
      if (def.bone) w = [[rig.index[def.bone], 1]];
      else { const sAt = S0 - (b[2] + dir.z * L * v) / SL; w = rig.axialWeights(sAt); }
      const { idx, wt } = packWeights(w); sIdx.push(...idx); sW.push(...wt);
    }
  }
  const idx = [];
  for (let i = 0; i < across - 1; i++) for (let j = 0; j < along - 1; j++) {
    const a = i * along + j, b = a + 1, c = a + along, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 3));
  g.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere(); g.boundingSphere.radius *= 2.0;
  const angs = [def.ang(0), def.ang(1)];
  return { geo: g, info: { ref, perp, n: new THREE.Vector3(...def.n).normalize(), aMid: 0.5 * (angs[0] + angs[1]), aRange: angs[1] - angs[0], fold: def.fold } };
}

// ---------------------------------------------------------------------------
// Eye assembly: sclera ball, iris annulus (spherical cap), pupil cavity,
// protruding spherical lens, cornea shell. Built looking down +Z.
// ---------------------------------------------------------------------------
export function buildEye(r, mats, spec) {
  const g = new THREE.Group();
  const seg = spec.eyeSeg;
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(r * 0.985, seg, seg / 2), mats.sclera);
  g.add(sclera);
  const pupilA = 0.56, irisA = 1.12; // half-angles (rad) from optical axis
  if (spec.eyeSeg >= 16) {
    const iris = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg / 2, 0, Math.PI * 2, pupilA, irisA - pupilA), mats.iris);
    iris.rotation.x = Math.PI / 2; // phi=0 → +Y; rotate so cap faces +Z
    g.add(iris);
    const cavity = new THREE.Mesh(new THREE.SphereGeometry(r * 0.93, seg / 2, seg / 4, 0, Math.PI * 2, 0, pupilA + 0.05), mats.pupil);
    cavity.rotation.x = Math.PI / 2; g.add(cavity);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(r * 0.44, seg / 2, seg / 4), mats.lens);
    lens.position.z = r * 0.62; g.add(lens);
    const cornea = new THREE.Mesh(new THREE.SphereGeometry(r * 1.07, seg, seg / 2, 0, Math.PI * 2, 0, 1.05), mats.cornea);
    cornea.rotation.x = Math.PI / 2; cornea.position.z = -r * 0.06; cornea.renderOrder = 3; g.add(cornea);
  } else {
    // far LOD: single sphere with baked iris shading
    sclera.material = mats.farEye;
  }
  return g;
}

export class EdohazeModelBuilder {
  static build({ SL, sex = 1, materials, lodIndex, rig }) {
    const spec = LOD_SPECS[lodIndex];
    const group = new THREE.Group(); group.name = `EdohazeLOD${lodIndex}`;
    const { geo, eyes } = buildBodyGeometry(rig, spec, SL, sex);
    const body = new THREE.SkinnedMesh(geo, materials.body[lodIndex]);
    body.name = 'body'; body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    if (spec.mouth) {
      const lining = new THREE.SkinnedMesh(buildMouthLining(rig, spec, SL, sex), materials.lining);
      lining.name = 'mouthLining'; group.add(lining);
    }
    const fins = {};
    const defs = finDefs(sex);
    const names = lodIndex === 2 ? ['caudal', 'dorsal2', 'pectoralL', 'pectoralR'] : Object.keys(defs);
    for (const k of names) {
      const { geo: fg, info } = buildFinGeometry(defs[k], rig, spec, SL);
      const mat = materials.makeFin(k, defs[k], info, lodIndex);
      const m = new THREE.SkinnedMesh(fg, mat);
      m.name = 'fin_' + k; m.castShadow = lodIndex < 2; m.renderOrder = 2;
      group.add(m); fins[k] = m;
    }
    return { group, body, fins, eyes, spec };
  }
}

export { EYE_R, eyeCenter };
