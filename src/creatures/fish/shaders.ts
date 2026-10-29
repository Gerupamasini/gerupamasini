/**
 * The coastal fishes' shader injects (skin.ts builds the materials): the body's living skin, the fins' rays and
 * membrane, the eye's cornea over its iris. All three light through the ハク's underwater light field (Snell's window,
 * the bed's glow, the caustics: haku/materials.ts) and share one program per tier across the nine species.
 *
 * Body maps: `map` the colour with the metalness (guanine silver) in alpha; `normalMap` the relief's normal in RG (its
 * z rebuilt), the roughness in B and the ambient occlusion in A. Vertex colour: R how pale a lining is (the mouth),
 * G the mucus film's weight, B how thin the body is there (it lets the light through).
 */

/** the body's vertex additions: the gill slit's mask */
export const BODY_VERT_PARS = /* glsl */ `
attribute float aGill;
varying float vGill;
varying vec3 vWPos;
`;

export const BODY_FRAG_PARS = /* glsl */ `
uniform float uGillOpen;
uniform vec3 uInside;
varying float vGill;
`;

/** the vertex colour is the skin's data, not a tint */
export const BODY_COLOR = /* glsl */ ``;

/** roughness and the occlusion from the surface map (sampled once) */
export const BODY_ROUGH = /* glsl */ `
vec4 fishSurf = texture2D( normalMap, vNormalMapUv );
float roughnessFactor = roughness * fishSurf.b;
float fishAO = fishSurf.a;
`;

/** metalness from the colour map's alpha; the gill chamber and the mouth's lining where the skin opens */
export const BODY_METAL = /* glsl */ `
float metalnessFactor = metalness * texture2D( map, vMapUv ).a;
// the gill chamber: seen through the skin's open edges (back faces), and in the slit behind a flared gill cover; the
// mouth's lining (aGill 2) pinkish grey, darkening into the throat (its vertex colour)
float chamber = vGill > 1.0 ? vGill - 1.0 : gl_FrontFacing ? clamp( vGill * uGillOpen * 1.6, 0.0, 1.0 ) : 1.0;
vec3 inside = vGill > 1.0 ? mix( uInside, vec3( 0.32, 0.26, 0.25 ), 0.6 ) * ( 0.15 + vColor.r ) : uInside;
diffuseColor.rgb = mix( diffuseColor.rgb, inside, chamber );
metalnessFactor *= 1.0 - chamber;
roughnessFactor = mix( roughnessFactor, 0.55, chamber );
fishAO = mix( fishAO, 0.45, chamber );
`;

/** the packed normal: xy in the map, z rebuilt */
export const BODY_NORMAL = /* glsl */ `
{
  vec3 mapN = vec3( fishSurf.xy * 2.0 - 1.0, 0.0 );
  mapN.xy *= normalScale * ( 1.0 - chamber );
  mapN.z = sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) );
  normal = normalize( tbn * mapN );
}
`;

/**
 * Light passing through the thin parts (the peduncle, the edges of the back and the belly, the snout's membranes): the
 * sun behind the fish glows through them, and a little of the light on the far side wraps round.
 */
export const BODY_THROUGH = /* glsl */ `
#include <emissivemap_fragment>
#ifndef FISH_FAR
{
  vec3 nW = inverseTransformDirection( normal, viewMatrix );
  vec3 vW = inverseTransformDirection( - normalize( vViewPosition ), viewMatrix );
  vec3 L = hkSunDir();
  float thin = vColor.b * ( 1.0 - chamber );
  float back = pow( clamp( dot( vW, L ), 0.0, 1.0 ), 4.0 );
  float wrap = clamp( dot( - nW, L ) * 0.5 + 0.5, 0.0, 1.0 );
  totalEmissiveRadiance += diffuseColor.rgb * ( 1.0 - 0.7 * metalnessFactor ) * thin
    * ( hkSunCol() * ( back * 0.35 + wrap * wrap * 0.05 ) + hkUnderwater( - nW, 1.0 ) * 0.1 );
}
#endif
`;

/**
 * The mucus: a clear film over the whole skin, thicker here and thinner there and streaked back along the body by the
 * water; the creases' occlusion takes the highlights out of them too.
 */
export const BODY_FILM = /* glsl */ `
#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
{
#ifndef FISH_FAR
  float film = hkNoise( vMapUv * vec2( 70.0, 22.0 ) ) * 0.6 + hkNoise( vMapUv * vec2( 230.0, 54.0 ) ) * 0.4;
#else
  float film = 0.5;
#endif
  material.clearcoat = saturate( material.clearcoat * vColor.g * ( 0.5 + film ) * ( 1.0 - chamber ) );
  material.clearcoatRoughness = min( 1.0, max( material.clearcoatRoughness * ( 0.55 + 1.3 * ( 1.0 - film ) ), 0.0525 ) );
}
#endif
material.specularColor *= mix( 0.3, 1.0, fishAO );
material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
`;

/** the occlusion over the direct light (the sun into a crease), after the caustics */
export const BODY_AO_DIRECT = /* glsl */ `
{
  float od = mix( 1.0, fishAO, 0.7 );
  reflectedLight.directDiffuse *= od;
  reflectedLight.directSpecular *= od;
}
`;

/** and over the light field */
export const BODY_AO_INDIRECT = /* glsl */ `
irradiance *= fishAO;
iblIrradiance *= fishAO;
radiance *= mix( 0.25, 1.0, fishAO );
#ifdef USE_CLEARCOAT
clearcoatRadiance *= mix( 0.5, 1.0, fishAO );
#endif
`;

// ---------------------------------------------------------------------------------------------------------- fins
export const FIN_VERT_PARS = /* glsl */ `
attribute vec2 aFin;
uniform float uFinAmp;
uniform float uFinPhase;
varying vec3 vWPos;
varying float vFinFade;
`;

/** the marginal fins' ripple (aFin.y ≥ 0), the base's inner face fading out (aFin.y < 0) */
export const FIN_VERT = /* glsl */ `
#include <begin_vertex>
transformed += objectNormal * ( max( aFin.y, 0.0 ) * uFinAmp * sin( aFin.x * 28.0 - uFinPhase ) );
vFinFade = aFin.y < 0.0 ? 1.0 + aFin.y : 1.0;
`;

export const FIN_ALPHA = /* glsl */ `
#include <alphamap_fragment>
diffuseColor.a *= vFinFade;
`;

/**
 * The fin's rays as ridges across the membrane (each band of the atlas its own count; they branch in two toward the
 * margin): their slopes tilt the normal, so a fin catches the light in streaks along its rays.
 */
export const FIN_FRAG_PARS = /* glsl */ `
uniform float uRays[6];
varying float vFinFade;
float finRidge( float u, float n ) {
  float f = u * ( n - 1.0 ) + 0.5;
  float d = fract( f ) - 0.5;
  return d * exp( - d * d * 18.0 );
}
`;

export const FIN_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
#ifndef FISH_FAR
{
  float band = floor( vMapUv.y * 6.0 );
  float n = uRays[ int( clamp( band, 0.0, 5.0 ) ) ];
  float v = clamp( ( fract( vMapUv.y * 6.0 ) - 0.03 ) / 0.94, 0.0, 1.0 );
  float split = smoothstep( 0.5, 0.7, v );
  float slope = mix( finRidge( vMapUv.x, n ), finRidge( vMapUv.x, 2.0 * n - 1.0 ), split );
  // the tangent frame from the derivatives of the atlas coordinates
  vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition );
  vec2 st0 = dFdx( vMapUv ), st1 = dFdy( vMapUv );
  vec3 q1p = cross( q1, normal ), q0p = cross( normal, q0 );
  vec3 T = q1p * st0.x + q0p * st1.x;
  float tl = dot( T, T );
  if ( tl > 0.0 ) normal = normalize( normal - T * inversesqrt( tl ) * slope * 1.6 * ( 1.0 - 0.6 * v ) );
}
#endif
`;

// ---------------------------------------------------------------------------------------------------------- eye
export const EYE_VERT_PARS = /* glsl */ `
attribute vec3 aEyeT;
attribute vec3 aEyeB;
attribute vec3 aEyeA;
attribute float aEyeH;
varying vec3 vEyeT;
varying vec3 vEyeB;
varying vec3 vEyeA;
varying float vEyeH;
varying vec3 vWPos;
`;

/** the eye's frame turns with the eye (its bone) */
export const EYE_VERT = /* glsl */ `
#include <skinnormal_vertex>
{
  vec3 eT = aEyeT, eB = aEyeB, eA = aEyeA;
#ifdef USE_SKINNING
  eT = ( skinMatrix * vec4( eT, 0.0 ) ).xyz; eB = ( skinMatrix * vec4( eB, 0.0 ) ).xyz; eA = ( skinMatrix * vec4( eA, 0.0 ) ).xyz;
#endif
  vEyeT = normalMatrix * eT; vEyeB = normalMatrix * eB; vEyeA = normalMatrix * eA;
  vEyeH = aEyeH;
}
`;

export const EYE_FRAG_PARS = /* glsl */ `
varying vec3 vEyeT;
varying vec3 vEyeB;
varying vec3 vEyeA;
varying float vEyeH;
uniform float uPupil;
uniform vec2 uEyeShift;
`;

/**
 * The iris and pupil where the line of sight reaches them (they lie deep under the cornea); in the pupil the fish's
 * round lens, standing forward through it, throws back a small sharp highlight of the light overhead.
 */
export const EYE_MAP = /* glsl */ `
vec3 eV = normalize( vViewPosition );
vec3 eA = normalize( vEyeA ), eT = normalize( vEyeT ), eB = normalize( vEyeB );
vec3 Vl = vec3( dot( eV, eT ), dot( eV, eB ), dot( eV, eA ) );
// (where the eye looks: its iris and pupil turned a little within the cornea)
vec2 eyeUv = vMapUv - vEyeH * Vl.xy / max( Vl.z, 0.45 ) - uEyeShift;
vec4 eyeTex = texture2D( map, eyeUv );
diffuseColor *= eyeTex;
float eyeGlint = 0.0;
{
  vec3 Lw = hkSunDir();
  vec3 Lv = normalize( ( viewMatrix * vec4( Lw, 0.0 ) ).xyz );
  vec3 Ll = vec3( dot( Lv, eT ), dot( Lv, eB ), dot( Lv, eA ) );
  vec3 Hl = normalize( Ll + Vl );
  // the lens: a sphere filling most of the pupil, its highlight where its normal halves the light and the view
  vec2 c = vec2( 0.5 ) + Hl.xy * uPupil * 0.4;
  float d = length( ( eyeUv - c ) / ( uPupil * 0.5 ) );
  float inPupil = 1.0 - smoothstep( uPupil * 0.42, uPupil * 0.5, length( eyeUv - 0.5 ) );
  eyeGlint = inPupil * exp( - d * d * 60.0 ) * smoothstep( 0.0, 0.3, Hl.z );
}
`;

export const EYE_METAL = /* glsl */ `
float metalnessFactor = metalness * eyeTex.a;
`;

export const EYE_ROUGH = /* glsl */ `
float roughnessFactor = roughness;
`;

export const EYE_GLINT = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += eyeGlint * ( hkSunCol() * 0.6 + hkSky() * 0.6 );
`;
