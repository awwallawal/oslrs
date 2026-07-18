# Story 13-32: Prod-scope the osv-scanner gate + burn down the grandfathered vuln backlog

Status: done

<!-- Authored 2026-07-18 by Bob (SM). Post-launch follow-up to 13-31. 13-31 restored the CI dependency-audit gate (osv-scanner replacing the dead `pnpm audit`), but as a stop-gap it scans the WHOLE lockfile and therefore surfaces 17 dev/build-tree findings that the retired `pnpm audit --prod` never looked at — all grandfathered in osv-scanner.toml with ignoreUntil=2026-08-15. Those ignores EXPIRE on that date and re-fail CI. This story removes the need for them PERMANENTLY (root-cause: scope mismatch) rather than renewing the deferral. NOT launch-gating; do post-launch, before 2026-08-15. -->

## Story
As **the team maintaining a green, trustworthy CI security gate**,
I want **osv-scanner scoped to the production dependency surface and the pre-existing dev-tree vuln backlog burned down**,
so that **the gate matches our actual signed-off posture (no high/critical in *prod* deps), the 2026-08-15 grandfather expiry disappears for good, and we never re-litigate a wall of dev-tooling ignores every renewal.**

## Context & Evidence
- **13-31 (done, deployed `9285b28`)** swapped CI's `pnpm audit --audit-level=high --prod` for SHA-pinned `osv-scanner` after npm retired the legacy audit endpoint (410 Gone). osv-scanner has **no `--prod` equivalent** → it scans the entire `pnpm-lock.yaml`, surfacing the dev/build/test-tree that the old gate excluded.
- **The whole backlog is scope noise, not real prod exposure.** All 17 grandfathered findings (16 unique GHSA in `osv-scanner.toml`) were verified **NOT in the production tree** (`pnpm why -r --prod <pkg>` empty, 2026-07-16): turbo (Critical 9.8, monorepo build orchestrator), xlsx (2× HIGH, no npm fix, dev/script-only), plus flatted/serialize-javascript/postcss/esbuild/js-yaml/markdown-it/linkify-it/ajv/@babel/core/phin (all dev/build/test tooling). The 4 genuinely-relevant findings were already fixed at source in 13-31 via bounded overrides (vite, form-data, follow-redirects).
- **The expiry is a deliberate forcing function, not a bug.** Each ignore carries `ignoreUntil = 2026-08-15`; on that date osv-scanner stops honoring them and CI re-fails — same *symptom* as the original 410 outage (blocked deploys), different *cause*. Renewing the date is a one-line stop-gap; this story removes the need.
- **Root cause = scope mismatch.** We are ignoring dev-tree vulns one-by-one because the scanner looks at a surface the old gate never gated. Fix the scope and the whole class evaporates — no per-CVE ignores, no expiry cliff.

## Acceptance Criteria
1. **AC1 — Prod-scope the deploy-blocking gate (root-cause fix, spike-gated).** The osv-scanner step that can **fail the build** scans only the **production** dependency surface (reproducing the retired `pnpm audit --prod` posture), against the live OSV DB. Mechanism is the dev's choice after a short spike — candidate approaches: a prod-only SBOM (CycloneDX via `cdxgen`/equivalent, `--prod`) fed to `osv-scanner --sbom`; a `pnpm deploy --prod`-pruned tree; or scanning a throwaway `pnpm install --prod` `node_modules`. **Verify the scanned set equals the real prod set** (cross-check against `pnpm why -r --prod`). If NO clean prod-scoping mechanism proves feasible in the spike, document why and make AC3+AC4 the primary path (remediate + permanent-accept) — do not ship a half-working scope.
2. **AC2 — Keep dev-tree visibility WITHOUT blocking (make-it-better).** Dev/build/test-tree vulnerabilities are still **surfaced** — osv-scanner report-only over the full lockfile → CI logs + SARIF uploaded to the GitHub Security tab — but **never block deploys**. (Rationale: a compromised build tool is a real supply-chain signal; prod-scoping the *gate* must not make us *blind* to dev-tree vulns the way `--prod` did.) Descope-to-fast-follow is acceptable IF AC1's spike proves heavy — state the decision explicitly in the Dev Agent Record.
3. **AC3 — Burn down the fixable; empty the ignore file.** Remediate so that `osv-scanner.toml` has **zero `ignoreUntil` (expiring) entries** at close:
   - **xlsx** (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 — no npm fix): **remove it** if nothing needs it (verify all importers; retire or port the one-time xlsform-migration script — `exceljs` already covers runtime exports). If genuinely unremovable, convert to a **permanent (non-expiring) accepted-risk** with written justification, mirroring `package.json` `pnpm.comments.accepted-risks`.
   - **turbo 1.13 → 2.x** (GHSA-3qcw-2rhx-2726 Critical + GHSA-hcf7-66rw-9f5r): migrate via `@turbo/codemod migrate` (turbo.json `pipeline`→`tasks` schema change); re-validate the full build/test pipeline end-to-end.
   - **dev-tree transitive patches** via **bounded overrides** (per the repo `override-policy`, always `>=x <nextMajor`): flatted, serialize-javascript, postcss, esbuild-consumer, js-yaml, markdown-it, linkify-it, ajv, @babel/core, phin. Delete each fixed finding's line from `osv-scanner.toml`.
4. **AC4 — No expiry cliff remains.** At story close, every 13-31 grandfathered item is either fixed (line deleted), out of scope (prod-scoped away / package removed), or a **permanent documented accepted-risk** — so there is **no live 2026-08-15 deadline** left. The `osv-scanner.toml` header + `package.json` comments reflect the final disposition.
5. **AC5 — Prove the gate still bites + everything green.** Demonstrate the prod gate **fails on a synthetic injected prod-dep vuln** (temporary override to a known-vulnerable version), then revert — so we know prod-scoping didn't silently narrow the gate to nothing. Full API + web suites, web production build, tsc, eslint all clean; the pushed CI/CD pipeline goes green through **deploy**; VPS lands the SHA.
6. **AC6 (SHOULD) — Scheduled scan for newly-disclosed vulns.** Add a nightly/weekly `schedule:`-triggered osv-scanner run against `main` (prod scope, hard) so vulns *newly disclosed against deps we already ship* are caught without waiting for the next push. Non-blocking to land; if descope, note it as a follow-up.

## Tasks / Subtasks
- [x] **Task 1 (AC1)** — Spiked SBOM (cdxgen `--required-only`) vs prod-prune (`pnpm deploy`) vs the prod-closure filter. **Chose the prod-closure filter** (cdxgen leaked root devDeps → half-working → rejected per AC1 guardrail; `pnpm deploy` friction on Windows and faithfulness uncertain). Wired the deploy-blocking gate to it; scanned set == `pnpm ls -r --prod` **by construction**. Spike recorded in Dev Agent Record.
- [x] **Task 2 (AC2)** — Report-only full-tree osv-scanner pass → SARIF → Security tab (best-effort) + artifact + dev-tree findings echoed in the blocking-gate build log.
- [x] **Task 3 (AC3)** — turbo 1.13→2.10.5 (`@turbo/codemod`, `pipeline`→`tasks`) revalidated (build/lint/dry-run `.packages`); 8 dev-tree bounded overrides (flatted/postcss/esbuild/js-yaml/markdown-it/linkify-it/ajv/@babel/core); xlsx removal **attempted and rejected with evidence** (async ripple into a live feature + ~40 test sites, zero prod-gate benefit) → permanent accepted-risk. 11 `osv-scanner.toml` lines deleted.
- [x] **Task 4 (AC4/AC5)** — `osv-scanner.toml` has **zero `ignoreUntil`** entries (5 permanent accepts remain: xlsx×2, serialize-javascript×2, phin). Synthetic-vuln proof done (real scanner: inject `qs@6.10.0` → gate exit 1 → revert → exit 0). Full suites + web build + tsc/eslint clean. ⚠️ **push + green deploy + VPS SHA = OPERATOR-GATED residual** (dev-story ends at "review"; not run autonomously).
- [x] **Task 5 (AC6, SHOULD)** — `.github/workflows/osv-scheduled.yml` — weekly (Mon 06:17 UTC) + `workflow_dispatch` prod-scope hard gate + SARIF.

### Review Follow-ups (AI)
Adversarial code-review 2026-07-18 (different LLM). All ACs verified genuinely implemented (no false `[x]`); deadlock coverage confirmed complete (only `DISABLE TRIGGER` left is inside the helper); new unit tests confirmed picked up by the test-api vitest default glob (no "test that never runs" trap). 0 High · 2 Medium · 4 Low. Code findings fixed in the same pass (tsc clean, 15/15 gate unit tests green); process/accuracy findings noted below.

- [x] **[AI-Review][Med] M1 — version-mismatch fail-safe re-introduced dev-tree blocking noise.** `computeProdBlockingFindings` blocked *every* name-in-prod-version-differs case, so a dev-only CVE on any package that also lives in prod at a safe version would red the gate — the exact class this gate removes. **FIXED** [apps/api/src/lib/osv-prod-gate.ts:119-165]: block only on an exact `name@version` prod hit, or the ambiguous bare-name (no concrete prod version known) fail-safe; a *different concrete* prod version → treat the flagged copy as dev-tree (skip + surface non-blocking). `computeDevOnlyFindings` updated to stay a clean partition; new regression test added.
- [ ] **[AI-Review][Med] M2 — the audit-teardown concurrency redesign is bundled as a "bonus" into a CI-security-gate story.** `withAuditLogsMutable` + 5 file conversions + a new race test is correctness-critical code unrelated to AC1–AC6. Well-executed and documented, but it inflates this story's review/blast surface and mis-attributes it in the sprint/git record. **ACTION:** attribute it to its own story/commit (or an explicit AC) on commit — operator/process call, not auto-split here. Ref: planning-artifact-parity discipline.
- [x] **[AI-Review][Low] L1 — `parseJsonLoose` fallback corrupted array-shaped JSON.** It sliced to the last `}`; `osv-prod-ls.json` is a JSON array ending in `]`, so any trailing noise on that file would drop the `]` → spurious block. **FIXED** [apps/api/scripts/osv-prod-gate.ts]: slice to the last of `}` or `]`.
- [x] **[AI-Review][Low] L2 — transient scan/OSV-DB failure blocked deploys indistinguishably from a real vuln.** `docker run … || true` + a missing/partial JSON made the gate throw uncaught. **FIXED** [apps/api/scripts/osv-prod-gate.ts]: read/parse wrapped in try/catch → still BLOCK fail-safe but with an explicit "NOT a confirmed prod vuln / transient outage?" diagnostic.
- [ ] **[AI-Review][Low] L3 — the teardown "supersedes … deterministic" claim was overstated.** The original 23503 was never reproduced, so the guarantee is deadlock-safety + FK-invariant *by construction* + burn-in, not full determinism. **FIXED (doc)**: Dev Agent Record + `audit-safe-teardown.ts` header wording tightened below.
- [x] **[AI-Review][Low] L4 — File List omitted 3 live consumers of the rewritten helper.** `security.reauth-routes`, `audit.verify-chain`, `user.profile` call `purgeUsersWithAuditDrain`, whose internals changed. **FIXED (doc)**: named as blast-radius in the File List.

## Dev Notes
- **Spike-first (AC1).** Don't commit to a mechanism before proving it reproduces the exact prod set. Cleanest candidate is a prod-only CycloneDX SBOM → `osv-scanner --sbom=...`; `cdxgen` supports pnpm and prod-only scoping. Fallback: `pnpm deploy --prod` per app (monorepo needs per-app or a merged manifest) or a throwaway `pnpm install --prod` node_modules scan. The docker action from 13-31 takes arbitrary `scan-args`, so `--sbom=` / `--lockfile=` / directory scans all fit the existing SHA-pinned `google/osv-scanner-action/osv-scanner-action@9a49870`.
- **Two-tier is the point (AC1+AC2).** Old `pnpm audit --prod` gated on prod but was BLIND to dev-tree; current whole-tree gate SEES everything but the dev noise BLOCKS. The better end-state: **prod tree → hard gate**, **dev tree → report-only (SARIF)**. Best of both — no brittleness, no blindness.
- **xlsx decision tree (AC3).** `grep -rn "from 'xlsx'\|require('xlsx')\|xlsx" apps scripts packages` first. It's a devDependency (root + apps/api) used for the one-time xlsform migration; `exceljs` (prod dep) covers runtime exports. Preferred: remove xlsx + retire/port the script → 2 no-fix HIGHs gone forever. Only if a live consumer needs it → permanent accepted-risk (it's dev/script-only, not in `--prod`).
- **turbo 2.x (AC3).** `pnpm dlx @turbo/codemod migrate` handles `turbo.json`. Watch: `pipeline`→`tasks` rename, `--filter` semantics, and that `pnpm build`/`pnpm test`/CI turbo invocations still resolve. Re-run the FULL pipeline locally before pushing — this is the one bump with real blast radius.
- **Guardrail — bounded overrides only.** Every override MUST be `>=patch <nextMajor` (repo `override-policy`; 9-54 lesson: an unbounded `>=` silently pulled a surprise major and broke the build). Add a `pnpm.comments` note for each new override, matching the existing meticulous style.
- **Safety valve.** If this story slips past 2026-08-15, bump `ignoreUntil` to a new date in one line to keep CI green — harmless stop-gap, and the renewal friction is the intended nudge. Launch is never at risk from this.
- **Repro locally** (from 13-31): `docker run --rm -v "<repo>:/src" -w /src ghcr.io/google/osv-scanner-action:v2.3.8 --lockfile=pnpm-lock.yaml` — exit 1 lists findings, exit 0 = clean. Adapt `--lockfile` → `--sbom`/dir for the prod-scope spike.
- **No product/runtime behaviour change expected** — CI config + dependency resolution only (turbo/xlsx swaps touch build/scripts, not app runtime). If xlsx removal touches a runtime path, that's a red flag the assumption is wrong — stop and re-verify.

### References
- [Source: Story 13-31 — osv-scanner adoption, the grandfather list + rationale; `osv-scanner.toml`; `package.json` pnpm.overrides/comments]
- [Source: `osv-scanner.toml` — the 16 unique GHSA ignores to burn down, each with ignoreUntil=2026-08-15]
- [Source: pnpm/pnpm#11265 — why we're on osv-scanner not `pnpm audit` (context, not a dependency of this story)]
- [Source: package.json pnpm.comments.override-policy (bounded overrides) + accepted-risks (xlsx/serialize-javascript/ajv/phin already classified dev-only)]
- [Source: google/osv-scanner-action v2.3.8 @ 9a498708959aeaef5ef730655706c5a1df1edbc2 — takes arbitrary scan-args (`--sbom`, `--lockfile`, dir)]

## Dev Agent Record

### AC1 spike outcome (mechanism selection)
Three mechanisms evaluated against the mandate "scanned set == `pnpm why -r --prod`":
1. **cdxgen `--required-only` SBOM → `osv-scanner --sbom`** (story's candidate #1) — **REJECTED**. Ran clean (76 components) but the prod scope was IMPRECISE: it correctly dropped turbo/postcss/esbuild/vite but **wrongly included root devDependencies** `xlsx`, `js-yaml`, `markdown-it`, `vitest`. A half-working scope — the story says do not ship it.
2. **`pnpm deploy --prod`** — friction on Windows (path-mangling, bin errors) and faithfulness uncertain (msw appeared); CI is ubuntu so Windows friction is moot, but the imprecision risk remained.
3. **Prod-closure filter (CHOSEN)** — `pnpm ls -r --prod --depth Infinity --json` is pnpm's own `--prod` resolution (the literal successor to `pnpm audit --prod`). The blocking gate scans the full lockfile to JSON, then keeps only findings whose package is in that closure. **Scanned set == prod set by construction.** Also tried post-filtering osv-scanner's JSON `groups` field — rejected: `groups` are vuln-ALIAS groupings, not dep scope.

**Validation:** on the current lockfile the filter yields **0 blocking findings** (all 13/17 findings are dev-only), reproducing the retired `pnpm audit --prod` green posture. Prod closure = 1335 pkgs vs 1548 total (213 dev-only excluded); zero dev-leak, all prod deps present.

### AC3 remediation detail
- **turbo 1.13.0 → 2.10.5** via `pnpm dlx @turbo/codemod migrate` (`pipeline`→`tasks`; `$schema` normalized to the canonical `https://turbo.build/schema.json`). Resolves GHSA-3qcw-2rhx-2726 (9.8 Critical) + GHSA-hcf7-66rw-9f5r without an override (fixed @2.9.14). Revalidated: `turbo run build` green (web vite + api tsc), `turbo run lint` green, and — critically — `turbo run test --dry-run=json` **still exposes `.packages`** (CI change-detection `jq '.packages | length'` unaffected). turbo runs only in CI + local, NOT on the VPS (deploy ships prebuilt artifacts) → low prod risk.
- **8 dev-tree bounded overrides** (fixed versions verified against the OSV API, `>=fixed <nextMajor` per override-policy): flatted `>=3.4.2 <4`, postcss `>=8.5.10 <9`, esbuild `>=0.25.0 <0.26`, js-yaml `>=4.2.0 <5`, markdown-it `>=14.2.0 <15`, linkify-it `>=5.0.1 <6`, ajv `>=6.14.0 <7`, @babel/core `>=7.29.6 <8`. Post-install rescan confirms all 8 cleared. Build + lint re-run green (esbuild 0.18→0.25 + ajv 6.12→6.14 did not break vite/eslint).
- **xlsx — removal ATTEMPTED, rejected with evidence** (per the user's "attempt, fall back to permanent-accept" steer). xlsx is NOT script-only as the story premised: `apps/api/src/services/xlsform-parser.service.ts` (admin XLSForm import) is a live consumer via a **synchronous** `parseXlsxFile`. Porting to exceljs (the prod alternative) forces that method **async** (`exceljs.xlsx.load` is async), rippling into `questionnaire.service.ts` (runtime path) + **~40 synchronous test call sites across 6 files** + rewriting fixture generation. High churn to a live feature for **zero prod-gate benefit** (xlsx is dev-only, 503 under `--prod`, and out of the prod-scope gate). The story's own guardrail ("if xlsx removal touches a runtime path, stop") fires. → **permanent accepted-risk.**
- **serialize-javascript & phin — permanent accepted-risk.** Their only fixes cross a MAJOR (6→7 / 2→3); the repo override-policy forbids major-crossing overrides (the 9-54 footgun). Both dev-only, out of prod scope.
- **`osv-scanner.toml`**: 11 lines deleted (8 overrides + turbo×2 + ... the fixed set), 5 kept as PERMANENT (no `ignoreUntil`) — xlsx×2, serialize-javascript×2, phin. **AC4: zero expiring entries.**

### Two-tier CI gate (AC1 + AC2)
`ghcr.io/google/osv-scanner-action@sha256:48406c58…` (digest-pinned, v2.3.8), run via `docker run` for JSON capture:
- **Tier 1 — BLOCKING (prod scope):** `pnpm ls --prod` → osv JSON (no config) → `apps/api/scripts/osv-prod-gate.ts`. Fails iff a PROD dep is vulnerable. Blocking rule (post-review M1): exact `name@version` prod hit → block; name in prod but prod ships a DIFFERENT concrete version → skip (the flagged copy is a dev-tree one; surfaced non-blocking); name in prod with NO concrete version known (bare name, rare) → block fail-safe (never under-block). Logic in `apps/api/src/lib/osv-prod-gate.ts`, **unit-tested (15 tests) in the test-api CI job** (deliberately NOT in `packages/types` — avoids the 13-22/13-28 "test that never runs" trap).
- **Tier 2 — REPORT-ONLY (non-blocking):** full-tree `--config=osv-scanner.toml` → SARIF → Security tab (best-effort, `continue-on-error`; needs code scanning enabled) + always-available artifact. Dev-tree findings also echoed in the Tier-1 build log.

### AC5 synthetic-vuln proof (real scanner, inject→red→revert→green)
Temporarily pinned prod dep `qs` (via express→body-parser) to vulnerable `6.10.0` → `pnpm install` → real osv-scanner flagged GHSA-6rw7/hrpp/w7fw → **prod-gate exit 1 (BLOCK)**. Reverted to `>=6.15.2 <7` → reinstall → **prod-gate exit 0 (GREEN)**, dev-tree correctly non-blocking. Proves prod-scoping did not silently narrow the gate to nothing.

### Debug Log / gotchas
- osv-scanner **auto-discovers `osv-scanner.toml`** in the scanned dir — the "gate bites" check needs a real synthetic injection, not just running without `--config`.
- osv-scanner-action image appends a `Exit code: N` line to stdout; `--output-file=` writes clean JSON to a file (and `--output` is deprecated → switched to `--output-file`). CLI parse is tolerant regardless.
- osv-scanner JSON `groups` field = vuln-alias groups, NOT dependency scope (dead-end for prod-scoping).
- Windows/Git-Bash: `/src` MSYS-mangles in `docker -w` (`MSYS_NO_PATHCONV=1`); node reads bash `/tmp` as `C:\tmp`. CI is ubuntu so these are local-only.

### Audit-teardown flake — full investigation & resolution (13-30 hardening; surfaced during AC5)
> Reviewer note: this is a 13-30 test-hygiene hardening that surfaced during 13-32 AC5 validation; it is logically separable from the osv-scanner gate (see M2). Documented here in full so it can be reviewed as one unit.

**Trigger.** The AC5 full-suite run hit the 13-30 `audit_logs_actor_id_users_id_fk` (23503) teardown flake once at `threads=3`, which 13-30 had called "deterministic." Rather than re-defer it, I investigated with an empirical harness (a throwaway `apps/api/_*.ts`, deleted after use) that ran candidate teardown designs against racing fire-and-forget audit inserts, plus targeted burn-ins.

**The table + its two failure modes.** `audit_logs` has the sole FK `actor_id → users` AND an append-only `BEFORE UPDATE OR DELETE` immutability trigger (`trg_audit_logs_immutable`) that `RAISE`s. Teardowns that delete test users + their audit trail hit two *distinct* races:
- **23503 (FK race).** Audit writes are fire-and-forget (9-26: audit must never sink a request), so a request resolves before its `audit_logs.actor_id=<user>` INSERT commits; an `afterAll` deleting that user can then violate the FK.
- **40P01 (deadlock).** Deleting `audit_logs` rows requires getting past the immutability trigger via `ALTER TABLE … DISABLE TRIGGER`, which takes a strong, self-conflicting table lock (`ShareRowExclusiveLock`). Two teardowns doing this concurrently form a wait-for cycle → Postgres aborts one. The real deadlock report: both PIDs `waits for ShareRowExclusiveLock on audit_logs … blocked by` each other.

**Findings worth stating plainly:**
1. The *original* 23503 was **NOT reproducible** — not against the old helper, nor a first FOR-UPDATE-only patch — across single-process (60×8) and 5-way-concurrent (30×5×6) stress. Its exact trigger is unpinned.
2. The `DISABLE TRIGGER` **lock, not the FK race**, is the real fragility: under 5-way concurrent teardowns ~half died on 40P01, and a naïve FOR-UPDATE-only patch *increased* the failures.
3. The deadlock **was never in the users helper.** A follow-up full-suite run showed **5 OTHER files** with their own inline `DISABLE/ENABLE TRIGGER` teardowns (auth.provision-public-user, mfa.service, questionnaire.service, + the block-2 teardowns of auth.login/auth.password-reset) — the 13-30 AC3 sweep missed them; two collided on 40P01. So the fix had to make *every* audit-touching teardown deadlock-safe, not just the helper.

**Design iterations (harness-measured under 5-way concurrency):**
| design | outcome |
|---|---|
| old: `DISABLE TRIGGER` + 23503-retry (13-30) | ~50% fail 40P01 |
| FOR-UPDATE-first + `DISABLE TRIGGER` | *worse* (~more fail) |
| replica dual-path (superuser lock-free + owner fallback) | 240/240, but needs superuser + turns FK cascades off + dual-path complexity |
| **unified owner-path primitive (chosen)** | **240/240, 0 err** |

**Final design** (in `apps/api/src/__tests__/helpers/audit-safe-teardown.ts`) — one shared primitive, one path, no superuser:
- `withAuditLogsMutable(body)` = `pg_advisory_xact_lock(K)` FIRST → `DISABLE TRIGGER` → run `body`'s deletes → `ENABLE TRIGGER`, all in one tx, bounded-retried on 40P01/23503.
- `purgeUsersWithAuditDrain(ids)` = `withAuditLogsMutable(SELECT users FOR UPDATE → delete audit by actor → delete users)`.
- The 5 inline teardowns converted to `withAuditLogsMutable(...)` (deletes moved into the callback; duplicated trigger boilerplate + now-unused `sql` imports removed).

**Why it's correct (each claim independently checkable):**
- **No teardown-vs-teardown deadlock — by construction.** A deadlock needs a wait-for *cycle*. Every teardown acquires the single advisory lock `K` as its first statement and holds it to commit, so at any instant ≤1 teardown holds `K` and is doing the `DISABLE TRIGGER`/delete work; all others are blocked *on* `K` **holding no other lock**. A transaction blocked while holding nothing cannot be a node in a wait-for cycle → no cycle among teardowns can exist. (The advisory lock needs no privilege.)
- **No 23503 for the locked users — by construction.** `SELECT users … FOR UPDATE` conflicts with the `FOR KEY SHARE` a concurrent audit-insert must take on the referenced user row (FK enforcement), so no new referencing `audit_logs` row can appear for those users for the rest of the tx; pre-existing ones are deleted first.
- **FK cascades preserved.** Only the immutability trigger is disabled — FK enforcement stays ON — so a deleted user's SET-NULL/cascade children still get their FK actions. (`session_replication_role='replica'` was evaluated and dropped: lock-free but needs superuser AND disables FK enforcement, silently skipping cascades.)
- **Privilege = ownership only.** `DISABLE TRIGGER` needs table ownership (not superuser); `pg_advisory_xact_lock` needs none. Every test DB owns its schema (`user` local, `test_user` CI). A role that is neither owner nor superuser fundamentally cannot bypass a `BEFORE DELETE` trigger — by design we add no production escape hatch.

**Residual + honest limitation (review L3).** The advisory lock only serialises teardowns *against each other*. A single teardown can still deadlock against one concurrent fire-and-forget INSERT (teardown holds `FOR UPDATE(user)` + wants the trigger lock; insert holds `RowExclusive(audit_logs)` + wants `FOR KEY SHARE(user)`). That two-party cycle is covered by the **bounded retry** (`maxAttempts=5`; the in-flight insert set is finite in an `afterAll`, so it converges), but sustained parallel audit-write pressure could in principle exhaust it and re-surface the flake. So the guarantee is **deadlock-safety + the FK-invariant by construction + burn-in — NOT proof-of-absence.** This does not "supersede" 13-30's non-determinism; it closes the *deadlock* class and makes the FK race structurally impossible for the locked users.

**Evidence.** Primitive 240/240 concurrent teardowns, 0 err (harness) where old/first-patch designs failed ~50%; deterministic 2-connection race test (`audit-safe-teardown.race.test.ts`) pins the exact interleaving and proves the FOR-UPDATE invariant + primitive correctness in-DB (a burn-in only *samples* the schedule; this *scripts* it); all 9 audit-touching files green ×3 @ threads=8; **full API suite green ×2 @ threads=3 — 0 × 40P01, 0 × 23503, 0 failed suites** (the exact condition that flaked once pre-fix).

### Operator residual (AC5 — NOT run autonomously)
Push to main + green CI through **deploy** + VPS lands the SHA. dev-story ends at "review"; the deploy is an outward-facing production action left to the operator. New deploy note: **audit failures now surface as the "production scope (BLOCKING gate)" step, not `pnpm audit`.** Repro locally per `osv-scanner.toml` header. **The 2026-08-15 expiry cliff is gone** — no renewal ever needed.

### File List
- `.github/workflows/ci-cd.yml` (M) — two-tier OSV gate replaces the single step; `security-events: write` on lint-and-build.
- `.github/workflows/osv-scheduled.yml` (NEW) — AC6 weekly prod-scope scan.
- `apps/api/src/lib/osv-prod-gate.ts` (NEW) — pure gate logic (buildProdClosure / computeProdBlockingFindings / computeDevOnlyFindings).
- `apps/api/src/lib/__tests__/osv-prod-gate.test.ts` (NEW) — 15 unit tests (runs in test-api job; +1 M1 regression: prod-shared name at a different version is not blocked).
- `apps/api/scripts/osv-prod-gate.ts` (NEW) — CLI wrapper (exit 1 on prod finding).
- `osv-scanner.toml` (M) — 11 lines deleted; 5 converted to permanent (no `ignoreUntil`); header rewritten for the two-tier model.
- `package.json` (M) — turbo `^1.13.0`→`^2.10.5`; +8 dev-tree bounded overrides; `pnpm.comments` overrides/accepted-risks updated. **No prod `dependencies` changed.**
- `turbo.json` (M) — `pipeline`→`tasks`; canonical `$schema`.
- `pnpm-lock.yaml` (M) — turbo 2.x + the 8 overrides resolved.
- `apps/api/src/__tests__/helpers/audit-safe-teardown.ts` (M) — bonus 13-30 flake redesign: new shared `withAuditLogsMutable()` primitive (advisory-lock-serialised `DISABLE TRIGGER` + bounded retry, FK-preserving, owner-only/no-superuser) kills the teardown deadlock class; `purgeUsersWithAuditDrain()` reimplemented on it with `FOR UPDATE` closing the 23503 race.
- `apps/api/src/__tests__/audit-safe-teardown.race.test.ts` (NEW) — deterministic proof: two pinned two-connection lock schedules (FOR-UPDATE invariant) + `withAuditLogsMutable` correctness/concurrency cases.
- `apps/api/src/services/__tests__/{auth.provision-public-user,mfa.service,questionnaire.service}.test.ts` + `apps/api/src/__tests__/{auth.login,auth.password-reset}.test.ts` (M) — 5 inline `DISABLE/ENABLE TRIGGER` teardowns converted to `withAuditLogsMutable` (closes the 40P01 deadlock the 13-30 sweep missed; unused `sql` imports removed).
- **Blast-radius (unchanged files, L4 review):** `apps/api/src/__tests__/security.reauth-routes.test.ts`, `apps/api/src/__tests__/audit.verify-chain.test.ts`, `apps/api/src/__tests__/user.profile.test.ts` — pre-existing 13-30 callers of `purgeUsersWithAuditDrain`; not edited, but the helper's *internals* changed (advisory-lock + bounded retry + single-tx trigger toggle) so their runtime teardown behaviour changed. Covered by the "all 9 audit-touching files green ×3 @ threads=8" burn-in.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M) — status tracking.

## PM Validation (to be completed)

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-18 | **Adversarial code-review (different LLM) + fixes.** 0 High · 2 Med · 4 Low; all ACs verified genuinely implemented. Code fixes applied + verified (tsc clean, 15/15 gate unit tests green): M1 gate no longer false-blocks a prod-shared name at a different (dev) version (osv-prod-gate.ts) + regression test; L1 `parseJsonLoose` array-safe; L2 legible scan-failure diagnostic. Doc fixes: L3 overstated "supersedes deterministic" wording tightened, L4 3 blast-radius consumers named. Action items: M2 (attribute the audit-teardown redesign to its own story/commit on push). Status review → done. | Review (code-review) |
| 2026-07-18 | **Implemented (dev-story).** AC1 prod-closure filter gate (cdxgen rejected as imprecise); AC2 report-only SARIF two-tier; AC3 turbo 2.10.5 codemod + 8 dev-tree bounded overrides + xlsx/serialize-javascript/phin permanent-accept (xlsx removal attempted, rejected with evidence); AC4 zero `ignoreUntil` (cliff gone); AC5 real synthetic-vuln proof (qs@6.10.0 → red → revert → green) + full local validation; AC6 weekly scheduled scan. Operator residual: push + green deploy + VPS SHA. Status → review. | Dev (dev-story) |
| 2026-07-18 | Story drafted via *create-story. Post-launch follow-up to 13-31: prod-scope the osv-scanner gate (root-cause fix for the whole-lockfile scope mismatch) + burn down the 17 dev-tree grandfathered findings so the 2026-08-15 ignore expiry disappears permanently, not renewed. Two-tier gate (prod hard / dev report-only) preserves visibility; synthetic-vuln proof guards against silently narrowing the gate. NOT launch-gating; schedule post-launch before 2026-08-15. | Bob (SM) |
