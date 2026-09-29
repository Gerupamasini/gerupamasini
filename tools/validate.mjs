import fs from 'node:fs';
import validator from 'gltf-validator';
const f = process.argv[2] || 'models/ilyoplax_pusilla.glb';
const r = await validator.validateBytes(new Uint8Array(fs.readFileSync(f)));
const i = r.issues; console.log(`errors ${i.numErrors} warnings ${i.numWarnings} infos ${i.numInfos} hints ${i.numHints}`);
for (const m of i.messages.filter((m) => m.severity < 2).slice(0, 12)) console.log(m.severity === 0 ? 'ERR ' : 'WARN', m.code, m.pointer, m.message);
console.log(JSON.stringify(r.info, (k, v) => (Array.isArray(v) && v.length > 8 ? `[${v.length}]` : v)));
