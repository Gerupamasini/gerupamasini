import type { MapDef } from '../data/schemas';

export type LeveeDef = NonNullable<MapDef['levee']>;

/** A point on the levee's centre line: where, which way it runs, which way is in (toward the enclosed flat). */
export interface LeveeSample { x: number; z: number; tx: number; tz: number; nx: number; nz: number; s: number; tipDist: number }

/**
 * The centre line of a map's stone levee (the same line the terrain bake built it on), walked by arc length: the
 * riprap, the oyster sites and the reeds follow it.
 */
export class LeveeLine {
  readonly length: number;
  private readonly lens: number[] = [0];
  /** +1 when the enclosure lies to the left of the line's direction (x east, z south), −1 to the right */
  private readonly inSide: number;

  constructor(readonly def: LeveeDef) {
    const p = def.path;
    for (let i = 1; i < p.length; i++) this.lens.push(this.lens[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    this.length = this.lens[this.lens.length - 1];
    // the enclosure is the line closed across the mouth: its signed area says which side is in
    let area = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) area += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
    this.inSide = area > 0 ? -1 : 1;
  }

  /** the point at arc length `s` from the first tip */
  at(s: number): LeveeSample {
    const p = this.def.path, lens = this.lens;
    s = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < lens.length - 1 && lens[i] < s) i++;
    const seg = lens[i] - lens[i - 1] || 1;
    const u = (s - lens[i - 1]) / seg;
    const tx = (p[i][0] - p[i - 1][0]) / seg, tz = (p[i][1] - p[i - 1][1]) / seg;
    // the left of (tx, tz) in this frame is (tz, −tx)
    const nx = this.inSide * tz, nz = -this.inSide * tx;
    return { x: p[i - 1][0] + (p[i][0] - p[i - 1][0]) * u, z: p[i - 1][1] + (p[i][1] - p[i - 1][1]) * u, tx, tz, nx, nz, s, tipDist: Math.min(s, this.length - s) };
  }

  /** distance from a point to the centre line */
  distance(x: number, z: number): number {
    const p = this.def.path;
    let best = Infinity;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1][0], az = p[i - 1][1], vx = p[i][0] - ax, vz = p[i][1] - az, L2 = vx * vx + vz * vz || 1e-9;
      const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      best = Math.min(best, Math.hypot(x - ax - vx * u, z - az - vz * u));
    }
    return best;
  }

  /** how far out from the centre line the faces reach the flat (m), at full crest height */
  get reach(): number { return this.def.crest_half_m + (this.def.crest_tp_m + 2.6) / this.def.slope; }
}
