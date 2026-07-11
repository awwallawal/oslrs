# Story 13-27: Public wizard bypasses marketplace extraction (+ audit ALL processSubmission side-effects)

Status: ready-for-dev

<!-- Authored 2026-07-10 by Bob (SM) via *create-story. EMERGENT (2026-07-10, Awwal): oyoskills.com/marketplace shows just 1 card. Prod: exactly 1 marketplace_profiles row (Funke, an ENUMERATOR submission from 2026-04-20), while 124 PUBLIC respondents opted into the marketplace (consent_marketplace=true) and 69 of them have a submission ready to extract. Root cause = the SAME architectural bypass as 13-21 (auto-emails) and 13-23 (form-binding): the public wizard writes its submission processed:true and BYPASSES SubmissionProcessingService.processSubmission, where queueMarketplaceExtraction lives — so no public registration ever queues a marketplace profile. 13-21 fixed ONLY the auto-emails (shared entrypoint); marketplace extraction was never wired to the wizard path. This story fixes marketplace + does the SYSTEMATIC audit of every processSubmission side-effect vs the wizard path so we stop finding these one at a time. -->

## Story
As **a member of the public browsing oyoskills.com/marketplace (and the Ministry)**,
I want **every public registrant who opted into the marketplace to actually appear as a searchable profile**,
so that **the skilled-labour marketplace shows the ~124 people who consented — not 1 lone enumerator card — and the launch doesn't drive traffic to an empty marketplace.**

## Context & Evidence (prod-verified 2026-07-10 via Tailscale)
- **1 marketplace profile total** (`profession=tailoring`, source=**enumerator** — "Funke", 2026-04-20, the queue path). **124 PUBLIC respondents have `consent_marketplace=true`; 69 of them have a submission** — and **zero** public marketplace profiles exist.
- **Root cause = the wizard→processSubmission bypass.** `queueMarketplaceExtraction` is called ONLY inside `SubmissionProcessingService.processSubmission` [submission-processing.service.ts:325-327, gated on `consentMarketplace`]. The public wizard `submitWizard` writes `processed:true` and **bypasses** `processSubmission` [registration.controller.ts:775 explicit comment], calling only the 13-21 shared `sendRegistrationAutoEmails` [:785] — it does **NOT** call `queueMarketplaceExtraction`. So the whole public channel never queues a profile.
- **This is the 3rd confirmed victim of the same bypass:** 13-21 (auto-emails — FIXED via shared entrypoint), 13-23 (questionnaire_form_id binding), and now **marketplace extraction**. A 4th side-effect — `queueFraudDetection` [:311] — is ALSO only in `processSubmission`, but the wizard comment [:658] says "no fraud-detection / normalisation enrichment needed", so that skip may be INTENTIONAL (verify — AC4).
- **The marketplace worker itself is correct** — it reads `skills_possessed` as a JSONB array (not the 13-22 space-split) and stores clean skills; the profiles just never get created. (13-22 separately aligns the worker's inconsistent fallback branch.)
- **Launch relevance:** the marketplace is a PUBLIC-facing surface the blast drives traffic to. A marketplace with 1 card while 124 people opted in is a credibility hit AND defeats the register's matchmaking purpose. 69 are extractable right now.

## Acceptance Criteria
1. **AC1 — Public wizard triggers marketplace extraction.** A fresh public registration with `consent_marketplace=true` results in a `marketplace_profiles` row (queued the same way the enumerator/queue path does). Implement by having `submitWizard` (post-commit, fire-and-forget) invoke the extraction — ideally via a SHARED post-submission side-effects entrypoint that BOTH `processSubmission` AND `submitWizard` call (extend the 13-21 `sendRegistrationAutoEmails` pattern), so a future side-effect can't be silently missed again.
2. **AC2 — Systematic side-effect audit (the make-it-better).** Enumerate EVERY side-effect `processSubmission` performs (auto-emails ✓13-21, marketplace, fraud detection, form-schema resolution, normalisation, search_vector, any queues) and, for each, document whether the wizard path (a) already does it, (b) intentionally skips it (with the reason, e.g. the :658 fraud/normalisation note), or (c) BUGGILY skips it → wire it. This is the durable fix — stop discovering bypass victims one at a time.
3. **AC3 — Backfill existing public opt-ins.** Idempotent backfill (dry-run→apply, mirrors the 13-16/13-21 script discipline) extracts marketplace profiles for the existing public respondents with `consent_marketplace=true` + a submission (69 today), honoring consent + the same extraction logic; skips those that already have a profile. Do NOT extract respondents without submission data (the 55 data_lost can't be extracted — nothing to extract from).
4. **AC4 — Fraud-detection intent resolved.** Confirm with product whether public self-service registrations SHOULD be fraud-scored (duplicate/anomaly detection matters for a policy-incentive register) or whether the :658 "not needed" skip is correct. Implement or document the decision; if it should run, wire it via the AC1 shared entrypoint.
5. **AC5 — Tests + suites green.** Integration test: a public wizard submission with consent queues extraction (the missing call now fires); backfill idempotency test; the audit encoded as an assertion where practical. Full api + web suites green; tsc/eslint clean. Post-deploy: the marketplace shows the backfilled profiles.

## Tasks / Subtasks
- [ ] **Task 1 (AC1, AC2)** — extract the post-submission side-effects into a shared entrypoint both paths call (or minimally wire `queueMarketplaceExtraction` into `submitWizard` post-commit); produce the side-effect audit table.
- [ ] **Task 2 (AC3)** — idempotent marketplace backfill script (consent + submission present + no existing profile; dry-run→apply on the box).
- [ ] **Task 3 (AC4)** — fraud-detection intent decision (product) + implement/document.
- [ ] **Task 4 (AC5)** — tests + suites; operator runs the backfill; verify the marketplace populates.

## Dev Notes
- **Mirror 13-21's fix pattern.** 13-21 extracted `sendRegistrationAutoEmails` so both the queue and wizard paths call it. The RIGHT structural fix here is to generalise that into a shared "post-submission side-effects" step (marketplace + emails + fraud-if-wanted) invoked by BOTH `processSubmission` and `submitWizard` after the respondent+submission exist — so the NEXT side-effect added can't be silently bypassed. (The wizard does its own respondent extraction, so it can't call `processSubmission` wholesale — only the post-respondent side-effects are shared.)
- **The marketplace worker is fine** (array-correct); this is purely that its trigger never fires for the public channel. 13-22 handles the worker's inconsistent fallback branch separately.
- **Backfill scope:** only the 69 public opt-ins WITH a submission can be extracted; the 55 data_lost/no_submission opt-ins have no answers to derive profession/skills from — document, don't fabricate.
- **Launch-relevant, HIGH.** Public-facing empty marketplace at launch. Pre-blast if feasible; at minimum run the backfill so the marketplace isn't a 1-card ghost town when the blast lands.

### References
- [Source: apps/api/src/services/submission-processing.service.ts:325-327 (queueMarketplaceExtraction, consent-gated) · :311 (queueFraudDetection) · :281-286 (13-21 shared auto-email entrypoint — the pattern to extend)]
- [Source: apps/api/src/controllers/registration.controller.ts:775 (processed:true bypass comment) · :785 (calls sendRegistrationAutoEmails only) · :658 (the "no fraud-detection needed" wizard note — AC4)]
- [Source: 13-21 (auto-email bypass fix — shared entrypoint) · 13-23 (form-binding bypass) — the sibling bypass victims]
- [Source: prod 2026-07-10 — 1 marketplace_profile (enumerator/Funke); 124 public consent_marketplace, 69 with submissions, 0 public profiles]

## Dev Agent Record
### File List

## PM Validation (John, 2026-07-10)

**Validated — approved. LAUNCH-RELEVANT, HIGH. The audit (AC2) is what makes it a story, not a one-line patch.**

1. **Severity:** a public marketplace showing 1 card while 124 opted in is both a credibility hit at launch AND a broken core feature (matchmaking is the point). Fix + backfill the 69 before/around the blast. The one-line "wire the queue into submitWizard" restores go-forward; AC3's backfill restores the existing cohort.
2. **AC2 is non-negotiable — this is the THIRD bypass victim we've found by accident** (emails, form-binding, now marketplace). Stop the whack-a-mole: enumerate every processSubmission side-effect vs the wizard path once, classify each (done / intentional-skip / bug), and prefer the shared-entrypoint structural fix so the next one can't hide. That audit is the real deliverable.
3. **AC4 fraud intent — genuinely open, don't assume.** The :658 comment says fraud isn't needed for the wizard, but a policy-incentive register has real duplicate/ghost-padding risk (same concern as 13-2's association imports). Get an explicit product call; if public regs should be duplicate-checked, wire it via the same shared entrypoint. Either way, document it so it's a decision not an accident.
4. **Backfill honesty (AC3):** only the 69 with submissions are extractable; the 55 data_lost can't be — no fabrication. Consistent with the 9-28 salvage stance.
5. **Sequence:** independent of 13-22/13-23/13-25; shares the "wizard bypass" theme with 13-23 (could be dev'd by the same person for context). Pre-blast for the backfill at minimum.

**No AC changes.** Dev-ready.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-10 | Story drafted via *create-story — public marketplace shows 1 card because the wizard bypasses processSubmission where queueMarketplaceExtraction lives (124 public opt-ins → 0 profiles; the 1 card is a lone enumerator submission). 3rd bypass victim after 13-21/13-23. Fix = wire extraction into the wizard via a shared side-effects entrypoint + SYSTEMATIC audit of all processSubmission side-effects + backfill the 69 extractable + resolve fraud-detection intent (AC4). LAUNCH-RELEVANT. EMERGENT from the "1 card" observation. | Bob (SM) |
