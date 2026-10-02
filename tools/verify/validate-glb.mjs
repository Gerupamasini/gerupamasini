import fs from 'node:fs';
import validator from 'gltf-validator';
const f = process.argv[2];
const buf = fs.readFileSync(f);
const r = await validator.validateBytes(new Uint8Array(buf), { uri: f, maxIssues: 50 });
console.log(JSON.stringify(r.issues, null, 1).slice(0, 4000));
console.log(JSON.stringify(r.info, null, 1).slice(0, 1500));
