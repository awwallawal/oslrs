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

## 3. 🟡 F-026 — prod runtime hygiene (the operator half; code half done in 9-45)
**Verified 2026-06-21 (via tailscale `oslsr-home-app`):** `NODE_ENV=production` is **effective
at runtime** (enforced CSP confirmed) → F-005 fail-closed boot is satisfied. BUT three hygiene
gaps remain: it is **not a clean `^NODE_ENV=` line** in `/root/oslrs/.env` (effective via dotenv
odd-format / pm2 wrapper — fragile across edits); the box still runs **`npx tsx src/index.ts`**
(not `node dist`); and **2 `.env.bak` files** sit in `/root/oslrs/` (F-006).
**Do (on the VPS, low priority):**
- [ ] Make `NODE_ENV=production` a clean committed line in the PM2 env / `.env`; verify it survives `pm2 restart oslsr-api && curl -sI http://127.0.0.1:3000/api/v1/health | grep -i content-security-policy` (enforced CSP = good).
- [ ] (Optional perf) move from `tsx` to a built `node dist` start command.
- [ ] **F-006 host cleanup:** delete the 2 `/root/oslrs/.env.bak*` files (host-side secret backups; repo history is already clean). _(Agent can do this on request.)_

## 4. ⚪ Non-gating, tracked elsewhere (FYI, not on this checklist's critical path)
- Re-engagement blasts (Cohort A/B) — `docs/runbooks/re-engagement-campaign-launch.md` (operator-fired; separate from this integration).
- Public wizard form re-pin discipline — `[[project_public_wizard_form_update]]` (only if the form changes).
- 9-40 L3 — `me.service` real-DB test is CI-only (already confirmed green this integration).

---
_Generated 2026-06-21 after the journey + security-r2 integration. Source of truth for status: `_bmad-output/implementation-artifacts/sprint-status.yaml` + `docs/security/findings-register.md`._
