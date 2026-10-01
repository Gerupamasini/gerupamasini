#!/usr/bin/env node
// Static package of the mudflat scene for hosts that cap file sizes (15 MB per binary file) and wrap the
// page in their own document skeleton:
//   node tools/scene/build-web.mjs [outDir]
// - builds with relative paths, keeps only higata.html and the chunks it loads
// - splits each goby GLB into <name>.gltf.json + <name>.bin.wasm + its texture images (byte-identical
//   textures, geometry and animation; only the container changes) and points the page at them
// - index.html is emitted without doctype/html/head/body; _local.html keeps them for local testing
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'dist-higata-web'));
const buildDir = path.join(outDir, '.build');
fs.rmSync(outDir, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', buildDir, '--emptyOutDir'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_BASE: './' } });

const files = [];
const put = (rel, data) => {
  const f = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
  files.push([rel, data.length]);
};

/** GLB → glTF JSON + one compacted .bin + one file per embedded image. */
function splitGLB(glbPath, base) {
  const b = fs.readFileSync(glbPath);
  if (b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2) throw new Error(`${glbPath}: not a glTF 2.0 GLB`);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHdr = 20 + jsonLen;
  const bin = b.subarray(binHdr + 8, binHdr + 8 + b.readUInt32LE(binHdr));
  const views = json.bufferViews;
  const imageView = new Set();
  const out = [];
  (json.images || []).forEach((img, i) => {
    if (img.bufferView === undefined) return;
    const v = views[img.bufferView];
    imageView.add(img.bufferView);
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[img.mimeType];
    const name = `${base}_${String(i).padStart(2, '0')}_${(img.name || 'image').replace(/[^A-Za-z0-9_-]/g, '_')}.${ext}`;
    out.push([name, Buffer.from(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength))]);
    delete img.bufferView;
    img.uri = name;
  });
  const remap = new Map();
  const newViews = [];
  const chunks = [];
  let off = 0;
  views.forEach((v, i) => {
    if (imageView.has(i)) return;
    const pad = (8 - (off % 8)) % 8;
    if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    chunks.push(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
    remap.set(i, newViews.length);
    newViews.push({ ...v, buffer: 0, byteOffset: off });
    off += v.byteLength;
  });
  const tail = (4 - (off % 4)) % 4;
  if (tail) chunks.push(Buffer.alloc(tail));
  const newBin = Buffer.concat(chunks);
  for (const a of json.accessors || []) {
    if (a.bufferView !== undefined) a.bufferView = remap.get(a.bufferView);
    if (a.sparse) {
      a.sparse.indices.bufferView = remap.get(a.sparse.indices.bufferView);
      a.sparse.values.bufferView = remap.get(a.sparse.values.bufferView);
    }
  }
  json.bufferViews = newViews;
  json.buffers = [{ byteLength: newBin.length, uri: `${base}.bin.wasm` }];
  out.push([`${base}.bin.wasm`, newBin]);
  out.push([`${base}.gltf.json`, Buffer.from(JSON.stringify(json))]);
  return out;
}

const MODELS = { mahaze: 'src/assets/models/mahaze/mahaze_juvenile.hero.glb', edohaze: 'src/assets/models/edohaze/edohaze.hero.glb' };
const modelUrls = {};
for (const [key, rel] of Object.entries(MODELS)) {
  const base = path.basename(rel, '.glb').replace(/\./g, '_');
  for (const [name, data] of splitGLB(path.join(root, rel), base)) put(`models/${key}/${name}`, data);
  modelUrls[key] = `./models/${key}/${base}.gltf.json`;
}

// the page and the chunks it loads (transitively), without the models vite emitted
let html = fs.readFileSync(path.join(buildDir, 'higata.html'), 'utf8');
const seen = new Set();
const visit = (rel) => {
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = fs.readFileSync(path.join(buildDir, rel));
  put(rel, src);
  if (rel.endsWith('.js')) for (const m of src.toString().matchAll(/["'`(/]((?:\.\/)?[\w-]+\.js)["'`]/g)) {
    const r = path.join(path.dirname(rel), m[1]);
    if (fs.existsSync(path.join(buildDir, r))) visit(r);
  }
};
for (const m of html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)) visit(m[1]);
const boot = `<script>window.HIGATA_MODEL_URLS = ${JSON.stringify(modelUrls)};</script>\n`;
html = html.replace(/<script type="module"/, `${boot}<script type="module"`)
  .replace(':root {', ':root { color-scheme: dark;');
const body = html
  .replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '').replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8"\s*\/?>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '').replace(/<link rel="icon"[^>]*>\s*/i, '');
put('index.html', Buffer.from(body));
put('_local.html', Buffer.from(`<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}</body>\n</html>\n`));
fs.rmSync(buildDir, { recursive: true, force: true });
const total = files.reduce((a, [, n]) => a + n, 0);
console.log(`${outDir}: ${files.length} files, ${(total / 1e6).toFixed(2)} MB; largest ${(Math.max(...files.map(([, n]) => n)) / 1e6).toFixed(2)} MB`);
for (const [r, n] of files) console.log(`  ${r}  ${(n / 1e6).toFixed(2)} MB`);
