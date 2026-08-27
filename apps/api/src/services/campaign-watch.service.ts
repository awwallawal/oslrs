/**
 * Campaign Watch — did the radio spend move the register, and how would we know?
 *
 * ⭐ WHY THIS EXISTS. Before the media engagement the register sat at **327 for five
 * consecutive days (2026-08-17 → 21)**. That flat stretch is an unusually clean control
 * and it only exists once — the whole point of this service is to hold onto it and keep
 * measuring against it instead of re-deriving "was it working?" from memory each week.
 *
 * ⚠️ THE HONEST SIGNAL IS SELF-REPORT, NOT TRAFFIC. Story 13-1 AC2 made
 * "How did you hear about us?" mandatory precisely because **no pixel can catch radio**.
 * Cloudflare request counts cannot separate a jingle from a port scan — measured
 * 2026-08-23, the top country on this site was the United States and the daily band was
 * already 1.4k–5.3k from bot noise ([[pattern-monitor-measuring-something-else]]).
 * So the number that means something is the one the registrant typed.
 *
 * ⛔ AND THE THING THAT WILL BITE: **attribution coverage is falling.** 7/7 and 4/4 on
 * the first two days, then 14/20 on the busiest day. An unattributed row is NOT a
 * non-radio row, so `radio` here is a FLOOR, never an estimate. This service therefore
 * publishes `unattributed` as its own first-class bucket and refuses to impute — a
 * shrinking denominator that silently flatters or deflates a channel is exactly the
 * defect class this project keeps catching.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { CampaignWatchSnapshot } from '@oslsr/types';
import { registryUnifiedSource } from './registry-unified.js';

/**
 * The control. Registrations created STRICTLY BEFORE this instant are the pre-campaign
 * register; everything at or after it is the campaign window.
 *
 * DERIVED, never hardcoded: the count is recomputed from `created_at` on every call, so
 * if a backfill or an import ever changes history the baseline moves WITH it and the
 * comparison stays honest. `BASELINE_AT_AUTHORING` below is the drift tell, not the
 * source — see the note there on why it is 328 and not the more memorable 327.
 */
export const CAMPAIGN_START = '2026-08-24T00:00:00+01:00';
/**
 * What CAMPAIGN_START's count evaluated to on prod when this was written — a DRIFT TELL,
 * never a source. If `baseline` stops equalling this, the register's history moved.
 *
 * ⚠️ 328, NOT 327 — and the difference is the whole reason to verify a constant against
 * the real database before shipping it. **327 is the FLAT-PERIOD count**: the register
 * sat there for five consecutive days, 2026-08-17 → 21, which is what makes it such a
 * clean control. But one person registered on **22 August, before any spot aired**, so
 * the count on the campaign's eve was 328. Seeding this with the memorable 327 would
 * have raised `baselineDrifted` on the very first run — a false alarm dressed as
 * evidence. Both numbers are true; only one answers "what was it when radio started?".
 */
export const BASELINE_AT_AUTHORING = 328;
/** The five-day flat stretch 2026-08-17 → 21. Context for the baseline, not the baseline. */
export const PRE_CAMPAIGN_FLAT_COUNT = 327;





const CHANNEL = sql`ru.raw_data->'campaign_source'->>'channel'`;

export const CampaignWatchService = {
  async getSnapshot(): Promise<CampaignWatchSnapshot> {
    const start = sql`${CAMPAIGN_START}::timestamptz`;

    const [totals, channels, days, lgas] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE ru.created_at <  ${start}) AS baseline,
          COUNT(*)                                          AS total_now,
          COUNT(*) FILTER (WHERE ru.created_at >= ${start}) AS since_start,
          COUNT(*) FILTER (WHERE ru.created_at >= ${start} AND ${CHANNEL} IS NOT NULL) AS attributed
        FROM ${registryUnifiedSource('ru')}
      `),
      db.execute(sql`
        SELECT ${CHANNEL} AS channel, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ru.created_at >= ${start}
        GROUP BY 1 ORDER BY count DESC NULLS LAST
      `),
      db.execute(sql`
        SELECT to_char(ru.created_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS day,
               COUNT(*) AS registrations,
               COUNT(*) FILTER (WHERE ${CHANNEL} IS NOT NULL) AS attributed,
               COUNT(*) FILTER (WHERE ${CHANNEL} = 'Radio')   AS radio
        FROM ${registryUnifiedSource('ru')}
        WHERE ru.created_at >= ${start} - interval '10 days'
        GROUP BY 1 ORDER BY 1
      `),
      db.execute(sql`
        SELECT ru.lga_id AS lga_id, COUNT(*) AS count
        FROM ${registryUnifiedSource('ru')}
        WHERE ru.created_at >= ${start} AND ${CHANNEL} = 'Radio'
        GROUP BY 1 ORDER BY count DESC NULLS LAST
      `),
    ]);

    const t = totals.rows[0] as unknown as {
      baseline: string; total_now: string; since_start: string; attributed: string;
    };
    const baseline = Number(t?.baseline ?? 0);
    const sinceCampaignStart = Number(t?.since_start ?? 0);
    const attributedCount = Number(t?.attributed ?? 0);

    return {
      baseline,
      baselineAtAuthoring: BASELINE_AT_AUTHORING,
      baselineDrifted: baseline !== BASELINE_AT_AUTHORING,
      campaignStart: CAMPAIGN_START,
      totalNow: Number(t?.total_now ?? 0),
      sinceCampaignStart,
      attributedCount,
      unattributedCount: sinceCampaignStart - attributedCount,
      // Number.isFinite guard, not `|| null`: a 0% coverage is REAL and must print as 0,
      // never as "unknown" ([[pattern-numeric-gate-fails-open-on-undefined]]).
      attributionCoveragePct: sinceCampaignStart > 0
        ? Math.round((attributedCount / sinceCampaignStart) * 1000) / 10
        : null,
      byChannel: (channels.rows as unknown as Array<{ channel: string | null; count: string }>)
        .map((r) => ({ channel: r.channel, count: Number(r.count) })),
      byDay: (days.rows as unknown as Array<{ day: string; registrations: string; attributed: string; radio: string }>)
        .map((r) => ({
          day: r.day,
          registrations: Number(r.registrations),
          attributed: Number(r.attributed),
          radio: Number(r.radio),
        })),
      radioByLga: (lgas.rows as unknown as Array<{ lga_id: string | null; count: string }>)
        .map((r) => ({ lgaId: r.lga_id, count: Number(r.count) })),
      generatedAt: new Date().toISOString(),
    };
  },
};
