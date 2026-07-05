/**
 * Story 13-16 (AC1) — canonical LGA value = the slug (`lgas.code`).
 *
 * `respondents.lgaId` is plain text (no FK), and the public wizard historically
 * wrote the LGA row's UUID (`lgas.id`) while the enumerator path and every
 * analytics join (`l.code = r.lga_id`) speak the slug. The wizard client now
 * sends the slug, but stale in-flight drafts (and cached clients) can still
 * submit the UUID — this guard canonicalizes ANY UUID-shaped LGA value to its
 * slug at the server write-sites so the AC2 backfill invariant (zero
 * UUID-shaped `respondents.lga_id` rows) holds durably.
 */
import { eq } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../db/index.js';
import { lgas } from '../db/schema/index.js';

const logger = pino({ name: 'lga-canonical' });

/** Full UUID shape (any version) — matches the 13-16 backfill's selection rule. */
export const UUID_SHAPED_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retired form-vocabulary aliases → canonical `lgas.code`. The pre-13-16
 * master form's `lga_list` carried these 6 divergent values (see the story's
 * emergent finding); the XLSX sources are corrected, but the LIVE published
 * form keeps them until the 13-14 re-publish/re-pin — so an enumerator/clerk
 * submission can still deliver one. Mapped here (13-16 review M3) so no
 * write-site persists a non-joining value while that residual is open.
 */
export const FOSSIL_LGA_ALIASES: Readonly<Record<string, string>> = {
  ibadan_ne: 'ibadan_north_east',
  ibadan_nw: 'ibadan_north_west',
  ibadan_se: 'ibadan_south_east',
  ibadan_sw: 'ibadan_south_west',
  ogbomoso_north: 'ogbomosho_north',
  ogbomoso_south: 'ogbomosho_south',
};

/**
 * Resolve a UUID-shaped LGA value to its canonical slug (`lgas.code`), and a
 * retired form-vocabulary alias (FOSSIL_LGA_ALIASES) to its canonical slug.
 * Canonical-slug (or empty/undefined) values pass through untouched. A UUID
 * with no matching `lgas` row is logged and returned as-is — never nulled — so
 * bad input stays visible for manual review rather than silently destroying
 * data.
 */
export async function canonicalizeLgaId(lgaId: string): Promise<string>;
export async function canonicalizeLgaId(lgaId: string | undefined): Promise<string | undefined>;
export async function canonicalizeLgaId(
  lgaId: string | undefined,
): Promise<string | undefined> {
  if (!lgaId) return lgaId;
  const aliased = FOSSIL_LGA_ALIASES[lgaId];
  if (aliased) {
    logger.warn({ event: 'lga.canonicalize.fossil_alias', lgaId, canonical: aliased });
    return aliased;
  }
  if (!UUID_SHAPED_RE.test(lgaId)) return lgaId;
  const row = await db.query.lgas.findFirst({
    where: eq(lgas.id, lgaId),
    columns: { code: true },
  });
  if (!row) {
    logger.warn({ event: 'lga.canonicalize.unknown_uuid', lgaId });
    return lgaId;
  }
  return row.code;
}
