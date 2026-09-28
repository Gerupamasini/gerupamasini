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

// 生き物や小物にも水中の減衰とコースティクスを与えるパッチ
export function applyUnderwater(mat, U) {
  if (mat.userData.uw) return;
  mat.userData.uw = true;
  const prev = mat.onBeforeCompile;
  const key = mat.userData.fish ? 'fish-uw' : 'uw';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    for (const k of ['uWater', 'uTime', 'uSunCol', 'uSunUp', 'uMurk', 'uAmbient']) sh.uniforms[k] = U[k];
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
        uniform float uWater; uniform float uTime; uniform vec3 uSunCol; uniform float uSunUp; uniform vec3 uMurk; uniform float uAmbient;
        ${CAUSTIC_GLSL}`)
      .replace('#include <opaque_fragment>', `{
          float uwD = uWater - vUWPos.y;
          if (uwD > 0.0) {
            vec3 c = caustic3(vUWPos.xz*0.11, uTime*0.45);
            outgoingLight += c * smoothstep(0.0,0.25,uwD) * exp(-uwD*0.45) * uSunCol * diffuseColor.rgb * 1.2 * uSunUp;
            outgoingLight = mix(uMurk * uAmbient, outgoingLight * exp(-vec3(0.62,0.36,0.46)*uwD*0.55), exp(-uwD*0.16));
          }
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}
