import {
  BufferAttribute, BufferGeometry, Points, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, type Object3D, type Vector3,
  type WebGLRenderer,
} from 'three';
import type { PuffKind } from './School';

/**
 * What grazing mullet leave in the water: one point cloud for every fish under a parent group.
 *  - flecks: bits of the epiphyte film (diatoms, fine algae, detritus) scraped off an eelgrass leaf with each bite.
 *    Dark olive-brown motes a millimetre or two across, they drift off with the water and sink slowly.
 *  - silt: the surface layer of the bed taken in and puffed back out of the gill slits (and a little stirred by the
 *    bite): a small cloud of fine sand that spreads, slows and settles back.
 * Lit like the ray's sand puffs (the scene's own lights, a little pale for the scatter in suspension).
 */

const MAX = 384;

const VERT = /* glsl */ `
attribute vec4 aPuff;    // x size (m), y alpha, z grain, w peak alpha
attribute vec3 aCol;
uniform float uScale;
varying float vAlpha;
varying float vGrain;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aPuff.x * uScale / max(0.02, -mv.z), 0.0, 128.0);
  vAlpha = aPuff.y;
  vGrain = aPuff.z;
  vCol = aCol;
}`;

const FRAG = /* glsl */ `
#include <common>
#include <lights_pars_begin>
varying float vAlpha;
varying float vGrain;
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  // a fleck (vGrain < 0) is a small ragged mote; a silt puff a soft grainy cloud
  float n = fract(sin(dot(floor(gl_PointCoord * 6.0) + abs(vGrain) * 13.0, vec2(12.9898, 78.233))) * 43758.5453);
  float a = vGrain < 0.0 ? vAlpha * (1.0 - smoothstep(0.35 + 0.35 * n, 1.0, r)) : vAlpha * (1.0 - r) * (1.0 - r) * (0.75 + 0.25 * n);
  if (a < 0.003) discard;
  vec3 irr = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) irr += mix(hemisphereLights[i].groundColor, hemisphereLights[i].skyColor, 0.75);
  #endif
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) irr += directionalLights[i].color * 0.85;
  #endif
  gl_FragColor = vec4(vCol * irr * RECIPROCAL_PI * (vGrain < 0.0 ? 1.2 : 1.7), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** the film off the leaves: olive-brown (diatoms and detritus) */
const FLECK = [0.2, 0.18, 0.09];

export class GrazeFX {
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly puff = new Float32Array(MAX * 4);
  private readonly col = new Float32Array(MAX * 3);
  /** per particle: age, life, start size, end size */
  private readonly life = new Float32Array(MAX * 4);
  /** per particle: the bed under it (where it settles), how fast it sinks (m/s) */
  private readonly bed = new Float32Array(MAX * 2);
  private next = 0;
  private lastFrame = Number.NaN;
  readonly points: Points;
  private readonly mat: ShaderMaterial;
  private readonly size = new Vector2();
  /** the water's drift over the bed (m/s, xz), set by the drivers */
  readonly current = new Vector2();

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aPuff', new BufferAttribute(this.puff, 4));
    g.setAttribute('aCol', new BufferAttribute(this.col, 3));
    g.setDrawRange(0, 0);
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, lights: true, transparent: true, depthWrite: false,
      uniforms: UniformsUtils.merge([UniformsLib.lights, { uScale: { value: 600 } }]),
    });
    this.points = new Points(g, this.mat);
    this.points.name = 'MulletGrazePuffs';
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.points.visible = false;
    this.points.onBeforeRender = (renderer: WebGLRenderer, _s, camera) => {
      renderer.getDrawingBufferSize(this.size);
      const proj = (camera as unknown as { projectionMatrix: { elements: number[] } }).projectionMatrix.elements;
      this.mat.uniforms.uScale.value = proj[5] * this.size.y * 0.5;
    };
  }

  /**
   * A puff from a fish of length `tl` at `at`, thrown along `dir` (a direction, about unit length); `amount` about how
   * many motes, `bedY` the bed under it, `sand` the colour of the bed (for silt).
   */
  emit(kind: PuffKind, at: Vector3, dir: Vector3, amount: number, tl: number, bedY: number, sand: Vector3, rnd: () => number = Math.random): void {
    const fleck = kind === 'flecks';
    const n = Math.max(1, Math.round(amount * (0.7 + 0.6 * rnd())));
    const spread = (fleck ? 0.03 : 0.06) * tl;
    const speed = (fleck ? 0.5 : 1.1) * tl;
    this.points.visible = true;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread;
      this.pos[i * 3] = at.x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = at.y + (rnd() - 0.5) * spread;
      this.pos[i * 3 + 2] = at.z + Math.sin(a) * r;
      const j = 0.5 + rnd();
      this.vel[i * 3] = dir.x * speed * j + (rnd() - 0.5) * speed * 0.6;
      this.vel[i * 3 + 1] = dir.y * speed * j + (rnd() - 0.5) * speed * 0.4;
      this.vel[i * 3 + 2] = dir.z * speed * j + (rnd() - 0.5) * speed * 0.6;
      const L = this.life;
      L[i * 4] = 0;
      if (fleck) {
        // a mote: it keeps its size, lasts a few seconds, sinks a few mm a second
        L[i * 4 + 1] = 2.5 + 3 * rnd();
        L[i * 4 + 2] = L[i * 4 + 3] = (0.0012 + 0.0014 * rnd()) * Math.min(1.4, tl / 0.07);
        this.bed[i * 2 + 1] = 0.002 + 0.004 * rnd();
        const t = 0.8 + 0.4 * rnd();
        this.col[i * 3] = FLECK[0] * t; this.col[i * 3 + 1] = FLECK[1] * t; this.col[i * 3 + 2] = FLECK[2] * t;
        this.puff[i * 4 + 2] = -0.01 - rnd();
        this.puff[i * 4 + 3] = 0.85;
      } else {
        // a cloud: it spreads as it slows, and settles back within a couple of seconds
        L[i * 4 + 1] = 1.2 + 1.2 * rnd();
        L[i * 4 + 2] = (0.08 + 0.05 * rnd()) * tl;
        L[i * 4 + 3] = (0.25 + 0.2 * rnd()) * tl;
        this.bed[i * 2 + 1] = 0.006 + 0.006 * rnd();
        this.col[i * 3] = sand.x; this.col[i * 3 + 1] = sand.y; this.col[i * 3 + 2] = sand.z;
        this.puff[i * 4 + 2] = 0.01 + rnd();
        this.puff[i * 4 + 3] = 0.32;
      }
      this.bed[i * 2] = bedY;
      this.puff[i * 4 + 1] = 0;
    }
  }

  /** step the motes once per frame (`frame` tells the frames apart: every fish calls this) */
  advance(frame: number, dt: number): void {
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    if (!this.points.visible) return;
    let maxIdx = 0;
    const drag = Math.exp(-dt * 3), cx = this.current.x, cz = this.current.y;
    const v = this.vel, p = this.pos, L = this.life;
    for (let i = 0; i < MAX; i++) {
      if (L[i * 4 + 1] <= 0) { this.puff[i * 4 + 1] = 0; continue; }
      L[i * 4] += dt;
      const t = L[i * 4] / L[i * 4 + 1];
      if (t >= 1) { L[i * 4 + 1] = 0; this.puff[i * 4 + 1] = 0; continue; }
      maxIdx = i + 1;
      // thrown off, slowed by the water toward its drift, sinking at its own pace
      const sink = this.bed[i * 2 + 1];
      v[i * 3] = cx + (v[i * 3] - cx) * drag;
      v[i * 3 + 1] = -sink + (v[i * 3 + 1] + sink) * drag;
      v[i * 3 + 2] = cz + (v[i * 3 + 2] - cz) * drag;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      const g = this.bed[i * 2] + 0.002;
      if (p[i * 3 + 1] < g) { p[i * 3 + 1] = g; v[i * 3] *= 0.5; v[i * 3 + 1] = 0; v[i * 3 + 2] *= 0.5; }
      this.puff[i * 4] = L[i * 4 + 2] + (L[i * 4 + 3] - L[i * 4 + 2]) * Math.sqrt(t);
      this.puff[i * 4 + 1] = this.puff[i * 4 + 3] * Math.min(1, t * 10) * (1 - t * t);
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, maxIdx);
    this.points.visible = maxIdx > 0;
    if (maxIdx > 0) {
      geo.getAttribute('position').needsUpdate = true;
      geo.getAttribute('aPuff').needsUpdate = true;
      geo.getAttribute('aCol').needsUpdate = true;
    }
  }

  /** motes in the water (for the tests) */
  get active(): number {
    let n = 0;
    for (let i = 0; i < MAX; i++) if (this.life[i * 4 + 1] > 0) n++;
    return n;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

const layers = new WeakMap<Object3D, GrazeFX>();

/** The puff layer drawn under `parent` (the group the fish live in). */
export function grazeFXFor(parent: Object3D): GrazeFX {
  let l = layers.get(parent);
  if (!l) { l = new GrazeFX(); layers.set(parent, l); }
  if (l.points.parent !== parent) parent.add(l.points);
  return l;
}
