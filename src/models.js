// 生き物の造形（SDF で作る有機的なパーツと、関節を持つリグ）
import * as THREE from 'three';
import { sphere, ellipsoid, cone, roundBox, tube, union, smin, smax, meshSDF } from './sdf.js';
import { mulberry32 } from './noise.js';

const TAU = Math.PI * 2;
const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// ---------- 汎用パーツ ----------
// 脚の節：+x 方向に長さ len、断面は z 方向に平たい
export function segGeo(len, r1, r2, flat = 0.6, opts = {}) {
  const q = opts.q || 1;
  const key = `seg:${len}:${r1}:${r2}:${flat}:${opts.curve || 0}:${opts.knob ?? 1}:${q}`;
  return cached(key, () => {
    const curve = opts.curve || 0;
    const body = curve
      ? tube([[0, 0, 0], [len * 0.5, -curve * len * 0.25, 0], [len, -curve * len, 0]], [r1, (r1 + r2) * 0.5, r2])
      : cone([0, 0, 0], [len, 0, 0], r1, r2);
    const knob = sphere([r1 * 0.2, 0, 0], r1 * 1.02);
    const useKnob = opts.knob ?? 1;
    const ridge = cone([len * 0.1, r1 * 0.55, 0], [len * 0.85, r2 * 0.5 - curve * len * 0.4, 0], r1 * 0.35, r2 * 0.3);
    const f = (x, y, z) => {
      const zz = z / flat;
      let d = body(x, y, zz);
      if (useKnob) d = smin(d, knob(x, y, zz), r1 * 0.4);
      // 背側の稜
      d = smin(d, ridge(x, y, zz), r1 * 0.5);
      return d * flat;
    };
    const rMax = Math.max(r1, r2) * 1.3;
    const cell = Math.min(Math.max(Math.max(r1, r2) * 0.3, len / 90), len / 14) * q;
    return meshSDF(f, [-rMax, -rMax - curve * len, -rMax * flat], [len + rMax, rMax, rMax * flat], cell);
  });
}

// はさみの掌部＋不動指（+x 方向）
function palmGeo(P, H, T, q = 1) {
  return cached(`palm:${P}:${H}:${T}:${q}`, () => {
    const manus = ellipsoid([P * 0.3, 0, 0], [P * 0.36, H * 0.5, T * 0.5]);
    const heel = ellipsoid([P * 0.08, -H * 0.05, 0], [P * 0.14, H * 0.32, T * 0.42]);
    const pollex = tube([[P * 0.5, -H * 0.2, 0], [P * 0.78, -H * 0.13, 0], [P * 1.02, -H * 0.0, 0]], [H * 0.21, H * 0.13, H * 0.03], H * 0.05);
    const teeth = [];
    for (let i = 0; i < 5; i++) teeth.push(sphere([P * (0.58 + i * 0.08), -H * (0.06 - i * 0.008), 0], H * 0.045));
    const f = (x, y, z) => {
      let d = smin(manus(x, y, z), heel(x, y, z), H * 0.2);
      d = smin(d, pollex(x, y, z), H * 0.18);
      for (const t of teeth) d = smin(d, t(x, y, z), H * 0.03);
      // 外側の稜線
      d = smin(d, cone([P * 0.05, H * 0.42, 0], [P * 0.55, H * 0.38, 0], H * 0.06, H * 0.05)(x, y, z), H * 0.12);
      return d;
    };
    return meshSDF(f, [-P * 0.1, -H * 0.6, -T * 0.6], [P * 1.08, H * 0.6, T * 0.6], Math.max(H, T) / 16 * q);
  });
}

// オサガニ類の鉗：掌はやや扁平、指は長く先細りで内側に歯
function chelaGeo(P, H, T, q = 1) {
  return cached(`chela:${P}:${H}:${T}:${q}`, () => {
    const manus = ellipsoid([P * 0.26, 0, 0], [P * 0.3, H * 0.5, T * 0.5]);
    const heel = ellipsoid([P * 0.06, -H * 0.02, 0], [P * 0.1, H * 0.34, T * 0.4]);
    const pollex = tube([[P * 0.42, -H * 0.2, 0], [P * 0.72, -H * 0.2, 0], [P * 1.0, -H * 0.08, 0], [P * 1.08, H * 0.02, 0]], [H * 0.2, H * 0.12, H * 0.06, H * 0.02], H * 0.04);
    const teeth = [];
    for (let i = 0; i < 6; i++) teeth.push(sphere([P * (0.5 + i * 0.08), -H * (0.08 - i * 0.004), 0], H * 0.035));
    const f = (x, y, z) => {
      let d = smin(manus(x, y, z), heel(x, y, z), H * 0.2);
      d = smin(d, pollex(x, y, z * 1.15) / 1.15, H * 0.14);
      for (const t of teeth) d = smin(d, t(x, y, z), H * 0.025);
      return d;
    };
    return meshSDF(f, [-P * 0.08, -H * 0.6, -T * 0.6], [P * 1.12, H * 0.6, T * 0.6], Math.max(H, T) / 18 * q);
  });
}
function chelaDactGeo(P, H, q = 1) {
  return cached(`chelaD:${P}:${H}:${q}`, () => {
    const t = tube([[0, 0, 0], [P * 0.2, H * 0.06, 0], [P * 0.42, 0, 0], [P * 0.55, -H * 0.16, 0]], [H * 0.16, H * 0.11, H * 0.06, H * 0.02], H * 0.04);
    const teeth = [];
    for (let i = 0; i < 5; i++) teeth.push(sphere([P * (0.1 + i * 0.08), -H * 0.08, 0], H * 0.03));
    const f = (x, y, z) => { let d = t(x, y, z * 1.2) / 1.2; for (const s of teeth) d = smin(d, s(x, y, z), H * 0.025); return d; };
    return meshSDF(f, [-H * 0.2, -H * 0.3, -H * 0.2], [P * 0.6, H * 0.25, H * 0.2], H / 22 * q);
  });
}

// 可動指（原点が関節、+x 方向）
function dactylGeo(P, H, q = 1) {
  return cached(`dact:${P}:${H}:${q}`, () => {
    const t = tube([[0, 0, 0], [P * 0.22, H * 0.03, 0], [P * 0.46, -H * 0.14, 0]], [H * 0.17, H * 0.12, H * 0.03], H * 0.05);
    const teeth = [];
    for (let i = 0; i < 4; i++) teeth.push(sphere([P * (0.1 + i * 0.08), -H * 0.11, 0], H * 0.035));
    const f = (x, y, z) => { let d = t(x, y, z * 1.3) / 1.3; for (const s of teeth) d = smin(d, s(x, y, z), H * 0.03); return d; };
    return meshSDF(f, [-H * 0.2, -H * 0.3, -H * 0.2], [P * 0.5, H * 0.25, H * 0.2], H / 24 * q);
  });
}

// ---------- カニの甲 ----------
// コメツキガニ：丸みのある四角形で背が高く盛り上がる甲。前縁中央に寄った眼窩
function kometsukiCarapace(w, h, l, q = 1) {
  return cached(`kome-car2:${w}:${h}:${q}`, () => {
    const core = roundBox([0, -h * 0.15, 0], [w * 0.9, h * 0.55, l * 0.9], h * 0.5);
    const dome = ellipsoid([0, h * 0.05, -l * 0.05], [w, h, l]);
    const cheeks = [1, -1].map((s) => ellipsoid([s * w * 0.5, h * 0.05, l * 0.25], [w * 0.5, h * 0.8, l * 0.6]));
    const orbits = [1, -1].map((s) => ellipsoid([s * w * 0.3, h * 0.45, l * 0.98], [w * 0.14, h * 0.28, l * 0.2]));
    const front = ellipsoid([0, h * 0.3, l * 1.08], [w * 0.1, h * 0.35, l * 0.12]);
    const grooveH = cone([-w * 0.2, h * 1.04, l * 0.02], [w * 0.2, h * 1.04, l * 0.02], h * 0.05, h * 0.05);
    const grooveL = [1, -1].map((s) => cone([s * w * 0.22, h * 1.0, l * 0.4], [s * w * 0.26, h * 0.95, -l * 0.4], h * 0.05, h * 0.05));
    const sternum = ellipsoid([0, -h * 0.6, -l * 0.05], [w * 0.8, h * 0.25, l * 0.8]);
    const f = (x, y, z) => {
      let d = smin(core(x, y, z), dome(x, y, z), w * 0.2);
      for (const c of cheeks) d = smin(d, c(x, y, z), w * 0.2);
      d = smax(d, -(y + h * 0.66), h * 0.2);
      d = smin(d, sternum(x, y, z), h * 0.15);
      for (const o of orbits) d = smax(d, -o(x, y, z), w * 0.05);
      d = smax(d, -front(x, y, z), w * 0.05);
      d = smax(d, -grooveH(x, y, z), h * 0.05);
      for (const g of grooveL) d = smax(d, -g(x, y, z), h * 0.05);
      return d;
    };
    return meshSDF(f, [-w * 1.1, -h * 1.0, -l * 1.1], [w * 1.1, h * 1.15, l * 1.2], (w / 30) * q);
  });
}

// 脚の剛毛：節の背縁と腹縁から外向き・先端向きに伸びる細い針（+x が節の長さ方向）
export function bristleGeo(len, r, count, hairLen, seed = 1) {
  return cached(`bristle:${len}:${r}:${count}:${hairLen}:${seed}`, () => {
    const rnd = mulberry32(seed);
    const pos = [];
    const dir = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), b = new THREE.Vector3(), tip = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      const x = ((i + 0.5 + (rnd() - 0.5) * 0.8) / count) * len;
      b.set(x, side * r * 0.75, (rnd() - 0.5) * r * 0.5);
      dir.set(0.5 + rnd() * 0.5, side * (0.8 + rnd() * 0.4), (rnd() - 0.5) * 0.9).normalize();
      const L = hairLen * (0.55 + rnd() * 0.7);
      tip.copy(b).addScaledVector(dir, L);
      u.crossVectors(dir, up).normalize().multiplyScalar(r * 0.09);
      v.crossVectors(dir, u).normalize().multiplyScalar(r * 0.09);
      const p0 = b.clone().add(u), p1 = b.clone().sub(u).add(v), p2 = b.clone().sub(u).sub(v);
      for (const [A, B] of [[p0, p1], [p1, p2], [p2, p0]]) pos.push(A.x, A.y, A.z, B.x, B.y, B.z, tip.x, tip.y, tip.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  });
}

// ヤマトオサガニ：前が広い台形で厚みのある甲。前縁に長い眼窩、前側縁に歯
function yamatoCarapace(w, h, l, q = 1) {
  return cached(`yama-car2:${w}:${h}:${q}`, () => {
    const box = roundBox([0, -h * 0.1, 0], [w, h * 0.5, l], h * 0.45);
    const dome = ellipsoid([0, h * 0.15, -l * 0.02], [w * 0.97, h * 0.85, l * 0.97]);
    const regions = [
      ellipsoid([0, h * 0.6, l * 0.18], [w * 0.26, h * 0.42, l * 0.42]),
      ellipsoid([w * 0.52, h * 0.48, -l * 0.02], [w * 0.36, h * 0.42, l * 0.62]),
      ellipsoid([-w * 0.52, h * 0.48, -l * 0.02], [w * 0.36, h * 0.42, l * 0.62]),
      ellipsoid([0, h * 0.5, -l * 0.5], [w * 0.18, h * 0.36, l * 0.3]),
    ];
    const orbit = [1, -1].map((s) => cone([s * w * 0.1, h * 0.3, l * 1.0], [s * w * 0.92, h * 0.28, l * 0.95], h * 0.26, h * 0.22));
    const frontNotch = ellipsoid([0, h * 0.35, l * 1.03], [w * 0.05, h * 0.45, l * 0.08]);
    const teeth = [1, -1].map((s) => cone([s * w * 0.86, h * 0.15, l * 0.88], [s * w * 1.04, h * 0.26, l * 0.94], h * 0.3, h * 0.07));
    const teeth2 = [1, -1].map((s) => cone([s * w * 0.9, h * 0.05, l * 0.45], [s * w * 1.03, h * 0.12, l * 0.5], h * 0.25, h * 0.06));
    const hGroove = cone([-w * 0.18, h * 1.0, l * 0.0], [w * 0.18, h * 1.0, l * 0.0], h * 0.08, h * 0.08);
    const brG = [1, -1].map((s) => cone([s * w * 0.24, h * 0.98, l * 0.35], [s * w * 0.2, h * 0.92, -l * 0.55], h * 0.08, h * 0.07));
    const f = (x, y, z) => {
      const xs = x / (1 + 0.13 * (z / l));   // 前ほど幅広い
      let d = smin(box(xs, y, z), dome(xs, y, z), h * 0.5);
      for (const r of regions) d = smin(d, r(xs, y, z), h * 0.45);
      d = smax(d, -(y + h * 0.58), h * 0.25);
      for (const o of orbit) d = smax(d, -o(x, y, z), h * 0.1);
      d = smax(d, -frontNotch(x, y, z), h * 0.12);
      for (const t of teeth) d = smin(d, t(x, y, z), h * 0.15);
      for (const t of teeth2) d = smin(d, t(x, y, z), h * 0.15);
      d = smax(d, -hGroove(x, y, z), h * 0.08);
      for (const g of brG) d = smax(d, -g(x, y, z), h * 0.08);
      return d;
    };
    return meshSDF(f, [-w * 1.2, -h * 0.8, -l * 1.1], [w * 1.2, h * 1.3, l * 1.15], (w / 44) * q);
  });
}

// 第3顎脚（口の蓋）
function mouthGeo(s, q = 1) {
  return cached(`mouth:${s}:${q}`, () => meshSDF(ellipsoid([0, 0, 0], [s * 0.3, s * 0.55, s * 0.08]), [-s * 0.4, -s * 0.7, -s * 0.2], [s * 0.4, s * 0.7, s * 0.2], s / 16 * q));
}

// ---------- カニ一式 ----------
export const CRAB_SPECS = {
  kometsuki: {
    w: 0.2, h: 0.13, l: 0.18,
    carapace: kometsukiCarapace,
    legs: { merus: 0.19, carpus: 0.075, prop: 0.13, dact: 0.13, r: 0.02, merusR: 1.45, merusFlat: 0.42, flat: 0.55, k: [0.9, 1.0, 1.0, 0.86], spread: 0.44, curve: 0.2, setae: 0.05 },
    claw: { merus: 0.08, carpus: 0.06, palm: 0.2, H: 0.13, T: 0.06, r: 0.022, big: 1, chela: true },
    eye: { stalk: 0.085, r: 0.012, cornea: 0.017, cLen: 1.9, sep: 0.06, yaw: 0.2, up: 0.1, raise: 1.35 },
    mouth: 0.08,
    Hb: 0.12, phiD: 1.05, stepTime: 0.11, stepH: 0.05, stepThresh: 0.07,
  },
  yamato: {
    w: 0.56, h: 0.17, l: 0.4,
    carapace: yamatoCarapace,
    legs: { merus: 0.3, carpus: 0.12, prop: 0.17, dact: 0.16, r: 0.05, flat: 0.6, k: [0.9, 1.0, 1.0, 0.84], spread: 0.4, curve: 0.12 },
    claw: { merus: 0.22, carpus: 0.12, palm: 0.4, H: 0.19, T: 0.095, r: 0.045, big: 1.15, chela: true },
    eye: { stalk: 0.3, r: 0.013, cornea: 0.021, sep: 0.11, yaw: 0.25, up: 0.08, raise: 1.35 },
    mouth: 0.11,
    Hb: 0.3, phiD: 0.95, stepTime: 0.16, stepH: 0.08, stepThresh: 0.16,
  },
};

export function crabKit(name, q = 1) {
  return cached(`crabkit:${name}:${q}`, () => {
    const S = CRAB_SPECS[name];
    const L = S.legs, C = S.claw, E = S.eye;
    return {
      carapace: S.carapace(S.w, S.h, S.l, q),
      merus: segGeo(L.merus, L.r * (L.merusR || 1), L.r * (L.merusR || 1) * 0.8, L.merusFlat || L.flat, { q }),
      carpus: segGeo(L.carpus, L.r * 0.85, L.r * 0.8, L.flat, { q }),
      prop: segGeo(L.prop, L.r * 0.78, L.r * 0.6, L.flat, { q }),
      dact: segGeo(L.dact, L.r * 0.6, L.r * 0.12, L.flat, { curve: L.curve, knob: 0, q }),
      cMerus: segGeo(C.merus, C.r, C.r * 0.95, 0.75, { q }),
      cCarpus: segGeo(C.carpus, C.r * 1.05, C.r * 0.95, 0.8, { q }),
      palm: C.chela ? chelaGeo(C.palm, C.H, C.T, q) : palmGeo(C.palm, C.H, C.T, q),
      cDact: C.chela ? chelaDactGeo(C.palm, C.H, q) : dactylGeo(C.palm, C.H, q),
      stalk: segGeo(E.stalk, E.r, E.r * 0.9, 1, { knob: 0, q }),
      ...(L.setae ? {
        hairM: bristleGeo(L.merus, L.r * (L.merusR || 1), 12, L.setae, 3),
        hairC: bristleGeo(L.carpus, L.r * 0.85, 5, L.setae * 0.9, 5),
        hairP: bristleGeo(L.prop, L.r * 0.75, 10, L.setae * 0.9, 7),
        hairD: bristleGeo(L.dact * 0.7, L.r * 0.5, 6, L.setae * 0.6, 9),
      } : {}),
      cornea: new THREE.SphereGeometry(E.cornea, Math.round(20 / q), Math.round(14 / q)),
      mouth: mouthGeo(S.mouth, q),
    };
  });
}

// 個体のリグを組み立てる。mats: { shell, leg, claw, cornea }
export function buildCrab(name, mats, male = true, q = 1) {
  const S = CRAB_SPECS[name], K = crabKit(name, q);
  const L = S.legs, C = S.claw, E = S.eye;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.position.y = S.Hb;
  const car = new THREE.Mesh(K.carapace, mats.shell);
  body.add(car);

  const legs = [];
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const k = L.k[i];
      const hip = new THREE.Group();
      hip.position.set(s * S.w * 0.82, -S.h * 0.3, S.l * (0.45 - i * 0.33));
      const spread = (i - 1.5) * L.spread;
      const baseYaw = s > 0 ? spread : Math.PI - spread;
      hip.rotation.y = baseYaw;
      const F = new THREE.Group();
      const mer = new THREE.Mesh(K.merus, mats.merus || mats.leg); mer.scale.setScalar(k); F.add(mer);
      const Kn = new THREE.Group(); Kn.position.x = L.merus * k;
      const carp = new THREE.Mesh(K.carpus, mats.leg); carp.scale.setScalar(k); Kn.add(carp);
      const prop = new THREE.Mesh(K.prop, mats.leg); prop.scale.setScalar(k); prop.position.x = L.carpus * k; Kn.add(prop);
      const D = new THREE.Group(); D.position.x = (L.carpus + L.prop) * k;
      const dac = new THREE.Mesh(K.dact, mats.leg); dac.scale.setScalar(k); D.add(dac);
      if (L.setae && q === 1 && mats.setae) {
        const add = (parent, geo, x) => { const m = new THREE.Mesh(geo, mats.setae); m.scale.setScalar(k); m.position.x = x; m.userData.noLOD = true; parent.add(m); };
        add(F, K.hairM, 0); add(Kn, K.hairC, 0); add(Kn, K.hairP, L.carpus * k); add(D, K.hairD, 0);
      }
      Kn.add(D); F.add(Kn); hip.add(F); body.add(hip);
      const a = L.merus * k, b = (L.carpus + L.prop) * k;
      const dl = L.dact * k * Math.hypot(1, L.curve), dAng = Math.atan(L.curve);
      const reach = (a + b) * 0.92 + dl * 0.35;
      const restLocal = new THREE.Vector3(
        hip.position.x + Math.cos(baseYaw) * reach, -S.Hb, hip.position.z - Math.sin(baseYaw) * reach);
      legs.push({ hip, F, K: Kn, D, a, b, dl, dAng, baseYaw, s, i, restLocal, group: (i + (s > 0 ? 0 : 1)) % 2, foot: new THREE.Vector3(), valid: false, stepping: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }
  }

  // 鉗脚
  const claws = [];
  for (const s of [1, -1]) {
    const big = s > 0 && male ? C.big : (male ? 1 : 0.85);
    const sh = new THREE.Group();
    sh.position.set(s * S.w * 0.42, -S.h * 0.25, S.l * 0.78);
    const g0 = new THREE.Group(); sh.add(g0);
    const m1 = new THREE.Mesh(K.cMerus, mats.arm || mats.claw); m1.scale.setScalar(big); g0.add(m1);
    const g1 = new THREE.Group(); g1.position.x = C.merus * big; g0.add(g1);
    const m2 = new THREE.Mesh(K.cCarpus, mats.arm || mats.claw); m2.scale.setScalar(big); g1.add(m2);
    const g2 = new THREE.Group(); g2.position.x = C.carpus * big; g1.add(g2);
    const palm = new THREE.Mesh(K.palm, mats.claw); palm.scale.setScalar(big); g2.add(palm);
    const g3 = new THREE.Group(); g3.position.set(C.palm * (C.chela ? 0.5 : 0.56) * big, C.H * (C.chela ? 0.16 : 0.2) * big, 0); g2.add(g3);
    const dm = new THREE.Mesh(K.cDact, mats.claw); dm.scale.setScalar(big); g3.add(dm);
    body.add(sh);
    claws.push({ sh, g0, g1, g2, g3, s, big });
  }

  // 眼柄
  const eyes = [];
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(s * E.sep, S.h * 0.3, S.l * 0.93);
    const inner = new THREE.Group(); g.add(inner);
    inner.add(new THREE.Mesh(K.stalk, mats.stalk || mats.leg));
    const co = new THREE.Mesh(K.cornea, mats.cornea);
    const cl = E.cLen || 1.25;
    co.position.x = E.stalk + E.cornea * (cl - 0.7) * 0.8;
    co.scale.set(cl, 1, 1);
    inner.add(co);
    body.add(g);
    eyes.push({ g, inner, s });
  }

  // 口器
  const mouth = [];
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(K.mouth, mats.mouth || mats.shell);
    m.position.set(s * S.mouth * 0.27, -S.h * 0.32, S.l * 0.9);
    m.rotation.x = -0.35;
    body.add(m);
    mouth.push(m);
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, body, legs, claws, eyes, mouth, spec: S };
}

// ---------- 巻貝の殻（対数らせんの管を高解像度で掃引） ----------
export function spiralShell(o) {
  const key = 'shell:' + JSON.stringify(o);
  return cached(key, () => {
    const perTurn = o.perTurn || 48, rad = o.rad || 20;
    const seg = Math.round(o.turns * perTurn);
    const thetaMax = o.turns * TAU;
    const k = Math.log(o.shrink) / thetaMax;
    const center = (th) => {
      const g = Math.exp(k * th);
      return [g, new THREE.Vector3(Math.cos(th) * o.coil * g, o.height * (1 - g) / (1 - o.shrink), Math.sin(th) * o.coil * g)];
    };
    const pos = [], col = [], idx = [];
    const cA = new THREE.Color(o.colA), cB = new THREE.Color(o.colB), cC = new THREE.Color(o.colC || o.colB), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * thetaMax;
      const [g, C] = center(th);
      const C2 = center(th + 0.01)[1];
      const T = C2.sub(C).normalize();
      const B = new THREE.Vector3().crossVectors(T, up).normalize();
      const N = new THREE.Vector3().crossVectors(B, T).normalize();
      // 殻口の縁を厚く反らせる
      const lip = th < 0.35 ? (1 - th / 0.35) : 0;
      for (let j = 0; j <= rad; j++) {
        const ph = (j / rad) * TAU;
        let r = o.apR * g;
        const rib = Math.pow(Math.max(0, Math.sin(th * o.ribs)), 2);
        const cord = Math.pow(Math.max(0, Math.sin(ph * o.cords)), 2);
        r *= 1 + o.ribAmp * rib + o.cordAmp * cord + (o.knobAmp || 0) * rib * cord + lip * 0.12;
        const P = C.clone().addScaledVector(B, Math.cos(ph) * r).addScaledVector(N, Math.sin(ph) * r);
        pos.push(P.x, P.y, P.z);
        // 色：螺旋帯、縫合線付近の明帯、殻頂は摩耗して白っぽい
        const band = 0.5 + 0.5 * Math.sin(ph * (o.bands || 1) + (o.bandPhase || 0));
        c.copy(cA).lerp(cB, Math.pow(band, 3));
        const suture = Math.pow(Math.max(0, Math.cos(ph - (o.sutureAt ?? 1.6))), 12);
        c.lerp(cC, suture * 0.7);
        const shade = 0.82 + 0.18 * (rib * 0.6 + cord * 0.4);
        const worn = Math.max(0, (th / thetaMax - 0.72) / 0.28);
        c.lerp(new THREE.Color(0xcfc6b8), worn * 0.8);
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
    geo.translate(-o.coil, 0, 0);
    geo.computeBoundingSphere();
    return geo;
  });
}

// ---------- ハゼ稚魚 ----------
export function gobyKit() {
  return cached('goby2', () => {
    // 体は断面（幅・高さ・中心の高さ）を体軸に沿って補間するロフト形状（頭が +z）
    const Z = [-0.47, -0.43, -0.36, -0.2, -0.02, 0.14, 0.24, 0.33, 0.41, 0.46, 0.5];
    const W = [0.008, 0.02, 0.032, 0.052, 0.07, 0.078, 0.084, 0.084, 0.072, 0.052, 0.014];
    const H = [0.04, 0.047, 0.052, 0.068, 0.08, 0.082, 0.077, 0.068, 0.056, 0.042, 0.014];
    const Y = [0.0, 0.0, 0.0, 0.002, 0.004, 0.004, 0.002, 0.0, -0.004, -0.01, -0.016];
    const interp = (arr, z) => {
      if (z <= Z[0]) return arr[0];
      for (let i = 0; i < Z.length - 1; i++) {
        if (z <= Z[i + 1]) {
          const t = (z - Z[i]) / (Z[i + 1] - Z[i]);
          const e = t * t * (3 - 2 * t);
          return arr[i] + (arr[i + 1] - arr[i]) * e;
        }
      }
      return arr[arr.length - 1];
    };
    const z0 = Z[0], z1 = Z[Z.length - 1];
    const loft = (x, y, z) => {
      const zc = Math.min(z1, Math.max(z0, z));
      const w = interp(W, zc), yc = interp(Y, zc);
      let h = interp(H, zc);
      if (y < yc) h *= 0.86;                      // 腹は平たい
      else if (zc > 0.2) h *= 0.9;                // 頭頂はやや扁平
      let d = (Math.hypot(x / w, (y - yc) / h) - 1) * Math.min(w, h) * 0.9;
      const over = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
      if (over > 0) d = Math.hypot(Math.max(d, 0), over);
      return d;
    };
    const jaw = ellipsoid([0, -0.03, 0.455], [0.046, 0.018, 0.05]);
    const mouth = ellipsoid([0, -0.018, 0.47], [0.058, 0.0055, 0.055]);
    const cheeks = [1, -1].map((s) => ellipsoid([s * 0.048, -0.012, 0.28], [0.04, 0.046, 0.075]));
    const eyeB = [1, -1].map((s) => sphere([s * 0.033, 0.052, 0.37], 0.027));
    const gill = [1, -1].map((s) => cone([s * 0.078, 0.035, 0.215], [s * 0.07, -0.058, 0.235], 0.0035, 0.0035));
    const f = (x, y, z) => {
      let d = loft(x, y, z);
      for (const c of cheeks) d = smin(d, c(x, y, z), 0.03);
      d = smin(d, jaw(x, y, z), 0.02);
      for (const e of eyeB) d = smin(d, e(x, y, z), 0.022);
      d = smax(d, -mouth(x, y, z), 0.006);
      for (const g of gill) d = smax(d, -g(x, y, z), 0.005);
      return d;
    };
    const body = meshSDF(f, [-0.1, -0.09, -0.49], [0.1, 0.1, 0.53], 0.0068);

    // 鰭：鰭条ごとに u が整数になる UV（シェーダで鰭条と斑点の列を描く）
    const fin = (base, tip, rays, nv = 7) => {
      const nu = rays * 3;
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const b = base(u), t = tip(u, b);
        for (let j = 0; j <= nv; j++) {
          const v = j / nv;
          pos.push(b[0] + (t[0] - b[0]) * v, b[1] + (t[1] - b[1]) * v, b[2] + (t[2] - b[2]) * v);
          uv.push(u * rays, v);
        }
      }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j, b = a + nv + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('finUV', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    const topY = (z) => interp(Y, z) + interp(H, z) * 0.9 - 0.004;
    const botY = (z) => interp(Y, z) - interp(H, z) * 0.86 + 0.004;
    const fins = {
      d1: fin((u) => { const z = 0.16 - u * 0.13; return [0, topY(z), z]; },
        (u, b) => [0, b[1] + 0.105 * Math.pow(Math.sin(Math.PI * (0.08 + 0.86 * u)), 0.8) + 0.006, b[2] - 0.045], 6),
      d2: fin((u) => { const z = -0.01 - u * 0.32; return [0, topY(z), z]; },
        (u, b) => [0, b[1] + (0.082 - 0.02 * u) * (1 - Math.pow(u, 6)) + 0.006, b[2] - 0.05 - 0.02 * u], 12),
      anal: fin((u) => { const z = -0.06 - u * 0.27; return [0, botY(z), z]; },
        (u, b) => [0, b[1] - 0.062 * (1 - Math.pow(u, 6)) - 0.005, b[2] - 0.045 - 0.02 * u], 11),
      caudal: fin((u) => lerp3([0, -0.044, -0.445], [0, 0.044, -0.445], u),
        (u, b) => [0, b[1] * 2.3, -0.445 - 0.23 * (1 - 1.2 * (u - 0.5) ** 2)], 15, 8),
      pelvic: fin((u) => lerp3([-0.04, -0.068, 0.19], [0.04, -0.068, 0.19], u),
        (u, b) => [b[0] * 1.35, b[1] - 0.016 - 0.012 * Math.sin(Math.PI * u), 0.19 - 0.12 * (1 - 1.8 * (u - 0.5) ** 2)], 10, 5),
    };
    for (const s of [1, -1]) {
      fins['pec' + s] = fin(
        (u) => lerp3([s * 0.076, -0.056, 0.215], [s * 0.072, 0.026, 0.222], u),
        (u, b) => {
          const a = -1.0 + u * 1.75;
          const R = 0.145 * (1 - 0.3 * (u - 0.45) ** 2);
          return [b[0] + s * 0.05, b[1] + Math.sin(a) * R, b[2] - Math.cos(a) * R];
        }, 16, 7);
    }
    const eye = new THREE.SphereGeometry(0.026, 28, 20);
    return { body, fins, eye };
  });
}

// ---------- スナモグリ ----------
export function shrimpKit() {
  return cached('shrimp', () => {
    const car = (() => {
      const main = ellipsoid([0, 0, 0.2], [0.1, 0.095, 0.23]);
      const ros = cone([0, 0.03, 0.4], [0, 0.02, 0.47], 0.03, 0.006);
      const cerv = cone([-0.11, 0.07, 0.24], [0.11, 0.07, 0.24], 0.008, 0.008);
      const f = (x, y, z) => smax(smin(main(x, y, z), ros(x, y, z), 0.03), -cerv(x, y, z), 0.01);
      return meshSDF(f, [-0.12, -0.11, -0.05], [0.12, 0.11, 0.48], 0.0085);
    })();
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const w = 0.13 - i * 0.008, hgt = 0.085 - i * 0.004;
      const main = ellipsoid([0, 0, -0.055], [w, hgt, 0.075]);
      const pleura = ellipsoid([0, -hgt * 0.45, -0.055], [w * 1.08, hgt * 0.6, 0.06]);
      const f = (x, y, z) => smin(main(x, y, z), pleura(x, y, z), 0.02);
      segs.push(meshSDF(f, [-w * 1.15, -hgt * 1.2, -0.14], [w * 1.15, hgt * 1.1, 0.03], 0.009));
    }
    const tail = (() => {
      const tel = roundBox([0, 0, -0.08], [0.04, 0.012, 0.075], 0.01);
      const uro = [1, -1].map((s) => ellipsoid([s * 0.07, -0.004, -0.085], [0.045, 0.01, 0.085]));
      const f = (x, y, z) => { let d = tel(x, y, z); for (const u of uro) d = smin(d, u(x, y, z), 0.015); return d; };
      return meshSDF(f, [-0.13, -0.03, -0.18], [0.13, 0.03, 0.01], 0.005);
    })();
    const bigPalm = (() => {
      const box = roundBox([0.12, 0, 0], [0.11, 0.068, 0.03], 0.028);
      const heel = ellipsoid([0.04, -0.01, 0], [0.06, 0.06, 0.035]);
      const pol = tube([[0.2, -0.03, 0], [0.28, -0.026, 0], [0.35, -0.006, 0]], [0.026, 0.017, 0.004]);
      const gap = ellipsoid([0.3, 0.012, 0], [0.07, 0.016, 0.06]);
      const teeth = [0, 1, 2].map((i) => sphere([0.24 + i * 0.03, -0.012, 0], 0.008));
      const f = (x, y, z) => {
        let d = smin(box(x, y, z), heel(x, y, z), 0.03);
        d = smin(d, pol(x, y, z), 0.02);
        d = smax(d, -gap(x, y, z), 0.01);
        for (const t of teeth) d = smin(d, t(x, y, z), 0.006);
        return d;
      };
      return meshSDF(f, [-0.03, -0.08, -0.045], [0.37, 0.08, 0.045], 0.006);
    })();
    const bigDact = meshSDF(tube([[0, 0, 0], [0.08, 0.005, 0], [0.16, -0.02, 0]], [0.024, 0.016, 0.004]), [-0.03, -0.03, -0.03], [0.17, 0.03, 0.03], 0.004);
    return {
      car, segs, tail, bigPalm, bigDact,
      arm: segGeo(0.12, 0.028, 0.026, 0.7),
      leg: segGeo(0.16, 0.012, 0.008, 0.7),
      legD: segGeo(0.1, 0.008, 0.003, 0.7, { curve: 0.2, knob: 0 }),
      antenna: segGeo(0.55, 0.006, 0.0015, 1, { knob: 0, curve: 0.05 }),
      eye: new THREE.SphereGeometry(0.008, 10, 8),
    };
  });
}

// ---------- 二枚貝 ----------
export function asariGeo() {
  return cached('asari', () => {
    const g = new THREE.SphereGeometry(1, 64, 40);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
      X = X * (1 + 0.12 * Y) + 0.28 * Math.max(0, Y) ** 2;
      // 殻の合わせ目は薄く、中央は膨らむ
      Z *= 0.95 * (1 - 0.3 * Math.abs(Y) ** 2) * (1 - 0.18 * Math.abs(X) ** 3);
      // 殻頂（ウンボ）の突出
      const u = Math.exp(-((X - 0.28) ** 2 + (Y - 0.95) ** 2) * 25);
      Y += u * 0.06;
      p.setXYZ(i, X, Y, Z);
    }
    g.scale(0.8, 0.6, 0.38);
    g.computeVertexNormals();
    return g;
  });
}

// 入水管・出水管（+y 方向、先端に触手の房）
export function siphonGeo(r = 0.06, len = 0.5, tent = 10) {
  return cached(`siphon:${r}:${len}:${tent}`, () => {
    const inT = cone([r * 0.55, 0, 0], [r * 0.55, len, 0], r * 1.05, r * 0.95);
    const exT = cone([-r * 0.62, 0, 0], [-r * 0.62, len * 0.93, 0], r * 0.85, r * 0.78);
    const holeA = cone([r * 0.55, len * 0.7, 0], [r * 0.55, len * 1.2, 0], r * 0.55, r * 0.6);
    const holeB = cone([-r * 0.62, len * 0.65, 0], [-r * 0.62, len * 1.2, 0], r * 0.42, r * 0.5);
    const tents = [];
    for (let i = 0; i < tent; i++) {
      const a = (i / tent) * TAU;
      const bx = r * 0.55 + Math.cos(a) * r * 0.85, bz = Math.sin(a) * r * 0.85;
      tents.push(cone([bx, len * 0.97, bz], [r * 0.55 + Math.cos(a) * r * 1.35, len + r * 0.9, Math.sin(a) * r * 1.35], r * 0.16, r * 0.04));
    }
    const f = (x, y, z) => {
      let d = smin(inT(x, y, z), exT(x, y, z), r * 0.4);
      d = smax(d, -holeA(x, y, z), r * 0.1);
      d = smax(d, -holeB(x, y, z), r * 0.1);
      for (const t of tents) d = smin(d, t(x, y, z), r * 0.08);
      return d;
    };
    return meshSDF(f, [-r * 1.6, -r * 0.2, -r * 1.6], [r * 2.1, len + r * 1.4, r * 1.6], r / 6);
  });
}

export function razorGeo() {
  return cached('razor', () => {
    const shell = roundBox([0, -1.9, 0], [0.15, 1.9, 0.085], 0.08);
    const f = (x, y, z) => shell(x + 0.02 * Math.sin(y * 0.5), y, z);
    return meshSDF(f, [-0.2, -3.9, -0.12], [0.2, 0.1, 0.12], 0.022);
  });
}

// ---------- アラムシロガイ・ヤドカリの軟体 ----------
export function nassaKit() {
  return cached('nassa', () => {
    const foot = (() => {
      const m = ellipsoid([0, 0.0, 0.05], [0.16, 0.035, 0.3]);
      const pro = [1, -1].map((s) => ellipsoid([s * 0.12, 0.0, 0.3], [0.08, 0.025, 0.06]));
      const f = (x, y, z) => { let d = m(x, y, z); for (const p of pro) d = smin(d, p(x, y, z), 0.05); return smax(d, -(y + 0.01), 0.02); };
      return meshSDF(f, [-0.25, -0.05, -0.3], [0.25, 0.05, 0.4], 0.012);
    })();
    const siphon = meshSDF(tube([[0, 0, 0], [0, 0.08, 0.12], [0, 0.18, 0.22], [0, 0.26, 0.26]], [0.035, 0.03, 0.027, 0.024]), [-0.05, -0.05, -0.05], [0.05, 0.3, 0.3], 0.006);
    const tentacle = segGeo(0.2, 0.012, 0.004, 1, { knob: 0 });
    return { foot, siphon, tentacle };
  });
}

export function hermitKit() {
  return cached('hermit', () => {
    const shield = (() => {
      const m = ellipsoid([0, 0, 0], [0.07, 0.04, 0.08]);
      const ros = cone([0, 0.01, 0.07], [0, 0.005, 0.1], 0.015, 0.004);
      return meshSDF((x, y, z) => smin(m(x, y, z), ros(x, y, z), 0.02), [-0.08, -0.05, -0.09], [0.08, 0.05, 0.11], 0.006);
    })();
    return {
      shield,
      merus: segGeo(0.13, 0.024, 0.021, 0.7),
      carpus: segGeo(0.07, 0.022, 0.02, 0.75),
      palmR: palmGeo(0.2, 0.11, 0.07),
      dactR: dactylGeo(0.2, 0.11),
      palmL: palmGeo(0.13, 0.06, 0.04),
      dactL: dactylGeo(0.13, 0.06),
      lMerus: segGeo(0.17, 0.02, 0.017, 0.7),
      lCarpus: segGeo(0.08, 0.017, 0.015, 0.7),
      lProp: segGeo(0.13, 0.015, 0.012, 0.7),
      lDact: segGeo(0.19, 0.012, 0.003, 0.7, { curve: 0.22, knob: 0 }),
      stalk: segGeo(0.09, 0.011, 0.01, 1, { knob: 0 }),
      cornea: new THREE.SphereGeometry(0.016, 14, 10),
      antenna: segGeo(0.5, 0.006, 0.0015, 1, { knob: 0, curve: 0.04 }),
    };
  });
}
