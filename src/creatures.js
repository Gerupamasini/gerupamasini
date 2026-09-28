// 干潟の生き物（造形とふるまい）
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { PLAY_RADIUS, channelCenter } from './world.js';

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
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

// ---------- 素材ヘルパ ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function mottled(base, dark, light, rnd, spots = 260, size = 256) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < spots; i++) {
      g.fillStyle = rnd() < 0.55 ? dark : light;
      g.globalAlpha = 0.15 + rnd() * 0.45;
      const r = 1 + rnd() * rnd() * 14;
      g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  });
}

function physMat(o) {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.55, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35, ...o,
  });
}

function cyl(r1, r2, len, seg = 8) {
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  g.rotateZ(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  return g;
}

function shadowAll(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

// ---------- 巣穴の穴・砂団子・砂煙 ----------
const holeTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(8,6,4,1)');
  gr.addColorStop(0.38, 'rgba(20,16,10,0.95)');
  gr.addColorStop(0.6, 'rgba(60,50,35,0.45)');
  gr.addColorStop(1, 'rgba(60,50,35,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const holeMat = new THREE.MeshStandardMaterial({
  map: holeTex, transparent: true, depthWrite: false, roughness: 0.9,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const holeGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);

function makeHole(world, x, z, r, sx = 1, sz = 1) {
  const m = new THREE.Mesh(holeGeo, holeMat);
  m.position.set(x, world.heightAt(x, z) + 0.012, z);
  m.scale.set(r * sx, 1, r * sz);
  m.receiveShadow = true;
  m.renderOrder = 1;
  world.scene.add(m);
  return m;
}

class PelletField {
  constructor(scene, cap = 3000) {
    this.cap = cap;
    const geo = new THREE.IcosahedronGeometry(0.05, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb6a684, roughness: 0.95 });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.items = [];
    this.next = 0;
    this.dirty = false;
    scene.add(this.mesh);
  }
  add(x, y, z, s) {
    const it = { x, y, z, s, life: 1 };
    if (this.items.length < this.cap) this.items.push(it);
    else { this.items[this.next] = it; this.next = (this.next + 1) % this.cap; }
    this.dirty = true;
  }
  update(dt, water) {
    let alive = 0;
    const out = [];
    for (const it of this.items) {
      if (water > it.y + 0.01) it.life -= dt * 0.25; // 潮が満ちると崩れて消える
      if (it.life > 0) out.push(it);
      if (it.life < 1) this.dirty = true;
    }
    if (out.length !== this.items.length) { this.items = out; this.next = 0; this.dirty = true; }
    if (!this.dirty) return;
    for (const it of this.items) {
      const s = it.s * clamp(it.life * 1.5, 0, 1);
      _m.makeScale(s, s * 0.8, s).setPosition(it.x, it.y + 0.03 * s, it.z);
      this.mesh.setMatrixAt(alive++, _m);
    }
    this.mesh.count = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
}

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
        float a=smoothstep(0.5,0.0,r)*vL*0.55; gl_FragColor=vec4(vec3(0.55,0.49,0.38)*1.1,a);
        #include <colorspace_fragment>
        }`,
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
      this.vel[i * 3] = Math.cos(a) * s; this.vel[i * 3 + 1] = 0.15 + rnd() * 0.3; this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = 1; this.size[i] = 0.12 + rnd() * 0.2;
    }
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 0.7;
      this.vel[i * 3 + 1] -= dt * 0.35;
      for (let a = 0; a < 3; a++) { this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt; this.vel[i * 3 + a] *= 1 - dt * 1.8; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aLife.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }
}

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

// ---------- カニの造形 ----------
function superEllipsoid(geo, n) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const c = Math.abs(x / r), s = Math.abs(z / r);
    const f = 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
    p.setX(i, x * f); p.setZ(i, z * f);
  }
}

function buildCrab(o, rnd) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const cg = new THREE.SphereGeometry(1, 40, 24);
  if (o.rect) superEllipsoid(cg, o.rect);
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    let y = cp.getY(i);
    const z = cp.getZ(i), x = cp.getX(i);
    if (y < 0) y *= 0.45;
    // 前縁をわずかに平らに、甲の凹凸（領域の溝）
    y *= 1 - 0.12 * Math.max(0, z) ** 3;
    y += 0.05 * Math.sin(x * 5) * Math.sin(z * 4) * Math.max(0, y);
    cp.setY(i, y);
  }
  cg.computeVertexNormals();
  cg.scale(o.w, o.h, o.l);
  const carapace = new THREE.Mesh(cg, o.bodyMat);
  body.add(carapace);

  // 歩脚 4対（長節・腕節・指節の3節）
  const legs = [];
  const L1 = o.legLen * 0.48, LC = o.legLen * 0.2, L2 = o.legLen * 0.5;
  const lr = o.legR;
  const A0 = 0.55, A1 = -1.15, A2 = -0.8;
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const hip = new THREE.Group();
      hip.position.set(s * o.w * 0.82, -o.h * 0.12, o.l * (0.42 - i * 0.3));
      const spread = (i - 1.5) * 0.36;
      const baseYaw = s > 0 ? spread : Math.PI - spread;
      hip.rotation.y = baseYaw;
      const k = 1 - Math.abs(i - 1.5) * 0.12;
      const F = new THREE.Group();
      F.rotation.z = A0;
      const fem = new THREE.Mesh(cyl(lr * 1.1, lr * 0.95, L1 * k), o.legMat);
      fem.scale.z = 0.55;
      F.add(fem);
      const K = new THREE.Group();
      K.position.x = L1 * k;
      K.rotation.z = A1;
      const car = new THREE.Mesh(cyl(lr * 0.9, lr * 0.8, LC * k), o.legMat);
      car.scale.z = 0.6;
      K.add(car);
      const D = new THREE.Group();
      D.position.x = LC * k;
      D.rotation.z = A2;
      const dac = new THREE.Mesh(cyl(lr * 0.75, lr * 0.12, L2 * k), o.tipLegMat || o.legMat);
      dac.scale.z = 0.6;
      D.add(dac);
      K.add(D);
      F.add(K);
      hip.add(F);
      body.add(hip);
      legs.push({ hip, F, K, D, baseYaw, s, i });
    }
  }
  const stand = L2 * Math.sin(-(A0 + A1 + A2)) + LC * Math.sin(-(A0 + A1)) - L1 * Math.sin(A0) + o.h * 0.12;
  body.position.y = Math.max(o.h * 0.5, stand * 0.92);

  // はさみ
  const claws = [];
  for (const s of [1, -1]) {
    const big = s > 0 ? o.clawBig : 1;
    const arm = new THREE.Group();
    arm.position.set(s * o.w * 0.55, -o.h * 0.1, o.l * 0.8);
    arm.rotation.y = s > 0 ? -1.15 : Math.PI + 1.15;
    const lift = new THREE.Group();
    lift.rotation.z = 0.25;
    arm.add(lift);
    const cl = o.clawLen * big;
    const mer = new THREE.Mesh(cyl(lr * 1.2 * big, lr * 1.05 * big, cl * 0.5), o.clawMat);
    lift.add(mer);
    const wrist = new THREE.Group();
    wrist.position.x = cl * 0.5;
    wrist.rotation.y = s > 0 ? 1.5 : 1.5;
    wrist.rotation.z = -0.35;
    lift.add(wrist);
    const palmG = new THREE.SphereGeometry(1, 20, 12);
    const pp = palmG.attributes.position;
    for (let q = 0; q < pp.count; q++) { const X = pp.getX(q); pp.setY(q, pp.getY(q) * (1 - 0.25 * X)); }
    palmG.computeVertexNormals();
    palmG.scale(cl * 0.3, cl * 0.13 * (o.palmH || 1), cl * 0.08);
    palmG.translate(cl * 0.28, 0, 0);
    const palm = new THREE.Mesh(palmG, o.clawMat);
    wrist.add(palm);
    const fingerG = new THREE.ConeGeometry(cl * 0.045, cl * 0.34, 8);
    fingerG.rotateZ(-Math.PI / 2); fingerG.translate(cl * 0.17, 0, 0);
    fingerG.scale(1, 1, 0.7);
    { const fp = fingerG.attributes.position; for (let q = 0; q < fp.count; q++) { const X = fp.getX(q) / (cl * 0.34); fp.setY(q, fp.getY(q) - X * X * cl * 0.04); } fingerG.computeVertexNormals(); }
    const fixed = new THREE.Mesh(fingerG, o.tipMat);
    fixed.position.set(cl * 0.55, -cl * 0.05, 0);
    wrist.add(fixed);
    const dact = new THREE.Group();
    dact.position.set(cl * 0.52, cl * 0.06, 0);
    dact.add(new THREE.Mesh(fingerG, o.tipMat));
    wrist.add(dact);
    body.add(arm);
    claws.push({ arm, lift, wrist, dact, s });
  }

  // 眼柄
  const eyes = [];
  for (const s of [1, -1]) {
    const eg = new THREE.Group();
    eg.position.set(s * o.eyeSep, o.h * 0.35, o.l * 0.9);
    eg.rotation.y = s > 0 ? -o.eyeSplay : Math.PI + o.eyeSplay;
    eg.rotation.z = o.eyeUp;
    const st = new THREE.Mesh(cyl(o.eyeR * 0.6, o.eyeR * 0.55, o.eyeLen), o.legMat);
    eg.add(st);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(o.eyeR, 12, 8), EYE_MAT);
    eye.position.x = o.eyeLen;
    eg.add(eye);
    body.add(eg);
    eyes.push({ g: eg, s });
  }

  shadowAll(root);
  return { root, body, legs, claws, eyes };
}

const EYE_MAT = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0b, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });

// ---------- 巻貝の殻（対数らせんを管で掃引） ----------
function spiralShell(o) {
  // o: turns, apR (aperture tube radius), coil (axis radius), height, ribs, cords, ribAmp, cordAmp, colA, colB, bands
  const seg = Math.round(o.turns * 48), rad = 18;
  const thetaMax = o.turns * TAU;
  const k = Math.log(o.shrink) / thetaMax;
  const pos = [], col = [], idx = [];
  const center = (th) => {
    const g = Math.exp(-k * th * -1) ; // g: 1 → shrink（0 < shrink < 1 なので k < 0）
    return { g, c: new THREE.Vector3(Math.cos(th) * o.coil * g, o.height * (1 - g) / (1 - o.shrink), Math.sin(th) * o.coil * g) };
  };
  const cA = new THREE.Color(o.colA), cB = new THREE.Color(o.colB), c = new THREE.Color();
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * thetaMax;
    const { g, c: C } = center(th);
    const C2 = center(th + 0.01).c;
    const T = C2.sub(C).normalize();
    const B = new THREE.Vector3().crossVectors(T, UP).normalize();
    const N = new THREE.Vector3().crossVectors(B, T).normalize();
    for (let j = 0; j <= rad; j++) {
      const ph = (j / rad) * TAU;
      let r = o.apR * g;
      r *= 1 + o.ribAmp * Math.pow(Math.max(0, Math.sin(th * o.ribs)), 2) + o.cordAmp * Math.max(0, Math.sin(ph * o.cords));
      const P = C.clone().addScaledVector(B, Math.cos(ph) * r).addScaledVector(N, Math.sin(ph) * r);
      pos.push(P.x, P.y, P.z);
      const band = 0.5 + 0.5 * Math.sin(ph * o.bands + th * 0.2);
      c.copy(cA).lerp(cB, band * band);
      const shade = 0.85 + 0.15 * Math.sin(th * o.ribs);
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // 殻口が原点・殻頂が +y 付近になるように
  geo.translate(-o.coil, 0, 0);
  return geo;
}

// ---------- 魚の造形 ----------
function fishMaterial(tex, uniforms, opts = {}) {
  const m = physMat({ map: tex, roughness: 0.35, clearcoat: 0.8, transparent: true, opacity: 0.93, sheen: 0.4, sheenColor: new THREE.Color(0.8, 0.85, 0.9), ...opts });
  m.userData.fish = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPhase = uniforms.uPhase;
    sh.uniforms.uAmp = uniforms.uAmp;
    sh.uniforms.uTurn = uniforms.uTurn;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPhase; uniform float uAmp; uniform float uTurn;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float tailW = smoothstep(0.35, -1.0, transformed.z);
        transformed.x += (sin(transformed.z*5.0 - uPhase)*uAmp + uTurn*transformed.z*transformed.z*0.6) * tailW;`);
  };
  return m;
}

function buildFish(o, rnd) {
  const root = new THREE.Group();
  const uniforms = { uPhase: { value: 0 }, uAmp: { value: 0.05 }, uTurn: { value: 0 } };
  // 体側の模様
  const tex = canvasTex(256, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, o.back); gr.addColorStop(0.55, o.side); gr.addColorStop(1, o.belly);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = o.spot;
    for (let i = 0; i < o.spots; i++) {
      const x = 20 + (i / o.spots) * (w - 30) + (rnd() - 0.5) * 8;
      g.globalAlpha = 0.5 + rnd() * 0.4;
      g.beginPath(); g.ellipse(x, h * (0.35 + (rnd() - 0.5) * 0.25), 3 + rnd() * o.spotSize, 2 + rnd() * 3, 0, 0, TAU); g.fill();
    }
    g.globalAlpha = 0.35; g.fillStyle = o.dots;
    for (let i = 0; i < 180; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h * 0.5, 0.8 + rnd() * 1.4, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  });
  tex.wrapS = THREE.RepeatWrapping;
  // 体（旋盤回転体を頭 +z に向ける）
  const L = o.len;
  const prof = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0: 尾 1: 頭
    let r;
    if (t > 0.82) r = Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2)) * 0.95; // 丸い頭
    else r = 0.25 + 0.7 * Math.pow(t / 0.82, 0.9);
    prof.push(new THREE.Vector2(Math.max(0.001, r * o.girth * L * 0.1), (t - 0.62) * L));
  }
  const bg = new THREE.LatheGeometry(prof, 24);
  bg.rotateX(Math.PI / 2); // y→z
  bg.scale(1.0, 0.85, 1);
  // UV: u=長さ方向
  const uv = bg.attributes.uv, bp = bg.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const z = bp.getZ(i), y = bp.getY(i);
    uv.setXY(i, 1 - (z / L + 0.62), 0.5 + y / (o.girth * L * 0.2));
  }
  // 頭部はやや扁平で幅広（ハゼ型）
  for (let i = 0; i < bp.count; i++) {
    const z = bp.getZ(i);
    const hw = THREE.MathUtils.smoothstep(z, 0, L * 0.35);
    bp.setX(i, bp.getX(i) * (1 + 0.18 * hw));
    if (bp.getY(i) < 0) bp.setY(i, bp.getY(i) * 0.8);
  }
  bg.computeVertexNormals();
  const bodyMat = fishMaterial(tex, uniforms);
  const body = new THREE.Mesh(bg, bodyMat);
  root.add(body);

  const finMat = fishMaterial(null, uniforms, { color: new THREE.Color(o.fin), transparent: true, opacity: 0.28, side: THREE.DoubleSide, clearcoat: 0.2, roughness: 0.5, depthWrite: false });
  const finSpotMat = fishMaterial(canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = o.fin; g.fillRect(0, 0, w, h);
    g.fillStyle = o.spot; g.globalAlpha = 0.6;
    for (let y = 6; y < h; y += 12) for (let x = 4; x < w; x += 10) { g.beginPath(); g.arc(x + (y % 24 ? 5 : 0), y, 2, 0, TAU); g.fill(); }
  }), uniforms, { transparent: true, opacity: 0.4, side: THREE.DoubleSide, clearcoat: 0.2, roughness: 0.5, depthWrite: false });

  const finShape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); return new THREE.ShapeGeometry(s); };
  const H = o.girth * L * 0.085;
  // 第1・第2背びれ（z-y 平面）
  const d1 = finShape([[0, 0], [0.02, 0.18], [0.1, 0.22], [0.2, 0.12], [0.24, 0]]);
  d1.rotateY(-Math.PI / 2); d1.scale(1, L, L); d1.translate(0, H * 0.9, L * 0.12);
  const d2 = finShape([[0, 0], [0.02, 0.14], [0.35, 0.13], [0.38, 0]]);
  d2.rotateY(-Math.PI / 2); d2.scale(1, L, L); d2.translate(0, H * 0.8, -L * 0.3);
  const an = finShape([[0, 0], [0.02, -0.1], [0.3, -0.1], [0.32, 0]]);
  an.rotateY(-Math.PI / 2); an.scale(1, L, L); an.translate(0, -H * 0.6, -L * 0.28);
  const tail = finShape([[0, 0.02], [-0.06, 0.1], [-0.2, 0.09], [-0.24, 0], [-0.2, -0.09], [-0.06, -0.1], [0, -0.02]]);
  tail.rotateY(-Math.PI / 2); tail.scale(1, L, L); tail.translate(0, 0, -L * 0.36);
  for (const [g, m] of [[d1, finSpotMat], [d2, finSpotMat], [an, finMat], [tail, finSpotMat]]) root.add(new THREE.Mesh(g, m));
  // 胸びれ（扇形）と腹びれ（吸盤状）
  const pecs = [];
  for (const s of [1, -1]) {
    const pg = new THREE.CircleGeometry(L * 0.13, 12, -0.9, 1.8);
    const pm = new THREE.Mesh(pg, finMat);
    const pv = new THREE.Group();
    pv.position.set(s * H * 0.95, -H * 0.2, L * 0.2);
    pv.rotation.set(0, Math.PI / 2 - s * 0.5, 0);
    pv.userData.base = pv.rotation.y; pv.userData.s = s;
    pm.rotation.y = s * 0.3;
    pm.position.x = 0;
    pv.add(pm);
    root.add(pv);
    pecs.push(pv);
  }
  const pelv = new THREE.Mesh(new THREE.CircleGeometry(L * 0.07, 12), finMat);
  pelv.rotation.x = Math.PI / 2; pelv.position.set(0, -H * 0.85, L * 0.2);
  root.add(pelv);
  // 眼（ハゼは頭の上寄り）
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(L * 0.045, 12, 8), EYE_MAT);
    e.position.set(s * H * 0.55, H * 0.62, L * 0.3);
    root.add(e);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(L * 0.045, L * 0.01, 6, 16), physMat({ color: 0xc8b070, metalness: 0.6, roughness: 0.3 }));
    ring.position.copy(e.position); ring.rotation.y = s * 1.2;
    root.add(ring);
  }
  root.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { root, uniforms, pecs };
}

// ============================================================
// エージェント
// ============================================================
class Agent {
  constructor(sys, species) {
    this.sys = sys;
    this.world = sys.world;
    this.species = species;
    this.visible = true;
  }
  get pos() { return this.root.position; }
  setup(root) {
    this.root = root;
    root.userData.agent = this;
    this.sys.group.add(root);
  }
}

// ---------- カニ（コメツキガニ／ヤマトオサガニ） ----------
class Crab extends Agent {
  constructor(sys, species, x, z, rnd, look) {
    super(sys, species);
    this.rnd = rnd;
    this.look = look;
    this.parts = buildCrab(look, rnd);
    this.setup(this.parts.root);
    this.home = new THREE.Vector2(x, z);
    this.hole = makeHole(this.world, x, z, look.holeR);
    this.p = new THREE.Vector2(x, z);
    this.yaw = rnd() * TAU;
    this.sink = 1;
    this.state = 'hidden';
    this.timer = rnd() * 4;
    this.target = new THREE.Vector2(x, z);
    this.gait = rnd() * 10;
    this.feed = 0;
    this.wave = 0;
    this.speed = 0;
    this.male = rnd() < 0.5;
    this.pelletT = 0;
    this.alert = 0;
  }
  exposed() { return this.world.depthAt(this.home.x, this.home.y) < -0.04; }

  pickTarget() {
    const a = this.rnd() * TAU, r = this.look.roam * Math.sqrt(this.rnd());
    this.target.set(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
  }

  update(dt, t) {
    const L = this.look;
    const exposed = this.exposed();
    const localDepth = this.world.depthAt(this.p.x, this.p.y);
    this.timer -= dt;
    let move = false;
    switch (this.state) {
      case 'hidden':
        this.sink = damp(this.sink, 1, 3, dt);
        if (exposed && this.timer <= 0) { this.state = 'emerge'; this.p.copy(this.home); this.sys.puffs.emit(this.home.x, this.world.heightAt(this.home.x, this.home.y) + 0.05, this.home.y, 5, 0.15, this.rnd); }
        break;
      case 'emerge':
        this.sink = damp(this.sink, 0, 2.2, dt);
        if (this.sink < 0.03) { this.sink = 0; this.state = 'idle'; this.timer = 1 + this.rnd() * 2; }
        break;
      case 'idle':
        if (!exposed || localDepth > -0.01) { this.state = 'return'; break; }
        if (this.timer <= 0) {
          const r = this.rnd();
          if (r < 0.55) { this.pickTarget(); this.state = 'walk'; this.timer = 8; }
          else if (r < 0.85 || !L.waver) { this.state = 'feed'; this.timer = 3 + this.rnd() * 6; }
          else { this.state = 'wave'; this.timer = 2.5 + this.rnd() * 3; }
        }
        break;
      case 'walk': {
        if (!exposed || localDepth > -0.01) { this.state = 'return'; break; }
        move = this.stepToward(this.target, L.speed, dt);
        if (!move || this.timer <= 0) { this.state = 'idle'; this.timer = 0.5 + this.rnd() * 2; }
        break;
      }
      case 'feed':
        if (!exposed || localDepth > -0.01) { this.state = 'return'; break; }
        this.feed += dt;
        // 少しずつ横歩きしながら食べる
        if (Math.sin(t * 0.7 + this.gait) > 0.6) move = this.stepToward(this.target, L.speed * 0.25, dt);
        if (L.pellets) {
          this.pelletT -= dt;
          if (this.pelletT <= 0) {
            this.pelletT = 0.9 + this.rnd() * 0.8;
            const back = this.yaw + Math.PI + (this.rnd() - 0.5) * 1.6;
            const px = this.p.x + Math.sin(back) * L.l * 1.6, pz = this.p.y + Math.cos(back) * L.l * 1.6;
            this.sys.pellets.add(px, this.world.heightAt(px, pz), pz, 0.7 + this.rnd() * 0.6);
          }
        }
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 0.3 + this.rnd(); }
        break;
      case 'wave':
        if (!exposed) { this.state = 'return'; break; }
        this.wave = Math.min(1, this.wave + dt * 3);
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 1 + this.rnd(); }
        break;
      case 'return':
        move = this.stepToward(this.home, L.speed * 1.8, dt);
        if (!move) { this.state = 'dig'; }
        break;
      case 'dig':
        this.sink = damp(this.sink, 1, 2.5, dt);
        if (this.sink > 0.97) { this.state = 'hidden'; this.timer = 2 + this.rnd() * 6; this.sys.puffs.emit(this.home.x, this.world.heightAt(this.home.x, this.home.y) + 0.03, this.home.y, 4, 0.1, this.rnd); }
        break;
    }
    if (this.state !== 'wave') this.wave = Math.max(0, this.wave - dt * 2);

    this.speed = damp(this.speed, move ? 1 : 0, 8, dt);
    this.animate(dt, t);
    this.visible = this.sink < 0.98;
    this.root.visible = this.visible;
    this.hole.visible = true;
  }

  stepToward(target, speed, dt) {
    const dx = target.x - this.p.x, dz = target.y - this.p.y;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) return false;
    // カニは横歩き：体の左右軸を進行方向へ
    const dirYaw = Math.atan2(dx, dz);
    const side = angDiff(this.yaw + Math.PI / 2, dirYaw);
    const side2 = angDiff(this.yaw - Math.PI / 2, dirYaw);
    const turn = Math.abs(side) < Math.abs(side2) ? side : side2;
    this.yaw += clamp(turn, -dt * 2.5, dt * 2.5);
    const step = Math.min(d, speed * dt);
    this.p.x += (dx / d) * step;
    this.p.y += (dz / d) * step;
    this.gait += dt * speed * 9 / this.look.legLen;
    return true;
  }

  animate(dt, t) {
    const P = this.parts, L = this.look;
    const sinkY = -this.sink * (P.body.position.y + L.h * 2.2);
    placeOnGround(this.world, this.root, this.p.x, this.p.y, this.yaw, sinkY, 0.8);
    // 呼吸と揺れ
    P.body.rotation.x = Math.sin(t * 2 + this.gait) * 0.02;
    const sp = this.speed;
    for (const leg of P.legs) {
      const ph = this.gait * 2 + (leg.i % 2 === 0 ? 0 : Math.PI) + (leg.s > 0 ? 0 : Math.PI);
      leg.hip.rotation.y = leg.baseYaw + Math.sin(ph) * 0.3 * sp;
      const lift = Math.max(0, Math.cos(ph)) * sp;
      leg.F.rotation.z = 0.55 + lift * 0.35 - this.sink * 0.4;
      leg.K.rotation.z = -1.15 + lift * 0.15;
      leg.D.rotation.z = -0.8 + lift * 0.1;
    }
    // はさみ：食事（交互にすくう）／ウェービング
    const feeding = this.state === 'feed' ? 1 : 0;
    for (const c of P.claws) {
      const ph = t * 5.5 + (c.s > 0 ? 0 : Math.PI);
      const scoop = feeding * (0.5 + 0.5 * Math.sin(ph));
      const big = c.s > 0 && L.waver && this.male;
      const waveLift = this.wave * (big ? 1 : 0.6) * (0.6 + 0.6 * Math.sin(t * 3.2 + (c.s > 0 ? 0 : 0.4)));
      c.lift.rotation.z = 0.25 - scoop * 0.55 + waveLift * 1.4;
      c.wrist.rotation.z = -0.35 - scoop * 0.5 + waveLift * 0.5;
      c.dact.rotation.z = 0.12 + 0.12 * Math.sin(t * 9 + c.s);
    }
    // 眼柄を立てる（出ている時）
    const up = (1 - this.sink) * (L.eyeRaise || 0);
    for (const e of P.eyes) e.g.rotation.z = L.eyeUp + up;
  }
}

// ---------- ニホンスナモグリ ----------
class GhostShrimp extends Agent {
  constructor(sys, x, z, rnd) {
    super(sys, 'sunamogri');
    this.rnd = rnd;
    const w = this.world;
    // マウンド（火山型の砂山）：頂点ごとに地形へ沿わせて継ぎ目を消す
    const ms = 0.6 + rnd() * 0.4;
    const bump = (r) => 0.26 * Math.exp(-((r - 0.3) ** 2) / 0.09) * THREE.MathUtils.smoothstep(r, 0.08, 0.24) * (1 - THREE.MathUtils.smoothstep(r, 0.7, 1.3));
    const prof = [];
    for (let i = 0; i <= 18; i++) { const r = 0.06 + (i / 18) * 1.24; prof.push(new THREE.Vector2(r, 0)); }
    const mg = new THREE.LatheGeometry(prof, 32);
    const mp = mg.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const X = mp.getX(i), Z = mp.getZ(i);
      const r = Math.hypot(X, Z), a = Math.atan2(Z, X);
      const yb = bump(r) * (1 + 0.22 * Math.sin(a * 3 + x) + 0.08 * Math.sin(a * 7));
      const wx = x + X * ms, wz = z + Z * ms;
      mp.setXYZ(i, wx, w.heightAt(wx, wz) + yb * ms + 0.004, wz);
    }
    mg.computeVertexNormals();
    mg.setAttribute('aSilt', new THREE.BufferAttribute(new Float32Array(mp.count).fill(0.45), 1));
    mg.setAttribute('aPool', new THREE.BufferAttribute(new Float32Array(mp.count), 1));
    this.mound = new THREE.Mesh(mg, w.terrainMat);
    this.mound.receiveShadow = true; this.mound.castShadow = true;
    w.scene.add(this.mound);
    this.baseY = w.heightAt(x, z) + bump(0.12) * ms + 0.01;
    this.hole = makeHole(w, x, z, 0.14);
    this.hole.position.y = this.baseY + 0.005;

    // エビ本体（頭が +z）
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    const cara = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.35, 6, 14), SHRIMP_MAT);
    cara.rotation.x = Math.PI / 2; cara.position.z = 0.25; cara.scale.set(1, 1, 0.9);
    inner.add(cara);
    const organ = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe07a3a, roughness: 0.6 }));
    organ.position.set(0, 0.02, 0.22);
    inner.add(organ);
    this.segs = [];
    let zc = 0.02;
    for (let i = 0; i < 6; i++) {
      const r = 0.14 - i * 0.012;
      const sg = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), SHRIMP_MAT);
      sg.scale.set(r * 1.15, r * 0.85, 0.11);
      sg.position.set(0, -0.01 * i, zc);
      zc -= 0.13;
      inner.add(sg);
      this.segs.push(sg);
    }
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14, Math.PI * 0.15, Math.PI * 0.7), SHRIMP_FIN);
    fan.rotation.x = -Math.PI / 2; fan.position.set(0, -0.06, zc + 0.02);
    inner.add(fan);
    // 大きな第1胸脚（左右不相称）
    for (const s of [1, -1]) {
      const big = s > 0 ? 1.6 : 0.8;
      const g = new THREE.Group();
      g.position.set(s * 0.1, -0.04, 0.45);
      g.rotation.y = s > 0 ? -1.3 : Math.PI + 1.3;
      g.add(new THREE.Mesh(cyl(0.03 * big, 0.03 * big, 0.15 * big), SHRIMP_MAT));
      const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), SHRIMP_MAT);
      palm.scale.set(0.12 * big, 0.05 * big, 0.07 * big);
      palm.position.set(0.2 * big, 0, 0);
      g.add(palm);
      g.rotation.z = 0.2;
      inner.add(g);
    }
    for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
      const lg = new THREE.Mesh(cyl(0.012, 0.006, 0.22), SHRIMP_MAT);
      lg.position.set(s * 0.1, -0.08, 0.3 - i * 0.07);
      lg.rotation.set(0, s > 0 ? 0.2 : Math.PI - 0.2, -0.8);
      inner.add(lg);
    }
    for (const s of [1, -1]) {
      const ant = new THREE.Mesh(cyl(0.006, 0.002, 0.6), SHRIMP_MAT);
      ant.position.set(s * 0.04, 0.03, 0.55);
      ant.rotation.set(0, -Math.PI / 2 + s * 0.35, 0.25);
      inner.add(ant);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), EYE_MAT);
      eye.position.set(s * 0.04, 0.05, 0.58);
      inner.add(eye);
    }
    inner.position.z = -0.6;  // 頭の先端が原点付近に
    shadowAll(root);
    this.setup(root);
    this.inner = inner;
    this.p = new THREE.Vector2(x, z);
    this.yaw = rnd() * TAU;
    this.out = 0;
    this.targetOut = 0;
    this.timer = 3 + rnd() * 10;
    this.puffT = 0;
  }
  update(dt, t) {
    const depth = this.world.depthAt(this.p.x, this.p.y);
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.targetOut > 0) { this.targetOut = 0; this.timer = 6 + this.rnd() * 14; }
      else {
        // 冠水時はよく顔を出す。干出時は稀に入口まで。
        const chance = depth > 0.05 ? 0.85 : 0.25;
        this.targetOut = this.rnd() < chance ? 0.35 + this.rnd() * 0.45 : 0;
        this.timer = 2 + this.rnd() * 5;
        if (this.targetOut > 0) this.sys.puffs.emit(this.p.x, this.baseY + 0.05, this.p.y, 10, 0.3, this.rnd);
      }
    }
    this.out = damp(this.out, this.targetOut, this.targetOut > this.out ? 1.5 : 4, dt);
    const y = this.baseY;
    // 穴から斜め上へ伸び出る
    const pitch = -1.0;
    _q.setFromEuler(new THREE.Euler(pitch, this.yaw, 0, 'YXZ'));
    this.root.quaternion.copy(_q);
    const len = 1.1;
    _v.set(0, 0, (this.out - 0.95) * len).applyQuaternion(_q);
    this.root.position.set(this.p.x + _v.x, y + _v.y, this.p.y + _v.z);
    this.segs.forEach((s, i) => { s.rotation.x = Math.sin(t * 6 + i * 0.7) * 0.06; });
    this.visible = this.out > 0.04;
    this.root.visible = this.visible;
  }
}
const SHRIMP_MAT = new THREE.MeshPhysicalMaterial({
  color: 0xf2d4c8, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2,
  sheen: 0.5, sheenColor: new THREE.Color(1, 0.8, 0.75),
});
const SHRIMP_FIN = new THREE.MeshPhysicalMaterial({ color: 0xf5d8cc, roughness: 0.4, transparent: true, opacity: 0.7, side: THREE.DoubleSide });

// ---------- ハゼの稚魚 ----------
class Goby extends Agent {
  constructor(sys, species, x, z, rnd) {
    super(sys, species);
    this.rnd = rnd;
    const look = species === 'mahaze'
      ? { len: 1.0 + rnd() * 0.3, girth: 0.95, back: '#6a5a3e', side: '#a8946c', belly: '#ddd2bd', spot: '#3a2e1c', spots: 8, spotSize: 7, dots: '#2e2416', fin: '#b8a88a' }
      : { len: 0.8 + rnd() * 0.2, girth: 0.85, back: '#b0a07c', side: '#cfc2a2', belly: '#efe8da', spot: '#4a3a26', spots: 6, spotSize: 4, dots: '#5a4a30', fin: '#d8ceb8' };
    this.look = look;
    const f = buildFish(look, rnd);
    this.f = f;
    this.setup(f.root);
    this.p = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = rnd() * TAU;
    this.target = new THREE.Vector3(x, 0, z);
    this.timer = 0;
    this.phase = rnd() * 10;
    this.rest = species === 'himehaze';
    this.resting = 0;
    this.stranded = false;
  }
  findWater(minDepth) {
    // 近くで十分な水深の地点を探す（無ければ澪筋へ）
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
    const minD = this.rest ? 0.18 : 0.3;
    this.timer -= dt;
    const tDepth = w.depthAt(this.target.x, this.target.z);
    if (this.timer <= 0 || tDepth < minD) {
      this.findWater(minD + 0.1);
      this.timer = this.rest ? 1.5 + this.rnd() * 4 : 2 + this.rnd() * 5;
      if (this.rest) this.resting = this.rnd() < 0.7 ? 1 : 0;
    }
    // 群れ（マハゼ）
    let speed = this.rest ? 2.2 : 1.6;
    _v.set(this.target.x - this.p.x, 0, this.target.z - this.p.z);
    const d = _v.length();
    if (this.rest && this.resting && d < 0.5) speed = 0;
    if (!this.rest) {
      const sc = this.sys.schoolCenter;
      _v.addScaledVector(_n.set(sc.x - this.p.x, 0, sc.z - this.p.z), 0.08);
    }
    if (depth < minD * 0.6) { this.findWater(minD + 0.2); speed = 3.2; }
    _v.normalize();
    // ホップ（ヒメハゼは止まっては短く泳ぐ）
    let burst = 1;
    if (this.rest) burst = Math.max(0, Math.sin(t * 2.4 + this.phase)) ** 3 * 2.2;
    const desired = _v.multiplyScalar(speed * burst);
    this.vel.lerp(desired, 1 - Math.exp(-dt * 3));
    this.p.addScaledVector(this.vel, dt);
    const sp = this.vel.length();
    if (sp > 0.05) {
      const ty = Math.atan2(this.vel.x, this.vel.z);
      const dy = angDiff(this.yaw, ty);
      this.yaw += dy * (1 - Math.exp(-dt * 6));
      this.f.uniforms.uTurn.value = damp(this.f.uniforms.uTurn.value, clamp(dy, -1, 1) * 0.6, 6, dt);
    }
    const ground = w.heightAt(this.p.x, this.p.z);
    const dNow = w.water - ground;
    let yT;
    if (this.rest) yT = ground + this.look.len * 0.09 + (burst > 0.2 ? 0.08 : 0);
    else yT = ground + clamp(dNow * 0.45, 0.15, 1.2);
    yT = Math.min(yT, w.water - 0.12);
    this.p.y = damp(this.p.y || yT, yT, 4, dt);
    this.stranded = dNow < 0.08;
    this.root.position.copy(this.p);
    this.root.rotation.set(-clamp(this.vel.y, -0.3, 0.3), this.yaw, 0, 'YXZ');
    this.phase += dt * (4 + sp * 9);
    this.f.uniforms.uPhase.value = this.phase;
    this.f.uniforms.uAmp.value = 0.02 + sp * 0.03;
    this.f.pecs.forEach((p) => { p.rotation.y = p.userData.base - p.userData.s * Math.sin(t * 8 + this.phase) * 0.3; });
    this.visible = !this.stranded;
    this.root.visible = this.visible;
  }
}

// ---------- ヤドカリ ----------
class Hermit extends Agent {
  constructor(sys, x, z, rnd) {
    super(sys, 'yadokari');
    this.rnd = rnd;
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    const shellGeo = spiralShell({
      turns: 5.0, apR: 0.27, coil: 0.22, height: 1.15, shrink: 0.09,
      ribs: 14, cords: 6, ribAmp: 0.08, cordAmp: 0.05,
      colA: rnd() < 0.5 ? 0x6a5848 : 0x7a6c5c, colB: 0xb8a890, bands: 2,
    });
    const shell = new THREE.Mesh(shellGeo, physMat({ vertexColors: true, roughness: 0.6, clearcoat: 0.3, side: THREE.DoubleSide }));
    shell.rotation.set(-1.25, 0, 0);
    shell.position.set(0, 0.26, -0.02);
    inner.add(shell);
    this.shell = shell;
    // 殻口から出る体
    const legMat = physMat({ color: 0x6d4a38, roughness: 0.5 });
    const bandMat = physMat({ color: 0xd8c8b4, roughness: 0.5 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), legMat);
    head.scale.set(1, 0.7, 1.1); head.position.set(0, 0.22, 0.3);
    inner.add(head);
    this.legs = [];
    for (const s of [1, -1]) for (let i = 0; i < 2; i++) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, 0.2, 0.32 - i * 0.08);
      hip.rotation.y = s > 0 ? -0.5 + i * 0.4 : Math.PI + 0.5 - i * 0.4;
      const F = new THREE.Group(); F.rotation.z = 0.6;
      F.add(new THREE.Mesh(cyl(0.045, 0.04, 0.34), i ? legMat : bandMat));
      const K = new THREE.Group(); K.position.x = 0.34; K.rotation.z = -2.0;
      K.add(new THREE.Mesh(cyl(0.04, 0.012, 0.44), legMat));
      F.add(K); hip.add(F); inner.add(hip);
      this.legs.push({ hip, F, K, base: hip.rotation.y, s, i });
    }
    // はさみ（右が大きい）
    for (const s of [1, -1]) {
      const b = s > 0 ? 1.4 : 0.8;
      const arm = new THREE.Group();
      arm.position.set(s * 0.08, 0.2, 0.38);
      arm.rotation.set(0, s > 0 ? -1.1 : Math.PI + 1.1, 0.1);
      arm.add(new THREE.Mesh(cyl(0.04 * b, 0.035 * b, 0.14 * b), legMat));
      const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bandMat);
      palm.scale.set(0.1 * b, 0.05 * b, 0.07 * b); palm.position.x = 0.18 * b;
      arm.add(palm);
      inner.add(arm);
    }
    for (const s of [1, -1]) {
      const st = new THREE.Mesh(cyl(0.012, 0.012, 0.12), bandMat);
      st.position.set(s * 0.04, 0.26, 0.4); st.rotation.set(0, -Math.PI / 2 + s * 0.3, 0.9);
      inner.add(st);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), EYE_MAT);
      e.position.set(s * 0.06, 0.36, 0.45);
      inner.add(e);
      const ant = new THREE.Mesh(cyl(0.005, 0.002, 0.5), physMat({ color: 0xc86a3a }));
      ant.position.set(s * 0.03, 0.27, 0.42); ant.rotation.set(0, -Math.PI / 2 + s * 0.5, 0.5);
      inner.add(ant);
    }
    const sc = 0.6 + rnd() * 0.25;
    inner.scale.setScalar(sc);
    shadowAll(root);
    this.setup(root);
    this.inner = inner;
    this.p = new THREE.Vector2(x, z);
    this.yaw = rnd() * TAU;
    this.target = new THREE.Vector2(x, z);
    this.timer = 0;
    this.gait = 0;
    this.speed = 0;
    this.retract = 0;
  }
  update(dt, t) {
    const w = this.world;
    this.timer -= dt;
    if (this.timer <= 0) {
      const a = this.rnd() * TAU, r = 1 + this.rnd() * 5;
      let x = this.p.x + Math.cos(a) * r, z = this.p.y + Math.sin(a) * r;
      if (Math.hypot(x, z) > PLAY_RADIUS) { x *= 0.8; z *= 0.8; }
      this.target.set(x, z);
      this.timer = 4 + this.rnd() * 8;
      this.pause = this.rnd() < 0.35 ? 2 + this.rnd() * 4 : 0;
    }
    const exposed = w.depthAt(this.p.x, this.p.y) < 0;
    let move = false;
    if (this.pause > 0) this.pause -= dt;
    else {
      const dx = this.target.x - this.p.x, dz = this.target.y - this.p.y, d = Math.hypot(dx, dz);
      if (d > 0.1) {
        const ty = Math.atan2(dx, dz);
        this.yaw += clamp(angDiff(this.yaw, ty), -dt * 1.5, dt * 1.5);
        const sp = (exposed ? 0.35 : 0.6) * dt;
        this.p.x += Math.sin(this.yaw) * sp; this.p.y += Math.cos(this.yaw) * sp;
        this.gait += sp * 18;
        move = true;
      }
    }
    this.speed = damp(this.speed, move ? 1 : 0, 6, dt);
    placeOnGround(w, this.root, this.p.x, this.p.y, this.yaw, 0, 0.9);
    // 殻を引きずるように揺れる
    this.shell.rotation.z = Math.sin(this.gait) * 0.08 * this.speed;
    this.inner.position.y = Math.abs(Math.sin(this.gait)) * 0.03 * this.speed;
    for (const l of this.legs) {
      const ph = this.gait + (l.i ? Math.PI : 0) + (l.s > 0 ? 0 : Math.PI);
      l.hip.rotation.y = l.base + Math.sin(ph) * 0.35 * this.speed;
      l.F.rotation.z = 0.6 + Math.max(0, Math.cos(ph)) * 0.3 * this.speed;
    }
  }
}

// ---------- アラムシロガイ ----------
class Nassa extends Agent {
  constructor(sys, x, z, rnd) {
    super(sys, 'arumushiro');
    this.rnd = rnd;
    const root = new THREE.Group();
    const geo = NASSA_GEO;
    const shell = new THREE.Mesh(geo, NASSA_MAT);
    shell.rotation.set(-1.35, 0, 0);
    shell.position.set(0, 0.16, 0.1);
    root.add(shell);
    // 腹足と水管
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2), physMat({ color: 0xe8e0d4, roughness: 0.3, clearcoat: 1, sheen: 0.4 }));
    foot.scale.set(0.16, 0.05, 0.3); foot.position.set(0, 0, 0.12);
    root.add(foot);
    this.foot = foot;
    const siph = new THREE.Mesh(cyl(0.025, 0.02, 0.35), physMat({ color: 0xded4c4, roughness: 0.3 }));
    siph.position.set(0, 0.18, 0.3); siph.rotation.set(0, -Math.PI / 2, 0.55);
    root.add(siph);
    this.siph = siph;
    for (const s of [1, -1]) {
      const tn = new THREE.Mesh(cyl(0.008, 0.003, 0.22), physMat({ color: 0xe6dccb }));
      tn.position.set(s * 0.05, 0.03, 0.38); tn.rotation.set(0, -Math.PI / 2 + s * 0.6, 0.15);
      root.add(tn);
    }
    const sc = 0.65 + rnd() * 0.35;
    root.scale.setScalar(sc);
    shadowAll(root);
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
    this.active = damp(this.active, submerged ? 1 : 0.15, 1, dt);
    // 冠水時は「えさ」に向かって集まる
    const bait = this.sys.bait;
    let ty = this.yaw + Math.sin(t * 0.3 + this.phase) * 0.8;
    if (submerged && bait) {
      const bx = bait.x - this.p.x, bz = bait.z - this.p.y;
      if (Math.hypot(bx, bz) < 18) ty = Math.atan2(bx, bz) + Math.sin(t * 0.8 + this.phase) * 0.5;
      if (Math.hypot(bx, bz) < 0.5 + (this.phase % 1) * 0.6) this.active *= 0.3;
    }
    this.yaw += clamp(angDiff(this.yaw, ty), -dt * 0.8, dt * 0.8);
    const sp = 0.18 * this.active * dt;
    this.p.x += Math.sin(this.yaw) * sp; this.p.y += Math.cos(this.yaw) * sp;
    if (Math.hypot(this.p.x, this.p.y) > PLAY_RADIUS) this.yaw += Math.PI * dt;
    placeOnGround(w, this.root, this.p.x, this.p.y, this.yaw, submerged ? 0 : -0.04, 1);
    this.siph.rotation.z = 0.55 + Math.sin(t * 1.3 + this.phase) * 0.3;
    this.siph.scale.x = 0.3 + this.active * 0.8;
    this.foot.scale.z = 0.18 + this.active * 0.14 + Math.sin(t * 2 + this.phase) * 0.02 * this.active;
  }
}
const NASSA_GEO = spiralShell({
  turns: 6.5, apR: 0.2, coil: 0.14, height: 0.95, shrink: 0.1,
  ribs: 11, cords: 5, ribAmp: 0.22, cordAmp: 0.14,
  colA: 0x8a7a62, colB: 0xcfc2a8, bands: 1,
});
const NASSA_MAT = physMat({ vertexColors: true, roughness: 0.45, clearcoat: 0.6, side: THREE.DoubleSide });

// ---------- アサリ ----------
class Clam extends Agent {
  constructor(sys, x, z, rnd) {
    super(sys, 'asari');
    this.rnd = rnd;
    const root = new THREE.Group();
    const tex = asariTexture(rnd);
    const g = new THREE.SphereGeometry(1, 36, 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
      // 卵形の輪郭と、前方へ傾く殻頂
      X = X * (1 + 0.15 * Y) + 0.25 * Math.max(0, Y) ** 2;
      Z *= 0.9 * (1 - 0.35 * Math.abs(Y) ** 2);
      p.setXYZ(i, X, Y, Z);
    }
    g.computeVertexNormals();
    g.scale(0.8, 0.62, 0.4);
    const shell = new THREE.Mesh(g, physMat({ map: tex, roughness: 0.42, clearcoat: 0.55 }));
    root.add(shell);
    // 水管（入水管・出水管）
    const siphMat = physMat({ color: 0xc8b8a2, roughness: 0.35, sheen: 0.3 });
    const tipMat = physMat({ color: 0x5a4632, roughness: 0.4 });
    this.siphons = [];
    for (let k = 0; k < 2; k++) {
      const sg = new THREE.Group();
      sg.position.set(-0.55, 0.3 + k * 0.1, 0);
      sg.rotation.z = Math.PI / 2 + 0.55 - k * 0.25;
      const tube = new THREE.Mesh(cyl(0.075, 0.065, 0.4), siphMat);
      const tip = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 14), tipMat);
      tip.rotation.y = Math.PI / 2; tip.position.x = 0.4;
      sg.add(tube, tip);
      root.add(sg);
      this.siphons.push(sg);
    }
    const sc = 0.8 + rnd() * 0.5;
    root.scale.setScalar(sc);
    shadowAll(root);
    this.setup(root);
    this.p = new THREE.Vector2(x, z);
    this.yaw = rnd() * TAU;
    this.bury = 0.72 + rnd() * 0.2; // どれだけ砂に埋まっているか
    this.ext = 0;
    this.phase = rnd() * 10;
    this.exposedShell = rnd() < 0.2;  // 波で掘り出されて横たわる個体
    placeOnGround(this.world, root, x, z, this.yaw, 0, 0.6);
    if (this.exposedShell) {
      root.rotateX(Math.PI / 2 * (rnd() < 0.5 ? 1 : -1));
      this.siphons.forEach((sg) => { sg.visible = false; });
    } else {
      root.rotateX((rnd() - 0.5) * 0.4);
      root.rotateZ(-0.4);
    }
    this.baseY = root.position.y;
    this.scale = sc;
    this.holeA = makeHole(this.world, x + Math.cos(this.yaw) * 0.35, z - Math.sin(this.yaw) * 0.35, 0.09);
    this.holeB = makeHole(this.world, x + Math.cos(this.yaw) * 0.25, z - Math.sin(this.yaw) * 0.25, 0.08);
  }
  update(dt, t) {
    const depth = this.world.depthAt(this.p.x, this.p.y);
    const sub = depth > 0.05;
    this.ext = damp(this.ext, sub ? 1 : 0, sub ? 0.6 : 2.5, dt);
    const b = this.exposedShell ? 0.1 : this.bury;
    this.root.position.y = this.baseY - b * (this.exposedShell ? 0.4 : 0.62) * this.scale;
    if (this.exposedShell) return;
    this.siphons.forEach((s, k) => {
      s.visible = this.ext > 0.08;
      s.scale.x = 0.05 + this.ext * (1 + 0.12 * Math.sin(t * 1.7 + this.phase + k));
      s.rotation.y = Math.sin(t * 0.6 + this.phase + k) * 0.15 * this.ext;
    });
    // 吸水による微粒子
    if (sub && this.ext > 0.8 && this.rnd() < dt * 0.15) {
      const tipW = this.siphons[0].children[1].getWorldPosition(_v);
      this.sys.puffs.emit(tipW.x, tipW.y + 0.05, tipW.z, 2, 0.08, this.rnd);
    }
    this.visible = true;
  }
}

function asariTexture(rnd) {
  const pal = [
    ['#b9ad9c', '#5b4a3c', '#e2d8c8'],
    ['#8f8578', '#3e342c', '#cfc4b2'],
    ['#c8b8a0', '#6a4a36', '#efe6d6'],
    ['#a39a90', '#2e2a28', '#d8d0c4'],
    ['#b09070', '#5a3a2a', '#e8d8c0'],
  ][Math.floor(rnd() * 5)];
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
    // 放射状の帯
    g.globalAlpha = 0.25; g.fillStyle = pal[1];
    const rays = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < rays; i++) { const x = rnd() * w; g.fillRect(x, 0, 10 + rnd() * 30, h); }
    // 幾何学的なジグザグ模様（アサリは個体ごとに異なる）
    g.globalAlpha = 0.55;
    const kind = rnd();
    for (let y = 20; y < h - 10; y += 8 + rnd() * 10) {
      g.strokeStyle = rnd() < 0.5 ? pal[1] : pal[2];
      g.lineWidth = 1 + rnd() * 3;
      g.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const zz = kind < 0.5 ? ((x / 6) % 2 ? 4 : -4) * (0.5 + rnd()) : Math.sin(x * 0.2 + y) * 3;
        x === 0 ? g.moveTo(x, y + zz) : g.lineTo(x, y + zz);
      }
      g.stroke();
    }
    g.globalAlpha = 0.9; g.fillStyle = pal[1];
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w, y = 30 + rnd() * (h - 60);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y + 10); g.lineTo(x - 6, y + 10); g.fill();
    }
    // 成長輪脈
    g.globalAlpha = 0.3; g.strokeStyle = '#2a2018'; g.lineWidth = 1;
    for (let y = 8; y < h; y += 3 + rnd() * 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.globalAlpha = 1;
  });
}

// ---------- マテガイ ----------
class Razor extends Agent {
  constructor(sys, x, z, rnd) {
    super(sys, 'mategai');
    this.rnd = rnd;
    const root = new THREE.Group();
    const tex = canvasTex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#8a6a3a'); gr.addColorStop(0.5, '#d8b878'); gr.addColorStop(1, '#8a6a3a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.35; g.strokeStyle = '#5a4020';
      for (let y = 0; y < h; y += 2 + rnd() * 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.globalAlpha = 1;
    });
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 3.0, 6, 16), physMat({ map: tex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }));
    shell.scale.set(1, 1, 0.62);
    shell.position.y = -1.65;
    root.add(shell);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.005, 3.1, 0.07), physMat({ color: 0x3a2a18 }));
    seam.position.set(0.16, -1.65, 0);
    root.add(seam);
    // 水管
    this.siph = new THREE.Group();
    const s1 = new THREE.Mesh(cyl(0.045, 0.04, 0.16), physMat({ color: 0xb09878, roughness: 0.4 }));
    s1.rotation.z = Math.PI / 2;
    const s2 = s1.clone(); s2.position.x = 0.07; s1.position.x = -0.04;
    this.siph.add(s1, s2);
    root.add(this.siph);
    shadowAll(root);
    this.setup(root);
    this.p = new THREE.Vector2(x, z);
    this.yaw = rnd() * TAU;
    this.ground = this.world.heightAt(x, z);
    root.position.set(x, this.ground, z);
    root.rotation.set((rnd() - 0.5) * 0.12, this.yaw, (rnd() - 0.5) * 0.12);
    // 鍵穴形の巣穴
    const hx = Math.cos(this.yaw) * 0.09, hz = -Math.sin(this.yaw) * 0.09;
    this.holes = [makeHole(this.world, x - hx, z - hz, 0.13, 1, 1), makeHole(this.world, x + hx, z + hz, 0.1, 1, 1)];
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
        this.targetRise = 0.8 + this.rnd() * 1.2; this.timer = 1.5 + this.rnd() * 2.5;
        this.sys.puffs.emit(this.p.x, this.ground + 0.05, this.p.y, 12, 0.3, this.rnd);
      }
    }
    const up = this.targetRise > this.rise;
    this.rise = damp(this.rise, this.targetRise, up ? 6 : 3.5, dt);
    this.root.position.y = this.ground + this.rise - 0.02;
    const sub = depth > 0.04;
    this.siph.position.y = sub ? 0.05 + Math.sin(t * 1.5 + this.phase) * 0.03 : -0.2;
    this.siph.visible = sub || this.rise > 0.05;
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
    this.bait = null;
    const rnd = mulberry32(2024);
    this.rnd = rnd;

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

    const kome = {
      w: 0.24, h: 0.15, l: 0.21, legLen: 0.62, legR: 0.03, clawLen: 0.3, clawBig: 1,
      eyeSep: 0.07, eyeLen: 0.08, eyeR: 0.02, eyeSplay: 1.1, eyeUp: 0.9, eyeRaise: 0,
      holeR: 0.13, roam: 2.2, speed: 0.55, pellets: true, waver: false,
      bodyMat: physMat({ map: mottled('#a89272', '#5e4d3a', '#cbb898', rnd, 420), roughness: 0.6, clearcoat: 0.25 }),
      legMat: physMat({ color: 0xa8916f, roughness: 0.6 }),
      clawMat: physMat({ color: 0xb8a282, roughness: 0.5 }),
      tipMat: physMat({ color: 0xd8ccb8, roughness: 0.4 }),
    };
    const yamato = {
      w: 0.78, h: 0.14, l: 0.4, rect: 4.5, legLen: 1.0, legR: 0.045, clawLen: 0.8, clawBig: 1.25, palmH: 0.8,
      eyeSep: 0.16, eyeLen: 0.5, eyeR: 0.045, eyeSplay: 0.12, eyeUp: 0.1, eyeRaise: 0.5,
      holeR: 0.3, roam: 3.5, speed: 0.8, pellets: false, waver: true,
      bodyMat: physMat({ map: mottled('#6e6450', '#3a3226', '#968a70', rnd, 420), roughness: 0.55, clearcoat: 0.4 }),
      legMat: physMat({ color: 0x7a6e58, roughness: 0.5 }),
      clawMat: physMat({ color: 0xb49e94, roughness: 0.4, clearcoat: 0.6 }),
      tipMat: physMat({ color: 0xe0d0c4, roughness: 0.35 }),
      tipLegMat: physMat({ color: 0x8a7e62, roughness: 0.5 }),
    };

    // コメツキガニ：高めの砂っぽい場所に群れで
    const komeCenters = [];
    for (let i = 0; i < 5; i++) { const c = pick((h, dc) => h > 0.05 && h < 0.9 && dc > 9); if (c) komeCenters.push(c); }
    for (let i = 0; i < 44; i++) {
      const c = komeCenters[i % komeCenters.length];
      const x = c[0] + (rnd() - 0.5) * 9, z = c[1] + (rnd() - 0.5) * 9;
      if (world.heightAt(x, z) < -0.1) continue;
      this.add(new Crab(this, 'kometsuki', x, z, rnd, kome));
    }
    // 初期の砂団子
    for (const a of this.agents) for (let k = 0; k < 14; k++) {
      const ang = rnd() * TAU, r = 0.25 + rnd() * 1.4;
      const x = a.home.x + Math.cos(ang) * r, z = a.home.y + Math.sin(ang) * r;
      this.pellets.add(x, world.heightAt(x, z), z, 0.6 + rnd() * 0.7);
    }
    // ヤマトオサガニ：澪筋近くの泥っぽい低い場所
    for (let i = 0; i < 16; i++) {
      const c = pick((h, dc) => h < 0.1 && h > -0.9 && dc > 4 && dc < 14);
      if (c) this.add(new Crab(this, 'yamato', c[0], c[1], rnd, yamato));
    }
    for (let i = 0; i < 14; i++) {
      const c = pick((h, dc) => h < 0.2 && h > -1.0 && dc > 5);
      if (c) this.add(new GhostShrimp(this, c[0], c[1], rnd));
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
      const c = pick((h, dc) => h < 0.3 && h > -1.1 && dc > 5);
      if (c) this.add(new Clam(this, c[0], c[1], rnd));
    }
    for (let i = 0; i < 18; i++) {
      const c = pick((h, dc) => h < 0.35 && h > -0.8 && dc > 6);
      if (c) this.add(new Razor(this, c[0], c[1], rnd));
    }
    // アラムシロガイが集まる「えさ」（打ち上げられた小魚）
    this.buildBait();
  }

  buildBait() {
    const w = this.world;
    const g = new THREE.Group();
    const f = buildFish({ len: 2.2, girth: 1.0, back: '#6a6f78', side: '#b8c0c8', belly: '#e8ecf0', spot: '#50565e', spots: 0, spotSize: 1, dots: '#404850', fin: '#c0c4c8' }, this.rnd);
    f.root.rotation.z = Math.PI / 2;
    f.root.position.y = 0.12;
    g.add(f.root);
    const x = this.bait.x, z = this.bait.z;
    g.position.set(x, w.heightAt(x, z), z);
    g.rotation.y = 0.7;
    w.scene.add(g);
  }

  add(a) { this.agents.push(a); }

  update(dt, t) {
    // 群れの中心（マハゼ）
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
