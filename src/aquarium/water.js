// Water surface, photon-mesh caustics (with dispersion) and the shader hook that lights
// every submerged material with them.
import * as THREE from 'three';
import { TANK } from './config.js';

// A short-crested random sea: waves spread by the golden angle so no two similar lengths
// run parallel, which gives a net of caustic cells rather than stripes.
export const WAVES_GLSL = /* glsl */`
uniform float uTime;
uniform float uWaveAmp;
vec3 waveH(vec2 p){           // returns (height, dh/dx, dh/dz)
  float h = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < 14; i++){
    float fi = float(i);
    float ang = fi * 2.39996323 + 0.4;
    vec2 d = vec2(cos(ang), sin(ang));
    float L = mix(0.34, 0.035, pow(fi / 13.0, 0.8));        // wavelength (m)
    float k = 6.2831853 / L;
    float w = sqrt(9.81 * k + 0.074 / 1000.0 * k*k*k);      // gravity-capillary dispersion
    float A = uWaveAmp * 0.022 * L / (1.0 + fi*0.15);        // equal slope-ish per band
    A *= 0.75 + 0.25 * sin(uTime * (0.3 + 0.07*fi) + fi*1.7); // each band breathes
    float ph = k * dot(d, p) - w * uTime * 0.55 + fi * 1.3;
    h += A * sin(ph);
    g += A * k * cos(ph) * d;
  }
  return vec3(h, g);
}
vec3 waveNormal(vec2 p){ vec3 h = waveH(p); return normalize(vec3(-h.y, 1.0, -h.z)); }
`;

// Refracted direction of the (downward) light inside the water for a flat surface.
export function meanRefracted(lightDir) {
  const i = lightDir.clone().normalize();          // direction light travels (downwards)
  const n = new THREE.Vector3(0, 1, 0);
  const eta = 1 / TANK.ior;
  const cosi = -n.dot(i);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  return i.multiplyScalar(eta).add(n.multiplyScalar(eta * cosi - Math.sqrt(k))).normalize();
}

export function createCaustics(renderer, { size = 1024, grid = 300 } = {}) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType, depthBuffer: false,
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
  });
  const uniforms = {
    uTime: { value: 0 }, uWaveAmp: { value: 1 },
    uLight: { value: new THREE.Vector3(0.25, -1, 0.15).normalize() },
    uIor: { value: TANK.ior }, uChannel: { value: new THREE.Vector3(1, 0, 0) },
    uGridArea: { value: 1 },
  };
  const geo = new THREE.PlaneGeometry(TANK.w * 1.3, TANK.d * 1.6, grid, Math.round(grid * TANK.d / TANK.w * 1.2));
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WAVES_GLSL + /* glsl */`
      uniform vec3 uLight; uniform float uIor;
      varying vec3 vOld; varying vec3 vNew;
      void main(){
        vec2 p = position.xz;
        vec3 n = waveNormal(p);
        vec3 r = refract(normalize(uLight), n, 1.0 / uIor);
        vec3 P = vec3(p.x, ${TANK.level.toFixed(4)} + waveH(p).x, p.y);
        float t = (${TANK.floorRef.toFixed(4)} - P.y) / r.y;
        vec3 Q = P + r * t;
        // express both in the frame of the flat-surface projection so the ratio is 1 on average
        vec3 r0 = refract(normalize(uLight), vec3(0,1,0), 1.0 / uIor);
        vec3 Q0 = vec3(p.x, ${TANK.level.toFixed(4)}, p.y) + r0 * ((${TANK.floorRef.toFixed(4)} - ${TANK.level.toFixed(4)}) / r0.y);
        vOld = vec3(Q0.x, 0.0, Q0.z); vNew = vec3(Q.x, 0.0, Q.z);
        vec2 uv = (Q.xz + vec2(${(TANK.w / 2).toFixed(4)}, ${(TANK.d / 2).toFixed(4)})) / vec2(${TANK.w.toFixed(4)}, ${TANK.d.toFixed(4)});
        gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uChannel;
      varying vec3 vOld; varying vec3 vNew;
      void main(){
        float a0 = length(cross(dFdx(vOld), dFdy(vOld)));
        float a1 = length(cross(dFdx(vNew), dFdy(vNew)));
        float I = a0 / max(a1, 1e-9);
        I = min(I, 40.0);
        // each fragment covers (a1 / texelArea) of the target; scaling by texel area keeps
        // the mean at ~1 once overlapping triangles add up
        gl_FragColor = vec4(uChannel * I * 0.3333 * 3.0, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const iors = [1.3315, 1.333, 1.3348];   // dispersion: red bends least (subtle)
  const chans = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

  function update(time, light, waveAmp = 1) {
    uniforms.uTime.value = time;
    uniforms.uWaveAmp.value = waveAmp;
    uniforms.uLight.value.copy(light).normalize();
    const prev = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    const auto = renderer.autoClear;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.autoClear = false;
    for (let c = 0; c < 3; c++) {
      uniforms.uIor.value = iors[c];
      uniforms.uChannel.value.copy(chans[c]);
      renderer.render(scene, cam);
    }
    renderer.autoClear = auto;
    renderer.setRenderTarget(prev);
    renderer.setClearColor(prevClear, prevA);
  }
  return { texture: rt.texture, update, rt, uniforms };
}

// Uniforms every submerged material receives.
export function causticUniforms(caustics) {
  return {
    uCaustic: { value: caustics.texture },
    uCausticDir: { value: new THREE.Vector3(0, -1, 0) },  // mean refracted light direction
    uCausticStrength: { value: 1.0 },
  };
}

export const CAUSTIC_SAMPLE_GLSL = /* glsl */`
uniform sampler2D uCaustic; uniform vec3 uCausticDir; uniform float uCausticStrength;
vec3 causticAt(vec3 P, float lod){
  // follow the light back to the reference plane the caustics were computed on
  float t = (${TANK.floorRef.toFixed(4)} - P.y) / uCausticDir.y;
  vec3 Q = P + uCausticDir * t;
  vec2 uv = (Q.xz + vec2(${(TANK.w / 2).toFixed(4)}, ${(TANK.d / 2).toFixed(4)})) / vec2(${TANK.w.toFixed(4)}, ${TANK.d.toFixed(4)});
  // the focus changes with depth: close under the surface the pattern is soft
  float depth = ${TANK.level.toFixed(4)} - P.y;
  float focus = smoothstep(0.0, 0.3, depth);
  vec3 c = min(textureLod(uCaustic, uv, lod + (1.0 - focus) * 3.0).rgb, vec3(3.0));
  c = mix(vec3(1.0), c, 0.35 + 0.65 * focus);
  float inside = step(abs(P.x), ${(TANK.w / 2).toFixed(4)}) * step(abs(P.z), ${(TANK.d / 2).toFixed(4)}) * step(P.y, ${TANK.level.toFixed(4)});
  return mix(vec3(1.0), c, inside * uCausticStrength);
}
`;

// Patch a material so its first directional light (the tank light) is modulated by the
// caustic pattern at the fragment's world position. Works on top of an existing
// onBeforeCompile (the fish's swim deformation). Needs patchLightChunk() once.
export function addCaustics(material, cu) {
  patchLightChunk();
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.defines = { ...(material.defines || {}), USE_CAUSTICS: '' };
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, cu);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCausticPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\nvCausticPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvCausticPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif\n');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCausticPos;\n' + CAUSTIC_SAMPLE_GLSL);
  };
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|caustic';
  material.needsUpdate = true;
}

// Mirror three's lights_fragment_begin so the replace above has something to hit: the
// directional loop lives in that chunk, so we patch the chunk text itself once.
let patched = false;
export function patchLightChunk() {
  if (patched) return; patched = true;
  const src = THREE.ShaderChunk.lights_fragment_begin;
  THREE.ShaderChunk.lights_fragment_begin = src.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\t#ifdef USE_CAUSTICS\n\t\tif ( UNROLLED_LOOP_INDEX == 0 ) directLight.color *= causticAt( vCausticPos, 0.0 );\n\t\t#endif');
}

// The water surface: Fresnel reflection / Snell refraction from above, and total internal
// reflection with Snell's window from below.
export function createSurface(cu, { envMap, sceneTex, resolution }) {
  const geo = new THREE.PlaneGeometry(TANK.w, TANK.d, 240, 110);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 }, uWaveAmp: { value: 1 },
    uEnv: { value: envMap }, uScene: { value: sceneTex }, uRes: { value: resolution },
    uLightDirW: { value: new THREE.Vector3(0, -1, 0) }, uLightCol: { value: new THREE.Color(1, 1, 1) },
    uDeep: { value: new THREE.Color(0.02, 0.12, 0.16) },
    ...cu,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: WAVES_GLSL + /* glsl */`
      varying vec3 vW; varying vec2 vP;
      void main(){
        vec2 p = position.xz;
        // fade waves out at the glass so the surface meets the walls cleanly
        float edge = smoothstep(0.0, 0.02, ${(TANK.w / 2).toFixed(4)} - abs(p.x)) * smoothstep(0.0, 0.02, ${(TANK.d / 2).toFixed(4)} - abs(p.y));
        vec3 P = vec3(p.x, ${TANK.level.toFixed(4)} + waveH(p).x * edge, p.y);
        vW = (modelMatrix * vec4(P, 1.0)).xyz; vP = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: WAVES_GLSL + /* glsl */`
      uniform mat4 projectionMatrix;
      uniform samplerCube uEnv; uniform sampler2D uScene; uniform vec2 uRes;
      uniform vec3 uLightDirW; uniform vec3 uLightCol; uniform vec3 uDeep;
      varying vec3 vW; varying vec2 vP;
      float fresnel(float cosi, float n1, float n2){
        float s = n1 / n2 * sqrt(max(0.0, 1.0 - cosi*cosi));
        if (s >= 1.0) return 1.0;
        float cost = sqrt(1.0 - s*s);
        float rs = (n1*cosi - n2*cost) / (n1*cosi + n2*cost);
        float rp = (n1*cost - n2*cosi) / (n1*cost + n2*cosi);
        return 0.5 * (rs*rs + rp*rp);
      }
      float edgeW;
      vec3 sampleScene(vec3 worldP){
        vec4 c = projectionMatrix * viewMatrix * vec4(worldP, 1.0);
        vec2 uv = c.xy / c.w * 0.5 + 0.5;
        vec2 e = smoothstep(vec2(0.0), vec2(0.08), uv) * smoothstep(vec2(1.0), vec2(0.92), uv);
        edgeW = e.x * e.y * step(0.0, c.w);
        return texture2D(uScene, clamp(uv, 0.001, 0.999)).rgb;
      }
      void main(){
        vec3 n = waveNormal(vP);
        vec3 V = normalize(vW - cameraPosition);
        vec2 suv = gl_FragCoord.xy / uRes;
        vec3 col; float alpha = 1.0;
        if (cameraPosition.y > vW.y) {
          // from above: reflect the room, refract into the tank
          float cosi = max(dot(-V, n), 0.0);
          float F = fresnel(cosi, 1.0, 1.333);
          vec3 R = reflect(V, n);
          vec3 refl = textureLod(uEnv, R, 1.0).rgb;
          vec3 T = refract(V, n, 1.0/1.333);
          vec3 refr = sampleScene(vW + T * 0.06);
          col = mix(refr, refl, F);
          // specular glint of the fixture
          col += uLightCol * pow(max(dot(R, -uLightDirW), 0.0), 900.0) * 6.0;
        } else {
          // from below: Snell's window, total internal reflection outside it
          vec3 nb = -n;
          float cosi = max(dot(-V, nb), 0.0);
          float F = fresnel(cosi, 1.333, 1.0);
          vec3 R = reflect(V, nb);
          vec3 refl = sampleScene(vW + R * 0.18);
          refl = mix(uDeep, refl, edgeW * 0.7);
          vec3 T = refract(V, nb, 1.333);
          vec3 sky = (dot(T,T) > 0.0) ? textureLod(uEnv, T, 2.0).rgb * 1.2 + uLightCol * pow(max(dot(T, -uLightDirW), 0.0), 60.0) * 2.5 : vec3(0.0);
          col = mix(sky, refl, F);
        }
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  return { mesh, uniforms };
}
