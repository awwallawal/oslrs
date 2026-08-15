/**
 * Story 13-57 AC5 — the by-name ingestion contract.
 *
 * ⭐ THE FIRST TEST IN THIS FILE IS THE MOST IMPORTANT ONE, AND IT IS NOT THE
 * ONE THAT PROVES THE GUARD CATCHES THINGS.
 *
 * A blocking guard that refuses the form ALREADY LIVE ON PRODUCTION would lock
 * the operator out of the one action the re-upload procedure makes mandatory —
 * re-pinning — on the day of a launch campaign. So the shipped Public Core
 * workbook is run through the real checker and asserted CLEAN, from the same
 * fixture `public-core-form-relevance.test.ts` guards. If somebody widens
 * `REQUIRED_CONSUMER_FIELDS` past what the live form carries, this reds here
 * rather than at 7am in front of the operator.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { NativeFormSchema } from '@oslsr/types';
import { XlsformParserService } from '../xlsform-parser.service.js';
import { convertToNativeForm } from '../xlsform-to-native-converter.js';
import {
  checkIngestionContract,
  acceptedNamesFor,
  REQUIRED_CONSUMER_FIELDS,
} from '../ingestion-contract.js';
import { RESPONDENT_FIELD_MAP } from '../respondent-field-map.js';

const PUBLIC_CORE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../test-fixtures/oslsr-public-core-v1.xlsx',
);
const MASTER_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../test-fixtures/oslsr_master_v3.xlsx',
);

function loadNative(path: string): NativeFormSchema {
  return convertToNativeForm(XlsformParserService.parseXlsxFile(readFileSync(path)));
}

/** A minimal hand-built schema, so a test can remove exactly one thing. */
function schemaWith(questionNames: string[], choiceValues = ['yes', 'no']): NativeFormSchema {
  return {
    id: 'form-test',
    title: 'Contract Test',
    version: '1.0.0',
    status: 'published',
    sections: [
      {
        id: 's1',
        title: 'All',
        questions: questionNames.map((name, i) => ({
          id: `q${i}`,
          type: name.startsWith('consent_') ? 'select_one' : 'text',
          name,
          label: name,
          required: true,
          ...(name.startsWith('consent_') ? { choices: 'yes_no' } : {}),
        })),
      },
    ],
    choiceLists: { yes_no: choiceValues.map((v) => ({ label: v, value: v })) },
    createdAt: '2026-01-01T00:00:00.000Z',
  } as NativeFormSchema;
}

/** Every question name the live forms use for a required consumer field. */
const LIVE_FORM_NAMES = [
  'nin',
  'firstname',
  'surname',
  'phone_number',
  'lga_id',
  'consent_marketplace',
];

describe('checkIngestionContract — the SHIPPED forms must pass', () => {
  it('the live Public Core workbook honours the contract (the guard must not lock the operator out)', () => {
    const findings = checkIngestionContract(loadNative(PUBLIC_CORE_PATH));
    expect(
      findings,
      `The shipped Public Core would be REFUSED at re-pin:\n${JSON.stringify(findings, null, 2)}`,
    ).toHaveLength(0);
  });

  it('the enumerator Master workbook honours it too', () => {
    const findings = checkIngestionContract(loadNative(MASTER_PATH));
    expect(findings, JSON.stringify(findings, null, 2)).toHaveLength(0);
  });
});

describe('checkIngestionContract — what it refuses', () => {
  it('accepts a form carrying every required consumer field', () => {
    expect(checkIngestionContract(schemaWith(LIVE_FORM_NAMES))).toHaveLength(0);
  });

  /**
   * The scenario in one test: a re-uploaded workbook renames `surname` to
   * `family_name`. Nothing errors today — the answer simply stops arriving,
   * `lastName` is silently NULL from that moment, and the identity guard that
   * matches on first + last + phone quietly stops recognising returning
   * citizens.
   */
  it('refuses a renamed field, and names the CONSUMER that reads it (AC5.2)', () => {
    const renamed = LIVE_FORM_NAMES.map((n) => (n === 'surname' ? 'family_name' : n));
    const findings = checkIngestionContract(schemaWith(renamed));

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('missing_field');
    expect(findings[0].target).toBe('lastName');
    // The message must be usable by someone holding the workbook: what is
    // missing, what it may be called, and who breaks without it.
    expect(findings[0].message).toContain('`surname`');
    expect(findings[0].message).toContain('`last_name`');
    expect(findings[0].message).toContain('identity guard');
  });

  it.each([...REQUIRED_CONSUMER_FIELDS])('refuses a form missing %s entirely', (consumerField) => {
    const accepted = acceptedNamesFor(consumerField);
    const dropped = LIVE_FORM_NAMES.filter((n) => !accepted.includes(n));
    const findings = checkIngestionContract(schemaWith(dropped));
    expect(findings.some((f) => f.target === consumerField)).toBe(true);
  });

  /**
   * AC5.1 — value SHAPE, not just presence. Ingestion reads this answer as the
   * exact string `yes`; a workbook whose choice list says `Yes`/`No` (or
   * `agree`/`decline`) leaves the question present, required, answered — and
   * silently turns every opt-in into a decline.
   */
  it('refuses a consent question whose choice list cannot produce yes/no', () => {
    const findings = checkIngestionContract(
      schemaWith(LIVE_FORM_NAMES, ['agree', 'decline']),
    );
    const shape = findings.find((f) => f.kind === 'bad_value_shape');
    expect(shape).toBeDefined();
    expect(shape!.target).toBe('consent_marketplace');
    expect(shape!.message).toContain('yes, no');
    expect(shape!.message).toContain('cannot be told apart from a genuine decline');
  });

  it('does not report a missing field twice as both absent and mis-shaped', () => {
    const withoutConsent = LIVE_FORM_NAMES.filter((n) => n !== 'consent_marketplace');
    const findings = checkIngestionContract(schemaWith(withoutConsent));
    expect(findings.filter((f) => f.target === 'consentMarketplace')).toHaveLength(1);
    expect(findings.some((f) => f.kind === 'bad_value_shape')).toBe(false);
  });
});

describe('the contract is DERIVED from RESPONDENT_FIELD_MAP, never copied', () => {
  /**
   * The point of the derivation: a hand-written list of accepted names is a
   * COPY, and a copy drifts from the consumer it protects the first time
   * someone edits one and not the other
   * ([[pattern-census-counts-sites-not-callers]]). If this ever fails, someone
   * has reintroduced a literal list.
   */
  it('accepts exactly the names the ingestion map maps to that consumer field', () => {
    for (const consumerField of REQUIRED_CONSUMER_FIELDS) {
      const fromMap = Object.entries(RESPONDENT_FIELD_MAP)
        .filter(([, field]) => field === consumerField)
        .map(([name]) => name)
        .sort();
      expect(acceptedNamesFor(consumerField).sort()).toEqual(fromMap);
      expect(fromMap.length, `${consumerField} must be reachable by at least one name`)
        .toBeGreaterThan(0);
    }
  });

  it('a form using ANY alias for a field satisfies the contract', () => {
    // `first_name` / `firstName` / `firstname` are all in the map; the guard
    // must accept whichever spelling a workbook happens to use.
    const aliased = ['nin', 'first_name', 'last_name', 'phone', 'lga', 'consent_marketplace'];
    expect(checkIngestionContract(schemaWith(aliased))).toHaveLength(0);
  });
});
