import {
  BoxGeometry, BufferGeometry, Camera, CanvasTexture, ClampToEdgeWrapping, Color, CustomBlending, DataTexture, DirectionalLight, DoubleSide, EdgesGeometry,
  Float32BufferAttribute, FloatType, HalfFloatType, HemisphereLight, LineBasicMaterial, LinearFilter, LinearMipmapLinearFilter,
  LineSegments, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, OneFactor, PerspectiveCamera, PlaneGeometry, Plane,
  PMREMGenerator, Points, PointsMaterial, Raycaster, RGBAFormat, Scene, ShaderMaterial, SpotLight, SrcColorFactor, UnsignedByteType,
  Vector2, Vector3, WebGLRenderTarget, ZeroFactor, type IUniform, type Material, type WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js';
import type { IndividualRecord } from '../creatures/Individual';
import type { SpeciesDef } from '../data/schemas';
import type { Driver, Floor } from '../creatures/drivers/Driver';
import { DRIVERS } from '../creatures/drivers/index';
import { instantiateModel } from '../creatures/models/ModelLoader';
import { generateIndividual, type Individual } from '../creatures/Individual';
import { hashInts } from '../core/Rng';
import type { BehaviorEvent } from '../creatures/drivers/Driver';
import type { LoadedModel } from '../creatures/models/ModelLoader';
import type { HeroInstance } from '../creatures/species/mahaze/hero/applyHero';
import type { HeroLighting } from '../render/HeroPipeline';

export const TANK_W = 0.6, TANK_D = 0.3, TANK_H = 0.36, WATER_H = 0.3;
export const TANK_MAX_OCCUPANTS = 4;

export interface Occupant {
  record: IndividualRecord;
  ind: Individual;
  driver: Driver;
  root: Object3D;
  unsub: () => void;
  hero: HeroInstance | null;
}

// ------------------------------------------------------------------ the water, after CAUSTIC//LITE (scottiefox/caustic-volume, MIT)
// A random sea of small waves plus a GPU ripple simulation move the surface; once a frame the surface (height and slope)
// is drawn into one texture, and a caustics texture is redrawn by sending the light from a grid on the surface through the
// water to the floor. The sand and the animals are lit by that texture; the water itself tints what is behind it by
// Beer–Lambert absorption and scatters a little of the caustic light sheets toward the eye (light shafts).
const TX = TANK_W / 2, TZ = TANK_D / 2, W_LEVEL = WATER_H, W_IOR = 1.333;
/** absorption per metre: red goes first, so a long path looks blue-green; the tank is small, so the tint stays faint */
const W_ABSORB = [0.6, 0.1, 0.055];
const SIM: [number, number] = [192, 96]; // ripple grid: 3 mm cells
const CAUS: [number, number] = [512, 256]; // caustics texture: 1.2 mm texels
const W_LAMP_Y = TANK_H + 0.063, W_LAMP_HALF = TANK_W / 2 - 0.02;
const NW = 20;
const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

interface Wave { k: number; kx: number; kz: number; w: number; ph: number; a: number; short: boolean; f1: number; f2: number; p1: number; p2: number }
/** 20 waves from 25 cm down to 2.5 cm long, heading every which way, so the surface is short-crested and the caustics a net */
function makeWaves(): Wave[] {
  let s = 5;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: Wave[] = [];
  for (let i = 0; i < NW; i++) {
    const len = 0.25 * (0.025 / 0.25) ** (i / (NW - 1)), k = (2 * Math.PI) / len, dir = i * 2.39996 + (rnd() - 0.5) * 0.9;
    out.push({
      k, kx: k * Math.cos(dir), kz: k * Math.sin(dir), w: Math.sqrt(9.81 * k + 7.3e-5 * k ** 3) * 0.7, ph: rnd() * 6.283,
      a: Math.min(2.4 / (k * k), 0.0009) * (0.6 + 0.8 * rnd()), short: len < 0.08,
      f1: 0.05 + 0.22 * rnd(), f2: 0.09 + 0.3 * rnd(), p1: rnd() * 6.283, p2: rnd() * 6.283,
    });
  }
  return out;
}

const COMMON = /* glsl */ `
uniform sampler2D uSurf, uCaus;
uniform vec3 uLampCol;      // the light bar's light
uniform float uCausScale;   // caustics texture -> fraction of the bar's light
const float W_LEVEL = ${f(W_LEVEL)}, W_IOR = ${f(W_IOR)}, W_LAMP_Y = ${f(W_LAMP_Y)}, W_LAMP_HALF = ${f(W_LAMP_HALF)};
const vec2 W_HALF = vec2(${f(TX)}, ${f(TZ)});
const vec3 W_ABSORB = vec3(${W_ABSORB.map(f).join(', ')});
// water height above W_LEVEL and its slope at p
vec3 wave(vec2 p) { return textureLod(uSurf, p / (2.0 * W_HALF) + 0.5, 0.0).xyz; }
vec3 normalOf(vec3 w) { return normalize(vec3(-w.y, 1.0, -w.z)); }
float fresnel(float c) { return 0.02 + 0.98 * pow(1.0 - clamp(c, 0.0, 1.0), 5.0); }
// the LED bar above the tank: the direction to its nearest point, and how much of its light arrives (1 right under it)
float lampAt(vec3 p, out vec3 L) {
  vec3 d = vec3(clamp(p.x, -W_LAMP_HALF, W_LAMP_HALF), W_LAMP_Y, 0.0) - p;
  float r2 = dot(d, d);
  L = d * inversesqrt(r2);
  return 2.0 / (1.0 + 66.0 * r2) * smoothstep(0.2, 0.6, L.y);
}
// light reaching the floor at xz, as a fraction of the bar's light (four taps: a little smoother)
vec3 causAt(vec2 xz) {
  vec2 uv = xz / (2.0 * W_HALF) + 0.5, o = 0.6 / vec2(${f(CAUS[0])}, ${f(CAUS[1])});
  return uCausScale * 0.25 * (texture2D(uCaus, uv + o).rgb + texture2D(uCaus, uv - o).rgb + texture2D(uCaus, uv + vec2(o.x, -o.y)).rgb + texture2D(uCaus, uv - vec2(o.x, -o.y)).rgb);
}
// what a reflected ray sees of the dark room: the bar's bright strip, a soft glow round it, not much else
vec3 room(vec3 p, vec3 d) {
  vec3 c = vec3(0.012, 0.014, 0.017);
  if (d.y > 0.001) {
    float t = (W_LAMP_Y - p.y) / d.y;
    vec3 q = p + d * t;
    float sx = smoothstep(0.03, 0.0, abs(q.x) - W_LAMP_HALF), sz = smoothstep(0.03, 0.0, abs(q.z) - 0.015);
    c += uLampCol * (0.8 * sx * sz + 0.03 * smoothstep(0.35, 0.0, length(vec2(max(abs(q.x) - W_LAMP_HALF, 0.0), q.z))));
  }
  return c;
}
// where a ray from p inside the water leaves the water box (a wall, the floor or the surface plane)
float boxExit(vec3 p, vec3 d) {
  vec3 inv = 1.0 / (d + vec3(1e-6));
  vec3 lo = (vec3(-W_HALF.x, 0.0, -W_HALF.y) - p) * inv, hi = (vec3(W_HALF.x, W_LEVEL, W_HALF.y) - p) * inv;
  vec3 b = max(lo, hi);
  return max(min(min(b.x, b.y), b.z), 0.0);
}
`;
const OUT = '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const SURF_VERT = COMMON + /* glsl */ `
varying vec3 vPos;
void main() {
  vec3 w = wave(position.xz);
  vPos = vec3(position.x, W_LEVEL + w.x, position.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
// the surface seen from above: the view refracts into the water and is absorbed on its way to the floor
const SURF_HEAD = /* glsl */ `
varying vec3 vPos;
uniform vec3 uGlow;
void main() {
  vec3 n = normalOf(wave(vPos.xz)), d = normalize(vPos - cameraPosition);
  if (dot(d, n) > -0.02) n = normalize(n - d * (dot(d, n) + 0.02));
  float F = fresnel(-dot(d, n));
  vec3 r = refract(d, n, 1.0 / W_IOR);
  float t = boxExit(vec3(vPos.x, min(vPos.y, W_LEVEL - 0.001), vPos.z), r);
  vec3 T = exp(-W_ABSORB * t);
`;
const SIDE_VERT = COMMON + /* glsl */ `
varying vec3 vPos; varying vec3 vNrm;
void main() { vPos = (modelMatrix * vec4(position, 1.0)).xyz; vNrm = normal; gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0); }`;
// the water behind the glass walls, up to the moving water line
const SIDE_HEAD = /* glsl */ `
varying vec3 vPos; varying vec3 vNrm;
uniform vec3 uGlow, uScatter;
uniform float uShaft;
void main() {
  if (abs(vNrm.y) > 0.5) discard;
  float h = W_LEVEL + wave(clamp(vPos.xz, -W_HALF, W_HALF)).x;
  if (vPos.y > h) discard;
  vec3 d = normalize(vPos - cameraPosition), n = normalize(vNrm);
  vec3 r = refract(d, n, 1.0 / W_IOR);
  float t = boxExit(vPos - n * 0.001, r);
`;

/** Lets a standard material receive the caustic light on top of the scene's lights. */
function lightByCaustics(m: MeshStandardMaterial, U: Record<string, IUniform>, key: string, grain: boolean): void {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSurf: U.uSurf, uCaus: U.uCaus, uLampCol: U.uLampCol, uCausScale: U.uCausScale });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosT;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPosT = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPosT;\n${COMMON}
float hashT(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoiseT(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashT(i), hashT(i + vec2(1, 0)), f.x), mix(hashT(i + vec2(0, 1)), hashT(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', grain ? `#include <color_fragment>
{
  float grainT = hashT(floor(vWorldPosT.xz * 900.0)) - 0.5;
  float patchT = vnoiseT(vWorldPosT.xz * 14.0) - 0.5;
  diffuseColor.rgb *= 1.0 + grainT * 0.14 + patchT * 0.12;
}` : '#include <color_fragment>')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  // the light bar through the moving surface: the caustics texture, strongest on faces that look up
  float up = clamp(dot(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), 0.0, 1.0);
  vec3 irr = uLampCol * causAt(vWorldPosT.xz) * (0.3 + 0.7 * up);
  reflectedLight.directDiffuse += irr * BRDF_Lambert(diffuseColor.rgb);
}`);
  };
  m.customProgramCacheKey = () => key;
}

function bubbleTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 6, 16, 16, 15);
  grd.addColorStop(0, 'rgba(255,255,255,0.08)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.arc(12, 11, 2.2, 0, 7); g.fill();
  return new CanvasTexture(c);
}

/**
 * The home showcase tank: a 60 cm aquarium in a dark, quiet room under a cool LED bar. Water is kept almost clear so
 * the animals read well; real caustics from the moving surface play on the sand and the animals; bubbles from an air
 * stone keep the surface alive; the camera drifts slowly. Several occupants can live in it.
 */
export class TankScene {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private controls: OrbitControls | null = null;
  readonly occupants: Occupant[] = [];
  private readonly floor: Floor = { heightAt: () => 0, waterAt: () => WATER_H };
  private readonly hitBox: Mesh;
  private readonly raycaster = new Raycaster();
  private readonly waterPlane = new Plane(new Vector3(0, 1, 0), -W_LEVEL);
  private drift = 0;
  private time = 0;
  // the water
  private readonly U: Record<string, IUniform>;
  private readonly gpu: GPUComputationRenderer | null = null;
  private readonly sim: Variable | null = null;
  private readonly surfMat: ShaderMaterial | null = null;
  private readonly surfRT: WebGLRenderTarget | null = null;
  private readonly causRT: WebGLRenderTarget | null = null;
  private readonly causScene = new Scene();
  private readonly flatCam = new Camera();
  private readonly waves = makeWaves();
  private readonly waveU = new Float32Array(NW * 4);
  private readonly ampU = new Float32Array(NW);
  private readonly dropU = new Float32Array(32);
  private readonly drops: [number, number, number, number][] = [];
  private simAcc = 0;
  private gustAcc = 0;
  waves_ = 0.8;
  turb = 0.5;
  // bubbles from the air stone
  private readonly bubbles: Float32Array;
  private readonly bubbleVel: Float32Array;
  private readonly bubbleGeo: BufferGeometry;
  private static readonly NB = 14;
  private static readonly STONE = new Vector3(-TX + 0.06, 0.004, -TZ + 0.05);
  onBehavior: ((e: BehaviorEvent, record: IndividualRecord) => void) | null = null;
  heroApply: ((model: LoadedModel) => Promise<HeroInstance>) | null = null;
  readonly lighting: HeroLighting = {
    sunDir: new Vector3(0.12, 0.95, 0.2).normalize(), sunColor: new Color(0.9, 0.97, 1.0), sunIntensity: 2.4,
    skyColor: new Color(0.7, 0.82, 0.9), groundColor: new Color(0.22, 0.2, 0.18), ambientIntensity: 0.5,
    fogColor: new Color(0.1, 0.14, 0.16), fogDensity: 0.2, floorY: 0, underwater: true,
  };

  constructor(private readonly canvas: HTMLCanvasElement, aspect: number, private readonly gl: WebGLRenderer) {
    this.camera = new PerspectiveCamera(40, aspect, 0.003, 20);
    this.scene.background = new Color(0.028, 0.032, 0.036);
    const pmrem = new PMREMGenerator(gl);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    // quiet dark room
    const hemi = new HemisphereLight(0x5a6a72, 0x1a1715, 0.3);
    const spot = new SpotLight(0xdff4ff, 1.8, 2.5, 0.75, 0.55, 1.2);
    spot.position.set(0.05, 0.95, 0.08);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    const fill = new DirectionalLight(0xffe9d6, 0.3);
    fill.position.set(0.9, 0.5, 0.8);
    const rim = new DirectionalLight(0x9fc8e8, 0.3);
    rim.position.set(-0.8, 0.4, -0.7);
    this.scene.add(hemi, spot, spot.target, fill, rim);
    const desk = new Mesh(new PlaneGeometry(6, 4), new MeshStandardMaterial({ color: 0x1b1715, roughness: 0.8, metalness: 0.05 }));
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -0.022;
    desk.receiveShadow = true;
    this.scene.add(desk);
    const wall = new Mesh(new PlaneGeometry(6, 3), new MeshStandardMaterial({ color: 0x0f1214, roughness: 1 }));
    wall.position.set(0, 1.4, -1.4);
    this.scene.add(wall);
    const stand = new Mesh(new BoxGeometry(TANK_W + 0.06, 0.02, TANK_D + 0.06), new MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.2 }));
    stand.position.y = -0.011;
    stand.receiveShadow = true;
    this.scene.add(stand);
    // aquarium light bar
    const bar = new Mesh(new BoxGeometry(TANK_W + 0.02, 0.012, 0.05), new MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.4 }));
    bar.position.set(0, TANK_H + 0.07, 0);
    const lamp = new Mesh(new BoxGeometry(W_LAMP_HALF * 2, 0.003, 0.03), new MeshStandardMaterial({ color: 0xffffff, emissive: new Color(0.8, 0.95, 1.0), emissiveIntensity: 3 }));
    lamp.position.set(0, W_LAMP_Y, 0);
    this.scene.add(bar, lamp);

    // ---- the water: simulation, surface texture and caustics texture (needs float render targets)
    const floatOK = gl.capabilities.isWebGL2 && (gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float'));
    const zero = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
    zero.needsUpdate = true;
    this.U = {
      uTime: { value: 0 }, uW: { value: this.waveU }, uA: { value: this.ampU }, uSim: { value: zero }, uSurf: { value: zero }, uCaus: { value: zero },
      uLampCol: { value: new Color(0.87, 0.96, 1.0).multiplyScalar(3.0) }, uCausScale: { value: 1 },
      uGlow: { value: new Color(0.004, 0.012, 0.014).multiplyScalar(2.0) }, uScatter: { value: new Color(0.005, 0.011, 0.013) }, uShaft: { value: 2.2 },
    };
    const U = this.U;
    this.waves.forEach((W, i) => this.waveU.set([W.kx, W.kz, W.w, W.ph], i * 4));
    if (floatOK) {
      try {
        const gpu = new GPUComputationRenderer(SIM[0], SIM[1], gl);
        gpu.setDataType(HalfFloatType);
        // the ripple simulation: a height field (mm); each cell moves toward the average of its neighbours and overshoots
        // (the wave equation); ClampToEdge sampling makes the glass reflect the ripples; splashes add a bump
        const sim = gpu.addVariable('heightmap', /* glsl */ `
          uniform vec4 uDrops[8];   // splashes: x, z, radius (m), height (mm)
          void main() {
            vec2 cell = 1.0 / resolution.xy, uv = gl_FragCoord.xy * cell;
            vec4 c = texture2D(heightmap, uv);
            float nb = texture2D(heightmap, uv + vec2(0.0, cell.y)).r + texture2D(heightmap, uv - vec2(0.0, cell.y)).r
                     + texture2D(heightmap, uv + vec2(cell.x, 0.0)).r + texture2D(heightmap, uv - vec2(cell.x, 0.0)).r;
            float h = (nb * 0.5 - c.g) * 0.992;
            vec2 p = (uv - 0.5) * vec2(${f(2 * TX)}, ${f(2 * TZ)});
            for (int i = 0; i < 8; i++) { vec2 q = (p - uDrops[i].xy) / uDrops[i].z; h += uDrops[i].w * exp(-dot(q, q)); }
            gl_FragColor = vec4(h, c.r, 0.0, 1.0);
          }`, gpu.createTexture());
        gpu.setVariableDependencies(sim, [sim]);
        sim.minFilter = sim.magFilter = LinearFilter;
        sim.material.uniforms.uDrops = { value: this.dropU };
        const err = gpu.init();
        if (err) throw new Error(err);
        // once a frame: the waves plus the ripples, with their slopes, into one texture every water shader reads
        const surfRT = gpu.createRenderTarget(0, 0, ClampToEdgeWrapping, ClampToEdgeWrapping, LinearFilter, LinearFilter);
        const surfMat = gpu.createShaderMaterial(/* glsl */ `
          uniform float uTime;
          uniform vec4 uW[${NW}];     // per wave: direction * wavenumber, angular speed, phase
          uniform float uA[${NW}];    // per wave: height now (m)
          uniform sampler2D uSim;
          void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy, e = 1.0 / resolution.xy, p = (uv - 0.5) * vec2(${f(2 * TX)}, ${f(2 * TZ)});
            vec3 w = vec3(0.0);
            for (int i = 0; i < ${NW}; i++) {   // each wave's crests are bent by a slower wave running along them
              vec2 kd = uW[i].xy, side = vec2(-kd.y, kd.x) / length(kd);
              float kb = 0.37 * length(kd), pb = kb * dot(side, p) + 0.9 * uTime + 7.1 * float(i);
              float ph = dot(kd, p) - uW[i].z * uTime + uW[i].w + 1.6 * sin(pb);
              w += uA[i] * vec3(sin(ph), cos(ph) * (kd + 1.6 * kb * cos(pb) * side));
            }
            float h = texture2D(uSim, uv).r;   // + the ripples (mm)
            float hx = texture2D(uSim, uv + vec2(e.x, 0.0)).r - texture2D(uSim, uv - vec2(e.x, 0.0)).r;
            float hz = texture2D(uSim, uv + vec2(0.0, e.y)).r - texture2D(uSim, uv - vec2(0.0, e.y)).r;
            gl_FragColor = vec4(w + 0.001 * vec3(h, hx * resolution.x / ${f(4 * TX)}, hz * resolution.y / ${f(4 * TZ)}), 1.0);
          }`, { uTime: U.uTime, uW: U.uW, uA: U.uA, uSim: U.uSim });
        // caustics: every vertex of a grid on the surface sends the bar's light through the water to the floor, and the
        // grid is drawn where the rays land; a surface cell landing on a smaller patch of floor concentrates its light
        // (the area ratio from screen-space derivatives), and overlapping patches add up
        const halfFloat = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
        const causRT = new WebGLRenderTarget(CAUS[0], CAUS[1], {
          type: halfFloat ? HalfFloatType : UnsignedByteType, depthBuffer: false, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, generateMipmaps: true,
        });
        U.uCausScale.value = halfFloat ? 1 : 4;
        const grid = new PlaneGeometry(2 * TX, 2 * TZ, SIM[0], SIM[1]).rotateX(-Math.PI / 2);
        const causMesh = new Mesh(grid, new ShaderMaterial({
          uniforms: U, side: DoubleSide, depthTest: false, depthWrite: false, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor,
          vertexShader: COMMON + /* glsl */ `
            varying vec2 vSurf; varying vec3 vI;
            void main() {
              vec3 w = wave(position.xz), P = vec3(position.x, W_LEVEL + w.x, position.z), n = normalOf(w);
              vec3 L; float E = lampAt(P, L);
              vec3 Lin = -L, r = refract(Lin, n, 1.0 / W_IOR);
              float t = P.y / max(-r.y, 0.05);
              vec3 F = P + r * t;
              vI = vec3(E * max(-Lin.y, 0.0) * (1.0 - fresnel(dot(-Lin, n)))) * exp(-W_ABSORB * t);
              vSurf = position.xz;
              gl_Position = vec4(F.x / W_HALF.x, F.z / W_HALF.y, 0.0, 1.0);
            }`,
          fragmentShader: /* glsl */ `
            varying vec2 vSurf; varying vec3 vI;
            void main() {
              vec2 a = dFdx(vSurf), b = dFdy(vSurf);
              gl_FragColor = vec4(vI * min(abs(a.x * b.y - a.y * b.x) / ${((4 * TX * TZ) / (CAUS[0] * CAUS[1])).toExponential(6)}, 40.0) / ${f(halfFloat ? 1 : 4)}, 1.0);
            }`,
        }));
        causMesh.frustumCulled = false;
        this.causScene.add(causMesh);
        this.gpu = gpu; this.sim = sim; this.surfMat = surfMat; this.surfRT = surfRT; this.causRT = causRT;
        U.uSurf.value = surfRT.texture;
        U.uCaus.value = causRT.texture;
      } catch (err) {
        console.warn('[tank] water simulation unavailable, flat water:', err);
      }
    }

    // sand, lit by the caustics
    const sandMat = new MeshStandardMaterial({ color: 0xb09c78, roughness: 0.95 });
    lightByCaustics(sandMat, U, 'tank-sand', true);
    const sand = new Mesh(new PlaneGeometry(TANK_W, TANK_D, 1, 1), sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.receiveShadow = true;
    this.scene.add(sand);

    // the water behind the glass: first what it takes away (absorption, per channel), then what it adds (scattered
    // light sheets, the meniscus); the surface the same way, plus its reflection of the room
    const pass = (vert: string, frag: string, add: boolean, order: number) => new ShaderMaterial({
      uniforms: U, vertexShader: vert, fragmentShader: COMMON + frag, transparent: true, depthWrite: false, toneMapped: add,
      blending: CustomBlending, blendSrc: add ? OneFactor : ZeroFactor, blendDst: add ? OneFactor : SrcColorFactor, name: `tank-pass-${order}`,
    });
    const sidesGeo = new BoxGeometry(2 * TX - 0.004, TANK_H - 0.01, 2 * TZ - 0.004).translate(0, (TANK_H - 0.01) / 2, 0);
    const sidesMul = new Mesh(sidesGeo, pass(SIDE_VERT, SIDE_HEAD + /* glsl */ `
      gl_FragColor = vec4(exp(-W_ABSORB * t), 1.0);
      #include <colorspace_fragment>
    }`, false, 2));
    sidesMul.renderOrder = 2;
    const sidesAdd = new Mesh(sidesGeo, pass(SIDE_VERT, SIDE_HEAD + /* glsl */ `
      // light inside the water along the view ray: the caustic light sheets scatter toward the eye (light shafts)
      const int N = 8;
      float ds = t / float(N);
      vec3 col = vec3(0.0), thr = vec3(1.0), Ts = exp(-W_ABSORB * ds);
      for (int i = 0; i < N; i++) {
        vec3 p = vPos + r * ((float(i) + 0.5) * ds);
        vec2 uv = p.xz / (2.0 * W_HALF) + 0.5;
        vec3 c = textureLod(uCaus, uv, 0.0).rgb, cb = textureLod(uCaus, uv, 4.0).rgb;
        vec3 sheets = (cb + uShaft * max(c - cb, 0.0)) * uCausScale;
        col += thr * uScatter * uLampCol * sheets * exp(-W_ABSORB * max(W_LEVEL - p.y, 0.0)) * ds;
        thr *= Ts;
      }
      // the meniscus: a thin bright line where the water meets the glass
      float px = fwidth(vPos.y);
      col += (0.25 * room(vPos, reflect(d, vec3(0.0, 1.0, 0.0))) + uGlow * 4.0) * 0.5 * (1.0 - smoothstep(px, 3.0 * px, h - vPos.y));
      gl_FragColor = vec4(col, 1.0);
      ${OUT}
    }`, true, 3));
    sidesAdd.renderOrder = 3;
    const surfGeo = new PlaneGeometry(2 * TX - 0.004, 2 * TZ - 0.004, 96, 48).rotateX(-Math.PI / 2);
    const surfMul = new Mesh(surfGeo, pass(SURF_VERT, SURF_HEAD + /* glsl */ `
      gl_FragColor = vec4((1.0 - F) * T, 1.0);
      #include <colorspace_fragment>
    }`, false, 4));
    surfMul.renderOrder = 4;
    const surfAdd = new Mesh(surfGeo, pass(SURF_VERT, SURF_HEAD + /* glsl */ `
      vec3 col = F * room(vPos, reflect(d, n)) + (1.0 - F) * uGlow * (1.0 - T);
      gl_FragColor = vec4(col, 1.0);
      ${OUT}
    }`, true, 5));
    surfAdd.renderOrder = 5;
    for (const m of [sidesMul, sidesAdd, surfMul, surfAdd]) m.frustumCulled = false;
    this.scene.add(sidesMul, sidesAdd, surfMul, surfAdd);

    // bubbles from an air stone in the back corner; each pop makes a ripple
    const NB = TankScene.NB;
    this.bubbles = new Float32Array(NB * 3);
    this.bubbleVel = new Float32Array(NB * 2);
    for (let i = 0; i < NB; i++) this.resetBubble(i, -Math.random() * 2.5);
    this.bubbleGeo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(this.bubbles, 3));
    const bubbleMat = new PointsMaterial({ map: bubbleTexture(), size: 0.006, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: 0.9, color: 0xdff4ff });
    const bubbles = new Points(this.bubbleGeo, bubbleMat);
    bubbles.renderOrder = 1;
    bubbles.frustumCulled = false;
    this.scene.add(bubbles);
    const stone = new Mesh(new BoxGeometry(0.03, 0.008, 0.012), new MeshStandardMaterial({ color: 0x4a5560, roughness: 0.9 }));
    stone.position.copy(TankScene.STONE).setY(0.004);
    this.scene.add(stone);

    // glass panels, edges and an invisible hit box for picking
    const glassMat = new MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.0, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
      envMapIntensity: 1.5, side: DoubleSide, depthWrite: false,
    });
    const glassParts: [number, number, number, number, number, number][] = [
      [TANK_W, TANK_H, 0.002, 0, TANK_H / 2, TANK_D / 2], [TANK_W, TANK_H, 0.002, 0, TANK_H / 2, -TANK_D / 2],
      [0.002, TANK_H, TANK_D, TANK_W / 2, TANK_H / 2, 0], [0.002, TANK_H, TANK_D, -TANK_W / 2, TANK_H / 2, 0],
    ];
    for (const [w, h, d, x, y, z] of glassParts) {
      const g = new Mesh(new BoxGeometry(w, h, d), glassMat);
      g.position.set(x, y, z);
      g.renderOrder = 6;
      this.scene.add(g);
    }
    const edges = new LineSegments(new EdgesGeometry(new BoxGeometry(TANK_W, TANK_H, TANK_D)), new LineBasicMaterial({ color: 0x6f8a90, transparent: true, opacity: 0.5 }));
    edges.position.y = TANK_H / 2;
    this.scene.add(edges);
    this.hitBox = new Mesh(new BoxGeometry(TANK_W, TANK_H, TANK_D), new MeshStandardMaterial({ visible: false }));
    this.hitBox.position.y = TANK_H / 2;
    this.hitBox.name = 'tank-hit';
    this.scene.add(this.hitBox);
    this.frameTank();
  }

  /** Default framing: the tank fills roughly two thirds of the width. */
  frameTank(): void {
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    const dist = (TANK_W / 0.66) / (2 * Math.tan(hfov / 2));
    this.camera.position.set(dist * 0.35, 0.16 + dist * 0.28, dist * 0.95);
    this.camera.lookAt(0, 0.12, 0);
    if (this.controls) { this.controls.target.set(0, 0.12, 0); this.controls.update(); }
  }

  activate(autoRotate = false): void {
    if (!this.controls) {
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.target.set(0, 0.12, 0);
      this.controls.minDistance = 0.05;
      this.controls.maxDistance = 2.2;
      this.controls.maxPolarAngle = Math.PI * 0.49;
      this.controls.enablePan = false;
      this.controls.update();
    }
    this.controls.autoRotate = autoRotate;
    this.controls.autoRotateSpeed = 0.22;
  }

  deactivate(): void {
    this.controls?.dispose();
    this.controls = null;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  get heroActive(): boolean {
    return this.occupants.some((o) => o.hero);
  }

  /** A splash on the surface at (x, z): a ripple spreads from it. */
  addRipple(x: number, z: number, heightMm = 3, radius = 0.012): void {
    if (Math.abs(x) > TX || Math.abs(z) > TZ) return;
    this.drops.push([x, z, radius, heightMm]);
  }

  /** A click on the water surface (canvas point in NDC) makes a ripple; true when it hit the water. */
  pokeAt(ndcX: number, ndcY: number): boolean {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.waterPlane, hit)) return false;
    if (Math.abs(hit.x) > TX || Math.abs(hit.z) > TZ) return false;
    this.addRipple(hit.x, hit.z, 4, 0.014);
    return true;
  }

  /** Make the tank hold exactly these records (adds and removes as needed). */
  async setOccupants(records: IndividualRecord[], species: (id: string) => SpeciesDef | undefined): Promise<void> {
    const wanted = new Set(records.map((r) => r.id));
    for (const o of [...this.occupants]) if (!wanted.has(o.record.id)) this.removeOccupant(o.record.id);
    for (const rec of records.slice(0, TANK_MAX_OCCUPANTS)) {
      if (this.occupants.some((o) => o.record.id === rec.id)) continue;
      await this.addOccupant(rec, species(rec.speciesId));
    }
  }

  private async addOccupant(record: IndividualRecord, species: SpeciesDef | undefined): Promise<void> {
    if (!species) return;
    const entry = DRIVERS[species.model.driver ?? ''];
    if (!entry) return;
    const seed = hashInts(record.number, record.caughtAt % 100000);
    const ind = generateIndividual(species, seed, 0, 0, 0, 0, Date.now());
    ind.length_mm = record.length_mm; ind.weight_g = record.weight_g; ind.sex = record.sex; ind.stage = record.stage; ind.traits = [...record.traits];
    const slot = this.occupants.length;
    ind.pos.set((slot % 2 === 0 ? -1 : 1) * 0.12 * Math.ceil(slot / 2), 0, (slot >= 2 ? 0.06 : -0.04));
    ind.home.copy(ind.pos);
    let root: Object3D, bones: Record<string, Object3D> = {}, meshes: Object3D[] = [], extras: Record<string, unknown> = {};
    let hero: HeroInstance | null = null;
    const useHero = !!this.heroApply && !!species.model.hero && !this.occupants.some((o) => o.hero);
    const rel = useHero ? species.model.hero : species.model.lod1 ?? species.model.hero ?? species.model.lod2;
    if (rel) {
      const model = await instantiateModel(rel);
      root = model.root; bones = model.bones as Record<string, Object3D>; meshes = model.meshes; extras = model.extras;
      for (const m of meshes) m.castShadow = true;
      if (useHero && this.heroApply) {
        try { hero = await this.heroApply(model); } catch (err) { console.warn('[hero] tank fallback', err); hero = null; }
      }
      if (!hero) this.lightMeshesByCaustics(meshes as Mesh[]);
    } else if (entry.placeholder) {
      const ph = entry.placeholder();
      ph.root.userData.placeholder = ph;
      root = ph.root;
      const ms: Mesh[] = [];
      root.traverse((o) => { if ((o as Mesh).isMesh) ms.push(o as Mesh); });
      this.lightMeshesByCaustics(ms);
    } else return;
    if (this.occupants.some((o) => o.record.id === record.id)) { hero?.dispose(); root.removeFromParent(); return; }
    const driver = entry.create();
    const unsub = driver.onEvent((e) => this.onBehavior?.(e, record));
    this.scene.add(root);
    driver.attach(root, ind, extras, bones, meshes);
    root.userData.occupantId = record.id;
    this.occupants.push({ record, ind, driver, root, unsub, hero });
  }

  /** Model materials are shared between instances, so the tank's copies get their own, lit by the caustics. */
  private lightMeshesByCaustics(meshes: Mesh[]): void {
    for (const mesh of meshes) {
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
      const lit = mats.map((m) => {
        if (!(m as MeshStandardMaterial).isMeshStandardMaterial) return m;
        const c = (m as MeshStandardMaterial).clone();
        c.userData = m.userData;
        lightByCaustics(c, this.U, `tank-${c.type}`, false);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? lit : lit[0];
    }
  }

  removeOccupant(id: string): void {
    const i = this.occupants.findIndex((o) => o.record.id === id);
    if (i < 0) return;
    const o = this.occupants[i];
    o.hero?.dispose();
    o.unsub();
    o.driver.dispose();
    o.root.removeFromParent();
    this.occupants.splice(i, 1);
  }

  clearOccupants(): void {
    for (const o of [...this.occupants]) this.removeOccupant(o.record.id);
  }

  /** Pick what is under a canvas point: an occupant, the tank, or nothing. */
  pick(ndcX: number, ndcY: number): { kind: 'occupant'; occupant: Occupant } | { kind: 'tank' } | null {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const roots = this.occupants.map((o) => o.root);
    const hits = this.raycaster.intersectObjects(roots, true);
    if (hits.length) {
      let obj: Object3D | null = hits[0].object;
      while (obj && obj.userData.occupantId === undefined) obj = obj.parent;
      const occ = obj ? this.occupants.find((o) => o.record.id === obj!.userData.occupantId) : undefined;
      if (occ) return { kind: 'occupant', occupant: occ };
    }
    if (this.raycaster.intersectObject(this.hitBox).length) return { kind: 'tank' };
    return null;
  }

  private resetBubble(i: number, y: number): void {
    const S = TankScene.STONE;
    this.bubbles[i * 3] = S.x + (Math.random() - 0.5) * 0.02;
    this.bubbles[i * 3 + 1] = y;
    this.bubbles[i * 3 + 2] = S.z + (Math.random() - 0.5) * 0.012;
    this.bubbleVel[i * 2] = 0.1 + Math.random() * 0.08;
    this.bubbleVel[i * 2 + 1] = Math.random() * 6.28;
  }

  private stepWater(dt: number): void {
    this.time += dt;
    this.U.uTime.value = this.time;
    // each wave's height now: its own slow cycle, scaled by how lively the tank is
    const swing = 0.35 + 0.55 * this.turb;
    this.waves.forEach((W, i) => {
      this.ampU[i] = W.a * Math.max(0.1, 1 + swing * (0.6 * Math.sin(W.f1 * this.time + W.p1) + 0.4 * Math.sin(W.f2 * this.time + W.p2)))
        * this.waves_ * (W.short ? 0.3 + 1.4 * this.turb : 1);
    });
    // bubbles rise with a wobble; each pop at the surface makes a small ripple
    const NB = TankScene.NB;
    for (let i = 0; i < NB; i++) {
      const y = this.bubbles[i * 3 + 1];
      if (y < 0) { this.bubbles[i * 3 + 1] = Math.min(0, y + dt); continue; }   // waiting at the stone
      const ph = this.bubbleVel[i * 2 + 1] + this.time * 9;
      this.bubbles[i * 3] += Math.sin(ph) * 0.004 * dt * 9;
      this.bubbles[i * 3 + 2] += Math.cos(ph * 0.8) * 0.003 * dt * 9;
      this.bubbles[i * 3 + 1] = y + this.bubbleVel[i * 2] * dt;
      if (this.bubbles[i * 3 + 1] >= W_LEVEL - 0.002) {
        this.addRipple(this.bubbles[i * 3], this.bubbles[i * 3 + 2], (Math.random() < 0.5 ? -1 : 1) * (0.25 + 0.5 * Math.random()), 0.008);
        this.resetBubble(i, -0.3 - Math.random() * 1.8);
      }
    }
    (this.bubbleGeo.attributes.position as Float32BufferAttribute).needsUpdate = true;
    // now and then a tiny gust somewhere
    for (this.gustAcc += dt * 0.4 * this.turb; this.gustAcc >= 1; this.gustAcc -= 1)
      this.addRipple((Math.random() * 2 - 1) * TX * 0.9, (Math.random() * 2 - 1) * TZ * 0.9, (Math.random() < 0.5 ? -1 : 1) * 0.3, 0.02 + 0.03 * Math.random());
    if (!this.gpu || !this.sim || !this.surfMat || !this.surfRT || !this.causRT) { this.drops.length = 0; return; }
    // the ripple simulation steps at 60 Hz, taking up to 8 waiting splashes per step
    for (this.simAcc = Math.min(this.simAcc + dt, 0.1); this.simAcc >= 1 / 60; this.simAcc -= 1 / 60) {
      for (let i = 0; i < 8; i++) this.dropU.set(this.drops.length ? this.drops.shift()! : [0, 0, 1, 0], i * 4);
      this.gpu.compute();
    }
    this.U.uSim.value = this.gpu.getCurrentRenderTarget(this.sim).texture;
    this.gpu.doRenderTarget(this.surfMat, this.surfRT);
    // redraw the caustics
    const gl = this.gl, prevRT = gl.getRenderTarget(), prevClear = new Color(), prevAlpha = gl.getClearAlpha();
    gl.getClearColor(prevClear);
    gl.setRenderTarget(this.causRT);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(this.causScene, this.flatCam);
    gl.setClearColor(prevClear, prevAlpha);
    gl.setRenderTarget(prevRT);
  }

  update(dt: number, simScale: number): void {
    this.drift += dt;
    if (this.controls) {
      this.controls.update();
      // gentle vertical breathing of the view on top of the slow orbit
      this.controls.target.y = 0.12 + Math.sin(this.drift * 0.25) * 0.012;
    }
    this.stepWater(dt);
    for (const o of this.occupants) {
      const d = o.driver;
      if (!d.busy) {
        const r = o.ind.rng.next();
        const S = o.ind.length_mm / 1000;
        if (r < 0.55) d.setIntent({ id: Date.now(), kind: 'rest', urgency: 0, seconds: 6 + o.ind.rng.next() * 20 });
        else if (r < 0.9) {
          const tx = (o.ind.rng.next() - 0.5) * (TANK_W - 4 * S), tz = (o.ind.rng.next() - 0.5) * (TANK_D - 3 * S);
          d.setIntent({ id: Date.now(), kind: 'wander', urgency: 0.3, seconds: 8, target: new Vector3(tx, 0, tz) });
        } else d.setIntent({ id: Date.now(), kind: 'special', urgency: 0, seconds: 3, param: 'yawn' });
      }
      d.update(dt, { floor: this.floor, player: new Vector3(0, 1, 2), simScale, nowMs: Date.now() });
      if (o.hero) o.hero.update(this.camera, d.openings ?? { mouth: 0, gill: 0 });
      const hx = TANK_W / 2 - 0.02, hz = TANK_D / 2 - 0.02;
      o.ind.pos.x = Math.max(-hx, Math.min(hx, o.ind.pos.x));
      o.ind.pos.z = Math.max(-hz, Math.min(hz, o.ind.pos.z));
    }
  }

  dispose(): void {
    this.deactivate();
    this.clearOccupants();
    this.gpu?.dispose();
    this.surfRT?.dispose();
    this.causRT?.dispose();
  }
}
