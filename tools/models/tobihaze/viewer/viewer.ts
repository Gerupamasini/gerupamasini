// Development viewer for the トビハゼ model (vite dev: /gerupamasini/tools/models/tobihaze/viewer/?tier=hero&view=side).
import {
  ACESFilmicToneMapping, AmbientLight, AnimationMixer, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer, PMREMGenerator,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { instantiateModel } from '../../../../src/creatures/models/ModelLoader';
import { TobihazeMaterials } from '../../../../src/creatures/species/tobihaze/TobihazeMaterial';
import type { Texture } from 'three';

const q = new URLSearchParams(location.search);
const tier = q.get('tier') ?? 'hero';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputColorSpace = SRGBColorSpace;
const scene = new Scene();
scene.background = new Color(0x3a3d36);
const pm = new PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new HemisphereLight(0xdfe8ff, 0x4a4436, 0.6));
const sun = new DirectionalLight(0xfff2dd, 2.6);
sun.position.set(0.6, 1.0, 0.5);
scene.add(sun, new AmbientLight(0xffffff, 0.05));
const ground = new Mesh(new PlaneGeometry(2, 2), new MeshStandardMaterial({ color: 0x5c574b, roughness: 0.6 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const camera = new PerspectiveCamera(30, innerWidth / innerHeight, 0.002, 20);
const controls = new OrbitControls(camera, canvas);
const views: Record<string, [number, number, number]> = {
  side: [0.2, 0.02, 0.0], front: [0.0, 0.03, 0.2], top: [0.0, 0.22, 0.001], oblique: [0.12, 0.08, 0.12], rear: [-0.06, 0.07, -0.16],
  head: [0.05, 0.035, 0.07], headtop: [0.01, 0.09, 0.03], eye: [0.035, 0.03, 0.03], belly: [0.05, -0.08, 0.02],
  // close-ups framed like field photographs: the face head-on at eye level, and the head in profile
  face: [0.0, 0.004, 0.075], profile: [0.075, 0.004, 0.0], faceup: [0.0, 0.025, 0.07], chin: [0.012, -0.03, 0.05],
  // framed like the reference photographs: q7 front-left at head height, q8 front-left from above, lat a plain lateral
  q7: [0.05, 0.004, 0.055], q7r: [-0.05, 0.004, 0.055], domes: [0.0, 0.05, 0.03], mouth: [0.022, -0.004, 0.03], mouthf: [0.0, -0.002, 0.04], q8: [0.03, 0.045, 0.06], lat: [0.16, 0.0, -0.012], pec: [0.05, -0.004, -0.01], pecfront: [0.02, 0.0, 0.06],
};
const v = [...(views[q.get('view') ?? 'oblique'] ?? views.oblique)];
const vName = q.get('view') ?? 'oblique';
const target = new Vector3(0, 0.006, vName.startsWith('head') || vName === 'eye' ? 0.008 : vName.startsWith('face') || vName === 'profile' || vName === 'chin' || vName.startsWith('q7') || vName === 'q8' || vName === 'domes' ? 0.006 : -0.008);
if (vName === 'pec' || vName === 'pecfront') target.set(0.004, 0.001, -0.002);
if (vName === 'lat') target.set(0, 0.004, -0.012);
if (vName === 'mouth' || vName === 'mouthf') target.set(0, 0.0035, 0.0135);
if (vName.startsWith('face') || vName === 'profile') target.y = 0.0065;
if (vName === 'chin') target.set(0, 0.003, 0.012);
// free camera: tgt=x,y,z and cam=x,y,z (offset from the target), object space metres
if (q.get('tgt')) target.set(...(q.get('tgt')!.split(',').map(Number) as [number, number, number]));
if (q.get('cam')) v.splice(0, 3, ...q.get('cam')!.split(',').map(Number));
const zoom = Number(q.get('zoom') ?? 1);
camera.position.set(v[0] / zoom, v[1] / zoom, v[2] / zoom).add(target);
controls.target.copy(target);
controls.update();
if (q.get('view') === 'belly' || q.get('view') === 'chin') ground.visible = false;

const model = await instantiateModel(`tobihaze/tobihaze.${tier}.glb`);
scene.add(model.root);
if (q.get('mat') === 'runtime') {
  // the game's wet-skin materials (mucus film, wet gloss, eye cornea), fully wet
  const mats = new TobihazeMaterials(model.tier as 'hero' | 'lod1' | 'lod2');
  const skin = model.meshes.find((m) => ((Array.isArray(m.material) ? m.material[0] : m.material)?.userData?.tobihaze as { role?: string } | undefined)?.role === 'skin');
  const di = ((skin && (Array.isArray(skin.material) ? skin.material[0] : skin.material))?.userData?.tobihaze as { dataTexture?: number } | undefined)?.dataTexture;
  mats.apply(model.meshes, di !== undefined ? (model.parser.getDependency('texture', di) as Promise<Texture | null>) : null);
  mats.update({ wet: Number(q.get('wet') ?? 1), mud: 0, waterY: -1, mudColor: new Color(0x4a4236) });
}
if (q.get('mat') === 'flat' || q.get('mat') === 'normal') {
  // debugging: untextured surfaces (geometry and shading only)
  const { MeshPhysicalMaterial, MeshNormalMaterial } = await import('three');
  const flat = q.get('mat') === 'flat' ? new MeshPhysicalMaterial({ color: 0x9a9a96, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.1 }) : new MeshNormalMaterial();
  for (const m of model.meshes) if (!m.name.startsWith('Eye')) m.material = flat;
}
if (q.get('jaw')) { const jb = model.bones.J_jaw; if (jb) jb.rotation.x = Number(q.get('jaw')); }
if (q.get('bind')) model.root.traverse((o) => { const sm = o as import('three').SkinnedMesh; if (sm.isSkinnedMesh) sm.skeleton.pose(); });
for (const name of (q.get('hide') ?? '').split(',').filter(Boolean)) model.root.traverse((o) => { if (o.name === name) o.visible = false; });
if (q.get('bg')) scene.background = new Color(`#${q.get('bg')}`);
const mixer = new AnimationMixer(model.root);
const clipName = q.get('clip');
const clipT = q.get('t');
if (clipName) {
  const clip = model.clips.find((c) => c.name === clipName);
  if (clip) { const a = mixer.clipAction(clip); a.play(); if (clipT) { mixer.setTime(Number(clipT)); } }
}
const morph = q.get('morph');
if (morph) {
  const [name, w] = morph.split(':');
  model.root.traverse((o) => { const m = o as Mesh; if (m.morphTargetDictionary && name in m.morphTargetDictionary) m.morphTargetInfluences![m.morphTargetDictionary[name]] = Number(w ?? 1); });
}
(window as unknown as { __ready: boolean }).__ready = false;
let frames = 0;
const hud = document.getElementById('hud')!;
let tris = 0;
model.root.traverse((o) => { const m = o as Mesh; if (m.isMesh && m.geometry.index) tris += m.geometry.index.count / 3; });
hud.textContent = `tier ${tier}  tris ${Math.round(tris)}  clips ${model.clips.map((c) => c.name).join(',')}`;
renderer.setAnimationLoop(() => {
  if (!clipT) mixer.update(1 / 60);
  renderer.render(scene, camera);
  if (++frames > 3) (window as unknown as { __ready: boolean }).__ready = true;
});
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
