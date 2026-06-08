# Story 9.42: Auth, Token & Session Hardening (close F-011 + the auth/token/session tail + IPv6 rate-limit bypass)

Status: in-progress

<!--
Authored 2026-06-07 by Bob (SM) via canonical *create-story --yolo workflow.
Source: sprint-change-proposal-2026-06-06-security-r2-remediation.md §4.1 + REMEDIATION-BRIEF.md.
LAUNCH-GATE story (Phase 2 🚦). One atomic commit PER F-ID (`fix(sec): <F-ID> <summary>`),
each with a test that fails on old behavior and passes on new (brief Definition of Done).

Headline (HEAD-reconciled 2026-06-06, CONFIRMED still open): F-011 — password-reset tokens
stored RAW. `password-reset.service.ts:161` writes the raw token as the Redis key; `:169`
writes raw `passwordResetToken` to the DB; validation `:187` looks up by raw token. The 9-16
magic-link work did NOT touch this path.

Bundled findings: F-011, F-012, F-018, F-019, F-022, F-023, F-004, and OPS-RL-1 (the IPv6
rate-limit bypass discovered locally 2026-06-06 during the pm2 ↺ investigation — NOT in R2).
Note F-019 partially self-closed: `requestReset` already keys by normalized email
[Source: apps/api/src/services/password-reset.service.ts:58,85] — verify the rate-limit
MIDDLEWARE keying and the documented max; reply "already fixed" if fully closed.
-->

## Story

As **the OSLSR custodian of staff and public-user credentials**,
I want **bearer secrets hashed at rest, tokens rotated and reuse-detected, logout positively invalidated, the selfie-upload auth bug fixed, and rate limits IPv6-safe**,
so that **a secondary leak (DB/Redis backup, SQLi elsewhere) cannot be turned into account takeover, replayed tokens are caught, and no auth control is silently bypassable**.

## Acceptance Criteria

1. **AC#1 — F-011: hash password-reset tokens at rest.** Store `sha256(token)` as both the Redis key and the `users.passwordResetToken` column; hash the incoming token before lookup at validation. Copy the correct pattern from `magic-link.service.ts` (~73-74, 119) [Source: apps/api/src/services/password-reset.service.ts:160-173]. **Test:** request a reset → DB column + Redis key contain a 64-char hex hash, NOT the emailed token; reset still completes end-to-end with the plaintext token from the email.
2. **AC#2 — F-011 class-sweep (DONE 2026-06-07).** Swept all bearer secrets: hashed-safe = magic-link / marketplace `editToken` / sms-otp / mfa / password-reset(now); **found raw → OPS-2 (`users.invitationToken`, see AC#11)**; dead column = `users.emailVerificationToken` (→ dropped in 9-46). AC#2 closes when OPS-2 (AC#11) is hashed. Findings in Dev Notes + register note F.
3. **AC#3 — F-012: positive logout invalidation.** On logout, explicitly `invalidateRefreshToken(...)` / `revokeAllUserTokens(userId)` rather than relying on the session-key check alone [Source: apps/api/src/services/auth.service.ts logout path]. **Test:** post-logout, the prior refresh token is rejected.
4. **AC#4 — F-022: refresh-token rotation + reuse detection.** Rotate the refresh token on `/refresh`; if a consumed/replayed token is presented, revoke the entire token family [Source: apps/api/src/routes/auth.routes.ts /refresh; token.service.ts]. **Test:** replay of a consumed refresh token → family revoked + 401.
5. **AC#5 — F-023: fix `uploadSelfie` principal bug (live 401).** `uploadSelfie` reads `req.user.userId` but the JWT carries `.sub` → always 401. Fix to `.sub` [Source: apps/api/src/controllers/... uploadSelfie]. **Test:** route exercised with a real token succeeds (regression-locks the always-401).
6. **AC#6 — F-019: reset rate-limit keying + documented max.** Ensure the password-reset rate-limit middleware keys by normalized email (like `magic-link-rate-limit.ts`) and the `max` matches the documented NFR4.4 spec [Source: apps/api/src/middleware/...reset-rate-limit; password-reset.service.ts:58]. If already satisfied at HEAD, record "already fixed in <commit>" with evidence. **Test:** keying + max asserted.
7. **AC#7 — F-018: equalize forgot-password latency.** Move the forgot-password email send to a queue / `setImmediate` so the existing-vs-non-existing-email branches return on the same latency path (defeats timing-based enumeration) [Source: apps/api/src/controllers/...forgotPassword]. **Test:** both branches return within the same latency envelope (no synchronous send on the exists branch).
8. **AC#8 — F-004: stop writing auth tokens to localStorage.** Make `IDCardDownload.tsx` + `ProfileCompletionPage.tsx` read the in-memory access token like the rest of the app; do NOT `localStorage.setItem('token', ...)`. Add a lint rule banning `localStorage` access to auth-token keys [Source: apps/web/src/.../IDCardDownload.tsx; ProfileCompletionPage.tsx]. **Test:** lint rule fails on a localStorage auth-token write; components use the in-memory token.
9. **AC#9 — OPS-RL-1: IPv6 rate-limit bypass.** `operations-rate-limit.ts:29` custom `keyGenerator` omits express-rate-limit@8's `ipKeyGenerator` helper (`ERR_ERL_KEY_GEN_IPV6`) → IPv6 clients can bypass the limit and it spams startup logs [Source: apps/api/src/middleware/operations-rate-limit.ts:29]. Wrap the IP in `ipKeyGenerator`; sweep other custom keyGenerators for the same omission. **Test:** an IPv6 client is correctly bucketed (regression-locks the bypass); no `ERR_ERL_KEY_GEN_IPV6` at boot.
10. **AC#10 — Tests + zero regression; no control weakened.** Full API + web suites green; MFA, session/token revocation, existing rate limits, parameterized SQL all intact. Document net-new test counts and per-F-ID commit hashes for assessor retest.
11. **AC#11 — OPS-2: hash staff `invitationToken` at rest (locally-discovered via AC#2 sweep, not in R2).** Mirror F-011 — store `sha256(invitationToken)` in `users.invitationToken` (`staff.service.ts`) and hash the incoming token before lookup (`auth.service.ts:67` + `:115`); plaintext token appears only in the emailed activation URL; preserve the `invitationToken: null` invalidation on activation (`auth.service.ts:175`). **Test:** stored column is 64-hex sha256 (≠ emailed token); staff activation still completes end-to-end with the plaintext token. Atomic commit `fix(sec): OPS-2 hash staff invitation tokens at rest`.

## Tasks / Subtasks

- [~] **Task 1 — F-011 hash reset tokens + class-sweep (AC: #1, #2)** _(tests first)_ — IMPLEMENTED, awaiting code-review + commit
  - [x] 1.1 Hashed `sha256` at store (Redis key + `users.passwordResetToken`) + at validation/reset lookup; copied `magic-link.service.ts` pattern. Plaintext returned only for the email. Test `password-reset.service.test.ts` 3/3 green.
  - [x] 1.2 Class-sweep DONE (see Dev Agent Record). Hashed-safe: magic-link / editToken / sms-otp / mfa / password-reset. **RAW found: `users.invitationToken` (NEW, not in R2) → flagged for follow-up (AC#2 not fully closed until it's hashed or consciously deferred).** Dead column: `emailVerificationToken` (no reader/writer).
- [ ] **Task 1b — OPS-2 hash staff `invitationToken` at store + lookup (AC: #11)** _(tests first)_ — mirror F-011; hash in `staff.service.ts` (store) + `auth.service.ts:67/115` (lookup); plaintext only in the activation URL; keep `:175` null-on-activation. Atomic commit `fix(sec): OPS-2 …`.
- [ ] **Task 2 — F-012 positive logout invalidation (AC: #3)**
- [ ] **Task 3 — F-022 refresh rotation + reuse detection (AC: #4)**
- [ ] **Task 4 — F-023 uploadSelfie `.sub` fix + test (AC: #5)**
- [ ] **Task 5 — F-019 reset rate-limit keying/max (verify; "already fixed" if closed) (AC: #6)**
- [ ] **Task 6 — F-018 forgot-password latency equalization (AC: #7)** — _also fold in the `lookupValidToken` refactor + single-active-token cleanup from Review Follow-ups #5/#6 (same file); design captured under Review Follow-ups._
- [ ] **Task 7 — F-004 localStorage token removal + lint ban (AC: #8)**
- [ ] **Task 8 — OPS-RL-1 IPv6 keyGenerator fix + sweep (AC: #9)**
- [ ] **Task 9 — Regression sweep + per-F-ID commit hashes (AC: #10)**

### Review Follow-ups (AI)

_Adversarial code-review of the F-011 change (Task 1), 2026-06-08 by Awwal. Scope: `password-reset.service.ts` + its two test files only. Cross-checked against `ssh_analysis.txt:180-208` security-specific guidance. `[x]` = fixed in this review pass; `[ ]` = accepted/deferred with rationale._

- [x] [AI-Review][Med] File List incomplete — `apps/api/src/__tests__/auth.password-reset.test.ts` was modified (hashed-key sweep) but was missing from the File List. Added. [9-42 Dev Agent Record → File List]
- [x] [AI-Review][Med] Backward-compat: in-flight reset links break on deploy (raw-keyed Redis/DB entries no longer match the hashed lookup). Documented as a **deliberate** decision bounded by the 1h TTL — see Dev Notes "F-011 deploy note". [password-reset.service.ts:161-185]
- [x] [AI-Review][Low] Stale AC reference — `RESET_RATE_LIMIT` export comment cited "AC#4 rate-limit test"; in this story AC#4 is refresh rotation, the reset rate-limit is AC#6/F-019. Corrected. [password-reset.service.ts:10-13]
- [x] [AI-Review][Low] Unit-coverage gap — no test exercised `resetPassword` single-use through the hashed key. Added test #4 (post-reset re-validate of the same plaintext is rejected). [password-reset.service.test.ts]
- [ ] [AI-Review][Low][DEFER→Task 6/F-018] Redundant double-hash + double Redis-GET: `resetPassword` calls `validateToken` (hashes + fetches once) then re-hashes/re-fetches at `:262-263` to build the mark-used key. Negligible perf, but it's a clean simplification. **NOT folded into F-011** to keep that security commit minimal/atomic for 1:1 assessor retest. **Routing corrected 2026-06-08:** this lives entirely in `password-reset.service.ts`, so it belongs with the next task touching that file (Task 6/F-018), NOT F-022 (which is refresh-token rotation in `token.service.ts` — a different subsystem). Design ready below. [password-reset.service.ts:244,262-263]
- [ ] [AI-Review][Low][DEFER→Task 6/F-018] Pre-existing: validation is Redis-only, so two `requestReset` calls within the hour leave two independently-valid reset tokens (DB column reflects only the latest). Not introduced by F-011. **Routing corrected 2026-06-08** (was mis-pointed at F-022): single-active-token semantics for the *password-reset* token live in `password-reset.service.ts`; fold into Task 6/F-018 (or a standalone `refactor(auth):`). F-022's reuse-detection is for the JWT refresh family, a separate subsystem. [password-reset.service.ts:178-188]

#### Deferred design — `lookupValidToken` private helper (for Task 6 / F-018)
The clean fix for both follow-ups above (hash once, fetch once, no public-contract change). Carry this into the F-018 dev-story session so it isn't re-derived:

```ts
/** Hash once, fetch once, validate once. Private — validateToken's public shape is unchanged. */
private static async lookupValidToken(token: string): Promise<{ key: string; data: ResetTokenData }> {
  const redis = getRedisClient();
  const key = `${RESET_TOKEN_KEY_PREFIX}${this.hashToken(token)}`;
  const raw = await redis.get(key);
  if (!raw) throw new AppError('AUTH_RESET_TOKEN_INVALID', 'This reset link is invalid or has expired', 400);
  const data: ResetTokenData = JSON.parse(raw);
  if (data.used) throw new AppError('AUTH_RESET_TOKEN_INVALID', 'This reset link has already been used', 400);
  if (new Date() > new Date(data.expiresAt)) throw new AppError('AUTH_RESET_TOKEN_EXPIRED', 'This reset link has expired', 400);
  return { key, data };
}
// validateToken() → return { userId, email } from lookupValidToken (same shape as today)
// resetPassword() → const { key, data } = await this.lookupValidToken(token); reuse key+data for mark-used
```
For single-active-token (#6): on `requestReset`, before issuing a new token, delete the prior `users.passwordResetToken` hash's Redis key (or stamp the row) so only the latest reset link is live. Keep it scoped to the reset subsystem.

## Dev Notes

- **One atomic commit per F-ID** (`fix(sec): F-011 …`) so the assessor retests 1:1. Reply with each commit hash.
- F-011 is the do-first (trivial, ~10 lines, removes a plaintext-secret-at-rest High). F-023 is a live 401 — fast, high-value. OPS-RL-1 is ours (not R2) but ships here.
- Do NOT weaken existing controls while fixing (consent gate, MFA, session/token revocation, parameterized SQL).
- Testing: backend `__tests__/`, `beforeAll`/`afterAll` for real-DB integration.

#### F-011 deploy note + security confirmations (code-review 2026-06-08)
- **Deploy / backward-compat (DELIBERATE):** reset tokens issued before this ships are stored raw (`password_reset:<raw>` in Redis + raw `users.passwordResetToken`). After deploy, `validateToken` hashes the incoming plaintext → `password_reset:<sha256>`, which won't match the old raw key, so any outstanding reset link returns "invalid or expired". This is an **accepted short-TTL flush** (reset TTL = 1h), not a regression. Operator: no migration needed; in-flight users simply re-request. Flagged so a post-deploy "my reset link broke" report isn't mis-triaged.
- **Unsalted SHA-256 is correct here (confirmed, not a defect):** the token is 32 bytes of `randomBytes` (base64url), so there is no rainbow-table/dictionary/brute risk that a salt would defend against; this matches `magic-link.service.ts:74`. A per-token salt would also break the lookup-by-hash design.
- **No plaintext-comparison path remains (confirmed):** `validateToken` (`:200`) and `resetPassword` mark-used (`:263`) look up by the hashed Redis key only; there is no surviving raw-token equality check. The DB column is write-only audit data, never read for validation.

### Project Structure Notes
- Touch: `services/password-reset.service.ts`, `services/auth.service.ts`, `services/token.service.ts`, `controllers/*` (selfie, forgot-password), `middleware/operations-rate-limit.ts` + reset-rate-limit, `apps/web/.../IDCardDownload.tsx` + `ProfileCompletionPage.tsx`, eslint config (lint rule).

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-security-r2-remediation.md#section-4-detailed-change-proposals]
- [Source: security-assessment/REMEDIATION-BRIEF.md] (F-011/012/018/019/022/023/004)
- [Source: apps/api/src/services/password-reset.service.ts:160-173] · [Source: apps/api/src/services/magic-link.service.ts:73] · [Source: apps/api/src/middleware/operations-rate-limit.ts:29]

## Dev Agent Record
### Agent Model Used
Claude Opus 4.8 (1M) — Amelia (dev), 2026-06-07.

### Debug Log References
- `pnpm vitest run apps/api/src/services/__tests__/password-reset.service.test.ts` → **3 passed** (3.30s).

### Completion Notes List
- **F-011 (AC#1) DONE (uncommitted):** `password-reset.service.ts` — added private `hashToken()` (sha256 hex); `requestReset` now stores `sha256(token)` as the Redis key + `users.passwordResetToken`; `validateToken` + `resetPassword` hash the incoming token before lookup. Plaintext token returned ONLY for the email link. Mirrors `magic-link.service.ts`.
- **Test (new):** `services/__tests__/password-reset.service.test.ts` — 3 cases: (1) Redis key + DB column = 64-hex sha256, ≠ emailed token; (2) e2e validate still works with the plaintext token; (3) submitting the stored hash as input is rejected (proves lookup re-hashes input). Red-by-construction (assertions fail against the old raw-token storage).
- **AC#2 class-sweep DONE:** hashed-safe = magic-link / marketplace `editToken` / sms-otp / mfa / password-reset(now). **RAW found = `users.invitationToken`** (staff activation: stored raw `staff.service.ts:~403`, looked up raw `auth.service.ts:67/115`) — same class as F-011, NOT in the R2 assessment → needs the same hash-at-store+lookup fix; **flagged for triage (new register row + fix decision).** Dead column = `users.emailVerificationToken` (schema-only, no reader/writer post-9-12; schema-cleanup candidate).
- **HALTED before commit** (per directive + `feedback_review_before_commit`): awaiting (a) fresh-context `[CR]` on the uncommitted tree, (b) invitationToken triage, before the atomic `fix(sec): F-011 …` commit (which will also flip the register F-011 row → `Fixed-in-<hash>`).
- **Code-review pass 2026-06-08 (Awwal, BMAD code-review):** 0 High / 2 Med / 4 Low against the F-011 surface. Fixed: File List completeness (added `auth.password-reset.test.ts`), stale AC#6 comment, +1 single-use-via-hash unit test (now 4/4 green), and documented the deliberate in-flight-token deploy flush + the unsalted-SHA-256 / no-plaintext-comparison confirmations (cross-checked vs `ssh_analysis.txt:201-205`). 2 Low accepted/deferred (redundant double-hash = negligible; concurrent-dual-token = routed to AC#4/F-022). All findings logged under Tasks → Review Follow-ups (AI). **F-011 itself is review-clean and ready for the atomic `fix(sec): F-011 …` commit; the STORY stays in-progress (ACs #3–#11 unimplemented).**

### Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-07 | F-011 implemented (hash reset tokens at rest) + class-sweep; halted pre-commit for review | Amelia (dev) |
| 2026-06-08 | BMAD code-review of F-011: 6 findings (2 Med, 4 Low); 4 fixed, 2 accepted/deferred; story → in-progress | Awwal (review) |

### File List
- `apps/api/src/services/password-reset.service.ts` — modified (F-011: `hashToken()` + hashed store/lookup; review: corrected stale AC#6 comment).
- `apps/api/src/services/__tests__/password-reset.service.test.ts` — new (F-011 regression tests; review: +1 single-use-via-hash test, now 4 cases).
- `apps/api/src/__tests__/auth.password-reset.test.ts` — modified (F-011 sweep: seed/cleanup the expired-token Redis entry under the hashed key). _Added to File List in the 2026-06-08 code-review pass (was missing)._
