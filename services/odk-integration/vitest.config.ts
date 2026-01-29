import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from '../../vitest.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      // NOTE: MSW setup is NOT auto-loaded to preserve backward compatibility
      // with existing vi.fn() tests. MSW-based tests should call initMswForTest():
      // import { initMswForTest } from './msw/index.js';
      // initMswForTest();
    },
  })
);
