// トビハゼ (Periophthalmus modestus): its pose model. What the behaviour says the fish is doing this frame (a TobiFrame,
// behavior.ts) and one tier's GLB root extras (extras.tobihaze) give the joints' local rotations and translations, the
// Eye nodes' gaze and the blend-shape weights. Plain JS without three, so the driver (TobihazeDriver) and the build's
// clip bake (tools/models/tobihaze/clips.mjs) read the same numbers: the 図鑑's clips and the game always agree.
//
// Everything comes from the tier's extras (tools/models/tobihaze/rig.mjs AXES and the build's states; the object frame:
// metres, +X the fish's left, +Y dorsal, +Z anterior; angles in degrees):
//   axes.joints      per joint its channels (axis, range) and their order — a joint turns by R = R(order[0]) ·
//                    R(order[1]) · … about its bind axes (every bind rotation is the identity, so they are the object's) —,
//                    its pivot, the eyes' translate (lift, drop), the premaxilla's slide, the shoulder's coupled limits
//   states           the reference poses: land (propped at 15°), reach, rest (prone), water (the bottom rest under water)
//                    and swim, as joint channels and t ([ds, dy, dz] in head lengths along the fish frame: s back from the
//                    snout, y up, z to the fish's left), with { morph: { Fin_X: { target: w } } } (lod2: { Body: { alert } })
//   prop.frames      the welded prop by raise (10–25°): its feet stay where the land state planted them, the channels
//                    interpolated between the two keys that bracket the raise (lod2: { ...common, ...frame })
//   crawl.frames     the crawl cycle by phase (the stance 0 … duty, the recovery to 1), interpolated linearly as the build
//                    gated it; its J_root t carries the body a stride forward through the stance (the behaviour takes the
//                    stride over at the cycle's end); lod2 has the arms as quaternions, slerped
//   transitions      between two states e(u) = u²(3 − 2u) on every channel and weight, plus sin(πu)·lift on the arms
//                    (J_pec depression, J_pecFin flexion): a planted fin is lifted off the mud and set down, never swept
//   axes.head.poses  the head's mechanism (gapeHalf, gapeFull, gulp, inflated, inflatedHalf, vent), held to the tier
//                    (lod1's jaw stops at 30°)
//   axes.eyes        the gaze: the Eye nodes turned about the globes' centres, pitch then yaw
//   morphs           the blend shapes each mesh carries and the correctives' drivers (gape and gum by the jaw's angle,
//                    blinkL/R by the eye's drop, eyesUpL/R by its lift)
// lod2 keeps 12 joints (the arms J_pecL/R alone: their blade cards carry the states) and no head: its eyes are in the
// Body, their alert lift a blend shape ('alert').
//
// What this module adds to the extras, each within the joints' ranges and the spine's curl budget (axes.spine.curlBudget:
// Σ|yaw| over the bending joints ≤ 220°):
//   swim     a carangiform travelling wave over the rear two thirds (the lateral amplitude 0.02 → 0.10 TL from the head's
//            recoil to the tail, wavelength 0.95 TL; Wicaksono 2022, behaviour §3.3), a C-bend for the turn, the caudal
//            fin trailing the beat (flex), the spread paddles sculling at the junction
//   hop      the J-curl of the land jump (axes.spine.curlBudget.jcurl: sharpest at ⅔ of the length, Swanson & Gibb 2004)
//            and the display jump's arch (dorsal convex, behaviour §3.2)
//   crawl    the body bowed into the recovery's turn about the pelvic cup (the tail lagging the turn, sin(πu))
//   head     the gape (gapeHalf at 0.457 = 32/70, gapeFull at 1), the buccal pump (gulp), the cheeks (inflatedHalf at
//            0.5, inflated at 1), the gill vents, summed on the head's joints
//   eyes     each J_eye translated only (its lift, the blink's drop: 0.1 HL), the Eye node turned for the gaze (eased to
//            within 20° of the rest as the eye drops: blinkGaze), the correctives driven by the joints
//   fins     the first dorsal, the second dorsal and anal, the caudal from the frame (0 folded … 1 erect / spread); the
//            anal fin stays as the pose has it while the belly lies on the ground (it would go through the mud)
// No joint that carries a welded contact (J_root, J_head and what hangs from it: the arms, the pelvic cup) is moved
// by anything but the reference poses, the prop and crawl keys and their blends: those are where the behaviour welds.

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** e(u) = u²(3 − 2u) on [0, 1] (the transitions' ease) */
const smooth = (u) => { const t = clamp(u, 0, 1); return t * t * (3 - 2 * t); };

/** The frame's state → the pose it stands for when the frame names none (a frame of the contract's first draft). */
const POSE_OF_STATE = {
  IDLE: 'prop', LAND_REST: 'rest', LAND_CRAWL: 'crawl', LAND_HOP: 'prop', FORAGE: 'prop', BURROW: 'rest', ESCAPE: 'prop',
  SWIM: 'swim', SHALLOW_WATER: 'water', WATER_ENTRY: 'swim', WATER_EXIT: 'prop',
};
/** a pose the tier lacks → the nearest it has */
const FALLBACK = { prop: 'land', crawl: 'land', land: 'reach', reach: 'land', rest: 'land', water: 'rest', swim: 'water' };
/** the frame's pose names → the extras' transitions' (the prop and the crawl are the land state's) */
const TRANSITION_NAME = { prop: 'land', crawl: 'land', land: 'land', reach: 'reach', rest: 'rest', water: 'water', swim: 'swim' };

/** The fins' blend shapes the module drives whatever the poses carry (fins.mjs targets; lod2's cards alike). */
const FIN_TARGETS = {
  Fin_Dorsal1: ['fold', 'spread'], Fin_Dorsal2: ['fold', 'spread'], Fin_Anal: ['fold', 'spread'], Fin_Caudal: ['fold', 'spread', 'flex'],
  Fin_Pectoral_L: ['fold', 'spread', 'furl', 'plant', 'plantMid'], Fin_Pectoral_R: ['fold', 'spread', 'furl', 'plant', 'plantMid'],
  Fin_Pelvic: ['fold', 'spread', 'press', 'pressLow', 'pressHigh', 'pressDeep'],
};
/** The head's blend shapes (headmorphs.mjs), weighted here from the frame's head and the eyes' joints. */
const HEAD_TARGETS = ['blinkL', 'blinkR', 'eyesUpL', 'eyesUpR', 'inflate', 'inflateMid', 'throat', 'gape', 'gum'];
/** The joint-driven correctives (each mesh's extras `drive`; these where the tier's extras do not say): weight =
 *  clamp(value / per, 0, 1); the eyes' lift and drop in head lengths along J_eye's translate. */
const DRIVES = {
  gape: { joint: 'J_jaw', channel: 'angle', per: 70 },
  gum: { joint: 'J_jaw', channel: 'angle', per: 40 },
  blinkL: { joint: 'J_eyeL', channel: 'drop', per: 0.1 },
  blinkR: { joint: 'J_eyeR', channel: 'drop', per: 0.1 },
  eyesUpL: { joint: 'J_eyeL', channel: 'lift', per: 0.08 },
  eyesUpR: { joint: 'J_eyeR', channel: 'lift', per: 0.08 },
};
/** gapeHalf's place on the gape (its jaw 32° of gapeFull's 70°: headrig HEAD_POSES) */
export const GAPE_HALF = 32 / 70;

/**
 * How the keyframed poses are read between their keys (keyedInto): cubic (Catmull–Rom, the arms' channels) or linear.
 * Measured on the round-T2 tiers (tests/unit/tobihazePose.test.ts): the crawl's crutch tips between two keys wander
 * 0.088 mm linear, 0.062 cubic (before the weld hold); the prop's soles over 10–25° 0.007 mm linear, 0.031 cubic.
 */
export const CUBIC = { crawl: true, prop: false };

/** The display jump's arch over the bending joints (deg of pitch at arch 1; − the segment behind down: the back convex). */
const ARCH = [-4, -6, -7, -7, -6, -5, -4, -3];
/** The swimming turn's C-bend over J_sp2 … J_caudal (shares of the bend; + the tail to the fish's left: a left turn). */
const TURN_SHARE = { J_sp2: 0.1, J_sp3: 0.15, J_sp4: 0.2, J_sp5: 0.2, J_sp6: 0.2, J_caudal: 0.15 };
/** The crawl recovery's bow (shares of the turn the tail lags by at the recovery's middle, over the rear joints). */
const LAG_SHARE = { J_sp3: 0.06, J_sp4: 0.09, J_sp5: 0.1, J_sp6: 0.1, J_sp7: 0.08, J_caudal: 0.07 };

/**
 * The swimming wave's numbers (behaviour §3.3: carangiform, the rear two thirds undulating; the tail tip ±0.10 TL, the
 * head's recoil ≈ 0.01 TL; the wavelength about the body's length): A(x) = TL (a0 + a1 x + a2 x²) at x = s / TL.
 */
export const SWIM_WAVE = { a0: 0.02, a1: -0.08, a2: 0.16, wavelength: 0.95, turnBend: 0.12, maxTurnBend: 0.5, caudalFlex: 0.6, paddleDeg: 6 };

// ------------------------------------------------------------------------------------------------ small maths

function qmul(a, ai, b, bi, o, oi) {
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3], bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  o[oi] = aw * bx + ax * bw + ay * bz - az * by;
  o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
  o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw;
  o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
}
const _qa = new Float64Array(4);
/** o[oi..] = o[oi..] · R(axis, deg) */
function qturn(o, oi, ax, deg) {
  if (!deg) return;
  const h = (deg * DEG) / 2, s = Math.sin(h);
  _qa[0] = ax[0] * s; _qa[1] = ax[1] * s; _qa[2] = ax[2] * s; _qa[3] = Math.cos(h);
  qmul(o, oi, _qa, 0, o, oi);
}
function qnorm(o, oi) {
  const l = Math.hypot(o[oi], o[oi + 1], o[oi + 2], o[oi + 3]) || 1;
  o[oi] /= l; o[oi + 1] /= l; o[oi + 2] /= l; o[oi + 3] /= l;
}
function qslerp(a, ai, b, bi, t, o, oi) {
  let bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  let d = a[ai] * bx + a[ai + 1] * by + a[ai + 2] * bz + a[ai + 3] * bw;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let k0 = 1 - t, k1 = t;
  if (d < 0.9995) { const th = Math.acos(d), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
  o[oi] = k0 * a[ai] + k1 * bx; o[oi + 1] = k0 * a[ai + 1] + k1 * by; o[oi + 2] = k0 * a[ai + 2] + k1 * bz; o[oi + 3] = k0 * a[ai + 3] + k1 * bw;
  qnorm(o, oi);
}
/** v rotated by the unit quaternion q (at qi), into o (at oi) */
function qrot(q, qi, x, y, z, o, oi) {
  const qx = q[qi], qy = q[qi + 1], qz = q[qi + 2], qw = q[qi + 3];
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  o[oi] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  o[oi + 1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  o[oi + 2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
}

// ------------------------------------------------------------------------------------------------ the rig (compiled)

const RIGS = new WeakMap();

/**
 * The tier's rig tables from its root extras (LoadedModel.extras, { tobihaze: { … } }, or the tobihaze object itself),
 * compiled once per extras object: the joints parents first with their channel slots, the poses as channel vectors.
 */
export function poseRig(extras) {
  const X = extras && (extras.tobihaze ?? (extras.axes ? extras : null));
  if (!X || !X.axes || !X.axes.joints) throw new Error('tobihaze pose: no rig in the extras (extras.tobihaze.axes)');
  let rig = RIGS.get(X);
  if (!rig) { rig = compile(X); RIGS.set(X, rig); }
  return rig;
}

function compile(X) {
  const A = X.axes, AJ = A.joints;
  const tier = String(X.tier ?? A.tier ?? 'hero');
  const hlMM = Number(X.hlMM ?? A.hlMM ?? 16.1345), tlMM = Number(X.tlMM ?? A.tlMM ?? 80);
  const hl = hlMM / 1000;
  // the joints, parents first, each with its channels' slots, then 3 slots of t (HL, the fish frame) and the slide's
  const joints = [], index = {};
  let n = 0;
  const visit = (name) => {
    if (name in index) return;
    const a = AJ[name];
    if (a.parent && AJ[a.parent]) visit(a.parent);
    const order = (a.order ?? Object.keys(a.channels ?? {})).filter((c) => a.channels?.[c]?.axis);
    const axes = order.map((c) => { const v = a.channels[c].axis, l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; });
    const ranges = order.map((c) => { const r = a.channels[c].range; return r ? [r[0], r[1]] : [-180, 180]; });
    const j = {
      name, i: joints.length, parent: a.parent && AJ[a.parent] ? index[a.parent] : -1,
      pivot: [a.pivotM?.[0] ?? 0, a.pivotM?.[1] ?? 0, a.pivotM?.[2] ?? 0],
      order, axes, ranges, c0: n, t0: n + order.length, slide: a.slide ?? null, translate: a.translate ?? null, coupled: a.coupled ?? null,
      cornerSum: a.cornerSum ?? null,
    };
    n += order.length + 3;
    if (j.slide) { j.s0 = n; n += 1; }
    index[name] = j.i;
    joints.push(j);
  };
  for (const name of Object.keys(AJ)) visit(name);
  const slot = (name, ch) => { const j = joints[index[name]]; if (!j) return -1; const k = j.order.indexOf(ch); return k < 0 ? -1 : j.c0 + k; };

  // the blend shapes: the poses' (fin and mesh groups), the module's fins', the head's
  const keys = [], keyIndex = {}, targets = [], targetIndex = {};
  const target = (name) => { if (!(name in targetIndex)) { targetIndex[name] = targets.length; targets.push(name); } return targetIndex[name]; };
  const key = (group, t) => {
    const k = `${group}|${t}`;
    if (!(k in keyIndex)) { keyIndex[k] = keys.length; keys.push({ group, t, target: target(/^Fin_/.test(group) ? `${t}_${group}` : t) }); }
    return keyIndex[k];
  };
  for (const [f, ts] of Object.entries(FIN_TARGETS)) for (const t of ts) key(f, t);
  const morphSources = [];
  for (const S of Object.values(X.states ?? {})) if (S?.pose?.morph) morphSources.push(S.pose.morph);
  for (const F of [X.prop, X.crawl]) {
    if (F?.common?.morph) morphSources.push(F.common.morph);
    for (const f of F?.frames ?? []) if (f.pose?.morph) morphSources.push(f.pose.morph);
  }
  for (const m of morphSources) for (const [g, ws] of Object.entries(m)) for (const t of Object.keys(ws ?? {})) key(g, t);
  const head = {};
  for (const t of HEAD_TARGETS) head[t] = target(t);
  const alert = keyIndex['Body|alert'] ?? -1;

  const rig = {
    tier, hl, hlMM, tlMM, joints, index, nSlots: n, slot, keys, keyIndex, targets, targetIndex, head, alertKey: alert,
    hasHead: 'J_jaw' in index, hasEyes: 'J_eyeL' in index && !!A.eyes,
  };
  const vec = () => newVec(rig);
  rig.vec = vec;
  // the poses
  const read = (pose, common) => poseVec(rig, pose, common);
  rig.states = {};
  for (const [k, S] of Object.entries(X.states ?? {})) if (S?.pose) rig.states[k] = read(S.pose);
  rig.groundM = {};
  for (const [k, S] of Object.entries(X.states ?? {})) if (Number.isFinite(S?.groundM)) rig.groundM[k] = S.groundM;
  const keyed = (F, at) => (F?.frames?.length ? { at: F.frames.map(at), vecs: F.frames.map((f) => read(f.pose, F.common)) } : null);
  rig.prop = keyed(X.prop, (f) => f.raise);
  rig.crawl = keyed(X.crawl, (f) => f.phase);
  if (rig.crawl) {
    const C = X.crawl;
    Object.assign(rig.crawl, {
      duty: C.duty ?? 0.6, cycleS: C.cycleS ?? 0.5, strideMM: C.strideMM ?? 15,
      lift: C.schedule?.lift?.[1] ?? 0.08, setDown: C.schedule?.setDown?.[0] ?? 0.52,
      // where the crutches bear in the stance (the model frame at the cycle's start): from this phase on, until the next
      segs: weldSegments(C, hlMM, tlMM),
      groundM: Number.isFinite(C.groundMM) ? (C.groundMM - 0.3 * hlMM) / 1000 : null,
    });
  }
  // the transitions' lifts
  rig.lift = {};
  for (const [k, T] of Object.entries(X.transitions ?? {})) if (T?.lift) rig.lift[k] = T.lift;
  // the head's mechanism poses, as deltas from the bind on the tier's joints
  rig.headPoses = {};
  for (const [k, P] of Object.entries(A.head?.poses ?? {})) {
    const v = read(Object.fromEntries(Object.entries(P).filter(([j]) => j !== 'gaze')));
    rig.headPoses[k] = { v, gaze: P.gaze ?? null, morph: P.morph ?? {} };
  }
  // the eyes: their joints' translate and the Eye nodes' gaze
  rig.eyes = null;
  if (rig.hasEyes) {
    const side = (S) => {
      const E = A.eyes[S], T = AJ[`J_eye${S}`].translate ?? {};
      const g = E.gaze, ax = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      return {
        j: index[`J_eye${S}`], ty: joints[index[`J_eye${S}`]].t0 + 1,
        liftM: T.liftM ?? E.liftM ?? 0.08 * hl, dropM: T.dropM ?? E.dropM ?? 0.1 * hl, liftBareM: T.liftBareM ?? 0.03 * hl, alertM: T.alertM ?? E.alertLiftM ?? 0.03 * hl,
        yawAxis: ax(g.yaw.axis), pitchAxis: ax(g.pitch.axis), yawRange: g.yaw.range, pitchRange: g.pitch.range,
        rest: { yaw: g.default?.yaw ?? 0, pitch: g.default?.pitch ?? 0 }, blinkMax: E.blinkGaze?.maxDeg ?? 20,
      };
    };
    rig.eyes = { L: side('L'), R: side('R') };
  }
  // without eyesUp correctives the lift stays within the bare lift (rig stateForTier)
  const meshNames = meshTargets(X);
  rig.meshTargets = meshNames;
  const hasTarget = (t) => Object.values(meshNames).some((ts) => ts.includes(t));
  rig.eyesUp = hasTarget('eyesUpL');
  // the joint-driven correctives this tier has
  rig.drives = [];
  for (const [t, d] of Object.entries({ ...DRIVES, ...driveTable(X) })) {
    if (!(t in targetIndex) || !(d.joint in index)) continue;
    const j = joints[index[d.joint]];
    const s = d.channel === 'lift' || d.channel === 'drop' ? j.t0 + 1 : slot(d.joint, d.channel);
    if (s < 0) continue;
    rig.drives.push({ target: targetIndex[t], slot: s, per: d.per, sign: d.channel === 'drop' ? -1 : 1, hl: d.channel === 'lift' || d.channel === 'drop' });
  }
  // the spine: the stations (mm from the snout) of the joints the tier keeps, the curl budget
  const SP = A.spine ?? {};
  rig.spine = (SP.joints ?? []).filter(([nm]) => nm in index).map(([nm, s]) => ({ name: nm, j: index[nm], s }));
  const CB = SP.curlBudget ?? {};
  rig.curl = {
    joints: (CB.joints ?? ['J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal']).map((nm) => slot(nm, 'yaw')),
    pitch: (CB.joints ?? []).map((nm) => slot(nm, 'pitch')),
    yawAbsSum: CB.yawAbsSum ?? 220, jcurl: CB.jcurl ?? [8, 18, 30, 36, 40, 36, 25, 15],
  };
  // the arms' channels a transition lifts, per side
  rig.armSlots = joints.filter((j) => /^J_pec(Fin|Mid|Tip)?[LR]$/.test(j.name)).flatMap((j) => j.order.map((_, k) => j.c0 + k));
  rig.pelvic = index.J_pelvic !== undefined ? joints[index.J_pelvic] : null;
  rig.footprint = X.footprint ?? null;
  rig.contacts = X.contacts ?? {};
  return rig;
}

/** A blank pose vector: channel slots, the joints given as quaternions (lod2's arms) and the blend-shape keys. */
function newVec(rig) {
  return { v: new Float64Array(rig.nSlots), qm: new Uint8Array(rig.joints.length), q: new Float64Array(rig.joints.length * 4), w: new Float64Array(rig.keys.length) };
}
function copyVec(a, o) { o.v.set(a.v); o.qm.set(a.qm); o.q.set(a.q); o.w.set(a.w); return o; }

/** A pose object of the extras ({ J_x: { channel: deg, t, slide } | [x, y, z, w], morph }) as a vector; `common` under it. */
function poseVec(rig, pose, common = null) {
  const out = newVec(rig);
  const put = (P) => {
    for (const [name, e] of Object.entries(P ?? {})) {
      if (name === 'morph') continue;
      const ji = rig.index[name];
      if (ji === undefined || !e) continue;
      const j = rig.joints[ji];
      if (Array.isArray(e)) { if (e.length === 4) { out.qm[ji] = 1; out.q.set(e, ji * 4); qnorm(out.q, ji * 4); } continue; }
      j.order.forEach((c, k) => { if (typeof e[c] === 'number') out.v[j.c0 + k] = e[c]; });
      if (e.t) for (let k = 0; k < 3; k++) out.v[j.t0 + k] = e.t[k] ?? 0;
      if (j.slide && typeof e.slide === 'number') out.v[j.s0] = e.slide;
    }
  };
  put(common); put(pose);
  // (the weights: per group, the frame's over the common's — lod2's frames factor out what they share)
  const morph = {};
  for (const m of [common?.morph, pose?.morph]) for (const [g, ws] of Object.entries(m ?? {})) morph[g] = { ...(morph[g] ?? {}), ...ws };
  for (const [g, ws] of Object.entries(morph)) for (const [t, w] of Object.entries(ws)) { const k = rig.keyIndex[`${g}|${t}`]; if (k !== undefined && typeof w === 'number') out.w[k] = w; }
  return out;
}

/** The crawl's stance welds (extras crawl.frames[].contacts.weld, fish mm) as segments in the model frame (m). */
function weldSegments(C, hlMM, tlMM) {
  const Y0 = 0.3 * hlMM, S0 = tlMM / 2, toObj = (p) => [p[2] / 1000, (p[1] - Y0) / 1000, (S0 - p[0]) / 1000];
  const segs = [];
  for (const f of C.frames ?? []) {
    const w = f.contacts?.weld;
    if (!w || f.phase >= (C.duty ?? 0.6)) continue;
    const L = toObj(w.L), R = toObj(w.R), last = segs[segs.length - 1];
    if (!last || Math.hypot(L[0] - last.L[0], L[1] - last.L[1], L[2] - last.L[2]) > 1e-7) segs.push({ from: f.phase, L, R });
  }
  return segs;
}

/** { mesh: [target names] } of the tier (extras.morphs: the head's meshes and the fins' by mesh). */
function meshTargets(X) {
  const M = X.morphs ?? {}, out = {};
  for (const [mesh, d] of Object.entries(M)) if (Array.isArray(d?.names)) out[mesh] = [...d.names];
  const F = M.fins;
  if (F?.meshes && F.targets) for (const [mesh, fins] of Object.entries(F.meshes)) out[mesh] = fins.flatMap((f) => (F.targets[f] ?? []).map((t) => `${t}_${f}`));
  // (lod2 trims its extras to a rule: every fin card's states on 'Fins', the alert eyes on 'Body')
  if (!Object.keys(out).length) {
    out.Fins = Object.entries(FIN_TARGETS).flatMap(([f, ts]) => ts.map((t) => `${t}_${f}`));
    out.Body = ['alert'];
  }
  return out;
}

/** the correctives' drivers the tier's extras give (morphs[mesh].drive with a joint) */
function driveTable(X) {
  const out = {};
  for (const d of Object.values(X.morphs ?? {})) for (const [t, e] of Object.entries(d?.drive ?? {})) {
    if (e && typeof e.joint === 'string' && e.per) out[t] = { joint: e.joint, channel: e.channel, per: e.per };
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the poses

/** a × (1 − k) + b × k into o (the quaternion joints slerped: either side a quaternion turns the other into one) */
function lerpVec(rig, a, b, k, o) {
  const n = rig.nSlots;
  for (let i = 0; i < n; i++) o.v[i] = a.v[i] + (b.v[i] - a.v[i]) * k;
  for (let i = 0; i < a.w.length; i++) o.w[i] = a.w[i] + (b.w[i] - a.w[i]) * k;
  o.qm.fill(0);
  for (let ji = 0; ji < rig.joints.length; ji++) {
    if (!a.qm[ji] && !b.qm[ji]) continue;
    jointQuat(rig, a, ji, _qA, 0); jointQuat(rig, b, ji, _qB, 0);
    qslerp(_qA, 0, _qB, 0, k, o.q, ji * 4);
    o.qm[ji] = 1;
  }
}
const _qA = new Float64Array(4), _qB = new Float64Array(4);

/** the joint's local rotation of a pose vector into o[oi..] */
function jointQuat(rig, P, ji, o, oi) {
  if (P.qm[ji]) { o[oi] = P.q[ji * 4]; o[oi + 1] = P.q[ji * 4 + 1]; o[oi + 2] = P.q[ji * 4 + 2]; o[oi + 3] = P.q[ji * 4 + 3]; return; }
  const j = rig.joints[ji];
  o[oi] = 0; o[oi + 1] = 0; o[oi + 2] = 0; o[oi + 3] = 1;
  for (let k = 0; k < j.order.length; k++) qturn(o, oi, j.axes[k], P.v[j.c0 + k]);
}

/**
 * Keyframes { at, vecs } at x (clamped to the ends): the two that bracket it, the weights and the quaternion joints
 * linearly; the channels through the four keys round it (Catmull–Rom, uniform: the keys are evenly spaced) where
 * `cubic`, so the solved arc between two keys is followed to the second order and every key is still met exactly.
 */
function keyedInto(rig, K, x, o, cubic = false) {
  const at = K.at, n = at.length;
  if (x <= at[0] || n === 1) return copyVec(K.vecs[0], o);
  if (x >= at[n - 1]) return copyVec(K.vecs[n - 1], o);
  let i = 0;
  while (i < n - 2 && at[i + 1] <= x) i++;
  const t = (x - at[i]) / (at[i + 1] - at[i]);
  lerpVec(rig, K.vecs[i], K.vecs[i + 1], t, o);
  if (!cubic || n < 3) return o;
  const p0 = K.vecs[Math.max(0, i - 1)].v, p1 = K.vecs[i].v, p2 = K.vecs[i + 1].v, p3 = K.vecs[Math.min(n - 1, i + 2)].v;
  const t2 = t * t, t3 = t2 * t;
  const c0 = -0.5 * t3 + t2 - 0.5 * t, c1 = 1.5 * t3 - 2.5 * t2 + 1, c2 = -1.5 * t3 + 2 * t2 + 0.5 * t, c3 = 0.5 * t3 - 0.5 * t2;
  // (the arms' channels only: the body's own profile — J_root's vault and stride, a smootherstep the keys sample — has
  // corners a cubic would overshoot, and it must keep still where the keys do: the recovery's cup)
  const v = o.v;
  for (const s of rig.armSlots) v[s] = c0 * p0[s] + c1 * p1[s] + c2 * p2[s] + c3 * p3[s];
  return o;
}

/** One of the frame's poses: a state, the prop at the frame's raise, the crawl at its phase. */
function refInto(rig, ref, frame, o) {
  let r = ref;
  for (let hop = 0; hop < 4; hop++) {
    if (r === 'prop' && rig.prop) return keyedInto(rig, rig.prop, frame?.prop?.raise ?? 15, o, CUBIC.prop);
    if (r === 'crawl' && rig.crawl) { const p = frame?.crawl?.phase ?? 0; return keyedInto(rig, rig.crawl, p - Math.floor(p), o, CUBIC.crawl); }
    if (rig.states[r]) return copyVec(rig.states[r], o);
    r = FALLBACK[r] ?? 'land';
  }
  o.v.fill(0); o.qm.fill(0); o.w.fill(0);
  return o;
}

/** the arms' lift of a blend (deg per channel, the left arm's: { J_pec: { depression }, J_pecFin: { flexion } }) */
function liftOf(rig, bl) {
  if (typeof bl.lift === 'number') return bl.lift ? { J_pec: { depression: -bl.lift }, J_pecFin: { flexion: bl.lift } } : null;
  if (bl.lift && typeof bl.lift === 'object') return bl.lift;
  const a = TRANSITION_NAME[bl.from] ?? bl.from, b = TRANSITION_NAME[bl.to] ?? bl.to;
  return rig.lift[`${a}>${b}`] ?? rig.lift[`${b}>${a}`] ?? null;
}

/** Two poses blended by the extras' transitions rule (e(u) on everything, sin(πu)·lift on the arms, held in range). */
function blendInto(rig, A, B, u, lift, o) {
  lerpVec(rig, A, B, smooth(u), o);
  if (!lift) return;
  const arc = Math.sin(Math.PI * clamp(u, 0, 1));
  if (!arc) return;
  const dep = (lift.J_pec?.depression ?? 0) * arc, flex = (lift.J_pecFin?.flexion ?? 0) * arc;
  for (const S of ['L', 'R']) {
    const pi = rig.index[`J_pec${S}`];
    if (pi !== undefined && dep) {
      if (o.qm[pi]) { const j = rig.joints[pi], k = j.order.indexOf('depression'); if (k >= 0) qturn(o.q, pi * 4, j.axes[k], dep); }
      else addClamped(rig, o, `J_pec${S}`, 'depression', dep);
    }
    if (flex) addClamped(rig, o, `J_pecFin${S}`, 'flexion', flex);
  }
}

function addClamped(rig, o, name, ch, d) {
  const ji = rig.index[name];
  if (ji === undefined) return;
  const j = rig.joints[ji], k = j.order.indexOf(ch);
  if (k < 0) return;
  const r = j.ranges[k];
  o.v[j.c0 + k] = clamp(o.v[j.c0 + k] + d, r[0], r[1]);
}

/** The frame's base pose (its pose, or the blend between two), into o. */
function baseInto(rig, frame, o) {
  const bl = frame.stateBlend;
  const ref = frame.pose ?? POSE_OF_STATE[frame.state] ?? 'prop';
  if (bl && bl.from && bl.to && bl.from !== bl.to) {
    const A = rig._a ??= newVec(rig), B = rig._b ??= newVec(rig);
    refInto(rig, bl.from, frame, A); refInto(rig, bl.to, frame, B);
    blendInto(rig, A, B, bl.u ?? 0, liftOf(rig, bl), o);
    return o;
  }
  return refInto(rig, ref, frame, o);
}

// ------------------------------------------------------------------------------------------------ the frame

/**
 * A pose's output buffers for a tier: per joint its local rotation `q` (x, y, z, w) and the translation `t` added to its
 * rest position (m, the object frame), the Eye nodes' rotations `eye` (L then R), the blend shapes' weights `w` by
 * target name (rig.targets: the same weight for every mesh that carries the target).
 */
export function createPose(rig) {
  const n = rig.joints.length;
  return { rig, q: new Float64Array(n * 4), t: new Float64Array(n * 3), eye: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1]), w: new Float64Array(rig.targets.length), work: newVec(rig) };
}

/**
 * The frame's pose on a tier into `out` (createPose; made when absent): the base pose (a state, the prop at its raise,
 * the crawl at its phase, or a blend), the swim's wave, the hop's curl and arch, the crawl's turn, the head, the eyes,
 * the fins; every channel held in its range, the spine's curl within its budget.
 * @param {object} rig poseRig(extras)   @param {object} frame a TobiFrame (behavior.ts) or the part of one pose.d.ts names
 */
export function poseInto(rig, frame, out = createPose(rig)) {
  const P = out.work;
  baseInto(rig, frame, P);
  const v = P.v;
  // ---- the spine
  const sw = frame.swim;
  if (sw && rig.spine.length > 2) swimWave(rig, sw, v);
  const hop = frame.hop;
  if (hop) {
    const C = rig.curl, curl = clamp(hop.curl ?? 0, -1, 1), arch = clamp(hop.arch ?? 0, 0, 1);
    for (let k = 0; k < C.joints.length; k++) {
      if (C.joints[k] >= 0 && curl) v[C.joints[k]] += (C.jcurl[k] ?? 0) * curl;
      if (C.pitch[k] >= 0 && arch) v[C.pitch[k]] += (ARCH[k] ?? 0) * arch;
    }
  }
  const cr = frame.crawl;
  if (cr && rig.crawl && cr.turn) {
    // the recovery: the body on its cup turns by `turn` (the behaviour slerps the root through it); the tail lags it a
    // little and catches up by the recovery's end (the stance's vault keeps it straight)
    const ph = (cr.phase ?? 0) - Math.floor(cr.phase ?? 0), D = rig.crawl.duty;
    if (ph > D) {
      const k = Math.sin((Math.PI * (ph - D)) / (1 - D)) * clamp(cr.turn, -1, 1) / DEG;
      for (const [nm, s] of Object.entries(LAG_SHARE)) { const i = rig.slot(nm, 'yaw'); if (i >= 0) v[i] += k * s; }
    }
  }
  capCurl(rig, v);
  // ---- the head
  const H = frame.head;
  if (H && rig.hasHead) headInto(rig, H, P);
  // ---- the eyes (their joints' lift and drop)
  const E = frame.eyes;
  if (E && rig.eyes) for (const S of ['L', 'R']) {
    const e = rig.eyes[S], f = E[S] ?? {}, b = clamp(E.blink?.[S] ?? 0, 0, 1);
    const top = rig.eyesUp ? e.liftM : e.liftBareM;
    const lift = clamp(typeof f.lift === 'number' ? f.lift : v[e.ty] * rig.hl, 0, top);
    v[e.ty] = (lift * (1 - b) - e.dropM * b) / rig.hl;
  }
  // ---- the fins
  const F = frame.fins;
  const w = P.w;
  if (F) {
    const setFin = (fin, x) => {
      const kf = rig.keyIndex[`${fin}|fold`], ks = rig.keyIndex[`${fin}|spread`];
      const fold = clamp(1 - 2 * x, 0, 1), spread = clamp(2 * x - 1, 0, 1);
      if (kf !== undefined) w[kf] = fold;
      if (ks !== undefined) w[ks] = spread;
    };
    if (typeof F.d1 === 'number') setFin('Fin_Dorsal1', F.d1);
    if (typeof F.median === 'number') {
      setFin('Fin_Dorsal2', F.median);
      // (the anal fin under the belly: raised only off the ground — swimming, in the air)
      const free = sw ? clamp(sw.amp ?? 1, 0, 1) : hop && (hop.stage === 'air') ? 1 : 0;
      if (free > 0) {
        const kf = rig.keyIndex['Fin_Anal|fold'], ks = rig.keyIndex['Fin_Anal|spread'], x = F.median;
        if (kf !== undefined) w[kf] += (clamp(1 - 2 * x, 0, 1) - w[kf]) * free;
        if (ks !== undefined) w[ks] += (clamp(2 * x - 1, 0, 1) - w[ks]) * free;
      }
    }
    if (typeof F.caudal === 'number') {
      const kf = rig.keyIndex['Fin_Caudal|fold'], ks = rig.keyIndex['Fin_Caudal|spread'], c = clamp(F.caudal, 0, 1);
      if (kf !== undefined) w[kf] = 1 - c;
      if (ks !== undefined) w[ks] = c;
    }
  }
  const kx = rig.keyIndex['Fin_Caudal|flex'];
  if (kx !== undefined) {
    let flex = w[kx];
    if (sw) flex += SWIM_WAVE.caudalFlex * clamp(sw.amp ?? 1, 0, 1.5) * Math.cos(TAU * (1 / SWIM_WAVE.wavelength - (sw.phase ?? 0)));
    if (hop && (hop.stage === 'coil' || hop.stage === 'push')) flex -= 0.4 * clamp(hop.curl ?? 0, -1, 1);
    w[kx] = clamp(flex, -1, 1);
  }
  // ---- the limits: every channel in its range, the pelvic cup in the clean range of its shape
  if (rig.pelvic) clampPelvic(rig, P);
  for (const j of rig.joints) {
    if (j.parent < 0) continue;
    for (let k = 0; k < j.order.length; k++) { const r = j.ranges[k], i = j.c0 + k; v[i] = clamp(v[i], r[0], r[1]); }
    if (j.translate) { const T = j.translate, lo = -(T.dropM ?? 1) / rig.hl, hi = (T.liftM ?? 1) / rig.hl; v[j.t0 + 1] = clamp(v[j.t0 + 1], lo, hi); }
  }
  // ---- out: the joints
  const hl = rig.hl;
  for (const j of rig.joints) {
    jointQuat(rig, P, j.i, out.q, j.i * 4);
    const ts = v[j.t0], ty = v[j.t0 + 1], tz = v[j.t0 + 2];
    let x = tz * hl, y = ty * hl, z = -ts * hl;
    if (j.slide && v[j.s0]) { const d = j.slide.dir, m = v[j.s0] * (j.slide.mPerUnit ?? hl); x += d[0] * m; y += d[1] * m; z += d[2] * m; }
    out.t[j.i * 3] = x; out.t[j.i * 3 + 1] = y; out.t[j.i * 3 + 2] = z;
  }
  // ---- the welds: the crawl's bearing tips held on their spots through the stance
  if (cr && rig.crawl && !rig._noHold && (frame.pose ?? POSE_OF_STATE[frame.state]) === 'crawl' && !(frame.stateBlend && frame.stateBlend.from !== frame.stateBlend.to)) {
    const ph = (cr.phase ?? 0) - Math.floor(cr.phase ?? 0);
    if (ph < rig.crawl.duty) holdWelds(rig, ph, P, out);
  }
  // ---- out: the gaze
  if (rig.eyes) gazeInto(rig, frame, out);
  // ---- out: the blend shapes (the poses' by key, the correctives by their joints, the head's)
  out.w.fill(0);
  for (let k = 0; k < rig.keys.length; k++) out.w[rig.keys[k].target] = w[k];
  for (const d of rig.drives) out.w[d.target] = clamp(((d.sign * v[d.slot]) / d.per), 0, 1);
  if (H) {
    const inf = clamp(H.inflate ?? 0, 0, 1);
    out.w[rig.head.inflate] = inf;
    out.w[rig.head.inflateMid] = 4 * inf * (1 - inf);
    out.w[rig.head.throat] = clamp(H.gulp ?? 0, 0, 1);
  }
  if (rig.alertKey >= 0 && E && !rig.eyes) {
    // (lod2: the eyes merged in the Body, their alert lift a blend shape: the mean lift over the alert's, closed by a blink)
    const a = rig.hl * 0.03, lift = (S) => clamp(E[S]?.lift ?? a, 0, 2 * a) * (1 - clamp(E.blink?.[S] ?? 0, 0, 1));
    out.w[rig.keys[rig.alertKey].target] = clamp((lift('L') + lift('R')) / (2 * a), 0, 1);
  }
  return out;
}

/** How the crawl's welds are held between the keys: damped least squares on the arm's channels, `iters` steps. */
export const WELD_HOLD = { iters: 2, damping: 1e-4, channels: [['J_pec', 'swing'], ['J_pec', 'protraction'], ['J_pec', 'depression'], ['J_pec', 'twist'], ['J_pecFin', 'flexion'], ['J_pecFin', 'sweep'], ['J_pecMid', 'flex'], ['J_pecMid', 'sweep']] };

const _wq = new Float64Array(4), _wa = new Float64Array(3), _wp = new Float64Array(3);
/**
 * The crawl's stance: each crutch's bearing tip held on its weld spot (the extras' contacts.weld, where the segment's
 * key put it). The keys are solved to the hundredth of a micrometre; between them the interpolated channels let the tip
 * wander (the hero up to 0.06 mm with the cubic keys): a few damped least-squares steps on the arm's channels take it
 * back. Nothing changes at a key. A one-joint arm (lod2) has no such channels: its card turns with the shoulder only.
 */
function holdWelds(rig, phase, P, out) {
  if (rig._hold === undefined) rig._hold = weldTable(rig) ?? false;
  const H = rig._hold;
  if (!H) return;
  let seg = H.segs[0];
  for (const s of H.segs) if (phase >= s.from) seg = s;
  for (const side of H.sides) {
    const target = seg[side.S].target, local = seg[side.S].local;
    for (let it = 0; it < WELD_HOLD.iters; it++) {
      // the chain's world transforms (model frame), root first
      const Wq = side.Wq, Wp = side.Wp;
      for (let c = 0; c < side.chain.length; c++) {
        const j = rig.joints[side.chain[c]], ox = j.pivot[0] - (c ? rig.joints[side.chain[c - 1]].pivot[0] : 0) + out.t[j.i * 3];
        const oy = j.pivot[1] - (c ? rig.joints[side.chain[c - 1]].pivot[1] : 0) + out.t[j.i * 3 + 1], oz = j.pivot[2] - (c ? rig.joints[side.chain[c - 1]].pivot[2] : 0) + out.t[j.i * 3 + 2];
        if (!c) { Wp[0] = ox; Wp[1] = oy; Wp[2] = oz; Wq.set(out.q.subarray(j.i * 4, j.i * 4 + 4), 0); continue; }
        qrot(Wq, (c - 1) * 4, ox, oy, oz, Wp, c * 3);
        Wp[c * 3] += Wp[(c - 1) * 3]; Wp[c * 3 + 1] += Wp[(c - 1) * 3 + 1]; Wp[c * 3 + 2] += Wp[(c - 1) * 3 + 2];
        qmul(Wq, (c - 1) * 4, out.q, j.i * 4, Wq, c * 4);
      }
      const last = side.chain.length - 1;
      qrot(Wq, last * 4, local[0], local[1], local[2], _wp, 0);
      const tx = _wp[0] + Wp[last * 3], ty = _wp[1] + Wp[last * 3 + 1], tz = _wp[2] + Wp[last * 3 + 2];
      const ex = target[0] - tx, ey = target[1] - ty, ez = target[2] - tz;
      if (ex * ex + ey * ey + ez * ez < 1e-16) break;
      // the Jacobian: each channel's world axis × (the tip − its joint's pivot), per radian
      const Jc = side.J;
      for (let k = 0; k < side.ch.length; k++) {
        const { c, j, n } = side.ch[k];
        _wq.set(Wq.subarray((c - 1) * 4, c * 4), 0);
        for (let m = 0; m < n; m++) qturn(_wq, 0, j.axes[m], P.v[j.c0 + m]);
        qrot(_wq, 0, j.axes[n][0], j.axes[n][1], j.axes[n][2], _wa, 0);
        const rx = tx - Wp[c * 3], ry = ty - Wp[c * 3 + 1], rz = tz - Wp[c * 3 + 2];
        Jc[k * 3] = _wa[1] * rz - _wa[2] * ry; Jc[k * 3 + 1] = _wa[2] * rx - _wa[0] * rz; Jc[k * 3 + 2] = _wa[0] * ry - _wa[1] * rx;
      }
      // (J Jᵀ + λ I) y = e, δ = Jᵀ y
      let a = WELD_HOLD.damping * 1e-6, b = 0, cc = 0, d = WELD_HOLD.damping * 1e-6, e = 0, f = WELD_HOLD.damping * 1e-6;
      for (let k = 0; k < side.ch.length; k++) { const x = Jc[k * 3], y = Jc[k * 3 + 1], z = Jc[k * 3 + 2]; a += x * x; b += x * y; cc += x * z; d += y * y; e += y * z; f += z * z; }
      const det = a * (d * f - e * e) - b * (b * f - e * cc) + cc * (b * e - d * cc);
      if (!(Math.abs(det) > 1e-30)) break;
      const y0 = (ex * (d * f - e * e) - b * (ey * f - e * ez) + cc * (ey * e - d * ez)) / det;
      const y1 = (a * (ey * f - e * ez) - ex * (b * f - e * cc) + cc * (b * ez - ey * cc)) / det;
      const y2 = (a * (d * ez - ey * e) - b * (b * ez - ey * cc) + ex * (b * e - d * cc)) / det;
      for (let k = 0; k < side.ch.length; k++) {
        const { j, n } = side.ch[k], r = j.ranges[n], s = j.c0 + n;
        P.v[s] = clamp(P.v[s] + (Jc[k * 3] * y0 + Jc[k * 3 + 1] * y1 + Jc[k * 3 + 2] * y2) / DEG, r[0], r[1]);
      }
      for (const ji of side.arm) jointQuat(rig, P, ji, out.q, ji * 4);
    }
  }
}

/** the crawl's weld table for holdWelds: per stance segment the tips' local points and their spots (model frame) */
function weldTable(rig) {
  rig._noHold = true;
  const cw = crawlWelds(rig);
  rig._noHold = false;
  if (!cw) return null;
  const sides = [];
  for (const S of ['L', 'R']) {
    const tip = cw.bone[S], pec = rig.index[`J_pec${S}`];
    // (an arm the crawl's keys give as a quaternion — lod2's — has no channels to hold it with)
    if (!tip || pec === undefined || rig.crawl.vecs.some((k) => k.qm[pec])) continue;
    // (the chain from the root to the tip, and the arm's channels the hold may turn)
    const chain = [];
    for (let i = rig.index[tip]; i >= 0; i = rig.joints[i].parent) chain.unshift(i);
    const ch = [];
    for (const [nm, c] of WELD_HOLD.channels) {
      const ji = rig.index[`${nm}${S}`];
      if (ji === undefined) continue;
      const j = rig.joints[ji], n = j.order.indexOf(c);
      if (n >= 0) ch.push({ c: chain.indexOf(ji), j, n });
    }
    if (ch.length < 3) continue;
    sides.push({ S, chain, ch, arm: [...new Set(ch.map((x) => x.j.i))], Wq: new Float64Array(chain.length * 4), Wp: new Float64Array(chain.length * 3), J: new Float64Array(ch.length * 3) });
  }
  if (!sides.length) return null;
  return { sides, segs: cw.segs.map((s) => ({ from: s.from, L: { local: s.L, target: s.weldL }, R: { local: s.R, target: s.weldR } })) };
}

/** the swimming wave on the spine's yaws (replacing the pose's), its turn's C-bend, the paddles' scull */
function swimWave(rig, sw, v) {
  const W = SWIM_WAVE, TL = rig.tlMM, amp = clamp(sw.amp ?? 1, 0, 1.5), ph = sw.phase ?? 0;
  const lat = (s) => { const x = s / TL; return TL * (W.a0 + W.a1 * x + W.a2 * x * x) * amp * Math.sin(TAU * (x / W.wavelength - ph)); };
  const S = rig.spine;
  // the segments behind J_root … the last joint (world yaw: + the segment's rear end toward the fish's left)
  let prev = 0, rootYaw = 0;
  for (let k = 0; k < S.length; k++) {
    const nm = S[k].name;
    if (nm === 'J_head') continue;
    const s0 = S[k].s, s1 = k + 1 < S.length ? S[k + 1].s : TL;
    const th = Math.atan2(lat(s1) - lat(s0), s1 - s0) / DEG;
    const i = rig.slot(nm, 'yaw');
    if (nm === 'J_root') rootYaw = th;
    if (i >= 0) v[i] = th - prev;
    prev = th;
  }
  // the head's recoil: its snout's yaw (+ toward the left) against J_root's turn of everything (+ the snout to the right)
  const hs = rig.spine.find((e) => e.name === 'J_head');
  const ih = rig.slot('J_head', 'yaw');
  if (hs && ih >= 0) v[ih] = Math.atan2(lat(1) - lat(hs.s), hs.s - 1) / DEG + rootYaw;
  // the turn: a C-bend into it (+ the turn rate: the heading rising, the snout to the fish's left, the tail with it)
  const bend = clamp((sw.turn ?? 0) * W.turnBend, -W.maxTurnBend, W.maxTurnBend) / DEG;
  if (bend) for (const [nm, s] of Object.entries(TURN_SHARE)) { const i = rig.slot(nm, 'yaw'); if (i >= 0) v[i] += bend * s; }
  // the paddles scull at the junction
  const sc = W.paddleDeg * Math.min(1, amp) * Math.sin(TAU * ph + 1.2);
  for (const S2 of ['L', 'R']) { const i = rig.slot(`J_pecFin${S2}`, 'flexion'); if (i >= 0) v[i] += sc; }
}

/** the spine's yaws scaled alike so Σ|yaw| over the bending joints stays within the curl budget (rig.mjs capCurl) */
function capCurl(rig, v) {
  const C = rig.curl;
  let sum = 0;
  for (const i of C.joints) if (i >= 0) sum += Math.abs(v[i]);
  if (!(sum > C.yawAbsSum)) return;
  const k = C.yawAbsSum / sum;
  for (const i of C.joints) if (i >= 0) v[i] *= k;
}

/** the head's mechanism: the gape, the pump, the cheeks and the vents as offsets from the bind on the head's joints */
function headInto(rig, H, P) {
  const HP = rig.headPoses, v = P.v;
  const add = (pose, k) => { if (!pose || !k) return; const a = pose.v.v; for (let i = 0; i < a.length; i++) if (a[i]) v[i] += a[i] * k; };
  const two = (A, B, k) => { if (!A || !B) return; const a = A.v.v, b = B.v.v; for (let i = 0; i < a.length; i++) { const x = a[i] + (b[i] - a[i]) * k; if (x) v[i] += x; } };
  const g = clamp(H.gape ?? 0, 0, 1);
  if (g > 0) { if (g <= GAPE_HALF) add(HP.gapeHalf, g / GAPE_HALF); else two(HP.gapeHalf, HP.gapeFull, (g - GAPE_HALF) / (1 - GAPE_HALF)); }
  add(HP.gulp, clamp(H.gulp ?? 0, 0, 1));
  const inf = clamp(H.inflate ?? 0, 0, 1);
  if (inf > 0) { if (inf <= 0.5) add(HP.inflatedHalf, inf / 0.5); else two(HP.inflatedHalf, HP.inflated, (inf - 0.5) / 0.5); }
  // (the vents shut while the cheeks are full: headmorphs vent = 0 during inflation)
  add(HP.vent, clamp(H.vent ?? 0, 0, 1) * (1 - inf));
}

/** J_pelvic within the clean range of the cup's blend shapes (AXES J_pelvic coupled, the corners cut: rig.mjs clampPelvic) */
function clampPelvic(rig, P) {
  const j = rig.pelvic, C = j.coupled;
  if (!C) return;
  const ip = j.order.indexOf('pitch'), ir = j.order.indexOf('roll');
  if (ip < 0) return;
  const wt = (t) => { const k = rig.keyIndex[`Fin_Pelvic|${t}`]; return k === undefined ? 0 : P.w[k]; };
  const on = C.filter((c) => c.morph && c.morph.reduce((s, t) => s + wt(t), 0) >= c.min);
  const use = on.length ? on : C.filter((c) => c.bare);
  const cut = (ch, k) => use.reduce((r, c) => [Math.max(r[0], c[ch][0]), Math.min(r[1], c[ch][1])], j.ranges[k]);
  const pr = cut('pitch', ip), p = clamp(P.v[j.c0 + ip], pr[0], pr[1]);
  P.v[j.c0 + ip] = p;
  if (ir >= 0) {
    const rr = cut('roll', ir), roll = P.v[j.c0 + ir], end = roll >= 0 ? rr[1] : -rr[0];
    const share = j.cornerSum ? Math.min(1, j.cornerSum - Math.max(0, p) / pr[1]) : 1;
    P.v[j.c0 + ir] = Math.sign(roll) * Math.min(Math.abs(roll), Math.max(0, share) * end);
  }
}

/** the Eye nodes' rotations: yaw · pitch about the gaze axes (pitch then yaw), eased toward the rest as the eye drops */
function gazeInto(rig, frame, out) {
  const E = frame.eyes, inf = clamp(frame.head?.inflate ?? 0, 0, 1), G = rig.headPoses.inflated?.gaze;
  ['L', 'R'].forEach((S, n) => {
    const e = rig.eyes[S], f = E?.[S] ?? null;
    let yaw = typeof f?.yaw === 'number' ? f.yaw : e.rest.yaw, pitch = typeof f?.pitch === 'number' ? f.pitch : e.rest.pitch;
    // (the inflated cheeks press the globes round: headrig's 'inflated' gaze)
    if (G && inf) { yaw += (G.yaw ?? 0) * inf; pitch += (G.pitch ?? 0) * inf; }
    // (the lid closes over the resting window: within blinkGaze.maxDeg of the rest as the eye drops)
    const b = clamp(E?.blink?.[S] ?? 0, 0, 1);
    if (b > 0) { const m = e.blinkMax + 160 * (1 - b) * (1 - b); yaw = clamp(yaw, -m, m); pitch = clamp(pitch, -m, m); }
    yaw = clamp(yaw, e.yawRange[0], e.yawRange[1]); pitch = clamp(pitch, e.pitchRange[0], e.pitchRange[1]);
    const o = out.eye, oi = n * 4;
    o[oi] = 0; o[oi + 1] = 0; o[oi + 2] = 0; o[oi + 3] = 1;
    qturn(o, oi, e.yawAxis, yaw);
    qturn(o, oi, e.pitchAxis, pitch);
  });
}

// ------------------------------------------------------------------------------------------------ the contract's form

/**
 * The frame's pose on a tier as plain objects (the contract's form; the driver uses poseInto's buffers):
 * { q: { J_x: [x, y, z, w] }, t: { J_x: [x, y, z] } (m, added to the rest position), eyeNodes: { L, R },
 *   morph: { mesh: { target: w } } }.
 * @param frame a TobiFrame   @param extras the tier's root extras (or extras.tobihaze)   @param tier checked against it
 */
export function poseFor(frame, extras, tier) {
  const rig = poseRig(extras);
  if (tier && tier !== rig.tier) throw new Error(`tobihaze pose: the extras are ${rig.tier}'s, not ${tier}'s`);
  const out = poseInto(rig, frame);
  const q = {}, t = {};
  for (const j of rig.joints) {
    q[j.name] = Array.from(out.q.subarray(j.i * 4, j.i * 4 + 4));
    t[j.name] = Array.from(out.t.subarray(j.i * 3, j.i * 3 + 3));
  }
  const morph = {};
  for (const [mesh, names] of Object.entries(rig.meshTargets)) {
    const m = (morph[mesh] = {});
    for (const nm of names) { const k = rig.targetIndex[nm]; m[nm] = k === undefined ? 0 : out.w[k]; }
  }
  return { q, t, eyeNodes: { L: Array.from(out.eye.subarray(0, 4)), R: Array.from(out.eye.subarray(4, 8)) }, morph, weights: Object.fromEntries(rig.targets.map((nm, k) => [nm, out.w[k]])) };
}

// ------------------------------------------------------------------------------------------------ binding a model

/**
 * Bind a tier's model to its rig (three's objects, used duck-typed: `.position`, `.quaternion`, `.morphTargetDictionary`,
 * `.morphTargetInfluences`): each joint's bone by name with its rest position, the Eye nodes (by name among the meshes or
 * under the root), and every mesh's blend shapes by target name (a target the rig weights takes the same weight on
 * every mesh that carries it: the head's three meshes share throat and inflate). Joints the model lacks are listed in
 * `missing` (a tier never lacks one of its own).
 * @param {object} rig poseRig(extras)   @param {{ bones: Record<string, object>, meshes: object[], root?: object }} model
 */
export function bindPose(rig, model) {
  const joints = [], missing = [];
  for (const j of rig.joints) {
    const b = model.bones?.[j.name] ?? model.root?.getObjectByName?.(j.name);
    if (!b) { missing.push(j.name); continue; }
    joints.push({ obj: b, i: j.i, rest: restOf(b, 'position') });
  }
  const find = (name) => model.meshes?.find((m) => m.name === name) ?? model.root?.getObjectByName?.(name) ?? null;
  const eyes = rig.eyes ? ['Eye_L', 'Eye_R'].map((nm) => { const o = find(nm); return o ? { obj: o, rest: restOf(o, 'quaternion') } : null; }) : [null, null];
  const morphs = [];
  const seen = new Set();
  const visit = (m) => {
    if (!m || seen.has(m)) return;
    seen.add(m);
    const D = m.morphTargetDictionary, I = m.morphTargetInfluences;
    if (D && I) for (const [nm, idx] of Object.entries(D)) { const k = rig.targetIndex[nm]; if (k !== undefined) morphs.push({ infl: I, idx, k }); }
  };
  for (const m of model.meshes ?? []) { visit(m); for (const c of m.children ?? []) visit(c); }
  return { rig, joints, eyes, morphs, missing };
}

/** an object's rest position or rotation, kept on it at its first binding (a model posed and bound again keeps its bind) */
function restOf(o, key) {
  const k = key === 'position' ? 'tobihazeRestPosition' : 'tobihazeRestQuaternion';
  const u = (o.userData ??= {});
  if (!u[k]) u[k] = key === 'position' ? [o.position.x, o.position.y, o.position.z] : [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w];
  return u[k];
}

const _eq = new Float64Array(4);
/** Put a pose (poseInto's out) on a bound model: the bones' rotations and positions, the Eye nodes, the blend shapes. */
export function applyPose(bind, pose) {
  const Q = pose.q, T = pose.t;
  for (const b of bind.joints) {
    const i = b.i;
    b.obj.quaternion.set(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]);
    b.obj.position.set(b.rest[0] + T[i * 3], b.rest[1] + T[i * 3 + 1], b.rest[2] + T[i * 3 + 2]);
  }
  for (let s = 0; s < 2; s++) {
    const e = bind.eyes[s];
    if (!e) continue;
    _eq[0] = e.rest[0]; _eq[1] = e.rest[1]; _eq[2] = e.rest[2]; _eq[3] = e.rest[3];
    qmul(_eq, 0, pose.eye, s * 4, _eq, 0);
    e.obj.quaternion.set(_eq[0], _eq[1], _eq[2], _eq[3]);
  }
  const W = pose.w;
  for (const m of bind.morphs) m.infl[m.idx] = W[m.k];
}

// ------------------------------------------------------------------------------------------------ forward kinematics

/**
 * The joints' world transforms in the model frame (m) for a pose (poseInto's out): each joint turns about its bind
 * pivot, its translation in its parent's frame. { q: Float64Array(4n), p: Float64Array(3n) } (p: the pivot's place).
 */
export function worldOf(rig, pose, W = { q: new Float64Array(rig.joints.length * 4), p: new Float64Array(rig.joints.length * 3) }) {
  const T = pose.t, Q = pose.q;
  for (const j of rig.joints) {
    const i = j.i, pi = j.parent;
    const ox = j.pivot[0] - (pi >= 0 ? rig.joints[pi].pivot[0] : 0) + T[i * 3];
    const oy = j.pivot[1] - (pi >= 0 ? rig.joints[pi].pivot[1] : 0) + T[i * 3 + 1];
    const oz = j.pivot[2] - (pi >= 0 ? rig.joints[pi].pivot[2] : 0) + T[i * 3 + 2];
    if (pi < 0) { W.p[i * 3] = ox; W.p[i * 3 + 1] = oy; W.p[i * 3 + 2] = oz; W.q.set(Q.subarray(i * 4, i * 4 + 4), i * 4); continue; }
    qrot(W.q, pi * 4, ox, oy, oz, W.p, i * 3);
    W.p[i * 3] += W.p[pi * 3]; W.p[i * 3 + 1] += W.p[pi * 3 + 1]; W.p[i * 3 + 2] += W.p[pi * 3 + 2];
    qmul(W.q, pi * 4, Q, i * 4, W.q, i * 4);
  }
  return W;
}

/** A bone-local point (extras contacts' `local`: m from the joint's pivot in its bind frame) in the model frame. */
export function pointOf(rig, W, bone, local, o = [0, 0, 0]) {
  const i = rig.index[bone];
  if (i === undefined) { o[0] = o[1] = o[2] = Number.NaN; return o; }
  qrot(W.q, i * 4, local[0], local[1], local[2], o, 0);
  o[0] += W.p[i * 3]; o[1] += W.p[i * 3 + 1]; o[2] += W.p[i * 3 + 2];
  return o;
}

/** The bone-local point of a model-frame point (the inverse of pointOf). */
export function localOf(rig, W, bone, p, o = [0, 0, 0]) {
  const i = rig.index[bone], c = new Float64Array([-W.q[i * 4], -W.q[i * 4 + 1], -W.q[i * 4 + 2], W.q[i * 4 + 3]]);
  qrot(c, 0, p[0] - W.p[i * 3], p[1] - W.p[i * 3 + 1], p[2] - W.p[i * 3 + 2], o, 0);
  return o;
}

/**
 * The crutch that bears in the crawl's stance on this tier (the furled blade's tip: J_pecTip on the hero, J_pecMid on
 * lod1, the one-joint arm J_pecL on lod2) and, per stance segment, its bone-local point under the cycle's pose where
 * the segment starts: { bone: { L, R }, segs: [{ from, to, L: local, R: local, weldL, weldR (model m) }] }.
 */
export function crawlWelds(rig) {
  const C = rig.crawl;
  if (!C || !C.segs.length) return null;
  const tip = (S) => [`J_pecTip${S}`, `J_pecMid${S}`, `J_pec${S}`].find((n) => n in rig.index);
  const bone = { L: tip('L'), R: tip('R') };
  const out = createPose(rig), W = { q: new Float64Array(rig.joints.length * 4), p: new Float64Array(rig.joints.length * 3) };
  const segs = C.segs.map((s, k) => {
    poseInto(rig, { pose: 'crawl', crawl: { phase: s.from } }, out);
    worldOf(rig, out, W);
    return { from: s.from, to: k + 1 < C.segs.length ? C.segs[k + 1].from : C.duty, L: localOf(rig, W, bone.L, s.L), R: localOf(rig, W, bone.R, s.R), weldL: s.L, weldR: s.R };
  });
  return { bone, segs };
}
