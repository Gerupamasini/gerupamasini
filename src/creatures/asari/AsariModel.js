import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Group, Mesh, PlaneGeometry, Quaternion, SphereGeometry, CapsuleGeometry, Vector3 } from 'three';
import { makeDecalMaterial, makeShellInnerMaterial, makeShellOuterMaterial, makeSoftMaterial } from './AsariMaterial.js';

/**
 * アサリ Ruditapes philippinarum — procedural model in shell-length units (shell length = 1).
 * Frame: +x anterior, +y dorsal, +z left valve; the commissure is the z = 0 plane.
 *
 * Lateral outline: MEASURED, not drawn. Three valves photographed flat (exterior up, i.e. a true lateral
 * projection) in the reference sets were segmented, aligned on their anteroposterior axis (anterior end
 * identified by the umbo / ligament: the ligament lies posterior to the umbones), normalised to L = 1 and
 * averaged. Result (「長楕円形」): H/L = 0.72; umbo 0.37 L from the anterior end and the highest point; from it the
 * dorsal margin falls in a long, gentle, nearly straight slope to a broad, bluntly rounded posterior end, while
 * in front of it the margin drops steeply with a slight lunular concavity to a narrower rounded anterior end
 * whose tip lies at mid-height; the ventral margin is a long even arc, deepest just behind the middle.
 *
 * Inflation: width / length ≈ 0.52 (「厚く、膨らみが強い」). The valve is a dome centred in the middle of the
 * valve, not at the umbo: fullest a little dorsal of centre, so the umbo reads as a low beak on the dorsal
 * edge. The valves meet at an acute angle along the ventral margin and at both ends (lens-shaped from below
 * and from above), while the umbonal region stays full up to the hinge.
 *
 * Geometry is built once per LOD and shared by every clam; the right valve is the left one mirrored.
 */

// valve margin, starting at the umbo and running anterior → ventral → posterior → back along the hinge
// (measured from photographs, see above)
const OUTLINE = [
  [0.133, 0.361], [0.233, 0.331], [0.299, 0.249], [0.370, 0.179], [0.446, 0.110],
  [0.494, 0.016], [0.492, -0.087], [0.443, -0.179], [0.363, -0.253], [0.275, -0.305],
  [0.174, -0.339], [0.070, -0.356], [-0.031, -0.361], [-0.134, -0.352], [-0.236, -0.326],
  [-0.337, -0.284], [-0.419, -0.224], [-0.480, -0.138], [-0.500, -0.036], [-0.486, 0.068],
  [-0.440, 0.160], [-0.370, 0.240], [-0.279, 0.279], [-0.175, 0.316], [-0.078, 0.342],
  [0.026, 0.354],
];
/** growth lines start at the beak tip, which lies on the dorsal outline next to the other valve's beak */
const GROWTH_ORIGIN = new Vector3(0.128, 0.352, 0);
/** centre of the inflation dome: the fullest point of the valve */
const DOME_CENTRE = new Vector3(0.05, 0.06, 0);
const HALF_WIDTH = 0.26;
/** major growth checks modelled in LOD0 geometry (the shader draws its own set close to these) */
const GEOM_CHECKS = [0.54, 0.68, 0.82];

export const ANATOMY = {
  hingePoint: new Vector3(0.04, 0.352, 0),
  hingeAxis: new Vector3(-0.41, -0.082, 0).normalize(),
  /** full gape (both valves) at gape = 1, radians: a relaxed clam in water gapes ~4 mm ventrally (35 mm shell) */
  maxGape: 0.22,
  /** the mantle margins follow the valves only partly, so they close the gape between them */
  mantleFollow: 0.2,
  footRoot: new Vector3(0.2, -0.13, 0),
  footDir: Math.atan2(-0.8, 0.6),
  footLength: 0.72,
  siphonIn: { root: new Vector3(-0.38, -0.045, 0), radius: 0.068 },
  siphonOut: { root: new Vector3(-0.38, 0.055, 0), radius: 0.052 },
  siphonDir: Math.PI - 0.12,
  /** sideways parting of each siphon tip from its partner at t = 1 (local y, shell lengths) */
  siphonFork: 0.075,
  /** posterior margin point that must stay below the sand when buried */
  posteriorTip: new Vector3(-0.5, 0.0, 0),
};

const LODS = [
  { nu: 160, ns: 64, checks: true, inner: true },
  { nu: 64, ns: 20, checks: false, inner: true },
  { nu: 26, ns: 7, checks: false, inner: false },
];

let outlineCache = null;
function outline(n) {
  outlineCache ??= new CatmullRomCurve3(OUTLINE.map(([x, y]) => new Vector3(x, y, 0)), true, 'centripetal');
  return outlineCache.getSpacedPoints(n).slice(0, n);
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** distance from DOME_CENTRE to the margin, tabulated by direction */
let radiusTable = null;
const RT = 720;
function marginRadius(theta) {
  if (!radiusTable) {
    const M = outline(720);
    const C = DOME_CENTRE;
    radiusTable = new Float32Array(RT);
    for (let i = 0; i < RT; i++) {
      const a = (i / RT) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let best = Infinity;
      for (let k = 0; k < M.length; k++) {
        const p = M[k], q = M[(k + 1) % M.length];
        const ex = q.x - p.x, ey = q.y - p.y;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const wx = p.x - C.x, wy = p.y - C.y;
        const t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
        if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
      }
      radiusTable[i] = best;
    }
  }
  const f = ((theta / (Math.PI * 2)) % 1 + 1) % 1 * RT;
  const i0 = Math.floor(f) % RT, i1 = (i0 + 1) % RT, w = f - Math.floor(f);
  return radiusTable[i0] * (1 - w) + radiusTable[i1] * w;
}

/**
 * Outer surface height of the valve at a point of the commissure plane: a dome over the outline centred on
 * DOME_CENTRE. Along the ventral margin and at both ends the profile is ~linear at the edge (the valves meet at
 * an acute angle); toward the hinge it stays full and then turns down steeply (inflated umbones).
 */
function valveZ(x, y) {
  const C = DOME_CENTRE;
  const dx = x - C.x, dy = y - C.y;
  const th = Math.atan2(dy, dx);
  const rho = Math.min(1, Math.hypot(dx, dy) / marginRadius(th));
  const dorsal = Math.max(0, Math.sin(th));
  const q = 0.95 - 0.38 * dorsal * dorsal;
  return HALF_WIDTH * Math.pow(Math.max(0, 1 - Math.pow(rho, 2.4)), q);
}

/** prosogyrate beaks: the oldest shell curls forward and slightly up over the hinge */
function beak(s) {
  const k = (1 - s) ** 3;
  return [0.02 * k, 0.006 * k];
}

/** One valve (left, z ≥ 0). Groups: 0 outer surface, 1 inner surface + rim. */
function buildValve(lod) {
  const { nu, ns, checks, inner } = LODS[lod];
  const M = outline(nu);
  const G = GROWTH_ORIGIN;
  const cols = nu + 1;
  const rows = ns + 1;
  const pos = [], uv = [], idx = [];
  const sAt = (i) => Math.pow(i / ns, 0.85);
  const groove = (s) => {
    let d = 0;
    if (checks) for (const c of GEOM_CHECKS) d += 0.0012 * Math.exp(-(((s - c) / 0.012) ** 2));
    return d;
  };
  // outer
  for (let i = 0; i < rows; i++) {
    const s = sAt(i);
    for (let j = 0; j < cols; j++) {
      const m = M[j % nu];
      const [bx, by] = beak(s);
      const x = G.x + s * (m.x - G.x) + bx, y = G.y + s * (m.y - G.y) + by;
      pos.push(x, y, Math.max(0, valveZ(x, y) - groove(s)));
      uv.push(j / nu, s);
    }
  }
  const quad = (base, flip) => {
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const a = base + i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  };
  quad(0, true);
  const outerCount = idx.length;
  if (inner) {
    const base = pos.length / 3;
    for (let i = 0; i < rows; i++) {
      const s = sAt(i);
      for (let j = 0; j < cols; j++) {
        const m = M[j % nu];
        const A = Math.max(0.05, Math.hypot(m.x - G.x, m.y - G.y));
        // shell thickness at the margin: ~0.022 L, never more than a few percent of the ray (lunule, hinge)
        const k = 1 - Math.min(0.022 / A, 0.05);
        const t = 0.03 * (1 - 0.5 * s);
        const [bx, by] = beak(s);
        const xo = G.x + s * (m.x - G.x) + bx, yo = G.y + s * (m.y - G.y) + by;
        const x = G.x + s * k * (m.x - G.x) + bx, y = G.y + s * k * (m.y - G.y) + by;
        pos.push(x, y, Math.max(0, Math.min(valveZ(xo, yo) * 0.8, valveZ(x, y) - t)));
        uv.push(j / nu, s);
      }
    }
    quad(base, false);
    // rim: outer margin row → inner margin row
    const o = (rows - 1) * cols, n = base + (rows - 1) * cols;
    for (let j = 0; j < cols - 1; j++) idx.push(o + j, o + j + 1, n + j, o + j + 1, n + j + 1, n + j);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, outerCount, 0);
  if (inner) g.addGroup(outerCount, idx.length - outerCount, 1);
  g.computeVertexNormals();
  weldSeam(g, rows, cols, inner ? 2 : 1);
  return g;
}

/** average normals across the u = 0 / u = 1 seam so the umbo has no crease */
function weldSeam(g, rows, cols, surfaces) {
  const n = g.attributes.normal;
  const v = new Vector3(), w = new Vector3();
  for (let sfc = 0; sfc < surfaces; sfc++) for (let i = 0; i < rows; i++) {
    const a = sfc * rows * cols + i * cols, b = a + cols - 1;
    v.fromBufferAttribute(n, a).add(w.fromBufferAttribute(n, b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
}

/**
 * Mantle margin of one side: a thick rolled lip running inside the ventral and posterior valve margin, cream
 * yellow with a brown pigmented outer face and a fringe of short papillae (reference: live clams relaxed in
 * water fill the gape with these lips). It is swept as a tube; `aDir` is the outward direction in the
 * commissure plane, along which the shader pushes the lip out past the shell edge as the clam relaxes and
 * pulls it in when the valves close. uv = (u along the margin, section angle / 2π, 0 = facing outward).
 * aTent: 0 lip, 0..1 along a papilla.
 */
function buildMantle(nu, papillae) {
  const M = outline(nu);
  const G = GROWTH_ORIGIN;
  const pos = [], uv = [], dir = [], tent = [], idx = [];
  const j0 = Math.round(nu * 0.25), j1 = Math.round(nu * 0.79);
  const nr = 10, rr = 0.021;
  const frame = (j) => {
    const m = M[j];
    const ox = m.x - G.x, oy = m.y - G.y, A = Math.hypot(ox, oy);
    // thinner toward both ends so the lip tucks away at the anterior end and over the siphons
    const taper = smooth(j0, j0 + nu * 0.06, j) * (1 - smooth(j1 - nu * 0.05, j1, j));
    return { cx: G.x + ox * (1 - 0.03 / A), cy: G.y + oy * (1 - 0.03 / A), nx: ox / A, ny: oy / A, r: rr * (0.35 + 0.65 * taper) };
  };
  for (let j = j0; j <= j1; j++) {
    const f = frame(j);
    for (let k = 0; k <= nr; k++) {
      const a = (k / nr) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      // flattened against the valve on the inside (-z side of the section rests on the shell)
      pos.push(f.cx + f.nx * c * f.r * 1.25, f.cy + f.ny * c * f.r * 1.25, f.r * 1.05 + sn * f.r);
      uv.push(j / nu, k / nr);
      dir.push(f.nx, f.ny, 0);
      tent.push(0);
    }
  }
  const w = nr + 1;
  for (let j = 0; j < j1 - j0; j++) for (let k = 0; k < nr; k++) {
    const a = j * w + k;
    idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
  }
  // papillae along the outer face of the lip, leaning out and toward the midline
  for (let q = 0; q < papillae; q++) {
    const jf = j0 + ((q + 0.5 + 0.35 * Math.sin(q * 2.71)) / papillae) * (j1 - j0);
    const f = frame(Math.round(jf));
    const len = 0.006 + 0.011 * (((q * 37) % 7) / 6) * (((q * 11) % 3) ? 1 : 0.5), wd = 0.0021;
    const bx = f.cx + f.nx * f.r * 1.15, by = f.cy + f.ny * f.r * 1.15, bz = f.r * (0.6 + 0.5 * ((q * 13) % 3) / 2);
    const ux = f.nx * 0.97, uy = f.ny * 0.97, uz = -0.25;
    const b0 = pos.length / 3;
    for (let i = 0; i <= 2; i++) {
      const t = i / 2, r = wd * (1 - 0.85 * t);
      for (let s4 = 0; s4 < 4; s4++) {
        const ang = (s4 / 4) * Math.PI * 2;
        // side vectors: along the margin (−ny, nx) and z
        const sx = -f.ny * Math.cos(ang) * r, sy = f.nx * Math.cos(ang) * r, sz = Math.sin(ang) * r;
        pos.push(bx + ux * len * t + sx, by + uy * len * t + sy, bz + uz * len * t + sz);
        uv.push(jf / nu, 0); dir.push(f.nx, f.ny, 0); tent.push(Math.max(0.1, t));
      }
    }
    for (let i = 0; i < 2; i++) for (let s4 = 0; s4 < 4; s4++) {
      const a0 = b0 + i * 4 + s4, a1 = b0 + i * 4 + ((s4 + 1) % 4);
      idx.push(a0, a1, a0 + 4, a1, a1 + 4, a0 + 4);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aDir', new Float32BufferAttribute(dir, 3));
  g.setAttribute('aTent', new Float32BufferAttribute(tent, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The foot: a large, laterally compressed, cream-white blade along +x over [0, 1] (length set in the shader).
 * Its dorsal edge (+y) is nearly straight, the ventral edge a convex keel that makes the hatchet "heel", and the
 * tip is broad and rounded (reference: a relaxed clam's foot is about half the shell height deep). The section
 * is a lens, sharper along the ventral keel.
 */
function buildFoot(nt, nr) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nt; i++) {
    const t = i / nt;
    const end = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.55) / 0.45), 2)));   // rounded tip
    const up = 0.1 * end * (0.85 + 0.15 * t);                                                 // dorsal edge
    const down = (0.1 + 0.09 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * end;            // ventral keel
    const thick = 0.055 * (1 - 0.35 * t) * Math.max(end, 0.05);
    for (let j = 0; j <= nr; j++) {
      const a = (j / nr) * Math.PI * 2;
      const sy = Math.sin(a), cz = Math.cos(a);
      const y = sy >= 0 ? sy * up : sy * down;
      // lens section: thinner toward the ventral keel
      const z = cz * thick * (sy < 0 ? 1 - 0.55 * sy * sy : 1 - 0.25 * sy * sy);
      pos.push(t, y, z);
      uv.push(t, j / nr);
    }
  }
  for (let i = 0; i < nt; i++) for (let j = 0; j < nr; j++) {
    const a = i * (nr + 1) + j;
    idx.push(a, a + nr + 1, a + 1, a + 1, a + nr + 1, a + nr + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aTent', new BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Open tube along +x over [0, 1] with a thickened lip. In アサリ the two siphons are fused for most of their
 * length and part only near the tips, so the wall facing the partner (local ±y) swells into it, giving one
 * figure-of-eight sheath with a shallow groove; over the last fifth the two tips part into a short Y. The
 * inhalant margin bears one or two rows of dense, stout, short tentacles; the exhalant one row of thin,
 * sparse ones (Ruditapes philippinarum siphon descriptions).
 */
function buildSiphon(radius, tentacles, papillae, partner, nt, nr) {
  const fork = (t) => -partner * ANATOMY.siphonFork * Math.pow(smooth(0.78, 1.0, t), 1.4);
  const pos = [], uv = [], tent = [], idx = [];
  for (let i = 0; i <= nt; i++) {
    const t = i / nt;
    const r0 = radius * (1 - 0.14 * t) * (1 + 0.06 * Math.exp(-(((t - 0.97) / 0.035) ** 2)));
    const fuse = 1 - smooth(0.84, 0.96, t);
    for (let j = 0; j <= nr; j++) {
      const a = (j / nr) * Math.PI * 2;
      const toward = Math.max(0, Math.cos(a) * partner);
      const r = r0 * (1 + 0.62 * fuse * toward * toward);
      pos.push(t, Math.cos(a) * r + fork(t), Math.sin(a) * r);
      uv.push(t, j / nr);
      tent.push(0);
    }
  }
  for (let i = 0; i < nt; i++) for (let j = 0; j < nr; j++) {
    const a = i * (nr + 1) + j;
    idx.push(a, a + 1, a + nr + 1, a + 1, a + nr + 2, a + nr + 1);
  }
  // dark plug deep inside so the tube never reads as hollow through to the shell
  const plug = pos.length / 3;
  pos.push(0.75, 0, 0); uv.push(0.2, 0); tent.push(0);
  for (let j = 0; j <= nr; j++) {
    const a = (j / nr) * Math.PI * 2, r = radius * 0.86;
    pos.push(0.75, Math.cos(a) * r + fork(0.75), Math.sin(a) * r); uv.push(0.2, 0); tent.push(0);
  }
  for (let j = 0; j < nr; j++) idx.push(plug, plug + 1 + j, plug + 2 + j);
  const fringe = tentacles + papillae;
  for (let k = 0; k < fringe; k++) {
    const pap = k >= tentacles;
    const n = pap ? papillae : tentacles, kk = pap ? k - tentacles : k;
    const a = ((kk + 0.5 + (pap ? 0.3 * Math.sin(kk * 1.7) : 0.2 * Math.sin(kk * 2.3))) / n) * Math.PI * 2;
    // inhalant: two rows, outer stout and longer, inner short; exhalant: thin and sparse
    const innerRow = !pap && kk % 2 === 1;
    const len = pap ? radius * (0.22 + 0.1 * (kk % 3) / 2) : radius * (innerRow ? 0.22 : 0.34 + 0.16 * (((kk * 7) % 5) / 4));
    // tentacles fan outward over the sand, papillae stand up round the rim
    // tentacles lean in over the opening like a fringe, papillae stand up round the rim
    const out = pap ? new Vector3(0.55, Math.cos(a) * 0.83, Math.sin(a) * 0.83) : new Vector3(0.75, -Math.cos(a) * 0.66, -Math.sin(a) * 0.66);
    const side = new Vector3(0, -Math.sin(a), Math.cos(a));
    const rb = radius * (innerRow ? 0.78 : 0.92);
    const base = new Vector3(innerRow ? 0.985 : 1, Math.cos(a) * rb + fork(1), Math.sin(a) * rb);
    const b0 = pos.length / 3;
    const segs = 3, w = radius * (pap ? 0.05 : innerRow ? 0.08 : 0.11);
    for (let i = 0; i <= segs; i++) {
      const f = i / segs, r = w * (1 - f * 0.85);
      for (let s = 0; s < 4; s++) {
        const ang = (s / 4) * Math.PI * 2;
        const c = base.clone().addScaledVector(out, len * f).addScaledVector(side, Math.cos(ang) * r);
        c.x += Math.sin(ang) * r;
        pos.push(c.x, c.y, c.z); uv.push(1, f); tent.push(Math.max(0.15, f));
      }
    }
    for (let i = 0; i < segs; i++) for (let s = 0; s < 4; s++) {
      const a0 = b0 + i * 4 + s, a1 = b0 + i * 4 + ((s + 1) % 4);
      idx.push(a0, a1, a0 + 4, a1, a1 + 4, a0 + 4);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aTent', new Float32BufferAttribute(tent, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function withTent(g) {
  g.setAttribute('aTent', new BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
}

let shared = null;
/** geometry shared by every アサリ (never disposed) */
export function sharedGeometry() {
  if (shared) return shared;
  const body = withTent(new SphereGeometry(1, 18, 12));
  body.scale(0.27, 0.2, 0.14);
  body.translate(-0.02, -0.01, 0);
  const lig = new CapsuleGeometry(0.014, 0.26, 3, 6);
  // along the posterodorsal margin behind the beaks, half sunk between the valves
  lig.rotateZ(Math.PI / 2 + Math.atan2(0.15, 1));
  lig.scale(1, 1, 0.8);
  lig.translate(-0.045, 0.334, 0);
  lig.setAttribute('aTent', new BufferAttribute(new Float32Array(lig.attributes.position.count).fill(2), 1));   // 2 = ligament
  shared = {
    valve: LODS.map((_, i) => buildValve(i)),
    mantle: [buildMantle(140, 95), buildMantle(48, 0)],
    body,
    ligament: lig,
    foot: [buildFoot(20, 14), buildFoot(8, 8)],
    // local +y of a siphon points ventrally, so the exhalant's partner is +y and the inhalant's −y
    siphonIn: [buildSiphon(ANATOMY.siphonIn.radius, 36, 0, -1, 24, 20), buildSiphon(ANATOMY.siphonIn.radius, 0, 0, -1, 6, 8)],
    siphonOut: [buildSiphon(ANATOMY.siphonOut.radius, 0, 11, 1, 24, 18), buildSiphon(ANATOMY.siphonOut.radius, 0, 0, 1, 6, 8)],
    decal: new PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
  };
  return shared;
}

const qa = new Quaternion();

/**
 * One アサリ.
 *
 *   ClamRoot
 *   ├── LeftShell        (pivot on the hinge axis; valve + mantle edge)
 *   ├── RightShell
 *   ├── SoftBody         (visceral mass + external ligament)
 *   ├── Foot
 *   ├── InhalantSiphon
 *   └── ExhalantSiphon
 *
 * plus `decal`, a sand quad the driver keeps flat on the ground (not part of the clam's pose).
 */
export class AsariModel {
  /** @param {{ shellPatternSeed?: number, shellColorSeed?: number }} [o] */
  constructor(o = {}) {
    const geo = sharedGeometry();
    this.geo = geo;
    this.shellPatternSeed = o.shellPatternSeed ?? Math.random();
    this.shellColorSeed = o.shellColorSeed ?? Math.random();
    this.mats = {
      outerL: makeShellOuterMaterial(), outerR: makeShellOuterMaterial(),
      inner: makeShellInnerMaterial(),
      soft: makeSoftMaterial(0), foot: makeSoftMaterial(1),
      sIn: makeSoftMaterial(2), sOut: makeSoftMaterial(2),
      decal: makeDecalMaterial(),
    };
    const ps = this.shellPatternSeed, cs = this.shellColorSeed;
    // both valves carry the same mantle-laid pattern, with small left/right differences
    this.mats.outerL.userData.uniforms.uSeed.value.set(ps, cs, 1, 1);
    this.mats.outerR.userData.uniforms.uSeed.value.set(ps + 0.0007, cs, -1, 1);
    this.mats.inner.userData.uniforms.uSeed.value.set(ps, cs, 1, 1);

    const root = new Group();
    root.name = 'ClamRoot';
    this.root = root;
    const H = ANATOMY.hingePoint;
    const mkValve = (name, mat, mirror) => {
      const pivot = new Group();
      pivot.name = name;
      pivot.position.copy(H);
      const valve = new Mesh(geo.valve[0], [mat, this.mats.inner]);
      valve.position.copy(H).negate();
      const mantlePivot = new Group();
      mantlePivot.position.copy(H);
      const mantle = new Mesh(geo.mantle[0], this.mats.soft);
      mantle.position.copy(valve.position);
      if (mirror) { valve.scale.z = -1; mantle.scale.z = -1; }
      pivot.add(valve);
      mantlePivot.add(mantle);
      root.add(pivot, mantlePivot);
      return { pivot, mantlePivot, valve, mantle, outer: mat };
    };
    this.left = mkValve('LeftShell', this.mats.outerL, false);
    this.right = mkValve('RightShell', this.mats.outerR, true);

    const soft = new Group();
    soft.name = 'SoftBody';
    this.bodyMesh = new Mesh(geo.body, this.mats.soft);
    this.ligament = new Mesh(geo.ligament, this.mats.soft);
    soft.add(this.bodyMesh, this.ligament);
    root.add(soft);
    this.softBody = soft;

    this.foot = new Group();
    this.foot.name = 'Foot';
    this.foot.position.copy(ANATOMY.footRoot);
    this.foot.rotation.z = ANATOMY.footDir;
    this.footMesh = new Mesh(geo.foot[0], this.mats.foot);
    this.foot.add(this.footMesh);
    root.add(this.foot);

    const mkSiphon = (name, spec, g, mat) => {
      const grp = new Group();
      grp.name = name;
      grp.position.copy(spec.root);
      grp.rotation.z = ANATOMY.siphonDir;
      const mesh = new Mesh(g, mat);
      grp.add(mesh);
      root.add(grp);
      return { grp, mesh };
    };
    this.siphonIn = mkSiphon('InhalantSiphon', ANATOMY.siphonIn, geo.siphonIn[0], this.mats.sIn);
    this.siphonOut = mkSiphon('ExhalantSiphon', ANATOMY.siphonOut, geo.siphonOut[0], this.mats.sOut);

    this.decal = new Mesh(geo.decal, this.mats.decal);
    this.decal.name = 'AsariSandDecal';
    this.decal.renderOrder = 1;

    for (const m of this.meshes()) { m.castShadow = false; m.receiveShadow = true; m.frustumCulled = true; }
    this.lod = 0;
    this.setLod(1);
  }

  meshes() {
    return [this.left.valve, this.left.mantle, this.right.valve, this.right.mantle, this.bodyMesh, this.ligament, this.footMesh, this.siphonIn.mesh, this.siphonOut.mesh];
  }

  /** 0 macro, 1 normal, 2 far (closed shell only: no soft parts, siphons or fine sculpture) */
  setLod(l) {
    if (l === this.lod) return;
    this.lod = l;
    const g = this.geo;
    const near = l < 2;
    for (const v of [this.left, this.right]) {
      v.valve.geometry = g.valve[l];
      v.valve.material = l === 2 ? v.outer : [v.outer, this.mats.inner];
      v.mantle.geometry = g.mantle[Math.min(l, 1)];
      v.mantle.visible = near;
    }
    this.softBody.visible = near;
    this.footMesh.geometry = g.foot[l === 0 ? 0 : 1];
    this.siphonIn.mesh.geometry = g.siphonIn[l === 0 ? 0 : 1];
    this.siphonOut.mesh.geometry = g.siphonOut[l === 0 ? 0 : 1];
    const detail = l === 0 ? 1 : l === 1 ? 0.5 : 0;
    this.mats.outerL.userData.uniforms.uSeed.value.w = detail;
    this.mats.outerR.userData.uniforms.uSeed.value.w = detail;
  }

  /**
   * Pose the rig. gape 0..1; foot = {ext, swell, bend}; siphons = {len (shell lengths), open, swayY, swayZ}.
   */
  pose(gape, foot, sIn, sOut, mantleBreath) {
    // the siphons leave through the posterior gape: while they are out the valves cannot be shut on them
    const clearance = smooth(0.03, 0.14, Math.max(sIn.len, sOut.len));
    const g = Math.max(gape, clearance);
    const a = g * ANATOMY.maxGape * 0.5;
    this.left.pivot.quaternion.copy(qa.setFromAxisAngle(ANATOMY.hingeAxis, a));
    this.right.pivot.quaternion.copy(qa.setFromAxisAngle(ANATOMY.hingeAxis, -a));
    this.left.mantlePivot.quaternion.copy(qa.setFromAxisAngle(ANATOMY.hingeAxis, a * ANATOMY.mantleFollow));
    this.right.mantlePivot.quaternion.copy(qa.setFromAxisAngle(ANATOMY.hingeAxis, -a * ANATOMY.mantleFollow));
    this.mats.foot.userData.uniforms.uDeform.value.set(foot.ext, foot.swell, foot.bend, ANATOMY.footLength);
    this.footMesh.visible = foot.ext > 0.02 && this.lod < 2;
    this.mats.sIn.userData.uniforms.uDeform.value.set(sIn.len, sIn.open, sIn.swayY, sIn.swayZ);
    this.mats.sOut.userData.uniforms.uDeform.value.set(sOut.len, sOut.open, sOut.swayY, sOut.swayZ);
    const showSiphons = this.lod < 2 && (sIn.len > 0.06 || Math.max(gape, clearance) > 0.2);
    this.siphonIn.mesh.visible = showSiphons;
    this.siphonOut.mesh.visible = showSiphons;
    // uDeform.x: breathing; uDeform.y: how far the mantle lips are pushed out (0 drawn in, 1 relaxed)
    this.mats.soft.userData.uniforms.uDeform.value.x = mantleBreath;
    this.mats.soft.userData.uniforms.uDeform.value.y = smooth(0.08, 0.6, g);
  }

  /** sand level (world y), soft band width in shell lengths, wetness 0..1 */
  setSand(groundY, band, wet, enabled = true) {
    for (const k of ['outerL', 'outerR', 'inner', 'soft', 'foot', 'sIn', 'sOut']) this.mats[k].userData.uniforms.uSand.value.set(groundY, band, enabled ? 1 : 0, wet);
  }

  dispose() {
    for (const m of Object.values(this.mats)) m.dispose();
    this.root.removeFromParent();
    this.decal.removeFromParent();
  }
}

/** Preview for the 図鑑: closed-ish clam lying on its side, siphons slightly out. */
export function makeAsariPreview(seed = 0.42) {
  const m = new AsariModel({ shellPatternSeed: seed, shellColorSeed: (seed * 7.31) % 1 });
  m.setLod(0);
  m.pose(0.35, { ext: 0, swell: 0, bend: 0 }, { len: 0.16, open: 0.7, swayY: 0, swayZ: 0 }, { len: 0.12, open: 0.6, swayY: 0, swayZ: 0 }, 0);
  m.setSand(-1e9, 0.04, 0.7, false);
  return m;
}
