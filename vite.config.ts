import { defineConfig } from 'vite';

// Using './' so the built site works whether deployed at a domain root
// or a GitHub Pages project subpath (username.github.io/chain-wrapped/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: false,
  },
  server: {
    port: 5173,
    host: true,
  },
});
