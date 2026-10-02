import {
  BufferGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../core/Rng';
import type { Terrain } from './Terrain';

/** clams within this distance of the player get their siphons drawn */
const NEAR = 5;
const CELL = 4;
const MAX_NEAR = 400;
const MAX_HOLES = 24;

/**
 * The clams in the flat. Thousands of アサリ lie buried in beds; nothing about them is simulated — the field
 * only knows where each one is and how big it is. Near the player the pair of siphons each one pokes out of
 * the sand (under water, when nothing has startled it) or the two holes they leave (when the flat is dry or
 * the clam has pulled in) are drawn as instances; a clam is only ever built in full when it is dug up or
 * watched. Dug clams are gone for the session.
 */
export class ClamField {
  readonly count: number;
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  readonly len: Float32Array;
  readonly seed: Uint32Array;
  /** 0 buried, 1 dug up, 2 being watched (built in full elsewhere, so not drawn here) */
  readonly state: Uint8Array;
  private readonly retractUntil: Float32Array;
  private readonly ext: Float32Array;
  private readonly cells = new Map<number, number[]>();
  readonly group = new Group();
  private readonly siphons: InstancedMesh;
  private readonly holes: InstancedMesh;
  private readonly holeMat: MeshStandardMaterial;
  private readonly digMarks: { mesh: Mesh; until: number }[] = [];
  private near: number[] = [];
  private gatherAcc = 1;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly lastPlayer = new Vector3();
  private playerSpeed = 0;

  constructor(private readonly terrain: Terrain, seed: number, beds = 30) {
    const rng = new Rng(seed);
    const xs: number[] = [], zs: number[] = [], len: number[] = [], seeds: number[] = [];
    const half = terrain.half;
    const okBed = (x: number, z: number) => {
      if (!terrain.inside(x, z, 12)) return false;
      const s = terrain.substrateAt(x, z), h = terrain.heightAt(x, z);
      return (s === 'sand' || s === 'muddy_sand') && h > -1.1 && h < -0.1;
    };
    for (let b = 0; b < beds; b++) {
      let cx = 0, cz = 0, found = false;
      for (let tries = 0; tries < 60 && !found; tries++) { cx = rng.range(-half + 12, half - 12); cz = rng.range(-half + 12, half - 12); found = okBed(cx, cz); }
      if (!found) continue;
      const r = rng.range(3, 7), n = Math.min(260, Math.round(Math.PI * r * r * rng.range(0.9, 1.6)));
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (!okBed(x, z) || terrain.pitMaskAt(x, z) > 0) continue;
        xs.push(x); zs.push(z);
        len.push(Math.max(18, Math.min(48, 33 + rng.normal() * 6)));
        seeds.push(Math.floor(rng.next() * 4294967295) >>> 0);
      }
    }
    this.count = xs.length;
    this.xs = Float32Array.from(xs); this.zs = Float32Array.from(zs); this.len = Float32Array.from(len); this.seed = Uint32Array.from(seeds);
    this.state = new Uint8Array(this.count);
    this.retractUntil = new Float32Array(this.count);
    this.ext = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const key = this.cellKey(xs[i], zs[i]);
      let list = this.cells.get(key);
      if (!list) { list = []; this.cells.set(key, list); }
      list.push(i);
    }
    // the two siphons: short fused tubes, the inhalant a little fatter; and the two holes they leave
    const tube = (r0: number, r1: number, dx: number) => { const g = new CylinderGeometry(r0, r1, 0.014, 10, 1, true); g.translate(dx, 0.007, 0); return g; };
    const siphonGeo = mergeGeometries([tube(0.0024, 0.003, -0.0036), tube(0.002, 0.0025, 0.0036)]) as BufferGeometry;
    const siphonMat = new MeshStandardMaterial({ color: 0x4e463d, roughness: 0.55, side: DoubleSide });
    this.siphons = new InstancedMesh(siphonGeo, siphonMat, MAX_NEAR);
    this.siphons.count = 0;
    this.siphons.frustumCulled = false;
    this.siphons.name = 'clam-siphons';
    const hole = (dx: number) => { const g = new CircleGeometry(0.0032, 12); g.rotateX(-Math.PI / 2); g.translate(dx, 0, 0); return g; };
    const holeGeo = mergeGeometries([hole(-0.0036), hole(0.0036)]) as BufferGeometry;
    this.holeMat = new MeshStandardMaterial({ color: 0x1e1a16, roughness: 1 });
    this.holes = new InstancedMesh(holeGeo, this.holeMat, MAX_NEAR);
    this.holes.count = 0;
    this.holes.frustumCulled = false;
    this.holes.name = 'clam-holes';
    this.group.add(this.siphons, this.holes);
    this.group.name = 'clams';
  }

  private cellKey(x: number, z: number): number {
    return Math.floor((z + this.terrain.half) / CELL) * 8192 + Math.floor((x + this.terrain.half) / CELL);
  }

  /** Indices of buried clams within `r` of a point. */
  nearIndices(x: number, z: number, r: number): number[] {
    const out: number[] = [];
    const half = this.terrain.half;
    const i0 = Math.floor((x - r + half) / CELL), i1 = Math.floor((x + r + half) / CELL), j0 = Math.floor((z - r + half) / CELL), j1 = Math.floor((z + r + half) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const list = this.cells.get(j * 8192 + i);
      if (!list) continue;
      for (const k of list) if (this.state[k] === 0 && Math.hypot(this.xs[k] - x, this.zs[k] - z) <= r) out.push(k);
    }
    return out;
  }

  /** The buried clam nearest a point within `r`, or -1. */
  nearest(x: number, z: number, r: number): number {
    let best = -1, bestD = r;
    for (const k of this.nearIndices(x, z, r)) { const d = Math.hypot(this.xs[k] - x, this.zs[k] - z); if (d < bestD) { bestD = d; best = k; } }
    return best;
  }

  /** Dig at a point: the nearest clam within reach comes up (and is gone from the flat); a hole is left. */
  dig(x: number, z: number, r: number, nowSec: number): number {
    const k = this.nearest(x, z, r);
    if (k >= 0) this.state[k] = 1;
    this.leaveHole(x, z, nowSec);
    return k;
  }

  private leaveHole(x: number, z: number, nowSec: number): void {
    const y = this.terrain.heightAt(x, z);
    const geo = new CircleGeometry(0.13, 20);
    geo.rotateX(-Math.PI / 2);
    const mesh = new Mesh(geo, new MeshStandardMaterial({ color: 0x4f4538, roughness: 1, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    mesh.position.set(x, y + 0.002, z);
    this.group.add(mesh);
    this.digMarks.push({ mesh, until: nowSec + 600 });
    while (this.digMarks.length > MAX_HOLES) { const old = this.digMarks.shift()!; old.mesh.removeFromParent(); old.mesh.geometry.dispose(); (old.mesh.material as MeshStandardMaterial).dispose(); }
  }

  /** Startle every clam within `r` of a point: siphons pull in for a while. */
  startle(x: number, z: number, r: number, nowSec: number): void {
    for (const k of this.nearIndices(x, z, r)) this.retractUntil[k] = Math.max(this.retractUntil[k], nowSec + 8 + ((this.seed[k] % 1000) / 1000) * 12);
  }

  /** Per frame: who is near, whether their siphons are out, and the instance matrices. */
  update(player: Vector3, dt: number, nowSec: number, waterAt: (x: number, z: number) => number): void {
    if (dt > 0) {
      const sp = Math.hypot(player.x - this.lastPlayer.x, player.z - this.lastPlayer.z) / dt;
      this.playerSpeed += (Math.min(sp, 10) - this.playerSpeed) * Math.min(1, dt * 4);
    }
    this.lastPlayer.copy(player);
    this.gatherAcc += dt;
    if (this.gatherAcc > 0.25) {
      this.gatherAcc = 0;
      this.near = this.nearIndices(player.x, player.z, NEAR).slice(0, MAX_NEAR);
      // footfalls: a fast player close by, or someone right on top of them, makes them pull in
      for (const k of this.near) {
        const d = Math.hypot(this.xs[k] - player.x, this.zs[k] - player.z);
        if (d < 0.6 || (d < 2.2 && this.playerSpeed > 0.9)) this.retractUntil[k] = Math.max(this.retractUntil[k], nowSec + 6 + ((this.seed[k] % 1000) / 1000) * 10);
      }
    }
    let ns = 0, nh = 0;
    for (const k of this.near) {
      if (this.state[k] !== 0) continue;
      const x = this.xs[k], z = this.zs[k];
      const ground = this.terrain.heightAt(x, z);
      const submerged = waterAt(x, z) - ground > 0.015;
      const want = submerged && nowSec > this.retractUntil[k] ? 1 : 0;
      // out slowly, in fast
      const rate = want ? 0.6 : 4;
      this.ext[k] += (want - this.ext[k]) * Math.min(1, dt * rate);
      const e = this.ext[k];
      const L = this.len[k] / 35;   // instances are built for a 35 mm clam
      this.terrain.normalAt(x, z, this.v);
      this.q.setFromUnitVectors(this.up, this.v);
      const yaw = ((this.seed[k] >>> 8) % 628) / 100;
      this.q.multiply(new Quaternion().setFromAxisAngle(this.up, yaw));
      if (e > 0.03) {
        this.s.set(L, L * (0.15 + 0.85 * e), L);
        this.m.compose(this.v.set(x, ground - 0.002, z), this.q, this.s);
        this.siphons.setMatrixAt(ns++, this.m);
      }
      this.s.set(L, 1, L);
      this.m.compose(this.v.set(x, ground + 0.0015, z), this.q, this.s);
      this.holes.setMatrixAt(nh++, this.m);
      if (ns >= MAX_NEAR || nh >= MAX_NEAR) break;
    }
    this.siphons.count = ns;
    this.holes.count = nh;
    this.siphons.instanceMatrix.needsUpdate = true;
    this.holes.instanceMatrix.needsUpdate = true;
    for (let i = this.digMarks.length - 1; i >= 0; i--) {
      const dm = this.digMarks[i];
      if (nowSec > dm.until) { dm.mesh.removeFromParent(); dm.mesh.geometry.dispose(); (dm.mesh.material as MeshStandardMaterial).dispose(); this.digMarks.splice(i, 1); }
    }
  }

  /** Hide or show one clam's instances (while it is built in full for observation). */
  setWatched(k: number, watched: boolean): void {
    if (k < 0 || k >= this.count || this.state[k] === 1) return;
    this.state[k] = watched ? 2 : 0;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.siphons.geometry.dispose();
    this.holes.geometry.dispose();
    for (const dm of this.digMarks) { dm.mesh.geometry.dispose(); (dm.mesh.material as MeshStandardMaterial).dispose(); }
  }
}

export type { Object3D };
