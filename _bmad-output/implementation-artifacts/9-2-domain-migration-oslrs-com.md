# Story 9.2: Domain Migration — oyotradeministry.com.ng → oyoskills.com

Status: deferred

> **2026-04-05 — Scope Update:** Story 9-5 extracted bug fixes + env var centralization from this story.
> ~80% of code tasks are superseded. Remaining scope: static files (sitemap, robots.txt), documentation, VPS ops runbook.
> When domain is purchased, merge remaining tasks with Story 9-4 into a single migration story.
> See supersession markers `[SUPERSEDED BY 9-5]` and `[REMAINS]` on tasks below.
> **Migration runbook:** `docs/DOMAIN-MIGRATION.md` — the single checklist to follow on migration day.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the **Super Admin**,
I want to **migrate the entire platform from oyotradeministry.com.ng to oyoskills.com**,
so that **the system has a clean, memorable domain that is independent of government bureaucracy and consistent across all codebase, configuration, and deployment references**.

## Acceptance Criteria

1. **AC#1 — Source code domain references updated:** All hardcoded domain references in source code (`email.service.ts`, `providers/index.ts`, `packages/config/src/email.ts`, `user.controller.ts`, `staff.service.ts`) use `oyoskills.com` or `PUBLIC_APP_URL` env var. Zero hardcoded `oyotradeministry.com.ng` references remain in `apps/api/src/` or `packages/`.

2. **AC#2 — Frontend meta tags & SEO files updated:** `index.html` canonical/og:url/og:image/twitter:image use `https://oyoskills.com`. `robots.txt` sitemap URL points to `https://oyoskills.com/sitemap.xml`. All 26 `sitemap.xml` URL entries use `https://oyoskills.com/...`. No hardcoded `oyotradeministry.com.ng` in `apps/web/`.

3. **AC#3 — CI/CD pipeline updated:** `.github/workflows/ci-cd.yml` build command uses `VITE_API_URL=https://oyoskills.com/api/v1`. Production deploy step references the correct domain.

4. **AC#4 — Test assertions updated:** All test files using domain strings (`csp.test.ts`, `csp.routes.test.ts`, `email-providers.test.ts`, `email-templates.test.ts`, `ViewAsDashboardPage.test.tsx`, `ViewAsBanner.test.tsx`) use `oyoskills.com` or a test-appropriate domain. Email template snapshots regenerated. All tests pass.

5. **AC#5 — Verification URL typo fixed:** The `oslrs.oyostate.gov.ng` typo in `user.controller.ts:99` and `staff.service.ts:505` is replaced with `${process.env.PUBLIC_APP_URL || 'https://oyoskills.com'}/verify-staff/${user.id}` — using env var with correct fallback.

6. **AC#6 — Support email updated:** `ActivationWizard.tsx` `mailto:` link uses the new domain email (e.g., `support@oyoskills.com`).

7. **AC#7 — SUPER_ADMIN_EMAIL typo fixed:** Any reference to `alerts@oslsr.gov.ng` (reversed "oslsr" vs "oslrs") is corrected or removed.

8. **AC#8 — Documentation updated:** All developer guides, architecture docs, infrastructure playbook, and team-context-brief reflect `oyoskills.com`. At minimum: `docs/team-context-brief.md`, `docs/infrastructure-cicd-playbook.md`, and `_bmad-output/planning-artifacts/architecture.md`.

9. **AC#9 — VPS configuration documented:** Story provides a clear VPS migration runbook section with exact commands for: NGINX `server_name` update, Let's Encrypt SSL cert for `oyoskills.com`, `.env` updates (`PUBLIC_APP_URL`, `EMAIL_FROM_ADDRESS`, `SUPER_ADMIN_EMAIL`, `VITE_API_URL`), and Resend domain verification.

10. **AC#10 — Zero test regressions:** Full test suite passes (`pnpm test`). No broken imports, no missing domain references, no snapshot mismatches.

## Prerequisites / Blockers

- **BLOCKING:** Domain `oyoskills.com` must be purchased and DNS A record pointed to the VPS IP before VPS-side deployment.
- **Awwal must confirm:** Email domain preference — `noreply@oyoskills.com` or keep `oyotradeministry.com.ng` for emails?
- **Awwal must confirm:** 301 redirect from `oyotradeministry.com.ng` → `oyoskills.com` during transition?
- **Awwal must confirm:** ODK Central subdomain strategy — `odkcentral.oyoskills.com` or keep separate?

## Tasks / Subtasks

- [SUPERSEDED BY 9-5] Task 1: Update API source code domain references (AC: #1, #5, #7)
  - [SUPERSEDED] 1.1 `email.service.ts` SUPPORT_URL → uses `PUBLIC_APP_URL` env var (9-5 Task 2.1)
  - [NO CHANGE NEEDED] 1.2 `providers/index.ts:105` — already uses `EMAIL_FROM_ADDRESS` env var, default is correct
  - [NO CHANGE NEEDED] 1.3 `packages/config/src/email.ts:106` — Zod default is correct, env var overrides
  - [SUPERSEDED] 1.4 `user.controller.ts` typo fix → fixed by 9-5 Task 2.2
  - [SUPERSEDED] 1.5 `staff.service.ts` typo fix → fixed by 9-5 Task 2.3
  - [SUPERSEDED] 1.6 Grep verification → done as part of 9-5

- [PARTIALLY SUPERSEDED] Task 2: Update frontend meta tags & SEO files (AC: #2)
  - [SUPERSEDED] 2.1 `index.html` meta tags → 9-5 makes these dynamic via `%VITE_PUBLIC_URL%`
  - [REMAINS] 2.2 `robots.txt:14` — static file, needs find-replace on migration day
  - [REMAINS] 2.3 `sitemap.xml` 26 entries — static file, needs find-replace on migration day
  - [SUPERSEDED] 2.4 Grep verification → done as part of 9-5

- [SUPERSEDED BY 9-5] Task 3: Update frontend component email references (AC: #6)
  - [SUPERSEDED] 3.1 ActivationWizard → centralized to site.config.ts (9-5 Task 3.1)
  - [SUPERSEDED] 3.2 ContactPage, SupportLandingPage, EmployersPage → centralized (9-5 Task 3.2-3.4)

- [SUPERSEDED BY 9-5] Task 4: Update CI/CD pipeline (AC: #3)
  - [SUPERSEDED] 4.1 CI/CD `VITE_API_URL` → 9-5 moves to GitHub Actions variable
  - [SUPERSEDED] 4.2 Workflow file check → done as part of 9-5

- [SUPERSEDED BY 9-5] Task 5: Update test files & regenerate snapshots (AC: #4)
  - [SUPERSEDED] 5.1-5.5 → 9-5 makes tests import from config/constants instead of hardcoding
  - [SUPERSEDED] 5.6-5.7 ViewAs mock emails → fixed by 9-5
  - [SUPERSEDED] 5.8 Test verification → done as part of 9-5

- [REMAINS] Task 6: Update documentation (AC: #8)
  - [REMAINS] 6.1-6.6 — All documentation updates still needed on migration day

- [REMAINS] Task 7: Create VPS migration runbook in Dev Notes (AC: #9)
  - [REMAINS] 7.1-7.6 — VPS ops runbook already written in this story's Dev Notes. Execute on migration day.

- [SUPERSEDED BY 9-5] Task 8: Final verification (AC: #10)
  - [SUPERSEDED] 8.1-8.3 → verified during 9-5 implementation

## Dev Notes

### Scope & Strategy

This is a **bulk find-and-replace story** with surgical precision. The changes are straightforward string replacements, but the risk is missing references or breaking test assertions. The approach:

1. Update source code (production impact)
2. Update tests (must match source changes)
3. Regenerate snapshots (delete old, run tests)
4. Update docs (no runtime impact, but important for onboarding)
5. Document VPS steps (manual execution by Awwal after code deploy)

### Domain Reference Inventory (Verified via codebase grep)

**Source code — 8 files, ~12 references:**

| File | Line(s) | Current Value | New Value |
|------|---------|---------------|-----------|
| `apps/api/src/services/email.service.ts` | 33 | `'https://oyotradeministry.com.ng'` | `process.env.PUBLIC_APP_URL \|\| 'https://oyoskills.com'` |
| `apps/api/src/providers/index.ts` | 105 | `'noreply@oyotradeministry.com.ng'` | `'noreply@oyoskills.com'` |
| `packages/config/src/email.ts` | 106 | `'noreply@oyotradeministry.com.ng'` | `'noreply@oyoskills.com'` |
| `apps/api/src/controllers/user.controller.ts` | 99 | `'https://oslrs.oyostate.gov.ng'` (TYPO) | `process.env.PUBLIC_APP_URL \|\| 'https://oyoskills.com'` |
| `apps/api/src/services/staff.service.ts` | 505 | `'https://oslrs.oyostate.gov.ng'` (TYPO) | `process.env.PUBLIC_APP_URL \|\| 'https://oyoskills.com'` |
| `apps/web/index.html` | 19,24,27,34 | `oyotradeministry.com.ng` | `oyoskills.com` |
| `apps/web/public/robots.txt` | 14 | `oyotradeministry.com.ng` | `oyoskills.com` |
| `apps/web/public/sitemap.xml` | 26 entries | `oyotradeministry.com.ng` | `oyoskills.com` |

**Frontend component — 1 file:**

| File | Line(s) | Current Value | New Value |
|------|---------|---------------|-----------|
| `ActivationWizard.tsx` | 136, 270 | `mailto:support@oslsr.gov.ng` | `mailto:support@oyoskills.com` |

**CI/CD — 1 file:**

| File | Line | Current Value | New Value |
|------|------|---------------|-----------|
| `.github/workflows/ci-cd.yml` | 595 | `VITE_API_URL=https://oyotradeministry.com.ng/api/v1` | `VITE_API_URL=https://oyoskills.com/api/v1` |

**Tests — 6 files, ~15 references:**

| File | Line(s) | Type |
|------|---------|------|
| `apps/api/src/__tests__/csp.test.ts` | 84 | Domain in CSP report |
| `apps/api/src/routes/__tests__/csp.routes.test.ts` | 25,28,45,47,50,76 | Domain in CSP test data |
| `apps/api/src/providers/__tests__/email-providers.test.ts` | 272 | Expected fromAddress |
| `apps/api/src/services/__tests__/email-templates.test.ts` | 66 | Domain assertion |
| `apps/api/src/services/__tests__/__snapshots__/email-templates.test.ts.snap` | 43,70 | DELETE & regenerate |
| `apps/web/src/features/dashboard/pages/__tests__/ViewAsDashboardPage.test.tsx` | 79 | Mock email |
| `apps/web/src/features/dashboard/components/__tests__/ViewAsBanner.test.tsx` | 28 | Mock email |

**Documentation — 10+ files** (lower priority, no runtime impact)

### Verification URL Pattern Fix

Two files have a typo `oslrs.oyostate.gov.ng` (note: "oslrs" not "oslsr"). Both should use the `PUBLIC_APP_URL` env var pattern:
```typescript
// BEFORE (both user.controller.ts:99 and staff.service.ts:505):
verificationUrl: `${process.env.PUBLIC_APP_URL || 'https://oslrs.oyostate.gov.ng'}/verify-staff/${user.id}`

// AFTER:
verificationUrl: `${process.env.PUBLIC_APP_URL || 'https://oyoskills.com'}/verify-staff/${user.id}`
```

### SUPPORT_URL Pattern Fix

The `email.service.ts` hardcodes SUPPORT_URL. Change to use env var so it works across environments:
```typescript
// BEFORE:
private static readonly SUPPORT_URL = 'https://oyotradeministry.com.ng';

// AFTER:
private static readonly SUPPORT_URL = process.env.PUBLIC_APP_URL || 'https://oyoskills.com';
```

### Snapshot Regeneration

Delete `apps/api/src/services/__tests__/__snapshots__/email-templates.test.ts.snap` before running tests. Vitest will regenerate it with the new domain. Do NOT manually edit the snapshot.

### VPS Migration Runbook (for Awwal — execute AFTER code deploys)

```bash
# 1. DNS: Point oyoskills.com A record to VPS IP (via domain registrar)

# 2. SSL Certificate (on VPS):
sudo certbot certonly --nginx -d oyoskills.com -d www.oyoskills.com

# 3. Update NGINX config:
sudo nano /etc/nginx/sites-available/oslsr.conf
# Change: server_name oyotradeministry.com.ng → server_name oyoskills.com www.oyoskills.com
# Change: ssl_certificate paths to /etc/letsencrypt/live/oyoskills.com/
# Add 301 redirect server block (optional):
# server { listen 80; server_name oyotradeministry.com.ng; return 301 https://oyoskills.com$request_uri; }
sudo nginx -t && sudo systemctl reload nginx

# 4. Update .env on VPS (BEFORE deploying new code — SEC-3 lesson):
# PUBLIC_APP_URL=https://oyoskills.com
# EMAIL_FROM_ADDRESS=noreply@oyoskills.com
# SUPER_ADMIN_EMAIL=admin@oyoskills.com
# (Then deploy code, then rebuild):
# VITE_API_URL=https://oyoskills.com/api/v1 pnpm --filter @oslsr/web build

# 5. Resend domain verification:
# Add SPF, DKIM, MX records for oyoskills.com in domain registrar
# Verify in Resend dashboard

# 6. Verify:
curl -I https://oyoskills.com  # Should return 200
curl -I https://oyoskills.com/api/v1/health  # Should return 200
```

### What NOT to Touch

- **`apps/api/src/services/marketplace-edit.service.ts:104`** — Already uses `process.env.PUBLIC_APP_URL` env var. No code change needed, just set the env var on VPS.
- **`.env.example`** — Uses generic `yourdomain.com` placeholders. Leave as-is.
- **`dist/` directories** — Auto-generated on build. Do not manually edit.
- **ODK Central domain** — Out of scope unless Awwal confirms migration. ODK is on a separate droplet.

### Deployment Safety (CRITICAL)

Per SEC-3 crash loop lesson and project-context.md:
1. **Set all env vars on VPS BEFORE deploying the code change**
2. **Specifically:** `PUBLIC_APP_URL`, `EMAIL_FROM_ADDRESS`, `SUPER_ADMIN_EMAIL` must be updated in `.env` on VPS before `git pull` + `pnpm build`
3. **DNS propagation:** Verify `oyoskills.com` resolves to VPS IP before deploying (`dig oyoskills.com`)
4. **SSL cert:** Must be generated on VPS before NGINX config references it
5. **Rollback plan:** Keep old NGINX config as `.conf.bak`, keep old `.env` as `.env.bak`

### Project Structure Notes

- All changes are in existing files — no new files created (except snapshot regeneration)
- No new dependencies
- No database changes
- No new API endpoints
- Build output auto-updates from source changes
- Documentation changes are non-blocking and can be done in parallel

### Previous Story Intelligence (Story 9-1)

Story 9-1 (Profile Page) is independent of this story. No code conflicts expected. Both can be implemented in parallel. However, if 9-1 is implemented first and adds new files with domain references (unlikely), verify those files too.

### References

- [Source: `_bmad-output/implementation-artifacts/polish-and-migration-plan-2026-03-14.md` — Section 3]
- [Source: `docs/infrastructure-cicd-playbook.md` — Architecture Overview, VPS Provisioning]
- [Source: `docs/team-context-brief.md` — Critical Deployment Notes]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — NGINX Configuration, Environment Variables]
- [Source: `apps/api/src/services/email.service.ts:31-33` — SUPPORT_URL + APP_URL]
- [Source: `apps/api/src/providers/index.ts:105` — email fromAddress fallback]
- [Source: `apps/web/index.html:19-34` — meta tags]
- [Source: `.github/workflows/ci-cd.yml:595` — CI build command]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
