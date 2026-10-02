import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { HermitCrab, PagurusWorld, STATE } from '../../src/creatures/yubinagahonyadokari/PagurusMinutus.js';
import { SHELL_SPECIES, SHELL_SPECIES_KEYS, Shell, buildShellGeometry, chooseShellFor, classifyShellPoint, evaluateShell, minFitSize } from '../../src/creatures/yubinagahonyadokari/PagurusMinutusShell.js';
import { SeededRandom } from '../../src/creatures/yubinagahonyadokari/PagurusMinutusUtil.js';
import { Rig, solveLegIK, legTipFK } from '../../src/creatures/yubinagahonyadokari/PagurusMinutusRig.js';
import { individualMorph, MORPH } from '../../src/creatures/yubinagahonyadokari/PagurusMinutusMorphology.js';
import { buildBodyGeometry, REGION } from '../../src/creatures/yubinagahonyadokari/PagurusMinutusModel.js';
import { hideSignature } from '../../src/creatures/yubinagahonyadokari/PagurusMinutusHide.js';
import { HIDE_TABLE } from '../../src/creatures/yubinagahonyadokari/PagurusMinutusHideTable.js';

const flat = () => 0;
const SIZES: Record<string, number> = { batillaria_attramentaria: 24, umbonium_moniliferum: 14.5, reticunassa_festiva: 15, reishia_clavigera: 22, lunella_coreensis: 15 };

function makeCrab(opts: Record<string, unknown> = {}) {
  const scene = new Scene();
  const world = PagurusWorld.of(scene);
  world.autoSpawn = false;
  const crab = new HermitCrab({ seed: 7, sex: 'm', shieldLength_mm: 4.8, lod: 1, ...opts });
  scene.add(crab.root);
  crab.world = world;
  world.register(crab);
  crab.placeAt(new Vector3(0, 0, 0), 0, { groundAt: flat });
  return { scene, world, crab };
}

function run(crab: HermitCrab, seconds: number, env: Record<string, unknown> = {}, onFrame?: (t: number) => void) {
  const n = Math.round(seconds * 60);
  for (let f = 0; f < n; f++) {
    onFrame?.(f / 60);
    crab.update(1 / 60, { groundAt: flat, waterAt: () => 0.05, player: new Vector3(8, 1.5, 8), frame: f, ...env });
  }
}

describe('shells (analytic model → physics)', () => {
  it('five species with consistent mass, volume, centre of mass and aperture', () => {
    expect(SHELL_SPECIES_KEYS.length).toBe(5);
    for (const key of SHELL_SPECIES_KEYS) {
      const s = new Shell({ species: key, size_mm: SIZES[key], seed: 1 });
      const p = s.props as unknown as Record<string, number>;
      expect(p.mass_g).toBeGreaterThan(0.05);
      expect(p.mass_g).toBeLessThan(3);
      expect(p.internalVolume_mm3).toBeGreaterThan(10);
      expect(p.apertureWidth_mm).toBeGreaterThan(1);
      expect(p.apertureHeight_mm).toBeGreaterThan(1);
      const com = s.props.centerOfMass as Vector3;
      expect(Number.isFinite(com.length())).toBe(true);
      expect(com.length() * 1000).toBeLessThan(SIZES[key]);
    }
    // heavy, thick muricid vs light batillariid at the same size
    const heavy = new Shell({ species: 'reishia_clavigera', size_mm: 20 }).props.mass_g as number;
    const light = new Shell({ species: 'batillaria_attramentaria', size_mm: 20 }).props.mass_g as number;
    expect(heavy).toBeGreaterThan(light * 2);
  });

  it('mass scales with size³', () => {
    const a = new Shell({ species: 'umbonium_moniliferum', size_mm: 10 }).props.mass_g as number;
    const b = new Shell({ species: 'umbonium_moniliferum', size_mm: 20 }).props.mass_g as number;
    expect(b / a).toBeCloseTo(8, 1);
  });

  it('evaluation prefers a fitting intact shell over a small damaged one', () => {
    const { crab } = makeCrab();
    const needs = (crab as unknown as { shellNeeds(): Parameters<typeof evaluateShell>[0] }).shellNeeds();
    const good = evaluateShell(needs, new Shell({ species: 'umbonium_moniliferum', size_mm: 14.5 }).props as never).score;
    const poor = evaluateShell(needs, new Shell({ species: 'reticunassa_festiva', size_mm: 9, damage: 0.8 }).props as never).score;
    expect(good).toBeGreaterThan(poor + 0.2);
  });
});

describe('body ↔ shell geometry', () => {
  it('the hidden abdomen and shell-holding legs stay inside the lumen of every shell', () => {
    for (const key of SHELL_SPECIES_KEYS) {
      // a shell this crab (SL 4.8 mm) can actually withdraw into, as chosen in the field
      const size = Math.min(SHELL_SPECIES[key as keyof typeof SHELL_SPECIES].size_mm[1], minFitSize(key, 4.8) * 1.1);
      const { crab } = makeCrab({ shell: { species: key, size_mm: size, seed: 5 } });
      run(crab, 0.4);
      crab.root.updateMatrixWorld(true);
      const c = crab as unknown as { meshes: { geometry: { attributes: { aRegion: { count: number; getX(i: number): number } } }; getVertexPosition(i: number, v: Vector3): Vector3; matrixWorld: never }[]; shell: Shell & { apertureNormal: Vector3 } };
      const mesh = c.meshes[1];
      const inv = c.shell.object3D.matrixWorld.clone().invert();
      const reg = mesh.geometry.attributes.aRegion;
      const v = new Vector3();
      let hidden = 0, out = 0;
      for (let i = 0; i < reg.count; i++) {
        const r = reg.getX(i);
        if (r !== REGION.ABDOMEN && r !== REGION.REDUCED_LEG) continue;
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
        if (v.dot(c.shell.apertureNormal) > -0.0015) continue; // at the aperture
        hidden++;
        if (classifyShellPoint(key, size, v) !== 'lumen') out++;
      }
      expect(hidden).toBeGreaterThan(20);
      expect(out / hidden).toBeLessThan(0.03);
      crab.dispose();
    }
  });

  it('shell surfaces face the right way: outer surface outward, lumen wall inward', () => {
    for (const key of SHELL_SPECIES_KEYS) {
      const g = buildShellGeometry(key, 1, 0, 0) as unknown as { attributes: Record<string, { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number }> };
      const pos = g.attributes.position, nrm = g.attributes.normal, sh = g.attributes.aShell;
      // per growth-angle ring: compare each normal with the direction from the ring centroid
      const rings = new Map<string, { c: Vector3; idx: number[] }>();
      for (let i = 0; i < pos.count; i++) {
        const part = Math.round(sh.getZ(i));
        if (part > 1) continue;
        const k = `${part}:${Math.round(sh.getX(i) * 200)}`;
        if (!rings.has(k)) rings.set(k, { c: new Vector3(), idx: [] });
        const r = rings.get(k)!;
        r.c.add(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
        r.idx.push(i);
      }
      const right = [0, 0], total = [0, 0];
      for (const [k, r] of rings) {
        const part = Number(k.split(':')[0]);
        r.c.divideScalar(r.idx.length);
        for (const i of r.idx) {
          const out = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(r.c).dot(new Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i))) > 0;
          total[part]++;
          if (out === (part === 0)) right[part]++;
        }
      }
      expect(right[0] / total[0]).toBeGreaterThan(0.9);
      expect(right[1] / total[1]).toBeGreaterThan(0.9);
    }
  });

  it('chosen shells let the cephalothorax pass the aperture (so the crab can withdraw)', () => {
    const rng = new SeededRandom(11);
    for (const sl of [2.5, 3.5, 4.2, 5, 6]) {
      for (let k = 0; k < 20; k++) {
        const spec = chooseShellFor(sl, rng) as unknown as { species: string; size_mm: number };
        const sp = SHELL_SPECIES[spec.species as keyof typeof SHELL_SPECIES];
        if (minFitSize(spec.species, sl) > sp.size_mm[1]) continue; // only when no species is big enough
        const p = new Shell({ species: spec.species, size_mm: spec.size_mm }).props as unknown as Record<string, number>;
        expect(Math.min(p.apertureWidth_mm, p.apertureHeight_mm)).toBeGreaterThanOrEqual(0.75 * sl * 0.999);
      }
    }
  });

  it('withdrawn into a shell it fits, the crab is shut in: only the claw lid and leg tips show at the opening', () => {
    const NAME = Object.fromEntries(Object.entries(REGION).map(([k, v]) => [v, k]));
    const LID = new Set(['CHELA_PALM', 'CHELA_FINGER', 'CHELA_ARM', 'DACTYL', 'LEG', 'MEMBRANE', 'SPINE', 'SETA']);
    for (const key of SHELL_SPECIES_KEYS) {
      const size = minFitSize(key, 4.8) * 1.1; // shells are chosen 1.0–1.3 × the smallest that fits
      const { crab } = makeCrab({ shell: { species: key, size_mm: size, seed: 5 } });
      run(crab, 0.4);
      crab.behavior.suggest({ kind: 'flee', urgency: 1, from: new Vector3(0.05, 0.05, 0.05) });
      run(crab, 2.2);
      expect(crab.behavior.state).toBe(STATE.HIDE_IN_SHELL);
      crab.root.updateMatrixWorld(true);
      const c = crab as unknown as { SL: number; meshes: { geometry: { attributes: { aRegion: { count: number; getX(i: number): number } } }; getVertexPosition(i: number, v: Vector3): Vector3; matrixWorld: never }[]; shell: Shell & { apertureNormal: Vector3 } };
      const mesh = c.meshes[1];
      const inv = c.shell.object3D.matrixWorld.clone().invert();
      const n = c.shell.apertureNormal;
      const p = c.shell.props as unknown as Record<string, number>;
      const apR = (0.5 * Math.max(p.apertureWidth_mm, p.apertureHeight_mm)) / 4.8;
      const reg = mesh.geometry.attributes.aRegion;
      const v = new Vector3();
      let shown = 0;
      for (let i = 0; i < reg.count; i++) {
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
        if (classifyShellPoint(key, size, v) !== 'outside') continue; // in the lumen or behind the opaque wall
        const dep = v.dot(n) / c.SL;
        const inPlane = v.clone().addScaledVector(n, -v.dot(n)).length() / c.SL;
        const atOpening = inPlane < apR * 1.15 && dep > -0.6 && dep < 0.45;
        if (!(atOpening && LID.has(NAME[reg.getX(i)]))) shown++;
      }
      expect(shown / reg.count).toBeLessThan(0.04);
      crab.dispose();
    }
  });

  it('out of the shell, the long abdomen coils to the right on the substrate (photos of naked crabs)', () => {
    const { crab } = makeCrab();
    (crab as unknown as { removeShell(): void }).removeShell();
    run(crab, 1);
    crab.root.updateMatrixWorld(true);
    const rig = crab.rig as unknown as { abdomen: { matrixWorld: never }[] };
    const inv = (crab.rig.root as unknown as { matrixWorld: { clone(): { invert(): never } } }).matrixWorld.clone().invert();
    const pts = rig.abdomen.map((b) => new Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv));
    // goes backward, then turns to the animal's right (−X): clockwise seen from above (dextral)
    expect(pts[2].z).toBeLessThan(pts[0].z);
    const tail = pts[pts.length - 1];
    expect(tail.x).toBeLessThan(-0.6);
    // one tight turn: the tail comes back toward the body, within about a carapace length
    expect(Math.hypot(tail.x, tail.z)).toBeLessThan(2.4);
    // lying low, under the cephalothorax
    for (const p of pts.slice(3)) expect(p.y).toBeLessThan(0.05);
    expect(crab.shell).toBeNull();
  });

  it('the baked withdrawal table matches the current morphology and shells', () => {
    // regenerate with `npm run model:pagurus-hide` after changing them
    expect(HIDE_TABLE.sig).toBe(hideSignature());
  });

  it('LOD triangle budgets (docs/spec/02 §7)', () => {
    const rig = new Rig(individualMorph('m', 0));
    expect(buildBodyGeometry(rig, 0).triangles).toBeLessThan(400000);
    expect(buildBodyGeometry(rig, 1).triangles).toBeLessThan(30000);
    expect(buildBodyGeometry(rig, 2).triangles).toBeLessThan(4000);
  });

  it('walking-leg dactyl is 1.2–1.6 × the propodus (the diagnostic long finger)', () => {
    for (const k of ['R1', 'L1', 'R2', 'L2']) {
      const d = (MORPH as unknown as { walkingLegs: Record<string, { dactylus: number; propodus: number }> }).walkingLegs[k];
      const r = d.dactylus / d.propodus;
      expect(r).toBeGreaterThanOrEqual(1.2);
      expect(r).toBeLessThanOrEqual(1.6);
    }
  });
});

describe('leg IK and gait', () => {
  it('reaches targets over the stance range of a step exactly', () => {
    const rig = new Rig(individualMorph('f', 0));
    const j = {} as Record<string, number>;
    // neutral foot ± half a long stride, body 0.4–0.6 SL above the substrate (body frame, SL units)
    const neutral: Record<string, [number, number]> = { L1: [1.5, 2.35], L2: [2.25, 0.85] };
    for (const key of ['L1', 'L2'] as const) {
      const leg = (rig.legs as Record<string, unknown>)[key] as Parameters<typeof solveLegIK>[0];
      for (let i = 0; i < 60; i++) {
        const u = (i % 6) / 5 - 0.5, w = (Math.floor(i / 6) % 5) / 4 - 0.5, h = (Math.floor(i / 30)) * 0.2;
        const t = new Vector3(neutral[key][0] + w * 0.4, -0.4 - h, neutral[key][1] + u * 1.2);
        solveLegIK(leg, t, { contactAngle: -0.55, cp: -0.38 }, j);
        expect(legTipFK(leg, j).distanceTo(t)).toBeLessThan(0.01);
      }
    }
  });

  it('planted feet do not slide while the body walks, and diagonal pairs alternate', () => {
    const { crab } = makeCrab({ lod: 1 });
    const B = crab.behavior as unknown as { enter(s: string, env: unknown): void; stateDur: number; moveTarget: Vector3; internal: { fear: number } };
    B.enter(STATE.EXPLORE, { groundAt: flat });
    B.stateDur = 1e9;
    const loco = (crab as unknown as { loco: { legs: Record<string, { contact: boolean; planted: Vector3; footWorld: Vector3 }>; position: Vector3 } }).loco;
    let slide = 0, together = 0, opposite = 0, samples = 0;
    const prev: Record<string, Vector3 | null> = { L1: null, R1: null, L2: null, R2: null };
    run(crab, 4, {}, (t) => {
      B.moveTarget.set(Math.sin(t * 0.3) * 0.05, 0, 0.08);
      for (const [k, leg] of Object.entries(loco.legs)) {
        if (leg.contact && prev[k]) slide = Math.max(slide, leg.footWorld.distanceTo(prev[k]!));
        prev[k] = leg.contact ? leg.footWorld.clone() : null;
      }
      const L = loco.legs;
      if (t > 1) {
        samples++;
        if (L.L1.contact === L.R2.contact) together++;
        if (L.L1.contact !== L.R1.contact) opposite++;
      }
    });
    expect(loco.position.length()).toBeGreaterThan(0.01); // it walked
    expect(slide).toBeLessThan(1e-9); // stance feet are fixed in the world
    expect(together / samples).toBeGreaterThan(0.75); // L1 with R2
    expect(opposite / samples).toBeGreaterThan(0.25); // L1 against R1 at least part of each cycle
  });
});

describe('behaviour', () => {
  it('a looming threat makes it withdraw, hiding lasts 2.6–70 s, then it emerges', () => {
    const { crab } = makeCrab({ seed: 11 });
    run(crab, 1);
    const player = new Vector3(8, 1.5, 8);
    let hiddenAt = -1, emergedAt = -1;
    run(crab, 90, { player }, (t) => {
      if (t > 0.5 && t < 2.5) player.set(0.3 - t * 0.1, 0.4, 0.3 - t * 0.1);
      else if (t >= 2.5) player.set(9, 1.5, 9);
      if (hiddenAt < 0 && crab.behavior.state === STATE.HIDE_IN_SHELL) hiddenAt = t;
      if (hiddenAt >= 0 && emergedAt < 0 && crab.behavior.state === STATE.EMERGE) emergedAt = t;
    });
    expect(hiddenAt).toBeGreaterThan(0);
    expect(hiddenAt).toBeLessThan(2.5);
    expect(emergedAt).toBeGreaterThan(hiddenAt + 2.6);
    expect(emergedAt - hiddenAt).toBeLessThan(80);
    crab.dispose();
  });

  it('is deterministic for a given seed', () => {
    const states = (seed: number) => {
      const { crab } = makeCrab({ seed });
      const seen: string[] = [];
      run(crab, 20, {}, () => { if (seen[seen.length - 1] !== crab.behavior.state) seen.push(crab.behavior.state); });
      crab.dispose();
      return seen.join(',');
    };
    expect(states(5)).toBe(states(5));
  });

  it('inspects and moves into a better empty shell; the old shell is left behind', () => {
    const { crab, world } = makeCrab({ seed: 3, shell: { species: 'reticunassa_festiva', size_mm: 9, damage: 0.8, seed: 2 } });
    const w = world as unknown as { addShell(spec: object, pos: Vector3, g: () => number): { shell: Shell }; shells: { shell: Shell; free: boolean }[] };
    const entry = w.addShell({ species: 'umbonium_moniliferum', size_mm: 14.5, seed: 9 }, new Vector3(0.004, 0, 0.03), flat);
    const seen = new Set<string>();
    run(crab, 120, {}, () => seen.add(crab.behavior.state));
    expect(seen.has(STATE.SHELL_INSPECT)).toBe(true);
    expect(crab.shell).toBe(entry.shell);
    expect(w.shells.some((s) => s.shell.key === 'reticunassa_festiva' && s.free)).toBe(true);
    crab.dispose();
  });

  it('breeding season: a male takes a smaller female by her shell rim with the minor chela and carries her', () => {
    const scene = new Scene();
    const world = PagurusWorld.of(scene);
    world.autoSpawn = false;
    const male = new HermitCrab({ seed: 21, sex: 'm', shieldLength_mm: 5.2, lod: 1 });
    const female = new HermitCrab({ seed: 22, sex: 'f', shieldLength_mm: 4.0, lod: 1 });
    for (const c of [male, female]) { scene.add(c.root); c.world = world; world.register(c); }
    male.placeAt(new Vector3(0, 0, 0), 0, { groundAt: flat });
    female.placeAt(new Vector3(0.01, 0, 0.035), Math.PI, { groundAt: flat });
    const events: string[] = [];
    male.onEvent((id) => events.push(id));
    const env = (f: number) => ({ groundAt: flat, waterAt: () => 0.05, player: new Vector3(8, 1.5, 8), frame: f, month: 1 });
    let guardedAt = -1, maxGap = 0;
    const start = female.loco.position.clone();
    for (let f = 0; f < 60 * 120; f++) {
      male.update(1 / 60, env(f));
      female.update(1 / 60, env(f));
      if (female.guardedBy === male) {
        if (guardedAt < 0) guardedAt = f / 60;
        if (f / 60 > guardedAt + 1) {
          const tip = male.animator.chelaTipWorld('L', new Vector3());
          const grip = female.gripPointWorld(male.loco.position, new Vector3());
          maxGap = Math.max(maxGap, Math.hypot(tip.x - grip.x, tip.z - grip.z));
        }
        if (f / 60 > guardedAt + 25) break;
      }
    }
    expect(guardedAt).toBeGreaterThan(0);
    expect(events).toContain('mate_guard');
    expect(male.behavior.state).toBe(STATE.MATE_GUARD);
    expect(female.behavior.state).toBe(STATE.GUARDED);
    expect(maxGap).toBeLessThan(0.5 * male.SL); // her rim stays in his minor chela
    expect(female.loco.position.distanceTo(start)).toBeGreaterThan(male.SL); // and she is carried along
  });

  it('no mate guarding outside the breeding season (Nov–Apr)', () => {
    const scene = new Scene();
    const world = PagurusWorld.of(scene);
    world.autoSpawn = false;
    const male = new HermitCrab({ seed: 21, sex: 'm', shieldLength_mm: 5.2, lod: 1 });
    const female = new HermitCrab({ seed: 22, sex: 'f', shieldLength_mm: 4.0, lod: 1 });
    for (const c of [male, female]) { scene.add(c.root); c.world = world; world.register(c); }
    male.placeAt(new Vector3(0, 0, 0), 0, { groundAt: flat });
    female.placeAt(new Vector3(0.01, 0, 0.035), Math.PI, { groundAt: flat });
    for (let f = 0; f < 60 * 60; f++) {
      male.update(1 / 60, { groundAt: flat, waterAt: () => 0.05, player: new Vector3(8, 1.5, 8), frame: f, month: 7 });
      female.update(1 / 60, { groundAt: flat, waterAt: () => 0.05, player: new Vector3(8, 1.5, 8), frame: f, month: 7 });
      expect(female.guardedBy).toBeNull();
    }
  });

  it('antennule flicks are irregular and the two sides are not synchronised', () => {
    const { crab } = makeCrab({ seed: 21, lod: 1 });
    const an = (crab as unknown as { animator: { flick: Record<string, { t: number }> } }).animator;
    const starts: Record<string, number[]> = { L: [], R: [] };
    const prev: Record<string, number> = { L: -1, R: -1 };
    run(crab, 60, {}, (t) => {
      for (const s of ['L', 'R']) {
        if (an.flick[s].t >= 0 && prev[s] < 0) starts[s].push(t);
        prev[s] = an.flick[s].t;
      }
    });
    const iv = starts.L.slice(1).map((t, i) => t - starts.L[i]);
    expect(iv.length).toBeGreaterThan(5);
    const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
    const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) ** 2, 0) / iv.length);
    expect(sd / mean).toBeGreaterThan(0.4); // far from rhythmic
    const sync = starts.L.filter((t) => starts.R.some((u) => Math.abs(u - t) < 0.02)).length;
    expect(sync / starts.L.length).toBeLessThan(0.2);
    crab.dispose();
  });
});
