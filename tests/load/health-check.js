/**
 * Health Check Baseline Load Test (AC2)
 *
 * Establishes latency baseline for GET /health under zero contention.
 * Ramp: 1 → 10 → 10 → 1 VUs over 30 seconds.
 * Threshold: p95 < 50ms (health check should be fast).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { BASE_URL } from './config.js';

const healthLatency = new Trend('health_latency', true);
const healthErrors = new Rate('health_errors');

export const options = {
  stages: [
    { duration: '5s', target: 1 },
    { duration: '10s', target: 10 },
    { duration: '10s', target: 10 },
    { duration: '5s', target: 1 },
  ],
  thresholds: {
    health_latency: ['p(95)<50'],
    health_errors: ['rate<0.001'],
    http_req_duration: ['p(95)<50'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/health`);

  const passed = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has status ok': (r) => {
      try {
        return r.json('status') === 'ok';
      } catch {
        return false;
      }
    },
  });

  healthLatency.add(res.timings.duration);
  healthErrors.add(!passed);

  sleep(0.5);
}
