#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
  args = process.argv.slice(2);
const value = (k, f) => (args.includes(k) ? args[args.indexOf(k) + 1] : f),
  out = path.resolve(value('--out', 'docs/models/okinawa-coral/screenshots')),
  only = value('--only', '')?.split(',');
const ids = [
  'acropora_digitifera',
  'acropora_hyacinthus',
  'porites_lobata',
  'montipora_foliosa',
  'platygyra_daedalea',
];
const shots = [
  { name: 'five', mode: 'five' },
  ...ids.map((species) => ({ name: species, mode: 'single', species })),
  ...ids.map((species) => ({ name: `${species}-macro`, mode: 'macro', species })),
  { name: 'variants', mode: 'variants', species: ids[0] },
  ...['high', 'low', 'minimal'].map((quality) => ({ name: `reef-${quality}`, mode: 'reef', quality })),
  ...[0, 1, 2].map((lod) => ({ name: `lod${lod}`, mode: 'single', species: ids[1], lod })),
  { name: 'neutral', mode: 'five', water: false },
];
fs.mkdirSync(out, { recursive: true });
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5201', '--strictPort'],
  { cwd: root, stdio: 'ignore' },
);
let browser;
const url = 'http://127.0.0.1:5201/gerupamasini/reference/okinawa-coral-viewer/index.html?capture',
  errors = [],
  results = [];
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i > 80) throw Error('Vite unavailable');
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(180000);
  let rejectInit;
  const failure = new Promise((_, reject) => (rejectInit = reject));
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error(e.message);
    rejectInit(e);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) {
      errors.push(m.text());
      console.error(m.text().slice(0, 1500));
      rejectInit(new Error(m.text().slice(0, 400)));
    }
  });
  await page.goto(url);
  await Promise.race([page.waitForFunction(() => window.__coral), failure]);
  for (const shot of shots) {
    if (only[0] && !only.includes(shot.name)) continue;
    const info = await page.evaluate(
      (s) => window.__coral.set({ lod: 'auto', water: true, quality: 'high', ...s }),
      shot,
    );
    assert.ok(info.colonies > 0);
    assert.ok(info.triangles > 0);
    assert.equal(
      await page.evaluate(
        () => window.__coral.renderer.info.programs.filter((p) => p.diagnostics?.runnable === false).length,
      ),
      0,
    );
    await page
      .locator('#view')
      .screenshot({ path: path.join(out, shot.name + '.jpg'), type: 'jpeg', quality: 92 });
    results.push({ name: shot.name, ...info });
    console.log(JSON.stringify(results.at(-1)));
  }
  const integration = await page.evaluate(async () => {
    const { World } = await import('/gerupamasini/src/app/World.ts'),
      { MapSchema } = await import('/gerupamasini/src/data/schemas/map.ts'),
      { QUALITY_PRESETS } = await import('/gerupamasini/src/core/Settings.ts');
    const c = window.__coral,
      raw = await (await fetch('/gerupamasini/data/maps/hashirimizu.json')).json(),
      station = await (await fetch('/gerupamasini/data/tide/stations/jma_yokosuka.json')).json();
    const map = MapSchema.parse({
      ...raw,
      animals: false,
      substrate: {
        ...raw.substrate,
        palette: raw.substrate.palette.map((s) => (s === 'sand' || s === 'muddy_sand' ? 'rock' : s)),
      },
      corals: { seed: 7123, clusters: [{ x: 24, z: 0, radius: 8, count: 18 }] },
    });
    const w = await World.create(map, station, c.renderer, QUALITY_PRESETS.low);
    try {
      if (!w.corals || !w.corals.specs.length) throw Error('Missing integrated reef colonies');
      const before = w.water.uniforms.uAbsorption.value.toArray();
      const focus = w.corals.specs[0],
        ground = w.terrain.heightAt(focus.x, focus.z);
      c.camera.position.set(focus.x + 1.8, ground + 1.1, focus.z + 2.8);
      c.camera.lookAt(focus.x, ground + 0.25, focus.z);
      w.update(Date.UTC(2026, 9, 12, 3), 0.016, c.camera.position, c.camera);
      await c.field.compile(w.scene, c.camera, w.water);
      c.field.render(w.scene, c.camera, w.water);
      return {
        reef: !!w.corals,
        colonies: w.corals.specs.length,
        draws: w.corals.stats.calls,
        absorption: before,
        water: w.water.level,
        tide: w.tideLevel,
        render: { ...c.field.lastStats },
      };
    } finally {
      w.dispose();
    }
  });
  assert.deepEqual(integration.absorption, [0.1, 0.025, 0.012]);
  assert.equal(integration.water, integration.tide);
  assert.deepEqual(errors, []);
  await page.locator('#view').screenshot({
    path: path.join(out, 'world-integration.jpg'),
    type: 'jpeg',
    quality: 92,
  });
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify({ status: 'passed', results, integration, errors }, null, 2),
  );
  console.log('integration', JSON.stringify(integration));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
