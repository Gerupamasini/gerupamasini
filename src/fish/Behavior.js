// Procedural behaviour for the juvenile goby, driven by the shared pose model (./pose.js).
//
// What real gobies do (and what this reproduces):
//  * perch on the bottom on the pelvic disc, the front propped on spread pectoral fins, head slightly
//    raised, tail resting on the sand; only the gills, pectorals and eyes move (ventilation ~70/min)
//  * move in short darts: a quick turn (C-bend), 2–4 tail beats at ~8 Hz with pectorals pressed flat
//    against the flanks and dorsal fins raised, then a glide and a landing with the pectorals flared
//  * flick the first dorsal fin, reposition with small pectoral paddles, look around with
//    independent eye saccades
//  * yawn: slow gape with raised head and erect fins, a short hold, snap shut, opercular flush
import * as THREE from 'three';
import { computePose, defaultPose, breathe, yawnCurves, SPINE } from './pose.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));
const rand = (a, b) => a + Math.random() * (b - a);

export function createBehavior({ root, bones, finMeshes, axes, contactY, tailContactY = contactY + 0.0008, floorY }) {
  const rest = {};
  for (const [name, b] of Object.entries(bones)) rest[name] = b.position.clone();
  // contact points in object space: under the pelvic disc (s ≈ 12 mm) and the lower caudal lobe (s ≈ 48 mm)
  const contact = new THREE.Vector3(0, contactY, 0.013);
  const tailContact = new THREE.Vector3(0, tailContactY, -0.023);

  const st = {
    auto: true, paused: false,
    mode: 'perch', t: 0, next: 1.5,
    time: 0,
    pos: new THREE.Vector3(), heading: 0, speed: 0, lift: 0,
    // locomotion
    phase: 0, gain: 0, freq: 8, beats: 3, turn: 0, turnGoal: 0, targetHeading: 0, dartDist: 0.1,
    swim: 0, // 0 = perched fin posture, 1 = streamlined
    brake: 0,
    pitch: 0.04,
    // fins
    d1: 0.55, d1Goal: 0.55, flick: 0, scull: 0, scullAmp: 0.15, paddle: 0,
    // head
    yawnT: -1, breathDepth: 1,
    // eyes
    eyes: [{ yaw: 0, pitch: 0, gy: 0, gp: 0, timer: 0.4 }, { yaw: 0, pitch: 0, gy: 0, gp: 0, timer: 0.9 }],
    recoilX: 0,
  };

  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const tmp = new THREE.Vector3();

  // ------------------------------------------------------------------ actions
  function dart(dist = rand(0.06, 0.16), angle = null) {
    if (st.mode === 'yawn' || st.mode === 'dart') return;
    // choose a target, biased to stay near the start point
    const back = st.pos.length() > 0.12 ? Math.atan2(-st.pos.x, -st.pos.z) : null;
    let dir = angle ?? (back !== null && Math.random() < 0.7 ? back + rand(-0.6, 0.6) : st.heading + rand(-1.6, 1.6));
    st.targetHeading = dir;
    st.dartDist = dist;
    st.mode = 'orient';
    st.t = 0;
    st.d1Goal = 0.05; // fins up just before take-off
  }
  function yawn() {
    if (st.mode !== 'perch') return;
    st.mode = 'yawn';
    st.t = 0;
  }
  function flick() { st.flick = 1; }
  function paddle() { if (st.mode === 'perch') { st.mode = 'paddle'; st.t = 0; st.targetHeading = st.heading + rand(-0.7, 0.7); } }

  function chooseNext() {
    const r = Math.random();
    if (r < 0.46) dart();
    else if (r < 0.62) yawn();
    else if (r < 0.8) paddle();
    else { flick(); st.mode = 'perch'; st.t = 0; st.next = rand(1.5, 3); }
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    if (st.paused) return;
    dt = Math.min(dt, 1 / 20);
    st.time += dt;
    st.t += dt;

    let swimGoal = 0, brakeGoal = 0, liftGoal = 0, turnGoal = 0;
    switch (st.mode) {
      case 'perch':
        st.speed = damp(st.speed, 0, 6, dt);
        st.d1Goal = 0.55;
        if (st.auto && st.t > st.next) chooseNext();
        break;
      case 'paddle': {
        // small repositioning: alternating pectoral strokes, slight turn, a few mm forward
        const err = wrap(st.targetHeading - st.heading);
        st.heading += clamp(err, -1, 1) * dt * 2.2;
        st.speed = damp(st.speed, 0.008, 4, dt);
        st.paddle = 1;
        if (st.t > 0.9) { st.mode = 'perch'; st.t = 0; st.next = rand(1.2, 3.5); st.paddle = 0; }
        break;
      }
      case 'orient': {
        // quick C-bend toward the target heading, pectorals scull; lasts ~0.18 s
        const err = wrap(st.targetHeading - st.heading);
        turnGoal = clamp(err * 0.55, -0.45, 0.45);
        st.heading += err * (1 - Math.exp(-dt * 16));
        swimGoal = 0.6;
        liftGoal = 0.3;
        if (st.t > 0.16) {
          st.mode = 'dart'; st.t = 0;
          st.freq = rand(7.5, 9.5);
          st.beats = Math.max(2, Math.round(st.dartDist / 0.045 + rand(-0.4, 0.6)));
        }
        break;
      }
      case 'dart': {
        const dur = st.beats / st.freq;
        swimGoal = 1;
        liftGoal = 1;
        const vmax = 0.26 + 0.06 * (st.freq - 8);
        st.speed = damp(st.speed, vmax, 9, dt);
        st.phase += 2 * Math.PI * st.freq * dt;
        st.gain = damp(st.gain, 1, 22, dt);
        const err = wrap(st.targetHeading - st.heading);
        st.heading += err * dt * 3;
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
        if (st.t > 0.55 && st.speed < 0.01) {
          st.mode = 'perch'; st.t = 0; st.next = rand(1.2, 4.5); st.gain = 0;
          if (Math.random() < 0.35) st.flick = 1;
        }
        break;
      }
      case 'yawn': {
        const y = yawnCurves(st.t);
        if (y.done) { st.mode = 'perch'; st.t = 0; st.next = rand(2.5, 5); }
        break;
      }
    }
    st.turn = damp(st.turn, turnGoal, 18, dt);
    st.swim = damp(st.swim, swimGoal, swimGoal > st.swim ? 22 : 6, dt);
    st.brake = damp(st.brake, brakeGoal, 10, dt);
    st.lift = damp(st.lift, liftGoal, liftGoal > st.lift ? 6 : 3, dt);
    if (st.mode !== 'dart' && st.mode !== 'glide') st.gain = damp(st.gain, 0, 10, dt);

    // translation over the floor
    st.pos.x += Math.sin(st.heading) * st.speed * dt;
    st.pos.z += Math.cos(st.heading) * st.speed * dt;

    // ---------------------------------------------------------------- pose
    const p = defaultPose();
    p.phase = st.phase;
    p.gain = st.gain;
    p.turn = st.turn;
    breathe(p, st.time, st.mode === 'dart' ? 0.4 : 1);

    // fins: blend perched props ↔ streamlined ↔ brake
    const sw = st.swim, br = st.brake;
    const perch = 1 - sw;
    p.pecAbdL = p.pecAbdR = 0.5 * perch - 0.36 * sw + 0.4 * br;
    p.pecDepL = p.pecDepR = 0.45 * perch * (1 - br) + 0.15 * br;
    p.foldPecL = p.foldPecR = 0.7 * sw * (1 - br);
    // slow sculling while perched, a paddle stroke when repositioning
    st.scull += dt * 2 * Math.PI * (0.8 + 1.6 * st.paddle);
    p.scullPhase = st.scull;
    p.scullAmpL = p.scullAmpR = (0.14 + 0.5 * st.paddle) * perch;
    if (st.paddle) {
      const stroke = Math.sin(st.scull);
      p.pecAbdL += 0.25 * Math.max(0, stroke);
      p.pecAbdR += 0.25 * Math.max(0, -stroke);
    }
    // turning: the inner pectoral brakes, the outer sculls
    p.pecAbdL += 0.35 * Math.max(0, st.turn);
    p.pecAbdR += 0.35 * Math.max(0, -st.turn);

    st.flick = damp(st.flick, 0, 2.2, dt);
    const flick = Math.sin(Math.min(st.flick, 1) * Math.PI);
    st.d1 = damp(st.d1, st.d1Goal, 10, dt);
    p.foldD1 = clamp(st.d1 * (1 - sw) + 0.12 * sw - 0.6 * flick, 0, 1);
    p.foldD2 = clamp(0.3 * (1 - sw) + 0.05 * sw - 0.3 * flick, 0, 1);
    p.foldAnal = clamp(0.35 * (1 - sw) + 0.1 * sw, 0, 1);
    p.foldCaudal = clamp(0.45 * (1 - sw), 0, 1);
    p.foldPelvic = 0.6 * sw * (1 - br);
    // passive trailing flex of the caudal and median fins lags the lateral tail velocity
    p.flexCaudal = -0.85 * st.gain * Math.cos(st.phase - 2.2) - 0.5 * st.turn;
    p.flexD = -0.35 * st.gain * Math.cos(st.phase - 1.2) - 0.2 * st.turn;

    p.headPitch = 0.035 * perch + 0.05 * st.lift * 0;
    // yawn overrides the head
    if (st.mode === 'yawn') {
      const y = yawnCurves(st.t);
      p.jaw += 0.62 * y.open;
      p.premax += y.open;
      p.hyoid += 0.3 * y.hyoid;
      p.opercL += 0.42 * y.operc;
      p.opercR += 0.42 * y.operc;
      p.headPitch += 0.1 * y.open;
      p.foldD1 *= 1 - y.fins; p.foldD2 *= 1 - y.fins; p.foldAnal *= 1 - y.fins; p.foldCaudal *= 1 - y.fins;
      p.pecAbdL += 0.25 * y.fins; p.pecAbdR += 0.25 * y.fins;
    }

    // eyes: independent saccades (mostly horizontal, ±8°), both lead turns
    for (const [i, eye] of st.eyes.entries()) {
      eye.timer -= dt;
      if (eye.timer <= 0) {
        eye.gy = rand(-0.14, 0.14);
        eye.gp = rand(-0.05, 0.06);
        eye.timer = rand(0.4, 2.6);
      }
      const lead = (i === 0 ? 1 : 1) * st.turn * 0.5;
      eye.yaw = damp(eye.yaw, eye.gy + lead, 30, dt);
      eye.pitch = damp(eye.pitch, eye.gp, 30, dt);
    }
    p.eyeYawL = st.eyes[0].yaw; p.eyePitchL = st.eyes[0].pitch;
    p.eyeYawR = st.eyes[1].yaw; p.eyePitchR = st.eyes[1].pitch;

    apply(computePose(p, axes));
    st.mouthOpen = p.jaw;
    st.gillOpen = Math.max(p.opercL, p.opercR);

    // ---------------------------------------------------------------- root transform
    const pitch = damp(st.pitch, 0.04 * (1 - sw) + 0.0, 5, dt);
    st.pitch = pitch;
    e.set(-pitch, st.heading, 0);
    root.quaternion.setFromEuler(e);
    // keep the pelvic disc (and the tail, when pitched) on the floor; lift a few mm while swimming
    const tailY = tmp.copy(tailContact).applyQuaternion(root.quaternion).y;
    const discY = tmp.copy(contact).applyQuaternion(root.quaternion).y;
    const lowest = Math.min(discY, tailY);
    root.position.set(st.pos.x, floorY - lowest + 0.0028 * st.lift, st.pos.z);
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
    update, dart, yawn, flick, paddle, pose,
    anchor: () => root.position,
    setAuto: (v) => { st.auto = v; },
    setPaused: (v) => { st.paused = v; },
    state: st,
  };
}

export { SPINE };
