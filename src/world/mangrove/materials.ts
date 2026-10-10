import { DoubleSide, FrontSide, MeshDepthMaterial, MeshPhysicalMaterial, MeshStandardMaterial, RGBADepthPacking, Vector2,
  type IUniform, type Texture, type WebGLProgramParametersWithUniforms } from 'three';

export interface HirugiUniforms {
  uHgTime: IUniform<number>; uHgWater: IUniform<number>; uHgWet: IUniform<number>; uHgWind: IUniform<number>;
  uHgGround: IUniform<Texture>; uHgGrid: IUniform<Vector2>;
  uHgLeafAtlas: IUniform<Texture>;
}
export type TreePart = 'Trunk' | 'Branches' | 'Leaves' | 'Roots';
export const PARTS: TreePart[] = ['Trunk', 'Branches', 'Leaves', 'Roots'];

const VERTEX = /* glsl */`
attribute vec4 aSeeds;
attribute vec3 aDetail;
attribute vec3 aCenter;
uniform float uHgTime, uHgWind;
uniform sampler2D uHgGround;
uniform vec2 uHgGrid;
varying vec3 vHgWorld;
varying vec3 vHgDetail;
varying float vHgSeed;
varying float vHgAbove;
float hgGroundAt(vec2 xz) {
  float n = uHgGrid.y;
  return texture2D(uHgGround, ((xz / uHgGrid.x + 0.5) * (n - 1.0) + 0.5) / n).r;
}
vec3 hgShape(vec3 p) {
  float y = max(p.y, 0.0), t = clamp(y / 2.0, 0.0, 1.0);
  float lean = y * t * t * (3.0 - 2.0 * t);
  float spread = 1.0;
  float twist = 0.0;
  #if HG_ROOT == 1
    float weight = max(0.0, 1.0 - y / 2.6);
    spread += (aSeeds.y - 0.5) * 0.28 * weight;
    twist = weight * (aSeeds.y - 0.5) * 0.16 * sin(p.x*1.4+p.z*0.8);
  #endif
  float c = cos(twist), sn = sin(twist);
  vec3 q = vec3((p.x*c-p.z*sn) * spread + (aSeeds.x - 0.5) * 0.14 * lean, p.y,
    (p.x*sn+p.z*c) * spread + sin(aSeeds.x * 6.28318530718) * 0.055 * lean);
  #if HG_ROOT == 1
    vec4 w = instanceMatrix * vec4(q, 1.0);
    float ground = hgGroundAt(w.xz);
    float scale = length(instanceMatrix[1].xyz);
    float k = clamp(1.0 - y / 1.35, 0.0, 1.0);
    q.y += (ground - instanceMatrix[3].y) / scale * k * k * (3.0 - 2.0 * k);
  #endif
  #if HG_LEAF == 1
    // Per-individual leaf orientation, plus 1–2 cm wind displacement. Wood and collision remain still.
    float angle = (aSeeds.z - 0.5) * 0.5;
    vec3 delta = p - aCenter;
    q.x += delta.x * (cos(angle) - 1.0) - delta.z * sin(angle);
    q.z += delta.x * sin(angle) + delta.z * (cos(angle) - 1.0);
    float phase = aDetail.y * 6.2831853 + aSeeds.z * 17.0;
    float wave = sin(uHgTime * 1.6 + phase + q.y * 0.8) + 0.35 * sin(uHgTime * 2.7 + q.x);
    q.x += uHgWind * aDetail.z * aDetail.z * wave * 0.012;
    q.z += uHgWind * aDetail.z * wave * 0.006;
  #endif
  return q;
}
vec3 hgNormal(vec3 p, vec3 n) {
  vec3 u = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0)));
  vec3 v = cross(n, u);
  return normalize(cross(hgShape(p + u * 0.001) - hgShape(p - u * 0.001), hgShape(p + v * 0.001) - hgShape(p - v * 0.001)));
}
`;
const FRAGMENT = /* glsl */`
varying vec3 vHgWorld;
varying vec3 vHgDetail;
varying float vHgSeed;
varying float vHgAbove;
uniform float uHgWater, uHgWet;
uniform sampler2D uHgLeafAtlas;
float hgWet = 0.0;
float hgRelief = 0.0;
float hgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float hgNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hgHash(i),hgHash(i+vec2(1,0)),f.x),mix(hgHash(i+vec2(0,1)),hgHash(i+1.0),f.x),f.y);
}
// Tier 1: LOD1 quad, analytic leaf outline (petiole, elliptic blade, mucro) - no texture fetch.
// Tier 2: LOD2 twig card, rosette atlas (RG: each leaf's own UV, A: coverage). Mip-aware cutoff keeps far coverage.
vec2 hgProxyLeaf(vec2 uv, float phase, float tier, out float mask) {
  if (tier < 1.5) {
    float t = uv.y, w = 0.5 * pow(max(sin(3.14159265 * pow(t, 0.9)), 0.0), 0.62) * (t < 0.08 ? 0.25 : 1.0);
    float edge = fwidth(uv.x) * 0.7;
    mask = smoothstep(-edge, edge, w - abs(uv.x - 0.5));
    mask = step(0.5, mask);
    return uv;
  }
  // Filler cards are only for mass at range; within 3-5 m the real leaves carry the crown. Dithered, no pop.
  #ifdef HG_VIEW
    if (length(vViewPosition) < 3.0 + 2.0 * hgHash(floor(gl_FragCoord.xy))) { mask = 0.0; return uv; }
  #endif
  float tile=floor(fract(phase+vHgSeed)*16.0);
  vec2 at=(vec2(mod(tile,4.0),floor(tile/4.0))+0.01+uv*0.98)/4.0;
  vec4 sampleLeaf=texture2D(uHgLeafAtlas,at);
  float footprint=max(fwidth(uv.x),fwidth(uv.y));
  float cutoff=mix(0.5,0.22,smoothstep(0.01,0.06,footprint));
  mask=step(cutoff,sampleLeaf.a);
  return sampleLeaf.rg;
}
float hgBark(vec2 uv) {
  // Rhizophora bark (photos 21, 44): smooth pale grey skin, fine longitudinal fissures,
  // sparse corky lenticels (round, slightly raised) at random offsets - not a regular dash grid.
  float fissure = hgNoise(uv * vec2(60.0, 4.0)) * 0.6 + hgNoise(uv * vec2(190.0, 11.0)) * 0.4;
  fissure = smoothstep(0.62, 0.86, fissure);
  vec2 cell = uv * vec2(38.0, 30.0), id = floor(cell);
  vec2 jitter = vec2(hgHash(id + 1.7), hgHash(id + 5.3)) - 0.5;
  float lenticel = (1.0 - smoothstep(0.08, 0.2, length((fract(cell) - 0.5 - jitter * 0.5) * vec2(1.0, 1.6)))) * step(0.78, hgHash(id));
  float mottle = hgNoise(uv * vec2(9.0, 2.5)) - 0.5;
  return mottle * 0.34 - fissure * 0.5 + lenticel * 0.26;
}
`;
const COLOR = /* glsl */`
#if HG_LEAF == 1
  vec2 hgUv=vUv;
  if(vHgDetail.x>1.5){float mask;hgUv=hgProxyLeaf(vUv,vHgDetail.y,floor(vHgDetail.x/2.0),mask);if(mask<0.5)discard;}
  float midrib = exp(-pow((hgUv.x - 0.5) * 95.0, 2.0));
  float lateral = abs(hgUv.x - 0.5);
  float vein = pow(max(0.0,cos((hgUv.y - lateral * 0.3)*72.0)),10.0) * smoothstep(0.025,0.08,lateral) * (1.0-smoothstep(0.32,0.49,lateral));
  float age = mod(vHgDetail.x,2.0);
  // Photo 43: glossy mid-green mature leaves, yellow-green new pairs; underside pale with dark cork warts.
  vec3 top = mix(vec3(0.20,0.40,0.035),vec3(0.055,0.17,0.022),age);
  vec3 underside = mix(vec3(0.27,0.36,0.09),vec3(0.17,0.27,0.075),age);
  float mottling = hgNoise(hgUv*vec2(33,42)+vHgDetail.y*17.0);
  vec2 spotCell = hgUv*vec2(28,40), spotId = floor(spotCell);
  float speckle = (1.0-smoothstep(0.025,0.1,length(fract(spotCell)-0.5))) * step(0.68,hgHash(spotId));
  vec3 leafColor = gl_FrontFacing ? top : underside * (1.0-speckle*0.65);
  leafColor *= 0.9 + mottling*0.17 + vHgSeed*0.12;
  leafColor += vec3(0.03,0.044,0.007)*(midrib+vein*0.25);
  // Sparse senescent leaves without turning the entire canopy autumn-yellow.
  leafColor = mix(leafColor,vec3(0.31,0.30,0.03),smoothstep(0.975,1.0,vHgDetail.y)*age);
  diffuseColor.rgb *= leafColor;
  hgRelief = midrib * 0.00010 + vein * 0.000016;
#else
  float coarse = hgNoise(vUv*vec2(8,3)+vHgSeed*23.0);
  float fine = hgBark(vUv);
  hgWet = 1.0 - smoothstep(uHgWet-0.06,uHgWet+0.22,vHgWorld.y);
  float soaked = 1.0-smoothstep(uHgWater-0.03,uHgWater+0.045,vHgWorld.y);
  vec3 bark = mix(vec3(0.21,0.18,0.14),vec3(0.40,0.38,0.33),coarse);
  bark *= 0.92 + fine*0.4;
  // Narrow olive biofilm at the tidal stain, exposed wet wood remains brown-grey.
  float algae = exp(-abs(vHgWorld.y-uHgWet+0.14)*9.0)*hgNoise(vUv*19.0)*0.45;
  bark = mix(bark,vec3(0.081,0.105,0.037),algae);
  bark *= 1.0-hgWet*0.43-soaked*0.08;
  // Mud splash/coating on the lowest 20-40 cm of each prop root and stem base, ragged upper edge.
  float mudLine = 0.18 + 0.2 * hgNoise(vUv * vec2(3.0, 1.2) + vHgSeed * 9.0);
  float mud = 1.0 - smoothstep(mudLine - 0.12, mudLine, vHgAbove);
  bark = mix(bark, mix(vec3(0.115,0.098,0.074), vec3(0.06,0.052,0.042), hgWet), mud * 0.9);
  // Sparse barnacle / oyster spat inside the intertidal band (above the mud, below the wet line).
  vec2 bc = vUv * vec2(42.0, 60.0), bid = floor(bc);
  float barnacle = (1.0 - smoothstep(0.16, 0.3, length(fract(bc) - 0.5))) * step(0.86, hgHash(bid + 3.1))
    * smoothstep(0.1, 0.3, vHgAbove) * (1.0 - smoothstep(uHgWet - 0.15, uHgWet + 0.05, vHgWorld.y));
  bark = mix(bark, vec3(0.42,0.40,0.36), barnacle * 0.8);
  hgWet = max(hgWet, mud * 0.75);
  diffuseColor.rgb *= bark;
  hgRelief = fine*0.0024 + barnacle*0.0016 - mud*fine*0.0008;
#endif
`;

function hook(shader: WebGLProgramParametersWithUniforms, u: HirugiUniforms, part: TreePart, depth: boolean): void {
  Object.assign(shader.uniforms, u);
  const leaf = part === 'Leaves', root = part === 'Roots';
  shader.defines ??= {}; Object.assign(shader.defines, { HG_LEAF: leaf ? 1 : 0, HG_ROOT: root ? 1 : 0 });
  if (!depth) shader.defines.HG_VIEW = 1;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX}`)
    .replace('#include <begin_vertex>', `vec3 transformed = hgShape(position);
vHgWorld = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz;
vHgDetail = aDetail; vHgSeed = aSeeds.z; vHgAbove = vHgWorld.y - hgGroundAt(vHgWorld.xz);`);
  if (depth) {
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${FRAGMENT}`)
      .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
#if HG_LEAF == 1
if(vHgDetail.x>1.5){float mask;hgProxyLeaf(vUv,vHgDetail.y,floor(vHgDetail.x/2.0),mask);if(mask<0.5)discard;}
#endif
`);
    return;
  }
  shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = hgNormal(position,normal);');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT}`)
    .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR}`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = ${leaf ? '(gl_FrontFacing ? 0.32 : 0.65)' : 'mix(0.82,0.30,hgWet)'};`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
// Derivative bump in physical metres. Damp at distance to avoid shimmering microdetail.
vec3 hgDx = dFdx(-vViewPosition), hgDy = dFdy(-vViewPosition);
vec3 hgR1 = cross(hgDy,normal), hgR2 = cross(normal,hgDx);
float hgDet = dot(hgDx,hgR1);
float hgFade = 1.0-smoothstep(6.0,18.0,length(vViewPosition));
if (abs(hgDet)>1e-10) normal = normalize(abs(hgDet)*normal - sign(hgDet)*(dFdx(hgRelief)*hgR1+dFdy(hgRelief)*hgR2)*hgFade);
`);
  if (leaf) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// A restrained thin-leaf transmission term; veins remain opaque in the surface shading.
totalEmissiveRadiance += diffuseColor.rgb * (gl_FrontFacing ? 0.015 : 0.12);
`);
}

export function treeMaterial(u: HirugiUniforms, part: TreePart): MeshStandardMaterial {
  const m = part === 'Leaves' ? new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0, clearcoat: 0.24, clearcoatRoughness: 0.28, side: DoubleSide })
    : new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  m.name = `YaeyamaHirugi/${part}`; m.onBeforeCompile = (s) => hook(s, u, part, false);
  m.defines = { ...m.defines, USE_UV: '' };
  m.customProgramCacheKey = () => `hirugi-v4-${part}`;
  return m;
}
export function treeDepth(u: HirugiUniforms, part: TreePart): MeshDepthMaterial {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: part === 'Leaves' ? DoubleSide : FrontSide });
  m.defines = { ...m.defines, USE_UV: '' };
  m.onBeforeCompile = (s) => hook(s, u, part, true); m.customProgramCacheKey = () => `hirugi-depth-v3-${part}`; return m;
}
