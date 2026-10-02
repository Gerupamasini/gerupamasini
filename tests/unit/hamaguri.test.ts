import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { HamaguriDriver } from '../../src/creatures/species/hamaguri/HamaguriDriver';
import type { Individual } from '../../src/creatures/Individual';
import type { DriverContext } from '../../src/creatures/drivers/Driver';

const ind = { id: 'h1', pos: new Vector3(1, 0, 2), heading: 0.3, length_mm: 60 } as unknown as Individual;
const ctx = (water: number, player = new Vector3(0, 1, 0)): DriverContext => ({
  floor: { heightAt: () => 0, waterAt: () => water }, player, simScale: 1, nowMs: 0,
});
const run = (d: HamaguriDriver, secs: number, c: DriverContext) => { for (let t = 0; t < secs; t += 1 / 30) d.update(1 / 30, c); };

describe('hamaguri driver', () => {
  it('builds the named hierarchy with separate valves', () => {
    const d = new HamaguriDriver();
    const root = new Group();
    d.attach(root, ind);
    for (const n of ['HamaguriRoot', 'LeftShell', 'RightShell', 'SoftBody', 'Foot', 'InhalantSiphon', 'ExhalantSiphon']) expect(root.getObjectByName(n), n).toBeTruthy();
    expect(root.getObjectByName('LeftShellMesh')).not.toBe(root.getObjectByName('RightShellMesh'));
  });

  it('feeds under water, shuts and burrows deeper when frightened, then resurfaces to feed', () => {
    const d = new HamaguriDriver();
    const root = new Group();
    d.attach(root, ind);
    d.setIntent({ id: 1, kind: 'forage', urgency: 0.5, seconds: 20 });
    run(d, 4, ctx(0.2));
    expect(d.state).toBe('FILTER_FEEDING');
    const siphon = root.getObjectByName('InhalantSiphonTube')!;
    expect(siphon.scale.y).toBeGreaterThan(0.15);
    const y0 = root.getObjectByName('HamaguriRoot')!.position.y;
    d.setIntent({ id: 2, kind: 'flee', urgency: 1, seconds: 4 });
    run(d, 0.5, ctx(0.2));
    expect(siphon.scale.y).toBeLessThan(0.12);
    const seen = new Set<string>();
    for (let t = 0; t < 25; t += 1 / 30) { d.update(1 / 30, ctx(0.2)); seen.add(d.state); }
    expect(seen.has('BURROW')).toBe(true);
    expect(root.getObjectByName('HamaguriRoot')!.position.y).toBeLessThan(y0 - 0.01);
    d.setIntent({ id: 3, kind: 'forage', urgency: 0.5, seconds: 20 });
    run(d, 60, ctx(0.2));
    expect(d.state).toBe('FILTER_FEEDING');
  });

  it('stays shut while the flat is dry', () => {
    const d = new HamaguriDriver();
    d.attach(new Group(), ind);
    d.setIntent({ id: 1, kind: 'forage', urgency: 0.5, seconds: 10 });
    run(d, 5, ctx(-0.5));
    expect(['BURIED', 'CLOSE_SHELL', 'SIPHON_RETRACT']).toContain(d.state);
  });
});
