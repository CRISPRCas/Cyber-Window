import { defineConfig } from 'vite';

// `base` is required so assets resolve correctly when served from /Cyber-Window/ on GitHub Pages.
export default defineConfig({
  base: '/Cyber-Window/',
  server: { open: true }
});
