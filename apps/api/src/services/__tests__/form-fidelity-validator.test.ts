import { describe, it, expect } from 'vitest';
import { validateFormFidelity } from '../form-fidelity-validator.js';
import type { NativeFormSchema } from '@oslsr/types';

function makeSchema(overrides: Partial<NativeFormSchema> = {}): NativeFormSchema {
  return {
    id: '01234567-89ab-7cde-8000-000000000001',
    title: 'Test',
    version: '3.0.0',
    status: 'draft',
    sections: [],
    choiceLists: {},
    createdAt: '2026-06-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('validateFormFidelity — calculate token safety (AC3.1c)', () => {
  it('passes the master-form age calculation (no false positive)', () => {
    const schema = makeSchema({
      calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
    });
    const { errors, warnings } = validateFormFidelity(schema);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('flags an unsupported function in a calculation as a blocking error', () => {
    const schema = makeSchema({
      calculations: [{ name: 'bad', expression: 'pow(${x}, 2)' }],
    });
    const { errors } = validateFormFidelity(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ kind: 'unsupported_calculation', target: 'bad', level: 'error' });
  });

  it('flags raw `/` division (XLSForm uses `div`)', () => {
    const schema = makeSchema({ calculations: [{ name: 'r', expression: '${a} / 2' }] });
    expect(validateFormFidelity(schema).errors).toHaveLength(1);
  });
});

describe('validateFormFidelity — wizard-dedup vocabulary (AC3.2)', () => {
  function genderSection(values: string[]): NativeFormSchema {
    return makeSchema({
      sections: [
        {
          id: 's1',
          title: 'S',
          questions: [
            { id: 'q', type: 'select_one', name: 'gender', label: 'Gender', required: true, choices: 'gender_list' },
          ],
        },
      ],
      choiceLists: { gender_list: values.map((v) => ({ label: v, value: v })) },
    });
  }

  it('warns when a gender question omits the `other` value the wizard maps to', () => {
    const { warnings, errors } = validateFormFidelity(genderSection(['male', 'female']));
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: 'wizard_dedup_vocabulary', target: 'gender', level: 'warning' });
  });

  it('does not warn when the gender choice list is complete', () => {
    expect(validateFormFidelity(genderSection(['male', 'female', 'other'])).warnings).toEqual([]);
  });

  it('warns when a consent question is not a yes/no list', () => {
    const schema = makeSchema({
      sections: [
        {
          id: 's1',
          title: 'S',
          questions: [
            { id: 'q', type: 'select_one', name: 'consent_marketplace', label: 'Consent', required: true, choices: 'tf' },
          ],
        },
      ],
      choiceLists: { tf: [{ label: 'True', value: 'true' }, { label: 'False', value: 'false' }] },
    });
    expect(validateFormFidelity(schema).warnings).toHaveLength(1);
  });

  it('ignores non-deduped choice questions (e.g. lga) entirely', () => {
    const schema = makeSchema({
      sections: [
        {
          id: 's1',
          title: 'S',
          questions: [
            { id: 'q', type: 'select_one', name: 'lga', label: 'LGA', required: true, choices: 'lga_list' },
          ],
        },
      ],
      choiceLists: { lga_list: [{ label: 'Saki West', value: 'saki_west' }] },
    });
    expect(validateFormFidelity(schema).warnings).toEqual([]);
  });
});
