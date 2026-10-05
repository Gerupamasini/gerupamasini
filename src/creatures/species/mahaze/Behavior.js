// Procedural behaviour for the juvenile goby, driven by the shared pose model (./pose.js).
//
// What real gobies do (and what this reproduces):
//  * spend most of the time motionless: rests of ~10–30 s (sometimes over a minute) between short bouts of
//    activity; most bouts are a small repositioning, fewer are darts; yawns are rare
//  * perch on the bottom on the pelvic disc, the front propped on spread pectoral fins, head slightly
//    raised, tail resting on the sand; only the gills, pectorals and eyes move (ventilation ~70/min)
//  * move in short darts: a quick turn (C-bend), 2–4 tail beats at ~8 Hz with pectorals pressed flat
//    against the flanks and dorsal fins raised, then a glide and a landing with the pectorals flared
//  * turns are body turns (goby pectorals are built for power strokes, not for steering): the head swings
//    toward the new heading, a pulse of curvature runs back along the body (C-bend, stage 1), the first
//    tail stroke of the dart is the return flip (stage 2); perched, the fish pivots on its pelvic disc
//  * flick the first dorsal fin, reposition with small rowing hops of the pectorals, look around with
//    independent eye saccades
//  * pectorals (Pomatoschistus/Acanthogobius: drag-based power strokes): at rest they are planted with the
//    lower rays on the sand and barely move (a slight twitch with each breath, now and then a spell of
//    slow fanning); a hop is a quick synchronous backward sweep with the fin fully spread and a slower,
//    half-folded recovery; take-off starts with one hard stroke, then the fins lie folded on the flanks;
//    before landing they flare to brake and are set down on the sand again. The rays bend against the
//    water (tips lag every stroke, trail back in the flow).
//  * posture: mostly low on the sand (belly just clear, sucker down); from time to time alert, the front
//    propped up on the pectorals with the head raised (the tail then touches the sand)
//  * yawn: slow gape with raised head and erect fins, a short hold, snap shut, opercular flush
import * as THREE from 'three';
import { computePose, defaultPose, breathe, yawnCurves, SPINE, TL_MM, REST_FOLD } from './pose.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));
const rand = (a, b) => a + Math.random() * (b - a);
// resting spells: gobies sit motionless most of the time. Heavy-tailed: mostly 10–30 s, sometimes over a minute
const restTime = (scale = 1) => scale * Math.min(90, 8 + 14 * -Math.log(1 - Math.random() * 0.999));

export function createBehavior({ root, bones, finMeshes, axes, contacts, floorY, scale = 1, onEvent = null, body = null }) {
  // species geometry: joint positions along the body, total length and resting fin folds (マハゼ defaults)
  const SP = body?.spine ?? SPINE, TL = body?.tlMM ?? TL_MM, RF = body?.restFold ?? REST_FOLD;
  // floorY may be a function (x, z) → ground height, so the goby can rest on sloping terrain
  const floorAt = typeof floorY === 'function' ? floorY : () => floorY;
  const S = scale; // world metres per model metre: distances and speeds scale with the individual
  const emit = (name) => { if (onEvent) onEvent(name); };
  const rest = {};
  for (const [name, b] of Object.entries(bones)) rest[name] = b.position.clone();

  const st = {
    auto: true, paused: false,
    mode: 'perch', t: 0, next: rand(5, 9),
    time: 0,
    pos: new THREE.Vector3(), heading: 0, speed: 0, lift: 0,
    // locomotion
    phase: 0, gain: 0, freq: 8, beats: 3, turn: 0, targetHeading: 0, dartDist: 0.1,
    swim: 0, // 0 = perched fin posture, 1 = streamlined
    brake: 0,
    pitch: 0.04,
    // fins
    d1: RF.d1, d1Goal: RF.d1, flick: 0, scull: 0, scullAmp: 0.15, paddle: 0,
    // head
    yawnT: -1, breathDepth: 1,
    // eyes
    eyes: [{ yaw: 0, pitch: 0, gy: 0, gp: 0, timer: 0.4 }, { yaw: 0, pitch: 0, gy: 0, gp: 0, timer: 0.9 }],
    recoilX: 0,
    // axial chain yaw (world, rad) for the segments in SP order; [1] (J_root) is the heading
    yaw: new Float64Array(SP.length), headGoal: 0, headV: 0, headW: 6, turnSign: 1, clock: 0,
    // posture and pectoral fins
    prop: 0.15, propGoal: 0.12, alertT: rand(15, 35), fan: 0, fanOn: false, fanT: rand(20, 45), strokeP: 0,
    pecs: [0, 1].map(() => ({ abd: 0.4, dep: 0.42, fold: 0, abdV: 0, depV: 0, flex: 0, wave: 0.04 })),
  };
  // head-yaw history (fixed 240 Hz) that the body segments replay with a posterior delay
  const HDT = 1 / 240, HN = 256;
  const hist = new Float64Array(HN);
  let histHead = 0;
  const segV = new Float64Array(SP.length);
  // segment mid-points (mm from the snout) → delay of the curvature pulse (≈ 8 body lengths / s)
  const segX = SP.map(([, s], k) => (k === 0 ? 5 : (s + (k + 1 < SP.length ? SP[k + 1][1] : TL)) / 2));
  const PULSE = 400; // mm / s
  const segDelay = segX.map((x) => Math.round((x - segX[0]) / PULSE / HDT));
  const JOINT_MAX = 0.45;
  const histAt = (lag) => hist[(histHead - lag + HN * 4) % HN];
  function stepChain(h) {
    // head: critically damped spring toward its goal
    const W = st.headW;
    st.headV += (W * W * wrap(st.headGoal - st.yaw[0]) - 2 * W * st.headV) * h;
    // routine turns: the head swings at most ~700°/s, so large turns take longer instead of bending harder
    st.headV = clamp(st.headV, -12, 12);
    st.yaw[0] += st.headV * h;
    histHead = (histHead + 1) % HN;
    hist[histHead] = st.yaw[0];
    // body segments follow the delayed head yaw (slightly underdamped: the tail settles with a small overshoot)
    const w = 42, z = 0.5;
    for (let k = 1; k < SP.length; k++) {
      const goal = histAt(segDelay[k]);
      segV[k] += (w * w * (goal - st.yaw[k]) - 2 * z * w * segV[k]) * h;
      st.yaw[k] += segV[k] * h;
    }
    for (let k = 1; k < SP.length; k++) {
      const d = st.yaw[k] - st.yaw[k - 1];
      if (Math.abs(d) > JOINT_MAX) st.yaw[k] = st.yaw[k - 1] + Math.sign(d) * JOINT_MAX;
    }
  }

  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const tmp = new THREE.Vector3();

  // ------------------------------------------------------------------ actions
  function dart(dist = rand(0.06, 0.16) * S, angle = null, force = false) {
    if (st.mode === 'dart') return;
    if (st.mode === 'yawn') { if (!force) return; st.mode = 'perch'; st.t = 0; }
    // choose a target, biased to stay near the start point
    const back = st.pos.length() > 0.12 * S ? Math.atan2(-st.pos.x, -st.pos.z) : null;
    let dir = angle ?? (back !== null && Math.random() < 0.7 ? back + rand(-0.6, 0.6) : st.heading + rand(-1.6, 1.6));
    st.targetHeading = st.yaw[0] + wrap(dir - st.yaw[0]);
    st.turnSign = Math.sign(wrap(dir - st.yaw[0])) || 1;
    st.dartDist = dist;
    st.mode = 'orient';
    st.t = 0;
    st.d1Goal = 0.05; // fins up just before take-off
  }
  function yawn() {
    if (st.mode !== 'perch') return;
    st.mode = 'yawn';
    st.t = 0;
    emit('yawn');
  }
  function setRestFor(seconds) { if (st.mode === 'perch') { st.t = 0; st.next = seconds; } }
  function setAlert(v) { st.propGoal = v > 0.5 ? rand(0.75, 1) : rand(0.05, 0.2); st.alertT = v > 0.5 ? rand(4, 12) : rand(30, 70); if (v > 0.5) emit('alert'); }
  function setHeading(h) { st.heading = h; st.yaw.fill(h); st.headGoal = h; st.targetHeading = h; hist.fill(h); }
  function flick() { st.flick = 1; }
  function paddle() { if (st.mode === 'perch') { st.mode = 'paddle'; st.t = 0; st.targetHeading = st.yaw[0] + rand(-0.7, 0.7); } }

  function chooseNext() {
    const r = Math.random();
    if (r < 0.34) dart();
    else if (r < 0.4) yawn();
    else if (r < 0.78) paddle();
    else if (r < 0.9) { flick(); st.mode = 'perch'; st.t = 0; st.next = restTime(0.8); }
    else { st.mode = 'perch'; st.t = 0; st.next = restTime(); } // look around, stay put
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    if (st.paused) return;
    dt = Math.min(dt, 1 / 20);
    st.time += dt;
    st.t += dt;

    let swimGoal = 0, brakeGoal = 0, liftGoal = 0;
    switch (st.mode) {
      case 'perch':
        st.speed = damp(st.speed, 0, 6, dt);
        st.d1Goal = RF.d1;
        if (st.t > 20 && !st.restEmitted) { st.restEmitted = true; emit('rest'); }
        if (st.auto && st.t > st.next) chooseNext();
        break;
      case 'paddle': {
        // small repositioning: alternating pectoral strokes, a slow body turn about the disc, a few mm forward
        st.headGoal = st.targetHeading;
        st.headW = 5.5;
        // each power stroke of the pectorals pushes the fish a little forward
        st.strokeP += dt / 0.42;
        const inPower = (st.strokeP % 1) < 0.3;
        st.speed = damp(st.speed, inPower ? 0.022 * S : 0.0, inPower ? 12 : 8, dt);
        st.paddle = 1;
        if (st.t > 0.84 + 0.42 * Math.floor(rand(0, 1.99))) { st.mode = 'perch'; st.t = 0; st.next = restTime(0.9); st.paddle = 0; st.strokeP = 0; }
        break;
      }
      case 'orient': {
        // stage 1: the eyes glance first (~50 ms), then the head swings and a C-bend runs down the body
        const err = wrap(st.targetHeading - st.yaw[0]);
        if (st.t > 0.05) {
          st.headGoal = st.targetHeading;
          st.headW = 20 + 8 * Math.min(Math.abs(err) / 1.5, 1);
        }
        swimGoal = 0.45;
        liftGoal = 0.3;
        if (st.t > 0.05 && (Math.abs(err) < 0.3 || st.t > 0.4)) {
          // stage 2: the first tail stroke of the dart is the return flip, away from the concave side
          st.mode = 'dart'; st.t = 0; st.restEmitted = false;
          emit('dart');
          st.freq = rand(7.5, 9.5);
          st.beats = Math.max(2, Math.round(st.dartDist / (0.045 * S) + rand(-0.4, 0.6)));
          st.phase = 2 * Math.PI / 0.95 - Math.PI / 2 + (st.turnSign > 0 ? 0 : Math.PI);
          st.gain = 0.35;
        }
        break;
      }
      case 'dart': {
        const dur = st.beats / st.freq;
        swimGoal = 1;
        liftGoal = 1;
        const vmax = (0.26 + 0.06 * (st.freq - 8)) * S;
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
        if (st.t > 0.55 && st.speed < 0.01 * S) {
          st.mode = 'perch'; st.t = 0; st.next = restTime(); st.gain = 0;
          if (Math.random() < 0.3) st.flick = 1;
        }
        break;
      }
      case 'yawn': {
        const y = yawnCurves(st.t);
        if (y.done) { st.mode = 'perch'; st.t = 0; st.next = restTime(); }
        break;
      }
    }
    if (st.mode === 'perch' || st.mode === 'yawn') st.headW = 6;
    // axial chain at a fixed sub-step; the root segment carries the heading, the fish pivots on the
    // pelvic disc when perched and about its centre of mass (≈ 0.35 L) when swimming
    const yawRootOld = st.yaw[1];
    st.clock += dt;
    while (st.clock >= HDT) { stepChain(HDT); st.clock -= HDT; }
    const pivotZ = (0.012 - 0.005 * st.swim) * S;
    const px = st.pos.x + Math.sin(yawRootOld) * pivotZ, pz = st.pos.z + Math.cos(yawRootOld) * pivotZ;
    st.heading = st.yaw[1];
    st.pos.x = px - Math.sin(st.heading) * pivotZ;
    st.pos.z = pz - Math.cos(st.heading) * pivotZ;
    // body bend (head vs mid-trunk), used by the fins and eyes
    st.turn = clamp(st.yaw[0] - st.yaw[3], -0.8, 0.8);
    st.swim = damp(st.swim, swimGoal, swimGoal > st.swim ? 22 : 6, dt);
    st.brake = damp(st.brake, brakeGoal, 10, dt);
    st.lift = damp(st.lift, liftGoal, liftGoal > st.lift ? 6 : 3, dt);
    if (st.mode !== 'dart' && st.mode !== 'glide') st.gain = damp(st.gain, 0, 10, dt);

    // translation over the floor
    st.pos.x += Math.sin(st.heading) * st.speed * dt;
    st.pos.z += Math.cos(st.heading) * st.speed * dt;

    // ---------------------------------------------------------------- pose
    const p = defaultPose(RF);
    p.phase = st.phase;
    p.gain = st.gain;
    p.turn = 0;
    const segYaw = {};
    SP.forEach(([name], k) => { segYaw[name] = st.yaw[k] - st.yaw[1]; });
    p.segYaw = segYaw;
    breathe(p, st.time, st.mode === 'dart' ? 0.4 : 1);

    const sw = st.swim, br = st.brake;
    const perch = 1 - sw;
    // ---- posture: low on the sand, or alert and propped up on the pectorals
    if (st.mode === 'perch') {
      st.alertT -= dt;
      if (st.alertT <= 0) {
        const alert = st.propGoal < 0.5;
        st.propGoal = alert ? rand(0.75, 1) : rand(0.05, 0.2);
        st.alertT = alert ? rand(4, 12) : rand(30, 70);
        if (alert) emit('alert');
      }
    }
    const propGoal = st.mode === 'orient' ? 0.8 : (st.mode === 'dart' || st.mode === 'glide') ? 0 : st.propGoal;
    st.prop = damp(st.prop, propGoal, st.mode === 'orient' ? 10 : 2.5, dt);
    // resting spells of slow pectoral fanning
    if (st.mode === 'perch') {
      st.fanT -= dt;
      if (st.fanT <= 0) { st.fanOn = !st.fanOn; st.fanT = st.fanOn ? rand(1.2, 2.5) : rand(25, 60); }
    } else st.fanOn = false;
    st.fan = damp(st.fan, st.fanOn ? 1 : 0, 3, dt);

    // ---- pectoral fins: goal pose per fin → damped spring; the rays flex against the water
    const bend = clamp(st.turn * 1.5, -1, 1); // + = turning toward the fish's left
    const breath = Math.sin(2 * Math.PI * 1.15 * st.time);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const inner = clamp(bend * side, 0, 1), outer = clamp(-bend * side, 0, 1);
      const P = st.pecs[i];
      // at rest: spread down and back, lower rays on the sand; pushed down harder when propped up
      let abd = 0.34 + 0.16 * st.prop + 0.012 * breath, dep = 0.4 + 0.28 * st.prop, fold = 0.04, rate = 10, wave = 0.03 + 0.3 * st.fan;
      // turning on the spot: brace on the concave side, sweep back on the outside
      abd += 0.3 * inner - 0.28 * outer;
      if (st.mode === 'paddle') {
        // rowing hop: quick synchronous power stroke (fully spread), slower half-folded recovery
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
      } else if (st.mode === 'dart') {
        // one hard stroke at take-off, then folded flat against the flanks
        if (st.t < 0.07) { abd = -0.4; dep = 0.1; fold = 0; rate = 48; }
        else { abd = -0.06; dep = 0; fold = 0.85; rate = 26; }
        wave = 0;
      } else if (st.mode === 'glide') {
        if (st.t < 0.12) { abd = -0.06; dep = 0; fold = 0.85; rate = 26; wave = 0; }
        else if (st.speed > 0.03) { abd = 0.62; dep = 0.18; fold = 0; rate = 16; wave = 0.08; } // flare: brake
        else { abd = 0.4; dep = 0.46; fold = 0.04; rate = 9; wave = 0.04; }                  // set down on the sand
      } else if (st.mode === 'orient') {
        abd += 0.08; dep += 0.05; rate = 18;
      }
      const z = 0.85;
      P.abdV += (rate * rate * (abd - P.abd) - 2 * z * rate * P.abdV) * dt;
      P.abd += P.abdV * dt;
      P.depV += (rate * rate * (dep - P.dep) - 2 * z * rate * P.depV) * dt;
      P.dep += P.depV * dt;
      P.fold = damp(P.fold, fold, rate * 0.6, dt);
      P.wave = damp(P.wave, wave, 4, dt);
      // tips lag each stroke; in a forward flow a spread fin is pressed back
      const flexGoal = clamp(-0.055 * P.abdV - 2.2 * st.speed * clamp(P.abd + 0.1, 0, 1) * (1 - P.fold), -1, 1);
      P.flex = damp(P.flex, flexGoal, 30, dt);
    }
    p.pecAbdL = st.pecs[0].abd; p.pecAbdR = st.pecs[1].abd;
    p.pecDepL = st.pecs[0].dep; p.pecDepR = st.pecs[1].dep;
    p.foldPecL = st.pecs[0].fold; p.foldPecR = st.pecs[1].fold;
    p.flexPecL = st.pecs[0].flex; p.flexPecR = st.pecs[1].flex;
    // membrane ripple (dorsal → ventral wave across the rays): breathing twitch, fanning, paddling
    st.scull += dt * 2 * Math.PI * (st.mode === 'paddle' ? 2.4 : 1.15 + 1.3 * st.fan);
    p.scullPhase = st.scull;
    p.scullAmpL = st.pecs[0].wave; p.scullAmpR = st.pecs[1].wave;

    st.flick = damp(st.flick, 0, 2.2, dt);
    const flick = Math.sin(Math.min(st.flick, 1) * Math.PI);
    st.d1 = damp(st.d1, st.d1Goal, 10, dt);
    p.foldD1 = clamp(st.d1 * (1 - sw) + 0.12 * sw - 0.6 * flick, 0, 1);
    p.foldD2 = clamp(0.3 * (1 - sw) + 0.05 * sw - 0.3 * flick, 0, 1);
    p.foldAnal = clamp(0.85 * (1 - sw) + 0.1 * sw, 0, 1);
    p.foldCaudal = clamp(0.45 * (1 - sw), 0, 1);
    p.foldPelvic = 0.6 * sw * (1 - br);
    // passive trailing flex of the caudal and median fins lags the lateral tail velocity
    // (turning: the fins trail the angular velocity of their body segment)
    const last = SP.length - 1;
    p.flexCaudal = -0.85 * st.gain * Math.cos(st.phase - 2.2) - clamp(0.045 * segV[last], -0.6, 0.6);
    p.flexD = -0.35 * st.gain * Math.cos(st.phase - 1.2) - clamp(0.02 * segV[5], -0.3, 0.3);

    // alert: the front is propped up on the pectorals and the erected pelvic sucker, the head raised; the
    // trunk flexes behind the pelvic region so the rear half stays on the sand
    p.headPitch = (0.02 + 0.05 * st.prop) * perch;
    p.arch = 0.15 * st.prop * perch;
    p.pelvicPitch = 0.12 * st.prop * perch;
    // yawn overrides the head
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

    // eyes: independent saccades (mostly horizontal, ±8°), with long fixations while resting; both lead turns
    for (const [i, eye] of st.eyes.entries()) {
      eye.timer -= dt;
      if (eye.timer <= 0) {
        eye.gy = rand(-0.14, 0.14);
        eye.gp = rand(-0.05, 0.06);
        eye.timer = st.mode === 'perch' ? rand(1.5, 7) : rand(0.3, 1.2);
      }
      // both eyes look toward where the head is going (they lead the turn, then settle)
      const lead = clamp(wrap(st.headGoal - st.yaw[0]) + (st.mode === 'orient' ? wrap(st.targetHeading - st.yaw[0]) : 0), -0.6, 0.6) * 0.4;
      eye.yaw = damp(eye.yaw, eye.gy + lead, 30, dt);
      eye.pitch = damp(eye.pitch, eye.gp, 30, dt);
    }
    p.eyeYawL = st.eyes[0].yaw; p.eyePitchL = st.eyes[0].pitch;
    p.eyeYawR = st.eyes[1].yaw; p.eyePitchR = st.eyes[1].pitch;

    apply(computePose(p, axes, body));
    st.mouthOpen = p.jaw;
    st.gillOpen = Math.max(p.opercL, p.opercR);

    // ---------------------------------------------------------------- root transform
    const pitch = damp(st.pitch, (0.01 + 0.1 * st.prop) * (1 - sw), 5, dt);
    st.pitch = pitch;
    e.set(-pitch, st.heading, 0);
    root.quaternion.setFromEuler(e);
    // rest on whichever contact points are lowest in this pose (sucker rim, belly, lower caudal lobe);
    // lift a few mm while swimming
    root.position.set(st.pos.x, 0, st.pos.z);
    root.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const c of contacts) lowest = Math.min(lowest, c.bone.localToWorld(tmp.copy(c.p)).y);
    root.position.y = floorAt(st.pos.x, st.pos.z) - lowest + 0.0028 * S * st.lift;
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

  // freeze a reproducible pose for stills: ?anim=yawn:1.0 | swim:0.03 | perch
  function pose(name, time) {
    st.paused = false;
    if (name === 'yawn') { st.mode = 'yawn'; st.t = 0; for (let t = 0; t < time; t += 1 / 60) update(1 / 60); }
    else if (name === 'swim') {
      st.mode = 'dart'; st.t = 0; st.beats = 99; st.freq = 8; st.targetHeading = 0;
      for (let t = 0; t < 0.3 + time; t += 1 / 120) update(1 / 120);
    } else { for (let t = 0; t < 0.5; t += 1 / 60) update(1 / 60); }
    st.paused = true;
  }

  return {
    update, dart, yawn, flick, paddle, pose, setRestFor, setAlert, setHeading,
    anchor: () => root.position,
    setAuto: (v) => { st.auto = v; },
    setPaused: (v) => { st.paused = v; },
    state: st,
  };
}

export { SPINE };
