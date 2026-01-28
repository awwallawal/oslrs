/**
 * Request Inspector Utilities for MSW Tests
 *
 * Convenience wrappers around mockServerState for inspecting
 * HTTP requests made during tests.
 *
 * @module msw/request-inspector
 */

import { mockServerState, type LoggedRequest } from './server-state.js';

/**
 * Filter options for querying requests
 */
export interface RequestFilter {
  /** Filter by HTTP method */
  method?: string;
  /** Filter by path (substring match) */
  path?: string;
  /** Filter by path using regex */
  pathPattern?: RegExp;
  /** Filter by header presence */
  hasHeader?: string;
}

/**
 * Get all logged requests, optionally filtered
 *
 * @example
 * // Get all requests
 * const allRequests = getRequests();
 *
 * // Get only POST requests
 * const postRequests = getRequests({ method: 'POST' });
 *
 * // Get requests to /v1/sessions
 * const sessionRequests = getRequests({ path: '/v1/sessions' });
 */
export function getRequests(filter?: RequestFilter): LoggedRequest[] {
  let requests = mockServerState.getRequests();

  if (filter) {
    if (filter.method) {
      const method = filter.method.toUpperCase();
      requests = requests.filter(r => r.method === method);
    }
    if (filter.path) {
      const path = filter.path;
      requests = requests.filter(r => r.path.includes(path));
    }
    if (filter.pathPattern) {
      const pattern = filter.pathPattern;
      requests = requests.filter(r => pattern.test(r.path));
    }
    if (filter.hasHeader) {
      const header = filter.hasHeader;
      requests = requests.filter(r => header in r.headers);
    }
  }

  return requests;
}

/**
 * Get the last logged request, optionally filtered
 *
 * @example
 * const lastRequest = getLastRequest();
 * const lastFormRequest = getLastRequest({ path: '/forms' });
 */
export function getLastRequest(filter?: RequestFilter): LoggedRequest | undefined {
  const requests = getRequests(filter);
  return requests[requests.length - 1];
}

/**
 * Clear all logged requests
 *
 * Useful for isolating assertions to specific parts of a test
 */
export function clearRequests(): void {
  mockServerState.clearRequests();
}

/**
 * Get request count, optionally filtered
 *
 * @example
 * expect(getRequestCount({ method: 'POST' })).toBe(3);
 */
export function getRequestCount(filter?: RequestFilter): number {
  return getRequests(filter).length;
}

/**
 * Assert that a specific request was made
 *
 * @example
 * expectRequest({
 *   method: 'POST',
 *   path: '/v1/sessions',
 *   bodyContains: { email: 'admin@example.com' }
 * });
 */
export function expectRequest(options: {
  method: string;
  path: string;
  bodyContains?: Record<string, unknown>;
}): void {
  const requests = getRequests({ method: options.method, path: options.path });

  if (requests.length === 0) {
    throw new Error(
      `Expected ${options.method} request to ${options.path} but none found. ` +
      `Logged requests: ${JSON.stringify(mockServerState.getRequests().map(r => `${r.method} ${r.path}`))}`
    );
  }

  if (options.bodyContains) {
    const matching = requests.find(r => {
      if (typeof r.body !== 'object' || r.body === null) return false;
      return Object.entries(options.bodyContains!).every(
        ([key, value]) => (r.body as Record<string, unknown>)[key] === value
      );
    });

    if (!matching) {
      throw new Error(
        `Expected ${options.method} ${options.path} with body containing ${JSON.stringify(options.bodyContains)} ` +
        `but got: ${JSON.stringify(requests.map(r => r.body))}`
      );
    }
  }
}
