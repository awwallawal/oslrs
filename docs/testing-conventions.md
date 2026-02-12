# Testing Conventions & Known Quirks

This document captures testing patterns, gotchas, and conventions specific to this project. Read this before writing new tests — especially integration tests.

## Test Runner Configuration

- **Framework**: Vitest v4 with thread pool (`pool: 'threads'`)
- **Base config**: `vitest.base.ts` (shared across all packages)
- **API config**: `apps/api/vitest.config.ts` (node environment, extended timeouts)
- **Web config**: `apps/web/vitest.config.ts` (jsdom environment)
- **Run tests**: `pnpm test` (turbo routes to each package)

## Timeout Configuration

### hookTimeout Must Match testTimeout

**Gotcha**: Vitest's `hookTimeout` (for `beforeAll`/`afterAll`) defaults to 10000ms **independently** of `testTimeout`. If you increase `testTimeout` but forget `hookTimeout`, your `beforeAll` hooks will still time out at 10s.

```typescript
// apps/api/vitest.config.ts — CORRECT
test: {
  testTimeout: 15000,
  hookTimeout: 15000,  // Must be set explicitly!
}
```

**Why this matters**: Our API integration tests do CPU-intensive work in `beforeAll` (bcrypt hashing with 12 salt rounds, database inserts, Redis operations). Under parallel thread pool load with 28+ test files competing for resources, these hooks regularly exceed 10s.

### Per-Test Timeout Override

For individual tests that need more time, use the third argument:

```typescript
it('long running test', async () => { ... }, 30000);
```

## Test Categories

Tests are organized by pattern, not separate configs:

| Location | Type | Uses Real DB? | Example |
|----------|------|---------------|---------|
| `controllers/__tests__/` | Unit | No (mocked via `vi.mock`) | `form.controller.test.ts` |
| `services/__tests__/` | Mixed | Some do, some don't | See below |
| `src/__tests__/` | Integration/E2E | Yes (supertest + real app) | `auth.login.test.ts` |

### Filtering by Category

```bash
pnpm --filter @oslsr/api test -- --run --test-name-pattern='GoldenPath'
pnpm --filter @oslsr/api test -- --run --test-name-pattern='Security'
```

Available patterns: `GoldenPath`, `Security`, `Contract`, `UI`, `Performance`

## Integration Test Patterns

### Skipping Tests When External Services Are Unavailable

Use `it.skipIf()` or `describe.skipIf()` when tests require optional external services:

```typescript
// Pattern from auth.activation.test.ts
const hasS3Config = !!(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);

it.skipIf(!hasS3Config)('should upload to S3...', async () => {
  // Only runs when S3 credentials are configured
});
```

### Database Integration Tests

Tests that directly import `db` from `../../db/index.js` (without `vi.mock`) hit the real database. These require:

1. **PostgreSQL running** with `DATABASE_URL` set in `.env`
2. **Cleanup in `afterAll`** — always delete test data you created
3. **Unique identifiers** — use `Date.now()`, `randomInt`, or `uuidv7()` to avoid collisions across parallel threads

```typescript
// Good: unique test data with cleanup
const testUsers: string[] = [];

afterAll(async () => {
  if (testUsers.length > 0) {
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, testUsers));
    await db.delete(users).where(inArray(users.id, testUsers));
  }
});
```

### Redis-Dependent Tests

Tests using Redis (e.g., `registration.service.test.ts`) need `REDIS_URL` or a local Redis on port 6379. Always clean up Redis keys in `afterAll`.

## CPU-Intensive Operations in Hooks

**Rule**: Never assume `beforeAll` is fast. Under parallel load:

- `bcrypt.hash()` with 12 salt rounds: 200-500ms per call (can spike to 2s+ under load)
- Database inserts with foreign key lookups: 50-200ms each
- Multiple such operations chain up quickly

If your `beforeAll` does heavy work, ensure the `hookTimeout` in the vitest config covers it. If you need a per-suite override:

```typescript
beforeAll(async () => {
  // heavy setup
}, 20000); // explicit timeout for this hook
```

## Thread Pool Implications

With `pool: 'threads'`, all test files run in parallel worker threads sharing:

- **CPU** — bcrypt, crypto operations compete for cores
- **Database connections** — `pg.Pool` connections are per-thread
- **Network** — Redis, S3, external APIs share bandwidth

This means tests that pass in isolation may timeout under full parallel load. Always test with `pnpm test` (full suite), not just individual files.

## Mock Patterns

### Service Mocking (Controllers)

```typescript
vi.mock('../../services/native-form.service.js');

// Then in tests:
vi.mocked(NativeFormService.listPublished).mockResolvedValue(mockForms);
```

### Hoisted Mocks (Hooks)

When mock functions are referenced inside `vi.mock()` factory:

```typescript
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn(),
}));

vi.mock('../../lib/some-module', () => ({
  someExport: mockFn,
}));
```

### Web Component Test Setup

Always include jest-dom matchers:

```typescript
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);
```

Components using `useNavigate()` need a `<MemoryRouter>` wrapper in tests.

## Running Tests

```bash
# Full suite (recommended before commits)
pnpm test

# Single API test file
pnpm vitest run apps/api/src/path/to/test.ts

# Web tests (MUST use --filter, never run vitest from root for web)
pnpm --filter @oslsr/web test -- --run
pnpm --filter @oslsr/web test -- --run src/features/forms

# Specific web test file
pnpm --filter @oslsr/web test -- --run src/path/to/test.tsx
```

**Warning**: Never run `pnpm vitest run` from the monorepo root for web tests — it picks up the wrong config. Always use `pnpm --filter @oslsr/web test`.
