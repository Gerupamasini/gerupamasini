import {
  CustomBlending, DstColorFactor, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial,
  SrcColorFactor, Vector3, type Object3D,
} from 'three';
import { sunOf } from '../haku/ContactShadows';
import type { Floor } from '../../drivers/Driver';
import type { BurrowKind } from './burrows';

/**
 * トビハゼ's burrow openings in the mud (burrows.ts says where), drawn over the flat in one instanced draw for every
 * fish under a parent group (the creature system's), as the アラムシロ's marks are (aramushiro/sand.ts): a quad on the
 * ground per opening, blended "2× modulate" (result = 2·src·dst: 0.5 leaves the ground as it is, less darkens, more
 * lightens), so the mud keeps its own colour, film, wetness and the water's caustics over it, and writes no depth: a
 * fish's head looking out of the hole hides the hole behind it, the terrain hides the body down the shaft.
 *
 * Each opening, in the shader, from what the eye sees of a real one:
 *   the hole     the shaft seen through the opening: the view ray is followed down a leaning tube of the opening's
 *                radius until it meets the wall, which is lit near the top and dark below (the far wall shows, the near
 *                one does not), so it reads as a hole from every side, not a black disc
 *   the rim      a smooth, wet lip (the fish polishes it going in and out), glossy toward the sun
 *   the saucer   a shallow bowl round the main opening, often holding a puddle (wet, reflecting the sky and the sun)
 *   the pellets  the mud balls dug out of the burrow, heaped round it in a low irregular ring (fresh, a shade darker
 *                and glistening), sparser round a crab's hole; they fade to their average once a pellet is under a pixel
 *   the Y's second opening is smaller, with fewer pellets and no puddle
 * Lit by the flat's sun (its direction and strength, the same in the water: the refraction barely moves it).
 * Everything is sized in the opening's radii, so a smaller hole is the same hole smaller. The same on every quality
 * and device: one draw of at most a few dozen quads, its detail fading with the pixel's size (fwidth), not a preset.
 */

const CAPACITY = 512;
export const BURROW_KIND: Record<BurrowKind, number> = { own: 0, own2: 1, crab: 2 };
/** the quad's half size, in opening radii, by kind (the pellets' ring and the opening's wobble stay inside it) */
export const BURROW_EXTENT: Record<BurrowKind, number> = { own: 4.9, own2: 3.4, crab: 3.9 };
/** the shaft's lean (tan of its angle from the vertical, toward the burrow's azimuth) */
const TILT = 0.7;

const VERT = /* glsl */ `
attribute vec4 aHole;   // kind, extent (half size in radii), seed, wet
varying vec2 vQ;
varying vec4 vHole;
varying vec3 vWorld;
varying vec3 vX;
varying vec3 vY;
varying vec3 vZ;
void main() {
  vHole = aHole;
  vQ = position.xz * 2.0 * aHole.y;
  mat3 m = mat3(modelMatrix) * mat3(instanceMatrix);
  vX = normalize(m * vec3(1.0, 0.0, 0.0));
  vY = normalize(m * vec3(0.0, 1.0, 0.0));
  vZ = normalize(m * vec3(0.0, 0.0, 1.0));
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uSun;      // toward the sun (world)
uniform float uSunK;    // how strongly it lights (0 overcast or night)
varying vec2 vQ;
varying vec4 vHole;
varying vec3 vWorld;
varying vec3 vX;
varying vec3 vY;
varying vec3 vZ;
float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float kind, seed;
// the opening's irregular edge (radii) round its middle, and the distance in radii from it (a little long down the shaft)
float wob(vec2 q) {
  float a = atan(q.x, q.y);
  return 1.0 + 0.07 * sin(a * 3.0 + seed * 19.0) + 0.04 * sin(a * 5.0 + seed * 7.0) + 0.025 * sin(a * 9.0 + seed * 3.0);
}
float rad(vec2 q) { return length(q * vec2(1.0, 0.9)) / wob(q); }
// the ground's relief round the opening (radii): the saucer, the lip, the apron of dug mud
float relief(vec2 q) {
  float r = rad(q);
  float lump = n2(q * 1.4 + seed * 37.0) * 0.7 + n2(q * 3.1 - seed * 11.0) * 0.3;
  float h = 0.14 * exp(-pow((r - 1.1) / 0.13, 2.0));                       // the polished lip
  if (kind < 0.5) {
    h -= 0.3 * (1.0 - smoothstep(1.05, 2.5, r));                            // the saucer
    h += 0.4 * smoothstep(1.7, 2.5, r) * (1.0 - smoothstep(2.6, 3.7, r)) * (0.45 + 0.9 * lump);
  } else if (kind < 1.5) {
    h -= 0.12 * (1.0 - smoothstep(1.05, 1.8, r));
    h += 0.25 * smoothstep(1.4, 1.9, r) * (1.0 - smoothstep(2.0, 2.9, r)) * (0.4 + 0.9 * lump);
  } else {
    h += 0.3 * smoothstep(1.2, 1.7, r) * (1.0 - smoothstep(1.9, 3.1, r)) * (0.35 + 0.9 * lump);
  }
  return h;
}
vec3 sunL;
// how thickly the dug-out pellets lie, by the distance from the opening (radii)
float ringAt(float r) {
  return kind < 0.5 ? smoothstep(1.45, 1.9, r) * (1.0 - smoothstep(2.8, 3.5, r))
       : kind < 1.5 ? smoothstep(1.3, 1.6, r) * (1.0 - smoothstep(2.0, 2.5, r)) * 0.5
       : smoothstep(1.25, 1.55, r) * (1.0 - smoothstep(2.1, 2.8, r)) * 0.7;
}
// the pellets of one jittered grid (cell cs, radius about pr0) over q: x the highest one's height (radii), yz its
// surface's slope, w 1 inside one. Each pellet whole (its presence is decided at its middle), lumpy and turned anyhow
vec4 pellets(vec2 q, float cs, float pr0, float salt) {
  vec2 gc = floor(q / cs + salt);
  vec4 best = vec4(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = gc + vec2(float(i), float(j));
    vec2 ctr = (c + 0.5 + (vec2(h2(c + 3.1 + salt), h2(c + 7.7 + salt)) - 0.5) * 0.9 - salt) * cs;
    float dens = ringAt(rad(ctr)) * (0.3 + 0.6 * n2(ctr * 0.8 + seed * 13.0));
    if (h2(c * 1.37 + salt * 5.0 + seed * 91.0) > dens) continue;
    float pr = pr0 * (0.6 + 0.7 * h2(c + 5.3 + salt));
    float th = h2(c + 9.1 + salt) * 6.2832;
    vec2 d = q - ctr;
    vec2 dl = mat2(cos(th), -sin(th), sin(th), cos(th)) * d;
    dl.y *= 1.0 + 0.6 * h2(c + 1.9 + salt);
    float e = length(dl) / pr;
    if (e >= 1.0) continue;
    float k = sqrt(1.0 - e * e);
    // (low and slumped, wet mud: about a third as high as wide)
    float hgt = k * pr * 0.35;
    if (hgt > best.x) best = vec4(hgt, -d / (pr * max(k, 0.25)) * 0.35, 1.0);
  }
  return best;
}
// the light on a surface of normal n (local), against the flat ground's
float shade(vec3 n) {
  float flatK = max(sunL.y, 0.25);
  return mix(1.0, clamp(max(dot(n, sunL), 0.0) / flatK, 0.3, 1.7), uSunK) * (0.85 + 0.15 * n.y);
}
void main() {
  kind = vHole.x; seed = vHole.z;
  float ext = vHole.y, wet = vHole.w;
  vec2 q = vQ;
  float r = rad(q);
  if (r > ext) discard;
  sunL = vec3(dot(uSun, vX), dot(uSun, vY), dot(uSun, vZ));
  vec3 V = normalize(vWorld - cameraPosition);
  vec3 vl = vec3(dot(V, vX), dot(V, vY), dot(V, vZ));
  float fw = max(fwidth(q.x), fwidth(q.y));
  float f;
  if (r < 1.0) {
    // the hole: down the leaning shaft from where the eye enters the opening to the wall it meets
    vec2 p = q * vec2(1.0, 0.9) / wob(q);
    float hl = length(vl.xz), down = max(-vl.y, 0.03);
    float m = down / max(hl, 1e-4);
    vec2 dn = hl > 1e-4 ? vl.xz / hl : vec2(0.0);
    vec2 w = dn - vec2(0.0, ${TILT.toFixed(2)} * m);
    float a = max(dot(w, w), 1e-5), b = dot(p, w), c = dot(p, p) - 1.0;
    float t = (-b + sqrt(max(b * b - a * c, 0.0))) / a;
    float depth = t * m;
    // the wall where the ray meets it: lit near the top, the far side toward the light a little brighter
    vec2 hit = p + t * w;
    vec3 wn = normalize(vec3(-hit.x, 0.0, -hit.y));
    float wallLit = 0.75 + 0.35 * max(dot(wn, sunL), 0.0) * uSunK;
    f = mix(0.03, 0.62 * wallLit, exp(-depth * 1.1));
    // (wet: a glint at the very top of the wall)
    f *= 1.0 + 0.25 * exp(-depth * 6.0) * uSunK;
    // the lip rounding over into the hole
    f = mix(f, 0.55, smoothstep(0.86, 1.0, r) * 0.6);
  } else {
    // the relief round it, lit by the sun
    float e = 0.03;
    float h0 = relief(q), hx = relief(q + vec2(e, 0.0)), hz = relief(q + vec2(0.0, e));
    vec3 n = normalize(vec3(-(hx - h0) / e, 1.0, -(hz - h0) / e));
    f = shade(n);
    // wet mud: darkest at the lip and in the saucer, drying outward
    float wetZone = 1.0 - smoothstep(1.0, kind < 0.5 ? 2.6 : 1.8, r);
    f *= mix(1.0, 0.72, wetZone);
    // the lip's gloss: the sun's glint off the polished mud
    vec3 R = reflect(vl, n);
    float gl = pow(max(dot(R, sunL), 0.0), 40.0) * uSunK;
    f += gl * 0.7 * exp(-pow((r - 1.1) / 0.18, 2.0));
    // a puddle in the saucer of its own burrow: dark water, the sky and the sun in it
    if (kind < 0.5 && wet > 0.01) {
      float pool = wet * (1.0 - smoothstep(1.6 + 0.6 * seed, 2.0 + 0.6 * seed, r + 0.25 * (n2(q * 1.7 + seed * 5.0) - 0.5)));
      vec3 Rw = reflect(vl, vec3(0.0, 1.0, 0.0));
      float fres = pow(1.0 - max(-vl.y, 0.0), 4.0);
      float water = 0.78 + 0.5 * fres + 1.4 * pow(max(dot(Rw, sunL), 0.0), 120.0) * uSunK;
      f = mix(f, water * mix(1.0, 0.72, wetZone), pool);
    }
    // the pellets: mud balls dug out, heaped round the opening (two jittered grids of lumps, so no lattice shows)
    float pr0 = kind < 1.5 ? 0.22 : 0.26;
    float detail = 1.0 - smoothstep(0.35, 0.8, fw / pr0);
    if (ringAt(r) > 0.005 || ringAt(r + 2.0 * pr0) > 0.005 || ringAt(r - 2.0 * pr0) > 0.005) {
      vec4 pa = pellets(q, pr0 * 1.7, pr0, 0.0), pb = pellets(q, pr0 * 2.1, pr0 * 0.8, 0.37);
      vec4 p = pb.x > pa.x ? pb : pa;
      float pf = 1.0;
      if (p.w > 0.5) {
        vec3 pn = normalize(vec3(-p.y, 1.0, -p.z));
        // fresh from below: the flat's mud a shade darker and wetter, a soft sheen
        pf = mix(1.0, shade(pn), 0.8) * (0.86 + 0.08 * pn.y);
        pf += pow(max(dot(reflect(vl, pn), sunL), 0.0), 10.0) * 0.18 * uSunK;
      } else {
        // in the shade of a pellet toward the sun
        vec2 toSun = sunL.xz / max(sunL.y, 0.35) * pr0 * 0.35;
        vec4 sa = pellets(q + toSun, pr0 * 1.7, pr0, 0.0), sb = pellets(q + toSun, pr0 * 2.1, pr0 * 0.8, 0.37);
        pf = 1.0 - 0.14 * uSunK * max(sa.w, sb.w) - 0.04 * max(sa.w, sb.w);
      }
      // (smaller than a pixel: the heap's average darkening)
      f *= mix(1.0 - 0.05 * ringAt(r), pf, detail);
    }
    // the quad's edge: back to the bare mud
    f = mix(1.0, f, 1.0 - smoothstep(ext * 0.82, ext, r));
  }
  // far off (a few pixels): the opening's average, then nothing
  f = mix(f, 1.0, smoothstep(0.6, 1.4, fw * 0.25));
  gl_FragColor = vec4(vec3(0.5 * clamp(f, 0.0, 2.0)), 1.0);
}`;

/** the burrow openings of every トビハゼ under one parent */
export class BurrowLayer {
  readonly mesh: InstancedMesh;
  private readonly holes: InstancedBufferAttribute;
  private readonly free: number[] = [];
  private high = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly mat: ShaderMaterial;
  private lastSun = -1e9;

  constructor() {
    const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.holes = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
    this.holes.setUsage(DynamicDrawUsage);
    geo.setAttribute('aHole', this.holes);
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: CustomBlending, blendSrc: DstColorFactor, blendDst: SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: { uSun: { value: new Vector3(0, 1, 0) }, uSunK: { value: 0 } },
    });
    this.mat.name = 'tobihaze-burrows';
    this.mesh = new InstancedMesh(geo, this.mat, CAPACITY);
    this.mesh.name = 'TobihazeBurrows';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = -1;
    this.mesh.count = 0;
    this.mesh.userData.noPick = true;
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
    this.holes.setXYZW(i, 0, 0, 0, 0);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.holes.needsUpdate = true;
  }

  /**
   * place opening i: its middle on the ground (world, y the ground's height there), the ground's normal there, the
   * shaft's azimuth, the opening's radius (m), its kind, variety and puddle (0..1)
   */
  set(i: number, x: number, y: number, z: number, normal: Vector3, az: number, r: number, kind: BurrowKind, seed: number, wet: number): void {
    if (i < 0) return;
    const ext = BURROW_EXTENT[kind];
    this.q.setFromUnitVectors(this.up, normal).multiply(this.q2.setFromAxisAngle(this.up, az));
    // (a hair over the ground along its normal: the polygon offset does the rest)
    this.m.compose(this.p.set(x, y, z).addScaledVector(normal, 0.0008), this.q, this.s.set(2 * ext * r, 1, 2 * ext * r));
    this.mesh.setMatrixAt(i, this.m);
    this.holes.setXYZW(i, BURROW_KIND[kind], ext, seed, wet);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.holes.needsUpdate = true;
  }

  /** now and then: the sun's direction and strength (the flat's directional light) */
  tick(seconds: number, anyChild: Object3D): void {
    if (Math.abs(seconds - this.lastSun) < 0.5) return;
    this.lastSun = seconds;
    const light = sunOf(anyChild), u = this.mat.uniforms;
    if (!light) { u.uSunK.value = 0; return; }
    const d = (u.uSun.value as Vector3).subVectors(light.position, light.target.position).normalize();
    if (d.y <= 0.02) { d.set(0, 1, 0); u.uSunK.value = 0; return; }
    // (the flat's sun: ~2.6 in clear daylight, under 0.7 at night or under a full overcast)
    const k = Math.min(1, Math.max(0, (light.intensity - 1.0) / 1.4));
    u.uSunK.value = k * k * (3 - 2 * k);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/**
 * Where an opening lies: the ground's height at (x, z) — the higher of the behaviour's ground (heightAt, where the fish
 * dives) and the ground as drawn (surfaceAt, the terrain's triangles), so the quad is never under the mud it is painted
 * on — and the ground's normal there (out).
 */
export function openingGround(floor: Pick<Floor, 'heightAt' | 'surfaceAt'>, x: number, z: number, normal: Vector3): number {
  const h = (px: number, pz: number) => floor.heightAt(px, pz);
  const e = 0.05;
  normal.set(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize();
  const y = h(x, z);
  return floor.surfaceAt ? Math.max(y, floor.surfaceAt(x, z)) : y;
}

const layers = new WeakMap<Object3D, BurrowLayer>();

/** the burrow layer drawn under `parent` (the group the fish live in) */
export function burrowLayerFor(parent: Object3D): BurrowLayer {
  let l = layers.get(parent);
  if (!l) { l = new BurrowLayer(); layers.set(parent, l); }
  if (l.mesh.parent !== parent) parent.add(l.mesh);
  return l;
}
