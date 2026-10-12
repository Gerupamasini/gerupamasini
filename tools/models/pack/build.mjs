#!/usr/bin/env node
// Packs the model masters (src/assets/models/**/*.glb, as the model builders write them) into the copies the game
// loads (src/assets/models-packed/): textures to KTX2 / UASTC, geometry to meshopt. Only what changed is packed again.
//   node tools/models/pack/build.mjs [--force] [--jobs N] [--check] [filter ...]
//     filter   only masters whose path contains one of these (e.g. mahaze nets/net_small)
//     --check  pack nothing; fail when a packed copy is missing or older than its master (CI, `npm run check`)
// The encoded images are kept in node_modules/.cache/higata-pack, so packing again after a geometry change is quick.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { MANIFEST, MASTER_DIR, PACKED_DIR, PACK_SETTINGS } from './settings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const check = args.includes('--check');
const jobsAt = args.indexOf('--jobs');
const jobs = Math.max(1, jobsAt >= 0 ? Number(args[jobsAt + 1]) : Math.min(4, os.availableParallelism?.() ?? os.cpus().length));
const filters = args.filter((a, i) => !a.startsWith('--') && !(jobsAt >= 0 && i === jobsAt + 1));
const cacheDir = path.join(root, 'node_modules', '.cache', 'higata-pack');

function list(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.glb')) out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const mb = (n) => (n / 1e6).toFixed(2);

const masterDir = path.join(root, MASTER_DIR);
const packedDir = path.join(root, PACKED_DIR);
const manifestFile = path.join(root, MANIFEST);
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { files: {} };
const masters = list(masterDir);
const wanted = masters.filter((rel) => !filters.length || filters.some((f) => rel.includes(f)));

const stale = [];
for (const rel of wanted) {
  const e = manifest.files[rel];
  const hash = sha256(path.join(masterDir, rel));
  if (force || !e || e.settings !== PACK_SETTINGS || e.master !== hash || !fs.existsSync(path.join(packedDir, rel))) stale.push({ rel, hash });
}
const orphans = [...new Set([...list(packedDir), ...Object.keys(manifest.files)])].filter((rel) => !masters.includes(rel));

if (check) {
  for (const { rel } of stale) console.error(`stale: ${rel}`);
  for (const rel of orphans) console.error(`orphan: ${rel} (its master is gone)`);
  if (stale.length || orphans.length) {
    console.error(`${stale.length + orphans.length} packed model(s) out of date: run \`npm run models:pack\``);
    process.exit(1);
  }
  console.log(`${wanted.length} packed models up to date (${PACK_SETTINGS})`);
  process.exit(0);
}

for (const rel of orphans) {
  fs.rmSync(path.join(packedDir, rel), { force: true });
  delete manifest.files[rel];
  console.log(`removed ${rel} (its master is gone)`);
}

const saveManifest = () => {
  const files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, `${JSON.stringify({ files }, null, 1)}\n`);
};

if (!stale.length) {
  saveManifest();
  console.log(`${wanted.length} packed models up to date`);
  process.exit(0);
}

console.log(`packing ${stale.length} of ${wanted.length} models with ${jobs} worker(s)`);
const t0 = Date.now();
const queue = [...stale];
let failed = 0;
const run = () => new Promise((resolve) => {
  const w = new Worker(new URL('./worker.mjs', import.meta.url));
  const next = () => {
    const job = queue.shift();
    if (!job) { w.terminate(); resolve(); return; }
    w.once('message', (r) => {
      if (r.error) {
        failed++;
        console.error(`FAILED ${job.rel}: ${r.error}`);
      } else {
        const s = r.stats;
        manifest.files[job.rel] = { settings: PACK_SETTINGS, master: job.hash, masterBytes: s.bytesIn, bytes: s.bytesOut, images: s.images, minPsnr: s.images ? s.minPsnr : null };
        saveManifest();
        console.log(`${job.rel.padEnd(42)} ${mb(s.bytesIn).padStart(6)} → ${mb(s.bytesOut).padStart(6)} MB  images ${mb(s.imageBytesIn)} → ${mb(s.imageBytesOut)}, geometry ${mb(s.geometryBytesIn)} → ${mb(s.geometryBytesOut)} (${s.meshoptViews}/${s.views} views)${s.images ? `, min PSNR ${s.minPsnr} dB (${s.minPsnrImage})` : ''}  ${r.seconds.toFixed(0)} s`);
      }
      next();
    });
    w.postMessage({ id: job.rel, master: path.join(masterDir, job.rel), packed: path.join(packedDir, job.rel), cacheDir });
  };
  next();
});
await Promise.all(Array.from({ length: Math.min(jobs, stale.length) }, run));
const total = (key) => Object.values(manifest.files).reduce((a, e) => a + (e[key] ?? 0), 0);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s: all packed models ${mb(total('masterBytes'))} → ${mb(total('bytes'))} MB${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
