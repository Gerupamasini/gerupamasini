// Procedural texture synthesis for ヒメハゼ. All maps are painted in body-UV space:
//   u = s / BODY_END (0 = snout, 1 = end of scaled body where caudal fin begins)
//   v = θ / 2π, θ = 0 dorsal midline → π/2 left flank → π ventral → 3π/2 right flank.
// Pattern is generated from rules extracted from many photos (see anatomy.PATTERN), not copied from one image.
import * as THREE from 'three';
import { PATTERN, PROPORTIONS } from '../model/anatomy.js';

export const BODY_END = 0.85;

// --- small deterministic noise toolkit ----------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(rng) {
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  const n2 = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u),
      THREE.MathUtils.lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u), v);
  };
  return (x, y, oct = 4) => {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * n2(x * f, y * f); amp *= 0.5; f *= 2.03; }
    return s;
  };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// --- body maps ------------------------------------------------------------------------------------
export function createBodyTextures(v, size = 1024) {
  const W = size, H = size / 2;
  const rng = mulberry32(v.seed * 7919 + 13);
  const noise = makeNoise(rng);
  const col = new Uint8ClampedArray(W * H * 4);
  const rough = new Uint8ClampedArray(W * H * 4);
  const height = new Float32Array(W * H);

  // per-individual blotch jitter (P: blotch position/shape varies individually)
  const blotches = PATTERN.midlateralBlotchS.map((s, i) => ({
    s: s + (rng() - 0.5) * 0.02, lat: 0.02 + (rng() - 0.5) * 0.08,
    len: 0.036 + rng() * 0.012 + i * 0.002, k: v.blotch * (0.9 + rng() * 0.3),
  }));
  const saddles = PATTERN.saddleS.map((s) => ({ s: s + (rng() - 0.5) * 0.02, k: 0.35 + rng() * 0.3 }));
  const flecks = [];
  for (let i = 0; i < 90; i++) flecks.push({ s: 0.2 + rng() * 0.6, lat: -0.55 + rng() * 0.9, r: 0.0025 + rng() * 0.004 });
  const cheekDots = [];
  for (let i = 0; i < 14; i++) cheekDots.push({ s: 0.12 + rng() * 0.12, lat: -0.35 + rng() * 0.6, r: 0.0025 + rng() * 0.003 });

  const scaleCols = 30;                // lateral series ≈ 28-31 (R; FishBase gives no count – see README)
  const scaleRows = 26;                // around the circumference (P)
  const scaleStartS = PROPORTIONS.opercleRearS[0];

  // stamp small spots in a pre-pass (only touches their footprints). Spots are drawn on both flanks.
  const stampDark = new Float32Array(W * H), stampPearl = new Float32Array(W * H);
  const stamp = (arr, list, latScale, gain, maxMode) => {
    for (const d of list) for (const side of [1, -1]) {
      const th = Math.acos(Math.max(-1, Math.min(1, d.lat)));
      const vc = side > 0 ? th / (Math.PI * 2) : 1 - th / (Math.PI * 2);
      const uc = d.s / BODY_END;
      const du = d.r / BODY_END, dv = d.r / latScale / (Math.PI * 2) * 1.2;
      for (let y = Math.floor((vc - dv) * H); y <= Math.ceil((vc + dv) * H); y++) {
        const yy = ((y % H) + H) % H, vv = (yy + 0.5) / H, lat = Math.cos(vv * Math.PI * 2);
        for (let x = Math.max(0, Math.floor((uc - du) * W)); x <= Math.min(W - 1, Math.ceil((uc + du) * W)); x++) {
          const s = ((x + 0.5) / W) * BODY_END;
          const dd = ((s - d.s) ** 2 + ((lat - d.lat) * latScale) ** 2) / (d.r * d.r);
          if (dd < 1) { const val = (1 - dd) * gain; const k = yy * W + x; arr[k] = maxMode ? Math.max(arr[k], val) : arr[k] + val; }
        }
      }
    }
  };
  stamp(stampDark, cheekDots, 0.05, 0.6, false);
  stamp(stampPearl, flecks, 0.035, 0.55, true);

  for (let y = 0; y < H; y++) {
    const vv = (y + 0.5) / H;
    const th = vv * Math.PI * 2;
    const lat = Math.cos(th);          // 1 dorsal … -1 ventral
    const side = Math.sin(th) >= 0 ? 1 : -1;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, s = u * BODY_END;
      const i = y * W + x;

      // ground colour: countershading
      const dorsal = sstep(-0.45, 0.35, lat);
      let r = mix(PATTERN.belly[0], PATTERN.ground[0], dorsal);
      let g = mix(PATTERN.belly[1], PATTERN.ground[1], dorsal);
      let b = mix(PATTERN.belly[2], PATTERN.ground[2], dorsal);
      // slight warm tint toward caudal peduncle, greyer head top
      const warm = sstep(0.5, 0.8, s) * 0.03;
      r += warm; b -= warm;

      // brown reticulate mottling on upper sides (F: dark brown & white speckling above)
      const n1 = noise(s * 75, vv * 42 + side * 11, 4);
      const n2 = noise(s * 110 + 3, vv * 60, 2);
      const upper = sstep(-0.25, 0.25, lat);
      let dark = upper * v.spot * (sstep(0.08, 0.3, n1) * 0.45 + sstep(0.2, 0.42, n2) * 0.45);
      // faint saddles across the back
      for (const sd of saddles) dark += sd.k * v.spot * Math.exp(-((s - sd.s) ** 2) / 0.00035) * sstep(0.3, 0.8, lat) * 0.6;
      // mid-lateral blotches (F: ~5 dark spots on mid-side); each drawn as a doubled vertical pair (P)
      for (const bl of blotches) {
        // each blotch: a dark, slightly vertically elongated spot, often with an upper/lower lobe (P)
        const ds = (s - bl.s) / bl.len, dl = (lat - bl.lat) / 0.26;
        const core = Math.exp(-(ds * ds * 1.6 + dl * dl * 1.4) * 1.8);
        const lobes = Math.exp(-(ds * ds + (dl - 0.5) ** 2) * 3) + Math.exp(-(ds * ds + (dl + 0.5) ** 2) * 3);
        const edgeNoise = 0.8 + 0.45 * noise(s * 120, vv * 90, 2);
        dark += bl.k * Math.min(1.2, (core + 0.5 * lobes) * 1.5) * edgeNoise;
      }
      // eye stripe: from lower eye margin obliquely to above mid-jaw (F)
      if (s < 0.14) {
        const t = sstep(0.11, 0.06, s);                   // 0 at eye, 1 at jaw
        const target = mix(0.35, -0.2, t);
        dark += Math.exp(-((lat - target) ** 2) / 0.006) * sstep(0.045, 0.07, s) * sstep(0.125, 0.105, s) * 0.9;
      }
      // cheek / opercle freckles (P)
      dark += stampDark[i] * v.spot;
      // dark dorsal head top, pale snout tip
      dark += sstep(0.5, 0.9, lat) * sstep(0.2, 0.05, s) * 0.25;
      dark = Math.min(1, dark);
      r = mix(r, PATTERN.mottle[0], Math.min(1, dark * 1.4)); g = mix(g, PATTERN.mottle[1], Math.min(1, dark * 1.4)); b = mix(b, PATTERN.mottle[2], Math.min(1, dark * 1.4));
      const deep = sstep(0.55, 1.0, dark);
      r = mix(r, PATTERN.blotch[0], deep); g = mix(g, PATTERN.blotch[1], deep); b = mix(b, PATTERN.blotch[2], deep);

      // pearly white flecks (P) and occasional narrow pale lines low on the flank (F)
      let pearl = stampPearl[i];
      if (v.whiteLines) {
        const ln = Math.abs(Math.sin(s * 180 + noise(s * 20, vv * 4) * 3));
        pearl = Math.max(pearl, sstep(0.93, 1, ln) * sstep(-0.6, -0.35, lat) * sstep(-0.1, -0.3, lat) * 0.35);
      }
      r = mix(r, 0.96, pearl); g = mix(g, 0.97, pearl); b = mix(b, 0.95, pearl);

      const bri = v.brightness;
      const p4 = i * 4;
      col[p4] = Math.pow(Math.min(1, r * bri), 1 / 1) * 255;
      col[p4 + 1] = Math.min(1, g * bri) * 255;
      col[p4 + 2] = Math.min(1, b * bri) * 255;
      col[p4 + 3] = 255;

      // ---- scale heightfield (ctenoid, imbricate). Head and naked nape are scaleless (F).
      const scaled = s > scaleStartS && !(s < 0.31 && lat > 0.35) && s < BODY_END - 0.01;
      let h = 0;
      if (scaled) {
        const cu = (s - scaleStartS) / (BODY_END - scaleStartS) * scaleCols;
        const cv = vv * scaleRows + (Math.floor(cu) % 2) * 0.5;
        const fu = cu - Math.floor(cu), fv = cv - Math.floor(cv) - 0.5;
        // free posterior margin is raised: height rises toward anterior (−s) direction per scale
        const edge = Math.sqrt(((1 - fu) * 0.9) ** 2 + (fv * 1.3) ** 2);
        h = sstep(1.05, 0.55, edge) * (0.5 + 0.5 * fu) * 0.9;
        h *= sstep(scaleStartS, scaleStartS + 0.03, s) * (0.6 + 0.4 * sstep(-0.9, -0.5, lat));
      }
      // fine skin wrinkles/pores for head
      h += noise(s * 400, vv * 200, 2) * 0.08;
      height[i] = h;

      // roughness: mucus-coated skin is glossy; scaled flanks a bit rougher; dark pigment slightly rougher
      const rr = scaled ? 0.36 + 0.1 * (1 - h) : 0.26;
      rough[p4] = rough[p4 + 1] = rough[p4 + 2] = Math.min(1, rr + dark * 0.05) * 255;
      rough[p4 + 3] = 255;
    }
  }

  // height → tangent-space normal map
  const nrm = new Uint8ClampedArray(W * H * 4);
  const strength = 2.2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const hx = height[y * W + Math.min(W - 1, x + 1)] - height[y * W + Math.max(0, x - 1)];
    const hy = height[((y + 1) % H) * W + x] - height[((y - 1 + H) % H) * W + x];
    let nx = -hx * strength, ny = -hy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    nrm[i * 4] = (nx * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = 255;
  }

  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    t.wrapT = THREE.RepeatWrapping; t.wrapS = THREE.ClampToEdgeWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8; t.needsUpdate = true;
    return t;
  };
  return { map: mk(col, true), normalMap: mk(nrm, false), roughnessMap: mk(rough, false) };
}

// --- fin membrane maps ----------------------------------------------------------------------------
// u = along fin base (0 = anterior), v = base → distal margin. Rays are real geometry; this map adds
// pigment rows between/along rays, membrane thinning toward the margin, and the male D1 dark band.
export function createFinTexture(kind, v, rayCount) {
  const W = 256, H = 256;
  const rng = mulberry32(v.seed * 131 + kind.length * 17);
  const noise = makeNoise(rng);
  const data = new Uint8ClampedArray(W * H * 4);
  const tint = v.finTint;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1), vv = y / (H - 1);
    const i = (y * W + x) * 4;
    let r = 0.86 + tint, g = 0.84 + tint * 0.6, b = 0.78, a = 0.32 - vv * 0.12;
    const rayPhase = u * (rayCount - 1);
    const onRay = Math.exp(-((rayPhase - Math.round(rayPhase)) ** 2) / 0.02);
    let dark = 0;
    if (kind === 'dorsal2' || kind === 'caudal' || kind === 'dorsal1') {
      // rows of small brown spots along rays (P)
      const rowsV = kind === 'caudal' ? 7 : 5;
      const sp = Math.sin(vv * rowsV * Math.PI * 2 + Math.round(rayPhase) * 0.9);
      dark += onRay * sstep(0.55, 0.95, sp) * 0.8;
    }
    if (kind === 'dorsal1' && v.male) {
      // (F) male D1 dark with a pale margin
      dark += sstep(0.35, 0.6, vv) * sstep(0.95, 0.82, vv) * 0.85;
      if (vv > 0.88) { r = g = b = 0.95; a = 0.5; }
    }
    a += sstep(0.12, 0.0, vv) * 0.45;              // fleshy fin base blends into the body
    if (kind === 'pelvic' || kind === 'anal') { dark *= 0.2; r += 0.04; g += 0.04; b += 0.05; a += 0.05; }
    if (kind === 'caudal') dark += sstep(0.1, 0.0, Math.abs(vv - 0.02)) * 0.2 + noise(u * 8, vv * 8) * 0.1;
    if (kind === 'pectoral') dark = onRay * 0.12;
    dark = Math.min(1, Math.max(0, dark));
    r = mix(r, 0.28, dark); g = mix(g, 0.22, dark); b = mix(b, 0.16, dark);
    a = Math.min(0.92, a + dark * 0.55 + onRay * 0.12);
    data[i] = r * 255; data[i + 1] = g * 255; data[i + 2] = b * 255; data[i + 3] = a * 255;
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// Iris: goby iris is dark with a golden-bronze inner ring and pale flecks (P). Pupil round (P).
export function createIrisTexture(v) {
  const S = 256, data = new Uint8ClampedArray(S * S * 4);
  const rng = mulberry32(v.seed * 97 + 3);
  const noise = makeNoise(rng);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const i = (y * S + x) * 4;
    const fib = noise(a * 6, r * 10, 3);
    let c = [0.20, 0.16, 0.11];
    const gold = sstep(0.6, 0.4, r) * sstep(0.28, 0.36, r);
    c = c.map((k, j) => mix(k, [0.85, 0.66, 0.34][j], Math.min(1, gold * (0.9 + fib))));
    const fleck = sstep(0.25, 0.4, noise(a * 14, r * 30, 2)) * sstep(0.95, 0.6, r) * 0.5;
    c = c.map((k, j) => mix(k, [0.85, 0.82, 0.7][j], fleck));
    // dorsal iris pigment band continuing the head pattern (P)
    const band = sstep(0.4, 0.8, -dy) * 0.5; c = c.map((k) => k * (1 - band));
    const pupil = sstep(0.30, 0.275, r);
    c = c.map((k) => mix(k, 0.005, pupil));
    data[i] = c[0] * 255; data[i + 1] = c[1] * 255; data[i + 2] = c[2] * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
  return t;
}
