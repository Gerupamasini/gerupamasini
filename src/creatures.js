// 干潟の生き物（造形・素材・ふるまい）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';
import { PLAY_RADIUS, channelCenter } from './world.js';
import { organicMaterial, GLSL } from './materials.js';
import {
  buildCrab, CRAB_SPECS, spiralShell, gobyKit, shrimpKit, asariGeo, siphonGeo, razorGeo, nassaKit, hermitKit,
} from './models.js';
import { LegRig } from './rig.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const TAU = Math.PI * 2;

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const sstep = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

const LOD_DIST = 16;
const FLAT = { heightAt: () => 0 };

// ---------- 地面に沿わせる ----------
function placeOnGround(world, obj, x, z, yaw, lift = 0, tiltK = 1) {
  const y = world.heightAt(x, z);
  world.normalAt(x, z, _n);
  _n.lerp(UP, 1 - tiltK).normalize();
  _q.setFromUnitVectors(UP, _n);
  _q2.setFromAxisAngle(UP, yaw);
  obj.quaternion.copy(_q).multiply(_q2);
  obj.position.set(x, y + lift, z);
  return y;
}

function shadowAll(obj, cast = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = true; } });
}

// 静止姿勢の個体から、遠景用に1つへまとめたメッシュ（マテリアルごとのグループ）を作る
function buildLODGeometry(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const mats = [...byMat.keys()];
  const geos = mats.map((m) => mergeGeometries(byMat.get(m), false));
  return { geometry: mergeGeometries(geos, true), materials: mats };
}

// ---------- 砂団子 ----------
class PelletField {
  constructor(scene, cap = 3000) {
    this.cap = cap;
    const geo = new THREE.IcosahedronGeometry(0.045, 1);
    const p = geo.attributes.position;
    const rnd = mulberry32(8);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      _v.multiplyScalar(1 + (rnd() - 0.5) * 0.25);
      p.setXYZ(i, _v.x, _v.y * 0.85, _v.z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.items = [];
    this.next = 0;
    this.dirty = false;
    this.col = new THREE.Color();
    scene.add(this.mesh);
  }
  add(x, y, z, s) {
    const it = { x, y, z, s, life: 1, age: 0, rot: Math.random() * 6.28 };
    if (this.items.length < this.cap) this.items.push(it);
    else { this.items[this.next] = it; this.next = (this.next + 1) % this.cap; }
    this.dirty = true;
    return it;
  }
  update(dt, water) {
    const out = [];
    for (const it of this.items) {
      it.age += dt;
      if (water > it.y + 0.01) it.life -= dt * 0.25; // 潮が満ちると崩れて消える
      if (it.life > 0) out.push(it);
      if (it.life < 1) this.dirty = true;
    }
    if (out.length !== this.items.length) { this.items = out; this.next = 0; this.dirty = true; }
    this.dryT = (this.dryT || 0) + dt;
    if (this.dryT > 1) { this.dryT = 0; this.dirty = true; }
    if (!this.dirty) return;
    let alive = 0;
    for (const it of this.items) {
      const s = it.s * clamp(it.life * 1.5, 0, 1);
      _q.setFromAxisAngle(UP, it.rot);
      _m.compose(_v.set(it.x, it.y + 0.028 * s, it.z), _q, _n.set(s, s, s));
      this.mesh.setMatrixAt(alive, _m);
      // 作りたては湿って暗く、時間とともに乾いて明るくなる
      const dry = clamp(it.age / 90, 0, 1);
      if (it.mud) this.col.setRGB(lerp(0.16, 0.26, dry), lerp(0.15, 0.24, dry), lerp(0.13, 0.2, dry));
      else this.col.setRGB(lerp(0.24, 0.42, dry), lerp(0.21, 0.37, dry), lerp(0.16, 0.28, dry));
      this.mesh.setColorAt(alive, this.col);
      alive++;
    }
    this.mesh.count = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
}

// ---------- 砂煙 ----------
class Puffs {
  constructor(scene, cap = 600) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.size = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float aLife; attribute float aSize; varying float vL; uniform float uScale;
        void main(){ vL=aLife; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
        gl_PointSize = aSize*(1.6-aLife*0.6)*uScale/(-mv.z); if(aLife<=0.0) gl_PointSize=0.0; }`,
      fragmentShader: `varying float vL; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
        float a=smoothstep(0.5,0.0,r)*vL*0.4; gl_FragColor=vec4(vec3(0.42,0.38,0.3),a); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.i = 0;
    scene.add(this.points);
  }
  emit(x, y, z, n = 8, spread = 0.25, rnd = Math.random) {
    for (let k = 0; k < n; k++) {
      const i = this.i; this.i = (this.i + 1) % this.cap;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const a = rnd() * TAU, s = spread * (0.4 + rnd());
      this.vel[i * 3] = Math.cos(a) * s; this.vel[i * 3 + 1] = 0.1 + rnd() * 0.25; this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = 1; this.size[i] = 0.06 + rnd() * 0.12;
    }
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 0.6;
      this.vel[i * 3 + 1] -= dt * 0.3;
      for (let a = 0; a < 3; a++) { this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt; this.vel[i * 3 + a] *= 1 - dt * 2.2; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aLife.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }
}

// ============================================================
class Agent {
  constructor(sys, species) {
    this.sys = sys;
    this.world = sys.world;
    this.species = species;
    this.visible = true;
  }
  setup(root) {
    this.root = root;
    root.userData.agent = this;
    this.sys.group.add(root);
  }
  camDist() { return this.root.position.distanceTo(this.sys.camPos); }
}

// ============================================================
// カニ（コメツキガニ／ヤマトオサガニ）
// ============================================================
const CLAW_POSES = {
  rest: { yaw0: 0.85, p0: -0.45, f1: 1.75, p1: 0.25, f2: 0.75, p2: 0.1, open: 0.05 },
  reach: { yaw0: 0.75, p0: -0.95, f1: 1.05, p1: -0.35, f2: 0.35, p2: -0.5, open: 0.45 },
  mouth: { yaw0: 0.9, p0: -0.15, f1: 2.0, p1: 0.45, f2: 1.05, p2: 0.35, open: 0.0 },
  waveUp: { yaw0: 0.35, p0: 1.15, f1: 0.55, p1: 0.75, f2: 0.25, p2: 0.2, open: 0.15 },
  tuck: { yaw0: 1.0, p0: -0.2, f1: 2.1, p1: 0.35, f2: 1.2, p2: 0.2, open: 0.0 },
};
// ヤマトオサガニ：頑丈なはさみを顔の前に垂らし、掌の面を前に向ける
const CLAW_POSES_Y = {
  rest: { yaw0: 1.0, p0: 0.12, f1: 1.45, p1: 0.0, f2: 0.5, p2: -0.95, open: 0.12 },
  reach: { yaw0: 0.95, p0: -0.05, f1: 1.25, p1: -0.1, f2: 0.6, p2: -1.25, open: 0.45 },
  mouth: { yaw0: 1.05, p0: 0.35, f1: 1.8, p1: 0.15, f2: 0.55, p2: -0.6, open: 0.0 },
  waveUp: { yaw0: 0.7, p0: 1.0, f1: 1.0, p1: 0.4, f2: 0.4, p2: 0.1, open: 0.25 },
  tuck: { yaw0: 1.1, p0: -0.15, f1: 1.9, p1: 0.2, f2: 0.8, p2: -1.0, open: 0.0 },
};
// コメツキガニ：体が低いので腕を持ち上げ、平たい掌を前に向けて指先を内下方へ（正面から見て V 字）
const CLAW_POSES_K = {
  rest: { yaw0: 1.0, p0: 0.5, f1: 1.4, p1: 0.0, f2: 0.55, p2: -0.85, open: 0.12 },
  reach: { yaw0: 0.9, p0: 0.2, f1: 1.2, p1: -0.1, f2: 0.65, p2: -1.15, open: 0.5 },
  mouth: { yaw0: 1.05, p0: 0.7, f1: 1.75, p1: 0.15, f2: 0.5, p2: -0.45, open: 0.0 },
  waveUp: { yaw0: 0.7, p0: 1.1, f1: 1.0, p1: 0.4, f2: 0.4, p2: 0.1, open: 0.25 },
  tuck: { yaw0: 1.1, p0: 0.2, f1: 1.9, p1: 0.2, f2: 0.8, p2: -0.9, open: 0.0 },
};
function mixPose(a, b, t, out = {}) { for (const k in a) out[k] = a[k] + (b[k] - a[k]) * t; return out; }
function setClaw(c, p) {
  const s = c.s;
  c.g0.rotation.set(0, s > 0 ? -p.yaw0 : Math.PI + p.yaw0, p.p0);
  c.g1.rotation.set(0, -s * p.f1, p.p1);
  c.g2.rotation.set(0, -s * p.f2, p.p2);
  c.g3.rotation.z = p.open;
}
function setEyes(parts, E, alert, t = 0) {
  for (const e of parts.eyes) {
    e.g.rotation.set(0, e.s > 0 ? -E.yaw : Math.PI + E.yaw, E.up + E.raise * alert + Math.sin(t * 0.7 + e.s) * 0.03);
  }
}

class Crab extends Agent {
  constructor(sys, species, x, z, rnd) {
    super(sys, species);
    const S = CRAB_SPECS[species];
    this.S = S;
    this.rnd = rnd;
    this.male = rnd() < 0.5;
    const mats = sys.crabMaterials(species, rnd());
    this.mats = mats;
    this.parts = buildCrab(species, mats, this.male);
    this.setup(this.parts.root);
    this.scale = species === 'kometsuki' ? 0.85 + rnd() * 0.3 : 0.8 + rnd() * 0.35;
    this.rig = new LegRig(this.parts.body, this.parts.legs, {
      phiD: S.phiD, stepTime: S.stepTime, stepH: S.stepH * this.scale, stepThresh: S.stepThresh * this.scale,
    });
    this.initLOD(sys, species, mats.shell);
    this.parts.root.scale.setScalar(this.scale);
    this.home = new THREE.Vector2(x, z);
    this.holeR = (species === 'kometsuki' ? 0.12 : 0.3) * this.scale;
    this.burrow = this.world.makeBurrow(x, z, this.holeR, { rim: species === 'kometsuki' ? 0.5 : 0.3 });
    this.p = new THREE.Vector2(x, z);
    this.vel = new THREE.Vector3();
    this.yaw = rnd() * TAU;
    this.sink = 1;
    this.state = 'hidden';
    this.timer = rnd() * 4;
    this.target = new THREE.Vector2(x, z);
    this.gait = rnd() * 10;
    this.wave = 0;
    this.pelletT = 0;
    this.feedPh = rnd();
    this.pose = {};
    this.moving = false;
    this.animate(0, 0, true);
  }

  initLOD(sys, species, shellMat) {
    const key = species + (this.male ? 'M' : 'F');
    const r = this.parts.root;
    if (!sys.lodCache[key]) {
      // 低解像度の個体を平らな地面で静止姿勢にしてから1つにまとめる
      const lp = buildCrab(species, { ...this.mats, shell: shellMat }, this.male, 4);
      const lr = new LegRig(lp.body, lp.legs, { phiD: this.S.phiD });
      lr.update(0, FLAT, null, false);
      for (const c of lp.claws) setClaw(c, (species === 'kometsuki' ? CLAW_POSES_K : CLAW_POSES_Y).rest);
      setEyes(lp, this.S.eye, 0.92);
      sys.lodCache[key] = buildLODGeometry(lp.root);
    }
    const L = sys.lodCache[key];
    const mats = L.materials.map((m, i) => (i === 0 ? shellMat : m));
    this.lod = new THREE.Mesh(L.geometry, mats);
    this.lod.castShadow = true; this.lod.receiveShadow = true;
    this.lod.visible = false;
    r.add(this.lod);
  }

  exposed() { return this.world.depthAt(this.home.x, this.home.y) < -0.03; }

  pickTarget() {
    const a = this.rnd() * TAU, r = (this.species === 'kometsuki' ? 2.2 : 3.5) * Math.sqrt(this.rnd());
    this.target.set(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
  }

  update(dt, t) {
    const exposed = this.exposed();
    const localDepth = this.world.depthAt(this.p.x, this.p.y);
    const speed = (this.species === 'kometsuki' ? 0.5 : 0.75) * this.scale;
    this.timer -= dt;
    let move = false;
    const wet = !exposed || localDepth > -0.005;
    switch (this.state) {
      case 'hidden':
        this.sink = damp(this.sink, 1, 3, dt);
        if (exposed && this.timer <= 0) {
          this.state = 'emerge'; this.p.copy(this.home);
          this.sys.puffs.emit(this.home.x, this.world.heightAt(this.home.x, this.home.y) + 0.03, this.home.y, 5, 0.12, this.rnd);
        }
        break;
      case 'emerge':
        this.sink = damp(this.sink, 0, 1.6, dt);
        if (this.sink < 0.02) { this.sink = 0; this.state = 'idle'; this.timer = 1 + this.rnd() * 2; this.rig.reset(); }
        break;
      case 'idle':
        if (wet) { this.state = 'return'; break; }
        if (this.timer <= 0) {
          const r = this.rnd();
          if (r < 0.45) { this.pickTarget(); this.state = 'walk'; this.timer = 8; }
          else if (r < 0.85 || this.species === 'kometsuki' || !this.male) { this.state = 'feed'; this.timer = 4 + this.rnd() * 7; this.pickTarget(); }
          else { this.state = 'wave'; this.timer = 3 + this.rnd() * 4; }
        }
        break;
      case 'walk':
        if (wet) { this.state = 'return'; break; }
        move = this.stepToward(this.target, speed, dt);
        if (!move || this.timer <= 0) { this.state = 'idle'; this.timer = 0.4 + this.rnd() * 2; }
        break;
      case 'feed':
        if (wet) { this.state = 'return'; break; }
        // 少しずつ横歩きしながら砂をすくって食べる
        if (Math.sin(t * 0.8 + this.gait) > 0.55) move = this.stepToward(this.target, speed * 0.3, dt);
        {
          // コメツキガニは砂団子、ヤマトオサガニは泥の小さな粒を残す
          const K = this.species === 'kometsuki';
          this.pelletT -= dt;
          if (this.pelletT <= 0) {
            this.pelletT = K ? 1.1 + this.rnd() * 0.9 : 1.6 + this.rnd() * 1.4;
            const back = this.yaw + (K ? Math.PI : 0) + (this.rnd() - 0.5) * 1.4;
            const d = this.S.l * (K ? 1.9 : 1.3) * this.scale;
            const px = this.p.x + Math.sin(back) * d, pz = this.p.y + Math.cos(back) * d;
            const it = this.sys.pellets.add(px, this.world.heightAt(px, pz), pz, (K ? 0.75 + this.rnd() * 0.5 : 0.45 + this.rnd() * 0.3) * this.scale);
            if (!K) it.mud = true;
          }
        }
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 0.3 + this.rnd(); }
        break;
      case 'wave':
        if (wet) { this.state = 'return'; break; }
        this.wave = Math.min(1, this.wave + dt * 2);
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 1 + this.rnd(); }
        break;
      case 'return':
        move = this.stepToward(this.home, speed * 1.7, dt);
        if (!move) this.state = 'dig';
        break;
      case 'dig':
        this.sink = damp(this.sink, 1, 2.0, dt);
        if (this.sink > 0.97) {
          this.state = 'hidden'; this.timer = 2 + this.rnd() * 6;
          this.sys.puffs.emit(this.home.x, this.world.heightAt(this.home.x, this.home.y) + 0.02, this.home.y, 4, 0.08, this.rnd);
        }
        break;
    }
    if (this.state !== 'wave') this.wave = Math.max(0, this.wave - dt * 1.5);
    this.moving = move;
    this.animate(dt, t, false);
    this.visible = this.sink < 0.9;
    this.root.visible = this.visible;
  }

  stepToward(target, speed, dt) {
    const dx = target.x - this.p.x, dz = target.y - this.p.y;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return false;
    // カニは横歩き：体の左右軸を進行方向へ向ける
    const dirYaw = Math.atan2(dx, dz);
    const side = angDiff(this.yaw + Math.PI / 2, dirYaw);
    const side2 = angDiff(this.yaw - Math.PI / 2, dirYaw);
    const turn = Math.abs(side) < Math.abs(side2) ? side : side2;
    this.yaw += clamp(turn, -dt * 2.2, dt * 2.2);
    const step = Math.min(d, speed * dt);
    this.p.x += (dx / d) * step;
    this.p.y += (dz / d) * step;
    this.vel.set((dx / d) * speed, 0, (dz / d) * speed);
    this.gait += dt * 9;
    return true;
  }

  animate(dt, t, init) {
    const P = this.parts, S = this.S;
    const depthY = -this.sink * (S.Hb + S.h * 2.5) * 1.3;
    placeOnGround(this.world, this.root, this.p.x, this.p.y, this.yaw, depthY * this.scale, 0.85);
    if (!this.moving) this.vel.multiplyScalar(0.8);
    const near = init || this.camDist() < LOD_DIST * (this.sys.lodScale || 1);
    P.body.visible = near;
    this.lod.visible = !near;
    if (!near) { this.rig.reset(); return; }
    // 体の上下動と呼吸
    P.body.position.y = S.Hb + Math.sin(t * 2.3 + this.gait) * 0.003 + (this.moving ? Math.abs(Math.sin(this.gait * 2)) * 0.008 : 0);
    P.body.rotation.z = this.moving ? Math.sin(this.gait) * 0.03 : 0;
    if (this.sink > 0.05) this.rig.fold(clamp(this.sink * 1.5, 0, 1));
    else this.rig.update(dt, this.world, this.vel, this.moving);

    // はさみ
    const feeding = this.state === 'feed';
    const CP = this.species === 'kometsuki' ? CLAW_POSES_K : CLAW_POSES_Y;
    for (const c of P.claws) {
      let pose;
      if (this.sink > 0.05) pose = mixPose(CP.rest, CP.tuck, clamp(this.sink * 2, 0, 1), this.pose);
      else if (feeding) {
        const ph = (t * (this.species === 'kometsuki' ? 1.6 : 1.1) + this.feedPh + (c.s > 0 ? 0 : 0.5)) % 1;
        const k = ph < 0.5 ? sstep(0, 0.5, ph) : 1 - sstep(0.5, 1, ph);
        pose = mixPose(CP.mouth, CP.reach, k, this.pose);
      } else {
        const big = c.s > 0 && this.male && this.species === 'yamato';
        const w = this.wave * (big ? 1 : 0.35) * (0.5 + 0.5 * Math.sin(t * 2.6 + (c.s > 0 ? 0 : 0.5)));
        pose = mixPose(CP.rest, CP.waveUp, w, this.pose);
      }
      setClaw(c, pose);
    }
    // 眼柄：活動中は潜望鏡のように立てる
    const alert = (1 - clamp(this.sink * 1.5, 0, 1)) * (this.state === 'wave' || this.moving ? 1 : 0.92);
    setEyes(P, S.eye, alert, t);
    // 口器の動き
    for (const m of P.mouth) m.rotation.x = -0.35 + (feeding ? Math.sin(t * 14 + m.position.x * 40) * 0.12 : 0);
  }
}

// ============================================================
// ニホンスナモグリ
// ============================================================
class GhostShrimp extends Agent {
  constructor(sys, x, z, rnd) {
    super(sys, 'sunamogri');
    this.rnd = rnd;
    const w = this.world;
    const ms = 0.8 + rnd() * 0.5;
    this.ms = ms;
    // 火山型のマウンドと中央の竪穴
    const bump = (r, a) => {
      const b = 0.3 * Math.exp(-((r - 0.24) ** 2) / 0.045) * sstep(0.02, 0.18, r) * (1 - sstep(0.55, 1.0, r));
      return [b * ms * (1 + 0.2 * Math.sin(a * 3 + x) + 0.08 * Math.sin(a * 7)), 1];
    };
    this.mound = w.makeGroundFeature(x, z, 1.1 * ms, bump, { shaft: { r: 0.12, depth: 0.9 }, cast: true, silt: 0.5, rings: 26 });
    this.baseY = w.heightAt(x, z) + bump(0.11, 0)[0] * 0.8;

    const K = shrimpKit();
    const seed = rnd();
    const common = { key: 'shrimp', glsl: GLSL.shrimp, sss: 0xff9f8a, sssK: 0.6, seed, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: 0xffd0c0 };
    const carMat = organicMaterial({ ...common, colors: [0xd8c2b8, 0xe6d4ca, 0xd0622a, 0], P: [1, 0.6, 0, 0], transparent: true, opacity: 0.9 });
    const bodyMat = organicMaterial({ ...common, colors: [0xdcc4b8, 0xe8d6cc, 0xd08a64, 0], P: [0.2, 1, 0, 0], transparent: true, opacity: 0.9 });
    const clawMat = organicMaterial({ ...common, colors: [0xe8dcc8, 0xf0e6d4, 0xd8b088, 0], P: [0, 0, 0, 0], sss: 0xffc0a0, sssK: 0.5 });

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    body.add(new THREE.Mesh(K.car, carMat));
    // 腹節の連鎖（後方へ）
    this.segs = [];
    let parent = body;
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.position.z = i === 0 ? 0.0 : -0.112;
      g.add(new THREE.Mesh(K.segs[i], bodyMat));
      parent.add(g);
      this.segs.push(g);
      parent = g;
    }
    const tailG = new THREE.Group(); tailG.position.z = -0.11;
    tailG.add(new THREE.Mesh(K.tail, bodyMat));
    parent.add(tailG);
    // 鉗脚（右が大きい）
    this.claws = [];
    for (const s of [1, -1]) {
      const big = s > 0 ? 1 : 0.55;
      const sh = new THREE.Group();
      sh.position.set(s * 0.08, -0.05, 0.36);
      sh.rotation.set(0, s > 0 ? -1.2 : Math.PI + 1.2, -0.25);
      const arm = new THREE.Mesh(K.arm, clawMat); arm.scale.setScalar(big); sh.add(arm);
      const wr = new THREE.Group(); wr.position.x = 0.12 * big; wr.rotation.y = -s * 0.5; sh.add(wr);
      const palm = new THREE.Mesh(K.bigPalm, clawMat); palm.scale.setScalar(big); wr.add(palm);
      const dj = new THREE.Group(); dj.position.set(0.21 * big, 0.035 * big, 0); wr.add(dj);
      const dm = new THREE.Mesh(K.bigDact, clawMat); dm.scale.setScalar(big); dj.add(dm);
      body.add(sh);
      this.claws.push({ sh, wr, dj, s });
    }
    // 歩脚
    this.legs = [];
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.085, -0.07, 0.27 - i * 0.08);
      hip.rotation.set(0, s > 0 ? 0.15 * i - 0.3 : Math.PI - 0.15 * i + 0.3, -0.7);
      hip.add(new THREE.Mesh(K.leg, bodyMat));
      const kn = new THREE.Group(); kn.position.x = 0.16; kn.rotation.z = -0.9;
      kn.add(new THREE.Mesh(K.legD, bodyMat));
      hip.add(kn);
      body.add(hip);
      this.legs.push(hip);
    }
    // 触角と眼
    for (const s of [1, -1]) {
      const a = new THREE.Mesh(K.antenna, clawMat);
      a.position.set(s * 0.03, 0.02, 0.43);
      a.rotation.set(0, -Math.PI / 2 + s * 0.35, 0.15);
      body.add(a);
      const e = new THREE.Mesh(K.eye, sys.corneaMat);
      e.position.set(s * 0.028, 0.045, 0.42);
      body.add(e);
    }
    shadowAll(root);
    this.setup(root);
    this.body = body;
    this.p = new THREE.Vector2(x, z);
    this.yaw = rnd() * TAU;
    this.out = 0;
    this.targetOut = 0;
    this.timer = 3 + rnd() * 10;
    this.scale = 1.1 + rnd() * 0.25;
    root.scale.setScalar(this.scale);
  }
  update(dt, t) {
    const depth = this.world.depthAt(this.p.x, this.p.y);
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.targetOut > 0) { this.targetOut = 0; this.timer = 6 + this.rnd() * 14; }
      else {
        // 冠水時はよく顔を出す。干出時は稀に入口まで。
        const chance = depth > 0.05 ? 0.85 : 0.2;
        this.targetOut = this.rnd() < chance ? 0.3 + this.rnd() * 0.4 : 0;
        this.timer = 3 + this.rnd() * 6;
        if (this.targetOut > 0) this.sys.puffs.emit(this.p.x, this.baseY + 0.03, this.p.y, 12, 0.25, this.rnd);
      }
    }
    this.out = damp(this.out, this.targetOut, this.targetOut > this.out ? 1.2 : 3.5, dt);
    // 穴から斜め上へ頭を出す
    _q.setFromEuler(new THREE.Euler(-1.05, this.yaw, 0, 'YXZ'));
    this.root.quaternion.copy(_q);
    const len = 1.05 * this.scale;
    _v.set(0, 0, (this.out - 0.92) * len).applyQuaternion(_q);
    this.root.position.set(this.p.x + _v.x, this.baseY + _v.y, this.p.y + _v.z);
    // 腹部をくねらせ、はさみで砂を掻き出す
    this.segs.forEach((s, i) => { s.rotation.x = Math.sin(t * 3 + i * 0.8) * 0.05 + 0.12; });
    for (const c of this.claws) {
      c.dj.rotation.z = 0.15 + Math.max(0, Math.sin(t * 2.2 + c.s)) * 0.3;
      c.wr.rotation.z = Math.sin(t * 1.3 + c.s) * 0.15;
    }
    this.legs.forEach((l, i) => { l.rotation.z = -0.7 + Math.sin(t * 6 + i) * 0.15; });
    this.visible = this.out > 0.04;
    this.root.visible = this.visible;
  }
}

// ============================================================
// ハゼの稚魚
// ============================================================
const BEND_GLSL = `
  { float w = smoothstep(0.3, -0.6, transformed.z);
    transformed.x += (sin(transformed.z*6.0 - uPhase)*uAmp + uTurn*transformed.z*transformed.z*0.8) * w; }`;

function finMaterial(U, o) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, transparent: true, side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.4 });
  const F = { uMem: { value: new THREE.Color(o.mem) }, uRay: { value: new THREE.Color(o.ray) }, uSpot: { value: new THREE.Color(o.spot) }, uRays: { value: o.rays }, uFSeed: { value: o.seed } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, F);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 finUV; varying vec2 vFin; uniform float uPhase; uniform float uAmp; uniform float uTurn;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFin = finUV;
        ${BEND_GLSL}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vFin; uniform vec3 uMem; uniform vec3 uRay; uniform vec3 uSpot; uniform float uRays; uniform float uFSeed;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ray = pow(abs(cos(vFin.x * uRays * 3.14159)), 8.0);
        float edge = 1.0 - smoothstep(0.82, 1.0, vFin.y);
        float spots = smoothstep(0.6, 0.8, sin(vFin.y*17.0 + vFin.x*4.0 + uFSeed*6.0)*0.5+0.5) * ray * smoothstep(0.05, 0.2, vFin.y);
        vec3 fc = mix(uMem, uRay, ray);
        fc = mix(fc, uSpot, spots * 0.85);
        diffuseColor.rgb = fc;
        diffuseColor.a = (0.22 + 0.55*ray + 0.3*spots) * edge;`);
  };
  m.customProgramCacheKey = () => 'fin';
  return m;
}

class Goby extends Agent {
  constructor(sys, species, x, z, rnd) {
    super(sys, species);
    this.rnd = rnd;
    const K = gobyKit();
    const mahaze = species === 'mahaze';
    const seed = rnd();
    this.U = { uPhase: { value: 0 }, uAmp: { value: 0.03 }, uTurn: { value: 0 } };
    const U = this.U;
    const bendHook = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        ${BEND_GLSL}`);
    };
    const bodyMat = organicMaterial({
      key: 'goby', glsl: GLSL.goby, seed, vertex: bendHook, extraUniforms: U,
      colors: mahaze ? [0x4a4232, 0x8a7c60, 0xdcd6c8, 0x1e1a12] : [0x9c8c6c, 0xc4b89c, 0xece6da, 0x6a4a2a],
      P: mahaze ? [26, 1, 0, 0] : [34, 0.6, 0, 0],
      sss: mahaze ? 0xffc890 : 0xffd8a8, sssK: mahaze ? 0.35 : 0.45,
      roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, sheen: 0.6, sheenColor: 0xc8d0d8, sheenRoughness: 0.4,
    });
    const finMat = finMaterial(U, mahaze
      ? { mem: 0xb8ae96, ray: 0x6e604a, spot: 0x2a2218, rays: 7, seed }
      : { mem: 0xd8cebc, ray: 0x9a8868, spot: 0x9a5024, rays: 7, seed });
    const root = new THREE.Group();
    const body = new THREE.Mesh(K.body, bodyMat);
    body.castShadow = true;
    root.add(body);
    this.pecs = [];
    for (const k of Object.keys(K.fins)) {
      const f = new THREE.Mesh(K.fins[k], finMat);
      f.renderOrder = 2;
      root.add(f);
      if (k.startsWith('pec')) this.pecs.push({ m: f, s: k.endsWith('-1') ? -1 : 1 });
    }
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(K.eye, sys.fishEyeMat);
      e.position.set(s * 0.036, 0.046, 0.385);
      e.rotation.set(0, s > 0 ? 0 : Math.PI, 0.55);
      e.castShadow = true;
      root.add(e);
    }
    this.len = mahaze ? 1.0 + rnd() * 0.35 : 0.78 + rnd() * 0.2;
    root.scale.setScalar(this.len);
    this.setup(root);
    this.p = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = rnd() * TAU;
    this.target = new THREE.Vector3(x, 0, z);
    this.timer = 0;
    this.phase = rnd() * 10;
    this.rest = !mahaze;
    this.resting = 0;
    this.stranded = false;
  }
  findWater(minDepth) {
    const w = this.world;
    for (let k = 0; k < 14; k++) {
      const a = this.rnd() * TAU, r = 1 + this.rnd() * (k < 8 ? 6 : 16);
      const x = this.p.x + Math.cos(a) * r, z = this.p.z + Math.sin(a) * r;
      if (Math.hypot(x, z) < PLAY_RADIUS && w.depthAt(x, z) > minDepth) return this.target.set(x, 0, z);
    }
    const zc = clamp(this.p.z + (this.rnd() - 0.5) * 10, -PLAY_RADIUS * 0.9, PLAY_RADIUS * 0.9);
    return this.target.set(channelCenter(zc) + (this.rnd() - 0.5) * 3, 0, zc);
  }
  update(dt, t) {
    const w = this.world;
    const depth = w.depthAt(this.p.x, this.p.z);
    const minD = this.rest ? 0.15 : 0.28;
    this.timer -= dt;
    const tDepth = w.depthAt(this.target.x, this.target.z);
    if (this.timer <= 0 || tDepth < minD) {
      this.findWater(minD + 0.1);
      this.timer = this.rest ? 1.5 + this.rnd() * 4 : 2 + this.rnd() * 5;
      if (this.rest) this.resting = this.rnd() < 0.7 ? 1 : 0;
    }
    let speed = this.rest ? 2.0 : 1.4;
    _v.set(this.target.x - this.p.x, 0, this.target.z - this.p.z);
    const d = _v.length();
    if (this.rest && this.resting && d < 0.5) speed = 0;
    if (!this.rest) {
      const sc = this.sys.schoolCenter;
      _v.addScaledVector(_n.set(sc.x - this.p.x, 0, sc.z - this.p.z), 0.08);
    }
    if (depth < minD * 0.6) { this.findWater(minD + 0.2); speed = 3.0; }
    _v.normalize();
    // ヒメハゼは止まっては短く跳ねるように泳ぐ
    let burst;
    if (this.rest) burst = Math.max(0, Math.sin(t * 2.2 + this.phase)) ** 3 * 2.2;
    else burst = 0.6 + 0.4 * Math.max(0, Math.sin(t * 0.9 + this.phase));
    this.vel.lerp(_n.copy(_v).multiplyScalar(speed * burst), 1 - Math.exp(-dt * 3));
    this.p.addScaledVector(this.vel, dt);
    const sp = this.vel.length();
    if (sp > 0.05) {
      const ty = Math.atan2(this.vel.x, this.vel.z);
      const dy = angDiff(this.yaw, ty);
      this.yaw += dy * (1 - Math.exp(-dt * 6));
      this.U.uTurn.value = damp(this.U.uTurn.value, clamp(dy, -1, 1) * 0.6, 6, dt);
    }
    const ground = w.heightAt(this.p.x, this.p.z);
    const dNow = w.water - ground;
    let yT;
    if (this.rest) yT = ground + this.len * 0.075 + (burst > 0.2 ? 0.06 : 0);
    else yT = ground + clamp(dNow * 0.4, 0.14, 1.0);
    yT = Math.min(yT, w.water - 0.1);
    this.p.y = damp(this.p.y || yT, yT, 4, dt);
    this.stranded = dNow < 0.08;
    this.root.position.copy(this.p);
    // 底にいるときは地形の傾きに合わせる
    const pitch = this.rest ? -Math.atan2(w.heightAt(this.p.x + Math.sin(this.yaw) * 0.3, this.p.z + Math.cos(this.yaw) * 0.3) - ground, 0.3) : 0;
    this.root.rotation.set(pitch, this.yaw, 0, 'YXZ');
    this.phase += dt * (3 + sp * 10);
    this.U.uPhase.value = this.phase;
    this.U.uAmp.value = 0.012 + sp * 0.022;
    for (const p of this.pecs) p.m.rotation.y = p.s * (0.08 + Math.sin(t * 7 + this.phase) * 0.12);
    this.visible = !this.stranded;
    this.root.visible = this.visible;
  }
}

// ============================================================
// ヤドカリ（ユビナガホンヤドカリ）
// ============================================================
function shellBasis(axis, apertureNormal) {
  const Y = axis.clone().normalize();
  const Z = apertureNormal.clone().multiplyScalar(-1);
  Z.addScaledVector(Y, -Z.dot(Y)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  return new THREE.Matrix4().makeBasis(X, Y, Z);
}

const HERMIT_SHELL = { turns: 7.5, apR: 0.13, coil: 0.085, height: 0.62, shrink: 0.1, ribs: 18, cords: 6, ribAmp: 0.04, cordAmp: 0.05, knobAmp: 0.1, colA: 0x3e3830, colB: 0x6c6254, colC: 0xb8ac98, bands: 1, bandPhase: 1.0, sutureAt: 1.4, perTurn: 44, rad: 18 };

class Hermit extends Agent {
  constructor(sys, x, z, rnd) {
    super(sys, 'yadokari');
    this.rnd = rnd;
    const K = hermitKit();
    const seed = rnd();
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    // 殻（ウミニナ型の高い塔状）：殻頂は後ろ上、殻口は下
    const shellGeo = spiralShell({ ...HERMIT_SHELL, colA: rnd() < 0.5 ? 0x3e3830 : 0x4a4236 });
    const shellMat = organicMaterial({ key: 'gastro', glsl: GLSL.gastropod, vertexColors: true, colors: [0x5a5240], seed, roughness: 0.62, clearcoat: 0.45, clearcoatRoughness: 0.35 });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.matrixAutoUpdate = false;
    this.shellBase = shellBasis(new THREE.Vector3(0, 0.3, -1), new THREE.Vector3(0, -1, 0.25)).setPosition(0.06, 0.15, -0.02);
    shell.matrix.copy(this.shellBase);
    inner.add(shell);
    this.shell = shell;

    const bodyMat = organicMaterial({ key: 'leg', glsl: GLSL.leg, colors: [0x6a5a3c, 0x4e4430, 0xd8d2c0, 0x9a8a6a], seed, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25, sss: 0xb09060, sssK: 0.3 });
    const bandMat = organicMaterial({ key: 'leg', glsl: GLSL.leg, colors: [0x7a6a48, 0x5a4c34, 0xe8e2d4, 0xa89878], seed: seed + 1, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const clawMat = organicMaterial({ key: 'claw', glsl: GLSL.claw, colors: [0x6e6242, 0x8a7c58, 0xe8d8b8], P: [0.2, 0, 0, 0], seed, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const antMat = organicMaterial({ key: 'leg', glsl: GLSL.leg, colors: [0xc8622c, 0xa84c20, 0xe89060, 0xc8622c], seed, roughness: 0.4, clearcoat: 0.5 });
    const body = new THREE.Group();
    body.position.set(0, 0.14, 0.12);
    inner.add(body);
    body.add(new THREE.Mesh(K.shield, bodyMat));
    // 歩脚 2対（IK）
    const legs = [];
    for (const s of [1, -1]) for (let i = 0; i < 2; i++) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.055, -0.03, 0.02 - i * 0.05);
      const baseYaw = s > 0 ? -0.35 + i * 0.55 : Math.PI + 0.35 - i * 0.55;
      hip.rotation.y = baseYaw;
      const F = new THREE.Group();
      F.add(new THREE.Mesh(K.lMerus, i ? bodyMat : bandMat));
      const Kn = new THREE.Group(); Kn.position.x = 0.17;
      Kn.add(new THREE.Mesh(K.lCarpus, bandMat));
      const pr = new THREE.Mesh(K.lProp, bodyMat); pr.position.x = 0.08; Kn.add(pr);
      const D = new THREE.Group(); D.position.x = 0.21;
      D.add(new THREE.Mesh(K.lDact, bandMat));
      Kn.add(D); F.add(Kn); hip.add(F); body.add(hip);
      const reach = 0.3;
      legs.push({
        hip, F, K: Kn, D, a: 0.17, b: 0.21, dl: 0.19 * Math.hypot(1, 0.22), dAng: Math.atan(0.22), baseYaw, s, i,
        restLocal: new THREE.Vector3(hip.position.x + Math.cos(baseYaw) * reach, -0.14, hip.position.z - Math.sin(baseYaw) * reach),
        group: (i + (s > 0 ? 0 : 1)) % 2, foot: new THREE.Vector3(), valid: false, stepping: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(),
      });
    }
    this.rigBody = body;
    this.rig = new LegRig(body, legs, { phiD: 1.0, stepTime: 0.22, stepH: 0.05, stepThresh: 0.07 });
    // 鉗脚（右が大きい）
    this.claws = [];
    for (const s of [1, -1]) {
      const big = s > 0;
      const sh = new THREE.Group();
      sh.position.set(s * 0.04, -0.01, 0.07);
      sh.rotation.set(0, s > 0 ? -1.0 : Math.PI + 1.0, -0.35);
      sh.add(new THREE.Mesh(K.merus, bodyMat));
      const g1 = new THREE.Group(); g1.position.x = 0.13; g1.rotation.set(0, -s * 1.3, 0.2); sh.add(g1);
      g1.add(new THREE.Mesh(K.carpus, clawMat));
      const g2 = new THREE.Group(); g2.position.x = 0.07; g2.rotation.set(0, -s * 0.5, -0.1); g1.add(g2);
      g2.add(new THREE.Mesh(big ? K.palmR : K.palmL, clawMat));
      const P = big ? 0.2 : 0.13, H = big ? 0.11 : 0.06;
      const g3 = new THREE.Group(); g3.position.set(P * 0.56, H * 0.2, 0); g2.add(g3);
      g3.add(new THREE.Mesh(big ? K.dactR : K.dactL, clawMat));
      body.add(sh);
      this.claws.push({ sh, g3, s });
    }
    // 眼柄と触角
    this.eyes = [];
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.018, 0.025, 0.085);
      g.rotation.set(0, -Math.PI / 2 + s * 0.25, 0.6);
      g.add(new THREE.Mesh(K.stalk, bandMat));
      const c = new THREE.Mesh(K.cornea, sys.corneaMat); c.position.x = 0.095; g.add(c);
      body.add(g);
      this.eyes.push(g);
      const a = new THREE.Mesh(K.antenna, antMat);
      a.position.set(s * 0.012, 0.0, 0.1);
      a.rotation.set(0, -Math.PI / 2 + s * 0.45, 0.3);
      body.add(a);
      this.eyes.push(a);
    }
    shadowAll(root);
    this.sc = 0.75 + rnd() * 0.3;
    inner.scale.setScalar(this.sc);
    this.setup(root);
    this.inner = inner;
    this.p = new THREE.Vector2(x, z);
    this.vel = new THREE.Vector3();
    this.yaw = rnd() * TAU;
    this.target = new THREE.Vector2(x, z);
    this.timer = 0;
    this.pause = 0;
    this.gait = 0;
    placeOnGround(this.world, root, x, z, this.yaw, 0, 0.9);
    this.rig.update(0, this.world, null, false);
  }
  update(dt, t) {
    const w = this.world;
    this.timer -= dt;
    if (this.timer <= 0) {
      const a = this.rnd() * TAU, r = 1 + this.rnd() * 4;
      let x = this.p.x + Math.cos(a) * r, z = this.p.y + Math.sin(a) * r;
      if (Math.hypot(x, z) > PLAY_RADIUS) { x *= 0.8; z *= 0.8; }
      this.target.set(x, z);
      this.timer = 5 + this.rnd() * 8;
      this.pause = this.rnd() < 0.4 ? 2 + this.rnd() * 5 : 0;
    }
    const exposed = w.depthAt(this.p.x, this.p.y) < 0;
    let move = false;
    if (this.pause > 0) this.pause -= dt;
    else {
      const dx = this.target.x - this.p.x, dz = this.target.y - this.p.y, d = Math.hypot(dx, dz);
      if (d > 0.1) {
        const ty = Math.atan2(dx, dz);
        this.yaw += clamp(angDiff(this.yaw, ty), -dt * 1.2, dt * 1.2);
        const sp = (exposed ? 0.18 : 0.3) * this.sc;
        this.p.x += Math.sin(this.yaw) * sp * dt; this.p.y += Math.cos(this.yaw) * sp * dt;
        this.vel.set(Math.sin(this.yaw) * sp, 0, Math.cos(this.yaw) * sp);
        this.gait += dt * 6;
        move = true;
      }
    }
    if (!move) this.vel.multiplyScalar(0.8);
    placeOnGround(w, this.root, this.p.x, this.p.y, this.yaw, 0, 0.9);
    const near = this.camDist() < LOD_DIST * 1.2;
    // 殻を引きずるように揺らす
    const sway = move ? Math.sin(this.gait * 2) * 0.05 : 0;
    this.shell.matrix.copy(this.shellBase).premultiply(_m.makeRotationZ(sway));
    this.rigBody.position.y = 0.14 + (move ? Math.abs(Math.sin(this.gait * 2)) * 0.01 : 0);
    if (near) this.rig.update(dt, w, this.vel, move);
    else this.rig.reset();
    for (const c of this.claws) c.g3.rotation.z = 0.1 + Math.max(0, Math.sin(t * 1.7 + c.s * 2)) * 0.25;
    this.eyes.forEach((e, i) => { e.rotation.z = (i % 2 ? 0.3 : 0.6) + Math.sin(t * 2 + i) * 0.08; });
  }
}

// ============================================================
// アラムシロガイ
// ============================================================
const NASSA_SHELL = { turns: 5.2, apR: 0.16, coil: 0.1, height: 0.5, shrink: 0.1, ribs: 17, cords: 9, ribAmp: 0.03, cordAmp: 0.03, knobAmp: 0.11, colA: 0x8a7a5e, colB: 0xcdbf9e, colC: 0x6a5840, bands: 1, bandPhase: 2.4, sutureAt: 1.6, perTurn: 52, rad: 20 };

class Nassa extends Agent {
  constructor(sys, x, z, rnd) {
    super(sys, 'arumushiro');
    this.rnd = rnd;
    const K = nassaKit();
    const seed = rnd();
    const root = new THREE.Group();
    const shell = new THREE.Mesh(spiralShell(NASSA_SHELL), sys.nassaShellMat);
    shell.matrixAutoUpdate = false;
    shell.matrix.copy(shellBasis(new THREE.Vector3(0, 0.75, -1), new THREE.Vector3(0, -1, 0.6))).setPosition(0.07, 0.12, -0.02);
    root.add(shell);
    const soft = organicMaterial({ key: 'soft', glsl: GLSL.softBody, colors: [0xb8b0a2, 0xa29888, 0x2e2620], seed, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, sss: 0xd8c8b0, sssK: 0.35 });
    const foot = new THREE.Mesh(K.foot, soft);
    foot.position.set(0, 0.03, 0.02);
    root.add(foot);
    this.foot = foot;
    const siph = new THREE.Mesh(K.siphon, soft);
    siph.position.set(0, 0.15, 0.12);
    root.add(siph);
    this.siph = siph;
    this.tents = [];
    for (const s of [1, -1]) {
      const tn = new THREE.Mesh(K.tentacle, soft);
      tn.position.set(s * 0.05, 0.05, 0.28);
      tn.rotation.set(0, -Math.PI / 2 + s * 0.6, 0.2);
      root.add(tn);
      this.tents.push(tn);
    }
    shadowAll(root);
    this.sc = 0.8 + rnd() * 0.35;
    root.scale.setScalar(this.sc);
    this.setup(root);
    this.p = new THREE.Vector2(x, z);
    this.yaw = rnd() * TAU;
    this.active = 0;
    this.phase = rnd() * 10;
  }
  update(dt, t) {
    const w = this.world;
    const depth = w.depthAt(this.p.x, this.p.y);
    const submerged = depth > 0.02;
    this.active = damp(this.active, submerged ? 1 : 0.1, 1, dt);
    const bait = this.sys.bait;
    let ty = this.yaw + Math.sin(t * 0.3 + this.phase) * 0.8;
    if (submerged && bait) {
      const bx = bait.x - this.p.x, bz = bait.z - this.p.y;
      const bd = Math.hypot(bx, bz);
      if (bd < 18) ty = Math.atan2(bx, bz) + Math.sin(t * 0.8 + this.phase) * 0.5;
      if (bd < 0.7 + (this.phase % 1) * 0.8) this.active *= 0.3;
    }
    this.yaw += clamp(angDiff(this.yaw, ty), -dt * 0.8, dt * 0.8);
    const sp = 0.15 * this.active * dt;
    this.p.x += Math.sin(this.yaw) * sp; this.p.y += Math.cos(this.yaw) * sp;
    if (Math.hypot(this.p.x, this.p.y) > PLAY_RADIUS) this.yaw += Math.PI * dt;
    placeOnGround(w, this.root, this.p.x, this.p.y, this.yaw, submerged ? 0 : -0.03, 1);
    // 水管を左右に振ってにおいを探る
    const a = this.active;
    this.siph.rotation.set(-0.2 + Math.sin(t * 0.9 + this.phase) * 0.2, Math.sin(t * 0.6 + this.phase) * 0.6 * a, 0);
    this.siph.scale.setScalar(0.35 + a * 0.65);
    this.foot.scale.set(0.8 + a * 0.2, 1, 0.55 + a * 0.45 + Math.sin(t * 1.5 + this.phase) * 0.03 * a);
    for (const tn of this.tents) tn.scale.setScalar(0.3 + a * 0.7);
  }
}

// ============================================================
// アサリ
// ============================================================
const ASARI_PALETTES = [
  [0xb8ab98, 0x4e3e30, 0xd8ccb8, 0x8a6f86],
  [0x8c8378, 0x2e2822, 0xc8bfae, 0x7a6478],
  [0xc6b59a, 0x5e3e2c, 0xe8dcc6, 0x9a7a90],
  [0x9d958c, 0x262220, 0xd4ccc0, 0x6e5a6c],
  [0xae9272, 0x4a3022, 0xe0cfb4, 0x8a6a80],
];

class Clam extends Agent {
  constructor(sys, x, z, rnd, exposedShell) {
    super(sys, 'asari');
    this.rnd = rnd;
    const w = this.world;
    const seed = rnd();
    const pal = ASARI_PALETTES[Math.floor(rnd() * ASARI_PALETTES.length)];
    const shellMat = organicMaterial({ key: 'asari', glsl: GLSL.asari, colors: pal, seed, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(asariGeo(), shellMat));
    this.sc = 0.8 + rnd() * 0.45;
    root.scale.setScalar(this.sc);
    shadowAll(root);
    this.setup(root);
    this.p = new THREE.Vector2(x, z);
    this.yaw = rnd() * TAU;
    this.exposedShell = exposedShell;
    this.phase = rnd() * 10;
    this.ext = 0;
    const g = w.heightAt(x, z);
    if (exposedShell) {
      // 波で掘り出され、半分ほど砂に埋まって横たわる個体
      placeOnGround(w, root, x, z, this.yaw, 0, 0.8);
      root.rotateX(Math.PI / 2 * (rnd() < 0.5 ? 1 : -1) + (rnd() - 0.5) * 0.4);
      root.position.y = g - 0.06 * this.sc;
    } else {
      // 砂の中に立って埋まり、水管だけが砂の表面に届く
      root.position.set(x, g - 0.75 * this.sc, z);
      root.rotation.set((rnd() - 0.5) * 0.3, this.yaw, -0.35);
      root.children[0].visible = false;   // 砂の中なので描かない
      const sx = x - Math.cos(this.yaw) * 0.35 * this.sc, sz = z + Math.sin(this.yaw) * 0.35 * this.sc;
      this.hole = w.makeBurrow(sx, sz, 0.075 * this.sc, { rim: 0.2, sx: 1.25, rot: -this.yaw });
      const siph = new THREE.Mesh(siphonGeo(0.055, 0.5), sys.siphonMat);
      siph.castShadow = true;
      siph.receiveShadow = true;
      siph.rotation.y = -this.yaw;
      siph.userData.agent = this;
      sys.group.add(siph);
      this.siph = siph;
      this.siphBase = new THREE.Vector3(sx, w.heightAt(sx, sz), sz);
    }
  }
  update(dt, t) {
    this.visible = true;
    if (this.exposedShell) return;
    const depth = this.world.depthAt(this.p.x, this.p.y);
    const sub = depth > 0.05;
    this.ext = damp(this.ext, sub ? 1 : 0, sub ? 0.5 : 2.2, dt);
    // 水管の先端が砂面から少しだけ出る
    const s = this.sc * 0.9;
    const protrude = lerp(-0.08, 0.07 + 0.015 * Math.sin(t * 1.3 + this.phase), this.ext);
    this.siph.scale.set(s, s, s);
    this.siph.position.set(this.siphBase.x, this.siphBase.y - 0.5 * s + protrude, this.siphBase.z);
    this.siph.visible = this.ext > 0.03;
    this.visible = this.siph.visible;
    if (sub && this.ext > 0.85 && this.rnd() < dt * 0.1) {
      this.sys.puffs.emit(this.siphBase.x, this.siphBase.y + protrude + 0.03, this.siphBase.z, 2, 0.05, this.rnd);
    }
  }
}

// ============================================================
// マテガイ
// ============================================================
class Razor extends Agent {
  constructor(sys, x, z, rnd) {
    super(sys, 'mategai');
    this.rnd = rnd;
    const w = this.world;
    const seed = rnd();
    const root = new THREE.Group();
    const shellMat = organicMaterial({ key: 'razor', glsl: GLSL.razorShell, colors: [0x9a7a44, 0xd4b474, 0x6a5030], seed, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.shellMesh = new THREE.Mesh(razorGeo(), shellMat);
    root.add(this.shellMesh);
    const siph = new THREE.Mesh(siphonGeo(0.05, 0.24, 8), sys.siphonMat);
    siph.position.y = -0.14;
    root.add(siph);
    this.siph = siph;
    shadowAll(root);
    this.setup(root);
    this.p = new THREE.Vector2(x, z);
    this.yaw = rnd() * TAU;
    this.ground = w.heightAt(x, z);
    root.position.set(x, this.ground, z);
    root.rotation.set((rnd() - 0.5) * 0.08, this.yaw, (rnd() - 0.5) * 0.08);
    // 鍵穴形（8の字）の巣穴
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.holes = [
      w.makeBurrow(x - c * 0.08, z + s * 0.08, 0.1, { rim: 0.15 }),
      w.makeBurrow(x + c * 0.08, z - s * 0.08, 0.085, { rim: 0.15 }),
    ];
    this.rise = 0;
    this.targetRise = 0;
    this.timer = 5 + rnd() * 25;
    this.phase = rnd() * 10;
  }
  update(dt, t) {
    const depth = this.world.depthAt(this.p.x, this.p.y);
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.targetRise > 0) { this.targetRise = 0; this.timer = 15 + this.rnd() * 30; }
      else {
        // ときどきぐっと飛び出して、すっと戻る
        this.targetRise = 0.7 + this.rnd() * 1.1; this.timer = 1.5 + this.rnd() * 2.5;
        this.sys.puffs.emit(this.p.x, this.ground + 0.04, this.p.y, 14, 0.25, this.rnd);
      }
    }
    const up = this.targetRise > this.rise;
    this.rise = damp(this.rise, this.targetRise, up ? 5 : 3, dt);
    const sub = depth > 0.04;
    const tip = sub ? 0.06 + Math.sin(t * 1.4 + this.phase) * 0.02 : -0.2;
    this.root.position.y = this.ground + this.rise - 0.1;
    this.siph.position.y = Math.max(tip - this.rise + 0.1 - 0.24, -0.5);
    this.siph.visible = sub || this.rise > 0.05;
    this.shellMesh.visible = this.rise > 0.03;
    this.visible = this.rise > 0.08 || sub;
    this.root.visible = true;
  }
}

// ============================================================
// 生態系
// ============================================================
export class Ecosystem {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.pellets = new PelletField(world.scene);
    this.puffs = new Puffs(world.scene);
    this.agents = [];
    this.schoolCenter = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 30, 0);
    this.bait = null;
    this.lodCache = {};
    const rnd = mulberry32(2024);
    this.rnd = rnd;

    // 種で共有するマテリアル
    this.corneaMat = organicMaterial({ key: 'cornea', glsl: GLSL.cornea, colors: [0x14161a, 0x3c434c], roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 });
    this.fishEyeMat = organicMaterial({ key: 'fishEye', glsl: GLSL.fishEye, colors: [0xc9a24a], roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
    this.siphonMat = organicMaterial({ key: 'siphon', glsl: GLSL.siphon, colors: [0xc4b49c, 0x7a5a3c, 0x3a2a1e], P: [0.5, 0, 0, 0], roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15, sss: 0xe8c8a0, sssK: 0.3 });
    this.nassaShellMat = organicMaterial({ key: 'gastro', glsl: GLSL.gastropod, vertexColors: true, colors: [0x6a5a44], seed: 0.3, roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.3 });
    this.crabShared = {};

    const pick = (test, tries = 400) => {
      for (let k = 0; k < tries; k++) {
        const r = Math.sqrt(rnd()) * PLAY_RADIUS, a = rnd() * TAU;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = world.heightAt(x, z);
        const dc = Math.abs(x - channelCenter(z));
        if (test(h, dc, x, z)) return [x, z];
      }
      return null;
    };
    const taken = [];
    const free = (x, z, r) => { for (const t of taken) if (Math.hypot(t[0] - x, t[1] - z) < r + t[2]) return false; return true; };
    const claim = (x, z, r) => taken.push([x, z, r]);

    // コメツキガニ：高めの砂っぽい場所に群れで
    const komeCenters = [];
    for (let i = 0; i < 5; i++) { const c = pick((h, dc) => h > 0.05 && h < 0.9 && dc > 9); if (c) komeCenters.push(c); }
    for (let i = 0; i < 40; i++) {
      const c = komeCenters[i % komeCenters.length];
      const x = c[0] + (rnd() - 0.5) * 9, z = c[1] + (rnd() - 0.5) * 9;
      if (world.heightAt(x, z) < -0.1 || !free(x, z, 0.5)) continue;
      claim(x, z, 0.5);
      this.add(new Crab(this, 'kometsuki', x, z, rnd));
    }
    // 巣穴のまわりの砂団子
    for (const a of this.agents) for (let k = 0; k < 18; k++) {
      const ang = rnd() * TAU, r = 0.35 + rnd() * 1.5;
      const x = a.home.x + Math.cos(ang) * r, z = a.home.y + Math.sin(ang) * r;
      const it = this.pellets.add(x, world.heightAt(x, z), z, 0.6 + rnd() * 0.7);
      it.age = 30 + rnd() * 200;
    }
    // ヤマトオサガニ：澪筋近くの泥っぽい低い場所
    for (let i = 0; i < 16; i++) {
      const c = pick((h, dc, x, z) => h < 0.1 && h > -0.9 && dc > 4 && dc < 14 && free(x, z, 1.2));
      if (c) { claim(c[0], c[1], 1.2); this.add(new Crab(this, 'yamato', c[0], c[1], rnd)); }
    }
    for (let i = 0; i < 14; i++) {
      const c = pick((h, dc, x, z) => h < 0.2 && h > -1.0 && dc > 5 && free(x, z, 1.3));
      if (c) { claim(c[0], c[1], 1.3); this.add(new GhostShrimp(this, c[0], c[1], rnd)); }
    }
    for (let i = 0; i < 20; i++) {
      const c = pick((h, dc) => dc < 3 && h < -1.2);
      if (c) this.add(new Goby(this, 'mahaze', c[0], c[1], rnd));
    }
    for (let i = 0; i < 12; i++) {
      const c = pick((h, dc) => dc < 5 && h < -0.9);
      if (c) this.add(new Goby(this, 'himehaze', c[0], c[1], rnd));
    }
    for (let i = 0; i < 12; i++) {
      const c = pick((h) => h < 0.2 && h > -1.2);
      if (c) this.add(new Hermit(this, c[0], c[1], rnd));
    }
    // アラムシロガイ：いくつかの群れ
    const nCenters = [];
    for (let i = 0; i < 4; i++) { const c = pick((h) => h < 0.1 && h > -1.0); if (c) nCenters.push(c); }
    for (let i = 0; i < 30; i++) {
      const c = nCenters[i % nCenters.length];
      const x = c[0] + (rnd() - 0.5) * 6, z = c[1] + (rnd() - 0.5) * 6;
      this.add(new Nassa(this, x, z, rnd));
    }
    this.bait = new THREE.Vector3(nCenters[0][0], 0, nCenters[0][1]);
    for (let i = 0; i < 34; i++) {
      const c = pick((h, dc, x, z) => h < 0.3 && h > -1.1 && dc > 5 && free(x, z, 0.8));
      if (c) { claim(c[0], c[1], 0.8); this.add(new Clam(this, c[0], c[1], rnd, rnd() < 0.3)); }
    }
    for (let i = 0; i < 18; i++) {
      const c = pick((h, dc, x, z) => h < 0.35 && h > -0.8 && dc > 6 && free(x, z, 0.6));
      if (c) { claim(c[0], c[1], 0.6); this.add(new Razor(this, c[0], c[1], rnd)); }
    }
    this.buildBait();
  }

  crabMaterials(species, seed) {
    const Y = species === 'yamato';
    if (species === 'kometsuki') return this.kometsukiMaterials(seed);
    if (!this.crabShared[species]) {
      this.crabShared[species] = {
        leg: organicMaterial({
          key: 'leg', glsl: GLSL.leg, seed: 0.5,
          colors: Y ? [0x6a5334, 0x4e3e26, 0x2e2416, 0xa8905e] : [0xa6977c, 0x7e705a, 0x55493a, 0xddd4c2],
          roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.22, sss: Y ? 0xa06a3a : 0xd8b890, sssK: Y ? 0.2 : 0.35,
        }),
        claw: organicMaterial({
          key: 'claw', glsl: GLSL.claw, seed: 0.7,
          colors: Y ? [0xe0cf9e, 0xcdb680, 0xf2e8cc] : [0xd8ccb6, 0xbcae94, 0xf2ece0],
          P: [Y ? 0.4 : 0.17, 0, 0, 0],
          roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2, sss: 0xf0d0c0, sssK: 0.3,
        }),
      };
    }
    const sh = this.crabShared[species];
    if (Y && !sh.arm) {
      sh.arm = organicMaterial({ key: 'leg', glsl: GLSL.leg, seed: 0.9, colors: [0x7a4a24, 0x5e3a1e, 0x3a2414, 0xb0845a], roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2, sss: 0xc07040, sssK: 0.2 });
      sh.mouth = organicMaterial({ key: 'claw', glsl: GLSL.claw, seed: 0.2, colors: [0xb4a282, 0xa08e70, 0xc8b898], P: [1, 0, 0, 0], roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 });
    }
    const shell = organicMaterial({
      key: Y ? 'yamaShell' : 'komeShell', glsl: Y ? GLSL.yamatoShell : GLSL.kometsukiShell, seed,
      colors: Y ? [0x4c3e2a, 0x6e5c40, 0x86765a, 0x4a3e2e] : [0x8e7e66, 0xa89a80, 0x4a3c2e, 0xd6cebe],
      roughness: Y ? 0.5 : 0.58, clearcoat: 0.45, clearcoatRoughness: 0.3,
    });
    return { shell, leg: sh.leg, claw: sh.claw, arm: sh.arm, mouth: sh.mouth, cornea: this.corneaMat };
  }

  kometsukiMaterials(seed) {
    if (!this.komeShared) {
      const S = CRAB_SPECS.kometsuki.legs;
      const legCommon = { key: 'legBanded', glsl: GLSL.legBanded, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2, sss: 0xd8c8a0, sssK: 0.35 };
      this.komeShared = {
        leg: organicMaterial({ ...legCommon, seed: 0.3, colors: [0x3c3420, 0xd8d0b4, 0xd8dcd8, 0x8a8a80], P: [70, 0, 0, 0] }),
        merus: organicMaterial({ ...legCommon, seed: 0.6, colors: [0x3c3420, 0xd8d0b4, 0xdfe4e2, 0x8a8a80], P: [55, 1, S.merus, 0] }),
        stalk: organicMaterial({ ...legCommon, seed: 0.8, colors: [0x9a968a, 0xc0beb2, 0xd8dcd8, 0x8a8a80], P: [40, 0, 0, 0] }),
        claw: organicMaterial({ key: 'claw', glsl: GLSL.claw, seed: 0.4, colors: [0xc2c6bc, 0xa4aaa0, 0xf6f4ee], P: [0.2, 1.6, 0, 0], roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, sss: 0xe0e4e0, sssK: 0.1 }),
        arm: organicMaterial({ key: 'claw', glsl: GLSL.claw, seed: 0.5, colors: [0xa8aca2, 0x6a6a58, 0xb8bab0], P: [1, 1, 0, 0], roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
        mouth: organicMaterial({ key: 'claw', glsl: GLSL.claw, seed: 0.1, colors: [0xe8eae6, 0xd8dcd6, 0xf0f0ec], P: [1, 0, 0, 0], roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
        setae: new THREE.MeshStandardMaterial({ color: 0xcfc8b0, roughness: 0.55, side: THREE.DoubleSide }),
      };
    }
    const sh = this.komeShared;
    const shell = organicMaterial({
      key: 'komeShell2', glsl: GLSL.kometsukiShell, seed,
      colors: [0x3e3824, 0x5c5234, 0xd2c89e, 0x9a9c94],
      roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35,
    });
    return { shell, leg: sh.leg, merus: sh.merus, stalk: sh.stalk, claw: sh.claw, arm: sh.arm, mouth: sh.mouth, setae: sh.setae, cornea: this.corneaMat };
  }

  buildBait() {
    // アラムシロガイが集まる打ち上げられた小魚
    const w = this.world;
    const K = gobyKit();
    const mat = organicMaterial({ key: 'goby', glsl: GLSL.goby, colors: [0x5c6068, 0x9aa2aa, 0xdfe4e8, 0x30343a], P: [20, 0.2, 0, 0], roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    const m = new THREE.Mesh(K.body, mat);
    m.scale.setScalar(2.4);
    m.castShadow = true;
    const x = this.bait.x, z = this.bait.z;
    m.position.set(x, w.heightAt(x, z) + 0.12, z);
    m.rotation.set(0, 0.7, Math.PI / 2);
    w.scene.add(m);
  }

  add(a) { this.agents.push(a); }

  update(dt, t, camPos) {
    if (camPos) this.camPos.copy(camPos);
    let n = 0; this.schoolCenter.set(0, 0, 0);
    for (const a of this.agents) if (a.species === 'mahaze') { this.schoolCenter.add(a.p); n++; }
    if (n) this.schoolCenter.multiplyScalar(1 / n);
    for (const a of this.agents) a.update(dt, t);
    this.pellets.update(dt, this.world.water);
    this.puffs.update(dt);
  }

  counts() {
    const c = {};
    for (const a of this.agents) c[a.species] = (c[a.species] || 0) + (a.visible ? 1 : 0);
    return c;
  }

  findVisible(species, near) {
    const list = this.agents.filter((a) => a.species === species && a.visible);
    if (!list.length) return null;
    if (near) list.sort((a, b) => a.root.position.distanceToSquared(near) - b.root.position.distanceToSquared(near));
    return list[Math.floor(this.rnd() * Math.min(3, list.length))];
  }
}
