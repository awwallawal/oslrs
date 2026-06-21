# Operator Checklist — post journey + security-r2 integration (2026-06-21)

These are the **operator-only** gates left after the journey + 9-62 + security-r2
integration deployed (prod @ `e403fb5`). They can't be closed by an agent — they
need a human on a browser / the VPS. None are launch-blocking on their own, but
they finish the verification loop.

---

> **Live prod domain is `https://oyoskills.com`** (verified 200/healthy). `oyotradeministry.com.ng` is **dropped/de-pointed** (F-024 retirement) — do NOT use it.

## 1. ✅ 9-60 — post-login white-screen (M1) — CONFIRMED DONE 2026-06-21
Operator confirmed locally that the freeze/white-screen is resolved. Story + sprint-status
flipped `review → done`. The socket-storm cap + route-scoped ErrorBoundary are live on prod
(`oyoskills.com`). No further action.

## 2. 🟡 9-61 — manual `/registration/manage` end-to-end (HANDOFF Must-read #1)
**Why open:** the authed-edit write paths are CI-verified (real-DB integration) but
never exercised against the running prod app.
**Do (on prod, as a public user with an existing registration):**
- [ ] `/registration/manage` → edit an active registration → save → confirm the change persists + a fresh **audit row** + (for a re-submit) a **`submissions`** row.
- [ ] Complete a **pending NIN** in-session → confirm it transitions to provided + audited.
- [ ] Confirm **9-39 wrong-door recovery** still works (a logged-in user hitting `/register` is redirected off it).
- [ ] L1/L2 spot-check (just shipped): dashboard status reads "Active"/"Pending NIN" (not the raw slug); the draft card shows "Step X **of N**".

## 3. 🟢 F-026 — prod runtime hygiene (mostly DONE 2026-06-21; one optional item)
**Done 2026-06-21 (agent, via tailscale `oslsr-home-app`):**
- [x] **`NODE_ENV=production` normalized** to a clean `^NODE_ENV=production` line in `/root/oslrs/.env` (was ` NODE_ENV=` with a leading space; pm2 does NOT inject it, so `.env` is the single source). Restarted `oslsr-api` → booted clean (health ok, enforced CSP=1, DB up) → F-005 satisfied, no longer wrapper-fragile. Verified via diff (only the leading space changed).
- [x] **F-006:** deleted the 2 stale `/root/oslrs/.env.bak*` files (Apr-26 pre-migration secret backups; nothing sourced them, deploy doesn't recreate them). 0 remain.
- [ ] **(Optional perf, low priority):** move from `npx tsx src/index.ts` to a built `node dist` start command. Not security/hygiene — defer freely.

## 4. ⚪ Non-gating, tracked elsewhere (FYI, not on this checklist's critical path)
- Re-engagement blasts (Cohort A/B) — `docs/runbooks/re-engagement-campaign-launch.md` (operator-fired; separate from this integration).
- Public wizard form re-pin discipline — `[[project_public_wizard_form_update]]` (only if the form changes).
- 9-40 L3 — `me.service` real-DB test is CI-only (already confirmed green this integration).

---
_Generated 2026-06-21 after the journey + security-r2 integration. Source of truth for status: `_bmad-output/implementation-artifacts/sprint-status.yaml` + `docs/security/findings-register.md`._
