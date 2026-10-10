import {
  AddEquation, CustomBlending, DirectionalLight, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, PlaneGeometry,
  Quaternion, Scene, ShaderMaterial, SrcColorFactor, Vector3, ZeroFactor,
} from 'three';

/**
 * Contact shadows of the ハク on the bed: one instanced draw for every fish under a parent group.
 *
 * A 3 cm fish is far below the resolution of the sun's shadow map (several centimetres per texel over the flat), yet
 * in a hand's depth of clear-ish water its shadow on the sand is what makes it read as a fish swimming above the
 * bottom. Each fish casts a soft, fish-shaped shadow along the refracted sun: crisp and dark when it swims low,
 * wider, softer and fainter the higher it is (the sun's disc and the ripples' defocus), gone under an overcast or at
 * night. The quads do not write depth, so the water pass treats them as part of the bed (refracted, fogged).
 */

const CAPACITY = 512;

/** the presets switch the contact shadows off altogether (超軽量): placed shadows are hidden instead */
export const CONTACT_SHADOWS = { enabled: true };

const VERT = /* glsl */ `
attribute vec2 aShadow;   // opacity, softness
varying vec2 vUv;
varying vec2 vS;
void main() {
  vUv = uv;
  vS = aShadow;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec2 vS;
void main() {
  // fish-shaped: widest behind the head, tapering to the peduncle, the tail's fan faint
  float along = 1.0 - vUv.y * 2.0;        // +1 at the head end
  float across = vUv.x * 2.0 - 1.0;
  float hw = mix(0.38, 1.0, smoothstep(-0.95, 0.25, along)) * (1.0 - 0.3 * smoothstep(0.45, 1.0, along));
  float r = length(vec2(across / max(hw, 0.05), along));
  float soft = clamp(vS.y, 0.08, 0.95);
  float a = vS.x * (1.0 - smoothstep(1.0 - soft, 1.0, r));
  if (a < 0.002) discard;
  // the shade on the bed is lit by the water's scattered light: a cool, olive-grey darkening
  gl_FragColor = vec4(vec3(1.0) - a * (vec3(1.0) - vec3(0.42, 0.47, 0.5)), 1.0);
}`;

export class ShadowLayer {
  readonly mesh: InstancedMesh;
  private readonly params: InstancedBufferAttribute;
  private readonly free: number[] = [];
  private high = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly p = new Vector3();
  private readonly sc = new Vector3();

  constructor() {
    const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.params = new InstancedBufferAttribute(new Float32Array(CAPACITY * 2), 2);
    this.params.setUsage(DynamicDrawUsage);
    geo.setAttribute('aShadow', this.params);
    const mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: CustomBlending, blendEquation: AddEquation, blendSrc: ZeroFactor, blendDst: SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new InstancedMesh(geo, mat, CAPACITY);
    this.mesh.name = 'HakuContactShadows';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = -1;
    this.mesh.count = 0;
    const zero = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CAPACITY; i++) this.mesh.setMatrixAt(i, zero);
  }

  /** a slot for one fish (−1 when full) */
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

  /** which slots hold a placed shadow (a hidden slot is not uploaded again) */
  private readonly shown = new Uint8Array(CAPACITY);

  hide(i: number): void {
    if (i < 0 || !this.shown[i]) return;
    this.shown[i] = 0;
    this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.params.setXY(i, 0, 0);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.params.needsUpdate = true;
  }

  /** place the shadow of slot i: centre on the bed, heading, length and width (m), opacity and softness (0..1) */
  set(i: number, x: number, y: number, z: number, heading: number, length: number, width: number, opacity: number, softness: number): void {
    if (i < 0) return;
    // (switched off by the preset: the placed shadows go, and the layer is not drawn at all)
    if (!CONTACT_SHADOWS.enabled) { this.hide(i); this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.shown[i] = 1;
    this.q.setFromAxisAngle(this.up, heading);
    this.m.compose(this.p.set(x, y, z), this.q, this.sc.set(width, 1, length));
    this.mesh.setMatrixAt(i, this.m);
    this.params.setXY(i, opacity, softness);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.params.needsUpdate = true;
  }
}

const layers = new WeakMap<Object3D, ShadowLayer>();

/** The shadow layer drawn under `parent` (the group the fish live in). */
export function shadowLayerFor(parent: Object3D): ShadowLayer {
  let l = layers.get(parent);
  if (!l) { l = new ShadowLayer(); layers.set(parent, l); }
  if (l.mesh.parent !== parent) parent.add(l.mesh);
  return l;
}

/** The sun: the scene's strongest directional light, looked up once per scene. */
const suns = new WeakMap<Object3D, DirectionalLight | null>();
export function sunOf(obj: Object3D): DirectionalLight | null {
  let root: Object3D = obj;
  while (root.parent) root = root.parent;
  if (!(root as Scene).isScene) return null;
  if (suns.has(root)) return suns.get(root)!;
  let best: DirectionalLight | null = null;
  root.traverse((o) => {
    const l = o as DirectionalLight;
    if (l.isDirectionalLight && (!best || l.intensity > best.intensity || (l.castShadow && !best.castShadow))) best = l;
  });
  suns.set(root, best);
  return best;
}

/** Unit vector toward the sun under water (refracted at the surface), and how strong a shadow it casts (0..1). */
export function underwaterSun(light: DirectionalLight | null, out: Vector3): number {
  if (!light) { out.set(0, 1, 0); return 0; }
  out.subVectors(light.position, light.target.position).normalize();
  if (out.y <= 0.02) { out.set(0, 1, 0); return 0; }
  const n = 1.333, hx = out.x / n, hz = out.z / n;
  out.set(hx, Math.sqrt(Math.max(0, 1 - hx * hx - hz * hz)), hz);
  // the flat's sun: ~2.6 in clear daylight, under 0.7 at night or under a full overcast
  const i = light.intensity;
  const k = Math.min(1, Math.max(0, (i - 1.0) / 1.4));
  return k * k * (3 - 2 * k);
}
