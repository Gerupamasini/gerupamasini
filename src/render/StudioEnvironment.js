// Procedural light-probe scenes baked with PMREM:
//  * studio: black cyclorama with two large soft boxes (product-shot look used
//    by the black-background reference photographs)
//  * aquarium: under-water probe — bright tank LED panel above, Snell's-window
//    glow, blue-green water column, darker gravel below.
//  * room: what the glass panes and the surface reflect from the outside.

import * as THREE from 'three';

function box(w, h, d, color, intensity = 1) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.BackSide });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}

function panel(w, h, color, intensity) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

export function buildStudioEnvScene() {
  // Black-background product set-up, as in the reference photographs: a big
  // soft box overhead and slightly behind the fish is the key (bright back,
  // the light falls off down the flank), a narrower strip box high on the
  // camera's right models the body, a low, weak frontal fill strip, a grey
  // bounce card below (what the silvery lower flank mirrors — a black floor
  // would turn it into a dark band) and a thin rim strip behind that traces
  // the dorsal contour and the fin edges.
  const scene = new THREE.Scene();
  scene.add(box(20, 12, 20, 0x050505));
  const top = panel(6, 4.5, 0xf8faff, 6.5);
  top.position.set(0.4, 5.5, 0.6);
  top.rotation.x = Math.PI / 2;
  scene.add(top);
  const side = panel(2.2, 4.5, 0xf6f8ff, 4.0);
  side.position.set(5.0, 3.2, 2.6);
  side.lookAt(0, 0, 0);
  scene.add(side);
  const front = panel(7, 1.6, 0xf6f8ff, 1.3);
  front.position.set(-0.5, 0.4, 7);
  scene.add(front);
  const rim = panel(1.0, 5, 0xdfeaff, 3.5);
  rim.position.set(-5.5, 2.5, -4.5);
  rim.lookAt(0, 0, 0);
  scene.add(rim);
  const rimTop = panel(5, 0.8, 0xe8f0ff, 2.5);
  rimTop.position.set(0, 3.5, -5.5);
  rimTop.lookAt(0, 0, 0);
  scene.add(rimTop);
  const floor = panel(8, 8, 0x30343a, 1);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3;
  scene.add(floor);
  return scene;
}

export function buildAquariumEnvScene() {
  const scene = new THREE.Scene();
  // gradient sphere: dark gravel below -> water column -> bright surface
  const geo = new THREE.SphereGeometry(10, 64, 32);
  const col = [];
  const pos = geo.attributes.position;
  // (mid water and horizon bright enough for the silvery flanks to mirror
  // the lit water column instead of a dark band)
  const cBottom = new THREE.Color(0x14120d);
  const cMid = new THREE.Color(0x163a37).multiplyScalar(2.0);
  const cHorizon = new THREE.Color(0x29524c).multiplyScalar(2.0);
  const cTop = new THREE.Color(0x6fa8b0);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y < -0.2) c.copy(cBottom).lerp(cMid, (y + 1) / 0.8);
    else if (y < 0.3) c.copy(cMid).lerp(cHorizon, (y + 0.2) / 0.5);
    else c.copy(cHorizon).lerp(cTop, (y - 0.3) / 0.7);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // Snell's window: bright disc overhead (≈97° cone)
  const win = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe4ea).multiplyScalar(1.6), side: THREE.DoubleSide }));
  win.position.set(0, 8.5, 0);
  win.rotation.x = Math.PI / 2;
  scene.add(win);
  // LED bar of the aquarium hood
  const led = panel(7, 1.2, 0xfff4e4, 9);
  led.position.set(0, 9.2, 0);
  led.rotation.x = Math.PI / 2;
  scene.add(led);
  // front glass: dim room behind the viewer
  const room = panel(12, 6, 0x2a2622, 0.6);
  room.position.set(0, 1, 9.5);
  room.rotation.y = Math.PI;
  scene.add(room);
  return scene;
}

// The room around the tank as seen in reflections from the outside (glass
// panes, frame, the water surface from above): a dim living room with a
// slightly lighter ceiling. They must not reflect the under-water probe (its
// Snell's window and LED panel would lay a milky veil on them); the hood
// light bar's reflection in the surface is traced exactly in WaterSurface.
export function buildRoomEnvScene() {
  const scene = new THREE.Scene();
  scene.add(box(20, 8, 20, 0x0c0b0a));
  const ceiling = panel(20, 20, 0x2a2724, 0.5);
  ceiling.position.y = 3.9;
  ceiling.rotation.x = Math.PI / 2;
  scene.add(ceiling);
  return scene;
}

export function bakeEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  return rt.texture;
}
