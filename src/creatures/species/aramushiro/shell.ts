import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import {
  MODEL_SH, PSI_CANAL, PSI_COVER, PSI_PERIPHERY, SECTION_LEN, SHELL, THETA_APEX, growth, radialAt, sectionAt, shellPoint,
  tangentAt, thetaEnd,
} from './anatomy';

/**
 * The shell's surface: a logarithmic helicospiral (anatomy.ts) carrying the sculpture of the photographs — white axial
 * ribs cut by spiral grooves into rows of granules, the row under the suture the strongest, the granules giving way
 * to plain spiral cords on the base; a smooth protoconch; a thick varix behind the outer lip and small teeth (lirae)
 * inside it; a glazed parietal callus with its small tooth at the top of the inner lip; the short canal.
 *
 * Three tiers share the same surface functions. LOD0 displaces the surface by the whole sculpture (the granules break
 * the silhouette as they do in the photographs); LOD1 keeps only the large forms (varix, callus) in the geometry and
 * the fragment shader draws the sculpture as relief from the same function (materials.ts); LOD2 is a smooth spindle
 * with a stand-in for the foot under it, one draw.
 *
 * Attribute aShell: x whorls back from the aperture (w), y arc length along the section from the suture (SH, a),
 * z the callus weight, w the part (0 outer surface, 1 inside of the aperture, 2 the lip's edge, 3 the far tier's foot;
 * +8 where the geometry does not carry the fine sculpture).
 */

export type Lod = 0 | 1 | 2;

const TAU = Math.PI * 2;
const A_COVER = PSI_COVER * SECTION_LEN;
const A_CANAL = PSI_CANAL * SECTION_LEN;
const A_PERI = PSI_PERIPHERY * SECTION_LEN;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const bump = (x: number, c: number, w: number): number => Math.exp(-(((x - c) / w) ** 2));

/** whorls of teleoconch sculpture: 1 on the adult whorls, 0 on the smooth protoconch */
export function teleoconch(w: number): number {
  return smooth(SHELL.whorls - SHELL.protoconch + 0.05, SHELL.whorls - SHELL.protoconch - 0.4, w);
}

/** the callus: the glaze over the parietal wall and the columella, spreading a little onto the venter */
export function callusAt(w: number, a: number): number {
  const x = TAU * (1 - w);
  const along = smooth(-1.1, -0.55, x) * (1 - smooth(0.85, 1.35, x));
  const across = smooth(A_COVER - 0.04, A_COVER + 0.02, a);
  // the columella and the canal's inner side, right up to the lip
  const col = w < 0.2 ? smooth(A_CANAL - 0.02, A_CANAL + 0.06, a) * (1 - smooth(0.02, 0.2, w)) : 0;
  return Math.max(along * across, col);
}

/** The relief of the shell at (w, a) in SH at the aperture's scale: the fine sculpture and the large forms. */
export function sculpt(w: number, a: number, out = { fine: 0, coarse: 0 }): { fine: number; coarse: number } {
  const S = SHELL;
  const teleo = teleoconch(w);
  // the sculpture runs out into the varix just behind the lip
  const lip = smooth(0.012, 0.075, w);
  // axial ribs, a little curved (they follow the growth lines of the lip), each slightly irregular
  const rp = w * S.ribs + 0.9 * a + 0.05 * Math.sin(w * 7.3);
  const rib = Math.pow(0.5 + 0.5 * Math.cos(TAU * rp), 1.15);
  // spiral cords, the first one under the suture
  const cp = (a - S.cord * 0.62) / S.cord;
  const cord = a > 0.012 && a < A_CANAL + 0.01 ? Math.pow(0.5 + 0.5 * Math.cos(TAU * cp), 1.7) : 0;
  const first = cp < 0.5 ? 1.15 : 1;
  // granules down to a little below the periphery; plain cords on the base
  const beads = 1 - smooth(A_PERI + 0.04, A_PERI + 0.2, a);
  let fine = S.bead * rib * cord * beads * first + S.cordH * cord * (0.35 + 0.65 * (1 - beads)) + S.ribH * rib * beads * 0.45;
  fine *= teleo * lip;
  const cal = callusAt(w, a);
  fine *= 1 - cal;
  // the large forms: the suture's groove, the varix behind the lip, the callus' glaze, the parietal tooth
  let coarse = -0.01 * bump(a, 0, 0.018) * teleo;
  const outer = smooth(0.0, 0.05, a) * (1 - smooth(A_CANAL - 0.1, A_CANAL - 0.01, a));
  coarse += S.varixH * bump(w, S.varixAt, 0.028) * outer + 0.012 * bump(w, 0.0, 0.02) * outer;
  coarse += 0.008 * cal;
  coarse += 0.014 * bump(a, A_COVER - 0.035, 0.016) * bump(TAU * (1 - w), -0.1, 0.12);
  out.fine = fine;
  out.coarse = coarse;
  return out;
}

/** the small teeth inside the outer lip (inner surface, SH) */
function lirae(w: number, a: number): number {
  if (w > 0.12 || a < 0.05 || a > A_CANAL - 0.08) return 0;
  const n = 0.5 + 0.5 * Math.cos(TAU * (a - 0.07) / 0.072);
  return 0.007 * Math.pow(n, 3) * (1 - smooth(0.02, 0.1, w)) * smooth(0.05, 0.1, a);
}

/** shell thickness (SH): thin on the spire, thick at the lip and its varix */
function thickness(w: number, a: number): number {
  const outer = smooth(0.0, 0.05, a) * (1 - smooth(A_CANAL - 0.1, A_CANAL, a));
  return SHELL.thick * (0.8 + 0.2 * smooth(0.6, 0, w)) + (SHELL.lipThick - SHELL.thick) * smooth(0.12, 0.0, w) * outer;
}

// ------------------------------------------------------------------ evaluation

const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3(), tmpD = new Vector3(), tmpN = new Vector3();
const sc = { fine: 0, coarse: 0 };

/** outward normal of the unsculptured surface */
function baseNormal(theta: number, psi: number, out: Vector3): Vector3 {
  const e = 1e-4;
  shellPoint(theta + e, psi, tmpA).sub(shellPoint(theta - e, psi, tmpB));
  shellPoint(theta, psi + e, tmpC).sub(shellPoint(theta, psi - e, tmpD));
  out.crossVectors(tmpA, tmpC);
  // the cross product points outward when ψ runs outward round the flank (checked against the radial)
  if (out.lengthSq() < 1e-30) return out.copy(radialAt(theta));
  out.normalize();
  return out;
}

/** a point of the outer surface (SH), with the sculpture of the tier */
export function outerPoint(theta: number, psi: number, fine: boolean, out = new Vector3()): Vector3 {
  shellPoint(theta, psi, out);
  const w = -theta / TAU, a = (((psi % 1) + 1) % 1) * SECTION_LEN;
  sculpt(w, a, sc);
  const h = (sc.coarse + (fine ? sc.fine : 0)) * growth(theta);
  baseNormal(theta, psi, tmpN);
  return out.addScaledVector(tmpN, h);
}

/** a point of the inside of the shell (SH) */
function innerPoint(theta: number, psi: number, out = new Vector3()): Vector3 {
  shellPoint(theta, psi, out);
  const w = -theta / TAU, a = (((psi % 1) + 1) % 1) * SECTION_LEN;
  const t = thickness(w, a) - lirae(w, a);
  baseNormal(theta, psi, tmpN);
  return out.addScaledVector(tmpN, -t * growth(theta));
}

// ------------------------------------------------------------------ sampling

interface Tier {
  /** rows per whorl on the body whorl, the near spire, the far spire, the tip */
  rows: [number, number, number, number];
  /** columns round the exposed arc and the inner wall */
  cols: [number, number];
  inside: boolean;
  fine: boolean;
}
const TIERS: Record<Lod, Tier> = {
  0: { rows: [100, 76, 54, 34], cols: [70, 18], inside: true, fine: true },
  1: { rows: [30, 20, 13, 8], cols: [22, 8], inside: true, fine: false },
  2: { rows: [11, 7, 5, 4], cols: [8, 4], inside: false, fine: false },
};

/** the grid's columns (ψ): dense over the exposed arc (suture → canal), sparse up the inner wall */
function columns(t: Tier): number[] {
  const [ne, ni] = t.cols;
  const end = PSI_CANAL + 0.02;
  const out: number[] = [];
  for (let j = 0; j < ne; j++) out.push((j / ne) * end);
  for (let j = 0; j < ni; j++) out.push(end + (j / ni) * (1 - end));
  return out;
}

/** the rows (θ) from the aperture back to the apex, closer together where the whorls are large */
function rows(t: Tier, from: number, to: number): number[] {
  const out: number[] = [];
  let th = from;
  while (th > to) {
    out.push(th);
    const w = -th / TAU;
    const n = w < 1.3 ? t.rows[0] : w < 3 ? t.rows[1] : w < 5 ? t.rows[2] : t.rows[3];
    th -= TAU / n;
  }
  out.push(to);
  return out;
}

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  att: number[] = [];
  idx: number[] = [];
  add(p: Vector3, n: Vector3, w: number, a: number, cal: number, part: number): number {
    const i = this.pos.length / 3;
    this.pos.push(p.x * MODEL_SH, p.y * MODEL_SH, p.z * MODEL_SH);
    this.nrm.push(n.x, n.y, n.z);
    this.att.push(w, a, cal, part);
    return i;
  }
  /** quads of a grid (r rows × c cols, row-major from `base`), optionally closed round the columns */
  grid(base: number, r: number, c: number, closed: boolean, flip: boolean): void {
    const cc = closed ? c : c - 1;
    for (let i = 0; i < r - 1; i++) for (let j = 0; j < cc; j++) {
      const a = base + i * c + j, b = base + i * c + ((j + 1) % c), d = a + c, e = b + c;
      if (flip) this.idx.push(a, d, b, b, d, e);
      else this.idx.push(a, b, d, b, e, d);
    }
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aShell', new Float32BufferAttribute(this.att, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const P = new Vector3(), Q1 = new Vector3(), Q2 = new Vector3(), Q3 = new Vector3(), Q4 = new Vector3(), N = new Vector3();

/** normal of a surface function by central differences in (θ, ψ) */
function normalOf(f: (th: number, ps: number, o: Vector3) => Vector3, th: number, ps: number, out: Vector3, sign: number): Vector3 {
  const e = 2e-4;
  f(th + e, ps, Q1).sub(f(th - e, ps, Q2));
  f(th, ps + e, Q3).sub(f(th, ps - e, Q4));
  out.crossVectors(Q1, Q3);
  if (out.lengthSq() < 1e-30) return baseNormal(th, ps, out).multiplyScalar(sign);
  return out.normalize().multiplyScalar(sign);
}

/** the θ of row value `t0` (0 at the lip) at column ψ: the lip's termination varies round the aperture */
const thetaAt = (t0: number, psi: number): number => {
  const e = thetaEnd(psi);
  return e + t0 * (1 - e / THETA_APEX);
};

function buildShell(lod: Lod): BufferGeometry {
  const t = TIERS[lod];
  const b = new Builder();
  const fine = t.fine;
  const flag = fine ? 0 : 8;
  const outer = (th: number, ps: number, o: Vector3) => outerPoint(th, ps, fine, o);
  const cols = columns(t);
  // the body whorl and a quarter turn more: the whole section
  const SEAM = -1.25 * TAU;
  const rA = rows(t, 0, SEAM);
  let base = b.pos.length / 3;
  for (const r of rA) for (const ps of cols) {
    const th = thetaAt(r, ps);
    outer(th, ps, P);
    normalOf(outer, th, ps, N, 1);
    const w = -th / TAU, a = ps * SECTION_LEN;
    b.add(P, N, w, a, callusAt(w, a), flag);
  }
  b.grid(base, rA.length, cols.length, true, false);
  // the spire: only the band each whorl shows between its sutures (its edges tuck into the neighbouring whorls)
  const lo = 1 - 0.035, hi = PSI_COVER + 0.05;
  const band = cols.filter((c) => c <= hi).map((c) => c);
  band.unshift(lo - 1);
  const rB = rows(t, SEAM, THETA_APEX).map((x) => x);
  base = b.pos.length / 3;
  for (const r of rB) for (const ps of band) {
    const th = thetaAt(r, ps);
    outer(th, ps, P);
    normalOf(outer, th, ps, N, 1);
    const w = -th / TAU, a = ((ps + 1) % 1) * SECTION_LEN;
    b.add(P, N, w, a, callusAt(w, a), flag);
  }
  b.grid(base, rB.length, band.length, false, false);
  if (t.inside) {
    // the inside of the last whorl, seen through the aperture
    const rI = rows(t, 0, -0.95 * TAU);
    base = b.pos.length / 3;
    for (const r of rI) for (const ps of cols) {
      const th = thetaAt(r, ps);
      innerPoint(th, ps, P);
      normalOf(innerPoint, th, ps, N, -1);
      b.add(P, N, -th / TAU, ps * SECTION_LEN, 0, 1 + flag);
    }
    b.grid(base, rI.length, cols.length, true, true);
    // the lip's edge: outer to inner over a rounded profile
    const steps = lod === 0 ? 5 : 3;
    base = b.pos.length / 3;
    const tg = new Vector3(), rd = new Vector3();
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      for (const ps of cols) {
        const th = thetaEnd(ps);
        outerPoint(th, ps, fine, Q1);
        innerPoint(th, ps, Q2);
        tangentAt(th, tg);
        P.lerpVectors(Q1, Q2, u).addScaledVector(tg, Math.sin(Math.PI * u) * Q1.distanceTo(Q2) * 0.45);
        // the edge's normal: from outward (u = 0) through forward to inward (u = 1)
        baseNormal(th, ps, rd);
        N.copy(rd).multiplyScalar(Math.cos(Math.PI * u)).addScaledVector(tg, Math.sin(Math.PI * u)).normalize();
        const w = -th / TAU, a = ps * SECTION_LEN;
        b.add(P, N, w, a, callusAt(w, a), 2 + flag);
      }
    }
    b.grid(base, steps + 1, cols.length, true, true);
  }
  return b.build();
}

const cache = new Map<Lod, BufferGeometry>();

/** the shell of a tier, in the shell frame (metres at the model size); shared by every individual */
export function shellGeometry(lod: Lod): BufferGeometry {
  let g = cache.get(lod);
  if (!g) {
    g = buildShell(lod);
    g.name = `AramushiroShell${lod}`;
    cache.set(lod, g);
  }
  return g;
}

/** the shell's height as built (m, apex to the canal's tip) */
export function shellHeight(): number {
  const g = shellGeometry(2);
  if (!g.boundingBox) g.computeBoundingBox();
  return g.boundingBox!.max.y - g.boundingBox!.min.y;
}

/** triangle count of a tier's shell */
export function shellTriangles(lod: Lod): number {
  return (shellGeometry(lod).index?.count ?? 0) / 3;
}

// ------------------------------------------------------------------ landmarks for the soft parts

/** the aperture's outline (shell frame, metres): `n` points round the lip */
export function apertureOutline(n = 24): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const ps = (i / n) * (PSI_CANAL + 0.02);
    out.push(shellPoint(thetaEnd(ps), ps, new Vector3()).multiplyScalar(MODEL_SH));
  }
  return out;
}

/** landmarks in the shell frame (metres): the aperture's centre, the canal's mouth and its direction, the axis */
export const LANDMARKS = (() => {
  const c = new Vector3();
  const pts = apertureOutline(48);
  for (const p of pts) c.add(p);
  c.multiplyScalar(1 / pts.length);
  const canal = shellPoint(thetaEnd(PSI_CANAL), PSI_CANAL - 0.01, new Vector3()).multiplyScalar(MODEL_SH);
  // the canal points along the lip's tangent and down the axis
  const canalDir = tangentAt(0, new Vector3()).multiplyScalar(0.55).add(new Vector3(0, -1, 0)).normalize();
  const apex = new Vector3();
  return { aperture: c, canal, canalDir, apex };
})();

/**
 * Points of the shell (shell frame, metres) to find how it rests on the ground: the ends and the bulges of the last
 * two whorls and the spire.
 */
export const HULL: readonly Vector3[] = (() => {
  const out: Vector3[] = [];
  const p = new Vector3();
  for (let th = 0; th > THETA_APEX + TAU * 0.5; th -= TAU / 24) {
    for (let k = 0; k < 10; k++) {
      const ps = (k / 10) * (PSI_CANAL + 0.02);
      shellPoint(th, ps, p);
      out.push(p.clone().multiplyScalar(MODEL_SH));
    }
  }
  return out;
})();

/** the lowest point (y) of the shell's hull under a transform */
export function lowestY(m: Matrix4): number {
  let y = Infinity;
  const e = m.elements;
  for (const p of HULL) {
    const py = e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13];
    if (py < y) y = py;
  }
  return y;
}

/** for tests: the attribute arrays */
export function shellAttr(lod: Lod, name: string): BufferAttribute {
  return shellGeometry(lod).getAttribute(name) as BufferAttribute;
}
