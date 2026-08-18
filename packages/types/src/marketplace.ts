/**
 * Marketplace Types
 *
 * Type definitions for the public skills marketplace.
 * Created in Story 7.1, design source: prep-4 spike Section 5.
 */

// ============================================================================
// Marketplace Profile Types
// ============================================================================

/** Anonymous profile view — visible to all public visitors */
export interface MarketplaceProfileAnonymous {
  id: string;
  profession: string | null;
  skills: string | null;
  lgaName: string | null;
  experienceLevel: string | null;
  verifiedBadge: boolean;
  bio: string | null;
  portfolioUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Enriched profile view — visible after auth + CAPTCHA + consent check */
export interface MarketplaceProfileEnriched extends MarketplaceProfileAnonymous {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  consentEnriched: true;
}

/** Union type for profile responses */
export type MarketplaceProfileView = MarketplaceProfileAnonymous | MarketplaceProfileEnriched;

/** Profile detail view — full anonymous profile for /marketplace/profiles/:id (Story 7-3) */
export interface MarketplaceProfileDetail {
  id: string;
  profession: string | null;
  /**
   * Canonical skill slugs (Story 13-28) — split from the stored comma-separated
   * `skills` string. Non-sensitive occupational data, consistent with the
   * marketplace's public opt-in. Display via `skillLabelForSlug` (never raw slugs).
   */
  skills: string[];
  lgaName: string | null;
  experienceLevel: string | null;
  verifiedBadge: boolean;
  bio: string | null;
  portfolioUrl: string | null;
  /**
   * Story 13-38 AC8 — the volunteered trading name, same field and same rules as
   * `MarketplaceSearchResultItem.businessName`. Present here so the profile page a
   * card links to does not drop the identity line the card led with.
   */
  businessName: string | null;
  createdAt: string;
}

// ============================================================================
// Search Types (cursor-based pagination — Story 7-2)
// ============================================================================

/** Search request parameters (cursor-based pagination) */
export interface MarketplaceSearchParams {
  q?: string;
  lgaId?: string;
  profession?: string;
  experienceLevel?: string;
  cursor?: string;
  pageSize?: number;
}

/** Individual search result item — anonymous fields with optional relevance score */
export interface MarketplaceSearchResultItem {
  id: string;
  profession: string | null;
  /** Canonical skill slugs (Story 13-28) — see MarketplaceProfileDetail.skills. */
  skills: string[];
  lgaName: string | null;
  experienceLevel: string | null;
  verifiedBadge: boolean;
  bio: string | null;
  relevanceScore: number | null;
  /**
   * Story 13-38 AC8 — the worker's own trading name, when they volunteered one
   * (`raw_data.business_name`). Commercial, already on their signboard, and given
   * for exactly this purpose. It is NOT a personal name and MUST NEVER be
   * reconstructed from firstname/surname — see MARKETPLACE_BUSINESS_NAME_MAX_LEN.
   */
  businessName: string | null;
}

// ============================================================================
// Experience Buckets (Story 13-38 AC7)
// ============================================================================

/**
 * Canonical marketplace experience buckets — the questionnaire's OWN
 * `experience_list` choice values, verbatim (`docs/questionnaire_schema.md:134-141`).
 *
 * ⚠️ THERE IS NO EXACT YEAR COUNT ANYWHERE. `years_experience` is a
 * `select_one experience_list` (`docs/questionnaire_schema.md:51`) whose ceiling is
 * "Over 10 years". Any UI that prints a precise number of years, or claims a
 * ">= 20 years" threshold, is inventing data. `seasoned` therefore means "in the
 * TOP bucket", which is all the questionnaire can honestly support.
 *
 * These five replaced a pre-13-38 set (`entry`/`1-3`/`4-7`/`8-15`/`15+`) that no
 * form ever emitted: `less_1` and `over_10` normalised to NULL, and `7_10`
 * silently collapsed into `4-7`. Legacy stored values still render (see
 * `experienceStatFor`) so cards stay honest before the backfill reaches them.
 */
export const MARKETPLACE_EXPERIENCE_LEVELS = ['less_1', '1_3', '4_6', '7_10', 'over_10'] as const;

export type MarketplaceExperienceLevel = (typeof MARKETPLACE_EXPERIENCE_LEVELS)[number];

/** The rendered hero stat for one experience bucket (Story 13-38 AC7). */
export interface ExperienceStat {
  /** The prominent figure — a range or bound, never a fabricated exact year. */
  value: string;
  /** Unit shown beside the figure. */
  unit: string;
  /** Trailing label ("at this trade") or the seasoned cue's word. */
  label: string;
  /** True only for the TOP bucket — the strongest claim the data supports. */
  seasoned: boolean;
}

const AT_TRADE = 'at this trade';

/**
 * Bucket -> hero stat. Includes the five canonical buckets AND the legacy
 * pre-13-38 stored values, so a card renders honestly whether or not the
 * backfill has reached that row yet.
 */
const EXPERIENCE_STAT_BY_LEVEL: Record<string, ExperienceStat> = {
  // Canonical (questionnaire `experience_list` values)
  less_1: { value: 'Under 1', unit: 'yr', label: AT_TRADE, seasoned: false },
  '1_3': { value: '1–3', unit: 'yrs', label: AT_TRADE, seasoned: false },
  '4_6': { value: '4–6', unit: 'yrs', label: AT_TRADE, seasoned: false },
  '7_10': { value: '7–10', unit: 'yrs', label: AT_TRADE, seasoned: false },
  over_10: { value: 'Over 10', unit: 'yrs', label: 'seasoned', seasoned: true },
  // Legacy stored values (pre-13-38 rows the backfill has not rewritten)
  entry: { value: 'Under 1', unit: 'yr', label: AT_TRADE, seasoned: false },
  '1-3': { value: '1–3', unit: 'yrs', label: AT_TRADE, seasoned: false },
  '4-7': { value: '4–7', unit: 'yrs', label: AT_TRADE, seasoned: false },
  '8-15': { value: '8–15', unit: 'yrs', label: AT_TRADE, seasoned: false },
  '15+': { value: 'Over 15', unit: 'yrs', label: 'seasoned', seasoned: true },
};

/**
 * Resolve a stored `experience_level` to its hero stat (Story 13-38 AC7).
 * Returns null for absent OR unrecognised values so the caller omits the stat
 * block entirely — AC7's "omitted cleanly when absent". Never guesses.
 */
export function experienceStatFor(level: string | null | undefined): ExperienceStat | null {
  if (!level) return null;
  return EXPERIENCE_STAT_BY_LEVEL[level] ?? null;
}

/**
 * One-line human label for a stored `experience_level` — "4–6 yrs", "Over 10 yrs"
 * (Story 13-38 AC7). For surfaces that show experience as a plain value rather
 * than the card's hero stat (the profile page's info row). Returns null when
 * absent/unrecognised so the caller can omit the row instead of printing a slug.
 *
 * Derived from the SAME table as the hero stat — never a second vocabulary.
 */
export function experienceLabelFor(level: string | null | undefined): string | null {
  const stat = experienceStatFor(level);
  return stat ? `${stat.value} ${stat.unit}` : null;
}

/**
 * Normalise a RAW `years_experience` answer to a canonical bucket
 * (Story 13-38 AC7). Returns null when the value cannot be placed WITHOUT
 * guessing — the caller logs it rather than fabricating a bucket.
 *
 * Accepts: the five canonical values; their questionnaire labels; unambiguous
 * "no experience yet" synonyms; and a bare number of years.
 *
 * Deliberately does NOT accept the old canon (`4-7`, `8-15`, `15+`, `senior`,
 * `expert`, …). Those are either already-normalised output (not raw form data)
 * or ambiguous against these bucket edges, and re-bucketing them would launder a
 * guess into a canonical claim.
 */
export function normaliseMarketplaceExperienceLevel(
  raw: string | number | null | undefined,
): MarketplaceExperienceLevel | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).toLowerCase().trim();
  if (!value) return null;

  if ((MARKETPLACE_EXPERIENCE_LEVELS as readonly string[]).includes(value)) {
    return value as MarketplaceExperienceLevel;
  }

  const labelMap: Record<string, MarketplaceExperienceLevel> = {
    'less than 1 year': 'less_1',
    'less than a year': 'less_1',
    'under 1 year': 'less_1',
    none: 'less_1',
    'no experience': 'less_1',
    beginner: 'less_1',
    fresher: 'less_1',
    '1-3 years': '1_3',
    '1–3 years': '1_3',
    '4-6 years': '4_6',
    '4–6 years': '4_6',
    '7-10 years': '7_10',
    '7–10 years': '7_10',
    'over 10 years': 'over_10',
    'more than 10 years': 'over_10',
  };
  const mapped = labelMap[value];
  if (mapped) return mapped;

  // A bare year count — placed on the questionnaire's own bucket edges.
  //
  // ⚠️ [AI-Review][Low] 2026-08-18 (re-review) — the buckets are 1–3, 4–6, 7–10,
  // so a fractional answer can fall in a GAP (3 < y < 4, 6 < y < 7). Round DOWN
  // into the lower bucket, never up: `3.5` previously became `4_6` and rendered
  // "4–6 yrs" on a card for someone with three and a half years. Over-claiming a
  // worker's experience is the one direction this story's whole AC7 rationale
  // forbids — the stat may only say what the data supports.
  if (/^\d+(\.\d+)?$/.test(value)) {
    const years = Number(value);
    if (years < 1) return 'less_1';
    if (years < 4) return '1_3';
    if (years < 7) return '4_6';
    if (years <= 10) return '7_10';
    return 'over_10';
  }

  return null;
}

// ============================================================================
// Business Name (Story 13-38 AC8)
// ============================================================================

/**
 * Storage cap for `business_name` (Story 13-38 AC8.3). A signboard string can be
 * long; the card also truncates visually, but capping at write time keeps the
 * column and the grid bounded.
 */
export const MARKETPLACE_BUSINESS_NAME_MAX_LEN = 80;

/**
 * Trim + cap a raw `business_name` answer (Story 13-38 AC8.3). Returns null for
 * absent/blank input.
 *
 * ⚠️ There is deliberately NO fallback here. AC8.2: a blank business name must
 * never be reconstructed from `firstname`/`surname` — that would print a person's
 * name on a card the consent copy promises is anonymous.
 */
export function normaliseBusinessName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MARKETPLACE_BUSINESS_NAME_MAX_LEN);
}

// ============================================================================
// Contact Reveal Types
// ============================================================================

/** Contact reveal log entry (matches contact_reveals schema) */
export interface ContactRevealEntry {
  id: string;
  viewerId: string;
  profileId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Contact reveal response — PII returned on successful reveal */
export interface ContactRevealResponse {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
}

/** Contact reveal request body */
export interface ContactRevealRequest {
  captchaToken: string;
}

// ============================================================================
// Reveal Analytics Types (Story 7-6)
// ============================================================================

/** Reveal statistics for multi-period overview */
export interface RevealStats {
  total24h: number;
  total7d: number;
  total30d: number;
  uniqueViewers24h: number;
  uniqueProfiles24h: number;
}

/** Top viewer by reveal count */
export interface TopViewer {
  viewerId: string;
  revealCount: number;
  distinctProfiles: number;
  lastRevealAt: string;
}

/** Top viewed profile by reveal count */
export interface TopProfile {
  profileId: string;
  revealCount: number;
  distinctViewers: number;
  lastRevealAt: string;
}

/** Suspicious device — same fingerprint across multiple accounts */
export interface SuspiciousDevice {
  deviceFingerprint: string;
  accountCount: number;
  totalReveals: number;
  lastSeenAt: string;
}

// ============================================================================
// Profile Enrichment Types (Edit Token — Story 7-5)
// ============================================================================

/** Request body for requesting an edit token via SMS */
export interface ProfileEditTokenRequest {
  phoneNumber: string;
  captchaToken: string;
}

/** Payload for applying a profile edit via edit token */
export interface ProfileEditPayload {
  editToken: string;
  bio?: string | null;
  portfolioUrl?: string | null;
}

/** Profile data returned when validating an edit token (for form pre-population) */
export interface MarketplaceProfileEditView {
  bio: string | null;
  portfolioUrl: string | null;
}
