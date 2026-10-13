import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, Vector3, type Object3D, type WebGLRenderer } from 'three';
import type { DriverContext, Floor } from '../drivers/Driver';
import type { WaterMotion, WaterSample } from '../physics/water';

/**
 * The sand a fish or a ray throws about, shared by every animal under a parent group (one draw for all of them):
 *
 *   silt    the fine sediment kicked into suspension: a soft, billowing cloud that rises with the throw, slows at once in
 *           the water, swells as it spreads and sinks back slowly, going to and fro with the swell (the water's motion,
 *           physics/water.ts) and lingering longer over mud than over clean sand.
 *   grains  the coarse sand thrown with it: small specks that fly out, slow, fall straight back within a second and
 *           lie still on the bed (seen only up close, where they make a throw read as sand rather than smoke).
 *   ink     a cloud that hangs in the water instead of settling (the ミミイカ's ink).
 *
 * All in the parent's frame (the bed's, which the raised home tank and the case only translate), lit by the scene's own
 * lights with a little forward scatter toward the sun; where a cloud meets the bed it fades out instead of being cut by
 * it. The drivers emit through a DustSource each (the sediment's colour and kind where the animal is); the layer moves
 * on the simulation's clock (the observation view's slow motion slows it too), stepped once a frame by whichever near
 * animal reports first, and on the screen's clock when none does.
 */

/** set by the app from the quality preset: off on 超軽量 (with the contact shadows), thinner on 低 */
export const SAND_DUST = { enabled: true, amount: 1 };

const CAPACITY = 2048;
const KIND_CLOUD = 0, KIND_GRAIN = 1;

const VERT = /* glsl */ `
attribute vec4 aDust;   // x diameter (m), y opacity, z seed (drifts with age: the billows boil), w height of the centre over the bed (m)
attribute vec4 aTint;   // rgb the sediment's colour (linear), w kind (0 cloud, 1 grain)
uniform float uScale;   // pixels per metre at a distance of 1 m
uniform float uMaxPx;
varying vec4 vTint;
varying float vAlpha;
varying float vSeed;
varying float vH;
varying float vR;
varying vec2 vUpY;      // the world height of the sprite's right and up (per metre across it)
varying vec3 vView;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float d = max(0.005, -mvPosition.z);
  float px = aDust.x * uScale / d;
  float a = aDust.y;
  if (aTint.w > 0.5) {
    // a grain smaller than a pixel keeps its light, spread over the pixel
    float c = min(1.0, px / 1.5);
    a *= c * c;
    px = max(px, 1.5);
  } else {
    // the eye inside a cloud sees through it; and a cloud past the largest point the GPU draws fades rather than shrinks
    a *= smoothstep(0.5, 1.5, d / max(aDust.x, 1e-4));
    a *= clamp(2.0 - px / uMaxPx, 0.0, 1.0);
  }
  if (a < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  gl_PointSize = min(px, uMaxPx);
  vTint = aTint;
  vAlpha = a;
  vSeed = aDust.z;
  vH = aDust.w;
  vR = 0.5 * aDust.x * gl_PointSize / px;
  vUpY = vec2(viewMatrix[1][0], viewMatrix[1][1]);
  vView = mvPosition.xyz;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <lights_pars_begin>
#include <fog_pars_fragment>
varying vec4 vTint;
varying float vAlpha;
varying float vSeed;
varying float vH;
varying float vR;
varying vec2 vUpY;
varying vec3 vView;
float dh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dh(i), dh(i + vec2(1.0, 0.0)), f.x), mix(dh(i + vec2(0.0, 1.0)), dh(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y = -c.y;                                   // (+y up the screen)
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  // the light on it: the sky and the bed's bounce, the sun, and the sun's glow through a thin cloud seen against it
  vec3 irr = ambientLightColor;
  vec3 V = normalize(vView);
  float glow = 0.0;
  #if NUM_HEMI_LIGHTS > 0
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) irr += mix(hemisphereLights[i].groundColor, hemisphereLights[i].skyColor, 0.75);
  #endif
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    irr += directionalLights[i].color * 0.85;
    glow += pow(max(dot(V, directionalLights[i].direction), 0.0), 6.0) * dot(directionalLights[i].color, vec3(0.3333));
  }
  #endif
  float a;
  vec3 col;
  float s = fract(vSeed);
  if (vTint.w > 0.5) {
    // a grain: a hard little speck; now and then a pale one (quartz, a bit of shell)
    a = vAlpha * (1.0 - smoothstep(0.35, 1.0, r2));
    float k = dh(vec2(s * 91.0, 3.7));
    col = vTint.rgb * (0.9 + 0.4 * k + (k > 0.9 ? 0.8 : 0.0)) * irr * RECIPROCAL_PI * 1.5;
  } else {
    // a cloud: billows (two octaves of noise turned to the puff's own angle, boiling slowly as it ages) eat its edge
    float ang = vSeed * 6.2832;
    vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * c;
    float n = 0.65 * dn(q * 2.0 + vec2(vSeed * 7.0, vSeed * 3.0)) + 0.35 * dn(q * 4.6 - vec2(vSeed * 4.0, s * 23.0));
    float body = 1.0 - r2;
    float dens = clamp(body * (0.7 + 0.6 * n) * 1.25 - 0.12, 0.0, 1.0);
    a = vAlpha * dens * sqrt(dens);
    // where it meets the bed it thins out to nothing (the sprite stands upright; the bed would cut it in a hard line)
    float h = vH + vR * (c.x * vUpY.x + c.y * vUpY.y);
    a *= smoothstep(0.0, 0.35 * vR, h);
    // the fines and the bits of detritus that hang in the water are darker and browner than the washed sand they come
    // out of: over the bed a cloud reads as a murky veil, against the open water as a paler haze. Lit from above, its
    // core in its own shade, and glowing where the eye looks toward the sun through its thin edge.
    float top = 0.8 + 0.35 * (0.5 + 0.5 * c.y);
    vec3 alb = vTint.rgb * vec3(0.9, 0.87, 0.8);
    col = alb * irr * RECIPROCAL_PI * 1.65 * top * (1.0 - 0.35 * dens);
    col += alb * glow * (1.0 - dens) * 0.6;
  }
  if (a < 0.002) discard;
  gl_FragColor = vec4(col, min(a, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** what a puff is made of and how it moves */
interface Make {
  kind: number;
  /** the sediment's colour (linear) */
  r: number; g: number; b: number;
  /** its sinking speed (m/s), the share of the water's motion it follows, how fast the water slows it (1/s) */
  settle: number; carry: number; drag: number;
  /** how much the cloud swells over its life (end size / start size, mean) */
  grow: number;
}

/** The dust drawn under one parent group: a pool of particles in one Points draw. */
export class SandDust {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly pos = new Float32Array(CAPACITY * 3);
  private readonly dust = new Float32Array(CAPACITY * 4);
  private readonly tint = new Float32Array(CAPACITY * 4);
  private readonly vel = new Float32Array(CAPACITY * 3);
  /** the water's velocity at the particle (refreshed a share of the particles a frame) */
  private readonly flow = new Float32Array(CAPACITY * 3);
  /** age, life, start size, end size */
  private readonly life = new Float32Array(CAPACITY * 4);
  /** settle, carry, drag, peak opacity */
  private readonly phys = new Float32Array(CAPACITY * 4);
  /** the bed under it (m) */
  private readonly bed = new Float32Array(CAPACITY);
  private n = 0;
  private frame = 0;
  private readonly attrs: BufferAttribute[];
  private floor: Floor | null = null;
  private water: WaterMotion | null = null;
  private readonly ws: WaterSample = { ux: 0, uy: 0, uz: 0, bed: 0, surface: 0 };
  /** the source that steps the layer this frame, and when it last did (ms, screen clock) */
  private leader: DustSource | null = null;
  private leaderSeen = -1e9;
  private leaderDt = 0;
  private lastDraw = -1;
  private readonly size = new Vector2();
  private maxPx = 0;

  constructor() {
    const g = new BufferGeometry();
    const p = new BufferAttribute(this.pos, 3), d = new BufferAttribute(this.dust, 4), t = new BufferAttribute(this.tint, 4);
    for (const a of [p, d, t]) a.setUsage(DynamicDrawUsage);
    g.setAttribute('position', p);
    g.setAttribute('aDust', d);
    g.setAttribute('aTint', t);
    g.setDrawRange(0, 0);
    this.attrs = [p, d, t];
    const mat = new ShaderMaterial({
      name: 'SandDust', vertexShader: VERT, fragmentShader: FRAG, lights: true, fog: true, transparent: true, depthWrite: false,
      uniforms: UniformsUtils.merge([UniformsLib.lights, UniformsLib.fog, { uScale: { value: 600 }, uMaxPx: { value: 256 } }]),
    });
    this.points = new Points(g, mat);
    this.points.name = 'SandDust';
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.points.visible = false;
    this.points.onBeforeRender = (renderer: WebGLRenderer, _s, camera) => {
      // (with no near animal stepping it, it goes on by the screen's clock)
      const now = performance.now();
      if (this.lastDraw >= 0 && now - this.leaderSeen > 250 && now > this.lastDraw) this.step(Math.min(0.05, (now - this.lastDraw) / 1000));
      this.lastDraw = now;
      if (!this.maxPx) {
        const gl = renderer.getContext();
        const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
        this.maxPx = Math.max(64, Math.min(512, range?.[1] ?? 256));
      }
      renderer.getDrawingBufferSize(this.size);
      const proj = (camera as unknown as { projectionMatrix: { elements: number[] } }).projectionMatrix.elements;
      const u = this.points.material.uniforms;
      u.uScale.value = proj[5] * this.size.y * 0.5;
      u.uMaxPx.value = this.maxPx;
      this.points.material.uniformsNeedUpdate = true;
    };
  }

  /** particles alive */
  get count(): number { return this.n; }

  /** a source for one animal */
  source(rnd: () => number = Math.random): DustSource {
    return new DustSource(this, rnd);
  }

  /** drop every particle (a viewer starting a new scene) */
  clear(): void {
    this.n = 0;
    this.points.geometry.setDrawRange(0, 0);
    this.points.visible = false;
  }

  /**
   * @internal a source's step. The layer moves once a frame, by one source: the first to report, or one that reports
   * more often (a far animal is updated every 2nd or 4th frame with the time of all of them), or any when that one
   * has gone quiet.
   */
  tick(src: DustSource, dt: number, floor: Floor, water: WaterMotion | null): void {
    this.floor = floor;
    this.water = water;
    const now = performance.now();
    if (this.leader !== src && (!this.leader || now - this.leaderSeen > 250 || (dt > 0 && dt < this.leaderDt * 0.75))) this.leader = src;
    if (this.leader !== src) return;
    this.leaderSeen = now;
    this.leaderDt = dt;
    if (dt > 0) this.step(Math.min(0.1, dt));
  }

  /** @internal */
  forget(src: DustSource): void {
    if (this.leader === src) { this.leader = null; this.leaderSeen = -1e9; }
  }

  /**
   * @internal `count` puffs at `at` (spread over a disc of radius `spread`), thrown with `vel` (m/s, each a little
   * more or less) plus a scatter that grows with the spread; `size` the start diameter (m), `life` (s), `alpha` the peak.
   */
  emit(m: Make, at: Vector3, vel: Vector3, count: number, spread: number, size: number, life: number, alpha: number, rnd: () => number): void {
    for (let k = 0; k < count && this.n < CAPACITY; k++) {
      const i = this.n++;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread;
      const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = at.y + rnd() * spread * 0.3;
      this.pos[i * 3 + 2] = z;
      const j = 0.6 + 0.8 * rnd();
      this.vel[i * 3] = vel.x * j + (rnd() - 0.5) * spread * 1.5;
      this.vel[i * 3 + 1] = vel.y * j + rnd() * spread * 0.8;
      this.vel[i * 3 + 2] = vel.z * j + (rnd() - 0.5) * spread * 1.5;
      this.flow[i * 3] = this.flow[i * 3 + 1] = this.flow[i * 3 + 2] = 0;
      const L = this.life;
      L[i * 4] = 0;
      L[i * 4 + 1] = life * (0.6 + 0.8 * rnd());
      const s0 = m.kind === KIND_GRAIN ? size * (0.6 + 0.8 * rnd()) : size * (0.5 + 0.5 * rnd());
      L[i * 4 + 2] = s0;
      L[i * 4 + 3] = m.kind === KIND_GRAIN ? s0 : size * m.grow * (0.75 + 0.5 * rnd());
      const P = this.phys;
      P[i * 4] = m.settle * (0.7 + 0.6 * rnd());
      P[i * 4 + 1] = m.carry;
      P[i * 4 + 2] = m.drag * (0.85 + 0.3 * rnd());
      P[i * 4 + 3] = alpha;
      const v = 0.94 + 0.12 * rnd();
      this.tint[i * 4] = m.r * v;
      this.tint[i * 4 + 1] = m.g * v;
      this.tint[i * 4 + 2] = m.b * v;
      this.tint[i * 4 + 3] = m.kind;
      this.dust[i * 4] = s0;
      this.dust[i * 4 + 1] = 0;
      this.dust[i * 4 + 2] = rnd() * 50;
      this.bed[i] = this.floor ? this.floor.heightAt(x, z) : -1e3;
      this.dust[i * 4 + 3] = this.pos[i * 3 + 1] - this.bed[i];
    }
    if (this.n > 0) this.points.visible = true;
  }

  /** the last particle into slot i */
  private remove(i: number): void {
    const j = --this.n;
    if (i === j) return;
    const c3 = (a: Float32Array) => { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; };
    const c4 = (a: Float32Array) => { a[i * 4] = a[j * 4]; a[i * 4 + 1] = a[j * 4 + 1]; a[i * 4 + 2] = a[j * 4 + 2]; a[i * 4 + 3] = a[j * 4 + 3]; };
    c3(this.pos); c3(this.vel); c3(this.flow);
    c4(this.dust); c4(this.tint); c4(this.life); c4(this.phys);
    this.bed[i] = this.bed[j];
  }

  /** move every particle by dt (s) */
  step(dt: number): void {
    if (this.n === 0 || dt <= 0) return;
    if (!SAND_DUST.enabled) { this.clear(); return; }
    this.frame++;
    const f = this.floor, w = this.water, ws = this.ws;
    const pos = this.pos, vel = this.vel, flow = this.flow, L = this.life, P = this.phys, D = this.dust;
    for (let i = 0; i < this.n;) {
      const age = (L[i * 4] += dt), life = L[i * 4 + 1];
      if (age >= life) { this.remove(i); continue; }
      const t = age / life;
      const grain = this.tint[i * 4 + 3] > 0.5;
      // the water's motion where it is (each particle every 8th frame)
      if (f && w && ((i + this.frame) & 7) === 0) {
        w.sample(f, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], ws);
        flow[i * 3] = ws.ux; flow[i * 3 + 1] = ws.uy; flow[i * 3 + 2] = ws.uz;
      }
      const settle = P[i * 4], carry = P[i * 4 + 1], k = 1 - Math.exp(-P[i * 4 + 2] * dt);
      vel[i * 3] += (carry * flow[i * 3] - vel[i * 3]) * k;
      vel[i * 3 + 1] += (carry * flow[i * 3 + 1] - settle - vel[i * 3 + 1]) * k;
      vel[i * 3 + 2] += (carry * flow[i * 3 + 2] - vel[i * 3 + 2]) * k;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const s0 = L[i * 4 + 2], s1 = L[i * 4 + 3];
      const size = grain ? s0 : s0 + (s1 - s0) * Math.sqrt(t);
      // the bed under it: a grain every frame (it lands), a cloud now and then or when it comes down to it
      if (f && (grain || ((i + this.frame) & 3) === 0 || pos[i * 3 + 1] - this.bed[i] < size)) this.bed[i] = f.heightAt(pos[i * 3], pos[i * 3 + 2]);
      const floorY = this.bed[i] + (grain ? 0.5 * size : 0.3 * size);
      let peak = P[i * 4 + 3];
      if (pos[i * 3 + 1] < floorY) {
        pos[i * 3 + 1] = floorY;
        if (vel[i * 3 + 1] < 0) vel[i * 3 + 1] = 0;
        if (grain) {
          // a grain that lands lies still and is lost among the others on the bed
          vel[i * 3] *= 0.2; vel[i * 3 + 2] *= 0.2;
          P[i * 4 + 2] = 30;
          if (L[i * 4 + 1] > age + 0.35) L[i * 4 + 1] = age + 0.35;
          peak *= 0.7;
        }
      }
      D[i * 4] = size;
      D[i * 4 + 1] = grain
        ? peak * Math.min(1, t * 15) * (1 - smooth(0.75, 1, t))
        : peak * Math.min(1, t * 7) * Math.pow(1 - t, 1.6) * Math.pow(s0 / Math.max(size, 1e-6), 0.3);
      D[i * 4 + 2] += dt * 0.04;
      D[i * 4 + 3] = pos[i * 3 + 1] - this.bed[i];
      i++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    this.points.visible = this.n > 0;
    if (this.n > 0) {
      for (const a of this.attrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, this.n * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

/** the sediments: their colour (linear, as the bed's) and how much of them is fine enough to hang in the water */
const BEDS: Record<string, { c: [number, number, number]; mud: number }> = {
  sand: { c: [0.37, 0.37, 0.355], mud: 0 },
  muddy_sand: { c: [0.29, 0.285, 0.27], mud: 0.5 },
  mud: { c: [0.19, 0.185, 0.17], mud: 1 },
  channel: { c: [0.15, 0.145, 0.135], mud: 1 },
  gravel: { c: [0.33, 0.305, 0.27], mud: 0.1 },
  rock: { c: [0.3, 0.295, 0.28], mud: 0.2 },
};

/** the colour a cloud of this sediment shows (linear RGB) */
export function dustColour(substrate: string | undefined, out: Vector3): Vector3 {
  const b = BEDS[substrate ?? 'sand'] ?? BEDS.sand;
  return out.set(b.c[0], b.c[1], b.c[2]);
}

const _up = new Vector3();

/**
 * One animal's hand on the shared dust: the sediment where it is (setBed), its own random numbers, and whether it is
 * near enough to be worth the particles (the drivers set `near` from their detail tier). Everything it emits is thinned
 * by the quality preset and dropped where there is no sediment at all (an acrylic case, a bare tank).
 */
export class DustSource {
  /** near enough to be seen (set by the driver each update) */
  near = true;
  /** nothing to throw (ctx.canBurrow === false) */
  private bare = false;
  private mud = 0;
  private readonly make: Make = { kind: KIND_CLOUD, r: 0.37, g: 0.37, b: 0.355, settle: 0.006, carry: 1, drag: 2.2, grow: 2.6 };
  private readonly col = new Vector3(0.37, 0.37, 0.355);
  private acc = 0;

  /** its random numbers (0..1), apart from the animal's own */
  constructor(readonly layer: SandDust, readonly rnd: () => number) {}

  /** whether anything emitted now would be drawn */
  get on(): boolean { return this.near && !this.bare && SAND_DUST.enabled && SAND_DUST.amount > 0; }

  /** the sediment under the animal (a HabitatSample's substrate) */
  setBed(substrate: string | undefined): void {
    const b = BEDS[substrate ?? 'sand'] ?? BEDS.sand;
    this.col.set(b.c[0], b.c[1], b.c[2]);
    this.mud = b.mud;
  }

  /** a colour of its own for the sediment (a viewer's bed) */
  setColour(c: Vector3): void { this.col.copy(c); }

  /** step the shared layer (call every update while near; harmless from every animal: the layer moves once a frame) */
  tick(dt: number, ctx: Pick<DriverContext, 'floor' | 'water' | 'canBurrow'>): void {
    this.bare = ctx.canBurrow === false;
    this.layer.tick(this, dt, ctx.floor, ctx.water ?? null);
  }

  private n(count: number): number {
    const c = count * SAND_DUST.amount;
    const whole = Math.floor(c);
    return whole + (this.rnd() < c - whole ? 1 : 0);
  }

  /**
   * Fine sediment thrown into the water: `count` puffs of `size` m across at `at`, thrown with `vel` (m/s), scattered
   * over `spread` m; each swells to a few times its size over `life` s and sinks back slowly. More of it, longer, over mud.
   */
  silt(at: Vector3, vel: Vector3, count: number, spread: number, size: number, life = 2.6, alpha = 0.45): void {
    if (!this.on) return;
    const m = this.make, mud = this.mud;
    m.kind = KIND_CLOUD; m.r = this.col.x; m.g = this.col.y; m.b = this.col.z;
    m.settle = 0.008 - 0.004 * mud; m.carry = 1; m.drag = 2.2; m.grow = 2.6 + 0.6 * mud;
    this.layer.emit(m, at, vel, this.n(count * (1 + 0.4 * mud)), spread, size, life * (1 + 0.6 * mud), Math.min(0.9, alpha * (1 + 0.15 * mud)), this.rnd);
  }

  /**
   * Coarse sand thrown out: `count` grains (`size` m, drawn a little larger than real ones) flung with `vel` plus a
   * scatter of `spread`, falling straight back. Fewer over mud, which has hardly any.
   */
  grains(at: Vector3, vel: Vector3, count: number, spread: number, size = 0.0007, life = 1.4, alpha = 0.85): void {
    if (!this.on) return;
    const m = this.make;
    m.kind = KIND_GRAIN; m.r = this.col.x; m.g = this.col.y; m.b = this.col.z;
    m.settle = 0.05; m.carry = 0.25; m.drag = 5; m.grow = 1;
    this.layer.emit(m, at, vel, this.n(count * (1 - 0.75 * this.mud)), spread, size, life, alpha, this.rnd);
  }

  /** a throw of sand: the cloud and, flung a little harder, the grains in it (`grains` of them per puff) */
  kick(at: Vector3, vel: Vector3, count: number, spread: number, size: number, life = 2.6, alpha = 0.45, grains = 2): void {
    this.silt(at, vel, count, spread, size, life, alpha);
    if (grains > 0) {
      _up.copy(vel).multiplyScalar(1.6);
      _up.y += 0.02 + 0.6 * spread;
      this.grains(at, _up, count * grains, spread * 1.3, Math.min(0.0011, 0.0004 + size * 0.04));
    }
  }

  /** ink: a dark cloud that hangs in the water, carried by it, hardly sinking */
  ink(at: Vector3, vel: Vector3, count: number, spread: number, size: number, life: number, alpha: number, colour: Vector3): void {
    if (!this.near || !SAND_DUST.enabled) return;
    const m = this.make;
    m.kind = KIND_CLOUD; m.r = colour.x; m.g = colour.y; m.b = colour.z;
    m.settle = 0.0005; m.carry = 1; m.drag = 2.2; m.grow = 2.8;
    this.layer.emit(m, at, vel, Math.max(1, this.n(count)), spread, size, life, alpha, this.rnd);
  }

  /**
   * A steady stir (a body or a fin working close over the bed): `rate` puffs a second while it lasts, emitted over
   * this step `dt`; the rest as silt().
   */
  stream(dt: number, rate: number, at: Vector3, vel: Vector3, spread: number, size: number, life = 2.2, alpha = 0.3): void {
    if (!this.on || rate <= 0) { this.acc = 0; return; }
    this.acc += rate * dt;
    if (this.acc < 1) return;
    const n = Math.floor(this.acc);
    this.acc -= n;
    this.silt(at, vel, n, spread, size, life, alpha);
  }

  /** the animal is gone (the dust it threw stays and settles) */
  release(): void {
    this.layer.forget(this);
  }
}

const layers = new WeakMap<Object3D, SandDust>();

/** The dust drawn under `parent` (the group the animals live in). */
export function sandDustFor(parent: Object3D): SandDust {
  let l = layers.get(parent);
  if (!l) { l = new SandDust(); layers.set(parent, l); }
  if (l.points.parent !== parent) parent.add(l.points);
  return l;
}

/** The dust's shader on an object that is never drawn (DriverEntry.keep: compiled with the species' own). */
export function keepSandDust(parent: Object3D): { dispose(): void } {
  const l = new SandDust();
  l.points.visible = true;
  parent.add(l.points);
  return { dispose: () => l.dispose() };
}
