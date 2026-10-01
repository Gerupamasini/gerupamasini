// ユビナガホンヤドカリ Pagurus minutus Hess, 1865 – one complete individual.
//
//   HermitCrabRoot (Group)            ground point under the body centre, yaw = heading
//   ├── CrabBody (Group, scale = SL)  skinned body (LOD0–2) + setae, bone "Body" with the whole rig
//   ├── Shell (Group)                 separate rigid body; transform written by ShellDynamics
//   └── ContactShadow
//
// Update order per frame: Behavior → Locomotion → Animator → matrices → ShellDynamics → abdomen → shading.
import * as THREE from 'three';
import { MORPH, COLORWAYS, individualMorph } from './PagurusMinutusMorphology.js';
import { Rig } from './PagurusMinutusRig.js';
import { buildBodyGeometry } from './PagurusMinutusModel.js';
import { createCrabMaterials, createContactShadowMaterial, adoptForeignMaterial, chainForeignHook } from './PagurusMinutusMaterial.js';
import { Shell, ShellDynamics, chooseShellFor, evaluateShell } from './PagurusMinutusShell.js';
import { Locomotion } from './PagurusMinutusLocomotion.js';
import { Animator } from './PagurusMinutusAnimator.js';
import { Behavior, STATE } from './PagurusMinutusBehavior.js';
import { PagurusWorld } from './PagurusMinutusWorld.js';
import { LOD_TIERS, chooseLOD } from './PagurusMinutusLOD.js';
import { CrabDebug } from './PagurusMinutusDebug.js';
import { SeededRandom, clamp, smoothstep, damp } from './PagurusMinutusUtil.js';

export { STATE, Shell, PagurusWorld, LOD_TIERS };

let nextCrabId = 1;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function pickColorway(rng) {
  let r = rng.next(), acc = 0;
  let cw = COLORWAYS[0];
  for (const c of COLORWAYS) { acc += c.weight; if (r <= acc) { cw = c; break; } }
  return {
    id: cw.id,
    hue: cw.hue + (rng.next() - 0.5) * 0.04,
    sat: cw.sat * (0.92 + rng.next() * 0.16),
    val: cw.val * (0.92 + rng.next() * 0.16),
    green: clamp(cw.green + (rng.next() - 0.5) * 0.3, 0, 1),
    contrast: 0.8 + rng.next() * 0.35,
  };
}

export class HermitCrab {
  /**
   * @param {{seed?: number, sex?: 'm'|'f', shieldLength_mm?: number, shell?: object|Shell, lod?: number, id?: string}} opts
   */
  constructor(opts = {}) {
    this.id = opts.id ?? `pagurus-${nextCrabId++}`;
    this.seed = (opts.seed ?? 1) >>> 0 || 1;
    const rng = (this.rng = new SeededRandom(this.seed));
    this.sex = opts.sex ?? (rng.chance(0.5) ? 'm' : 'f');
    const D = MORPH.shieldLength_mm;
    this.shieldLength_mm = opts.shieldLength_mm ?? clamp(D.mean + D.sd * rng.normal() + (this.sex === 'm' ? 0.3 : -0.2), D.min, D.max);
    this.SL = this.shieldLength_mm / 1000;
    this.colorway = pickColorway(rng);
    // individual chela variation, quantised so body geometry can be shared between individuals
    const variation = Math.round(clamp(rng.normal(), -1, 1) * 2) / 2;
    this.morph = individualMorph(this.sex, variation);
    this.rig = new Rig(this.morph);
    this.skeleton = this.rig.createSkeleton();
    this.root = new THREE.Group();
    this.root.name = 'HermitCrabRoot';
    this.root.userData.pagurus = this;
    this.body = new THREE.Group();
    this.body.name = 'CrabBody';
    this.body.scale.setScalar(this.SL);
    this.root.add(this.body);
    this.body.add(this.rig.root);
    this.materials = createCrabMaterials(this.colorway);
    this.meshes = [null, null, null];
    this.setaeMeshes = [null, null, null];
    this.lod = -1;
    this.listeners = new Set();
    this.active = true;
    this.world = null;
    this.home = new THREE.Vector3();
    this.breeding = false;
    this.loco = new Locomotion(this);
    this.animator = new Animator(this);
    this.behavior = new Behavior(this);
    this.shell = null;
    this.shellDyn = null;
    this.shellMode = 'none';
    this.change = null;
    const shell = opts.shell instanceof Shell ? opts.shell : new Shell(opts.shell ?? chooseShellFor(this.shieldLength_mm, rng));
    this.setShell(shell);
    // contact shadow (ambient occlusion under body and shell)
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), createContactShadowMaterial());
    this.contactShadow.name = 'ContactShadow';
    this.contactShadow.renderOrder = 1;
    this.root.add(this.contactShadow);
    this.morsel = null;
    this.debug = null;
    this.debugEnabled = false;
    this.frame = 0;
    this.time = 0;
    this.setLOD(opts.lod ?? 1);
    this.radius = Math.max(4 * this.SL, this.shell ? this.shell.radius : 0);
  }

  // ── geometry / LOD ───────────────────────────────────────────────────────────────────────────
  ensureLOD(i) {
    if (this.meshes[i]) return;
    const g = buildBodyGeometry(this.rig, i);
    const m = new THREE.SkinnedMesh(g.body, this.materials.body);
    m.name = `PagurusMinutus_Body_LOD${i}`;
    m.bind(this.skeleton, new THREE.Matrix4());
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.2, 0.6), 7);
    m.castShadow = LOD_TIERS[i].castShadow;
    m.receiveShadow = true;
    m.visible = false;
    this.body.add(m);
    this.meshes[i] = m;
    if (g.setae) {
      const s = new THREE.SkinnedMesh(g.setae, this.materials.setae);
      s.name = `PagurusMinutus_Setae_LOD${i}`;
      s.bind(this.skeleton, new THREE.Matrix4());
      s.boundingSphere = m.boundingSphere;
      s.castShadow = false;
      s.receiveShadow = true;
      s.visible = false;
      this.body.add(s);
      this.setaeMeshes[i] = s;
    }
  }

  setLOD(i) {
    i = clamp(i, 0, 2);
    if (i === this.lod) return;
    this.ensureLOD(i);
    for (let k = 0; k < 3; k++) {
      if (this.meshes[k]) this.meshes[k].visible = k === i;
      if (this.setaeMeshes[k]) this.setaeMeshes[k].visible = k === i && LOD_TIERS[i].setae;
    }
    this.lod = i;
    if (this.shell) this.shell.setLOD(LOD_TIERS[i].shellLOD);
  }

  /** copy shader hooks a host installed on another crab's materials (the tank's caustics) onto ours */
  chainForeignMaterials(from) {
    const fb = from.meshes.find(Boolean)?.material;
    if (fb && fb !== from.materials.body) chainForeignHook(this.materials.body, fb);
    const fs = from.setaeMeshes.find(Boolean)?.material;
    if (fs && fs !== from.materials.setae) chainForeignHook(this.materials.setae, fs);
    const fsh = from.shell?.mesh?.material;
    if (fsh && this.shell?.mesh) chainForeignHook(this.shell.mesh.material, fsh);
  }

  /** the tank swaps our materials for caustic-lit clones; chain our shader in front of theirs */
  adoptMaterials() {
    this.root.traverse((o) => { if (o.isMesh) adoptForeignMaterial(o); });
  }

  // ── shell ────────────────────────────────────────────────────────────────────────────────────
  /** move the grip point to the carry pose of this shell species */
  applyCarryAnchor(shell) {
    const c = shell.data.sp.carry;
    this.rig.shellAnchorRest.set(MORPH.shellAnchor.x, c.anchorY ?? MORPH.shellAnchor.y, c.anchorZ ?? MORPH.shellAnchor.z);
    this.rig.shellAnchor.position.copy(this.rig.shellAnchorRest);
  }

  setShell(shell) {
    this.shell = shell;
    this.applyCarryAnchor(shell);
    this.root.attach(shell.object3D);
    this.shellDyn = new ShellDynamics(shell);
    this.shellMode = 'carried';
    if (this.lod >= 0) shell.setLOD(LOD_TIERS[this.lod].shellLOD);
    this.behavior.internal.shellSatisfaction = evaluateShell(this.shellNeeds(), shell.props).score;
    this.radius = Math.max(4 * this.SL, shell.radius);
    // place the shell at its carry pose immediately
    this.root.updateMatrixWorld(true);
    this.placeShellAtCarry(shell);
  }

  placeShellAtCarry(shell) {
    const a = this.rig.shellAnchor;
    a.updateMatrixWorld(true);
    a.matrixWorld.decompose(_v, _q, _s);
    _q.multiply(shell.carry.quaternion);
    _m.compose(_v, _q, _s.set(1, 1, 1));
    if (shell.object3D.parent) _m.premultiply(_m.clone().copy(shell.object3D.parent.matrixWorld).invert());
    _m.decompose(shell.object3D.position, shell.object3D.quaternion, shell.object3D.scale);
    shell.object3D.updateMatrixWorld(true);
  }

  /** what the crab needs from a shell (for evaluateShell) */
  shellNeeds() {
    const sl = this.shieldLength_mm;
    return {
      bodyVolume_mm3: MORPH.bodyVolumeK * sl * sl * sl,
      chelaWidth_mm: this.morph.chelaRWidth * sl,
      shieldLength_mm: sl,
      sex: this.sex,
      breeding: this.breeding,
    };
  }

  /** world offset of the shell's centre of mass from the root (for collisions) */
  shellCenterOffset(out) {
    if (!this.shell || this.shellMode !== 'carried') return out.set(0, 0, 0);
    return out.copy(this.shell.props.centerOfMass).applyMatrix4(this.shell.object3D.matrixWorld).sub(this.loco.position);
  }

  // ── shell handling during inspection ─────────────────────────────────────────────────────────
  beginHandlingShell(entry) {
    const o = entry.shell.object3D;
    entry.handleFrom = { q: o.quaternion.clone(), p: o.position.clone() };
    const d = _v.set(this.loco.position.x - o.position.x, 0, this.loco.position.z - o.position.z);
    if (d.lengthSq() < 1e-10) d.set(0, 0, 1);
    d.normalize();
    // aperture toward the crab, spire leaning away and up
    const want = d.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, -0.25, 0)).normalize();
    const n0 = entry.shell.apertureNormal.clone().applyQuaternion(entry.handleFrom.q);
    entry.handleTo = new THREE.Quaternion().setFromUnitVectors(n0, want).multiply(entry.handleFrom.q);
  }

  handleShell(entry, t) {
    const o = entry.shell.object3D;
    if (!entry.handleFrom) this.beginHandlingShell(entry);
    const wob = Math.sin(t * Math.PI * 3) * 0.12 * (1 - t);
    o.quaternion.slerpQuaternions(entry.handleFrom.q, entry.handleTo, t).multiply(_q.setFromAxisAngle(UP, wob));
    o.position.x = entry.handleFrom.p.x;
    o.position.z = entry.handleFrom.p.z;
    o.updateMatrixWorld(true);
    const g = this.lastEnv?.groundAt;
    if (g) {
      let lowest = Infinity;
      for (const p of entry.shell.hullWorld()) lowest = Math.min(lowest, p.y - g(p.x, p.z));
      o.position.y -= lowest;
      o.updateMatrixWorld(true);
    }
    entry.pos.copy(o.position);
  }

  /** a point just inside the aperture of a handled shell (world) */
  handledSeatWorld(entry, out) {
    const o = entry.shell.object3D;
    const n = _w.copy(entry.shell.apertureNormal).applyQuaternion(o.quaternion);
    return out.copy(o.position).addScaledVector(n, -0.25 * entry.shell.props.apertureHeight);
  }

  endHandlingShell(entry) {
    entry.handleFrom = null;
    entry.handledBy = null;
    entry.shell.object3D.userData.restQuat = entry.shell.object3D.quaternion.clone();
  }

  // ── shell exchange ───────────────────────────────────────────────────────────────────────────
  beginShellChange(entry) {
    if (!entry || !this.world) return;
    const old = this.shell;
    const ch = (this.change = {
      phase: 'exit', t: 0, entry, newShell: entry.shell, old, startPos: this.loco.position.clone(),
      L: MORPH.abdomen.length * 0.95, oldEntry: null,
      newFrom: { p: entry.shell.object3D.position.clone(), q: entry.shell.object3D.quaternion.clone() },
    });
    entry.free = false;
    this.world.removeShell(entry);
    // the old shell is let go where it is (it rests on the substrate)
    this.world.group.attach(old.object3D);
    this.shellMode = 'released';
    ch.oldMatrix = old.object3D.matrixWorld.clone();
  }

  /** carry pose of a shell at the current anchor, optionally shifted back along the body (world) */
  carryPoseWorld(shell, backSL, outP, outQ) {
    const a = this.rig.shellAnchor;
    a.updateMatrixWorld(true);
    a.matrixWorld.decompose(outP, outQ, _s);
    outQ.multiply(shell.carry.quaternion);
    if (backSL) {
      const back = _w.set(0, -0.15, -1).applyQuaternion(this.rig.root.getWorldQuaternion(_q2)).normalize();
      outP.addScaledVector(back, backSL * this.SL);
    }
  }

  stepShellChange(dt, L, A) {
    const ch = this.change;
    if (!ch) return { phase: 'done', score: this.behavior.internal.shellSatisfaction };
    ch.t += dt;
    const SL = this.SL;
    A.retract = 0;
    L.posture = 'low';
    if (ch.phase === 'exit') {
      // walk forward out of the old shell: the naked abdomen slides out and spans to the old aperture
      const f = this.loco.forward(_v);
      if (!ch.target) ch.target = ch.startPos.clone().addScaledVector(f, (ch.L + 0.4) * SL);
      L.moveTarget = ch.target;
      L.speed = 2.2;
      L.urgent = true;
      L.arrive = 0.1 * SL;
      const moved = Math.hypot(this.loco.position.x - ch.startPos.x, this.loco.position.z - ch.startPos.z) / SL;
      this.animator.abdomenExit = clamp(moved, 0, ch.L);
      // the new shell is pulled behind, aperture toward the abdomen
      const s = smoothstep(0, 1, moved / ch.L);
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      this.carryPoseWorld(ch.newShell, ch.L * 0.9, p, q);
      const o = ch.newShell.object3D;
      o.position.lerpVectors(ch.newFrom.p, p, s);
      o.quaternion.slerpQuaternions(ch.newFrom.q, q, s);
      o.updateMatrixWorld(true);
      if (moved >= ch.L - 0.05 || ch.t > 4) {
        ch.phase = 'enter';
        ch.t = 0;
        this.animator.abdomenExit = ch.L;
        this.root.attach(o);
        this.shell = ch.newShell;
        this.applyCarryAnchor(ch.newShell);
        this.shellMode = 'entering';
        ch.enterFrom = { p: o.getWorldPosition(new THREE.Vector3()), q: o.getWorldQuaternion(new THREE.Quaternion()) };
      }
    } else if (ch.phase === 'enter') {
      // the abdomen goes in first and the shell is drawn onto it (< 5 s in Pagurus [G])
      L.freeze = true;
      const s = smoothstep(0, 1, ch.t / 1.1);
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      this.carryPoseWorld(ch.newShell, 0, p, q);
      p.lerpVectors(ch.enterFrom.p, p, s);
      q.slerpQuaternions(ch.enterFrom.q, q, s);
      const o = ch.newShell.object3D;
      _m.compose(p, q, _s.set(1, 1, 1)).premultiply(_m.clone().copy(o.parent.matrixWorld).invert());
      _m.decompose(o.position, o.quaternion, o.scale);
      o.updateMatrixWorld(true);
      this.animator.abdomenExit = ch.L * (1 - s);
      if (ch.t >= 1.1) {
        ch.phase = 'settle';
        ch.t = 0;
        this.animator.abdomenExit = 0;
        this.shellDyn = new ShellDynamics(ch.newShell);
        this.shellMode = 'carried';
        ch.newShell.setLOD(LOD_TIERS[this.lod].shellLOD);
        ch.oldEntry = this.world.adoptShell(ch.old, this.lastEnv?.groundAt);
        this.radius = Math.max(4 * SL, ch.newShell.radius);
        this.emit('shell_change');
      }
    } else if (ch.phase === 'settle') {
      L.freeze = true;
      if (ch.t > 0.6) {
        const score = evaluateShell(this.shellNeeds(), this.shell.props).score;
        const res = { phase: 'done', score, oldEntry: ch.oldEntry };
        this.change = null;
        return res;
      }
    }
    return { phase: ch.phase };
  }

  abortShellChange() {
    const ch = this.change;
    if (!ch) return;
    if (ch.phase === 'exit') {
      this.root.attach(ch.old.object3D);
      this.shell = ch.old;
      this.applyCarryAnchor(ch.old);
      this.shellMode = 'carried';
      this.shellDyn.reset();
      this.world.adoptShell(ch.newShell, this.lastEnv?.groundAt);
    } else {
      this.shellMode = 'carried';
      this.shellDyn = new ShellDynamics(ch.newShell);
      this.world.adoptShell(ch.old, this.lastEnv?.groundAt);
    }
    this.animator.abdomenExit = 0;
    this.change = null;
  }

  // ── food held in a chela ─────────────────────────────────────────────────────────────────────
  holdMorsel(side, food) {
    if (!side) { if (this.morsel) this.morsel.visible = false; return; }
    if (!this.morsel) {
      this.morsel = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), food.mesh.material);
      this.morsel.name = 'morsel';
    }
    this.morsel.material = food.mesh.material;
    this.rig.chelipeds[side].tip.add(this.morsel);
    this.morsel.position.set(-0.08, 0, 0);
    this.morsel.scale.setScalar(Math.min(0.3, (food.size * 0.25) / this.SL));
    this.morsel.visible = true;
  }

  // ── events ───────────────────────────────────────────────────────────────────────────────────
  onEvent(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(id) {
    for (const l of this.listeners) l(id, this);
  }

  // ── placement ────────────────────────────────────────────────────────────────────────────────
  placeAt(pos, heading, env) {
    this.home.copy(pos);
    const e = this.makeEnv(env);
    this.loco.reset(pos, heading, e);
    this.root.updateMatrixWorld(true);
    if (this.shell && this.shellMode === 'carried') {
      this.placeShellAtCarry(this.shell);
      this.shellDyn.reset();
    }
  }

  makeEnv(envIn) {
    const world = this.world;
    const base = envIn.groundAt;
    const env = Object.assign({}, envIn);
    env.groundAt = world ? (x, z) => base(x, z) + world.bumpAt(x, z) : base;
    env.obstacles = world ? (x, z, r, c) => world.obstacles(x, z, r, c) : null;
    env.lod = this.lod;
    return env;
  }

  // ── main update ──────────────────────────────────────────────────────────────────────────────
  /**
   * @param {number} dt seconds (already scaled by the game's observation speed)
   * @param {object} envIn { groundAt(x,z), waterAt?(x,z), sample?, player?: Vector3, alert?: number, tank?: boolean,
   *   sunElevation?: number, season?: string, frame?: number, lodDistance?: number, locked?: boolean, closeup?: boolean }
   */
  update(dt, envIn) {
    if (!this.active || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.frame++;
    if (envIn.lodDistance !== undefined) this.setLOD(chooseLOD(envIn.lodDistance, { locked: envIn.locked, closeup: envIn.closeup, current: this.lod }));
    this.breeding = envIn.season === 'winter' || envIn.season === 'spring';
    const env = this.makeEnv(envIn);
    this.lastEnv = env;
    if (this.world) this.world.update(dt, envIn.frame ?? this.frame, env.groundAt, env.waterAt);
    // behaviour
    const cmd = this.behavior.update(dt, env);
    for (const id of this.behavior.events) this.emit(id);
    this.behavior.events.length = 0;
    // locomotion and pose
    env.exposed = this.behavior.envInfo.exposed;
    this.loco.update(dt, cmd.loco, env);
    this.animator.update(dt, cmd.anim, env);
    this.root.updateMatrixWorld(true);
    // shell
    if (this.shell && this.shellMode === 'carried') {
      const hold = 1 - 0.5 * clamp(Math.abs(this.loco.speed) / 4, 0, 1);
      this.shellDyn.update(dt, this.rig.shellAnchor, env.groundAt, { holdStrength: this.animator.closed ? 1.4 : hold });
    }
    if (this.lod < 2 || this.change) this.animator.poseAbdomen();
    this.updateShading(dt, env);
    this.updateContactShadow(env);
    if (this.debugEnabled) {
      if (!this.debug) this.debug = new CrabDebug(this);
      this.debug.attach(this.root.parent ?? this.root);
      this.debug.update(dt);
    } else if (this.debug) {
      this.debug.dispose();
      this.debug = null;
    }
  }

  updateShading(dt, env) {
    const e = this.behavior.envInfo;
    const submerged = !e.exposed;
    const caustics = submerged && e.sunUp && !env.tank ? 0.55 * clamp(1 - e.depth / 0.8, 0, 1) : 0;
    const water = env.waterAt ? env.waterAt(this.loco.position.x, this.loco.position.z) : -1e6;
    // under water the cuticle film is index-matched: little extra gloss; in air a wet film shines until it dries
    const wet = submerged ? 0.12 : e.wet;
    this.materials.update({ wet, caustics, waterY: water, time: this.time });
    const sm = this.shell?.mesh?.material?.userData?.update;
    if (sm) sm({ wet, caustics, waterY: water, time: this.time });
  }

  updateContactShadow(env) {
    const cs = this.contactShadow;
    const SL = this.SL;
    // centre between body and shell, on the ground, aligned with the local slope
    const off = this.shellCenterOffset(_v);
    const cx = this.loco.position.x + off.x * 0.5, cz = this.loco.position.z + off.z * 0.5;
    const gy = env.groundAt(cx, cz);
    _w.set(cx, gy + 0.03 * SL, cz);
    this.root.worldToLocal(_w);
    cs.position.copy(_w);
    const n = this.loco.groundNormal;
    _q.setFromUnitVectors(UP, n);
    cs.quaternion.copy(_q);
    const r = (this.shell ? this.shell.radius : 2 * SL) * 1.15 + 1.8 * SL;
    cs.scale.set(r * 1.3, 1, r * 1.6);
    const low = 1 - clamp((this.loco.bodyHeight - 0.36) / 0.4, 0, 1);
    cs.material.uniforms.uOpacity.value = (this.behavior.envInfo.exposed ? 0.5 : 0.36) * (0.75 + 0.25 * low);
  }

  // ── persistence across LOD / view re-attach ──────────────────────────────────────────────────
  saveState() {
    return {
      pos: this.loco.position.clone(), heading: this.loco.heading, home: this.home.clone(),
      internal: { ...this.behavior.internal },
      shell: this.shell ? { species: this.shell.key, size_mm: this.shell.size_mm, damage: this.shell.damage, fouling: this.shell.fouling, seed: this.shell.seed } : null,
    };
  }

  restoreState(s, env) {
    if (!s) return;
    if (s.shell && (!this.shell || this.shell.key !== s.shell.species || Math.abs(this.shell.size_mm - s.shell.size_mm) > 1e-3)) {
      this.shell?.dispose();
      this.setShell(new Shell(s.shell));
    }
    Object.assign(this.behavior.internal, s.internal);
    this.placeAt(s.pos, s.heading, env);
    this.home.copy(s.home);
  }

  dispose() {
    this.active = false;
    if (this.world) this.world.unregister(this);
    if (this.change) this.abortShellChange();
    this.debug?.dispose();
    this.root.removeFromParent();
    this.materials.dispose();
    this.shell?.mesh?.material?.dispose?.();
    this.contactShadow.material.dispose();
    this.contactShadow.geometry.dispose();
    this.skeleton.dispose();
  }
}

/**
 * Build a crab ready to be shown (zukan preview / tank / game placeholder): rest pose solved on flat
 * ground at y = 0, LOD0.
 */
export function createPreviewCrab(opts = {}) {
  const crab = new HermitCrab({ seed: 7, sex: 'm', shieldLength_mm: 4.6, lod: 0, ...opts });
  const env = { groundAt: () => 0, waterAt: () => 0.1, tank: true };
  crab.placeAt(new THREE.Vector3(0, 0, 0), 0, env);
  crab.behavior.state = STATE.IDLE;
  for (let i = 0; i < 40; i++) crab.update(1 / 30, env);
  return crab;
}
