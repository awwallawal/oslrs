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

// ---------------------------------------------------------------------------
// Free-text LGA label → canonical slug (Story 11-2 code-review L1).
//
// `canonicalizeLgaId` above assumes the input is ALREADY a slug/UUID/fossil —
// correct for the wizard + enumerator paths, which submit a slug from a
// dropdown. Secondary-data IMPORTS are the one channel carrying human-readable
// LGA *names* ("Ibadan North-East", "Ogbomoso North", "Shaki West") with
// arbitrary casing/punctuation/spelling. Rather than have the import service
// keep its own weak exact-match map (which dropped every variant to null), this
// is the ONE robust name→slug resolver — so imports resolve LGAs as reliably as
// every other channel, and only genuinely non-Oyo-LGA text falls through.
// ---------------------------------------------------------------------------

/** Collapse to a spaced match key: lowercase, non-alphanumerics → single space. */
export function lgaMatchKey(raw: string): string {
  return raw.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Collapse to a tight (space-less) key so "Ona Ara" ≡ "Onaara" ≡ "ona_ara". */
export function lgaTightKey(raw: string): string {
  return raw.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Spelling/abbreviation aliases keyed by an arbitrary label form → canonical
 * slug. Extends the retired-form fossils with the real-world register variants:
 * the `Ogbomosho`↔`Ogbomoso` (silent-h) split and `Saki`↔`Shaki`. Keys are
 * normalised at build time, so any casing/punctuation of these works.
 */
export const LGA_TEXT_ALIASES: Readonly<Record<string, string>> = {
  ...FOSSIL_LGA_ALIASES, // ibadan_ne→…north_east, ogbomoso_north→ogbomosho_north, etc.
  shaki_east: 'saki_east',
  shaki_west: 'saki_west',
};

/**
 * Build a pure resolver from the loaded `lgas` rows (code + name). Indexes both
 * the spaced and tight key of every name AND code, plus the alias table
 * (registered only when its canonical slug is a real row). Returns
 * `{ code }` on a hit, `{ code: null, warning: 'unresolved_lga' }` otherwise —
 * the caller preserves the raw value for review rather than guessing.
 */
export function buildLgaLabelResolver(
  rows: ReadonlyArray<{ code: string; name: string }>,
): (raw: string) => { code: string | null; warning?: string } {
  const byKey = new Map<string, string>();
  const add = (k: string, code: string) => {
    if (k && !byKey.has(k)) byKey.set(k, code);
  };
  for (const r of rows) {
    add(lgaMatchKey(r.name), r.code);
    add(lgaTightKey(r.name), r.code);
    add(lgaMatchKey(r.code), r.code);
    add(lgaTightKey(r.code), r.code);
  }
  const validCodes = new Set(rows.map((r) => r.code));
  for (const [aliasLabel, canonicalSlug] of Object.entries(LGA_TEXT_ALIASES)) {
    if (!validCodes.has(canonicalSlug)) continue; // never map to a non-existent LGA
    add(lgaMatchKey(aliasLabel), canonicalSlug);
    add(lgaTightKey(aliasLabel), canonicalSlug);
  }

  return (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return { code: null };
    const hit = byKey.get(lgaMatchKey(trimmed)) ?? byKey.get(lgaTightKey(trimmed));
    return hit ? { code: hit } : { code: null, warning: 'unresolved_lga' };
  };
}
