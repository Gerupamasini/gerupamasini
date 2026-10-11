// Underwater surroundings: water-column background with Snell's window and light shafts,
// a fine-grained sand floor with caustics and the goby's soft translucent shadow, and drifting
// marine snow. All shaders output the view distance in alpha (used by the body's refraction).
import * as THREE from 'three';
import { commonGLSL } from '../materials/common.glsl.js';

const BG_FAR = 3.0;

export function createBackground(shared) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mat = new THREE.ShaderMaterial({
    name: 'WaterBackground',
    uniforms: { ...shared, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uFar: { value: BG_FAR } },
    vertexShader: /* glsl */ `
      varying vec2 vNdc;
      void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      uniform mat4 uInvProj;
      uniform mat4 uCamWorld;
      uniform float uFar;
      varying vec2 vNdc;
      void main() {
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize(mat3(uCamWorld) * (v.xyz / v.w));
        vec3 c = waterEnv(d, 0.0);
        // light shafts converging toward the light direction
        vec3 Ld = normalize(uLightDir);
        float sd = max(dot(d, Ld), 0.0);
        vec3 side = normalize(cross(Ld, vec3(0.0, 1.0, 0.001)));
        vec3 upv = cross(side, Ld);
        float ang = atan(dot(d, upv), dot(d, side));
        float shafts = 0.5 + 0.5 * sin(ang * 23.0 + sin(ang * 7.0 + uTime * 0.2) * 2.0 + uTime * 0.15);
        shafts *= 0.5 + 0.5 * sin(ang * 51.0 - uTime * 0.11);
        c += uLightColor * pow(sd, 3.0) * shafts * 0.035 * smoothstep(0.0, 0.3, d.y);
        gl_FragColor = vec4(c, uFar);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (r, s, camera) => {
    mat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    mat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
  };
  return mesh;
}

export function createFloor(shared, y) {
  const geo = new THREE.PlaneGeometry(8, 8, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    name: 'SandFloor',
    uniforms: {
      ...shared,
      uShadow: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uCore: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uCausticAmt: shared.uCausticAmt,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
    `,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      uniform vec4 uShadow[8];
      uniform vec4 uCore[8];   // 0-4: vertebral column chain, 5-6: viscera capsule (radius in w)
      uniform float uCausticAmt;
      varying vec3 vWorldPos;

      vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }
      // grain field: returns (distance to grain centre / radius, grain id)
      vec3 grains(vec2 p, out vec2 off) {
        vec2 ip = floor(p), fp = fract(p);
        float best = 9.0; vec2 id = vec2(0.0); off = vec2(0.0);
        for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash2(ip + g);
          vec2 r = g + o * 0.8 + 0.1 - fp;
          float d = dot(r, r);
          if (d < best) { best = d; id = ip + g; off = r; }
        }
        return vec3(sqrt(best), hash2(id * 1.37).x, hash2(id * 3.11).y);
      }
      // occlusion of the light ray p + L t by a capsule A–B (radius in w), softened with distance
      float capsuleOcc(vec4 A, vec4 B, vec3 p, vec3 L, float soft) {
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
      // the spine and the viscera block the light inside the translucent body: a darker core
      float coreShadow(vec3 p, vec3 L) {
        float occ = 0.0;
        for (int i = 0; i < 4; i++) occ = max(occ, 0.75 * capsuleOcc(uCore[i], uCore[i + 1], p, L, 0.1));
        occ = max(occ, 0.9 * capsuleOcc(uCore[5], uCore[6], p, L, 0.12));
        return occ;
      }
      // soft, translucent shadow of the goby: capsule chain along its axis (radius in w)
      float softShadow(vec3 p, vec3 L) {
        float occ = 0.0;
        for (int i = 0; i < 7; i++) {
          vec4 A = uShadow[i], B = uShadow[i + 1];
          if (A.w <= 0.0 || B.w <= 0.0) continue;
          vec3 ab = B.xyz - A.xyz, ap = A.xyz - p;
          float abL = dot(ab, L), abab = dot(ab, ab), apL = dot(ap, L), apab = dot(ap, ab);
          float den = abab - abL * abL;
          float u = den > 1e-12 ? clamp((abL * apL - apab) / den, 0.0, 1.0) : 0.0;
          vec3 q = A.xyz + ab * u;
          float t = dot(q - p, L);
          if (t <= 0.0) continue;
          float d = length(q - p - L * t);
          float r = mix(A.w, B.w, u);
          float pen = r + t * 0.14;
          occ = max(occ, smoothstep(pen * 1.15, pen * 0.15, d) * clamp(r / pen * 1.6, 0.0, 1.0));
        }
        return occ;
      }
      void main() {
        vec3 p = vWorldPos;
        vec2 mm = p.xz * 1000.0;
        float dist = length(cameraPosition - p);
        float fw = length(fwidth(mm));
        // sand: silty base layer + medium and coarse rounded grains lying on it
        vec2 o1, o2, o3;
        vec3 g3 = grains(mm / 0.09 + 5.0, o3);
        vec3 g1 = grains(mm / 0.22, o1);
        vec3 g2 = grains(mm / 0.52 + 17.0, o2);
        float detail3 = 1.0 - smoothstep(0.1, 0.35, fw * 0.5 / 0.09);
        float detail1 = 1.0 - smoothstep(0.1, 0.35, fw * 0.5 / 0.22);
        float detail2 = 1.0 - smoothstep(0.1, 0.35, fw * 0.5 / 0.52);
        vec3 sandA = vec3(0.3, 0.27, 0.22), sandB = vec3(0.5, 0.47, 0.41), dark = vec3(0.16, 0.15, 0.14), quartz = vec3(0.7, 0.69, 0.66), shell = vec3(0.62, 0.54, 0.47);
        float mott = 0.5 + 0.5 * sin(mm.x * 0.031 + sin(mm.y * 0.023) * 2.3) * sin(mm.y * 0.027 - mm.x * 0.011);
        vec3 avg = mix(sandA, sandB, 0.42 + 0.2 * mott);
        vec3 alb = mix(avg, mix(sandA, sandB, 0.25 + 0.5 * g3.y) * (0.9 + 0.2 * mott), detail3 * 0.7);
        vec3 c1 = mix(sandA * 1.1, sandB * 1.05, g1.y);
        c1 = g1.z > 0.965 ? dark : (g1.z > 0.87 ? quartz : (g1.z > 0.82 ? shell : c1));
        vec3 c2 = mix(sandA, sandB * 1.1, g2.y);
        c2 = g2.z > 0.95 ? dark : (g2.z > 0.85 ? quartz : (g2.z > 0.79 ? shell : c2));
        float r1 = 0.3 + 0.17 * fract(g1.y * 7.3);
        float r2 = 0.24 + 0.2 * fract(g2.y * 5.1);
        float has1 = step(0.22, fract(g1.z * 3.7));
        float has2 = step(0.5, fract(g2.z * 2.9));
        float disc1 = smoothstep(r1, r1 - 0.07, g1.x) * detail1 * has1;
        float disc2 = smoothstep(r2, r2 - 0.05, g2.x) * detail2 * has2;
        float ring1 = (smoothstep(r1 + 0.14, r1, g1.x) - smoothstep(r1, r1 - 0.07, g1.x)) * detail1 * has1;
        float ring2 = (smoothstep(r2 + 0.12, r2, g2.x) - smoothstep(r2, r2 - 0.05, g2.x)) * detail2 * has2;
        alb *= 1.0 - 0.18 * ring1 - 0.22 * ring2;
        alb = mix(alb, c1, disc1);
        alb = mix(alb, c2, disc2);
        float edge1 = 1.0 - disc1, edge2 = 1.0 - disc2;
        // long, low ripples
        float ph = mm.x * 0.085 + sin(mm.y * 0.021) * 2.4 + sin(mm.y * 0.05 + mm.x * 0.01) * 0.6;
        vec3 N = normalize(vec3(cos(ph) * 0.07, 1.0, sin(mm.y * 0.021) * 0.02));
        // grain domes
        N = normalize(N + vec3(-o1.x, 0.0, -o1.y) / r1 * 0.9 * disc1 * (1.0 - disc2) + vec3(-o2.x, 0.0, -o2.y) / r2 * 1.0 * disc2);
        vec3 L = normalize(uLightDir);
        float caus = mix(1.0, caustics(p.xz * 180.0 - L.xz / max(L.y, 0.2) * p.y * 180.0), uCausticAmt * 2.0);
        float occ = softShadow(p, L);
        float core = uCore[5].w > 0.0 ? coreShadow(p, L) : 0.0;
        vec3 shadowTint = mix(vec3(1.0), vec3(0.45, 0.37, 0.28), occ) * mix(vec3(1.0), vec3(0.3, 0.27, 0.24), core);   // translucent body -> warm, soft shadow; spine + viscera darker
        vec3 Lc = uLightColor * caus * shadowTint;
        float ndl = max(dot(N, L), 0.0);
        vec3 col = alb * (Lc * ndl * INV_PI + ambientIrr(N) * (1.0 - occ * 0.2));
        float sparkle = (disc1 * step(0.82, g1.z) * step(g1.z, 0.92) + disc2 * step(0.8, g2.z) * step(g2.z, 0.9)) * pow(max(dot(reflect(-L, N), normalize(cameraPosition - p)), 0.0), 80.0);
        col += uLightColor * sparkle * 0.12 * caus;
        // fade into the water column: scattering haze toward the background radiance
        vec3 vd = normalize(p - cameraPosition);
        col = mix(waterEnv(vd, 0.0), col, exp(-dist * 2.6));
        gl_FragColor = vec4(col, dist);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  mesh.renderOrder = -900;
  return mesh;
}

export function createParticles(shared, count = 900) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 0.3;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.14;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    name: 'MarineSnow',
    uniforms: { ...shared, uPxScale: { value: 1000 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uPxScale;
      varying float vSeed;
      varying vec3 vWorldPos;
      void main() {
        vSeed = seed;
        vec3 p = position;
        p.y = mod(p.y - uTime * (0.0006 + seed * 0.0012) + 0.07, 0.14) - 0.07;
        p.x += sin(uTime * 0.2 + seed * 40.0) * 0.002;
        p.z += cos(uTime * 0.17 + seed * 23.0) * 0.002;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        float size = (0.00008 + 0.00022 * seed * seed);
        gl_PointSize = clamp(size * uPxScale / -mv.z, 1.0, 48.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      varying float vSeed;
      varying vec3 vWorldPos;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0) discard;
        float a = exp(-r * 3.0);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ph = hgPhase(dot(-normalize(uLightDir), V), 0.7) * 4.0 * PI;
        vec3 col = (uLightColor * ph * 0.05 + ambientIrr(vec3(0.0, 1.0, 0.0)) * 0.6) * a * (0.35 + 0.65 * vSeed);
        float fog = exp(-length(cameraPosition - vWorldPos) * uFogDensity * 3.0);
        gl_FragColor = vec4(col * fog * 0.6, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5000;
  return pts;
}

export { BG_FAR };
