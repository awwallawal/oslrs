# Runbook — Wizard Resume E2E Harness (`wizard_resume` token)

**Owner:** registration / web
**Created:** 2026-06-15 (Story 9-57 / code-review AI-Review M1)
**Status:** active — gates the wizard cross-device-resume + autosave-across-reload e2e

## What this is

The public-registration wizard supports **cross-device resume**: a `wizard_resume`
magic-link token hydrates the server-side draft so a user lands back on their
saved step (`GET /registration/draft?token=…`). Two Playwright tests prove it:

- **AC5.2a** — cross-device resume lands on the saved step (fresh browser context).
- **AC5.2b** — autosave persists the current step across a full page reload.

Both were `test.skip()` until 2026-06-15 because a test needs a **valid
`wizard_resume` token**, and tokens are stored only as a SHA-256 hash — the
plaintext exists exactly once, in the email. This harness supplies that token
deterministically without an email sink.

## How it works (the moving parts)

```
playwright.config.ts
  └─ project "wizard-resume-setup"  (runs first; dependency of "wizard")
       └─ e2e/wizard-resume.setup.ts
            └─ execSync: pnpm --filter @oslsr/api exec tsx \
                 scripts/_mint-wizard-resume-token.ts --email <unique>
                 └─ MagicLinkService.issueToken({ purpose: 'wizard_resume' })   ← REAL path
                 └─ prints  MINT_RESULT={"email","token","expiresAt"}
            └─ writes apps/web/e2e/.wizard-resume-tokens.json   (gitignored)
  └─ project "wizard"
       └─ e2e/wizard-registration.spec.ts
            └─ readWizardResumeFixture()  (helpers/wizard-resume-fixture.ts)
            └─ drives the wizard UI → its OWN autosave writes the draft
            └─ navigates /register?token=<minted>  → asserts it lands on Consent
```

- **The draft is NOT seeded** — it is created by the wizard's real 2s autosave
  during the test (fill Step 1 → Step 2 sets the email → advance to Consent).
- **Survey-skipped 4-step model is sufficient.** The three fixed head steps are
  always `basics(0) / contact(1) / consent(2)`, so landing a resume on **Consent
  (index 2)** exercises the full resume-seed + deep-link clamp + write-only
  persistence machinery without a pinned multi-section form. (The section-step
  variant is covered by `WizardPage.test.tsx` unit tests.)

## Why a script, not a `/test/*` endpoint

A standing test-only HTTP route is a permanent liability — every future security
review must re-confirm it is gated out of production. The mint **script** is
never imported by `app.ts`/the router, so it adds **zero server surface**, while
still calling the genuine `MagicLinkService.issueToken` (real hash, schema, TTL),
so it fails loud if those internals change. It also refuses to run under
`NODE_ENV=production` as defence-in-depth.

## Running locally

Prereqs: postgres + redis reachable via the root `.env` `DATABASE_URL`
(the project's docker containers `oslsr_postgres` :5432 + `oslsr_redis` :6379),
and ≥1 LGA seeded (Step 2's dropdown — `db:seed:dev` provides the 33 Oyo LGAs).

```bash
# from repo root — Playwright auto-starts the API (:3000) + web (:5173) dev servers
pnpm --filter @oslsr/web exec playwright test --project=wizard --reporter=list

# just the token mint (debug the fixture):
pnpm --filter @oslsr/web exec playwright test --project=wizard-resume-setup

# mint a token by hand:
pnpm --filter @oslsr/api exec tsx scripts/_mint-wizard-resume-token.ts --email you@example.test
```

Expected: `11 passed / 4 skipped` (the 4 skipped are the *other* full-stack
wizard flows — happy-path, pending-NIN, section-as-step, public-user login).

## In CI (`.github/workflows/e2e.yml`)

Already provisions the full stack (postgres + redis services, `db:seed:dev`).
The mint script inherits the job's `DATABASE_URL` from `process.env`; the API's
`dotenv.config()` no-ops when no `.env` file is present, so the job env wins.
`NODE_ENV=development` on the job, so the prod guard passes. No CI changes were
required beyond the new project (it runs inside the existing `pnpm test:e2e`).

## Cross-platform note (don't "fix" this)

`wizard-resume.setup.ts` invokes the mint script via `execSync` with a **single
command string** on purpose:
- On Windows `pnpm` is a `.cmd` shim, which Node refuses to spawn without a shell
  (CVE-2024-27980 hardening) → `execFile('pnpm.cmd', …)` throws `EINVAL`.
- Passing an **args array** together with a shell triggers Node's `DEP0190`
  deprecation.
A bare command string sidesteps both and runs identically on cmd.exe and POSIX
sh. The interpolated `email` is a controlled literal (timestamp + `@example.test`,
no shell metacharacters), so there is no injection surface.

## Extending — un-skipping the remaining full-stack flows

The harness already gives you the hard parts (a token affordance + full-stack CI).
To un-skip the happy-path / pending-NIN / section-as-step flows in
`wizard-registration.spec.ts` you additionally need:
1. A **pinned multi-section published form** at
   `system_settings.wizard.public_form_id` (add a `wizard-public-form.seed.ts`
   to `db:seed:dev`).
2. Per-question-type filling in `walkSectionsToReview` (numbers / selects / the
   GPS step — the current `'n/a'`-into-every-textbox helper won't satisfy them).
3. For the post-submit login magic-link assertion, an email sink (Mailpit) or a
   second mint-style affordance.
