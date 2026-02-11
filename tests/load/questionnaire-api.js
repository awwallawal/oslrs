/**
 * Questionnaire API Load Test (AC5)
 *
 * Simulates concurrent form schema fetches (preparation for Epic 3 form renderer load).
 * Authenticates once in setup(), discovers available questionnaire IDs.
 * Threshold: p95 < 250ms (NFR1.1).
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { BASE_URL, API_PREFIX } from './config.js';
import { authHeaders } from './helpers/auth.js';
import { checkPreconditions } from './helpers/setup.js';

const questionnaireListLatency = new Trend('questionnaire_list_latency', true);
const schemaFetchLatency = new Trend('schema_fetch_latency', true);
const questionnaireErrors = new Rate('questionnaire_errors');

export const options = {
  stages: [
    { duration: '5s', target: 2 },
    { duration: '15s', target: 5 },
    { duration: '10s', target: 5 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    questionnaire_list_latency: ['p(95)<250'],
    schema_fetch_latency: ['p(95)<250'],
    questionnaire_errors: ['rate<0.01'],
    http_req_duration: ['p(95)<250'],
  },
};

export function setup() {
  const { token } = checkPreconditions();

  // Discover questionnaire IDs from list endpoint
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
      // No questionnaires available — schema fetch tests will be skipped
    }
  }

  if (questionnaireIds.length === 0) {
    console.warn(
      'No questionnaires found in database. Schema fetch tests will be skipped. ' +
        'Run `pnpm db:seed:dev` to seed questionnaire data.'
    );
  }

  return { token, questionnaireIds };
}

export default function (data) {
  const params = authHeaders(data.token);

  group('List Questionnaires', () => {
    const res = http.get(
      `${BASE_URL}${API_PREFIX}/questionnaires`,
      params
    );

    const ok = check(res, {
      'questionnaire list 200': (r) => r.status === 200,
    });

    questionnaireListLatency.add(res.timings.duration);
    questionnaireErrors.add(!ok);
  });

  sleep(0.5);

  // Fetch schema for a known questionnaire if available
  if (data.questionnaireIds && data.questionnaireIds.length > 0) {
    group('Fetch Form Schema', () => {
      const idx = __ITER % data.questionnaireIds.length;
      const id = data.questionnaireIds[idx];

      const res = http.get(
        `${BASE_URL}${API_PREFIX}/questionnaires/${id}/schema`,
        params
      );

      const ok = check(res, {
        'schema fetch 200': (r) => r.status === 200,
      });

      schemaFetchLatency.add(res.timings.duration);
      questionnaireErrors.add(!ok);
    });
  }

  sleep(1);
}
