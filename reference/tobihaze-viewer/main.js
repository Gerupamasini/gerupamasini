// トビハゼ reference viewer: the GLB tiers (or a clay build of the sculpt) under studio light, with fixed cameras for
// the photo comparisons (front, side, top, 3/4 front, macro face). ?model=<url> picks the file; ?capture hides the
// panel and exposes window.__tobi for scripted renders (tools/models/tobihaze/render.mjs).
// The tier GLBs (tools/models/tobihaze/build.mjs) are skinned and carry blend shapes: a shot can pose them without
// baking (shot.pose or shot.view.pose, see applyPose): joint rotations by the rig's channels (read from the GLB's root
// extras, tobihaze.axes), quaternions or axis-angles, eye joint translations, the eyes' gaze, and blend-shape weights;
// `fit: 'all'` then frames the posed fish. In clay mode the fins are drawn double-sided and translucent, the eye's
// window as its pupil (Cornea) and iris ring (Iris), the teeth as enamel.
//
// Round T2 (key tech): the textured mode shows the GLB exactly as the game loads it (the GLB's own materials, nothing
// patched: round T1's opaque copy of the caudal's sheath is gone, the GLB draws its opaque parts itself), under one of
// the light rigs (LIGHT, below; shot.light picks one, shot.lightOver overrides its numbers):
//   photo   THE CANONICAL PHOTO LIGHT (textured mode's default; the look keys calibrate under it): daylight as the
//           photographs show it, drawn as the game draws the flat (src/render/FieldRenderer.ts: a linear half-float
//           target, so the fins blend in linear light; then the game's own tone curve, src/render/ToneMapGlsl.ts — AgX
//           with its look — at the game's day exposure, World.ts 0.58). Its light, all of it daylight:
//             the soft sun   the sun's disc as the key (a directional light, its GGX lobes widened by the disc and the
//                            aureole, SUN_RADIUS_DEG: a glint is the sun's size, not a point) and its aureole through thin
//                            cloud as a glow round it in the environment (σ 12°: a broad bright patch the film reflects,
//                            u1's sheen on the head), the two 26 % and 23 % of the light on a camera-facing grey card
//             the sky        a bright, hazy overcast (L(h) = Lz·(a + (1 − a)·sin h), a = 0.6: brighter at the horizon than
//                            CIE's 1/3), through PMREM: the film's reflections and 37 % of the light (the mud 13 %)
//             the mud        the environment's lower half: albedo 0.2 × the horizontal light / π — the ground bounce that
//                            lights the throat, the belly and the cheek from below (B010) — and the key's shadow on the
//                            ground plane (the fish casts, receives none: ModelLoader's)
//           The level: the exposure test (shot.cards: a 0.18 and a 0.8 card facing the camera) — the grey card at sRGB 118
//           as a standard photographic exposure (ISO 12232 SOS) and the photos' own neutral references (A036's mud
//           and white floats) give it; t2_tech/LIGHT.md has the numbers, the white card, and the game's own daylight
//           against it (1.4 stops darker).
//   game    the game's clear-day noon on the flat (src/world/Sky.ts at elevation ≥ 10°: the sun 2.6 × (1, 0.96, 0.9),
//           the hemisphere fill 0.3 sky (0.58, 0.68, 0.78) / ground (0.28, 0.24, 0.18), the sky's environment at
//           0.09 of a dome scaled 0.27; World.ts day exposure 0.58; AgX): what the fish looks like in the game today
//   zukan   the 図鑑's turntable preview (src/ui/zukan/ModelPreview.ts: RoomEnvironment at 0.45, hemisphere 0.8
//           0xdfe9ec / 0x6b5e4e, a key 1.6 0xfff4e8 from (0.4, 1, 0.6), AgX at exposure 0.9, straight to the canvas)
//   studio  rounds B1–T1's studio light (clay; ACES, unchanged)
// shot.cards { albedos: [0.18, 0.8], only: true }: the exposure test's cards; shot.msaa: the HDR target's samples (4);
// shot.finRender: 'peel' the fins depth-peeled (the reference for the blending order: every fin layer sorted per pixel,
// FIN_PEEL layers, composited back to front in linear light), 'depthWrite' the blended fins writing depth (a runtime
// option, not in glTF), default as loaded; shot.material { wetness, mud, bars, dark, tint } previews the runtime's
// uniforms (the materials' extras.tobihaze.runtime; a GLSL port of its rules on the body's maps — see patchRuntime).
// Packed GLBs (KTX2 / meshopt, tools/models/pack) load too.
// Round T2 integrator: the GLB's runtime rules that the game runs once its loader reads the extras are drawn in every
// textured shot — the fins' depth writes (above), the membranes' translucency (shot.finTranslucency false: off) — and
// shot.material.pupil ('teal' | 'red' | 'black' | [r, g, b]) previews the pupil variant (patchRuntime); view.keyBehind
// { up } puts the sun behind the fish (the backlit fins).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import basisTranscoderJs from 'three/examples/jsm/libs/basis/basis_transcoder.js?url';
import basisTranscoderWasm from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';
// (the game's tone curve and its GLSL, so the viewer draws as the game does)
import { installToneMap, TONE_MAP_GLSL, TONE_CURVE } from '../../src/render/ToneMapGlsl.ts';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');
const canvas = document.getElementById('view');
const dpr = Number(params.get('dpr') ?? Math.min(2, devicePixelRatio));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture });
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
installToneMap();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6f6f6f);

/**
 * The sun's angular size (round T2): the sun's disc (0.27° radius) and the aureole a hazy sky draws round it, as the
 * radius of the soft source the photos' highlights show (B010's sun glints, u1's cornea). three's directional light is a
 * point; the viewer widens the GGX lobes of the direct light (base and clearcoat) by the source's own slope spread,
 * α' = sqrt(α² + α_sun²), α_sun = tan(radius / 2) — a sphere light's roughness widening (Karis 2013), on in the 'photo'
 * rig only (the game's renderer has no such patch: a runtime request). At 1.5° α_sun = 0.013: a film at roughness 0.12
 * (α 0.0144) widens to α 0.019, the cornea's window (three's floor α 0.0028) to 0.013, a disc ~1.5° across.
 */
export const SUN_RADIUS_DEG = 1.5;
{
  // (the alpha line of BRDF_GGX_Clearcoat and of BRDF_GGX — three's build strips the shaders' comments, so each is found
  // after its function's signature)
  let k = THREE.ShaderChunk.lights_physical_pars_fragment;
  const line = 'float alpha = pow2( roughness );', wide = '\n#ifdef TB_SUN_ALPHA\n\tfloat alpha = sqrt( pow2( pow2( roughness ) ) + pow2( TB_SUN_ALPHA ) );\n#else\n\tfloat alpha = pow2( roughness );\n#endif\n';
  for (const sig of ['vec3 BRDF_GGX_Clearcoat(', 'vec3 BRDF_GGX(']) {
    const at = k.indexOf(sig), i = at < 0 ? -1 : k.indexOf(line, at);
    if (i < 0 || i - at > 600) throw new Error(`viewer: ${sig}'s alpha line not found in three's physical chunk`);
    k = k.slice(0, i) + wide + k.slice(i + line.length);
  }
  THREE.ShaderChunk.lights_physical_pars_fragment = k;
}

// studio light: a soft key from the front-left above, a fill, a rim from behind, and a sky/ground ambient
const hemi = new THREE.HemisphereLight(0xdfe6ee, 0x4a4540, 0.9);
scene.add(hemi);
// (round T1 integrator: the substrate's bounce as a hemisphere light; round T2: unused by 'photo', whose environment has
// the mud below the horizon)
const bounce = new THREE.HemisphereLight(0x000000, 0xc8bba6, 0);
scene.add(bounce);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(0.6, 1.0, 0.8);
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xe8eef8, 0.7);
fill.position.set(-0.9, 0.3, 0.5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.9);
rim.position.set(-0.2, 0.6, -1.0);
scene.add(rim);
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.00002;
key.shadow.normalBias = 0.00002;

/**
 * The light rigs (round T2; the header). Units are three's (a directional light's intensity is its irradiance at normal
 * incidence; a white Lambert surface facing it reads intensity / π; the environment's values are radiances). photo:
 * `sun` the key's irradiance and colour (and radiusDeg: the lobe widening), `glow` the soft sun's aureole in the
 * environment (peak radiance, σ, colour), `sky` the dome (zenith radiance, `horizon` the horizon over the zenith, tints),
 * `ground` the mud's albedo, exposure the game's. The level: shot.cards (the exposure test) — sun, glow and sky scaled
 * together until the 0.18 card facing the camera at the A070 side camera renders at sRGB 118 (117.7–119.7 measured; the
 * B010 3/4 camera 125–127). The key follows the camera (setView: from the camera's side, above and a little left, ~46° up
 * for a level camera) as in every round; the environment is built for its direction (updateEnv).
 */
const SKY_PHOTO = { zenith: 1.0, zenithTint: [0.94, 0.98, 1.06], horizonTint: [1.02, 1.0, 0.97] };
export const LIGHT = {
  studio: { pipeline: 'direct', tone: 'aces', exposure: 1, hemi: 0.9, key: 2.2, keyColor: 0xffffff, fill: 0.7, rim: 0.9, env: 0, bounce: 0, background: 0x6f6f6f },
  photo: {
    pipeline: 'hdr', tone: 'game', exposure: 0.58, background: [0.24, 0.24, 0.24],
    sun: { irradiance: 2.1, color: [1.0, 0.97, 0.92], radiusDeg: SUN_RADIUS_DEG, shadows: true },
    glow: { radiance: 18.2, sigmaDeg: 12, color: [1.0, 0.97, 0.92] },
    sky: { ...SKY_PHOTO, zenith: 1.257, horizon: 0.6 }, ground: { albedo: [0.2, 0.19, 0.17] }, env: 1,
  },
  game: {
    pipeline: 'hdr', tone: 'game', exposure: 0.58, background: [0.24, 0.24, 0.24],
    sun: { irradiance: 2.6, color: [1, 0.96, 0.9], radiusDeg: 0, shadows: true },
    hemi: { intensity: 0.3, sky: [0.58, 0.68, 0.78], ground: [0.28, 0.24, 0.18] },
    // (Sky.ts: scene.environmentIntensity 0.09 of a Preetham dome scaled 0.27: ~0.009 of radiance at the zenith in three's
    // units against the sun's 2.6 — a clear blue dome at that level, its share of the light ~1 %)
    sky: { zenith: 0.0085, zenithTint: [0.55, 0.72, 1.0], horizonTint: [0.95, 0.98, 1.0], clear: true }, ground: { albedo: [0.2, 0.19, 0.17] }, env: 1,
  },
  // (round T1's 'photo' rig, kept to carry calibrations across: RoomEnvironment 0.25, a warm key 1.9, fill 0.2, rim 0.5,
  // the substrate bounce 0.8, ACES at exposure 1 straight to the canvas — t2_tech/LIGHT.md: its grey card against 'photo')
  t1photo: { pipeline: 'direct', tone: 'aces', exposure: 1, room: 0.25, hemi: 0, hemiSky: 0xdfe6ee, hemiGround: 0x4a4540, key: 1.9, keyColor: 0xfff3e2, fill: 0.2, rim: 0.5, bounce: 0.8, background: 0x6f6f6f },
  zukan: { pipeline: 'direct', tone: 'game', exposure: 0.9, room: 0.45, hemi: 0.8, hemiSky: 0xdfe9ec, hemiGround: 0x6b5e4e, key: 1.6, keyColor: 0xfff4e8, keyFixed: [0.4, 1.0, 0.6], fill: 0, rim: 0, background: [0.05, 0.06, 0.07] },
};
let lightRig = 'studio', L = LIGHT.studio, envCache = new Map(), roomEnv = null;

/**
 * The sky dome, the soft sun's glow and the mud, for PMREM (round T2): radiance by direction, linear, HDR.
 *   sky     L(h) = Lz·(a + (1 − a)·sin h), a = S.horizon (the horizon over the zenith: CIE overcast 1/3; 0.5 a bright,
 *           hazy overcast), the zenith a little cool, the horizon neutral; the game's clear sky (S.clear) brighter toward
 *           the horizon's haze
 *   glow    the soft sun: the sun's aureole through thin cloud, Lg·exp(−(ψ/σ)²) round the sun's direction (ψ its angular
 *           distance, σ = glow.sigmaDeg), part of the environment so the film reflects it as a broad bright band (u1's
 *           cheek and head top) and the diffuse gets its light with it; the sun's disc itself is the directional key
 *   ground  below the horizon the mud: albedo × (the horizontal irradiance of the sky, the glow and the key) / π
 * Built per sun direction (the key follows the camera): cached by direction to a degree.
 */
function skyScene(S, G, sun, glow) {
  const sc = new THREE.Scene();
  const z = S.zenith, ha = S.horizon ?? 1 / 3, eh = S.clear ? 1.2 * Math.PI * z : Math.PI * z * (2 / 3 + ha / 3);
  const sig = ((glow?.sigmaDeg ?? 10) * Math.PI) / 180, lg = glow?.radiance ?? 0, up = Math.max(0, sun.dir[1]);
  const gh = lg * Math.PI * sig * sig * up;
  const gr = G.albedo.map((a) => (a * (eh + sun.irradiance * up + gh)) / Math.PI);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uZ: { value: z }, uHA: { value: ha }, uZT: { value: new THREE.Vector3(...S.zenithTint) }, uHT: { value: new THREE.Vector3(...S.horizonTint) }, uG: { value: new THREE.Vector3(...gr) }, uClear: { value: S.clear ? 1 : 0 },
      uSun: { value: new THREE.Vector3(...sun.dir) }, uGlow: { value: lg }, uSig: { value: sig }, uGC: { value: new THREE.Vector3(...(glow?.color ?? [1, 1, 1])) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uZ; uniform float uHA; uniform vec3 uZT; uniform vec3 uHT; uniform vec3 uG; uniform float uClear; uniform vec3 uSun; uniform float uGlow; uniform float uSig; uniform vec3 uGC; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float s = clamp(d.y, 0.0, 1.0);
  float l = uClear > 0.5 ? uZ * (1.0 + 1.5 * pow(1.0 - s, 4.0)) : uZ * (uHA + (1.0 - uHA) * s);
  vec3 sky = l * mix(uHT, uZT, sqrt(s));
  float psi = acos(clamp(dot(d, uSun), -1.0, 1.0));
  sky += uGlow * exp(-(psi * psi) / (uSig * uSig)) * uGC;
  // (the mud below the horizon; a degree's blend at the horizon)
  gl_FragColor = vec4(mix(uG, sky, smoothstep(-0.02, 0.0, d.y)), 1.0);
}`,
  });
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), mat));
  return sc;
}
function envFor(S, G, sun, glow) {
  const k = JSON.stringify([S, G, sun.dir.map((v) => Math.round(v * 60) / 60), sun.irradiance, glow ?? null]);
  if (!envCache.has(k)) {
    if (envCache.size > 24) { for (const t of envCache.values()) t.dispose(); envCache.clear(); }
    const pm = new THREE.PMREMGenerator(renderer);
    envCache.set(k, pm.fromScene(skyScene(S, G, sun, glow), 0, 0.1, 100).texture);
    pm.dispose();
  }
  return envCache.get(k);
}
/** The photo and game rigs' environment for the key's present direction (after setView: the key follows the camera). */
function updateEnv() {
  if (!L.sky) return;
  const d = key.position.clone().sub(key.target.position).normalize();
  scene.environment = envFor(L.sky, L.ground, { dir: [d.x, d.y, d.z], irradiance: L.sun?.irradiance ?? 0 }, L.glow ?? null);
  scene.environmentIntensity = L.env ?? 1;
}
function roomEnvironment() {
  if (!roomEnv) { const pm = new THREE.PMREMGenerator(renderer); roomEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
  return roomEnv;
}
const linColor = (c) => (Array.isArray(c) ? new THREE.Color().setRGB(c[0], c[1], c[2]) : new THREE.Color(c));
function setLight(name, over = {}) {
  const base = LIGHT[name] ?? LIGHT.studio;
  L = { ...base, ...over, sun: { ...base.sun, ...over.sun }, sky: base.sky ? { ...base.sky, ...over.sky } : undefined, ground: base.ground ? { ...base.ground, ...over.ground } : undefined, glow: base.glow || over.glow ? { ...base.glow, ...over.glow } : undefined };
  lightRig = name;
  scene.background = linColor(L.background ?? 0x6f6f6f);
  hemi.intensity = 0; bounce.intensity = 0; key.intensity = 0; fill.intensity = 0; rim.intensity = 0;
  scene.environment = null; scene.environmentIntensity = 1;
  key.castShadow = false;
  if (name === 'studio' || !base.sun && !base.room) {
    hemi.color.setHex(0xdfe6ee); hemi.groundColor.setHex(0x4a4540);
    hemi.intensity = L.hemi; bounce.intensity = L.bounce ?? 0; key.intensity = L.key; key.color.setHex(L.keyColor); fill.intensity = L.fill; rim.intensity = L.rim;
  } else if (base.room) {
    scene.environment = roomEnvironment(); scene.environmentIntensity = L.room;
    hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemi;
    key.intensity = L.key; key.color.setHex(L.keyColor); fill.intensity = L.fill ?? 0; rim.intensity = L.rim ?? 0; bounce.intensity = L.bounce ?? 0;
  } else {
    updateEnv();
    key.intensity = L.sun.irradiance; key.color.copy(linColor(L.sun.color));
    key.castShadow = !!L.sun.shadows && mode === 'textured';
    if (L.hemi) { hemi.intensity = L.hemi.intensity; hemi.color.copy(linColor(L.hemi.sky)); hemi.groundColor.copy(linColor(L.hemi.ground)); }
  }
  // the pipeline and the tone curve
  renderer.toneMapping = L.pipeline === 'hdr' ? THREE.NoToneMapping : L.tone === 'game' ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = L.exposure ?? 1;
  outMat.uniforms.uExposure.value = L.exposure ?? 0.5;
  // the sun's size on every lit material
  const sunA = L.sun?.radiusDeg ? Math.tan(((L.sun.radiusDeg / 2) * Math.PI) / 180) : 0;
  const touch = (m) => {
    if (!m || !m.isMeshStandardMaterial) return;
    const had = m.defines?.TB_SUN_ALPHA;
    if (sunA > 0) { m.defines = { ...(m.defines ?? {}), TB_SUN_ALPHA: sunA.toFixed(6) }; } else if (m.defines) delete m.defines.TB_SUN_ALPHA;
    if (had !== m.defines?.TB_SUN_ALPHA) m.needsUpdate = true;
  };
  scene.traverse((o) => { if (o.isMesh) for (const m of [o.material].flat()) touch(m); });
  for (const m of extraMaterials) touch(m);
}

// ------------------------------------------------------------------------------------------------ the HDR pipeline
/** (round T2) the game's way: the scene into a linear half-float target (multisampled), then the tone curve and sRGB */
const outScene = new THREE.Scene(), outCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const outMat = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uExposure: { value: 0.5 } }, depthTest: false, depthWrite: false, toneMapped: false,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `${TONE_MAP_GLSL}
uniform sampler2D tSrc; uniform float uExposure; varying vec2 vUv;
void main() { vec3 c = texture2D(tSrc, vUv).rgb; gl_FragColor = vec4(srgbEncode(higataToneMap(max(c, vec3(0.0)), uExposure)), 1.0); }`,
});
outScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outMat));
let hdrRT = null, msaa = 4;
function hdrTarget() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!hdrRT || hdrRT.width !== s.x || hdrRT.height !== s.y || hdrRT.samples !== msaa) {
    hdrRT?.dispose();
    hdrRT = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, samples: msaa, depthBuffer: true });
  }
  return hdrRT;
}

// ------------------------------------------------------------------------------------------------ materials
const persp = new THREE.PerspectiveCamera(30, 1, 0.0005, 10);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.0005, 10);
let camera = persp;
const controls = new OrbitControls(persp, canvas);
controls.enableDamping = !capture;

const clayMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a8, roughness: 0.62, metalness: 0 });
const clayEye = new THREE.MeshStandardMaterial({ color: 0x9c958c, roughness: 0.35, metalness: 0 });
// the eye's clear window (a primitive with the material 'Cornea') stays dark in clay, so the skin cap reads
const clayCornea = new THREE.MeshStandardMaterial({ color: 0x3a342a, roughness: 0.12, metalness: 0 });
// the iris ring under the cornea (a primitive whose material is named 'Iris …'): a gold-brown mid-tone, so only the
// pupil reads dark (eye.mjs eyeGlobe's pupil and iris)
const clayIris = new THREE.MeshStandardMaterial({ color: 0x8a7448, roughness: 0.12, metalness: 0 });
const toothMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d6, roughness: 0.35, metalness: 0 });
// the fins in clay: a membrane seen from either side, translucent as the real ones (body_fins_colour §2.7: 40–70 %
// opaque); the far tier's merged, alpha-tested fins opaque
const clayFin = new THREE.MeshStandardMaterial({ color: 0xc9bca6, roughness: 0.5, metalness: 0, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
const clayFinMask = new THREE.MeshStandardMaterial({ color: 0xc9bca6, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
// (round B4: the caudal's sheath — the fleshy base past the skin's end, the fin mesh's extras `sheath` triangle ranges —
// opaque in the body's clay, so the body's end does not show through it as a band)
const clayFlesh = new THREE.MeshStandardMaterial({ color: 0xb9b2a8, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
const groundMat = new THREE.MeshStandardMaterial({ color: 0x8d877e, roughness: 0.9, metalness: 0 });
// (round T1: the exposure check's matte white, every mesh alike)
const matteMat = new THREE.MeshStandardMaterial({ color: 0xbfbfbf, roughness: 1, metalness: 0, side: THREE.DoubleSide });
// (round T2: the exposure test's cards — pure diffuse, no specular — and the materials setLight touches besides the model's)
const cardMat = (a) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(a, a, a), roughness: 1, metalness: 0, specularIntensity: 0 });
const extraMaterials = [groundMat, matteMat];

/**
 * The runtime's uniforms on the textured materials (a preview for the behaviour round: the materials' extras
 * tobihaze.runtime): wetness and mud on the body's maps, bars (baseColor A), dark, tint. Only a shot that gives
 * shot.material patches the materials; the plain GLB material is the master (round T2: the master wetness, extras
 * runtime.wetness.default).
 * Round T2's channels (build.mjs runtimeParams, the map `body_film_rough_retain_ao`): R the film (the clearcoat's
 * coverage at the master wetness), G the roughness at the master wetness, B the wet retention, A the occlusion. The rule
 * (extras runtime.wetness.rule, a line-for-line port): the master's local wetness wl0 = clamp(w0·(1 + γ) − γ·(1 − B)) and
 * the shot's wl likewise from the uniform; the wet-state roughness recovered from G at wl0, the roughness, the film and
 * its roughness at wl; the albedo × mix(1/Wa, 1, wl) / mix(1/Wa, 1, wl0) (the map holds the master's albedo).
 */
const RT = { uOn: { value: 0 }, uWetness: { value: 1 }, uMud: { value: 0 }, uBars: { value: 0 }, uDark: { value: 0 }, uTint: { value: new THREE.Vector3(0, 1, 1) }, uTrans: { value: 1 }, uPupilOn: { value: 0 }, uPupil: { value: new THREE.Vector3() } };
const GLSL_HSV = `
vec3 tbHsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 tbRgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
uniform float uOn; uniform float uWetness; uniform float uMud; uniform float uBars; uniform float uDark; uniform vec3 uTint; uniform float uTrans; uniform float uPupilOn; uniform vec3 uPupil;
`;
const glNum = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
/**
 * (round T2 integrator) Two runtime rules are drawn in every textured shot, not only with shot.material, because the
 * game draws them once its loader reads the extras (as the fins' depthWrite flag, which the viewer applies by default):
 *   the fins' translucency (finatlas.mjs FIN_TRANSLUCENCY, extras runtime.translucency; the eyefin key's request): the
 *     membranes' diffuse transmission of the directional lights (the sun) from behind, after three's lights — what the
 *     eyefin key calibrated the fin atlas with (t2_eyefin/js/reye.mjs finTrans); shot.finTranslucency false turns it off
 *   the pupil's variant (iris.mjs EYE_MATERIAL extras runtime.pupil): albedo += A × (variant − teal) on the Eye (A the
 *     glow mask in the iris rect, 0 on the cap); shot.material.pupil 'teal' | 'red' | 'black' | [r, g, b] (default the
 *     map's teal: no change)
 * The rest (wetness, mud, bars, dark, tint) only with shot.material (uOn). The eye skips the bars (its A is the glow's).
 * Patched once per material (a WeakSet: Material.clone copies userData but not onBeforeCompile, so the fins'
 * depth-writing copies are patched on their own); the depth-peel reference's copies run the same hook (rtHooks).
 */
const rtPatched = new WeakSet(), rtHooks = new WeakMap();
function patchRuntime(mat) {
  const X = mat?.userData?.tobihaze;
  const R = X?.runtime?.ref && !X.runtime.wetness ? { ...(X.runtime.translucency ? { translucency: X.runtime.translucency } : {}) } : X?.runtime;
  if (!R || !mat.isMeshStandardMaterial || rtPatched.has(mat)) return;
  rtPatched.add(mat);
  const role = X.role, W = R.wetness?.WET, M = R.wetness?.master;
  const wetModel = role === 'body' && !!(W?.wet && W?.dry && W?.damp && M);
  const finModel = role === 'fin' && !!R.wetness?.fin;
  const TR = role === 'fin' ? R.translucency ?? null : null, PU = role === 'eye' ? R.pupil ?? null : null;
  const mud = W?.mud?.colour ? new THREE.Color(W.mud.colour).convertSRGBToLinear() : new THREE.Color(0.27, 0.25, 0.22);
  const hook = (sh) => {
    Object.assign(sh.uniforms, RT);
    sh.fragmentShader = GLSL_HSV + sh.fragmentShader;
    const skin = role === 'body';
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
${skin ? '  if (uOn > 0.5) diffuseColor.rgb *= 1.0 - 0.6 * uBars * sampledDiffuseColor.a;\n  diffuseColor.a = 1.0;' : ''}
${PU ? `  // (the pupil's variant: the map's A in the iris rect is the glow's weight, the map holds the teal)
  if (uPupilOn > 0.5) diffuseColor.rgb = max(diffuseColor.rgb + sampledDiffuseColor.a * (uPupil - vec3(${PU.teal.map(glNum).join(', ')})), vec3(0.0));
  diffuseColor.a = 1.0;` : ''}
#endif
  if (uOn > 0.5) { vec3 h = tbHsv(max(diffuseColor.rgb, vec3(0.0))); h.x = fract(h.x + uTint.x / 360.0); h.y = clamp(h.y * uTint.y, 0.0, 1.0); h.z *= uTint.z * mix(1.0, 0.45, uDark); diffuseColor.rgb = tbRgb(h); }`);
    if (finModel) {
      const F = R.wetness.fin;
      sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  if (uOn > 0.5) {
    float tbW = clamp(uWetness, 0.0, 1.0), tbW0 = ${glNum(F.master)};
    roughnessFactor = mix(${glNum(F.dry)}, ${glNum(F.wet)}, tbW);
    float am = mix(1.0 / ${glNum(F.albedo)}, 1.0, tbW) / mix(1.0 / ${glNum(F.albedo)}, 1.0, tbW0);
    diffuseColor.rgb = mix(diffuseColor.rgb * am, vec3(${glNum(mud.r)}, ${glNum(mud.g)}, ${glNum(mud.b)}), clamp(uMud, 0.0, 1.0) * 0.6);
  }`);
    }
    if (TR) {
      // (the fins' diffuse transmission, FIN_TRANSLUCENCY's rule: the far face's direct light scattered through the thin
      // membrane, tinted by it; a forward lobe for the sun just behind it; the opaque parts — A over stopAlpha — none)
      const st = TR.stopAlpha ? `(1.0 - smoothstep(${glNum(TR.stopAlpha[0])}, ${glNum(TR.stopAlpha[1])}, diffuseColor.a))` : '1.0';
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  if (uTrans > 0.5) {
    vec3 tbTint = ${glNum(TR.diffuse)} * ${st} * pow(max(material.diffuseColor, vec3(1e-4)), vec3(${glNum(TR.tintPower)}));
    vec3 tbE = vec3(0.0);
    #if NUM_DIR_LIGHTS > 0
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      float tb = saturate(dot(-normal, directionalLights[i].direction));
      float fw = pow(saturate(dot(geometryViewDir, -directionalLights[i].direction)), ${glNum(TR.forwardPower)});
      tbE += directionalLights[i].color * (tb + ${glNum(TR.forward)} * fw * step(0.0, -dot(normal, directionalLights[i].direction)));
    }
    #endif
    ${TR.environment ? `#if defined(USE_ENVMAP) && defined(STANDARD)\n    tbE += ${glNum(TR.environment)} * getIBLIrradiance(-normal);\n    #endif` : ''}
    reflectedLight.directDiffuse += tbTint * tbE * RECIPROCAL_PI;
  }`);
    }
    if (!wetModel) return;
    // (the body: the film, the roughness and the albedo from ORM R/G/B at the shot's wetness; the mud by the downward normal)
    sh.fragmentShader = sh.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  float tbClearcoat = -1.0, tbCcRough = 0.0;
#ifdef USE_ROUGHNESSMAP
  if (uOn > 0.5) {
    float g = ${glNum(W.gamma ?? 1.2)}, w0 = ${glNum(M.wetness)}, B = texelRoughness.b;
    float wl0 = clamp(w0 * (1.0 + g) - g * (1.0 - B), 0.0, 1.0);
    float wl = clamp(uWetness * (1.0 + g) - g * (1.0 - B), 0.0, 1.0);
    float dK = ${glNum(W.dry.roughness)} - ${glNum(W.wet.roughness)} * ${glNum(W.carry ?? 0.5)};
    // (the map's G is mix(dry, wet, wl0), dry = W.dry + (wet - W.wet)·carry: the wet-state roughness back from it)
    float wetR = (texelRoughness.g - (1.0 - wl0) * dK) / (wl0 + (1.0 - wl0) * ${glNum(W.carry ?? 0.5)});
    float rr = mix(dK + wetR * ${glNum(W.carry ?? 0.5)}, wetR, wl);
    float cw = smoothstep(0.35, 1.0, wl);
    float cc = ${glNum(W.wet.clearcoat)} * cw + ${glNum(W.damp.clearcoat)} * (1.0 - cw) * smoothstep(0.15, 0.5, wl);${R.wetness.specularOcclusion ? `
    // (round T2 integrator: the film's specular occlusion from the film map's A, as the master's R has it — surface.mjs
    // specularOcclusion, extras runtime.wetness.specularOcclusion)
    cc *= mix(${glNum(R.wetness.specularOcclusion.min)}, 1.0, smoothstep(${glNum(R.wetness.specularOcclusion.ao[0])}, ${glNum(R.wetness.specularOcclusion.ao[1])}, texelRoughness.a));` : ''}
    vec3 tbN = normalize((inverse(viewMatrix) * vec4(vNormal, 0.0)).xyz);
    float mw = clamp(uMud * (0.45 + 0.55 * smoothstep(${glNum(W.mud?.ventral?.[0] ?? 0.15)}, ${glNum(W.mud?.ventral?.[1] ?? 0.75)}, -tbN.y)), 0.0, 1.0);
    roughnessFactor = mix(rr, ${glNum(W.mud?.roughness ?? 0.7)}, mw);
    tbClearcoat = cc * (1.0 - mw); tbCcRough = mix(${glNum(W.damp.clearcoatRoughness)}, ${glNum(W.wet.clearcoatRoughness)}, cw);
    float Wa = ${glNum(W.wet.albedo ?? 1)}, Ws = ${glNum(W.wet.saturation ?? 1)};
    float am = mix(1.0 / Wa, 1.0, wl * (1.0 - mw)) / mix(1.0 / Wa, 1.0, wl0), sat = mix(1.0 / Ws, 1.0, wl * (1.0 - mw)) / mix(1.0 / Ws, 1.0, wl0);
    vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(mix(vec3(l), c, sat) * am, vec3(${glNum(mud.r)}, ${glNum(mud.g)}, ${glNum(mud.b)}), mw * 0.85);
  }
#endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  if (tbClearcoat >= 0.0) { material.clearcoat = saturate(tbClearcoat); material.clearcoatRoughness = min(max(tbCcRough, 0.0525) + geometryRoughness, 1.0); }
#endif`);
  };
  rtHooks.set(mat, hook);
  mat.onBeforeCompile = hook;
  mat.customProgramCacheKey = () => `tobihaze-rt-${role}-${wetModel}-${finModel}-${TR ? 'tr' + (TR.stopAlpha ? 's' : '') : ''}-${PU ? 'pu' : ''}`;
  mat.needsUpdate = true;
}
/** The pupil variants by name: iris.mjs EYE_MATERIAL extras runtime.pupil.variants (linear), read from a loaded Eye. */
let pupilVariants = null;
function setRuntime(m = null, shot = {}) {
  RT.uOn.value = m ? 1 : 0;
  RT.uTrans.value = shot.finTranslucency === false ? 0 : 1;
  const pv = m?.pupil, rgb = Array.isArray(pv) ? pv : typeof pv === 'string' ? pupilVariants?.[pv] : null;
  RT.uPupilOn.value = rgb ? 1 : 0;
  if (rgb) RT.uPupil.value.set(rgb[0], rgb[1], rgb[2]);
  m = m ?? {};
  RT.uWetness.value = m.wetness ?? 1; RT.uMud.value = m.mud ?? 0; RT.uBars.value = m.bars ?? 0; RT.uDark.value = m.dark ?? 0;
  RT.uTint.value.set(m.tint?.hueDeg ?? 0, m.tint?.sat ?? 1, m.tint?.val ?? 1);
}
const silMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
// x-ray: the skeleton opaque (alizarin red, as a cleared and stained specimen) inside a faint skin
const boneMat = new THREE.MeshStandardMaterial({ color: 0xc0283c, roughness: 0.5, metalness: 0 });
const cartMat = new THREE.MeshStandardMaterial({ color: 0x3f7fd0, roughness: 0.5, metalness: 0 });
const ghostMat = new THREE.MeshStandardMaterial({ color: 0xe8dc8a, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
let model = null, original = new Map(), mode = 'clay', box = new THREE.Box3(), regions = {}, rig = null, ground = null, cards = null;
// (round B4: the eye is one primitive on one material that reads the body atlas through its iris and eyeSkin rects;
// in clay the atlas is painted from the root extras' tobihaze.eyes.clay (eyemesh.eyeClayAtlas): the body clay
// everywhere, the iris rect gold-brown with the pupil dark and glossy below its edge, so the hero and lod1 eyes keep
// B3's look and lod2's merged eyes show their window. One material per loaded model, for every material whose extras
// role is 'eye' or 'body')
let clayAtlas = null;
function clayAtlasMaterial() {
  const c = rig?.eyes?.clay;
  if (!c?.iris || !c.pupilEdge) return null;
  if (clayAtlas) return clayAtlas;
  const S = 1024, paint = (fillBody, fillIris, fillPupil) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = fillBody; g.fillRect(0, 0, S, S);
    const [x0, y0, x1, y1] = c.iris.map((v) => v * S), n = c.pupilEdge.length - 1;
    g.fillStyle = fillIris; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = fillPupil; g.beginPath(); g.moveTo(x0, y0);
    for (let k = 0; k <= n; k++) g.lineTo(x0 + (k / n) * (x1 - x0), y0 + c.pupilEdge[k] * (y1 - y0));
    g.lineTo(x1, y0); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(cv); t.flipY = false; return t;
  };
  const rgb = (a) => `rgb(${a.map((v) => Math.round(v * 255)).join(',')})`, grey = (r) => rgb([r, r, r]);
  const col = c.colours ?? { pupil: [0.23, 0.2, 0.16], iris: [0.54, 0.45, 0.28] }, rough = c.colours?.roughness ?? { window: 0.12, skin: 0.62 };
  const map = paint('#b9b2a8', rgb(col.iris), rgb(col.pupil)); map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = paint(grey(0.62), grey(rough.window), grey(rough.window));
  clayAtlas = new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughnessMap, roughness: 1, metalness: 0 });
  return clayAtlas;
}
const bind = new Map(); // bone → its bind { position, quaternion } (restored before every pose)

function applyMode(m) {
  mode = m;
  if (!model) return;
  scene.background = new THREE.Color(m === 'silhouette' || m === 'xray' || m === 'bones' ? 0xffffff : 0x6f6f6f);
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (!original.has(o)) original.set(o, o.material);
    const eye = /eye/i.test(o.name), cornea = /cornea/i.test(original.get(o)?.name ?? ''), iris = /iris/i.test(original.get(o)?.name ?? '');
    // bones are the meshes named Bone_* (Cart_* for cartilage); in 'xray' the rest is a faint skin, in 'bones' hidden
    const bone = /^Bone_/.test(o.name), cart = /^Cart_/.test(o.name), tooth = /^Teeth_|Teeth$/.test(o.name) || /^Mouth_Teeth/.test(o.parent?.name ?? '');
    // a fin: a Fin_* mesh, or a material whose extras give it the role (the tier GLBs: tobihaze.role 'fin')
    const om = original.get(o), finRole = om?.userData?.tobihaze?.role === 'fin', fin = finRole || /^Fins?(_|$)/.test(o.name);
    const merged = fin && (om?.alphaTest > 0 || om?.userData?.tobihaze?.merged);
    // (round T2: a fin primitive that is the opaque twin of a blended one — the MASK pass drawing what is solid — is the
    // blended's in clay: one clay fin; the fin meshes' opaque parts (pass 'opaque': the sheath, the fleshy roots) the
    // flesh clay)
    const twin = fin && om?.userData?.tobihaze?.pass === 'solid', flesh = fin && om?.userData?.tobihaze?.pass === 'opaque';
    if (o.name === '__ground') { o.material = m === 'silhouette' ? silMat : groundMat; o.visible = m !== 'silhouette'; return; }
    o.visible = !(m === 'bones' && !bone && !cart && !tooth) && !((m === 'clay' || m === 'silhouette' || m === 'textured' || m === 'matte') && (bone || cart)) && !(twin && m !== 'textured');
    if (m === 'xray' || m === 'bones') o.material = bone || tooth ? boneMat : cart ? cartMat : ghostMat;
    // a globe with a window has a skin cap (clay like the head); a bare globe keeps the eye clay
    const capped = eye && o.parent?.children.some((c) => /cornea/i.test((original.get(c) ?? c.material)?.name ?? ''));
    // (round B4: a material whose extras role is 'eye' or 'body' (the one-primitive eye, the skin) on the clay atlas)
    const role = om?.userData?.tobihaze?.role, atlas = m === 'clay' && !tooth && (role === 'eye' || role === 'body') ? clayAtlasMaterial() : null;
    if (m !== 'xray' && m !== 'bones') o.material = m === 'clay' ? (atlas ?? (tooth ? toothMat : flesh ? clayFlesh : fin ? (merged ? clayFinMask : clayFin) : iris ? clayIris : cornea ? clayCornea : eye && !capped ? clayEye : clayMat)) : m === 'silhouette' ? silMat : m === 'matte' ? matteMat : original.get(o);
    // (round B4: a fin mesh with a sheath range (geometry groups set at load) draws it with the opaque flesh clay; a single
    // material ignores the groups. Round T2: textured, the GLB's own materials only — what the game draws)
    if (m === 'clay' && fin && o.geometry?.groups?.length && o.userData?.sheath) o.material = [o.material, clayFlesh];
    // (the shadows: as the game's ModelLoader — the fish casts (hero, lod1), receives none; the ground receives)
    o.castShadow = m === 'textured' && !/\.lod2\./.test(model.userData.__url ?? '');
    o.receiveShadow = false;
  });
}

const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => (url.endsWith('/basis_transcoder.js') ? basisTranscoderJs : url.endsWith('/basis_transcoder.wasm') ? basisTranscoderWasm : url));
const ktx2 = new KTX2Loader(manager).setTranscoderPath('basis/').detectSupport(renderer);
const gltfLoader = new GLTFLoader(manager).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);

async function load(url) {
  if (model) { scene.remove(model); original.clear(); bind.clear(); }
  if (clayAtlas) { clayAtlas.map?.dispose(); clayAtlas.roughnessMap?.dispose(); clayAtlas.dispose(); clayAtlas = null; }
  if (ground) { scene.remove(ground); ground = null; }
  const gltf = await gltfLoader.loadAsync(url);
  model = gltf.scene;
  model.userData.__url = url;
  scene.add(model);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  regions = {}; rig = null;
  model.traverse((o) => {
    if (o.userData?.regions) Object.assign(regions, o.userData.regions);
    if (o.userData?.tobihaze?.regions) Object.assign(regions, o.userData.tobihaze.regions);
    if (o.userData?.tobihaze?.axes) rig = o.userData.tobihaze;
    // (skinned meshes are framed by their posed vertices; the bounds are recomputed after a pose)
    if (o.isSkinnedMesh) o.frustumCulled = false;
    // (round B4: the fin mesh's sheath triangle ranges (extras `sheath`: { fin: [first triangle, count] }) as geometry
    // groups, material 1 the opaque flesh in clay)
    const sh = o.isMesh && o.userData?.sheath && o.geometry?.index ? Object.values(o.userData.sheath).sort((a, b) => a[0] - b[0]) : null;
    if (sh?.length && !o.geometry.groups.length) {
      const total = o.geometry.index.count;
      let at = 0;
      for (const [t0, n] of sh) { if (t0 * 3 > at) o.geometry.addGroup(at, t0 * 3 - at, 0); o.geometry.addGroup(t0 * 3, n * 3, 1); at = (t0 + n) * 3; }
      if (at < total) o.geometry.addGroup(at, total - at, 0);
    }
  });
  applyMode(mode);
  return { box: [box.min.toArray(), box.max.toArray()], regions: Object.keys(regions) };
}

// ---------------------------------------------------------------------------------------------------- posing
const D2R = Math.PI / 180;
/** The fish frame's direction (s, y, z) in the object frame (anatomy.dirToObject). */
const fishDir = (v) => new THREE.Vector3(v[2], v[1], -v[0]);
/** A joint's rotation from a pose entry: [x, y, z, w] (a quaternion), { axis: [x, y, z], deg } (object frame), or
 * { channel: deg, … } by the rig's channels (tobihaze.axes.joints[name].channels[channel].axis, object frame). Several
 * channels compose in the joint's own order (tobihaze.axes.joints[name].order: R = R(order[0]) · R(order[1]) · …, as
 * rig.mjs jointRotation does), whatever order the pose object lists them in (round B1 composed them in the pose's key
 * order, so { abduction, swing } and { swing, abduction } gave different arms). */
function jointRotation(name, e) {
  const q = new THREE.Quaternion();
  if (Array.isArray(e)) return e.length === 4 ? q.fromArray(e).normalize() : q;
  if (e.axis) return q.setFromAxisAngle(new THREE.Vector3(...e.axis).normalize(), (e.deg ?? 0) * D2R);
  const J = rig?.axes?.joints?.[name], ch = J?.channels ?? {};
  for (const c of J?.order ?? Object.keys(e)) {
    const deg = e[c];
    if (typeof deg !== 'number' || !ch[c]) continue;
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...ch[c].axis).normalize(), deg * D2R));
  }
  return q;
}
/**
 * Pose the loaded model: every bone back to its bind, then
 *   pose[J_name]  a rotation (jointRotation) and, in an object entry, `t` (a translation in head lengths along the fish
 *                 frame: the eyes' lift +0.03 / the blink's drop −0.10), `tM` (metres, object frame) or `slide` (head
 *                 lengths along the joint's slide: the premaxilla's protrusion); headrig's HEAD_POSES entries ({ angle,
 *                 lift, slide, t }) work as they are, joints the tier does not keep are skipped
 *   pose.gaze     { L: { pitch, yaw }, R: { … } } or one { pitch, yaw } (deg): the Eye nodes turned about the globe's
 *                 centre, pitch then yaw, about the axes tobihaze.axes.eyes gives
 *   pose.morph    { target: w } on every mesh that has the target, or { MeshName: { target: w } }
 *   pose.ground   a ground plane under the posed fish (its lowest point; `ground: <metres>` lowers it further)
 */
function applyPose(pose = {}) {
  if (!model) return;
  model.traverse((o) => {
    if (!o.isBone && !/^J_|^Eye_/.test(o.name)) return;
    if (!bind.has(o)) bind.set(o, { p: o.position.clone(), q: o.quaternion.clone() });
    const b = bind.get(o); o.position.copy(b.p); o.quaternion.copy(b.q);
  });
  model.traverse((o) => { if (o.morphTargetInfluences) o.morphTargetInfluences.fill(0); });
  const hl = (rig?.hlMM ?? 16.1345) * 0.001;
  for (const [name, e] of Object.entries(pose)) {
    // (the joints, and the Eye_L / Eye_R nodes themselves: the globe moved on its own, its joint and the skin it
    // carries left alone)
    if (!/^J_|^Eye_[LR]$/.test(name)) continue;
    const o = model.getObjectByName(name);
    if (!o) continue; // (a joint the tier does not keep)
    o.quaternion.multiply(jointRotation(name, e));
    if (e && !Array.isArray(e) && e.t) o.position.add(fishDir(e.t).multiplyScalar(hl));
    if (e && !Array.isArray(e) && e.tM) o.position.add(new THREE.Vector3(...e.tM));
    // (a head joint's `slide`: along its slide direction, in head lengths, as headrig.poseLocals moves the premaxilla)
    const sl = rig?.axes?.joints?.[name]?.slide;
    if (e && !Array.isArray(e) && e.slide && sl) o.position.add(new THREE.Vector3(...sl.dir).multiplyScalar(e.slide * sl.mPerUnit));
  }
  // (gaze: { L: { pitch, yaw }, R: { … } }, or one { pitch, yaw } for both eyes, as headrig's HEAD_POSES give it)
  const gz = pose.gaze && ('pitch' in pose.gaze || 'yaw' in pose.gaze) ? { L: pose.gaze, R: pose.gaze } : pose.gaze ?? {};
  for (const [side, g] of Object.entries(gz)) {
    const o = model.getObjectByName(`Eye_${side}`), ax = rig?.axes?.eyes?.[side]?.gaze;
    if (!o || !ax) continue;
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...ax.yaw.axis), (g.yaw ?? 0) * D2R);
    const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...ax.pitch.axis), (g.pitch ?? 0) * D2R);
    o.quaternion.copy(bind.get(o)?.q ?? new THREE.Quaternion()).multiply(qy.multiply(qp));
  }
  const mo = pose.morph ?? {};
  model.traverse((o) => {
    if (!o.morphTargetDictionary) return;
    const own = mo[o.name] ?? mo[o.parent?.name] ?? {};
    const set = new Set();
    for (const [k, w] of Object.entries({ ...mo, ...own })) {
      if (typeof w !== 'number') continue;
      const i = o.morphTargetDictionary[k];
      if (i !== undefined) { o.morphTargetInfluences[i] = w; set.add(k); }
    }
    // (the far tier's merged fin cards: `<state>_<fin>` takes the weight pose.morph gives that fin's state, as the
    // near tiers' Fin_* meshes take it)
    for (const [k, i] of Object.entries(o.morphTargetDictionary)) {
      const m = /^([A-Za-z]+)_(Fin_\w+)$/.exec(k);
      if (!m) continue;
      const w = mo[m[2]]?.[m[1]] ?? mo[m[1]];
      if (typeof w === 'number') { o.morphTargetInfluences[i] = w; set.add(k); }
    }
    // (correctives driven by a joint (the mesh's extras `drive`: weight = clamp(value / per, 0, 1)), where the pose does
    // not give their weight: the eyes-up web by the eye's lift, the blink by its drop, the gape by the jaw's angle;
    // round B4: `per` may be negative — lod2's pitchDown_Fin_Pelvic is authored at J_pelvic's lower range end)
    const drive = (o.userData?.drive ?? o.parent?.userData?.drive) || {};
    for (const [k, d] of Object.entries(drive)) {
      const i = o.morphTargetDictionary[k];
      if (i === undefined || set.has(k) || !d || typeof d.joint !== 'string' || !d.per) continue;
      const e = pose[d.joint];
      if (!e || Array.isArray(e)) continue;
      const v = d.channel === 'lift' ? e.t?.[1] ?? 0 : d.channel === 'drop' ? -(e.t?.[1] ?? 0) : e[d.channel] ?? 0;
      o.morphTargetInfluences[i] = Math.min(1, Math.max(0, v / d.per));
    }
  });
  model.updateMatrixWorld(true);
  // the posed bounds: skinned meshes from their skinned, morphed vertices
  box = new THREE.Box3();
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || o.name === '__ground') return;
    if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); o.computeBoundingSphere(); }
    box.expandByObject(o, !o.isSkinnedMesh);
  });
  if (ground) { scene.remove(ground); ground = null; }
  if (pose.ground !== undefined && pose.ground !== false) {
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), r = Math.max(size.x, size.z) * 8;
    ground = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), groundMat);
    ground.name = '__ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(c.x, box.min.y - (typeof pose.ground === 'number' ? pose.ground : 0.00005), c.z);
    ground.receiveShadow = true;
    scene.add(ground);
    ground.material = mode === 'silhouette' ? silMat : groundMat;
    ground.visible = mode !== 'silhouette';
  }
}

const tmpV = new THREE.Vector3();
/**
 * shot.view: { azim: deg (0 = from the front, 90 = from the fish's left, 180 = behind), elev: deg (90 = above),
 *   roll: deg, ortho: bool, fov: deg, fit: 'all' | region name | [[x,y,z],[x,y,z]], margin: share, shift: [x, y] share }
 */
function setView(v) {
  const azim = THREE.MathUtils.degToRad(v.azim ?? 0), elev = THREE.MathUtils.degToRad(v.elev ?? 0);
  const dir = new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev));
  let b = box;
  // (round T1: 'node:<name>' frames that node's posed bounds — a skinned mesh from its skinned, morphed vertices — grown
  // by v.grow metres: the eye close-ups)
  // ('node:A|B' frames several nodes together)
  const nodes = typeof v.fit === 'string' && v.fit.startsWith('node:') ? v.fit.slice(5).split('|').map((n) => model?.getObjectByName(n)).filter(Boolean) : [];
  if (nodes.length) {
    b = new THREE.Box3();
    for (const node of nodes) node.traverse((o) => { if (!o.isMesh) return; if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } b.expandByObject(o, !o.isSkinnedMesh); });
    if (v.grow) b.expandByScalar(v.grow);
  } else if (typeof v.fit === 'string' && v.fit !== 'all' && regions[v.fit]) b = new THREE.Box3(new THREE.Vector3(...regions[v.fit][0]), new THREE.Vector3(...regions[v.fit][1]));
  else if (Array.isArray(v.fit)) b = new THREE.Box3(new THREE.Vector3(...v.fit[0]), new THREE.Vector3(...v.fit[1]));
  const centre = b.getCenter(new THREE.Vector3());
  if (v.target) centre.set(...v.target);
  const size = b.getSize(new THREE.Vector3()).length();
  // camera basis
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, v.topUp ?? 1) : new THREE.Vector3(0, 1, 0);
  const w = canvas.clientWidth, h = canvas.clientHeight, aspect = w / h;
  const fwd = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
  const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();
  if (v.roll) { const q = new THREE.Quaternion().setFromAxisAngle(fwd, THREE.MathUtils.degToRad(v.roll)); right.applyQuaternion(q); camUp.applyQuaternion(q); }
  // extent of the fitted box across the view
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let c = 0; c < 8; c++) {
    tmpV.set(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, c & 4 ? b.max.z : b.min.z).sub(centre);
    const x = tmpV.dot(right), y = tmpV.dot(camUp);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const margin = 1 + (v.margin ?? 0.08);
  const halfW = Math.max((maxX - minX) / 2, ((maxY - minY) / 2) * aspect) * margin;
  const halfH = halfW / aspect;
  const off = new THREE.Vector3().addScaledVector(right, (minX + maxX) / 2).addScaledVector(camUp, (minY + maxY) / 2);
  if (v.shift) off.addScaledVector(right, v.shift[0] * halfW * 2).addScaledVector(camUp, v.shift[1] * halfH * 2);
  const look = centre.clone().add(off);
  if (v.ortho) {
    camera = ortho;
    ortho.left = -halfW; ortho.right = halfW; ortho.top = halfH; ortho.bottom = -halfH;
    ortho.position.copy(look).addScaledVector(dir, size * 2);
    ortho.up.copy(camUp);
    ortho.lookAt(look);
    ortho.near = size * 0.01; ortho.far = size * 10;
    ortho.updateProjectionMatrix();
  } else {
    camera = persp;
    persp.fov = v.fov ?? 30;
    persp.aspect = aspect;
    const dist = halfH / Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)) + size * 0.5;
    persp.position.copy(look).addScaledVector(dir, dist);
    persp.up.copy(camUp);
    persp.lookAt(look);
    persp.near = dist * 0.02; persp.far = dist * 20;
    persp.updateProjectionMatrix();
    controls.target.copy(look);
  }
  // the key light keeps its place relative to the camera (photos are lit from the camera's side and above); the zukan's
  // key stays where ModelPreview puts it (the turntable turns the fish under it)
  if (L.keyFixed) {
    key.position.set(...L.keyFixed).add(look); key.target.position.copy(look);
  } else if (v.light !== 'fixed') {
    key.position.copy(dir).multiplyScalar(0.7).addScaledVector(camUp, 0.9).addScaledVector(right, -0.5);
    fill.position.copy(dir).multiplyScalar(0.5).addScaledVector(right, 0.9);
    rim.position.copy(dir).multiplyScalar(-1).addScaledVector(camUp, 0.6);
    // (the sun's direction as the key's, from the subject)
    key.position.normalize().multiplyScalar(size * 3).add(look); key.target.position.copy(look);
    // (round T2 integrator: v.keyBehind { up } — the sun behind the fish, opposite the camera and `up` above: the backlit
    // fins' check, A065 / A070; the environment follows the key, updateEnv)
    if (v.keyBehind) key.position.copy(dir).negate().add(new THREE.Vector3(0, v.keyBehind.up ?? 0.35, 0)).normalize().multiplyScalar(size * 3).add(look);
  }
  key.target.updateMatrixWorld();
  // the sun's shadow camera round the subject
  const sc = key.shadow.camera, r = Math.max(size, 1e-3) * 1.2;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = size * 0.5; sc.far = size * 6;
  sc.updateProjectionMatrix();
  // (the cards: in the frame's middle, facing the camera)
  if (cards) {
    const span = halfW * 0.5;
    cards.children.forEach((c, i) => {
      c.scale.setScalar(span * 0.9);
      c.position.copy(look).addScaledVector(right, (i - (cards.children.length - 1) / 2) * span);
      c.lookAt(c.position.clone().add(dir));
    });
  }
  return look;
}

// ------------------------------------------------------------------------------------------------ the fins' reference
/**
 * The fins depth-peeled (round T2: the reference the blending order is measured against): the scene without its blended
 * fins into a linear target with its depth; then FIN_PEEL.layers passes of the blended fins, each the nearest fin surface
 * behind the last layer and in front of the opaque scene (an opaque, double-sided copy of the fin's material that
 * discards what the previous layer's depth or the scene's covers, and its texels under 1/255 of coverage), every layer's
 * colour and coverage kept; composited back to front in linear light (c·a + below·(1 − a): three's normal blending) and
 * tone mapped as the HDR pipeline does. Exact per pixel up to FIN_PEEL.layers fin surfaces (the report gives the last
 * layer's coverage). A fin primitive that is the opaque twin of a blended one (pass 'solid') is left out: the blended
 * primitive holds the whole fin.
 */
export const FIN_PEEL = { layers: 8 };
const peelU = { tPrev: { value: null }, tOp: { value: null }, uRes: { value: new THREE.Vector2() }, uFirst: { value: 1 } };
const peelMats = new Map();
function peelMaterial(m) {
  if (!peelMats.has(m)) {
    const p = m.clone();
    p.transparent = false; p.blending = THREE.NoBlending; p.depthWrite = true; p.depthTest = true; p.side = THREE.DoubleSide; p.forceSinglePass = true; p.alphaTest = 1 / 255;
    p.onBeforeCompile = (sh) => {
      // (round T2 integrator: the runtime rules — the fins' translucency — on the reference too)
      rtHooks.get(m)?.(sh);
      Object.assign(sh.uniforms, peelU);
      sh.fragmentShader = 'uniform sampler2D tPrev; uniform sampler2D tOp; uniform vec2 uRes; uniform float uFirst;\n' + sh.fragmentShader.replace('void main() {', `void main() {
  vec2 tbUv = gl_FragCoord.xy / uRes;
  if (gl_FragCoord.z >= texture2D(tOp, tbUv).r) discard;
  if (uFirst < 0.5 && gl_FragCoord.z <= texture2D(tPrev, tbUv).r) discard;`);
    };
    p.customProgramCacheKey = () => `peel-${m.uuid}`;
    peelMats.set(m, p);
  }
  return peelMats.get(m);
}
let peelRTs = [];
function peelTargets(w, h, n) {
  if (peelRTs.length !== n + 1 || peelRTs[0].width !== w || peelRTs[0].height !== h) {
    for (const t of peelRTs) t.dispose();
    peelRTs = Array.from({ length: n + 1 }, () => { const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true }); t.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType); return t; });
  }
  return peelRTs;
}
let compMat = null;
const compScene = new THREE.Scene();
function renderPeel() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2()), n = FIN_PEEL.layers, T = peelTargets(s.x, s.y, n);
  const fins = [];
  model.traverse((o) => { if (o.isMesh && o.visible) { const m = original.get(o) ?? o.material; if (m?.userData?.tobihaze?.role === 'fin' && (m.transparent || m.userData.tobihaze.pass === 'solid')) fins.push([o, m]); } });
  for (const [o] of fins) o.visible = false;
  renderer.setRenderTarget(T[0]); renderer.render(scene, camera);
  peelU.tOp.value = T[0].depthTexture; peelU.uRes.value.set(s.x, s.y);
  const bg = scene.background; scene.background = null;
  const hidden = [];
  scene.traverse((o) => { if (o.visible && (o.isMesh || o.isSprite) && !fins.some(([f]) => f === o)) { hidden.push(o); o.visible = false; } });
  const blended = fins.filter(([, m]) => m.transparent);
  for (const [o, m] of blended) { o.visible = true; o.material = peelMaterial(m); }
  renderer.setClearColor(0x000000, 0);
  for (let k = 1; k <= n; k++) {
    peelU.uFirst.value = k === 1 ? 1 : 0; peelU.tPrev.value = k === 1 ? T[0].depthTexture : T[k - 1].depthTexture;
    renderer.setRenderTarget(T[k]); renderer.clear(true, true, true); renderer.render(scene, camera);
  }
  for (const [o, m] of fins) { o.material = m; o.visible = true; }
  for (const o of hidden) o.visible = true;
  scene.background = bg;
  if (!compMat) {
    let code = 'uniform sampler2D tOp;\n';
    for (let k = 1; k <= n; k++) code += `uniform sampler2D tL${k};\n`;
    code += 'varying vec2 vUv;\nvoid main() {\n  vec3 c = texture2D(tOp, vUv).rgb; vec4 l;\n';
    for (let k = n; k >= 1; k--) code += `  l = texture2D(tL${k}, vUv); c = l.rgb * l.a + c * (1.0 - l.a);\n`;
    code += '  gl_FragColor = vec4(c, 1.0);\n}';
    compMat = new THREE.ShaderMaterial({ uniforms: { tOp: { value: null }, ...Object.fromEntries(Array.from({ length: n }, (_, i) => [`tL${i + 1}`, { value: null }])) }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: code, depthTest: false, depthWrite: false, toneMapped: false });
    compScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compMat));
  }
  compMat.uniforms.tOp.value = T[0].texture;
  for (let k = 1; k <= n; k++) compMat.uniforms[`tL${k}`].value = T[k].texture;
  const out = hdrTarget();
  renderer.setRenderTarget(out); renderer.render(compScene, outCam);
  renderer.setRenderTarget(null);
  outMat.uniforms.tSrc.value = out.texture; renderer.render(outScene, outCam);
  return { layers: n };
}
const dwCopies = new Map(), matSaved = new Map();
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
}

let finRender = null;
function render() {
  if (finRender === 'peel' && model) return renderPeel();
  if (L.pipeline === 'hdr') {
    const t = hdrTarget();
    renderer.setRenderTarget(t); renderer.render(scene, camera); renderer.setRenderTarget(null);
    outMat.uniforms.tSrc.value = t.texture; renderer.render(outScene, outCam);
  } else renderer.render(scene, camera);
  return null;
}

const initial = params.get('model');
const ready = initial ? load(initial) : Promise.resolve();
window.__tobi = {
  load,
  LIGHT,
  async set(shot) {
    await ready;
    if (shot.model) await load(shot.model);
    if (shot.mode) applyMode(shot.mode);
    // (the exposure test's cards: shot.cards { albedos, only })
    if (cards) { scene.remove(cards); cards = null; }
    if (shot.cards) {
      cards = new THREE.Group();
      for (const a of shot.cards.albedos ?? [0.18, 0.8]) cards.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cardMat(a)));
      scene.add(cards);
    }
    if (model) model.visible = !(shot.cards?.only);
    // (round T1: the light rig — the mode's own unless the shot names one — and the runtime uniforms' preview)
    setLight(shot.light ?? (mode === 'textured' ? 'photo' : 'studio'), shot.lightOver ?? {});
    msaa = shot.msaa ?? 4;
    // (the fins' blending: 'peel' the reference, 'depthWrite' the blended fins writing depth, 'gltf' as three's GLTFLoader
    // leaves them (no depth writes); by default the material's own runtime contract — extras tobihaze.blend.depthWrite,
    // round T2: what the game draws once ModelLoader reads it — else as loaded)
    finRender = shot.finRender ?? null;
    if (model) model.traverse((o) => {
      if (!o.isMesh) return;
      const m = original.get(o);
      if (mode !== 'textured' || !m?.userData?.tobihaze || m.userData.tobihaze.role !== 'fin' || !m.transparent) return;
      const dw = finRender === 'depthWrite' || (finRender !== 'gltf' && finRender !== 'peel' && !!m.userData.tobihaze.blend?.depthWrite);
      if (dw) { if (!dwCopies.has(m)) { const c = m.clone(); c.depthWrite = true; dwCopies.set(m, c); } o.material = dwCopies.get(m); } else o.material = m;
    });
    // (round T2 integrator: the runtime rules on every textured material — the fins' translucency and the pupil's variant
    // always, the rest with shot.material — the depth-writing copies included; patchRuntime's header)
    if (model && mode === 'textured') model.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [original.get(o)].flat()) patchRuntime(m);
      for (const m of [o.material].flat()) patchRuntime(m);
      const pu = original.get(o)?.userData?.tobihaze?.runtime?.pupil?.variants;
      if (pu) pupilVariants = pu;
    });
    setRuntime(shot.material ?? null, shot);
    // (shot.matOver { property: value }: set on every material of the model for this shot, restored at the next — the
    // measurements' switches, e.g. { clearcoat: 0 } for the film's own share of the picture)
    for (const [m, v] of matSaved) { Object.assign(m, v); m.needsUpdate = true; }
    matSaved.clear();
    if (shot.matOver && model) model.traverse((o) => { if (!o.isMesh) return; for (const m of [o.material].flat()) { if (matSaved.has(m)) continue; matSaved.set(m, Object.fromEntries(Object.keys(shot.matOver).map((k) => [k, m[k]]))); Object.assign(m, shot.matOver); m.needsUpdate = true; } });
    // (view.only / view.hide: a regular expression on the mesh's node name (or its parent's, for a multi-primitive
    // mesh): only those meshes drawn, or those hidden; for close checks of one part)
    const only = shot.view?.only ? new RegExp(shot.view.only) : null, hide = shot.view?.hide ? new RegExp(shot.view.hide) : null;
    if (only || hide) model.traverse((o) => { if (!o.isMesh) return; const n = `${o.name} ${o.parent?.name ?? ''}`; if ((only && !only.test(n)) || (hide && hide.test(n))) o.visible = false; });
    applyPose(shot.pose ?? shot.view?.pose ?? {});
    resize();
    setView(shot.view ?? {});
    // (the sun's size again: the pose may have swapped materials; the environment for the key's direction)
    setLight(lightRig, shot.lightOver ?? {});
    const peel = render();
    return { camera: camera.isOrthographicCamera ? 'ortho' : 'persp', light: lightRig, tone: L.pipeline === 'hdr' || L.tone === 'game' ? TONE_CURVE : 'aces', ...(peel ? { peel } : {}), calls: renderer.info.render.calls };
  },
};

await ready;
resize();
setView({ azim: 35, elev: 20, fit: 'all' });
for (const b of document.querySelectorAll('[data-view]')) {
  const views = { front: { azim: 0, elev: 0, ortho: true }, side: { azim: 90, elev: 0, ortho: true }, top: { azim: 0, elev: 90, ortho: true }, q34: { azim: 40, elev: 18 }, macro: { azim: 25, elev: 22, fov: 20, fit: 'face' } };
  b.addEventListener('click', () => { setView(views[b.dataset.view]); });
}
document.getElementById('clay').addEventListener('click', () => { applyMode(mode === 'clay' ? 'textured' : 'clay'); setLight(mode === 'textured' ? 'photo' : 'studio'); });
for (const b of document.querySelectorAll('[data-light]')) b.addEventListener('click', () => { if (mode !== 'textured') applyMode('textured'); setLight(b.dataset.light); });
if (!capture) {
  const loop = () => { controls.update(); render(); requestAnimationFrame(loop); };
  window.addEventListener('resize', resize);
  loop();
}
