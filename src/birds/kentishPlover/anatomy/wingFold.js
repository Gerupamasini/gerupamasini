import * as THREE from 'three';
import { WING } from './featherLayout.js';
import { projectToSurface } from './sdf.js';
import { featherOffset, wingFrame, LOD2_CARD, rowT } from './feathers.js';
import { COVERT_ARM } from './skeleton.js';
import { frameQuat } from '../../../core/math.js';
import PRECOMPUTED from './wingFold.cache.js';

// Folded-wing solution (computed once, in chest/bind space, LEFT wing; right = mirrored locals).
// 1) Arm: Z-fold (humerus back, forearm forward, hand back), dorsal surface facing out & up.
// 2) Every flight feather / covert gets its own folded orientation so the stack wraps the
//    curved flank instead of lying in one rigid plane (a rigid plane leaves the feathers 10+ mm
//    off the body — measured with tools/dev/extent.mjs). Coverts are rooted on the folded arm and aimed
//    where they lay on their remex (riding rigidly on the remex bone put e.g. median covert 1 8 mm in
//    front of the wrist, out through the lower breast).
// 3) Clearance: a rigid feather aimed only by its tip still cuts through the body with its curved shaft,
//    cambered vanes or the coverts riding on it. Each feather is therefore pitched about its base by the
//    smallest angle after which its real surface (same shape as the mesh, feathers.featherOffset) either
//    stays buried or, once it has emerged from the plumage, stays CLEAR mm above the body outline — with
//    and without the neck, which moves away from the shoulders when the head turns
//    (tools/dev/penetration.mjs measures the result in every pose).
// 4) The same clearance for the spread wing: the wing plane passes through the upper body at the wing root,
//    so the tertials and innermost coverts are lifted off it for each humerus elevation × sweep × twist of
//    flapping / landing / stretching (checked half-way between the entries too); the shoulder-end marginal
//    coverts no lift clears (pressed against the neck / breast) are drawn back into the plumage (bone scale,
//    0.8 at least).
//    The level-wing aim is baked into their bind geometry, the rest is interpolated by the animator
//    (spreadAt, spreadScaleAt).
// 5) Folded wing raised off the flank (preening, scratching; WING_RAISE) and the fold path (foldPath) below.
// The result is precomputed (wingFold.cache.js, see computeWingFold).

const smooth01 = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const Y = new THREE.Vector3(0, 1, 0);

// folded arm bone directions (x) and dorsal hints (y): shoulder (10, 77, 6) → elbow (11, 67, −28) → carpal joint
// (16, 71, 16) → hand tip (16.5, 67.8, −11); the folded wing falls ≈9° toward the rear (spec §10.2)
export const FOLD_TARGET = {
  humerus: { x: [0.028, -0.282, -0.959], y: [0.8, 0.5, 0.2] },
  forearm: { x: [0.115, 0.092, 0.989], y: [0.8, 0.6, 0] },
  hand: { x: [0.02, -0.12, -0.99], y: [0.55, 0.83, 0] },
};

function armFold() {
  const seg = (a, b) => V(b).sub(V(a)).normalize();
  const bindFrame = (a, b) => frameQuat(seg(a, b), Y);
  const tgt = (k) => frameQuat(V(FOLD_TARGET[k].x), V(FOLD_TARGET[k].y));
  const wH = tgt('humerus').multiply(bindFrame(WING.humerus, WING.elbow).invert());
  const wF = tgt('forearm').multiply(bindFrame(WING.elbow, WING.wrist).invert());
  const wW = tgt('hand').multiply(bindFrame(WING.wrist, WING.handTip).invert());
  return { wH, wF, wW, humerus: wH, forearm: wH.clone().invert().multiply(wF), hand: wF.clone().invert().multiply(wW) };
}

// Folded wing raised off the flank as a whole (preening under it, scratching over it; animator): the shoulder
// turns about a hinge along the body's long axis on the wing's dorsal edge (left wing, mm). Every feather
// gets a re-aim per raise step so it stays clear of the flank all the way (raiseAt).
export const WING_RAISE = { hinge: [8, 84, -12], steps: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3] };
// mm: how much the flank swells under the raised wing when preening (fluff 0.7: 2.5 mm per unit of fluff on the
// sides beyond the rest fluff 0.15, bodyMesh.bodyDisplacementMasks)
const RAISE_FLUFF = 1.4;
// mm: how much it shrinks when sleeked folding / unfolding at take-off (fluff −0.3)
const RAISE_SLEEK = 1.1;

/** Re-aim of a folded feather (local, premultiplied onto its folded rotation) with the wing raised by `a`. */
export function raiseAt(entry, a, out = new THREE.Quaternion()) {
  const [i, u] = cell(WING_RAISE.steps, a);
  return out.copy(entry[i]).slerp(entry[i + 1], u);
}

const CLEAR = 0.35; // mm: minimal height of exposed feather surface over the body outline
const SAG = 0.1; // mm: tolerated sag of an exposed line toward the outline (no visible dip)

// Folded wing as a thin layered shell (body_shape_spec.md §10.4: smooth overlapping rows, not separate plates):
// every folded wing feather is bent onto the body at its own height above the outline — proximal feathers over
// distal ones, remiges < greater < median coverts < tertials, the scapulars (feathers.js) on top — so rows
// overlap in order and the stack stays within 1.5 mm of the flank (spec §10.3). The primary coverts, alula and
// lesser coverts lie under the breast-side and mantle plumage (the carpal joint and the wing's front edge are
// hidden, spec §10.2 / §14) and are pressed below the outline.
// Height (mm) above the outline, per feather.
export function foldLayer(f) {
  switch (f.type) {
    case 'primary':
      return 0.45 + 0.012 * (10 - f.index);
    case 'secondary':
      return 0.62 + 0.02 * f.index;
    case 'greaterCovert':
      return 0.9 + 0.015 * f.index;
    case 'medianCovert':
      return 1.1 + 0.015 * f.index;
    case 'tertial':
      return 1.3 + 0.06 * f.index;
    case 'lesserCovert':
      return -2; // under the scapulars and the neck base
    default:
      return -1.2; // primary coverts, alula
  }
}
// the bend is applied while the wing is folded (feather shader: aConform · smoothstep(0.6, 0.8, fold))
export const CONFORM_FOLD = [0.6, 0.8];
export const conformWeight = (fold) => smooth01(CONFORM_FOLD[0], CONFORM_FOLD[1], fold);
const FLAT = 0.12; // folded vanes pressed flat: this much of the camber is kept

/**
 * Bend of a folded feather onto its shell layer: world displacement (mm) of the point `p` (folded, world) at
 * shaft position t, vane position a. From its base (inside the plumage) the feather rises to its layer by
 * t 0.22 and then stays there; parts standing further off than 2.5–6 mm (over the tail, behind the rump) keep
 * their straight shape. The primaries stay under the plumage for their basal third (under the primary coverts
 * in the bird, spec §10.2) and come out under the secondaries and tertials. Layers below the outline only push
 * down — below the trunk's outline without the neck (`torso`), which leaves the shoulders when the head turns:
 * the trunk-only outline (bodyMesh.getTorsoSDF trunkOnly), without the neck-filling plumage either (mantleNape,
 * foreBreast, neck sides), which the neck sleeve carries away with the head (validation §W).
 * With `normal` the bent surface's normal is returned too (world).
 */
export function conformAt(f, p, t, a, sdf, torso = sdf, normal = null) {
  // (the primaries' rear half lies over the upper-tail coverts on the rump, not on the rump itself: the top
  // outline runs on from the tertial tips to the wing tip over the tail, photos, spec §2, §10.3)
  const overRump = f.type === 'primary' ? 3 * smooth01(-50, -62, p.z) : 0;
  const H = foldLayer(f) + overRump + FLAT * (featherOffset(f, t, a)[2] - featherOffset(f, t, 0)[2]);
  if (H < 0) sdf = torso;
  const d = sdf(p.x, p.y, p.z);
  let target;
  if (H < 0) target = Math.min(d, H);
  else {
    const shell = d > H ? d + (H - d) * (1 - smooth01(H + 2.5, H + 6, d)) : H;
    // (from 0.33 of the length on: from 0.28 the inner primaries' inner vanes grazed out of the flank 0.1–0.2 mm
    // under the tertials when fluffed for preening, and the flank showed over them, validation §W)
    const t0 = f.type === 'primary' ? 0.33 : 0;
    const under = f.type === 'primary' ? Math.min(torso(p.x, p.y, p.z), -1.2) + d - torso(p.x, p.y, p.z) : d;
    target = under + (shell - under) * smooth01(t0, t0 + 0.22, t);
    // the wing's front edge goes in under the breast-side patch, which covers the bend of the wing (spec
    // §10.2, §14; p006, p066): pressed below the outline in front of the patch's rear edge
    const k = underPatch(p);
    if (k > 0) target += (Math.min(d, -1.2) - target) * k;
  }
  const q = p.clone();
  const g = new THREE.Vector3();
  for (let it = 0; it < 3; it++) {
    const e = 0.15;
    const dq = sdf(q.x, q.y, q.z);
    g.set(sdf(q.x + e, q.y, q.z) - sdf(q.x - e, q.y, q.z), sdf(q.x, q.y + e, q.z) - sdf(q.x, q.y - e, q.z), sdf(q.x, q.y, q.z + e) - sdf(q.x, q.y, q.z - e)).normalize();
    q.addScaledVector(g, target - dq);
  }
  if (normal) normal.copy(g);
  return q.sub(p);
}

// Breast-side patch (KentishPloverMaterials kpPlumage): axis (z, y) (6, 86) → (24, 63), half-width 3 at the ends
// and 5 in the middle. 1 under it and up to 1 mm behind its rear edge, 0 from 2.5 mm behind it on.
function underPatch(p) {
  if (Math.abs(p.x) < 6) return 0;
  const pz = p.z - 6;
  const py = p.y - 86;
  const tt = Math.max(0, Math.min(1, (pz * 18 - py * 23) / (18 * 18 + 23 * 23)));
  const hw = 3 + 2 * (1 - Math.abs(2 * tt - 1));
  const behind = (-pz * 23 - py * 18) / Math.hypot(18, 23); // signed distance from the axis toward the rear / below
  return 1 - smooth01(hw + 1.0, hw + 2.5, behind);
}

/** Sample lines bent onto the shell (bind offsets), for a wing folded to `w` of the bend (conformWeight). */
function conformLines(lines, base, R, sdf, torso, w = 1) {
  if (!w) return lines;
  const Rinv = R.clone().invert();
  return lines.map((l) => l.map((o) => {
    const p = o.clone().applyQuaternion(R).add(base);
    const c = o.clone().add(conformAt(o.f, p, o.t, o.a, sdf, torso).applyQuaternion(Rinv).multiplyScalar(w));
    Object.assign(c, { f: o.f, t: o.t, a: o.a });
    return c;
  }));
}

/**
 * Sample lines (bind-space offsets from the feather base) along the shaft at positions across the vane — plus
 * the vane edges of the wider LOD2 card of the same feather, which rides the same bone.
 */
function shapeLines(f, across = [-1, -0.5, 0, 0.5, 1], along = 13, card = LOD2_CARD.types.has(f.type)) {
  const fr = wingFrame(f);
  const lines = across.map((a) =>
    Array.from({ length: along }, (_, i) => {
      const o = featherOffset(f, i / (along - 1), a);
      return Object.assign(new THREE.Vector3(...[0, 1, 2].map((k) => fr.dir[k] * o[0] + fr.side[k] * o[1] + fr.normal[k] * o[2])), { f, t: i / (along - 1), a });
    })
  );
  return card ? lines.concat(cardLines({ ...f, width: f.width * LOD2_CARD.width })) : lines;
}

/** The LOD2 card as tessellated (LOD2_CARD.rows rows, vane edges + rachis), straight between its vertices. */
function cardLines(f) {
  const fr = wingFrame(f);
  const n = LOD2_CARD.rows;
  const at = (t, a) => {
    const o = featherOffset(f, t, a);
    return Object.assign(new THREE.Vector3(...[0, 1, 2].map((k) => fr.dir[k] * o[0] + fr.side[k] * o[1] + fr.normal[k] * o[2])), { f, t, a });
  };
  return [-1, 0, 1].map((a) => {
    const line = [];
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < 4; j++) {
        const t = rowT(i, n) + (rowT(i + 1, n) - rowT(i, n)) * (j / 4);
        line.push(Object.assign(at(rowT(i, n), a).lerp(at(rowT(i + 1, n), a), j / 4), { f, t, a }));
      }
    line.push(at(1, a));
    return line;
  });
}

/**
 * How far (mm) the feather violates the clearance rule for world rotation R about `base`:
 * along every sample line, once the surface has emerged it must not sink below min(height so far, CLEAR)
 * (less a small SAG); a line whose highest point lies within ±CLEAR of the outline grazes it (flickers)
 * and counts too, as does a line emerging where the outline faces down (normal y < −0.6).
 */
function violation(lines, base, R, sdf, pose, stop = Infinity, clear = CLEAR) {
  let v = 0;
  const p = _p;
  for (const line of lines) {
    let top = -Infinity;
    let prev = Infinity;
    for (const o of line) {
      p.copy(o).applyQuaternion(R).add(base);
      if (pose) p.sub(pose.pivot).applyQuaternion(pose.q).add(pose.pivot);
      const d = sdf(p.x, p.y, p.z);
      if (top > 0) v = Math.max(v, Math.min(top, clear) - SAG - d);
      // coming out of the plumage on the underside (belly / lower breast) sticks out below the bird
      if (prev < 0 && d >= 0 && sdf(p.x, p.y + 0.2, p.z) - sdf(p.x, p.y - 0.2, p.z) < -0.24) v = Math.max(v, clear);
      top = Math.max(top, d);
      prev = d;
    }
    if (Math.abs(top) < clear) v = Math.max(v, clear - Math.abs(top));
    if (v > stop) return v; // only asked whether it is feasible
  }
  return v;
}
const _p = new THREE.Vector3();

/**
 * Smallest pitch about the base (tip away from / into the body, at most `down` degrees into it) that
 * satisfies the clearance rule for every outline in `sdfs` and every rigid wing pose in `poses`
 * ({q, pivot}; null = as placed). 2° scan, then bisection to 1/16°. If no pitch works, the feather is also
 * turned about its dorsal normal by the `yaws` (degrees, smallest first); else the least violating pitch.
 */
function clearBody(lines, base, Rw, dirW, n, sdfs, { poses = [null], down = 15, yaws = [0] } = {}) {
  // stop: > 0 only asks whether R is feasible (early out); Infinity measures the violation
  const viol = (R, stop = 0) => {
    let v = 0;
    for (const sdf of sdfs) for (const pose of poses) if ((v = Math.max(v, violation(lines, base, R, sdf, pose, stop))) > stop) return v;
    return v;
  };
  if (viol(Rw) <= 0) return Rw;
  const candidates = function* () {
    for (const yaw of yaws) {
      const y = (yaw * Math.PI) / 180;
      const Ry = new THREE.Quaternion().setFromAxisAngle(n, y).multiply(Rw);
      const axis = dirW.clone().applyAxisAngle(n, y).cross(n).normalize(); // +angle lifts the tip off the body
      const at = (deg) => new THREE.Quaternion().setFromAxisAngle(axis, (deg * Math.PI) / 180).multiply(Ry);
      for (let k = yaw ? 0 : 2; k <= 30; k += 2) for (const deg of k ? [k, -k] : [0]) if (deg >= -down) yield [at, deg];
    }
  };
  for (const [at, deg] of candidates()) {
    if (viol(at(deg)) > 0) continue;
    let [lo, hi] = [deg - 2 * Math.sign(deg), deg]; // infeasible … feasible
    for (let it = 0; it < 5 && deg; it++) {
      const mid = (lo + hi) / 2;
      if (viol(at(mid)) <= 0) hi = mid;
      else lo = mid;
    }
    return at(hi);
  }
  // nothing clears it: the least violating candidate
  let best = Rw;
  let bestV = Infinity;
  for (const [at, deg] of candidates()) {
    const v = viol(at(deg), Infinity);
    if (v < bestV) [best, bestV] = [at(deg), v];
  }
  return best;
}

// humerus elevations (rad, left wing: + = up), sweeps (+ = back) and twists (about the humerus: − in the
// upstroke and when braking, + in the downstroke; animator) at which the spread wing root is cleared:
// downstroke … level (gliding) … upstroke / wing raised after landing … wing stretch over the back
export const SPREAD_ELEVATION = [-0.8, -0.4, 0, 0.45, 0.9, 1.3];
export const SPREAD_SWEEP = [-0.3, -0.05, 0.3];
export const SPREAD_TWIST = [-0.45, -0.2, 0, 0.15];

function cell(A, v) {
  const x = Math.max(A[0], Math.min(A[A.length - 1], v));
  let i = 0;
  while (i < A.length - 2 && x > A[i + 1]) i++;
  return [i, (x - A[i]) / (A[i + 1] - A[i])];
}

/** Spread-wing re-aim of a wing-root feather for humerus elevation / sweep / twist (local, about its base). */
export function spreadAt(entry, elev, sweep, twist, out = new THREE.Quaternion()) {
  const [i, u] = cell(SPREAD_ELEVATION, elev);
  const [j, v] = cell(SPREAD_SWEEP, sweep);
  const [k, w] = cell(SPREAD_TWIST, twist);
  const T = entry.table;
  const bil = (kk, q) => {
    _qa.copy(T[i][j][kk]).slerp(T[i + 1][j][kk], u);
    _qb.copy(T[i][j + 1][kk]).slerp(T[i + 1][j + 1][kk], u);
    return q.copy(_qa).slerp(_qb, v);
  };
  bil(k, out);
  return out.slerp(bil(k + 1, _qc), w);
}
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();

/** Spread-wing length factor of a wing-root feather (bone scale about its base; 1 = full length). */
export function spreadScaleAt(entry, elev, sweep, twist) {
  const [i, u] = cell(SPREAD_ELEVATION, elev);
  const [j, v] = cell(SPREAD_SWEEP, sweep);
  const [k, w] = cell(SPREAD_TWIST, twist);
  const S = entry.scale;
  const l = (a, b, t) => a + (b - a) * t;
  const bil = (kk) => l(l(S[i][j][kk], S[i + 1][j][kk], u), l(S[i][j + 1][kk], S[i + 1][j + 1][kk], u), v);
  return l(bil(k), bil(k + 1), w);
}

/**
 * Largest length factor up to `from` (bisection) at which the feather at R about `base` clears the outlines; down to
 * MIN_SCALE at most (a covert drawn back further would bare the arm under it).
 */
const MIN_SCALE = 0.8;
function shrinkToClear(lines, base, R, sdfs, pose, from = 1, clear = CLEAR) {
  const ok = (s) => sdfs.every((sdf) => violation(s === 1 ? lines : lines.map((l) => l.map((o) => o.clone().multiplyScalar(s))), base, R, sdf, pose, 0, clear) <= 0);
  if (ok(from)) return from;
  if (!ok(MIN_SCALE)) return MIN_SCALE;
  let [lo, hi] = [MIN_SCALE, from]; // clear … not clear
  for (let it = 0; it < 5; it++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

let CACHE = null;

// The solution takes a couple of seconds to compute, so it ships precomputed (wingFold.cache.js, written by
// tools/dev/wingfold-cache.mjs) under a key of what it depends on: the solver version, the wing layout and the
// body outline (sampled). Whenever either changes the key no longer matches and the solution is computed
// here instead (with a console warning to regenerate the cache).
export const WING_FOLD_SOLVER = 22; // bump with any change of the solver below
export function wingFoldKey(wingFeathers, sdf, torsoSdf = sdf) {
  const probe = [];
  for (let x = 0; x <= 24; x += 6) for (let y = 40; y <= 90; y += 10) for (let z = -50; z <= 50; z += 10) probe.push(Math.round(sdf(x, y, z) * 100), Math.round(torsoSdf(x, y, z) * 100));
  const text = JSON.stringify([WING_FOLD_SOLVER, wingFeathers, probe]);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + text.charCodeAt(i), 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const qa = (q) => [q.x, q.y, q.z, q.w].map(r6);
const va = (v) => [v.x, v.y, v.z].map(r6);
const aq = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
const mapObj = (m, f) => Object.fromEntries([...m].map(([k, v]) => [k, f(v)]));
const objMap = (o, f) => new Map(Object.entries(o).map(([k, v]) => [k, f(v)]));

/** Plain-data form of a wing-fold solution (tools/dev/wingfold-cache.mjs). */
export function serializeWingFold(F) {
  return {
    arm: { humerus: qa(F.arm.humerus), forearm: qa(F.arm.forearm), hand: qa(F.arm.hand) },
    feather: mapObj(F.feather, qa),
    world: mapObj(F.world, (w) => ({ base: va(w.base), R: qa(w.R) })),
    spread: mapObj(F.spread, (e) => ({ bake: qa(e.bake), table: e.table.map((r) => r.map((c) => c.map(qa))), scale: e.scale.map((r) => r.map((c) => c.map(r6))) })),
    raise: mapObj(F.raise, (e) => e.map(qa)),
  };
}

function deserializeWingFold(D) {
  return {
    arm: { humerus: aq(D.arm.humerus), forearm: aq(D.arm.forearm), hand: aq(D.arm.hand) },
    feather: objMap(D.feather, aq),
    world: objMap(D.world, (w) => ({ base: V(w.base), R: aq(w.R) })),
    spread: objMap(D.spread, (e) => ({ bake: aq(e.bake), table: e.table.map((r) => r.map((c) => c.map(aq))), scale: e.scale })),
    raise: objMap(D.raise, (e) => e.map(aq)),
  };
}

/**
 * @param {object[]} wingFeathers  layout records (featherLayout.buildWingLayout)
 * @param {Function} sdf  body SDF (mm)
 * @param {Function} torsoSdf  body SDF without neck & head (bodyMesh.getTorsoSDF)
 * @returns {{arm:{humerus,forearm,hand}, feather: Map<string, THREE.Quaternion>, world: Map<string, {base, R}>,
 *   spread: Map<string, {bake: THREE.Quaternion, table: THREE.Quaternion[][][]}>, raise: Map<string,
 *   THREE.Quaternion[]>}}  folded local quaternions (+ each feather bone's folded world placement); for the
 *   wing-root feathers the level-wing re-aim baked into their bind geometry plus the extra local rotation per
 *   elevation × sweep × twist; per folded feather its re-aim per WING_RAISE step
 */
export function computeWingFold(wingFeathers, sdf, torsoSdf = sdf, { useCache = true } = {}) {
  if (CACHE) return CACHE;
  if (useCache) {
    if (PRECOMPUTED.key === wingFoldKey(wingFeathers, sdf, torsoSdf)) return (CACHE = { ...deserializeWingFold(PRECOMPUTED.data), torso: torsoSdf });
    console.warn('wingFold: the precomputed wing fold is out of date (body or wing layout changed) — solving it now; run node tools/dev/wingfold-cache.mjs');
  }
  const A = armFold();
  const S = V(WING.humerus);
  const E = S.clone().add(V(WING.elbow).sub(S).applyQuaternion(A.wH));
  const W = E.clone().add(V(WING.wrist).sub(V(WING.elbow)).applyQuaternion(A.wF));
  const parent = {
    humerus: { q: A.wH, pivotBind: V(WING.humerus), pivot: S },
    forearm: { q: A.wF, pivotBind: V(WING.elbow), pivot: E },
    hand: { q: A.wW, pivotBind: V(WING.wrist), pivot: W },
  };
  const feather = new Map();
  const world = new Map(); // folded feather bones in chest/bind space: {base (mm), R} (feathers.js: body contact)
  const remex = new Map(); // folded remiges: {bind base, world base, world rotation} for their coverts
  const deg = Math.PI / 180;
  const raise = new Map();
  const raised = WING_RAISE.steps.map(raisePose);
  const halfRaised = WING_RAISE.steps.slice(1).map((a, i) => raisePose((a + WING_RAISE.steps[i]) / 2));
  // stacking order (dorsal layer) so feathers keep their overlap when folded
  const order = {};
  wingFeathers.forEach((f) => (order[f.name] = f.layer ?? 0));

  for (const f of wingFeathers) {
    let pName;
    if (f.type === 'primary') pName = 'hand';
    else if (f.type === 'secondary') pName = 'forearm';
    else if (f.type === 'tertial') pName = 'humerus';
    else if (f.type === 'lesserCovert') pName = f.bone;
    else if (f.type === 'alula') pName = 'hand';
    else if (COVERT_ARM[f.type]) pName = COVERT_ARM[f.type];
    else continue;
    const P = parent[pName];
    const base = V(f.base).sub(P.pivotBind).applyQuaternion(P.q).add(P.pivot);
    const L = f.length;
    let tip;
    let n;
    if (f.type === 'primary') {
      // tips converge over the tail: longest primaries meet near the midline at the tail tip (±5 mm)
      const zTip = V(f.base).z - 0; // unused
      // (drawn 0.6–2.4 mm closer to the midline than 4.8 + 0.9·(10 − i): from above the folded wings taper to a point
      // over the tail instead of ending in two splayed lobes 26 mm apart — validation §Y)
      const x = 4.2 + (10 - f.index) * 0.7;
      // p9 tip (−84, 57.4), spec §10.3; the chord ends higher by the shaft's ventral bend (featherOffset)
      const y = 57.0 + (10 - f.index) * 0.35 + f.curve * L * 0.83;
      const dz = Math.sqrt(Math.max(1, L * L - (x - base.x) ** 2 - (y - base.y) ** 2));
      tip = new THREE.Vector3(x, y, base.z - dz);
      n = V([0.55, 0.83, 0]).normalize();
      void zTip;
    } else if (COVERT_ARM[f.type]) {
      // same tip and dorsal side as when it rode on its remex, but rooted on the arm
      const r = remex.get(f.bone);
      const onRemex = V(f.base).add(new THREE.Vector3(Math.cos(f.angle * deg), 0, -Math.sin(f.angle * deg)).multiplyScalar(L));
      tip = onRemex.sub(r.bindBase).applyQuaternion(r.Rw).add(r.base);
      tip = base.clone().addScaledVector(tip.sub(base).normalize(), L);
      n = Y.clone().applyQuaternion(r.Rw);
    } else {
      // lie back along the body surface, lifted by the stack thickness
      // the folded wing falls toward the rear (spec §10.2)
      const lcHint = { humerus: [0.0, -0.05, -1], forearm: [0.03, -0.35, -1], hand: [-0.25, 0.15, -1] };
      if (f.type === 'alula') lcHint.alula = [-0.25, 0.2, -1];
      const dirHint = f.type === 'alula' ? V(lcHint.alula) : f.type === 'lesserCovert' ? V(lcHint[f.bone]) : V([0.0, -0.12, -1]);
      dirHint.normalize();
      // tertials: tips at z −52 ± 5, y ≈ 67.7 (spec §10.3), the innermost nearest the back line — the three
      // lying side by side over the rear of the folded wing, under the scapulars.
      // secondaries fanned below the forearm: the outer ones (from the carpal joint, which sits high under the
      // breast-side patch) run steeply down and back, the inner ones nearly level, so the wing's lower edge
      // (s1's outer vane, then the tips) runs 1–2 mm below the brown/white boundary of the photos (spec §10.1),
      // lowest at z −20…−35, and rises toward the tail
      const sTip = (j) => {
        const u = (j - 1) / 10;
        return V([12, 55.5 + 8 * u ** 1.6, -23 - 37 * u]);
      };
      const guess = f.type === 'tertial' ? V([[10.5, 65.5, -53], [8, 67, -52], [5.5, 68, -50.5]][f.index - 1]) : f.type === 'secondary' ? sTip(f.index) : base.clone().addScaledVector(dirHint, L);
      const [pp, nn] = projectToSurface(sdf, guess.x, guess.y, guess.z);
      const lift = f.type === 'alula' ? -0.6 : f.type === 'lesserCovert' && f.bone === 'hand' ? 1.2 : f.type === 'lesserCovert' ? 2.6 : f.type === 'tertial' ? 3.4 : 2.2 + (order[f.name] ?? 0) * 0.05;
      const surfTip = V(pp).addScaledVector(V(nn), lift);
      // If the body has ended (behind the rump; the relaxed body reaches z −66), keep the straight hint instead
      tip = guess.z < -62 ? guess : surfTip;
      // keep feather length: re-normalise direction
      const d = tip.clone().sub(base).normalize();
      tip = base.clone().addScaledVector(d, L);
      const [, nMid] = projectToSurface(sdf, (base.x + tip.x) / 2, (base.y + tip.y) / 2, (base.z + tip.z) / 2);
      n = V(nMid);
    }
    const dirW = tip.clone().sub(base).normalize();
    const bindDir = new THREE.Vector3(Math.cos(f.angle * deg), 0, -Math.sin(f.angle * deg));
    // target frame: feather along dirW, dorsal surface facing the body normal (outward)
    let Rw = frameQuat(dirW, n).multiply(frameQuat(bindDir, Y).invert());
    // (no clearance turn: the bend onto the shell keeps the folded feather out of the body)
    const lines = conformLines(shapeLines(f), base, Rw, sdf, torsoSdf);
    {
      // re-aimed per raise step; half-way between two steps, where the interpolated aim is not clear, the
      // (raised) steps on either side are solved for that raise as well — against the body fluffed as when
      // preening (RAISE_FLUFF) and sleeked as when taking off (RAISE_SLEEK) too: a raised feather stands too far
      // off to rise and fall with the plumage under it
      const offset = (s, m) => (x, y, z) => s(x, y, z) - m;
      // (not sleeked for the lesser coverts, under the scapulars, which stay on the plumage over the arm)
      const sleek = f.type !== 'lesserCovert';
      const sdfs = [sdf, torsoSdf, offset(sdf, RAISE_FLUFF), ...(sleek ? [offset(sdf, -RAISE_SLEEK)] : [])];
      const clear = (R, pose) => sdfs.every((s) => violation(lines, base, R, s, pose, 0) <= 0);
      let Rs = raised.map((pose, i) => (i ? clearBody(lines, base, Rw, dirW, n, sdfs, { poses: [pose] }) : Rw));
      const extra = raised.map(() => []);
      for (let i = 0; i < Rs.length - 1; i++) {
        const pose = halfRaised[i];
        if (clear(Rs[i].clone().slerp(Rs[i + 1], 0.5), pose)) continue;
        if (i) extra[i].push(pose);
        extra[i + 1].push(pose);
      }
      Rs = Rs.map((R, i) => (extra[i].length ? clearBody(lines, base, Rw, dirW, n, sdfs, { poses: [raised[i], ...extra[i]] }) : R));
      const toLocal = P.q.clone().invert();
      const RwInv = Rw.clone().invert();
      raise.set(f.name, Rs.map((Rr) => toLocal.clone().multiply(Rr).multiply(RwInv).multiply(P.q)));
    }
    if (f.type === 'primary' || f.type === 'secondary') remex.set(f.bone, { bindBase: V(f.base), base, Rw });
    const local = P.q.clone().invert().multiply(Rw);
    feather.set(f.name, local);
    world.set(f.name, { base, R: Rw });
  }
  // spread wing (bind pose, every parent at identity; the humerus turns the whole wing about the shoulder):
  // per elevation × sweep × twist the smallest lift of each feather near the body (lift only, so the table
  // varies smoothly between its entries)
  const humerusPose = (elev, sweep, twist) => ({
    q: new THREE.Quaternion().setFromAxisAngle(Y, sweep).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), elev)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), twist)),
    pivot: V(WING.humerus),
  });
  const poses = SPREAD_ELEVATION.map((e) => SPREAD_SWEEP.map((w) => SPREAD_TWIST.map((t) => humerusPose(e, w, t))));
  const levelPose = humerusPose(0, 0, 0); // = bind pose
  // half-way between the entries along one, two or all three axes, with the entries a pose there is
  // interpolated from
  const G = [SPREAD_ELEVATION, SPREAD_SWEEP, SPREAD_TWIST];
  const halfway = [];
  for (let I = 0; I < 2 * G[0].length - 1; I++)
    for (let J = 0; J < 2 * G[1].length - 1; J++)
      for (let K = 0; K < 2 * G[2].length - 1; K++) {
        const H = [I, J, K];
        if (H.every((h) => h % 2 === 0)) continue;
        const [e, w, t] = H.map((h, d) => (G[d][Math.floor(h / 2)] + G[d][Math.ceil(h / 2)]) / 2);
        const ends = H.map((h) => [...new Set([Math.floor(h / 2), Math.ceil(h / 2)])]);
        const corners = ends[0].flatMap((i) => ends[1].flatMap((j) => ends[2].map((k) => [i, j, k])));
        halfway.push({ e, w, t, pose: humerusPose(e, w, t), corners });
      }
  const spread = new Map();
  for (const f of wingFeathers) {
    const lines = shapeLines(f, [-1, 0, 1], 9);
    // near the body in any of the poses? (every other sample, so within 3 mm + half a sample spacing)
    const pts = lines.flatMap((line) => line.filter((o, i) => i % 2 === 0 || i === line.length - 1).map((o) => o.clone().add(V(f.base))));
    const reach = 3 + f.length / 8;
    const p = new THREE.Vector3();
    const near = poses.flat(2).some((pose) => pts.some((o) => (p.copy(o).sub(pose.pivot).applyQuaternion(pose.q).add(pose.pivot), sdf(p.x, p.y, p.z) < reach)));
    if (!near) continue;
    const bindDir = new THREE.Vector3(Math.cos(f.angle * deg), 0, -Math.sin(f.angle * deg));
    // level wing: lifted, or turned along the leading edge (the shoulder-end marginal coverts); then
    // lifted further where the humerus elevation / sweep brings the body closer
    const bake = clearBody(lines, V(f.base), new THREE.Quaternion(), bindDir, Y, [sdf, torsoSdf], { poses: [levelPose], down: 0, yaws: [0, 15, -15, 30, -30, 45, -45, 60, -60, 90, -90] });
    const dirB = bindDir.clone().applyQuaternion(bake);
    const nB = Y.clone().applyQuaternion(bake);
    let table = poses.map((row) => row.map((col) => col.map((pose) => clearBody(lines, V(f.base), bake, dirB, nB, [sdf, torsoSdf], { poses: [pose], down: 20 }))));
    // between the entries (half-way along each axis): where the interpolated aim is not clear, the entries it
    // is interpolated from are lifted for that pose as well
    const extra = poses.map((row) => row.map((col) => col.map(() => [])));
    const Rm = new THREE.Quaternion();
    for (const { e, w, t, pose, corners } of halfway) {
      spreadAt({ table }, e, w, t, Rm);
      if (violation(lines, V(f.base), Rm, sdf, pose, 0) <= 0 && violation(lines, V(f.base), Rm, torsoSdf, pose, 0) <= 0) continue;
      for (const [i, j, k] of corners) extra[i][j][k].push(pose);
    }
    // (lifted further about the same axis in 1° steps: the lift a pose needs only grows with the angle)
    const axis = dirB.clone().cross(nB).normalize();
    const step = new THREE.Quaternion().setFromAxisAngle(axis, deg);
    const clear = (q, pose) => violation(lines, V(f.base), q, sdf, pose, 0) <= 0 && violation(lines, V(f.base), q, torsoSdf, pose, 0) <= 0;
    table = table.map((row, i) =>
      row.map((col, j) =>
        col.map((q0, k) => {
          // (a pose no lift clears is left to the shortening below)
          const top = new THREE.Quaternion().setFromAxisAngle(axis, 30 * deg).multiply(q0);
          const ps = extra[i][j][k].filter((pose) => clear(top, pose));
          let q = q0.clone();
          for (let n = 0; n < 30; n++) {
            const bad = ps.findIndex((pose) => !clear(q, pose));
            if (bad < 0) break;
            ps.unshift(...ps.splice(bad, 1)); // the pose that failed is tried first next time
            q.premultiply(step);
          }
          return q;
        })
      )
    );
    // where no lift clears it (the wing stretched up over the back, whose dorsal side then faces the neck),
    // the feather is also shortened toward its base (bone scale) until it does
    const shrink = /Covert$/.test(f.type); // own bone (the remiges keep their length)
    const scale = poses.map((row, i) => row.map((col, j) => col.map((pose, k) => (shrink ? shrinkToClear(lines, V(f.base), table[i][j][k], [sdf, torsoSdf], pose) : 1))));
    // half-way: where the interpolated length is still too long, the entries it comes from are shortened to
    // what that pose needs
    for (const { e, w, t, pose, corners } of shrink ? halfway : []) {
      spreadAt({ table }, e, w, t, Rm);
      const s = spreadScaleAt({ scale }, e, w, t);
      const need = shrinkToClear(lines, V(f.base), Rm, [sdf, torsoSdf], pose, s);
      for (const [i, j, k] of corners) scale[i][j][k] = Math.min(scale[i][j][k], need);
    }
    if (Math.abs(bake.w) > 1 - 1e-9 && table.flat(2).every((q) => Math.abs(q.w) > 1 - 1e-9) && scale.flat(2).every((s) => s === 1)) continue;
    const inv = bake.clone().invert();
    spread.set(f.name, { bake, table: table.map((row) => row.map((col) => col.map((q) => q.clone().multiply(inv)))), scale });
    feather.get(f.name).multiply(inv);
    world.get(f.name).R.multiply(inv);
  }
  CACHE = { arm: { humerus: A.humerus, forearm: A.forearm, hand: A.hand }, feather, world, spread, raise, torso: torsoSdf };
  return CACHE;
}

// 5) Folding / unfolding. The arm folds out beside the body and the folded wing is laid down onto the flank
//    as a whole: the hand and forearm fold first (remiges and coverts closing over one another like a fan,
//    each slerped from its spread to its folded aim about its own base), the humerus swings the folded wing
//    back while held out from the body (abduct, about the shoulder) and raised off it (the preening raise,
//    re-aimed per step, WING_RAISE), and only once the wing is complete (FOLD_RAISED) is it lowered: first the
//    abduction, then the raise. Unfolding runs the same way back. Along this path the rows never sweep across
//    the body, so no feather needs a turn or a shortening of its own: every covert keeps its full length and
//    stays on the remiges it covers, the arm tube stays covered, and the tertials trail back beside the body
//    (the old solution drew the coverts back to 5 % of their length mid-fold, leaving the arm tube bare, and
//    per-feather turns of up to ±40° scattered the closing wing into loose feathers; tools/dev/penetration.mjs
//    --fine=2 checks landing, take-off and the wing stretch).
const FOLD_ABDUCT = 0.45; // rad: the humerus held out from the flank (about the body's long axis) while the wing folds
export const FOLD_RAISED = 0.8; // fold fraction at which the folded wing is complete, still raised off the flank
const RAISE_MAX = WING_RAISE.steps[WING_RAISE.steps.length - 1];
/**
 * How far each part of the wing is folded at fold fraction `fold`: up to FOLD_RAISED the hand and forearm fold
 * first (with the remiges and coverts), out to the side, then the humerus swings the folded wing back, held out
 * from the flank (abduct, rad about the body's long axis at the shoulder) while the whole wing is raised off it
 * (raise, rad about the dorsal hinge); from FOLD_RAISED on the folded wing is brought in (abduct, by 0.88) and
 * lowered onto the flank (raise).
 */
export function foldPath(fold) {
  if (fold >= FOLD_RAISED) return { arm: 1, hand: 1, abduct: 0, raise: RAISE_MAX * (1 - smooth01(FOLD_RAISED, 1, fold)) };
  const u = fold / FOLD_RAISED;
  const arm = smooth01(0.3, 1, u);
  return { arm, hand: smooth01(0, 0.8, u), abduct: FOLD_ABDUCT * smooth01(0, 0.5, arm) * (1 - smooth01(0.9, 1, u)), raise: RAISE_MAX * smooth01(0.15, 0.85, u) };
}

function raisePose(a) {
  return { q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a), pivot: V(WING_RAISE.hinge) };
}
