import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from 'three';
import { Rng, hashInts } from '../../core/Rng';
import { CORAL_IDS, type CoralLod, type CoralSpecies, type CoralVariant } from './types';
import { unifiedCoralGeometry, type CoralGrowthAxis } from './geometry-union';

const TAU = Math.PI * 2;
class Surface {
  p: number[] = [];
  uv: number[] = [];
  tip: number[] = [];
  ix: number[] = [];
  v(p: Vector3, u: number, v: number, tip = 0): number {
    const n = this.p.length / 3;
    this.p.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    this.tip.push(tip);
    return n;
  }
  tri(a: number, b: number, c: number): void {
    this.ix.push(a, b, c);
  }
  finish(name: string): BufferGeometry {
    const g = new BufferGeometry();
    g.name = name;
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aGrowth', new Float32BufferAttribute(this.tip, 1));
    g.setIndex(this.ix);
    g.computeVertexNormals();
    // UV seams have separate vertices, but a smooth living surface has one normal there.
    const normals = g.getAttribute('normal'),
      groups = new Map<string, number[]>();
    for (let i = 0; i < this.p.length / 3; i++) {
      const k = `${Math.round(this.p[i * 3] * 1e6)},${Math.round(this.p[i * 3 + 1] * 1e6)},${Math.round(this.p[i * 3 + 2] * 1e6)}`;
      const group = groups.get(k);
      if (group) group.push(i);
      else groups.set(k, [i]);
    }
    const n = new Vector3();
    for (const group of groups.values())
      if (group.length > 1) {
        n.set(0, 0, 0);
        for (const i of group) n.add(new Vector3().fromBufferAttribute(normals, i));
        n.normalize();
        for (const i of group) normals.setXYZ(i, n.x, n.y, n.z);
      }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** A curved living axis with a hemispherical axial tip, rather than an open cylinder or cone. */
function branch(
  b: Surface,
  points: Vector3[],
  radius: number,
  lod: CoralLod,
  terminal = true,
  broken = false,
  farProxy = false,
): void {
  const small = radius < 0.018,
    curve = new CatmullRomCurve3(points),
    closeFinger = lod === 0 && terminal && radius >= 0.018,
    steps = closeFinger
      ? Math.min(32, Math.max(9, Math.ceil(curve.getLength() / 0.007)))
      : farProxy
        ? 1
        : (small ? [4, 2, 1] : [9, 4, 2])[lod],
    sides = farProxy ? 3 : closeFinger ? 16 : (small ? [8, 6, 4] : [12, 7, 4])[lod],
    capSteps = terminal && !broken ? (lod === 0 ? (small ? 3 : 5) : [0, 2, 1][lod]) : 0,
    offset = b.p.length / 3;
  let side = new Vector3(1, 0, 0),
    length = 0,
    prev = points[0];
  const end = curve.getPoint(1),
    endDir = curve.getTangent(1).normalize(),
    endRadius = radius * (terminal ? 0.72 : 0.8);
  for (let row = 0; row <= steps + capSteps; row++) {
    const t = Math.min(1, row / steps),
      cap = row > steps ? (((row - steps) / capSteps) * Math.PI) / 2 : 0,
      p =
        row > steps
          ? end
              .clone()
              .addScaledVector(
                endDir,
                Math.sin(cap) * endRadius - (lod === 0 && row === steps + capSteps ? endRadius * 0.19 : 0),
              )
          : curve.getPoint(t),
      dir = row > steps ? endDir : curve.getTangent(t).normalize();
    side.addScaledVector(dir, -side.dot(dir)).normalize();
    if (side.lengthSq() < 0.1) side.set(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
    const up = dir.clone().cross(side).normalize();
    length += p.distanceTo(prev);
    prev = p;
    const shaftRadius = radius * (1 - (terminal ? 0.28 : 0.2) * t),
      r = row > steps ? endRadius * Math.cos(cap) : shaftRadius;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * TAU,
        // Very shallow skeletal irregularity; corallites themselves belong to the surface shader.
        relief = 1 + 0.025 * Math.sin(a * 3 + t * 6) + 0.012 * Math.sin(a * 7 - t * 11),
        band = length / 0.009,
        ring = Math.floor(band),
        stagger = Math.sin(ring * 17.13 + points[0].x * 28.9) * 0.43,
        around = (a / TAU) * 10 + stagger,
        angular = around - Math.floor(around) - 0.5,
        axial = band - ring - 0.5,
        cupLip =
          closeFinger && row < steps ? 0.00115 * Math.exp(-24 * angular * angular - 19 * axial * axial) : 0,
        livingRadius = r * relief + cupLip,
        p0 = p
          .clone()
          .addScaledVector(side, Math.cos(a) * livingRadius)
          .addScaledVector(up, Math.sin(a) * livingRadius);
      b.v(p0, (j / sides) * TAU * radius, length, terminal && !broken ? Math.max(0, (t - 0.82) / 0.18) : 0);
    }
  }
  for (let i = 0; i < steps + capSteps; i++)
    for (let j = 0; j < sides; j++) {
      const a = offset + i * (sides + 1) + j,
        c = a + sides + 1;
      b.tri(a, a + 1, c);
      b.tri(a + 1, c + 1, c);
    }
  const base = b.v(points[0], 0, 0);
  for (let j = 0; j < sides; j++) b.tri(base, offset + j + 1, offset + j);
  if (!capSteps) {
    const top = b.v(end, 0, length),
      row = offset + steps * (sides + 1);
    for (let j = 0; j < sides; j++) b.tri(top, row + j, row + j + 1);
  }
}

interface Lobe {
  direction: Vector3;
  width: number;
  amplitude: number;
}
/** Fused growth lobes on a closed, broad-shouldered colony; no overlapping sphere seams. */
function mound(b: Surface, rng: Rng, lod: CoralLod, radius: number, height: number, brain = false): void {
  const baseDetail = radius < 0.45 ? 0.42 : 1,
    slices = Math.max(12, Math.round([176, 48, 18][lod] * baseDetail)),
    rings = Math.max(6, Math.round([112, 32, 12][lod] * baseDetail)),
    offset = b.p.length / 3,
    phase = rng.range(0, TAU),
    lobes: Lobe[] = [];
  for (let i = 0; i < (brain ? 8 : radius > 0.45 ? 8 : 11); i++) {
    const a = rng.range(0, TAU),
      t = brain || radius < 0.45 ? rng.range(0.18, 1.47) : Math.acos(rng.range(0.1, 0.86));
    lobes.push({
      direction: new Vector3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)),
      width: rng.range(brain ? 0.04 : 0.035, brain ? 0.11 : 0.09),
      amplitude: rng.range(
        brain ? 0.015 : radius > 0.45 ? 0.22 : 0.08,
        brain ? 0.045 : radius > 0.45 ? 0.42 : 0.18,
      ),
    });
  }
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j <= slices; j++) {
      const t = i / rings,
        theta = (t * Math.PI) / 2,
        a = (j / slices) * TAU,
        st = Math.sin(theta),
        ct = Math.cos(theta),
        n = new Vector3(st * Math.cos(a), ct, st * Math.sin(a));
      let bulge = 1,
        support = 1;
      const massive = !brain && radius > 0.45;
      for (const lobe of lobes) {
        const influence = lobe.amplitude * Math.exp((n.dot(lobe.direction) - 1) / lobe.width);
        bulge += influence;
        if (massive) {
          // Calcified lobes continue into the substrate; they do not perch on a narrower mushroom foot.
          const supportAngle = Math.min(theta, Math.acos(lobe.direction.y));
          const dot =
            Math.sin(supportAngle) * (Math.cos(a) * lobe.direction.x + Math.sin(a) * lobe.direction.z) +
            Math.cos(supportAngle) * lobe.direction.y;
          support += lobe.amplitude * Math.exp((dot - 1) / lobe.width);
        }
      }
      const broadness = brain ? 0.93 : 0.94,
        rr = Math.pow(st, broadness) * radius * (massive ? (bulge * 0.25 + support * 0.75) * 0.9 : bulge),
        waist = 1 - 0.045 * Math.cos(a * 3 + phase) * st,
        x = Math.cos(a) * rr * waist + 0.035 * ct * st * Math.sin(phase),
        z = Math.sin(a) * rr * 0.91 * (1 + 0.035 * Math.sin(a * 2 + phase)),
        y = height * Math.pow(Math.max(0, ct), brain ? 0.93 : 0.9) * (1 + (bulge - 1) * 0.7);
      const p = new Vector3(x, y, z);
      // Skeleton-scale irregularity is non-directional. The material supplies the millimetre canals/cups.
      if (lod < 2) {
        const fine = 0.0014 * Math.sin(x * 67 + y * 23) * Math.sin(z * 71 - y * 31) * Math.sin(t * Math.PI);
        p.addScaledVector(n, fine);
      }
      b.v(p, (j / slices) * radius * TAU, t * height * Math.PI);
    }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < slices; j++) {
      const a = offset + i * (slices + 1) + j,
        c = a + slices + 1;
      b.tri(a, a + 1, c);
      b.tri(a + 1, c + 1, c);
    }
  const centre = b.v(new Vector3(), 0, 0);
  for (let j = 0; j < slices; j++)
    b.tri(centre, offset + rings * (slices + 1) + j, offset + rings * (slices + 1) + j + 1);
}

/** Corymbose, stout fingers grow from a buried radiating scaffold, not a ring of detached sticks. */
function fingers(b: Surface, rng: Rng, lod: CoralLod, variant: number): BufferGeometry | undefined {
  // Consume the same basal shape seed at every tier; only the distant proxy needs this buried crust mesh.
  mound(lod === 2 ? b : new Surface(), rng, 2, 0.235 + variant * 0.008, 0.023);
  const axes: CoralGrowthAxis[] = [];
  const emit = (points: Vector3[], radius: number, terminal: boolean, broken = false): void => {
    if (lod < 2) axes.push({ points, radius, terminal, broken });
    else branch(b, points, radius, lod, terminal, broken, true);
  };
  const arms = 12 + variant * 2,
    phase = rng.range(0, TAU),
    stretch = [1.0, 1.13, 0.93, 1.04][variant];
  for (let i = 0; i < arms; i++) {
    const a = phase + (i / arms) * TAU + rng.range(-0.16, 0.16),
      reach = rng.range(0.28, 0.41) * stretch,
      root = new Vector3(Math.cos(a) * 0.045, 0.016, Math.sin(a) * 0.045),
      middle = new Vector3(
        Math.cos(a + 0.1) * reach * 0.58,
        rng.range(0.1, 0.15),
        Math.sin(a + 0.1) * reach * 0.58,
      ),
      end = new Vector3(Math.cos(a) * reach, rng.range(0.13, 0.2), Math.sin(a) * reach * 0.93),
      skeleton = new CatmullRomCurve3([root, middle, end]);
    const axisRadius = rng.range(0.032, 0.044),
      showAxis = lod < 2 || i % 2 === 0;
    if (showAxis) emit([root, middle, end], axisRadius, true);
    const fingers = 6 + (i % 3);
    for (let j = 0; j < fingers; j++) {
      const t = 0.16 + (j / fingers) * 0.82,
        p = skeleton.getPoint(t),
        direction = a + rng.range(-1.25, 1.25),
        spread = rng.range(0.018, 0.055),
        height = rng.range(0.1, 0.17) * (1 - t * 0.15),
        r = rng.range(0.02, 0.03),
        tip = p.clone().add(new Vector3(Math.cos(direction) * spread, height, Math.sin(direction) * spread)),
        mid = p
          .clone()
          .lerp(tip, 0.5)
          .add(new Vector3(rng.range(-0.012, 0.012), 0.018, rng.range(-0.012, 0.012))),
        damaged = rng.next() < 0.045;
      if (lod < 2 || (showAxis && (j === 0 || j === Math.floor(fingers * 0.5) || j === fingers - 1)))
        emit([p, mid, tip], r, true, damaged);
      const forks = j % 3 === 0 ? 2 : 1;
      for (let k = 0; k < forks; k++) {
        const fork = new CatmullRomCurve3([p, mid, tip]).getPoint(rng.range(0.38, 0.65)),
          fa = direction + (k ? -1 : 1) * rng.range(0.8, 1.65),
          finish = fork
            .clone()
            .add(
              new Vector3(
                Math.cos(fa) * rng.range(0.03, 0.06),
                rng.range(0.055, 0.1),
                Math.sin(fa) * rng.range(0.03, 0.06),
              ),
            ),
          fr = r * rng.range(0.72, 0.9);
        if (lod < 2) emit([fork, fork.clone().lerp(finish, 0.5), finish], fr, true);
      }
    }
  }
  return lod < 2
    ? unifiedCoralGeometry(axes, lod as 0 | 1, `acropora_digitifera/v${variant}/LOD${lod}`)
    : undefined;
}

interface TableNode {
  p: Vector3;
  radius: number;
  index: number;
}
/** Anastomosing planar growth graph: unevenly spaced nodes and cross-links remove a radial fishbone pattern. */
function table(b: Surface, rng: Rng, lod: CoralLod, variant: number): void {
  const h = rng.range(0.32, 0.42),
    reach = rng.range(0.66, 0.81),
    phase = rng.range(0, TAU),
    ellipse = 0.78 + variant * 0.035,
    canopyHeight = (x: number, z: number): number =>
      h + (0.055 * Math.hypot(x, z)) / reach + 0.018 * Math.sin(x * 7 + phase) * Math.cos(z * 9 - phase);
  mound(b, rng, lod, 0.15, 0.028);
  branch(
    b,
    [new Vector3(0, 0.02, 0), new Vector3(0.025, h * 0.55, -0.015), new Vector3(0, h + 0.015, 0)],
    0.065,
    lod,
    false,
  );
  for (let arm = 0; arm < 5; arm++) {
    const a = phase + (arm * TAU) / 5 + rng.range(-0.15, 0.15),
      r = rng.range(0.28, 0.43),
      p = new Vector3(Math.cos(a) * r, h, Math.sin(a) * r * ellipse);
    branch(
      b,
      [
        new Vector3(0, h * 0.5, 0),
        p
          .clone()
          .multiplyScalar(0.55)
          .setY(h * 0.86),
        p,
      ],
      0.028,
      lod,
      false,
    );
  }
  if (lod === 2) {
    const slices = 42,
      rings = 4,
      offset = b.p.length / 3;
    for (const face of [1, -1])
      for (let i = 0; i <= rings; i++)
        for (let j = 0; j <= slices; j++) {
          const a = (j / slices) * TAU,
            t = i / rings,
            r = reach * t * (1 + 0.08 * Math.sin(a * 3 + phase) + 0.045 * Math.sin(a * 7 - phase)),
            x = Math.cos(a) * r,
            z = Math.sin(a) * r * ellipse;
          b.v(
            new Vector3(x, canopyHeight(x, z) + face * (0.023 + 0.01 * (1 - t)), z),
            x,
            z,
            t > 0.9 ? 0.6 : 0,
          );
        }
    const faceSize = (rings + 1) * (slices + 1);
    for (let f = 0; f < 2; f++)
      for (let i = 0; i < rings; i++)
        for (let j = 0; j < slices; j++) {
          const a = offset + f * faceSize + i * (slices + 1) + j,
            c = a + slices + 1;
          if (!f) {
            b.tri(a, a + 1, c);
            b.tri(a + 1, c + 1, c);
          } else {
            b.tri(a, c, a + 1);
            b.tri(a + 1, c, c + 1);
          }
        }
    for (let j = 0; j < slices; j++) {
      const a = offset + rings * (slices + 1) + j,
        c = a + faceSize;
      b.tri(a, c, a + 1);
      b.tri(a + 1, c, c + 1);
    }
    return;
  }
  const nodes: TableNode[] = [{ p: new Vector3(0, canopyHeight(0, 0), 0), radius: 0, index: 0 }],
    target = 370 + variant * 24;
  for (let attempt = 0; attempt < target * 14 && nodes.length < target; attempt++) {
    const a = rng.range(0, TAU),
      r =
        Math.sqrt(rng.next()) *
        reach *
        (1 + 0.08 * Math.sin(a * 3 + phase) + 0.045 * Math.sin(a * 7 - phase)),
      x = Math.cos(a) * r,
      z = Math.sin(a) * r * ellipse,
      p = new Vector3(x, canopyHeight(x, z) + rng.range(-0.008, 0.008), z);
    if (nodes.some((n) => n.p.distanceToSquared(p) < 0.0011)) continue;
    nodes.push({ p, radius: r, index: nodes.length });
  }
  nodes.sort((a, b) => a.radius - b.radius);
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i],
      neighbours = nodes
        .slice(0, i)
        .map((n) => ({ n, d: n.p.distanceToSquared(node.p) }))
        .sort((a, b) => a.d - b.d),
      links = 1 + Number(rng.next() < 0.86 && neighbours.length > 1 && neighbours[1].d < 0.045);
    for (let link = 0; link < links; link++) {
      const parent = neighbours[link].n,
        mid = parent.p
          .clone()
          .lerp(node.p, 0.5)
          .add(new Vector3(rng.range(-0.012, 0.012), rng.range(-0.007, 0.007), rng.range(-0.012, 0.012))),
        path = new CatmullRomCurve3([parent.p, mid, node.p]),
        radius = rng.range(0.009, 0.013) * (1.15 - (node.radius / reach) * 0.3);
      branch(b, [parent.p, mid, node.p], radius, lod, false);
      const shoots = 2;
      for (let k = 0; k < shoots; k++) {
        const p = path.getPoint((k + rng.range(0.18, 0.82)) / shoots),
          a = rng.range(0, TAU),
          rise = rng.range(0.026, 0.055),
          lean = rng.range(0.012, 0.027),
          rad = rng.range(0.0065, 0.009),
          end = p.clone().add(new Vector3(Math.cos(a) * lean, rise, Math.sin(a) * lean)),
          middle = p
            .clone()
            .lerp(end, 0.55)
            .add(new Vector3(0, 0.002, 0));
        if ((lod === 0 && (link === 0 || k === 0)) || (lod === 1 && k === 0 && link === 0))
          branch(b, [p, middle, end], rad, lod);
      }
    }
  }
}

/** Open, overlapping fan/cup sectors grow in a loose spiral, with attached bases and thick living rims. */
function foliose(b: Surface, rng: Rng, lod: CoralLod, variant: number): void {
  mound(b, rng, lod, 0.18, 0.15);
  const plates = 5 + variant,
    steps = [34, 12, 5][lod],
    slices = [102, 36, 14][lod],
    phase = rng.range(0, TAU),
    upper = 0.075 + (plates - 1) * 0.055;
  branch(
    b,
    [new Vector3(0, 0.04, 0), new Vector3(0.015, upper * 0.6, -0.015), new Vector3(0.035, upper, 0)],
    0.085,
    lod,
    false,
  );
  for (let plate = 0; plate < plates; plate++) {
    const tier = plate / (plates - 1),
      start = phase + plate * 2.32 + rng.range(-0.28, 0.28),
      arc = rng.range(1.35, 1.76) * Math.PI,
      radius = (0.61 - tier * 0.19) * rng.range(0.88, 1.1),
      cy = 0.075 + plate * 0.055,
      curl = rng.range(0.075, 0.145),
      tilt = rng.range(-0.025, 0.05),
      frequency = rng.range(2.8, 4.3),
      cx = Math.cos(start + arc * 0.5) * rng.range(0.015, 0.085),
      cz = Math.sin(start + arc * 0.5) * rng.range(0.015, 0.085),
      offset = b.p.length / 3;
    for (const face of [1, -1])
      for (let i = 0; i <= steps; i++)
        for (let j = 0; j <= slices; j++) {
          const t = i / steps,
            s = j / slices,
            a = start + s * arc,
            scallop = 1 + 0.08 * Math.sin(a * frequency + plate) + 0.025 * Math.sin(a * 12 + plate),
            side = Math.pow(Math.sin(Math.PI * s), 0.78),
            // The open ends narrow into the shared calcified base rather than ending as rectangular cuts.
            r = 0.042 + t * radius * scallop * side,
            x = cx * t * side + Math.cos(a) * r,
            z = cz * t * side + Math.sin(a) * r * 0.91,
            flutes =
              0.038 * Math.sin(a * frequency - plate * 0.7) * t * t + 0.015 * Math.sin(a * 9 + t * 4) * t * t,
            rimCurl = curl * Math.pow(t, 4) * (0.55 + 0.45 * side),
            y =
              cy +
              side * (0.045 * t + rimCurl + flutes + tilt * Math.sin(a - start) * t + 0.04 * (1 - side) * t) +
              face * (0.0027 + 0.0012 * t);
          b.v(new Vector3(x, y, z), x, z, Math.max(0, (t - 0.91) / 0.09));
        }
    const row = slices + 1,
      faceSize = (steps + 1) * row;
    for (let f = 0; f < 2; f++)
      for (let i = 0; i < steps; i++)
        for (let j = 0; j < slices; j++) {
          const a = offset + f * faceSize + i * row + j,
            c = a + row;
          if (!f) {
            b.tri(a, a + 1, c);
            b.tri(a + 1, c + 1, c);
          } else {
            b.tri(a, c, a + 1);
            b.tri(a + 1, c, c + 1);
          }
        }
    // Seal outer/inner growth rims and both open fan ends: a two-sided, genuinely thin skeleton.
    for (const edge of [0, steps])
      for (let j = 0; j < slices; j++) {
        const a = offset + edge * row + j,
          c = a + faceSize;
        if (edge) {
          b.tri(a, c, a + 1);
          b.tri(a + 1, c, c + 1);
        } else {
          b.tri(a, a + 1, c);
          b.tri(a + 1, c + 1, c);
        }
      }
    for (const edge of [0, slices])
      for (let i = 0; i < steps; i++) {
        const a = offset + i * row + edge,
          c = a + faceSize;
        if (edge) {
          b.tri(a, a + row, c);
          b.tri(a + row, c + row, c);
        } else {
          b.tri(a, c, a + row);
          b.tri(a + row, c, c + row);
        }
      }
  }
}

/** Four repeatable colony topologies; living surface detail is shared, not one mesh per polyp. */
export function coralGeometry(species: CoralSpecies, variant: CoralVariant, lod: CoralLod): BufferGeometry {
  const b = new Surface(),
    rng = new Rng(hashInts(20261012, CORAL_IDS.indexOf(species), variant));
  let unified: BufferGeometry | undefined;
  if (species === 'acropora_digitifera') unified = fingers(b, rng, lod, variant);
  else if (species === 'acropora_hyacinthus') table(b, rng, lod, variant);
  else if (species === 'montipora_foliosa') foliose(b, rng, lod, variant);
  else if (species === 'platygyra_daedalea')
    mound(b, rng, lod, rng.range(0.82, 0.98), rng.range(0.51, 0.61), true);
  else mound(b, rng, lod, rng.range(0.74, 0.85), rng.range(0.61, 0.72));
  const g = unified ?? b.finish(`${species}/v${variant}/LOD${lod}`);
  g.userData.coral = { species, variant, lod };
  return g;
}
