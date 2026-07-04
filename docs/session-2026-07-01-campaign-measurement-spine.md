# Session Handoff — Campaign-Measurement Spine + Email Lifecycle (2026-06-21 → 2026-07-01)

**Prod @ `9fd9e7a`** (all launch-critical dev done + deployed; nothing in flight). Read this to resume cold. The concise index is in `MEMORY.md` (2026-06-30 block); per-story detail is in `_bmad-output/implementation-artifacts/13-*.md`; the infra lesson is Pitfall #41 in `infrastructure-cicd-playbook.md`. **This doc captures the narrative, the discussions, and the WHY behind the decisions — the things the terse artifacts don't.**

---

## TL;DR — what this session did
Built + shipped the **entire campaign-measurement + email-lifecycle stack** (Epic 13 spine), so the dormant registry's Jul-1 re-ignition campaign is **measurable and deliverability-safe**:
- **13-9** Resend webhook → `email_events` + suppression + `getCampaignFunnel` (the spine)
- **13-11** one-off thank-you/referral blast (Cohort C backfill)
- **13-12** evergreen thank-you auto-send (every new completer → referral source)
- **13-13** email unsubscribe → suppression (completes the do-not-contact loop)
- Phone number → **+234 706 560 6479** (the SMS line); the **association data sheet** (13-2) as editable xlsx
- **Launch is now $20-Resend-Pro-gated ONLY** (+ form re-pin). No dev blocks remain.

---

## The decisions + discussions (the WHY)

### SMS is out for launch → email-first (hard gate, empirically confirmed)
Termii SMS is **KYC-blocked** — they require a **TIN the operator doesn't have**; the sender-ID `oyotrade` is PENDING → every send 404s. Investigated other providers; concluded: **abandon SMS for the launch, go email-first.** Prod data backed this: **100% of stalled drafts are email-reachable.** So `9-27` Part B (Termii adapter) stays blocked/in-progress; the email path is fully independent. The **26 phone-only** registrants get **manual SMS from the dedicated OSLSR phone** (templates in the 13-11 story) — NDPA-OK (they gave the number for this purpose).

### The webhook bug saga (the session's biggest catch — Pitfall #41)
13-9's Svix webhook passed all **unit tests** but **never worked on prod** — every real Resend event 401'd `bad_signature`. Root cause: `app.use('/api/v1', cspRoutes)` installs its **own `express.json`** for all `/api/v1/*` and was mounted **before** the webhook's `express.raw` → it consumed the body → Svix verified an empty string. The minimal unit `buildApp()` didn't have `cspRoutes`, so it missed it. **Only a real prod E2E** (`scripts/_verify-13-9-webhook-e2e.ts` — signs synthetic Svix events with the real secret → real endpoint → real funnel) surfaced it. **Fix:** moved the webhook `express.raw` mount **above `cspRoutes`** + a regression test against the **real `app`** (imports it). **Meta-lessons (now Pitfall #41):** (1) raw-body/signature routes mount before EVERY upstream body parser, incl. sub-router parsers; (2) test webhooks against the real `app`, not a minimal one; (3) **`scripts/` is excluded from tsconfig `include`** → script bugs only surface at runtime, so RUN scripts, don't trust tsc.

### The verification-gate working pattern (kept + validated)
Several stories were **dev'd + code-reviewed in parallel CLIs**, then the orchestrator ran an independent **verification gate** (tsc + eslint + FULL suite on scratch `app_test`) and committed. **The gate caught a real bug nearly every time:** the `AUDIT_ACTIONS` drift-count test (13-11, a new action made it 53), the `mockReset`-wiped suppress-throw test (13-13 — controller was correct, the test's `mockRejectedValue` in the `vi.mock` factory was wiped by `vitest.base.ts:89 mockReset:true`), and the webhook bug. **Rule reinforced: verify delegated work yourself; never trust an agent's self-verification.** Also: when touching shared `src/services`, run the FULL api suite pre-commit (targeted tests miss cross-file drift detectors); the pre-push hook is the backstop.

### Campaign cohort analysis + the 235-vs-271 reconciliation (data nuance)
Fresh counts (registry ran 2026-04-20→2026-06-06, **dormant since**): **A (supplemental 9-28)=52** email · **B (re-engagement 9-27)=271** · **C (completers 13-11)=76** (61 email via `magic_link_tokens`, 15 phone-only) · **26 true phone-only.**
- **B was 271, not the 235 an earlier read showed** — 235 = drafts that *ever* reached steps 4-5 (incl. expired); **271 = the actual reachable cohort** = all non-expired drafts (all steps) minus completed-users. A default `--max-recipients 200` cap had also been hiding 71.
- **Draft-timer RESET (operator action, audited):** all **292 wizard_drafts → expire 2026-08-28** (uniform 60-day window; std TTL is 30d, `registration.controller.ts ~349`). Backup: `/root/oslrs/_ops-backups/draft-expiry-pre-reset-2026-06-29.csv` on the box. **Why:** the cohort was on 30-day timers from late-May/early-June creation → expiring *continuously*; the reset froze the decay for the whole campaign. The **20 expiry-recovered drafts belong to already-completed people** → correctly excluded from re-engagement (not a bug; all 292 emails are unique).

### Money + timing decisions
- **$20 Resend Pro: pay JULY 1, not June 30** — upgrading June 30 = a ~$0.67 prorated stub + the full cycle; July 1 = clean full cycle. Aligns with the Jul-1 launch anyway, and nothing's decaying (timers reset). Trivial saving but zero downside.
- **Key-rotation WAIVED (operator decision):** the runbook's "rotate `RESEND_API_KEY`" step — operator judged the exposure is ephemeral chat + uncommitted-rewritten scratch only, and the 9-63 AC0 fingerprint-guard already closes the dev-leak vector. So the fingerprint-update step drops too → **slimmed pre-blast checklist = Pro($20) + master-form re-pin + cohort dry-run-then-fire.**
- **Resend has NO suppressions API (404)** → can't clear the old `example.com` bounces programmatically. **Moot** — the blast cohorts contain zero `example.com`, so those stale suppressions can't affect anything. Skip it.

### NDPA reasoning (validated, reasoned-not-legal)
- **Thank-you + "share this link"** (13-11/13-12): ✅ contacting our own registrants for a registry-consistent purpose + asking them to share a **public** link — no third-party PII processed. **Bright line (test-asserted): never ask for a friend's contact details** ("enter your friend's number") — only share-a-link.
- **Manual SMS to the 26 phone-only:** ✅ they gave the number for this purpose.
- **Unsubscribe (13-13):** honoring it is NDPA-positive; only the email being suppressed is processed; transactional/legal-basis comms stay non-unsubscribable.
- **Association proxy-collection (13-2):** flagged as a **new DPIA pattern** (untrained head collecting members' NIN/phone = processor/controller + proxy-consent duties); rows stay `imported_unverified` until a member-side check. Appendix H (DPIA) needs a real update — noted in the spec, not built.

### Key design choices per story (the nuances)
- **13-12 source='public' gate:** the auto-send fires ONLY for self-service completers — (a) the copy "thank you for *completing your profile*" is only true for them; (b) avoids double-emailing enumerator-entered rows (which get the 9-58 confirmation instead). Rare edge (1 enumerator respondent so far).
- **13-12 marker = `metadata.thankyou_referral_sent_at`** (JSONB, mirrors 9-58 `confirmation_email_sent_at`) → **NO migration**. The blast stamps it too → no double-send to the existing 61. TOCTOU (read-then-stamp not atomic) **accepted by design** — send-then-mark favors *delivery* over strict-once (a lost thank-you is worse than a rare dup); parity with 9-58.
- **13-12 fail-soft:** `void this.sendThankYouReferralEmail(...)` fire-and-forget + fully try/caught — a comms failure must NEVER fail ingestion (9-26 data-integrity lesson).
- **13-13 token = AES-256-GCM, not the spec'd HMAC** (code-review AI-4 upgrade): encrypts the email so recipient PII isn't readable from `?token=` in nginx/CF access logs; GCM tag = integrity; stateless (no token table).
- **13-13 GET vs POST (code-review AI-1, Critical):** a bare GET renders a confirm page (no mutation) whose button POSTs — so an email-security **scanner/prefetcher that GETs the List-Unsubscribe URL can't silently unsubscribe** a recipient. RFC-8058 one-click (provider POSTs) unaffected.
- **13-13 marketing-only headers:** transactional + ops/alert emails get NO List-Unsubscribe header (you don't unsubscribe from a login link or a critical alert). The category-gate lives in `dispatch` (which owns the category); provider is a thin transport.

### The `admin@oyoskills.com` ops-bounce (separate, noted)
The Telegram deliverability flag decomposed to: 62 historical `example.com` (June-21 incident) + **3 real bounces to `admin@oyoskills.com`** (a super-admin notification address whose mailbox bounces). The **ops/alert path deliberately does NOT consult `email_suppressions`** (suppressing it would silence critical alerts) — so it keeps bouncing ~daily. **This is a SEPARATE operator fix** (make `admin@` deliverable OR change the super-admin's email), explicitly NOT part of 13-13. The other super-admin (`aw***@gmail.com`) receives everything, so no alerts are actually lost.

---

## State on the box (prod) — secrets + config
- `RESEND_WEBHOOK_SECRET` = set (the Resend webhook signing secret). Webhook endpoint `https://oyoskills.com/api/v1/webhooks/resend` live, real events recording.
- `UNSUBSCRIBE_SECRET` = **set 2026-06-30** (self-generated random; full unsubscribe loop prod-verified: sign→POST 200→suppressed→cleaned up). Stable — do NOT rotate (would break links in already-sent emails; none sent yet).
- `RESEND_API_KEY` = the existing prod key (NOT rotated — operator waived).
- Both new secrets are **fail-soft** if unset (feature degrades, never crashes).
- Backup: `_ops-backups/draft-expiry-pre-reset-2026-06-29.csv`.

## Operator residuals (the only things left)
1. **$20 Resend Pro** (Jul-1) + **master-form re-pin** if the form changed → then say "go" and the orchestrator runs the cohort dry-run → live blasts (A=52 → B=271, spaced; C=61) via Tailscale, watched on the 9-63 meter + `getCampaignFunnel`.
2. **Manual SMS** from +234 706 560 6479 to the **26 phone-only** (templates in the 13-11 story: thank-you variant for the 15 completers, nudge variant for the 11 incomplete).
3. **`admin@oyoskills.com`** — make deliverable or change the super-admin address (stops the ~daily ops bounce).
4. **Association trade list** — confirm/extend Appendix B in `docs/launch-campaign/association-data-sheet.xlsx` (or paste the guilds → orchestrator regenerates the dropdown).

## Pending-work triage (nothing launch-gating)
Roadmap Tiers: launch-critical (Phases 0-2) = **done in code**. Everything open is Tier B (post-launch hygiene) or Tier C (future epics). **NOTHING open gates Jul-1.**
- **Zero-risk board-tidy (status-flips of done-but-unmarked `review` stories):** 9-59 (merged+deployed), 13-8 (dev+review done), 9-20 (closed-to-review), 10-5 (DSA template). — *offered, not yet done.*
- **9-18 stays `review` correctly** — its only open AC (#E9, Step-4 stall < 30% over 7 days) needs **post-launch traffic** to measure; closes after the campaign generates volume. Written abort-tripwire: if completion-rate craters in the first hours (watch 9-19 funnel + cf-traffic-watch), pause the paid spend (radio is movable 24-48h).
- **Do NOT touch launch surfaces (wizard/forms/CSP/email/auth) pre-launch** for Tier-B hygiene — bad trade. Post-launch cleanup sprint.
- **Future:** Epic 10 (API governance), Epic 11 (import), Epic 12 (dashboard refresh, multi-week — lead 12-3 utils-barrel-split), 13-6/13-10 (dashboards, depend on Epic 12), 13-2 importer (fast-follow on 11-2), 13-4 (enumerator prod-smoke — gates FIELD, not email), 13-5 (Yoruba).

## Resume-cold pointer
Prod `9fd9e7a`, in-sync, CI green. The campaign spine is live + prod-verified. Next action is **operator** (Pro + re-pin → fire the blasts). For the fire: cohort dry-run first, then live A→B spaced, watch the meter + funnel. Every send/bounce/click/conversion/unsubscribe now lands in `email_events`/`email_suppressions` and is measurable via `ReportService.getCampaignFunnel(campaignId)`.

---

## ADDENDUM — 2026-07-03/04 session: stranded-push resolution + local test-DB parity
**main @ `13275f1` (deployed, CI green).** The prior session's laptop died mid-`git push`, leaving two commits committed-but-unpushed (`main` 1 ahead of `origin`). This session landed them and fixed the root cause the push exposed. Full context: `local-test-db-parity` memory + Pitfall #42.

**What was stranded (item 8 of that session's agenda — "confirm the push landed and CI is green"):**
- `d55dadc` — 13-2 `imported_association` added to the `respondents.source` enum (the cheap pre-launch slice of the [Registry Data-Status Taxonomy](../_bmad-output/planning-artifacts/registry-data-status-taxonomy.md)).
- `13275f1` — the test-infra parity fix (this session).

**The gate failure was NOT code — it was local DB drift.** The pre-push hook ran the full suite against the DEV DB (`app_db`, `NODE_ENV=development`) because it inherited root `.env` and the db-guard no-ops outside `NODE_ENV=test`. `app_db` had fallen ~an epic behind (missing `email_events`/`email_suppressions`, the new enum, constraints) while an earlier agent kept `app_test` current per convention. Resolution, in order:
1. **Synced `app_db`** (`db:push:full:force`) after clearing **21 leaked constraint-rejection fixtures** (`Invalid Status Test`/`Invalid Org Test`/`totally_made_up_status`) that were blocking the CHECK-constraint migrations.
2. **Dropped stale `oslsr_bench`** (spent 9-11 benchmark DB, via its own `cleanup:audit-bench`).
3. **Re-pointed `.husky/pre-push` at `app_test` + `NODE_ENV=test`** — so the local gate validates the SAME clean slate CI's `test_db` uses; the guard is now engaged, making it impossible to silently test against (and pollute) `app_db` again.
4. **Made `me.service.test.ts` (9-61) own its form fixture** (`vi.spyOn(getPublicActiveForm)` in `beforeEach` — `beforeAll` is wiped by `restoreMocks:true`). These 2 tests were an ambient-DB coupling: green in CI (no form pinned), red on `app_db` (real form → completeness enforced).

**Local DB layout now (settled):** `app_db` = canonical dev DB (499k seed, form pinned, prod-faithful) — run the app here, NOT the suite; `app_test` = clean CI-mirror (suite runs here); `oslsr_bench` = dropped.

**Pitfall footnote:** the first push "failed" only because the laptop slept overnight mid-run (9h duration, hook timeouts, **0 assertion failures**). Re-push with the machine awake was green. See Pitfall #37/#42.

**Items 2/4/5 (loose threads) status:** addressed at the DESIGN level by John's taxonomy spec + Bob's story sweep (12-4 model, 12-5/12-6/12-7 renderers, 13-2/13-6 amendments, 13-14 Public-Core split) — all `ready-for-dev`/`backlog`, NONE implemented. Four open tensions flagged this session (recorded for the retrospective): (1) the `COUNT(DISTINCT)` key is under-specified for no-NIN/shared-phone rows and must match the importer's dedup key; (2) **"verified" is undefined until taxonomy Open-Q1 — does the system VALIDATE NIN vs only CAPTURE it? — is answered; do not show a "verified registry" number before then**; (3) the two-form split makes Public-Core rows `core` forever → the `full` field-sample (the baseline-study substance) could stay thin while the headline grows — someone must own the required `full` count; (4) all honest-display renderers are post-launch, so **pull 12-5 (label honesty) forward** to avoid a wrong "Total Respondents" in front of the Ministry during the launch window.

**→ ALL FOUR RESOLVED 2026-07-04 (John PM + Bob SM round, Awwal-approved) — see `registry-data-status-taxonomy.md` §Resolutions R1–R4:** (R1) NIN has no check digit → format-only, `nin_on_file` ≠ `verified` (Story **13-15**, launch-blocking); (R2) DISTINCT key = NIN→E.164 phone→id + `identity_ambiguous` bucket, shared with the 11-2 importer (baked into 12-4); (R3) `full` stratum floor = ≥330 & ≥10/LGA×33, tracked on the dashboard (baked into 13-14/12-6); (R4) 12-5 pulled forward to pre-launch.
