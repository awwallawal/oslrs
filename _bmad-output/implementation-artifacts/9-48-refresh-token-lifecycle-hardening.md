# Story 9.48: Refresh-Token Lifecycle Hardening (hash-at-rest + rotation reuse-FP fix + reset single-use)

Status: ready-for-dev

<!--
Authored 2026-06-08 by Bob (SM) via canonical *create-story --yolo workflow.
Source: sprint-change-proposal-2026-06-08-refresh-token-lifecycle-hardening.md (John/PM)
        + Story 9-42 Review Follow-ups M1/M2/L3 (BMAD code-review of Tasks 2–9)
        + docs/security/findings-register.md → OPS-3 (+ note F correction).
LAUNCH-GATE story (Phase 2 🚦). Carries the three residual items the 9-42 code-review
deliberately routed OUT of the review session ([[feedback-code-review-no-story-dev]]):
  • M2 / OPS-3 — refresh tokens stored RAW in Redis at rest (same class as F-011/OPS-2).
  • M1 — F-022 rotation reuse-detection false-positives on multi-tab → spurious family revoke.
  • L3 — password-reset single-use is TOCTOU (pre-existing; preserved by the 9-42 F-018 refactor).
Decisions LOCKED with Awwal 2026-06-08: launch-gate · M2+M1+L3 bundled · HARD hash-only
cutover (no dual-read) · gated pre-launch so the forced-relogin blast radius ≈ 0.
-->

## Story

As **the OSLSR custodian of public + staff credentials**,
I want **refresh tokens hashed at rest, refresh-rotation that doesn't spuriously log out legitimate multi-tab users, and password resets that are genuinely single-use under concurrency**,
so that **a secondary leak (Redis/DB backup) cannot be replayed into account takeover, the reuse-detection control protects without punishing normal usage, and a reset link can never be consumed twice**.

## Acceptance Criteria

1. **AC#1 — M2 / OPS-3: hash refresh tokens at rest.** Every refresh-token value persisted in Redis is stored as `sha256Hex(token)`, never the raw token. This covers ALL three stores: the active entry key `refresh:<hash>`, the per-user reverse-index VALUE `user_refresh_token:<userId> → <hash>`, and the rotation tombstone `refresh_consumed:<hash>`. The plaintext refresh token exists only in transit (the httpOnly cookie) and in the function return values that set that cookie. Reuse the shared `sha256Hex` primitive from `@oslsr/utils` (the same one F-011/OPS-2 hashing delegates to) — do NOT add a new hashing helper. **Test:** after login + refresh, none of `refresh:*` / `user_refresh_token:*` value / `refresh_consumed:*` contains the raw cookie token; the value/keyspace contains a 64-hex sha256; login → refresh → refresh (rotation chain) still works end-to-end with the plaintext cookie token.
2. **AC#2 — M2: all lookup/mutation sites hash the incoming token before touching Redis.** `validateRefreshToken`, `getConsumedRefreshTokenUser`, `clearConsumedRefreshToken`, `invalidateUserRefreshTokens` (reverse-index → active-entry delete), the legacy `invalidateRefreshToken` (incl. its `currentToken === <token>` reverse-index guard, which must compare against the hash), and `rotateRefreshToken` (tombstone-set + active-entry delete) all hash the incoming plaintext first. No surviving code path keys/looks-up Redis by a raw refresh token. **Test:** submitting the stored 64-hex hash AS the token (a column/key-leak replay) is rejected, proving lookups re-hash the input (mirror the F-011/OPS-2 "hash-as-input is useless" test).
3. **AC#3 — M1: refresh-rotation grace window eliminates the multi-tab false-positive.** A just-consumed (tombstoned) refresh token presented again **within `REFRESH_ROTATION_GRACE_SECONDS` of its rotation** is treated as a benign concurrent refresh (multi-tab), NOT a replay: the caller is re-authenticated (a fresh token is issued / the replacement is returned) and the token family is **NOT** revoked. The same consumed token presented **after** the grace window still trips full reuse detection → `revokeAllUserTokens` + `AUTH_TOKEN_REUSE_DETECTED` 401. The grace window MUST NOT persist a usable plaintext token at rest beyond the existing cookie (preserve AC#1's invariant). Grace ≤ 15s. **Test:** (a) two near-simultaneous `/refresh` calls with the same token where the 2nd arrives after the 1st rotated → 2nd succeeds, family NOT revoked, both end authenticated; (b) replay of a consumed token after the grace window → family revoked + 401.
4. **AC#4 — L3: password-reset single-use is atomic under concurrency.** `resetPassword` atomically CLAIMS the token (e.g. `SET reset_claimed:<hash> 1 NX EX <ttl>`, or a Lua check-and-set) before applying the password change, so two concurrent `resetPassword` calls with the same valid token cannot both succeed — the loser gets the existing `AUTH_RESET_TOKEN_INVALID` "already used" error. The current UX is preserved: a later validate/reset of the same token still returns "This reset link has already been used" (keep the `used=true` + 1h-retain behavior). **Test:** two concurrent `resetPassword(sameToken,…)` → exactly one succeeds, the other throws "already used"; the password reflects the winning call only.
5. **AC#5 — Hard hash-only cutover documented (no dual-read).** A deploy note records that this is a deliberate hash-only cutover: on deploy, existing raw-keyed refresh tokens no longer match the hashed lookup, so **all active sessions are invalidated and users must re-login**. No dual-read fallback, no migration. Accepted because 9-48 ships **before** field deployment + Cohort A/B blasts (≈1 active session/day → blast radius ≈ 0). Note it MUST ship before any blast; if sequencing slips to post-traffic, the deploy strategy must be revisited (would then warrant dual-read). **Test:** n/a (doc AC — verified by the deploy note + register OPS-3 update).
6. **AC#6 — No existing control weakened + zero regression.** F-022 reuse detection (outside grace), F-012 logout positive invalidation, F-011/OPS-2 hash-at-rest, MFA, session/token revocation, parameterized SQL all remain intact. Full API + web suites green; `tsc` + lint clean (api + web). Document net-new test counts. Atomic commits: `fix(sec): OPS-3 hash refresh tokens at rest`, `fix(sec): F-022 rotation grace window (multi-tab reuse FP)`, `fix(sec): password-reset atomic single-use` — flip the OPS-3 register row → `Fixed-in-<hash>` in the SAME commit per the register maintenance rule.

## Tasks / Subtasks

- [ ] **Task 1 — M2/OPS-3: hash refresh tokens at rest (AC: #1, #2)** _(tests first)_
  - [ ] 1.1 In `apps/api/src/services/token.service.ts`, add a private `hashToken(token)` that delegates to `sha256Hex` from `@oslsr/utils` (mirror `password-reset.service.ts.hashToken` / `hashInvitationToken`). Do not introduce a new crypto primitive.
  - [ ] 1.2 `generateRefreshToken` (~line 82): mint the `uuidv7()` plaintext as today, but store the active entry under `refresh:<hashToken(token)>` and set the reverse index `user_refresh_token:<userId>` VALUE to `hashToken(token)`. RETURN the plaintext (for the cookie) unchanged.
  - [ ] 1.3 `validateRefreshToken` (~106): hash the incoming token → look up `refresh:<hash>`.
  - [ ] 1.4 `invalidateRefreshToken` (~127, legacy logout path): hash incoming for the `refresh:<hash>` read/del; the reverse-index guard becomes `if (currentToken === hashToken(refreshToken))`.
  - [ ] 1.5 `invalidateUserRefreshTokens` (~150, F-012): the reverse-index value is now already a hash → `del(refresh:<value>)` directly (no re-hash of the value); confirm the F-012 logout test still passes.
  - [ ] 1.6 `rotateRefreshToken` (~178, F-022): tombstone under `refresh_consumed:<hashToken(oldToken)>`; delete `refresh:<hashToken(oldToken)>`; `generateRefreshToken` for the replacement (already hash-safe via 1.2).
  - [ ] 1.7 `getConsumedRefreshTokenUser` / `clearConsumedRefreshToken`: hash incoming → `refresh_consumed:<hash>`.
  - [ ] 1.8 Tests (new, red-by-construction against the old raw storage): AC#1 (64-hex at rest across all 3 stores; e2e rotation chain) + AC#2 (hash-as-input rejected). Co-locate in `token.service.test.ts` + the orchestration in `auth.service.token-hardening.test.ts`.
- [ ] **Task 2 — M1: rotation grace window (AC: #3)** _(tests first)_
  - [ ] 2.1 Add `REFRESH_ROTATION_GRACE_SECONDS` (≤15; recommend 10). On `rotateRefreshToken`, stamp the tombstone with enough to recognise an in-grace replay (see Dev Notes "M1 grace-window design" — Approach B recommended: tombstone value = `JSON{ userId, rotatedAt }`, and within-grace presentation re-mints rather than revoking; Approach A = store a returnable replacement, only if true single-token convergence is required and the at-rest-plaintext invariant is honoured).
  - [ ] 2.2 In `AuthService.refreshToken` (~834), the reuse-detection branch (currently: tombstone hit → `revokeAllUserTokens` + 401) gains a grace check: if the tombstone's `rotatedAt` is within `REFRESH_ROTATION_GRACE_SECONDS`, do NOT revoke — re-authenticate the caller (issue a fresh access + refresh token, set the rotated cookie) and log `auth.refresh_grace_reissue` (info). Outside grace → existing revoke-family + `AUTH_TOKEN_REUSE_DETECTED` 401 unchanged.
  - [ ] 2.3 Update the misleading-comment fix from 9-42 to describe the NEW grace behavior (supersede the "ACCEPTED residual" note).
  - [ ] 2.4 Tests: AC#3 (a) within-grace concurrent refresh → no family revoke, both authenticated; (b) post-grace replay → family revoked + 401. Ensure the genuine-expiry (no tombstone) branch still 401s WITHOUT revoke (regression-lock the 9-42 behavior).
- [ ] **Task 3 — L3: password-reset atomic single-use (AC: #4)** _(tests first)_
  - [ ] 3.1 In `apps/api/src/services/password-reset.service.ts.resetPassword`, atomically claim the token before the password `UPDATE` (recommend `redis.set('reset_claimed:'+hash, '1', 'NX', 'EX', 3600)`; null return → throw the existing `AUTH_RESET_TOKEN_INVALID` "already used"). Keep the existing `used=true` + 1h-retain so a later validate still reports "already used".
  - [ ] 3.2 Tests: AC#4 concurrency (exactly-one-wins) + regression-lock the existing single-use-via-hash test (post-reset re-validate rejected).
- [ ] **Task 4 — Cutover note + register reconciliation (AC: #5, #6)**
  - [ ] 4.1 Add the "OPS-3 deploy note" to Dev Notes (hard hash-only cutover; forces re-login of active sessions; pre-launch → ≈0 impact; MUST precede blasts).
  - [ ] 4.2 On commit, flip the `docs/security/findings-register.md` OPS-3 row → `Fixed-in-<hash>` in the SAME `fix(sec): OPS-3 …` commit (register maintenance rule).
- [ ] **Task 5 — Regression sweep + atomic commits (AC: #6)**
  - [ ] 5.1 Full API + web suites green; `tsc` + lint clean (api + web). Document net-new test counts + per-item commit hashes.
  - [ ] 5.2 Pre-commit fresh-context `[CR]` on the uncommitted tree per [[feedback-review-before-commit]]; then the three atomic commits.

## Dev Notes

- **One atomic commit per item** for assessor 1:1 retest: `fix(sec): OPS-3 hash refresh tokens at rest` · `fix(sec): F-022 rotation grace window (multi-tab reuse FP)` · `fix(sec): password-reset atomic single-use`. Flip the OPS-3 register row in the OPS-3 commit.
- **Do NOT weaken existing controls** (F-022 reuse detection outside grace, F-012 logout invalidation, F-011/OPS-2 hashing, MFA, session/token revocation, parameterized SQL).
- **Reuse `sha256Hex`** from `@oslsr/utils` (shipped in `e13fbf3`; `hashInvitationToken` + `password-reset.service.ts.hashToken` already delegate). Unsalted SHA-256 is correct here: refresh tokens are `uuidv7()` (high-entropy random), so no dictionary/rainbow risk a salt would defend, and a per-token salt would break lookup-by-hash. Same rationale as F-011/OPS-2/magic-link.
- Testing: backend `__tests__/`; `beforeAll`/`afterAll` for real-DB/Redis integration; mock TokenService/SessionService for `auth.service` orchestration (pattern already in `auth.service.token-hardening.test.ts`).

#### OPS-3 deploy note (HARD hash-only cutover — DELIBERATE)
On deploy, `validate`/`rotate`/`invalidate` hash the incoming token → the new key won't match any pre-existing raw-keyed `refresh:`/`user_refresh_token:`/`refresh_consumed:` entry, so **every active session is invalidated and users must log in again.** No dual-read, no migration (Redis-only state, ≤30d TTL self-heals). **Accepted** because 9-48 ships **before** field deployment + Cohort A/B blasts, when prod carries ~1 active session/day → forced-relogin blast radius ≈ 0. **Sequencing constraint:** 9-48 MUST land before any blast. If it slips until after real traffic exists, STOP and revisit — a post-traffic rollout should switch to a dual-read migration (try hash, fall back to raw for one refresh-TTL, re-store as hash on rotation) to avoid a 30-day global forced-relogin. Flagged so a post-deploy "everyone got logged out" report isn't mis-triaged.

#### M1 grace-window design (the multi-tab false-positive)
**Problem (from 9-42):** after rotation deletes `refresh:<old>` and sets the tombstone, a second tab whose `validateRefreshToken` runs *after* that completes presents the now-consumed token → reuse detection → `revokeAllUserTokens` → both tabs logged out. Realistic given AuthContext's per-tab proactive refresh timer (`AuthContext.tsx:258`) on one shared cookie.
**Fix:** a short grace window in which a consumed token is treated as benign concurrency, not replay.
- **Approach B (recommended — no plaintext at rest):** tombstone value = `JSON{ userId, rotatedAt }`. On a consumed-token presentation, if `now - rotatedAt ≤ REFRESH_ROTATION_GRACE_SECONDS` → re-mint a fresh token for the caller (normal rotation) and DON'T revoke; else → revoke family + 401. Keeps AC#1's "no usable plaintext at rest" invariant. Cost: a racing tab gets its own fresh token (the shared-cookie last-writer-wins; the other becomes an orphan that expires) — acceptable.
- **Approach A (only if true single-token convergence is required):** tombstone stores a *returnable* replacement so both tabs converge on ONE token — but that persists a usable plaintext at rest for the grace window, which conflicts with AC#1; avoid unless explicitly justified.
- **Security tradeoff (document in code):** within the grace window an attacker replaying a stolen-then-just-rotated token also gets re-authenticated (same inherent tradeoff Auth0's refresh leeway makes). Keep the window SMALL (≤15s, recommend 10s) to bound it; outside the window, full reuse detection + family revoke is unchanged. This is a deliberate, bounded relaxation — NOT a removal of reuse detection.

#### L3 atomic single-use note
`resetPassword` currently does `lookupValidToken` (checks `used`) → password `UPDATE` → setex `used=true` — non-atomic, so two concurrent calls can both pass the `used` check. Fix with an atomic NX claim key (`reset_claimed:<hash>`, TTL = reset TTL) taken before the password write; loser throws the existing "already used" error. Preserve the `used=true` + 1h-retain so a later validate still reads "already used" (keeps the committed UX/test contract). A Lua check-and-set is an acceptable alternative; NX-claim is simpler and sufficient.

### Project Structure Notes
- Touch: `apps/api/src/services/token.service.ts` (6 sites + new `hashToken`), `apps/api/src/services/auth.service.ts` (`refreshToken` grace branch), `apps/api/src/services/password-reset.service.ts` (`resetPassword` atomic claim). Tests: `token.service.test.ts`, `auth.service.token-hardening.test.ts`, `password-reset.service.test.ts`. Docs: this story + `docs/security/findings-register.md` (OPS-3 row flip).
- **No schema migration** (Redis-only). **No new audit action** expected (reuse existing token/auth events). **No web changes** (refresh-token storage + reset are server-side; the cookie contract is unchanged).
- File-overlap caution: `token.service.ts` / `auth.service.ts` / `password-reset.service.ts` were just touched by 9-42 (uncommitted Tasks 2–9). **Sequencing: 9-48 dev should start from a tree where 9-42's per-F-ID commits have landed** (do the 9-42 atomic commits first), so 9-48 builds on committed F-012/F-022/F-018 rather than racing the same uncommitted hunks. Re-grep line numbers at impl time.

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-08-refresh-token-lifecycle-hardening.md]
- [Source: _bmad-output/implementation-artifacts/9-42-auth-token-session-hardening.md#review-follow-ups → Tasks 2–9 review follow-ups (M1/M2/L3)]
- [Source: docs/security/findings-register.md → OPS-3 + note F correction]
- [Source: apps/api/src/services/token.service.ts] (REFRESH_TOKEN_KEY_PREFIX `refresh:`, USER_REFRESH_KEY_PREFIX `user_refresh_token:`, CONSUMED_REFRESH_KEY_PREFIX `refresh_consumed:`; generate/validate/invalidate/rotate/getConsumed/clearConsumed)
- [Source: apps/api/src/services/auth.service.ts → refreshToken reuse-detection branch (F-022)]
- [Source: apps/api/src/services/password-reset.service.ts → lookupValidToken / resetPassword]
- [Source: packages/utils/src/crypto.ts → sha256Hex (shared primitive, commit e13fbf3)]
- Pattern precedents: F-011 (`4fee9b9`) + OPS-2 (`8ba810a`) hash-at-rest; F-022 (`9-42`) rotation+reuse.

## Dev Agent Record
### Agent Model Used
_(to be filled by dev)_

### Debug Log References

### Completion Notes List

### File List
