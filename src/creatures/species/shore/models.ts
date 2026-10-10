import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D,
  SphereGeometry, TubeGeometry, Vector3, type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../../core/Rng';

/**
 * Procedural models of the small animals of the 走水 shore (built per individual at its real size, +Z forward, +Y up,
 * origin on the ground under the body): ケフサイソガニ, ユビナガホンヤドカリ in its borrowed shell, and
 * ボラ fry (ハク) and ミズヒキゴカイ. Parts the drivers animate are named in `parts`.
 */
export interface ShoreModel {
  root: Group;
  parts: Record<string, Object3D>;
  /** shared materials stay; per-individual geometry is freed with the model */
  dispose(): void;
}

function mesh(geo: BufferGeometry, mat: Material, parent: Object3D, name = ''): Mesh {
  const m = new Mesh(geo, mat);
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

/** A segment from the origin along +Z, flattened top to bottom (a crab's leg article). */
function article(len: number, w: number, h: number, taper = 0.75): BufferGeometry {
  const g = new CylinderGeometry(w * 0.5 * taper, w * 0.5, len, 7, 1, false);
  g.translate(0, len / 2, 0);
  g.rotateX(Math.PI / 2);
  g.scale(1, h / w, 1);
  return g;
}

const lodMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: DoubleSide });

/**
 * The whole of `src` (as posed now) baked into one vertex-coloured mesh in `src`'s frame: what a small animal is drawn
 * with from a few metres away, one draw call instead of dozens of articulated parts.
 */
export function bakeLod(src: Object3D): Mesh {
  src.updateMatrixWorld(true);
  const inv = new Matrix4().copy(src.matrixWorld).invert(), m = new Matrix4(), col = new Color();
  const parts: BufferGeometry[] = [];
  src.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const mat = mesh.material as MeshStandardMaterial;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('position').count, c = new Float32Array(n * 3), had = g.getAttribute('color') as BufferAttribute | undefined;
    col.copy(mat.color ?? new Color(1, 1, 1));
    for (let i = 0; i < n; i++) {
      const r = had && mat.vertexColors ? had.getX(i) : 1, gg = had && mat.vertexColors ? had.getY(i) : 1, b = had && mat.vertexColors ? had.getZ(i) : 1;
      c[i * 3] = r * col.r; c[i * 3 + 1] = gg * col.g; c[i * 3 + 2] = b * col.b;
    }
    g.setAttribute('color', new BufferAttribute(c, 3));
    g.applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld));
    parts.push(g);
  });
  const merged = mergeGeometries(parts) ?? new BufferGeometry();
  parts.forEach((g) => g.dispose());
  const out = new Mesh(merged, lodMat);
  out.name = 'lod';
  out.castShadow = out.receiveShadow = false;
  return out;
}

// ------------------------------------------------------------------ shells
export interface ShellParams {
  /** whorls from the apex to the aperture */
  whorls: number;
  /** how fast a whorl grows (per turn) */
  expansion: number;
  /** how high the spire is drawn out (larger: slenderer) */
  spire: number;
  /** cross-section of a whorl relative to its distance from the axis */
  tube: number;
  /** axial ribs and spiral cords (the アラムシロ's lattice); 0 for smooth */
  ribs: number;
  cords: number;
  /** how strongly the ribs and cords stand out (1: faint) */
  sculpt?: number;
  /** colours (linear): base, band, aperture */
  base: [number, number, number];
  band: [number, number, number];
  lip: [number, number, number];
}

/** the slender turreted shell a ユビナガホンヤドカリ usually carries (ホソウミニナ-like) */
export const SHELL_UMININA: ShellParams = { whorls: 9, expansion: 1.45, spire: 6.4, tube: 1.0, ribs: 18, cords: 3, sculpt: 1.4, base: [0.11, 0.095, 0.08], band: [0.05, 0.042, 0.036], lip: [0.3, 0.27, 0.23] };

/**
 * A coiled shell from the log spiral (after Raup): each whorl a circle swept round the axis while it grows and
 * sinks down the spire; with `tube` 1 the whorl reaches the axis (a solid columella, no open coil) and `spire` is set
 * so each whorl sits on the one before. Unit length from the apex (+Y) to the base of the aperture; the aperture
 * opens toward +Z.
 */
export function shellGeometry(p: ShellParams, seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const turns = p.whorls, nT = Math.round(turns * 36), nS = 14;
  const k = Math.log(p.expansion) / (2 * Math.PI);
  const tMax = turns * 2 * Math.PI;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const bandPhase = rng.range(0, 6.28), bandFreq = rng.range(2.5, 4.5);
  for (let i = 0; i <= nT; i++) {
    const t = (i / nT) * tMax;
    const g = Math.exp(k * (t - tMax));          // 1 at the aperture
    const R = g, a = g * p.tube;
    for (let j = 0; j <= nS; j++) {
      const s = (j / nS) * Math.PI * 2;
      // the lattice: axial ribs crossing spiral cords
      const k = p.sculpt ?? 1;
      const rib = p.ribs ? 0.06 * k * Math.max(0, Math.cos(t * p.ribs / (2 * Math.PI) * 2 * Math.PI)) : 0;
      const cord = p.cords ? 0.05 * k * Math.max(0, Math.cos(s * p.cords)) : 0;
      const aa = a * (1 + rib + cord);
      const rr = R + aa * Math.cos(s);
      pos.push(rr * Math.cos(t), -p.spire * R + aa * Math.sin(s), rr * Math.sin(t));
      const band = 0.5 + 0.5 * Math.sin(s * bandFreq + bandPhase);
      const lip = i > nT - 4 ? 1 : 0;
      const c = [0, 1, 2].map((q) => (p.base[q] * (1 - 0.6 * band) + p.band[q] * 0.6 * band) * (0.85 + 0.3 * (rib + cord) * 4 / k));
      col.push(...(lip ? p.lip : c));
    }
  }
  for (let i = 0; i < nT; i++) for (let j = 0; j < nS; j++) {
    const a = i * (nS + 1) + j, b = a + nS + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  // normalise: apex up, unit length, the axis vertical, the aperture toward +Z
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const len = bb.max.y - bb.min.y;
  geo.translate(0, -bb.min.y, 0);
  geo.scale(1 / len, 1 / len, 1 / len);
  // the open end faces along the coil's travel at the last turn: (-sin t, cos t) there; turn that to +Z
  geo.rotateY(tMax % (2 * Math.PI));
  geo.computeVertexNormals();
  return geo;
}

const shellMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });

// ------------------------------------------------------------------ ケフサイソガニ
const crabMats = {
  shell: new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }),
  leg: new MeshStandardMaterial({ color: 0x3f3b2a, roughness: 0.6 }),
  claw: new MeshStandardMaterial({ color: 0x4e3a36, roughness: 0.5 }),
  tip: new MeshStandardMaterial({ color: 0xbfb49c, roughness: 0.4 }),
  hair: new MeshStandardMaterial({ color: 0x3a3226, roughness: 1 }),
  eye: new MeshStandardMaterial({ color: 0x111111, roughness: 0.25 }),
};

/** The carapace: nearly square, a little wider in front, low dome, three teeth on each front corner; olive with purple-red spots. */
function carapace(w: number, rng: Rng): BufferGeometry {
  const g = new SphereGeometry(0.5, 28, 14);
  const p = g.getAttribute('position') as BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const spotSeed = rng.range(0, 100);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // squarer outline (superellipse) and a flat underside
    const ang = Math.atan2(z, x), r = Math.hypot(x, z);
    const sq = 1 / Math.pow(Math.pow(Math.abs(Math.cos(ang)), 4) + Math.pow(Math.abs(Math.sin(ang)), 4), 0.25);
    const front = z > 0 ? 1 - 0.1 * z : 1 - 0.12 * Math.abs(z);
    let rr = r * Math.min(1.25, sq) * front;
    // anterolateral teeth
    if (z > 0.05 && Math.abs(x) > 0.3) rr *= 1 + 0.06 * Math.max(0, Math.sin(z * 40));
    x = Math.cos(ang) * rr; z = Math.sin(ang) * rr * 0.86;
    y = y > 0 ? y * 0.36 : y * 0.18;
    p.setXYZ(i, x * w, y * w, z * w);
    const spot = Math.max(0, Math.sin(x * 37 + spotSeed) * Math.sin(z * 41 - spotSeed * 0.7)) > 0.82 ? 1 : 0;
    const top = y > 0 ? 1 : 0;
    // (linear colours) dark olive-brown above, the underside pale
    const base = top ? [0.1, 0.092, 0.052] : [0.5, 0.45, 0.36];
    const c = spot && top ? [0.17, 0.035, 0.06] : base;
    // mottled: darker blotches over the olive, paler toward the edges
    const shade = (0.75 + 0.3 * Math.sin(x * 9 + z * 7 + spotSeed) * Math.sin(x * 5 - z * 11)) * (top ? 1 + 0.25 * Math.max(0, Math.hypot(x, z) - 0.35) : 1);
    col[i * 3] = c[0] * shade; col[i * 3 + 1] = c[1] * shade; col[i * 3 + 2] = c[2] * shade;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * ケフサイソガニ (Hemigrapsus penicillatus): carapace ~28 mm wide at model size, the male's claws bigger with the
 * brown felt tuft at the base of the fingers that gives it its name; four pairs of banded walking legs.
 */
export function makeCrab(width: number, male: boolean, seed: number): ShoreModel {
  const rng = new Rng(seed);
  const root = new Group();
  root.name = 'Kefusaisogani';
  const parts: Record<string, Object3D> = {};
  const geos: BufferGeometry[] = [];
  const keep = <T extends BufferGeometry>(g: T) => { geos.push(g); return g; };
  const body = new Group();
  body.position.y = width * 0.13;
  root.add(body);
  parts.body = body;
  mesh(keep(carapace(width, rng)), crabMats.shell, body, 'carapace');
  // eyes at the front corners of the orbit
  for (const s of [-1, 1]) {
    const eye = mesh(keep(new SphereGeometry(width * 0.045, 8, 6)), crabMats.eye, body, 'eye');
    eye.position.set(s * width * 0.3, width * 0.05, width * 0.4);
  }
  // walking legs: four pairs, merus / carpus+propodus / dactyl, bent down and out
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const hip = new Group();
    hip.name = `leg${k}${s > 0 ? 'L' : 'R'}`;
    hip.position.set(s * width * 0.42, -width * 0.02, width * (0.16 - k * 0.13));
    // yaw first, then the lift about the leg's own axis
    hip.rotation.order = 'YXZ';
    hip.rotation.y = s * (Math.PI / 2 - 0.25 + k * 0.17);
    body.add(hip);
    const L = width * (0.36 + (k === 1 || k === 2 ? 0.07 : 0));
    const m1 = mesh(keep(article(L, width * 0.17, width * 0.07)), crabMats.leg, hip);
    m1.rotation.x = -0.25;
    const knee = new Group();
    knee.position.set(0, Math.sin(0.25) * L, Math.cos(0.25) * L);
    hip.add(knee);
    const m2 = mesh(keep(article(L * 0.75, width * 0.13, width * 0.06)), crabMats.leg, knee);
    m2.rotation.x = 0.75;
    const foot = new Group();
    foot.position.set(0, -Math.sin(0.75) * L * 0.75, Math.cos(0.75) * L * 0.75);
    knee.add(foot);
    const m3 = mesh(keep(article(L * 0.42, width * 0.07, width * 0.045, 0.3)), crabMats.tip, foot);
    m3.rotation.x = 1.1;
    parts[hip.name] = hip;
    parts[`knee${k}${s > 0 ? 'L' : 'R'}`] = knee;
  }
  // the claws: arm and palm, fingers that open; the tuft of hair on the outer face of the male's palm
  const cs = male ? 1 : 0.72;
  for (const s of [-1, 1]) {
    const sh = new Group();
    sh.name = `claw${s > 0 ? 'L' : 'R'}`;
    sh.position.set(s * width * 0.3, -width * 0.02, width * 0.38);
    sh.rotation.y = s * 0.55;
    body.add(sh);
    const arm = mesh(keep(article(width * 0.3 * cs, width * 0.13 * cs, width * 0.1 * cs)), crabMats.claw, sh);
    arm.rotation.x = 0.1;
    const wrist = new Group();
    wrist.position.set(0, 0, width * 0.3 * cs);
    wrist.rotation.y = -s * 1.1;
    sh.add(wrist);
    const palm = mesh(keep(new SphereGeometry(0.5, 12, 8)), crabMats.claw, wrist);
    palm.scale.set(width * 0.2 * cs, width * 0.16 * cs, width * 0.32 * cs);
    palm.position.z = width * 0.14 * cs;
    const fixedF = mesh(keep(article(width * 0.2 * cs, width * 0.07 * cs, width * 0.06 * cs, 0.3)), crabMats.tip, wrist);
    fixedF.position.set(-s * width * 0.03, -width * 0.02, width * 0.28 * cs);
    const finger = new Group();
    finger.position.set(s * width * 0.03, width * 0.02, width * 0.27 * cs);
    wrist.add(finger);
    mesh(keep(article(width * 0.21 * cs, width * 0.07 * cs, width * 0.06 * cs, 0.3)), crabMats.tip, finger);
    if (male) {
      const tuft = mesh(keep(new SphereGeometry(0.5, 8, 6)), crabMats.hair, wrist);
      tuft.scale.set(width * 0.09, width * 0.09, width * 0.11);
      tuft.position.set(s * width * 0.085, 0, width * 0.24);
    }
    parts[sh.name] = sh;
    parts[`finger${s > 0 ? 'L' : 'R'}`] = finger;
  }
  return { root, parts, dispose: () => geos.forEach((g) => g.dispose()) };
}

// ------------------------------------------------------------------ ユビナガホンヤドカリ
const hermitMats = {
  leg: new MeshStandardMaterial({ color: 0xc9bfa4, roughness: 0.55 }),
  band: new MeshStandardMaterial({ color: 0x7a5a3e, roughness: 0.6 }),
  claw: new MeshStandardMaterial({ color: 0xb8a988, roughness: 0.5 }),
  eye: new MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.2 }),
  antenna: new MeshStandardMaterial({ color: 0x9a7a5a, roughness: 0.7 }),
};

/**
 * ユビナガホンヤドカリ (Pagurus minutus) in a borrowed turreted shell (`shellLen` m long): the shell lies tilted on its
 * side, aperture forward; out of it come the eyestalks, the antennae, the right cheliped (the bigger one, with the long
 * fingers the name refers to) and two pairs of walking legs. `parts.animal` slides back into the shell when it hides.
 */
export function makeHermit(shellLen: number, seed: number): ShoreModel {
  const rng = new Rng(seed);
  const root = new Group();
  root.name = 'Yubinagahonyadokari';
  const parts: Record<string, Object3D> = {};
  const geos: BufferGeometry[] = [];
  const keep = <T extends BufferGeometry>(g: T) => { geos.push(g); return g; };
  const shellG = keep(shellGeometry(SHELL_UMININA, seed));
  const shell = new Group();
  shell.name = 'shell';
  root.add(shell);
  const sh = mesh(shellG, shellMat, shell, 'shellMesh');
  // lying on its side, apex trailing backward and a little up, the aperture turned down over the animal
  sh.scale.setScalar(shellLen);
  sh.rotation.set(-Math.PI / 2 + 0.14, Math.PI + rng.range(-0.25, 0.25), rng.range(-0.2, 0.2));
  sh.position.set(0, shellLen * 0.2, shellLen * 0.3);
  parts.shell = shell;
  const animal = new Group();
  animal.position.set(-shellLen * 0.08, shellLen * 0.14, shellLen * 0.3);
  shell.add(animal);
  parts.animal = animal;
  const u = shellLen;
  // eyestalks with dark eyes, antennae
  for (const s of [-1, 1]) {
    const st = mesh(keep(article(u * 0.2, u * 0.045, u * 0.045, 0.9)), hermitMats.leg, animal);
    st.rotation.set(-0.7, s * 0.25, 0);
    st.position.set(s * u * 0.035, u * 0.05, 0);
    const eye = mesh(keep(new SphereGeometry(u * 0.035, 8, 6)), hermitMats.eye, animal);
    eye.position.set(s * u * 0.08, u * 0.18, u * 0.15);
    const ant = new Group();
    ant.position.set(s * u * 0.05, u * 0.04, u * 0.04);
    ant.rotation.set(-0.35, s * 0.5, 0);
    animal.add(ant);
    mesh(keep(article(u * 0.75, u * 0.016, u * 0.016, 0.3)), hermitMats.antenna, ant);
    parts[`antenna${s > 0 ? 'L' : 'R'}`] = ant;
  }
  // the chelipeds: right big with long fingers, left small
  for (const s of [-1, 1]) {
    const big = s < 0;
    const c = new Group();
    c.name = `claw${s > 0 ? 'L' : 'R'}`;
    c.position.set(s * u * 0.07, -u * 0.02, u * 0.04);
    c.rotation.set(0.3, s * 0.15, 0);
    animal.add(c);
    const k = big ? 1 : 0.6;
    mesh(keep(article(u * 0.26 * k, u * 0.09 * k, u * 0.08 * k)), hermitMats.claw, c);
    const palm = mesh(keep(new SphereGeometry(0.5, 10, 6)), hermitMats.claw, c);
    palm.scale.set(u * 0.12 * k, u * 0.08 * k, u * 0.2 * k);
    palm.position.z = u * 0.3 * k;
    const fing = mesh(keep(article(u * 0.2 * k, u * 0.05 * k, u * 0.04 * k, 0.3)), hermitMats.leg, c);
    fing.position.z = u * 0.38 * k;
    parts[c.name] = c;
  }
  // two pairs of walking legs (banded) reaching down to the sand
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const hip = new Group();
    hip.name = `leg${k}${s > 0 ? 'L' : 'R'}`;
    hip.position.set(s * u * 0.08, -u * 0.02, -u * 0.03 - k * u * 0.07);
    hip.rotation.order = 'YXZ';
    hip.rotation.y = s * (1.0 + k * 0.3);
    animal.add(hip);
    const m1 = mesh(keep(article(u * 0.2, u * 0.06, u * 0.05)), k ? hermitMats.band : hermitMats.leg, hip);
    m1.rotation.x = -0.35;
    const knee = new Group();
    knee.position.set(0, Math.sin(0.35) * u * 0.2, Math.cos(0.35) * u * 0.2);
    hip.add(knee);
    const m2 = mesh(keep(article(u * 0.24, u * 0.05, u * 0.04, 0.3)), k ? hermitMats.leg : hermitMats.band, knee);
    m2.rotation.x = 1.2;
    parts[hip.name] = hip;
  }
  return { root, parts, dispose: () => geos.forEach((g) => g.dispose()) };
}

// ------------------------------------------------------------------ ボラ fry (ハク)
const fryMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.55 });
const finMat = new MeshStandardMaterial({ color: 0xbfc6c8, roughness: 0.4, transparent: true, opacity: 0.55, side: DoubleSide });

/** A lofted fish body, unit length along +Z (nose at +0.5): blue-grey back, silver flanks, white belly. */
function fryBody(front: boolean): BufferGeometry {
  const nL = 10, nR = 12;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const z0 = front ? 0 : -0.5, z1 = front ? 0.5 : 0;
  for (let i = 0; i <= nL; i++) {
    const zz = z0 + ((z1 - z0) * i) / nL;
    const u = zz + 0.5;   // 0 tail .. 1 nose
    const r = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.02) / 1.0))) ** 0.7 * (u > 0.85 ? 1 - (u - 0.85) * 2.2 : 1);
    const h = 0.095 * r + 0.01, w = 0.075 * r + 0.006;
    for (let j = 0; j <= nR; j++) {
      const a = (j / nR) * Math.PI * 2;
      const y = Math.sin(a) * h, x = Math.cos(a) * w;
      pos.push(x, y, zz);
      const back = Math.max(0, Math.sin(a));
      const c = back > 0.6 ? [0.18, 0.24, 0.3] : Math.sin(a) < -0.4 ? [0.92, 0.92, 0.9] : [0.7, 0.74, 0.76];
      col.push(...c);
    }
  }
  for (let i = 0; i < nL; i++) for (let j = 0; j < nR; j++) {
    const a = i * (nR + 1) + j, b = a + nR + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const FRY_FRONT = fryBody(true), FRY_BACK = fryBody(false);
const FRY_TAIL = (() => {
  // a forked caudal fin
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0, 0.11, -0.16, 0, 0.02, -0.1, 0, -0.02, -0.1, 0, -0.11, -0.16]), 3));
  g.setIndex([0, 1, 2, 0, 3, 4, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
})();
/** a fin as a flat triangle fan in the x = 0 plane (dorsal / anal) or the y = 0 plane (pectoral): base from z0 to z1, tip out */
function finGeo(z0: number, z1: number, tipZ: number, tip: number, plane: 'x' | 'y'): BufferGeometry {
  const g = new BufferGeometry();
  const v = plane === 'x' ? [0, 0, z0, 0, 0, z1, 0, tip, tipZ] : [0, 0, z0, 0, 0, z1, tip, 0, tipZ];
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  g.setIndex([0, 1, 2]);
  g.computeVertexNormals();
  return g;
}
// ボラ: a short spiny first dorsal over the middle of the back, the soft second dorsal and the anal fin far back
const FRY_FINS: [BufferGeometry, number, number][] = [
  [finGeo(0.05, -0.06, -0.06, 0.08, 'x'), 0.088, 0],
  [finGeo(-0.13, -0.23, -0.24, 0.07, 'x'), 0.07, 0],
  [finGeo(-0.12, -0.24, -0.25, -0.065, 'x'), -0.07, 0],
];
const FRY_PEC = finGeo(0.22, 0.17, 0.08, 0.07, 'y');
const FRY_EYE = new SphereGeometry(0.03, 8, 6);
const eyeMat = new MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.15, metalness: 0.2 });
const irisMat = new MeshStandardMaterial({ color: 0xd8c890, roughness: 0.3 });

/** ボラ fry: unit model scaled to its length; `parts.tail` bends for the swim. Shared geometry (nothing to free). */
export function makeFry(length: number): ShoreModel {
  const root = new Group();
  root.name = 'BoraFry';
  const parts: Record<string, Object3D> = {};
  const body = new Group();
  body.scale.setScalar(length);
  root.add(body);
  parts.body = body;
  mesh(FRY_FRONT, fryMat, body, 'front');
  const tail = new Group();
  body.add(tail);
  mesh(FRY_BACK, fryMat, tail, 'back');
  const fin = mesh(FRY_TAIL, finMat, tail, 'caudal');
  fin.position.z = -0.48;
  parts.tail = tail;
  FRY_FINS.forEach(([g, y], i) => { const f = mesh(g, finMat, i === 0 ? body : tail, 'fin'); f.position.y = y; });
  for (const s of [-1, 1]) {
    const pec = mesh(FRY_PEC, finMat, body, 'pectoral');
    pec.position.set(s * 0.06, -0.01, 0);
    pec.scale.x = s;
    pec.rotation.z = s * 0.35;
    parts[`pectoral${s > 0 ? 'L' : 'R'}`] = pec;
  }
  for (const s of [-1, 1]) {
    const e = mesh(FRY_EYE, irisMat, body, 'eye');
    e.position.set(s * 0.05, 0.02, 0.37);
    const pupil = mesh(FRY_EYE, eyeMat, body, 'pupil');
    pupil.scale.setScalar(0.6);
    pupil.position.set(s * 0.068, 0.02, 0.375);
  }
  return { root, parts, dispose: () => {} };
}

// ------------------------------------------------------------------ ミズヒキゴカイ
const wormMats = {
  body: new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 }),
  cirri: new MeshStandardMaterial({ color: 0xb8322a, roughness: 0.4, emissive: 0x2a0503 }),
};

/** a bundle of thin threads along the given curves, as one geometry */
function threads(curves: Vector3[][], r: number): BufferGeometry {
  const geos = curves.map((pts) => new TubeGeometry(new CatmullRomCurve3(pts), Math.max(6, pts.length * 3), r, 3, false));
  const g = mergeGeometries(geos)!;
  geos.forEach((x) => x.dispose());
  return g;
}

/**
 * ミズヒキゴカイ (Cirriformia comosa), `len` m long: a soft, segmented, orange-brown worm with a crown of long blood-red
 * threads (tentacular cirri and gills) from its front segments. Two forms of display: `parts.body` (a chain of segment
 * groups, `parts.seg0..`, for writhing when it is out of the sand) with the threads on it, and `parts.tuft`, the
 * threads alone spread over the sand around the burrow, which is all one sees of it in the flat.
 */
export function makeWorm(len: number, seed: number): ShoreModel {
  const rng = new Rng(seed);
  const root = new Group();
  root.name = 'Mizuhikigokai';
  const parts: Record<string, Object3D> = {};
  const geos: BufferGeometry[] = [];
  const keep = <T extends BufferGeometry>(g: T) => { geos.push(g); return g; };
  const N = 14, segL = len / N, rad = len * 0.036;
  // one segment: a short tube, banded light and dark at its ends (the annuli)
  const seg = keep(new CylinderGeometry(rad, rad, segL * 1.08, 10, 3, false));
  seg.rotateX(Math.PI / 2);
  seg.translate(0, 0, segL / 2);
  {
    const p = seg.getAttribute('position') as BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const u = p.getZ(i) / segL, top = p.getY(i) > 0 ? 1 : 0.85;
      const ring = Math.abs(u - 0.5) > 0.42 ? 0.7 : 1;
      col[i * 3] = 0.42 * ring * top; col[i * 3 + 1] = 0.15 * ring * top; col[i * 3 + 2] = 0.07 * ring * top;
    }
    seg.setAttribute('color', new BufferAttribute(col, 3));
    seg.computeVertexNormals();
  }
  const body = new Group();
  body.position.y = rad;
  root.add(body);
  parts.body = body;
  let parent: Object3D = body;
  // the chain runs from the tail (z = -len/2) to the head
  for (let i = 0; i < N; i++) {
    const g = new Group();
    g.position.z = i === 0 ? -len / 2 : segL;
    parent.add(g);
    const m = mesh(seg, wormMats.body, g, 'segment');
    const taper = Math.min(1, 0.35 + 0.65 * Math.sin(Math.PI * (i + 0.5) / N) * 1.4);
    m.scale.set(taper, taper * 0.85, 1);
    parts[`seg${i}`] = g;
    parent = g;
    // the crown: threads from the front third, curling back over the body
    if (i >= N - 5 && i < N - 1) {
      const curves: Vector3[][] = [];
      for (let k = 0; k < 7; k++) {
        // out to the side and back, sagging onto the bottom
        const sd = k % 2 ? 1 : -1, L = len * rng.range(0.35, 0.7), out = rng.range(0.2, 0.8), wav = rng.range(0, 6);
        const pts: Vector3[] = [];
        for (let q = 0; q <= 6; q++) {
          const t = q / 6;
          pts.push(new Vector3(sd * (rad * 0.8 + t * L * out) + Math.sin(t * 6 + wav) * L * 0.06, rad * 0.6 * (1 - t) - rad * 0.9 * t, -t * L * (1 - out * 0.5) + segL * 0.5));
        }
        curves.push(pts);
      }
      mesh(keep(threads(curves, rad * 0.12)), wormMats.cirri, g, 'cirri');
    }
  }
  // the tuft on the sand: threads radiating from the burrow, lying on the bottom and curling
  const tuft = new Group();
  tuft.name = 'tuft';
  root.add(tuft);
  parts.tuft = tuft;
  const curves: Vector3[][] = [];
  const n = 26;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng.range(-0.2, 0.2), L = len * rng.range(0.25, 0.6), curl = rng.range(-1.6, 1.6);
    const pts: Vector3[] = [];
    for (let q = 0; q <= 6; q++) {
      const t = q / 6, aa = a + curl * t * t;
      // up out of the hole, then down onto the sand
      pts.push(new Vector3(Math.cos(aa) * L * t, rad * 1.4 * Math.sin(Math.PI * Math.min(1, t * 3)) * (1 - t) + rad * 0.3, Math.sin(aa) * L * t));
    }
    curves.push(pts);
  }
  mesh(keep(threads(curves, rad * 0.14)), wormMats.cirri, tuft, 'tuftThreads');
  return { root, parts, dispose: () => geos.forEach((g) => g.dispose()) };
}
