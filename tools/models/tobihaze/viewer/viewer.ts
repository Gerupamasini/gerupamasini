// Development viewer for the トビハゼ model (vite dev: /gerupamasini/tools/models/tobihaze/viewer/?tier=hero&view=side).
import {
  ACESFilmicToneMapping, AmbientLight, AnimationMixer, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer, PMREMGenerator,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { instantiateModel } from '../../../../src/creatures/models/ModelLoader';

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
};
const v = views[q.get('view') ?? 'oblique'] ?? views.oblique;
const target = new Vector3(0, 0.006, q.get('view')?.startsWith('head') || q.get('view') === 'eye' ? 0.008 : -0.008);
const zoom = Number(q.get('zoom') ?? 1);
camera.position.set(v[0] / zoom, v[1] / zoom, v[2] / zoom).add(target);
controls.target.copy(target);
controls.update();
if (q.get('view') === 'belly') ground.visible = false;

const model = await instantiateModel(`tobihaze/tobihaze.${tier}.glb`);
scene.add(model.root);
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
