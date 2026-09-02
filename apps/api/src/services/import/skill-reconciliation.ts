/**
 * Trade → `SKILL_TAXONOMY` reconciliation for imported rows (Story 13-2, AC3.4).
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * The importer had no path from a sheet's free-text trade to a canonical skill
 * slug, and the consequence was measured rather than guessed: against the real
 * farming file, **0 of 9,563 rows** resolved through `normaliseTrade`, and all 56
 * rows of the ASNAT tiler pilot came back `profession:[unmapped]`. Those rows
 * would import as people who are counted in the headline and the LGA map but
 * **invisible in the skills breakdown**, because every skills surface reads
 * `raw_data->>'skills_possessed'` through `registry_unified`.
 *
 * ⚠️ `normaliseTrade` IS NOT THIS, AND IS DELIBERATELY LEFT ALONE. Its
 * `TRADE_VOCABULARY` is a Story-11-2 artefact: 45 keys collapsing to **13 display
 * labels** ('Plumber', 'Tiler', …). It answers "what do we call this person" for
 * `marketplace_profiles.profession`. This module answers a different question —
 * "which canonical skill is this" — and it must resolve into the **192-slug
 * `SKILL_TAXONOMY`**. Re-pointing `normaliseTrade` would silently change what the
 * ITF-SUPA and public routes already publish; adding a second, narrower resolver
 * changes nothing that exists.
 *
 * ⚠️ THIS IS A RECONCILIATION, NOT A THIRD VOCABULARY. Story 13-2 warns "a dev
 * must NOT invent a third skills vocabulary", and the distinction matters: every
 * value below is an ALIAS whose target is a slug that already exists in
 * `SKILL_TAXONOMY`. Nothing here mints a canonical value. The compiler enforces
 * it — `Record<string, SkillSlug>` fails `tsc` if a target is not a real slug, so
 * a typo cannot reach production as a silently-unmatched cluster.
 *
 * The sheet spec assigns this job here in as many words: *"13-2 does the
 * free-text→controlled→slug reconciliation"*
 * (`docs/launch-campaign/association-condensed-sheet-spec.md`, Appendix B note).
 */

import { SKILL_SLUGS, SKILL_TAXONOMY, type SkillSlug } from '@oslsr/types';

/** Comparison key: case-, spacing- and punctuation-insensitive. */
function key(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Canonical slugs, by their own name. */
const BY_SLUG = new Set<string>(SKILL_SLUGS);

/** Canonical slugs, by their taxonomy LABEL ('Crop Farming' -> 'farming'). */
const BY_LABEL: ReadonlyMap<string, SkillSlug> = new Map(
  SKILL_TAXONOMY.map((s) => [key(s.label), s.name as SkillSlug]),
);

/**
 * Appendix B (the controlled list printed on the association sheet) → canonical slug.
 *
 * These eighteen are what a coordinator can physically tick, so they are the only
 * free-text values the paper route is *supposed* to produce. Appendix B labels are
 * deliberately broader than taxonomy labels (a guild name, not an ISCO line), which
 * is why an exact-label match cannot resolve them and this table has to exist.
 *
 * ⚠️ EVERY ENTRY IS SOURCED, NOT GUESSED. `Tiling / Terrazzo / Marble` → `tiling`
 * is the spec's own ruling (Awwal, 2026-07-20: *"Maps to the existing SKILL_TAXONOMY
 * slug `tiling` ("Tiling & Flooring", ISCO 7122) — no taxonomy change"*). The rest
 * were resolved against the taxonomy's real labels. A fuzzy/nearest-match pass was
 * run first and REJECTED as the mapping method — it proposed `fine_art` for
 * `Painting` (the real target is `painting`, "Painting & Decoration") and
 * `aggregate_processing` for `Agriculture / Agro-processing`. Nearest-neighbour
 * string distance is precisely how "three clusters of one" gets minted.
 */
const APPENDIX_B_TO_SLUG: Record<string, SkillSlug> = {
  'tailoring fashion': 'tailoring',
  'carpentry woodwork': 'carpentry',
  'welding fabrication': 'welding',
  'electrical electronics': 'electrical',
  plumbing: 'plumbing',
  'masonry bricklaying': 'masonry',
  'tiling terrazzo marble': 'tiling',
  'auto mechanic': 'auto_mechanic',
  'hairdressing barbing': 'hairdressing',
  'catering food': 'catering',
  'cosmetology make up': 'cosmetology',
  'photography videography': 'photography',
  painting: 'painting',
  vulcanizing: 'vulcanizing',
  'phone computer repair': 'computer_repair',
  'shoemaking leatherwork': 'shoe_making',
  'textile aso oke weaving': 'aso_oke_weaving',
  // ⚠️ LOSSY BY CONSTRUCTION, and logged as such. This one Appendix B box spans
  // two distinct canonical slugs — `farming` (Crop Farming) and `food_processing`
  // (Food Processing/Preservation) — so an agro-processor who ticks it is recorded
  // as a farmer. Mapped to `farming` because that is the dominant reading of
  // "Agriculture", not because the collision is resolved. The fix is a split box at
  // the next sheet re-print, not a cleverer rule here. Tracked as 13-2 R-A5.
  'agriculture agro processing': 'farming',
};

/** How a slug was arrived at — carried into `raw_data` so the basis stays auditable. */
export type SkillResolutionBasis = 'slug' | 'taxonomy_label' | 'appendix_b' | 'unmapped';

export interface SkillResolution {
  slug: SkillSlug | null;
  basis: SkillResolutionBasis;
}

/**
 * Resolve a sheet's trade value to a canonical `SKILL_TAXONOMY` slug.
 *
 * Ordered most-authoritative first, and it stops at the first hit:
 *   1. `slug`           — the value already IS a canonical slug (machine-prepared
 *                         files, e.g. a consolidated extract, carry these).
 *   2. `taxonomy_label` — exact match on a taxonomy label. This is what the real
 *                         farming file uses: all 14 of its distinct trades are
 *                         verbatim taxonomy labels ('Crop Farming', 'Fishery/
 *                         Aquaculture', …), so this branch alone covers 9,563 rows.
 *   3. `appendix_b`     — the printed controlled list, for the paper route.
 *   4. `unmapped`       — returns `null`. The caller MUST keep the raw value and
 *                         flag it. A row is never dropped for an unmapped trade:
 *                         losing the person to save the tidiness of a chart would
 *                         invert the point of the registry.
 */
export function resolveSkillSlug(raw: string | null | undefined): SkillResolution {
  const k = key(String(raw ?? ''));
  if (!k) return { slug: null, basis: 'unmapped' };

  const asSlug = k.replace(/ /g, '_');
  if (BY_SLUG.has(asSlug)) return { slug: asSlug as SkillSlug, basis: 'slug' };

  const byLabel = BY_LABEL.get(k);
  if (byLabel) return { slug: byLabel, basis: 'taxonomy_label' };

  const byAppendix = APPENDIX_B_TO_SLUG[k];
  if (byAppendix) return { slug: byAppendix, basis: 'appendix_b' };

  return { slug: null, basis: 'unmapped' };
}

/** The Appendix B keys, exposed so a test can assert the printed list stays covered. */
export const APPENDIX_B_KEYS = Object.keys(APPENDIX_B_TO_SLUG);
