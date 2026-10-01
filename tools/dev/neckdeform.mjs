// Neck / head plumage deformation quality (no browser). For head yaw / pitch / roll sweeps, the sleep tuck, every
// preen variant, the scratch and the peck: pose the bird, skin the body mesh on the CPU (mesh.applyBoneTransform —
// the same skinning as the body shader) and measure every triangle of the head / neck / upper-breast region
// against its rest shape:
//   stretch   largest principal stretch of the triangle (posed / rest edge length along that direction)
//   squash    smallest principal stretch (→ 0: the plumage collapses into a sheet)
//   aniso     stretch / squash (shear: a twisted sleeve smears the plumage pattern into streaks)
//   flip      triangles turned over (posed normal against the skinned rest normal: a fold)
//   crease    largest increase (deg) of the angle between neighbouring triangles over rest (a fold / pinch)
//   area      posed / rest area of the whole region (volume of plumage preserved: ≈1)
// usage: node tools/dev/neckdeform.mjs [--lod=0,1,2] [--pose=regex] [--json=out.json]
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator, PREEN_VARIANTS } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const LODS = (args.lod ?? '1').split(',').map(Number);
const poseRe = args.pose ? new RegExp(args.pose) : null;
const DEG = Math.PI / 180;

// [name, kind, ...]: gaze poses are the relaxed stand with a fixed gaze (yaw, pitch, roll); actions previewed at t
const POSES = [];
for (const y of [-110, -90, -70, -45, -20, 0, 20, 45, 70, 90, 110]) POSES.push([`yaw${y}`, 'gaze', y * DEG, 0.02, 0]);
for (const p of [-50, -30, 30, 60]) POSES.push([`pitch${p}`, 'gaze', 0, p * DEG, 0]);
for (const r of [-45, -25, 25, 45]) POSES.push([`roll${r}`, 'gaze', 0, 0.02, r * DEG]);
for (const [y, p, r] of [[90, -30, 30], [-90, 40, -30], [110, 30, 0], [-110, -30, 0], [60, 50, 40]]) POSES.push([`y${y}p${p}r${r}`, 'gaze', y * DEG, p * DEG, r * DEG]);
POSES.push(['restTucked', 'act', 'restTucked'], ['restOneLeg', 'act', 'restOneLeg'], ['alert', 'act', 'alert'], ['forage', 'act', 'forage'], ['sit', 'act', 'sit']);
for (const v of PREEN_VARIANTS) for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) POSES.push([`preen:${v}@${t}`, 'act', 'preen', t, v]);
for (const t of [0.2, 0.4, 0.5, 0.6, 0.8]) POSES.push([`scratch@${t}`, 'act', 'scratch', t]);
for (const v of [undefined, 'crab', 'amphipod']) for (const t of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) POSES.push([`peck${v ? ':' + v : ''}@${t}`, 'act', 'peck', t, v]);
for (const t of [0.3, 0.6]) POSES.push([`shake@${t}`, 'act', 'shake', t]);
const sel = POSES.filter((p) => !poseRe || poseRe.test(p[0]));

const inRegion = (x, y, z) => y > 68 && z > -14; // head, neck, nape, upper breast / mantle front (rest mm)

const summary = {};
for (const d of LODS) {
  const model = new KentishPloverModel({ lods: [d], shadows: false });
  const body = model.lods[d].meshes.find((m) => m.name === `body${d}`);
  const g = body.geometry;
  const R = g.getAttribute('aRest').array;
  const RN = g.getAttribute('normal').array;
  const idx = g.index.array;
  const n = R.length / 3;
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const cx = (R[a * 3] + R[b * 3] + R[c * 3]) / 3, cy = (R[a * 3 + 1] + R[b * 3 + 1] + R[c * 3 + 1]) / 3, cz = (R[a * 3 + 2] + R[b * 3 + 2] + R[c * 3 + 2]) / 3;
    if (inRegion(cx, cy, cz)) tris.push(t / 3);
  }
  // neighbouring triangle pairs inside the region (shared edges) for the crease measure
  const edgeMap = new Map();
  const pairs = [];
  for (const T of tris) {
    for (let e = 0; e < 3; e++) {
      const a = idx[T * 3 + e], b = idx[T * 3 + ((e + 1) % 3)];
      const key = a < b ? a * n + b : b * n + a;
      const o = edgeMap.get(key);
      if (o === undefined) edgeMap.set(key, T);
      else pairs.push([o, T]);
    }
  }
  const triN = (P, T, out) => {
    const [a, b, c] = [idx[T * 3], idx[T * 3 + 1], idx[T * 3 + 2]];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    const l = Math.hypot(out[0], out[1], out[2]);
    return l;
  };
  const restCrease = new Float32Array(pairs.length);
  {
    const n1 = [0, 0, 0], n2 = [0, 0, 0];
    pairs.forEach(([A, B], i) => {
      const l1 = triN(R, A, n1), l2 = triN(R, B, n2);
      restCrease[i] = Math.acos(Math.max(-1, Math.min(1, (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (l1 * l2 || 1))));
    });
  }
  console.log(`\n=== LOD${d}: ${tris.length} head/neck triangles`);
  console.log('pose'.padEnd(22), 'stretch  squash  aniso  p99an  flip  crease  creaseN  area');
  const rows = [];
  for (const P of sel) {
    const anim = new KentishPloverAnimator(model, { seed: 3 });
    if (P[1] === 'gaze') {
      anim.previewAction('stand', 0.3);
      const [yaw, pitch, roll] = P.slice(2);
      Object.assign(anim.gaze, { yaw, tYaw: yaw, pitch, tPitch: pitch, roll, tRoll: roll, timer: 1e9, mode: 'idle' });
      for (let i = 0; i < 30; i++) anim.update(1 / 60);
    } else anim.previewAction(P[2], P[3] ?? 0.3, P[4]);
    model.object.position.set(0, 0, 0);
    model.object.quaternion.identity();
    model.object.updateMatrixWorld(true);
    const Pp = new Float32Array(n * 3);
    const Np = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    const used = new Uint8Array(n);
    for (const T of tris) for (let k = 0; k < 3; k++) used[idx[T * 3 + k]] = 1;
    const skinN = body.skinNormal ? (i, out) => body.skinNormal(i, out) : null;
    for (let i = 0; i < n; i++) {
      if (!used[i]) continue;
      body.getVertexPosition(i, v);
      v.applyMatrix4(body.matrixWorld).multiplyScalar(1000);
      Pp[i * 3] = v.x; Pp[i * 3 + 1] = v.y; Pp[i * 3 + 2] = v.z;
      // skinned rest normal (dominant-bone rotation is enough to tell a turned-over triangle)
      if (skinN) skinN(i, v); else {
        const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
        v.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k);
          if (!w) continue;
          const bi = si.getComponent(i, k);
          const m = new THREE.Matrix4().multiplyMatrices(body.skeleton.bones[bi].matrixWorld, body.skeleton.boneInverses[bi]);
          v.addScaledVector(new THREE.Vector3(RN[i * 3], RN[i * 3 + 1], RN[i * 3 + 2]).transformDirection(m), w);
        }
      }
      v.normalize();
      Np[i * 3] = v.x; Np[i * 3 + 1] = v.y; Np[i * 3 + 2] = v.z;
    }
    let sMax = 0, qMin = Infinity, aMax = 0, flip = 0, aRest = 0, aPose = 0;
    const an = [];
    let worstAt = null;
    for (const T of tris) {
      const [a, b, c] = [idx[T * 3], idx[T * 3 + 1], idx[T * 3 + 2]];
      // rest triangle in its own 2-D frame
      const e1 = [R[b * 3] - R[a * 3], R[b * 3 + 1] - R[a * 3 + 1], R[b * 3 + 2] - R[a * 3 + 2]];
      const e2 = [R[c * 3] - R[a * 3], R[c * 3 + 1] - R[a * 3 + 1], R[c * 3 + 2] - R[a * 3 + 2]];
      const l1 = Math.hypot(...e1);
      if (l1 < 1e-6) continue;
      const ux = e1.map((x) => x / l1);
      const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const A0 = Math.hypot(...nn) / 2;
      if (A0 < 1e-4) continue;
      const vy = [nn[1] * ux[2] - nn[2] * ux[1], nn[2] * ux[0] - nn[0] * ux[2], nn[0] * ux[1] - nn[1] * ux[0]].map((x) => x / (2 * A0));
      const r1 = [l1, 0];
      const r2 = [e2[0] * ux[0] + e2[1] * ux[1] + e2[2] * ux[2], e2[0] * vy[0] + e2[1] * vy[1] + e2[2] * vy[2]];
      const f1 = [Pp[b * 3] - Pp[a * 3], Pp[b * 3 + 1] - Pp[a * 3 + 1], Pp[b * 3 + 2] - Pp[a * 3 + 2]];
      const f2 = [Pp[c * 3] - Pp[a * 3], Pp[c * 3 + 1] - Pp[a * 3 + 1], Pp[c * 3 + 2] - Pp[a * 3 + 2]];
      // F = [f1 f2] · inv([r1 r2]) (3×2); singular values from FᵀF
      const det = r1[0] * r2[1] - r1[1] * r2[0];
      const i00 = r2[1] / det, i01 = -r2[0] / det, i10 = -r1[1] / det, i11 = r1[0] / det;
      const c0 = [0, 1, 2].map((k) => f1[k] * i00 + f2[k] * i10);
      const c1 = [0, 1, 2].map((k) => f1[k] * i01 + f2[k] * i11);
      const E = c0[0] ** 2 + c0[1] ** 2 + c0[2] ** 2, Fm = c0[0] * c1[0] + c0[1] * c1[1] + c0[2] * c1[2], G = c1[0] ** 2 + c1[1] ** 2 + c1[2] ** 2;
      const tr = E + G, dd = Math.sqrt(Math.max(0, ((E - G) / 2) ** 2 + Fm * Fm));
      const s1 = Math.sqrt(tr / 2 + dd), s2 = Math.sqrt(Math.max(0, tr / 2 - dd));
      const pn = [f1[1] * f2[2] - f1[2] * f2[1], f1[2] * f2[0] - f1[0] * f2[2], f1[0] * f2[1] - f1[1] * f2[0]];
      const sn = [0, 1, 2].map((k) => Np[a * 3 + k] + Np[b * 3 + k] + Np[c * 3 + k]);
      // (against the triangle's own rest state: on the coarse levels a few triangles already disagree with their
      // smooth vertex normals at rest)
      const rn = [0, 1, 2].map((k) => RN[a * 3 + k] + RN[b * 3 + k] + RN[c * 3 + k]);
      const restFlip = nn[0] * rn[0] + nn[1] * rn[1] + nn[2] * rn[2] < 0;
      const flipped = (pn[0] * sn[0] + pn[1] * sn[1] + pn[2] * sn[2] < 0) !== restFlip;
      if (flipped) flip++;
      aRest += A0;
      aPose += Math.hypot(...pn) / 2;
      const ani = s1 / Math.max(1e-3, s2);
      an.push(ani);
      if (s1 > sMax) sMax = s1;
      if (s2 < qMin) { qMin = s2; }
      if (ani > aMax) { aMax = ani; worstAt = [R[a * 3], R[a * 3 + 1], R[a * 3 + 2]].map((x) => +x.toFixed(1)); }
    }
    an.sort((x, y) => x - y);
    const p99 = an[Math.floor(an.length * 0.99)];
    let crease = 0, creaseN = 0;
    const n1 = [0, 0, 0], n2 = [0, 0, 0];
    pairs.forEach(([A, B], i) => {
      const l1 = triN(Pp, A, n1), l2 = triN(Pp, B, n2);
      const ang = Math.acos(Math.max(-1, Math.min(1, (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (l1 * l2 || 1))));
      const inc = (ang - restCrease[i]) / DEG;
      if (inc > crease) crease = inc;
      if (inc > 45) creaseN++;
    });
    const row = { pose: P[0], stretch: +sMax.toFixed(2), squash: +qMin.toFixed(2), aniso: +aMax.toFixed(1), p99: +p99.toFixed(2), flip, crease: +crease.toFixed(0), creaseN, area: +(aPose / aRest).toFixed(3), worstAt };
    rows.push(row);
    console.log(`${P[0].padEnd(22)} ${row.stretch.toFixed(2).padStart(6)}  ${row.squash.toFixed(2).padStart(6)}  ${row.aniso.toFixed(1).padStart(5)}  ${row.p99.toFixed(2).padStart(5)}  ${String(flip).padStart(4)}  ${String(row.crease).padStart(6)}  ${String(creaseN).padStart(7)}  ${row.area.toFixed(3)}  @${worstAt}`);
  }
  const agg = (k, f) => rows.reduce((a, r) => f(a, r[k]), rows[0]?.[k] ?? 0);
  summary[`LOD${d}`] = { rows, worst: { stretch: agg('stretch', Math.max), squash: agg('squash', Math.min), aniso: agg('aniso', Math.max), p99: agg('p99', Math.max), flip: agg('flip', Math.max), crease: agg('crease', Math.max), creaseN: agg('creaseN', Math.max) } };
  const tot = (k) => rows.reduce((a, r) => a + r[k], 0);
  console.log(`-- LOD${d} totals: flips ${tot('flip')}, creases>45° ${tot('creaseN')}, poses with flips ${rows.filter((r) => r.flip > 0).length}/${rows.length}`);
  console.log(`-- LOD${d} worst:`, JSON.stringify(summary[`LOD${d}`].worst));
}
if (args.json) writeFileSync(args.json, JSON.stringify(summary, null, 1));
