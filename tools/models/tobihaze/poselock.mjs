#!/usr/bin/env node
// The body's pose lock (2026-10-25): the poses of every joint outside the head, as round T3 (e6079e5) shipped them, held
// by build.mjs whatever the head's sculpt does. The build solves the body's poses on the hero's tier skin (rig.mjs
// statePose, crawlCycle, propFrames, stateTransitions: settleOnGround and solveArmPlant take a minimum over the skin's
// vertices), so a change to the head alone re-tessellates the trunk and moves them (the 9977d95 rebuild, an eye and lip
// change: rest J_pecMid sweep −10.76 → −15.54°, the land settle's J_sp3 −2.40 → −2.93°, the crawl up to 5.8° at lod1, a
// transition's lift 36 → 37°). With the lock the build still solves (the drift goes to the build report, poseLock) and
// then writes the lock's values for:
//   hero  the reference states (land, reach, rest, water, swim), the prop's keys (by raise), the transitions' lifts (the
//         keys follow by rig.transitionPose) and the crawl's frames with their welded contacts
//   lod1  its own crawl (solved on its own skin and furled blade)
//   lod2  its crawl (the cards aimed at the hero's blade)
// The lighter tiers' states, prop keys and transition keys are the hero's carried over (rig.stateForTier), so they follow.
// Locked per pose: every joint channel but the head's (HEAD_JOINTS: J_head and its mechanism, the eye joints) and every
// fin's blend-shape weights (`morph.Fin_*`: the pelvic cup's press family is solved on the ground too); the head's
// joints, the eyes' gaze and lift and any other weight stay the build's. Re-measured on the new mesh: the grounds (the
// states' and the prop keys' solve grounds by rig.groundUnder, the same rule the solve used; the states' groundMM, the
// contacts and their gaps by rig.contactsFor; the transition keys' by rig.armClearance) — the contacts by name on the
// tier's own posed skin, so the chin and the throat follow the head.
//   node tools/models/tobihaze/poselock.mjs --from-git e6079e5 [--out tools/models/tobihaze/poselock.json]
//   node tools/models/tobihaze/poselock.mjs --from-dir <dir with tobihaze.{hero,lod1,lod2}.glb>
// (writes the lock from those GLBs' extras tobihaze; build.mjs reads tools/models/tobihaze/poselock.json by default,
// --pose-lock <file> another, --no-pose-lock to solve the body afresh: do that, and write a new lock from the result, only
// when the body, the fins or the rig are meant to change)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const POSE_LOCK_FILE = path.join(here, 'poselock.json');
/** The head's joints (the lock leaves them to the build): J_head (the head block, the arms' parent: never posed by a body
 * state), the jaws, the hyoid, the suspensoria and opercles, the upper jaw's chain and the eyes' lift joints. */
export const HEAD_JOINTS = ['J_head', 'J_jaw', 'J_hyoid', 'J_suspL', 'J_suspR', 'J_opercL', 'J_opercR', 'J_premax', 'J_maxL', 'J_maxR', 'J_imj', 'J_eyeL', 'J_eyeR'];
const HEAD = new Set(HEAD_JOINTS);
export const isBodyJoint = (k) => /^J_/.test(k) && !HEAD.has(k);
const isFinMorph = (k) => /^Fin_/.test(k);

/** The body part of a pose: { J_* (not the head's): channels | quaternion, morph: { Fin_*: weights } }. */
export function bodyOf(pose = {}) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) if (isBodyJoint(k)) out[k] = structuredClone(v);
  const m = Object.fromEntries(Object.entries(pose.morph ?? {}).filter(([k]) => isFinMorph(k)).map(([k, v]) => [k, structuredClone(v)]));
  if (Object.keys(m).length) out.morph = m;
  return out;
}

/** `pose` with its body replaced by `body` (bodyOf's form): the head's joints, the gaze and every weight that is not a
 * fin's kept; every body joint and fin weight the build had dropped, the lock's added. */
export function withBody(pose = {}, body = {}) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) if (!isBodyJoint(k) && k !== 'morph') out[k] = structuredClone(v);
  for (const [k, v] of Object.entries(body)) if (k !== 'morph') out[k] = structuredClone(v);
  const m = Object.fromEntries(Object.entries(pose.morph ?? {}).filter(([k]) => !isFinMorph(k)).map(([k, v]) => [k, structuredClone(v)]));
  for (const [k, v] of Object.entries(body.morph ?? {})) m[k] = structuredClone(v);
  if (Object.keys(m).length || pose.morph) out.morph = m;
  return out;
}

const qAngle = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) / (Math.hypot(...a) * Math.hypot(...b) || 1); return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI; };
/** The largest difference between two poses' bodies: { deg (channels; quaternions by their angle), mm (J_root t, in HL
 * as the poses hold it × hlMM), w (fin weights), worst: 'joint.channel' }. */
export function bodyDrift(a = {}, b = {}, hlMM = 16.134453781512605) {
  const A = bodyOf(a), B = bodyOf(b), r = { deg: 0, mm: 0, w: 0, worst: null };
  const bump = (k, kind, d) => { if (d > r[kind]) { r[kind] = d; if (kind === 'deg') r.worst = k; } };
  for (const j of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (j === 'morph') continue;
    const x = A[j], y = B[j];
    if (Array.isArray(x) || Array.isArray(y)) { bump(j, 'deg', qAngle(x ?? [0, 0, 0, 1], y ?? [0, 0, 0, 1])); continue; }
    for (const c of new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])) {
      if (c === 't') { const p = x?.t ?? [0, 0, 0], q = y?.t ?? [0, 0, 0]; bump(`${j}.t`, 'mm', Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * hlMM); continue; }
      bump(`${j}.${c}`, 'deg', Math.abs((x?.[c] ?? 0) - (y?.[c] ?? 0)));
    }
  }
  for (const f of new Set([...Object.keys(A.morph ?? {}), ...Object.keys(B.morph ?? {})])) for (const t of new Set([...Object.keys(A.morph?.[f] ?? {}), ...Object.keys(B.morph?.[f] ?? {})])) bump(`${f}.${t}`, 'w', Math.abs((A.morph?.[f]?.[t] ?? 0) - (B.morph?.[f]?.[t] ?? 0)));
  for (const k of ['deg', 'mm', 'w']) r[k] = +r[k].toFixed(5);
  return r;
}

/** The lock (null without the file). */
export function loadPoseLock(file = POSE_LOCK_FILE) {
  if (!file || !fs.existsSync(file)) return null;
  const L = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (L.format !== 'tobihaze-pose-lock/1') throw new Error(`poselock: ${file} is not a tobihaze-pose-lock/1 file`);
  L.file = file;
  return L;
}

/** One frame list's key: the frames by index, checked against the build's own (phase or raise within 1e-4). */
export function matchFrames(built, locked, key, what) {
  if (built.length !== locked.length) throw new Error(`poselock: ${what}: the build has ${built.length} frames, the lock ${locked.length} (rebuild the lock: the rig's frame plan changed)`);
  built.forEach((f, i) => { if (Math.abs((f[key] ?? 0) - (locked[i][key] ?? 0)) > 1e-4) throw new Error(`poselock: ${what} frame ${i}: ${key} ${f[key]} against the lock's ${locked[i][key]}`); });
  return locked;
}

// ------------------------------------------------------------------------------------------------ writing the lock

/** A GLB's root extras tobihaze (the node that carries it). */
function rootExtras(buf) {
  const len = buf.readUInt32LE(12), j = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  for (const n of j.nodes ?? []) if (n.extras?.tobihaze?.states) return n.extras.tobihaze;
  throw new Error('poselock: no extras.tobihaze with states in the GLB');
}
/** lod2's trimmed frames ({ ...common, ...pose }, the weights merged per fin) back to whole poses. */
function merged(common, pose) {
  if (!common) return pose;
  const out = { ...structuredClone(common), ...structuredClone(pose) };
  if (common.morph || pose.morph) { out.morph = structuredClone(common.morph ?? {}); for (const [f, w] of Object.entries(pose.morph ?? {})) out.morph[f] = { ...(out.morph[f] ?? {}), ...w }; }
  return out;
}
const crawlOf = (C, tier) => ({
  frames: C.frames.map((f) => ({ phase: f.phase, pose: bodyOf(merged(C.common, f.pose)), contacts: f.contacts ?? null, ...(f.tipErrMM !== undefined ? { tipErrMM: f.tipErrMM } : {}) })),
  weldMM: C.weldMM, weldRMM: C.weldRMM, ...(C.weldBind ? { weldBind: C.weldBind } : {}), groundMM: C.groundMM, tier,
});

/** The lock from three tiers' GLBs (Buffers by tier). */
export function lockFromGLBs(glbs, source) {
  const X = Object.fromEntries(Object.entries(glbs).map(([t, b]) => [t, rootExtras(b)]));
  const H = X.hero;
  return {
    format: 'tobihaze-pose-lock/1',
    source,
    about: 'The body\'s poses as round T3 shipped them (tools/models/tobihaze/poselock.mjs; build.mjs holds them: every joint channel but the head\'s and every fin weight). Grounds and contacts are re-measured by the build on its own mesh; the values below that are not poses are T3\'s for reference.',
    headJoints: HEAD_JOINTS,
    hero: {
      states: Object.fromEntries(Object.entries(H.states).map(([st, S]) => [st, { pose: bodyOf(S.pose), groundMM: S.groundMM }])),
      prop: H.prop.frames.map((f) => ({ raise: f.raise, pose: bodyOf(merged(H.prop.common, f.pose)), groundMM: f.groundMM, weldErrMM: f.weldErrMM })),
      transitions: Object.fromEntries(Object.entries(H.transitions).map(([k, T]) => [k, { from: T.from, to: T.to, lift: T.lift }])),
      crawl: crawlOf(H.crawl, 'hero'),
    },
    lod1: { crawl: crawlOf(X.lod1.crawl, 'lod1') },
    lod2: { crawl: crawlOf(X.lod2.crawl, 'lod2') },
  };
}

/** One pose a line (and the contacts, lifts and weld points): the lock stays readable in a diff. */
export function stringifyLock(L) {
  const { file, ...rest } = L;
  void file;
  const inline = [], INLINE = new Set(['pose', 'contacts', 'lift', 'weldMM', 'weldRMM', 'weldBind', 'headJoints']);
  const s = JSON.stringify(rest, (k, v) => {
    if (INLINE.has(k) && v && typeof v === 'object') { inline.push(JSON.stringify(v)); return `\u0000${inline.length - 1}\u0000`; }
    return v;
  }, 1);
  return s.replace(/"\\u0000(\d+)\\u0000"/g, (_, i) => inline[+i]) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const rev = arg('--from-git', null), dir = arg('--from-dir', null), out = path.resolve(arg('--out', POSE_LOCK_FILE));
  if (!rev && !dir) { console.error('usage: poselock.mjs --from-git <rev> | --from-dir <dir> [--out <file>]'); process.exit(2); }
  const root = path.resolve(here, '../../..');
  const glbs = Object.fromEntries(['hero', 'lod1', 'lod2'].map((t) => [t, rev
    ? execFileSync('git', ['show', `${rev}:src/assets/models/tobihaze/tobihaze.${t}.glb`], { cwd: root, maxBuffer: 1 << 28 })
    : fs.readFileSync(path.join(dir, `tobihaze.${t}.glb`))]));
  const L = lockFromGLBs(glbs, rev ? `git ${rev}: src/assets/models/tobihaze/tobihaze.{hero,lod1,lod2}.glb extras.tobihaze` : `${dir}/tobihaze.{hero,lod1,lod2}.glb extras.tobihaze`);
  fs.writeFileSync(out, stringifyLock(L));
  console.log(`pose lock → ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(1)} kB): hero ${Object.keys(L.hero.states).length} states, ${L.hero.prop.length} prop keys, ${Object.keys(L.hero.transitions).length} transitions, crawl ${L.hero.crawl.frames.length} / ${L.lod1.crawl.frames.length} / ${L.lod2.crawl.frames.length} frames`);
}
