// 干潟の地形・水面・空・遠景
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createNoise2D, fbm, mulberry32 } from './noise.js';
import { NOISE_GLSL, CAUSTIC_GLSL } from './shaders.js';

export const SIZE = 240;          // 地形の一辺（1単位 ≒ 2.5cm のミニチュアスケール）
const RES = 480;                  // 地形メッシュの分割数
export const PLAY_RADIUS = 55;    // 生き物が暮らす範囲

const nA = createNoise2D(11);
const nB = createNoise2D(23);
const nC = createNoise2D(37);
const nD = createNoise2D(53);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function channelCenter(z) {
  return Math.sin(z * 0.045) * 12 + Math.sin(z * 0.017 + 1.3) * 9 - 8;
}

// 解析的な地形関数（配置計算・グリッド生成で共用）
function rawHeight(x, z) {
  const large = fbm(nA, x * 0.016, z * 0.016, 5);
  const mid = fbm(nB, x * 0.07, z * 0.07, 4);
  let h = z * 0.012 + large * 0.85 + mid * 0.16 + 0.1;

  // 澪筋（みおすじ）: 干潮時にも水が残る蛇行した流路
  const d = x - channelCenter(z);
  h -= 2.5 * Math.exp(-(d * d) / (2 * 4.2 * 4.2));
  h += 0.22 * Math.exp(-((Math.abs(d) - 7.5) ** 2) / 7);

  // 支流
  const tz = 10 + Math.sin(x * 0.09) * 4 + x * 0.18;
  if (x > channelCenter(z)) {
    const dt = z - tz;
    h -= 0.75 * Math.exp(-(dt * dt) / (2 * 1.4 * 1.4)) * smooth(-10, 5, x - channelCenter(z)) * (1 - smooth(20, 45, x));
  }

  // 潮だまり
  const pool = smooth(0.32, 0.62, fbm(nC, x * 0.05 + 3, z * 0.05 - 7, 3));
  h -= pool * 0.32;

  // 奥は乾いた砂浜、手前は沖へ
  h += smooth(38, 95, z) * 2.8;
  h -= smooth(40, 110, -z) * 3.2;
  h -= smooth(60, 118, Math.abs(x)) * 1.2 * (1 - smooth(38, 95, z));
  return h;
}

function poolField(x, z) {
  return smooth(0.32, 0.62, fbm(nC, x * 0.05 + 3, z * 0.05 - 7, 3));
}

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.water = 0;
    this.time = 0;
    this.uniforms = {
      uTime: { value: 0 },
      uWater: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 1, 1) },
      uSunUp: { value: 1 },
      uMurk: { value: new THREE.Color(0.12, 0.17, 0.14) },
      uAmbient: { value: 1 },
    };
    this.buildHeightGrid();
    this.buildTerrain();
    this.buildWater();
    this.buildSky();
    this.buildScenery();
    this.buildDebris();
  }

  // ---------- 高さグリッド ----------
  buildHeightGrid() {
    const n = RES + 1;
    this.grid = new Float32Array(n * n);
    this.pool = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const z = (j / RES - 0.5) * SIZE;
      for (let i = 0; i < n; i++) {
        const x = (i / RES - 0.5) * SIZE;
        this.grid[j * n + i] = rawHeight(x, z);
        this.pool[j * n + i] = poolField(x, z);
      }
    }
  }

  heightAt(x, z) {
    const n = RES + 1;
    const fx = Math.min(RES - 1e-4, Math.max(0, (x / SIZE + 0.5) * RES));
    const fz = Math.min(RES - 1e-4, Math.max(0, (z / SIZE + 0.5) * RES));
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const g = this.grid;
    const a = g[j * n + i], b = g[j * n + i + 1], c = g[(j + 1) * n + i], d = g[(j + 1) * n + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.4;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  depthAt(x, z) { return this.water - this.heightAt(x, z); }

  // ---------- 砂泥の地形 ----------
  buildTerrain() {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, RES, RES);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const silt = new Float32Array(pos.count);
    const pool = new Float32Array(pos.count);
    const n = RES + 1;
    for (let k = 0; k < pos.count; k++) {
      const i = k % n, j = Math.floor(k / n);
      const h = this.grid[j * n + i];
      pos.setY(k, h);
      const x = pos.getX(k), z = pos.getZ(k);
      const d = Math.abs(x - channelCenter(z));
      let s = smooth(0.1, -1.0, h) * 0.8 + Math.exp(-(d * d) / 60) * 0.5;
      s += nD(x * 0.04, z * 0.04) * 0.25;
      silt[k] = Math.min(1, Math.max(0, s));
      pool[k] = this.pool[j * n + i];
    }
    geo.setAttribute('aSilt', new THREE.BufferAttribute(silt, 1));
    geo.setAttribute('aPool', new THREE.BufferAttribute(pool, 1));
    geo.computeVertexNormals();

    const grain = makeSandTextures();
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    for (const t of [grain.map, grain.normal]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(SIZE / 3, SIZE / 3);
      t.anisotropy = aniso;
    }
    grain.map.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: grain.map,
      normalMap: grain.normal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.95,
      metalness: 0.0,
      envMapIntensity: 1.0,
    });
    const U = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aSilt; attribute float aPool;
          varying vec3 vWPos; varying float vSilt; varying float vPool;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vSilt = aSilt; vPool = aPool;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; uniform float uWater; uniform vec3 uSunDir; uniform vec3 uSunCol;
          uniform float uSunUp; uniform vec3 uMurk; uniform float uAmbient;
          varying vec3 vWPos; varying float vSilt; varying float vPool;
          ${NOISE_GLSL}
          ${CAUSTIC_GLSL}
          float rippleH(vec2 p){
            vec2 w = vec2(snoise(p*0.045), snoise(p*0.045+17.3));
            vec2 dir = normalize(vec2(0.92, 0.38) + w*0.35);
            float ph = dot(p, dir)*3.1 + w.x*7.0;
            float s = sin(ph + 0.55*sin(ph));      // 非対称な砂漣
            float broken = smoothstep(-0.35, 0.25, snoise(p*0.33));
            return s * broken;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float depth = uWater - vWPos.y;
          float wet = 1.0 - smoothstep(0.0, 0.55, -depth);
          vec2 wp = vWPos.xz;
          float nL = snoise(wp*0.09)*0.5+0.5;
          float nS = snoise(wp*0.9);
          vec3 sandDry  = vec3(0.56, 0.48, 0.36);
          vec3 sandGrey = vec3(0.44, 0.40, 0.33);
          vec3 siltCol  = vec3(0.27, 0.25, 0.20);
          vec3 base = mix(sandDry, sandGrey, nL*0.8);
          base = mix(base, siltCol, clamp(vSilt,0.0,1.0));
          // 貝殻片が集まった帯
          float hash = smoothstep(0.55, 0.8, snoise(wp*0.06+4.0)) * smoothstep(0.2, 0.7, snoise(wp*1.7));
          base = mix(base, vec3(0.72,0.69,0.64), hash*0.35);
          base *= 0.93 + 0.07*nS;
          // 珪藻マット（淡い茶緑）
          float diatom = smoothstep(0.35, 0.8, snoise(wp*0.05-9.0)) * wet * (1.0-smoothstep(0.0,0.5,depth));
          base = mix(base, vec3(0.42,0.38,0.22), diatom*0.35);
          diffuseColor.rgb *= base;
          float puddle = smoothstep(0.45, 0.75, vPool) * (1.0 - step(0.0, depth)) * (1.0 - smoothstep(0.0, 1.4, -depth));
          diffuseColor.rgb *= mix(1.0, 0.52 - 0.12*vSilt, wet);
          diffuseColor.rgb *= mix(1.0, 0.78, puddle);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.93, 0.32, wet*wet);
          roughnessFactor = mix(roughnessFactor, 0.05, puddle);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            float camD = length(cameraPosition - vWPos);
            float amp = 0.055 * (1.0 - vSilt*0.7) * smoothstep(-0.3, 0.5, snoise(wp*0.025+2.0));
            amp *= 1.0 - smoothstep(25.0, 80.0, camD);
            amp *= 1.0 - puddle;
            float e = 0.05;
            float h0 = rippleH(wp);
            float hx = rippleH(wp + vec2(e, 0.0));
            float hz = rippleH(wp + vec2(0.0, e));
            vec3 g = vec3(-(hx-h0)/e*amp, 0.0, -(hz-h0)/e*amp);
            vec3 nW = inverseTransformDirection(normal, viewMatrix);
            nW = normalize(nW + g);
            nW = normalize(mix(nW, vec3(0.0,1.0,0.0), puddle*0.85));
            normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          }`)
        .replace('#include <opaque_fragment>', `
          {
            // 雲の影
            float cl = smoothstep(0.05, 0.75, snoise(wp*0.010 + uTime*vec2(0.0045, 0.003)));
            outgoingLight *= 1.0 - 0.22*cl*uSunUp;
            if (depth > 0.0) {
              vec2 cuv = wp*0.11;
              vec3 c = caustic3(cuv, uTime*0.45) * 0.7 + caustic3(cuv*1.7+3.1, uTime*0.6) * 0.45;
              float cm = smoothstep(0.0, 0.25, depth) * exp(-depth*0.45) * (1.0-0.6*cl);
              outgoingLight += c * cm * uSunCol * diffuseColor.rgb * 1.4 * uSunUp;
              vec3 ext = exp(-vec3(0.62, 0.36, 0.46) * depth * 0.55);
              outgoingLight = mix(uMurk * uAmbient, outgoingLight * ext, exp(-depth*0.16));
            }
          }
          #include <opaque_fragment>`);
    };
    this.terrainMat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;

    // 地形の外側（沖の海底）
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0x3d3a30, roughness: 1 })
    );
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = -4.6;
    this.scene.add(bed);
  }

  // ---------- 水面 ----------
  buildWater() {
    // 地形高さテクスチャ（水深計算用）
    const TN = 512;
    const data = new Uint16Array(TN * TN);
    for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
      const x = ((i + 0.5) / TN - 0.5) * SIZE, z = ((j + 0.5) / TN - 0.5) * SIZE;
      data[j * TN + i] = THREE.DataUtils.toHalfFloat(this.heightAt(x, z));
    }
    const hTex = new THREE.DataTexture(data, TN, TN, THREE.RedFormat, THREE.HalfFloatType);
    hTex.magFilter = hTex.minFilter = THREE.LinearFilter;
    hTex.needsUpdate = true;

    const nTex = makeWaveNormal(256);
    const U = this.uniforms;
    this.waterUniforms = {
      ...U,
      uHeight: { value: hTex },
      uNormal: { value: nTex },
      uSize: { value: SIZE },
      uSkyTop: { value: new THREE.Color(0.35, 0.55, 0.85) },
      uSkyHor: { value: new THREE.Color(0.8, 0.85, 0.9) },
      uShallow: { value: new THREE.Color(0.36, 0.40, 0.30) },
      uDeep: { value: new THREE.Color(0.07, 0.15, 0.13) },
      fogColor: { value: new THREE.Color() },
      fogDensity: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        varying vec3 vWPos;
        #include <fog_pars_vertex>
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWPos = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uHeight; uniform sampler2D uNormal;
        uniform float uSize, uWater, uTime, uSunUp, uAmbient;
        uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uShallow, uDeep;
        varying vec3 vWPos;
        #include <common>
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main(){
          vec2 uv = vWPos.xz / uSize + 0.5;
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float h = mix(-4.6, texture2D(uHeight, clamp(uv, 0.001, 0.999)).r, inside);
          float depth = uWater - h;
          if (depth < -0.01) discard;
          float camD = length(cameraPosition - vWPos);

          vec2 p = vWPos.xz;
          vec3 n1 = texture2D(uNormal, p*0.045 + uTime*vec2(0.012, 0.007)).xyz*2.0-1.0;
          vec3 n2 = texture2D(uNormal, p*0.11 + uTime*vec2(-0.017, 0.013)).xyz*2.0-1.0;
          vec3 n3 = texture2D(uNormal, p*0.37 + uTime*vec2(0.03, -0.026)).xyz*2.0-1.0;
          vec2 slope = n1.xy*0.45 + n2.xy*0.3 + n3.xy*0.1*smoothstep(3.0,12.0,camD)*(1.0-smoothstep(12.0,50.0,camD));
          float calm = 0.35 + 0.65*smoothstep(0.0, 0.6, depth);
          vec3 N = normalize(vec3(slope.x*0.55*calm, 1.0, slope.y*0.55*calm));
          vec3 V = normalize(cameraPosition - vWPos);
          float NdV = max(dot(N, V), 0.0);
          float fres = 0.02 + 0.98*pow(1.0-NdV, 5.0);
          vec3 R = reflect(-V, N);
          vec3 sky = mix(uSkyHor, uSkyTop, pow(clamp(R.y,0.0,1.0), 0.6));
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 1400.0)*3.0 + pow(max(dot(N,H),0.0), 120.0)*0.05;

          float turb = 1.0 - exp(-depth*0.3);
          vec3 scatter = mix(uShallow, uDeep, 1.0 - exp(-depth*0.45)) * uAmbient;
          scatter += uSunCol * 0.05 * uSunUp * (1.0 - turb);

          // 汀線の泡と薄い水膜
          float edge = smoothstep(-0.01, 0.07, depth);
          float fn = snoise(p*1.6 + uTime*vec2(0.15,0.11))*0.5 + snoise(p*4.0 - uTime*0.2)*0.3;
          float foamBand = smoothstep(0.14, 0.0, depth) * smoothstep(-0.02, 0.03, depth);
          float foam = foamBand * smoothstep(0.1, 0.6, fn + 0.15*sin(depth*25.0 - uTime*1.3 + fn*4.0));
          float bubbles = smoothstep(0.78, 0.9, snoise(p*2.3 + uTime*0.05)) * smoothstep(0.6, 0.0, depth) * 0.6;
          foam = max(foam, bubbles*edge);

          vec3 col = scatter*(1.0-fres) + sky*fres + spec*uSunCol*uSunUp;
          float alpha = mix(turb*0.8, 1.0, fres) * edge;
          alpha = max(alpha, clamp(spec,0.0,1.0)*edge);
          col = mix(col, vec3(0.92,0.93,0.9)*(0.4+0.6*uSunUp)*uAmbient, foam*0.85);
          alpha = max(alpha, foam*0.9);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const geo = new THREE.PlaneGeometry(8000, 8000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.renderOrder = 10;
    this.scene.add(this.waterMesh);
  }

  // ---------- 空と光 ----------
  buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(20000);
    const su = sky.material.uniforms;
    su.turbidity.value = 5.5;
    su.rayleigh.value = 1.6;
    su.mieCoefficient.value = 0.004;
    su.mieDirectionalG.value = 0.82;
    this.sky = sky;
    this.scene.add(sky);

    this.skyScene = new THREE.Scene();
    this.skyForEnv = new Sky();
    this.skyForEnv.scale.setScalar(1000);
    Object.assign(this.skyForEnv.material.uniforms, {});
    this.skyScene.add(this.skyForEnv);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42;
    sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x8a7a5c, 0.6);
    this.scene.add(this.hemi);

    this.scene.fog = new THREE.FogExp2(0xc8d4dc, 0.0011);
    this.lastEnvHour = -99;
  }

  setTimeOfDay(hour) {
    // 5時〜19時で日が昇り沈む
    const dayT = (hour - 5) / 14;
    const elev = Math.sin(Math.PI * THREE.MathUtils.clamp(dayT, -0.08, 1.08)) * 62;
    const azim = THREE.MathUtils.lerp(100, 260, dayT);
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sunDir = sunDir;

    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(sunDir);
    this.skyForEnv.material.uniforms.sunPosition.value.copy(sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'])
      this.skyForEnv.material.uniforms[k].value = su[k].value;

    const up = THREE.MathUtils.clamp(elev / 25, 0, 1);
    const warm = 1 - THREE.MathUtils.clamp((elev - 3) / 30, 0, 1);
    const sunCol = new THREE.Color(1, 0.97, 0.92).lerp(new THREE.Color(1.0, 0.55, 0.28), warm * 0.9);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 2.6 * THREE.MathUtils.smoothstep(elev, -2, 12);
    this.hemi.intensity = 0.2 + 0.45 * THREE.MathUtils.smoothstep(elev, -5, 25);
    this.hemi.color.set(0xbfd6ff).lerp(new THREE.Color(0xffc9a0), warm * 0.5);

    const U = this.uniforms;
    U.uSunDir.value.copy(sunDir);
    U.uSunCol.value.copy(sunCol).multiplyScalar(this.sun.intensity / 2.6);
    U.uSunUp.value = up;
    U.uAmbient.value = 0.25 + 0.75 * THREE.MathUtils.smoothstep(elev, -5, 25);

    const wu = this.waterUniforms;
    const horizon = new THREE.Color(0.78, 0.84, 0.9).lerp(new THREE.Color(0.95, 0.66, 0.45), warm * 0.8)
      .multiplyScalar(0.35 + 0.65 * THREE.MathUtils.smoothstep(elev, -4, 15));
    const top = new THREE.Color(0.25, 0.45, 0.78).multiplyScalar(0.3 + 0.7 * THREE.MathUtils.smoothstep(elev, -4, 20));
    wu.uSkyHor.value.copy(horizon);
    wu.uSkyTop.value.copy(top);
    this.scene.fog.color.copy(horizon).multiplyScalar(0.95);

    if (Math.abs(hour - this.lastEnvHour) > 0.2) {
      this.lastEnvHour = hour;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.16;
    }
  }

  // ---------- 遠景（護岸・松林・対岸のまち・観覧車） ----------
  buildScenery() {
    const rnd = mulberry32(777);
    // 乾いた後浜
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 1500),
      new THREE.MeshStandardMaterial({ color: 0xcbbd9f, roughness: 1 })
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, 2.95, SIZE / 2 + 750 - 2);
    beach.receiveShadow = true;
    this.scene.add(beach);

    // 松林
    const trunkGeo = new THREE.CylinderGeometry(0.6, 1.0, 16, 6);
    trunkGeo.translate(0, 8, 0);
    const crownGeo = new THREE.IcosahedronGeometry(7, 1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x2c4a2a, roughness: 0.95, flatShading: true });
    const count = 140;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const x = -700 + rnd() * 1400, z = 190 + rnd() * 120;
      const sc = 0.7 + rnd() * 0.8;
      q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.25, rnd() * 6.28, (rnd() - 0.5) * 0.25));
      m.compose(p.set(x, 2.9, z), q, s.set(sc, sc, sc));
      trunks.setMatrixAt(i, m);
      for (let k = 0; k < 2; k++) {
        const cs = sc * (0.8 + rnd() * 0.6);
        m.compose(p.set(x + (rnd() - 0.5) * 6, 2.9 + 15 * sc + k * 3 * sc, z + (rnd() - 0.5) * 6), q, s.set(cs * 1.4, cs * 0.55, cs * 1.4));
        crowns.setMatrixAt(i * 2 + k, m);
      }
    }
    this.scene.add(trunks, crowns);

    // 対岸のまち並み（霞んだシルエット）
    const cityMat = new THREE.MeshStandardMaterial({ color: 0x8c96a0, roughness: 0.8 });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const nb = 220;
    const city = new THREE.InstancedMesh(boxGeo, cityMat, nb);
    for (let i = 0; i < nb; i++) {
      const ang = -0.9 + rnd() * 1.8;
      const r = 1500 + rnd() * 400;
      const x = Math.sin(ang) * r, z = -Math.cos(ang) * r;
      const w = 20 + rnd() * 50, h = 15 + Math.pow(rnd(), 3) * 170;
      q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0));
      m.compose(p.set(x, -3, z), q, s.set(w, h, w * (0.6 + rnd())));
      city.setMatrixAt(i, m);
    }
    this.scene.add(city);

    // 観覧車（葛西臨海公園を思わせる）
    const wheel = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, metalness: 0.3 });
    const R = 55;
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.8, 6, 96), ringMat));
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.93, 0.5, 6, 96), ringMat));
    const spokeGeo = new THREE.CylinderGeometry(0.25, 0.25, R * 2, 4);
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Mesh(spokeGeo, ringMat);
      sp.rotation.z = (i / 16) * Math.PI;
      wheel.add(sp);
    }
    const gonGeo = new THREE.BoxGeometry(3, 3.5, 3);
    const gonMats = [0xd84a4a, 0x4a7fd8, 0xe0c040, 0x4ab070].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const g = new THREE.Mesh(gonGeo, gonMats[i % 4]);
      g.position.set(Math.cos(a) * R, Math.sin(a) * R - 2.5, 0);
      wheel.add(g);
    }
    const legGeo = new THREE.CylinderGeometry(0.9, 1.4, R + 8, 6);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, ringMat);
      leg.position.set(sx * 12, -(R + 8) / 2, 0);
      leg.rotation.z = sx * 0.2;
      wheel.add(leg);
    }
    wheel.position.set(-260, R + 12, 420);
    wheel.rotation.y = 0.5;
    this.wheel = wheel;
    this.scene.add(wheel);
  }

  // ---------- 貝殻片・小石・流れ藻 ----------
  buildDebris() {
    const rnd = mulberry32(4242);
    const geos = [
      new THREE.SphereGeometry(0.12, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.DodecahedronGeometry(0.07, 0),
      new THREE.CircleGeometry(0.1, 7),
    ];
    geos[2].rotateX(-Math.PI / 2);
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.55, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x6e6658, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0xd6c8b4, roughness: 0.5, side: THREE.DoubleSide }),
    ];
    const counts = [1400, 900, 1200];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    geos.forEach((g, gi) => {
      const im = new THREE.InstancedMesh(g, mats[gi], counts[gi]);
      im.receiveShadow = true;
      im.castShadow = gi < 2;
      for (let i = 0; i < counts[gi]; i++) {
        let x, z;
        const r = Math.sqrt(rnd()) * 75, a = rnd() * Math.PI * 2;
        x = Math.cos(a) * r; z = Math.sin(a) * r;
        const y = this.heightAt(x, z);
        const sc = 0.4 + rnd() * 1.4;
        q.setFromEuler(new THREE.Euler((rnd() - 0.5) * (gi === 0 ? 3.5 : 0.6), rnd() * 6.28, (rnd() - 0.5) * 0.6));
        m.compose(p.set(x, y - 0.02 * sc, z), q, s.set(sc, sc * (gi === 0 ? 0.8 : 0.7), sc * (gi === 0 ? 1.1 : 0.9)));
        im.setMatrixAt(i, m);
        const v = 0.75 + rnd() * 0.3;
        col.setRGB(v, v * (0.92 + rnd() * 0.08), v * (0.82 + rnd() * 0.12));
        if (gi === 0 && rnd() < 0.25) col.setRGB(0.55, 0.45, 0.5); // 紫がかった二枚貝の殻
        im.setColorAt(i, col);
      }
      this.scene.add(im);
    });

    // 打ち上げられたアオサ
    const ulvaMat = new THREE.MeshStandardMaterial({ color: 0x35532a, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.72 });
    const ulvaGeo = new THREE.CircleGeometry(0.6, 12);
    const pa = ulvaGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i);
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      const k = 1 + 0.35 * Math.sin(a * 3 + 1) + 0.2 * Math.sin(a * 7);
      pa.setXYZ(i, Math.cos(a) * r * k, Math.sin(a) * r * k, Math.sin(a * 5) * 0.03 * r);
    }
    ulvaGeo.rotateX(-Math.PI / 2);
    const ulva = new THREE.InstancedMesh(ulvaGeo, ulvaMat, 14);
    ulva.receiveShadow = true;
    for (let i = 0; i < 14; i++) {
      const r = Math.sqrt(rnd()) * 60, a = rnd() * 6.28;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0));
      const sc = 0.4 + rnd() * 0.9;
      m.compose(p.set(x, this.heightAt(x, z) + 0.015, z), q, s.set(sc, 1, sc * (0.6 + rnd() * 0.6)));
      ulva.setMatrixAt(i, m);
    }
    this.scene.add(ulva);
  }

  update(dt, t, waterLevel, focus) {
    this.time = t;
    this.water = waterLevel;
    this.uniforms.uTime.value = t;
    this.uniforms.uWater.value = waterLevel;
    this.waterMesh.position.y = waterLevel;
    this.waterUniforms.fogColor.value.copy(this.scene.fog.color);
    this.waterUniforms.fogDensity.value = this.scene.fog.density;
    // 影カメラを注視点へ追従（テクセル単位にスナップしてちらつき防止）
    const snap = 84 / 4096;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(this.sunDir, 150);
      }
}

// ---------- 手続き的テクスチャ ----------
function makeSandTextures() {
  const S = 512;
  const rnd = mulberry32(99);
  const hgt = new Float32Array(S * S);
  const colC = document.createElement('canvas');
  colC.width = colC.height = S;
  const ctx = colC.getContext('2d');
  const img = ctx.createImageData(S, S);
  const nz = createNoise2D(5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    // タイル可能にするため円周上でノイズをサンプリング
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    const n = nz(Math.cos(u) * 6 + 30, Math.sin(u) * 6 + Math.cos(v) * 6) * 0.5 + nz(Math.sin(v) * 12, Math.cos(u) * 12 + 50) * 0.5;
    const g = rnd();
    const val = 0.86 + n * 0.06 + (g - 0.5) * 0.18;
    let r = val, gg = val * 0.985, b = val * 0.95;
    if (g > 0.985) { r *= 0.55; gg *= 0.52; b *= 0.5; }      // 黒い鉱物粒
    else if (g < 0.012) { r = 1.0; gg = 0.99; b = 0.96; }    // 石英の白粒
    img.data[i * 4] = Math.min(255, r * 255);
    img.data[i * 4 + 1] = Math.min(255, gg * 255);
    img.data[i * 4 + 2] = Math.min(255, b * 255);
    img.data[i * 4 + 3] = 255;
    hgt[i] = g * 0.6 + n * 0.4;
  }
  ctx.putImageData(img, 0, 0);
  // 高さから法線マップ
  const nC = document.createElement('canvas');
  nC.width = nC.height = S;
  const nctx = nC.getContext('2d');
  const nimg = nctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const h = (xx, yy) => hgt[((yy + S) % S) * S + ((xx + S) % S)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * 1.6;
    const dy = (h(x, y + 1) - h(x, y - 1)) * 1.6;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * S + x) * 4;
    nimg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
    nimg.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
    nimg.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
    nimg.data[i + 3] = 255;
  }
  nctx.putImageData(nimg, 0, 0);
  return { map: new THREE.CanvasTexture(colC), normal: new THREE.CanvasTexture(nC) };
}

function makeWaveNormal(S) {
  const rnd = mulberry32(3);
  const waves = [];
  for (let k = 0; k < 40; k++) {
    const kx = Math.round((rnd() - 0.5) * 16), ky = Math.round((rnd() - 0.5) * 16);
    if (kx === 0 && ky === 0) continue;
    const kl = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 1 / Math.pow(kl, 1.4), ph: rnd() * 6.28 });
  }
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let dx = 0, dy = 0;
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    for (const w of waves) {
      const c = Math.cos(w.kx * u + w.ky * v + w.ph) * w.a;
      dx += c * w.kx; dy += c * w.ky;
    }
    dx *= 0.12; dy *= 0.12;
    const i = (y * S + x) * 4;
    data[i] = Math.max(0, Math.min(255, (dx * 0.5 + 0.5) * 255));
    data[i + 1] = Math.max(0, Math.min(255, (dy * 0.5 + 0.5) * 255));
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
