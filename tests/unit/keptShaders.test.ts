import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Color, Group, Vector3, type Material, type Mesh, type Object3D, type ShaderMaterial, type SkinnedMesh } from 'three';
import { SpeciesSchema } from '../../src/data/schemas';
import { generateIndividual, minDepthFor } from '../../src/creatures/Individual';
import type { DriverContext } from '../../src/creatures/drivers/Driver';
import { AkaeiDriver } from '../../src/creatures/species/akaei/AkaeiDriver';
import { makeSkinMaterial } from '../../src/creatures/species/akaei/material';
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

describe('a new ray is born in its far form', () => {
  const root = new URL('../../', import.meta.url).pathname;
  const species = SpeciesSchema.parse(JSON.parse(readFileSync(root + 'public/data/species/hemitrygon_akajei.json', 'utf8')));
  const triangles = (holder: Object3D) => {
    let most = 0;
    holder.traverse((o) => { const m = o as SkinnedMesh; if (m.isSkinnedMesh && m.visible) most = Math.max(most, (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3); });
    return most;
  };

  it('the first attach builds the far model; the first update near the player brings the close-up', () => {
    const ind = generateIndividual(species, 5, 0, 0, 0, 0, 0, [820, 820]);
    const holder = AkaeiDriver.makeModel().root;
    new Group().add(holder);
    const d = new AkaeiDriver();
    d.attach(holder, ind);
    expect(d.lod).toBe(2);
    expect(triangles(holder)).toBeLessThan(3000);
    const ctx: DriverContext = { floor: { heightAt: () => 0, waterAt: () => 0.6 }, player: new Vector3(3, 0, 3), simScale: 1, nowMs: 0, minDepth: minDepthFor(species, ind.length_mm) };
    d.update(1 / 30, ctx);
    expect(d.lod).toBe(0);
    expect(triangles(holder)).toBeGreaterThan(20000);
    d.detach();
  });
});

describe('the far ray skin compiles without the relief and the fine detail', () => {
  const look = { tint: new Color(1, 1, 1), dark: 0.4, seed: 0.3 };
  const chunks = ['common', 'begin_vertex', 'color_fragment', 'roughnessmap_fragment', 'normal_fragment_maps', 'lights_fragment_end', 'lights_physical_fragment'].map((c) => `#include <${c}>`).join('\n');
  const compiled = (cheap: boolean) => {
    const m = makeSkinMaterial(look, cheap);
    const shader = { uniforms: {}, vertexShader: chunks, fragmentShader: chunks } as unknown as Parameters<NonNullable<typeof m.onBeforeCompile>>[0];
    m.onBeforeCompile!(shader, null as never);
    return { m, frag: shader.fragmentShader };
  };
  it('the near skin has the relief and AK_DETAIL 1', () => {
    const { m, frag } = compiled(false);
    expect(m.defines?.AK_DETAIL).toBe('1.0');
    expect(frag).toContain('dFdx(akHt)');
    expect(frag).toContain('float det = AK_DETAIL;');
  });
  it('the far skin has neither', () => {
    const { m, frag } = compiled(true);
    expect(m.defines?.AK_DETAIL).toBe('0.0');
    expect(frag).not.toContain('dFdx(akHt)');
    expect(frag).not.toContain('akPerturb(-vViewPosition');
    expect(frag).not.toContain('material.clearcoat');
  });
});
