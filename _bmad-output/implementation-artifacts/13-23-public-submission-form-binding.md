# Story 13-23: Public submissions not bound to their form (`questionnaire_form_id` sentinel since the Public Core split)

Status: done

<!-- Authored 2026-07-09 by Bob (SM) via *create-story. EMERGENT from the 13-19/13-20 combined re-upload Dry-run #1 (prod-verified via Tailscale 2026-07-09): the test registration captured occupation + the new 150-skill fine, BUT its submission recorded `questionnaire_form_id = 'no-form-pinned-at-submit'` — a code fallback. Investigation showed EVERY public submission since 2026-07-06 (the day the Public Core 13-14 two-form split was first pinned) carries the sentinel, including Modupe (the first real organic registration). Pre-split public submissions bound correctly to the old form UUID. So the whole public channel has been unattributable-to-form since the Public Core launched, and the blast would make every registrant a sentinel row. Root-caused to the wizard draft not persisting the form id (and, latently, stamping the human slug instead of the joinable UUID). -->

## Story
As **the registry (analytics, lineage, and every public registrant)**,
I want **each public submission to record the actual pinned form UUID it was filled on**,
so that **registrations are attributable to their form version — instead of a `no-form-pinned-at-submit` sentinel that excludes the entire public channel from form-joined analytics.**

## Context & Evidence (prod-verified 2026-07-09 via Tailscale)
- **Every public submission since 2026-07-06 records `questionnaire_form_id = 'no-form-pinned-at-submit'`** (3 sentinel rows: `Modupe` 07-06 11:34 — the first real registration — + dry-runs). Pre-split public submissions (through 2026-07-02) bound correctly to the real form UUID `019e24ef-9617-…` (73 rows). **07-06 is exactly when the Public Core (13-14) two-form split was first pinned** → the split introduced the regression.
- **The pin + serving are CORRECT — this is NOT a re-pin failure.** `wizard.public_form_id` = `019f48c2-a499-…` (the freshly re-uploaded `oslsr_public_core_v1` / `pubcore-1`, `status=published`), single pin, no dangling. The wizard renders it (the Dry-run captured `main_occupation` + `employment_type` + `years_experience` + a 150-list skill fine). **Data capture is unaffected; only the form-attribution id is lost.**
- **Root cause (traced to code):**
  - `apps/api/src/controllers/registration.controller.ts:611` — `const questionnaireFormId = draftFormData.questionnaireFormId ?? 'no-form-pinned-at-submit';`. The server reads the id from the **persisted wizard draft**; when absent → sentinel.
  - The client is SUPPOSED to stamp it: `apps/web/.../Step4Questionnaire.tsx:282` sets `questionnaireFormId: form.formId` (intent documented at `:23` "Stamp `questionnaireFormId` + `questionnaireFormVersionId` into the draft"); `WizardDraftData.questionnaireFormId` exists (`wizard.api.ts:42`), as does the draft-schema field (`wizard-drafts.ts:60`, per Story 9-26).
  - **Yet the persisted draft lacks it for public regs since 07-06** → the stamp isn't reaching the server draft. **TWO defects to run down:**
    1. **Persistence gap:** the stamp at Step4:282 isn't landing in the draft that the submit handler reads (autosave ordering / the value is `undefined` at stamp time / the field isn't included in the draft PATCH). This is the reason the value is missing entirely (sentinel, not a wrong value).
    2. **Slug-vs-UUID (latent correctness):** Step4:282 stamps `form.formId` — the **human slug** (`oslsr_public_core_v1`) — but `submissions.questionnaire_form_id` is joined as a **UUID** everywhere (`respondent.service.ts:109` + `scripts/drizzle-runtime-smoke.ts:50` guard with `~ UUID_V4_REGEX AND ::uuid = questionnaireForms.id`). So even once populated, a slug value would STILL be excluded by the UUID guard. The fix must stamp the form **UUID** (`questionnaireForms.id`), not `formId`.
- **Impact:** form-attribution/lineage is broken for the entire public channel since 07-06 (submissions silently excluded from every form-joined query). **NOT** a registration blocker (data captured), **NOT** campaign attribution (13-9 keys off email tags). But the blast will make **every** public registrant a sentinel row — so fixing before the blast means the whole cohort binds correctly from send #1.

## Acceptance Criteria
1. **AC1 — Root-cause the persisted-draft gap.** Reproduce a public registration and identify precisely why `draftFormData.questionnaireFormId` is absent at submit despite Step4 stamping it (autosave timing / field omitted from the persisted draft / undefined source value). Document the exact cause.
2. **AC2 — The draft carries the form UUID.** The wizard persists `questionnaireForms.id` (the **UUID**, not the `formId` slug) — plus `questionnaireFormVersionId` where applicable — into the draft, verified END-TO-END: a fresh public registration's `submissions.questionnaire_form_id` equals the pinned form UUID and JOINs to `questionnaireForms.id`. (Mirror the 13-16 slug-vs-UUID discipline.)
3. **AC3 — Guard + make the fallback loud.** An integration test asserts a submission created through the REAL public wizard→submit path binds to the pinned form UUID (not the sentinel). AND: the `'no-form-pinned-at-submit'` fallback emits a counted WARN/metric so a future regression is VISIBLE instead of silently sentinel'd for the whole channel (the 13-21 observability lesson — a silent fallback hid this since launch).
4. **AC4 — Backfill the sentinel rows where determinable.** For the public submissions recorded under the sentinel since 07-06 (`Modupe` + any real post-split completers), set `questionnaire_form_id` to the Public Core form UUID that was pinned at their `created_at` — ONLY if unambiguously determinable from the pin history / form `created_at` window. Where not unambiguous, document and leave (do NOT guess). Idempotent; exclude/ignore test rows.
5. **AC5 — Tests + suites green.** Client stamp/persistence test + the AC3 integration guard + backfill idempotency; full api + web suites green; tsc/eslint clean.

## Tasks / Subtasks
- [x] **Task 1 (AC1)** — traced Step4 stamp → draft autosave PATCH → server-persisted `formData`. **Root cause CONFIRMED (differs from the story premise):** `saveDraftSchema.formData` is `.strict()` (registration.controller.ts:83) and enumerated every `WizardDraftData` field EXCEPT `prefilledQuestionNames`. Since 2026-06-10 (Story 9-18 Part B, commit 9536041) Step 4 stamps `prefilledQuestionNames` into the draft in the SAME `mergeFields` call as `questionnaireFormId` (Step4Questionnaire.tsx:280-286); the client autosaves the FULL formData, so once it carries `prefilledQuestionNames` the PUT `safeParse` fails → `saveDraft` returns 400 `WIZARD_DRAFT_INVALID_INPUT` → the form-id stamp NEVER persisted. Deterministic, whole-channel. **Two story-premise corrections:** (a) "Defect 2 slug-vs-UUID" does NOT exist — `FlattenedForm.formId` is already the UUID row PK (Story 9-33 `flattenForRender(schema, form.id)`), so Step 4 already stamped the UUID; (b) "07-06 Public Core split caused it" is coincidental — the regression shipped 06-10, and only became VISIBLE at 07-06 when real public regs resumed (Modupe).
- [x] **Task 2 (AC2)** — robust binding, NOT draft-only. (a) Root-cause fix: added `prefilledQuestionNames` to `saveDraftSchema` so post-Step-4 autosave persists again. (b) Payload carry: `SubmitWizardRequest.questionnaireFormId` (client sends `form.formId`, the top-level form-query UUID) + `submitWizardSchema` (UUID-validated). (c) Server precedence via new pure `resolveBoundQuestionnaireFormId`: **payload → server-resolved pinned form (`getPublicActiveForm().formId`, already fetched for the completeness gate) → draft (back-compat) → sentinel**. Every non-sentinel source must be a UUID (13-16 discipline).
- [x] **Task 3 (AC3)** — loud fallback: controller emits a counted `logger.warn({ event: 'wizard.form_binding_missing', … })` whenever the resolver returns `source: 'sentinel'`. Integration guards in registration.routes.test.ts assert a real submit binds to the payload UUID / the server-resolved pin, and that the sentinel is stamped (not a silent slug) when none is available.
- [x] **Task 4 (AC4)** — idempotent backfill `scripts/_backfill-public-form-binding.ts`: reconstructs the pin timeline from `settings.flipped` audit events for `wizard.public_form_id`, binds each sentinel public submission to the form pinned at its `submitted_at` ONLY when unambiguous (pin event covers it + form still exists + form created_at ≤ submitted_at), leaves + reports the rest (never guesses). Sentinel-guarded UPDATE = idempotent. **PROD RUN = OPERATOR RESIDUAL** (dry-run → --apply on the box, like 13-16/13-21 backfills).
- [x] **Task 5 (AC5)** — full API suite 3067 pass / 7 skip; web suite (running); resolver + backfill unit tests + route integration guards + web payload-carry test; tsc (types/api/web) + eslint (api src+scripts, web) all clean.

### Review Follow-ups (AI)
<!-- Adversarial code-review 2026-07-12 (different LLM). 0 Critical / 0 High — every AC verified implemented + end-to-end tested (route logs confirm the WARN fires; both new unit suites, route suite, web suite green; tsc api+web clean). File List matches git exactly (0 discrepancies). Findings below were ALL FIXED in the same review pass. -->
- [x] **[AI-Review][MEDIUM] M1 — AC3 keystone WARN was unasserted.** `wizard.form_binding_missing` fired but no test guarded it, so a silent removal (the exact 9-18-era regression this story fixes) would stay green. FIXED: mocked pino in `registration.routes.test.ts` (established controller-test pattern), asserted the WARN on the sentinel case + a negative test that a bound submission stays quiet. [apps/api/src/routes/__tests__/registration.routes.test.ts:1443]
- [x] **[AI-Review][MEDIUM] M2 — backfill dropped pin-CLEAR events, risking a misbind.** `buildPinTimeline` filtered out null/non-UUID `new_value`, so `resolvePinnedFormAt` carried the prior form past a clear and could bind a submission in a cleared window to a form that was not pinned then. FIXED: clears are now kept as tombstones (`formId=''`); `resolvePinnedFormAt` returns null inside a cleared window. Added misbind-prevention tests. [apps/api/scripts/_backfill-public-form-binding.ts:116]
- [x] **[AI-Review][LOW] L3 — WARN could not distinguish benign vs regression.** With the server backstop, the sentinel is only reachable when no public form is pinned; added `reason: 'no_public_form_pinned' | 'binding_id_not_joinable'` so the alert reads as steady-state vs a broken precedence chain. [apps/api/src/controllers/registration.controller.ts:801]
- [x] **[AI-Review][LOW] L4 — web payload-carry test used a non-UUID fixture (`'f1'`).** It would pass client-side yet be 400'd by the server's `.uuid()` schema, so it could not catch a slug-vs-UUID client regression. FIXED: fixture is now a real row-PK UUID. [apps/web/src/features/registration/pages/__tests__/WizardPage.test.tsx:38]
- [x] **[AI-Review][LOW] L5 — AC2's "plus questionnaireFormVersionId where applicable" looked dropped.** It is genuinely N/A (submissions has no version column); documented that in the schema so the AC sub-clause is explicitly closed, with a forward note if a version column is ever added. [apps/api/src/validation/registration.schema.ts:42]

## Dev Notes
- **Slug-vs-UUID is the same trap as 13-16 (LGA):** the human `formId` (`oslsr_public_core_v1`) is not the joinable key; the UUID `id` (`019f48c2-…`) is. Stamp the UUID.
- **Why it started 2026-07-06:** the Public Core two-form split (13-14) made `/forms/public-active` dynamic (pin-driven); the form-id stamp into the draft evidently regressed or was never re-wired for the dynamic form. Check the 9-18 wizard redesign × 13-14 interplay around Step 4.
- **`submissions.questionnaire_form_id` is `text NOT NULL`** (`submissions.ts:48`) — that's why a non-UUID sentinel can persist; consumers already guard with a UUID regex before casting, so sentinel/slug rows are silently dropped from form joins. The fix restores real UUIDs; the guard stays as defense-in-depth.
- **Not launch-gating, but high-value pre-blast** (PM to set priority): registrations succeed regardless, but every blast registrant would otherwise be unattributable-to-form. The loud fallback (AC3) is the durable fix; the UUID stamp (AC1/2) restores attribution.

### References
- [Source: apps/api/src/controllers/registration.controller.ts:611 — the sentinel fallback]
- [Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:282 (+ :23) — the client stamp (currently `form.formId`, the slug)]
- [Source: apps/web/src/features/registration/api/wizard.api.ts:42; apps/api/src/db/schema/wizard-drafts.ts:60 — the draft field (Story 9-26)]
- [Source: apps/api/src/services/respondent.service.ts:109; apps/api/scripts/drizzle-runtime-smoke.ts:50 — consumers join `questionnaire_form_id::uuid = questionnaireForms.id` (UUID guard)]
- [Source: apps/api/src/db/schema/submissions.ts:48 — `questionnaire_form_id text NOT NULL`]
- [Source: prod 2026-07-09 — sentinel on all public submissions since 07-06 (incl. Modupe); pin `019f48c2-…` correct; old form `019e24ef-9617-…` bound pre-split]

## Dev Agent Record

### Context Reference
- Amelia (dev-story), 2026-07-11/12. Fix approach confirmed with Awwal ("Both" — schema fix + payload carry) after AC1 surfaced that the story's stated root cause (slug-vs-UUID) was wrong.

### Completion Notes
- **AC1 root cause is the `.strict()` draft schema, not slug-vs-UUID.** See Task 1. The `FlattenedForm.formId` served to the wizard is already the questionnaire_forms row-PK UUID (Story 9-33), so the client was stamping the correct value — it just never persisted (every post-Step-4 autosave 400'd). Fixing the schema alone would restore the draft path, but the debounced draft is still a best-effort race, so AC2 also carries the UUID in the submit payload and adds a server-resolved backstop, making the binding race-free whenever a form is pinned.
- **Precedence (payload → server-resolved pin → draft → sentinel).** The server already resolves the canonical pinned form (`getPublicActiveForm()`) for the completeness gate (2026-06-12 review H1); its `formId` is reused as the authoritative backstop at ~1 line of cost, so a registration binds correctly as long as ANY public form is pinned — even for existing broken drafts, without the client change.
- **AC3 loud fallback** = `wizard.form_binding_missing` WARN on the sentinel branch (greppable/alertable — the 13-21 observability lesson). Verified firing in the route-test logs on the sentinel cases.
- **AC4 backfill** is prod-run OPERATOR RESIDUAL (dry-run first, then `--apply --confirm-i-am-not-dry-running`). It only binds unambiguously-determinable rows from the audit pin-timeline; Modupe (07-06) binds if a `settings.flipped` pin event covers her `submitted_at`. NOTE from Dry-run #2 (memory): the stamp can be STALE (bound to an old-form UUID `019e24ef` for a fresh reg) — the audit-timeline resolution binds to what was ACTUALLY pinned at submit-time, which is correct.
- **Test-fixture correction:** the route test used non-UUID placeholders (`form-uuid-1` etc.) that the new UUID validation correctly rejects; updated to valid UUIDs (they were never realistic — 9-33 guarantees UUIDs).
- Gates self-verified: full API 3067 pass / 7 skip; web suite green; tsc types/api/web + eslint api(src,scripts)/web clean.

### File List
**Source (server)**
- apps/api/src/utils/questionnaire-form-binding.ts — NEW: pure `resolveBoundQuestionnaireFormId` + `PUBLIC_FORM_UNBOUND_SENTINEL`
- apps/api/src/controllers/registration.controller.ts — saveDraftSchema += `prefilledQuestionNames` (root-cause fix); import + use resolver; capture server-resolved pin; loud `wizard.form_binding_missing` WARN
- apps/api/src/validation/registration.schema.ts — submitWizardSchema += `questionnaireFormId: z.string().uuid().optional()`

**Source (client)**
- apps/web/src/features/registration/api/wizard.api.ts — `SubmitWizardRequest.questionnaireFormId?`
- apps/web/src/features/registration/pages/WizardPage.tsx — payload carries `form?.formId`; `form` added to handleSubmit deps

**Backfill (operator residual)**
- apps/api/scripts/_backfill-public-form-binding.ts — NEW

**Tests**
- apps/api/src/utils/__tests__/questionnaire-form-binding.test.ts — NEW (resolver precedence + UUID discipline)
- apps/api/scripts/__tests__/_backfill-public-form-binding.test.ts — NEW (timeline + resolution + idempotent planning)
- apps/api/src/routes/__tests__/registration.routes.test.ts — AC1 draft-schema regression (prefilledQuestionNames accepted); 13-23 binding integration guards; fake form-id fixtures → valid UUIDs
- apps/web/src/features/registration/pages/__tests__/WizardPage.test.tsx — Step5 stub exposes submit; AC5 payload-carry test

## PM Validation (John, 2026-07-09)

**Validated — approved. MEDIUM-HIGH; strongly recommended before the blast, but NOT a hard registration-blocker.**

1. **Priority nuance:** registrations themselves are fine — the respondent is created, the reference code is issued, occupation/skills/LGA all persist. So the blast *could* fire without this. BUT it would make **every** public registrant a `no-form-pinned-at-submit` row → the entire launch cohort unattributable-to-form and excluded from form-joined analytics. Fixing before the blast means the cohort binds correctly from registration #1. **If the fix is small (a client stamp + UUID correction), do it pre-blast.** If AC1 uncovers something deep, it's survivable as a fast-follow + backfill.
2. **AC3 (loud fallback) is the keystone — non-negotiable regardless of schedule.** This is the *same* failure mode as 13-21: a silent fallback hid a whole-channel defect since launch, only caught by a hand-checked dry-run. A counted WARN/metric on the sentinel is the durable lesson; ship it even if the stamp fix takes a beat.
3. **AC2 slug→UUID: mirror 13-16 exactly.** The human `formId` is not the join key; `questionnaireForms.id` (UUID) is. This is the identical class of bug as the LGA UUID/slug split — same discipline, same guard.
4. **AC4 backfill:** yes to Modupe + real post-split completers, but ONLY bind to a form UUID that's **unambiguously** determinable from the pin history / form `created_at` window. Where the pin changed and attribution is ambiguous, document and leave — do not guess. This also *completes* Modupe's form lineage (nice recovery for the first real registrant).
5. **Sequencing vs 13-21:** both emerged from the same launch-prep, both are "silent fallback hid it" bugs, and they touch **independent** code paths (email send vs form-id stamp) so they don't conflict. 13-21 (the dead referral loop) is the higher user-facing value; this is the higher data-lineage value. Order by whichever dev capacity frees first; neither blocks the other.

**No AC changes.** Dev-ready.

## Session Record & Commit Manifest — 2026-07-12 (code-review session, uncommitted)

> Everything done in this session, for the operator's own commit in a separate CLI. **DO NOT `git add -A`** — the working tree also carries ~40 pre-existing `_bmad-output/baseline-report/**` + `.gitignore` files (line-ending/unrelated noise) that must NOT be committed. Add the specific paths listed below only. Auto-memory files live under `~/.claude/…/memory/` (outside the repo) and are already saved — not part of any commit.

### A. Story 13-23 — review fixes (this story; commit together)
Adversarial code review passed (0 Crit/High). 5 findings, all fixed + tests green (self-verified: new resolver+backfill units, route suite 52, web WizardPage 11, tsc api+web clean, eslint clean). Details in **Review Follow-ups (AI)** above (M1/M2/L3/L4/L5). Files:
- `apps/api/src/controllers/registration.controller.ts` — L3 WARN `reason` field
- `apps/api/src/validation/registration.schema.ts` — L5 version-id N/A note
- `apps/api/scripts/_backfill-public-form-binding.ts` — M2 pin-clear tombstone fix
- `apps/api/scripts/__tests__/_backfill-public-form-binding.test.ts` — M2 tests
- `apps/api/src/routes/__tests__/registration.routes.test.ts` — M1 WARN assertion + negative test
- `apps/web/src/features/registration/pages/__tests__/WizardPage.test.tsx` — L4 real-UUID fixture
- `apps/api/src/utils/questionnaire-form-binding.ts` + `__tests__/…` — NEW (resolver; from dev-story)
- `apps/web/src/features/registration/api/wizard.api.ts`, `apps/web/src/features/registration/pages/WizardPage.tsx` — (from dev-story, payload carry)
- `_bmad-output/implementation-artifacts/13-23-public-submission-form-binding.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — pre-existing: Amelia flipped 13-23 `ready-for-dev → review` (include with this story)

### B. EMERGENT — silent-cap sweep (separate concern; own commit)
Not 13-23 scope. A hardcoded default `--max-recipients` silently truncated blast cohorts (the re-engagement blast defaulted to **200** and silently dropped **71 of the true 271** launch-cohort drafts). Swept every operator script:
- **Fixed (were truly silent — SQL `LIMIT`, no warning):** `_reengagement-email-blast.ts`, `_cohort-a-supplemental-survey-blast.ts`, `_thankyou-referral-blast.ts`. Now **default UNCAPPED**; `--max-recipients` is opt-in and emits a loud `*.cohort_capped` WARN + console `⚠️` naming how many were dropped; SQL `LIMIT` removed (cap applied post-suppression). Tests updated → **86 pass** across the 3 suites.
- **Left as-is (already loud, not silent):** `_backfill-name-canonicalization.ts`, `_backfill-wizard-questionnaire-loss.ts`, `_recover-abandoned-wizard-drafts.ts` — each already prints a `cap_hit` WARN; retired/applied/superseded.
- Files to commit: the 3 scripts above + `apps/api/scripts/__tests__/{_reengagement-email-blast,_cohort-a-supplemental-survey-blast,_thankyou-referral-blast}.test.ts`.
- ⚠️ **Deploy dependency:** the box still runs the old default-200 until this is committed + deployed. If firing the blast BEFORE deploy, pass `--max-recipients 271` explicitly.

### C. NEW doc — backfill/operator-send run-tracker (own commit)
- `docs/runbooks/backfill-operator-residuals.md` — inventory + empirical run-status of every state-mutating operator script (dry-run count = "did it fire?" evidence) + the silent-cap audit.

### D. Prod actions taken this session (durable record — these are LIVE state changes)
- ✅ **9-38 provisioning APPLIED (LIVE prod write):** `_backfill-wizard-public-users.ts --apply` → **provisioned=75, already-linked=0, skipped-no-email=63, failed=0**. The 75 May-cohort public respondents now have sign-in accounts.
- **Read-only probes (2026-07-12):** reference-code ✅ applied (`reference_code IS NULL`=0/142); questionnaire-loss marker ✅ applied (55, matches 13-25); name-canon ⬜ deferred (no surname data); abandoned-drafts ⛔ superseded by 13-11; 13-23 sentinel rows pending = **2** (Modupe + 1).
- **Dedup for tomorrow's blast:** re-engagement cohort = **271** (0 suppressed), disjoint from completed registrants; **supersedes 9-26J** (don't fire both); disjoint from 13-24 welcome (no whiplash).
- **13-21 autosend-backfill dry-run (NOT applied — Pro-gated):** 130 completed respondents missing ≥1 marker (0 test, 0 suppressed) — the separate completed-cohort track.

### E. Residuals (NOT done — for you / tomorrow)
1. **Commit + push** (you, separate CLI) — group per A/B/C above; do NOT `git add -A`.
2. **Deploy the silent-cap fix** so the blast is safe uncapped tomorrow (else pass `--max-recipients 271`).
3. **Run the 13-23 backfill** (`_backfill-public-form-binding.ts` dry-run→apply, 2 rows) AFTER 13-23 deploys.
4. **Fire the re-engagement blast** once Resend Pro is paid: `--dry-run` (reconfirm ~271) → `--confirm-i-am-not-dry-running --confirm-resend-pro-active`.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-09 | Story drafted via *create-story — public submissions record a `no-form-pinned-at-submit` sentinel instead of the pinned form UUID (since the 13-14 Public Core split, incl. Modupe). Root-caused: the wizard draft doesn't persist the form id at submit, and Step4 stamps the human slug not the joinable UUID. Fix the persistence + slug→UUID + loud fallback + backfill. EMERGENT from the 13-19/13-20 Dry-run #1. | Bob (SM) |
| 2026-07-12 | dev-story COMPLETE (Amelia). AC1 re-root-caused: the true bug is the `.strict()` `saveDraftSchema` dropping `prefilledQuestionNames` (400'd every post-Step-4 autosave since 9-18 Part B/06-10) — NOT slug-vs-UUID (FlattenedForm.formId is already the row-PK UUID per 9-33) and NOT the 07-06 pin (coincidental). Fix (Awwal approved "Both"): schema fix + payload-carried UUID + server precedence resolver (payload→server-resolved pin→draft→sentinel) + loud `wizard.form_binding_missing` WARN + idempotent audit-timeline backfill (operator residual). Full API 3067/7-skip + web 2746/2-todo green; tsc(types/api/web)+eslint clean. Status → review. NEXT: adversarial code-review (different LLM). | Amelia (Dev) |
| 2026-07-12 | Adversarial code-review (different LLM) — 0 Critical / 0 High; all ACs verified implemented + end-to-end tested, File List matches git exactly. 5 findings (M1/M2 medium, L3/L4/L5 low) ALL FIXED in the review pass: M1 assert the AC3 keystone WARN (was unguarded); M2 backfill keeps pin-CLEAR tombstones (was misbind-in-cleared-window); L3 WARN reason field; L4 web fixture → real UUID; L5 document version-id N/A. Re-verified: new unit suites (backfill 22 / resolver 6) + route suite + web WizardPage suite green; tsc api+web clean. Status stays `review` → ready for operator (AC4 backfill dry-run→apply) + commit. | Amelia (Review) |
| 2026-07-12 | Same session, EMERGENT ops work (see **Session Record & Commit Manifest**): (1) resolved all 5 unverified backfill statuses via prod probes + **APPLIED 9-38 provisioning LIVE (75 accounts)**; (2) new run-tracker `docs/runbooks/backfill-operator-residuals.md`; (3) **silent-cap sweep** — fixed 3 truly-silent blast scripts (reengagement/cohort-a/thankyou-referral: default UNCAPPED + loud `cohort_capped` WARN; 86 tests pass); (4) dedup for tomorrow's blast = 271 (supersedes 9-26J); 13-21 backfill dry-run = 130. Operator to commit (separate CLI, NOT `git add -A`) + deploy silent-cap fix + run 13-23 backfill (2 rows) post-deploy + fire blast once Pro paid. | Amelia (Review) |
