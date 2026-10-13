import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Matrix4, Uint16BufferAttribute, Vector3 } from 'three';

/**
 * What the shell's shader knows about each vertex of the ガザミ (the `aPart` attribute): where on the animal it is,
 * so that one material can colour and finish the whole exoskeleton.
 */
export const PART = {
  DORSUM: 0,      // the carapace's dorsal face and its teeth
  UNDER: 1,       // the carapace's underside, the body wall, the front face
  STERNUM: 2,     // sternum, abdomen, mouthparts
  CHELA_ARM: 3,   // cheliped coxa … carpus
  PALM: 4,        // cheliped propodus (palm and fixed finger)
  FINGER: 5,      // the dactylus of the cheliped
  LEG: 6,         // walking legs (coxa … propodus)
  DACTYL: 7,      // walking legs' dactyli
  PADDLE: 8,      // swimming legs (P5), merus … dactylus
  MEMBRANE: 9,    // articular membranes at the joints
  CORNEA: 10,
  STALK: 11,      // eyestalks, antennae, antennules
  SPINE: 12,      // spines on the limbs
  TOOTH: 13,      // the teeth of the fingers' cutting edges
  PADDLE_PR: 14,  // the swimming leg's flat propodus
  PADDLE_DA: 15,  // the swimming leg's dactylus, the paddle proper
} as const;

/**
 * A skinned triangle soup with the shell's extra attributes, built in millimetres in the model's frame (the bind
 * pose) and handed over in metres. Each vertex follows up to two bones. Normals are summed from the faces that share
 * a vertex (so separate pieces keep their creases and a continuous grid stays smooth), unless set by hand.
 */
export class GeoBuilder {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly si: number[] = [];
  readonly sw: number[] = [];
  readonly part: number[] = [];
  readonly seg: number[] = [];
  readonly aux: number[] = [];
  /** an isotropic surface coordinate in mm (limbs: along and round the article; elsewhere the rest position's x, z) */
  readonly mm: number[] = [];
  readonly idx: number[] = [];
  private readonly fixedN: boolean[] = [];
  private readonly twins: number[] = [];

  get count(): number { return this.p.length / 3; }

  /**
   * One vertex: position (mm), bones b0 (weight w) and b1 (weight 1 − w), the part, its own (u, v) on the part, and
   * aux (x: cavity 0 open … 1 deep crevice, y: a flag — 1 male abdomen, 2 female abdomen, 4 … 5 a margin tooth, by
   * how near its tip).
   */
  v(x: number, y: number, z: number, b0: number, w: number, b1: number, part: number, u: number, vv: number, cav = 0, flag = 0): number {
    this.p.push(x, y, z);
    this.n.push(0, 0, 0);
    this.si.push(b0, b1, 0, 0);
    this.sw.push(w, 1 - w, 0, 0);
    this.part.push(part);
    this.seg.push(u, vv);
    this.aux.push(cav, flag);
    this.mm.push(x, z);
    this.fixedN.push(false);
    return this.count - 1;
  }

  /** the vertex's surface coordinate in mm (see `mm`) */
  setMm(i: number, u: number, v: number): void { this.mm[i * 2] = u; this.mm[i * 2 + 1] = v; }

  /** a vertex with its normal given (hair cards, caps) */
  vn(x: number, y: number, z: number, nx: number, ny: number, nz: number, b0: number, w: number, b1: number, part: number, u: number, vv: number, cav = 0, flag = 0): number {
    const i = this.v(x, y, z, b0, w, b1, part, u, vv, cav, flag);
    this.n[i * 3] = nx; this.n[i * 3 + 1] = ny; this.n[i * 3 + 2] = nz;
    this.fixedN[i] = true;
    return i;
  }

  /** two vertices at one place, apart only in their surface coordinates (a ring's seam): one normal for both */
  twin(a: number, b: number): void {
    this.twins.push(a, b);
  }

  tri(a: number, b: number, c: number): void {
    if (a === b || b === c || a === c) return;
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** transform the vertices from `start` on by `m` (positions and set normals) */
  transform(start: number, m: Matrix4): void {
    const v = new Vector3(), nm = new Matrix4().copy(m).invert().transpose();
    for (let i = start; i < this.count; i++) {
      v.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]).applyMatrix4(m);
      this.p[i * 3] = v.x; this.p[i * 3 + 1] = v.y; this.p[i * 3 + 2] = v.z;
      if (this.fixedN[i]) {
        v.set(this.n[i * 3], this.n[i * 3 + 1], this.n[i * 3 + 2]).applyMatrix4(nm).normalize();
        this.n[i * 3] = v.x; this.n[i * 3 + 1] = v.y; this.n[i * 3 + 2] = v.z;
      }
    }
  }

  /** mirror the vertices from `start` and the triangles from `triStart` in z (the right legs' frames) */
  mirrorZ(start: number, triStart: number): void {
    for (let i = start; i < this.count; i++) { this.p[i * 3 + 2] *= -1; this.n[i * 3 + 2] *= -1; }
    for (let t = triStart; t < this.idx.length; t += 3) { const k = this.idx[t + 1]; this.idx[t + 1] = this.idx[t + 2]; this.idx[t + 2] = k; }
  }

  /** the face normals summed into the vertices that are not set by hand (area weighted) */
  computeNormals(): void {
    const p = this.p, n = this.n;
    for (let i = 0; i < this.count; i++) if (!this.fixedN[i]) { n[i * 3] = 0; n[i * 3 + 1] = 0; n[i * 3 + 2] = 0; }
    for (let t = 0; t < this.idx.length; t += 3) {
      const a = this.idx[t] * 3, b = this.idx[t + 1] * 3, c = this.idx[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      for (const k of [a, b, c]) {
        if (this.fixedN[k / 3]) continue;
        n[k] += fx; n[k + 1] += fy; n[k + 2] += fz;
      }
    }
    for (let t = 0; t < this.twins.length; t += 2) {
      const a = this.twins[t] * 3, b = this.twins[t + 1] * 3;
      if (this.fixedN[a / 3] || this.fixedN[b / 3]) continue;
      for (let k = 0; k < 3; k++) { const s = n[a + k] + n[b + k]; n[a + k] = s; n[b + k] = s; }
    }
    for (let i = 0; i < this.count; i++) {
      const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
      if (l > 1e-12) { n[i * 3] /= l; n[i * 3 + 1] /= l; n[i * 3 + 2] /= l; } else { n[i * 3 + 1] = 1; }
    }
  }

  /** the geometry in metres (normals summed first), with the shell's attributes */
  build(scale = 0.001): BufferGeometry {
    this.computeNormals();
    const g = new BufferGeometry();
    const pos = new Float32Array(this.p.length);
    for (let i = 0; i < this.p.length; i++) pos[i] = this.p[i] * scale;
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.n, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    g.setAttribute('aPart', new Float32BufferAttribute(this.part, 1));
    g.setAttribute('aSeg', new Float32BufferAttribute(this.seg, 2));
    g.setAttribute('aAux', new Float32BufferAttribute(this.aux, 2));
    g.setAttribute('aMm', new Float32BufferAttribute(this.mm, 2));
    g.setIndex(this.count > 65535 ? new BufferAttribute(new Uint32Array(this.idx), 1) : new BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Catmull-Rom through knots (x, y…) sampled at x (clamped, uniform-ish knots) */
export function knotLerp<T extends { t: number }>(knots: T[], t: number, get: (k: T) => number): number {
  if (t <= knots[0].t) return get(knots[0]);
  const last = knots[knots.length - 1];
  if (t >= last.t) return get(last);
  let i = 0;
  while (i < knots.length - 2 && knots[i + 1].t < t) i++;
  const k0 = knots[Math.max(0, i - 1)], k1 = knots[i], k2 = knots[i + 1], k3 = knots[Math.min(knots.length - 1, i + 2)];
  const u = (t - k1.t) / Math.max(1e-9, k2.t - k1.t);
  const p0 = get(k0), p1 = get(k1), p2 = get(k2), p3 = get(k3);
  // a monotone-ish Catmull-Rom (tangents scaled by the knots' spacing so that uneven knots do not overshoot)
  const d1 = k2.t - k1.t;
  const m1 = ((p2 - p0) / Math.max(1e-9, k2.t - k0.t)) * d1;
  const m2 = ((p3 - p1) / Math.max(1e-9, k3.t - k1.t)) * d1;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
}

export const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** a small deterministic noise in 2D (value noise), for the shell's side-specific unevenness */
export function noise2(x: number, y: number, seed: number): number {
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return (h(i, j) * (1 - ux) + h(i + 1, j) * ux) * (1 - uy) + (h(i, j + 1) * (1 - ux) + h(i + 1, j + 1) * ux) * uy;
}
