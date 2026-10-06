import {
  BufferGeometry, Color, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type Camera,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, hashInts } from '../core/Rng';
import { oysterEnv } from '../creatures/oyster/material';
import type { Terrain } from './Terrain';

/**
 * 捨て石・護岸: the hard ground oysters need on a sandy, muddy flat. Quarried stones (割石) laid along the inner toe
 * of both levees where they run down into the water, heaped over the levees' drowned tips, and a few old rubble
 * mounds out on the low flat. Stones are a handful of shared shapes drawn instanced, in chunks along the shore so
 * each chunk can be culled and given its level of detail.
 *
 * The stones are also what the oyster placement reads: every stone's upward-facing faces in the oyster zone (about
 * mean sea level down to low water) are offered as attachment sites, with the face's normal.
 */

// ---------------------------------------------------------------------------------------------- one stone

function vnoise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number, c: number) => hashInts(ix + a, iy + b, iz + c, seed) / 4294967296;
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}

/**
 * A quarried stone shape: a boxy superellipsoid cut by a few fracture planes into flat faces with blunt edges, and
 * roughened by noise. The surface is a function of direction from the centre, so it can be queried anywhere (for
 * settling oysters on it) as well as meshed.
 */
export class RockShape {
  private readonly sx: number;
  private readonly sy: number;
  private readonly sz: number;
  private readonly pe: number;
  private readonly cuts: { n: Vector3; o: number }[] = [];
  private readonly d = new Vector3();

  constructor(readonly seed: number) {
    const rng = new Rng(hashInts(seed, 0x50c));
    this.sx = rng.range(0.8, 1.25); this.sy = rng.range(0.5, 0.85); this.sz = rng.range(0.75, 1.2);
    this.pe = rng.range(2.2, 3.2);
    for (let i = 0, n = rng.int(6, 11); i < n; i++) {
      const nn = new Vector3(rng.range(-1, 1), rng.range(-0.6, 1), rng.range(-1, 1)).normalize();
      this.cuts.push({ n: nn, o: rng.range(0.45, 0.8) });
    }
  }

  private readonly t0 = new Vector3();
  private readonly t1 = new Vector3();

  /**
   * The surface point that lies on the ray from the centre toward `dir` (the shape is parameterised by a sphere
   * direction that its stretching and cuts bend, so the parameter is solved for: a scaled first guess, then a few
   * fixed-point corrections).
   */
  alongRay(dir: Vector3, out: Vector3): Vector3 {
    const t = this.t0.copy(dir).normalize();
    const d = this.t1.set(t.x / this.sx, t.y / this.sy, t.z / this.sz).normalize();
    for (let i = 0; i < 8; i++) {
      this.point(d, out);
      const l = out.length() || 1;
      d.x += t.x - out.x / l; d.y += t.y - out.y / l; d.z += t.z - out.z / l;
      d.normalize();
    }
    return this.point(d, out);
  }

  /** the surface point for a sphere direction (unit size: about 1 across) */
  point(dir: Vector3, out: Vector3): Vector3 {
    const d = this.d.copy(dir).normalize();
    const pe = this.pe;
    const r = 1 / Math.pow(Math.pow(Math.abs(d.x), pe) + Math.pow(Math.abs(d.y), pe) + Math.pow(Math.abs(d.z), pe), 1 / pe);
    out.copy(d).multiplyScalar(r);
    out.x *= this.sx; out.y *= this.sy; out.z *= this.sz;
    for (const c of this.cuts) {
      const k = out.dot(c.n) - c.o;
      if (k > 0) out.addScaledVector(c.n, -k * 0.98);
    }
    const seed = this.seed;
    const n1 = vnoise3(out.x * 2.2, out.y * 2.2, out.z * 2.2, seed) - 0.5, n2 = vnoise3(out.x * 7, out.y * 7, out.z * 7, seed + 1) - 0.5, n3 = vnoise3(out.x * 19, out.y * 19, out.z * 19, seed + 2) - 0.5;
    out.multiplyScalar(0.5 * (1 + 0.06 * n1 + 0.04 * n2 + 0.015 * n3));
    return out;
  }
}

/** A mesh of a stone shape, `size` metres across. */
export function makeRockGeometry(seed: number, size = 0.6, detail = 4): BufferGeometry {
  const shape = new RockShape(seed);
  let g: BufferGeometry = new IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.getAttribute('position');
  const d = new Vector3(), q = new Vector3();
  for (let i = 0; i < p.count; i++) {
    d.set(p.getX(i), p.getY(i), p.getZ(i));
    shape.point(d, q).multiplyScalar(size);
    p.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const ROCK_COMMON = /* glsl */ `
varying vec3 vRkWorld;
uniform vec2 uOyWater;
uniform float uOyWetOverride;
float rkH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rkN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkH(i), rkH(i + vec3(1,0,0)), f.x), mix(rkH(i + vec3(0,1,0)), rkH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rkH(i + vec3(0,0,1)), rkH(i + vec3(1,0,1)), f.x), mix(rkH(i + vec3(0,1,1)), rkH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float rkF(vec3 p) { return 0.5 * rkN(p) + 0.28 * rkN(p * 2.07 + 3.1) + 0.14 * rkN(p * 4.3 + 7.7) + 0.08 * rkN(p * 9.1 + 1.3); }
vec3 rkLin(vec3 c) { return pow(c, vec3(2.2)); }
vec2 rkH2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
// cellular plates in a plane: (F1, F2 − F1, cell id) — each cell one old shell of the crust
vec3 rkCells(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = rkH2(i + g);
    // elongated cells: oysters are longer than wide
    vec2 d = (g + o - f) * vec2(1.0, 1.6);
    float dd = length(d);
    if (dd < f1) { f2 = f1; f1 = dd; id = i + g; } else if (dd < f2) f2 = dd;
  }
  return vec3(f1, f2 - f1, rkH2(id).x);
}
`;

/**
 * Stone material: grey andesite with darker grains, stained in its intertidal band — brown-grey biofilm and silt below
 * the high-water line, the white bases of dead barnacles dotted round mid-tide, green algae low down — and wet as far
 * up as the water lately reached (the same wet mark the flat and the oysters use).
 */
export function makeRockMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uOyWater: oysterEnv.uOyWater, uOyWetOverride: oysterEnv.uOyWetOverride });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRkWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 rkW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  rkW = instanceMatrix * rkW;
#endif
  vRkWorld = (modelMatrix * rkW).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ROCK_COMMON}`)
      .replace('#include <map_fragment>', `
vec3 rkP = vRkWorld;
float rkBig = rkF(rkP * 2.3), rkMid = rkF(rkP * 11.0), rkFine = rkN(rkP * 260.0);
// grey andesite, blotched lighter and darker, fine dark and pale grains
vec3 rkCol = mix(rkLin(vec3(0.5, 0.5, 0.48)), rkLin(vec3(0.66, 0.65, 0.62)), smoothstep(0.25, 0.75, rkBig));
rkCol *= 0.8 + 0.35 * rkMid;
rkCol *= 0.88 + 0.24 * rkFine;
rkCol = mix(rkCol, rkLin(vec3(0.22, 0.22, 0.21)), step(0.86, rkN(rkP * 420.0)) * 0.45);
float rkY = rkP.y;
// intertidal band: biofilm and silt from the high-water line down
float rkStain = 1.0 - smoothstep(0.55, 1.15, rkY + 0.25 * (rkMid - 0.5));
rkCol = mix(rkCol, rkCol * rkLin(vec3(0.72, 0.68, 0.6)), rkStain * 0.8);
// dead barnacle bases: small white rings round mid-tide
// a 3D cell pattern so the rings are round on every face: one candidate base per cell, most cells empty
vec3 rkC = rkP * 70.0, rkI = floor(rkC);
float rkRing = 0.0;
for (int k = 0; k < 8; k++) {
  vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
  vec3 cell = rkI + o;
  if (rkH(cell + 0.37) < 0.86) continue;
  vec3 c = cell + vec3(rkH(cell + 1.1), rkH(cell + 2.3), rkH(cell + 3.7)) * 0.6 + 0.2;
  float r0 = 0.18 + 0.15 * rkH(cell + 5.1);
  float d = length(rkC - c);
  rkRing = max(rkRing, 1.0 - smoothstep(0.02, 0.07, abs(d - r0)));
}
float rkBarnZone = smoothstep(-0.6, -0.1, rkY) * (1.0 - smoothstep(0.4, 0.9, rkY));
rkCol = mix(rkCol, rkLin(vec3(0.7, 0.68, 0.64)), rkRing * rkBarnZone * 0.45);
// green algae low on the stone, on what faces up
vec3 rkNw = normalize(cross(dFdx(vRkWorld), dFdy(vRkWorld)));
float rkAlg = (1.0 - smoothstep(-0.7, 0.1, rkY)) * smoothstep(0.2, 0.8, rkNw.y) * smoothstep(0.45, 0.7, rkF(rkP * 5.0 + 11.0));
rkCol = mix(rkCol, rkLin(vec3(0.16, 0.27, 0.09)), rkAlg * 0.8);
// the oyster zone: a crust of old shell and cemented lower valves, plates of grey-white with dark seams and
// growth rings, on every face but the undersides (what the instanced reef stands on, and what it looks like from afar)
vec3 rkNa = abs(rkNw);
vec2 rkPl = rkNa.y > max(rkNa.x, rkNa.z) ? rkP.xz : rkNa.x > rkNa.z ? rkP.zy : rkP.xy;
vec2 rkW = rkPl * 16.0 + (vec2(rkF(rkP * 5.0), rkF(rkP * 5.0 + 9.0)) - 0.5) * 1.4;
vec3 rkCell = rkCells(rkW);
vec3 rkCell2 = rkCells(rkW * 2.3 + 5.0);
float rkZone = smoothstep(-1.35, -1.05, rkY) * (1.0 - smoothstep(0.15, 0.45, rkY + 0.1 * (rkMid - 0.5)));
float rkCrust = rkZone * smoothstep(-0.35, 0.2, rkNw.y) * smoothstep(0.42, 0.62, rkF(rkP * 3.3 + 21.0) + 0.1) * 0.85;
// seams between the old valves, fainter between the small ones; growth lines as broken, warped rings
float rkSeam = (1.0 - smoothstep(0.015, 0.06, rkCell.y)) * 0.7 + (1.0 - smoothstep(0.01, 0.04, rkCell2.y)) * 0.3;
float rkRings = smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(rkCell.x * 55.0 + rkF(rkP * 60.0) * 6.0));
vec3 rkShell = mix(rkLin(vec3(0.66, 0.64, 0.6)), rkLin(vec3(0.53, 0.47, 0.5)), step(0.72, rkCell.z) * 0.5) * (0.82 + 0.16 * rkRings) * (0.72 + 0.35 * rkCell2.z) * (0.85 + 0.25 * rkFine);
rkShell = mix(rkShell, rkLin(vec3(0.24, 0.22, 0.2)), rkSeam * 0.7);
rkCol = mix(rkCol, rkShell, rkCrust);
float rkDepth = uOyWater.x - rkY;
float rkUnder = smoothstep(0.0, 0.01, rkDepth);
float rkWet = max(rkUnder, 1.0 - smoothstep(uOyWater.x + 0.01, max(uOyWater.x, uOyWater.y) + 0.08, rkY));
rkWet = max(rkWet, 1.0 - smoothstep(0.0, 0.12, -rkDepth));
if (uOyWetOverride >= 0.0) rkWet = max(rkWet, uOyWetOverride);
rkCol *= mix(1.0, 0.74, rkWet);
diffuseColor.rgb = rkCol;
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = mix(0.82 + 0.1 * rkMid, 0.38 + 0.15 * rkMid, rkWet * (1.0 - rkUnder * 0.3));
roughnessFactor = mix(roughnessFactor, 0.45, rkAlg);
roughnessFactor = mix(roughnessFactor, mix(0.75, 0.4, rkWet), rkCrust);
`)
      .replace('#include <normal_fragment_maps>', `
{
  // bump from the stone's grain (world-space noise, screen-space derivatives)
  float h = rkF(rkP * 9.0) * 0.012 + rkF(rkP * 40.0) * 0.005 + rkN(rkP * 160.0) * 0.0015 + rkRing * rkBarnZone * 0.0012;
  h += rkCrust * (smoothstep(0.0, 0.08, rkCell.y) * 0.005 + smoothstep(0.0, 0.05, rkCell2.y) * 0.002 + rkRings * 0.0005);
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 gr = sign(det) * (dh.x * r1 + dh.y * r2);
  normal = normalize(abs(det) * normal - gr);
}
`);
  };
  m.customProgramCacheKey = () => 'riprap-v1';
  return m;
}

// ---------------------------------------------------------------------------------------------- the revetment

const PROTOS = 8;
const CHUNK = 12;

export interface AttachSite {
  /** world position on the stone's surface */
  p: Vector3;
  /** outward normal */
  n: Vector3;
  /** how much room (m) around it on this face */
  room: number;
  /** stone index */
  stone: number;
}

interface Stone { proto: number; m: Matrix4; inv: Matrix4; pos: Vector3; r: number; chunk: number }

/**
 * The stones of a map: where they lie, how they are drawn, the extra ground height they make for the walker, and
 * the faces oysters can settle on.
 */
export class Riprap {
  readonly group: InstancedMesh[] = [];
  readonly stones: Stone[] = [];
  private readonly protos: { hi: BufferGeometry; lo: BufferGeometry; shape: RockShape }[] = [];
  readonly material = makeRockMaterial();
  private readonly chunks: { meshes: [InstancedMesh, InstancedMesh]; centre: Vector3; radius: number; lod: number }[] = [];
  /** top-of-stone height grid (0.25 m cells) for the walker */
  private readonly top = new Map<number, number>();
  private readonly cell = 0.25;

  constructor(private readonly terrain: Terrain, seed: number) {
    for (let i = 0; i < PROTOS; i++) this.protos.push({ hi: makeRockGeometry(seed * 13 + i, 1, 3), lo: makeRockGeometry(seed * 13 + i, 1, 1), shape: new RockShape(seed * 13 + i) });
    const rng = new Rng(hashInts(seed, 0x7a9));
    this.layRevetment(rng);
    this.buildChunks();
    this.rasterTops();
  }

  /** where the stones go: along both levees' inner toes, over their drowned tips, and a few mounds on the low flat */
  private layRevetment(rng: Rng): void {
    const t = this.terrain;
    const add = (x: number, z: number, size: number, sink: number, tilt = 0.25) => {
      if (!t.inside(x, z, 1)) return;
      const ground = t.heightAt(x, z);
      const n = t.normalAt(x, z, new Vector3());
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n);
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rng.range(0, Math.PI * 2)));
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), rng.range(-tilt, tilt)));
      const s = new Vector3(size * rng.range(0.85, 1.2), size * rng.range(0.8, 1.1), size * rng.range(0.85, 1.2));
      // set into the ground on the slope (neighbours may press into each other a little, as laid stones do)
      const pos = new Vector3(x, ground + size * (0.3 - sink), z);
      const m = new Matrix4().compose(pos, q, s);
      this.stones.push({ proto: rng.int(0, PROTOS - 1), m, inv: m.clone().invert(), pos, r: size * 0.55, chunk: -1 });
    };
    // the levees: find, along z, where the inner face crosses the oyster zone; a band of stones up the slope
    for (const side of [-1, 1]) {
      for (let z = -12; z < 128; z += rng.range(0.55, 0.85)) {
        // walk from the flat outward to where the face rises
        let xFoot = side * 128;
        for (let ax = 124; ax < 146; ax += 0.25) {
          const h0 = t.heightAt(side * ax, z), h1 = t.heightAt(side * (ax + 1), z);
          if (h1 - h0 > 0.12) { xFoot = side * ax; break; }
        }
        // two or three courses up the face, the lowest half in the mud
        const courses = rng.int(3, 5);
        for (let c = 0; c < courses; c++) {
          const x = xFoot + side * (c * 0.7 - 0.6 + rng.range(-0.2, 0.2));
          add(x, z + rng.range(-0.2, 0.2), rng.range(0.5, 0.95) * (c === 0 ? 1.1 : 0.9), c === 0 ? 0.25 : 0.12);
        }
      }
      // the drowned tip of the levee: a heap
      for (let i = 0; i < 70; i++) {
        const z = rng.range(118, 152), x = side * rng.range(136, 152);
        if (t.heightAt(x, z) < -1.9) continue;
        add(x, z, rng.range(0.5, 1.0), 0.2, 0.5);
      }
    }
    // old rubble mounds on the low flat, clear of the creek beds
    const chan = t.palette.indexOf('channel');
    let mounds = 0;
    for (let tries = 0; tries < 200 && mounds < 4; tries++) {
      const cx = rng.range(-100, 100), cz = rng.range(10, 95);
      if (t.substrateIndexAt(cx, cz) === chan) continue;
      const h = t.heightAt(cx, cz);
      if (h > -0.35 || h < -1.25) continue;
      mounds++;
      const n = rng.int(14, 26), ax = rng.range(2.5, 5), az = rng.range(1.2, 2.2), rot = rng.range(0, Math.PI);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next());
        const lx = Math.cos(a) * r * ax, lz = Math.sin(a) * r * az;
        add(cx + lx * Math.cos(rot) - lz * Math.sin(rot), cz + lx * Math.sin(rot) + lz * Math.cos(rot), rng.range(0.45, 0.85) * (1.2 - 0.5 * r), 0.15, 0.45);
      }
    }
  }

  private buildChunks(): void {
    const byChunk = new Map<number, Stone[]>();
    for (const st of this.stones) {
      const key = Math.floor((st.pos.x + 400) / CHUNK) * 1000 + Math.floor((st.pos.z + 400) / CHUNK);
      let list = byChunk.get(key);
      if (!list) { list = []; byChunk.set(key, list); }
      list.push(st);
    }
    const tint = new Color();
    for (const list of byChunk.values()) {
      const centre = new Vector3();
      for (const st of list) centre.add(st.pos);
      centre.divideScalar(list.length);
      let radius = 0;
      for (const st of list) radius = Math.max(radius, st.pos.distanceTo(centre) + st.r * 2);
      const idx = this.chunks.length;
      // one draw per chunk and LOD: the stones of this chunk across all shapes need one geometry, so each chunk
      // instances a single shape set — split the chunk by prototype instead
      const byProto = new Map<number, Stone[]>();
      for (const st of list) { st.chunk = idx; let l = byProto.get(st.proto); if (!l) { l = []; byProto.set(st.proto, l); } l.push(st); }
      for (const [proto, stones] of byProto) {
        const hi = new InstancedMesh(this.protos[proto].hi, this.material, stones.length);
        const lo = new InstancedMesh(this.protos[proto].lo, this.material, stones.length);
        const col = new Float32Array(stones.length * 3);
        stones.forEach((st, k) => {
          hi.setMatrixAt(k, st.m);
          lo.setMatrixAt(k, st.m);
          // each stone a little lighter or darker, warmer or greyer
          const h = hashInts(k, proto, 0x51);
          const b = 0.82 + 0.3 * ((h % 1000) / 1000), w = ((h >>> 10) % 1000) / 1000;
          tint.setRGB(b * (1 + 0.05 * w), b, b * (1 - 0.05 * w));
          col.set([tint.r, tint.g, tint.b], k * 3);
        });
        for (const im of [hi, lo]) {
          im.instanceColor = new InstancedBufferAttribute(col, 3);
          im.computeBoundingSphere();
          im.receiveShadow = true;
          im.name = 'riprap';
        }
        hi.castShadow = true;
        lo.visible = false;
        this.group.push(hi, lo);
        this.chunks.push({ meshes: [hi, lo], centre, radius, lod: 0 });
      }
    }
  }

  private rasterTops(): void {
    const c = this.cell;
    const v = new Vector3();
    for (const st of this.stones) {
      const g = this.protos[st.proto].lo;
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(st.m);
        const key = Math.floor(v.x / c) * 100003 + Math.floor(v.z / c);
        const old = this.top.get(key);
        if (old === undefined || v.y > old) this.top.set(key, v.y);
      }
    }
  }

  /**
   * The point of a stone's surface toward a world point (seen from the stone's centre), and the outward normal there.
   * Oyster clumps use it to sit on the real stone rather than on a plane.
   */
  surfaceToward(stone: number, world: Vector3, outP: Vector3, outN: Vector3): void {
    const st = this.stones[stone], shape = this.protos[st.proto].shape;
    const l = this.tmpL.copy(world).applyMatrix4(st.inv);
    if (l.lengthSq() < 1e-10) l.set(0, 1, 0);
    shape.alongRay(l, outP);
    // normal from two nearby directions
    const t1 = this.tmpT1.set(1, 0, 0);
    if (Math.abs(l.x) > Math.abs(l.y) * 0.9 && Math.abs(l.x) > Math.abs(l.z) * 0.9) t1.set(0, 1, 0);
    const t2 = this.tmpT2.crossVectors(l, t1).normalize();
    t1.crossVectors(t2, l).normalize();
    const e = 0.02 * l.length();
    const a = shape.alongRay(this.tmpA.copy(l).addScaledVector(t1, e), this.tmpA);
    const b = shape.alongRay(this.tmpB.copy(l).addScaledVector(t2, e), this.tmpB);
    a.sub(outP); b.sub(outP);
    outN.crossVectors(a, b);
    if (outN.dot(outP) < 0) outN.negate();
    outP.applyMatrix4(st.m);
    outN.transformDirection(this.tmpNM.copy(st.inv).transpose()).normalize();
  }
  private readonly tmpL = new Vector3();
  private readonly tmpT1 = new Vector3();
  private readonly tmpT2 = new Vector3();
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpNM = new Matrix4();

  /** Extra ground height a walker stands on here (0 where there is no stone above the terrain). */
  heightBoost(x: number, z: number): number {
    const c = this.cell;
    const top = this.top.get(Math.floor(x / c) * 100003 + Math.floor(z / c));
    if (top === undefined) return 0;
    return Math.max(0, top - this.terrain.heightAt(x, z));
  }

  /** Near chunks get the detailed stones, far ones the rough; very far ones go. */
  update(camera: Camera): void {
    const cp = camera.position;
    for (const ch of this.chunks) {
      const d = cp.distanceTo(ch.centre) - ch.radius;
      const lod = d < 30 ? 0 : d < 150 ? 1 : 2;
      if (lod === ch.lod) continue;
      ch.lod = lod;
      ch.meshes[0].visible = lod === 0;
      ch.meshes[1].visible = lod === 1;
    }
  }

  /**
   * Faces oysters can settle on: points on the stones (sampled on their detailed surface) that face up or sideways,
   * stand clear of the mud, and lie in the band between `top` and `bottom` (T.P. m).
   */
  attachSites(seed: number, top: number, bottom: number, spacing = 0.4): AttachSite[] {
    const rng = new Rng(hashInts(seed, 0xa77));
    const out: AttachSite[] = [];
    const v = new Vector3(), n = new Vector3(), nm = new Matrix4();
    const grid = new Map<number, AttachSite[]>();
    const key = (x: number, z: number) => Math.floor(x / spacing) * 100003 + Math.floor(z / spacing);
    for (let s = 0; s < this.stones.length; s++) {
      const st = this.stones[s];
      if (st.pos.y + st.r < bottom || st.pos.y - st.r > top) continue;
      // reefs are patchy: runs of stones thick with oysters, others nearly bare
      const patch = vnoise3(st.pos.x / 7, 0.5, st.pos.z / 7, 0x0a5) * 0.7 + vnoise3(st.pos.x / 2.5, 1.5, st.pos.z / 2.5, 0x0a6) * 0.3;
      if (patch < 0.42) continue;
      const g = this.protos[st.proto].hi;
      const P = g.getAttribute('position'), N = g.getAttribute('normal');
      nm.copy(st.m).invert().transpose();
      const tries = 26;
      for (let k = 0; k < tries; k++) {
        const i = rng.int(0, P.count - 1);
        v.fromBufferAttribute(P, i).applyMatrix4(st.m);
        n.fromBufferAttribute(N, i).applyMatrix4(nm).normalize();
        if (n.y < -0.15) continue;                         // undersides: dark, silted, against other stones
        if (v.y > top || v.y < bottom) continue;
        if (v.y < this.terrain.heightAt(v.x, v.z) + 0.05) continue;   // in the mud
        // buried under a neighbouring stone?
        let covered = false;
        for (const o of this.stones) {
          if (o === st || Math.abs(o.pos.x - v.x) > o.r * 1.6 || Math.abs(o.pos.z - v.z) > o.r * 1.6) continue;
          if (o.pos.distanceTo(v) < o.r * 0.8) { covered = true; break; }
        }
        if (covered) continue;
        const kk = key(v.x, v.z);
        const near = [kk, kk + 1, kk - 1, kk + 100003, kk - 100003].flatMap((q) => grid.get(q) ?? []);
        if (near.some((a) => a.p.distanceTo(v) < spacing)) continue;
        const site: AttachSite = { p: v.clone(), n: n.clone(), room: st.r * 0.8, stone: s };
        out.push(site);
        let l = grid.get(kk);
        if (!l) { l = []; grid.set(kk, l); }
        l.push(site);
      }
    }
    return out;
  }

  dispose(): void {
    for (const m of this.group) m.removeFromParent();
    for (const p of this.protos) { p.hi.dispose(); p.lo.dispose(); }
    this.material.dispose();
  }
}
