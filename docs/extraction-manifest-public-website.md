# Public Website Extraction Manifest & Replication Guide

**Source Project:** OSLRS (Oyo State Labour & Skills Registry)
**Target Project:** VLPRS (Vehicle Loan Processing & Receivables System)
**Author:** PM Agent (John) + Awwal
**Date:** 2026-02-22
**Part of:** Portable Playbook

---

## What Makes It Look Good — The Visual DNA

Before you copy files, understand the 8 design decisions that create the aesthetic:

### 1. Two-Font Hierarchy (Poppins + Inter)
- **Poppins** (600 weight) for all headings — gives warmth and authority. Government-grade but not stiff.
- **Inter** (400-600 weights) for everything else — clean, legible, modern.
- The contrast between a rounded heading font and a geometric body font is what makes it feel "designed" rather than "default."

### 2. Restrained Color with One Bold Accent
- **90% neutral** (grays: #1F2937 for text, #F9FAFB for backgrounds)
- **10% brand color** (primary-600) used surgically: CTAs, links, icon backgrounds, accent text in headings
- Alternating section backgrounds (white → neutral-50 → white) create visual rhythm without color overload
- Light primary tints (primary-50, primary-100) for subtle warmth in hero/card backgrounds

### 3. Generous Whitespace on a 4px Grid
- Sections breathe: `py-16 lg:py-24` (64-96px vertical padding)
- Content never crowds the edges: `px-4 sm:px-6 lg:px-8`
- Elements within sections have consistent `gap-6` or `gap-8`
- The 4px baseline grid (0.25rem increments) keeps everything aligned

### 4. Subtle Elevation & Borders (Not Flat, Not Heavy)
- Cards use `border border-neutral-200 shadow-sm rounded-xl` — visible but gentle
- Hover states add `shadow-md` and shift border to `primary-300` — interactive without being loud
- The header uses `bg-white/95 backdrop-blur` — frosted glass effect that signals modern craft

### 5. Hero Section with Gradient Blobs
- Background: `bg-gradient-to-b from-primary-50 to-white` — warm start, clean exit
- Two decorative blobs (absolute positioned, blur-3xl, 20-30% opacity) add depth without distraction
- This single technique makes the hero feel "premium" vs. a flat color block

### 6. Consistent Card Pattern
- Every card follows: `bg-white rounded-xl border border-neutral-200 p-6`
- Icon badge in top-left: `w-12 h-12 rounded-lg bg-primary-100` with `w-6 h-6 text-primary-600` icon
- Title → Description → Optional CTA link with arrow
- Hover: border shifts to primary, shadow deepens. Transition: 300ms.

### 7. Typography Scale That Respects Hierarchy
- Only H1 on the hero (36-60px depending on viewport)
- H2 for every section heading (30-36px)
- H3 for card/subsection titles (24px)
- Body text at 16px with 1.5 line-height
- Each level visually distinct. No ambiguity about what's important.

### 8. Self-Hosted Fonts with LCP Optimization
- Poppins-600 preloaded (critical for hero paint)
- Hero shell pre-rendered in HTML before React hydration
- Result: the page *looks* loaded before JavaScript finishes. This "fast feel" is part of the aesthetic.

---

## File Extraction Manifest

### Tier 1: Copy As-Is (Core Design System)

These files transfer directly. Only the brand color values change.

| File | Purpose | What to Change for VLPRS |
|------|---------|--------------------------|
| `apps/web/src/index.css` | All design tokens, CSS custom properties, animations, base styles | Swap primary color scale (#9C1E23 maroon → VLPRS crimson/color TBD) |
| `apps/web/public/fonts/fonts.css` | Self-hosted font declarations (Inter, Poppins) | Nothing — same fonts work for VLPRS |
| `apps/web/public/fonts/*.woff2` | Font files (Inter variable, Poppins 500/600/700) | Nothing — copy all font files |
| `apps/web/index.html` | Font preloading, hero shell CSS, meta tags | Swap page title, meta description, hero shell color values |
| `apps/web/src/components/ui/button.tsx` | Button component with CVA variants | Nothing |
| `apps/web/src/components/ui/card.tsx` | Card component (composite) | Nothing |
| `apps/web/src/components/ui/badge.tsx` | Badge component with pill variants | Nothing |
| `apps/web/src/components/ui/accordion.tsx` | Accordion with slide animations | Nothing |
| `apps/web/src/components/ui/alert-dialog.tsx` | Dialog component | Nothing |
| `apps/web/src/components/ui/input.tsx` | Input component | Nothing |
| `apps/web/src/components/ui/navigation-menu.tsx` | Desktop navigation menu (Radix) | Nothing |
| `apps/web/src/components/ui/sheet.tsx` | Mobile slide drawer (Radix) | Nothing |
| `apps/web/src/components/ui/select.tsx` | Select component | Nothing |
| `apps/web/src/components/ui/tabs.tsx` | Tab component | Nothing |

### Tier 2: Copy + Rebrand (Layout Shell)

These files provide the page structure. Content changes, structure stays.

| File | Purpose | What to Change for VLPRS |
|------|---------|--------------------------|
| `apps/web/src/layouts/PublicLayout.tsx` | Public page wrapper (ErrorBoundary + SkipLink + Header + main + Footer) | Nothing structural — just import paths if file locations change |
| `apps/web/src/layouts/components/Header.tsx` | Sticky header with logo, nav, CTA | Swap: logo image, wordmark text ("Vehicle Loan Scheme"), nav items per FR77 |
| `apps/web/src/layouts/components/Footer.tsx` | Dark footer with 6-column grid, social links, legal strip | Swap: description text, link sections per VLPRS structure, "NDPA Compliant" badge |
| `apps/web/src/layouts/components/NavDropdown.tsx` | Desktop navigation dropdown | Swap: menu items and links per VLPRS nav structure (FR77) |
| `apps/web/src/layouts/components/MobileNav.tsx` | Mobile hamburger menu (Sheet drawer) | Swap: same menu items as NavDropdown |

### Tier 3: Copy + Replace Content (Page Templates)

These are the reusable patterns. Copy the structure, replace the words.

| File | Purpose | What to Change for VLPRS |
|------|---------|--------------------------|
| `apps/web/src/features/home/components/SectionWrapper.tsx` | Section container with background variants (default/light/dark/primary) | Nothing — this is pure layout |
| `apps/web/src/features/home/components/SectionHeading.tsx` | H2 heading with optional subtitle and centering | Nothing — this is pure typography |
| `apps/web/src/features/home/components/FeatureCard.tsx` | Icon + title + description + CTA link card | Nothing — data-driven, pass new content |
| `apps/web/src/features/home/components/StepIndicator.tsx` | Numbered step with connector lines (horizontal desktop, vertical mobile) | Nothing — data-driven |
| `apps/web/src/features/home/sections/HeroSection.tsx` | Hero with gradient, blobs, CTA buttons | Swap: headline text, subtext, button labels, link targets |
| `apps/web/src/features/home/sections/ParticipantsSection.tsx` | 3-card grid | Swap: card content (AG, MDA Officers, Beneficiaries instead of Residents/Workers/Employers) |
| `apps/web/src/features/home/sections/WhatIsSection.tsx` | Text section on light background | Swap: body text |
| `apps/web/src/features/home/sections/HowItWorksSection.tsx` | 4-step process with StepIndicator | Swap: step content (EOI → Review → Committee → Payroll per PRD) |
| `apps/web/src/features/home/sections/FinalCtaSection.tsx` | Dark section with CTA | Swap: heading, subtext, button text |
| `apps/web/src/features/home/HomePage.tsx` | Section composition with lazy loading | Swap: section imports for VLPRS-specific sections (loan tiers, repayment rules, etc.) |
| `apps/web/src/features/about/components/AboutPageWrapper.tsx` | Content page wrapper (gradient hero + content area) | Nothing — pure layout wrapper |

### Tier 4: Study + Recreate (Domain-Specific Pages)

Don't copy these verbatim — they contain OSLRS content. Use them as reference for VLPRS equivalents.

| OSLRS File | VLPRS Equivalent | Pattern to Reuse |
|------------|-----------------|------------------|
| `apps/web/src/features/about/pages/AboutLandingPage.tsx` | `/about` — Programme page (FR82) | Navigation card grid + timeline pattern |
| `apps/web/src/features/support/pages/FAQPage.tsx` | FAQ page (FR79) | Category tabs + accordion pattern |
| `apps/web/src/features/about/pages/*.tsx` (6 about sub-pages) | Scheme info pages (FR78) — Programme Overview, Eligibility, Repayment Rules | AboutPageWrapper + content sections |
| `apps/web/src/features/participate/pages/*.tsx` | How It Works, MDA Guide (FR78-79) | Step-based layout |
| `apps/web/src/features/support/pages/ContactPage.tsx` | Help & Support (FR79) | Contact info + office hours layout |

---

## Brand Swap Guide: OSLRS → VLPRS

### Colors (Single File Change: `index.css`)

Replace the primary color scale. Everything else (neutrals, semantic colors) stays identical.

```
OSLRS (Maroon)              →  VLPRS (TBD — recommend Oyo Crimson or Deep Teal)
--primary-900: #6B1518      →  TBD (darkest)
--primary-700: #861A1F      →  TBD
--primary-600: #9C1E23      →  TBD (main brand color — buttons, links, accents)
--primary-500: #B32329      →  TBD
--primary-300: #E85D61      →  TBD (lighter accent)
--primary-100: #FDEBED      →  TBD (card/section backgrounds)
--primary-50:  #FEF6F6      →  TBD (hero gradient start)
```

**Recommendation for VLPRS:** Since this is also Oyo State Government, you could use the same maroon OR differentiate with a deep teal/navy to signal "finance" vs "labour." The AG's office might appreciate a distinct identity. Awwal to decide.

### Logo

| OSLRS | VLPRS |
|-------|-------|
| Oyo State coat of arms (40px in header) | Same coat of arms (it's the same government) |
| White variant in footer | Same |

The logo likely stays the same — both are Oyo State Government systems. The wordmark text changes:
- OSLRS: "Oyo State Labour & Skills Registry"
- VLPRS: "Vehicle Loan Scheme" (per FR77)

### Content Mapping (Homepage Sections)

| OSLRS Section | VLPRS Equivalent | Source |
|---|---|---|
| HeroSection ("Building Oyo State's skills registry") | Hero ("Vehicle Loan Scheme — managed, computed, transparent") | FR76 hero |
| WhatIsSection (what is OSLRS) | Official Programme Notice (committee-based, payroll deduction, audit-trail) | FR76 |
| ParticipantsSection (Residents, Workers, Employers) | "Who VLPRS Serves" (AG, Deputy AG, Car Loan Dept, MDA Officers, Beneficiaries) | FR76 |
| HowItWorksSection (4 steps) | "How It Works" (EOI → Review → Committee → Payroll) | FR76, FR78 |
| RequirementsSection | Loan Categories (4 tiers with grade levels and amounts) | FR78 |
| CoverageSection | Repayment & Settlement Rules (accordion: Standard, Accelerated, Early, Retirement) | FR78 |
| MarketplacePreviewSection | Key Capabilities (6 cards: Immutable Ledger, Computed Balances, Auto-Stop, etc.) | FR76 |
| TrustSection | Trust & Compliance (NDPR, audit logging, immutable ledger) | FR76 |
| FinalCtaSection | Final CTA (Staff Portal login + scheme information) | FR76 |

### Navigation Structure

```
OSLRS:                          VLPRS (per FR77):
─ Home                          ─ Home
─ About (dropdown)              ─ About (direct link → /about)
─ Participate (dropdown)        ─ The Scheme (dropdown)
─ Marketplace                     ├ Programme Overview
─ Insights                        ├ Eligibility & Loan Categories
─ Support (dropdown)              ├ Repayment & Settlement Rules
─ Contact                         └ How It Works
                                ─ Resources (dropdown)
                                  ├ FAQ
                                  ├ MDA Submission Guide
                                  ├ Downloads & Forms
                                  └ News & Announcements
                                ─ Help & Support (direct link)
                                ─ [Login CTA → modal with 3 portals]
```

---

## Replication Build Order

For VLPRS, follow this order to get the public website live fastest:

### Step 1: Scaffold (30 minutes)
1. Copy monorepo structure (`apps/web/`, `packages/types/`)
2. Copy all `apps/web/src/components/ui/` files
3. Copy `index.css`, font files, `fonts.css`, `index.html`
4. Copy `vite.config.ts`, `tailwind.config.ts` (if separate), `tsconfig.json`
5. Run `pnpm install` — verify the shell builds

### Step 2: Brand Swap (1 hour)
1. Update primary color scale in `index.css` (7 values)
2. Update `index.html`: page title, meta description, hero shell colors
3. Swap logo file (`/public/logo.svg` or equivalent)
4. Update header wordmark text
5. Update footer content (links, description, legal text)

### Step 3: Layout Shell (2 hours)
1. Copy `PublicLayout.tsx`, `Header.tsx`, `Footer.tsx`
2. Copy `NavDropdown.tsx`, `MobileNav.tsx`
3. Update navigation items to match VLPRS structure (FR77)
4. Update footer links and columns
5. Add login modal with 3 portals (Staff active, Beneficiary + EOI as "Coming Soon")
6. Verify: header renders, footer renders, mobile nav works

### Step 4: Homepage (3-4 hours)
1. Copy `SectionWrapper.tsx`, `SectionHeading.tsx`, `FeatureCard.tsx`, `StepIndicator.tsx`
2. Copy `HomePage.tsx` as template — strip OSLRS sections
3. Build VLPRS sections using FR76 content:
   - HeroSection (value proposition, CTAs)
   - OfficialNoticeSection (programme notice card)
   - WhoWeServeSection (5 role cards — reuse FeatureCard)
   - HowItWorksSection (4 steps — reuse StepIndicator)
   - LoanCategoriesSection (4 tier cards — new, use Card component)
   - RepaymentRulesSection (accordion — reuse Accordion component)
   - KeyCapabilitiesSection (6 cards — reuse FeatureCard)
   - TrustSection (NDPR, audit, immutable ledger)
   - FinalCtaSection (Staff Portal CTA)
4. Lazy-load below-fold sections (copy Suspense pattern)

### Step 5: Content Pages (4-6 hours)
1. Copy `AboutPageWrapper.tsx` as content page template
2. Build pages per FR78-FR82:
   - `/about` — Programme leadership, governance, institutional story
   - `/scheme/overview` — Programme objectives
   - `/scheme/eligibility` — 4 tiers with loan amounts
   - `/scheme/repayment` — Settlement rules (accordion)
   - `/scheme/how-it-works` — 4-step visual
   - `/resources/faq` — Copy FAQ page structure, swap content
   - `/resources/mda-guide` — Step-by-step submission guide
   - `/resources/downloads` — Card grid with download links
   - `/resources/news` — Card list (placeholder)
   - `/support` — Contact info, office hours
   - `/legal/privacy` — NDPR statement
   - `/legal/disclaimer` — Programme disclaimer
   - `/legal/accessibility` — WCAG statement
3. Add content to `src/content/*.ts` files (CMS-ready per PRD)

### Step 6: Polish (2 hours)
1. SEO meta tags for all 17 routes (per wireframes-epic-14.md)
2. Verify responsive behavior at all 3 breakpoints
3. Run accessibility audit (heading hierarchy, focus rings, color contrast)
4. Verify LCP < 2s (hero shell pre-rendering)
5. Test mobile nav, login modal, accordion interactions

**Estimated total: 1-2 days** to have a fully polished VLPRS public website using the OSLRS template, compared to the 8 stories / 1 week it took to build OSLRS's from scratch.

---

## Full Infrastructure Manifest (Beyond Public Website)

For the complete project scaffold (not just the public site), these additional files transfer:

### API Boilerplate
| Source File/Dir | Purpose |
|---|---|
| `apps/api/src/app.ts` | Express setup, middleware chain, error handling |
| `apps/api/src/middleware/` | Auth, RBAC, rate limiting, error handler, validation |
| `apps/api/src/utils/` | AppError, async handler, response helpers |
| `apps/api/src/db/connection.ts` | Drizzle + PostgreSQL connection |
| `apps/api/src/db/seeds/` | Seed pattern (roles, LGAs → adapt for VLPRS MDAs) |
| `apps/api/src/services/email.service.ts` | Resend email integration |
| `apps/api/src/services/audit.service.ts` | Audit logging (fire-and-forget + transactional) |
| `apps/api/src/services/export.service.ts` | PDF/CSV export with branded header |
| `apps/api/src/lib/redis.ts` | Redis client setup |
| `apps/api/src/lib/queue.ts` | BullMQ setup and worker pattern |

### Auth System
| Source File/Dir | Purpose |
|---|---|
| `apps/api/src/controllers/auth.controller.ts` | Login, logout, refresh, password change |
| `apps/api/src/services/auth.service.ts` | JWT + refresh token logic |
| `apps/api/src/middleware/authenticate.ts` | Token verification middleware |
| `apps/api/src/middleware/rbac.ts` | Role authorization (`authorize(roles...)`) |
| `apps/web/src/features/auth/` | Login page, auth context, protected routes |

### Dashboard Shell
| Source File/Dir | Purpose |
|---|---|
| `apps/web/src/layouts/DashboardLayout.tsx` | Sidebar + topbar + content area |
| `apps/web/src/features/dashboard/config/sidebarConfig.ts` | Role-based navigation config |
| `apps/web/src/features/dashboard/components/` | Sidebar, topbar, role route guards |

### Testing Infrastructure
| Source File/Dir | Purpose |
|---|---|
| `apps/api/vitest.config.ts` | API test configuration |
| `apps/web/vitest.config.ts` | Web test configuration |
| `apps/api/src/test/` | Test helpers, DB setup, mock factories |
| `apps/web/src/test/` | Render helpers, mock providers |

### DevOps
| Source File/Dir | Purpose |
|---|---|
| `.github/workflows/` | CI/CD pipeline (lint, test, build, deploy) |
| `docker-compose.yml` | PostgreSQL + Redis local dev |
| `Dockerfile` | Production container |
| `turbo.json` | Monorepo task orchestration |
| `pnpm-workspace.yaml` | Workspace definition |

---

## Notes for Awwal

- **Color decision needed**: Same Oyo maroon for VLPRS, or a differentiated palette? The design system supports either — it's a single variable swap.
- **Content source**: VLPRS PRD FR76-FR82 has all the public website content requirements. The wireframes doc (`wireframes-epic-14.md`) has ASCII wireframes for all 20 pages — use as direct implementation guide.
- **The "beautiful feel" comes from 3 things**: Poppins headings, generous whitespace, and restrained color. Copy those 3 principles and the aesthetic transfers to any government project.
