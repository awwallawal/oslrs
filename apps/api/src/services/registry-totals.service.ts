/**
 * Registry Totals — the canonical respondent-scoped count-core.
 *
 * Story 13-25 (launch slice of Epic 12 / 12-4). The public /insights page and
 * the internal dashboard both counted `COUNT(*) FROM submissions` (~79),
 * silently dropping the registered-but-answerless respondents (Cohort-A
 * `data_lost` salvage + `no_submission` + `pending_nin`). That understated the
 * public register by ~45% on the very page the launch blast drives traffic to.
 * This module counts registered PEOPLE, not submissions.
 *
 * ── Forward-compatibility (AC4) ─────────────────────────────────────────────
 * `getRegistryCountCore()` is the PRE-LAUNCH SEED of 12-4's forthcoming
 * `getRegistryTotals()`. Its `{ totalRespondents, withAnswers }` is exactly
 * 12-4's AC1/AC3 minimal slice — total registered people + the completed-survey
 * subset. When Epic 12 lands, 12-4 builds the full 3-axis decomposition
 * (`data_lost` / `no_submission` / `pending_nin` / `nin_unavailable` /
 * `imported`), the R2 identity-key `COUNT(DISTINCT person)`, and the
 * `/api/v1/analytics/registry-totals` endpoint ON this same function — so there
 * is ONE registry count, never a divergent second one. See
 * `registry-data-status.ts` (the 9-59 taxonomy atom) which this consumes.
 *
 * ── `withAnswers` semantics ─────────────────────────────────────────────────
 * `withAnswers` is the SQL embodiment of the 9-59 `hasNonEmptyRawData` atom —
 * i.e. the `deriveDataStatus(...) === 'completed'` bucket: a respondent whose
 * latest NON-EMPTY submission carries questionnaire answers. The emptiness test
 * (`raw_data IS NOT NULL AND raw_data <> '{}'`) and the latest-non-empty LATERAL
 * mirror `getUnifiedExportData` (export-query.service.ts) exactly, so the export
 * row-count, this count-core, and analytics all agree on what "completed" means.
 *
 * ── Canonical unified read (Story 13-33) ────────────────────────────────────
 * As of 13-33 this count is expressed OVER the ONE canonical respondent-anchored
 * read (`registryUnifiedSource`) rather than a hand-rolled LATERAL, so count-core
 * and every other consumer (public insights, density, 12-4) read the identical
 * shape — no second definition to drift from. `with_answers` = the count of
 * unified rows whose `raw_data` is non-null (the LATERAL already keeps only the
 * latest NON-EMPTY submission's answers).
 *
 * ── Grain ───────────────────────────────────────────────────────────────────
 * Row-id-distinct (one row per `respondents.id`) is the accepted slice grain;
 * the R2 identity-key refinement (`COUNT(DISTINCT person)`) rides with the full
 * 12-4 model post-launch. No respondent-row exclusion filter is applied — the
 * unfiltered respondent count IS the registry (mirrors `getUnifiedExportData`'s
 * unfiltered count).
 *
 * Raw `db.execute(sql...)` — guarded by a real-DB smoke test (12-4 drift
 * discipline) so a renamed column fails a test, not prod.
 */
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import pino from 'pino';
import { registryUnifiedSource } from './registry-unified.js';
import type { RegistryUnifiedRow } from './registry-unified.js';
import {
  REGISTRY_DATA_STATUSES,
  deriveDataStatus,
  hasNonEmptyRawData,
  type RegistryDataStatus,
} from './registry-data-status.js';
import { normaliseNigerianPhone, RESPONDENT_PHONE_E164 } from '../lib/normalise/phone.js';
import { respondentSourceTypes } from '../db/schema/respondents.js';
import type { AnalyticsScope } from '../middleware/analytics-scope.js';
import type {
  AnalyticsQueryParams,
  RegistryTotals,
  RegistryCompleteness as SharedRegistryCompleteness,
  RegistryDataStatus as SharedRegistryDataStatus,
  RegistryVerification as SharedRegistryVerification,
} from '@oslsr/types';

export type { RegistryTotals };

const logger = pino({ name: 'registry-totals' });

export interface RegistryCountCore {
  /** Distinct registered people (one row per `respondents.id`) — the honest headline count. */
  totalRespondents: number;
  /**
   * Subset whose latest non-empty submission carries survey answers
   * (`deriveDataStatus === 'completed'`) — the count of registered PEOPLE the
   * demographic / skills breakdowns describe. (The breakdown percentages are
   * computed over the answer-bearing SUBMISSIONS, submission-scoped, which
   * equals this people-count today but can diverge under multi-submission
   * respondents; they converge under full 12-4.)
   */
  withAnswers: number;
}

/**
 * Count registered people and the completed-survey subset in a single query.
 * @see RegistryCountCore
 */
export async function getRegistryCountCore(): Promise<RegistryCountCore> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_respondents,
      COUNT(ru.raw_data)::int AS with_answers
    FROM ${registryUnifiedSource('ru')}
  `);

  const row = result.rows[0] as
    | { total_respondents: number | string; with_answers: number | string }
    | undefined;

  return {
    totalRespondents: Number(row?.total_respondents ?? 0),
    withAnswers: Number(row?.with_answers ?? 0),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Story 12-4 — the FULL aggregate model (`getRegistryTotals`)
 *
 * `getRegistryCountCore` above answers "how many people, how many with
 * answers". This answers "and what state is each of them in", across the flat
 * data-status badge AND the three orthogonal taxonomy axes.
 *
 * It aggregates over the SAME canonical `registryUnifiedSource` (13-33) — one
 * row per respondent, latest NON-EMPTY submission. There is no second read.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Axis-2 marker sets — DERIVED FROM THE REAL INSTRUMENTS, not invented.
 *
 * Measured 2026-08-17 by diffing the two live XLSForms in `test-fixtures/`:
 * `oslsr_master_v3.xlsx` (52 questions, the enumerator/baseline instrument) vs
 * `oslsr-public-core-v1.xlsx` (30 questions, the pinned public self-serve form,
 * Story 13-14). DEEP = master-only fields; CORE = fields the Public Core also
 * carries. That is what makes AC7.2's "form-agnostic" promise real: a row is
 * classified by the fields it CONTAINS, so a Public-Core row and a full
 * enumerator row separate on depth without either form being named.
 *
 * ⚠️ Deliberately EXCLUDED from DEEP even though they are master-only:
 *   • `gps_location` — removed from the instrument by Story 13-34 pre-blast.
 *   • `bio_short` / `portfolio_url` — marketplace enrichment, not labour depth;
 *     a marketplace-enriched Public-Core row must not read as `full`.
 * Adding a question to the master WITHOUT adding it here leaves those rows
 * classified `core` — the safe direction (understates depth, never overstates).
 */
export const REGISTRY_DEEP_FIELD_MARKERS = [
  'marital_status', 'education_level', 'disability_status',
  'employment_status', 'temp_absent', 'looking_for_work', 'available_for_work',
  'hours_worked', 'monthly_income',
  'is_head', 'household_size', 'dependents_count', 'housing_status',
  'training_interest',
  'has_business', 'business_name', 'business_reg', 'business_address',
  'apprentice_count',
] as const;

/** Axis-2 CORE markers — substantive answers the Public Core (13-14) also collects. */
export const REGISTRY_CORE_FIELD_MARKERS = [
  'surname', 'firstname', 'gender', 'dob', 'age',
  'phone_number', 'email', 'nin', 'lga_id',
  'main_occupation', 'employment_type', 'years_experience',
  'skills_possessed', 'skills_other',
] as const;

export const REGISTRY_COMPLETENESS_LEVELS = ['full', 'core', 'partial'] as const;
export type RegistryCompleteness = typeof REGISTRY_COMPLETENESS_LEVELS[number];

/**
 * Axis-3 verification tiers. **There is no `verified`** — Story 12-4 AC9 / R1:
 * NIN is CAPTURED, never validated (no NIMC path exists, and NINs carry no check
 * digit — see `nin-validation-mod11-invalid`). `nin_on_file` is the top tier and
 * must never be rendered as "verified" until a real check exists.
 */
export const REGISTRY_VERIFICATION_TIERS = [
  'nin_on_file', 'self_declared', 'pending_nin', 'unverified_import',
] as const;
export type RegistryVerification = typeof REGISTRY_VERIFICATION_TIERS[number];

/* ── Shared-type drift guard (Story 12-5) ──────────────────────────────────
 *
 * `RegistryTotals` now lives in `@oslsr/types` so the web layer can read the
 * aggregate it was always meant to render. The three axis unions are declared
 * in BOTH places — here as `typeof CONST[number]` (the runtime arrays this
 * module actually tallies into) and there as hand-written unions (the web has
 * no access to these arrays). Two declarations of one taxonomy is exactly the
 * drift 13-33/13-37 exist to kill, so they are pinned to each other at COMPILE
 * TIME: adding a status/tier/level to a runtime array above without adding it
 * to `@oslsr/types` fails `tsc`, and vice versa.
 *
 * `Mutual<A, B>` resolves to `A` only when A and B are mutually assignable, so
 * a mismatch surfaces as a type error on the alias itself rather than silently
 * widening.
 */
/**
 * `true` only when A and B are MUTUALLY assignable. One-directional `extends`
 * is not enough: it would accept the shared union quietly gaining a member the
 * runtime array never produces, which is half the drift.
 */
type Pinned<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Each guard fires INDEPENDENTLY — a divergence in any one axis is a `tsc`
 * error on its own line (`Type 'true' is not assignable to type 'false'`),
 * naming which taxonomy drifted. Do NOT delete these to make a build pass; fix
 * the mismatch in `@oslsr/types`.
 */
const _dataStatusPinned: Pinned<RegistryDataStatus, SharedRegistryDataStatus> = true;
const _completenessPinned: Pinned<RegistryCompleteness, SharedRegistryCompleteness> = true;
const _verificationPinned: Pinned<RegistryVerification, SharedRegistryVerification> = true;
void _dataStatusPinned;
void _completenessPinned;
void _verificationPinned;

/**
 * THE emptiness contract — the single definition of "this person answered this
 * question", stated once and then expressed in BOTH languages this module
 * speaks (TS for the axis derivations, SQL for the published rate
 * denominators).
 *
 * ⚠️ It has to be one contract. The two used to disagree: TS treated `[]` as
 * unanswered while the SQL denominator compared only against `''`, and
 * `->>'skills_possessed'` renders an empty array as the TEXT `'[]'` — so a
 * respondent could be `partial` on Axis-2 and simultaneously sit in a rate's
 * denominator as having answered. Two definitions of "answered" inside the one
 * module written to end second definitions is the drift 13-33/13-37 exist to
 * kill, just at a smaller scale.
 *
 * Anything that survives `btrim` and is not one of these is an answer — `'0'`
 * and `'false'` included, because both are real responses.
 */
export const EMPTY_ANSWER_TEXTS = ['', '[]', '{}'] as const;

/** The TS half of {@link EMPTY_ANSWER_TEXTS}. */
function hasAnswer(rawData: Record<string, unknown> | null, field: string): boolean {
  if (rawData == null) return false;
  const value = rawData[field];
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return !(EMPTY_ANSWER_TEXTS as readonly string[]).includes(String(value).trim());
}

function hasAnyMarker(
  rawData: Record<string, unknown> | null,
  markers: readonly string[],
): boolean {
  return markers.some((m) => hasAnswer(rawData, m));
}

/**
 * Axis-2. ⚠️ Derived from the RAW `raw_data` field-set — NOT from
 * `deriveDataStatus()`, which is a lossy projection with no full/core
 * distinction (12-4 Dev Notes, "CRITICAL: derive the 3 axes from RAW FIELDS").
 *
 * `partial` also absorbs the degenerate case of a non-empty submission carrying
 * no recognised marker at all (e.g. consent-only) — both it and "no submission"
 * mean the same thing to a reader: we do not hold the core picture.
 */
export function deriveCompleteness(
  rawData: Record<string, unknown> | null,
): RegistryCompleteness {
  if (!hasNonEmptyRawData(rawData)) return 'partial';
  if (hasAnyMarker(rawData, REGISTRY_DEEP_FIELD_MARKERS)) return 'full';
  if (hasAnyMarker(rawData, REGISTRY_CORE_FIELD_MARKERS)) return 'core';
  return 'partial';
}

/**
 * Axis-3, in the precedence the 12-4 Dev Note enumerates:
 * `pending_nin` → `unverified_import` → `nin_on_file` → `self_declared`.
 *
 * ⚠️ A row that is `pending_nin_capture` while ALREADY carrying a NIN reads as
 * `pending_nin`, not `nin_on_file`. That combination is a STALLED PROMOTE (the
 * seam Story 13-53 fixed), and surfacing it is the point — smoothing it to
 * `nin_on_file` would hide exactly the state that was invisible before.
 */
export function deriveVerification(input: {
  nin?: string | null;
  status?: string | null;
  source?: string | null;
}): RegistryVerification {
  if (input.status === 'pending_nin_capture') return 'pending_nin';
  if (input.status === 'imported_unverified') return 'unverified_import';
  if (typeof input.source === 'string' && input.source.startsWith('imported_')) {
    return 'unverified_import';
  }
  if (typeof input.nin === 'string' && input.nin.trim() !== '') return 'nin_on_file';
  return 'self_declared';
}

/**
 * The R2 identity key for one row: NIN → E.164 phone → respondent.id.
 *
 * NIN is FORMAT-ONLY (`^\d{11}$`) — never a mod-11 checksum, which rejects ~74%
 * of real NINs (`nin-validation-mod11-invalid`). Phone is normalised by the same
 * `normaliseNigerianPhone` the writers use, and accepted as a key ONLY if it
 * lands on the shape the column's CHECK constraint enforces.
 */
function identityKeyFor(row: RegistryUnifiedRow): {
  key: string;
  resolved: boolean;
  /** The phone rung, computed EVEN WHEN the NIN rung won. See below. */
  phoneKey: string | null;
} {
  let phoneKey: string | null = null;
  if (row.phone_number != null && row.phone_number.trim() !== '') {
    const { value } = normaliseNigerianPhone(row.phone_number);
    if (RESPONDENT_PHONE_E164.test(value)) phoneKey = `tel:${value}`;
  }

  const nin = row.nin?.trim();
  if (nin && /^\d{11}$/.test(nin)) return { key: `nin:${nin}`, resolved: true, phoneKey };
  if (phoneKey) return { key: phoneKey, resolved: true, phoneKey };

  return { key: `id:${row.respondent_id}`, resolved: false, phoneKey };
}

/**
 * Collapse the rows belonging to ONE person into a single derivation input.
 *
 * Merge rules, stated once so no axis invents its own:
 *   • answers  — ANY row with answers ⇒ the person has answers.
 *   • raw_data — the RICHEST row (most keys) feeds Axis-2, so completeness
 *                reflects the best data we hold, not whichever row sorted first.
 *   • nin      — the first NIN found. A NIN is a fact; another row lacking it
 *                does not un-know it.
 *   • status /
 *     source   — the OLDEST row wins, matching the project's merge survivor
 *                rule (Story 13-49: OLDER wins) so this agrees with what a real
 *                identity merge would keep.
 *   • data_lost — sticky: if any row is flagged, the person's answers were lost.
 */
function collapsePerson(rows: RegistryUnifiedRow[]): RegistryUnifiedRow {
  if (rows.length === 1) return rows[0];

  const oldest = rows.reduce((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.created_at ? new Date(b.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    return bt < at ? b : a;
  });

  const richest = rows.reduce((a, b) => {
    const ak = a.raw_data ? Object.keys(a.raw_data).length : 0;
    const bk = b.raw_data ? Object.keys(b.raw_data).length : 0;
    return bk > ak ? b : a;
  });

  const dataLost = rows.some(
    (r) => (r.metadata as { questionnaire_data_lost?: boolean } | null)
      ?.questionnaire_data_lost === true,
  );

  return {
    ...oldest,
    nin: rows.find((r) => r.nin != null && r.nin.trim() !== '')?.nin ?? oldest.nin,
    raw_data: richest.raw_data,
    metadata: dataLost
      ? { ...(oldest.metadata ?? {}), questionnaire_data_lost: true }
      : oldest.metadata,
  };
}

function zeroFilled<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

/**
 * Scope + optional filters, expressed against the canonical unified read's own
 * columns. Parameterised via the drizzle template tag — never `sql.raw` for a
 * user-supplied value.
 *
 * Two deliberate differences from `survey-analytics`'s `buildWhereFragments`,
 * both because this counts a REGISTRY rather than a set of submissions:
 *
 * 1. **Dates filter `created_at` (when the PERSON registered), not
 *    `submitted_at`.** A respondent with no submission has no `submitted_at`;
 *    filtering on it would silently drop exactly the people (`no_submission`,
 *    `data_lost`, `pending_nin`) this story exists to make visible.
 *
 * 2. **`personal` scope applies NO filter.** There is no per-enumerator
 *    registry — the register is one shared object, and `totalRegistered` is
 *    already published UNAUTHENTICATED on oyoskills.com/insights. Silently
 *    widening a personal scope would be a bypass worth flagging if the figure
 *    were sensitive; it is not, and the alternative (403 for enumerators)
 *    contradicts AC5.2's "all dashboard roles". Stated here so it is a decision
 *    on the record rather than an omission someone later mistakes for a hole.
 */
function buildRegistryFilter(scope: AnalyticsScope, params: AnalyticsQueryParams): SQL {
  const conditions: SQL[] = [sql`TRUE`];

  if (scope.type === 'lga') {
    if (!scope.lgaCode) {
      throw new AppError(
        'ANALYTICS_SCOPE_INVALID',
        'AnalyticsScope type is "lga" but lgaCode is undefined',
        500,
      );
    }
    conditions.push(sql`ru.lga_id = ${scope.lgaCode}`);
  }

  if (params.lgaId) conditions.push(sql`ru.lga_id = ${params.lgaId}`);
  if (params.source) conditions.push(sql`ru.source = ${params.source}`);
  if (params.dateFrom) conditions.push(sql`ru.created_at >= ${params.dateFrom}::timestamptz`);
  if (params.dateTo) conditions.push(sql`ru.created_at <= ${params.dateTo}::timestamptz`);

  return sql.join(conditions, sql` AND `);
}

/**
 * Every axis must partition the SAME population — a breakdown that does not add
 * up to its own headline is a derivation bug, not a data condition, so it fails
 * loudly instead of being published.
 *
 * Exported because a guard with no way to exercise it is a guard nobody has
 * watched fire. `getRegistryTotals` cannot produce a breach on purpose (its
 * derivations are total by construction), so the RED-verify mutation left the
 * inline version GREEN — the test asserted the safe OUTCOME and would have
 * passed with the guard deleted. This is the seam that makes it testable.
 */
export function assertAxesPartition(
  axes: Record<string, Record<string, number>>,
  totalRespondents: number,
): void {
  for (const [name, map] of Object.entries(axes)) {
    const sum = Object.values(map).reduce((a, b) => a + b, 0);
    if (sum !== totalRespondents) {
      logger.error({
        event: 'analytics.registry_totals_invariant_breach',
        axis: name,
        sum,
        totalRespondents,
      });
      throw new AppError(
        'REGISTRY_TOTALS_INVARIANT',
        `registryTotals invariant breach: ${name} sums to ${sum}, expected ${totalRespondents}`,
        500,
      );
    }
  }
}

/**
 * THE aggregate every analytics surface counts the registry from (12-4).
 *
 * Reads every respondent once through the canonical unified source, resolves
 * rows to PEOPLE, and tallies the flat data-status badge plus the three
 * orthogonal axes in a single pass.
 *
 * ── Why the rows come back to TS instead of being tallied in SQL ────────────
 * The taxonomy atom (`deriveDataStatus`) is a TS function and 9-59 owns it.
 * Re-expressing its precedence as a SQL `CASE` would be a second definition —
 * the exact drift 13-33 and 13-37 exist to prevent. `getUnifiedExportData`
 * already consumes the read row-by-row this way for the same reason.
 *
 * ── Scale ───────────────────────────────────────────────────────────────────
 * ~315 rows today. The 13-33-L3 hedge (materialise the view, or index
 * `submissions(respondent_id, submitted_at DESC)`) triggers at >5,000
 * respondents or >500 ms p95 — neither is met, so this stays inline.
 */
export async function getRegistryTotals(
  scope: AnalyticsScope = { type: 'system' },
  params: AnalyticsQueryParams = {},
): Promise<RegistryTotals> {
  const [unified, drafts, registeredPhones] = await Promise.all([
    // Explicit projection, not `SELECT *`. This function returns COUNTS, so
    // there is no reason for every respondent's NIN and phone to cross into the
    // API process on a dashboard hit — but the identity key needs exactly those
    // two, so they are named rather than swept in. `consent_*` is not read here.
    db.execute(sql`
      SELECT
        ru.respondent_id, ru.lga_id, ru.source, ru.status,
        ru.nin, ru.phone_number, ru.metadata, ru.created_at, ru.raw_data
      FROM ${registryUnifiedSource('ru')}
      WHERE ${buildRegistryFilter(scope, params)}
    `),
    // AC8 — drafts still in progress.
    //
    // ⚠️ "non-expired" IS NOT "in progress". The self-serve path deletes a draft
    // on registration (registration.controller.ts), which is what made that
    // equivalence look true — but Story 13-49's adoption programme deliberately
    // does NOT delete what it adopts ("doing nothing deletes it at expiry"), and
    // it turned ~174 drafts into registry records. Counting raw non-expired rows
    // therefore reports several hundred ALREADY-REGISTERED people as still in
    // progress, printed beside the very total that already contains them — the
    // funnel metric AC8 exists to keep honest, being dishonest.
    //
    // So the phone is carried out and reconciled in TS below against the
    // registered set, using the ONE normaliser (`normaliseNigerianPhone`).
    db.execute(sql`
      SELECT form_data->>'phone' AS phone
      FROM wizard_drafts
      WHERE expires_at > NOW()
    `),
    // GLOBAL on purpose — a draft is pre-registry and has no reliable LGA, so
    // "has this person since registered?" cannot be answered inside a scope.
    db.execute(sql`
      SELECT phone_number FROM respondents WHERE phone_number IS NOT NULL
    `),
  ]);

  const rows = unified.rows as unknown as RegistryUnifiedRow[];

  // ── Resolve rows → people ────────────────────────────────────────────────
  //
  // ⚠️ THE PHONE RUNG IS EVALUATED FOR EVERY ROW, INCLUDING NIN-BEARING ONES.
  // A first-rung-wins key would put a NIN row under `nin:…` and its no-NIN twin
  // under `tel:…`, so the two never meet — and that pair is not hypothetical,
  // it is the duplicate class this register ACTUALLY holds. Story 13-49's
  // adoption deduped on the INCOMING NIN, so a no-NIN self-registration matched
  // nothing and 7 people ended up with two rows. Keying on the first rung alone
  // left those neither merged nor flagged: invisible in both directions.
  const groups = new Map<string, RegistryUnifiedRow[]>();
  const unresolvedKeys = new Set<string>();
  /** phone rung → the distinct identity groups that carry it. */
  const phoneOwners = new Map<string, Set<string>>();
  /** identity group → the phone rungs its rows carry. */
  const groupPhones = new Map<string, Set<string>>();

  for (const row of rows) {
    const { key, resolved, phoneKey } = identityKeyFor(row);
    if (!resolved) unresolvedKeys.add(key);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);

    if (phoneKey) {
      const owners = phoneOwners.get(phoneKey) ?? new Set<string>();
      owners.add(key);
      phoneOwners.set(phoneKey, owners);

      const phones = groupPhones.get(key) ?? new Set<string>();
      phones.add(phoneKey);
      groupPhones.set(key, phones);
    }
  }

  /** One handset, two identities — a duplicate or a household, and we cannot tell. */
  const sharedAcrossIdentities = (key: string): boolean => {
    const phones = groupPhones.get(key);
    if (!phones) return false;
    for (const phone of phones) {
      if ((phoneOwners.get(phone)?.size ?? 0) > 1) return true;
    }
    return false;
  };

  // A SHARED phone cannot distinguish "one person, two rows" from "a household
  // on one handset". AC2 forbids merging them, so they stay separate people and
  // are reported as the uncertainty band instead. `identityAmbiguous` counts
  // PEOPLE, so it can never exceed `totalRespondents`.
  const people: RegistryUnifiedRow[] = [];
  let identityAmbiguous = 0;

  for (const [key, groupRows] of groups) {
    const sharedWithinGroup = key.startsWith('tel:') && groupRows.length > 1;
    if (sharedWithinGroup) {
      for (const row of groupRows) people.push(row);
      identityAmbiguous += groupRows.length;
      continue;
    }

    people.push(collapsePerson(groupRows));
    if (unresolvedKeys.has(key) || sharedAcrossIdentities(key)) identityAmbiguous += 1;
  }

  // ── Single per-person pass: flat badge + three axes ──────────────────────
  const byDataStatus = zeroFilled(REGISTRY_DATA_STATUSES);
  const byCompleteness = zeroFilled(REGISTRY_COMPLETENESS_LEVELS);
  const byVerification = zeroFilled(REGISTRY_VERIFICATION_TIERS);
  const bySource: Record<string, number> = zeroFilled(respondentSourceTypes);

  for (const person of people) {
    const status = deriveDataStatus({
      hasSubmissionData: hasNonEmptyRawData(person.raw_data),
      status: person.status,
      source: person.source,
      metadata: person.metadata as { questionnaire_data_lost?: boolean } | null,
    });
    byDataStatus[status] += 1;

    byCompleteness[deriveCompleteness(person.raw_data)] += 1;
    byVerification[
      deriveVerification({ nin: person.nin, status: person.status, source: person.source })
    ] += 1;

    const source = person.source ?? 'unknown';
    bySource[source] = (bySource[source] ?? 0) + 1;
  }

  const totalRespondents = people.length;

  assertAxesPartition(
    {
      byDataStatus,
      byCompleteness,
      byVerification,
      bySource,
    },
    totalRespondents,
  );

  // ── AC8 — drafts that have NOT since become registry records ─────────────
  const normalisedPhone = (raw: unknown): string | null => {
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    const { value } = normaliseNigerianPhone(raw);
    return RESPONDENT_PHONE_E164.test(value) ? value : null;
  };

  const registered = new Set<string>();
  for (const r of registeredPhones.rows as unknown as { phone_number: string | null }[]) {
    const phone = normalisedPhone(r.phone_number);
    if (phone) registered.add(phone);
  }

  // A draft with no usable phone COUNTS as in progress: we cannot show it has
  // been registered, and dropping it would understate the funnel on a guess.
  let inProgressDrafts = 0;
  let draftsAlreadyRegistered = 0;
  for (const d of drafts.rows as unknown as { phone: string | null }[]) {
    const phone = normalisedPhone(d.phone);
    if (phone && registered.has(phone)) draftsAlreadyRegistered += 1;
    else inProgressDrafts += 1;
  }

  logger.info({
    event: 'analytics.registry_totals_computed',
    totalRespondents,
    withAnswers: byDataStatus.completed,
    identityAmbiguous,
    inProgressDrafts,
    draftsAlreadyRegistered,
    rowsRead: rows.length,
  });

  return {
    totalRespondents,
    withAnswers: byDataStatus.completed,
    byDataStatus,
    bySource,
    byCompleteness,
    byVerification,
    identityAmbiguous,
    inProgressDrafts,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * PER-FIELD DENOMINATOR (Story 12-4 addendum, 2026-08-12 — ruling R-E)
 * ══════════════════════════════════════════════════════════════════════════ */

/** Field names are code-controlled; this refuses anything that isn't. */
const SAFE_FIELD_NAME = /^[a-z0-9_]{1,64}$/;

/**
 * The denominator for a rate over ONE question: the people who ANSWERED THAT
 * QUESTION — not the people who answered anything.
 *
 * ⭐ WHY THIS EXISTS. `public-insights` divided two published rates by
 * `ru.raw_data IS NOT NULL` ("has ANY answers"). A person who was never ASKED
 * about employment sat in the unemployment denominator, so *not asked* silently
 * became *not employed*, and BOTH published rates read lower than the truth.
 * Ruling R-E: a rate's denominator is the set who answered that question.
 * Source is never the variable.
 *
 * Defined HERE because 12-4 owns the totals/denominator model — so every chart
 * divides by the same thing instead of inventing its own.
 *
 * ⚠️ Composes against the alias of the canonical unified read (`ru`), so it
 * counts PEOPLE (one row per respondent), never submissions.
 *
 * @param field a `raw_data` question name (e.g. `employment_status`)
 * @param alias the unified-read alias in the enclosing query
 */
export function answeredFieldDenominator(field: string, alias = 'ru'): SQL {
  if (!SAFE_FIELD_NAME.test(field)) {
    throw new AppError(
      'UNSAFE_FIELD_NAME',
      `Unsafe raw_data field name for denominator: ${field}`,
      500,
    );
  }
  if (!SAFE_FIELD_NAME.test(alias)) {
    throw new AppError('UNSAFE_ALIAS', `Unsafe alias for denominator: ${alias}`, 500);
  }
  // The SQL half of EMPTY_ANSWER_TEXTS — same contract as `hasAnswer`, so a row
  // cannot read as `partial` on Axis-2 and as answered in a rate denominator.
  const empties = sql.join(
    EMPTY_ANSWER_TEXTS.map((t) => sql`${t}`),
    sql`, `,
  );
  return sql`COUNT(*) FILTER (WHERE ${sql.raw(alias)}.raw_data->>${field} IS NOT NULL AND btrim(${sql.raw(alias)}.raw_data->>${field}) NOT IN (${empties}))`;
}
