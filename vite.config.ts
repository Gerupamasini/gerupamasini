import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// GitHub Pages serves the site under /<repo>/. Override with VITE_BASE=/ for local or custom hosting.
const base = process.env.VITE_BASE ?? '/gerupamasini/';

// Build identity, shown in the title footer and logged at boot so a deploy can be checked against a commit.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const commit = (() => {
  const fromEnv = process.env.VITE_COMMIT ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try { return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
})();

export default defineConfig({
  base,
  plugins: [preact()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // the game, and the walkable fictional flat (flat.html)
      input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), flat: fileURLToPath(new URL('./flat.html', import.meta.url)) },
      output: { manualChunks: { three: ['three'] } },
    },
  },
  worker: { format: 'es' },
  server: { port: 5173, host: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
