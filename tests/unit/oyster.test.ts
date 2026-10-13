import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { gapeMillimetres, makeGenome, seedsFrom } from '../../src/creatures/oyster/genome';
import { growthVariant, LAM_W, MAX_K } from '../../src/creatures/oyster/variants';
import { buildOysterMerged, buildOysterParts, DETAIL, OysterShape, PART, triangleCount, type AtlasLayout } from '../../src/creatures/oyster/geometry';
import { OysterBehavior, playerStimulus } from '../../src/creatures/oyster/behavior';
import { layoutCluster } from '../../src/creatures/oyster/OysterCluster';
import { OysterReef } from '../../src/creatures/oyster/OysterReef';
import type { OysterAtlas } from '../../src/creatures/oyster/bake';

const LAYOUT: AtlasLayout = { cols: 3, rows: 2, tileFrac: [0.3125, 0.3125, 0.1875, 0.1875], padU: 0.003, padV: 0.008, blocks: null };

describe('oyster genome', () => {
  it('is deterministic in its seeds and varies between them', () => {
    const a = makeGenome(seedsFrom(11)), b = makeGenome(seedsFrom(11)), c = makeGenome(seedsFrom(12));
    expect(a).toEqual(b);
    expect(a.length).not.toBe(c.length);
    expect(a.seeds).toHaveProperty('attachmentSeed');
  });

  it('keeps the feeding gape to a few millimetres on an adult', () => {
    for (let i = 0; i < 40; i++) {
      const g = makeGenome(seedsFrom(i), { age: 'adult' });
      const mm = gapeMillimetres(g);
      expect(mm).toBeGreaterThan(1);
      expect(mm).toBeLessThan(7);
    }
  });

  it('makes crowded oysters longer and narrower than lone ones', () => {
    let crowded = 0, lone = 0;
    for (let i = 0; i < 30; i++) {
      crowded += makeGenome(seedsFrom(i), { crowding: 1 }).widthRatio;
      lone += makeGenome(seedsFrom(i), { crowding: 0 }).widthRatio;
    }
    expect(crowded).toBeLessThan(lone * 0.75);
  });
});

describe('growth variants', () => {
  it('lay the major lamellae in growth order across the whole margin', () => {
    for (let v = 0; v < 6; v++) {
      const g = growthVariant(v);
      for (const p of [g.lower, g.upper]) {
        expect(p.K).toBeGreaterThan(3);
        expect(p.K).toBeLessThanOrEqual(MAX_K);
        for (let i = 0; i < LAM_W; i++) {
          let prev = 0;
          for (let k = 0; k < p.K; k++) {
            const s = p.table[(k * LAM_W + i) * 4];
            expect(s).toBeGreaterThanOrEqual(prev);
            expect(s).toBeLessThan(1);
            prev = s;
          }
        }
      }
    }
  });
});

describe('oyster geometry', () => {
  const g = makeGenome(seedsFrom(7), { age: 'adult', crowding: 0.45 });
  const shape = new OysterShape(g);

  it('builds every LOD without NaN, each lighter than the last', () => {
    const tris: number[] = [];
    for (const d of [DETAIL.hero, DETAIL.lod0, DETAIL.lod1, DETAIL.lod2]) {
      const geo = buildOysterMerged(shape, d, LAYOUT);
      const p = geo.getAttribute('position').array;
      for (let i = 0; i < p.length; i++) expect(Number.isFinite(p[i])).toBe(true);
      tris.push(triangleCount(geo));
    }
    for (let i = 1; i < tris.length; i++) expect(tris[i]).toBeLessThan(tris[i - 1]);
    expect(tris[3]).toBeLessThan(600);
  });

  it('is about as long as its genome says, from the hinge at the origin', () => {
    const geo = buildOysterParts(shape, DETAIL.lod1, LAYOUT).lower;
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    expect(bb.max.z - bb.min.z).toBeGreaterThan(g.length * 0.8);
    expect(bb.max.z - bb.min.z).toBeLessThan(g.length * 1.35);
    expect(bb.min.z).toBeLessThan(0.01);
  });

  it('closes tight: the two margins meet on the commissure', () => {
    const lo = new Vector3(), up = new Vector3();
    for (const u of [0.25, 0.4, 0.5, 0.6, 0.75]) {
      shape.base(u, 1, false, lo);
      shape.base(u, 1, true, up);
      expect(Math.abs(lo.y - up.y)).toBeLessThan(0.0015);
    }
  });

  it('keeps the lower valve still and lets only the upper valve (and what it carries) follow the hinge', () => {
    const parts = buildOysterParts(shape, DETAIL.lod0, LAYOUT);
    const info = (geo: typeof parts.lower) => geo.getAttribute('aInfo');
    const li = info(parts.lower), ui = info(parts.upper);
    for (let i = 0; i < li.count; i++) expect(li.getY(i)).toBe(0);
    for (let i = 0; i < ui.count; i++) expect(ui.getY(i)).toBe(1);
    const parts2 = new Set<number>();
    const mi = info(parts.mantle!);
    for (let i = 0; i < mi.count; i++) parts2.add(mi.getX(i));
    expect(parts2.has(PART.MANTLE_L) && parts2.has(PART.MANTLE_U) && parts2.has(PART.BODY)).toBe(true);
  });

  it('gives dead single valves no lid and no soft parts', () => {
    const dead = new OysterShape(makeGenome(seedsFrom(9), { dead: 2 }));
    const parts = buildOysterParts(dead, DETAIL.lod0, LAYOUT);
    expect(parts.upper.getAttribute('position').count).toBe(0);
    expect(parts.mantle).toBeNull();
  });
});

describe('oyster behaviour', () => {
  const gapeMax = 0.035;

  it('stays shut while the tide is out', () => {
    const b = new OysterBehavior(gapeMax, 1);
    for (let i = 0; i < 300; i++) b.update(0.1, { depth: -0.2, stimulus: 0 });
    expect(b.state).toBe('LOW_TIDE_CLOSED');
    expect(b.gape).toBe(0);
  });

  it('opens a little to feed once covered, slowly', () => {
    const b = new OysterBehavior(gapeMax, 2);
    let t = 0;
    while (b.state !== 'FILTER_FEEDING' && t < 60) { b.update(0.1, { depth: 0.3, stimulus: 0 }); t += 0.1; }
    expect(b.state).toBe('FILTER_FEEDING');
    expect(t).toBeGreaterThan(5);
    expect(b.gape).toBeGreaterThan(gapeMax * 0.9);
    expect(b.gape).toBeLessThanOrEqual(gapeMax);
  });

  it('snaps shut when touched, holds, and reopens under water', () => {
    const b = new OysterBehavior(gapeMax, 3, 'FILTER_FEEDING');
    b.touch();
    for (let i = 0; i < 3; i++) b.update(0.1, { depth: 0.3, stimulus: 0 });
    expect(b.state).toBe('THREAT_CLOSE');
    expect(b.gape).toBeLessThan(gapeMax * 0.1);
    let t = 0;
    while (b.state === 'THREAT_CLOSE' && t < 30) { b.update(0.1, { depth: 0.3, stimulus: 0 }); t += 0.1; }
    expect(b.state).toBe('SUBMERGED');
    for (let i = 0; i < 400; i++) b.update(0.1, { depth: 0.3, stimulus: 0 });
    expect(b.gape).toBeGreaterThan(0);
  });

  it('shuts at a sudden change in the water and when the tide leaves', () => {
    const b = new OysterBehavior(gapeMax, 4, 'FILTER_FEEDING');
    b.update(0.1, { depth: 0.3, stimulus: 0, shock: true });
    expect(b.state).toBe('THREAT_CLOSE');
    const c = new OysterBehavior(gapeMax, 5, 'FILTER_FEEDING');
    c.update(0.1, { depth: -0.01, stimulus: 0 });
    expect(c.state).toBe('LOW_TIDE_CLOSED');
  });

  it('feels a running player further away than a walking one, a touch always', () => {
    expect(playerStimulus(0.1, 0, false)).toBe(1);
    expect(playerStimulus(2, 4, true)).toBeGreaterThan(playerStimulus(2, 1.5, false));
    expect(playerStimulus(3, 0, false)).toBe(0);
  });
});

describe('oyster clusters and reef', () => {
  it('grows a clump of the size asked, cemented on the substrate and on each other', () => {
    const m = layoutCluster({ seed: 42, count: 16, radius: 0.12 });
    const again = layoutCluster({ seed: 42, count: 16, radius: 0.12 });
    expect(m.length).toBeGreaterThan(9);
    expect(m.length).toBeLessThanOrEqual(16);
    expect(again.map((x) => x.matrix.elements[12])).toEqual(m.map((x) => x.matrix.elements[12]));
    expect(m.some((x) => x.host >= 0)).toBe(true);
    expect(m.some((x) => x.host < 0)).toBe(true);
    for (const x of m) expect(Math.hypot(x.plane.x, x.plane.y, x.plane.z)).toBeCloseTo(1, 3);
  });

  it('instances a reef with levels of detail by distance', () => {
    const atlas = { layout: LAYOUT, normal: null, hr: null, mask: null, detail: null, detailRep: null } as unknown as OysterAtlas;
    const sites = [];
    for (let i = 0; i < 12; i++) sites.push({ p: new Vector3(i * 3, 0, 0), n: new Vector3(0, 1, 0), room: 0.4 });
    const reef = new OysterReef({ atlas, sites, seed: 1, quality: 'mid', maxOysters: 400 });
    expect(reef.count).toBeGreaterThan(30);
    const cam = new PerspectiveCamera(70, 1.6, 0.05, 500);
    cam.position.set(-1, 1, 0);
    cam.lookAt(10, 0, 0);
    cam.updateMatrixWorld();
    reef.update(0.016, cam, 1, { pos: new Vector3(-1, 0, 0), speed: 0, running: false });
    const [l0, l1, l2] = reef.drawn;
    expect(l0).toBeGreaterThan(0);
    expect(l1 + l2).toBeGreaterThan(0);
    expect(l0 + l1 + l2).toBeLessThanOrEqual(reef.count);
    // under water they come to feed
    for (let i = 0; i < 400; i++) reef.update(0.1, cam, 1);
    const states = reef.near(0, 0, 1.5).map((i) => reef.stateOf(i)).filter((s) => s !== 'DEAD');
    expect(states.length).toBeGreaterThan(0);
    for (const s of states) expect(['FILTER_FEEDING', 'SUBMERGED', 'CLOSED']).toContain(s);
    // the tide leaves: all shut
    for (let i = 0; i < 30; i++) reef.update(0.1, cam, -3);
    for (const i of reef.near(0, 0, 1.5)) expect(['LOW_TIDE_CLOSED', 'DEAD']).toContain(reef.stateOf(i));
  });
});
