import { describe, expect, it } from 'vitest';
import { Group, type Material, type Mesh, type Object3D, type ShaderMaterial } from 'three';
import { DRIVERS } from '../../src/creatures/drivers/index';
import { AkaeiModel } from '../../src/creatures/species/akaei/AkaeiModel';
import { akaeiBuild } from '../../src/creatures/species/akaei/AkaeiDriver';
import { SandFX } from '../../src/creatures/species/akaei/SandFX';
import { IshigareiLook } from '../../src/creatures/species/ishigarei/materials';
import { lookSpecFor } from '../../src/creatures/species/ishigarei/IshigareiDriver';
import { buildModel as buildFlounder, disposeModel } from '../../src/creatures/species/ishigarei/model';
import { buildModel as buildSnail } from '../../src/creatures/species/aramushiro/model';
import { lookFor } from '../../src/creatures/species/aramushiro/materials';

/**
 * The kept models (DriverEntry.keep) exist so that the species' shader programs are compiled once, behind the loading
 * screen, and never dropped while the flat lives. That only holds if the kept tree carries a material for every program
 * variant an individual can be drawn with: the same cache key, as far as the material itself decides it.
 */
function keyOf(m: Material): string {
  const sm = m as ShaderMaterial;
  const shader = sm.isShaderMaterial ? `${sm.vertexShader.length}:${sm.fragmentShader.length}` : '';
  return `${m.type}|${m.customProgramCacheKey()}|${shader}|${m.side}|${m.transparent}|${JSON.stringify(m.defines ?? {})}`;
}

function keysUnder(root: Object3D): Set<string> {
  const keys = new Set<string>();
  root.traverse((o) => {
    const m = (o as Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) keys.add(keyOf(mat));
  });
  return keys;
}

const missing = (kept: Set<string>, drawn: Set<string>) => [...drawn].filter((k) => !kept.has(k));

describe('kept models cover every material variant the species are drawn with', () => {
  it('アカエイ: the three LODs of the model and the sand effects', () => {
    const parent = new Group();
    const keeper = DRIVERS.akaei.keep!(parent);
    const kept = keysUnder(parent);
    expect(kept.size).toBeGreaterThan(5);
    for (const lod of [0, 1, 2] as const) {
      const m = new AkaeiModel(akaeiBuild({ id: `ray#${lod}`, length_mm: 600 }).look, lod);
      expect(missing(kept, keysUnder(m.root)), `LOD${lod}`).toEqual([]);
      m.dispose();
    }
    const fxParent = new Group();
    const fx = new SandFX(fxParent);
    fx.imprint(1, 1, 0.3, 0.2, 0.4, () => 0);
    expect(missing(kept, keysUnder(fxParent)), 'sand effects').toEqual([]);
    fx.dispose();
    keeper.dispose();
    expect(parent.children.length).toBe(0);
  });

  it('イシガレイ: the skin of every tier, the fins and the eyes', () => {
    const parent = new Group();
    const keeper = DRIVERS.ishigarei.keep!(parent);
    const kept = keysUnder(parent);
    const m = buildFlounder(new IshigareiLook(lookSpecFor('flounder#7')));
    expect(missing(kept, keysUnder(m.root))).toEqual([]);
    disposeModel(m);
    keeper.dispose();
    expect(parent.children.length).toBe(0);
  });

  it('アラムシロ: the shell and the soft parts', () => {
    const parent = new Group();
    const keeper = DRIVERS.aramushiro.keep!(parent);
    const kept = keysUnder(parent);
    const m = buildSnail(lookFor(3, 0.2), 0.8);
    expect(missing(kept, keysUnder(m.root))).toEqual([]);
    m.dispose();
    keeper.dispose();
    expect(parent.children.length).toBe(0);
  });
});
