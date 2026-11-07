import { defineConfig } from 'vite';

// Legacy file kept for editor discovery only; the extension build uses scripts/build.mjs
// to emit IIFE bundles for Firefox content/background scripts and an ES popup bundle.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
});
