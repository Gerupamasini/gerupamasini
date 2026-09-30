import * as THREE from 'three';
import { basePoint, RICTUS_S } from './EdohazeModel.js';
import { bodyProfile } from './EdohazeParams.js';
import { Simplex3, mulberry32, smoothstep, clamp, lerp, gauss } from './EdohazeMath.js';

// Procedural skin maps in body UV space (u = axial s, v = θ/2π, θ from dorsal).
// Noise is evaluated on the *3D surface in millimetres* so pattern scale is
// physically correct and there is no seam. Left/right use the same field but
// sampled at mirrored-and-offset coordinates → natural asymmetry.
//
// Colour references (see RESEARCH.md §4): pale grey-/yellow-brown translucent,
// fine melanophores (dense dorsally), indistinct dusky midlateral blotches,
// whitish belly, NO mid-body black bar (Chikuzen-haze trait), low contrast overall.

const cache = new Map();

export function getSkinMaps(variantSeed, sex = 1, slMm = 37, W = 1024, H = 384) {
  const key = `${variantSeed}|${sex}|${W}`;
  if (cache.has(key)) return cache.get(key);
  const maps = generate(variantSeed, sex, slMm, W, H);
  cache.set(key, maps);
  return maps;
}

function generate(seed, sex, slMm, W, H) {
  const rnd = mulberry32(seed * 7919 + 13);
  const nz = new Simplex3(seed + 101);
  const nz2 = new Simplex3(seed + 202);
  const col = new Uint8ClampedArray(W * H * 4);
  const orm = new Uint8ClampedArray(W * H * 4);
  const height = new Float32Array(W * H);

  // Individual pigment traits
  const melDensity = lerp(0.8, 1.2, rnd());
  const melExpansion = lerp(0.75, 1.25, rnd());   // chromatophore dispersion state
  const blotchContrast = lerp(0.07, 0.14, rnd());  // indistinct (confirmed)
  const blotchCount = 7 + Math.floor(rnd() * 3);
  const hueShift = lerp(-0.04, 0.04, rnd());
  const blotches = { L: [], R: [] };
  for (const side of ['L', 'R']) {
    for (let i = 0; i < blotchCount; i++) {
      const s = lerp(0.30, 0.95, (i + 0.5) / blotchCount) + (rnd() - 0.5) * 0.035;
      blotches[side].push({ s, th: Math.PI / 2 + (rnd() - 0.5) * 0.25, ws: 0.022 + rnd() * 0.012, wt: 0.22 + rnd() * 0.12, k: 0.6 + rnd() * 0.5 });
    }
  }
  // perimeter per column (mm) for physical texel size
  const perim = new Float32Array(W);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  for (let x = 0; x < W; x++) {
    const s = (x + 0.5) / W; let L = 0;
    basePoint(s, 0, tmp2);
    for (let k = 1; k <= 48; k++) { basePoint(s, (k / 48) * Math.PI * 2, tmp); L += tmp.distanceTo(tmp2); tmp2.copy(tmp); }
    perim[x] = Math.max(L * slMm, 0.3);
  }

  // scale grid (mm): lateral series ~65–70 → ~0.48 mm scale pitch
  const scL = 0.46, scH = 0.40, scR = 0.40;
  const hash2 = (i, j) => { let h = (i * 374761393 + j * 668265263 + seed * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  for (let y = 0; y < H; y++) {
    const th = ((y + 0.5) / H) * Math.PI * 2;
    const left = th < Math.PI;
    const thm = left ? th : 2 * Math.PI - th;
    const dorsal = Math.cos(th);               // +1 dorsal, -1 ventral
    for (let x = 0; x < W; x++) {
      const s = (x + 0.5) / W;
      basePoint(s, th, tmp);
      const px = tmp.x * slMm, py = tmp.y * slMm, pz = tmp.z * slMm;
      // asymmetry: right side samples an offset field
      const ox = left ? 0 : 31.7, oz = left ? 0 : 17.3;
      const qx = Math.abs(px) + ox, qy = py, qz = pz + oz;
      const i = y * W + x;

      // ---------- scales (physically sized) ----------
      const head = 1 - smoothstep(0.255, 0.32, s);    // head naked (Gymnogobius)
      const arc = (thm / Math.PI) * perim[x] * 0.5;   // mm from dorsal midline
      const ax = s * slMm;
      let scaleH = 0, scaleEdge = 0;
      if (head < 0.999) {
        const gi = Math.floor(ax / scL), gj = Math.floor(arc / scH);
        let best = 1e9, bd = 0;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          const ci = gi + di, cj = gj + dj;
          const cx = (ci + 0.5 + ((cj & 1) ? 0.5 : 0) + (hash2(ci, cj) - 0.5) * 0.18) * scL;
          const cy = (cj + 0.5 + (hash2(cj, ci) - 0.5) * 0.18) * scH;
          const dx = (ax - cx), dy = (arc - cy);
          const d = Math.hypot(dx * 0.9, dy) / scR;
          if (d < 1 && cx < best) { best = cx; bd = d + dx / scR * 0.25; }
        }
        if (best < 1e9) { scaleH = 0.35 + 0.65 * clamp(bd, 0, 1); scaleEdge = smoothstep(0.72, 0.98, bd); }
        scaleH *= (1 - head); scaleEdge *= (1 - head);
      }

      // ---------- cephalic sensory papillae rows (head) ----------
      let pap = 0;
      if (s < 0.27) {
        for (const ls of [0.125, 0.155, 0.185, 0.215, 0.24]) {
          const row = gauss(s - ls, 0.0022) * smoothstep(0.9, 1.1, thm) * (1 - smoothstep(2.0, 2.3, thm));
          if (row > 0.01) pap = Math.max(pap, row * smoothstep(0.7, 0.95, 0.5 + 0.5 * Math.sin(arc * 14.0)));
        }
        const hRow = gauss(thm - 1.95, 0.02) * smoothstep(0.1, 0.13, s) * (1 - smoothstep(0.24, 0.26, s));
        pap = Math.max(pap, hRow * smoothstep(0.7, 0.95, 0.5 + 0.5 * Math.sin(ax * 14.0)));
      }

      // micro relief
      const micro = nz.fbm(qx * 2.6, qy * 2.6, qz * 2.6, 3);
      height[i] = scaleH * 0.55 + pap * 0.22 + micro * 0.08;

      // ---------- pigment ----------
      // base countershading: dorsal greyish-brown → flank pale fawn → ventral whitish
      const dv = dorsal;
      let r, g, b;
      // sRGB reference swatches (live-colour estimate), converted to linear for blending
      const dorsalC = LIN.dorsal, flankC = LIN.flank, ventC = LIN.vent;
      const tD = smoothstep(-0.05, 0.75, dv), tV = smoothstep(-0.25, -0.8, dv);
      r = lerp(lerp(flankC[0], dorsalC[0], tD), ventC[0], tV);
      g = lerp(lerp(flankC[1], dorsalC[1], tD), ventC[1], tV);
      b = lerp(lerp(flankC[2], dorsalC[2], tD), ventC[2], tV);
      // low-frequency mottling (background matching), never high contrast
      const lf = nz2.fbm(qx * 0.18, qy * 0.18, qz * 0.18, 3);
      const mott = 1 + 0.10 * lf * (0.4 + 0.6 * tD);
      // melanophores: jittered cellular dots ~0.3 mm, stellate falloff
      let mel = 0;
      const md = melDensity * lerp(0.15, 1.0, smoothstep(-0.7, 0.6, dv)) * (s < 0.03 ? 1.2 : 1);
      {
        const cs = 0.22;
        const gx = Math.floor(ax / cs), gy = Math.floor(arc / cs);
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          const ci = gx + di, cj = gy + dj + (left ? 0 : 977);
          const hsh = hash2(ci, cj);
          if (hsh > md * 0.8) continue;
          const cx = (ci + hash2(cj, ci + 7)) * cs, cy = (gy + dj + hash2(ci + 3, cj)) * cs;
          const d = Math.hypot(ax - cx, arc - cy);
          const rad = (0.028 + 0.04 * hash2(ci + 11, cj)) * melExpansion;
          const ang = Math.atan2(arc - cy, ax - cx);
          const dend = 1 + 0.45 * Math.sin(ang * (4 + ((hsh * 10) | 0)) + hsh * 20);
          mel = Math.max(mel, 1 - smoothstep(rad * 0.4, rad * dend * 1.4, d));
        }
      }
      // scale-margin reticulation (dorsal & upper flank only)
      const retic = scaleEdge * smoothstep(-0.2, 0.5, dv) * 0.55;
      // midlateral indistinct blotches + very faint dorsal saddles
      let blot = 0;
      for (const bl of blotches[left ? 'L' : 'R']) {
        const e = gauss(s - bl.s, bl.ws) * gauss(thm - bl.th, bl.wt);
        blot = Math.max(blot, e * bl.k);
      }
      blot *= 0.75 + 0.5 * nz.noise(qx * 0.9, qy * 0.9, qz * 0.9);
      const saddle = 0.5 * smoothstep(0.6, 0.95, dv) * Math.pow(0.5 + 0.5 * Math.sin((s - 0.3) * 58), 3) * smoothstep(0.32, 0.4, s);
      // head: dusky snout/top, pale cheeks with a few guanine spots; lips dusky
      const lipDusk = s < RICTUS_S + 0.03 ? gauss(thm - 1.95, 0.3) * 0.4 * (1 - smoothstep(0.1, 0.16, s)) : 0;
      const cheekPale = gauss(s - 0.19, 0.05) * gauss(thm - 1.9, 0.35) * 0.12;
      const guan = head * smoothstep(0.82, 0.95, nz2.noise(qx * 1.7, qy * 1.7, qz * 1.7)) * gauss(thm - 1.8, 0.5);

      const snoutDusk = (1 - smoothstep(0.0, 0.05, s)) * 0.3;  // dusky snout/lip tips
      const dark = clamp(snoutDusk + mel * 0.42 + retic * 0.28 + blot * blotchContrast * 3.2 + saddle * 0.05 + lipDusk, 0, 0.85);
      const melC = LIN.mel;
      r = lerp(r * mott, melC[0], dark); g = lerp(g * mott, melC[1], dark); b = lerp(b * mott, melC[2], dark);
      r += (cheekPale + guan * 0.25) * 0.5; g += (cheekPale + guan * 0.25) * 0.5; b += (cheekPale * 0.8 + guan * 0.2) * 0.5;
      // subtle hue individuality
      r *= 1 + hueShift; b *= 1 - hueShift;
      // sex: males slightly darker/duskier head (weak; unconfirmed breeding colours)
      if (sex > 1.0) { const k = 1 - 0.06 * head; r *= k; g *= k; b *= k; }

      col[i * 4] = toSRGB(r); col[i * 4 + 1] = toSRGB(g); col[i * 4 + 2] = toSRGB(b); col[i * 4 + 3] = 255;
      // ORM-style: R = translucency, G = roughness, B = guanine/iridescence mask
      const trans = clamp(0.25 + 0.55 * smoothstep(0.0, -0.9, dv) * (1 - head * 0.6) + 0.35 * smoothstep(0.75, 0.95, s) - mel * 0.3, 0, 1);
      const rough = clamp(0.30 + 0.12 * pap + 0.06 * scaleEdge - 0.08 * smoothstep(-0.3, -0.9, dv) + micro * 0.04, 0.12, 0.8);
      const irid = clamp(smoothstep(-0.2, -0.8, dv) * 0.7 + guan * 0.6 + cheekPale * 2, 0, 1);
      orm[i * 4] = trans * 255; orm[i * 4 + 1] = rough * 255; orm[i * 4 + 2] = irid * 255; orm[i * 4 + 3] = 255;
    }
  }

  // Normal map from height using physical texel spacing (mm)
  const nrm = new Uint8ClampedArray(W * H * 4);
  const strength = 0.09; // height units → mm relief
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const xl = Math.max(0, x - 1), xr = Math.min(W - 1, x + 1);
    const yu = (y - 1 + H) % H, yd = (y + 1) % H;
    const dxmm = (xr - xl) * slMm / W, dymm = 2 * perim[x] / H;
    const hx = (height[y * W + xr] - height[y * W + xl]) * strength / dxmm;
    const hy = (height[yd * W + x] - height[yu * W + x]) * strength / dymm;
    const l = Math.hypot(hx, hy, 1);
    nrm[i * 4] = (-hx / l * 0.5 + 0.5) * 255;
    nrm[i * 4 + 1] = (-hy / l * 0.5 + 0.5) * 255;
    nrm[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255;
    nrm[i * 4 + 3] = 255;
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8; t.needsUpdate = true; return t;
  };
  return { map: mk(col, true), normalMap: mk(nrm, false), ormMap: mk(orm, false) };
}

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const LIN = {
  dorsal: [0.52, 0.45, 0.34].map(s2l),  // greyish yellow-brown back
  flank: [0.70, 0.63, 0.49].map(s2l),   // pale fawn, translucent
  vent: [0.86, 0.83, 0.76].map(s2l),    // whitish belly
  mel: [0.20, 0.15, 0.11].map(s2l),     // melanophore brown-black
};

function toSRGB(c) {
  c = clamp(c, 0, 1);
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
}

// Iris texture: x = angle around optical axis, y = radial (1 = pupil margin).
export function makeIrisTexture(seed) {
  const W = 256, H = 64; const d = new Uint8ClampedArray(W * H * 4);
  const nz = new Simplex3(seed + 5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = x / W * Math.PI * 2, r = y / (H - 1);
    const fib = 0.5 + 0.5 * nz.noise(Math.cos(a) * 6, Math.sin(a) * 6, r * 0.8);
    const mot = nz.fbm(Math.cos(a) * 2.5, Math.sin(a) * 2.5, r * 3, 3);
    // brassy/golden ring near pupil, darker periphery, dorsal iris duskier
    const dorsal = 0.5 + 0.5 * Math.cos(a);
    const ring = smoothstep(0.35, 0.95, r);
    let R = lerp(0.10, 0.62, ring) * (0.75 + 0.35 * fib);
    let G = lerp(0.08, 0.48, ring) * (0.75 + 0.35 * fib);
    let B = lerp(0.05, 0.20, ring) * (0.75 + 0.3 * fib);
    const dk = clamp(smoothstep(0.1, 0.45, mot) * 0.7 + dorsal * 0.25, 0, 0.85);
    R = lerp(R, 0.07, dk); G = lerp(G, 0.06, dk); B = lerp(B, 0.05, dk);
    const margin = smoothstep(0.93, 1.0, r); // thin bright pupillary margin
    R += margin * 0.3; G += margin * 0.25; B += margin * 0.12;
    const i = (y * W + x) * 4;
    d[i] = toSRGB(R); d[i + 1] = toSRGB(G); d[i + 2] = toSRGB(B); d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
