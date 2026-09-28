// 生き物の造形（SDF で作る有機的なパーツと、関節を持つリグ）
import * as THREE from 'three';
import { sphere, ellipsoid, cone, roundBox, tube, union, smin, smax, meshSDF } from './sdf.js';

const TAU = Math.PI * 2;
const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// ---------- 汎用パーツ ----------
// 脚の節：+x 方向に長さ len、断面は z 方向に平たい
export function segGeo(len, r1, r2, flat = 0.6, opts = {}) {
  const key = `seg:${len}:${r1}:${r2}:${flat}:${opts.curve || 0}:${opts.knob ?? 1}`;
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
    const cell = Math.min(Math.max(Math.min(r1, r2 * 1.5) * 0.2, len / 220), len / 24);
    return meshSDF(f, [-rMax, -rMax - curve * len, -rMax * flat], [len + rMax, rMax, rMax * flat], cell);
  });
}

// はさみの掌部＋不動指（+x 方向）
function palmGeo(P, H, T, opts = {}) {
  return cached(`palm:${P}:${H}:${T}:${opts.stout || 0}`, () => {
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
    return meshSDF(f, [-P * 0.1, -H * 0.6, -T * 0.6], [P * 1.08, H * 0.6, T * 0.6], Math.max(H, T) / 26);
  });
}

// 可動指（原点が関節、+x 方向）
function dactylGeo(P, H) {
  return cached(`dact:${P}:${H}`, () => {
    const t = tube([[0, 0, 0], [P * 0.22, H * 0.03, 0], [P * 0.46, -H * 0.14, 0]], [H * 0.17, H * 0.12, H * 0.03], H * 0.05);
    const teeth = [];
    for (let i = 0; i < 4; i++) teeth.push(sphere([P * (0.1 + i * 0.08), -H * 0.11, 0], H * 0.035));
    const f = (x, y, z) => { let d = t(x, y, z * 1.3) / 1.3; for (const s of teeth) d = smin(d, s(x, y, z), H * 0.03); return d; };
    return meshSDF(f, [-H * 0.2, -H * 0.3, -H * 0.2], [P * 0.5, H * 0.25, H * 0.2], H / 30);
  });
}

// ---------- カニの甲 ----------
function kometsukiCarapace(w, h, l) {
  return cached(`kome-car:${w}`, () => {
    const main = ellipsoid([0, 0, 0], [w, h, l]);
    const frontLobe = ellipsoid([0, -h * 0.05, l * 0.62], [w * 0.55, h * 0.6, l * 0.45]);
    const orbits = [1, -1].map((s) => ellipsoid([s * w * 0.52, h * 0.15, l * 0.92], [w * 0.2, h * 0.22, l * 0.26]));
    const grooveH = cone([-w * 0.25, h * 0.98, l * 0.02], [w * 0.25, h * 0.98, l * 0.02], h * 0.05, h * 0.05);
    const grooveL = [1, -1].map((s) => cone([s * w * 0.25, h * 0.96, l * 0.35], [s * w * 0.3, h * 0.94, -l * 0.35], h * 0.045, h * 0.045));
    const sternum = ellipsoid([0, -h * 0.55, -l * 0.05], [w * 0.8, h * 0.25, l * 0.8]);
    const f = (x, y, z) => {
      let d = smin(main(x, y, z), frontLobe(x, y, z), w * 0.25);
      d = smax(d, -(y + h * 0.62), h * 0.25);           // 腹面を平らに
      d = smin(d, sternum(x, y, z), h * 0.15);
      for (const o of orbits) d = smax(d, -o(x, y, z), w * 0.06);
      d = smax(d, -grooveH(x, y, z), h * 0.05);
      for (const g of grooveL) d = smax(d, -g(x, y, z), h * 0.05);
      return d;
    };
    return meshSDF(f, [-w * 1.05, -h * 1.0, -l * 1.1], [w * 1.05, h * 1.05, l * 1.2], w / 42);
  });
}

function yamatoCarapace(w, h, l) {
  return cached(`yama-car:${w}`, () => {
    const box = roundBox([0, 0, 0], [w, h, l], h * 0.9);
    const bumps = [
      ellipsoid([0, h * 0.55, l * 0.12], [w * 0.34, h * 0.95, l * 0.6]),
      ellipsoid([w * 0.52, h * 0.45, -l * 0.02], [w * 0.4, h * 0.85, l * 0.7]),
      ellipsoid([-w * 0.52, h * 0.45, -l * 0.02], [w * 0.4, h * 0.85, l * 0.7]),
      ellipsoid([0, h * 0.45, -l * 0.52], [w * 0.2, h * 0.75, l * 0.34]),
    ];
    const groove = cone([-w * 0.95, h * 0.55, l * 0.98], [w * 0.95, h * 0.55, l * 0.98], h * 0.55, h * 0.55);
    const notch = ellipsoid([0, h * 0.4, l * 1.05], [w * 0.06, h * 0.8, l * 0.12]);
    const teeth = [1, -1].map((s) => cone([s * w * 0.9, h * 0.1, l * 0.78], [s * w * 1.06, h * 0.2, l * 0.86], h * 0.5, h * 0.12));
    const teeth2 = [1, -1].map((s) => cone([s * w * 0.9, h * 0.0, l * 0.35], [s * w * 1.04, h * 0.1, l * 0.4], h * 0.45, h * 0.1));
    const cardiacG = [1, -1].map((s) => cone([s * w * 0.28, h * 1.05, l * 0.5], [s * w * 0.2, h * 1.0, -l * 0.6], h * 0.18, h * 0.15));
    const f = (x, y, z) => {
      // 後ろほど幅が狭い
      const xs = x / (1 + 0.1 * (z / l));
      let d = box(xs, y, z);
      for (const b of bumps) d = smin(d, b(xs, y, z), h * 0.9);
      d = smax(d, -(y + h * 0.75), h * 0.3);
      d = smax(d, -groove(x, y, z), h * 0.25);
      d = smax(d, -notch(x, y, z), h * 0.3);
      for (const t of teeth) d = smin(d, t(x, y, z), h * 0.3);
      for (const t of teeth2) d = smin(d, t(x, y, z), h * 0.3);
      for (const g of cardiacG) d = smax(d, -g(x, y, z), h * 0.15);
      return d;
    };
    return meshSDF(f, [-w * 1.2, -h * 1.2, -l * 1.15], [w * 1.2, h * 1.8, l * 1.2], w / 90);
  });
}

// 第3顎脚（口の蓋）
function mouthGeo(s) {
  return cached(`mouth:${s}`, () => meshSDF(roundBox([0, 0, 0], [s * 0.5, s * 0.6, s * 0.08], s * 0.07), [-s * 0.6, -s * 0.7, -s * 0.2], [s * 0.6, s * 0.7, s * 0.2], s / 20));
}

// ---------- カニ一式 ----------
export const CRAB_SPECS = {
  kometsuki: {
    w: 0.2, h: 0.13, l: 0.17,
    carapace: kometsukiCarapace,
    legs: { merus: 0.16, carpus: 0.065, prop: 0.1, dact: 0.12, r: 0.027, flat: 0.62, k: [0.92, 1.0, 1.0, 0.86], spread: 0.46, curve: 0.18 },
    claw: { merus: 0.1, carpus: 0.06, palm: 0.17, H: 0.07, T: 0.045, r: 0.022, big: 1 },
    eye: { stalk: 0.085, r: 0.012, cornea: 0.021, sep: 0.1, yaw: 0.35, up: 1.2, raise: 0 },
    mouth: 0.05,
    Hb: 0.13, phiD: 1.0, stepTime: 0.11, stepH: 0.05, stepThresh: 0.07,
  },
  yamato: {
    w: 0.66, h: 0.1, l: 0.36,
    carapace: yamatoCarapace,
    legs: { merus: 0.42, carpus: 0.14, prop: 0.24, dact: 0.22, r: 0.036, flat: 0.68, k: [0.9, 1.0, 1.0, 0.82], spread: 0.42, curve: 0.12 },
    claw: { merus: 0.3, carpus: 0.13, palm: 0.46, H: 0.15, T: 0.1, r: 0.05, big: 1.2 },
    eye: { stalk: 0.5, r: 0.017, cornea: 0.03, sep: 0.07, yaw: 0.1, up: 0.04, raise: 0.5 },
    mouth: 0.13,
    Hb: 0.22, phiD: 0.9, stepTime: 0.16, stepH: 0.08, stepThresh: 0.16,
  },
};

export function crabKit(name) {
  return cached(`crabkit:${name}`, () => {
    const S = CRAB_SPECS[name];
    const L = S.legs, C = S.claw, E = S.eye;
    return {
      carapace: S.carapace(S.w, S.h, S.l),
      merus: segGeo(L.merus, L.r, L.r * 0.85, L.flat),
      carpus: segGeo(L.carpus, L.r * 0.85, L.r * 0.8, L.flat),
      prop: segGeo(L.prop, L.r * 0.78, L.r * 0.6, L.flat),
      dact: segGeo(L.dact, L.r * 0.6, L.r * 0.12, L.flat, { curve: L.curve, knob: 0 }),
      cMerus: segGeo(C.merus, C.r, C.r * 0.95, 0.75),
      cCarpus: segGeo(C.carpus, C.r * 1.05, C.r * 0.95, 0.8),
      palm: palmGeo(C.palm, C.H, C.T),
      cDact: dactylGeo(C.palm, C.H),
      stalk: segGeo(E.stalk, E.r, E.r * 0.9, 1, { knob: 0 }),
      cornea: new THREE.SphereGeometry(E.cornea, 20, 14),
      mouth: mouthGeo(S.mouth),
    };
  });
}

// 個体のリグを組み立てる。mats: { shell, leg, claw, cornea }
export function buildCrab(name, mats, male = true) {
  const S = CRAB_SPECS[name], K = crabKit(name);
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
      const mer = new THREE.Mesh(K.merus, mats.leg); mer.scale.setScalar(k); F.add(mer);
      const Kn = new THREE.Group(); Kn.position.x = L.merus * k;
      const carp = new THREE.Mesh(K.carpus, mats.leg); carp.scale.setScalar(k); Kn.add(carp);
      const prop = new THREE.Mesh(K.prop, mats.leg); prop.scale.setScalar(k); prop.position.x = L.carpus * k; Kn.add(prop);
      const D = new THREE.Group(); D.position.x = (L.carpus + L.prop) * k;
      const dac = new THREE.Mesh(K.dact, mats.leg); dac.scale.setScalar(k); D.add(dac);
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
    const m1 = new THREE.Mesh(K.cMerus, mats.claw); m1.scale.setScalar(big); g0.add(m1);
    const g1 = new THREE.Group(); g1.position.x = C.merus * big; g0.add(g1);
    const m2 = new THREE.Mesh(K.cCarpus, mats.claw); m2.scale.setScalar(big); g1.add(m2);
    const g2 = new THREE.Group(); g2.position.x = C.carpus * big; g1.add(g2);
    const palm = new THREE.Mesh(K.palm, mats.claw); palm.scale.setScalar(big); g2.add(palm);
    const g3 = new THREE.Group(); g3.position.set(C.palm * 0.56 * big, C.H * 0.2 * big, 0); g2.add(g3);
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
    inner.add(new THREE.Mesh(K.stalk, mats.leg));
    const co = new THREE.Mesh(K.cornea, mats.cornea);
    co.position.x = E.stalk + E.cornea * 0.3;
    co.scale.set(1.25, 1, 1);
    inner.add(co);
    body.add(g);
    eyes.push({ g, inner, s });
  }

  // 口器
  const mouth = [];
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(K.mouth, mats.shell);
    m.position.set(s * S.mouth * 0.26, -S.h * 0.35, S.l * 0.93);
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
    const perTurn = o.perTurn || 72, rad = o.rad || 28;
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
  return cached('goby', () => {
    const parts = [
      ellipsoid([0, 0.004, 0.345], [0.066, 0.054, 0.15]),
      ellipsoid([0, -0.006, 0.23], [0.078, 0.064, 0.12]),
      ellipsoid([0, 0.004, 0.05], [0.066, 0.074, 0.25]),
      ellipsoid([0, 0.0, -0.19], [0.045, 0.058, 0.2]),
      ellipsoid([0, 0.0, -0.36], [0.02, 0.04, 0.11]),
    ];
    const mouth = ellipsoid([0, -0.024, 0.49], [0.052, 0.006, 0.05]);
    const lip = ellipsoid([0, -0.02, 0.47], [0.05, 0.02, 0.03]);
    const eyeB = [1, -1].map((s) => sphere([s * 0.03, 0.04, 0.385], 0.03));
    const gill = [1, -1].map((s) => cone([s * 0.078, 0.03, 0.2], [s * 0.078, -0.05, 0.215], 0.004, 0.004));
    const f = (x, y, z) => {
      let d = parts[0](x, y, z);
      for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), 0.05);
      d = smin(d, lip(x, y, z), 0.02);
      for (const e of eyeB) d = smin(d, e(x, y, z), 0.025);
      d = smax(d, -mouth(x, y, z), 0.008);
      for (const g of gill) d = smax(d, -g(x, y, z), 0.006);
      return d;
    };
    const body = meshSDF(f, [-0.1, -0.08, -0.5], [0.1, 0.1, 0.52], 0.0055);

    const fin = (base, tip, nu = 14, nv = 6) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const b = base(u), t = tip(u, b);
        for (let j = 0; j <= nv; j++) {
          const v = j / nv;
          pos.push(b[0] + (t[0] - b[0]) * v, b[1] + (t[1] - b[1]) * v, b[2] + (t[2] - b[2]) * v);
          uv.push(u, v);
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
    const fins = {
      d1: fin((u) => lerp3([0, 0.07, 0.15], [0, 0.074, 0.0], u), (u, b) => [0, b[1] + 0.075 * Math.sin(Math.PI * (0.12 + u * 0.8)) + 0.01, b[2] - 0.035]),
      d2: fin((u) => lerp3([0, 0.07, -0.03], [0, 0.044, -0.32], u), (u, b) => [0, b[1] + 0.058 * (1 - Math.pow(u, 4)) + 0.008, b[2] - 0.03 - 0.03 * u]),
      anal: fin((u) => lerp3([0, -0.055, -0.07], [0, -0.036, -0.31], u), (u, b) => [0, b[1] - 0.05 * (1 - Math.pow(u, 4)) - 0.006, b[2] - 0.03 - 0.03 * u]),
      caudal: fin((u) => lerp3([0, -0.034, -0.44], [0, 0.034, -0.44], u), (u, b) => [0, b[1] * 2.2, -0.44 - 0.17 * (1 - 1.6 * (u - 0.5) ** 2)], 16, 7),
      pelvic: fin((u) => lerp3([-0.034, -0.062, 0.18], [0.034, -0.062, 0.18], u), (u, b) => [b[0] * 1.3, b[1] - 0.018 - 0.01 * Math.sin(Math.PI * u), 0.18 - 0.11 * (1 - 1.8 * (u - 0.5) ** 2)], 10, 5),
    };
    for (const s of [1, -1]) {
      fins['pec' + s] = fin(
        (u) => lerp3([s * 0.07, -0.04, 0.2], [s * 0.066, 0.022, 0.205], u),
        (u, b) => {
          const a = -0.95 + u * 1.55;
          return [b[0] + s * 0.05, b[1] + Math.sin(a) * 0.1, b[2] - Math.cos(a) * 0.12];
        }, 14, 6);
    }
    const eye = new THREE.SphereGeometry(0.029, 24, 18);
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
      return meshSDF(f, [-0.12, -0.11, -0.05], [0.12, 0.11, 0.48], 0.006);
    })();
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const w = 0.13 - i * 0.008, hgt = 0.085 - i * 0.004;
      const main = ellipsoid([0, 0, -0.055], [w, hgt, 0.075]);
      const pleura = ellipsoid([0, -hgt * 0.45, -0.055], [w * 1.08, hgt * 0.6, 0.06]);
      const f = (x, y, z) => smin(main(x, y, z), pleura(x, y, z), 0.02);
      segs.push(meshSDF(f, [-w * 1.15, -hgt * 1.2, -0.14], [w * 1.15, hgt * 1.1, 0.03], 0.006));
    }
    const tail = (() => {
      const tel = roundBox([0, 0, -0.08], [0.04, 0.012, 0.075], 0.01);
      const uro = [1, -1].map((s) => ellipsoid([s * 0.07, -0.004, -0.085], [0.045, 0.01, 0.085]));
      const f = (x, y, z) => { let d = tel(x, y, z); for (const u of uro) d = smin(d, u(x, y, z), 0.015); return d; };
      return meshSDF(f, [-0.13, -0.03, -0.18], [0.13, 0.03, 0.01], 0.005);
    })();
    const bigPalm = (() => {
      const m = ellipsoid([0.12, 0, 0], [0.13, 0.075, 0.035]);
      const pol = tube([[0.2, -0.03, 0], [0.3, -0.02, 0], [0.36, 0.0, 0]], [0.028, 0.018, 0.005]);
      const f = (x, y, z) => smin(m(x, y, z), pol(x, y, z), 0.02);
      return meshSDF(f, [-0.02, -0.08, -0.04], [0.37, 0.08, 0.04], 0.005);
    })();
    const bigDact = meshSDF(tube([[0, 0, 0], [0.08, 0.005, 0], [0.16, -0.02, 0]], [0.024, 0.016, 0.004]), [-0.03, -0.03, -0.03], [0.17, 0.03, 0.03], 0.004);
    return {
      car, segs, tail, bigPalm, bigDact,
      arm: segGeo(0.12, 0.028, 0.026, 0.7),
      leg: segGeo(0.16, 0.012, 0.008, 0.7),
      legD: segGeo(0.1, 0.008, 0.003, 0.7, { curve: 0.2, knob: 0 }),
      antenna: segGeo(0.55, 0.006, 0.0015, 1, { knob: 0, curve: 0.05 }),
      eye: new THREE.SphereGeometry(0.014, 10, 8),
    };
  });
}

// ---------- 二枚貝 ----------
export function asariGeo() {
  return cached('asari', () => {
    const g = new THREE.SphereGeometry(1, 96, 64);
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
    return meshSDF(f, [-r * 1.6, -r * 0.2, -r * 1.6], [r * 2.1, len + r * 1.4, r * 1.6], r / 9);
  });
}

export function razorGeo() {
  return cached('razor', () => {
    const shell = roundBox([0, -1.9, 0], [0.15, 1.9, 0.085], 0.08);
    const f = (x, y, z) => shell(x + 0.02 * Math.sin(y * 0.5), y, z);
    return meshSDF(f, [-0.2, -3.9, -0.12], [0.2, 0.1, 0.12], 0.012);
  });
}

// ---------- アラムシロガイ・ヤドカリの軟体 ----------
export function nassaKit() {
  return cached('nassa', () => {
    const foot = (() => {
      const m = ellipsoid([0, 0.0, 0.05], [0.16, 0.035, 0.3]);
      const pro = [1, -1].map((s) => ellipsoid([s * 0.12, 0.0, 0.3], [0.08, 0.025, 0.06]));
      const f = (x, y, z) => { let d = m(x, y, z); for (const p of pro) d = smin(d, p(x, y, z), 0.05); return smax(d, -(y + 0.01), 0.02); };
      return meshSDF(f, [-0.25, -0.05, -0.3], [0.25, 0.05, 0.4], 0.008);
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
      return meshSDF((x, y, z) => smin(m(x, y, z), ros(x, y, z), 0.02), [-0.08, -0.05, -0.09], [0.08, 0.05, 0.11], 0.004);
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
