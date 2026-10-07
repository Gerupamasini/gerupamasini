// Withdrawal of ユビナガホンヤドカリ into its shell: where the body, the legs and the claws go when the
// crab shuts itself in.
//
// Carried apertures face down, so the way in leads up from the aperture and then back along the whorl.
// The withdrawn body sits in the body whorl with its face just behind the opening; the soft posterior
// carapace bends to follow the whorl; P2/P3 fold with their propodi and dactyli at the opening; the major
// chela closes the opening like a lid, the minor one behind it (photos 018, 019, 028, 044, 046, 053, 054)
// [D]. The poses come from searches against the analytic shell (lumen / wall / outside): nothing may show
// outside the shell except the claws and leg tips at the opening.
import * as THREE from 'three';
import { Rig, yawFor, BASIS_FRACTION } from './PagurusMinutusRig.js';
import { MORPH } from './PagurusMinutusMorphology.js';
import { SHELL_SPECIES, classifyShellPoint } from './PagurusMinutusShell.js';
import { clamp } from './PagurusMinutusUtil.js';
import { HIDE_TABLE } from './PagurusMinutusHideTable.js';

const SEARCH_CACHE = new Map(); // hidden pose search results by shell species and size bin
const FOLD_CACHE = new Map(); // leg folds by shell species and size bin
const LID_CACHE = new Map(); // claw lids by shell species, size bin and sex
/** cephalothorax samples (body frame, SL): shield, branchiostegites and the posterior carapace */
const CEPH_SAMPLES = [];
for (const x of [-0.38, 0, 0.38]) for (const y of [-0.22, 0, 0.18]) for (const z of [-0.75, -0.35, 0.05, 0.45, 0.85]) CEPH_SAMPLES.push(new THREE.Vector3(x, y, z));
// the face must stay behind the claw lid: front of the shield, folded eyestalks (tips down and out),
// folded antennal peduncles
const FACE_Z = 0.8;
for (const x of [-0.2, 0.2]) CEPH_SAMPLES.push(new THREE.Vector3(x, -0.05, 1.25));
for (const x of [-0.42, 0.42]) CEPH_SAMPLES.push(new THREE.Vector3(x, -0.5, 1.12), new THREE.Vector3(x * 0.6, -0.25, 1.08));
for (const x of [-0.3, 0.3]) CEPH_SAMPLES.push(new THREE.Vector3(x, -0.45, 0.95));
/** depth of the face behind the aperture plane when hidden (room for the major chela as a lid) (SL) */
const LID_DEPTH = 0.42;
/** how far the soft posterior carapace can bend to follow the whorl (rad) [S] */
const MAX_BEND = 1.1;
const _BACK = new THREE.Vector3(0, 0, -1);

// ── precomputed table ────────────────────────────────────────────────────────────────────────
// The searches below take 0.2–1 s per shell geometry, too long for a frame. Their results depend only on
// the shell species and the shell size relative to the shield (everything scales with SL), so they are
// baked per species × size bin (5 % steps) × sex by tools/models/pagurus/bake-hide-table.mjs into
// PagurusMinutusHideTable.js. The table carries a signature of every input it was computed from and is
// ignored (live search) when that no longer matches.
const ALGO_VERSION = 2;
const RATIO_STEP = Math.log(1.05);
let tableEnabled = true;
/** the bake script turns the table off to compute fresh results */
export function setHideTableEnabled(on) { tableEnabled = on; }
/** size bin of the crab's shell (shell size / shield length in 5 % steps) */
export function ratioBin(crab) { return Math.round(Math.log(crab.shell.size_mm / crab.shieldLength_mm) / RATIO_STEP); }
export const binRatio = (bin) => Math.exp(bin * RATIO_STEP);
let sig = null;
/** signature of the inputs of the withdrawal searches (morphology, shells, sampling, version) */
export function hideSignature() {
  if (sig) return sig;
  const shells = Object.fromEntries(Object.entries(SHELL_SPECIES).map(([k, sp]) => [k, { ...sp, color: undefined, ja: undefined }]));
  const json = JSON.stringify([ALGO_VERSION, MORPH.walkingLegs, MORPH.chelipeds, MORPH.shield, MORPH.posteriorCarapace, MORPH.coxae, MORPH.eye, BASIS_FRACTION, shells, CEPH_SAMPLES.map((p) => p.toArray()), LID_DEPTH, MAX_BEND, CHELA_POSES.block]);
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619); }
  sig = (h >>> 0).toString(16);
  return sig;
}
const tableValid = () => tableEnabled && HIDE_TABLE.sig === hideSignature();
function fromTable(kind, key) {
  return tableValid() ? HIDE_TABLE[kind]?.[key] ?? null : null;
}
/** size bin used for lookups: clamped to the baked range of the species (roomier or tighter shells reuse
 *  the nearest baked pose, so the game never has to run a search) */
function lookupBin(crab) {
  const bin = ratioBin(crab);
  const r = tableValid() ? HIDE_TABLE.bins?.[crab.shell.key] : null;
  return r ? clamp(bin, r[0], r[1]) : bin;
}

/**
 * Hidden pose of the body inside its shell.
 * Returns { X: {pos, quat} body displacement in the body-rest frame (SL), H: {O, L, U, F} the body frame
 * in the shell frame (SL; origin = aperture centroid), n: aperture normal (shell frame, outward),
 * apR: aperture radius (SL), tipSign, comB: shell centre of mass in the body-rest frame (SL),
 * hullB: shell hull points in the body-rest frame (SL) }.
 */
export function hiddenPoseFor(crab) {
  const sh = crab.shell;
  const c = crab._hidePose;
  if (c && c.shell === sh) return c.res;
  const res = buildHiddenPose(crab);
  crab._hidePose = { shell: sh, res };
  return res;
}

/** shell-frame geometry the searches work with (cheap; closures over the analytic shell) */
function shellContext(crab) {
  const sh = crab.shell, SLm = crab.SL;
  const total = sh.abdomenPath.total;
  const path = (uSL, out) => sh.abdomenPath(clamp(uSL * SLm, 0, total), out).divideScalar(SLm);
  const n = sh.apertureNormal.clone();
  const carryQ = sh.carry.quaternion, carryInv = carryQ.clone().invert();
  const U0 = new THREE.Vector3(0, 1, 0).applyQuaternion(carryInv);
  const tmp = new THREE.Vector3();
  const cls = (p) => classifyShellPoint(sh.key, sh.size_mm, tmp.copy(p).multiplyScalar(SLm));
  const apR = 0.5 * Math.max(sh.props.apertureWidth_mm, sh.props.apertureHeight_mm) / crab.shieldLength_mm;
  // the aperture as an ellipse in its plane: long axis along the coiling axis (height), short one radial
  const eA = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  const eB = new THREE.Vector3().crossVectors(n, eA);
  const apA = (0.5 * sh.props.apertureHeight_mm) / crab.shieldLength_mm, apB = (0.5 * sh.props.apertureWidth_mm) / crab.shieldLength_mm;
  /** (a/A)² + (b/B)² of a point projected into the aperture plane (< 1: inside the outline) */
  const outline = (p) => (p.dot(eA) / apA) ** 2 + (p.dot(eB) / apB) ** 2;
  const ip = new THREE.Vector3();
  /**
   * Where a shell-frame point (SL) ends up: 'out' outside the shell at the opening (or in its mouth closer
   * than `margin` to the aperture plane), 'poke' outside the shell anywhere else (seen through or beside
   * the shell), 'wall' inside the opaque wall, 'in' hidden in the lumen. The lumen curls round, so parts of
   * it lie in front of the aperture plane: only the shell classification says what is hidden.
   */
  const vis = (p, margin = 0) => {
    const c = cls(p);
    const dep = p.dot(n);
    const atOpening = outline(p) < 1.3 && dep > -0.6 && dep < 1.2;
    if (c === 'outside') return atOpening ? 'out' : 'poke';
    if (atOpening && dep > -margin) return 'out';
    return c === 'wall' ? 'wall' : 'in';
  };
  return { sh, SLm, path, n, carryQ, carryInv, U0, cls, vis, outline, eA, eB, apA, apB, apR };
}

/** search the hidden pose: body frame {O, L, U, F} in the shell frame (SL) and the posterior bend */
function searchHiddenPose(ctx) {
  const { path, n, U0, vis } = ctx;
  const O = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), F = new THREE.Vector3();
  const U1 = new THREE.Vector3(), U = new THREE.Vector3(), L = new THREE.Vector3(), q = new THREE.Vector3(), rq = new THREE.Quaternion();
  const Fa = new THREE.Vector3(), rt = new THREE.Quaternion(), bendDir = new THREE.Vector3(), bendQ = new THREE.Quaternion(), bp = new THREE.Vector3();
  const _qid = new THREE.Quaternion();
  let best = null, bs = -Infinity;
  for (let d = 0.6; d <= 2.81; d += 0.15) {
    path(d, O);
    path(Math.max(0, d - 0.9), pa);
    path(d + 0.6, pb);
    Fa.subVectors(pa, pb).normalize(); // toward the aperture
    U1.copy(U0).addScaledVector(Fa, -Fa.dot(U0)).normalize();
    const L1 = new THREE.Vector3().crossVectors(U1, Fa);
    for (const ta of [-0.45, -0.22, 0, 0.22, 0.45]) for (const tb of [-0.35, 0, 0.35]) {
      // tilt the chord: the rigid cephalothorax cannot follow the tight curl of the whorl
      F.copy(Fa).applyQuaternion(rt.setFromAxisAngle(L1, ta)).applyQuaternion(rq.setFromAxisAngle(U1, tb)).normalize();
      const Ub = new THREE.Vector3().copy(U0).addScaledVector(F, -F.dot(U0)).normalize();
      path(d + 1.0, pb);
      const g = pb.sub(O);
      for (let k = 0; k < 12; k++) {
        U.copy(Ub).applyQuaternion(rq.setFromAxisAngle(F, (k / 12) * Math.PI * 2));
        L.crossVectors(U, F);
        // the posterior carapace bends toward the whorl further in
        const gb = bendDir.set(g.dot(L), g.dot(U), g.dot(F)).normalize();
        bendQ.setFromUnitVectors(_BACK, gb);
        const ang = 2 * Math.acos(clamp(Math.abs(bendQ.w), 0, 1));
        if (ang > MAX_BEND) bendQ.slerp(_qid, 1 - MAX_BEND / ang);
        let lum = 0, wall = 0, poke = 0, out = 0;
        for (const p0 of CEPH_SAMPLES) {
          const p = p0.z < 0 ? bp.copy(p0).applyQuaternion(bendQ) : p0;
          q.copy(O).addScaledVector(L, p.x).addScaledVector(U, p.y).addScaledVector(F, p.z);
          const v = vis(q, p0.z > FACE_Z ? LID_DEPTH : 0.1);
          if (v === 'in') lum++; else if (v === 'wall') wall++; else if (v === 'poke') poke++; else out++;
        }
        // face toward the opening (the claws close it from the front)
        const score = (lum - 0.4 * wall - 3 * poke - 2 * out) / CEPH_SAMPLES.length - 0.02 * d + 0.3 * Math.max(0, F.dot(n));
        if (score > bs) { bs = score; best = { O: O.clone(), L: L.clone(), U: U.clone(), F: F.clone(), bendQ: bendQ.clone() }; }
      }
    }
  }
  return { ...best, score: bs };
}

function encodePose(b) {
  const r = (v) => +v.toFixed(5);
  return [...b.O.toArray(), ...b.L.toArray(), ...b.U.toArray(), ...b.F.toArray(), ...b.bendQ.toArray(), b.score].map(r);
}
function decodePose(a) {
  const v = (i) => new THREE.Vector3(a[i], a[i + 1], a[i + 2]);
  return { O: v(0), L: v(3), U: v(6), F: v(9), bendQ: new THREE.Quaternion(a[12], a[13], a[14], a[15]), score: a[16] };
}

/** the hidden pose of this crab in its shell: table or search, then the crab-specific frames */
function buildHiddenPose(crab) {
  const ctx = shellContext(crab);
  const { sh, SLm, n } = ctx;
  // the crab's actual carry pose (species carry pose, tilted for big shells)
  const carryQ = crab.carryQ ?? ctx.carryQ;
  const key = `${sh.key}|${lookupBin(crab)}`;
  let best = SEARCH_CACHE.get(key);
  if (!best) {
    const t = fromTable('pose', key);
    best = t ? decodePose(t) : searchHiddenPose(ctx);
    SEARCH_CACHE.set(key, best);
  }
  const bs = best.score;
  // body frame in the shell frame → displacement in the body-rest frame: X = T(anchorRest)·carry·H
  const qH = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(best.L, best.U, best.F));
  const anchorRest = crab.rig.shellAnchorRest;
  const X = { pos: best.O.clone().applyQuaternion(carryQ).add(anchorRest), quat: carryQ.clone().multiply(qH) };
  const toBodyRest = (pm) => pm.clone().divideScalar(SLm).applyQuaternion(carryQ).add(anchorRest);
  const comB = toBodyRest(sh.props.centerOfMass);
  const hullB = sh.hull.map(toBodyRest);
  const res = {
    ...ctx, key,
    X, H: best, n, score: bs, bendQ: best.bendQ,
    // the shell rolls toward the side of its centre of mass (+X = the animal's left goes down for −angle);
    // tall-spired shells end up on their side, low trochid/turbinid shells settle with little tilt [S]
    tipSign: comB.x >= 0 ? -1 : 1,
    tipMax: sh.data.sp.carry.apexElevationDeg > 30 ? 0.35 : 1.55,
    comB, hullB,
  };
  return res;
}

/**
 * P2/P3 folded at the aperture of the hidden crab: merus and carpus drawn into the whorl, propodi and the
 * long dactyli laid across the opening beside the major chela, P2 inside P3 (photos 018, 019, 021, 053,
 * 054) [D]. Joint-space search against the analytic shell: knees in the lumen, no article in the wall,
 * tips at the aperture plane and inside its outline.
 * @param {object} leg rig leg chain
 * @param {ReturnType<typeof hiddenPoseFor>} hp hidden pose
 * @param {(p: THREE.Vector3) => string} cls classifier for shell-frame points (SL)
 * @param {THREE.Object3D} body rig root (Body bone)
 */
const _kM = new THREE.Matrix4();
const _fp = Array.from({ length: 12 }, () => new THREE.Vector3());
const FOLD_GRID = {
  dyaw: [-0.7, -0.45, -0.2, 0.05, 0.3, 0.55], lift: [-0.6, -0.25, 0.1, 0.45, 0.8, 1.15],
  knee: [-2.5, -2.2, -1.9, -1.6, -1.3], cp: [-1.35, -0.9, -0.45, 0], pd: [-1.6, -1.15, -0.7, -0.3],
};
function legFold(leg, hp, body) {
  const saved = [leg.coxa, leg.basis, leg.merus, leg.carpus, leg.propodus, leg.dactylus].map((b) => b.quaternion.clone());
  const { H, n, apR } = hp;
  const toS = (p, out) => out.copy(H.O).addScaledVector(H.L, p.x).addScaledVector(H.U, p.y).addScaledVector(H.F, p.z);
  const wantR = apR * (leg.n === 1 ? 0.45 : 0.85);
  _kM.copy(body.matrixWorld).invert();
  const pos = (b, v) => v.setFromMatrixPosition(b.matrixWorld).applyMatrix4(_kM);
  let best = null, bestScore = Infinity;
  const j = { yaw: 0, lift: 0, knee: 0, cp: 0, pd: 0 };
  for (const dyaw of FOLD_GRID.dyaw) for (const lift of FOLD_GRID.lift) for (const knee of FOLD_GRID.knee) for (const cp of FOLD_GRID.cp) for (const pd of FOLD_GRID.pd) {
    j.yaw = leg.restYaw + dyaw * leg.side; j.lift = lift; j.knee = knee; j.cp = cp; j.pd = pd;
    Rig.applyLeg(leg, j);
    leg.coxa.updateMatrixWorld(true);
    const m = toS(pos(leg.merus, _fp[0]), _fp[5]), k = toS(pos(leg.carpus, _fp[1]), _fp[6]);
    const c = toS(pos(leg.propodus, _fp[2]), _fp[7]), d = toS(pos(leg.dactylus, _fp[3]), _fp[8]), t = toS(pos(leg.tip, _fp[4]), _fp[9]);
    let score = 0;
    const { vis } = hp;
    // proximal articles (to the knee) hidden in the shell; distal ones may show in the opening
    const pts = [m, _fp[10].lerpVectors(m, k, 0.5), k, _fp[11].lerpVectors(k, c, 0.5), c];
    for (let i = 0; i < pts.length; i++) {
      const v = vis(pts[i], 0.05);
      score += v === 'poke' ? 4 : v === 'out' ? (i <= 2 ? 1.5 : 0.2) : v === 'wall' ? 0.3 : 0;
    }
    for (const q of [_fp[10].lerpVectors(c, d, 0.5), d, _fp[11].lerpVectors(d, t, 0.5), t]) {
      const v = vis(q, 0);
      if (v === 'poke') score += 3;
      else if (v === 'out') score += 2 * Math.max(0, q.dot(n) - 0.35); // not sticking far out of the opening
    }
    // tips at the opening, inside its outline, articles lying across it
    const depth = t.dot(n);
    score += 2 * Math.max(0, depth - 0.3) + 2 * Math.max(0, -0.2 - depth);
    const inPlane = _fp[10].copy(t).addScaledVector(n, -depth).length();
    score += 1.5 * Math.max(0, Math.sqrt(hp.outline(t)) - 1) + 0.5 * Math.abs(inPlane - wantR);
    score += 0.8 * Math.abs(_fp[11].subVectors(t, c).normalize().dot(n));
    if (score < bestScore) { bestScore = score; best = { ...j }; }
  }
  [leg.coxa, leg.basis, leg.merus, leg.carpus, leg.propodus, leg.dactylus].forEach((b, i) => b.quaternion.copy(saved[i]));
  leg.coxa.updateMatrixWorld(true);
  return best;
}

export const CHELA_POSES = {
  // held flexed in front of the cephalothorax, chela tips near the substrate
  rest: { R: { yaw: yawFor(-0.35, 0.94), lift: 0.62, roll: 0.25, knee: -1.4, swing: -0.7, pitch: 0.15, gape: 0.04 }, L: { yaw: yawFor(0.42, 0.9), lift: 0.4, roll: 0.15, knee: -1.05, swing: -0.5, pitch: 0.38, gape: 0.06 } },
  alert: { R: { yaw: yawFor(-0.5, 0.85), lift: 0.7, roll: 0.0, knee: -0.9, swing: -0.3, pitch: 0.45, gape: 0.12 }, L: { yaw: yawFor(0.5, 0.85), lift: 0.65, roll: 0.0, knee: -0.95, swing: -0.35, pitch: 0.4, gape: 0.1 } },
  // aperture closed: major chela laid across the opening, minor tucked behind [D]
  block: { R: { yaw: yawFor(-0.15, 1.0), lift: -0.15, roll: 0.35, knee: -1.95, swing: -1.05, pitch: 0.2, gape: 0.0 }, L: { yaw: yawFor(0.2, 1.0), lift: -0.05, roll: 0.3, knee: -2.25, swing: -1.2, pitch: 0.25, gape: 0.0 } },
};
export const JOINT_KEYS = ['yaw', 'lift', 'roll', 'knee', 'swing', 'pitch', 'gape'];

/**
 * Claws closing the aperture of the hidden crab: the major (right) palm laid across the opening, broad
 * face outward, granular dorsum showing; the minor chela just behind it (photos 018, 019, 028, 044, 046,
 * 053, 054) [D]. Joint-space search around CHELA_POSES.block, checked against the analytic shell.
 */
const _cp = Array.from({ length: 10 }, () => new THREE.Vector3());
function chelaLid(ch, hp, body, isMajor) {
  const base = CHELA_POSES.block[isMajor ? 'R' : 'L'];
  const saved = [ch.coxa, ch.basis, ch.merus, ch.carpus, ch.propodus, ch.dactylus].map((b) => b.quaternion.clone());
  const { H, n, apR } = hp;
  const toS = (p, out) => out.copy(H.O).addScaledVector(H.L, p.x).addScaledVector(H.U, p.y).addScaledVector(H.F, p.z);
  _kM.copy(body.matrixWorld).invert();
  const local = (b, x, out) => out.set(x, 0, 0).applyMatrix4(b.matrixWorld).applyMatrix4(_kM);
  const want = isMajor ? [-0.12, 0.08] : [-0.55, -0.2]; // depth range of the palm centre (SL)
  let best = null, bestScore = Infinity;
  const j = { ...base };
  for (const dyaw of [-0.8, -0.5, -0.25, 0, 0.25, 0.5]) for (const lift of [-0.8, -0.45, -0.1, 0.25, 0.6]) for (const knee of [-2.6, -2.2, -1.8, -1.4])
    for (const swing of [-1.6, -1.15, -0.7, -0.25]) for (const pitch of [-0.6, -0.1, 0.4, 0.9]) {
      j.yaw = base.yaw + dyaw; j.lift = lift; j.knee = knee; j.swing = swing; j.pitch = pitch; j.gape = 0;
      Rig.applyCheliped(ch, j);
      ch.coxa.updateMatrixWorld(true);
      const palm = toS(local(ch.propodus, ch.len.palm * 0.5, _cp[0]), _cp[1]);
      const tip = toS(local(ch.tip, 0, _cp[2]), _cp[3]);
      const kneeP = toS(local(ch.carpus, 0, _cp[4]), _cp[5]);
      let score = 0;
      const dp = palm.dot(n);
      score += 4 * (Math.max(0, want[0] - dp) + Math.max(0, dp - want[1]));
      score += 2 * Math.max(0, Math.sqrt(hp.outline(palm)) - (isMajor ? 0.4 : 0.6));
      // finger tips (fixed and movable) no further out than the lip
      const dtip = toS(local(ch.dactylus, ch.len.dactyl, _cp[8]), _cp[9]);
      score += 4 * (Math.max(0, tip.dot(n) - 0.2) + Math.max(0, dtip.dot(n) - 0.2));
      const wrist = toS(local(ch.propodus, 0, _cp[6]), _cp[7]);
      // the chela lies across the opening: long axis in the aperture plane, tip inside the outline
      const axis = _cp[0].subVectors(tip, wrist).normalize();
      score += 2 * Math.abs(axis.dot(n));
      score += 2 * Math.max(0, Math.sqrt(hp.outline(tip)) - 0.95);
      // in a long, narrow opening the chela lies along its long axis
      if (hp.apA > hp.apB * 1.3) score += 1.2 * (1 - Math.abs(axis.dot(hp.eA)));
      // broad face of the palm (its local Y) toward the outside
      const faceN = _cp[2].set(0, 1, 0).transformDirection(ch.propodus.matrixWorld).transformDirection(_kM);
      const faceS = _cp[4].set(0, 0, 0).addScaledVector(H.L, faceN.x).addScaledVector(H.U, faceN.y).addScaledVector(H.F, faceN.z);
      score += 1.5 * (1 - Math.abs(faceS.dot(n)));
      for (const q of [kneeP, wrist]) {
        const v = hp.vis(q, 0.02);
        score += v === 'poke' ? 4 : v === 'out' ? 2 : v === 'wall' ? 0.4 : 0;
      }
      for (const q of [tip, palm]) { const v = hp.vis(q, -0.3); score += v === 'poke' ? 4 : v === 'wall' ? 0.4 : 0; }
      if (score < bestScore) { bestScore = score; best = { ...j }; }
    }
  [ch.coxa, ch.basis, ch.merus, ch.carpus, ch.propodus, ch.dactylus].forEach((b, i) => b.quaternion.copy(saved[i]));
  ch.coxa.updateMatrixWorld(true);
  return best;
}


/** folded P2/P3 joints for this crab's shell (table or search, cached per shell species and size bin) */
export function legFoldsFor(crab) {
  const hp = hiddenPoseFor(crab);
  let joints = FOLD_CACHE.get(hp.key);
  if (joints) return joints;
  const t = fromTable('legs', hp.key);
  if (t) joints = Object.fromEntries(Object.entries(t).map(([k, a]) => [k, { yaw: a[0], lift: a[1], knee: a[2], cp: a[3], pd: a[4] }]));
  else {
    joints = {};
    for (const leg of Object.values(crab.loco.legs)) joints[leg.key] = legFold(leg.chain, hp, crab.rig.root);
  }
  FOLD_CACHE.set(hp.key, joints);
  return joints;
}

/** claw lid joints for this crab's shell (table or search, cached per shell species, size bin and sex) */
export function chelaLidsFor(crab) {
  const hp = hiddenPoseFor(crab);
  const key = `${hp.key}|${crab.sex}`;
  let res = LID_CACHE.get(key);
  if (res) return res;
  const t = fromTable('claws', key);
  if (t) res = Object.fromEntries(Object.entries(t).map(([k, a]) => [k, Object.fromEntries(JOINT_KEYS.map((j, i) => [j, a[i]]))]));
  else res = { R: chelaLid(crab.rig.chelipeds.R, hp, crab.rig.root, true), L: chelaLid(crab.rig.chelipeds.L, hp, crab.rig.root, false) };
  LID_CACHE.set(key, res);
  return res;
}

/** compact forms for the bake script */
export const encode = {
  pose: (crab) => encodePose(hiddenPoseFor(crab).H),
  legs: (crab) => Object.fromEntries(Object.entries(legFoldsFor(crab)).map(([k, j]) => [k, [j.yaw, j.lift, j.knee, j.cp, j.pd].map((v) => +v.toFixed(4))])),
  claws: (crab) => Object.fromEntries(Object.entries(chelaLidsFor(crab)).map(([k, j]) => [k, JOINT_KEYS.map((n) => +j[n].toFixed(4))])),
};
