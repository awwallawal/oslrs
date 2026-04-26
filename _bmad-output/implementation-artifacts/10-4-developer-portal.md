# Story 10.4: Developer Portal

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Public `/developers` page with OpenAPI/Swagger UI + scope reference + request-access form. Self-service partner integration documentation.

Sources:
  • PRD V8.3 FR24
  • Architecture Decision 3.4 (partner namespace + scope catalogue) + Decision 3.1 (OpenAPI)
  • UX Rate Limiting UX Patterns 1-2 (consumer-self-quota visibility)
  • Epics.md §Story 10.4

Depends on Story 10-1 (OpenAPI spec generation) + Story 10-2 (quota visibility for consumer-self-view).
-->

## Story

As a **Partner Developer integrating against the OSLSR partner API**,
I want **a public `/developers` page with OpenAPI/Swagger documentation, scope reference, request-access form, and (when authenticated) my own quota visibility**,
so that **I can self-serve API integration without back-and-forth emails with the Ministry, understand exactly what each scope grants and its rate limits, and check my current quota state without having to call my Ministry contact**.

## Acceptance Criteria

1. **AC#1 — Public `/developers` route:** New unauthenticated route `/developers` (uses PublicLayout per ADR-016 — same shell as homepage / about / etc.). No login required to view documentation.

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
   - Rate-limit defaults (per-minute, daily, monthly per Story 10-2)
   - DSA requirement flag (yes for `submissions:read_pii`, no for others)
   - Provisioning timeline estimate (per Story 10-5 SOP timeline buckets)
   - Sample request + sample response (curl + JSON)

4. **AC#4 — OpenAPI/Swagger UI:**
   - OpenAPI 3.1 spec auto-generated from partner-route Zod schemas (per Decision 3.1) — uses `zod-to-openapi` library (already in stack per Architecture Decision 3.1)
   - Spec endpoint: `GET /api/v1/partner/openapi.json` (publicly accessible — schemas are not sensitive)
   - Swagger UI embedded via official `swagger-ui-react` library (lightweight, accessibility-tested)
   - "Try it out" feature available — but requires API key entry (the Swagger UI's built-in authentication input pattern)
   - Spec versioned alongside code (changes to partner routes auto-update spec on next deploy)

5. **AC#5 — Request access form:**
   - Inline form on the page (not a separate route) for friction reduction
   - Required fields: organisation name, organisation type (dropdown), authorised signatory name + role + email, technical contact email + phone, intended use case (textarea, 500 chars), requested scopes (multi-select with descriptions), requested LGA scope (optional multi-select; default = state-wide)
   - Optional fields: requested DSA effective date, attachments (limit 3 PDFs ≤2MB each)
   - hCaptcha protection (existing pattern)
   - On submit: POST to `/api/v1/admin/consumer-requests` (new endpoint; receives + queues for Super Admin review)
   - Success message: "Request received. We'll respond within 3 business days. (Per FR25 SOP §STEP 2)"
   - Audit-logged: `action: 'consumer_request.received'` with no principal (system-event since unauthenticated)

6. **AC#6 — Consumer-self quota visibility (authenticated):**
   - Same `/developers` page, but if visitor is an authenticated consumer (presents API key in `Authorization` header — NOT the typical case, but supported via header-input affordance OR a separate `/developers/dashboard` if their key is provided), show per-scope quota usage
   - Reuses Sally's Pattern 2 daily quota progress bar via Story 10-2 `GET /api/v1/partner/quota` endpoint
   - Per-scope row with progress bar + threshold colours
   - 7-day historical sparkline
   - "Request quota increase" link → contact form (different from AC#5 request-access form)

7. **AC#7 — Documentation content:**
   - "Getting Started" guide (5-min walkthrough): how to provision (link to AC#5), receive token, make first request, handle 429
   - Authentication guide: API key in Authorization header, never in query string, key rotation cadence + 7-day overlap window
   - Error code reference: per Architecture Decision 2.4 + Story 10-1 AC#11 error taxonomy with explanation of each
   - Rate limiting guide: per-minute + daily + monthly quotas; honour Retry-After; per-scope vs per-consumer messaging (Sally's Pattern 3)
   - Webhook guide: NOT in MVP scope; placeholder section "Webhooks coming Q3 2026"
   - SDKs: NOT in MVP; placeholder "Use OpenAPI Generator to scaffold a client in your language"

8. **AC#8 — Footer / contact:**
   - For pre-onboarded partners: "Have questions? Email developer-relations@oyotradeministry.com.ng" (or similar)
   - For onboarded consumers: "Production support via your DSA technical contact (see Schedule 3)"

9. **AC#9 — Performance:**
   - Page TTI <2s on 4G (NFR1.2) — including Swagger UI lazy-loaded after initial paint
   - OpenAPI spec response cached aggressively (CDN-level via Cloudflare when domain lands; for now, browser cache 5min)

10. **AC#10 — Tests:**
    - Component tests: scope reference table, request-access form (with hCaptcha mock), Swagger UI integration
    - Integration test: form submission triggers `/api/v1/admin/consumer-requests` endpoint; success path + validation errors
    - E2E test: visitor browses /developers → reads scope reference → fills request form → sees success
    - OpenAPI spec test: `GET /api/v1/partner/openapi.json` returns valid OpenAPI 3.1; auto-generated from schemas matches expected route shape
    - Existing 4,191-test baseline maintained or grown

## Dependencies

- **Story 10-1 (HARD)** — partner routes + Zod schemas exist (OpenAPI auto-gen depends on schemas)
- **Story 10-2 (HARD for AC#6)** — quota visibility endpoint
- **Architecture Decision 3.1 + 3.4** — design baseline
- **PublicLayout (existing per ADR-016)** — page chrome

**Unblocks:**
- None (terminal in Epic 10 chain)

## Field Readiness Certificate Impact

**Tier B / post-field.** Doesn't ship until Epic 10 partner-API is open for partner integration.

## Tasks / Subtasks

### Task 1 — Page structure + routing (AC#1, AC#2)

1.1. Add route `/developers` to TanStack Router
1.2. New page `apps/web/src/features/developers/pages/DevelopersPage.tsx` using PublicLayout
1.3. Hero + Overview sections with copy (Awwal + Sally provide)

### Task 2 — Scope reference table (AC#3)

2.1. New component `apps/web/src/features/developers/components/ScopeReferenceTable.tsx`
2.2. Static data (5 scopes per Decision 3.4) — could be pulled from server but static is simpler for MVP
2.3. Sample request/response per scope (curl + JSON)

### Task 3 — OpenAPI spec generation (AC#4 backend)

3.1. Backend: `GET /api/v1/partner/openapi.json` route returning auto-generated spec from Zod schemas via `zod-to-openapi` library
3.2. Spec includes all partner routes (reference Story 10-1 placeholder routes; controllers ship later but routes exist)
3.3. Tests: spec validity per OpenAPI 3.1 schema

### Task 4 — Swagger UI integration (AC#4 frontend)

4.1. Install `swagger-ui-react`
4.2. New component `apps/web/src/features/developers/components/SwaggerUiSection.tsx`
4.3. Lazy-load Swagger UI (dynamic import) to avoid blocking initial paint
4.4. Configure to fetch spec from `/api/v1/partner/openapi.json`

### Task 5 — Request access form (AC#5)

5.1. New component `apps/web/src/features/developers/components/RequestAccessForm.tsx`
5.2. Form fields per AC#5
5.3. hCaptcha integration (existing pattern)
5.4. Backend: new endpoint `POST /api/v1/admin/consumer-requests` (super-admin reviews via Story 10-3 list extension; or Notion sync for MVP)
5.5. Success / error states

### Task 6 — Consumer-self quota visibility (AC#6)

6.1. New component `apps/web/src/features/developers/components/ConsumerQuotaDashboard.tsx`
6.2. API key input affordance OR detect presence of `Authorization` header (latter unusual for browser — likely API-key-input UX)
6.3. Calls Story 10-2 `GET /api/v1/partner/quota` with provided key
6.4. Renders Pattern 2 daily quota progress bars + 7-day sparkline

### Task 7 — Documentation content (AC#7)

7.1. Markdown content sections embedded in page or rendered from `docs/developer-portal/*.md`
7.2. "Getting Started", "Authentication", "Error codes", "Rate limiting" sections
7.3. Code samples in multiple languages (curl + JavaScript + Python at minimum)

### Task 8 — Footer / contact (AC#8)

8.1. Footer section with contact emails

### Task 9 — Performance optimisation (AC#9)

9.1. Lazy-load Swagger UI bundle
9.2. Cache headers on OpenAPI spec response

### Task 10 — Tests (AC#10) + sprint-status

10.1. Component + integration + E2E tests
10.2. OpenAPI spec validity test
10.3. Update sprint-status.yaml

## Technical Notes

### Why public-by-default (no auth)

Documentation gating behind authentication creates friction for evaluation. Partners need to read what we offer before they apply. The OpenAPI spec itself is not sensitive — it's the API surface, not the data. Auth-gating the docs would just push partners to ask Awwal directly, defeating self-service goal.

### Why request-access form is on /developers (not separate route)

Friction reduction. Reading the docs creates intent → form is right there → submission. Separate route would force a context switch + re-orientation.

### Why OpenAPI spec is auto-generated

Manual maintenance of OpenAPI spec drifts from code. Auto-generation from Zod schemas (per Decision 3.1) ensures spec is always accurate. The `zod-to-openapi` library is established + maintained.

### Why Swagger UI is lazy-loaded

Swagger UI bundle is ~500KB. Loading on every /developers page render hurts TTI (NFR1.2 target 2.5s on 4G). Lazy-loading defers until user scrolls to that section.

### Why consumer-self quota visibility is on the same page (not separate dashboard)

Two reasons:
1. **Discoverability**: consumers come to /developers for docs; finding their quota usage as a section there is intuitive
2. **Cost**: separate dashboard = more components + routing + maintenance; one page suffices for MVP

If post-launch metrics show consumers want a richer self-service experience, a dedicated `/developers/dashboard` route can be added in a future story.

### Why hCaptcha on the request form

Form is unauthenticated public submission — without CAPTCHA, vulnerable to bot spam (would clog Super Admin review queue). hCaptcha is the existing pattern for public forms in this codebase per existing security stories.

### Why placeholder for webhooks + SDKs

MVP scope focuses on the read-only scopes (per FR24). Webhooks would imply OSLSR pushing data to partners on events — interesting future feature but not MVP. SDKs (per-language client libraries) are valuable but expensive to maintain across languages; OpenAPI Generator gives partners a starting point. Both flagged as future enhancements.

### Why production-support pointer references DSA Schedule 3

Per Story 10-5 DSA template Schedule 3 specifies operational specifications including support contact. Onboarded consumers should use that channel (production support) not /developers email (developer-relations). Clear demarcation prevents support load on the wrong channel.

## Risks

1. **OpenAPI auto-gen may produce incomplete spec.** If Zod schemas miss a route OR have non-standard types, spec is wrong. Mitigation: AC#10 spec validity test catches structural issues; manual review during implementation catches semantic gaps.
2. **Swagger UI accessibility may have gaps.** Third-party React component; accessibility may not match our standards. Mitigation: smoke-test with screen reader; if blocked, write a custom doc renderer (more work but accessibility-first).
3. **Request form spam.** Even with hCaptcha, determined spammers could clog the queue. Mitigation: hCaptcha + rate-limit at NGINX (per existing pattern) + Super Admin can mark requests as spam in tracker.
4. **Consumer-self quota visibility requires API key in browser.** Operator paste-in is unusual UX; unclear if partners will use it. Mitigation: AC#6 deemed lower priority than AC#1-5; if usability test shows confusion, consider deferring to a future "consumer dashboard" story with proper auth flow.
5. **Documentation drift between scope reference table (static) and OpenAPI spec (auto).** If a scope's defaults change, scope reference table won't update unless manually edited. Mitigation: scope reference table sourced from same `apps/api/src/config/partner-rate-limits.ts` (Story 10-2) — single source of truth; frontend imports the constants.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/web/src/features/developers/pages/DevelopersPage.tsx`
- `apps/web/src/features/developers/components/ScopeReferenceTable.tsx`
- `apps/web/src/features/developers/components/SwaggerUiSection.tsx`
- `apps/web/src/features/developers/components/RequestAccessForm.tsx`
- `apps/web/src/features/developers/components/ConsumerQuotaDashboard.tsx`
- `docs/developer-portal/getting-started.md`
- `docs/developer-portal/authentication.md`
- `docs/developer-portal/error-codes.md`
- `docs/developer-portal/rate-limiting.md`
- `apps/api/src/routes/partner/openapi.routes.ts` — OpenAPI spec endpoint
- `apps/api/src/routes/admin/consumer-requests.routes.ts` — request-access endpoint
- `apps/api/src/services/consumer-request.service.ts`
- Tests

**Modified:**
- `apps/api/package.json` — add `zod-to-openapi`
- `apps/web/package.json` — add `swagger-ui-react`
- TanStack Router config
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering public /developers route + scope reference table + Swagger UI + request access form + consumer-self quota visibility + documentation content + footer + performance + tests. Depends on Story 10-1 + 10-2. | Self-service partner integration surface. Without it, every partner asks Awwal manually for docs. |
