# Decision Request — Access-token client storage (sessionStorage vs httpOnly cookie vs in-memory)

**Status:** ✅ RATIFIED 2026-06-08 (Awwal/PO) — Launch = Option A (accept) · Post-launch = Option C → **Story 9-49** (depends-on 9-48)
**Raised:** 2026-06-08 by Bob (SM)
**Source:** Story 9-42 post-hoc code-review finding **N3** (carried in `9-48-refresh-token-lifecycle-hardening.md` → "Carried review nits"); itself surfaced by **F-004 / N2** (the "in-memory token" framing was inaccurate).
**This is NOT a launch-gate item** unless the decision below says so.

## The question
Should the **access token** continue to live in `sessionStorage` (client JS-readable), or move to an **httpOnly cookie** or **true in-memory** store to remove its XSS reachability?

## Context (factual)
- Today: `AuthContext.saveToken` persists the access token in **`sessionStorage`**; every authed call sends it as a `Bearer` header.
- The **refresh token is already an httpOnly cookie** (set by login / magic-link / and now F-022 rotation) — not JS-readable.
- **F-004 (9-42, `5b26e7d`)** corrected a *dead* `localStorage.getItem('token')` read in `IDCardDownload.tsx` + `ProfileCompletionPage.tsx` (those flows were effectively always-unauthenticated). It pointed them at `useAuth().accessToken`. **It did NOT reduce XSS exposure** — `sessionStorage` is as JS-readable as `localStorage`. The findings-register is accurate on this; only the AC wording overclaimed.
- Net: the access token remains XSS-exfiltratable for its lifetime (~15 min). The refresh token (the higher-value, long-lived secret) is already protected.

## Options
| | Option | XSS exposure | Effort / blast radius | Notes |
|---|--------|--------------|----------------------|-------|
| **A** | Status quo (`sessionStorage`) + accept | Access token JS-readable (~15 min) | None | Document as accepted-Low; refresh token already safe; lifetime-bounded. |
| **B** | httpOnly cookie for the access token | Removed | **Large** — changes auth transport from Bearer→cookie app-wide + introduces a **CSRF** model (SameSite + token/double-submit). | Biggest change; touches every authed request + server middleware. |
| **C** | True **in-memory** access token (+ silent refresh) | Removed at rest (only live in JS heap; gone on reload → silent re-fetch via the httpOnly refresh cookie) | **Moderate** — AuthContext + page-reload UX; leans on the refresh-rotation already in 9-42/9-48. | Best balance; aligns with the existing httpOnly-refresh design. |

## What's needed
- **John (PM):** priority + sequencing — accept-Low (A) for now, or schedule a fix; is this pre- or post-launch?
- **Winston (architect):** if B/C, the transport + CSRF (for B) or reload/silent-refresh (for C) design + an ADR; pick B vs C.

## SM recommendation (non-binding)
**Option C**, **post-launch** (unless the XSS surface is judged a launch blocker). It removes at-rest exposure with moderate effort, reuses the hardened httpOnly-refresh + rotation already shipping in 9-42/9-48, and avoids B's app-wide CSRF re-architecture. If accepted as-is for launch, record **Option A** with rationale in the findings-register.

## Disposition

**Panel recommendation (advisory — Party Mode 2026-06-08: John/PM + Winston/architect, Bob/SM facilitating; pending Awwal's ratification as PO):**
- **Launch → Option A (accept `sessionStorage`).** Access token is short-lived (~15 min) and the high-value refresh token is already httpOnly; residual XSS exposure is lifetime-bounded. **NOT launch-gating.** On ratification, record an Option-A-accepted note in `docs/security/findings-register.md` with this rationale.
- **Post-launch → Option C (in-memory access token + silent refresh).** Removes at-rest exposure with the least disruption and reuses the hardened refresh path. **Reject B** (httpOnly cookie) — forces a cookie-auth transport + new app-wide CSRF model for marginal gain on a 15-min token.
- **Dependency / sequencing:** Option C **MUST land after 9-48** (the M1 rotation grace-window) — boot-time silent-refresh would otherwise risk the multi-tab reuse false-positive revoking families on every reload. Carve C as its own post-launch spike/story; architect ADR covers: in-memory holder, boot-time silent-refresh, request-queue-until-token-ready, explicit logout.

**Ratification (PO):**
- [x] Awwal accepts the panel rec (A for launch / C post-launch, depends-on 9-48) — **2026-06-08**
- [x] (a) findings-register: Option-A-accepted-for-launch note added (note G)
- [x] (b) post-launch Option-C spike/story created → **Story 9-49** (`9-49-access-token-storage-hardening.md`, depends-on 9-48), sprint-status `backlog`
- [x] No override.
