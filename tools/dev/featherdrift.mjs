// Feather-follow probe (no rendering): do the feathers ride the body surface under them while the bird moves?
// Every feather's root (rachis base) and tip are anchored to the posed body skin under them in the relaxed stand:
// the body vertices within ANCHOR_R of the closest surface point (CPU skinning + the body shader's fluff / breathing
// / nape displacement). Each frame the anchor patch's best rigid fit (Kabsch) carries the reference point along;
// drift = |feather point (CPU skinning + the feather shader's lie / conform / arm-tube terms, wind flutter off) −
// carried point|. A feather that rides the skin has drift 0 at its root whatever the body does.
//
// Clips are played in real time at 60 Hz (smoothing and lag as in the game): walk / run (treadmill), turn (spin on
// the spot while walking), headturn (gaze yaw sweep ±110°), peck, preen ×6, shake, scratch, threat, breathing (idle),
// postures (relaxed → alert → forage → restOneLeg → restTucked → sit → relaxed), takeoff/landing are left out (wings
// open). Wing feathers are not counted in frames where the wing is opened or raised on purpose (fold < 0.97, raise).
//
// usage: node tools/dev/featherdrift.mjs [--lod=0] [--clips=walk,run,…] [--save=out.json] [--compare=before.json]
//                                         [--csv=file]   (per-frame group maxima)
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator, PREEN_VARIANTS } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { FEATHER_TYPE } from '../../src/birds/kentishPlover/anatomy/feathers.js';
import { bodyDisplacementMasks, FLUFF_REST, getBodySDF } from '../../src/birds/kentishPlover/anatomy/bodyMesh.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';
import { CONFORM_FOLD } from '../../src/birds/kentishPlover/anatomy/wingFold.js';
import { animation as ANIM } from '../../src/birds/kentishPlover/KentishPloverConfig.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const LOD = Number(args.lod ?? 0);
const ANCHOR_R = Number(args.r ?? 3.5); // mm
const ALL = ['breathing', 'walk', 'run', 'turn', 'headturn', 'postures', 'peck', ...PREEN_VARIANTS.map((v) => `preen-${v}`), 'shake', 'scratch', 'threat'];
const CLIPS = args.clips ? args.clips.split(',') : ALL;
const BREATH = ANIM.breathAmp * 0.021; // m per unit (KentishPloverMaterials ANIM_BREATH)

const m = new KentishPloverModel({ lods: [LOD], shadows: false });
const lod = m.lods[LOD];
const bodyMesh = lod.meshes.find((x) => x.name.startsWith('body'));
const featherMesh = lod.meshes.find((x) => x.name.startsWith('feathers'));
const names = Object.fromEntries(Object.entries(FEATHER_TYPE).map(([k, v]) => [v, k]));
const GROUP = (t) => names[t];
const WING_TYPES = new Set(['primary', 'secondary', 'tertial', 'primaryCovert', 'greaterCovert', 'medianCovert', 'lesserCovert', 'alula']);

// ------------------------------------------------------------ CPU posing with the shaders' displacements
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const BG = bodyMesh.geometry;
const bRest = BG.getAttribute('aRest');
const bNrm = BG.getAttribute('normal');
const bPos = BG.getAttribute('position');
const masks = new Map();
const bodyMask = (i) => {
  let k = masks.get(i);
  if (!k) masks.set(i, (k = bodyDisplacementMasks([bRest.getX(i), bRest.getY(i), bRest.getZ(i)], [bNrm.getX(i), bNrm.getY(i), bNrm.getZ(i)])));
  return k;
};
const bodyU = lod.body.userData.uniforms;
const featU = lod.feathers.userData.uniforms;
function bodyPoint(i, out) {
  const k = bodyMask(i);
  const d = (bodyU.uFluff.value - FLUFF_REST) * 0.001 * k[0] + bodyU.uNapeFill.value * 0.001 * k[2] + bodyU.uBreath.value * BREATH * k[1];
  out.set(bPos.getX(i) + bNrm.getX(i) * d, bPos.getY(i) + bNrm.getY(i) * d, bPos.getZ(i) + bNrm.getZ(i) * d);
  bodyMesh.applyBoneTransform(i, out);
  return out.applyMatrix4(bodyMesh.matrixWorld);
}
const FG = featherMesh.geometry;
const fA = Object.fromEntries(['position', 'aFeather', 'aLie', 'aLieMask', 'aCore', 'aConform', 'uv'].map((n) => [n, FG.getAttribute(n)]));
function featherPoint(i, out) {
  const fold = fA.position.getX(i) >= 0 ? featU.uFold.value.x : featU.uFold.value.y;
  const t = Math.round(fA.aFeather.getX(i));
  const kfWing = t < 7.5 || (t > 10.5 && t < 11.5) ? fold : 1;
  const lie = kfWing * ((featU.uFluff.value - FLUFF_REST) * 0.001 * fA.aLieMask.getX(i) + featU.uBreath.value * BREATH * fA.aLieMask.getY(i));
  const core = smooth(0, 0.5, fold);
  const conf = smooth(CONFORM_FOLD[0], CONFORM_FOLD[1], fold);
  out.set(
    fA.position.getX(i) + fA.aLie.getX(i) * lie + fA.aCore.getX(i) * core + fA.aConform.getX(i) * conf,
    fA.position.getY(i) + fA.aLie.getY(i) * lie + fA.aCore.getY(i) * core + fA.aConform.getY(i) * conf,
    fA.position.getZ(i) + fA.aLie.getZ(i) * lie + fA.aCore.getZ(i) * core + fA.aConform.getZ(i) * conf
  );
  featherMesh.applyBoneTransform(i, out);
  return out.applyMatrix4(featherMesh.matrixWorld);
}

// ------------------------------------------------------------ feathers: root (rachis base) and tip vertices
const feathers = new Map();
for (let i = 0; i < fA.position.count; i++) {
  const t = Math.round(fA.aFeather.getX(i));
  if (t === FEATHER_TYPE.arm) continue;
  const key = `${t}|${fA.aFeather.getY(i)}|${fA.aFeather.getZ(i).toFixed(6)}|${fA.position.getX(i) >= 0 ? 'L' : 'R'}`;
  let f = feathers.get(key);
  if (!f) feathers.set(key, (f = { type: GROUP(t), root: -1, tip: -1, side: key.slice(-1) }));
  const a = fA.uv.getX(i);
  const v = fA.uv.getY(i);
  if (Math.abs(a) < 1e-4 && v < 1e-4) f.root = i;
  if (Math.abs(a) < 1e-4) (f.shaft ??= []).push([v, i]);
  if (Math.abs(a) < 1e-4 && v > 1 - 1e-4) f.tip = i;
}
const F = [...feathers.values()].filter((f) => f.root >= 0 && f.tip >= 0);

// ------------------------------------------------------------ anchors
const A = new KentishPloverAnimator(m, { seed: 3 });
Object.assign(A.gaze, { yaw: 0, tYaw: 0, pitch: 0.02, tPitch: 0.02, timer: 1e9, mode: 'idle' });
A.previewAction('stand', 0.25);
m.object.updateMatrixWorld(true);
const nb = bPos.count;
const ref = new Float32Array(nb * 3);
const _v = new THREE.Vector3();
for (let i = 0; i < nb; i++) bodyPoint(i, _v).toArray(ref, i * 3);
// spatial hash of the reference body
const CELL = 0.004;
const hash = new Map();
const hk = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
for (let i = 0; i < nb; i++) {
  const k = hk(ref[i * 3], ref[i * 3 + 1], ref[i * 3 + 2]);
  (hash.get(k) ?? hash.set(k, []).get(k)).push(i);
}
function near(p, r) {
  const out = [];
  const c = [p.x, p.y, p.z].map((x) => Math.floor(x / CELL));
  const n = Math.ceil(r / CELL);
  for (let dx = -n; dx <= n; dx++)
    for (let dy = -n; dy <= n; dy++)
      for (let dz = -n; dz <= n; dz++)
        for (const i of hash.get(`${c[0] + dx},${c[1] + dy},${c[2] + dz}`) ?? []) {
          const d = Math.hypot(ref[i * 3] - p.x, ref[i * 3 + 1] - p.y, ref[i * 3 + 2] - p.z);
          if (d < r) out.push([i, d]);
        }
  return out;
}
function anchor(p) {
  // the patch round the closest body vertex (searching outward until one is found)
  let r = 0.004;
  let cand = near(p, r);
  while (!cand.length && r < 0.03) cand = near(p, (r *= 1.6));
  cand.sort((a, b) => a[1] - b[1]);
  const c = cand[0][0];
  const cp = new THREE.Vector3().fromArray(ref, c * 3);
  const patch = near(cp, ANCHOR_R * 0.001).map((e) => e[0]);
  // (the side of the body under the point: a patch straddling the midline of the back is fine, it is rigid there)
  // outward normal of the outline there (rest = the stand's posed frame: relaxed is the bind)
  const n = new THREE.Vector3(bNrm.getX(c), bNrm.getY(c), bNrm.getZ(c)).normalize();
  return { patch, p: p.clone(), depth: cand[0][1], n };
}
// The point that is anchored is where the feather comes out of the plumage: the first shaft vertex (from the base) that
// lies outside the resting outline less BURIED mm. The base of a remex or covert lies hidden under the body plumage —
// the skin moving over it there is plumage sliding over a hidden base; what shows is where it emerges. Feathers that
// stay under the outline over their whole length (the folded lesser and primary coverts) are left out (penetration.mjs
// checks they stay hidden).
const BURIED = Number(args.buried ?? 1.0);
const SDF = getBodySDF(CFG);
for (const f of F) {
  f.shaft.sort((p, q) => p[0] - q[0]);
  f.buried = true;
  for (const [, i] of f.shaft) {
    const p = featherPoint(i, _v);
    const d = SDF(p.x * 1000, p.y * 1000, p.z * 1000);
    if (d > -BURIED) {
      [f.root, f.rootSdf, f.buried] = [i, d, false];
      break;
    }
  }
  f.aRoot = anchor(featherPoint(f.root, _v).clone());
  f.aTip = anchor(featherPoint(f.tip, _v).clone());
  f.rootSdf ??= SDF(f.aRoot.p.x * 1000, f.aRoot.p.y * 1000, f.aRoot.p.z * 1000);
}

// Kabsch (Horn's quaternion method) on a patch: rotation + translation carrying ref → current
const cur = new Float32Array(nb * 3);
const curOk = new Uint8Array(nb);
function carried(a, out) {
  const n = a.patch.length;
  const c0 = [0, 0, 0];
  const c1 = [0, 0, 0];
  for (const i of a.patch) {
    if (!curOk[i]) {
      bodyPoint(i, _v).toArray(cur, i * 3);
      curOk[i] = 1;
    }
    for (let k = 0; k < 3; k++) {
      c0[k] += ref[i * 3 + k] / n;
      c1[k] += cur[i * 3 + k] / n;
    }
  }
  const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const i of a.patch)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r * 3 + c] += (ref[i * 3 + r] - c0[r]) * (cur[i * 3 + c] - c1[c]);
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  // largest eigenvector by power iteration on N + sI
  let q = [1, 0, 0, 0];
  const s = Math.abs(xx) + Math.abs(yy) + Math.abs(zz) + Math.abs(xy) + Math.abs(xz) + Math.abs(yx) + Math.abs(yz) + Math.abs(zx) + Math.abs(zy) + 1e-12;
  for (let it = 0; it < 60; it++) {
    const nq = [0, 1, 2, 3].map((r) => N[r][0] * q[0] + N[r][1] * q[1] + N[r][2] * q[2] + N[r][3] * q[3] + s * q[r]);
    const l = Math.hypot(...nq);
    q = nq.map((x) => x / l);
  }
  const Q = new THREE.Quaternion(q[1], q[2], q[3], q[0]);
  a.nCur = (a.nCur ?? new THREE.Vector3()).copy(a.n).applyQuaternion(Q);
  return out.set(a.p.x - c0[0], a.p.y - c0[1], a.p.z - c0[2]).applyQuaternion(Q).add(_v.set(c1[0], c1[1], c1[2]));
}

// ------------------------------------------------------------ clips
let lastAct = null;
const runAction = A._runAction;
A._runAction = function (dt) {
  return (lastAct = runAction.call(this, dt));
};
function reset() {
  lastAct = null;
  A.stopAction();
  A.setRoot(new THREE.Vector3(), 0, new THREE.Vector3());
  A.setPosture('relaxed');
  A.setGaze('idle');
  A._treadmill = 0;
  A.previewAction('stand', 0.25);
}
const dt = 1 / 60;
function* clip(name) {
  reset();
  const step = (n, fn) => {
    const fr = [];
    for (let i = 0; i < n; i++) {
      fn?.(i);
      A.update(dt);
      fr.push(i);
    }
    return fr;
  };
  if (name === 'breathing') {
    for (let i = 0; i < 300; i++) yield A.update(dt);
  } else if (name === 'walk' || name === 'run') {
    const sp = name === 'walk' ? ANIM.walk.speed : ANIM.run.speed;
    A.velocity.set(0, 0, sp);
    A.setPosture(name === 'run' ? 'run' : 'relaxed');
    A._treadmill = sp;
    step(90);
    for (let i = 0; i < 150; i++) yield A.update(dt);
  } else if (name === 'turn') {
    let h = 0;
    A.setPosture('relaxed');
    for (let i = 0; i < 240; i++) {
      h += 3 * dt * Math.sin((i / 240) * Math.PI * 2);
      A.setRoot(new THREE.Vector3(), h, new THREE.Vector3(Math.sin(h) * 0.1, 0, Math.cos(h) * 0.1));
      A._treadmill = 0.1;
      yield A.update(dt);
    }
  } else if (name === 'headturn') {
    for (let i = 0; i < 360; i++) {
      const y = 1.92 * Math.sin((i / 360) * Math.PI * 2);
      Object.assign(A.gaze, { tYaw: y, timer: 1e9, mode: 'idle' });
      yield A.update(dt);
    }
  } else if (name === 'postures') {
    for (const p of ['alert', 'forage', 'restOneLeg', 'restTucked', 'sit', 'relaxed']) {
      A.setPosture(p);
      for (let i = 0; i < 90; i++) yield A.update(dt);
    }
  } else {
    const [act, variant] = name.split('-');
    const target = new THREE.Vector3(0, 0, ANIM.peck.reach);
    if (act === 'peck') {
      A.setPosture('forage');
      A.setGaze('ground', target);
      step(60);
    }
    A.play(act, { variant, target, preyType: act === 'peck' ? 'polychaete' : undefined });
    while (A.action) yield A.update(dt);
    for (let i = 0; i < 30; i++) yield A.update(dt);
  }
}

// ------------------------------------------------------------ run
const groups = [...new Set(F.map((f) => f.type))];
const result = {};
const csv = [];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
for (const name of CLIPS) {
  const st = Object.fromEntries(groups.map((g) => [g, { rootMax: 0, rootSq: 0, n: 0, tipMax: 0, tipSq: 0, nT: 0, at: '' }]));
  let frame = 0;
  for (const _ of clip(name)) {
    m.object.updateMatrixWorld(true);
    curOk.fill(0);
    const wingOff = [0, 1].map((s) => featU.uFold.value.getComponent(s) < 0.97 || !!(lastAct?.wing && (lastAct.wing[s ? 'R' : 'L']?.raise || lastAct.wing.both?.raise || lastAct.wing[s ? 'R' : 'L']?.fold !== undefined || lastAct.wing.both?.fold !== undefined)));
    const fmax = {};
    for (const f of F) {
      if (WING_TYPES.has(f.type) && wingOff[f.side === 'L' ? 0 : 1]) continue;
      const s = st[f.type];
      const dr = featherPoint(f.root, _a).distanceTo(carried(f.aRoot, _b)) * 1000;
      const dtp = featherPoint(f.tip, _a).distanceTo(carried(f.aTip, _b)) * 1000;
      // off the skin along its normal: + lifted (floating), − pressed in (sinking)
      const lift = _a.sub(_b).dot(f.aTip.nCur) * 1000;
      s.tipUp = Math.max(s.tipUp ?? 0, lift);
      s.tipDown = Math.min(s.tipDown ?? 0, lift);
      if (!f.buried) {
        s.rootSq += dr * dr;
        s.n++;
      }
      s.tipSq += dtp * dtp;
      s.nT++;
      if (!f.buried && dr > s.rootMax) {
        s.rootMax = dr;
        s.at = `f${frame}`;
      }
      s.tipMax = Math.max(s.tipMax, dtp);
      if (!f.buried) fmax[f.type] = Math.max(fmax[f.type] ?? 0, dr);
      if (f.type === args.detail) {
        f.dmax = Math.max(f.dmax ?? 0, dr);
        f.tmax = Math.max(f.tmax ?? 0, dtp);
      }
    }
    csv.push([name, frame, ...groups.map((g) => (fmax[g] ?? 0).toFixed(3))].join(','));
    frame++;
  }
  result[name] = Object.fromEntries(groups.map((g) => [g, { rootMax: st[g].rootMax, rootRms: Math.sqrt(st[g].rootSq / Math.max(1, st[g].n)), tipMax: st[g].tipMax, tipRms: Math.sqrt(st[g].tipSq / Math.max(1, st[g].nT)), tipUp: st[g].tipUp ?? 0, tipDown: st[g].tipDown ?? 0, at: st[g].at }]));
}

// ------------------------------------------------------------ report
const cmp = args.compare ? JSON.parse(readFileSync(args.compare, 'utf8')) : null;
const fmt = (x) => x.toFixed(2).padStart(6);
const short = { primary: 'prim', secondary: 'sec', tertial: 'tert', primaryCovert: 'pcov', greaterCovert: 'gcov', medianCovert: 'mcov', lesserCovert: 'lcov', alula: 'alula', rectrix: 'rect', upperTailCovert: 'utc', underTailCovert: 'ltc', scapular: 'scap' };
console.log(`LOD${LOD}  drift of each feather's emergence point (first shaft point out of the plumage) from the skin under it, max / rms (mm)${cmp ? '  [before → now]' : ''}; feathers under the outline over their whole length left out (${groups.map((g) => `${short[g] ?? g} ${F.filter((f) => f.type === g && !f.buried).length}/${F.filter((f) => f.type === g).length}`).join(', ')})`);
console.log('clip'.padEnd(16) + groups.map((g) => (short[g] ?? g).padStart(cmp ? 22 : 14)).join(''));
const all = Object.fromEntries(groups.map((g) => [g, { max: 0, sq: 0, n: 0 }]));
for (const [name, r] of Object.entries(result)) {
  let line = name.padEnd(16);
  for (const g of groups) {
    const s = r[g];
    const c = cmp?.[name]?.[g];
    line += (c ? `${fmt(c.rootMax)}/${fmt(c.rootRms).trim()}→${fmt(s.rootMax).trim()}/${fmt(s.rootRms).trim()}` : `${fmt(s.rootMax)}/${fmt(s.rootRms).trim()}`).padStart(cmp ? 22 : 14);
    all[g].max = Math.max(all[g].max, s.rootMax);
    all[g].sq += s.rootRms ** 2;
    all[g].n++;
  }
  console.log(line);
}
console.log('ALL'.padEnd(16) + groups.map((g) => `${fmt(all[g].max)}/${fmt(Math.sqrt(all[g].sq / all[g].n)).trim()}`.padStart(cmp ? 22 : 14)).join(''));
console.log('\ntip drift max (mm), and its largest lift off / press into the skin under the tip (+/−):');
console.log('clip'.padEnd(16) + groups.map((g) => (short[g] ?? g).padStart(17)).join(''));
for (const [name, r] of Object.entries(result)) console.log(name.padEnd(16) + groups.map((g) => `${fmt(r[g].tipMax).trim()} +${r[g].tipUp.toFixed(1)}/${r[g].tipDown.toFixed(1)}`.padStart(17)).join(''));
if (args.detail) {
  const sl = BG.getAttribute('aSleeve');
  for (const f of F.filter((f) => f.type === args.detail)) {
    const sv = f.aRoot.patch.reduce((a, i) => a + sl.getX(i), 0) / f.aRoot.patch.length;
    const r = [fA.position.getX(f.root), fA.position.getY(f.root), fA.position.getZ(f.root)].map((x) => (x * 1000).toFixed(1)).join(',');
    console.log(`${f.side} root ${r}  sdf ${f.rootSdf.toFixed(2)}${f.buried ? ' (buried)' : ''}  depth ${(f.aRoot.depth * 1000).toFixed(2)}  patch sleeve ${sv.toFixed(3)}  max ${(f.dmax ?? 0).toFixed(2)} tip ${(f.tmax ?? 0).toFixed(2)}`);
  }
}
if (args.save) writeFileSync(args.save, JSON.stringify(result, null, 1));
if (args.csv) writeFileSync(args.csv, ['clip,frame,' + groups.join(','), ...csv].join('\n'));
