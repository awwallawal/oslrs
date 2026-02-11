# OSLRS Load Tests (k6)

Performance and load testing scripts for the OSLRS API using [k6](https://k6.io/).

## Prerequisites

### Install k6

k6 is a **standalone binary** (Go-based), NOT an npm package. Do not install via npm/pnpm.

**Windows:**

```bash
choco install k6
# or
winget install k6
```

**macOS:**

```bash
brew install k6
```

**Linux:**

```bash
sudo apt install k6
# or via snap: sudo snap install k6
# or download binary from https://github.com/grafana/k6/releases
```

**Docker:**

```bash
docker run -i grafana/k6 run - < tests/load/smoke.js
```

### Start the Development API

Load tests run against the local dev API (not production):

```bash
# Terminal 1: Start Docker services (PostgreSQL + Redis)
pnpm services:up

# Terminal 2: Seed dev data and start API
cd apps/api
pnpm db:seed:dev
pnpm dev
```

## Usage

### Quick Smoke Test (CI mode, ~15 seconds)

```bash
pnpm test:load
# or directly:
k6 run tests/load/smoke.js
```

### Full Load Test Suite

```bash
pnpm test:load:full
# Runs all load test scripts sequentially
```

### Individual Tests

```bash
# Health check baseline
k6 run tests/load/health-check.js

# Authentication endpoints
k6 run tests/load/auth-endpoints.js

# Staff management API
k6 run tests/load/staff-management.js

# Questionnaire API
k6 run tests/load/questionnaire-api.js

# Combined stress test (60s sustained load)
k6 run tests/load/combined-stress.js
```

### Custom Configuration

Override defaults via k6 environment variables:

```bash
# Custom API URL
k6 run -e BASE_URL=http://localhost:4000 tests/load/smoke.js

# Custom credentials
k6 run -e STAFF_EMAIL=admin@staging.local -e STAFF_PASS=secret tests/load/smoke.js
```

### JSON Output (for CI artifacts)

```bash
k6 run --out json=results.json tests/load/smoke.js
```

## Test Scripts

| Script | Purpose | Duration | VUs | Thresholds |
|--------|---------|----------|-----|------------|
| `smoke.js` | CI smoke test | 15s | 2 | p95 < 1s, errors < 10% |
| `health-check.js` | Health endpoint baseline | 30s | 1-10 | p95 < 50ms |
| `auth-endpoints.js` | Auth flow load test | 35s | 10+50 | p95 < 250ms |
| `staff-management.js` | Staff API (authenticated) | 35s | 2-5 | p95 < 250ms |
| `questionnaire-api.js` | Form schema fetches | 35s | 2-5 | p95 < 250ms |
| `combined-stress.js` | Multi-scenario stress | 60s | 10+30+50 | p95 < 500ms, errors < 1% |

## NFR Thresholds

| NFR | Target | Test Threshold |
|-----|--------|----------------|
| NFR1.1 | API < 250ms p95 | p95 < 250ms per endpoint |
| NFR2.1 | 132 field staff | 10 concurrent staff VUs |
| NFR2.5 | 1,000 public users | 50 concurrent registration VUs |
| Health | Fast baseline | p95 < 50ms |
| Stress | Combined load | p95 < 500ms, errors < 1% |

## Rate Limiting Notes

Express rate limits are **active in development mode** (`NODE_ENV=development`):

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/staff/login` | 5 requests | 15 min per IP |
| `POST /auth/public/register` | 5 requests | 15 min per IP |
| `POST /auth/refresh` | 10 requests | 1 min per IP |

**Impact on load tests:**

- Auth and registration tests will see **429 Too Many Requests** after the initial burst
- Rate-limited responses are tracked separately (`rate_limited_requests` counter)
- Staff management and questionnaire tests use a single pre-authenticated token (no rate limit impact)
- Health check has no rate limiting

**To measure pure API latency** (without rate limits), run the API with `NODE_ENV=test`. This skips all Express rate limiters.

## Test Data Cleanup

Registration-heavy tests (`auth-endpoints.js`, `combined-stress.js`, `smoke.js`) create real user records in the database. After multiple runs, test data accumulates.

**Recommended cleanup between runs:**

```bash
# Re-seed the database (drops and recreates all data)
cd apps/api && pnpm db:seed:dev

# Flush Redis rate limit keys
docker exec oslsr_redis redis-cli EVAL "local keys = redis.call('keys', 'rl:*') for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0
```

**Note:** If you only need to clear rate limits (not test users), the Redis flush command alone is sufficient.

## File Structure

```
tests/load/
├── README.md              # This file
├── config.js              # Shared config (base URL, thresholds, credentials)
├── helpers/
│   ├── auth.js            # Login helper, token management
│   ├── nin.js             # NIN generation (Modulus 11)
│   └── setup.js           # Precondition checks
├── health-check.js        # AC2: Health endpoint baseline
├── auth-endpoints.js      # AC3: Auth flow load test
├── staff-management.js    # AC4: Staff API load test
├── questionnaire-api.js   # AC5: Form schema load test
├── combined-stress.js     # AC6: Multi-scenario stress test
└── smoke.js               # AC8: CI smoke test (fast)
```
