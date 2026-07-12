# Pre-Launch Operator Runbook — OSLRS public-survey go-live

**Created:** 2026-06-22 · **Owner:** Awwal (operator) · **Prod:** `c6521cd` (all launch-critical dev done + deployed)

> The build is complete. Launch is now **operator + measurement-gated**, not dev-gated. This is the ordered path from "code done" → "blasts fired + field live."
> Status sources of truth: `docs/roadmap-to-launch.md` (STATUS block) · `_bmad-output/implementation-artifacts/sprint-status.yaml`. Campaign hub: `docs/runbooks/re-engagement-campaign-launch.md`.

## 🚦 Launch gate — fire the blasts only when ALL are green
| Gate | Status | Closes via |
|---|---|---|
| Coherent public journey (9-38/39/40/61) | ✅ done + deployed | — |
| Zero open R2 security findings | ✅ met in code (register closed) | — |
| Form fidelity + minor safeguarding (9-54/9-55) | ✅ done | — |
| Support traceability (9-56) | ✅ done | — |
| Analytics live (9-30) | ✅ done | — |
| **Wizard Step-4 stall < 30%** (9-18 AC#E9) | ⏳ **MEASURE** | Step 1 |
| **Capacity ready** (9-20) | ⏳ finalize | Step 2 |
| **Blast infra** (Resend Pro + Termii) | ⏳ operator | Steps 3–4 |
| **Wizard one-pass — no two-pass loop** (13-29 AC6) | ⏳ **MANUAL DRY-RUN** | Step 5b |

---

## Ordered steps

### Step 1 — 9-18 AC#E9: measure wizard Step-4 stall (target < 30%)
- Watch the **9-19 ops dashboard** wizard funnel; need **≥ 7 days** of post-deploy data.
- **Pass** = Step-4 stall < 30% → flip `9-18` review→done in sprint-status.
- Passive — it accumulates while you do Steps 2–5.

### Step 2 — 9-20 capacity prep (finalize)
- Close the remaining `9-20` items; flip review→done.
- Spot-check VPS headroom (pm2/RAM — last ~26%), DB pool, rate-limits — they're about to take a traffic spike.

### Step 3 — Resend: ROTATE the key + upgrade to Pro (⚠️ do BOTH — the 9-63 incident)
1. **Rotate `RESEND_API_KEY`** — the old key (`re_SKxcW…`) was leaked into local dev (2026-06-21 quota exhaustion). Mint a NEW prod key in Resend, set it in the VPS `/root/oslrs/.env` **before** any deploy, restart `oslsr-api`.
2. **Update the 9-63 AC0 fingerprint** — recompute the SHA-256 of the *new* prod key on the box (hash only) and update `KNOWN_PROD_RESEND_KEY_SHA256` in `apps/api/src/providers/index.ts` so both the leaked key AND the new key are dev-isolated. (Or add it to `RESEND_BLOCKED_KEY_FINGERPRINTS` — no deploy needed.)
3. **Upgrade to Resend Pro** ($20/mo) — the free 100/day tier won't survive the blasts.
4. **Clear `example.com`** from Resend → Suppressions (the bounced test sends).
5. Verify: a test send from prod succeeds on the new key.

### Step 4 — Termii sender-ID (⏳ LONG LEAD — start FIRST)
- Register the alphanumeric **Termii sender-ID** — approval takes **days**, so kick this off before everything else. Path 2/Termii is the confirmed SMS provider. Bind `TERMII_*` on the VPS `.env`.
- **VERIFIED 2026-06-23 (probe `apps/api/scripts/_termii-test.ts`, v3 host `https://v3.api.termii.com`):** the account is live (10 NGN bonus, user `oyotrade`) and sender-ID **`oyotrade` is submitted but `pending`**. **A pending sender CANNOT send** — every send 404s `ApplicationSenderId not found` until approval. So the bonus can't smoke-test sending; **KYC + sender-ID approval is a HARD gate**, confirmed empirically.
  - To accelerate approval: **complete KYC** + **rewrite the sender usecase** (the placeholder "Hello this is a test message from oyo trade" invites rejection — use a concrete transactional usecase, e.g. "OTP + registration-status notifications for the Oyo State skills survey, oyoskills.com, a government skills-mapping program").
  - After approval, re-run the probe (`status=active`), then a `--send --to <phone>` test, then build the Termii adapter (currently only `NoopSmsProvider` exists — 9-27 Part B).
  - Email (Resend) launch is **independent** of this — do not let the SMS gate block the email blasts.

### Step 5 — Master-form re-pin (MANDATORY discipline)
- If the survey form changed: re-upload **mints a NEW form row** → you MUST **re-pin `wizard.public_form_id`** (publish → re-pin). Old versions are not auto-retired.
- Verify the wizard renders the intended form (calc + group-relevance live).
- **Pin via the UI, not the DB (Story 13-17 rule).** A direct prod-DB setting-write bypasses `audit_logs` — the 2026-07-05 manual pin left no audit row (repaired retroactively via `apps/api/scripts/_retro-audit-2026-07-05-manual-pin.ts`). The UI pin path works on Remember-Me sessions since 13-17 (global re-auth prompt + retry). If a manual DB write is ever truly unavoidable, follow it immediately with a retroactive `settings.flipped` audit row **through `AuditService.logActionTx`** (hash chain — never raw-INSERT); use that script as the template.

### Step 5b — 13-29 wizard one-pass verification (AC6 residual — run against the form pinned at blast time)
**13-29 itself requires NO re-pin** — it's a deployed web-app code fix, nothing in the XLSForm. This gate just verifies that fix on **whatever form is pinned when the blast fires**: the current pin (`pubcore-1 019f48c2…`, which already carries 13-19 + 13-20 since Dry-run #1, 2026-07-09) **or** a new row **if** Step 5 re-pinned. If you re-pin, run this **after** that re-pin.

**Gate:** a fresh public registration reaches the summary **once**, with **Submit enabled on first arrival** — no "Some required survey questions still need an answer… go back and fill survey" bounce-back. Run in a real browser against the form pinned at blast time. Status: ⬜ **not yet run** (tick with date + evidence when done).

**Why a manual run is still required (the automated tests are necessary but not sufficient):**
- **The fix's correctness is partly a property of the *pinned form's metadata*, which is regenerated on every upload — so a re-pin is the one thing that can silently un-fix it.** 13-29 makes section auto-skip evaluate `${age} >= 15` against `withCalculatedFields(...)`. That gate + the `age` calculation are materialised by the xlsform→native conversion (`xlsform-to-native-converter.ts`) **each time the form is re-uploaded**. If Step 5 re-pins, the new row's converted `sectionShowWhen` / `calculations` could drift (calc name, expression variant, section-id rename) → `withCalculatedFields` computes nothing and the two-pass loop silently returns. If you do NOT re-pin, `019f48c2` is unchanged — but 13-29 is a fresh code deploy, so it still earns one run against that existing pin. Either way, verify against the row that will actually serve blast traffic.
- **The unit + jsdom tests use a *synthetic* form and set `dob` by hand.** In production `dob` is a **wizard-prefilled, hidden** field (`date_of_birth`/`dob`/`birth_date` ← Step-1 `dateOfBirth`), so `age` becomes computable via Step 4's **stamp-on-mount effect**, not a user answer — a real-stack timing path the tests don't exercise. The manual run is the only thing that covers prefill-stamp → calc → cross-section skip end-to-end in a real browser with real autosave.
- **This is the exact `ship-a-fix-that-never-fires` class** ([pattern](../../.claude/projects/C--Users-DELL-Desktop-oslrs/memory/pattern-ship-a-fix-that-never-fires.md); 13-21/13-23/13-27). A UI fix can't be verified with a prod SQL probe — the browser IS the probe. It rides the paid-conversion path, so a regression here burns ad spend on abandonment.

**Procedure (≈10 min — improved, covers both branches + the boundary):**
1. On the form pinned at blast time (**if** Step 5 re-pinned, do this **after** that re-pin), on the live site, start a **fresh** public registration (incognito). Use a **sentinel NIN** (reuse the dry-run pattern — e.g. `70000000014`, next in the `7000000001x` test series) so the row is trivially deletable and never counts in cohort numbers.
2. **Adult branch (age ≥ 15):** enter a Step-1 DOB for an adult. Proceed straight through the survey. **PASS** = the occupation questions (`main_occupation` / `employment_type` / `years_experience`) appear **inline in the one forward pass**, and the summary shows **Submit enabled on first arrival** (no bounce message). Screenshot the summary.
3. **Boundary (exactly-15):** repeat with DOB = today − 15 years (highest risk for the `int()` truncation in `age`). Expect the **adult** behaviour (occupation asked, one pass).
4. **Under-15 branch (age < 15, AC4):** repeat with a child DOB. **PASS** = occupation section is **correctly skipped** (guardian path per 9-55), summary reached with **no phantom "required unanswered"** and Submit reflects only the real guardian-consent state.
5. **Clean up:** delete the sentinel rows so they don't pollute counts —
   `ssh root@100.93.100.28` → `docker exec oslsr-postgres psql -U oslsr_user -d oslsr_db` → delete the respondent/submission/user rows for the sentinel NIN(s) (mirror the 70000000012/70000000013 cleanup already done in prior dry-runs).
6. **Tick the gate** here + in the operator-residuals tracker (§D) with the date + the "Submit enabled on first arrival" screenshot as evidence.

**Durable follow-ups (make this not a manual residual next time — post-launch):**
- **Bounce telemetry (cheap, high-value):** emit an analytics counter on the `Step5ReviewAndSave` incomplete-survey path (the "go back and fill survey" branch). If 13-29 holds, it stays ~0 on real traffic; a spike is an instant regression signal on the 9-19 wizard funnel — converts this one-shot manual gate into a continuous prod guard.
- **e2e automation:** promote the adult/under-15/boundary one-pass into a Playwright run against a seeded realistic form (harness exists — `docs/runbooks/e2e-wizard-resume-harness.md`) so it becomes a pre-deploy CI gate, not a human checklist item.

### Step 6 — (pre-blast) 9-63 notification meter live
- Once `9-63` Tasks 2–4 ship (in progress), confirm the **email meter + budget guard** see the high-volume paths and the **volume/abuse Telegram alert** is armed — so the blasts are observable and can't silently re-exhaust the quota. *This is the direct lesson of the incident that spawned 9-63 — don't fire blind.*

### Step 7 — Refresh cohort numbers + the must-fix
- Re-run the cohort SQL (numbers drift): **Cohort A** (~46 email + 9 SMS) · **Cohort B** (~268 drafts).
- **MUST-FIX before Cohort B:** exclude `data_lost` registrants (the ~16 double-contact overlap) — see the campaign runbook.

### Step 8 — Fire the blasts (DRY-RUN first, ALWAYS)
- **Always dry-run** each script (masked recipients) before `--confirm-i-am-not-dry-running`.
- `9-28` Cohort A (recovery) + `9-27` Cohort B (re-engagement). **Space them**; watch the 9-63 meter + the Resend dashboard live.

### Step 9 — Field + social
- Enumerators → field; marketing/social push — only after a blasted user who logs in meets the coherent journey (verified).

---

## Abort / rollback
- The blast scripts are **dry-run-by-default + idempotent** — if anything looks off, stop and inspect the 9-63 meter before re-confirming.
- Quota spike protection: the 9-63 budget guard auto-pauses at 95%; the abuse alert pages Telegram.

## Quick verification commands (operator, via tailscale)
- Prod health: `curl -s https://oyoskills.com/api/v1/health`
- NODE_ENV/CSP effective: `curl -sI http://127.0.0.1:3000/api/v1/health | grep -i content-security-policy` (present = enforced = prod)
- Resend usage (post-9-63): the ops dashboard notification-usage section + the Telegram daily digest.

_The live prod domain is **oyoskills.com** — `oyotradeministry.com.ng` is de-pointed (F-024)._
