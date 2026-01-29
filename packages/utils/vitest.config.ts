import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from '../../vitest.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/__tests__/**/*.test.ts'],
    },
  })
);
