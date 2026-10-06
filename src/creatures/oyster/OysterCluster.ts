import { Group, Matrix4, Quaternion, Vector3, Vector4, type Camera } from 'three';
import { Rng, hashInts } from '../../core/Rng';
import type { OysterAtlas } from './bake';
import { playerStimulus } from './behavior';
import { makeGenome, seedsFrom, type AgeClass, type DeadState, type OysterGenome } from './genome';
import { DETAIL, OysterShape } from './geometry';
import { OysterIndividual, type OysterLod } from './OysterIndividual';

/**
 * How a clump of oysters builds up, as a reef does: a few old founders cemented on the hard substrate, then
 * generation after generation of spat settling on whatever hard surface is free — the rock between them, but mostly
 * the shells of the oysters already there (oyster larvae settle gregariously, drawn to adult shell). Crowded, they
 * grow up and away from each other, standing on their beaks with the ventral margins toward the light, long and
 * narrow; some have died and gape, or only their cemented lower valve is left; the youngest are fingernail-sized
 * and sit on the older ones' lids.
 *
 * Each placement is checked against the members already there with a few spheres per shell (interlocking a little
 * is allowed — they are cemented on each other — passing through is not) and against the substrate.
 */

export interface SubstrateSample {
  /** surface height (cluster space y) */
  y: number;
  /** outward unit normal */
  n: Vector3;
}

export interface MemberPick {
  genome: OysterGenome;
  shape: OysterShape;
  /** uniform scale applied to the shape (reef prototypes are rescaled to the wanted length) */
  scale: number;
  /** reef prototype index, if any */
  proto?: number;
}

export interface ClusterMember extends MemberPick {
  /** oyster frame → cluster space (includes the scale) */
  matrix: Matrix4;
  /** host plane in the oyster's own (unscaled) frame */
  plane: Vector4;
  /** -1 the substrate, else the index of the member it is cemented on */
  host: number;
  /** gape held by a dead, gaping shell */
  deadGape: number;
  /** collision spheres (cluster space) */
  spheres: { c: Vector3; r: number }[];
  /** where settlers can cement on it (its own frame) */
  attach: { p: Vector3; n: Vector3; upper: boolean }[];
}

export interface ClusterLayoutOptions {
  seed: number;
  /** members wanted */
  count: number;
  /** radius of the footprint on the substrate (m) */
  radius: number;
  deadFraction?: number;
  /** the substrate surface under (x, z) in cluster space (default: a gently uneven plane at y = 0) */
  substrate?: (x: number, z: number) => SubstrateSample;
  /** how members are made (default: a fresh genome and shape each); reefs pick from prototypes */
  pick?: (index: number, age: AgeClass, dead: DeadState, crowding: number, rng: Rng) => MemberPick;
  /** a preferred "up" for growth in cluster space (default +y) */
  up?: Vector3;
}

const defaultSubstrate = (seed: number) => (x: number, z: number): SubstrateSample => {
  const k = 9, a = 0.006;
  const f = (xx: number, zz: number) => a * (Math.sin(xx * k + seed) * Math.cos(zz * k * 0.8 + seed * 0.3) + 0.5 * Math.sin(xx * 23 + zz * 17));
  const e = 0.002;
  const y = f(x, z);
  const n = new Vector3(-(f(x + e, z) - f(x - e, z)) / (2 * e), 1, -(f(x, z + e) - f(x, z - e)) / (2 * e)).normalize();
  return { y, n };
};

function defaultPick(seed: number) {
  return (index: number, age: AgeClass, dead: DeadState, crowding: number): MemberPick => {
    const genome = makeGenome(seedsFrom(hashInts(seed, index, 0xc1)), { age, dead, crowding });
    return { genome, shape: new OysterShape(genome), scale: 1 };
  };
}

const AGES: AgeClass[] = ['old', 'adult', 'juvenile', 'spat'];

/** Lay out a clump of oysters (deterministic in the seed). */
export function layoutCluster(o: ClusterLayoutOptions): ClusterMember[] {
  const rng = new Rng(o.seed);
  const sub = o.substrate ?? defaultSubstrate((o.seed % 1000) / 100);
  const pick = o.pick ?? defaultPick(o.seed);
  const upWorld = (o.up ?? new Vector3(0, 1, 0)).clone().normalize();
  const n = Math.max(1, o.count);
  // who: a few founders, mostly adults, then the young; some dead
  const plan: { age: AgeClass; dead: DeadState; founder: boolean }[] = [];
  const founders = Math.max(1, Math.min(4, Math.round(n * 0.14)));
  for (let i = 0; i < n; i++) {
    let age: AgeClass;
    if (i < founders) age = rng.chance(0.6) ? 'old' : 'adult';
    else { const r = rng.next(); age = r < 0.58 ? 'adult' : r < 0.82 ? 'juvenile' : 'spat'; }
    let dead: DeadState = 0;
    if ((age === 'adult' || age === 'old') && rng.chance(o.deadFraction ?? 0.16)) dead = rng.chance(0.45) ? 2 : 1;
    plan.push({ age, dead, founder: i < founders });
  }
  plan.sort((a, b) => AGES.indexOf(a.age) - AGES.indexOf(b.age));
  const crowding = Math.min(1, 0.25 + n / 25);
  const members: ClusterMember[] = [];
  const m4 = new Matrix4(), q = new Quaternion(), X = new Vector3(), Y = new Vector3(), Z = new Vector3(), tmp = new Vector3(), A = new Vector3(), N = new Vector3();
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const mp = pick(i, p.age, p.dead, p.founder ? crowding * 0.4 : crowding, rng);
    const L = mp.shape.L * mp.scale;
    const localSpheres = mp.shape.collisionSpheres();
    let placed: ClusterMember | null = null;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      // where: the substrate (founders always; others now and then), else on a member already there
      let host = -1;
      const onSub = p.founder || members.length === 0 || rng.chance(p.age === 'spat' ? 0.15 : p.age === 'juvenile' ? 0.3 : 0.5);
      if (onSub) {
        const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * o.radius * (p.founder ? 0.55 : 1);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const s = sub(x, z);
        A.set(x, s.y, z);
        N.copy(s.n);
      } else {
        // a host: bigger shells catch more settlers
        let total = 0;
        for (const m of members) total += m.shape.L * m.scale;
        let t = rng.next() * total;
        host = members.length - 1;
        for (let k = 0; k < members.length; k++) { t -= members[k].shape.L * members[k].scale; if (t <= 0) { host = k; break; } }
        const h = members[host];
        const pts = h.attach;
        if (!pts.length) continue;
        const ap = pts[rng.int(0, pts.length - 1)];
        // a dead single valve has no lid to settle on
        if (h.genome.dead === 2 && ap.upper) continue;
        A.copy(ap.p).applyMatrix4(h.matrix);
        N.copy(ap.n).transformDirection(h.matrix);
        if (ap.upper && h.genome.dead === 1) continue;
      }
      // growth direction: along the host surface, away from the clump and toward the light
      const out = tmp.set(A.x, 0, A.z);
      if (out.lengthSq() < 1e-8) out.set(rng.range(-1, 1), 0, rng.range(-1, 1));
      out.normalize();
      const yaw = rng.range(-1, 1) * (host < 0 ? 2.2 : 1.2);
      Z.copy(out).applyAxisAngle(N, yaw).addScaledVector(upWorld, host < 0 ? 0.2 : 0.8);
      Z.addScaledVector(N, -Z.dot(N));
      if (Z.lengthSq() < 1e-6) Z.set(1, 0, 0).addScaledVector(N, -N.x);
      Z.normalize();
      Y.copy(N);
      X.crossVectors(Y, Z).normalize();
      // rise off the host: founders lie, the crowded stand on their beaks
      // most lie half-propped on what they grew on; a few in the thick of it stand up
      const rise = p.founder ? rng.range(0.02, 0.25) : Math.min(1.05, mp.genome.rise * 0.45 + rng.range(0.05, 0.45) * crowding + (rng.chance(0.15) ? 0.35 : 0));
      q.setFromAxisAngle(X, -rise);
      Y.applyQuaternion(q); Z.applyQuaternion(q);
      m4.makeBasis(X, Y, Z);
      // the contact: well along the lower valve when lying, at the beak when standing
      const sc = Math.max(0.1, 0.5 - 0.32 * Math.min(1, rise / 1.1));
      const Pc = mp.shape.extPoint(0.5, sc, false, new Vector3());
      // cemented: the lower valve sinks into its host's surface (the plane flattening makes the cement scar)
      const embed = mp.genome.embed * mp.shape.L * (host < 0 ? 1.4 : 1.1);
      const pos = A.clone().addScaledVector(N, -embed).sub(Pc.clone().multiplyScalar(mp.scale).applyMatrix4(m4));
      const matrix = new Matrix4().compose(pos, new Quaternion().setFromRotationMatrix(m4), new Vector3(mp.scale, mp.scale, mp.scale));
      // spheres in cluster space
      const spheres = localSpheres.map((s) => ({ c: s.c.clone().applyMatrix4(matrix), r: s.r * mp.scale }));
      // checks: not through the substrate, not through others (a little interlock allowed, more with the host)
      let ok = true;
      for (const s of spheres) {
        const g = sub(s.c.x, s.c.z);
        if (s.c.y - g.y < -0.25 * s.r) { ok = false; break; }
        if (Math.hypot(s.c.x, s.c.z) > o.radius * 1.6 + L) { ok = false; break; }
      }
      for (let k = 0; ok && k < members.length; k++) {
        const allow = k === host ? 0.75 : 0.45;
        for (const a of members[k].spheres) for (const b of spheres) {
          const d = a.c.distanceTo(b.c);
          if (d < a.r + b.r - allow * Math.min(a.r, b.r)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      // the host plane in the oyster's own frame
      const inv = new Matrix4().copy(matrix).invert();
      const nl = N.clone().transformDirection(inv);
      const al = A.clone().applyMatrix4(inv);
      const plane = new Vector4(nl.x, nl.y, nl.z, nl.dot(al));
      placed = { ...mp, matrix, plane, host, deadGape: p.dead === 1 ? rng.range(0.22, 0.62) : 0, spheres, attach: mp.shape.attachPoints(mp.genome.seeds.attachmentSeed ^ 0x9e37, 30) };
    }
    if (placed) members.push(placed);
  }
  return members;
}

export interface OysterClusterOptions extends Omit<ClusterLayoutOptions, 'pick'> {
  atlas: OysterAtlas;
}

/**
 * OysterCluster: 5–30 oysters grown onto each other on a piece of substrate, each a full OysterIndividual with its
 * own unique shell and behaviour. Levels of detail are chosen per oyster by distance; disturbances spread through
 * the clump (a touch shuts the one touched at once, the shake its neighbours).
 */
export class OysterCluster {
  readonly group = new Group();
  readonly members: ClusterMember[];
  readonly oysters: OysterIndividual[] = [];
  private readonly tmp = new Vector3();
  private lodAcc = 1;

  constructor(opts: OysterClusterOptions) {
    this.group.name = 'OysterCluster';
    this.members = layoutCluster(opts);
    for (const m of this.members) {
      const ind = new OysterIndividual({ genome: m.genome, shape: m.shape, atlas: opts.atlas, plane: m.plane, deadGape: m.deadGape, lod: 1, lod0Detail: DETAIL.lod0 });
      ind.root.matrixAutoUpdate = false;
      ind.root.matrix.copy(m.matrix);
      this.group.add(ind.root);
      this.oysters.push(ind);
    }
  }

  /** Pick each oyster's LOD by its distance to the camera (with a little hysteresis). */
  updateLod(camera: Camera, near = 0.9, far = 6, force = false): void {
    camera.getWorldPosition(this.tmp);
    for (const o of this.oysters) {
      const p = new Vector3().setFromMatrixPosition(o.root.matrixWorld);
      const d = p.distanceTo(this.tmp) / Math.max(0.3, o.shape.L / 0.09);
      const cur = o.lod;
      let l: OysterLod = d < near ? 0 : d < far ? 1 : 2;
      if (!force && Math.abs(l - cur) === 1) {
        const edge = l > cur ? (cur === 0 ? near : far) : (cur === 1 ? near : far);
        if (Math.abs(d - edge) < edge * 0.1) l = cur;
      }
      o.setLod(l);
    }
  }

  /**
   * Run every oyster's behaviour: water over each (from the world), and the disturbance of a player or a touch at a
   * point (world space).
   */
  update(dt: number, camera: Camera, waterLevel: number, disturb?: { pos: Vector3; speed: number; running: boolean; touch?: Vector3 | null }, shock = false): void {
    this.lodAcc += dt;
    if (this.lodAcc > 0.2) { this.lodAcc = 0; this.updateLod(camera); }
    const p = this.tmp;
    for (const o of this.oysters) {
      p.setFromMatrixPosition(o.root.matrixWorld);
      let stim = 0;
      if (disturb) {
        stim = playerStimulus(p.distanceTo(disturb.pos), disturb.speed, disturb.running);
        if (disturb.touch) stim = Math.max(stim, Math.max(0, 1 - p.distanceTo(disturb.touch) / 0.18));
      }
      o.update(dt, { depth: waterLevel - p.y, stimulus: stim, shock });
    }
  }

  dispose(): void {
    for (const o of this.oysters) o.dispose();
    this.group.removeFromParent();
  }
}
