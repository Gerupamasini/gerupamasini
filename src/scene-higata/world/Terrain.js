// Estuarine sandy-mud flat under 10 cm of water.
//
// The height field is analytic (metres, +Y up, mean sediment surface at y = 0) so the gobies rest exactly
// on what is drawn: a gentle undulation, sinuous asymmetric current ripples (λ ≈ 6 cm) in the sandier
// patches, smooth mud elsewhere, the burrow openings of mud shrimps (アナジャコ: paired openings with a
// low collar; ニホンスナモグリ: an ejecta volcano with a crater), worm-cast heaps and shallow feeding pits.
// Burrow openings are real holes (the surface is cut out and a dark tube continues below), so an
// エドハゼ can enter its burrow and look out of it.
import * as THREE from 'three';
import { commonGLSL } from '../materials/common.glsl.js';
import { Simplex2, mulberry32, smoothstep, lerp, clamp, noiseGLSL } from './noise.js';

export const MAX_FISH = 8;
export const MAX_HOLES = 16;
const CURRENT_DIR = 0.35; // flow direction of the last ebb that built the ripples (rad)

export class Mudflat {
  constructor({ seed = 11, radius = 5 } = {}) {
    this.seed = seed;
    this.radius = radius;
    this.noise = new Simplex2(seed);
    this.noise2 = new Simplex2(seed * 7 + 3);
    this.rand = mulberry32(seed * 13 + 1);
    this._placeFeatures();
  }

  // ---------------------------------------------------------------------------------------- features
  _placeFeatures() {
    const r = this.rand;
    this.burrows = [];
    this.casts = [];
    this.pits = [];
    // mud-shrimp burrows: a loose cluster around the observation area (where the gobies live)
    const want = 11;
    for (let tries = 0; tries < 400 && this.burrows.length < want; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.46;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.burrows.some((b) => Math.hypot(b.x - x, b.z - z) < 0.11)) continue;
      const volcano = r() < 0.45;
      const b = {
        id: this.burrows.length,
        x, z,
        r: 0.0058 + r() * 0.0022,              // opening radius (m): 12–16 mm across
        type: volcano ? 'nihonotrypaea' : 'upogebia',
        moundH: volcano ? 0.007 + r() * 0.007 : 0,
        moundR: volcano ? 0.032 + r() * 0.02 : 0,
        depth: 0.09,
        owner: null,
      };
      this.burrows.push(b);
      // アナジャコ: Y-shaped burrow, second opening 6–10 cm away
      if (!volcano && r() < 0.8) {
        const a2 = r() * Math.PI * 2, d2 = 0.06 + r() * 0.04;
        const x2 = x + Math.cos(a2) * d2, z2 = z + Math.sin(a2) * d2;
        if (!this.burrows.some((o) => Math.hypot(o.x - x2, o.z - z2) < 0.05)) {
          this.burrows.push({ id: this.burrows.length, x: x2, z: z2, r: b.r * (0.85 + 0.2 * r()), type: 'upogebia', moundH: 0, moundR: 0, depth: 0.07, owner: null, partner: b.id });
        }
      }
    }
    // a few small holes farther out (only seen at a distance)
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = 0.6 + r() * 1.4;
      const volcano = r() < 0.5;
      this.burrows.push({ id: this.burrows.length, x: Math.cos(a) * d, z: Math.sin(a) * d, r: 0.005 + r() * 0.003, type: volcano ? 'nihonotrypaea' : 'upogebia', moundH: volcano ? 0.008 + r() * 0.008 : 0, moundR: volcano ? 0.035 + r() * 0.02 : 0, depth: 0.06, owner: null, far: true });
    }
    // worm-cast heaps (fine coiled sediment), shallow feeding pits
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = 0.08 + Math.sqrt(r()) * 0.9;
      this.casts.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, s: 0.004 + r() * 0.003, h: 0.0016 + r() * 0.0016, rot: r() * 6.28 });
    }
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2, d = 0.15 + r() * 0.7;
      const p = { x: Math.cos(a) * d, z: Math.sin(a) * d, R: 0.035 + r() * 0.03, D: 0.003 + r() * 0.003 };
      if (this.burrows.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < p.R + 0.03)) continue;
      this.pits.push(p);
    }
    // the rim height of each opening is the undisturbed surface there (its own mound included)
    for (const b of this.burrows) b.rimY = this._heightNoHoles(b.x, b.z) - 0.0012;
  }

  sandiness(x, z) {
    return smoothstep(-0.32, 0.42, this.noise2.fbm(x * 1.7 + 31.0, z * 1.7 - 12.0, 3));
  }

  _ripple(x, z, sand) {
    const n = this.noise;
    const cx = Math.cos(CURRENT_DIR), cz = Math.sin(CURRENT_DIR);
    const along = cx * x + cz * z;
    const warp = 1.9 * n.fbm(x * 3.2 + 5.1, z * 3.2 - 2.7, 3) + 0.5 * n.noise(x * 11.0, z * 11.0);
    const lambda = 0.061 + 0.006 * n.noise(x * 1.3 - 4, z * 1.3 + 8);
    const ph = along / lambda + warp;
    const u = ph - Math.floor(ph);
    // asymmetric current ripple: long stoss side, steep lee side
    const w = u < 0.68 ? u / 0.68 : (1 - u) / 0.32;
    const prof = 0.5 - 0.5 * Math.cos(Math.PI * w);
    // crests fade out in the mud and where the sediment has been reworked
    const amp = lerp(0.0004, 0.0036, sand) * clamp(0.55 + 0.6 * n.fbm(x * 2.3 + 40, z * 2.3 - 13, 2), 0.15, 1.1);
    return (prof - 0.5) * amp;
  }

  _heightNoHoles(x, z) {
    const n = this.noise;
    let h = 0.0065 * n.fbm(x * 0.9, z * 0.9, 3) - 0.0035 * (x * 0.6 + z * 0.3);
    const sand = this.sandiness(x, z);
    h += this._ripple(x, z, sand);
    h += 0.00045 * n.noise(x * 38.0 + 3.3, z * 38.0 - 1.1) * (0.4 + 0.6 * sand);
    for (const b of this.burrows) {
      if (!b.moundH) continue;
      const dx = x - b.x, dz = z - b.z, d2 = dx * dx + dz * dz;
      if (d2 > b.moundR * b.moundR * 1.6) continue;
      const d = Math.sqrt(d2);
      // ejecta volcano: rounded cone with lumpy flanks
      const t = 1 - smoothstep(b.r * 1.4, b.moundR * 1.2, d);
      h += b.moundH * Math.pow(t, 1.4) * (1 + 0.12 * n.noise(x * 160, z * 160));
    }
    for (const c of this.casts) {
      const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
      if (d2 > c.s * c.s * 12) continue;
      // coiled heap: a few overlapping blobs along a spiral
      let s = 0;
      for (let k = 0; k < 5; k++) {
        const a = c.rot + k * 1.9, rr = c.s * (0.15 + 0.22 * k);
        const ex = dx - Math.cos(a) * rr, ez = dz - Math.sin(a) * rr;
        s = Math.max(s, Math.exp(-(ex * ex + ez * ez) / (c.s * c.s * 0.35)) * (1 - 0.1 * k));
      }
      h += c.h * s;
    }
    for (const p of this.pits) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > p.R * 1.4) continue;
      const t = 1 - smoothstep(p.R * 0.3, p.R * 1.25, d);
      h -= p.D * t * t * (3 - 2 * t);
      h += p.D * 0.25 * Math.exp(-(((d - p.R * 1.15) / (p.R * 0.18)) ** 2)); // low rim of pushed-out mud
    }
    return h;
  }

  /** Ground height (m) at (x, z). */
  height(x, z) {
    let h = this._heightNoHoles(x, z);
    for (const b of this.burrows) {
      const dx = x - b.x, dz = z - b.z, d2 = dx * dx + dz * dz;
      const R = b.r * 3.2;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2);
      // funnel into the opening; Upogebia adds a low collar of pellets around it
      const w = 1 - smoothstep(b.r * 0.9, R, d);
      const funnel = b.rimY - 0.0028 * (1 - smoothstep(b.r, b.r * 2.0, d));
      h = lerp(h, funnel, w * w * (3 - 2 * w));
      if (b.type === 'upogebia') h += 0.0011 * Math.exp(-(((d - b.r * 1.7) / (b.r * 0.55)) ** 2));
    }
    return h;
  }

  /** Smoothed ground normal (averaged over `scale` metres). */
  normal(x, z, scale = 0.004, out = new THREE.Vector3()) {
    const e = scale;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  /** Burrow whose opening contains (x, z), or null. */
  holeAt(x, z, margin = 0) {
    for (const b of this.burrows) if (Math.hypot(x - b.x, z - b.z) < b.r + margin) return b;
    return null;
  }

  /** Per-vertex material parameters: sand, reduced (dark) sediment, diatom film, fresh ejecta. */
  materialAt(x, z) {
    const n = this.noise2;
    const sand = this.sandiness(x, z);
    let dark = 0, ejecta = 0;
    for (const b of this.burrows) {
      const d = Math.hypot(x - b.x, z - b.z);
      dark = Math.max(dark, 1 - smoothstep(b.r * 1.0, b.r * (b.type === 'upogebia' ? 2.6 : 2.0), d));
      if (b.moundH) ejecta = Math.max(ejecta, (1 - smoothstep(b.r * 1.5, b.moundR * 1.15, d)) * 0.9);
    }
    for (const p of this.pits) {
      const d = Math.hypot(x - p.x, z - p.z);
      dark = Math.max(dark, 0.35 * (1 - smoothstep(p.R * 0.2, p.R, d)));
    }
    const film = smoothstep(0.05, 0.55, n.fbm(x * 3.1 - 17, z * 3.1 + 5, 3)) * (1 - ejecta);
    return [sand * (1 - 0.6 * ejecta), dark, film, ejecta];
  }

  // ---------------------------------------------------------------------------------------- meshes
  build(shared) {
    const group = new THREE.Group();
    group.name = 'Mudflat';
    this.material = createTerrainMaterial(shared, this.burrows);
    this.mesh = new THREE.Mesh(this._terrainGeometry(), this.material);
    this.mesh.name = 'MudflatSurface';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -900;
    group.add(this.mesh);
    this.tubes = this._tubes(shared);
    group.add(this.tubes);
    return group;
  }

  _terrainGeometry() {
    const N = 640, R = this.radius;
    // dense at the centre (≈ 2.5 mm), coarse at the far edge
    const a = 0.15;
    const map = (u) => R * (a * u + (1 - a) * u * u * u);
    const verts = (N + 1) * (N + 1);
    const pos = new Float32Array(verts * 3);
    const mat = new Float32Array(verts * 4);
    let k = 0;
    for (let j = 0; j <= N; j++) {
      const z = map(-1 + (2 * j) / N);
      for (let i = 0; i <= N; i++) {
        const x = map(-1 + (2 * i) / N);
        pos[k * 3] = x;
        pos[k * 3 + 1] = this.height(x, z);
        pos[k * 3 + 2] = z;
        const m = this.materialAt(x, z);
        mat[k * 4] = m[0]; mat[k * 4 + 1] = m[1]; mat[k * 4 + 2] = m[2]; mat[k * 4 + 3] = m[3];
        k++;
      }
    }
    const idx = new Uint32Array(N * N * 6);
    let t = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const v0 = j * (N + 1) + i, v1 = v0 + 1, v2 = v0 + N + 1, v3 = v2 + 1;
        idx[t++] = v0; idx[t++] = v2; idx[t++] = v1;
        idx[t++] = v1; idx[t++] = v2; idx[t++] = v3;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  // dark burrow shafts below each opening; the wall flares out just under the surface around the hole so
  // there is never a gap between the cut-out surface and the shaft
  _tubes(shared) {
    const mat = new THREE.ShaderMaterial({
      name: 'BurrowShaft',
      uniforms: { ...shared },
      vertexShader: /* glsl */ `
        attribute float aDepth;
        varying vec3 vWorldPos;
        varying vec3 vN;
        varying float vDepth;
        void main() {
          vDepth = aDepth;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        ${commonGLSL}
        ${noiseGLSL}
        varying vec3 vWorldPos;
        varying vec3 vN;
        varying float vDepth;
        void main() {
          // burrow lining: reduced grey mud, light falls off quickly down the shaft
          vec3 alb = vec3(0.075, 0.072, 0.066) * (0.75 + 0.5 * vnoise(vWorldPos.xz * 2500.0 + vWorldPos.y * 900.0));
          float lightIn = exp(-vDepth * 70.0);
          vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
          vec3 L = normalize(uLightDir);
          float caus = causticsAt(vWorldPos);
          vec3 col = alb * (uLightColor * caus * max(dot(N, L), 0.0) * INV_PI * exp(-vDepth * 160.0) + ambientIrr(vec3(0.0, 1.0, 0.0)) * lightIn);
          col = applyFogAt(col, vWorldPos);
          gl_FragColor = vec4(col, length(cameraPosition - vWorldPos));
        }
      `,
      side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    group.name = 'BurrowShafts';
    const SEG = 28;
    for (const b of this.burrows) {
      // rings: flare (under the surface, out to 2.2 r) then the vertical shaft
      const rings = [];
      for (let i = 0; i <= 4; i++) rings.push({ rad: b.r * (2.2 - 1.2 * (i / 4)), flare: true });
      const SHAFT = 12;
      for (let i = 1; i <= SHAFT; i++) rings.push({ rad: b.r * (1 - 0.08 * (i / SHAFT)), depth: (i / SHAFT) ** 1.6 * b.depth });
      const pos = [], depth = [];
      for (const ring of rings) {
        for (let s = 0; s <= SEG; s++) {
          const a = (s / SEG) * Math.PI * 2;
          const x = b.x + Math.cos(a) * ring.rad, z = b.z + Math.sin(a) * ring.rad;
          let y;
          if (ring.flare) y = this.height(x, z) - 0.0006;
          else {
            const top = this.height(b.x + Math.cos(a) * b.r, b.z + Math.sin(a) * b.r) - 0.0006;
            y = top - ring.depth;
          }
          pos.push(x, y, z);
          depth.push(ring.flare ? 0 : ring.depth);
        }
      }
      const idx = [];
      for (let r = 0; r < rings.length - 1; r++) {
        for (let s = 0; s < SEG; s++) {
          const v0 = r * (SEG + 1) + s, v1 = v0 + 1, v2 = v0 + SEG + 1, v3 = v2 + 1;
          idx.push(v0, v2, v1, v1, v2, v3);
        }
      }
      // closing cap at the bottom (dark)
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = -901;
      group.add(m);
    }
    return group;
  }
}

function createTerrainMaterial(shared, burrows) {
  const holes = Array.from({ length: MAX_HOLES }, (_, i) => {
    const b = burrows.filter((x) => !x.far)[i];
    return b ? new THREE.Vector4(b.x, b.z, b.r, 1) : new THREE.Vector4(1e4, 1e4, 0, 0);
  });
  const far = burrows.filter((x) => x.far).map((b) => new THREE.Vector4(b.x, b.z, b.r, 1));
  while (far.length < 16) far.push(new THREE.Vector4(1e4, 1e4, 0, 0));
  return new THREE.ShaderMaterial({
    name: 'MudflatSurface',
    uniforms: {
      ...shared,
      uHoles: { value: holes.concat(far.slice(0, 16)) },
      uShadow: { value: Array.from({ length: MAX_FISH * 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uCore: { value: Array.from({ length: MAX_FISH * 7 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uFishB: { value: Array.from({ length: MAX_FISH }, () => new THREE.Vector4(0, 0, 0, 0)) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aMat;
      varying vec3 vWorldPos;
      varying vec3 vN;
      varying vec4 vMat;
      void main() {
        vMat = aMat;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      ${noiseGLSL}
      #define MAX_FISH ${MAX_FISH}
      uniform vec4 uHoles[32];
      uniform vec4 uShadow[MAX_FISH * 8];
      uniform vec4 uCore[MAX_FISH * 7];
      uniform vec4 uFishB[MAX_FISH];   // bounding sphere of each fish (w = 0: none)
      uniform int uDebug;
      varying vec3 vWorldPos;
      varying vec3 vN;
      varying vec4 vMat;

      // grain field: (distance to grain centre / cell, two ids) and the offset to the centre
      vec3 grains(vec2 p, out vec2 off) {
        vec2 ip = floor(p), fp = fract(p);
        float best = 9.0; vec2 id = vec2(0.0); off = vec2(0.0);
        for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash22(ip + g);
          vec2 r = g + o * 0.8 + 0.1 - fp;
          float d = dot(r, r);
          if (d < best) { best = d; id = ip + g; off = r; }
        }
        return vec3(sqrt(best), hash22(id * 1.37).x, hash22(id * 3.11).y);
      }
      float capsuleOcc(vec4 A, vec4 B, vec3 p, vec3 L, float soft) {
        if (A.w <= 0.0 || B.w <= 0.0) return 0.0;
        vec3 ab = B.xyz - A.xyz, ap = A.xyz - p;
        float abL = dot(ab, L), abab = dot(ab, ab), apL = dot(ap, L), apab = dot(ap, ab);
        float den = abab - abL * abL;
        float u = den > 1e-12 ? clamp((abL * apL - apab) / den, 0.0, 1.0) : 0.0;
        vec3 q = A.xyz + ab * u;
        float t = dot(q - p, L);
        if (t <= 0.0) return 0.0;
        float d = length(q - p - L * t);
        float r = mix(A.w, B.w, u);
        float pen = r + t * soft;
        return smoothstep(pen * 1.15, pen * 0.15, d) * clamp(r / pen * 1.6, 0.0, 1.0);
      }
      // soft translucent shadows of the gobies (capsules along the spine) with a darker core (spine, viscera)
      vec2 fishShadow(vec3 p, vec3 L) {
        float occ = 0.0, core = 0.0;
        for (int f = 0; f < MAX_FISH; f++) {
          vec4 B = uFishB[f];
          if (B.w <= 0.0) continue;
          vec3 c = B.xyz - p;
          float t = dot(c, L);
          if (t < -B.w) continue;
          if (length(c - L * max(t, 0.0)) > B.w + max(t, 0.0) * 0.14 + 0.002) continue;
          for (int i = 0; i < 7; i++) occ = max(occ, capsuleOcc(uShadow[f * 8 + i], uShadow[f * 8 + i + 1], p, L, 0.14));
          for (int i = 0; i < 4; i++) core = max(core, 0.75 * capsuleOcc(uCore[f * 7 + i], uCore[f * 7 + i + 1], p, L, 0.1));
          core = max(core, 0.9 * capsuleOcc(uCore[f * 7 + 5], uCore[f * 7 + 6], p, L, 0.12));
        }
        return vec2(occ, core);
      }

      void main() {
        vec3 p = vWorldPos;
        float holeRim = 0.0;
        for (int i = 0; i < 32; i++) {
          vec4 H = uHoles[i];
          if (H.w <= 0.0) continue;
          float d = distance(p.xz, H.xy);
          if (d < H.z) discard;
          holeRim = max(holeRim, 1.0 - smoothstep(H.z, H.z * 1.35, d));
        }
        float dist = length(cameraPosition - p);
        vec2 mm = p.xz * 1000.0;
        float fw = max(length(fwidth(mm)), 1e-4);
        float sand = clamp(vMat.x, 0.0, 1.0), dark = clamp(vMat.y, 0.0, 1.0), film = clamp(vMat.z, 0.0, 1.0), ejecta = clamp(vMat.w, 0.0, 1.0);

        // ---- albedo: grey-brown mud, beige fine sand, dark reduced mud around the openings
        vec3 mud = vec3(0.165, 0.148, 0.118), sandC = vec3(0.36, 0.318, 0.245), reduced = vec3(0.06, 0.059, 0.055), fresh = vec3(0.25, 0.235, 0.205);
        float mott = fbm(mm * 0.012, 4);
        float mott2 = fbm(mm * 0.055 + 3.0, 3);
        vec3 alb = mix(mud, sandC, smoothstep(0.1, 0.9, sand + (mott - 0.5) * 0.35));
        alb *= 0.8 + 0.4 * mott2;
        alb = mix(alb, fresh * (0.85 + 0.3 * mott2), ejecta * 0.85);
        alb = mix(alb, reduced, dark * 0.8);
        // diatom film: golden-brown bloom on the undisturbed surface, patchy
        float filmP = film * smoothstep(0.35, 0.75, fbm(mm * 0.03 - 11.0, 4));
        alb *= mix(vec3(1.0), vec3(0.78, 0.68, 0.42), filmP * 0.75);

        // ---- grains (sand fraction): medium and coarse rounded grains on a silty base
        vec2 o1, o2, o3;
        vec3 g3 = grains(mm / 0.09 + 5.0, o3);
        vec3 g1 = grains(mm / 0.22, o1);
        vec3 g2 = grains(mm / 0.52 + 17.0, o2);
        float detail3 = 1.0 - smoothstep(0.1, 0.35, fw * 0.5 / 0.09);
        float detail1 = 1.0 - smoothstep(0.1, 0.35, fw * 0.5 / 0.22);
        float detail2 = 1.0 - smoothstep(0.1, 0.35, fw * 0.5 / 0.52);
        float grainy = sand * (1.0 - dark) * (1.0 - 0.6 * filmP);
        vec3 quartz = vec3(0.62, 0.6, 0.56), shell = vec3(0.55, 0.49, 0.42), black = vec3(0.07, 0.068, 0.065);
        alb *= mix(1.0, 0.85 + 0.3 * g3.y, detail3 * 0.6);
        vec3 c1 = alb * (0.8 + 0.5 * g1.y);
        c1 = g1.z > 0.965 ? black : (g1.z > 0.88 ? quartz : (g1.z > 0.83 ? shell : c1));
        vec3 c2 = alb * (0.75 + 0.6 * g2.y);
        c2 = g2.z > 0.95 ? black : (g2.z > 0.86 ? quartz : (g2.z > 0.8 ? shell : c2));
        float r1 = 0.3 + 0.17 * fract(g1.y * 7.3), r2 = 0.24 + 0.2 * fract(g2.y * 5.1);
        float has1 = step(0.25, fract(g1.z * 3.7)) * grainy, has2 = step(0.55, fract(g2.z * 2.9)) * grainy;
        float disc1 = smoothstep(r1, r1 - 0.07, g1.x) * detail1 * has1;
        float disc2 = smoothstep(r2, r2 - 0.05, g2.x) * detail2 * has2;
        float ring1 = (smoothstep(r1 + 0.14, r1, g1.x) - smoothstep(r1, r1 - 0.07, g1.x)) * detail1 * has1;
        float ring2 = (smoothstep(r2 + 0.12, r2, g2.x) - smoothstep(r2, r2 - 0.05, g2.x)) * detail2 * has2;
        alb *= 1.0 - 0.16 * max(ring1, 0.0) - 0.2 * max(ring2, 0.0);
        alb = mix(alb, c1, disc1);
        alb = mix(alb, c2, disc2);
        // mud: faecal pellets (small dark ovals) and smooth silt
        vec2 o4;
        vec3 g4 = grains(mm / 0.7 + 41.0, o4);
        float pel = smoothstep(0.3, 0.2, length(o4 * vec2(1.0, 1.9))) * step(0.72, g4.z) * (1.0 - sand) * (1.0 - smoothstep(0.1, 0.4, fw * 0.5 / 0.7));
        alb = mix(alb, mud * 0.62, pel * 0.8);

        // ---- normal: geometry + micro relief (silt lumps, grain domes, pellets)
        vec3 N = normalize(vN);
        vec3 nd = vnoiseD(mm * 0.35) * 0.5 + vnoiseD(mm * 1.1 + 7.0) * 0.25;
        float bump = (1.0 - smoothstep(0.2, 1.2, fw * 0.35)) * (0.18 + 0.1 * (1.0 - sand));
        N = normalize(N - vec3(nd.y, 0.0, nd.z) * bump);
        N = normalize(N + vec3(-o1.x, 0.0, -o1.y) / r1 * 0.9 * disc1 * (1.0 - disc2) + vec3(-o2.x, 0.0, -o2.y) / r2 * disc2 + vec3(-o4.x, 0.0, -o4.y) * 1.4 * pel);

        // ---- light: refracted sun with caustics and the gobies' shadows, sky through the surface, bounce
        vec3 L = normalize(uLightDir);
        vec3 caus3 = mix(vec3(1.0), causticsAt3(p), uCausticAmt);
        float caus = caus3.g;
        vec2 sh = fishShadow(p, L);
        vec3 shadowTint = mix(vec3(1.0), vec3(0.42, 0.36, 0.28), sh.x) * mix(vec3(1.0), vec3(0.3, 0.27, 0.24), sh.y);
        vec3 Lc = uLightColor * caus3 * shadowTint;
        float ndl = max(dot(N, L), 0.0);
        // a little self-shadowing in the hollows of the ripples and grain gaps
        float ao = 1.0 - 0.35 * holeRim - 0.15 * max(ring1, 0.0);
        vec3 col = alb * (Lc * ndl * INV_PI + ambientIrr(N) * ao * (1.0 - sh.x * 0.25));
        // wet sheen of the organic film and sparkle of quartz / shell grains
        vec3 V = normalize(cameraPosition - p);
        col += uLightColor * caus * specGGX(N, V, L, 0.38, 0.02) * 0.25 * (0.4 + 0.6 * filmP) * shadowTint;
        float sparkle = (disc1 * step(0.83, g1.z) * step(g1.z, 0.93) + disc2 * step(0.8, g2.z) * step(g2.z, 0.9)) * pow(max(dot(reflect(-L, N), V), 0.0), 80.0);
        col += uLightColor * sparkle * 0.18 * caus * shadowTint;
        col = applyFogAt(col, p);
        if (uDebug == 4) col = normalize(vN) * 0.5 + 0.5;
        else if (uDebug == 5) col = vMat.xyz;
        else if (uDebug == 6) col = vec3(ndl, caus * 0.3, sh.x);
        else if (uDebug == 7) col = vec3(causticsAt(p) * 0.25);
        gl_FragColor = vec4(col, dist);
      }
    `,
  });
}
