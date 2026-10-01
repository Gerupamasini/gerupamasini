import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves the site under /<repo>/. Override with VITE_BASE=/ for local or custom hosting.
const base = process.env.VITE_BASE ?? '/gerupamasini/';

export default defineConfig({
  base,
  plugins: [preact()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // hermit-lab.html: stand-alone viewer for the procedural ユビナガホンヤドカリ
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        hermitLab: fileURLToPath(new URL('./hermit-lab.html', import.meta.url)),
      },
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: { port: 5173, host: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
