# Story 13-31: Restore the CI dependency-audit gate after npm retired the legacy audit endpoint

Status: done (launch-unblock) — post-launch remediation backlog tracked below (ignores expire 2026-08-15)

<!-- Authored 2026-07-16, EMERGENT + LAUNCH-BLOCKING. The 13-28 push went green through the pre-push suite but the CI/CD `lint-and-build` job hard-failed at the `pnpm audit --audit-level=high --prod` step — npm retired (HTTP 410 Gone, 2026-07-15) the legacy audit endpoint pnpm calls, so `deploy` was skipped. This blocks EVERY deploy, including launch, not just 13-28. Fixed directly (not via a separate dev CLI) because it is on the critical launch path. -->

## Story
As **the team trying to ship the launch deploy**,
I want **the CI dependency-vulnerability gate to work without depending on npm's retired audit endpoint**,
so that **every push to main can build and deploy again, while still failing on any genuinely new production vulnerability.**

## Context & Evidence
- **Trigger (CI run 29437801032, 2026-07-15):** `lint-and-build` failed in 31s at the "Security audit (production dependencies)" step with
  `ERR_PNPM_AUDIT_BAD_RESPONSE  The audit endpoint (…/-/npm/v1/security/audits) responded with 410: "This endpoint is being retired. Use the bulk advisory endpoint instead."` → `deploy` skipped (`deploy in 0s`). The 13-28 commit itself was fine and already on `origin/main`; the code never ran because audit dies first.
- **Root cause = external + permanent.** npm retired both legacy quick-audit endpoints (`/-/npm/v1/security/audits[/quick]`); HTTP **410 Gone** is intentional/permanent (brownout → full retirement 2026-07-15). npm's own docs point to the **bulk advisory endpoint** (`/-/npm/v1/security/advisories/bulk`).
- **A pnpm upgrade does NOT fix it.** `pnpm audit` is broken across the **entire 9.x + 10.x line** — no released pnpm uses the bulk endpoint yet (tracked open: **pnpm/pnpm#11265**). `npm audit` works (npm CLI already migrated) but this repo has no `package-lock.json`. So "bump pnpm" is a dead end; the gate had to move to a tool that reads `pnpm-lock.yaml` against a live DB.
- **Why the old gate had been green:** `pnpm audit --audit-level=high --prod` scoped to **production** deps at **high+** severity. The team's posture (documented in `package.json` `pnpm.comments`) already excludes the dev/build/test-tooling subtree (Story 9-54 structural fixes + an `accepted-risks` list: xlsx, serialize-javascript, ajv, phin).

## What was done (launch-unblock — implemented 2026-07-16)
1. **Replaced the audit step with SHA-pinned osv-scanner** (`.github/workflows/ci-cd.yml`): `google/osv-scanner-action/osv-scanner-action@9a498708959aeaef5ef730655706c5a1df1edbc2 # v2.3.8`, scanning `--lockfile=pnpm-lock.yaml --config=osv-scanner.toml`. Reads OSV directly — **no dependency on the retired npm endpoint** — and **HARD-fails** on any vulnerability not explicitly grandfathered. Docker action → runs on the existing `ubuntu-24.04` runner.
2. **Fixed 4 findings at the source via bounded overrides** (`package.json` `pnpm.overrides`, per the team's `>=x <nextMajor` policy): `vite >=7.3.5 <8` (also fixed the pre-existing unbounded `>=7.3.2` policy violation; clears GHSA-fx2h-pf6j-xcff HIGH + GHSA-v6wh-96g9-6wx3), `form-data >=4.0.6 <5` (GHSA-hmw2-7cc7-3qxx HIGH 8.7), `follow-redirects >=1.16.0 <2` (GHSA-r4q5-vmmm-2653). Lockfile regenerated; resolved to vite@7.3.6 / form-data@4.0.6 / follow-redirects@1.16.0.
3. **Grandfathered the residual 17 dev-tree findings** in `osv-scanner.toml` (16 unique GHSA IDs; postcss counted for two versions), each with per-ID rationale + `ignoreUntil = 2026-08-15`. **Every grandfathered package was verified NOT in the production tree** (`pnpm why -r --prod <pkg>` empty, 2026-07-16) — so the ignore set faithfully reproduces the prior `--prod` posture (no high/critical in *prod* deps), NOT a blanket mute. The Critical (turbo 9.8) and the two no-npm-fix xlsx HIGHs are dev/script-only build tooling.

### Verification (local, 2026-07-16)
- `osv-scanner --config=osv-scanner.toml --lockfile=pnpm-lock.yaml` → **exit 0** (17 filtered, 0 unfiltered). A raw scan (no config) → exit 1 with the 17, proving the gate still bites on anything un-grandfathered.
- Web production build on vite 7.3.6 → clean (`✓ built`, PWA generated, bundle-check OK).
- YAML parse of `ci-cd.yml` valid; OSV step resolves both scan-args.

## Post-launch remediation backlog (burn down before ignores expire 2026-08-15)
Each `osv-scanner.toml` ignore **expires 2026-08-15** → CI re-fails until the item is fixed or re-justified. Ordered by severity:
- [ ] **turbo 1.13.0 → 2.x** (GHSA-3qcw-2rhx-2726 CRITICAL 9.8 + GHSA-hcf7-66rw-9f5r) — monorepo build orchestrator; major bump, needs turbo.json schema migration + CI re-validation. Deferred because it's dev-only and mid-launch-risky.
- [ ] **xlsx / SheetJS** (GHSA-4r6h-8v6p-xvw6 7.8 + GHSA-5pgg-2g8v-p4x9 7.5) — **no npm fix exists**; remediation = the SheetJS CDN/tarball build, or drop xlsx (dev/script-only one-time xlsform migration; exceljs covers runtime exports).
- [ ] **Dev-tree patch bumps** (transitive; via override or parent bump): flatted 3.4.2, linkify-it 5.0.1, serialize-javascript 7.x, esbuild >=0.25 consumer, postcss 8.5.10, js-yaml 4.2.0, markdown-it 14.2.0, ajv 6.14.0, @babel/core 7.29.6, phin 3.7.1.

## Acceptance Criteria
1. **AC1 — Pipeline unblocked.** `lint-and-build` passes the security step and `deploy` runs. (Verified by the 13-31 push landing green.)
2. **AC2 — Real gate preserved.** The audit step HARD-fails on any NEW vulnerability outside the grandfather list (osv-scanner exits non-zero on unfiltered findings — verified locally).
3. **AC3 — No prod exposure hidden.** Every grandfathered ID is confirmed dev-only (`pnpm why --prod` empty); nothing in the production tree is silently muted.
4. **AC4 — Self-healing / forced re-triage.** Ignores carry `ignoreUntil = 2026-08-15`; the backlog above burns them down post-launch. If pnpm ships a bulk-endpoint fix (#11265), a future story may reassess osv-scanner vs pnpm-audit.
5. **AC5 — SHA-pinned action.** The third-party action is pinned to a full commit SHA (supply-chain hygiene, matching the repo's pnpm/action-setup pinning).

## Dev Agent Record
- **Files:** `.github/workflows/ci-cd.yml` (audit step), `osv-scanner.toml` (NEW), `package.json` (3 bounded overrides + comment), `pnpm-lock.yaml` (regenerated), this story, `sprint-status.yaml`.
- **Not a product-code change** — CI + dependency-resolution only; no app/runtime behaviour change, no DB/prod-data change.

### References
- [Source: CI run 29437801032 (2026-07-15) — ERR_PNPM_AUDIT_BAD_RESPONSE 410 in lint-and-build]
- [Source: pnpm/pnpm#11265 — pnpm audit broken on 9.x + 10.x (legacy endpoint retired)]
- [Source: npm bulk advisory endpoint — /-/npm/v1/security/advisories/bulk (https://api-docs.npmjs.com/#tag/Audit)]
- [Source: google/osv-scanner-action v2.3.8 @ 9a498708959aeaef5ef730655706c5a1df1edbc2]
- [Source: package.json pnpm.comments — Story 9-54 --prod scoping + accepted-risks; override-policy (bounded to major)]
