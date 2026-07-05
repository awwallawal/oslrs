# Story 13-17: Wire the step-up re-auth UX for privileged UI actions (pin + the whole class)

Status: ready-for-dev

<!-- Authored 2026-07-05 by Bob (SM) via *create-story. EMERGENT from the 13-14 launch prep: pinning the Public Core as wizard.public_form_id failed with the generic toast "Couldn't pin the form. Please try again." Root cause = a FRONTEND bug: the pin is a step-up-re-auth-gated privileged action (server returns 403 AUTH_REAUTH_REQUIRED), but the pin mutation's onError is a generic catch that never triggers the ReAuthModal — and there is NO global interceptor to do it either. So on a "Remember Me" session the pin (and, by the same gap, other privileged actions) can NEVER succeed via the UI. Immediate unblock done via a direct DB pin (operator); this story fixes the UX properly. -->

## Story
As a **super-admin (or any staff on a "Remember Me" session) performing a privileged action in the UI** (pin the public form, change a password/profile/bank-detail/security setting),
I want **the step-up re-auth prompt to appear and, after I re-authenticate, my action to complete**,
so that **privileged actions are actually usable through the UI instead of failing with a generic "please try again" toast.**

## Context & Evidence (why this is a class bug, not just the pin)
- **Repro (prod, 2026-07-05):** super-admin → Questionnaire Management → publish a form → click **Pin** → toast `"Couldn't pin the form. Please try again."` Prod log: `sensitive-action-middleware … privileged_action.reauth_required … action:"/wizard.public_form_id" method:"PATCH"` — the server correctly demanded step-up re-auth; the UI never surfaced it.
- **Server side (correct, do NOT change):** the settings-write route applies the **`privileged_action`** re-auth guard (`apps/api/src/middleware/sensitive-action.ts` — logs `privileged_action.reauth_required` at :153, returns **403 `AUTH_REAUTH_REQUIRED`** when the `reauth:<userId>` Redis key is stale; `/api/v1/auth/reauth` bumps it, 5-min validity). A separate list-based `sensitive_action` guard covers the `SENSITIVE_ACTIONS` set (profile / password / bank-details / payment-disputes / security / sessions).
- **Client side (the bug):**
  - The pin mutation's error handler is a **generic catch** → `toast.error("Couldn't pin the form. Please try again.")` [Source: apps/web/src/features/questionnaires/components/QuestionnaireList.tsx:146-149]. It does NOT inspect for `AUTH_REAUTH_REQUIRED`.
  - `ReAuthModal` IS rendered globally [Source: apps/web/src/App.tsx:253] and `useReAuth` exposes `open(action)` + "auto-open from context" [Source: apps/web/src/features/auth/hooks/useReAuth.ts:11,91,104] — the infra exists.
  - But there is **NO global api-client interceptor** for `403 AUTH_REAUTH_REQUIRED` (grep of `apps/web/src/lib/api-client.ts` = none) — so nothing connects a re-auth-required response to the global modal. Each surface would have to wire it; the pin didn't.
- ⇒ **The gap is systemic:** any privileged/sensitive action whose frontend caller doesn't hand-wire re-auth silently fails on a Remember-Me session. The pin is the one we hit; profile/password/bank/security are the same shape.

## Acceptance Criteria
1. **AC1 — Global handling.** A `403` with code `AUTH_REAUTH_REQUIRED` from ANY endpoint opens the global `ReAuthModal` (via the existing `useReAuth`/re-auth context) instead of surfacing a generic error. Implement as a **response interceptor in `api-client.ts`**, mirroring the existing Story-9-49 refresh-queue pattern (queue the rejected request, resolve/reject after the re-auth outcome). [Source: apps/web/src/lib/api-client.ts (9-49 awaitAccessToken/queue)]
2. **AC2 — Retry after re-auth.** After a successful `POST /auth/reauth` in the modal, the **original request is retried automatically and succeeds** (the user does not have to re-trigger the action). On modal cancel/failed re-auth, the original promise rejects cleanly (no crash; a specific, honest message — not the generic "try again").
3. **AC3 — The reported repro works E2E.** On a super-admin **Remember-Me** session, Pin → re-auth prompt → password → **form pins** (toast `Pinned <title>`), and the pinned badge reflects it. Un-pin works the same way.
4. **AC4 — Audit preserved.** When the pin (and other privileged actions) complete via the now-working UI, their normal `audit_logs` emission still fires (the UI path is audited; the DB-workaround path used on 2026-07-05 was not — see Operator-traceability).
5. **AC5 — Class audit (no surface left swallowing it).** Enumerate every frontend caller of a `privileged_action`/`SENSITIVE_ACTIONS` route (pin/unpin, profile, password, bank-details, security, session-revoke) and confirm none has a local `onError` that masks `AUTH_REAUTH_REQUIRED` before the global interceptor sees it. Fix/soften any that do (remove the generic swallow; let the interceptor handle re-auth, keep a real error message for genuine failures). Record the audited surfaces in the File List.
6. **AC6 — Tests.** Interceptor unit test (`403 AUTH_REAUTH_REQUIRED` → modal opens → reauth → original request retried & resolves; cancel → rejects). QM pin component/integration test (reauth-required path → success after reauth). E2E if the harness allows a Remember-Me + reauth flow. Full web suite green.

## Tasks / Subtasks
- [ ] **Task 1 (AC1, AC2)** — add the `AUTH_REAUTH_REQUIRED` response interceptor in `api-client.ts` (mirror the 9-49 refresh queue): detect the code → open the re-auth modal via the re-auth context → on success replay the queued request → on cancel reject. One place fixes the whole class.
- [ ] **Task 2 (AC3)** — QM pin: drop the generic `onError` swallow (QuestionnaireList.tsx:146-149) so the interceptor handles reauth; keep a genuine error message for non-reauth failures. Verify pin/unpin E2E on a Remember-Me session.
- [ ] **Task 3 (AC5)** — grep-audit privileged/sensitive-action callers; fix any other generic swallow; list them.
- [ ] **Task 4 (AC4, AC6)** — tests (interceptor + pin) + full web suite; `tsc`/eslint clean.
- [ ] **Task 5 (Operator-traceability)** — see below: emit a retroactive audit row for the 2026-07-05 manual DB pin OR document it in the ops log; note the mechanism so a future manual setting-write is traceable.

## Dev Notes
- **Do NOT touch the server middleware** — it's behaving correctly (step-up re-auth on privileged actions is a deliberate security control). This is purely a client-UX wiring gap.
- **Prefer the global interceptor over per-mutation wiring** — it closes the entire class in one place and prevents the next privileged action from reintroducing the same bug. The 9-49 refresh-token queue in `api-client.ts` is the proven local pattern to mirror (await/queue/replay).
- **Beware double-handling:** if a surface keeps a local `onError` AND the global interceptor fires, the user could see both the modal and a stray toast. AC5's audit exists to remove those local swallows for the reauth code specifically.
- **`useReAuth` already auto-opens from context** (useReAuth.ts:91) — the interceptor likely just needs to set that context "required" flag (+ hold the retry) rather than call `open()` imperatively; confirm the exact trigger when wiring.

### Operator-traceability note (2026-07-05) — REQUESTED BY AWWAL
The Public Core pin on 2026-07-05 was set **directly on the prod DB** (`UPDATE system_settings SET value = to_jsonb('019f33a5-…') WHERE key='wizard.public_form_id'`) via Tailscale, because this very UI bug blocked the audited UI path. Consequence: **there is NO `audit_logs` row for that pin.** Task 5: either (a) emit a retroactive `SETTING_UPDATED`/pin audit row (actor = the super-admin `019c89ab-…`, target = `wizard.public_form_id`, note = "manual DB pin — UI reauth bug 13-17; e2e-verified getPublicActiveForm 200"), or (b) record it in the ops log/runbook. General rule to capture: **a direct prod-DB setting-write bypasses `audit_logs` — prefer the UI once 13-17 lands; when a manual write is unavoidable, log it deliberately.**

### References
- [Source: apps/web/src/features/questionnaires/components/QuestionnaireList.tsx:131-160] — the pin mutation + generic onError (the bug site).
- [Source: apps/web/src/lib/api-client.ts] — add the interceptor here; mirror the 9-49 refresh queue.
- [Source: apps/web/src/App.tsx:253] — global `<ReAuthModal />`. [Source: apps/web/src/features/auth/hooks/useReAuth.ts:11,91,104] — `open()` + auto-open-from-context.
- [Source: apps/api/src/middleware/sensitive-action.ts:95,153] — `sensitive_action` (list) vs `privileged_action` (route) reauth guards; both → 403 `AUTH_REAUTH_REQUIRED`.
- [Source: apps/api/src/middleware/require-fresh-reauth.ts:17-20] — 403 `AUTH_REAUTH_REQUIRED`; "the frontend … handles it" (the assumption this story makes true globally).
- Prod evidence: `privileged_action.reauth_required action:"/wizard.public_form_id"` in `oslsr-api` logs, 2026-07-05.

## Dev Agent Record
### File List

## PM Validation (John, 2026-07-05)

**Validated — approved, with three guardrails.**

1. **Class-fix scope is correct.** A per-mutation fix on just the pin would leave profile/password/bank/security one bad session away from the same silent failure. The global `api-client` interceptor closes the whole class in one place and stops the next privileged action from reintroducing it — the right call. Mirroring the 9-49 refresh-queue keeps it in a proven pattern.
2. **Guardrail — bound the retry (add to AC2/Task 1).** The reauth→retry loop MUST be single-shot: one re-auth attempt per originating request; if reauth is cancelled OR the retried request STILL returns `AUTH_REAUTH_REQUIRED`, reject cleanly — never re-open the modal in a loop. Also: only the `AUTH_REAUTH_REQUIRED` code triggers this path (a plain 403 authz denial must NOT open the reauth modal). Dev must pin both in tests.
3. **Guardrail — don't mask genuine failures.** Removing the local generic `onError` swallows (AC5) must keep an honest error for NON-reauth failures (e.g., the pinned form was deleted, a 500). "Couldn't pin" is fine as a fallback for real errors; it's only wrong as the response to `AUTH_REAUTH_REQUIRED`.

**Operator-traceability ruling:** prefer **option (a) — emit the retroactive audit row** for the 2026-07-05 manual pin. It's cheap and it keeps the "clean record" the launch is being held to (an unaudited prod-state change is exactly the kind of gap we don't want lingering into field activities). Fall back to (b) documentation only if emitting a well-formed audit row proves awkward.

**Priority:** **NOT launch-blocking** — the public path is already pinned and serving (verified `getPublicActiveForm` 200), so the campaign is not gated on this. But it's **high-priority pre-field-ops**: the operator can't cleanly re-pin / manage forms / change security settings through the UI until it lands, and Awwal's plan is to re-pin via the fixed UI (for the audit trail) before the dry-run. Sequence it right after, not before, the launch-critical items already done.

**No AC changes beyond folding guardrails 2 & 3 into AC2/AC5.** Story is dev-ready.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-05 | Story drafted via *create-story — global `AUTH_REAUTH_REQUIRED` interceptor so privileged UI actions (pin + the class) surface the re-auth modal + retry, instead of a generic toast. EMERGENT from the 13-14 pin failure; immediate unblock was a manual DB pin (operator). Includes the operator-traceability note. 6 ACs / 5 Tasks. sprint-status entry added. | Bob (SM) |
