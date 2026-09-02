/**
 * Build the `submissions.raw_data` payload for an imported row (Story 13-2, AC3.4).
 *
 * ── The contract this satisfies ──────────────────────────────────────────────
 * `docs/registry-unified-ingestion-contract.md` §Source #3: **every channel writes
 * a `respondents` row AND a `submissions` row with `raw_data`.** The importer wrote
 * only the respondent, so imported people were counted by `totalRegistered` and the
 * LGA density map — both respondent-anchored — while contributing NOTHING to
 * `genderSplit`, `gpi`, `allSkills` or `skillsByLga`, which all read `raw_data`
 * through `registry_unified`. The public consequence of importing ~8,000 rows that
 * way would have been a headline jumping 377 -> ~9,880 while `withAnswers` stayed
 * ~322, on the same page.
 *
 * ── Why the fields need TRANSLATING, not copying ─────────────────────────────
 * The parsed extras already survive on `respondents.metadata.import_extra`
 * (`profession`, `gender`, `town`, `age_years`, `experience_level`) — so the data
 * was never lost, only stored where no aggregate reads it. But copying it across
 * verbatim would produce a second silent loss, because the analytics predicates are
 * exact and the sheets do not speak their language:
 *
 *   - `gender`: every public query filters `raw_data->>'gender' = 'female'` / `'male'`.
 *     The real files carry **`M` and `F`** (farming: 6,797 M / 2,766 F; tilers: 66 M).
 *     Copied unchanged, all 9,563 would be counted as neither, and the gender split
 *     would silently ignore the entire import.
 *   - `skills_possessed`: `selectMultipleUnnest` treats a JSONB **array** as the
 *     canonical shape and only splits a *space-delimited* scalar as a legacy form.
 *     A trade written as a plain string like `"Crop Farming"` would unnest into the
 *     two junk tokens `Crop` and `Farming`, neither of which is a slug. So the value
 *     must be an ARRAY OF SLUGS, never the raw trade text.
 *
 * Both are the same failure the registry keeps paying for — a value that is present,
 * plausible, and read by nothing.
 */

import { resolveSkillSlug, type SkillResolutionBasis } from './skill-reconciliation.js';

/** The extras the ingest planner preserves on `metadata.import_extra`. */
export interface ImportExtra {
  full_name?: string;
  profession?: string;
  gender?: string;
  town?: string;
  age_years?: string;
  experience_level?: string;
  lga_raw?: string;
}

export interface ImportRawData {
  /** Canonical: an ARRAY of taxonomy slugs. Absent when the trade did not resolve. */
  skills_possessed?: string[];
  /** Exactly `male` / `female`, because that is what every public query matches. */
  gender?: string;
  town?: string;
  age_years?: number;
  experience_level?: string;
  /** Always the trade AS WRITTEN, so an unresolved value stays auditable. */
  trade_raw?: string;
  /** How `skills_possessed` was derived — 'unmapped' when it is absent. */
  skill_basis: SkillResolutionBasis;
  /** Marks this payload as import-derived, never field-collected. */
  ingest_channel: 'import';
}

/**
 * `M` / `F` / `Male` / `Female` / `man` / `woman` -> `male` / `female`.
 *
 * Anything else returns undefined rather than a guess: an unreadable gender must be
 * ABSENT from the denominator, not silently bucketed into one side of a published
 * parity index.
 */
export function normaliseGender(raw: string | undefined | null): string | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'm' || v === 'male' || v === 'man') return 'male';
  if (v === 'f' || v === 'female' || v === 'woman') return 'female';
  return undefined;
}

/** A bare year count; ignores junk so a bad cell cannot poison an average. */
function ageYears(raw: string | undefined): number | undefined {
  const n = Number(String(raw ?? '').trim());
  return Number.isFinite(n) && n > 0 && n < 120 ? Math.floor(n) : undefined;
}

/**
 * Shape one imported row's `raw_data`.
 *
 * Keys are omitted rather than set to null when unreadable: `raw_data->>'gender'
 * IS NOT NULL` is how the public denominators are counted, so writing an explicit
 * null and writing nothing are equivalent to the reader — but omitting keeps the
 * JSONB honest about what was actually captured.
 */
export function buildImportRawData(extra: ImportExtra): ImportRawData {
  const { slug, basis } = resolveSkillSlug(extra.profession);

  const out: ImportRawData = {
    skill_basis: basis,
    ingest_channel: 'import',
  };

  // The ARRAY shape is load-bearing — see the header note on selectMultipleUnnest.
  if (slug) out.skills_possessed = [slug];

  // Kept even when the slug resolved: it is the only record of what the person
  // actually wrote, and it is what a later reconciliation pass reads to widen
  // the alias table.
  if (extra.profession) out.trade_raw = extra.profession;

  const gender = normaliseGender(extra.gender);
  if (gender) out.gender = gender;

  if (extra.town) out.town = extra.town;

  const age = ageYears(extra.age_years);
  if (age !== undefined) out.age_years = age;

  if (extra.experience_level) out.experience_level = extra.experience_level;

  return out;
}
