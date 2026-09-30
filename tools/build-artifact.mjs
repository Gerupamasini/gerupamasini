// Builds a single self-contained page (markup + styles + inlined JS bundle)
// for hosting as a claude.ai artifact or any static host:
//   dist/artifact.html          page content only (the host adds the document skeleton)
//   dist/artifact-preview.html  the same wrapped in a full document, for local testing
// usage: node tools/build-artifact.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';

execSync('npx vite build', { stdio: 'inherit' });

const between = (s, a, b) => {
  const i = s.indexOf(a);
  const j = s.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error(`marker not found: ${a} / ${b}`);
  return s.slice(s.indexOf('\n', i) + 1, j);
};

const src = fs.readFileSync('index.html', 'utf8');
const head = between(src, '<!-- page:begin', '<!-- page:end-head -->').trim();
const body = between(src, '<!-- page:body -->', '<!-- page:script -->').trim();
const dist = fs.readFileSync('dist/index.html', 'utf8');
const m = dist.match(/<script[^>]+src="\.?\/?(assets\/[^"]+\.js)"/);
if (!m) throw new Error('bundle script not found in dist/index.html');
// a literal "</script" inside the bundle would end the inline element
const js = fs.readFileSync(`dist/${m[1]}`, 'utf8').replace(/<\/script/gi, '<\\/script');

const page = `${head}\n${body}\n<script type="module">\n${js}\n</script>\n`;
fs.writeFileSync('dist/artifact.html', page);
fs.writeFileSync(
  'dist/artifact-preview.html',
  `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n${page}</body></html>\n`
);
console.log(`dist/artifact.html  ${(page.length / 1024).toFixed(0)} KB`);
