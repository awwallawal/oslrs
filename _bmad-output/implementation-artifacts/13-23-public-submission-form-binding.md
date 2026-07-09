# Story 13-23: Public submissions not bound to their form (`questionnaire_form_id` sentinel since the Public Core split)

Status: ready-for-dev

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
- [ ] **Task 1 (AC1)** — trace Step4 stamp → draft autosave PATCH → server-persisted `formData`; capture why `questionnaireFormId` is missing at submit for public regs since the Public Core split.
- [ ] **Task 2 (AC2)** — stamp the form UUID (`questionnaireForms.id`) into the draft (fix both the persistence gap and the slug→UUID bug); end-to-end verify the submitted row binds + joins.
- [ ] **Task 3 (AC3)** — real-path integration guard + loud fallback (WARN/metric on sentinel).
- [ ] **Task 4 (AC4)** — idempotent backfill of determinable sentinel rows (Modupe + real completers); dry-run → apply on the box.
- [ ] **Task 5 (AC5)** — full suites + tsc/eslint.

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
### File List

## PM Validation (John, 2026-07-09)

**Validated — approved. MEDIUM-HIGH; strongly recommended before the blast, but NOT a hard registration-blocker.**

1. **Priority nuance:** registrations themselves are fine — the respondent is created, the reference code is issued, occupation/skills/LGA all persist. So the blast *could* fire without this. BUT it would make **every** public registrant a `no-form-pinned-at-submit` row → the entire launch cohort unattributable-to-form and excluded from form-joined analytics. Fixing before the blast means the cohort binds correctly from registration #1. **If the fix is small (a client stamp + UUID correction), do it pre-blast.** If AC1 uncovers something deep, it's survivable as a fast-follow + backfill.
2. **AC3 (loud fallback) is the keystone — non-negotiable regardless of schedule.** This is the *same* failure mode as 13-21: a silent fallback hid a whole-channel defect since launch, only caught by a hand-checked dry-run. A counted WARN/metric on the sentinel is the durable lesson; ship it even if the stamp fix takes a beat.
3. **AC2 slug→UUID: mirror 13-16 exactly.** The human `formId` is not the join key; `questionnaireForms.id` (UUID) is. This is the identical class of bug as the LGA UUID/slug split — same discipline, same guard.
4. **AC4 backfill:** yes to Modupe + real post-split completers, but ONLY bind to a form UUID that's **unambiguously** determinable from the pin history / form `created_at` window. Where the pin changed and attribution is ambiguous, document and leave — do not guess. This also *completes* Modupe's form lineage (nice recovery for the first real registrant).
5. **Sequencing vs 13-21:** both emerged from the same launch-prep, both are "silent fallback hid it" bugs, and they touch **independent** code paths (email send vs form-id stamp) so they don't conflict. 13-21 (the dead referral loop) is the higher user-facing value; this is the higher data-lineage value. Order by whichever dev capacity frees first; neither blocks the other.

**No AC changes.** Dev-ready.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-09 | Story drafted via *create-story — public submissions record a `no-form-pinned-at-submit` sentinel instead of the pinned form UUID (since the 13-14 Public Core split, incl. Modupe). Root-caused: the wizard draft doesn't persist the form id at submit, and Step4 stamps the human slug not the joinable UUID. Fix the persistence + slug→UUID + loud fallback + backfill. EMERGENT from the 13-19/13-20 Dry-run #1. | Bob (SM) |
