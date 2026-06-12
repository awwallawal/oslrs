import { describe, it, expect } from 'vitest';
import {
  WIZARD_PROVIDED_FIELD_NAMES,
  findWizardFieldForQuestionName,
  mapWizardValueToChoice,
  WIZARD_CHOICE_FIELD_KEYS,
  NIN_QUESTION_NAMES,
} from '../wizard-provided-field-names';

/**
 * Story 9-18 AC#B6 — single canonical collision-detector test. Asserts the
 * final canonical state of the wizard-field alias map in ONE polarity (no
 * two-step ship-then-extend, no inversion). NIN ships in the map from inception
 * and the legacy `nin-question-names.ts` module is gone.
 */
describe('WIZARD_PROVIDED_FIELD_NAMES (AC#B6 collision detector)', () => {
  it('has exactly the eleven canonical keys', () => {
    // Story 9-54 AC4 — the four CHOICE fields (gender / lgaId / the two consents)
    // were added once the wizard-value → questionnaire-choice mapping layer
    // ({@link mapWizardValueToChoice}) made them safe. A new CHOICE key MUST be in
    // WIZARD_CHOICE_FIELD_KEYS and handled by the mapper, or it will inject an
    // invalid choice value — see the module's VALUE-VOCABULARY CONSTRAINT note.
    expect(Object.keys(WIZARD_PROVIDED_FIELD_NAMES).sort()).toEqual([
      'consentEnriched',
      'consentMarketplace',
      'dob',
      'email',
      'familyName',
      'fullName',
      'gender',
      'givenName',
      'lgaId',
      'nin',
      'phone',
    ]);
  });

  it('every choice key is registered in WIZARD_CHOICE_FIELD_KEYS', () => {
    expect([...WIZARD_CHOICE_FIELD_KEYS].sort()).toEqual([
      'consentEnriched',
      'consentMarketplace',
      'gender',
      'lgaId',
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
        "consentEnriched": [
          "consent_enriched",
        ],
        "consentMarketplace": [
          "consent_marketplace",
        ],
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
        "gender": [
          "gender",
          "sex",
        ],
        "givenName": [
          "given_name",
          "first_name",
          "firstname",
        ],
        "lgaId": [
          "lga",
          "lga_id",
          "lga_of_residence",
          "local_government",
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

  describe('mapWizardValueToChoice (Story 9-54 AC4 value-mapping)', () => {
    const genderChoices = [
      { value: 'male' },
      { value: 'female' },
      { value: 'other' },
    ];
    const yesNo = [{ value: 'yes' }, { value: 'no' }];
    const lgaChoices = [{ value: 'saki_west' }, { value: 'ibadan_north' }];

    it('maps gender prefer_not_to_say → other (vocabulary mismatch)', () => {
      expect(mapWizardValueToChoice('gender', 'prefer_not_to_say', genderChoices)).toBe('other');
    });

    it('passes through gender values that already match the choice list', () => {
      expect(mapWizardValueToChoice('gender', 'female', genderChoices)).toBe('female');
    });

    it('maps boolean consent → yes / no', () => {
      expect(mapWizardValueToChoice('consentMarketplace', true, yesNo)).toBe('yes');
      expect(mapWizardValueToChoice('consentEnriched', false, yesNo)).toBe('no');
    });

    it('dedups an LGA only when the wizard value is a valid choice key', () => {
      expect(mapWizardValueToChoice('lgaId', 'saki_west', lgaChoices)).toBe('saki_west');
      // A UUID / unknown key cannot be safely mapped → undefined (show the question)
      expect(
        mapWizardValueToChoice('lgaId', '019ccc89-bcba-7b7a-8157-763897caa988', lgaChoices),
      ).toBeUndefined();
    });

    it('returns undefined for an unmappable gender value (never injects invalid)', () => {
      expect(mapWizardValueToChoice('gender', 'prefer_not_to_say', [{ value: 'male' }])).toBeUndefined();
    });

    it('returns undefined for empty value or empty choice list', () => {
      expect(mapWizardValueToChoice('gender', '', genderChoices)).toBeUndefined();
      expect(mapWizardValueToChoice('gender', 'male', [])).toBeUndefined();
      expect(mapWizardValueToChoice('gender', undefined, genderChoices)).toBeUndefined();
    });
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
      ['gender', 'gender'],
      ['SEX', 'gender'],
      ['lga', 'lgaId'],
      ['lga_id', 'lgaId'],
      ['consent_marketplace', 'consentMarketplace'],
      ['consent_enriched', 'consentEnriched'],
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
