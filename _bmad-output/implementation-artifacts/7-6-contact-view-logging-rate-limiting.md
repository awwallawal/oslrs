# Story 7.6: Contact View Logging & Rate Limiting

Status: ready-for-dev

## Story

As a **System**,
I want to monitor and limit the harvesting of worker contact data,
So that I protect workers from spam and scrapers.

## Context

This is the sixth and final story of Epic 7: Public Skills Marketplace & Search Security. It hardens the contact reveal feature (built in Story 7-4) with Redis-accelerated rate limiting, device fingerprinting, and an admin monitoring dashboard — the three pillars required before the marketplace goes public.

**Prerequisites:**
- **Story 7-4 (authenticated contact reveal & CAPTCHA)** — provides `contact_reveals` table, `MarketplaceService.revealContact()`, 50/user/24h SQL count, `POST /marketplace/profiles/:id/reveal` route with `authenticate` + `verifyCaptcha` middleware.
- **prep-5 (public route security spike)** must be completed — provides threat model, rate limiting strategy, device fingerprinting design.

**Why this story exists:** Story 7-4 implements a SQL-count rate limiter that is sufficient for low traffic but has two weaknesses:
1. **Performance**: Every reveal attempt queries `contact_reveals` with a `COUNT(*)` — at scale this adds latency to every request.
2. **Evasion**: A determined scraper can create multiple accounts and harvest 50 contacts × N accounts per day. Device fingerprinting links accounts to physical devices, making multi-account abuse detectable.
3. **Visibility**: No admin interface exists to monitor reveal patterns, detect abuse, or take action.

**Architecture context:** The architecture document (lines 811-841) specifies a 6-layer bot protection strategy. This story implements Layer 3 (device fingerprinting) and extends Layer 1 (rate limiting with Redis acceleration). The admin dashboard provides observability across all layers.

**Scope from Story 7-4 split:**

| Feature | Story 7-4 (Done) | Story 7-6 (This Story) |
|---------|-----------------|----------------------|
| `contact_reveals` table | Created | Extend with `device_fingerprint` column |
| 50/user/24h rate check | SQL count | Redis-accelerated fast-path |
| Device fingerprinting | No | Yes (FingerprintJS open-source) |
| Audit logging | AuditService + contact_reveals row | Enhanced with device fingerprint |
| Admin monitoring | No | Yes (dashboard + analytics) |
| Frontend reveal UI | Yes | Fingerprint header injection only |

## Acceptance Criteria

1. **Given** an authenticated contact reveal action, **when** the user clicks "Reveal Contact", **then** the system logs the Viewer ID, Worker ID, device fingerprint, IP address, user agent, and timestamp in the `contact_reveals` table.
2. **Given** the reveal endpoint, **when** the authenticated user has already revealed 50 contacts in the past 24 hours, **then** the server returns 429 with `{ code: 'REVEAL_LIMIT_EXCEEDED', retryAfter }` — checked via Redis counter first (fast path), with SQL count as fallback.
3. **Given** a reveal request, **when** the frontend sends an `x-device-fingerprint` header, **then** the backend stores the fingerprint in `contact_reveals.device_fingerprint` and includes it in the Redis rate limit key.
4. **Given** the reveal endpoint, **when** the same device fingerprint is used across multiple user accounts revealing the same profile, **then** the system logs this pattern for admin review (no automatic block — admin decides).
5. **Given** a Super Admin navigating to the reveal analytics page, **when** the page loads, **then** they see: total reveals (24h/7d/30d), top 10 viewers by reveal count, top 10 viewed profiles, and flagged suspicious patterns (same device across multiple accounts).
6. **Given** the analytics endpoint, **when** a non-Super-Admin user calls it, **then** the server returns 403.
7. **Given** the existing test suite, **when** all tests run, **then** comprehensive tests cover: Redis rate limiting, device fingerprint storage, analytics queries, admin authorization, and zero regressions.

## Tasks / Subtasks

- [ ] Task 1: Extend `contact_reveals` schema with device fingerprint (AC: #1, #3)
  - [ ] 1.1 In `apps/api/src/db/schema/contact-reveals.ts` (created by Story 7-4), add column:
    ```typescript
    deviceFingerprint: text('device_fingerprint'),  // FingerprintJS visitor ID (optional)
    ```
  - [ ] 1.2 Add composite index for device-based analytics queries:
    ```typescript
    // Index for "same device, multiple accounts" detection
    idxContactRevealsDeviceCreatedAt: index('idx_contact_reveals_device_created_at')
      .on(table.deviceFingerprint, table.createdAt),
    ```
  - [ ] 1.3 Run `pnpm --filter @oslsr/api db:push:force` to apply schema change
  - [ ] 1.4 **Schema convention:** Do NOT import from `@oslsr/types` in schema files. Do NOT add FK constraints — orphaned audit entries are acceptable.

- [ ] Task 2: Install FingerprintJS and create device fingerprint hook (AC: #3)
  - [ ] 2.1 Install the open-source FingerprintJS library:
    ```bash
    pnpm --filter @oslsr/web add @fingerprintjs/fingerprintjs
    ```
  - [ ] 2.2 Create `apps/web/src/hooks/useDeviceFingerprint.ts`:
    ```typescript
    import { useState, useEffect } from 'react';

    let cachedFingerprint: string | null = null;

    export function useDeviceFingerprint(): string | null {
      const [fingerprint, setFingerprint] = useState<string | null>(cachedFingerprint);

      useEffect(() => {
        if (cachedFingerprint) return;

        async function load() {
          try {
            const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            cachedFingerprint = result.visitorId;
            setFingerprint(result.visitorId);
          } catch {
            // Fingerprinting is best-effort — don't block the reveal flow
            setFingerprint(null);
          }
        }
        load();
      }, []);

      return fingerprint;
    }
    ```
  - [ ] 2.3 **Why open-source, not Pro:** FingerprintJS open-source (v4) provides a stable visitorId derived from browser attributes. FingerprintJS Pro (paid, server-side) offers higher accuracy but is unnecessary for our threat model — we use fingerprints for pattern detection, not as a hard security gate.
  - [ ] 2.4 **Module-level cache:** The fingerprint is computed once per session and cached in a module variable. The hook returns the cached value on subsequent mounts. This avoids re-computing on every component render.
  - [ ] 2.5 **Graceful degradation:** If FingerprintJS fails (ad blocker, privacy browser), the fingerprint is `null`. The reveal flow continues — fingerprinting is additive defense, not a gate.

- [ ] Task 3: Integrate device fingerprint into reveal flow (AC: #1, #3)
  - [ ] 3.1 In `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx`, import and use the hook:
    ```typescript
    import { useDeviceFingerprint } from '@/hooks/useDeviceFingerprint';

    // Inside component:
    const deviceFingerprint = useDeviceFingerprint();
    ```
  - [ ] 3.2 Update the reveal API call in `apps/web/src/features/marketplace/api/marketplace.api.ts` to pass the fingerprint:
    ```typescript
    export async function revealMarketplaceContact(
      profileId: string,
      captchaToken: string,
      deviceFingerprint?: string | null,
    ): Promise<ContactRevealResponse> {
      const headers: Record<string, string> = {};
      if (deviceFingerprint) {
        headers['x-device-fingerprint'] = deviceFingerprint;
      }
      const response = await apiClient(`/marketplace/profiles/${profileId}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ captchaToken }),
        headers,
      });
      return response.data;
    }
    ```
  - [ ] 3.3 Update the `useRevealContact` mutation call site to pass `deviceFingerprint` from the hook.
  - [ ] 3.4 On the backend, in `MarketplaceController.revealContact()` (created by Story 7-4), extract the header:
    ```typescript
    const deviceFingerprint = req.get('x-device-fingerprint') || null;
    ```
  - [ ] 3.5 Pass `deviceFingerprint` to `MarketplaceService.revealContact()` — add it as a parameter and store it in the `contact_reveals` INSERT:
    ```typescript
    await db.insert(contactReveals).values({
      viewerId,
      profileId,
      ipAddress,
      userAgent,
      deviceFingerprint,  // NEW — nullable
    });
    ```
  - [ ] 3.6 Include `deviceFingerprint` in the AuditService call:
    ```typescript
    AuditService.logPiiAccess(req, 'pii.contact_reveal', 'marketplace_profiles', profileId, {
      viewerRole: user.role,
      deviceFingerprint,  // NEW — for audit trail
    });
    ```

- [ ] Task 4: Create Redis-accelerated reveal rate limiter (AC: #2)
  - [ ] 4.1 Create `apps/api/src/middleware/reveal-rate-limit.ts`:
    ```typescript
    import { Redis } from 'ioredis';
    import { logger } from '../utils/logger.js';

    const isTestMode = () =>
      process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

    let redisClient: Redis | null = null;

    const getRedisClient = () => {
      if (!redisClient && !isTestMode()) {
        redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      }
      return redisClient;
    };

    const REVEAL_LIMIT = 50;
    const REVEAL_WINDOW_SECONDS = 86400; // 24 hours

    /**
     * Redis-accelerated rate limiter for contact reveals.
     * Fast-path check: Redis INCR with 24h TTL.
     * The SQL count in MarketplaceService.revealContact() remains as fallback
     * (source of truth for edge cases: Redis restart, TTL drift).
     */
    export async function checkRevealRateLimit(
      userId: string,
      deviceFingerprint?: string | null,
    ): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
      if (isTestMode()) {
        return { allowed: true, remaining: REVEAL_LIMIT };
      }

      const redis = getRedisClient();
      if (!redis) {
        // Redis unavailable — fall through to SQL count in service
        return { allowed: true, remaining: REVEAL_LIMIT };
      }

      try {
        // Primary key: per-user
        const userKey = `rl:reveal:user:${userId}`;
        const count = await redis.incr(userKey);

        if (count === 1) {
          // First reveal in window — set TTL
          await redis.expire(userKey, REVEAL_WINDOW_SECONDS);
        }

        if (count > REVEAL_LIMIT) {
          // Decrement back — we shouldn't count a blocked attempt
          await redis.decr(userKey);
          const ttl = await redis.ttl(userKey);
          return {
            allowed: false,
            remaining: 0,
            retryAfter: ttl > 0 ? ttl : REVEAL_WINDOW_SECONDS,
          };
        }

        // Optional: track per-device for analytics (don't enforce, just observe)
        if (deviceFingerprint) {
          const deviceKey = `rl:reveal:device:${deviceFingerprint}`;
          await redis.incr(deviceKey);
          const deviceTtl = await redis.ttl(deviceKey);
          if (deviceTtl < 0) {
            await redis.expire(deviceKey, REVEAL_WINDOW_SECONDS);
          }
        }

        return { allowed: true, remaining: REVEAL_LIMIT - count };
      } catch (err) {
        logger.warn({ event: 'reveal.redis_rate_limit_failed', error: (err as Error).message });
        // Redis error — fall through to SQL count in service
        return { allowed: true, remaining: REVEAL_LIMIT };
      }
    }
    ```
  - [ ] 4.2 **Integration with MarketplaceService.revealContact()**: Call `checkRevealRateLimit()` BEFORE the SQL count check. If Redis says blocked, return immediately without hitting the database. If Redis says allowed (or unavailable), proceed with the existing SQL count as source of truth.
    ```typescript
    // In MarketplaceService.revealContact():
    // Step 1: Redis fast-path check
    const redisCheck = await checkRevealRateLimit(viewerId, deviceFingerprint);
    if (!redisCheck.allowed) {
      return { status: 'rate_limited', retryAfter: redisCheck.retryAfter };
    }

    // Step 2: SQL count check (source of truth) — existing 7-4 code
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(contactReveals)
      .where(and(
        eq(contactReveals.viewerId, viewerId),
        gt(contactReveals.createdAt, sql`NOW() - INTERVAL '24 hours'`)
      ));
    if (count >= 50) { /* ... existing retryAfter logic ... */ }

    // Step 3: Insert reveal row + audit (existing 7-4 code, now with deviceFingerprint)
    ```
  - [ ] 4.3 **Why both Redis and SQL?** Redis provides O(1) fast-path rejection for blocked users (avoids DB query). SQL is the source of truth (survives Redis restart). In practice, Redis and SQL stay in sync because every successful reveal increments both. The only drift scenario is Redis restart mid-window — the SQL count catches any overage.
  - [ ] 4.4 **Test mode:** `isTestMode()` returns `{ allowed: true }` immediately — no Redis connection in test.

- [ ] Task 5: Create reveal analytics service (AC: #5)
  - [ ] 5.1 Create `apps/api/src/services/reveal-analytics.service.ts`:
    ```typescript
    export class RevealAnalyticsService {
      /**
       * Get reveal statistics for the given time period.
       */
      static async getRevealStats(periodDays: number = 30): Promise<RevealStats> {
        // Count reveals in 24h, 7d, 30d using conditional counts
        const [stats] = await db.select({
          total24h: sql<number>`count(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')`,
          total7d: sql<number>`count(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')`,
          total30d: sql<number>`count(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')`,
          uniqueViewers24h: sql<number>`count(DISTINCT viewer_id) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')`,
          uniqueProfiles24h: sql<number>`count(DISTINCT profile_id) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')`,
        }).from(contactReveals);

        return stats;
      }

      /**
       * Top N viewers by reveal count in the given period.
       */
      static async getTopViewers(days: number = 7, limit: number = 10): Promise<TopViewer[]> {
        const cutoff = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`;
        return db.select({
          viewerId: contactReveals.viewerId,
          revealCount: sql<number>`count(*)`.as('reveal_count'),
          distinctProfiles: sql<number>`count(DISTINCT ${contactReveals.profileId})`.as('distinct_profiles'),
          lastRevealAt: sql<string>`max(${contactReveals.createdAt})`.as('last_reveal_at'),
        })
        .from(contactReveals)
        .where(gt(contactReveals.createdAt, cutoff))
        .groupBy(contactReveals.viewerId)
        .orderBy(sql`count(*) DESC`)
        .limit(limit);
      }

      /**
       * Top N viewed profiles by reveal count in the given period.
       */
      static async getTopProfiles(days: number = 7, limit: number = 10): Promise<TopProfile[]> {
        const cutoff = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`;
        return db.select({
          profileId: contactReveals.profileId,
          revealCount: sql<number>`count(*)`.as('reveal_count'),
          distinctViewers: sql<number>`count(DISTINCT ${contactReveals.viewerId})`.as('distinct_viewers'),
          lastRevealAt: sql<string>`max(${contactReveals.createdAt})`.as('last_reveal_at'),
        })
        .from(contactReveals)
        .where(gt(contactReveals.createdAt, cutoff))
        .groupBy(contactReveals.profileId)
        .orderBy(sql`count(*) DESC`)
        .limit(limit);
      }

      /**
       * Detect suspicious patterns: same device fingerprint used across multiple accounts.
       * Returns devices that have been used by 2+ distinct viewer accounts.
       */
      static async getSuspiciousDevices(days: number = 7, limit: number = 10): Promise<SuspiciousDevice[]> {
        const cutoff = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`;
        return db.select({
          deviceFingerprint: contactReveals.deviceFingerprint,
          accountCount: sql<number>`count(DISTINCT ${contactReveals.viewerId})`.as('account_count'),
          totalReveals: sql<number>`count(*)`.as('total_reveals'),
          lastSeenAt: sql<string>`max(${contactReveals.createdAt})`.as('last_seen_at'),
        })
        .from(contactReveals)
        .where(and(
          gt(contactReveals.createdAt, cutoff),
          isNotNull(contactReveals.deviceFingerprint),
        ))
        .groupBy(contactReveals.deviceFingerprint)
        .having(sql`count(DISTINCT ${contactReveals.viewerId}) >= 2`)
        .orderBy(sql`count(DISTINCT ${contactReveals.viewerId}) DESC`)
        .limit(limit);
      }
    }
    ```
  - [ ] 5.2 **SQL safety:** All interval values are hardcoded strings via `sql.raw(String(days))` where `days` is a validated integer from Zod (not user input). No injection risk.
  - [ ] 5.3 **Performance:** The `FILTER (WHERE ...)` syntax is PostgreSQL-specific and more efficient than separate queries. The device fingerprint index (Task 1.2) supports the suspicious devices query.

- [ ] Task 6: Create reveal analytics controller + routes (AC: #5, #6)
  - [ ] 6.1 Create `apps/api/src/controllers/reveal-analytics.controller.ts`:
    ```typescript
    import { z } from 'zod';

    const analyticsQuerySchema = z.object({
      days: z.coerce.number().int().min(1).max(90).default(7),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    });

    export class RevealAnalyticsController {
      static async getStats(req: Request, res: Response, next: NextFunction) {
        try {
          const stats = await RevealAnalyticsService.getRevealStats();
          res.json({ data: stats });
        } catch (error) { next(error); }
      }

      static async getTopViewers(req: Request, res: Response, next: NextFunction) {
        try {
          const { days, limit } = analyticsQuerySchema.parse(req.query);
          const viewers = await RevealAnalyticsService.getTopViewers(days, limit);
          res.json({ data: viewers });
        } catch (error) { next(error); }
      }

      static async getTopProfiles(req: Request, res: Response, next: NextFunction) {
        try {
          const { days, limit } = analyticsQuerySchema.parse(req.query);
          const profiles = await RevealAnalyticsService.getTopProfiles(days, limit);
          res.json({ data: profiles });
        } catch (error) { next(error); }
      }

      static async getSuspiciousDevices(req: Request, res: Response, next: NextFunction) {
        try {
          const { days, limit } = analyticsQuerySchema.parse(req.query);
          const devices = await RevealAnalyticsService.getSuspiciousDevices(days, limit);
          res.json({ data: devices });
        } catch (error) { next(error); }
      }
    }
    ```
  - [ ] 6.2 Add routes in `apps/api/src/routes/marketplace.routes.ts`:
    ```typescript
    import { authenticate } from '../middleware/auth.js';
    import { authorize } from '../middleware/rbac.js';
    import { UserRole } from '@oslsr/types';

    // GET /api/v1/marketplace/analytics/reveals — Super Admin only
    router.get('/analytics/reveals',
      authenticate,
      authorize(UserRole.SUPER_ADMIN),
      RevealAnalyticsController.getStats
    );

    router.get('/analytics/reveals/top-viewers',
      authenticate,
      authorize(UserRole.SUPER_ADMIN),
      RevealAnalyticsController.getTopViewers
    );

    router.get('/analytics/reveals/top-profiles',
      authenticate,
      authorize(UserRole.SUPER_ADMIN),
      RevealAnalyticsController.getTopProfiles
    );

    router.get('/analytics/reveals/suspicious-devices',
      authenticate,
      authorize(UserRole.SUPER_ADMIN),
      RevealAnalyticsController.getSuspiciousDevices
    );
    ```
  - [ ] 6.3 **Authorization:** `authorize(UserRole.SUPER_ADMIN)` — only Super Admins can view reveal analytics. This is consistent with all other admin analytics endpoints (productivity, audit logs, system health).
  - [ ] 6.4 **Route placement:** Analytics routes go BEFORE the `/profiles/:id` wildcard route in marketplace.routes.ts to avoid the `:id` param capturing "analytics" as a profile ID.

- [ ] Task 7: Add analytics types (AC: #5)
  - [ ] 7.1 In `packages/types/src/marketplace.ts`, add:
    ```typescript
    export interface RevealStats {
      total24h: number;
      total7d: number;
      total30d: number;
      uniqueViewers24h: number;
      uniqueProfiles24h: number;
    }

    export interface TopViewer {
      viewerId: string;
      revealCount: number;
      distinctProfiles: number;
      lastRevealAt: string;
    }

    export interface TopProfile {
      profileId: string;
      revealCount: number;
      distinctViewers: number;
      lastRevealAt: string;
    }

    export interface SuspiciousDevice {
      deviceFingerprint: string;
      accountCount: number;
      totalReveals: number;
      lastSeenAt: string;
    }

    export interface RevealAnalyticsResponse {
      stats: RevealStats;
      topViewers: TopViewer[];
      topProfiles: TopProfile[];
      suspiciousDevices: SuspiciousDevice[];
    }
    ```
  - [ ] 7.2 Export from `packages/types/src/index.ts`

- [ ] Task 8: Create admin reveal analytics page (AC: #5)
  - [ ] 8.1 Create `apps/web/src/features/marketplace/pages/RevealAnalyticsPage.tsx`:
    - Page title: "Contact Reveal Analytics"
    - **Stats cards row:** Total reveals (24h / 7d / 30d), unique viewers (24h), unique profiles viewed (24h)
    - **Top viewers table:** Columns: Viewer ID (truncated UUID), Reveal Count, Distinct Profiles, Last Reveal. Sortable. Clickable viewer ID → future: link to user detail.
    - **Top profiles table:** Columns: Profile ID (truncated UUID), Reveal Count, Distinct Viewers, Last Reveal.
    - **Suspicious devices section:** Cards showing device fingerprint (truncated), account count, total reveals, last seen. Highlighted in amber/red based on severity (2 accounts = amber, 3+ = red).
    - **Period selector:** Dropdown for 1d / 7d / 30d affecting all tables.
  - [ ] 8.2 **Layout:** Follow the existing dashboard page pattern (`RespondentDetailPage.tsx` layout with Cards). Use the same stat card component pattern as the policy dashboard (`5-1-high-level-policy-dashboard`).
  - [ ] 8.3 **Loading states:** Use content-shaped skeletons per the project convention (not spinners).
  - [ ] 8.4 **Empty states:** If no reveals in period, show "No contact reveals recorded in this period" with an info icon.

- [ ] Task 9: Create frontend API client and hooks (AC: #5)
  - [ ] 9.1 Create `apps/web/src/features/marketplace/api/reveal-analytics.api.ts`:
    ```typescript
    import { apiClient } from '@/lib/api-client';
    import type { RevealStats, TopViewer, TopProfile, SuspiciousDevice } from '@oslsr/types';

    export async function getRevealStats(): Promise<RevealStats> {
      const response = await apiClient('/marketplace/analytics/reveals');
      return response.data;
    }

    export async function getTopViewers(days: number = 7, limit: number = 10): Promise<TopViewer[]> {
      const response = await apiClient(`/marketplace/analytics/reveals/top-viewers?days=${days}&limit=${limit}`);
      return response.data;
    }

    export async function getTopProfiles(days: number = 7, limit: number = 10): Promise<TopProfile[]> {
      const response = await apiClient(`/marketplace/analytics/reveals/top-profiles?days=${days}&limit=${limit}`);
      return response.data;
    }

    export async function getSuspiciousDevices(days: number = 7, limit: number = 10): Promise<SuspiciousDevice[]> {
      const response = await apiClient(`/marketplace/analytics/reveals/suspicious-devices?days=${days}&limit=${limit}`);
      return response.data;
    }
    ```
  - [ ] 9.2 Create `apps/web/src/features/marketplace/hooks/useRevealAnalytics.ts`:
    ```typescript
    import { useQuery } from '@tanstack/react-query';

    const analyticsKeys = {
      all: ['reveal-analytics'] as const,
      stats: () => [...analyticsKeys.all, 'stats'] as const,
      topViewers: (days: number) => [...analyticsKeys.all, 'top-viewers', days] as const,
      topProfiles: (days: number) => [...analyticsKeys.all, 'top-profiles', days] as const,
      suspiciousDevices: (days: number) => [...analyticsKeys.all, 'suspicious-devices', days] as const,
    };

    export function useRevealStats() {
      return useQuery({
        queryKey: analyticsKeys.stats(),
        queryFn: getRevealStats,
        refetchInterval: 60_000, // Refresh every minute
      });
    }

    export function useTopViewers(days: number = 7) {
      return useQuery({
        queryKey: analyticsKeys.topViewers(days),
        queryFn: () => getTopViewers(days),
      });
    }

    export function useTopProfiles(days: number = 7) {
      return useQuery({
        queryKey: analyticsKeys.topProfiles(days),
        queryFn: () => getTopProfiles(days),
      });
    }

    export function useSuspiciousDevices(days: number = 7) {
      return useQuery({
        queryKey: analyticsKeys.suspiciousDevices(days),
        queryFn: () => getSuspiciousDevices(days),
      });
    }
    ```
  - [ ] 9.3 `refetchInterval: 60_000` on stats keeps the dashboard fresh without overwhelming the API. Tables use default staleTime.

- [ ] Task 10: Wire admin route (AC: #5)
  - [ ] 10.1 In `apps/web/src/App.tsx`, add the analytics page under the Super Admin dashboard routes:
    ```typescript
    const RevealAnalyticsPage = lazy(() => import('./features/marketplace/pages/RevealAnalyticsPage'));

    // Inside super-admin routes (around line 1160+):
    <Route path="reveal-analytics" element={
      <Suspense fallback={<div />}>
        <RevealAnalyticsPage />
      </Suspense>
    } />
    ```
  - [ ] 10.2 The route is `/dashboard/super-admin/reveal-analytics` — nested under the authenticated Super Admin layout (ProtectedRoute + DashboardLayout).
  - [ ] 10.3 Add navigation link in the Super Admin sidebar/menu if marketplace section exists. If no marketplace menu section yet, add a "Marketplace" section with "Reveal Analytics" as the first item.

- [ ] Task 11: Write backend tests (AC: #7)
  - [ ] 11.1 Create `apps/api/src/middleware/__tests__/reveal-rate-limit.test.ts`:
    - `checkRevealRateLimit` returns allowed=true in test mode
    - `checkRevealRateLimit` returns allowed=true when Redis unavailable
    - (Redis integration tests would need a real Redis instance — covered in E2E if needed)
  - [ ] 11.2 Create `apps/api/src/services/__tests__/reveal-analytics.service.test.ts`:
    - `getRevealStats` returns correct counts for 24h/7d/30d windows
    - `getTopViewers` returns viewers ordered by reveal count DESC
    - `getTopViewers` respects days and limit parameters
    - `getTopProfiles` returns profiles ordered by reveal count DESC
    - `getSuspiciousDevices` returns devices used by 2+ accounts
    - `getSuspiciousDevices` excludes null fingerprints
    - `getSuspiciousDevices` returns empty array when no suspicious patterns
  - [ ] 11.3 Add to `apps/api/src/controllers/__tests__/marketplace.controller.test.ts` (extending Story 7-4 tests):
    - Reveal stores device fingerprint when `x-device-fingerprint` header present
    - Reveal works without `x-device-fingerprint` header (null stored)
    - Analytics endpoints return 403 for non-Super-Admin roles
    - Analytics endpoints return 200 with data for Super Admin
    - Analytics stats endpoint returns correct structure
  - [ ] 11.4 **Test pattern:** Use `vi.hoisted()` + `vi.mock()` for Redis mocking. Mock `ioredis` before importing the rate limit module. Follow the established `export-rate-limit.test.ts` pattern.
  - [ ] 11.5 `pnpm test` — all tests pass, zero regressions

- [ ] Task 12: Write frontend tests (AC: #7)
  - [ ] 12.1 Create `apps/web/src/features/marketplace/__tests__/RevealAnalyticsPage.test.tsx`:
    - Renders stat cards with correct values
    - Renders top viewers table
    - Renders top profiles table
    - Renders suspicious devices section
    - Period selector changes data displayed
    - Empty state renders correctly
    - Loading skeleton renders during fetch
  - [ ] 12.2 Create `apps/web/src/hooks/__tests__/useDeviceFingerprint.test.ts`:
    - Returns null initially
    - Returns visitor ID after FingerprintJS loads
    - Caches result across hook instances
    - Returns null gracefully when FingerprintJS fails
  - [ ] 12.3 Update `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx` (extending Story 7-4 tests):
    - Reveal request includes `x-device-fingerprint` header when available
    - Reveal request works without fingerprint (header omitted)
  - [ ] 12.4 `cd apps/web && pnpm vitest run` — all web tests pass

## Dev Notes

### Redis Rate Limit Architecture

```
Reveal Request Flow (with Redis acceleration):

POST /api/v1/marketplace/profiles/:id/reveal
  ├── authenticate          (401 if no token)
  ├── verifyCaptcha         (400 if no/invalid CAPTCHA)
  └── MarketplaceController.revealContact
        ├── Extract deviceFingerprint from x-device-fingerprint header
        ├── checkRevealRateLimit(userId, deviceFingerprint)  ← NEW (Redis fast-path)
        │     ├── Redis INCR rl:reveal:user:${userId}
        │     ├── If > 50 → DECR + return rate_limited (no DB hit)
        │     ├── Redis INCR rl:reveal:device:${fingerprint} (tracking only)
        │     └── If Redis unavailable → return allowed (fall through)
        ├── SQL COUNT contact_reveals in 24h (source of truth)  ← EXISTING (7-4)
        ├── Fetch marketplace profile + respondent
        ├── Check consent_enriched
        ├── INSERT contact_reveals (now with deviceFingerprint)
        ├── AuditService.logPiiAccess (with deviceFingerprint in details)
        └── Return { firstName, lastName, phoneNumber }
```

### Redis Key Design

| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `rl:reveal:user:${userId}` | Per-user 50/24h rate limit | 86400s (24h) |
| `rl:reveal:device:${fingerprint}` | Per-device tracking (analytics, not enforcement) | 86400s (24h) |

**Why not enforce per-device?** Device fingerprints are spoofable — a determined attacker can randomize canvas/WebGL attributes. Using them for enforcement creates false positives (legitimate users sharing a device) and false negatives (spoofed fingerprints). Instead, we use device data for pattern detection and human review.

### FingerprintJS Integration

The open-source `@fingerprintjs/fingerprintjs` (v4) generates a `visitorId` from:
- Canvas fingerprint
- WebGL renderer
- Audio context
- Screen resolution
- Timezone, language, plugins
- Other browser attributes

**Accuracy:** ~60-70% for the open-source version (Pro claims 99.5%). Sufficient for pattern detection.

**Bundle size:** ~45KB gzipped. Loaded lazily via dynamic import to avoid impacting initial page load.

**Privacy:** No data leaves the browser — the fingerprint is computed client-side and sent as a header. We do NOT use FingerprintJS server-side API. The fingerprint is stored alongside the reveal audit record only.

### Device-Based Suspicious Pattern Detection

The `getSuspiciousDevices()` query finds fingerprints used by 2+ distinct accounts:

```sql
SELECT device_fingerprint, COUNT(DISTINCT viewer_id) AS account_count,
       COUNT(*) AS total_reveals, MAX(created_at) AS last_seen_at
FROM contact_reveals
WHERE created_at > NOW() - INTERVAL '7 days'
  AND device_fingerprint IS NOT NULL
GROUP BY device_fingerprint
HAVING COUNT(DISTINCT viewer_id) >= 2
ORDER BY COUNT(DISTINCT viewer_id) DESC
LIMIT 10;
```

**Admin action (manual):** When a suspicious device pattern is detected, the Super Admin can:
1. View the accounts associated with the device
2. Deactivate accounts if confirmed as abuse
3. Note: Automatic blocking is NOT implemented — false positives from shared devices (cybercafes, family computers) make auto-blocking risky.

### Analytics Route Placement

Analytics routes MUST be defined BEFORE wildcard routes in `marketplace.routes.ts`:

```typescript
// CORRECT ORDER — analytics routes first:
router.get('/analytics/reveals', ...);
router.get('/analytics/reveals/top-viewers', ...);
router.get('/analytics/reveals/top-profiles', ...);
router.get('/analytics/reveals/suspicious-devices', ...);

// Then wildcard routes:
router.get('/search', ...);         // Story 7-2
router.get('/profiles/:id', ...);   // Story 7-3
router.post('/profiles/:id/reveal', ...);  // Story 7-4
```

If analytics routes come AFTER `/profiles/:id`, Express will match "analytics" as an `:id` parameter.

### Lazy Redis Init Pattern (Follow Existing Codebase)

All rate limit middleware in the codebase use the same lazy Redis initialization pattern:

```typescript
const isTestMode = () =>
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';

let redisClient: Redis | null = null;

const getRedisClient = () => {
  if (!redisClient && !isTestMode()) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};
```

This avoids creating Redis connections during test imports. See `login-rate-limit.ts`, `registration-rate-limit.ts`, `message-rate-limit.ts` for reference.

### Rate Limit Response Format (Existing Convention)

```json
{
  "status": "error",
  "code": "REVEAL_LIMIT_EXCEEDED",
  "message": "Daily contact reveal limit reached (50 per 24 hours)",
  "retryAfter": 3600
}
```

Standard headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (set by express-rate-limit when `standardHeaders: true`).

### SQL FILTER Syntax (PostgreSQL-Specific)

The analytics service uses `FILTER (WHERE ...)` for multi-period aggregation in a single query:

```sql
SELECT
  count(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS total_24h,
  count(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS total_7d,
  count(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS total_30d
FROM contact_reveals;
```

This is more efficient than 3 separate queries. It's PostgreSQL-specific (not in SQL standard) but OSLRS is locked to PostgreSQL 15.

### What This Story Does NOT Include

| Feature | Why Not Here |
|---------|-------------|
| Automatic account blocking | Too risky — shared devices cause false positives. Admin review only. |
| Progressive CAPTCHA escalation | hCaptcha difficulty is server-configured per site key, not per-request. Would need hCaptcha Enterprise. Deferred. |
| Honeypot fields | Low priority — auth requirement already blocks most bots. Could be a future prep task. |
| FingerprintJS Pro | Paid service, ~$200/mo. Open-source is sufficient for pattern detection. |
| Real-time alerts for reveal spikes | Would need AlertService integration with reveal thresholds. Could be a prep task if needed after launch. |
| Profile-level rate limiting | e.g., "max 100 reveals per profile per day" — not in the architecture spec. Could be added if specific profiles are targeted. |

### Project Structure Notes

**New files:**
- `apps/web/src/hooks/useDeviceFingerprint.ts` — FingerprintJS integration hook
- `apps/api/src/middleware/reveal-rate-limit.ts` — Redis-accelerated reveal rate limiter
- `apps/api/src/services/reveal-analytics.service.ts` — Analytics query methods
- `apps/api/src/controllers/reveal-analytics.controller.ts` — Analytics endpoints
- `apps/web/src/features/marketplace/pages/RevealAnalyticsPage.tsx` — Admin analytics page
- `apps/web/src/features/marketplace/api/reveal-analytics.api.ts` — Analytics API client
- `apps/web/src/features/marketplace/hooks/useRevealAnalytics.ts` — Analytics query hooks
- `apps/api/src/middleware/__tests__/reveal-rate-limit.test.ts`
- `apps/api/src/services/__tests__/reveal-analytics.service.test.ts`
- `apps/web/src/features/marketplace/__tests__/RevealAnalyticsPage.test.tsx`
- `apps/web/src/hooks/__tests__/useDeviceFingerprint.test.ts`

**Modified files:**
- `apps/api/src/db/schema/contact-reveals.ts` — Add `deviceFingerprint` column + index
- `apps/api/src/services/marketplace.service.ts` — Add Redis fast-path check, pass deviceFingerprint
- `apps/api/src/controllers/marketplace.controller.ts` — Extract `x-device-fingerprint` header
- `apps/api/src/routes/marketplace.routes.ts` — Add analytics routes (before wildcard routes)
- `packages/types/src/marketplace.ts` — Add analytics types
- `packages/types/src/index.ts` — Export analytics types
- `apps/web/src/features/marketplace/api/marketplace.api.ts` — Add deviceFingerprint parameter to revealMarketplaceContact
- `apps/web/src/features/marketplace/hooks/useMarketplace.ts` — Pass deviceFingerprint to mutation
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx` — Import useDeviceFingerprint, pass to reveal
- `apps/web/src/App.tsx` — Add /dashboard/super-admin/reveal-analytics route
- `apps/api/src/controllers/__tests__/marketplace.controller.test.ts` — Add fingerprint + analytics tests
- `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx` — Add fingerprint header tests

### Anti-Patterns to Avoid

- **Do NOT enforce rate limits solely based on device fingerprint** — fingerprints are spoofable and shared devices cause false positives. Use them for pattern detection, not enforcement.
- **Do NOT block users automatically based on suspicious device patterns** — only flag for admin review. Cybercafes, shared computers, and family devices legitimately share fingerprints across accounts.
- **Do NOT use FingerprintJS Pro's server-side API** — it sends browser data to a third party. Compute fingerprints client-side only and send as a header. Privacy-compliant with NDPA.
- **Do NOT skip the SQL count fallback** — Redis is a cache that can restart. The SQL count on `contact_reveals` is the source of truth for rate limiting. Redis provides the fast-path, not the only path.
- **Do NOT put analytics routes after `/profiles/:id`** — Express will match "analytics" as a profile ID parameter. Analytics routes must come first.
- **Do NOT make device fingerprinting a blocking requirement** — if FingerprintJS fails (ad blocker, privacy browser), the reveal flow must still work. Fingerprinting is additive defense.
- **Do NOT import from `@oslsr/types` in schema files** — drizzle-kit constraint (runs compiled JS, `@oslsr/types` has no `dist/`).
- **Do NOT log the full device fingerprint in error responses** — it's a tracking identifier. Only store it in the audit trail, not expose it to the client.

### References

- [Source: epics.md:2015-2027] — Story 7.6 acceptance criteria
- [Source: architecture.md:662-674] — 3-route security model, rate limiting table
- [Source: architecture.md:730-808] — Contact reveal flow, Redis rate limit key pattern
- [Source: architecture.md:811-841] — 6-layer bot protection (Layer 3: device fingerprinting)
- [Source: architecture.md:889-896] — contact_views table schema design
- [Source: spike-marketplace-data-model.md:494-549] — contact_reveals schema, rate-limiting strategy
- [Source: spike-public-route-security.md:52-70] — Threat model, rate limiting stack
- [Source: 7-4-authenticated-contact-reveal-captcha.md:429-451] — Scope split table (7-4 vs 7-6)
- [Source: 7-4-authenticated-contact-reveal-captcha.md:44-59] — contact_reveals schema (Story 7-4 creates)
- [Source: 7-4-authenticated-contact-reveal-captcha.md:306-334] — SQL count rate limit (Story 7-4 baseline)
- [Source: middleware/export-rate-limit.ts] — Role-tiered rate limiting pattern
- [Source: middleware/login-rate-limit.ts] — Lazy Redis init + isTestMode pattern
- [Source: services/audit.service.ts:135-174] — AuditService.logPiiAccess pattern
- [Source: services/monitoring.service.ts] — System health monitoring infrastructure
- [Source: middleware/metrics.ts] — prom-client Prometheus metrics pattern
- [Source: prd.md:FR19] — "System shall log every instance of contact detail viewing"
- [Source: prd.md:NFR4.4] — "50 contacts per authenticated user per 24 hours"

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
