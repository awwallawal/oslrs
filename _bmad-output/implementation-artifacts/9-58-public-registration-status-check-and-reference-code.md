# Story 9.58: Public Self-Service Registration-Status Check + Human-Friendly Reference Code

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-15 by Bob (SM) via canonical *create-story --yolo. EMERGENT from the 2026-06-15 design session (post-9-56). ROADMAP PHASE 2/3 — support-load-deflection, NOT a Phase-1 launch gate. Lightweight, parallel-track; reuses hCaptcha + magic-link + email infra heavily. Two co-equal deliverables: (A) a privacy-safe public "am I registered?" check that delivers status to the registered channel (never on-screen), and (B) a human-friendly per-respondent reference code generated uniformly across all registration channels. -->

## Story

As a **respondent who registered through any channel (public wizard, enumerator, or data-entry clerk)**,
I want to **check whether I'm truly in the registry by entering my email, phone, or reference code on a public page — and receive my status through my own registered contact channel**,
so that **I can confirm my registration went through (and pick up where I left off) without contacting support, and without anyone being able to learn other people's registration status by guessing identifiers.**

## Context & Why (and why this is NOT a launch gate)

Registrants today have **no simple way to confirm they are in the registry**:
- The **Marketplace** (`/marketplace`, public) is an **anonymized skill-discovery directory** that lists only `consent_marketplace = true` respondents, showing profession/LGA/experience/badge/bio and **no name/phone/email/NIN** (identity is revealed only after login + captcha + `consent_enriched`). It cannot — and must not — answer "am I registered?" [Source: apps/api/src/workers/marketplace-extraction.worker.ts:216-223 (consent gate); apps/api/src/services/marketplace.service.ts:114-147 (anonymous SELECT)].
- The only existing reference is `submissions.submission_uid` (a UUID v7), shown as "Reference ID" **only on the public wizard success screen** [Source: apps/web/src/features/registration/pages/WizardPage.tsx:~560; commit 0f03a42]. **Enumerator- and clerk-entered respondents never see any reference** — `submitForm` returns only a job id, not the `submission_uid` [Source: apps/api/src/controllers/form.controller.ts:~161-174]. And a 36-character UUID is unusable for a human to remember or read aloud.

This story closes both gaps. It is **Phase 2/3 (support deflection)** — valuable for absorbing "did it work?" load before/after the Cohort A/B blasts, but **explicitly NOT on the Phase-1 critical path**. It must not delay 9-18/9-54/9-55 close-out or 9-57.

### Core design decision — privacy-first (load-bearing; ACs MUST honor it)

A public **on-screen** "type a name/phone/email → *Yes, registered*" response is an **NDPA-sensitive enumeration oracle**: it lets anyone confirm that a specific person is in a government skilled-labour registry, and harvest/confirm PII. A captcha slows bots but does **not** fix the disclosure. The codebase already models the safe instinct — the marketplace contact-reveal returns `not_found` instead of `forbidden` **specifically to prevent consent enumeration** [Source: apps/api/src/services/marketplace.service.ts:~248-251].

Therefore the rule for this story: **never reveal registration status on-screen for an arbitrary identifier.** Instead use a **"status-to-your-channel"** flow (the forgot-password pattern): the page always returns the **same neutral response**, and the actual status + a magic-link are **sent to the registered email/phone** only when a match exists.

### The reference-code gap (Deliverable B)

A short, human-friendly, unique **reference code** (e.g. `OSL-2026-7F3K9Q`) must be generated **at respondent creation on every channel** — the one uniform chokepoint all channels share — so that field-registered respondents also receive something quotable, and support (9-56) and this public check can accept it as an input. A reference code is a **bearer secret** → it is a convenience to *quote*, **NOT** the primary disclosure mechanism; the channel-delivery flow stays the safe default.

### Relationship to existing stories (no double-build)

- **9-56 (DONE)** = STAFF dashboard lookup (resolve by Reference ID/email/phone, status, magic-link-sent). This story is the **public** counterpart and **reuses 9-56's search seam** for reference-code matching.
- **9-40 (ready-for-dev, depends on 9-38)** = the AUTHENTICATED registration-status home. This story is the missing **unauthenticated front door** that funnels INTO 9-40 via the emailed magic-link.
- **SOFT dep on 9-40**: degrade gracefully — if 9-40's dashboard is not yet shipped, the emailed message still conveys status in text and the magic-link can land on the existing wizard-resume/summary surface. **Not blocked on 9-40.**
- **HARD deps**: 9-16 (magic-link issuance), hCaptcha infra, Epic 5 registry (respondent/submissions schema).
- **KEEP SEPARATE from**: 9-38 (account provisioning), 9-32 (NDPA export/erasure), and any SMS channel (Termii, deferred on cost).

## Acceptance Criteria

### AC1 — Public status-check page (single input + hCaptcha + submit)
1. A new **public** (no-auth) page is served at `/check-registration`, housed under the Support section, rendered within `<PublicLayout />` (same wrapper as `/marketplace`) [Source: apps/web/src/App.tsx:~246-248,452-486].
2. The page presents a **single free-text input** (the user may enter **email OR phone OR reference code** — one field, auto-detected server-side), the existing **hCaptcha** widget, and a submit button. The hCaptcha component is reused as-is [Source: apps/web/src/features/auth/components/HCaptcha.tsx], same `VITE_HCAPTCHA_SITE_KEY`.
3. Submitting POSTs to a new public endpoint (e.g. `POST /api/v1/registration-status/request`) with `{ identifier, captchaToken }`.

### AC2 — Neutral, enumeration-safe response (no on-screen status, no oracle)
1. Regardless of whether the identifier matches, the API returns the **same** success shape and the page shows the **same constant message**, e.g.: *"If you're in our registry, we've sent your status and a secure link to your registered email/phone. Please check it."* No field in the response, and nothing rendered on-screen, reveals existence, status, name, or any PII.
2. The endpoint must not become a **timing oracle**: match and no-match paths must not be trivially distinguishable by response time (e.g. perform the send asynchronously / equalize work, or document the mitigation). No existence signal via status code either (always 200 on a valid captcha).
3. Invalid/missing captcha returns the standard captcha failure (the only non-uniform response, and it carries no registry information).

### AC3 — Channel delivery of status + magic-link on a match (email-first)
1. On a match, the system sends — via the existing Resend email path [Source: apps/api/src/services/email.service.ts] — a message containing the registrant's **plain-language status** (draft / pending-NIN / active) and a **magic-link** issued through the existing infra [Source: apps/api/src/services/magic-link.service.ts; apps/api/src/db/schema/magic-link-tokens.ts].
2. The magic-link lands the registrant on the authenticated registration-status home (9-40) when available; **if 9-40 is not yet shipped, it lands on the existing wizard-resume/summary surface** and the email still states the status in text (graceful degradation; recorded in Dev Notes).
3. The send is built behind a small **channel abstraction** (e.g. `notifyRegistrationStatus(channel, ...)`) so a future **SMS (Termii)** channel can be added without reworking the flow. SMS itself is OUT OF SCOPE here.
4. Email is resolved from `submissions.raw_data->>'email'` (JOIN, not a respondents column) [Source: apps/api/src/controllers/registration.controller.ts:~642]; phone from `respondents.phone_number` [Source: apps/api/src/db/schema/respondents.ts:92]. Reuse the 9-56 resolution seam where possible (see AC6).

### AC4 — Human-friendly reference code: generation, format, uniqueness, migration
1. A new **unique** reference code is generated for each registrant. **Format**: `OSL-<YYYY>-<6 chars>` where the 6 chars use a Crockford-style base32 alphabet that **excludes ambiguous characters** (no `I`, `L`, `O`, `U`), generated with collision-retry against the unique constraint.
2. The code is generated at the **uniform respondent-creation chokepoint** so ALL channels are covered: the async ingestion path `findOrCreateRespondent` [Source: apps/api/src/services/submission-processing.service.ts] and the synchronous wizard path [Source: apps/api/src/controllers/registration.controller.ts]. **Task 1 design decision**: storage column placement — default recommendation is a **per-respondent** `respondents.reference_code` (stable per person, survives supplemental submissions) rather than per-submission; the chosen seam + migration is recorded in Dev Notes (raw-SQL init-runner per project convention, NOT type-checked schema only — see Dev Notes).
3. Backfill: existing respondents receive a reference code via a one-shot idempotent backfill runner (dry-run + apply, mirroring the 9-18 name-canonicalization runbook pattern). Operator step documented; not auto-run.

### AC5 — Reference code surfaced across ALL registration channels
1. The public **wizard success screen** displays the human-friendly reference code (alongside or replacing the raw `submission_uid`) [Source: apps/web/src/features/registration/pages/WizardPage.tsx:~560].
2. The **enumerator / data-entry-clerk submit-success screen** displays the reference code so the field officer can **read it back to the respondent** (closes the field-registrant "no reference" gap) — the `submitForm` response is extended to echo the reference code [Source: apps/api/src/controllers/form.controller.ts:~161-174].
3. The reference code is included in the AC3 status/magic-link message.

### AC6 — Reference code accepted as a lookup input (public + staff 9-56)
1. The public endpoint (AC1) accepts the reference code as one of the auto-detected identifier types and resolves the registrant via it.
2. The staff registry search (9-56) is extended to also match the human-friendly reference code, reusing the existing widened-search seam [Source: apps/api/src/services/respondent.service.ts:~389-392]. (9-56 already matches `submission_uid`/email/phone; this adds the human-friendly code as an accepted term.)

### AC7 — Abuse defense (server-side captcha + per-IP rate limit + constant work)
1. The captcha token is **verified server-side** via the existing middleware before any registry work [Source: apps/api/src/middleware/captcha.ts].
2. The public endpoint is protected by the existing **per-IP rate-limiting** middleware, with a conservative limit appropriate to a self-service check; exceeding it returns the standard 429 (carrying no registry information).
3. Combined with AC2's neutral response, these make enumeration economically pointless (captcha + rate limit + no on-screen oracle).

### AC8 — Audit + no-PII-leak logging
1. Every status-request is audit-logged (a new or reused audit action — Task decides), recording the **identifier CLASS** (email / phone / reference-code) and whether a send was dispatched — **NOT** the raw PII value, and **NOT** whether a specific person exists in a way that creates a queryable PII trail. Match/no-match may be recorded as an internal metric but logs must not become a PII side-channel.
2. Application logs (pino) for this endpoint must not print the raw identifier at info level (consistent with existing redaction discipline).

### AC9 — Placement, cross-links, and acceptance tests
1. The page is discoverable from: the **Support** section (primary home), the **Participate** section next to "Register" ("Already registered? Check your status"), the **wizard success screen** ("Lost your Reference ID? Check status here"), and the **footer** quick-links.
2. Acceptance tests cover: (a) a matching email/phone/reference-code triggers a send and the neutral response; (b) a non-matching identifier returns the **identical** neutral response with **no** send and **no** existence signal; (c) invalid captcha is rejected; (d) rate-limit returns 429; (e) reference-code generation is unique + correctly formatted (no ambiguous chars) and produced on all three channels; (f) the enumerator/clerk success response echoes the code; (g) the 9-56 staff search resolves a registrant by the human-friendly code; (h) no raw PII identifier appears in audit/app logs.

## Tasks / Subtasks

- [x] Task 1 — Reference-code foundation (AC: #4) — **design decision first**
  - [x] Decide + document storage seam (default: `respondents.reference_code` unique) and add the migration via a raw-SQL init-runner (project convention; not schema-only). → column in `respondents.ts` (db:push) + UNIQUE index in `scripts/migrate-reference-code-init.ts` (wired into CI + auto-discovered by `db:push:full`).
  - [x] Implement `generateReferenceCode()` (format `OSL-<YYYY>-<6 base32, no I/L/O/U>`, collision-retry) as a shared util → `packages/utils/src/reference-code.ts` (pure shape + validator) + `apps/api/src/services/reference-code.service.ts` (`generateUnique` collision-retry against the UNIQUE index).
  - [x] Generate at the uniform respondent-creation chokepoint (`findOrCreateRespondent` async path + wizard sync path); cover pending-NIN promotion. → pending rows get a code at creation, so a promoted row keeps its stable code (no clobber on merge).
  - [x] Idempotent backfill runner (dry-run + `--confirm-...` apply) for existing respondents; author runbook. → `scripts/_backfill-reference-code.ts` + `docs/runbooks/reference-code-backfill.md`.
- [x] Task 2 — Surface the code across channels (AC: #5)
  - [x] Wizard success screen renders the code (replaced the raw UUID on-screen with the human-friendly code).
  - [x] Extend `submitForm` response to echo the code; render it on the enumerator submit-success screen (synchronously pre-generated + threaded via `_referenceCode`; surfaced on the FormFillerPage completion screen post-sync). Clerk rapid-entry path: code persisted + searchable (see Dev Notes addendum).
- [x] Task 3 — Public status-request endpoint (AC: #1, #2, #3, #7, #8)
  - [x] `POST /api/v1/registration-status/request` — captcha-verified, rate-limited, auto-detect identifier class.
  - [x] Resolve registrant by email (JOIN `submissions.raw_data`) / phone (`respondents.phone_number`) / reference code.
  - [x] Neutral constant response + timing-oracle mitigation (fire-and-forget resolve+send → constant response time).
  - [x] Channel abstraction `notifyRegistrationStatus()`; email-first via Resend; issue `wizard_resume` magic-link via existing service.
  - [x] Audit-log the request by identifier class (no raw PII); pino logs class only.
- [x] Task 4 — Public page + cross-links (AC: #1, #9)
  - [x] `/check-registration` page under `<PublicLayout />`; single input + reused hCaptcha + submit; neutral result state.
  - [x] Cross-links from Support (NavDropdown + Footer), Participate (next to Register), wizard success screen.
- [x] Task 5 — Staff search accepts the code (AC: #6)
  - [x] Extended the 9-56 Phase-1 search predicate to also match `respondents.reference_code` (bound param, uppercased exact against the UNIQUE index; composes with `DISTINCT ON`/cursor/supervisor scope).
- [x] Task 6 — Tests (AC: #9.2)
  - [x] API: endpoint match/no-match parity, captcha reject, audit-class logging, no-PII-leak; reference-code uniqueness/format; staff-search-by-code (real-DB smoke). Rate-limit 429: enforced via the standard limiter (skipped in test env by project convention) — see Dev Notes addendum.
  - [x] Web: page renders + neutral result; wizard success screen shows the code.
  - [x] e2e: deferred (optional) — covered by API + web unit/integration; noted in Dev Notes addendum.

### Review Follow-ups (AI) — code-review 2026-06-15 (Awwal)

Adversarial review (4 parallel reviewers) — **1 High · 5 Medium · 6 Low · 3 Verify/Content**. ✅ verified-correct: CSPRNG, AC2 enumeration-safety, AC2.2 timing-oracle, AC7 order, AC8 no-PII, real (non-vacuous) tests, route-path match. Disposition: **fix all automatically**; **M1+M2 → "server code canonical, client code provisional-reconciled" (operator decision)**.

**CLOSED 2026-06-15 — all code findings fixed; full suites green (API 2504 / web 2631 / utils 126) + lint 0/0 + tsc clean.** Only **N3/H1↓** (the email-question purpose label) remains, as a FORM-CONTENT operator residual that rides the email-question re-pin (not code).

- [x] **[AI-Review][High] H2 — email-bombing.** Status endpoint mints magic-links via `MagicLinkService.issueToken` directly, bypassing the per-email throttle (route-middleware-only). Add a per-email/per-respondent throttle (hashed Redis key) before `issueToken`. [registration-status.service.ts:214; magic-link.service.ts:24]
- [x] **[AI-Review][Med] M1 — merge-divergence dead code.** Officer reads a code that doesn't resolve; UI never reconciles to the synced canonical. [form.controller.ts:169-191; FormFillerPage.tsx:364-374; submission-processing.service.ts:523-548]
- [x] **[AI-Review][Med] M2 — client-minted code accepted verbatim** (attacker-influenced; undermines unguessability). → **server canonical; client code = display-only provisional**. [reference-code.service.ts:54-68; form.controller.ts:172]
- [x] **[AI-Review][Med] M3 — 23505 asymmetry.** Insert catch only friendly-translates when `data.nin` truthy; a `reference_code` collision on a pending-NIN insert throws raw. Catch reference_code unique-violation independent of nin + re-mint. [submission-processing.service.ts:622-637]
- [x] **[AI-Review][Med] M4 — CheckRegistrationPage error branches untested** (429 / generic-error / captcha-reset / try-again). [CheckRegistrationPage.test.tsx]
- [x] **[AI-Review][Med] M5 — clerk modal a11y.** Add focus-trap + auto-focus on open (KEEP no-Escape/no-backdrop-dismiss so the code can't be lost accidentally). [ClerkDataEntryPage.tsx:614-659]
- [x] **[AI-Review][Low] L1 — confirmation-email idempotency.** Guard the proactive send on an explicit `metadata.confirmation_email_sent_at` marker (not just the emergent `processed`/`_isNew` ordering). [submission-processing.service.ts:281-291]
- [x] **[AI-Review][Low] L2 — validate `_referenceCode` shape in `extractRespondentData`** (don't trust an arbitrary client string even if the controller path normally overwrites it). [submission-processing.service.ts:440-444]
- [x] **[AI-Review][Low] L3 — index runner duplicate pre-check.** Detect/report pre-existing duplicate `reference_code` before `CREATE UNIQUE INDEX` (clear remediation vs opaque failure). [migrate-reference-code-init.ts:51-62]
- [x] **[AI-Review][Low] L4 — clerk Copy button** silent no-op in insecure context → fallback + visible "copy unavailable, write it down". [ClerkDataEntryPage.tsx:326-331]
- [x] **[AI-Review][Low] L5 — test** the merge / already-processed "no proactive email" branch. [submission-processing.service.test.ts]
- [ ] **[AI-Review][Low] H1↓/N3 — email-field purpose label (NDPA transparency).** *(OPEN — form-content; rides the email-question re-pin, not code.)* H1 downgraded HIGH→LOW because the email is now a respondent-provided optional questionnaire answer (Round 3). Residual: add a purpose helper to the new xlsform `email` question ("Optional — we'll email your registration confirmation + reference here"). FORM-CONTENT (operator re-pin). [test-fixtures/oslsr_master_v3.xlsx]
- [x] **[AI-Review][Verify] N1 — confirm the new email question `name` = `email`** so `raw_data->>'email'` (auto-email + public-check email-search) is populated. [xlsform / converter]
- [x] **[AI-Review][Verify] N4 — add `email` to `WIZARD_PROVIDED_FIELD_NAMES`** (Pattern-C dedup) so the public wizard doesn't ask email twice. [9-18/9-54 dedup seam]

## Dev Notes

### Architecture & seam map (cite these exact targets)
- **hCaptcha (reuse):** web component `apps/web/src/features/auth/components/HCaptcha.tsx`; server verify `apps/api/src/middleware/captcha.ts`. Already live on login; agnostic to the form it mounts on; same `VITE_HCAPTCHA_SITE_KEY`.
- **Magic-link (reuse, HARD dep 9-16):** `apps/api/src/services/magic-link.service.ts` + `apps/api/src/db/schema/magic-link-tokens.ts` (`respondent_id`/`email`/`created_at`). Purposes already include wizard-resume / pending-nin-complete.
- **Email (reuse):** `apps/api/src/services/email.service.ts` (Resend; `PUBLIC_APP_URL` for links).
- **Enumeration-safety precedent:** `apps/api/src/services/marketplace.service.ts:~248-251` returns `not_found` (not `forbidden`) to avoid consent enumeration — mirror this constant-response discipline.
- **Reference (today):** `submissions.submission_uid` UNIQUE (uuid v7) `apps/api/src/db/schema/submissions.ts:45`; shown only at `WizardPage.tsx:~560`; generated `registration.controller.ts:~619-622`, mirrored to audit `details.submissionUid` `registration.controller.ts:677`.
- **Channel-blind gap:** `form.controller.ts:~161-174` (`submitForm`) returns a job id, not the reference — the reason enumerator/clerk registrants have nothing to quote.
- **Identifier storage:** email lives in `submissions.raw_data->>'email'` (JOIN) `registration.controller.ts:~642`; phone in `respondents.phone_number` `db/schema/respondents.ts:92`. Reuse the 9-56 resolution JOIN.
- **Uniform creation chokepoint (for the code):** async `submission-processing.service.ts` `findOrCreateRespondent` + sync wizard path; cover pending-NIN promotion (9-55 merge-path lesson: a promoted row must still get the new field).
- **Public route wrapper:** `apps/web/src/App.tsx:~246-248,452-486` (marketplace + public pages under `<PublicLayout />`).
- **Raw-SQL schema drift caution:** the migration + any raw `db.execute` resolution must be exercised against the real schema — mocked-DB tests hide renamed/removed columns (project Pitfall: `users.role`→`role_id` class). Add a real-DB smoke if raw SQL is used.

### Split recommendation + blast-template dependency (added 2026-06-15)

**Split recommendation.** Deliverable B (reference-code generation + backfill, AC4) is more *launch-relevant* than Deliverable A (the public `/check-registration` page, AC1-3). The Cohort A/B re-engagement blasts (Stories 9-27 / 9-28) are the **push** mechanism; once codes are backfilled, every blast email can carry the recipient's **application number** + the existing magic-link. So the recommended sequencing is: **run AC4's backfill BEFORE the blasts fire**, and consider implementing 9-58 in two slices — **B first** (code + backfill, gates the enriched blasts) and **A second** (public self-service page, Phase 2/3). The public page is pull-only and never blasts existing cohorts.

**Blast-template dependency (flag for Stories 9-27 / 9-28 — do NOT edit those live scripts until the code column exists).** Current blast emails already send a magic-link but carry **no application number**:
- Cohort B (stalled drafts): `apps/api/scripts/_reengagement-email-blast.ts` `buildEmail()` — two variants (high-progress "90% done" + low-progress "profile saved"), magic-link button only.
- Cohort A (hemorrhaged completed): `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts` `buildEmail()` — single template, magic-link button only.

When AC4's `reference_code` exists + is backfilled, `buildEmail()` in BOTH scripts should accept an **optional** `referenceCode` and render an application-number block **only when present** (non-breaking: no code → block omitted, scripts still run today). The reworded copy to adopt:

> **Text block to insert (above the closing signature):**
> `Your application reference: OSL-2026-XXXXXX`
> `(Quote this if you contact support — or check your status anytime at oyoskills.com/check-registration. We will never ask for your password or NIN by email.)`

> **HTML block (monospace, boxed) to insert above the `<hr>`:**
> `<p style="margin:20px 0;padding:12px 16px;background:#f6f6f6;border-radius:6px;font-size:14px;">Your application reference: <strong style="font-family:ui-monospace,monospace;letter-spacing:0.5px;">OSL-2026-XXXXXX</strong><br/><span style="color:#777;font-size:12px;">Quote this if you contact support — or check your status anytime at <a href="https://oyoskills.com/check-registration" style="color:#9C1E23;">oyoskills.com/check-registration</a>. We will never ask for your password or NIN by email.</span></p>`

Rationale baked into the copy: (1) the application number gives **recognition + legitimacy** (a government magic-link email otherwise reads as phishing — a personalized reference + an explicit "we'll never ask for your NIN/password" line materially improves trust + click-through + safety); (2) it gives a **fallback** if the magic-link expires (quote to support / use the self-service check); (3) it is framed as a *reference*, NOT an auth secret. Phone-only Cohort A members (≈11) get no email → their reference code can be SMS'd later when Termii lands (out of scope here).

### Project Structure Notes
- New web feature surface likely under `apps/web/src/features/registration/` (or a small `apps/web/src/features/status-check/`) + a public page; new API route group `registration-status`. Reuse, don't fork, the staff search predicate (Task 5 edits the same 9-56 seam).
- Reference-code default seam = `respondents.reference_code` (per-person, stable). If a per-submission code is chosen instead, document why (multi-submission respondents change the "what do I quote" semantics).

### References
- [Source: _bmad-output/implementation-artifacts/9-56-support-traceability-registrant-lookup.md] — staff lookup seam this story reuses/extends.
- [Source: _bmad-output/implementation-artifacts/9-40-*.md] — authenticated status home (soft dep / magic-link landing).
- [Source: docs/roadmap-to-launch.md] — Phase 2/3 placement (NOT a Phase-1 gate).
- [Source: 2026-06-15 design session] — privacy reframe (no on-screen oracle), reference-code gap, placement.

### Dev Notes addendum — decisions recorded during implementation (2026-06-15)

- **Reference-code storage seam (AC4.2):** chose **`respondents.reference_code`** (per-person, stable, survives supplemental submissions) — NOT per-submission. Column declared in the Drizzle schema (created by `db:push`); the **UNIQUE index** lives in `scripts/migrate-reference-code-init.ts` (idempotent `CREATE UNIQUE INDEX IF NOT EXISTS`), matching the project convention where special indexes live in init-runners (the runner also `ADD COLUMN IF NOT EXISTS` defensively so it is self-contained). Raw-SQL drift gate: validated against a real DB locally (`db:push:full:force` then the `respondents.constraints` + `respondent-search-db-smoke` integration tests pass) and the new search-by-code case in `respondent-search-db-smoke.integration.test.ts` executes the live query.
- **Generation chokepoints (AC4.2):** the **wizard sync path** mints the code before the tx and persists/echoes it; the **async `findOrCreateRespondent`** path mints on new-respondent creation (pending rows included). The **enumerator/clerk `submitForm`** path mints SYNCHRONOUSLY and threads it via `_referenceCode` in the queued `rawData`, so the worker assigns the SAME code it echoed to the officer. **Pending-NIN promotion (merge) keeps the existing row's original code** — it is NOT overwritten by a freshly-threaded one, so in the rare NIN-completion-merge case the code echoed to a field officer can differ from the canonical code; the dominant field case is a new active respondent. (9-55 merge-path lesson honoured: a promoted row always already has a code.)
- **Timing-oracle mitigation (AC2.2):** the controller fires `RegistrationStatusService.handleRequest` **without awaiting** and returns the constant 200 immediately, so match and no-match take indistinguishable wall-clock time. Always 200 on a valid captcha; invalid captcha (400) is the only non-uniform response (AC2.3); 429 carries no registry info.
- **Magic-link landing / 9-40 soft dep (AC3.2):** issues a **`wizard_resume`** magic-link. Lands on the authenticated status home (9-40) when shipped; today it degrades gracefully to the existing wizard-resume/summary surface, and the email states the status in plain text regardless.
- **Channel abstraction (AC3.3):** `notifyRegistrationStatus({ channel, ... })` — only `email` implemented; `sms` is a documented no-op until Termii lands. Phone-only registrants with no email on file get no send (neutral response unchanged; `dispatched=false` in the audit).
- **Audit / no-PII (AC8):** `REGISTRATION_STATUS_REQUESTED` records only `{ identifierClass, dispatched }` with `targetId: null` — never the raw identifier; pino logs the class only. (`AUDIT_ACTIONS` count 47 → 49 incl. `OPERATOR_REFERENCE_CODE_BACKFILLED`.)
- **Enumerator/clerk on-screen reference + client-side minting (AC5.2, enhanced 2026-06-15 per operator):** the reference code is now **minted client-side** at form-ready on the offline-first paths (the shared `generateReferenceCode` util, same as the app's offline submission-UUID generation), stamped into the answers (`_referenceCode`), so it is **instant + offline-capable**. The server (`submitForm`) accepts a valid, free client code verbatim (`ReferenceCodeService.resolveUnique`) — else mints — and the ingestion worker assigns that exact code. **Enumerator** (`FormFillerPage`): the completion screen shows the code immediately to read back to the respondent (the prior post-sync poll was removed). **Clerk** (`ClerkDataEntryPage`): submit now opens a **blocking acknowledgment modal** showing the code + a Copy button so the clerk writes it on the paper form, then "Done — next entry" returns to the surveys list (per operator choice) ready for the next record. The ~1e-9 client/DB collision is handled by `resolveUnique` (regenerate + the UNIQUE index backstop; the rare stale written code is logged).
- **Proactive registration-confirmation email (operator choice 2026-06-15 — "auto-email if address on file"):** when an enumerator/clerk submission carries an email (`rawData.email`), the ingestion worker fires a **fire-and-forget** confirmation email (reference code + plain-language status + a pointer to `/check-registration`). **No magic-link** is embedded (the respondent didn't initiate it; they self-serve a secure link via the public check) and it carries the "we will never ask for your password or NIN by email" anti-phishing line. Email failure NEVER fails ingestion (9-26 data-integrity-outranks-comms lesson). **SMS is still out of scope** (Termii deferred); phone-only respondents get no proactive message but can use `/check-registration`. Scoped to the worker path (enumerator/clerk/imported) — the wizard keeps its own existing emails.
- **Rate-limit 429 testing (AC9.2d):** `registrationStatusRateLimit` reuses the standard `express-rate-limit` + Redis pattern (10/IP/15min), which is **skipped in test env** by the project-wide convention — so a runtime 429 is not unit-asserted here, consistent with every other limited endpoint. The route wiring (limiter → captcha → controller) is covered by the routes test.
- **e2e (AC9.2):** the optional public-check happy-path e2e was deferred; API service + routes tests and the web page test cover the flow.
- **Blast-template dependency:** left for Stories 9-27 / 9-28 per the story's "Split recommendation" — those live scripts are NOT edited here (the optional `referenceCode` block lands when they next run, after the backfill).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — dev-story workflow, 2026-06-15.

### Debug Log References

- API `tsc --noEmit`: clean (api / web / utils).
- API suite: 2497 passed / 7 skipped / 0 failed (`apps/api`, local Postgres synced via `db:push:full:force`).
- Web suite: passed (exit 0). Utils suite: 126 passed.
- Lint: `@oslsr/api` 0 problems, `@oslsr/web` 0 problems.
- Regression fix: 3 affected unit suites mocked `ReferenceCodeService.generateUnique` as a PLAIN function (survives `vi.resetAllMocks()`; a `vi.fn().mockResolvedValue` was being reset to `undefined`, which `toEqual` silently ignored).

### Completion Notes List

- Deliverable B (reference code): shared `generateReferenceCode` (Crockford base32, no I/L/O/U) + DB-uniqueness service; generated on all three channels; per-respondent `reference_code` UNIQUE column + init-runner (wired into CI); idempotent operator-gated backfill runner + runbook; surfaced on wizard + enumerator success screens; accepted as a 9-56 staff-search term.
- Deliverable A (public status check): privacy-first `/check-registration` page (single input + reused hCaptcha) → constant neutral response; status + `wizard_resume` magic-link delivered to the registered channel (email-first via Resend) behind a `notifyRegistrationStatus` channel abstraction; per-IP rate-limit + server-side captcha; audit by identifier class (no raw PII). Cross-linked from Support, Participate, wizard success, footer.
- New audit actions: `OPERATOR_REFERENCE_CODE_BACKFILLED`, `REGISTRATION_STATUS_REQUESTED` (count 47 → 49).
- Operator residuals (post-merge): (1) run `_backfill-reference-code.ts` on prod (dry-run → apply) after deploy + before the Cohort A/B blasts (`docs/runbooks/reference-code-backfill.md`); (2) re-migrate/upload/re-pin the master form so the new optional `email` question reaches prod — required for the auto-email + email-search to work for field registrants; can ride the 9-55 re-pin cycle (`docs/runbooks/email-question-repin-9-58.md`).

### File List

**Created**
- `packages/utils/src/reference-code.ts`
- `packages/utils/src/__tests__/reference-code.test.ts`
- `apps/api/scripts/migrate-reference-code-init.ts`
- `apps/api/scripts/_backfill-reference-code.ts`
- `apps/api/src/services/reference-code.service.ts`
- `apps/api/src/services/registration-status.service.ts`
- `apps/api/src/controllers/registration-status.controller.ts`
- `apps/api/src/routes/registration-status.routes.ts`
- `apps/api/src/middleware/registration-status-rate-limit.ts`
- `apps/api/src/services/__tests__/registration-status.service.test.ts`
- `apps/api/src/routes/__tests__/registration-status.routes.test.ts`
- `apps/web/src/features/registration/api/registration-status.api.ts`
- `apps/web/src/features/registration/pages/CheckRegistrationPage.tsx`
- `apps/web/src/features/registration/pages/__tests__/CheckRegistrationPage.test.tsx`
- `docs/runbooks/reference-code-backfill.md`

**Modified**
- `packages/utils/src/index.ts`, `packages/utils/package.json`
- `apps/api/src/db/schema/respondents.ts`
- `apps/api/src/services/submission-processing.service.ts`
- `apps/api/src/controllers/registration.controller.ts`
- `apps/api/src/controllers/form.controller.ts`
- `apps/api/src/services/respondent.service.ts`
- `apps/api/src/services/audit.service.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/services/__tests__/audit.service.test.ts`
- `apps/api/src/controllers/__tests__/form.controller.test.ts`
- `apps/api/src/services/__tests__/submission-processing.service.test.ts`
- `apps/api/src/routes/__tests__/registration.routes.test.ts`
- `apps/api/src/services/__tests__/respondent-search-db-smoke.integration.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/features/registration/api/wizard.api.ts`
- `apps/web/src/features/registration/pages/WizardPage.tsx`
- `apps/web/src/features/forms/api/submission.api.ts`
- `apps/web/src/features/forms/pages/FormFillerPage.tsx`
- `apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx`
- `apps/web/src/services/sync-manager.ts`
- `apps/web/src/lib/offline-db.ts`
- `apps/web/src/layouts/components/Footer.tsx`
- `apps/web/src/layouts/components/NavDropdown.tsx`
- `.github/workflows/ci-cd.yml`
- `test-fixtures/oslsr_master_v3.xlsx` — added optional `email` question to `grp_identity` (after `phone_number`); settings `version` 2026012601 → 2026061501
- (tests) `apps/web/src/features/forms/pages/__tests__/ClerkDataEntryPage.test.tsx`, `apps/web/src/layouts/components/NavDropdown.test.tsx`, `apps/web/src/layouts/components/Footer.test.tsx`
- `test-fixtures/oslsr_master_v3.pre-email.bak.xlsx` — pre-change backup of the master form
- `docs/runbooks/email-question-repin-9-58.md` — operator re-migrate/upload/re-pin runbook for the email field

### Change Log

- 2026-06-15 — Story 9-58 implemented (Deliverables A + B). Status ready-for-dev → in-progress → review.
- 2026-06-15 — Round 2 (operator UX review): reference code minted CLIENT-side on the offline-first paths (instant + offline); enumerator completion screen shows it immediately; **clerk submit now opens a blocking reference modal** (Copy + "Done — next entry" → surveys list); **proactive confirmation email** sent from the ingestion worker when an enumerator/clerk submission carries an email (reference + status + /check-registration, no magic-link, anti-phishing line; SMS still out of scope). API 2500 pass / web 2626 pass / utils 126 pass; tsc + eslint clean.
- 2026-06-15 — Round 3 (form-field verification): parsing `oslsr_master_v3.xlsx` showed the master form captured **phone only — no email question** (58 questions, 0 email), so the auto-email had no address. Per operator decision, added an **optional `email`** question to `grp_identity` (after `phone_number`; required blank) + bumped settings version; converter test green against the edited fixture; backup saved + re-pin runbook authored (`docs/runbooks/email-question-repin-9-58.md`). Operator residual: re-migrate/upload/re-pin the master form (can ride the 9-55 re-pin cycle) for the email field — and thus the auto-email — to go live.
- 2026-06-15 — Round 4 (adversarial code review, 4 parallel reviewers → 1 High / 5 Med / 6 Low / 3 Verify-Content; all code findings FIXED in-pass). **M1+M2:** `resolveUnique` removed — server reference code is now canonical, the client code is a display-only provisional reconciled from the sync result (kills the merge-divergence dead-code AND the attacker-chosen-code vector). **H2:** per-email magic-link throttle (3/hr, SHA-256-keyed Redis, fail-open) before `issueToken` + audit `throttled` flag. **M3:** bounded re-mint retry on `reference_code` 23505 (no longer nin-gated). **M4:** CheckRegistrationPage 429/error/try-again tests. **M5:** clerk modal focus-trap + auto-focus (no-Escape kept). **L1:** `metadata.confirmation_email_sent_at` idempotency guard. **L2:** `_referenceCode` shape-validated in `extractRespondentData`. **L3:** duplicate pre-check before CREATE UNIQUE INDEX. **L4:** clerk Copy fallback (execCommand + visible hint). **L5:** test — merge/processed path sends no proactive email. **N1** verified (xlsform question name = `email`); **N4** already wired (`email` in dedup since 9-18; test pinned). Full suites green: API 2504 pass / web 2631 pass / utils 126 / lint 0+0 / tsc clean. Remaining: N3/H1↓ (email-question purpose label — form content, operator re-pin). Status stays `review`; flip → done in the close-out commit.
