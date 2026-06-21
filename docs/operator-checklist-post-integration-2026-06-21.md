# Operator Checklist — post journey + security-r2 integration (2026-06-21)

These are the **operator-only** gates left after the journey + 9-62 + security-r2
integration deployed (prod @ `e403fb5`). They can't be closed by an agent — they
need a human on a browser / the VPS. None are launch-blocking on their own, but
they finish the verification loop.

---

## 1. 🟡 9-60 — post-login white-screen efficacy (M1)
**Why open:** the realtime/ErrorBoundary hotfix is deployed + unit-verified, but
the *specific* white-screen-on-login symptom was only ever reproduced locally; the
route-scoped boundary only self-heals if the throw originates **inside `<Routes>`**.
**Do:**
- [ ] Log into prod (`https://oyotradeministry.com.ng`) as a public user AND as staff; confirm the dashboard renders on first paint (no white screen, no hard-refresh needed).
- [ ] If a white screen still appears: open DevTools → Console, **capture the stack** (tells us if the throw is inside `<Routes>` (fixed) or in `AuthProvider`/boot (needs the outer boundary)).
- [ ] Leave a dashboard tab open ~10 min; confirm the socket settles to polling (no runaway reconnect / tab freeze).
- [ ] Then flip 9-60 `review → done` in `sprint-status.yaml`.

## 2. 🟡 9-61 — manual `/registration/manage` end-to-end (HANDOFF Must-read #1)
**Why open:** the authed-edit write paths are CI-verified (real-DB integration) but
never exercised against the running prod app.
**Do (on prod, as a public user with an existing registration):**
- [ ] `/registration/manage` → edit an active registration → save → confirm the change persists + a fresh **audit row** + (for a re-submit) a **`submissions`** row.
- [ ] Complete a **pending NIN** in-session → confirm it transitions to provided + audited.
- [ ] Confirm **9-39 wrong-door recovery** still works (a logged-in user hitting `/register` is redirected off it).
- [ ] L1/L2 spot-check (just shipped): dashboard status reads "Active"/"Pending NIN" (not the raw slug); the draft card shows "Step X **of N**".

## 3. 🟡 F-026 — prod runtime hygiene (the operator half; code half done in 9-45)
**Why open:** `NODE_ENV=production` is **effective** on prod (verified — enforced CSP)
and now also in `/root/oslrs/.env`, but prod still runs `npx tsx src/index.ts`, not
`node dist`. F-005's fail-closed boot is satisfied; this is hygiene/perf.
**Do (on the VPS, low priority):**
- [ ] Confirm `NODE_ENV=production` is durably in the PM2 env / `.env` (survives a restart): `pm2 restart oslsr-api && curl -sI http://127.0.0.1:3000/api/v1/health | grep -i content-security-policy` (enforced CSP present = good).
- [ ] (Optional perf) move from `tsx` to a built `node dist` start command.
- [ ] **F-006 host cleanup:** delete any `/root/oslrs/.env.bak*` files (host-side secret backups; repo history is already clean).

## 4. ⚪ Non-gating, tracked elsewhere (FYI, not on this checklist's critical path)
- Re-engagement blasts (Cohort A/B) — `docs/runbooks/re-engagement-campaign-launch.md` (operator-fired; separate from this integration).
- Public wizard form re-pin discipline — `[[project_public_wizard_form_update]]` (only if the form changes).
- 9-40 L3 — `me.service` real-DB test is CI-only (already confirmed green this integration).

---
_Generated 2026-06-21 after the journey + security-r2 integration. Source of truth for status: `_bmad-output/implementation-artifacts/sprint-status.yaml` + `docs/security/findings-register.md`._
