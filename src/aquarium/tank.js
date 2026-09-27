// The glass tank, its cabinet, the LED fixture and the room around it.
import * as THREE from 'three';
import { TANK } from './config.js';

// Environment for reflections: a dim room with the fixture's bright panel overhead and a
// soft warm window to one side.
export function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), new THREE.MeshBasicMaterial({ color: 0x0c0e12, side: THREE.BackSide }));
  room.position.y = 1.5;
  env.add(room);
  const panel = (w, h, color, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); env.add(m);
  };
  panel(1.2, 0.14, new THREE.Color(9, 9.5, 10), [0, 0.85, 0], [Math.PI / 2, 0, 0]);      // LED bar
  panel(1.6, 1.1, new THREE.Color(0.9, 0.7, 0.5), [-3.9, 1.6, 0.5], [0, Math.PI / 2, 0]); // warm window
  panel(2.5, 0.05, new THREE.Color(1.5, 1.3, 1.1), [0, 3.9, 2], [Math.PI / 2, 0, 0]);    // ceiling strip
  panel(1.4, 0.9, new THREE.Color(0.08, 0.1, 0.14), [2, 1.2, 3.9], [0, Math.PI, 0]);      // dim screen behind camera
  const pm = new THREE.PMREMGenerator(renderer);
  const pmrem = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  // plain cube map with mips for the custom glass / water / bubble shaders
  const crt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cc = new THREE.CubeCamera(0.05, 20, crt);
  cc.position.set(0, 0.3, 0);
  cc.update(renderer, env);
  return { pmrem, cube: crt.texture };
}

// What a submerged object "sees": Snell's window overhead, blue water around, sand below.
export function buildUnderwaterEnvironment(renderer) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD;
      void main(){
        float y = vD.y;
        vec3 water = mix(vec3(0.02, 0.09, 0.14), vec3(0.06, 0.24, 0.34), smoothstep(-0.2, 0.6, y));
        float win = smoothstep(0.62, 0.72, y);                         // Snell's window, 48.6 deg half-angle
        vec3 c = mix(water, vec3(1.6, 1.8, 1.9), win);
        c += vec3(5.0) * smoothstep(0.97, 0.995, y);                    // the fixture seen through the surface
        vec3 sand = vec3(0.42, 0.4, 0.34);
        c = mix(c, sand, smoothstep(-0.05, -0.35, y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  env.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.0).texture;
  pm.dispose();
  return tex;
}

// Custom glass: Fresnel reflections at full strength over a faint green body tint; the
// polished edges of each pane glow green (you look along the glass), and a bright
// meniscus line marks where the water meets the glass.
function glassMaterial(env, thinAxis) {
  return new THREE.ShaderMaterial({
    uniforms: { uEnv: { value: env } },
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vN; varying vec3 vON;
      void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); vON = normal;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform samplerCube uEnv;
      varying vec3 vW; varying vec3 vN; varying vec3 vON;
      void main(){
        vec3 V = normalize(vW - cameraPosition);
        vec3 N = normalize(vN);
        if (dot(N, V) > 0.0) N = -N;
        float cosi = clamp(dot(-V, N), 0.0, 1.0);
        float F = 0.04 + 0.96 * pow(1.0 - cosi, 5.0);
        vec3 refl = textureLod(uEnv, reflect(V, N), 0.0).rgb;
        bool edge = abs(vON.${thinAxis}) < 0.5;
        vec3 col; float a;
        if (edge) {
          col = vec3(0.04, 0.08, 0.065) + refl * 0.25; a = 0.6;
        } else {
          // path through the glass grows at grazing angles -> greener, more absorbing
          float path = 1.0 / max(cosi, 0.15);
          vec3 absorb = 1.0 - exp(-vec3(0.05, 0.02, 0.035) * path);
          a = clamp(F + (absorb.r + absorb.g + absorb.b) / 3.0, 0.0, 1.0);
          col = refl * F + vec3(0.0, 0.004, 0.002) * path;
          // meniscus: a thin bright line where the water surface touches the glass
          float men = exp(-pow((vW.y - ${TANK.level.toFixed(4)}) / 0.0012, 2.0));
          col += vec3(0.55, 0.62, 0.62) * men * 0.6; a = max(a, men * 0.5);
        }
        gl_FragColor = vec4(col, a);
      }`,
  });
}

export function createTank(env) {
  const group = new THREE.Group();
  const g = TANK.glass, W = TANK.w, D = TANK.d, H = TANK.h;
  const panes = [
    // [size x,y,z], [pos], thin axis
    [[W + 2 * g, g, D + 2 * g], [0, -g / 2, 0], 'y'],
    [[W + 2 * g, H, g], [0, H / 2, D / 2 + g / 2], 'z'],
    [[W + 2 * g, H, g], [0, H / 2, -D / 2 - g / 2], 'z'],
    [[g, H, D], [-W / 2 - g / 2, H / 2, 0], 'x'],
    [[g, H, D], [W / 2 + g / 2, H / 2, 0], 'x'],
  ];
  const transparent = [];
  for (const [size, pos, axis] of panes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), glassMaterial(env, axis));
    m.position.set(...pos);
    m.renderOrder = 10;
    group.add(m); transparent.push(m);
  }
  // black silicone seams on the inside corners
  const sil = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.35, clearcoat: 0.5 });
  const seam = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), sil); m.position.set(x, y, z); group.add(m); };
  const s = 0.006;
  for (const x of [-1, 1]) for (const z of [-1, 1]) seam(s, H, s, x * (W / 2 - s / 2), H / 2, z * (D / 2 - s / 2));
  for (const z of [-1, 1]) seam(W, s, s, 0, s / 2, z * (D / 2 - s / 2));
  for (const x of [-1, 1]) seam(s, s, D, x * (W / 2 - s / 2), s / 2, 0);
  // the dark background film on the back glass keeps the reef readable
  const film = new THREE.Mesh(new THREE.PlaneGeometry(W + 2 * g, H), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ vec3 top = vec3(0.02, 0.1, 0.2), bot = vec3(0.004, 0.02, 0.045); float g = smoothstep(0.0, 1.0, vUv.y); vec3 c = mix(bot, top, g * g); c *= 1.0 - 0.35 * pow(abs(vUv.x - 0.5) * 2.0, 2.0); gl_FragColor = vec4(c, 1.0); }',
  }));
  film.position.set(0, H / 2, -D / 2 - g - 0.001); film.rotation.y = Math.PI;
  film.rotation.y = 0; film.position.z = -D / 2 - g - 0.0015;
  group.add(film);
  return { group, transparent };
}

export function createRoom() {
  const group = new THREE.Group();
  // cabinet: dark walnut with two doors
  const wood = new THREE.MeshPhysicalMaterial({ color: 0x2a1a12, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  wood.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nfloat hh(float n){ return fract(sin(n) * 43758.5453); }')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float gx = vWP.x * 6.0 + sin(vWP.y * 3.0 + sin(vWP.x * 1.3) * 2.0) * 0.8;
          float grain = 0.5 + 0.5 * sin(gx * 18.0 + sin(gx * 3.1) * 2.5);
          float fine = hh(floor(vWP.x * 900.0) + floor(vWP.y * 30.0) * 17.0);
          diffuseColor.rgb *= 0.78 + 0.3 * grain + 0.06 * fine; }`);
  };
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.86, 0.64), wood);
  cab.position.set(0, -0.43 - 0.013, 0);
  group.add(cab);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.012, 0.66), new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.3, clearcoat: 0.6 }));
  top.position.set(0, -0.007 - g0(), 0);
  group.add(top);
  const groove = new THREE.MeshStandardMaterial({ color: 0x080504, roughness: 0.9 });
  for (const x of [0]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.8, 0.002), groove); m.position.set(x, -0.45, 0.321); group.add(m); }
  const hm = new THREE.MeshPhysicalMaterial({ color: 0x8a8580, metalness: 1, roughness: 0.3 });
  for (const x of [-0.03, 0.03]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 12), hm); m.position.set(x, -0.3, 0.33); group.add(m); }
  // floor and walls
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshPhysicalMaterial({ color: 0x1b1714, roughness: 0.45, clearcoat: 0.2 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.87;
  floor.receiveShadow = true;
  group.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), new THREE.MeshStandardMaterial({ color: 0x1c2229, roughness: 0.95 }));
  wall.position.set(0, 1.6, -0.9); wall.receiveShadow = true;
  group.add(wall);
  // LED fixture on slim hangers
  const fix = new THREE.Group();
  const alu = new THREE.MeshPhysicalMaterial({ color: 0x1a1b1e, metalness: 0.8, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.022, 0.13), alu);
  fix.add(body);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6.4, 7) }));
  led.rotation.x = Math.PI / 2; led.position.y = -0.0115;
  fix.add(led);
  for (const x of [-0.45, 0.45]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.3 }));
    w.position.set(x, 0.8, 0); fix.add(w);
  }
  fix.position.set(0, TANK.h + 0.28, 0);
  group.add(fix);
  return group;
}
const g0 = () => TANK.glass;
