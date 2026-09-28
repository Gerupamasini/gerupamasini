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
  // コメツキガニの甲：暗いオリーブ褐色の地に、淡黄色の細かな顆粒がびっしり。左右対称の淡い斑
  kometsukiShell: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      vec3 ps = vec3(abs(p.x), p.y, p.z);             // 左右対称の模様
      float big = fbm3(ps*9.0 + uSeed*3.0)*0.5+0.5;
      vec3 col = mix(uC1, uC2, smoothstep(0.3, 0.75, big));
      vec3 c = cell3(p*120.0 + uSeed*13.7);
      float gran = 1.0 - smoothstep(0.1, 0.42, c.x);
      col = mix(col, uC3, gran * (0.45 + 0.4*step(0.3, c.z)));
      vec3 c2 = cell3(p*230.0 + uSeed*3.1);
      col = mix(col, uC3*0.9, (1.0 - smoothstep(0.1, 0.35, c2.x)) * 0.3);
      // 淡い対称斑（前方の一対と、後方の帯）
      float pale = smoothstep(0.62, 0.8, fbm3(ps*5.0 + 17.0 + uSeed)*0.5+0.5);
      col = mix(col, uC3*0.95, pale*0.55);
      // 腹側と側面下部は銀灰色
      col = mix(col, uC4, smoothstep(-0.02, -0.09, p.y));
      return col;
    }`,
    bump: `float orgBump(vec3 p){
      vec3 c = cell3(p*95.0);
      return (1.0 - smoothstep(0.0, 0.42, c.x))*0.0016 + snoise3(p*30.0)*0.0008;
    }`,
    rough: 'float orgRough(vec3 p, float r){ return r + snoise3(p*50.0)*0.08; }',
  },
  // くっきりした縞の脚（コメツキガニ）。uP.x: 縞の周波数, uP.y: 1なら鼓膜（長節の銀色の楕円）, uP.z: 節の長さ
  legBanded: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float wob = snoise3(p*vec3(20.0, 60.0, 60.0) + uSeed)*0.25;
      float band = smoothstep(-0.15, 0.15, sin(p.x*uP.x + wob*3.0 + uSeed*2.0));
      vec3 col = mix(uC1, uC2, band);
      float speck = smoothstep(0.25, 0.1, cell3(p*140.0 + uSeed).x);
      col = mix(col, uC2*1.05, speck*0.3*(1.0-band));
      col = mix(col, uC4, smoothstep(0.0, -0.02, p.y)*0.35);
      if (uP.y > 0.5) {
        // 鼓膜は長節の背面（上から見える面）の楕円
        vec2 q = vec2((p.x - uP.z*0.5)/(uP.z*0.3), p.z/0.018);
        float tym = (1.0 - smoothstep(0.7, 1.0, length(q))) * smoothstep(-0.002, 0.004, p.y);
        col = mix(col, uC3, tym * 0.85);
      }
      return col;
    }`,
    bump: 'float orgBump(vec3 p){ return snoise3(p*vec3(40.0,120.0,120.0))*0.0008; }',
    rough: `float orgRough(vec3 p, float r){
      if (uP.y > 0.5) { vec2 q = vec2((p.x - uP.z*0.5)/(uP.z*0.3), p.z/0.018); return mix(r, 0.12, (1.0 - smoothstep(0.7, 1.0, length(q))) * smoothstep(-0.002, 0.004, p.y)); }
      return r;
    }`,
  },
  // ヤマトオサガニの甲：暗い灰緑褐色、目立つ顆粒
  // ヤマトオサガニの甲：濃い焦げ茶〜灰褐色でほぼ一様、濡れて艶がある。大きな顆粒（中央の小域は平滑）、
  // 溝は暗く、上向きの面にだけ薄く乾いた泥が付く。uP.x: 甲長の半分（前縁の位置）
  // uP: (甲長の半分, 甲幅の半分, 甲高の半分)。オリーブ褐色の地に左右対称の暗斑と黄色みのある顆粒。
  // 前縁・眼窩縁・側縁は橙褐色の顆粒が数珠状に並ぶ。濡れて艶がある。
  yamatoShell: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      vec3 ps = vec3(abs(p.x), p.y, p.z);
      float big = fbm3(p*3.0 + uSeed)*0.5+0.5;
      vec3 col = mix(uC1, uC2, smoothstep(0.25, 0.8, big));
      float blot = smoothstep(0.55, 0.8, fbm3(ps*6.0 + uSeed*4.0)*0.5+0.5);
      col = mix(col, uC1*0.55, blot*0.7);
      float net = smoothstep(0.6, 0.85, fbm3(ps*14.0 + uSeed*2.0)*0.5+0.5);
      col = mix(col, uC1*0.6, net*0.35);
      vec3 c = cell3(p*60.0 + uSeed*7.0);
      float smooth0 = smoothstep(0.05, 0.12, length(p.xz - vec2(0.0, -0.03)));
      col = mix(col, uC3, (1.0 - smoothstep(0.0, 0.3, c.x)) * 0.18 * smooth0);
      col *= 0.9 + 0.1 * snoise3(p*14.0 + uSeed);
      // 橙褐色の数珠状の縁
      // 前縁：眼窩の上縁と下縁の 2 本の細い数珠列（眼窩の溝の中は暗い）
      float fz = smoothstep(uP.x*0.84, uP.x*0.92, p.z);
      float h = uP.z;
      float upperM = smoothstep(0.42*h, 0.5*h, p.y) * (1.0 - smoothstep(0.66*h, 0.76*h, p.y));
      float lowerM = smoothstep(-0.1*h, -0.03*h, p.y) * (1.0 - smoothstep(0.08*h, 0.14*h, p.y));
      float trench = fz * smoothstep(0.1*h, 0.16*h, p.y) * (1.0 - smoothstep(0.4*h, 0.46*h, p.y));
      col *= 1.0 - trench * 0.35;
      float front = fz * max(upperM, lowerM);
      float lateral = smoothstep(uP.y*0.9, uP.y*0.98, abs(p.x)) * smoothstep(-0.04, 0.01, p.y) * step(p.z, uP.x*0.92);
      vec3 bc = cell3(p*120.0);
      float beads = 1.0 - smoothstep(0.1, 0.42, bc.x);
      col = mix(col, vec3(0.6, 0.36, 0.16), clamp((front*0.9 + lateral*0.65) * (0.35 + 0.65*beads), 0.0, 1.0));
      // 乾いた泥の薄い付着
      float dust = smoothstep(0.4, 0.8, fbm3(p*7.0 + uSeed*3.0)) * smoothstep(0.5, 0.9, n.y);
      col = mix(col, vec3(0.4, 0.39, 0.34), dust * 0.38);
      col = mix(col, uC4, smoothstep(-0.06, -0.13, p.y));
      return col;
    }`,
    bump: `float orgBump(vec3 p){
      vec3 c = cell3(p*60.0);
      float smooth0 = smoothstep(0.05, 0.12, length(p.xz - vec2(0.0, -0.03)));
      vec3 bc = cell3(p*120.0);
      float rim = smoothstep(uP.x*0.84, uP.x*0.94, p.z) + smoothstep(uP.y*0.9, uP.y*0.98, abs(p.x));
      return (1.0 - smoothstep(0.0, 0.42, c.x))*0.0028*smooth0 + (1.0 - smoothstep(0.0, 0.4, bc.x))*0.002*min(rim, 1.0) + snoise3(p*22.0)*0.0012;
    }`,
    rough: 'float orgRough(vec3 p, float r){ return r + snoise3(p*9.0)*0.12; }',
  },
  // 斑点模様（ヤマトオサガニの歩脚・眼柄）。uP.x: 斑点の細かさ, uP.y: 淡色斑の量, uP.z: 1なら先端が黄色い指節, uP.w: 節の長さ
  speckle: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float m = fbm3(p*vec3(12.0, 20.0, 20.0) + uSeed)*0.5+0.5;
      vec3 col = mix(uC1, uC2, smoothstep(0.3, 0.75, m));
      vec3 c = cell3(p*uP.x + uSeed*3.0);
      float dark = (1.0 - smoothstep(0.1, 0.36, c.x)) * step(0.45, c.z);
      float pale = (1.0 - smoothstep(0.08, 0.3, c.x)) * step(c.z, 0.14) * uP.y;
      col = mix(col, uC3, dark * 0.75);
      col = mix(col, uC4, pale * 0.8);
      if (uP.z > 0.5) col = mix(col, vec3(0.78, 0.66, 0.34), smoothstep(uP.w*0.55, uP.w*0.95, p.x) * 0.8);
      col = mix(col, col*1.12, smoothstep(0.0, -0.02, p.y) * 0.5);   // 腹面はやや淡い
      return col;
    }`,
    bump: `float orgBump(vec3 p){ vec3 c = cell3(p*uP.x); return (1.0 - smoothstep(0.0, 0.4, c.x))*0.0008 + snoise3(p*vec3(40.0,90.0,90.0))*0.0008; }`,
  },
  // ヤマトオサガニの歩脚：背面はオリーブ褐色に暗いまだら、前後縁と腹面は黄土〜橙色。uP.z=1 なら指節（先端が黄色）
  yamaLeg: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float m = fbm3(p*vec3(9.0, 16.0, 16.0) + uSeed)*0.5+0.5;
      vec3 col = mix(uC1, uC2, smoothstep(0.3, 0.75, m));
      float blot = smoothstep(0.56, 0.78, fbm3(p*vec3(12.0, 6.0, 9.0) + uSeed*2.0)*0.5+0.5);
      col = mix(col, uC3, blot * 0.55);
      vec3 c = cell3(p*uP.x + uSeed*3.0);
      float dark = (1.0 - smoothstep(0.1, 0.34, c.x)) * step(0.5, c.z);
      col = mix(col, uC3, dark * 0.6);
      float edge = smoothstep(0.6, 0.92, abs(n.z));
      float ventral = smoothstep(0.1, -0.6, n.y);
      col = mix(col, uC4, max(edge * 0.5, ventral * 0.65));
      if (uP.z > 0.5) col = mix(col, vec3(0.74, 0.6, 0.3), smoothstep(uP.w*0.5, uP.w*0.95, p.x) * 0.8);
      return col;
    }`,
    bump: `float orgBump(vec3 p){ vec3 c = cell3(p*uP.x); return (1.0 - smoothstep(0.0, 0.4, c.x))*0.0008 + snoise3(p*vec3(40.0,90.0,90.0))*0.0008; }`,
  },
  // ヤマトオサガニの鉗：掌は乳白〜淡黄、指は黄〜橙で先端ほど濃い。uP.x: 前節長, uP.z: 1なら可動指
  chelaY: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float L = uP.x;
      float fin = uP.z > 0.5 ? 0.35 + 0.65 * smoothstep(0.0, 0.5 * L, p.x) : smoothstep(0.5 * L, 0.66 * L, p.x);
      vec3 col = mix(uC1, uC2, fin);
      float tip = uP.z > 0.5 ? smoothstep(0.3 * L, 0.5 * L, p.x) : smoothstep(0.85 * L, 1.02 * L, p.x);
      col = mix(col, uC3, tip * 0.75);
      col *= 0.93 + 0.07 * snoise3(p * 30.0 + uSeed);
      // 掌の外面の細かな暗い斑点（生体写真の灰緑色の掌）
      vec3 sp = cell3(p * 190.0 + uSeed * 5.0);
      col = mix(col, col * 0.62, (1.0 - smoothstep(0.08, 0.26, sp.x)) * step(0.55, sp.z) * (1.0 - fin) * 0.8);
      // 関節膜（掌と腕節の間・可動指の付け根）は暗い
      if (uP.z < 0.5) col = mix(col, uC3 * 0.55, (1.0 - smoothstep(0.0, 0.06 * L, p.x)) * 0.8);
      else col = mix(col, uC3 * 0.6, (1.0 - smoothstep(0.0, 0.05 * L, length(p.xy))) * 0.7);
      // 指先は黒褐色で艶がある
      col = mix(col, uC3 * 0.45, uP.z > 0.5 ? smoothstep(0.42 * L, 0.52 * L, p.x) : smoothstep(0.98 * L, 1.06 * L, p.x));
      // 掌の上縁の瘤と内面の細かな顆粒はわずかに白い
      vec3 c = cell3(p * 140.0);
      col = mix(col, col * 1.08, (1.0 - smoothstep(0.0, 0.35, c.x)) * 0.5);
      return col;
    }`,
    bump: `float orgBump(vec3 p){
      vec3 c = cell3(p*140.0);
      return (1.0 - smoothstep(0.0, 0.4, c.x))*0.0007 + snoise3(p*35.0)*0.0006;
    }`,
    thick: 'float orgThick(vec3 p){ return 0.5; }',
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
      // 掌の上面と外面の暗いまだら（uP.y で強さ）
      float mot = smoothstep(0.42, 0.66, fbm3(p*vec3(22.0, 30.0, 22.0) + uSeed*5.0)*0.5+0.5) * smoothstep(-0.02, 0.03, p.y + p.z*0.3);
      col = mix(col, vec3(0.2, 0.19, 0.13), clamp(mot * uP.y, 0.0, 0.9) * (1.0 - smoothstep(uP.x*0.45, uP.x*0.6, p.x)));
      col = mix(col, vec3(0.24, 0.24, 0.2), smoothstep(uP.x*0.32, uP.x*0.06, p.x) * 0.45 * min(uP.y, 1.0));   // 手首側の暗い帯
      col = mix(col, uC3, smoothstep(uP.x*0.55, uP.x*0.9, p.x));   // 指先
      col = mix(col, col*0.8, smoothstep(0.0, -0.02, p.y)*0.3);
      return col;
    }`,
    bump: `float orgBump(vec3 p){
      vec3 c = cell3(p*170.0);
      return (1.0 - smoothstep(0.0, 0.4, c.x))*0.0006 + snoise3(p*40.0)*0.0006;
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
  // ハゼの体：背は灰褐色で細かな黒点と網目、体側中央に暗褐色の斑列、腹は白銀。
  // uP.x: 体側斑の周波数, uP.y: 背の網目の強さ, uP.z: 1なら眼から口への暗色線と尾柄の斑
  goby: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      float y = p.y, z = p.z;
      vec3 col = mix(uC3, uC2, smoothstep(-0.055, -0.012, y));
      col = mix(col, uC1, smoothstep(0.004, 0.065, y));
      float wob = snoise3(p*11.0 + uSeed)*0.7;
      float bl = smoothstep(0.45, 0.85, sin(z*uP.x + uSeed*3.0 + wob)*0.5+0.5 + snoise3(p*24.0+uSeed)*0.18)
               * exp(-pow((y - 0.004)/0.024, 2.0)) * step(z, 0.2) * smoothstep(-0.47, -0.4, z);
      vec3 cc = cell3(p*150.0 + uSeed*5.0);
      float speck = (1.0 - smoothstep(0.06, 0.26, cc.x)) * step(0.45, cc.z) * smoothstep(-0.03, 0.03, y);
      float net = smoothstep(0.15, 0.55, fbm3(p*vec3(34.0, 34.0, 20.0) + uSeed*2.0)) * smoothstep(0.015, 0.06, y) * uP.y;
      // 背中を横切る暗い鞍状斑（上から見たときの模様）
      float sad = smoothstep(0.5, 0.85, sin(z*uP.x*0.9 + 1.3 + uSeed*3.0 + wob)*0.5+0.5) * smoothstep(0.035, 0.075, y) * step(z, 0.3) * smoothstep(-0.46, -0.36, z);
      // 眼の下から上顎への暗色線
      vec2 q = vec2(z, y);
      vec2 a = vec2(0.36, 0.034), b = vec2(0.47, -0.006);
      vec2 pa = q - a, ba = b - a;
      float hs = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      float stripe = smoothstep(0.011, 0.004, length(pa - ba*hs)) * step(0.028, abs(p.x)) * uP.z;
      float tailSpot = exp(-pow((z + 0.44)/0.018, 2.0) - pow(y/0.02, 2.0)) * uP.z;
      col = mix(col, uC4, clamp(bl*0.85 + speck*0.65 + net*0.35 + sad*0.55*uP.y + stripe*0.6 + tailSpot*0.8, 0.0, 0.92));
      // 唇と喉は白っぽい
      col = mix(col, uC3*1.03, smoothstep(0.43, 0.49, z) * smoothstep(0.0, -0.03, y) * 0.7);
      // 鰓蓋の淡い金属光沢
      float op = smoothstep(0.04, 0.0, abs(z - 0.26) - 0.03) * smoothstep(0.04, 0.0, abs(y + 0.01) - 0.02);
      col = mix(col, vec3(0.78, 0.72, 0.52), op * 0.25);
      return col;
    }`,
    bump: 'float orgBump(vec3 p){ return snoise3(p*vec3(170.0, 170.0, 70.0))*0.0004; }',
    thick: 'float orgThick(vec3 p){ return smoothstep(0.1, -0.35, p.z) * 0.6 + 0.4; }',
    rough: 'float orgRough(vec3 p, float r){ return mix(0.22, 0.38, smoothstep(0.0, 0.05, p.y)); }',
  },
  // 魚の眼：金色の虹彩と黒い瞳（+x が外向き）
  fishEye: {
    color: `vec3 orgColor(vec3 p, vec3 n, vec3 base){
      vec3 d = normalize(p);
      float a = acos(clamp(d.x, -1.0, 1.0));
      vec3 col = mix(vec3(0.015), uC1, smoothstep(0.78, 0.86, a));
      col = mix(col, uC1*0.3, smoothstep(1.0, 1.2, a));
      col += uC1 * 0.25 * smoothstep(0.8, 0.88, a) * (1.0 - smoothstep(0.92, 1.05, a)) * (snoise3(d*30.0)*0.5+0.5);
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
