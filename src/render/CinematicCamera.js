// Cinematic auto-camera: a small "director" that picks a subject fish and a
// shot type, holds it for a few seconds and cuts to the next one — tracking
// profile, three-quarter head close-up, low angle against the surface (thin
// parts glow), tail follow, top view through the water surface, and a slow
// dolly along the front glass. The camera follows a heavily smoothed pose of
// the subject (the body's own yaw oscillation is filtered out), adds a faint
// hand-held drift, keeps inside the water volume, and drives the lens focus.
//
// Camera operator rules (the guard): the camera never enters or grazes a
// fish, rock or plant, keeps a working distance from the subject, and keeps
// a clear line of sight to the subject's eye. When the planned framing breaks
// a rule the operator first re-frames (orbits around the subject, dollies
// out, raises / lowers the camera); if nothing works it cuts to another
// subject or shot. Focus snaps to the subject on every cut and then racks
// with a critically damped follow (no hunting / overshoot).

import * as THREE from 'three';
import { TANK } from '../world/TankConfig.js';
import { groundHeight } from '../world/Substrate.js';
import { noise1 } from '../core/random.js';

// fStop: full-frame-equivalent relative aperture. Subjects are 0.2–0.4 m
// away (magnification ≈ 0.1–0.3), where f/8–f/11 keeps a whole fish sharp
// and still melts the back of the tank. minDist: closest allowed camera
// distance in standard lengths (from the body centre; head34 from the head).
const SHOTS = [
  { type: 'profile', w: 3, dur: [7, 10], fov: 30, fStop: 8, minDist: 2.3 },
  { type: 'head34', w: 3, dur: [6, 8], fov: 25, fStop: 11, minDist: 1.5 },
  { type: 'low', w: 2, dur: [6, 8], fov: 34, fStop: 8, minDist: 2.0 },
  { type: 'tail', w: 2, dur: [6, 8], fov: 32, fStop: 8, minDist: 2.2 },
  { type: 'track', w: 3, dur: [7, 10], fov: 32, fStop: 8, minDist: 2.3 },
  { type: 'above', w: 1, dur: [6, 8], fov: 34, fStop: 8, minDist: 0 },
  { type: 'wide', w: 2, dur: [8, 11], fov: 34, fStop: 11, minDist: 0 },
];

// re-framing candidates (orbit about the subject in radians, dolly factor,
// vertical shift in SL), cheapest first by construction of the cost
const ORBITS = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.4, -2.4, Math.PI];
const DOLLY = [1, 1.2, 1.45];
const LIFTS = [0, 0.6, -0.5];

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _o = new THREE.Vector3();
const _a = new THREE.Vector3();
const _q = new THREE.Vector3();
const _g = new THREE.Vector3();
const _p = new THREE.Vector3();
const _l = new THREE.Vector3();
const _eye = new THREE.Vector3();
// scratch for the pane footprint / framing tests (pos / look may be _p / _l)
const _f1 = new THREE.Vector3();
const _f2 = new THREE.Vector3();
const _f3 = new THREE.Vector3();
const _f4 = new THREE.Vector3();
const _f5 = new THREE.Vector3();

const clamp = THREE.MathUtils.clamp;

export class CinematicDirector {
  constructor(app) {
    this.app = app;
    this.shot = null;
    this.t = 0;
    this.subject = null;
    this.recent = [];
    this.focus = 1;
    this.focusVel = 0;
    this.targetVel = 0;
    this.lastTarget = 1;
    this.fStop = 8;
    this.pose = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0) };
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.first = true;
    // guard state: the current re-framing and its bookkeeping
    this.frame = { orbit: 0, dist: 1, lift: 0 };
    this.frameT = 0; // time since the framing was last evaluated
    this.badT = 0; // how long the current framing has been invalid
    this.closeT = 0; // how long the subject has been too close to the actual camera
    this._axes = new Map(); // per-frame cache of fish axes
  }

  // ------------------------------------------------------------ geometry
  /** Forward axis of a fish for this frame (cached: Locomotion.forward allocates). */
  _axis(f) {
    let a = this._axes.get(f);
    if (!a) {
      a = f.loc.forward;
      this._axes.set(f, a);
    }
    return a;
  }

  /**
   * Distance from p to the surface of a fish, modelled as a capsule from the
   * snout to the tail fork whose radius grows over the (bending, spreading)
   * caudal fin. Negative inside.
   */
  _fishDist(p, f) {
    const SL = f.SL;
    const ax = this._axis(f);
    _a.subVectors(p, f.loc.pos);
    const s = clamp(_a.dot(ax), -1.4 * SL, 0.38 * SL);
    const r = s < -0.6 * SL ? THREE.MathUtils.lerp(0.13, 0.32, (-0.6 * SL - s) / (0.8 * SL)) * SL : 0.14 * SL;
    _a.addScaledVector(ax, -s);
    return _a.length() - r;
  }

  /** Clearance from the tank walls, gravel, surface, rocks and plant clumps (m). */
  _decorDist(p) {
    const w = this.app.world;
    // outside the front glass (shooting through it): only the pane matters
    if (p.z > TANK.D / 2) return p.z - TANK.D / 2 - TANK.glass;
    let d = w.distance(p, _g, { softPlants: false });
    // the rock meshes bulge up to ~20 % beyond their avoidance ellipsoids
    for (const c of w.colliders) {
      if (c.type !== 'ellipsoid') continue;
      _q.subVectors(p, c.center).divide(c.radii);
      const l = _q.length();
      d = Math.min(d, (l - 1.2) * Math.min(c.radii.x, c.radii.y, c.radii.z));
    }
    return d;
  }

  /** Something solid between a and b (rocks, dense plant clumps, other fish)? */
  _occluded(a, b, subject) {
    const w = this.app.world;
    const fish = this.app.fishSystem.fish;
    const n = 14;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      _q.lerpVectors(a, b, t);
      for (const c of w.colliders) {
        if (c.type === 'ellipsoid') {
          _p.subVectors(_q, c.center).divide(c.radii);
          if (_p.length() < 0.98) return true;
        } else if (c.type === 'cylinder') {
          // a few thin blades in front are fine (and photographic); the
          // dense core of a clump is not
          if (_q.y < groundHeight(_q.x, _q.z) + c.height * 0.8 && Math.hypot(_q.x - c.center.x, _q.z - c.center.z) < c.radius * 0.6) return true;
        }
      }
      if (t > 0.9) continue; // the subject itself
      for (const o of fish) if (o !== subject && this._fishDist(_q, o) < 0) return true;
    }
    return false;
  }

  /** The subject's eye nearest to the camera (focus and line-of-sight target). */
  _eyeOf(f, camPos, out) {
    // the iris of the nearer eye on the deformed rig (falls back to an
    // estimate from the head position)
    if (this.app.eyeTarget && f.rig) return this.app.eyeTarget(f, camPos, out);
    const ax = this._axis(f);
    f.headPosition(out).addScaledVector(ax, -f.SL * 0.1);
    _o.set(-ax.z, 0, ax.x);
    if (_o.lengthSq() < 1e-8) return out;
    _o.normalize();
    _a.subVectors(camPos, out);
    return out.addScaledVector(_o, (_a.dot(_o) >= 0 ? 1 : -1) * f.SL * 0.07);
  }

  _inside(sh = this.shot) {
    return sh && sh.type !== 'wide' && sh.type !== 'above';
  }

  // ------------------------------------------------------------ choices
  _pickSubject(rng, exclude = null, def = null) {
    const fish = this.app.fishSystem.fish;
    if (!fish.length) return null;
    let best = null;
    let bs = -Infinity;
    for (const f of fish) {
      if (exclude && exclude.has(f)) continue;
      const p = f.loc.pos;
      // prefer active, well-lit fish away from walls, bottom and the last subjects
      const wall = Math.min(TANK.L / 2 - Math.abs(p.x), TANK.D / 2 - Math.abs(p.z));
      const st = f.brain ? f.brain.state : '';
      let s = Math.min(wall, 0.12) * 8 + Math.min(p.y - groundHeight(p.x, p.z), 0.12) * 4;
      s += Math.min(f.loc.speed / f.SL, 1.2) * 0.8;
      // a fish with its head down in the gravel or steeply pitched makes an
      // awkward portrait (pebbles over the eye, nose-down silhouette)
      const fy = f.loc.forward.y;
      const head = f.headPosition(_q);
      if (head.y - groundHeight(head.x, head.z) < 0.45 * f.SL) s -= 1.0;
      if (Math.abs(fy) > 0.5) s -= 1.2;
      // the low angle needs water (and the surface) above the subject
      if (def && def.type === 'low') s += clamp((p.y - 0.26) / 0.08, -1, 1) * 1.2;
      if (st === 'rest' || st === 'freeze') s -= 0.8;
      if (this.recent.includes(f)) s -= 1.2;
      s += rng.next() * 0.9;
      if (s > bs) {
        bs = s;
        best = f;
      }
    }
    return best;
  }

  _pickShot(rng) {
    if (this.first) {
      this.first = false;
      return SHOTS.find((s) => s.type === 'wide');
    }
    const prev = this.shot ? this.shot.type : '';
    const pool = SHOTS.filter((s) => s.type !== prev);
    const tot = pool.reduce((a, s) => a + s.w, 0);
    let r = rng.next() * tot;
    for (const s of pool) if ((r -= s.w) <= 0) return s;
    return pool[0];
  }

  _setPose(f) {
    this.pose.pos.copy(f.loc.pos);
    this.pose.fwd.copy(f.loc.forward).setY(0);
    if (this.pose.fwd.lengthSq() < 1e-6) this.pose.fwd.set(1, 0, 0);
    this.pose.fwd.normalize();
  }

  cut(subject = null, type = null, len = null) {
    const rng = this.app.rng;
    this._axes.clear();
    const def = (type && SHOTS.find((x) => x.type === type)) || (this.forceType && SHOTS.find((x) => x.type === this.forceType)) || this._pickShot(rng);
    const tried = new Set();
    let chosen = null;
    let f = subject || this._pickSubject(rng, null, def) || this.subject;
    // find a subject this shot can be framed on (a few tries), else fall back
    // to the wide shot from outside the glass
    for (let k = 0; k < 5 && f; k++) {
      tried.add(f);
      this.subject = f;
      this.shot = { ...def, len: len ?? def.dur[0] + rng.next() * (def.dur[1] - def.dur[0]), side: rng.next() < 0.5 ? 1 : -1, seed: rng.next() * 100 };
      this.t = 0;
      this._setPose(f);
      this.frame = { orbit: 0, dist: 1, lift: 0 };
      if (this._search(true)) {
        chosen = f;
        break;
      }
      if (subject) break; // an explicit subject (yawn close-up): don't swap fish
      f = this._pickSubject(rng, tried, def);
    }
    if (!chosen && !this.forceType && def.type !== 'wide') return this.cut(subject || this.subject, 'wide');
    if (!chosen && !this.subject) return;
    this.recent.push(this.subject);
    if (this.recent.length > 3) this.recent.shift();
    this._desired(this.camPos, this.camLook);
    this.app.camera.fov = this.shot.fov;
    this.app.camera.updateProjectionMatrix();
    this.snap = true;
    this.badT = 0;
    this.closeT = 0;
    this.blockT = 0;
    this.frameT = 0;
  }

  // ------------------------------------------------------------ framing
  // desired camera position / look-at for the current shot and re-framing
  _desired(pos, look, fr = this.frame) {
    const f = this.subject;
    const sh = this.shot;
    const P = this.pose.pos;
    const fwd = this.pose.fwd;
    const SL = f ? f.SL : 0.1;
    // side vector toward the viewer (front glass) unless the shot flips it
    const side = _v.set(-fwd.z, 0, fwd.x);
    if (side.z < 0) side.negate();
    if (sh.type === 'tail' || sh.type === 'low') side.multiplyScalar(sh.side > 0 ? 1 : 0.6).normalize();
    const up = _w.set(0, 1, 0);
    const k = this.t / sh.len; // 0..1 through the shot (slow push-ins / arcs)
    switch (sh.type) {
      case 'profile':
        pos.copy(P).addScaledVector(side, SL * (3.4 - 0.5 * k)).addScaledVector(fwd, SL * 0.2).addScaledVector(up, SL * 0.35);
        look.copy(P).addScaledVector(fwd, -SL * 0.25);
        break;
      case 'head34':
        // three-quarter view of the head from ~2 SL (a longer lens from
        // further away: same framing, more depth of field)
        pos.copy(P).addScaledVector(fwd, SL * (1.55 - 0.15 * k)).addScaledVector(side, SL * 1.45).addScaledVector(up, SL * 0.25);
        look.copy(P).addScaledVector(fwd, SL * 0.2);
        break;
      case 'low':
        // below the fish, looking up some 35°: the underside of the surface
        // (its mirror and the rippled edge of Snell's window, softly lit by
        // the hood light) closes the top of the frame; framings that would
        // show the lamp itself are rejected by the guard
        pos.copy(P).addScaledVector(side, SL * 1.9).addScaledVector(up, -SL * 1.05).addScaledVector(fwd, SL * (0.4 - 0.8 * k));
        look.copy(P).addScaledVector(up, SL * 0.45).addScaledVector(fwd, -SL * 0.15);
        break;
      case 'tail':
        pos.copy(P).addScaledVector(fwd, -SL * 2.3).addScaledVector(side, SL * 1.5).addScaledVector(up, SL * 0.45);
        look.copy(P).addScaledVector(fwd, -SL * 0.8);
        break;
      case 'track':
        pos.copy(P).addScaledVector(side, SL * 2.6).addScaledVector(fwd, SL * (-1.0 + 1.4 * k)).addScaledVector(up, SL * 0.15);
        look.copy(P).addScaledVector(fwd, SL * 0.1);
        break;
      case 'above':
        // held between the hood light bar (~13 cm above the water) and the surface
        pos.copy(P).addScaledVector(side, SL * 0.6).setY(TANK.water + 0.1);
        look.copy(P);
        break;
      case 'wide':
      default: {
        const x = THREE.MathUtils.lerp(-0.18, 0.18, sh.side > 0 ? k : 1 - k);
        pos.set(x, 0.24, 1.0 - 0.1 * k);
        look.set(x * 0.6, 0.2, 0);
        break;
      }
    }
    // re-framing chosen by the guard: orbit about the vertical through the
    // look point, dolly out along the view axis, raise / lower
    if (sh.type !== 'wide' && fr) {
      _o.subVectors(pos, look);
      if (fr.orbit) _o.applyAxisAngle(UP, fr.orbit);
      _o.multiplyScalar(fr.dist);
      if (sh.type !== 'above') _o.y += fr.lift * SL;
      pos.copy(look).add(_o);
    }
    // portrait screens: back off so a horizontal fish still fits the frame
    const inside = this._inside(sh);
    const aspect = this.app.camera.aspect || 1.6;
    if (inside && aspect < 1.2) pos.sub(look).multiplyScalar(Math.min(1.9, 1.2 / aspect)).add(look);
    // stay inside the water (or outside the front glass / above the surface)
    this._guardMiss = 0;
    if (inside) {
      this._clampCam(pos, 0.03);
      this._guardMiss = this._glassGuard(pos, look, sh.fov, 1.2 * SL);
    } else if (sh.type === 'above') {
      pos.x = clamp(pos.x, -TANK.L / 2 + 0.05, TANK.L / 2 - 0.05);
      pos.z = clamp(pos.z, -TANK.D / 2 + 0.05, TANK.D / 2 - 0.05);
    }
  }

  /**
   * Lowest point of the image on the front pane for a camera outside the
   * glass (the gravel layer's cut face and the rim frame lie below the
   * gravel line there), and the horizontal extent of the image on the pane.
   * Returns null when the camera is inside the water.
   */
  _paneFootprint(pos, look, fov, out = { minY: 0, minX: 0, maxX: 0, gTop: 0 }) {
    if (pos.z <= TANK.D / 2) return null;
    const cam = this.app.camera;
    const aspect = cam.aspect || 1.6;
    const fwd = _f1.subVectors(look, pos).normalize();
    const right = _f2.crossVectors(fwd, UP);
    if (right.lengthSq() < 1e-8) return null;
    right.normalize();
    const upv = _f3.crossVectors(right, fwd);
    const th = Math.tan(THREE.MathUtils.degToRad(fov) * 0.5);
    const tw = th * aspect;
    const zp = TANK.D / 2;
    out.minY = Infinity;
    out.minX = Infinity;
    out.maxX = -Infinity;
    out.gTop = 0;
    for (const sy of [-1, 1]) {
      for (const sx of [-1, 0, 1]) {
        // ray through an image corner / edge midpoint
        _f4.copy(fwd).addScaledVector(right, sx * tw).addScaledVector(upv, sy * th);
        if (_f4.z > -1e-4) continue; // never reaches the pane
        const t = (zp - pos.z) / _f4.z;
        const x = pos.x + _f4.x * t;
        const y = pos.y + _f4.y * t;
        out.minX = Math.min(out.minX, x);
        out.maxX = Math.max(out.maxX, x);
        if (sy < 0) {
          out.minY = Math.min(out.minY, y);
          out.gTop = Math.max(out.gTop, groundHeight(clamp(x, -TANK.L / 2, TANK.L / 2), zp - 0.005));
        }
      }
    }
    return out.minY < Infinity ? out : null;
  }

  /**
   * Shooting through the front glass: keep the whole image above the gravel
   * line (never show the substrate's cut face or the rim frame) by craning
   * the camera up while it keeps looking at the same point (it tilts down
   * over the gravel line, as a photographer does). Returns how far (m) the
   * image still dips below the line after at most maxLift of crane-up:
   * > 0 means the framing cannot be shot through the glass.
   */
  _glassGuard(pos, look, fov, maxLift = 0.1) {
    let lifted = 0;
    let need = 0;
    for (let it = 0; it < 5; it++) {
      const fp = this._paneFootprint(pos, look, fov, this._fp || (this._fp = {}));
      if (!fp) return 0;
      need = fp.gTop + 0.01 - fp.minY;
      if (need <= 0) return 0;
      const step = Math.min(need * 1.4 + 0.002, maxLift - lifted, TANK.water - 0.02 - pos.y);
      if (step <= 1e-4) break;
      pos.y += step;
      lifted += step;
    }
    return Math.max(0, need);
  }

  /**
   * Keep a camera position in the water, or — when it would be at or beyond
   * the front pane — just outside the glass, shooting through it like an
   * aquarium photographer.
   */
  _clampCam(p, m) {
    p.x = clamp(p.x, -TANK.L / 2 + m, TANK.L / 2 - m);
    if (p.z > TANK.D / 2 - 0.012) p.z = Math.max(p.z, TANK.D / 2 + TANK.glass + 0.025);
    else p.z = Math.max(p.z, -TANK.D / 2 + m);
    const gy = (p.z > TANK.D / 2 ? groundHeight(p.x, TANK.D / 2) : groundHeight(p.x, p.z)) + m;
    p.y = clamp(p.y, gy, TANK.water - Math.max(0.02, m - 0.005));
    return p;
  }

  /**
   * Validity and cost of a framing. Invalid: camera inside / grazing decor or
   * a fish, closer to the subject than the shot allows, or no line of sight
   * to the subject's eye.
   */
  _evalFrame(fr) {
    const sh = this.shot;
    const f = this.subject;
    if (!f || sh.type === 'wide') return { ok: true, cost: 0 };
    this._desired(_p, _l, fr);
    const guardMiss = this._guardMiss;
    const pos = _p.clone();
    const look = _l.clone();
    const SL = f.SL;
    let ok = true;
    if (this._inside(sh)) {
      if (this._decorDist(pos) < 0.022) ok = false;
      for (const o of this.app.fishSystem.fish) {
        const need = o === f ? 0.6 * SL : 0.35 * o.SL;
        if (this._fishDist(pos, o) < need) {
          ok = false;
          break;
        }
      }
      const ref = sh.type === 'head34' ? f.headPosition(_q) : f.loc.pos;
      if (pos.distanceTo(ref) < sh.minDist * SL * 0.92) ok = false;
    }
    if (ok && this._viewBlocked(pos, look)) ok = false;
    // a portrait from straight behind shows a tail and a blurred back, not
    // the fish (only the tail-follow shot is framed from behind)
    let extra = 0;
    if (ok && this._inside(sh) && sh.type !== 'tail') {
      _f5.subVectors(pos, f.loc.pos).normalize();
      const behind = -_f5.dot(this._axis(f));
      if (behind > 0.5) ok = false;
      else extra += Math.max(0, behind - 0.2) * 2.5;
    }
    // never the bare hood lamp in frame (seen through Snell's window it is a
    // clipped, blooming bar however it is exposed)
    if (ok && this._inside(sh) && pos.y < TANK.water && this._lampInFrame(pos, look, sh.fov)) ok = false;
    if (ok && pos.z > TANK.D / 2) {
      // through the front glass: the glass guard has craned the camera above
      // the gravel line (impossible: invalid); the subject must still sit
      // well inside the image, and a fish down at the gravel is better shot
      // from inside the water (against water and plants, not the substrate)
      if (guardMiss > 0.002) ok = false;
      if (ok && !this._inFrame(pos, look, sh.fov, this._eyeOf(f, pos, _eye), 0.78)) ok = false;
      const low = f.loc.pos.y - groundHeight(f.loc.pos.x, f.loc.pos.z);
      extra += 1.2 * clamp(1 - low / (1.2 * SL), 0, 1);
      // the image runs past the tank's corner (glass edge, frame)
      const fp = this._paneFootprint(pos, look, sh.fov, this._fp || (this._fp = {}));
      if (fp && (fp.minX < -TANK.L / 2 + 0.01 || fp.maxX > TANK.L / 2 - 0.01)) extra += 1.5;
    } else if (ok && this._inside(sh)) {
      // in the water close to the front pane, looking along it: part of the
      // image leaves the tank through the glass (rim, stand, room)
      const of = this._outsideFraction(pos, look, sh.fov, Math.max(0.5, pos.distanceTo(f.loc.pos) * 2.0));
      if (of > 0.3) ok = false;
      extra += 3.0 * of;
    }
    _a.subVectors(look, pos).normalize();
    // prefer the planned framing; avoid looking out through the front glass
    const cost = Math.abs(fr.orbit) * 0.8 + (fr.dist - 1) * 1.6 + Math.abs(fr.lift) * 0.7 + Math.max(0, _a.z) * 2.5 + extra;
    return { ok, cost };
  }

  /**
   * Does the hood LED bar appear in the image of a camera under water? Rays
   * through the upper part of the frame are refracted out through the
   * surface (inside Snell's window) and tested against the bar.
   */
  _lampInFrame(pos, look, fov) {
    const fwd = _f1.subVectors(look, pos).normalize();
    const right = _f2.crossVectors(fwd, UP);
    if (right.lengthSq() < 1e-8) return true;
    right.normalize();
    const upv = _f3.crossVectors(right, fwd);
    const th = Math.tan(THREE.MathUtils.degToRad(fov) * 0.5);
    const tw = th * (this.app.camera.aspect || 1.6);
    const wl = TANK.water;
    const ledH = TANK.H + 0.0915 - wl;
    const hx = TANK.L * 0.45 + 0.015;
    const zc = -0.02;
    const hz = 0.035 + 0.015;
    for (const sy of [-0.2, 0.3, 0.7, 1.05]) {
      for (const sx of [-1.05, -0.5, 0, 0.5, 1.05]) {
        const d = _f4.copy(fwd).addScaledVector(right, sx * tw).addScaledVector(upv, sy * th).normalize();
        if (d.y <= 0.02) continue;
        const t = (wl - pos.y) / d.y;
        const x = pos.x + d.x * t;
        const z = pos.z + d.z * t;
        if (Math.abs(x) > TANK.L / 2 || Math.abs(z) > TANK.D / 2) continue;
        const sinI = Math.sqrt(Math.max(0, 1 - d.y * d.y));
        const sinT = 1.333 * sinI;
        if (sinT >= 0.999) continue; // total internal reflection: the mirror
        const k = sinI > 1e-5 ? (sinT / Math.sqrt(1 - sinT * sinT)) * ledH / sinI : 0;
        const lx = x + d.x * k;
        const lz = z + d.z * k;
        if (Math.abs(lx) < hx && Math.abs(lz - zc) < hz) return true;
      }
    }
    return false;
  }

  /**
   * Fraction of sample rays of an in-water camera that leave the tank through
   * the front pane, or through a side pane within maxDist.
   */
  _outsideFraction(pos, look, fov, maxDist) {
    const fwd = _f1.subVectors(look, pos).normalize();
    const right = _f2.crossVectors(fwd, UP);
    if (right.lengthSq() < 1e-8) return 0;
    right.normalize();
    const upv = _f3.crossVectors(right, fwd);
    const th = Math.tan(THREE.MathUtils.degToRad(fov) * 0.5);
    const tw = th * (this.app.camera.aspect || 1.6);
    let n = 0;
    let out = 0;
    for (const sy of [-0.9, 0, 0.9]) {
      for (const sx of [-1, -0.5, 0, 0.5, 1]) {
        const d = _f4.copy(fwd).addScaledVector(right, sx * tw).addScaledVector(upv, sy * th).normalize();
        n++;
        // first wall the ray meets: front pane or a side pane
        const tz = d.z > 1e-3 ? (TANK.D / 2 - pos.z) / d.z : Infinity;
        const tx = Math.abs(d.x) > 1e-3 ? (Math.sign(d.x) * TANK.L / 2 - pos.x) / d.x : Infinity;
        const t = Math.min(tz, tx);
        // through the front pane at any distance (from inside it is either a
        // window onto the room or, beyond 48.6°, a mirror we do not render);
        // through a side pane only nearby (the far end glass is fine)
        if (t === tx && t > maxDist) continue;
        if (!Number.isFinite(t)) continue;
        const y = pos.y + d.y * t;
        if (y > 0 && y < TANK.water) out++;
      }
    }
    return out / n;
  }

  /** Is point p inside the central part (fraction k of the half-size) of the image? */
  _inFrame(pos, look, fov, p, k) {
    const fwd = _f1.subVectors(look, pos).normalize();
    _f4.subVectors(p, pos);
    const z = _f4.dot(fwd);
    if (z <= 0.01) return false;
    const right = _f2.crossVectors(fwd, UP).normalize();
    const upv = _f3.crossVectors(right, fwd);
    const th = Math.tan(THREE.MathUtils.degToRad(fov) * 0.5);
    const aspect = this.app.camera.aspect || 1.6;
    return Math.abs(_f4.dot(right) / z) < th * aspect * k && Math.abs(_f4.dot(upv) / z) < th * k;
  }

  /**
   * Is the view from pos (looking at look) spoiled? Rocks, plant clumps or
   * fish between the camera and the subject's eye or body, or a nearer fish
   * swimming through a large part of the frame.
   */
  _viewBlocked(pos, look) {
    const f = this.subject;
    const SL = f.SL;
    if (this._occluded(pos, this._eyeOf(f, pos, _eye), f)) return true;
    if (this._occluded(pos, f.loc.pos, f)) return true;
    const dir = _w.subVectors(look, pos).normalize();
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.shot.fov) * 0.5);
    const zs = _q.subVectors(f.loc.pos, pos).dot(dir);
    for (const o of this.app.fishSystem.fish) {
      if (o === f) continue;
      _q.subVectors(o.loc.pos, pos);
      const z = _q.dot(dir);
      if (z <= 0.01 || z > zs - 0.3 * SL) continue;
      const off = Math.sqrt(Math.max(0, _q.lengthSq() - z * z));
      if (off - 0.6 * o.SL > z * tanH * 1.5) continue; // outside the frame
      if (o.SL / z > 0.7 * tanH) return true;
    }
    return false;
  }

  /** Pick the cheapest valid framing; returns false when none exists. */
  _search(force = false) {
    if (!this.subject || this.shot.type === 'wide') return true;
    const cur = this._evalFrame(this.frame);
    if (cur.ok && !force) return true;
    let best = null;
    let bc = Infinity;
    const fr = { orbit: 0, dist: 1, lift: 0 };
    for (const dist of DOLLY) {
      for (const lift of LIFTS) {
        for (const orbit of ORBITS) {
          fr.orbit = orbit;
          fr.dist = dist;
          fr.lift = lift;
          const e = this._evalFrame(fr);
          if (e.ok && e.cost < bc) {
            bc = e.cost;
            best = { ...fr };
          }
        }
      }
    }
    if (!best) return false;
    // keep the current framing unless the new one is clearly better
    if (!(cur.ok && cur.cost <= bc + 0.4)) this.frame = best;
    return true;
  }

  /**
   * Hard constraint on the actual (smoothed) camera position: push it out of
   * fish bodies and decor. Returns false when it cannot be made valid.
   */
  _enforce(p) {
    const f = this.subject;
    const fish = this.app.fishSystem.fish;
    // working distance: the operator backs off when the subject swims at the lens
    const ref = this.shot.type === 'head34' ? f.headPosition(new THREE.Vector3()) : f.loc.pos;
    const dMin = this.shot.minDist * f.SL * 0.8;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      _o.subVectors(p, ref);
      const dc = _o.length();
      if (dc < dMin) {
        if (dc < 1e-6) _o.set(0, 0, 1);
        p.copy(ref).addScaledVector(_o.normalize(), dMin);
        moved = true;
      }
      if (p.z <= TANK.D / 2) {
        const d = this.app.world.distance(p, _g, { softPlants: false });
        if (d < 0.018) {
          p.addScaledVector(_g, 0.018 - d);
          moved = true;
        }
      }
      for (const o of fish) {
        const need = o === f ? 0.45 * o.SL : 0.25 * o.SL;
        const dd = this._fishDist(p, o);
        if (dd < need) {
          // _a holds the radial offset from the fish axis
          if (_a.lengthSq() < 1e-10) _a.set(0, 1, 0);
          p.addScaledVector(_a.normalize(), need - dd);
          moved = true;
        }
      }
      this._clampCam(p, 0.02);
      if (!moved) return true;
    }
    if (p.z <= TANK.D / 2 && this.app.world.distance(p, _g, { softPlants: false }) < 0.008) return false;
    for (const o of fish) if (this._fishDist(p, o) < 0.1 * o.SL) return false;
    return true;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this._axes.clear();
    let cuts = 0;
    // at most a couple of cuts per frame (a forced shot type may have no
    // valid framing at all: then it is held as well as possible)
    const cut = (subject = null, type = null, len = null) => {
      if (cuts++ >= 2) return false;
      this.cut(subject, type, len);
      return true;
    };
    if (!this.shot || this.t > this.shot.len || !this.subject || !this.app.fishSystem.fish.includes(this.subject)) cut();
    else if (!this.forceType && this.t > 1.2) {
      // a fish is about to yawn: cut to a close three-quarter view of its head
      for (const f of this.app.fishSystem.fish) {
        const yt = f.brain ? f.brain.yawnTimer : 99;
        if (yt > 0.3 && yt < 1.6 && !(this.shot.type === 'head34' && this.subject === f)) {
          cut(f, 'head34', 5.5);
          break;
        }
      }
    }
    if (!this.shot || !this.subject) return;
    this.t += dt;
    const f0 = this.subject;
    // subject pose: the centre of mass hardly oscillates, so position is
    // tracked tightly; the heading is smoothed (filters the head's yaw
    // oscillation and makes turns read as slow camera arcs)
    this.pose.pos.lerp(f0.loc.pos, 1 - Math.exp(-dt * 8));
    _v.copy(f0.loc.forward).setY(0);
    if (_v.lengthSq() > 1e-6) this.pose.fwd.lerp(_v.normalize(), 1 - Math.exp(-dt * 1.2)).normalize();
    // camera rig moves with the subject (feed-forward), springs only correct the framing
    if (!this.snap && this.shot.type !== 'wide') {
      this.camPos.addScaledVector(f0.loc.vel, dt);
      this.camLook.addScaledVector(f0.loc.vel, dt);
    }
    // operator guard: re-check the framing a few times per second; re-frame
    // when it stays broken, cut when no framing works
    this.frameT += dt;
    if (this.frameT > 0.1 && this.shot.type !== 'wide') {
      const slack = this.frameT;
      this.frameT = 0;
      const cur = this._evalFrame(this.frame);
      // the real camera lags the plan: it must have a clear view as well
      const live = this.snap || !this._viewBlocked(this.camPos, this.camLook);
      this.blockT = live ? 0 : (this.blockT || 0) + slack;
      if (!live && cur.ok) cur.ok = false;
      // how far the camera would travel to reach a framing: long moves would
      // sweep through the scene, so they become a cut to the new angle
      // (always > 30°, so it reads as a deliberate change of angle)
      const travel = (fr) => {
        this._desired(_p, _l, fr);
        return _p.distanceTo(this.camPos) / f0.SL;
      };
      // the subject turned into an awkward portrait (head down in the gravel,
      // steeply pitched) for a while: find another subject
      const head = f0.headPosition(_q);
      const awk = head.y - groundHeight(head.x, head.z) < 0.3 * f0.SL || Math.abs(f0.loc.forward.y) > 0.64;
      this.awkT = awk ? (this.awkT || 0) + slack : 0;
      if (this.awkT > 0.5 && this.t > 1.0) {
        this.awkT = 0;
        cut(null, this.forceType || null);
      } else if (this.blockT > 1.0 && this.t > 1.5) {
        // the view stayed spoiled despite re-framing: cut away
        this.blockT = 0;
        cut(null, this.forceType || null);
      } else if (!cur.ok) {
        this.badT += slack;
        if (this.badT > 0.3) {
          this.badT = 0;
          // (a cut needs the shot to have run a moment: no flurry of cuts)
          if (!this._search(true) && this.t > 1.5) cut(null, this.forceType || null);
          else if (travel(this.frame) > 1.0) this.snap = true;
        }
      } else {
        this.badT = 0;
        // drift back toward the planned framing once it is free again (only
        // when that is a short move)
        if (this.frame.orbit !== 0 || this.frame.dist !== 1 || this.frame.lift !== 0) {
          const base = { orbit: 0, dist: 1, lift: 0 };
          const e = this._evalFrame(base);
          if (e.ok && e.cost + 0.6 < cur.cost && travel(base) < 0.8) this.frame = base;
        }
      }
    }
    this._place(dt);
    // the actual camera never enters a fish, rock or plant; when the subject
    // swims into the lens and the camera cannot back off, cut away
    if (this._inside()) {
      const f = this.subject;
      const okPos = this._enforce(this.camPos);
      const ref = this.shot.type === 'head34' ? f.headPosition(_q) : f.loc.pos;
      const close = this.camPos.distanceTo(ref) < this.shot.minDist * f.SL * 0.6 || this._fishDist(this.camPos, f) < 0.3 * f.SL;
      this.closeT = close ? this.closeT + dt : 0;
      if ((!okPos || this.closeT > 0.25) && cut(null, this.forceType || null)) {
        this._place(0);
        if (this._inside()) this._enforce(this.camPos);
      }
    }
    // through the glass the actual (smoothed) framing stays above the gravel line
    if (this._inside()) this._glassGuard(this.camPos, this.camLook, this.shot.fov, 0.05);
    const cam = this.app.camera;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    // focus on the subject's nearer eye: view-axis depth (what the depth of
    // field measures). Snap on a cut, then a critically damped rack.
    const f = this.subject;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const tp = this.shot.type === 'wide' ? _eye.copy(f.loc.pos) : this._eyeOf(f, this.camPos, _eye);
    const target = Math.max(0.03, tp.sub(this.camPos).dot(dir));
    if (this.snap) {
      this.focus = target;
      this.focusVel = 0;
      this.targetVel = 0;
    } else if (dt > 0) {
      // predictive (servo) autofocus: the rack follows the measured rate of
      // the subject's distance as well as the error, so a fish swimming
      // toward / away from the lens stays on the focal plane instead of
      // trailing it by 2 v / w (a centimetre or more at macro range)
      const rate = (target - this.lastTarget) / dt;
      this.targetVel += (THREE.MathUtils.clamp(rate, -0.6, 0.6) - this.targetVel) * (1 - Math.exp(-dt * 10));
      // eye-tracking servo: fast but critically damped (sub-stepped so the
      // explicit integration stays stable at low frame rates)
      const w = 14.0;
      const n = Math.max(1, Math.ceil(Math.min(dt, 0.1) / 0.008));
      const h = Math.min(dt, 0.1) / n;
      for (let i = 0; i < n; i++) {
        this.focusVel += (w * w * (target - this.focus) + 2 * w * (this.targetVel - this.focusVel)) * h;
        this.focus = Math.max(0.02, this.focus + this.focusVel * h);
      }
    }
    this.lastTarget = target;
    this.snap = false;
    this.fStop = this._aperture(this.shot, this.focus, f);
  }

  /**
   * Relative aperture for the shot: its nominal f-stop, stopped down at close
   * range until most of the subject (±0.45 SL around the eye: a fish seen
   * end-on spans its whole length in depth)
   * stays within a blur of 0.4 % of the frame height. At 0.15 m the thin-lens
   * depth of field at f/8 is only a few millimetres, so a macro shot would
   * otherwise show no sharp plane at all; the background still melts.
   */
  _aperture(sh, focus, f) {
    if (sh.type === 'wide' || !f) return sh.fStop;
    const fmm = 12 / Math.tan(THREE.MathUtils.degToRad(sh.fov) * 0.5);
    const F = Math.max(focus * 1000, fmm * 1.5);
    const dz = 0.45 * f.SL * 1000;
    const need = (fmm * fmm * dz) / (Math.max(1, F - dz) * (F - fmm) * 24 * 0.004);
    return THREE.MathUtils.clamp(need, sh.fStop, 22);
  }

  /** Move the camera rig toward the desired framing (jump on a cut). */
  _place(dt) {
    const want = new THREE.Vector3();
    const look = new THREE.Vector3();
    this._desired(want, look);
    // faint hand-held drift
    const s = this.shot.seed;
    const tt = this.app.time;
    const amp = this.shot.type === 'wide' ? 0.004 : 0.0025;
    want.x += noise1(tt * 0.35 + s) * 0.5 * amp;
    want.y += noise1(tt * 0.31 + s + 17) * 0.5 * amp;
    if (this.snap) {
      this.camPos.copy(want);
      this.camLook.copy(look);
    } else {
      this.camPos.lerp(want, 1 - Math.exp(-dt * 2.2));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 5.0));
    }
  }

  /** Hand the current framing to the orbit controls. */
  release(controls) {
    controls.target.copy(this.camLook);
    this.app.camera.fov = 34;
    this.app.camera.updateProjectionMatrix();
  }
}
