# Story 10.4: Developer Portal

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Public `/developers` page with OpenAPI/Swagger UI + scope reference + request-access form. Self-service partner integration documentation.

Sources:
  • PRD V8.3 FR24
  • Architecture Decision 3.4 (partner namespace + scope catalogue) + Decision 3.1 (OpenAPI)
  • UX Rate Limiting UX Patterns 1-2 (consumer-self-quota visibility)
  • Epics.md §Story 10.4

Depends on Story 10-1 (OpenAPI spec generation) + Story 10-2 (quota visibility for consumer-self-view).

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; 1 routes path fix (`apps/api/src/routes/admin/consumer-requests.routes.ts` subdir → `apps/api/src/routes/consumer-requests.routes.ts` flat file matching existing convention; `routes/partner/openapi.routes.ts` correctly uses partner/ subdir from Story 10-1); `zod-to-openapi` library name flagged for verify-at-impl-time (likely `@asteasolutions/zod-to-openapi` package); reuses 10-2 quota visibility endpoint per AC#6.
-->

## Story

As a **Partner Developer integrating against the OSLSR partner API**,
I want **a public `/developers` page with OpenAPI/Swagger documentation, scope reference, request-access form, and (when authenticated) my own quota visibility**,
so that **I can self-serve API integration without back-and-forth emails with the Ministry, understand exactly what each scope grants and its rate limits, and check my current quota state without having to call my Ministry contact**.

## Acceptance Criteria

1. **AC#1 — Public `/developers` route:** New unauthenticated route `/developers` (uses PublicLayout per ADR-016 — same shell as homepage / about / etc.; verify PublicLayout component path at impl time, likely `apps/web/src/layouts/PublicLayout.tsx` or similar). No login required to view documentation.

2. **AC#2 — Page structure (5 sections):**
   - **Hero:** "Oyo State Skills Registry — Partner API" + tagline + primary CTA "Request Access" (scrolls to AC#5 form)
   - **Overview:** brief explainer of what the partner API is, who it's for (MDA partners), what data is available (ranges from aggregated counts to row-level PII based on scope grant), legal framework (NDPA Article 25, Data-Sharing Agreement required for PII)
   - **Scope reference table** (per AC#3)
   - **API documentation (OpenAPI/Swagger UI)** embedded (per AC#4)
   - **Request access form** (per AC#5)
   - Footer: contact for direct support + link to runbook for current consumers

3. **AC#3 — Scope reference table:** For each of the 5 initial scopes (per Decision 3.4):
   - Scope identifier (monospace)
   - Plain-language description (2-3 sentences explaining what the scope grants)
   - Data surface (what fields are returned)
   - Rate-limit defaults (per-minute, daily, monthly per Story 10-2 — sourced from `apps/api/src/config/partner-rate-limits.ts` for single-source-of-truth; frontend imports the constants OR the table is server-rendered from the same config)
   - DSA requirement flag (yes for `submissions:read_pii`, no for others)
   - Provisioning timeline estimate (per Story 10-5 SOP timeline buckets)
   - Sample request + sample response (curl + JSON)

4. **AC#4 — OpenAPI/Swagger UI:**
   - OpenAPI 3.1 spec auto-generated from partner-route Zod schemas (per Decision 3.1) — uses `@asteasolutions/zod-to-openapi` library (verify exact package name at impl time; likely the canonical zod-OpenAPI lib in 2026)
   - Spec endpoint: `GET /api/v1/partner/openapi.json` (publicly accessible — schemas are not sensitive). New file `apps/api/src/routes/partner/openapi.routes.ts` (uses `partner/` subdirectory pattern established by Story 10-1)
   - Swagger UI embedded via official `swagger-ui-react` library (lightweight, accessibility-tested; verify CSP-compliance — no `eval`/`new Function()` per Story 9-7 enforcement)
   - "Try it out" feature available — but requires API key entry (the Swagger UI's built-in authentication input pattern)
   - Spec versioned alongside code (changes to partner routes auto-update spec on next deploy)

5. **AC#5 — Request access form:**
   - Inline form on the page (not a separate route) for friction reduction
   - Required fields: organisation name, organisation type (dropdown), authorised signatory name + role + email, technical contact email + phone, intended use case (textarea, 500 chars), requested scopes (multi-select with descriptions), requested LGA scope (optional multi-select; default = state-wide)
   - Optional fields: requested DSA effective date, attachments (limit 3 PDFs ≤2MB each)
   - hCaptcha protection (existing pattern at `apps/web/src/features/auth/components/HCaptcha.tsx`)
   - Email-typo detection on the email fields via `EmailTypoDetection` component from Story 9-12 (`apps/web/src/features/registration/components/EmailTypoDetection.tsx`) — cross-feature reuse
   - On submit: POST to `/api/v1/admin/consumer-requests` (new endpoint; receives + queues for Super Admin review). Backend route file: **`apps/api/src/routes/consumer-requests.routes.ts`** (NEW flat file under `routes/`; NOT `routes/admin/consumer-requests.routes.ts` subdirectory — that pattern doesn't exist; existing convention is flat per resource: `audit.routes.ts`, `respondent.routes.ts`, `imports.routes.ts` from Story 11-2, etc.)
   - Success message: "Request received. We'll respond within 3 business days. (Per FR25 SOP §STEP 2)"
   - Audit-logged: `action: 'consumer_request.received'` with no principal (system-event since unauthenticated). Add `CONSUMER_REQUEST_RECEIVED: 'consumer_request.received'` to `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`

6. **AC#6 — Consumer-self quota visibility (authenticated):**
   - Same `/developers` page, but if visitor is an authenticated consumer (presents API key in `Authorization` header — NOT the typical case, but supported via header-input affordance OR a separate `/developers/dashboard` if their key is provided), show per-scope quota usage
   - Reuses Sally's Pattern 2 daily quota progress bar via Story 10-2 `GET /api/v1/partner/quota` endpoint (same endpoint used by Story 10-3 admin UI — single source of truth)
   - Per-scope row with progress bar + threshold colours (matches Story 10-3 + 10-6 charting; uses `recharts` for sparkline if 7-day historical visualisation included)
   - 7-day historical sparkline
   - "Request quota increase" link → contact form (different from AC#5 request-access form)

7. **AC#7 — Documentation content:**
   - "Getting Started" guide (5-min walkthrough): how to provision (link to AC#5), receive token, make first request, handle 429
   - Authentication guide: API key in Authorization header, never in query string, key rotation cadence + 7-day overlap window (references Story 10-1 AC#3-#4)
   - Error code reference: per Architecture Decision 2.4 + Story 10-1 AC#11 error taxonomy with explanation of each
   - Rate limiting guide: per-minute + daily + monthly quotas; honour Retry-After; per-scope vs per-consumer messaging (Sally's Pattern 3) — references Story 10-2 AC#5 429 response shape
   - Webhook guide: NOT in MVP scope; placeholder section "Webhooks coming Q3 2026"
   - SDKs: NOT in MVP; placeholder "Use OpenAPI Generator to scaffold a client in your language"
   - Markdown content lives at `docs/developer-portal/*.md` (NEW directory) — frontend renders via markdown-rendering library (verify in stack at impl time; if not, add a minimal renderer like `marked` or `react-markdown`)

8. **AC#8 — Footer / contact:**
   - For pre-onboarded partners: "Have questions? Email developer-relations@oyoskills.com" (uses ImprovMX alias per MEMORY.md email architecture; verify `developer-relations@oyoskills.com` is added to ImprovMX forwarders at impl time, or pick from existing aliases `support@oyoskills.com`)
   - For onboarded consumers: "Production support via your DSA technical contact (see Schedule 3)"

9. **AC#9 — Performance:**
   - Page TTI <2s on 4G (NFR1.2) — including Swagger UI lazy-loaded after initial paint
   - OpenAPI spec response cached aggressively — Cloudflare edge cache (already orange-cloud per MEMORY.md Phase 3 deploy 2026-04-27); set `Cache-Control: public, max-age=300, s-maxage=3600` on spec response

10. **AC#10 — Tests:**
    - Component tests: scope reference table, request-access form (with hCaptcha mock), Swagger UI integration
    - Integration test: form submission triggers `/api/v1/admin/consumer-requests` endpoint; success path + validation errors
    - E2E test: visitor browses /developers → reads scope reference → fills request form → sees success
    - OpenAPI spec test: `GET /api/v1/partner/openapi.json` returns valid OpenAPI 3.1; auto-generated from schemas matches expected route shape
    - CSP-compliance test: Swagger UI rendered without inline scripts violating Story 9-7 CSP
    - Existing 4,191-test baseline maintained or grown

## Tasks / Subtasks

- [ ] **Task 1 — Page structure + routing** (AC: #1, #2)
  - [ ] 1.1 Add route `/developers` to TanStack Router (public; no auth gate)
  - [ ] 1.2 New page `apps/web/src/features/developers/pages/DevelopersPage.tsx` (NEW feature directory; mirrors Wave 1/2/3 precedent — `registration/`, `audit-log/`, `settings/`, `admin-imports/`, `admin-consumers/`)
  - [ ] 1.3 Use existing PublicLayout (verify path at impl time; likely `apps/web/src/layouts/PublicLayout.tsx`)
  - [ ] 1.4 Hero + Overview sections with copy (Awwal + Sally provide)

- [ ] **Task 2 — Scope reference table** (AC: #3)
  - [ ] 2.1 New component `apps/web/src/features/developers/components/ScopeReferenceTable.tsx`
  - [ ] 2.2 Data sourced from Story 10-2 `apps/api/src/config/partner-rate-limits.ts` constants — frontend imports OR rendered server-side from same config (single source of truth)
  - [ ] 2.3 Sample request/response per scope (curl + JSON)

- [ ] **Task 3 — OpenAPI spec generation** (AC: #4 backend)
  - [ ] 3.1 Backend route file: `apps/api/src/routes/partner/openapi.routes.ts` (uses `partner/` subdirectory pattern from Story 10-1)
  - [ ] 3.2 `GET /api/v1/partner/openapi.json` returns auto-generated spec from Zod schemas via `@asteasolutions/zod-to-openapi` library (verify package name at impl time; canonical zod-OpenAPI lib in 2026)
  - [ ] 3.3 Spec includes all partner routes (reference Story 10-1 placeholder routes; controllers ship later but routes exist)
  - [ ] 3.4 Set `Cache-Control: public, max-age=300, s-maxage=3600` for Cloudflare edge caching (per AC#9)
  - [ ] 3.5 Tests: spec validity per OpenAPI 3.1 schema

- [ ] **Task 4 — Swagger UI integration** (AC: #4 frontend)
  - [ ] 4.1 Install `swagger-ui-react`
  - [ ] 4.2 New component `apps/web/src/features/developers/components/SwaggerUiSection.tsx`
  - [ ] 4.3 Lazy-load Swagger UI (dynamic import) to avoid blocking initial paint
  - [ ] 4.4 Configure to fetch spec from `/api/v1/partner/openapi.json`
  - [ ] 4.5 CSP audit: verify swagger-ui-react does not use inline scripts/eval that would violate Story 9-7 CSP enforcement

- [ ] **Task 5 — Request access form** (AC: #5)
  - [ ] 5.1 New component `apps/web/src/features/developers/components/RequestAccessForm.tsx`
  - [ ] 5.2 Form fields per AC#5
  - [ ] 5.3 hCaptcha integration (existing pattern at `apps/web/src/features/auth/components/HCaptcha.tsx`)
  - [ ] 5.4 Email-typo detection: import `EmailTypoDetection` component from Story 9-12 (`apps/web/src/features/registration/components/EmailTypoDetection.tsx`)
  - [ ] 5.5 Backend route file: `apps/api/src/routes/consumer-requests.routes.ts` (NEW flat file; NOT `routes/admin/consumer-requests.routes.ts` subdirectory)
  - [ ] 5.6 Backend service: `apps/api/src/services/consumer-request.service.ts` (NEW; handles INSERT into a new `consumer_requests` lightweight tracking table OR Notion sync — Awwal decides at impl time per Story 10-5 AC#8 tracker decision)
  - [ ] 5.7 Audit-logged: add `CONSUMER_REQUEST_RECEIVED: 'consumer_request.received'` to `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`; emit via `AuditService.logAction()` with `actor_id: null` (system event)
  - [ ] 5.8 Success / error states

- [ ] **Task 6 — Consumer-self quota visibility** (AC: #6)
  - [ ] 6.1 New component `apps/web/src/features/developers/components/ConsumerQuotaDashboard.tsx`
  - [ ] 6.2 API key input affordance (browser paste-in field; rare UX but acceptable for MVP)
  - [ ] 6.3 Calls Story 10-2 `GET /api/v1/partner/quota` with provided key in `Authorization: Bearer <token>` header
  - [ ] 6.4 Renders Pattern 2 daily quota progress bars + 7-day sparkline using `recharts` (matches Story 10-3 + 10-6 charting library choice)

- [ ] **Task 7 — Documentation content** (AC: #7)
  - [ ] 7.1 NEW directory `docs/developer-portal/` with markdown files: `getting-started.md`, `authentication.md`, `error-codes.md`, `rate-limiting.md`, `webhooks.md` (placeholder), `sdks.md` (placeholder)
  - [ ] 7.2 Frontend renders via markdown lib (verify in stack; if not present, add `react-markdown` to web package.json)
  - [ ] 7.3 Code samples in multiple languages (curl + JavaScript + Python at minimum)

- [ ] **Task 8 — Footer / contact** (AC: #8)
  - [ ] 8.1 Footer section with contact emails
  - [ ] 8.2 Verify ImprovMX alias `developer-relations@oyoskills.com` is added to forwarders (per MEMORY.md email architecture: ImprovMX free tier; current aliases admin/info/support/noreply/awwal); add as 6th alias if missing OR fall back to `support@oyoskills.com`

- [ ] **Task 9 — Performance optimisation** (AC: #9)
  - [ ] 9.1 Lazy-load Swagger UI bundle via dynamic import
  - [ ] 9.2 Cache headers on OpenAPI spec response (Task 3.4)
  - [ ] 9.3 Verify Cloudflare edge cache hit on spec endpoint post-deploy (orange-cloud per MEMORY.md Phase 3)

- [ ] **Task 10 — Tests** (AC: #10)
  - [ ] 10.1 Component + integration + E2E tests
  - [ ] 10.2 OpenAPI spec validity test (asserts conformance to OpenAPI 3.1 schema)
  - [ ] 10.3 CSP-compliance smoke test for Swagger UI (verify no inline-script CSP violations in browser console)
  - [ ] 10.4 Run `pnpm test` from root — verify baseline 4,191 + new tests
  - [ ] 10.5 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `10-4-developer-portal: in-progress` → `review` → `done`

- [ ] **Task 11 — Code review** (cross-cutting AC: all)
  - [ ] 11.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 11.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 11.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Story 10-1 (HARD)** — partner routes + Zod schemas exist (OpenAPI auto-gen depends on schemas); partner namespace mounted at `/api/v1/partner/*`; `partner/` routes subdirectory established
- **Story 10-2 (HARD for AC#6)** — quota visibility endpoint `GET /api/v1/partner/quota`; rate-limit constants in `apps/api/src/config/partner-rate-limits.ts` for AC#3 single-source-of-truth scope reference
- **Story 9-12 `EmailTypoDetection` component (PREFERRED)** — for AC#5 email-typo detection on form fields
- **Architecture Decision 3.1 + 3.4** — design baseline (OpenAPI auto-gen + scope catalogue)
- **PublicLayout (existing per ADR-016)** — page chrome
- **Story 10-5 AC#8 (PREFERRED)** — consumer onboarding tracker decision (Markdown vs Notion) informs AC#5 form-submission backend storage choice

**Unblocks:**
- None (terminal in Epic 10 chain)

### Field Readiness Certificate Impact

**Tier B / post-field.** Doesn't ship until Epic 10 partner-API is open for partner integration.

### Why public-by-default (no auth)

Documentation gating behind authentication creates friction for evaluation. Partners need to read what we offer before they apply. The OpenAPI spec itself is not sensitive — it's the API surface, not the data. Auth-gating the docs would just push partners to ask Awwal directly, defeating self-service goal.

### Why request-access form is on /developers (not separate route)

Friction reduction. Reading the docs creates intent → form is right there → submission. Separate route would force a context switch + re-orientation.

### Why OpenAPI spec is auto-generated

Manual maintenance of OpenAPI spec drifts from code. Auto-generation from Zod schemas (per Decision 3.1) ensures spec is always accurate. The `@asteasolutions/zod-to-openapi` library is established + maintained (verify package name at impl time).

### Why Swagger UI is lazy-loaded

Swagger UI bundle is ~500KB. Loading on every /developers page render hurts TTI (NFR1.2 target 2.5s on 4G). Lazy-loading defers until user scrolls to that section.

### Why CSP-compliance audit is non-trivial

Story 9-7 enforces strict CSP via nginx mirror. Some swagger-ui-react versions use inline scripts or `eval` in their bundled JS — would violate CSP and break the embed. Task 4.5 + Task 10.3 verify; if blocked, fallback options:
- (a) Custom doc renderer (more work but accessibility + CSP control)
- (b) Self-host swagger-ui static assets and CSP-allowlist them
- (c) Different OpenAPI viewer (Redoc, RapiDoc — verify CSP-compliance before swap)

### Why consumer-self quota visibility is on the same page (not separate dashboard)

Two reasons:
1. **Discoverability**: consumers come to /developers for docs; finding their quota usage as a section there is intuitive
2. **Cost**: separate dashboard = more components + routing + maintenance; one page suffices for MVP

If post-launch metrics show consumers want a richer self-service experience, a dedicated `/developers/dashboard` route can be added in a future story.

### Why hCaptcha on the request form

Form is unauthenticated public submission — without CAPTCHA, vulnerable to bot spam (would clog Super Admin review queue). hCaptcha is the existing pattern for public forms in this codebase per existing security stories (also used by Story 9-12 wizard forms).

### Why placeholder for webhooks + SDKs

MVP scope focuses on the read-only scopes (per FR24). Webhooks would imply OSLSR pushing data to partners on events — interesting future feature but not MVP. SDKs (per-language client libraries) are valuable but expensive to maintain across languages; OpenAPI Generator gives partners a starting point. Both flagged as future enhancements.

### Why production-support pointer references DSA Schedule 3

Per Story 10-5 DSA template Schedule 3 specifies operational specifications including support contact. Onboarded consumers should use that channel (production support) not /developers email (developer-relations). Clear demarcation prevents support load on the wrong channel.

### Routes file convention — flat file (not subdirectory)

`apps/api/src/routes/consumer-requests.routes.ts` lives flat under `routes/`. Story v1's reference to `apps/api/src/routes/admin/consumer-requests.routes.ts` was a fictional subdirectory. Routes file naming convention is one flat file per resource (`audit.routes.ts`, `respondent.routes.ts`, `imports.routes.ts` from Story 11-2, `consumers.routes.ts` from Story 10-3, etc.). The `partner/` subdirectory established by Story 10-1 was the documented exception (5 sub-routers per scope justified subdir); single flat file for `consumer-requests` follows the default.

The OpenAPI spec route, however, DOES use the `partner/` subdir: `apps/api/src/routes/partner/openapi.routes.ts` (mounts at `/api/v1/partner/openapi.json`).

### Risks

1. **OpenAPI auto-gen may produce incomplete spec.** If Zod schemas miss a route OR have non-standard types, spec is wrong. Mitigation: AC#10 spec validity test catches structural issues; manual review during implementation catches semantic gaps.
2. **Swagger UI accessibility may have gaps.** Third-party React component; accessibility may not match our standards. Mitigation: smoke-test with screen reader; if blocked, write a custom doc renderer (more work but accessibility-first).
3. **Swagger UI CSP violation risk.** Some versions use inline scripts. Mitigation: Task 4.5 + Task 10.3 audit; fallback options documented above.
4. **Request form spam.** Even with hCaptcha, determined spammers could clog the queue. Mitigation: hCaptcha + rate-limit at NGINX (per existing pattern) + Super Admin can mark requests as spam in tracker.
5. **Consumer-self quota visibility requires API key in browser.** Operator paste-in is unusual UX; unclear if partners will use it. Mitigation: AC#6 deemed lower priority than AC#1-5; if usability test shows confusion, consider deferring to a future "consumer dashboard" story with proper auth flow.
6. **Documentation drift between scope reference table (static) and OpenAPI spec (auto).** If a scope's defaults change, scope reference table won't update unless manually edited. Mitigation: scope reference table sourced from same `apps/api/src/config/partner-rate-limits.ts` (Story 10-2) — single source of truth; frontend imports the constants.
7. **`zod-to-openapi` package name uncertainty.** May be `@asteasolutions/zod-to-openapi` or just `zod-to-openapi` or another fork. Mitigation: verify at impl time via `pnpm view <name>`; pick whichever has active maintenance + OpenAPI 3.1 support.
8. **`developer-relations@oyoskills.com` ImprovMX alias may not exist.** Per MEMORY.md current aliases: admin/info/support/noreply/awwal. Mitigation: Task 8.2 adds the alias OR falls back to `support@oyoskills.com`.

### Project Structure Notes

- **NEW feature directory** `apps/web/src/features/developers/` with `pages/`, `components/`, `api/` subdirs. Mirrors Wave 1/2/3 precedent.
- **Public route** `/developers` — no auth gate; uses PublicLayout per ADR-016. Verify PublicLayout component path at impl time (likely `apps/web/src/layouts/PublicLayout.tsx` per layout-dir convention).
- **Cross-feature component reuse:**
  - `EmailTypoDetection` from Story 9-12 (`apps/web/src/features/registration/components/EmailTypoDetection.tsx`) — for AC#5 form email-typo detection
  - `recharts` for AC#6 quota sparkline — matches Story 10-3 + 10-6 charting library choice (single library for the codebase)
- **Backend routes — TWO new files, different conventions:**
  - **`apps/api/src/routes/consumer-requests.routes.ts`** (FLAT file) — for AC#5 form submission endpoint `/api/v1/admin/consumer-requests`. Flat file matches default convention.
  - **`apps/api/src/routes/partner/openapi.routes.ts`** (PARTNER/ subdirectory) — for AC#4 OpenAPI spec endpoint `/api/v1/partner/openapi.json`. Uses Story 10-1's documented partner/ subdir exception.
- **Backend service** `apps/api/src/services/consumer-request.service.ts` (NEW; for AC#5 form submission processing). Storage decision deferred to impl time per Story 10-5 AC#8 tracker decision (Markdown file in `docs/legal/consumer-onboarding-tracker.md` initially; migrate to Notion when 5+ requests).
- **NEW docs directory** `docs/developer-portal/` with 4-6 markdown files (Task 7.1).
- **OpenAPI library**: `@asteasolutions/zod-to-openapi` (likely; verify at impl time). Adds to `apps/api/package.json` dependencies.
- **Markdown rendering library**: verify `react-markdown` or similar in `apps/web/package.json` at impl time; add if missing.
- **Charting library** `recharts`: should be added by Stories 10-3 + 10-6 first (Wave 4 ordering). If they ship in parallel, this story coordinates via package.json (`recharts` in `apps/web/package.json` shared dependency).
- **CSP discipline** (per Story 9-7 nginx mirror): Swagger UI choice and rendering must avoid inline scripts / `eval` / `new Function()`. Task 4.5 + Task 10.3 enforce.
- **hCaptcha component** at `apps/web/src/features/auth/components/HCaptcha.tsx` (existing pattern; consumed by 9-12 wizard, public registration, etc.).
- **Audit logging** via `AuditService.logAction({ actor_id: null, ... })` for AC#5 form-submission system event. Use `AuditService.logAction` (fire-and-forget; `apps/api/src/services/audit.service.ts:226`); add `CONSUMER_REQUEST_RECEIVED` to `AUDIT_ACTIONS` const.
- **Email** uses ImprovMX architecture (per MEMORY.md "Project email architecture"); contact email at `developer-relations@oyoskills.com` requires alias setup in ImprovMX (Task 8.2). Fallback: existing `support@oyoskills.com` alias.
- **Cloudflare edge cache** (per MEMORY.md Phase 3 deploy 2026-04-27 — orange cloud) — set `Cache-Control: public, max-age=300, s-maxage=3600` on OpenAPI spec response for free CDN-level caching.
- **NEW directories created by this story:**
  - `apps/web/src/features/developers/` (with `pages/`, `components/`, `api/` subdirs)
  - `docs/developer-portal/` (markdown content)

### References

- Architecture Decision 3.1 (OpenAPI auto-gen from Zod): [Source: _bmad-output/planning-artifacts/architecture.md Decision 3.1]
- Architecture Decision 3.4 (partner namespace + scope catalogue): [Source: _bmad-output/planning-artifacts/architecture.md Decision 3.4]
- Architecture ADR-016 (PublicLayout chrome): [Source: _bmad-output/planning-artifacts/architecture.md ADR-016]
- Epics — Story 10.4 entry: [Source: _bmad-output/planning-artifacts/epics.md Epic 10 §10.4]
- Story 10-1 (HARD — partner routes + Zod schemas + partner/ subdir): [Source: _bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md AC#10, Task 6]
- Story 10-2 (HARD — quota endpoint + rate-limit config): [Source: _bmad-output/implementation-artifacts/10-2-per-consumer-rate-limiting.md AC#1-#3, AC#6]
- Story 10-5 AC#8 (PREFERRED — tracker decision): [Source: _bmad-output/implementation-artifacts/10-5-data-sharing-agreement-template.md AC#8]
- Story 9-12 `EmailTypoDetection` (PREFERRED for AC#5): [Source: apps/web/src/features/registration/components/EmailTypoDetection.tsx (created by Story 9-12 Task 6.3)]
- Existing hCaptcha component (AC#5 reuse): [Source: apps/web/src/features/auth/components/HCaptcha.tsx]
- Existing routes flat-file convention (precedent for `consumer-requests.routes.ts`): [Source: apps/api/src/routes/audit.routes.ts, respondent.routes.ts, imports.routes.ts]
- Story 10-1 routes subdirectory exception (precedent for `partner/openapi.routes.ts`): [Source: _bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md Dev Notes "Routes subdirectory pattern — first instance"]
- Audit service `logAction` API (system events with `actor_id: null`): [Source: apps/api/src/services/audit.service.ts:226]
- Audit service `AUDIT_ACTIONS` const (extend with `CONSUMER_REQUEST_RECEIVED`): [Source: apps/api/src/services/audit.service.ts:35-64]
- Web HTTP client (form submission): [Source: apps/web/src/lib/api-client.ts:31]
- MEMORY.md project pattern: ImprovMX email architecture: [Source: MEMORY.md "Project email architecture (3-vendor split, decided + Phase 1 LIVE 2026-04-26)"]
- MEMORY.md Phase 3 Cloudflare orange-cloud deploy (edge cache available): [Source: MEMORY.md "Production Deployment (VPS)" + "Phase 3"]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]
- MEMORY.md key pattern: integration tests use beforeAll/afterAll: [Source: MEMORY.md "Key Patterns"]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Exact `zod-to-openapi` package name installed (`@asteasolutions/zod-to-openapi` or alternative)
- Swagger UI CSP-compliance audit result (passed inline / passed with allowlist / blocked → fallback choice)
- Markdown rendering lib added (or pre-existing)
- `recharts` added to web package.json (or already present from concurrent 10-3 / 10-6 retrofit)
- ImprovMX `developer-relations@oyoskills.com` alias added (or fallback to `support@`)
- Cloudflare edge cache hit verified on `/api/v1/partner/openapi.json`
- AC#5 storage backend decision (Markdown file vs Notion vs DB table per Story 10-5 AC#8)
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Created:**
- `apps/web/src/features/developers/pages/DevelopersPage.tsx`
- `apps/web/src/features/developers/components/ScopeReferenceTable.tsx`
- `apps/web/src/features/developers/components/SwaggerUiSection.tsx`
- `apps/web/src/features/developers/components/RequestAccessForm.tsx`
- `apps/web/src/features/developers/components/ConsumerQuotaDashboard.tsx`
- `apps/web/src/features/developers/api/developers.api.ts` (TanStack Query hooks for AC#5 form submission + AC#6 quota fetch)
- `docs/developer-portal/getting-started.md`
- `docs/developer-portal/authentication.md`
- `docs/developer-portal/error-codes.md`
- `docs/developer-portal/rate-limiting.md`
- `apps/api/src/routes/partner/openapi.routes.ts` (uses partner/ subdir from Story 10-1)
- `apps/api/src/routes/consumer-requests.routes.ts` (NEW flat file; NOT subdir)
- `apps/api/src/services/consumer-request.service.ts`
- Tests

**Modified:**
- `apps/api/package.json` — add `@asteasolutions/zod-to-openapi` (verify package name at impl time)
- `apps/web/package.json` — add `swagger-ui-react`, `react-markdown` (if not present), `recharts` (if not added by 10-3/10-6 first)
- `apps/api/src/services/audit.service.ts` — extend `AUDIT_ACTIONS` const with `CONSUMER_REQUEST_RECEIVED`
- `apps/api/src/routes/index.ts` — mount `consumer-requests.routes.ts` + `partner/openapi.routes.ts`
- TanStack Router config — register `/developers` route
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Out of scope (explicitly NOT modified — happens upstream / future):**
- Partner routes / Zod schemas — owned by Story 10-1
- Quota endpoint — owned by Story 10-2
- Webhooks + SDKs — flagged as future enhancements

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering public /developers route + scope reference table + Swagger UI + request access form + consumer-self quota visibility + documentation content + footer + performance + tests. Depends on Story 10-1 + 10-2. | Self-service partner integration surface. Without it, every partner asks Awwal manually for docs. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 8 subsections — Why public-by-default / Why request-access form on /developers / Why OpenAPI auto-generated / Why Swagger UI lazy-loaded / Why CSP-compliance audit non-trivial / Why consumer-self quota on same page / Why hCaptcha / Why webhooks+SDKs placeholder / Why production-support pointer DSA Schedule 3 / Routes file convention rationale), "Risks" under Dev Notes; converted task-as-headings to canonical `[ ] Task N (AC: #X)` checkbox format; added `### Project Structure Notes` subsection covering new feature dir + public route convention + cross-feature component reuse + backend routes TWO conventions (flat for consumer-requests; partner/ subdir for openapi) + new docs dir + library decisions (zod-to-openapi, swagger-ui-react, react-markdown, recharts) + CSP discipline + hCaptcha reuse + audit logging system events + ImprovMX email architecture + Cloudflare edge cache; added `### References` subsection with 17 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record`; added `### Review Follow-ups (AI)` placeholder; added Task 11 (code review) per `feedback_review_before_commit.md`. **One factual path correction:** AC#5 + Task 5.5 + File List — `apps/api/src/routes/admin/consumer-requests.routes.ts` (subdirectory; doesn't exist) → `apps/api/src/routes/consumer-requests.routes.ts` (flat file matching existing convention). Routes-file convention guard documented in Dev Notes "Routes file convention — flat file (not subdirectory)" — clarifies that `routes/partner/` (Story 10-1) was the deliberate exception, NOT a default. **Cross-story coherence wiring:** AC#3 sources scope-reference data from Story 10-2's `partner-rate-limits.ts` config (single source of truth); AC#5 form-submission audit-logged via `AuditService.logAction({ actor_id: null })` system event; AC#6 quota visibility reuses Story 10-2 `/api/v1/partner/quota` endpoint; `EmailTypoDetection` reuse from Story 9-12; `recharts` library coordination with Stories 10-3 + 10-6; ImprovMX email alias coordination with MEMORY.md email architecture; Cloudflare edge-cache reuse from MEMORY.md Phase 3 deploy. **Library version risk flagged:** `zod-to-openapi` package name uncertain — likely `@asteasolutions/zod-to-openapi`; verify at impl time. **CSP-compliance audit** elevated to a dedicated task (Task 4.5 + Task 10.3) given Story 9-7 strict CSP enforcement. **One new audit action documented** (`CONSUMER_REQUEST_RECEIVED`). All 10 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as 16 prior retrofits. One factual routes-path correction; otherwise mechanical structural rebuild + cross-story coherence wiring with Wave 0/1/2/3 retrofitted infrastructure. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 11.)_
