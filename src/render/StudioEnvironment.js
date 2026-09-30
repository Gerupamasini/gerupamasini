// Procedural light-probe scenes baked with PMREM:
//  * studio: black cyclorama with two large soft boxes (product-shot look used
//    by the black-background reference photographs)
//  * aquarium: under-water probe — bright tank LED panel above, Snell's-window
//    glow, blue-green water column, darker gravel below.

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
  const scene = new THREE.Scene();
  scene.add(box(20, 12, 20, 0x050505));
  const top = panel(6, 3, 0xffffff, 6);
  top.position.set(0.5, 5.5, 1.5);
  top.rotation.x = Math.PI / 2;
  scene.add(top);
  const front = panel(4, 3, 0xfff6ea, 2.2);
  front.position.set(-1.5, 1.8, 7);
  scene.add(front);
  const rim = panel(1.2, 5, 0xdfeaff, 3.5);
  rim.position.set(-6, 1.5, -4);
  rim.lookAt(0, 0, 0);
  scene.add(rim);
  const floor = panel(8, 8, 0x0b0b0b, 1);
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
  const cBottom = new THREE.Color(0x14120d);
  const cMid = new THREE.Color(0x0e3a3c);
  const cHorizon = new THREE.Color(0x1d5552);
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

export function bakeEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  return rt.texture;
}
