# Test-infra fix — bcrypt work-factor downcost under the test runner (2026-06-14)

**Type:** test-infrastructure hygiene (NOT a feature; surfaced during Story 9-55 dev, kept as a SEPARATE change per scope discipline)
**Owner:** Awwal · **Author:** dev-story session (2026-06-14)
**Touches:** `packages/utils/src/crypto.ts` (+ `packages/utils/src/__tests__/crypto.test.ts`)
**Related:** Story 9-54 review-follow-up NG2 (pre-push `turbo --concurrency=1` de-flake) — same flakiness family, different root cause.

## Problem

The local full API suite (`pnpm --filter @oslsr/api test`) intermittently **worker-crashed**
(`exit 0xC0000409`) and `mfa.service.test.ts` reported **5 failures, all
`Test timed out in 15000ms`**, with the file taking **~178s**. The failures were
exclusively the **backup-code** MFA tests.

This reproduces on `main` in isolation — it is **not** caused by any feature story.

## Root cause

`hashPassword` used a hardcoded `SALT_ROUNDS = 12` with **no test-env reduction**.
MFA enrollment hashes **8 backup codes per enroll** (`Promise.all(8 × bcrypt.hash)`),
and backup-code verification bcrypt-compares up to 8 hashes. At cost-12 (~250–500ms
per hash) that is 2–4s of pure CPU per test, before DB latency — and under full-suite
parallel contention it blew even a 15s per-test timeout, then crashed the worker.

CI never saw this (each package runs as its own job on a dedicated runner), so it was
a **local-only** gate failure — exactly the class Story 9-54 NG2 documented.

## Fix

Make the work factor test-aware, gated to the SAME signal the rate-limiters use
(`NODE_ENV === 'test' || VITEST`):

```ts
const isTestRunner = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const SALT_ROUNDS = isTestRunner ? 4 : 12;
```

- **Zero effect on dev/prod** — `NODE_ENV=production` (and dev) keep cost-12.
- **No cross-contamination** — the cost is encoded in each hash; a cost-4 hash created
  in a test never reaches prod and would verify fine regardless.
- bcrypt's minimum is 4; cost-4 is still a valid, salted bcrypt hash.

## Verification

- `mfa.service.test.ts`: **178,209ms / 5 failed → 1,454ms / 22 passed** (~120× faster).
- `crypto.test.ts`: +2 tests — a round-trip hash/compare and a guard asserting the
  `$2b$04$` prefix under the test runner (a regression that drops the gating would
  re-introduce the flakiness and fail this test).
- Speeds every bcrypt-heavy suite (login, password-reset, staff-activation, MFA).

## Deploy-safety guard (added per 9-55 code review L2)

The downcost is gated on `NODE_ENV === 'test' || VITEST === 'true'`, so the ONLY way it
could weaken production is if a prod build/runtime accidentally carried one of those
signals. Two facts make that safe today, recorded here so the invariant is explicit:

- **Prod runtime** is started with `NODE_ENV=production` (PM2 + the deploy `.env`); `VITEST`
  is set only by the Vitest runner and is never present in a prod shell.
- **The VITE build** runs on the cloud runner (Wave 0) and produces only the client bundle —
  `crypto.ts` (server-side bcrypt) is never bundled into it, so a build-time env has no path
  to the runtime hash cost.

**Invariant to preserve:** never set `NODE_ENV=test` or `VITEST` in any production `.env`,
PM2 ecosystem file, or deploy workflow `env:` block. A cheap belt-and-braces check on the
VPS: `pm2 env 0 | grep -E 'NODE_ENV|VITEST'` should show `NODE_ENV=production` and no
`VITEST`. (Cross-referenced from infrastructure-cicd-playbook Pitfall #37.)

## Why this is separate from Story 9-55

Story 9-55 (minor age-gate) touches neither MFA nor bcrypt. Folding a shared,
security-sensitive crypto change into a feature story violates the project's
"code-review ≠ story dev / scope discipline" rule. This change ships distinctly so the
code reviewer can assess the crypto-gating on its own merits.
