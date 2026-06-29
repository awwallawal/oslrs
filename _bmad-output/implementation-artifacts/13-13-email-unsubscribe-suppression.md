# Story 13-13 — Email Unsubscribe → Suppression Hygiene

Status: ready-for-dev

> Tier: **post-launch hygiene** (NOT launch-gating). Realizes 13-11 review L1 + 13-12 review L2. PM brief: `_bmad-output/planning-artifacts/pm-brief-2026-06-29-email-unsubscribe.md`.

## Story
As a **registrant who no longer wants marketing emails from the Oyo State Skills Registry**, I want to **unsubscribe in one click**, so that **I stop receiving re-engagement/referral emails without having to mark them as spam** — which also protects the registry's deliverability for everyone who DOES want them.

## Acceptance Criteria
1. **AC1 — Suppression inlet.** `email_suppressions.reason` enum extends to `['bounced','complained','unsubscribed']`. A successful unsubscribe writes the address with `reason='unsubscribed'`. [Source: apps/api/src/db/schema/email-suppressions.ts:10]
2. **AC2 — Honored by construction (no enforcement change).** Once suppressed, the 3 blasts + the 13-12 auto-send already skip the address via `getSuppressedEmails` — verified, NOT re-implemented. [Source: apps/api/src/services/email-events.service.ts (getSuppressedEmails); apps/api/src/services/submission-processing.service.ts (13-12 hook)]
3. **AC3 — List-Unsubscribe headers, MARKETING-ONLY.** Marketing emails (`reengagement-blast`, `supplemental-survey`, `thankyou-referral`) carry `List-Unsubscribe: <mailto:support@oyoskills.com?subject=unsubscribe>, <https://{PUBLIC_APP_URL}/api/v1/unsubscribe?token=…>` AND `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Transactional/ops categories (`magiclink-login`, `magiclink-wizard-resume`, `password-reset`, `registration-status`, `pending-nin-reminder`, `health-alert-digest`, `notification-digest`, `staff-invitation`, backup-*) carry NEITHER header. [Source: apps/api/src/services/notification-category.ts:15-31]
4. **AC4 — Provider category threading.** The `NotificationCategory` (or a derived `allowUnsubscribe: boolean`) is threaded `sendGenericEmail → dispatch → provider.send` so the provider can decide whether to attach the headers — currently `dispatch` passes only `{...data, campaignId}` (no category). [Source: apps/api/src/services/email.service.ts:98-108]
5. **AC5 — One-click endpoint.** PUBLIC `POST /api/v1/unsubscribe` (RFC-8058 one-click) AND `GET /api/v1/unsubscribe` (human click-through) verify a **stateless HMAC-signed per-recipient token**; on valid → upsert `email_suppressions(reason='unsubscribed')` + render a minimal confirmation page/response. Idempotent (already-suppressed → 200). [Source: routes/index.ts mount pattern; apps/api/src/middleware/rate-limit.ts]
6. **AC6 — Token security.** Token = HMAC-SHA256 over the recipient email (+ optional category) keyed by a server secret (`UNSUBSCRIBE_SECRET`); verified with constant-time compare. A forged/invalid/missing/tampered token → 4xx, nothing written. No enumeration: a caller can only unsubscribe the address encoded in their own signed token. [Source: apps/api/src/services/magic-link.service.ts:5 (sha256Hex from @oslsr/utils); node `crypto.createHmac`/`timingSafeEqual`]
7. **AC7 — Rate-limited.** The endpoint uses a dedicated rate-limit middleware (reuse the `rateLimit({windowMs,max})` factory). [Source: apps/api/src/middleware/rate-limit.ts:15-21]
8. **AC8 — Migration.** The reason-enum value `unsubscribed` is added (text-enum column → `db:push:full:force` on scratch; CI uses full).

## Tasks / Subtasks
- [ ] **Task 1 — Suppression schema + signer (AC1, AC6)** — extend `suppressionReasons` to include `unsubscribed`; add `apps/api/src/services/unsubscribe-token.ts` (pure `signUnsubscribeToken(email, category?)` + `verifyUnsubscribeToken(token)` using HMAC-SHA256 + `timingSafeEqual`, keyed by `UNSUBSCRIBE_SECRET`). Tests: round-trip, tamper → invalid, wrong-secret → invalid.
- [ ] **Task 2 — Provider category threading (AC4)** — thread `category` (or a `buildListUnsubscribe(category, email)` decision) through `sendGenericEmail → dispatch → ResendEmailProvider.send`; attach `List-Unsubscribe` + `List-Unsubscribe-Post` headers ONLY for marketing categories; the https link carries `signUnsubscribeToken(to)`. Test: marketing send carries headers; transactional send does NOT. [Source: email.service.ts:98-108; resend.provider.ts send()]
- [ ] **Task 3 — Endpoint + route (AC5, AC7)** — `unsubscribe.controller.ts` (`handleUnsubscribe`) + `unsubscribe.routes.ts` (`POST` one-click + `GET` click-through) mounted under `/api/v1` with a new `unsubscribeRateLimit`. On valid token → `INSERT ... ON CONFLICT DO NOTHING` into email_suppressions (reuse the 13-9 upsert shape) → confirmation. Tests: valid token suppresses + 200; bad/missing token → 4xx, nothing written; idempotent repeat; suppressed address skipped by a subsequent `getSuppressedEmails`.
- [ ] **Task 4 — Migration + verify (AC2, AC8)** — `db:push:full:force` on scratch; assert a `getSuppressedEmails` round-trip picks up an `unsubscribed` row; confirm the blasts + 13-12 auto-send skip it (existing tests cover the read — add one asserting `unsubscribed` is honored like `bounced`).
- [ ] **Task 5 — Operator note (boundary)** — document in the story Dev Notes (NOT built): the bouncing `admin@oyoskills.com` super-admin address is a separate operator fix; the ops/alert path deliberately does NOT consult `email_suppressions`.

## Dev Notes
- **This story adds the INLET, not the enforcement.** 13-9 already enforces `email_suppressions` on every marketing send (3 blasts + 13-12 auto-send via `getSuppressedEmails`). Do NOT touch the send-skip logic; just add `unsubscribed` rows.
- **Marketing-only boundary (hard):** transactional + ops/alert emails get NO unsubscribe header — you don't unsubscribe from a login link or a critical alert. The category gate in Task 2 is the mechanism.
- **DO NOT** make the ops/alert path consult `email_suppressions` — suppressing a bounced ops recipient would silence critical alerts (correct current behavior).
- **Token = stateless HMAC** (PM open-question resolved): no token table; idempotent + low-stakes (worst case = re-suppress). `UNSUBSCRIBE_SECRET` is a new prod env var — set it on the box BEFORE deploy (the SEC-3 env-var deploy-safety lesson).
- **Provider threading is the one real shared-path change** — same surface as the 13-9 campaign-tag plumbing; give it its own focused test (marketing-carries / transactional-omits).
- Confirmation page: minimal (a small HTML response is fine; no SPA route needed) — the GET handler renders "You've been unsubscribed."
- **NDPA:** honoring unsubscribe is positive; only data processed is the email added to the do-not-contact list. Transactional/legal-basis comms remain non-unsubscribable.

## Dev Agent Record
_(empty — populated by the dev agent)_

### File List
_(empty — populated by the dev agent)_

## Senior Developer Review (AI)
_(empty — populated by the code-review workflow)_

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-29 | Story drafted from John's PM brief (canonical *create-story) | Bob (SM) |
