/**
 * Staff Management Load Test (AC4)
 *
 * Simulates a Super Admin browsing paginated staff lists.
 * Authenticates once in setup(), shares token across VUs.
 * Threshold: p95 < 250ms (NFR1.1).
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { BASE_URL, API_PREFIX } from './config.js';
import { authHeaders } from './helpers/auth.js';
import { checkPreconditions } from './helpers/setup.js';

const staffListLatency = new Trend('staff_list_latency', true);
const staffErrors = new Rate('staff_errors');

export const options = {
  stages: [
    { duration: '5s', target: 2 },
    { duration: '15s', target: 5 },
    { duration: '10s', target: 5 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    staff_list_latency: ['p(95)<250'],
    staff_errors: ['rate<0.01'],
    http_req_duration: ['p(95)<250'],
  },
};

// Verify preconditions and authenticate once, share token with all VUs
export function setup() {
  const { token } = checkPreconditions();
  return { token };
}

export default function (data) {
  const params = authHeaders(data.token);

  group('Staff List - Page 1', () => {
    const res = http.get(
      `${BASE_URL}${API_PREFIX}/staff?page=1&limit=10`,
      params
    );

    const ok = check(res, {
      'staff list 200': (r) => r.status === 200,
    });

    staffListLatency.add(res.timings.duration);
    staffErrors.add(!ok);
  });

  sleep(0.5);

  group('Staff List - Page 2', () => {
    const res = http.get(
      `${BASE_URL}${API_PREFIX}/staff?page=2&limit=10`,
      params
    );

    const ok = check(res, {
      'staff list page 2 - 200': (r) => r.status === 200,
    });

    staffListLatency.add(res.timings.duration);
    staffErrors.add(!ok);
  });

  sleep(0.5);

  group('Staff List - Large Page', () => {
    const res = http.get(
      `${BASE_URL}${API_PREFIX}/staff?page=1&limit=50`,
      params
    );

    const ok = check(res, {
      'staff list large page - 200': (r) => r.status === 200,
    });

    staffListLatency.add(res.timings.duration);
    staffErrors.add(!ok);
  });

  sleep(1);
}
