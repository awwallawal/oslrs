# Story 7.prep-5: Public Route Security Spike

Status: ready-for-dev

## Story

As the **development team**,
I want a comprehensive threat model and security control design for public unauthenticated marketplace routes,
so that Stories 7-2, 7-4, and 7-6 can be implemented with validated rate limiting, bot protection, CAPTCHA strategy, and search injection defenses — avoiding security gaps on the first public-facing API surface.

## Problem Statement

Every route in the OSLRS API to date requires authentication. Epic 7 introduces the first **public unauthenticated routes** — marketplace search, anonymous profile viewing, and contact reveal. This is a fundamentally different security surface:

- **Scraping:** Automated harvesting of worker profiles at scale
- **Enumeration:** Sequential ID probing to map the full registry
- **Search injection:** Malicious input to tsvector full-text search queries
- **Bot automation:** Programmatic contact reveal to bypass rate limits
- **Abuse amplification:** No auth barrier means any IP can attack

Security hardening (SEC-1 through SEC-4) established the foundation (CSP, mass assignment, CI audit gate, dependency pinning), but no controls exist for unauthenticated API routes at volume.

**This is a research spike. The deliverable is a security design document, not production code.**

## Acceptance Criteria

1. **Given** the spike output, **when** Story 7-2 begins, **then** rate limiting thresholds for `/marketplace/search` are defined with Redis key patterns ready to implement.
2. **Given** the spike output, **when** Story 7-4 begins, **then** CAPTCHA integration strategy for contact reveal is documented (reuse existing hCaptcha, trigger conditions, progressive escalation).
3. **Given** the spike output, **when** Story 7-6 begins, **then** bot detection approach is selected with implementation plan (device fingerprinting, honeypot fields, User-Agent validation).
4. **Given** the spike output, **when** reviewed, **then** a threat model covering all 3 marketplace route groups is documented with attack vectors, mitigations, and residual risk.
5. **Given** the spike output, **when** reviewed, **then** search input validation strategy is documented (Zod schemas, tsvector injection prevention, pagination safety).
6. **Given** the spike output, **when** reviewed, **then** all new env vars required by marketplace security (if any) are listed for prep-2's safety script.
7. **Given** the spike output, **when** reviewed, **then** the approach integrates with existing middleware patterns (express-rate-limit + Redis, hCaptcha, Helmet CSP).

## Tasks / Subtasks

- [ ] Task 1: Threat model for marketplace routes (AC: #4)
  - [ ] 1.1 Enumerate all planned public routes and their data exposure:
    - `GET /marketplace` — search/list anonymous profiles (no auth)
    - `GET /marketplace/profile/:id` — single anonymous profile view (no auth)
    - `POST /marketplace/profile/:id/reveal` — contact reveal (auth + CAPTCHA required)
    - `POST /marketplace/profile/:id/edit-token` — request edit token via SMS (no auth, CAPTCHA required)
    - `PUT /marketplace/profile/:id` — edit profile with token (token auth)
  - [ ] 1.2 For each route, document attack vectors:
    - Scraping (automated bulk requests)
    - Enumeration (sequential ID probing)
    - Injection (search query manipulation)
    - Abuse (rate limit bypass, CAPTCHA solving services)
    - PII leakage (information disclosure through error messages or timing)
  - [ ] 1.3 Document mitigations per vector and residual risk assessment
  - [ ] 1.4 Define data exposure rules: what is visible without auth, with auth, with auth + CAPTCHA + consent
- [ ] Task 2: Rate limiting architecture (AC: #1, #7)
  - [ ] 2.1 Design tiered rate limits for marketplace routes:
    - `/marketplace` search: 30 req/min/IP (architecture.md spec)
    - `/marketplace/profile/:id` view: 100 req/min/IP
    - `/marketplace/profile/:id/reveal` contact: 50 reveals/24h/user (epics.md Story 7.6 spec)
    - `/marketplace/profile/:id/edit-token`: 3 req/day/NIN (architecture.md spec)
  - [ ] 2.2 Define Redis key patterns following existing convention (`rl:marketplace:search:${ip}`, etc.)
  - [ ] 2.3 Document integration with existing `express-rate-limit` + `rate-limit-redis` stack
  - [ ] 2.4 Design response format for 429 errors (match existing JSON error shape with `code` field)
  - [ ] 2.5 Evaluate IP-based vs fingerprint-based limiting (IP + fingerprint hybrid for reveal endpoint)
- [ ] Task 3: CAPTCHA strategy (AC: #2, #7)
  - [ ] 3.1 Document reuse of existing hCaptcha infrastructure (`middleware/captcha.ts`)
  - [ ] 3.2 Define CAPTCHA trigger conditions for marketplace:
    - Contact reveal: always required (Story 7.4 spec)
    - Search: after 10 searches per session (architecture.md spec)
    - Edit token request: always required
  - [ ] 3.3 Design progressive CAPTCHA escalation: normal → enterprise difficulty after repeated failures
  - [ ] 3.4 Document CSP implications: existing hCaptcha CSP directives (app.ts:93-126) already cover script/style/frame/connect sources
  - [ ] 3.5 Plan `optionalCaptcha` middleware usage for search (existing middleware variant at captcha.ts:129-141)
- [ ] Task 4: Bot detection strategy (AC: #3)
  - [ ] 4.1 Evaluate device fingerprinting options:
    - Server-side: request header analysis (User-Agent, Accept-Language, Accept-Encoding consistency)
    - Client-side: FingerprintJS (free tier) vs custom canvas/WebGL fingerprint
    - Recommendation with RAM/bundle size impact analysis
  - [ ] 4.2 Design honeypot fields for search form (hidden input that bots fill, humans don't)
  - [ ] 4.3 Define User-Agent validation rules (block known bot patterns, allow search engines for SEO)
  - [ ] 4.4 Design pagination safety: max 100 results per page, cursor-based (not offset), no total count exposure
  - [ ] 4.5 Evaluate whether a full fingerprinting library is needed at current scale vs simpler header-based heuristics
- [ ] Task 5: Search input validation & injection prevention (AC: #5)
  - [ ] 5.1 Design Zod schema for marketplace search params:
    - `query`: string, max 200 chars, sanitized (strip SQL/HTML)
    - `lga`: string, validated against LGA codes
    - `profession`: string, validated against known professions list
    - `experience_min`/`experience_max`: integer, bounded range
    - `page_cursor`: string, opaque cursor token
    - `page_size`: integer, max 100
  - [ ] 5.2 Document tsvector injection prevention:
    - `plainto_tsquery()` is safe (no operator injection, unlike `to_tsquery()`)
    - Parameterized queries via Drizzle `sql` template (already project standard)
    - pg_trgm similarity queries also parameterized
  - [ ] 5.3 Document error response sanitization: never expose internal column names, query plans, or stack traces in public route errors
- [ ] Task 6: Env var and infrastructure requirements (AC: #6)
  - [ ] 6.1 List any new env vars needed (e.g., `MARKETPLACE_SEARCH_RATE_LIMIT`, fingerprint API key if using external service)
  - [ ] 6.2 Confirm pg_trgm extension availability on production PostgreSQL (Docker container) — document `CREATE EXTENSION IF NOT EXISTS pg_trgm;` if needed
  - [ ] 6.3 Assess Redis memory impact of marketplace rate-limit keys at projected scale
- [ ] Task 7: Write spike document
  - [ ] 7.1 Compile all designs into `_bmad-output/implementation-artifacts/spike-public-route-security.md`
  - [ ] 7.2 Include: threat model matrix, rate limit table, CAPTCHA flow diagrams, Zod schemas, middleware patterns, env var list, open questions
  - [ ] 7.3 Reference architecture.md security sections and existing middleware implementations

## Dev Notes

### This Is a Research Spike

**Deliverable:** A security design document (`spike-public-route-security.md`) with threat model, middleware patterns, and validation schemas.
**Not deliverable:** Production middleware code, test suites, or route implementations.
The spike output feeds directly into Stories 7-2 (search), 7-4 (contact reveal), and 7-6 (logging/rate limiting).

### Existing Security Infrastructure (Reuse, Don't Reinvent)

**Rate limiting stack** — 7 middleware files already exist, all following the same pattern:
| Middleware | File | Pattern |
|-----------|------|---------|
| Login | `middleware/login-rate-limit.ts` | 5/15min burst + 10/1hr sustained |
| Registration | `middleware/registration-rate-limit.ts` | 5/15min/IP |
| Google OAuth | `middleware/google-auth-rate-limit.ts` | 10/1hr/IP |
| Export | `middleware/export-rate-limit.ts` | Role-tiered (5-20/hr) |
| Password reset | `middleware/password-reset-rate-limit.ts` | 10/1hr/IP |
| Messaging | `middleware/message-rate-limit.ts` | Per-user limits |
| General | `middleware/rate-limit.ts` | Token refresh 10/1min |

**Common pattern across all:**
- `express-rate-limit@8.2.1` + `rate-limit-redis@4.3.1`
- Lazy Redis client initialization (avoids test connection hangs)
- Memory store fallback in test mode (`process.env.VITEST`)
- Prefix-based Redis namespace isolation (`rl:login:`, `rl:register:`, etc.)
- Structured JSON error responses with `code` field
- `warn` level logging when limits exceeded

**CAPTCHA stack** (`middleware/captcha.ts`):
- hCaptcha provider, `HCAPTCHA_SECRET_KEY` server-side validation
- `VITE_HCAPTCHA_SITE_KEY` client-side widget
- `verifyCaptcha` middleware (required) + `optionalCaptcha` variant (monitoring mode)
- Skip in dev mode, test bypass token `'test-captcha-bypass'`
- CSP directives already configured for hcaptcha.com domains (app.ts:93-126)
- Used on: login, registration, password reset, email verification, OTP

**Helmet/CSP** (app.ts:86-139):
- Report-only mode currently (not enforcing)
- 11 CSP directives configured
- hCaptcha domains already whitelisted

### Current Public Attack Surface (Pre-Epic 7)

All existing public routes are auth-related with rate limiting + CAPTCHA:
- `/auth/staff/login`, `/auth/public/login` — rate-limited + CAPTCHA
- `/auth/public/register` — rate-limited + CAPTCHA
- `/auth/forgot-password`, `/auth/reset-password` — rate-limited + CAPTCHA
- `/auth/verify-email`, `/auth/verify-otp` — rate-limited + CAPTCHA
- `/auth/google/verify` — rate-limited
- `/auth/refresh` — rate-limited
- `/health`, `/csp-report` — utility endpoints

**Epic 7 adds a fundamentally different category:** data-serving routes where the payload itself (worker profiles) is the target, not just the auth tokens.

### Architecture Security Specs (Pre-Decided)

From `architecture.md`:
- **5-layer bot protection:** IP rate limiting, device fingerprinting, progressive CAPTCHA, pagination limits (max 100), honeypot fields
- **Search rate limit:** 30 req/min/IP + CAPTCHA after 10 searches
- **Contact reveal limit:** 50/user/24h + device fingerprint logging
- **Edit token:** 32-char random, single-use, 90-day expiry, 3 req/day/NIN
- **Profile edit token security:** SMS interception worst-case = fraudulent marketplace profile only (not survey data) — acceptable residual risk

### Key Decision: `plainto_tsquery()` vs `to_tsquery()`

- `to_tsquery()` parses operator syntax (`&`, `|`, `!`, `<->`) — **vulnerable to injection** if user input passed directly
- `plainto_tsquery()` treats all input as plain text — **safe by design**, no operator parsing
- Architecture already specifies `plainto_tsquery()` — spike should confirm and document this as the mandatory choice

### Stories That Consume This Spike

| Story | Consumes | Key Security Control |
|-------|----------|---------------------|
| 7-2: Public Marketplace Search | Rate limits, search validation, pagination safety | 30 req/min/IP, CAPTCHA after 10, max 100 results |
| 7-4: Authenticated Contact Reveal & CAPTCHA | CAPTCHA integration, reveal rate limit | Auth + CAPTCHA required, 50 reveals/24h |
| 7-6: Contact View Logging & Rate Limiting | Bot detection, fingerprinting, abuse monitoring | Device fingerprint, IP logging, hard limits |

### Spike Must Decide (Open Questions)

1. **Device fingerprinting library?** FingerprintJS free tier (client-side, ~30KB) vs header-based heuristics (zero bundle cost). Current scale (26% RAM) may not justify a full library.
2. **Progressive CAPTCHA implementation?** hCaptcha supports enterprise difficulty levels — spike should determine if the free tier suffices or if API-controlled difficulty is needed.
3. **Search CAPTCHA trigger mechanism?** After 10 searches per "session" — how is session tracked for unauthenticated users? IP? Cookie? localStorage counter?
4. **Honeypot field design?** Hidden form field that bots fill — what name, where in the form, what validation on the server?
5. **New env vars needed?** If using external fingerprinting service, need API key. If configurable rate limits, need env vars. Spike should minimize new vars (Epic 7 already adds marketplace-related vars).
6. **CSP enforcement mode?** Currently report-only. Should Epic 7 switch to enforcement? Risk: breaking legitimate third-party scripts.

### Project Structure Notes

- Spike output: `_bmad-output/implementation-artifacts/spike-public-route-security.md` (new file)
- Rate limit middleware location: `apps/api/src/middleware/` (new files per marketplace route group)
- CAPTCHA middleware: `apps/api/src/middleware/captcha.ts` (existing, reuse)
- Marketplace routes (future): `apps/api/src/routes/marketplace.routes.ts` (new file for Story 7-2)
- Validation schemas (future): inline Zod in controllers or shared in `apps/api/src/validators/`

### Anti-Patterns to Avoid

- **Do NOT recommend a WAF or external security service** — this is a single 2GB VPS. Solutions must be in-process or Redis-backed.
- **Do NOT design authentication for search** — search must be public/unauthenticated per Epic 7 requirement. Controls are rate limiting + CAPTCHA, not auth gates.
- **Do NOT over-engineer fingerprinting** — evaluate whether header-based heuristics suffice at current scale before recommending a JS library.
- **Do NOT use `to_tsquery()`** — always `plainto_tsquery()` for user input. Document this as a hard rule.

### References

- [Source: architecture.md] — 5-layer bot protection, marketplace route structure, rate limit specs
- [Source: epics.md:1936-1941] — Epic 7 security notes, prep-5 definition
- [Source: epics.md:1989-2000] — Story 7.4 CAPTCHA requirement
- [Source: epics.md:2015-2026] — Story 7.6 contact view logging, 50/user/24h limit
- [Source: epic-6-retro-2026-03-04.md#Prep Tasks prep-5] — Spike definition
- [Source: middleware/captcha.ts] — Existing hCaptcha implementation
- [Source: middleware/rate-limit.ts, login-rate-limit.ts, etc.] — Existing rate limiting patterns
- [Source: middleware/export-rate-limit.ts] — Role-tiered rate limiting precedent
- [Source: app.ts:86-139] — Helmet CSP configuration with hCaptcha domains
- [Source: app.ts:20-54] — Environment validation (requiredProdVars)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
