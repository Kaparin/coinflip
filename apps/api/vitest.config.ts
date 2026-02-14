import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

export default defineConfig({
  plugins: [tsconfigPaths({ root })],
  resolve: {
    alias: {
      '@coinflip/shared/schemas': resolve(root, 'packages/shared/src/schemas/index.ts'),
      '@coinflip/shared/constants': resolve(root, 'packages/shared/src/constants.ts'),
      '@coinflip/shared/types': resolve(root, 'packages/shared/src/types/index.ts'),
      '@coinflip/shared': resolve(root, 'packages/shared/src/index.ts'),
      '@coinflip/db/schema': resolve(root, 'packages/db/src/schema/index.ts'),
      '@coinflip/db': resolve(root, 'packages/db/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
