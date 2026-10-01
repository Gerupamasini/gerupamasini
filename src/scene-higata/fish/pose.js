// Shared, dependency-free pose model for the goby rig.
// Used by the model builder (to bake the glTF clips) and by the viewer (procedural animation), so
// both always agree. Joint rotations are local quaternions [x, y, z, w]; the rig's rest pose has
// identity rotations, so every rotation is expressed in object axes
// (X = fish's left, Y = dorsal, Z = anterior).

// Morph target order of every fin mesh
export const FIN_TARGETS = {
  Fin_Dorsal1: ['fold', 'flex'],
  Fin_Dorsal2: ['fold', 'flex'],
  Fin_Anal: ['fold', 'flex'],
  Fin_Caudal: ['fold', 'flex'],
  Fin_Pectoral_L: ['fold', 'flex', 'waveS', 'waveC'],
  Fin_Pectoral_R: ['fold', 'flex', 'waveS', 'waveC'],
  Fin_Pelvic: ['fold'],
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

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
const Y = [0, 1, 0];
/** Rotate vector v by unit quaternion q. */
export function qrot(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/**
 * Per-species pose model. `body` is the axial geometry stored in the glTF rig extras
 * (mahazeRig.axes.body: total length, joint positions along the body, resting fin folds); without it the
 * juvenile マハゼ defaults are used. Several species can be animated side by side.
 */
export function createPoseModel(body = null) {
  let TL_MM = 50.5; // snout → caudal fin tip
  // Axial chain (joint name, position along the body in mm from the snout)
  const SPINE = [
    ['J_head', 9.0], ['J_root', 13.0], ['J_sp1', 16.5], ['J_sp2', 20.5], ['J_sp3', 24.5], ['J_sp4', 28.5],
    ['J_sp5', 32.5], ['J_sp6', 36.5], ['J_sp7', 40.0], ['J_caudal', 43.0], ['J_caudal2', 46.5],
  ];
  // resting fin folds (0 = erect, 1 = folded); エドハゼ rests with erect dorsal fins
  const REST_FOLD = { d1: 0.55, d2: 0.3, anal: 0.85, caudal: 0.45 };
  if (body) {
    if (body.tlMM) TL_MM = body.tlMM;
    if (body.restFold) Object.assign(REST_FOLD, body.restFold);
    if (body.spine) body.spine.forEach(([name, sMM]) => { const e = SPINE.find((x) => x[0] === name); if (e) e[1] = sMM; });
  }

  /**
   * Lateral midline displacement (mm, +X = fish's left) of a subcarangiform travelling wave
   * plus a static C-curvature used for turning.
   *   amplitude envelope A(x) = L (0.02 − 0.08 x + 0.16 x²)  → tail tip ±0.10 L, head recoil ±0.02 L
   *   wavelength λ ≈ 0.95 L
   */
  function midline(xmm, phase, gain, turn) {
    const x = xmm / TL_MM;
    const A = TL_MM * (0.02 - 0.08 * x + 0.16 * x * x) * gain;
    const wave = A * Math.sin(2 * Math.PI * (x / 0.95) - phase);
    // turn > 0: C-bend concave toward the fish's left (head and tail both swing left about the pelvic disc)
    const c = turn * TL_MM * 0.6 * (x - 0.26) * (x - 0.26);
    return wave + c;
  }

  /** Local Y-rotation angles for the axial chain that realise the midline (radians). */
  function spineAngles(phase, gain, turn) {
    const slope = (a, b) => (midline(b, phase, gain, turn) - midline(a, phase, gain, turn)) / (b - a);
    const world = {};
    // root segment (root → sp1) and posterior chain
    for (let k = 1; k < SPINE.length; k++) {
      const [name, s] = SPINE[k];
      const next = k + 1 < SPINE.length ? SPINE[k + 1][1] : TL_MM;
      world[name] = -Math.atan(slope(s, next));
    }
    // head segment: snout → head joint
    world.J_head = -Math.atan(slope(1.0, SPINE[0][1]));
    const local = { J_root: world.J_root, J_head: world.J_head - world.J_root };
    for (let k = 2; k < SPINE.length; k++) local[SPINE[k][0]] = world[SPINE[k][0]] - world[SPINE[k - 1][0]];
    return { local, recoil: midline(SPINE[1][1], phase, gain, turn) };
  }

  /**
   * Build a full pose.
   * @param {object} p  see defaultPose()
   * @param {object} axes  rig axes from the glTF extras: name → [x, y, z] (sign folded in)
   */
  function computePose(p, axes) {
    const q = {};
    const t = {};
    const { local } = spineAngles(p.phase, p.gain, p.turn);
    // extra yaw of each axial segment relative to the root segment (turning: the head leads, the body follows)
    if (p.segYaw) {
      local.J_head += p.segYaw.J_head || 0;
      for (let k = 2; k < SPINE.length; k++) local[SPINE[k][0]] += (p.segYaw[SPINE[k][0]] || 0) - (k > 2 ? p.segYaw[SPINE[k - 1][0]] || 0 : 0);
    }
    for (const [name] of SPINE) q[name] = quat(Y, local[name]);
    // alert posture: the front of the trunk is raised (root pitched nose-up by the caller) and the trunk
    // flexes back down behind the pelvic region, so the posterior half lies flat on the sand
    if (p.arch) {
      q.J_sp1 = qmul(q.J_sp1, quat(axes.headUp, -0.45 * p.arch));
      q.J_sp2 = qmul(q.J_sp2, quat(axes.headUp, -0.4 * p.arch));
      q.J_sp3 = qmul(q.J_sp3, quat(axes.headUp, -0.15 * p.arch));
    }
    // dorsoventral bend of the axial chain (diving into / rising out of a burrow): world pitch (nose up > 0)
    // of each segment relative to the root segment, turned into local joint rotations
    if (p.segPitch) {
      const sp = p.segPitch;
      q.J_head = qmul(q.J_head, quat(axes.headUp, sp.J_head || 0));
      for (let k = 2; k < SPINE.length; k++) {
        const name = SPINE[k][0];
        q[name] = qmul(q[name], quat(axes.headUp, (sp[name] || 0) - (k > 2 ? sp[SPINE[k - 1][0]] || 0 : 0)));
      }
    }
    // head pitch (nose up > 0) on top of the lateral bend
    q.J_head = qmul(q.J_head, quat(axes.headUp, p.headPitch));
    // suspensoria swing out (cheeks and gill covers widen); the quadrates carry the rear ends of the two
    // lower-jaw halves outward, so each half both drops (hinge on its quadrate) and rotates about the
    // symphysis in the horizontal plane: the jaw opens wide and round rather than as a narrow slot
    const susp = p.susp || 0;
    q.J_suspL = quat(axes.suspL, susp);
    q.J_suspR = quat(axes.suspR, susp);
    const Rd = quat(axes.jaw, p.jaw);
    const phi = Math.atan(axes.jawSpreadK * Math.sin(susp));
    const S = axes.symphysis;
    for (const side of [1, -1]) {
      const Jp = [side * axes.jawJointL[0], axes.jawJointL[1], axes.jawJointL[2]];
      const d0 = qrot(Rd, [S[0] - Jp[0], S[1] - Jp[1], S[2] - Jp[2]]);
      const Sd = [Jp[0] + d0[0], Jp[1] + d0[1], Jp[2] + d0[2]];
      const Ry = quat(Y, -side * phi);
      const r = qrot(Ry, [Jp[0] - Sd[0], Jp[1] - Sd[1], Jp[2] - Sd[2]]);
      const name = side > 0 ? 'J_jawL' : 'J_jawR';
      q[name] = qmul(Ry, Rd);
      t[name] = [r[0] + Sd[0] - Jp[0], r[1] + Sd[1] - Jp[1], r[2] + Sd[2] - Jp[2]];
    }
    q.J_hyoid = quat(axes.hyoid, p.hyoid);
    q.J_opercL = quat(axes.opercL, p.opercL);
    q.J_opercR = quat(axes.opercR, p.opercR);
    t.J_premax = [0, -0.00015 * p.premax, 0.0006 * p.premax];
    q.J_pecL = qmul(quat(axes.pecL, p.pecAbdL), quat(axes.pecDepL, p.pecDepL));
    q.J_pecR = qmul(quat(axes.pecR, p.pecAbdR), quat(axes.pecDepR, p.pecDepR));
    q.J_pelvic = quat(axes.headUp, p.pelvicPitch);
    // saccade axes: per-eye axes from the rig when given (eye frame), else object Y / X
    q.J_eyeL = qmul(quat(axes.eyeYawL || Y, p.eyeYawL), quat(axes.eyePitchL || [1, 0, 0], p.eyePitchL));
    q.J_eyeR = qmul(quat(axes.eyeYawR || Y, p.eyeYawR), quat(axes.eyePitchR || [1, 0, 0], p.eyePitchR));

    const sc = p.scullPhase;
    const morph = {
      Fin_Dorsal1: [clamp(p.foldD1, 0, 1), clamp(p.flexD, -1, 1)],
      Fin_Dorsal2: [clamp(p.foldD2, 0, 1), clamp(p.flexD, -1, 1)],
      Fin_Anal: [clamp(p.foldAnal, 0, 1), clamp(p.flexD, -1, 1)],
      Fin_Caudal: [clamp(p.foldCaudal, 0, 1), clamp(p.flexCaudal, -1, 1)],
      Fin_Pectoral_L: [clamp(p.foldPecL, 0, 1), clamp(p.flexPecL, -1, 1), p.scullAmpL * Math.sin(sc), p.scullAmpL * Math.cos(sc)],
      Fin_Pectoral_R: [clamp(p.foldPecR, 0, 1), clamp(p.flexPecR, -1, 1), p.scullAmpR * Math.sin(sc + 0.9), p.scullAmpR * Math.cos(sc + 0.9)],
      Fin_Pelvic: [clamp(p.foldPelvic, 0, 1)],
    };
    return { q, t, morph };
  }

  /**
   * Perched at rest (as in lateral photos of resting juveniles): belly just above the sand on the pelvic
   * sucker, pectorals spread down and back with their lower rays on the sand, anal fin folded back along
   * the belly, dorsal fins half down.
   */
  function defaultPose() {
    return {
      phase: 0, gain: 0, turn: 0, headPitch: 0.02, arch: 0,
      jaw: 0, premax: 0, hyoid: 0, susp: 0, opercL: 0, opercR: 0,
      pecAbdL: 0.4, pecAbdR: 0.4, pecDepL: 0.42, pecDepR: 0.42, foldPecL: 0.0, foldPecR: 0.0, flexPecL: 0, flexPecR: 0,
      scullPhase: 0, scullAmpL: 0.04, scullAmpR: 0.04, pelvicPitch: 0,
      foldD1: REST_FOLD.d1, foldD2: REST_FOLD.d2, foldAnal: REST_FOLD.anal, foldCaudal: REST_FOLD.caudal, foldPelvic: 0,
      flexD: 0, flexCaudal: 0,
      eyeYawL: 0, eyePitchL: 0, eyeYawR: 0, eyePitchR: 0,
    };
  }


  return { TL_MM, SPINE, REST_FOLD, midline, spineAngles, computePose, defaultPose };
}

/** Buccal/opercular ventilation (~70 beats/min): mouth barely parts, hyoid then gill covers follow. */
export function breathe(p, time, depth = 1) {
  const w = 2 * Math.PI * 1.15;
  const b = (lag) => 0.5 - 0.5 * Math.cos(w * (time - lag));
  p.jaw += 0.005 * depth * b(0);  // lips stay sealed; water enters as the buccal floor drops
  p.premax += 0.05 * depth * b(0);
  p.hyoid += 0.06 * depth * b(0.08);
  p.susp += 0.012 * depth * b(0.1);
  p.opercL += 0.05 * depth * b(0.2);
  p.opercR += 0.05 * depth * b(0.2);
  return p;
}

/** Yawn envelope (Rasa 1971; slow opening, hold, fast snap shut, then an opercular flush). t in s. */
export function yawnCurves(t) {
  const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  let open;
  if (t < 0) open = 0;
  else if (t < 0.75) open = ease(t / 0.75);
  else if (t < 1.25) open = 1 + 0.05 * Math.sin((Math.PI * (t - 0.75)) / 0.5);
  else if (t < 1.4) open = 1 - ease((t - 1.25) / 0.15);
  else open = 0;
  const lag = (d) => {
    const u = t - d;
    if (u < 0) return 0;
    if (u < 0.75) return ease(u / 0.75);
    if (u < 1.25) return 1;
    if (u < 1.45) return 1 - ease((u - 1.25) / 0.2);
    return 0;
  };
  const flush = Math.exp(-(((t - 1.75) / 0.12) ** 2));
  // anterior → posterior expansion: jaw, then hyoid and suspensoria (head widens), then gill covers;
  // compression runs the same way (the cheeks close just after the jaws, then water leaves the gills)
  return { open, hyoid: lag(0.12), susp: lag(0.1), operc: Math.max(lag(0.25), 0.6 * flush), fins: lag(0.05), done: t > 2.3 };
}
