// 生き物用の手続き的マテリアル：物体空間の模様・粒状の凹凸・表面下散乱・水中コースティクス
import * as THREE from 'three';
import { NOISE3_GLSL, CAUSTIC_GLSL, SUNVIS_GLSL } from './shaders.js';

let WORLD_U = null;
export function setWorldUniforms(U) { WORLD_U = U; }

const PERTURB_GLSL = /* glsl */ `
vec3 orgPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd){
  vec3 sX = dFdx(surf_pos), sY = dFdy(surf_pos);
  vec3 R1 = cross(sY, surf_norm), R2 = cross(surf_norm, sX);
  float det = dot(sX, R1) * fd;
  vec3 g = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surf_norm - g);
}`;

const DEFAULTS = {
  color: 'vec3 orgColor(vec3 p, vec3 n, vec3 base){ return base; }',
  bump: 'float orgBump(vec3 p){ return 0.0; }',
  rough: 'float orgRough(vec3 p, float r){ return r; }',
  thick: 'float orgThick(vec3 p){ return 1.0; }',
};

/**
 * opts.key      : GLSL の組み合わせごとに一意な文字列（プログラム共有用）
 * opts.glsl     : { color, bump, rough, thick } 各関数定義の GLSL
 * opts.colors   : [c1..c4] 模様用の色
 * opts.sss      : 表面下散乱の色, opts.sssK: 強さ
 * opts.seed     : 個体差
 * opts.vertex   : (shader) => void 頂点変形の追加フック
 */
export function organicMaterial(opts) {
  const {
    key, glsl = {}, colors = [], sss = 0x000000, sssK = 0, seed = 0, bumpScale = 1, P = [0, 0, 0, 0],
    bumpFade = [3, 25], vertex = null, extraUniforms = {}, ...params
  } = opts;
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3, ...params });
  const cols = [0, 1, 2, 3].map((i) => new THREE.Color(colors[i] !== undefined ? colors[i] : 0xffffff));
  const U = {
    uSeed: { value: seed },
    uC1: { value: cols[0] }, uC2: { value: cols[1] }, uC3: { value: cols[2] }, uC4: { value: cols[3] },
    uSSS: { value: new THREE.Color(sss) }, uSSSk: { value: sssK }, uP: { value: new THREE.Vector4(...P) },
    uBumpS: { value: bumpScale }, uBumpFade: { value: new THREE.Vector2(bumpFade[0], bumpFade[1]) },
    ...extraUniforms,
  };
  m.userData.u = U;
  m.userData.key = key;
  const g = { ...DEFAULTS, ...glsl };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    if (WORLD_U) for (const k of ['uWater', 'uTime', 'uSunCol', 'uSunUp']) sh.uniforms[k] = WORLD_U[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vOP; varying vec3 vON; varying vec3 vWP;
        ${Object.keys(extraUniforms).map((k) => `uniform ${glslType(extraUniforms[k].value)} ${k};`).join('\n')}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOP = position; vON = normal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    if (vertex) vertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vOP; varying vec3 vON; varying vec3 vWP;
        uniform float uSeed; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
        uniform vec3 uSSS; uniform float uSSSk; uniform float uBumpS; uniform vec2 uBumpFade; uniform vec4 uP;
        uniform float uWater; uniform float uTime; uniform vec3 uSunCol; uniform float uSunUp;
        ${Object.keys(extraUniforms).map((k) => `uniform ${glslType(extraUniforms[k].value)} ${k};`).join('\n')}
        ${NOISE3_GLSL}
        ${CAUSTIC_GLSL}
        ${PERTURB_GLSL}
        ${g.color}
        ${g.bump}
        ${g.rough}
        ${g.thick}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = orgColor(vOP, normalize(vON), diffuseColor.rgb);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = orgRough(vOP, roughnessFactor);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float fade = 1.0 - smoothstep(uBumpFade.x, uBumpFade.y, length(vViewPosition));
          float bh = orgBump(vOP) * uBumpS * fade;
          normal = orgPerturb(-vViewPosition, normal, vec2(dFdx(bh), dFdy(bh)), faceDirection);
        }`)
      .replace('#include <opaque_fragment>', `{
          ${SUNVIS_GLSL}
          #if NUM_DIR_LIGHTS > 0
          if (uSSSk > 0.0) {
            vec3 Ls = directionalLights[0].direction;
            vec3 Vv = normalize(vViewPosition);
            float th = orgThick(vOP);
            vec3 Hs = normalize(Ls + normal * 0.35);
            float back = pow(clamp(dot(Vv, -Hs), 0.0, 1.0), 3.0) * th;
            float wrap = clamp(dot(normal, Ls) * 0.5 + 0.5, 0.0, 1.0);
            outgoingLight += uSSS * directionalLights[0].color * (back * 1.3 * mix(0.35, 1.0, sunVis) + wrap * 0.18 * th) * uSSSk;
          }
          #endif
          float uwD = uWater - vWP.y;
          if (uwD > 0.0) {
            vec3 c = caustic3(vWP.xz*0.11, uTime*0.45);
            outgoingLight += c * smoothstep(0.0,0.2,uwD) * exp(-uwD*0.12) * uSunCol * diffuseColor.rgb * 1.2 * uSunUp * sunVis;
          }
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'org-' + key;
  return m;
}

function glslType(v) {
  if (typeof v === 'number') return 'float';
  if (v.isVector2) return 'vec2';
  if (v.isVector3 || v.isColor) return 'vec3';
  if (v.isVector4) return 'vec4';
  return 'float';
}

// ---------- 種ごとの GLSL 模様 ----------
export const GLSL = {
  // コメツキガニの甲：砂に溶け込む灰褐色、細かな暗色点と顆粒
  kometsukiShell: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      vec3 q = p*42.0 + uSeed*13.7;
      float big = fbm3(p*7.0 + uSeed)*0.5+0.5;
      vec3 col = mix(uC1, uC2, smoothstep(0.25, 0.8, big));
      vec3 c = cell3(q);
      float spot = smoothstep(0.42, 0.18, c.x) * step(0.45, c.z);
      col = mix(col, uC3, spot*0.8);
      float fine = smoothstep(0.3, 0.1, cell3(p*120.0 + uSeed).x);
      col = mix(col, uC3, fine*0.35);
      col = mix(col, uC4, smoothstep(0.0, -0.06, p.y));      // 腹側は白っぽい
      col *= 0.9 + 0.1*snoise3(p*60.0);
      return col;
    }`,
    bump: `float orgBump(vec3 p){
      vec3 c = cell3(p*85.0);
      return (1.0 - smoothstep(0.0, 0.5, c.x))*0.0022 + snoise3(p*30.0)*0.0012;
    }`,
    rough: 'float orgRough(vec3 p, float r){ return r + (snoise3(p*50.0))*0.1; }',
  },
  // ヤマトオサガニの甲：暗い灰緑褐色、目立つ顆粒
  yamatoShell: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float big = fbm3(p*3.5 + uSeed)*0.5+0.5;
      vec3 col = mix(uC1, uC2, smoothstep(0.3, 0.75, big));
      vec3 c = cell3(p*48.0 + uSeed*7.0);
      col = mix(col, uC3, (1.0 - smoothstep(0.0, 0.35, c.x)) * 0.45);  // 顆粒の頂は明るい
      col = mix(col, uC1*0.55, smoothstep(0.55, 0.9, snoise3(p*7.0+3.0+uSeed)) * 0.6);
      col = mix(col, uC3*1.05, smoothstep(0.02, 0.0, abs(p.z - 0.33)) * 0.3);
      col = mix(col, uC4, smoothstep(0.0, -0.05, p.y));
      return col;
    }`,
    bump: `float orgBump(vec3 p){
      vec3 c = cell3(p*48.0);
      return (1.0 - smoothstep(0.0, 0.42, c.x))*0.006 + snoise3(p*18.0)*0.002;
    }`,
  },
  // 歩脚：まだら模様と節の明暗
  leg: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float m = fbm3(p*vec3(16.0, 30.0, 30.0) + uSeed)*0.5+0.5;
      vec3 col = mix(uC1, uC2, smoothstep(0.35, 0.7, m));
      float band = smoothstep(0.5, 0.85, sin(p.x*60.0 + uSeed*5.0 + snoise3(p*20.0)*1.5)*0.5+0.5);
      col = mix(col, uC3, band*0.45);
      col = mix(col, uC3*0.8, smoothstep(0.012, 0.0, p.x)*0.5);   // 関節の付け根は暗い
      col = mix(col, uC4, smoothstep(0.0, -0.02, p.y) * 0.4);
      return col;
    }`,
    bump: 'float orgBump(vec3 p){ return snoise3(p*vec3(40.0,90.0,90.0))*0.0012; }',
  },
  // はさみ：掌部は白〜淡紅、指先は白く、粒状
  claw: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float m = fbm3(p*14.0 + uSeed)*0.5+0.5;
      vec3 col = mix(uC1, uC2, smoothstep(0.3, 0.8, m));
      col = mix(col, uC3, smoothstep(uP.x*0.55, uP.x*0.9, p.x));   // 指先
      col = mix(col, col*0.8, smoothstep(0.0, -0.02, p.y)*0.3);
      return col;
    }`,
    bump: `float orgBump(vec3 p){
      vec3 c = cell3(p*110.0);
      return (1.0 - smoothstep(0.0, 0.4, c.x))*0.0015;
    }`,
  },
  // 複眼：黒地に細かな個眼の格子
  cornea: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      vec3 c = cell3(normalize(p)*55.0);
      float fac = smoothstep(0.05, 0.4, c.x);
      vec3 col = mix(uC2, uC1, fac);
      return col;
    }`,
    rough: 'float orgRough(vec3 p, float r){ return 0.12; }',
  },
  // スナモグリ：半透明の淡紅、内臓の橙が透ける
  shrimp: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float m = fbm3(p*10.0 + uSeed)*0.5+0.5;
      vec3 col = mix(uC1, uC2, m*0.7);
      col *= 0.92 + 0.08 * snoise3(p * 90.0);
      // 甲の下に透けて見える中腸腺（背側から見た投影で判定）
      float organ = 1.0 - smoothstep(0.45, 1.0, length(vec2(p.x / 0.075, (p.z - 0.1) / 0.1)) + snoise3(p * 25.0) * 0.15);
      organ *= smoothstep(-0.04, 0.02, p.y) * (0.7 + 0.3 * snoise3(p * 60.0));
      col = mix(col, uC3, organ * uP.x);
      // 腸管（背中線に沿った細い暗赤色の線）
      float gut = smoothstep(0.012, 0.004, abs(p.x)) * smoothstep(0.0, 0.04, p.y) * uP.y;
      col = mix(col, vec3(0.55, 0.28, 0.2), gut * 0.6);
      float dots = smoothstep(0.2, 0.08, cell3(p*70.0 + uSeed).x);
      col = mix(col, uC3*0.9, dots*0.25);
      return col;
    }`,
    thick: 'float orgThick(vec3 p){ return 1.0; }',
    bump: 'float orgBump(vec3 p){ return snoise3(p*45.0)*0.0008; }',
  },
  // ハゼ稚魚の体：背は暗く、腹は白銀。体側中央の暗斑列と黒色素胞
  goby: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float y = p.y;
      vec3 col = mix(uC3, uC2, smoothstep(-0.05, -0.01, y));
      col = mix(col, uC1, smoothstep(-0.005, 0.05, y));
      float z = p.z;
      float noise = snoise3(p*14.0 + uSeed)*0.35;
      float blot = smoothstep(0.55, 0.85, sin(z*uP.x + uSeed*3.0)*0.5+0.5 + noise) * exp(-pow(y/0.028, 2.0)) * step(z, 0.24) * step(-0.45, z);
      float sad = smoothstep(0.55, 0.9, sin(z*uP.x*0.75 + 1.7 + uSeed)*0.5+0.5 + noise) * smoothstep(0.02, 0.06, y) * step(z, 0.3);
      vec3 cc = cell3(p*110.0 + uSeed*5.0);
      float dots = smoothstep(0.22, 0.1, cc.x) * step(0.35, cc.z) * smoothstep(-0.03, 0.04, y);
      float head = smoothstep(0.2, 0.3, z);
      col = mix(col, uC4, clamp(blot*0.95 + sad*0.7*uP.y + dots*0.75, 0.0, 0.92));
      // 鰓蓋の金色の光沢
      float op = smoothstep(0.035, 0.0, abs(z - 0.25) - 0.025) * smoothstep(0.05, 0.0, abs(y + 0.005) - 0.02);
      col = mix(col, vec3(0.78, 0.62, 0.3), op * 0.35);
      col = mix(col, col*vec3(0.95,0.9,0.85), head*0.2);
      return col;
    }`,
    bump: 'float orgBump(vec3 p){ return snoise3(p*vec3(160.0, 160.0, 60.0))*0.0004; }',
    thick: 'float orgThick(vec3 p){ return smoothstep(0.1, -0.35, p.z) * 0.6 + 0.4; }',
    rough: 'float orgRough(vec3 p, float r){ return mix(0.25, 0.4, smoothstep(0.0, 0.05, p.y)); }',
  },
  // 魚の眼：金色の虹彩と黒い瞳（+x が外向き）
  fishEye: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      vec3 d = normalize(p);
      float a = acos(clamp(d.x, -1.0, 1.0));
      vec3 col = mix(vec3(0.02), uC1, smoothstep(0.42, 0.5, a));
      col = mix(col, uC1*0.4, smoothstep(0.85, 1.1, a));
      col += uC1 * 0.3 * smoothstep(0.5, 0.6, a) * (1.0 - smoothstep(0.7, 0.9, a)) * (snoise3(d*30.0)*0.5+0.5);
      return col;
    }`,
    rough: 'float orgRough(vec3 p, float r){ return 0.08; }',
  },
  // ヤドカリ・アラムシロの軟体部：半透明の白地に斑点
  softBody: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float m = fbm3(p*18.0 + uSeed)*0.5+0.5;
      vec3 col = mix(uC1, uC2, m*0.6);
      vec3 c = cell3(p*60.0 + uSeed);
      col = mix(col, uC3, smoothstep(0.3, 0.12, c.x) * step(0.5, c.z) * 0.8);
      return col;
    }`,
    thick: 'float orgThick(vec3 p){ return 0.8; }',
    bump: 'float orgBump(vec3 p){ return snoise3(p*60.0)*0.0008; }',
  },
  // 水管：先端ほど褐色、縞と斑点
  siphon: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float t = smoothstep(uP.x*0.6, uP.x, p.y);
      vec3 col = mix(uC1, uC2, t);
      float sp = smoothstep(0.3, 0.12, cell3(p*80.0 + uSeed).x);
      col = mix(col, uC3, sp * t * 0.8);
      col *= 0.92 + 0.08*sin(p.y*260.0);
      return col;
    }`,
    thick: 'float orgThick(vec3 p){ return 0.9; }',
    bump: 'float orgBump(vec3 p){ return sin(p.y*260.0)*0.0006 + snoise3(p*70.0)*0.0006; }',
  },
  // アサリ：個体ごとに異なる幾何学模様（殻頂を中心とした極座標）
  asari: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      vec2 q = vec2(p.x - 0.22, 0.6 - p.y);
      float r = length(q);
      float th = atan(q.x, q.y);
      float s1 = fract(uSeed*7.13), s2 = fract(uSeed*3.71), s3 = fract(uSeed*5.19);
      float grow = sin(r*170.0 + snoise3(p*8.0)*2.0);
      float rays = smoothstep(0.55, 0.85, sin(th*(5.0+s1*7.0) + s2*6.28)*0.5+0.5) * step(0.45, s3);
      float zz = abs(fract(th*(9.0+s2*9.0) + r*2.0) - 0.5)*2.0;
      float chev = smoothstep(0.7, 0.88, sin((r + zz*0.035*(0.5+s1))*(55.0+s3*45.0))*0.5+0.5) * step(s1, 0.75);
      float bl = smoothstep(0.3, 0.6, fbm3(p*vec3(6.0,6.0,2.0) + uSeed*10.0)) * step(0.3, s2);
      float m = clamp(rays*0.7 + chev*0.9 + bl*0.55, 0.0, 1.0);
      vec3 col = mix(uC1, uC2, m);
      col = mix(col, uC3, smoothstep(0.6, 1.0, sin(th*2.5 + s3*5.0))*0.35);
      col *= 0.86 + 0.14*grow;
      col = mix(col, uC4, smoothstep(0.16, 0.0, r)*0.7);
      return col;
    }`,
    bump: `float orgBump(vec3 p){
      vec2 q = vec2(p.x - 0.22, 0.6 - p.y);
      float r = length(q); float th = atan(q.x, q.y);
      return sin(r*170.0 + snoise3(p*8.0)*2.0)*0.0022 + sin(th*80.0)*0.0012*smoothstep(0.1, 0.3, r);
    }`,
    rough: 'float orgRough(vec3 p, float r){ return r + snoise3(p*20.0)*0.08; }',
  },
  // 巻貝の殻（頂点色に微細な凹凸と汚れ）
  gastropod: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float dirt = smoothstep(0.2, 0.8, fbm3(p*18.0 + uSeed)*0.5+0.5);
      vec3 col = base * (0.85 + 0.2*snoise3(p*60.0));
      col = mix(col, uC1, dirt*0.25);
      return col;
    }`,
    bump: 'float orgBump(vec3 p){ return snoise3(p*vec3(90.0, 260.0, 90.0))*0.0012 + snoise3(p*35.0)*0.001; }',
  },
  // マテガイの殻皮：光沢のある黄褐色、成長線
  razorShell: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      // 成長線は殻の長軸に沿って走り、斜めの線で色が分かれる
      float g = sin(p.x*260.0 + snoise3(p*vec3(8.0, 0.8, 8.0))*3.0)*0.5+0.5;
      float diag = smoothstep(-0.02, 0.02, p.x + (p.y + 1.9)*0.06);
      vec3 col = mix(uC1, uC2, diag*0.7 + g*0.12);
      col = mix(col, uC3, smoothstep(0.55, 0.9, snoise3(p*vec3(4.0,0.5,4.0) + uSeed)*0.5+0.5) * 0.35);
      col *= 0.92 + 0.08*sin(p.y*40.0 + snoise3(p*3.0)*4.0);
      return col;
    }`,
    bump: 'float orgBump(vec3 p){ return sin(p.x*260.0 + snoise3(p*vec3(8.0,0.8,8.0))*3.0)*0.0012 + sin(p.y*40.0 + snoise3(p*3.0)*4.0)*0.0015; }',
  },
};
