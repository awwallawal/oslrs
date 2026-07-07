# Step-Up Re-Authentication (server policy)

> Story 13-18 (2026-07-06). Server half of the 13-17 client work. This is the
> canonical statement of WHEN the platform demands a fresh password re-entry
> and HOW the grace window behaves. The route inventory lives in code
> (`apps/api/src/middleware/sensitive-action.ts` → `SENSITIVE_ACTIONS`) and is
> pinned to the live Express router by
> `apps/api/src/__tests__/security.reauth-routes.test.ts` — change either side
> and the anti-drift test fails.

## The rule

1. **Sensitive mutations require a fresh re-auth marker.** A request to any
   inventoried route without a live `reauth:<userId>` Redis key gets
   `403 AUTH_REAUTH_REQUIRED`. The web app's global interceptor (13-17) shows
   the re-auth modal and replays the request once on success.
2. **The marker lives 5 minutes** (`REAUTH_VALIDITY`), set by:
   - `POST /api/v1/auth/reauth` (password verify, per-IP rate-limited), and
   - a successful **interactive password login** — staff login, public login,
     and MFA step-2 completion when step-1 was a password.
     *AC4 ruling (John/PM, 2026-07-06): a user who just entered their password
     is not re-prompted seconds later; a stale/resumed/token-only session is.*
3. **NOT set** on silent token refresh or magic-link login — neither is a
   password proof. This is enforced structurally, not by RBAC coincidence:
   the MFA challenge token carries `passwordProven` (set by the step-1
   channel), and step-2 completion only grants the grace when it is `true` —
   so a future magic-link + MFA combination still grants no grace (13-18
   review M1). The lifecycle helpers live in
   `apps/api/src/lib/reauth-grace.ts`.
4. **Cleared on logout** — the grace never outlives the session that earned it.
5. **Passwordless exemption (profile route only).** Wizard-provisioned public
   users can be passwordless (`passwordHash: null`, magic-link login only).
   They cannot answer a password modal, so `PATCH /users/profile` uses
   `requireFreshReAuthExceptPasswordless`: same gate for password-holding
   accounts, logged pass-through (`privileged_action.passwordless_exemption`)
   for passwordless ones. Risk delta vs the previously-ungated route is zero
   for that cohort; their identity proof is single-use magic-link possession.

## Gated routes (mirror of SENSITIVE_ACTIONS — the code is canonical)

| Method | Route | Gate |
|---|---|---|
| PATCH | `/api/v1/users/profile` (incl. staff bank fields) | `requireFreshReAuthExceptPasswordless` |
| PATCH | `/api/v1/admin/settings/:key` (incl. wizard form pin) | `requireFreshReAuth` |
| POST | `/api/v1/admin/email-queue/drain` | `requireFreshReAuth` |
| PATCH | `/api/v1/staff/:userId/role` | `requireFreshReAuth` |
| POST | `/api/v1/staff/:userId/deactivate` | `requireFreshReAuth` |
| POST | `/api/v1/staff/:userId/reactivate` | `requireFreshReAuth` |
| POST | `/api/v1/auth/mfa/enroll` | `requireFreshReAuth` |
| POST | `/api/v1/auth/mfa/disable` | `requireFreshReAuth` |
| POST | `/api/v1/auth/mfa/regenerate-codes` | `requireFreshReAuth` |

## Known gaps (accepted, documented)

- **No authenticated change-password route exists** (password changes go
  through the unauthenticated forgot/reset email flow). If one is ever added,
  it MUST mount a gate and be inventoried — the anti-drift test's reverse
  direction will force the inventory entry.
- The pre-13-18 `requireReAuth` middleware (Remember-Me-conditional regex
  list) was deleted: it was never mounted, and its patterns matched no
  registered route. Its bank-details/payments/security/sessions intents match
  no routes that exist; bank details ride the profile gate.

## Adding a new sensitive route (checklist)

1. Mount `requireFreshReAuth` on the route AFTER `authenticate`.
2. Add the `{ method, path, gate }` entry to `SENSITIVE_ACTIONS`.
3. Run `security.reauth-routes.test.ts` — it fails until both sides agree.
4. No client work needed: the 13-17 interceptor handles `AUTH_REAUTH_REQUIRED`
   globally.
