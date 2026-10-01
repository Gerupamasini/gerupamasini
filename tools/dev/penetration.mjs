// Feather ↔ body interpenetration detector (no browser).
// For every pose / action phase and LOD: pose the bird with KentishPloverAnimator, CPU-skin the body mesh
// (including the body shader's fluff + breathing displacement, breath taken at full inhalation, and the hind-neck
// fill) and the
// feather mesh (including the feather shader's body-contact displacement / arm-tube fold and the worst-case
// inward wind flutter, the folded wing's bend onto its shell), then measure against
// the POSED body triangles (exact closest-point distance near the surface, ray parity for the sign further away):
//   reentry  max depth (mm) of feather surface inside the body AFTER the feather has emerged, along each
//            longitudinal line of the feather (base → tip). A feather may be rooted inside the plumage
//            (rectrix bases, wing bones tucked into the flank pocket) but must not dive back in.
//   dip      a reentry that re-emerges further along (feather dives in and out → slivers / windows)
//   tipIn    a reentry that stays inside to the tip (feather stuck into the body)
//   cross    a folded-wing / body feather emerging from the plumage through the far-side flank (surface
//            facing away from the feather's side): it went through the body
//   under    folded-wing feather emerging from the plumage on the underside of the body (surface normal y < −0.7)
//   poke     body surface visible in front of an exposed feather that should cover it: a body vertex whose
//            inward normal ray hits exposed feather surface within 2.5 mm while its outward ray (15 mm)
//            hits no feather at all (depth = distance to the feather behind it)
//   fin      a tertial / scapular tip more than FIN mm straight above the body: stands up like a fin off the back
//            (clear of the body, so the measures above do not see it)
//   neck     the same two measures where the covering body surface is neck/head plumage (moved > 0.5 mm by
//            the neck bones relative to the chest): the neck lying on the scapulars / shoulder when it bends
//            (preening, rest). Reported separately (two plumage regions in contact, not a feather through
//            the body).
// The arm tube is collapsed to a line by the feather shader from half the fold on (not rendered) and is skipped
// there.
// usage: node tools/dev/penetration.mjs [--lod=0,1,2] [--pose=regex] [--top=15] [--seed=3] [--json=out.json] [--list]
//        [--fine=k]  (k× denser action phases: fold transitions, preen / scratch approach)
import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator, PREEN_VARIANTS } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { FEATHER_TYPE } from '../../src/birds/kentishPlover/anatomy/feathers.js';
import { bodyDisplacementMasks, FLUFF_REST } from '../../src/birds/kentishPlover/anatomy/bodyMesh.js';
import { animation as ANIM, lod as LODCFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';
import { CONFORM_FOLD } from '../../src/birds/kentishPlover/anatomy/wingFold.js';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const LODS = (args.lod ?? '0,1,2').split(',').map(Number);
const poseRe = args.pose ? new RegExp(args.pose) : null;
const TOP = Number(args.top ?? 15);
const SEED = Number(args.seed ?? 3);
// Pass thresholds (mm). LOD0 is seen from any distance: 0.3 mm (dips 0.1 mm). LOD1 / LOD2 are only shown
// from 2.5 / 9 m on (KentishPloverLOD, normalised to a 45° field of view), where one pixel of a 1000 px tall
// view covers 2·d·tan 22.5° / 1000 = 2.1 / 7.5 mm; a third of a pixel is taken as invisible there. At
// LOD1/2 a feather coming out on the far side / underside counts once it sticks out more than that too.
const limitsFor = (lod) => {
  const s = lod === 0 ? 1 : Math.max(1, (2 * LODCFG.distances[lod - 1] * Math.tan(Math.PI / 8)) / 3 / 0.3);
  return { reentry: 0.3 * s, dip: 0.1 * s, poke: 0.3 * s, emerge: lod === 0 ? 0 : 0.3 * s };
};
let LIM = limitsFor(0);
const EPS = 0.02; // mm: inside/outside hysteresis
const FIN = 8; // mm: a tertial / scapular tip further than this straight above the body stands up as a fin
const TNAME = Object.fromEntries(Object.entries(FEATHER_TYPE).map(([k, v]) => [v, k]));
const WINGISH = new Set(['primary', 'secondary', 'tertial', 'primaryCovert', 'greaterCovert', 'medianCovert', 'lesserCovert', 'alula', 'arm']);

// ------------------------------------------------------------------ poses
const FINE = Number(args.fine ?? 1);
const steps = (a, b, s) => { const o = []; for (let t = a; t <= b + 1e-9; t += s / FINE) o.push(+t.toFixed(3)); return o; };
const POSES = [
  ['bind'], ['stand'], ['alert'], ['forage'], ['restOneLeg'], ['restTucked'], ['sit'],
  ...['walk', 'run', 'flight', 'glide'].flatMap((n) => steps(0, 0.875, 0.125).map((t) => [n, t])),
  ...steps(0.1, 0.9, 0.1).map((t) => ['peck', t]),
  ...steps(0.1, 0.9, 0.1).map((t) => ['peck', t, 'crab']),
  ...PREEN_VARIANTS.flatMap((v) => steps(0.1, 0.9, 0.2).map((t) => ['preen', t, v])),
  ...['scratch', 'wingStretch', 'shake', 'footTremble', 'takeoff', 'landing', 'threat'].flatMap((n) => steps(0.1, 0.9, 0.1).map((t) => [n, t])),
].filter((p) => !poseRe || poseRe.test(p.filter((x) => x !== undefined).join(':')));
const poseName = (p) => p[0] + (p[1] !== undefined ? `@${p[1]}` : '') + (p[2] ? `:${p[2]}` : '');
if (args.list) { console.log(POSES.map(poseName).join('\n')); process.exit(0); }

// ------------------------------------------------------------------ geometry helpers (mm, bird-local)
class Grid {
  constructor(cell) { this.cell = cell; this.map = new Map(); this.stamp = null; this.q = 0; }
  key(i, j, k) { return ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512); }
  insert(id, x0, y0, z0, x1, y1, z1) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(y0 / c); j <= Math.floor(y1 / c); j++)
        for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) {
          const key = this.key(i, j, k);
          let a = this.map.get(key);
          if (!a) this.map.set(key, (a = []));
          a.push(id);
        }
  }
  /** unique ids in the cells overlapping the box */
  query(x0, y0, z0, x1, y1, z1, out, n) {
    if (!this.stamp || this.stamp.length < n) this.stamp = new Int32Array(n);
    const q = ++this.q;
    out.length = 0;
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(y0 / c); j <= Math.floor(y1 / c); j++)
        for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) {
          const a = this.map.get(this.key(i, j, k));
          if (!a) continue;
          for (const id of a) if (this.stamp[id] !== q) { this.stamp[id] = q; out.push(id); }
        }
    return out;
  }
}

// closest point on triangle (Ericson 5.1.5) → barycentrics in res[0..2], squared distance returned
function closestBary(px, py, pz, P, ia, ib, ic, res) {
  const ax = P[ia], ay = P[ia + 1], az = P[ia + 2];
  const abx = P[ib] - ax, aby = P[ib + 1] - ay, abz = P[ib + 2] - az;
  const acx = P[ic] - ax, acy = P[ic + 1] - ay, acz = P[ic + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let u, v, w;
  if (d1 <= 0 && d2 <= 0) { u = 1; v = 0; w = 0; } else {
    const bpx = px - P[ib], bpy = py - P[ib + 1], bpz = pz - P[ib + 2];
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { u = 0; v = 1; w = 0; } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t = d1 / (d1 - d3); u = 1 - t; v = t; w = 0; } else {
        const cpx = px - P[ic], cpy = py - P[ic + 1], cpz = pz - P[ic + 2];
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { u = 0; v = 0; w = 1; } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t = d2 / (d2 - d6); u = 1 - t; v = 0; w = t; } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const t = (d4 - d3) / (d4 - d3 + (d5 - d6)); u = 0; v = 1 - t; w = t; } else {
              const den = 1 / (va + vb + vc); v = vb * den; w = vc * den; u = 1 - v - w;
            }
          }
        }
      }
    }
  }
  res[0] = u; res[1] = v; res[2] = w;
  const qx = u * ax + v * P[ib] + w * P[ic] - px, qy = u * ay + v * P[ib + 1] + w * P[ic + 1] - py, qz = u * az + v * P[ib + 2] + w * P[ic + 2] - pz;
  return qx * qx + qy * qy + qz * qz;
}

// Möller–Trumbore: distance along (dx,dy,dz) or −1
function rayTri(ox, oy, oz, dx, dy, dz, P, ia, ib, ic) {
  const e1x = P[ib] - P[ia], e1y = P[ib + 1] - P[ia + 1], e1z = P[ib + 2] - P[ia + 2];
  const e2x = P[ic] - P[ia], e2y = P[ic + 1] - P[ia + 1], e2z = P[ic + 2] - P[ia + 2];
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
  const a = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(a) < 1e-12) return -1;
  const f = 1 / a;
  const sx = ox - P[ia], sy = oy - P[ia + 1], sz = oz - P[ia + 2];
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = f * (dx * qx + dy * qy + dz * qz);
  if (v < 0 || u + v > 1) return -1;
  return f * (e2x * qx + e2y * qy + e2z * qz);
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ per-LOD static analysis
function analyse(model, d) {
  const lod = model.lods[d];
  const body = lod.meshes.find((m) => m.name === `body${d}`);
  const fe = lod.meshes.find((m) => m.name === `feathers${d}`);
  const bg = body.geometry;
  const fg = fe.geometry;
  const B = {
    mesh: body,
    n: bg.getAttribute('position').count,
    pos: bg.getAttribute('position').array,
    nrm: bg.getAttribute('normal').array,
    rest: bg.getAttribute('aRest').array,
    si: bg.getAttribute('skinIndex').array,
    sw: bg.getAttribute('skinWeight').array,
    idx: bg.index.array,
  };
  // body shader displacement masks (mm per unit uniform) — must mirror KentishPloverMaterials.js
  const neckBones = new Set(['neck0', 'neck1', 'neck2', 'head', 'jaw'].map((n) => model.spec.boneIndex[n]));
  B.neckW = new Float64Array(B.n);
  for (let i = 0; i < B.n; i++) for (let k = 0; k < 4; k++) if (neckBones.has(B.si[i * 4 + k])) B.neckW[i] += B.sw[i * 4 + k];
  B.fluffMask = new Float64Array(B.n);
  B.breathMask = new Float64Array(B.n);
  B.napeMask = new Float64Array(B.n);
  for (let i = 0; i < B.n; i++) {
    const [fm, bm, nm] = bodyDisplacementMasks([0, 1, 2].map((k) => B.rest[i * 3 + k]), [0, 1, 2].map((k) => B.nrm[i * 3 + k]));
    B.fluffMask[i] = fm;
    B.breathMask[i] = ANIM.breathAmp * 21 * bm;
    B.napeMask[i] = nm;
  }
  const F = {
    mesh: fe,
    n: fg.getAttribute('position').count,
    pos: fg.getAttribute('position').array,
    nrm: fg.getAttribute('normal').array,
    uv: fg.getAttribute('uv').array,
    ft: fg.getAttribute('aFeather').array,
    si: fg.getAttribute('skinIndex').array,
    sw: fg.getAttribute('skinWeight').array,
    idx: fg.index.array,
    lie: fg.getAttribute('aLie')?.array, // body contact (feather shader), absent in older builds
    lieMask: fg.getAttribute('aLieMask')?.array,
    core: fg.getAttribute('aCore')?.array,
    conform: fg.getAttribute('aConform')?.array, // folded wing bent onto its shell (wingFold.conformAt)
  };
  // feather instances = contiguous runs of vertices with the same (type, index, rnd)
  const inst = [];
  const scapSeen = {};
  for (let v = 0; v < F.n; ) {
    const t = Math.round(F.ft[v * 4]), ix = F.ft[v * 4 + 1], rnd = F.ft[v * 4 + 2];
    let e = v + 1;
    while (e < F.n && Math.round(F.ft[e * 4]) === t && F.ft[e * 4 + 1] === ix && F.ft[e * 4 + 2] === rnd && !(t === FEATHER_TYPE.arm && e - v >= 96)) e++;
    const type = TNAME[t];
    const bone = model.boneList[F.si[v * 4]].name;
    let side = F.ft[v * 4 + 3];
    let name;
    if (WINGISH.has(type)) {
      side = bone.endsWith('_R') ? -1 : 1;
      const S = side > 0 ? 'L' : 'R';
      if (type === 'arm') name = `arm_${S}`;
      else if (type === 'lesserCovert' || type === 'alula' || type === 'primary' || type === 'secondary' || type === 'tertial') name = bone;
      else name = `${{ primaryCovert: 'pc', greaterCovert: 'gc', medianCovert: 'mc' }[type]}${ix}_${S}`;
    } else {
      const S = side > 0 ? 'L' : 'R';
      if (type === 'scapular') {
        const k = `${ix}${S}`;
        const row = (scapSeen[k] = (scapSeen[k] ?? -1) + 1);
        name = `sc${row}_${ix}${S}`;
      } else name = `${{ rectrix: 'r', upperTailCovert: 'utc', underTailCovert: 'ltc' }[type]}${ix + (type === 'rectrix' ? 0 : 0)}${S}`;
    }
    // grid layout
    let nL, cols, lines = [];
    if (type === 'arm') {
      nL = 8; cols = 12;
      for (let s = 0; s < cols; s++) if (F.nrm[(v + s) * 3 + 1] > 0.05) lines.push(Array.from({ length: nL }, (_, i) => v + i * cols + s));
    } else {
      cols = 0;
      while (F.uv[(v + cols) * 2 + 1] < 1e-6 && v + cols < e) cols++;
      nL = (e - v) / cols;
      for (let j = 0; j < cols; j++) lines.push(Array.from({ length: nL }, (_, i) => v + i * cols + j));
      for (let j = 0; j < cols - 1; j++) lines.push(Array.from({ length: nL }, (_, i) => [v + i * cols + j, v + i * cols + j + 1]));
    }
    const loose = (t > 7.5 && t < 10.5) || (t > 1.5 && t < 2.5) ? 1 : 0.35;
    inst.push({ name, type, side, start: v, end: e, nL, cols, lines, loose });
    v = e;
  }
  F.inst = inst;
  F.instOf = new Int32Array(F.n);
  inst.forEach((I, k) => { for (let v = I.start; v < I.end; v++) F.instOf[v] = k; });
  return { B, F };
}

// ------------------------------------------------------------------ skinning
const _m = new THREE.Matrix4();
function boneMatrices(model, mesh) {
  const objInv = new THREE.Matrix4().copy(model.object.matrixWorld).invert();
  const sk = mesh.skeleton;
  const out = new Float64Array(sk.bones.length * 16);
  sk.bones.forEach((b, i) => {
    _m.multiplyMatrices(b.matrixWorld, sk.boneInverses[i]).multiply(mesh.bindMatrix).premultiply(objInv);
    out.set(_m.elements, i * 16);
  });
  return out;
}
// posed position (mm, bird-local) and normal; off = bind-space displacement (metres) before skinning
function skin(M, pos, nrm, si, sw, i, off, P, N) {
  const x = pos[i * 3] + off[0], y = pos[i * 3 + 1] + off[1], z = pos[i * 3 + 2] + off[2];
  let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
  for (let k = 0; k < 4; k++) {
    const w = sw[i * 4 + k];
    if (!w) continue;
    const o = si[i * 4 + k] * 16;
    px += w * (M[o] * x + M[o + 4] * y + M[o + 8] * z + M[o + 12]);
    py += w * (M[o + 1] * x + M[o + 5] * y + M[o + 9] * z + M[o + 13]);
    pz += w * (M[o + 2] * x + M[o + 6] * y + M[o + 10] * z + M[o + 14]);
    const a = nrm[i * 3], b = nrm[i * 3 + 1], c = nrm[i * 3 + 2];
    nx += w * (M[o] * a + M[o + 4] * b + M[o + 8] * c);
    ny += w * (M[o + 1] * a + M[o + 5] * b + M[o + 9] * c);
    nz += w * (M[o + 2] * a + M[o + 6] * b + M[o + 10] * c);
  }
  P[i * 3] = px * 1000; P[i * 3 + 1] = py * 1000; P[i * 3 + 2] = pz * 1000;
  const l = Math.hypot(nx, ny, nz) || 1;
  N[i * 3] = nx / l; N[i * 3 + 1] = ny / l; N[i * 3 + 2] = nz / l;
}

// ------------------------------------------------------------------ measurement of one pose
const R = 2.5; // mm: exact search radius around the body surface
const RAYS = [[0.137, 0.974, 0.181], [-0.881, -0.2, 0.429], [0.662, -0.349, -0.663]].map((d) => { const l = Math.hypot(...d); return d.map((x) => x / l); });
function measure(model, S, anim) {
  const { B, F } = S;
  const bu = B.mesh.material.userData.uniforms;
  const fu = F.mesh.material.userData.uniforms;
  const fluff = bu.uFluff.value - FLUFF_REST; // the shaders displace relative to the relaxed sculpt
  const breath = 0.6 + 0.4 * (anim?.p.sleep ?? 0); // full inhalation (worst case)
  const wind = fu.uWind.value;
  const folded = (fu.uFold.value.isVector2 ? Math.min(fu.uFold.value.x, fu.uFold.value.y) : fu.uFold.value) > 0.9;
  // body midline frame (the body sways / shifts over the support leg): x of a point relative to the chest
  const chestInv = new THREE.Matrix4().copy(model.object.matrixWorld).invert().multiply(model.bones.chest.matrixWorld).invert();
  const _c = new THREE.Vector3();
  const midX = (p) => _c.set(p[0] / 1000, p[1] / 1000, p[2] / 1000).applyMatrix4(chestInv).x * 1000;
  // body
  const MB = boneMatrices(model, B.mesh);
  const BP = new Float64Array(B.n * 3), BN = new Float64Array(B.n * 3);
  const off = [0, 0, 0];
  const neckMoved = new Uint8Array(B.n); // surface carried by the neck / head (vs rigid with the chest)
  const chestO = model.spec.boneIndex.chest * 16;
  for (let i = 0; i < B.n; i++) {
    const disp = (fluff * B.fluffMask[i] + (anim ? breath : 0) * B.breathMask[i] + (bu.uNapeFill?.value ?? 0) * B.napeMask[i]) / 1000;
    for (let k = 0; k < 3; k++) off[k] = B.nrm[i * 3 + k] * disp;
    skin(MB, B.pos, B.nrm, B.si, B.sw, i, off, BP, BN);
    if (B.neckW[i] > 0.02) {
      const x = B.pos[i * 3] + off[0], y = B.pos[i * 3 + 1] + off[1], z = B.pos[i * 3 + 2] + off[2], M = MB, o = chestO;
      const cx = (M[o] * x + M[o + 4] * y + M[o + 8] * z + M[o + 12]) * 1000, cy = (M[o + 1] * x + M[o + 5] * y + M[o + 9] * z + M[o + 13]) * 1000, cz = (M[o + 2] * x + M[o + 6] * y + M[o + 10] * z + M[o + 14]) * 1000;
      neckMoved[i] = Math.hypot(BP[i * 3] - cx, BP[i * 3 + 1] - cy, BP[i * 3 + 2] - cz) > 0.5 ? 1 : 0;
    }
  }
  const nTri = B.idx.length / 3;
  const tg = new Grid(2);
  for (let t = 0; t < nTri; t++) {
    const a = B.idx[t * 3] * 3, b = B.idx[t * 3 + 1] * 3, c = B.idx[t * 3 + 2] * 3;
    tg.insert(t, Math.min(BP[a], BP[b], BP[c]), Math.min(BP[a + 1], BP[b + 1], BP[c + 1]), Math.min(BP[a + 2], BP[b + 2], BP[c + 2]), Math.max(BP[a], BP[b], BP[c]), Math.max(BP[a + 1], BP[b + 1], BP[c + 1]), Math.max(BP[a + 2], BP[b + 2], BP[c + 2]));
  }
  let bmin = [1e9, 1e9, 1e9], bmax = [-1e9, -1e9, -1e9];
  for (let i = 0; i < B.n; i++) for (let k = 0; k < 3; k++) { bmin[k] = Math.min(bmin[k], BP[i * 3 + k]); bmax[k] = Math.max(bmax[k], BP[i * 3 + k]); }
  const cand = [];
  const bary = [0, 0, 0];
  // signed distance to the posed body (mm, + outside); nearest surface normal in sdN
  const sdN = [0, 0, 0];
  const sdC = [0, 0, 0];
  let sdNeck = 0; // how much the closest body surface belongs to the neck / head
  // Where the neck / head plumage folds over the shoulders (head turned, bent down to preen) the body mesh
  // overlaps itself: a point under the trunk's surface may lie nearest to the inner side of the neck sheet and
  // read as outside. There the trunk surface alone decides (the neck lying on the shoulder is the separate
  // `neck` measure).
  function sd(px, py, pz, r = R) {
    const d = sd0(px, py, pz, r, false);
    if (d <= 0 || !sdNeck) return d;
    const keep = [sdN[0], sdN[1], sdN[2], sdC[0], sdC[1], sdC[2], sdNeck];
    const dt = sd0(px, py, pz, r, true);
    if (dt < 0 && dt > -r) return dt;
    [sdN[0], sdN[1], sdN[2], sdC[0], sdC[1], sdC[2], sdNeck] = keep;
    return d;
  }
  function sd0(px, py, pz, r, trunkOnly) {
    if (px < bmin[0] - r || py < bmin[1] - r || pz < bmin[2] - r || px > bmax[0] + r || py > bmax[1] + r || pz > bmax[2] + r) { sdN[0] = sdN[1] = sdN[2] = 0; return 99; }
    tg.query(px - r, py - r, pz - r, px + r, py + r, pz + r, cand, nTri);
    let best = r * r, bt = -1, bu0 = 0, bv0 = 0, bw0 = 0;
    for (const t of cand) {
      if (trunkOnly && (neckMoved[B.idx[t * 3]] || neckMoved[B.idx[t * 3 + 1]] || neckMoved[B.idx[t * 3 + 2]])) continue;
      const d2 = closestBary(px, py, pz, BP, B.idx[t * 3] * 3, B.idx[t * 3 + 1] * 3, B.idx[t * 3 + 2] * 3, bary);
      if (d2 < best) { best = d2; bt = t; bu0 = bary[0]; bv0 = bary[1]; bw0 = bary[2]; }
    }
    if (bt >= 0) {
      const a = B.idx[bt * 3] * 3, b = B.idx[bt * 3 + 1] * 3, c = B.idx[bt * 3 + 2] * 3;
      let nx = bu0 * BN[a] + bv0 * BN[b] + bw0 * BN[c], ny = bu0 * BN[a + 1] + bv0 * BN[b + 1] + bw0 * BN[c + 1], nz = bu0 * BN[a + 2] + bv0 * BN[b + 2] + bw0 * BN[c + 2];
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      sdN[0] = nx; sdN[1] = ny; sdN[2] = nz;
      const cx = bu0 * BP[a] + bv0 * BP[b] + bw0 * BP[c], cy = bu0 * BP[a + 1] + bv0 * BP[b + 1] + bw0 * BP[c + 1], cz = bu0 * BP[a + 2] + bv0 * BP[b + 2] + bw0 * BP[c + 2];
      sdC[0] = cx; sdC[1] = cy; sdC[2] = cz;
      sdNeck = neckMoved[B.idx[bt * 3]] + neckMoved[B.idx[bt * 3 + 1]] + neckMoved[B.idx[bt * 3 + 2]];
      const dist = Math.sqrt(best);
      // near the surface the interpolated normal gives the side; further away (closest point on an edge or
      // vertex of a coarse LOD mesh, whose normal can point anywhere) the ray parity does
      if (dist <= R) return (px - cx) * nx + (py - cy) * ny + (pz - cz) * nz < 0 ? -dist : dist;
      return inside(px, py, pz) ? -dist : dist;
    }
    // far from the surface: parity of crossings
    sdN[0] = sdN[1] = sdN[2] = 0;
    sdNeck = 0;
    return inside(px, py, pz) ? -R : R;
  }
  // inside test: majority of the crossing parities along three rays (a single ray is fooled where it grazes an
  // edge or a vertex, or crosses the few non-manifold edges of the coarse LOD2 mesh)
  function parity(px, py, pz, D) {
    let hits = 0;
    const seen = new Set();
    for (let s = 0; s < 120; s += 1) {
      const qx = px + D[0] * s, qy = py + D[1] * s, qz = pz + D[2] * s;
      if (qx < bmin[0] - 1 || qy < bmin[1] - 1 || qz < bmin[2] - 1 || qx > bmax[0] + 1 || qy > bmax[1] + 1 || qz > bmax[2] + 1) break;
      tg.query(qx - 0.6, qy - 0.6, qz - 0.6, qx + 0.6, qy + 0.6, qz + 0.6, cand, nTri);
      for (const t of cand) {
        if (seen.has(t)) continue;
        seen.add(t);
        if (rayTri(px, py, pz, D[0], D[1], D[2], BP, B.idx[t * 3] * 3, B.idx[t * 3 + 1] * 3, B.idx[t * 3 + 2] * 3) > 0) hits++;
      }
    }
    return hits % 2;
  }
  const inside = (px, py, pz) => RAYS.reduce((n, D) => n + parity(px, py, pz, D), 0) >= 2;
  // height of a point above the body straight below it (0 if the vertical misses the body: a feather trailing
  // beside it, or the point is inside)
  function dropToBody(px, py, pz) {
    if (sd(px, py, pz) <= 0) return 0;
    const seen = new Set();
    let best = 0;
    for (let s = 0; s < 80; s += 1) {
      const qy = py - s;
      if (qy < bmin[1] - 1) break;
      tg.query(px - 0.6, qy - 0.6, pz - 0.6, px + 0.6, qy + 0.6, pz + 0.6, cand, nTri);
      for (const t of cand) {
        if (seen.has(t)) continue;
        seen.add(t);
        const h = rayTri(px, py, pz, 0, -1, 0, BP, B.idx[t * 3] * 3, B.idx[t * 3 + 1] * 3, B.idx[t * 3 + 2] * 3);
        if (h > 0 && (!best || h < best)) best = h;
      }
      if (best) break;
    }
    return best;
  }

  // feathers
  const MF = boneMatrices(model, F.mesh);
  const FP = new Float64Array(F.n * 3), FN = new Float64Array(F.n * 3);
  const foldLR = fu.uFold.value.isVector2 ? [fu.uFold.value.x, fu.uFold.value.y] : [fu.uFold.value, fu.uFold.value];
  for (let i = 0; i < F.n; i++) {
    off[0] = off[1] = off[2] = 0;
    if (F.lie) {
      // same as the feather vertex shader: body contact (wing only while folded) + arm tube folding away
      const t = Math.round(F.ft[i * 4]);
      const fold = F.pos[i * 3] >= 0 ? foldLR[0] : foldLR[1];
      const k = (t < 7.5 || t === FEATHER_TYPE.arm ? fold : 1) * (fluff * 0.001 * F.lieMask[i * 2] + (anim ? breath : 0) * ANIM.breathAmp * 0.021 * F.lieMask[i * 2 + 1]);
      const kc = F.conform ? smooth(CONFORM_FOLD[0], CONFORM_FOLD[1], fold) : 0;
      for (let c = 0; c < 3; c++) off[c] = F.lie[i * 3 + c] * k + F.core[i * 3 + c] * smooth(0, 0.5, fold) + (kc ? F.conform[i * 3 + c] * kc : 0);
    }
    skin(MF, F.pos, F.nrm, F.si, F.sw, i, off, FP, FN);
  }
  const nFT = F.idx.length / 3;
  const fg = new Grid(2);
  for (let t = 0; t < nFT; t++) {
    const a = F.idx[t * 3] * 3, b = F.idx[t * 3 + 1] * 3, c = F.idx[t * 3 + 2] * 3;
    fg.insert(t, Math.min(FP[a], FP[b], FP[c]), Math.min(FP[a + 1], FP[b + 1], FP[c + 1]), Math.min(FP[a + 2], FP[b + 2], FP[c + 2]), Math.max(FP[a], FP[b], FP[c]), Math.max(FP[a + 1], FP[b + 1], FP[c + 1]), Math.max(FP[a + 2], FP[b + 2], FP[c + 2]));
  }
  const fc = [];
  // is anything of the plumage (other than feather `own`) in front of the body point (x,y,z) along n?
  const DOUT = 15;
  function coveredAbove(x, y, z, nx, ny, nz, own) {
    const seen = new Set();
    for (let s = 0; s <= DOUT; s += 1) {
      const qx = x + nx * s, qy = y + ny * s, qz = z + nz * s;
      fg.query(qx - 1, qy - 1, qz - 1, qx + 1, qy + 1, qz + 1, fc, nFT);
      for (const t of fc) {
        if (seen.has(t)) continue;
        seen.add(t);
        if (own >= 0 && F.instOf[F.idx[t * 3]] === own) continue;
        const h = rayTri(x, y, z, nx, ny, nz, FP, F.idx[t * 3] * 3, F.idx[t * 3 + 1] * 3, F.idx[t * 3 + 2] * 3);
        if (h > 0 && h < DOUT) return true;
      }
    }
    return false;
  }
  const exposed = new Uint8Array(F.n); // vertex lies past the feather's emergence point along its line
  const res = [];
  const SUB = 4;
  F.inst.forEach((I, own) => {
    const r = { name: I.name, type: I.type, reentry: 0, dip: 0, tipIn: 0, vis: 0, visDip: 0, neck: 0, cross: 0, under: 0, buried: 0, at: null, visAt: null };
    if (I.type === 'arm' && foldLR[I.side > 0 ? 0 : 1] >= 0.5) {
      res.push(r); // folded away (degenerate), not rendered
      return;
    }
    for (const line of I.lines) {
      let emerged = false, inside = false, depth = 0, visDepth = 0, lineDip = 0, lineVisDip = 0;
      let pend = null, outMax = 0; // underside / far-side emergence, counted once it sticks out > LIM.emerge
      const settle = () => {
        if (pend && outMax > LIM.emerge) {
          if (pend.under) [r.under, r.underAt, r.underN] = [r.under + 1, pend.under.at, pend.under.n];
          if (pend.cross) r.cross++;
        }
        pend = null;
        outMax = 0;
      };
      let insideAfter = 0;
      for (let i = 0; i < line.length; i++) {
        const nsub = i === line.length - 1 ? 1 : SUB;
        for (let s = 0; s < nsub; s++) {
          const f = s / SUB;
          const p = [0, 0, 0];
          const pt = (a) => (Array.isArray(a) ? [0, 1, 2].map((k) => (FP[a[0] * 3 + k] + FP[a[1] * 3 + k]) / 2) : [FP[a * 3], FP[a * 3 + 1], FP[a * 3 + 2]]);
          const A = pt(line[i]);
          const Bq = i + 1 < line.length ? pt(line[i + 1]) : A;
          for (let k = 0; k < 3; k++) p[k] = A[k] + (Bq[k] - A[k]) * f;
          const vi = Array.isArray(line[i]) ? line[i][0] : line[i];
          const tt = F.uv[vi * 2 + 1] + (i + 1 < line.length ? (F.uv[(Array.isArray(line[i + 1]) ? line[i + 1][0] : line[i + 1]) * 2 + 1] - F.uv[vi * 2 + 1]) * f : 0);
          const flutter = wind * I.loose * 0.35 * tt * tt; // worst-case inward flutter (feather shader)
          let d = sd(p[0], p[1], p[2]);
          if (d <= -R && emerged) d = Math.max(sd(p[0], p[1], p[2], 12), -12); // true depth of a deep reentry
          d -= flutter;
          if (args.probe && I.name === args.probe) (r.prof ??= []).push(`${p.map((x) => x.toFixed(1)).join(",")}:${d.toFixed(2)}${sdNeck ? "n" : ""}`);
          if (d > EPS) {
            outMax = Math.max(outMax, d);
            if (inside && emerged && insideAfter > 0) { lineDip = Math.max(lineDip, depth); lineVisDip = Math.max(lineVisDip, visDepth); }
            // a folded-wing feather coming out of the plumage on the underside (belly / lower breast), or a
            // feather coming out through the far-side flank (it went through the body)
            if (inside && folded && WINGISH.has(I.type) && sdN[1] < -0.7) (pend ??= {}).under = { at: p.map((x) => +x.toFixed(1)), n: sdN.map((x) => +x.toFixed(2)) };
            // (not where the surface it comes out of is neck plumage lying over it — the neck turned back over the
            // scapulars when preening the far wing: two plumage regions in contact, reported as neck)
            if (inside && folded && I.type !== 'rectrix' && sdN[0] * I.side < -0.5 && !sdNeck) (pend ??= {}).cross = true;
            // (a line only counts as emerged once it sticks out further than the dip it may make — at LOD1/2
            // past the LOD's limit: a buried feather's edge grazing the outline by less shows nothing more
            // than a tolerated dip does)
            if (!emerged && d > Math.max(EPS, LIM.dip, LIM.emerge)) emerged = true;
            inside = false;
            insideAfter = 0;
            depth = visDepth = 0;
            // exposure checks
          } else if (d < -EPS) {
            settle();
            inside = true;
            if (emerged) {
              insideAfter++;
              depth = Math.max(depth, -d);
              if (-d > r.reentry) { r.reentry = -d; r.at = p.map((x) => +x.toFixed(1)); }
              // visible unless other plumage lies in front of the body surface above this point
              const vis = sdN[0] || sdN[1] || sdN[2] ? !coveredAbove(sdC[0] + sdN[0] * 0.01, sdC[1] + sdN[1] * 0.01, sdC[2] + sdN[2] * 0.01, sdN[0], sdN[1], sdN[2], own) : true;
              if (vis && sdNeck > 0) r.neck = Math.max(r.neck, -d);
              else if (vis) {
                visDepth = Math.max(visDepth, -d);
                if (-d > r.vis) { r.vis = -d; r.visAt = p.map((x) => +x.toFixed(1)); r.visNeck = sdNeck; }
              }
            }
          }
          if (s === 0) {
            const mark = (a) => { if (emerged && !inside) exposed[a] = 1; };
            if (Array.isArray(line[i])) { mark(line[i][0]); mark(line[i][1]); } else mark(line[i]);
          }
        }
      }
      settle();
      if (r.prof) { console.log("   line", r.prof.join("  ")); r.prof = []; }
      if (!emerged) r.buried++;
      if (inside && emerged) r.tipIn = Math.max(r.tipIn, depth);
      r.dip = Math.max(r.dip, lineDip);
      r.visDip = Math.max(r.visDip, lineVisDip);
    }
    r.buried = r.buried === I.lines.length ? 1 : 0;
    // fin: a tertial / scapular tip standing up off the back (closest body surface faces up) — clear of the body,
    // so none of the measures above sees it (tertials raised like fins in flight passed them)
    r.fin = 0;
    if (I.type === 'tertial' || I.type === 'scapular') {
      for (const line of I.lines) {
        const a = line[line.length - 1];
        const vi = Array.isArray(a) ? a[0] : a;
        const d = dropToBody(FP[vi * 3], FP[vi * 3 + 1], FP[vi * 3 + 2]);
        if (d > r.fin) { r.fin = d; r.finAt = [FP[vi * 3], FP[vi * 3 + 1], FP[vi * 3 + 2]].map((x) => +x.toFixed(1)); }
      }
    }
    res.push(r);
  });

  // body poking through exposed feathers
  let poke = 0, pokeN = 0, pokeName = '', pokeAt = null, pokeNeck = 0;
  const pokeBy = {};
  const DIN = 2.5;
  for (let i = 0; i < B.n; i++) {
    const vx = BP[i * 3], vy = BP[i * 3 + 1], vz = BP[i * 3 + 2];
    const nx = BN[i * 3], ny = BN[i * 3 + 1], nz = BN[i * 3 + 2];
    fg.query(Math.min(vx, vx - nx * DIN), Math.min(vy, vy - ny * DIN), Math.min(vz, vz - nz * DIN), Math.max(vx, vx - nx * DIN), Math.max(vy, vy - ny * DIN), Math.max(vz, vz - nz * DIN), fc, nFT);
    let sIn = 1e9, tIn = -1;
    for (const t of fc) {
      const a = F.idx[t * 3], b = F.idx[t * 3 + 1], c = F.idx[t * 3 + 2];
      if (!(exposed[a] && exposed[b] && exposed[c])) continue;
      const s = rayTri(vx, vy, vz, -nx, -ny, -nz, FP, a * 3, b * 3, c * 3);
      if (s > 0 && s < DIN && s < sIn) { sIn = s; tIn = t; }
    }
    if (tIn < 0) continue;
    // visible from outside along the normal?
    if (coveredAbove(vx, vy, vz, nx, ny, nz, -1)) continue;
    const who = F.inst[F.instOf[F.idx[tIn * 3]]].name;
    if (neckMoved[i]) {
      pokeNeck = Math.max(pokeNeck, sIn);
      continue;
    }
    if (sIn > 0.1) pokeN++;
    pokeBy[who] = Math.max(pokeBy[who] ?? 0, sIn);
    if (sIn > poke) { poke = sIn; pokeName = who; pokeAt = [vx, vy, vz].map((x) => +x.toFixed(1)); }
  }
  return { fluff: fluff + FLUFF_REST, wind, feathers: res, poke, pokeN, pokeName, pokeAt, pokeBy, pokeNeck };
}

// ------------------------------------------------------------------ run
const summary = {};
let fail = 0;
for (const d of LODS) {
  LIM = limitsFor(d);
  const model = new KentishPloverModel({ lods: [d], shadows: false });
  const S = analyse(model, d);
  // sanity: own skinning == three.js CPU skinning
  {
    const M = boneMatrices(model, S.F.mesh);
    const P = new Float64Array(S.F.n * 3), N = new Float64Array(S.F.n * 3);
    const v = new THREE.Vector3();
    let err = 0;
    for (let i = 0; i < S.F.n; i += 97) { skin(M, S.F.pos, S.F.nrm, S.F.si, S.F.sw, i, [0, 0, 0], P, N); S.F.mesh.getVertexPosition(i, v).applyMatrix4(S.F.mesh.matrixWorld).multiplyScalar(1000); err = Math.max(err, Math.hypot(v.x - P[i * 3], v.y - P[i * 3 + 1], v.z - P[i * 3 + 2])); }
    if (err > 1e-3) throw new Error(`skinning mismatch ${err}`);
  }
  console.log(`\n=== LOD${d}: ${S.F.inst.length} feathers, ${S.B.idx.length / 3} body tris — limits: visible reentry ≤ ${LIM.reentry.toFixed(2)} mm, visible dip ≤ ${LIM.dip.toFixed(2)} mm, no cross/under${LIM.emerge ? ` (> ${LIM.emerge.toFixed(2)} mm)` : ""}, poke ≤ ${LIM.poke.toFixed(2)} mm`);
  console.log('  pose'.padEnd(24), 'fluff | vis.reentry worst feather   | vdips cross under | poke   behind          n>0.1 | neck | fin (mm) | (all reentry, feather; buried)');
  const worstByFeather = {};
  const rows = [];
  for (const P of POSES) {
    let anim = null;
    if (P[0] === 'bind') {
      for (const b of model.boneList) { b.position.copy(b.userData.bindLocalPos); b.quaternion.copy(b.userData.bindLocalQuat); }
      model.setFluff(0); model.setBreath(0); model.setWingFold(0);
      model.object.updateMatrixWorld(true);
    } else {
      anim = new KentishPloverAnimator(model, { seed: SEED });
      anim.previewAction(P[0], P[1] ?? 0.3, P[2]);
      model.object.updateMatrixWorld(true);
    }
    const m = measure(model, S, anim);
    const w = m.feathers.reduce((a, r) => (r.vis > a.vis ? r : a), { vis: 0, name: '-' });
    const wa = m.feathers.reduce((a, r) => (r.reentry > a.reentry ? r : a), { reentry: 0, name: '-' });
    const dips = m.feathers.filter((r) => r.visDip > LIM.dip).length;
    const cross = m.feathers.filter((r) => r.cross > 0).length;
    const under = m.feathers.filter((r) => r.under > 0).length;
    const buried = m.feathers.filter((r) => r.buried).length;
    const neck = Math.max(m.pokeNeck, ...m.feathers.map((r) => r.neck));
    const fin = m.feathers.reduce((a, r) => (r.fin > a.fin ? r : a), { fin: 0, name: '-' });
    // (not in the wing stretch: both wings are raised straight up over the back and the tertials go up with them)
    const bad = w.vis > LIM.reentry || dips || cross || under || m.poke > LIM.poke || (fin.fin > FIN && P[0] !== 'wingStretch');
    if (bad) fail++;
    const name = poseName(P);
    console.log(`${bad ? '✗' : ' '} ${name.padEnd(21)} ${m.fluff.toFixed(2).padStart(5)} | ${w.vis.toFixed(2).padStart(6)}  ${w.name.padEnd(18)} | ${String(dips).padStart(5)} ${String(cross).padStart(5)} ${String(under).padStart(5)} | ${m.poke.toFixed(2).padStart(5)}  ${(m.pokeName || '-').padEnd(16)} ${String(m.pokeN).padStart(4)} | ${neck.toFixed(2)} | ${fin.fin.toFixed(1).padStart(4)} ${fin.fin > 0 ? fin.name.padEnd(8) : '-'.padEnd(8)} | (${wa.reentry.toFixed(2)} ${wa.name}; ${buried})`);
    for (const r of m.feathers) {
      const o = (worstByFeather[r.name] ??= { name: r.name, type: r.type, vis: 0, visDip: 0, reentry: 0, cross: 0, under: 0, poke: 0, pose: '', at: null });
      if (r.vis > o.vis) { o.vis = r.vis; o.pose = name; o.at = r.visAt; }
      o.visDip = Math.max(o.visDip, r.visDip);
      o.reentry = Math.max(o.reentry, r.reentry);
      o.cross += r.cross ? 1 : 0;
      o.under += r.under ? 1 : 0;
      if (args.verbose && (r.vis > LIM.reentry || r.visDip > LIM.dip || r.cross || r.under)) console.log(`      ${r.name} vis ${r.vis.toFixed(2)} visDip ${r.visDip.toFixed(2)} (all: reentry ${r.reentry.toFixed(2)} dip ${r.dip.toFixed(2)} tipIn ${r.tipIn.toFixed(2)}) neck ${r.visNeck ?? "-"} cross ${r.cross} under ${r.under}${r.underAt ? ` (emerges @${r.underAt} n ${r.underN})` : ""} at ${r.visAt ?? r.at}`);
    }
    for (const [k, v] of Object.entries(m.pokeBy)) { const o = worstByFeather[k]; if (o && v > o.poke) { o.poke = v; o.pokePose = name; } }
    if (args.verbose && m.poke > LIM.poke) console.log(`      poke ${m.poke.toFixed(2)} behind ${m.pokeName} at body ${m.pokeAt}`);
    rows.push({ pose: name, fluff: m.fluff, vis: w.vis, worst: w.name, dips, cross, under, poke: m.poke, pokeBy: m.pokeName, pokeN: m.pokeN, neck, fin: fin.fin, finBy: fin.name, reentry: wa.reentry, buried });
  }
  const top = Object.values(worstByFeather).filter((o) => o.vis > LIM.reentry || o.visDip > LIM.dip || o.cross || o.under || o.poke > LIM.poke).sort((a, b) => Math.max(b.vis, b.poke) - Math.max(a.vis, a.poke));
  console.log(`-- LOD${d} feathers over the limits (${top.length}):`);
  for (const o of top.slice(0, TOP)) console.log(`   ${o.name.padEnd(18)} ${o.type.padEnd(15)} vis ${o.vis.toFixed(2)} (${o.pose}${o.at ? ' @' + o.at.join(',') : ''}) visDip ${o.visDip.toFixed(2)} cross×${o.cross} under×${o.under} poke ${o.poke.toFixed(2)}${o.pokePose ? ` (${o.pokePose})` : ''}`);
  summary[`LOD${d}`] = { rows, worst: top };
}
if (args.json) writeFileSync(args.json, JSON.stringify(summary, null, 1));
console.log(`\n${fail ? `${fail} pose×LOD over the limits` : 'all poses within limits'}`);
process.exitCode = fail ? 1 : 0;
