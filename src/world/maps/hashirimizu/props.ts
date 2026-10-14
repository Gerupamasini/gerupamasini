import {
  BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, InstancedBufferAttribute,
  InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, RepeatWrapping, SRGBColorSpace, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../../core/Rng';
import type { Terrain } from '../../Terrain';
import { valveFragment } from '../../PitDebris';
import { FORMS, sharedGeometry } from '../../../creatures/asari/AsariModel.js';
import { makeShellOuterMaterial } from '../../../creatures/asari/AsariMaterial.js';
import { reflectInWater } from '../../../render/Mirror';
import { ALONG, COAST_N, COAST_S, HALF, WALL_FOOT, WALL_TOP, WALL_TOP_D, ZERO_X, profile, vnoise } from './shape';

const UP = new Vector3(0, 1, 0);
const own = <T extends Object3D>(o: T): T => { o.traverse((c) => { c.userData.mapOwned = true; }); return o; };

/** A canvas texture drawn once (repeating). */
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ the seawall
/**
 * A low concrete revetment along the back of the beach: a battered face with a nose and a coping on top, cast in
 * 2 m bays, weathered — a dark wet band and a crust of barnacles and green algae at the foot, rust streaks under the
 * railing posts — and a galvanised railing along the top.
 */
function seawall(): Object3D[] {
  const xFoot = ZERO_X + WALL_FOOT, xTop = ZERO_X + WALL_TOP_D;
  const yFoot = profile(WALL_FOOT);
  // the cross-section, from the buried toe up the face to the back of the coping (x, y)
  const sec: [number, number][] = [
    [xFoot + 0.12, yFoot - 0.35], [xFoot + 0.02, yFoot + 0.02], [xTop + 0.14, WALL_TOP - 0.18], [xTop + 0.05, WALL_TOP - 0.1],
    [xTop + 0.05, WALL_TOP + 0.1], [xTop - 0.55, WALL_TOP + 0.1], [xTop - 0.55, WALL_TOP - 0.05],
  ];
  const lens = [0];
  for (let i = 1; i < sec.length; i++) lens.push(lens[i - 1] + Math.hypot(sec[i][0] - sec[i - 1][0], sec[i][1] - sec[i - 1][1]));
  // along the whole beach, past the map's ends to where the wooded points close it in
  const z0 = COAST_N, z1 = COAST_S, nz = Math.round((z1 - z0) / 2);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k <= nz; k++) {
    const z = z0 + ((z1 - z0) * k) / nz;
    for (let i = 0; i < sec.length; i++) { pos.push(sec[i][0], sec[i][1], z); uv.push(z / 2, lens[i]); }
  }
  const S = sec.length;
  for (let k = 0; k < nz; k++) for (let i = 0; i < S - 1; i++) {
    const a = k * S + i, b = a + S;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const total = lens[lens.length - 1];
  // one 2 m bay along u (x 2 px/cm), the profile along v
  const tex = canvasTex(512, 512, (c) => {
    const W = 512, H = 512;
    c.fillStyle = '#9a9890'; c.fillRect(0, 0, W, H);
    // aggregate and pores
    for (let i = 0; i < 9000; i++) {
      const v = 120 + Math.random() * 60;
      c.fillStyle = `rgba(${v},${v - 2},${v - 8},${0.25 + Math.random() * 0.3})`;
      c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (let i = 0; i < 700; i++) { c.fillStyle = 'rgba(40,38,35,0.5)'; c.fillRect(Math.random() * W, Math.random() * H, 1, 1); }
    // the toe: wet, barnacled, green with algae over the lowest ~40 cm of the face
    const foot = (0.45 / total) * H;
    const g = c.createLinearGradient(0, 0, 0, foot * 1.6);
    g.addColorStop(0, 'rgba(58,62,48,0.95)'); g.addColorStop(0.55, 'rgba(70,74,58,0.75)'); g.addColorStop(1, 'rgba(90,88,80,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, foot * 1.6);
    for (let i = 0; i < 1400; i++) {
      const y = Math.random() * foot * 1.1;
      c.fillStyle = Math.random() < 0.6 ? 'rgba(200,196,182,0.8)' : 'rgba(80,110,60,0.7)';
      c.beginPath(); c.arc(Math.random() * W, y, 1 + Math.random() * 2.2, 0, Math.PI * 2); c.fill();
    }
    // salt and weather streaks down the face
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * W;
      const gg = c.createLinearGradient(0, H * 0.4, 0, foot);
      gg.addColorStop(0, 'rgba(70,64,56,0)'); gg.addColorStop(1, `rgba(70,64,56,${0.15 + Math.random() * 0.2})`);
      c.fillStyle = gg; c.fillRect(x, foot, 2 + Math.random() * 6, H * 0.4 - foot);
    }
    // the bay joint (vertical) and the construction joint under the coping
    c.fillStyle = 'rgba(30,30,28,0.85)'; c.fillRect(0, 0, 3, H);
    c.fillRect(0, H * ((lens[3]) / total), W, 2);
  });
  tex.repeat.set(1, 1 / total);
  const mat = new MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, side: DoubleSide });
  const wall = new Mesh(geo, mat);
  wall.name = 'seawall';
  wall.receiveShadow = true;
  wall.castShadow = true;
  // the railing: posts every 2 m, two rails
  const railMat = new MeshStandardMaterial({ color: 0x8e9496, roughness: 0.45, metalness: 0.6 });
  const postGeo = new CylinderGeometry(0.024, 0.024, 1.0, 8).translate(0, 0.5, 0);
  const posts = new InstancedMesh(postGeo, railMat, Math.ceil((z1 - z0) / 2) + 1);
  const m = new Matrix4();
  const xr = xTop - 0.25, yr = WALL_TOP + 0.1;
  let n = 0;
  for (let z = z0; z <= z1; z += 2) posts.setMatrixAt(n++, m.makeTranslation(xr, yr, z));
  posts.count = n;
  posts.castShadow = true;
  const rails: Mesh[] = [];
  for (const h of [0.55, 0.98]) {
    const rg = new CylinderGeometry(0.02, 0.02, z1 - z0, 8).rotateX(Math.PI / 2);
    const rail = new Mesh(rg, railMat);
    rail.position.set(xr, yr + h, (z0 + z1) / 2);
    rail.castShadow = true;
    rails.push(rail);
  }
  return [wall, posts, ...rails].map((o) => reflectInWater(o));
}

// ------------------------------------------------------------------ shells, driftwood, the wrack line, grass
/** アサリ and ハマグリ valves, whole and broken, thickest along the drift line. */
function beachShells(terrain: Terrain, rng: Rng): Object3D[] {
  const out: Object3D[] = [];
  for (const form of [FORMS.asari, FORMS.hamaguri]) {
    const valve = sharedGeometry(form).valve[2] as BufferGeometry;
    const kinds = [valveFragment(valve, rng, 0), valveFragment(valve, rng, 1), valveFragment(valve, rng, 2)];
    const N = form === FORMS.asari ? 150 : 70;
    kinds.forEach((g, ki) => {
      const mat = (makeShellOuterMaterial as (o: { instanced?: boolean; style?: string }) => ReturnType<typeof makeShellOuterMaterial>)({ instanced: true, style: form.style });
      (mat.userData.uniforms as { uSand: { value: { set(a: number, b: number, c: number, d: number): void } } }).uSand.value.set(-1e9, 0.04, 0, 0.8);
      const geo = g.clone();
      geo.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(N * 4), 4));
      const im = new InstancedMesh(geo, mat, N);
      const o = new Object3D(), tilt = new Quaternion(), n = new Vector3();
      for (let k = 0; k < N; k++) {
        // the drift line at the top of the beach, the clam flat, and the beach toe between
        const which = rng.next();
        const d = which < 0.45 ? -5.5 + rng.normal() * 0.8 : which < 0.8 ? rng.range(3, 12) : rng.range(-3, 3);
        const z = rng.range(-ALONG, ALONG);
        const x = ZERO_X + d;
        const len = (form === FORMS.asari ? rng.range(0.022, 0.04) : rng.range(0.035, 0.065)) * (1 - 0.15 * ki);
        terrain.normalAt(x, z, n);
        o.position.set(x, terrain.heightAt(x, z) - len * 0.02, z);
        // most lie convex side up; a few cup up
        o.rotation.set(-Math.PI / 2 + (rng.chance(0.2) ? Math.PI : 0) + rng.range(-0.2, 0.2), rng.range(0, Math.PI * 2), rng.range(-0.2, 0.2), 'YXZ');
        o.quaternion.premultiply(tilt.setFromUnitVectors(UP, n));
        o.scale.setScalar(len);
        o.updateMatrix();
        im.setMatrixAt(k, o.matrix);
        (geo.getAttribute('aSeed') as InstancedBufferAttribute).set([rng.next(), rng.next(), 1, 0], k * 4);
      }
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.name = `beach-shells-${form.id}-${ki}`;
      out.push(im);
    });
  }
  return out;
}

/** Bleached driftwood above the usual high water: a few branches and a log, bark worn to grey. */
function driftwood(terrain: Terrain, rng: Rng): Object3D[] {
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const out: Object3D[] = [];
  const pieces = [
    { z: -18, d: -7.2, len: 2.1, r: 0.085 }, { z: 6, d: -6.4, len: 1.2, r: 0.045 }, { z: 21, d: -7.6, len: 0.8, r: 0.035 },
    { z: -6, d: -5.2, len: 0.6, r: 0.025 }, { z: 31, d: -5.9, len: 1.5, r: 0.06 }, { z: -29, d: -6.8, len: 0.9, r: 0.04 },
  ];
  for (const pc of pieces) {
    const a = rng.range(-0.6, 0.6) + Math.PI / 2;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const u = (i / 4 - 0.5) * pc.len;
      pts.push(new Vector3(Math.cos(a) * u + rng.range(-0.04, 0.04) * pc.len, rng.range(0, 0.03), Math.sin(a) * u + rng.range(-0.06, 0.06) * pc.len));
    }
    const curve = new CatmullRomCurve3(pts);
    const g = new TubeGeometry(curve, 24, pc.r, 8, false);
    const p = g.getAttribute('position') as BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const s = 0.55 + 0.18 * vnoise(p.getX(i) * 20, p.getZ(i) * 20 + p.getY(i) * 30, 131) + 0.08 * Math.sin(i * 0.7);
      col[i * 3] = s * 0.86; col[i * 3 + 1] = s * 0.8; col[i * 3 + 2] = s * 0.72;
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    const mesh = new Mesh(g, mat);
    const x = ZERO_X + pc.d;
    mesh.position.set(x, terrain.heightAt(x, pc.z) + pc.r * 0.55, pc.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'driftwood';
    out.push(mesh);
  }
  return out;
}

/** The wrack line: dead eelgrass and weed thrown up by the last high tides, drying dark along the berm. */
function wrackLine(terrain: Terrain, rng: Rng): Object3D {
  const N = 1400;
  const geo = new PlaneGeometry(0.007, 0.26).rotateX(-Math.PI / 2);
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: DoubleSide });
  const im = new InstancedMesh(geo, mat, N);
  const o = new Object3D(), c = new Color();
  let k = 0;
  for (let i = 0; i < N; i++) {
    // in clumps along the coast, thicker where the berm is
    const z = rng.range(-HALF + 2, HALF - 2);
    if (vnoise(z * 0.4, 0.5, 141) < 0.35) continue;
    const d = -5.5 + rng.normal() * 0.45 + 0.6 * (vnoise(z * 0.08, 3.3, 143) - 0.5);
    const x = ZERO_X + d;
    o.position.set(x + rng.range(-0.1, 0.1), terrain.heightAt(x, z) + 0.003 + rng.range(0, 0.008), z);
    o.rotation.set(rng.range(-0.08, 0.08), rng.range(-0.5, 0.5) + (rng.chance(0.5) ? 0 : Math.PI), rng.range(-0.08, 0.08));
    o.scale.set(1, 1, rng.range(0.5, 1.6));
    o.updateMatrix();
    im.setMatrixAt(k, o.matrix);
    // black-brown blades, a few still olive, some bleached
    const t = rng.next();
    im.setColorAt(k, t < 0.6 ? c.setRGB(0.07, 0.055, 0.04) : t < 0.85 ? c.setRGB(0.16, 0.14, 0.07) : c.setRGB(0.45, 0.42, 0.34));
    k++;
  }
  im.count = k;
  im.receiveShadow = true;
  im.name = 'wrack';
  return im;
}

/** Tufts of grass on the strip behind the seawall. */
function grass(terrain: Terrain, rng: Rng): Object3D {
  const blades: BufferGeometry[] = [];
  for (let b = 0; b < 7; b++) {
    const h = 0.25 + 0.25 * (b / 7);
    const g = new BufferGeometry();
    const a = (b / 7) * Math.PI * 2, lean = 0.25;
    const bx = Math.cos(a) * 0.02, bz = Math.sin(a) * 0.02;
    g.setAttribute('position', new BufferAttribute(new Float32Array([bx - 0.006, 0, bz, bx + 0.006, 0, bz, bx + Math.cos(a) * lean * h, h, bz + Math.sin(a) * lean * h]), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array([0.16, 0.2, 0.08, 0.16, 0.2, 0.08, 0.42, 0.45, 0.2]), 3));
    blades.push(g);
  }
  const geo = mergeGeometries(blades) as BufferGeometry;
  geo.computeVertexNormals();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide });
  const N = 900;
  const im = new InstancedMesh(geo, mat, N);
  const o = new Object3D(), c = new Color();
  for (let i = 0; i < N; i++) {
    const x = ZERO_X + WALL_TOP_D - 0.7 - Math.pow(rng.next(), 0.7) * 13, z = rng.range(-HALF + 1, HALF - 1);
    o.position.set(x, terrain.heightAt(x, z) - 0.01, z);
    o.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    o.scale.setScalar(rng.range(0.6, 1.5));
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
    im.setColorAt(i, c.setRGB(0.85 + rng.range(0, 0.3), 0.9 + rng.range(0, 0.2), 0.7 + rng.range(0, 0.2)));
  }
  im.name = 'grass';
  return im;
}

/** Everything the 走水 shore stands on its terrain: the seawall, shells, driftwood, the wrack, grass. */
export function buildHashirimizuProps(terrain: Terrain, seed: number): Object3D[] {
  const rng = new Rng(seed ^ 0x51a7);
  return [...seawall(), ...beachShells(terrain, rng), ...driftwood(terrain, rng), wrackLine(terrain, rng), grass(terrain, rng)].map(own);
}
