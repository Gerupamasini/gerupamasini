import * as THREE from 'three';
import { WING } from './featherLayout.js';
import { projectToSurface } from './sdf.js';
import { featherOffset, wingFrame } from './feathers.js';
import { COVERT_ARM } from './skeleton.js';
import { frameQuat } from '../../../core/math.js';

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
//    stays buried or, once it has emerged from the plumage, stays CLEAR mm above the body outline
//    (tools/dev/penetration.mjs measures the result in every pose).

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const Y = new THREE.Vector3(0, 1, 0);

export const FOLD_TARGET = {
  humerus: { x: [0.19, -0.02, -0.98], y: [0.8, 0.5, 0.2] },
  forearm: { x: [-0.07, -0.26, 0.963], y: [0.8, 0.6, 0] },
  hand: { x: [0.02, -0.02, -1], y: [0.55, 0.83, 0] },
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

const CLEAR = 0.35; // mm: minimal height of exposed feather surface over the body outline
const SAG = 0.1; // mm: tolerated sag of an exposed line toward the outline (no visible dip)

/** Sample lines (bind-space offsets from the feather base) along the shaft at 5 positions across the vane. */
function shapeLines(f) {
  const fr = wingFrame(f);
  return [-1, -0.5, 0, 0.5, 1].map((a) =>
    Array.from({ length: 13 }, (_, i) => {
      const o = featherOffset(f, i / 12, a);
      return new THREE.Vector3(...[0, 1, 2].map((k) => fr.dir[k] * o[0] + fr.side[k] * o[1] + fr.normal[k] * o[2]));
    })
  );
}

/**
 * How far (mm) the feather violates the clearance rule for world rotation R about `base`:
 * along every sample line, once the surface has emerged it must not sink below min(height so far, CLEAR)
 * (less a small SAG); a line whose highest point lies within ±CLEAR of the outline grazes it (flickers)
 * and counts too.
 */
function violation(lines, base, R, sdf) {
  let v = 0;
  const p = new THREE.Vector3();
  for (const line of lines) {
    let top = -Infinity;
    for (const o of line) {
      p.copy(o).applyQuaternion(R).add(base);
      const d = sdf(p.x, p.y, p.z);
      if (top > 0) v = Math.max(v, Math.min(top, CLEAR) - SAG - d);
      top = Math.max(top, d);
    }
    if (Math.abs(top) < CLEAR) v = Math.max(v, CLEAR - Math.abs(top));
  }
  return v;
}

/** Smallest pitch about the base (tip away from / into the body) that satisfies the clearance rule. */
function clearBody(lines, base, Rw, dirW, n, sdf) {
  if (violation(lines, base, Rw, sdf) <= 0) return Rw;
  const axis = dirW.clone().cross(n).normalize(); // +angle lifts the tip off the body
  const q = new THREE.Quaternion();
  let best = Rw;
  let bestV = Infinity;
  for (let k = 1; k <= 120; k++) {
    for (const s of [1, -1]) {
      const deg = s * k * 0.25;
      if (deg < -15) continue;
      const R = q.setFromAxisAngle(axis, (deg * Math.PI) / 180).clone().multiply(Rw);
      const v = violation(lines, base, R, sdf);
      if (v <= 0) return R;
      if (v < bestV) [best, bestV] = [R, v];
    }
  }
  return best;
}

let CACHE = null;

/**
 * @param {object[]} wingFeathers  layout records (featherLayout.buildWingLayout)
 * @param {Function} sdf  body SDF (mm)
 * @returns {{arm:{humerus,forearm,hand}, feather: Map<string, THREE.Quaternion>, world: Map<string, {base, R}>}}
 *   local quaternions (+ each feather bone's folded world placement)
 */
export function computeWingFold(wingFeathers, sdf) {
  if (CACHE) return CACHE;
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
      const x = 4.8 + (10 - f.index) * 0.9;
      const y = 58.6 + (10 - f.index) * 0.35;
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
      const lcHint = { humerus: [0.0, 0.1, -1], forearm: [0.03, -0.3, -1], hand: [-0.25, 0.25, -1] };
      if (f.type === 'alula') lcHint.alula = [-0.25, 0.2, -1];
      const dirHint = f.type === 'alula' ? V(lcHint.alula) : f.type === 'tertial' ? V([0.0, 0.05, -1]) : f.type === 'lesserCovert' ? V(lcHint[f.bone]) : V([0.0, 0.1, -1]);
      dirHint.normalize();
      const guess = base.clone().addScaledVector(dirHint, L);
      const [pp, nn] = projectToSurface(sdf, guess.x, guess.y, guess.z);
      const lift = f.type === 'alula' ? -0.6 : f.type === 'lesserCovert' && f.bone === 'hand' ? 1.2 : f.type === 'lesserCovert' ? 2.6 : f.type === 'tertial' ? 3.4 : 2.2 + (order[f.name] ?? 0) * 0.05;
      const surfTip = V(pp).addScaledVector(V(nn), lift);
      // If the body has ended (behind the rump), keep the straight hint instead
      tip = guess.z < -48 ? guess : surfTip;
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
    Rw = clearBody(shapeLines(f), base, Rw, dirW, n, sdf);
    if (f.type === 'primary' || f.type === 'secondary') remex.set(f.bone, { bindBase: V(f.base), base, Rw });
    const local = P.q.clone().invert().multiply(Rw);
    feather.set(f.name, local);
    world.set(f.name, { base, R: Rw });
  }
  CACHE = { arm: { humerus: A.humerus, forearm: A.forearm, hand: A.hand }, feather, world };
  return CACHE;
}
