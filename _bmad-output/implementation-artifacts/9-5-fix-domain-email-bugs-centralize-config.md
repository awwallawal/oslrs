# Story 9.5: Fix Domain/Email Bugs & Centralize Domain Configuration

Status: ready-for-dev

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

3. **AC#3 — Backend domain config cascades from `PUBLIC_APP_URL`:** All backend domain/email references derive from `PUBLIC_APP_URL` with intelligent defaults. `SUPPORT_EMAIL` and other vars auto-derive from the domain hostname but can be individually overridden. Changing `PUBLIC_APP_URL` cascades to all backend domain references.

4. **AC#4 — Frontend domain config cascades from `VITE_SITE_DOMAIN`:** A `site.config.ts` module exports `siteDomain`, `supportEmail`, and `publicUrl`, all derived from a single `VITE_SITE_DOMAIN` env var. Individual overrides (`VITE_SUPPORT_EMAIL`, `VITE_PUBLIC_URL`) are supported but not required. All frontend components import from this config.

5. **AC#5 — `index.html` meta tags are dynamic:** Canonical URL, og:url, og:image, and twitter:image use Vite's `%VITE_PUBLIC_URL%` replacement. Changing `VITE_SITE_DOMAIN` + rebuild updates all meta tags.

6. **AC#6 — CI/CD pipeline uses GitHub Actions variable:** `.github/workflows/ci-cd.yml` reads `VITE_API_URL` from a GitHub repo variable (`vars.VITE_API_URL`) with fallback. Domain migration requires only updating the GitHub variable — no workflow file edit.

7. **AC#7 — Test assertions import from config, not hardcoded strings:** Email template tests assert against the app's config defaults (imported). CSP test data uses `example.com` (standard test domain). ViewAs mock emails use `example.com`. No test contains a hardcoded production domain. Tests pass regardless of which domain is configured.

8. **AC#8 — `.env.example` updated:** A "Domain Configuration" section documents the cascading pattern, lists all domain-related vars, and includes a migration checklist comment.

9. **AC#9 — Zero test regressions:** Full test suite passes. No broken imports, no assertion mismatches.

## Prerequisites / Blockers

- None. This story is unblocked and addresses production bugs.

## Tasks / Subtasks

- [ ] Task 1: Create frontend site config module (AC: #4)
  - [ ] 1.1 Create `apps/web/src/config/site.ts` with cascading pattern:
    - `SITE_DOMAIN` derived from `VITE_SITE_DOMAIN` (default: `'oyotradeministry.com.ng'`)
    - `publicUrl` derived from `VITE_PUBLIC_URL` or `https://${SITE_DOMAIN}`
    - `supportEmail` derived from `VITE_SUPPORT_EMAIL` or `support@${SITE_DOMAIN}`
  - [ ] 1.2 Export as named constants for tree-shaking

- [ ] Task 2: Fix backend domain references (AC: #1, #3)
  - [ ] 2.1 `apps/api/src/services/email.service.ts:33` — Change `SUPPORT_URL` from hardcoded string to `process.env.PUBLIC_APP_URL || 'https://oyotradeministry.com.ng'`
  - [ ] 2.2 `apps/api/src/controllers/user.controller.ts:102` — Fix `oslrs.oyostate.gov.ng` typo to `oyotradeministry.com.ng` in the `PUBLIC_APP_URL` fallback
  - [ ] 2.3 `apps/api/src/services/staff.service.ts:520` — Same fix as 2.2

- [ ] Task 3: Fix frontend support email references (AC: #2, #4)
  - [ ] 3.1 `ActivationWizard.tsx:136,270` — Replace `mailto:support@oslsr.gov.ng` with import from `site.config.ts`
  - [ ] 3.2 `ContactPage.tsx:12` — Replace `support@oslsr.oyo.gov.ng` with import from `site.config.ts`
  - [ ] 3.3 `SupportLandingPage.tsx:53` — Replace `support@oslsr.oyo.gov.ng` with import from `site.config.ts`
  - [ ] 3.4 `EmployersPage.tsx:104` — Replace `support@oslsr.oyo.gov.ng` with import from `site.config.ts`

- [ ] Task 4: Make `index.html` meta tags dynamic (AC: #5)
  - [ ] 4.1 Replace 4 hardcoded `oyotradeministry.com.ng` references with `%VITE_PUBLIC_URL%` in canonical, og:url, og:image, twitter:image
  - [ ] 4.2 Add `VITE_PUBLIC_URL` to the frontend env section of `.env.example`

- [ ] Task 5: Update CI/CD to use GitHub Actions variable (AC: #6)
  - [ ] 5.1 `.github/workflows/ci-cd.yml` — Change `VITE_API_URL=https://oyotradeministry.com.ng/api/v1` to `VITE_API_URL=${{ vars.VITE_API_URL || 'https://oyotradeministry.com.ng/api/v1' }}`
  - [ ] 5.2 Document in `.env.example` that CI reads from GitHub repo variable

- [ ] Task 6: Make test assertions config-driven (AC: #7)
  - [ ] 6.1 `id-card.service.test.ts:100` — Fix verification URL from `oslrs.oyostate.gov.ng` to use the correct default domain
  - [ ] 6.2 `email-providers.test.ts:272` — Import default fromAddress from `packages/config/src/email.ts` instead of hardcoding
  - [ ] 6.3 `email-templates.test.ts:66` — Assert against imported config default, not hardcoded domain
  - [ ] 6.4 Delete `email-templates.test.ts.snap` — let vitest regenerate with corrected values
  - [ ] 6.5 `csp.test.ts:84` and `csp.routes.test.ts` — Replace `oyotradeministry.com.ng` with `example.com` (RFC 2606 test domain — CSP handler doesn't care about specific domain)
  - [ ] 6.6 `ViewAsDashboardPage.test.tsx:79` and `ViewAsBanner.test.tsx:28` — Fix `admin@oslsr.gov.ng` to `admin@example.com`
  - [ ] 6.7 `ContactPage.test.tsx:35,83` — Update assertions to match corrected support email from config
  - [ ] 6.8 Run `pnpm test` — full suite passes, zero regressions

- [ ] Task 7: Update `.env.example` (AC: #8)
  - [ ] 7.1 Add/reorganize a "Domain Configuration" section grouping: `PUBLIC_APP_URL`, `SUPPORT_EMAIL`, `VITE_SITE_DOMAIN`, `VITE_PUBLIC_URL`, `VITE_SUPPORT_EMAIL`
  - [ ] 7.2 Add migration checklist comment:
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
  ├── SUPPORT_URL (email.service.ts) ← derives from PUBLIC_APP_URL
  ├── Verification URLs ← derives from PUBLIC_APP_URL
  ├── SUPPORT_EMAIL ← override, or auto-derive from hostname
  └── EMAIL_FROM_ADDRESS ← already independent env var

Frontend (.env at build time):
  VITE_SITE_DOMAIN=oyotradeministry.com.ng
  ├── publicUrl ← https://${SITE_DOMAIN} (or VITE_PUBLIC_URL override)
  ├── supportEmail ← support@${SITE_DOMAIN} (or VITE_SUPPORT_EMAIL override)
  └── index.html meta tags ← %VITE_PUBLIC_URL%

CI/CD (GitHub repo variable):
  VITE_API_URL ← GitHub Actions vars (no code edit on migration)
```

**Migration day = change 2 env vars + 1 GitHub variable + find-replace 2 static files.**
No application code, no test code, no CI workflow file edits.

### After This Story, Domain Migration Requires

| Step | What | Time |
|------|------|------|
| 1 | Change `PUBLIC_APP_URL` in VPS `.env` | 1 min |
| 2 | Change `VITE_SITE_DOMAIN` in VPS `.env` | 1 min |
| 3 | Update `VITE_API_URL` GitHub repo variable | 1 min |
| 4 | Find-replace in `sitemap.xml` (26 entries) | 3 min |
| 5 | Find-replace in `robots.txt` (1 line) | 1 min |
| 6 | Rebuild + deploy | 5 min |
| 7 | DNS + SSL + NGINX (VPS ops) | 30 min |
| 8 | Resend domain verification + email (Story 9-4) | 30 min |
| 9 | Update docs | 15 min |

### Supersedes in Story 9-2

Tasks 1, 3, 4, 5, 8 fully superseded. Task 2 partially superseded (index.html now dynamic; sitemap + robots remain). Tasks 6-7 (docs + VPS runbook) remain for migration day. See `[SUPERSEDED BY 9-5]` markers in 9-2's task list.

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
