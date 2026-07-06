# Story 13-17: Wire the step-up re-auth UX for privileged UI actions (pin + the whole class)

Status: done

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
- [x] **Task 1 (AC1, AC2)** — add the `AUTH_REAUTH_REQUIRED` response interceptor in `api-client.ts` (mirror the 9-49 refresh queue): detect the code → open the re-auth modal via the re-auth context → on success replay the queued request → on cancel reject. One place fixes the whole class.
- [x] **Task 2 (AC3)** — QM pin: drop the generic `onError` swallow (QuestionnaireList.tsx:146-149) so the interceptor handles reauth; keep a genuine error message for non-reauth failures. Verify pin/unpin E2E on a Remember-Me session. *(Live prod E2E on a Remember-Me session = operator step post-deploy — the planned audited re-pin.)*
- [x] **Task 3 (AC5)** — grep-audit privileged/sensitive-action callers; fix any other generic swallow; list them. *(6 surfaces audited — see Completion Notes; SmsOtpToggle fixed, staff hooks pass-through OK, MFA separate-path by design.)*
- [x] **Task 4 (AC4, AC6)** — tests (interceptor + pin) + full web suite; `tsc`/eslint clean.
- [x] **Task 5 (Operator-traceability)** — see below: emit a retroactive audit row for the 2026-07-05 manual DB pin OR document it in the ops log; note the mechanism so a future manual setting-write is traceable. *(Script shipped + runbook rule; prod `--apply` run = operator residual.)*

### Review Follow-ups (AI) — adversarial code-review 2026-07-06
- [x] [AI-Review][Medium] M1 — settle the re-auth gate when the session dies with the modal open: `resolveReAuth(false)` added to `performLogout`, the scheduled-token-refresh failure path, and the gate-listener effect cleanup (previously a pending privileged request would hang `isPending` forever). [apps/web/src/features/auth/context/AuthContext.tsx]
- [x] [AI-Review][Medium] M2 — the AC5 SmsOtpToggle fix shipped untested: new `SmsOtpToggle.test.tsx` pins the honest reauth-cancel toast, the generic-failure toast, and the optimistic rollback (3 tests). [apps/web/src/features/settings/components/__tests__/SmsOtpToggle.test.tsx]
- [x] [AI-Review][Medium] M3 — the modal displayed the server's raw route path ("continue with /api/v1/admin/settings/…"): interceptor now passes 'this action' when `details.action` is a path; api-client + integration tests updated. [apps/web/src/lib/api-client.ts:76-81]
- [x] [AI-Review][Low] L1 — duplicate `drizzle-orm` import merged. [apps/api/scripts/_retro-audit-2026-07-05-manual-pin.ts:29]
- [ ] [AI-Review][Low] L2 — commit discipline (operator step at commit time): tree carries an unrelated `.gitignore` hunk (`_bmad-output/slide-presentation/`) + ~40 baseline-report files — SELECTIVE add of this File List only (13-16 M2 rule); commit the `.gitignore` hunk separately or leave it.
- [ ] [AI-Review][Low] L3 — follow-up story (server, out of 13-17 scope by design): the `SENSITIVE_ACTIONS` profile/password patterns (`/users/:id/profile` etc., sensitive-action.ts:20-24) match a path shape the web app never calls (web uses `/users/profile`) — profile/password changes are effectively NOT step-up-gated server-side today. Raise with PM/SM as a security-hygiene story.

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

### Implementation Plan (2026-07-06, Claude Fable 5)
- **Gate module (`reauth-gate.ts`)** — the 9-49 pattern split: `api-client.ts` is framework-free, the modal is React, so a module-level single-flight gate bridges them (exactly like `auth-token-holder.ts` bridges token state). `requestReAuth(action)` (api-client side) ↔ `setReAuthRequestListener` + `resolveReAuth(ok)` (AuthContext side). Single-flight: N concurrent 403s share ONE modal; fail-closed when no host is registered.
- **Interceptor** — `apiClient` delegates to an internal `request(endpoint, options, allowReAuthRetry)`; on `403` + code `AUTH_REAUTH_REQUIRED` (and ONLY that code — PM guardrail) it awaits the gate, then replays the original request exactly once (`allowReAuthRetry=false` on the replay, so a second reauth-403 rejects instead of looping). Cancel rejects with an honest specific message. `auth.api`/`mfa.api` use their own fetch, so no recursion into the interceptor from `/auth/reauth` itself.
- **Host wiring** — AuthContext registers the gate listener (dispatches the previously-never-dispatched `REQUIRE_REAUTH`); `reAuthenticate()` success → `resolveReAuth(true)`; new `cancelReAuth()` → `REAUTH_COMPLETE` + `resolveReAuth(false)`. `useReAuth.close/reset` now call `cancelReAuth` — this also fixes a latent bug where a context-opened modal could never clear the context flag (nothing dispatched `REAUTH_COMPLETE` on cancel).
- **Server untouched** per Dev Notes.

### Completion Notes
- **Task 1 (AC1+AC2) ✅** — `reauth-gate.ts` + interceptor + AuthContext/useReAuth wiring. 6 gate unit tests + 6 interceptor tests (replay-preserves-method/body, cancel-rejects-honest, single-shot guardrail, plain-403-does-NOT-prompt guardrail, fail-closed, concurrent-share-one-prompt) + 3 gate↔context↔modal integration tests (success resolves true + modal closes; cancel resolves false; wrong-password keeps modal open then succeeds).
- **Task 2 (AC3) ✅** — QuestionnaireList pin `onError` no longer swallows: `AUTH_REAUTH_REQUIRED` gets an honest mode-aware message (pin vs un-pin); generic anti-enumeration toast retained for real failures (now also mode-aware). 2 new component tests (11, 12). Live-repro E2E on prod Remember-Me session = operator verification after deploy (AC3 residual).
- **Task 3 (AC5 class audit) ✅** — enumerated every frontend caller of a `privileged_action`/`SENSITIVE_ACTIONS` route:
  1. `QuestionnaireList` pin/unpin (PATCH `/admin/settings/:key`) — **fixed** (Task 2).
  2. `SmsOtpToggle` (PATCH `/admin/settings/:key`) — **fixed**: reauth-cancel now gets an honest toast instead of "Failed to update".
  3. Staff `useUpdateRole`/`useDeactivateStaff`/`useReactivateStaff` (privileged staff routes, via `apiClient`) — **no change needed**: fallback branch surfaces `err.message`, which is the interceptor's honest cancel message (no masking; interceptor supplies the modal).
  4. MFA enroll/disable/regenerate (`mfa.api.ts` own `mfaFetch`, NOT `apiClient`) — **deliberately out of interceptor scope**: MfaEnrollmentPage already handles `AUTH_REAUTH_REQUIRED` inline with its own reauth sub-step + retry (9-13 design); disable/regenerate have no UI callers yet.
  5. `POST /admin/email-queue/drain` (privileged) — no frontend caller (ops-only).
  6. `SENSITIVE_ACTIONS` list routes (profile `/users/:id/profile`, change-password, bank-details, payment-disputes, security, sessions) — no current frontend caller matches those path patterns (web profile PATCH is `/users/profile`, which the `:id` pattern does not match).
- **Task 5 (operator-traceability, PM option a) ✅ dev-side** — `apps/api/scripts/_retro-audit-2026-07-05-manual-pin.ts`: emits the missing `settings.flipped` row **through `AuditService.logActionTx`** (hash chain preserved — never raw-INSERT), actor resolved+role-verified by `--actor-email`/`--actor-id`, `new_value` read from the live setting, idempotent via `details.retroactive_of`, dry-run default/`--apply` to write, bare-flag guard (13-16 M1 lesson). Dry-run verified locally (actor resolution + setting read + guards exit 1 correctly). **Operator residual: run with `--apply` on prod via Tailscale.** General rule added to `pre-launch-operator-runbook.md` Step 5.
- Updated 8 test files' `useAuth` mocks with the new `cancelReAuth` member.
- **AC6 e2e decision** — no new Playwright spec: a reauth pin e2e needs a *published-form fixture* the e2e dev-DB setup doesn't provide, and the wiring it would cover is already exercised by the 3 React-integration tests (real gate + real AuthContext + real ReAuthModal) plus the 6 interceptor tests. The authoritative end-to-end check is the operator's audited prod re-pin on a Remember-Me session (AC3 residual, part of the launch plan anyway). Server-side note: only `POST /auth/reauth` ever sets the `reauth:<userId>` Redis key (login does NOT), so `requireFreshReAuth` routes 403 on ANY session without a recent re-auth — the class fix matters beyond Remember-Me.

### File List
- apps/web/src/lib/reauth-gate.ts (new)
- apps/web/src/lib/api-client.ts
- apps/web/src/features/auth/context/AuthContext.tsx
- apps/web/src/features/auth/hooks/useReAuth.ts
- apps/web/src/features/questionnaires/components/QuestionnaireList.tsx
- apps/web/src/features/settings/components/SmsOtpToggle.tsx
- apps/web/src/lib/__tests__/reauth-gate.test.ts (new)
- apps/web/src/lib/__tests__/api-client.test.ts
- apps/web/src/features/auth/context/__tests__/reauth-flow.integration.test.tsx (new)
- apps/web/src/features/questionnaires/components/__tests__/QuestionnaireList.test.tsx
- apps/web/src/__tests__/route-resolution.integration.test.tsx (mock update)
- apps/web/src/features/dashboard/__tests__/rbac-routes.test.tsx (mock update)
- apps/web/src/features/dashboard/__tests__/DashboardRedirect.test.tsx (mock update)
- apps/web/src/layouts/__tests__/DashboardLayout.test.tsx (mock update)
- apps/web/src/layouts/components/SmartCta.test.tsx (mock update)
- apps/web/src/layouts/components/MobileNav.test.tsx (mock update)
- apps/web/src/features/dashboard/pages/__tests__/AssessorOfficialRbac.test.tsx (mock update)
- apps/web/src/features/dashboard/pages/__tests__/PublicUserRbac.test.tsx (mock update)
- apps/api/scripts/_retro-audit-2026-07-05-manual-pin.ts (new)
- docs/runbooks/pre-launch-operator-runbook.md
- apps/web/src/features/settings/components/__tests__/SmsOtpToggle.test.tsx (new — review follow-up M2)

## Senior Developer Review (AI) — 2026-07-06

**Outcome: APPROVED after fixes — 0 High / 3 Medium / 3 Low; all Mediums + L1 fixed in-session, L2/L3 recorded as open follow-ups.**

- Every File-List file read; git tree matched the File List exactly (no undocumented story changes; the unrelated `.gitignore` hunk is flagged in L2).
- All 6 ACs verified IMPLEMENTED (AC3 live-prod E2E and the script's prod `--apply` are the PM-sanctioned operator residuals). All 5 tasks verified genuinely done — no false [x].
- AC5 class-audit claims independently re-verified: `withReAuth` has zero callers (no double-handling); `useUpdateSetting` rides `apiClient` (both fixed surfaces interceptor-covered); MFA is inline-by-design on its own `mfaFetch`; web profile PATCH `/users/profile` genuinely doesn't match the server's `/users/:id/profile` pattern — which also means that server guard is dead for profile/password today → L3 follow-up.
- Retro-audit script deps verified against reality: `AUDIT_ACTIONS.SETTINGS_FLIPPED`, `getSettingRow`, nullable `targetId`, `ip_address` is `text` (not `inet` — the `--apply` write won't type-fail), `targetResource: 'system_settings'` matches the canonical value in settings.service.
- PM guardrails held under test: single-shot replay (one prompt per originating request), only `AUTH_REAUTH_REQUIRED` triggers the flow, honest non-reauth errors retained.
- Fixes applied: **M1** gate settled on logout/refresh-failure/unmount (was: hung `isPending` forever if the session died with the modal open); **M2** SmsOtpToggle reauth branch now tested (3 tests); **M3** modal no longer shows a raw route path; **L1** import merge.
- Gates re-run by the reviewer post-fix: web tsc 0, eslint 0, full web suite **2744 passed** (2741 + 3 new; 2 todo).

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
| 2026-07-06 | dev-story implementation: `reauth-gate.ts` single-flight gate + api-client interceptor (single-shot replay, code-gated, fail-closed) + AuthContext host wiring (`REQUIRE_REAUTH` finally dispatched; new `cancelReAuth`) + useReAuth cancel path (also fixes the latent stuck-modal bug) + QM pin & SmsOtpToggle honest reauth toasts + AC5 6-surface class audit + retroactive-audit script (hash-chain-safe, dry-run verified) + runbook Step-5 manual-write rule. +11 unit/interceptor tests, +3 integration tests, +2 component tests; 8 useAuth mocks extended. api+web tsc 0, eslint 0. Operator residuals: prod `--apply` of the retro-audit script; live Remember-Me pin E2E (the planned audited re-pin). | Claude Fable 5 (dev-story) |
| 2026-07-06 | Adversarial code-review: APPROVED after fixes (0H/3M/3L). M1 re-auth gate now settled on logout/token-refresh-failure/unmount (hung-promise fix); M2 +3 SmsOtpToggle tests; M3 modal shows 'this action' instead of the raw route path; L1 import merge. L2 (selective-add commit discipline) + L3 (server SENSITIVE_ACTIONS profile patterns don't match real web routes — follow-up story) left open as action items. Reviewer re-ran gates independently: web tsc 0, eslint 0, full suite 2744 green. Status → done. | Claude Fable 5 (code-review) |
