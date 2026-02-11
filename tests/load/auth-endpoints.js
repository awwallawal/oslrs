/**
 * Authentication Load Test (AC3)
 *
 * Tests auth endpoints under load:
 *  - 10 concurrent staff logins (pilot: ~132 staff, staggered)
 *  - 50 concurrent public registrations (stress toward NFR2.5)
 *  - Token refresh cycle under load
 *
 * Threshold: p95 < 250ms (NFR1.1).
 *
 * NOTE: Express rate limits are active in development mode.
 *  - Staff login: 5/15min per IP → most VU logins will get 429 after initial burst
 *  - Registration: 5/15min per IP → most VU registrations will get 429
 *  Rate-limited responses (429) are tracked separately and excluded from error rate.
 *  To measure pure latency without rate limits, run against NODE_ENV=test.
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, API_PREFIX, STAFF_CREDENTIALS, PUBLIC_TEST_CREDENTIALS } from './config.js';
import {
  generateValidNin,
  generateUniqueEmail,
  generatePhone,
} from './helpers/nin.js';

// Custom metrics
const staffLoginLatency = new Trend('staff_login_latency', true);
const publicRegLatency = new Trend('public_registration_latency', true);
const refreshLatency = new Trend('refresh_latency', true);
const publicLoginLatency = new Trend('public_login_latency', true);
const authErrors = new Rate('auth_errors');
const rateLimited = new Counter('rate_limited_requests');

export const options = {
  scenarios: {
    staff_login: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 5 },
        { duration: '15s', target: 10 },
        { duration: '10s', target: 10 },
        { duration: '5s', target: 0 },
      ],
      exec: 'staffLoginFlow',
    },
    public_registration: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 10 },
        { duration: '15s', target: 50 },
        { duration: '10s', target: 50 },
        { duration: '5s', target: 0 },
      ],
      exec: 'publicRegistrationFlow',
    },
    public_login: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 5 },
        { duration: '15s', target: 10 },
        { duration: '10s', target: 10 },
        { duration: '5s', target: 0 },
      ],
      exec: 'publicLoginFlow',
    },
  },
  thresholds: {
    staff_login_latency: ['p(95)<250'],
    public_login_latency: ['p(95)<250'],
    public_registration_latency: ['p(95)<250'],
    refresh_latency: ['p(95)<250'],
    auth_errors: ['rate<0.05'], // 5% tolerance (rate limits cause expected failures)
    http_req_duration: ['p(95)<250'],
  },
};

// Register a public test user for login testing (runs once before all scenarios)
export function setup() {
  const nin = generateValidNin();
  const res = http.post(
    `${BASE_URL}${API_PREFIX}/auth/public/register`,
    JSON.stringify({
      fullName: PUBLIC_TEST_CREDENTIALS.fullName,
      email: PUBLIC_TEST_CREDENTIALS.email,
      phone: '+2340000000001',
      nin,
      password: PUBLIC_TEST_CREDENTIALS.password,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  // 201 = new user, 409/400 = already exists from previous run — both OK
  if (res.status !== 201 && res.status !== 409 && res.status !== 400 && res.status !== 429) {
    console.warn(`Public test user registration: ${res.status} ${res.body}`);
  }

  return {
    publicEmail: PUBLIC_TEST_CREDENTIALS.email,
    publicPassword: PUBLIC_TEST_CREDENTIALS.password,
  };
}

// Staff login + token refresh flow
export function staffLoginFlow() {
  group('Staff Login', () => {
    const loginRes = http.post(
      `${BASE_URL}${API_PREFIX}/auth/staff/login`,
      JSON.stringify({
        email: STAFF_CREDENTIALS.email,
        password: STAFF_CREDENTIALS.password,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (loginRes.status === 429) {
      rateLimited.add(1);
      sleep(2);
      return;
    }

    const loginOk = check(loginRes, {
      'staff login 200': (r) => r.status === 200,
      'staff login has token': (r) => {
        try {
          return !!r.json('data.accessToken');
        } catch {
          return false;
        }
      },
    });

    staffLoginLatency.add(loginRes.timings.duration);
    authErrors.add(!loginOk);

    if (loginOk) {
      sleep(1);

      // Token refresh (uses cookie set by login)
      group('Token Refresh', () => {
        const refreshRes = http.post(
          `${BASE_URL}${API_PREFIX}/auth/refresh`,
          null,
          { headers: { 'Content-Type': 'application/json' } }
        );

        if (refreshRes.status === 429) {
          rateLimited.add(1);
          return;
        }

        const refreshOk = check(refreshRes, {
          'refresh 200': (r) => r.status === 200,
        });

        refreshLatency.add(refreshRes.timings.duration);
        authErrors.add(!refreshOk);
      });
    }
  });

  sleep(1);
}

// Public user registration flow
export function publicRegistrationFlow() {
  group('Public Registration', () => {
    const nin = generateValidNin();
    const email = generateUniqueEmail(__VU, __ITER);
    const phone = generatePhone();

    const regRes = http.post(
      `${BASE_URL}${API_PREFIX}/auth/public/register`,
      JSON.stringify({
        fullName: `Load Test User ${__VU}-${__ITER}`,
        email,
        phone,
        nin,
        password: 'LoadTest123!',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (regRes.status === 429) {
      rateLimited.add(1);
      sleep(2);
      return;
    }

    const regOk = check(regRes, {
      'registration 201': (r) => r.status === 201,
    });

    publicRegLatency.add(regRes.timings.duration);
    authErrors.add(!regOk);
  });

  sleep(1);
}

// Public user login flow
export function publicLoginFlow(data) {
  group('Public Login', () => {
    const loginRes = http.post(
      `${BASE_URL}${API_PREFIX}/auth/public/login`,
      JSON.stringify({
        email: data.publicEmail,
        password: data.publicPassword,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (loginRes.status === 429) {
      rateLimited.add(1);
      sleep(2);
      return;
    }

    // 200 = success, 403 = email unverified (expected in dev without email verification)
    const ok = check(loginRes, {
      'public login 200 or 403': (r) => r.status === 200 || r.status === 403,
    });

    publicLoginLatency.add(loginRes.timings.duration);
    authErrors.add(!ok);
  });

  sleep(1);
}
