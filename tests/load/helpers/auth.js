import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, API_PREFIX, STAFF_CREDENTIALS, PUBLIC_TEST_CREDENTIALS } from '../config.js';

/**
 * Authenticate as staff user and return access token.
 * CAPTCHA is skipped in development mode (NODE_ENV=development).
 *
 * @param {string} [email] - Override email (defaults to STAFF_CREDENTIALS)
 * @param {string} [password] - Override password (defaults to STAFF_CREDENTIALS)
 * @returns {string|null} JWT access token or null on failure
 */
export function staffLogin(email, password) {
  const url = `${BASE_URL}${API_PREFIX}/auth/staff/login`;
  const payload = JSON.stringify({
    email: email || STAFF_CREDENTIALS.email,
    password: password || STAFF_CREDENTIALS.password,
  });
  const params = { headers: { 'Content-Type': 'application/json' } };

  const res = http.post(url, payload, params);

  const success = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has accessToken': (r) => {
      try {
        return !!r.json('data.accessToken');
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    console.error(`Login failed: ${res.status} ${res.body}`);
    return null;
  }

  return res.json('data.accessToken');
}

/**
 * Build request params with Bearer auth header.
 */
export function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

/**
 * Authenticate as public user and return access token.
 *
 * @param {string} [email] - Override email (defaults to PUBLIC_TEST_CREDENTIALS)
 * @param {string} [password] - Override password (defaults to PUBLIC_TEST_CREDENTIALS)
 * @returns {string|null} JWT access token or null on failure
 */
export function publicLogin(email, password) {
  const url = `${BASE_URL}${API_PREFIX}/auth/public/login`;
  const payload = JSON.stringify({
    email: email || PUBLIC_TEST_CREDENTIALS.email,
    password: password || PUBLIC_TEST_CREDENTIALS.password,
  });
  const params = { headers: { 'Content-Type': 'application/json' } };

  const res = http.post(url, payload, params);

  const success = check(res, {
    'public login status 200': (r) => r.status === 200,
    'public login has accessToken': (r) => {
      try {
        return !!r.json('data.accessToken');
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    return null;
  }

  return res.json('data.accessToken');
}
