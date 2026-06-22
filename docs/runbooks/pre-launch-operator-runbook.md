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

### Step 5 — Master-form re-pin (MANDATORY discipline)
- If the survey form changed: re-upload **mints a NEW form row** → you MUST **re-pin `wizard.public_form_id`** (publish → re-pin). Old versions are not auto-retired.
- Verify the wizard renders the intended form (calc + group-relevance live).

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
