import { CatmullRomCurve3, Vector3 } from 'three';
import { Rng } from '../../core/Rng';
import type { HirugiBase, LeafSpec, SaplingSize, TreeSkeleton, WoodPath } from './types';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const polar = (r: number, a: number, y: number) => v(Math.cos(a) * r, y, Math.sin(a) * r);
const BASES = [
  { height: 4.2, spread: 2.6, fork: 1.25, leaders: 4, lean: 0.15, roots: 17, reach: 2.6 },
  { height: 5.6, spread: 2.25, fork: 1.8, leaders: 2, lean: 0.05, roots: 15, reach: 2.35 },
  { height: 4.8, spread: 2.8, fork: 1.35, leaders: 3, lean: 1.25, roots: 18, reach: 3.1 },
  { height: 7.1, spread: 1.85, fork: 3.2, leaders: 3, lean: 0.12, roots: 16, reach: 2.1 },
  { height: 5.0, spread: 2.9, fork: 0.8, leaders: 5, lean: 0.25, roots: 24, reach: 3.35 },
] as const;

/** Five authored silhouettes, not five arbitrary PRNG trees. All instances share these skeletons and their three geometry tiers. */
export function buildSkeleton(base: HirugiBase, sapling: SaplingSize | null = null): TreeSkeleton {
  if (sapling !== null) return juvenile(sapling);
  const b = BASES[base], rng = new Rng(83013 + base * 739), trunk: WoodPath[] = [], branches: WoodPath[] = [], roots: WoodPath[] = [], leaves: LeafSpec[] = [];
  const path = (points: Vector3[], radii: number[], order: number, root = false): WoodPath => ({ points, radii, order, root });
  const fork = v(b.lean * 0.16, b.fork, 0.07);
  trunk.push(path([v(0, -0.14, 0), v(0.015, 0.55, -0.04), fork.clone()], [0.29 + base * 0.014, 0.19 + base * 0.008, 0.17], 0));
  const tufts: LeafSpec[] = [];
  const rosette = (p: Vector3, tangent: Vector3, count: number) => {
    // Rhizophora: 3-4 opposite, decussate pairs crowded within ~5 cm of the shoot tip (photos 20, 43),
    // not a pinnate row along the twig. Young pairs are small and erect, old pairs larger and spread.
    const axis = tangent.clone().normalize();
    const side = v(axis.z, 0, -axis.x).normalize();
    if (side.lengthSq() < 0.1) side.set(1, 0, 0);
    const rot = rng.range(0, Math.PI * 2);
    for (let node = 0; node < count; node++) for (let sign = -1; sign <= 1; sign += 2) {
      const youth = (node + 1) / count, a = rot + node * Math.PI * 0.5, radial = side.clone().applyAxisAngle(axis, a).multiplyScalar(sign);
      const direction = axis.clone().multiplyScalar(0.2 + youth * 0.7).addScaledVector(radial, 1).add(v(0, 0.12 + youth * 0.3, 0)).normalize();
      const center = p.clone().addScaledVector(axis, (node - count + 1) * 0.014).addScaledVector(radial, 0.003);
      const grown = 1 - youth * 0.3;
      leaves.push({ center, axis: direction, roll: rng.range(-0.3, 0.3), length: rng.range(0.105, 0.15) * grown, width: rng.range(0.05, 0.068) * grown,
        age: node === count - 1 ? rng.range(0.05, 0.3) : rng.range(0.4, 1), phase: rng.next() });
    }
    // Red-brown stipule sheathing the terminal bud (photo 20).
    branches.push(path([p.clone(), p.clone().addScaledVector(axis, 0.045)], [0.0042, 0.0006], 3));
  };
  /** A limb from origin to outer with twigs along it, five-to-seven shoots per twig, a tip rosette per shoot. */
  const fan = (origin: Vector3, outer: Vector3, angle: number, twigs: number, sag: number) => {
    const elbow = origin.clone().lerp(outer, 0.5); elbow.y += sag;
    branches.push(path([origin, elbow, outer], [0.054, 0.035, 0.017], 1));
    for (let twig = 0; twig < twigs; twig++) {
      const begin = origin.clone().lerp(outer, 0.2 + twig / (twigs + 3));
      const az = angle + rng.range(-1.2, 1.2), length = rng.range(0.32, 0.73);
      const tip = begin.clone().add(polar(length, az, rng.range(-0.14, 0.44)));
      branches.push(path([begin, begin.clone().lerp(tip, 0.45), tip], [0.017, 0.009, 0.0035], 2));
      const tuft = v(0, 0, 0);
      for (let shoot = 0; shoot < 7; shoot++) {
        const joint = begin.clone().lerp(tip, 0.25 + shoot * 0.125);
        // Shoots turn outward and up so foliage forms a layered outer shell over an open, woody interior.
        const direction = polar(rng.range(0.16, 0.34), az + (shoot - 3) * 0.75 + rng.range(-0.3, 0.3), rng.range(0.04, 0.26));
        const terminal = joint.clone().add(direction);
        branches.push(path([joint, terminal], [0.0065, 0.0035], 3));
        rosette(terminal, direction, rng.int(3, 4)); tuft.addScaledVector(terminal, 1 / 7);
      }
      // One far-LOD foliage card per twig, sized to the spread of its rosettes.
      const cardAxis = polar(1, az, 1.4).normalize(), cardLength = 0.62 + length * 0.4;
      tufts.push({ center: tuft.addScaledVector(cardAxis, -cardLength * 0.5), axis: cardAxis, roll: 0, length: cardLength, width: 0.66 + length * 0.35, age: rng.range(0.3, 0.8), phase: rng.next() });
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
      fan(origin, outer, angle, 10, -0.12);
    }
    // Skirt limbs (user's photos): low branches leave the stem below the crown and droop outward, so the foliage
    // dome reaches down to ~1-1.5 m over the prop roots instead of standing on a bare pole.
    for (let arm = 0; arm < (b.leaders >= 4 ? 1 : 2); arm++) {
      const angle = a + (arm ? 0.9 : -0.9) + rng.range(-0.35, 0.35);
      const origin = start.clone().lerp(mid, rng.range(0.25, 0.6));
      const outer = polar(b.spread * rng.range(0.95, 1.2), angle, Math.min(origin.y, rng.range(1.1, 1.6))); outer.x += b.lean * 0.6;
      fan(origin, outer, angle, 6, 0.25);
    }
  }
  for (let i = 0; i < b.roots; i++) {
    const a = i / b.roots * Math.PI * 2 + rng.range(-0.16, 0.16), reach = b.reach * rng.range(0.63, 1.08);
    const h = rng.range(0.85, Math.min(b.fork + 0.8, 2.65));
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
    const start = attachment.clone().add(polar(0.025,a,0)), r0 = rng.range(0.055, 0.092), wobble = () => rng.range(-0.07, 0.07);
    // Rhizophora prop roots leave the stem outward, arch over a crest and then drop almost vertically.
    // They stay thick down to the mud (no pointed spider-leg tips) and finish 20 cm below the surface.
    const out = polar(reach * 0.2, a + wobble(), h + 0.08 + h * 0.06);
    const crest = polar(reach * 0.44, a + wobble(), h * 0.92 + 0.1);
    const shoulder = polar(reach * 0.7, a + wobble(), h * 0.6);
    const knee = polar(reach * 0.86, a + wobble(), h * 0.2 + 0.05);
    const foot = polar(reach * 0.9, a + wobble(), -0.22);
    roots.push(path([start, out, crest, shoulder, knee, foot], [r0, r0 * 0.86, r0 * 0.74, r0 * 0.66, r0 * 0.6, r0 * 0.56], 0, true));
    // Near the mud a prop root splits into short splayed toes, which anchor it and read as a tangle at the base.
    const toes = rng.int(2, 3);
    for (let j = 0; j < toes; j++) {
      const da = (j - (toes - 1) / 2) * rng.range(0.11, 0.2) + wobble(), joint = shoulder.clone().lerp(knee, rng.range(0.55, 0.85));
      const toe = polar(reach * rng.range(0.82, 1.02), a + da, -0.2), bend = joint.clone().lerp(toe, 0.5); bend.y += 0.05;
      roots.push(path([joint, bend, toe], [r0 * 0.42, r0 * 0.34, r0 * 0.3], 1, true));
    }
    // A secondary arch leapfrogs outward from the crest: the reason old stands become a walkable lattice.
    if (rng.chance(0.75)) {
      const side = a + (rng.chance(0.5) ? 1 : -1) * rng.range(0.14, 0.34), h2 = h * rng.range(0.45, 0.7);
      const from = crest.clone().lerp(shoulder, rng.range(0.15, 0.45));
      const arch = polar(reach * rng.range(0.98, 1.15), side, h2 + 0.08), drop = polar(reach * rng.range(1.22, 1.42), side + wobble(), h2 * 0.25);
      const end2 = drop.clone().setY(-0.2); end2.x *= 1.02; end2.z *= 1.02;
      roots.push(path([from, arch, drop, end2], [r0 * 0.58, r0 * 0.5, r0 * 0.44, r0 * 0.41], 1, true));
      // Thin hanging rootlet: close-range detail only, simplified collision.
      const hang = arch.clone().lerp(drop, 0.3);
      roots.push(path([hang, hang.clone().setY(hang.y * 0.45), hang.clone().setY(-0.15)], [0.016, 0.014, 0.012], 2, true));
    }
  }
  // A few branch-borne aerial roots, descending from a genuine woody attachment to the mud.
  for (let i = 0; i < Math.min(4, trunk.length - 1); i++) {
    const leader = trunk[i + 1], start = leader.points[1].clone();
    const foot = start.clone().multiplyScalar(1.45); foot.y = -0.16;
    roots.push(path([start, start.clone().lerp(foot, 0.48), foot], [0.051, 0.035, 0.013], 1, true));
  }
  return { trunk, branches, roots, leaves, tufts, height: b.height + 0.6, reach: b.reach * 1.3 };
}

function juvenile(size: SaplingSize): TreeSkeleton {
  // User's seedling photo: one straight stem (the propagule's dark hypocotyl at the base), leaf pairs crowded at
  // the tip, short leafy side shoots in the upper half on the larger plants, early arched prop roots on the largest.
  const h = [0.4, 0.85, 1.55][size], rng = new Rng(337 + size);
  const top = v(-0.012, h, 0.01);
  const trunk: WoodPath[] = [{ points: [v(0, -0.12, 0), v(0.004, h * 0.4, 0), v(-0.006, h * 0.75, 0.006), top], radii: [0.014 + size * 0.005, 0.011 + size * 0.004, 0.007 + size * 0.002, 0.004], order: 0, root: false }];
  const branches: WoodPath[] = [], roots: WoodPath[] = [], leaves: LeafSpec[] = [];
  const rosette = (p: Vector3, axis: Vector3, pairs: number, size0: number) => {
    const side = v(axis.z, 0, -axis.x); if (side.lengthSq() < 1e-3) side.set(1, 0, 0); side.normalize();
    const rot = rng.range(0, Math.PI);
    for (let node = 0; node < pairs; node++) for (const sign of [-1, 1]) {
      const youth = (node + 1) / pairs, radial = side.clone().applyAxisAngle(axis, rot + node * Math.PI / 2).multiplyScalar(sign);
      const direction = axis.clone().multiplyScalar(0.3 + youth * 0.9).addScaledVector(radial, 1).add(v(0, 0.15 + youth * 0.3, 0)).normalize();
      const grown = 1 - youth * 0.35;
      leaves.push({ center: p.clone().addScaledVector(axis, (node - pairs + 1) * 0.016), axis: direction, roll: rng.range(-0.2, 0.2),
        length: rng.range(0.095, 0.13) * size0 * grown, width: rng.range(0.045, 0.06) * size0 * grown, age: node === pairs - 1 ? 0.1 : rng.range(0.3, 0.7), phase: rng.next() });
    }
    branches.push({ points: [p.clone(), p.clone().addScaledVector(axis, 0.03)], radii: [0.0035, 0.0006], order: 3, root: false });
  };
  rosette(top, v(-0.02, 1, 0.02).normalize(), [3, 4, 4][size], [0.85, 1, 1.05][size]);
  const laterals = [0, 2, 4][size];
  for (let i = 0; i < laterals; i++) {
    const a = i * 2.4 + 0.5, y = h * (0.5 + 0.4 * i / Math.max(1, laterals - 1)), start = v(0, y, 0);
    const tip = polar(0.1 + size * 0.05 + rng.range(0, 0.05), a, y + 0.08 + size * 0.03);
    branches.push({ points: [start, start.clone().lerp(tip, 0.5).add(v(0, 0.015, 0)), tip], radii: [0.006 + size * 0.0015, 0.0045, 0.003], order: 2, root: false });
    rosette(tip, tip.clone().sub(start).normalize(), 3, 0.92);
  }
  if (size === 2) for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.4;
    roots.push({ points: [v(0, 0.24, 0), polar(0.07, a, 0.25), polar(0.17, a, 0.13), polar(0.21, a, -0.06)], radii: [0.012, 0.011, 0.01, 0.009], order: 0, root: true });
  }
  return { trunk, branches, roots, leaves, tufts: [], height: h + 0.13, reach: 0.35 };
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
