/**
 * CI Smoke Test (AC8)
 *
 * Quick (< 30 second) subset of tests with 1-2 VUs.
 * Validates that endpoints respond correctly within loose thresholds.
 * Designed to be added to CI pipeline for regression detection.
 *
 * Run: pnpm test:load  (or: k6 run tests/load/smoke.js)
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';
import { BASE_URL, API_PREFIX, STAFF_CREDENTIALS, PUBLIC_TEST_CREDENTIALS } from './config.js';
import { authHeaders } from './helpers/auth.js';
import {
  generateValidNin,
  generateUniqueEmail,
  generatePhone,
} from './helpers/nin.js';

const smokeErrors = new Rate('smoke_errors');

export const options = {
  vus: 2,
  duration: '15s',
  thresholds: {
    http_req_duration: ['p(95)<1000'], // Loose: < 1s (smoke only)
    smoke_errors: ['rate<0.1'],         // < 10% error rate (loose)
    checks: ['rate>0.8'],               // > 80% checks pass
  },
};

export default function () {
  // 1. Health check
  group('Health', () => {
    const res = http.get(`${BASE_URL}/health`);
    const ok = check(res, {
      'smoke: health 200': (r) => r.status === 200,
    });
    smokeErrors.add(!ok);
  });

  sleep(0.5);

  // 2. Staff login
  let token = null;
  group('Staff Login', () => {
    const res = http.post(
      `${BASE_URL}${API_PREFIX}/auth/staff/login`,
      JSON.stringify({
        email: STAFF_CREDENTIALS.email,
        password: STAFF_CREDENTIALS.password,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    // Accept 200 (success) or 429 (rate limited) as valid smoke responses
    const ok = check(res, {
      'smoke: login responded': (r) => r.status === 200 || r.status === 429,
    });
    smokeErrors.add(!ok);

    if (res.status === 200) {
      try {
        token = res.json('data.accessToken');
      } catch {
        /* ignore */
      }
    }
  });

  sleep(0.5);

  // 3. Authenticated endpoints (if login succeeded)
  if (token) {
    const params = authHeaders(token);

    group('Staff List', () => {
      const res = http.get(
        `${BASE_URL}${API_PREFIX}/staff?page=1&limit=5`,
        params
      );
      const ok = check(res, {
        'smoke: staff list 200': (r) => r.status === 200,
      });
      smokeErrors.add(!ok);
    });

    sleep(0.5);

    group('Questionnaire List', () => {
      const res = http.get(
        `${BASE_URL}${API_PREFIX}/questionnaires`,
        params
      );
      const ok = check(res, {
        'smoke: questionnaire list 200': (r) => r.status === 200,
      });
      smokeErrors.add(!ok);
    });

    sleep(0.5);

    // Token refresh (uses cookie set by login)
    group('Token Refresh', () => {
      const res = http.post(
        `${BASE_URL}${API_PREFIX}/auth/refresh`,
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );

      // Refresh may fail if cookie wasn't set; accept non-5xx as ok for smoke
      check(res, {
        'smoke: refresh responded': (r) => r.status < 500,
      });
    });
  }

  sleep(0.5);

  // 4. Public registration (unique data each iteration)
  group('Public Registration', () => {
    const res = http.post(
      `${BASE_URL}${API_PREFIX}/auth/public/register`,
      JSON.stringify({
        fullName: `Smoke Test ${__VU}-${__ITER}`,
        email: generateUniqueEmail(__VU, __ITER),
        phone: generatePhone(),
        nin: generateValidNin(),
        password: 'SmokeTest123!',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    // Accept 201 (created) or 429 (rate limited) as valid smoke responses
    const ok = check(res, {
      'smoke: registration responded': (r) =>
        r.status === 201 || r.status === 429,
    });
    smokeErrors.add(!ok);
  });

  sleep(0.5);

  // 5. Public login (exercises POST /auth/public/login)
  group('Public Login', () => {
    const res = http.post(
      `${BASE_URL}${API_PREFIX}/auth/public/login`,
      JSON.stringify({
        email: PUBLIC_TEST_CREDENTIALS.email,
        password: PUBLIC_TEST_CREDENTIALS.password,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    // Accept 200 (success), 401 (no user), 403 (unverified), 429 (rate limited)
    const ok = check(res, {
      'smoke: public login responded': (r) =>
        r.status === 200 || r.status === 401 || r.status === 403 || r.status === 429,
    });
    smokeErrors.add(!ok);
  });

  sleep(1);
}
