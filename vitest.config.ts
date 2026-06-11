import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@file-service/shared': resolve(__dirname, 'shared/src/index.ts'),
    },
  },
  test: {
    include: [
      'shared/src/**/*.test.ts',
      'frontend/src/**/*.test.ts',
      'backend/api/src/**/*.test.ts',
    ],
  },
});
