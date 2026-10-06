// Shared, dependency-free pose model for the トビハゼ rig.
// Used by the model builder (to bake the glTF clips) and by the runtime driver (procedural animation), so both agree.
// Joint rotations are local quaternions [x, y, z, w]; the rig's rest pose has identity rotations, so every rotation is
// expressed in object axes (X = fish's left, Y = dorsal, Z = anterior).

export const TL_MM = 80;

/** Axial chain (joint, position along the body in mm from the snout). J_root sits at the pectoral girdle. */
export const SPINE = [
  ['J_head', 11.0], ['J_root', 17.0], ['J_sp1', 22.0], ['J_sp2', 27.0], ['J_sp3', 32.0], ['J_sp4', 37.0], ['J_sp5', 42.0],
  ['J_sp6', 47.0], ['J_sp7', 52.0], ['J_sp8', 57.0], ['J_caudal', 62.0], ['J_caudal2', 70.0],
];
/** joints behind the root, in order (each bends the part of the body behind it) */
export const POSTERIOR = SPINE.slice(2).map(([n]) => n);

/** morph targets of every mesh, in glTF order */
export const MORPHS = {
  Head: ['breathe', 'blinkL', 'blinkR'],
  Body: ['breathe'],
  DorsalFin: ['foldD1', 'foldD2'],
  AnalFin: ['fold'],
  Tail: ['fold'],
  PectoralFin_L: ['fold'],
  PectoralFin_R: ['fold'],
  PelvicFin: ['fold'],
};

export function quat(axis, ang) {
  const h = ang / 2, s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}
export function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qrot(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export const qX = (a) => quat([1, 0, 0], a);
export const qY = (a) => quat([0, 1, 0], a);
export const qZ = (a) => quat([0, 0, 1], a);
export const QI = [0, 0, 0, 1];

/** A neutral pose: resting on land, fins half open. */
export function defaultPose() {
  const bend = {}, lift = {};
  for (const [n] of SPINE) { bend[n] = 0; lift[n] = 0; }
  return {
    // lateral bend per joint (rad): + swings the body behind (or the head in front of) the joint toward the fish's left
    bend,
    // vertical bend per joint (rad): + raises the body behind the joint (or the head in front of J_head)
    lift,
    roll: 0,
    jaw: 0,
    eyeL: { yaw: 0, pitch: 0, retract: 0 },
    eyeR: { yaw: 0, pitch: 0, retract: 0 },
    // pectoral fins: forward/back swing, depression below the horizontal, twist about the arm, wrist bend.
    // When `q` / `wq` are set (IK), they are used as the local rotations directly.
    pecL: { protract: 0.35, depress: 0.75, twist: 0, wrist: 0.3, q: null, wq: null },
    pecR: { protract: 0.35, depress: 0.75, twist: 0, wrist: 0.3, q: null, wq: null },
    pelvic: 0,
    morph: { breathe: 0, blinkL: 0, blinkR: 0, foldD1: 0.85, foldD2: 0.6, foldAnal: 0.6, foldCaudal: 0.3, foldPecL: 0, foldPecR: 0, foldPelvic: 0 },
  };
}

/** the swing part of rotation q relative to the unit axis a (q = swing · twist, the twist about a) */
export function swingOf(q, a) {
  const d = q[0] * a[0] + q[1] * a[1] + q[2] * a[2];
  let t = [a[0] * d, a[1] * d, a[2] * d, q[3]];
  const l = Math.hypot(t[0], t[1], t[2], t[3]);
  if (l < 1e-9) return q;
  t = t.map((x) => x / l);
  return qmul(q, [-t[0], -t[1], -t[2], t[3]]);
}

/**
 * Local joint rotations / translations and morph weights for a pose.
 * @param {object} p  see defaultPose()
 * @param {object} rig  { eyeRetract_m, pecBindFix, pec: { dir } } from the glTF extras
 */
export function computePose(p, rig = {}) {
  const q = {}, t = {};
  // head (anterior of J_head): yaw toward the left is +Y, pitch up is −X
  q.J_head = qmul(qY(p.bend.J_head), qX(-p.lift.J_head));
  q.J_root = qmul(qZ(p.roll), qmul(qY(-p.bend.J_root), qX(p.lift.J_root)));
  for (const n of SPINE.slice(2).map(([k]) => k)) q[n] = qmul(qY(-p.bend[n]), qX(p.lift[n]));
  // the jaw drops at most ~34° (pose value 1 = wide open)
  q.J_jaw = qX(p.jaw * 0.62);
  for (const [side, key, jn] of [[1, 'eyeL', 'J_eyeL'], [-1, 'eyeR', 'J_eyeR']]) {
    const e = p[key];
    q[jn] = qmul(qY(e.yaw), qX(-e.pitch));
    const d = rig.eyeRetract_m ?? 0.0025;
    // (down its stalk and a little toward the midline, so it stays inside the closing cup all the way down)
    t[jn] = [-side * 0.32 * d * e.retract, -d * e.retract, -0.12 * d * e.retract];
  }
  // (the angles are about the swept-back frame the arm used to be bound in: rig.pecBindFix turns its bind frame onto
  // it. Of that turn only the swing is kept - the arm points where it did - not the twist about the arm's own axis
  // the old frame carried, which would wring the arm's root)
  const fix = rig.pecBindFix ?? null, bindDir = rig.pec?.dir ?? null;
  for (const [side, key, jn, wn] of [[1, 'pecL', 'J_pecL', 'J_pecArmL'], [-1, 'pecR', 'J_pecR', 'J_pecArmR']]) {
    const f = p[key];
    let qf = qmul(qY(-side * f.protract), qmul(qZ(-side * f.depress), qX(f.twist)));
    let qw = qZ(-side * f.wrist);
    if (fix) {
      const fs = side > 0 ? fix : [fix[0], -fix[1], -fix[2], fix[3]];
      qf = qmul(qf, fs);
      qw = qmul(qmul([-fs[0], -fs[1], -fs[2], fs[3]], qw), fs); // the wrist's bend about the same axis as before
      if (bindDir) qf = swingOf(qf, side > 0 ? bindDir : [-bindDir[0], bindDir[1], bindDir[2]]);
    }
    q[jn] = f.q ?? qf;
    q[wn] = f.wq ?? qw;
  }
  q.J_pelvic = qX(-p.pelvic);
  const m = p.morph;
  const morph = {
    Head: [m.breathe, m.blinkL, m.blinkR],
    Body: [m.breathe],
    DorsalFin: [m.foldD1, m.foldD2],
    AnalFin: [m.foldAnal],
    Tail: [m.foldCaudal],
    PectoralFin_L: [m.foldPecL],
    PectoralFin_R: [m.foldPecR],
    PelvicFin: [m.foldPelvic],
  };
  return { q, t, morph };
}

/**
 * Travelling body wave for swimming: lateral midline displacement (mm) at x mm from the snout.
 * Mudskippers swim by axial undulation (Harris 1960); the elongate body carries a long wave (λ ≈ 0.8 L) whose
 * amplitude grows toward the tail (head recoil small).
 */
export function swimMidline(xmm, phase, amp, tl = TL_MM) {
  const x = xmm / tl;
  const A = tl * (0.015 - 0.04 * x + 0.13 * x * x) * amp;
  return A * Math.sin(2 * Math.PI * (x / 0.8) - phase);
}

/** Lateral bend angles for the chain from a midline function f(xmm) (mm, +X left). */
export function bendFromMidline(f, tl = TL_MM) {
  const slope = (a, b) => (f(b) - f(a)) / (b - a);
  const world = {};
  for (let k = 1; k < SPINE.length; k++) {
    const [name, s] = SPINE[k];
    const next = k + 1 < SPINE.length ? SPINE[k + 1][1] : tl;
    // the segment behind the joint points to −Z; its lateral offset grows by slope per mm going back
    world[name] = Math.atan(slope(s, next));
  }
  const head = Math.atan(slope(1.0, SPINE[0][1]));
  const local = { J_head: -head + world.J_root, J_root: world.J_root };
  for (let k = 2; k < SPINE.length; k++) local[SPINE[k][0]] = world[SPINE[k][0]] - world[SPINE[k - 1][0]];
  return local;
}
