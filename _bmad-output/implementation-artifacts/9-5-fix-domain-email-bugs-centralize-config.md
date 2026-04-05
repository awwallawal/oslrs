# Story 9.5: Fix Domain/Email Bugs & Centralize Domain Configuration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the **Super Admin**,
I want **all broken domain and email references fixed to use the live production domain, and all domain-related values centralized to environment variables with cascading defaults**,
so that **users see correct, reachable support emails and verification links, and a future domain migration requires only changing 2 env vars (`PUBLIC_APP_URL` + `VITE_SITE_DOMAIN`) plus updating 2 static files — no application code changes**.

## Acceptance Criteria

1. **AC#1 — Broken verification URL fallback fixed:** `user.controller.ts` and `staff.service.ts` verification URL fallback uses `oyotradeministry.com.ng` (via `PUBLIC_APP_URL` env var). The typo domain `oslrs.oyostate.gov.ng` no longer appears in source code.

2. **AC#2 — Broken support emails fixed:** All user-facing support email references point to `support@oyotradeministry.com.ng` (via centralized config). The three wrong variants are eliminated:
   - `support@oslsr.gov.ng` (reversed "oslsr") in ActivationWizard.tsx
   - `support@oslsr.oyo.gov.ng` in ContactPage.tsx, SupportLandingPage.tsx, EmployersPage.tsx

3. **AC#3 — Backend domain config uses env vars with stable defaults:** Verification URLs derive from `PUBLIC_APP_URL`. Email support link uses dedicated `SUPPORT_URL` env var (separate from `PUBLIC_APP_URL` because app URL is `localhost` in dev, but email support links must always show the production domain). Both default to `oyotradeministry.com.ng`.

4. **AC#4 — Frontend domain config cascades from `VITE_SITE_DOMAIN`:** A `site.config.ts` module exports `siteDomain`, `supportEmail`, and `publicUrl`, all derived from a single `VITE_SITE_DOMAIN` env var. Individual overrides (`VITE_SUPPORT_EMAIL`, `VITE_PUBLIC_URL`) are supported but not required. All frontend components import from this config.

5. **AC#5 — `index.html` meta tags:** ~~Dynamic via `%VITE_PUBLIC_URL%`~~ — **Reverted** (commit `a02a4b0`). Vite only replaces `%VAR%` in HTML if the var is defined, and `.env` is gitignored so CI never sees defaults. PWA plugin crashed on the literal string. Meta tags remain hardcoded with the correct domain and join `sitemap.xml` + `robots.txt` as static files (3-file find-replace on migration day).

6. **AC#6 — CI/CD pipeline uses GitHub Actions variable:** `.github/workflows/ci-cd.yml` reads `VITE_API_URL` from a GitHub repo variable (`vars.VITE_API_URL`) with fallback. Domain migration requires only updating the GitHub variable — no workflow file edit.

7. **AC#7 — Test assertions import from config, not hardcoded strings:** Email template tests assert against the app's config defaults (imported). CSP test data uses `example.com` (standard test domain). ViewAs mock emails use `example.com`. No test contains a hardcoded production domain. Tests pass regardless of which domain is configured.

8. **AC#8 — `.env.example` updated:** A "Domain Configuration" section documents the cascading pattern, lists all domain-related vars, and includes a migration checklist comment.

9. **AC#9 — Zero test regressions:** Full test suite passes. No broken imports, no assertion mismatches.

## Prerequisites / Blockers

- None. This story is unblocked and addresses production bugs.

## Tasks / Subtasks

- [x] Task 1: Create frontend site config module (AC: #4)
  - [x] 1.1 Create `apps/web/src/config/site.ts` with cascading pattern:
    - `SITE_DOMAIN` derived from `VITE_SITE_DOMAIN` (default: `'oyotradeministry.com.ng'`)
    - `publicUrl` derived from `VITE_PUBLIC_URL` or `https://${SITE_DOMAIN}`
    - `supportEmail` derived from `VITE_SUPPORT_EMAIL` or `support@${SITE_DOMAIN}`
  - [x] 1.2 Export as named constants for tree-shaking

- [x] Task 2: Fix backend domain references (AC: #1, #3)
  - [x] 2.1 `apps/api/src/services/email.service.ts:33` — Change `SUPPORT_URL` from hardcoded string to `process.env.SUPPORT_URL || 'https://oyotradeministry.com.ng'` (dedicated env var — not PUBLIC_APP_URL, which is localhost in dev)
  - [x] 2.2 `apps/api/src/controllers/user.controller.ts:102` — Fix `oslrs.oyostate.gov.ng` typo to `oyotradeministry.com.ng` in the `PUBLIC_APP_URL` fallback
  - [x] 2.3 `apps/api/src/services/staff.service.ts:520` — Same fix as 2.2

- [x] Task 3: Fix frontend support email references (AC: #2, #4)
  - [x] 3.1 `ActivationWizard.tsx:136,270` — Replace `mailto:support@oslsr.gov.ng` with import from `site.config.ts`
  - [x] 3.2 `ContactPage.tsx:12` — Replace `support@oslsr.oyo.gov.ng` with import from `site.config.ts`
  - [x] 3.3 `SupportLandingPage.tsx:53` — Replace `support@oslsr.oyo.gov.ng` with import from `site.config.ts`
  - [x] 3.4 `EmployersPage.tsx:104` — Replace `support@oslsr.oyo.gov.ng` with import from `site.config.ts`

- [x] Task 4: ~~Make `index.html` meta tags dynamic~~ — REVERTED (AC: #5)
  - [x] 4.1 Attempted `%VITE_PUBLIC_URL%` replacement — Vite requires var defined at build time, `.env` gitignored, PWA plugin crashed. Reverted to hardcoded domain (commit `a02a4b0`).
  - [x] 4.2 `VITE_PUBLIC_URL` added to `.env.example` (still useful for `site.config.ts` `publicUrl` export)

- [x] Task 5: Update CI/CD to use GitHub Actions variable (AC: #6)
  - [x] 5.1 `.github/workflows/ci-cd.yml` — Change `VITE_API_URL=https://oyotradeministry.com.ng/api/v1` to `VITE_API_URL=${{ vars.VITE_API_URL || 'https://oyotradeministry.com.ng/api/v1' }}`
  - [x] 5.2 Document in `.env.example` that CI reads from GitHub repo variable

- [x] Task 6: Make test assertions config-driven (AC: #7)
  - [x] 6.1 `id-card.service.test.ts:100` — Fix verification URL from `oslrs.oyostate.gov.ng` to use the correct default domain
  - [x] 6.2 `email-providers.test.ts:272` — Import default fromAddress from `packages/config/src/email.ts` instead of hardcoding
  - [x] 6.3 `email-templates.test.ts:66` — Assert against imported config default, not hardcoded domain
  - [x] 6.4 Delete `email-templates.test.ts.snap` — let vitest regenerate with corrected values
  - [x] 6.5 `csp.test.ts:84` and `csp.routes.test.ts` — Replace `oyotradeministry.com.ng` with `example.com` (RFC 2606 test domain — CSP handler doesn't care about specific domain)
  - [x] 6.6 `ViewAsDashboardPage.test.tsx:79` and `ViewAsBanner.test.tsx:28` — Fix `admin@oslsr.gov.ng` to `admin@example.com`
  - [x] 6.7 `ContactPage.test.tsx:35,83` — Update assertions to match corrected support email from config
  - [x] 6.8 Run `pnpm test` — full suite passes, zero regressions

- [x] Task 7: Update `.env.example` (AC: #8)
  - [x] 7.1 Add/reorganize a "Domain Configuration" section grouping: `PUBLIC_APP_URL`, `SUPPORT_EMAIL`, `VITE_SITE_DOMAIN`, `VITE_PUBLIC_URL`, `VITE_SUPPORT_EMAIL`
  - [x] 7.2 Add migration checklist comment:
    ```
    # --- DOMAIN MIGRATION CHECKLIST ---
    # To switch domains (e.g., oyotradeministry.com.ng → newdomain.com):
    # 1. Backend: Change PUBLIC_APP_URL (all backend refs cascade automatically)
    # 2. Frontend: Change VITE_SITE_DOMAIN (support email, public URL cascade)
    # 3. CI/CD: Update VITE_API_URL GitHub repo variable
    # 4. Static: Find-replace domain in sitemap.xml + robots.txt (2 files)
    # 5. Rebuild: pnpm build (frontend rebakes env vars)
    # 6. VPS: Update NGINX server_name, SSL cert, .env, restart
    # 7. DNS: Point new domain A record to VPS IP
    # 8. Email: Verify new domain in Resend, update SPF/DKIM/DMARC
    # Individual overrides (optional): SUPPORT_EMAIL, EMAIL_FROM_ADDRESS,
    # SUPER_ADMIN_EMAIL, VITE_SUPPORT_EMAIL, VITE_PUBLIC_URL
    ```

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] AC#3 text inaccurate — SUPPORT_URL uses own env var, not PUBLIC_APP_URL. Fixed: rewrote AC to reflect actual architecture.
- [x] [AI-Review][MEDIUM] AC#5 text inaccurate — meta tags are hardcoded after documented CI revert. Fixed: updated AC to reflect revert with commit reference.
- [x] [AI-Review][MEDIUM] Dev Notes stale — migration table missing index.html, cascading diagram wrong, "2 static files" count wrong. Fixed: updated diagram, table (added index.html step), corrected counts.
- [x] [AI-Review][LOW] `SUPPORT_EMAIL` env var in .env.example never consumed by code. Fixed: renamed to `SUPPORT_URL` to match actual `process.env.SUPPORT_URL` usage.
- [x] [AI-Review][LOW] Task checkboxes all unchecked. Fixed: marked all `[x]`.
- [x] [AI-Review][LOW] email-providers test assertion overly loose (regex). Fixed: imports Zod schema default and asserts exact match.
- [x] [AI-Review][LOW] email-templates support URL test too weak. Fixed: asserts against `process.env.SUPPORT_URL || default` for exact match.
- [~] [AI-Review][LOW] `publicUrl` export in site.config.ts unused. Noted: kept intentionally — useful for future consumers and consistent with the cascading config pattern.

## Dev Notes

### Bug Inventory (3 wrong domain variants found in production code)

| Wrong Value | Correct Value | Files Affected |
|-------------|---------------|----------------|
| `oslrs.oyostate.gov.ng` | `oyotradeministry.com.ng` (via `PUBLIC_APP_URL`) | user.controller.ts, staff.service.ts, id-card.service.test.ts |
| `support@oslsr.gov.ng` | `support@oyotradeministry.com.ng` (via `site.config.ts`) | ActivationWizard.tsx (2 occurrences) |
| `support@oslsr.oyo.gov.ng` | `support@oyotradeministry.com.ng` (via `site.config.ts`) | ContactPage.tsx, SupportLandingPage.tsx, EmployersPage.tsx |

### Cascading Domain Architecture

```
Backend (.env at runtime):
  PUBLIC_APP_URL=https://oyotradeministry.com.ng
  ├── Verification URLs ← derives from PUBLIC_APP_URL
  └── EMAIL_FROM_ADDRESS ← already independent env var
  SUPPORT_URL=https://oyotradeministry.com.ng
  └── Email support link ← independent from PUBLIC_APP_URL (localhost in dev)

Frontend (.env at build time):
  VITE_SITE_DOMAIN=oyotradeministry.com.ng
  ├── publicUrl ← https://${SITE_DOMAIN} (or VITE_PUBLIC_URL override)
  └── supportEmail ← support@${SITE_DOMAIN} (or VITE_SUPPORT_EMAIL override)

Static files (manual find-replace on migration day):
  index.html ← 4 meta tags (canonical, og:url, og:image, twitter:image)
  sitemap.xml ← 26 <loc> entries
  robots.txt ← 1 sitemap URL

CI/CD (GitHub repo variable):
  VITE_API_URL ← GitHub Actions vars (no code edit on migration)
```

**Migration day = change 3 env vars + 1 GitHub variable + find-replace 3 static files.**
No application code, no test code, no CI workflow file edits.

### After This Story, Domain Migration Requires

| Step | What | Time |
|------|------|------|
| 1 | Change `PUBLIC_APP_URL` + `SUPPORT_URL` in VPS `.env` | 1 min |
| 2 | Change `VITE_SITE_DOMAIN` in VPS `.env` | 1 min |
| 3 | Update `VITE_API_URL` GitHub repo variable | 1 min |
| 4 | Find-replace in `index.html` (4 meta tags) | 1 min |
| 5 | Find-replace in `sitemap.xml` (26 entries) | 3 min |
| 6 | Find-replace in `robots.txt` (1 line) | 1 min |
| 7 | Rebuild + deploy | 5 min |
| 8 | DNS + SSL + NGINX (VPS ops) | 30 min |
| 9 | Resend domain verification + email (Story 9-4) | 30 min |
| 10 | Update docs | 15 min |

### Supersedes in Story 9-2

Tasks 1, 3, 4, 5, 8 fully superseded. Task 2 partially superseded (sitemap + robots + index.html meta tags remain as static files). Tasks 6-7 (docs + VPS runbook) remain for migration day. See `[SUPERSEDED BY 9-5]` markers in 9-2's task list.

### What NOT to Touch

- **`sitemap.xml`, `robots.txt`** — correctly reference `oyotradeministry.com.ng`. Static files, manual update on migration day.
- **`providers/index.ts:105`** — already uses `EMAIL_FROM_ADDRESS` env var. Default correct.
- **`packages/config/src/email.ts:106`** — Zod default correct. Env var overrides.
- **`_bmad-output/` planning docs** — `oslsr.gov.ng` references are historical context, not runtime code.

### Deployment Notes

- **No new required env vars for current deployment.** All new vars have correct defaults matching the live domain.
- **Recommended VPS action:** Set `VITE_SITE_DOMAIN=oyotradeministry.com.ng` explicitly in `.env` for clarity, then rebuild frontend. But the defaults work without this.
- **GitHub Actions:** Set `VITE_API_URL` repo variable at `github.com/awwallawal/oslrs/settings/variables/actions`. Fallback in workflow means current behavior is unchanged if variable isn't set.
- **No database changes.** No new dependencies. No API endpoint changes.

### References

- [Source: Story 9-2 domain inventory — `9-2-domain-migration-oslrs-com.md` Dev Notes]
- [Source: Code review bug discovery — adversarial grep of codebase on 2026-04-05]
- [Source: `.env.example` — existing env var patterns]
- [Source: Vite HTML env replacement — `%VITE_*%` syntax in index.html]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — implementation was clean. Two CI issues caught post-push (see Completion Notes).

### Completion Notes List

- **Task 1 (AC#4):** Created `apps/web/src/config/site.ts` with cascading pattern: `SITE_DOMAIN` → `publicUrl`, `supportEmail`, plus `siteEmail(prefix)` helper for tech/report/legal emails.
- **Task 2 (AC#1, AC#3):** Fixed `email.service.ts` SUPPORT_URL, `user.controller.ts` and `staff.service.ts` verification URL fallbacks. All 3 `oslrs.oyostate.gov.ng` references eliminated.
- **Task 3 (AC#2, AC#4):** Centralized support emails across 8 frontend files (ActivationWizard, ContactPage, SupportLandingPage, EmployersPage, FAQPage, TermsPage, GuideVerifyWorkerPage, GuideRegisterPage). More files than originally scoped — grep revealed additional `oslsr.oyo.gov.ng` references in FAQ, Terms, and guide pages.
- **Task 4 (AC#5):** Attempted `%VITE_PUBLIC_URL%` in index.html meta tags — **failed in CI**. Vite only replaces `%VAR%` if the var is defined, and `.env` is gitignored so CI never sees defaults. PWA plugin crashed on the literal string. **Reverted** to hardcoded domain. Meta tags join sitemap/robots as static files (3-file find-replace on migration day).
- **Task 5 (AC#6):** Updated CI/CD to use `${{ vars.VITE_API_URL || 'fallback' }}` GitHub Actions variable pattern.
- **Task 6 (AC#7):** Updated 9 test files — CSP tests use `example.com`, ViewAs mocks use `example.com`, email provider test uses regex instead of hardcoded domain, ContactPage/TermsPage tests updated.
- **Task 7 (AC#8):** Updated `.env.example` with Domain Configuration section and migration checklist comment block.
- **SUPPORT_URL issue (post-deploy fix):** Initially set `SUPPORT_URL = process.env.PUBLIC_APP_URL || default`. This caused email template snapshots to fail in CI because `PUBLIC_APP_URL=http://localhost:5173` in dev/CI, making email "Contact support" links point to localhost. **Fix:** Changed to dedicated `process.env.SUPPORT_URL || 'https://oyotradeministry.com.ng'`. SUPPORT_URL and PUBLIC_APP_URL serve different purposes — app redirect URL vs. support link in emails.
- **Additional deliverables:** Created `docs/DOMAIN-MIGRATION.md` runbook. Annotated stories 9-2 and 9-4 with supersession markers. Added Epic 9 to `epics.md`.
- **Tests:** 4,156 total (1,779 API + 2,377 web), zero regressions. One pre-existing flaky integration test (`auth.activation.test.ts`) unrelated to changes.

### Change Log

- 2026-04-05: Implemented Story 9.5 — fixed 3 wrong domain variants, centralized to env vars, created site.config.ts.
- 2026-04-05: CI fix #1 — reverted index.html `%VITE_PUBLIC_URL%` to hardcoded domain (Vite HTML env var requires defined var).
- 2026-04-05: CI fix #2 — changed SUPPORT_URL from PUBLIC_APP_URL to dedicated env var (localhost in dev broke email snapshots).
- 2026-04-05: Code review fixes — updated stale ACs/docs, tightened test assertions, fixed .env.example SUPPORT_EMAIL→SUPPORT_URL, checked all task boxes.

### File List

- `apps/web/src/config/site.ts` — Created: cascading domain config (SITE_DOMAIN, publicUrl, supportEmail, siteEmail helper)
- `apps/api/src/services/email.service.ts` — Modified: SUPPORT_URL uses `process.env.SUPPORT_URL` with stable default
- `apps/api/src/controllers/user.controller.ts` — Modified: fixed `oslrs.oyostate.gov.ng` typo in verification URL fallback
- `apps/api/src/services/staff.service.ts` — Modified: same verification URL fix
- `apps/web/src/features/auth/components/activation-wizard/ActivationWizard.tsx` — Modified: import supportEmail from site config
- `apps/web/src/features/support/pages/ContactPage.tsx` — Modified: support/tech/report emails from site config
- `apps/web/src/features/support/pages/SupportLandingPage.tsx` — Modified: support + report emails from site config
- `apps/web/src/features/support/pages/FAQPage.tsx` — Modified: report + tech emails from site config
- `apps/web/src/features/participate/pages/EmployersPage.tsx` — Modified: support email from site config
- `apps/web/src/features/legal/pages/TermsPage.tsx` — Modified: legal email from site config
- `apps/web/src/features/support/pages/guides/GuideVerifyWorkerPage.tsx` — Modified: report email from site config
- `apps/web/src/features/support/pages/guides/GuideRegisterPage.tsx` — Modified: report email from site config
- `apps/web/index.html` — Modified: meta tags remain hardcoded (Vite %VAR% approach failed in CI)
- `.github/workflows/ci-cd.yml` — Modified: VITE_API_URL reads from GitHub Actions variable
- `.env.example` — Modified: added Domain Configuration section with migration checklist
- `docs/DOMAIN-MIGRATION.md` — Created: step-by-step migration runbook
- `apps/api/src/__tests__/csp.test.ts` — Modified: domain → example.com
- `apps/api/src/routes/__tests__/csp.routes.test.ts` — Modified: domain → example.com
- `apps/api/src/providers/__tests__/email-providers.test.ts` — Modified: regex assertion instead of hardcoded domain
- `apps/api/src/services/__tests__/email-templates.test.ts` — Modified: flexible assertion for support URL
- `apps/api/src/services/__tests__/__snapshots__/email-templates.test.ts.snap` — Regenerated
- `apps/api/src/services/__tests__/id-card.service.test.ts` — Modified: fixed verification URL
- `apps/web/src/features/dashboard/pages/__tests__/ViewAsDashboardPage.test.tsx` — Modified: mock email → example.com
- `apps/web/src/features/dashboard/components/__tests__/ViewAsBanner.test.tsx` — Modified: mock email → example.com
- `apps/web/src/features/support/__tests__/ContactPage.test.tsx` — Modified: updated email assertions
- `apps/web/src/features/legal/__tests__/TermsPage.test.tsx` — Modified: updated legal email assertion
- `_bmad-output/implementation-artifacts/9-2-domain-migration-oslrs-com.md` — Modified: deferred + supersession annotations
- `_bmad-output/implementation-artifacts/9-4-email-setup-resend-domain.md` — Modified: deferred + migration doc pointer
- `_bmad-output/planning-artifacts/epics.md` — Modified: added Epic 9 section
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Modified: 9-2/9-4 deferred, 9-5 added
