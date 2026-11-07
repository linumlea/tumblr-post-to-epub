import { build } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const root = resolve(__dirname, '..');

const common = {
  sourcemap: true,
  target: 'es2022',
};

const configs = [
  {
    configFile: false,
    base: './',
    build: {
      ...common,
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: { popup: resolve(root, 'src/popup/index.html') },
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          format: 'es',
        },
      },
    },
  },
  {
    configFile: false,
    base: './',
    build: {
      ...common,
      outDir: 'dist',
      emptyOutDir: false,
      rollupOptions: {
        input: { background: resolve(root, 'src/background/index.ts') },
        output: { entryFileNames: 'background/index.js', format: 'iife', inlineDynamicImports: true },
      },
    },
  },
  {
    configFile: false,
    base: './',
    build: {
      ...common,
      outDir: 'dist',
      emptyOutDir: false,
      rollupOptions: {
        input: { content: resolve(root, 'src/content/index.ts') },
        output: { entryFileNames: 'content/index.js', format: 'iife', inlineDynamicImports: true },
      },
    },
  },
];

for (const config of configs) await build(config);
