# Story 9.30: Unblock Cloudflare Web Analytics — add `cloudflareinsights.com` to CSP `connect-src`

Status: review (deployed 2026-05-31 via commit `095bb1c`; AC#10 live-curl confirmed both domains; AC#11+#12 await 24-48h post-deploy validation)

<!--
Authored 2026-05-31 by Bob (SM) via canonical *create-story --yolo template.

Real-data justification: VPS data pull on 2026-05-31 surfaced multiple
`csp_violation` warnings in `pm2-logs.txt` (`docs/vps-snapshots/2026-05-31/
pm2-logs.txt:33-34,40,46,48-50`). The Cloudflare Web Analytics beacon shipped
2026-05-19 in Story 9-20 (commit `d6ffc24`) loads correctly from
`static.cloudflareinsights.com` (whitelisted under `script-src`) but every
RUM POST to `https://cloudflareinsights.com/cdn-cgi/rum` is BLOCKED by
`connect-src` (which currently allows: `'self'`, the two wss:// origins,
`accounts.google.com`, `hcaptcha.com`, `*.hcaptcha.com`, `cdn.jsdelivr.net`
— no Cloudflare host). CSP violation reports confirm `disposition: enforce`
+ `effectiveDirective: connect-src` + `blockedURL: cloudflareinsights.com:443/cdn-cgi/rum`.

Net effect: Cloudflare Web Analytics has been silently dark since launch on
2026-05-19. 12 days of organic traffic + the upcoming Cohort A blast +
enumerator field deployment this week all risk landing in the same dark
window. Same lesson family as `feedback_install_analytics_before_launch.md`
("Install analytics BEFORE launch") — except this time the installation
shipped but the CSP gate locks it out. The lesson generalises: shipping an
analytics beacon is not the same as analytics working — verify data ingress
end-to-end before declaring done.

Operator (Awwal) flagged urgency on 2026-05-31: enumerators going to field
this week + Cohort A campaign about to be triggered. Both events generate
exactly the traffic we want measured. CSP patch must land BEFORE either,
or we permanently lose analytic visibility for those windows too.

This is a SMALL, well-scoped, additive change — one host added to one
directive in Helmet config + one corresponding edit in the nginx mirror.
The csp-parity test (Story 9-8 infrastructure) will catch any drift.
Risk: LOW. Effort: ~1-2 hours including code review + deploy.
-->

## Story

As the **Super Admin operating OSLRS during active launch with field-survey traffic imminent**,
I want **the Helmet CSP `connect-src` directive (and its nginx mirror) extended to allow `https://cloudflareinsights.com`**,
So that **the Cloudflare Web Analytics RUM beacon shipped 2026-05-19 in Story 9-20 can finally POST data successfully**, **`csp_violation` warnings for the Cloudflare beacon disappear from `pm2-logs.txt`**, and **upcoming Cohort A campaign traffic + enumerator field-survey traffic land in a working analytics window rather than the same dark hole that swallowed the last 12 days**.

## Background — what's broken and why

### The mismatch

Story 9-20 (commit `d6ffc24`, 2026-05-19) added the Cloudflare Web Analytics beacon to `apps/web/index.html`. The beacon JS is fetched from `https://static.cloudflareinsights.com/beacon.min.js`. That URL is whitelisted under `script-src` in both Helmet and nginx (confirmed at `apps/api/src/app.ts:146` and `infra/nginx/oslsr.conf:55` — `https://static.cloudflareinsights.com` appears in both `script-src` lists).

The beacon runs, scrapes RUM telemetry, and tries to POST it to `https://cloudflareinsights.com/cdn-cgi/rum`. That host (the root domain `cloudflareinsights.com`, NOT the `static.` subdomain) is NOT in `connect-src` — see `apps/api/src/app.ts:167-174` and `infra/nginx/oslsr.conf:55` `connect-src` list. The POST is blocked. No telemetry is recorded.

### Evidence from production

From `docs/vps-snapshots/2026-05-31/pm2-logs.txt`:
- Line 33-34: violations on `https://oyoskills.com/register?step=3` — `blockedUri: https://cloudflareinsights.com/cdn-cgi/rum`, `sourceFile: https://static.cloudflareinsights.com/beacon.min.js`
- Line 40: violation on the magic-link landing path `https://oyoskills.com/auth/magic?token=...&purpose=pending_nin_complete` — same `blockedUri`
- Line 46-48: violations on bare-IP request `https://159.89.146.93/` — scanner traffic; not user-driven but still hits the same block
- Line 49-50: detailed `csp_violation_unknown_format` reports with full Reporting API payload — confirms `disposition: enforce`, `effectiveDirective: connect-src`, `statusCode: 200` (page loaded fine, only the beacon POST failed)

These are NOT report-only warnings. Helmet runs `reportOnly: process.env.NODE_ENV !== 'production'` (set by Story 9-8) — in prod, `disposition: enforce` is correct. The beacon POST is being blocked, not just reported.

### Why this matters now (and not in a quiet week)

Operator pushing enumerators into field this week + Cohort A supplemental-survey blast about to trigger. Both produce exactly the traffic we'd want analytics for. Story 9-19 dashboard CLI shows raw DB-derived counts but tells us nothing about page-level engagement, drop-off, or bounce — that's what Cloudflare Web Analytics was added for in 9-20. Every day the CSP block stays in place is another day of zero engagement analytics during a high-traffic window.

### Why this is a one-line-per-file fix

The Helmet config exports `cspDirectives` (see `apps/api/src/app.ts:139-198`) and `csp-parity.test.ts` enforces that Helmet's `connect-src` exactly equals nginx's `connect-src` (Story 9-8 drift detection). Adding `"https://cloudflareinsights.com"` to one place without the other will fail tests. Adding to both keeps parity.

## Acceptance Criteria

1. `apps/api/src/app.ts` `cspDirectives.connectSrc` array MUST include `"https://cloudflareinsights.com"` as a new entry. Order is not load-bearing but for readability place it immediately after the existing `cdn.jsdelivr.net` entry.

2. `infra/nginx/oslsr.conf` MUST have `https://cloudflareinsights.com` added to the `connect-src` directive in BOTH `add_header Content-Security-Policy "..."` lines (lines 55 AND 79 as of 2026-05-31 — verify line numbers at implementation time). Both lines must remain character-identical to each other (they're a documented duplication, Story 9-8 pattern).

3. `apps/api/src/__tests__/csp.test.ts` MUST be extended with a test asserting that `connect-src` includes `cloudflareinsights.com` — pattern-match the existing tests for `hcaptcha.com` and `accounts.google.com` (e.g., `expect(csp).toContain('connect-src')` + `expect(csp).toContain('cloudflareinsights.com')`).

4. `apps/api/src/__tests__/csp-parity.test.ts` MUST continue to pass — it auto-detects Helmet ↔ nginx drift, so AC#1 + AC#2 together satisfy this implicitly. If the parity test fails post-change, one of the two sources is wrong; fix the mismatched side, do NOT silence the test.

5. ALL existing CSP tests in `apps/api/src/__tests__/csp.test.ts` MUST continue to pass without modification — the change is additive only, no existing directive entry is removed or altered. Specifically, the existing assertions for `hcaptcha.com`, `accounts.google.com`, `static.cloudflareinsights.com` (under script-src), `cdn.jsdelivr.net` (under connect-src), and `wss://` origins all remain valid.

6. Full test suite (`pnpm test`) MUST pass with zero new failures, zero new warnings.

7. Pre-commit code review on uncommitted working tree per `feedback_review_before_commit.md`. The code-review skill or `bmad:bmm:workflows:code-review` workflow MUST be run BEFORE the first commit. Any HIGH or MEDIUM findings must be addressed or explicitly deferred-with-rationale in §"Review Follow-ups (AI)". LOWs may be batch-resolved or deferred. Auto-fixes must NOT be applied without operator review for a story this small (no batch auto-fix shortcuts).

8. Commit MUST be authored by Awwal locally, not auto-committed by an agent. Per the canonical workflow, `dev-story` ends with an uncommitted working tree and code review runs first.

9. Deploy MUST go through CI/CD (no direct VPS edits). Build artifacts ship via the cloud-runner pipeline established in Wave 0 (`prep-build-off-vps-cloud-runner`). nginx config changes deploy via the existing deploy job; if nginx ships separately from API, document the dual-deploy ordering in the story Dev Agent Record before merge.

10. Post-deploy live-curl validation MUST capture both production response headers — `curl -sI https://oyotradeministry.com.ng/` and `curl -sI https://oyoskills.com/` — and confirm `Content-Security-Policy` header includes `cloudflareinsights.com` in `connect-src`. Capture in the story Dev Agent Record. This mirrors the Story 9-7 / 9-8 "Live-curl confirmation" pattern.

11. 24-hour validation window post-deploy: confirm zero new `csp_violation` warnings naming `cloudflareinsights.com` in `/root/.pm2/logs/oslsr-api-out.log` on the VPS. Capture grep output in story Dev Agent Record. (This validates the patch actually solved the production problem — not just the test problem.)

12. Confirm Cloudflare Web Analytics dashboard begins receiving data within 24-48 hours of deploy. Capture screenshot or dashboard-row count in story Dev Agent Record. (NOTE: Cloudflare Analytics dashboard URL + login credential are in the operator's account; this AC requires operator verification, not agent verification.)

13. NO other CSP directives may be changed in this story. Specifically, `script-src` already allows `static.cloudflareinsights.com` and that entry MUST NOT be removed or modified. `frame-src`, `img-src`, `style-src`, `font-src`, `worker-src`, `media-src`, `object-src`, `base-uri`, `form-action`, `frame-ancestors`, `script-src-attr`, `report-uri`, `report-to`, `upgrade-insecure-requests`, `default-src` are out of scope.

14. NO Cloudflare-related code changes outside CSP. The beacon JS in `apps/web/index.html` already works correctly (loads from `static.cloudflareinsights.com`); no frontend changes needed. No new Cloudflare API integrations. No environment variable additions.

15. Memory must NOT be updated as part of this story commit — leave any post-merge memory consolidation to the operator. (The general pattern: stories ship the code + docs; memory updates are operator-controlled, per `feedback_review_before_commit.md`'s spirit.)

## Tasks / Subtasks

- [x] Task 1 — Patch Helmet CSP directive (AC: #1)
  - [x] Open `apps/api/src/app.ts`, locate the `connectSrc` array inside the exported `cspDirectives` (lines 167-174 as of 2026-05-31)
  - [x] Add `"https://cloudflareinsights.com"` as a new array entry immediately after `"https://cdn.jsdelivr.net"`
  - [x] No other changes to this file

- [x] Task 2 — Patch nginx CSP mirror in lockstep (AC: #2)
  - [x] Open `infra/nginx/oslsr.conf`, locate the `add_header Content-Security-Policy` lines (currently lines 55 and 79)
  - [x] In each `connect-src` clause, insert `https://cloudflareinsights.com` immediately after `https://cdn.jsdelivr.net` (and before the closing `;` of the directive)
  - [x] Confirm both lines are still character-identical to each other after the edit (use a side-by-side diff if uncertain)

- [x] Task 3 — Add positive test in csp.test.ts (AC: #3)
  - [x] Open `apps/api/src/__tests__/csp.test.ts`
  - [x] Mirror the existing pattern (e.g., the hcaptcha or accounts.google.com test in the connect-src section) to add a test asserting `cloudflareinsights.com` appears in `connect-src`
  - [x] Use the same `content-security-policy-report-only` header in tests (test env is non-prod so report-only is correct here per app.ts:202)

- [x] Task 4 — Run full test suite (AC: #4, #5, #6)
  - [x] From repo root: `pnpm test`
  - [x] Verify csp.test.ts passes (incl. new test) AND csp-parity.test.ts passes (auto-detects Helmet↔nginx drift)
  - [x] Verify no other test failures or new warnings
  - [x] If csp-parity.test.ts fails: one of Task 1 or Task 2 is incomplete or mistyped — fix the lagging side, do NOT modify the parity test

- [ ] Task 5 — Pre-commit code review on uncommitted working tree (AC: #7, #8)
  - [ ] Run `bmad:bmm:workflows:code-review` (or the `/code-review` skill) on the uncommitted diff
  - [ ] Address HIGH/MEDIUM findings; LOW findings may be deferred to §"Review Follow-ups (AI)" with rationale
  - [ ] Auto-fixes require explicit operator review for a change this small — do NOT batch-apply
  - [ ] Story this small: code review SHOULD find at most 0-2 issues. Surface-area lessons (drift discipline, additive-only intent, no scope creep) are inherently checked by csp-parity.test.ts

- [ ] Task 6 — Operator commit + push (AC: #8, #9)
  - [ ] Operator (Awwal) authors the commit locally — agents do NOT auto-commit
  - [ ] Conventional commit format: `feat(9-30): allow Cloudflare Insights RUM in CSP connect-src` or `fix(9-30): unblock Cloudflare Web Analytics RUM beacon (CSP connect-src)` — operator's call
  - [ ] Push to `main` (no PR branch required for a story this small; this matches recent 9-28 pattern)
  - [ ] CI runs through lint-and-build + tests + deploy; monitor for green

- [ ] Task 7 — Post-deploy live-curl validation (AC: #10)
  - [ ] After CI green: `curl -sI https://oyotradeministry.com.ng/` and `curl -sI https://oyoskills.com/`
  - [ ] Verify `Content-Security-Policy` header includes `cloudflareinsights.com` in `connect-src`
  - [ ] Capture both responses (or relevant excerpts) in story Dev Agent Record
  - [ ] If the new directive is NOT in the live header: investigate whether nginx reloaded (`systemctl reload nginx` on VPS, or check deploy script's nginx-reload step), whether the new dist bundle deployed (web build off-cloud-runner), and whether Helmet is being properly returned (some routes return restrictive default — verify on a known 200 route per memory pattern)

- [ ] Task 8 — 24h post-deploy validation + Cloudflare dashboard check (AC: #11, #12) — DEFERRED to operator
  - [ ] 24h after deploy: SSH to VPS, grep `/root/.pm2/logs/oslsr-api-out.log*` for `cloudflareinsights.com` in `csp_violation` events — should be zero new entries post-deploy timestamp
  - [ ] Capture grep result in story Dev Agent Record
  - [ ] Within 24-48h: check Cloudflare Web Analytics dashboard for first data rows; capture row count or screenshot in Dev Agent Record
  - [ ] If still no data after 48h: open a follow-up investigation — possible causes include (a) Cloudflare account-level analytics not enabled for this property, (b) beacon JS site-key mismatch, (c) Cloudflare Insights rate-limiting brand-new accounts, (d) browser ad-blockers / Brave-shields rejecting the beacon regardless of CSP
  - [ ] On flip to `review` → `done`, operator confirms BOTH AC#11 + AC#12 in story Dev Agent Record

## Dev Notes

### Architecture references

- **CSP enforcement mode**: Helmet runs `reportOnly: process.env.NODE_ENV !== 'production'` (`apps/api/src/app.ts:202`) — enforcing in prod, report-only in dev/test. This was intentionally set by Story 9-8. Tests assert dev/test mode (`content-security-policy-report-only` header). Prod-mode parity is validated by post-deploy live-curl, not by tests.
- **Drift detection**: `apps/api/src/__tests__/csp-parity.test.ts` parses both Helmet `cspDirectives` and `infra/nginx/oslsr.conf` `add_header` and asserts byte-for-byte equality of all directive entries (including order? — verify with the test; if order matters, place new entry in matching position in both). Story 9-8 shipped this drift detector specifically to prevent the Helmet-only-update class of bug.
- **Reporting API**: CSP-violation reports flow to `POST /api/v1/csp-report` (registered at `apps/api/src/app.ts:121`, BEFORE Helmet — so the CSP violation endpoint itself is never blocked by CSP). Reports are logged via `csp-report` Pino logger at `level:40` (warn).
- **Helmet config is exported**: `export const cspDirectives` (line 139) — exported specifically so `csp-parity.test.ts` can read it. Do NOT remove the export.

### Source references

- `apps/api/src/app.ts:120-211` — CSP report endpoint, env-driven CORS, Helmet config, reporting endpoints. The whole CSP block.
- `apps/api/src/__tests__/csp.test.ts` — Existing positive assertions for current directives. Mirror the patterns here for the new connect-src assertion.
- `apps/api/src/__tests__/csp-parity.test.ts` — Drift detection. Should require zero changes (the parity test reads both sources dynamically).
- `infra/nginx/oslsr.conf:55,79` — Two `add_header Content-Security-Policy` lines that mirror Helmet. Both must be edited.
- `apps/web/index.html` — Contains the Cloudflare beacon script tag shipped in Story 9-20 commit `d6ffc24`. NO changes here.
- `docs/vps-snapshots/2026-05-31/pm2-logs.txt:33-50` — Evidence of the production violations driving this story.
- `docs/vps-snapshots/2026-05-31/SUMMARY.md` headline #4 — Operator-facing summary of the issue.
- Memory file `feedback_install_analytics_before_launch.md` — The cousin lesson: install analytics BEFORE launch. This story addresses a different failure mode in the same lesson family — analytics WAS installed pre-launch, but the CSP gate locked it out post-launch. Lesson generalises: "shipped" ≠ "working"; verify data ingress end-to-end.

### Why not also add `*.cloudflareinsights.com`?

The RUM POST target is the root host `cloudflareinsights.com`, not a subdomain. CSP wildcards are pattern-restrictive; `https://*.cloudflareinsights.com` matches `static.cloudflareinsights.com`, `foo.cloudflareinsights.com`, etc. — but NOT the root `cloudflareinsights.com` itself. Cloudflare's docs confirm the RUM endpoint is bare-host. Adding the wildcard would expand attack surface without solving the problem. Add ONLY the exact host.

### Why not move to `*.cloudflareinsights.com` and drop `static.cloudflareinsights.com`?

`script-src` allows `static.cloudflareinsights.com`. The wildcard `*.cloudflareinsights.com` would cover it AND any future subdomain Cloudflare uses. Tempting refactor, but out of scope per AC#13. If you want to consider it later, open a follow-up story — don't piggyback. This story is additive only.

### Why operator commits, not the agent

`feedback_review_before_commit.md` (operator-stated, validated across 6+ epics): code review runs on uncommitted working tree, NOT on merged PRs. Auto-commits at end of `dev-story` produce a transcript artifact (the code-review report) that becomes invisible if you commit-then-review. Recent 9-26/27/28 stories all follow this pattern: dev-story → code-review skill on uncommitted → operator commits with conventional message.

### Project Structure Notes

Aligns with project structure. No file moves, no new files (except possible test extension within existing `__tests__/csp.test.ts`).

### Testing standards summary

- Backend tests live in `apps/api/src/__tests__/` (project convention: backend uses `__tests__/` folders per `project-context.md` § Testing Organization)
- Test runner: vitest via root `pnpm test` (or `pnpm vitest run apps/api/src/__tests__/csp.test.ts` for fast iteration during dev)
- CSP test pattern: read response header from supertest GET `/`, assert substring includes
- DO NOT mock Helmet — these are integration tests that boot the Express app

### References

- [Source: apps/api/src/app.ts:120-211] — CSP setup
- [Source: apps/api/src/__tests__/csp.test.ts] — Existing CSP test patterns
- [Source: apps/api/src/__tests__/csp-parity.test.ts] — Helmet↔nginx drift detector (Story 9-8 infra)
- [Source: infra/nginx/oslsr.conf:55,79] — nginx CSP mirror (Story 9-8)
- [Source: docs/vps-snapshots/2026-05-31/pm2-logs.txt] — Production CSP violation evidence
- [Source: docs/vps-snapshots/2026-05-31/SUMMARY.md] — Operator-facing snapshot summary
- [Source: _bmad-output/implementation-artifacts/9-7-helmet-csp-report-only.md] — Story 9-7 (CSP deployment in report-only mode)
- [Source: _bmad-output/implementation-artifacts/9-8-csp-enforce-and-nginx-mirror.md] — Story 9-8 (CSP enforcement + nginx mirror + parity test)
- [Source: _bmad-output/implementation-artifacts/9-20-cloudflare-web-analytics.md] — Story 9-20 (Cloudflare beacon shipped)

## Dev Agent Record

### Agent Model Used

Amelia (BMAD Dev Agent) on Claude Opus 4.7 (1M context). Session 2026-05-31.

### Debug Log References

- vitest run of `src/__tests__/csp.test.ts` (RED phase): 10 passed, 1 NEW test failed as expected — assertion `expected '\'self\' ws://localhost:3000 https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com https://cdn.jsdelivr.net' to contain 'https://cloudflareinsights.com'` (proves test is well-formed; failure was on the unpatched code).
- vitest run of `src/__tests__/csp.test.ts src/__tests__/csp-parity.test.ts` (GREEN phase post-patch): 17/17 passed (11 csp + 6 csp-parity). Parity test auto-detected Helmet↔nginx parity intact.
- `pnpm --filter @oslsr/api test`: 153 files passed, 2 skipped (export.performance + export.scale — pre-existing skip, not related to this story). 2219 tests passed, 7 skipped, zero failures.
- `pnpm test` (turbo full suite): 4/4 packages successful. Web side: 227 files, 2465 passed + 2 todo, zero failures. Combined: ~4684 tests passed across api+web, zero failures, zero new warnings.

### Completion Notes List

- **RGR cycle followed**: Task 3 (failing test) executed BEFORE Tasks 1 & 2 (implementation), confirming the test is well-formed (would not silently pass against unpatched code). The existing `static.cloudflareinsights.com` entry in `script-src` made the anchored regex assertion mandatory — a naked `toContain('cloudflareinsights.com')` would have produced a false-positive green test against unpatched code. The new test mirrors the line 31-37 pattern (anchored regex on the specific directive) for symmetry.
- **Helmet patch** (`apps/api/src/app.ts:174`): added `"https://cloudflareinsights.com"` as the 7th entry in `cspDirectives.connectSrc`, immediately after `"https://cdn.jsdelivr.net"` (matches AC#1 readability hint).
- **nginx patch** (`infra/nginx/oslsr.conf:55,79`): used `replace_all` on the identical `connect-src` clause appearing in both `add_header Content-Security-Policy` lines (server-level + location-level mirror). Edit confirmed character-identical between the two lines (both got the same `https://cloudflareinsights.com` inserted at the same position).
- **csp-parity.test.ts unchanged**: Helmet↔nginx drift detector auto-passed on first GREEN run — confirms both sources updated in lockstep. No modification of the parity test was required or attempted (would have violated AC#4's "do NOT silence the test" clause).
- **AC#13 + AC#14 + AC#15 honored**: no other CSP directives touched, no frontend code touched (`apps/web/index.html` untouched), no memory files touched.
- **Working tree intentionally uncommitted** per `feedback_review_before_commit.md` + parent-Claude scope directive. Tasks 5-8 (code review, operator commit, post-deploy validation) await operator action.
- **No surprises encountered**. The story's task breakdown was complete and accurate; file:line citations matched current code state. Edit time: < 5 minutes including all 3 file modifications. Test runtime: ~6 min (full suite); ~6 sec (CSP tests alone) for iteration.
- **Post-code-review (Task 5) auto-fix pass** (operator-directed 2026-05-31, overriding the default "do not auto-fix" gate): all 4 LOW findings (F1 misleading comment, F2 cdn.jsdelivr.net coverage gap, F3 inline regex duplication, F4 test placement) RESOLVED in-flight via a cohesive `csp.test.ts` rewrite — extracted `getDirective` helper, refactored 4 anchored-assertion sites to route through it, upgraded the pre-existing line-84 cdn.jsdelivr.net assertion from naked substring to helper-anchored, and relocated the new connect-src dedicated test next to the meta-test's connect-src coverage. Post-fix verification: csp.test.ts 11/11 + csp-parity.test.ts 6/6 + full `pnpm test` 4/4 packages green. See §Review Follow-ups (AI) for full per-finding rationale + verification record.

### File List

3 files modified (uncommitted):

| File | Change |
|---|---|
| `apps/api/src/app.ts` | Added `"https://cloudflareinsights.com"` as 7th entry in `cspDirectives.connectSrc` array (line 174). One-line addition. |
| `infra/nginx/oslsr.conf` | Added ` https://cloudflareinsights.com` to the `connect-src` directive in BOTH `add_header Content-Security-Policy` lines (lines 55 + 79). Both lines remain character-identical to each other. |
| `apps/api/src/__tests__/csp.test.ts` | Net restructure: (a) extracted local `getDirective(csp, name)` helper for directive-anchored assertions (was inline regex × 4 sites); (b) refactored 4 pre-existing/new sites to use the helper; (c) upgraded the line-84-era `cdn.jsdelivr.net` assertion from naked `toContain` to anchored via helper; (d) added new dedicated `connect-src cloudflareinsights.com` test placed adjacent to the meta-test's connect-src coverage. Total tests in this file: 10 → 11. |

Story file also updated:
- `_bmad-output/implementation-artifacts/9-30-csp-connect-src-cloudflare-analytics-unblock.md` — Tasks 1-4 marked `[x]`; Dev Agent Record populated; Review Follow-ups (AI) populated with all 4 code-review findings RESOLVED in-story.

### Review Follow-ups (AI)

Code review run 2026-05-31 on uncommitted working tree (per `feedback_review_before_commit.md`). Methodology: `/code-review` skill at extra-high effort; 2 parallel finder agents (correctness angles A-E + cleanup/altitude/sweep angles F-I + Phase 3). 4 LOW findings surfaced, 0 HIGH/MEDIUM. Operator directive (2026-05-31): "fix them all automatically" — overrides the story's "Auto-fixes must NOT be applied without operator review" gate per explicit instruction.

All 4 findings RESOLVED in this story before commit. No follow-up stories required.

**F1 (LOW) — Misleading comment justification in new connect-src test.** Original comment claimed "a naked toContain would pass on the script-src entry's substring even without the connect-src fix." Manual verification (and the correctness-finder agent's inline analysis) confirmed this is factually wrong: `'https://static.cloudflareinsights.com'` does NOT contain the substring `'https://cloudflareinsights.com'` because `static.` sits between `://` and `cloudflareinsights.com`. The anchored regex IS still better practice but for a different reason — it pins the host to a specific directive so a future regression that drops the host from connect-src (e.g., during a wildcard-consolidation refactor) is caught. **RESOLVED**: comment rewritten to state the correct rationale.

**F2 (LOW) — Pre-existing AC#5 coverage gap for `cdn.jsdelivr.net`.** The line-84 assertion `expect(csp).toContain("https://cdn.jsdelivr.net")` was a naked substring match against the full CSP header — would silently pass if a future refactor moved the host to a different directive. AC#5 commits to keeping the cdn.jsdelivr.net regression coverage valid in *connect-src specifically*; the substring assertion satisfied the letter, not the spirit. **RESOLVED**: line-84 assertion upgraded to use the new `getDirective(csp, 'connect-src')` helper, matching the rigor of the new Cloudflare-Insights anchored test. Pre-existing technical debt closed in-flight.

**F3 (LOW) — Anchored-directive regex duplicated inline in 4 test sites.** The pattern `csp.match(/(?:^|;)\s*<name>\s+([^;]+)/)` appeared at lines 34 (script-src), 48 (new connect-src), 56 (style-src), 100 (script-src-attr). Pre-existing pattern that this diff propagated. Future cost: when CSP spec edge cases force a regex tweak (commas in source-expressions, report-to group lists), all N copies must be hunted and updated identically. **RESOLVED**: extracted local `getDirective(csp, name): string | null` helper at top of `csp.test.ts`. All 4 anchored sites + the F2 upgrade now route through one regex source.

**F4 (LOW) — New connect-src test placement scattered the directive's coverage across non-adjacent lines.** Original placement put the new anchored connect-src test between two script-src/style-src tests (Cloudflare-host-affinity grouping). The other connect-src coverage lives inside the "all critical CSP directives" meta-test at line 84. Future maintainers searching for "all connect-src coverage" would have to read two non-adjacent blocks. **RESOLVED**: the new dedicated connect-src test moved to immediately AFTER the "all critical CSP directives" meta-test block, so connect-src coverage now appears as one contiguous block (anchored assertion inside the meta-test for cdn.jsdelivr.net, then the dedicated cloudflareinsights test directly following).

**Post-fix verification:**

- `pnpm vitest run apps/api/src/__tests__/csp.test.ts apps/api/src/__tests__/csp-parity.test.ts`: 17/17 passed (csp.test.ts 11 + csp-parity.test.ts 6).
- `pnpm test` (turbo full suite): 4/4 packages successful; @oslsr/api 2219 passed + 7 skipped (expected); web/types/utils cached unchanged. Zero new failures, zero new warnings.
- The csp-parity drift detector auto-passed after the refactor — confirms the Helmet ↔ nginx parity is intact post-refactor (the helper extraction is test-internal and doesn't touch the cspDirectives export shape).
- `getDirective` helper accepts only known directive-name constants in all callers; no regex-injection surface added.

Net story-9-30 diff after all fixes (verified via `git diff HEAD`):

- `apps/api/src/app.ts` — +1 line (Helmet connectSrc entry)
- `infra/nginx/oslsr.conf` — 2 lines updated identically (connect-src in both add_header CSP lines)
- `apps/api/src/__tests__/csp.test.ts` — net restructure (helper extraction + 4 site refactor + new test + line-84 upgrade + test relocation). Test count 10 → 11.

### Live-curl confirmation (AC #10)

Run 2026-05-31 ~11:39 UTC, immediately after CI deploy completed (commit `095bb1c`, deploy job ran 11:37:22 → 11:38:43 UTC = 81 seconds).

```
$ curl -sI https://oyotradeministry.com.ng/ | grep -i "content-security-policy" | grep -oE "connect-src[^;]+"
connect-src 'self' wss://oyotradeministry.com.ng wss://oyoskills.com https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com https://cdn.jsdelivr.net https://cloudflareinsights.com

$ curl -sI https://oyoskills.com/ | grep -i "content-security-policy" | grep -oE "connect-src[^;]+"
connect-src 'self' wss://oyotradeministry.com.ng wss://oyoskills.com https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com https://cdn.jsdelivr.net https://cloudflareinsights.com
```

Both production domains now serve `https://cloudflareinsights.com` as the 7th entry in `connect-src`, positioned immediately after `https://cdn.jsdelivr.net` exactly as specified by AC#1/#2. Header is the enforcing variant `Content-Security-Policy` (not `-Report-Only`) on root-path 200 responses. AC#10 SATISFIED.

**CI/CD pipeline summary** for commit `095bb1c`:

| Job | Duration | Result |
|---|---|---|
| lint-and-build | 1m21s | ✅ |
| test-api | 1m45s | ✅ |
| test-web | 2m50s | ✅ |
| test-unit (testing) | 21s | ✅ |
| test-unit (utils) | 24s | ✅ |
| lighthouse | 3m18s | ✅ |
| dashboard | 23s | ✅ |
| deploy | 1m21s | ✅ |

Total push → live: ~6 minutes wall-clock.

### 24h post-deploy validation (AC #11)

(to be populated 24h post-deploy)

### Cloudflare dashboard confirmation (AC #12)

(to be populated 24-48h post-deploy, operator-verified)
