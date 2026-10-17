#!/usr/bin/env node
// The clay stage of the トビハゼ head: the sculpt meshed without textures, the eye globes in their sockets, written
// as a GLB for the photo comparisons (render.mjs, shots-head.mjs). Nothing here ships: the output goes to
// tools/models/tobihaze/out/.
//   node tools/models/tobihaze/build-clay.mjs [--h <cell mm>] [--out <file>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLBBuilder } from '../../lib/glb.mjs';
import { HL, HEAD, EYE_MM, toObject } from './anatomy.mjs';
import { headSDFmm, HEAD_SCULPT } from './head.mjs';
import { surfaceNets } from './mesher.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const h = Number(arg('--h', 0.06));
const outFile = path.resolve(arg('--out', path.join(here, 'out', 'head-clay.glb')));
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);

const f = headSDFmm(HL, HEAD_SCULPT);
const box = { min: [-0.08 * HL, -0.08 * HL, -0.5 * HL], max: [(HEAD_SCULPT.cutS + 0.05) * HL, 0.85 * HL, 0.5 * HL] };
const mesh = surfaceNets(f, box, h, { log });

// to the object frame (metres)
function toObj(m) {
  const n = m.position.length / 3;
  const p = new Float32Array(n * 3), nn = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = toObject([m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2]]);
    p.set(o, i * 3);
    // direction: (s, y, z) → (z, y, −s)
    nn[i * 3] = m.normal[i * 3 + 2]; nn[i * 3 + 1] = m.normal[i * 3 + 1]; nn[i * 3 + 2] = -m.normal[i * 3];
  }
  // (s, y, z) → (z, y, −s) is a rotation: the winding stays
  return { position: p, normal: nn, indices: m.indices };
}
const head = toObj(mesh);

function sphereMesh(r, nt = 48, np = 96) {
  const pos = [], nrm = [], idx = [];
  for (let j = 0; j <= nt; j++) {
    const th = (j / nt) * Math.PI;
    for (let i = 0; i <= np; i++) {
      const ph = (i / np) * Math.PI * 2;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      pos.push(...n.map((v) => v * r)); nrm.push(...n);
    }
  }
  for (let j = 0; j < nt; j++)
    for (let i = 0; i < np; i++) {
      const a = j * (np + 1) + i, b = a + 1, c = a + np + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  return { position: new Float32Array(pos), normal: new Float32Array(nrm), indices: new Uint32Array(idx) };
}

const gb = new GLBBuilder('tobihaze-clay');
const mat = gb.addMaterial({ name: 'Clay', pbrMetallicRoughness: { baseColorFactor: [0.72, 0.7, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.6 } });
const headMesh = gb.addMesh('Head', [gb.primitive({ ...head, material: mat })]);
const eye = sphereMesh(EYE_MM.radius * 0.001);
const eyeMesh = gb.addMesh('Eye', [gb.primitive({ ...eye, material: mat })]);
const nodes = [gb.addNode({ name: 'Head', mesh: headMesh })];
for (const side of [1, -1]) {
  const c = toObject([EYE_MM.center[0], EYE_MM.center[1], EYE_MM.center[2] * side]);
  nodes.push(gb.addNode({ name: side > 0 ? 'Eye_L' : 'Eye_R', mesh: eyeMesh, translation: c }));
}
// regions for the viewer's framing (object frame)
const region = (s0, s1, y0, y1, z) => {
  const a = toObject([s0 * HL, y0 * HL, -z * HL]), b = toObject([s1 * HL, y1 * HL, z * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
const regions = {
  head: region(-0.02, HEAD_SCULPT.cutS, -0.02, HEAD.eye.y + HEAD.eye.d / 2 + 0.02, 0.38),
  face: region(-0.02, 0.5, -0.02, HEAD.eye.y + HEAD.eye.d / 2 + 0.02, 0.36),
};
const root = gb.addNode({ name: 'Tobihaze_Clay', children: nodes, extras: { regions, HLmm: HL } });
gb.addScene('Tobihaze_Clay', [root]);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, gb.toBuffer());
log(`wrote ${path.relative(process.cwd(), outFile)}: head ${head.position.length / 3} verts, ${head.indices.length / 3} tris`);
