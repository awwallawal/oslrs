/**
 * MSW Mock ODK Central Server
 *
 * Exports all MSW utilities for ODK Central API simulation in tests.
 *
 * Usage in tests:
 * ```typescript
 * import { server, mockServerState, ODK_BASE_URL, initMswForTest } from './msw/index.js';
 *
 * // Initialize MSW for this test file
 * initMswForTest();
 *
 * test('my test', async () => {
 *   // Configure state
 *   mockServerState.preRegisterForm('my-form');
 *   mockServerState.setNextError(500, 'ERROR', 'Simulated failure');
 *
 *   // Run test code that makes fetch requests
 *   // ...
 *
 *   // Assert on logged requests
 *   const requests = mockServerState.getRequests();
 *   expect(requests).toHaveLength(1);
 * });
 * ```
 *
 * @module msw
 */

export { server, handlers, ODK_BASE_URL } from './server.js';
export { mockServerState } from './server-state.js';
export type { LoggedRequest, MockForm, MockSubmission, InjectedError } from './server-state.js';

// Convenience functions for test setup

/**
 * Reset server state to initial values
 */
export function resetServerState(): void {
  mockServerState.reset();
}

/**
 * Set forms for a project
 */
export function setForms(
  projectId: number,
  forms: Array<{ xmlFormId: string; name: string; state: string }>
): void {
  mockServerState.setFormsForProject(projectId, forms);
}

/**
 * Set submission count for a form
 */
export function setSubmissionCount(xmlFormId: string, count: number): void {
  mockServerState.setSubmissionCount(xmlFormId, count);
}

/**
 * Set submissions for a form
 */
export function setSubmissions(
  xmlFormId: string,
  submissions: Array<{
    instanceId: string;
    submitterId: number;
    createdAt: string;
    updatedAt: string;
    reviewState?: string;
  }>
): void {
  mockServerState.setSubmissions(xmlFormId, submissions);
}

// Re-export MSW primitives for custom handler creation
export { http, HttpResponse } from 'msw';

import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './server.js';
import { mockServerState } from './server-state.js';

/**
 * Initialize MSW for a test file
 *
 * Call this at the top level of a test file to set up MSW lifecycle hooks.
 * This manages server start/stop and resets state between tests.
 *
 * @example
 * import { initMswForTest } from './msw/index.js';
 * initMswForTest();
 *
 * describe('My MSW tests', () => {
 *   test('...', () => {});
 * });
 */
export function initMswForTest(): void {
  beforeAll(() => {
    server.listen({
      onUnhandledRequest: 'warn',
    });
  });

  afterEach(() => {
    server.resetHandlers();
    mockServerState.reset();
  });

  afterAll(() => {
    server.close();
  });
}
