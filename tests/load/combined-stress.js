/**
 * Combined Stress Scenario (AC6)
 *
 * Simulates realistic concurrent usage across all endpoint categories:
 *  - 10 staff login/refresh cycles
 *  - 30 concurrent API requests (staff list, questionnaire fetch)
 *  - 50 public registration attempts
 *
 * 10s ramp-up → 60s sustained → 10s ramp-down.
 * Thresholds: p95 < 500ms (2x NFR1.1), error rate < 1%.
 *
 * NOTE: Express rate limits are active in development mode.
 *  Rate-limited (429) responses are tracked separately.
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, API_PREFIX, STAFF_CREDENTIALS } from './config.js';
import { staffLogin, authHeaders } from './helpers/auth.js';
import {
  generateValidNin,
  generateUniqueEmail,
  generatePhone,
} from './helpers/nin.js';

// Custom metrics
const stressLatency = new Trend('stress_latency', true);
const stressErrors = new Rate('stress_errors');
const totalRequests = new Counter('total_requests');
const rateLimited = new Counter('rate_limited_requests');

export const options = {
  scenarios: {
    staff_login: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '60s', target: 10 },
        { duration: '10s', target: 0 },
      ],
      exec: 'staffLoginRefresh',
    },
    api_browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 30 },
        { duration: '60s', target: 30 },
        { duration: '10s', target: 0 },
      ],
      exec: 'apiBrowse',
    },
    public_registration: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '10s', target: 0 },
      ],
      exec: 'publicRegistration',
    },
  },
  thresholds: {
    stress_latency: ['p(95)<500'],
    stress_errors: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

// Shared setup: get auth token for API browse scenario
export function setup() {
  const token = staffLogin();
  if (!token) {
    throw new Error('Setup failed: cannot authenticate as Super Admin');
  }

  // Discover questionnaire IDs
  const params = authHeaders(token);
  const listRes = http.get(`${BASE_URL}${API_PREFIX}/questionnaires`, params);
  let questionnaireIds = [];
  if (listRes.status === 200) {
    try {
      const data = listRes.json('data');
      if (Array.isArray(data)) {
        questionnaireIds = data.map((q) => q.id).filter(Boolean);
      }
    } catch {
      /* no questionnaires */
    }
  }

  return { token, questionnaireIds };
}

// Scenario 1: Staff login + refresh cycles (10 VUs)
export function staffLoginRefresh() {
  const loginRes = http.post(
    `${BASE_URL}${API_PREFIX}/auth/staff/login`,
    JSON.stringify({
      email: STAFF_CREDENTIALS.email,
      password: STAFF_CREDENTIALS.password,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  totalRequests.add(1);

  if (loginRes.status === 429) {
    rateLimited.add(1);
    sleep(3);
    return;
  }

  const ok = check(loginRes, {
    'stress: staff login 200': (r) => r.status === 200,
  });

  stressLatency.add(loginRes.timings.duration);
  stressErrors.add(!ok);

  if (ok) {
    sleep(1);

    const refreshRes = http.post(
      `${BASE_URL}${API_PREFIX}/auth/refresh`,
      null,
      { headers: { 'Content-Type': 'application/json' } }
    );

    totalRequests.add(1);

    if (refreshRes.status === 429) {
      rateLimited.add(1);
    } else {
      stressLatency.add(refreshRes.timings.duration);
      stressErrors.add(refreshRes.status !== 200);
    }
  }

  sleep(2);
}

// Scenario 2: API browsing — staff list + questionnaire fetches (30 VUs)
export function apiBrowse(data) {
  const params = authHeaders(data.token);

  // Browse staff list
  const page = (__ITER % 5) + 1;
  const staffRes = http.get(
    `${BASE_URL}${API_PREFIX}/staff?page=${page}&limit=10`,
    params
  );

  stressLatency.add(staffRes.timings.duration);
  stressErrors.add(staffRes.status !== 200);
  totalRequests.add(1);

  sleep(0.5);

  // Browse questionnaires
  const qRes = http.get(
    `${BASE_URL}${API_PREFIX}/questionnaires`,
    params
  );

  stressLatency.add(qRes.timings.duration);
  stressErrors.add(qRes.status !== 200);
  totalRequests.add(1);

  // Fetch schema if available
  if (data.questionnaireIds && data.questionnaireIds.length > 0) {
    sleep(0.5);
    const idx = __ITER % data.questionnaireIds.length;
    const schemaRes = http.get(
      `${BASE_URL}${API_PREFIX}/questionnaires/${data.questionnaireIds[idx]}/schema`,
      params
    );

    stressLatency.add(schemaRes.timings.duration);
    stressErrors.add(schemaRes.status !== 200);
    totalRequests.add(1);
  }

  sleep(1);
}

// Scenario 3: Public registration attempts (50 VUs)
export function publicRegistration() {
  const nin = generateValidNin();
  const email = generateUniqueEmail(__VU, __ITER);
  const phone = generatePhone();

  const res = http.post(
    `${BASE_URL}${API_PREFIX}/auth/public/register`,
    JSON.stringify({
      fullName: `Stress User ${__VU}-${__ITER}`,
      email,
      phone,
      nin,
      password: 'StressTest123!',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  totalRequests.add(1);

  if (res.status === 429) {
    rateLimited.add(1);
    sleep(2);
    return;
  }

  const ok = check(res, {
    'stress: registration 201': (r) => r.status === 201,
  });

  stressLatency.add(res.timings.duration);
  stressErrors.add(!ok);

  sleep(1);
}
