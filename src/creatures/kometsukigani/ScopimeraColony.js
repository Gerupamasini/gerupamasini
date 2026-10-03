import { Group, Vector3 } from 'three';
import { ScopimeraGlobosa, ScopimeraDriver, makeEnv, seasonFor, STATE } from './ScopimeraGlobosa.js';
import { BurrowRenderer, RENDER_ORDER, shaftAxis } from './Burrows.js';
import { SandPellets } from './SandPellets.js';
import { BURROW, PELLET, SIZE } from './ScopimeraGlobosaMorphology.js';
import { lodFor, updateEvery } from './ScopimeraGlobosaLOD.js';
import { lin } from './ScopimeraGlobosaMaterial.js';
import { clamp, hash01, mulberry, rrange, smoothstep } from './util.js';
import { generateIndividual } from '../Individual';
import { jstParts } from '../../core/Time';
import { hashInts } from '../../core/Rng';

/**
 * The コメツキガニ of the flat as a population living in burrows.
 *
 * Burrows are placed where the species lives — clean, fine sand on the middle and upper flat, exposed for hours at
 * every low tide [L] — in patches, a few to a dozen and more per square metre at the patch cores, spaced a few
 * centimetres apart. They are generated lazily in 4 m cells around the player, deterministically from the map seed,
 * so a place looks the same when the player comes back. Each burrow may have a resident; a few crabs have none and
 * wander (large ones in loose droves on the lower flat [L]).
 *
 * The nearest crabs are "live": a full ScopimeraGlobosa (model, rig, animator, behaviour) and an Individual in the
 * creature system so they can be watched, recorded and netted. Everyone else exists only as a record — in or out,
 * how long the burrow has been dry — and the pellets they would have made are laid out (radiating trips) when the
 * player comes near. Tides wash pellets away, plug burrows, and send everyone down.
 */

const CELL = 4;
const BUCKET = 0.25;
const R_GEN = 26;
const TAU = Math.PI * 2;
const SPECIES_ID = 'scopimera_globosa';

const _v = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _n = new Vector3();
const UP = new Vector3(0, 1, 0);

/** quality: max live crabs, live radius (m), real holes, pellet radius */
const QUALITY = [
  { maxLive: 18, rLive: 5, holes: 16, pelR: 2.2, pelMax: 90 },
  { maxLive: 36, rLive: 7.5, holes: 32, pelR: 3, pelMax: 140 },
  { maxLive: 52, rLive: 9.5, holes: 40, pelR: 3.6, pelMax: 180 },
];

export class ScopimeraColony {
  /**
   * @param o {{ scene, terrain, habitat, tide, creatures, species, removed: Set<string>, seed: number, quality: 0|1|2, shadows: boolean }}
   */
  constructor({ scene, terrain, habitat, tide, creatures, species, removed, seed, quality = 1, shadows = true }) {
    this.terrain = terrain;
    this.habitat = habitat;
    this.tide = tide;
    this.creatures = creatures;
    this.species = species;
    this.removed = removed;
    this.seed = seed >>> 0;
    this.q = QUALITY[quality] ?? QUALITY[1];
    this.shadowsAvailable = shadows;
    this.group = new Group();
    this.group.name = 'kometsukigani';
    this.crabGroup = new Group();
    this.crabGroup.name = 'kometsukigani-crabs';
    this.renderer = new BurrowRenderer();
    this.pellets = new SandPellets({ quality });
    const sand = lin(0.62, 0.52, 0.36);
    this.pellets.setSandColor(sand);
    this.sand = sand;
    this.group.add(this.renderer.group, this.pellets.group, this.crabGroup);
    scene.add(this.group);
    // burrows (struct of arrays, grown as cells are generated)
    this.nB = 0;
    this.B = { x: [], z: [], y: [], r: [], k: [], az: [], seed: [], crab: [], nx: [], ny: [], nz: [], cell: [], cycle: [], pellets: [], open: [], gone: [] };
    this.crabs = [];                    // records
    this.cells = new Map();
    this.buckets = new Map();
    this.live = new Map();              // crab index → { crab, ind, every, lod }
    this.acc = 0;
    this.gameMs = 0;
    this.time = 0;
    this.player = new Vector3();
    this.playerPrev = new Vector3();
    this.playerSpeed = 0;
    this.playerStill = 0;
    this.eyeHeight = 1.5;
    this.sunDir = new Vector3(0, 1, 0);
    this.sunElevation = 45;
    this.tideLevel = 0;
    this.tideRate = 0;
    this.doy = 190;
    this.seasonOverride = null;        // debug: force a day of year
    this.lockedId = null;
    this.cam = new Vector3();
    this.shadowFocus = false;
    this.startles = [];
    this.debugStates = false;
    this.probe = {
      heightAt: (x, z) => this.groundAt(x, z),
    };
    this.liveHash = new Map();
    this.cellExposure = new Map();
    ScopimeraDriver.colony = this;
    ScopimeraColony.active = this;
  }

  static active = null;

  // ======================================================================================== habitat

  /** burrow density (per m²) the species would have here [L]: fine sand, middle and upper flat, in patches */
  densityAt(x, z) {
    const t = this.terrain;
    if (!t.inside(x, z, 6)) return 0;
    const sub = t.substrateAt(x, z);
    const subK = sub === 'sand' ? 1 : sub === 'muddy_sand' ? 0.3 : 0;
    if (!subK) return 0;
    if (t.pitMaskAt(x, z) > 0) return 0;
    const h = t.heightAt(x, z);
    // exposed every low tide, flooded every high tide: about MSL−0.5 … +0.95 m T.P., best around +0.1 … +0.6
    const band = smoothstep(-0.55, -0.15, h) * (1 - smoothstep(0.65, 1.0, h));
    if (band <= 0) return 0;
    // patches: broad (~25 m) and finer (~6 m) structure
    const n1 = valueNoise(x * 0.04 + 3.1, z * 0.04 - 7.3, this.seed);
    const n2 = valueNoise(x * 0.17 - 1.7, z * 0.17 + 2.9, this.seed + 17);
    const patch = smoothstep(0.42, 0.72, n1) * (0.35 + 0.65 * smoothstep(0.3, 0.75, n2));
    return 16 * subK * band * patch;
  }

  cellKey(ci, cj) { return cj * 100003 + ci; }

  /** generate the burrows and crabs of one 4 m cell (deterministic) */
  genCell(ci, cj) {
    const key = this.cellKey(ci, cj);
    if (this.cells.has(key)) return this.cells.get(key);
    const cell = { ci, cj, burrows: [], wanderers: [] };
    this.cells.set(key, cell);
    const x0 = ci * CELL - this.terrain.half, z0 = cj * CELL - this.terrain.half;
    const rand = mulberry(hashI(this.seed, ci, cj, 77));
    // expected count from the density at a few points
    let dens = 0;
    for (let k = 0; k < 9; k++) dens += this.densityAt(x0 + ((k % 3) + 0.5) * CELL / 3, z0 + (Math.floor(k / 3) + 0.5) * CELL / 3);
    dens /= 9;
    if (dens < 0.05) return cell;
    const target = Math.round(dens * CELL * CELL * (0.85 + 0.3 * rand()));
    const placed = [];
    let tries = target * 4;
    while (placed.length < target && tries-- > 0) {
      const x = x0 + rand() * CELL, z = z0 + rand() * CELL;
      const d = this.densityAt(x, z);
      if (rand() * 16 > d) continue;
      // spacing: residents keep a few centimetres apart
      let ok = true;
      for (const p of placed) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < 0.035 * 0.035) { ok = false; break; }
      if (!ok) continue;
      placed.push([x, z]);
      this.addBurrow(cell, x, z, rand);
    }
    // wanderers: burrowless crabs, more where the flat is lower (droves on the lower flat [L])
    const nw = Math.round(target * 0.04 + (rand() < 0.3 ? 1 : 0));
    for (let k = 0; k < nw; k++) {
      const x = x0 + rand() * CELL, z = z0 + rand() * CELL;
      if (this.densityAt(x, z) <= 0) continue;
      const idx = this.addCrab(rand, -1, true);
      if (idx < 0) continue;
      const c = this.crabs[idx];
      c.x = x; c.z = z;
      cell.wanderers.push(idx);
    }
    return cell;
  }

  addBurrow(cell, x, z, rand) {
    const B = this.B, i = this.nB++;
    const y = this.terrain.surfaceAt(x, z);
    this.terrain.normalAt(x, z, _n);
    // residents: most burrows are held [R]
    const resident = rand() < 0.84;
    const crabIdx = resident ? this.addCrab(rand, i, false) : -1;
    const cw = crabIdx >= 0 ? this.crabs[crabIdx].cw_mm / 1000 : rrange(rand, 0.006, 0.009);
    B.x.push(x); B.z.push(z); B.y.push(y);
    B.r.push(cw * 0.5 * rrange(rand, BURROW.entranceDiam[0], BURROW.entranceDiam[1]));
    B.k.push(Math.floor(rand() * 3)); B.az.push(rand() * TAU); B.seed.push(Math.floor(rand() * 4294967295) >>> 0);
    B.crab.push(crabIdx); B.nx.push(_n.x); B.ny.push(_n.y); B.nz.push(_n.z);
    B.cell.push(this.cellKey(cell.ci, cell.cj)); B.cycle.push(-1); B.pellets.push(0); B.open.push(1); B.gone.push(0);
    cell.burrows.push(i);
    const bk = this.bucketKey(x, z);
    let b = this.buckets.get(bk);
    if (!b) { b = []; this.buckets.set(bk, b); }
    b.push(i);
    return i;
  }

  /** a crab record; size distribution by season (juveniles settle late July – October [L]) */
  addCrab(rand, burrow, wanderer) {
    const seed = Math.floor(rand() * 4294967295) >>> 0;
    const id = individualId(seed);
    if (this.removed.has(id)) { rand(); rand(); return -1; }
    const doy = this.doy;
    const juvShare = smoothstep(200, 240, doy) * (1 - smoothstep(320, 365, doy)) * 0.45 + (doy < 120 ? 0.15 : 0);
    const juv = rand() < juvShare && !wanderer;
    let cw = juv ? rrange(rand, 3.5, 5.5) : clamp(SIZE.meanCW_mm + SIZE.sdCW_mm * gauss(rand) + (wanderer ? 1.2 : 0), 5.5, SIZE.maxCW_mm);
    const rec = {
      seed, id, cw_mm: Math.round(cw * 10) / 10, juvenile: juv ? 1 : 0, burrow, wanderer,
      sex: null, x: 0, z: 0, out: false, outUntil: 0, emergeDelay: rrange(rand, 0.6, 1.6), live: null, ind: null, gone: false,
      tripAngle: rand() * TAU,
    };
    this.crabs.push(rec);
    return this.crabs.length - 1;
  }

  bucketKey(x, z) { return Math.floor(z / BUCKET) * 1000003 + Math.floor(x / BUCKET); }

  /** open burrow under (x, z), or -1 */
  burrowAt(x, z, rMax = 0.02) {
    const bx = Math.floor(x / BUCKET), bz = Math.floor(z / BUCKET);
    let best = -1, bestD = rMax;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const b = this.buckets.get((bz + j) * 1000003 + bx + i);
      if (!b) continue;
      for (const k of b) {
        if (this.B.gone[k]) continue;
        const d = Math.hypot(this.B.x[k] - x, this.B.z[k] - z);
        if (d < bestD) { bestD = d; best = k; }
      }
    }
    return best;
  }

  // ======================================================================================== ground probe

  /** the ground a foot stands on: the drawn terrain, dipping into an open burrow mouth, or the top of a pellet */
  groundAt(x, z) {
    let h = this.terrain.surfaceAt(x, z);
    const bx = Math.floor(x / BUCKET), bz = Math.floor(z / BUCKET);
    const b = this.buckets.get(bz * 1000003 + bx);
    if (b) {
      for (const k of b) {
        if (!this.B.open[k] || this.B.gone[k]) continue;
        const r = this.B.r[k] * 1.1, d = Math.hypot(this.B.x[k] - x, this.B.z[k] - z);
        if (d < r) h -= (1 - (d / r) ** 2) * r * 0.9;
      }
    }
    return Math.max(h, this.pellets.heightAt(x, z));
  }

  // ======================================================================================== tide

  /**
   * Seconds this height has been out of the water (Infinity if it has not been covered in the last 14 h), and
   * whether the water will reach it within the next quarter hour. Cached per cell.
   */
  exposureAt(cellKey, y) {
    let e = this.cellExposure.get(cellKey);
    const now = this.gameMs;
    if (e && Math.abs(now - e.at) < 30000) return e;
    // the cell's own height (its first burrow) stands for all of it; whether a burrow is under water right now is
    // read from the water level per burrow
    y = e ? e.y : y;
    const level = this.tideLevel;
    const exposed = level < y - 0.003;
    let since = 0;
    if (exposed) {
      since = Infinity;
      for (let t = 5; t <= 14 * 60; t += 5) {
        if (this.tide.level(now - t * 60000) > y) { since = (t - 2.5) * 60; break; }
      }
    }
    const floodSoon = exposed && this.tide.level(now + 15 * 60000) > y - 0.01;
    // a cycle id: the ten-minute slot the cell came out of the water (pellets belong to one exposure)
    const cycle = exposed ? Math.floor((now / 1000 - (Number.isFinite(since) ? since : 50400)) / 600) : -1;
    e = { at: now, y, exposed, since, floodSoon, cycle };
    this.cellExposure.set(cellKey, e);
    return e;
  }

  // ======================================================================================== frame

  /**
   * @param f {{ dt, gameMs, simScale, camera, player: Vector3, eyeHeight, sunDir, sunElevation, tideLevel, tideRate, lockedId, birds: Vector3[] }}
   */
  update(f) {
    const dt = f.dt;
    this.gameMs = f.gameMs;
    this.time += dt;
    this.tideLevel = f.tideLevel;
    this.tideRate = f.tideRate;
    this.sunDir.copy(f.sunDir);
    this.sunElevation = f.sunElevation;
    this.lockedId = f.lockedId;
    this.cam.copy(f.camera.position);
    this.eyeHeight = f.eyeHeight;
    const p = jstParts(f.gameMs);
    this.doy = this.seasonOverride ?? dayOfYear(p.year, p.month, p.day);
    this.season = seasonFor(this.doy);
    this.light = clamp((f.sunElevation + 4) / 14, 0, 1);
    this.birds = f.birds ?? [];
    // the player's speed and stillness (crabs settle near a motionless observer)
    if (dt > 0) {
      const sp = Math.hypot(f.player.x - this.player.x, f.player.z - this.player.z) / dt;
      this.playerSpeed += (Math.min(sp, 8) - this.playerSpeed) * Math.min(1, dt * 5);
    }
    this.playerPrev.copy(this.player);
    this.player.copy(f.player);
    this.playerStill = this.playerSpeed < 0.12 ? this.playerStill + dt : 0;
    // generation and the live set (a few times a second)
    this.acc += dt;
    if (this.acc > 0.4 || this.live.size === 0 && this.acc > 0.1) {
      this.acc = 0;
      this.generateAround(f.player.x, f.player.z);
      this.refreshLive(f);
      this.abstractTick();
    }
    // startle impulses decay
    for (let i = this.startles.length - 1; i >= 0; i--) if (this.time - this.startles[i].t > 3) this.startles.splice(i, 1);
    this.updateLive(f);
    this.pellets.update(dt, this.cam, (x, z) => this.habitat.waterAt(x, z));
    this.drawGround();
  }

  generateAround(px, pz) {
    const half = this.terrain.half;
    const i0 = Math.floor((px - R_GEN + half) / CELL), i1 = Math.floor((px + R_GEN + half) / CELL);
    const j0 = Math.floor((pz - R_GEN + half) / CELL), j1 = Math.floor((pz + R_GEN + half) / CELL);
    let made = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (this.cells.has(this.cellKey(i, j))) continue;
      this.genCell(i, j);
      if (++made > 6) return;           // spread the work over a few ticks
    }
  }

  /** crabs near a point: [{ idx, d }] (residents by their burrow, wanderers by their last spot) */
  crabsNear(x, z, r) {
    const half = this.terrain.half, out = [];
    const i0 = Math.floor((x - r + half) / CELL), i1 = Math.floor((x + r + half) / CELL);
    const j0 = Math.floor((z - r + half) / CELL), j1 = Math.floor((z + r + half) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = this.cells.get(this.cellKey(i, j));
      if (!cell) continue;
      for (const b of cell.burrows) {
        const ci = this.B.crab[b];
        if (ci < 0) continue;
        const c = this.crabs[ci];
        if (c.gone) continue;
        const cx = c.live ? c.live.pos.x : this.B.x[b], cz = c.live ? c.live.pos.z : this.B.z[b];
        const d = Math.hypot(cx - x, cz - z);
        if (d <= r) out.push({ idx: ci, d });
      }
      for (const ci of cell.wanderers) {
        const c = this.crabs[ci];
        if (c.gone) continue;
        const cx = c.live ? c.live.pos.x : c.x, cz = c.live ? c.live.pos.z : c.z;
        const d = Math.hypot(cx - x, cz - z);
        if (d <= r) out.push({ idx: ci, d });
      }
    }
    return out;
  }

  /** choose who is live: the nearest crabs to the camera (and the watched one), within the budget */
  refreshLive(f) {
    const q = this.q;
    const near = this.crabsNear(this.cam.x, this.cam.z, q.rLive);
    near.sort((a, b) => a.d - b.d);
    const want = new Set();
    for (const n of near) { if (want.size >= q.maxLive) break; want.add(n.idx); }
    // the watched crab always stays
    for (const [idx, L] of this.live) if (L.ind && L.ind.id === this.lockedId) want.add(idx);
    // leave
    for (const [idx] of this.live) if (!want.has(idx)) this.retire(idx);
    // arrive (a few per tick)
    let made = 0;
    for (const idx of want) {
      if (this.live.has(idx)) continue;
      if (made++ >= 6) break;
      this.activate(idx, f);
    }
  }

  /** make a crab live: a full ScopimeraGlobosa where its record says it is, and an Individual for the creature system */
  activate(idx, f) {
    const rec = this.crabs[idx];
    if (rec.gone) return;
    const sp = this.species;
    const b = rec.burrow;
    const bx = b >= 0 ? this.B.x[b] : rec.x, bz = b >= 0 ? this.B.z[b] : rec.z;
    if (!rec.ind) {
      const ind = generateIndividual(sp, rec.seed, bx, bz, -1, 0, f.gameMs, [rec.cw_mm, rec.cw_mm]);
      // females stay smaller [L]
      if (ind.sex === 'f' && ind.length_mm > SIZE.femaleMax_mm) { ind.length_mm = Math.round(SIZE.femaleMax_mm * (0.9 + 0.1 * hash01(rec.seed)) * 10) / 10; rec.cw_mm = ind.length_mm; }
      ind.stage = rec.juvenile ? sp.stages[0].id : sp.stages[sp.stages.length - 1].id;
      rec.sex = ind.sex;
      // egg-carrying females in season stay plugged in their burrows [L]
      const ovP = ind.sex === 'f' && !rec.juvenile ? 0.45 * smoothstep(130, 180, this.doy) * (1 - smoothstep(235, 270, this.doy)) : 0;
      rec.ovigerous = hash01(rec.seed, 911) < ovP;
      ind.managed = 'colony';
      ind.colonyRef = idx;
      ind.home.set(bx, this.terrain.heightAt(bx, bz), bz);
      rec.ind = ind;
    }
    const ind = rec.ind;
    const crab = new ScopimeraGlobosa({ seed: rec.seed, sex: rec.sex, cw_mm: rec.cw_mm, resident: b >= 0, juvenile: rec.juvenile, ovigerous: rec.ovigerous });
    crab.model.setSandColor(this.sand);
    for (const m of crab.model.lods) m.renderOrder = RENDER_ORDER.crab;
    crab.model.setae.renderOrder = RENDER_ORDER.crab;
    crab.colonyIndex = idx;
    crab.behavior.tripAngle = rec.tripAngle;
    crab.onPellet = (pos, r, kind) => { this.pellets.add(pos.x, this.terrain.surfaceAt(pos.x, pos.z), pos.z, r, kind, this.pellets.time, Math.random()); if (b >= 0) this.B.pellets[b]++; };
    crab.on((id) => this.onCrabEvent(idx, id));
    this.crabGroup.add(crab.root);
    // where is it now? in its burrow, or somewhere on a trip from it
    const env = this.envFor(idx, crab);
    const heading = b >= 0 ? this.B.az[b] : hash01(rec.seed, 3) * TAU;
    const out = rec.wanderer ? env.exposed : rec.out && env.exposed && !env.floodSoon;
    if (b >= 0 && !out) {
      crab.placeAt(bx, bz, heading, this.probe, true);
      crab.behavior.plugged = !env.exposed || env.since < 120 * rec.emergeDelay;
      if (rec.ovigerous) crab.behavior.plugged = true;
    } else {
      // on the surface, partway along a trip
      const a = rec.tripAngle, dd = b >= 0 ? rrange(Math.random, 0.5, 6) * rec.cw_mm / 1000 : 0;
      const x = bx + Math.sin(a) * dd, z = bz + Math.cos(a) * dd;
      crab.placeAt(x, z, a + (Math.random() - 0.5), this.probe, false);
      crab.behavior.plugged = false;
      crab.behavior.setState(b >= 0 ? STATE.IDLE : STATE.WANDER);
      crab.behavior.idleFor = rrange(Math.random, 0.2, 2);
      crab.behavior.wet = 0.4;
    }
    if (b >= 0) this.B.open[b] = crab.behavior.plugged ? 0 : 1;
    rec.live = crab;
    this.live.set(idx, { crab, ind, lod: 1, every: 1, frame: Math.floor(Math.random() * 4), env, inShadow: false });
    this.creatures.spawn(ind);
  }

  /** a crab leaves the live set: its record keeps where it was and whether it was out */
  retire(idx) {
    const L = this.live.get(idx);
    if (!L) return;
    const rec = this.crabs[idx];
    const crab = L.crab;
    rec.out = crab.behavior.onSurface;
    rec.x = crab.pos.x; rec.z = crab.pos.z;
    rec.tripAngle = crab.behavior.tripAngle;
    rec.outUntil = this.time + rrange(Math.random, 30, 240);
    if (rec.burrow >= 0) this.B.open[rec.burrow] = crab.behavior.plugged ? 0 : 1;
    this.live.delete(idx);
    rec.live = null;
    this.creatures.despawn(L.ind.id);
    crab.dispose();
  }

  /** the creature system lost the individual (captured, despawned from outside) */
  forget(id) {
    for (const [idx, L] of this.live) {
      if (L.ind.id !== id) continue;
      const rec = this.crabs[idx];
      if (this.removed.has(id)) { rec.gone = true; if (rec.burrow >= 0) this.B.crab[rec.burrow] = -1; }
      this.live.delete(idx);
      rec.live = null;
      L.crab.dispose();
    }
  }

  crabForIndividual(ind) {
    const idx = ind.colonyRef;
    const L = this.live.get(idx);
    return L ? L.crab : null;
  }

  onCrabEvent(idx, id) {
    // a panicking neighbour: those close by take fright too (the wave of crabs going down as someone walks over)
    if (id === 'retreat') {
      const L = this.live.get(idx);
      if (L) this.startles.push({ pos: L.crab.pos.clone(), t: this.time + 0.15 + Math.random() * 0.2, r: 0.5, level: 0.42, kind: 'neighbour' });
    }
  }

  // ======================================================================================== perception

  envFor(idx, crab) {
    const rec = this.crabs[idx];
    const L = this.live.get(idx);
    const env = L?.env ?? makeEnv(this.probe);
    env.probe = this.probe;
    const b = rec.burrow;
    const x = b >= 0 ? this.B.x[b] : crab.pos.x, z = b >= 0 ? this.B.z[b] : crab.pos.z;
    const y = b >= 0 ? this.B.y[b] : this.terrain.heightAt(x, z);
    const ck = b >= 0 ? this.B.cell[b] : 0;
    const ex = this.exposureAt(ck, y);
    const water = this.habitat.waterAt(x, z);
    env.exposed = water < y - 0.003;
    env.since = Number.isFinite(ex.since) ? ex.since : 50000;
    env.sinceExposed = env.exposed ? env.since : 0;
    env.floodSoon = ex.floodSoon || this.tideRate > 0 && water > y - 0.04;
    env.submerged = this.habitat.waterAt(crab.pos.x, crab.pos.z) > this.terrain.heightAt(crab.pos.x, crab.pos.z) + 0.002;
    env.light = this.light;
    env.season = this.season;
    if (b >= 0) {
      const bur = env.burrow ??= { e: new Vector3(), axis: new Vector3(), r: 0, az: 0 };
      bur.e.set(x, y, z);
      shaftAxis(this.B.k[b], this.B.az[b], _n.set(this.B.nx[b], this.B.ny[b], this.B.nz[b]), bur.axis);
      bur.r = this.B.r[b];
      bur.az = this.B.az[b];
      env.onExcavate = () => this.excavate(b);
    } else {
      env.burrow = null;
      env.onExcavate = null;
    }
    env.observedCalm = this.playerStill > 4;
    return env;
  }

  /** a lump of wet sand shoved out of a burrow */
  excavate(b) {
    const a = Math.random() * TAU, r = this.B.r[b];
    const x = this.B.x[b] + Math.sin(a) * r * rrange(Math.random, 1.4, 2.4), z = this.B.z[b] + Math.cos(a) * r * rrange(Math.random, 1.4, 2.4);
    this.pellets.add(x, this.terrain.surfaceAt(x, z), z, r * rrange(Math.random, 0.35, 0.6), 'dig', this.pellets.time, Math.random());
  }

  /**
   * What frightens a crab, as one level 0..1 and where it comes from:
   *  • the player: nearer, faster, standing tall and coming closer all count; a still observer is soon tolerated
   *  • birds (plovers) close by
   *  • the player's shadow sweeping over it
   *  • startles: a net swung, a spade in the sand, neighbours bolting
   */
  threatFor(L) {
    const crab = L.crab, p = crab.pos;
    let level = 0, src = null, kind = '';
    // player
    const dx = p.x - this.player.x, dz = p.z - this.player.z;
    const d = Math.hypot(dx, dz);
    const standing = this.eyeHeight > 1;
    const R = 0.75 * (standing ? 1.5 : 0.85) * (1 + 0.45 * Math.min(this.playerSpeed, 3.5)) / Math.max(0.6, crab.behavior.p.boldness);
    if (d < R * 1.6) {
      let lv = clamp(1 - d / R, 0, 1);
      lv = lv * lv * (3 - 2 * lv);
      // coming closer
      const vx = this.player.x - this.playerPrev.x, vz = this.player.z - this.playerPrev.z;
      const approach = d > 1e-3 ? (vx * dx + vz * dz) / d : 0;
      if (approach > 0) lv += clamp(approach * 25, 0, 0.35) * clamp(1 - d / (R * 1.6), 0, 1);
      // a still observer is tolerated
      if (this.playerStill > 3) lv *= 0.3;
      if (lv > level) { level = lv; src = this.player; kind = 'player'; }
    }
    // birds
    for (const bpos of this.birds) {
      const db = Math.hypot(p.x - bpos.x, p.z - bpos.z);
      if (db < 4) { const lv = clamp(1 - db / 4, 0, 1) * 0.9 + 0.1; if (lv > level) { level = lv; src = bpos; kind = 'bird'; } }
    }
    // the player's shadow
    if (this.sunElevation > 8 && this.sunElevation < 75 && this.playerSpeed > 0.25) {
      const len = Math.min(8, this.eyeHeight / Math.tan(this.sunElevation * Math.PI / 180));
      const sx = -this.sunDir.x, sz = -this.sunDir.z, sl = Math.hypot(sx, sz) || 1;
      const ux = sx / sl, uz = sz / sl;
      const t = clamp((dx * ux + dz * uz), 0, len);
      const off = Math.hypot(dx - ux * t, dz - uz * t);
      const inShadow = off < 0.22 && t > 0.05;
      if (inShadow && !L.inShadow) this.startles.push({ pos: this.player.clone(), t: this.time, r: 0.01, level: 0.72, kind: 'shadow', only: crab });
      L.inShadow = inShadow;
    }
    // startles
    for (const s of this.startles) {
      if (this.time < s.t) continue;
      if (s.only && s.only !== crab) continue;
      const ds = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
      if (!s.only && ds > s.r) continue;
      const lv = s.level * clamp(1 - (this.time - s.t) / 3, 0, 1);
      if (lv > level) { level = lv; src = s.pos; kind = s.kind; }
    }
    if (level < 0.02) return null;
    const th = L.threat ??= { pos: new Vector3(), level: 0, kind: '' };
    th.pos.copy(src); th.level = Math.min(1, level); th.kind = kind;
    return th;
  }

  /** startle every crab around a point (net swing, spade) */
  startleAt(pos, r, level = 1) {
    this.startles.push({ pos: pos.clone(), t: this.time, r, level, kind: 'startle' });
  }

  /** startle one crab (and its neighbours, a little) */
  startle(crab, from, level = 1) {
    this.startles.push({ pos: (from ?? crab.pos).clone(), t: this.time, r: 0.01, level, kind: 'startle', only: crab });
    this.startles.push({ pos: crab.pos.clone(), t: this.time + 0.1, r: 0.6, level: level * 0.6, kind: 'neighbour' });
  }

  /** neighbours for each live crab (nearest, nearest female, any male waving nearby) */
  neighbours() {
    const H = this.liveHash;
    H.clear();
    for (const L of this.live.values()) {
      const p = L.crab.pos, k = Math.floor(p.z / 0.3) * 100003 + Math.floor(p.x / 0.3);
      let a = H.get(k); if (!a) { a = []; H.set(k, a); } a.push(L);
    }
    for (const L of this.live.values()) {
      const p = L.crab.pos, env = L.env;
      const bx = Math.floor(p.x / 0.3), bz = Math.floor(p.z / 0.3);
      let best = null, bestD = 0.25, bestF = null, bestFD = 0.3, waving = false;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const a = H.get((bz + j) * 100003 + bx + i);
        if (!a) continue;
        for (const o of a) {
          if (o === L || !o.crab.behavior.onSurface) continue;
          const d = o.crab.pos.distanceTo(p);
          if (d < bestD) { bestD = d; best = o; }
          if (o.crab.sex === 'f' && d < bestFD) { bestFD = d; bestF = o; }
          if (o.crab.state === STATE.WAVE && d < 0.3) waving = true;
        }
      }
      env.nearest = best ? this.neighbourInfo(L, best, bestD) : null;
      env.nearestFemale = bestF ? this.neighbourInfo(L, bestF, bestFD, true) : null;
      env.neighborWaving = waving;
    }
  }

  neighbourInfo(L, o, d, female = false) {
    const info = (L._nb ??= {})[female ? 'f' : 'n'] ??= { pos: new Vector3(), dist: 0, female: false, wandering: false, cw_mm: 0, onRepel: null };
    info.pos.copy(o.crab.pos);
    info.dist = d;
    info.female = o.crab.sex === 'f';
    info.wandering = !o.crab.behavior.resident;
    info.cw_mm = o.crab.cw_mm;
    // a resident chasing an intruder off: the intruder bolts away from it
    info.onRepel = (by) => { o.crab.behavior.threat = { pos: L.crab.pos.clone(), level: 0.8, kind: 'resident' }; o.crab.behavior.fear = 0.8; };
    return info;
  }

  updateLive(f) {
    this.neighbours();
    const focus = this.shadowFocus;
    for (const [idx, L] of this.live) {
      const crab = L.crab, rec = this.crabs[idx];
      const locked = L.ind.id === this.lockedId;
      const d = crab.pos.distanceTo(this.cam);
      L.lod = lodFor(d, L.lod, locked);
      crab.setLod(L.lod);
      L.every = updateEvery(L.lod, d, crab.hidden);
      L.frame++;
      // perception every update; behaviour + animator at the tier's rate (dt accumulated)
      L.acc = (L.acc ?? 0) + f.dt * f.simScale;
      if (L.frame % L.every === 0 || locked) {
        const env = this.envFor(idx, crab);
        env.threat = this.threatFor(L);
        crab.update(Math.min(0.1, L.acc), env);
        L.acc = 0;
      }
      if (rec.burrow >= 0) this.B.open[rec.burrow] = crab.behavior.plugged ? 0 : 1;
      crab.model.setShadows(focus && d < 0.5);
      L.ind.pos.copy(crab.pos);
      L.ind.heading = crab.heading;
    }
  }

  // ======================================================================================== abstract population

  /**
   * Crabs that are not live: in or out by the time of day and tide; pellets laid out around their burrows for the
   * time they have had on this exposure — the same radiating trips a live crab makes.
   */
  abstractTick() {
    const near = this.crabsNear(this.cam.x, this.cam.z, this.q.pelR);
    for (const { idx } of near) {
      const rec = this.crabs[idx];
      const b = rec.burrow;
      if (b < 0) continue;
      const y = this.B.y[b];
      const ex = this.exposureAt(this.B.cell[b], y);
      if (!ex.exposed) { this.B.cycle[b] = -1; this.B.open[b] = rec.live ? this.B.open[b] : 0; continue; }
      if (!rec.live) {
        // in/out: out part of the time while there is light and the season allows (about a third of a low tide [L])
        const act = this.season.activity * this.light * (rec.ovigerous ? 0.1 : 1);
        if (this.time > rec.outUntil) {
          rec.out = hash01(rec.seed, Math.floor(this.gameMs / 90000)) < 0.35 * act && ex.since > 120 * rec.emergeDelay && !ex.floodSoon;
          rec.outUntil = this.time + 20;
        }
        this.B.open[b] = ex.since > 120 * rec.emergeDelay && !ex.floodSoon ? 1 : 0;
      }
      if (this.B.cycle[b] !== ex.cycle) {
        this.B.cycle[b] = ex.cycle;
        this.B.pellets[b] = 0;
        this.layPellets(b, rec, ex);
      }
    }
  }

  /** feeding pellets per second of exposure, averaged over the crabs' time in and out [L][R] */
  pelletRate() {
    // ~6 pellets a minute while feeding, feeding 70 % of surface time, on the surface ~a third of a low tide
    return (6 / 60) * 0.35 * 0.7 * this.season.activity * (0.5 + 0.5 * this.light);
  }

  expectedPellets(rec, ex) {
    if (rec.gone || rec.ovigerous || !ex.exposed) return 0;
    const active = Math.max(0, Math.min(ex.since, 6 * 3600) - 300 * rec.emergeDelay);
    return Math.min(this.q.pelMax, Math.floor(active * this.pelletRate()));
  }

  /** pellets made so far this exposure, laid out as radiating trips that turn a little each time */
  layPellets(b, rec, ex) {
    if (rec.gone || rec.ovigerous) return;
    const n = this.expectedPellets(rec, ex);
    const rate = this.pelletRate();
    if (n <= 0) return;
    const rand = mulberry(this.B.seed[b] ^ (ex.cycle * 2654435761));
    const cw = rec.cw_mm / 1000;
    const pr = cw * (PELLET.feedDiam[0] + (PELLET.feedDiam[1] - PELLET.feedDiam[0]) * hash01(rec.seed, 5)) * 0.5;
    const bx = this.B.x[b], bz = this.B.z[b];
    const turn = hash01(rec.seed, 7) < 0.5 ? 1 : -1;
    let a = rec.tripAngle, made = 0;
    // a couple of excavation lumps by the mouth
    for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) {
      const aa = rand() * TAU, rr = this.B.r[b] * rrange(rand, 1.4, 2.6);
      const x = bx + Math.sin(aa) * rr, z = bz + Math.cos(aa) * rr;
      this.pellets.add(x, this.terrain.surfaceAt(x, z), z, this.B.r[b] * rrange(rand, 0.35, 0.65), 'dig', -rrange(rand, 60, 3000), rand());
    }
    while (made < n) {
      a += turn * rrange(rand, 0.25, 0.7);
      const len = rrange(rand, 5, 14) * cw;
      let s = cw * 0.9;
      while (s < len && made < n) {
        const side = (made % 2 ? 1 : -1) * rrange(rand, 0.3, 0.55) * cw;
        const x = bx + Math.sin(a) * s + Math.cos(a) * side + (rand() - 0.5) * 0.15 * cw;
        const z = bz + Math.cos(a) * s - Math.sin(a) * side + (rand() - 0.5) * 0.15 * cw;
        // older trips dried long ago; the last ones are still damp
        const age = (n - made) / Math.max(1, rate) ;
        this.pellets.add(x, this.terrain.surfaceAt(x, z), z, pr * rrange(rand, 0.8, 1.2), 'feed', this.pellets.time - age, rand());
        made++;
        s += cw * rrange(rand, 0.18, 0.32);
      }
    }
    this.B.pellets[b] = made;
    rec.tripAngle = a;
  }

  // ======================================================================================== drawing

  drawGround() {
    const R = this.renderer;
    R.begin();
    const cam = this.cam;
    const half = this.terrain.half;
    const rDraw = Math.min(10, this.q.rLive + 2);
    const i0 = Math.floor((cam.x - rDraw + half) / CELL), i1 = Math.floor((cam.x + rDraw + half) / CELL);
    const j0 = Math.floor((cam.z - rDraw + half) / CELL), j1 = Math.floor((cam.z + rDraw + half) / CELL);
    const holes = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = this.cells.get(this.cellKey(i, j));
      if (!cell) continue;
      for (const b of cell.burrows) {
        if (this.B.gone[b]) continue;
        const d = Math.hypot(this.B.x[b] - cam.x, this.B.z[b] - cam.z);
        if (d > rDraw) continue;
        const open = this.B.open[b];
        if (open && d < 2.6) holes.push({ b, d });
        _v.set(this.B.x[b], this.B.y[b], this.B.z[b]);
        _n.set(this.B.nx[b], this.B.ny[b], this.B.nz[b]);
        const r = this.B.r[b];
        R.addDecal(_v, _n, r * 2.2, r * 2.2, this.B.az[b], 0, open ? 1 : 0.15, (this.B.seed[b] % 1000) / 1000, open ? 1 : 0.5);
        // beyond the pellets' own range, the field of pellets around a burrow as a speckled patch
        if (d > 2.2) {
          const ci = this.B.crab[b];
          const ex = this.cellExposure.get(this.B.cell[b]);
          const np = ci >= 0 && ex ? this.expectedPellets(this.crabs[ci], ex) : 0;
          if (np > 4) {
            const cw = ci >= 0 ? this.crabs[ci].cw_mm / 1000 : 0.008;
            const fade = smoothstep(2.2, 3.2, d);
            R.addDecal(_v, _n, cw * 11, cw * 11, this.B.az[b], 3, fade * Math.min(1, np / this.q.pelMax), (this.B.seed[b] % 977) / 977, 1);
          }
        }
      }
    }
    holes.sort((a, b) => a.d - b.d);
    for (let k = 0; k < Math.min(this.q.holes, holes.length); k++) {
      const b = holes[k].b;
      _v.set(this.B.x[b], this.B.y[b], this.B.z[b]);
      _n.set(this.B.nx[b], this.B.ny[b], this.B.nz[b]);
      R.addOpen(_v, this.B.r[b], this.B.k[b], this.B.az[b], _n);
    }
    // contact shadows: a soft dark ellipse under each crab on the surface, cast along the sun
    for (const L of this.live.values()) {
      const crab = L.crab;
      if (crab.hidden || !crab.model.root.visible) continue;
      const cw = crab.cw;
      crab.anchor(_v2);
      const g = this.terrain.surfaceAt(_v2.x, _v2.z);
      const hgt = Math.max(0, _v2.y - g);
      const el = Math.max(0.25, this.sunDir.y);
      const sx = -this.sunDir.x, sz = -this.sunDir.z;
      const off = hgt / el * 0.5;
      _v3.set(_v2.x + sx * off, g, _v2.z + sz * off);
      this.terrain.normalAt(_v3.x, _v3.z, _n);
      R.addDecal(_v3, _n, cw * 0.85, cw * (0.7 + off / cw * 0.4), Math.atan2(sx, sz), 1, this.shadowFocus && L.lod === 0 ? 0.22 : 0.42);
    }
    R.end();
  }

  // ======================================================================================== tools

  /**
   * The spade at a point: a burrow under the blade is dug out. A crab at home in it is caught (it cannot escape
   * a spade); one out on the sand flees. Returns the caught crab's Individual, or null.
   */
  dig(x, z, reach) {
    this.startleAt(new Vector3(x, 0, z), 1.2, 1);
    const b = this.burrowAt(x, z, reach);
    if (b < 0) return null;
    const ci = this.B.crab[b];
    this.B.gone[b] = 1;
    this.B.open[b] = 0;
    if (ci < 0) return null;
    const rec = this.crabs[ci];
    const L = this.live.get(ci);
    const inside = L ? !L.crab.behavior.onSurface : !rec.out;
    this.B.crab[b] = -1;
    if (!inside) {
      // it was out: now it has no home and runs
      rec.burrow = -1; rec.wanderer = true;
      if (L) { L.crab.behavior.resident = false; L.env.burrow = null; }
      return null;
    }
    let ind = rec.ind;
    if (!ind) {
      ind = generateIndividual(this.species, rec.seed, this.B.x[b], this.B.z[b], -1, 0, this.gameMs, [rec.cw_mm, rec.cw_mm]);
      if (ind.sex === 'f' && ind.length_mm > SIZE.femaleMax_mm) ind.length_mm = SIZE.femaleMax_mm;
    }
    rec.gone = true;
    if (L) this.creatures.remove(ind.id); else this.removed.add(ind.id);
    return ind;
  }

  /** the burrow under a point (for the HUD), or -1 */
  burrowNear(x, z, reach) { return this.burrowAt(x, z, reach); }

  /** compile the crab, pellet and burrow programs up front (no hitch when the first crab appears) */
  prewarm(gl, camera) {
    const crab = new ScopimeraGlobosa({ seed: 1, sex: 'm', cw_mm: 8 });
    crab.root.position.copy(camera.position).add(new Vector3(0, -0.3, -0.5));
    for (const m of crab.model.lods) m.visible = true;
    crab.model.setae.visible = true;
    crab.model.mouthPellet.visible = true;
    this.group.add(crab.root);
    this.pellets.add(crab.root.position.x, crab.root.position.y, crab.root.position.z, 0.001, 'feed', 0, 0.5);
    this.pellets.update(0, crab.root.position, null);
    try { gl.compile(this.group.parent ?? this.group, camera); } catch (err) { console.warn('[kometsukigani] prewarm', err); }
    crab.dispose();
    this.pellets.clear();
  }

  stats() {
    let out = 0;
    for (const L of this.live.values()) if (L.crab.behavior.onSurface) out++;
    return { burrows: this.nB, crabs: this.crabs.length, live: this.live.size, out, pellets: this.pellets.total, cells: this.cells.size };
  }

  /** the nearest burrow patch to a point (debug teleport) */
  nearestPatch(x, z) {
    let best = null, bestD = Infinity;
    const half = this.terrain.half;
    for (let gz = -half + 8; gz < half - 8; gz += 4) for (let gx = -half + 8; gx < half - 8; gx += 4) {
      if (this.densityAt(gx, gz) < 8) continue;
      const d = Math.hypot(gx - x, gz - z);
      if (d < bestD) { bestD = d; best = [gx, gz]; }
    }
    return best;
  }

  /**
   * The tide jumped (ticket / debug): everyone back to their records (but the watched one), pellets recomputed.
   * @param {string | null} [keepId]
   */
  reset(keepId = null) {
    for (const [idx, L] of [...this.live]) if (L.ind.id !== keepId) this.retire(idx);
    this.pellets.clear();
    this.cellExposure.clear();
    for (let b = 0; b < this.nB; b++) { this.B.cycle[b] = -1; this.B.pellets[b] = 0; }
  }

  dispose() {
    for (const idx of [...this.live.keys()]) this.retire(idx);
    this.renderer.dispose();
    this.pellets.dispose();
    this.group.removeFromParent();
    if (ScopimeraDriver.colony === this) ScopimeraDriver.colony = null;
    if (ScopimeraColony.active === this) ScopimeraColony.active = null;
  }
}

// ============================================================================================ helpers

function hashI(a, b, c, d) {
  let h = 2166136261 >>> 0;
  for (const x of [a, b, c, d]) { h ^= x & 0xffff; h = Math.imul(h, 16777619); h ^= (x >>> 16) & 0xffff; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/** smooth value noise in [0, 1] */
function valueNoise(x, z, seed) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
  const h = (a, b) => hash01(a, b, seed);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - w) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * w;
}

export function dayOfYear(year, month, day) {
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
}

/** the id generateIndividual gives a seed (so captured crabs can be recognised before they are ever built) */
function individualId(seed) {
  // mirrors Individual.generateIndividual: `${species.id}#${hashInts(seed, 7).toString(16).padStart(8, '0')}`
  return `${SPECIES_ID}#${hashInts(seed, 7).toString(16).padStart(8, '0')}`;
}
