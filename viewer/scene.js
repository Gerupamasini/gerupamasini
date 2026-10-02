// Shared scene setup for the demo pages: renderer, clear mountain-stream water look, gravel bed, rock (cover), GLB load, camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Yamame } from '../src/yamame/Yamame.js';

function gravelTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#4a4940'; g.fillRect(0, 0, 1024, 1024);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 16000; i++) { const x = rnd() * 1024, y = rnd() * 1024, rr = 2.5 + rnd() * rnd() * 16, l = 22 + rnd() * 38, hh = 28 + rnd() * 24; g.fillStyle = `hsl(${hh},${6 + rnd() * 16}%,${l}%)`; g.beginPath(); g.ellipse(x, y, rr, rr * (0.55 + rnd() * 0.35), rnd() * 3.14, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(10,10,8,0.35)'; g.lineWidth = 1.2; g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/** Load a GLB from a URL or from bytes already in memory (single-file builds). Bytes path avoids fetch(): ImageBitmapLoader would fetch blob: URLs, so it is switched off while parsing. */
async function loadGLB({ url, bytes }) {
  const loader = new GLTFLoader();
  if (!bytes) return loader.loadAsync(url);
  const cib = window.createImageBitmap; window.createImageBitmap = undefined;
  try { return await new Promise((res, rej) => loader.parse(bytes, '', res, rej)); } finally { window.createImageBitmap = cib; }
}

export async function createScene({ q = new URLSearchParams(location.search), glb = '/assets/generated/yamame.glb', glbBytes = null, bedY = -0.075, rock = null, fogDensity = 0.12 } = {}) {
  const W = innerWidth, H = innerHeight;
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(W, H); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; document.body.appendChild(r.domElement);
  const scene = new THREE.Scene(); const WATER = new THREE.Color(0x2b6a72);
  scene.background = WATER.clone().multiplyScalar(0.75); scene.fog = new THREE.FogExp2(WATER.getHex(), fogDensity);
  const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight(0xcfeef5, 0x1c2c25, 0.8));
  const sun = new THREE.DirectionalLight(0xfff1d8, 3.2); sun.position.set(0.8, 2.2, 0.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.1, far: 7 }); sun.shadow.bias = -0.0004; scene.add(sun);
  const tex = gravelTexture();
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, bumpMap: tex, bumpScale: 6 }));
  bed.rotation.x = -Math.PI / 2; bed.position.y = bedY; bed.receiveShadow = true; scene.add(bed);
  let rockMesh = null;
  if (rock) {
    let g = new THREE.IcosahedronGeometry(rock.r, 5); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-5); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + 0.12 * Math.sin(x * 40 + y * 23) * Math.cos(z * 31) + 0.05 * Math.sin(y * 70); p.setXYZ(i, x * n * 1.1, y * n * 0.85, z * n); }
    g.computeVertexNormals();
    rockMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x585a52, roughness: 0.9, bumpMap: tex, bumpScale: 4 })); rockMesh.position.set(rock.x, bedY + rock.r * 0.55, rock.z); rockMesh.castShadow = rockMesh.receiveShadow = true; scene.add(rockMesh);
  }
  const gltf = await loadGLB({ url: q.get('file') || glb, bytes: glbBytes });
  scene.add(gltf.scene); gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const fish = new Yamame(gltf, { phase0: 0 });
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.005, 60); cam.position.set(0.26, 0.09, 0.30);
  const ctl = new OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.minDistance = 0.08; ctl.maxDistance = 6;
  addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
  return { THREE, r, scene, cam, ctl, fish, gltf, sun, bed, rockMesh };
}

/** Camera presets relative to the fish (used for headless stills). */
export function presetCamera({ cam, ctl, fish }, name) {
  const p = fish.pos, h = fish.heading, fwd = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)), right = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
  const at = (f, rr, y) => new THREE.Vector3(p.x, p.y, p.z).addScaledVector(fwd, f).addScaledVector(right, rr).add(new THREE.Vector3(0, y, 0));
  const tgt = at(0, 0, 0), V = { side: [at(0, 0.55, 0.03), tgt], top: [at(0, 0.001, 0.62), tgt], front: [at(0.5, 0, 0.02), tgt], head: [at(0.20, 0.10, 0.05), at(0.06, 0, 0)], persp: [at(0.18, 0.30, 0.16), tgt], tail: [at(-0.35, 0.30, 0.10), at(-0.05, 0, 0)], close: [at(0.10, 0.18, 0.03), at(0.04, 0, 0)], wide: [at(0.9, 1.1, 0.35), tgt], low: [at(0.45, 0.45, -0.02), tgt] }[name || 'persp'];
  cam.position.copy(V[0]); ctl.target.copy(V[1]); if (name === 'top') cam.up.set(fwd.x, 0, fwd.z); cam.lookAt(V[1]); ctl.update();
}
