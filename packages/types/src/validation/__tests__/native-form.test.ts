import { describe, it, expect } from 'vitest';
import {
  nativeFormSchema,
  sectionSchema,
  questionSchema,
  conditionSchema,
  conditionGroupSchema,
  choiceSchema,
  validationRuleSchema,
} from '../native-form.js';
import { validationTypes } from '../../native-form.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function validChoice(overrides = {}) {
  return { label: 'Yes', value: 'yes', ...overrides };
}

function validCondition(overrides = {}) {
  return { field: 'consent_basic', operator: 'equals' as const, value: 'yes', ...overrides };
}

function validQuestion(overrides = {}) {
  return {
    id: '019c0000-0000-7000-8000-000000000001',
    type: 'text' as const,
    name: 'first_name',
    label: 'First Name',
    required: true,
    ...overrides,
  };
}

function validSection(overrides = {}) {
  return {
    id: '019c0000-0000-7000-8000-000000000010',
    title: 'Identity & Demographics',
    questions: [validQuestion()],
    ...overrides,
  };
}

function validForm(overrides = {}) {
  return {
    id: '019c0000-0000-7000-8000-000000000100',
    title: 'OSLSR Labour & Skills Registry Survey',
    version: '1.0.0',
    status: 'draft' as const,
    sections: [validSection()],
    choiceLists: {
      yes_no: [validChoice({ label: 'Yes', value: 'yes' }), validChoice({ label: 'No', value: 'no' })],
    },
    createdAt: '2026-02-07T00:00:00.000Z',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Native Form Zod Schemas', () => {
  describe('nativeFormSchema', () => {
    it('1. should accept a valid complete form schema', () => {
      const form = validForm({
        publishedAt: '2026-02-07T12:00:00.000Z',
        sections: [
          validSection({
            showWhen: validCondition(),
            questions: [
              validQuestion({
                type: 'select_one',
                name: 'gender',
                label: 'Gender',
                choices: 'gender_list',
                validation: [{ type: 'minLength', value: 1, message: 'Required' }],
                showWhen: validCondition(),
              }),
            ],
          }),
        ],
        choiceLists: {
          gender_list: [
            { label: 'Male', value: 'male' },
            { label: 'Female', value: 'female' },
          ],
        },
      });

      const result = nativeFormSchema.safeParse(form);
      expect(result.success).toBe(true);
    });

    it('2. should accept a valid form with minimal fields (no optional properties)', () => {
      const form = validForm();
      const result = nativeFormSchema.safeParse(form);
      expect(result.success).toBe(true);
    });

    it('5. should reject when required fields (title, version, sections) are missing', () => {
      const noTitle = { ...validForm() };
      delete (noTitle as any).title;
      expect(nativeFormSchema.safeParse(noTitle).success).toBe(false);

      const noVersion = { ...validForm() };
      delete (noVersion as any).version;
      expect(nativeFormSchema.safeParse(noVersion).success).toBe(false);

      const noSections = { ...validForm() };
      delete (noSections as any).sections;
      expect(nativeFormSchema.safeParse(noSections).success).toBe(false);
    });

    it('6. should accept a form with empty sections array', () => {
      const form = validForm({ sections: [] });
      const result = nativeFormSchema.safeParse(form);
      expect(result.success).toBe(true);
    });

    it('13. should reject question referencing nonexistent choiceLists key', () => {
      const form = validForm({
        sections: [
          validSection({
            questions: [
              validQuestion({
                type: 'select_one',
                name: 'gender',
                label: 'Gender',
                choices: 'nonexistent_list',
              }),
            ],
          }),
        ],
      });
      const result = nativeFormSchema.safeParse(form);
      expect(result.success).toBe(false);
    });

    it('should reject invalid semver version string', () => {
      const form = validForm({ version: 'latest' });
      expect(nativeFormSchema.safeParse(form).success).toBe(false);

      const form2 = validForm({ version: '1.0' });
      expect(nativeFormSchema.safeParse(form2).success).toBe(false);
    });
  });

  describe('questionSchema', () => {
    it('3. should reject an invalid question type', () => {
      const q = validQuestion({ type: 'checkbox' });
      expect(questionSchema.safeParse(q).success).toBe(false);
    });

    it('should accept question with Yoruba label', () => {
      const q = validQuestion({ labelYoruba: 'Orukọ Àkọ́kọ́' });
      const result = questionSchema.safeParse(q);
      expect(result.success).toBe(true);
    });
  });

  describe('conditionSchema', () => {
    it('4. should reject an invalid condition operator', () => {
      const c = validCondition({ operator: 'contains' });
      expect(conditionSchema.safeParse(c).success).toBe(false);
    });

    it('7. should accept is_empty operator without value', () => {
      const c = { field: 'consent_basic', operator: 'is_empty' as const };
      expect(conditionSchema.safeParse(c).success).toBe(true);
    });

    it('should accept is_not_empty operator without value', () => {
      const c = { field: 'consent_basic', operator: 'is_not_empty' as const };
      expect(conditionSchema.safeParse(c).success).toBe(true);
    });

    it('should reject equals operator without value', () => {
      const c = { field: 'consent_basic', operator: 'equals' as const };
      expect(conditionSchema.safeParse(c).success).toBe(false);
    });
  });

  describe('conditionGroupSchema', () => {
    it('8. should validate ConditionGroup with any (OR) logic', () => {
      const group = {
        any: [
          validCondition({ field: 'employment_status', value: 'yes' }),
          validCondition({ field: 'temp_absent', value: 'yes' }),
        ],
      };
      const result = conditionGroupSchema.safeParse(group);
      expect(result.success).toBe(true);
    });

    it('9. should validate ConditionGroup with all (AND) logic', () => {
      const group = {
        all: [
          validCondition({ field: 'age', operator: 'greater_or_equal', value: 15 }),
          validCondition({ field: 'consent_basic', value: 'yes' }),
        ],
      };
      const result = conditionGroupSchema.safeParse(group);
      expect(result.success).toBe(true);
    });

    it('should reject empty ConditionGroup (neither any nor all)', () => {
      const group = {};
      expect(conditionGroupSchema.safeParse(group).success).toBe(false);
    });

    it('10. should reject ConditionGroup with both any and all', () => {
      const group = {
        any: [validCondition({ field: 'a', value: 'x' })],
        all: [validCondition({ field: 'b', value: 'y' })],
      };
      expect(conditionGroupSchema.safeParse(group).success).toBe(false);
    });
  });

  describe('choiceSchema', () => {
    it('11. should reject choice list with duplicate values', () => {
      const choices = [
        validChoice({ label: 'Yes', value: 'yes' }),
        validChoice({ label: 'Also Yes', value: 'yes' }),
      ];
      // Choice list uniqueness validated at form level via choiceLists
      const form = validForm({
        choiceLists: { dupes: choices },
      });
      const result = nativeFormSchema.safeParse(form);
      expect(result.success).toBe(false);
    });

    it('should accept choice with Yoruba label', () => {
      const c = { label: 'Yes', labelYoruba: 'Bẹ́ẹ̀ni', value: 'yes' };
      expect(choiceSchema.safeParse(c).success).toBe(true);
    });
  });

  describe('validationRuleSchema', () => {
    it('12. should accept a regex validation rule with valid regex', () => {
      const rule = { type: 'regex', value: '^\\d{11}$', message: 'Must be 11 digits' };
      expect(validationRuleSchema.safeParse(rule).success).toBe(true);
    });

    it('should reject a regex validation rule with invalid regex', () => {
      const rule = { type: 'regex', value: '[invalid(', message: 'Bad pattern' };
      expect(validationRuleSchema.safeParse(rule).success).toBe(false);
    });

    it('should accept min/max numeric validation rules', () => {
      const minRule = { type: 'min', value: 0, message: 'Must be non-negative' };
      const maxRule = { type: 'max', value: 150, message: 'Must be <= 150' };
      expect(validationRuleSchema.safeParse(minRule).success).toBe(true);
      expect(validationRuleSchema.safeParse(maxRule).success).toBe(true);
    });

    it('should reject invalid validation type', () => {
      const rule = { type: 'custom', value: '', message: 'nope' };
      expect(validationRuleSchema.safeParse(rule).success).toBe(false);
    });

    it('should accept modulus11 validation rule', () => {
      const rule = { type: 'modulus11', value: 1, message: 'Invalid NIN — please check for typos' };
      expect(validationRuleSchema.safeParse(rule).success).toBe(true);
    });
  });
});

describe('validationTypes includes modulus11', () => {
  it('should include modulus11 in the validationTypes array', () => {
    expect(validationTypes).toContain('modulus11');
  });
});
