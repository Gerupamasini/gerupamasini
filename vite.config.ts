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
      // index.html: the game; higata.html: the mudflat goby scene (エドハゼ・マハゼ)
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        higata: fileURLToPath(new URL('./higata.html', import.meta.url)),
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
