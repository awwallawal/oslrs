# Story 7.2: Public Marketplace Search Interface

Status: ready-for-dev

## Story

As a **Public Searcher**,
I want to search for skilled workers using filters,
So that I can find talent in specific LGAs or trades.

## Context

This is the second story of Epic 7: Public Skills Marketplace & Search Security. It creates the first **public unauthenticated data-serving routes** in the OSLRS API — a fundamentally different security surface from all existing authenticated endpoints. The search endpoint queries the `marketplace_profiles` table (created by Story 7-1) using PostgreSQL full-text search with tsvector + GIN index.

**Prerequisites:**
- **Story 7-1 (marketplace data extraction worker)** must be completed first — provides the `marketplace_profiles` table, tsvector trigger, GIN index, and extraction worker that populates profiles.
- **prep-4 (marketplace data model spike)** must be completed first — provides validated schema design, search query patterns, and field mapping.
- **prep-5 (public route security spike)** must be completed first — provides rate limiting thresholds, CAPTCHA trigger strategy, search input validation schemas, and bot protection design.

**Dependency note:** The prep-4 and prep-5 spikes output design documents. This story implements those designs. If spike decisions differ from what's documented here, **the spike outputs take precedence** — they represent the most up-to-date validated designs.

**Security note:** This is the first public route that serves application data (not just auth flows). Attack vectors include scraping, enumeration, search injection, and bot automation. The architecture specifies a 6-layer defense: IP rate limiting, progressive CAPTCHA, device fingerprinting, honeypot fields, pagination limits, and authentication for contact details.

## Acceptance Criteria

1. **Given** a public search request to `GET /api/v1/marketplace/search`, **when** a query string is provided, **then** the API returns paginated anonymous profiles matching the full-text search using `plainto_tsquery()` with `ts_rank()` relevance scoring.
2. **Given** the search endpoint, **when** filter parameters are provided (lgaId, profession, experienceLevel), **then** results are filtered accordingly using AND logic (all filters must match).
3. **Given** the search results, **when** returned to the client, **then** each result contains ONLY anonymous fields: id, profession, lgaName, experienceLevel, verifiedBadge, bio — NO PII (no name, phone, NIN, dateOfBirth).
4. **Given** the search endpoint, **when** no query or filters are provided, **then** results are returned sorted by most recently updated profiles (browse mode).
5. **Given** the search endpoint, **when** more than 30 requests per minute from the same IP, **then** the server returns 429 with a structured JSON error response.
6. **Given** the search request, **when** pagination parameters are provided, **then** cursor-based pagination is used with a maximum of 100 results per page.
7. **Given** the frontend marketplace search page at `/marketplace`, **when** a user visits, **then** they see a search bar, filter controls (LGA dropdown, profession filter, experience level), and a grid of anonymous profile cards.
8. **Given** the search page, **when** the user types a search query, **then** search is debounced (300ms) and results update automatically.
9. **Given** the existing test suite, **when** all tests run, **then** comprehensive tests cover: search happy path, filter combinations, empty results, rate limiting, input validation, pagination, PII exclusion, and zero regressions on existing tests.

## Tasks / Subtasks

- [ ] Task 1: Create marketplace search service (AC: #1, #2, #3, #4, #6)
  - [ ] 1.1 Create `apps/api/src/services/marketplace.service.ts` with a `MarketplaceService` class containing:
    - `searchProfiles(params: MarketplaceSearchParams)` — main search method
    - Uses `plainto_tsquery('english', query)` for full-text search (NEVER `to_tsquery()` — injection-safe by design)
    - Uses `ts_rank(search_vector, plainto_tsquery('english', query))` for relevance scoring
    - Joins `marketplace_profiles` with `lgas` table to resolve `lgaName` from `lgaId` code
    - Returns ONLY anonymous fields: `id`, `profession`, `lgaName`, `experienceLevel`, `verifiedBadge`, `bio`, `relevanceScore`
    - EXCLUDES all PII: no `respondentId`, no name, no phone, no NIN — these are ONLY exposed in Story 7-4 (contact reveal)
  - [ ] 1.2 Implement filter conditions (AND logic):
    - `lgaId`: exact match on `marketplace_profiles.lga_id`
    - `profession`: full-text match using `plainto_tsquery()` against `search_vector` (weight A)
    - `experienceLevel`: exact match on `marketplace_profiles.experience_level`
    - Free-text `query`: full-text search across entire `search_vector` (all weights)
  - [ ] 1.3 Implement cursor-based pagination following `respondent.service.ts` pattern:
    - Cursor format: `${updatedAt_ISO}|${id}` (pipe-separated timestamp + UUID)
    - Default page size: 20, max: 100
    - Sort: by `ts_rank` DESC when query present, by `updated_at` DESC when browsing (no query)
    - Return `CursorPaginatedResponse<MarketplaceSearchResult>` with `hasNextPage`, `nextCursor`, `totalItems`
  - [ ] 1.4 Browse mode (no query): return all profiles sorted by `updated_at DESC` with optional filters — allows users to browse without searching
  - [ ] 1.5 **Query safety:** All queries MUST use Drizzle parameterized `sql` template literals — never string interpolation. `plainto_tsquery()` is inherently safe (no operator parsing), but parameters must still be bound.

- [ ] Task 2: Create marketplace search controller with Zod validation (AC: #1, #2, #3, #8)
  - [ ] 2.1 Create `apps/api/src/controllers/marketplace.controller.ts` with a `MarketplaceController` class
  - [ ] 2.2 Define Zod schema for search params (following `respondent.controller.ts` pattern):
    ```typescript
    const marketplaceSearchSchema = z.object({
      q: z.string().max(200).optional(),                    // Free-text search query
      lgaId: z.string().max(50).optional(),                 // LGA code filter
      profession: z.string().max(100).optional(),           // Profession filter
      experienceLevel: z.string().max(50).optional(),       // Experience level filter
      cursor: z.string().max(200).optional(),               // Pagination cursor
      pageSize: z.coerce.number().min(1).max(100).default(20),
    });
    ```
  - [ ] 2.3 Controller method `search(req, res, next)`:
    1. Validate query params with Zod `safeParse()` — return 400 with structured errors on failure
    2. Call `MarketplaceService.searchProfiles(params)`
    3. Return `res.json({ data, meta: { pagination } })`
  - [ ] 2.4 **Error response sanitization:** Never expose internal column names, query plans, or stack traces. Public route errors must be generic: `{ code: 'VALIDATION_ERROR', message: '...' }` or `{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }`

- [ ] Task 3: Create marketplace routes with rate limiting (AC: #5)
  - [ ] 3.1 Create `apps/api/src/routes/marketplace.routes.ts`:
    - `GET /search` — MarketplaceController.search (public, no auth)
    - Apply marketplace search rate limiter middleware
    - Do NOT apply `authenticate` middleware — this is a public route
  - [ ] 3.2 Create `apps/api/src/middleware/marketplace-rate-limit.ts` following the `login-rate-limit.ts` pattern:
    - `marketplaceSearchRateLimit`: 30 req/min/IP (architecture spec)
    - Redis store with lazy initialization and test env memory fallback
    - Redis key prefix: `rl:marketplace:search:`
    - Response on 429: `{ status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Too many search requests. Please try again later.' }`
    - `standardHeaders: true`, `legacyHeaders: false`
  - [ ] 3.3 Register routes in `apps/api/src/routes/index.ts`:
    - `import marketplaceRoutes from './marketplace.routes.js';`
    - `router.use('/marketplace', marketplaceRoutes);`
  - [ ] 3.4 **No honeypot fields in this story** — honeypot implementation depends on prep-5 spike design. If the spike specifies honeypots for search, add them here; otherwise defer to Story 7-6.

- [ ] Task 4: Add marketplace search types (AC: #1, #3)
  - [ ] 4.1 Extend `packages/types/src/marketplace.ts` (created in Story 7-1) with search-specific types:
    - `MarketplaceSearchParams` interface: `{ q?: string, lgaId?: string, profession?: string, experienceLevel?: string, cursor?: string, pageSize?: number }`
    - `MarketplaceSearchResult` interface: `{ id: string, profession: string, lgaName: string, experienceLevel: string | null, verifiedBadge: boolean, bio: string | null, relevanceScore?: number }`
    - **Note:** If Story 7-1 already defined these types in prep-4 spike output, use those definitions — don't duplicate.
  - [ ] 4.2 Export new types from `packages/types/src/index.ts` (if not already exported by Story 7-1)

- [ ] Task 5: Create frontend marketplace API client (AC: #7, #8)
  - [ ] 5.1 Create `apps/web/src/features/marketplace/api/marketplace.api.ts` following the `registry.api.ts` cursor-based pattern:
    ```typescript
    export async function searchMarketplace(params: MarketplaceSearchParams): Promise<CursorPaginatedResponse<MarketplaceSearchResult>> {
      const searchParams = new URLSearchParams();
      if (params.q) searchParams.set('q', params.q);
      if (params.lgaId) searchParams.set('lgaId', params.lgaId);
      if (params.profession) searchParams.set('profession', params.profession);
      if (params.experienceLevel) searchParams.set('experienceLevel', params.experienceLevel);
      if (params.cursor) searchParams.set('cursor', params.cursor);
      if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
      const qs = searchParams.toString();
      return apiClient(`/marketplace/search${qs ? `?${qs}` : ''}`);
    }
    ```
  - [ ] 5.2 **Public API calls**: The existing `apiClient` (`api-client.ts:26-29`) already handles unauthenticated calls gracefully — `getAuthHeaders()` returns `{}` when no token is in sessionStorage, so the Authorization header is simply omitted. No `publicApiClient` needed; use the existing `apiClient` directly for marketplace search calls.
  - [ ] 5.3 Create LGA list fetch function (reuse `fetchLgas()` from `export.api.ts` if exported, or create new one) for the filter dropdown

- [ ] Task 6: Create frontend TanStack Query hooks (AC: #7, #8)
  - [ ] 6.1 Create `apps/web/src/features/marketplace/hooks/useMarketplace.ts`:
    ```typescript
    export const marketplaceKeys = {
      all: ['marketplace'] as const,
      search: (params: MarketplaceSearchParams) => [...marketplaceKeys.all, 'search', params] as const,
    };

    export function useMarketplaceSearch(params: MarketplaceSearchParams) {
      return useQuery({
        queryKey: marketplaceKeys.search(params),
        queryFn: () => searchMarketplace(params),
        staleTime: 30_000,       // 30s — search results fresh enough
        placeholderData: keepPreviousData,  // Keep showing old results while new ones load
      });
    }
    ```
  - [ ] 6.2 Use `keepPreviousData` (TanStack Query v5) so the UI doesn't flash empty during filter changes

- [ ] Task 7: Create frontend marketplace search page and components (AC: #7, #8)
  - [ ] 7.1 Create `apps/web/src/features/marketplace/components/MarketplaceSearchBar.tsx`:
    - Text input with search icon, placeholder "Search skills (e.g., Electrician, Tailor...)"
    - Debounced onChange (300ms) — follow `RegistryFilters.tsx` debounce pattern
    - Minimum 0 characters (allow empty to browse), max 200 characters
  - [ ] 7.2 Create `apps/web/src/features/marketplace/components/MarketplaceFilters.tsx`:
    - LGA dropdown (populated from `/lgas` API, cached 5 min)
    - Profession text filter (free-text, could later become a dropdown)
    - Experience level filter (free-text or dropdown if enum values are known)
    - "Clear filters" button
  - [ ] 7.3 Create `apps/web/src/features/marketplace/components/WorkerCard.tsx`:
    - Anonymous profile card showing: profession, LGA name, experience level
    - Verified badge (green "Government Verified" checkmark if `verifiedBadge === true`)
    - Bio snippet (truncated to ~100 chars with "..." if present)
    - "View Profile" or "Reveal Contact" button (disabled in this story — Story 7-3/7-4 scope)
    - Card design: use shadcn/ui `Card` component with consistent styling
  - [ ] 7.4 Create `apps/web/src/features/marketplace/components/MarketplaceResultsGrid.tsx`:
    - Grid layout for WorkerCard components (responsive: 1 col mobile, 2 col tablet, 3 col desktop)
    - Empty state: "No workers found matching your criteria" with suggestion to broaden search
    - Loading state: skeleton cards (3-6 skeleton placeholders)
  - [ ] 7.5 Create `apps/web/src/features/marketplace/pages/MarketplaceSearchPage.tsx`:
    - Compose: MarketplaceSearchBar + MarketplaceFilters + MarketplaceResultsGrid
    - State management: search query, filters, cursor (all in component state, synced to URL query params via `useSearchParams`)
    - Pagination: "Load More" button or Previous/Next with cursor navigation
    - Total results count display
    - Page title: "Skills Marketplace" with subtitle "Find verified skilled workers in Oyo State"
  - [ ] 7.6 **Two marketplace routes exist in App.tsx — update the correct one:**
    - **`/marketplace` (App.tsx:414-422)** — Public unauthenticated route inside `<PublicLayout>`, currently redirects to `/#marketplace`. **Replace this redirect with the new `MarketplaceSearchPage`.** This is the correct target.
    - **`/public/marketplace` (App.tsx:1160-1167)** — Behind `<ProtectedRoute allowedRoles={['public_user']}>`, renders `PublicMarketplacePage`. This is for logged-in public users. Either update it to also render `MarketplaceSearchPage`, or leave as-is (logged-in users can use the public `/marketplace` route).
    - `PublicMarketplacePage.tsx` placeholder can be deleted or kept for the authenticated view.

- [ ] Task 8: Wire frontend routes (AC: #7)
  - [ ] 8.1 In `apps/web/src/App.tsx`, replace the `/marketplace` redirect at lines 414-422 (inside `<PublicLayout>`) with the new `MarketplaceSearchPage`
  - [ ] 8.2 The marketplace page should be accessible WITHOUT authentication — it's a public route
  - [ ] 8.3 The `/marketplace` route at line 414 is already inside `<PublicLayout>` with no `<ProtectedRoute>` wrapper — it's publicly accessible. Note: it IS inside `<AuthProvider>` (line 206), but `AuthProvider` only provides context and does NOT block access.

- [ ] Task 9: Write backend tests (AC: #9)
  - [ ] 9.1 Create `apps/api/src/controllers/__tests__/marketplace.controller.test.ts`:
    - Search happy path: query returns matching profiles with relevance scores
    - Filter by lgaId: returns only profiles in specified LGA
    - Filter by profession: returns matching profession results
    - Filter by experienceLevel: returns matching experience results
    - Combined filters: lgaId + profession + query returns intersection
    - Browse mode (no query): returns profiles sorted by updatedAt
    - Empty results: returns `{ data: [], meta: { pagination: { totalItems: 0 } } }`
    - Pagination: cursor returns next page, max 100 enforced
    - Zod validation: invalid pageSize (>100) returns 400
    - Zod validation: query >200 chars returns 400
    - **PII exclusion test**: verify response contains NO respondentId, firstName, lastName, phoneNumber, nin, dateOfBirth fields
    - Rate limiting: verify 429 response format matches `{ status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: '...' }`
  - [ ] 9.2 Create `apps/api/src/services/__tests__/marketplace.service.test.ts`:
    - Full-text search query construction: verify `plainto_tsquery` is used (never `to_tsquery`)
    - Filter condition building
    - Cursor parsing and pagination logic
    - LGA name resolution via JOIN
  - [ ] 9.3 `pnpm test` — all tests pass, zero regressions

- [ ] Task 10: Write frontend tests (AC: #9)
  - [ ] 10.1 Create `apps/web/src/features/marketplace/__tests__/MarketplaceSearchPage.test.tsx`:
    - Renders search bar, filters, and results grid
    - Search debounce: typing triggers API call after 300ms
    - Filter change triggers new search
    - Loading state shows skeleton cards
    - Empty state shows "No workers found" message
    - WorkerCard displays anonymous fields correctly
    - Verified badge renders for profiles with `verifiedBadge: true`
    - No PII rendered in any card
  - [ ] 10.2 `cd apps/web && pnpm vitest run` — all web tests pass (NEVER run web tests from root)

## Dev Notes

### Full-Text Search Query Pattern (Architecture Spec)

The architecture document (lines 1795-1891) specifies this exact search pattern:

```typescript
// apps/api/src/services/marketplace.service.ts
async searchProfiles(query: string, filters: SearchFilters): Promise<Profile[]> {
  const searchQuery = db
    .select()
    .from(marketplaceProfiles)
    .where(
      sql`search_vector @@ plainto_tsquery('english', ${query})`
    )
    .orderBy(
      sql`ts_rank(search_vector, plainto_tsquery('english', ${query})) DESC`
    )
    .limit(50);

  return await searchQuery;
}
```

**Ranking Weights** (set by tsvector trigger in Story 7-1):
- **A (1.0):** Profession (highest relevance)
- **B (0.4):** Skills (secondary)
- **C (0.2):** LGA (location filter)
- **D (0.1):** Experience Level (enum, minimal text relevance)

**Performance:** 20-80ms per query at 300K profiles. GIN index ~30MB. Well under 250ms target.

### CRITICAL: `plainto_tsquery()` Only

`to_tsquery()` parses operator syntax (`&`, `|`, `!`, `<->`) — **vulnerable to injection** if user input is passed directly. `plainto_tsquery()` treats all input as plain text — **safe by design**, no operator parsing. This is a hard rule from architecture.md and prep-5 spike.

### Cursor-Based Pagination (Not Offset)

Architecture spec (line 914): "Pagination via cursor (last seen ID) not offset (prevents scraping loops)."

Follow the `respondent.service.ts:405-586` pattern:
- Cursor format: `${ISO_DATE}|${UUID}`
- Forward-only navigation
- Max 100 per page
- Separate count query for `totalItems`

Existing type definition (`packages/types/src/respondent.ts:77-89`):
```typescript
export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      pageSize: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      nextCursor: string | null;
      previousCursor: string | null;
      totalItems: number;
    };
  };
}
```

Reuse this interface from `@oslsr/types` rather than creating a new one.

### Rate Limiting Pattern (30 req/min/IP)

Follow existing `login-rate-limit.ts` / `rate-limit.ts` pattern:

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';

let redisClient: Redis | null = null;
function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

const isTestEnv = process.env.NODE_ENV === 'test';

export const marketplaceSearchRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({
    sendCommand: ((...args: string[]) =>
      getRedisClient().call(args[0], ...args.slice(1))) as (...args: string[]) => Promise<number>,
  }),
  windowMs: 60 * 1000,  // 1 minute
  max: 30,               // 30 requests per minute per IP
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: (req, res) => {
    res.status(429).json({
      status: 'error',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many search requests. Please try again later.',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
```

### Route Mounting Pattern

In `apps/api/src/routes/index.ts` (line 28+), routes are mounted with `router.use('/path', routes)`. Add:
```typescript
import marketplaceRoutes from './marketplace.routes.js';
// ...
router.use('/marketplace', marketplaceRoutes);
```

This makes the search endpoint accessible at `GET /api/v1/marketplace/search`.

**No authentication middleware.** This is the first public data route in the API. The route file should NOT import or apply `authenticate` or `authorize`.

### Controller Pattern (Class-Based Static Methods)

Follow `respondent.controller.ts` pattern:
```typescript
export class MarketplaceController {
  static async search(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = marketplaceSearchSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid search parameters', 400, {
          errors: parsed.error.flatten().fieldErrors,
        });
      }
      const result = await MarketplaceService.searchProfiles(parsed.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

### LGA Name Resolution

The `marketplace_profiles` table stores `lga_id` (text code like 'ibadan-north'). The search results must include `lgaName` (human-readable like 'Ibadan North'). JOIN with the `lgas` table:

```typescript
// lgas schema (apps/api/src/db/schema/lgas.ts):
// code: text (unique, slug format) — this is what marketplace_profiles.lga_id stores
// name: text (unique, human-readable) — this is what search results display

// Join pattern:
.leftJoin(lgas, eq(marketplaceProfiles.lgaId, lgas.code))
```

### Frontend API Client: Public Endpoint Handling

The existing `apiClient` (`apps/web/src/lib/api-client.ts`) already handles unauthenticated calls correctly. `getAuthHeaders()` (line 26-29) returns `{}` when no token is in sessionStorage, so the Authorization header is simply omitted from the request. No `publicApiClient` variant is needed — use the existing `apiClient` directly for marketplace search calls.

### Frontend Feature Directory Structure

Follow the existing feature organization pattern:
```
apps/web/src/features/marketplace/
  api/
    marketplace.api.ts
  hooks/
    useMarketplace.ts
  components/
    MarketplaceSearchBar.tsx
    MarketplaceFilters.tsx
    WorkerCard.tsx
    MarketplaceResultsGrid.tsx
  pages/
    MarketplaceSearchPage.tsx
  __tests__/
    MarketplaceSearchPage.test.tsx
```

### Existing Marketplace Placeholders (Replace/Update)

Two existing placeholder files:
1. **`apps/web/src/features/dashboard/pages/PublicMarketplacePage.tsx`** — shows "Not yet available" with briefcase icon. Replace content or update route to point to new page.
2. **`apps/web/src/features/home/sections/MarketplacePreviewSection.tsx`** — home page teaser with disabled search input. Update to link to the real `/marketplace` page and optionally enable the search input.

### Existing hCaptcha Component

`apps/web/src/features/auth/components/HCaptcha.tsx` — reusable hCaptcha component with:
- `onVerify`, `onExpire`, `onError` callbacks
- E2E test bypass (`VITE_E2E=true` → auto-verify with 'test-captcha-bypass')
- Reset support via `reset` prop

**Not needed for this story** — CAPTCHA for search is an optional progressive escalation (after 10 searches in 5 min per IP). If prep-5 spike recommends CAPTCHA for search, implement the `optionalCaptcha` middleware variant. The backend middleware at `middleware/captcha.ts:129-141` already has an `optionalCaptcha` variant.

### Redis Caching Strategy (Architecture Spec)

Architecture (lines 906-909) specifies:
- Search results cached in Redis (5-minute TTL)
- Cache key: `marketplace:search:${JSON.stringify(queryParams)}`
- Invalidated when new profiles created

**Implementation recommendation:** Start WITHOUT Redis caching in this story. PostgreSQL full-text search is already fast (20-80ms). Add caching in a future optimization story if latency becomes an issue. The 2GB VPS has limited Redis memory.

### What This Story Does NOT Include (Future Stories)

| Feature | Story | Why Not Here |
|---------|-------|-------------|
| Single profile detail view | 7-3 | Separate endpoint with verified badge display |
| Contact reveal (name/phone) | 7-4 | Authentication + CAPTCHA + consent check |
| Profile self-edit (bio, portfolio) | 7-5 | Edit token, SMS integration |
| Contact view logging + rate limiting | 7-6 | Audit trail, 50/user/24h enforcement |
| Progressive CAPTCHA for search | 7-6 or separate | Depends on prep-5 spike output |
| Search result Redis caching | Future | Premature optimization at current scale |
| Fuzzy search / pg_trgm | Future | tsvector exact match sufficient for MVP |

### Project Structure Notes

**New files:**
- `apps/api/src/services/marketplace.service.ts` — Search service
- `apps/api/src/controllers/marketplace.controller.ts` — Controller
- `apps/api/src/routes/marketplace.routes.ts` — Routes (public, no auth)
- `apps/api/src/middleware/marketplace-rate-limit.ts` — Rate limiter
- `apps/web/src/features/marketplace/api/marketplace.api.ts` — API client
- `apps/web/src/features/marketplace/hooks/useMarketplace.ts` — TanStack Query hooks
- `apps/web/src/features/marketplace/components/MarketplaceSearchBar.tsx`
- `apps/web/src/features/marketplace/components/MarketplaceFilters.tsx`
- `apps/web/src/features/marketplace/components/WorkerCard.tsx`
- `apps/web/src/features/marketplace/components/MarketplaceResultsGrid.tsx`
- `apps/web/src/features/marketplace/pages/MarketplaceSearchPage.tsx`
- `apps/api/src/controllers/__tests__/marketplace.controller.test.ts`
- `apps/api/src/services/__tests__/marketplace.service.test.ts`
- `apps/web/src/features/marketplace/__tests__/MarketplaceSearchPage.test.tsx`

**Modified files:**
- `apps/api/src/routes/index.ts` — Add marketplace route mount
- `apps/web/src/App.tsx` — Replace `/marketplace` redirect (line 414-422) with new `MarketplaceSearchPage`; optionally update `/public/marketplace` (line 1160-1167)
- `packages/types/src/marketplace.ts` — Add search-specific types (if not already from Story 7-1)

### Anti-Patterns to Avoid

- **Do NOT use `to_tsquery()`** — always `plainto_tsquery()` for user input. This is a hard security rule. `to_tsquery()` allows operator injection.
- **Do NOT use offset-based pagination** — cursor-based only. Offset-based enables scraping loops (attacker increments offset to enumerate all profiles).
- **Do NOT expose `respondentId` in search results** — the profile `id` is the public identifier. The `respondentId` is an internal FK that could be used for cross-referencing attacks.
- **Do NOT expose PII in search results** — no firstName, lastName, phoneNumber, NIN, or dateOfBirth. These are Story 7-4 (contact reveal) scope.
- **Do NOT add authentication to the search route** — search is public by design (architecture spec). Authentication is only for contact reveal (Story 7-4).
- **Do NOT apply `authorize()` middleware** — this is a public route with no role-based access.
- **Do NOT add Redis caching** — premature optimization. PostgreSQL full-text search is fast enough at current scale (20-80ms).
- **Do NOT expose total count in offset form** — the `totalItems` in the cursor pagination response is acceptable, but avoid `totalPages` or `offset` that would allow scraping calculation.
- **Do NOT import from `@oslsr/types` in schema files** — drizzle-kit constraint. This story doesn't modify schema, but remember for any schema touches.
- **Do NOT create the `contact_reveals` table** — that's Story 7-4/7-6 scope.
- **Do NOT add device fingerprinting** — that's Story 7-6 scope per the architecture spec.

### References

- [Source: epics.md:1963-1974] — Story 7.2 acceptance criteria
- [Source: architecture.md:900-914] — Marketplace query optimization, cursor pagination, Redis caching strategy
- [Source: architecture.md:1795-1891] — Full-text search strategy (tsvector + GIN, plainto_tsquery, ts_rank weights)
- [Source: architecture.md:662-841] — Marketplace route security model, 6-layer bot protection
- [Source: prep-4-marketplace-data-model-spike.md] — Schema design, field mapping, search strategy
- [Source: prep-5-public-route-security-spike.md] — Rate limiting, CAPTCHA, input validation, bot protection
- [Source: 7-1-marketplace-data-extraction-worker.md] — marketplace_profiles schema, tsvector trigger, GIN index
- [Source: routes/index.ts] — Route mounting pattern
- [Source: respondent.controller.ts:25-40] — Zod validation pattern for list endpoints
- [Source: respondent.service.ts:405-586] — Cursor-based pagination pattern
- [Source: login-rate-limit.ts] — IP-based rate limiting with Redis store
- [Source: middleware/captcha.ts] — hCaptcha middleware (verifyCaptcha + optionalCaptcha)
- [Source: middleware/auth.ts:130-143] — optionalAuthenticate middleware pattern
- [Source: lgas.ts] — LGA schema (code + name fields)
- [Source: packages/types/src/respondent.ts:77-89] — CursorPaginatedResponse type
- [Source: apps/web/src/features/dashboard/components/RegistryFilters.tsx] — Debounced search filter pattern
- [Source: apps/web/src/features/dashboard/api/registry.api.ts] — Cursor-based API client pattern
- [Source: apps/web/src/features/dashboard/hooks/useAssessor.ts] — TanStack Query key factory pattern
- [Source: apps/web/src/features/auth/components/HCaptcha.tsx] — hCaptcha component (reuse in future stories)
- [Source: apps/web/src/features/dashboard/pages/PublicMarketplacePage.tsx] — Current placeholder to replace
- [Source: apps/web/src/features/home/sections/MarketplacePreviewSection.tsx] — Home page teaser
- [Source: apps/web/src/lib/api-client.ts] — Base API client (already handles unauthenticated calls — `getAuthHeaders()` returns `{}` when no token)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
