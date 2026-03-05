# Story 7.prep-3: Replace Placeholder Pages with Proper 404

Status: ready-for-dev

## Story

As a **government system user** (any authenticated role or public visitor),
I want invalid URLs to show a proper "Page not found" screen with navigation back to my dashboard,
so that I never see unprofessional "coming soon" placeholder text on a production government system.

## Problem Statement

All 7 role-based dashboard routes have catch-all `path="*"` routes rendering a `PlaceholderPage` component that displays "This page is coming soon. Check back later for updates." This is inappropriate for a government system — users navigating to old/bookmarked/mistyped URLs see a generic placeholder instead of a clear 404 error with navigation guidance. The global catch-all (`path="*"`) silently redirects to `/` with no error feedback.

Discovered during Awwal's UAT in Epic 6. Team agreement A11: "No 'coming soon' pages in production."

## Acceptance Criteria

1. **Given** a user navigates to an invalid URL under `/dashboard/:role/*`, **when** no matching route exists, **then** they see a "Page not found" screen (not "coming soon").
2. **Given** the 404 page renders inside DashboardLayout, **when** displayed, **then** the role's sidebar navigation remains visible and functional for recovery.
3. **Given** the 404 page, **when** displayed, **then** it includes: a clear "Page not found" heading, a brief friendly message, and a "Back to Dashboard" button that navigates to the user's role home.
4. **Given** a visitor navigates to a completely invalid URL (outside `/dashboard`), **when** no route matches, **then** they see a public-facing 404 page (not a silent redirect to `/`).
5. **Given** the `PlaceholderPage` component, **when** this story is complete, **then** it is removed entirely — no "coming soon" text remains in any route catch-all.
6. **Given** legitimate "coming soon" feature previews in component bodies (SuperAdminHome, PublicUserHome, MarketplacePreviewSection, EmployersPage, SearchBox, ContactPage), **when** this story is complete, **then** they are NOT removed — those are intentional feature callouts, not route errors.
7. **Given** the existing test suite, **when** all tests run, **then** zero regressions.

## Tasks / Subtasks

- [ ] Task 1: Create NotFoundPage component for dashboard context (AC: #1, #2, #3)
  - [ ] 1.1 Create `apps/web/src/features/dashboard/pages/NotFoundPage.tsx`
  - [ ] 1.2 Centered card layout matching existing error page patterns (see UnauthorizedPage at App.tsx:173-190 for precedent)
  - [ ] 1.3 Heading: "Page not found" (or similar)
  - [ ] 1.4 Message: friendly, non-technical (e.g., "The page you're looking for doesn't exist or has been moved.")
  - [ ] 1.5 "Back to Dashboard" button — navigate to `/dashboard/:role` using current user's role from auth context
  - [ ] 1.6 Use OSLRS error color scheme (Error-600 Crimson `#DC2626` for icon/accent, Error-100 `#FEE2E2` optional background)
  - [ ] 1.7 Mobile-responsive within DashboardLayout's `<Outlet />`
- [ ] Task 2: Create PublicNotFoundPage for global context (AC: #4)
  - [ ] 2.1 Create `apps/web/src/pages/PublicNotFoundPage.tsx` (or similar location matching public page patterns)
  - [ ] 2.2 Full-page 404 with "Go to Homepage" button (navigates to `/`)
  - [ ] 2.3 Consistent styling with OSLRS public site design
- [ ] Task 3: Replace all 7 role catch-all routes (AC: #1, #5)
  - [ ] 3.1 In `App.tsx`, replace each `<PlaceholderPage title="... Feature" />` with `<NotFoundPage />`
  - [ ] 3.2 All 7 routes to update (line numbers from current file):
    - Line 743: `/dashboard/super-admin/*`
    - Line 831: `/dashboard/supervisor/*`
    - Line 910: `/dashboard/enumerator/*`
    - Line 970: `/dashboard/clerk/*`
    - Line 1049: `/dashboard/assessor/*`
    - Line 1128: `/dashboard/official/*`
    - Line 1189: `/dashboard/public/*`
- [ ] Task 4: Replace global catch-all route (AC: #4)
  - [ ] 4.1 In `App.tsx` line 1204, replace `<Navigate to="/" replace />` with `<PublicNotFoundPage />`
- [ ] Task 5: Remove PlaceholderPage component (AC: #5)
  - [ ] 5.1 Delete the PlaceholderPage definition from `App.tsx:157-168`
  - [ ] 5.2 Remove any imports of PlaceholderPage
  - [ ] 5.3 Replace `/marketplace` route (App.tsx line ~431): change `<PlaceholderPage title="Skills Marketplace" />` to `<Navigate to="/#marketplace" replace />` — the homepage already has MarketplacePreviewSection with "Skills marketplace coming soon", so users land somewhere useful. Import `Navigate` from react-router-dom (already imported in this file).
  - [ ] 5.4 Verify no other usages of PlaceholderPage remain anywhere in the codebase
- [ ] Task 6: Add tests (AC: #7)
  - [ ] 6.1 Test NotFoundPage renders heading, message, and navigation button
  - [ ] 6.2 Test "Back to Dashboard" button links to correct role-based path
  - [ ] 6.3 Test PublicNotFoundPage renders with "Go to Homepage" link
- [ ] Task 7: Verify (AC: #6, #7)
  - [ ] 7.1 Confirm "coming soon" text in component bodies is untouched. Representative examples: SuperAdminHome:136, PublicUserHome:166+181, MarketplacePreviewSection:43, EmployersPage:308, SearchBox:25+28, ContactPage:142, Footer:132, MobileNav:199+218, CoverageSection:16, NavDropdown:158. Note: this list is not exhaustive — only verify that no route catch-alls contain "coming soon" text. Legitimate feature-preview instances in component bodies are intentional and must remain.
  - [ ] 7.2 `pnpm test` — all tests pass, zero regressions

## Dev Notes

### Current PlaceholderPage Component (App.tsx:157-168)

Inline component defined in App.tsx. Takes a `title` prop, renders a card with:
- Heading: `{title}`
- Message: "This page is coming soon. Check back later for updates."
- No navigation buttons, no error styling, no role awareness

### Design Precedent: UnauthorizedPage (App.tsx:173-190)

Follow this pattern for the NotFoundPage:
- Centered card with heading and description
- Clear CTA button for navigation
- Works within DashboardLayout's `<Outlet />`

### Dashboard Layout Context

When a 404 is hit under `/dashboard/:role/*`, the `DashboardLayout` still renders:
- `DashboardHeader` (top bar with user info)
- `DashboardSidebar` (role-specific navigation items)
- `DashboardBottomNav` (mobile)
- `<main>` with `<Outlet />` where NotFoundPage renders

This means the user always has sidebar navigation to recover — the 404 page just needs to explain what happened and offer a direct "home" button.

### Sidebar Config Reference

All sidebar items defined in `apps/web/src/features/dashboard/config/sidebarConfig.ts`:
- Super Admin: 11 items (all implemented)
- Supervisor: 7 items
- Enumerator: 6 items
- Clerk: 4 items
- Assessor: 6 items
- Official: 6 items
- Public User: 4 items

### "Coming Soon" Text to PRESERVE (Not Route Errors)

These are intentional feature-preview callouts in component bodies — do NOT remove:

| File | Line | Text | Purpose |
|------|------|------|---------|
| SuperAdminHome.tsx | 136 | "Coming soon" span | Inline status indicator |
| PublicUserHome.tsx | 181 | "Skills Marketplace...coming soon" | Feature preview for Epic 7 |
| MarketplacePreviewSection.tsx | 43 | "Skills marketplace coming soon" | Homepage preview |
| EmployersPage.tsx | 308 | "Marketplace search coming soon" | Feature preview |
| SearchBox.tsx | 25, 28 | "Search (coming soon)" | Disabled search preview |
| ContactPage.tsx | 142 | "Map coming soon" | Map placeholder |

### UX Color Reference

- Error icon/accent: Error-600 Crimson `#DC2626`
- Error background (optional): Error-100 Light pink `#FEE2E2`
- Brand maroon: `#9C1E23` (could use for a softer, on-brand 404 instead of red)

### Project Structure Notes

- Route definitions: `apps/web/src/App.tsx` (1200+ lines, all routes)
- Layout: `apps/web/src/layouts/DashboardLayout.tsx`
- Dashboard pages: `apps/web/src/features/dashboard/pages/`
- Public pages: `apps/web/src/pages/` (or `features/public/`)
- Sidebar config: `apps/web/src/features/dashboard/config/sidebarConfig.ts`
- Error page precedent: `UnauthorizedPage` at `App.tsx:173-190`

### Anti-Patterns to Avoid

- **Do NOT add HTTP 404 status codes** — this is a client-side SPA. The server always returns 200 for HTML. The 404 is purely visual/UX.
- **Do NOT remove "coming soon" from component bodies** — only remove the PlaceholderPage route catch-all. Feature preview text is intentional (AC #6).
- **Do NOT create separate NotFoundPage per role** — one component that reads the current role from auth context and builds the dashboard link dynamically.
- **Do NOT over-design** — simple centered card, heading, message, button. Match UnauthorizedPage aesthetics.

### References

- [Source: epic-6-retro-2026-03-04.md#Challenge 4] — "Coming Soon" Placeholder Pages
- [Source: epic-6-retro-2026-03-04.md#Process Improvements P4] — Replace placeholder catch-all pages with proper 404
- [Source: epic-6-retro-2026-03-04.md#Team Agreements A11] — No "coming soon" pages in production
- [Source: App.tsx:157-168] — Current PlaceholderPage component
- [Source: App.tsx:173-190] — UnauthorizedPage design precedent
- [Source: App.tsx:743,831,910,970,1049,1128,1189] — 7 role catch-all routes
- [Source: App.tsx:1204] — Global catch-all route
- [Source: sidebarConfig.ts] — All sidebar navigation items per role

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
