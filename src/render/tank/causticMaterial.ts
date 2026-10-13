import { ShaderChunk, type IUniform, type Material, type MeshStandardMaterial } from 'three';
import { CAUSTIC_LIGHT, TANK_COMMON } from './glsl';

export interface CausticOptions {
  /** the material's own shader injection, run first (a model's skin, the sand's grains) */
  chain?: MeshStandardMaterial['onBeforeCompile'];
  /** the leaves sway in the current (the plants) */
  sway?: boolean;
  /** extra uniforms the chained injection reads */
  uniforms?: Record<string, IUniform>;
}

const SPOT_INFO = 'getSpotLightInfo( spotLight, geometryPosition, directLight );';
const LIGHTS_BEGIN = ShaderChunk.lights_fragment_begin.includes(SPOT_INFO)
  ? ShaderChunk.lights_fragment_begin.replace(SPOT_INFO, `${SPOT_INFO}\n\t\tdirectLight.color *= tankMod;`)
  : null;

/**
 * Light a standard material by the bar through the moving surface. The spot light (the bar, with its shadows and its
 * highlights) is modulated by the caustic net, normalised by its own blurred average so the bar's brightness is kept;
 * the net splits a little into its colours; a weak share is added on top (light scattered in the water); the sand
 * lit by the net lights the undersides from below. Above the water the material is left as it was.
 */
export function lightByCaustics(m: MeshStandardMaterial, U: Record<string, IUniform>, key: string, o: CausticOptions = {}): void {
  m.onBeforeCompile = (shader, renderer) => {
    o.chain?.(shader, renderer);
    Object.assign(shader.uniforms, U, o.uniforms);
    let vs = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTankP;\nuniform vec3 uTankOrigin;\nuniform float uTime;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{
  vec4 tankW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  tankW = instanceMatrix * tankW;
  #endif
  vTankP = (modelMatrix * tankW).xyz - uTankOrigin;
}`);
    if (o.sway) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
{
  // the blade bends from its foot, more toward the tip; each plant at its own phase
  float k = max(transformed.y, 0.0) / 0.12;
  vec2 ph = modelMatrix[3].xz * 37.0 + atan(position.z, position.x + 1e-4) * 2.3;
  transformed.x += k * k * (0.006 * sin(uTime * 1.1 + ph.x) + 0.003 * sin(uTime * 2.3 + ph.y));
  transformed.z += k * k * 0.004 * sin(uTime * 0.9 + ph.y + 1.7);
}`);
    shader.vertexShader = vs;
    // (sampled outside any branch: the net's mip level comes from the screen derivatives)
    const decl = `
float tankWet = step(vTankP.y, uWaterLevel);
vec3 tankCaus = tankCaustic(vTankP) * tankWet;
vec3 tankSoft = uCausScale * textureLod(uCaus, causUV(vTankP.xz), 5.0).rgb * tankWet;
vec3 tankMod = mix(vec3(1.0), clamp(tankCaus / max(tankSoft, vec3(1e-3)), 0.0, 5.0), tankWet);`;
    const fs = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vTankP;\n${TANK_COMMON}\n${CAUSTIC_LIGHT}\nuniform float uBounce;`);
    // a chained injection that dropped the lights' start keeps its own light; the net is then only added on top
    const hasBegin = fs.includes('#include <lights_fragment_begin>');
    shader.fragmentShader = (hasBegin ? fs.replace('#include <lights_fragment_begin>', `${decl}\n${LIGHTS_BEGIN ?? '#include <lights_fragment_begin>'}`) : fs)
      .replace('#include <lights_fragment_end>', `${hasBegin ? '' : decl}
#include <lights_fragment_end>
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  float up = clamp(nW.y, 0.0, 1.0);
  // light scattered in the water: a weak share of the net on top of the spot
  reflectedLight.directDiffuse += uLampCol * tankCaus * (0.06 + 0.12 * up) * BRDF_Lambert(diffuseColor.rgb);
  // the bright sand below lights the undersides
  reflectedLight.indirectDiffuse += uLampCol * tankSoft * uBounce * clamp(-nW.y * 0.8 + 0.2, 0.0, 1.0) * BRDF_Lambert(diffuseColor.rgb);
}`);
  };
  m.customProgramCacheKey = () => `${key}${o.sway ? '-sway' : ''}`;
}

/** A material's copy for the tank, keeping what `clone()` drops (its own defines: a pattern mode, a feature switch). */
export function cloneForTank<T extends Material>(m: T): T {
  const c = m.clone() as T;
  c.userData = m.userData;
  if (m.defines) c.defines = { ...m.defines, ...c.defines };
  return c;
}
