/**
 * Vitest Setup File for MSW Integration
 *
 * This file is loaded before each test file runs (via vitest.config.ts setupFiles).
 * It manages the MSW server lifecycle:
 * - beforeAll: Start the server
 * - afterEach: Reset handlers and state for test isolation
 * - afterAll: Clean up server resources
 *
 * @module msw/setup
 */

import { beforeAll, afterEach, afterAll } from 'vitest';
import { server, mockServerState } from './server.js';

/**
 * Start MSW server before all tests
 *
 * onUnhandledRequest: 'warn' logs a warning for requests that don't match any handler.
 * This helps catch missing handlers during test development.
 */
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'warn',
  });
});

/**
 * Reset handlers and state after each test
 *
 * This ensures test isolation:
 * - Custom handlers added via server.use() are removed
 * - Default handlers are restored
 * - Server state (forms, request log, error injection) is cleared
 */
afterEach(() => {
  server.resetHandlers();
  mockServerState.reset();
});

/**
 * Close server after all tests complete
 *
 * Releases resources and stops intercepting requests.
 */
afterAll(() => {
  server.close();
});
