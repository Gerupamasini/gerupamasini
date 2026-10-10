import {
  BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshPhysicalMaterial,
  Object3D, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { Rng, hashInts } from '../../../core/Rng';
import { FORMS, coarseValve } from '../../asari/AsariModel.js';
import { makeShellOuterMaterial } from '../../asari/AsariMaterial.js';
import { valveFragment } from '../../../world/PitDebris';
import type { HabitatSample } from '../../../world/Habitat';
import type { Food, ScentProbe } from './behavior';

/**
 * Carrion on the flat: clams crushed underfoot on the clam-digging shore, their meat out in the water among the
 * broken valves — what アラムシロ smell from a metre or two down the current and gather on (Morton & Yuen 2000:
 * forty snails at a bait within half an hour; bivalve and fish carrion preferred). A few pieces lie about the player
 * at any time, the same ones in the same places for a day; the snails share each piece round its edge and eat it
 * down.
 */

export interface CarrionItem extends Food {
  readonly y: number;
  meat: number;
  /** who feeds where (angle round the piece) */
  readonly slots: Map<string, number>;
  /** the drawing: the meat's instance and the shell fragments' */
  readonly seed: number;
  readonly heading: number;
}

export interface CarrionGround {
  heightAt(x: number, z: number): number;
  sampleAt?(x: number, z: number): HabitatSample | null;
}

const CELL = 8;
const KEEP = 30;
const MAX_ITEMS = 48;
const FRAGS = 4;
/** the width a snail takes at the meal (m) */
const PLACE_W = 0.0085;

let meatGeo: BufferGeometry | null = null;
/**
 * clam meat torn from a crushed shell: a flattened, wrinkled mass — the cream visceral mass, the orange-tan foot as a
 * tongue to one side, the frilled brown mantle edge, the stubs of the siphons — in vertex colours
 */
function meatGeometry(): BufferGeometry {
  if (meatGeo) return meatGeo;
  const g = new SphereGeometry(1, 40, 24);
  const pos = g.getAttribute('position');
  const col: number[] = [];
  const rng = new Rng(77);
  const bumps = Array.from({ length: 12 }, () => [rng.range(-1, 1), rng.range(-0.3, 0.6), rng.range(-1, 1), rng.range(0.1, 0.3)]);
  const v = new Vector3();
  const cream = new Color(0.46, 0.33, 0.2), tan = new Color(0.5, 0.24, 0.08), mantle = new Color(0.14, 0.08, 0.045), c = new Color();
  const wr = (x: number, y: number, z: number) => Math.sin(x * 13 + Math.sin(z * 7) * 2) * Math.sin(z * 11 + y * 5) * 0.5 + 0.5;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1;
    for (const [bx, by, bz, br] of bumps) {
      const d = Math.hypot(v.x - bx, v.y - by, v.z - bz);
      r += br * Math.exp(-d * d * 5);
    }
    // the foot: a tongue out to +x; the siphons: two stubs to −x
    const foot = Math.exp(-(((v.x - 0.85) / 0.45) ** 2 + (v.z / 0.5) ** 2 + ((v.y + 0.1) / 0.6) ** 2));
    const sip = Math.exp(-(((v.x + 0.9) / 0.25) ** 2 + ((Math.abs(v.z) - 0.18) / 0.15) ** 2));
    r += 0.55 * foot + 0.35 * sip;
    // fine wrinkles, deeper on the mantle's frilled edge
    const edge = Math.max(0, Math.abs(v.z) - 0.55) * 2;
    r += 0.06 * (wr(v.x, v.y, v.z) - 0.5) * (1 + 2 * edge);
    v.multiplyScalar(r);
    v.y *= v.y < 0 ? 0.15 : 0.42;
    v.x *= 1.3;
    pos.setXYZ(i, v.x, v.y, v.z);
    c.copy(cream).multiplyScalar(0.85 + 0.3 * wr(v.z * 2, v.x, v.y * 3));
    c.lerp(tan, Math.min(1, foot * 1.3));
    c.lerp(mantle, Math.min(0.85, edge * 1.4 + 0.3 * sip));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  // unit half-length along x, resting on y = 0
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  g.translate(-(bb.max.x + bb.min.x) / 2, -bb.min.y * 0.6, -(bb.max.z + bb.min.z) / 2);
  g.scale(2 / (bb.max.x - bb.min.x), 2 / (bb.max.x - bb.min.x), 2 / (bb.max.x - bb.min.x));
  g.computeVertexNormals();
  meatGeo = g;
  return g;
}

/** The carrion about the player (a ScentProbe for the snails). */
export class CarrionField implements ScentProbe {
  readonly group = new Group();
  readonly items: CarrionItem[] = [];
  private readonly byCell = new Map<string, CarrionItem | null>();
  private readonly meat: InstancedMesh;
  private readonly frags: InstancedMesh[];
  private nextId = 1;
  private acc = 1;
  private readonly o = new Object3D();
  private readonly m = new Matrix4();
  private readonly tilt = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private dirty = true;

  constructor(private readonly ground: CarrionGround, private readonly seed: number, private readonly chance = 0.28) {
    this.group.name = 'Carrion';
    const meatMat = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 });
    meatMat.envMapIntensity = 0.3;
    meatMat.name = 'CarrionMeat';
    this.meat = new InstancedMesh(meatGeometry(), meatMat, MAX_ITEMS);
    this.meat.name = 'CarrionMeat';
    // broken アサリ valves: the clam model's own coarse valve, cut into a large piece and chips
    const rng = new Rng(seed ^ 0x3c1);
    const valve = coarseValve(FORMS.asari) as BufferGeometry;
    const kinds = [valveFragment(valve, rng, 1), valveFragment(valve, rng, 1), valveFragment(valve, rng, 2), valveFragment(valve, rng, 2)];
    this.frags = kinds.map((g, i) => {
      const mat = (makeShellOuterMaterial as (o: { instanced?: boolean; style?: string }) => MeshPhysicalMaterial)({ instanced: true, style: FORMS.asari.style });
      (mat.userData.uniforms as { uSand: { value: { set(a: number, b: number, c: number, d: number): void } } }).uSand.value.set(-1e9, 0.04, 0, 0.85);
      const geo = g.clone();
      geo.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(MAX_ITEMS * 4), 4));
      const mesh = new InstancedMesh(geo, mat, MAX_ITEMS);
      mesh.name = `CarrionShell${i}`;
      return mesh;
    });
    for (const mesh of [this.meat, ...this.frags]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      this.group.add(mesh);
    }
  }

  /** keep the pieces round the player (once a second; the cells' pieces are the same all day) */
  update(px: number, pz: number, dt: number): void {
    this.acc += dt;
    if (this.acc >= 1) {
      this.acc = 0;
      const c0x = Math.floor((px - KEEP) / CELL), c1x = Math.floor((px + KEEP) / CELL);
      const c0z = Math.floor((pz - KEEP) / CELL), c1z = Math.floor((pz + KEEP) / CELL);
      for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
        const key = `${cx},${cz}`;
        if (this.byCell.has(key)) continue;
        this.byCell.set(key, this.makeCell(cx, cz));
      }
      // forget what is far behind
      for (const [key, it] of this.byCell) {
        const [cx, cz] = key.split(',').map(Number);
        const mx = (cx + 0.5) * CELL, mz = (cz + 0.5) * CELL;
        if (Math.abs(mx - px) > KEEP + CELL * 1.5 || Math.abs(mz - pz) > KEEP + CELL * 1.5) {
          this.byCell.delete(key);
          if (it) { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); this.dirty = true; }
        }
      }
    }
    if (this.dirty) this.redraw();
  }

  private makeCell(cx: number, cz: number): CarrionItem | null {
    const rng = new Rng(hashInts(cx, cz, this.seed, 0xca7));
    if (!rng.chance(this.chance) || this.items.length >= MAX_ITEMS) return null;
    const x = (cx + rng.range(0.1, 0.9)) * CELL, z = (cz + rng.range(0.1, 0.9)) * CELL;
    const s = this.ground.sampleAt?.(x, z);
    if (s && s.substrate !== 'sand' && s.substrate !== 'muddy_sand' && s.substrate !== 'mud') return null;
    return this.add(x, z, rng.next());
  }

  /** put a piece of carrion at (x, z) (the viewer and the tests place their own) */
  add(x: number, z: number, seed = 0.5, meat = 1): CarrionItem {
    const it: CarrionItem = { id: this.nextId++, x, z, y: this.ground.heightAt(x, z), r: 0.009 + 0.004 * seed, meat, slots: new Map(), seed, heading: seed * 40 };
    this.items.push(it);
    this.dirty = true;
    return it;
  }

  clear(): void {
    this.items.length = 0;
    this.byCell.clear();
    this.dirty = true;
  }

  sourcesNear(x: number, z: number, r: number): readonly CarrionItem[] {
    const out: CarrionItem[] = [];
    for (const it of this.items) if (Math.abs(it.x - x) <= r && Math.abs(it.z - z) <= r && Math.hypot(it.x - x, it.z - z) <= r) out.push(it);
    return out;
  }

  claim(food: Food, who: string, angle: number): number | null {
    const it = food as CarrionItem;
    const mine = it.slots.get(who);
    if (mine !== undefined) return mine;
    const ring = it.r + PLACE_W * 0.9;
    const step = PLACE_W / ring;
    const max = Math.floor((Math.PI * 2) / step);
    if (it.slots.size >= max) return null;
    // the free place nearest the one asked for
    for (let k = 0; k < max; k++) {
      for (const sgn of k === 0 ? [1] : [1, -1]) {
        const a = angle + sgn * k * step * 0.5;
        let ok = true;
        for (const b of it.slots.values()) if (Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < step * 0.95) { ok = false; break; }
        if (ok) { it.slots.set(who, a); return a; }
      }
    }
    return null;
  }

  release(food: Food, who: string): void {
    (food as CarrionItem).slots.delete(who);
  }

  eat(food: Food, share: number): void {
    const it = food as CarrionItem;
    const before = it.meat;
    it.meat = Math.max(0, it.meat - share);
    if (Math.floor(before * 40) !== Math.floor(it.meat * 40)) this.dirty = true;
  }

  private redraw(): void {
    this.dirty = false;
    const o = this.o;
    const counts = this.frags.map(() => 0);
    let n = 0;
    const nrm = new Vector3(0, 1, 0);
    for (const it of this.items) {
      const rng = new Rng(Math.floor(it.seed * 1e6) + 3);
      // the meat, eaten down
      const k = 0.25 + 0.75 * Math.sqrt(it.meat);
      o.position.set(it.x, it.y - 0.0003, it.z);
      o.rotation.set(0, it.heading, 0);
      o.scale.set(it.r * 0.9 * k, it.r * 0.8 * k, it.r * 0.8 * k);
      o.updateMatrix();
      this.meat.setMatrixAt(n++, o.matrix);
      // the broken valves over and about it, convex side up, half in the sand
      for (let f = 0; f < this.frags.length; f++) {
        const mesh = this.frags[f];
        const i = counts[f]++;
        const a = it.heading + f * 1.7 + rng.range(-0.4, 0.4);
        // the larger half beside the meat, the chips scattered round it
        const d = it.r * (f === 0 ? 1.25 : rng.range(1.1, 2.0));
        const x = it.x + Math.sin(a) * d, z = it.z + Math.cos(a) * d;
        const len = (f === 0 ? 0.026 : rng.range(0.008, 0.014)) * (0.85 + 0.3 * it.seed);
        o.position.set(x, this.ground.heightAt(x, z) - len * 0.03, z);
        o.rotation.set(-Math.PI / 2 + rng.range(-0.25, 0.25), rng.range(0, Math.PI * 2), rng.range(-0.25, 0.25), 'YXZ');
        o.quaternion.premultiply(this.tilt.setFromUnitVectors(this.up, nrm));
        o.scale.setScalar(len);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        (mesh.geometry.getAttribute('aSeed') as InstancedBufferAttribute).setXYZW(i, it.seed, (it.seed * 7.3) % 1, 1, 0);
      }
    }
    this.meat.count = n;
    this.meat.instanceMatrix.needsUpdate = true;
    this.frags.forEach((mesh, i) => {
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
      (mesh.geometry.getAttribute('aSeed') as InstancedBufferAttribute).needsUpdate = true;
    });
    void this.m;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.meat.material instanceof MeshPhysicalMaterial && this.meat.material.dispose();
    for (const f of this.frags) { f.geometry.dispose(); (f.material as MeshPhysicalMaterial).dispose(); }
  }
}
