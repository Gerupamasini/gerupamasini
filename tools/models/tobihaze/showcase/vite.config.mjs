// Builds the トビハゼ showcase into one ES module (three.js and the game's driver included):
//   OUT=/tmp/showcase npx vite build --config tools/models/tobihaze/showcase/vite.config.mjs
// then put page.html, showcase.js and a tobihaze GLB (as tobihaze.glb, or named by the canvas's data-model) side by side.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: './',
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: process.env.OUT ?? here('./dist'),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      input: here('./showcase.ts'),
      output: { format: 'es', entryFileNames: 'showcase.js', inlineDynamicImports: true },
    },
  },
});
