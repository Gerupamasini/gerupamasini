import { CatmullRomCurve3, Vector3 } from 'three';
import { Rng } from '../../core/Rng';
import type { HirugiBase, LeafSpec, SaplingSize, TreeSkeleton, WoodPath } from './types';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const polar = (r: number, a: number, y: number) => v(Math.cos(a) * r, y, Math.sin(a) * r);
const BASES = [
  { height: 4.2, spread: 2.6, fork: 1.25, leaders: 4, lean: 0.15, roots: 13, reach: 2.6 },
  { height: 5.6, spread: 2.25, fork: 1.8, leaders: 2, lean: 0.05, roots: 11, reach: 2.35 },
  { height: 4.8, spread: 2.8, fork: 1.35, leaders: 3, lean: 1.25, roots: 14, reach: 3.1 },
  { height: 7.1, spread: 1.85, fork: 3.2, leaders: 3, lean: 0.12, roots: 12, reach: 2.1 },
  { height: 5.0, spread: 2.9, fork: 0.8, leaders: 5, lean: 0.25, roots: 19, reach: 3.35 },
] as const;

/** Five authored silhouettes, not five arbitrary PRNG trees. All instances share these skeletons and their three geometry tiers. */
export function buildSkeleton(base: HirugiBase, sapling: SaplingSize | null = null): TreeSkeleton {
  if (sapling !== null) return juvenile(sapling);
  const b = BASES[base], rng = new Rng(83013 + base * 739), trunk: WoodPath[] = [], branches: WoodPath[] = [], roots: WoodPath[] = [], leaves: LeafSpec[] = [];
  const path = (points: Vector3[], radii: number[], order: number, root = false): WoodPath => ({ points, radii, order, root });
  const fork = v(b.lean * 0.16, b.fork, 0.07);
  trunk.push(path([v(0, -0.14, 0), v(0.015, 0.55, -0.04), fork.clone()], [0.29 + base * 0.014, 0.19 + base * 0.008, 0.17], 0));
  const rosette = (p: Vector3, tangent: Vector3, count: number) => {
    // Opposite, decussate pairs on internodes near shoot tips. Older leaves are lower and darker.
    const axis = tangent.clone().normalize();
    const side = v(axis.z, 0, -axis.x).normalize();
    if (side.lengthSq() < 0.1) side.set(1, 0, 0);
    const rot = rng.range(0, Math.PI * 2);
    for (let node = 0; node < count; node++) for (let sign = -1; sign <= 1; sign += 2) {
      const a = rot + node * Math.PI * 0.5, radial = side.clone().applyAxisAngle(axis, a).multiplyScalar(sign);
      const direction = axis.clone().multiplyScalar(rng.range(0.15, 0.6)).addScaledVector(radial, rng.range(0.7, 1)).normalize();
      const center = p.clone().addScaledVector(axis, (node - count + 1) * 0.037).addScaledVector(radial, 0.002);
      leaves.push({ center, axis: direction, roll: rng.range(-0.35, 0.35), length: rng.range(0.095, 0.155), width: rng.range(0.043, 0.07), age: node === count - 1 ? rng.range(0.1, 0.35) : rng.range(0.45, 1), phase: rng.next() });
    }
  };
  for (let leader = 0; leader < b.leaders; leader++) {
    const a = leader / b.leaders * Math.PI * 2 + rng.range(-0.2, 0.2);
    const end = polar(b.spread * 0.48, a, b.height * rng.range(0.62, 0.81)); end.x += b.lean;
    const start = base === 4 ? polar(0.11, a, 0.35) : fork.clone();
    const mid = start.clone().lerp(end, 0.48); mid.y += 0.35;
    trunk.push(path([start, mid, end], [0.13 + (base === 4 ? 0.05 : 0), 0.105, 0.058], 0));
    // Each crown is a set of uneven, overlapping branch fans, with open windows rather than a foliage sphere.
    for (let arm = 0; arm < 5; arm++) {
      const angle = a + (arm - 2) * 0.66 + rng.range(-0.3, 0.3);
      const origin = mid.clone().lerp(end, arm / 6);
      const outer = polar(b.spread * rng.range(0.76, 1.06), angle, b.height * rng.range(0.81, 1)); outer.x += b.lean;
      const elbow = origin.clone().lerp(outer, 0.5); elbow.y -= 0.12;
      branches.push(path([origin, elbow, outer], [0.054, 0.035, 0.017], 1));
      for (let twig = 0; twig < 8; twig++) {
        const begin = origin.clone().lerp(outer, 0.22 + twig / 11);
        const az = angle + rng.range(-1.2, 1.2), length = rng.range(0.32, 0.73);
        const tip = begin.clone().add(polar(length, az, rng.range(-0.14, 0.44)));
        branches.push(path([begin, begin.clone().lerp(tip, 0.45), tip], [0.017, 0.009, 0.0035], 2));
        for (let shoot = 0; shoot < 4; shoot++) {
          const joint = begin.clone().lerp(tip, 0.3 + shoot * 0.21);
          const direction = polar(rng.range(0.18, 0.38), az + (shoot - 1.5) * 1.2, rng.range(-0.05, 0.25));
          const terminal = joint.clone().add(direction);
          branches.push(path([joint, terminal], [0.0065, 0.002], 3));
          rosette(terminal, direction, rng.int(5, 7));
        }
      }
    }
  }
  for (let i = 0; i < b.roots; i++) {
    const a = i / b.roots * Math.PI * 2 + rng.range(-0.16, 0.16), reach = b.reach * rng.range(0.63, 1.08);
    const h = rng.range(0.85, Math.min(b.fork + 0.8, 2.65));
    const foot = polar(reach, a, -0.16);
    const shoulder = polar(reach * 0.4, a + rng.range(-0.12, 0.12), h * 0.75);
    const knee = polar(reach * 0.78, a + rng.range(-0.09, 0.09), h * 0.37);
    // Root origins follow an actual stem, including above the fork / on a multi-stem tree.
    // Attaching every root to the central axis would leave floating roots above the low fork.
    const candidates = h <= b.fork ? [trunk[0]] : trunk.slice(1);
    let attachment = v(0,h,0), best = Infinity;
    for (const stem of candidates) {
      const curve = new CatmullRomCurve3(stem.points,false,'centripetal');
      for (let k=0;k<=48;k++) {
        const p=curve.getPoint(k/48), radial=Math.atan2(p.z,p.x), angular=Math.abs(Math.atan2(Math.sin(radial-a),Math.cos(radial-a)));
        const cost=Math.abs(p.y-h)*6+angular*0.08;
        if(cost<best){best=cost;attachment=p;}
      }
    }
    const start = attachment.clone().add(polar(0.025,a,0));
    roots.push(path([start, shoulder, knee, foot], [rng.range(0.095, 0.17), 0.085, 0.058, 0.023], 0, true));
    // Branches off existing prop roots; no invented conical pneumatophores.
    for (let j = 0; j < 2; j++) {
      const joint = j === 0 ? shoulder : knee;
      const sideFoot = polar(reach * rng.range(0.85, 1.2), a + (j ? -1 : 1) * rng.range(0.16, 0.36), -0.16);
      const turn = joint.clone().lerp(sideFoot, 0.55); turn.y += 0.06;
      roots.push(path([joint.clone(), turn, sideFoot], [j ? 0.035 : 0.054, 0.025, 0.011], 1, true));
    }
  }
  // A few branch-borne aerial roots, descending from a genuine woody attachment to the mud.
  for (let i = 0; i < Math.min(4, trunk.length - 1); i++) {
    const leader = trunk[i + 1], start = leader.points[1].clone();
    const foot = start.clone().multiplyScalar(1.45); foot.y = -0.16;
    roots.push(path([start, start.clone().lerp(foot, 0.48), foot], [0.051, 0.035, 0.013], 1, true));
  }
  return { trunk, branches, roots, leaves, height: b.height + 0.6, reach: b.reach * 1.3 };
}

function juvenile(size: SaplingSize): TreeSkeleton {
  const h = [0.4, 0.85, 1.55][size], trunk: WoodPath[] = [{ points: [v(0, -0.12, 0), v(0.006, h * 0.45, 0), v(-0.018, h, 0.014)], radii: [0.012 + size * 0.003, 0.007 + size * 0.002, 0.003], order: 0, root: false }];
  const branches: WoodPath[] = [], roots: WoodPath[] = [], leaves: LeafSpec[] = [];
  const rng = new Rng(337 + size), tips = [v(-0.018, h, 0.014)];
  if (size > 0) for (let i = 0; i < size + 1; i++) {
    const a = i * 2.2, start = v(0, h * (0.48 + i * 0.1), 0), tip = polar(0.12 + size * 0.07, a, h * (0.75 + i * 0.08));
    branches.push({ points: [start, tip], radii: [0.006, 0.0025], order: 1, root: false }); tips.push(tip);
  }
  for (const tip of tips) for (let node = 0; node < 4; node++) for (const sign of [-1, 1]) {
    const a = node * Math.PI / 2 + size * 0.4;
    leaves.push({ center: tip.clone().add(v(0, -node * 0.026, 0)), axis: polar(1, a, 1.1).multiplyScalar(sign).setY(1.1).normalize(), roll: rng.range(-0.2, 0.2), length: rng.range(0.085, 0.125), width: rng.range(0.039, 0.057), age: node === 0 ? 0.12 : 0.45, phase: rng.next() });
  }
  if (size === 2) for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    roots.push({ points: [v(0, 0.22, 0), polar(0.12, a, 0.12), polar(0.25, a, -0.05)], radii: [0.013, 0.009, 0.004], order: 0, root: true });
  }
  return { trunk, branches, roots, leaves, height: h + 0.13, reach: 0.35 };
}

/** Sampling is shared by visible geometry and physics; collision does not depend on the active LOD. */
export function samplePath(p: WoodPath, steps: number): { points: Vector3[]; radii: number[] } {
  const curve = new CatmullRomCurve3(p.points, false, 'centripetal');
  const points: Vector3[] = [], radii: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, k = t * (p.radii.length - 1), j = Math.min(p.radii.length - 2, Math.floor(k));
    points.push(curve.getPoint(t)); radii.push(p.radii[j] + (p.radii[j + 1] - p.radii[j]) * (k - j));
  }
  return { points, radii };
}
