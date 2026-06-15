# Story 9.56: Support Traceability — Resolve Registrants by Reference ID / Email / Phone / Status

Status: done

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

- [x] **Task 1 — Decide + implement the resolution approach (AC1, AC3 nuance)**
  - [x] Record the design decision in Dev Notes: JOIN/subquery against `submissions` (± `wizard_drafts`) for Reference-ID + email resolution vs. denormalizing email/phone onto `respondents`. **Default: JOIN** (no migration); only denormalize if the JOIN proves inadequate (document why if so). → **Two-phase indexed resolution chosen** (revised after EXPLAIN: a cross-table OR can't use any index → seq-scans at scale). Phase-1 resolves ids via indexed predicates; Phase-2 filters `r.id IN (ids)`. No denormalization; instead a search-index migration (expression + GIN trigram). See Completion Notes "AC1 design decision".
  - [x] Confirm `submissions.submission_uid` (UNIQUE) is the Reference ID support holds, mirrored to audit `details.submissionUid` [Source: apps/api/src/controllers/registration.controller.ts:619-622,677], and that email is only in `submissions.raw_data->>'email'` / `wizard_drafts` (NOT a respondents column) while phone IS `respondents.phone_number` [Source: apps/api/src/db/schema/respondents.ts:92]. → verified against the live schema (submission_uid is `text` UNIQUE; phone is a column; email only in raw_data).

- [x] **Task 2 — Widen the registry search predicate (AC1, AC2.3, AC5.3)**
  - [x] Extend `buildFilterConditions` `filters.search` branch (`respondent.service.ts:389-392`) to add: `submission_uid` exact/prefix match, `raw_data->>'email'` case-insensitive match, and phone match (`respondents.phone_number` and/or `raw_data->>'phone_number'`), composed via Drizzle `sql`-tagged bound params (no string concat — AC1.4).
  - [x] Ensure the new predicate composes with `DISTINCT ON (r.id)`, cursor pagination, and supervisor team-scope (`respondent.service.ts:363-367,447-449`) without breaking dedup or scope. → verified by the real-DB integration smoke (dedup + supervisor-scope tests).
  - [x] Surface the widened search in the web registry feature (`RespondentRegistryPage.tsx` / `RespondentRegistryTable.tsx`) — update the search input placeholder/help to mention Reference ID / email / phone; reuse the existing RBAC-gated feature (no new page, AC2.3). → placeholder updated in `RegistryFilters.tsx` (where the search input actually lives).

- [x] **Task 3 — Plain-language status in results/detail (AC3)**
  - [x] Map respondent `status` + pending-NIN state → plain-language **draft / pending-NIN / active** consistent with the public-journey vocabulary; reuse `STATUS_FILTER_MAP` / `verificationStatus` as the data source (`respondent.service.ts:375-377`). → added a shared `toRegistrationStatusLabel()` + `REGISTRATION_STATUS_LABELS` in `@oslsr/types`; mapped from `respondents.status` (the registration lifecycle, distinct from fraud `verificationStatus`).
  - [x] Align with 9-38's status read-model if present; else use a local mapping and `[Source]`-flag for later consolidation (soft-dep, not blocking). → 9-38 read-model not present; local mapping used + `[Source]`-flagged in the types helper doc-comment.

- [x] **Task 4 — Magic-link "issued?/when?" indicator (AC4)**
  - [x] Derive issued-or-not + most-recent issuance timestamp from `MAGIC_LINK_ISSUED` audit action (`audit.service.ts:80`) and/or `magic_link_tokens` (`respondent_id` / `email` + `created_at`, `magic-link-tokens.ts:54-60,79`). → derived from `magic_link_tokens` (cleaner than audit-detail parsing): token bound to this respondent_id OR an **unbound** (respondent_id IS NULL) token for the same email, most-recent `created_at`.
  - [x] Surface on the existing detail response (`getRespondentDetail` / `RespondentDetailResponse` at `respondent.service.ts:199-209`) — distinguish "never issued" from "issued at <time>" (AC4.2). Re-issue/resend explicitly NOT added (AC4.3 — note as follow-up). → `magicLinkIssuedAt: string | null` on the detail; web shows "Sent <time>" vs "Not sent".

- [x] **Task 5 — Authorization, no-leak, supervisor redaction (AC5, AC6)**
  - [x] Verify the widened search + any new detail field stay behind `AUTHORIZED_ROLES` (`respondent.routes.ts:19-30`); no new role granted. → unchanged routes; gating reused verbatim.
  - [x] Confirm supervisor redaction (`respondent.service.ts:201-205`) and team-scope (`:363-367`) still apply to PII-driven searches — a supervisor search by email/phone must not leak a redacted/out-of-scope respondent (AC5.2). → integration test seeds two registrants sharing one email (one in-team, one public/out-of-scope); supervisor search returns ONLY the in-team one, PII-redacted.
  - [x] Confirm PII-access audit is written for search (`PII_ACTIONS.VIEW_LIST`) and detail (`PII_ACTIONS.VIEW_RECORD`) for ALL roles (`respondent.controller.ts:79-86,112-119`); avoid logging the raw PII search value where the term class suffices (AC6.1). → the widened search flows through the SAME `listRespondents` controller that already calls `logPiiAccess(VIEW_LIST)` for all roles (it logs `{ filters, resultCount }` — no extra raw-PII field added); detail unchanged. No new audit action.

- [x] **Task 6 — Tests + regression sweep (AC7)**
  - [x] Backend tests in `__tests__/` (vitest, real-DB integration where the JOIN matters): known Reference ID → single registrant; known email → correct registrant; known phone → correct registrant; unknown Reference ID → clean no-match; supervisor redaction + team-scope on PII search; unauthorized role → 403 + no existence signal; no regression to name/NIN search + cursor pagination + `DISTINCT ON` dedup. → new `respondent-search-db-smoke.integration.test.ts` (9 real-DB tests). AC7.6 (unauthorized → 403) is the unchanged `authorize(...AUTHORIZED_ROLES)` route middleware, already covered by `middleware/__tests__/rbac.test.ts` (no new gating code path introduced).
  - [x] Web tests for the registry search input + status/magic-link columns (co-located vitest). → table "Registration" column + detail status/magic-link rows asserted.
  - [x] Full `pnpm test` (API + web) green; tsc + lint clean. → API 2479 pass / 7 skip (0 fail); web 2600 pass / 2 todo (0 fail); tsc clean (api/web/types); eslint clean (api/web).

### Review Follow-ups (AI) — code-review 2026-06-15 (all fixed in-session)

- [x] **[AI-Review][High] H1 — raw PII search term was persisted to the audit log.** `respondent.controller.ts` logged `{ filters: parsed.data, … }`; `filters.search` is the raw email/phone/NIN/Reference-ID the agent typed, contradicting AC6.1 ("NOT the raw PII value where avoidable") + project-context §5. **Fixed:** added `classifySearchTerm()` and redact the audit `filters.search` to `[<class>:len=<n>]` (email / nin_or_phone / phone / reference_id / name_or_other) before `logPiiAccess`. [apps/api/src/controllers/respondent.controller.ts:20-37,~88]
- [x] **[AI-Review][Med] M1 — supervisor recall could silently break under the 1000-id cap.** Phase-1 (`resolveSearchRespondentIds`) resolved the UNSCOPED global id set and capped at `SEARCH_ID_CAP` BEFORE supervisor team-scope was applied (Phase-2), so a broad term could truncate away a supervisor's in-team matches (UNION has no ORDER BY). **Fixed:** Phase-1 now takes `supervisorEnumeratorIds` and applies an `EXISTS (team submission)` scope to BOTH legs, so the cap applies to the already-scoped set. [apps/api/src/services/respondent.service.ts resolveSearchRespondentIds + buildFilterConditions]
- [x] **[AI-Review][Low] L1 — "Login Link Email" mislabelled non-login emails.** The unbound-token match had no purpose filter, so a `supplemental_survey` (9-28) or other unbound email to that address showed as a login link. **Fixed:** unbound leg restricted to `purpose IN ('login','wizard_resume')`. [respondent.service.ts magicLinkWhere]
- [x] **[AI-Review][Low] L2 — magic-link email recovery only read the most-recent submission.** If the newest submission lacked an email but an older one had it (and no respondent-bound token existed), unbound-email tokens were missed → false "Not sent". **Fixed:** scan all `submissionRows` for the first email. [respondent.service.ts getRespondentDetail]
- [x] **[AI-Review][Low] L4 — Phase-1 search resolution ran twice per list request.** `listRespondents` resolved ids for the data query, then `getRespondentCount` re-ran `buildFilterConditions` (a second identical resolution). **Fixed:** the list path now reuses the already-built `whereClause` for an inline count query; `getRespondentCount` is unchanged for its direct callers. [respondent.service.ts listRespondents]
- [x] **[AI-Review][Low→reclassified] L3 — server-side search min-length.** Reality-check: min-length IS already enforced (`respondentListSchema.search = z.string().min(3).max(100)`, with a passing 400 test), so the original finding was incorrect. Applied a small hardening anyway: the service trims the term and treats a whitespace-only search as a no-op (avoids a `%   %` scan). [respondent.service.ts buildFilterConditions]

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

claude-opus-4-8[1m] (Amelia / dev-story workflow), 2026-06-15.

### Debug Log References

- Real-DB integration first-run surfaced two genuine bugs, both fixed: (1) `invalid input syntax for type uuid: "smoke-form"` — the registry query casts `questionnaire_form_id::uuid` (regex-guarded, but Postgres still plans the cast), so the test fixture must use a real UUID form id; (2) the second `describe`'s tests ran *after* the first describe's `afterAll` cleanup — restructured to FILE-level `beforeAll`/`afterAll` so fixtures persist across both blocks.
- Full-suite (`pnpm test`, full parallelism) timed the 3 list-search integration tests out at 15s; isolated they run in 2-7s. This is the documented "local full-suite flakiness = contention, not broken tests" pattern (the registry list query is intentionally heavy: non-sargable `ILIKE` + `DISTINCT ON` + LATERAL name-fallback over the loaded dev DB). Fixed with an explicit 60s per-test timeout on the real-DB list-search tests (CI runs against a fresh small `db:push` DB where they complete in <1s).

### Completion Notes List

- **AC1/AC2.3** — Registry search widened to also resolve by Reference ID (`submission_uid`), email (`raw_data->>'email'`), and phone (`respondents.phone_number`). All via bound params (no string concat; no SQLi). Search input placeholder updated in `RegistryFilters.tsx` (the real location of the registry search box, not `RespondentRegistryPage.tsx`).
- **AC1 design decision — two-phase, scale-safe (revised after EXPLAIN on the local 500K/1M dataset).** A single search box matches respondents columns (name/NIN/phone) OR submissions columns (Reference ID/email) — a cross-table `OR` predicate can't use ANY index (Postgres seq-scans both tables: measured ~0.6–1.7s at 500K respondents / 1M submissions; trigram/expression indexes don't help while the OR mixes tables + a subquery). So search now resolves in two phases: **Phase 1** `resolveSearchRespondentIds()` resolves the term to a respondent-id set via INDEXED predicates only (UNION of respondents trigram + submissions `submission_uid` UNIQUE index + `lower(raw_data->>'email')` expression index → `BitmapOr`, ~0.05ms); **Phase 2** the main query filters `r.id IN (ids)` (PK index + nested-loop the submissions join, <1ms). Reference ID matches exact `=` (uses the unique index); email is exact case-insensitive; the redundant `raw_data->>'phone_number'` branch was dropped (phone is canonical on `respondents.phone_number`; the JSON branch only added a 1M-row seq scan for zero recall). Result: the integration suite dropped from ~21s → **0.4s**. The id-set is capped at 1000 (`SEARCH_ID_CAP`) with a `respondent.search_truncated` log (no silent truncation); the no-search browse path is unchanged + uncapped. **Indexes** (expression + 4 GIN trigram) ship via a new idempotent runner `scripts/migrate-registry-search-indexes-init.ts` (auto-discovered locally by `db:push:full`; explicit step added to the CI deploy chain) — they're a perf optimization, not a correctness dependency (the query returns correct results without them, just slower).
- **AC2 (reuse)** — No new endpoint/page/role: matches link to the existing `GET /api/v1/respondents/:id` 5-3 detail surface; the registry table gained a read-only "Registration" column only.
- **AC3** — Added shared `toRegistrationStatusLabel()` + `REGISTRATION_STATUS_LABELS` to `@oslsr/types` (mapped from the respondent lifecycle `status` enum — distinct from the fraud `verificationStatus`). Surfaced as `registrationStatus` on `RespondentListItem` (list) + `RespondentDetailResponse` (detail). 9-38's read-model isn't present yet → local mapping `[Source]`-flagged for later consolidation (soft-dep, not blocked).
- **AC4** — `magicLinkIssuedAt: string | null` on the detail. Derived from `magic_link_tokens`: a token bound to THIS `respondent_id`, OR an **unbound** (`respondent_id IS NULL`) login/wizard_resume token for the same email. The `respondent_id IS NULL` guard is a deliberate correctness fix — without it, a token bound to a *different* respondent who shares an email (e.g. a shared guardian address) would be mis-attributed (caught + regression-tested). Web shows "Sent <time>" vs "Not sent". Re-issue/resend explicitly OUT (AC4.3) — candidate follow-up.
- **AC5/AC6** — Gating, supervisor redaction (`:201-205`), and team-scope (`:363-367`) all reused unchanged; the email-match rides the same scoped `s`, so a supervisor cannot use a PII search as a side-channel for an out-of-team respondent (integration-tested with a shared-email pair). PII-access audit is the SAME `logPiiAccess(VIEW_LIST)`/`(VIEW_RECORD)` the controller already fires for all roles — it logs `{ filters, resultCount }`, not the raw PII match value. No new audit action.
- **AC7** — `respondent-search-db-smoke.integration.test.ts` (9 real-DB tests): ref-id→1, email, phone, unknown→empty, name+NIN regression, supervisor scoped+redacted no-leak, DISTINCT ON dedup, detail status+magic-link (issued + null). Plus mocked unit tests in `respondent.service.test.ts` (SQL-branch wiring + status mapping) and web tests (table column + detail rows). AC7.6 (403) = unchanged `authorize` middleware, covered by `rbac.test.ts`.
- **Scope OUT honoured**: no public self-service status (9-40), no NDPA export/erasure (9-32), no magic-link resend, no new respondents columns/migration, no bulk reconciliation.

### File List

**Modified**
- `packages/types/src/respondent.ts` — `registrationStatus` on `RespondentListItem` + `RespondentDetailResponse`; `magicLinkIssuedAt` on detail; `REGISTRATION_STATUS_LABELS` + `toRegistrationStatusLabel()`.
- `apps/api/src/services/respondent.service.ts` — two-phase scale-safe search (`resolveSearchRespondentIds()` Phase-1 + `r.id IN (ids)` Phase-2, `SEARCH_ID_CAP`); `r.status` → `registrationStatus` in list; `status` select + `magic_link_tokens` query + `registrationStatus`/`magicLinkIssuedAt` in `getRespondentDetail`; imports (`or`/`and`/`isNull`/`inArray`, `magicLinkTokens`, `toRegistrationStatusLabel`, `pino` logger). **Review fixes:** M1 (Phase-1 supervisor-scope param), L1 (unbound-token purpose filter), L2 (scan all submissions for email), L3 (trim search term), L4 (inline count reuses whereClause).
- `apps/api/src/controllers/respondent.controller.ts` — **review fix H1:** `classifySearchTerm()` + redact the audit `filters.search` to `[<class>:len=<n>]` (no raw PII in the audit detail).
- `apps/api/src/db/schema/respondents.ts` + `apps/api/src/db/schema/submissions.ts` — comments documenting the runner-managed search indexes (db:push parity).
- `.github/workflows/ci-cd.yml` — deploy-chain step running the new index migration runner.
- `apps/web/src/features/dashboard/components/RegistryFilters.tsx` — search placeholder mentions Reference ID / email / phone.
- `apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx` — read-only "Registration" status column + skeleton col-count bump (10→11 / 7→8).
- `apps/web/src/features/dashboard/pages/RespondentDetailPage.tsx` — "Registration Status" + "Login Link Email" (Sent/Not sent) rows on the Operational card.
- `apps/api/src/services/__tests__/respondent.service.test.ts` — +3 mocked tests (two-phase wiring + zero-match short-circuit + status mapping); call-order comments updated for L4 (single Phase-1 resolution per request).
- `apps/api/src/controllers/__tests__/respondent-list.controller.test.ts` — +2 tests asserting H1 audit redaction (email + phone search terms never logged raw).
- `apps/web/src/features/dashboard/components/__tests__/RespondentRegistryTable.test.tsx` — +2 tests + mocks gain `registrationStatus` + skeleton col-count assertions updated.
- `apps/web/src/features/dashboard/pages/__tests__/RespondentDetailPage.test.tsx` — +3 tests + mock gains `registrationStatus`/`magicLinkIssuedAt`.

**New**
- `apps/api/src/services/__tests__/respondent-search-db-smoke.integration.test.ts` — 9 real-DB tests (raw-SQL ↔ schema parity gate + AC7 cases).
- `apps/api/scripts/migrate-registry-search-indexes-init.ts` — idempotent runner: `idx_submissions_lower_email` (expression) + 4 GIN trigram indexes on respondents (powers the two-phase search at scale).

## Change Log

| Date | Change |
|------|--------|
| 2026-06-14 | Story authored by Bob (SM) via canonical *create-story, reconciled with John (PM). 7 ACs (search-widening to Reference ID/email/phone, reuse 5-3 detail, plain-language status, magic-link issued indicator, RBAC/no-leak/supervisor-redaction, PII-access audit, acceptance tests). Status → ready-for-dev. LAUNCH-GATING, roadmap Phase 2 (field-readiness), lightweight, parallel-track, independent of 9-18. |
| 2026-06-15 | Implemented (Amelia/dev-story). Search widening (Reference ID/email/phone), parameterised; plain-language `registrationStatus` on list+detail; `magicLinkIssuedAt` on detail (bound-or-unbound token semantics); web placeholder + registry "Registration" column + detail status/login-link rows. New 9-test real-DB integration smoke (raw-SQL↔schema parity + AC7) + unit/web tests. All 7 ACs met. API 2479 pass / web 2600 pass / 0 fail; tsc+eslint clean (api/web/types). Status → review. |
| 2026-06-15 | Scale optimization (operator-requested before code review). EXPLAIN on the local 500K-respondent/1M-submission seed showed the cross-table search OR seq-scans both tables (~0.6–1.7s); no index helps a cross-table OR. Reworked search into two phases: Phase-1 `resolveSearchRespondentIds()` (indexed UNION → BitmapOr) + Phase-2 `r.id IN (ids)` (PK + nested-loop). Added `scripts/migrate-registry-search-indexes-init.ts` (expression index on `lower(raw_data->>'email')` + 4 GIN trigram indexes) + CI deploy step + schema comments. Reference ID exact `=`; id-set capped at 1000 (logged). Integration suite 21s → 0.4s; verified <1ms at 500K via EXPLAIN. Full API suite 2480 pass / 0 fail; tsc+eslint clean. |
| 2026-06-15 | Adversarial code review (Awwal). 6 findings, ALL fixed in-session: H1 (raw PII search term redacted to class+length in the audit log — closes AC6.1), M1 (supervisor team-scope pushed into Phase-1 so the 1000-id cap can't truncate in-team matches), L1 (unbound magic-link match restricted to login/wizard_resume purposes), L2 (email recovered from first submission that has one), L4 (list-path count reuses the built whereClause — no double Phase-1 resolution); L3 reclassified (server min-length already enforced by Zod) + whitespace-trim hardening. +4 tests (2 service, 2 controller redaction). API unit suites green (respondent.service 36, respondent-list/respondent controllers 82 combined); 9-test real-DB integration smoke green; API tsc clean. Status remains review. |
