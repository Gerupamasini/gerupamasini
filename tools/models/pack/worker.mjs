// One packing worker: takes { master, packed, cacheDir } jobs and answers with the stats.
import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import { packModel } from './pack.mjs';

parentPort.on('message', async ({ id, master, packed, cacheDir }) => {
  try {
    const t0 = Date.now();
    const { glb, stats } = await packModel(fs.readFileSync(master), { cacheDir });
    fs.mkdirSync(path.dirname(packed), { recursive: true });
    fs.writeFileSync(packed, glb);
    parentPort.postMessage({ id, stats, seconds: (Date.now() - t0) / 1000 });
  } catch (e) {
    parentPort.postMessage({ id, error: e instanceof Error ? e.stack ?? e.message : String(e) });
  }
});
