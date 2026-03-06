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
import pino from 'pino';

const logger = pino({ name: 'marketplace-service' });

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
   * Checks consent gate, rate limit (50/user/24h), inserts audit row.
   * Returns PII (firstName, lastName, phoneNumber) on success.
   */
  static async revealContact(
    profileId: string,
    viewerId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<
    | { status: 'success'; data: ContactRevealResponse }
    | { status: 'not_found' }
    | { status: 'rate_limited'; retryAfter: number }
  > {
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

    // 4 + 5: Rate limit check + audit insert in transaction (TOCTOU guard)
    return await db.transaction(async (tx) => {
      // Lock existing reveals for this viewer to serialize concurrent requests
      const countRows = await tx.execute(sql`
        SELECT count(*)::int as count
        FROM contact_reveals
        WHERE viewer_id = ${viewerId}
        AND created_at > NOW() - INTERVAL '24 hours'
        FOR UPDATE
      `);
      const count = (countRows.rows[0] as { count: number }).count;

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

      await tx.insert(contactReveals).values({
        viewerId,
        profileId,
        ipAddress,
        userAgent,
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
  }
}
