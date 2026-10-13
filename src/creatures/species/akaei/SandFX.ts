import { BufferAttribute, BufferGeometry, CustomBlending, DstColorFactor, Mesh, ShaderMaterial, Vector2, Vector4, ZeroFactor, type Object3D } from 'three';
import { CONTACT_SHADOWS } from '../haku/ContactShadows';

/**
 * What a ray does to the sand under it (the sediment it throws into the water is the shared dust, creatures/fx/SandDust):
 *  - the contact shadow: soft darkening of the sand under the disc, strongest when it lies on the bottom (it grounds the
 *    animal even where the sun's shadow map is off or too coarse).
 *  - imprints: the oval of disturbed, darker sand left where it lay buried or dug for food, fading over minutes.
 * All in world space; one instance per ray.
 */

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
uniform vec4 uLook;   // x the bowl's darkening, y more towards its centre, z the rim's lightening, w its outline's wobble
uniform vec2 uBowl;   // where the bowl's edge begins and ends
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float d = length(vUv) + (n(vUv * 5.0 + uSeed) - 0.5) * uLook.w;
  // the wetter, darker bowl (deepest in the middle), a lighter rim of thrown-out sand just outside it
  float bowl = 1.0 - smoothstep(uBowl.x, uBowl.y, d);
  float rim = smoothstep(0.78, 0.9, d) * (1.0 - smoothstep(0.92, 1.0, d)) * (0.6 + 0.4 * n(vUv * 11.0 + uSeed * 3.0));
  float k = 1.0 - uAmount * (uLook.x * bowl * (0.85 + 0.15 * n(vUv * 23.0)) + uLook.y * (1.0 - smoothstep(0.0, uBowl.y, d))) + uAmount * uLook.z * rim;
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

interface Imprint { mesh: Mesh; mat: ShaderMaterial; age: number; life: number; strength: number; fadeAt: number; fadeFor: number }

/** how an imprint looks (the defaults are the ray's: a shallow, faintly darker oval) */
export interface ImprintLook {
  /** how much darker the bowl is at full strength, and how much more towards its middle */
  dark?: number;
  centre?: number;
  /** where the bowl's edge begins and ends (0 the middle … 1 the patch's edge) */
  bowl?: readonly [number, number];
  /** how much lighter the rim of thrown-out sand is */
  rim?: number;
  /** how ragged its outline is */
  wobble?: number;
}

export class SandFX {
  readonly shadow: Mesh;
  private readonly shadowMat: ShaderMaterial;
  private readonly imprints: Imprint[] = [];
  private shadowTimer = 0;

  constructor(private readonly parent: Object3D) {
    this.shadowMat = multiplyMaterial(SHADOW_FRAG, { uStrength: { value: 0 }, uShape: { value: new Vector2(0.6, 0.2) } });
    this.shadow = new Mesh(patchGeometry(), this.shadowMat);
    this.shadow.name = 'AkaeiContactShadow';
    this.shadow.renderOrder = 1;
    this.shadow.frustumCulled = false;
    parent.add(this.shadow);
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
  imprint(x: number, z: number, heading: number, halfW: number, halfL: number, ground: (x: number, z: number) => number, strength = 1, life = 150, lift = 0.0015, look: ImprintLook = {}): void {
    if (this.imprints.length >= 3) { const old = this.imprints.shift()!; old.mesh.removeFromParent(); old.mesh.geometry.dispose(); old.mat.dispose(); }
    const bowl = look.bowl ?? [0.62, 0.86];
    const mat = multiplyMaterial(IMPRINT_FRAG, {
      uAmount: { value: 0 }, uSeed: { value: Math.random() * 50 },
      uLook: { value: new Vector4(look.dark ?? 0.24, look.centre ?? 0, look.rim ?? 0.1, look.wobble ?? 0.18) }, uBowl: { value: new Vector2(bowl[0], bowl[1]) },
    });
    const mesh = new Mesh(patchGeometry(), mat);
    mesh.name = 'AkaeiImprint';
    mesh.renderOrder = 1;
    layPatch(mesh.geometry, x, z, heading, halfW, halfL, ground, lift);
    this.parent.add(mesh);
    this.imprints.push({ mesh, mat, age: 0, life, strength, fadeAt: life * 0.5, fadeFor: life * 0.5 });
  }

  /** the latest imprint filled in: from how it looks now to gone in `seconds` */
  fillImprint(seconds: number): void {
    const im = this.imprints[this.imprints.length - 1];
    if (!im) return;
    const f = Math.max(0, 1 - Math.max(0, (im.age - im.fadeAt) / im.fadeFor));
    im.fadeFor = Math.max(1e-3, seconds);
    im.fadeAt = im.age - (1 - f) * im.fadeFor;
    im.life = Math.min(im.life, im.age + f * im.fadeFor);
  }

  /** deepen the latest imprint (it builds up over a burrowing or a feeding bout) */
  growImprint(amount: number): void {
    const im = this.imprints[this.imprints.length - 1];
    if (im) im.strength = Math.min(1, Math.max(im.strength, amount));
  }

  /** the imprints fade as the water smooths them */
  update(dt: number): void {
    for (let k = this.imprints.length - 1; k >= 0; k--) {
      const im = this.imprints[k];
      im.mesh.visible = CONTACT_SHADOWS.enabled;
      im.age += dt;
      const fade = 1 - Math.max(0, (im.age - im.fadeAt) / im.fadeFor);
      im.mat.uniforms.uAmount.value = im.strength * Math.max(0, fade);
      if (im.age >= im.life) { im.mesh.removeFromParent(); im.mesh.geometry.dispose(); im.mat.dispose(); this.imprints.splice(k, 1); }
    }
  }

  dispose(): void {
    this.shadow.removeFromParent();
    this.shadow.geometry.dispose();
    this.shadowMat.dispose();
    for (const im of this.imprints) { im.mesh.removeFromParent(); im.mesh.geometry.dispose(); im.mat.dispose(); }
    this.imprints.length = 0;
  }
}

