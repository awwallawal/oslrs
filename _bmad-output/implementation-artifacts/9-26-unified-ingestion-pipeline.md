# Story 9.26: Unified ingestion pipeline — wizard writes submissions + CSV phone-format fix + recovery email

Status: review

<!--
Authored 2026-05-19 by Bob (SM) via canonical *create-story --yolo template.

Surfaced 2026-05-19 ~16:00 UTC when operator investigating "Registry page
shows 1 respondent but actual count is 43" found that the analytics
service queries `submissions` table, but wizard-registered respondents
have no submissions row. Deeper investigation surfaced THREE bugs and
ONE recoverable opportunity:

  BUG #1: Wizard handler at registration.controller.ts:455-631 SILENTLY
          DROPS `questionnaireResponses` + `gender` + `authChoice` from
          submitted data. Email lives only in magic_link_tokens.
  BUG #2: Analytics service buildWhereFragments() hardcodes
          `s.raw_data IS NOT NULL AND s.respondent_id IS NOT NULL` —
          ALL 11 analytics queries require a submissions row, so wizard
          respondents are invisible.
  BUG #3: submission-processing.service.ts:81-86 docblock claims wizard
          "calls findOrCreateRespondent directly" — INACCURATE; wizard
          bypasses this function entirely and inserts to respondents
          directly. Documentation-vs-implementation drift dating to
          Story 9-12 review.
  BUG #4 (downstream): export.service.ts:188-190 writes phone numbers
          as bare strings to CSV. Excel reads `+2349068299674` as a
          formula (leading `+`) and mangles display. NIN has same
          risk.

  RECOVERABLE: 97 wizard_drafts currently in-progress; 70 contain
          questionnaireResponses. These users started registration,
          filled Step 4, never clicked Submit. Magic-link wizard_resume
          infrastructure (Story 9-12 MR-8) exists. After Story 9-26
          ships its data-persistence fix, an operator-gated recovery
          email can prompt them to complete — preserving their data
          via the new (correct) handler.

PROD STATE at story authoring:
  - 43 respondents (39 source=public wizard + 1 source=enumerator + 3 since last count)
  - 0 source=clerk, 0 imported_*
  - 97 in-progress wizard_drafts; 70 with questionnaireResponses
  - Adoption surging: 11 user-emails 12:00-13:00 UTC, more throughout afternoon
  - Active data loss continues with every new wizard submit

Per Awwal's 2026-05-19 directive that real-data-driven decisions deserve
canonical Story tracking, this story is authored via canonical Bob
*create-story workflow with full nuance map for handover-readiness.
-->

## Story

As the **Super Admin who has just discovered that 43 wizard-registered respondents are invisible to the Registry page analytics AND that their Step 4 questionnaire answers have been silently dropped at submit time**,
I want **the wizard to write a `submissions` row alongside the `respondents` row (matching the unified-ingestion design the codebase already intends) AND the CSV export to format phone numbers as text-mode AND an operator-gated recovery email to the 70 in-progress drafts so we can capture their abandoned answers post-fix**,
So that **(1) every wizard registration from this point forward has its full questionnaire data persisted to `submissions.raw_data` where the analytics service can see it, (2) phone numbers display correctly in downloaded Excel sheets, (3) we recover as many of the 70 abandoned-but-data-rich drafts as user-engagement permits, and (4) future operators understand the four-pipeline ingestion architecture and the discipline needed to keep it unified**.

## Acceptance Criteria

### Part A — Wizard handler writes `submissions` row in same transaction

1. **AC#A1 — Insert in existing transaction**: `registration.controller.ts:submitWizard` adds an `await tx.insert(submissions).values({...})` immediately after the existing `tx.insert(respondents)` at line 506-525. Order: respondents first (so `respondent.id` is available), then submissions (referencing it).

2. **AC#A2 — `submissions.raw_data` shape**: object containing identity + wizard-collected fields + questionnaire answers:
   ```typescript
   {
     // Identity (also stored in respondents — duplicated here for analytics-query convenience)
     first_name: firstName,
     last_name: lastName,
     date_of_birth: data.dateOfBirth,
     phone_number: data.phone,
     lga_id: data.lgaId,
     nin: ninValue,
     consent_marketplace: data.consentMarketplace,
     consent_enriched: data.consentEnriched ?? false,
     // Wizard-collected, NOT on respondents (preserved here)
     email: normalisedEmail,
     gender: data.gender,
     auth_choice: data.authChoice,
     // Questionnaire answers
     ...(data.questionnaireResponses ?? {}),
   }
   ```
   Snake_case keys match the existing `RESPONDENT_FIELD_MAP` + `s.raw_data->>'X'` analytics query conventions.

3. **AC#A3 — Submissions row field values**:
   - `submissionUid`: `uuidv7()` (independent, chronological)
   - `questionnaireFormId`: from wizard's persisted `questionnaireFormId` — fetched from the wizard_draft BEFORE deletion (read the draft, capture, delete in same tx)
   - `submitterId`: `null` (self-registration)
   - `respondentId`: just-inserted respondent's id
   - `enumeratorId`: `null`
   - `gpsLatitude`/`gpsLongitude`: `null` (wizard doesn't collect GPS)
   - `completionTimeSeconds`: `Math.floor((now - draft.createdAt) / 1000)` — fraud-engine signal
   - `submittedAt`: `now()`
   - `source`: `'public'`
   - `processed`: `true` (wizard data is canonical; bypass enrichment worker)
   - `processedAt`: `now()`

4. **AC#A4 — Transaction integrity**: if `submissions.insert()` fails for any reason, the WHOLE transaction rolls back — including the respondents insert + audit log + draft delete. No half-state where respondent exists without submission.

5. **AC#A5 — Audit log enrichment**: existing `PENDING_NIN_CREATED` / `DATA_CREATE` audit event (lines 528-544) gains `submissionId: <new>` in its `details` JSONB. NO new audit action — one registration = one audit event remains the rule.

### Part B — Backfill existing 43 wizard respondents with data-loss marker

6. **AC#B1 — One-shot script**: `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts` (operator-gated; deleted post-run OR archived to `_bmad-output/scratch/`). Selects all `respondents` rows where `source='public' AND created_at >= '2026-05-14 00:00:00'`. Updates each row's `metadata` JSONB with `{...existing, questionnaire_data_lost: true, lost_at: '2026-05-19T??:??:??Z', recovery_email_eligible: false}`.

7. **AC#B2 — Audit each backfill row**: uses Story 9-22's `operatorUpdate()` helper (if 9-22 ships first) OR a manual `AuditService.logAction` with action `OPERATOR_BACKFILL_DATA_LOSS_MARKER` (new AUDIT_ACTIONS enum) per row. Per-row audit prevents the silent forensic gap from recurring.

8. **AC#B3 — Run on prod via SSH after Part A deploy**: this is a one-shot operator action, not part of every-deploy CI.

### Part C — Fix inaccurate docblock at `submission-processing.service.ts:81-86`

9. **AC#C1 — Replace the incorrect docblock**: current text claims wizard "calls findOrCreateRespondent directly without NIN." Reality: wizard bypasses this function and inserts respondents directly. Updated docblock describes the actual post-9-26 architecture: *"After Story 9-26, wizard inserts BOTH a respondents row AND a submissions row in the same transaction (registration.controller.ts:submitWizard); this function is no longer called from wizard. Enumerator/clerk submissions still flow through this function via the submission-processing queue."*

### Part D — Tests

10. **AC#D1 — Unit: wizard creates both rows in same tx**: new test in `registration.controller.test.ts` asserts that after `submitWizard`, BOTH a respondents row AND a submissions row exist, AND they're linked via `respondentId` FK, AND the submissions row's `raw_data` contains all 11 expected fields (8 identity + 3 wizard-extra).

11. **AC#D2 — Unit: transaction rollback**: simulate submissions-insert failure; assert respondents row is NOT created (full rollback).

12. **AC#D3 — Integration: analytics now sees wizard respondents**: existing `survey-analytics.service.test.ts` gains a fixture with wizard-style submissions (source='public') + asserts `getRegistrySummary()` counts include them.

13. **AC#D4 — Regression: enumerator submission flow unchanged**: existing enumerator-path tests continue passing. The submission-processing queue still fires for source='enumerator' / source='clerk' submissions (not 'public').

14. **AC#D5 — Regression: clerk submission flow unchanged**: same as #D4 for source='clerk'.

15. **AC#D6 — Test count delta**: expected ~+8 tests (4 unit + 2 integration + 2 regression). Document in Dev Agent Record.

### Part E — Memory entry: 4-pipeline ingestion architecture

16. **AC#E1 — New memory file**: `feedback_unified_ingestion_pipeline.md` documenting:
    - The four pipelines (wizard / enumerator / clerk / imported)
    - The rule: "every respondent has a submissions row" (after 9-26)
    - The exception: `imported_*` source respondents (no submissions row by design; analytics handles this via the existing `source LIKE 'imported_%'` filter)
    - The decision contract: any NEW pipeline added MUST follow the unified pattern OR explicitly document why it's an exception
    - Pattern source: 2026-05-19 incident where wizard accidentally bypassed unified design

17. **AC#E2 — MEMORY.md index entry**: add to "Key Patterns" section: `- [Unified ingestion pipeline](feedback_unified_ingestion_pipeline.md) — Every respondent has a submissions row (except imported_*). New ingestion paths must follow this OR document the exception.`

### Part F — Story 9-12 § L7 (Post-Launch UAT Session Log lesson)

18. **AC#F1 — Add Lesson L7**: append to Story 9-12's Post-Launch UAT Session Log § Lessons, after L6:
    - Title: "L7 — The wizard silently dropped questionnaireResponses for 43 respondents (2026-05-14 → 2026-05-19)"
    - Body: incident chronology, root cause (handler ignored field), data loss scope (43 respondents × Step 4 answers, ~14 chars/answer × ~10 answers = ~50KB total ignored data; modest in volume, immense in business value), root-cause-of-root-cause (Story 9-12 docblock claimed unified-pipeline intent but implementation took a shortcut + review missed the drift), forward fix link to Story 9-26.

### Part G — Sprint-status + governance

19. **AC#G1 — Sprint-status update**: add 9-26 entry to `sprint-status.yaml` with rich one-paragraph description.

20. **AC#G2 — Story 9-12 status note**: append to Story 9-12 sprint-status entry that 9-12's "wizard ships data to canonical pipeline" intent was incomplete; 9-26 closes the gap.

### Part H — Pre-merge BMAD code review

21. **AC#H1 — Code review on uncommitted tree**: per `feedback_review_before_commit.md`, run the canonical `/bmad:bmm:workflows:code-review` workflow on this story's uncommitted changes BEFORE the commit lands. Auto-fix any findings inline.

### Part I — CSV export phone-format fix (cross-cutting)

22. **AC#I1 — `ExportColumn` interface extension**: add optional `format?: 'text' | 'number' | 'date'` field to the `ExportColumn` interface at `apps/api/src/services/export.service.ts:61-65`. Default behavior unchanged.

23. **AC#I2 — Apply tab-prefix when `format='text'`**: in `generateCsvExport()` at line 188-190, when the column's format is `'text'`, prefix the value with `\t` (tab character). Tab is invisible in Excel cells but forces Excel to treat the value as literal text (no formula evaluation, no scientific notation, no leading-zero stripping). Cross-tool compatible (LibreOffice, Google Sheets).

24. **AC#I3 — Mark phone + NIN columns as `format: 'text'`**: in `apps/api/src/controllers/export.controller.ts:43`, update the column definitions for phoneNumber and nin (and any other "should-be-text" columns) to include `format: 'text'`.

25. **AC#I4 — Tests**: new test in `export.service.test.ts` asserts that text-formatted columns get the tab prefix; non-text columns don't. ~2 tests.

### Part J — Operator-gated recovery email for 70 in-progress drafts

26. **AC#J1 — One-shot script**: `apps/api/scripts/_recover-abandoned-wizard-drafts.ts`. Operator runs via SSH AFTER Part A is deployed. Selects all `wizard_drafts` where `form_data ? 'questionnaireResponses' AND form_data->'questionnaireResponses' != '{}'::jsonb AND expires_at > NOW()`. For each:
    - Issue magic-link via `MagicLinkService.issueToken({ email, purpose: 'wizard_resume' })`
    - Send recovery email: subject *"Complete your Oyo Skills Registry registration"*, body explaining the abandoned draft + click-to-resume + 7-day expiry
    - Rate-limited: max 10 emails/min to respect Resend Pro budget + avoid triggering spam filters
    - Per-send audit log entry: `OPERATOR_RECOVERY_EMAIL_SENT` (new AUDIT_ACTIONS enum) with target_user_id (or null for unregistered email), email, draft_id

27. **AC#J2 — Dry-run mode**: script supports `--dry-run` flag that prints the recovery candidates + count without sending. Mandatory before live run.

28. **AC#J3 — Cohort-bound**: script accepts optional `--since YYYY-MM-DD` to filter to drafts created in a specific window. Default: all 70.

29. **AC#J4 — Manual audit + success report**: after run, operator queries audit_logs for the `OPERATOR_RECOVERY_EMAIL_SENT` rows to count sent. Track responses via the wizard's existing submit-handler (post-9-26 those completions get full data persisted).

## Tasks / Subtasks

- [x] **Task 1 (Part A) — Wizard handler writes submissions** (AC: #A1-A5) — shipped commit `e95b8ec`
  - [x] 1.1: In `submitWizard`, fetch `questionnaireFormId` from wizard_draft BEFORE the existing delete
  - [x] 1.2: Add `tx.insert(submissions).values({...})` after the respondents insert
  - [x] 1.3: Move audit-log JSONB to include `submissionId`
- [x] **Task 2 (Part B) — Backfill loss marker** (AC: #B1-B3)
  - [x] 2.1: Author `_backfill-wizard-questionnaire-loss.ts` script
  - [x] 2.2: New audit action `OPERATOR_BACKFILL_DATA_LOSS_MARKER`
  - [ ] 2.3: Run on prod via SSH after Part A deploys — **OPERATOR RESIDUAL** (one-shot; script + tests ready, --dry-run gated)
- [x] **Task 3 (Part C) — Docblock fix** (AC: #C1) — shipped commit `e95b8ec`
- [x] **Task 4 (Part D) — Tests** (AC: #D1-D6)
- [x] **Task 5 (Part E) — Memory + MEMORY.md** (AC: #E1-E2)
- [x] **Task 6 (Part F) — Story 9-12 § L7** (AC: #F1) — filed as §L8 (L7 taken by 9-28); renumbering noted in story
- [x] **Task 7 (Part G) — Sprint-status + 9-12 note** (AC: #G1-G2)
- [x] **Task 8 (Part H) — Pre-merge code review** (AC: #H1) — **DONE 2026-06-01 in a SEPARATE session** per `feedback_review_before_commit.md` + dev-story Step 10. Canonical adversarial `/bmad:bmm:workflows:code-review` on the uncommitted tree: 2 Medium + 5 Low surfaced (no Critical/High), ALL FIXED this session. Full findings + fixes in Dev Agent Record → Review Follow-ups (AI) → "Part H — CANONICAL adversarial code review". tsc + lint clean; 136 affected tests green.
- [x] **Task 9 (Part I) — CSV phone-format fix** (AC: #I1-I4) — shipped commit `e95b8ec`
  - [x] 9.1: Extend `ExportColumn` interface with optional `format` field
  - [x] 9.2: Update `generateCsvExport()` to apply tab prefix for text-formatted columns
  - [x] 9.3: Mark phoneNumber + nin columns as `format: 'text'` in export.controller
- [x] **Task 10 (Part J) — Recovery email script** (AC: #J1-J4)
  - [x] 10.1: Author `_recover-abandoned-wizard-drafts.ts`
  - [x] 10.2: New audit action `OPERATOR_RECOVERY_EMAIL_SENT`
  - [ ] 10.3: Dry-run first; then live run on prod via SSH after Part A deploys — **OPERATOR RESIDUAL** (one-shot; script + tests ready)

## Dev Notes

### Decisions encoded (D1-D8 from 2026-05-19 operator confirmation)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | submissions `processed=true` vs `false` | **true** | Wizard data is self-attested + canonical; no enrichment queue needed; saves load |
| D2 | submissionUid generation | **`uuidv7()`** | Chronologically sortable; matches existing patterns |
| D3 | completion_time_seconds | **compute as `now - draft.createdAt`** | Fraud-engine signal; trivial cost |
| D4 | Backfill the 43 lost questionnaire records | **No (cannot recover)** | Request bodies not logged anywhere; data is gone |
| D5 | Save authChoice to submissions.raw_data | **Yes** | Future analytics on user auth-method preference |
| D6 | Audit action — one or two events per registration | **One (current) + submissionId in details** | Avoids audit-log noise |
| D7 | Update docblock at submission-processing.service.ts:81-86 | **Yes, same commit** | Documentation hygiene |
| D8 | Mark existing 43 with `metadata.questionnaire_data_lost` | **Yes** | NDPA-clean: marks what we don't have; preserves attribution for any future audit |

### Why the unified pipeline (Option A) over alternatives

Considered three architectures:
- **Option A — Wizard writes submissions row (CHOSEN)**: matches codebase's architectural intent (source='public' enum, ROLE_TO_SOURCE, RESPONDENT_FIELD_MAP); zero analytics service changes; preserves all wizard fields in one canonical place.
- Option B — Analytics service reads from both tables: defers the data-loss fix; doesn't address the questionnaireResponses drop.
- Option C — Save to respondents.metadata JSONB: makes metadata a junk drawer; conflates row-level identity data with submission-level form-answer data.

Option A is what the codebase was designed for. The dev agent on Story 9-12 missed implementing it; this story closes the gap.

### Why ship 9-26 BEFORE 9-17 / 9-18

Story 9-17 (form-pin UI + Pattern C field dedup) will auto-fill questionnaire identity fields from wizard. Those auto-filled fields land in `questionnaireResponses`. If 9-17 ships before 9-26, the dedup-magnified `questionnaireResponses` get silently dropped by the buggy handler — making data loss WORSE during 9-17's UAT.

Story 9-18 (NIN-first + section-as-step) restructures the wizard UI but per its AC#C5 keeps the submit payload shape unchanged. 9-18 benefits from accurate analytics for measuring its success metric (Step-4 stall ratio drop). Ship 9-26 first for accurate baseline.

Order: **9-26 → 9-17 → 9-18**.

### Data loss scope (final accounting)

| Category | Count | Recoverable? |
|---|---|---|
| Wizard respondents with lost `questionnaireResponses` | 43 (still climbing — adoption surging) | ❌ No (request bodies not logged) |
| In-progress drafts with `questionnaireResponses` preserved | 70 | ✅ Yes, via Part J recovery email (post-9-26 deploy) |
| Wizard respondents missing `gender` | 43 | ❌ Same |
| Wizard respondents missing `authChoice` | 43 | ❌ Same; mostly historical curiosity |
| Email NOT directly on respondents row | 43 | ⚠️ Available via `magic_link_tokens.email` (acceptable) |

### Audit-log timing nuance

The wizard handler currently logs `PENDING_NIN_CREATED` or `DATA_CREATE` audit action per registration (line 528-544). Post-9-26, this same single event gains `submissionId` in its details JSONB. The submissions table insert itself is NOT separately audited — the registration is the audit unit, not its constituent inserts.

### Dependencies

- **Story 9-12** — provides the wizard skeleton + magic_link_tokens + wizard_drafts. 9-26 amends the submit handler.
- **Story 6-1** — audit hash chain. New action codes plug into existing emitter.
- **Story 9-22 (operator-db-audit-discipline)** — if ships first, Part B uses its `operatorUpdate()` helper. If not yet shipped, Part B uses ad-hoc `AuditService.logAction()` calls.
- **prep-input-sanitisation-layer** — already normalizes phones to E.164 at insert (confirmed via prod query: all 43 wizard phones are `+234XXXXXXXXXX` canonical). No phone-normalization work in 9-26.
- **Story 9-19 dashboard CLI** — once 9-26 ships, the CLI's Adoption + Funnel section will accurately count wizard respondents in registry summaries.

### Risks

1. **Transaction size / lock contention** — the wizard submit transaction now does FOUR writes (respondent insert + audit + draft delete + submission insert). Still under any reasonable transaction-size threshold; should be fast. Mitigation: keep all four within the existing `tx`.

2. **`questionnaireFormId` may be missing from draft** — if wizard_draft was created before Story 9-12 Task 5.4.5 form-version-locking shipped, the draft lacks `questionnaireFormId`. Handler must handle the null case gracefully: log warning, set `submissions.questionnaireFormId = '<unknown-pre-task-5.4.5>'` placeholder or use the current pinned form id as fallback. Document the fallback in code comments.

3. **Recovery email response rate uncertain** — Part J's 70 drafts might yield zero responses (users abandoned for a reason — bad time, friction, lost interest) OR 50%+ (they were close to completing). Plan for both. The Resend Pro upgrade (Story 9-20 Part A — ⚠️ STILL PENDING operator action as of 9-26 authoring) is required first if recovery yields heavy email volume. Don't run Part J until Resend Pro is live.

4. **Backfill marker on 43 rows** — Part B updates 43 rows with a metadata flag. If the operator-audit helper from Story 9-22 isn't yet shipped, manual `AuditService.logAction()` per row produces 43 audit-log entries. Acceptable noise; preserves the forensic trail.

5. **Part I ExportColumn refactor breaks unrelated tests** — the interface change adds an optional field; should be backwards-compatible. Tests pass at default behavior. Verify all callers of `ExportService.generateCsvExport()` still work.

6. **Story 9-18 amendment compatibility** — Section-as-step (9-18 Part E) keeps the submit payload shape per AC#C5. The 9-26 unified-pipeline fix applies the same way regardless of how many UI steps the wizard has. Verified compatible.

### Effort estimate

- Part A: ~1 hr (handler change)
- Part B: ~30 min (backfill script + run)
- Part C: ~10 min (docblock fix)
- Part D: ~2 hr (tests)
- Part E: ~15 min (memory)
- Part F: ~15 min (Story 9-12 § L7)
- Part G: ~15 min (sprint-status updates)
- Part H: ~30 min (code review)
- Part I: ~30 min (CSV phone fix)
- Part J: ~45 min (recovery email script)

**Total: ~5-6 hours**. Splittable if needed (Part A is the critical-path; Parts B-J can land in follow-up commits).

### Priority

🔴 **SEVERE** — active data loss every minute new wizard registrations come in. 43 respondents at 2026-05-19 ~16:30 UTC, climbing. Should ship Part A within 24h.

## Dev Agent Record

### Completion Notes (2026-06-01, Amelia — dev-story full close-out)

**Pre-existing (shipped commit `e95b8ec`, 2026-05-20 — verified present, not re-implemented):**
- Part A — `submitWizard` writes the canonical `submissions` row in the same `db.transaction` (raw_data carries 8 identity + email/gender/auth_choice + spread questionnaireResponses; `processed:true`, `source:'public'`, completionTimeSeconds from draft; audit gains `submissionUid`). Data loss stopped.
- Part C — inaccurate `submission-processing.service.ts:81-86` docblock corrected.
- Part I — `ExportColumn.format?: 'text'|'number'|'date'` + tab-prefix in `generateCsvExport()` (line 205) + phone/NIN marked `format:'text'`.

**Implemented this session:**
- **Part D (AC#D1-D6)** — pipeline-lock regression tests:
  - `registration.routes.test.ts`: AC#D1 captures the submissions-insert payload and asserts the full 13-field `raw_data` shape + analytics-visibility invariants (`respondentId`/`source`/`processed`/`submittedAt`/`questionnaireFormId` non-null); AC#D2 simulates a submissions-insert failure and asserts the controller surfaces an error (no half-state 201).
  - `survey-analytics.service.test.ts`: AC#D3 asserts `getRegistrySummary` counts wizard (`source='public'`) rows and that the default query binds **no** `s.source =` exclusion (regression that re-hides wizard rows fails loudly).
  - AC#D4/D5 (enumerator/clerk flows unchanged) covered by the existing green submission-processing + analytics suites (those paths still flow through the submission-processing queue; wizard is the only direct-insert path).
  - Net: +3 wizard/analytics tests; full files 67/67 green.
- **Part B (AC#B1-B3)** — `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts`: operator-gated, `--dry-run` mandatory, `--since`/`--until` window (default 2026-05-14 → 2026-05-20 Part-A cutover, making it idempotent + safe post-deploy), `IS DISTINCT FROM 'true'` skip for already-marked rows, per-row `OPERATOR_BACKFILL_DATA_LOSS_MARKER` audit. +13 unit tests.
- **Part J (AC#J1-J4)** — `apps/api/scripts/_recover-abandoned-wizard-drafts.ts`: operator-gated recovery email (narrow cohort = drafts with non-empty `questionnaireResponses` + not expired), `--dry-run`/`--since`/`--rate-per-minute`/Resend-Pro confirm gate, per-send `OPERATOR_RECOVERY_EMAIL_SENT` audit. Header documents that 9-27 Part A is the broader production successor and 9-28 Path B handles completed Cohort A. +13 unit tests.
- **Audit actions** — `OPERATOR_BACKFILL_DATA_LOSS_MARKER` + `OPERATOR_RECOVERY_EMAIL_SENT` added (43 → 45); count test + comment bumped.
- **Schema** — `RespondentMetadata` extended with `questionnaire_data_lost` / `lost_at` / `recovery_email_eligible` (TypeScript-only; JSONB column, no migration).
- **Part E** — saved memory `feedback_unified_ingestion_pipeline.md` (+ MEMORY.md Key Patterns index line).
- **Part F** — Story 9-12 Post-Launch UAT Session Log **§L8** (root-cause incident lesson; filed L8 because Story 9-28 already took L7 — renumbering noted inline).
- **Part G** — sprint-status 9-26 → `review` with close-out paragraph + AC#G2 note appended to the 9-12 entry.

**Quality:** `pnpm --filter @oslsr/api exec tsc --noEmit` clean; new + touched suites green (registration.routes 33, survey-analytics 34, audit.service 38, backfill 13, recover 13). Test delta vs story estimate (~+8): +29 (3 pipeline + 13 backfill + 13 recover; the higher count reflects the two operator scripts each getting a full parseArgs/flag/helper suite per project script-test discipline).

**Operator residuals (gate review → done):**
1. ✅ Part H pre-merge code review — DONE 2026-06-01 (separate session; 2 Medium + 5 Low all fixed; see Review Follow-ups → "Part H").
2. Task 2.3 — run `_backfill-wizard-questionnaire-loss.ts --dry-run` then live on prod (Tailscale SSH). **← only near-term action.** Internal-only marker; safe to run anytime.
3. Task 10.3 (Part J recovery emails) — **HELD until Story 9-18 ships** (operator decision 2026-06-01). Rationale: Part J sends live magic-links that pull users back into the wizard, which collides with the locked field-readiness sequencing (no wizard-bound blasts until 9-18 — `project_field_readiness_sequence_2026_05_31`). It is also a narrower sibling of **9-27 Part A** (whose blast is already 9-18-gated) and needs Resend Pro active. The abandoned-draft answers remain safe in `wizard_drafts`; only the resume-nudge decays. Revisit post-9-18 OR fold into 9-27 Part A (likely skip-as-superseded). **NOT a review→done blocker.**

> **review→done gate (revised 2026-06-01):** Part H is done and Part J is held (not a blocker), so the ONLY remaining gate is Task 2.3 — run the Part B backfill on prod (dry-run → live). Flip review→done once that completes.

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-05-20 | Parts A/C/I shipped (commit `e95b8ec`) — wizard writes submissions in same tx + docblock fix + CSV phone/NIN text-format. | SEVERE: stop active per-submission data loss within 24h. |
| 2026-06-01 | Full close-out (Amelia, dev-story): Part D regression locks (+3), Part B backfill script + audit action (+13 tests), Part J recovery script + audit action (+13 tests), AUDIT_ACTIONS 43→45, RespondentMetadata markers, Part E memory, Part F §L8, Part G sprint-status flip review + 9-12 note. tsc clean. Status ready-for-dev → review. | Operator chose full close-out over A/C/I-only. Residuals: Part H code review + Parts B/J prod one-shot runs. |
| 2026-06-01 | Part H canonical code review (separate session) — Task 8 DONE. 2 Medium + 5 Low found (no Critical/High), ALL FIXED: H-M1 recovery audit flush-safety (logActionTx), H-M2 cohort-SQL lock tests via exported buildCohortQuery (+5 tests), H-L1 no-silent-cap warnings, H-L2 AC#D1 title, H-L3 "72 hours" copy lock, H-L4 redundant email predicate removed, H-L5 redundant cast removed. tsc + lint clean; 136 affected tests green (backfill 15, recover 16, audit 38, registration.routes 33, survey-analytics 34). | Operator directive: create action items (Critical→Low) AND fix all automatically. AC#H1 satisfied; status stays review pending only the operator prod one-shot runs (2.3 + 10.3). |

### Review Follow-ups (AI)

**Implementing-session PRE-PASS (NOT the canonical Part H).** The canonical adversarial `/bmad:bmm:workflows:code-review` runs in a separate CLI/session with a different LLM (BMAD discipline). This pre-pass (2026-06-01, high-effort, 2 parallel finder agents on the uncommitted tree) surfaced 5 candidates; 3 fixed inline, 2 accepted-by-pattern. The separate-session review may surface more — its findings supersede/extend this list:

- **[FIXED][HIGH] F1 — backfill audit writes could be lost on exit.** `_backfill-wizard-questionnaire-loss.ts` used fire-and-forget `AuditService.logAction` (returns void, runs a detached hash-chain tx) in a tight, delay-free loop followed by an immediate `process.exit()`. The detached audit writes might not flush before Node exits — silently losing the forensic trail the script exists to produce, while the row marker (idempotently skipped on re-run) persists. Fixed by wrapping each row's marker-update + audit in ONE `db.transaction` using the awaited `AuditService.logActionTx(tx, …)` — atomic and flush-guaranteed.
- **[FIXED][MED] F2 — recovery email overstated link validity.** Copy said "expires in 7 days" / "Link expires in 7 days", but `wizard_resume` tokens have a **72h** TTL (`magic-link.service.ts:28`). Recipients opening on days 3–7 would hit dead links. Corrected to "72 hours".
- **[FIXED][LOW] F3 — AC#D2 test name overstated coverage.** With a mocked `db.transaction` the test verifies the controller surfaces the error (no half-state 201), not on-disk rollback. Renamed + commented to describe exactly what it locks; noted true atomicity needs an integration test.
- **[ACCEPTED][LOW] F4 — recovery script has no per-send idempotency marker.** A partial-failure re-run would re-email already-contacted recipients. This matches the production-blessed `_reengagement-email-blast.ts` sibling exactly (operator-gated, mandatory `--dry-run`, `--max-recipients` cap). Part J's AC does not require a sent-marker; matching the blessed pattern is correct. Operator mitigates via dry-run + cohort review.
- **[ACCEPTED][LOW] F5 — cohort gate checks draft `expires_at`, not link lifetime.** A still-resumable draft can be emailed a freshly-issued 72h token; "still resumable" refers to the draft, and the token is always fresh per send. Combined with the F2 copy fix, no user-facing mismatch remains.

Verifier confirmed (clean, no fix needed): AC#D3 SQL-string inspection is discriminating (not tautological); AC#D1 raw_data shape matches the controller exactly; audit-action count of 45 is correct; `IS DISTINCT FROM 'true'` JSONB idempotency check is semantically sound; all MagicLinkService/EmailService call signatures match the known-good sibling.

> Per project discipline (`feedback_review_before_commit.md` + dev-story Step 10), a second adversarial pass in a **different session/LLM** is still recommended before the commit lands — this self-review ran in the implementing session.

---

**Part H — CANONICAL adversarial code review (separate session, 2026-06-01).** Ran `/bmad:bmm:workflows:code-review` on the uncommitted tree per BMAD discipline. Independently re-verified: git-vs-File-List clean; every `[x]` task honest (Parts A/C/I confirmed live via the AC#D1 test capturing the real controller payload; the two `[ ]` items 2.3/10.3 correctly marked operator-residual); all test claims validated by re-running (67 Part D + 64 script/audit green); `wizard_resume` TTL confirmed 72h; all MagicLink/Email/Audit signatures match. **No Critical, no High** — no false claims, no unimplemented AC, no security hole. Surfaced **2 Medium + 5 Low**, ALL FIXED this session (operator chose "create action items + fix all automatically"):

- **[FIXED][MED] H-M1 — recovery script's final-send audit could be lost to the same `process.exit()` race F1 fixed in backfill.** `_recover-abandoned-wizard-drafts.ts` still used fire-and-forget `AuditService.logAction` (detached hash-chain tx, `audit.service.ts:297-301`); the inter-send delay is skipped on the last iteration, then `process.exit()` fires immediately — so the FINAL recipient's audit row could be lost (a silent forensic gap, exactly the class the per-send audit exists to prevent). F1 set the flush-safe precedent in backfill but it wasn't applied to the newly-authored recovery code. Fixed: per-send audit now runs through awaited `AuditService.logActionTx` inside its own `db.transaction` (flush-guaranteed); a post-send audit failure is logged (`recover_drafts.audit_failed`) but does NOT flip the send to `failed` (the email already went out).
- **[FIXED][MED] H-M2 — cohort-selection SQL (the highest-risk logic in both scripts) had zero automated coverage.** Both test files covered only pure helpers; `selectCohort` was guarded solely by operator dry-run eyeballing — yet the Part-J narrow-cohort predicates and Part-B window+idempotency predicates are precisely what decide who gets emailed / which rows get the irreversible marker. Fixed: extracted an exported `buildCohortQuery(args)` from each script and added `.toSQL()`-based lock tests (mirroring the AC#D3 string-assertion technique) — recover locks `? 'questionnaireResponses'` + `<> '{}'::jsonb` + `expires_at`/`NOW()` + the `--since` bound; backfill locks `= 'public'` + `IS DISTINCT FROM 'true'` + both `created_at` window bounds. +5 tests.
- **[FIXED][LOW] H-L1 — silent truncation at `--max-rows`/`--max-recipients` (default 200).** `.limit(...)` truncated with no signal when the cohort exactly filled the cap, so an operator could believe the cohort was drained (violates the project "no silent caps" value). Fixed: both scripts now warn loudly (`*.cap_hit`) when `cohort.length === limit`.
- **[FIXED][LOW] H-L2 — AC#D1 test title field-count mismatch.** Title said "all 11 fields" but asserted 13 and the Dev Agent Record says "13-field"; retitled to "all 13 unified-pipeline fields (8 identity + 3 wizard-extra + 2 answers)".
- **[FIXED][LOW] H-L3 — `buildEmail` test didn't lock the "72 hours" copy (the F2 fix).** A regression back to "7 days" would have passed CI. Added an assertion that both bodies contain "72 hours" and NOT "7 days".
- **[FIXED][LOW] H-L4 — redundant query predicate.** Recovery `selectCohort` filtered `form_data->>'email' IS NOT NULL`, a no-op (the `email` column is `NOT NULL UNIQUE` and is what we send to). Removed. (The `recovery_email_eligible` field written-but-unread is RETAINED — documented as intentional forward-compat for a later disposition pass, not dead code.)
- **[FIXED][LOW] H-L5 — redundant `rows as RespondentRow[]` cast** in backfill `selectCohort`; removed (the Drizzle select is already typed).

**Part H result:** tsc clean, lint clean, 136 affected tests green (backfill 15, recover 16, audit 38, registration.routes 33, survey-analytics 34). All Medium + Low fixed. Code-review gate (AC#H1) SATISFIED. Status stays **review** — the only remaining `done` gate is the two operator one-shot prod runs (Task 2.3 backfill + Task 10.3 recovery via Tailscale SSH); flip review→done after those execute.

## File List

**Already shipped (commit `e95b8ec`, Parts A/C/I — listed for traceability, NOT re-touched this session):**
- `apps/api/src/controllers/registration.controller.ts` (submitWizard writes submissions in same tx)
- `apps/api/src/services/submission-processing.service.ts` (docblock fix, Part C)
- `apps/api/src/services/export.service.ts` (ExportColumn.format + tab prefix, Part I)
- `apps/api/src/controllers/export.controller.ts` (phone/NIN format: 'text', Part I)

**Created this session (2026-06-01 close-out):**
- `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts` (new, one-shot — Part B)
- `apps/api/scripts/_recover-abandoned-wizard-drafts.ts` (new, one-shot — Part J)
- `apps/api/scripts/__tests__/_backfill-wizard-questionnaire-loss.test.ts` (new, +13 tests)
- `apps/api/scripts/__tests__/_recover-abandoned-wizard-drafts.test.ts` (new, +13 tests)
- `<project-memory>/feedback_unified_ingestion_pipeline.md` (new memory — Part E)

**Modified this session:**
- `apps/api/src/services/audit.service.ts` (+2 AUDIT_ACTIONS: OPERATOR_BACKFILL_DATA_LOSS_MARKER, OPERATOR_RECOVERY_EMAIL_SENT; 43→45)
- `apps/api/src/db/schema/respondents.ts` (RespondentMetadata: questionnaire_data_lost / lost_at / recovery_email_eligible)
- `apps/api/src/routes/__tests__/registration.routes.test.ts` (Part D — AC#D1 raw_data shape + AC#D2 error-propagation)
- `apps/api/src/services/__tests__/survey-analytics.service.test.ts` (Part D — AC#D3 wizard-visibility + no source exclusion)
- `apps/api/src/services/__tests__/audit.service.test.ts` (count 43→45 + comment)
- `_bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md` (§L8 root-cause lesson — Part F)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (9-26 → review + 9-12 AC#G2 note — Part G)
- `<project-memory>/MEMORY.md` (Key Patterns index line — Part E)
- `_bmad-output/implementation-artifacts/9-26-unified-ingestion-pipeline.md` (this file — Status, tasks, Dev Agent Record)

## Cohort A disposition cross-reference

The 63 already-completed wizard respondents whose Step 4 was dropped pre-9-26 are **Cohort A**. Their disposition is tracked in **Story 9-28** (`9-28-cohort-a-step4-recovery-decision.md`). Operator chose Path B (targeted supplemental-survey recovery) on 2026-05-22 with Option 2 wording. The 9-28 implementation (Phase A + Phase B) ships the recovery script + landing page that lets these respondents re-submit their Step 4 answers via a `supplemental_survey` magic-link.
