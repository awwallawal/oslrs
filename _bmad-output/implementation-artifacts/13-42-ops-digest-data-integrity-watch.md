# Story 13-42: Ops-digest data-integrity watch — sentinel population + self-edit path liveness

Status: ready-for-dev

<!-- Authored 2026-07-23 by Bob (SM), EMERGENT from the 13-34 adjudication trace. Two one-off July manual prod checks — (a) the non-UUID `questionnaire_form_id` sentinel population that the 22P02 class casts over, and (b) whether the authenticated dashboard-edit path (`self-edit` writer) is actually landing rows — should become STANDING signals in the existing twice-daily ops digest (9-19/9-63) instead of "we looked once in July". POST-LAUNCH, NON-GATING, observability-only. The design point that makes it worth building rather than a dead counter: each metric is shaped so it can ONLY fire on the real defect, not on the benign pre-blast "no traffic yet" state. Sibling of 13-41 (the READ-side canary/linter) — this is the WRITE-side + adoption watch. Scoped tight: NO fix work (the 9-40 consent-submission asymmetry surfaced by the same trace is noted as a related observation, NOT in scope). -->

## Story
As **the operator who owns the launch blast**,
I want **the ops digest to surface the sentinel `questionnaire_form_id` population and the self-edit path's liveness with signals that only fire on the real failure shape**,
so that **the 22P02 exposure and the dashboard-edit write-path become self-monitoring during the blast, instead of a July spot-check whose evidence rots as PM2 logs rotate.**

## Context & Evidence (verified 2026-07-23, prod `oslsr_db`, via Tailscale)
- **The exposure is a function of one climbing number.** The 22P02 class (13-34/13-41) casts `submissions.questionnaire_form_id` (TEXT) that product code fills with non-UUID sentinels. Today prod carries **2** such rows, both `no-form-pinned-at-submit`; **0** `supplemental-survey`/`self-edit` — against **81** submissions / 144 respondents. But the LIVE writers grow with the blast: every Cohort-A supplemental completion writes `supplemental-survey`, every dashboard edit writes `self-edit`. The whole risk is "how big is this set, and did a NEW un-guarded value join it?" — a perfect standing metric.
- **A bare `self-edit` count is ambiguous — that ambiguity cost real time today.** `self-edit` = 0 rows despite **80/144** respondents being account-linked (eligible editors) and the path being wired end-to-end (`PublicUserHome` edit link → `/registration/manage` → `WizardPage` edit → `PUT /me/registration/wizard` → `me.service.updateRegistrationFromWizard` writes `self-edit` inside the respondent-update txn). The disambiguator was a SECOND number: the wizard-edit endpoint has been invoked **0** times (no `registration_edit`/`registration/wizard` in any PM2 log). Zero-invocation + zero-rows = healthy "no traffic yet"; **nonzero-invocation + zero-rows would be the bug** ([[pattern-ship-a-fix-that-never-fires]]). The watch must encode that pairing, or it recreates the same ambiguity twice a day.
- **The mechanism already exists.** `ops-digest.worker.ts` (`runOpsDigest` → `OperationsService.getDashboardSnapshot({force:true})` → `formatDigest`) runs twice daily (07:00/19:00 WAT), sends silently on a healthy snapshot and buzzes only on a red/yellow recommendation. Adding a `dataIntegrity` section to the snapshot + one digest line + a conditional recommendation is the whole build — no new worker, cron, or channel.
- **Complements, does not duplicate, 13-41.** 13-41 AC9's canary proves the READ tolerates a sentinel; this watches the WRITE side (what sentinels actually exist, and whether a new one appears). Together they close the class from both ends.

## Acceptance Criteria
1. **AC1 — `dataIntegrity` snapshot section (pure-read, fail-open).** Extend `OperationsService.getDashboardSnapshot` with a `dataIntegrity` block gathered by cheap COUNT queries: (a) total non-UUID `questionnaire_form_id` submissions + a per-value breakdown; (b) the `self-edit` submission row count; (c) the count of the `RESPONDENT_SELF_EDITED` audit action (`me.service.ts:553`, written once per successful in-session edit) as the durable lockstep companion to (b). The block MUST fail-open (any query error → section `null`, never throws into the tick — parity with the existing sections).
2. **AC2 — Sentinel signal fires on a NEW value, not on volume.** The digest renders the sentinel population with its known-value breakdown. A recommendation (yellow) is emitted ONLY when a `questionnaire_form_id` value appears that is NOT in the known-safe set (`supplemental-survey`, `self-edit`, `no-form-pinned-at-submit`) — i.e. an unguarded-cast candidate — OR the total crosses an explicit sanity ceiling (documented, generous — the blast is expected to grow `supplemental-survey`). Volume growth within the known set is NOT an alert.
3. **AC3 — self-edit signal is self-interpreting (only the bug shape fires).** The digest shows both the `self-edit` submission count AND the `RESPONDENT_SELF_EDITED` audit count. A recommendation (yellow) is emitted ONLY when the two DIVERGE (audit count ≠ submission count over the same window) — because they are written in ONE transaction today, divergence means a future change decoupled them and lost the submission write ([[pattern-ship-a-fix-that-never-fires]]). Both-zero (no traffic) and equal-nonzero (healthy) are silent. The one-line rationale is in the code so nobody "simplifies" it to a bare `self-edit == 0` alert (which would have fired today, on a healthy system with no editors yet).
4. **AC4 — Silent-when-healthy preserved.** A snapshot with no new sentinel value and no lost-write signal adds NO recommendation, so the digest stays silent (`disable_notification`) exactly as today. The section renders its counts inline (🟢) regardless, for at-a-glance context.
5. **AC5 — MarkdownV2-safe + trim-safe.** The new line(s) go through `escapeMarkdownV2` for all dynamic content and compose from already-escaped pieces (parity with the existing sections), and survive the whole-line trim path without leaving an unbalanced `*bold*`/escape.
6. **AC6 — Tests.** Unit tests over the pure formatter + the recommendation logic: new-sentinel-value → yellow; known-set volume growth → silent; invocation>0 ∧ rows==0 → yellow; both-zero → silent; both-nonzero → silent; section-unavailable (null) → placeholder, no throw. Follows the `ops-digest.worker.test.ts` convention (pure `formatDigest`/helpers, no Redis).

### AC7 — ⛔ THE EMAIL RED IS A PAGE SIZE, NOT A QUOTA (ADDED 2026-08-05, adjudication)

**The digest fired a red on 2026-08-05 18:00 UTC that cannot mean what it says:**

```
🔴 Email: 100+/100 today, 93 delivered, 2 bounced
🔴 Resend usage at 100/100 today — UPGRADE Resend to Pro tier now;
   magic-link emails will silently fail when the limit hits.
```

**One constant is doing two unrelated jobs.** `RESEND_FREE_TIER_DAILY` is used as the API **page
size** (`operations.service.ts:208` — `resend.emails.list({ limit: RESEND_FREE_TIER_DAILY })`) *and*
as the **quota denominator** (`ops-digest.worker.ts:135` — `todayCount / RESEND_FREE_TIER_DAILY`).
`todayCount` is filtered out of that single page, so **it can never exceed 100 by construction.**

Consequences, in order of how much they matter:

1. **The metric is pinned at its own alarm threshold.** Any day we send ≥100 emails, the page fills,
   `todayCount` saturates, and the digest reads `100+/100` — **identically whether we sent 101 or
   10,000.** It has no headroom left to warn with. It will now fire every busy day, and the first
   thing a daily red teaches an operator is to stop reading it.
2. **`delivered`/`bounced` are undercounts from the same partial page.** The digest said *93
   delivered*; our own Resend-webhook table says **127 delivered, 134 sent, 2 bounced** for the same
   day. The digest under-reported delivery by 34.
3. **The recommendation is asserted, not measured.** *"magic-link emails will silently fail"* did
   not happen — 134 sends went out and 127 delivered. Nothing failed. The text states a consequence
   the code never checked for.

**Fix:**
1. **Split the constant.** `RESEND_LIST_PAGE_SIZE` (an API mechanic) and `RESEND_DAILY_QUOTA` (a
   billing fact) are not the same number and must never again be the same symbol.
2. **Paginate, or stop claiming a total.** Either follow the cursor until the day is fully counted,
   or drop the `x/y` framing and render the honest thing: *"≥100 sent today (page limit reached)"*.
   ⚠️ `truncated` ALREADY EXISTS and is already rendered as the `+` in `100+`. The information was
   present and the alarm was computed as though it were not — a red built on a number the same
   function had already flagged as a lower bound.
3. **Source the day's count from `email_events` instead.** We ingest Resend webhooks into our own
   table; it gave the true 134/127/2 in one query, with no page limit and no API call.
4. ⚠️ **Confirm the actual plan before wiring any quota number.** Nobody has verified we are on the
   free tier. 134 sends landed in a day, which a 100/day cap would not permit — so the denominator
   this alarm has been using is probably wrong in the first place. **Measure the plan; do not infer
   it from a constant someone named `FREE_TIER`.**

### AC8 — The deliverability red misdirects (ADDED 2026-08-05, adjudication)

Same digest: *"🔴 Resend deliverability — 2 bounced. Inspect at resend.com/logs and check DNS
DKIM/SPF."*

**DKIM/SPF were fine — 127 messages delivered that same day.** A signing/DNS fault does not deliver
127 and bounce 2. The recommendation is boilerplate attached to a bounce counter, and it points the
operator at infrastructure when **every bounce on file is a recipient-side address problem**:

| suppressed address | what it actually is |
|---|---|
| `asirusakirat@gmail.come` | typo — `.come` |
| `fatomidejumoke@mail.com` | likely meant `gmail.com` |
| `wahab akeem olaide <aqeemakolade@gmail.com>` | **a display-name string used as the address** |
| `julietiyabodeodiba@gmail.com`, `jambestojeke@gmail.com`, `ola4ct@outlook.com` | plausibly dead |

**The bounce alert should say which addresses, and whether they are malformed or merely dead** —
those need opposite responses. A malformed one is our bug; a dead one is the person's.

**And it should say who we have just gone silent on.** Every bounce writes an `email_suppressions`
row, so the register loses a contact channel permanently and no digest line mentions it. Three
suppressed people are **in the register with working phone numbers** — `OSL-2026-DQNPTQ`,
`OSL-2026-TYZ3AH`, `OSL-2026-51CNVZ` — and three more are D4 invitees whose invitation never
arrived. **A suppression is a person we can no longer reach; it deserves a digest line of its own,
naming them, so they can be moved to the SMS list.**

⚠️ **One-off worth not generalising from:** the malformed row is the ONLY one — `wizard_drafts`,
`submissions` and `campaign_sends` all hold **0** name-wrapped addresses, so this is not systemic
capture corruption. Note also that suppression keyed on the *malformed* string, so the clean address
`aqeemakolade@gmail.com` was never suppressed and that person (`OSL-2026-WKM3FC`, active) is still
reachable. **A suppression list keyed on an unnormalised address both over- and under-blocks.**

## Tasks / Subtasks
- [ ] **Task 1 — snapshot section** (AC1) — `OperationsService`: add the `dataIntegrity` gather (2–3 COUNT queries), typed in `@oslsr/types` alongside the other snapshot section types; fail-open wrapper.
- [ ] **Task 2 — formatter + recommendation** (AC2, AC3, AC4, AC5) — `formatDataIntegrityLines()` (pure, exported for test) + the conditional recommendation push in `runOpsDigest`/the recommendation builder; MarkdownV2-escaped; document the known-safe sentinel set as a shared constant (reuse 13-41's if it lands first).
- [ ] **Task 3 — tests** (AC6) — extend `ops-digest.worker.test.ts` with the AC6 cases.
- [ ] **Task 4 — validate** — API suite + tsc + eslint; a manual `runOpsDigest()` dry-run against a seeded snapshot proving the silent/buzz branches.

## Dev Notes
### Why the pairing is the whole point
A counter that fires on volume would scream all through the blast (by design `supplemental-survey` climbs) and get muted — the classic alarm-fatigue death of a watch. A counter that fires on a bare `self-edit == 0` would have fired today, on a perfectly healthy system with no editors yet. Both are the failure mode this story exists to avoid. The signals are deliberately shaped to fire on the DELTA that means a defect (a new sentinel value; writes lost despite invocation), not on the level. (Awwal, 2026-07-23: turn "we sized it once in July" into a standing signal that can't cry wolf.)

### Source of the invocation signal (AC1c) — VERIFIED
`updateRegistrationFromWizard` writes `AUDIT_ACTIONS.RESPONDENT_SELF_EDITED` (`me.service.ts:553`, `logActionTx`) in the SAME transaction as the `self-edit` submission insert (`:517-519`). So the two counts are equal BY CONSTRUCTION today — which is exactly why they make a good tripwire: the watch's job is to catch a FUTURE change that decouples them (the audit fires but the row doesn't land, or vice-versa), i.e. a silent write regression. Query the audit count from the DB — durable, unlike the PM2 log grep the 13-34 trace had to use (logs rotate; that rot is the very thing this story fixes). Do NOT use `respondents.updated_at` as a proxy — the trace showed 140/144 rows carry `updated_at > created_at` from unrelated paths (backfills, NIN-capture, admin, the 9-40 consent toggle), so it cannot isolate wizard edits. (Note: because the audit is written AFTER validation inside the txn, rejected edits — NIN dup, incomplete — write neither, so this signal never false-alarms on legitimate rejections.)

### Related observation — OUT OF SCOPE (documented so it isn't lost)
The same trace found the 9-40 path (`PUT /me/registration` → `updateMarketplaceConsent`) mutates respondent state (marketplace consent) WITHOUT writing a submission — a minor asymmetry against the "every respondent state-change has a submission" contract ([[feedback_unified_ingestion_pipeline]]). Low-stakes (a consent flag, not survey data) and pre-existing; recorded here as a known exception + a backlog candidate, explicitly NOT fixed in this observability story.

### Dependencies / sequencing
- No schema, no new prod deps, no new worker. Extends 9-19/9-63's existing digest.
- Best sequenced AFTER 13-41 so the known-safe sentinel set is defined once and shared (soft dep — can inline the constant if 13-41 hasn't landed). POST-LAUNCH; does NOT gate the blast (it watches the blast).

### References
- [Source: apps/api/src/workers/ops-digest.worker.ts — `formatDigest`/`runOpsDigest`, silent-when-healthy discipline, MarkdownV2 escaping + trim]
- [Source: apps/api/src/services/me.service.ts:497-519 — the `self-edit` writer (respondent update + submission insert, one txn)]
- [Source: 13-34 adjudication trace 2026-07-23 — prod numbers (2 sentinels, 0 self-edit, 0 invocations, 80/144 linked, 81 submissions) + the wired end-to-end edit path]
- [Source: 13-41 — the READ-side canary/linter this watch complements on the WRITE side]

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-23 | Story drafted, EMERGENT from the 13-34 adjudication trace. Turns two one-off July prod checks (sentinel population for the 22P02 class + self-edit path liveness) into standing ops-digest signals, each shaped to fire ONLY on the real defect delta (a NEW sentinel value; writes lost despite invocation) rather than on blast-expected volume or benign no-traffic. POST-LAUNCH, non-gating, observability-only; sibling of 13-41 (read-side). 6 ACs / 4 Tasks. Related 9-40 consent-submission asymmetry noted out-of-scope. | Bob (SM) |
