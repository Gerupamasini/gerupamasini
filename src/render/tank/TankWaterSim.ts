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

/** An outlet: where it is and where it points (in the room), its rate (L/h), and how much of it reaches the surface (0–1) */
export interface WaterFlowLike { position: { x: number; z: number }; direction: { x: number; z: number }; flowRate: number; radius: number; surface: number }

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
  private readonly jetAcc = new Float32Array(4);
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
  /**
   * How stirred the surface is: 0 is still water (the faintest swell, the bubbles' rings), 1 strong flows at the
   * surface. It follows the outlets over a second or so, so the water settles after a pump is switched off.
   */
  stir = 0;

  /** `U` is the tank's shared uniform block: the simulation writes the surface and caustics textures into it. */
  constructor(private readonly gl: WebGLRenderer, private readonly U: Record<string, IUniform>) {
    const zero = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
    zero.needsUpdate = true;
    this.flat = zero;
    Object.assign(U, {
      uW: { value: this.waveU }, uA: { value: this.ampU }, uJets: { value: this.jetU }, uJetValues: { value: this.jetValues }, uStir: { value: 0 },
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
          // the outlets: a jet near the surface drags short waves downstream in a plume that wanders from side to side;
          // a shower falling onto the surface sends rings out from where it lands
          for (int i = 0; i < 4; i++) {
            float s = uJetValues[i].x;
            if (s <= 0.0) continue;
            vec2 q = p - uJets[i].xy, dir = uJets[i].zw;
            float len = length(dir), r = max(uJetValues[i].y, 0.03), pour = 1.0 - clamp(len * 1.5, 0.0, 1.0);
            dir = len > 1e-3 ? dir / len : vec2(1.0, 0.0);
            vec2 side = vec2(-dir.y, dir.x), radial = q / (length(q) + 1e-3);
            float u = dot(q, dir), v = dot(q, side);
            float lu = mix(u > 0.0 ? 2.5 * r : 0.5 * r, r, pour), lv = mix(0.7 * r, r, pour);
            float env = exp(-u * u / (lu * lu) - v * v / (lv * lv));
            vec2 dEnv = -2.0 * env * (u / (lu * lu) * dir + v / (lv * lv) * side);
            float x = mix(u, length(q), pour), wob = (1.0 - pour) * 1.2 * sin(v * 35.0 + uTime * 1.3);
            vec2 dX = mix(dir, radial, pour), dWob = (1.0 - pour) * 42.0 * cos(v * 35.0 + uTime * 1.3) * side;
            float ph1 = x * 75.0 - uTime * 8.0 + wob, ph2 = x * 128.0 - uTime * 12.5 - 1.7 * wob;
            float a1 = s * mix(0.0012, 0.0018, pour), a2 = s * mix(0.0006, 0.0009, pour);
            w += a1 * vec3(env * sin(ph1), dEnv * sin(ph1) + env * cos(ph1) * (75.0 * dX + dWob));
            w += a2 * vec3(env * sin(ph2), dEnv * sin(ph2) + env * cos(ph2) * (128.0 * dX - 1.7 * dWob));
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

  /** One frame. `flows` are the running outlets, placed in the room; `origin` is the tank's floor centre there. */
  step(dt: number, flows: readonly WaterFlowLike[], origin: { x: number; z: number }): void {
    if (!this.hz) { this.drops.length = 0; return; }
    this.acc += dt;
    if (this.acc < 1 / this.hz) return;
    dt = this.acc; this.acc = 0;
    this.time += dt;
    this.U.uTime.value = this.time;
    this.jetU.fill(0); this.jetValues.fill(0);
    let stir = 0;
    for (let i = 0; i < flows.length; i++) {
      const f = flows[i], s = Math.min(1.5, f.flowRate / 600) * f.surface;
      stir += s;
      if (i >= 4) continue;
      const x = f.position.x - origin.x, z = f.position.z - origin.z, dx = f.direction.x, dz = f.direction.z;
      this.jetU[i * 4] = x; this.jetU[i * 4 + 1] = z; this.jetU[i * 4 + 2] = dx; this.jetU[i * 4 + 3] = dz;
      this.jetValues[i * 2] = s; this.jetValues[i * 2 + 1] = f.radius;
      // the outlet churns the surface: a shower splashes where it lands, a jet breaks into ripples downstream
      const len = Math.hypot(dx, dz), pour = len < 0.5;
      for (this.jetAcc[i] += dt * (pour ? 24 : 10) * s; this.jetAcc[i] >= 1; this.jetAcc[i] -= 1) {
        if (pour) {
          const a = Math.random() * 6.283, r = 0.025 * Math.sqrt(Math.random());
          this.addRipple(x + Math.cos(a) * r, z + Math.sin(a) * r, -(0.4 + 0.5 * Math.random()) * s, 0.006 + 0.006 * Math.random());
        } else {
          const u = 0.02 + Math.random() * f.radius * 1.5, v = (Math.random() - 0.5) * f.radius * 0.6;
          this.addRipple(x + (dx * u - dz * v) / len, z + (dz * u + dx * v) / len, (Math.random() < 0.5 ? -1 : 1) * (0.25 + 0.3 * Math.random()) * s, 0.01 + 0.01 * Math.random());
        }
      }
    }
    this.stir += (Math.min(1, stir) - this.stir) * Math.min(1, dt * 1.5);
    this.U.uStir.value = this.stir;
    // each wave's height now: its own slow cycle. Still water keeps only a faint swell; the flows raise it, the short
    // chop most (the outlets' own plumes above are stronger still: the movement comes from them)
    const swell = 0.12 + 0.35 * this.stir, swing = 0.3 + 0.6 * this.stir, chop = 0.3 + 0.8 * this.stir;
    for (let i = 0; i < NW; i++) {
      const W = this.waves[i];
      this.ampU[i] = W.a * Math.max(0.1, 1 + swing * (0.6 * Math.sin(W.f1 * this.time + W.p1) + 0.4 * Math.sin(W.f2 * this.time + W.p2)))
        * swell * (W.short ? chop : 1);
    }
    // a stirred tank: now and then a tiny gust somewhere
    for (this.gustAcc += dt * 0.6 * this.stir; this.gustAcc >= 1; this.gustAcc -= 1)
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
