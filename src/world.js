// 干潟の地形・水面・空・遠景
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createNoise2D, fbm, mulberry32 } from './noise.js';
import { NOISE_GLSL, CAUSTIC_GLSL, SUNVIS_GLSL } from './shaders.js';

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

  // 泥っぽさ（低い場所・澪筋の近くほど泥）
  siltAt(x, z, h = this.heightAt(x, z)) {
    const d = Math.abs(x - channelCenter(z));
    let s = smooth(0.1, -1.0, h) * 0.8 + Math.exp(-(d * d) / 60) * 0.5;
    s += nD(x * 0.04, z * 0.04) * 0.25;
    return Math.min(1, Math.max(0, s));
  }

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
      silt[k] = this.siltAt(x, z, h);
      pool[k] = this.pool[j * n + i];
    }
    geo.setAttribute('aSilt', new THREE.BufferAttribute(silt, 1));
    geo.setAttribute('aPool', new THREE.BufferAttribute(pool, 1));
    geo.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(pos.count).fill(1), 1));
    geo.computeVertexNormals();

    const grain = makeSandTextures();
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    for (const t of [grain.map, grain.normal]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(SIZE / 3, SIZE / 3);
      t.anisotropy = aniso;
    }
    grain.map.colorSpace = THREE.SRGBColorSpace;

    this.initHoleMask();
    const mat = this.makeTerrainMaterial(grain, true);
    this.featureMat = this.makeTerrainMaterial(grain, false);
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

  makeTerrainMaterial(grain, holes) {
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
          attribute float aSilt; attribute float aPool; attribute float aAO;
          varying vec3 vWPos; varying float vSilt; varying float vPool; varying float vAO;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vSilt = aSilt; vPool = aPool; vAO = aAO;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; uniform float uWater; uniform vec3 uSunDir; uniform vec3 uSunCol;
          uniform float uSunUp; uniform vec3 uMurk; uniform float uAmbient;
          varying vec3 vWPos; varying float vSilt; varying float vPool; varying float vAO;
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
          roughnessFactor = mix(0.93, 0.3, wet*wet);
          roughnessFactor = mix(roughnessFactor, 0.05, puddle);
          roughnessFactor = mix(roughnessFactor, 0.8, smoothstep(0.0, 0.02, depth));   // 水中の砂に空気との鏡面反射はない`)
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
            ${SUNVIS_GLSL}
            // 雲の影
            float cl = smoothstep(0.05, 0.75, snoise(wp*0.010 + uTime*vec2(0.0045, 0.003)));
            outgoingLight *= 1.0 - 0.22*cl*uSunUp;
            float camD = length(cameraPosition - vWPos);
            // 乾いた砂粒のきらめき
            if (depth < -0.05 && camD < 14.0) {
              vec2 gc = floor(wp*140.0);
              float hh = hash12(gc);
              if (hh > 0.985) {
                vec3 gn = normalize(vec3(hash12(gc+1.7)-0.5, 1.2, hash12(gc+3.1)-0.5));
                vec3 Vd = normalize(cameraPosition - vWPos);
                float gs = pow(max(dot(gn, normalize(uSunDir + Vd)), 0.0), 400.0);
                vec2 fp = fract(wp*140.0) - 0.5;
                outgoingLight += uSunCol * gs * 6.0 * smoothstep(0.35, 0.1, length(fp)) * sunVis * (1.0 - wet) * (1.0 - smoothstep(6.0, 14.0, camD));
              }
            }
            if (depth > 0.0) {
              vec2 cuv = wp*0.11;
              vec3 c = caustic3(cuv, uTime*0.45) * 0.75 + caustic3(cuv*1.7+3.1, uTime*0.6) * 0.45;
              float cm = smoothstep(0.0, 0.12, depth) * exp(-depth*0.12) * (1.0-0.6*cl) * sunVis;
              outgoingLight += c * cm * uSunCol * diffuseColor.rgb * 1.5 * uSunUp;
              // 水中へ届く光の減衰（下向き光）
              outgoingLight *= exp(-vec3(0.05, 0.02, 0.028) * depth * 0.6);
            }
            outgoingLight *= mix(0.06, 1.0, vAO);
          }
          #include <opaque_fragment>`);
      if (holes) {
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            uniform sampler2D uHoles; uniform float uHoleExt;`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            {
              vec2 huv = (vWPos.xz + uHoleExt) / (2.0 * uHoleExt);
              if (all(greaterThan(huv, vec2(0.0))) && all(lessThan(huv, vec2(1.0))) && texture2D(uHoles, huv).r > 0.5) discard;
            }`);
      }
    };
    mat.customProgramCacheKey = () => (holes ? 'terrain-h' : 'terrain-f');
    return mat;
  }

  // ---------- 水面（描画はスクリーン空間の WaterPass で行う） ----------
  buildWater() {
    this.waveNormal = makeWaveNormal(256);
  }

  // ---------- 巣穴・マウンドなどの地表の起伏（地形に頂点ごとに沿わせる） ----------
  // prof(r, angle) -> [高さ, AO] 。r は 0..1 に正規化した半径。shaft は中心の竪穴。
  makeGroundFeature(x, z, radius, prof, opts = {}) {
    const rings = opts.rings || 22, segs = opts.segs || 36;
    const sx = opts.sx || 1, sz = opts.sz || 1, rot = opts.rot || 0;
    const shaft = opts.shaft;   // { r, depth }
    const pos = [], silt = [], pool = [], ao = [], idx = [], uv = [];
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const rows = [];
    if (shaft) {
      rows.push({ kind: 'bottom' });
      for (let k = 6; k >= 1; k--) rows.push({ kind: 'shaft', k: k / 6 });
    }
    for (let i = 0; i <= rings; i++) rows.push({ kind: 'surf', t: i / rings });
    const rMin = shaft ? shaft.r / radius : 0.0;
    for (const R of rows) {
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        let lx, lz, y, o;
        if (R.kind === 'surf') {
          const r = rMin + (1 - rMin) * R.t;
          lx = Math.cos(a) * r * radius * sx; lz = Math.sin(a) * r * radius * sz;
          const pr = prof(r, a);
          y = pr[0]; o = pr[1];
          if (shaft) o *= THREE.MathUtils.lerp(0.35, 1, THREE.MathUtils.smoothstep(r, rMin, rMin + 0.3));
        } else {
          const k = R.kind === 'bottom' ? 1 : R.k;
          const rr = R.kind === 'bottom' ? 0 : shaft.r * (1 - k * 0.3);
          lx = Math.cos(a) * rr * sx; lz = Math.sin(a) * rr * sz;
          y = prof(rMin, a)[0] - shaft.depth * k;
          o = 0.3 * (1 - k) ** 2;
        }
        const wx = x + lx * cr - lz * sr, wz = z + lx * sr + lz * cr;
        pos.push(wx, this.heightAt(wx, wz) + y + 0.003, wz);
        uv.push(wx / SIZE + 0.5, 0.5 - wz / SIZE);
        silt.push(this.siltAt(wx, wz)); pool.push(0); ao.push(o);
      }
    }
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < segs; j++) {
      const A = i * (segs + 1) + j, B = A + segs + 1;
      idx.push(A, A + 1, B, B, A + 1, B + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSilt', new THREE.Float32BufferAttribute(silt, 1));
    geo.setAttribute('aPool', new THREE.Float32BufferAttribute(pool, 1));
    geo.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.featureMat);
    m.receiveShadow = true;
    m.castShadow = !!opts.cast;
    this.scene.add(m);
    if (shaft) this.cutHole(x, z, shaft.r * 1.35, sx, sz, rot);
    return m;
  }

  // 地形メッシュに穴を開けるマスク（巣穴の竪穴を見せるため）
  initHoleMask() {
    this.holeN = 2048;
    this.holeExt = 64;
    this.holeData = new Uint8Array(this.holeN * this.holeN);
    this.holeTex = new THREE.DataTexture(this.holeData, this.holeN, this.holeN, THREE.RedFormat, THREE.UnsignedByteType);
    this.holeTex.magFilter = THREE.LinearFilter;
    this.holeTex.minFilter = THREE.LinearFilter;
    this.holeTex.needsUpdate = true;
    this.uniforms.uHoles = { value: this.holeTex };
    this.uniforms.uHoleExt = { value: this.holeExt };
  }

  cutHole(x, z, r, sx = 1, sz = 1, rot = 0) {
    const N = this.holeN, E = this.holeExt;
    const toI = (v) => ((v + E) / (2 * E)) * N;
    const R = r * Math.max(sx, sz);
    const i0 = Math.max(0, Math.floor(toI(x - R)) - 1), i1 = Math.min(N - 1, Math.ceil(toI(x + R)) + 1);
    const j0 = Math.max(0, Math.floor(toI(z - R)) - 1), j1 = Math.min(N - 1, Math.ceil(toI(z + R)) + 1);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wx = ((i + 0.5) / N) * 2 * E - E - x, wz = ((j + 0.5) / N) * 2 * E - E - z;
      const lx = (wx * cr + wz * sr) / sx, lz = (-wx * sr + wz * cr) / sz;
      const d = Math.hypot(lx, lz) / r;
      const v = Math.round(255 * THREE.MathUtils.clamp((1.15 - d) / 0.3, 0, 1));
      if (v > this.holeData[j * N + i]) this.holeData[j * N + i] = v;
    }
    this.holeTex.needsUpdate = true;
  }

  // 標準的な巣穴（掘り出した砂の縁と暗い竪穴）
  makeBurrow(x, z, r, opts = {}) {
    const rim = opts.rim ?? 0.35;
    return this.makeGroundFeature(x, z, r * 3.2, (t, a) => {
      const bump = rim * r * Math.exp(-((t - 0.42) ** 2) / 0.03) * (1 + 0.25 * Math.sin(a * 3 + x));
      const fade = 1 - THREE.MathUtils.smoothstep(t, 0.7, 1);
      return [bump * fade - 0.004 * (1 - t), 1];
    }, { shaft: { r, depth: r * 5 }, ...opts });
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
    this.skyScene.add(this.skyForEnv);
    // 環境光の下半球は泥の地面（下向きの面が空を映して白く光らないように）
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2a261e }));
    this.envGround.position.y = -2;
    this.skyScene.add(this.envGround);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envCubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    this.envCubeCam = new THREE.CubeCamera(1, 5000, this.envCubeRT);
    this.skyScene.add(this.envCubeCam);
    this.envCube = this.envCubeRT.texture;

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

    this.scene.fog = new THREE.FogExp2(0xc8d4dc, 0.00115);
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

    const horizon = new THREE.Color(0.78, 0.84, 0.9).lerp(new THREE.Color(0.95, 0.66, 0.45), warm * 0.8)
      .multiplyScalar(0.35 + 0.65 * THREE.MathUtils.smoothstep(elev, -4, 15));
    const top = new THREE.Color(0.25, 0.45, 0.78).multiplyScalar(0.3 + 0.7 * THREE.MathUtils.smoothstep(elev, -4, 20));
    this.scene.fog.color.copy(horizon).multiplyScalar(0.95);
    this.envGround.material.color.setRGB(0.16, 0.145, 0.115).multiplyScalar(0.3 + 0.7 * THREE.MathUtils.smoothstep(elev, -4, 20));

    if (Math.abs(hour - this.lastEnvHour) > 0.2) {
      this.lastEnvHour = hour;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 2000);
      this.envCubeCam.update(this.renderer, this.skyScene);
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
      const r = 1900 + rnd() * 500;
      const x = Math.sin(ang) * r, z = -Math.cos(ang) * r;
      const w = 18 + rnd() * 40, h = 8 + Math.pow(rnd(), 4) * 150;
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
    // 二枚貝の殻：放射肋と成長線のある浅い椀
    const valve = new THREE.SphereGeometry(0.12, 30, 10, 0, Math.PI * 2, 0, Math.PI * 0.4);
    // 殻の破片：椀の一部を不規則に割ったような曲面片
    const shard = new THREE.SphereGeometry(0.13, 9, 4, 0, 1.7, 0, 0.55);
    // 小石：角の取れた多面体
    const pebble = new THREE.IcosahedronGeometry(0.07, 1);
    const rn = mulberry32(77);
    for (const [g, kind] of [[valve, 0], [pebble, 1], [shard, 2]]) {
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        if (kind === 0) {
          const a = Math.atan2(z, x), r = Math.hypot(x, z);
          const k = 1 + 0.03 * Math.pow(Math.abs(Math.sin(a * 11)), 0.6) + 0.012 * Math.sin(r * 230);
          x *= k * 1.12; z *= k; y *= k;
        } else if (kind === 1) {
          const k = 1 + 0.18 * Math.sin(x * 40 + 1.3) * Math.sin(z * 33) + 0.1 * Math.sin(y * 50);
          x *= k; y *= k * 0.75; z *= k;
        } else {
          const k = 1 + (rn() - 0.5) * 0.18 * Math.min(1, Math.hypot(x, z) * 20);
          x *= k; z *= k;
        }
        pa.setXYZ(i, x, y, z);
      }
      g.computeVertexNormals();
    }
    shard.translate(0, -0.13 * Math.cos(0.55), 0);
    const geos = [valve, pebble, shard];
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0xb8b0a2, roughness: 0.55, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x6e6658, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0xa89c8a, roughness: 0.5, side: THREE.DoubleSide }),
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

  update(dt, t, waterLevel, focus, camDist = 40) {
    this.time = t;
    this.water = waterLevel;
    this.uniforms.uTime.value = t;
    this.uniforms.uWater.value = waterLevel;
    // 影の範囲を注視距離に合わせる（接写では影がくっきり細かくなる）
    const half = THREE.MathUtils.clamp(camDist * 0.9, 5, 42);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - half) > half * 0.08) {
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.updateProjectionMatrix();
      this.sun.shadow.normalBias = 0.004 + 0.016 * (half / 42);
      this.sun.shadow.bias = -0.0002 - 0.0003 * (half / 42);
    }
    // 影カメラを注視点へ追従（テクセル単位にスナップしてちらつき防止）
    const snap = (2 * sc.right) / 4096;
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
