// The 10 cm water layer: sky, the rippled surface seen from below (Snell's window and the total internal
// reflection of the flat around it) and from above (sky reflection, sun glint, refracted view of the
// bottom), and the background behind everything under water.
import * as THREE from 'three';
import { commonGLSL } from '../materials/common.glsl.js';
import { noiseGLSL } from './noise.js';
import { N_WAVES } from './waves.js';

export const SKY_UNIFORMS = () => ({
  uSunDir: { value: new THREE.Vector3(0.4, 0.75, 0.3).normalize() }, // in air
  uSunRad: { value: new THREE.Vector3(3.3, 3.15, 2.9) },               // sun irradiance (normal incidence)
  uSkyZenith: { value: new THREE.Vector3(0.12, 0.22, 0.46) },
  uSkyHorizon: { value: new THREE.Vector3(0.45, 0.51, 0.57) },
  uFarShore: { value: new THREE.Vector3(0.2, 0.21, 0.18) },
});

// Analytic daylight sky (air): zenith-to-horizon gradient, sun disk and aureole, a few soft cumulus
export const skyGLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunRad;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uFarShore;
vec3 skyRadiance(vec3 d, float rough) {
  vec3 S = normalize(uSunDir);
  float y = d.y;
  float mu = dot(d, S);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(clamp(y, 0.0, 1.0), 0.45));
  // brighter, whiter sky around the sun (Mie aureole)
  c += uSunRad * (0.05 * pow(max(mu, 0.0), 10.0) + 0.012 * pow(max(mu, 0.0), 2.0));
  // clouds: soft fBm on a plane high above
  if (y > 0.02) {
    vec2 cp = d.xz / (y + 0.08) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
    float cl = smoothstep(0.55, 0.85, fbm(cp, 5));
    vec3 cloud = mix(vec3(1.0), vec3(0.72, 0.75, 0.8), smoothstep(0.6, 1.0, fbm(cp * 1.7 + 3.0, 3))) * (uSkyHorizon * 1.15 + uSunRad * 0.04 * pow(max(mu, 0.0), 6.0));
    c = mix(c, cloud, cl * smoothstep(0.02, 0.2, y));
  }
  // below the horizon: far shore / reflections at grazing incidence
  if (y < 0.0) c = mix(uSkyHorizon * 0.9, uFarShore, smoothstep(0.0, -0.05, y));
  // sun: a normalised lobe whose width follows the roughness (sharp disk → broad glint)
  float a = rough * rough;
  float n = min(2.0 / (a * a + 3.3e-5), 60000.0);
  c += uSunRad * (n + 2.0) / (2.0 * PI) * pow(max(mu, 0.0), n);
  return c;
}
`;

/** Fullscreen background under water: turbid water with forward-scattered sun glow (only seen far away). */
export function createUnderwaterBackground(shared) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mat = new THREE.ShaderMaterial({
    name: 'TurbidWater',
    uniforms: { ...shared, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() } },
    vertexShader: /* glsl */ `
      varying vec2 vNdc;
      void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      uniform mat4 uInvProj;
      uniform mat4 uCamWorld;
      varying vec2 vNdc;
      void main() {
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize(mat3(uCamWorld) * (v.xyz / v.w));
        gl_FragColor = vec4(fogRadiance(d), 6.0);
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

/** Fullscreen sky for cameras above the water. */
export function createSkyBackground(shared, sky) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mat = new THREE.ShaderMaterial({
    name: 'Sky',
    uniforms: { ...shared, ...sky, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() } },
    vertexShader: /* glsl */ `
      varying vec2 vNdc;
      void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      ${noiseGLSL}
      ${skyGLSL}
      uniform mat4 uInvProj;
      uniform mat4 uCamWorld;
      varying vec2 vNdc;
      void main() {
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize(mat3(uCamWorld) * (v.xyz / v.w));
        gl_FragColor = vec4(skyRadiance(d, 0.0), 1.0);
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

// Polar grid around the camera: rings from 5 mm to `far` metres, so the ripples are resolved close by.
function surfaceGeometry(far = 9, rings = 150, segs = 192) {
  const pos = [];
  const r0 = 0.004;
  pos.push(0, 0, 0);
  for (let i = 0; i < rings; i++) {
    const r = r0 * Math.pow(far / r0, i / (rings - 1));
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const idx = [];
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < segs; s++) {
      const a = 1 + i * segs + s, b = 1 + i * segs + ((s + 1) % segs);
      const c = a + segs, d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

const surfaceVS = /* glsl */ `
  uniform float uWaterY;
  uniform float uTime;
  uniform vec4 uWaveA[${N_WAVES}];
  uniform vec4 uWaveB[${N_WAVES}];
  uniform float uWaveGain;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // displace with the long components only (the mesh cannot carry the short ones far away)
    float spacing = max(length(position.xz) * 0.035, 0.002);
    float h = 0.0;
    for (int i = 0; i < ${N_WAVES}; i++) {
      vec4 A = uWaveA[i];
      float lam = 6.2831853 / A.z;
      float f = smoothstep(spacing * 3.0, spacing * 6.0, lam);
      h += A.w * uWaveGain * f * sin(A.z * dot(A.xy, wp.xz) - uWaveB[i].x * uTime + uWaveB[i].y);
    }
    wp.y = uWaterY + h;
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// cheap version of the sediment for reflections in the underside of the surface
const bottomGLSL = /* glsl */ `
vec3 bottomRadiance(vec3 h) {
  vec2 q = h.xz;
  float m = fbm(q * 9.0, 4);
  vec3 alb = mix(vec3(0.165, 0.148, 0.118), vec3(0.34, 0.3, 0.235), smoothstep(0.35, 0.65, fbm(q * 1.7 + 31.0, 3))) * (0.8 + 0.4 * m);
  vec3 L = normalize(uLightDir);
  float caus = mix(1.0, causticsAt(h), uCausticAmt);
  return alb * (uLightColor * caus * L.y * INV_PI + ambientIrr(vec3(0.0, 1.0, 0.0)));
}
`;

/** Surface seen from below (opaque; drawn in the background pass so the fish refract it too). */
export function createSurfaceBelow(shared, sky) {
  const mat = new THREE.ShaderMaterial({
    name: 'WaterSurfaceBelow',
    uniforms: { ...shared, ...sky, uRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 } },
    vertexShader: surfaceVS,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      ${noiseGLSL}
      ${skyGLSL}
      ${bottomGLSL}
      uniform sampler2D uRefl;     // the gobies seen in the mirror of the surface (planar reflection, alpha = coverage)
      uniform mat4 uReflMat;
      uniform float uReflOn;
      varying vec3 vWorldPos;
      void main() {
        vec3 p = vWorldPos;
        float fp = length(fwidth(p));
        vec3 g = waveGrad(p.xz, uTime, fp * 4.0);
        // capillary detail
        vec3 nd = vnoiseD(p.xz * 160.0 + vec2(uTime * 0.9, -uTime * 0.6)) * 0.004 * (1.0 - smoothstep(0.0005, 0.003, fp));
        vec3 n = normalize(vec3(-g.y - nd.y, 1.0, -g.z - nd.z));
        vec3 V = normalize(p - cameraPosition);     // looking up
        vec3 nd2 = -n;                               // normal facing the viewer (into the water)
        float cosI = max(dot(-V, nd2), 0.0);
        vec3 T = refract(V, nd2, 1.0 / 1.333);
        float F = 1.0;
        vec3 col = vec3(0.0);
        if (dot(T, T) > 0.0) {
          // Fresnel water → air (exact for unpolarised light)
          float cosT = sqrt(max(1.0 - (1.0 / 1.333) * (1.0 / 1.333) * (1.0 - cosI * cosI), 0.0));
          float rs = (1.333 * cosI - cosT) / (1.333 * cosI + cosT);
          float rp = (1.333 * cosT - cosI) / (1.333 * cosT + cosI);
          F = clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
          col += skyRadiance(T, clamp(fp * 40.0, 0.0, 0.3)) * (1.0 - F) * 1.777; // radiance is compressed into the window (n²)
        }
        // reflection: total internal reflection outside Snell's window mirrors the flat
        vec3 R = reflect(V, nd2);
        float t = (p.y - 0.0) / max(-R.y, 0.02);
        vec3 h = p + R * t;
        vec3 refl = bottomRadiance(h);
        float fogR = exp(-t * uFogDensity);
        refl = mix(fogRadiance(R), refl, fogR);
        if (uReflOn > 0.5) {
          // the ripples bend the mirror image (offset grows with the distance of what is reflected)
          vec4 rc = uReflMat * vec4(p.x - n.x * 0.06, uWaterY, p.z - n.z * 0.06, 1.0);
          vec4 fr = texture(uRefl, rc.xy / rc.w);
          refl = mix(refl, fr.rgb, clamp(fr.a, 0.0, 1.0));
        }
        col += refl * F;
        col = applyFogAt(col, p);
        gl_FragColor = vec4(col, length(cameraPosition - p));
      }
    `,
    side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(surfaceGeometry(), mat);
  mesh.name = 'WaterSurfaceBelow';
  mesh.frustumCulled = false;
  mesh.renderOrder = -950;
  return mesh;
}

/** Surface seen from above: drawn last over the resolved underwater image (uUnder). */
export function createSurfaceAbove(shared, sky) {
  const mat = new THREE.ShaderMaterial({
    name: 'WaterSurfaceAbove',
    uniforms: { ...shared, ...sky, uUnder: { value: null }, uUnderDist: { value: null } },
    vertexShader: surfaceVS,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      ${noiseGLSL}
      ${skyGLSL}
      uniform mat4 projectionMatrix;
      uniform sampler2D uUnder;
      uniform sampler2D uUnderDist;   // background pass: view distance in alpha
      uniform vec2 uResolution;
      varying vec3 vWorldPos;
      void main() {
        vec3 p = vWorldPos;
        float fp = length(fwidth(p));
        vec3 g = waveGrad(p.xz, uTime, fp * 4.0);
        vec3 nd = vnoiseD(p.xz * 160.0 + vec2(uTime * 0.9, -uTime * 0.6)) * 0.004 * (1.0 - smoothstep(0.0005, 0.003, fp));
        vec3 n = normalize(vec3(-g.y - nd.y, 1.0, -g.z - nd.z));
        vec3 V = normalize(p - cameraPosition);   // looking down
        float cosI = max(dot(-V, n), 1e-3);
        float cosT = sqrt(max(1.0 - (1.0 - cosI * cosI) / (1.333 * 1.333), 0.0));
        float rs = (cosI - 1.333 * cosT) / (cosI + 1.333 * cosT);
        float rp = (cosT - 1.333 * cosI) / (cosT + 1.333 * cosI);
        float F = clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
        vec3 R = reflect(V, n);
        float rough = clamp(fp * 30.0, 0.0, 0.25);
        vec3 refl = skyRadiance(R, rough);
        // refraction: bend the screen lookup of the underwater image with the surface slope; the shift grows
        // with the distance to what lies below (sampled once, then refined)
        vec2 suv = gl_FragCoord.xy / uResolution;
        float below = max(texture(uUnderDist, suv).a - length(cameraPosition - p), 0.0);
        vec3 T = refract(V, n, 1.0 / 1.333);
        vec3 T0 = refract(V, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
        vec3 off = (T - T0) * min(below, 0.25);
        vec4 c0 = projectionMatrix * viewMatrix * vec4(p + T0 * below + off, 1.0);
        vec4 c1 = projectionMatrix * viewMatrix * vec4(p + T0 * below, 1.0);
        vec2 duv = (c0.xy / c0.w - c1.xy / c1.w) * 0.5;
        vec2 ruv = clamp(suv + duv, vec2(0.001), vec2(0.999));
        vec3 under = textureLod(uUnder, ruv, 0.0).rgb;
        vec3 col = refl * F + under * (1.0 - F);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.FrontSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(surfaceGeometry(), mat);
  mesh.name = 'WaterSurfaceAbove';
  mesh.frustumCulled = false;
  return mesh;
}
