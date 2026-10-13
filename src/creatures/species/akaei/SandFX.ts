import {
  BufferAttribute, BufferGeometry, Color, CustomBlending, DstColorFactor, Mesh, Points, ShaderMaterial, UniformsLib, UniformsUtils,
  Vector2, Vector3, ZeroFactor, type Object3D, type WebGLRenderer,
} from 'three';
import { CONTACT_SHADOWS } from '../haku/ContactShadows';

/**
 * What a ray does to the sand around it:
 *  - puffs: sediment kicked up by the disc (landing, burrowing, feeding jets, a take-off from cover). Each grain cloud
 *    rises, spreads, slows in the water and settles back; drawn as soft sprites lit by the scene's own lights.
 *  - the contact shadow: soft darkening of the sand under the disc, strongest when it lies on the bottom (it grounds the
 *    animal even where the sun's shadow map is off or too coarse).
 *  - imprints: the oval of disturbed, darker sand left where it lay buried or dug for food, fading over minutes.
 * All in world space; one instance per ray.
 */

const MAX = 160;

const PUFF_VERT = /* glsl */ `
attribute vec4 aPuff;    // x size (m), y alpha, z grain, w peak alpha
attribute float aShade;  // × the cloud's colour (1: the sand's own)
uniform float uScale;
varying float vAlpha;
varying float vGrain;
varying float vShade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aPuff.x * uScale / max(0.05, -mv.z), 0.0, 256.0);
  vAlpha = aPuff.y;
  vGrain = aPuff.z;
  vShade = aShade;
}`;

const PUFF_FRAG = /* glsl */ `
#include <common>
#include <lights_pars_begin>
uniform vec3 uSand;
uniform float uTone;
varying float vAlpha;
varying float vGrain;
varying float vShade;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  float soft = (1.0 - r) * (1.0 - r);
  // a grainy cloud, not a disc: break it up a little
  float n = fract(sin(dot(floor(gl_PointCoord * 6.0) + vGrain * 13.0, vec2(12.9898, 78.233))) * 43758.5453);
  float a = vAlpha * soft * (0.75 + 0.25 * n);
  vec3 irr = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) irr += mix(hemisphereLights[i].groundColor, hemisphereLights[i].skyColor, 0.75);
  #endif
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) irr += directionalLights[i].color * 0.85;
  #endif
  // fine sediment in suspension scatters light: a cloud reads a little paler than the bed it came from
  gl_FragColor = vec4(uSand * irr * RECIPROCAL_PI * uTone * vShade, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** a patch of ground: a small grid laid on the terrain, shaded as an ellipse in its own uv */
const DECAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** multiplicative: the output colour scales the sand behind it */
const SHADOW_FRAG = /* glsl */ `
uniform float uStrength;
uniform vec2 uShape;     // x: how far the soft edge reaches (0..1), y: bias toward the front (head)
varying vec2 vUv;
void main() {
  vec2 p = vUv;
  p.y -= uShape.y * 0.2;
  float d = length(p);
  float a = uStrength * (1.0 - smoothstep(1.0 - uShape.x, 1.0, d));
  gl_FragColor = vec4(vec3(1.0 - a), 1.0);
}`;

const IMPRINT_FRAG = /* glsl */ `
uniform float uAmount;
uniform float uSeed;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float d = length(vUv) + (n(vUv * 5.0 + uSeed) - 0.5) * 0.18;
  // the wetter, darker bowl, a lighter rim of thrown-out sand just outside it
  float bowl = 1.0 - smoothstep(0.62, 0.86, d);
  float rim = smoothstep(0.78, 0.9, d) * (1.0 - smoothstep(0.92, 1.0, d)) * (0.6 + 0.4 * n(vUv * 11.0 + uSeed * 3.0));
  float k = 1.0 - uAmount * (0.24 * bowl * (0.85 + 0.15 * n(vUv * 23.0))) + uAmount * 0.1 * rim;
  gl_FragColor = vec4(vec3(k), 1.0);
}`;

function multiplyMaterial(frag: string, uniforms: Record<string, { value: unknown }>): ShaderMaterial {
  const m = new ShaderMaterial({ vertexShader: DECAL_VERT, fragmentShader: frag, uniforms, transparent: true, depthWrite: false });
  m.blending = CustomBlending;
  m.blendSrc = DstColorFactor;
  m.blendDst = ZeroFactor;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  m.toneMapped = false;
  return m;
}

const GRID = 10;

/** a GRID×GRID patch whose vertices are laid on the ground (world space) */
function patchGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const n = GRID + 1;
  const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { uv[(j * n + i) * 2] = i / GRID; uv[(j * n + i) * 2 + 1] = j / GRID; }
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function layPatch(g: BufferGeometry, x: number, z: number, heading: number, halfW: number, halfL: number, ground: (x: number, z: number) => number, lift: number): void {
  const p = g.getAttribute('position') as BufferAttribute, n = GRID + 1;
  const ch = Math.cos(heading), sh = Math.sin(heading);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i / GRID) * 2 - 1, v = (j / GRID) * 2 - 1;
    // u across (the animal's left = +), v along (forward = +)
    const lx = u * halfW, lz = v * halfL;
    const wx = x + lx * ch + lz * sh, wz = z - lx * sh + lz * ch;
    p.setXYZ(j * n + i, wx, ground(wx, wz) + lift, wz);
  }
  p.needsUpdate = true;
  g.computeBoundingSphere();
}

interface Imprint { mesh: Mesh; mat: ShaderMaterial; age: number; life: number; strength: number }

/** how the clouds meet the ground (the defaults are the ray's: coarse clouds that come to rest 4 mm over the sand) */
export interface SandFXOptions {
  /** how far over the ground a settling sprite stops (m) */
  floor?: number;
  /** test every sprite against the floor every frame (by default one in eight, and all in the second half of their life) */
  everyFrame?: boolean;
  /** a sprite that reaches the floor is gone (grains that fall back into the sand), unless emit says otherwise */
  killOnFloor?: boolean;
  /** the cloud's brightness against the light it gets (default 1.7: a little paler than the bed) */
  tone?: number;
  /** how fast the cloud's sprites sink (m/s², default 0.05: with the drag at most 0.05 / 2.2 m/s); single grains (kill)
   * sink at least that fast whatever the cloud does */
  sink?: number;
}

export class SandFX {
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly puff = new Float32Array(MAX * 4);
  /** per particle: age, life, start size, end size */
  private readonly life = new Float32Array(MAX * 4);
  private next = 0;
  private alive = 0;
  readonly points: Points;
  private readonly puffMat: ShaderMaterial;
  readonly shadow: Mesh;
  private readonly shadowMat: ShaderMaterial;
  private readonly imprints: Imprint[] = [];
  private readonly size = new Vector2();
  private shadowTimer = 0;
  /** per particle: it is gone when it reaches the floor */
  private readonly kill = new Uint8Array(MAX);
  private readonly shade = new Float32Array(MAX).fill(1);
  private readonly floor: number;
  private readonly everyFrame: boolean;
  private readonly killOnFloor: boolean;
  private readonly sink: number;

  constructor(private readonly parent: Object3D, opts: SandFXOptions = {}) {
    this.floor = opts.floor ?? 0.004;
    this.everyFrame = opts.everyFrame ?? false;
    this.killOnFloor = opts.killOnFloor ?? false;
    this.sink = opts.sink ?? 0.05;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aPuff', new BufferAttribute(this.puff, 4));
    g.setAttribute('aShade', new BufferAttribute(this.shade, 1));
    g.setDrawRange(0, 0);
    this.puffMat = new ShaderMaterial({
      vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, lights: true, transparent: true, depthWrite: false,
      uniforms: UniformsUtils.merge([UniformsLib.lights, { uScale: { value: 600 }, uSand: { value: new Color(0.26, 0.255, 0.24) }, uTone: { value: opts.tone ?? 1.7 } }]),
    });
    this.points = new Points(g, this.puffMat);
    this.points.name = 'AkaeiSandPuffs';
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.points.onBeforeRender = (renderer: WebGLRenderer, _s, camera) => {
      renderer.getDrawingBufferSize(this.size);
      const proj = (camera as unknown as { projectionMatrix: { elements: number[] } }).projectionMatrix.elements;
      this.puffMat.uniforms.uScale.value = proj[5] * this.size.y * 0.5;
    };
    parent.add(this.points);
    this.shadowMat = multiplyMaterial(SHADOW_FRAG, { uStrength: { value: 0 }, uShape: { value: new Vector2(0.6, 0.2) } });
    this.shadow = new Mesh(patchGeometry(), this.shadowMat);
    this.shadow.name = 'AkaeiContactShadow';
    this.shadow.renderOrder = 1;
    this.shadow.frustumCulled = false;
    parent.add(this.shadow);
  }

  setSandColour(c: Vector3): void {
    (this.puffMat.uniforms.uSand.value as Color).setRGB(c.x, c.y, c.z);
  }

  /**
   * a cloud of sediment: count sprites around `at`, thrown with `vel` (m/s) plus a spread. Each sprite swells as the
   * cloud spreads (1.8–3.2 × its size), or by `grow` × its start size (≈ 1.1 for single grains); `kill`: gone at the floor;
   * `shade`: × the sand's colour (a wet clump, darker than the bed)
   */
  emit(at: Vector3, vel: Vector3, count: number, spread: number, size: number, life: number, alpha = 0.5, rnd: () => number = Math.random, grow?: number, kill = this.killOnFloor, shade = 1): void {
    let shaded = false;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      this.alive = Math.min(MAX, this.alive + 1);
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread;
      this.pos[i * 3] = at.x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = at.y + rnd() * spread * 0.3;
      this.pos[i * 3 + 2] = at.z + Math.sin(a) * r;
      const j = 0.6 + 0.8 * rnd();
      this.vel[i * 3] = vel.x * j + (rnd() - 0.5) * spread * 1.5;
      this.vel[i * 3 + 1] = vel.y * j + rnd() * spread * 0.8;
      this.vel[i * 3 + 2] = vel.z * j + (rnd() - 0.5) * spread * 1.5;
      this.life[i * 4] = 0;
      this.life[i * 4 + 1] = life * (0.6 + 0.8 * rnd());
      this.life[i * 4 + 2] = size * (0.5 + 0.5 * rnd());
      this.life[i * 4 + 3] = grow === undefined ? size * (1.8 + 1.4 * rnd()) : this.life[i * 4 + 2] * grow;
      this.kill[i] = kill ? 1 : 0;
      if (this.shade[i] !== shade) { this.shade[i] = shade; shaded = true; }
      this.puff[i * 4 + 1] = 0;
      this.puff[i * 4 + 2] = rnd();
      this.puff[i * 4 + 3] = alpha;
    }
    if (shaded) this.points.geometry.getAttribute('aShade').needsUpdate = true;
  }

  /**
   * The shadow under the disc: centre, heading, half-sizes (m), and how close the belly is to the sand (0 far … 1 on it).
   * Re-laid on the ground a few times a second (every frame while it moves fast).
   */
  updateShadow(dt: number, x: number, z: number, heading: number, halfW: number, halfL: number, contact: number, ground: (x: number, z: number) => number, moving: boolean): void {
    this.shadowMat.uniforms.uStrength.value = 0.42 * contact;
    (this.shadowMat.uniforms.uShape.value as Vector2).set(0.35 + 0.5 * (1 - contact), 0.25);
    this.shadow.visible = contact > 0.02 && CONTACT_SHADOWS.enabled;   // (超軽量 turns the contact shadows off)
    this.shadowTimer -= dt;
    if (!this.shadow.visible || (this.shadowTimer > 0 && !moving)) return;
    this.shadowTimer = 0.25;
    const grow = 1.02 + 0.45 * (1 - contact);
    layPatch(this.shadow.geometry, x, z, heading, halfW * grow, halfL * grow, ground, 0.002);
  }

  /** leave an oval of disturbed sand (burrowing, a feeding pit); `lift`: how far over the ground it is laid (m) */
  imprint(x: number, z: number, heading: number, halfW: number, halfL: number, ground: (x: number, z: number) => number, strength = 1, life = 150, lift = 0.0015): void {
    if (this.imprints.length >= 3) { const old = this.imprints.shift()!; old.mesh.removeFromParent(); old.mesh.geometry.dispose(); old.mat.dispose(); }
    const mat = multiplyMaterial(IMPRINT_FRAG, { uAmount: { value: 0 }, uSeed: { value: Math.random() * 50 } });
    const mesh = new Mesh(patchGeometry(), mat);
    mesh.name = 'AkaeiImprint';
    mesh.renderOrder = 1;
    layPatch(mesh.geometry, x, z, heading, halfW, halfL, ground, lift);
    this.parent.add(mesh);
    this.imprints.push({ mesh, mat, age: 0, life, strength });
  }

  /** deepen the latest imprint (it builds up over a burrowing or a feeding bout) */
  growImprint(amount: number): void {
    const im = this.imprints[this.imprints.length - 1];
    if (im) im.strength = Math.min(1, Math.max(im.strength, amount));
  }

  update(dt: number, ground: (x: number, z: number) => number): void {
    // particles: drag in the water, a slow settling, growth as the cloud spreads, fade at the end
    let maxIdx = 0;
    const drag = Math.exp(-dt * 2.2);
    for (let i = 0; i < MAX; i++) {
      const L = this.life;
      if (L[i * 4 + 1] <= 0) { this.puff[i * 4 + 1] = 0; continue; }
      L[i * 4] += dt;
      const t = L[i * 4] / L[i * 4 + 1];
      if (t >= 1) { L[i * 4 + 1] = 0; this.puff[i * 4 + 1] = 0; continue; }
      maxIdx = i + 1;
      const v = this.vel;
      v[i * 3] *= drag; v[i * 3 + 2] *= drag;
      v[i * 3 + 1] = v[i * 3 + 1] * drag - (this.kill[i] ? Math.max(this.sink, 0.05) : this.sink) * dt;
      this.pos[i * 3] += v[i * 3] * dt;
      this.pos[i * 3 + 1] += v[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (this.everyFrame || (i & 7) === 0 || t > 0.5) {
        const g = ground(this.pos[i * 3], this.pos[i * 3 + 2]) + this.floor;
        if (this.pos[i * 3 + 1] < g) {
          if (this.kill[i]) { L[i * 4 + 1] = 0; this.puff[i * 4 + 1] = 0; continue; }
          this.pos[i * 3 + 1] = g; v[i * 3 + 1] = 0;
        }
      }
      this.puff[i * 4] = L[i * 4 + 2] + (L[i * 4 + 3] - L[i * 4 + 2]) * Math.sqrt(t);
      this.puff[i * 4 + 1] = this.puff[i * 4 + 3] * Math.min(1, t * 8) * (1 - t) * (1 - t);
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, maxIdx);
    this.points.visible = maxIdx > 0;
    if (maxIdx > 0) { geo.getAttribute('position').needsUpdate = true; geo.getAttribute('aPuff').needsUpdate = true; }
    for (let k = this.imprints.length - 1; k >= 0; k--) {
      const im = this.imprints[k];
      im.mesh.visible = CONTACT_SHADOWS.enabled;
      im.age += dt;
      const fade = 1 - Math.max(0, (im.age - im.life * 0.5) / (im.life * 0.5));
      im.mat.uniforms.uAmount.value = im.strength * Math.max(0, fade);
      if (im.age >= im.life) { im.mesh.removeFromParent(); im.mesh.geometry.dispose(); im.mat.dispose(); this.imprints.splice(k, 1); }
    }
  }

  get active(): number { return this.alive; }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.puffMat.dispose();
    this.shadow.removeFromParent();
    this.shadow.geometry.dispose();
    this.shadowMat.dispose();
    for (const im of this.imprints) { im.mesh.removeFromParent(); im.mesh.geometry.dispose(); im.mat.dispose(); }
    this.imprints.length = 0;
  }
}

