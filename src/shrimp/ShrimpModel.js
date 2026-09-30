import * as THREE from 'three';
import { ANATOMY as A } from './anatomy.js';
import { shellTube, podomere, plate, ellipseOutline, rostrumGeometry } from './geometry.js';
import { createShellMaterial, createTissueMaterial, createEyeMaterial, createAppendageMaterial, createEggMaterial } from './materials.js';
import { Flagellum } from './Flagellum.js';

// Shared materials across individuals (one program each).
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    shell: createShellMaterial({ key: 'body' }),
    shellThin: createShellMaterial({ key: 'thin', transmission: 0.8, thickness: 0.0006, chromaDensity: 1400, chromaExpand: 0.16 }),
    append: createAppendageMaterial(),
    muscle: createTissueMaterial(0xc9c2b6, { striated: true, glow: 0.05 }),
    rostrum: createShellMaterial({ key: 'rostrum', transmission: 0.55, thickness: 0.0008, chromaDensity: 1600 }),
    gut: createTissueMaterial(0x4a3524, { roughness: 0.5 }),
    hepato: createTissueMaterial(0xa7793e, { roughness: 0.55 }),
    heart: createTissueMaterial(0xd9b8a0),
    ovary: createTissueMaterial(0x7e8f3a),
    eye: createEyeMaterial(),
    eyestalk: createTissueMaterial(0xcfc4b0),
    chromaDot: new THREE.MeshBasicMaterial({ color: 0x5a2413 }),
    egg: createEggMaterial(),
    flag: new THREE.MeshStandardMaterial({ color: 0xcdc5b4, roughness: 0.4 }),
  };
  return SHARED;
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

/**
 * Anatomically segmented rigged shrimp. Exoskeletal segments are rigid meshes
 * parented to joint transforms (arthropod cuticle is rigid between articulations,
 * so rigid parenting is more faithful than smooth skinning).
 *
 * Frame: +X anterior, +Y dorsal, +Z left. Root origin = carapace/abdomen articulation.
 */
export class ShrimpModel {
  constructor({ sex = 'female', berried = false, scale = 1 } = {}) {
    const M = shared();
    this.sex = sex;
    this.root = new THREE.Object3D();
    this.root.name = 'Shrimp';
    this.body = joint(this.root, 0, 0, 0, 'body'); // local pose offsets (startle twitch)
    this.body.scale.setScalar(scale);
    this.scale = scale;

    const C = A.carapace;
    const cl = C.length;
    // ---------- Cephalothorax ----------
    this.ceph = joint(this.body, 0, 0, 0, 'cephalothorax');
    const carapaceGeo = shellTube(cl, +1, (t) => {
      const bulge = Math.sin(Math.PI * (0.15 + 0.8 * t));
      const front = t > 0.8 ? 1 - (t - 0.8) * 2.2 : 1;
      return {
        top: C.height * 0.5 * (0.75 + 0.25 * bulge) * front,
        bottom: C.height * 0.5 * (0.8 + 0.2 * bulge) * front,
        width: C.width * 0.5 * (0.8 + 0.2 * bulge) * Math.max(0.45, front),
        y: C.height * 0.02,
      };
    }, { rings: 22, radial: 32, jointEnds: [true, false], jointWidth: 0.06 });
    this.carapace = mesh(carapaceGeo, M.shell, this.ceph);

    // Internal organs (visible through transmissive cuticle) [R]
    const hepGeo = new THREE.SphereGeometry(1, 20, 14);
    const hep = mesh(hepGeo, M.hepato, this.ceph, false);
    hep.scale.set(cl * 0.28, C.height * 0.24, C.width * 0.3);
    hep.position.set(cl * 0.45, -C.height * 0.02, 0);
    const stomach = mesh(hepGeo, M.gut, this.ceph, false);
    stomach.scale.set(cl * 0.14, C.height * 0.12, C.width * 0.14);
    stomach.position.set(cl * 0.72, C.height * 0.12, 0);
    const heart = mesh(hepGeo, M.heart, this.ceph, false);
    heart.scale.set(cl * 0.1, C.height * 0.07, C.width * 0.1);
    heart.position.set(cl * 0.18, C.height * 0.3, 0);
    this.heart = heart;
    if (sex === 'female') {
      const ov = mesh(hepGeo, M.ovary, this.ceph, false);
      ov.scale.set(cl * 0.36, C.height * 0.09, C.width * 0.16);
      ov.position.set(cl * 0.35, C.height * 0.24, 0);
    }
    const thoraxMuscle = mesh(hepGeo, M.muscle, this.ceph, false);
    thoraxMuscle.scale.set(cl * 0.3, C.height * 0.2, C.width * 0.28);
    thoraxMuscle.position.set(cl * 0.12, -C.height * 0.12, 0);

    // Rostrum
    const rostrum = mesh(rostrumGeometry(A.rostrum), M.rostrum, this.ceph);
    rostrum.position.set(cl * 0.72, C.height * 0.3, 0);
    rostrum.rotation.z = 0.06;

    // Carapace spines: antennal + branchiostegal [R]
    const spineGeo = podomere(cl * 0.08, C.width * 0.03, C.width * 0.004, 5);
    for (const s of [1, -1]) {
      for (const [y, x] of [[0.12, 0.95], [-0.18, 0.93]]) {
        const sp = mesh(spineGeo, M.shell, this.ceph);
        sp.position.set(cl * x, C.height * y, s * C.width * 0.33);
        sp.rotation.y = -s * 0.15;
      }
    }

    // ---------- Eyes ----------
    this.eyes = [];
    for (const s of [1, -1]) {
      const e = joint(this.ceph, cl * 0.9, C.height * 0.22, s * C.width * 0.12, 'eye' + s);
      e.rotation.y = s * A.eye.spreadYaw;
      mesh(podomere(A.eye.stalkLength, A.eye.corneaRadius * 0.7, A.eye.corneaRadius * 0.8), M.eyestalk, e);
      const cornea = mesh(new THREE.SphereGeometry(A.eye.corneaRadius, 20, 14), M.eye, e);
      cornea.position.x = A.eye.stalkLength + A.eye.corneaRadius * 0.4;
      cornea.scale.set(1.1, 1, 1);
      e.userData.base = e.rotation.clone();
      e.userData.side = s;
      this.eyes.push(e);
    }

    // ---------- Antennules (1st antennae): 3-article peduncle + 2 flagella ----------
    this.antennules = [];
    this.flagella = [];
    for (const s of [1, -1]) {
      const j = joint(this.ceph, cl * 0.95, C.height * 0.08, s * C.width * 0.1, 'antennule' + s);
      j.rotation.set(0, s * 0.25, 0.25);
      let parent = j;
      const pl = A.antennule.peduncleLength;
      const art = [0.45, 0.3, 0.25];
      let ends = [];
      art.forEach((f, i) => {
        mesh(podomere(pl * f, C.width * (0.07 - i * 0.015), C.width * (0.06 - i * 0.015)), M.shellThin, parent);
        parent = joint(parent, pl * f, 0, 0);
        if (i === 0) {
          // stylocerite
          const st = mesh(podomere(pl * 0.3, C.width * 0.025, C.width * 0.004, 4), M.shellThin, j);
          st.rotation.y = s * 0.3;
        }
      });
      ends.push(parent);
      j.userData = { base: j.rotation.clone(), side: s, tip: parent };
      this.antennules.push(j);
      for (const [len, yaw] of [[1, 0.1], [0.55, -0.35]]) {
        const tipMarker = joint(parent, 0, 0, 0);
        tipMarker.rotation.y = s * yaw;
        tipMarker.rotation.z = yaw * 0.6;
        const f = new Flagellum({
          length: A.antennule.flagellumLength * len * this.scale,
          nodes: A.antennule.nodes,
          rootRadius: 0.00022 * this.scale,
          tipRadius: 0.00005 * this.scale,
          material: M.flag,
          stiffness: 0.42,
        });
        f.anchor = tipMarker;
        this.flagella.push(f);
      }
    }

    // ---------- Antennae (2nd): scaphocerite + long flagellum ----------
    this.antennae = [];
    for (const s of [1, -1]) {
      const j = joint(this.ceph, cl * 0.9, -C.height * 0.08, s * C.width * 0.22, 'antenna' + s);
      j.rotation.set(0, s * 0.35, 0.05);
      const scaph = mesh(plate(ellipseOutline(A.antenna.scaphoceriteLength, C.width * 0.11, 18, -0.6), C.width * 0.02), M.shellThin, j);
      scaph.rotation.x = Math.PI / 2 - s * 0.2;
      scaph.position.z = s * C.width * 0.05;
      const ped = mesh(podomere(A.antenna.scaphoceriteLength * 0.55, C.width * 0.07, C.width * 0.045), M.shellThin, j);
      ped.position.y = -C.width * 0.03;
      const tip = joint(j, A.antenna.scaphoceriteLength * 0.55, -C.width * 0.03, 0);
      tip.rotation.set(0, s * 0.35, 0.05);
      j.userData = { base: j.rotation.clone(), side: s, tip };
      this.antennae.push(j);
      const f = new Flagellum({
        length: A.antenna.flagellumLength * this.scale,
        nodes: A.antenna.nodes,
        rootRadius: 0.00035 * this.scale,
        tipRadius: 0.00005 * this.scale,
        material: M.flag,
        stiffness: 0.55,
      });
      f.anchor = tip;
      f.isAntenna = true;
      this.flagella.push(f);
    }

    // ---------- Mouthparts: 3rd maxillipeds + fluttering maxillae ----------
    this.mxp = [];
    for (const s of [1, -1]) {
      const j = joint(this.ceph, cl * 0.82, -C.height * 0.38, s * C.width * 0.12, 'mxp3' + s);
      j.rotation.set(0, s * 0.15, -0.55);
      const segs = [0.09, 0.06, 0.05].map((f) => f * A.totalLength);
      const chain = [j];
      let p = j;
      segs.forEach((l, i) => {
        mesh(podomere(l, C.width * (0.04 - i * 0.01), C.width * (0.032 - i * 0.01)), M.append, p);
        p = joint(p, l, 0, 0);
        p.rotation.z = 0.35;
        chain.push(p);
      });
      j.userData = { base: j.rotation.clone(), chain };
      this.mxp.push(j);
    }
    this.maxillae = [];
    for (const s of [1, -1]) {
      const j = joint(this.ceph, cl * 0.78, -C.height * 0.42, s * C.width * 0.06);
      const m = mesh(plate(ellipseOutline(cl * 0.12, cl * 0.03, 12), cl * 0.006), M.append, j, false);
      m.rotation.x = Math.PI / 2;
      j.rotation.z = -1.3;
      this.maxillae.push(j);
    }

    // ---------- Pereopods ----------
    this.chelipeds = [];
    this.walkLegs = [];
    A.pereopods.forEach((P, pi) => {
      for (const s of [1, -1]) {
        const hipPos = new THREE.Vector3(cl * (1 - P.attachX), -C.height * 0.42, s * C.width * 0.28);
        const coxa = joint(this.ceph, hipPos.x, hipPos.y, hipPos.z, `${P.name}${s > 0 ? 'L' : 'R'}`);
        mesh(new THREE.SphereGeometry(P.r * 1.3, 8, 6), M.append, coxa, false);
        const hip = joint(coxa, 0, 0, 0);
        hip.rotation.order = 'YZX';
        const [lm, lc, lp, ld] = P.segs;
        const li = lm * 0.35; // ischium
        const L1 = li + lm;
        // ischium + merus
        mesh(podomere(li, P.r * 0.9, P.r), M.append, hip);
        const isj = joint(hip, li, 0, 0);
        mesh(podomere(lm, P.r, P.r * 0.95), M.append, isj);
        const knee = joint(hip, L1, 0, 0);
        mesh(new THREE.SphereGeometry(P.r * 0.9, 7, 5), M.append, knee, false); // articulation membrane
        mesh(podomere(lc, P.r * 0.85, P.r * 0.8), M.append, knee);
        const wrist = joint(knee, lc, 0, 0);
        const leg = { P, side: s, coxa, hip, knee, wrist, L1, hipPos, index: pi };
        if (P.chela) {
          // Chela: palm (propodus) + fixed finger + movable dactyl.
          const palmR = P.r * (pi === 1 ? 1.5 : 1.1);
          mesh(podomere(lp, P.r * 0.85, palmR), M.append, wrist);
          const fixedF = mesh(podomere(ld, palmR * 0.45, palmR * 0.08, 5), M.append, wrist);
          fixedF.position.set(lp, -palmR * 0.35, 0);
          const dact = joint(wrist, lp, palmR * 0.35, 0);
          mesh(podomere(ld, palmR * 0.45, palmR * 0.08, 5), M.append, dact);
          leg.dactyl = dact;
          leg.L2 = lc + lp + ld;
          hip.rotation.set(0, s * -1.2, -0.2);
          knee.rotation.z = -2.2;
          wrist.rotation.z = 0.4;
          this.chelipeds.push(leg);
        } else {
          mesh(podomere(lp, P.r * 0.8, P.r * 0.6), M.append, wrist);
          const dact = joint(wrist, lp, 0, 0);
          mesh(podomere(ld, P.r * 0.55, P.r * 0.08, 5), M.append, dact);
          leg.dactyl = dact;
          leg.L2 = lc + lp + ld;
          this.walkLegs.push(leg);
        }
      }
    });

    // ---------- Abdomen ----------
    const Ab = A.abdomen;
    this.abd = [];
    let parent = this.body;
    let x = 0;
    for (let i = 0; i < 6; i++) {
      const len = Ab.lengths[i];
      const j = joint(parent, x, i === 0 ? C.height * 0.02 : 0, 0, 'abd' + (i + 1));
      const h0 = Ab.heights[Math.max(0, i - 1)];
      const h1 = Ab.heights[i];
      const w0 = Ab.widths[Math.max(0, i - 1)];
      const w1 = Ab.widths[i];
      const overlap = len * 0.18; // tergite overlaps the next (imbricate)
      const geo = shellTube(len + overlap, -1, (t) => {
        const hh = THREE.MathUtils.lerp(h0, h1, t) * 0.5;
        const ww = THREE.MathUtils.lerp(w0, w1, t) * 0.5;
        const hump = i === 2 ? 1 + 0.18 * Math.sin(Math.PI * t) : 1; // 3rd somite dorsally humped [R]
        return { top: hh * hump, bottom: hh * 0.75, width: ww, y: 0 };
      }, { rings: 10, radial: 28, jointWidth: 0.12 });
      const seg = mesh(geo, M.shell, j);
      seg.userData.somite = i;
      // Pleura (lateral plates); 2nd overlaps 1st & 3rd — diagnostic of Caridea.
      if (i < 5) {
        const plen = len * (i === 1 ? 1.5 : 1.1);
        const pleuronGeo = plate(ellipseOutline(plen, h1 * 0.28, 16), w1 * 0.05);
        for (const s of [1, -1]) {
          const pl = mesh(pleuronGeo, M.shell, j);
          pl.position.set(i === 1 ? len * 0.2 : 0, -h1 * 0.28, s * w1 * 0.46);
          pl.rotation.set(s * 0.22, 0, Math.PI - 0.08);
        }
      }
      // Internal: striated muscle and dorsal gut (hindgut) running through each somite.
      const mus = mesh(new THREE.SphereGeometry(1, 16, 10), M.muscle, j, false);
      mus.scale.set(len * 0.6, h1 * 0.27, w1 * 0.27);
      mus.position.set(-len * 0.5, -h1 * 0.03, 0);
      const gut = mesh(new THREE.CylinderGeometry(h1 * 0.05, h1 * 0.05, len * 1.1, 6), M.gut, j, false);
      gut.rotation.z = Math.PI / 2;
      gut.position.set(-len * 0.5, h1 * 0.24, 0);
      // Pleopods on somites 1-5
      if (i < 5) {
        const pairs = [];
        for (const s of [1, -1]) {
          const pj = joint(j, -len * 0.45, -h1 * 0.35, s * w1 * 0.18, `pleopod${i + 1}${s > 0 ? 'L' : 'R'}`);
          pj.rotation.x = s * 0.18;
          const plen = A.pleopod.length * (i === 0 ? 0.85 : 1);
          mesh(podomere(plen * 0.4, A.pleopod.width * 0.25, A.pleopod.width * 0.22), M.append, pj).rotation.z = -Math.PI / 2;
          const fork = joint(pj, 0, -plen * 0.4, 0);
          const rami = [];
          for (const r of [1, -1]) {
            const ramus = joint(fork, 0, 0, 0);
            const rm = mesh(plate(ellipseOutline(plen * 0.6, A.pleopod.width * 0.2, 12), A.pleopod.width * 0.04), M.append, ramus, false);
            rm.rotation.z = -Math.PI / 2;
            ramus.userData.r = r;
            rami.push(ramus);
          }
          pairs.push({ joint: pj, fork, rami, side: s });
        }
        j.userData.pleopods = pairs;
      }
      this.abd.push(j);
      parent = j;
      x = -len;
    }
    this.pleopods = this.abd.slice(0, 5).map((j) => j.userData.pleopods);

    // ---------- Tail fan ----------
    const last = this.abd[5];
    const lastLen = Ab.lengths[5];
    this.telson = joint(last, -lastLen, 0, 0, 'telson');
    const T = A.telson;
    const telGeo = shellTube(T.length, -1, (t) => ({
      top: T.baseWidth * 0.28 * (1 - t * 0.7),
      bottom: T.baseWidth * 0.18 * (1 - t * 0.7),
      width: T.baseWidth * 0.5 * (1 - t * 0.85),
      y: 0,
    }), { rings: 10, radial: 16, jointEnds: [true, false] });
    mesh(telGeo, M.shell, this.telson);
    // Telson dorsal spines (2 pairs) + posterior spines [R]
    const tspine = podomere(T.length * 0.08, T.baseWidth * 0.03, T.baseWidth * 0.005, 4);
    for (const s of [1, -1]) {
      for (const f of [0.45, 0.7]) {
        const sp = mesh(tspine, M.shellThin, this.telson, false);
        sp.position.set(-T.length * f, T.baseWidth * 0.2, s * T.baseWidth * 0.2 * (1 - f * 0.7));
        sp.rotation.set(0, Math.PI, 0.5);
      }
      const ps = mesh(tspine, M.shellThin, this.telson, false);
      ps.position.set(-T.length, 0, s * T.baseWidth * 0.04);
      ps.rotation.set(0, Math.PI - s * 0.15, 0);
    }
    this.uropods = [];
    const U = A.uropod;
    for (const s of [1, -1]) {
      const u = joint(last, -lastLen * 0.98, -Ab.heights[5] * 0.1, s * Ab.widths[5] * 0.25, 'uropod' + s);
      u.userData.side = s;
      for (const [ramus, off, lenF] of [['exo', 0.7, 1.0], ['endo', 0.25, 0.9]]) {
        const rj = joint(u, 0, 0, 0);
        const g = plate(ellipseOutline(U.length * lenF, U.width * 0.5, 22, ramus === 'exo' ? 0.3 : -0.1), U.width * 0.05);
        const m = mesh(g, M.shellThin, rj);
        m.rotation.set(Math.PI / 2, 0, Math.PI);
        rj.rotation.y = -s * off * 0.55;
        rj.userData.base = rj.rotation.y;
        rj.userData.ramus = ramus;
        u.userData[ramus] = rj;
      }
      this.uropods.push(u);
    }

    // ---------- Eggs (berried female) [R] ----------
    this.berried = berried && sex === 'female';
    if (this.berried) {
      const eggGeo = new THREE.SphereGeometry(0.00045, 8, 6);
      eggGeo.scale(1.25, 1, 1);
      for (let si = 0; si < 4; si++) {
        const count = 70;
        const inst = new THREE.InstancedMesh(eggGeo, M.egg, count);
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const sc = new THREE.Vector3(1, 1, 1);
        const len = Ab.lengths[si];
        const h = Ab.heights[si];
        const w = Ab.widths[si];
        for (let k = 0; k < count; k++) {
          const u = Math.random();
          const v = Math.random() * 2 - 1;
          const pos = new THREE.Vector3(-len * (0.1 + 0.9 * u), -h * (0.55 + Math.random() * 0.35), v * w * 0.45);
          q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0));
          m4.compose(pos, q, sc);
          inst.setMatrixAt(k, m4);
        }
        inst.castShadow = true;
        this.abd[si].add(inst);
      }
    }

    // Set rest pose for all rotational joints.
    this.root.traverse((o) => {
      if (!o.userData.rest) o.userData.rest = o.rotation.clone();
    });
  }

  addFlagellaTo(scene) {
    for (const f of this.flagella) scene.add(f.mesh);
  }

  removeFrom(scene) {
    scene.remove(this.root);
    for (const f of this.flagella) scene.remove(f.mesh);
  }
}
