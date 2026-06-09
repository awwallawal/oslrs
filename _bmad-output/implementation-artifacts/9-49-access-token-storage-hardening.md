# Story 9.49: Access-Token Client Storage Hardening (in-memory + silent refresh)

Status: ready-for-dev  · POST-LAUNCH (not a gate)

<!-- 2026-06-09: dependency satisfied — Story 9-48 (M1 rotation grace window) is DONE +
     deployed, so the boot silent-refresh AC#6 multi-tab assumption now holds. Flipped
     backlog → ready-for-dev. Still POST-LAUNCH / not a launch gate (launch posture =
     Option A sessionStorage accepted, findings-register note G); pick up when bandwidth
     allows. Impl line-refs were deferred to dev time (9-48 reshaped token.service /
     auth.service / AuthContext) — re-grep at implementation. -->


<!--
Authored 2026-06-08 by Bob (SM). Expanded from the 2026-06-08 stub after ADR-022 + PO ratification.
Source: Story 9-42 post-hoc code-review N3 → decision-request-2026-06-08-access-token-storage.md
        (RATIFIED 2026-06-08, Awwal/PO) → ADR-022 (architecture.md). Findings-register note G.
Decision: LAUNCH = Option A accepted (sessionStorage, lifetime-bounded). THIS STORY = Option C
        (in-memory + silent refresh). Option B (httpOnly access cookie) REJECTED (CSRF re-arch).
HARD DEPENDENCY: must land AFTER 9-48 (M1 rotation grace window) — boot-time silent-refresh is
        frequently concurrent across tabs and would otherwise trip F-022 reuse-detection.
Impl line-refs DELIBERATELY deferred to dev time: 9-48 reshapes token.service/auth.service —
        re-grep at impl (same guard 9-48 itself uses).
-->

## Story

As **the OSLSR custodian of public + staff credentials**,
I want **the access token held in browser memory only and silently re-minted from the httpOnly refresh cookie on reload**,
so that **a successful XSS cannot exfiltrate a usable bearer token at rest — closing the residual exposure F-004 left (it fixed a dead `localStorage` key but kept the token in JS-readable `sessionStorage`)**.

## Acceptance Criteria

1. **AC#1 — In-memory only.** The access token lives in AuthContext memory (state/closure) and is NEVER written to `localStorage` or `sessionStorage`. The F-004 eslint ban is extended to cover `sessionStorage` auth-token keys too. **Test:** after login, neither web storage contains the token; authed requests still succeed using the in-memory value.
2. **AC#2 — Boot/reload silent refresh.** On app load with no in-memory token, AuthContext performs a silent `/refresh` (httpOnly refresh cookie) to re-mint the access token before any authed request fires. **Test:** simulate reload (memory cleared, refresh cookie present) → token re-minted, the first authed call succeeds; with no/invalid refresh cookie → clean unauthenticated state (redirect to sign-in), no crash.
3. **AC#3 — Request-queue-until-ready.** Authed requests issued during the boot refresh window await the in-flight refresh rather than firing a stampede of 401s. **Test:** N concurrent authed calls at boot trigger exactly ONE `/refresh` and all succeed once it resolves.
4. **AC#4 — Logout clears the holder.** Logout clears the in-memory token (server-side invalidation via F-012 preserved). **Test:** post-logout the in-memory token is null and an authed call is rejected/redirected.
5. **AC#5 — Bearer transport unchanged (no CSRF surface).** Requests still send `Authorization: Bearer <token>`; no move to cookie-auth. **Test:** authed requests carry the Bearer header; no new CSRF token/flow introduced.
6. **AC#6 — Multi-tab boot is safe (depends-on 9-48).** Two tabs reloading near-simultaneously each silent-refresh within 9-48's rotation grace window → both re-authenticate, the token family is NOT revoked. **Test:** two-tab concurrent boot-refresh → both authed, no `AUTH_TOKEN_REUSE_DETECTED`. (Regression-locks the 9-48 dependency.)
7. **AC#7 — Zero regression.** Full API + web suites green; `tsc` + lint clean (api + web). MFA, session/token revocation, F-011/OPS-2/OPS-3 hashing, F-012/F-022 controls intact. Document net-new test counts.

## Tasks / Subtasks

- [ ] **Task 1 — In-memory token holder (AC: #1, #5)** — move the access token into AuthContext memory; remove `sessionStorage` persistence of the token; extend the F-004 eslint ban to `sessionStorage` auth-token keys. _(re-grep AuthContext token sites at impl — post-9-48.)_
- [ ] **Task 2 — Boot/reload silent refresh (AC: #2)** — on mount with no token, call `/refresh`; handle no/invalid cookie → unauthenticated state.
- [ ] **Task 3 — Request-queue-until-ready (AC: #3)** — gate authed requests on the in-flight boot refresh (single-flight); queue + release.
- [ ] **Task 4 — Logout clears holder (AC: #4)** — clear in-memory token on logout; confirm F-012 server invalidation path unchanged.
- [ ] **Task 5 — Tests + regression (AC: #6, #7)** — incl. the multi-tab boot-refresh test that exercises the 9-48 grace window; full suite + tsc + lint.
- [ ] **Task 6 — Pre-commit `[CR]` + commit** — fresh-context review on the uncommitted tree per [[feedback-review-before-commit]]; then atomic commit(s).

## Dev Notes

- **Design is locked in ADR-022** (in-memory holder, boot silent-refresh, request-queue-until-ready, Bearer transport unchanged). Do not re-litigate Option A/B/C.
- **HARD DEPENDENCY on 9-48 (M1 grace window).** AC#6 cannot pass without it; do not start 9-49 until 9-48 is merged. Boot silent-refresh is concurrent across tabs by nature.
- **Impl line-refs deferred on purpose:** 9-48 reshapes `token.service.ts` / `auth.service.ts` / AuthContext token handling. Re-grep exact sites at impl time (same guard 9-48 uses) — this story intentionally avoids brittle line numbers.
- **Launch posture is Option A (accepted):** this story is the post-launch hardening; it does NOT gate launch.
- Web-only change: server `/refresh` + rotation already exist (9-42/9-48); no new endpoint, no schema, no CSRF flow.

### References
- [Source: _bmad-output/planning-artifacts/architecture.md → ADR-022] (design of record)
- [Source: _bmad-output/planning-artifacts/decision-request-2026-06-08-access-token-storage.md] (ratified disposition)
- [Source: docs/security/findings-register.md → note G]
- [Source: _bmad-output/implementation-artifacts/9-48-refresh-token-lifecycle-hardening.md] (hard dependency — M1 grace window)
- [Source: _bmad-output/implementation-artifacts/9-42-auth-token-session-hardening.md → F-004; Carried review nits N2/N3]

## Dev Agent Record
### Agent Model Used
_(to be filled by dev)_

### Debug Log References

### Completion Notes List

### File List

### Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-08 | Stub created (N3 handoff). | Bob (SM) |
| 2026-06-08 | Expanded stub → ready-for-dev after ADR-022 + PO ratification: 7 ACs / 6 Tasks (Option C in-memory + silent refresh). DEPENDS-ON 9-48; POST-LAUNCH; impl line-refs deferred. | Bob (SM) |
| 2026-06-08 | Status reconciled `ready-for-dev` → **`backlog`** (story + sprint-status) to match findings-register note G — a hard unmet dependency on 9-48 means it is not pickable yet; flips to ready-for-dev when 9-48 ships. | Awwal (review) |
