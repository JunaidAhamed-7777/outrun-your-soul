import { defineConfig } from 'vitest/config';

// Relative base so the build runs from an itch.io nested iframe URL, not only site root.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The suite runs heavy fuzz and bot tests in parallel; 5 s defaults flake under load.
    testTimeout: 30_000,
  },
});
