import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { XlsformParserService } from '../xlsform-parser.service.js';
import { convertToNativeForm } from '../xlsform-to-native-converter.js';
import type { XlsformSurveyRow } from '@oslsr/types';

/**
 * Story 13-19 — guard the SHIPPED Public Core binary.
 *
 * The 2026-07-06 AC6 dry-run proved that main_occupation / employment_type /
 * years_experience were silently dropped for the whole public channel: they
 * carried `relevant = ${employment_status}='yes' or ${temp_absent}='yes'`, but
 * employment_status/temp_absent were CUT from the Public Core (the deferred
 * labour-force screen). A relevance predicate over absent fields never
 * evaluates true → the questions never render → occupation was never captured.
 *
 * `XlsformParserService.validate()` does NOT inspect relevant/calculation/
 * constraint for orphan `${field}` references — which is exactly why this bug
 * shipped clean. This suite encodes that missing invariant (AC2) as an
 * automated guard against re-orphaning, plus the AC1 always-ask assertion.
 */
const PUBLIC_CORE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../test-fixtures/oslsr-public-core-v1.xlsx',
);

// The operator uploads THIS copy to prod; the suite above guards the fixture.
// M1 (13-19 review) pins the two in lock-step so neither can regress silently.
const DOCS_UPLOAD_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/launch-campaign/oslsr-public-core-v1.xlsx',
);

const LABOR_FIELDS = ['main_occupation', 'employment_type', 'years_experience'] as const;

// validate() intentionally leaves these three non-blocking warnings: the
// business/apprentice block is deferred, and skill_list is 61<150 until Story
// 13-20. A NEW warning outside this set signals an unintended form regression.
const ACCEPTABLE_WARNING_FIELDS = new Set(['business_address', 'apprentice_count', 'skill_list']);

/** Extract every `${field}` token referenced by a survey expression cell. */
function extractRefs(expr: unknown): string[] {
  if (typeof expr !== 'string' || expr.trim() === '') return [];
  const refs: string[] = [];
  const re = /\$\{\s*([a-zA-Z_][\w-]*)\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) refs.push(m[1]);
  return refs;
}

function loadSurvey(): XlsformSurveyRow[] {
  const parsed = XlsformParserService.parseXlsxFile(readFileSync(PUBLIC_CORE_PATH));
  return parsed.survey;
}

describe('Public Core form — Story 13-19 labour relevance fix', () => {
  it('AC3 — the shipped Public Core still validates with 0 errors', () => {
    const parsed = XlsformParserService.parseXlsxFile(readFileSync(PUBLIC_CORE_PATH));
    const result = XlsformParserService.validate(parsed);
    expect(result.errors, JSON.stringify(result.errors, null, 2)).toHaveLength(0);
    expect(result.isValid).toBe(true);
    // L2 (13-19 review) — assert the IDENTITY of every warning, not just a count
    // ceiling: each must be a known-acceptable deferral. A bare `<= 3` would let
    // a new unexpected warning silently replace one of these. This subset check
    // still tolerates Story 13-20 later removing the skill_list warning.
    for (const w of result.warnings) {
      expect(
        ACCEPTABLE_WARNING_FIELDS.has(String(w.field)),
        `unexpected validation warning (not a known deferral): ${w.message}`,
      ).toBe(true);
    }
    expect(result.warnings.length).toBeLessThanOrEqual(3);
  });

  it('AC2 — no relevant/calculation/constraint references a field absent from the Public Core', () => {
    const survey = loadSurvey();
    // The full set of names this form defines (questions, groups, calculates, metadata).
    const defined = new Set(
      survey.map((r) => String(r.name ?? '').trim()).filter((n) => n.length > 0),
    );

    const orphans: Array<{ field: string; column: string; ref: string; expr: string }> = [];
    for (const row of survey) {
      // Parser maps `relevant` → `relevance`; check both spellings defensively,
      // alongside calculation and constraint. M2 (13-19 review): XLSForm
      // expressions can ALSO reference `${field}` from choice_filter / default /
      // readonly / an expression-form `required` — sweep those too so a future
      // orphan can't hide in a column this guard wasn't watching (the original
      // narrow set is exactly why validate() missed the labour-relevance bug).
      const r = row as Record<string, unknown>;
      const cells: Array<[string, unknown]> = [
        ['relevant', r.relevant],
        ['relevance', r.relevance],
        ['calculation', row.calculation],
        ['constraint', row.constraint],
        ['choice_filter', r.choice_filter],
        ['default', r.default],
        ['readonly', r.readonly],
        ['required', r.required],
      ];
      for (const [column, expr] of cells) {
        for (const ref of extractRefs(expr)) {
          if (!defined.has(ref)) {
            orphans.push({ field: String(row.name ?? ''), column, ref, expr: String(expr) });
          }
        }
      }
    }

    expect(
      orphans,
      `Orphan field references (a cut field is still referenced):\n${JSON.stringify(orphans, null, 2)}`,
    ).toHaveLength(0);
  });

  it('AC1 — occupation/employment/experience always ask (no field-level relevance) and stay required', () => {
    const survey = loadSurvey();
    for (const name of LABOR_FIELDS) {
      const row = survey.find((r) => r.name === name);
      expect(row, `expected Public Core to contain '${name}'`).toBeDefined();
      const relevant = String(
        (row as Record<string, unknown>).relevant ??
          (row as Record<string, unknown>).relevance ??
          '',
      ).trim();
      expect(relevant, `'${name}' must have no field-level relevance in the Public Core`).toBe('');
      expect(String(row!.required ?? '').toLowerCase()).toBe('yes');
    }
  });

  it('AC3 — converted native form renders occupation/employment/experience as ungated questions', () => {
    const parsed = XlsformParserService.parseXlsxFile(readFileSync(PUBLIC_CORE_PATH));
    const schema = convertToNativeForm(parsed);
    const questions = schema.sections.flatMap((s) => s.questions);
    for (const name of LABOR_FIELDS) {
      const q = questions.find((qq) => qq.name === name);
      expect(q, `'${name}' must render as a question in the native form`).toBeDefined();
      // No per-question skip logic — it renders whenever its (age>=15) section shows.
      expect(q?.showWhen, `'${name}' must not carry a per-question gate`).toBeUndefined();
    }

    // L1 (13-19 review) — the fix removes the field-level relevance but MUST keep
    // the `grp_labor` section gate `${age} >= 15`. If a future edit strips it,
    // occupation would be asked of under-15s (who belong in the guardian block)
    // — the inverse silent-drop. Pin that the section keeps its showWhen.
    const laborSection = schema.sections.find((s) =>
      s.questions.some((qq) => qq.name === 'main_occupation'),
    );
    expect(laborSection, "the section containing 'main_occupation' must exist").toBeDefined();
    expect(
      laborSection?.showWhen,
      "grp_labor must keep its `${age} >= 15` section gate (occupation asks adults only)",
    ).toBeDefined();
  });

  it('M1 — the operator-upload copy and the test fixture are byte-identical', () => {
    // The suite guards test-fixtures/…, but the operator uploads
    // docs/launch-campaign/… to prod. Nothing else keeps them in lock-step, so a
    // stray edit to one could regress the live form while every test stays green
    // — the exact silent-drift failure mode this story exists to prevent.
    const fixture = readFileSync(PUBLIC_CORE_PATH);
    const upload = readFileSync(DOCS_UPLOAD_PATH);
    expect(
      Buffer.compare(fixture, upload),
      'docs/launch-campaign/oslsr-public-core-v1.xlsx has drifted from test-fixtures/oslsr-public-core-v1.xlsx — re-sync the two copies before upload',
    ).toBe(0);
  });

  it('AC1 — the cut labour-force screen fields are NOT reintroduced', () => {
    const defined = new Set(loadSurvey().map((r) => r.name));
    // These belong to the enumerator Full form only; the Public Core defers them.
    expect(defined.has('employment_status')).toBe(false);
    expect(defined.has('temp_absent')).toBe(false);
  });
});
