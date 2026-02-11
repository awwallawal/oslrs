/**
 * Shared configuration for OSLRS k6 load tests.
 *
 * Override via k6 environment variables:
 *   k6 run -e BASE_URL=http://localhost:4000 tests/load/smoke.js
 *   k6 run -e STAFF_EMAIL=admin@staging.local tests/load/smoke.js
 */

// API base configuration
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API_PREFIX = '/api/v1';

// Dev seed credentials (default to local dev seed)
export const STAFF_CREDENTIALS = {
  email: __ENV.STAFF_EMAIL || 'admin@dev.local',
  password: __ENV.STAFF_PASS || 'admin123',
};

// Public test user credentials (registered in test setup() functions)
export const PUBLIC_TEST_CREDENTIALS = {
  email: __ENV.PUBLIC_EMAIL || 'loadtest-public@test.local',
  password: __ENV.PUBLIC_PASS || 'LoadTest123!',
  fullName: 'Load Test Public User',
};

// NFR threshold targets (milliseconds)
export const THRESHOLDS = {
  HEALTH_P95: 50,        // Health check: fast baseline
  API_P95: 250,          // NFR1.1: API < 250ms p95
  STRESS_P95: 500,       // Combined stress: 2x NFR1.1 allowance
  ERROR_RATE: 0.01,      // < 1% error rate
  ERROR_RATE_STRICT: 0.001, // < 0.1% for health check
};
