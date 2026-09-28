// 共通 GLSL チャンク

export const NOISE_GLSL = /* glsl */ `
vec3 _m289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 _m289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 _perm(vec3 x){return _m289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
  i=_m289(i);
  vec3 p=_perm(_perm(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;
  vec3 h=abs(x)-0.5;
  vec3 ox=floor(x+0.5);
  vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
`;

// 水中コースティクス（タイル可能な干渉パターン）
export const CAUSTIC_GLSL = /* glsl */ `
float causticL(vec2 uv, float time){
  vec2 p = mod(uv*6.28318, 6.28318) - 250.0;
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for(int n=0;n<4;n++){
    float t = time*(1.0-(3.5/float(n+1)));
    i = p + vec2(cos(t-i.x)+sin(t+i.y), sin(t-i.y)+cos(t+i.x));
    c += 1.0/length(vec2(p.x/(sin(i.x+t)/inten), p.y/(cos(i.y+t)/inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
vec3 caustic3(vec2 uv, float t){
  return vec3(causticL(uv+vec2(0.004,0.0),t), causticL(uv,t), causticL(uv-vec2(0.004,0.003),t));
}
`;

// 3D ノイズとセルノイズ（生き物の模様・粒状突起用）
export const NOISE3_GLSL = /* glsl */ `
vec4 n3_perm(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 n3_tis(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise3(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = n3_perm(n3_perm(n3_perm(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = n3_tis(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
vec3 n3_h33(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
// x: 最近点距離, y: 2番目の距離, z: セルの乱数
vec3 cell3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int z=-1; z<=1; z++) for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = n3_h33(i + g);
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = o.x; } else if (d < d2) { d2 = d; }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
float fbm3(vec3 p){ return snoise3(p)*0.55 + snoise3(p*2.07+11.3)*0.3 + snoise3(p*4.3-7.1)*0.15; }
`;

// 太陽の影マップの可視度（コースティクスを影でマスクする）
export const SUNVIS_GLSL = /* glsl */ `
  float sunVis = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    sunVis = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
  #endif
`;

// 小物（貝殻片など）に水中のコースティクスを与えるパッチ。
// 水による吸収・散乱はスクリーン空間の水面パスで一括して計算する。
export function applyUnderwater(mat, U) {
  if (mat.userData.uw) return;
  mat.userData.uw = true;
  const prev = mat.onBeforeCompile;
  const key = (mat.userData.key || '') + 'uw2';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    for (const k of ['uWater', 'uTime', 'uSunCol', 'uSunUp']) sh.uniforms[k] = U[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vUWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vUWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vUWPos;
        uniform float uWater; uniform float uTime; uniform vec3 uSunCol; uniform float uSunUp;
        ${CAUSTIC_GLSL}`)
      .replace('#include <opaque_fragment>', `{
          ${SUNVIS_GLSL}
          float uwD = uWater - vUWPos.y;
          if (uwD > 0.0) {
            vec3 c = caustic3(vUWPos.xz*0.11, uTime*0.45);
            outgoingLight += c * smoothstep(0.0,0.2,uwD) * exp(-uwD*0.12) * uSunCol * diffuseColor.rgb * 1.3 * uSunUp * sunVis;
          }
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}
