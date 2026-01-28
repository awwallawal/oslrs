/**
 * MSW Server Setup for Node.js Testing
 *
 * Creates and exports an MSW server instance configured with ODK Central
 * API handlers for use in Vitest integration tests.
 *
 * @module msw/server
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';

/**
 * MSW server instance
 *
 * Usage in tests:
 * - Import in vitest setup file for automatic lifecycle management
 * - Or import directly in tests for manual control
 *
 * @example
 * // In setup.ts (recommended)
 * import { server } from './server.js';
 * beforeAll(() => server.listen());
 * afterEach(() => server.resetHandlers());
 * afterAll(() => server.close());
 *
 * @example
 * // In individual test (for custom handlers)
 * import { server } from './msw/server.js';
 * import { http, HttpResponse } from 'msw';
 *
 * test('handles custom error', () => {
 *   server.use(
 *     http.post('/v1/sessions', () => {
 *       return HttpResponse.json({ error: 'Custom' }, { status: 503 });
 *     })
 *   );
 *   // ... test code
 * });
 */
export const server = setupServer(...handlers);

// Re-export for convenience
export { handlers };
export { mockServerState } from './server-state.js';
export { ODK_BASE_URL } from './handlers.js';
