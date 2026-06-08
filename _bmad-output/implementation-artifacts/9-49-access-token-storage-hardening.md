# Story 9.49: Access-Token Client Storage Hardening (in-memory + silent refresh)

Status: backlog (STUB — full `*create-story --yolo` authoring pending scheduling)

<!--
STUB authored 2026-06-08 by Bob (SM). NOT a launch gate — POST-LAUNCH hardening.
Source: Story 9-42 post-hoc code-review finding N3 (carried in 9-48 "Carried review nits")
        → decision-request-2026-06-08-access-token-storage.md → RATIFIED 2026-06-08 (Awwal/PO).
Decision: LAUNCH = Option A accepted (access token stays in sessionStorage, lifetime-bounded);
          POST-LAUNCH = Option C (in-memory + silent refresh). Option B (httpOnly access cookie) REJECTED.
HARD DEPENDENCY: must land AFTER Story 9-48 (M1 rotation grace window) — boot-time silent-refresh
would otherwise trip the multi-tab reuse false-positive and revoke families on every reload.
This is a STUB: flesh out full ACs/Tasks via the canonical *create-story workflow when scheduled
(needs Winston/architect ADR input first).
-->

## Story

As **the OSLSR custodian of public + staff credentials**,
I want **the access token held in-memory (not `sessionStorage`) and silently re-minted from the httpOnly refresh cookie on reload**,
so that **a successful XSS cannot exfiltrate a usable bearer token at rest, closing the residual exposure left after F-004 (which only corrected a dead `localStorage` key, not the storage medium)**.

## Decision context (ratified — do not re-litigate)
- **Option A (sessionStorage)** = accepted for LAUNCH only (short-lived ~15 min token; refresh already httpOnly; bounded exposure). Recorded in findings-register note G.
- **Option C (in-memory + silent refresh)** = THIS story.
- **Option B (httpOnly access cookie)** = rejected (app-wide cookie-auth transport + CSRF re-architecture; not worth it for a 15-min token).

## Scope sketch (for the architect/dev — to be formalized into ACs)
- Hold the access token in AuthContext **memory only** (React state/closure); never write it to `sessionStorage`/`localStorage`.
- On app boot / page reload (token absent), perform a **silent `/refresh`** via the httpOnly refresh cookie to re-mint the access token before issuing authed calls.
- **Request-queue-until-ready:** authed requests fired during boot must await the in-flight silent refresh (avoid a thundering-herd of 401s on load).
- Explicit **logout** must clear the in-memory token (already invalidates server-side via F-012).
- Keep the Bearer-header transport unchanged (no CSRF re-architecture — that's why B was rejected).
- **Depends-on 9-48:** rely on the M1 grace window so the boot silent-refresh (often concurrent across tabs) does not trigger reuse-detection family revoke.

## Open items before dev
- [ ] Winston (architect) ADR: in-memory holder pattern, boot silent-refresh sequencing, request-queue-until-ready, multi-tab behavior, logout.
- [ ] Run canonical `*create-story --yolo` to expand this stub into full ACs + Tasks once scheduled.
- [ ] Confirm 9-48 has shipped (hard dependency).

## References
- [Source: _bmad-output/planning-artifacts/decision-request-2026-06-08-access-token-storage.md] (ratified disposition)
- [Source: docs/security/findings-register.md → note G]
- [Source: _bmad-output/implementation-artifacts/9-48-refresh-token-lifecycle-hardening.md → "Carried review nits" N2/N3]
- [Source: _bmad-output/implementation-artifacts/9-42-auth-token-session-hardening.md → F-004]
