import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, API_PREFIX, STAFF_CREDENTIALS } from '../config.js';

/**
 * Verify preconditions before running load tests:
 *  1. API is reachable (health endpoint)
 *  2. Dev seed data exists (staff can log in)
 *
 * Call this in the k6 setup() function.
 * @returns {{ token: string }} Auth token for use in tests
 * @throws {Error} If preconditions are not met
 */
export function checkPreconditions() {
  // 1. Verify API is running
  const healthRes = http.get(`${BASE_URL}/health`);
  const apiUp = check(healthRes, {
    'API is reachable': (r) => r.status === 200,
  });

  if (!apiUp) {
    throw new Error(
      `PRECONDITION FAILED: API not responding at ${BASE_URL}/health ` +
        `(status: ${healthRes.status}). Is the dev server running?`
    );
  }

  // 2. Verify seed data exists
  const loginRes = http.post(
    `${BASE_URL}${API_PREFIX}/auth/staff/login`,
    JSON.stringify({
      email: STAFF_CREDENTIALS.email,
      password: STAFF_CREDENTIALS.password,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const seedOk = check(loginRes, {
    'Seed data exists (admin login works)': (r) => r.status === 200,
  });

  if (!seedOk) {
    throw new Error(
      `PRECONDITION FAILED: Cannot log in with seed credentials ` +
        `(${STAFF_CREDENTIALS.email}). Run \`pnpm db:seed:dev\` first.`
    );
  }

  const token = loginRes.json('data.accessToken');
  return { token };
}
