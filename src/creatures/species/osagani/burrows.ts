import { Color, Vector3, type Object3D } from 'three';
import { BurrowRenderer, RENDER_ORDER } from '../../kometsukigani/Burrows.js';
import type { Floor } from '../../drivers/Driver';
import { MOUTH_R } from './behavior';

/**
 * The ヤマトオサガニ's burrows on the mud: the コメツキガニ's burrow renderer (a real hole near the eye — the slanting
 * shaft, its mouth cut where it meets the ground, and the depth cap that lets the crab be seen down it — and a dark
 * mouth with its wet, crumbled collar of excavated mud farther off), one for every flat, shared by the crabs. Each
 * crab registers its burrow and its body; the first crab to update in a frame lays them all out again.
 */

/** the burrow shaft variant (Burrows.js SHAFT_TILTS[1]: 0.6 rad from the vertical, as behavior.ts SHAFT_TILT) */
const TILT_K = 1;
/** open holes within this distance of the player (m), drawn with the fine shaft within the second */
const OPEN_WITHIN = 7, FINE_WITHIN = 1.4, DECAL_WITHIN = 30;

export interface BurrowEntry {
  x: number;
  z: number;
  az: number;
  /** the mouth's radius (m) */
  r: number;
  /** the crab: where it stands, its heading, how big, whether it is out on the mud (for its contact shadow) */
  crab: { x: number; z: number; heading: number; cw: number; out: boolean; shadow: number } | null;
}

const _e = new Vector3(), _n = new Vector3();

class Burrows {
  readonly renderer = new BurrowRenderer();
  readonly entries = new Set<BurrowEntry>();
  private stamp = Number.NaN;

  constructor(parent: Object3D) {
    parent.add(this.renderer.group);
    // the walls of a hole in wet mud: dark grey-brown, not the sand of the コメツキガニ's
    for (const row of this.renderer.shafts) for (const m of row) {
      const u = (m.material as { userData: { uniforms?: { uShaftSand: { value: Color } } } }).userData.uniforms;
      u?.uShaftSand.value.setRGB(0.1, 0.085, 0.065);
    }
  }

  /** lay out the holes, the mouths and the crabs' shadows (once a frame: `stamp` is the frame's game time) */
  frame(stamp: number, floor: Floor, player: Vector3): void {
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    const R = this.renderer;
    R.begin();
    R.beginContacts();
    for (const b of this.entries) {
      const d = Math.hypot(b.x - player.x, b.z - player.z);
      if (d > DECAL_WITHIN) continue;
      const y = floor.heightAt(b.x, b.z);
      const e = b.r * 2;
      _n.set(floor.heightAt(b.x - e, b.z) - floor.heightAt(b.x + e, b.z), 2 * e, floor.heightAt(b.x, b.z - e) - floor.heightAt(b.x, b.z + e)).normalize();
      _e.set(b.x, y, b.z);
      // the mouth and the apron of wet, excavated mud round it (B13, B18, A39)
      R.addDecal(_e, _n, b.r * 2.6, b.r * 2.6, b.az, 0, 1, ((b.x * 977 + b.z * 131) % 1 + 1) % 1, 1);
      if (d < OPEN_WITHIN) R.addOpen(_e, b.r, TILT_K, b.az, _n, d < FINE_WITHIN);
      const c = b.crab;
      if (c && c.out && c.shadow > 0.01 && d < OPEN_WITHIN * 2) {
        _e.set(c.x, floor.heightAt(c.x, c.z), c.z);
        R.addContact(_e, _n, c.cw * 0.95, c.cw * 0.75, c.heading, 1, c.shadow);
      }
    }
    R.end();
    R.endContacts();
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

const BY_PARENT = new WeakMap<Object3D, Burrows>();

/** the flat's burrows (made with the first crab on it) */
export function burrowsFor(parent: Object3D): Burrows {
  let b = BY_PARENT.get(parent);
  if (!b) { b = new Burrows(parent); BY_PARENT.set(parent, b); }
  return b;
}

/** drop the flat's burrows once its last crab has gone */
export function releaseBurrow(parent: Object3D, entry: BurrowEntry): void {
  const b = BY_PARENT.get(parent);
  if (!b) return;
  b.entries.delete(entry);
  if (b.entries.size === 0) { b.dispose(); BY_PARENT.delete(parent); }
}

/** the mouth's radius for a crab (m) */
export const mouthRadius = (cw: number) => cw * MOUTH_R;

/** the crabs draw before the depth cap of the holes, so that one down its burrow is seen through the opening */
export const CRAB_RENDER_ORDER = RENDER_ORDER.crab;
