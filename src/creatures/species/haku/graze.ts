import { Vector3 } from 'three';
import type { MeadowProbe } from '../../drivers/Driver';
import { shootLine, shootRef, shootState, type LeafRef, type ShootRef, type ShootState } from '../../../world/amamo/flow';
import { LEAF_SLOTS } from '../../../world/amamo/params';

/**
 * Where a grazing mullet puts its mouth: a spot on an eelgrass leaf, followed as the leaf sways (the same motion the
 * meadow's shader gives it, world/amamo/flow.ts), or a spot on the bed.
 *
 * Young mullet feed on the film that grows over everything in the shallows: diatoms, fine algae and detritus coating the
 * eelgrass leaves (the "コケ" on the アマモ) and the sand. On a leaf a fish sets its lips against the blade and scrapes,
 * a few quick bites working along it with a twist of the head, tugging the leaf; on the bed it tips head-down, takes a
 * mouthful of the surface layer, and then, sorting it in its pharynx, puffs the sand back out through its gill slits.
 */
export interface GrazeSpot {
  kind: 'blade' | 'bed';
  /** the shoot, the leaf of it (one of the two long outer ones), its state this frame, and the arc length up it (m) where the mouth is */
  shoot: ShootRef | null;
  leaf: LeafRef | null;
  state: ShootState | null;
  arc: number;
  /** the lowest the bites may work down to (m up the leaf: where it leaves the sheath) */
  arcMin: number;
  /** the spot (world), refreshed every frame for a leaf */
  readonly point: Vector3;
  /** horizontal direction from the leaf toward the fish's side of it (the face it scrapes) */
  readonly face: Vector3;
  /** bites left, and the side the fish rolls to (toward the leaf) */
  bites: number;
  /** a key for the shoot, so two fish of a school do not crowd one leaf */
  key: string;
}

const line: Vector3[] = Array.from({ length: 14 }, () => new Vector3());

/** the two long outer leaves of a shoot (LEAF_SLOTS 0 and 1, one to either side of the fan), at their mean lean */
const LEAVES: LeafRef[] = [0, 1].map((i) => ({ side: LEAF_SLOTS[i].side, splay: LEAF_SLOTS[i].splay, rel: LEAF_SLOTS[i].rel }));
/** how far above the sheath the bites go (m): the leaf is followed closely there (flow.ts LeafRef) */
const BAND = 0.07;

/**
 * Pick a leaf near (x, z) for a fish of length tl: a shoot within `reach` whose leaves stand in water deep enough for
 * the fish, one of its long outer leaves, and a height on it a little above the sheath (where the free blades start,
 * and the CPU's line keeps to the drawn leaf), under the surface. Null when there is none (no meadow, the camera too far
 * for the patch to be grown, all taken).
 */
export function pickBlade(meadow: MeadowProbe | null | undefined, x: number, z: number, y: number, tl: number, depthBody: number,
  water: (x: number, z: number) => number, taken: Set<string>, rnd: () => number): GrazeSpot | null {
  if (!meadow) return null;
  const reach = Math.max(0.12, 5 * tl);
  const shoots = meadow.shootsNear(x, z, reach, 16);
  let best: GrazeSpot | null = null, bestScore = -1e9;
  for (const s of shoots) {
    const key = `${s.x.toFixed(3)},${s.z.toFixed(3)}`;
    if (taken.has(key)) continue;
    const top = water(s.x, s.z);
    const depth = top - s.y;
    if (depth < 3 * depthBody) continue;
    // up the leaves: above the sheath and the fish's own depth over the bed, below the tip and the surface
    const lo = Math.max(s.sheath * 1.05, 1.4 * depthBody), hi = Math.min(s.sheath + BAND, s.length * 0.85, depth - 1.2 * depthBody);
    if (hi <= lo) continue;
    const arc = lo + (hi - lo) * (0.25 + 0.6 * rnd());
    // near the fish's own level and close by, a little at random
    const dy = Math.abs(s.y + arc * 0.9 - y);
    const score = -Math.hypot(s.x - x, s.z - z) / reach - 0.6 * dy / Math.max(tl, 0.02) * 0.2 + 0.5 * rnd();
    if (score > bestScore) {
      bestScore = score;
      const leaf = LEAVES[rnd() < 0.5 ? 0 : 1];
      best = { kind: 'blade', shoot: shootRef(s), leaf, state: null, arc, arcMin: s.sheath * 0.95, point: new Vector3(), face: new Vector3(), bites: 0, key };
    }
  }
  return best;
}

/** Bring a leaf spot up to date with the leaf's sway (`steps` line segments up to the spot: fewer for a far fish). */
export function trackBlade(meadow: MeadowProbe, g: GrazeSpot, fishX: number, fishZ: number, steps: number): void {
  if (!g.shoot) return;
  const u = meadow.kit.uniforms;
  g.state = shootState(u, g.shoot, g.state ?? undefined);
  const n = Math.max(2, Math.min(line.length - 1, steps));
  const k = shootLine(u, g.shoot, g.state, g.arc / n, g.arc, line, g.leaf ?? undefined);
  g.point.copy(line[k - 1]);
  const fx = fishX - g.point.x, fz = fishZ - g.point.z, l = Math.hypot(fx, fz);
  if (l > 1e-6) g.face.set(fx / l, 0, fz / l);
}

/** A spot on the bed ahead of the fish (`ahead` m), where the water is deep enough for it to tip down and feed. */
export function pickBed(x: number, z: number, heading: number, ahead: number, depthBody: number,
  floor: { heightAt(x: number, z: number): number; waterAt(x: number, z: number): number }, rnd: () => number): GrazeSpot | null {
  for (let i = 0; i < 4; i++) {
    const a = heading + (rnd() * 2 - 1) * 0.9, r = ahead * (0.6 + 0.8 * rnd());
    const tx = x + Math.sin(a) * r, tz = z + Math.cos(a) * r;
    const bed = floor.heightAt(tx, tz), top = floor.waterAt(tx, tz);
    if (top - bed < 2.6 * depthBody) continue;
    const g: GrazeSpot = { kind: 'bed', shoot: null, leaf: null, state: null, arc: 0, arcMin: 0, point: new Vector3(tx, bed, tz), face: new Vector3(), bites: 0, key: '' };
    return g;
  }
  return null;
}
