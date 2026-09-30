import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // single bundle: all assets are generated procedurally at runtime
    chunkSizeWarningLimit: 1200,
    target: 'es2022',
  },
});
