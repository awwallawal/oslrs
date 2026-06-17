# Story 9.38: Wizard Public-User Account Provisioning (close the magic-link login reachability gap)

Status: done

<!--
Authored 2026-06-03 by Bob (SM) via canonical *create-story --yolo workflow.

Carved out of a gap surfaced during Story 9-16 (magic-link login) code review +
Winston's ADR-015 amendment (2026-06-03). Story 9-16 shipped a working
public-user magic-link sign-in channel — but tracing it revealed there is NO
production runtime path that creates `public_user` rows anymore:

  - Legacy `/auth/public/register` (self-registration) — RETIRED in Story 9-12.
  - Google OAuth account creation — RETIRED in Story 9-12.
  - The public wizard (`POST /registration/wizard`) creates a `respondents`
    row ONLY — never a `users` row [Source: apps/api/src/controllers/registration.controller.ts:468 (submitWizard)].
  - Verified 2026-06-03: the only non-test `.insert(users)` call sites are
    `db/seeds/index.ts` (seed) and `staff.service.ts` (staff invites → staff
    roles). No public_user runtime factory exists.

Consequence: magic-link login (9-16) AND password login (`/auth/public/login`)
are unreachable for EVERY respondent who registered via the wizard after 9-12.
The "forward-compatible with future passwordless wizard accounts" property that
9-16 was built around is aspirational until THIS story wires it. This story is
also a HARD prerequisite for Story 9-32 (public account settings / NDPA rights),
which assumes a `users` row exists for a public respondent.

ADR-015 amendment (2026-06-03, architecture.md) flags this as the open decision:
"wizard-account creation — emit a passwordless public_user row at wizard submit
so new respondents gain a durable account."

Next free slot in Epic 9: 9-37 is the highest existing key; 9-38 is next.
-->

## Story

As a **member of the public who completed the registration wizard and gave an email address**,
I want **a durable account created for me automatically (no extra step)**,
So that **I can return later and sign in with a magic link to view or complete my registration — instead of being locked out because no account was ever created**.

## Acceptance Criteria

1. **AC#1 — Passwordless `public_user` provisioned at wizard submit when an email is present.** In `AuthService` (new method, e.g. `provisionPublicUserForWizard`) called from `RegistrationController.submitWizard` [Source: apps/api/src/controllers/registration.controller.ts:468], when the wizard submission carries a non-empty email, the system creates a `users` row with `roleId = public_user`, `passwordHash = NULL` (passwordless — magic-link only; aligned with Story 9-16's no-`passwordHash`-gate forward-compat), `fullName` derived from the wizard identity fields, `status = 'active'`, `authProvider = 'email'`. Creation is **email-presence-driven, NOT gated on an auth-method choice** — Story 9-18 retires the step-5 magic-link/password choice from the wizard, so provisioning must not depend on it.

2. **AC#2 — Idempotent by email (no duplicates, no clobber).** If a `users` row already exists for the (lowercased, trimmed) email — e.g. a legacy public_user, or a re-submit — the provisioning step **links to the existing row and makes no destructive change** (does NOT overwrite `passwordHash`, `status`, `fullName`, or role). Email uniqueness is already enforced at the DB (`users.email` UNIQUE [Source: apps/api/src/db/schema/users.ts:8]); the provisioning path must catch the conflict gracefully (TOCTOU-safe: `onConflictDoNothing` / catch-unique-violation, then re-read).

3. **AC#3 — Durable respondent↔account link via a new `respondents.user_id` FK.** `respondents` currently has NO `user_id` and NO `email` column [Source: apps/api/src/db/schema/respondents.ts:83-127], so there is no way to associate a wizard respondent with its account. Add a nullable `respondents.user_id uuid REFERENCES users(id) ON DELETE SET NULL` via a hand-rolled idempotent migration (matching the project's migration pattern), set it at provisioning time. Magic-link login itself is UNCHANGED — it still looks up `users` by email [Source: apps/api/src/services/auth.service.ts loginByMagicLinkToken] — the FK exists for downstream consumers (Story 9-32 "show me my respondents row").

4. **AC#4 — Wizard submit stays resilient: account provisioning is non-fatal.** Provisioning runs inside `submitWizard` AFTER the `respondents` row is committed and MUST NOT roll back or fail the wizard submission if account creation throws (mirror the fire-and-forget discipline of audit logging at [Source: apps/api/src/services/auth.service.ts createLoginSession audit block]). A provisioning failure is logged (`event: 'wizard.account_provision_failed'`) and surfaced in `respondents.metadata` (e.g. `account_provision_failed: true`) for later backfill — the respondent's survey data is never lost to an auth-side error (lesson: unified-ingestion / 9-26 data-integrity discipline).

5. **AC#5 — Email verification semantics.** A wizard-provisioned account is created `status = 'active'` (the respondent supplied the email themselves; first magic-link click further proves ownership). Do NOT create as `pending_verification` — that status gates flows this channel doesn't use, and magic-link redemption is itself the proof-of-ownership. Document the decision in Dev Notes; if Iris (counsel) requires an explicit verification gate for NDPA, downgrade to `pending_verification` + promote on first successful magic-link login (fallback design captured in Dev Notes).

6. **AC#6 — Operator-gated backfill for existing post-9-12 respondents.** A `scripts/_backfill-wizard-public-users.ts` one-off (dry-run by default, `--confirm` to write, matching `scripts/_seed-test-public-user.ts` conventions) that finds wizard-source respondents (`source = 'public'`) with no linked `user_id` and a recoverable email (from `wizard_drafts.email` and/or `submissions.rawData.email`), and provisions accounts for them idempotently. Because `respondents` has no email column, the backfill MUST document where it recovers email from and how it handles respondents with no recoverable email (skip + count). NIN/pending-NIN respondents are included (an account lets them return to complete NIN).

7. **AC#7 — NDPA / counsel pre-implementation review (Iris).** Creating a persistent authentication account from wizard-submitted data touches NDPA Article 5/12. Task 1 is an Iris review: confirm Step-1 wizard consent [Source: _bmad-output/planning-artifacts/architecture.md ADR-015 "Step 1 — Welcome & consent"] covers durable-account creation, and align with Story 9-32's erasure/retention model (an erased respondent's account must also be deactivated/erased). No new consent checkbox unless Iris requires one.

8. **AC#8 — Tests + zero regression.** New unit tests for `provisionPublicUserForWizard` (creates passwordless public_user; idempotent on existing email — no clobber; sets `respondents.user_id`; non-fatal on throw). New `submitWizard` integration coverage asserting (a) account created when email present, (b) NO account when email absent, (c) wizard still succeeds when provisioning throws. Migration smoke (column exists, FK + ON DELETE SET NULL). Backfill script unit tests (dry-run prints, idempotent, skips unrecoverable-email rows). Full API + web suites green; no behaviour drift in `submitWizard`'s existing respondents-creation path or in 9-16 magic-link login.

10. **AC#10 — `GET /me/registration-status` read-model (shared spine for 9-39 + 9-40).** New authenticated endpoint returning the caller's registration state for the public-user journey: `{ state: 'none' | 'draft' | 'pending_nin' | 'complete', draftStep?: number, draftTotalSteps?: number, respondent?: { id, status, lgaId, ninStatus, consentMarketplace, ...summary } }`. Resolves the respondent via the new `respondents.user_id` link (AC#3), falling back to a wizard-draft lookup by the user's email for the `draft` state. This is the single source of truth the dashboard (Story 9-40 state machine) and the entry wrong-door recovery (Story 9-39 AC#4) both read. Anti-enumeration: only returns the *caller's own* status (auth required); never accepts an arbitrary email. +unit/route tests for each state.

9. **AC#9 — Fix the new-registrant landing-page copy (folded from the 9-16 review).** Story 9-16's `MagicLinkLandingPage` `loginFriendlyErrorCopy` renders, on `AUTH_INVALID_CREDENTIALS` (user-not-found), *"We couldn't find an account for this email. The link may have been issued to an old address."* [Source: apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx loginFriendlyErrorCopy]. That copy is wrong for the dominant real case — a person who **never registered** typing their email at `/login` → "send me a sign-in link" (the request endpoint emails a link unconditionally for anti-enumeration). Change the copy to guide them to register: title "Let's get you registered first", body "We couldn't find an account for that email. If you haven't registered yet, start here.", and add a `/register` CTA (mirror the existing `showSupport` link pattern). This is a permanent UX fix (not just a pre-9-38 band-aid): after 9-38, wizard registrants have accounts, but a genuinely-unregistered visitor still hits this path. ~5-line copy + one CTA; +1 landing-page test asserting the register link renders on `AUTH_INVALID_CREDENTIALS`.

## Tasks / Subtasks

- [x] **Task 1 — Iris (counsel) NDPA pre-implementation review (AC: #7)**
  - [x] 1.1 Confirm Step-1 wizard consent covers durable-account creation; capture verdict in Dev Notes.
  - [x] 1.2 Align account lifecycle with Story 9-32 erasure/retention (erased respondent ⇒ account deactivated/erased).
- [x] **Task 2 — Migration: add `respondents.user_id` FK (AC: #3)**
  - [x] 2.1 Hand-rolled idempotent migration `migrate-respondents-user-id-init.ts` (nullable `uuid` FK → `users(id)` `ON DELETE SET NULL`); guarded ADD COLUMN/CONSTRAINT/INDEX; wired into CI + db:push:full auto-discovery. Applied locally.
  - [x] 2.2 Add the column to `apps/api/src/db/schema/respondents.ts` + index `idx_respondents_user_id`.
- [x] **Task 3 — `AuthService.provisionPublicUserForWizard` (AC: #1, #2, #5)**
  - [x] 3.1 Tests: passwordless create; idempotent-no-clobber on existing email; status='active'; returns the user id. (`auth.provision-public-user.test.ts`, 3 tests)
  - [x] 3.2 Implement: look up public_user role id; `insert(users)` passwordless with `onConflictDoNothing` on email; re-read on conflict; return id.
- [x] **Task 4 — Wire into `submitWizard` (AC: #1, #3, #4)**
  - [x] 4.1 After the `respondents` row commits, if email present → call provisioning; set `respondents.user_id`.
  - [x] 4.2 Wrap non-fatally: on throw, log `wizard.account_provision_failed` + set `metadata.account_provision_failed=true`; wizard still returns success.
  - [x] 4.3 Integration tests: account-when-email / no-account-when-absent (400 before provisioning) / wizard-survives-provision-throw. (`registration.routes.test.ts`, +3 tests)
- [x] **Task 5 — Backfill script (AC: #6)**
  - [x] 5.1 `scripts/_backfill-wizard-public-users.ts` (dry-run default, `--apply --confirm-i-am-not-dry-running`, `--help`); recover email from `submissions.raw_data->>'email'` (drafts not joinable to a respondent — documented); idempotent; skip+count unrecoverable.
  - [x] 5.2 Unit tests for arg-parse + partition (skip path) + name derivation. (`scripts/__tests__/_backfill-wizard-public-users.test.ts`, 10 tests)
- [x] **Task 6 — `GET /me/registration-status` read-model (AC: #10)** _(shared spine for 9-39 + 9-40)_
  - [x] 6.1 Service: resolve caller's state (none/draft/pending_nin/complete) via `respondents.user_id`, falling back to wizard-draft-by-email for `draft`.
  - [x] 6.2 Authenticated route + controller; returns caller's-own status only (anti-enumeration; no arbitrary-email param). Mounted at `/api/v1/me`.
  - [x] 6.3 Unit + route tests for each of the 4 states. (`me.service.test.ts` 4 tests + `me.routes.test.ts` 2 tests)
- [x] **Task 7 — New-registrant landing copy fix (AC: #9)**
  - [x] 7.1 Update `MagicLinkLandingPage` `loginFriendlyErrorCopy` `AUTH_INVALID_CREDENTIALS` branch → "register first" copy + `/register` CTA.
  - [x] 7.2 +1 test: register link renders on `AUTH_INVALID_CREDENTIALS`. (`MagicLinkLandingPage.test.tsx`)
- [x] **Task 8 — Regression sweep + status flip (AC: #8)**
  - [x] 8.1 API + web tsc + lint + full vitest green; document net-new test counts.
  - [ ] 8.2 Re-run `scripts/_list-public-users.ts` (Story 9-16 aid) to confirm new wizard accounts appear. _(OPERATOR-GATED post-deploy: the script lists PROD public_users; there are no live wizard accounts on the local dev DB. Run after deploy + first real wizard submit.)_
- [x] **Task 9 — Code review (per `feedback_review_before_commit.md`)**
  - [x] 9.1 Ran `/bmad:bmm:workflows:code-review` on the uncommitted tree (Opus 4.8, 2026-06-17). 0 HIGH/CRITICAL; all 10 ACs verified implemented + tests re-run green (provision 3 / me.service 4 / me.routes 2 / backfill 10 / registration +3 / web landing 15) + tsc clean. 1 MEDIUM + 5 LOW catalogued below; code fixes applied per the operator's "fix them all" disposition.

### Review Follow-ups (AI)

_Adversarial code review (Opus 4.8, 2026-06-17). 1 MEDIUM, 5 LOW — no CRITICAL/HIGH. Disposition: create action items + auto-fix all._

- [x] [AI-Review][Medium] File List omitted `docs/roadmap-to-launch.md` (modified in git). [9-38 File List] → **Fixed:** added to File List (Modified).
- [x] [AI-Review][Low] `account_provision_failed` flag was inaccurate when the account WAS created but the `respondents.user_id` link-write threw. [registration.controller.ts submitWizard] → **Fixed:** split provisioning vs link error handling; account-created-but-unlinked now flags `account_link_failed` (new `RespondentMetadata` field) + emits `wizard.account_link_failed`. Both flags still route to the backfill (`user_id IS NULL`).
- [x] [AI-Review][Low] Backfill `runApply` preview path did not print the masked sample that `--dry-run` does (inconsistent operator UX). [scripts/_backfill-wizard-public-users.ts runApply] → **Fixed:** preview now prints the same masked `WOULD PROVISION …` sample.
- [x] [AI-Review][Low] Account display-name derivation was triplicated with divergent fallbacks ('Registrant' vs given-name). [registration.controller.ts / auth.service.ts / backfill] → **Fixed:** extracted `buildRegistrantFullName` (`apps/api/src/utils/registrant-name.ts`); controller + backfill delegate to it (service keeps its defensive `|| 'Registrant'` guard on the pre-built name).
- [x] [AI-Review][Low] AC#6 narrowing — email recovery uses only `submissions.raw_data->>'email'`, not `wizard_drafts.email` per the AC's "and/or". → **Accepted by-design:** drafts are deleted on submit + not joinable to a respondent (no recoverable email there); already documented in-script. No code change.
- [x] [AI-Review][Low] `MeService` `draft` state is effectively unreachable via the live wizard (provision + link are coupled at submit; the draft is deleted in the same tx) — the test seeds a synthetic state. → **Accepted by-design:** the fallback is correct + defensive for returning-user/legacy-account edges; flagged for the Story 9-40 consumer. No code change.

## Dev Notes

### Why this story exists (the gap, precisely)

Story 9-16 made magic-link login work — but `loginByMagicLinkToken` looks up an existing `users` row by email and 401s if none exists. Post-9-12, the wizard creates only `respondents`, so new public registrants have no `users` row and cannot log in by ANY channel. This story creates that row. It is the missing half of 9-16 and the hard prerequisite for 9-32.

### Design decisions locked (yolo)

- **Trigger = wizard submit, email-presence-driven.** Not an auth-method choice (9-18 retires that). Passwordless by default; users add a password later via Story 9-32. This is the clean composition: 9-38 creates the account → 9-16 logs them in passwordlessly → 9-32 lets them opt into a password.
- **Link via new `respondents.user_id` FK**, because `respondents` has neither `user_id` nor `email` [Source: apps/api/src/db/schema/respondents.ts:83-127]. Email-only matching is impossible for downstream consumers since the respondent row carries no email.
- **Provisioning is non-fatal to the wizard.** Survey data integrity outranks account creation (9-26 unified-ingestion lesson [[feedback_unified_ingestion_pipeline]]).
- **`status='active'` on create**, with a documented `pending_verification`+promote-on-first-login fallback if Iris requires it (AC#5).

### Constraints discovered 2026-06-03

- `respondents` has no `user_id`, no `email` (only `submitterId` = staff submitter) [Source: apps/api/src/db/schema/respondents.ts:83-127].
- `users.email` is UNIQUE; `passwordHash` is nullable ("Nullable for invited state") [Source: apps/api/src/db/schema/users.ts:8,11].
- `submitWizard` creates the respondent directly, no ingestion pipeline [Source: apps/api/src/controllers/registration.controller.ts:453-468].
- Wizard email lives in `wizard_drafts.email` (pre-account identifier) [Source: apps/api/src/controllers/registration.controller.ts:317-377] and in submission `rawData` — relevant for the backfill (AC#6).

### Dependencies

- **Story 9-16** (magic-link login) — DONE/deployed; the channel this story makes reachable for new registrants.
- **Story 9-18** (wizard NIN-first redesign + auth-choice retirement) — interplay: confirms provisioning is email-driven, not auth-choice-driven. Coordinate trigger placement if 9-18 reshapes `submitWizard`.
- **Story 9-32** (public account settings / NDPA rights) — HARD downstream consumer: needs the `users` row + `respondents.user_id` link this story creates. 9-32 should not ship before 9-38.
- **Story 9-12** (wizard + respondents creation) — the surface being extended.
- **Story 6-1** (audit chain) — provisioning should emit an audit event (reuse an existing `DATA_CREATE`/account action; no new key unless required).

### References

- ADR-015 amendment (2026-06-03) "Magic-link login activation" → open decision "wizard-account creation": [Source: _bmad-output/planning-artifacts/architecture.md ADR-015 "Magic-link login activation (2026-06-03 amendment — Story 9-16)"]
- Story 9-16: [Source: _bmad-output/implementation-artifacts/9-16-magic-link-login.md]
- submitWizard: [Source: apps/api/src/controllers/registration.controller.ts:453-468]
- users / respondents schema: [Source: apps/api/src/db/schema/users.ts; apps/api/src/db/schema/respondents.ts:83-127]
- Story 9-16 UAT aids (conventions for the backfill script): [Source: apps/api/scripts/_seed-test-public-user.ts; apps/api/scripts/_list-public-users.ts]

## Task 1 — Iris (counsel) NDPA pre-implementation review (verdict)

_AI-persona counsel pass (Iris), 2026-06-17, following the Story 10-5 / Operations-Manual ratification pattern. Records the verdict; real-human ratification, if ever required, rides the same shared gate as 10-5._

**1.1 — Does Step-1 wizard consent cover durable-account creation?** YES, with the design as locked. The wizard's Step-1 consent establishes the lawful basis (NDPA Art. 5 — consent + legitimate interest for the Registry's statutory purpose) for processing the registrant's identity. Creating a *passwordless* account is a direct, foreseeable consequence of "register so you can return to view/complete your registration" — the mechanism that realises the registrant's own stated intent, not a new processing purpose. No NEW consent checkbox required. Conditions met by design: the account holds NO data the respondent didn't already supply (email + derived full name); `passwordHash` is NULL (no credential created on the user's behalf); `status='active'` is justified because the respondent self-asserted the email and the first magic-link click re-proves ownership. The AC#5 `pending_verification` fallback was considered and judged unnecessary — magic-link redemption IS the verification event. **Verdict: proceed with `status='active'`.**

**1.2 — Lifecycle alignment with Story 9-32 (erasure/retention).** `respondents.user_id` uses `ON DELETE SET NULL`, so erasing a `users` row never cascade-deletes survey data (correct — survey data has its own retention basis). The reciprocal obligation lands on Story 9-32: an erasure/withdrawal request MUST also deactivate/erase the linked `users` row (resolve via `respondents.user_id`). **Flagged as a 9-32 acceptance condition**; not in 9-38 scope. No blocker for 9-38.

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — dev-story workflow, 2026-06-17.

### Debug Log References

- `wizard.account_provisioned` / `wizard.account_provision_linked_existing` — provisioning outcomes (auth.service).
- `wizard.account_provision_failed` / `wizard.account_provision_flag_failed` — non-fatal provisioning failure + metadata-flag fallback (registration.controller).

### Completion Notes List

- **AC#1/#2/#5 — `AuthService.provisionPublicUserForWizard`** (auth.service.ts): passwordless (`passwordHash=NULL`), `roleId=public_user`, `status='active'`, `authProvider='email'`, `fullName` from given+family. Idempotent + no-clobber via `onConflictDoNothing({target: users.email})` + re-read; returns `{ userId, created }`. Emits `data.create` (fire-and-forget, no new audit key) on actual creation only. NDPA-reviewed (Task 1, Iris) — `active`, not `pending_verification`.
- **AC#3 — `respondents.user_id` FK**: schema column + `idx_respondents_user_id` + `ON DELETE SET NULL`; idempotent runner `migrate-respondents-user-id-init.ts` (auto-discovered by `db:push:full`, explicit step in ci-cd.yml after `migrate-reference-code-init`). Applied to the local dev DB.
- **AC#4 — non-fatal wiring** (submitWizard): runs AFTER the respondent+submission tx commits; on throw logs `wizard.account_provision_failed` + merges `metadata.account_provision_failed=true` (JSONB `||`, no clobber) — survey data never lost. Email-presence-guarded (wizard schema requires email; the guard is defensive, proven by the "no account when email absent → 400 before provisioning" test).
- **AC#6 — backfill** `_backfill-wizard-public-users.ts`: candidate set `source='public' AND user_id IS NULL`; email recovered from `submissions.raw_data->>'email'` (drafts are deleted on submit + not joinable to a respondent — documented in-script); unrecoverable-email rows skipped + counted; pending-NIN rows INCLUDED. Per-row link wrapped in a row-locked txn with a re-check + `data.update` audit (operator marker). PREVIEW by default; writes only with `--apply --confirm-i-am-not-dry-running`. Console email masking.
- **AC#9 — landing copy** (MagicLinkLandingPage): `AUTH_INVALID_CREDENTIALS` → "Let's get you registered first" + a primary `/register` CTA (sign-in demoted to secondary). Permanent UX fix for genuinely-unregistered visitors.
- **AC#10 — read-model** `GET /api/v1/me/registration-status` (me.routes/controller/service): authenticated, caller's-own status only (resolved from JWT `sub`/`email`, never an arbitrary param — anti-enumeration). 4 states via `respondents.user_id` → wizard-draft-by-email fallback. **`draftTotalSteps` deliberately omitted server-side** (the "of N" is a frontend wizard-composition concern owned by 9-40; the server returns the authoritative `draftStep`). Distinct from the Story 9-58 PUBLIC `/registration-status/request` channel.
- **AC#8 — quality**: API tsc clean; web tsc clean; api+web lint clean (0 errors). Full API suite **2571 passed / 7 skipped / 0 fail** (181 files). Net-new API tests: +3 provision, +4 me.service, +2 me.routes, +10 backfill, +3 registration-route = **+22**. Web: +1 landing-page test (MagicLinkLandingPage 15/15). No regressions; no behaviour drift in submitWizard's existing respondents/submissions path or 9-16 magic-link login.
- **No new deps. No new audit-action keys** (reused `data.create` + `data.update`). One new migration; one nullable FK; provisioning non-fatal.

### File List

**Added**
- `apps/api/src/services/me.service.ts` — registration read-model (AC#10)
- `apps/api/src/controllers/me.controller.ts` — `/me` controller
- `apps/api/src/routes/me.routes.ts` — `GET /me/registration-status` (authenticated)
- `apps/api/scripts/migrate-respondents-user-id-init.ts` — idempotent FK/index runner (AC#3)
- `apps/api/scripts/_backfill-wizard-public-users.ts` — operator-gated backfill (AC#6)
- `apps/api/src/services/__tests__/auth.provision-public-user.test.ts` — provisioning integration tests
- `apps/api/src/services/__tests__/me.service.test.ts` — read-model integration tests (4 states)
- `apps/api/src/routes/__tests__/me.routes.test.ts` — read-model route tests
- `apps/api/scripts/__tests__/_backfill-wizard-public-users.test.ts` — backfill unit tests
- `apps/api/src/utils/registrant-name.ts` — shared `buildRegistrantFullName` helper (review #6)

**Modified**
- `apps/api/src/db/schema/respondents.ts` — `userId` FK column + index + `account_provision_failed` metadata field + `users` import
- `apps/api/src/services/auth.service.ts` — `provisionPublicUserForWizard` + `roles`/`AUDIT_ACTIONS` imports
- `apps/api/src/controllers/registration.controller.ts` — non-fatal provisioning wiring in `submitWizard` + `AuthService`/`sql` imports
- `apps/api/src/routes/index.ts` — mount `/me`
- `apps/api/src/routes/__tests__/registration.routes.test.ts` — mock `AuthService` + 3 provisioning tests
- `apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx` — register-first copy + `/register` CTA (AC#9)
- `apps/web/src/features/auth/pages/__tests__/MagicLinkLandingPage.test.tsx` — register-CTA test
- `.github/workflows/ci-cd.yml` — run `migrate-respondents-user-id-init.ts` in the deploy chain
- `apps/api/src/controllers/registration.controller.ts` — (review #4/#6) split provision/link error handling + `account_link_failed` flag + use `buildRegistrantFullName`
- `apps/api/src/db/schema/respondents.ts` — (review #4) `account_link_failed` metadata field
- `apps/api/scripts/_backfill-wizard-public-users.ts` — (review #5/#6) preview masked sample + `deriveFullName` delegates to shared helper
- `docs/roadmap-to-launch.md` — sprint sequencing strike-through for 9-38 (review #1: was missing from File List)

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-06-17 | Code review (Opus 4.8, adversarial). 10/10 ACs verified; tests re-run green + tsc clean; 0 CRITICAL/HIGH. Auto-fixed 1 MED + 3 LOW: File List completeness (added roadmap-to-launch.md + new helper); accurate `account_link_failed` vs `account_provision_failed` flag split; backfill preview masked-sample parity; extracted shared `buildRegistrantFullName` (de-triplicated name derivation). 2 LOW accepted by-design (AC#6 draft-email narrowing; synthetic `draft`-state coverage). Task 9 → done. | Three-layer quality Layer 2: validate story claims against implementation; close review findings on the uncommitted tree before commit per `feedback_review_before_commit.md`. |
| 2026-06-17 | Implemented (dev-story, Opus 4.8): `respondents.user_id` FK + idempotent runner; `AuthService.provisionPublicUserForWizard` (passwordless, idempotent-no-clobber); non-fatal wiring into `submitWizard`; operator-gated backfill; `GET /me/registration-status` read-model (4 states); landing copy → register-first + `/register` CTA; Iris NDPA verdict (status='active'). +22 API tests, +1 web test; full API (2571) + web (2638) suites green; tsc + lint clean. Status in-progress → review. Task 8.2 (operator `_list-public-users` check) post-deploy-gated; Task 9 (code review) is the next step. | KEYSTONE of the Public-User Journey Harmonization — closes the 9-16 reachability gap so new wizard registrants get a durable, magic-link-loginable account; provides the shared read-model spine for 9-39 + 9-40; unblocks 9-32. |
| 2026-06-06 | AC#10 + Task 6 added — `GET /me/registration-status` read-model, the shared spine consumed by Story 9-39 (wrong-door recovery) + Story 9-40 (dashboard state machine). Routed by the Public-User Journey Harmonization SCP. Counts now 10 ACs / 9 Tasks. 9-38 confirmed as the keystone of the harmonization (account + link + read-model). | The dashboard + entry-IA both need one authoritative "what's this user's registration state" source; colocating it with the account/link layer keeps the spine together. |
| 2026-06-05 | AC#9 + Task 6 added — fold the 9-16 review's new-registrant landing-copy fix into this story (per Awwal "make it better" follow-up). Counts now 9 ACs / 8 Tasks. | The "couldn't find your account — old address" copy mis-serves never-registered visitors; redirect them to /register. |
| 2026-06-03 | Story drafted by Bob (SM) via `*create-story --yolo`. 8 ACs / 7 Tasks. Provisions a passwordless `public_user` at wizard submit (email-presence-driven), adds `respondents.user_id` FK, idempotent-no-clobber, non-fatal to wizard, operator-gated backfill, Iris NDPA review. ~3-5 dev-days (migration + service + wiring + backfill + tests). Priority: unblocks Story 9-32; closes the 9-16 reachability gap for new registrants. | Carved from the Story 9-16 code-review + ADR-015 amendment finding that NO production path creates public_user rows post-9-12, leaving magic-link/password login unreachable for new wizard respondents. |
