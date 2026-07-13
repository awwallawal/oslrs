# Story 13-27: Public wizard bypasses marketplace extraction (+ audit ALL processSubmission side-effects)

Status: done

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
- [x] **Task 1 (AC1, AC2)** — extract the post-submission side-effects into a shared entrypoint both paths call (or minimally wire `queueMarketplaceExtraction` into `submitWizard` post-commit); produce the side-effect audit table.
- [x] **Task 2 (AC3)** — idempotent marketplace backfill script (consent + submission present + no existing profile; dry-run→apply on the box).
- [x] **Task 3 (AC4)** — fraud-detection intent decision (product) + implement/document.
- [x] **Task 4 (AC5)** — tests + suites; operator runs the backfill; verify the marketplace populates.

### Review Follow-ups (AI) — code-review 2026-07-13 (all fixed inline)
- [x] [AI-Review][Med] M1 — wizard-path side-effect failure now fires a one-shot Telegram alert (launch-facing marketplace enqueue can't vanish into a single log line like the 13-21 email path is monitored) [registration.controller.ts `wizard.post_submission_side_effects_failed` .catch]
- [x] [AI-Review][Low] L1 — backfill `deduped` counter was dead on BullMQ 5 (`queue.add` returns the existing job, never throws `'Job already exists'`); now probes `getJob(jobId)` via the shared `marketplaceExtractionJobId` key so dedup is real + never re-adds an in-flight dupe [_backfill-marketplace-extraction.ts:enqueueCandidates · marketplace-extraction.queue.ts]
- [x] [AI-Review][Low] L2 — `runPostSubmissionSideEffects` `status?: RespondentStatus | string` tightened to `RespondentStatus` (both callers pass the typed column; `| string` only let a typo compile) [submission-processing.service.ts:846]
- [x] [AI-Review][Low] L3 — added a queue-path assertion that `processSubmission` still routes marketplace extraction through `runPostSubmissionSideEffects` (the wiring was only implicitly exercised; this pins the very bypass class the story closes) [submission-processing.service.test.ts]

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

### Implementation Notes (Amelia, 2026-07-12)

**AC1 — shared post-submission side-effects entrypoint.** Generalised the 13-21
`sendRegistrationAutoEmails` pattern into a new
`SubmissionProcessingService.runPostSubmissionSideEffects()` that BOTH the queue
worker (`processSubmission`) and the public wizard (`submitWizard`) call once the
respondent + submission are committed. It composes: (a) the auto-emails
(fire-and-forget, internally fail-soft), (b) GPS-gated fraud detection, (c)
consent-gated marketplace extraction. `processSubmission` awaits it (preserving
the worker's throw-on-queue-failure semantics — no behaviour change); the wizard
calls it fire-and-forget with a `.catch` (a comms/queue failure must never sink a
committed registration — the 9-26 lesson). The wizard now pre-generates the
submission PK (UUIDv7, the project's client-id pattern) so it can pass a real
`submissionId` — the marketplace worker loads the submission by its `id`, not its
`submission_uid`.

**AC2 — systematic side-effect audit (`processSubmission` vs the wizard path).**
This is the durable fix — enumerate every effect ONCE so we stop finding bypass
victims one at a time. The same table is embedded in the `runPostSubmissionSideEffects`
JSDoc so it lives next to the code:

| # | `processSubmission` side-effect | Wizard path status | Classification |
|---|---|---|---|
| 1 | Link respondent + mark `processed:true` | Wizard does its OWN in-transaction | ✅ wizard-native (not shared) |
| 2 | Provenance audit (`DATA_CREATE`/`PENDING_NIN_CREATED`/guardian consent) | Wizard emits its OWN in-transaction (`AuditService.logActionTx`) | ✅ wizard-native (not shared) |
| 3 | Registration auto-emails (9-58 confirmation + 13-12 thank-you) | Shared (13-21) → now via `runPostSubmissionSideEffects` | ✅ shared |
| 4 | **Marketplace extraction** (consent-gated) | **Was queue-path-ONLY → wizard produced 0 profiles** | 🐞 **BUG → wired via shared entrypoint (this story)** |
| 5 | Fraud detection (GPS-gated) | Routed through shared entrypoint but a **no-op** for the wizard (gps=null) | ✅ intentional-skip (AC4) — GPS-clustering engine keys on enumerator field signals; NIN partial-unique is the public duplicate defense |
| 6 | PII normalisation + form-schema resolution/extraction | Wizard data is structured + pre-validated (controller.ts:658) | ✅ intentional-skip (wizard-native) |

**AC3 — idempotent backfill.** `scripts/_backfill-marketplace-extraction.ts`
(mirrors the 13-21 backfill discipline: PREVIEW-by-default, ugly confirm flag).
Selects PUBLIC respondents with `consent_marketplace=true` + a submission carrying
`raw_data` + NO existing `marketplace_profiles` row, then ENQUEUES onto the same
`marketplace-extraction` queue the live path uses (same worker = same extraction
logic, no drift). Idempotent three ways: selection excludes existing profiles, the
worker UPSERTs on `respondent_id`, and the queue de-dups on `jobId`. Only opt-ins
WITH a submission are extractable; the 55 data_lost/no-submission opt-ins have no
answers to derive a profile from — correctly LEFT (documented, not fabricated).

**AC4 — fraud-detection intent (product decision, Awwal 2026-07-12).** CONFIRMED
the `registration.controller.ts:658` "no fraud-detection needed" skip is CORRECT
for public self-service. The GPS-clustering/speed-run engine (Epic 4) keys on
enumerator field-collection signals (GPS coordinates, per-enumerator spatial
clusters) that do not exist for an anonymous, GPS-less public submission; duplicate
registrations are already blocked by the NIN partial-unique index at insert. Fraud
is routed through the shared entrypoint gated on GPS (structurally uniform +
future-proof if the wizard ever captures GPS), so it's a no-op today. Active
duplicate/ghost-padding scoring for public regs beyond NIN-uniqueness would need
NEW heuristics = a separate story, not a wiring change.

**AC5 — tests + suites.** +6 `runPostSubmissionSideEffects` unit tests
(consent-gates marketplace, GPS-gates fraud, independence of the two gates, emails
still fire, queue-failure propagates so the wizard `.catch` matters) + updated the
wizard route happy-path to assert the shared entrypoint fires with
`consentMarketplace:true`/`gps:null`/a real `submissionId` + 11 backfill tests
(arg parsing, candidate mapping, enqueue idempotency: PREVIEW enqueues nothing,
null-return counts as deduped, empty candidate set = no-op). **Full API suite:
3089 passed / 7 skipped, 0 failures** (single-thread vs `app_test`); `tsc` clean;
`eslint src scripts` clean. Backfill smoke-ran `--help`. No web changes (13-28 owns
the marketplace display).

**Operator residuals:**
- Run `tsx scripts/_backfill-marketplace-extraction.ts --dry-run` on the box (expect ~69), then `--apply --confirm-i-am-not-dry-running` with the marketplace worker running; verify `SELECT count(*) FROM marketplace_profiles;` climbs.
- Selective commit — the working tree carries unrelated baseline-report/.gitignore noise; add ONLY this story's File List (never `git add -A`).

### File List
- `apps/api/src/services/submission-processing.service.ts` (M — new `runPostSubmissionSideEffects` shared entrypoint; `processSubmission` routes through it)
- `apps/api/src/controllers/registration.controller.ts` (M — wizard pre-generates submission PK + calls the shared entrypoint with consent/gps/submissionId, fire-and-forget + `.catch`)
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` (M — capturable marketplace mock + `runPostSubmissionSideEffects` describe block)
- `apps/api/src/routes/__tests__/registration.routes.test.ts` (M — mock/assert the shared entrypoint incl. `consentMarketplace`)
- `apps/api/scripts/_backfill-marketplace-extraction.ts` (A — idempotent marketplace backfill)
- `apps/api/scripts/__tests__/_backfill-marketplace-extraction.test.ts` (A — backfill unit tests)
- `apps/api/src/queues/marketplace-extraction.queue.ts` (M — review L1: exported `marketplaceExtractionJobId` shared key + BullMQ-5 dedup contract note)
- `apps/api/src/controllers/registration.controller.ts` (M — review M1: Telegram alert on wizard side-effect failure; imports `sendTelegramMessage`)

## Senior Developer Review (AI) — 2026-07-13 (Awwal)

**Outcome: Approved (all findings fixed inline).** Independently verified — not trusting the dev agent's self-report: `tsc --noEmit` clean, `eslint` clean on all changed files, affected suites **132 passed** (3 files), File List ↔ `git status` exact match (0 discrepancies). ACs 1-5 all implemented; the shared-entrypoint structural fix is correct and — crucially — **pinned at the executing layer** (the service test invokes the real `runPostSubmissionSideEffects` and asserts the queue fires, not just a mock), directly honoring the project's `[[pattern-ship-a-fix-that-never-fires]]` lesson.

Findings (0 High, 1 Medium, 3 Low — all fixed):
- **M1 (Med, fixed)** — Launch-facing alerting gap: a wizard-path marketplace *enqueue* failure (e.g. Redis down during the blast) produced only a single `wizard.post_submission_side_effects_failed` log line, weaker than the 13-21 email path it's modeled on (which has email-autosend-monitor → Telegram). Fixed: fire a prod-gated, never-throws `sendTelegramMessage` from the `.catch`.
- **L1 (Low, fixed)** — Backfill `deduped` metric was dead on BullMQ 5.66 (`queue.add` silently returns the existing job for a duplicate jobId; it does **not** throw `'Job already exists'`, so the `null`-return path never fired and re-queues were mis-counted as `enqueued`). Fixed: probe `getJob()` via a newly-exported shared `marketplaceExtractionJobId` key so dedup is measured accurately and an in-flight dupe is never re-added. Idempotency itself was already safe (SQL exclusion + worker UPSERT).
- **L2 (Low, fixed)** — `runPostSubmissionSideEffects` `status` widened with `| string` defeated the enum; tightened to `RespondentStatus` (both callers pass the typed column).
- **L3 (Low, fixed)** — No test proved the *queue path* still routes marketplace through the new indirection; added a `processSubmission` assertion (the entrypoint + the wizard call were covered, but not the queue-path wiring).

⚠️ Operator residuals unchanged: run the backfill dry-run→apply on the box (~69, worker running) + selective commit (tree carries unrelated baseline-report noise — add ONLY this story's File List).

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
| 2026-07-13 | Adversarial code-review (Opus) — 0 High, 1 Med, 3 Low, ALL fixed inline. M1 Telegram alert on wizard side-effect failure; L1 backfill dedup made real via getJob probe + shared `marketplaceExtractionJobId` (BullMQ-5 `queue.add` returns existing job, doesn't throw); L2 status enum tightened; L3 queue-path marketplace-wiring assertion added. Independently verified: tsc0/eslint0, 132 affected tests pass (+2), File List↔git exact. File List +marketplace-extraction.queue.ts +controller. Status stays `review` pending operator backfill + selective commit. | Code Review (AI) |
| 2026-07-12 | dev-story COMPLETE (Amelia). AC1 shared `runPostSubmissionSideEffects` entrypoint (both channels); AC2 systematic side-effect audit table (marketplace was the 4th-column bug; emails ✓13-21, provenance/link wizard-native, fraud intentional-skip, normalisation intentional-skip); AC3 idempotent `_backfill-marketplace-extraction.ts` (enqueue same worker; excludes existing profiles); AC4 fraud skip CONFIRMED correct by product (Awwal) — NIN-uniqueness is the public duplicate defense, GPS engine N/A; AC5 +6 entrypoint tests + 11 backfill tests + route assertion updated. Full API 3089 pass/7 skip, tsc+eslint clean. Status → review. Operator residual: run the backfill on the box + selective commit. | Amelia (Dev) |
| 2026-07-10 | Story drafted via *create-story — public marketplace shows 1 card because the wizard bypasses processSubmission where queueMarketplaceExtraction lives (124 public opt-ins → 0 profiles; the 1 card is a lone enumerator submission). 3rd bypass victim after 13-21/13-23. Fix = wire extraction into the wizard via a shared side-effects entrypoint + SYSTEMATIC audit of all processSubmission side-effects + backfill the 69 extractable + resolve fraud-detection intent (AC4). LAUNCH-RELEVANT. EMERGENT from the "1 card" observation. | Bob (SM) |
