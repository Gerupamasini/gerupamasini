import {
  BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, GLSL3, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4,
  Quaternion, ShaderMaterial, Vector2, Vector3, type IUniform, type Texture,
} from 'three';
import { COMMON_GLSL } from './glsl/common';
import { LIGHTING_GLSL, cubeUVDefines } from './glsl/lighting';
import { SEDIMENT_GLSL } from './glsl/sediment';
import { ATMOS_GLSL, CLOUDS_GLSL, type SkyUniforms } from './Sky';
import { FIELD_GLSL, type FieldUniforms, type FlatField } from '../FlatField';
import { hash2i, mulberry32, Noise2 } from '../gen/noise';

/**
 * What lies on the sand close to the eye, as real geometry: empty clam valves and oyster shell (mostly convex side
 * up, some cupped and holding water), pebbles, and the few old concrete blocks and boulders on the upper beach.
 * Shells and pebbles are scattered per 1 m cell from a hash of the cell, weighted by the shell-hash field, so the
 * same spot always has the same shells; only the cells near the walker are filled.
 */
type Shared = { uNoise: IUniform<Texture>; uTime: IUniform<number>; uEnv: IUniform<Texture | null> };

const VS = /* glsl */ `
${COMMON_GLSL}
${FIELD_GLSL}
${SEDIMENT_GLSL}
uniform vec2 uEyeXZ;
in vec4 aTint;     // colour variation, kind
out vec3 vWorld;
out vec3 vN;
out vec3 vLocal;
out vec4 vTint;
// the ground as the terrain draws it: the baked surface plus the megaripples it carries as geometry near the eye
// (the same fade as the terrain's vertices, from the walker's eye also in the shadow pass)
float drawnGround(vec2 xz) {
  float h = groundHeight(xz);
  float mf = 1.0 - smoothstep(7.0, 13.0, distance(uEyeXZ, xz));
  if (mf > 0.0 && fineW(xz) > 0.0) {
    vec2 uv = fineUV(xz);
    h += megaHere(xz, texture(tRip, uv), texture(tMFine, uv), texture(tFlow, uv), fineW(xz)).x * mf;
  }
  return h;
}
void main() {
  vec4 p = instanceMatrix * vec4(position, 1.0);
  vec4 w = modelMatrix * p;
  // shells and pebbles come with their height above the ground; the blocks are placed absolutely
  if (aTint.w < 2.5) w.y += drawnGround((modelMatrix * instanceMatrix[3]).xz);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vLocal = position;
  vTint = aTint;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */ `
${COMMON_GLSL}
${FIELD_GLSL}
${ATMOS_GLSL}
${CLOUDS_GLSL}
${LIGHTING_GLSL}
in vec3 vWorld;
in vec3 vN;
in vec3 vLocal;
in vec4 vTint;
out vec4 fragColor;
void main() {
  vec3 P = vWorld;
  vec3 toEye = cameraPosition - P;
  float dist = length(toEye);
  vec3 V = toEye / dist;
  vec3 N = normalize(vN);
  bool back = !gl_FrontFacing;
  if (back) N = -N;
  float kind = vTint.w;
  vec3 alb; float rough;
  if (kind < 0.5) {
    // clam valve: concentric growth lines and faint rays on the outside, chalky white inside
    float r = length(vLocal.xz * vec2(1.0, 1.25));
    float growth = 0.5 + 0.5 * sin(r * 95.0 + vnoise(vLocal.xz * 30.0) * 3.0);
    vec3 outer = mix(vec3(0.42, 0.4, 0.37), vec3(0.62, 0.58, 0.52), growth) * vTint.rgb;
    float rays = smoothstep(0.6, 0.9, vnoise(vec2(atan(vLocal.z, vLocal.x) * 6.0, 0.0)));
    outer *= 1.0 - 0.25 * rays * step(0.5, vTint.r);
    vec3 inner = vec3(0.6, 0.58, 0.55) * (0.9 + 0.1 * vTint.g);
    alb = back ? inner : outer;
    rough = back ? 0.45 : 0.7;
  } else if (kind < 1.5) {
    // oyster shell: flaky layers, grey with a purple-brown cast and chalky white where the layers broke
    float f = vnoise(vLocal.xz * 60.0) * 0.6 + vnoise(vLocal.xz * 180.0) * 0.4;
    float layer = smoothstep(0.55, 0.75, vnoise(vec2(length(vLocal.xz) * 40.0, 3.0) + vLocal.xz * 6.0));
    alb = mix(vec3(0.3, 0.28, 0.28), vec3(0.52, 0.5, 0.47), f) * vTint.rgb;
    alb = mix(alb, vec3(0.36, 0.3, 0.32), smoothstep(0.6, 0.85, vnoise(vLocal.xz * 25.0 + 3.0)) * 0.6);
    alb = mix(alb, vec3(0.7, 0.68, 0.64), layer * 0.6);
    if (back) alb = vec3(0.58, 0.57, 0.54) * (0.9 + 0.15 * f);
    rough = 0.8;
  } else if (kind < 2.5) {
    // pebble
    alb = vTint.rgb * (0.85 + 0.3 * vnoise(vLocal.xz * 40.0 + vLocal.y * 20.0));
    rough = 0.6;
  } else {
    // weathered concrete block / boulder: lichen-free, salt-stained, sand in the pores
    vec4 n = vnoise4(P.xz * 3.0 + P.y * 2.0);
    // aggregate showing through, rust and salt stains, sand caught in the pores; stones are darker and smoother
    alb = mix(vec3(0.27, 0.26, 0.24), vec3(0.42, 0.4, 0.37), n.x) * vTint.rgb * (0.8 + 0.35 * vnoise(P.xz * 23.0 + P.y * 11.0));
    alb *= 0.85 + 0.3 * step(0.7, hash21(floor(P.xz * 140.0 + P.y * 90.0)));
    alb = mix(alb, vec3(0.42, 0.34, 0.24), smoothstep(0.62, 0.9, n.y) * 0.45);
    rough = 0.9;
  }
  // wet where the sand around is wet, darker still under the water (the water pass does the rest)
  vec2 lv = waterLevels(P.xz);
  float wet = 1.0 - smoothstep(lv.y + 0.01, lv.y + 0.12, P.y);
  alb *= mix(1.0, 0.6, wet);
  rough = mix(rough, 0.25, wet);
  float ao = mix(0.55, 1.0, smoothstep(-0.2, 0.6, N.y));
  vec3 L = uSunDir;
  float sh = cloudShadow(P);
  vec3 sun = uSunE * sh;
  vec3 diff = alb * INV_PI * max(dot(N, L), 0.0) * sun + alb * envIrradiance(N) * ao;
  vec2 eb = envBRDF(max(dot(N, V), 1e-3), rough);
  vec3 spec = vec3(specGGX(N, V, L, rough, 0.04)) * sun + envRadiance(reflect(-V, N), rough) * (0.04 * eb.x + eb.y) * ao;
  vec3 col = aerial(diff + spec, dist, -V);
  fragColor = vec4(col, 1.0);
}
`;

/** A clam valve: an oval dome with the umbo toward the hinge end, a thin rim. Unit length (x). */
function valveGeometry(seed: number, oyster: boolean): BufferGeometry {
  const r = mulberry32(seed);
  const n = new Noise2(seed);
  const U = 9, A = 22;
  const pos: number[] = [];
  const idx: number[] = [];
  const asp = oyster ? 0.5 + 0.3 * r() : 0.72 + 0.12 * r();
  const dome = oyster ? 0.15 + 0.07 * r() : 0.22 + 0.1 * r();
  const frill = 7 + Math.floor(r() * 5), fph = r() * 6.28;
  pos.push(-0.18, dome, 0);   // umbo
  for (let i = 1; i <= U; i++) {
    const t = i / U;
    for (let j = 0; j < A; j++) {
      const a = (j / A) * Math.PI * 2;
      let rx = 0.5, rz = 0.5 * asp;
      // oyster: a ragged outline, broken here and there
      if (oyster) { const w = 1 + 0.35 * n.noise(Math.cos(a) * 2, Math.sin(a) * 2) + 0.08 * n.noise(Math.cos(a) * 7 + 5, Math.sin(a) * 7); rx *= w; rz *= w; }
      // the outline bulges away from the hinge
      const x = Math.cos(a) * rx * t + (1 - t) * -0.18 + (Math.cos(a) > 0 ? 0.06 * t : 0);
      const z = Math.sin(a) * rz * t;
      // oyster: lumpy, layered growth, a frilled rim that rises and falls; clam: fine growth ridges
      const y = dome * Math.pow(1 - t * t, 0.85) + (oyster
        ? 0.035 * n.noise(x * 7, z * 7) + 0.012 * Math.sin(t * 26 + 2 * n.noise(x * 3, z * 3)) + 0.03 * t * t * t * Math.sin(a * frill + fph)
        : 0.006 * Math.sin(t * 40));
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < A; j++) idx.push(0, 1 + ((j + 1) % A), 1 + j);
  for (let i = 0; i < U - 1; i++) for (let j = 0; j < A; j++) {
    const a = 1 + i * A + j, b = 1 + i * A + ((j + 1) % A), c = a + A, d = b + A;
    idx.push(a, b, c, b, d, c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function pebbleGeometry(seed: number): BufferGeometry {
  const g = new IcosahedronGeometry(0.5, 2);
  const n = new Noise2(seed);
  const p = g.getAttribute('position');
  const v = new Vector3();
  const flat = 0.45 + 0.35 * mulberry32(seed)();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.12 * n.noise(v.x * 2.5 + 3, v.z * 2.5 + v.y * 2);
    v.multiplyScalar(k);
    v.y *= flat;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A broken concrete block (angular: a box with jittered, chipped corners, flat faces) or a rounded beach stone
 * (a low-poly lump), flat-shaded so the facets read.
 */
function blockGeometry(seed: number, angular: boolean): BufferGeometry {
  const r = mulberry32(seed);
  const n = new Noise2(seed);
  let g: BufferGeometry;
  if (angular) {
    g = new BoxGeometry(1, 1, 1, 2, 2, 2);
    const p = g.getAttribute('position');
    const v = new Vector3();
    const sx = 0.9 + 0.5 * r(), sy = 0.45 + 0.3 * r(), sz = 0.7 + 0.4 * r();
    // chip a couple of corners off
    const chips = [new Vector3(r() < 0.5 ? 1 : -1, 1, r() < 0.5 ? 1 : -1), new Vector3(r() < 0.5 ? 1 : -1, r() < 0.5 ? 1 : -1, r() < 0.5 ? 1 : -1)];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      for (const c of chips) if (Math.sign(v.x) === c.x && Math.sign(v.y) === c.y && Math.sign(v.z) === c.z && Math.abs(v.x) > 0.4 && Math.abs(v.y) > 0.4 && Math.abs(v.z) > 0.4) v.multiplyScalar(0.62 + 0.15 * r());
      v.x += 0.03 * n.noise(v.y * 3 + 1, v.z * 3);
      v.y += 0.03 * n.noise(v.x * 3 - 2, v.z * 3 + 5);
      v.z += 0.03 * n.noise(v.x * 3 + 7, v.y * 3);
      p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
    }
  } else {
    g = new IcosahedronGeometry(0.5, 1);
    const p = g.getAttribute('position');
    const v = new Vector3();
    const sx = 0.8 + 0.4 * r(), sy = 0.45 + 0.25 * r(), sz = 0.7 + 0.35 * r();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.multiplyScalar(1 + 0.16 * n.fbm(v.x * 2.2 + 1, v.z * 2.2 + v.y * 2, 2));
      p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
    }
  }
  const flat = g.index ? g.toNonIndexed() : g;
  flat.computeVertexNormals();
  return flat;
}

const CELL = 1;
const RADIUS = 26;
const MAX = 9000;

export class Debris {
  readonly group = new Group();
  private readonly meshes: { mesh: InstancedMesh; tint: InstancedBufferAttribute; kind: number }[] = [];
  private readonly material: ShaderMaterial;
  /** depth only, for the sun's shadow map: the same vertices (placed on the drawn ground) */
  private readonly shadowMaterial: ShaderMaterial;
  private readonly eye = new Vector2(1e9, 1e9);
  private lastX = 1e9;
  private lastZ = 1e9;

  constructor(private readonly field: FlatField, fieldU: FieldUniforms, sky: SkyUniforms, shared: Shared, envHeight: number) {
    const eyeU = { uEyeXZ: { value: this.eye } };
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      defines: { ...cubeUVDefines(envHeight) },
      uniforms: { ...fieldU, ...sky, ...shared, ...eyeU },
      vertexShader: VS,
      fragmentShader: FS,
      side: DoubleSide,
    });
    this.shadowMaterial = new ShaderMaterial({
      glslVersion: GLSL3,
      uniforms: { ...fieldU, ...shared, ...eyeU },
      vertexShader: VS,
      fragmentShader: /* glsl */ `out vec4 fragColor; void main() { fragColor = vec4(1.0); }`,
      side: DoubleSide,
    });
    this.group.name = 'debris';
    // variants: 4 clam valves, 2 oyster shells, 3 pebbles
    const geos: [BufferGeometry, number][] = [
      [valveGeometry(11, false), 0], [valveGeometry(23, false), 0], [valveGeometry(37, false), 0], [valveGeometry(41, false), 0],
      [valveGeometry(53, true), 1], [valveGeometry(67, true), 1],
      [pebbleGeometry(5), 2], [pebbleGeometry(9), 2], [pebbleGeometry(13), 2],
    ];
    for (const [g, kind] of geos) {
      const tint = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
      tint.setUsage(DynamicDrawUsage);
      g.setAttribute('aTint', tint);
      const mesh = new InstancedMesh(g, this.material, MAX);
      mesh.userData.shadowMaterial = this.shadowMaterial;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.meshes.push({ mesh, tint, kind });
    }
    // the big pieces on the upper beach
    const data = field.data;
    for (const [i, b] of data.boulders.entries()) {
      const g = blockGeometry(b.seed, b.kind === 0);
      const t = b.kind === 0 ? 1 : 0.55;
      g.setAttribute('aTint', new InstancedBufferAttribute(new Float32Array([t * (0.95 + 0.1 * ((i * 37) % 7) / 7), t * 0.95, t * 0.92, 3]), 4));
      const m = new InstancedMesh(g, this.material, 1);
      const y = field.heightAt(b.x, b.z) - b.r * 0.25;
      m.setMatrixAt(0, new Matrix4().compose(new Vector3(b.x, y, b.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), b.rot), new Vector3(b.r * 2.2, b.r * 2.2, b.r * 2.2)));
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  setEnv(env: Texture, envHeight: number): void {
    (this.material.uniforms.uEnv as IUniform<Texture>).value = env;
    const d = cubeUVDefines(envHeight);
    let changed = false;
    for (const [k, v] of Object.entries(d)) if (this.material.defines[k] !== v) { this.material.defines[k] = v; changed = true; }
    if (changed) this.material.needsUpdate = true;
  }

  /** Refill the instances around the walker when it has moved a few metres (x, z: the eye). */
  update(x: number, z: number): void {
    this.eye.set(x, z);
    if (Math.hypot(x - this.lastX, z - this.lastZ) < 3) return;
    this.lastX = x; this.lastZ = z;
    const f = this.field, d = f.data.fine;
    const counts = this.meshes.map(() => 0);
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), ax = new Vector3();
    const up = new Vector3(0, 1, 0);
    const c0x = Math.floor((x - RADIUS) / CELL), c1x = Math.floor((x + RADIUS) / CELL);
    const c0z = Math.floor((z - RADIUS) / CELL), c1z = Math.floor((z + RADIUS) / CELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const mx = (cx + 0.5) * CELL, mz = (cz + 0.5) * CELL;
      if ((mx - x) ** 2 + (mz - z) ** 2 > RADIUS * RADIUS) continue;
      const gi = Math.round((mx - d.origin) / d.cell), gj = Math.round((mz - d.origin) / d.cell);
      if (gi < 0 || gj < 0 || gi >= d.n || gj >= d.n) continue;
      const k = (gj * d.n + gi) * 4;
      const mud = d.mat[k] / 255, shell = d.mat[k + 1] / 255;
      const rnd = mulberry32(hash2i(cx, cz, 4242));
      // shells: a light scatter everywhere on sand, thick in the strand line and the creek lag
      const nShell = Math.floor((0.05 + shell * 4) * (1 - 0.8 * mud) * (0.4 + rnd() * 1.2) + (rnd() < 0.06 ? 1 : 0));
      const nPeb = Math.floor((0.03 + shell * 0.6) * (1 - mud) * (0.3 + rnd() * 1.4) + (rnd() < 0.04 ? 1 : 0));
      for (let t = 0; t < nShell + nPeb; t++) {
        const peb = t >= nShell;
        const vi = peb ? 6 + Math.floor(rnd() * 3) : rnd() < 0.18 ? 4 + Math.floor(rnd() * 2) : Math.floor(rnd() * 4);
        const slot = this.meshes[vi];
        if (counts[vi] >= MAX) continue;
        const px = cx * CELL + rnd() * CELL, pz = cz * CELL + rnd() * CELL;
        const size = peb ? 0.012 + 0.035 * rnd() * rnd() : slot.kind === 1 ? 0.03 + 0.04 * rnd() : 0.018 + 0.026 * rnd();
        // lying on the sand (the vertex shader puts them on the ground the terrain draws), sunk in by a varying
        // amount: some half buried, a few propped up on a crest; a few lie cupped (concave side up)
        const flip = !peb && rnd() < 0.15;
        const tilt = rnd() < 0.3 ? 0.35 : 0.12;
        const sink = peb ? 0.2 + 0.2 * rnd() : flip ? -0.2 : 0.03 + 0.3 * rnd() * rnd();
        q.setFromAxisAngle(up, rnd() * Math.PI * 2);
        if (flip) q.multiply(new Quaternion().setFromAxisAngle(ax.set(1, 0, 0), Math.PI));
        q.multiply(new Quaternion().setFromAxisAngle(ax.set(rnd() - 0.5, 0, rnd() - 0.5).normalize(), (rnd() - 0.5) * 2 * tilt));
        p.set(px, -size * sink, pz);
        s.setScalar(size);
        m.compose(p, q, s);
        const i = counts[vi]++;
        slot.mesh.setMatrixAt(i, m);
        const tv = (0.85 + 0.3 * rnd()) * (peb ? 1 : 0.82);
        if (peb) {
          const dark = rnd() < 0.3;
          slot.tint.setXYZW(i, dark ? 0.13 * tv : 0.3 * tv, dark ? 0.125 * tv : 0.25 * tv, dark ? 0.12 * tv : 0.2 * tv, 2);
        } else slot.tint.setXYZW(i, tv * (0.95 + 0.1 * rnd()), tv, tv * (0.9 + 0.12 * rnd()), slot.kind);
      }
    }
    this.meshes.forEach((s2, i) => {
      s2.mesh.count = counts[i];
      s2.mesh.instanceMatrix.needsUpdate = true;
      s2.tint.needsUpdate = true;
    });
  }
}
