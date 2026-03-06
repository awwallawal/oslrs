
# Story 7.3: Anonymous Profile & "Government Verified" Badges

Status: done

## Story

As a **Public Searcher**,
I want to see which workers have been vetted by the state,
So that I can trust the quality of the talent.

## Context

This is the third story of Epic 7: Public Skills Marketplace & Search Security. It creates the **anonymous profile detail view** — a single-profile page accessible from marketplace search results (Story 7-2). The page displays anonymous fields (profession, LGA, experience, bio) and a prominent "Government Verified" badge for profiles where the respondent has a `final_approved` fraud assessment.

**Prerequisites:**
- **Story 7-1 (marketplace data extraction worker)** must be completed — provides `marketplace_profiles` table with `verified_badge` column populated from `fraud_detections.assessor_resolution = 'final_approved'`.
- **Story 7-2 (public marketplace search interface)** must be completed — provides the search endpoint, search page, `WorkerCard` component, and marketplace feature directory structure.

**Dependency note:** Story 7-2 already shows `verifiedBadge` in search result cards (WorkerCard). This story creates the full profile detail view and the reusable `GovernmentVerifiedBadge` component that both the search cards AND the detail page use.

**Scope boundary:** This story creates the anonymous profile view and badge. It does NOT implement contact reveal (Story 7-4), profile self-edit (Story 7-5), or contact view logging (Story 7-6). A "Reveal Contact" button is rendered on the profile page but is non-functional — it links to login or shows a "Coming soon" state until Story 7-4 is implemented.

## Acceptance Criteria

1. **Given** a profile ID from search results, **when** a user navigates to `GET /api/v1/marketplace/profiles/:id`, **then** the API returns the anonymous profile fields: id, profession, lgaName, experienceLevel, verifiedBadge, bio, portfolioUrl, createdAt.
2. **Given** the profile API response, **when** the profile has `verifiedBadge: true`, **then** the response includes `verifiedBadge: true` and the frontend displays a green "Government Verified" badge.
3. **Given** the profile API response, **when** returned, **then** it contains NO PII fields — no respondentId, firstName, lastName, phoneNumber, NIN, or dateOfBirth. These are only exposed via Story 7-4 (contact reveal).
4. **Given** a non-existent profile ID, **when** the endpoint is called, **then** it returns 404 with `{ code: 'NOT_FOUND', message: 'Profile not found' }`.
5. **Given** the frontend profile page at `/marketplace/profile/:id`, **when** loaded, **then** it displays the profile detail layout with: profession heading, LGA location, experience level, verified badge (if applicable), bio section, portfolio link, and a "Reveal Contact" placeholder button.
6. **Given** the "Government Verified" badge, **when** displayed, **then** it shows a green badge with a checkmark icon and text "Government Verified". Hovering or clicking reveals a tooltip/info section explaining what verification means (and what it does NOT mean).
7. **Given** the profile page, **when** the "Reveal Contact" button is clicked, **then** it navigates to login (if unauthenticated) or shows a "Coming soon" notice (placeholder for Story 7-4).
8. **Given** the profile endpoint, **when** more than 100 requests per minute from the same IP, **then** the server returns 429 (profile view rate limit per architecture spec).
9. **Given** the existing test suite, **when** all tests run, **then** comprehensive tests cover: profile detail happy path, verified badge display, PII exclusion, 404 for missing profile, rate limiting, and zero regressions on existing tests.

## Tasks / Subtasks

- [x] Task 1: Create marketplace profile detail service method (AC: #1, #2, #3, #4)
  - [x]1.1 In `apps/api/src/services/marketplace.service.ts` (created in Story 7-2), add a `getProfileById(id: string)` method:
    - Query `marketplace_profiles` by `id` (the profile's own UUID — NOT respondentId)
    - JOIN with `lgas` table to resolve `lgaName` from `lga_id` code (same pattern as search)
    - Return ONLY anonymous fields: `id`, `profession`, `lgaName`, `experienceLevel`, `verifiedBadge`, `bio`, `portfolioUrl`, `createdAt`
    - **NEVER return:** `respondentId`, `editToken`, `editTokenExpiresAt`, `consentEnriched` value (leaks enrichment status)
  - [x]1.2 Return `null` if profile not found (let controller handle 404)
  - [x]1.3 **Response type:** `MarketplaceProfileDetail` — extend the search result type with `portfolioUrl` and `createdAt`

- [x] Task 2: Create marketplace profile detail controller method (AC: #1, #3, #4)
  - [x]2.1 In `apps/api/src/controllers/marketplace.controller.ts` (created in Story 7-2), add a `getProfile(req, res, next)` static method:
    - Extract `id` from `req.params`
    - Validate UUID format (regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`)
    - Call `MarketplaceService.getProfileById(id)`
    - If `null`, throw `AppError('NOT_FOUND', 'Profile not found', 404)`
    - Return `res.json({ data: profile })`
  - [x]2.2 **Error sanitization:** Never expose internal details. 404 for missing profiles. 400 for invalid UUID format. 500 for unexpected errors → generic message only.

- [x] Task 3: Add profile detail route with rate limiting (AC: #8)
  - [x]3.1 In `apps/api/src/routes/marketplace.routes.ts` (created in Story 7-2), add:
    ```typescript
    // GET /api/v1/marketplace/profiles/:id — public anonymous profile view
    router.get('/profiles/:id', marketplaceProfileRateLimit, MarketplaceController.getProfile);
    ```
  - [x]3.2 In `apps/api/src/middleware/marketplace-rate-limit.ts` (created in Story 7-2), add a `marketplaceProfileRateLimit`:
    - 100 req/min/IP (architecture spec for profile views — higher than search because individual views are cheaper)
    - Redis key prefix: `rl:marketplace:profile:`
    - Same pattern as `marketplaceSearchRateLimit` but with different limits
  - [x]3.3 **No authentication** — this is a public anonymous view. Auth is only for contact reveal (Story 7-4).

- [x] Task 4: Add profile detail type (AC: #1, #2)
  - [x]4.1 In `packages/types/src/marketplace.ts`, add:
    ```typescript
    export interface MarketplaceProfileDetail {
      id: string;
      profession: string;
      lgaName: string;
      experienceLevel: string | null;
      verifiedBadge: boolean;
      bio: string | null;
      portfolioUrl: string | null;
      createdAt: string;
    }
    ```
  - [x]4.2 Export from `packages/types/src/index.ts` (if not already)

- [x] Task 5: Create GovernmentVerifiedBadge component (AC: #2, #6)
  - [x]5.1 Create `apps/web/src/features/marketplace/components/GovernmentVerifiedBadge.tsx`:
    - Green badge with checkmark icon (`BadgeCheck` or `CheckCircle2` from lucide-react)
    - Text: "Government Verified"
    - Styling: `bg-green-100 text-green-700 border border-green-200` (follow `FraudSeverityBadge.tsx` CONFIG pattern)
    - Include an expandable info section or tooltip explaining what verification means:
      - "This badge means: NIN validated, identity confirmed, skills registration reviewed, real person in Oyo State"
      - "What it does NOT mean: We have not tested their skills directly. We do not guarantee work quality."
    - (Source: architecture doc public-website-ia.md verified badge specification)
  - [x]5.2 For unverified profiles, show nothing (no badge) OR a subtle "Not yet verified" indicator — keep it minimal
  - [x]5.3 **Refactor WorkerCard** (from Story 7-2) to use this shared `GovernmentVerifiedBadge` component instead of inline badge rendering, if Story 7-2 implemented the badge inline

- [x] Task 6: Create frontend profile detail page (AC: #5, #6, #7)
  - [x]6.1 Create `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx`:
    - **Layout structure** (follow `RespondentDetailPage.tsx` card-based pattern):
      1. **Header**: Back button (← Back to Search), profession as page title, Government Verified badge (if applicable)
      2. **Profile Info Card**: LGA location, experience level, member since (createdAt)
      3. **About Section**: Bio text (if present), portfolio URL link (if present, opens in new tab)
      4. **Contact Section**: "Reveal Contact" button (placeholder — see Task 7)
    - Use `useParams<{ id: string }>()` to extract profile ID
    - Use `Card`, `CardHeader`, `CardContent` from shadcn/ui
    - Use `InfoRow` helper pattern from `RespondentDetailPage.tsx` for labeled field display
  - [x]6.2 Create `apps/web/src/features/marketplace/components/MarketplaceProfileSkeleton.tsx`:
    - Loading skeleton matching the profile page layout
    - Animated pulse placeholders for header, info card, about section
  - [x]6.3 **Error state**: If profile fetch returns 404, show "Profile not found" with a link back to marketplace search
  - [x]6.4 **Empty bio/portfolio**: Show placeholder text "This worker hasn't added a bio yet" / "No portfolio link provided"

- [x] Task 7: Create "Reveal Contact" placeholder button (AC: #7)
  - [x]7.1 On the profile page, render a prominent "Reveal Contact Details" button in the Contact Section
  - [x]7.2 Button behavior (Story 7-4 is not yet implemented):
    - **If user is NOT authenticated**: Button text "Sign in to Reveal Contact". Clicking calls `navigate('/login', { state: { from: `/marketplace/profile/${id}` } })` — uses React Router location state (LoginPage.tsx:20-21 reads `location.state.from`). Do NOT use `?returnTo=` query param — it's not supported.
    - **If user IS authenticated**: Button text "Reveal Contact Details" but disabled with tooltip "Contact reveal coming soon" (placeholder until Story 7-4 implements the actual reveal flow with CAPTCHA)
  - [x]7.3 Use `optionalAuthenticate` concept — check if auth token exists in sessionStorage to determine which button variant to show. Do NOT call `useAuth()` if it throws for unauthenticated users — check the auth context behavior for public pages.
  - [x]7.4 Below the button, add a subtle info line: "Contact details are only available to registered employers who have verified their identity."

- [x] Task 8: Create frontend API client and hooks for profile detail (AC: #5)
  - [x]8.1 In `apps/web/src/features/marketplace/api/marketplace.api.ts` (created in Story 7-2), add:
    ```typescript
    export async function fetchMarketplaceProfile(id: string): Promise<MarketplaceProfileDetail> {
      const response = await apiClient(`/marketplace/profiles/${id}`);
      return response.data;
    }
    ```
  - [x]8.2 In `apps/web/src/features/marketplace/hooks/useMarketplace.ts` (created in Story 7-2), add:
    ```typescript
    // Add to existing marketplaceKeys
    profile: (id: string) => [...marketplaceKeys.all, 'profile', id] as const,

    // New hook
    export function useMarketplaceProfile(id: string) {
      return useQuery({
        queryKey: marketplaceKeys.profile(id),
        queryFn: () => fetchMarketplaceProfile(id),
        enabled: !!id,
        staleTime: 5 * 60 * 1000,  // 5 minutes — profile data changes infrequently
      });
    }
    ```

- [x] Task 9: Wire frontend routes (AC: #5)
  - [x]9.1 In `apps/web/src/App.tsx`, add a nested route under the `/marketplace` path (inside `<PublicLayout>`):
    ```typescript
    const MarketplaceProfilePage = lazy(() => import('./features/marketplace/pages/MarketplaceProfilePage'));
    // ...
    <Route path="marketplace">
      <Route index element={<MarketplaceSearchPage />} />
      <Route path="profile/:id" element={<Suspense fallback={<PageLoadingFallback />}><MarketplaceProfilePage /></Suspense>} />
    </Route>
    ```
  - [x]9.2 Update `WorkerCard` (Story 7-2) to link to `/marketplace/profile/${profile.id}` — either the entire card is clickable or a "View Profile" button navigates there
  - [x]9.3 Ensure the profile route is public (no `<ProtectedRoute>` wrapper) — same as the search page

- [x] Task 10: Write backend tests (AC: #9)
  - [x]10.1 Add to `apps/api/src/controllers/__tests__/marketplace.controller.test.ts` (created in Story 7-2):
    - Profile detail happy path: valid ID returns profile with all anonymous fields
    - Verified badge: profile with `verifiedBadge: true` returns badge flag
    - Unverified profile: `verifiedBadge: false` returned correctly
    - **PII exclusion test**: verify response contains NO respondentId, firstName, lastName, phoneNumber, nin, dateOfBirth, editToken, consentEnriched
    - 404: non-existent profile ID returns `{ code: 'NOT_FOUND' }`
    - 400: malformed UUID returns validation error
    - LGA name resolution: profile returns `lgaName` (not raw `lgaId` code)
    - Rate limiting: verify 429 response format
  - [x]10.2 Add to `apps/api/src/services/__tests__/marketplace.service.test.ts` (created in Story 7-2):
    - `getProfileById` returns correct anonymous fields
    - `getProfileById` returns null for non-existent ID
    - LGA join resolves name correctly
  - [x]10.3 `pnpm test` — all tests pass, zero regressions

- [x] Task 11: Write frontend tests (AC: #9)
  - [x]11.1 Create `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx`:
    - Renders profile detail with all anonymous fields
    - Government Verified badge renders when `verifiedBadge: true`
    - No badge renders when `verifiedBadge: false`
    - Bio section shows text when present, placeholder when absent
    - Portfolio URL renders as link when present
    - "Reveal Contact" button renders (placeholder state)
    - Loading skeleton renders during fetch
    - 404 error state renders "Profile not found"
    - No PII visible in rendered output
  - [x]11.2 Create `apps/web/src/features/marketplace/__tests__/GovernmentVerifiedBadge.test.tsx`:
    - Renders badge with correct text and icon
    - Info tooltip/section explains verification meaning
  - [x]11.3 `cd apps/web && pnpm vitest run` — all web tests pass

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Interactive `<button>` nested inside `<Link>` in WorkerCard — invalid HTML nesting, accessibility violation, expandable info breaks card layout. **Fixed:** Added `interactive` prop to GovernmentVerifiedBadge; WorkerCard uses `interactive={false}` (renders static `<span>`), profile page keeps interactive mode. [WorkerCard.tsx:24-26, GovernmentVerifiedBadge.tsx:8-24]
- [x] [AI-Review][MEDIUM] M1: Portfolio URL rendered as `<a href>` without protocol validation — XSS risk via `javascript:` URLs. **Fixed:** Added `/^https?:\/\//i` protocol check; non-HTTP URLs fall through to "No portfolio" placeholder. [MarketplaceProfilePage.tsx:102]
- [x] [AI-Review][MEDIUM] M2: `MarketplaceProfileDetail.profession` typed as non-nullable `string` but service coerces null to `''` — empty heading on profile page. **Fixed:** Made `profession` and `lgaName` nullable in type, service returns null, UI shows "Unknown Profession" fallback. [marketplace.ts:40-41, marketplace.service.ts:203-204, MarketplaceProfilePage.tsx:64]
- [x] [AI-Review][MEDIUM] M3: `hover:bg-green-150` is not a valid Tailwind class — hover effect non-functional. **Fixed:** Changed to `hover:bg-green-200`. [GovernmentVerifiedBadge.tsx:16]
- [x] [AI-Review][MEDIUM] M4: AC #7 unauthenticated "Reveal Contact" click navigation to `/login` with `state.from` not tested. **Fixed:** Added navigation test + XSS prevention test + null profession test + back button navigation test (4 new tests). [MarketplaceProfilePage.test.tsx]
- [x] [AI-Review][MEDIUM] M5: Unused imports `MapPin` and `Briefcase` in MarketplaceProfilePage. **Fixed:** Removed dead imports. [MarketplaceProfilePage.tsx:2]
- [x] [AI-Review][LOW] L1: `navigate(-1)` on back button is non-deterministic — may leave the app. **Fixed:** Changed to `navigate('/marketplace')`. [MarketplaceProfilePage.tsx:56]
- [x] [AI-Review][LOW] L2: WorkerCard badge wrapper used `e.preventDefault()` instead of `e.stopPropagation()`. **Fixed:** Resolved by H1 — replaced interactive badge wrapper with static `interactive={false}` badge. [WorkerCard.tsx:25]

## Dev Notes

### "Government Verified" Badge Meaning (Architecture Spec)

From the public website IA documentation:

**This badge means:**
- The worker's NIN has been validated
- Their identity has been confirmed
- Their skills registration has been reviewed
- They are a real person in Oyo State

**What it does NOT mean:**
- We have not tested their skills directly
- We do not guarantee work quality
- We are not responsible for employment disputes

The verification confirms identity, not competence. This distinction MUST be communicated in the badge's info tooltip/section.

### Badge Derivation (Already Done in Story 7-1)

The `verified_badge` column on `marketplace_profiles` is set by the extraction worker (Story 7-1) based on:
```sql
SELECT EXISTS (
  SELECT 1 FROM fraud_detections fd
  JOIN submissions s ON fd.submission_id = s.id
  WHERE s.respondent_id = $1
  AND fd.assessor_resolution = 'final_approved'
) AS is_verified
```

This story does NOT need to re-derive the badge — just read the `verified_badge` boolean from `marketplace_profiles` and display it.

### PII Visibility Rules (Architecture Spec)

| Information | Public Search | Profile Detail (7-3) | Registered Employer (7-4) |
|-------------|-------------|---------------------|--------------------------|
| Profession/Skill | Visible | Visible | Visible |
| Local Government | Visible | Visible | Visible |
| Experience Level | Visible | Visible | Visible |
| Verified Badge | Visible | Visible | Visible |
| Bio | — | Visible | Visible |
| Portfolio URL | — | Visible | Visible |
| Worker's Name | Hidden | Hidden | Visible* |
| Phone Number | Hidden | Hidden | Visible* |

*Only if `consent_enriched = true` and authenticated + CAPTCHA (Story 7-4).

### Profile Detail Endpoint vs Contact Reveal

The architecture document (line 668) shows `/marketplace/profile/:id` requiring auth. **Clarification:** That row describes the contact reveal flow (Story 7-4). For this story, the anonymous profile view is PUBLIC (no auth). The endpoint path is:
- `GET /api/v1/marketplace/profiles/:id` — **public**, returns anonymous fields only
- `POST /api/v1/marketplace/profiles/:id/reveal` — **authenticated + CAPTCHA** (Story 7-4, not this story)

### Existing Badge Component Pattern

Follow `FraudSeverityBadge.tsx` CONFIG object pattern:
```typescript
// apps/web/src/features/dashboard/components/FraudSeverityBadge.tsx
const CONFIG: Record<string, { label: string; className: string }> = {
  clean: { label: 'Clean', className: 'bg-green-100 text-green-700' },
  critical: { label: 'Critical', className: 'bg-red-200 text-red-900' },
};
```

For the Government Verified badge:
```typescript
import { BadgeCheck } from 'lucide-react';

export function GovernmentVerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-700 border border-green-200">
      <BadgeCheck className="w-4 h-4" />
      Government Verified
    </span>
  );
}
```

### Existing Detail Page Layout Pattern

Follow `RespondentDetailPage.tsx` layout structure:

1. **Header** with back button + title:
```typescript
<div className="flex items-center gap-4 mb-6">
  <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Search
  </Button>
</div>
<h1 className="text-2xl font-bold">{profile.profession}</h1>
```

2. **Info cards** in grid layout:
```typescript
<div className="grid gap-6 md:grid-cols-2">
  <Card>...</Card>
  <Card>...</Card>
</div>
```

3. **InfoRow helper** (reuse pattern):
```typescript
function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between py-2 border-b border-neutral-100 last:border-0">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-sm font-medium text-neutral-900">{value || '—'}</span>
    </div>
  );
}
```

### Route Params Pattern

```typescript
import { useParams, useNavigate } from 'react-router-dom';

const { id } = useParams<{ id: string }>();
const navigate = useNavigate();
```

### Frontend API Client (Public Calls)

Per the Story 7-2 correction: the existing `apiClient` (`apps/web/src/lib/api-client.ts`) already handles unauthenticated calls correctly. `getAuthHeaders()` returns `{}` when no token is in sessionStorage, so the Authorization header is simply omitted. Use the existing `apiClient` directly — no `publicApiClient` needed.

### WorkerCard → Profile Page Navigation

Story 7-2 creates `WorkerCard.tsx` in the search results grid. This story needs to make the card (or a "View Profile" button on it) navigate to `/marketplace/profile/${profile.id}`. Options:
1. Wrap the entire card in a `<Link to={...}>` (preferred — whole card is clickable)
2. Add a "View Profile" button inside the card

### "Reveal Contact" Button — Placeholder Strategy

The profile page includes a Contact Section with a button, but contact reveal (Story 7-4) is not yet implemented. The button should:
- **Unauthenticated user**: "Sign in to Reveal Contact" → navigates to `/login` with `state: { from: profileUrl }`
- **Authenticated user**: "Reveal Contact Details" → disabled with "Coming soon" tooltip

To detect auth status on a public page, check if a token exists in sessionStorage:
```typescript
const isAuthenticated = !!sessionStorage.getItem('oslsr_access_token');
```

Do NOT use `useAuth()` if it throws or redirects for unauthenticated users — check the auth context's behavior on public pages first. The `AuthProvider` wraps all routes (App.tsx line 206) and provides context without blocking access.

### What This Story Does NOT Include (Future Stories)

| Feature | Story | Why Not Here |
|---------|-------|-------------|
| Contact reveal (name/phone) | 7-4 | Authentication + CAPTCHA + consent check |
| Profile self-edit (bio, portfolio) | 7-5 | Edit token, SMS integration |
| Contact view logging + rate limiting | 7-6 | Audit trail, 50/user/24h enforcement |
| Search result page | 7-2 | Already implemented |
| `contact_reveals` table | 7-4/7-6 | Not needed until contact reveal is built |
| Device fingerprinting | 7-6 | Architecture Layer 3 |

### Project Structure Notes

**New files:**
- `apps/web/src/features/marketplace/components/GovernmentVerifiedBadge.tsx`
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx`
- `apps/web/src/features/marketplace/components/MarketplaceProfileSkeleton.tsx`
- `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx`
- `apps/web/src/features/marketplace/__tests__/GovernmentVerifiedBadge.test.tsx`

**Modified files:**
- `apps/api/src/services/marketplace.service.ts` — Add `getProfileById()` method
- `apps/api/src/controllers/marketplace.controller.ts` — Add `getProfile()` method
- `apps/api/src/routes/marketplace.routes.ts` — Add `GET /profiles/:id` route
- `apps/api/src/middleware/marketplace-rate-limit.ts` — Add `marketplaceProfileRateLimit`
- `apps/api/src/controllers/__tests__/marketplace.controller.test.ts` — Add profile detail tests
- `apps/api/src/services/__tests__/marketplace.service.test.ts` — Add getProfileById tests
- `packages/types/src/marketplace.ts` — Add `MarketplaceProfileDetail` type
- `apps/web/src/features/marketplace/api/marketplace.api.ts` — Add `fetchMarketplaceProfile()`
- `apps/web/src/features/marketplace/hooks/useMarketplace.ts` — Add `useMarketplaceProfile()` hook
- `apps/web/src/features/marketplace/components/WorkerCard.tsx` — Add link to profile page + use shared badge
- `apps/web/src/App.tsx` — Add `/marketplace/profile/:id` route

### Anti-Patterns to Avoid

- **Do NOT expose `respondentId` in the profile detail response** — the profile `id` is the public identifier. Exposing `respondentId` enables cross-referencing with authenticated endpoints.
- **Do NOT expose `consentEnriched` value** — leaks whether the worker opted into contact sharing, which is information an attacker could use to target specific profiles.
- **Do NOT expose `editToken` or `editTokenExpiresAt`** — these are security-sensitive fields for Story 7-5.
- **Do NOT implement contact reveal in this story** — the "Reveal Contact" button is a placeholder. Actual reveal logic (auth + CAPTCHA + consent check + audit logging) is Story 7-4.
- **Do NOT add a "total profiles" counter on the profile page** — avoid exposing registry size to scrapers.
- **Do NOT query `respondents` table from the profile endpoint** — all needed data is on `marketplace_profiles` + `lgas` JOIN. PII lives in `respondents` and is only accessed in Story 7-4.
- **Do NOT use offset-based enumeration** — profile IDs are UUIDs (not sequential), so enumeration by incrementing is already mitigated. But avoid any pattern that leaks the total count of profiles.

### References

- [Source: epics.md:1976-1987] — Story 7.3 acceptance criteria
- [Source: architecture.md:668-674] — Marketplace route security model (3-route table)
- [Source: architecture.md:811-841] — 6-layer bot protection strategy
- [Source: architecture.md:1266-1292] — Government Verified badge meaning specification
- [Source: architecture.md:1299-1309] — PII visibility rules table (public vs registered)
- [Source: architecture.md:863-887] — marketplace_profiles schema with consent fields
- [Source: 7-1-marketplace-data-extraction-worker.md] — verifiedBadge derivation from fraud_detections
- [Source: 7-2-public-marketplace-search-interface.md] — Search endpoint, WorkerCard, marketplace feature directory
- [Source: prep-4-marketplace-data-model-spike.md:42-44] — PII tier definitions
- [Source: prep-5-public-route-security-spike.md:41] — Profile view rate limit design
- [Source: RespondentDetailPage.tsx:89-98] — InfoRow helper pattern
- [Source: RespondentDetailPage.tsx:169-212] — Header with back button layout
- [Source: FraudSeverityBadge.tsx] — Badge CONFIG object pattern
- [Source: RespondentDetailSkeleton.tsx] — Skeleton loading pattern
- [Source: respondent.controller.ts:94-126] — getRespondentDetail endpoint pattern
- [Source: apps/web/src/components/ui/card.tsx] — Card, CardHeader, CardContent components
- [Source: apps/web/src/lib/api-client.ts] — apiClient handles unauthenticated calls (getAuthHeaders returns {} without token)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- All 51 API marketplace tests pass (26 service + 25 controller)
- All 42 frontend marketplace tests pass (9 badge + 15 profile + 18 search)
- Full regression: 1,359 API tests pass, 2,042 web tests pass, 0 regressions
- ViewAsDashboardPage flaky failure in parallel runs (pre-existing, passes in isolation - 35/35)

### Completion Notes List
- Task 4: Added `MarketplaceProfileDetail` type to `packages/types/src/marketplace.ts` (already exported via wildcard)
- Task 1: Added `getProfileById(id)` method to `MarketplaceService` — raw SQL query with LGA JOIN, returns only anonymous fields, null for missing profiles
- Task 2: Added `getProfile(req, res, next)` to `MarketplaceController` — UUID regex validation, 400 for invalid format, 404 for missing profiles
- Task 3: Added `marketplaceProfileRateLimit` (100 req/min/IP, Redis prefix `rl:marketplace:profile:`) and wired `GET /profiles/:id` route
- Task 5: Created `GovernmentVerifiedBadge` component — green badge with `BadgeCheck` icon, expandable info section explaining verification meaning and disclaimers. Refactored `WorkerCard` to use shared badge (removed inline `Badge` + `CheckCircle`)
- Task 6: Created `MarketplaceProfilePage` — card-based layout (header + info card + about section + contact section), `InfoRow` helper, loading skeleton, 404 error state, empty bio/portfolio placeholders
- Task 7: "Reveal Contact" placeholder — unauthenticated users see "Sign in to Reveal Contact" (navigates to `/login` with `state.from`), authenticated users see disabled "Reveal Contact Details" with "Coming soon" text. Uses `useAuth()` (safe on public pages since `AuthProvider` wraps all routes)
- Task 8: Added `fetchMarketplaceProfile()` API function and `useMarketplaceProfile(id)` hook with 5-minute staleTime
- Task 9: Changed `/marketplace` from flat route to nested `<Route path="marketplace">` with `index` + `profile/:id`. Updated `WorkerCard` to wrap entire card in `<Link>` to profile page
- Task 10: Added 15 backend tests (9 controller getProfile + 6 service getProfileById + 2 rate limit contract tests). Covers happy path, verified/unverified, PII exclusion, 404, 400, LGA resolution, error handling
- Task 11: Added 24 frontend tests (15 profile page + 9 badge). Updated 3 existing search page tests (badge text "Verified" → "Government Verified", disabled button → Link, added BadgeCheck/Info mocks)

### Change Log
- 2026-03-06: Story 7-3 implementation complete. All 11 tasks done, 39 new tests (15 backend + 24 frontend), 0 regressions.
- 2026-03-06: Adversarial code review — 8 issues found (1 HIGH, 5 MEDIUM, 2 LOW), all fixed. +7 new tests (3 badge non-interactive + 4 profile page). Total: 100 marketplace tests (51 backend + 49 frontend).

### File List
**New files:**
- `apps/web/src/features/marketplace/components/GovernmentVerifiedBadge.tsx`
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx`
- `apps/web/src/features/marketplace/components/MarketplaceProfileSkeleton.tsx`
- `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx`
- `apps/web/src/features/marketplace/__tests__/GovernmentVerifiedBadge.test.tsx`

**Modified files:**
- `packages/types/src/marketplace.ts` — Added `MarketplaceProfileDetail` interface
- `apps/api/src/services/marketplace.service.ts` — Added `getProfileById()` method + `MarketplaceProfileDetail` import
- `apps/api/src/controllers/marketplace.controller.ts` — Added `getProfile()` method + UUID regex
- `apps/api/src/routes/marketplace.routes.ts` — Added `GET /profiles/:id` route
- `apps/api/src/middleware/marketplace-rate-limit.ts` — Added `marketplaceProfileRateLimit` (100 req/min/IP)
- `apps/api/src/controllers/__tests__/marketplace.controller.test.ts` — Added 11 profile detail + rate limit tests
- `apps/api/src/services/__tests__/marketplace.service.test.ts` — Added 6 getProfileById tests
- `apps/web/src/features/marketplace/api/marketplace.api.ts` — Added `fetchMarketplaceProfile()`
- `apps/web/src/features/marketplace/hooks/useMarketplace.ts` — Added `useMarketplaceProfile()` hook + `profile` key
- `apps/web/src/features/marketplace/components/WorkerCard.tsx` — Wrapped in `<Link>`, replaced inline badge with `GovernmentVerifiedBadge`
- `apps/web/src/features/marketplace/__tests__/MarketplaceSearchPage.test.tsx` — Updated 3 tests for badge text + link change
- `apps/web/src/App.tsx` — Added lazy import + nested `/marketplace/profile/:id` route
