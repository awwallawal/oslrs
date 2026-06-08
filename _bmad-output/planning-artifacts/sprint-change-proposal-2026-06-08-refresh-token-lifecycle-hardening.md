# Sprint Change Proposal — Refresh-Token Lifecycle Hardening (Story 9-48)

**Date:** 2026-06-08
**Author:** John (PM) via `correct-course`
**Trigger source:** BMAD code-review of Story 9-42 Tasks 2–9 (2026-06-08) — Review Follow-ups M1/M2/L3
**Decision basis:** scope/sequencing locked with Awwal 2026-06-08 (launch-gate · M2+M1+L3 · hard hash-only cutover · full correct-course → create-story path)
**Scope class:** Moderate (backlog add + security-register reconciliation) → route to **Bob (SM)** for `*create-story`

---

## Section 1 — Issue Summary

Story 9-42's adversarial code-review (uncommitted Tasks 2–9 tree) confirmed all 11 ACs implemented, but surfaced three residual items that were deliberately **not** fixed inside the review session (per `[[feedback-code-review-no-story-dev]]` — substantive security-behavior changes route to a dev-story):

1. **M2 — refresh tokens are stored RAW in Redis at rest.** `refresh:<rawToken>`, the `user_refresh_token:<userId>` reverse-index *value*, and the new `refresh_consumed:<rawToken>` tombstone (added by 9-42 F-022) all persist the bearer secret in cleartext. A Redis-backup/secondary leak → replayable refresh tokens (up to 30 days for remember-me). This is the **exact** threat model F-011/OPS-2 hashed other tokens against, and it **contradicts findings-register note F**, which claims "every raw bearer secret is either hashed, scheduled, or dead." The refresh-token store was not in the F-011 class-sweep.
2. **M1 — refresh-rotation reuse-detection false-positives (multi-tab).** After F-022 rotation, a tab whose `validateRefreshToken` runs *after* another tab has already rotated presents the now-tombstoned token → `revokeAllUserTokens` → both tabs forced to re-log-in. Realistic given AuthContext's per-tab proactive refresh timer on a single shared httpOnly cookie. 9-42 corrected the misleading "benign" comment and accepted the residual; the durable fix (a short grace window that **re-issues** the already-minted token instead of revoking) is dev-story work.
3. **L3 — password-reset single-use is TOCTOU.** `lookupValidToken` → password `UPDATE` → mark-used is not atomic; two concurrent resets with the same token could both pass the `used` check. Pre-existing; preserved by the 9-42 F-018 refactor. An atomic claim (`GETDEL`/Lua/WATCH-MULTI) would change the committed "keep key 1h with `used=true`" contract a test asserts — hence a scoped dev-story.

**How discovered:** fresh-context BMAD code-review, 2026-06-08. **Evidence:** `token.service.ts` (`generateRefreshToken`/`validateRefreshToken`/`rotateRefreshToken` use raw token as the Redis key); register note F overclaim; `password-reset.service.ts` `lookupValidToken`→`resetPassword` non-atomic mark-used.

## Section 2 — Impact Analysis

- **Epic impact:** Epic 9 (security hardening arc). One new story; no change to other epics.
- **Story impact:** **New Story 9-48.** Story 9-42 stays `done` (its ACs are met; M1/M2/L3 are enhancements logged in its Review Follow-ups with `[ ]` and now formally carried here). No other story changes.
- **Artifact conflicts:** `docs/security/findings-register.md` — needs a new **OPS-3** row + a correction to **note F** (the "sweep complete" line is now false). No PRD/architecture/UX impact (server-only token-storage change + one client-invisible behavior fix).
- **Technical impact:**
  - **Deploy / cutover (DELIBERATE — hard hash-only, no dual-read):** on deploy, `validate`/`rotate`/`invalidate` hash the incoming token → won't match raw-keyed entries, so **all active sessions are invalidated and must re-login.** Accepted because 9-48 ships **before** field deployment + Cohort A/B blasts, when production carries ~1 active session/day — blast radius ≈ 0. A one-line cutover note suffices; **no migration/runbook**, unlike a post-launch rollout would need.
  - Touches `token.service.ts` (6 sites: generate/validate/invalidate/rotate/getConsumed/clearConsumed + reverse index), `password-reset.service.ts` (L3 atomic), and the refresh-rotation path (M1 grace window). No schema migration (Redis-only); no new audit action expected.

## Section 3 — Recommended Approach

**Direct Adjustment** — add one new launch-gate story (9-48) and reconcile the register. No rollback, no MVP change.

- **Why launch-gate (not post-launch):** zero raw bearer secrets at rest before any real traffic; the hard-cutover cost is near-zero pre-launch but would be a 30-day forced-relogin blast post-launch. Sequencing it now is strictly cheaper.
- **Why bundle M2+M1+L3:** M1 and M2 touch the *same* refresh-token functions, one deploy, one test surface. L3 is a different subsystem (password-reset) folded in as a separate AC to clear the 9-42 review tail in one hardening sweep.
- **Effort:** ~1–1.5 dev-days (M2 hash-at-rest is mechanical mirror of F-011/OPS-2; M1 grace window + tests; L3 atomic claim + preserve the "already used" contract).
- **Risk:** Low-Medium. Main risk is the cutover (mitigated by pre-launch timing) and not weakening F-022 reuse detection while adding the M1 grace window (covered by tests).

## Section 4 — Detailed Change Proposals

**4.1 New story (authored next by Bob/SM via canonical `*create-story`):**
> **9-48 — Refresh-Token Lifecycle Hardening (hash-at-rest + rotation reuse-FP fix + reset single-use)** · LAUNCH GATE · Epic 9
> ACs (target): (1) hash refresh tokens at rest — `sha256` for `refresh:`, the `user_refresh_token:` value, and `refresh_consumed:`; hash incoming at validate/rotate/invalidate (M2). (2) rotation grace window: a just-consumed token presented within N seconds of its rotation RE-ISSUES the already-minted token instead of revoking the family — eliminates the multi-tab false positive while preserving reuse detection outside the window (M1). (3) password-reset atomic single-use — claim the token atomically so concurrent resets can't both succeed, preserving the "already used" UX (L3). (4) hard hash-only cutover documented (forced re-login of any active sessions — negligible pre-launch). (5) tests + zero regression; F-022 reuse detection, F-012 logout invalidation, F-011/OPS-2 hashing all intact.

**4.2 Security-register reconciliation (`docs/security/findings-register.md`):**
- ADD row **OPS-3** (refresh tokens raw at rest, Medium, local discovery, `In-story 9-48`).
- AMEND **note F** — its closing "the sweep is therefore complete" is now false; refresh tokens were outside the F-011 sweep. Add the correction + pointer to OPS-3/9-48.

**4.3 Sprint tracking (`sprint-status.yaml`):** add `9-48-refresh-token-lifecycle-hardening` as a launch-gate item (status set by Bob on authoring).

## Section 5 — Implementation Handoff

- **Scope class:** Moderate → **Bob (SM)** authors `9-48` via canonical `*create-story`; then **Amelia (dev)** implements via `dev-story`.
- **Success criteria:** OPS-3 closes (`Fixed-in-<hash>`); refresh tokens 64-hex at rest; multi-tab refresh no longer force-logs-out within the grace window; concurrent reset single-use proven; full suites green; register note F corrected.
- **Deferred/none:** no operator runbook needed (pre-launch cutover); no PRD/arch/UX changes.

---
_Routed: PM (John) → SM (Bob, create-story) → Dev (Amelia, dev-story). Approval basis: Awwal 2026-06-08 (scope locked via AskUserQuestion)._
