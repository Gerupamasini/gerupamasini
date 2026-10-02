import { defineConfig, type Plugin } from 'vite';
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
// the deploy's running number (GitHub Actions run number): goes up on every deploy even when the version does not
const build = process.env.VITE_BUILD ?? process.env.GITHUB_RUN_NUMBER ?? '';
const builtAt = new Date().toISOString();
const buildInfo = { version: pkg.version, commit, build, builtAt };

/** Writes version.json next to index.html so a running page can learn that a newer deploy exists. */
function versionFile(): Plugin {
  return {
    name: 'higata-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(buildInfo) });
    },
  };
}

export default defineConfig({
  base,
  plugins: [preact(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD__: JSON.stringify(build),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  server: { port: 5173, host: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
