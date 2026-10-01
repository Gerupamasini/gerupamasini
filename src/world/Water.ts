import {
  BufferAttribute, BufferGeometry, Color, DataTexture, FrontSide, Mesh, MeshStandardMaterial, PlaneGeometry,
  RGBAFormat, RepeatWrapping, Vector2, Vector3, type IUniform,
} from 'three';
import type { Terrain } from './Terrain';

/** Procedural tiling normal map (two octaves of value noise) for wind ripples. */
export function makeRippleNormalMap(size = 256): DataTexture {
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

/** GLSL shared by the field water and the tank: three drifting ripple layers combined into a view-space normal. */
export const RIPPLE_NORMAL_GLSL = `
#ifdef USE_NORMALMAP
  vec2 wuv = vWorldPosW.xz;
  vec3 r1 = texture2D( normalMap, wuv * uRippleScale.x + vec2(uTime * 0.010, uTime * 0.007) ).xyz * 2.0 - 1.0;
  vec3 r2 = texture2D( normalMap, wuv * uRippleScale.y + vec2(-uTime * 0.021, uTime * 0.014) ).xyz * 2.0 - 1.0;
  vec3 r3 = texture2D( normalMap, wuv * uRippleScale.z + vec2(uTime * 0.035, -uTime * 0.028) ).xyz * 2.0 - 1.0;
  vec2 slopes = (r1.xy * 1.0 + r2.xy * 0.6 + r3.xy * 0.35) * normalScale;
  vec3 worldN = normalize(vec3(slopes.x, 1.0, slopes.y));
  normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
#endif`;

/**
 * Clear tidal water: Beer–Lambert tint with depth read from the terrain height texture (shallow = clear, deeper =
 * turquoise), Fresnel-weighted opacity so the surface mirrors the sky at grazing angles, three scales of wind ripples
 * with sun glitter, and a thin foam line at the shore. Pools reuse the material at their own level.
 */
export class Water {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly pools: Mesh[] = [];
  level = 0;
  private readonly uTime: IUniform<number> = { value: 0 };
  private readonly uSunUp: IUniform<number> = { value: 1 };
  private readonly normalMap: DataTexture;

  constructor(private readonly terrain: Terrain) {
    this.normalMap = makeRippleNormalMap();
    this.material = new MeshStandardMaterial({
      color: new Color(0.2, 0.55, 0.58),
      roughness: 0.07,
      metalness: 0.0,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: FrontSide,
      normalMap: this.normalMap,
      normalScale: new Vector2(0.22, 0.22),
      envMapIntensity: 1.0,
    });
    const uTime = this.uTime, uSunUp = this.uSunUp;
    const half = terrain.half;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uSunUp = uSunUp;
      shader.uniforms.uHeightTex = { value: terrain.heightTexture };
      shader.uniforms.uHalf = { value: half };
      shader.uniforms.uRippleScale = { value: new Vector3(0.045, 0.3, 1.7) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPosW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWorldPosW;
uniform float uTime;
uniform float uSunUp;
uniform sampler2D uHeightTex;
uniform float uHalf;
uniform vec3 uRippleScale;
float hashW(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoiseW(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashW(i), hashW(i + vec2(1, 0)), f.x), mix(hashW(i + vec2(0, 1)), hashW(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <normal_fragment_maps>', RIPPLE_NORMAL_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 tuv = (vWorldPosW.xz + uHalf) / (2.0 * uHalf);
  float ground = texture2D(uHeightTex, tuv).r;
  float depth = max(0.0, vWorldPosW.y - ground);
  // light path through the water ≈ 2 × depth (down and back up); red is absorbed first
  vec3 absorb = vec3(0.75, 0.22, 0.12);
  vec3 T = exp(-absorb * depth * 2.0);
  float Tavg = dot(T, vec3(0.333));
  vec3 scatter = vec3(0.3, 0.66, 0.64);
  // body colour: what the water adds in front of the bed; the bed itself shows through (1 - alpha)
  diffuseColor.rgb = scatter * (1.0 - T) + vec3(0.2, 0.3, 0.3) * T;
  float alpha = 1.0 - Tavg * (1.0 - 0.08);
  // Fresnel: the surface mirrors the sky at grazing angles
  vec3 V = normalize(vViewPosition);
  float NdV = clamp(dot(normalize(vNormal), V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  alpha = mix(alpha, 1.0, F);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48, 0.58, 0.65) * (0.3 + 0.7 * uSunUp), F * 0.85);
  // foam at the waterline
  float foamN = vnoiseW(vWorldPosW.xz * 3.0 + vec2(uTime * 0.4, 0.0));
  float edge = vWorldPosW.y - ground;
  float foam = (1.0 - smoothstep(0.0, 0.05 + 0.05 * foamN, edge)) * step(-0.02, edge);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.94), foam * 0.8);
  alpha = mix(alpha, 0.92, foam * 0.7);
  diffuseColor.a = alpha;
}`);
    };
    this.material.customProgramCacheKey = () => 'higata-water-v2';

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

  update(dt: number, sunUp = 1): void {
    this.uTime.value += dt;
    this.uSunUp.value = sunUp;
  }

  /** Build a pool surface from fine-grid cell indices at a fixed level. */
  addPool(cells: Iterable<number>, level: number): Mesh {
    const t = this.terrain;
    const n = t.n;
    const verts: number[] = [];
    const idx: number[] = [];
    const vmap = new Map<number, number>();
    const seen = new Set<number>();
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
      for (const [di, dj] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n - 1 || jj >= n - 1) continue;
        const key = jj * n + ii;
        if (seen.has(key)) continue;
        seen.add(key);
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
