/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The whole app is emitted as one self-contained index.html so that it can be
// opened straight from disk (file://) or hosted on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [svelte(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 10_000,
  },
  worker: {
    format: 'iife',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
