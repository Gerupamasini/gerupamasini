import {
  BoxGeometry, Camera, CanvasTexture, ClampToEdgeWrapping, Color, CustomBlending, DataTexture, DirectionalLight, DoubleSide,
  FloatType, HalfFloatType, HemisphereLight, LinearFilter, LinearMipmapLinearFilter,
  Mesh, MeshStandardMaterial, Object3D, OneFactor, OneMinusSrcAlphaFactor, PerspectiveCamera, PlaneGeometry, Plane,
  PMREMGenerator, Raycaster, RGBAFormat, Scene, ShaderMaterial, SpotLight, SrcColorFactor, UnsignedByteType,
  Vector2, Vector3, WebGLRenderTarget, ZeroFactor, type IUniform, type Material, type WebGLRenderer, SRGBColorSpace } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js';
import type { IndividualRecord } from '../creatures/Individual';
import type { SpeciesDef } from '../data/schemas';
import type { Driver, Floor } from '../creatures/drivers/Driver';
import { DRIVERS } from '../creatures/drivers/index';
import { instantiateModel } from '../creatures/models/ModelLoader';
import { modelFor, variantOf } from '../creatures/models/choice';
import { generateIndividual, type Individual } from '../creatures/Individual';
import { hashInts } from '../core/Rng';
import type { BehaviorEvent } from '../creatures/drivers/Driver';
import type { LoadedModel } from '../creatures/models/ModelLoader';
import type { HeroInstance } from '../creatures/species/mahaze/hero/applyHero';
import type { HeroLighting } from '../render/HeroPipeline';
import { buildTankItem, defaultTankLayout, ITEM_RADIUS, TANK_MAX_ITEMS, type TankItem, type TankItemType, type TankLayout, type TankSubstrate } from './TankLayout';
import { Group } from 'three';
import { AquariumEquipment } from '../aquarium';
import { ToolShelf, type ShelfTool } from './ToolShelf';
import { QUALITY_PRESETS, type QualityPreset } from '../core/Settings';

const UP = new Vector3(0, 1, 0);

export const TANK_W = 0.6, TANK_D = 0.3, TANK_H = 0.36, WATER_H = 0.3;
export const TANK_MAX_OCCUPANTS = 4;
/** The cabinet is 73 cm tall; keep aquarium coordinates local to its top. */
export const TANK_OFFSET_Y = 0.73;

export interface Occupant {
  record: IndividualRecord;
  species: SpeciesDef;
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
const W_ABSORB = [0.26, 0.055, 0.032];
/** depth of the sand bed (m) */
export const SAND_H = 0.05;
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
uniform vec3 uLampPosition, uLampAxis;
uniform vec3 uLampCol;      // the light bar's light
uniform float uCausScale;   // caustics texture -> fraction of the bar's light
const float W_LEVEL = ${f(W_LEVEL)}, W_IOR = ${f(W_IOR)}, W_LAMP_Y = ${f(W_LAMP_Y)}, W_LAMP_HALF = ${f(W_LAMP_HALF)};
const vec2 W_HALF = vec2(${f(TX)}, ${f(TZ)});
const vec3 W_ABSORB = vec3(${W_ABSORB.map(f).join(', ')});
const vec3 TANK_ORIGIN = vec3(0.0, ${f(TANK_OFFSET_Y)}, 0.0);
// water height above W_LEVEL and its slope at p
vec3 wave(vec2 p) { return textureLod(uSurf, p / (2.0 * W_HALF) + 0.5, 0.0).xyz; }
vec3 normalOf(vec3 w) { return normalize(vec3(-w.y, 1.0, -w.z)); }
float fresnel(float c) { return 0.02 + 0.98 * pow(1.0 - clamp(c, 0.0, 1.0), 5.0); }
// the LED bar above the tank: the direction to its nearest point, and how much of its light arrives (1 right under it)
float lampAt(vec3 p, out vec3 L) {
  vec3 d = uLampPosition + uLampAxis * clamp(dot(p - uLampPosition, uLampAxis), -W_LAMP_HALF, W_LAMP_HALF) - p;
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
    float t = (uLampPosition.y - p.y) / d.y;
    vec3 q = p + d * t - uLampPosition;
    q = vec3(dot(q, uLampAxis), q.y, dot(q, cross(uLampAxis, vec3(0.0, 1.0, 0.0))));
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
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
}`;
// the surface seen from above: the view refracts into the water and is absorbed on its way to the floor
const SURF_HEAD = /* glsl */ `
varying vec3 vPos;
uniform vec3 uGlow;
void main() {
  vec3 n = normalOf(wave(vPos.xz)), d = normalize(vPos - (cameraPosition - TANK_ORIGIN));
  if (dot(d, n) > -0.02) n = normalize(n - d * (dot(d, n) + 0.02));
  float F = fresnel(-dot(d, n));
  vec3 r = refract(d, n, 1.0 / W_IOR);
  float t = boxExit(vec3(vPos.x, min(vPos.y, W_LEVEL - 0.001), vPos.z), r);
  vec3 T = exp(-W_ABSORB * t);
`;
const SIDE_VERT = COMMON + /* glsl */ `
varying vec3 vPos; varying vec3 vNrm;
void main() { vPos = (modelMatrix * vec4(position, 1.0)).xyz - TANK_ORIGIN; vNrm = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// the water behind the glass walls, up to the moving water line
const SIDE_HEAD = /* glsl */ `
varying vec3 vPos; varying vec3 vNrm;
uniform vec3 uGlow, uScatter;
uniform float uShaft;
void main() {
  if (abs(vNrm.y) > 0.5) discard;
  float h = W_LEVEL + wave(clamp(vPos.xz, -W_HALF, W_HALF)).x;
  if (vPos.y > h) discard;
  vec3 d = normalize(vPos - (cameraPosition - TANK_ORIGIN)), n = normalize(vNrm);
  vec3 r = refract(d, n, 1.0 / W_IOR);
  float t = boxExit(vPos - n * 0.001, r);
`;

/** Lets a standard material receive the caustic light on top of the scene's lights. */
function lightByCaustics(m: MeshStandardMaterial, U: Record<string, IUniform>, key: string, grain: boolean, chain?: MeshStandardMaterial['onBeforeCompile']): void {
  m.onBeforeCompile = (shader, renderer) => {
    chain?.(shader, renderer);
    Object.assign(shader.uniforms, { uSurf: U.uSurf, uCaus: U.uCaus, uLampCol: U.uLampCol, uLampPosition: U.uLampPosition, uLampAxis: U.uLampAxis, uCausScale: U.uCausScale });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosT;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvWorldPosT = (modelMatrix * vec4(transformed, 1.0)).xyz - vec3(0.0, ${f(TANK_OFFSET_Y)}, 0.0);`);
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

/**
 * The home showcase tank: a 60 cm aquarium in a dark, quiet room under a cool LED bar. Water is kept almost clear so
 * the animals read well; real caustics from the moving surface play on the sand and the animals; bubbles from an air
 * stone keep the surface alive; the player controls the viewpoint. Several occupants can live in it.
 */
export class TankScene {
  readonly scene = new Scene();
  readonly aquariumRoot = new Group();
  readonly camera: PerspectiveCamera;
  private controls: OrbitControls | null = null;
  private viewInputEnabled = true;
  /** the tool shelf on the wall, and the camera's move between the tank and it */
  readonly shelf = new ToolShelf();
  private view: 'tank' | 'shelf' = 'tank';
  private readonly camFrom = { p: new Vector3(), t: new Vector3() };
  private readonly camTo = { p: new Vector3(), t: new Vector3() };
  private readonly camCur = { t: new Vector3(0, TANK_OFFSET_Y + 0.12, 0) };
  private camT = 1;
  readonly occupants: Occupant[] = [];
  /** top of the substrate: the animals, the decorations and the caustics all sit on it */
  private sandTop = SAND_H;
  private readonly floor: Floor = { heightAt: () => this.sandTop, waterAt: () => WATER_H };
  private readonly hitBox: Mesh;
  private readonly raycaster = new Raycaster();
  private readonly waterPlane = new Plane(new Vector3(0, 1, 0), -W_LEVEL - TANK_OFFSET_Y);
  private readonly floorPlane = new Plane(new Vector3(0, 1, 0), -TANK_OFFSET_Y - SAND_H);
  // layout: substrate and decorations
  private layout: TankLayout = defaultTankLayout();
  private readonly itemsRoot = new Group();
  private readonly nudgeV = new Vector3();
  private readonly nudgeV2 = new Vector3();
  private readonly nudgeV3 = new Vector3();
  private readonly itemObjects = new Map<string, Object3D>();
  private readonly sandMesh: Mesh;
  private readonly sandMat: MeshStandardMaterial;
  private readonly bottomMesh: Mesh;
  private itemSeq = 0;
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
  private readonly jetU = new Float32Array(16);
  private readonly jetValues = new Float32Array(8);
  private readonly dropU = new Float32Array(32);
  private readonly drops: [number, number, number, number][] = [];
  private simAcc = 0;
  private waterAcc = 0;
  private preset = QUALITY_PRESETS.mid;
  private occupantGeneration = 0;
  private occupantRecords: IndividualRecord[] = [];
  private speciesLookup: ((id: string) => SpeciesDef | undefined) | null = null;
  private readonly flatWater: DataTexture;
  private gustAcc = 0;
  waves_ = 0.8;
  turb = 0.5;
  readonly equipment = new AquariumEquipment({ width: TANK_W, depth: TANK_D, height: TANK_H, glass: 0.006, waterHeight: WATER_H });
  private readonly lampLight: SpotLight;
  onBehavior: ((e: BehaviorEvent, record: IndividualRecord) => void) | null = null;
  heroApply: ((model: LoadedModel) => Promise<HeroInstance>) | null = null;
  readonly lighting: HeroLighting = {
    sunDir: new Vector3(0.12, 0.95, 0.2).normalize(), sunColor: new Color(0.9, 0.97, 1.0), sunIntensity: 2.4,
    skyColor: new Color(0.7, 0.82, 0.9), groundColor: new Color(0.22, 0.2, 0.18), ambientIntensity: 0.5,
    fogColor: new Color(0.1, 0.14, 0.16), fogDensity: 0.2, floorY: TANK_OFFSET_Y, underwater: true,
  };

  constructor(private readonly canvas: HTMLCanvasElement, aspect: number, private readonly gl: WebGLRenderer) {
    this.camera = new PerspectiveCamera(40, aspect, 0.003, 20);
    this.scene.background = new Color(0.028, 0.032, 0.036);
    this.aquariumRoot.name = 'raisedAquarium'; this.aquariumRoot.position.y = TANK_OFFSET_Y;
    this.scene.add(this.aquariumRoot);
    const pmrem = new PMREMGenerator(gl);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    // quiet dark room
    const hemi = new HemisphereLight(0x5a6a72, 0x1a1715, 0.3);
    const spot = new SpotLight(0xdff4ff, 1.8, 2.5, 0.75, 0.55, 1.2);
    spot.position.set(0.05, 0.95, 0.08);
    spot.target.position.set(0, 0, 0);
    this.lampLight = spot;
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
    desk.position.y = TANK_OFFSET_Y - 0.738; desk.name = 'roomFloor';
    desk.receiveShadow = true;
    this.scene.add(desk);
    const wall = new Mesh(new PlaneGeometry(6, 3), new MeshStandardMaterial({ color: 0x0f1214, roughness: 1 }));
    wall.position.set(0, 1.4, -1.4);
    this.scene.add(wall);
    this.aquariumRoot.add(this.equipment);
    this.equipment.onRipple = (x, z, strength) => this.addRipple(x, z, strength, 0.009);
    this.scene.add(this.shelf.group);
    // a window on the back wall, the bay at night outside
    const win = new Mesh(new PlaneGeometry(1.05, 0.72), new MeshStandardMaterial({ map: makeNightWindow(), emissive: new Color(0xffffff), emissiveMap: makeNightWindow(), emissiveIntensity: 0.55, roughness: 1 }));
    win.position.set(1.05, 0.9, -1.39);
    this.scene.add(win);
    const frameMat = new MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.2 });
    for (const [w, h, x, y] of [[1.11, 0.03, 1.05, 1.275], [1.11, 0.03, 1.05, 0.525], [0.03, 0.78, 0.51, 0.9], [0.03, 0.78, 1.59, 0.9], [0.02, 0.72, 1.05, 0.9]] as [number, number, number, number][]) {
      const f = new Mesh(new BoxGeometry(w, h, 0.03), frameMat);
      f.position.set(x, y, -1.38);
      this.scene.add(f);
    }

    // ---- the water: simulation, surface texture and caustics texture (needs float render targets)
    const floatOK = gl.capabilities.isWebGL2 && (gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float'));
    const zero = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
    zero.needsUpdate = true;
    this.flatWater = zero;
    this.U = {
      uLampPosition: { value: new Vector3(0, W_LAMP_Y, 0) }, uLampAxis: { value: new Vector3(1, 0, 0) },
      uJets: { value: this.jetU }, uJetValues: { value: this.jetValues },
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
          uniform vec4 uJets[4];
          uniform vec2 uJetValues[4];
          void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy, e = 1.0 / resolution.xy, p = (uv - 0.5) * vec2(${f(2 * TX)}, ${f(2 * TZ)});
            vec3 w = vec3(0.0);
            for (int i = 0; i < ${NW}; i++) {   // each wave's crests are bent by a slower wave running along them
              vec2 kd = uW[i].xy, side = vec2(-kd.y, kd.x) / length(kd);
              float kb = 0.37 * length(kd), pb = kb * dot(side, p) + 0.9 * uTime + 7.1 * float(i);
              float ph = dot(kd, p) - uW[i].z * uTime + uW[i].w + 1.6 * sin(pb);
              w += uA[i] * vec3(sin(ph), cos(ph) * (kd + 1.6 * kb * cos(pb) * side));
            }
            // Equipment outlets send a small directional surface disturbance into the existing height field.
            for (int i = 0; i < 4; i++) {
              if (uJetValues[i].x <= 0.0) continue;
              vec2 q = p - uJets[i].xy, dir = uJets[i].zw;
              float radius = max(uJetValues[i].y, 0.03), envelope = exp(-dot(q, q) / (radius * radius));
              float phase = dot(q, dir) * 75.0 - uTime * 7.0;
              float a = uJetValues[i].x * 0.00025;
              w += a * envelope * vec3(sin(phase), cos(phase) * 75.0 * dir - sin(phase) * 2.0 * q / (radius * radius));
            }
            float h = texture2D(uSim, uv).r;   // + the ripples (mm)
            float hx = texture2D(uSim, uv + vec2(e.x, 0.0)).r - texture2D(uSim, uv - vec2(e.x, 0.0)).r;
            float hz = texture2D(uSim, uv + vec2(0.0, e.y)).r - texture2D(uSim, uv - vec2(0.0, e.y)).r;
            gl_FragColor = vec4(w + 0.001 * vec3(h, hx * resolution.x / ${f(4 * TX)}, hz * resolution.y / ${f(4 * TZ)}), 1.0);
          }`, { uTime: U.uTime, uW: U.uW, uA: U.uA, uSim: U.uSim, uJets: U.uJets, uJetValues: U.uJetValues });
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
    // a 5 cm bed of sand, not a sheet: the box's top is the floor the animals and the decorations stand on
    const sand = new Mesh(new BoxGeometry(TANK_W - 0.002, SAND_H, TANK_D - 0.002), sandMat);
    sand.position.y = SAND_H / 2;
    sand.receiveShadow = true;
    this.aquariumRoot.add(sand);
    this.sandMesh = sand; this.sandMat = sandMat;
    // bare bottom (dark acrylic) when no substrate is chosen; still lit by the caustics
    const bottomMat = new MeshStandardMaterial({ color: 0x101316, roughness: 0.3, metalness: 0.1 });
    lightByCaustics(bottomMat, U, 'tank-bottom', false);
    const bottom = new Mesh(new PlaneGeometry(TANK_W, TANK_D, 1, 1), bottomMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.receiveShadow = true;
    bottom.visible = false;
    this.aquariumRoot.add(bottom);
    this.bottomMesh = bottom;
    this.aquariumRoot.add(this.itemsRoot);

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
      // light inside the water along the view ray: the caustic light sheets scatter toward the eye (light shafts;
      // the lite tank takes half the steps)
      #ifndef SHAFT_N
      #define SHAFT_N 8
      #endif
      const int N = SHAFT_N;
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
    this.shaftMat = sidesAdd.material as ShaderMaterial;
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
    this.aquariumRoot.add(sidesMul, sidesAdd, surfMul, surfAdd);

    // glass panels: only what the panes reflect of the dark room (Fresnel, premultiplied), so the water and the animals
    // show through untinted; edges and an invisible hit box for picking
    const glassMat = new ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, side: DoubleSide, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
      vertexShader: SIDE_VERT,
      fragmentShader: COMMON + /* glsl */ `
        varying vec3 vPos; varying vec3 vNrm;
        void main() {
          vec3 d = normalize(vPos - (cameraPosition - TANK_ORIGIN)), n = normalize(vNrm) * (gl_FrontFacing ? 1.0 : -1.0);
          float F = 0.04 + 0.96 * pow(1.0 - abs(dot(d, n)), 5.0);
          gl_FragColor = vec4(F * room(vPos, reflect(d, n)), F + 0.01);
          ${OUT}
        }`,
    });
    // Reuse the host's optical glass shader; standalone tanks use the shared physical glass.
    this.equipment.onTankChanged = () => this.equipment.tank.traverse((o) => { if (o instanceof Mesh && o.material === this.equipment.materials.glass) o.material = glassMat; });
    this.equipment.onTankChanged();
    this.hitBox = new Mesh(new BoxGeometry(TANK_W, TANK_H, TANK_D), new MeshStandardMaterial({ visible: false }));
    this.hitBox.position.y = TANK_H / 2;
    this.hitBox.name = 'tank-hit';
    this.aquariumRoot.add(this.hitBox);
    this.frameTank();
  }

  /** Default framing: the tank fills roughly two thirds of the width. */
  frameTank(fitHeight = false): void {
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    const widthDistance = (TANK_W / 0.66) / (2 * Math.tan(hfov / 2));
    const heightDistance = fitHeight ? (TANK_H + 0.16) / (0.8 * 2 * Math.tan(this.camera.fov * Math.PI / 360)) : 0;
    const dist = Math.max(widthDistance, heightDistance);
    if (fitHeight) { this.view = 'tank'; this.camT = 1; }
    this.camera.position.set(dist * 0.35, TANK_OFFSET_Y + 0.16 + dist * 0.28, dist * 0.95);
    this.camera.lookAt(0, TANK_OFFSET_Y + 0.12, 0);
    if (this.controls) { this.controls.target.set(0, TANK_OFFSET_Y + 0.12, 0); this.controls.update(); }
  }

  captureView() {
    return { position: this.camera.position.clone(), target: (this.camT < 1 || this.view === 'shelf' ? this.camCur.t : this.controls?.target ?? this.camCur.t).clone(), view: this.view };
  }

  restoreView(state: ReturnType<TankScene['captureView']>): void {
    this.view = state.view; this.camT = 1;
    this.camera.position.copy(state.position); this.camCur.t.copy(state.target);
    this.camera.lookAt(state.target);
    if (this.controls) { this.controls.target.copy(state.target); this.controls.update(); }
  }

  activate(autoRotate = false): void {
    if (!this.controls) {
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.target.set(0, TANK_OFFSET_Y + 0.12, 0);
      // right up to the glass (the camera's near plane is 3 mm) and back to the far wall
      this.controls.minDistance = 0.012;
      this.controls.maxDistance = 3.2;
      this.controls.maxPolarAngle = Math.PI * 0.49;
      this.controls.enablePan = true;
      this.controls.panSpeed = 0.6;
      this.controls.screenSpacePanning = true;
      this.controls.zoomSpeed = 1.1;
      this.controls.update();
    }
    this.controls.autoRotate = autoRotate;
    this.controls.autoRotateSpeed = 0.22;
    // Home stops moving as soon as the player releases the mouse or a movement key.
    this.controls.enableDamping = autoRotate;
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

  // ------------------------------------------------------------------ layout: substrate and decorations
  get currentLayout(): TankLayout {
    return { substrate: this.layout.substrate, items: this.layout.items.map((i) => ({ ...i })), equipment: this.equipment.currentLayout };
  }

  setLayout(layout: TankLayout): void {
    this.layout = { substrate: layout.substrate, items: layout.items.map((i) => ({ ...i })) };
    this.equipment.setLayout(layout.equipment);
    this.equipment.applyPreset();
    if (!layout.equipment && layout.substrate === 'none') this.moveBottomEquipment(-SAND_H);
    this.applySubstrate();
    for (const o of this.itemObjects.values()) o.removeFromParent();
    this.itemObjects.clear();
    for (const it of this.layout.items) this.spawnItem(it);
  }

  setSubstrate(s: TankSubstrate): void {
    const previous = this.sandTop;
    this.layout.substrate = s;
    this.applySubstrate();
    this.moveBottomEquipment(this.sandTop - previous, previous);
  }

  /** Keep equipment resting on the bed when its thickness changes; retain manually raised placements. */
  private moveBottomEquipment(delta: number, previous = SAND_H): void {
    if (!delta) return;
    for (const r of this.equipment.currentLayout.devices) {
      if (!['airStone', 'spongeFilter', 'circulationPump'].includes(r.kind) || Math.abs(r.position[1] - previous) > 0.025) continue;
      const position = [...r.position] as [number, number, number]; position[1] = Math.max(0, position[1] + delta);
      this.equipment.changeDevice(r.id, { position });
    }
  }

  private applySubstrate(): void {
    const s = this.layout.substrate;
    this.sandMesh.visible = s !== 'none';
    this.bottomMesh.visible = s === 'none';
    this.sandTop = s === 'none' ? 0 : SAND_H;
    this.floorPlane.constant = -TANK_OFFSET_Y - this.sandTop;
    this.lighting.floorY = TANK_OFFSET_Y + this.sandTop;
    this.itemsRoot.position.y = this.sandTop;
    for (const o of this.occupants) o.ind.pos.y = this.sandTop;
    if (s === 'mud') { this.sandMat.color.set(0x4a4034); this.sandMat.roughness = 1.0; }
    else { this.sandMat.color.set(0xb09c78); this.sandMat.roughness = 0.95; }
  }

  private spawnItem(it: TankItem): void {
    const seed = [...it.id].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);   // the same id always gives the same shape
    const obj = buildTankItem(it.type, seed);
    const meshes: Mesh[] = [];
    obj.traverse((o) => { if ((o as Mesh).isMesh) { const m = o as Mesh; m.castShadow = m.castShadow !== false && it.type !== 'plant'; m.receiveShadow = true; meshes.push(m); } });
    this.lightMeshesByCaustics(meshes);
    obj.position.set(it.x, 0, it.z);
    obj.rotation.y = it.rot;
    obj.userData.itemId = it.id;
    this.itemsRoot.add(obj);
    this.itemObjects.set(it.id, obj);
  }

  /** Add a decoration at a free spot; null when the tank is full. */
  addItem(type: TankItemType): TankItem | null {
    if (this.layout.items.length >= TANK_MAX_ITEMS) return null;
    const r = ITEM_RADIUS[type];
    let best: [number, number] = [0, 0], bestD = -1;
    for (let k = 0; k < 24; k++) {
      const x = (Math.random() * 2 - 1) * (TX - r - 0.02), z = (Math.random() * 2 - 1) * (TZ - r - 0.02);
      let d = 1;
      for (const o of this.layout.items) d = Math.min(d, Math.hypot(o.x - x, o.z - z) - ITEM_RADIUS[o.type] - r);
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
    const it: TankItem = { id: `i${Date.now().toString(36)}${(this.itemSeq++).toString(36)}`, type, x: best[0], z: best[1], rot: Math.random() * Math.PI * 2 };
    this.layout.items.push(it);
    this.spawnItem(it);
    return it;
  }

  removeItem(id: string): void {
    this.itemObjects.get(id)?.removeFromParent();
    this.itemObjects.delete(id);
    this.layout.items = this.layout.items.filter((i) => i.id !== id);
  }

  rotateItem(id: string, delta: number): void {
    const it = this.layout.items.find((i) => i.id === id), obj = this.itemObjects.get(id);
    if (!it || !obj) return;
    it.rot += delta;
    obj.rotation.y = it.rot;
  }

  /** The decoration under a canvas point (NDC), if any. */
  pickItem(ndcX: number, ndcY: number): string | null {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects(this.itemsRoot.children, true);
    for (const hit of hits) {
      let o: Object3D | null = hit.object;
      while (o && o.userData.itemId === undefined) o = o.parent;
      if (o) return o.userData.itemId as string;
    }
    return null;
  }

  /** Clicking a visible aquarium interior selects its item card. */
  pickEquipment(ndcX: number, ndcY: number): string | null {
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects([this.equipment.stand, ...this.equipment.devices.values()], true);
    for (const hit of hits) {
      let o: Object3D | null = hit.object;
      if (!(o instanceof Mesh) || !o.visible) continue;
      // Raycaster also visits hidden LOD children: only the currently drawn level is selectable.
      let visible = true;
      while (o && o !== this.equipment) { if (!o.visible) visible = false; if (o.userData.equipmentId) break; o = o.parent; }
      if (visible && o?.userData.equipmentId) return o.userData.equipmentId as string;
    }
    return this.raycaster.intersectObject(this.hitBox).length ? 'tank' : null;
  }

  /** Drag a decoration to where a canvas point (NDC) meets the sand, kept inside the tank. */
  moveItem(id: string, ndcX: number, ndcY: number): void {
    const it = this.layout.items.find((i) => i.id === id), obj = this.itemObjects.get(id);
    if (!it || !obj) return;
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) return;
    const r = ITEM_RADIUS[it.type];
    it.x = Math.max(-TX + r, Math.min(TX - r, hit.x));
    it.z = Math.max(-TZ + r, Math.min(TZ - r, hit.z));
    obj.position.set(it.x, 0, it.z);
  }

  setAutoRotate(on: boolean): void {
    if (this.controls) this.controls.autoRotate = on;
  }

  setControlsEnabled(on: boolean): void {
    if (this.controls) this.controls.enabled = on && this.viewInputEnabled;
  }

  /** Home can lock touch navigation even after a shelf/tank camera transition completes. */
  setViewInputEnabled(on: boolean): void {
    this.viewInputEnabled = on;
    this.setControlsEnabled(on);
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
  setOccupants(records: IndividualRecord[], species: (id: string) => SpeciesDef | undefined): Promise<void> {
    this.occupantRecords = [...records]; this.speciesLookup = species;
    const generation = ++this.occupantGeneration;
    this.dropped.clear();
    const wanted = new Set(records.map((r) => r.id));
    for (const o of [...this.occupants]) if (!wanted.has(o.record.id)) this.removeOccupant(o.record.id);
    return this.queued(async () => {
      for (const rec of records.slice(0, TANK_MAX_OCCUPANTS)) {
        if (generation !== this.occupantGeneration) return;
        if (this.occupants.some((o) => o.record.id === rec.id) || this.dropped.has(rec.id)) continue;
        try { await this.addOccupant(rec, species(rec.speciesId), generation); }
        catch (e) { console.warn('[tank] model unavailable; retry when reopened', e); }
      }
    });
  }

  /** Rebuild the current desired occupants, including pending loads, when hero materials change. */
  refreshHero(): Promise<void> {
    const records = [...this.occupantRecords], lookup = this.speciesLookup;
    if (!lookup) return Promise.resolve();
    this.clearOccupants();
    return this.setOccupants(records, lookup);
  }

  private readonly dropped = new Set<string>();
  private occupantQueue: Promise<void> = Promise.resolve();

  private queued(job: () => Promise<void>): Promise<void> {
    const run = this.occupantQueue.then(job, job);
    this.occupantQueue = run.catch(() => undefined);
    return run;
  }

  private async addOccupant(record: IndividualRecord, species: SpeciesDef | undefined, generation: number): Promise<void> {
    if (!species) return;
    const entry = DRIVERS[species.model.driver ?? ''];
    if (!entry) return;
    const seed = hashInts(record.number, record.caughtAt % 100000);
    const ind = generateIndividual(species, seed, 0, 0, 0, 0, Date.now());
    ind.length_mm = record.length_mm; ind.weight_g = record.weight_g; ind.sex = record.sex; ind.stage = record.stage; ind.traits = [...record.traits]; ind.gravid = !!record.gravid; ind.dress = !!record.dress;
    const slot = this.occupants.length;
    ind.pos.set((slot % 2 === 0 ? -1 : 1) * 0.12 * Math.ceil(slot / 2), 0, (slot >= 2 ? 0.06 : -0.04));
    ind.home.copy(ind.pos);
    let root: Object3D, bones: Record<string, Object3D> = {}, meshes: Object3D[] = [], extras: Record<string, unknown> = {};
    let hero: HeroInstance | null = null;
    const files = modelFor(species, ind.stage, ind.gravid, ind.dress);
    const useHero = this.preset.modelTier === 'hero' && !!this.heroApply && !!files.hero && !this.occupants.some((o) => o.hero);
    const rel = this.preset.modelTier === 'lod2' ? files.lod2 ?? (entry.placeholder ? undefined : files.lod1) : useHero ? files.hero : files.lod1 ?? files.lod2 ?? (entry.placeholder ? undefined : files.hero);
    if (rel) {
      const model = await instantiateModel(rel, variantOf(ind.id));
      root = model.root; bones = model.bones as Record<string, Object3D>; meshes = model.meshes; extras = model.extras;
      for (const m of meshes) m.castShadow = this.preset.shadows;
      if (useHero && this.heroApply) {
        try { hero = await this.heroApply(model); } catch (err) { console.warn('[hero] tank fallback', err); hero = null; }
        if (!this.heroApply) { hero?.dispose(); hero = null; }
      }
      if (!hero) this.lightMeshesByCaustics(meshes as Mesh[]);
    } else if (entry.placeholder) {
      const ph = entry.placeholder();
      ph.root.userData.placeholder = ph;
      // a clam set into the tank is seen whole first, then digs in (where there is something to dig into)
      ph.root.userData.startOnSurface = true;
      root = ph.root;
    } else return;
    if (generation !== this.occupantGeneration || this.dropped.has(record.id) || this.occupants.some((o) => o.record.id === record.id)) { hero?.dispose(); root.removeFromParent(); return; }
    const driver = entry.create();
    const unsub = driver.onEvent((e) => this.onBehavior?.(e, record));
    this.aquariumRoot.add(root);
    driver.attach(root, ind, extras, bones, meshes);
    if (!rel) {
      // procedural models are built by the driver in attach(); light them now
      const ms: Mesh[] = [];
      root.traverse((o) => { if ((o as Mesh).isMesh) ms.push(o as Mesh); });
      this.lightMeshesByCaustics(ms);
    }
    root.userData.occupantId = record.id;
    this.occupants.push({ record, species, ind, driver, root, unsub, hero });
  }

  /** Model materials are shared between instances, so the tank's copies get their own, lit by the caustics. */
  private lightMeshesByCaustics(meshes: Mesh[]): void {
    for (const mesh of meshes) {
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
      const lit = mats.map((m) => {
        if (!(m as MeshStandardMaterial).isMeshStandardMaterial) return m;
        const c = (m as MeshStandardMaterial).clone();
        c.userData = m.userData;
        // keep a model's own shader injection (e.g. the shrimp cuticle) and add the caustics after it
        const prev = m.onBeforeCompile, prevKey = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey() : c.type;
        lightByCaustics(c, this.U, `tank-${prevKey}`, false, prev);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? lit : lit[0];
    }
  }

  removeOccupant(id: string): void {
    this.dropped.add(id);
    this.occupantRecords = this.occupantRecords.filter(record => record.id !== id);
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
    ++this.occupantGeneration;
    this.occupantRecords = [];
    for (const o of [...this.occupants]) this.removeOccupant(o.record.id);
  }

  setQuality(preset: QualityPreset): void {
    if (this.preset === preset) return;
    this.preset = preset; this.waterAcc = 0;
    this.lampLight.castShadow = preset.shadows;
    this.lampLight.shadow.map?.dispose(); this.lampLight.shadow.map = null;
    this.lampLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    this.lampLight.shadow.needsUpdate = true;
    this.U.uSurf.value = preset.tankWaterHz ? this.surfRT?.texture ?? this.flatWater : this.flatWater;
    this.U.uCaus.value = preset.tankWaterHz ? this.causRT?.texture ?? this.flatWater : this.flatWater;
    const records = this.occupantRecords, lookup = this.speciesLookup;
    this.clearOccupants();
    if (lookup) void this.setOccupants(records, lookup);
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

  /** 超軽量: the ripples step at most twice a frame, the caustics are redrawn every other frame and the light
   * shafts take half the steps */
  private lite = false;
  private causTick = 0;
  private shaftMat: ShaderMaterial | null = null;
  setLite(on: boolean): void {
    this.lite = on;
    const m = this.shaftMat;
    if (m && ('SHAFT_N' in m.defines) !== on) {
      if (on) m.defines.SHAFT_N = 4; else delete m.defines.SHAFT_N;
      m.needsUpdate = true;
    }
  }

  private stepWater(dt: number): void {
    if (!this.preset.tankWaterHz) { this.drops.length = 0; return; }
    this.waterAcc += dt;
    if (this.waterAcc < 1 / this.preset.tankWaterHz) return;
    dt = this.waterAcc; this.waterAcc = 0;
    this.time += dt;
    this.U.uTime.value = this.time;
    this.jetU.fill(0); this.jetValues.fill(0);
    this.equipment.flows.slice(0, 4).forEach((flow, i) => {
      this.jetU.set([flow.position.x, flow.position.z, flow.direction.x, flow.direction.z], i * 4);
      this.jetValues.set([Math.min(1, flow.flowRate / 600), flow.radius], i * 2);
    });
    // each wave's height now: its own slow cycle, scaled by how lively the tank is
    const swing = 0.35 + 0.55 * this.turb;
    this.waves.forEach((W, i) => {
      this.ampU[i] = W.a * Math.max(0.1, 1 + swing * (0.6 * Math.sin(W.f1 * this.time + W.p1) + 0.4 * Math.sin(W.f2 * this.time + W.p2)))
        * this.waves_ * (W.short ? 0.3 + 1.4 * this.turb : 1);
    });
    // now and then a tiny gust somewhere
    for (this.gustAcc += dt * 0.4 * this.turb; this.gustAcc >= 1; this.gustAcc -= 1)
      this.addRipple((Math.random() * 2 - 1) * TX * 0.9, (Math.random() * 2 - 1) * TZ * 0.9, (Math.random() < 0.5 ? -1 : 1) * 0.3, 0.02 + 0.03 * Math.random());
    if (!this.gpu || !this.sim || !this.surfMat || !this.surfRT || !this.causRT) { this.drops.length = 0; return; }
    // Cap catch-up work as well as the scene's water update frequency.
    this.simAcc = Math.min(this.simAcc + dt, 0.1);
    for (let steps = 0; this.simAcc >= 1 / 60 && steps < (this.lite ? 2 : 6); steps++, this.simAcc -= 1 / 60) {
      for (let i = 0; i < 8; i++) this.dropU.set(this.drops.length ? this.drops.shift()! : [0, 0, 1, 0], i * 4);
      this.gpu.compute();
    }
    if (this.lite) this.simAcc = Math.min(this.simAcc, 1 / 60);
    this.U.uSim.value = this.gpu.getCurrentRenderTarget(this.sim).texture;
    this.gpu.doRenderTarget(this.surfMat, this.surfRT);
    // redraw the caustics (the lite tank every other frame)
    if (this.lite && (this.causTick++ & 1)) return;
    const gl = this.gl, prevRT = gl.getRenderTarget(), prevClear = new Color(), prevAlpha = gl.getClearAlpha();
    gl.getClearColor(prevClear);
    gl.setRenderTarget(this.causRT);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(this.causScene, this.flatCam);
    gl.setClearColor(prevClear, prevAlpha);
    gl.setRenderTarget(prevRT);
  }

  private updateEquipmentLighting(): void {
    const level = Math.min(1.5, this.equipment.lightLevel);
    this.U.uLampCol.value.setRGB(0.87, 0.96, 1.0).multiplyScalar(3 * level);
    const lamp = [...this.equipment.devices.values()].find((d) => (d.kind === 'ledLight' || d.kind === 'lightFixture') && d.powered);
    if (lamp) {
      lamp.localToWorld(this.U.uLampPosition.value.set(0, -0.01, 0));
      this.aquariumRoot.worldToLocal(this.U.uLampPosition.value);
      this.U.uLampAxis.value.set(1, 0, 0).transformDirection(lamp.matrixWorld);
      this.lampLight.position.copy(this.U.uLampPosition.value).add(new Vector3(0, TANK_OFFSET_Y + 0.035, 0));
      this.lampLight.target.position.set(this.U.uLampPosition.value.x, TANK_OFFSET_Y, this.U.uLampPosition.value.z);
    }
    this.lampLight.intensity = 1.8 * level;
    this.lighting.sunIntensity = 2.4 * level;
  }

  /** Look at the service side without changing device placement. */
  focusEquipmentRear(): void {
    this.view = 'tank';
    this.startCamera(new Vector3(-0.85, TANK_OFFSET_Y + 0.32, -1.05), new Vector3(0, TANK_OFFSET_Y - 0.08, 0));
  }

  /**
   * The viewpoint itself moves (W/S along the way it looks, A/D sideways), the orbit centre coming along so the
   * angle is kept; up moves vertically. The pace scales with how far the centre is, so close up the steps are fine.
   * The camera stays above the room floor and short of the walls and ceiling.
   */
  panCamera(right: number, forward: number, dt: number, up = 0): void {
    const c = this.controls;
    if (!c || c.enabled === false || (right === 0 && forward === 0 && up === 0)) return;
    const dist = this.camera.position.distanceTo(c.target);
    const pace = (0.12 + 0.75 * dist) * dt;
    // along the floor: the way the camera looks, flattened (looking down, the move is still level)
    const fwd = this.nudgeV.copy(c.target).sub(this.camera.position);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const side = this.nudgeV2.crossVectors(fwd, UP).normalize();
    const move = this.nudgeV3.set(0, 0, 0).addScaledVector(fwd, forward * pace).addScaledVector(side, right * pace);
    // short of the walls: the centre stays within the room
    const lim = 2.4;
    const nx = c.target.x + move.x, nz = c.target.z + move.z;
    move.x = Math.max(-lim, Math.min(lim, nx)) - c.target.x;
    move.z = Math.max(-lim, Math.min(lim, nz)) - c.target.z;
    if (up > 0) move.y = Math.max(0, Math.min(up * pace, 2.8 - this.camera.position.y));
    else if (up < 0) move.y = Math.min(0, Math.max(up * pace, 0.02 - this.camera.position.y));
    this.camera.position.add(move);
    c.target.add(move);
    c.update();
  }

  /** Hang the tools on the shelf. */
  setShelfTools(list: ShelfTool[]): void {
    this.shelf.setTools(list);
  }

  pickTool(ndcX: number, ndcY: number): string | null {
    return this.shelf.pick(ndcX, ndcY, this.camera);
  }

  get viewing(): 'tank' | 'shelf' {
    return this.view;
  }

  /** Turn to the shelf: the camera glides over and the orbit lets go until it is back. */
  focusShelf(): void {
    if (this.view === 'shelf') return;
    this.view = 'shelf';
    const c = this.shelf.center, d = this.shelf.viewDistance;
    // far enough back to take in the whole rack (two and a half metres of nets when every one is owned)
    // a little to the right of the rack's middle, so the rack sits clear of the tools drawer on the right
    this.startCamera(new Vector3(c.x + 0.3, c.y + 0.1 + 0.05 * d, c.z + d), new Vector3(c.x + 0.3, c.y - 0.05, c.z));
  }

  /** Straight to the default tank view, no glide (coming home from the flat). */
  resetView(): void {
    this.view = 'tank';
    this.camT = 1;
    this.frameTank();
    this.camCur.t.set(0, TANK_OFFSET_Y + 0.12, 0);
    if (this.controls) { this.controls.enabled = this.viewInputEnabled; this.controls.target.set(0, TANK_OFFSET_Y + 0.12, 0); this.controls.update(); }
  }

  focusTank(): void {
    if (this.view === 'tank') return;
    this.view = 'tank';
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    const dist = (TANK_W / 0.66) / (2 * Math.tan(hfov / 2));
    this.startCamera(new Vector3(dist * 0.35, TANK_OFFSET_Y + 0.16 + dist * 0.28, dist * 0.95), new Vector3(0, TANK_OFFSET_Y + 0.12, 0));
  }

  private startCamera(p: Vector3, t: Vector3): void {
    this.camFrom.p.copy(this.camera.position);
    this.camFrom.t.copy(this.controls ? this.controls.target : this.camCur.t);
    this.camTo.p.copy(p);
    this.camTo.t.copy(t);
    this.camT = 0;
    if (this.controls) this.controls.enabled = false;
  }

  /** The glide between the tank and the shelf; the orbit takes over again at the tank. */
  private stepCamera(dt: number): void {
    if (this.camT >= 1) return;
    this.camT = Math.min(1, this.camT + dt / 0.9);
    const u = this.camT, s = u * u * (3 - 2 * u);
    this.camera.position.lerpVectors(this.camFrom.p, this.camTo.p, s);
    this.camCur.t.lerpVectors(this.camFrom.t, this.camTo.t, s);
    this.camera.lookAt(this.camCur.t);
    if (this.camT >= 1 && this.view === 'tank' && this.controls) {
      this.controls.target.copy(this.camTo.t);
      this.controls.enabled = this.viewInputEnabled;
      this.controls.update();
    }
  }

  /** Everything stands still (the edit screen): only the camera moves. */
  updateFrozen(): void {
    this.equipment.updateFrozen(this.camera);
    this.updateEquipmentLighting();
    if (this.camT < 1) this.stepCamera(1 / 60);
    else if (this.view === 'tank') this.controls?.update();
  }

  update(dt: number, simScale: number): void {
    if (this.camT < 1) this.stepCamera(dt);
    else if (this.view === 'shelf') this.camera.lookAt(this.camCur.t);
    else this.controls?.update();
    this.equipment.update(dt, this.camera, this.gl.domElement.height);
    this.updateEquipmentLighting();
    this.turb = Math.min(1, 0.15 + this.equipment.flows.reduce((a, f) => a + f.flowRate / 1800, 0));
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
      const S = o.ind.length_mm / 1000;
      const hx = TANK_W / 2 - 0.01 - S * 0.55, hz = TANK_D / 2 - 0.01 - S * 0.55;
      d.update(dt, { floor: this.floor, player: new Vector3(0, 1, 2), simScale, nowMs: Date.now(), bounds: { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz }, canBurrow: this.sandTop > 0 });
      if (o.hero) o.hero.update(this.camera, d.openings ?? { mouth: 0, gill: 0 });
      o.ind.pos.x = Math.max(-hx, Math.min(hx, o.ind.pos.x));
      o.ind.pos.z = Math.max(-hz, Math.min(hz, o.ind.pos.z));
      o.root.position.x = Math.max(-hx, Math.min(hx, o.root.position.x));
      o.root.position.z = Math.max(-hz, Math.min(hz, o.root.position.z));
    }
  }

  dispose(): void {
    this.equipment.dispose();
    this.deactivate();
    this.clearOccupants();
    this.gpu?.dispose();
    this.flatWater.dispose();
    this.surfRT?.dispose();
    this.causRT?.dispose();
  }
}

/** The view out of the window: a night sky over the bay, a few lights on the far shore, a moon. */
function makeNightWindow(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 352;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 352);
  sky.addColorStop(0, '#0b1626'); sky.addColorStop(0.55, '#16304a'); sky.addColorStop(0.62, '#0f2436'); sky.addColorStop(1, '#071018');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 352);
  // stars
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 70; i++) { const x = (i * 97) % 512, y = (i * 61) % 180; g.fillRect(x, y, 1.2, 1.2); }
  // the moon
  g.fillStyle = '#f2ead6'; g.beginPath(); g.arc(400, 60, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#16304a'; g.beginPath(); g.arc(392, 56, 14, 0, Math.PI * 2); g.fill();
  // the far shore and its lights
  g.fillStyle = '#0a1620'; g.fillRect(0, 205, 512, 20);
  for (let i = 0; i < 40; i++) { const x = (i * 131 + 20) % 500, w = 2 + (i % 3); g.fillStyle = i % 4 === 0 ? 'rgba(255,200,120,0.9)' : 'rgba(255,230,180,0.6)'; g.fillRect(x, 212 + (i % 2) * 3, w, 2); }
  // the water with the lights' reflections
  const sea = g.createLinearGradient(0, 225, 0, 352);
  sea.addColorStop(0, '#0d2535'); sea.addColorStop(1, '#050b10');
  g.fillStyle = sea; g.fillRect(0, 225, 512, 127);
  for (let i = 0; i < 40; i++) { const x = (i * 131 + 20) % 500; g.fillStyle = 'rgba(255,220,160,0.12)'; for (let k = 0; k < 6; k++) g.fillRect(x - k, 228 + k * 9, 2 + k, 1.5); }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
