import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Group, Mesh, PlaneGeometry, Quaternion, SphereGeometry, CapsuleGeometry, Vector3 } from 'three';
import { makeDecalMaterial, makeShellInnerMaterial, makeShellOuterMaterial, makeSoftMaterial } from './AsariMaterial.js';

/**
 * アサリ Ruditapes philippinarum — procedural model in shell-length units (shell length = 1).
 * Frame: +x anterior, +y dorsal, +z left valve; the commissure is the z = 0 plane.
 *
 * Proportions (adult, Japanese populations; reference photos 001–042 and measured shells):
 *   height / length ≈ 0.70, width (both valves) / length ≈ 0.47, umbo ≈ 0.30 L from the anterior end,
 *   prosogyrate beaks, short concave lunule, long gently sloping posterodorsal margin with an external
 *   ligament, broad bluntly rounded posterior end, evenly convex ventral margin — a rounded trapezoid,
 *   not an ellipse.
 *
 * Geometry is built once per LOD and shared by every clam; the right valve is the left one mirrored.
 */

// valve margin, starting at the umbo and running anterior → ventral → posterior → back along the hinge
const OUTLINE = [
  [0.200, 0.360], [0.290, 0.312], [0.385, 0.222], [0.458, 0.105], [0.497, -0.020],
  [0.480, -0.135], [0.400, -0.240], [0.260, -0.318], [0.080, -0.348], [-0.110, -0.338],
  [-0.275, -0.300], [-0.400, -0.228], [-0.478, -0.120], [-0.502, -0.010], [-0.486, 0.085],
  [-0.410, 0.172], [-0.270, 0.258], [-0.090, 0.326], [0.080, 0.356],
];
const GROWTH_ORIGIN = new Vector3(0.17, 0.315, 0);
const HALF_WIDTH = 0.25;
/** major growth checks modelled in LOD0 geometry (the shader draws its own set close to these) */
const GEOM_CHECKS = [0.54, 0.68, 0.82];

export const ANATOMY = {
  hingePoint: new Vector3(0.05, 0.338, 0),
  hingeAxis: new Vector3(-0.3, -0.035, 0).normalize(),
  /** full gape (both valves) at gape = 1, radians (≈ 2 mm at the ventral margin of a 35 mm clam) */
  maxGape: 0.17,
  footRoot: new Vector3(0.24, -0.17, 0),
  footDir: Math.atan2(-0.83, 0.55),
  footLength: 0.62,
  siphonIn: { root: new Vector3(-0.38, -0.04, 0), radius: 0.058 },
  siphonOut: { root: new Vector3(-0.38, 0.048, 0), radius: 0.044 },
  siphonDir: Math.PI - 0.12,
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

function dome(s) {
  // the inflated umbo is the high point; rounded (elliptic) toward the margin so the valves meet in an ovate section
  return Math.pow(Math.max(0, 1 - Math.pow(s, 2.4)), 0.5);
}
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** outer surface height of the valve at growth coordinate s along the ray to margin point m */
function valveZ(s, m, checks = false) {
  const G = GROWTH_ORIGIN;
  const A = Math.hypot(m.x - G.x, m.y - G.y);
  // flattened toward the hinge (lunule / escutcheon), but every direction meets smoothly at the umbo
  const sector = 1 + (0.5 + 0.5 * Math.pow(smooth(0.0, 0.45, A), 0.8) - 1) * smooth(0.0, 0.55, s);
  let z = HALF_WIDTH * sector * dome(s);
  if (checks) for (const c of GEOM_CHECKS) z -= 0.0012 * Math.exp(-(((s - c) / 0.012) ** 2)) * sector;
  return z;
}

/** prosogyrate beaks: the oldest shell curls forward and slightly up over the hinge */
function beak(s) {
  const k = (1 - s) ** 3;
  return [0.032 * k, 0.009 * k];
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
  const zOut = (s, j) => valveZ(s, M[j % nu], checks);
  // outer
  for (let i = 0; i < rows; i++) {
    const s = sAt(i);
    for (let j = 0; j < cols; j++) {
      const m = M[j % nu];
      const [bx, by] = beak(s);
      pos.push(G.x + s * (m.x - G.x) + bx, G.y + s * (m.y - G.y) + by, zOut(s, j));
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
        pos.push(G.x + s * k * (m.x - G.x) + bx, G.y + s * k * (m.y - G.y) + by, Math.max(0, Math.min(zOut(s, j) * 0.8, zOut(s * k, j) - t)));
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

/** mantle edge lining the valve along the ventral and posterior margin; uv.y = 1 at the pigmented edge */
function buildMantle(nu) {
  const M = outline(nu);
  const G = GROWTH_ORIGIN;
  const pos = [], uv = [], idx = [];
  // ventral and posterior margin only (where the gape is): the anterior end stays closed over the lunule
  const j0 = Math.round(nu * 0.27), j1 = Math.round(nu * 0.73);
  const across = 4;
  for (let j = j0; j <= j1; j++) {
    const m = M[j];
    for (let k = 0; k <= across; k++) {
      const f = k / across;
      const s = 0.86 + f * 0.12;
      // lines the inside of the valve, then curls in to the commissure
      const z = (1 - f) * valveZ(0.86, m) * 0.6 + f * 0.004;
      pos.push(G.x + s * (m.x - G.x), G.y + s * (m.y - G.y), z);
      uv.push(j / nu, f);
    }
  }
  const w = across + 1;
  for (let j = 0; j < j1 - j0; j++) for (let k = 0; k < across; k++) {
    const a = j * w + k;
    idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aTent', new BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** hatchet-shaped, laterally compressed foot along +x over [0, 1] (length set in the shader) */
function buildFoot(nt, nr) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nt; i++) {
    const t = i / nt;
    const prof = Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * t)), 0.55);
    const ry = 0.11 * prof * (0.8 + 0.35 * t), rz = 0.042 * prof;
    for (let j = 0; j <= nr; j++) {
      const a = (j / nr) * Math.PI * 2;
      // a keel on the ventral (leading) edge: the "hatchet"
      const keel = 1 + 0.25 * Math.max(0, -Math.sin(a)) ** 3;
      pos.push(t, Math.sin(a) * ry * keel, Math.cos(a) * rz);
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
 * figure-of-eight sheath with a shallow groove. The inhalant tip carries a fringe of tentacles, the exhalant
 * a ring of small papillae.
 */
function buildSiphon(radius, tentacles, papillae, partner, nt, nr) {
  const pos = [], uv = [], tent = [], idx = [];
  for (let i = 0; i <= nt; i++) {
    const t = i / nt;
    const r0 = radius * (1 - 0.14 * t) * (1 + 0.06 * Math.exp(-(((t - 0.97) / 0.035) ** 2)));
    const fuse = 1 - smooth(0.84, 0.96, t);
    for (let j = 0; j <= nr; j++) {
      const a = (j / nr) * Math.PI * 2;
      const toward = Math.max(0, Math.cos(a) * partner);
      const r = r0 * (1 + 0.62 * fuse * toward * toward);
      pos.push(t, Math.cos(a) * r, Math.sin(a) * r);
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
    pos.push(0.75, Math.cos(a) * r, Math.sin(a) * r); uv.push(0.2, 0); tent.push(0);
  }
  for (let j = 0; j < nr; j++) idx.push(plug, plug + 1 + j, plug + 2 + j);
  const fringe = tentacles + papillae;
  for (let k = 0; k < fringe; k++) {
    const pap = k >= tentacles;
    const n = pap ? papillae : tentacles, kk = pap ? k - tentacles : k;
    const a = ((kk + 0.5 + (pap ? 0 : 0.2 * Math.sin(kk * 2.3))) / n) * Math.PI * 2;
    // tentacles alternate long and short (branched look); papillae are short knobs
    const len = pap ? radius * (0.14 + 0.05 * (kk % 2)) : radius * (0.26 + 0.24 * (((kk * 7) % 5) / 4)) * (kk % 2 ? 0.65 : 1);
    // tentacles fan outward over the sand, papillae stand up round the rim
    // tentacles lean in over the opening like a fringe, papillae stand up round the rim
    const out = pap ? new Vector3(0.55, Math.cos(a) * 0.83, Math.sin(a) * 0.83) : new Vector3(0.75, -Math.cos(a) * 0.66, -Math.sin(a) * 0.66);
    const side = new Vector3(0, -Math.sin(a), Math.cos(a));
    const base = new Vector3(1, Math.cos(a) * radius * 0.92, Math.sin(a) * radius * 0.92);
    const b0 = pos.length / 3;
    const segs = 3, w = radius * (pap ? 0.09 : 0.085);
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
  body.scale(0.27, 0.2, 0.13);
  body.translate(-0.02, -0.01, 0);
  const lig = new CapsuleGeometry(0.014, 0.26, 3, 6);
  // along the posterodorsal margin behind the beaks, half sunk between the valves
  lig.rotateZ(Math.PI / 2 + Math.atan2(0.28, 1));
  lig.scale(1, 1, 0.8);
  lig.translate(-0.07, 0.306, 0);
  lig.setAttribute('aTent', new BufferAttribute(new Float32Array(lig.attributes.position.count).fill(1), 1));
  shared = {
    valve: LODS.map((_, i) => buildValve(i)),
    mantle: [buildMantle(96), buildMantle(40)],
    body,
    ligament: lig,
    foot: [buildFoot(20, 14), buildFoot(8, 8)],
    // local +y of a siphon points ventrally, so the exhalant's partner is +y and the inhalant's −y
    siphonIn: [buildSiphon(ANATOMY.siphonIn.radius, 26, 0, -1, 22, 20), buildSiphon(ANATOMY.siphonIn.radius, 0, 0, -1, 5, 8)],
    siphonOut: [buildSiphon(ANATOMY.siphonOut.radius, 0, 14, 1, 22, 18), buildSiphon(ANATOMY.siphonOut.radius, 0, 0, 1, 5, 8)],
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
      const mantle = new Mesh(geo.mantle[0], this.mats.soft);
      mantle.position.copy(valve.position);
      if (mirror) { valve.scale.z = -1; mantle.scale.z = -1; }
      pivot.add(valve, mantle);
      root.add(pivot);
      return { pivot, valve, mantle, outer: mat };
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
    const a = Math.max(gape, clearance) * ANATOMY.maxGape * 0.5;
    this.left.pivot.quaternion.copy(qa.setFromAxisAngle(ANATOMY.hingeAxis, a));
    this.right.pivot.quaternion.copy(qa.setFromAxisAngle(ANATOMY.hingeAxis, -a));
    this.mats.foot.userData.uniforms.uDeform.value.set(foot.ext, foot.swell, foot.bend, ANATOMY.footLength);
    this.footMesh.visible = foot.ext > 0.02 && this.lod < 2;
    this.mats.sIn.userData.uniforms.uDeform.value.set(sIn.len, sIn.open, sIn.swayY, sIn.swayZ);
    this.mats.sOut.userData.uniforms.uDeform.value.set(sOut.len, sOut.open, sOut.swayY, sOut.swayZ);
    const showSiphons = this.lod < 2 && (sIn.len > 0.06 || Math.max(gape, clearance) > 0.2);
    this.siphonIn.mesh.visible = showSiphons;
    this.siphonOut.mesh.visible = showSiphons;
    this.mats.soft.userData.uniforms.uDeform.value.x = mantleBreath;
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
