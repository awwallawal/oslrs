# E2E Tests — OSLSR

End-to-end tests using [Playwright](https://playwright.dev/) for the OSLSR web application.

## Test Projects

| Project | File | Dependencies | Purpose |
|---------|------|-------------|---------|
| `smoke` | `smoke.spec.ts` | None | Basic page load and navigation (no backend needed) |
| `auth-setup` | `auth.setup.ts` | None | Creates storage state for 7 application roles |
| `golden-path` | `golden-path.spec.ts` | `auth-setup` | Full data flow: form creation → filling → submission → dashboard |

## Running Tests

```bash
# Run all E2E tests (smoke + golden-path stubs)
pnpm test:e2e

# Run specific project
pnpm exec playwright test --project=smoke
pnpm exec playwright test --project=golden-path

# Run headed (see browser)
pnpm exec playwright test --headed

# Run with Playwright UI
pnpm exec playwright test --ui

# Generate code with codegen
pnpm exec playwright codegen http://localhost:5173

# View HTML report
pnpm exec playwright show-report
```

## Test Selector Rules (Team Agreement A3)

**NEVER** use CSS classes, Tailwind utilities, `data-slot`, or internal attributes.

Use in this order of preference:
1. `page.getByRole('button', { name: 'Publish' })` — semantic roles
2. `page.getByLabel('Email')` — form fields
3. `page.getByText('Form published successfully')` — visible text
4. `page.getByTestId('form-builder-canvas')` — only when above insufficient

---

## Full-Stack CI Job Specification

### Required Services

The golden path tests require the full application stack:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| PostgreSQL | `postgres:15-alpine` | 5432 | Application database |
| Redis | `redis:7-alpine` | 6379 | Session store, BullMQ job queue |
| API Server | N/A (built from source) | 3000 | Express backend |
| Web Dev Server | N/A (Vite) | 5173 | React frontend |

### Seed Data Setup

Before running golden path tests, the database must be seeded:

```bash
# Push schema to database
pnpm --filter @oslsr/api db:push

# Seed development data (7 test users, sample forms)
pnpm db:seed:dev
```

### GitHub Actions CI Job Skeleton

The following job definition should **replace** the current `test-e2e` job in `.github/workflows/ci-cd.yml` once golden path tests GP-1 through GP-5 all pass green:

```yaml
  # ============================================
  # Job 5: E2E Tests (Playwright — Full Stack)
  # ============================================
  test-e2e:
    name: E2E Tests
    needs: [lint-and-build]
    runs-on: ubuntu-latest
    # REMOVE continue-on-error once GP-1 through GP-5 pass green (Phase 5)
    continue-on-error: true
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgres://test_user:test_password@localhost:5432/test_db
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-jwt-secret-for-ci
      REFRESH_TOKEN_SECRET: test-refresh-token-secret-for-ci
      PUBLIC_APP_URL: http://localhost:5173
      NODE_ENV: test
      CI: true

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm exec playwright install chromium --with-deps

      - name: Setup database schema
        run: pnpm --filter @oslsr/api db:push

      - name: Seed test data
        run: pnpm db:seed:dev

      - name: Start API server
        run: pnpm --filter @oslsr/api dev &
        env:
          PORT: 3000

      - name: Wait for API to be ready
        run: |
          for i in $(seq 1 30); do
            curl -sf http://localhost:3000/api/v1/health && break
            echo "Waiting for API... ($i/30)"
            sleep 2
          done

      - name: Run E2E tests
        run: pnpm test:e2e

      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/web/playwright-report/
          retention-days: 30

      - name: Upload test results
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: e2e-test-results
          path: apps/web/test-results/
          retention-days: 30

      - name: Upload API logs on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: api-logs
          path: apps/api/logs/
          retention-days: 7
```

### Exit Criterion: Remove `continue-on-error`

The `continue-on-error: true` flag on the `test-e2e` job should be removed when **all** of the following are true:

1. GP-1 (Admin creates & publishes form) passes green
2. GP-2 through GP-5 are enabled and pass green
3. The full-stack CI job (with postgres + redis services) runs successfully
4. No flaky failures observed over 5+ consecutive CI runs

At that point, E2E tests become **blocking** in the CI pipeline per ADR-014 (Ironclad Pipeline, Layer 1).

### Artifact Collection

On every E2E run (success or failure), CI collects:

| Artifact | Path | Retention | Content |
|----------|------|-----------|---------|
| `playwright-report` | `apps/web/playwright-report/` | 30 days | HTML report with screenshots, traces |
| `e2e-test-results` | `apps/web/test-results/` | 30 days | Raw test results, failure screenshots |
| `api-logs` | `apps/api/logs/` | 7 days | API server logs (failure only) |

---

## Test Data Seed Requirements

The golden path tests require specific database state provided by `pnpm db:seed:dev`.

### Published Form Requirement

At least 1 native form with:
- Status: `published`
- 2+ sections (e.g., "Personal Information", "Skills Assessment")
- 5+ questions including:
  - `text` type (name, address, etc.)
  - `number` type (age, years of experience)
  - `select_one` type with skip logic (e.g., "Are you employed?" → skips employment details if "No")
  - `select_multiple` type (skills selection)
- Choice lists for select questions
- `is_native: true` flag

### User Accounts

All 7 application roles must have seeded accounts with known credentials:

| Role | Email | Password | Requirements |
|------|-------|----------|--------------|
| Super Admin | `admin@dev.local` | `admin123` | Can create/publish forms |
| Supervisor | `supervisor@dev.local` | `super123` | Assigned to valid LGA, manages enumerators |
| Enumerator | `enumerator@dev.local` | `enum123` | Assigned to valid LGA, can fill forms |
| Data Entry Clerk | `clerk@dev.local` | `clerk123` | Keyboard-optimized form filling |
| Verification Assessor | `assessor@dev.local` | `assess123` | Audits flagged submissions |
| Government Official | `official@dev.local` | `official123` | Read-only dashboard access |
| Public User | `public@dev.local` | `public123` | Uses `/auth/public/login` (NOT staff login) |

All seed users have `is_seeded: true` flag. Generated by `pnpm db:seed:dev`.

### LGA Assignments

- Enumerator and Supervisor must be assigned to the **same valid LGA**
- This enables GP-8 (supervisor sees enumerator's submissions)

### Flagged Submission Requirement (GP-10 — FUTURE)

Blocked until Story 4.3 adds fraud engine columns to the `submissions` table:
- At least 1 submission with `fraud_score` > threshold
- `fraud_flags` JSONB array with triggered rules
- `verification_status` = `pending` (awaiting assessor review)

### Database Assertion Targets

After **GP-1** (form creation), verify in `questionnaire_forms`:
```
questionnaire_forms.title       = test form title
questionnaire_forms.status      = 'published'
questionnaire_forms.is_native   = true
questionnaire_forms.form_schema = JSONB with sections + questions
```

After **GP-5** (submission ingestion), verify in `submissions`:
```
submissions.submission_uid  = client-generated UUIDv7
submissions.questionnaire_form_id = published form's questionnaire_forms.id
submissions.submitter_id   = enumerator's user.id
submissions.raw_data       = JSONB with filled responses
submissions.source         = 'webapp'
submissions.processed      = true (after BullMQ job completes)
```

After **GP-10** (assessor review — FUTURE), verify in `submissions`:
```
submissions.fraud_score         = numeric score from fraud engine
submissions.fraud_flags         = JSONB array of triggered rules
submissions.verification_status = 'verified' or 'rejected'
```

**GP-11** (official read-only) — no DB mutations expected:
```
GET  /api/v1/dashboard/official/*  → 200 with real data
POST /api/v1/submissions/*         → 403 Forbidden
PUT  /api/v1/questionnaires/*      → 403 Forbidden
```

### Cleanup Strategy

Tests must NOT leave permanent state. Options:
1. **Test-specific markers:** Use unique prefixes (e.g., `[E2E-GP1]` in form title) to identify and clean up test data
2. **Transaction rollback:** Wrap test setup/teardown in database transactions (requires API support)
3. **Dedicated test database:** CI uses a separate database (`test_db`) that is recreated on each run

Current approach: CI uses a fresh `test_db` database seeded on each run, so cleanup is implicit.

---

## Progressive Enablement Strategy

Golden path tests are enabled progressively as Epic 3+ stories are completed. Each stub starts as `test.fixme()` and is converted to an active `test()` when its dependencies are met.

### Phased Rollout

| Phase | Enable Tests | After Story | CI Behavior |
|-------|-------------|-------------|-------------|
| Phase 0 (current) | Smoke tests only | prep-4 (done) | `continue-on-error: true` |
| Phase 1 | GP-1 (admin form) | Story 2.10 (done) | GP-1 flipped from `fixme` to active |
| Phase 2 | GP-2, GP-3, GP-4 | Story 3.1 + prep-8 | Auth setup enabled, form renderer tests active |
| Phase 3 | GP-5, GP-6 | Story 3.4 + 3.2/3.3 | Full-stack CI services added (postgres + redis) |
| Phase 4 | GP-7, GP-8 | Story 3.6 + 4.1 | All core golden path tests active |
| Phase 5 | Remove `continue-on-error` | GP-1 through GP-5 green | E2E becomes **blocking** in CI |
| Phase 6 | GP-9 (public user) | Story 3.1 + test email infrastructure | Public self-registration proven. Requires Mailhog/Mailpit or test-only API for magic link capture |
| Phase 7 | GP-10 (assessor) | Story 4.3 + Epic 5 | Quality assurance pipeline proven. Requires `fraud_score`/`fraud_flags`/`verification_status` columns |
| Phase 8 | GP-11 (official) | Epic 5 | Read-only RBAC enforcement proven. Test verifies data visible AND mutations return 403 |

### How to Enable a Test

1. Find the `test.fixme(...)` stub in `golden-path.spec.ts`
2. Change `test.fixme(...)` to `test(...)`
3. Implement the test steps following the JSDoc description
4. If the test requires auth, enable the corresponding `setup.skip()` in `auth.setup.ts` by changing it to `setup()`
5. Run locally: `pnpm exec playwright test --project=golden-path`
6. Verify no regressions: `pnpm test:e2e`

### Auth Setup Enablement

When enabling golden-path tests that require authentication:

1. Enable the required role's `setup.skip()` → `setup()` in `auth.setup.ts`
2. Update `playwright.config.ts` if a test needs a different role's storage state (golden-path defaults to enumerator)
3. For multi-role tests (GP-8, GP-11), use `test.use({ storageState: ... })` within the test

### Rate Limit Warning

The dev server does **NOT** set `NODE_ENV=test`, so login rate limits are active. Auth setups run sequentially to avoid triggering rate limits. If tests fail with 429 errors, add delays between auth setup blocks.
