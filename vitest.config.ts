import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@file-service/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/shared/src/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      'apps/api/src/**/*.test.ts',
      'e2e/**/*.test.ts',
    ],
  },
});
