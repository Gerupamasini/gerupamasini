// Behaviour of one イシガレイ juvenile on the sandy mudflat.
//
// Modes (state.mode) and what they look like:
//  BOTTOM_REST     lies flat on the blind side, the margins and fins pressed onto the sediment, the body
//                  draped over the ripples; only the gill covers (≈70/min), the independently moving eyes and
//                  now and then a ripple running along the dorsal and anal fins. After landing it settles:
//                  a few small decaying undulations and a flutter of the fins bed it into the sand.
//                  When something approaches it freezes (presses flat, eyes on the observer, pectoral up).
//  GLIDE_SWIM      leaves the bottom head first with a couple of shallow strokes and a puff of sand, then
//                  travels 0.5–1.5 cm above the bottom mostly by waves running back along the long dorsal
//                  and anal fins (the body almost still), with an occasional short burst of low tail
//                  strokes, banking a little in turns; it flares the fins, slows, and settles.
//  BURROW_IN_SAND  2–4 bursts of rapid, small undulations of the whole body with the fins fluttering: the
//                  sediment under the margins is fluidised and thrown over the fins and the back, the fish
//                  sinks a little with each burst; finally only the eyes on their turrets and part of the
//                  outline show. It stays buried for a while and leaves with a shake, sand sliding off.
//  FORAGE          scans with the eyes and the head raised, creeps (fin-driven, just above the bottom)
//                  towards a small crustacean, stops and aims — head up, both eyes on the prey — then lunges
//                  with the head going down: a fast suction gape and a small cloud of silt; chews and flushes
//                  sand from the gill openings. With nothing in sight it nips at the sediment.
//  ESCAPE          a vertical C-start: strong tail strokes lift it steeply off the bottom in a cloud of sand,
//                  a short fast dash (≈ 3–6 BL) close to the bottom, a glide, a hard landing and usually an
//                  immediate burial — or it freezes where it landed.
//
// The behaviour writes a pose (root transform, spine bends, fin-ray angles, jaw, gill covers, eyes, burial)
// that applyPose (./rig.js) applies to the skeleton. It only needs `world` for the ground, threats, neighbours,
// prey and silt, so it runs without any rendering (tests/unit/ishigarei.test.ts).
import * as THREE from 'three';
import { SPINE, S_ROOT, TL_MM, FINS, EYES, thickBot } from './anatomy.js';

export const MODES = ['BOTTOM_REST', 'GLIDE_SWIM', 'BURROW_IN_SAND', 'FORAGE', 'ESCAPE'];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const M = 0.001;

// bones of the bending chain (spine), in order from the head
const CHAIN = SPINE.map(([n, s]) => ({ name: n, s }));
const TIP_S = TL_MM;
const Y_ROOT = thickBot(S_ROOT); // blind-side half thickness at the origin (mm)
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qa = new THREE.Quaternion();
const REST_GAZE = EYES.map((e) => new THREE.Vector3(...e.gaze).normalize());
const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0), _az = new THREE.Vector3(0, 0, 1);

export function createFlounderBehavior(opts) {
  const { world } = opts;
  const rng = opts.rng ?? Math.random;
  const rand = (a, b) => a + rng() * (b - a);
  const K = opts.scale ?? 1;
  const BL = TL_MM * M * K;
  const home = opts.home ?? { x: opts.start.x, z: opts.start.z };
  // in the game the brain chooses what to do next (intents); on its own (tests, viewers) the fish decides itself
  const autonomous = opts.autonomous ?? true;
  const range = opts.range ?? 0.2;
  const pers = { bold: rand(0.85, 1.2), buryLike: rand(0.7, 1.3), roam: rand(0.8, 1.2), ...(opts.personality || {}) };

  const st = {
    mode: 'BOTTOM_REST', phase: 'rest', t: 0, next: rand(3, 9), idle: true,
    pos: new THREE.Vector3(opts.start.x, 0, opts.start.z),
    heading: opts.start.heading ?? 0, speed: 0, turn: 0,
    lift: 0, liftGoal: 0, pitch: 0, roll: 0, headLift: 0, headGoal: 0,
    bury: opts.startBuried ? 0.9 : 0, buryGoal: opts.startBuried ? 0.9 : 0,
    swimAmp: 0, swimAmpGoal: 0, swimFreq: 3, swimPh: 0,
    finAmp: 0, finAmpGoal: 0, finFreq: 3, finPh: 0, finDroop: -0.1, flutter: 0,
    curl: 0, curlGoal: 0,
    jaw: 0, premax: 0, chew: 0,
    breathPh: rand(0, 6.28), breathRate: rand(1.05, 1.3), breathAmp: 0.55, breath: 0,
    pecE: 0.05, pecEGoal: 0.05, pelvic: 0,
    eyes: [0, 1].map(() => ({ dir: null, goal: null, t: rand(0.2, 2), raise: 0, raiseGoal: 0 })),
    fear: 0, refractory: 0, alertT: 0, risk: 0, threatPos: null,
    hunger: rand(0.3, 0.8),
    target: null, prey: null, bursts: 0, burstT: 0, nextBurst: 0, ripple: -1, rippleT: rand(5, 15),
    floorY: 0, sink: 0, settle: 0,
    hidden: false, inPath: false, fast: false, buried: !!opts.startBuried,
    lastRest: null,
  };
  if (st.buried) { st.mode = 'BURROW_IN_SAND'; st.phase = 'buried'; st.next = rand(10, 50); }

  // ---------------------------------------------------------------------------------------- world helpers
  const ground = (x, z) => world.ground(x, z);
  const fwd = (h = st.heading) => _v2.set(Math.sin(h), 0, Math.cos(h));
  /** world point of the fish frame (s, x) on the ground plane of the fish (ignores bending) */
  function planPoint(s, x, out = new THREE.Vector3()) {
    const f = (S_ROOT - s) * M * K, d = x * M * K;
    const sh = Math.sin(st.heading), ch = Math.cos(st.heading);
    // dorsal (+x) direction = forward rotated so that the eyed side faces up: (cos h, 0, −sin h)
    out.set(st.pos.x + sh * f + ch * d, 0, st.pos.z + ch * f - sh * d);
    out.y = ground(out.x, out.z);
    return out;
  }
  // disturbed sediment: fine silt into the scene's puffs (lingers), coarse sand into the spray (falls back)
  function silt(s, x, n, size = 1, vel = null, up = 0) {
    const p = planPoint(s, x);
    p.y += 0.0008;
    const v = vel ? vel.clone() : new THREE.Vector3();
    v.y += up;
    if (world.silt) world.silt(p, v, n * K, size * K);
    if (opts.spray && size >= 1) opts.spray(p, v.multiplyScalar(0.6), n * K * 1.6, size * 0.75);
  }
  /** sand thrown up along the margins (burying, take-off, landing) */
  function siltMargins(n, size = 1, up = 0.01, outward = 0.01) {
    const pts = [[10, -9], [20, -12.5], [30, -12.5], [42, -9.5], [52, -5.5], [12, 8.5], [22, 12.5], [34, 11.5], [46, 7.5], [60, 0]];
    for (const [s, x] of pts) {
      const out = planPoint(s, x).sub(planPoint(s, 0)).setY(0).normalize().multiplyScalar(outward);
      silt(s, x * 1.12, n / pts.length, size, out, up);
    }
  }
  function others() { return world.others ? world.others(api) : []; }
  function homeDist(x, z) { return Math.hypot(x - home.x, z - home.z); }
  /** choose a spot to swim to: within the home range, open sediment, away from other fish and holes */
  function pickSpot(dist, dir = null, spread = 1.2) {
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 28; i++) {
      const a = (dir ?? st.heading) + rand(-spread, spread) * (dir === null && i > 14 ? 2.5 : 1);
      const d = dist * rand(0.7, 1.25);
      const x = st.pos.x + Math.sin(a) * d, z = st.pos.z + Math.cos(a) * d;
      let s = -Math.max(0, homeDist(x, z) - range) * 40;
      for (const o of others()) {
        const dd = Math.hypot(x - o.pos.x, z - o.pos.z);
        s -= 4 * Math.exp(-((dd / (0.7 * (BL + (o.bl || BL)))) ** 2));
      }
      if (world.holeAt && world.holeAt(x, z, 0.5 * BL)) s -= 6;
      // slope: flatfish prefer level sediment
      if (world.normal) s += 2 * (world.normal(x, z, 0.5 * BL, _n).y - 1);
      if (world.sand) s += 0.6 * world.sand(x, z);
      s += rand(0, 0.4);
      if (s > bestScore) { bestScore = s; best = { x, z }; }
    }
    return best;
  }
  function restTime(k = 1) { return k * (rng() < 0.2 ? rand(25, 60) : rand(5, 22)); }

  // ---------------------------------------------------------------------------------------- transitions
  function setMode(mode, phase, t = 0) {
    st.mode = mode; st.phase = phase; st.t = t;
    st.idle = mode === 'BOTTOM_REST' && phase === 'rest';
  }
  function setPhase(phase) { st.phase = phase; st.t = 0; st.idle = st.mode === 'BOTTOM_REST' && phase === 'rest'; }

  function startGlide(spot = null) {
    st.target = spot ?? pickSpot(rand(1.8, 4.5) * BL * pers.roam);
    st.cruise = rand(0.55, 1.1) * BL;
    st.cruiseH = rand(0.005, 0.013) * Math.max(0.8, K);
    setMode('GLIDE_SWIM', 'lift');
    st.fast = false;
    if (st.bury > 0.2) emergeSand();
    silt(16, 0, 12, 1.4, null, 0.012);
    siltMargins(22, 1.3, 0.014);
  }
  function startBurrow() {
    setMode('BURROW_IN_SAND', 'prep');
    st.bursts = 2 + Math.floor(rng() * 3);
    st.buryGoal = clamp(st.bury, 0, 1);
    st.buryMax = rand(0.82, 0.97);
    st.lastRest = null;
  }
  function startForage() {
    setMode('FORAGE', 'search');
    st.searchT = rand(1.0, 3.0);
    st.prey = null;
    st.fast = false;
  }
  function escape(from) {
    st.fast = true;
    st.refractory = 3.5;
    let away = rand(-Math.PI, Math.PI);
    if (from) away = Math.atan2(st.pos.x - from.x, st.pos.z - from.z) + rand(-0.6, 0.6);
    // stay roughly at home: bend the escape back towards the range
    const dHome = homeDist(st.pos.x, st.pos.z);
    if (dHome > range * 0.8) away = wrap(away + 0.6 * wrap(Math.atan2(home.x - st.pos.x, home.z - st.pos.z) - away));
    st.escDir = away;
    st.escLen = rand(3, 6) * BL;
    setMode('ESCAPE', 'burst');
    // explosive take-off: a big cloud from under the body, more when buried
    const buried = st.bury;
    silt(18, 0, 30 + 40 * buried, 2.4, null, 0.045);
    silt(40, 0, 20 + 30 * buried, 2.2, null, 0.04);
    siltMargins(70 + 90 * buried, 2.2, 0.04, 0.035);
    st.bury = Math.min(st.bury, 0.3);
    st.buryGoal = 0;
    st.lastRest = { x: st.pos.x, z: st.pos.z, h: st.heading, t: 0 };
    if (world.alarm) world.alarm(api, st.pos, 0.35);
  }
  function emergeSand() {
    silt(18, 0, 10 + 24 * st.bury, 1.7, null, 0.024);
    siltMargins(16 + 40 * st.bury, 1.7, 0.022, 0.01);
  }
  function touchDown(strength = 1) {
    siltMargins(26 * strength, 1.5, 0.01, 0.018);
    silt(20, 0, 8 * strength, 1.3, null, 0.006);
    st.lastRest = null;
  }

  // ---------------------------------------------------------------------------------------- perception
  function perceive(dt) {
    st.refractory = Math.max(0, st.refractory - dt);
    let risk = 0;
    const thr = world.threat ? world.threat() : null;
    st.threatPos = null;
    if (thr) {
      _v.set(st.pos.x, st.floorY + 0.004, st.pos.z);
      const rel = _v2.subVectors(thr.pos, _v);
      const d = Math.max(rel.length(), 0.005);
      const closing = Math.max(0, -rel.dot(thr.vel) / d);
      const loom = (0.05 * closing) / (d * d);
      risk = smooth((loom - 1.5) / 5) + 0.6 * smooth((1.7 * BL - d) / (1.2 * BL));
      // buried, it relies on its camouflage and lets the observer come closer
      risk *= 1 - 0.45 * st.bury;
      if (d < 3 * BL) st.threatPos = thr.pos;
    }
    // a goby landing on it, or swimming into it
    for (const o of others()) {
      if (o.hidden) continue;
      const d = Math.hypot(o.pos.x - st.pos.x, o.pos.z - st.pos.z);
      if (d < 0.32 * BL && st.mode !== 'ESCAPE') risk = Math.max(risk, 0.75 * (1 - st.bury * 0.4));
    }
    st.risk = risk;
    st.fear = st.fear + (risk - st.fear) * (1 - Math.exp(-(risk > st.fear ? 6 : 0.3) * dt));
    if (risk > 0.2) st.alertT = Math.max(st.alertT, 2.5);
    st.alertT = Math.max(0, st.alertT - dt);
    if (st.fear > 0.58 * pers.bold && st.refractory <= 0 && st.mode !== 'ESCAPE') escape(thr ? thr.pos : null);
  }

  // ---------------------------------------------------------------------------------------- eyes
  function updateEyes(dt) {
    // each eye moves on its own: quick saccades between fixations; both lock on to prey or the observer
    const lockOn = st.mode === 'FORAGE' && st.prey ? st.prey.pos : st.threatPos && st.alertT > 0 ? st.threatPos : null;
    st.eyes.forEach((e, i) => {
      e.t -= dt;
      if (lockOn) {
        e.goal = toLocalDir(_v.subVectors(lockOn, st.pos), e.goal || new THREE.Vector3());
      } else if (e.t <= 0) {
        e.t = st.mode === 'FORAGE' ? rand(0.25, 0.9) : rand(0.6, 3.2);
        // a new fixation within ±30° of the resting gaze
        e.goal = (e.goal || new THREE.Vector3()).copy(REST_GAZE[i]).add(_v.set(rand(-0.5, 0.5), rand(-0.15, 0.25), rand(-0.45, 0.45))).normalize();
      }
      const raise = st.mode === 'BURROW_IN_SAND' && st.phase === 'buried' ? 0.35 : st.alertT > 0 ? 0.2 : st.mode === 'ESCAPE' ? -0.35 : 0;
      e.raise = damp(e.raise, raise, 6, dt);
    });
  }
  function toLocalDir(worldDir, out) {
    // world → model frame of the fish (heading only; good enough for aiming the eyes)
    const c = Math.cos(st.heading), s = Math.sin(st.heading);
    return out.set(worldDir.x * c - worldDir.z * s, worldDir.y, worldDir.x * s + worldDir.z * c).normalize();
  }

  // ---------------------------------------------------------------------------------------- modes
  function steer(goalHeading, rate, dt) {
    const d = wrap(goalHeading - st.heading);
    const w = clamp(d * rate, -rate * 1.2, rate * 1.2);
    st.turn = damp(st.turn, w, 6, dt);
    st.heading = wrap(st.heading + st.turn * dt);
  }

  function updateRest(dt) {
    st.liftGoal = 0;
    st.speed = damp(st.speed, 0, 6, dt);
    st.turn = damp(st.turn, 0, 5, dt);
    if (st.phase === 'settle') {
      // decaying small undulations and a flutter of the marginal fins bed the fish in
      const k = 1 - smooth(st.t / 1.0);
      st.swimAmpGoal = 1.1 * k; st.swimFreq = 5.5;
      st.finAmpGoal = 0.22 * k; st.finFreq = 7;
      st.pecEGoal = 0.25 * k + 0.05;
      if (st.t > 0.45 && !st.settled2) { st.settled2 = true; siltMargins(4, 0.7, 0.004, 0.006); }
      if (st.t > 1.0) { setPhase('rest'); st.next = restTime(); st.settled2 = false; }
      return;
    }
    // rest / freeze
    st.swimAmpGoal = 0;
    st.finAmpGoal = 0;
    st.pecEGoal = st.alertT > 0 ? 0.45 : 0.05;
    st.headGoal = 0;
    // occasional fin ripple
    st.rippleT -= dt;
    if (st.rippleT <= 0 && st.alertT <= 0) { st.ripple = 0; st.rippleT = rand(6, 22); }
    if (st.ripple >= 0) {
      st.ripple += dt;
      st.finAmpGoal = 0.18 * Math.sin(Math.PI * clamp(st.ripple / 0.9, 0, 1));
      st.finFreq = 3.5;
      if (st.ripple > 0.9) st.ripple = -1;
    }
    // a small shuffle now and then (re-bedding, turning a little)
    if (st.alertT <= 0 && rng() < dt * 0.025) {
      st.shuffle = { t: 0, dh: rand(-0.35, 0.35), dist: rand(0.003, 0.009) * K };
    }
    if (st.shuffle) {
      const s = st.shuffle;
      s.t += dt;
      const k = Math.sin(Math.PI * clamp(s.t / 0.7, 0, 1));
      st.heading = wrap(st.heading + s.dh * dt / 0.7);
      st.speed = s.dist / 0.7 * 1.5 * k;
      st.finAmpGoal = 0.25 * k; st.finFreq = 6;
      st.liftGoal = 0.0006 * k;
      if (s.t > 0.7) { st.shuffle = null; siltMargins(3, 0.6, 0.003, 0.005); }
    }
    if (st.alertT > 0) { st.next = Math.max(st.next, st.t + 2); return; }
    if (autonomous && st.t > st.next) {
      const prey = world.prey ? world.prey.near(st.pos.x, st.pos.z, 3.5 * BL) : [];
      const r = rng();
      if (prey.length && st.hunger > 0.25 && r < 0.6) startForage();
      else if (r < 0.35 * pers.roam) startGlide();
      else if (r < 0.62) startBurrow();
      else if (r < 0.8) startForage();
      else { st.t = 0; st.next = restTime(0.7); }
    }
  }

  function updateGlide(dt) {
    const T = st.target;
    const dx = T.x - st.pos.x, dz = T.z - st.pos.z;
    const dist = Math.hypot(dx, dz);
    const goalH = Math.atan2(dx, dz);
    switch (st.phase) {
      case 'lift': {
        // head first off the bottom, two shallow strokes
        st.headGoal = 0.13;
        st.liftGoal = st.cruiseH;
        st.swimAmpGoal = 1.8 * K; st.swimFreq = 4.2;
        st.finAmpGoal = 0.25; st.finFreq = 4;
        st.pecEGoal = 0.35;
        st.speed = damp(st.speed, st.cruise * 0.5, 3, dt);
        steer(goalH, 2.2, dt);
        if (st.t > 0.5) setPhase('cruise');
        break;
      }
      case 'cruise': {
        st.headGoal = 0.02;
        st.liftGoal = st.cruiseH + 0.002 * Math.sin(st.t * 1.3);
        steer(goalH + 0.25 * Math.sin(st.t * 0.9 + st.cruise * 100), 1.6, dt);
        // mostly fin-driven: waves along the dorsal and anal fins; short low tail bursts when slow
        st.finAmpGoal = 0.3; st.finFreq = 3.4;
        st.pecEGoal = 0.12;
        if (!st.kick && st.speed < st.cruise * 0.65) st.kick = { t: 0, n: rng() < 0.5 ? 2 : 3 };
        if (st.kick) {
          st.kick.t += dt;
          st.swimAmpGoal = 2.4 * K; st.swimFreq = 4.6;
          st.speed += st.cruise * 1.1 * dt;
          if (st.kick.t > st.kick.n / st.swimFreq) st.kick = null;
        } else {
          st.swimAmpGoal = 0.35 * K; st.swimFreq = 3.4;
          // gliding: the fins keep a slow cruise, drag does the rest
          st.speed = damp(st.speed, st.cruise * 0.7, 0.5, dt);
        }
        if (dist < 1.1 * BL) setPhase('descend');
        if (st.t > 12) setPhase('descend');
        break;
      }
      case 'descend': {
        st.kick = null;
        st.headGoal = -0.02;
        st.swimAmpGoal = 0.2 * K;
        st.finAmpGoal = 0.22; st.finFreq = 6;
        st.pecEGoal = 0.4;
        st.speed = damp(st.speed, 0, 1.8, dt);
        st.liftGoal = 0;
        steer(goalH, 1.0, dt);
        if (st.lift < 0.0006 && st.speed < 0.012) {
          touchDown(1);
          setMode('BOTTOM_REST', 'settle');
        }
        break;
      }
    }
  }

  function updateBurrow(dt) {
    st.speed = damp(st.speed, 0, 6, dt);
    st.liftGoal = 0;
    switch (st.phase) {
      case 'prep':
        st.swimAmpGoal = 0; st.finAmpGoal = 0.05;
        st.pecEGoal = 0.1;
        if (st.t > 0.25) { setPhase('dig'); st.burstLen = rand(0.35, 0.55); }
        break;
      case 'dig': {
        // rapid small undulations; the fins flutter and throw sand over the back
        const k = Math.sin(Math.PI * clamp(st.t / st.burstLen, 0, 1));
        st.swimAmpGoal = 1.0 * K * k; st.swimFreq = 11;
        st.finAmpGoal = 0.4 * k; st.finFreq = 12;
        st.flutter = k;
        st.curlGoal = 0.04 * Math.sin(st.t * 23);
        st.buryGoal = Math.min(st.buryMax, st.buryGoal + dt * (st.buryMax / (st.bursts * st.burstLen)) * 1.15);
        if (!st.puffed && st.t > st.burstLen * 0.3) { st.puffed = true; siltMargins(34, 1.7, 0.028, 0.006); silt(60, 0, 5, 1.3, null, 0.016); }
        if (st.t > st.burstLen) {
          st.puffed = false; st.bursts--; st.flutter = 0; st.curlGoal = 0;
          setPhase(st.bursts > 0 ? 'pause' : 'covered');
          st.pauseLen = rand(0.25, 0.7);
        }
        break;
      }
      case 'pause':
        st.swimAmpGoal = 0; st.finAmpGoal = 0.04;
        if (st.t > st.pauseLen) { setPhase('dig'); st.burstLen = rand(0.3, 0.5); }
        break;
      case 'covered':
        // the last sand settles
        st.swimAmpGoal = 0; st.finAmpGoal = 0;
        st.buryGoal = st.buryMax;
        if (st.t > 0.8) { setPhase('buried'); st.next = st.buriedFor ?? rand(15, 80) * pers.buryLike; st.buriedFor = undefined; st.buried = true; }
        break;
      case 'buried':
        st.pecEGoal = 0;
        st.swimAmpGoal = 0; st.finAmpGoal = 0;
        if (st.t > st.next) {
          // occasionally foraging from the burrow, otherwise leave
          const prey = world.prey ? world.prey.near(st.pos.x, st.pos.z, 2.5 * BL) : [];
          if (prey.length && rng() < 0.5) { emergeSand(); st.buryGoal = 0; st.buried = false; startForage(); }
          else setPhase('emerge');
        }
        break;
      case 'emerge':
        st.headGoal = 0.12 * Math.sin(Math.PI * clamp(st.t / 0.7, 0, 1));
        st.swimAmpGoal = 1.5 * K * Math.sin(Math.PI * clamp(st.t / 0.7, 0, 1)); st.swimFreq = 5;
        st.finAmpGoal = 0.25; st.finFreq = 6;
        st.buryGoal = 0;
        if (!st.puffed) { st.puffed = true; emergeSand(); }
        if (st.t > 0.7) {
          st.puffed = false; st.buried = false;
          if (autonomous && rng() < 0.6) startGlide(); else setMode('BOTTOM_REST', 'settle');
        }
        break;
    }
  }

  function snout(out = new THREE.Vector3()) { return planPoint(-0.5, 0, out); }

  function updateForage(dt) {
    st.buryGoal = 0;
    switch (st.phase) {
      case 'search': {
        st.headGoal = 0.07; st.pecEGoal = 0.3;
        st.swimAmpGoal = 0; st.finAmpGoal = 0.05; st.liftGoal = 0;
        st.speed = damp(st.speed, 0, 4, dt);
        const prey = world.prey ? world.prey.near(st.pos.x, st.pos.z, 3.5 * BL) : [];
        // only what lies in front, within the visual field of the two eyes
        let best = null, bd = 1e9;
        for (const p of prey) {
          const a = wrap(Math.atan2(p.pos.x - st.pos.x, p.pos.z - st.pos.z) - st.heading);
          if (Math.abs(a) > 2.0) continue;
          const d = Math.hypot(p.pos.x - st.pos.x, p.pos.z - st.pos.z) * (1 + 0.4 * Math.abs(a));
          if (d < bd) { bd = d; best = p; }
        }
        if (best && st.t > 0.4) { st.prey = best; setPhase('approach'); break; }
        if (st.t > st.searchT) {
          // nothing seen: nip at the sediment just in front (polychaete palps, siphons), or give up
          if (rng() < 0.55) { st.prey = { pos: planPoint(-0.2 * TL_MM, rand(-6, 6)).clone(), alive: true, fake: true }; setPhase('aim'); }
          else setMode('BOTTOM_REST', 'rest');
          st.next = restTime(0.6);
        }
        break;
      }
      case 'approach': {
        const p = st.prey;
        if (!p.alive) { setPhase('search'); st.prey = null; break; }
        const sn = snout(_v);
        const d = Math.hypot(p.pos.x - sn.x, p.pos.z - sn.z);
        const goalH = Math.atan2(p.pos.x - st.pos.x, p.pos.z - st.pos.z);
        steer(goalH, 2.4, dt);
        // creeping just above the bottom on the marginal fins
        st.liftGoal = 0.0018 * K;
        st.headGoal = 0.05;
        st.finAmpGoal = 0.24; st.finFreq = 4.5;
        st.swimAmpGoal = 0.25 * K; st.swimFreq = 3;
        const facing = Math.cos(wrap(goalH - st.heading));
        st.speed = damp(st.speed, 0.45 * BL * clamp(facing, 0, 1) * clamp(d / (0.6 * BL), 0.3, 1), 3, dt);
        if (d < 0.32 * BL && Math.abs(wrap(goalH - st.heading)) < 0.35) setPhase('aim');
        if (st.t > 8) setPhase('search');
        break;
      }
      case 'aim': {
        // stop, head up, both eyes on the prey
        st.speed = damp(st.speed, 0, 8, dt);
        st.liftGoal = 0;
        st.headGoal = 0.15;
        st.finAmpGoal = 0.04;
        st.swimAmpGoal = 0;
        steer(Math.atan2(st.prey.pos.x - st.pos.x, st.prey.pos.z - st.pos.z), 3, dt);
        if (st.t > (st.aimT ??= rand(0.3, 0.7))) { st.aimT = undefined; setPhase('strike'); st.struck = false; }
        break;
      }
      case 'strike': {
        // lunge: the body lifts a little and the head goes down onto the prey; a fast suction gape
        const t = st.t;
        st.headGoal = -0.06;
        st.liftGoal = 0.0015 * K;
        st.swimAmpGoal = 1.4 * K; st.swimFreq = 7;
        const sn = snout(_v);
        const d = Math.hypot(st.prey.pos.x - sn.x, st.prey.pos.z - sn.z);
        st.speed = t < 0.1 ? Math.min(0.6 * BL * 4, d / 0.08 + 0.2 * BL) : damp(st.speed, 0, 12, dt);
        st.jaw = t < 0.045 ? smooth(t / 0.045) : 1 - smooth((t - 0.045) / 0.09);
        st.premax = st.jaw;
        if (!st.struck && t > 0.05) {
          st.struck = true;
          silt(-1, 0, 5, 0.7, null, 0.006);
          if (!st.prey.fake && world.prey && d < 0.22 * BL) { world.prey.take(st.prey); st.hunger = Math.max(0, st.hunger - 0.25); }
          st.prey.alive = false;
        }
        if (t > 0.2) { setPhase('handle'); st.jaw = 0; }
        break;
      }
      case 'handle': {
        // chewing / winnowing; sand flushed out from under the gill cover on the blind side
        st.speed = damp(st.speed, 0, 6, dt);
        st.headGoal = 0.02;
        st.swimAmpGoal = 0;
        st.jaw = 0.22 * Math.max(0, Math.sin(st.t * 15)) * (st.t < 0.9 ? 1 : 0);
        st.breathAmp = 1;
        if (!st.flushed && st.t > 0.6) { st.flushed = true; silt(14, -6, 4, 0.6, null, 0.004); }
        if (st.t > 1.1) {
          st.flushed = false; st.breathAmp = 0.55; st.jaw = 0;
          const more = world.prey ? world.prey.near(st.pos.x, st.pos.z, 3 * BL).length : 0;
          if (more && rng() < 0.65 && st.hunger > 0.1) startForage();
          else { setMode('BOTTOM_REST', 'rest'); st.next = restTime(); }
        }
        break;
      }
    }
  }

  function updateEscape(dt) {
    switch (st.phase) {
      case 'burst': {
        // vertical C-start: strong tail strokes, the fish leaves the bottom steeply
        st.headGoal = 0.25;
        st.swimAmpGoal = 7.5 * K; st.swimFreq = 9.5;
        st.finAmpGoal = 0.3; st.finFreq = 9;
        st.pecEGoal = 0.0;
        st.liftGoal = rand(0.018, 0.03);
        steer(st.escDir, 9, dt);
        st.speed = damp(st.speed, 5.5 * BL, 18, dt);
        if (st.t > 0.14) setPhase('dash');
        break;
      }
      case 'dash': {
        st.headGoal = 0.05;
        st.swimAmpGoal = 6 * K; st.swimFreq = 9;
        steer(st.escDir, 3, dt);
        st.speed = damp(st.speed, 5 * BL, 6, dt);
        st.escLen -= st.speed * dt;
        st.liftGoal = Math.max(0.006, st.liftGoal - dt * 0.02);
        if (st.escLen < 1.5 * BL || st.t > 0.9) setPhase('glide');
        break;
      }
      case 'glide': {
        st.headGoal = 0;
        st.swimAmpGoal = 0.5 * K;
        st.finAmpGoal = 0.2; st.finFreq = 5;
        st.speed = damp(st.speed, 0.4 * BL, 2.5, dt);
        st.liftGoal = 0.003;
        if (st.t > 0.55) setPhase('land');
        break;
      }
      case 'land': {
        st.headGoal = -0.03;
        st.swimAmpGoal = 0.3 * K;
        st.finAmpGoal = 0.25; st.finFreq = 8;
        st.pecEGoal = 0.35;
        st.speed = damp(st.speed, 0, 3, dt);
        st.liftGoal = 0;
        if (st.lift < 0.0007 && st.speed < 0.02) {
          touchDown(1.4);
          st.fast = false;
          if (rng() < 0.7 * pers.buryLike) startBurrow();
          else { setMode('BOTTOM_REST', 'settle'); st.alertT = 6; }
        }
        break;
      }
    }
  }

  // least-squares slopes of the ground along and across the body → its normal
  const FIT_S = [2, 12, 22, 32, 42, 52], FIT_X = [-9, 9];
  function fitGround(out) {
    let sw = 0, ss = 0, sh = 0, ssh = 0, sss = 0;
    for (const s of FIT_S) {
      const h = planPoint(s, 0, _v).y, d = (S_ROOT - s) * M * K;
      sw++; ss += d; sh += h; ssh += d * h; sss += d * d;
    }
    const along = (sw * ssh - ss * sh) / Math.max(sw * sss - ss * ss, 1e-12);
    const hl = planPoint(20, FIT_X[0], _v).y, hr = planPoint(20, FIT_X[1], _v).y;
    const across = (hr - hl) / ((FIT_X[1] - FIT_X[0]) * M * K);
    const sh2 = Math.sin(st.heading), ch2 = Math.cos(st.heading);
    // forward (sin h, 0, cos h), dorsal (cos h, 0, −sin h): n = up − along·forward − across·dorsal
    return out.set(-along * sh2 - across * ch2, 1, -along * ch2 + across * sh2).normalize();
  }

  // ---------------------------------------------------------------------------------------- integration
  const pose = {
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
    bend: Object.fromEntries(CHAIN.map((c) => [c.name, 0])),
    curl: Object.fromEntries(CHAIN.map((c) => [c.name, 0])),
    dorsal: new Float32Array(FINS.dorsal.bones), anal: new Float32Array(FINS.anal.bones),
    pecE: 0, pecB: 0, pelvic: 0, jaw: 0, premax: 0, breath: 0,
    eyes: REST_GAZE.map((g) => ({ dir: g.clone(), raise: 0 })),
    bury: 0, lift: 0, sink: 0, floorY: 0,
  };
  const _D = new Float64Array(CHAIN.length + 1);
  const _S = new Float64Array(CHAIN.length + 1);
  CHAIN.forEach((c, i) => { _S[i] = c.s; });
  _S[CHAIN.length] = TIP_S;

  function update(dt) {
    dt = Math.min(dt, 1 / 20);
    st.t += dt;
    perceive(dt);
    st.hunger = Math.min(1, st.hunger + dt * 0.004);
    switch (st.mode) {
      case 'BOTTOM_REST': updateRest(dt); break;
      case 'GLIDE_SWIM': updateGlide(dt); break;
      case 'BURROW_IN_SAND': updateBurrow(dt); break;
      case 'FORAGE': updateForage(dt); break;
      case 'ESCAPE': updateEscape(dt); break;
    }
    if (st.mode !== 'BURROW_IN_SAND' && st.mode !== 'ESCAPE') st.buryGoal = st.mode === 'BOTTOM_REST' ? Math.min(st.buryGoal, st.bury) : 0;
    updateEyes(dt);

    // ---- smooth the drives
    st.swimAmp = damp(st.swimAmp, st.swimAmpGoal, st.swimAmpGoal > st.swimAmp ? 14 : 5, dt);
    st.finAmp = damp(st.finAmp, st.finAmpGoal, 8, dt);
    st.headLift = damp(st.headLift, st.headGoal, 7, dt);
    st.curl = damp(st.curl, st.curlGoal, 10, dt);
    st.pecE = damp(st.pecE, st.pecEGoal, 6, dt);
    st.bury = damp(st.bury, st.buryGoal, st.buryGoal > st.bury ? 3 : 5, dt);
    st.lift = damp(st.lift, st.liftGoal, st.liftGoal > st.lift ? 4 : 3, dt);
    st.swimPh += 2 * Math.PI * st.swimFreq * dt;
    st.finPh += 2 * Math.PI * st.finFreq * dt;
    st.breathPh += 2 * Math.PI * st.breathRate * (1 + 0.8 * st.fear + (st.mode === 'ESCAPE' ? 0.6 : 0)) * dt;
    st.breath = -0.15 + (0.5 + 0.5 * Math.sin(st.breathPh)) * st.breathAmp * (1 - 0.4 * st.bury);

    // ---- move
    const f = fwd();
    st.pos.x += f.x * st.speed * dt;
    st.pos.z += f.z * st.speed * dt;
    // a tank or a case: turn back from its walls
    const bx = opts.bounds && opts.bounds();
    if (bx) {
      const m = 0.45 * BL;
      const cx = clamp(st.pos.x, bx.minX + m, bx.maxX - m), cz = clamp(st.pos.z, bx.minZ + m, bx.maxZ - m);
      if (cx !== st.pos.x || cz !== st.pos.z) {
        st.pos.x = cx; st.pos.z = cz;
        if (st.mode === 'GLIDE_SWIM' || st.mode === 'ESCAPE') { st.heading = wrap(st.heading + Math.PI * 0.6); st.speed *= 0.5; }
      }
    }
    // ground under the body: on the bottom the fish drapes over the ripples; off it, it clears the highest
    // point under its outline
    const onGround = 1 - smooth(st.lift / 0.004);
    const g0 = ground(st.pos.x, st.pos.z);
    let gRef = g0;
    if (onGround < 1) {
      const gh = planPoint(4, 0, _v).y, gt = planPoint(54, 0, _v).y;
      gRef = Math.max(g0, (1 - onGround) * Math.max(gh, gt) + onGround * g0);
    }
    // stay in the water: on a falling tide the fish may not rise above what is left of it
    if (world.waterY) {
      const room = world.waterY(st.pos.x, st.pos.z) - g0 - 2 * Y_ROOT * M * K - 0.004;
      st.liftGoal = Math.min(st.liftGoal, Math.max(0, room));
      st.lift = Math.min(st.lift, Math.max(0, room + 0.002));
    }
    st.sink = st.bury * 0.75 * Y_ROOT * M * K;
    st.floorY = g0 - st.sink;
    st.pos.y = gRef + Y_ROOT * M * K + st.lift - st.sink;
    st.hidden = st.bury > 0.75;

    // ---- orientation: aligned with the sediment on the bottom, level (with pitch and bank) when swimming
    // on the bottom the body lies on the plane that fits the ground under all of it (a local normal would tilt
    // with whichever ripple the middle of the fish sits on); off it, it levels out
    if (onGround > 0.01) fitGround(_n); else _n.set(0, 1, 0);
    _n.lerp(_up, 1 - onGround).normalize();
    const pitchGoal = st.mode === 'GLIDE_SWIM' || st.mode === 'ESCAPE' ? clamp((st.liftGoal - st.lift) * 30, -0.25, 0.35) : 0;
    st.pitch = damp(st.pitch, pitchGoal, 4, dt);
    st.roll = damp(st.roll, clamp(-st.turn * 0.12, -0.3, 0.3) * (1 - onGround), 4, dt);
    _q.setFromUnitVectors(_up, _n);
    _q2.setFromAxisAngle(_ay, st.heading);
    pose.quat.copy(_q).multiply(_q2);
    pose.quat.multiply(_qa.setFromAxisAngle(_ax, -st.pitch));
    pose.quat.multiply(_qa.setFromAxisAngle(_az, st.roll));
    pose.pos.copy(st.pos);

    // ---- bending: swimming wave + draping over the ground (world vertical = lateral flexion of the fish)
    const amp = st.swimAmp * M * K;
    const lambda = 0.95 * TIP_S;
    // contact plane through the ground under the origin (normal _n); lifting off is a root translation
    const px = st.pos.x, pz = st.pos.z, ny = Math.max(_n.y, 0.3);
    const yPlane0 = st.pos.y - Y_ROOT * M * K - st.lift;
    for (let i = 0; i <= CHAIN.length; i++) {
      const s = _S[i];
      const env = s < 10 ? 0.06 : 0.06 + 0.94 * ((s - 10) / (TIP_S - 10)) ** 2;
      let D = amp * env * Math.sin(st.swimPh - (2 * Math.PI * s) / lambda);
      if (onGround > 0) {
        const p = planPoint(Math.min(s, 64), 0, _v);
        const yPlane = yPlane0 - (_n.x * (p.x - px) + _n.z * (p.z - pz)) / ny;
        const want = (p.y - st.sink) - yPlane + (thickBot(Math.min(s, 57.5)) - Y_ROOT) * M * K;
        D += onGround * clamp(want, -0.006 * K, 0.006 * K);
      }
      _D[i] = D;
    }
    // segment angles (posterior direction); J_root turns the trunk segment (J_root → J_sp1), every other
    // joint bends by the difference to the segment in front of it
    const segA = (i) => Math.atan2(_D[i + 1] - _D[i], (_S[i + 1] - _S[i]) * M * K);
    const a0 = segA(1);
    pose.bend.J_root = a0;
    pose.bend.J_head = segA(0) - a0 - st.headLift;
    let prev = a0;
    for (let i = 2; i < CHAIN.length; i++) {
      const a = segA(i);
      pose.bend[CHAIN[i].name] = a - prev;
      prev = a;
    }
    for (const c of CHAIN) pose.curl[c.name] = 0;
    pose.curl.J_sp2 = st.curl; pose.curl.J_sp4 = -st.curl * 0.7; pose.curl.J_sp6 = st.curl * 0.5;

    // ---- marginal fins: travelling waves, flutter, droop onto the sand at rest
    // at rest the fins are pressed onto the sediment; burying, they go down into it
    const droop = -0.12 * onGround + 0.05 * (1 - onGround) - 0.45 * st.bury;
    const finWave = (arr, n, phase0) => {
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1);
        const env = Math.sin(Math.PI * (0.08 + 0.9 * u)) ** 0.7;
        const noise = st.flutter > 0 ? 0.35 * st.flutter * Math.sin(st.finPh * 1.37 + k * 2.1) : 0;
        arr[k] = droop + st.finAmp * env * (Math.sin(st.finPh - 2 * Math.PI * 1.6 * u + phase0) + noise);
      }
    };
    finWave(pose.dorsal, pose.dorsal.length, 0);
    finWave(pose.anal, pose.anal.length, 0.6);
    // buried, the pectoral is folded down against the body, under the sand
    pose.pecE = st.pecE + (st.mode === 'GLIDE_SWIM' ? 0.08 * Math.sin(st.finPh) : 0) - 0.3 * st.bury;
    pose.pecB = -0.05 - 0.15 * (1 - onGround);
    pose.pelvic = 0.1 * (1 - onGround) + 0.15 * st.finAmp;
    pose.jaw = clamp(st.jaw, 0, 1);
    pose.premax = clamp(st.premax, 0, 1);
    if (st.phase !== 'strike') st.premax = damp(st.premax, 0, 10, dt);
    pose.breath = st.breath;
    st.eyes.forEach((e, i) => {
      pose.eyes[i].raise = e.raise;
      if (e.goal) pose.eyes[i].dir.lerp(e.goal, 1 - Math.exp(-dt * 22)).normalize();
    });
    pose.bury = st.bury;
    pose.lift = st.lift;
    pose.sink = st.sink;
    pose.floorY = st.floorY;
    st.mouthOpen = pose.jaw;
    st.gillOpen = Math.max(0, st.breath);
    return pose;
  }

  // start on the ground (settle the height and orientation)
  st.pos.y = ground(st.pos.x, st.pos.z) + Y_ROOT * M * K;

  const api = {
    update, escape: (from) => escape(from), glide: (spot) => startGlide(spot), forage: () => startForage(),
    /** bury and stay buried for about `seconds` */
    burrow: (seconds) => {
      if (st.mode === 'BURROW_IN_SAND' && st.phase === 'buried') { st.next = st.t + (seconds ?? rand(15, 80)); return; }
      startBurrow();
      if (seconds) st.buriedFor = seconds;
    },
    rest: (seconds) => {
      if (st.mode === 'BURROW_IN_SAND' && st.phase === 'buried') { st.next = Math.max(st.next, st.t + (seconds ?? 10)); return; }
      if (st.mode !== 'BOTTOM_REST') setMode('BOTTOM_REST', 'settle');
      st.next = seconds ?? restTime();
    },
    /** freeze where it lies, eyes on the threat (alert display) */
    freeze: (seconds) => { st.alertT = Math.max(st.alertT, seconds ?? 4); if (st.mode !== 'BURROW_IN_SAND') { if (st.mode !== 'BOTTOM_REST') setMode('BOTTOM_REST', 'settle'); } },
    /** done with what it was asked to do: lying (or buried) quietly */
    get settled() { return (st.mode === 'BOTTOM_REST' && st.phase === 'rest') || (st.mode === 'BURROW_IN_SAND' && st.phase === 'buried'); },
    anchor: () => st.pos,
    // another fish threatened us (goby display): give way along the bottom
    threatened: (from) => {
      if (st.mode === 'ESCAPE') return;
      st.fear = Math.max(st.fear, 0.35);
      const away = Math.atan2(st.pos.x - from.state.pos.x, st.pos.z - from.state.pos.z);
      startGlide(pickSpot(rand(1.2, 2.5) * BL, away, 0.6));
    },
    alarm: (strength) => { st.fear = Math.min(1, st.fear + strength * (1 - 0.4 * st.bury)); },
    state: st, pose, species: 'ishigarei', bl: BL, size: BL, home, range,
    get pos() { return st.pos; },
    get hidden() { return st.hidden; },
  };
  return api;
}
