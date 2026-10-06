import { FrontSide, MeshDepthMaterial, MeshPhysicalMaterial, MeshStandardMaterial, RGBADepthPacking, Vector2, Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import type { OysterAtlas } from './bake';

/**
 * The oyster material: three's physical material driven by the baked atlas (bake.ts) and the vertex attributes of
 * geometry.ts, with everything that makes one oyster unlike its neighbour decided per instance:
 *
 *   state (x gape rad, y dead flag 0/1/2, z random phase 0..1, w erosion 0..1)
 *   look  (x colour key 0..1, y mud 0..1, z algae 0..1, w share of barnacle slots shown)
 *   plane attachment plane in the oyster's frame (n.xyz, d): the lower valve is pressed flat against it, so it sits
 *         cemented on its rock or on the shell below it; n = 0 for none
 *
 * They come from instance attributes on an InstancedMesh (iState, iLook, iPlane) and from uniforms otherwise.
 *
 * Wetness is read from the world: under the tide the shell is wet; above it, it stays wet as far up as the water
 * reached lately (the same wet mark the flat uses) and dries from the top, crevices last. A wet shell gets darker
 * and its water film is a clear coat with its own smooth highlight over the rough shell, which is what makes a
 * freshly exposed reef glisten in a macro photo; under the water the film is gone (the water pass draws the surface).
 */

/** shared by every oyster material: time, the water, and a viewer override of the wetness */
export const oysterEnv = {
  uOyTime: { value: 0 } as IUniform<number>,
  /** x the water level (T.P. m), y the recent high-water mark */
  uOyWater: { value: new Vector2(-10, -10) } as IUniform<Vector2>,
  /** ≥ 0 forces the wetness (viewer / studio); < 0 follows the water */
  uOyWetOverride: { value: -1 } as IUniform<number>,
};

const VERT_COMMON = /* glsl */ `
attribute vec4 aInfo;
#ifdef USE_INSTANCING
attribute vec4 iState;
attribute vec4 iLook;
attribute vec4 iPlane;
#define OY_STATE iState
#define OY_LOOK iLook
#define OY_PLANE iPlane
#else
uniform vec4 uState;
uniform vec4 uLook;
uniform vec4 uPlane;
#define OY_STATE uState
#define OY_LOOK uLook
#define OY_PLANE uPlane
#endif
uniform float uOyTime;
float oyHash(float n) { return fract(sin(n) * 43758.5453123); }
/** the angle this vertex turns about the hinge (+x): the upper valve and what follows it */
float oyAngle() {
  float g = OY_STATE.x;
  // a feeding oyster's gape is never quite still
  g *= 1.0 + 0.12 * sin(uOyTime * 0.55 + OY_STATE.z * 40.0) * step(OY_STATE.y, 0.5) * step(0.004, g);
  return -g * aInfo.y;
}
vec3 oyRot(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
bool oyHidden() {
  float part = aInfo.x;
  // dead: the soft parts are gone (barnacles and the ligament stay)
  if (OY_STATE.y > 0.5 && part > 4.5 && part != 8.0) return true;
  // only the cemented lower valve left: nothing of the lid
  if (OY_STATE.y > 1.5 && (part == 2.0 || part == 3.0 || ((part == 8.0 || part == 4.0) && aInfo.y > 0.5))) return true;
  // each oyster shows its own share of barnacle slots
  if (part == 8.0 && oyHash(aInfo.z * 12.9898 + OY_STATE.z * 78.233) > OY_LOOK.w) return true;
  return false;
}
/** the lower valve pressed onto its host: flattened below the plane, a fillet of cement just above it */
vec3 oyConform(vec3 p) {
  vec4 pl = OY_PLANE;
  if (dot(pl.xyz, pl.xyz) < 0.5 || aInfo.y > 0.01 || aInfo.x > 4.5 && aInfo.x != 8.0) return p;
  float band = 0.07 * aInfo.w;
  // the shell is thick where it is cemented: the cup's floor stays well above the host
  float floorD = aInfo.x == 1.0 ? 0.02 * aInfo.w : 0.0;
  float d = dot(pl.xyz, p) - pl.w - floorD;
  float d2 = d <= 0.0 ? 0.0 : d < band ? band * pow(d / band, 1.7) : d;
  return p + pl.xyz * (d2 - d);
}
varying vec4 vOyInfo;
varying vec4 vOyState;
varying vec4 vOyLook;
`;

const VERT_MAIN_EXTRA = /* glsl */ `
varying vec3 vOyWorld;
varying vec3 vOyNormalW;
`;

const BEGIN_NORMAL = /* glsl */ `
vec3 objectNormal = oyRot(vec3(normal), oyAngle());
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif
`;

const BEGIN_VERTEX = /* glsl */ `
vec3 transformed = oyConform(vec3(position));
if (aInfo.x == 9.0) transformed.y += sin(uOyTime * 2.3 + aInfo.z * 31.0) * 0.0007 * aInfo.w;
transformed = oyRot(transformed, oyAngle());
vOyInfo = aInfo;
vOyState = OY_STATE;
vOyLook = OY_LOOK;
`;

const DISPLACE = /* glsl */ `
#ifdef USE_DISPLACEMENTMAP
if (aInfo.x < 3.5 && aInfo.z < 0.5) {
  float oyH = texture2D(displacementMap, vDisplacementMapUv).x;
  transformed += normalize(objectNormal) * oyH * 0.001 * aInfo.w * displacementScale;
}
#endif
if (oyHidden()) transformed = vec3(0.0);
`;

const WORLD = /* glsl */ `
#include <project_vertex>
{
  vec4 oyW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  oyW = instanceMatrix * oyW;
#endif
  vOyWorld = (modelMatrix * oyW).xyz;
  vOyNormalW = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
}
`;

const FRAG_COMMON = /* glsl */ `
uniform sampler2D tOyMask;
uniform sampler2D tOyDetail;
uniform vec2 uOyDetailRep;
uniform float uOyDetailK;
uniform vec2 uOyWater;
uniform float uOyWetOverride;
uniform float uOyTime;
varying vec4 vOyInfo;
varying vec4 vOyState;
varying vec4 vOyLook;
varying vec3 vOyWorld;
varying vec3 vOyNormalW;
float oyH2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float oyN2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(oyH2(i), oyH2(i + vec2(1, 0)), f.x), mix(oyH2(i + vec2(0, 1)), oyH2(i + vec2(1, 1)), f.x), f.y); }
float oyF2(vec2 p) { return 0.5 * oyN2(p) + 0.3 * oyN2(p * 2.1 + 5.2) + 0.2 * oyN2(p * 4.3 + 1.7); }
float oyN3(vec3 p) { return oyF2(p.xz + p.y * 0.71) * 0.5 + oyF2(p.xy * 1.13 - p.z * 0.37) * 0.5; }
vec3 oyLin(vec3 c) { return pow(c, vec3(2.2)); }
// ground colours of the reference shells: dirty white, ash grey, cream, lilac grey, slate
vec3 oyGround(float k) {
  vec3 c0 = vec3(0.80, 0.78, 0.72), c1 = vec3(0.66, 0.65, 0.62), c2 = vec3(0.77, 0.72, 0.62), c3 = vec3(0.67, 0.64, 0.64), c4 = vec3(0.52, 0.51, 0.49);
  float x = fract(k) * 5.0;
  vec3 a = x < 1.0 ? c0 : x < 2.0 ? c1 : x < 3.0 ? c2 : x < 4.0 ? c3 : c4;
  vec3 b = x < 1.0 ? c1 : x < 2.0 ? c2 : x < 3.0 ? c3 : x < 4.0 ? c4 : c0;
  return oyLin(mix(a, b, smoothstep(0.3, 1.0, fract(x)) * 0.5));
}
// the purple of the rays and fresh edges: violet, brown-purple, blue-black
vec3 oyPigment(float k) {
  float h = fract(k * 7.31);
  vec3 c = h < 0.45 ? vec3(0.36, 0.20, 0.32) : h < 0.8 ? vec3(0.34, 0.22, 0.20) : vec3(0.16, 0.14, 0.19);
  return oyLin(c);
}
`;

const MAP_FRAGMENT = /* glsl */ `
float oyPart = floor(vOyInfo.x + 0.5);
bool oySoft = oyPart > 4.5 && oyPart != 8.0;
bool oyShell = oyPart < 3.5;
bool oyInside = oyPart == 1.0 || oyPart == 3.0;
vec2 oyUv = vNormalMapUv;
vec4 oyM = texture2D(tOyMask, oyUv);
float oyAO = oyShell ? texture2D(normalMap, oyUv).a : 1.0;
vec3 oyNw = normalize(vOyNormalW);
float oyUp = oyNw.y;
float oyKey = vOyLook.x;
float oyDead = step(0.5, vOyState.y);
// wet: under the water, in the swash just above it, or still drying since the tide left
float oyDepth = uOyWater.x - vOyWorld.y;
float oyUnder = smoothstep(0.0, 0.008, oyDepth);
float oyWet = max(oyUnder, 1.0 - smoothstep(uOyWater.x + 0.01, max(uOyWater.x, uOyWater.y) + 0.06, vOyWorld.y));
oyWet = max(oyWet, 1.0 - smoothstep(0.0, 0.1, -oyDepth));
// what faces the sky dries first; crevices and the soft parts stay wet longest
float oyCrev = 1.0 - oyAO;
oyWet *= mix(1.0, mix(0.35, 1.0, clamp(oyCrev * 2.5, 0.0, 1.0)), smoothstep(0.1, 0.9, oyUp) * (1.0 - oyUnder) * (oySoft ? 0.0 : 1.0));
if (uOyWetOverride >= 0.0) oyWet = max(uOyWetOverride, oyUnder);
// fouling: silt settles on what faces up and in the hollows; green algae and a brown film on the lid, lower down
vec3 oyWp = vOyWorld * 60.0;
float oyPatch = oyN3(oyWp * 0.35 + vOyState.z * 17.0);
float oyMud = (oyShell && (!oyInside || oyDead > 0.5)) ? vOyLook.y * clamp(smoothstep(-0.1, 0.8, oyUp) * 0.7 + oyCrev * 2.2, 0.0, 1.0) * smoothstep(0.25, 0.65, oyPatch + 0.2 * vOyLook.y) : 0.0;
float oyAlg = (oyShell && (!oyInside || oyDead > 0.5)) ? vOyLook.z * smoothstep(0.35, 0.9, oyUp) * smoothstep(0.55, 0.8, oyN3(oyWp * 0.6 + 3.1)) * (0.5 + 0.5 * oyN2(oyWp.xz * 9.0)) : 0.0;
float oyEroAmt = vOyState.w;
float oyEro = oyShell && !oyInside ? smoothstep(1.0 - oyEroAmt * 0.9, 1.15 - oyEroAmt * 0.9, oyM.a) : 0.0;
vec3 oyCol;
float oyRough;
float oyPorous = 0.6;
if (oyShell && !oyInside) {
  vec3 ground = oyGround(oyKey) * (0.55 + 0.6 * oyM.r) * (0.78 + 0.32 * fract(oyKey * 13.1));
  vec3 pigC = oyPigment(oyKey);
  // some individuals are washed all over with the purple-black pigment, others hardly at all
  ground = mix(ground, pigC * (0.7 + 0.6 * oyM.r), smoothstep(0.72, 1.0, fract(oyKey * 5.9)) * 0.75 * (1.0 - oyDead));
  float pigAmt = clamp(0.2 + 0.75 * fract(oyKey * 3.7) - 0.4 * oyDead, 0.0, 1.0);
  oyCol = mix(ground, pigC * (0.55 + 0.7 * oyM.r), clamp(oyM.g * pigAmt, 0.0, 1.0));
  oyCol = mix(oyCol, pigC * 0.6, oyM.b * 0.4 * (0.4 + pigAmt));
  // worn through the outer layer: chalky white with the purple of the layers beneath
  vec3 chalk = mix(oyLin(vec3(0.8, 0.78, 0.74)), oyLin(vec3(0.6, 0.53, 0.6)), smoothstep(0.3, 0.8, oyN2(oyUv * 900.0)) * 0.7) * (0.8 + 0.25 * oyM.r);
  oyCol = mix(oyCol, chalk, oyEro);
  // dirt and biofilm settle in every hollow of the sculpture
  oyCol *= mix(0.55, 1.0, smoothstep(0.35, 0.95, oyAO));
  // the dead bleach and go grey
  oyCol = mix(oyCol, oyLin(vec3(0.7, 0.69, 0.66)) * (0.7 + 0.4 * oyM.r), oyDead * 0.55);
  // a break: fresh calcite, white-grey in fine layers
  if (vOyInfo.z > 0.5) oyCol = oyLin(vec3(0.84, 0.82, 0.78)) * (0.85 + 0.15 * sin(vOyWorld.y * 9000.0 + vOyWorld.x * 3000.0)) * mix(1.0, 0.7, oyDead);
  oyRough = texture2D(roughnessMap, oyUv).g;
  oyRough = mix(oyRough, 0.9, oyEro);
  oyPorous = 0.7 + 0.3 * oyEro;
} else if (oyInside) {
  // calcite porcelain, not nacre: white with a faint green or blue cast, chalky patches, the scar purple or pale
  vec3 por = oyLin(mix(vec3(0.93, 0.92, 0.88), fract(oyKey * 5.3) < 0.5 ? vec3(0.88, 0.91, 0.87) : vec3(0.89, 0.89, 0.92), 0.6)) * (0.78 + 0.25 * oyM.r);
  vec3 scar = fract(oyKey * 2.9) < 0.65 ? oyPigment(oyKey) * 1.4 : oyLin(vec3(0.7, 0.62, 0.55));
  oyCol = mix(por, scar, clamp(oyM.g * 1.2, 0.0, 1.0) * (0.85 - 0.3 * oyDead));
  oyCol = mix(oyCol, oyLin(vec3(0.95, 0.94, 0.9)), oyM.a * 0.5);
  oyCol = mix(oyCol, oyCol * oyLin(vec3(0.8, 0.8, 0.74)), oyDead * 0.6);
  oyRough = texture2D(roughnessMap, oyUv).g + oyDead * 0.3;
  oyPorous = 0.25 + 0.6 * oyM.a + oyDead * 0.3;
} else if (oyPart == 5.0 || oyPart == 6.0) {
  // mantle: cream where it lines the shell, its margin pigmented brown-black with darker flecks
  float t = vNormalMapUv.x;
  float edge = smoothstep(0.45 + 0.1 * sin(vNormalMapUv.y * 90.0 + vOyInfo.z * 20.0), 0.85, t);
  vec3 cream = oyLin(vec3(0.66, 0.6, 0.5));
  vec3 dark = mix(oyLin(vec3(0.24, 0.19, 0.14)), oyLin(vec3(0.05, 0.045, 0.04)), vOyLook.x > 0.0 ? clamp(fract(vOyInfo.z * 9.1) * 0.5 + 0.5, 0.0, 1.0) : 1.0);
  oyCol = mix(cream, dark, edge);
  oyCol *= 0.8 + 0.3 * oyN2(vNormalMapUv * vec2(6.0, 400.0));
  oyRough = 0.32;
  oyPorous = 0.0;
} else if (oyPart == 9.0) {
  oyCol = oyLin(vec3(0.07, 0.06, 0.05)) * (0.8 + 0.5 * vOyInfo.z);
  oyRough = 0.3;
  oyPorous = 0.0;
} else if (oyPart == 7.0) {
  // the body: cream to beige, the gill folds as fine dark lines
  float gill = smoothstep(0.5, 1.0, 0.5 + 0.5 * sin(vNormalMapUv.x * 260.0 + oyN2(vNormalMapUv * vec2(30.0, 9.0)) * 6.0)) * smoothstep(0.35, 0.8, vNormalMapUv.y);
  oyCol = mix(oyLin(vec3(0.62, 0.55, 0.43)), oyLin(vec3(0.4, 0.33, 0.25)), gill * 0.4) * (0.8 + 0.3 * oyN2(vNormalMapUv * vec2(20.0, 14.0)));
  oyRough = 0.3;
  oyPorous = 0.0;
} else if (oyPart == 4.0) {
  oyCol = oyLin(vec3(0.13, 0.1, 0.07));
  oyRough = 0.55;
  oyPorous = 0.3;
} else {
  // barnacle: off-white wall plates with purple stripes on some, a dark slit of opercular plates at the top
  float stripe = smoothstep(0.4, 0.9, 0.5 + 0.5 * sin(vNormalMapUv.x * 6.2831853 * 18.0)) * step(0.45, fract(vOyInfo.z * 0.37 + vOyState.z * 3.0));
  vec3 wall = mix(oyLin(vec3(0.66, 0.64, 0.6)), oyLin(vec3(0.42, 0.32, 0.38)), stripe * 0.7);
  // grime in the sutures between the plates and at the foot
  float suture = smoothstep(0.85, 1.0, 0.5 + 0.5 * cos(vNormalMapUv.x * 6.2831853 * 6.0));
  wall *= (1.0 - 0.45 * suture) * mix(0.55, 1.0, smoothstep(0.0, 0.35, vNormalMapUv.y)) * (0.75 + 0.35 * oyN2(vNormalMapUv * vec2(40.0, 8.0)));
  float top = smoothstep(0.8, 0.9, vNormalMapUv.y);
  oyCol = mix(wall, oyLin(vec3(0.2, 0.18, 0.16)), top);
  oyCol = mix(oyCol, oyLin(vec3(0.72, 0.7, 0.66)), oyDead * 0.3);
  oyRough = mix(0.62, 0.45, top);
  oyPorous = 0.5;
}
// silt and algae over the shell
vec3 oyMudC = oyLin(vec3(0.32, 0.29, 0.24)) * (0.8 + 0.3 * oyPatch);
oyCol = mix(oyCol, oyMudC, oyMud * 0.9);
vec3 oyAlgC = mix(oyLin(vec3(0.14, 0.24, 0.08)), oyLin(vec3(0.26, 0.22, 0.11)), smoothstep(0.4, 0.6, oyN3(oyWp * 0.2 + 9.0))) * (0.7 + 0.5 * oyN2(oyWp.xz * 23.0));
oyCol = mix(oyCol, oyAlgC, oyAlg * 0.85);
oyRough = mix(oyRough, 0.85, oyMud * (1.0 - oyWet));
oyRough = mix(oyRough, 0.45, oyAlg);
// water darkens what soaks it up and smooths the micro relief
oyPorous = max(oyPorous, oyMud);
oyCol *= mix(1.0, 0.64 + 0.28 * (1.0 - oyPorous), oyWet);
oyRough = mix(oyRough, oyRough * mix(0.78, 0.55, oyUnder), oyWet);
// soft parts sit deep in the gape, in the valves' shade
if (oySoft) oyCol *= 0.55;
diffuseColor.rgb = oyCol;
// water film (clear coat): a smooth, slightly beaded film while the shell is wet in the air; gone under water
// the film drains off crests and lies in the hollows; it beads, so it is broken up
float oyFilm = smoothstep(0.3, 0.7, oyN3(oyWp * 1.7 + 4.0));
float oyCoat = oyWet * (1.0 - oyUnder) * (oySoft ? 0.9 : (0.18 + 0.55 * clamp(oyCrev * 3.5 + oyMud, 0.0, 1.0)) * (0.45 + 0.55 * oyFilm));
float oyCoatRough = 0.08 + 0.18 * (1.0 - oyFilm) + 0.15 * (1.0 - oyWet);
`;

const ROUGHNESS = /* glsl */ `
float roughnessFactor = clamp(oyRough, 0.04, 1.0);
`;

const NORMAL_MAPS = /* glsl */ `
#ifdef USE_NORMALMAP_TANGENTSPACE
vec3 mapN = vec3(0.0, 0.0, 1.0);
if (oyShell) {
  mapN = texture2D(normalMap, oyUv).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  vec3 oyDet = texture2D(tOyDetail, oyUv * uOyDetailRep).xyz * 2.0 - 1.0;
  mapN.xy += oyDet.xy * uOyDetailK * (oyInside ? 0.35 : 1.0);
  // worn, silted and overgrown spots lose their relief; the water film does not
  mapN.xy *= (1.0 - 0.6 * oyEro) * (1.0 - 0.75 * oyMud) * (1.0 - 0.5 * oyAlg);
} else if (oyPart == 8.0) {
  float a = vNormalMapUv.x * 6.2831853;
  mapN.x += 0.35 * cos(a * 18.0) + 0.15 * (oyN2(vNormalMapUv * vec2(60.0, 12.0)) - 0.5);
  mapN.y += 0.2 * (oyN2(vNormalMapUv * vec2(30.0, 30.0)) - 0.5);
} else if (oySoft) {
  mapN.xy += 0.25 * (vec2(oyN2(vNormalMapUv * vec2(40.0, 500.0)), oyN2(vNormalMapUv * vec2(40.0, 500.0) + 7.7)) - 0.5);
}
normal = normalize(tbn * mapN);
#endif
`;

const LIGHTS_PHYSICAL = /* glsl */ `
#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat = oyCoat;
material.clearcoatRoughness = min(max(oyCoatRough, 0.0525) + geometryRoughness, 1.0);
#endif
`;

const AO = /* glsl */ `
float ambientOcclusion = oyAO;
if (oySoft) ambientOcclusion = oyPart == 7.0 ? 0.25 : 0.4;
reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined( USE_CLEARCOAT )
clearcoatSpecularIndirect *= ambientOcclusion;
#endif
#if defined( USE_ENVMAP ) && defined( STANDARD )
{
  float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
}
#endif
`;

export interface OysterMaterialUniforms {
  uState: IUniform<Vector4>;
  uLook: IUniform<Vector4>;
  uPlane: IUniform<Vector4>;
}

export type OysterMaterial = (MeshPhysicalMaterial | MeshStandardMaterial) & { oy: OysterMaterialUniforms; lod: 0 | 1 | 2; atlas: OysterAtlas };

function injectVertex(shader: WebGLProgramParametersWithUniforms, depthOnly: boolean): void {
  let vs = shader.vertexShader;
  vs = vs.replace('#include <common>', `#include <common>\n${VERT_COMMON}${depthOnly ? '' : VERT_MAIN_EXTRA}`);
  if (!depthOnly) {
    vs = vs.replace('#include <beginnormal_vertex>', BEGIN_NORMAL);
    vs = vs.replace('#include <project_vertex>', WORLD);
  }
  vs = vs.replace('#include <begin_vertex>', BEGIN_VERTEX);
  vs = vs.replace('#include <displacementmap_vertex>', depthOnly ? 'if (oyHidden()) transformed = vec3(0.0);' : DISPLACE);
  shader.vertexShader = vs;
}

/**
 * One oyster material for a level of detail: 0 macro (displacement, detail normal, clear-coat film), 1 game
 * distance (no displacement), 2 far (standard material, no film, no detail). Share one per LOD across a whole reef;
 * clone it (cloneOysterMaterial) where a single mesh needs its own state uniforms.
 */
export function makeOysterMaterial(atlas: OysterAtlas, lod: 0 | 1 | 2): OysterMaterial {
  const physical = lod < 2;
  const params = {
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    normalMap: atlas.normal,
    normalScale: new Vector2(1, 1),
    roughnessMap: atlas.hr,
    side: FrontSide,
  };
  const m = (physical
    ? new MeshPhysicalMaterial({ ...params, clearcoat: 1, clearcoatRoughness: 0.08, ...(lod === 0 ? { displacementMap: atlas.hr, displacementScale: 1 } : {}) })
    : new MeshStandardMaterial(params)) as OysterMaterial;
  m.name = `oyster-lod${lod}`;
  m.lod = lod;
  m.atlas = atlas;
  m.oy = { uState: { value: new Vector4(0, 0, 0.5, 0.3) }, uLook: { value: new Vector4(0.5, 0.3, 0.2, 1) }, uPlane: { value: new Vector4(0, 0, 0, 0) } };
  installHooks(m);
  return m;
}

function installHooks(m: OysterMaterial): void {
  const atlas = m.atlas, lod = m.lod;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, oysterEnv, m.oy, {
      tOyMask: { value: atlas.mask },
      tOyDetail: { value: atlas.detail },
      uOyDetailRep: { value: atlas.detailRep },
      uOyDetailK: { value: lod === 0 ? 0.55 : lod === 1 ? 0.3 : 0 },
    });
    injectVertex(shader, false);
    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\n${FRAG_COMMON}`);
    fs = fs.replace('#include <map_fragment>', MAP_FRAGMENT);
    fs = fs.replace('#include <roughnessmap_fragment>', ROUGHNESS);
    fs = fs.replace('#include <normal_fragment_maps>', NORMAL_MAPS);
    fs = fs.replace('#include <lights_physical_fragment>', LIGHTS_PHYSICAL);
    fs = fs.replace('#include <aomap_fragment>', AO);
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `oyster-v1-${lod}`;
  // shadows: the depth pass sees the same opened lid, hidden parts and cemented base
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, oysterEnv, m.oy);
    injectVertex(shader, true);
  };
  depth.customProgramCacheKey = () => 'oyster-depth-v1';
  (m as OysterMaterial & { depthMaterial: MeshDepthMaterial }).depthMaterial = depth;
}

/** The depth material that goes with an oyster material (set it as the mesh's customDepthMaterial). */
export function depthOf(m: OysterMaterial): MeshDepthMaterial {
  return (m as OysterMaterial & { depthMaterial: MeshDepthMaterial }).depthMaterial;
}

/** A copy with its own state / look / plane uniforms (same shader program). */
export function cloneOysterMaterial(src: OysterMaterial): OysterMaterial {
  const m = src.clone() as OysterMaterial;
  m.lod = src.lod;
  m.atlas = src.atlas;
  m.oy = { uState: { value: src.oy.uState.value.clone() }, uLook: { value: src.oy.uLook.value.clone() }, uPlane: { value: src.oy.uPlane.value.clone() } };
  installHooks(m);
  return m;
}

/** Fill a look vector (colour key, mud, algae, barnacles) from a genome-like source. */
export function lookOf(g: { colorKey: number; mud: number; algae: number; barnacles: number }, out = new Vector4()): Vector4 {
  return out.set(g.colorKey, g.mud, g.algae, g.barnacles);
}
