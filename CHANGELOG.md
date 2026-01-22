# Changelog

All notable changes to the OSLSR project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-22

### Added

#### Database Seeding System (ADR-017)
- Implemented hybrid dev/prod seeding strategy
- Added `pnpm db:seed:dev` for development with 7 test users
- Added `pnpm db:seed --admin-from-env` for production
- Added `pnpm db:seed:clean` for selective data removal
- Added `is_seeded` flag to users, roles, and lgas tables for cleanup
- Seeded 33 Oyo State LGAs and 7 user roles

#### Infrastructure Deployment
- Deployed to DigitalOcean (2 droplets architecture)
- OSLSR App: https://oyotradeministry.com.ng
- ODK Central: https://odkcentral.oyotradeministry.com.ng
- Configured NGINX, SSL (Let's Encrypt), PostgreSQL, Redis
- Set up GitHub Actions CI/CD with 260+ tests passing

#### ESLint 9 Flat Configuration
- Added ESLint 9 flat config for web and api packages
- Configured Vitest globals support
- Zero lint errors in CI

#### Documentation Updates
- Added rate limit configuration reference to project-context.md
- Documented ESM import conventions (.js extension requirements)
- Updated epics.md with Stories 1.8, 1.9, 1.10
- Completed Epic 1 retrospective with all action items

### Milestone
- **Epic 1: Foundation, Secure Access & Staff Onboarding** - COMPLETE (10/10 stories)

---

## [Unreleased]

### Fixed

#### API: express-rate-limit v8 compatibility (2026-01-19)

**Problem:** The `db:push` command failed with TypeScript error TS2345 in `registration-rate-limit.ts:72`.

**Root Cause:** The `ipKeyGenerator` function imported from `express-rate-limit` changed its signature in v8.x. The code was calling `ipKeyGenerator(req, res)` expecting it to accept Express request/response objects, but v8 changed this API.

**File:** `apps/api/src/middleware/registration-rate-limit.ts`

**Resolution:** Replaced the `ipKeyGenerator(req, res)` call with direct IP extraction: `req.ip || 'unknown'`. Removed the unused `ipKeyGenerator` import. Also disabled the `keyGeneratorIpFallback` validation for `resendVerificationRateLimit` since it intentionally uses email as the primary rate-limiting key with IP as a fallback.

```diff
- import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
+ import rateLimit from 'express-rate-limit';

  keyGenerator: (req, res) => {
    const email = req.body?.email?.toLowerCase?.()?.trim?.();
-   return email || ipKeyGenerator(req, res);
+   return email || req.ip || 'unknown';
  },
  ...
- validate: isTestMode() ? false : { xForwardedForHeader: false },
+ validate: isTestMode() ? false : { xForwardedForHeader: false, keyGeneratorIpFallback: false },
```

---

#### API: Monorepo .env loading for all API source files (2026-01-19)

**Problem:** Running `pnpm dev` failed with "DATABASE_URL is not set in environment variables" even though `.env` file existed in the project root. The `db:push` command had the same issue.

**Root Cause:** Multiple files in the API package called `dotenv.config()` without specifying a path. In a monorepo structure, `dotenv` looks for `.env` in the current working directory, but the API runs from `apps/api/` while the `.env` file is in the project root.

**Files affected:**
- `apps/api/drizzle.config.ts`
- `apps/api/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/db/index.ts`
- `apps/api/src/workers/import.worker.ts`
- `apps/api/src/queues/import.queue.ts`

**Resolution:** Added explicit path resolution to load `.env` from the project root in all affected files. For ES modules (`.ts` files in `src/`), this required using `import.meta.url` to get the equivalent of `__dirname`:

```diff
+ import { fileURLToPath } from 'url';
+ import path from 'path';

+ const __filename = fileURLToPath(import.meta.url);
+ const __dirname = path.dirname(__filename);

- dotenv.config();
+ dotenv.config({ path: path.resolve(__dirname, '<relative-path-to-root>/.env') });
```

**Path mapping:**
| File Location | Relative Path to Root |
|---------------|----------------------|
| `apps/api/drizzle.config.ts` | `../../.env` |
| `apps/api/src/index.ts` | `../../../.env` |
| `apps/api/src/app.ts` | `../../../.env` |
| `apps/api/src/db/index.ts` | `../../../../.env` |
| `apps/api/src/workers/import.worker.ts` | `../../../../.env` |
| `apps/api/src/queues/import.queue.ts` | `../../../../.env` |

---
