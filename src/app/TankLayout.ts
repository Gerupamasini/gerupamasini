import type { EquipmentLayout } from '../aquarium/state';
import { CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, Vector3 } from 'three';

export type TankSubstrate = 'sand' | 'mud' | 'none';
export type TankItemType = 'stone_s' | 'stone_l' | 'driftwood' | 'shell' | 'plant';
export interface TankItem { id: string; type: TankItemType; x: number; z: number; rot: number }
export interface TankLayout { substrate: TankSubstrate; items: TankItem[]; equipment?: EquipmentLayout }

export const TANK_SUBSTRATES: TankSubstrate[] = ['sand', 'mud', 'none'];
export const TANK_ITEM_TYPES: TankItemType[] = ['stone_s', 'stone_l', 'driftwood', 'shell', 'plant'];
export const TANK_MAX_ITEMS = 12;
export const defaultTankLayout = (): TankLayout => ({ substrate: 'sand', items: [] });

/** Footprint radius (m) used to keep items apart when placing them. */
export const ITEM_RADIUS: Record<TankItemType, number> = { stone_s: 0.02, stone_l: 0.05, driftwood: 0.09, shell: 0.022, plant: 0.04 };

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash3(x: number, y: number, z: number): number {
  let t = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}
/** value noise in 3D, deterministic in position (so shared vertices stay joined) */
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  const x0 = (c(0, 0, 0) * (1 - u) + c(1, 0, 0) * u) * (1 - v) + (c(0, 1, 0) * (1 - u) + c(1, 1, 0) * u) * v;
  const x1 = (c(0, 0, 1) * (1 - u) + c(1, 0, 1) * u) * (1 - v) + (c(0, 1, 1) * (1 - u) + c(1, 1, 1) * u) * v;
  return x0 * (1 - w) + x1 * w;
}

function stone(radius: number, seed: number, scale: Vector3, color: number): Mesh {
  const geo = new IcosahedronGeometry(radius, 3);
  const pos = geo.attributes.position;
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n = noise3(p.x / radius * 1.6 + seed, p.y / radius * 1.6, p.z / radius * 1.6) - 0.5;
    const n2 = noise3(p.x / radius * 4 + seed * 3, p.y / radius * 4, p.z / radius * 4) - 0.5;
    p.multiplyScalar(1 + n * 0.34 + n2 * 0.1);
    pos.setXYZ(i, p.x * scale.x, p.y * scale.y, p.z * scale.z);
  }
  geo.computeVertexNormals();
  const m = new Mesh(geo, new MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }));
  m.position.y = radius * scale.y * 0.78;
  return m;
}

/** A decoration as a group whose origin sits on the sand. The caller lights its meshes and sets the shadows. */
export function buildTankItem(type: TankItemType, seed: number): Group {
  const g = new Group();
  const rnd = mulberry(seed);
  switch (type) {
    case 'stone_s': {
      g.add(stone(0.016 + rnd() * 0.006, seed, new Vector3(1, 0.72, 0.9), [0x6e6a62, 0x7a726a, 0x5f5b58][seed % 3]));
      break;
    }
    case 'stone_l': {
      g.add(stone(0.042 + rnd() * 0.01, seed, new Vector3(1.15, 0.62, 0.95), [0x5d5852, 0x66605a, 0x544f4a][seed % 3]));
      break;
    }
    case 'driftwood': {
      const wood = new MeshStandardMaterial({ color: 0x4b3a2a, roughness: 0.95, metalness: 0 });
      const main = new Mesh(new CylinderGeometry(0.009, 0.015, 0.18, 7), wood);
      main.rotation.z = Math.PI / 2;
      main.rotation.x = 0.25;
      main.position.y = 0.013;
      const branch = new Mesh(new CylinderGeometry(0.004, 0.008, 0.09, 6), wood);
      branch.position.set(0.03, 0.03, 0.01);
      branch.rotation.z = -0.9;
      branch.rotation.x = 0.4;
      const knob = new Mesh(new SphereGeometry(0.014, 10, 8), wood);
      knob.position.set(-0.085, 0.012, 0);
      knob.scale.set(1, 0.8, 0.9);
      g.add(main, branch, knob);
      break;
    }
    case 'shell': {
      const geo = new SphereGeometry(0.02, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const pos = geo.attributes.position, p = new Vector3();
      for (let i = 0; i < pos.count; i++) {   // radial ribs
        p.fromBufferAttribute(pos, i);
        const a = Math.atan2(p.z, p.x);
        const rib = 1 + 0.04 * Math.cos(a * 14);
        pos.setXYZ(i, p.x * rib, p.y * 0.42, p.z * 0.85 * rib);
      }
      geo.computeVertexNormals();
      g.add(new Mesh(geo, new MeshStandardMaterial({ color: 0xdad3c6, roughness: 0.55, metalness: 0 })));
      break;
    }
    case 'plant': {
      const leaf = new MeshStandardMaterial({ color: 0x3f7d3b, roughness: 0.75, metalness: 0, side: DoubleSide });
      const n = 6;
      for (let i = 0; i < n; i++) {
        const h = 0.08 + rnd() * 0.06;
        const geo = new PlaneGeometry(0.011, h, 1, 5).translate(0, h / 2, 0);
        const pos = geo.attributes.position, p = new Vector3();
        for (let k = 0; k < pos.count; k++) {   // blades curve outward and narrow toward the tip
          p.fromBufferAttribute(pos, k);
          const t = p.y / h;
          pos.setXYZ(k, p.x * (1 - 0.6 * t), p.y, t * t * 0.035);
        }
        geo.computeVertexNormals();
        const blade = new Mesh(geo, leaf);
        blade.rotation.y = (i / n) * Math.PI * 2 + rnd() * 0.5;
        blade.rotation.x = 0.1 + rnd() * 0.15;
        blade.castShadow = false;
        g.add(blade);
      }
      break;
    }
    default: break;
  }
  return g;
}
