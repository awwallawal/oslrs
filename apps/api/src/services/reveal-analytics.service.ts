import { db } from '../db/index.js';
import { sql, gt, and, isNotNull } from 'drizzle-orm';
import { contactReveals } from '../db/schema/contact-reveals.js';
import type { RevealStats, TopViewer, TopProfile, SuspiciousDevice } from '@oslsr/types';

export class RevealAnalyticsService {
  /**
   * Get reveal statistics for multi-period overview.
   * Uses PostgreSQL FILTER (WHERE ...) for single-query multi-period aggregation.
   */
  static async getRevealStats(): Promise<RevealStats> {
    const [stats] = await db.select({
      total24h: sql<number>`count(*) FILTER (WHERE ${contactReveals.createdAt} > NOW() - INTERVAL '24 hours')`,
      total7d: sql<number>`count(*) FILTER (WHERE ${contactReveals.createdAt} > NOW() - INTERVAL '7 days')`,
      total30d: sql<number>`count(*) FILTER (WHERE ${contactReveals.createdAt} > NOW() - INTERVAL '30 days')`,
      uniqueViewers24h: sql<number>`count(DISTINCT ${contactReveals.viewerId}) FILTER (WHERE ${contactReveals.createdAt} > NOW() - INTERVAL '24 hours')`,
      uniqueProfiles24h: sql<number>`count(DISTINCT ${contactReveals.profileId}) FILTER (WHERE ${contactReveals.createdAt} > NOW() - INTERVAL '24 hours')`,
    }).from(contactReveals);

    return {
      total24h: Number(stats.total24h) || 0,
      total7d: Number(stats.total7d) || 0,
      total30d: Number(stats.total30d) || 0,
      uniqueViewers24h: Number(stats.uniqueViewers24h) || 0,
      uniqueProfiles24h: Number(stats.uniqueProfiles24h) || 0,
    };
  }

  /**
   * Top N viewers by reveal count in the given period.
   */
  static async getTopViewers(days: number = 7, limit: number = 10): Promise<TopViewer[]> {
    const cutoff = sql`NOW() - (${days} * INTERVAL '1 day')`;
    const rows = await db.select({
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

    return rows.map((r) => ({
      viewerId: r.viewerId,
      revealCount: Number(r.revealCount),
      distinctProfiles: Number(r.distinctProfiles),
      lastRevealAt: String(r.lastRevealAt),
    }));
  }

  /**
   * Top N viewed profiles by reveal count in the given period.
   */
  static async getTopProfiles(days: number = 7, limit: number = 10): Promise<TopProfile[]> {
    const cutoff = sql`NOW() - (${days} * INTERVAL '1 day')`;
    const rows = await db.select({
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

    return rows.map((r) => ({
      profileId: r.profileId,
      revealCount: Number(r.revealCount),
      distinctViewers: Number(r.distinctViewers),
      lastRevealAt: String(r.lastRevealAt),
    }));
  }

  /**
   * Detect suspicious patterns: same device fingerprint used across multiple accounts.
   * Returns devices that have been used by 2+ distinct viewer accounts.
   */
  static async getSuspiciousDevices(days: number = 7, limit: number = 10): Promise<SuspiciousDevice[]> {
    const cutoff = sql`NOW() - (${days} * INTERVAL '1 day')`;
    const rows = await db.select({
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

    return rows.map((r) => ({
      deviceFingerprint: String(r.deviceFingerprint),
      accountCount: Number(r.accountCount),
      totalReveals: Number(r.totalReveals),
      lastSeenAt: String(r.lastSeenAt),
    }));
  }
}
