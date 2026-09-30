// Builds the demo into ONE self-contained HTML body fragment (inline <style> + inline module script),
// suitable for hosting where only inline code is allowed (e.g. a claude.ai Artifact).
// Output: dist-artifact/kentish-plover.html
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tmp = join(root, 'dist-artifact', 'tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

await build({
  configFile: false,
  root,
  base: './',
  logLevel: 'warn',
  build: {
    outDir: tmp,
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: join(root, 'index.html'),
      output: { codeSplitting: false, entryFileNames: 'app.js', assetFileNames: '[name][extname]' },
    },
  },
});

const html = readFileSync(join(tmp, 'index.html'), 'utf8');
const js = readFileSync(join(tmp, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const cssFile = readdirSync(tmp).find((f) => f.endsWith('.css'));
const css = cssFile ? readFileSync(join(tmp, cssFile), 'utf8') : '';
const title = html.match(/<title>(.*?)<\/title>/)[1];
const fonts = [...html.matchAll(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com[^"]+)"/g)].map((m) => m[1]);
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '')
  .trim();

const out = [
  `<title>${title}</title>`,
  ...fonts.map((f) => `<link rel="stylesheet" href="${f}">`),
  `<style>\n${css}\n</style>`,
  body,
  `<script type="module">\n${js}\n</script>`,
].join('\n');
writeFileSync(join(root, 'dist-artifact', 'kentish-plover.html'), out);
rmSync(tmp, { recursive: true, force: true });
console.log(`dist-artifact/kentish-plover.html  ${(out.length / 1024).toFixed(0)} KB`);
