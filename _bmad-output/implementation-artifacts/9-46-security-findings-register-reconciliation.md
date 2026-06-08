# Story 9.46: Security Findings-Register Reconciliation (close the gaps the disposition-register audit surfaced)

Status: ready-for-dev

<!--
Authored 2026-06-07 by Bob (SM) via canonical *create-story --yolo workflow.
Source: docs/security/findings-register.md (notes A-D) + SCP-2026-06-06-security-r2-remediation.md.
Surfaced while building the auditor-facing register (2026-06-07): the register-audit found one
unhoused finding + three framing/cleanup nuances. Promoted to a numbered story per the project
pattern that real-data/audit-driven discoveries deserve canonical tracking (cf. 9-24/9-25).

HYGIENE / Low — NOT a launch gate. None of the four are the two Highs (F-011, F-024).
Heterogeneous BY DESIGN: 1 finding-disposition decision + 2 doc-corrections + 1 operator cleanup.
Each task is executor-tagged. Each task updates the relevant docs/security/findings-register.md
row (per the findings-register sync rule in project-context.md).
-->

## Story

As **the maintainer of the OSLSR security findings register**,
I want **the four reconciliation items the register audit surfaced resolved and recorded**,
so that **the in-repo register is complete and accurate for the next audit — no finding unhoused, no severity mis-stated, no nuance lost**.

## Acceptance Criteria

1. **AC#1 — F-001 disposition `[decision]` — RESOLVED 2026-06-07: FIX ELECTED → moved to Story 9-47.** Awwal elected to fix F-001 (CSP `style-src 'unsafe-inline'`) properly via nonce/hash rather than Accept-Low. F-001 is **carved out of 9-46** into **Story 9-47 (CSP style-src nonce/hash hardening, spike-first)**; 9-46 no longer owns F-001. Register F-001 row → `In-story 9-47`. This AC is closed-by-redirect.
2. **AC#2 — F-007 severity prose aligned `[doc]`.** Correct any "High-by-product-decision" wording for F-007 in `9-41-marketplace-reveal-accountability-hardening.md` + `sprint-change-proposal-2026-06-06-security-r2-remediation.md` to the assessor-calibrated **Medium** (the register is canonical on severity; F-007 was downgraded High→Medium after open-by-design was confirmed). No scope/behaviour change to 9-41 itself.
3. **AC#3 — NODE_ENV / F-005 clarified `[doc + operator-capture]`.** Update `9-45` AC#1 framing so it states **F-005 is LATENT** (NODE_ENV is effective=`production` at runtime — injected by the pm2 start-wrapper; assessor confirmed dev-routes-404 + CSP-enforced — but it is **uncommitted / not in `.env`**). Ensure the **F-026 operator step** (commit `NODE_ENV=production` to the deployed env + run `node dist` not `tsx`) is explicitly captured as an operator action (9-9 subtask or `docs/f-024-origin-lock-runbook.md` adjacency). Update register rows F-005 + F-026. The fail-closed-boot code task in 9-45 stays (defense), reframed as latent-not-active.
4. **AC#4 — F-006 host cleanup `[operator]`.** Delete `/root/oslrs/.env.bak.*` on the VPS host via Tailscale (the repo git-history is already verified clean — this is the host-side remnant only the assessment flagged). Update register row F-006 to reflect host-cleanup complete. *(Optional: run `gitleaks`/`trufflehog` as belt-and-braces, record result.)*
5. **AC#5 — Register sync + integrity `[doc]`.** Every touched finding (F-005, F-006, F-007, F-026 + the AC#6 note) row in `docs/security/findings-register.md` is updated. Beyond AC#6's dead-column migration, this story is doc/operator/decision only (F-001 was carved to 9-47). Confirm `epics.md` Story Index + `sprint-status.yaml` carry 9-46.
6. **AC#6 — Drop dead `users.emailVerificationToken` column `[dev]`.** No reader/writer post-9-12 (email verification superseded by magic-link; surfaced by the F-011 class-sweep 2026-06-07). Drop via an idempotent migration (`DROP COLUMN IF EXISTS email_verification_token`) + remove from `db/schema/users.ts`. **Test:** schema smoke (column absent); full suite green. Update register note F.

## Tasks / Subtasks

- [x] **Task 1 — F-001 disposition: FIX ELECTED → carved to Story 9-47 (AC: #1)** `[decision]`
  - [x] 1.1 Decision 2026-06-07: Awwal elected the fix (not Accept-Low); F-001 moved to 9-47 (spike-first); register row → `In-story 9-47`. 9-46 no longer owns F-001.
- [ ] **Task 2 — F-007 severity prose → Medium (AC: #2)** `[doc]`
  - [ ] 2.1 Grep 9-41 + the security SCP for "High-by-product-decision"/High framing of F-007; correct to Medium.
- [ ] **Task 3 — NODE_ENV/F-005 latent clarification + F-026 operator capture (AC: #3)** `[doc + operator]`
  - [ ] 3.1 Reword 9-45 AC#1 (F-005 latent; NODE_ENV runtime-effective-but-uncommitted).
  - [ ] 3.2 Capture F-026 operator step (commit NODE_ENV=production + node dist) in 9-9 / runbook; update register F-005 + F-026.
- [ ] **Task 4 — F-006 host `.env.bak.*` deletion (AC: #4)** `[operator]`
  - [ ] 4.1 Tailscale: `rm -f /root/oslrs/.env.bak.*` (verify with `ls` first); update register F-006.
- [ ] **Task 5 — Register sync + close (AC: #5)** `[doc]`
  - [ ] 5.1 Verify all rows updated; confirm Story Index + sprint-status carry 9-46; flip status when complete.
- [ ] **Task 6 — Drop dead `emailVerificationToken` column (AC: #6)** `[dev]`
  - [ ] 6.1 Idempotent migration `DROP COLUMN IF EXISTS email_verification_token` + remove from `db/schema/users.ts`.
  - [ ] 6.2 Schema smoke + full suite green; update register note F.

## Dev Notes

- **Heterogeneous by design** — this is a reconciliation-tracking story, not a coherent feature. Each task is tagged `[dev/doc/operator/decision]`; do not expect a single PR. Tasks 2/3/5 are doc; Task 4 is operator (Tailscale); Task 1 is a decision.
- **F-001 decision RESOLVED 2026-06-07:** Awwal elected the **FIX** (not Accept-Low) → carved to **Story 9-47** (CSP style nonce/hash, spike-first; outcome may be partial). 9-46 no longer owns F-001.
- **No launch-gate impact.** None of the four are the two Highs; the Phase-2 🚦 gate is unaffected.
- **Maintenance rule:** every change here updates `docs/security/findings-register.md` rows in the same change.

### References
- [Source: docs/security/findings-register.md] (notes A–D + rows F-001/F-005/F-006/F-007/F-026)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-security-r2-remediation.md]
- [Source: _bmad-output/implementation-artifacts/9-41-marketplace-reveal-accountability-hardening.md] (F-007 severity prose)
- [Source: _bmad-output/implementation-artifacts/9-45-platform-access-control-boot-hardening.md] (F-005 AC#1) · [Source: docs/f-024-origin-lock-runbook.md] (F-026 operator adjacency)

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
