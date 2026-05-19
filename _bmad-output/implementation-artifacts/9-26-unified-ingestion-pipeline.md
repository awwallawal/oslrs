# Story 9.26: Unified ingestion pipeline — wizard writes submissions + CSV phone-format fix + recovery email

Status: ready-for-dev

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

- [ ] **Task 1 (Part A) — Wizard handler writes submissions** (AC: #A1-A5)
  - [ ] 1.1: In `submitWizard`, fetch `questionnaireFormId` from wizard_draft BEFORE the existing delete
  - [ ] 1.2: Add `tx.insert(submissions).values({...})` after the respondents insert
  - [ ] 1.3: Move audit-log JSONB to include `submissionId`
- [ ] **Task 2 (Part B) — Backfill loss marker** (AC: #B1-B3)
  - [ ] 2.1: Author `_backfill-wizard-questionnaire-loss.ts` script
  - [ ] 2.2: New audit action `OPERATOR_BACKFILL_DATA_LOSS_MARKER`
  - [ ] 2.3: Run on prod via SSH after Part A deploys
- [ ] **Task 3 (Part C) — Docblock fix** (AC: #C1)
- [ ] **Task 4 (Part D) — Tests** (AC: #D1-D6)
- [ ] **Task 5 (Part E) — Memory + MEMORY.md** (AC: #E1-E2)
- [ ] **Task 6 (Part F) — Story 9-12 § L7** (AC: #F1)
- [ ] **Task 7 (Part G) — Sprint-status + 9-12 note** (AC: #G1-G2)
- [ ] **Task 8 (Part H) — Pre-merge code review** (AC: #H1)
- [ ] **Task 9 (Part I) — CSV phone-format fix** (AC: #I1-I4)
  - [ ] 9.1: Extend `ExportColumn` interface with optional `format` field
  - [ ] 9.2: Update `generateCsvExport()` to apply tab prefix for text-formatted columns
  - [ ] 9.3: Mark phoneNumber + nin columns as `format: 'text'` in export.controller
- [ ] **Task 10 (Part J) — Recovery email script** (AC: #J1-J4)
  - [ ] 10.1: Author `_recover-abandoned-wizard-drafts.ts`
  - [ ] 10.2: New audit action `OPERATOR_RECOVERY_EMAIL_SENT`
  - [ ] 10.3: Dry-run first; then live run on prod via SSH after Part A deploys

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

## File List

(Populated by dev agent. Expected:)
- `apps/api/src/controllers/registration.controller.ts` (modified — submissions insert added)
- `apps/api/src/services/submission-processing.service.ts` (modified — docblock fix)
- `apps/api/src/services/audit.service.ts` (modified — new action codes)
- `apps/api/src/services/export.service.ts` (modified — text format support)
- `apps/api/src/controllers/export.controller.ts` (modified — column format annotations)
- `apps/api/src/controllers/__tests__/registration.controller.test.ts` (modified — submissions assertion)
- `apps/api/src/services/__tests__/survey-analytics.service.test.ts` (modified — wizard fixture)
- `apps/api/src/services/__tests__/export.service.test.ts` (modified — text-format tests)
- `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts` (new, one-shot)
- `apps/api/scripts/_recover-abandoned-wizard-drafts.ts` (new, one-shot)
- `_bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md` (modified — § L7 added)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — 9-26 entry)
- `MEMORY.md` + `feedback_unified_ingestion_pipeline.md` (memory consolidation)
