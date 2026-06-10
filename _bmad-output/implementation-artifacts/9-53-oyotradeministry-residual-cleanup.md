# Story 9.53: oyotradeministry.com.ng residual cleanup — retire dead dual-domain references

Status: ready-for-dev

<!--
Authored 2026-06-10 by Bob (SM) via canonical *create-story (--yolo). EMERGENT
hygiene follow-up surfaced during the 2026-06-10 drift sweep. Story 9-9's F-024
origin-lock RETIRED oyotradeministry.com.ng to a 302 redirect → oyoskills.com
(docs/f-024-origin-lock-runbook.md §1). The domain is no longer a CF zone and
serves no app pages, but dead references to it linger in shipping config/code.
This is CODE HYGIENE ONLY — not security-urgent — but closes it once so we stop
revisiting (per Awwal's 2026-06-10 "don't keep coming back to this" directive).

KEEP the domain registered + 302-redirecting (BOT/transfer asset + reuse). Do
NOT delete the domain — only the dead code references.
-->

## Story

As the **developer maintaining the OSLRS codebase**,
I want **the dead `oyotradeministry.com.ng` references removed now that the domain is a 302 redirect (not a served domain)**,
so that **the config/code reflects the single-domain reality, no one is misled by stale dual-domain comments, and we never revisit origin-lock cleanup again**.

## Acceptance Criteria

1. **AC#1 — nginx CSP cleaned:** `infra/nginx/oslsr.conf` `connect-src` no longer lists `wss://oyotradeministry.com.ng` (both the server-level block ~line 72 AND the static-asset location block ~line 96 — they must stay in parity per Story 9-8). Only `wss://oyoskills.com` remains.
2. **AC#2 — CSP parity test updated:** `apps/api/src/__tests__/csp-parity.test.ts` (and any `PROD_WS_URLS` list / csp assertions) updated so the parity test still passes and no longer asserts the oyotradeministry WS origin. [Source: Story 9-8 parity rule]
3. **AC#3 — Stale comments retired:** Dual-domain "Phase 2 / oyotradeministry.com.ng" comments in `apps/api/src/app.ts` (CORS + trust-proxy notes, ~lines 110/126) and `apps/api/src/middleware/real-ip.ts` (~line 23) updated to reflect the redirect reality (origin serves oyoskills only; oyotradeministry is a CF-less 302 redirect).
4. **AC#4 — CORS_ORIGIN sanity:** Confirm `CORS_ORIGIN` handling no longer NEEDS `oyotradeministry.com.ng` (the redirect never makes same-origin XHR to the API). If the prod `.env` `CORS_ORIGIN` still lists it, note it as an operator cleanup item (do NOT change prod env from code). No code change if already absent.
5. **AC#5 — cf-analytics ministry stub removed:** `apps/api/scripts/cf-analytics.ts` drops the `['oyotradeministry.com.ng', zoneMinistry]` loop entry + the `CLOUDFLARE_ZONE_TAG_MINISTRY` plumbing (it's a redirect, never a zone). Keep the one-line comment explaining why there's no second zone.
6. **AC#6 — Web index.html comment:** The `apps/web/index.html` beacon comment referencing "oyotradeministry.com.ng visitors under the same Web Analytics site" (~line 151) updated — single beacon, single served domain.
7. **AC#7 — No behavioural change + green suite:** This is reference-only cleanup — NO functional change to request handling. Full API + web suites green; `tsc` + lint clean (0 warnings); nginx `-T` would still parse (CI deploy validates). Confirm via grep that no shipping-code (non-test, non-doc) `oyotradeministry` reference remains except deliberate historical notes.

## Tasks / Subtasks

- [ ] **Task 1 (AC: #1, #2) — nginx CSP + parity test**
  - [ ] 1.1: Remove `wss://oyotradeministry.com.ng` from BOTH CSP blocks in `infra/nginx/oslsr.conf` (server + asset location — keep them identical).
  - [ ] 1.2: Update `csp-parity.test.ts` / `PROD_WS_URLS` so the test asserts only `wss://oyoskills.com`; run it.
- [ ] **Task 2 (AC: #3, #4) — backend comments + CORS sanity**
  - [ ] 2.1: Update dual-domain comments in `app.ts` + `real-ip.ts` to the redirect reality.
  - [ ] 2.2: Verify `CORS_ORIGIN` parsing doesn't require oyotradeministry; if prod `.env` still lists it, add an operator note (don't mutate prod env from code).
- [ ] **Task 3 (AC: #5, #6) — tooling + web comment**
  - [ ] 3.1: Drop the ministry-zone stub + `CLOUDFLARE_ZONE_TAG_MINISTRY` from `cf-analytics.ts` (keep explanatory comment).
  - [ ] 3.2: Update the `index.html` beacon comment.
- [ ] **Task 4 (AC: #7) — verify**
  - [ ] 4.1: `grep -rn oyotradeministry apps/ infra/` → only deliberate historical/redirect notes remain (no live dual-domain wiring).
  - [ ] 4.2: Full suites + tsc + lint green.

## Dev Notes

### Scope discipline
- **Reference-only cleanup.** No request-handling change. The domain stays registered + 302-redirecting (asset + reuse). Do NOT touch DNS, the redirect, or the domain registration.
- **CSP parity is load-bearing:** the server block and the static-asset `location` block carry IDENTICAL CSP strings (an `add_header` inside a location disables inheritance — Story 9-8). Edit BOTH or the parity test fails. [Source: `infra/nginx/oslsr.conf:72,96`; Story 9-8]
- **Don't over-reach:** leave genuine historical notes (e.g. F-024 runbook, migration session docs) intact — they're the record of WHY. Only retire LIVE dual-domain wiring + misleading "Phase 2 dual-domain" comments in shipping code.

### Known reference sites (from 2026-06-10 drift sweep)
- `infra/nginx/oslsr.conf` lines ~22/24/68/72/96 (CSP wss + comments)
- `apps/api/src/app.ts` ~110/126 (CORS + trust-proxy comments)
- `apps/api/src/middleware/real-ip.ts` ~23 (comment)
- `apps/api/scripts/cf-analytics.ts` ~19/192/236 (ministry-zone stub + comments)
- `apps/web/index.html` ~151/156 (beacon comment)
- (Built `dist/` copies regenerate on build — ignore.)

### Project Structure Notes
- No new files. No deps. No migrations. No audit keys. nginx change deploys via CI (backup → `nginx -t` → reload).

### References
- [Source: docs/f-024-origin-lock-runbook.md — §1 de-point to 302 redirect]
- [Source: _bmad-output/implementation-artifacts/9-20-pre-viral-capacity-prep.md — Scope Corrections 2026-06-10]
- [Source: memory project-origin-lock-port80-residual]
- [Source: Story 9-8 — nginx CSP parity rule]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
