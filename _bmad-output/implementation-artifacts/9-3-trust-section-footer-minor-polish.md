# Story 9.3: Trust Section & Footer Minor Polish

Status: done

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
- Decision resolved: remove the Ministry Logo (`oyo-state-logo.svg`).

## Tasks / Subtasks

- [x] Task 1: Remove one logo from TrustSection (AC: #1, #4)
  - [x] 1.1 Confirm with Awwal which logo to remove (Coat of Arms or Ministry Logo)
  - [x] 1.2 In `apps/web/src/features/home/sections/TrustSection.tsx`, remove the corresponding `<img>` element
  - [x] 1.3 Verify remaining layout centers properly with one logo + NDPA badge
  - [x] 1.4 Test responsive behavior at 375px, 768px, 1280px widths
  - [x] 1.5 Do NOT remove the image asset files from `apps/web/public/images/` — they are used elsewhere (Header, Footer, Sidebar, AuthLayout, LeadershipPage, ID card PDF)

- [x] Task 2: Wire footer Insights column links (AC: #2, #3)
  - [x] 2.1 In `apps/web/src/layouts/components/Footer.tsx`, replace the "Coming Soon" placeholder (lines ~127-132) with 3 `<Link>` elements
  - [x] 2.2 Use the same link styling as other footer columns (e.g., ABOUT, SUPPORT columns)
  - [x] 2.3 Links to add:
    - "Labour Force Overview" → `/insights`
    - "Skills Map" → `/insights/skills`
    - "Trends" → `/insights/trends`
  - [x] 2.4 Do NOT add a "Reports" link — it doesn't exist yet (kept as `comingSoon: true` in NavDropdown)

- [x] Task 3: Verify & test (AC: #4, #5)
  - [x] 3.1 Run `pnpm test` — confirm zero regressions
  - [x] 3.2 Visual check: homepage Trust section layout
  - [x] 3.3 Visual check: footer Insights links navigate correctly
  - [x] 3.4 Responsive check: mobile, tablet, desktop

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Refactor Insights links to data-driven array pattern matching other 5 footer columns [Footer.tsx] — Fixed: extracted `insightsLinks` array, used `.map()`, added to exports
- [x] [AI-Review][MEDIUM] Add TrustSection test coverage for logo removal [TrustSection.test.tsx] — Fixed: created 5 tests verifying seal, no ministry logo, NDPA badge, privacy link
- [x] [AI-Review][LOW] Remove localhost:5173 dev URL from story Prerequisites — Fixed: removed URL
- [x] [AI-Review][LOW] Update stale pre-implementation code snippets in Dev Notes — Fixed: updated both snippets to reflect current state

## Dev Notes

### TrustSection — Current Structure

**File:** `apps/web/src/features/home/sections/TrustSection.tsx`

```tsx
{/* Trust badges — flex row, gap-8, centered */}
<div className="flex flex-wrap items-center justify-center gap-8 mb-10">
  {/* 1. Oyo State Seal — oyo-coat-of-arms.png, h-20 */}
  <img src="/images/oyo-coat-of-arms.png" alt="Oyo State Seal" className="h-20 w-auto" ... />

  {/* 2. NDPA Badge — Lucide Shield icon, green pill */}
  <div className="flex items-center gap-2 px-4 py-2 bg-success-100 rounded-full">
    <Shield className="w-5 h-5 text-success-600" />
    <span className="text-success-600 font-medium text-sm">NDPA Compliant</span>
  </div>
</div>
```

Ministry Logo was removed per Awwal's decision. The `flex-wrap justify-center` layout auto-adjusted with no spacing issues.

**DO NOT delete image files** — the logos are used in 12 files across the codebase:
- `Header.tsx`, `Footer.tsx`, `DashboardHeader.tsx`, `DashboardSidebar.tsx`, `DashboardLayout.tsx`, `AuthLayout.tsx`, `LeadershipPage.tsx`
- Backend: `user.controller.ts`, `staff.service.ts`, `export.service.ts`, `policy-brief.service.ts` (PDF generation)

### Footer — Current Insights Column

**File:** `apps/web/src/layouts/components/Footer.tsx` (~lines 127-132)

```tsx
{/* INSIGHTS Column — data-driven via insightsLinks array (matches other column pattern) */}
const insightsLinks = [
  { href: '/insights', label: 'Labour Force Overview' },
  { href: '/insights/skills', label: 'Skills Map' },
  { href: '/insights/trends', label: 'Trends' },
];

{/* Rendered via .map() like all other footer columns */}
{insightsLinks.map((link) => (
  <li key={link.href}>
    <Link to={link.href} className="text-neutral-400 hover:text-white text-sm transition-colors ...">
      {link.label}
    </Link>
  </li>
))}
```

The `insightsLinks` array is extracted and exported from Footer.tsx, matching the pattern of all other footer column arrays.

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

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, no debugging needed.

### Completion Notes List

- **Task 1 (AC#1):** Removed Ministry Logo (`oyo-state-logo.svg`) `<img>` element from TrustSection.tsx per Awwal's confirmation. Coat of Arms + NDPA badge remain. Flex layout auto-centers with `justify-center`. Image asset file NOT deleted (used by 12 other components).
- **Task 2 (AC#2, AC#3):** Replaced "Coming Soon" `<p>` tag in Footer.tsx Insights column with 3 `<Link>` elements: Labour Force Overview → `/insights`, Skills Map → `/insights/skills`, Trends → `/insights/trends`. Styling matches existing footer columns exactly (same classes including focus-visible ring). All target pages exist from Epic 8.5.
- **Task 3 (AC#4, AC#5):** Updated Footer.test.tsx — changed "Coming Soon" assertion to verify 3 Insights links with correct hrefs. Full suite: 4,178 tests pass (1,806 API + 2,372 web), 0 regressions.

### Change Log

- 2026-04-05: Implemented Story 9.3 — removed Ministry Logo from Trust section, wired footer Insights links, updated test assertions.
- 2026-04-05: Code review fixes — refactored Insights links to data-driven array, added TrustSection tests, cleaned story file.

### File List

- `apps/web/src/features/home/sections/TrustSection.tsx` — Modified: removed Ministry Logo `<img>` element
- `apps/web/src/features/home/sections/TrustSection.test.tsx` — Created: 5 tests covering seal, no ministry logo, NDPA badge, privacy link
- `apps/web/src/layouts/components/Footer.tsx` — Modified: extracted `insightsLinks` array, replaced inline links with `.map()`, added to exports
- `apps/web/src/layouts/components/Footer.test.tsx` — Modified: updated Insights test assertions, added `insightsLinks` structural test
