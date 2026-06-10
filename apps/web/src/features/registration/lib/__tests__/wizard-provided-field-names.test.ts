import { describe, it, expect } from 'vitest';
import {
  WIZARD_PROVIDED_FIELD_NAMES,
  findWizardFieldForQuestionName,
  NIN_QUESTION_NAMES,
} from '../wizard-provided-field-names';

/**
 * Story 9-18 AC#B6 — single canonical collision-detector test. Asserts the
 * final canonical state of the wizard-field alias map in ONE polarity (no
 * two-step ship-then-extend, no inversion). NIN ships in the map from inception
 * and the legacy `nin-question-names.ts` module is gone.
 */
describe('WIZARD_PROVIDED_FIELD_NAMES (AC#B6 collision detector)', () => {
  it('has exactly the seven canonical keys', () => {
    expect(Object.keys(WIZARD_PROVIDED_FIELD_NAMES).sort()).toEqual([
      'dob',
      'email',
      'familyName',
      'fullName',
      'givenName',
      'nin',
      'phone',
    ]);
  });

  it('stores every alias in lowercase (canonical form)', () => {
    for (const aliases of Object.values(WIZARD_PROVIDED_FIELD_NAMES)) {
      for (const alias of aliases) {
        expect(alias).toBe(alias.toLowerCase());
      }
    }
  });

  it('includes the nin key with the exact legacy aliases', () => {
    expect(WIZARD_PROVIDED_FIELD_NAMES.nin).toEqual(['nin', 'national_id']);
    // The widened convenience export mirrors the map's nin tuple exactly.
    expect([...NIN_QUESTION_NAMES]).toEqual(['nin', 'national_id']);
  });

  it('has deleted the legacy nin-question-names.ts module (consolidation)', () => {
    // Vite resolves a glob of a non-existent file to an empty record.
    const legacy = import.meta.glob('../nin-question-names.ts');
    expect(Object.keys(legacy)).toHaveLength(0);
  });

  it('matches the canonical map snapshot (guards unintended edits)', () => {
    expect(WIZARD_PROVIDED_FIELD_NAMES).toMatchInlineSnapshot(`
      {
        "dob": [
          "date_of_birth",
          "dob",
          "birth_date",
        ],
        "email": [
          "email",
          "email_address",
        ],
        "familyName": [
          "family_name",
          "last_name",
          "lastname",
          "surname",
        ],
        "fullName": [
          "full_name",
          "fullname",
          "name",
        ],
        "givenName": [
          "given_name",
          "first_name",
          "firstname",
        ],
        "nin": [
          "nin",
          "national_id",
        ],
        "phone": [
          "phone",
          "phone_number",
          "mobile",
          "mobile_number",
        ],
      }
    `);
  });

  describe('findWizardFieldForQuestionName (case-insensitive, all 7 keys)', () => {
    it.each([
      ['full_name', 'fullName'],
      ['FULLNAME', 'fullName'],
      ['name', 'fullName'],
      ['given_name', 'givenName'],
      ['First_Name', 'givenName'],
      ['firstname', 'givenName'],
      ['family_name', 'familyName'],
      ['SURNAME', 'familyName'],
      ['lastname', 'familyName'],
      ['phone_number', 'phone'],
      ['Mobile', 'phone'],
      ['email_address', 'email'],
      ['date_of_birth', 'dob'],
      ['DOB', 'dob'],
      ['nin', 'nin'],
      ['National_ID', 'nin'],
    ])('maps question name "%s" -> wizard key "%s"', (question, expected) => {
      expect(findWizardFieldForQuestionName(question)).toBe(expected);
    });

    it('returns null for unrelated question names', () => {
      expect(findWizardFieldForQuestionName('household_size')).toBeNull();
      expect(findWizardFieldForQuestionName('')).toBeNull();
    });

    it('trims surrounding whitespace before matching', () => {
      expect(findWizardFieldForQuestionName('  email  ')).toBe('email');
    });
  });
});
