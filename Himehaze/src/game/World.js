// Demo habitat: Tokyo Bay intertidal/shallow sand flat (干潟の砂底) with ripples, shell fragments,
// a male's nest with radial ditches, benthic prey, a predator pass, sand FX, caustics and lighting presets.
// This is sample scaffolding; a host game supplies its own implementation of the World interface.
import * as THREE from 'three';
import { SandParticles } from './SandParticles.js';
import { mulberry32 } from '../fish/Behavior.js';

export const LIGHT_PRESETS = {
  // clear, bright shallows (~0.5-1 m) at midday
  clearShallow: { fog: 0x6f9c96, density: 0.9, sun: 0xfff4e0, sunI: 3.2, elev: 68, az: 30, hemiSky: 0xbfe3e0, hemiGround: 0x8a7b5c, hemiI: 0.9, caustics: 0.55, exposure: 1.0 },
  // turbid tidal flat: strong scattering, flat light, greenish-brown water (typical inner Tokyo Bay)
  turbidFlat: { fog: 0x7b7c5c, density: 3.2, sun: 0xf0ecd0, sunI: 1.2, elev: 60, az: 40, hemiSky: 0xb9b99a, hemiGround: 0x6c6246, hemiI: 1.3, caustics: 0.06, exposure: 1.05 },
  // low-angle morning/evening sun, long shadows
  lowSun: { fog: 0x55786f, density: 1.2, sun: 0xffc98a, sunI: 3.0, elev: 14, az: 110, hemiSky: 0x8fb1aa, hemiGround: 0x6a5a40, hemiI: 0.55, caustics: 0.3, exposure: 1.0 },
  // overcast / shaded: the fish sits in shadow
  shade: { fog: 0x5f7c78, density: 1.4, sun: 0xdfe8ff, sunI: 0.35, elev: 70, az: 0, hemiSky: 0xa9c4c2, hemiGround: 0x62583f, hemiI: 1.1, caustics: 0.0, exposure: 1.1 },
};

const CAUSTIC_GLSL = `
uniform float uTime; uniform float uCaustic; varying vec3 vWPos;
float caustic(vec2 p, float t){
  // iterative distortion caustic (cheap, tileable-looking at 10-30 cm scale)
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.5);
}`;

export function patchCaustics(material, uniforms) {
  if (material.userData.caustics) return;
  material.userData.caustics = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    shader.uniforms.uTime = uniforms.uTime; shader.uniforms.uCaustic = uniforms.uCaustic;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CAUSTIC_GLSL)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        float cs = caustic(vWPos.xz * 55.0, uTime * 0.9) * 0.6 + caustic(vWPos.xz * 38.0 + 3.0, uTime * 0.7) * 0.4;
        float facing = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
        #if NUM_DIR_LIGHTS > 0
          float sh = 1.0;
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            sh = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
          #endif
          reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * cs * uCaustic * sh * facing;
        #endif
      }`);
  };
  material.customProgramCacheKey = () => 'caustics' + (material.userData.sss ? 'sss' : '');
}

export class HimehazeWorld {
  constructor(scene, renderer, opts = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.rng = mulberry32(opts.seed ?? 42);
    this.size = 2.4;
    this.timeOfDay = 11;
    this.tide = 0.5;       // 0 = low, 1 = high (modulates water depth / light; G)
    this.current = new THREE.Vector3(0.004, 0, 0.002);
    this.predators = [];
    this.food = [];
    this.shelters = [];
    this.fishes = [];
    this.player = null;
    this.uniforms = { uTime: { value: 0 }, uCaustic: { value: 0.5 } };
    this.nests = [];

    this._buildLights();
    this.nestSite = { position: new THREE.Vector3(0.05, 0, -0.02), ditches: [0.3, 1.5, 2.6, 3.7, 4.8, 5.8] };
    this._buildTerrain();
    this._buildShells();
    this.fx = new SandParticles(mulberry32(7));
    scene.add(this.fx);
    this._spawnPrey(70);
    this._buildPredator();
    this.setPreset('clearShallow');
  }

  // ------------------------------------------------------------------ terrain
  heightAt(x, z) {
    // wave ripples (λ ≈ 6-8 cm, amplitude ≈ 3-5 mm: typical small symmetrical ripples on a tidal flat; P)
    const a = 0.45, ux = x * Math.cos(a) + z * Math.sin(a);
    const warp = Math.sin(z * 9.0 + x * 3.1) * 0.012 + Math.sin(x * 17 - z * 5) * 0.004;
    let h = 0.0035 * Math.sin((ux + warp) * (Math.PI * 2 / 0.072));
    h += 0.0015 * Math.sin((ux * 0.8 + z * 0.4) * (Math.PI * 2 / 0.031));
    h += 0.03 * Math.sin(x * 1.3 + 0.4) * Math.cos(z * 1.1) + 0.012 * Math.sin(x * 3.7 + z * 2.3);
    // nest crater + radial ditches (F: radially ditched nests, crater-like structure)
    const n = this.nestSite?.position;
    if (n) {
      const dx = x - n.x, dz = z - n.z, r = Math.hypot(dx, dz);
      const flat = Math.exp(-((r / 0.05) ** 2));
      h = h * (1 - flat) + (h * 0.2 - 0.004) * flat;                    // ripples erased around nest
      const rim = Math.exp(-(((r - 0.045) / 0.012) ** 2)) * 0.004;
      const ang = Math.atan2(-dz, dx);
      let ditch = 0;
      for (const d of this.nestSite.ditches) {
        const da = Math.atan2(Math.sin(ang - d), Math.cos(ang - d));
        ditch = Math.max(ditch, Math.exp(-(((da * r) / 0.006) ** 2)) * (r > 0.02 && r < 0.12 ? Math.sin(((r - 0.02) / 0.1) * Math.PI) : 0));
      }
      h += rim - ditch * 0.004 - Math.exp(-((r / 0.018) ** 2)) * 0.006;
    }
    return h;
  }

  _buildTerrain() {
    const S = this.size, N = 240;
    const g = new THREE.PlaneGeometry(S, S, N, N);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.heightAt(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    // sand albedo: fine quartz/shell-grit speckle with darker organic/silt patches (Tokyo Bay flats; P)
    const T = 512, c = document.createElement('canvas'); c.width = c.height = T;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(T, T); const r = this.rng;
    for (let i = 0; i < T * T; i++) {
      const base = 0.62 + (r() - 0.5) * 0.18;
      const dark = r() < 0.06 ? 0.55 : 1, bright = r() < 0.03 ? 1.25 : 1;
      img.data[i * 4] = Math.min(255, 255 * base * 1.04 * dark * bright);
      img.data[i * 4 + 1] = Math.min(255, 255 * base * 0.97 * dark * bright);
      img.data[i * 4 + 2] = Math.min(255, 255 * base * 0.80 * dark * bright);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(S / 0.05, S / 0.05);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, color: 0xd9ccb0 });
    patchCaustics(mat, this.uniforms);
    this.ground = new THREE.Mesh(g, mat);
    this.ground.receiveShadow = true;
    this.ground.name = 'SandFlat';
    this.scene.add(this.ground);
    // collision tiles: same height function, 1 cm grid, split so each raycast tests only ~450 triangles
    this.tiles = []; this.tileN = 16;
    const ts = S / this.tileN, seg = 15;
    for (let i = 0; i < this.tileN; i++) for (let j = 0; j < this.tileN; j++) {
      const tg = new THREE.PlaneGeometry(ts, ts, seg, seg); tg.rotateX(-Math.PI / 2);
      const cx = -S / 2 + ts * (i + 0.5), cz = -S / 2 + ts * (j + 0.5);
      tg.translate(cx, 0, cz);
      const tp = tg.attributes.position;
      for (let k = 0; k < tp.count; k++) tp.setY(k, this.heightAt(tp.getX(k), tp.getZ(k)));
      tg.computeVertexNormals(); tg.computeBoundingBox(); tg.computeBoundingSphere();
      const tm = new THREE.Mesh(tg); tm.updateMatrixWorld(true);
      this.tiles.push(tm);
    }
  }
  _tileAt(x, z) {
    const S = this.size, n = this.tileN;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x + S / 2) / (S / n))));
    const j = Math.max(0, Math.min(n - 1, Math.floor((z + S / 2) / (S / n))));
    return this.tiles[i * n + j];
  }

  _buildShells() {
    // bivalve shell fragments (e.g. アサリ/シオフキ valves are common on Tokyo Bay flats; used as cover — G)
    const r = this.rng;
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xcfc4b2, roughness: 0.6, side: THREE.DoubleSide });
    const mk = (x, z, s, rot, flip) => {
      const g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4);
      g.scale(s, s * 0.35, s * 0.8);
      const m = new THREE.Mesh(g, shellMat);
      m.position.set(x, this.heightAt(x, z) + (flip ? 0.001 : -0.002), z);
      m.rotation.set(flip ? Math.PI : 0, rot, (r() - 0.5) * 0.3);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      this.shelters.push({ position: m.position.clone(), radius: s });
    };
    for (let i = 0; i < 14; i++) mk((r() - 0.5) * 1.6, (r() - 0.5) * 1.6, 0.012 + r() * 0.015, r() * 6, r() < 0.4);
    // nest cover shell (G: the exact nest substrate is not confirmed in sources we could access)
    const n = this.nestSite.position;
    mk(n.x - 0.004, n.z, 0.02, 0.3, false);
    this.nests.push(this.nestSite);
  }

  // ------------------------------------------------------------------ prey (F: copepods, gammarid amphipods, polychaetes, crabs; mysids by habitat)
  _spawnPrey(n) {
    this.preyGeo = {
      copepod: new THREE.SphereGeometry(0.0006, 6, 4).scale(1.6, 1, 1),
      amphipod: new THREE.CapsuleGeometry(0.0007, 0.003, 3, 6).rotateZ(Math.PI / 2),
      polychaete: new THREE.CapsuleGeometry(0.0008, 0.005, 3, 6),
      mysid: new THREE.CapsuleGeometry(0.0008, 0.005, 3, 6).rotateZ(Math.PI / 2),
    };
    this.preyMat = {
      copepod: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.7, roughness: 0.4 }),
      amphipod: new THREE.MeshStandardMaterial({ color: 0xb7a58a, roughness: 0.5 }),
      polychaete: new THREE.MeshStandardMaterial({ color: 0xb46a5c, roughness: 0.4 }),
      mysid: new THREE.MeshStandardMaterial({ color: 0xded6c8, transparent: true, opacity: 0.6, roughness: 0.3 }),
    };
    for (let i = 0; i < n; i++) this._addPrey();
  }
  _addPrey(type) {
    const r = this.rng;
    const t = type || ['copepod', 'copepod', 'amphipod', 'amphipod', 'polychaete', 'mysid'][Math.floor(r() * 6)];
    const size = { copepod: 0.001, amphipod: 0.004, polychaete: 0.005, mysid: 0.006 }[t];
    const m = new THREE.Mesh(this.preyGeo[t], this.preyMat[t]);
    const x = (r() - 0.5) * 1.4, z = (r() - 0.5) * 1.4;
    const f = { type: t, size, mesh: m, position: m.position, eaten: false, moving: t !== 'polychaete', phase: r() * 10, home: new THREE.Vector3(x, 0, z), visible: 1 };
    m.position.set(x, this.heightAt(x, z) + (t === 'copepod' || t === 'mysid' ? 0.01 + r() * 0.02 : 0.0008), z);
    this.scene.add(m);
    this.food.push(f);
    return f;
  }
  eat(f) {
    f.eaten = true; this.scene.remove(f.mesh);
    this.food.splice(this.food.indexOf(f), 1);
    setTimeout(() => this._addPrey(), 4000);
  }
  _updatePrey(dt, t) {
    for (const f of this.food) {
      const p = f.position;
      if (f.type === 'copepod') {
        // hop-and-sink swimming (jerky)
        const hop = Math.sin(t * 7 + f.phase) > 0.95 ? 1 : 0;
        p.x += (Math.sin(t * 0.7 + f.phase) * 0.004 + hop * 0.01 * Math.cos(f.phase * 3 + t)) * dt;
        p.z += (Math.cos(t * 0.5 + f.phase) * 0.004 + hop * 0.01 * Math.sin(f.phase * 5 + t)) * dt;
        p.y += (hop * 0.02 - 0.003) * dt;
        const gy = this.heightAt(p.x, p.z);
        p.y = Math.min(Math.max(p.y, gy + 0.004), gy + 0.035);
      } else if (f.type === 'amphipod') {
        const hop = (Math.sin(t * 1.3 + f.phase) > 0.97);
        if (hop) { p.x += Math.cos(f.phase + t) * 0.05 * dt; p.z += Math.sin(f.phase * 2 + t) * 0.05 * dt; }
        p.y = this.heightAt(p.x, p.z) + 0.0008;
      } else if (f.type === 'polychaete') {
        // worm head periodically extends from and retracts into its burrow
        const out = Math.max(0, Math.sin(t * 0.4 + f.phase));
        f.visible = out > 0.3 ? 1 : 0.2;
        p.y = this.heightAt(p.x, p.z) - 0.003 + out * 0.004;
      } else if (f.type === 'mysid') {
        p.x += Math.sin(t * 0.9 + f.phase) * 0.01 * dt; p.z += Math.cos(t * 0.6 + f.phase) * 0.01 * dt;
        const gy = this.heightAt(p.x, p.z); p.y = gy + 0.012 + Math.sin(t + f.phase) * 0.004;
        f.mesh.rotation.y = t * 0.3 + f.phase;
      }
      this.clampToArena(p);
    }
  }

  // ------------------------------------------------------------------ predator (placeholder silhouette of a
  // piscivore, e.g. スズキ Lateolabrax japonicus – a real Tokyo Bay goby predator (R))
  _buildPredator() {
    const g = new THREE.CapsuleGeometry(0.03, 0.22, 6, 12).rotateZ(Math.PI / 2);
    g.scale(1, 0.9, 0.55);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x5c6566, roughness: 0.5, metalness: 0.1 }));
    m.castShadow = true; m.visible = false;
    this.scene.add(m);
    this.predator = { mesh: m, position: m.position, radius: 0.55, danger: 0, t: -1 };
    this.predators.push(this.predator);
  }
  predatorPass(target) {
    const pr = this.predator; pr.t = 0; pr.mesh.visible = true;
    const a = this.rng() * Math.PI * 2;
    pr.from = new THREE.Vector3(target.x + Math.cos(a) * 1.2, 0.12, target.z + Math.sin(a) * 1.2);
    pr.to = new THREE.Vector3(target.x - Math.cos(a) * 1.2, 0.06, target.z - Math.sin(a) * 1.2);
  }
  _updatePredator(dt) {
    const pr = this.predator;
    if (pr.t < 0) { pr.danger = 0; return; }
    pr.t += dt / 3.5;
    if (pr.t > 1) { pr.t = -1; pr.mesh.visible = false; pr.danger = 0; pr.position.set(99, 99, 99); return; }
    pr.position.lerpVectors(pr.from, pr.to, pr.t);
    pr.mesh.lookAt(pr.to); pr.mesh.rotateY(Math.PI / 2);
    pr.danger = 1;
  }

  // ------------------------------------------------------------------ lighting
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera; c.left = c.bottom = -0.6; c.right = c.top = 0.6; c.near = 0.1; c.far = 6;
    this.sun.shadow.bias = -0.0002; this.sun.shadow.normalBias = 0.002; this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }
  setPreset(name) {
    const P = LIGHT_PRESETS[name]; this.preset = name;
    this.scene.fog = new THREE.FogExp2(P.fog, P.density);
    this.scene.background = new THREE.Color(P.fog);
    this.sun.color.set(P.sun); this.sun.intensity = P.sunI;
    const el = THREE.MathUtils.degToRad(P.elev), az = THREE.MathUtils.degToRad(P.az);
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    this.hemi.color.set(P.hemiSky); this.hemi.groundColor.set(P.hemiGround); this.hemi.intensity = P.hemiI;
    this.uniforms.uCaustic.value = P.caustics;
    this.renderer.toneMappingExposure = P.exposure;
  }
  focus(p) {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 2);
  }

  // ------------------------------------------------------------------ World interface for HimehazeBehavior
  raycastGround(ray, p) {
    ray.set(_o.set(p.x, p.y + 0.5, p.z), _d);
    const hit = ray.intersectObject(this._tileAt(p.x, p.z), false)[0];
    if (!hit) return null;
    return { point: hit.point, normal: hit.face.normal.clone() };
  }
  sand(pos, intensity, heading) {
    const p = pos.clone(); p.y = this.heightAt(p.x, p.z);
    this.fx.emit(p, intensity, heading);
  }
  clampToArena(p) {
    const L = this.size * 0.4;
    p.x = Math.max(-L, Math.min(L, p.x)); p.z = Math.max(-L, Math.min(L, p.z));
  }

  update(dt, t) {
    this.uniforms.uTime.value = t;
    this._updatePrey(dt, t);
    this._updatePredator(dt);
    this.fx.update(dt, (x, z) => this.heightAt(x, z), this.current);
  }
}
const _o = new THREE.Vector3(), _d = new THREE.Vector3(0, -1, 0);
