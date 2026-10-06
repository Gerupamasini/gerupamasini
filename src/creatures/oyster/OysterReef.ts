import {
  Frustum, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Sphere, Vector3, Vector4, type BufferGeometry, type Camera,
} from 'three';
import { Rng, hashInts } from '../../core/Rng';
import type { OysterAtlas } from './bake';
import { OysterBehavior, playerStimulus } from './behavior';
import { makeGenome, seedsFrom, type AgeClass, type OysterGenome } from './genome';
import { buildOysterMerged, DETAIL, OysterShape, triangleCount } from './geometry';
import { depthOf, type OysterMaterial } from './material';
import { layoutCluster, type MemberPick, type SubstrateSample } from './OysterCluster';
import { oysterMaterials } from './OysterIndividual';

/**
 * OysterReef: hundreds to thousands of oysters on the hard ground of a map, drawn with a handful of shared shapes.
 *
 *   prototypes   a dozen oyster shapes (adults of several forms, juveniles, spat), each meshed at LOD0 / LOD1 / LOD2
 *                once; every reef oyster is one of them, rescaled, turned, recoloured, fouled, opened its own way
 *   instancing   one InstancedMesh per prototype and LOD, all sharing one material per LOD (three draw-call tiers);
 *                per-instance attributes carry the gape, death, colour, mud, algae, barnacles, erosion and the
 *                attachment plane that presses the lower valve onto its stone or onto the oyster below
 *   placement    every attachment site (a face of a stone in the oyster zone) grows a clump with layoutCluster —
 *                founders on the stone, settlers on their shells, dead gapers and lone lower valves among them —
 *                sitting on the stone's real surface; a few dead valves lie in the mud at the stones' feet
 *   LOD          chosen per clump from the camera distance (a few times a second, with hysteresis); clumps outside
 *                the view or past the far distance are not drawn at all
 *   behaviour    every live oyster has the five-state behaviour (behavior.ts); the near ones are stepped every
 *                frame, the middle distance every few frames, the far ones rarely — they cannot be seen opening
 */

export interface ReefSite {
  /** world point on the hard surface */
  p: Vector3;
  /** outward normal there */
  n: Vector3;
  /** how much room (m) */
  room: number;
  /** the surface near the site (for a clump sitting on the real stone), world space */
  surface?: (world: Vector3, outP: Vector3, outN: Vector3) => void;
}

export interface OysterReefOptions {
  atlas: OysterAtlas;
  sites: ReefSite[];
  seed: number;
  /** the ground under a point (for dead valves lying in the mud) */
  ground?: (x: number, z: number, outN: Vector3) => number;
  quality?: 'low' | 'mid' | 'high';
  /** cap on oysters in the reef */
  maxOysters?: number;
}

interface Proto {
  genome: OysterGenome;
  shape: OysterShape;
  geos: BufferGeometry[];
  meshes: InstancedMesh[];
  /** instance slots used per LOD this pass */
  used: number[];
}

/** one oyster of the reef (structure of arrays below for the hot data) */
const LOD_DIST = { low: [1.6, 8, 32], mid: [2.4, 11, 50], high: [3.2, 15, 65] };
const STRIDE = 16;

export class OysterReef {
  readonly group = new Group();
  readonly count: number;
  private readonly protos: Proto[] = [];
  private readonly materials: OysterMaterial[];
  // per oyster
  private readonly proto: Uint16Array;
  private readonly mat: Float32Array;         // 16 per oyster, world
  private readonly pos: Float32Array;         // 3 per oyster, world centre
  private readonly rad: Float32Array;
  private readonly state: Float32Array;       // 4 per oyster: gape, dead, phase, erosion
  private readonly look: Float32Array;        // 4 per oyster
  private readonly plane: Float32Array;       // 4 per oyster
  private readonly clump: Uint32Array;        // clump index per oyster
  private readonly behaviors: (OysterBehavior | null)[];
  private readonly slot: Int32Array;          // instance slot in its current mesh (−1 not drawn)
  private readonly lodOf: Int8Array;          // −1 not drawn
  private readonly accDt: Float32Array;
  // per clump
  private readonly clumps: { first: number; n: number; centre: Vector3; radius: number; lod: number }[] = [];
  private readonly dist: [number, number, number];
  private lodAcc = 1;
  private frame = 0;
  private lastWater = NaN;
  private readonly frustum = new Frustum();
  private readonly projView = new Matrix4();
  private readonly sphere = new Sphere();
  private readonly tmp = new Vector3();
  private readonly grid = new Map<number, number[]>();
  private readonly lastCam = new Vector3(1e9, 0, 0);
  /** visible oysters per LOD after the last pass (debug HUD) */
  readonly drawn = [0, 0, 0];

  constructor(opts: OysterReefOptions) {
    this.group.name = 'oyster-reef';
    const q = opts.quality ?? 'mid';
    this.dist = LOD_DIST[q] as [number, number, number];
    this.materials = oysterMaterials(opts.atlas);
    this.buildPrototypes(opts);
    const rng = new Rng(hashInts(opts.seed, 0x7eef));
    // lay out every clump into flat arrays
    const P: number[] = [], M: number[] = [], C: number[] = [], R: number[] = [], S: number[] = [], Lk: number[] = [], Pl: number[] = [], K: number[] = [];
    const genomes: OysterGenome[] = [];
    const maxN = opts.maxOysters ?? 4000;
    const m4 = new Matrix4(), siteM = new Matrix4(), q4 = new Quaternion(), X = new Vector3(), Y = new Vector3(), Z = new Vector3(), up = new Vector3(0, 1, 0);
    const cw = new Vector3(), sp = new Vector3(), sn = new Vector3(), inv = new Matrix4();
    // in a shuffled order, so a cap on the total thins the reef evenly instead of cutting off its far end
    const order = opts.sites.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
    for (let oi = 0; oi < order.length && P.length < maxN; oi++) {
      const si = order[oi];
      const site = opts.sites[si];
      // the clump's frame: y out of the stone, z up the slope (oysters on a steep face grow upward)
      Y.copy(site.n).normalize();
      Z.copy(up).addScaledVector(Y, -up.dot(Y));
      if (Z.lengthSq() < 1e-4) Z.set(1, 0, 0).addScaledVector(Y, -Y.x);
      Z.normalize().applyAxisAngle(Y, rng.range(-0.6, 0.6));
      X.crossVectors(Y, Z).normalize();
      siteM.makeBasis(X, Y, Z).setPosition(site.p);
      inv.copy(siteM).invert();
      const r = rng.next();
      const count = r < 0.15 ? rng.int(3, 7) : r < 0.6 ? rng.int(9, 18) : rng.int(18, 30);
      const radius = Math.min(site.room * 0.6, 0.05 + 0.009 * count);
      const upLocal = up.clone().transformDirection(inv);
      const substrate = site.surface
        ? (x: number, z: number): SubstrateSample => {
          // onto the real stone: from the plane point toward the stone's surface (twice, to land under (x, z))
          cw.set(x, 0, z).applyMatrix4(siteM);
          site.surface!(cw, sp, sn);
          const l = sp.clone().applyMatrix4(inv);
          cw.set(2 * x - l.x, 0, 2 * z - l.z).applyMatrix4(siteM);
          site.surface!(cw, sp, sn);
          const l2 = sp.applyMatrix4(inv);
          return { y: l2.y, n: sn.clone().transformDirection(inv) };
        }
        : undefined;
      const members = layoutCluster({
        seed: hashInts(opts.seed, si), count, radius, substrate, up: upLocal, deadFraction: 0.18,
        pick: (i, age, dead, crowd, rr) => this.pick(opts.seed, si, i, age, dead, crowd, rr),
      });
      const first = P.length;
      for (const m of members) {
        if (P.length >= maxN) break;
        m4.multiplyMatrices(siteM, m.matrix);
        P.push(m.proto ?? 0);
        M.push(...m4.elements);
        const c = new Vector3(0, 0, m.shape.L * 0.45).applyMatrix4(m4);
        C.push(c.x, c.y, c.z);
        R.push(m.shape.L * m.scale * 0.6);
        S.push(m.genome.dead === 1 ? m.deadGape : 0, m.genome.dead, (m.genome.seeds.colorSeed % 1000) / 1000, m.genome.erosion);
        Lk.push(m.genome.colorKey, m.genome.mud, m.genome.algae, m.genome.barnacles);
        Pl.push(m.plane.x, m.plane.y, m.plane.z, m.plane.w);
        K.push(this.clumps.length);
        genomes.push(m.genome);
      }
      const n = P.length - first;
      if (n > 0) {
        const centre = new Vector3();
        for (let k = first; k < P.length; k++) centre.add(this.tmp.set(C[k * 3], C[k * 3 + 1], C[k * 3 + 2]));
        centre.divideScalar(n);
        let rad = 0;
        for (let k = first; k < P.length; k++) rad = Math.max(rad, centre.distanceTo(this.tmp.set(C[k * 3], C[k * 3 + 1], C[k * 3 + 2])) + R[k]);
        this.clumps.push({ first, n, centre, radius: rad, lod: -1 });
      }
      // dead valves lying in the mud at the stone's foot
      if (opts.ground && rng.chance(0.5) && P.length < maxN) {
        const nLit = rng.int(1, 4);
        const firstL = P.length;
        for (let k = 0; k < nLit && P.length < maxN; k++) {
          const a = rng.range(0, Math.PI * 2), d = rng.range(0.25, 1.1);
          const x = site.p.x + Math.cos(a) * d, z = site.p.z + Math.sin(a) * d;
          const gy = opts.ground(x, z, sn);
          if (gy > site.p.y + 0.05) continue;
          const pick = this.pick(opts.seed, si, 100 + k, rng.chance(0.7) ? 'adult' : 'juvenile', 2, 0.5, rng);
          const flip = rng.chance(0.45);
          q4.setFromUnitVectors(up, sn);
          q4.multiply(new Quaternion().setFromAxisAngle(up, rng.range(0, Math.PI * 2)));
          if (flip) q4.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI));
          const L = pick.shape.L;
          // lying: the valve's rim or its belly on the mud, sunk a little
          const lift = flip ? -L * 0.01 : pick.genome.cupDepth * L * 0.75;
          m4.compose(new Vector3(x, gy + lift * pick.scale, z), q4, new Vector3(pick.scale, pick.scale, pick.scale));
          P.push(pick.proto ?? 0);
          M.push(...m4.elements);
          const c = new Vector3(0, 0, L * 0.45).applyMatrix4(m4);
          C.push(c.x, c.y, c.z);
          R.push(L * pick.scale * 0.6);
          S.push(0, 2, (pick.genome.seeds.colorSeed % 1000) / 1000, Math.min(1, pick.genome.erosion + 0.3));
          Lk.push(pick.genome.colorKey, Math.min(1, pick.genome.mud + 0.3), pick.genome.algae, pick.genome.barnacles * 0.5);
          Pl.push(0, 0, 0, 0);
          K.push(this.clumps.length);
          genomes.push(pick.genome);
        }
        const n2 = P.length - firstL;
        if (n2 > 0) {
          const centre = new Vector3();
          for (let k = firstL; k < P.length; k++) centre.add(this.tmp.set(C[k * 3], C[k * 3 + 1], C[k * 3 + 2]));
          centre.divideScalar(n2);
          let rad = 0;
          for (let k = firstL; k < P.length; k++) rad = Math.max(rad, centre.distanceTo(this.tmp.set(C[k * 3], C[k * 3 + 1], C[k * 3 + 2])) + R[k]);
          this.clumps.push({ first: firstL, n: n2, centre, radius: rad, lod: -1 });
        }
      }
    }
    this.count = P.length;
    this.proto = Uint16Array.from(P);
    this.mat = Float32Array.from(M);
    this.pos = Float32Array.from(C);
    this.rad = Float32Array.from(R);
    this.state = Float32Array.from(S);
    this.look = Float32Array.from(Lk);
    this.plane = Float32Array.from(Pl);
    this.clump = Uint32Array.from(K);
    this.slot = new Int32Array(this.count).fill(-1);
    this.lodOf = new Int8Array(this.count).fill(-1);
    this.accDt = new Float32Array(this.count);
    this.behaviors = genomes.map((g, i) => (g.dead ? null : new OysterBehavior(g.gapeMax, hashInts(opts.seed, i, 0xbe), 'LOW_TIDE_CLOSED')));
    for (let i = 0; i < this.count; i++) {
      const key = this.cellKey(this.pos[i * 3], this.pos[i * 3 + 2]);
      let l = this.grid.get(key);
      if (!l) { l = []; this.grid.set(key, l); }
      l.push(i);
    }
    // one instanced mesh per prototype and LOD, sized for every oyster of that prototype
    const perProto = new Array(this.protos.length).fill(0);
    for (let i = 0; i < this.count; i++) perProto[this.proto[i]]++;
    this.protos.forEach((p, pi) => {
      for (let l = 0; l < 3; l++) {
        const cap = Math.max(1, perProto[pi]);
        const geo = p.geos[l];
        geo.setAttribute('iState', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
        geo.setAttribute('iLook', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
        geo.setAttribute('iPlane', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
        const mesh = new InstancedMesh(geo, this.materials[l], cap);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = l < 2;
        mesh.receiveShadow = true;
        mesh.customDepthMaterial = depthOf(this.materials[l]);
        mesh.name = `oyster-p${pi}-lod${l}`;
        p.meshes.push(mesh);
        this.group.add(mesh);
      }
    });
  }

  /** the prototype set: adults of several forms (crowded and solitary), juveniles, spat */
  private buildPrototypes(opts: OysterReefOptions): void {
    const kinds: { age: AgeClass; crowd: number }[] = [
      { age: 'old', crowd: 0.8 }, { age: 'old', crowd: 0.3 },
      { age: 'adult', crowd: 0.9 }, { age: 'adult', crowd: 0.7 }, { age: 'adult', crowd: 0.55 }, { age: 'adult', crowd: 0.4 }, { age: 'adult', crowd: 0.2 }, { age: 'adult', crowd: 0.65 },
      { age: 'juvenile', crowd: 0.6 }, { age: 'juvenile', crowd: 0.3 },
      { age: 'spat', crowd: 0.5 }, { age: 'spat', crowd: 0.2 },
    ];
    kinds.forEach((k, i) => {
      const genome = makeGenome(seedsFrom(hashInts(opts.seed, i, 0x9a07)), { age: k.age, crowding: k.crowd, variant: i % 6 });
      const shape = new OysterShape(genome);
      const geos = [buildOysterMerged(shape, DETAIL.lod0, opts.atlas.layout), buildOysterMerged(shape, DETAIL.lod1, opts.atlas.layout), buildOysterMerged(shape, DETAIL.lod2, opts.atlas.layout)];
      this.protos.push({ genome, shape, geos, meshes: [], used: [0, 0, 0] });
    });
  }

  /** a member for a clump: one of the prototypes of the right age, rescaled; its own look from its own seeds */
  private pick(seed: number, site: number, i: number, age: AgeClass, dead: 0 | 1 | 2, crowd: number, rng: Rng): MemberPick {
    const young = age === 'spat' || age === 'juvenile';
    const cands = this.protos.map((p, k) => ({ p, k })).filter(({ p }) => (p.genome.age === 'spat' || p.genome.age === 'juvenile') === young && (age !== 'spat' || p.genome.age === 'spat'));
    const { p, k } = cands[rng.int(0, cands.length - 1)];
    const genome = makeGenome(seedsFrom(hashInts(seed, site, i, 0x3e3)), { age, dead, crowding: crowd });
    const scale = Math.min(1.5, Math.max(0.6, genome.length / p.shape.L));
    return { genome, shape: p.shape, scale, proto: k };
  }

  private cellKey(x: number, z: number): number {
    return Math.floor(x / 2) * 100003 + Math.floor(z / 2);
  }

  /** Oysters within r of a point (world). */
  near(x: number, z: number, r: number): number[] {
    const out: number[] = [];
    for (let gx = Math.floor((x - r) / 2); gx <= Math.floor((x + r) / 2); gx++) for (let gz = Math.floor((z - r) / 2); gz <= Math.floor((z + r) / 2); gz++) {
      const l = this.grid.get(gx * 100003 + gz);
      if (!l) continue;
      for (const i of l) if (Math.hypot(this.pos[i * 3] - x, this.pos[i * 3 + 2] - z) <= r) out.push(i);
    }
    return out;
  }

  /** world centre of an oyster */
  centreOf(i: number, out = new Vector3()): Vector3 {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }

  /** behaviour state of an oyster (debug, markers) */
  stateOf(i: number): string {
    return this.behaviors[i]?.state ?? (this.state[i * 4 + 1] ? 'DEAD' : 'CLOSED');
  }

  /** One oyster was touched (by the net's hoop). */
  touchOne(i: number): void {
    this.behaviors[i]?.touch();
  }

  /** Something touched the reef at a point (a net, a hand): every oyster within r shuts. */
  touch(p: Vector3, r = 0.25): void {
    for (const i of this.near(p.x, p.z, r + 0.2)) {
      if (this.tmp.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).distanceTo(p) < r) this.behaviors[i]?.touch();
    }
  }

  /**
   * Per frame: LOD and culling a few times a second, behaviour at a rate falling with distance, gapes written to the
   * instance attributes of the oysters being drawn.
   */
  update(dt: number, camera: Camera, waterLevel: number, player?: { pos: Vector3; speed: number; running: boolean }): void {
    this.frame++;
    const shock = Number.isFinite(this.lastWater) && Math.abs(waterLevel - this.lastWater) > 0.08;
    this.lastWater = waterLevel;
    this.lodAcc += dt;
    const cp = camera.position;
    if (this.lodAcc > 0.25 || cp.distanceTo(this.lastCam) > 1.5) { this.lodAcc = 0; this.lastCam.copy(cp); this.assign(camera); }
    // behaviour: near every frame, middle every 4th, far every 16th (their dt accumulates)
    const near = player ? new Set(this.near(player.pos.x, player.pos.z, 4.5)) : null;
    for (let i = 0; i < this.count; i++) {
      const b = this.behaviors[i];
      if (!b) continue;
      const l = this.lodOf[i];
      const every = l === 0 ? 1 : l === 1 ? 4 : 16;
      this.accDt[i] += dt;
      if (((this.frame + i) % every) !== 0 && !shock && !(near && near.has(i))) continue;
      const step = this.accDt[i];
      this.accDt[i] = 0;
      const y = this.pos[i * 3 + 1];
      let stim = 0;
      if (player && near && near.has(i)) stim = playerStimulus(this.tmp.set(this.pos[i * 3], y, this.pos[i * 3 + 2]).distanceTo(player.pos), player.speed, player.running);
      const g = b.update(step, { depth: waterLevel - y, stimulus: stim, shock: shock && waterLevel > y });
      this.state[i * 4] = g;
      const s = this.slot[i];
      if (s >= 0 && l < 2) {
        const at = this.protos[this.proto[i]].meshes[l].geometry.getAttribute('iState') as InstancedBufferAttribute;
        at.array[s * 4] = g;
        at.needsUpdate = true;
      }
    }
  }

  /** choose each clump's LOD (or none) and fill the instance buffers */
  private assign(camera: Camera): void {
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const cp = camera.position;
    for (const p of this.protos) p.used.fill(0);
    this.drawn.fill(0);
    const [d0, d1, d2] = this.dist;
    for (const c of this.clumps) {
      const d = cp.distanceTo(c.centre) - c.radius;
      let l = d < d0 ? 0 : d < d1 ? 1 : d < d2 ? 2 : -1;
      // hysteresis: stay one step finer within 10 % of the boundary
      if (c.lod >= 0 && l === c.lod + 1) { const edge = this.dist[c.lod]; if (d < edge * 1.1) l = c.lod; }
      this.sphere.center.copy(c.centre);
      this.sphere.radius = c.radius + 1.5;
      if (l >= 0 && !this.frustum.intersectsSphere(this.sphere)) l = -1;
      c.lod = l;
      for (let i = c.first; i < c.first + c.n; i++) {
        this.lodOf[i] = l;
        this.slot[i] = -1;
        if (l < 0) continue;
        const p = this.protos[this.proto[i]];
        const s = p.used[l]++;
        this.slot[i] = s;
        const mesh = p.meshes[l];
        (mesh.instanceMatrix.array as Float32Array).set(this.mat.subarray(i * STRIDE, i * STRIDE + 16), s * 16);
        const geo = mesh.geometry;
        (geo.getAttribute('iState').array as Float32Array).set(this.state.subarray(i * 4, i * 4 + 4), s * 4);
        (geo.getAttribute('iLook').array as Float32Array).set(this.look.subarray(i * 4, i * 4 + 4), s * 4);
        (geo.getAttribute('iPlane').array as Float32Array).set(this.plane.subarray(i * 4, i * 4 + 4), s * 4);
        this.drawn[l]++;
      }
    }
    for (const p of this.protos) for (let l = 0; l < 3; l++) {
      const mesh = p.meshes[l];
      mesh.count = p.used[l];
      mesh.visible = mesh.count > 0;
      if (!mesh.count) continue;
      mesh.instanceMatrix.needsUpdate = true;
      for (const name of ['iState', 'iLook', 'iPlane']) (mesh.geometry.getAttribute(name) as InstancedBufferAttribute).needsUpdate = true;
    }
  }

  /** triangles per LOD of the prototype set (debug) */
  stats(): { oysters: number; clumps: number; drawn: number[]; protoTris: number[] } {
    const protoTris = [0, 0, 0];
    for (const p of this.protos) for (let l = 0; l < 3; l++) protoTris[l] += triangleCount(p.geos[l]) / this.protos.length;
    return { oysters: this.count, clumps: this.clumps.length, drawn: [...this.drawn], protoTris: protoTris.map(Math.round) };
  }

  /** The clump nearest a point within r, as (centre, count), or null (teleports, markers). */
  nearestClump(x: number, z: number, r = Infinity, minN = 10, yRange: [number, number] = [-1, 0.2]): { centre: Vector3; n: number } | null {
    let best: { centre: Vector3; n: number } | null = null, bd = r;
    for (const c of this.clumps) {
      if (c.n < minN || c.centre.y < yRange[0] || c.centre.y > yRange[1]) continue;
      const d = Math.hypot(c.centre.x - x, c.centre.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const p of this.protos) { for (const g of p.geos) g.dispose(); for (const m of p.meshes) m.dispose(); }
  }
}


