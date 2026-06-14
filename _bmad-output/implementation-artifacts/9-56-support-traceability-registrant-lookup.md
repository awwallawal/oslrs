# Story 9.56: Support Traceability — Resolve Registrants by Reference ID / Email / Phone / Status

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-14 by Bob (SM) via canonical *create-story, reconciled with John (PM). LAUNCH-GATING (roadmap Phase 2, lightweight, parallel-track). -->

## Story

As a **support agent / admin (super_admin, verification_assessor, government_official, supervisor)**,
I want to **look up a public registrant by Reference ID, email, or phone — and see their registration status and whether their magic-link/login email was sent**,
so that **I can resolve "did my registration go through / where's my login link?" requests from registrants who only have the Reference ID we showed them, without forcing them to recall their NIN.**

## Context & Why This Gates Launch

When the field blasts go out (Cohort A/B) and the public wizard is live, support will receive "did it work?" / "where's my login link?" requests from registrants who have **only the Reference ID we display to them** — not their NIN. Today the staff registry can only search by name and NIN (`respondent.service.ts:391`), so a support agent cannot resolve an inbound contact by the one identifier the registrant actually holds. This is a launch-gating operability gap: the registry exists, but it is not addressable by the support path's real-world inputs.

This story is **Phase 2 (field-readiness), lightweight, parallel-track** — it is NOT on the Phase-1 critical path and is **independent of 9-18**. It **extends** Epic 5 (the respondent registry); it does **not** reopen Epic 5.

### Overlap reconciliation (authoritative, from John/PM 2026-06-14)
- **EXTEND 5-5** (the registry search predicate) — widen the existing search to also match Reference ID, email, and phone.
- **REUSE 5-3** (the PII detail view + role gating) — a match links to the existing `GET /api/v1/respondents/:id` detail surface; **no new detail page, no new gating model.**
- **REUSE audit infra (6-1)** — every staff lookup that surfaces PII is audit-logged via the existing `logPiiAccess` pattern; magic-link issuance is derived from the existing `MAGIC_LINK_ISSUED` audit action + the `magic_link_tokens` table.
- **KEEP SEPARATE from:** 9-40 (the registrant's OWN public status view — public self-service), 9-32 (post-launch self-service NDPA export/erasure), 9-38 (soft-dep: status read-model + plain-language vocabulary).

### The central technical nuance — email/phone are NOT a uniform respondents-column match
The Reference ID and email do **not** live as columns on the `respondents` row. This is the load-bearing design fact for this story:
- **Reference ID = `submissions.submission_uid`** — persisted UNIQUE on the submissions row at wizard submit (`registration.controller.ts:619-622`, `newSubmissionUid = uuidv7()`) and mirrored into the audit trail as `details.submissionUid` (`registration.controller.ts:677`). It is the value support can match. It is **not** on `respondents`.
- **Email is NOT a respondents column** — it lives in `submissions.raw_data->>'email'` (written at `registration.controller.ts:642`) and in `wizard_drafts`. Resolving by email is a JOIN/subquery against `submissions` (± `wizard_drafts`), not a column compare.
- **Phone IS a respondents column** — `respondents.phone_number` (`db/schema/respondents.ts:92`), so phone can match the respondents row directly (and/or `submissions.raw_data->>'phone_number'` for parity).

So Reference-ID and email resolution is a **JOIN across `submissions` (± `wizard_drafts`)**, not a respondents-column match. A design decision (Task 1) must choose between the JOIN approach and a denormalization — the JOIN is the default; a migration adding email/phone as first-class respondents columns is OUT OF SCOPE unless the JOIN approach proves inadequate.

## Acceptance Criteria

### AC1 — Registry search matches Reference ID / email / phone (extends 5-5)
1. `listRespondents` search (the `filters.search` predicate at `respondent.service.ts:389-392`) is widened so a single search term ALSO matches: `submissions.submission_uid` (Reference ID, exact or prefix), `submissions.raw_data->>'email'` (email, case-insensitive), and phone (`respondents.phone_number` and/or `submissions.raw_data->>'phone_number'`) — IN ADDITION to the existing `first_name` / `last_name` / `nin` matches. The widened predicate must compose with the existing `DISTINCT ON (r.id)` + cursor pagination + supervisor team-scope without breaking them.
2. A search by a known Reference ID (`submission_uid`) resolves to **exactly one** registrant (the `submission_uid` UNIQUE constraint guarantees this). A known email and a known phone each resolve to the correct registrant(s).
3. Reference-ID and email matching is implemented as a JOIN/subquery against `submissions` (± `wizard_drafts`), NOT a respondents-column compare (see the central nuance). The chosen approach (JOIN vs denormalization) is recorded in Dev Notes; the default is the JOIN. No new migration unless the JOIN proves inadequate.
4. The search remains parameterised (Drizzle `sql`-tagged template / bound params, never string-concatenated user input) — no SQL-injection regression on the new email/phone/uid branches.

### AC2 — A match links to the existing 5-3 detail/PII view (no new surface)
1. A search result row links to the existing detail surface `GET /api/v1/respondents/:id` (`RespondentController.getRespondentDetail` → `respondent.routes.ts:30`); NO new detail page or endpoint is introduced.
2. The existing 5-3 role gating is reused unchanged: search + detail are authorized only for `SUPER_ADMIN`, `VERIFICATION_ASSESSOR`, `GOVERNMENT_OFFICIAL`, `SUPERVISOR` (`respondent.routes.ts:19-30`). No new role is granted access.
3. The web registry surface (`RespondentRegistryPage` / `RespondentRegistryTable`) makes the Reference ID / email / phone search discoverable (search input + result columns), reusing the existing RBAC-gated registry feature — no parallel search UI.

### AC3 — Result shows registration status in plain language (status read-model)
1. Each result/detail surfaces the registrant's registration status in plain language consistent with the public-journey vocabulary: **draft / pending-NIN / active** (mapped from the respondent `status` + `pending_nin_capture` state). The existing `verificationStatus` field/`STATUS_FILTER_MAP` is the data source; the plain-language labels are the support-facing presentation.
2. The vocabulary aligns with 9-38's status read-model where it exists (soft-dep); if 9-38's read-model is not yet present, a local mapping is used and a `[Source]` note flags it for later consolidation. This story is NOT blocked on 9-38.

### AC4 — Result indicates whether & when a login/magic-link email was issued
1. The detail/result indicates **whether** a magic-link/login email was issued for this registrant and **when** (most-recent issuance timestamp). Derived from the existing `MAGIC_LINK_ISSUED` audit action (`audit.service.ts:80`) and/or the `magic_link_tokens` table (`magic_link_tokens.respondent_id` / `email` + `created_at`, `db/schema/magic-link-tokens.ts:54-60,79`).
2. When no link was ever issued, the surface says so unambiguously (not blank). The displayed value distinguishes "never issued" from "issued at <time>".
3. Re-issuing / resending a magic link from the support UI is explicitly OUT OF SCOPE (candidate follow-up — note it); this AC is read-only visibility.

### AC5 — Authorization, no-leak, and unambiguous match semantics
1. Search and resolution are gated to the SAME staff roles as the existing registry + detail (`respondent.routes.ts:19-30`); an unauthorized role receives the existing 403 and learns NOTHING about whether a given Reference ID / email / phone exists (no existence/PII leak — same behaviour as today's name/NIN search).
2. **Supervisor redaction is preserved:** a supervisor MAY search by Reference ID / email / phone, but results respect the existing supervisor PII redaction — name/NIN/phone/dob are returned `null` for supervisors (`respondent.service.ts:201-205`) and supervisor team-scope (`respondent.service.ts:363-367`) still restricts which respondents are visible. Searching by a PII value a supervisor cannot see must NOT become a side-channel that confirms that PII (i.e. a supervisor search by email/phone must not leak a redacted respondent that falls outside their team scope).
3. No-match vs partial-match is unambiguous to the support agent: an exact Reference-ID hit resolves to exactly one registrant; a partial/free-text term may return multiple; an unknown Reference ID returns a clean, empty no-match (not an error, not a stale partial).

### AC6 — Every PII-surfacing staff lookup is audit-logged (6-1 pattern)
1. Every search that surfaces PII and every detail resolution is audit-logged via the existing PII-access pattern (`AuditService.logPiiAccess` → `PII_ACTIONS.VIEW_LIST` for search, `PII_ACTIONS.VIEW_RECORD` for detail — `respondent.controller.ts:80-86,113-119`), recording the actor, the search term class (NOT the raw PII value where avoidable), and result count. No new audit action is required; reuse the existing PII-access actions.
2. The audit log for ALL roles (including supervisor) is preserved (`respondent.controller.ts:79` already logs for all roles).

### AC7 — Acceptance tests (the PM AC7 cases + RBAC/redaction/no-match)
1. A known **Reference ID** (`submission_uid`) resolves to the correct single registrant.
2. A known **email** resolves to the correct registrant.
3. A known **phone** resolves to the correct registrant.
4. An **unknown Reference ID** returns a clean no-match (empty result, no error).
5. **Supervisor redaction:** a supervisor search by email/phone returns results with name/NIN/phone/dob redacted AND respects team-scope (no out-of-scope leak).
6. **Unauthorized role:** a role outside `AUTHORIZED_ROLES` receives 403 and no existence signal.
7. The widened search does not regress the existing name/NIN search, cursor pagination, or `DISTINCT ON (r.id)` dedup.

## Tasks / Subtasks

- [ ] **Task 1 — Decide + implement the resolution approach (AC1, AC3 nuance)**
  - [ ] Record the design decision in Dev Notes: JOIN/subquery against `submissions` (± `wizard_drafts`) for Reference-ID + email resolution vs. denormalizing email/phone onto `respondents`. **Default: JOIN** (no migration); only denormalize if the JOIN proves inadequate (document why if so).
  - [ ] Confirm `submissions.submission_uid` (UNIQUE) is the Reference ID support holds, mirrored to audit `details.submissionUid` [Source: apps/api/src/controllers/registration.controller.ts:619-622,677], and that email is only in `submissions.raw_data->>'email'` / `wizard_drafts` (NOT a respondents column) while phone IS `respondents.phone_number` [Source: apps/api/src/db/schema/respondents.ts:92].

- [ ] **Task 2 — Widen the registry search predicate (AC1, AC2.3, AC5.3)**
  - [ ] Extend `buildFilterConditions` `filters.search` branch (`respondent.service.ts:389-392`) to add: `submission_uid` exact/prefix match, `raw_data->>'email'` case-insensitive match, and phone match (`respondents.phone_number` and/or `raw_data->>'phone_number'`), composed via Drizzle `sql`-tagged bound params (no string concat — AC1.4).
  - [ ] Ensure the new predicate composes with `DISTINCT ON (r.id)`, cursor pagination, and supervisor team-scope (`respondent.service.ts:363-367,447-449`) without breaking dedup or scope.
  - [ ] Surface the widened search in the web registry feature (`RespondentRegistryPage.tsx` / `RespondentRegistryTable.tsx`) — update the search input placeholder/help to mention Reference ID / email / phone; reuse the existing RBAC-gated feature (no new page, AC2.3).

- [ ] **Task 3 — Plain-language status in results/detail (AC3)**
  - [ ] Map respondent `status` + pending-NIN state → plain-language **draft / pending-NIN / active** consistent with the public-journey vocabulary; reuse `STATUS_FILTER_MAP` / `verificationStatus` as the data source (`respondent.service.ts:375-377`).
  - [ ] Align with 9-38's status read-model if present; else use a local mapping and `[Source]`-flag for later consolidation (soft-dep, not blocking).

- [ ] **Task 4 — Magic-link "issued?/when?" indicator (AC4)**
  - [ ] Derive issued-or-not + most-recent issuance timestamp from `MAGIC_LINK_ISSUED` audit action (`audit.service.ts:80`) and/or `magic_link_tokens` (`respondent_id` / `email` + `created_at`, `magic-link-tokens.ts:54-60,79`).
  - [ ] Surface on the existing detail response (`getRespondentDetail` / `RespondentDetailResponse` at `respondent.service.ts:199-209`) — distinguish "never issued" from "issued at <time>" (AC4.2). Re-issue/resend explicitly NOT added (AC4.3 — note as follow-up).

- [ ] **Task 5 — Authorization, no-leak, supervisor redaction (AC5, AC6)**
  - [ ] Verify the widened search + any new detail field stay behind `AUTHORIZED_ROLES` (`respondent.routes.ts:19-30`); no new role granted.
  - [ ] Confirm supervisor redaction (`respondent.service.ts:201-205`) and team-scope (`:363-367`) still apply to PII-driven searches — a supervisor search by email/phone must not leak a redacted/out-of-scope respondent (AC5.2).
  - [ ] Confirm PII-access audit is written for search (`PII_ACTIONS.VIEW_LIST`) and detail (`PII_ACTIONS.VIEW_RECORD`) for ALL roles (`respondent.controller.ts:79-86,112-119`); avoid logging the raw PII search value where the term class suffices (AC6.1).

- [ ] **Task 6 — Tests + regression sweep (AC7)**
  - [ ] Backend tests in `__tests__/` (vitest, real-DB integration where the JOIN matters): known Reference ID → single registrant; known email → correct registrant; known phone → correct registrant; unknown Reference ID → clean no-match; supervisor redaction + team-scope on PII search; unauthorized role → 403 + no existence signal; no regression to name/NIN search + cursor pagination + `DISTINCT ON` dedup.
  - [ ] Web tests for the registry search input + status/magic-link columns (co-located vitest).
  - [ ] Full `pnpm test` (API + web) green; tsc + lint clean.

## Dev Notes

### Architecture & engine map (cite these exact targets)
- **Registry search predicate (THE thing to widen):** `apps/api/src/services/respondent.service.ts:389-392` — currently `r.first_name ILIKE … OR r.last_name ILIKE … OR r.nin LIKE …`. `listRespondents` (`:405`) builds via `buildFilterConditions` (`:360`), supervisor team-scope (`:363-367`), `DISTINCT ON (r.id)` + cursor pagination (`:436-449`).
- **Detail surface to REUSE (no new page):** `GET /api/v1/respondents/:id` → `RespondentController.getRespondentDetail` (`apps/api/src/controllers/respondent.controller.ts:97-126`); route + RBAC `apps/api/src/routes/respondent.routes.ts:19-30`; response shape + supervisor redaction `RespondentService.getRespondentDetail` (`apps/api/src/services/respondent.service.ts:51`, redaction `:201-205`).
- **Reference ID (`submission_uid`):** written UNIQUE at wizard submit `apps/api/src/controllers/registration.controller.ts:619-622` and mirrored to audit `details.submissionUid` `:677`. Email written to `raw_data.email` `:642`; phone to `raw_data.phone_number` `:634` AND `respondents.phone_number` (`apps/api/src/db/schema/respondents.ts:92`).
- **Magic-link issuance signal:** `AUDIT_ACTIONS.MAGIC_LINK_ISSUED = 'magic_link.issued'` (`apps/api/src/services/audit.service.ts:80`); `magic_link_tokens` (`respondent_id` / `email` / `created_at`, `apps/api/src/db/schema/magic-link-tokens.ts:54-60,79`); issuance via `MagicLinkService` (`apps/api/src/services/magic-link.service.ts`).
- **Audit (REUSE 6-1):** `AuditService.logPiiAccess` + `PII_ACTIONS.VIEW_LIST` / `VIEW_RECORD` (`apps/api/src/services/audit.service.ts:37-38,140-141`); already invoked for search/detail for ALL roles (`apps/api/src/controllers/respondent.controller.ts:79-86,112-119`).
- **Web registry surface:** `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx`, `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx` (+ co-located tests). RBAC + name/NIN search input already exist here.

### The email/phone-not-on-respondents JOIN nuance (prominent — read before coding)
- **Reference ID and email are NOT respondents columns.** Reference ID = `submissions.submission_uid` (UNIQUE → exactly-one resolution). Email = `submissions.raw_data->>'email'` (± `wizard_drafts`). Phone = `respondents.phone_number` (a real column) and also `submissions.raw_data->>'phone_number'`.
- Therefore Reference-ID + email resolution is a **JOIN/subquery against `submissions`** in the search predicate — `listRespondents` already joins submissions (`s` alias, e.g. `s.raw_data->>'gender'` at `respondent.service.ts:370`), so the seam exists; add `s.submission_uid` / `s.raw_data->>'email'` branches to the `filters.search` OR-group.
- **Design decision (record it):** default = JOIN (no migration). Only denormalize email/phone onto `respondents` if the JOIN proves inadequate (perf/uniqueness) — adding columns is a Drizzle migration and is OUT OF SCOPE absent that finding. Bulk reconciliation/export is also OUT.

### Critical implementation rules (from project-context.md)
- **AppError only** (§3) — any new validation/lookup error uses `new AppError('VALIDATION_ERROR', …, 400)`; never raw `Error`. Existing controller already throws `AppError` for bad UUID/cursor (`respondent.controller.ts:106`, `respondent.service.ts:424`).
- **Shared Zod schemas client+server** (§7) — if a new search/lookup param schema is added, define once and share; reuse the existing `respondentListSchema` rather than a parallel one where possible.
- **Structured Pino logging** (§5) — `{domain}.{action}`, e.g. `respondent.lookup` / `respondent.lookup_no_match`; do NOT log raw PII (email/phone/NIN) at info level — log the term class + result count.
- **Parameterised SQL only** — extend the predicate with Drizzle `sql`-tagged bound params (as the existing branches do); never string-concatenate the search term (AC1.4). Note `STATUS_FILTER_MAP` uses `sql.raw` for a fixed allow-list only (`respondent.service.ts:375-377`) — user input must NEVER go through `sql.raw`.
- **Supervisor sees REDACTED PII** — preserve `respondent.service.ts:201-205` redaction + `:363-367` team-scope; PII-driven search must not become a confirmation side-channel (AC5.2).
- **Tests** — backend in `__tests__/` (vitest); real-DB integration tests use `beforeAll`/`afterAll` (not `beforeEach`); use a test org/respondent fixture, never prod data. Web tests co-located; `pnpm test` routes per package (never `pnpm vitest run` from root for web).

### Dependencies & sequencing
- **HARD deps (all done/available):** Epic 5 registry — 5-5 search predicate (done) + 5-3 detail/PII view + RBAC (done); audit chain 6-1 (`logPiiAccess`, `MAGIC_LINK_ISSUED`); magic-link infra (`magic_link_tokens`, `MagicLinkService`) exists.
- **SOFT dep:** 9-38 status read-model + plain-language vocabulary — cleaner AFTER 9-38, but NOT blocked (AC3.2 uses a local mapping if 9-38 isn't present).
- **Independent of 9-18** and off the Phase-1 critical path. Phase 2 (field-readiness), lightweight, parallel-track.
- **KEEP SEPARATE:** 9-40 (public self-service own-status), 9-32 (post-launch NDPA export/erasure).

### Scope OUT (do not build)
- Public self-service "look up my own status" (9-40).
- NDPA export/erasure (9-32).
- Resending/re-issuing magic links from the support UI (**candidate follow-up — note it**; AC4 is read-only visibility only).
- Adding email/phone as first-class respondents columns via migration UNLESS the JOIN approach proves inadequate (design decision, not foregone).
- Bulk reconciliation / export.

### References
- [Source: apps/api/src/services/respondent.service.ts:389-392] — current name/NIN-only search predicate (the thing to widen)
- [Source: apps/api/src/services/respondent.service.ts:201-205,363-367] — supervisor PII redaction + team-scope (preserve)
- [Source: apps/api/src/routes/respondent.routes.ts:19-30] — AUTHORIZED_ROLES + detail route (reuse gating, no new surface)
- [Source: apps/api/src/controllers/respondent.controller.ts:79-86,97-126,112-119] — listRespondents/getRespondentDetail + PII-access audit (all roles)
- [Source: apps/api/src/controllers/registration.controller.ts:619-622,634,642,677] — submission_uid (Reference ID) UNIQUE + email/phone in raw_data + audit mirror
- [Source: apps/api/src/db/schema/respondents.ts:92] — phone_number IS a column; email is NOT
- [Source: apps/api/src/db/schema/magic-link-tokens.ts:54-60,79] — magic_link_tokens (respondent_id/email/created_at)
- [Source: apps/api/src/services/audit.service.ts:37-38,80,140-141] — PII_VIEW actions + MAGIC_LINK_ISSUED
- [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx] — web registry surface (extend search)
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#9-56-support-traceability-registrant-lookup] — placeholder scope
- [Source: docs/roadmap-to-launch.md#Phase-2] — launch-gating Phase-2 sequencing (lightweight, parallel-track)
- [Source: _bmad-output/project-context.md] — AppError, shared-Zod, Pino, test-org, parameterised-SQL rules

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-06-14 | Story authored by Bob (SM) via canonical *create-story, reconciled with John (PM). 7 ACs (search-widening to Reference ID/email/phone, reuse 5-3 detail, plain-language status, magic-link issued indicator, RBAC/no-leak/supervisor-redaction, PII-access audit, acceptance tests). Status → ready-for-dev. LAUNCH-GATING, roadmap Phase 2 (field-readiness), lightweight, parallel-track, independent of 9-18. |
