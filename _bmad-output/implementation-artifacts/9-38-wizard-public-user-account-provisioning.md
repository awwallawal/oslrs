# Story 9.38: Wizard Public-User Account Provisioning (close the magic-link login reachability gap)

Status: ready-for-dev

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

9. **AC#9 — Fix the new-registrant landing-page copy (folded from the 9-16 review).** Story 9-16's `MagicLinkLandingPage` `loginFriendlyErrorCopy` renders, on `AUTH_INVALID_CREDENTIALS` (user-not-found), *"We couldn't find an account for this email. The link may have been issued to an old address."* [Source: apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx loginFriendlyErrorCopy]. That copy is wrong for the dominant real case — a person who **never registered** typing their email at `/login` → "send me a sign-in link" (the request endpoint emails a link unconditionally for anti-enumeration). Change the copy to guide them to register: title "Let's get you registered first", body "We couldn't find an account for that email. If you haven't registered yet, start here.", and add a `/register` CTA (mirror the existing `showSupport` link pattern). This is a permanent UX fix (not just a pre-9-38 band-aid): after 9-38, wizard registrants have accounts, but a genuinely-unregistered visitor still hits this path. ~5-line copy + one CTA; +1 landing-page test asserting the register link renders on `AUTH_INVALID_CREDENTIALS`.

## Tasks / Subtasks

- [ ] **Task 1 — Iris (counsel) NDPA pre-implementation review (AC: #7)**
  - [ ] 1.1 Confirm Step-1 wizard consent covers durable-account creation; capture verdict in Dev Notes.
  - [ ] 1.2 Align account lifecycle with Story 9-32 erasure/retention (erased respondent ⇒ account deactivated/erased).
- [ ] **Task 2 — Migration: add `respondents.user_id` FK (AC: #3)**
  - [ ] 2.1 Hand-rolled idempotent migration `migrate-respondents-user-id-*.ts` (nullable `uuid` FK → `users(id)` `ON DELETE SET NULL`); `IF NOT EXISTS` guard.
  - [ ] 2.2 Add the column to `apps/api/src/db/schema/respondents.ts` + index `idx_respondents_user_id`.
- [ ] **Task 3 — `AuthService.provisionPublicUserForWizard` (AC: #1, #2, #5)** _(write failing tests first)_
  - [ ] 3.1 Tests: passwordless create; idempotent-no-clobber on existing email; status='active'; returns the user id.
  - [ ] 3.2 Implement: look up public_user role id; `insert(users)` passwordless with `onConflictDoNothing` on email; re-read on conflict; return id.
- [ ] **Task 4 — Wire into `submitWizard` (AC: #1, #3, #4)**
  - [ ] 4.1 After the `respondents` row commits, if email present → call provisioning; set `respondents.user_id`.
  - [ ] 4.2 Wrap non-fatally: on throw, log `wizard.account_provision_failed` + set `metadata.account_provision_failed=true`; wizard still returns success.
  - [ ] 4.3 Integration tests: account-when-email / no-account-when-absent / wizard-survives-provision-throw.
- [ ] **Task 5 — Backfill script (AC: #6)**
  - [ ] 5.1 `scripts/_backfill-wizard-public-users.ts` (dry-run default, `--confirm`, `--help`); recover email from `wizard_drafts` / `submissions.rawData`; idempotent; skip+count unrecoverable.
  - [ ] 5.2 Unit tests for arg-parse + idempotency + skip path.
- [ ] **Task 6 — New-registrant landing copy fix (AC: #9)**
  - [ ] 6.1 Update `MagicLinkLandingPage` `loginFriendlyErrorCopy` `AUTH_INVALID_CREDENTIALS` branch → "register first" copy + `/register` CTA.
  - [ ] 6.2 +1 test: register link renders on `AUTH_INVALID_CREDENTIALS`.
- [ ] **Task 7 — Regression sweep + status flip (AC: #8)**
  - [ ] 7.1 API + web tsc + lint + full vitest green; document net-new test counts.
  - [ ] 7.2 Re-run `scripts/_list-public-users.ts` (Story 9-16 aid) to confirm new wizard accounts appear.
- [ ] **Task 8 — Code review (per `feedback_review_before_commit.md`)**
  - [ ] 8.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted tree; auto-fix HIGH/MED; commit after.

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

## Dev Agent Record

### Agent Model Used

_(unset — authored by Bob/SM; dev agent fills on pickup)_

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-06-05 | AC#9 + Task 6 added — fold the 9-16 review's new-registrant landing-copy fix into this story (per Awwal "make it better" follow-up). Counts now 9 ACs / 8 Tasks. | The "couldn't find your account — old address" copy mis-serves never-registered visitors; redirect them to /register. |
| 2026-06-03 | Story drafted by Bob (SM) via `*create-story --yolo`. 8 ACs / 7 Tasks. Provisions a passwordless `public_user` at wizard submit (email-presence-driven), adds `respondents.user_id` FK, idempotent-no-clobber, non-fatal to wizard, operator-gated backfill, Iris NDPA review. ~3-5 dev-days (migration + service + wiring + backfill + tests). Priority: unblocks Story 9-32; closes the 9-16 reachability gap for new registrants. | Carved from the Story 9-16 code-review + ADR-015 amendment finding that NO production path creates public_user rows post-9-12, leaving magic-link/password login unreachable for new wizard respondents. |
