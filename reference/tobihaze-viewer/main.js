// トビハゼ reference viewer: the GLB tiers (or a clay build of the sculpt) under studio light, with fixed cameras for
// the photo comparisons (front, side, top, 3/4 front, macro face). ?model=<url> picks the file; ?capture hides the
// panel and exposes window.__tobi for scripted renders (tools/models/tobihaze/render.mjs).
// The tier GLBs (tools/models/tobihaze/build.mjs) are skinned and carry blend shapes: a shot can pose them without
// baking (shot.pose or shot.view.pose, see applyPose): joint rotations by the rig's channels (read from the GLB's root
// extras, tobihaze.axes), quaternions or axis-angles, eye joint translations, the eyes' gaze, and blend-shape weights;
// `fit: 'all'` then frames the posed fish. In clay mode the fins are drawn double-sided and translucent, the eye's
// window as its pupil (Cornea) and iris ring (Iris), the teeth as enamel.
// Round T1 (textured mode): the GLB's own materials (the baked maps; the caudal's sheath range drawn with an opaque copy
// of the fin material) under the 'photo' light — an image-based environment (three's RoomEnvironment through PMREM:
// the wet clearcoat and the eye's cornea reflect a room, as the photos' skin reflects the sky) with a sun-like key that
// follows the camera as the studio key does; its matte diffuse is matched to the studio's (LIGHT.photo: the pattern key
// calibrated its palette under the studio light, so a matte surface reads within ±5 % of it: LIGHT).
// shot.light 'studio' | 'photo' overrides the mode's own (clay keeps the studio light). shot.material { wetness, mud,
// bars, dark, tint: { hueDeg, sat, val } } previews the runtime's uniforms (the materials' extras.tobihaze.runtime: a
// GLSL port of surface.mjs wetShade on ORM B's wet retention, the bars on baseColor A).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6f6f6f);

// studio light: a soft key from the front-left above, a fill, a rim from behind, and a sky/ground ambient
const hemi = new THREE.HemisphereLight(0xdfe6ee, 0x4a4540, 0.9);
scene.add(hemi);
// (round T1 integrator: the sunlit substrate's bounce — the photos' mud, sand and rock light the cheek, the throat and the
// lower flank from below; the room environment has no ground — a hemisphere light dark above, the mud's warm grey below)
const bounce = new THREE.HemisphereLight(0x000000, 0xc8bba6, 0);
scene.add(bounce);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(0.6, 1.0, 0.8);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8eef8, 0.7);
fill.position.set(-0.9, 0.3, 0.5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.9);
rim.position.set(-0.2, 0.6, -1.0);
scene.add(rim);
/**
 * The lights per rig (round T1). studio: B1–B4's (clay). photo: the room environment for the ambient and the
 * reflections (no hemisphere), a warm sun-like key, a weak cool fill and rim; env and key set so a matte white surface's
 * mean diffuse matches the studio's (round T1, the hero in 'matte' mode, linear luminance over the fish: side 0.953, the
 * B010 3/4 view 1.039 of the studio's; the env alone 0.69 / 1.04, the key alone 0.56 / 0.39).
 */
const LIGHT = {
  studio: { hemi: 0.9, key: 2.2, keyColor: 0xffffff, fill: 0.7, rim: 0.9, env: 0, bounce: 0 },
  photo: { hemi: 0, key: 1.9, keyColor: 0xfff3e2, fill: 0.2, rim: 0.5, env: 0.25, bounce: 0.8 },
};
let envMap = null, lightRig = 'studio';
function setLight(name, over = {}) {
  const L = { ...LIGHT[name] ?? LIGHT.studio, ...over };
  lightRig = name;
  if (L.env > 0 && !envMap) {
    const pm = new THREE.PMREMGenerator(renderer);
    envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  scene.environment = L.env > 0 ? envMap : null;
  scene.environmentIntensity = L.env;
  hemi.intensity = L.hemi; bounce.intensity = L.bounce ?? 0; key.intensity = L.key; key.color.setHex(L.keyColor); fill.intensity = L.fill; rim.intensity = L.rim;
}

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
// (round T1: the textured fins' sheath — the caudal's fleshy base, alpha 1 in the atlas — drawn with an opaque copy of the
// fin material, as the clay draws it with the flesh clay: a BLEND material writes no depth)
const opaqueCopy = new Map();
const opaqueOf = (m) => { if (!opaqueCopy.has(m)) { const c = m.clone(); c.transparent = false; c.depthWrite = true; c.opacity = 1; c.alphaTest = 0; opaqueCopy.set(m, c); } return opaqueCopy.get(m); };

/**
 * The runtime's uniforms on the textured materials (round T1, a preview for the behaviour round: the materials' extras
 * tobihaze.runtime): wetness and mud (surface.mjs wetShade on ORM B, the wet retention), bars (baseColor A), dark, tint.
 * Only a shot that gives shot.material patches the materials; the plain GLB material is the master (the wet state).
 */
const RT = { uOn: { value: 0 }, uWetness: { value: 1 }, uMud: { value: 0 }, uBars: { value: 0 }, uDark: { value: 0 }, uTint: { value: new THREE.Vector3(0, 1, 1) } };
const GLSL_HSV = `
vec3 tbHsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 tbRgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
uniform float uOn; uniform float uWetness; uniform float uMud; uniform float uBars; uniform float uDark; uniform vec3 uTint;
`;
const glNum = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
function patchRuntime(mat) {
  const X = mat?.userData?.tobihaze, R = X?.runtime;
  if (!R || mat.userData.__tbPatched) return;
  mat.userData.__tbPatched = true;
  const role = X.role, W = R.wetness?.WET, wetModel = !!(W?.wet && W?.dry && W?.damp && role !== 'eye');
  const mud = W?.mud?.colour ? new THREE.Color(W.mud.colour).convertSRGBToLinear() : new THREE.Color(0.27, 0.25, 0.22);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, RT);
    sh.fragmentShader = GLSL_HSV + sh.fragmentShader;
    const skin = role === 'body' || role === 'eye';
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
${skin ? '  if (uOn > 0.5) diffuseColor.rgb *= 1.0 - 0.6 * uBars * sampledDiffuseColor.a;\n  diffuseColor.a = 1.0;' : ''}
#endif
  if (uOn > 0.5) { vec3 h = tbHsv(max(diffuseColor.rgb, vec3(0.0))); h.x = fract(h.x + uTint.x / 360.0); h.y = clamp(h.y * uTint.y, 0.0, 1.0); h.z *= uTint.z * mix(1.0, 0.45, uDark); diffuseColor.rgb = tbRgb(h); }`);
    if (!wetModel) return;
    sh.fragmentShader = sh.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
#ifdef USE_CLEARCOAT
  float tbClearcoat = clearcoat; float tbCcRough = clearcoatRoughness;
#endif
#ifdef USE_ROUGHNESSMAP
  if (uOn > 0.5) {
    float g = ${glNum(W.gamma ?? 1.2)};
    float wl = clamp(uWetness * (1.0 + g) - g * (1.0 - texelRoughness.b), 0.0, 1.0);
    float dryR = ${glNum(W.dry.roughness)} + (roughnessFactor - ${glNum(W.wet.roughness)}) * ${glNum(W.carry ?? 0.5)};
    float rr = mix(dryR, roughnessFactor, wl);
    float cw = smoothstep(0.35, 1.0, wl);
    float cc = ${glNum(W.wet.clearcoat)} * cw + ${glNum(W.damp.clearcoat)} * (1.0 - cw) * smoothstep(0.15, 0.5, wl);
    float mw = clamp(uMud, 0.0, 1.0);
    roughnessFactor = mix(rr, ${glNum(W.mud?.roughness ?? 0.7)}, mw);
#ifdef USE_CLEARCOAT
    tbClearcoat = cc * (1.0 - mw); tbCcRough = mix(${glNum(W.damp.clearcoatRoughness)}, ${glNum(W.wet.clearcoatRoughness)}, cw);
#endif
    // (round T1 integrator: the map holds the WET albedo — the pattern palette was calibrated on wet fish — so wetness 1
    // leaves it as is and the drying skin lightens and greys toward 1 / WET.wet.albedo and 1 / WET.wet.saturation)
    float am = mix(1.0 / ${glNum(W.wet.albedo ?? 1)}, 1.0, wl * (1.0 - mw)), sat = mix(1.0 / ${glNum(W.wet.saturation ?? 1)}, 1.0, wl * (1.0 - mw));
    vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(mix(vec3(l), c, sat) * am, vec3(${glNum(mud.r)}, ${glNum(mud.g)}, ${glNum(mud.b)}), mw * 0.85);
  }
#endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#if defined(USE_CLEARCOAT) && defined(USE_ROUGHNESSMAP)
  material.clearcoat = saturate(tbClearcoat); material.clearcoatRoughness = min(max(tbCcRough, 0.0525) + geometryRoughness, 1.0);
#endif`);
  };
  mat.customProgramCacheKey = () => `tobihaze-rt-${role}-${wetModel}`;
  mat.needsUpdate = true;
}
function setRuntime(m = null) {
  RT.uOn.value = m ? 1 : 0;
  m = m ?? {};
  RT.uWetness.value = m.wetness ?? 1; RT.uMud.value = m.mud ?? 0; RT.uBars.value = m.bars ?? 0; RT.uDark.value = m.dark ?? 0;
  RT.uTint.value.set(m.tint?.hueDeg ?? 0, m.tint?.sat ?? 1, m.tint?.val ?? 1);
}
const silMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
// x-ray: the skeleton opaque (alizarin red, as a cleared and stained specimen) inside a faint skin
const boneMat = new THREE.MeshStandardMaterial({ color: 0xc0283c, roughness: 0.5, metalness: 0 });
const cartMat = new THREE.MeshStandardMaterial({ color: 0x3f7fd0, roughness: 0.5, metalness: 0 });
const ghostMat = new THREE.MeshStandardMaterial({ color: 0xe8dc8a, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
let model = null, original = new Map(), mode = 'clay', box = new THREE.Box3(), regions = {}, rig = null, ground = null;
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
    if (o.name === '__ground') { o.material = m === 'silhouette' ? silMat : groundMat; o.visible = m !== 'silhouette'; return; }
    o.visible = !(m === 'bones' && !bone && !cart && !tooth) && !((m === 'clay' || m === 'silhouette' || m === 'textured' || m === 'matte') && (bone || cart));
    if (m === 'xray' || m === 'bones') o.material = bone || tooth ? boneMat : cart ? cartMat : ghostMat;
    // a globe with a window has a skin cap (clay like the head); a bare globe keeps the eye clay
    const capped = eye && o.parent?.children.some((c) => /cornea/i.test((original.get(c) ?? c.material)?.name ?? ''));
    // (round B4: a material whose extras role is 'eye' or 'body' (the one-primitive eye, the skin) on the clay atlas)
    const role = om?.userData?.tobihaze?.role, atlas = m === 'clay' && !tooth && (role === 'eye' || role === 'body') ? clayAtlasMaterial() : null;
    if (m !== 'xray' && m !== 'bones') o.material = m === 'clay' ? (atlas ?? (tooth ? toothMat : fin ? (merged ? clayFinMask : clayFin) : iris ? clayIris : cornea ? clayCornea : eye && !capped ? clayEye : clayMat)) : m === 'silhouette' ? silMat : m === 'matte' ? matteMat : original.get(o);
    // (round B4: a fin mesh with a sheath range (geometry groups set at load) draws it with the opaque flesh clay; a single
    // material ignores the groups; round T1: textured, an opaque copy of the fin material)
    if (m === 'clay' && fin && o.geometry?.groups?.length && o.userData?.sheath) o.material = [o.material, clayFlesh];
    if (m === 'textured' && fin && o.geometry?.groups?.length && o.userData?.sheath && !Array.isArray(o.material)) o.material = [o.material, opaqueOf(o.material)];
  });
}

async function load(url) {
  if (model) { scene.remove(model); original.clear(); bind.clear(); }
  if (clayAtlas) { clayAtlas.map?.dispose(); clayAtlas.roughnessMap?.dispose(); clayAtlas.dispose(); clayAtlas = null; }
  if (ground) { scene.remove(ground); ground = null; }
  const gltf = await new GLTFLoader().loadAsync(url);
  model = gltf.scene;
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
    if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); }
    box.expandByObject(o, !o.isSkinnedMesh);
  });
  if (ground) { scene.remove(ground); ground = null; }
  if (pose.ground !== undefined && pose.ground !== false) {
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), r = Math.max(size.x, size.z) * 8;
    ground = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), groundMat);
    ground.name = '__ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(c.x, box.min.y - (typeof pose.ground === 'number' ? pose.ground : 0.00005), c.z);
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
  // the key light keeps its place relative to the camera (photos are lit from the camera's side and above)
  if (v.light !== 'fixed') {
    key.position.copy(dir).multiplyScalar(0.7).addScaledVector(camUp, 0.9).addScaledVector(right, -0.5);
    fill.position.copy(dir).multiplyScalar(0.5).addScaledVector(right, 0.9);
    rim.position.copy(dir).multiplyScalar(-1).addScaledVector(camUp, 0.6);
  }
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
}

function render() { renderer.render(scene, camera); }

const initial = params.get('model');
const ready = initial ? load(initial) : Promise.resolve();
window.__tobi = {
  load,
  async set(shot) {
    await ready;
    if (shot.model) await load(shot.model);
    if (shot.mode) applyMode(shot.mode);
    // (round T1: the light rig — the mode's own unless the shot names one — and the runtime uniforms' preview)
    setLight(shot.light ?? (mode === 'textured' ? 'photo' : 'studio'), shot.lightOver ?? {});
    if (shot.material && model) model.traverse((o) => { if (!o.isMesh) return; for (const m of [original.get(o)].flat()) patchRuntime(m); for (const m of [o.material].flat()) patchRuntime(m); });
    setRuntime(shot.material ?? null);
    // (view.only / view.hide: a regular expression on the mesh's node name (or its parent's, for a multi-primitive
    // mesh): only those meshes drawn, or those hidden; for close checks of one part)
    const only = shot.view?.only ? new RegExp(shot.view.only) : null, hide = shot.view?.hide ? new RegExp(shot.view.hide) : null;
    if (only || hide) model.traverse((o) => { if (!o.isMesh) return; const n = `${o.name} ${o.parent?.name ?? ''}`; if ((only && !only.test(n)) || (hide && hide.test(n))) o.visible = false; });
    applyPose(shot.pose ?? shot.view?.pose ?? {});
    resize();
    setView(shot.view ?? {});
    render();
    return { camera: camera.isOrthographicCamera ? 'ortho' : 'persp' };
  },
};

await ready;
resize();
setView({ azim: 35, elev: 20, fit: 'all' });
for (const b of document.querySelectorAll('[data-view]')) {
  const views = { front: { azim: 0, elev: 0, ortho: true }, side: { azim: 90, elev: 0, ortho: true }, top: { azim: 0, elev: 90, ortho: true }, q34: { azim: 40, elev: 18 }, macro: { azim: 25, elev: 22, fov: 20, fit: 'face' } };
  b.addEventListener('click', () => setView(views[b.dataset.view]));
}
document.getElementById('clay').addEventListener('click', () => { applyMode(mode === 'clay' ? 'textured' : 'clay'); setLight(mode === 'textured' ? 'photo' : 'studio'); });
if (!capture) {
  const loop = () => { controls.update(); render(); requestAnimationFrame(loop); };
  window.addEventListener('resize', resize);
  loop();
}
