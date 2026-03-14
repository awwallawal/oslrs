# Polish, Profile & Domain Migration Plan

**Date:** 2026-03-14
**Status:** Draft — Pending decisions from Awwal before story creation

---

## Context

After a full codebase audit (UI/UX, profile page, Trust section, domain references), the following items were identified as the next wave of work. The app is production-ready from a UI/UX completeness standpoint (80+ pages, 9 roles, WCAG 2.1 AA, mobile-responsive). What follows is polish, infrastructure maturity, and a domain migration.

---

## 1. Profile Page — Editable (HIGH PRIORITY)

### Bug: `/auth/me` doesn't return `fullName`

After session restore (page refresh), the profile page shows an empty name. The `/auth/me` endpoint only returns `id`, `email`, `role`, `lgaId`, `rememberMe` — it does NOT return `fullName`. This means `fullName` is only populated on fresh login and is lost on refresh.

### Current State

- **Location:** `apps/web/src/features/dashboard/pages/ProfilePage.tsx`
- **Shows:** Full Name (broken after refresh), Email, Role, Status (hardcoded "Active"), Avatar with initials
- **Code comment:** "Profile editing features will be implemented in a future story"
- **No `PATCH /user/profile` endpoint exists**

### Proposed Scope

**Read (fix what's broken):**
- Fix `/auth/me` to return `fullName`, `phone`, `status`, `lgaId`
- Display: name, email, phone, role, assigned LGA/ward (resolved name), account status, member since date, selfie photo if available

**Write (new capability):**
- New `PATCH /user/profile` endpoint
- Editable fields: `fullName`, `phone`, `homeAddress`, `nextOfKinName`, `nextOfKinPhone`, `bankName`, `accountNumber`, `accountName`
- Frontend edit form with field validation
- Success toast on save
- **NOT editable by user:** role, email, status, NIN, LGA assignment (admin-controlled fields)

### Key Files

- `apps/api/src/controllers/auth.controller.ts` — `/auth/me` handler
- `apps/api/src/services/auth.service.ts` — session restore logic
- `apps/web/src/features/auth/context/AuthContext.tsx` — `AuthUser` interface
- `apps/web/src/features/dashboard/pages/ProfilePage.tsx` — profile page component
- `apps/api/src/routes/user.routes.ts` — user routes (needs new PATCH route)
- `apps/api/src/controllers/user.controller.ts` — user controller
- `apps/api/src/db/schema/users.ts` — full schema with all available fields

---

## 2. Trust Section Refresh (LOW EFFORT)

### Current State

- **Location:** `apps/web/src/features/home/sections/TrustSection.tsx`
- Two logos: Oyo State Coat of Arms (`oyo-coat-of-arms.png`, 354KB) and Ministry Logo (`oyo-state-logo.svg`, 45KB)
- NDPA Compliance badge (Shield icon, green)
- Trust statement paragraph
- Privacy policy link

### Proposed Changes

- **Remove one logo** — Awwal wants the "black and white" logo removed. **DECISION NEEDED:** Which one — the Coat of Arms (crest/seal) or the Ministry Logo (text-based)?
- Keep NDPA badge, trust statement, and privacy link as-is
- Optionally add a secondary security icon (Lock or ShieldCheck from Lucide) for visual reinforcement
- Keep the section clean — its job is reassurance, not decoration

### Logo Files Available

| File | Format | Size | Notes |
|------|--------|------|-------|
| `oyo-coat-of-arms.png` | PNG | 354 KB | Used in Trust, Header, Sidebar, Footer, AuthLayout, Leadership |
| `oyo-coat-of-arms.svg` | SVG | 154 KB | Vector version |
| `oyo-state-logo.png` | PNG | 19 KB | Ministry logo (color) |
| `oyo-state-logo.svg` | SVG | 45 KB | Ministry logo (color, vector) |
| `oyo-state-logo-white.png` | PNG | 17 KB | White variant for dark backgrounds (footer) |

---

## 3. Domain Migration: `oyotradeministry.com.ng` -> `oslrs.com` (CRITICAL PATH)

### Rationale

- `oslrs.gov.ng` was the intended domain but `.gov.ng` has bureaucratic red tape
- `oyotradeministry.com.ng` is the current live/testing domain
- `oslrs.com` is the target — clean TLD, no government dependency

### Impact Assessment: 28 files, ~75+ references

#### Immediate (Required for functionality)

| # | File | What to Change |
|---|------|---------------|
| 1 | `.env` | `ODK_CENTRAL_URL`, `EMAIL_FROM_ADDRESS`, `SUPER_ADMIN_EMAIL` |
| 2 | `.github/workflows/ci-cd.yml` | `VITE_API_URL` build command |
| 3 | `apps/api/src/services/email.service.ts` | `SUPPORT_URL` constant |
| 4 | `packages/config/src/email.ts` | Default `fromAddress` |
| 5 | `apps/web/index.html` | Canonical, og:url, og:image, twitter:image meta tags |
| 6 | `apps/web/public/robots.txt` | Sitemap URL |
| 7 | `apps/web/public/sitemap.xml` | All 28 URL entries |

#### Secondary (Tests & snapshots)

| # | File | What to Change |
|---|------|---------------|
| 8 | `apps/api/src/services/__tests__/email-templates.test.ts` | Test assertions |
| 9 | `apps/api/src/providers/__tests__/email-providers.test.ts` | Default email test |
| 10 | `apps/api/src/__tests__/csp.test.ts` | CSP test URIs |
| 11 | `apps/api/src/routes/__tests__/csp.routes.test.ts` | CSP violation test data |
| 12 | `apps/api/src/services/__tests__/__snapshots__/email-templates.test.ts.snap` | Email template snapshots |

#### Documentation (10 files)

- `docs/infrastructure-cicd-playbook.md`
- `docs/team-context-brief.md`
- `docs/RESEND-SETUP.md`
- `docs/SESSION-NOTES-2026-01-20-VPS-SETUP.md`
- `docs/SESSION-NOTES-2026-01-24-EPIC2-PREP.md`
- `CHANGELOG.md`
- Various `_bmad-output/implementation-artifacts/` files

#### VPS Configuration (not in codebase)

- NGINX `server_name` directives and SSL certs
- VPS `.env` file
- Resend domain verification

### Decisions Needed

1. **ODK Central** — does `odkcentral.oyotradeministry.com.ng` become `odkcentral.oslrs.com`?
2. **Redirect** — 301 redirect from `oyotradeministry.com.ng` to `oslrs.com` during transition?
3. **Email domain** — `noreply@oslrs.com` or keep `.com.ng` for emails?
4. **Has `oslrs.com` been purchased?**

### Note: Typo in `.env`

`SUPER_ADMIN_EMAIL=alerts@oslsr.gov.ng` — "oslsr" should be "oslrs". Fix during migration.

---

## 4. Email Setup with Resend

### Transactional Email (`noreply@oslrs.com`)

1. Add `oslrs.com` as a domain in Resend dashboard
2. Add DNS records Resend provides (SPF, DKIM, MX for bounce handling)
3. Verify the domain
4. Update `EMAIL_FROM_ADDRESS` in `.env` to `noreply@oslrs.com`
5. Update default in `packages/config/src/email.ts`

### Human-Facing Email (`admin@oslrs.com`, `support@oslrs.com`)

Options:
- **Zoho Mail free tier** — up to 5 users, custom domain
- **Cloudflare Email Routing** — free forwarding to personal inbox (if using Cloudflare for DNS)
- **Google Workspace** — paid, overkill for now

Recommendation: Zoho or Cloudflare forwarding to start.

---

## 5. Minor Polish Items (FROM UI/UX AUDIT)

| Item | Location | Fix |
|------|----------|-----|
| Footer "Insights" column says "Coming Soon" | `apps/web/src/layouts/components/Footer.tsx` | Wire up links — Insights pages already exist (Epic 8.5) |
| Contact page map | `apps/web/src/features/support/pages/ContactPage.tsx` | Low priority — address text is sufficient |
| Employer Marketplace preview | Employers page | Future epic — leave it |
| `SUPER_ADMIN_EMAIL` typo | `.env` | Fix `oslsr` -> `oslrs` during migration |

---

## Recommended Execution Order

1. **Buy `oslrs.com`** — blocks domain migration and email setup
2. **Profile page story** — editable profile + `/auth/me` fix (independent of domain)
3. **Domain migration story** — all 28 files + DNS + NGINX + Resend verification
4. **Trust section + footer fix** — bundle as small polish chore alongside migration
5. **Email setup** — do in parallel with step 3 (DNS work anyway)

---

## Open Questions for Awwal

- [ ] Which logo to remove from Trust section? (Coat of Arms or Ministry Logo)
- [ ] Has `oslrs.com` been purchased/secured?
- [ ] ODK Central subdomain — migrate to `oslrs.com` or keep separate?
- [ ] 301 redirect from old domain — yes or no?
- [ ] Email addresses on `oslrs.com` or keep `.com.ng`?
- [ ] Human-facing email preference: Zoho free, Cloudflare forwarding, or other?
