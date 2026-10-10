import {
  CustomBlending, DstColorFactor, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial,
  SrcColorFactor, Vector3, type Object3D,
} from 'three';
import { sunOf, underwaterSun } from '../haku/ContactShadows';

/**
 * What the アラムシロ do to the sand, drawn over the bed in one instanced draw for every snail under a parent group:
 *
 *   contact   the soft darkening under the foot and the shell (the sun's shadow map is centimetres to a texel; a
 *             snail's shadow is millimetres) and the shell's own shadow cast a little along the refracted sun
 *   trail     the furrow a crawling snail ploughs in soft sand: a shallow groove with low banks either side, lit by the
 *             sun (the bank toward it bright, the groove's far wall in shade); trails fade as the water smooths them
 *   mound     the sand heaped round a burrowing snail and the low hump over a buried one
 *   pit       the hollow left where one came out
 *
 * Blended as "2× modulate" (result = 2·src·dst): 0.5 leaves the bed as it is, less darkens it, more lightens it, so
 * the marks keep the bed's own colour, ripples and caustics. They write no depth: the water pass sees them as bed.
 */

const CAPACITY = 3072;
export const MARK = { contact: 0, trail: 1, mound: 2, pit: 3 } as const;

const VERT = /* glsl */ `
attribute vec4 aMark;   // kind, strength, birth (s), seed
varying vec2 vUv;
varying vec4 vMark;
varying vec3 vAcross;
varying vec3 vAlong;
void main() {
  vUv = uv;
  vMark = aMark;
  mat3 m = mat3(modelMatrix) * mat3(instanceMatrix);
  vAcross = normalize(m * vec3(1.0, 0.0, 0.0));
  vAlong = normalize(m * vec3(0.0, 0.0, -1.0));
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uSun;      // toward the sun under water (world)
uniform float uSunK;    // how strongly it shades (0 overcast or night)
uniform float uTime;    // seconds (game)
uniform float uLife;    // a trail's life (s)
varying vec2 vUv;
varying vec4 vMark;
varying vec3 vAcross;
varying vec3 vAlong;
float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
// shading of a relief with slopes (sx across, sy along) under the sun, relative to the flat bed
float lit(float sx, float sy) {
  vec3 n = normalize(vec3(0.0, 1.0, 0.0) - sx * vAcross - sy * vAlong);
  float flatK = max(uSun.y, 0.2);
  return mix(1.0, clamp(max(dot(n, uSun), 0.0) / flatK, 0.35, 1.8), uSunK);
}
void main() {
  float kind = vMark.x, k = vMark.y, seed = vMark.w;
  vec2 q = vUv * 2.0 - 1.0;
  float f = 1.0;
  if (kind < 0.5) {
    // contact: a soft dark ellipse, darkest at the middle
    float r = length(q);
    float a = k * (1.0 - smoothstep(0.35, 1.0, r)) * (0.65 + 0.35 * (1.0 - r));
    if (a < 0.002) discard;
    f = 1.0 - a * 0.62;
  } else if (kind < 1.5) {
    // trail: a groove with banks, fading with age and toward its edges
    float age = (uTime - vMark.z) / uLife;
    float fade = k * (1.0 - smoothstep(0.0, 1.0, age));
    if (fade < 0.003 || abs(q.x) > 1.0) discard;
    float x = q.x + 0.12 * (n2(vec2(vUv.y * 3.0 + seed, 0.0)) - 0.5);
    // height: a groove in the middle (the foot's track), banks where the sand was pushed aside
    float g = -exp(-x * x / 0.18);
    float bank = exp(-pow((abs(x) - 0.75) / 0.17, 2.0));
    float dh = (2.0 * x / 0.18) * exp(-x * x / 0.18) - sign(x) * 2.0 * (abs(x) - 0.75) / (0.17 * 0.17) * bank * 0.35;
    float slope = dh * 0.11 * fade;
    f = lit(slope, 0.0);
    // the turned sand is a little darker (wetter) in the groove, the grains on the banks catch the light
    f *= 1.0 - 0.08 * fade * (-g) + 0.03 * fade * bank * (n2(vUv * vec2(9.0, 30.0) + seed) - 0.3);
    f = mix(1.0, f, smoothstep(1.0, 0.75, abs(q.x)));
  } else if (kind < 2.5) {
    // mound: heaped, lumpy sand, a hump over the buried snail
    float r = length(q * vec2(1.0, 0.85));
    if (r > 1.0) discard;
    float lump = n2(q * 6.0 + seed * 7.0) - 0.5;
    float hgt = k * (pow(1.0 - r * r, 2.0) + 0.25 * lump * (1.0 - r));
    float e = 0.02;
    vec2 g;
    {
      vec2 qx = q + vec2(e, 0.0), qy = q + vec2(0.0, e);
      float rx = length(qx * vec2(1.0, 0.85)), ry = length(qy * vec2(1.0, 0.85));
      float hx = k * (pow(max(0.0, 1.0 - rx * rx), 2.0) + 0.25 * (n2(qx * 6.0 + seed * 7.0) - 0.5) * (1.0 - rx));
      float hy = k * (pow(max(0.0, 1.0 - ry * ry), 2.0) + 0.25 * (n2(qy * 6.0 + seed * 7.0) - 0.5) * (1.0 - ry));
      g = vec2(hx - hgt, hy - hgt) / e;
    }
    f = lit(g.x * 0.5, -g.y * 0.5);
    // freshly turned sand: darker and grainier
    f *= 1.0 - 0.07 * k * (1.0 - r) + 0.05 * k * (n2(q * 40.0 + seed) - 0.5);
    f = mix(1.0, f, smoothstep(1.0, 0.7, r));
  } else {
    // pit: a small hollow with a low rim
    float r = length(q);
    if (r > 1.0) discard;
    float dr = k * 2.0 * (1.0 - r * r * 1.8) * 3.6 * r * step(r * r * 1.8, 1.0) - 0.3 * k * 2.0 * (r - 0.8) / 0.0225 * exp(-pow((r - 0.8) / 0.15, 2.0));
    vec2 dir = r > 1e-4 ? q / r : vec2(0.0);
    f = lit(dir.x * dr * 0.4, -dir.y * dr * 0.4);
    f *= 1.0 - 0.06 * k * (1.0 - r);
    f = mix(1.0, f, smoothstep(1.0, 0.8, r));
  }
  gl_FragColor = vec4(vec3(0.5 * f), 1.0);
}`;

/** the bed marks of every snail under one parent */
export class SandLayer {
  readonly mesh: InstancedMesh;
  private readonly marks: InstancedBufferAttribute;
  private readonly free: number[] = [];
  private high = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly sun = new Vector3();
  private lastSun = -1;
  private readonly mat: ShaderMaterial;

  constructor() {
    const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.marks = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
    this.marks.setUsage(DynamicDrawUsage);
    geo.setAttribute('aMark', this.marks);
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: CustomBlending, blendSrc: DstColorFactor, blendDst: SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: { uSun: { value: new Vector3(0, 1, 0) }, uSunK: { value: 0 }, uTime: { value: 0 }, uLife: { value: 300 } },
    });
    this.mesh = new InstancedMesh(geo, this.mat, CAPACITY);
    this.mesh.name = 'AramushiroSandMarks';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = -1;
    this.mesh.count = 0;
    const zero = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CAPACITY; i++) this.mesh.setMatrixAt(i, zero);
  }

  /** a slot (−1 when full) */
  claim(): number {
    const i = this.free.pop() ?? (this.high < CAPACITY ? this.high++ : -1);
    if (i >= 0) this.mesh.count = Math.max(this.mesh.count, i + 1);
    return i;
  }

  release(i: number): void {
    if (i < 0) return;
    this.hide(i);
    this.free.push(i);
  }

  hide(i: number): void {
    if (i < 0) return;
    this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.marks.setXYZW(i, 0, 0, 0, 0);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.marks.needsUpdate = true;
  }

  /** place mark i: kind, centre on the bed, heading, width and length (m), strength, birth time (s), seed */
  set(i: number, kind: number, x: number, y: number, z: number, heading: number, width: number, length: number, strength: number, born: number, seed: number): void {
    if (i < 0) return;
    this.q.setFromAxisAngle(this.up, heading);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(width, 1, length));
    this.mesh.setMatrixAt(i, this.m);
    this.marks.setXYZW(i, kind, strength, born, seed);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.marks.needsUpdate = true;
  }

  /** once a frame: the clock and the sun under the water */
  tick(seconds: number, anyChild: Object3D): void {
    const u = this.mat.uniforms;
    u.uTime.value = seconds;
    if (Math.abs(seconds - this.lastSun) > 0.5) {
      this.lastSun = seconds;
      u.uSunK.value = underwaterSun(sunOf(anyChild), this.sun);
      u.uSun.value.copy(this.sun);
    }
  }

  get life(): number { return this.mat.uniforms.uLife.value; }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

const layers = new WeakMap<Object3D, SandLayer>();

/** the sand layer drawn under `parent` (the group the snails live in) */
export function sandLayerFor(parent: Object3D): SandLayer {
  let l = layers.get(parent);
  if (!l) { l = new SandLayer(); layers.set(parent, l); }
  if (l.mesh.parent !== parent) parent.add(l.mesh);
  return l;
}
