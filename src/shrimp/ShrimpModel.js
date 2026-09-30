import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MORPH as M, TL } from './morphology.js';
import { loft, blade, bendZ, smoothTable, table, withShellAttrs, paint } from './loft.js';
import { podomere } from './geometry.js';
import {
  createCuticleMaterial,
  createTissueMaterial,
  createEyeMaterial,
  createFlagellumMaterial,
  createEggMaterial,
} from './materials.js';
import { Flagellum } from './Flagellum.js';

const T = TL; // metres per TL fraction (geometry is built at the default size; individuals scale the root)
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

let SHARED = null;
function materials() {
  if (SHARED) return SHARED;
  const C = M.colour;
  SHARED = {
    // Abdomen: turbid muscle under the cuticle -> milky grey (#7a807c over dark, #9b8f6a over white).
    abdomen: createCuticleMaterial({ key: 'abd', color: 0x9aa09b, transmission: 0.86, milk: 0.34, attenuationColor: 0xd2b878, attenuationDistance: 0.004 }),
    // Carapace: clearer, organs visible through it.
    carapace: createCuticleMaterial({ key: 'cara', color: 0xa9aca3, transmission: 0.9, milk: 0.2, attenuationColor: 0xd8c690, attenuationDistance: 0.006 }),
    rostrum: createCuticleMaterial({ key: 'ros', color: 0xcfcfc4, transmission: 0.7, milk: 0.1, thickness: 0.0006, cells: 3200, dotR: 0.34 }),
    // Legs, pleopods: milky white translucent [PHOTO 004 #babaaf].
    append: createCuticleMaterial({ key: 'app', color: 0xbdbdb2, transmission: 0.72, milk: 0.28, thickness: 0.0008, cells: 3600, keep: 0.4, relief: 0.05, sheen: 0.4 }),
    fan: createCuticleMaterial({ key: 'fan', color: 0xd8d6cc, transmission: 0.72, milk: 0.25, thickness: 0.0006, cells: 3000, keep: 0.5 }),
    stalk: createCuticleMaterial({ key: 'stalk', color: 0xcfc6b2, transmission: 0.55, milk: 0.2, thickness: 0.0008, cells: 5200, dotR: 0.38, chroma: C.eyestalkPigment }),
    eye: createEyeMaterial(),
    stomach: createTissueMaterial(C.stomach, { roughness: 0.45 }),
    hepato: createTissueMaterial(C.hepatopancreas),
    heart: createTissueMaterial(0xcdb9a4),
    ovary: createTissueMaterial(C.ovary),
    gut: createTissueMaterial(C.hindgut, { roughness: 0.5 }),
    nerve: createTissueMaterial(0x6a3422, { roughness: 0.5 }),
    statocyst: createTissueMaterial(0x2a2218),
    blue: createTissueMaterial(C.blueSpot, { roughness: 0.3 }),
    egg: createEggMaterial(),
    flag: new Map(),
  };
  return SHARED;
}
function flagMat(tint) {
  const S = materials();
  if (!S.flag.has(tint)) S.flag.set(tint, createFlagellumMaterial(tint));
  return S.flag.get(tint);
}

function joint(parent, x = 0, y = 0, z = 0, name = '') {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.name = name;
  parent.add(o);
  return o;
}
function mesh(geo, mat, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}
/** Small pointed tooth/spine along +X. */
function spine(len, r, pig = 0.8) {
  const g = new THREE.ConeGeometry(r, len, 5, 1);
  g.rotateZ(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  g.deleteAttribute('uv');
  return withShellAttrs(g, { pig });
}
function ellipsoid(rx, ry, rz, seg = 18) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, seg * 0.6));
  g.scale(rx, ry, rz);
  return g;
}
function mergeShell(geos) {
  const clean = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'aJoint', 'aPig', 'aThick'].includes(k)) n.deleteAttribute(k);
    withShellAttrs(n);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  return mergeGeometries(clean, false);
}

/**
 * Exopalaemon orientis built from traced photo morphology (morphology.js).
 * Exoskeletal units are rigid lofted meshes parented to joint transforms.
 * Frame: +X anterior, +Y dorsal, +Z left. Root = carapace/abdomen articulation.
 */
export class ShrimpModel {
  constructor({ sex = 'female', berried = false, scale = 1, blueSpots = false } = {}) {
    const S = materials();
    this.sex = sex;
    this.scale = scale;
    this.root = new THREE.Object3D();
    this.root.name = 'Shrimp';
    this.body = joint(this.root, 0, 0, 0, 'body');
    this.body.scale.setScalar(scale);
    this.lm = {};

    this.buildCephalothorax(S);
    this.buildAbdomen(S, { berried: berried && sex === 'female', blueSpots: blueSpots && sex === 'female' });
    this.buildTailFan(S);
    this.applyRestPose();
    this.root.traverse((o) => {
      o.userData.rest ??= o.rotation.clone();
    });
  }

  // ================================================================ cephalothorax
  carapaceAt(xf) {
    const st = M.carapace.stations;
    return {
      d: smoothTable(st.map((r) => [r[0], r[1]]), xf),
      v: smoothTable(st.map((r) => [r[0], r[2]]), xf),
      w: smoothTable(st.map((r) => [r[0], r[3]]), xf),
    };
  }

  buildCephalothorax(S) {
    const C = M.carapace;
    this.ceph = joint(this.body, 0, 0, 0, 'cephalothorax');
    const len = C.frontX;
    // Dotted longitudinal chromatophore line on the carapace side [PHOTO 002, 043].
    const carapaceGeo = loft({
      length: len * T,
      dir: 1,
      rings: 36,
      half: 22,
      station: (t) => {
        const c = this.carapaceAt(t * len);
        const yc = (c.d + c.v) / 2;
        return { top: ((c.d - c.v) / 2) * T, bottom: ((c.d - c.v) / 2) * T, half: c.w * T, y: yc * T, contour: C.contour };
      },
      attrs: (t, zN, yN) => {
        const line = Math.exp(-(((yN - (0.12 - 0.1 * t)) / 0.07) ** 2)) * smoothstep(0.15, 0.3, t) * (1 - smoothstep(0.85, 0.95, t)) * smoothstep(0.5, 0.8, zN);
        const dorsal = smoothstep(0.2, 0.8, yN) * 0.2;
        return {
          joint: t < 0.04 ? 1 - t / 0.04 : 0,
          pig: 0.38 + dorsal + line * 0.9 + (t > 0.9 ? 0.4 : 0),
          thick: 0.25 + 0.35 * smoothstep(-0.9, 0.2, yN),
        };
      },
      caps: [true, true],
    });
    this.carapace = mesh(carapaceGeo, S.carapace, this.ceph);

    // Anterior spines: antennal and branchiostegal.
    for (const s of [1, -1]) {
      for (const sp of [C.antennalSpine, C.branchiostegalSpine]) {
        const m = mesh(spine(sp.len * T, 0.0012 * T), S.carapace, this.ceph, false);
        m.position.set((sp.x - 0.006) * T, sp.y * T, s * sp.z * T);
        m.rotation.y = -s * 0.12;
      }
    }

    // Internal organs, seen through the carapace [PHOTO 002, 005-007, 014].
    const eyeX = C.eyeX;
    const stomach = mesh(ellipsoid(0.03 * T, 0.011 * T, 0.011 * T), S.stomach, this.ceph, false);
    stomach.position.set((eyeX - 0.06) * T, 0.022 * T, 0);
    const hep = mesh(ellipsoid(0.045 * T, 0.026 * T, 0.028 * T), S.hepato, this.ceph, false);
    hep.position.set((eyeX - 0.095) * T, 0.002 * T, 0);
    this.heart = mesh(ellipsoid(0.012 * T, 0.007 * T, 0.009 * T), S.heart, this.ceph, false);
    this.heart.position.set(0.03 * T, 0.03 * T, 0);
    if (this.sex === 'female') {
      const ov = mesh(ellipsoid(0.05 * T, 0.011 * T, 0.02 * T), S.ovary, this.ceph, false);
      ov.position.set(0.055 * T, 0.03 * T, 0);
    }

    this.buildRostrum(S);
    this.buildEyes(S);
    this.buildAntennules(S);
    this.buildAntennae(S);
    this.buildMouthparts(S);
    this.buildPereopods(S);
  }

  buildRostrum(S) {
    const R = M.rostrum;
    const C = M.carapace;
    const tipX = C.eyeX + R.tipAhead;
    const L = tipX - R.baseX;
    const base = this.carapaceAt(R.baseX);
    const y0 = base.d - 0.004; // embedded slightly into the carapace
    const geo = loft({
      length: L * T,
      dir: 1,
      rings: 60,
      half: 10,
      station: (s) => {
        const d = smoothTable(R.dorsal, s);
        const v = smoothTable(R.ventral, s);
        return {
          top: ((d - v) / 2) * T,
          bottom: ((d - v) / 2) * T,
          half: table(R.halfThick, s) * T,
          y: (y0 + (d + v) / 2) * T,
          contour: [[0, 1], [0.6, 0.85], [0.95, 0.4], [1, 0], [0.95, -0.4], [0.6, -0.85], [0, -1]],
        };
      },
      // Brown-lined rostrum [PHOTO 005-007]: pigment dense along both edges.
      attrs: (s, zN, yN) => ({ pig: 0.45 + 0.6 * smoothstep(0.55, 0.95, Math.abs(yN)), thick: 0.2 }),
    });
    const parts = [geo];
    const edge = (s, which) => (y0 + smoothTable(which === 'd' ? R.dorsal : R.ventral, s)) * T;
    for (const s of R.crestTeeth) {
      const g = spine(R.crestToothHeight * T * (s < 0.05 ? 0.7 : 1), 0.0028 * T);
      g.rotateZ(R.crestToothLean); // lean forward-up
      g.translate(s * L * T, edge(s, 'd') - 0.0015 * T, 0);
      parts.push(g);
    }
    {
      const s = R.accessoryTooth;
      const g = spine(0.004 * T, 0.001 * T);
      g.rotateZ(0.7);
      g.translate(s * L * T, edge(s, 'd') - 0.0005 * T, 0);
      parts.push(g);
    }
    for (const s of R.ventralTeeth) {
      const g = spine(R.ventralToothHeight * T, 0.0012 * T);
      g.rotateZ(-0.75);
      g.translate(s * L * T, edge(s, 'v') + 0.0005 * T, 0);
      parts.push(g);
    }
    const m = mesh(mergeShell(parts), S.rostrum, this.ceph);
    m.position.x = R.baseX * T;
    this.lm.rostrumTip = joint(m, L * T, edge(1, 'd') - 0.0005 * T, 0, 'lm_rostrumTip');
  }

  buildEyes(S) {
    const E = M.eye;
    this.eyes = [];
    for (const s of [1, -1]) {
      const e = joint(this.ceph, (M.carapace.eyeX - 0.006) * T, E.y * T, s * 0.012 * T, 'eye' + s);
      e.rotation.order = 'YZX';
      e.rotation.y = -s * E.yaw;
      e.rotation.z = E.pitch;
      // Stout eyestalk densely dotted with red-brown chromatophores [PHOTO 007].
      const stalk = loft({
        length: E.stalkLen * T,
        dir: 1,
        rings: 10,
        half: 10,
        station: (t) => ({ top: E.stalkR * T * (0.85 + 0.2 * t), bottom: E.stalkR * T * (0.85 + 0.2 * t), half: E.stalkR * T * (0.85 + 0.2 * t), y: 0, contour: [[0, 1], [0.7, 0.7], [1, 0], [0.7, -0.7], [0, -1]] }),
        attrs: (t, zN, yN) => ({ pig: 0.7 + 0.8 * smoothstep(-0.2, 0.8, yN), thick: 0.4 }),
      });
      mesh(stalk, S.stalk, e);
      const cx = (E.stalkLen + E.corneaR * 0.55) * T;
      const cornea = mesh(new THREE.SphereGeometry(E.corneaR * T, 32, 24), S.eye, e);
      cornea.position.x = cx;
      cornea.scale.set(0.95, 1, 1.02); // slightly reniform
      e.userData.base = e.rotation.clone();
      e.userData.side = s;
      this.eyes.push(e);
      if (s > 0) this.lm.eyeL = joint(e, cx, 0, 0, 'lm_eye');
    }
  }

  buildAntennules(S) {
    const A1 = M.antennule;
    const C = M.carapace;
    this.antennules = [];
    this.flagella = [];
    for (const s of [1, -1]) {
      const j = joint(this.ceph, (C.frontX - 0.004) * T, 0.014 * T, s * 0.011 * T, 'antennule' + s);
      j.rotation.order = 'YZX';
      j.rotation.set(0, s * 0.12, A1.carriagePitch * 0.35);
      let parent = j;
      A1.peduncle.forEach((l, i) => {
        const r = (0.0065 - i * 0.0012) * T;
        mesh(paint(podomere(l * T, r, r * 0.88), { pig: 0.55 }), S.append, parent);
        if (i === 0) {
          const st = mesh(spine(A1.stylocerite * T, 0.0022 * T, 0.6), S.append, j, false);
          st.position.z = s * 0.004 * T;
          st.rotation.y = -s * 0.25;
          const stat = mesh(ellipsoid(0.004 * T, 0.003 * T, 0.003 * T, 10), S.statocyst, j, false);
          stat.position.set(0.012 * T, 0.001 * T, 0);
        }
        parent = joint(parent, l * T, 0, 0);
        parent.rotation.z = i === 0 ? A1.carriagePitch * 0.4 : 0.05;
      });
      j.userData = { base: j.rotation.clone(), side: s, tip: parent };
      this.antennules.push(j);
      for (const F of A1.flagella) {
        const a = joint(parent, 0, 0, 0);
        a.rotation.order = 'YZX';
        a.rotation.set(0, -s * F.yaw, F.pitch * 0.3);
        const f = new Flagellum({
          length: F.len * T * this.scale,
          nodes: F.len > 0.4 ? 16 : 8,
          rootRadius: 0.0022 * T * this.scale,
          tipRadius: 0.0005 * T * this.scale,
          material: flagMat(F.tint),
          stiffness: 0.45,
        });
        f.anchor = a;
        this.flagella.push(f);
      }
    }
  }

  buildAntennae(S) {
    const A2 = M.antenna;
    const Sc = A2.scaphocerite;
    const C = M.carapace;
    this.antennae = [];
    for (const s of [1, -1]) {
      const j = joint(this.ceph, (C.frontX - 0.012) * T, -0.004 * T, s * 0.02 * T, 'antenna' + s);
      j.rotation.order = 'YZX';
      j.rotation.set(0, -s * Sc.divergence, Sc.tilt);
      // Scaphocerite: lanceolate blade, thickened lateral margin with a brown line ending in a
      // distolateral tooth [PHOTO 007 + LIT].
      const sg = blade({
        len: Sc.len * T,
        width: (t) => Sc.half * T * (t < 0.7 ? 0.75 + 0.35 * t : Math.sqrt(Math.max(0, 1 - ((t - 0.7) / 0.3) ** 2)) * 1.0),
        thick: (t) => 0.0012 * T * (1 - 0.6 * t),
        offset: (t) => -Sc.half * T * 0.25 * t,
        // built for the left side (lateral = +Z): brown line along the thickened lateral margin
        attrs: (t, zN, yN, side) => ({ pig: 0.3 + (side > 0 && zN > 0.72 ? 1.3 : 0), thick: 0.15 }),
      });
      if (s < 0) {
        sg.scale(1, 1, -1);
        sg.index.array.reverse();
        sg.computeVertexNormals();
      }
      const sc = mesh(sg, S.fan, j);
      sc.position.z = s * 0.004 * T;
      const tooth = mesh(spine(0.012 * T, 0.0018 * T, 1.2), S.fan, j, false);
      tooth.position.set(Sc.len * 0.86 * T, 0, s * (Sc.half * 0.95 + 0.004) * T);
      tooth.rotation.y = -s * 0.05;
      // Peduncle (basicerite/carpocerite) under the scale.
      const pl = 0.07;
      mesh(paint(podomere(pl * T, 0.006 * T, 0.0045 * T), { pig: 0.6 }), S.append, j).position.y = -0.004 * T;
      const tip = joint(j, pl * T, -0.004 * T, 0);
      tip.rotation.order = 'YZX';
      tip.rotation.set(0, -s * 0.25, 0.1);
      j.userData = { base: j.rotation.clone(), side: s, tip };
      this.antennae.push(j);
      const f = new Flagellum({
        length: A2.flagellumLen * T * this.scale,
        nodes: 30,
        rootRadius: 0.0035 * T * this.scale,
        tipRadius: 0.0006 * T * this.scale,
        material: flagMat(0xd6d1c4),
        stiffness: 0.55,
      });
      f.anchor = tip;
      f.isAntenna = true;
      this.flagella.push(f);
    }
  }

  buildMouthparts(S) {
    const X = M.maxilliped3;
    const C = M.carapace;
    this.mxp = [];
    for (const s of [1, -1]) {
      const c = this.carapaceAt(0.165);
      const j = joint(this.ceph, 0.165 * T, (c.v + 0.004) * T, s * 0.01 * T, 'mxp3' + s);
      j.rotation.order = 'YZX';
      j.rotation.set(0, -s * 0.12, -0.35);
      const chain = [j];
      let p = j;
      X.segs.forEach((l, i) => {
        const r = X.r * T * (1 - i * 0.18);
        mesh(podomere(l * T, r, r * 0.85), S.append, p);
        p = joint(p, l * T, 0, 0);
        p.rotation.z = 0.25;
        chain.push(p);
      });
      j.userData = { base: j.rotation.clone(), chain };
      this.mxp.push(j);
    }
    // Scaphognathites (constantly beating inside the gill chamber; visible through the carapace).
    this.maxillae = [];
    for (const s of [1, -1]) {
      const j = joint(this.ceph, (C.eyeX - 0.03) * T, -0.004 * T, s * 0.03 * T);
      const g = blade({ len: 0.03 * T, width: (t) => 0.007 * T * Math.sin(Math.PI * Math.max(0.05, t)), thick: () => 0.0005 * T, flat: false });
      mesh(g, S.append, j, false);
      j.rotation.z = -1.3;
      this.maxillae.push(j);
    }
  }

  buildPereopods(S) {
    this.chelipeds = [];
    this.walkLegs = [];
    M.pereopods.forEach((P, pi) => {
      const c = this.carapaceAt(P.x);
      for (const s of [1, -1]) {
        const hipPos = new THREE.Vector3(P.x * T, (c.v + 0.006) * T, s * c.w * 0.42 * T);
        const coxa = joint(this.ceph, hipPos.x, hipPos.y, hipPos.z, `${P.name}${s > 0 ? 'L' : 'R'}`);
        const r = P.r * T;
        mesh(withShellAttrs(ellipsoid(r * 1.4, r * 1.2, r * 1.2, 10)), S.append, coxa, false);
        const hip = joint(coxa, 0, 0, 0);
        hip.rotation.order = 'YZX';
        const [li, lm, lc, lp, ld] = P.segs.map((v) => v * T);
        const L1 = li + lm;
        mesh(podomere(li, r * 0.9, r), S.append, hip);
        const isj = joint(hip, li, 0, 0);
        mesh(podomere(lm, r, r * 0.95), S.append, isj);
        const knee = joint(hip, L1, 0, 0);
        mesh(podomere(lc, r * 0.85, r * 0.78), S.append, knee);
        const wrist = joint(knee, lc, 0, 0);
        const leg = { P: { ...P, name: P.name }, side: s, coxa, hip, knee, wrist, L1, hipPos, index: pi };
        if (P.chela) {
          const palmR = r * (P.name === 'P2' ? 1.15 : 1.0);
          mesh(podomere(lp, r * 0.8, palmR), S.append, wrist);
          const fixed = mesh(podomere(ld, palmR * 0.5, palmR * 0.08, 6), S.append, wrist);
          fixed.position.set(lp, -palmR * 0.3, 0);
          const dact = joint(wrist, lp, palmR * 0.3, 0);
          mesh(podomere(ld, palmR * 0.5, palmR * 0.08, 6), S.append, dact);
          leg.dactyl = dact;
          leg.L2 = lc + lp + ld;
          hip.rotation.set(0, -s * 0.4, -0.9, 'YZX');
          knee.rotation.z = 1.2;
          this.chelipeds.push(leg);
        } else {
          mesh(podomere(lp, r * 0.75, r * 0.55), S.append, wrist);
          const dact = joint(wrist, lp, 0, 0);
          mesh(podomere(ld, r * 0.5, r * 0.07, 6), S.append, dact);
          leg.dactyl = dact;
          leg.L2 = lc + lp + ld;
          this.walkLegs.push(leg);
        }
      }
    });
  }

  // ================================================================ abdomen
  buildAbdomen(S, { berried, blueSpots }) {
    const A = M.abdomen;
    this.abd = [];
    let parent = this.body;
    let x = 0;
    for (let i = 0; i < 6; i++) {
      const s = A[i];
      const j = joint(parent, x, 0, 0, 'abd' + (i + 1));
      const len = s.len * T;
      const ov = i === 1 ? 0.3 : 0.16; // anterior articular part tucked under the previous tergite
      const contour = i === 5 ? M.somite6Contour : M.somiteContour;
      const oh = i === 5 ? 0.0 : 0.07; // posterior tergite margin overhangs the next somite
      const geo = loft({
        length: len * (1 + ov + oh),
        dir: -1,
        rings: 30,
        half: 22,
        station: (t) => {
          const u = t * (1 + ov + oh) - ov; // <0 = hidden articular part, >1 = overhanging margin
          const uc = clamp01(u);
          const h = THREE.MathUtils.lerp(s.h0, s.h1, uc) * T;
          const w = THREE.MathUtils.lerp(s.w0, s.w1, uc) * T;
          const hump = s.hump ? 1 + s.hump * Math.sin(Math.PI * uc) : 1;
          // Pleural lobe: ventral margin deepest mid-somite; the s2 pleuron also extends forward.
          const lobe = s.pleuron > 0 ? 0.86 + 0.14 * s.pleuron * Math.sin(Math.PI * clamp01(u * 0.9 + 0.1)) : 1;
          let top = (h / 2) * hump;
          let bottom = (h / 2) * lobe;
          let half = w;
          if (u < 0) {
            const k = -u / ov; // 0 at the joint, 1 at the front of the hidden part
            top *= 0.93 - 0.1 * k;
            bottom *= (i === 1 ? 0.97 : 0.9) - 0.12 * k;
            half *= 0.95 - 0.06 * k;
          } else if (u > 1) {
            top *= 1.006;
            half *= 1.006;
          }
          return { top, bottom, half, y: 0, contour };
        },
        caps: [false, i === 5],
        attrs: (t, zN, yN) => {
          const u = t * (1 + ov + oh) - ov;
          const band = smoothstep(0.8, 0.97, u) * (1 - smoothstep(1.03, 1.07, u)); // posterior-margin band
          const ventralLine = smoothstep(-0.8, -0.95, yN) * 0.35;
          return {
            joint: u < 0.02 ? clamp01(-u / ov + 0.5) : 0,
            pig: 0.42 + 0.2 * smoothstep(0.3, 0.9, yN) + band * 0.75 + ventralLine,
            thick: 0.35 + 0.65 * smoothstep(-0.95, -0.2, yN) * smoothstep(1.02, 0.6, Math.abs(yN) + 0.1),
          };
        },
      });
      const seg = mesh(geo, S.abdomen, j);
      seg.userData.somite = i;
      // Internal: dorsal hindgut line [PHOTO 005-007] and ventral nerve cord [PHOTO 001, 003].
      const h = ((s.h0 + s.h1) / 2) * T;
      const gut = mesh(new THREE.CylinderGeometry(0.0022 * T, 0.0022 * T, len * 1.08, 6), S.gut, j, false);
      gut.rotation.z = Math.PI / 2;
      gut.position.set(-len * 0.5, h * 0.33, 0);
      if (i < 5) {
        const nerve = mesh(new THREE.CylinderGeometry(0.0016 * T, 0.0016 * T, len * 1.05, 5), S.nerve, j, false);
        nerve.rotation.z = Math.PI / 2;
        nerve.position.set(-len * 0.5, -h * 0.26, 0);
      }
      if (blueSpots && i >= 1 && i <= 3) {
        for (const sd of [1, -1]) {
          const b = mesh(ellipsoid(0.009 * T, 0.009 * T, 0.004 * T, 10), S.blue, j, false);
          b.position.set(-len * 0.5, -h * 0.22, sd * s.w1 * T * 0.82);
        }
      }
      if (i < 5) j.userData.pleopods = this.buildPleopodPair(S, j, s, len, i);
      if (i === 2) this.lm.s3Dorsal = joint(j, -len * 0.5, (s.h1 / 2) * (1 + (s.hump ?? 0)) * T, 0, 'lm_s3');
      this.abd.push(j);
      parent = j;
      x = -len;
    }
    this.pleopods = this.abd.slice(0, 5).map((j) => j.userData.pleopods);
    this.lm.carapacePost = joint(this.body, 0, M.carapace.stations[0][1] * T, 0, 'lm_cpost');

    if (berried) {
      const eggGeo = new THREE.SphereGeometry(0.0075 * T, 8, 6);
      eggGeo.scale(1.2, 1, 1);
      for (let si = 0; si < 4; si++) {
        const s = A[si];
        const count = 60;
        const inst = new THREE.InstancedMesh(eggGeo, S.egg, count);
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const one = new THREE.Vector3(1, 1, 1);
        for (let k = 0; k < count; k++) {
          const p = new THREE.Vector3(-s.len * T * (0.05 + 0.9 * Math.random()), -s.h1 * T * (0.4 + Math.random() * 0.35), (Math.random() * 2 - 1) * s.w1 * T * 0.55);
          q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0));
          inst.setMatrixAt(k, m4.compose(p, q, one));
        }
        inst.castShadow = true;
        this.abd[si].add(inst);
      }
    }
  }

  buildPleopodPair(S, j, s, len, i) {
    const P = M.pleopod;
    const pairs = [];
    const h = s.h1 * T;
    const scale = i === 0 ? 0.85 : 1;
    for (const sd of [1, -1]) {
      const pj = joint(j, -len * 0.5, -h * 0.29, sd * s.w1 * T * 0.3, `pleopod${i + 1}${sd > 0 ? 'L' : 'R'}`);
      pj.rotation.x = sd * 0.12;
      // Stout cylindrical protopod hanging down, with a few chromatophores at its base [PHOTO 004, 017].
      const pl = P.protopod * T * scale;
      const proto = withShellAttrs(podomere(pl, P.protoR * T, P.protoR * T * 0.8));
      const pa = proto.attributes.aPig;
      const pp = proto.attributes.position;
      for (let k = 0; k < pa.count; k++) pa.setX(k, 0.9 * (1 - pp.getX(k) / pl));
      mesh(proto, S.append, pj).rotation.z = -Math.PI / 2;
      const fork = joint(pj, 0, -pl, 0);
      const rami = [];
      for (const r of [1, -1]) {
        const ramus = joint(fork, 0, 0, 0);
        const rl = P.ramus * T * scale * (r > 0 ? 1 : 0.92);
        // Narrow lanceolate lamella tapering to a point, distal half curving backward.
        const g = blade({
          len: rl,
          width: (t) => P.ramusHalf * T * (t < P.ramusMaxAt ? 0.55 + (0.45 * t) / P.ramusMaxAt : Math.pow((1 - t) / (1 - P.ramusMaxAt), 0.8)),
          thick: () => 0.0009 * T,
          attrs: () => ({ pig: 0.15, thick: 0.3 }),
          flat: false,
        });
        bendZ(g, rl, -P.curl, 2);
        const m = mesh(g, S.append, ramus, false);
        m.rotation.z = -Math.PI / 2; // hang down
        ramus.rotation.z = P.ramusBack - P.restBack;
        ramus.userData.r = r;
        rami.push(ramus);
      }
      pj.rotation.z = P.restBack;
      pairs.push({ joint: pj, fork, rami, side: sd });
    }
    return pairs;
  }

  // ================================================================ tail fan
  buildTailFan(S) {
    const Tn = M.telson;
    const U = M.uropod;
    const last = this.abd[5];
    const lastLen = M.abdomen[5].len * T;
    this.telson = joint(last, -lastLen, 0, 0, 'telson');
    const tl = Tn.len * T;
    const telGeo = loft({
      length: tl,
      dir: -1,
      rings: 24,
      half: 12,
      station: (t) => {
        const w = THREE.MathUtils.lerp(Tn.baseHalf, Tn.tipHalf, Math.pow(t, 0.85)) * T;
        return { top: w * 0.55, bottom: w * 0.3, half: w, y: -0.004 * T * t, contour: [[0, 1], [0.6, 0.8], [1, 0.1], [0.8, -0.7], [0, -1]] };
      },
      attrs: (t) => ({ joint: t < 0.05 ? 1 : 0, pig: 0.45, thick: 0.4 }),
    });
    mesh(telGeo, S.fan, this.telson);
    // Two pairs of dorsal spines + posterior spines flanking the acute tip.
    for (const sd of [1, -1]) {
      for (const f of Tn.dorsalSpines) {
        const w = THREE.MathUtils.lerp(Tn.baseHalf, Tn.tipHalf, f) * T;
        const sp = mesh(spine(0.006 * T, 0.0012 * T), S.fan, this.telson, false);
        sp.position.set(-tl * f, w * 0.45, sd * w * 0.6);
        sp.rotation.set(0, Math.PI, 0.35);
      }
      const ps = mesh(spine(0.012 * T, 0.001 * T), S.fan, this.telson, false);
      ps.position.set(-tl * 0.98, -0.004 * T, sd * 0.0025 * T);
      ps.rotation.set(0, Math.PI - sd * 0.12, 0);
    }
    this.lm.telsonTip = joint(this.telson, -tl, -0.004 * T, 0, 'lm_telsonTip');

    this.uropods = [];
    for (const sd of [1, -1]) {
      const u = joint(last, -lastLen * 0.97, -M.abdomen[5].h1 * T * 0.15, sd * M.abdomen[5].w1 * T * 0.55, 'uropod' + sd);
      u.rotation.order = 'YXZ'; // roll about the blade axis, then spread
      u.userData.side = sd;
      // protopod
      mesh(withShellAttrs(ellipsoid(0.012 * T, 0.006 * T, 0.008 * T, 10), { pig: 1.0 }), S.fan, u, false).position.x = -0.006 * T;
      for (const [key, R, lateralOffset] of [['exo', U.exo, 1], ['endo', U.endo, -1]]) {
        const rj = joint(u, -0.01 * T, key === 'exo' ? 0.0 : -0.0015 * T, lateralOffset * sd * 0.006 * T);
        const len = R.len * T;
        const g = blade({
          len,
          width: (t) => R.maxHalf * T * (t < R.at ? 0.55 + (0.45 * t) / R.at : Math.sqrt(Math.max(0, 1 - ((t - R.at) / (1 - R.at)) ** 2.2))),
          thick: (t) => 0.0011 * T * (1 - 0.6 * t),
          // exopod lateral margin straighter than the medial one
          // (built pointing +X, then turned 180 deg about Y, which mirrors Z: negative here = lateral)
          offset: (t) => -(key === 'exo' ? 1 : -0.4) * R.maxHalf * T * 0.3 * Math.sin(Math.PI * t),
          attrs: (t, zN) => {
            // Dark mark at the base/diaeresis [PHOTO 004, 009], denser dots at the margins.
            const mark = Math.exp(-(((t - 0.12) / 0.07) ** 2)) * smoothstep(0.2, 0.6, zN) * 1.1;
            return { pig: 0.35 + 0.35 * smoothstep(0.7, 1.0, zN) + mark, thick: 0.2 };
          },
        });
        g.rotateY(Math.PI); // point backward (-X)
        if (sd < 0) {
          g.scale(1, 1, -1);
          g.index.array.reverse();
          g.computeVertexNormals();
        }
        mesh(g, S.fan, rj);
        if (key === 'exo') {
          const tooth = mesh(spine(0.006 * T, 0.0012 * T), S.fan, rj, false);
          tooth.position.set(-len * R.toothAt, 0, sd * R.maxHalf * T * 0.95);
          tooth.rotation.y = Math.PI + sd * 0.15;
          const mv = mesh(spine(0.009 * T, 0.0007 * T), S.fan, rj, false); // movable spine
          mv.position.set(-len * (R.toothAt - 0.01), 0, sd * R.maxHalf * T * 0.8);
          mv.rotation.y = Math.PI + sd * 0.05;
          if (sd > 0) this.lm.uropodTip = joint(rj, -len, 0, 0, 'lm_uropodTip');
        }
        rj.userData.base = -sd * (key === 'exo' ? 0.22 : 0.1);
        rj.rotation.y = rj.userData.base;
        rj.userData.ramus = key;
        u.userData[key] = rj;
      }
      this.uropods.push(u);
    }
  }

  // ================================================================ pose & utilities
  applyRestPose() {
    const R = M.rest;
    this.abd.forEach((j, i) => (j.rotation.z = R.joints[i]));
    this.telson.rotation.z = R.telson;
    for (const u of this.uropods) {
      u.rotation.y = -u.userData.side * (0.1 + R.fanSpread * 0.6);
      u.rotation.x = u.userData.side * R.fanRoll;
    }
    this.poseStanding();
  }

  /** Solve a walking leg to a foot target given in cephalothorax space (knee splayed outward-up). */
  solveLegIK(leg, local) {
    const v = local.clone().sub(leg.coxa.position);
    const L1 = leg.L1;
    const L2 = leg.L2;
    const D = THREE.MathUtils.clamp(v.length(), Math.abs(L1 - L2) + 1e-6, L1 + L2 - 1e-6);
    const u = v.clone().normalize();
    const alpha = Math.acos(THREE.MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const beta = Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    const hint = new THREE.Vector3(0, 0.35, leg.side);
    hint.addScaledVector(u, -hint.dot(u)).normalize();
    const knee = u.clone().multiplyScalar(L1 * Math.cos(alpha)).addScaledVector(hint, L1 * Math.sin(alpha));
    const yaw = Math.atan2(-knee.z, knee.x);
    const pitch = Math.atan2(knee.y, Math.hypot(knee.x, knee.z));
    leg.hip.rotation.set(0, yaw, pitch, 'YZX');
    const q = new THREE.Quaternion().setFromEuler(leg.hip.rotation);
    const Y0 = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const Z0 = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const X0 = knee.clone().normalize();
    const perp = v.clone().sub(knee);
    perp.addScaledVector(X0, -perp.dot(X0)).normalize();
    leg.hip.rotation.set(Math.atan2(-perp.dot(Z0), -perp.dot(Y0)), yaw, pitch, 'YZX');
    leg.knee.rotation.set(0, 0, -(Math.PI - beta));
    leg.wrist.rotation.set(0, 0, 0);
    leg.dactyl.rotation.set(0, 0, -0.25);
  }

  /** Standing pose on flat ground (used by the validation renders; the game drives feet by IK). */
  poseStanding() {
    const groundY = -(M.carapace.stations[0][1] + M.rest.standClearance) * T;
    const foot = { P3: [-0.01, 0.13], P4: [-0.05, 0.145], P5: [-0.09, 0.14] }; // feet behind the coxae [PHOTO 001]
    for (const leg of this.walkLegs) {
      const [dx, lat] = foot[leg.P.name];
      this.solveLegIK(leg, new THREE.Vector3(leg.hipPos.x + dx * T, groundY, leg.side * lat * T));
    }
    for (const c of this.chelipeds) {
      const s = c.side;
      if (c.P.name === 'P2') {
        c.hip.rotation.set(0, -s * 0.18, -0.42, 'YZX');
        c.knee.rotation.z = 0.38;
        c.wrist.rotation.z = 0.05;
      } else {
        c.hip.rotation.set(0, -s * 0.3, -0.75, 'YZX');
        c.knee.rotation.z = 1.35;
        c.wrist.rotation.z = 0.35;
      }
    }
  }

  /** World-space landmark positions (for validation overlays). */
  landmarks() {
    this.root.updateMatrixWorld(true);
    const out = {};
    for (const [k, o] of Object.entries(this.lm)) out[k] = o.getWorldPosition(new THREE.Vector3());
    return out;
  }

  addFlagellaTo(scene) {
    for (const f of this.flagella) scene.add(f.mesh);
  }

  removeFrom(scene) {
    scene.remove(this.root);
    for (const f of this.flagella) scene.remove(f.mesh);
  }
}
