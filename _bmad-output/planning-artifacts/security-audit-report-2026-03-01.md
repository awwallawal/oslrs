# OSLSR Security Audit Report

**Date:** 2026-03-01
**Auditor:** Amelia (Dev Agent) + Automated Tooling
**Scope:** Full OWASP Top 10 + PRD NFR Compliance Assessment
**Codebase Snapshot:** Post Epic 6-5, pre Epic 6 retrospective
**Total Test Count at Audit:** 2,963 (1,096 API + 1,867 web)

---

## Executive Summary

This report presents a comprehensive security posture assessment of the OSLSR codebase conducted at the Epic 6 completion checkpoint. The audit evaluates the application against the OWASP Top 10 (2021), maps findings to PRD NFR commitments (NFR4.1-4.7, NFR8.1-8.4), and produces BMAD-trackable remediation stories for any gaps identified.

**Overall Verdict: STRONG** — The codebase demonstrates mature security practices. No critical exploitable vulnerabilities were found in application code. However, there are **dependency CVEs**, a **missing CSP configuration** (gap against NFR8.4), and several **defensive hardening opportunities** that should be addressed before Epic 7 introduces public-facing marketplace routes.

### Risk Summary

| Severity | Count | Category |
|----------|-------|----------|
| CRITICAL | 1 | Dependency CVE (`fast-xml-parser` via AWS SDK) |
| HIGH | 3 | Dependency CVEs (`xlsx`, `@remix-run/router`, `rollup`), CSP gap |
| MEDIUM | 2 | Mass assignment pattern, Helmet default config |
| LOW | 3 | Defensive hardening, dependency pinning, error detail leakage |

---

## 1. Methodology

### 1.1 Approach
1. **Attack surface mapping** — Enumerated all routes accepting user input (params, query, body, file uploads)
2. **Data flow tracing** — Followed user input from controller → service → DB/filesystem/external API
3. **Boundary verification** — Checked auth middleware on routes, role checks in services, Zod validation layers
4. **Dangerous pattern grep** — Searched for `dangerouslySetInnerHTML`, `eval()`, raw SQL, `fs.*` with variables, `child_process.exec` with user input
5. **Configuration review** — CORS, Helmet, cookie flags, rate limits, error handling, env validation
6. **Secrets hygiene** — Client bundle contents, logging output, `.gitignore` coverage
7. **Dependency audit** — `pnpm audit` for known CVEs across all workspaces
8. **NFR compliance mapping** — Cross-referenced findings against PRD NFR4.1-4.7 and NFR8.1-8.4

### 1.2 Tools Used
- Manual code review (grep, glob, file reading)
- `pnpm audit` (dependency vulnerability scanner)
- Architecture document cross-reference (ADR-006, NFR specifications)

---

## 2. OWASP Top 10 Findings

### 2.1 A01:2021 — Broken Access Control

**Status: SECURE**

| Check | Result | Evidence |
|-------|--------|----------|
| Auth middleware on all protected routes | PASS | `router.use(authenticate)` applied consistently |
| Role-based authorization | PASS | `authorize(UserRole.SUPER_ADMIN)` on admin routes |
| Horizontal access control (own-data only) | PASS | `remuneration.controller.ts:237-240` — staff can only view own history |
| Scope enforcement (Supervisor team boundary) | PASS | `respondent.service.ts:100-112` — FORBIDDEN if out of scope |
| RBAC middleware | PASS | `middleware/rbac.ts` — LGA locking for field staff |

**Files reviewed:** `routes/*.routes.ts`, `middleware/auth.ts`, `middleware/rbac.ts`, `controllers/*.controller.ts`

---

### 2.2 A02:2021 — Cryptographic Failures

**Status: SECURE**

| Check | Result | Evidence |
|-------|--------|----------|
| Password hashing | PASS | bcrypt, 12 salt rounds (`packages/utils/src/crypto.ts`) |
| JWT signing | PASS | HS256 with >=32 char secret enforced in production (`app.ts:45`) |
| Cookie security | PASS | `httpOnly: true`, `secure: true` in prod, `sameSite: 'strict'` (`auth.controller.ts:24-30`) |
| Token storage | PASS | Access token in sessionStorage (not localStorage), refresh in HTTP-only cookie |
| Secrets in client bundle | PASS | Only `VITE_HCAPTCHA_SITE_KEY` and `VITE_API_URL` exposed |

---

### 2.3 A03:2021 — Injection

**Status: SECURE**

| Check | Result | Evidence |
|-------|--------|----------|
| SQL Injection | PASS | Drizzle ORM with parameterized `sql` template literals throughout |
| XSS | PASS | Zero `dangerouslySetInnerHTML` usage, standard JSX binding |
| Command Injection | PASS | `backup.worker.ts` uses shell commands with server-generated filenames only |
| Path Traversal | PASS | All file serving uses DB lookup → S3 key, no filesystem path construction from user input |
| NoSQL Injection | N/A | PostgreSQL only |

**Note:** `export-query.service.ts` uses `sql` template literals with parameterized placeholders — safe pattern.

---

### 2.4 A04:2021 — Insecure Design

**Status: SECURE**

| Check | Result | Evidence |
|-------|--------|----------|
| Rate limiting on auth endpoints | PASS | Login: 10/hr strict, 5/15min burst. Password reset, registration, Google Auth all separately limited |
| hCaptcha on public forms | PASS | Registration, public survey submission |
| File upload validation | PASS | Extension whitelist + MIME type + magic byte validation (`upload.middleware.ts`) |
| Fraud detection | PASS | Configurable threshold engine (GPS clustering, speed-run, straight-lining) |
| Dispute state machine | PASS | Enforced transitions with DB constraints |

---

### 2.5 A05:2021 — Security Misconfiguration

**Status: NEEDS ATTENTION**

| Check | Result | Evidence |
|-------|--------|----------|
| Helmet enabled | PASS | `app.use(helmet())` — `app.ts:71` |
| **Custom CSP configured** | **FAIL** | Helmet uses **defaults only** — no `strict-dynamic`, no `script-src` policy |
| CORS restricted | PASS | Single origin from `CORS_ORIGIN` env var |
| Error messages don't leak stack traces | PASS | Generic "An unexpected error occurred" to client |
| Production env validation | PASS | Fails fast on missing secrets |
| Debug mode disabled in prod | PASS | Pino log level respects env |

**GAP IDENTIFIED:** Architecture document (`architecture.md:652-657`) specifies:
> Helmet sets secure HTTP headers (CSP per NFR8, HSTS, noSniff)
> CSP: strict-dynamic, no unsafe-inline

But `app.ts:71` only calls `helmet()` with zero configuration. Helmet's default CSP is permissive. This is a **compliance gap against NFR8.4 (Anti-XSS: Strict CSP)**.

---

### 2.6 A06:2021 — Vulnerable and Outdated Components

**Status: ACTION REQUIRED**

`pnpm audit` reports **31 vulnerabilities** (1 critical, 22 high, 6 moderate, 2 low):

| Package | Severity | Issue | Impact | Remediation |
|---------|----------|-------|--------|-------------|
| `fast-xml-parser@5.2.5` | **CRITICAL** | Entity encoding bypass via regex injection (GHSA-m7jm-9gc2-mpf2) | Transitive via `@aws-sdk/client-s3` | Update `@aws-sdk/client-s3` to latest |
| `fast-xml-parser@5.2.5` | HIGH | RangeError DoS via numeric entities (GHSA-fj3w-jwp8-x2g3) | Transitive via `@aws-sdk/client-s3` | Same — update AWS SDK |
| `fast-xml-parser@5.2.5` | HIGH | DoS through entity expansion (GHSA-4r6h-8v6p-xvw6) | Transitive via `@aws-sdk/client-s3` | Same — update AWS SDK |
| `xlsx@0.18.5` | HIGH x2 | Prototype pollution + ReDoS | Direct dependency (XLSForm migration) | Evaluate migration to `xlsx@0.20.3+` or `exceljs` |
| `@remix-run/router@1.23.1` | HIGH | XSS via open redirects | Transitive via `react-router-dom@6.30.2` | Update `react-router-dom` to 6.30.3+ |
| `rollup` | HIGH x2 | Arbitrary file write via path traversal | Dev dependency (Vite build) | Update Vite or pin rollup override |
| `minimatch` | HIGH x12 | Multiple ReDoS variants | Transitive (build tooling) | Update parent packages |

**Risk assessment:**
- `fast-xml-parser`: Not directly exploitable — AWS SDK controls XML parsing internally. But transitive CVE = audit noise + supply chain risk.
- `xlsx`: Used only in one-time XLSForm migration (`story 2-9`). Low runtime exposure but prototype pollution is serious if triggered.
- `@remix-run/router`: Open redirect XSS — exploitable if attacker can craft a malicious link. **Should be patched.**
- `rollup`/`minimatch`: Build-time only. No runtime exposure. Low priority.

---

### 2.7 A07:2021 — Identification and Authentication Failures

**Status: SECURE**

| Check | Result | Evidence |
|-------|--------|----------|
| JWT expiry | PASS | 15-minute access tokens with refresh rotation |
| Session management | PASS | Redis-backed with 8hr inactivity + 24hr absolute timeouts |
| Token revocation | PASS | JTI tracking + Redis blacklist (`token.service.ts`) |
| Password change invalidation | PASS | Token revocation by timestamp |
| Brute force protection | PASS | Multi-tier rate limiting on all auth endpoints |
| Remember Me | PASS | Extends refresh to 30 days (not access token) |

---

### 2.8 A08:2021 — Software and Data Integrity Failures

**Status: SECURE**

| Check | Result | Evidence |
|-------|--------|----------|
| Immutable audit logs | PASS | Story 6-1: append-only with hash chaining, DB triggers prevent UPDATE/DELETE/TRUNCATE |
| Atomic transactions | PASS | Drizzle `db.transaction()` for multi-step operations |
| File upload integrity | PASS | Magic byte validation prevents MIME spoofing |
| CI/CD pipeline | PASS | GitHub Actions, no user-controlled build inputs |

---

### 2.9 A09:2021 — Security Logging and Monitoring Failures

**Status: SECURE**

| Check | Result | Evidence |
|-------|--------|----------|
| Audit logging | PASS | `AuditService` with fire-and-forget + transactional modes |
| PII access logging | PASS | `logPiiAccessTx()` for all PII views/exports |
| Auth event logging | PASS | Login/logout/token refresh all logged |
| System health monitoring | PASS | Story 6-2: prom-client metrics, health endpoint |
| Backup orchestration | PASS | Story 6-3: automated daily + monthly S3 backups |

---

### 2.10 A10:2021 — Server-Side Request Forgery (SSRF)

**Status: SECURE**

No endpoints accept user-provided URLs for server-side fetching. All external API calls use hardcoded URLs:
- hCaptcha: `https://hcaptcha.com/siteverify` (`middleware/captcha.ts:8`)
- Google Auth: Google library with client ID only
- AWS S3: SDK with configured bucket

---

## 3. Additional Findings

### 3.1 Mass Assignment Pattern (MEDIUM)

**File:** `apps/api/src/controllers/remuneration.controller.ts:93-100`

```typescript
const body = { ...req.body, /* type coercions */ };
const parseResult = createPaymentBatchSchema.safeParse(body);
```

**Risk:** `...req.body` spread before Zod validation. Zod strips unknown fields, so this is **safe today** — but the pattern is fragile. If a developer adds a field to the Zod schema without realizing `req.body` passes it through, mass assignment becomes possible.

**Recommendation:** Explicit field extraction before validation.

### 3.2 CORS Origin Fallback (LOW)

**File:** `apps/api/src/app.ts:73`

```typescript
origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
```

If `CORS_ORIGIN` is unset in production, CORS allows `localhost:5173`. The env validation at startup (`app.ts:31-42`) does NOT include `CORS_ORIGIN` in the required production vars list.

**Recommendation:** Add `CORS_ORIGIN` to the `requiredProdVars` array.

### 3.3 AppError Detail Exposure (LOW)

**File:** `apps/api/src/app.ts:98-103`

```typescript
return res.status(err.statusCode).json({
  status: 'error',
  code: err.code,
  message: err.message,
  details: err.details  // Could contain internal details
});
```

While unknown errors return a generic message, `AppError` instances return `err.details` directly. If a developer passes internal data (query results, stack fragments) into `AppError.details`, it leaks to the client.

**Recommendation:** Audit all `AppError` instantiations to ensure `details` contains only user-safe information.

---

## 4. NFR Compliance Matrix

| NFR | Requirement | Status | Gap |
|-----|-------------|--------|-----|
| NFR4.1 | Data Minimization (NIN only, no BVN) | COMPLIANT | — |
| NFR4.2 | 7-year retention, marketplace until revoked | COMPLIANT | Backup retention implemented (Story 6-3) |
| NFR4.3 | Logically isolated marketplace (read-only replica) | DEFERRED | Not yet implemented — Epic 7 scope |
| NFR4.4 | Defense-in-Depth (rate limiting, honeypots, CSP, IP throttling) | **PARTIAL** | Rate limiting: done. CSP: **NOT configured**. Honeypots: not implemented. IP throttling: done via rate-limit. |
| NFR4.5 | Input validation & sanitization (frontend + backend) | COMPLIANT | Zod on both sides |
| NFR4.6 | Role conflict prevention | COMPLIANT | RBAC middleware + last-admin guard (prep-10) |
| NFR4.7 | Encryption (TLS 1.2+ transit, AES-256 rest) | COMPLIANT | NGINX TLS, S3 encryption at rest |
| NFR8.1 | Race condition defense (DB unique constraints) | COMPLIANT | NIN uniqueness, payment dispute TOCTOU fix |
| NFR8.2 | Atomic transactions | COMPLIANT | `db.transaction()` throughout |
| NFR8.3 | Immutable audit logs (append-only) | COMPLIANT | Story 6-1: hash chaining + DB triggers |
| NFR8.4 | Anti-XSS (Strict CSP) | **NON-COMPLIANT** | Helmet uses defaults — no custom CSP headers |

---

## 5. Remediation Plan — BMAD Stories

The following stories are ordered by priority and designed to be tracked via sprint-status.yaml. They should be executed as a **security hardening prep phase** after Epic 6 completion, before Epic 7 begins (Epic 7 introduces public marketplace routes, making these fixes critical).

---

### Story SEC-1: Resolve Dependency CVEs (CRITICAL)

**As a** system maintainer,
**I want to** update vulnerable dependencies to patched versions,
**So that** the application is not exposed to known CVEs in production.

**Acceptance Criteria:**

- **AC1:** `@aws-sdk/client-s3` updated to a version that pulls `fast-xml-parser >= 5.3.8`, resolving GHSA-m7jm-9gc2-mpf2 (critical), GHSA-fj3w-jwp8-x2g3 (high), and entity expansion DoS.
- **AC2:** `react-router-dom` updated to `>= 6.30.3` (or version where `@remix-run/router >= 1.23.2`), resolving XSS via open redirect (GHSA-2w69-qvjg-hvjx).
- **AC3:** `xlsx@0.18.5` either updated to `>= 0.20.3` or replaced with `exceljs` for the XLSForm migration service. If `xlsx` is only used in the one-time migration script (Story 2-9), document the risk acceptance and consider removing it from production dependencies.
- **AC4:** `pnpm audit` reports zero critical and zero high vulnerabilities in production dependencies (build-only `minimatch`/`rollup` can be documented as accepted risk).
- **AC5:** All existing tests pass with zero regressions after dependency updates.

**Estimated Effort:** Small (2-4 hours)
**Priority:** P0 — Block before any production deployment

---

### Story SEC-2: Configure Content Security Policy (HIGH)

**As a** security engineer,
**I want to** configure Helmet with a strict Content-Security-Policy,
**So that** the application meets NFR8.4 (Anti-XSS) and NFR4.4 (Defense-in-Depth) requirements.

**Acceptance Criteria:**

- **AC1:** `app.ts` configures `helmet()` with a custom CSP directive:
  - `default-src 'self'`
  - `script-src 'self'` (with nonce or `'strict-dynamic'` if inline scripts are needed)
  - `style-src 'self' 'unsafe-inline'` (required by shadcn/ui — document this tradeoff)
  - `img-src 'self' data: blob: https://*.amazonaws.com` (S3 presigned URLs for photos)
  - `connect-src 'self' https://hcaptcha.com https://accounts.google.com wss:` (API, hCaptcha, Google OAuth, WebSocket)
  - `frame-src https://newassets.hcaptcha.com` (hCaptcha widget iframe)
  - `font-src 'self'`
  - `object-src 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
- **AC2:** CSP is set in `Report-Only` mode initially (`Content-Security-Policy-Report-Only`) with a report-uri endpoint that logs violations to pino.
- **AC3:** After 1 week of zero violations in production, switch to enforcing mode (`Content-Security-Policy`).
- **AC4:** Frontend application loads and functions correctly with CSP enabled (login, dashboard, form filling, file upload, hCaptcha, Google OAuth, WebSocket messaging).
- **AC5:** Tests verify that CSP header is present in API responses.

**Estimated Effort:** Medium (4-6 hours)
**Priority:** P1 — Required for NFR8.4 compliance

**Architecture Reference:** `architecture.md:652-657` (ADR-006)

---

### Story SEC-3: Harden Mass Assignment & Input Validation (MEDIUM)

**As a** developer,
**I want to** replace `...req.body` spread patterns with explicit field extraction,
**So that** the codebase is resilient against mass assignment even if Zod schemas change.

**Acceptance Criteria:**

- **AC1:** All controllers that use `...req.body` or `Object.assign({}, req.body)` are refactored to extract only the expected fields explicitly before Zod parsing.
- **AC2:** `remuneration.controller.ts:93-100` (the identified instance) is refactored as the primary target.
- **AC3:** A grep for `...req.body` across all controllers returns zero matches.
- **AC4:** Add `CORS_ORIGIN` to the `requiredProdVars` array in `app.ts:31-36` so production fails fast if CORS is misconfigured.
- **AC5:** Audit all `new AppError()` instantiations to confirm no `details` field contains internal data (query results, stack traces, internal IDs). Document findings.
- **AC6:** All existing tests pass with zero regressions.

**Estimated Effort:** Small (2-3 hours)
**Priority:** P2 — Defensive hardening

---

### Story SEC-4: Dependency Pinning & Audit CI Gate (LOW)

**As a** DevOps engineer,
**I want to** pin critical dependency versions and add `pnpm audit` to the CI pipeline,
**So that** new vulnerabilities are caught before merge and dependency drift is controlled.

**Acceptance Criteria:**

- **AC1:** Add `pnpm audit --audit-level=high` step to the GitHub Actions CI workflow. Builds fail if any high/critical vulnerability is found in production dependencies.
- **AC2:** Create a `pnpm.overrides` section in root `package.json` to force resolution of known-vulnerable transitive dependencies where direct update isn't possible.
- **AC3:** Document in `project-context.md` the accepted risk for build-only vulnerabilities (`minimatch`, `rollup`) with justification (no runtime exposure).
- **AC4:** Production `package.json` files use exact versions (no `^` or `~`) for security-critical packages: `bcrypt`, `jsonwebtoken`, `helmet`, `express`, `drizzle-orm`.

**Estimated Effort:** Small (1-2 hours)
**Priority:** P3 — Process improvement

---

## 6. Secure-by-Design Patterns (Existing Strengths)

These patterns are **working well** and should be preserved in `project-context.md` as mandatory conventions:

1. **DB-backed file serving** — All file downloads resolve through `UUID → DB lookup → S3 key`. No filesystem path construction from user input. Zero path traversal surface.

2. **Memory-only uploads** — Multer configured with `memoryStorage()` across all upload endpoints. Files never touch disk with user-supplied filenames.

3. **Multi-layer upload validation** — Extension whitelist + MIME type check + magic byte verification. Three independent checks must all pass.

4. **Zod validation on both sides** — Frontend (React Hook Form + Zod) and backend (controller-level `safeParse`) provide defense-in-depth input validation.

5. **Parameterized queries only** — Drizzle ORM's `sql` template literals produce parameterized queries. No string concatenation in SQL.

6. **Server-generated filenames** — All export filenames derived from `new Date().toISOString()` or database fields. No user input in `Content-Disposition` headers.

7. **SameSite + Bearer token dual auth** — CSRF-immune by design. Cookies use `SameSite: strict`, API calls use `Authorization: Bearer` header.

8. **Redis-backed session management** — JTI blacklist, inactivity timeout, absolute timeout, immediate revocation on password change.

9. **Fail-fast env validation** — Production startup validates all required secrets and minimum key lengths.

10. **Immutable audit logs** — Hash-chained, append-only with DB-level triggers preventing UPDATE/DELETE/TRUNCATE.

---

## 7. Pre-Epic 7 Security Checklist

Before Epic 7 (Public Skills Marketplace) introduces unauthenticated public routes, the following MUST be in place:

- [ ] SEC-1: All dependency CVEs resolved (especially `@remix-run/router` XSS)
- [ ] SEC-2: CSP configured and enforcing (public routes = highest XSS risk surface)
- [ ] SEC-3: Mass assignment patterns eliminated
- [ ] SEC-4: `pnpm audit` in CI pipeline
- [ ] NFR4.3: Read-only replica for marketplace (Epic 7 architecture concern)
- [ ] NFR4.4: Rate limiting on marketplace search endpoints (already have infrastructure)
- [ ] Story 7-6: Contact view logging + rate limiting (already planned)

---

## 8. Appendix

### A. Files Reviewed

**API (apps/api/src/):**
- `app.ts` — Express config, Helmet, CORS, error handler
- `middleware/auth.ts` — JWT verification, session validation
- `middleware/rbac.ts` — Role-based access control
- `middleware/rate-limit.ts` — Multi-tier rate limiting
- `middleware/captcha.ts` — hCaptcha verification
- `middleware/upload.middleware.ts` — Multer + file validation
- `controllers/*.controller.ts` — All 10 controller files
- `services/*.service.ts` — All service files
- `routes/*.routes.ts` — All route files
- `workers/backup.worker.ts` — Shell command usage
- `db/schema/*.ts` — All schema files

**Web (apps/web/src/):**
- `lib/api-client.ts` — Token storage, API interceptors
- `features/*/` — All feature directories for XSS patterns

**Config:**
- Root `package.json` — Dependency versions
- `.env.example` — Secret naming conventions

### B. Tools Output

```
pnpm audit: 31 vulnerabilities (1 critical, 22 high, 6 moderate, 2 low)
grep dangerouslySetInnerHTML: 0 matches
grep express.static: 0 matches
grep eval(: 0 matches (in application code)
grep ...req.body: 1 match (remuneration.controller.ts)
```

### C. BMAD Tracking

These stories should be added to `sprint-status.yaml` as a `security-hardening` prep phase:

```yaml
# Security Hardening Phase (Post-Epic 6, Pre-Epic 7)
# Source: security-audit-report-2026-03-01.md
security-hardening: backlog
sec-1-resolve-dependency-cves: backlog        # P0 CRITICAL
sec-2-configure-content-security-policy: backlog  # P1 HIGH
sec-3-harden-mass-assignment-input-validation: backlog  # P2 MEDIUM
sec-4-dependency-pinning-audit-ci-gate: backlog  # P3 LOW
```
