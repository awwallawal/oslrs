# Story 9.47: CSP `style-src` nonce/hash hardening (F-001) — spike-first

Status: ready-for-dev

<!--
Authored 2026-06-07 by Bob (SM) via canonical *create-story --yolo workflow.
Source: docs/security/findings-register.md (F-001, note A) — carved OUT of 9-46 after Awwal
ELECTED the fix over Accept-Low (2026-06-07). F-001 = R1 finding "CSP allows style-src
'unsafe-inline'", Low / defense-in-depth.

SEVERITY: Low — NOT a launch gate (post-Highs hardening; the Phase-2 🚦 gate is unaffected).

SPIKE-FIRST + HONEST SCOPE: this is deliberately NOT scoped as "remove 'unsafe-inline'."
Two hard constraints (see AC#1) mean the achievable target is uncertain until the spike runs,
and a PARTIAL hardening (with a documented residual) is an acceptable outcome.
-->

## Story

As **the custodian of the OSLSR CSP defense-in-depth posture**,
I want **`style-src` hardened so inline styles are nonce/hash-gated (or as tightly contained as the UI stack allows)**,
so that **an HTML/markup-injection foothold elsewhere cannot leverage inline styles for CSS data-exfiltration or UI-redress — closing the most common way a strong CSP is quietly defeated**.

## Acceptance Criteria

1. **AC#1 — SPIKE: determine the achievable target (resolve two hard constraints).** Audit every inline-style source — **Radix/shadcn** components, **Recharts**, **react-leaflet**, and **Tailwind v4** output — and document what is actually removable. The spike MUST resolve and record decisions for:
   - **(a) Element vs attribute:** CSP nonces/hashes cover `<style>`/`<link>` **elements**, NOT inline `style="…"` **attributes** (governed by `style-src-attr`, which cannot be nonced). Radix/shadcn set inline style attributes heavily → a full drop of `'unsafe-inline'` likely breaks the UI. Likely realistic target: **hash/nonce `<style>` + tighten `style-src`, but RETAIN `style-src-attr 'unsafe-inline'`** (partial, documented residual).
   - **(b) nginx static header vs per-response nonce:** the static HTML CSP is a **static `add_header` string** in `infra/nginx/oslsr.conf` — a **per-response nonce cannot live there**; **hashes are static and CAN**. So lean **hash-based** for nginx-served HTML, OR move HTML CSP to the app layer / nginx `sub_filter`. Spike decides.
   - **Output:** a written decision in Dev Notes — full-drop vs partial-with-residual — with the rationale; this gates AC#2's implementation shape.
2. **AC#2 — Implement the achievable hardening, Helmet + nginx in lockstep.** Apply the AC#1 target to BOTH the Helmet CSP (`apps/api/src/app.ts`) AND the nginx CSP (`infra/nginx/oslsr.conf`); `csp-parity.test.ts` MUST stay byte-equivalent and green (edit one → edit the other). If full drop is infeasible (per AC#1), implement the partial: hash the known `<style>` block(s) + tighten `style-src`, retain `style-src-attr 'unsafe-inline'` with the residual documented.
3. **AC#3 — Record outcome in the register.** Update `docs/security/findings-register.md` F-001 row per the maintenance rule: `Fixed-in-<commit>` if `'unsafe-inline'` fully dropped, OR `Accepted-residual` (with rationale: which inline-style source forced retention) if `style-src-attr 'unsafe-inline'` is retained.
4. **AC#4 — No UI regression.** Manual + automated check that CSP changes don't break rendering: Radix dialogs/dropdowns/popovers, Recharts charts, react-leaflet maps, and shadcn components render correctly with **zero CSP violations** in the console for normal flows (use the existing `/api/v1/csp-report` endpoint to confirm no new reports in a smoke pass).
5. **AC#5 — Tests + zero regression.** Full web + API suites green; `csp-parity.test.ts` green; document the net outcome (full vs partial) + any retained residual. No weakening of the other CSP directives (`script-src`, `frame-ancestors 'self'`, etc.).

## Tasks / Subtasks

- [ ] **Task 1 — SPIKE inline-style audit + target decision (AC: #1)**
  - [ ] 1.1 Grep/audit Radix/shadcn, Recharts, react-leaflet, Tailwind v4 for inline `<style>` vs `style=` attribute usage.
  - [ ] 1.2 Decide element strategy (hash vs nonce) given the nginx static-header constraint (lean hash for static HTML).
  - [ ] 1.3 Write the achievable-target decision (full-drop vs partial+residual) in Dev Notes.
- [ ] **Task 2 — Implement hardening (Helmet + nginx lockstep) (AC: #2)**
  - [ ] 2.1 Apply hashes/nonce + tightened `style-src` to `app.ts` Helmet CSP.
  - [ ] 2.2 Mirror byte-equivalent into `infra/nginx/oslsr.conf`; keep `csp-parity.test.ts` green.
- [ ] **Task 3 — UI regression + CSP-violation smoke (AC: #4)**
  - [ ] 3.1 Verify Radix/charts/maps render; zero new `/api/v1/csp-report` entries on normal flows.
- [ ] **Task 4 — Register + suites (AC: #3, #5)**
  - [ ] 4.1 Update register F-001 row (Fixed-in-<hash> or Accepted-residual + rationale).
  - [ ] 4.2 Full web + API suites + csp-parity green; document outcome.

## Dev Notes

- **Honest framing:** the most likely outcome is **partial** — hash the `<style>` block(s) + tighten `style-src`, but **retain `style-src-attr 'unsafe-inline'`** because Radix/shadcn set inline style *attributes* (which no nonce/hash can gate). That is still a real improvement (closes `<style>`-element injection) and is an **acceptable, documented residual** — do NOT force a full drop that breaks the component libraries.
- **nginx constraint:** the static `add_header` CSP can't carry a per-response nonce → **prefer hashes** (static) for the nginx-served HTML; nonces would require `sub_filter`/SSI or moving HTML CSP to the app layer (heavier — only if the spike justifies it).
- **csp-parity discipline:** `csp-parity.test.ts` asserts the Helmet directive object stays byte-equivalent to the nginx string — both must change together or CI fails (Story 9-8 contract).
- **Not a gate:** Low/defense-in-depth; schedule post-Highs. F-001 was an R1 finding with no observed direct exploit.

### References
- [Source: docs/security/findings-register.md] (F-001 row + note A)
- [Source: C:\Users\DELL\Desktop\security-assessment\findings\F-001-csp-style-unsafe-inline.md] (original finding + suggested fix)
- [Source: infra/nginx/oslsr.conf] (static CSP add_header) · [Source: apps/api/src/app.ts] (Helmet CSP) · [Source: apps/api/src/.../__tests__/csp-parity.test.ts] (parity contract)

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
