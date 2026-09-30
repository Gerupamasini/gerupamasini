import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths: the build runs from any sub-path or as a single
  // self-contained page (tools/build-artifact.mjs)
  base: './',
  build: {
    // single bundle: all assets are generated procedurally at runtime
    chunkSizeWarningLimit: 1200,
    target: 'es2022',
    modulePreload: false,
  },
});
