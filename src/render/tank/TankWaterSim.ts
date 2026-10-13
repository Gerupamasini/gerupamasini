import {
  Camera, ClampToEdgeWrapping, Color, CustomBlending, DataTexture, DoubleSide, FloatType, HalfFloatType, LinearFilter,
  LinearMipmapLinearFilter, Mesh, OneFactor, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType,
  WebGLRenderTarget, type IUniform, type WebGLRenderer,
} from 'three';
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js';
import { TANK_COMMON } from './glsl';

/** ripple grid: 3 mm cells on the 60 cm tank */
export const SIM: [number, number] = [192, 96];
/** caustics texture: 1.2 mm texels on the 60 cm tank */
export const CAUS: [number, number] = [512, 256];
const NW = 20;
const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

interface Wave { kx: number; kz: number; w: number; ph: number; a: number; short: boolean; f1: number; f2: number; p1: number; p2: number }
/** 20 waves from 25 cm down to 2.5 cm long, heading every which way, so the surface is short-crested and the caustics a net */
function makeWaves(): Wave[] {
  let s = 5;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: Wave[] = [];
  for (let i = 0; i < NW; i++) {
    const len = 0.25 * (0.025 / 0.25) ** (i / (NW - 1)), k = (2 * Math.PI) / len, dir = i * 2.39996 + (rnd() - 0.5) * 0.9;
    out.push({
      kx: k * Math.cos(dir), kz: k * Math.sin(dir), w: Math.sqrt(9.81 * k + 7.3e-5 * k ** 3) * 0.7, ph: rnd() * 6.283,
      a: Math.min(2.4 / (k * k), 0.0009) * (0.6 + 0.8 * rnd()), short: len < 0.08,
      f1: 0.05 + 0.22 * rnd(), f2: 0.09 + 0.3 * rnd(), p1: rnd() * 6.283, p2: rnd() * 6.283,
    });
  }
  return out;
}

export interface WaterFlowLike { position: { x: number; z: number }; direction: { x: number; z: number }; flowRate: number; radius: number }

/**
 * The tank's surface, after CAUSTIC//LITE (scottiefox/caustic-volume, MIT): a random sea of small waves plus a GPU
 * ripple simulation; once a frame the surface (height and slope) is drawn into one texture, and a caustics texture
 * is redrawn by sending the bar's light from a grid on the surface through the water to the sand. Without float
 * render targets the water stays flat and dark under the bar.
 */
export class TankWaterSim {
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
  private readonly flat: DataTexture;
  private readonly prevClear = new Color();
  private simAcc = 0;
  private acc = 0;
  private gustAcc = 0;
  private causTick = 0;
  private time = 0;
  private half = { x: 0.3, z: 0.15 };
  /** whether the surface moves at all (the tier's update rate is 0 when it does not) */
  hz = 60;
  /** 超軽量: the ripples step at most twice a frame and the caustics are redrawn every other frame */
  lite = false;
  /** how lively the surface is: the swell's size, and the turbulence (the flows) */
  swell = 0.8;
  turb = 0.5;

  /** `U` is the tank's shared uniform block: the simulation writes the surface and caustics textures into it. */
  constructor(private readonly gl: WebGLRenderer, private readonly U: Record<string, IUniform>) {
    const zero = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
    zero.needsUpdate = true;
    this.flat = zero;
    Object.assign(U, {
      uW: { value: this.waveU }, uA: { value: this.ampU }, uJets: { value: this.jetU }, uJetValues: { value: this.jetValues },
      uSim: { value: zero }, uSurf: { value: zero }, uCaus: { value: zero }, uCausScale: { value: 1 },
    });
    this.waves.forEach((W, i) => this.waveU.set([W.kx, W.kz, W.w, W.ph], i * 4));
    const floatOK = gl.capabilities.isWebGL2 && (gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float'));
    if (!floatOK) return;
    try {
      const gpu = new GPUComputationRenderer(SIM[0], SIM[1], gl);
      gpu.setDataType(HalfFloatType);
      // the ripple simulation: a height field (mm); each cell moves toward the average of its neighbours and overshoots
      // (the wave equation); ClampToEdge sampling makes the glass reflect the ripples; splashes add a bump
      const sim = gpu.addVariable('heightmap', /* glsl */ `
        uniform vec2 uTankHalf;
        uniform vec4 uDrops[8];   // splashes: x, z, radius (m), height (mm)
        void main() {
          vec2 cell = 1.0 / resolution.xy, uv = gl_FragCoord.xy * cell;
          vec4 c = texture2D(heightmap, uv);
          float nb = texture2D(heightmap, uv + vec2(0.0, cell.y)).r + texture2D(heightmap, uv - vec2(0.0, cell.y)).r
                   + texture2D(heightmap, uv + vec2(cell.x, 0.0)).r + texture2D(heightmap, uv - vec2(cell.x, 0.0)).r;
          float h = (nb * 0.5 - c.g) * 0.992;
          vec2 p = (uv - 0.5) * (2.0 * uTankHalf);
          for (int i = 0; i < 8; i++) { vec2 q = (p - uDrops[i].xy) / uDrops[i].z; h += uDrops[i].w * exp(-dot(q, q)); }
          gl_FragColor = vec4(h, c.r, 0.0, 1.0);
        }`, gpu.createTexture());
      gpu.setVariableDependencies(sim, [sim]);
      sim.minFilter = sim.magFilter = LinearFilter;
      sim.material.uniforms.uDrops = { value: this.dropU };
      sim.material.uniforms.uTankHalf = U.uTankHalf;
      const err = gpu.init();
      if (err) throw new Error(err);
      // once a frame: the waves plus the ripples, with their slopes, into one texture every water shader reads
      const surfRT = gpu.createRenderTarget(0, 0, ClampToEdgeWrapping, ClampToEdgeWrapping, LinearFilter, LinearFilter);
      const surfMat = gpu.createShaderMaterial(/* glsl */ `
        uniform float uTime;
        uniform vec2 uTankHalf;
        uniform vec4 uW[${NW}];     // per wave: direction * wavenumber, angular speed, phase
        uniform float uA[${NW}];    // per wave: height now (m)
        uniform sampler2D uSim;
        uniform vec4 uJets[4];
        uniform vec2 uJetValues[4];
        void main() {
          vec2 uv = gl_FragCoord.xy / resolution.xy, e = 1.0 / resolution.xy, p = (uv - 0.5) * (2.0 * uTankHalf);
          vec3 w = vec3(0.0);
          for (int i = 0; i < ${NW}; i++) {   // each wave's crests are bent by a slower wave running along them
            vec2 kd = uW[i].xy, side = vec2(-kd.y, kd.x) / length(kd);
            float kb = 0.37 * length(kd), pb = kb * dot(side, p) + 0.9 * uTime + 7.1 * float(i);
            float ph = dot(kd, p) - uW[i].z * uTime + uW[i].w + 1.6 * sin(pb);
            w += uA[i] * vec3(sin(ph), cos(ph) * (kd + 1.6 * kb * cos(pb) * side));
          }
          // equipment outlets send a small directional disturbance into the height field
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
          gl_FragColor = vec4(w + 0.001 * vec3(h, hx * resolution.x / (4.0 * uTankHalf.x), hz * resolution.y / (4.0 * uTankHalf.y)), 1.0);
        }`, { uTankHalf: U.uTankHalf, uTime: U.uTime, uW: U.uW, uA: U.uA, uSim: U.uSim, uJets: U.uJets, uJetValues: U.uJetValues });
      // caustics: every vertex of a grid on the surface sends the bar's light through the water to the sand, and the
      // grid is drawn where the rays land; a surface cell landing on a smaller patch concentrates its light (the area
      // ratio from screen-space derivatives), and overlapping patches add up
      const halfFloat = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
      const causRT = new WebGLRenderTarget(CAUS[0], CAUS[1], {
        type: halfFloat ? HalfFloatType : UnsignedByteType, depthBuffer: false, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, generateMipmaps: true,
      });
      U.uCausScale.value = halfFloat ? 1 : 4;
      const causMesh = new Mesh(new PlaneGeometry(2 * this.half.x, 2 * this.half.z, SIM[0], SIM[1]).rotateX(-Math.PI / 2), new ShaderMaterial({
        uniforms: U, side: DoubleSide, depthTest: false, depthWrite: false, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor,
        vertexShader: TANK_COMMON + /* glsl */ `
          varying vec2 vSurf; varying vec3 vI;
          void main() {
            vec3 w = wave(position.xz), P = vec3(position.x, uWaterLevel + w.x, position.z), n = normalOf(w);
            vec3 L; float E = lampAt(P, L);
            vec3 Lin = -L, r = refract(Lin, n, 1.0 / W_IOR);
            float t = (P.y - uFloorY) / max(-r.y, 0.05);
            vec3 F = P + r * t;
            vI = vec3(E * max(-Lin.y, 0.0) * (1.0 - fresnel(dot(-Lin, n)))) * exp(-uAbsorb * t);
            vSurf = position.xz;
            gl_Position = vec4(F.x / uTankHalf.x, F.z / uTankHalf.y, 0.0, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec2 uTankHalf;
          varying vec2 vSurf; varying vec3 vI;
          void main() {
            vec2 a = dFdx(vSurf), b = dFdy(vSurf);
            gl_FragColor = vec4(vI * min(abs(a.x * b.y - a.y * b.x) / (4.0 * uTankHalf.x * uTankHalf.y / ${f(CAUS[0] * CAUS[1])}), 40.0) / ${f(halfFloat ? 1 : 4)}, 1.0);
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

  /** whether the surface really moves (float targets and a tier that updates it) */
  get live(): boolean { return !!this.gpu && this.hz > 0; }

  setDimensions(width: number, depth: number): void {
    this.half = { x: width / 2, z: depth / 2 };
    for (const m of this.causScene.children) if (m instanceof Mesh) { m.geometry.dispose(); m.geometry = new PlaneGeometry(width, depth, SIM[0], SIM[1]).rotateX(-Math.PI / 2); }
    this.drops.length = 0; this.simAcc = 0; this.acc = 0;
  }

  /** The tier's update rate; 0 freezes the water flat. */
  setRate(hz: number): void {
    this.hz = hz; this.acc = 0;
    this.U.uSurf.value = hz ? this.surfRT?.texture ?? this.flat : this.flat;
    this.U.uCaus.value = hz ? this.causRT?.texture ?? this.flat : this.flat;
  }

  /** A splash at (x, z): a ripple spreads from it. */
  addRipple(x: number, z: number, heightMm = 3, radius = 0.012): void {
    if (Math.abs(x) > this.half.x || Math.abs(z) > this.half.z || this.drops.length > 32) return;
    this.drops.push([x, z, radius, heightMm]);
  }

  step(dt: number, flows: readonly WaterFlowLike[]): void {
    if (!this.hz) { this.drops.length = 0; return; }
    this.acc += dt;
    if (this.acc < 1 / this.hz) return;
    dt = this.acc; this.acc = 0;
    this.time += dt;
    this.U.uTime.value = this.time;
    this.jetU.fill(0); this.jetValues.fill(0);
    for (let i = 0; i < flows.length && i < 4; i++) {
      const flow = flows[i];
      this.jetU[i * 4] = flow.position.x; this.jetU[i * 4 + 1] = flow.position.z; this.jetU[i * 4 + 2] = flow.direction.x; this.jetU[i * 4 + 3] = flow.direction.z;
      this.jetValues[i * 2] = Math.min(1, flow.flowRate / 600); this.jetValues[i * 2 + 1] = flow.radius;
    }
    // each wave's height now: its own slow cycle, scaled by how lively the tank is
    const swing = 0.35 + 0.55 * this.turb;
    for (let i = 0; i < NW; i++) {
      const W = this.waves[i];
      this.ampU[i] = W.a * Math.max(0.1, 1 + swing * (0.6 * Math.sin(W.f1 * this.time + W.p1) + 0.4 * Math.sin(W.f2 * this.time + W.p2)))
        * this.swell * (W.short ? 0.3 + 1.4 * this.turb : 1);
    }
    // now and then a tiny gust somewhere
    for (this.gustAcc += dt * 0.4 * this.turb; this.gustAcc >= 1; this.gustAcc -= 1)
      this.addRipple((Math.random() * 2 - 1) * this.half.x * 0.9, (Math.random() * 2 - 1) * this.half.z * 0.9, (Math.random() < 0.5 ? -1 : 1) * 0.3, 0.02 + 0.03 * Math.random());
    if (!this.gpu || !this.sim || !this.surfMat || !this.surfRT || !this.causRT) { this.drops.length = 0; return; }
    // a fixed 60 Hz step, with the catch-up capped
    this.simAcc = Math.min(this.simAcc + dt, 0.1);
    for (let steps = 0; this.simAcc >= 1 / 60 && steps < (this.lite ? 2 : 6); steps++, this.simAcc -= 1 / 60) {
      for (let i = 0; i < 8; i++) {
        const d = this.drops.length ? this.drops.shift()! : null;
        if (d) this.dropU.set(d, i * 4); else { this.dropU[i * 4] = 0; this.dropU[i * 4 + 1] = 0; this.dropU[i * 4 + 2] = 1; this.dropU[i * 4 + 3] = 0; }
      }
      this.gpu.compute();
    }
    if (this.lite) this.simAcc = Math.min(this.simAcc, 1 / 60);
    this.U.uSim.value = this.gpu.getCurrentRenderTarget(this.sim).texture;
    this.gpu.doRenderTarget(this.surfMat, this.surfRT);
    // redraw the caustics (the lite tank every other frame)
    if (this.lite && (this.causTick++ & 1)) return;
    const gl = this.gl, prevRT = gl.getRenderTarget(), prevAlpha = gl.getClearAlpha();
    gl.getClearColor(this.prevClear);
    gl.setRenderTarget(this.causRT);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(this.causScene, this.flatCam);
    gl.setClearColor(this.prevClear, prevAlpha);
    gl.setRenderTarget(prevRT);
  }

  dispose(): void {
    this.gpu?.dispose();
    this.flat.dispose();
    this.surfRT?.dispose();
    this.causRT?.dispose();
    for (const m of this.causScene.children) if (m instanceof Mesh) { m.geometry.dispose(); (m.material as ShaderMaterial).dispose(); }
  }
}
