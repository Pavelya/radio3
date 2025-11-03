import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node'
  },
  resolve: {
    alias: {
      '@radio/core': path.resolve(__dirname, '../../packages/radio-core/src')
    }
  }
});
