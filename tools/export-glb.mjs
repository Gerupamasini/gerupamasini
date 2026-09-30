// Export assets/models/kentish_plover.glb (LOD0 mesh, skeleton, baked vertex-colour plumage, all clips).
// Runs the exporter in the pre-installed headless Chromium (needs WebGL for the colour bake).
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('assets/models', { recursive: true });
const server = await createServer({ logLevel: 'error', server: { port: 5198, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log(`[browser] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://127.0.0.1:5198/validation.html?mode=export');
const res = await page.evaluate(async () => {
  const mod = await import('/src/validation/exportGLB.js');
  const THREE = await import('three');
  const r = new THREE.WebGLRenderer();
  const { glb, clips } = await mod.exportGLB(r);
  const bytes = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), clips };
});
const buf = Buffer.from(res.b64, 'base64');
writeFileSync('assets/models/kentish_plover.glb', buf);
console.log(`wrote assets/models/kentish_plover.glb (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
console.log('clips:', res.clips.join(', '));
await browser.close();
await server.close();
