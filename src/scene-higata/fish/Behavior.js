// Procedural behaviour of one goby on the mudflat, driven by the shared pose model (./pose.js).
//
// The core is the behaviour of the goby viewer (claude/adoring-faraday, claude/awesome-ride):
//  * spend most of the time motionless: rests of ~10–30 s (sometimes over a minute) between short bouts of
//    activity; most bouts are a small repositioning, fewer are darts; yawns are rare
//  * perch on the bottom on the pelvic disc, the front propped on spread pectoral fins, head slightly
//    raised, tail resting on the sand; only the gills, pectorals and eyes move (ventilation ~70/min)
//  * move in short darts: a quick turn (C-bend), 2–4 tail beats at ~8 Hz with pectorals pressed flat
//    against the flanks and dorsal fins raised, then a glide and a landing with the pectorals flared
//  * turns are body turns: the head swings toward the new heading, a pulse of curvature runs back along the
//    body (C-bend, stage 1), the first tail stroke of the dart is the return flip (stage 2); perched, the
//    fish pivots on its pelvic disc
//  * flick the first dorsal fin, reposition with small rowing hops of the pectorals, look around with
//    independent eye saccades; pectorals planted at rest, power strokes when hopping, flared to brake
//  * yawn: slow gape with raised head and erect fins, a short hold, snap shut, opercular flush
//
// On the mudflat it also
//  * rests on the real, rippled ground (lowest contact point on the height field, body tilted with the
//    slope) and keeps to a home range, choosing landing spots away from other gobies and burrow openings
//  * watches the observer: a fast approach of the camera (looming) raises fear, and past a threshold the
//    fish escapes (fast C-start and a long dart, then freezes); neighbours take up the alarm
//  * マハゼ (juvenile, active forager): pecks at the sediment — head down, suction gape, a puff of silt,
//    a few chewing movements, then sand is flushed out through the gill openings
//  * エドハゼ (lives in the burrows of mud shrimps): rests at the opening of its burrow, dives head-first into
//    it when alarmed or now and then, turns round unseen, looks out with only the head above the rim,
//    and either withdraws again or climbs out; strikes at small prey above the bottom; threatens gobies
//    that come close to its burrow with erected fins and a wide-open mouth (the long jaw of the species)
import * as THREE from 'three';
import { breathe, yawnCurves } from './pose.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

// polyline path (world points) with arc-length parametrisation; extrapolated linearly at both ends
function makePath(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
  return { pts: points, cum, len: cum[cum.length - 1] };
}
function pathAt(path, a, out) {
  const { pts, cum, len } = path;
  const n = pts.length;
  if (a <= 0) return out.subVectors(pts[1], pts[0]).normalize().multiplyScalar(a).add(pts[0]);
  if (a >= len) return out.subVectors(pts[n - 1], pts[n - 2]).normalize().multiplyScalar(a - len).add(pts[n - 1]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= a) lo = m; else hi = m; }
  const t = (a - cum[lo]) / Math.max(cum[hi] - cum[lo], 1e-9);
  return out.lerpVectors(pts[lo], pts[hi], t);
}

export function createBehavior(opts) {
  const { root, bones, finMeshes, axes, contacts, model, world, species, jointRest, points } = opts;
  const scale = opts.scale ?? 1;
  const rng = opts.rng ?? Math.random;
  const rand = (a, b) => a + rng() * (b - a);
  const { SPINE, TL_MM, REST_FOLD, computePose, defaultPose } = model;
  const isEdo = species === 'edohaze';
  // personality: boldness (escape threshold), activity (rest length), exploration (range, dart length)
  const pers = { bold: rand(0.75, 1.3), activity: rand(0.75, 1.3), explore: rand(0.8, 1.25), ...(opts.personality || {}) };
  // metric constants were tuned on the 50.5 mm juvenile マハゼ; other species and sizes scale with length
  const K = (TL_MM / 50.5) * scale;
  const BL = TL_MM * 0.001 * scale;
  const restTime = (s = 1) => s * (isEdo ? 1.0 : 0.62) / pers.activity * Math.min(90, 8 + 14 * -Math.log(1 - rng() * 0.999));
  const rest = {};
  for (const [name, b] of Object.entries(bones)) rest[name] = b.position.clone();
  const sOf = Object.fromEntries(SPINE);

  const st = {
    auto: true, paused: false,
    mode: 'perch', t: 0, next: rand(2, 9),
    time: rand(0, 10),
    pos: new THREE.Vector3(opts.start?.x ?? 0, 0, opts.start?.z ?? 0), heading: opts.start?.heading ?? rand(-Math.PI, Math.PI), speed: 0, lift: 0,
    home: new THREE.Vector3(opts.home?.x ?? 0, 0, opts.home?.z ?? 0), range: (opts.range ?? 0.12) * pers.explore,
    burrow: opts.burrow ?? null,
    // locomotion
    phase: 0, gain: 0, freq: 8, beats: 3, turn: 0, targetHeading: 0, dartDist: 0.1,
    swim: 0, brake: 0, pitch: 0.04, after: null, fast: false,
    // fins
    d1: REST_FOLD.d1, d1Goal: REST_FOLD.d1, flick: 0, scull: 0, paddle: 0, erect: 0,
    // head
    yawnT: -1, peck: 0, peckPitch: 0, jawExtra: 0, operExtra: 0, chew: 0,
    // eyes
    eyes: [{ yaw: 0, pitch: 0, gy: 0, gp: 0, timer: 0.4 }, { yaw: 0, pitch: 0, gy: 0, gp: 0, timer: 0.9 }],
    // axial chain yaw (world, rad) for the segments in SPINE order; [1] (J_root) is the heading
    yaw: new Float64Array(SPINE.length), headGoal: 0, headV: 0, headW: 6, turnSign: 1, clock: 0,
    // posture and pectoral fins
    prop: 0.15, propGoal: 0.12, alertT: rand(15, 35), fan: 0, fanOn: false, fanT: rand(20, 45), strokeP: 0,
    pecs: [0, 1].map(() => ({ abd: 0.4, dep: 0.42, fold: 0, abdV: 0, depV: 0, flex: 0, wave: 0.04 })),
    // threat / social
    fear: 0, refractory: 0, freeze: 0, displayCD: rand(5, 20), target: null,
    // ground / burrow
    up: new THREE.Vector3(0, 1, 0), floorY: 0, hidden: false, inPath: false, path: null, u: 0, v: 0,
    yFrom: 0, yBlend: 0, restLiftJ: 0.0032 * scale, peekLook: 0, lookT: 0,
    mouthOpen: 0, gillOpen: 0,
  };
  st.yaw.fill(st.heading);
  st.headGoal = st.heading;

  // head-yaw history (fixed 240 Hz) that the body segments replay with a posterior delay
  const HDT = 1 / 240, HN = 256;
  const hist = new Float64Array(HN).fill(st.heading);
  let histHead = 0;
  const segV = new Float64Array(SPINE.length);
  const segX = SPINE.map(([, s], k) => (k === 0 ? 5 * TL_MM / 50.5 : (s + (k + 1 < SPINE.length ? SPINE[k + 1][1] : TL_MM)) / 2));
  const PULSE = 400; // mm / s
  const segDelay = segX.map((x) => Math.round((x - segX[0]) / PULSE / HDT));
  const JOINT_MAX = 0.45;
  const histAt = (lag) => hist[(histHead - lag + HN * 4) % HN];
  function stepChain(h) {
    const W = st.headW;
    st.headV += (W * W * wrap(st.headGoal - st.yaw[0]) - 2 * W * st.headV) * h;
    st.headV = clamp(st.headV, st.fast ? -40 : -12, st.fast ? 40 : 12);
    st.yaw[0] += st.headV * h;
    histHead = (histHead + 1) % HN;
    hist[histHead] = st.yaw[0];
    const w = 42, z = 0.5;
    for (let k = 1; k < SPINE.length; k++) {
      const goal = histAt(segDelay[k]);
      segV[k] += (w * w * (goal - st.yaw[k]) - 2 * z * w * segV[k]) * h;
      st.yaw[k] += segV[k] * h;
    }
    for (let k = 1; k < SPINE.length; k++) {
      const d = st.yaw[k] - st.yaw[k - 1];
      if (Math.abs(d) > JOINT_MAX) st.yaw[k] = st.yaw[k - 1] + Math.sign(d) * JOINT_MAX;
    }
  }
  function resetChain(heading) {
    st.yaw.fill(heading);
    hist.fill(heading);
    segV.fill(0);
    st.headV = 0;
    st.headGoal = heading;
    st.heading = heading;
  }

  // ------------------------------------------------------------------ world helpers
  const pointWorld = (pt, out) => out.copy(pt.p).applyMatrix4(pt.bone.matrixWorld);
  function silt(pt, n, vel = null, size = 1) {
    if (!world.silt || !pt) return;
    pointWorld(pt, _v);
    world.silt(_v, vel, n * K, size * K);
  }
  function siltAt(pos, n, vel = null, size = 1) { if (world.silt) world.silt(pos, vel, n * K, size * K); }

  // choose a dart direction: stay in the home range, land away from other gobies and from burrow
  // openings (except the own burrow), prefer small turns
  function pickDir(dist, away = null) {
    let best = st.heading, bestS = -Infinity;
    const others = world.others ? world.others(api) : [];
    for (let i = 0; i < 14; i++) {
      const ang = away !== null ? away + rand(-0.9, 0.9) : (i < 4 ? st.heading + rand(-0.9, 0.9) : rand(-Math.PI, Math.PI));
      const tx = st.pos.x + Math.sin(ang) * dist, tz = st.pos.z + Math.cos(ang) * dist;
      let s = rng() * 0.6 - 0.18 * Math.abs(wrap(ang - st.heading));
      const dh = Math.hypot(tx - st.home.x, tz - st.home.z);
      if (dh > st.range) s -= (dh - st.range) * 40;
      for (const o of others) {
        const dd = Math.hypot(tx - o.pos.x, tz - o.pos.z);
        s -= 3 * Math.exp(-((dd / (0.6 * BL + 0.6 * o.bl)) ** 2));
      }
      const h = world.holeAt ? world.holeAt(tx, tz, 0.35 * BL) : null;
      if (h && h !== st.burrow) s -= 3;
      if (away !== null) s += 0.5 * Math.cos(wrap(ang - away));
      if (s > bestS) { bestS = s; best = ang; }
    }
    return best;
  }

  // ------------------------------------------------------------------ actions
  function dart(dist = rand(0.05, 0.14) * K * pers.explore, angle = null) {
    if (st.inPath || st.mode === 'yawn' || st.mode === 'dart' || st.mode === 'orient') return;
    const dir = angle ?? pickDir(dist);
    st.targetHeading = st.yaw[0] + wrap(dir - st.yaw[0]);
    st.turnSign = Math.sign(wrap(dir - st.yaw[0])) || 1;
    st.dartDist = dist;
    st.mode = 'orient';
    st.t = 0;
    st.d1Goal = 0.05;
  }
  // drop whatever the head and fins were doing (feeding, threat display) when something more urgent comes up
  function abortAction() {
    st.peckPitch = 0; st.jawExtra = 0; st.operExtra = 0; st.chew = 0; st.erect = 0;
    st.flushed = false; st.notified = false; st.target = null; st.paddle = 0; st.strokeP = 0;
    if (!st.inPath) { st.mode = 'perch'; st.t = 0; }
  }
  function escape(from) {
    if (st.inPath || st.refractory > 0) return;
    abortAction();
    st.refractory = 2.0;
    st.fear = Math.max(st.fear, 0.8);
    // エドハゼ: back into the burrow when it is close
    if (isEdo && st.burrow && st.mode !== 'hidden') {
      const dB = Math.hypot(st.burrow.x - st.pos.x, st.burrow.z - st.pos.z);
      if (dB < 0.22) { goBurrow(true); return; }
    }
    const away = from ? Math.atan2(st.pos.x - from.x, st.pos.z - from.z) : st.heading + Math.PI;
    st.fast = true;
    dart(rand(0.14, 0.26) * K, pickDir(0.18 * K, away));
    st.mode = 'orient';
    st.escapeLatency = rand(0.012, 0.06);
    st.freeze = rand(12, 35);
    if (world.alarm) world.alarm(api, st.pos, 0.6);
  }
  function yawn() { if (st.mode === 'perch') { st.mode = 'yawn'; st.t = 0; } }
  function flick() { st.flick = 1; }
  function paddle(dir = null) {
    if (st.mode !== 'perch') return;
    st.mode = 'paddle'; st.t = 0;
    st.targetHeading = st.yaw[0] + (dir !== null ? clamp(wrap(dir - st.yaw[0]), -0.9, 0.9) : rand(-0.7, 0.7));
    st.paddleN = 2 + Math.floor(rand(0, 2.99));
  }
  // マハゼ: peck at the sediment just in front of the snout
  function peck() { if (st.mode === 'perch') { st.mode = 'peck'; st.t = 0; st.puffed = false; } }
  // strike at a small prey item a few millimetres above the bottom
  function strike() {
    if (st.mode !== 'perch') return;
    st.mode = 'strike'; st.t = 0;
    st.targetHeading = st.yaw[0] + rand(-0.5, 0.5);
    st.puffed = false;
  }
  function display(target) {
    if (st.mode !== 'perch' || st.displayCD > 0) return;
    st.mode = 'display'; st.t = 0;
    st.target = target;
    st.targetHeading = st.yaw[0] + wrap(Math.atan2(target.pos.x - st.pos.x, target.pos.z - st.pos.z) - st.yaw[0]);
    st.displayCD = rand(15, 40);
  }

  // ------------------------------------------------------------------ burrow (path following)
  // J_root position of the rested fish, world (for the start of a path)
  function jointWorld(name, out) { return bones[name].getWorldPosition(out); }
  function goBurrow(urgent = false) {
    if (!st.burrow || st.inPath) return;
    const b = st.burrow;
    const dir = Math.atan2(b.x - st.pos.x, b.z - st.pos.z);
    st.after = 'enter';
    st.fast = urgent;
    st.targetHeading = st.yaw[0] + wrap(dir - st.yaw[0]);
    st.turnSign = Math.sign(wrap(dir - st.yaw[0])) || 1;
    st.mode = 'orient';
    st.t = 0;
    st.escapeLatency = urgent ? rand(0.012, 0.05) : 0.05;
  }
  function startEnter() {
    const b = st.burrow;
    const J0 = jointWorld('J_root', new THREE.Vector3());
    const dx = b.x - J0.x, dz = b.z - J0.z;
    const dl = Math.hypot(dx, dz) || 1e-6;
    const d = new THREE.Vector3(dx / dl, 0, dz / dl);
    const heading = Math.atan2(d.x, d.z);
    const R = Math.min(0.006 * scale, b.r * 1.1);
    const pts = [];
    const lift = clamp(J0.y - world.ground(J0.x, J0.z), 0.001, 0.006);
    const A = new THREE.Vector3(b.x - d.x * R, 0, b.z - d.z * R);
    const run = Math.max(Math.hypot(A.x - J0.x, A.z - J0.z), 0.001);
    const steps = Math.max(2, Math.ceil(run / 0.003));
    for (let i = 0; i <= steps; i++) {
      const p = J0.clone().lerp(A, i / steps);
      p.y = i === 0 ? J0.y : Math.max(world.ground(p.x, p.z), b.rimY) + lift;
      pts.push(p);
    }
    const Ay = pts[pts.length - 1].y;
    for (let i = 1; i <= 10; i++) {
      const phi = (i / 10) * Math.PI / 2;
      pts.push(new THREE.Vector3(A.x + d.x * R * Math.sin(phi), Ay - R * (1 - Math.cos(phi)), A.z + d.z * R * Math.sin(phi)));
    }
    pts.push(new THREE.Vector3(b.x, b.rimY - b.depth, b.z));
    beginPath('enter', makePath(pts), heading, 0);
    st.v = st.fast ? 0.16 * K : 0.07 * K;
    siltAt(_v.set(b.x, b.rimY + 0.002, b.z), 14, null, 1);
  }
  function beginPath(mode, path, heading, u) {
    st.mode = mode;
    st.t = 0;
    st.inPath = true;
    st.path = path;
    st.u = u;
    st.pathHeading = heading;
    resetChain(heading);
  }
  function startPeek() {
    const b = st.burrow;
    const sEye = points?.eyeS ?? 4;
    const top = b.rimY + rand(0.0015, 0.0035) * scale - (sOf.J_root - sEye) * 0.001 * scale;
    const pts = [new THREE.Vector3(b.x, b.rimY - b.depth, b.z), new THREE.Vector3(b.x, top, b.z)];
    st.hidden = false;
    beginPath('peek', makePath(pts), rand(-Math.PI, Math.PI), pts[0].distanceTo(pts[1]) - 0.025 * scale);
    st.peekTop = pts[0].distanceTo(pts[1]);
    st.peekHold = isEdo ? rand(6, 40) / pers.activity : rand(4, 12);
    st.lookT = rand(0.5, 2);
    st.v = 0;
  }
  function startEmerge() {
    const b = st.burrow;
    const J0 = jointWorld('J_root', new THREE.Vector3());
    let dir = pickDir(0.04 * K);
    const d = new THREE.Vector3(Math.sin(dir), 0, Math.cos(dir));
    const R = 0.007 * scale;
    const yH = b.rimY + st.restLiftJ + 0.001;
    const B = new THREE.Vector3(b.x, Math.max(yH - R, J0.y + 0.0005), b.z);
    const pts = [J0.clone(), B.clone()];
    for (let i = 1; i <= 10; i++) {
      const phi = (i / 10) * Math.PI / 2;
      pts.push(new THREE.Vector3(b.x + d.x * R * (1 - Math.cos(phi)), B.y + R * Math.sin(phi), b.z + d.z * R * (1 - Math.cos(phi))));
    }
    const C = pts[pts.length - 1];
    const run = rand(0.025, 0.05) * K;
    for (let i = 1; i <= 12; i++) {
      const p = C.clone().addScaledVector(d, (run * i) / 12);
      p.y = world.ground(p.x, p.z) + st.restLiftJ;
      pts.push(p);
    }
    // keep the current facing while still vertical, so the turn happens on the way out
    beginPath('emerge', makePath(pts), dir, 0);
    st.v = 0.02 * K;
    siltAt(_v.set(b.x, b.rimY + 0.003, b.z), 10, null, 0.8);
  }
  function endPath() {
    // hand over to the ground behaviour without a jump
    st.inPath = false;
    st.path = null;
    st.pos.set(root.position.x, 0, root.position.z);
    st.yFrom = root.position.y;
    st.yBlend = 1;
    st.pitch = 0;
    resetChain(st.pathHeading);
    st.mode = 'glide';
    st.t = 0.2;
    st.speed = Math.min(st.v, 0.12 * K);
    st.gain = 0.4;
  }

  function chooseNext() {
    const r = rng();
    if (isEdo) {
      const b = st.burrow;
      const dB = b ? Math.hypot(b.x - st.pos.x, b.z - st.pos.z) : 1;
      if (b && r < 0.16) { goBurrow(false); return; }
      if (b && dB > 0.05 && r < 0.36) { dart(Math.min(dB * rand(0.6, 0.95), 0.12 * K), Math.atan2(b.x - st.pos.x, b.z - st.pos.z) + rand(-0.4, 0.4)); return; }
      if (r < 0.48) { dart(); return; }
      if (r < 0.6) { strike(); return; }
      if (r < 0.64) { yawn(); return; }
      if (r < 0.78) { paddle(); return; }
      if (r < 0.88) { flick(); st.mode = 'perch'; st.t = 0; st.next = restTime(0.8); return; }
      st.mode = 'perch'; st.t = 0; st.next = restTime();
      return;
    }
    if (r < 0.26) dart();
    else if (r < 0.58) peck();
    else if (r < 0.62) yawn();
    else if (r < 0.8) paddle();
    else if (r < 0.86) strike();
    else if (r < 0.93) { flick(); st.mode = 'perch'; st.t = 0; st.next = restTime(0.8); }
    else { st.mode = 'perch'; st.t = 0; st.next = restTime(); }
  }

  // ------------------------------------------------------------------ perception
  function perceive(dt) {
    st.refractory = Math.max(0, st.refractory - dt);
    st.displayCD = Math.max(0, st.displayCD - dt);
    let risk = 0;
    const thr = world.threat ? world.threat() : null;
    if (thr && !st.hidden) {
      _v.set(st.pos.x, st.floorY + 0.004, st.pos.z);
      if (st.inPath && st.burrow) _v.set(st.burrow.x, st.burrow.rimY, st.burrow.z);
      _v2.subVectors(thr.pos, _v);
      const d = Math.max(_v2.length(), 0.005);
      const closing = Math.max(0, -_v2.dot(thr.vel) / d);
      const loom = (0.03 * closing) / (d * d); // apparent expansion rate of a ~3 cm object (rad/s)
      risk = smooth((loom - 1.2) / 5) + 0.7 * smooth((2.2 * BL - d) / (1.4 * BL));
      // seen from behind (caudal blind zone) a threat is noticed later
      const toThr = Math.atan2(_v2.x, _v2.z);
      if (Math.abs(wrap(toThr - st.heading)) > 2.4) risk *= 0.6;
      st.threatDir = toThr;
    }
    st.fear = st.fear + (risk - st.fear) * (1 - Math.exp(-(risk > st.fear ? 7 : 0.25) * dt));
    // alert posture and eyes on the observer while it is near
    if (risk > 0.25 && st.mode === 'perch') { st.propGoal = Math.max(st.propGoal, 0.8); st.alertT = Math.max(st.alertT, 3); }
    if (st.fear > 0.55 * pers.bold && st.refractory <= 0) {
      if (st.mode === 'peek') { st.mode = 'retreat'; st.t = 0; st.v = -0.12 * K; st.refractory = 2; }
      else if (!st.inPath && st.mode !== 'hidden' && st.mode !== 'orient' && st.mode !== 'dart') escape(thr ? thr.pos : null);
    }
    // neighbours: エドハゼ threatens gobies near its burrow, everybody steps aside from a goby that lands on it
    if (!st.inPath && st.mode === 'perch' && world.others) {
      for (const o of world.others(api)) {
        const d = Math.hypot(o.pos.x - st.pos.x, o.pos.z - st.pos.z);
        if (isEdo && st.burrow && st.displayCD <= 0 && !o.hidden && d < 0.06 * scale && Math.hypot(o.pos.x - st.burrow.x, o.pos.z - st.burrow.z) < 0.07 && rng() < dt * 1.5) {
          display(o);
          break;
        }
        if (d < 0.45 * (BL + o.bl) && o.size >= BL * 0.9 && rng() < dt * 0.8 && !o.hidden) {
          const away = Math.atan2(st.pos.x - o.pos.x, st.pos.z - o.pos.z);
          if (rng() < 0.5) paddle(away); else dart(rand(0.04, 0.08) * K, pickDir(0.06 * K, away));
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    if (st.paused) return;
    dt = Math.min(dt, 1 / 20);
    st.time += dt;
    st.t += dt;
    st.freeze = Math.max(0, st.freeze - dt);
    perceive(dt);

    let swimGoal = 0, brakeGoal = 0, liftGoal = 0;
    switch (st.mode) {
      case 'perch':
        st.speed = damp(st.speed, 0, 6, dt);
        st.d1Goal = REST_FOLD.d1;
        if (st.auto && st.t > st.next && st.freeze <= 0) chooseNext();
        break;
      case 'paddle': {
        st.headGoal = st.targetHeading;
        st.headW = 5.5;
        st.strokeP += dt / 0.42;
        const inPower = (st.strokeP % 1) < 0.3;
        st.speed = damp(st.speed, inPower ? 0.022 * K : 0.0, inPower ? 12 : 8, dt);
        st.paddle = 1;
        if (st.strokeP >= st.paddleN) { st.mode = 'perch'; st.t = 0; st.next = restTime(0.9); st.paddle = 0; st.strokeP = 0; }
        break;
      }
      case 'orient': {
        const err = wrap(st.targetHeading - st.yaw[0]);
        const lat = st.escapeLatency ?? 0.05;
        if (st.t > lat) {
          st.headGoal = st.targetHeading;
          st.headW = (st.fast ? 34 : 20) + 8 * Math.min(Math.abs(err) / 1.5, 1);
        }
        swimGoal = 0.45;
        liftGoal = 0.3;
        if (st.t > lat && (Math.abs(err) < 0.3 || st.t > 0.4)) {
          st.escapeLatency = null;
          if (st.after === 'enter') {
            st.after = null;
            startEnter();
            break;
          }
          st.mode = 'dart'; st.t = 0;
          st.freq = st.fast ? rand(10, 12) : rand(7.5, 9.5);
          st.beats = Math.max(2, Math.round(st.dartDist / (0.045 * K) + rand(-0.4, 0.6)));
          st.phase = 2 * Math.PI / 0.95 - Math.PI / 2 + (st.turnSign > 0 ? 0 : Math.PI);
          st.gain = 0.35;
          // take-off from the bottom stirs up a little silt under the pectorals
          silt(points?.belly, st.fast ? 16 : 7, null, st.fast ? 1.2 : 0.9);
        }
        break;
      }
      case 'dart': {
        const dur = st.beats / st.freq;
        swimGoal = 1;
        liftGoal = 1;
        const vmax = (0.26 + 0.06 * (st.freq - 8)) * K;
        st.speed = damp(st.speed, vmax, 9, dt);
        st.phase += 2 * Math.PI * st.freq * dt;
        st.gain = damp(st.gain, 1, 22, dt);
        st.headGoal = st.targetHeading;
        st.headW = 10;
        if (st.t > dur) { st.mode = 'glide'; st.t = 0; }
        break;
      }
      case 'glide': {
        swimGoal = st.t < 0.2 ? 0.8 : 0.2;
        brakeGoal = st.t > 0.15 ? 1 : 0;
        liftGoal = st.t < 0.25 ? 0.6 : 0;
        st.speed = damp(st.speed, 0, st.t > 0.15 ? 7 : 3, dt);
        st.phase += 2 * Math.PI * st.freq * 0.6 * dt * Math.max(st.gain, 0);
        st.gain = damp(st.gain, 0, 10, dt);
        if (st.t > 0.55 && st.speed < 0.01 * K) {
          st.mode = 'perch'; st.t = 0; st.gain = 0;
          st.next = st.fast ? Math.max(restTime(), st.freeze) : restTime();
          st.fast = false;
          if (rng() < 0.3) st.flick = 1;
          silt(points?.belly, 5, null, 0.8);
        }
        break;
      }
      case 'yawn': {
        const y = yawnCurves(st.t);
        if (y.done) { st.mode = 'perch'; st.t = 0; st.next = restTime(); }
        break;
      }
      case 'peck': {
        // head down (0–0.3 s), suction gape (0.3–0.42 s), lift and chew (to 1.4 s), flush sand out of the gills
        const t = st.t;
        st.peckPitch = t < 0.3 ? smooth(t / 0.3) : t < 0.55 ? 1 : 1 - smooth((t - 0.55) / 0.35);
        const g = t < 0.3 ? 0 : t < 0.36 ? smooth((t - 0.3) / 0.06) : t < 0.46 ? 1 - smooth((t - 0.36) / 0.1) : 0;
        st.jawExtra = 0.42 * g;
        if (t > 0.32 && !st.puffed) { st.puffed = true; silt(points?.snout, 18, null, 0.7); }
        st.chew = t > 0.6 && t < 1.5 ? Math.sin((t - 0.6) * 2 * Math.PI * 3.2) * 0.5 + 0.5 : 0;
        st.operExtra = t > 1.5 && t < 1.85 ? Math.sin(Math.PI * (t - 1.5) / 0.35) : 0;
        if (t > 1.55 && !st.flushed) { st.flushed = true; silt(points?.gillL, 9, null, 0.5); silt(points?.gillR, 9, null, 0.5); }
        if (t > 2.0) { st.mode = 'perch'; st.t = 0; st.next = restTime(0.7); st.peckPitch = 0; st.chew = 0; st.operExtra = 0; st.flushed = false; }
        break;
      }
      case 'strike': {
        // orient, 1 beat lunge of ~1 cm with a fast suction gape at the end
        const t = st.t;
        st.headGoal = st.targetHeading;
        st.headW = 24;
        if (t > 0.12 && t < 0.24) { st.speed = damp(st.speed, 0.16 * K, 30, dt); st.phase += 2 * Math.PI * 9 * dt; st.gain = damp(st.gain, 0.5, 30, dt); swimGoal = 0.6; liftGoal = 0.6; }
        else { st.speed = damp(st.speed, 0, 12, dt); st.gain = damp(st.gain, 0, 10, dt); }
        const g = t < 0.2 ? 0 : t < 0.225 ? (t - 0.2) / 0.025 : t < 0.3 ? 1 - smooth((t - 0.225) / 0.075) : 0;
        st.jawExtra = 0.5 * g;
        st.operExtra = t > 0.24 && t < 0.5 ? 0.6 * Math.sin(Math.PI * (t - 0.24) / 0.26) : 0;
        st.chew = t > 0.5 && t < 1.2 ? Math.sin((t - 0.5) * 2 * Math.PI * 3) * 0.5 + 0.5 : 0;
        if (t > 1.3) { st.mode = 'perch'; st.t = 0; st.next = restTime(0.8); st.jawExtra = 0; st.operExtra = 0; st.chew = 0; }
        break;
      }
      case 'display': {
        // face the intruder, erect every fin, gape wide with the gill covers flared, hold, close
        st.headGoal = st.targetHeading;
        st.headW = 16;
        const t = st.t;
        st.erect = t < 0.25 ? smooth(t / 0.25) : t < 2.4 ? 1 : 1 - smooth((t - 2.4) / 0.4);
        const g = t < 0.35 ? 0 : t < 0.75 ? smooth((t - 0.35) / 0.4) : t < 1.9 ? 1 + 0.06 * Math.sin((t - 0.75) * 9) : t < 2.2 ? 1 - smooth((t - 1.9) / 0.3) : 0;
        st.jawExtra = 0.62 * g;
        st.operExtra = 0.5 * g;
        st.propGoal = 1;
        if (t > 1.0 && st.target && !st.notified) {
          st.notified = true;
          st.target.threatened(api);
        }
        if (t > 2.9) { st.mode = 'perch'; st.t = 0; st.next = restTime(0.6); st.erect = 0; st.jawExtra = 0; st.operExtra = 0; st.notified = false; st.target = null; }
        break;
      }
      case 'enter': {
        // head-first dash into the burrow along the path, tail beating
        st.v = damp(st.v, (st.fast ? 0.2 : 0.11) * K, 8, dt);
        st.u += st.v * dt;
        st.phase += 2 * Math.PI * (st.fast ? 11 : 9) * dt;
        st.gain = damp(st.gain, 0.8, 14, dt);
        swimGoal = 1;
        const tailA = st.u - (TL_MM - sOf.J_root) * 0.001 * scale;
        pathAt(st.path, tailA, _v);
        if (_v.y < st.burrow.rimY - 0.006 * scale) { st.mode = 'hidden'; st.t = 0; st.hidden = true; st.hideFor = st.fast ? rand(8, 30) : rand(4, 25); st.fast = false; st.gain = 0; }
        break;
      }
      case 'hidden':
        st.gain = 0;
        if (st.t > st.hideFor && (st.fear < 0.3 || st.t > st.hideFor * 3)) startPeek();
        break;
      case 'peek': {
        // rise until the eyes clear the rim, then look around: slow turns of the whole fish in the shaft
        const goalU = st.peekTop;
        st.u = damp(st.u, goalU + 0.0006 * Math.sin(st.time * 0.7) * scale, st.t < 1.5 ? 2.2 : 1.2, dt);
        st.lookT -= dt;
        if (st.lookT <= 0) { st.peekLook = wrap(st.pathHeading + rand(-1.2, 1.2) - st.pathHeading); st.lookT = rand(1.2, 5); }
        st.pathHeading = damp(st.pathHeading, st.pathHeading + st.peekLook, 1.6, dt);
        st.peekLook = damp(st.peekLook, 0, 1.6, dt);
        if (st.t > st.peekHold) {
          if (rng() < 0.6) startEmerge();
          else { st.mode = 'retreat'; st.t = 0; st.v = -0.05 * K; }
        }
        break;
      }
      case 'retreat': {
        st.u += st.v * dt;
        st.gain = damp(st.gain, 0.3, 10, dt);
        st.phase -= 2 * Math.PI * 7 * dt;
        if (st.u < st.peekTop - 0.03 * scale) { st.mode = 'hidden'; st.t = 0; st.hidden = true; st.hideFor = rand(5, 25); }
        break;
      }
      case 'emerge': {
        const remaining = st.path.len - st.u;
        st.v = damp(st.v, remaining > 0.012 ? 0.12 * K : 0.05 * K, 7, dt);
        st.u += st.v * dt;
        st.phase += 2 * Math.PI * 9 * dt;
        st.gain = damp(st.gain, 0.7, 10, dt);
        swimGoal = 1;
        if (st.u >= st.path.len) endPath();
        break;
      }
    }
    if (st.mode === 'perch' || st.mode === 'yawn' || st.mode === 'peck') st.headW = 6;

    if (st.inPath) updatePathPose(dt, swimGoal);
    else updateGroundPose(dt, swimGoal, brakeGoal, liftGoal);
  }

  // ------------------------------------------------------------------ pose: shared parts
  function finsAndHead(p, dt, sw, br) {
    const perch = 1 - sw;
    if (st.mode === 'perch') {
      st.alertT -= dt;
      if (st.alertT <= 0) {
        const alert = st.propGoal < 0.5;
        st.propGoal = alert ? rand(0.75, 1) : rand(0.05, 0.2);
        st.alertT = alert ? rand(4, 12) : rand(30, 70);
      }
    }
    const propGoal = st.mode === 'orient' ? 0.8 : (st.mode === 'dart' || st.mode === 'glide') ? 0 : st.propGoal;
    st.prop = damp(st.prop, propGoal, st.mode === 'orient' ? 10 : 2.5, dt);
    if (st.mode === 'perch') {
      st.fanT -= dt;
      if (st.fanT <= 0) { st.fanOn = !st.fanOn; st.fanT = st.fanOn ? rand(1.2, 2.5) : rand(25, 60); }
    } else st.fanOn = false;
    st.fan = damp(st.fan, st.fanOn ? 1 : 0, 3, dt);

    const bend = clamp(st.turn * 1.5, -1, 1);
    const breath = Math.sin(2 * Math.PI * 1.15 * st.time);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const inner = clamp(bend * side, 0, 1), outer = clamp(-bend * side, 0, 1);
      const P = st.pecs[i];
      let abd = 0.34 + 0.16 * st.prop + 0.012 * breath, dep = 0.4 + 0.28 * st.prop, fold = 0.04, rate = 10, wave = 0.03 + 0.3 * st.fan;
      abd += 0.3 * inner - 0.28 * outer;
      if (st.mode === 'paddle') {
        const ph = st.strokeP % 1;
        const power = ph < 0.3;
        const u = power ? ph / 0.3 : (ph - 0.3) / 0.7;
        const e = u * u * (3 - 2 * u);
        const amp = 0.75 * (1 + 0.6 * (outer - inner));
        abd = power ? 0.5 - amp * e : 0.5 - amp * (1 - e);
        dep = 0.26;
        fold = power ? 0 : 0.5 * Math.sin(Math.PI * u);
        rate = power ? 42 : 20;
        wave = 0.12;
      } else if (st.mode === 'dart' || st.mode === 'enter' || st.mode === 'emerge') {
        if (st.mode === 'dart' && st.t < 0.07) { abd = -0.4; dep = 0.1; fold = 0; rate = 48; }
        else { abd = -0.06; dep = 0; fold = 0.85; rate = 26; }
        wave = 0;
      } else if (st.mode === 'peek' || st.mode === 'retreat' || st.mode === 'hidden') {
        // braced against the burrow wall
        abd = 0.12 + 0.05 * breath; dep = 0.1; fold = 0.45; rate = 10; wave = 0.05;
      } else if (st.mode === 'glide') {
        if (st.t < 0.12) { abd = -0.06; dep = 0; fold = 0.85; rate = 26; wave = 0; }
        else if (st.speed > 0.03 * K) { abd = 0.62; dep = 0.18; fold = 0; rate = 16; wave = 0.08; }
        else { abd = 0.4; dep = 0.46; fold = 0.04; rate = 9; wave = 0.04; }
      } else if (st.mode === 'orient') {
        abd += 0.08; dep += 0.05; rate = 18;
      } else if (st.mode === 'display') {
        abd = 0.4 + 0.35 * st.erect; dep = 0.3; fold = 0; rate = 14; wave = 0.1;
      } else if (st.mode === 'peck') {
        dep += 0.12 * st.peckPitch; abd += 0.1 * st.peckPitch;
      }
      const z = 0.85;
      P.abdV += (rate * rate * (abd - P.abd) - 2 * z * rate * P.abdV) * dt;
      P.abd += P.abdV * dt;
      P.depV += (rate * rate * (dep - P.dep) - 2 * z * rate * P.depV) * dt;
      P.dep += P.depV * dt;
      P.fold = damp(P.fold, fold, rate * 0.6, dt);
      P.wave = damp(P.wave, wave, 4, dt);
      const flexGoal = clamp(-0.055 * P.abdV - 2.2 * (st.speed / K) * clamp(P.abd + 0.1, 0, 1) * (1 - P.fold), -1, 1);
      P.flex = damp(P.flex, flexGoal, 30, dt);
    }
    p.pecAbdL = st.pecs[0].abd; p.pecAbdR = st.pecs[1].abd;
    p.pecDepL = st.pecs[0].dep; p.pecDepR = st.pecs[1].dep;
    p.foldPecL = st.pecs[0].fold; p.foldPecR = st.pecs[1].fold;
    p.flexPecL = st.pecs[0].flex; p.flexPecR = st.pecs[1].flex;
    st.scull += dt * 2 * Math.PI * (st.mode === 'paddle' ? 2.4 : 1.15 + 1.3 * st.fan);
    p.scullPhase = st.scull;
    p.scullAmpL = st.pecs[0].wave; p.scullAmpR = st.pecs[1].wave;

    st.flick = damp(st.flick, 0, 2.2, dt);
    const flick = Math.sin(Math.min(st.flick, 1) * Math.PI);
    st.d1 = damp(st.d1, st.d1Goal, 10, dt);
    const inShaft = st.mode === 'enter' || st.mode === 'retreat' || st.mode === 'hidden';
    p.foldD1 = clamp(st.d1 * (1 - sw) + 0.12 * sw - 0.6 * flick, 0, 1);
    p.foldD2 = clamp(REST_FOLD.d2 * (1 - sw) + 0.05 * sw - 0.3 * flick, 0, 1);
    p.foldAnal = clamp(REST_FOLD.anal * (1 - sw) + 0.1 * sw, 0, 1);
    p.foldCaudal = clamp(REST_FOLD.caudal * (1 - sw), 0, 1);
    if (inShaft) { p.foldD1 = 0.9; p.foldD2 = 0.8; p.foldAnal = 0.8; p.foldCaudal = 0.6; }
    if (st.erect > 0) {
      const e = st.erect;
      p.foldD1 *= 1 - e; p.foldD2 *= 1 - e; p.foldAnal *= 1 - e; p.foldCaudal *= 1 - e;
    }
    p.foldPelvic = inShaft || st.mode === 'peek' ? 0.7 : 0.6 * sw * (1 - br);
    const last = SPINE.length - 1;
    p.flexCaudal = -0.85 * st.gain * Math.cos(st.phase - 2.2) - clamp(0.045 * segV[last], -0.6, 0.6);
    p.flexD = -0.35 * st.gain * Math.cos(st.phase - 1.2) - clamp(0.02 * segV[5], -0.3, 0.3);

    p.headPitch = (0.02 + 0.05 * st.prop) * perch - 0.16 * st.peckPitch;
    p.arch = 0.15 * st.prop * perch;
    p.pelvicPitch = 0.12 * st.prop * perch;
    if (st.mode === 'yawn') {
      const y = yawnCurves(st.t);
      p.jaw += 0.62 * y.open;
      p.premax += y.open;
      p.hyoid += 0.3 * y.hyoid;
      p.susp += 0.22 * y.susp;
      p.opercL += 0.3 * y.operc;
      p.opercR += 0.3 * y.operc;
      p.headPitch += 0.1 * y.open;
      p.foldD1 *= 1 - y.fins; p.foldD2 *= 1 - y.fins; p.foldAnal *= 1 - y.fins; p.foldCaudal *= 1 - y.fins;
      p.pecAbdL += 0.25 * y.fins; p.pecAbdR += 0.25 * y.fins;
    }
    // feeding / threat gapes and chewing
    const jx = st.jawExtra + 0.06 * st.chew;
    if (jx > 0) {
      p.jaw += jx;
      p.premax += jx * 1.5;
      p.hyoid += 0.45 * jx + 0.08 * st.chew;
      p.susp += 0.3 * jx;
    }
    if (st.operExtra > 0) { p.opercL += 0.3 * st.operExtra; p.opercR += 0.3 * st.operExtra; }
    if (st.mode === 'display') p.headPitch += 0.06 * st.erect;

    // eyes: independent saccades; both lead turns; quicker scanning while alarmed or peeking
    const scanning = st.fear > 0.2 || st.mode === 'peek';
    for (const [i, eye] of st.eyes.entries()) {
      eye.timer -= dt;
      if (eye.timer <= 0) {
        eye.gy = rand(-0.16, 0.16);
        eye.gp = rand(-0.05, 0.07);
        eye.timer = scanning ? rand(0.25, 1.2) : st.mode === 'perch' ? rand(1.5, 7) : rand(0.3, 1.2);
      }
      const lead = clamp(wrap(st.headGoal - st.yaw[0]) + (st.mode === 'orient' ? wrap(st.targetHeading - st.yaw[0]) : 0), -0.6, 0.6) * 0.4;
      eye.yaw = damp(eye.yaw, eye.gy + (st.inPath ? 0 : lead), 30, dt);
      eye.pitch = damp(eye.pitch, eye.gp, 30, dt);
      if (i === 1) { p.eyeYawR = eye.yaw; p.eyePitchR = eye.pitch; } else { p.eyeYawL = eye.yaw; p.eyePitchL = eye.pitch; }
    }
  }

  // ------------------------------------------------------------------ pose: on the ground
  function updateGroundPose(dt, swimGoal, brakeGoal, liftGoal) {
    const yawRootOld = st.yaw[1];
    st.clock += dt;
    while (st.clock >= HDT) { stepChain(HDT); st.clock -= HDT; }
    const pivotZ = (0.012 - 0.005 * st.swim) * K;
    const px = st.pos.x + Math.sin(yawRootOld) * pivotZ, pz = st.pos.z + Math.cos(yawRootOld) * pivotZ;
    st.heading = st.yaw[1];
    st.pos.x = px - Math.sin(st.heading) * pivotZ;
    st.pos.z = pz - Math.cos(st.heading) * pivotZ;
    st.turn = clamp(st.yaw[0] - st.yaw[3], -0.8, 0.8);
    st.swim = damp(st.swim, swimGoal, swimGoal > st.swim ? 22 : 6, dt);
    st.brake = damp(st.brake, brakeGoal, 10, dt);
    st.lift = damp(st.lift, liftGoal, liftGoal > st.lift ? 6 : 3, dt);
    if (st.mode !== 'dart' && st.mode !== 'glide' && st.mode !== 'strike') st.gain = damp(st.gain, 0, 10, dt);

    st.pos.x += Math.sin(st.heading) * st.speed * dt;
    st.pos.z += Math.cos(st.heading) * st.speed * dt;
    // never come to rest inside somebody else's burrow opening: slide off the rim
    const hole = world.holeAt ? world.holeAt(st.pos.x, st.pos.z, 0.15 * BL) : null;
    if (hole && st.mode === 'perch') {
      const dx = st.pos.x - hole.x, dz = st.pos.z - hole.z, d = Math.hypot(dx, dz) || 1e-4;
      const push = (hole.r + 0.15 * BL - d) * Math.min(1, dt * 4);
      st.pos.x += (dx / d) * push; st.pos.z += (dz / d) * push;
    }

    const p = defaultPose();
    p.phase = st.phase;
    p.gain = st.gain;
    p.turn = 0;
    const segYaw = {};
    SPINE.forEach(([name], k) => { segYaw[name] = st.yaw[k] - st.yaw[1]; });
    p.segYaw = segYaw;
    breathe(p, st.time, st.mode === 'dart' ? 0.4 : 1 + 0.6 * st.fear);
    const sw = st.swim, br = st.brake;
    finsAndHead(p, dt, sw, br);
    apply(computePose(p, axes));
    st.mouthOpen = p.jaw;
    st.gillOpen = Math.max(p.opercL, p.opercR);

    // root: heading and pitch, tilted with the ground under the body when resting on it
    const pitch = damp(st.pitch, (0.01 + 0.1 * st.prop) * (1 - sw) - 0.1 * st.peckPitch, 5, dt);
    st.pitch = pitch;
    world.normal(st.pos.x, st.pos.z, 0.45 * BL, _n);
    _n.lerp(_up, clamp(sw * 0.8 + st.lift * 0.5, 0, 1)).normalize();
    st.up.lerp(_n, 1 - Math.exp(-8 * dt)).normalize();
    _e.set(-pitch, st.heading, 0);
    _q.setFromEuler(_e);
    _q2.setFromUnitVectors(_up, st.up);
    root.quaternion.multiplyQuaternions(_q2, _q);
    // rest on whichever contact points touch the ground first (sucker rim, belly, lower caudal lobe, chin)
    root.position.set(st.pos.x, 0, st.pos.z);
    root.updateMatrixWorld(true);
    let need = -Infinity;
    for (const c of contacts) {
      c.bone.localToWorld(_v.copy(c.p));
      need = Math.max(need, world.ground(_v.x, _v.z) - _v.y);
    }
    let y = need + 0.0028 * K * st.lift;
    if (st.yBlend > 0) { y = y + (st.yFrom - y) * st.yBlend; st.yBlend = Math.max(0, st.yBlend - dt / 0.25); }
    root.position.y = y;
    root.updateMatrixWorld(true);
    st.floorY = world.ground(st.pos.x, st.pos.z);
    if (st.mode === 'perch') {
      jointWorld('J_root', _v);
      st.restLiftJ = damp(st.restLiftJ, clamp(_v.y - world.ground(_v.x, _v.z), 0.001, 0.007), 2, dt);
    }
    st.hidden = false;
    root.visible = true;
  }

  // ------------------------------------------------------------------ pose: following a burrow path
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3();
  const segPitch = {};
  function segDir(aFront, aBack, out) {
    pathAt(st.path, aFront, _a);
    pathAt(st.path, aBack, _b);
    return out.subVectors(_a, _b).normalize();
  }
  function updatePathPose(dt, swimGoal) {
    st.swim = damp(st.swim, swimGoal, 10, dt);
    st.brake = damp(st.brake, 0, 10, dt);
    st.speed = 0;
    st.turn = 0;
    const mm = 0.001 * scale;
    const aOf = (s) => st.u + (sOf.J_root - s) * mm;
    // world pitch of each axial segment from the path (nose up > 0)
    const pitchOf = (sFront, sBack) => { segDir(aOf(sFront), aOf(sBack), _f); return Math.asin(clamp(_f.y, -1, 1)); };
    const thRoot = pitchOf(sOf.J_root, SPINE[2][1]);
    segPitch.J_head = pitchOf(1.0, sOf.J_head) - thRoot;
    for (let k = 2; k < SPINE.length; k++) {
      const sB = k + 1 < SPINE.length ? SPINE[k + 1][1] : TL_MM;
      segPitch[SPINE[k][0]] = pitchOf(SPINE[k][1], sB) - thRoot;
    }
    const p = defaultPose();
    p.phase = st.phase;
    p.gain = st.gain;
    p.segPitch = segPitch;
    breathe(p, st.time, 1 + 0.6 * st.fear);
    finsAndHead(p, dt, st.swim, 0);
    p.headPitch = st.mode === 'peek' ? 0.05 * Math.sin(st.time * 0.9) : 0;
    p.arch = 0;
    apply(computePose(p, axes));
    st.mouthOpen = p.jaw;
    st.gillOpen = Math.max(p.opercL, p.opercR);
    // root: J_root joint on the path, oriented along it
    _e.set(-thRoot, st.pathHeading, 0);
    root.quaternion.setFromEuler(_e);
    pathAt(st.path, st.u, _a);
    _b.copy(jointRest.J_root).multiplyScalar(scale).applyQuaternion(root.quaternion);
    root.position.subVectors(_a, _b);
    root.updateMatrixWorld(true);
    st.up.set(0, 1, 0);
    st.floorY = -1e3;
    if (st.burrow) st.pos.set(st.burrow.x, 0, st.burrow.z);
    // nothing to draw while the whole fish is down the shaft
    if (st.mode === 'hidden') { root.visible = false; st.hidden = true; }
    else {
      pathAt(st.path, aOf(0), _a);
      root.visible = _a.y > (st.burrow ? st.burrow.rimY : 0) - 0.03;
      st.hidden = !root.visible;
    }
  }

  const finNames = Object.keys(finMeshes);
  function apply(P) {
    for (const [name, quat] of Object.entries(P.q)) {
      const b = bones[name];
      if (b) b.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
    }
    for (const [name, off] of Object.entries(P.t)) {
      const b = bones[name];
      if (b) b.position.set(rest[name].x + off[0], rest[name].y + off[1], rest[name].z + off[2]);
    }
    for (const name of finNames) {
      const w = P.morph[name];
      const infl = finMeshes[name].morphTargetInfluences;
      if (w && infl) for (let i = 0; i < w.length; i++) infl[i] = w[i];
    }
  }

  // start down in the burrow
  if (opts.startHidden && st.burrow) {
    const b = st.burrow;
    beginPath('hidden', makePath([new THREE.Vector3(b.x, b.rimY - b.depth, b.z), new THREE.Vector3(b.x, b.rimY - 0.03, b.z)]), st.heading, 0);
    st.hidden = true;
    st.hideFor = rand(1, 10);
  }

  const api = {
    update, dart, yawn, flick, paddle, peck, strike, escape,
    burrow: () => goBurrow(false),
    anchor: () => root.position,
    setAuto: (v) => { st.auto = v; },
    setPaused: (v) => { st.paused = v; },
    // another goby threatened us: give way
    threatened: (from) => {
      if (st.inPath || st.mode === 'dart' || st.mode === 'orient') return;
      st.fear = Math.max(st.fear, 0.4);
      const away = Math.atan2(st.pos.x - from.state.pos.x, st.pos.z - from.state.pos.z);
      abortAction();
      dart(rand(0.08, 0.15) * K, pickDir(0.1 * K, away));
    },
    // alarm spreading from a fleeing neighbour
    alarm: (strength) => { st.fear = Math.min(1, st.fear + strength); },
    state: st,
    species,
    bl: BL,
    size: BL,
    get pos() { return st.pos; },
    // out of sight in the burrow (a peeking head does not count as a goby on the flat)
    get hidden() { return st.hidden || (st.inPath && st.mode !== 'emerge'); },
  };
  return api;
}
