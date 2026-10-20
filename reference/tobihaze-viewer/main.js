// トビハゼ reference viewer: the GLB tiers (or a clay build of the sculpt) under studio light, with fixed cameras for
// the photo comparisons (front, side, top, 3/4 front, macro face). ?model=<url> picks the file; ?capture hides the
// panel and exposes window.__tobi for scripted renders (tools/models/tobihaze/render.mjs).
// The tier GLBs (tools/models/tobihaze/build.mjs) are skinned and carry blend shapes: a shot can pose them without
// baking (shot.pose or shot.view.pose, see applyPose): joint rotations by the rig's channels (read from the GLB's root
// extras, tobihaze.axes), quaternions or axis-angles, eye joint translations, the eyes' gaze, and blend-shape weights;
// `fit: 'all'` then frames the posed fish. In clay mode the fins are drawn double-sided and translucent, the eye's
// window as its pupil (Cornea) and iris ring (Iris), the teeth as enamel.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x4a4540, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(0.6, 1.0, 0.8);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8eef8, 0.7);
fill.position.set(-0.9, 0.3, 0.5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.9);
rim.position.set(-0.2, 0.6, -1.0);
scene.add(rim);

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
const groundMat = new THREE.MeshStandardMaterial({ color: 0x8d877e, roughness: 0.9, metalness: 0 });
const silMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
// x-ray: the skeleton opaque (alizarin red, as a cleared and stained specimen) inside a faint skin
const boneMat = new THREE.MeshStandardMaterial({ color: 0xc0283c, roughness: 0.5, metalness: 0 });
const cartMat = new THREE.MeshStandardMaterial({ color: 0x3f7fd0, roughness: 0.5, metalness: 0 });
const ghostMat = new THREE.MeshStandardMaterial({ color: 0xe8dc8a, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
let model = null, original = new Map(), mode = 'clay', box = new THREE.Box3(), regions = {}, rig = null, ground = null;
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
    o.visible = !(m === 'bones' && !bone && !cart && !tooth) && !((m === 'clay' || m === 'silhouette' || m === 'textured') && (bone || cart));
    if (m === 'xray' || m === 'bones') o.material = bone || tooth ? boneMat : cart ? cartMat : ghostMat;
    // a globe with a window has a skin cap (clay like the head); a bare globe keeps the eye clay
    const capped = eye && o.parent?.children.some((c) => /cornea/i.test((original.get(c) ?? c.material)?.name ?? ''));
    if (m !== 'xray' && m !== 'bones') o.material = m === 'clay' ? (tooth ? toothMat : fin ? (merged ? clayFinMask : clayFin) : iris ? clayIris : cornea ? clayCornea : eye && !capped ? clayEye : clayMat) : m === 'silhouette' ? silMat : original.get(o);
  });
}

async function load(url) {
  if (model) { scene.remove(model); original.clear(); bind.clear(); }
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
    // not give their weight: the eyes-up web by the eye's lift, the blink by its drop, the gape by the jaw's angle)
    const drive = (o.userData?.drive ?? o.parent?.userData?.drive) || {};
    for (const [k, d] of Object.entries(drive)) {
      const i = o.morphTargetDictionary[k];
      if (i === undefined || set.has(k) || !d || typeof d.joint !== 'string' || !(d.per > 0)) continue;
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
  if (typeof v.fit === 'string' && v.fit !== 'all' && regions[v.fit]) b = new THREE.Box3(new THREE.Vector3(...regions[v.fit][0]), new THREE.Vector3(...regions[v.fit][1]));
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
document.getElementById('clay').addEventListener('click', () => applyMode(mode === 'clay' ? 'textured' : 'clay'));
if (!capture) {
  const loop = () => { controls.update(); render(); requestAnimationFrame(loop); };
  window.addEventListener('resize', resize);
  loop();
}
