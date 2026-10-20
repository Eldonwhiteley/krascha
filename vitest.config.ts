import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
