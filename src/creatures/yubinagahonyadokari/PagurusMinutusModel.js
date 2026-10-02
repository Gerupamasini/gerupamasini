// Procedural geometry of ユビナガホンヤドカリ (body only – the shell is PagurusMinutusShell.js).
//
// Every rigid article (sclerite) is a lofted superellipse tube weighted 100 % to its own bone; between
// articles a narrower arthrodial membrane ring is blended parent → child, so hard exoskeleton stays rigid
// and only the joint membranes deform – the visual signature of an arthropod limb.
// All geometry is in shield lengths (SL = 1) in the body frame (+Z forward, +Y up, +X animal's left).
//
// Vertex attributes consumed by PagurusMinutusMaterial:
//   aRegion : float  body region id (REGION below)
//   aSeg    : vec4   (t along the article 0..1, angle around it 0..1 (0.25 = dorsal), article kind, side ±1)
//   position (bind pose) doubles as the domain for procedural granules, mottling and setae.
import * as THREE from 'three';
import { MORPH } from './PagurusMinutusMorphology.js';
import { BASIS_FRACTION } from './PagurusMinutusRig.js';
import { TAU, clamp, lerp, hash1, smoothstep } from './PagurusMinutusUtil.js';

export const REGION = {
  SHIELD: 0, BRANCHIO: 1, SOFT_CARAPACE: 2, STERNUM: 3,
  CHELA_ARM: 4, CHELA_PALM: 5, CHELA_FINGER: 6,
  LEG: 7, DACTYL: 8, MEMBRANE: 9,
  EYESTALK: 10, CORNEA: 11, ANTENNA_PED: 12, ANTENNA_FLAG: 13, ANTENNULE: 14, MXP: 15,
  ABDOMEN: 16, UROPOD: 17, REDUCED_LEG: 18, SPINE: 19, SETA: 20,
};
/** article kinds for aSeg.z */
export const KIND = { COXA: 0, BASIS: 1, MERUS: 2, CARPUS: 3, PROPODUS: 4, DACTYLUS: 5, OTHER: 6 };

export const BODY_LOD = [
  { radial: 16, perSL: 15, carapace: [44, 30], antennaRings: 180, antennaRadial: 6, setae: 1.0, longSetae: true, mouth: true, abdomen: true, p45: true, pleopods: true, spines: true, name: 'LOD0' },
  { radial: 9, perSL: 7, carapace: [22, 16], antennaRings: 64, antennaRadial: 4, setae: 0.4, longSetae: false, mouth: true, abdomen: true, p45: true, pleopods: false, spines: false, name: 'LOD1' },
  { radial: 5, perSL: 2.6, carapace: [10, 8], antennaRings: 14, antennaRadial: 3, setae: 0, longSetae: false, mouth: false, abdomen: false, p45: false, pleopods: false, spines: false, name: 'LOD2' },
];

// ---------------------------------------------------------------------------------------------
// Geometry accumulator
// ---------------------------------------------------------------------------------------------

class Acc {
  constructor() {
    this.pos = [];
    this.si = [];
    this.sw = [];
    this.reg = [];
    this.seg = [];
    this.idx = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  /** v: body-frame position; skin: [[bone, w], ...] up to 2 entries */
  vert(v, skin, region, t, ang, kind, side) {
    this.pos.push(v.x, v.y, v.z);
    const b0 = skin[0], b1 = skin[1];
    this.si.push(b0[0], b1 ? b1[0] : 0, 0, 0);
    this.sw.push(b0[1], b1 ? b1[1] : 0, 0, 0);
    this.reg.push(region);
    this.seg.push(t, ang, kind, side);
    return this.count - 1;
  }
  quad(a, b, c, d) {
    this.idx.push(a, c, b, b, c, d);
  }
  tri(a, b, c) {
    this.idx.push(a, b, c);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('aRegion', new THREE.Float32BufferAttribute(this.reg, 1));
    g.setAttribute('aSeg', new THREE.Float32BufferAttribute(this.seg, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

const _p = new THREE.Vector3();

/** superellipse point in the (z, y) cross-section plane: angle 0 → +z, π/2 → +y */
function superellipse(theta, h, w, n) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const e = 2 / n;
  return [Math.sign(c) * Math.pow(Math.abs(c), e) * w, Math.sign(s) * Math.pow(Math.abs(s), e) * h];
}

/**
 * Lofted tube along a bone's local +X.
 * o: { bi, M (bind matrix, body frame), L, rings, radial, profile(t) → {h, w, n, oy?, oz?},
 *      bend?(t) → [dy, dz], twist?(t), region(t, theta), kind, side, x0?, capStart?, capEnd?, skin?(t) }
 * capStart/capEnd: 'none' | 'rim' (inward lip toward the membrane) | 'tip' (close to a point) | 'flat'
 */
function tube(acc, o) {
  const rings = Math.max(2, o.rings);
  const m = Math.max(3, o.radial);
  const x0 = o.x0 ?? 0;
  const start = acc.count;
  const ringStart = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const pr = o.profile(t);
    const [dy, dz] = o.bend ? o.bend(t) : [0, 0];
    const tw = o.twist ? o.twist(t) : 0;
    const ct = Math.cos(tw), st = Math.sin(tw);
    ringStart.push(acc.count);
    for (let j = 0; j <= m; j++) {
      const th = (j / m) * TAU + (o.phase ?? 0);
      let [z, y] = superellipse(th, pr.h, pr.w, pr.n ?? 2.4);
      const yy = y * ct - z * st, zz = y * st + z * ct;
      _p.set(x0 + t * o.L, yy + (pr.oy ?? 0) + dy, zz + (pr.oz ?? 0) + dz).applyMatrix4(o.M);
      const skin = o.skin ? o.skin(t) : [[o.bi, 1]];
      acc.vert(_p, skin, o.region(t, th), t, (((th - (o.phase ?? 0)) / TAU) % 1 + 1) % 1, o.kind, o.side);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = ringStart[i] + j, b = a + 1, c = ringStart[i + 1] + j, d = c + 1;
      acc.quad(a, b, c, d);
    }
  }
  // caps
  const cap = (which, mode) => {
    if (!mode || mode === 'none') return;
    const ri = which === 'start' ? 0 : rings - 1;
    const t = which === 'start' ? 0 : 1;
    const pr = o.profile(t);
    const [dy, dz] = o.bend ? o.bend(t) : [0, 0];
    const skin = o.skin ? o.skin(t) : [[o.bi, 1]];
    const region = mode === 'rim' ? REGION.MEMBRANE : o.region(t, Math.PI / 2);
    const cx = x0 + t * o.L + (mode === 'tip' ? (which === 'start' ? -1 : 1) * 0.02 * o.L : 0);
    const center = new THREE.Vector3(cx, (pr.oy ?? 0) + dy, (pr.oz ?? 0) + dz).applyMatrix4(o.M);
    if (mode === 'rim') {
      // inward annulus (articular rim) at 0.7 radius
      const inner = acc.count;
      for (let j = 0; j <= m; j++) {
        const th = (j / m) * TAU + (o.phase ?? 0);
        const [z, y] = superellipse(th, pr.h * 0.7, pr.w * 0.7, 2.2);
        const off = which === 'start' ? 0.012 : -0.012;
        _p.set(x0 + t * o.L + off, y + (pr.oy ?? 0) + dy, z + (pr.oz ?? 0) + dz).applyMatrix4(o.M);
        acc.vert(_p, skin, region, t, j / m, o.kind, o.side);
      }
      for (let j = 0; j < m; j++) {
        const a = ringStart[ri] + j, b = a + 1, c = inner + j, d = c + 1;
        if (which === 'start') acc.quad(c, d, a, b);
        else acc.quad(a, b, c, d);
      }
      return;
    }
    const ci = acc.vert(center, skin, region, t, 0.25, o.kind, o.side);
    for (let j = 0; j < m; j++) {
      const a = ringStart[ri] + j, b = a + 1;
      if (which === 'start') acc.tri(ci, b, a);
      else acc.tri(ci, a, b);
    }
  };
  cap('start', o.capStart);
  cap('end', o.capEnd);
  return start;
}

/** arthrodial membrane between a parent article end and this article's start (in child frame) */
function membrane(acc, o) {
  const m = Math.max(3, o.radial);
  const gap = o.gap ?? 0.05;
  const rings = 3;
  const rs = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const x = lerp(-gap, 0.03, t);
    const waist = 1 - 0.12 * Math.sin(Math.PI * t);
    rs.push(acc.count);
    for (let j = 0; j <= m; j++) {
      const th = (j / m) * TAU;
      const [z, y] = superellipse(th, o.h * waist, o.w * waist, 2.2);
      _p.set(x, y, z).applyMatrix4(o.M);
      const wc = smoothstep(0, 1, t);
      acc.vert(_p, [[o.parent, 1 - wc], [o.bi, wc]], REGION.MEMBRANE, t, j / m, KIND.OTHER, o.side);
    }
  }
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < m; j++) {
    const a = rs[i] + j, b = a + 1, c = rs[i + 1] + j, d = c + 1;
    acc.quad(a, b, c, d);
  }
}

/** small cone (spine / tubercle) on a bone, pointing along `dir` (bone-local) */
function spine(acc, bi, M, base, dir, len, rad, region, side, radial = 5) {
  const d = dir.clone().normalize();
  const ref = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(d, ref).normalize();
  const v = new THREE.Vector3().crossVectors(d, u);
  const ring = acc.count;
  for (let j = 0; j <= radial; j++) {
    const th = (j / radial) * TAU;
    _p.copy(base).addScaledVector(u, Math.cos(th) * rad).addScaledVector(v, Math.sin(th) * rad).addScaledVector(d, -rad * 0.4).applyMatrix4(M);
    acc.vert(_p, [[bi, 1]], region, 0, j / radial, KIND.OTHER, side);
  }
  _p.copy(base).addScaledVector(d, len).applyMatrix4(M);
  const tip = acc.vert(_p, [[bi, 1]], region, 1, 0, KIND.OTHER, side);
  for (let j = 0; j < radial; j++) acc.tri(ring + j, tip, ring + j + 1);
}

// ---------------------------------------------------------------------------------------------
// Body parts
// ---------------------------------------------------------------------------------------------

function buildCephalothorax(acc, rig, lod) {
  const bi = rig.list.indexOf(rig.root);
  const [nz, nr] = lod.carapace;
  const S = MORPH.shield, PC = MORPH.posteriorCarapace;
  // stations: z, half width, top, bottom, squareness
  const st = [
    [-PC.length, PC.widthEnd * 0.5, 0.1, -0.12, 2.2],
    [-0.75, 0.34, 0.14, -0.18, 2.4],
    [-0.5, 0.4, 0.17, -0.24, 2.6],
    [-0.2, 0.44, 0.19, -0.28, 2.8],
    [-0.02, 0.45, 0.17, -0.3, 3.0],
    [0.02, 0.455, 0.185, -0.3, 3.0],
    [0.25, 0.47, 0.205, -0.31, 3.1],
    [0.5, 0.48 * S.width / 0.952, 0.215, -0.3, 3.1],
    [0.75, 0.465, 0.205, -0.26, 2.9],
    [0.92, 0.41, 0.17, -0.2, 2.6],
    [1.0, 0.3, 0.12, -0.12, 2.4],
  ];
  const sample = (z) => {
    let k = 0;
    while (k < st.length - 2 && st[k + 1][0] < z) k++;
    const a = st[k], b = st[k + 1];
    const f = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
    const g = f * f * (3 - 2 * f);
    return a.map((v, i) => lerp(v, b[i], i === 0 ? f : g));
  };
  const z0 = st[0][0], z1 = st[st.length - 1][0];
  const rs = [];
  const M = new THREE.Matrix4();
  for (let i = 0; i < nz; i++) {
    const t = i / (nz - 1);
    const z = lerp(z0, z1, t);
    const [, hw, top, bot, sq] = sample(z);
    const cy = (top + bot) / 2, h = (top - bot) / 2;
    rs.push(acc.count);
    for (let j = 0; j <= nr; j++) {
      const th = (j / nr) * TAU;
      // flatter top on the shield, rounder belly
      const n = Math.sin(th) > 0 ? sq + (z > 0 ? 0.8 : 0) : 2.2;
      let [x, y] = superellipse(th, h, hw, n);
      // cervical groove: a shallow dorsal dip at the shield's posterior margin
      if (y > 0) y -= 0.018 * Math.exp(-Math.pow((z - 0.0) / 0.035, 2)) * smoothstep(0.3, 0.9, Math.sin(th));
      let zz = z;
      // rostrum and lateral projections on the front margin of the shield
      if (z > 0.86 && y > -0.02) {
        const f = smoothstep(0.86, 1.0, z) * smoothstep(-0.02, 0.1, y);
        zz += f * S.rostrum.len * Math.exp(-Math.pow(x / S.rostrum.halfWidth, 2));
        zz += f * S.lateralProjection.len * Math.exp(-Math.pow((Math.abs(x) - S.lateralProjection.x * 0.62) / S.lateralProjection.halfWidth, 2));
      }
      _p.set(x, y + cy, zz).applyMatrix4(M);
      // regions
      let region;
      const upness = Math.sin(th);
      if (z >= -0.01 && upness > 0.42) region = REGION.SHIELD;
      else if (upness < -0.72) region = REGION.STERNUM;
      else if (z >= -0.01) region = REGION.BRANCHIO;
      else region = REGION.SOFT_CARAPACE;
      acc.vert(_p, [[bi, 1]], region, t, j / nr, KIND.OTHER, Math.sign(x) || 1);
    }
  }
  for (let i = 0; i < nz - 1; i++) for (let j = 0; j < nr; j++) {
    const a = rs[i] + j, b = a + 1, c = rs[i + 1] + j, d = c + 1;
    acc.quad(b, a, d, c);
  }
  // frontal cap (concave, where eyes and antennae articulate)
  const last = rs[rs.length - 1];
  const fc = acc.vert(new THREE.Vector3(0, 0.0, 0.94), [[bi, 1]], REGION.BRANCHIO, 1, 0.25, KIND.OTHER, 1);
  for (let j = 0; j < nr; j++) acc.tri(fc, last + j + 1, last + j);
  // posterior opening is closed by the abdomen; add a cap only when the abdomen is not built
  if (!lod.abdomen) {
    const first = rs[0];
    const bc = acc.vert(new THREE.Vector3(0, -0.01, z0 - 0.04), [[bi, 1]], REGION.SOFT_CARAPACE, 0, 0.25, KIND.OTHER, 1);
    for (let j = 0; j < nr; j++) acc.tri(bc, first + j, first + j + 1);
  }
}

function boneM(rig, b) {
  return rig.bindWorld.get(b);
}

/** a leg-like chain: [{bone, L, section [[h,w],[h,w]], kind, region, cap...}] */
function buildChain(acc, rig, lod, side, parts, opts = {}) {
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    const bi = rig.list.indexOf(p.bone);
    const M = boneM(rig, p.bone);
    const rings = Math.max(2, Math.round(p.L * lod.perSL * (p.ringScale ?? 1)) + 1);
    const [h0, w0] = p.section[0], [h1, w1] = p.section[1];
    const prof = p.profile ?? ((t) => {
      // sclerite: slight distal swelling and a condylar flare at both ends
      const bulge = 1 + 0.06 * Math.sin(Math.PI * t) + 0.05 * Math.exp(-Math.pow((1 - t) / 0.08, 2));
      return { h: lerp(h0, h1, t) * bulge, w: lerp(w0, w1, t) * bulge, n: p.n ?? 2.5 };
    });
    tube(acc, {
      bi, M, L: p.L, rings, radial: p.radial ?? lod.radial, profile: prof, bend: p.bend, twist: p.twist,
      region: p.regionFn ?? (() => p.region), kind: p.kind, side,
      capStart: p.capStart ?? (k === 0 ? 'flat' : 'rim'), capEnd: p.capEnd ?? (k === parts.length - 1 ? 'tip' : 'rim'),
    });
    if (k > 0 && !p.noMembrane) {
      const prev = parts[k - 1];
      membrane(acc, {
        bi, parent: rig.list.indexOf(prev.bone), M, radial: Math.max(4, Math.round((p.radial ?? lod.radial) * 0.75)),
        h: Math.min(prev.section[1][0], h0) * 0.72, w: Math.min(prev.section[1][1], w0) * 0.72, side, gap: 0.045,
      });
    }
    if (p.extra) p.extra(acc, bi, M);
  }
}

/**
 * basis + ischium as two articles meeting at an immobile suture (no arthrodial membrane between them;
 * the flat end caps leave a slight ledge that reads as the suture line) [G]
 */
function basiIschium(leg, L, section, region) {
  const f = BASIS_FRACTION;
  const mid = [lerp(section[0][0], section[1][0], f), lerp(section[0][1], section[1][1], f)];
  return [
    { bone: leg.basis, L: L * f, section: [section[0], mid], kind: KIND.BASIS, region, capEnd: 'flat' },
    { bone: leg.ischium, L: L * (1 - f), section: [mid, section[1]], kind: KIND.BASIS, region, capStart: 'flat', noMembrane: true },
  ];
}

function walkingLeg(acc, rig, lod, leg) {
  const S = MORPH.walkingLegs.section;
  const W = MORPH.walkingLegs;
  const s = leg.side;
  const L = leg.len;
  const parts = [
    { bone: leg.coxa, L: L.coxa, section: S.coxa, kind: KIND.COXA, region: REGION.LEG },
    ...basiIschium(leg, L.basis, S.basis, REGION.LEG),
    { bone: leg.merus, L: L.merus, section: S.merus, kind: KIND.MERUS, region: REGION.LEG, n: 2.7 },
    {
      bone: leg.carpus, L: L.carpus, section: S.carpus, kind: KIND.CARPUS, region: REGION.LEG, n: 2.6,
      extra: lod.spines ? (a, bi, M) => spine(a, bi, M, new THREE.Vector3(L.carpus * 0.93, S.carpus[1][0] * 0.95, 0), new THREE.Vector3(0.8, 0.6, 0), W.carpalSpine, 0.013, REGION.SPINE, s) : null,
    },
    { bone: leg.propodus, L: L.propodus, section: S.propodus, kind: KIND.PROPODUS, region: REGION.LEG, n: 2.5 },
    {
      // the long dactyl: slender, curved ventrally, weakly twisted, tapering to a corneous point [D]
      bone: leg.dactylus, L: L.dactylus, section: S.dactylus, kind: KIND.DACTYLUS, region: REGION.DACTYL, ringScale: 1.6,
      profile: (t) => {
        const f = Math.pow(t, 1.45);
        return { h: lerp(S.dactylus[0][0], S.dactylus[1][0], f), w: lerp(S.dactylus[0][1], S.dactylus[1][1], f), n: 2.2 };
      },
      bend: (t) => [-W.dactylCurve * L.dactylus * 0.5 * t * t, 0],
      twist: (t) => W.dactylTwist * t * s,
      extra: lod.spines ? (a, bi, M) => {
        // ventral row of corneous spinules [G]
        for (let k = 1; k <= W.dactylSpinules; k++) {
          const t = 0.2 + 0.65 * (k / W.dactylSpinules);
          const h = lerp(S.dactylus[0][0], S.dactylus[1][0], Math.pow(t, 1.45));
          spine(a, bi, M, new THREE.Vector3(t * L.dactylus, -h * 0.85 - W.dactylCurve * L.dactylus * 0.5 * t * t, 0), new THREE.Vector3(0.6, -0.8, 0), 0.022 * (1 - t * 0.4), 0.006, REGION.SPINE, s, 4);
        }
      } : null,
    },
  ];
  buildChain(acc, rig, lod, s, parts);
}

function reducedLeg(acc, rig, lod, leg) {
  const L = leg.len;
  const r = L.section;
  const parts = [
    { bone: leg.coxa, L: L.coxa, section: [[r * 1.1, r], [r, r * 0.9]], kind: KIND.COXA, region: REGION.REDUCED_LEG },
    ...basiIschium(leg, L.basis, [[r * 0.9, r * 0.8], [r * 0.9, r * 0.8]], REGION.REDUCED_LEG),
    { bone: leg.merus, L: L.merus, section: [[r * 1.05, r * 0.75], [r * 1.0, r * 0.72]], kind: KIND.MERUS, region: REGION.REDUCED_LEG },
    { bone: leg.carpus, L: L.carpus, section: [[r * 0.9, r * 0.7], [r * 0.95, r * 0.7]], kind: KIND.CARPUS, region: REGION.REDUCED_LEG },
    { bone: leg.propodus, L: L.propodus, section: [[r * 0.95, r * 0.7], [r * 0.8, r * 0.6]], kind: KIND.PROPODUS, region: REGION.REDUCED_LEG },
    { bone: leg.dactylus, L: L.dactylus, section: [[r * 0.6, r * 0.5], [r * 0.1, r * 0.1]], kind: KIND.DACTYLUS, region: REGION.REDUCED_LEG },
  ];
  buildChain(acc, rig, { ...lod, radial: Math.max(4, Math.round(lod.radial * 0.6)) }, leg.side, parts);
}

function cheliped(acc, rig, lod, ch, isMajor) {
  const C = MORPH.chelipeds[isMajor ? 'R' : 'L'];
  const L = ch.len;
  const s = ch.side;
  const chelaW = (isMajor ? rig.ind.chelaRWidth : rig.ind.chelaLWidth) * 0.5; // half width
  const chelaH = L.chela * C.thicknessRatio * 0.5;
  const parts = [
    { bone: ch.coxa, L: L.coxa, section: [[0.1, 0.09], [0.095, 0.085]], kind: KIND.COXA, region: REGION.CHELA_ARM },
    ...basiIschium(ch, L.basis, [[0.085, 0.075], [0.09, 0.08]], REGION.CHELA_ARM),
    {
      bone: ch.merus, L: L.merus, section: [[C.merusSection[1] * 0.85, C.merusSection[0] * 0.8], [C.merusSection[1], C.merusSection[0]]], kind: KIND.MERUS, region: REGION.CHELA_ARM, n: 2.6,
      extra: lod.spines && isMajor ? (a, bi, M) => spine(a, bi, M, new THREE.Vector3(L.merus * 0.55, -C.merusSection[1] * 0.95, 0), new THREE.Vector3(0.2, -1, 0), 0.045, 0.024, REGION.SPINE, s) : null, // ventral tubercle [D]
    },
    {
      bone: ch.carpus, L: L.carpus, section: [[C.carpusSection[1] * 0.75, C.carpusSection[0] * 0.7], [C.carpusSection[1], C.carpusSection[0]]], kind: KIND.CARPUS, region: REGION.CHELA_ARM, n: 2.5,
      extra: lod.spines ? (a, bi, M) => {
        // small dorsal spines and granules on the carpus [D]
        for (let k = 0; k < (isMajor ? 6 : 3); k++) {
          const t = 0.25 + 0.65 * (k / 6);
          const h = lerp(C.carpusSection[1] * 0.75, C.carpusSection[1], t);
          spine(a, bi, M, new THREE.Vector3(t * L.carpus, h * 0.95, (hash1(k * 7 + s) - 0.5) * 0.06), new THREE.Vector3(0.5, 1, 0), 0.03, 0.012, REGION.SPINE, s, 4);
        }
      } : null,
    },
    {
      // propodus = palm + fixed finger (pollex), ovate in dorsal view [D]
      bone: ch.propodus, L: L.chela, section: [[chelaH * 0.8, chelaW * 0.7], [0.02, 0.02]], kind: KIND.PROPODUS,
      regionFn: (t) => (t < C.palmFraction ? REGION.CHELA_PALM : REGION.CHELA_FINGER),
      ringScale: 1.4, n: 2.2,
      profile: (t) => {
        const pf = C.palmFraction;
        if (t < pf) {
          // ovate palm: widest at ~55 % of the palm
          const u = t / pf;
          const ov = Math.sin(Math.PI * (0.12 + 0.88 * u * 0.92));
          return { h: chelaH * (0.72 + 0.28 * ov), w: chelaW * (0.62 + 0.38 * ov), n: 2.3, oz: 0 };
        }
        // fixed finger: lateral side of the chela, tapering, slightly incurved
        const u = (t - pf) / (1 - pf);
        const taper = Math.pow(1 - u, 0.8);
        return { h: chelaH * (0.1 + 0.5 * taper), w: chelaW * (0.08 + 0.42 * taper), n: 2.2, oz: -s * chelaW * (0.42 + 0.1 * u) + s * chelaW * 0.25 * u * u };
      },
      capEnd: 'tip',
    },
  ];
  buildChain(acc, rig, lod, s, parts);
  // movable finger (dactylus), hinged on the mesial side of the palm
  const bi = rig.list.indexOf(ch.dactylus);
  const M = boneM(rig, ch.dactylus);
  const Ld = L.dactyl;
  tube(acc, {
    bi, M, L: Ld, rings: Math.max(3, Math.round(Ld * lod.perSL * 1.4)), radial: lod.radial, kind: KIND.DACTYLUS, side: s,
    profile: (t) => {
      const taper = Math.pow(1 - t, 0.75);
      return { h: chelaH * (0.1 + 0.5 * taper), w: chelaW * (0.08 + 0.36 * taper), n: 2.2 };
    },
    bend: (t) => [0, -s * chelaW * 0.22 * t * t],
    region: () => REGION.CHELA_FINGER, capStart: 'flat', capEnd: 'tip',
  });
  if (lod.spines) {
    // dorsal surface armature of the palm: scattered spinules and a dorsolateral row of small spines [D]
    const pb = rig.list.indexOf(ch.propodus);
    const PM = boneM(rig, ch.propodus);
    const pf = C.palmFraction;
    const n = isMajor ? 26 : 10;
    for (let k = 0; k < n; k++) {
      const u = 0.12 + 0.82 * hash1(k * 31 + 5);
      const v = (hash1(k * 17 + 3) - 0.5) * 1.5;
      const t = u * pf;
      const ov = Math.sin(Math.PI * (0.12 + 0.88 * u * 0.92));
      const h = chelaH * (0.72 + 0.28 * ov), w = chelaW * (0.62 + 0.38 * ov);
      const y = h * Math.sqrt(Math.max(0, 1 - v * v * 0.45)) * 0.98;
      spine(acc, pb, PM, new THREE.Vector3(t * L.chela, y, v * w * 0.6), new THREE.Vector3(0.7, 1, 0), 0.022, 0.011, REGION.SPINE, s, 4);
    }
    for (let k = 0; k < (isMajor ? 8 : 4); k++) {
      const u = 0.1 + 0.85 * (k / 8);
      const ov = Math.sin(Math.PI * (0.12 + 0.88 * u * 0.92));
      const w = chelaW * (0.62 + 0.38 * ov);
      spine(acc, pb, PM, new THREE.Vector3(u * pf * L.chela, chelaH * 0.35, -s * w * 0.95), new THREE.Vector3(0.6, 0.3, -s), 0.03, 0.012, REGION.SPINE, s, 4);
    }
  }
}

function eyes(acc, rig, lod) {
  const E = MORPH.eye;
  for (const side of ['L', 'R']) {
    const e = rig.eyes[side];
    const bi = rig.list.indexOf(e.stalk);
    const M = boneM(rig, e.stalk);
    const Ls = E.length - E.corneaLength;
    tube(acc, {
      bi, M, L: Ls, rings: Math.max(3, Math.round(Ls * lod.perSL * 1.3)), radial: lod.radial, kind: KIND.OTHER, side: e.side,
      profile: (t) => {
        const r = lerp(E.radiusBase, E.radiusMid, smoothstep(0, 0.45, t)) * (1 + 0.12 * smoothstep(0.75, 1, t));
        return { h: r, w: r * 1.05, n: 2.1 };
      },
      region: () => REGION.EYESTALK, capStart: 'flat', capEnd: 'none',
    });
    // cornea: slightly dilated cap [D]
    const ci = rig.list.indexOf(e.tip);
    const CM = boneM(rig, e.tip);
    const r0 = E.radiusMid * 1.12;
    tube(acc, {
      bi: ci, M: CM, L: E.corneaLength, x0: -0.01, rings: Math.max(3, Math.round(lod.radial * 0.6)), radial: lod.radial, kind: KIND.OTHER, side: e.side,
      profile: (t) => {
        const r = E.corneaRadius * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.35) / 0.65, 2))) + (t < 0.35 ? lerp(r0, E.corneaRadius, t / 0.35) - E.corneaRadius : 0);
        return { h: Math.max(0.004, r), w: Math.max(0.004, r * 1.04), n: 2 };
      },
      region: () => REGION.CORNEA, capStart: 'none', capEnd: 'tip',
    });
    // ocular acicle at the stalk base [G]
    if (lod.spines) spine(acc, bi, M, new THREE.Vector3(0.02, -E.radiusBase * 0.6, e.side * E.radiusBase * 0.7), new THREE.Vector3(1, 0.1, e.side * 0.4), E.acicle, 0.02, REGION.EYESTALK, e.side, 4);
  }
}

function antennules(acc, rig, lod) {
  const A1 = MORPH.antennule;
  for (const side of ['L', 'R']) {
    const a = rig.antennules[side];
    const parts = a.chain.map((b, i) => ({
      bone: b, L: a.lengths[i],
      section: i < 3 ? [[A1.radius * (1.15 - i * 0.12), A1.radius * (1.05 - i * 0.1)], [A1.radius * (1.0 - i * 0.12), A1.radius * (0.95 - i * 0.1)]] : [[A1.radius * 0.7, A1.radius * 0.55], [0.004, 0.004]],
      kind: i < 3 ? KIND.OTHER : KIND.DACTYLUS, region: REGION.ANTENNULE,
      radial: Math.max(4, Math.round(lod.radial * 0.55)),
    }));
    buildChain(acc, rig, lod, a.side, parts);
  }
}

function antennae(acc, rig, lod) {
  const A2 = MORPH.antenna;
  for (const side of ['L', 'R']) {
    const a = rig.antennae[side];
    // peduncle: two bones carry four short articles
    for (let k = 0; k < 2; k++) {
      const b = a.peduncle[k];
      tube(acc, {
        bi: rig.list.indexOf(b), M: boneM(rig, b), L: a.pedLen * 0.5, rings: Math.max(3, Math.round(a.pedLen * 0.5 * lod.perSL)), radial: Math.max(4, Math.round(lod.radial * 0.6)),
        profile: (t) => ({ h: A2.radius * (1.1 - 0.35 * (k * 0.5 + t * 0.5)) * (1 - 0.1 * Math.sin(t * Math.PI * 4) ** 2), w: A2.radius * (1.05 - 0.35 * (k * 0.5 + t * 0.5)), n: 2.2 }),
        region: () => REGION.ANTENNA_PED, kind: KIND.OTHER, side: a.side, capStart: k === 0 ? 'flat' : 'none', capEnd: 'none',
      });
    }
    if (lod.spines) {
      // antennal acicle: arcuate spine on the second article [G]
      const b = a.peduncle[0];
      spine(acc, rig.list.indexOf(b), boneM(rig, b), new THREE.Vector3(0.08, A2.radius * 0.6, a.side * A2.radius * 0.5), new THREE.Vector3(1, 0.15, a.side * 0.35), A2.acicle, 0.018, REGION.ANTENNA_PED, a.side, 4);
    }
    // flagellum: one continuous tube smoothly skinned along the chain; annuli as slight constrictions
    const chain = a.flagellum;
    const n = chain.length;
    const rings = lod.antennaRings;
    const m = lod.antennaRadial;
    const total = A2.flagellum;
    const segLen = a.segLen;
    const rs = [];
    const annuli = A2.annuli;
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      const sArc = t * total;
      let k = Math.min(n - 1, Math.floor(sArc / segLen));
      const f = sArc / segLen - k;
      const b = chain[k];
      const M = boneM(rig, b);
      const bi = rig.list.indexOf(b);
      const r0 = lerp(A2.flagellumRadius, A2.flagellumRadius * 0.18, Math.pow(t, 0.8));
      const annPhase = (t * annuli) % 1;
      const r = lod.radial > 10 ? r0 * (0.92 + 0.08 * Math.pow(Math.sin(Math.PI * annPhase), 0.4)) : r0;
      const kNext = Math.min(n - 1, k + 1);
      const wNext = f > 0.5 && kNext !== k ? smoothstep(0.5, 1.0, f) * 0.5 : 0;
      const skin = wNext > 0 ? [[bi, 1 - wNext], [rig.list.indexOf(chain[kNext]), wNext]] : [[bi, 1]];
      rs.push(acc.count);
      for (let j = 0; j <= m; j++) {
        const th = (j / m) * TAU;
        _p.set(f * segLen, Math.sin(th) * r, Math.cos(th) * r).applyMatrix4(M);
        acc.vert(_p, skin, REGION.ANTENNA_FLAG, t, j / m, KIND.OTHER, a.side);
      }
    }
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < m; j++) {
      const a0 = rs[i] + j, b0 = a0 + 1, c0 = rs[i + 1] + j, d0 = c0 + 1;
      acc.quad(a0, b0, c0, d0);
    }
  }
}

function mouthparts(acc, rig, lod) {
  const M3 = MORPH.mxp3;
  for (const side of ['L', 'R']) {
    const mx = rig.mxp3[side];
    const parts = mx.chain.map((b, i) => ({
      bone: b, L: mx.lengths[i],
      section: [[M3.radius * (1.25 - i * 0.18), M3.radius * (0.95 - i * 0.12)], [M3.radius * (1.1 - i * 0.18), M3.radius * (0.85 - i * 0.12)]],
      kind: i, region: REGION.MXP, radial: Math.max(4, Math.round(lod.radial * 0.5)),
    }));
    parts[parts.length - 1].section[1] = [0.006, 0.006];
    buildChain(acc, rig, lod, mx.side, parts);
  }
}

function abdomen(acc, rig, lod) {
  const AB = MORPH.abdomen;
  const chain = rig.abdomen;
  const n = chain.length;
  const segLen = rig.abdomenSegLen;
  const rings = Math.max(8, Math.round(AB.length * lod.perSL));
  const m = lod.radial + 2;
  const rs = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const sArc = t * AB.length;
    const k = Math.min(n - 1, Math.floor(sArc / segLen));
    const f = sArc / segLen - k;
    const b = chain[k];
    const M = boneM(rig, b);
    const bi = rig.list.indexOf(b);
    // soft pleon: tapering, dorso-ventrally flattened, faint segment folds; swollen on the left (pleopods side)
    const r = lerp(AB.radiusBase, AB.radiusEnd, Math.pow(t, 0.9)) * (1 + 0.04 * Math.sin(t * Math.PI * 10) ** 2);
    const kp = Math.max(0, k - 1), kn = Math.min(n - 1, k + 1);
    let skin;
    if (f < 0.5 && kp !== k) skin = [[bi, 0.5 + f], [rig.list.indexOf(chain[kp]), 0.5 - f]];
    else if (f >= 0.5 && kn !== k) skin = [[bi, 1.5 - f], [rig.list.indexOf(chain[kn]), f - 0.5]];
    else skin = [[bi, 1]];
    rs.push(acc.count);
    for (let j = 0; j <= m; j++) {
      const th = (j / m) * TAU;
      const left = Math.max(0, Math.cos(th)); // local +Z = animal's left in the bind pose
      const rr = r * (1 + 0.1 * left);
      _p.set(f * segLen, Math.sin(th) * rr * AB.flatten, Math.cos(th) * rr).applyMatrix4(M);
      acc.vert(_p, skin, REGION.ABDOMEN, t, j / m, KIND.OTHER, 1);
    }
  }
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < m; j++) {
    const a0 = rs[i] + j, b0 = a0 + 1, c0 = rs[i + 1] + j, d0 = c0 + 1;
    acc.quad(a0, b0, c0, d0);
  }
  // telson with a median cleft, and asymmetric uropods (left larger) [D]
  const plate = (b, len, wid, region, side) => {
    tube(acc, {
      bi: rig.list.indexOf(b), M: boneM(rig, b), L: len, rings: 4, radial: Math.max(5, Math.round(lod.radial * 0.6)),
      profile: (t) => ({ h: 0.025 * (1 - t * 0.5), w: wid * Math.sin(Math.PI * (0.2 + 0.8 * t)) * (1 - 0.35 * t), n: 2.2 }),
      region: () => region, kind: KIND.OTHER, side, capStart: 'flat', capEnd: 'flat',
    });
  };
  plate(rig.telson, AB.telson, 0.09, REGION.UROPOD, 1);
  plate(rig.uropods.L, AB.uropodL, 0.075, REGION.UROPOD, 1);
  plate(rig.uropods.R, AB.uropodR, 0.055, REGION.UROPOD, -1);
  if (lod.pleopods) {
    // unpaired left pleopods [G]
    for (let k = 2; k < 6 && k < n; k++) {
      const b = chain[k];
      const M = boneM(rig, b);
      const r = lerp(AB.radiusBase, AB.radiusEnd, (k + 0.5) / n);
      spine(acc, rig.list.indexOf(b), M, new THREE.Vector3(segLen * 0.5, -r * 0.4, r * 0.85), new THREE.Vector3(0.3, -0.6, 0.6), r * 0.75, r * 0.12, REGION.UROPOD, 1, 4);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Setae (hair) – cards (alpha strands in the shader) and, at LOD0, real geometry for the long setae
// ---------------------------------------------------------------------------------------------

class SetaAcc {
  constructor() {
    this.pos = [];
    this.si = [];
    this.sw = [];
    this.uv = [];
    this.seg = [];
    this.idx = [];
  }
  card(bi, M, base, dir, side, len, wid, seed) {
    const d = dir.clone().normalize();
    const ref = Math.abs(d.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const w = new THREE.Vector3().crossVectors(d, ref).normalize().multiplyScalar(wid * 0.5);
    const corners = [
      base.clone().sub(w), base.clone().add(w),
      base.clone().addScaledVector(d, len).sub(w), base.clone().addScaledVector(d, len).add(w),
    ];
    const uvs = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const start = this.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      _p.copy(corners[k]).applyMatrix4(M);
      this.pos.push(_p.x, _p.y, _p.z);
      this.si.push(bi, 0, 0, 0);
      this.sw.push(1, 0, 0, 0);
      this.uv.push(uvs[k][0], uvs[k][1]);
      this.seg.push(seed, len, side, 0);
    }
    this.idx.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('aPmUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSeta', new THREE.Float32BufferAttribute(this.seg, 4));
    g.setIndex(this.idx);
    // normals point along the card face; shading is mostly translucent so a constant up-normal is fine
    const n = new Float32Array(this.pos.length);
    for (let i = 0; i < n.length; i += 3) n[i + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    return g;
  }
}

/** a long seta as a thin 3-sided spike (LOD0 only) */
function longSeta(acc, bi, M, base, dir, len, rad, side) {
  spine(acc, bi, M, base, dir, len, rad, REGION.SETA, side, 3);
}

function buildSetae(rig, lod, bodyAcc) {
  if (lod.setae <= 0) return null;
  const sa = new SetaAcc();
  let seed = 1;
  const rnd = () => hash1(seed++ * 977 + 13);
  const density = lod.setae;
  const S = MORPH.walkingLegs.section;
  // walking legs: sparse long setae along dorsal and ventral margins of merus, carpus, propodus, dactylus
  for (const key of Object.keys(rig.legs)) {
    const leg = rig.legs[key];
    const segs = [
      [leg.merus, leg.len.merus, S.merus, 7], [leg.carpus, leg.len.carpus, S.carpus, 5],
      [leg.propodus, leg.len.propodus, S.propodus, 7], [leg.dactylus, leg.len.dactylus, S.dactylus, 9],
    ];
    for (const [b, L, sec, nBase] of segs) {
      const bi = rig.list.indexOf(b), M = boneM(rig, b);
      const n = Math.round(nBase * density);
      for (let k = 0; k < n; k++) {
        const t = 0.08 + 0.84 * ((k + rnd() * 0.6) / Math.max(1, n));
        const h = lerp(sec[0][0], sec[1][0], t);
        const ventral = rnd() < 0.55;
        const y = ventral ? -h * 0.9 : h * 0.9;
        const base = new THREE.Vector3(t * L, y, (rnd() - 0.5) * sec[0][1]);
        const dir = new THREE.Vector3(0.7 + rnd() * 0.5, ventral ? -0.8 : 0.8, (rnd() - 0.5) * 0.6);
        const len = 0.09 + rnd() * 0.13;
        sa.card(bi, M, base, dir, leg.side, len, 0.04, rnd());
        if (lod.longSetae && rnd() < 0.35 && bodyAcc) longSeta(bodyAcc, bi, M, base, dir, len * 1.15, 0.0035, leg.side);
      }
    }
  }
  // short fine setae all round the articles: the fuzzy outline of the legs and chelipeds in close-up
  // photos (001, 002, 021, 022); tilted distally [P]
  const fuzz = (bone, L, sec, n, side, t0 = 0.05, t1 = 0.95, taper = null) => {
    const bi = rig.list.indexOf(bone), M = boneM(rig, bone);
    for (let k = 0; k < Math.round(n * density); k++) {
      const t = t0 + (t1 - t0) * rnd();
      const f = taper ? taper(t) : t;
      const h = lerp(sec[0][0], sec[1][0], f), w = lerp(sec[0][1], sec[1][1], f);
      const th = rnd() * Math.PI * 2;
      const base = new THREE.Vector3(t * L, h * 0.93 * Math.sin(th), w * 0.93 * Math.cos(th));
      const nrm = new THREE.Vector3(0, Math.sin(th) / h, Math.cos(th) / w).normalize();
      const dir = nrm.addScaledVector(new THREE.Vector3(1, 0, 0), 0.7 + 0.6 * rnd()).normalize();
      sa.card(bi, M, base, dir, side, 0.045 + rnd() * 0.06, 0.03, rnd());
    }
  };
  for (const key of Object.keys(rig.legs)) {
    const leg = rig.legs[key];
    fuzz(leg.merus, leg.len.merus, S.merus, 22, leg.side);
    fuzz(leg.carpus, leg.len.carpus, S.carpus, 14, leg.side);
    fuzz(leg.propodus, leg.len.propodus, S.propodus, 18, leg.side);
    fuzz(leg.dactylus, leg.len.dactylus, S.dactylus, 12, leg.side, 0.04, 0.7, (t) => Math.pow(t, 1.45));
  }
  for (const side of ['L', 'R']) {
    const ch = rig.chelipeds[side];
    const C = MORPH.chelipeds[side];
    const k = side === 'R' ? 1 : 0.6;
    fuzz(ch.merus, ch.len.merus, [[C.merusSection[1] * 0.85, C.merusSection[0] * 0.8], [C.merusSection[1], C.merusSection[0]]], 16 * k, ch.side);
    fuzz(ch.carpus, ch.len.carpus, [[C.carpusSection[1] * 0.75, C.carpusSection[0] * 0.7], [C.carpusSection[1], C.carpusSection[0]]], 18 * k, ch.side);
  }
  // chelipeds: setal tufts on the palm and fingers, fringes on the carpus [D]
  for (const side of ['L', 'R']) {
    const ch = rig.chelipeds[side];
    const isMajor = side === 'R';
    const C = MORPH.chelipeds[side];
    const chelaW = (isMajor ? rig.ind.chelaRWidth : rig.ind.chelaLWidth) * 0.5;
    const chelaH = ch.len.chela * C.thicknessRatio * 0.5;
    const pb = rig.list.indexOf(ch.propodus), PM = boneM(rig, ch.propodus);
    const n = Math.round((isMajor ? 40 : 20) * density);
    for (let k = 0; k < n; k++) {
      const u = rnd();
      const v = (rnd() - 0.5) * 1.6;
      const t = u * C.palmFraction;
      const base = new THREE.Vector3(t * ch.len.chela, chelaH * 0.75 * (rnd() < 0.7 ? 1 : -1), v * chelaW * 0.7);
      sa.card(pb, PM, base, new THREE.Vector3(0.6, Math.sign(base.y), v * 0.5), ch.side, 0.08 + rnd() * 0.1, 0.05, rnd());
    }
    const db = rig.list.indexOf(ch.dactylus), DM = boneM(rig, ch.dactylus);
    for (let k = 0; k < Math.round(8 * density); k++) {
      const t = 0.1 + 0.7 * (k / 8);
      const base = new THREE.Vector3(t * ch.len.dactyl, chelaH * 0.3, 0);
      sa.card(db, DM, base, new THREE.Vector3(0.5, 1, 0.2 * ch.side), ch.side, 0.06 + rnd() * 0.05, 0.035, rnd());
      if (lod.longSetae && bodyAcc && k % 2 === 0) longSeta(bodyAcc, db, DM, base, new THREE.Vector3(0.5, 1, 0.2 * ch.side), 0.1, 0.003, ch.side);
    }
    const cb = rig.list.indexOf(ch.carpus), CM = boneM(rig, ch.carpus);
    for (let k = 0; k < Math.round(7 * density); k++) {
      const t = 0.15 + 0.8 * rnd();
      sa.card(cb, CM, new THREE.Vector3(t * ch.len.carpus, -C.carpusSection[1] * 0.85, 0), new THREE.Vector3(0.4, -1, (rnd() - 0.5) * 0.6), ch.side, 0.1 + rnd() * 0.08, 0.04, rnd());
    }
  }
  // eyestalks: sparse dorsomesial tufts of short setae [D]
  for (const side of ['L', 'R']) {
    const e = rig.eyes[side];
    const bi = rig.list.indexOf(e.stalk), M = boneM(rig, e.stalk);
    for (let k = 0; k < Math.round(4 * density); k++) {
      const t = 0.2 + 0.5 * (k / 4);
      sa.card(bi, M, new THREE.Vector3(t * MORPH.eye.length, MORPH.eye.radiusMid * 0.9, -e.side * MORPH.eye.radiusMid * 0.4), new THREE.Vector3(0.5, 1, -e.side * 0.4), e.side, 0.05, 0.03, rnd());
    }
  }
  // third maxillipeds: dense fringe of setae (feeding)
  if (lod.mouth) {
    for (const side of ['L', 'R']) {
      const mx = rig.mxp3[side];
      for (let i = 1; i < mx.chain.length; i++) {
        const b = mx.chain[i];
        const bi = rig.list.indexOf(b), M = boneM(rig, b);
        for (let k = 0; k < Math.round(4 * density); k++) {
          const t = (k + 0.5) / 4;
          sa.card(bi, M, new THREE.Vector3(t * mx.lengths[i], 0, mx.side * -0.02), new THREE.Vector3(0.3, 0.2, -mx.side), mx.side, 0.08, 0.04, rnd());
        }
      }
    }
  }
  // antennules: aesthetasc tuft on the upper flagellum
  for (const side of ['L', 'R']) {
    const a = rig.antennules[side];
    const fl = a.chain[3];
    const bi = rig.list.indexOf(fl), M = boneM(rig, fl);
    for (let k = 0; k < Math.round(5 * density); k++) {
      sa.card(bi, M, new THREE.Vector3(0.04 + k * 0.035, -0.01, 0), new THREE.Vector3(0.4, -1, 0), a.side, 0.06, 0.035, rnd());
    }
  }
  return sa.build();
}

// ---------------------------------------------------------------------------------------------
// Public: build (cached) geometries for a rig + LOD
// ---------------------------------------------------------------------------------------------

const cache = new Map();

/**
 * Body and setae geometries for a LOD tier. Geometry only depends on the rig proportions (sex and
 * chela size bucket), so it is cached and shared between individuals.
 */
export function buildBodyGeometry(rig, lodIndex) {
  const key = `${lodIndex}|${rig.ind.sex}|${rig.ind.chelaR.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lod = BODY_LOD[lodIndex];
  const acc = new Acc();
  buildCephalothorax(acc, rig, lod);
  eyes(acc, rig, lod);
  antennae(acc, rig, lod);
  if (lod.mouth) antennules(acc, rig, lod);
  else antennules(acc, rig, { ...lod, radial: 3 });
  if (lod.mouth) mouthparts(acc, rig, lod);
  cheliped(acc, rig, lod, rig.chelipeds.R, true);
  cheliped(acc, rig, lod, rig.chelipeds.L, false);
  for (const k of Object.keys(rig.legs)) walkingLeg(acc, rig, lod, rig.legs[k]);
  if (lod.p45) for (const k of Object.keys(rig.reduced)) reducedLeg(acc, rig, lod, rig.reduced[k]);
  if (lod.abdomen) abdomen(acc, rig, lod);
  const setae = buildSetae(rig, lod, lod.longSetae ? acc : null);
  const body = acc.build();
  body.userData.lod = lodIndex;
  const out = { body, setae, triangles: body.index.count / 3 + (setae ? setae.index.count / 3 : 0) };
  cache.set(key, out);
  return out;
}

/** quantise per-individual chela size so geometry can be shared (8 buckets) */
export function quantiseChela(v) {
  return Math.round(v * 8) / 8;
}
