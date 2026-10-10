// Behaviour for a pair of butterflyfish: cruise, pick at coral, stay together, and keep
// clear of the glass, the surface, the sand and the rock work.
import * as THREE from 'three';
import { TANK } from './config.js';
import { mulberry32 } from './noise.js';

const BOUNDS = { x: TANK.w / 2 - 0.09, zN: TANK.d / 2 - 0.07, yMin: 0.13, yMax: TANK.level - 0.07 };

export class Butterflyfish {
  // Threadfin butterflyfish behaviour, from field descriptions of Chaetodon auriga and of
  // chaetodontid swimming: a pair roams the reef together; each fish cruises on its pectoral
  // fins with the body held almost straight, speeding up with a short burst of 2-3 tail
  // strokes and then gliding; to feed it stops a snout's length from rock or coral, tips its
  // head down and picks with quick forward jabs (tearing polyps / worms), sculling with the
  // pectorals and the soft dorsal and anal fins; while one of the pair feeds the partner
  // usually hovers close by, watching (coordinated vigilance), then they move on together.
  constructor(model, { scale = 0.11, seed = 1, start = new THREE.Vector3(), leader = null, obstacles = [], surfaces = null }) {
    this.model = model;
    this.rnd = mulberry32(seed);
    this.obj = new THREE.Group();
    this.obj.add(model.group);
    model.group.scale.setScalar(scale);
    model.group.position.x = -0.14 * scale;   // turn about a point ~1/3 back from the snout
    this.scale = scale;
    this.p = start.clone();
    this.yaw = this.rnd() * Math.PI * 2; this.pitch = 0; this.roll = 0;
    this.speed = 0.04;
    this.leader = leader; this.obstacles = obstacles; this.surfaces = surfaces;
    this.target = this.pickTarget();
    this.mode = 'cruise'; this.modeT = 0;
    this.turnRate = 0; this.burst = 0; this.burstCool = 0; this.jab = 0; this.jabT = 0;
    this.t = 0;
    this.ray = new THREE.Raycaster();
  }
  pickTarget() {
    const r = this.rnd;
    return new THREE.Vector3((r() * 2 - 1) * BOUNDS.x * 0.85, 0.2 + r() * (BOUNDS.yMax - 0.2), -0.06 + r() * (BOUNDS.zN + 0.06));
  }
  // a feeding spot: a point on the real rock / coral surface, reached from open water
  pickFeedSpot(near) {
    if (!this.surfaces || !this.obstacles.length) return null;
    if (!this.surfaces.userData.mwReady) { this.surfaces.updateMatrixWorld(true); this.surfaces.userData.mwReady = true; }
    const why = this.why || (this.why = {});
    for (let k = 0; k < 8; k++) {
      const o = near ? this.obstacles.reduce((a, b) => (a.c.distanceTo(near) < b.c.distanceTo(near) ? a : b))
        : this.obstacles[Math.floor(this.rnd() * this.obstacles.length)];
      // look at the rock from the front / above (the side facing open water)
      const dir = new THREE.Vector3((this.rnd() - 0.5) * 1.4, 0.3 + this.rnd() * 0.8, 0.6 + this.rnd() * 0.6).normalize();
      const from = o.c.clone().addScaledVector(dir, o.r + 0.2);
      this.ray.set(from, o.c.clone().sub(from).normalize());
      const hit = this.ray.intersectObject(this.surfaces, true)[0];
      if (!hit || !hit.face) { why.nohit = (why.nohit || 0) + 1; continue; }
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.dot(dir) < 0.2) { why.normal = (why.normal || 0) + 1; continue; }
      const P = hit.point;
      if (P.y < 0.12 || P.y > BOUNDS.yMax - 0.05 || Math.abs(P.x) > BOUNDS.x || P.z > BOUNDS.zN) { why.bounds = (why.bounds || 0) + 1; continue; }
      // approach direction: mostly horizontal-down onto the surface
      const app = n.clone(); app.y = Math.max(app.y, 0.15); app.normalize();
      return { P, n, app };
    }
    return null;
  }
  update(dt) {
    this.t += dt;
    this.modeT -= dt;
    const S = this.scale;
    const fwd = new THREE.Vector3(Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.sin(this.yaw) * Math.cos(this.pitch));
    let goal = this.target.clone(), wantSpeed = 0.035 + 0.02 * Math.sin(this.t * 0.23 + this.yaw), faceDir = null;
    let pecAmp = 1.0, pec = 2.2, scull = 0, finWave = 0.25, brake = 0, pitchBias = 0;

    // ---- decide what to do
    if (this.mode === 'feed') {
      const F = this.feed;
      const station = F.P.clone().addScaledVector(F.app, 0.36 * S + 0.012);     // snout just off the surface
      const toS = station.clone().sub(this.p), dS = toS.length();
      faceDir = F.P.clone().sub(this.p).normalize();
      if (F.phase === 'approach') {
        goal = station; wantSpeed = THREE.MathUtils.clamp(dS * 0.7, 0.004, 0.05);
        if (dS < 0.07) { this.p.addScaledVector(toS, Math.min(1, dt * 1.2)); brake = 0.4 * (1 - dS / 0.07); pecAmp = 0.8; scull = 0.6; }   // final positioning on the pectorals
        if (dS < 0.03) { F.phase = 'pick'; F.picks = 3 + Math.floor(this.rnd() * 6); this.jabT = 0.4; }
        if (this.modeT < 0) this.mode = 'cruise';
      } else {
        // hold station, head down onto the food, and pick
        goal = station; wantSpeed = 0; pecAmp = 0.6; pec = 1.7; scull = 1; finWave = 0.8; brake = 0.3;
        this.p.lerp(station, Math.min(1, dt * 2.5));
        this.jabT -= dt;
        if (this.jabT <= 0 && this.jab <= 0) { this.jab = 1; F.picks--; this.jabT = 0.7 + this.rnd() * 1.1; }
        if (F.picks <= 0 && this.jab <= 0) { this.mode = 'cruise'; this.target = this.pickTarget(); this.modeT = 0; this.burstCool = 0; }
      }
    } else if (this.leader) {
      const L = this.leader;
      if (L.mode === 'feed' && L.feed && L.feed.phase === 'pick') {
        // partner hovers above / beside, watching; now and then picks nearby itself
        if (this.mode !== 'guard') { this.mode = 'guard'; this.modeT = 2 + this.rnd() * 4; this.guardOff = new THREE.Vector3((this.rnd() - 0.5) * 0.12, 0.05 + this.rnd() * 0.04, 0.05 + this.rnd() * 0.05); }
        goal = L.p.clone().add(this.guardOff); wantSpeed = THREE.MathUtils.clamp(goal.distanceTo(this.p) * 0.7, 0.0, 0.05);
        pecAmp = 0.7; pec = 1.6; scull = 0.7; finWave = 0.6;
        faceDir = new THREE.Vector3(Math.sign(this.guardOff.x || 1), -0.05, 0.4).normalize();   // looking out, not at the partner
        if (this.modeT < 0 && this.rnd() < 0.5) { const F = this.pickFeedSpot(L.p); if (F) { this.feed = { ...F, phase: 'approach' }; this.mode = 'feed'; this.modeT = 8; } else this.modeT = 3; }
      } else {
        this.mode = 'follow';
        // stay a body length or so beside / behind the partner
        const off = new THREE.Vector3(-Math.cos(L.yaw), 0, Math.sin(L.yaw)).multiplyScalar(0.18)
          .add(new THREE.Vector3(Math.sin(L.yaw), 0.3, Math.cos(L.yaw)).multiplyScalar(0.1));
        goal = L.p.clone().add(off);
        const dG = goal.distanceTo(this.p);
        wantSpeed = THREE.MathUtils.clamp(L.speed + (dG - 0.03) * 0.5, 0.01, 0.085);   // match the partner's pace, close gaps gently
        // near its station a follower swims parallel to the partner instead of homing on a point
        if (dG < 0.12) this.pSide = goal.clone().sub(this.p).multiplyScalar(Math.min(1, dt * 0.6));   // sidestep with the pectorals
        if (dG < 0.14) { const Lf = new THREE.Vector3(Math.cos(L.yaw), 0, -Math.sin(L.yaw)); goal = this.p.clone().add(Lf.multiplyScalar(0.1)).add(goal.clone().sub(this.p).multiplyScalar(0.6)); }
      }
    } else {
      if (this.p.distanceTo(this.target) < 0.08 || this.modeT < -14) {
        this.modeT = 0;
        const F = this.rnd() < 0.6 ? this.pickFeedSpot() : null;
        if (F) { this.feed = { ...F, phase: 'approach' }; this.mode = 'feed'; this.modeT = 12; }
        else { this.target = this.pickTarget(); this.mode = this.rnd() < 0.25 ? 'hover' : 'cruise'; this.modeT = 2 + this.rnd() * 3; }
      }
      if (this.mode === 'hover') { wantSpeed = 0.006; pecAmp = 0.7; pec = 1.6; scull = 1; finWave = 0.6; if (this.modeT < 0) this.mode = 'cruise'; }
    }

    // ---- steering: seek + avoid (glass, surface, sand, rock, partner)
    const desired = goal.clone().sub(this.p);
    const dist = desired.length();
    desired.normalize();
    const avoid = new THREE.Vector3();
    const wall = (d, n, k = 0.1) => { if (d < k) avoid.addScaledVector(n, Math.pow(1 - d / k, 2) * 3); };
    wall(BOUNDS.x + 0.06 - this.p.x, new THREE.Vector3(-1, 0, 0));
    wall(this.p.x + BOUNDS.x + 0.06, new THREE.Vector3(1, 0, 0));
    wall(BOUNDS.zN + 0.05 - this.p.z, new THREE.Vector3(0, 0, -1), 0.08);
    wall(this.p.z + BOUNDS.zN + 0.05, new THREE.Vector3(0, 0, 1), 0.08);
    wall(BOUNDS.yMax + 0.04 - this.p.y, new THREE.Vector3(0, -1, 0), 0.08);
    wall(this.p.y - BOUNDS.yMin + 0.04, new THREE.Vector3(0, 1, 0), 0.08);
    const feeding = this.mode === 'feed' && this.feed.phase === 'pick';
    for (const o of this.obstacles) {
      if (this.mode === 'feed' && o.c.distanceTo(this.feed.P) < o.r + 0.02 && dist < 0.25) continue;   // the rock it is feeding on
      const d = this.p.distanceTo(o.c) - o.r;
      if (d < 0.08) avoid.addScaledVector(this.p.clone().sub(o.c).normalize(), Math.pow(1 - Math.max(d, 0) / 0.08, 2) * 2.5);
    }
    const other = this.leader || this.partner;
    if (other) {
      const d = this.p.distanceTo(other.p);
      if (d < 0.1) avoid.addScaledVector(this.p.clone().sub(other.p).normalize(), (1 - d / 0.1) * 3);
    }
    const steer = desired.add(avoid).normalize();
    const look = faceDir && (wantSpeed < 0.02 || feeding) ? faceDir : steer;
    const wantYaw = Math.atan2(-look.z, look.x);
    let dy = wantYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    // pectoral turning is slow and smooth; big course changes at speed get a tail kick
    const maxTurn = wantSpeed < 0.02 ? 1.0 : 1.6;
    const tr = THREE.MathUtils.clamp(dy * 2.0, -maxTurn, maxTurn);
    const prevRate = this.turnRate;
    this.turnRate += (tr - this.turnRate) * Math.min(1, dt * 2.2);
    // the body curls into the turn: proportional to the turn rate, with an extra flex while
    // the turn is starting (the head swings first and the tail follows), smoothed so the
    // body lags the heading a little like a real spine
    const yawAcc = (this.turnRate - prevRate) / Math.max(dt, 1e-4);
    const bendT = THREE.MathUtils.clamp(-(this.turnRate * 0.3 + yawAcc * 0.08), -0.42, 0.42);
    this.bend = (this.bend || 0) + (bendT - (this.bend || 0)) * Math.min(1, dt * 4);
    this.yaw += this.turnRate * dt;
    // pitch: level while cruising; tips head-down (up to ~40 deg) to pick at the substrate
    let wantPitch = Math.asin(THREE.MathUtils.clamp(look.y, -1, 1));
    wantPitch = feeding ? THREE.MathUtils.clamp(wantPitch, -0.75, 0.35) : THREE.MathUtils.clamp(wantPitch * 0.6, -0.25, 0.15);
    this.pitch += (wantPitch + pitchBias - this.pitch) * Math.min(1, dt * (feeding ? 2.5 : 1.2));

    // ---- propulsion: pectoral cruising + occasional burst-and-glide with the tail
    this.burstCool -= dt;
    const deficit = wantSpeed - this.speed;
    if (this.burst <= 0 && this.burstCool <= 0 && (deficit > 0.025 || (Math.abs(dy) > 1.2 && this.speed > 0.02))) {
      this.burst = 1; this.burstCool = 2.5 + this.rnd() * 2.5;
    }
    let acc = THREE.MathUtils.clamp(deficit, -0.04, 0.03) * 1.2;
    if (this.burst > 0) { acc += 0.07 * this.burst; this.burst -= dt / 0.9; }   // ~2-3 tail beats
    this.speed = Math.max(0, this.speed + acc * dt);
    if (wantSpeed < 0.01) this.speed *= Math.exp(-dt * 2.5);
    this.p.addScaledVector(fwd, this.speed * dt);
    if (this.pSide) { this.p.add(this.pSide); this.pSide = null; }
    this.p.x = THREE.MathUtils.clamp(this.p.x, -BOUNDS.x - 0.05, BOUNDS.x + 0.05);
    this.p.z = THREE.MathUtils.clamp(this.p.z, -BOUNDS.zN - 0.04, BOUNDS.zN + 0.04);
    this.p.y = THREE.MathUtils.clamp(this.p.y, BOUNDS.yMin - 0.04, BOUNDS.yMax + 0.04);
    // laterally compressed fish bank only slightly into turns
    this.roll += (-this.turnRate * 0.1 - this.roll) * Math.min(1, dt * 2);

    // pick: a quick forward jab and pull-back of the whole fish (~0.25 s), head flicks down
    let jabOff = 0;
    if (this.jab > 0) { this.jab -= dt / 0.28; const k = 1 - Math.max(this.jab, 0); jabOff = Math.sin(k * Math.PI) * 0.18 * S; }

    this.obj.position.copy(this.p).addScaledVector(fwd, jabOff);
    this.obj.rotation.set(0, 0, 0);
    this.obj.rotateY(this.yaw);
    this.obj.rotateZ(this.pitch - (jabOff > 0 ? jabOff / S * 0.35 : 0));
    this.obj.rotateX(this.roll);

    const sp = this.speed / S;     // body lengths per second
    const b = Math.max(this.burst, 0);
    pec = pec * (0.85 + 0.35 * Math.min(sp, 1.2)) + b * 0.4;
    if (b > 0) pecAmp *= 0.5;                                   // fins tucked during a tail burst
    if (jabOff > 0) { brake = Math.max(brake, 0.6); }
    this.model.update(dt, this.t, {
      amp: 0.006 + 0.004 * Math.min(sp, 1) + 0.055 * b * b,     // body nearly rigid except in bursts
      freq: 1.0 + 2.2 * b,
      turn: this.bend,
      pec, pecAmp, scull, finWave, brake,
    });
  }
}

// Fire goby, from field and aquarium observations of Nemateleotris: it hovers a few cm above
// its burrow facing into the current, head a little up, holding station with constant fast
// pectoral fanning while the body and tail stay almost still; every few seconds it snaps at a
// passing particle - a sudden 1-2 tail-beat lunge of a few cm, then it sculls back tail-first
// to its station; it flicks the tall flag down and up as a signal (often several times in a
// row), lays it back during fast moves, repositions with short bursts, and when startled
// dives head-first into the burrow, waits, then creeps out again.
export class HoveringGoby {
  constructor(model, { home, scale = 0.075, seed = 5 }) {
    this.model = model; this.rnd = mulberry32(seed);
    this.obj = new THREE.Group(); this.obj.add(model.group); model.group.scale.setScalar(scale);
    model.group.position.x = -0.3 * scale;
    this.scale = scale;
    this.home = home.clone();                       // burrow mouth on the sand
    this.station = home.clone().add(new THREE.Vector3(0, 0.035, 0));
    this.p = this.station.clone(); this.v = new THREE.Vector3();
    this.face = -Math.PI * 0.5 + (this.rnd() < 0.5 ? -1 : 1) * (0.9 + this.rnd() * 0.4);   // facing out toward the front glass (the "current"), three-quarter on
    this.yaw = this.face; this.yawRate = 0; this.pitch = 0.12; this.t = 0;
    this.mode = 'hover'; this.modeT = 1 + this.rnd() * 2;
    this.burst = 0; this.kick = 0; this.flickT = 0; this.flickN = 0; this.nextFlick = 2 + this.rnd() * 4; this.fold = 0;
    this.phaseN = this.rnd() * 100;
  }
  fwd() { return new THREE.Vector3(Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.sin(this.yaw) * Math.cos(this.pitch)); }
  update(dt) {
    const r = this.rnd, S = this.scale;
    this.t += dt; this.modeT -= dt;
    const n = (k) => Math.sin(this.t * k + this.phaseN) + 0.5 * Math.sin(this.t * k * 2.3 + this.phaseN * 1.7);
    let wantYaw = this.face + 0.25 * n(0.13), wantPitch = 0.12 + 0.05 * n(0.21);
    let pec = 3.2, pecAmp = 1.0, fold = 0, flare = 0, goal = this.station, kp = 6.0;
    const f = this.fwd();

    if (this.mode === 'hover') {
      // station keeping: tiny drift, slow yaw wander; occasionally pick a new station nearby
      goal = this.station.clone().add(new THREE.Vector3(0.004 * n(0.4), 0.003 * n(0.33), 0.004 * n(0.27)));
      if (this.modeT < 0) {
        const x = r();
        if (x < 0.55) {            // snap at plankton ahead and a little above
          this.mode = 'lunge'; this.modeT = 0.35;
          this.snap = this.p.clone().add(f.clone().multiplyScalar(0.03 + r() * 0.03)).add(new THREE.Vector3((r() - 0.5) * 0.02, 0.005 + r() * 0.015, (r() - 0.5) * 0.02));
          this.yaw += (r() - 0.5) * 0.4; this.burst = 1;
        } else if (x < 0.85) {     // reposition a little
          this.station = this.home.clone().add(new THREE.Vector3((r() - 0.5) * 0.05, 0.025 + r() * 0.04, (r() - 0.5) * 0.04));
          this.mode = 'move'; this.modeT = 2.5; this.burst = 0.7;
        } else if (x < 0.88) {     // startled: dive into the burrow
          this.mode = 'dive'; this.modeT = 3 + r() * 3; this.burst = 1;
        } else this.modeT = 1 + r() * 2;
        if (this.mode === 'hover') this.modeT = 1.5 + r() * 3;
      }
    } else if (this.mode === 'lunge') {
      goal = this.snap; kp = 60; fold = 0.8; pecAmp = 0.4;
      wantYaw = Math.atan2(-(this.snap.z - this.p.z), this.snap.x - this.p.x);
      if (this.modeT < 0) { this.mode = 'return'; this.modeT = 1.2; this.nextFlick = Math.min(this.nextFlick, 0.4); }
    } else if (this.mode === 'return') {
      // scull back to the station without turning round (pectorals backing, tail still)
      goal = this.station; kp = 4; pec = 4.0; pecAmp = 1.3; flare = 0.6;
      if (this.modeT < 0) { this.mode = 'hover'; this.modeT = 1.5 + r() * 3.5; }
    } else if (this.mode === 'move') {
      goal = this.station; kp = 8; fold = 0.4;
      const d = this.station.clone().sub(this.p); if (d.length() > 0.01) wantYaw = Math.atan2(-d.z, d.x);
      if (this.modeT < 0 || d.length() < 0.006) { this.mode = 'hover'; this.modeT = 1 + r() * 3; }
    } else if (this.mode === 'dive') {
      // head-first down into the burrow (the fish disappears into the rubble), then creeps out
      goal = this.home.clone().add(new THREE.Vector3(0, -0.02, 0)); kp = 30; fold = 1; wantPitch = -1.2;
      if (this.p.distanceTo(goal) < 0.01) this.obj.visible = false;
      if (this.modeT < 0) { this.mode = 'emerge'; this.modeT = 4; this.obj.visible = true; }
    } else if (this.mode === 'emerge') {
      goal = this.station; kp = 1.5; wantPitch = 0.5; fold = 0.3 * this.modeT / 4; pec = 2.5;
      if (this.modeT < 0) { this.mode = 'hover'; this.modeT = 2 + r() * 3; }
    }

    // flag flicks: quick fold-and-raise, often in runs of 2-4
    this.nextFlick -= dt;
    if (this.nextFlick <= 0 && this.mode !== 'dive') { this.flickN = 1 + Math.floor(r() * 3); this.flickT = 0; this.nextFlick = 3 + r() * 7; }
    if (this.flickN > 0) { this.flickT += dt; const ph = this.flickT / 0.28; fold = Math.max(fold, Math.sin(Math.min(ph, 1) * Math.PI) * 0.9); if (ph >= 1) { this.flickN--; this.flickT = 0; } }

    // dynamics: position servo (thrust from pectorals / tail) with water drag
    const err = goal.clone().sub(this.p);
    const acc = err.multiplyScalar(kp).addScaledVector(this.v, -2 * Math.sqrt(kp) * 0.9);
    if (this.burst > 0) { if (this.burst >= 0.99 || (this.burst >= 0.69 && this.kick <= 0)) this.kick = 1; acc.addScaledVector(f, 0.35 * this.burst); this.burst = Math.max(0, this.burst - dt / 0.22); }
    this.kick = Math.max(0, this.kick - dt / 0.38);   // visible tail stroke outlasts the thrust
    this.v.addScaledVector(acc, dt);
    this.p.addScaledVector(this.v, dt);
    const floor = this.home.y + 0.012; if (this.mode !== 'dive' && this.p.y < floor) { this.p.y = floor; this.v.y = Math.max(0, this.v.y); }

    // pivoting on the pectorals: quick but damped yaw, no banking of this small fish
    let dy = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw));
    const prevRate = this.yawRate;
    this.yawRate += (THREE.MathUtils.clamp(dy * 6, -5, 5) - this.yawRate) * Math.min(1, dt * 10);
    this.yaw += this.yawRate * dt;
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * (this.mode === 'dive' ? 8 : 3));

    this.obj.position.copy(this.p);
    this.obj.rotation.set(0, this.yaw, 0);
    this.obj.rotateZ(this.pitch);

    const sp = this.v.length() / S, b = Math.max(this.burst, 0), k = this.kick;
    const moving = this.mode === 'move' || this.mode === 'dive' || this.mode === 'emerge';
    this.model.update(dt, this.t, {
      amp: 0.007 + 0.09 * Math.sin(Math.min(k, 1) * Math.PI) + (moving ? 0.025 * Math.min(sp, 1.5) : 0),   // faint sculling; one or two strong strokes in a burst
      freq: 1.6 + 3.6 * (k > 0 ? 1 : 0) + (moving ? 1.6 : 0),
      turn: THREE.MathUtils.clamp(-this.yawRate * 0.05, -0.15, 0.15),
      pec: pec + (moving ? 0.8 : 0), pecAmp: k > 0.3 ? 0.25 : pecAmp, fold, flare,
    });
  }
}

// Strawberry conch: rests on the sand and makes the occasional leap along its heading.
export class SandConch {
  constructor(model, { pos, heading = 0, scale = 0.06, sandHeight, bounds = 0.45 }) {
    this.model = model; this.sandHeight = sandHeight; this.bounds = bounds;
    this.obj = new THREE.Group(); this.obj.add(model.group); model.group.scale.setScalar(scale);
    model.group.position.set(-0.55 * scale, 0.19 * scale, 0);      // settled a little into the sand
    // contact shadow: soft dark ellipse where the shell and foot press into the sand
    this.obj.add(SandConch.contactShadow(scale));
    this.p = pos.clone(); this.heading = heading; this.t = 0;
  }
  static contactShadow(scale) {
    if (!SandConch._tex) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      SandConch._tex = new THREE.CanvasTexture(c);
    }
    const m = new THREE.MeshBasicMaterial({ map: SandConch._tex, transparent: true, depthWrite: false, color: 0x0a0806, polygonOffset: true, polygonOffsetFactor: -2 });
    m.userData.caustic = true;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    d.rotation.x = -Math.PI / 2; d.scale.set(1.25 * scale, 0.75 * scale, 1); d.position.set(0.0, 0.0008, -0.03 * scale);
    d.renderOrder = 1; d.castShadow = false; d.receiveShadow = false;
    return d;
  }
  update(dt) {
    this.t += dt;
    this.model.update(dt, this.t);
    const step = this.model.group.userData.stepDist || 0;
    if (step > 0) {
      this.p.x += Math.cos(this.heading) * step * 0.06; this.p.z -= Math.sin(this.heading) * step * 0.06;
      if (Math.abs(this.p.x) > this.bounds || this.p.z > 0.22 || this.p.z < 0.02) this.heading += Math.PI * 0.6;
    }
    this.p.y = this.sandHeight(this.p.x, this.p.z);
    this.obj.position.copy(this.p);
    this.obj.rotation.set(0, this.heading, 0);
  }
}
