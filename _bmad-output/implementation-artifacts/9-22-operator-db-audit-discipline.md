# Story 9.22: Operator DB-write audit discipline — helper functions that wrap operator-initiated DB writes with audit_log emission

Status: ready-for-dev

<!--
Authored 2026-05-19 by Bob (SM) via canonical *create-story --yolo template.

Promoted from `prep-operator-db-audit-discipline` candidate prep-task to
a numbered Story per Awwal's 2026-05-19 directive.

Real-data justification: on 2026-05-13 the operator ran a direct
`UPDATE users SET mfa_enabled=false, mfa_secret=NULL WHERE email=
'awwallawal@gmail.com'` via SSH + pg to unblock his own login (the
MFA route was broken; bug fixed in c28e8cb). The UPDATE succeeded
correctly BUT no `audit_logs` row was created — Story 6-1's hash-chain
audit ledger has zero trace of when MFA was disabled, by whom, or why.
For a security-sensitive action affecting a super_admin account, this
is a forensic blind spot.

This story closes the gap by providing wrapper helpers that operators
SHOULD use for any direct DB write that affects security posture,
user account state, or system configuration outside the normal request
path. Pattern documented as `feedback_operator_db_audit_discipline.md`
memory entry (this story operationalizes it).
-->

## Story

As the **operator forced to make direct DB writes during incident response or recovery actions**,
I want **a small library of wrapper helpers in `apps/api/scripts/lib/operator-audit.ts` that perform a DB write AND emit a properly-chained `audit_logs` entry in the same transaction**,
So that **operator-initiated changes are forensically visible alongside controller-path changes — preventing the "what happened to MFA on 2026-05-13" blind spot from recurring on any future incident-response action**.

## Acceptance Criteria

1. **AC#1 — New helper module**: `apps/api/scripts/lib/operator-audit.ts`. Exports an `operatorUpdate(pool, options)` async function that wraps `db.transaction()` with:
   - The actual SQL UPDATE/DELETE/INSERT
   - A companion `audit_logs` row insertion using the existing `AuditService` hash-chain logic
   - All in a single transaction; either both succeed or both roll back

2. **AC#2 — Audit row shape**: each operator-initiated audit row has:
   - `action`: a prefixed string like `OPERATOR_MFA_DISABLE`, `OPERATOR_USER_DEACTIVATE`, `OPERATOR_QUESTIONNAIRE_PURGE`, etc. New action prefix `OPERATOR_*` distinguishes operator actions from controller actions.
   - `actor_user_id`: nullable; resolved from the helper's `actorEmail` argument by looking up `users.id` — or `NULL` with `actor_email` stuffed into `details` JSONB if no matching user.
   - `target_user_id` / `target_resource_id`: as appropriate per affected entity.
   - `details`: JSONB with `{reason: string, incident_id?: string, ssh_session_started?: timestamp}` — the operator passes a reason at call time.
   - `chain_hash`: computed via existing `AuditService.computeChainHash()` so the operator row participates in the same hash chain as controller rows.

3. **AC#3 — New `AUDIT_ACTIONS.OPERATOR_*` enum values** in `apps/api/src/services/audit.service.ts`. Initial set:
   - `OPERATOR_MFA_DISABLE`
   - `OPERATOR_MFA_FORCE_ENROLL`
   - `OPERATOR_USER_DEACTIVATE`
   - `OPERATOR_USER_REACTIVATE`
   - `OPERATOR_USER_PASSWORD_RESET`
   - `OPERATOR_QUESTIONNAIRE_DELETE`
   - `OPERATOR_SETTINGS_FLIP`
   - `OPERATOR_GENERIC_DB_WRITE` (catch-all for one-off scripts)

4. **AC#4 — Retrofit the 2026-05-13 MFA-disable action**: author a one-shot script `apps/api/scripts/_backfill-mfa-disable-audit.ts` that inserts a backfilled `OPERATOR_MFA_DISABLE` audit row for the 2026-05-13 incident — captures the historical event in the chain so the ledger is complete. Backfill row's `details` field references `feedback_route_registration_test_discipline.md` + commit `c28e8cb` as the incident context.

5. **AC#5 — Refactor `dev-pin-public-form.ts` to use the helper**: the existing operator script at `apps/api/scripts/dev-pin-public-form.ts` currently writes to `system_settings` directly without audit. Refactor it to call `operatorUpdate()` so pin/unpin actions emit `OPERATOR_SETTINGS_FLIP` audit rows. Demonstrates the helper's idiomatic use.
   > **[SUPERSEDED 2026-06-10 by Story 9-17 AC#A7 — SM to confirm re-scope]** `dev-pin-public-form.ts` was deleted when 9-17 shipped the Pin-for-Public-Wizard UI on the Questionnaire Management page. Pin/unpin now flows through the audit-logged `PATCH /admin/settings/wizard.public_form_id` route (`SettingsService` → `SETTINGS_FLIPPED`), so an operator-script audit demo for *pinning* is moot. Re-point this demonstration to another surviving operator DB-write script, or drop AC#5 entirely (AC#4's `_backfill-mfa-disable-audit.ts` already exercises `operatorUpdate()`). The helper module + enums + backfill + tests (AC#1–4, #6–8) are unaffected.

6. **AC#6 — Documentation in script header convention**: every script in `apps/api/scripts/` that writes to the DB MUST have a header comment block declaring:
   - The expected operator (super_admin only; or specific named operator)
   - The `AUDIT_ACTIONS.OPERATOR_*` value emitted
   - Reversal procedure
   - When to use vs the controller path
   New ESLint rule (or commit-hook regex) enforces this — out of scope for AC; flag as follow-up.

7. **AC#7 — Tests**: `apps/api/src/scripts/__tests__/operator-audit.test.ts` covering:
   - Successful UPDATE + audit row inserted in the same transaction
   - SQL error rolls back BOTH the UPDATE AND the audit row (no half-state)
   - Audit row's `chain_hash` is valid (links to prior chain head correctly)
   - `actor_user_id` resolution: matched email → user_id; unmatched email → NULL + email-in-details
   - 7-10 tests total

8. **AC#8 — Zero regression**: existing audit_logs writes via controllers (Story 6-1) continue to work. Hash chain integrity preserved across the new `OPERATOR_*` actions.

## Tasks / Subtasks

- [ ] **Task 1 — Helper library** (AC: #1, #2)
  - [ ] 1.1: Author `apps/api/scripts/lib/operator-audit.ts` exporting `operatorUpdate()`
  - [ ] 1.2: Wire up the transaction boundary using existing pg pool patterns
  - [ ] 1.3: Reuse `AuditService.computeChainHash()` for hash chaining
- [ ] **Task 2 — New audit-action enums** (AC: #3)
  - [ ] 2.1: Extend `AUDIT_ACTIONS` constant in `apps/api/src/services/audit.service.ts`
  - [ ] 2.2: Update the audit-action count badge in MEMORY.md (currently `count stays 40`)
- [ ] **Task 3 — Backfill the 2026-05-13 historical event** (AC: #4)
  - [ ] 3.1: Author `_backfill-mfa-disable-audit.ts` (one-shot, deletable after run)
  - [ ] 3.2: Run on prod via SSH
  - [ ] 3.3: Verify chain integrity post-backfill via `pnpm --filter @oslsr/api tsx scripts/verify-audit-chain.ts` (or similar existing chain-validator)
- [ ] **Task 4 — Refactor `dev-pin-public-form.ts`** (AC: #5) — **[SUPERSEDED 2026-06-10: script deleted by Story 9-17 AC#A7; see AC#5 note — re-point demo or drop]**
- [ ] **Task 5 — Tests** (AC: #7)
- [ ] **Task 6 — Pre-merge BMAD code review on uncommitted tree** (per `feedback_review_before_commit.md`)

## Dev Notes

### Strategic framing

Operator-side DB writes are an EXISTING practice in this project (the `apps/api/scripts/` directory has dozens of them). What's MISSING is the audit-trail discipline applied consistently. This story doesn't ban direct DB writes — it provides the helper that makes auditable writes easy enough to be the default.

The 2026-05-13 incident is the canonical example: the operator did the RIGHT operational thing (disabled MFA so login could succeed) but the AUDIT TRAIL has no record. Six months from now, a security audit could ask "when was MFA last disabled?" and the answer would be "we don't know — there's nothing in the audit_logs." Unacceptable for a NDPA-compliant platform.

### Backward-fill rationale

AC#4 inserts a backfilled row for the 2026-05-13 incident. Some auditors would object to backfilling — "you can't write history retroactively." Counterargument: a hash-chain ledger that knowingly omits a security-relevant event is worse than one that records it with a clear `backfilled_at: 2026-MM-DD` provenance field. The backfill row's `details` JSONB explicitly marks it as backfilled and cites the incident document.

### Dependencies

- **Story 6-1** — audit hash chain. Helper plugs into existing `AuditService.computeChainHash()`.
- **Story 9-13** — MFA-disable action that triggered the gap.
- **Story 9-15** — could be extended to dispatch Telegram alerts on `OPERATOR_*` audit rows. Out of scope here; flag as follow-up.

### Risks

1. **Helper used in CI/CD scripts** — if `db:push:full` (CI deploy) writes via this helper, every deploy emits audit rows. Mitigation: helper is for INCIDENT/RECOVERY paths only; the seed runners + migration runners stay on their own paths. Header comment convention (AC#6) clarifies.
2. **Hash chain corruption from concurrent operator + controller writes** — unlikely in practice (operators run scripts manually; controllers run on request); but the helper takes a `FOR UPDATE` lock on the chain-head row to serialize. Documented in helper module-doc.
3. **Backfill row hash-chain placement** — the backfilled 2026-05-13 row goes at the chain's CURRENT head, not retro-inserted at the original event time. This is the correct behavior for hash chains; the row's `details.original_event_time: '2026-05-13...'` field preserves the actual incident time.

### Effort estimate

~half-day to full day. Mostly mechanical: helper module + enums + backfill script + test + one refactor demonstration.

## File List

(Populated by dev agent. Expected:)
- `apps/api/scripts/lib/operator-audit.ts` (new)
- `apps/api/src/services/audit.service.ts` (modified — new `OPERATOR_*` enums)
- `apps/api/scripts/_backfill-mfa-disable-audit.ts` (new, one-shot)
- ~~`apps/api/scripts/dev-pin-public-form.ts` (modified — uses helper)~~ **[SUPERSEDED 2026-06-10: deleted by Story 9-17 AC#A7 — re-point AC#5 demo to a surviving operator script or drop]**
- `apps/api/src/scripts/__tests__/operator-audit.test.ts` (new)
- `MEMORY.md` (audit-action count badge updated)
