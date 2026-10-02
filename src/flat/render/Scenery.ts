import {
  BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, GLSL3, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, Object3D,
  Quaternion, ShaderMaterial, Vector3, type IUniform, type Texture,
} from 'three';
import { COMMON_GLSL } from './glsl/common';
import { LIGHTING_GLSL, cubeUVDefines } from './glsl/lighting';
import { ATMOS_GLSL, CLOUDS_GLSL, type SkyUniforms } from './Sky';
import { mulberry32, Noise2 } from '../gen/noise';
import { shoreLine, WALL_FOOT_ZZ, type FlatData } from '../gen/generate';

/**
 * What stands around the flat, all procedural:
 *  - the stepped concrete sea wall (階段護岸) along the back of the beach, with a tiled promenade and lamps;
 *  - black pines (クロマツ) in the park behind it, leaning, their foliage in irregular tiers;
 *  - the offshore breakwater on the horizon: a rubble mound of dark armour stone with a concrete crown;
 *  - rows of net poles out in the bay.
 * One shader with a few material branches; sun, sky light, cloud shadows and aerial perspective as everywhere.
 */
type Shared = { uNoise: IUniform<Texture>; uTime: IUniform<number>; uEnv: IUniform<Texture | null> };

const PROP_VS = /* glsl */ `
out vec3 vWorld;
out vec3 vN;
out vec2 vUv;
out float vSeed;
in vec2 aUv;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  vSeed = 0.0;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
    vSeed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.291);
  #endif
  vec4 w = modelMatrix * p;
  #ifdef FOLIAGE
    // the clumps are not spheres: push them in and out with a lumpy field (ragged tiers of needles)
    vec3 q = w.xyz * 0.9;
    float lump = vnoise(q.xz * 1.3 + q.y * 0.7) - 0.5 + 0.5 * (vnoise(q.xy * 2.9 - q.z) - 0.5);
    w.xyz += normalize(mat3(modelMatrix) * n) * lump * 0.9;
  #endif
  #ifdef ROCKY
    vec3 q = w.xyz;
    float b = vnoise(q.xz * 0.55 + q.y * 0.4) * 0.8 + vnoise(q.xz * 1.6) * 0.35;
    w.xyz += normalize(mat3(modelMatrix) * n) * (b - 0.55) * aUv.y;
  #endif
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vUv = aUv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const PROP_FS = /* glsl */ `
${COMMON_GLSL}
${ATMOS_GLSL}
${CLOUDS_GLSL}
${LIGHTING_GLSL}
uniform float uTide;
in vec3 vWorld;
in vec3 vN;
in vec2 vUv;
in float vSeed;
out vec4 fragColor;
void main() {
  vec3 P = vWorld;
  vec3 toEye = cameraPosition - P;
  float dist = length(toEye);
  vec3 V = toEye / dist;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float fw = max(length(fwidth(P)), 1e-4);
  vec3 alb = vec3(0.5);
  float rough = 0.85, ao = 1.0, trans = 0.0, wrap = 0.0;
  vec4 n1 = vnoise4(P.xz * 0.11 + P.y * 0.3), n2 = vnoise4(P.xz * 1.7 + P.y * 1.3 - 4.0);
  #ifdef CONCRETE
    // weathered concrete: rain streaks down the risers, sand blown onto the treads, joints every 10 m
    float riser = 1.0 - smoothstep(0.3, 0.7, abs(N.y));
    alb = vec3(0.47, 0.46, 0.43) * (0.86 + 0.2 * n1.x) * (0.92 + 0.12 * n2.x);
    float streak = smoothstep(0.55, 0.85, vnoise(vec2(vUv.x * 3.1, P.y * 0.25))) * riser;
    alb *= 1.0 - 0.18 * streak;
    alb = mix(alb, vec3(0.5, 0.45, 0.36), (1.0 - riser) * smoothstep(0.35, 0.7, n2.y) * smoothstep(4.4, 3.0, P.y) * 0.7);
    float joint = 1.0 - smoothstep(0.012, 0.03, abs(fract(vUv.x / 10.0 + 0.5) - 0.5) * 10.0);
    alb *= 1.0 - 0.45 * joint * (1.0 - smoothstep(0.02, 0.06, fw));
    // the promenade's tiles
    if (vUv.y > 9.0 && N.y > 0.8) {
      vec2 tl = vec2(vUv.x, vUv.y) / 0.6;
      float g = min(abs(fract(tl.x) - 0.5), abs(fract(tl.y) - 0.5));
      alb = vec3(0.5, 0.46, 0.42) * (0.85 + 0.25 * hash21(floor(tl) + 7.0));
      alb *= 1.0 - 0.3 * (1.0 - smoothstep(0.43, 0.47, 0.5 - g)) * (1.0 - smoothstep(0.01, 0.03, fw));
    }
    // edges are chipped and dirtier
    ao = 0.9 + 0.1 * n2.z;
    rough = 0.9;
  #endif
  #ifdef ROCK
    // armour stone: dark, wet and stained below the tide's reach, lighter and dry above
    alb = mix(vec3(0.16, 0.15, 0.14), vec3(0.3, 0.28, 0.25), n1.y) * (0.8 + 0.4 * n2.x);
    float wet = 1.0 - smoothstep(uTide + 0.2, uTide + 1.6, P.y);
    alb = mix(alb, alb * vec3(0.45, 0.45, 0.42), wet);
    alb = mix(alb, vec3(0.05, 0.05, 0.045), (1.0 - smoothstep(uTide - 0.2, uTide + 0.9, P.y)) * 0.6);
    rough = mix(0.85, 0.45, wet);
    if (vUv.y < 0.05) { alb = vec3(0.44, 0.43, 0.4) * (0.85 + 0.25 * n2.y); rough = 0.85; }   // the concrete crown
  #endif
  #ifdef WOOD
    alb = vec3(0.13, 0.11, 0.09) * (0.8 + 0.4 * vSeed);
    float wet = 1.0 - smoothstep(uTide + 0.1, uTide + 0.8, P.y);
    alb *= mix(1.0, 0.6, wet);
    rough = 0.8;
  #endif
  #ifdef METAL
    alb = vec3(0.16, 0.17, 0.17);
    rough = 0.5;
  #endif
  #ifdef BARK
    alb = vec3(0.16, 0.12, 0.09) * (0.75 + 0.5 * vnoise(vec2(P.y * 6.0, atan(N.z, N.x) * 3.0)));
    rough = 0.95;
  #endif
  #ifdef FOLIAGE
    // ragged edges: needle tufts and gaps where the clump is seen edge-on
    float rim = 1.0 - abs(dot(normalize(vN), V));
    float gap = vnoise(P.xz * 4.0 + P.y * 2.5) * 0.6 + vnoise(P.xy * 9.0 - P.z * 4.0) * 0.4;
    if (gap > 0.86 - 0.5 * rim) discard;
    // black pine needles: dark, slightly blue-green, lighter where the sun catches the tips
    alb = vec3(0.038, 0.056, 0.034) * (0.75 + 0.5 * vSeed) * (0.8 + 0.4 * n2.y);
    alb *= 0.85 + 0.3 * vnoise(P.xz * 7.0 + P.y * 5.0);
    vec3 nd = vec3(vnoise(P.xz * 3.1 + P.y) - 0.5, 0.0, vnoise(P.zy * 3.3 - P.x) - 0.5);
    // a pad is lit from above as a whole: its normal leans up, the underside and the inside stay in shade
    N = normalize(N + nd * 1.4 + vec3(0.0, 0.5, 0.0));
    float inner = normalize(vN).y * 0.5 + 0.5;
    ao = mix(0.28, 1.0, inner * inner) * (0.7 + 0.3 * n2.z);
    rough = 0.8;
    trans = 0.35;
    wrap = 0.4;
  #endif
  vec3 L = uSunDir;
  float sh = cloudShadow(P);
  float NoL = (dot(N, L) + wrap) / (1.0 + wrap);
  vec3 sun = uSunE * sh;
  vec3 diff = alb * INV_PI * max(NoL, 0.0) * sun + alb * envIrradiance(N) * ao;
  diff += alb * sun * trans * pow(max(dot(-V, L), 0.0), 4.0) * 0.5;
  vec3 R = reflect(-V, N);
  vec2 eb = envBRDF(max(dot(N, V), 1e-3), rough);
  vec3 spec = vec3(specGGX(N, V, L, rough, 0.04)) * sun + envRadiance(R, rough) * (0.04 * eb.x + eb.y) * ao;
  vec3 col = diff + spec;
  col = aerial(col, dist, -V);
  fragColor = vec4(col, 1.0);
}
`;

export class Scenery {
  readonly group = new Group();
  private readonly materials: ShaderMaterial[] = [];

  constructor(private readonly data: FlatData, sky: SkyUniforms, shared: Shared, tide: IUniform<number>, envHeight: number) {
    const mk = (define: string, extra: Record<string, string> = {}, side = false) => {
      const m = new ShaderMaterial({
        glslVersion: GLSL3,
        defines: { ...cubeUVDefines(envHeight), [define]: '', ...extra },
        uniforms: { ...sky, ...shared, uTide: tide },
        vertexShader: `${COMMON_GLSL}\n${PROP_VS}`,
        fragmentShader: PROP_FS,
        side: side ? DoubleSide : undefined,
      });
      this.materials.push(m);
      return m;
    };
    const shore = shoreLine(data.seed, data.shore);
    this.group.add(this.seaWall(shore, mk('CONCRETE')));
    this.group.add(this.lamps(shore, mk('METAL')));
    for (const m of this.pines(shore, mk('BARK', {}, true), mk('FOLIAGE', { FOLIAGE: '' }, true))) this.group.add(m);
    this.group.add(this.breakwater(mk('ROCK', { ROCKY: '' }, true)));
    this.group.add(this.poles(mk('WOOD')));
    // instanced props are culled as a whole by the bounds of all their instances (the pines behind the wall are
    // skipped while one looks out to sea); the vertex shader's lumps reach a little past the geometry
    this.group.traverse((o) => {
      if (!(o instanceof InstancedMesh)) return;
      o.computeBoundingSphere();
      if (o.boundingSphere) o.boundingSphere.radius += 2;
    });
  }

  setEnv(env: Texture, envHeight: number): void {
    const d = cubeUVDefines(envHeight);
    for (const m of this.materials) {
      (m.uniforms.uEnv as IUniform<Texture>).value = env;
      let changed = false;
      for (const [k, v] of Object.entries(d)) if (m.defines[k] !== v) { m.defines[k] = v; changed = true; }
      if (changed) m.needsUpdate = true;
    }
  }

  /** Stepped revetment: five 0.4 m steps from the beach up to a tiled promenade, following the shore line. */
  private seaWall(shore: (x: number) => number, mat: ShaderMaterial): Mesh {
    const RISE = 0.4, TREAD = 1.45, Y0 = 2.5;
    const sec: [number, number][] = [];
    let zz = WALL_FOOT_ZZ + 0.4;
    sec.push([zz, Y0 - 0.5]);
    for (let k = 0; k < 5; k++) {
      sec.push([zz, Y0 + RISE * (k + 1)]);
      zz -= TREAD;
      sec.push([zz, Y0 + RISE * (k + 1)]);
    }
    sec.push([zz, 4.8]);
    sec.push([-192, 4.8]);
    sec.push([-192, 4.6]);
    sec.push([-194, 4.55]);
    // cross-section distance (for the shader's uv.y)
    const sd: number[] = [0];
    for (let i = 1; i < sec.length; i++) sd.push(sd[i - 1] + Math.hypot(sec[i][0] - sec[i - 1][0], sec[i][1] - sec[i - 1][1]));
    const xs: number[] = [];
    for (let x = -1600; x <= 1600; x += Math.abs(x) < 320 ? 1 : 4) xs.push(x);
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    const idx: number[] = [];
    let s = 0;
    const along: number[] = [];
    for (let i = 0; i < xs.length; i++) { if (i > 0) s += Math.hypot(xs[i] - xs[i - 1], shore(xs[i]) - shore(xs[i - 1])); along.push(s); }
    const shoreAt = xs.map((x) => shore(x));
    for (let f = 0; f < sec.length - 1; f++) {
      const [z0, y0] = sec[f], [z1, y1] = sec[f + 1];
      const base = pos.length / 3;
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i], sz = shoreAt[i];
        const dzdx = i > 0 && i < xs.length - 1 ? (shoreAt[i + 1] - shoreAt[i - 1]) / (xs[i + 1] - xs[i - 1]) : 0;
        // face normal: the section's tangent turned toward the sea (risers) or the sky (treads), then laid
        // perpendicular to the shore line
        const dy = y1 - y0, dzz = z1 - z0;
        const ls = Math.hypot(dy, dzz) || 1;
        const sz2 = dy / ls, sy2 = -dzz / ls;
        let nx = -dzdx * sz2, ny = sy2, nz = sz2;
        const ln = Math.hypot(nx, ny, nz) || 1;
        nx /= ln; ny /= ln; nz /= ln;
        for (const [zzv, yv, d] of [[z0, y0, sd[f]], [z1, y1, sd[f + 1]]]) {
          pos.push(x, yv, sz + zzv);
          nor.push(nx, ny, nz);
          uv.push(along[i], d);
        }
      }
      for (let i = 0; i < xs.length - 1; i++) {
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('aUv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new Mesh(g, mat);
    m.name = 'sea-wall';
    return m;
  }

  private lamps(shore: (x: number) => number, mat: ShaderMaterial): InstancedMesh {
    const post = new CylinderGeometry(0.055, 0.075, 4.2, 8, 1).translate(0, 2.1, 0);
    const xs: number[] = [];
    for (let x = -600; x <= 600; x += 27) xs.push(x);
    const im = new InstancedMesh(withUv(post), mat, xs.length);
    const o = new Object3D();
    xs.forEach((x, i) => {
      o.position.set(x, 4.8, shore(x) - 189.5);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.name = 'lamps';
    return im;
  }

  /**
   * Black pines: a trunk in two leaning segments (they grow crooked in the sea wind), branches reaching out at
   * random heights and azimuths, and the foliage as ragged clumps at the branch ends — tiers, not a ball on a stick.
   */
  private pines(shore: (x: number) => number, bark: ShaderMaterial, foliage: ShaderMaterial): InstancedMesh[] {
    const r = mulberry32(this.data.seed + 909);
    const n = new Noise2(this.data.seed + 919);
    const trees: { x: number; z: number; h: number }[] = [];
    for (let t = 0; t < 12000 && trees.length < 460; t++) {
      const x = (r() * 2 - 1) * 700;
      const zz = -199 - r() * 80;
      const z = shore(x) + zz;
      // groves and open lawns
      if (n.fbm(x / 70, z / 70, 2) < -0.1 && zz < -206) continue;
      if (trees.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 42)) continue;
      trees.push({ x, z, h: 6 + r() * 9 });
    }
    const cyl = withUv(new CylinderGeometry(0.5, 0.5, 1, 6, 1, true).translate(0, 0.5, 0));
    const clumpGeo = withUv(new IcosahedronGeometry(1, 1));
    const woods: Matrix4[] = [], clumps: Matrix4[] = [];
    const up = new Vector3(0, 1, 0);
    const seg = (a: Vector3, b: Vector3, rad0: number) => {
      const d = b.clone().sub(a), len = d.length();
      const q = new Quaternion().setFromUnitVectors(up, d.normalize());
      woods.push(new Matrix4().compose(a, q, new Vector3(rad0 * 2, len, rad0 * 2)));
    };
    // a pad of needles (the tiers of a black pine): a few overlapping lumps around the branch end, so its outline is
    // ragged and its top uneven — never one smooth disc
    const pad = (c: Vector3, R: number, T: number) => {
      const k = 3 + Math.floor(r() * 3);
      for (let i = 0; i < k; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.6;
        const p = c.clone().add(new Vector3(Math.cos(a) * d, (r() - 0.4) * T * 0.35, Math.sin(a) * d));
        const rh = R * (0.42 + 0.3 * r()), rv = T * (0.55 + 0.35 * r());
        clumps.push(new Matrix4().compose(p, new Quaternion().setFromAxisAngle(up, r() * 6.28), new Vector3(rh, rv, rh * (0.75 + 0.4 * r()))));
      }
    };
    for (const tr of trees) {
      const base = new Vector3(tr.x, 4.5, tr.z);
      const dir = r() * Math.PI * 2, lean1 = r() * 0.25, lean2 = lean1 + (r() - 0.3) * 0.35;
      const h1 = tr.h * (0.45 + 0.15 * r());
      const mid = base.clone().add(new Vector3(Math.cos(dir) * Math.sin(lean1), Math.cos(lean1), Math.sin(dir) * Math.sin(lean1)).multiplyScalar(h1));
      const d2 = dir + (r() - 0.5) * 1.2;
      const top = mid.clone().add(new Vector3(Math.cos(d2) * Math.sin(lean2), Math.cos(lean2), Math.sin(d2) * Math.sin(lean2)).multiplyScalar(tr.h - h1));
      const rad = 0.12 + tr.h * 0.012;
      seg(base, mid, rad);
      seg(mid, top, rad * 0.75);
      // branches and their foliage
      const nb = 4 + Math.floor(r() * 5);
      for (let b = 0; b < nb; b++) {
        const f = 0.5 + 0.5 * (b / nb) + (r() - 0.5) * 0.1;
        const start = f < 0.5 * (h1 / tr.h) ? base.clone().lerp(mid, f * tr.h / h1) : mid.clone().lerp(top, Math.min(1, (f * tr.h - h1) / (tr.h - h1)));
        const az = r() * Math.PI * 2, rise = 0.15 + r() * 0.45, len = (1.2 + 3.2 * (1 - f) + r()) * (0.7 + tr.h / 20);
        const end = start.clone().add(new Vector3(Math.cos(az) * Math.cos(rise), Math.sin(rise), Math.sin(az) * Math.cos(rise)).multiplyScalar(len));
        seg(start, end, rad * 0.32);
        const nc = 1 + Math.floor(r() * 2.2);
        for (let c = 0; c < nc; c++) {
          const p = end.clone().add(new Vector3((r() - 0.5) * 1.2, 0.2 + r() * 0.4, (r() - 0.5) * 1.2));
          pad(p, 1.0 + r() * 1.2 + len * 0.15, 0.6 + r() * 0.5);
        }
      }
      // the crown
      const nt = 1 + Math.floor(r() * 2);
      for (let c = 0; c < nt; c++) {
        const p = top.clone().add(new Vector3((r() - 0.5) * 1.5, -0.2 + r() * 0.5, (r() - 0.5) * 1.5));
        pad(p, 1.3 + r() * 1.4, 0.75 + r() * 0.5);
      }
    }
    const wood = new InstancedMesh(cyl, bark, woods.length);
    woods.forEach((m, i) => wood.setMatrixAt(i, m));
    const foli = new InstancedMesh(clumpGeo, foliage, clumps.length);
    clumps.forEach((m, i) => foli.setMatrixAt(i, m));
    wood.name = 'pine-wood';
    foli.name = 'pine-foliage';
    return [wood, foli];
  }

  /** The detached breakwater ~0.7–0.8 km out: armour-stone mound with a concrete crown, 1.3 km long. */
  private breakwater(mat: ShaderMaterial): Mesh {
    const A = new Vector3(-160, 0, 790), B = new Vector3(1180, 0, 700);
    const L = A.distanceTo(B), dir = B.clone().sub(A).normalize(), side = new Vector3(-dir.z, 0, dir.x);
    // half cross-section from the crown's centre outward: [offset, height, rocky]
    const half: [number, number, number][] = [[0, 3.05, 0], [2.6, 3.05, 0], [2.7, 2.7, 0.6], [4.5, 2.2, 1], [7, 0.6, 1], [9.5, -1, 1], [12, -2.6, 1], [14.5, -4.2, 0.8]];
    const sec = [...half.slice().reverse().map(([o, y, k]) => [-o, y, k]), ...half.slice(1)];
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    const idx: number[] = [];
    const steps = Math.round(L / 1.2);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const c = A.clone().lerp(B, u);
      c.z += Math.sin(u * Math.PI) * -25;
      // the ends round off into heads
      const endK = Math.min(1, Math.min(u, 1 - u) * L / 18);
      for (const [o, y, k] of sec) {
        const yy = y * (0.55 + 0.45 * endK) + (endK < 1 ? (1 - endK) * -1.6 : 0);
        const p = c.clone().addScaledVector(side, o * (0.7 + 0.3 * endK));
        pos.push(p.x, yy, p.z);
        nor.push(side.x * Math.sign(o) * 0.8, 0.6, side.z * Math.sign(o) * 0.8);
        uv.push(u * L, k * 1.4);
      }
    }
    const nsec = sec.length;
    for (let i = 0; i < steps; i++) for (let j = 0; j < nsec - 1; j++) {
      const a = i * nsec + j, b = a + 1, c = a + nsec, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('aUv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new Mesh(g, mat);
    m.name = 'breakwater';
    return m;
  }

  /** Net poles: crooked rows of thin poles standing out of the bay. */
  private poles(mat: ShaderMaterial): InstancedMesh {
    const r = mulberry32(this.data.seed + 777);
    const list: Matrix4[] = [];
    const rows = [[-90, 430, 330], [-70, 452, 300], [-40, 474, 260], [420, 520, 180], [430, 545, 160]];
    for (const [x0, z0, len] of rows) {
      for (let x = x0; x < x0 + len; x += 7 + r() * 5) {
        if (r() < 0.12) continue;
        const h = 4.2 + r() * 1.6;
        const p = new Vector3(x + (r() - 0.5) * 2, -2.3, z0 + (r() - 0.5) * 3 + (x - x0) * 0.04);
        const q = new Quaternion().setFromAxisAngle(new Vector3(r() - 0.5, 0, r() - 0.5).normalize(), (r() - 0.5) * 0.12);
        list.push(new Matrix4().compose(p, q, new Vector3(1, h, 1)));
      }
    }
    const geo = withUv(new CylinderGeometry(0.045, 0.06, 1, 5, 1).translate(0, 0.5, 0));
    const im = new InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.name = 'poles';
    return im;
  }
}

/** The prop shader reads aUv; give stock geometries one (zeros, or their uv when they have it). */
function withUv(g: BufferGeometry): BufferGeometry {
  const n = g.getAttribute('position').count;
  const src = g.getAttribute('uv');
  const a = new Float32Array(n * 2);
  if (src) for (let i = 0; i < n; i++) { a[i * 2] = src.getX(i); a[i * 2 + 1] = src.getY(i); }
  g.setAttribute('aUv', new BufferAttribute(a, 2));
  return g;
}
