import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { hashInts } from '../../core/Rng';
import type { OysterGenome } from './genome';
import { growthVariant, lamellaAt, plication, smooth, type GrowthVariant, type ValvePattern } from './variants';

/**
 * Procedural マガキ valves.
 *
 * A valve is a surface over (u, s) (see variants.ts): the planar outline O(u) is scaled toward the beak by s, so the
 * shell at growth stage s is a smaller copy of today's outline, as an oyster's growth lines are. On that plane the
 * lower valve sinks into a cup (deepest a little inside the margin, steep-sided), the upper valve domes a little;
 * both carry the radial folds, which make the commissure zig-zag where the valves meet.
 *
 * The big growth lamellae are geometry: over the smooth envelope the shell is a staircase, thickest at the beak,
 * stepping down onto each younger layer toward the margin; just before each step the free edge of the older layer
 * curls up into a frill and overhangs the younger one (the surface folds back under it). That is what makes the
 * silhouette read as stacked, flaky plates. The minor lamellae, growth lines, radial striae, pits and grain between
 * them are baked into the normal / height / roughness maps over the same (u, s), so the two line up.
 *
 * A chipped margin clamps the growth coordinate of a column: every row past the break collapses onto it with the
 * offset of its own layer, so the break shows the shell's layered thickness, as a real broken oyster edge does.
 *
 * Everything is built in the oyster's local frame (genome.ts): hinge at the origin, +x along the hinge axis, +z to
 * the ventral margin, +y toward the upper valve. The upper valve opens by turning about +x.
 *
 * Vertex attributes: position, normal, uv (into the texture atlas), aInfo = (part, follow, sub, shell length):
 *   part   0 lower exterior, 1 lower interior, 2 upper exterior, 3 upper interior, 4 ligament, 5 mantle (lower lobe),
 *          6 mantle (upper lobe), 7 body / gills, 8 barnacle, 9 tentacle
 *   follow how much of the upper valve's opening this vertex follows (0 lower valve .. 1 upper valve)
 *   sub    barnacle slot (1..), broken-edge flag (1) on shell rows, random phase on soft tissue
 */
export const PART = { LOWER_EXT: 0, LOWER_INT: 1, UPPER_EXT: 2, UPPER_INT: 3, LIGAMENT: 4, MANTLE_L: 5, MANTLE_U: 6, BODY: 7, BARNACLE: 8, TENTACLE: 9 } as const;

export interface GeometryDetail {
  /** columns along the margin */
  nU: number;
  /** regular rows between two lamellae */
  rowsPerGap: number;
  /** 4: frill, tip, overhang and the younger layer; 2: a plain step; 0: a smooth envelope (far) */
  lipRows: 0 | 2 | 4;
  interiorRows: number;
  mantle: 'full' | 'strip' | 'none';
  /** a tentacle every n mantle columns (0: none) */
  tentacleEvery: number;
  body: boolean;
  barnacles: 'full' | 'low' | 'none';
}

export const DETAIL = {
  hero: { nU: 200, rowsPerGap: 3, lipRows: 4, interiorRows: 18, mantle: 'full', tentacleEvery: 1, body: true, barnacles: 'full' },
  lod0: { nU: 64, rowsPerGap: 1, lipRows: 4, interiorRows: 6, mantle: 'full', tentacleEvery: 3, body: true, barnacles: 'full' },
  lod1: { nU: 20, rowsPerGap: 0, lipRows: 2, interiorRows: 2, mantle: 'strip', tentacleEvery: 0, body: true, barnacles: 'low' },
  lod2: { nU: 10, rowsPerGap: 0, lipRows: 0, interiorRows: 2, mantle: 'none', tentacleEvery: 0, body: false, barnacles: 'none' },
} satisfies Record<string, GeometryDetail>;

/** Where each variant's tiles sit in a texture atlas. */
export interface AtlasLayout {
  cols: number;
  rows: number;
  /** tile heights as fractions of a variant block: lower exterior, upper exterior, lower interior, upper interior */
  tileFrac: readonly [number, number, number, number];
  /** inset of every tile in uv (half a texel or so, against bleeding) */
  padU: number;
  padV: number;
  /** which block holds a growth variant (null: block = variant index) */
  blocks: Record<number, number> | null;
}

export const TILE = { EXT_L: 0, EXT_U: 1, INT_L: 2, INT_U: 3 } as const;
/** tiles whose growth coordinate runs downward in the atlas */
export const TILE_FLIP = [false, true, false, true] as const;

export function atlasUv(a: AtlasLayout, variant: number, tile: number, u: number, s: number, out: [number, number]): [number, number] {
  const block = a.blocks ? a.blocks[variant] ?? 0 : variant;
  const col = block % a.cols, row = Math.floor(block / a.cols) % a.rows;
  let t0 = 0;
  for (let i = 0; i < tile; i++) t0 += a.tileFrac[i];
  const bw = 1 / a.cols, bh = 1 / a.rows;
  const uu = a.padU + Math.min(1, Math.max(0, u)) * (1 - 2 * a.padU);
  // tiles alternate in direction so that neighbours meet margin to margin and beak to beak (no bleeding of an
  // unlike region into another at the far mip levels)
  const sf = TILE_FLIP[tile] ? 1 - Math.min(1, Math.max(0, s)) : Math.min(1, Math.max(0, s));
  const ss = a.padV + sf * (1 - 2 * a.padV);
  out[0] = (col + uu) * bw;
  out[1] = (row + t0 + ss * a.tileFrac[tile]) * bh;
  return out;
}

const NO = 720;   // outline samples
const GU = 72, GS = 40;   // cup depth grid

/**
 * Everything about one oyster's form that does not depend on the level of detail: the outline, the cup, the
 * lamellae as they fall on this outline, chips. LODs, attachment points and collision proxies are read off it.
 */
export class OysterShape {
  readonly L: number;
  readonly variant: GrowthVariant;
  readonly ox = new Float32Array(NO + 1);
  readonly oz = new Float32Array(NO + 1);
  /** cup shape (0 at the margin .. 1 deep inside) on the (u, s) grid, lower and upper outline */
  private readonly cupL = new Float32Array((GU + 1) * (GS + 1));
  private readonly cupU = new Float32Array((GU + 1) * (GS + 1));
  /** margin after chips (growth units), per valve, sampled at NO+1 */
  readonly smaxL = new Float32Array(NO + 1);
  readonly smaxU = new Float32Array(NO + 1);
  /** inset factor of the upper outline */
  private readonly insetK = new Float32Array(NO + 1);
  private readonly lam: [number, number, number, number] = [0, 0, 0, 0];
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpC = new Vector3();

  constructor(readonly g: OysterGenome) {
    this.L = g.length;
    this.variant = growthVariant(g.variant);
    this.buildOutline();
    this.buildChips();
    this.buildCup(this.cupL, false);
    this.buildCup(this.cupU, true);
  }

  /** u as the growth pattern sees it (the pattern may be mirrored along the margin) */
  uT(u: number): number {
    return this.g.mirror ? 1 - u : u;
  }

  private buildOutline(): void {
    const g = this.g, L = this.L, W = L * g.widthRatio;
    const pts: number[] = [];
    const side = (sgn: number) => {
      const a = g.beakExp * (1 + 0.18 * g.asym * sgn), b = g.ventralExp * (1 - 0.12 * g.asym * sgn);
      const tStar = a / (a + b);
      const norm = Math.pow(tStar, a) * Math.pow(1 - tStar, b);
      const kap = Math.log(g.widest) / Math.log(tStar);
      const half = (W / 2) * (1 + g.asym * sgn);
      const out: number[] = [];
      const N = 360;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const w = (half * Math.pow(t, a) * Math.pow(1 - t, b)) / norm;
        out.push(sgn * w, L * Math.pow(t, kap));
      }
      return out;
    };
    const left = side(-1), right = side(1);
    for (let i = 0; i < left.length; i += 2) pts.push(left[i], left[i + 1]);
    for (let i = right.length - 4; i >= 0; i -= 2) pts.push(right[i], right[i + 1]);
    // arc length
    const n = pts.length / 2;
    const acc = new Float64Array(n);
    for (let i = 1; i < n; i++) acc[i] = acc[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    const total = acc[n - 1];
    let j = 0;
    for (let k = 0; k <= NO; k++) {
      const target = (k / NO) * total;
      while (j < n - 2 && acc[j + 1] < target) j++;
      const f = (target - acc[j]) / Math.max(1e-9, acc[j + 1] - acc[j]);
      let x = pts[j * 2] + (pts[j * 2 + 2] - pts[j * 2]) * f;
      let z = pts[j * 2 + 1] + (pts[j * 2 + 3] - pts[j * 2 + 1]) * f;
      // irregular margin: low harmonics along the margin, held still at the beak
      const u = k / NO;
      const env = smooth(0.02, 0.2, u) * smooth(0.98, 0.8, u);
      let r = 0;
      for (let h = 0; h < 6; h++) r += g.harmonics[h * 2] * Math.cos(Math.PI * 2 * (h + 2) * u + g.harmonics[h * 2 + 1]);
      // local lobes where growth went its own way for a while
      r += 0.05 * Math.pow(Math.max(0, Math.cos(Math.PI * 2 * (u * 3.0 + g.harmonics[1]))), 8) * (g.harmonics[3] > Math.PI ? 1 : 0);
      x *= 1 + r * env;
      z *= 1 + r * env * 0.7;
      // the growth axis bends to one side
      x += g.bend * L * (z / L) * (z / L);
      this.ox[k] = x;
      this.oz[k] = z;
    }
    this.ox[0] = this.oz[0] = this.ox[NO] = this.oz[NO] = 0;
    for (let k = 0; k <= NO; k++) {
      const u = k / NO;
      const r = Math.max(0.15 * L, Math.hypot(this.ox[k], this.oz[k]));
      this.insetK[k] = 1 - (g.inset * L * smooth(0.0, 0.12, Math.min(u, 1 - u))) / r;
    }
  }

  private buildChips(): void {
    const g = this.g;
    for (let k = 0; k <= NO; k++) {
      const u = k / NO;
      let dl = 0, du = 0;
      for (const c of g.chips) {
        const t = (u - c.u) / c.w;
        if (Math.abs(t) >= 1) continue;
        // a jagged bite: deepest in the middle, stepped edges
        const jag = 0.7 + 0.3 * ((hashInts(c.seed, Math.floor(u * 160)) % 1000) / 1000);
        const d = c.depth * (1 - Math.pow(Math.abs(t), 1.6)) * jag;
        if (c.valve === 0) dl = Math.max(dl, d); else du = Math.max(du, d);
      }
      this.smaxL[k] = 1 - dl;
      this.smaxU[k] = 1 - du;
    }
  }

  /**
   * The cup: the shape a membrane takes pinned to the outline and pressed in evenly (Poisson's ∇²h = −1, solved on a
   * grid by over-relaxation) — smooth everywhere, no crease along the middle however narrow or bent the outline.
   * Its height, normalised, is turned into steep sides and a broad floor (lower) or a low dome (lid).
   */
  private buildCup(dst: Float32Array, upper: boolean): void {
    const M = 160, G = 72;
    const px = new Float32Array(M + 1), pz = new Float32Array(M + 1);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i <= M; i++) {
      const k = Math.round((i / M) * NO), f = upper ? this.insetK[k] : 1;
      px[i] = this.ox[k] * f; pz[i] = this.oz[k] * f;
      x0 = Math.min(x0, px[i]); x1 = Math.max(x1, px[i]); z0 = Math.min(z0, pz[i]); z1 = Math.max(z1, pz[i]);
    }
    const pad = 0.04 * this.L;
    x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    const span = Math.max(x1 - x0, z1 - z0), h = span / (G - 1);
    const inside = new Uint8Array(G * G), H = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = x0 + i * h, z = z0 + j * h;
      let c = false;
      for (let m = 0, n = M - 1; m < M; n = m++) {
        if ((pz[m] > z) !== (pz[n] > z) && x < ((px[n] - px[m]) * (z - pz[m])) / (pz[n] - pz[m]) + px[m]) c = !c;
      }
      inside[j * G + i] = c && i > 0 && j > 0 && i < G - 1 && j < G - 1 ? 1 : 0;
    }
    const w = 1.88, h2 = h * h;
    for (let it = 0; it < 260; it++) {
      for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
        const k = j * G + i;
        if (!inside[k]) continue;
        const v = (H[k - 1] + H[k + 1] + H[k - G] + H[k + G] + h2) * 0.25;
        H[k] += w * (v - H[k]);
      }
    }
    let hmax = 1e-9;
    for (let k = 0; k < H.length; k++) hmax = Math.max(hmax, H[k]);
    const P = this.tmpA;
    for (let j = 0; j <= GS; j++) for (let i = 0; i <= GU; i++) {
      this.planar(i / GU, j / GS, upper, P);
      const fx = Math.min(G - 1.001, Math.max(0, (P.x - x0) / h)), fz = Math.min(G - 1.001, Math.max(0, (P.z - z0) / h));
      const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      const a = H[iz * G + ix], b = H[iz * G + ix + 1], c = H[(iz + 1) * G + ix], d = H[(iz + 1) * G + ix + 1];
      const t = Math.max(0, ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz) / hmax);
      dst[j * (GU + 1) + i] = upper ? Math.pow(t, 0.8) : Math.pow(t, 0.5) * (1 - 0.15 * (1 - t));
    }
  }

  private cupAt(u: number, s: number, upper: boolean): number {
    const grid = upper ? this.cupU : this.cupL;
    const x = Math.min(1, Math.max(0, u)) * GU, y = Math.min(1, Math.max(0, s)) * GS;
    const i = Math.min(GU - 1, Math.floor(x)), j = Math.min(GS - 1, Math.floor(y));
    const fx = x - i, fy = y - j;
    const a = grid[j * (GU + 1) + i], b = grid[j * (GU + 1) + i + 1], c = grid[(j + 1) * (GU + 1) + i], d = grid[(j + 1) * (GU + 1) + i + 1];
    const raw = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    // the grid's interpolation leaves a little depth at the outline itself: take it out, so both valves' margins
    // lie exactly on the commissure
    const m = grid[GS * (GU + 1) + i] * (1 - fx) + grid[GS * (GU + 1) + i + 1] * fx;
    return Math.max(0, raw - m * Math.pow(Math.min(1, Math.max(0, s)), 4));
  }

  private outlineAt(u: number, upper: boolean, out: Vector3): Vector3 {
    const x = Math.min(1, Math.max(0, u)) * NO;
    const k = Math.min(NO - 1, Math.floor(x)), f = x - k;
    const ik = upper ? this.insetK[k] + (this.insetK[k + 1] - this.insetK[k]) * f : 1;
    out.set((this.ox[k] + (this.ox[k + 1] - this.ox[k]) * f) * ik, 0, (this.oz[k] + (this.oz[k + 1] - this.oz[k]) * f) * ik);
    return out;
  }

  smax(u: number, upper: boolean): number {
    const arr = upper ? this.smaxU : this.smaxL;
    const x = Math.min(1, Math.max(0, u)) * NO;
    const k = Math.min(NO - 1, Math.floor(x)), f = x - k;
    return arr[k] + (arr[k + 1] - arr[k]) * f;
  }

  /** the planar position at (u, s) */
  planar(u: number, s: number, upper: boolean, out: Vector3): Vector3 {
    this.outlineAt(u, upper, out);
    out.x *= s;
    out.z *= s;
    // the growth wander: zero at the beak and at today's margin, off-centre in between
    const [d1, d2, dz] = this.g.drift, L = this.L;
    const w1 = Math.sin(Math.PI * s), w2 = Math.sin(2 * Math.PI * s);
    out.x += L * this.g.widthRatio * (d1 * w1 + d2 * w2) * Math.sqrt(s);
    out.z += L * dz * w1 * s;
    return out;
  }

  /** commissure height of the margin at u (the zig-zag of the radial folds) */
  commissure(u: number): number {
    return this.g.plication * this.L * plication(this.uT(u), this.variant.plic);
  }

  /** the smooth envelope of a valve's exterior (no lamellae) */
  base(u: number, s: number, upper: boolean, out: Vector3): Vector3 {
    const g = this.g, L = this.L;
    this.planar(u, s, upper, out);
    let y = s * this.commissure(u);
    if (upper) {
      y += g.lidDome * L * this.cupAt(u, s, true);
      // the lid's edge rides up with the lower valve's flaring rim, so the two margins meet when shut
      y += g.lipRise * L * 0.75 * smooth(0.86, 1, s);
    } else {
      y -= g.cupDepth * L * this.cupAt(u, s, false) * (0.82 + 0.3 * (1 - s));
      // the margin flares up round the lid
      y += g.lipRise * L * smooth(0.86, 1, s);
    }
    // the commissure plane twists along the length
    y += g.twist * (out.z / L) * out.x;
    out.y = y;
    return out;
  }

  /** outward unit normal of the envelope (down / out for the lower valve, up for the upper) */
  baseNormal(u: number, s: number, upper: boolean, out: Vector3): Vector3 {
    const e = 1.5e-3, ss = Math.max(0.03, Math.min(0.995, s)), uu = Math.max(e, Math.min(1 - e, u));
    const a = this.base(uu - e, ss, upper, this.tmpA), b = this.base(uu + e, ss, upper, this.tmpB);
    const du = b.sub(a);
    const c = this.base(uu, ss - e, upper, this.tmpA), d = this.base(uu, ss + e, upper, this.tmpC);
    const ds = d.sub(c);
    // (s, u) runs the same way on both valves, so ds × du is the side facing the upper valve's outside
    out.crossVectors(ds, du).normalize();
    if (!upper) out.negate();
    if (!Number.isFinite(out.x) || out.lengthSq() < 0.5) out.set(0, upper ? 1 : -1, 0);
    return out;
  }

  /** shell thickness (metres) at growth stage s */
  thickness(s: number): number {
    const g = this.g;
    return this.L * (g.thinMargin + (g.thickBeak - g.thinMargin) * Math.pow(1 - s, 1.6)) * smooth(0, 0.07, s);
  }

  pattern(upper: boolean): ValvePattern {
    return upper ? this.variant.upper : this.variant.lower;
  }

  /**
   * Lamella k of a valve as it falls on this shell at u: (s, step height m, lift m, overhang) with the individual's
   * frill strength and broken frills applied.
   */
  lamella(upper: boolean, k: number, u: number, out: [number, number, number, number]): [number, number, number, number] {
    const g = this.g;
    lamellaAt(this.pattern(upper), k, this.uT(u), out);
    const young = g.age === 'spat' || g.age === 'juvenile';
    out[1] *= this.L * (young ? 0.45 : 1) * (0.7 + 0.3 * g.frill);
    out[2] *= this.L * g.frill;
    // broken frills come in runs along the margin
    const cell = Math.floor(this.uT(u) * 26 + k * 7.3);
    const r = (hashInts(g.seeds.damageSeed, cell, k) % 1000) / 1000;
    if (r < g.brokenFrills) { out[2] *= 0.05; out[3] *= 0.15; }
    return out;
  }

  /** the exterior (with the lamella staircase) at (u, s): a point on the outer surface, for barnacles and settlers */
  extPoint(u: number, s: number, upper: boolean, out: Vector3, nOut?: Vector3): Vector3 {
    const p = this.pattern(upper), K = p.K, lam = this.lam;
    let stair = 0, first = true;
    for (let k = 0; k < K; k++) {
      this.lamella(upper, k, u, lam);
      if (lam[0] <= s) continue;
      stair += lam[1];
      // the curl of the frill of the layer this point lies on, just before its edge
      if (first) stair += lam[2] * Math.pow(smooth(lam[0] - 0.03, lam[0], s), 1.5);
      first = false;
    }
    stair *= smooth(0, 0.1, s);
    const n = this.baseNormal(u, s, upper, nOut ?? new Vector3());
    this.base(u, s, upper, out);
    out.addScaledVector(n, stair);
    return out;
  }

  /**
   * Points on the shell where a settling spat can cement itself, in the local frame, with outward normals: the
   * lid, and the lower valve's flanks and margin (not its underside, which is on the host).
   */
  attachPoints(seed: number, count = 28): { p: Vector3; n: Vector3; upper: boolean }[] {
    const out: { p: Vector3; n: Vector3; upper: boolean }[] = [];
    for (let i = 0; out.length < count && i < count * 6; i++) {
      const h = hashInts(seed, i, 77);
      const upper = h % 3 !== 0;
      const u = 0.12 + 0.76 * (((h >>> 4) % 1000) / 1000);
      const s = upper ? 0.3 + 0.62 * (((h >>> 14) % 1000) / 1000) : 0.55 + 0.4 * (((h >>> 14) % 1000) / 1000);
      if (s > this.smax(u, upper) - 0.03) continue;
      const n = new Vector3();
      const p = this.extPoint(u, s, upper, new Vector3(), n);
      if (!upper && n.y < -0.55) continue;   // underneath: against the host
      out.push({ p, n, upper });
    }
    return out;
  }

  /** a few spheres along the shell (local frame) that stand in for it when settling others around it */
  collisionSpheres(): { c: Vector3; r: number }[] {
    const out: { c: Vector3; r: number }[] = [];
    const a = new Vector3(), b = new Vector3();
    for (const s of [0.22, 0.45, 0.68, 0.88]) {
      // the ring at growth stage s: its centre and mean half-width
      let cx = 0, cz = 0, n = 0, w = 0;
      for (let i = 1; i < 16; i++) { this.planar(i / 16, s, false, a); cx += a.x; cz += a.z; n++; }
      cx /= n; cz /= n;
      for (let i = 1; i < 16; i++) { this.planar(i / 16, s, false, a); w += Math.hypot(a.x - cx, a.z - cz); }
      w /= 15;
      const yl = this.base(0.5, s * 0.6, false, b).y, yu = this.base(0.5, s * 0.6, true, b).y;
      out.push({ c: new Vector3(cx, (yl + yu) / 2, cz), r: Math.max(w * 0.8, (yu - yl) * 0.6) });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------- mesh building

interface Row { s: number; off: number; uvS: number; broken: number }

/** A writer of vertices and triangles into flat arrays (then one BufferGeometry). */
class MeshWriter {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  info: number[] = [];
  idx: number[] = [];
  get count(): number { return this.pos.length / 3; }
  vert(p: Vector3, n: Vector3, u: number, v: number, part: number, follow: number, sub: number, L: number): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.info.push(part, follow, sub, L);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aInfo', new Float32BufferAttribute(this.info, 4));
    g.setIndex(this.count > 65535 ? new BufferAttribute(new Uint32Array(this.idx), 1) : new BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Smooth normals over a (rows × cols) grid of positions, area weighted, like computeVertexNormals would give for
 * the connected grid. `flip` swaps the winding (so the normals face outward).
 */
function gridNormals(P: Float32Array, rows: number, cols: number, flip: boolean): Float32Array {
  const N = new Float32Array(P.length);
  const ax = new Vector3(), bx = new Vector3(), cx = new Vector3(), e1 = new Vector3(), e2 = new Vector3(), fn = new Vector3();
  const add = (i: number) => { N[i * 3] += fn.x; N[i * 3 + 1] += fn.y; N[i * 3 + 2] += fn.z; };
  const face = (i0: number, i1: number, i2: number) => {
    ax.fromArray(P, i0 * 3); bx.fromArray(P, i1 * 3); cx.fromArray(P, i2 * 3);
    e1.subVectors(bx, ax); e2.subVectors(cx, ax);
    fn.crossVectors(e1, e2);
    if (flip) fn.negate();
    add(i0); add(i1); add(i2);
  };
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    face(a, d, b); face(b, d, e);
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]);
    if (l > 1e-20) { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; } else { N[i] = 0; N[i + 1] = 1; N[i + 2] = 0; }
  }
  return N;
}

/** Rows of a valve's exterior for one column (growth coordinate, normal offset, texture s, broken flag). */
function exteriorRows(shape: OysterShape, upper: boolean, u: number, d: GeometryDetail): Row[] {
  const rows: Row[] = [];
  const p = shape.pattern(upper), K = p.K;
  const lam: [number, number, number, number] = [0, 0, 0, 0];
  const smax = shape.smax(u, upper);
  // cumulative stair from the margin inward
  const s_: number[] = [], h_: number[] = [], lift_: number[] = [], ov_: number[] = [];
  for (let k = 0; k < K; k++) { shape.lamella(upper, k, u, lam); s_.push(lam[0]); h_.push(lam[1]); lift_.push(lam[2]); ov_.push(lam[3]); }
  const on: number[] = new Array(K + 1).fill(0);
  for (let k = K - 1; k >= 0; k--) on[k] = on[k + 1] + h_[k];
  const push = (s: number, off: number, uvS: number) => {
    const broken = s > smax + 1e-4 ? 1 : 0;
    const sc = Math.min(s, smax);
    rows.push({ s: sc, off: off * smooth(0, 0.1, sc), uvS: Math.min(uvS, smax), broken });
  };
  if (d.lipRows === 0) {
    // far: a smooth envelope with the staircase averaged out
    const n = 3;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      let off = 0;
      for (let k = 0; k < K; k++) off += h_[k] * (1 - smooth(s_[k] - 0.06, s_[k] + 0.06, s));
      push(s, off, s);
    }
    return rows;
  }
  push(0, on[0], 0);
  let a = 0;
  for (let k = 0; k < K; k++) {
    const b = s_[k];
    const liftW = Math.min(0.35 * (b - a), 0.03);
    for (let j = 1; j <= d.rowsPerGap; j++) {
      const s = a + ((b - liftW - a) * j) / (d.rowsPerGap + 1);
      push(s, on[k], s);
    }
    const lifted = lift_[k];
    const ov = ov_[k];
    if (d.lipRows === 4) {
      push(b - liftW, on[k], b - liftW);
      push(b, on[k] + lifted, b - 0.002);
      push(b + ov, on[k] + lifted * 1.06, b + 0.004);
      a = b + ov * 0.3 + 0.002;
      push(a, on[k + 1] + 0.00012 * shape.L, b + 0.011);
    } else {
      push(b, on[k] + lifted * 0.8, b - 0.002);
      a = b + 0.004;
      push(a, on[k + 1], b + 0.011);
    }
  }
  const rest = Math.max(1, d.rowsPerGap + 1);
  for (let j = 1; j <= rest; j++) { const s = a + ((1 - a) * j) / rest; push(s, 0, s); }
  return rows;
}

const V0 = new Vector3(), V1 = new Vector3(), V2 = new Vector3(), V3 = new Vector3();
const UV: [number, number] = [0, 0];

/**
 * One valve (exterior, rim, interior) into a writer. Returns nothing; vertices go with part ids for this valve.
 */
function writeValve(w: MeshWriter, shape: OysterShape, upper: boolean, d: GeometryDetail, atlas: AtlasLayout): void {
  const cols = d.nU + 1;
  const L = shape.L;
  const variant = shape.g.variant;
  // exterior rows per column (same count in every column)
  const colRows: Row[][] = [];
  for (let c = 0; c < cols; c++) colRows.push(exteriorRows(shape, upper, c / d.nU, d));
  const nExt = colRows[0].length;
  const nInt = d.interiorRows + 1;
  // grid rows: exterior (nExt), rim mid (1), interior (nInt) — normals over the whole grid, then the uv seam
  const rows = nExt + 1 + nInt;
  const P = new Float32Array(rows * cols * 3);
  const UVs = new Float32Array(rows * cols * 2);
  const BR = new Uint8Array(rows * cols);
  const n = V1, q = V2;
  for (let c = 0; c < cols; c++) {
    const u = c / d.nU;
    const rr = colRows[c];
    for (let r = 0; r < nExt; r++) {
      const row = rr[r];
      shape.base(u, row.s, upper, q);
      shape.baseNormal(u, row.s, upper, n);
      q.addScaledVector(n, row.off);
      const i = r * cols + c;
      q.toArray(P, i * 3);
      atlasUv(atlas, variant, upper ? 1 : 0, shape.uT(u), row.uvS, UV);
      UVs[i * 2] = UV[0]; UVs[i * 2 + 1] = UV[1];
      BR[i] = row.broken;
    }
    // interior: from the margin back to the beak, offset inward by the shell's thickness
    const smax = shape.smax(u, upper);
    for (let r = 0; r < nInt; r++) {
      const t = r / (nInt - 1);
      const s = smax * (1 - Math.pow(t, 1.25));
      shape.base(u, s, upper, q);
      shape.baseNormal(u, s, upper, n);
      q.addScaledVector(n, -shape.thickness(s));
      const i = (nExt + 1 + r) * cols + c;
      q.toArray(P, i * 3);
      atlasUv(atlas, variant, upper ? 3 : 2, shape.uT(u), s, UV);
      UVs[i * 2] = UV[0]; UVs[i * 2 + 1] = UV[1];
    }
    // the rim: halfway between the last exterior row and the first interior row, pushed out along the growth
    const e = (nExt - 1) * cols + c, iin = (nExt + 1) * cols + c, m = nExt * cols + c;
    V0.fromArray(P, e * 3); V3.fromArray(P, iin * 3);
    shape.planar(Math.max(0.002, Math.min(0.998, u)), 1, upper, q);
    const gl = Math.hypot(q.x, q.z) || 1;
    const th = V0.distanceTo(V3);
    V0.add(V3).multiplyScalar(0.5);
    V0.x += (q.x / gl) * th * 0.3;
    V0.z += (q.z / gl) * th * 0.3;
    V0.toArray(P, m * 3);
    atlasUv(atlas, variant, upper ? 1 : 0, shape.uT(u), smax - 0.001, UV);
    UVs[m * 2] = UV[0]; UVs[m * 2 + 1] = UV[1];
    BR[m] = smax < 0.995 ? 1 : 0;
  }
  // the lower valve's exterior faces down: its (u, s) winding gives the outward side when flipped
  const flip = !upper;
  const N = gridNormals(P, rows, cols, flip);
  // emit: rows 0..nExt (exterior + rim mid) then the interior margin row twice (rim end with exterior uv, interior)
  const partE = upper ? 2 : 0, partI = upper ? 3 : 1, follow = upper ? 1 : 0;
  const base = w.count;
  const pv = new Vector3(), nv = new Vector3();
  const emitRow = (r: number, part: number, uvFrom: number | null) => {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      pv.fromArray(P, i * 3); nv.fromArray(N, i * 3);
      const j = uvFrom === null ? i : uvFrom * cols + c;
      w.vert(pv, nv, UVs[j * 2], UVs[j * 2 + 1], part, follow, BR[j], L);
    }
  };
  for (let r = 0; r <= nExt; r++) emitRow(r, partE, null);
  emitRow(nExt + 1, partE, nExt);              // rim end: the interior margin's position, the rim's texture
  for (let r = nExt + 1; r < rows; r++) emitRow(r, partI, null);
  const strip = (r0: number, r1: number) => {
    for (let c = 0; c < cols - 1; c++) {
      const a = base + r0 * cols + c, b = a + 1, dd = base + r1 * cols + c, e = dd + 1;
      if (flip) { w.tri(a, b, dd); w.tri(b, e, dd); } else { w.tri(a, dd, b); w.tri(b, dd, e); }
    }
  };
  for (let r = 0; r < nExt; r++) strip(r, r + 1);       // exterior and on to the rim
  strip(nExt, nExt + 1);                                  // rim mid → rim end
  for (let r = nExt + 2; r < rows + 1 - 1; r++) strip(r, r + 1);   // interior
}

/** Point on a valve's interior at (u, s), with the inward normal. */
function interiorPoint(shape: OysterShape, upper: boolean, u: number, s: number, out: Vector3, nIn: Vector3): Vector3 {
  shape.base(u, s, upper, out);
  shape.baseNormal(u, s, upper, nIn);
  out.addScaledVector(nIn, -shape.thickness(s));
  nIn.negate();
  return out;
}

/**
 * The soft parts seen through the gape: the two mantle lobes with their dark, tentacled margins, and the body
 * (visceral mass and gills) filling the cup behind them. The lobes stand in the space between the interiors near the
 * margin; their free edges nearly meet a little above the middle of that space, the upper lobe following the lid.
 */
function writeSoft(w: MeshWriter, shape: OysterShape, d: GeometryDetail): void {
  const L = shape.L;
  const nM = Math.max(8, Math.round(d.nU * 0.8));
  const u0 = 0.07, u1 = 0.93;
  const seed = shape.g.seeds.colorSeed;
  const pL = new Vector3(), pU = new Vector3(), nL = new Vector3(), nU = new Vector3(), q = new Vector3(), nn = new Vector3();
  const sEdge = 0.955;
  const lobe = (upper: boolean) => {
    const rowsS = d.mantle === 'full' ? [0.82, 0.88, 0.925, 1] : [0.85, 1];
    const cols = nM + 1, nr = rowsS.length;
    const P = new Float32Array(cols * nr * 3);
    const edgeFollow = upper ? 0.72 : 0.22;
    for (let c = 0; c < cols; c++) {
      const u = u0 + ((u1 - u0) * c) / nM;
      // the space between the two interiors just inside the margin
      const sm = Math.min(sEdge, Math.min(shape.smax(u, false), shape.smax(u, true)) - 0.03);
      interiorPoint(shape, false, u, sm, pL, nL);
      interiorPoint(shape, true, u, sm, pU, nU);
      const wave = Math.sin(u * 140 + (seed % 97)) * 0.5 + Math.sin(u * 61 + (seed % 13)) * 0.5;
      const edgeY = pL.y + (pU.y - pL.y) * (upper ? 0.8 : 0.6) + wave * 0.0012 * L;
      for (let r = 0; r < nr; r++) {
        const t = rowsS[r];
        if (t < 1) {
          // attached part: just off the valve's interior, deeper in
          interiorPoint(shape, upper, u, sm * t, q, nn);
          q.addScaledVector(nn, 0.0018 * L);
        } else {
          q.copy(upper ? pU : pL);
          q.y = edgeY;
          shape.planar(u, sm - 0.004, false, V0);
          q.x = V0.x; q.z = V0.z;
        }
        q.toArray(P, (r * cols + c) * 3);
      }
    }
    // thin tissue seen from either side through the gape: both faces, each with its own normal
    const N = gridNormals(P, nr, cols, false);
    const pv = new Vector3(), nv = new Vector3();
    for (const face of [1, -1]) {
      const base = w.count;
      for (let r = 0; r < nr; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        pv.fromArray(P, i * 3); nv.fromArray(N, i * 3).multiplyScalar(face);
        const t = r / (nr - 1);
        const follow = upper ? 1 - (1 - edgeFollow) * t : edgeFollow * t;
        w.vert(pv, nv, t, c / nM, upper ? PART.MANTLE_U : PART.MANTLE_L, follow, (seed % 1000) / 1000, L);
      }
      for (let r = 0; r < nr - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const a = base + r * cols + c, b = a + 1, dd = a + cols, e = dd + 1;
        if (face > 0) { w.tri(a, dd, b); w.tri(b, dd, e); } else { w.tri(a, b, dd); w.tri(b, e, dd); }
      }
    }
    // tentacles along the free edge: fine dark threads of uneven length, irregularly spaced, pointing out
    // through the gape (two rows: the long ones of the middle fold, short ones of the inner fold)
    if (d.tentacleEvery > 0) {
      const tip = new Vector3(), mid = new Vector3(), dir = new Vector3(), side = new Vector3(), up = new Vector3(), root = new Vector3(), q0 = new Vector3();
      const nT = Math.round((cols * 2.2) / d.tentacleEvery);
      for (let t = 0; t < nT; t++) {
        const h = hashInts(seed, t, upper ? 1 : 0, 0x7e);
        const fc = ((h % 10007) / 10007) * (cols - 1);
        const c0 = Math.floor(fc), f = fc - c0;
        root.fromArray(P, ((nr - 1) * cols + c0) * 3).lerp(q0.fromArray(P, ((nr - 1) * cols + c0 + 1) * 3), f);
        const u = u0 + ((u1 - u0) * fc) / nM;
        shape.planar(u, 1, false, dir);
        dir.y = 0;
        dir.normalize();
        const row = (h >>> 14) & 1;
        const r1 = ((h >>> 3) % 1000) / 1000, r2 = ((h >>> 17) % 1000) / 1000;
        const len = L * (row ? 0.0018 + 0.003 * r1 : 0.003 + 0.007 * r1 * r1);
        const rad = L * (row ? 0.00035 : 0.0005) * (0.7 + 0.6 * r2);
        up.set(0, upper ? -1 : 1, 0);
        side.crossVectors(dir, up).normalize();
        root.addScaledVector(up, row * 0.001 * L).addScaledVector(dir, -row * 0.0015 * L);
        // a slight curl toward the other lobe and sideways
        mid.copy(root).addScaledVector(dir, len * 0.55).addScaledVector(up, len * 0.12).addScaledVector(side, (r2 - 0.5) * len * 0.3);
        tip.copy(root).addScaledVector(dir, len).addScaledVector(up, len * (0.3 + 0.3 * r1)).addScaledVector(side, (r2 - 0.5) * len * 0.6);
        const b0 = w.count;
        for (const [ring, k] of [[root, 1], [mid, 0.6]] as const) {
          for (let m = 0; m < 3; m++) {
            const a = (m / 3) * Math.PI * 2;
            const off = new Vector3().addScaledVector(side, Math.cos(a) * rad * k).addScaledVector(up, Math.sin(a) * rad * k);
            w.vert(ring.clone().add(off), off.clone().normalize(), 1, u, PART.TENTACLE, edgeFollow, r2, L);
          }
        }
        w.vert(tip, dir, 1, u, PART.TENTACLE, edgeFollow, r2, L);
        for (let m = 0; m < 3; m++) {
          const a = b0 + m, b = b0 + ((m + 1) % 3), c = a + 3, e = b + 3;
          w.tri(a, b, c); w.tri(b, e, c); w.tri(c, b, a); w.tri(c, e, b);
          w.tri(c, e, b0 + 6); w.tri(e, c, b0 + 6);
        }
      }
    }
  };
  lobe(false);
  lobe(true);
  if (!d.body) return;
  // the body: a pillow over the cup, between the interiors, sloping down into the lower interior at its edges
  const cols = Math.max(6, Math.round(nM * 0.5)) + 1, nr = d.mantle === 'full' ? 9 : 4;
  const P = new Float32Array(cols * nr * 3);
  for (let r = 0; r < nr; r++) for (let c = 0; c < cols; c++) {
    const u = 0.1 + (0.8 * c) / (cols - 1), s = 0.1 + (0.72 * r) / (nr - 1);
    interiorPoint(shape, false, u, s, pL, nL);
    interiorPoint(shape, true, u, s, pU, nU);
    const edge = Math.min(smooth(0, 0.25, c / (cols - 1)), smooth(1, 0.75, c / (cols - 1)), smooth(0, 0.2, r / (nr - 1)), smooth(1, 0.8, r / (nr - 1)));
    q.copy(pL).lerp(pU, 0.5 * edge + 0.03);
    q.toArray(P, (r * cols + c) * 3);
  }
  const N = gridNormals(P, nr, cols, false);
  const base = w.count;
  const pv = new Vector3(), nv = new Vector3();
  for (let r = 0; r < nr; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    pv.fromArray(P, i * 3); nv.fromArray(N, i * 3);
    w.vert(pv, nv, c / (cols - 1), r / (nr - 1), PART.BODY, 0.12, 0, L);
  }
  for (let r = 0; r < nr - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = base + r * cols + c, b = a + 1, dd = a + cols, e = dd + 1;
    w.tri(a, dd, b); w.tri(b, dd, e);
  }
}

/** The ligament: a dark horny wedge at the beak between the two valves' hinge areas. */
function writeLigament(w: MeshWriter, shape: OysterShape): void {
  const L = shape.L;
  const hw = L * shape.g.widthRatio * 0.05, z0 = -L * 0.004, z1 = L * 0.03, y0 = -L * 0.006, y1 = L * 0.002;
  const corners = [
    [-hw, y0, z0], [hw, y0, z0], [hw, y1, z0], [-hw, y1, z0],
    [-hw * 0.6, y0, z1], [hw * 0.6, y0, z1], [hw * 0.6, y1, z1], [-hw * 0.6, y1, z1],
  ];
  const faces = [[0, 1, 2, 3, 0, 0, -1], [5, 4, 7, 6, 0, 0, 1], [4, 0, 3, 7, -1, 0, 0], [1, 5, 6, 2, 1, 0, 0], [3, 2, 6, 7, 0, 1, 0], [4, 5, 1, 0, 0, -1, 0]];
  const p = new Vector3(), n = new Vector3(), e1 = new Vector3(), e2 = new Vector3();
  for (const f of faces) {
    const b = w.count;
    n.set(f[4], f[5], f[6]);
    const c0 = corners[f[0]], c1 = corners[f[1]], c2 = corners[f[2]];
    e1.set(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
    e2.set(c2[0] - c0[0], c2[1] - c0[1], c2[2] - c0[2]);
    const ccw = e1.cross(e2).dot(n) > 0;
    for (let k = 0; k < 4; k++) { const c = corners[f[k]]; p.set(c[0], c[1], c[2]); w.vert(p, n, k & 1, k >> 1, PART.LIGAMENT, 0.5, 0, L); }
    if (ccw) { w.tri(b, b + 1, b + 2); w.tri(b, b + 2, b + 3); } else { w.tri(b, b + 2, b + 1); w.tri(b, b + 3, b + 2); }
  }
}

/**
 * Barnacles (Amphibalanus): little volcano cones of six wall plates with the opercular slit at the top, cemented on
 * the lid and on the flanks of the lower valve. Each has a slot number so an instance can show only some of them.
 */
function writeBarnacles(w: MeshWriter, shape: OysterShape, d: GeometryDetail, which: 'lower' | 'upper' | 'both'): void {
  const g = shape.g;
  if (d.barnacles === 'none' || g.age === 'spat' || g.age === 'juvenile') return;
  const slots = d.barnacles === 'full' ? 7 : 5;
  const seg = d.barnacles === 'full' ? 14 : 6;
  const L = shape.L;
  const p = new Vector3(), n = new Vector3(), t1 = new Vector3(), t2 = new Vector3(), q = new Vector3(), nn = new Vector3();
  for (let i = 0; i < slots; i++) {
    const h = hashInts(g.seeds.attachmentSeed, i, 0xba);
    const upper = h % 4 !== 0 && g.dead !== 2;
    if ((which === 'lower' && upper) || (which === 'upper' && !upper)) continue;
    const u = upper ? 0.18 + 0.64 * (((h >>> 3) % 1000) / 1000) : (((h >>> 3) % 2) ? 0.16 : 0.62) + 0.22 * (((h >>> 13) % 1000) / 1000);
    const s = upper ? 0.32 + 0.58 * (((h >>> 9) % 1000) / 1000) : 0.7 + 0.24 * (((h >>> 19) % 1000) / 1000);
    if (s > shape.smax(u, upper) - 0.04) continue;
    shape.extPoint(u, s, upper, p, n);
    // sizes: a few millimetres to a centimetre, never bigger than a fifth of the shell
    const rb = Math.max(0.0012, Math.min(L * 0.07, (0.0015 + 0.004 * Math.pow(((h >>> 21) % 1000) / 1000, 1.5)) * (L > 0.08 ? 1.15 : 0.85)));
    const ht = rb * (0.6 + 0.45 * (((h >>> 7) % 1000) / 1000));
    t1.set(1, 0, 0);
    if (Math.abs(n.x) > 0.9) t1.set(0, 0, 1);
    t2.crossVectors(n, t1).normalize();
    t1.crossVectors(t2, n).normalize();
    // rings: (radius factor, height factor, uv.y)
    const rings = d.barnacles === 'full'
      ? [[1.05, -0.25, 0], [1, 0, 0.1], [0.78, 0.55, 0.45], [0.42, 1, 0.75], [0.3, 0.96, 0.85], [0.24, 0.8, 0.92], [0.0, 0.74, 1]]
      : [[1.05, -0.25, 0], [0.5, 1, 0.75], [0.0, 0.75, 1]];
    const base = w.count;
    const follow = upper ? 1 : 0;
    for (let r = 0; r < rings.length; r++) {
      const [rf, hf, vv] = rings[r];
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        // six plates: the wall bulges between the sutures
        const plate = 1 + (d.barnacles === 'full' ? 0.07 * Math.cos(a * 6 + (h % 7)) + 0.03 * Math.cos(a * 18) : 0);
        const rr = rb * rf * plate;
        q.copy(p).addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr).addScaledVector(n, ht * hf);
        // slope normal of the cone wall
        nn.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).multiplyScalar(r < 4 ? 0.9 : -0.3).addScaledVector(n, 0.55).normalize();
        if (r === rings.length - 1) nn.copy(n);
        w.vert(q, nn, k / seg, vv, PART.BARNACLE, follow, i + 1, L);
      }
    }
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < seg; k++) {
      const a = base + r * (seg + 1) + k, b = a + 1, c = a + seg + 1, e = c + 1;
      w.tri(a, b, c); w.tri(b, e, c);
    }
  }
}

export interface OysterParts {
  lower: BufferGeometry;
  upper: BufferGeometry;
  mantle: BufferGeometry | null;
  hinge: BufferGeometry;
}

/** The four parts of one oyster at a level of detail (separate geometries, for OysterIndividual). */
export function buildOysterParts(shape: OysterShape, d: GeometryDetail, atlas: AtlasLayout): OysterParts {
  const dead = shape.g.dead;
  const wl = new MeshWriter();
  writeValve(wl, shape, false, d, atlas);
  writeBarnacles(wl, shape, d, 'lower');
  const wu = new MeshWriter();
  if (dead !== 2) { writeValve(wu, shape, true, d, atlas); writeBarnacles(wu, shape, d, 'upper'); }
  let mantle: BufferGeometry | null = null;
  if (!dead && d.mantle !== 'none') {
    const wm = new MeshWriter();
    writeSoft(wm, shape, d);
    mantle = wm.geometry();
  }
  const wh = new MeshWriter();
  writeLigament(wh, shape);
  return { lower: wl.geometry(), upper: wu.geometry(), mantle, hinge: wh.geometry() };
}

/** All parts of one oyster in one geometry (the instanced reef draws one oyster per instance in one call). */
export function buildOysterMerged(shape: OysterShape, d: GeometryDetail, atlas: AtlasLayout): BufferGeometry {
  const w = new MeshWriter();
  writeValve(w, shape, false, d, atlas);
  if (shape.g.dead !== 2) writeValve(w, shape, true, d, atlas);
  writeBarnacles(w, shape, d, 'both');
  if (!shape.g.dead && d.mantle !== 'none') writeSoft(w, shape, d);
  writeLigament(w, shape);
  return w.geometry();
}

/** Total triangle count of a geometry (tests, stats). */
export function triangleCount(g: BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}
