import { defineConfig } from 'vite';

// Vite builds the mudflat game (game.html). The photoreal viewer (index.html) runs unbundled
// from vendor/three via `npm run serve`.
export default defineConfig({
  build: { rollupOptions: { input: { game: 'game.html' } } },
});
