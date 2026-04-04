# Story 9.3: Trust Section & Footer Minor Polish

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **public visitor**,
I want the **Trust section to display the correct logo and the footer Insights column to link to real pages instead of showing "Coming Soon"**,
so that **the website feels complete, professional, and I can discover labour market insights from the footer navigation**.

## Acceptance Criteria

1. **AC#1 — Trust section logo removal:** One logo is removed from `TrustSection.tsx` per Awwal's decision. The remaining logo, NDPA badge, trust statement, and privacy link remain unchanged. Layout adjusts cleanly (no visual gaps or centering issues).

2. **AC#2 — Footer Insights column wired:** The footer "Insights" column replaces "Coming Soon" text with 3 working links: "Labour Force Overview" (`/insights`), "Skills Map" (`/insights/skills`), "Trends" (`/insights/trends`). Links use the same styling as other footer columns.

3. **AC#3 — Footer Insights links navigate correctly:** Clicking each footer Insights link navigates to the corresponding public insights page. Pages render correctly (they already exist from Epic 8.5).

4. **AC#4 — Responsive layout intact:** Trust section and footer render correctly on mobile (375px), tablet (768px), and desktop (1280px). No layout breaks, overflow, or spacing issues.

5. **AC#5 — Tests pass:** No test regressions. If existing footer/TrustSection tests exist, update assertions. If new links are added, verify via quick smoke check.

## Prerequisites / Blockers

- **DECISION NEEDED from Awwal:** Which logo to remove from Trust section? The "black and white" one — is it the **Coat of Arms** (crest/seal, `oyo-coat-of-arms.png`, 354KB) or the **Ministry Logo** (text-based, `oyo-state-logo.svg`, 45KB)?
- If Awwal hasn't decided yet, the dev can implement the footer fix (AC#2-3) independently and defer AC#1.

## Tasks / Subtasks

- [ ] Task 1: Remove one logo from TrustSection (AC: #1, #4)
  - [ ] 1.1 Confirm with Awwal which logo to remove (Coat of Arms or Ministry Logo)
  - [ ] 1.2 In `apps/web/src/features/home/sections/TrustSection.tsx`, remove the corresponding `<img>` element
  - [ ] 1.3 Verify remaining layout centers properly with one logo + NDPA badge
  - [ ] 1.4 Test responsive behavior at 375px, 768px, 1280px widths
  - [ ] 1.5 Do NOT remove the image asset files from `apps/web/public/images/` — they are used elsewhere (Header, Footer, Sidebar, AuthLayout, LeadershipPage, ID card PDF)

- [ ] Task 2: Wire footer Insights column links (AC: #2, #3)
  - [ ] 2.1 In `apps/web/src/layouts/components/Footer.tsx`, replace the "Coming Soon" placeholder (lines ~127-132) with 3 `<Link>` elements
  - [ ] 2.2 Use the same link styling as other footer columns (e.g., ABOUT, SUPPORT columns)
  - [ ] 2.3 Links to add:
    - "Labour Force Overview" → `/insights`
    - "Skills Map" → `/insights/skills`
    - "Trends" → `/insights/trends`
  - [ ] 2.4 Do NOT add a "Reports" link — it doesn't exist yet (kept as `comingSoon: true` in NavDropdown)

- [ ] Task 3: Verify & test (AC: #4, #5)
  - [ ] 3.1 Run `pnpm test` — confirm zero regressions
  - [ ] 3.2 Visual check: homepage Trust section layout
  - [ ] 3.3 Visual check: footer Insights links navigate correctly
  - [ ] 3.4 Responsive check: mobile, tablet, desktop

## Dev Notes

### TrustSection — Current Structure

**File:** `apps/web/src/features/home/sections/TrustSection.tsx`

```tsx
{/* Trust badges — flex row, gap-8, centered */}
<div className="flex flex-wrap items-center justify-center gap-8 mb-10">
  {/* 1. Oyo State Seal — oyo-coat-of-arms.png, h-20 */}
  <img src="/images/oyo-coat-of-arms.png" alt="Oyo State Seal" className="h-20 w-auto" ... />

  {/* 2. Ministry Logo — oyo-state-logo.svg, h-16 */}
  <img src="/images/oyo-state-logo.svg" alt="Ministry of Trade..." className="h-16 w-auto" ... />

  {/* 3. NDPA Badge — Lucide Shield icon, green pill */}
  <div className="flex items-center gap-2 px-4 py-2 bg-success-100 rounded-full">
    <Shield className="w-5 h-5 text-success-600" />
    <span className="text-success-600 font-medium text-sm">NDPA Compliant</span>
  </div>
</div>
```

To remove a logo, simply delete the corresponding `<img>` element. The `flex-wrap justify-center` layout will auto-adjust — no spacing fixes needed.

**DO NOT delete image files** — the logos are used in 12 files across the codebase:
- `Header.tsx`, `Footer.tsx`, `DashboardHeader.tsx`, `DashboardSidebar.tsx`, `DashboardLayout.tsx`, `AuthLayout.tsx`, `LeadershipPage.tsx`
- Backend: `user.controller.ts`, `staff.service.ts`, `export.service.ts`, `policy-brief.service.ts` (PDF generation)

### Footer — Current Insights Column

**File:** `apps/web/src/layouts/components/Footer.tsx` (~lines 127-132)

```tsx
{/* INSIGHTS Column - Coming Soon per AC1 */}
<div>
  <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
    Insights
  </h3>
  <p className="text-neutral-500 text-sm italic">Coming Soon</p>
</div>
```

Replace with links matching the pattern from other columns (e.g., ABOUT column ~lines 88-110):

```tsx
<div>
  <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
    Insights
  </h3>
  <ul className="space-y-3">
    <li>
      <Link to="/insights" className="text-neutral-400 hover:text-white transition-colors text-sm">
        Labour Force Overview
      </Link>
    </li>
    <li>
      <Link to="/insights/skills" className="text-neutral-400 hover:text-white transition-colors text-sm">
        Skills Map
      </Link>
    </li>
    <li>
      <Link to="/insights/trends" className="text-neutral-400 hover:text-white transition-colors text-sm">
        Trends
      </Link>
    </li>
  </ul>
</div>
```

The `Link` component is already imported in Footer.tsx (used by other columns). The styling classes match other footer link columns exactly.

### Insights Pages Already Exist

All 3 target pages are live and routed (Epic 8.5):

| Page | Route | Component | Location |
|------|-------|-----------|----------|
| Labour Force Overview | `/insights` | `PublicInsightsPage` | `apps/web/src/features/insights/pages/PublicInsightsPage.tsx` |
| Skills Map | `/insights/skills` | `SkillsMapPage` | `apps/web/src/features/insights/pages/SkillsMapPage.tsx` |
| Trends | `/insights/trends` | `InsightsTrendsPage` | `apps/web/src/features/insights/pages/TrendsPage.tsx` |

Routes configured in `apps/web/src/App.tsx:466-471`. Navbar dropdown already has working links to all 3 pages. Only the footer is stale.

### What NOT to Touch

- **NavDropdown.tsx** — Already has correct Insights items with working links. "Reports" item is correctly marked `comingSoon: true`. Leave as-is.
- **MobileNav.tsx** — Already has correct Insights expandable section. Leave as-is.
- **Logo asset files** — Do not delete any images from `apps/web/public/images/`. Other components depend on them.
- **Footer bottom bar** — Coat of Arms seal in bottom bar is separate from Trust section decision. Leave as-is.

### Scope Boundaries

This is a **small polish story** (~15 minutes of dev work):
- 2 files modified: `TrustSection.tsx` (remove 1 `<img>` tag) and `Footer.tsx` (replace 2 lines with ~15 lines of links)
- No new files
- No backend changes
- No new dependencies
- No database changes
- No new tests needed (unless existing tests assert "Coming Soon" text)

### Project Structure Notes

- `TrustSection.tsx` is in `apps/web/src/features/home/sections/` (public homepage sections)
- `Footer.tsx` is in `apps/web/src/layouts/components/` (shared layout components)
- Both are purely presentational — no hooks, no API calls, no state management

### References

- [Source: `_bmad-output/implementation-artifacts/polish-and-migration-plan-2026-03-14.md` — Sections 2, 5]
- [Source: `apps/web/src/features/home/sections/TrustSection.tsx` — full component]
- [Source: `apps/web/src/layouts/components/Footer.tsx` — Insights column lines 127-132]
- [Source: `apps/web/src/App.tsx:466-471` — public insights routes]
- [Source: `apps/web/src/layouts/components/NavDropdown.tsx:41-49` — insights nav items definition]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
