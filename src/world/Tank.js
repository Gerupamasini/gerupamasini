// Glass tank, rim frame, silicone seams, background panel, stand and the room.

import * as THREE from 'three';
import { TANK } from './TankConfig.js';
import { patchUnderwater } from './UnderwaterMaterial.js';

export function buildTank() {
  const g = new THREE.Group();
  g.name = 'tank';
  const { L, D, H, glass } = TANK;

  // glass panes: nearly invisible, reflective at grazing angles, green edges
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf6f2,
    metalness: 0,
    roughness: 0.02,
    transparent: true,
    opacity: 0.06,
    envMapIntensity: 0.6,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x5fae98, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.55 });
  const pane = (w, h, t, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), glassMat);
    m.position.set(x, y, z);
    m.renderOrder = 5;
    g.add(m);
  };
  pane(L + 2 * glass, H, glass, 0, H / 2, D / 2 + glass / 2); // front
  pane(L + 2 * glass, H, glass, 0, H / 2, -D / 2 - glass / 2); // back
  pane(glass, H, D, -L / 2 - glass / 2, H / 2, 0); // left
  pane(glass, H, D, L / 2 + glass / 2, H / 2, 0); // right
  // visible green glass edges (vertical front edges)
  for (const x of [-L / 2 - glass / 2, L / 2 + glass / 2]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(glass * 1.02, H, glass * 1.02), edgeMat);
    e.position.set(x, H / 2, D / 2 + glass / 2);
    g.add(e);
  }
  // black silicone seams
  const sil = new THREE.MeshStandardMaterial({ color: 0x0b0c0c, roughness: 0.5 });
  for (const [x, z] of [[-L / 2, D / 2], [L / 2, D / 2], [-L / 2, -D / 2], [L / 2, -D / 2]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.006, H, 0.006), sil);
    s.position.set(x, H / 2, z);
    g.add(s);
  }
  // rim frame (top / bottom)
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x111213, roughness: 0.45, metalness: 0.2 });
  const rim = (y, h) => {
    const t = 0.018;
    const parts = [
      [L + 0.05, h, t, 0, y, D / 2 + glass + t / 2],
      [L + 0.05, h, t, 0, y, -D / 2 - glass - t / 2],
      [t, h, D + 0.05, -L / 2 - glass - t / 2, y, 0],
      [t, h, D + 0.05, L / 2 + glass + t / 2, y, 0],
    ];
    for (const p of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], p[2]), frameMat);
      m.position.set(p[3], p[4], p[5]);
      m.castShadow = false;
      g.add(m);
    }
  };
  rim(H + 0.012, 0.024);
  rim(-0.012, 0.024);
  // hood with the LED bar
  const hood = new THREE.Mesh(new THREE.BoxGeometry(L + 0.08, 0.05, D + 0.08), frameMat);
  hood.position.set(0, H + 0.12, 0);
  g.add(hood);
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(3) });
  const led = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.004, 0.05), ledMat);
  led.position.set(0, H + 0.093, -0.02);
  g.add(led);

  // background: dark blue-black film on the back glass (in water -> attenuated)
  const bgMat = patchUnderwater(
    new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.9 }),
    { caustics: true, key: 'bg' }
  );
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(L, H), bgMat);
  bg.position.set(0, H / 2, -D / 2 + 0.001);
  bg.receiveShadow = true;
  g.add(bg);
  // side panels inside the water (seen through the front at an angle)
  const sideMat = patchUnderwater(new THREE.MeshStandardMaterial({ color: 0x0d181b, roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.35 }), { key: 'side' });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(D, H), sideMat);
    p.position.set(s * (L / 2 - 0.0005), H / 2, 0);
    p.rotation.y = -s * Math.PI / 2;
    g.add(p);
  }

  // stand + room
  const standMat = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.6 });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(L + 0.12, 0.8, D + 0.14), standMat);
  stand.position.set(0, -0.424, 0);
  stand.receiveShadow = true;
  g.add(stand);
  const roomMat = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.95, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), roomMat);
  room.position.set(0, 1.2, 1.2);
  g.add(room);
  return g;
}
