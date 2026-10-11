import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3,
  type IUniform,
} from 'three';
import { Rng, hashInts } from '../core/Rng';
import type { Season } from '../core/Time';
import type { Quality } from '../core/Settings';
import type { Terrain } from './Terrain';
import type { LeveeLine } from './LeveeLine';

/**
 * ヨシ原: a thin fringe of common reed (Phragmites australis) on the sand berm against the levee's inner toe, above
 * the ordinary high water. Three kinds of shoot share the clumps and the season decides how many of each stand:
 *   young   spring's new shoots, knee-high and bright green, among last year's dead stalks
 *   summer  the full-grown reed, 2–3 m, dark green leaves and, late in the season, a purplish plume
 *   golden  the dead reed of autumn and winter, straw-gold, leaves curled and falling, plumes gone silver-buff
 * Each clump keeps its own draw, so as the seasons turn the same clumps change kind rather than jump about.
 */

export type ReedKind = 'young' | 'summer' | 'golden';
const KINDS: readonly ReedKind[] = ['young', 'summer', 'golden'];

/** the share of clumps of each kind (young, summer, golden) in each season */
export const REED_MIX: Record<Season, readonly [number, number, number]> = {
  spring: [0.65, 0, 0.35],
  summer: [0.1, 0.85, 0.05],
  autumn: [0, 0.4, 0.6],
  winter: [0, 0, 1],
};

/** which kind a clump with draw `u` (0..1) is in a season */
export function reedKindFor(u: number, season: Season): ReedKind {
  const [a, b] = REED_MIX[season];
  return u < a ? 'young' : u < a + b ? 'summer' : 'golden';
}

/** the colour a reed fringe reads as from a distance (the minimap), by season */
export function reedMapColour(season: Season): [number, number, number] {
  const c = { young: [0x86, 0xa8, 0x4a], summer: [0x4f, 0x78, 0x30], golden: [0xc6, 0x9d, 0x66] } as const;
  const mix = REED_MIX[season];
  const out: [number, number, number] = [0, 0, 0];
  KINDS.forEach((k, i) => { for (let j = 0; j < 3; j++) out[j] += c[k][j] * mix[i]; });
  return out;
}

interface Look { height: [number, number]; stems: [number, number]; leaves: [number, number]; leafLen: [number, number]; droop: number; plume: number; stem: string; leaf: string[]; plumeCol: string }
const LOOK: Record<ReedKind, Look> = {
  young: { height: [0.45, 0.9], stems: [9, 14], leaves: [3, 5], leafLen: [0.18, 0.3], droop: 0.15, plume: 0, stem: '#7da447', leaf: ['#6f9b3a', '#86ad4b', '#5f8a32'], plumeCol: '#000000' },
  summer: { height: [2.0, 2.8], stems: [9, 13], leaves: [7, 10], leafLen: [0.3, 0.45], droop: 0.45, plume: 0.28, stem: '#6f8c3d', leaf: ['#4f7a2c', '#5e8634', '#466f28'], plumeCol: '#6e5056' },
  golden: { height: [1.8, 2.6], stems: [10, 15], leaves: [2, 4], leafLen: [0.2, 0.35], droop: 0.8, plume: 0.32, stem: '#c69c63', leaf: ['#b8915c', '#cfa970', '#a8834f'], plumeCol: '#d9c8a6' },
};

/** One clump of shoots as a mesh: tapered stems, arching leaf ribbons and a plume, with a sway weight per vertex. */
function buildClump(kind: ReedKind, seed: number): BufferGeometry {
  const L = LOOK[kind], rng = new Rng(hashInts(seed, 0x4ee));
  const pos: number[] = [], col: number[] = [], sway: number[] = [];
  const c = new Color(), up = new Vector3(0, 1, 0);
  const tri = (a: Vector3, b: Vector3, d: Vector3, ca: Color, wa: number, wb: number, wd: number) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
    for (let i = 0; i < 3; i++) col.push(ca.r, ca.g, ca.b);
    sway.push(wa, wb, wd);
  };
  const H = rng.range(L.height[0], L.height[1]);
  const n = rng.int(L.stems[0], L.stems[1]);
  for (let s = 0; s < n; s++) {
    const r = Math.sqrt(rng.next()) * 0.42, a = rng.range(0, Math.PI * 2);
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const h = H * rng.range(0.75, 1.05);
    // the stalk leans a little out of the clump; a dead one sometimes broken over
    const lean = new Vector3(bx, 0, bz).normalize().multiplyScalar(rng.range(0.03, 0.12) + (kind === 'golden' && rng.chance(0.15) ? 0.5 : 0));
    const top = new Vector3(bx + lean.x * h, h, bz + lean.z * h);
    const base = new Vector3(bx, -0.05, bz);
    const side = new Vector3(-Math.sin(a), 0, Math.cos(a));
    c.set(L.stem).multiplyScalar(rng.range(0.85, 1.12));
    // the stalk: a tapered ribbon in four segments, turned to face a random way
    const w0 = kind === 'young' ? 0.012 : 0.016;
    for (let k = 0; k < 4; k++) {
      const t0 = k / 4, t1 = (k + 1) / 4;
      const p0 = base.clone().lerp(top, t0), p1 = base.clone().lerp(top, t1);
      const ww0 = w0 * (1 - 0.7 * t0), ww1 = w0 * (1 - 0.7 * t1);
      const a0 = p0.clone().addScaledVector(side, -ww0), b0 = p0.clone().addScaledVector(side, ww0);
      const a1 = p1.clone().addScaledVector(side, -ww1), b1 = p1.clone().addScaledVector(side, ww1);
      tri(a0, b0, b1, c, t0, t0, t1);
      tri(a0, b1, a1, c, t0, t1, t1);
    }
    // leaves: ribbons leaving the stalk at alternate sides, arching out and down
    const nl = rng.int(L.leaves[0], L.leaves[1]);
    for (let l = 0; l < nl; l++) {
      const t = kind === 'young' ? rng.range(0.1, 0.8) : rng.range(0.15, 0.85);
      const at = base.clone().lerp(top, t);
      const dirA = a + (l % 2 ? Math.PI : 0) + rng.range(-0.6, 0.6);
      const out = new Vector3(Math.cos(dirA), 0, Math.sin(dirA));
      const len = rng.range(L.leafLen[0], L.leafLen[1]) * (kind === 'young' ? 1 : 1 + 0.3 * (1 - t));
      const width = kind === 'young' ? 0.02 : 0.032;
      const across = new Vector3().crossVectors(out, up).normalize();
      c.set(L.leaf[rng.int(0, L.leaf.length - 1)]).multiplyScalar(rng.range(0.88, 1.1));
      let prev = at.clone(), prevW = width * 0.6;
      const segs = 3;
      for (let k = 1; k <= segs; k++) {
        const u = k / segs;
        // rises first, then arches over (the dead leaves hang)
        const rise = (kind === 'young' ? 0.9 : 0.55) * (1 - u) - L.droop * u * u;
        const p = at.clone().addScaledVector(out, len * u).addScaledVector(up, len * (rise * u + 0.3 * u));
        const w = width * Math.sin(Math.PI * Math.min(0.95, 0.15 + u * 0.85));
        const wa = t, wb = Math.min(1, t + 0.25 * u);
        tri(prev.clone().addScaledVector(across, -prevW), prev.clone().addScaledVector(across, prevW), p.clone().addScaledVector(across, w), c, wa, wa, wb);
        tri(prev.clone().addScaledVector(across, -prevW), p.clone().addScaledVector(across, w), p.clone().addScaledVector(across, -w), c, wa, wb, wb);
        prev = p; prevW = w;
      }
    }
    // the plume: a nodding tuft of thin spikelets at the top
    if (L.plume > 0 && rng.chance(kind === 'golden' ? 0.85 : 0.7)) {
      c.set(L.plumeCol).multiplyScalar(rng.range(0.9, 1.1));
      const nod = new Vector3(Math.cos(a + 0.7), 0, Math.sin(a + 0.7));
      for (let k = 0; k < 9; k++) {
        const da = rng.range(-0.9, 0.9);
        const d = nod.clone().applyAxisAngle(up, da).multiplyScalar(rng.range(0.06, 0.12));
        const tip = top.clone().add(d).addScaledVector(up, -L.plume * rng.range(0.35, 0.9));
        const mid = top.clone().addScaledVector(up, -L.plume * 0.25).add(d.clone().multiplyScalar(0.5));
        const sideP = new Vector3(-d.z, 0, d.x).normalize().multiplyScalar(0.025);
        tri(top.clone().addScaledVector(up, 0.03), mid.clone().add(sideP), tip, c, 1, 1, 1);
        tri(top.clone().addScaledVector(up, 0.03), tip, mid.clone().sub(sideP), c, 1, 1, 1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new Float32BufferAttribute(sway, 1));
  g.computeVertexNormals();
  // light the ribbons as a canopy rather than as edge-on cards: normals bent toward the sky
  const nrm = g.getAttribute('normal');
  for (let i = 0; i < nrm.count; i++) {
    const v = new Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    if (v.y < 0) v.negate();
    v.multiplyScalar(0.45).add(new Vector3(0, 0.55, 0)).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingSphere();
  return g;
}

/** clumps per metre of levee where a stand grows, by quality */
const DENSITY: Record<Quality, number> = { minimal: 0.9, low: 1.6, mid: 2.4, high: 3.2 };

interface Clump { m: Matrix4; u: number }

export class ReedBed {
  readonly group: InstancedMesh[] = [];
  private readonly clumps: Clump[] = [];
  private readonly meshes = new Map<ReedKind, InstancedMesh>();
  private readonly uTime: IUniform<number> = { value: 0 };
  private readonly material: MeshStandardMaterial;
  private season: Season | null = null;

  constructor(terrain: Terrain, levee: LeveeLine, seed: number, quality: Quality) {
    const rng = new Rng(hashInts(seed, 0x9ee));
    const rock = terrain.palette.indexOf('rock');
    const n = new Vector3(), q = new Quaternion(), s = new Vector3(), p = new Vector3();
    const step = 1 / DENSITY[quality];
    // the berm along the inner toe: dry sand above the ordinary high water, in patches (a fringe, not a marsh)
    for (let a = 0; a < levee.length; a += step * rng.range(0.6, 1.4)) {
      const L = levee.at(a);
      const patch = vnoise1(a / 22 + 3.7, seed) * 0.75 + vnoise1(a / 6 + 1.1, seed + 1) * 0.25;
      if (patch < 0.55) continue;
      const d = levee.def.crest_half_m + rng.range(1.5, 13);
      const x = L.x + L.nx * d + L.tx * rng.range(-0.4, 0.4), z = L.z + L.nz * d + L.tz * rng.range(-0.4, 0.4);
      if (!terrain.inside(x, z, 2)) continue;
      const h = terrain.heightAt(x, z);
      if (h < 1.0 || h > 2.4) continue;
      if (terrain.substrateIndexAt(x, z) === rock) continue;
      terrain.normalAt(x, z, n);
      if (n.y < 0.8) continue;
      q.setFromAxisAngle(new Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
      const k = rng.range(0.8, 1.2);
      s.set(k, k * rng.range(0.9, 1.1), k);
      p.set(x, h, z);
      this.clumps.push({ m: new Matrix4().compose(p, q, s), u: rng.next() });
    }
    this.material = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.85, metalness: 0 });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uReedTime = this.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uReedTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  // the breeze: a slow lean and a quicker flutter, each clump on its own phase; the tops move, the bases hold
  vec3 ip = instanceMatrix[3].xyz;
  float ph = dot(ip.xz, vec2(0.37, 0.61));
  float w = aSway * aSway;
  float gust = 0.6 + 0.4 * sin(uReedTime * 0.31 + ip.x * 0.05);
  transformed.x += w * gust * (0.09 * sin(uReedTime * 1.3 + ph) + 0.025 * sin(uReedTime * 4.1 + ph * 3.0));
  transformed.z += w * gust * (0.06 * sin(uReedTime * 1.1 + ph * 1.7) + 0.02 * sin(uReedTime * 3.7 + ph));
}`);
      // both faces of a blade take the sky-bent normal (a double-sided material would turn the back face's away)
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    };
    this.material.customProgramCacheKey = () => 'reed-v1';
    for (const kind of KINDS) {
      // one clump shape per kind (each instance turns and scales it)
      const geo = buildClump(kind, seed + KINDS.indexOf(kind) * 17);
      const mesh = new InstancedMesh(geo, this.material, Math.max(1, this.clumps.length));
      mesh.count = 0;
      mesh.name = `reeds-${kind}`;
      mesh.castShadow = quality === 'high';
      mesh.receiveShadow = true;
      this.meshes.set(kind, mesh);
      this.group.push(mesh);
    }
  }

  /** how many clumps stand along the levee */
  get size(): number { return this.clumps.length; }

  /** where the clumps stand (x, z) */
  positions(): [number, number][] {
    return this.clumps.map((c) => [c.m.elements[12], c.m.elements[14]]);
  }

  /** how many clumps are of each kind right now */
  counts(): Record<ReedKind, number> {
    return { young: this.meshes.get('young')!.count, summer: this.meshes.get('summer')!.count, golden: this.meshes.get('golden')!.count };
  }

  /** Put each clump in its kind for the season (rebuilt only when the season changes). */
  setSeason(season: Season): void {
    if (season === this.season) return;
    this.season = season;
    const n: Record<ReedKind, number> = { young: 0, summer: 0, golden: 0 };
    for (const c of this.clumps) {
      const kind = reedKindFor(c.u, season);
      this.meshes.get(kind)!.setMatrixAt(n[kind]++, c.m);
    }
    for (const kind of KINDS) {
      const m = this.meshes.get(kind)!;
      m.count = n[kind];
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }

  update(dt: number, season: Season): void {
    this.uTime.value += dt;
    this.setSeason(season);
  }

  dispose(): void {
    for (const m of this.group) { m.removeFromParent(); m.geometry.dispose(); }
    this.material.dispose();
  }
}

/** smooth 1-D value noise in [0, 1] */
function vnoise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = hashInts(i, seed) / 4294967296, b = hashInts(i + 1, seed) / 4294967296;
  return a + (b - a) * u;
}
