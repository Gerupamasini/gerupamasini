import { Vector2, Vector3, type Vector4 } from 'three';
import type { AmamoMeadow, AmamoPatch, ShootSpec } from '../../../world/amamo';
import { MOTION } from '../../../world/amamo/params';

/** A shoot of アマモ as the fish sees it: where it stands and how long its leaves are. */
export interface ShootRef {
  x: number;
  y: number;
  z: number;
  len: number;
}

/** What the fish needs from the vegetation system. */
export interface SeagrassQuery {
  /** shoots whose base lies within r (m, horizontally) of (x, z), nearest first; fills `out`, returns the count */
  near(x: number, z: number, r: number, out: ShootRef[], max?: number): number;
  /** a point on the shoot's leaves at height h above its base, leaning with the current (world) */
  bladeAt(s: ShootRef, h: number, out: Vector3): Vector3;
  /** eelgrass cover 0..1 at a point */
  cover(x: number, z: number): number;
  /** the water's flow over the bed (m/s, xz) */
  current(out: Vector2): Vector2;
  /** a push slot for a fish moving through the leaves (−1 when all are taken) */
  claimPush(): number;
  setPush(slot: number, x: number, y: number, z: number, radius: number): void;
  releasePush(slot: number): void;
}

/** what the bridge reads of the meadow (AmamoMeadow; the viewer's stand-in has the same) */
export type MeadowLike = Pick<AmamoMeadow, 'live' | 'coverAt' | 'kit'>;

/** shoots are indexed per patch in cells of this size (m) */
const CELL = 0.25;

interface PatchIndex { cells: Map<number, ShootSpec[]> }
const key = (i: number, j: number) => (j + 30000) * 60000 + (i + 30000);

/**
 * The bridge between the fish and the アマモ beds (the vegetation system): where the shoots stand, near a point, for
 * the fish to weave between, hold by and hide behind, and the push slots through which a fish bends the leaves it
 * swims into (the meadow's shader reads them: seagrass interaction). One per page; World binds the meadow of the map
 * on arrival and unbinds it on leaving. Without a meadow (the 葛西 flat, the tank) every query is empty.
 */
export class SeagrassField implements SeagrassQuery {
  private meadow: MeadowLike | null = null;
  private readonly index = new WeakMap<AmamoPatch, PatchIndex>();
  private readonly taken: boolean[] = [];
  private readonly found: { s: ShootSpec; d: number }[] = [];

  bind(meadow: MeadowLike | null): void {
    if (this.meadow && this.meadow !== meadow) for (let i = 0; i < this.taken.length; i++) this.releasePush(i);
    this.meadow = meadow;
    this.taken.length = 0;
  }

  get bound(): boolean {
    return this.meadow !== null;
  }

  private indexOf(p: AmamoPatch): PatchIndex {
    let ix = this.index.get(p);
    if (!ix) {
      const cells = new Map<number, ShootSpec[]>();
      for (const s of p.shoots) {
        const k = key(Math.floor(s.x / CELL), Math.floor(s.z / CELL));
        let l = cells.get(k);
        if (!l) { l = []; cells.set(k, l); }
        l.push(s);
      }
      ix = { cells };
      this.index.set(p, ix);
    }
    return ix;
  }

  near(x: number, z: number, r: number, out: ShootRef[], max = 24): number {
    const m = this.meadow;
    if (!m) return 0;
    const found = this.found;
    found.length = 0;
    for (const p of m.live.values()) {
      if (Math.hypot(p.cx - x, p.cz - z) > p.reach + r + 0.1) continue;
      const ix = this.indexOf(p);
      const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const l = ix.cells.get(key(i, j));
        if (!l) continue;
        for (const s of l) {
          const d = Math.hypot(s.x - x, s.z - z);
          if (d <= r) found.push({ s, d });
        }
      }
    }
    found.sort((a, b) => a.d - b.d);
    const n = Math.min(max, found.length);
    for (let i = 0; i < n; i++) {
      const s = found[i].s;
      const o = out[i] ?? (out[i] = { x: 0, y: 0, z: 0, len: 0 });
      o.x = s.x; o.y = s.y; o.z = s.z; o.len = s.length;
    }
    return n;
  }

  private readonly flow = new Vector2();
  bladeAt(s: ShootRef, h: number, out: Vector3): Vector3 {
    // the blades lean with the current as the shader bends them (params.MOTION: bend per m/s, saturating)
    const c = this.current(this.flow);
    const m = c.length() * MOTION.bendPerMps;
    const cap = MOTION.maxAngleWet;
    const th = cap * (1 - Math.exp(-m / cap));
    const k = m > 1e-6 ? Math.sin(th) / c.length() : 0;
    return out.set(s.x + c.x * k * h, s.y + h * Math.cos(th), s.z + c.y * k * h);
  }

  cover(x: number, z: number): number {
    return this.meadow ? this.meadow.coverAt(x, z) : 0;
  }

  current(out: Vector2): Vector2 {
    return this.meadow ? out.copy(this.meadow.kit.uniforms.uAmCurrent.value) : out.set(0, 0);
  }

  private pushes(): Vector4[] | null {
    return this.meadow ? this.meadow.kit.uniforms.uAmPush.value : null;
  }

  claimPush(): number {
    const p = this.pushes();
    if (!p) return -1;
    for (let i = 0; i < p.length; i++) if (!this.taken[i]) { this.taken[i] = true; return i; }
    return -1;
  }

  setPush(slot: number, x: number, y: number, z: number, radius: number): void {
    const p = this.pushes();
    if (!p || slot < 0 || slot >= p.length) return;
    p[slot].set(x, y, z, radius);
  }

  releasePush(slot: number): void {
    const p = this.pushes();
    if (slot < 0) return;
    this.taken[slot] = false;
    if (p && slot < p.length) p[slot].set(0, -1e3, 0, 0);
  }
}

/** the page's one bridge to the meadow (World binds it) */
export const seagrass = new SeagrassField();
