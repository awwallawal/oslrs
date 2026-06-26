# Story 13.1: Campaign Attribution Capture — UTM/`?ref` + "How did you hear about us?" → `raw_data.campaign_source`

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-25 by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 🚦 PRE-SPEND — target LIVE before MONDAY 2026-06-29 (the first radio jingle). Pre-flight gate item #3. -->

## Story

As the **Builder / PM running a five-channel launch (radio · paid social · association cascade · enumerators · organic)**,
I want **every public registration to carry the acquisition channel it came from — both the objective UTM/`?ref` signal AND a self-reported "How did you hear about us?" answer — merged into `submissions.raw_data.campaign_source` at submit**,
so that **after launch I can split registrations by channel, compute cost-per-registration (CPA = spend ÷ completions), renew radio on evidence, kill a weak platform, and steer enumerators — instead of firing five channels blind into a permanent dark window.**

## Context & Why This Gates Spend

The launch fires **five channels at once**. Attribution is currently **ABSENT** (verified): `respondents.source` records the *method* (`enumerator | public | clerk | imported_*`), not the acquisition *channel*; the wizard reads **only** `?token=` (resume) on entry [Source: apps/web/src/features/registration/pages/WizardPage.tsx:97-99]; Cloudflare Web Analytics is privacy-first and has no per-registration channel. Firing paid spend without per-channel attribution is exactly the project's own anti-pattern — "install analytics BEFORE launch; post-launch instrumentation is a permanent dark window" [Source: docs/launch-campaign/attribution-spec.md:5].

This story is **🚦 pre-spend gate item #3**. The Monday meeting + sheet distribution are zero-cost and proceed regardless; **radio + paid social wait on this being live + verified** (radio is movable 24–48h, so the gate has teeth) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:45-49].

**No migration.** Capture rides the documented forward-compat slots: `wizard_drafts.form_data.extras` [Source: apps/api/src/db/schema/wizard-drafts.ts:66] → `submissions.raw_data` (a new `campaign_source` JSON key) [Source: docs/launch-campaign/attribution-spec.md:36,49].

### The load-bearing distinction — self-report is NOT optional
**Radio, TV, and Word-of-mouth cannot be tracked by any pixel or UTM — there is no click.** Self-report (the "How did you hear about us?" question) is the **only** way to attribute those three channels [Source: docs/launch-campaign/attribution-spec.md:22-24]. UTM is the objective signal for the *clickable* channels; the self-report question is the fallback + the radio/TV/WoM signal. When both exist, keep both (UTM wins for reporting; the question validates it) [Source: docs/launch-campaign/attribution-spec.md:29].

### Source-by-construction (NO question needed)
Association-sheet imports land `source = imported_association` (Story 13-2) and enumerator submissions are `source = enumerator` — these channels are known by the ingestion path and bypass the question/UTM [Source: docs/launch-campaign/attribution-spec.md:31-34]. A self-serve association member who registers *direct* on the website still picks "Association / cooperative" — which is why the self-report question still matters even with source tagging [Source: docs/launch-campaign/attribution-spec.md:17].

### Pixels are PARKED (do NOT scope into this story)
Embedding Meta/X pixels is a **decision, not a default**: it needs new CSP `script-src`/`connect-src` allowances (against the hardened ~17-directive CSP from 9-8/9-30), a cookie-consent gate, and a DPIA addendum (Appendix H) [Source: docs/launch-campaign/attribution-spec.md:53-72]. **Default for launch = UTM + self-report only; pixels parked behind the consent/DPIA work** [Source: docs/launch-campaign/attribution-spec.md:72]. Pixels are an OPTIONAL deferred sub-task here (Task 7) — do NOT build them unless Awwal flips the §5 decision.

## Acceptance Criteria

### AC1 — UTM / `?ref` parse on wizard entry → `extras.utm` (no migration)
1. **Given** a visitor lands on the wizard with a tagged URL (e.g. `…/register?utm_source=facebook&utm_medium=cpc&utm_campaign=launch_2026_06&ref=assoc_tailors`), **when** the wizard mounts, **then** `utm_source`, `utm_medium`, `utm_campaign`, and `ref` are read from the URL and persisted into the draft at `form_data.extras.utm = { source, medium, campaign, ref }`. [Source: docs/launch-campaign/attribution-spec.md:26-30]
2. **Given** the URL carries no UTM/`?ref` params, **when** the wizard mounts, **then** `extras.utm` is absent or empty `{}` — capture is best-effort and never blocks the wizard.
3. The UTM parse is captured **once on entry** (alongside the existing `?token=` resume read [Source: apps/web/src/features/registration/pages/WizardPage.tsx:97-99]) and is independent of resume — a resumed draft retains the UTM it was first created with; a fresh tagged entry writes UTM.
4. Only the four known keys (`utm_source`/`utm_medium`/`utm_campaign`/`ref`) are captured; arbitrary query params are NOT swept into `extras` (bounded allow-list, not a free-for-all).

### AC2 — "How did you hear about us?" on the REVIEW step → `extras.acquisition` (best-effort, NEVER blocks submit)
1. A `select_one` question "How did you hear about us?" is placed on the **Review/Submit step — NOT early in the wizard** [PM/peer code-review 2026-06-25 — reversed from front-load]. Abandoners can't be attributed anyway (no submit), so front-loading only **suppresses conversions** in an already-leaky funnel (Step-2 sheds drafts); the Review step is where intent is highest and completers will answer. Options exactly: **Radio · TV · Word of mouth · Association / cooperative · Search engine · Facebook · Instagram · Twitter / X · Other** [Source: docs/launch-campaign/attribution-spec.md:15,22]. The answer persists to `form_data.extras.acquisition = { channel }` [Source: docs/launch-campaign/attribution-spec.md:25].
2. The question is **best-effort and NEVER blocks a submit** [PM/peer code-review 2026-06-25 — reversed from 'mandatory/blocking']: a skipped/blank answer → `null` and the submit proceeds unaffected. It is **prominently presented with a "Prefer not to say" option** so the large majority of completers answer (preserving the radio/TV/WoM signal that has no other capture path [Source: docs/launch-campaign/attribution-spec.md:23]) — but **a blocking required-gate on the conversion funnel days before paid spend is forbidden** (launch-day funnel safety > attribution completeness). This is the single most important guardrail in the story.
3. The channel list and (future) station list are **config, not schema**, kept in ONE place so the option set is editable without a schema migration if a channel/station is added or dropped [Source: docs/launch-campaign/attribution-spec.md:51].
4. The question does NOT include a per-station sub-picker (single plain-language list — simpler to answer, cleaner to analyse) [Source: docs/launch-campaign/attribution-spec.md:13].
5. **Wizard-app field, NOT a questionnaire question — NO master-form re-pin.** Implement "How did you hear" exactly as `auth_choice`/`consent_marketplace` are handled — a wizard-level field carried explicitly into `rawData` [Source: apps/api/src/controllers/registration.controller.ts:644,651] — **NOT** a question added to the pinned `NativeFormSchema`. Adding it to the questionnaire would force a master-form re-upload/re-pin (publish→re-pin discipline) AND make it subject to skip-logic — both wrong. The pinned questionnaire is untouched by this story. [SM verify 2026-06-25]

### AC3 — Merge to `submissions.raw_data.campaign_source` at submit (no migration)
1. **Given** a draft with `extras.acquisition` and/or `extras.utm`, **when** the public wizard submits, **then** both are merged into a single JSON key `submissions.raw_data.campaign_source`, shaped e.g. `{ "channel": "radio", "utm": { "source": "facebook", … } }` (UTM `{}` when absent) [Source: docs/launch-campaign/attribution-spec.md:36-39]. The merge happens in `submitWizard` where the `submissions` row is written [Source: apps/api/src/controllers/registration.controller.ts:626-668].
2. **NO schema change** — `campaign_source` is a new key inside the existing `raw_data` JSONB; `extras` is the existing forward-compat slot [Source: apps/api/src/db/schema/wizard-drafts.ts:66] [Source: docs/launch-campaign/attribution-spec.md:49].
3. The merge is written via the same spread-with-precedence discipline already used at the submit site (campaign_source spread so it cannot overwrite identity/answer keys) [Source: apps/api/src/controllers/registration.controller.ts:638-660].
4. A respondent who never had UTM and never answered the question (degenerate / pre-deploy draft) submits cleanly with `campaign_source` absent or `{ channel: null, utm: {} }` — capture **never** blocks an otherwise-valid submission (consistent with AC2.2 best-effort; there is NO required-question rule). [SM verify 2026-06-25 — removed stale "required" reference left from the pre-reversal draft]

### AC4 — Channel report query (reuse the existing analytics seam, do NOT invent a layer)
1. A channel-breakdown read is available as a `GROUP BY raw_data->'campaign_source'->>'channel'` over completed registrations, returning per-channel counts [Source: docs/launch-campaign/attribution-spec.md:43]. **Monday only needs CAPTURE live — the report can wait**, but a minimal count query lands here so attribution is observable.
2. The report **extends the existing pattern**, not a new analytics layer: `report.service.getOverviewStats` already returns `sourceBreakdown` [Source: apps/api/src/services/report.service.ts:52-56] and `survey-analytics.getTrends`/`getSkillsInventory` already accept a `source` param via `s.source = ${params.source}` [Source: apps/api/src/services/survey-analytics.service.ts:232-233,734-735]. The campaign breakdown follows that same seam (the richer LGA×trade×channel dashboard is Story 13-6, which depends on Epic-12 12-4/12-6 — do NOT build it here).
3. The query is parameterised (Drizzle `sql`-tagged bound params; the channel value path is a fixed JSON accessor, never user-concatenated SQL).

### AC5 — Attribution lands before the first jingle (the gate assertion)
1. An automated test asserts that a wizard submit carrying `extras.acquisition.channel` + `extras.utm` results in those values appearing under `submissions.raw_data.campaign_source` (the SCP success criterion: "attribution lands in `raw_data.campaign_source`, asserted by test, before first jingle") [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:98].
2. A fresh end-to-end prod self-serve submission (the pre-flight gate's "one fresh real submission") shows a populated `campaign_source` — verified by the operator before paid spend [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:47].

### AC6 — Launch-safety guardrails (peer code-review 2026-06-25 — these keep 13-1 from silently breaking attribution OR the funnel)
1. **TWO `raw_data` write-sites must be patched, or attribution silently drops on one path:** `submitWizard` (the public campaign path) **AND** `submitSupplementalSurvey` (the Story 9-28 Cohort A path) each build `raw_data` independently [Source: apps/api/src/controllers/registration.controller.ts]. If Cohort A is blasted as part of the campaign and you want it attributed, the supplemental site needs the same `campaign_source` lift — **name and patch BOTH**.
2. **Autosave timing:** UTM is parsed on mount, but the draft may not exist until a later autosave (drafts merge `...existing.formData, ...formData`). The parser MUST stash `extras.utm` on the **first draft write** or it is lost (parse-on-mount → persist-on-first-save).
3. **Feature-flag + ≤2-minute rollback:** this touches the **live conversion funnel** days before paid spend — ship behind a flag with a fast rollback. The pre-flight gate's "prod happy-path verified" (item #1) MUST run **AFTER** 13-1 deploys — you cannot verify the path before you change it (the SCP gate ordering is corrected by this AC).
4. **Full `dev-story → code-review` treatment, no skipping under deadline** — a conversion-path change is the highest-risk class; run the checks yourself (the session's standing discipline).

## Tasks / Subtasks

- [ ] **Task 1 — UTM/`?ref` parse on wizard entry (AC1)**
  - [ ] In `WizardPage` mount, read `utm_source`/`utm_medium`/`utm_campaign`/`ref` from `searchParams` alongside the existing `resumeToken = searchParams.get('token')` read [Source: apps/web/src/features/registration/pages/WizardPage.tsx:97-99]; persist a bounded `extras.utm = { source, medium, campaign, ref }` into the draft (merge-on-write into `form_data.extras`).
  - [ ] Capture only the four allow-listed keys (AC1.4); empty/absent → `extras.utm` empty (AC1.2). Keep capture best-effort — never throw, never block the wizard if params are malformed.
  - [ ] Ensure UTM is written once and survives resume (AC1.3) — a resumed draft keeps its first-seen UTM; do not clobber on every render.

- [ ] **Task 2 — "How did you hear about us?" question on the REVIEW step, best-effort (AC2)**
  - [ ] Add a `select_one` "How did you hear about us?" question with the exact 9-option list + a "Prefer not to say" option (AC2.1) on the **Review/Submit step** (`Step5ReviewAndSave.tsx` / the review surface), NOT the front; persist the answer to `form_data.extras.acquisition = { channel }`.
  - [ ] **NEVER block submit** — skipped/blank → `null`, submit proceeds (AC2.2). Do NOT add a required-validation gate. Confirm it composes with the dynamic step list without perturbing `useWizardStepCount` or the Step-4 stall metric.
  - [ ] Keep the channel option list (+ future station list) in ONE config module, editable without a migration (AC2.3) [Source: docs/launch-campaign/attribution-spec.md:51]. No per-station sub-picker (AC2.4).

- [ ] **Task 3 — Merge `extras` → `raw_data.campaign_source` at submit (AC3)**
  - [ ] In `submitWizard`, build `campaign_source = { channel: extras.acquisition?.channel ?? null, utm: extras.utm ?? {} }` and add it to the `submissions.rawData` object at the existing insert site [Source: apps/api/src/controllers/registration.controller.ts:626-668], using the spread-with-precedence discipline so it cannot overwrite identity/answer keys (AC3.3).
  - [ ] Verify NO schema change is needed — confirm `submitWizardSchema` accepts the `extras` payload (extend the Zod schema for `extras.acquisition`/`extras.utm` if the wizard sends them in the submit body; shared client+server schema) and that `raw_data` JSONB tolerates the new key (AC3.2).
  - [ ] Degenerate path: no UTM + no answer (pre-deploy draft) submits cleanly (AC3.4) — but AC2.2's required-question rule applies to new submissions.

- [ ] **Task 4 — Channel report query, reusing the existing analytics seam (AC4)**
  - [ ] Add a minimal channel-count read as a `GROUP BY raw_data->'campaign_source'->>'channel'` over completed registrations [Source: docs/launch-campaign/attribution-spec.md:43], following the EXISTING `report.service.getOverviewStats` sourceBreakdown shape [Source: apps/api/src/services/report.service.ts:52-56] / `survey-analytics` `source`-param pattern [Source: apps/api/src/services/survey-analytics.service.ts:232-233] — do NOT invent a new analytics layer (AC4.2).
  - [ ] Parameterise; the channel accessor is a fixed JSON path, not user input (AC4.3). The LGA×trade×channel dashboard is explicitly Story 13-6 (depends on Epic-12 12-4/12-6) — out of scope here.

- [ ] **Task 5 — Tests + the gate assertion (AC5)**
  - [ ] API: assert a wizard submit with `extras.acquisition.channel` + `extras.utm` lands them under `submissions.raw_data.campaign_source` (AC5.1) — this is the SCP success criterion [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:98]. **Assert a submit with NO acquisition answer AND NO UTM still SUCCEEDS** with `campaign_source` null/absent (AC2.2 best-effort + AC3.4 — the funnel-safety guarantee). [SM verify 2026-06-25 — was wrongly "assert required validation"]
  - [ ] Web: assert UTM parse on entry writes `extras.utm` (AC1) and that the "How did you hear" question can be **SKIPPED without blocking submit** (AC2.2 — never a required gate). Co-located vitest. [SM verify 2026-06-25 — was wrongly "question is required"]
  - [ ] Full `pnpm test` (API + web) green; tsc + lint clean.

- [ ] **Task 6 — Operator verification note (AC5.2)**
  - [ ] Document the one-line prod check: after deploy, complete one fresh real self-serve submission with a tagged URL and confirm `campaign_source` is populated (feeds the pre-flight gate item #3 and item #1 "one fresh real end-to-end submission") [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:47-48].

- [ ] **Task 7 — (OPTIONAL, DEFERRED) social pixels — do NOT build unless Awwal flips the §5 decision**
  - [ ] PARKED. If and only if Awwal chooses pixels-with-consent-gate over UTM-only [Source: docs/launch-campaign/attribution-spec.md:72,76], scope a SEPARATE follow-up: server-side Conversions API (not browser pixel) + consent-gated load + post-completion-only fire + explicit CSP allowances + DPIA addendum (Appendix H) [Source: docs/launch-campaign/attribution-spec.md:64-68]. Default = leave this unbuilt; UTM + self-report is the launch attribution stack.

- [ ] **Task 8 — Launch-safety guardrails (AC6)**
  - [ ] Patch BOTH `raw_data` write-sites — `submitWizard` AND `submitSupplementalSurvey` (AC6.1) [Source: apps/api/src/controllers/registration.controller.ts].
  - [ ] Persist `extras.utm` on the FIRST draft write (parse-on-mount → write-on-first-save) so autosave timing can't lose it (AC6.2).
  - [ ] Ship behind a feature flag with a ≤2-min rollback; sequence the gate's prod happy-path verification to run AFTER deploy (AC6.3). Full dev-story → code-review (AC6.4).

## Dev Notes

### Architecture & engine map (cite these exact targets)
- **Wizard entry (where `?token=` is read — add UTM here):** `apps/web/src/features/registration/pages/WizardPage.tsx:97-99` (`resumeToken = searchParams.get('token')`).
- **Draft forward-compat slot:** `wizard_drafts.form_data.extras?: Record<string, unknown>` [Source: apps/api/src/db/schema/wizard-drafts.ts:66] — the documented merge-on-write JSONB slot; `extras.utm` + `extras.acquisition` live here.
- **Submit merge site (where `submissions.raw_data` is built):** `apps/api/src/controllers/registration.controller.ts:626-668` — `newSubmissionUid`, `rawData: { …identity, …responses, …computedFields }`, `source: 'public'`. Add `campaign_source` to this object.
- **Report seam to EXTEND (not replace):** `report.service.getOverviewStats` → `sourceBreakdown` [Source: apps/api/src/services/report.service.ts:23-58]; `survey-analytics` `source` filter `s.source = ${params.source}` [Source: apps/api/src/services/survey-analytics.service.ts:232-233,734-735].

### No-migration discipline (read before coding)
- `campaign_source` is a NEW KEY inside the EXISTING `raw_data` JSONB — there is **no Drizzle migration** [Source: docs/launch-campaign/attribution-spec.md:49]. `extras` is the EXISTING `wizard_drafts.form_data` slot [Source: apps/api/src/db/schema/wizard-drafts.ts:66]. If you find yourself writing a migration, stop — the design is explicitly no-migration.
- Channel list + station list are **config** so the 11 stations are editable without a deploy [Source: docs/launch-campaign/attribution-spec.md:51].

### Critical implementation rules (from project-context.md)
- **Shared Zod schemas client+server** — if the submit body carries `extras.acquisition`/`extras.utm`, extend the existing `submitWizardSchema` once and share; do not fork a parallel schema.
- **AppError only** for any new validation error; **parameterised SQL only** for the channel query (fixed JSON accessor; never `sql.raw` with user input).
- **Structured Pino logging** `{domain}.{action}` (e.g. `attribution.captured`); do NOT log PII.
- **Tests** — API in `__tests__/` (vitest; real-DB integration where the submit→raw_data path matters, `beforeAll`/`afterAll`); web co-located; `pnpm test` routes per package (never `pnpm vitest run` from root for web).

### Dependencies & sequencing
- **HARD deps (all available):** the wizard (9-18) is live; `wizard_drafts.form_data.extras` slot exists; `submissions.raw_data` JSONB exists; the submit path writes the `submissions` row.
- **Pairs with:** Story 13-2 (`imported_association` is source-by-construction — no question), Story 13-6 (the LGA×trade×channel dashboard that consumes `campaign_source` — depends on Epic-12 12-4/12-6; do NOT build the dashboard here).
- **🚦 Pre-spend gate item #3** — must be live + verified before radio/paid social [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:48].

### Scope OUT (do not build)
- Social pixels (Task 7 is PARKED — UTM + self-report only for launch) [Source: docs/launch-campaign/attribution-spec.md:72].
- The LGA×trade×channel coverage dashboard (Story 13-6).
- Any schema migration (extras → raw_data is no-migration).
- A per-station sub-picker in the question (single plain-language channel list).

### References
- [Source: docs/launch-campaign/attribution-spec.md] — channels list (§1), three capture mechanisms (§2), reporting + CPA (§3), build notes (§4), pixels-as-a-decision (§5)
- [Source: apps/web/src/features/registration/pages/WizardPage.tsx:97-99] — current `?token=`-only entry read
- [Source: apps/api/src/db/schema/wizard-drafts.ts:66] — `extras` forward-compat slot
- [Source: apps/api/src/controllers/registration.controller.ts:626-668] — submit site that writes `submissions.raw_data`
- [Source: apps/api/src/services/report.service.ts:52-56] — `sourceBreakdown` (the seam to extend)
- [Source: apps/api/src/services/survey-analytics.service.ts:232-233,734-735] — existing `source` param pattern
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:45-49,98] — pre-flight gate + success criterion
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-1-campaign-attribution-capture] — scope note

## Change Log

| Date | Change |
|------|--------|
| 2026-06-25 | Story authored by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 5 ACs (UTM/`?ref` parse → `extras.utm`; mandatory "How did you hear about us?" → `extras.acquisition`; merge → `raw_data.campaign_source` at submit; channel report query reusing the existing analytics seam; gate assertion). NO MIGRATION. Pixels PARKED (Task 7, default UTM+self-report only). Status → ready-for-dev. 🚦 PRE-SPEND gate item #3 — target LIVE before Monday 2026-06-29. |
| 2026-06-25 | **PM + peer code-review revision (verified against the wizard/submit code).** AC2 REVERSED: question moves to the **Review step** and is **best-effort/NEVER blocks submit** (front-loaded + mandatory was a conversion self-own on the eve of paid spend). Added **AC6 launch-safety**: two `raw_data` write-sites (`submitWizard` + `submitSupplementalSurvey`), autosave-timing (persist UTM on first draft write), feature-flag + ≤2-min rollback, and verify-happy-path-AFTER-deploy (gate ordering corrected). ~12 lines across 2–3 files — small + no-migration, but NOT free; full dev-story→code-review. |
