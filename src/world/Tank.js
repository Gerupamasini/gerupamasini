// Glass tank, rim frame, silicone seams, background panel, stand and the room.

import * as THREE from 'three';
import { TANK } from './TankConfig.js';
import { patchUnderwater } from './UnderwaterMaterial.js';

export function buildTank({ glassEnv = null } = {}) {
  const g = new THREE.Group();
  g.name = 'tank';
  const { L, D, H, glass } = TANK;

  // glass panes: clear float glass has no diffuse component — only the
  // Fresnel reflection (4 % at normal incidence, rising at grazing angles) is
  // added on top of what lies behind it (black albedo + additive blending, so
  // the panes never lay a lit grey film over the tank)
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.03,
    envMap: glassEnv, // the room, not the under-water probe
    envMapIntensity: glassEnv ? 1.0 : 0.35,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // (float-glass green, seen mostly from outside; faint from inside the water)
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x3f7a68, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.35 });
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
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x111213, roughness: 0.65, metalness: 0.0 });
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
  // slim LED light bar on legs (open top, like most modern goldfish tanks)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(L * 0.94, 0.014, 0.1), frameMat);
  bar.position.set(0, H + 0.1, -0.02);
  g.add(bar);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.06), frameMat);
    leg.position.set(sx * (L / 2 + 0.006), H + 0.05, -0.02);
    g.add(leg);
  }
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(3) });
  const led = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.003, 0.07), ledMat);
  led.position.set(0, H + 0.0915, -0.02);
  g.add(led);

  // background: matte neutral black film on the back glass. It is lit only by the
  // hood light that falls off with depth and seen through the water, so it
  // reads as the usual dark gradient of a photographed tank; the caustic
  // pattern is kept faint (on a vertical wall it projects into streaks)
  const bgMat = patchUnderwater(
    new THREE.MeshStandardMaterial({ color: 0x090b0a, roughness: 0.95 }),
    {
      caustics: true,
      causticMix: 0.2,
      key: 'bg',
      // faint, large-scale unevenness of the film (no visible pattern)
      extraColor: 'diffuseColor.rgb *= 0.85 + 0.3 * vnoise3(vUwWorld * vec3(6.0, 4.0, 6.0));',
    }
  );
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(L, H), bgMat);
  bg.position.set(0, H / 2, -D / 2 + 0.001);
  bg.receiveShadow = true;
  g.add(bg);
  // side panes seen from inside the water: dark glass with a grazing sheen
  // (no milky diffuse film)
  const sideMat = patchUnderwater(new THREE.MeshStandardMaterial({ color: 0x030506, roughness: 0.18, metalness: 0.0, envMapIntensity: 0.3, transparent: true, opacity: 0.85 }), { caustics: false, key: 'side' });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(D, H), sideMat);
    p.position.set(s * (L / 2 - 0.0005), H / 2, 0);
    p.rotation.y = -s * Math.PI / 2;
    g.add(p);
  }

  // meniscus: where the surface meets the glass the water climbs a few mm and
  // its curved underside mirrors the bright hood light, drawing the thin
  // silvery waterline that marks the surface in tank photographs. It is a
  // feature of the outside view through that pane only: from inside the
  // water, or through another pane (the side waterlines seen obliquely
  // through the front glass), it must not draw a bright wire across the frame.
  const meniscusMat = (color, normal, offset) => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color }, uPane: { value: new THREE.Vector4(normal.x, normal.y, normal.z, offset) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec4 uPane; // outward pane normal, plane offset of the outer face
      varying vec2 vUv;
      void main() {
        // camera outside this pane (fades in over the glass thickness)
        float outside = smoothstep(0.0, 0.02, dot(cameraPosition, uPane.xyz) - uPane.w);
        if (outside <= 0.0) discard;
        // bright crest just under the contact line, fading down the curve
        float y = vUv.y;
        float a = smoothstep(0.0, 0.75, y) * (1.0 - smoothstep(0.85, 1.0, y));
        float shimmer = 0.75 + 0.25 * sin(vUv.x * 900.0 + y * 4.0);
        gl_FragColor = vec4(uColor * a * a * shimmer * outside, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const menH = 0.0035;
  const men = new THREE.Mesh(new THREE.PlaneGeometry(L, menH), meniscusMat(new THREE.Color(0.5, 0.55, 0.55), new THREE.Vector3(0, 0, 1), D / 2 + glass));
  men.position.set(0, TANK.water - menH * 0.35, D / 2 - 0.0006);
  men.renderOrder = 4;
  men.name = 'meniscus';
  g.add(men);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(D, menH), meniscusMat(new THREE.Color(0.4, 0.44, 0.44), new THREE.Vector3(s, 0, 0), L / 2 + glass));
    m.position.set(s * (L / 2 - 0.0006), TANK.water - menH * 0.35, 0);
    m.rotation.y = -s * Math.PI / 2;
    m.renderOrder = 4;
    m.name = 'meniscus';
    g.add(m);
  }

  // stand + room
  const standMat = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.8 });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(L + 0.12, 0.8, D + 0.14), standMat);
  stand.position.set(0, -0.424, 0);
  stand.receiveShadow = true;
  g.add(stand);
  const roomMat = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.95, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), roomMat);
  room.position.set(0, 1.2, 1.2);
  g.add(room);
  // everything outside the water (frame, seams, glass edges, stand, room) is
  // lit by the room, not by the under-water light probe
  if (glassEnv) for (const m of [edgeMat, sil, frameMat, standMat, roomMat]) m.envMap = glassEnv;
  return g;
}
