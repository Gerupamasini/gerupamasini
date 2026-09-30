// Procedural Ilyoplax pusilla (male) — units: 1 = 1 cm while building; the exported
// GLB root node is scaled by 0.01 so the file is in metres.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const { Vector3: V3, Color } = THREE;
const PI = Math.PI;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const smooth = (a, b, x) => sm((x - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;
const sq = (x) => x * x;
const gauss = (x, w) => Math.exp(-sq(x / w));
const angDiff = (a, b) => { let d = (a - b) % (2 * PI); if (d > PI) d -= 2 * PI; if (d < -PI) d += 2 * PI; return d; };
const D2R = PI / 180;

// ---------- deterministic noise ----------
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx), l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx), fy),
    l(l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx), l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
function fbm(x, y, z, o = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s / (1 - Math.pow(0.5, o));
}
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

const C = (hex) => new Color(hex);
const PAL = {
  shell: C('#7a755f'), shellDark: C('#2c2f33'), mud: C('#9a8d6c'), blue: C('#3a8fd0'), blueDeep: C('#1c5a98'), blueHi: C('#7fbde6'), navy: C('#16243a'),
  tympanum: C('#6a7382'), legDark: C('#3a4352'), legMid: C('#5d6c82'), legPale: C('#8a6f4c'), membrane: C('#343d4d'),
  claw: C('#f6efdc'), clawShade: C('#dccfae'), clawTip: C('#a98357'), clawDarkMerus: C('#1c222c'),
  sternum: C('#a9b8bf'), abd: C('#9a917a'), seta: C('#a79e84'),
};

// ---------- textures (tileable cuticle micro-detail) ----------
export function makeTextures() {
  const S = 1024, G = 32;
  const lat = new Float32Array(G * G * 4).map(() => Math.random());
  const pn = (x, y, cells, off) => { // periodic value noise
    x *= cells; y *= cells;
    const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
    const g = (i, j) => hash3(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, off);
    return mix(mix(g(ix, iy), g(ix + 1, iy), fx), mix(g(ix, iy + 1), g(ix + 1, iy + 1), fx), fy);
  };
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    let a = 0, amp = 0.5, c = 4;
    for (let o = 0; o < 6; o++) { a += amp * pn(u, v, c, o + 3); amp *= 0.55; c *= 2; }
    const pit = Math.pow(pn(u, v, 64, 21), 6) * 0.5; // fine pores/granules
    h[y * S + x] = a * 0.9 + pit * 0.3;
  }
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const cA = mk(), cN = mk(), cO = mk(); cO.dataset.jpg = '1'; cN.dataset.jpg = '1';
  const iA = cA.getContext('2d').createImageData(S, S), iN = cN.getContext('2d').createImageData(S, S), iO = cO.getContext('2d').createImageData(S, S);
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, hv = H(x, y);
    const g = clamp(0.76 + (hv - 0.4) * 1.3 + (hash3(x, y, 9) - 0.5) * 0.12);
    iA.data[i] = iA.data[i + 1] = iA.data[i + 2] = g * 255; iA.data[i + 3] = 255;
    const dx = (H(x + 1, y) - H(x - 1, y)) * 3.4, dy = (H(x, y + 1) - H(x, y - 1)) * 3.4;
    const l = Math.hypot(dx, dy, 1);
    iN.data[i] = (-dx / l * 0.5 + 0.5) * 255; iN.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; iN.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; iN.data[i + 3] = 255;
    iO.data[i] = 255; iO.data[i + 1] = clamp(0.8 + (0.5 - hv) * 0.5 + (hash3(x, y, 4) - 0.5) * 0.1) * 255; iO.data[i + 2] = 0; iO.data[i + 3] = 255;
  }
  cA.getContext('2d').putImageData(iA, 0, 0); cN.getContext('2d').putImageData(iN, 0, 0); cO.getContext('2d').putImageData(iO, 0, 0);
  const T = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb || cv.dataset.jpg) t.userData.mimeType = 'image/jpeg';
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  // silt albedo for dark cuticle: mid-grey base with pale dry-silt flecks and dark pits (vertex colours are boosted x1.55 to compensate)
  const cS = mk(), gS = cS.getContext('2d'), iS = gS.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const g = clamp(0.6 + (h[i] - 0.4) * 0.5) * 255; iS.data[i * 4] = g; iS.data[i * 4 + 1] = g * 0.98; iS.data[i * 4 + 2] = g * 0.95; iS.data[i * 4 + 3] = 255; }
  gS.putImageData(iS, 0, 0);
  let sd = 77; const rr = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
  for (let i = 0; i < 5200; i++) {
    const x = rr() * S, y = rr() * S, r = 0.7 + Math.pow(rr(), 3) * 3.4, pale = rr() < 0.72, a = 0.35 + rr() * 0.6;
    gS.fillStyle = pale ? `rgba(255,246,225,${a})` : `rgba(70,60,50,${a * 0.7})`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { gS.beginPath(); gS.ellipse(x + ox, y + oy, r * (0.8 + rr() * 0.8), r * (0.7 + rr() * 0.6), rr() * 3, 0, 2 * PI); gS.fill(); }
  }
  return { albedo: T(cA, true), silt: T(cS, true), normal: T(cN, false), orm: T(cO, false) };
}

export function makeMaterials(tx) {
  const base = { map: tx.albedo, normalMap: tx.normal, roughnessMap: tx.orm, metalnessMap: tx.orm, metalness: 0, vertexColors: true };
  return {
    carapace: Object.assign(new THREE.MeshStandardMaterial({ ...base, roughness: 0.62, normalScale: new THREE.Vector2(1.0, 1.0) }), { name: 'Carapace' }),
    leg: Object.assign(new THREE.MeshStandardMaterial({ ...base, map: tx.silt, roughness: 1.0, normalScale: new THREE.Vector2(0.8, 0.8) }), { name: 'LegCuticle' }),
    claw: Object.assign(new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.58, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color('#cfe3ee'), normalScale: new THREE.Vector2(0.5, 0.5) }), { name: 'ClawEnamel' }),
    cornea: Object.assign(new THREE.MeshPhysicalMaterial({ color: 0x3a4048, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }), { name: 'Cornea' }),
    mud: Object.assign(new THREE.MeshStandardMaterial({ ...base, roughness: 1, normalScale: new THREE.Vector2(1.4, 1.4) }), { name: 'MudGrain' }),
  };
}

// ---------- geometry helpers ----------
function finishGeo(pos, uv, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lofted swept tube along +X with superellipse section, per-station width/height/offset.
 *  Section angle a: 0 => +Z, PI/2 => +Y. */
function makeTube(o) {
  const { L, ext = 0.04, nT = 44, nR = 24, prof, cap0 = 0.05, cap1 = 0.05, neck0 = 0.62, neck1 = 0.62,
    colorFn, ridge = 0, ridgeB = 0, ridgeW = 0.4, n: defN = 2.2, uvScale = o.uvScale ?? 0.6 } = o;
  const xs = [-ext];
  for (let i = 0; i <= nT; i++) xs.push(L * (0.5 - 0.5 * Math.cos(PI * i / nT)));
  const dt = 0.01;
  const scaleAt = (x) => {
    if (x <= 0) return neck0;
    if (x < cap0) return neck0 + (1 - neck0) * sm(x / cap0);
    if (x >= L) return neck1;
    if (x > L - cap1) return neck1 + (1 - neck1) * sm((L - x) / cap1);
    return 1;
  };
  const P = (x, a, out = new V3()) => {
    const t = clamp(x / L), p = prof(t), e = scaleAt(x), n = p.n || defN;
    const ca = Math.cos(a), sa = Math.sin(a);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n), sz = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n);
    let rr = 1;
    if (ridge) rr += ridge * gauss(angDiff(a, PI / 2), ridgeW);
    if (ridgeB) rr += ridgeB * gauss(angDiff(a, 3 * PI / 2), ridgeW);
    if (o.ridges) for (const q of o.ridges) rr += q.k * gauss(angDiff(a, q.a), q.w || 0.25);
    const bf = o.bulge ? o.bulge(t, a) : 1;
    const ly = p.h * e * sy * rr * bf, lz = p.w * e * sz * bf;
    const pa = prof(clamp(t - dt)), pb = prof(clamp(t + dt));
    const span = Math.max(1e-6, (clamp(t + dt) - clamp(t - dt)) * L);
    const ts = Math.atan(((pb.oy || 0) - (pa.oy || 0)) / span), ps = Math.atan(((pb.oz || 0) - (pa.oz || 0)) / span);
    let x1 = -ly * Math.sin(ts), y1 = ly * Math.cos(ts);
    const x2 = x1 * Math.cos(ps) + lz * Math.sin(ps), z2 = -x1 * Math.sin(ps) + lz * Math.cos(ps);
    return out.set(x + x2, (p.oy || 0) + y1, (p.oz || 0) + z2);
  };
  const pos = [], uv = [], col = [], idx = [];
  const perim = 2 * PI * (prof(0.5).w + prof(0.5).h) * 0.5;
  const rings = xs.length;
  const tmp = new V3(), cc = new Color();
  for (let i = 0; i < rings; i++) {
    const x = xs[i], t = clamp(x / L);
    for (let j = 0; j <= nR; j++) {
      const a = 2 * PI * j / nR;
      P(x, a, tmp); pos.push(tmp.x, tmp.y, tmp.z);
      uv.push(x / uvScale, j / nR * perim / uvScale);
      if (colorFn) colorFn(t, a, tmp, cc); else cc.set(0x808080);
      const mem = 1 - smooth(0, cap0 * 0.9, Math.max(0, x)) * (x > 0 ? 1 : 0);
      const memD = 1 - smooth(0, cap1 * 0.9, Math.max(0, L - x));
      const mf = x <= 0 ? 1 : clamp(mem + memD);
      if (mf > 0) cc.lerp(PAL.membrane, mf * 0.85);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  const W = nR + 1;
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < nR; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // end caps
  for (const [ri, dir] of [[0, -1], [rings - 1, 1]]) {
    const x = xs[ri], base = pos.length / 3;
    P(x, 0, tmp); const cen = new V3(x, prof(clamp(x / L)).oy || 0, prof(clamp(x / L)).oz || 0);
    pos.push(cen.x, cen.y, cen.z); uv.push(0, 0); col.push(PAL.membrane.r, PAL.membrane.g, PAL.membrane.b);
    for (let j = 0; j <= nR; j++) {
      const k = ri * W + j; pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); uv.push(0.1, 0.1); col.push(PAL.membrane.r, PAL.membrane.g, PAL.membrane.b);
    }
    for (let j = 0; j < nR; j++) {
      if (dir < 0) idx.push(base, base + 1 + j + 1, base + 1 + j); else idx.push(base, base + 1 + j, base + 1 + j + 1);
    }
  }
  // orientation check on a mid ring vertex
  let geo = finishGeo(pos, uv, col, idx);
  const nrm = geo.attributes.normal, mid = Math.floor(rings / 2) * W + 3;
  const pm = new V3().fromBufferAttribute(geo.attributes.position, mid), nm = new V3().fromBufferAttribute(nrm, mid);
  const cen = new V3(pm.x, prof(clamp(pm.x / L)).oy || 0, prof(clamp(pm.x / L)).oz || 0);
  if (nm.dot(pm.sub(cen)) < 0) { const ix = geo.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } geo.computeVertexNormals(); }
  // fix seam normals
  const N = geo.attributes.normal;
  for (let i = 0; i < rings; i++) {
    const a = i * W, b = i * W + nR;
    const v = new V3().fromBufferAttribute(N, a).add(new V3().fromBufferAttribute(N, b)).normalize();
    N.setXYZ(a, v.x, v.y, v.z); N.setXYZ(b, v.x, v.y, v.z);
  }
  const sample = (x, a) => {
    const p0 = P(x, a), px = P(x + 0.01, a).sub(p0), pa = P(x, a + 0.05).sub(p0);
    const n = new V3().crossVectors(px, pa).normalize();
    const t = clamp(x / L), cen2 = new V3(x, prof(t).oy || 0, prof(t).oz || 0);
    if (n.dot(p0.clone().sub(cen2)) < 0) n.negate();
    return { p: p0, n };
  };
  return { geo, sample, P };
}

/** Thin bent cone (spine / seta). */
function makeSpike(base, dir, len, r, bend, color, sides = 5, rings = 4) {
  const pos = [], uv = [], col = [], idx = [];
  const d = dir.clone().normalize();
  let u = new V3().crossVectors(d, Math.abs(d.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize();
  const w = new V3().crossVectors(d, u).normalize();
  for (let k = 0; k <= rings; k++) {
    const t = k / rings, rad = r * Math.pow(1 - t, 0.85) + 1e-4;
    const cen = base.clone().addScaledVector(d, len * t).addScaledVector(bend, t * t * len);
    for (let j = 0; j <= sides; j++) {
      const a = 2 * PI * j / sides;
      pos.push(cen.x + (u.x * Math.cos(a) + w.x * Math.sin(a)) * rad, cen.y + (u.y * Math.cos(a) + w.y * Math.sin(a)) * rad, cen.z + (u.z * Math.cos(a) + w.z * Math.sin(a)) * rad);
      uv.push(t * 0.3, j / sides * 0.3);
      const c = color.clone().lerp(PAL.seta, t * 0.25); col.push(c.r, c.g, c.b);
    }
  }
  const W = sides + 1;
  for (let k = 0; k < rings; k++) for (let j = 0; j < sides; j++) { const a = k * W + j; idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W); }
  return finishGeo(pos, uv, col, idx);
}

function makeBall(c, r, color = PAL.membrane, k = new V3(1, 1, 1)) {
  const g = new THREE.SphereGeometry(1, 18, 12);
  const P = g.attributes.position, col = [];
  for (let i = 0; i < P.count; i++) { P.setXYZ(i, c.x + P.getX(i) * r * k.x, c.y + P.getY(i) * r * k.y, c.z + P.getZ(i) * r * k.z); col.push(color.r, color.g, color.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function endBall(T, L, prof, neck = 0.62, color = PAL.membrane) {
  const p = prof(1), r = (p.w + p.h) * 0.5 * neck * 0.98;
  return makeBall(new V3(L, p.oy || 0, p.oz || 0), r, color);
}

function makeBlob(center, radius, squash, color, detail = 1) {
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeGeometriesSafe(g);
  const p = g.attributes.position, col = [], uv = [];
  for (let i = 0; i < p.count; i++) {
    const v = new V3().fromBufferAttribute(p, i).normalize();
    const k = 0.75 + 0.5 * vnoise(v.x * 2.3 + center.x * 40, v.y * 2.3, v.z * 2.3 + center.z * 40);
    p.setXYZ(i, center.x + v.x * radius * k * squash.x, center.y + v.y * radius * k * squash.y, center.z + v.z * radius * k * squash.z);
    const cv = color.clone().multiplyScalar(0.8 + 0.4 * rnd()); col.push(cv.r, cv.g, cv.b); uv.push(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function mergeGeometriesSafe(g) { // make indexed by welding positions
  const p = g.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!map.has(k)) { map.set(k, pos.length / 3); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(map.get(k));
  }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setIndex(idx); return o;
}
const merge = (gs) => mergeGeometries(gs.filter(Boolean), false);

// ---------- carapace ----------
const CP = { a0: 0.5, b: 0.4, n: 3.6, Ht: 0.23, Hb: 0.12, ta: 0.55, tb: 0.75 };
const aAt = (z) => CP.a0 * (0.6 + 0.4 * (z / CP.b + 1) / 2);   // lateral borders converge markedly backwards (Ilyoplax pusilla: pentagonal carapace)
function rhoOf(x, z) { return Math.pow(Math.pow(Math.abs(x / aAt(z)), CP.n) + Math.pow(Math.abs(z / CP.b), CP.n), 1 / CP.n); }
export const topY = (x, z) => CP.Ht * Math.pow(Math.cos(Math.asin(clamp(rhoOf(x, z), 0, 0.9999))), CP.ta);
export const botY = (x, z) => -CP.Hb * Math.pow(Math.cos(Math.asin(clamp(rhoOf(x, z), 0, 0.9999))), CP.tb);
function frontZ(x, r) { let lo = 0, hi = CP.b * 1.05; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (rhoOf(x, m) < r) lo = m; else hi = m; } return lo; }
// orbital groove: runs along the front margin (rho = 0.93 contour) from the eye socket to the exorbital corner
const ORB = { x0: 0.1, x1: 0.46, rho: 0.86, sink: 0.012 };
const orbZ = (x) => frontZ(x, ORB.rho);
const EYE_X = ORB.x0, EYE_Z = orbZ(ORB.x0);

function dseg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
/** dorsal relief: sulci + regions (cm) */
function dorsalRelief(x, z) {
  const ax = Math.abs(x);
  let d = 0, g = 0;
  const groove = (dist, w, depth) => { const v = depth * gauss(dist, w); g += v; d -= v; };
  // cervical (transverse) groove, bowed
  groove(z - (0.07 - 0.2 * ax * ax), 0.014, 0.017 * smooth(0.42, 0.3, ax));
  // gastric boundaries + cardiac
  groove(ax - 0.135, 0.012, 0.012 * smooth(0.02, 0.09, z) * smooth(0.34, 0.26, z));
  groove(ax - 0.095, 0.011, 0.011 * smooth(0.07, 0.0, z) * smooth(-0.3, -0.2, z));
  // branchial oblique sulcus
  groove(dseg(ax, z, 0.41, 0.06, 0.2, -0.28), 0.012, 0.011);
  // frontal border and posterior border
  groove(z - 0.315, 0.012, 0.012 * smooth(0.23, 0.14, ax));
  groove(z + 0.305, 0.012, 0.014 * smooth(0.42, 0.3, ax));
  // regional inflation
  d += 0.02 * gauss(ax, 0.16) * gauss(z - 0.15, 0.14);            // gastric
  d += 0.016 * gauss(ax, 0.1) * gauss(z + 0.13, 0.13);            // cardiac
  d += 0.014 * gauss(ax - 0.29, 0.1) * gauss(z + 0.02, 0.2);      // branchial
  // orbital groove (eyestalk stowage) + raised lip, socket ring at the inner end
  const inO = smooth(ORB.x0 - 0.03, ORB.x0 + 0.02, ax) * smooth(ORB.x1 + 0.06, ORB.x1, ax);
  if (inO > 0 && z > 0) {
    const dz = (z - orbZ(Math.min(ax, 0.49)) + 0.012) * 0.9;
    const gv = 0.07 * gauss(dz, 0.05) * inO; g += gv * 0.9; d -= gv;
    d += 0.006 * gauss(Math.abs(dz) - 0.085, 0.022) * inO;
  }
  const eo = Math.hypot(ax - EYE_X, z - EYE_Z);
  d += 0.012 * gauss(eo - 0.05, 0.014) - 0.03 * gauss(eo, 0.03);
  return { d, g };
}
const LEG_Z = [0.17, 0.03, -0.11, -0.24];
const legRootX = (z) => aAt(z) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(z / CP.b), CP.n)), 1 / CP.n) * 0.9;
function ventralRelief(x, z) {
  const ax = Math.abs(x);
  let d = 0;
  // raised sternite plates between sutures (4-8)
  d += 0.008 * Math.sin(PI * ((z + 0.34) / 0.09 % 1)) * smooth(0.3, 0.2, ax) * smooth(0.02, 0.1, ax) * smooth(-0.36, -0.3, z) * smooth(0.22, 0.16, z);
  // coxal sockets (rim + pit) for the walking legs and chelipeds
  for (const [sx, sz, r] of [...LEG_Z.map((zz) => [legRootX(zz), zz, 0.075]), [0.27, 0.24, 0.085]]) {
    const dd = Math.hypot(ax - sx, z - sz);
    d += 0.016 * gauss(dd - r, 0.018) - 0.024 * gauss(dd, r * 0.6);
  }
  for (const zs of [-0.29, -0.2, -0.11, -0.02, 0.09, 0.19]) d -= 0.02 * gauss(z - zs + 0.05 * ax, 0.011) * smooth(0.27, 0.2, ax) * smooth(0.0, 0.1, ax);   // sternite sutures (4-8)
  d -= 0.012 * gauss(ax, 0.008) * smooth(0.3, 0.15, z) * smooth(-0.36, -0.3, z);                                                                    // median sternal groove
  d -= 0.012 * gauss(ax - 0.235, 0.014) * smooth(0.32, 0.2, z) * smooth(-0.34, -0.2, z);   // sternal edge
  d -= 0.03 * smooth(0.115, 0.07, ax) * smooth(0.03, -0.02, z) * smooth(-0.36, -0.3, z);   // abdominal channel
  d -= 0.014 * gauss(ax - 0.05, 0.03) * gauss(z - 0.2, 0.06);                               // mouth field
  return d;
}

function buildCarapace() {
  const NT = 384, NP = 168;
  // boundary table so ring vertices are evenly spaced along the perimeter (superellipse angle sampling clusters them)
  const TB = 4096, tabX = new Float32Array(TB + 1), tabZ = new Float32Array(TB + 1), cum = new Float32Array(TB + 1);
  for (let i = 0; i <= TB; i++) { const th = 2 * PI * i / TB, c = Math.cos(th), sn = Math.sin(th); tabX[i] = Math.sign(c) * Math.pow(Math.abs(c), 2 / CP.n); tabZ[i] = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / CP.n); if (i) cum[i] = cum[i - 1] + Math.hypot((tabX[i] - tabX[i - 1]) * CP.a0, (tabZ[i] - tabZ[i - 1]) * CP.b); }
  const perim = cum[TB];
  const bAt = (u) => { const target = u * perim; let lo = 0, hi = TB; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < target) lo = m; else hi = m; } const f = (target - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]); return [mix(tabX[lo], tabX[hi], f), mix(tabZ[lo], tabZ[hi], f)]; };
  const pos = [], idx = [];
  const NTh = NT;
  const rings = NP + 1;
  for (let i = 0; i < rings; i++) {
    const phi = PI * i / NP, rho = Math.sin(phi), cph = Math.cos(phi);
    const yv = cph >= 0 ? CP.Ht * Math.pow(cph, CP.ta) : -CP.Hb * Math.pow(-cph, CP.tb);
    for (let j = 0; j < NTh; j++) {
      const th = 2 * PI * j / NTh, c = Math.cos(th), s = Math.sin(th);
      let [bx, bz] = bAt(j / NTh); const th2 = Math.atan2(bz, bx);
      // anterolateral tooth
      const ang = Math.atan2(Math.abs(bz), Math.abs(bx));
      const tooth = 1 + (0.04 * gauss(angDiff(ang, 0.8), 0.08) - 0.05 * gauss(angDiff(ang, 0.66), 0.045)) * (bz > 0 ? 1 : 0);   // exorbital angle + notch behind it
      const lobe = 1 + 0.045 * gauss(angDiff(th2, PI / 2), 0.32) * (bz > 0 ? 1 : 0);
      const z = rho * bz * CP.b * tooth * lobe;
      const x = rho * bx * aAt(z) * tooth;
      pos.push(x, yv, z);
    }
  }
  // texture coords: top half unfolded along the profile (no rim stretching), underside planar
  const uv = new Array(rings * NTh * 2).fill(0);
  for (let j = 0; j < NTh; j++) {
    const seg = (i) => { const k = i * NTh + j, q = k - NTh; return Math.hypot(pos[k * 3] - pos[q * 3], pos[k * 3 + 1] - pos[q * 3 + 1], pos[k * 3 + 2] - pos[q * 3 + 2]); };
    let sacc = 0;
    for (let i = 0; i < rings; i++) {           // top: arclength from the dorsal pole
      if (i > 0) sacc += seg(i);
      if (i > rings / 2) break;
      const k = i * NTh + j, x = pos[k * 3], z = pos[k * 3 + 2], h = Math.hypot(x, z);
      const f = h < 1e-3 ? 1 : sacc / h;
      uv[k * 2] = x * f / 0.55 + 3.1; uv[k * 2 + 1] = z * f / 0.55 + 1.7;
    }
    sacc = 0;
    for (let i = rings - 1; i > rings / 2; i--) { // underside: arclength from the ventral pole
      if (i < rings - 1) sacc += seg(i + 1);
      const k = i * NTh + j, x = pos[k * 3], z = pos[k * 3 + 2], h = Math.hypot(x, z);
      const f = h < 1e-3 ? 1 : sacc / h;
      uv[k * 2] = x * f / 0.55 + 7.3; uv[k * 2 + 1] = z * f / 0.55 + 4.9;
    }
  }
  const W = NTh;
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < NTh; j++) {
    let a = i * W + j, b = i * W + (j + 1) % NTh, c = a + W, d = b + W;
    if (i === 0) { a = b = 0; idx.push(b, d, c); continue; }                          // single dorsal pole vertex: no degenerate triangles
    if (i === rings - 2) { c = d = (rings - 1) * W; idx.push(a, b, c); continue; }   // single ventral pole vertex
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const fixPoles = () => {
    const n = g.attributes.normal;
    for (let j = 0; j < NTh; j++) { n.setXYZ(j, 0, 1, 0); n.setXYZ((rings - 1) * W + j, 0, -1, 0); }
  };
  g.computeVertexNormals(); fixPoles();
  // displacement along normals
  const P = g.attributes.position, N = g.attributes.normal, colArr = new Float32Array(P.count * 3);
  const grooveAt = new Float32Array(P.count);
  const v = new V3(), nn = new V3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i); nn.fromBufferAttribute(N, i);
    let d;
    if (v.y >= -0.005) {
      const r = dorsalRelief(v.x, v.z); d = r.d; grooveAt[i] = r.g;
      // granulation, stronger in mid-carapace, fading toward the rim
      const rim = smooth(0.35, 0.02, v.y);
      const pf = smooth(0.03, 0.2, Math.hypot(v.x, v.z));   // near the polar mesh the quads are thin slivers: fade features finer than the ring spacing
      d += (fbm(v.x * 34, v.y * 34, v.z * 34, 3) - 0.5) * 0.004 * (1 - 0.5 * rim) * pf;
      d -= 0.002 * smooth(0.74, 0.88, fbm(v.x * 60 + 7, v.y * 60, v.z * 60, 2)) * pf;   // mud-filled pits
      d += (fbm(v.x * 11 + 4, v.y * 11, v.z * 11, 3) - 0.5) * 0.006;
      d -= 0.012 * gauss(v.y - 0.03, 0.02) * smooth(0.34, 0.2, v.z);   // thoraco-branchial sulcus along the flank
    } else {
      const vr = ventralRelief(v.x, v.z); grooveAt[i] = Math.max(0, -vr) * 0.8;
      d = vr + (fbm(v.x * 30, v.y * 30, v.z * 30, 3) - 0.5) * 0.008;
    }
    v.addScaledVector(nn, d); P.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); fixPoles();
  // colours
  const cc = new Color();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const ax = Math.abs(v.x);
    const m1 = fbm(v.x * 5 + 2, v.y * 5, v.z * 5, 4), m2 = fbm(v.x * 15, v.y * 15 + 3, v.z * 15, 3), m3 = fbm(v.x * 38, v.y * 38, v.z * 38 + 7, 2);
    // photographs (male, clean specimens): dorsal shield and flanks cerulean-blue with navy sutures; the rear third of the dorsum
    // and the rim carry grey-olive silt. Blue shifts teal on the flanks and pale steel-blue on the frontal region.
    const bd = fbm(v.x * 9 + 9, v.y * 9, v.z * 9, 4);
    const front = smooth(-0.22, 0.12, v.z);                                        // 0 at the rear, 1 in front
    const flank = smooth(0.02, 0.2, ax) * smooth(0.05, -0.08, v.y);
    cc.copy(PAL.blue).lerp(PAL.blueDeep, smooth(0.4, 0.85, m1) * 0.22).lerp(PAL.blueHi, smooth(0.6, 0.9, bd) * 0.12 * front);
    cc.lerp(C('#3f9db0'), flank * 0.4);                                            // teal flank
    cc.lerp(PAL.shell.clone().lerp(PAL.mud, smooth(0.4, 0.8, m2) * 0.5), (1 - front) * (0.55 + 0.35 * smooth(0.4, 0.75, m2)) * smooth(-0.04, 0.1, v.y));
    cc.lerp(PAL.mud, smooth(0.62, 0.85, m3) * 0.35 * (1 - 0.6 * front) * smooth(0.03, 0.2, Math.hypot(v.x, v.z)));
    cc.multiplyScalar(0.9 + 0.2 * m3);
    cc.lerp(PAL.navy, smooth(0.04, -0.1, v.y) * 0.75);
    // chromatophore speckle: fine pale and dark dots
    const pfc = smooth(0.03, 0.2, Math.hypot(v.x, v.z));
    const dots = 0.5 + (fbm(v.x * 110 + 3, v.y * 110, v.z * 110, 1) - 0.5) * pfc;
    cc.lerp(C('#dfe6e2'), smooth(0.82, 0.92, dots) * 0.3 * smooth(-0.05, 0.1, v.y));
    cc.multiplyScalar(1 - 0.25 * smooth(0.12, 0.05, dots));
    // face / pterygostomial region tinted blue-white, orbital groove dark
    const face = smooth(0.2, 0.32, v.z) * smooth(0.06, -0.04, v.y) * smooth(0.02, 0.14, ax) * smooth(0.46, 0.34, ax);
    cc.lerp(PAL.blueHi.clone().lerp(PAL.claw, 0.25), face * 0.6);
    const inGroove = Math.min(1, grooveAt[i] * 16) * smooth(ORB.x0 - 0.03, ORB.x0 + 0.02, ax) * smooth(0.28, 0.36, v.z);
    cc.lerp(PAL.shellDark.clone().multiplyScalar(0.8), inGroove * 0.85);
    // grooves darker
    cc.lerp(PAL.navy, Math.min(0.85, grooveAt[i] * 34));   // sutures read navy, as in the photographs
    // underside
    if (v.y < 0) {
      const u = smooth(0.0, -0.06, v.y);
      const ster = smooth(0.3, 0.17, ax) * smooth(-0.38, -0.26, v.z) * smooth(0.36, 0.24, v.z);
      const under = PAL.sternum.clone().multiplyScalar(0.72 + 0.4 * m2).lerp(PAL.shellDark, 0.25 * smooth(0.45, 0.8, m1)).lerp(PAL.blue, 0.1 + 0.12 * smooth(0.1, 0.25, ax));
      cc.lerp(PAL.navy.clone().lerp(PAL.blue, 0.35), u * 0.7);
      cc.lerp(under, ster * u);
    }
    colArr[i * 3] = cc.r; colArr[i * 3 + 1] = cc.g; colArr[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  return g;
}

// tympanum on the flat faces (+Z / -Z) of the walking-leg merus (P2-P5): oval, centred at 47 % of the segment
const tympMask = (t, a) => { const e = 1 - sq((t - 0.47) / 0.27); if (e <= 0) return 0; return Math.sqrt(e) * Math.max(gauss(angDiff(a, 0), 0.6), gauss(angDiff(a, PI), 0.6)); };

// ---------- appendages ----------
const bump = (t, c, w) => Math.exp(-sq((t - c) / w));

function legColor(base, pale = 0.0) {
  return (t, a, p, out) => {
    const m = fbm(p.x * 7 + 1, p.y * 7, p.z * 7, 3), m2 = fbm(p.x * 22, p.y * 22, p.z * 22 + 5, 3), sp = fbm(p.x * 70, p.y * 70, p.z * 70, 2);
    out.copy(PAL.legDark).lerp(base, 0.55 + smooth(0.3, 0.8, m) * 0.45);
    const up = 0.5 + 0.5 * Math.sin(a);
    out.lerp(PAL.mud, smooth(0.55, 0.85, m2) * (0.1 + 0.2 * up));         // soft silt film
    out.lerp(PAL.mud, smooth(0.66, 0.8, sp) * 0.55);                          // fine dry-silt specks
    out.lerp(PAL.legPale, pale * smooth(0.45, 0.8, m) * 0.6);
    out.multiplyScalar(0.88 + 0.24 * m2);
  };
}

/** Walking-leg segment meshes (each returns Group of meshes, along +X, pivot at proximal end). */
function legSegment(kind, s, mats, tone = 0) {
  const g = new THREE.Group();
  const geos = [];
  let L, prof, opt = {};
  if (kind === 'coxa') {
    L = 0.07 * s; prof = (t) => ({ w: s * (0.06 - 0.014 * t), h: s * (0.065 - 0.014 * t), n: 2 });
    opt = { cap0: 0.06, cap1: 0.05, neck1: 0.7, nR: 20, nT: 18 };
  } else if (kind === 'basis') {   // basis + ischium (fused in brachyurans)
    L = 0.09 * s; prof = (t) => ({ w: s * (0.042 + 0.006 * Math.sin(PI * t)), h: s * (0.05 + 0.008 * Math.sin(PI * t)), n: 2.2 });
    opt = { cap0: 0.05, cap1: 0.05, neck1: 0.7, nR: 20, nT: 16 };
  } else if (kind === 'merus') {
    L = 0.4 * s;
    prof = (t) => ({ w: s * (0.024 + 0.016 * bump(t, 0.5, 0.42)), h: s * (0.036 + 0.036 * bump(t, 0.45, 0.4) - 0.005 * t), n: 2.6, oy: s * 0.006 * Math.sin(PI * t) });
    opt = { cap0: 0.07, cap1: 0.06, ridge: 0.2, ridgeB: 0.1, ridgeW: 0.42, nR: 40, nT: 72, bulge: (t, a) => 1 - 0.16 * smooth(0.12, 0.6, tympMask(t, a)), ridges: [{ a: PI / 2 + 0.75, k: 0.1, w: 0.2 }, { a: PI / 2 - 0.75, k: 0.1, w: 0.2 }, { a: 3 * PI / 2 + 0.6, k: 0.08, w: 0.18 }] };
  } else if (kind === 'carpus') {
    L = 0.18 * s;
    prof = (t) => ({ w: s * (0.03 + 0.012 * bump(t, 0.45, 0.35)), h: s * (0.036 + 0.02 * bump(t, 0.4, 0.35)), n: 2.1 });
    opt = { cap0: 0.06, cap1: 0.05, ridge: 0.18, nR: 24, nT: 28 };
  } else if (kind === 'propodus') {
    L = 0.26 * s;
    prof = (t) => ({ w: s * (0.02 + 0.005 * bump(t, 0.3, 0.3) - 0.005 * t), h: s * (0.03 + 0.008 * bump(t, 0.25, 0.3) - 0.009 * t), n: 2.3, oy: -s * 0.004 * Math.sin(PI * t) });
    opt = { cap0: 0.05, cap1: 0.045, ridgeB: 0.12, nR: 20, nT: 48 };
  } else { // dactylus
    L = 0.17 * s;
    prof = (t) => ({ w: s * (0.018 * Math.pow(1 - t, 0.75) + 0.0015), h: s * (0.024 * Math.pow(1 - t, 0.8) + 0.0015), n: 2.2, oy: -s * 0.07 * t * t });
    opt = { cap0: 0.04, cap1: 0.0, neck1: 0.5, ridge: 0.2, nR: 16, nT: 40 };
  }
  { const p0 = prof, kw = { coxa: 1.0, basis: 1.0, merus: 0.95, carpus: 0.78, propodus: 0.78, dactylus: 0.95 }[kind], kh = { coxa: 1.0, basis: 1.0, merus: 1.0, carpus: 0.78, propodus: 0.78, dactylus: 0.9 }[kind]; prof = (t) => { const r = p0(t); r.w *= kw; r.h *= kh; return r; }; }
  const base = tone > 0 ? PAL.legPale.clone().lerp(PAL.legMid, 0.5) : PAL.legMid;
  const lc0 = legColor(base, kind === 'propodus' ? 0.35 : 0.15);
  const lc = (t, a, p, o) => { lc0(t, a, p, o); o.lerp(PAL.legPale, 0.35 * gauss(t, 0.09) + 0.35 * gauss(t - 1, 0.09)); if (kind === 'dactylus') o.lerp(PAL.legPale, 0.7); if (kind === 'propodus') o.lerp(PAL.legPale, 0.25 * smooth(0.5, 1, t)); };
  const colorFn = kind === 'merus' ? (t, a, p, o) => { lc(t, a, p, o); const w = smooth(0.1, 0.55, tympMask(t, a)); o.lerp(PAL.tympanum, w * 0.5); o.multiplyScalar(1 - 0.35 * gauss(tympMask(t, a) - 0.1, 0.05)); } : lc;   // tympanum: pale membranous oval with a darker rim
  const T = makeTube({ L, prof, colorFn, ...opt, ext: 0.03 * s });
  geos.push(T.geo);
  if (kind !== 'dactylus') geos.push(endBall(T, L, prof, 0.62));
  // spines / setae
  if (kind === 'merus') {
    // merus of P2-P5 is unarmed in I. pusilla (no subdistal spine); only a few short setae on the lower margin
    for (let i = 0; i < 3; i++) { const t = 0.3 + 0.2 * i, sp = T.sample(L * t, 3 * PI / 2 + 0.3); geos.push(makeSpike(sp.p, sp.n, 0.03 * s, 0.003 * s, new V3(0.5, 0, 0), PAL.seta, 4, 3)); }
  } else if (kind === 'carpus') {
    // carpus unarmed
  } else if (kind === 'propodus') {
    for (let i = 0; i < 5; i++) {
      const t = 0.3 + 0.65 * (i / 4), sp = T.sample(L * t, 3 * PI / 2 - 0.35 + (i % 2) * 0.7);
      geos.push(makeSpike(sp.p, sp.n.clone().add(new V3(0.35, 0, 0)), (0.02 + 0.012 * rnd()) * s, 0.0025 * s, new V3(0.3, -0.2, 0), PAL.seta, 4, 3));
    }
    
  } else if (kind === 'dactylus') {
    for (let i = 0; i < 3; i++) {
      const t = 0.1 + 0.4 * (i / 2), sp = T.sample(L * t, PI / 2 + (i % 2 ? 0.4 : -0.4));
      geos.push(makeSpike(sp.p, sp.n, 0.02 * s, 0.002 * s, new V3(0.4, 0, 0), PAL.seta, 4, 3));
    }
  }
  const m = new THREE.Mesh(merge(geos), mats.leg);
  g.add(m);
  return { group: g, L, mesh: m };
}

function clawColor(t, a, p, out) {
  const m = fbm(p.x * 7, p.y * 7, p.z * 7, 3), sp = fbm(p.x * 45 + 3, p.y * 45, p.z * 45, 2);
  out.copy(PAL.claw).lerp(PAL.clawShade, smooth(0.35, 0.8, m) * 0.7);
  out.lerp(C('#e9c9a0'), 0.18 * smooth(0.3, 0.8, m)); out.lerp(PAL.blueDeep, 0.03 * (0.5 + 0.5 * Math.sin(a - PI / 2)) * smooth(0.5, 0.2, t));   // faint bluish translucency toward the palm edges
  out.lerp(PAL.mud, smooth(0.8, 0.92, sp) * 0.3);                                                    // mud specks
  out.multiplyScalar(0.94 + 0.1 * fbm(p.x * 30, p.y * 30, p.z * 30, 2));
}

const CHELA = {};   // shared between propodus and dactylus builds (finger geometry)
function chelaGeom(kind, s, mats) {
  const geos = [];
  let L, T;
  if (kind === 'coxa') {
    L = 0.1 * s; T = makeTube({ L, prof: (t) => ({ w: s * 0.08, h: s * 0.085, n: 2 }), colorFn: legColor(PAL.legMid), cap0: 0.06, cap1: 0.05, neck1: 0.72, nR: 20, nT: 16, ext: 0.03 });
    geos.push(T.geo); geos.push(endBall(T, L, (t) => ({ w: s * 0.08, h: s * 0.085 }), 0.72));
  } else if (kind === 'ischium') {
    L = 0.12 * s; T = makeTube({ L, prof: (t) => ({ w: s * (0.075 + 0.01 * Math.sin(PI * t)), h: s * (0.08 + 0.012 * Math.sin(PI * t)), n: 2.1 }), colorFn: legColor(PAL.legMid), cap0: 0.05, cap1: 0.05, neck1: 0.7, nR: 22, nT: 14, ext: 0.03 });
    geos.push(T.geo); geos.push(endBall(T, L, (t) => ({ w: s * 0.075, h: s * 0.08 }), 0.7));
    for (let i = 0; i < 3; i++) { const sp = T.sample(L * (0.3 + 0.25 * i), 3 * PI / 2 + 0.2); geos.push(makeSpike(sp.p, sp.n, 0.035 * s, 0.005 * s, new V3(0.4, 0, 0), PAL.seta, 4, 3)); }
  } else if (kind === 'merus') {
    L = 0.3 * s;
    T = makeTube({ L, prof: (t) => ({ w: s * (0.055 + 0.04 * bump(t, 0.6, 0.4)), h: s * (0.06 + 0.055 * bump(t, 0.65, 0.4)), n: 2.4 }), colorFn: legColor(PAL.clawDarkMerus.clone().lerp(PAL.legMid, 0.4), 0.1), cap0: 0.07, cap1: 0.06, ridgeB: 0.3, ridge: 0.15, ridgeW: 0.5, nR: 28, nT: 40, ext: 0.03 });
    geos.push(T.geo); geos.push(endBall(T, L, (t) => ({ w: s * 0.095, h: s * 0.115 }), 0.62));
    for (let i = 0; i < 3; i++) { const sp = T.sample(L * (0.45 + 0.12 * i), 3 * PI / 2 + 0.15); geos.push(makeSpike(sp.p, sp.n, 0.03 * s, 0.004 * s, new V3(0.4, 0, 0), PAL.seta, 4, 3)); }
  } else if (kind === 'carpus') {
    L = 0.3 * s;
    T = makeTube({ L, prof: (t) => ({ w: s * (0.058 + 0.02 * bump(t, 0.5, 0.35)), h: s * (0.062 + 0.026 * bump(t, 0.45, 0.35)), n: 2.0 }), colorFn: (t, a, p, o) => { clawColor(t, a, p, o); o.lerp(PAL.clawDarkMerus, 0.7 * smooth(0.28, 0.0, t)); }, cap0: 0.06, cap1: 0.06, neck1: 0.8, ridge: 0.16, nR: 26, nT: 30, ext: 0.03 });
    geos.push(T.geo); geos.push(endBall(T, L, (t) => ({ w: s * 0.078, h: s * 0.088 }), 0.8, PAL.claw));
  } else if (kind === 'propodus') {
    // male chela of I. pusilla: palm short and very high, fixed finger horizontal (parallel to the palm's lower margin),
    // crenulate carina on the outer face of each finger. Fingers lie in the local XY plane; outer face = -Z.
    L = 0.58 * s; const Hp = 0.19 * s, F0 = 0.66;
    const hh = (t) => t < F0 ? Hp * (0.5 + 0.5 * Math.pow(Math.sin(PI * clamp((t / F0) * 0.92 + 0.04)), 0.45)) : 0.5 * Hp * Math.pow(Math.max(0, 1 - (t - F0) / (1 - F0)), 0.75) + 0.014 * s;   // rounded, inflated palm; short fingers
    const bottom = () => -Hp;
    T = makeTube({
      L, n: 2.3,
      prof: (t) => {
        const h = hh(t);
        const w = t < F0 ? s * (0.05 + 0.035 * Math.pow(Math.sin(PI * clamp(t / F0)), 0.7)) : s * (0.05 * Math.pow(Math.max(0, 1 - (t - F0) / (1 - F0)), 0.5) + 0.016);
        return { h, w, n: t < F0 ? 2.6 : 2.0, oy: bottom(t) + h };
      },
      colorFn: (t, a, p, o) => { clawColor(t, a, p, o); o.lerp(C('#e6d6a6'), 0.2 * gauss(t - 0.64, 0.12)); o.lerp(PAL.blue, 0.16 * gauss(t, 0.16)); if (t < 0.12) o.lerp(PAL.clawShade, 1 - t / 0.12); if (t > 0.9) o.lerp(PAL.clawTip, smooth(0.9, 1, t) * 0.8); },
      cap0: 0.06, cap1: 0.0, neck0: 0.6, neck1: 0.4, nR: 40, nT: 84, ext: 0.03, ridge: 0.06, ridgeB: 0.04, uvScale: 0.9,
    });
    geos.push(T.geo);
    for (let i = 0; i < 14; i++) { const t = F0 + 0.02 + 0.3 * i / 13, sp = T.sample(L * t, PI); geos.push(makeBall(sp.p.clone().addScaledVector(sp.n, -0.003 * s), (0.011 - 0.0004 * i) * s, PAL.claw.clone().lerp(PAL.clawShade, 0.15), new V3(1.5, 0.9, 0.9))); }   // crenulate carina (outer face of fixed finger)
    for (let i = 0; i < 8; i++) {   // small teeth on the fixed finger's cutting edge (not crossing when closed)
      const t = F0 + 0.03 + 0.3 * (i / 7), sp = T.sample(L * t, PI / 2);
      geos.push(makeSpike(sp.p.clone().add(new V3(0, -0.004, 0)), new V3(0.15, 1, 0), (0.028 - 0.002 * i) * s, 0.012 * s, new V3(0, 0, 0), PAL.clawTip.clone().lerp(PAL.claw, 0.4), 4, 2));
    }
    for (let i = 0; i < 7; i++) { const t = 0.15 + 0.5 * i / 6, sp = T.sample(L * t, 3 * PI / 2); geos.push(makeSpike(sp.p, sp.n, 0.035 * s, 0.004 * s, new V3(0.4, 0, 0), PAL.seta, 4, 3)); }
    T.hinge = new V3(L * 0.6, bottom() + 2 * hh(0.6) - 0.03 * s, 0);
    geos.push(makeBall(T.hinge.clone(), 0.045 * s, PAL.clawShade, new V3(1, 1, 1.3)));
    const tipY = bottom() + 2 * hh(0.985) * 0.5, vx = L * 0.99 - T.hinge.x, vy = tipY - T.hinge.y;
    CHELA.tipY = tipY; CHELA.dLen = Math.hypot(vx, vy) * 1.03; CHELA.dRest = Math.atan2(vy, vx) + 0.06 * s / Math.hypot(vx, vy);
  } else { // dactylus (movable finger) — drawn pointing along +X, curved toward -Y (closing side)
    L = (CHELA.dLen || 0.3 * s);
    T = makeTube({
      L, n: 2.2,
      prof: (t) => ({ h: s * (0.05 * Math.pow(1 - t, 0.8) + 0.012), w: s * (0.045 * Math.pow(1 - t, 0.55) + 0.016), oy: -s * 0.1 * t * t }),
      colorFn: (t, a, p, o) => { clawColor(t, a, p, o); if (t > 0.86) o.lerp(PAL.clawTip, smooth(0.86, 1, t) * 0.85); },
      cap0: 0.04, cap1: 0.0, neck0: 0.7, neck1: 0.35, nR: 24, nT: 44, ext: 0.03, uvScale: 0.9,
    });
    geos.push(T.geo);
    for (let i = 0; i < 7; i++) {
      const t = 0.14 + 0.6 * (i / 6), sp = T.sample(L * t, 3 * PI / 2);
      geos.push(makeSpike(sp.p, new V3(0.1, -1, 0), (0.028 - 0.002 * i) * s, 0.012 * s, new V3(0, 0, 0), PAL.clawTip.clone().lerp(PAL.claw, 0.4), 4, 2));
    }
    for (let i = 0; i < 12; i++) { const t = 0.1 + 0.7 * i / 11, sp = T.sample(L * t, PI); geos.push(makeBall(sp.p.clone().addScaledVector(sp.n, -0.003 * s), (0.011 - 0.0005 * i) * s, PAL.claw.clone().lerp(PAL.clawShade, 0.15), new V3(1.5, 0.9, 0.9))); }   // crenulate carina on the dactylus
  }
  const m = new THREE.Mesh(merge(geos), (kind === 'propodus' || kind === 'dactylus') ? mats.claw : mats.leg);
  const g = new THREE.Group(); g.add(m);
  return { group: g, L, mesh: m, hinge: T.hinge, dRest: CHELA.dRest, tipY: CHELA.tipY };
}

// rest poses solved from photograph-derived key-point targets (tools/solve-pose.mjs + tools/pose-targets.json)
const LEG_REST = [{"coxa": [0, -39, 0], "merus": [0, 0, 21.1], "carpus": [0, 0, -62.6], "propodus": [0, 0, -15.7], "dactylus": [0, 0, 0]}, {"coxa": [0, -16.9, 0], "merus": [0, 0, 22.7], "carpus": [0, 0, -71.6], "propodus": [0, 0, -15.7], "dactylus": [0, 0, -45.1]}, {"coxa": [0, 8.2, 0], "merus": [0, 0, 21.7], "carpus": [0, 0, -68.1], "propodus": [0, 0, -14.8], "dactylus": [0, 0, -45.1]}, {"coxa": [0, 29.9, 0], "merus": [0, 0, 20.2], "carpus": [0, 0, -57.8], "propodus": [0, 0, -11.8], "dactylus": [0, 0, 0]}];
const CHELA_REST = {"coxa": [0, -3.2, -6.6], "ischium": [0, 0, 15.2], "merus": [0, -60.1, 70.2], "carpus": [58.9, -101.2, -23], "propodus": [-5.6, -33.9, 73.5]};

// ---------- assembly ----------
const R = 'R', Lf = 'L';
function joint(name, parent, pos, rot, meta, mirror = false) {
  if (mirror) { const m = new THREE.Group(); m.name = `${name}_mount`; m.scale.x = -1; parent.add(m); parent = m; }
  const j = new THREE.Group(); j.name = name; j.position.copy(pos); j.rotation.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R);
  j.userData = { joint: true, ...meta }; parent.add(j); return j;
}

export const JOINTS = []; // registry for animation: {node, rest:[x,y,z]deg}

function reg(node, meta) { JOINTS.push(node); node.userData.rest = [node.rotation.x, node.rotation.y, node.rotation.z]; }

export function buildCrab(mats) {
  seed = 12345; JOINTS.length = 0;
  const crab = new THREE.Group(); crab.name = 'Crab';
  const body = new THREE.Group(); body.name = 'Body'; crab.add(body);
  const carapace = new THREE.Mesh(buildCarapace(), mats.carapace); carapace.name = 'Carapace_mesh'; body.add(carapace);

  // sand / mud grains on the carapace
  const grains = [];
  for (let i = 0; i < 40; i++) {
    const th = rnd() * 2 * PI, rr = Math.sqrt(rnd()) * 0.92;
    const x = Math.cos(th) * rr * 0.48, z = Math.sin(th) * rr * 0.37; if (topY(x, z) < 0.03) continue;
    const y = topY(x, z) - 0.004, r = 0.006 + 0.012 * Math.pow(rnd(), 3);
    grains.push(makeBlob(new V3(x, y, z), r, new V3(1, 0.7, 1), rnd() < 0.6 ? PAL.mud.clone().multiplyScalar(0.7) : C('#8f8a7a')));
  }
  for (let i = 0; i < 1; i++) { const x = (rnd() - 0.5) * 0.6, z = -0.05 - rnd() * 0.25; grains.push(makeBlob(new V3(x, topY(x, z), z), 0.026 + rnd() * 0.018, new V3(1.3, 0.45, 1), PAL.mud.clone().multiplyScalar(0.55), 2)); }
  const mud = new THREE.Mesh(merge(grains), mats.mud); mud.name = 'MudGrains_mesh'; body.add(mud);

  // ---- eyestalks (rest = erect as photographed; stow = lying in the orbital groove) ----
  for (const side of [R, Lf]) {
    const sx = side === R ? 1 : -1;
    const zA = orbZ(ORB.x0) - ORB.sink, zB = orbZ(ORB.x1) - ORB.sink, yP = topY(ORB.x0, orbZ(ORB.x0)) - ORB.sink;
    const Ls = 0.33, stowYaw = Math.atan2(zA - zB, ORB.x1 - ORB.x0) / D2R;
    const eye = joint(`${side}_eyestalk`, body, new V3(ORB.x0, yP, zA), [0, 0, 74], { hinge: 'z', min: -15, max: 100, label: 'eyestalk', stow: [0, stowYaw, -3] }, sx < 0);
    const T = makeTube({
      L: Ls, prof: (t) => ({ w: 0.016 - 0.004 * t + 0.008 * bump(t, 0, 0.2) + 0.006 * bump(t, 1, 0.08), h: 0.016 - 0.004 * t + 0.008 * bump(t, 0, 0.2) + 0.006 * bump(t, 1, 0.08), n: 2, oz: 0.004 * Math.sin(PI * t) }),
      colorFn: (t, a, p, o) => { o.copy(PAL.legMid).lerp(C('#7c8590'), 0.55 * smooth(0.55, 1, t)); o.lerp(PAL.blue, 0.35 * smooth(0.6, 0.0, t) * (0.5 + 0.5 * Math.sin(a))); o.multiplyScalar(0.85 + 0.3 * fbm(p.x * 25, p.y * 25, p.z * 25, 2)); },
      cap0: 0.05, cap1: 0.05, neck0: 0.8, neck1: 0.9, nR: 18, nT: 30, ext: 0.05,
    });
    const gs = [T.geo, makeBall(new V3(0, 0, 0), 0.03, PAL.legMid.clone().lerp(PAL.membrane, 0.25), new V3(0.8, 1, 1))];   // basal collar seated in the socket
    const stalk = new THREE.Mesh(merge(gs), mats.leg); stalk.name = `${side}_eyestalk_mesh`; eye.add(stalk);
    const cornea = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mats.cornea); cornea.name = `${side}_cornea_mesh`;
    cornea.scale.set(0.03, 0.022, 0.022); cornea.position.set(Ls + 0.012, 0.0, 0.006); eye.add(cornea);
    reg(eye);
  }

  // ---- third maxillipeds ----
  for (const side of [R, Lf]) {
    const sx = side === R ? 1 : -1;
    const mx = joint(`${side}_maxilliped3`, body, new V3(0.035, botY(0.035, 0.05) - 0.02, 0.06), [0, -84, 0], { hinge: 'z', min: -10, max: 60, label: 'maxilliped3' }, sx < 0);
    const T = makeTube({
      L: 0.27, prof: (t) => ({ w: 0.072 * (0.8 + 0.2 * Math.sin(PI * clamp(t * 1.2))) * (1 - 0.25 * t), h: 0.018, n: 2.6, oy: -0.004 * t }),
      colorFn: (t, a, p, o) => { o.copy(PAL.shellDark).lerp(PAL.legMid, 0.4 + 0.3 * fbm(p.x * 20, p.y * 20, p.z * 20, 2)); o.lerp(PAL.blue.clone().lerp(PAL.claw, 0.4), smooth(0.3, 0.75, t) * 0.7); },
      cap0: 0.04, cap1: 0.08, neck0: 0.8, neck1: 0.5, nR: 20, nT: 24, ext: 0.03,
    });
    const gs = [T.geo];
    for (let i = 0; i < 10; i++) { const sp = T.sample(0.27 * (0.4 + 0.06 * i), 0.0 + (i % 2) * 0.2); gs.push(makeSpike(sp.p, sp.n.clone().add(new V3(0.8, 0, 0)), 0.05, 0.005, new V3(0, -0.2, 0), PAL.seta, 4, 3)); }
    const m = new THREE.Mesh(merge(gs), mats.leg); m.name = `${side}_maxilliped3_mesh`; mx.add(m);
    reg(mx);
  }

  // ---- abdomen (male: narrow, segmented) ----
  {
    const ab = joint('Abdomen', body, new V3(0, botY(0, -0.33) - 0.004, -0.345), [0, -90, 0], { hinge: 'z', min: -5, max: 75, label: 'abdomen' });
    const Lz = 0.4, segs = [[0.06, 0.5], [0.15, 0.55], [0.24, 0.25], [0.35, 0.22], [0.5, 0.3], [0.66, 0.5], [0.84, 0.55]];   // [suture position, depth]: somites 1-2, 2-3, partly fused 3-5, 5-6, 6-telson
    const T = makeTube({
      L: Lz, n: 3.0,
      prof: (t) => {
        let w = t < 0.25 ? mix(0.2, 0.1, smooth(0, 0.25, t)) : t < 0.7 ? mix(0.1, 0.075, (t - 0.25) / 0.45) : 0.075 * Math.pow(Math.max(0, 1 - (t - 0.7) / 0.3), 0.55) + 0.01;
        let h = 0.018;
        for (const [st, dp] of segs) { h *= 1 - dp * 0.55 * gauss(t - st, 0.013); w *= 1 - dp * 0.08 * gauss(t - st, 0.012); }
        const z = -0.345 + t * Lz;
        return { w, h, oy: botY(0, z) - 0.006 - botY(0, -0.345) };
      },
      colorFn: (t, a, p, o) => {
        o.copy(PAL.abd).multiplyScalar(0.85 + 0.25 * fbm(p.x * 20, p.y * 20, p.z * 20, 2));
        let sut = 0; for (const [st, dp] of segs) sut = Math.max(sut, dp * gauss(t - st, 0.011));
        o.multiplyScalar(0.8).lerp(PAL.shellDark, sut * 1.0).lerp(PAL.blue, 0.12 * (0.5 + 0.5 * Math.cos(a)));
        o.lerp(PAL.shellDark, 0.3 * gauss(t - 1, 0.12));
      },
      cap0: 0.04, cap1: 0.1, neck0: 0.85, neck1: 0.3, nR: 28, nT: 110, ext: 0.0, ridgeB: 0.25, uvScale: 0.5,
    });
    const m = new THREE.Mesh(T.geo, mats.carapace); m.name = 'Abdomen_mesh'; ab.add(m);
    reg(ab);
  }

  // ---- chelipeds ----
  const chelaSpec = [
    { n: 'coxa', s: 1 }, { n: 'ischium', s: 1 }, { n: 'merus', s: 1 }, { n: 'carpus', s: 0.95 }, { n: 'propodus', s: 0.95 }, { n: 'dactylus', s: 0.95 },
  ];
  for (const side of [R, Lf]) {
    const sx = side === R ? 1 : -1;
    let parent = body, off = new V3(0.27, -0.075, 0.24);
    const rest = { ...CHELA_REST, dactylus: [0, 0, 0] };
    let prevL = 0;
    for (const cs of chelaSpec) {
      const seg = chelaGeom(cs.n, cs.s, mats);
      let pos = parent === body ? off : new V3(prevL, 0, 0);
      const j = joint(`${side}_cheliped_${cs.n}`, parent, pos, rest[cs.n], { hinge: cs.n === 'carpus' ? 'y' : 'z', min: -120, max: 120, label: `cheliped ${cs.n}` }, parent === body && sx < 0);
      seg.mesh.name = `${j.name}_mesh`; j.add(seg.group); j.userData.L = seg.L;
      if (cs.n === 'propodus') { j.userData.hingePos = seg.hinge.toArray(); j.userData.dRest = seg.dRest; j.userData.tip = [seg.L * 0.99, seg.tipY, 0]; }
      if (cs.n === 'dactylus') { const hp = parent.userData.hingePos; j.position.set(hp[0], hp[1], hp[2]); j.rotation.z = parent.userData.dRest; }
      reg(j); parent = j; prevL = seg.L;
      if (cs.n === 'propodus') prevL = seg.L;
    }
  }

  // ---- walking legs ----
  const legs = [
    { z: 0.17, yaw: 32, s: 0.86 }, { z: 0.03, yaw: 10, s: 0.95 }, { z: -0.11, yaw: -12, s: 0.92 }, { z: -0.24, yaw: -34, s: 0.8 },
  ];
  legs.forEach((lg, k) => {
    for (const side of [R, Lf]) {
      const sx = side === R ? 1 : -1;
      const xr = aAt(lg.z) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(lg.z / CP.b), CP.n)), 1 / CP.n) * 0.9;
      const xs = xr;
      const pname = `${side}_leg${k + 2}`;
      const rest = { ...LEG_REST[k], basis: [0, 0, 0] };
      let parent = body, prevL = 0;
      for (const kind of ['coxa', 'basis', 'merus', 'carpus', 'propodus', 'dactylus']) {
        const seg = legSegment(kind, lg.s, mats, kind === 'carpus' ? 1 : 0);
        const pos = parent === body ? new V3(xs, botY(xs, lg.z) + 0.085, lg.z) : new V3(prevL, 0, 0);
        const j = joint(`${pname}_${kind}`, parent, pos, rest[kind], { hinge: 'z', min: -100, max: 100, label: `leg ${k + 2} ${kind}` }, parent === body && sx < 0);
        seg.mesh.name = `${j.name}_mesh`; j.add(seg.group); j.userData.L = seg.L;
        reg(j); parent = j; prevL = seg.L;
      }
    }
  });
  crab.traverse((o) => {   // compensate the silt albedo's mid-grey base
    if (!o.isMesh || o.material !== mats.leg) return;
    const c = o.geometry.attributes.color;
    for (let i = 0; i < c.count; i++) c.setXYZ(i, Math.min(1, c.getX(i) * 1.55), Math.min(1, c.getY(i) * 1.55), Math.min(1, c.getZ(i) * 1.55));
  });
  return crab;
}
