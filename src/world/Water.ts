import {
  BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FrontSide, Mesh, MeshStandardMaterial, PlaneGeometry,
  RGBAFormat, RepeatWrapping, Vector2, type IUniform,
} from 'three';
import type { Terrain } from './Terrain';

/** Procedural tiling normal map (two octaves of value noise) for small ripples. */
function makeRippleNormalMap(size = 256): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  const hash = (x: number, y: number) => {
    let t = (x * 374761393 + y * 668265263) | 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x: number, y: number, period: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const w = (a: number, b: number) => hash(((a % period) + period) % period, ((b % period) + period) % period);
    return (w(ix, iy) * (1 - u) + w(ix + 1, iy) * u) * (1 - v) + (w(ix, iy + 1) * (1 - u) + w(ix + 1, iy + 1) * u) * v;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p1 = 8, p2 = 23;
    h[y * size + x] = vnoise((x / size) * p1, (y / size) * p1, p1) * 0.65 + vnoise((x / size) * p2, (y / size) * p2, p2) * 0.35;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
    const nx = (l - r) * 2.5, nz = (d - u) * 2.5;
    const len = Math.hypot(nx, nz, 1);
    const o = (y * size + x) * 4;
    data[o] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
    data[o + 1] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
    data[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
    data[o + 3] = 255;
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tide water: one large plane at the tide level plus one mesh per tide pool at its spill level. The shader samples the
 * terrain height texture to tint and fade the water by depth and to draw a thin foam line at the shore.
 */
export class Water {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly pools: Mesh[] = [];
  level = 0;
  private readonly uTime: IUniform<number> = { value: 0 };
  private readonly normalMap: DataTexture;

  constructor(private readonly terrain: Terrain) {
    this.normalMap = makeRippleNormalMap();
    this.material = new MeshStandardMaterial({
      color: new Color(0.12, 0.33, 0.36),
      roughness: 0.2,
      metalness: 0.0,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: FrontSide,
      normalMap: this.normalMap,
      normalScale: new Vector2(0.28, 0.28),
      envMapIntensity: 0.55,
    });
    const uTime = this.uTime;
    const half = terrain.half;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uHeightTex = { value: terrain.heightTexture };
      shader.uniforms.uHalf = { value: half };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPosW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWorldPosW;
uniform float uTime;
uniform sampler2D uHeightTex;
uniform float uHalf;
float hashW(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoiseW(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashW(i), hashW(i + vec2(1, 0)), f.x), mix(hashW(i + vec2(0, 1)), hashW(i + vec2(1, 1)), f.x), f.y); }`)
        // two drifting normal-map layers instead of one static one
        .replace('#include <normal_fragment_maps>', `
#ifdef USE_NORMALMAP
  vec2 wuv = vWorldPosW.xz * 0.35;
  vec3 mapN1 = texture2D( normalMap, wuv + vec2(uTime * 0.013, uTime * 0.009) ).xyz * 2.0 - 1.0;
  vec3 mapN2 = texture2D( normalMap, wuv * 1.9 + vec2(-uTime * 0.021, uTime * 0.006) ).xyz * 2.0 - 1.0;
  vec3 mapN = normalize(vec3((mapN1.xy + mapN2.xy) * normalScale, mapN1.z + mapN2.z));
  // the plane is horizontal: tangent frame is world x / z
  normal = normalize(vec3(mapN.x, mapN.z, mapN.y));
#endif`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 tuv = (vWorldPosW.xz + uHalf) / (2.0 * uHalf);
  float ground = texture2D(uHeightTex, tuv).r;
  float depth = vWorldPosW.y - ground;
  vec3 shallow = vec3(0.30, 0.40, 0.36);
  vec3 deep = vec3(0.07, 0.24, 0.30);
  diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 1.8, depth));
  float alpha = mix(0.10, 0.78, smoothstep(0.0, 1.6, depth));
  // foam at the waterline
  float foamN = vnoiseW(vWorldPosW.xz * 3.0 + vec2(uTime * 0.4, 0.0));
  float foam = (1.0 - smoothstep(0.0, 0.05 + 0.04 * foamN, depth)) * step(-0.02, depth);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.92), foam * 0.75);
  alpha = mix(alpha, 0.9, foam * 0.6);
  diffuseColor.a = alpha;
}`);
    };
    this.material.customProgramCacheKey = () => 'higata-water';

    const geo = new PlaneGeometry(2400, 2400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geo, this.material);
    this.mesh.renderOrder = 2;
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
  }

  setLevel(y: number): void {
    this.level = y;
    this.mesh.position.y = y;
    for (const p of this.pools) p.visible = p.userData.level > y + 0.01;
  }

  update(dt: number): void {
    this.uTime.value += dt;
  }

  /** Build a pool surface from fine-grid cell indices at a fixed level. */
  addPool(cells: Iterable<number>, level: number): Mesh {
    const t = this.terrain;
    const n = t.n;
    const verts: number[] = [];
    const idx: number[] = [];
    const vmap = new Map<number, number>();
    const vid = (i: number, j: number) => {
      const key = j * n + i;
      let v = vmap.get(key);
      if (v === undefined) {
        v = verts.length / 3;
        vmap.set(key, v);
        verts.push(-t.half + i * t.cell, 0, -t.half + j * t.cell);
      }
      return v;
    };
    for (const k of cells) {
      const i = k % n, j = Math.floor(k / n);
      if (i >= n - 1 || j >= n - 1) continue;
      // one quad per cell, extended one cell to cover the rim
      for (const [di, dj] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n - 1 || jj >= n - 1) continue;
        const key = `${ii},${jj}`;
        if ((this as unknown as { _seen?: Set<string> })._seen?.has(key)) continue;
        const a = vid(ii, jj), b = vid(ii, jj + 1), c = vid(ii + 1, jj), d = vid(ii + 1, jj + 1);
        idx.push(a, b, c, c, b, d);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.material);
    mesh.position.y = level;
    mesh.renderOrder = 1;
    mesh.userData.level = level;
    mesh.name = 'pool';
    this.pools.push(mesh);
    return mesh;
  }
}
