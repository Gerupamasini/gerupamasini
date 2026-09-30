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
  const key = `seg:${len}:${r1}:${r2}:${flat}:${opts.curve || 0}:${opts.knob ?? 1}:${q}:${opts.serrate || 0}:${opts.depress ? 1 : 0}`;
  return cached(key, () => {
    const curve = opts.curve || 0;
    const body = curve
      ? tube([[0, 0, 0], [len * 0.5, -curve * len * 0.25, 0], [len, -curve * len, 0]], [r1, (r1 + r2) * 0.5, r2])
      : cone([0, 0, 0], [len, 0, 0], r1, r2);
    const knob = sphere([r1 * 0.2, 0, 0], r1 * (opts.depress ? 0.82 : 1.02));
    const useKnob = opts.knob ?? 1;
    const ridge = cone([len * 0.1, r1 * 0.55, 0], [len * 0.85, r2 * 0.5 - curve * len * 0.4, 0], r1 * 0.35, r2 * 0.3);
    const serr = opts.serrate || 0;
    const dep = !!opts.depress;   // 背腹に扁平（歩脚の長節など：上から見て幅広い）
    const f = (x, y, z) => {
      const yy = dep ? y / flat : y, zz = dep ? z : z / flat;
      let d = body(x, yy, zz);
      if (useKnob) d = smin(d, knob(x, yy, zz), r1 * 0.4);
      // 背側の稜（側扁の節のみ）
      if (!dep) d = smin(d, ridge(x, yy, zz), r1 * 0.5);
      // 前縁・後縁（側扁なら背縁・腹縁）の鋸歯（小棘の列）
      if (serr) {
        const t = Math.min(1, Math.max(0, x / len));
        const tooth = Math.pow(Math.max(0, Math.sin(t * serr * Math.PI * 2)), 6) * (1 - t * 0.5);
        const edge = Math.max(0, Math.abs(dep ? z : y) / r1 - 0.45);
        d -= tooth * edge * r1 * 0.22 * (t > 0.05 && t < 0.97 ? 1 : 0);
      }
      return d * flat;
    };
    const rMax = Math.max(r1, r2) * 1.3;
    const cell = Math.min(Math.max(Math.max(r1, r2) * 0.3, len / 90), len / 14) * q;
    const ry = dep ? rMax * flat : rMax, rz = dep ? rMax : rMax * flat;
    return meshSDF(f, [-rMax, -ry - curve * len, -rz], [len + rMax, ry, rz], cell);
  });
}

// 板状の歩脚節（オサガニ類）：背腹に強く扁平で、上から見ると幅広い刃形。
// 関節側は細い頸（顆）になり、前縁・後縁は角ばって小鋸歯が並ぶ。
// w1/w2: 基部・先端の半幅, th: 半厚（幅に対する比）, opts.tip: 先端へ尖る（指節）, opts.spine: 前縁の亜末端棘
export function bladeGeo(len, w1, w2, th, opts = {}) {
  const q = opts.q || 1;
  const key = `blade:${len}:${w1}:${w2}:${th}:${opts.tip ? 1 : 0}:${opts.curve || 0}:${opts.serrate || 0}:${opts.spine || 0}:${opts.neck ?? 0.68}:${q}`;
  return cached(key, () => {
    const curve = opts.curve || 0, serr = opts.serrate || 0, neck = opts.neck ?? 0.68;
    const n = 2.6;
    const x0 = -len * 0.03, x1 = len * (opts.tip ? 1.0 : 1.01);
    const halfW = (t) => {
      if (opts.tip) {
        // 指節：基部から先端へ槍形に細る
        const b = neck + (1 - neck) * Math.min(1, Math.max(0, t / 0.1));
        return Math.max(1e-4, w1 * b * Math.pow(Math.max(0, 1 - t), 0.75) + w2 * (1 - t));
      }
      const b = t < 0.1 ? neck + (1 - neck) * Math.sin(Math.max(0, t + 0.03) / 0.13 * Math.PI * 0.5) : 1;
      const base = w1 + (w2 - w1) * Math.min(1, Math.max(0, (t - 0.1) / 0.85));
      // 背面から見ると中ほどがわずかに膨らむ
      // 遠位端も関節へ向けて丸くすぼまる（段々の円錐に見えないように）
      const e = t > 0.82 ? 1 - 0.28 * Math.pow((t - 0.82) / 0.18, 1.6) : 1;
      return base * b * e * (1 + 0.1 * Math.sin(Math.min(1, Math.max(0, t)) * Math.PI));
    };
    const f = (x, y, z) => {
      const t = x / len;
      const tc = Math.min(1, Math.max(0, t));
      const yc = y + curve * len * tc * tc;          // 先端ほど腹側へ反る
      const hw = halfW(tc);
      const thU = hw * th, thL = hw * th * 0.8;       // 背面は腹面よりふくらむ
      const ty = yc > 0 ? thU : thL;
      const r = Math.pow(Math.pow(Math.abs(z) / hw, n) + Math.pow(Math.abs(yc) / ty, n), 1 / n);
      let d = (r - 1) * Math.min(hw, ty);
      // 節の両端は丸く切る
      d = smax(d, Math.max(x0 - x, x - x1), ty * (x > len * 0.5 ? 0.3 : 0.7));
      // 背面中央のゆるい縦溝
      d += Math.exp(-Math.pow(z / (hw * 0.18), 2)) * ty * 0.06 * (yc > 0 ? 1 : 0) * Math.sin(tc * Math.PI);
      if (serr) {
        // 前縁・後縁の小鋸歯
        const tooth = Math.pow(Math.max(0, Math.sin(tc * serr * Math.PI * 2)), 5);
        const edge = Math.max(0, Math.abs(z) / hw - 0.75) * 4;
        d -= tooth * Math.min(1, edge) * hw * 0.03 * (tc > 0.12 && tc < 0.93 ? 1 : 0);
      }
      if (opts.spine) {
        // 長節前縁の先端近くにある鋭い棘
        const sx = len * 0.86, sz = w2 * 0.95;
        const dd = Math.hypot((x - sx) * 0.6, yc * 1.4, z - sz) - hw * 0.12 * Math.max(0, 1 - (z - sz) / (hw * 0.5));
        d = smin(d, dd, hw * 0.08);
      }
      return d;
    };
    const wMax = Math.max(w1, w2) * 1.15;
    // 低解像度（遠景用）でも厚み方向に 2 セル以上を確保して板が欠けないようにする
    const cell = Math.min(Math.max(wMax * th * 0.42, len / 110) * q, wMax * th * 0.75);
    return meshSDF(f, [x0 - cell, -wMax * th - curve * len, -wMax], [x1 + cell, wMax * th, wMax], cell);
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

// 剛毛の房：節の内側（-z）下面から密に生える短い毛
export function tuftGeo(len, r, count, hairLen, seed = 1) {
  return cached(`tuft:${len}:${r}:${count}:${hairLen}:${seed}`, () => {
    const rnd = mulberry32(seed);
    const pos = [];
    const dir = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), b = new THREE.Vector3(), tip = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const x = (0.1 + rnd() * 0.85) * len;
      const a = -Math.PI * (0.3 + rnd() * 0.6);        // 下面から内側にかけて
      b.set(x, Math.sin(a) * r * 0.85, -Math.abs(Math.cos(a)) * r * 0.85);
      dir.set((rnd() - 0.3) * 0.6, Math.sin(a) * 0.8 - 0.3, -0.7 - rnd() * 0.5).normalize();
      const L = hairLen * (0.5 + rnd() * 0.7);
      tip.copy(b).addScaledVector(dir, L);
      u.crossVectors(dir, up).normalize().multiplyScalar(r * 0.035);
      v.crossVectors(dir, u).normalize().multiplyScalar(r * 0.035);
      const p0 = b.clone().add(u), p1 = b.clone().sub(u).add(v), p2 = b.clone().sub(u).sub(v);
      for (const [A, B] of [[p0, p1], [p1, p2], [p2, p0]]) pos.push(A.x, A.y, A.z, B.x, B.y, B.z, tip.x, tip.y, tip.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  });
}

// 脚の剛毛：節の背縁と腹縁から外向き・先端向きに伸びる細い針（+x が節の長さ方向）
export function bristleGeo(len, r, count, hairLen, seed = 1, depress = false, r2 = r) {
  return cached(`bristle:${len}:${r}:${count}:${hairLen}:${seed}:${depress}:${r2}`, () => {
    const rnd = mulberry32(seed);
    const pos = [];
    const dir = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), b = new THREE.Vector3(), tip = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      const x = ((i + 0.5 + (rnd() - 0.5) * 0.8) / count) * len;
      if (depress) {
        // 前縁・後縁から水平に（やや下向きに）生える
        const rr = r + (r2 - r) * (x / len);
        b.set(x, (rnd() - 0.5) * rr * 0.15, side * rr * (r2 !== r ? 0.93 : 0.8));
        dir.set(0.45 + rnd() * 0.5, -0.25 + (rnd() - 0.5) * 0.5, side * (0.8 + rnd() * 0.4)).normalize();
      } else {
        b.set(x, side * r * 0.75, (rnd() - 0.5) * r * 0.5);
        dir.set(0.5 + rnd() * 0.5, side * (0.8 + rnd() * 0.4), (rnd() - 0.5) * 0.9).normalize();
      }
      const L = hairLen * (0.55 + rnd() * 0.7);
      tip.copy(b).addScaledVector(dir, L);
      u.crossVectors(dir, up).normalize().multiplyScalar(r * (r2 !== r ? 0.1 : 0.05));
      v.crossVectors(dir, u).normalize().multiplyScalar(r * (r2 !== r ? 0.1 : 0.05));
      const p0 = b.clone().add(u), p1 = b.clone().sub(u).add(v), p2 = b.clone().sub(u).sub(v);
      for (const [A, B] of [[p0, p1], [p1, p2], [p2, p0]]) pos.push(A.x, A.y, A.z, B.x, B.y, B.z, tip.x, tip.y, tip.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  });
}

// ヤマトオサガニの甲（Macrophthalmus japonicus）
// 甲幅:甲長 ≈ 1.6。側縁は後方へわずかに収斂し、前側縁に明瞭な歯2つと不明瞭な歯1つ。
// 額は狭く下向きに曲がり、先端は二葉で中央に溝。眼窩は前縁全体に長く伸び、眼柄がそこに収まる。
// 背面は胃域・心域・鰓域などの域が溝で区切られ、大きな顆粒に覆われる（中央の小域は平滑）。
function yamatoCarapace(w, h, l, q = 1) {
  return cached(`yama-car6:${w}:${h}:${l}:${q}`, () => {
    const fw = w * 0.12;
    // 基本形：平たい上面（側方・後方へ緩く下がる）と、角ばった側縁。側壁は下へ向かって内側に入る
    const topY = (x, z) => {
      const u = x / w, v = z / l;
      return h * (0.8 - 0.34 * u * u * u * u - 0.16 * v * v - 0.12 * Math.max(0, -v) ** 2);
    };
    // 上から見た輪郭：前側縁はほぼ平行、後ろ 4 割で後側縁が斜めに狭まり、後縁は甲幅の 2/3 ほど
    const halfW = (v) => {
      const a = w * 0.97 * (1 - 0.03 * (1 - v));
      if (v >= -0.2) return a;
      const a0 = w * 0.97 * (1 - 0.03 * 1.2);
      return a0 - (a0 - w * 0.66) * Math.min(1, (-0.2 - v) / 0.77);
    };
    const outline = (x, y, z) => {
      const k = THREE.MathUtils.clamp((h * 0.25 - y) / h, 0, 1);
      const v = z / l;
      const slope = v < -0.2 ? 0.86 : 1;
      const dx = (Math.abs(x) - halfW(v) * (1 - 0.14 * k)) * slope;
      const dz = Math.abs(z) - l * 0.97 * (1 - 0.06 * k);
      return smax(dx, dz, l * 0.22);
    };
    const base = (x, y, z) => smax(outline(x, y, z), (y - topY(x, z)) * 0.9, h * 0.13);
    const regions = [
      ellipsoid([w * 0.2, h * 0.6, l * 0.36], [w * 0.16, h * 0.34, l * 0.3]),     // 前胃域
      ellipsoid([-w * 0.2, h * 0.6, l * 0.36], [w * 0.16, h * 0.34, l * 0.3]),
      ellipsoid([0, h * 0.64, l * 0.1], [w * 0.14, h * 0.34, l * 0.32]),         // 中胃域
      ellipsoid([0, h * 0.55, -l * 0.4], [w * 0.17, h * 0.32, l * 0.26]),        // 心域
      ellipsoid([w * 0.58, h * 0.45, -l * 0.08], [w * 0.36, h * 0.4, l * 0.62]), // 鰓域
      ellipsoid([-w * 0.58, h * 0.45, -l * 0.08], [w * 0.36, h * 0.4, l * 0.62]),
      ellipsoid([w * 0.56, h * 0.35, l * 0.62], [w * 0.2, h * 0.3, l * 0.22]),   // 肝域
      ellipsoid([-w * 0.56, h * 0.35, l * 0.62], [w * 0.2, h * 0.3, l * 0.22]),
    ];
    // 域を区切る浅い溝（H 字形の胃心溝・鰓心溝・頸溝）。上から見た折れ線からの距離で背面を押し下げる
    const grooves = [
      [[-w * 0.17, -l * 0.12], [w * 0.17, -l * 0.12]],
      [[w * 0.18, l * 0.28], [w * 0.2, -l * 0.62]],
      [[-w * 0.18, l * 0.28], [-w * 0.2, -l * 0.62]],
      [[w * 0.22, -l * 0.18], [w * 0.5, -l * 0.66]],
      [[-w * 0.22, -l * 0.18], [-w * 0.5, -l * 0.66]],
      [[w * 0.32, l * 0.3], [w * 0.85, l * 0.18]],
      [[-w * 0.32, l * 0.3], [-w * 0.85, l * 0.18]],
    ];
    const gW = w * 0.05, gD = h * 0.028;
    const grooveAt = (x, z) => {
      let g = 0;
      for (const [[ax, az], [bx, bz]] of grooves) {
        const dx = bx - ax, dz = bz - az;
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        const ex = x - ax - dx * t, ez = z - az - dz * t;
        // 端はしだいに浅く消える
        const fade = Math.min(1, t * 5, (1 - t) * 5) * 0.6 + 0.4;
        g = Math.max(g, Math.exp(-(ex * ex + ez * ez) / (gW * gW)) * fade);
      }
      return g;
    };
    // 額：狭く下へ曲がり、先端は二葉
    const front = [
      ellipsoid([0, h * 0.25, l * 0.98], [fw, h * 0.32, l * 0.14]),
    ];
    const frontLobes = [1, -1].map((s) => ellipsoid([s * fw * 0.45, h * 0.02, l * 1.08], [fw * 0.5, h * 0.2, l * 0.07]));
    const frontFurrow = cone([0, h * 0.55, l * 0.85], [0, h * 0.1, l * 1.12], h * 0.05, h * 0.04);
    // 眼窩：前縁の全長にわたる溝
    const orbit = [1, -1].map((s) => cone([s * fw * 1.25, h * 0.36, l * 0.99], [s * w * 0.97, h * 0.3, l * 0.95], h * 0.27, h * 0.24));
    // 前側縁の歯：外眼窩角（第1歯）、第2歯、不明瞭な第3歯
    const teeth = [];
    for (const s of [1, -1]) {
      teeth.push(cone([s * w * 0.86, h * 0.18, l * 0.88], [s * w * 1.1, h * 0.3, l * 1.06], h * 0.24, h * 0.012));   // 外眼窩角の鋭い棘
      teeth.push(cone([s * w * 0.9, h * 0.1, l * 0.55], [s * w * 1.04, h * 0.14, l * 0.6], h * 0.24, h * 0.05));
      teeth.push(cone([s * w * 0.92, h * 0.05, l * 0.22], [s * w * 1.0, h * 0.07, l * 0.25], h * 0.18, h * 0.06));
    }
    // 口腔（第3顎脚が収まる）と、腹面の平らな胸板
    const buccal = roundBox([0, -h * 0.58, l * 0.72], [w * 0.2, h * 0.22, l * 0.3], h * 0.1);
    const f = (x, y, z) => {
      const xs = x;
      let d = base(xs, y, z);
      for (const r of regions) d = smin(d, smax(r(xs, y, z), outline(xs, y, z) + h * 0.04, h * 0.1), h * 0.4);
      for (const fr of front) d = smin(d, fr(x, y, z), h * 0.25);
      for (const lb of frontLobes) d = smin(d, lb(x, y, z), h * 0.12);
      d = smax(d, -(y + h * 0.6), h * 0.22);
      for (const o of orbit) d = smax(d, -o(x, y, z), h * 0.09);
      d = smax(d, -frontFurrow(x, y, z), h * 0.05);
      for (const t of teeth) d = smin(d, t(x, y, z), h * 0.12);
      if (y > h * 0.3) d += grooveAt(x, z) * gD * THREE.MathUtils.smoothstep(y, h * 0.3, h * 0.6);
      d = smax(d, -buccal(x, y, z), h * 0.06);
      // 側縁の細かな鋸歯
      const ax = Math.abs(xs);
      if (ax > w * 0.8 && z < l * 0.9 && z > -l * 0.7) {
        const serr = Math.pow(Math.max(0, Math.sin(z / l * 26)), 6) * Math.max(0, 1 - Math.abs(y - h * 0.05) / (h * 0.35));
        d -= serr * h * 0.06 * THREE.MathUtils.smoothstep(ax, w * 0.85, w * 0.97);
      }
      return d;
    };
    return meshSDF(f, [-w * 1.2, -h * 0.8, -l * 1.1], [w * 1.2, h * 1.3, l * 1.25], (w / 48) * q);
  });
}

// オサガニ類の鉗（前節＝掌部＋不動指、可動指）
// 掌は高さが長さの半分近くある卵形で側扁。不動指は短く三角形で下方へ強く屈曲し（deflexed）、
// 可動指は掌の上端の関節から鉤状に下へ湾曲して不動指の先に重なる。両指の内縁に小歯が並ぶ。
export function macroChelaDims(PL, PH) {
  const pl = PL * 0.6;                        // 掌部の長さ（細長い）
  const ang = -0.3;                           // 不動指はわずかに下へ向く
  const FL = PL * 0.42;                       // 不動指の長さ
  const base = [pl * 0.9, -PH * 0.22];        // 不動指の基部（掌の下縁の先）
  const tip = [base[0] + Math.cos(ang) * FL, base[1] + Math.sin(ang) * FL];
  const pivot = [pl * 0.95, PH * 0.26];       // 可動指の関節（掌の上縁の先）
  return { pl, ang, FL, base, tip, pivot };
}
function macroChelaGeo(PL, PH, T, q = 1) {
  return cached(`mchela12:${PL}:${PH}:${T}:${q}`, () => {
    const D = macroChelaDims(PL, PH);
    const { pl, ang, FL, base } = D;
    const palm0 = ellipsoid([pl * 0.5, 0, 0], [pl * 0.58, PH * 0.5, T * 0.5]);
    const palm = (x, y, z) => { const t = Math.min(1, Math.max(0, x / pl)); return palm0(x, y / (1 - 0.18 * t * t), z / (1 - 0.15 * t)) * (1 - 0.1 * t); };
    const neck = cone([-PH * 0.05, PH * 0.12, 0], [pl * 0.2, PH * 0.08, 0], PH * 0.13, PH * 0.2);
    // 不動指：基部は太く、先へ細る三角形。下縁は掌の下縁から連続して下へ曲がる
    const fx = (d) => base[0] + Math.cos(ang) * d, fy = (d) => base[1] + Math.sin(ang) * d;
    const pollex = tube([[pl * 0.62, -PH * 0.12, 0], [fx(0), fy(0), 0], [fx(FL * 0.5), fy(FL * 0.5), 0], [fx(FL), fy(FL), 0]],
      [PH * 0.32, PH * 0.24, PH * 0.15, PH * 0.035], PH * 0.06);
    const teeth = [];
    for (let i = 0; i < 8; i++) {
      const d = FL * (0.12 + i * 0.1);
      // 内縁（上側）に並ぶ小歯
      teeth.push(sphere([fx(d) - Math.sin(ang) * PH * (0.17 - i * 0.02), fy(d) + Math.cos(ang) * PH * (0.17 - i * 0.02), 0], PH * 0.026));
    }
    // 掌の上縁の顆粒列と外面の縦の隆起
    const tub = [];
    for (let i = 0; i < 9; i++) { const x = pl * (0.14 + i * 0.09); const u = (x - pl * 0.5) / (pl * 0.56); tub.push(sphere([x, PH * 0.5 * Math.sqrt(Math.max(0, 1 - u * u)) - PH * 0.07, T * 0.16], PH * 0.02)); }
    const ridge = cone([pl * 0.2, -PH * 0.12, T * 0.36], [pl * 0.8, -PH * 0.2, T * 0.3], PH * 0.02, PH * 0.018);
    // 可動指の関節窩（掌の上端先の縁がめくれた受け口）
    const socket = ellipsoid([D.pivot[0] - PH * 0.04, D.pivot[1] - PH * 0.04, 0], [PH * 0.1, PH * 0.08, T * 0.3]);
    const socketCut = sphere([D.pivot[0] + PH * 0.06, D.pivot[1], 0], PH * 0.1);
    // 不動指基部の大きな臼歯状の歯
    const molar = ellipsoid([fx(FL * 0.2) - Math.sin(ang) * PH * 0.2, fy(FL * 0.2) + Math.cos(ang) * PH * 0.2, 0], [PH * 0.12, PH * 0.07, T * 0.16]);
    // 下縁の稜（掌の下縁から不動指の外縁へ続く）
    const keel = tube([[pl * 0.1, -PH * 0.44, 0], [pl * 0.6, -PH * 0.46, 0], [fx(FL * 0.3), fy(FL * 0.3) - PH * 0.12, 0]], [PH * 0.05, PH * 0.05, PH * 0.03], PH * 0.05);
    const f = (x, y, z) => {
      let d = palm(x, y, z * 1.1) / 1.1;
      d = smin(d, neck(x, y, z), PH * 0.1);
      d = smin(d, pollex(x, y, z * 1.15) / 1.15, PH * 0.18);
      for (const t of teeth) d = smin(d, t(x, y, z * 1.3) / 1.3, PH * 0.02);
      for (const t of tub) d = smin(d, t(x, y, z), PH * 0.03);
      d = smin(d, ridge(x, y, z), PH * 0.06);
      d = smin(d, socket(x, y, z), PH * 0.06);
      d = smax(d, -socketCut(x, y, z), PH * 0.03);
      d = smin(d, molar(x, y, z), PH * 0.03);
      d = smin(d, keel(x, y, z * 1.6) / 1.6, PH * 0.08);
      return d;
    };
    return meshSDF(f, [-PH * 0.3, -PH * 0.65 - FL * 0.8, -T * 0.6], [PL * 1.05, PH * 0.6, T * 0.6], Math.max(PH, T) / 26 * q);
  });
}
// 可動指：関節から鉤状に湾曲し、先端は不動指の先に重なる。tip は関節から見た先端位置
function macroDactGeo(PL, PH, q = 1) {
  return cached(`mdact9:${PL}:${PH}:${q}`, () => {
    const D = macroChelaDims(PL, PH);
    const tx = D.tip[0] - D.pivot[0] + PH * 0.02, ty = D.tip[1] - D.pivot[1] + PH * 0.04;
    const L = Math.hypot(tx, ty);
    const ux = tx / L, uy = ty / L, nx = -uy, ny = ux;   // 弦の方向と、外側（上）への法線
    const bow = L * 0.12;
    const P = (t, b) => [ux * L * t + nx * b, uy * L * t + ny * b, 0];
    const pts = [P(0, 0), P(0.3, bow * 0.85), P(0.62, bow), P(0.88, bow * 0.55), P(1, 0)];
    const t = tube(pts, [PH * 0.12, PH * 0.11, PH * 0.085, PH * 0.05, PH * 0.018], PH * 0.05);
    const teeth = [];
    for (let i = 0; i < 7; i++) {
      const s = 0.2 + i * 0.1, b = bow * Math.sin(Math.PI * Math.min(1, s * 1.1)) * 0.9 - PH * 0.09;
      teeth.push(sphere(P(s, b), PH * 0.03));
    }
    const condyle = sphere([0, 0, 0], PH * 0.065);
    const bigTooth = roundBox(P(0.22, bow * 0.6 - PH * 0.13), [PH * 0.08, PH * 0.06, PH * 0.05], PH * 0.02);
    const f = (x, y, z) => {
      let d = t(x, y, z * 1.12) / 1.12;
      d = smin(d, condyle(x, y, z), PH * 0.03);
      d = smin(d, bigTooth(x, y, z), PH * 0.02);
      for (const k of teeth) d = smin(d, k(x, y, z * 1.3) / 1.3, PH * 0.02);
      return d;
    };
    const R = L + PH * 0.3;
    return meshSDF(f, [-PH * 0.3, -R, -PH * 0.25], [R, PH * 0.4, PH * 0.25], PH / 26 * q);
  });
}

// 第3顎脚：坐節（大きな板）と長節（上の板）、小さな触肢
function maxillipedGeo(s, q = 1) {
  return cached(`mxp3:${s}:${q}`, () => {
    // 坐節（下の大きな四角い板）と長節（上の板）。左右の板は正中で接して口を閉じる。外面はわずかに膨らむ
    const isch = roundBox([s * 0.02, -s * 0.16, 0], [s * 0.2, s * 0.2, s * 0.016], s * 0.1);
    const ischB = ellipsoid([s * 0.02, -s * 0.16, s * 0.005], [s * 0.2, s * 0.21, s * 0.04]);
    const mer = roundBox([s * 0.03, s * 0.2, 0], [s * 0.17, s * 0.13, s * 0.014], s * 0.09);
    const merB = ellipsoid([s * 0.03, s * 0.2, s * 0.004], [s * 0.17, s * 0.14, s * 0.036]);
    const suture = roundBox([0, s * 0.045, s * 0.03], [s * 0.3, s * 0.006, s * 0.02], 0.0);
    const palp = cone([s * 0.14, s * 0.3, s * 0.03], [-s * 0.08, s * 0.4, s * 0.035], s * 0.028, s * 0.016);
    const f = (x, y, z) => {
      const a = smin(isch(x, y, z), ischB(x, y, z), s * 0.02);
      const b = smin(mer(x, y, z), merB(x, y, z), s * 0.02);
      return smin(smax(smin(a, b, s * 0.03), -suture(x, y, z), s * 0.008), palp(x, y, z), s * 0.02);
    };
    return meshSDF(f, [-s * 0.26, -s * 0.42, -s * 0.06], [s * 0.3, s * 0.46, s * 0.08], s / 34 * q);
  });
}

// 腹部（腹面に折りたたまれた7節）。雄は細い三角形、雌は円く広い
function abdomenGeo(w, l, female, q = 1) {
  return cached(`abd:${w}:${l}:${female}:${q}`, () => {
    const widths = female ? [0.62, 0.7, 0.76, 0.8, 0.8, 0.74, 0.5] : [0.52, 0.46, 0.38, 0.32, 0.27, 0.23, 0.15];
    const segL = (l * (female ? 1.35 : 1.15)) / 7;
    const parts = widths.map((wd, i) => roundBox([0, 0, -i * segL - segL * 0.5], [w * wd * 0.5, 0.012, segL * 0.47], 0.01));
    const f = (x, y, z) => { let d = parts[0](x, y, z); for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), 0.004); return d; };
    return meshSDF(f, [-w * 0.45, -0.03, -segL * 7.2], [w * 0.45, 0.03, 0.02], Math.min(0.008, w / 40) * q);
  });
}

// 第3顎脚（口の蓋）
function mouthGeo(s, q = 1) {
  return cached(`mouth:${s}:${q}`, () => meshSDF(ellipsoid([0, 0, 0], [s * 0.3, s * 0.55, s * 0.08]), [-s * 0.4, -s * 0.7, -s * 0.2], [s * 0.4, s * 0.7, s * 0.2], s / 16 * q));
}

// ---------- カニ一式 ----------
// ---------- カニ一式 ----------
// 歩脚・鉗脚は実際の甲殻類と同じ 6 節：底節(coxa)・基坐節(basis-ischium)・長節(merus)・腕節(carpus)・前節(propodus)・指節(dactylus)
export const CRAB_SPECS = {
  kometsuki: {
    // コメツキガニ Scopimera globosa：甲幅 約1cm
    w: 0.2, h: 0.13, l: 0.18,
    carapace: kometsukiCarapace,
    legs: {
      cox: 0.028, bi: 0.03, merus: 0.18, carpus: 0.075, prop: 0.13, dact: 0.13,
      r: 0.02, merusR: 1.45, merusFlat: 0.42, flat: 0.55, k: [0.9, 1.0, 1.0, 0.86], spread: 0.44, curve: 0.2,
      hipX: 0.78, hipY: 0.32, hipZ: [0.42, 0.12, -0.18, -0.46],
      setae: [0.05, 0.05, 0.05, 0.05], serrate: 0,
    },
    claw: { cox: 0.02, bi: 0.022, merus: 0.07, carpus: 0.06, palm: 0.2, H: 0.13, T: 0.06, r: 0.022, chela: true, shX: 0.42, shY: 0.28, shZ: 0.8 },
    eye: { stalk: 0.085, r: 0.012, cornea: 0.017, cLen: 1.9, sep: 0.06, yaw: 0.2, up: 0.1, raise: 1.35 },
    mouth: 0.1, antenna: 0.05,
    Hb: 0.12, phiD: 0.95, stepTime: 0.11, stepH: 0.05, stepThresh: 0.07,
  },
  yamato: {
    // ヤマトオサガニ Macrophthalmus japonicus：甲幅 約2.8cm（甲幅:甲長 ≈ 1.6）
    // 生きた個体は歩脚の膝（長節と腕節の関節）を甲より高く上げ、指節の先を泥に立てる。
    // 歩脚は太く頑丈で焦げ茶色。剛毛は生体写真ではほとんど目立たない。
    w: 0.55, h: 0.17, l: 0.345,
    carapace: yamatoCarapace,
    // 歩脚は長く、長節は幅広い板状（標本写真の第3胸脚で長節長 ≈ 甲幅×0.55、幅 ≈ 長さ×0.27）。
    // 休息時は体を泥につけるほど低くし、脚を真横へ大きく広げる（野外写真で脚の開帳 ≈ 甲幅×2.7）。
    legs: {
      cox: 0.06, bi: 0.08, merus: 0.47, carpus: 0.17, prop: 0.24, dact: 0.21,
      r: 0.062, merusR: 1.45, merusFlat: 0.55, flat: 0.6, k: [0.86, 1.0, 0.98, 0.8], spread: 0.42, curve: 0.12,
      hipX: [0.8, 0.8, 0.75, 0.64], hipY: 0.5, hipZ: [0.5, 0.18, -0.16, -0.5], coxR: 1.2,
      setae: [0.018, 0.02, 0.022, 0.024], serrate: 11, reach: 0.66,
      blade: { bi: [0.055, 0.08], merus: [0.118, 0.104], carpus: [0.08, 0.072], prop: [0.068, 0.052], dact: [0.05, 0.004], th: 0.4, neck: 0.86 },
    },
    // 鉗は顔の前に垂らして構え、指先を泥につける。雄は大きく、雌は小さい。
    // 前節高 PH ≈ 前節長 PL × 0.27（美濃・伊谷 2024 の計測図）
    // 鉗脚の底節は甲の下、口の脇の腹面に付く（前側縁の角ではない）
    claw: { cox: 0.05, bi: 0.06, merus: 0.28, carpus: 0.15, PL: 0.72, PH: 0.21, T: 0.12, r: 0.05, macro: true, shX: 0.36, shY: 0.55, shZ: 0.5, tuft: 0.1 },
    clawF: { cox: 0.045, bi: 0.05, merus: 0.22, carpus: 0.12, PL: 0.38, PH: 0.14, T: 0.075, r: 0.04, macro: true, shX: 0.36, shY: 0.55, shZ: 0.55 },
    // 眼柄は細長く、額の脇から V 字に立ち上がる
    eye: { stalk: 0.27, r: 0.017, taper: 1.2, curve: 0.03, cornea: 0.025, cLen: 1.7, sep: 0.075, yaw: 0.12, up: 0.05, raise: 1.28 },
    mouth: 0.25, mouthTilt: 1.15, mouthPos: [0.19, -0.5, 0.76], antenna: 0.1,
    Hb: 0.19, phiD: 1.32, stepTime: 0.16, stepH: 0.08, stepThresh: 0.16,
  },
};

function clawGeos(C, q) {
  if (C.macro) {
    return {
      cCox: segGeo(C.cox, C.r * 1.2, C.r * 1.1, 0.85, { q }),
      cBi: segGeo(C.bi, C.r * 1.05, C.r, 0.8, { q, knob: 0 }),
      cMerus: segGeo(C.merus, C.r * 1.1, C.r, 0.62, { q, serrate: 7, knob: 0 }),
      cCarpus: segGeo(C.carpus, C.r * 0.8, C.r * 1.0, 0.8, { q }),
      palm: macroChelaGeo(C.PL, C.PH, C.T, q),
      cDact: macroDactGeo(C.PL, C.PH, q),
    };
  }
  return {
    cCox: segGeo(C.cox, C.r * 1.2, C.r * 1.1, 0.85, { q }),
    cBi: segGeo(C.bi, C.r * 1.05, C.r, 0.8, { q }),
    cMerus: segGeo(C.merus, C.r, C.r * 0.95, 0.75, { q }),
    cCarpus: segGeo(C.carpus, C.r * 1.05, C.r * 0.95, 0.8, { q }),
    palm: C.chela ? chelaGeo(C.palm, C.H, C.T, q) : palmGeo(C.palm, C.H, C.T, q),
    cDact: C.chela ? chelaDactGeo(C.palm, C.H, q) : dactylGeo(C.palm, C.H, q),
  };
}

export function crabKit(name, q = 1) {
  return cached(`crabkit3:${name}:${q}`, () => {
    const S = CRAB_SPECS[name];
    const L = S.legs, E = S.eye;
    const mr = L.r * (L.merusR || 1);
    return {
      carapace: S.carapace(S.w, S.h, S.l, q),
      coxa: segGeo(L.cox, L.r * (L.coxR || 1.55), L.r * (L.coxR || 1.55) * 0.9, 0.8, { q }),
      ...(L.blade ? {
        bi: bladeGeo(L.bi, ...L.blade.bi, L.blade.th * 1.2, { q, neck: 0.8 }),
        merus: bladeGeo(L.merus, ...L.blade.merus, L.blade.th, { q, serrate: L.serrate, spine: 1, neck: L.blade.neck }),
        carpus: bladeGeo(L.carpus, ...L.blade.carpus, L.blade.th * 1.05, { q, neck: L.blade.neck, serrate: 0 }),
        prop: bladeGeo(L.prop, ...L.blade.prop, L.blade.th * 1.05, { q, neck: L.blade.neck, serrate: 0 }),
        dact: bladeGeo(L.dact, ...L.blade.dact, L.blade.th * 1.1, { q, tip: 1, curve: L.curve, neck: 0.8 }),
      } : {
        bi: segGeo(L.bi, L.r * 1.35, mr * 0.95, 0.6, { q, depress: true }),
        merus: segGeo(L.merus, mr, mr * 0.8, L.merusFlat || L.flat, { q, serrate: L.serrate, depress: true }),
        carpus: segGeo(L.carpus, L.r * 1.05, L.r * 0.95, L.flat, { q, depress: true }),
        prop: segGeo(L.prop, L.r * 0.95, L.r * 0.7, L.flat, { q, depress: true }),
        dact: segGeo(L.dact, L.r * 0.65, L.r * 0.12, L.flat + 0.15, { curve: L.curve, knob: 0, q, depress: true }),
      }),
      claw: clawGeos(S.claw, q),
      clawF: S.clawF ? clawGeos(S.clawF, q) : null,
      // 鉗脚の長節・腕節の内面の密な剛毛の房（雄）
      tuftM: S.claw.tuft ? tuftGeo(S.claw.merus, S.claw.r, 140, S.claw.tuft, 21) : null,
      tuftC: S.claw.tuft ? tuftGeo(S.claw.carpus, S.claw.r, 80, S.claw.tuft * 0.8, 23) : null,
      stalk: segGeo(E.stalk, E.r * (E.taper || 1), E.r * 0.9, 1, { knob: 0, q, curve: E.curve || 0 }),
      cornea: new THREE.SphereGeometry(E.cornea, Math.round(20 / q), Math.round(14 / q)),
      maxilliped: maxillipedGeo(S.mouth, q),
      antenna: segGeo(S.antenna, S.antenna * 0.07, S.antenna * 0.02, 1, { knob: 0, q, curve: 0.1 }),
      abdM: abdomenGeo(S.w, S.l, false, q),
      abdF: abdomenGeo(S.w, S.l, true, q),
      hair: L.setae ? L.setae.map((sl, i) => (L.blade ? {
        M: bristleGeo(L.merus, L.blade.merus[0], 6, sl * 0.6, 3 + i, true, L.blade.merus[1]),
        C: bristleGeo(L.carpus, L.blade.carpus[0], 2, sl * 0.6, 5 + i, true, L.blade.carpus[1]),
        P: bristleGeo(L.prop, L.blade.prop[0], 4, sl * 0.8, 7 + i, true, L.blade.prop[1]),
        D: bristleGeo(L.dact * 0.7, L.blade.dact[0], 8, sl * 0.9, 9 + i, true, L.blade.dact[0] * 0.35),
      } : {
        M: bristleGeo(L.merus, mr, 12, sl * 0.6, 3 + i, true),
        C: bristleGeo(L.carpus, L.r * 1.05, 10, sl, 5 + i, true),
        P: bristleGeo(L.prop, L.r * 0.95, 20, sl * 1.15, 7 + i, true),
        D: bristleGeo(L.dact * 0.7, L.r * 0.6, 9, sl * 0.75, 9 + i, true),
      })) : null,
    };
  });
}

// 個体のリグを組み立てる。mats: { shell, leg, merus?, claw, arm?, mouth?, stalk?, setae?, cornea }
export function buildCrab(name, mats, male = true, q = 1) {
  const S = CRAB_SPECS[name], K = crabKit(name, q);
  const L = S.legs, E = S.eye;
  const C = (!male && S.clawF) ? S.clawF : S.claw;
  const CK = (!male && K.clawF) ? K.clawF : K.claw;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.position.y = S.Hb;
  body.add(new THREE.Mesh(K.carapace, mats.shell));

  // 歩脚（第2〜第5胸脚）
  const legs = [];
  const mesh = (g, m, parent, x = 0, sc = 1) => { const o = new THREE.Mesh(g, m); o.position.x = x; o.scale.setScalar(sc); parent.add(o); return o; };
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const k = L.k[i];
      const hip = new THREE.Group();
      hip.position.set(s * S.w * (Array.isArray(L.hipX) ? L.hipX[i] : L.hipX), -S.h * L.hipY, S.l * L.hipZ[i]);
      const spread = (i - 1.5) * L.spread;
      const baseYaw = s > 0 ? spread : Math.PI - spread;
      hip.rotation.y = baseYaw;
      mesh(K.coxa, mats.shell, hip);                      // 底節（体に付く）
      const F = new THREE.Group(); F.position.x = L.cox; hip.add(F);
      mesh(K.bi, mats.leg, F);                             // 基坐節
      mesh(K.merus, mats.merus || mats.leg, F, L.bi, k);   // 長節
      const Kn = new THREE.Group(); Kn.position.x = L.bi + L.merus * k; F.add(Kn);
      mesh(K.carpus, mats.leg, Kn, 0, k);                  // 腕節
      mesh(K.prop, mats.leg, Kn, L.carpus * k, k);         // 前節
      const D = new THREE.Group(); D.position.x = (L.carpus + L.prop) * k; Kn.add(D);
      mesh(K.dact, mats.legDact || mats.leg, D, 0, k);     // 指節
      if (K.hair && q === 1 && mats.setae) {
        const H = K.hair[i];
        for (const [g, parent, x] of [[H.M, F, L.bi], [H.C, Kn, 0], [H.P, Kn, L.carpus * k], [H.D, D, 0]]) {
          const m = mesh(g, mats.setae, parent, x, k); m.userData.noLOD = true; m.castShadow = false;
        }
      }
      body.add(hip);
      const a = L.bi + L.merus * k, b = (L.carpus + L.prop) * k;
      const dl = L.dact * k * Math.hypot(1, L.curve), dAng = Math.atan(L.curve);
      const reach = L.cox + (a + b) * (L.reach || 0.93) + dl * 0.45;
      const restLocal = new THREE.Vector3(
        hip.position.x + Math.cos(baseYaw) * reach, -S.Hb, hip.position.z - Math.sin(baseYaw) * reach);
      legs.push({ hip, F, K: Kn, D, a, b, dl, dAng, cox: L.cox, baseYaw, s, i, restLocal, group: (i + (s > 0 ? 0 : 1)) % 2, foot: new THREE.Vector3(), valid: false, stepping: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }
  }

  // 鉗脚（第1胸脚）
  const claws = [];
  for (const s of [1, -1]) {
    const big = C.macro ? 1 : (male ? 1 : 0.85);
    const sh = new THREE.Group();
    sh.position.set(s * S.w * C.shX, -S.h * C.shY, S.l * C.shZ);
    const g0 = new THREE.Group(); sh.add(g0);
    mesh(CK.cCox, mats.shell, g0);
    mesh(CK.cBi, mats.arm || mats.claw, g0, C.cox);
    mesh(CK.cMerus, mats.arm || mats.claw, g0, C.cox + C.bi, big);
    const g1 = new THREE.Group(); g1.position.x = C.cox + C.bi + C.merus * big; g0.add(g1);
    mesh(CK.cCarpus, mats.arm || mats.claw, g1, 0, big);
    if (male && K.tuftM && q === 1 && mats.setae) {
      for (const [g, parent, x] of [[K.tuftM, g0, C.cox + C.bi], [K.tuftC, g1, 0]]) {
        const m = mesh(g, mats.setae, parent, x, 1);
        if (s < 0) m.scale.z = -1;        // 左右とも体の内側へ
        m.userData.noLOD = true; m.castShadow = false;
      }
    }
    const g2 = new THREE.Group(); g2.position.x = C.carpus * big; g1.add(g2);
    mesh(CK.palm, mats.claw, g2, 0, big);
    const g3 = new THREE.Group();
    if (C.macro) { const D = macroChelaDims(C.PL, C.PH); g3.position.set(D.pivot[0], D.pivot[1], 0); }
    else g3.position.set(C.palm * (C.chela ? 0.5 : 0.56) * big, C.H * (C.chela ? 0.16 : 0.2) * big, 0);
    g2.add(g3);
    mesh(CK.cDact, mats.dact || mats.claw, g3, 0, big);
    body.add(sh);
    claws.push({ sh, g0, g1, g2, g3, s, big });
  }

  // 眼柄（眼窩に沿って横たわり、活動中は立てる）
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

  // 触角（第2触角）：額の下から短い鞭状部
  for (const s of [1, -1]) {
    const a = new THREE.Mesh(K.antenna, mats.stalk || mats.leg);
    a.position.set(s * S.w * 0.1, S.h * 0.02, S.l * 1.0);
    a.rotation.set(0, s > 0 ? -1.1 : Math.PI + 1.1, -0.35);
    body.add(a);
  }

  // 第3顎脚（口の蓋）：左右一対の板
  const mouth = [];
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    // 口枠に収まり、下端は胸板の方へ後傾する
    const mp = S.mouthPos || [0.22, -0.42, 0.93];
    g.position.set(s * S.mouth * mp[0], S.h * mp[1], S.l * mp[2]);
    g.userData.tilt = S.mouthTilt ?? -0.35;
    g.rotation.set(g.userData.tilt, s > 0 ? 0.12 : -0.12, 0);
    const m = new THREE.Mesh(K.maxilliped, mats.mouth || mats.shell);
    if (s < 0) m.scale.x = -1;
    g.add(m);
    body.add(g);
    mouth.push(g);
  }

  // 腹部（胸板の下に折りたたまれる）
  const abd = new THREE.Mesh(male ? K.abdM : K.abdF, mats.shell);
  abd.position.set(0, -S.h * 0.63, S.l * 0.25);
  body.add(abd);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; } });
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
