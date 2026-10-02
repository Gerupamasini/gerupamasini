// Single-file build of the demo: esbuild bundles viewer/app.js (+ three.js), the GLB is embedded as base64 text.
//   node tools/pack/pack-html.mjs [--glb assets/generated/yamame.glb] [--out dist/yamame-demo.html]
// Writes <out> (complete document) and <out minus .html>.fragment.html (no doctype/html/head/body: the form the Artifact publisher expects).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const glbPath = path.resolve(ROOT, arg('glb', 'assets/generated/yamame.glb')), out = path.resolve(ROOT, arg('out', 'dist/yamame-demo.html'));

const entry = `
import { start } from './viewer/app.js';
const b64 = document.getElementById('yamame-glb').textContent.trim();
const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
document.getElementById('yamame-glb').remove();
start({ glbBytes: bytes.buffer }).catch((e) => { const d = document.createElement('pre'); d.style.cssText = 'color:#f88;padding:1em;white-space:pre-wrap'; d.textContent = 'Failed to start: ' + (e && e.stack || e); document.body.appendChild(d); });
`;
const res = await build({ stdin: { contents: entry, resolveDir: ROOT, sourcefile: 'pack-entry.js', loader: 'js' }, bundle: true, minify: true, format: 'iife', target: 'es2022', write: false, legalComments: 'none', logLevel: 'warning' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const b64 = fs.readFileSync(glbPath).toString('base64');
const title = 'ヤマメ 3D';
const css = `:root{color-scheme:dark}html,body{height:100%;margin:0;background:#10222b;color:#d6e8ee;overflow:hidden}canvas{display:block}`;
const body = `<title>${title}</title>\n<style>${css}</style>\n<script id="yamame-glb" type="text/plain">${b64}</script>\n<script>${js}</script>\n`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n${body}</body></html>\n`);
const frag = out.replace(/\.html$/, '.fragment.html'); fs.writeFileSync(frag, body);
const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(2);
console.log(`[pack] ${path.relative(ROOT, out)} ${mb(out)} MB, ${path.relative(ROOT, frag)} ${mb(frag)} MB (glb ${mb(glbPath)} MB, js ${(js.length / 1048576).toFixed(2)} MB)`);
