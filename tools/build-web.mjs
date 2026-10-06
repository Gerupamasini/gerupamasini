#!/usr/bin/env node
// Static web package of the HQ viewer for hosts that cap file sizes (e.g. 15 MB per binary file):
//   node tools/build-web.mjs [outDir] [--default edohaze|mahaze]
// - each models/*.glb is split into <name>.gltf.json + <name>.bin.wasm + its texture images (byte-identical
//   textures, geometry and animation data; only the container changes), under models/<species>/
// - index.html is emitted without the document skeleton (doctype/html/head/body), for hosts that wrap
//   the page themselves; _local.html is the same page with a skeleton, for testing the package locally
// - species: hosted pages may not see the query string, so the page default is set inline
//   (window.GOBY_SPECIES_DEFAULT) and #edohaze / #mahaze select the other one (see src/main.js)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const di = args.indexOf('--default');
const DEFAULT = di >= 0 ? args[di + 1] : 'edohaze';
const outDir = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--default') || path.join(root, 'dist-web'));
const MODELS = { edohaze: 'edohaze.glb', edohaze_gravid: 'edohaze_gravid.glb', mahaze: 'mahaze_juvenile.glb' };
const TITLE = { edohaze: 'エドハゼ 3D', edohaze_gravid: 'エドハゼ 3D', mahaze: 'マハゼ幼魚 3D' };

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const files = [];
const put = (rel, data) => {
  const f = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
  files.push([rel, data.length]);
};
const copyTree = (rel, filter = () => true) => {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) copyTree(r, filter);
    else if (filter(r)) put(r, fs.readFileSync(path.join(root, r)));
  }
};

/** GLB → glTF JSON + one .bin (geometry/animation views, compacted) + one file per embedded image. */
function splitGLB(glbPath, base) {
  const b = fs.readFileSync(glbPath);
  if (b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2) throw new Error(`${glbPath}: not a glTF 2.0 GLB`);
  const jsonLen = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${glbPath}: first chunk is not JSON`);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHdr = 20 + jsonLen;
  if (b.readUInt32LE(binHdr + 4) !== 0x004e4942) throw new Error(`${glbPath}: second chunk is not BIN`);
  const bin = b.subarray(binHdr + 8, binHdr + 8 + b.readUInt32LE(binHdr));
  if ((json.buffers || []).length !== 1) throw new Error(`${glbPath}: expected exactly one buffer`);

  const views = json.bufferViews;
  const imageView = new Set();
  const out = [];
  (json.images || []).forEach((img, i) => {
    if (img.bufferView === undefined) return;
    const v = views[img.bufferView];
    imageView.add(img.bufferView);
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[img.mimeType];
    if (!ext) throw new Error(`${glbPath}: image ${i} has unsupported mimeType ${img.mimeType}`);
    const name = `${base}_${String(i).padStart(2, '0')}_${(img.name || 'image').replace(/[^A-Za-z0-9_-]/g, '_')}.${ext}`;
    out.push([name, Buffer.from(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength))]);
    delete img.bufferView;
    img.uri = name;
  });
  // compact the remaining views into a new buffer; keep 4-byte alignment (8 for safety with strided data)
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
    if (a.bufferView !== undefined) {
      if (!remap.has(a.bufferView)) throw new Error(`${glbPath}: accessor uses an image buffer view`);
      a.bufferView = remap.get(a.bufferView);
    }
    if (a.sparse) {
      a.sparse.indices.bufferView = remap.get(a.sparse.indices.bufferView);
      a.sparse.values.bufferView = remap.get(a.sparse.values.bufferView);
    }
  }
  json.bufferViews = newViews;
  // artifact-style hosts serve only common web types: the buffer goes out under a served binary
  // extension and the glTF JSON as .json (GLTFLoader sniffs the content, not the file name)
  json.buffers = [{ byteLength: newBin.length, uri: `${base}.bin.wasm` }];
  out.push([`${base}.bin.wasm`, newBin]);
  out.push([`${base}.gltf.json`, Buffer.from(JSON.stringify(json))]);
  return out;
}

// ---- models
const modelUrls = {};
for (const [key, file] of Object.entries(MODELS)) {
  const src = path.join(root, 'models', file);
  if (!fs.existsSync(src)) { console.warn(`skip ${key}: ${file} not found`); continue; }
  const base = file.replace(/\.glb$/, '');
  for (const [name, data] of splitGLB(src, base)) put(`models/${key}/${name}`, data);
  modelUrls[key] = `models/${key}/${base}.gltf.json`;
}

// ---- code
// viewer code only (src/main.js and what it imports; the mudflat game lives in src/game, src/world, …)
copyTree('src', (r) => r.endsWith('.js') && (r === path.join('src', 'main.js') || /^src[\\/](materials|fish|scene)[\\/]/.test(r)));
copyTree('vendor/three', (r) => r.endsWith('.js') || r.endsWith('LICENSE'));

// ---- page
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const boot = `<script>window.GOBY_SPECIES_DEFAULT = ${JSON.stringify(DEFAULT)}; window.GOBY_MODEL_URLS = ${JSON.stringify(modelUrls)};</script>\n`;
html = html
  .replace(/<title>[^<]*<\/title>/, `<title>${TITLE[DEFAULT]}</title>`)
  .replace('<script type="module" src="./src/main.js"></script>', `${boot}<script type="module" src="./src/main.js"></script>`)
  // the viewer is a deliberately dark, single-theme page: native controls and scrollbars follow it
  .replace(':root {\n', ':root {\n    color-scheme: dark;\n');
if (!html.includes('GOBY_SPECIES_DEFAULT')) throw new Error('index.html: module script tag not found');
const body = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<link rel="icon"[^>]*>\s*/i, '');
put('index.html', Buffer.from(body));
put('_local.html', Buffer.from(`<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="icon" href="data:,">\n</head>\n<body>\n${body}</body>\n</html>\n`));

const total = files.reduce((a, [, n]) => a + n, 0);
const big = files.filter(([, n]) => n > 15e6);
console.log(`${outDir}: ${files.length} files, ${(total / 1e6).toFixed(2)} MB; largest ${Math.max(...files.map(([, n]) => n)) / 1e6} MB`);
if (big.length) console.warn('files over 15 MB:', big.map(([r]) => r).join(', '));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(files.map(([r]) => r).filter((r) => r !== '_local.html'), null, 1));
