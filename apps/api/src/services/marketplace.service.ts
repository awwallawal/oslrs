import { db } from '../db/index.js';
import { sql, eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import type {
  ContactRevealResponse,
  CursorPaginatedResponse,
  MarketplaceProfileDetail,
  MarketplaceSearchParams,
  MarketplaceSearchResultItem,
} from '@oslsr/types';
import { contactReveals } from '../db/schema/contact-reveals.js';
import { marketplaceProfiles } from '../db/schema/marketplace.js';
import { respondents } from '../db/schema/respondents.js';
import { users } from '../db/schema/users.js';
import { checkRevealRateLimit, rollbackRevealCounters } from '../middleware/reveal-rate-limit.js';
import {
  getRevealGuardConfig,
  selectRequiredRung,
  reachableCeiling,
  rungSatisfied,
  type RevealVerificationLevel,
} from '../config/reveal-guard.config.js';
import { RevealAnomalyAlertService } from './reveal-anomaly-alert.service.js';
import pino from 'pino';

const logger = pino({ name: 'marketplace-service' });

/**
 * Split the stored comma-separated `skills` string into an array of skill slugs
 * (Story 13-28). The extraction worker stores `skillsList.join(', ')`, so we
 * split on commas, trim, drop empties, and de-duplicate (a repeated slug would
 * otherwise render a doubled chip + collide on React's `key`). Returns [] for
 * null/empty input.
 */
function splitSkills(raw: unknown): string[] {
  if (raw == null) return [];
  const slugs = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set(slugs)];
}

/** Options carrying the request-time accountability inputs (Story 9-41). */
export interface RevealContactOptions {
  /** AC#6 — stated purpose for a high-volume reveal (persisted on the row). */
  purpose?: string | null;
  /** AC#6 — whether the viewer accepted the acceptable-use terms. */
  tosAccepted?: boolean;
  /** AC#4/#5 — highest step-up rung the viewer currently holds (default captcha). */
  stepUpLevel?: RevealVerificationLevel;
}

export type RevealContactResult =
  | { status: 'success'; data: ContactRevealResponse }
  | { status: 'not_found' }
  | { status: 'rate_limited'; retryAfter: number }
  // AC#2 — this profile has been revealed by too many distinct viewers in-window.
  | { status: 'profile_cap_reached' }
  // AC#4/#5 — degrade to step-up rather than hard-block.
  | { status: 'step_up_required'; requiredLevel: RevealVerificationLevel }
  // AC#6 — purpose declaration required above the volume threshold.
  | { status: 'purpose_required' };

export class MarketplaceService {
  /**
   * Search marketplace profiles with full-text search, filters, and cursor-based pagination.
   * ONLY returns anonymous fields — no PII (no respondentId, name, phone, NIN).
   *
   * Sort: ts_rank DESC when query present, updated_at DESC when browsing.
   * Cursor format: "${sortValue}|${id}" (rank float or ISO date depending on mode).
   */
  static async searchProfiles(
    params: MarketplaceSearchParams,
  ): Promise<CursorPaginatedResponse<MarketplaceSearchResultItem>> {
    const pageSize = params.pageSize ?? 20;
    const query = params.q?.trim() || '';
    const hasQuery = query.length > 0;

    // Filter conditions (used in both data and count queries)
    const filterConditions: SQL[] = [];

    if (params.lgaId) {
      filterConditions.push(sql`mp.lga_id = ${params.lgaId}`);
    }

    if (params.experienceLevel) {
      filterConditions.push(sql`mp.experience_level = ${params.experienceLevel}`);
    }

    if (hasQuery) {
      filterConditions.push(
        sql`mp.search_vector @@ plainto_tsquery('english', ${query})`,
      );
    }

    if (params.profession) {
      filterConditions.push(
        sql`mp.profession ILIKE ${'%' + params.profession + '%'}`,
      );
    }

    // Cursor condition (data query only — excluded from count)
    let cursorCondition: SQL | null = null;
    if (params.cursor) {
      const pipeIndex = params.cursor.lastIndexOf('|');
      if (pipeIndex === -1) {
        throw new AppError('VALIDATION_ERROR', 'Invalid cursor format', 400);
      }
      const cursorValue = params.cursor.substring(0, pipeIndex);
      const cursorId = params.cursor.substring(pipeIndex + 1);

      if (hasQuery) {
        const cursorRank = parseFloat(cursorValue);
        if (isNaN(cursorRank)) {
          throw new AppError('VALIDATION_ERROR', 'Invalid cursor value', 400);
        }
        cursorCondition = sql`(
          ts_rank(mp.search_vector, plainto_tsquery('english', ${query})) < ${cursorRank}
          OR (
            ts_rank(mp.search_vector, plainto_tsquery('english', ${query})) = ${cursorRank}
            AND mp.id < ${cursorId}::uuid
          )
        )`;
      } else {
        const cursorDate = new Date(cursorValue);
        if (isNaN(cursorDate.getTime())) {
          throw new AppError('VALIDATION_ERROR', 'Invalid cursor date', 400);
        }
        cursorCondition = sql`(
          mp.updated_at < ${cursorDate}
          OR (mp.updated_at = ${cursorDate} AND mp.id < ${cursorId}::uuid)
        )`;
      }
    }

    // WHERE for data query (filters + cursor)
    const dataConditions = cursorCondition
      ? [...filterConditions, cursorCondition]
      : [...filterConditions];
    const dataWhereClause = dataConditions.length > 0
      ? sql`WHERE ${sql.join(dataConditions, sql` AND `)}`
      : sql``;

    // WHERE for count query (filters only)
    const countWhereClause = filterConditions.length > 0
      ? sql`WHERE ${sql.join(filterConditions, sql` AND `)}`
      : sql``;

    // Rank select + ORDER BY
    const rankSelect = hasQuery
      ? sql`ts_rank(mp.search_vector, plainto_tsquery('english', ${query}))`
      : sql`NULL::float`;

    const orderBy = hasQuery
      ? sql`ORDER BY ts_rank(mp.search_vector, plainto_tsquery('english', ${query})) DESC, mp.id DESC`
      : sql`ORDER BY mp.updated_at DESC, mp.id DESC`;

    // Main data query — ONLY anonymous fields, JOIN lgas for lgaName
    const dataQuery = sql`
      SELECT
        mp.id,
        mp.profession,
        mp.skills,
        COALESCE(l.name, mp.lga_name) as lga_name,
        mp.experience_level,
        mp.verified_badge,
        mp.bio,
        ${rankSelect} as relevance_score,
        mp.updated_at
      FROM marketplace_profiles mp
      LEFT JOIN lgas l ON mp.lga_id = l.code
      ${dataWhereClause}
      ${orderBy}
      LIMIT ${pageSize + 1}
    `;

    const result = await db.execute(dataQuery);
    const allRows = result.rows as Record<string, unknown>[];

    const hasNextPage = allRows.length > pageSize;
    const dataRows = hasNextPage ? allRows.slice(0, pageSize) : allRows;

    // Map to response items (anonymous fields ONLY — no PII)
    const items: MarketplaceSearchResultItem[] = dataRows.map((row) => ({
      id: String(row.id),
      profession: row.profession ? String(row.profession) : null,
      skills: splitSkills(row.skills),
      lgaName: row.lga_name ? String(row.lga_name) : null,
      experienceLevel: row.experience_level ? String(row.experience_level) : null,
      verifiedBadge: Boolean(row.verified_badge),
      bio: row.bio ? String(row.bio) : null,
      relevanceScore: row.relevance_score != null ? parseFloat(String(row.relevance_score)) : null,
    }));

    // Build next cursor
    let nextCursor: string | null = null;
    if (hasNextPage && dataRows.length > 0) {
      const lastRow = dataRows[dataRows.length - 1];
      if (hasQuery) {
        nextCursor = `${lastRow.relevance_score}|${lastRow.id}`;
      } else {
        nextCursor = `${new Date(lastRow.updated_at as string).toISOString()}|${lastRow.id}`;
      }
    }

    // Total count (separate lightweight query)
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int as total
      FROM marketplace_profiles mp
      ${countWhereClause}
    `);
    const totalItems = (countResult.rows[0] as { total: number }).total;

    return {
      data: items,
      meta: {
        pagination: {
          pageSize,
          hasNextPage,
          hasPreviousPage: !!params.cursor,
          nextCursor,
          previousCursor: null, // Forward-only cursor
          totalItems,
        },
      },
    };
  }

  /**
   * Get a single marketplace profile by its public ID.
   * Returns ONLY anonymous fields — no PII (no respondentId, editToken, consentEnriched).
   * Returns null if not found (controller handles 404).
   */
  static async getProfileById(id: string): Promise<MarketplaceProfileDetail | null> {
    const result = await db.execute(sql`
      SELECT
        mp.id,
        mp.profession,
        mp.skills,
        COALESCE(l.name, mp.lga_name) as lga_name,
        mp.experience_level,
        mp.verified_badge,
        mp.bio,
        mp.portfolio_url,
        mp.created_at
      FROM marketplace_profiles mp
      LEFT JOIN lgas l ON mp.lga_id = l.code
      WHERE mp.id = ${id}::uuid
    `);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      profession: row.profession ? String(row.profession) : null,
      skills: splitSkills(row.skills),
      lgaName: row.lga_name ? String(row.lga_name) : null,
      experienceLevel: row.experience_level ? String(row.experience_level) : null,
      verifiedBadge: Boolean(row.verified_badge),
      bio: row.bio ? String(row.bio) : null,
      portfolioUrl: row.portfolio_url ? String(row.portfolio_url) : null,
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  }

  /**
   * Reveal contact details for a marketplace profile.
   * Requires authenticated user + CAPTCHA (enforced at route level).
   *
   * Story 9-41 (F-007) layers accountability controls on top of the original
   * consent gate + per-user 50/24h limit, in this request-flow order (all
   * blocks; the order only decides which signal the client sees first):
   *   1. per-user 50/24h limit (unchanged)              → rate_limited
   *   2. per-profile distinct-viewer cap (AC#2)         → profile_cap_reached (+alert)
   *   3. progressive friction / breaker step-up (AC#5/#4) → step_up_required (+alert if breaker)
   *   4. purpose-binding above volume (AC#6)            → purpose_required
   *   5. insert audit row (now incl. purpose + ToS)     → success
   *
   * Existing controls are NOT weakened (AC#7): no role gate is added; consent
   * still fail-closes to not_found; the 50/24h limit is intact.
   */
  static async revealContact(
    profileId: string,
    viewerId: string,
    ipAddress: string,
    userAgent: string,
    deviceFingerprint?: string | null,
    opts: RevealContactOptions = {},
  ): Promise<RevealContactResult> {
    // 1. Fetch marketplace profile
    const [profile] = await db.select({
      respondentId: marketplaceProfiles.respondentId,
      consentEnriched: marketplaceProfiles.consentEnriched,
    }).from(marketplaceProfiles).where(eq(marketplaceProfiles.id, profileId)).limit(1);

    if (!profile) {
      return { status: 'not_found' };
    }

    // 2. Consent gate — return 'not_found' (not 'forbidden') to prevent consent enumeration
    if (!profile.consentEnriched) {
      return { status: 'not_found' };
    }

    // 3. Fetch respondent PII
    const [respondent] = await db.select({
      firstName: respondents.firstName,
      lastName: respondents.lastName,
      phoneNumber: respondents.phoneNumber,
    }).from(respondents).where(eq(respondents.id, profile.respondentId)).limit(1);

    if (!respondent) {
      logger.warn({ profileId, respondentId: profile.respondentId }, 'Marketplace profile references missing respondent');
      return { status: 'not_found' };
    }

    // F-007 review fix (H1): determine the strongest step-up rung THIS viewer can
    // actually satisfy. MFA is enrolment-gated (super_admin only, Story 9-13), so
    // a public viewer can never clear an 'mfa' demand — forcing it would turn the
    // AC#4 breaker into an unrecoverable hard block. The ceiling caps the demand.
    const [viewer] = await db.select({
      phone: users.phone,
      mfaEnabled: users.mfaEnabled,
    }).from(users).where(eq(users.id, viewerId)).limit(1);
    const ceiling = reachableCeiling({
      mfaEnrolled: viewer?.mfaEnabled === true,
      hasPhone: !!viewer?.phone,
    });

    // Redis fast-path rate limit check (Story 7-6) — avoids DB query if already
    // blocked; also enforces the per-device budget (AC#3) and surfaces the
    // global breaker state (AC#4).
    const redisCheck = await checkRevealRateLimit(viewerId, deviceFingerprint);
    if (!redisCheck.allowed) {
      return { status: 'rate_limited' as const, retryAfter: redisCheck.retryAfter! };
    }
    const breakerTripped = redisCheck.breakerTripped === true;

    const cfg = getRevealGuardConfig();
    const providedLevel: RevealVerificationLevel = opts.stepUpLevel ?? 'captcha';

    // Rate limit check + guard gates + audit insert in one transaction (TOCTOU guard).
    // The tx returns an internal result with an optional `alert` directive; the
    // alert is dispatched AFTER the tx so Telegram I/O never holds the row locks.
    const txResult = await db.transaction(async (tx): Promise<RevealContactResult & { alert?: string }> => {
      // Lock existing reveals for this viewer to serialize concurrent requests
      const countRows = await tx.execute(sql`
        SELECT count(*)::int as count
        FROM contact_reveals
        WHERE viewer_id = ${viewerId}
        AND created_at > NOW() - INTERVAL '24 hours'
        FOR UPDATE
      `);
      const count = (countRows.rows[0] as { count: number }).count;

      // (1) Per-user 50/24h limit (unchanged)
      if (count >= 50) {
        const oldestRows = await tx.execute(sql`
          SELECT created_at
          FROM contact_reveals
          WHERE viewer_id = ${viewerId}
          AND created_at > NOW() - INTERVAL '24 hours'
          ORDER BY created_at ASC
          LIMIT 1
        `);
        const oldestCreatedAt = new Date((oldestRows.rows[0] as { created_at: string }).created_at);
        const retryAfter = Math.ceil((oldestCreatedAt.getTime() + 86_400_000 - Date.now()) / 1000);
        return { status: 'rate_limited' as const, retryAfter: Math.max(retryAfter, 1) };
      }

      // (2) Per-profile distinct-viewer cap (AC#2). Blocks only NEW viewers —
      // a viewer who already revealed this profile in-window may re-reveal.
      const profileCapRows = await tx.execute(sql`
        SELECT
          count(DISTINCT viewer_id)::int AS distinct_viewers,
          count(*) FILTER (WHERE viewer_id = ${viewerId})::int AS own_reveals
        FROM contact_reveals
        WHERE profile_id = ${profileId}
        AND created_at > NOW() - (${cfg.windowSeconds} * INTERVAL '1 second')
      `);
      const { distinct_viewers: distinctViewers, own_reveals: ownReveals } =
        profileCapRows.rows[0] as { distinct_viewers: number; own_reveals: number };

      if (ownReveals === 0 && distinctViewers >= cfg.perProfileMaxViewers) {
        return {
          status: 'profile_cap_reached' as const,
          alert: `🚨 REVEAL ANOMALY — per-profile cap\n\nProfile ${profileId} hit ${distinctViewers} distinct viewers in-window (cap ${cfg.perProfileMaxViewers}); a NEW viewer was blocked.`,
        };
      }

      // (3) Progressive friction (AC#5) + global breaker (AC#4). The breaker
      // forces the highest rung regardless of this viewer's own volume, CAPPED at
      // the strongest rung the viewer can actually satisfy (H1 fix) so the breaker
      // degrades rather than hard-blocks. The human-review alert for a breaker
      // breach is dispatched AFTER the tx (so it fires even when the cap lets the
      // reveal proceed) — see the breakerTripped block below.
      const requiredLevel = selectRequiredRung(count, breakerTripped, cfg, ceiling);
      if (!rungSatisfied(requiredLevel, providedLevel)) {
        return { status: 'step_up_required' as const, requiredLevel };
      }

      // (4) Purpose-binding above the volume threshold (AC#6).
      const purposeRequired = count >= cfg.purposeThreshold;
      const purpose = opts.purpose?.trim() || null;
      const tosAccepted = opts.tosAccepted === true;
      if (purposeRequired && (!purpose || !tosAccepted)) {
        return { status: 'purpose_required' as const };
      }

      // (5) Insert audit row — identity + device + (above threshold) purpose + ToS.
      await tx.insert(contactReveals).values({
        viewerId,
        profileId,
        ipAddress,
        userAgent,
        deviceFingerprint: deviceFingerprint ?? null,
        purpose: purposeRequired ? purpose : null,
        tosAcceptedAt: purposeRequired && tosAccepted ? new Date() : null,
      });

      return {
        status: 'success' as const,
        data: {
          firstName: respondent.firstName,
          lastName: respondent.lastName,
          phoneNumber: respondent.phoneNumber,
        },
      };
    });

    // Dispatch any anomaly alert outside the transaction (Telegram I/O, gated +
    // cooldown'd + never throws). Strip the internal `alert` field before return.
    const { alert, ...result } = txResult;

    // M1 fix: a reveal that was blocked by a downstream guard (cap / step-up /
    // purpose / SQL recount) did NOT insert a row, so roll back the Redis
    // counters `checkRevealRateLimit` optimistically incremented. Otherwise
    // blocked retries silently burn the per-user budget and keep the global
    // breaker tripped forever within the window.
    if (result.status !== 'success') {
      await rollbackRevealCounters(viewerId, deviceFingerprint);
    }

    // AC#2 — per-profile cap breach page (carries the distinct-viewer detail).
    if (alert && result.status === 'profile_cap_reached') {
      await RevealAnomalyAlertService.alertRevealAnomaly(`reveal.profile_cap:${profileId}`, alert);
    }

    // AC#4 — a global-breaker breach ALWAYS escalates to a human, even when the
    // viewer's reachable-rung cap (H1) let the reveal proceed: degrade the user
    // experience, but never let the breaker fire silently. Cooldown'd per metric.
    if (breakerTripped) {
      await RevealAnomalyAlertService.alertRevealAnomaly(
        'reveal.global_breaker',
        `🚨 REVEAL ANOMALY — global breaker tripped\n\nAggregate reveal volume crossed the breaker threshold; reveals now require step-up (capped at each viewer's reachable rung) and need human review.`,
      );
    }

    return result;
  }
}
