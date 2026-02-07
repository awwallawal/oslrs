import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeFormService } from '../native-form.service.js';
import type { NativeFormSchema } from '@oslsr/types';

// ── Mock DB ────────────────────────────────────────────────────────────────

const mockFindFirst = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      questionnaireForms: {
        findFirst: (...args: any[]) => mockFindFirst(...args),
      },
    },
    insert: (...args: any[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: any[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [vArgs[0]]; // Return the values as the "created" row
            },
          };
        },
      };
    },
    update: (...args: any[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: any[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: any[]) => mockWhere(...wArgs),
          };
        },
      };
    },
    transaction: (fn: any) => mockTransaction(fn),
  },
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => '01234567-89ab-7cde-8000-000000000001',
}));

// ── Test Helpers ───────────────────────────────────────────────────────────

function makeValidSchema(overrides?: Partial<NativeFormSchema>): NativeFormSchema {
  return {
    id: '01234567-89ab-7cde-8000-000000000001',
    title: 'Test Form',
    version: '1.0.0',
    status: 'draft',
    sections: [
      {
        id: '01234567-89ab-7cde-8000-000000000002',
        title: 'Section 1',
        questions: [
          {
            id: '01234567-89ab-7cde-8000-000000000003',
            type: 'text',
            name: 'full_name',
            label: 'Full Name',
            required: true,
          },
        ],
      },
    ],
    choiceLists: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default transaction mock — provides tx with same interface as db
  mockTransaction.mockImplementation(async (fn: any) => {
    const tx = {
      insert: (...args: any[]) => {
        mockInsert(...args);
        return {
          values: (...vArgs: any[]) => {
            mockValues(...vArgs);
            return {
              returning: () => {
                mockReturning();
                return [vArgs[0]];
              },
            };
          },
        };
      },
      update: (...args: any[]) => {
        mockUpdate(...args);
        return {
          set: (...sArgs: any[]) => {
            mockSet(...sArgs);
            return {
              where: (...wArgs: any[]) => mockWhere(...wArgs),
            };
          },
        };
      },
    };
    return fn(tx);
  });
});

describe('NativeFormService.createForm', () => {
  it('creates form with isNative: true, status draft', async () => {
    const result = await NativeFormService.createForm(
      { title: 'My Form' },
      'user-123'
    );

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        isNative: true,
        status: 'draft',
        title: 'My Form',
      })
    );
    expect(result).toBeDefined();
  });

  it('generates UUIDv7 id', async () => {
    const result = await NativeFormService.createForm(
      { title: 'ID Test' },
      'user-123'
    );

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '01234567-89ab-7cde-8000-000000000001',
      })
    );
  });
});

describe('NativeFormService.updateFormSchema', () => {
  it('updates JSONB on draft form', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'form-1',
      status: 'draft',
      formSchema: makeValidSchema(),
    });

    const schema = makeValidSchema();
    await NativeFormService.updateFormSchema('form-1', schema, 'user-123');

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        formSchema: schema,
      })
    );
  });

  it('rejects update on published form', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'form-1',
      status: 'published',
      formSchema: makeValidSchema({ status: 'published' }),
    });

    await expect(
      NativeFormService.updateFormSchema(
        'form-1',
        makeValidSchema(),
        'user-123'
      )
    ).rejects.toThrow('Cannot edit a published form');
  });

  it('throws FORM_NOT_FOUND for invalid id', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      NativeFormService.updateFormSchema(
        'nonexistent',
        makeValidSchema(),
        'user-123'
      )
    ).rejects.toThrow('Form not found');
  });
});

describe('NativeFormService.validateForPublish', () => {
  it('valid schema passes', () => {
    const schema = makeValidSchema();
    const result = NativeFormService.validateForPublish(schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('empty sections fails', () => {
    const schema = makeValidSchema({ sections: [] });
    const result = NativeFormService.validateForPublish(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least one section'))).toBe(
      true
    );
  });

  it('invalid choice list reference fails', () => {
    const schema = makeValidSchema({
      sections: [
        {
          id: '01234567-89ab-7cde-8000-000000000002',
          title: 'S1',
          questions: [
            {
              id: '01234567-89ab-7cde-8000-000000000003',
              type: 'select_one',
              name: 'q1',
              label: 'Q1',
              required: true,
              choices: 'nonexistent_list',
            },
          ],
        },
      ],
      choiceLists: {},
    });
    const result = NativeFormService.validateForPublish(schema);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('nonexistent choice list'))
    ).toBe(true);
  });

  it('showWhen referencing nonexistent field fails', () => {
    const schema = makeValidSchema({
      sections: [
        {
          id: '01234567-89ab-7cde-8000-000000000002',
          title: 'S1',
          questions: [
            {
              id: '01234567-89ab-7cde-8000-000000000003',
              type: 'text',
              name: 'q1',
              label: 'Q1',
              required: true,
              showWhen: {
                field: 'ghost_field',
                operator: 'equals',
                value: 'yes',
              },
            },
          ],
        },
      ],
    });
    const result = NativeFormService.validateForPublish(schema);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('nonexistent field'))
    ).toBe(true);
  });
});

describe('NativeFormService.publishForm', () => {
  it('sets status to published, syncs nativePublishedAt', async () => {
    const schema = makeValidSchema();
    mockFindFirst.mockResolvedValue({
      id: 'form-1',
      status: 'draft',
      formSchema: schema,
    });
    const result = await NativeFormService.publishForm('form-1', 'user-123');

    expect(result.success).toBe(true);
    expect(result.publishedAt).toBeDefined();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        nativePublishedAt: expect.any(Date),
      })
    );
  });

  it('rejects already published form', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'form-1',
      status: 'published',
      formSchema: makeValidSchema({ status: 'published' }),
    });

    await expect(
      NativeFormService.publishForm('form-1', 'user-123')
    ).rejects.toThrow('Only draft forms can be published');
  });
});

describe('NativeFormService.getFormSchema', () => {
  it('returns JSONB for valid form', async () => {
    const schema = makeValidSchema();
    mockFindFirst.mockResolvedValue({
      id: 'form-1',
      formSchema: schema,
    });

    const result = await NativeFormService.getFormSchema('form-1');
    expect(result).toEqual(schema);
  });

  it('throws FORM_NOT_FOUND', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      NativeFormService.getFormSchema('nonexistent')
    ).rejects.toThrow('Form not found');
  });
});

describe('NativeFormService.flattenForRender', () => {
  it('flattens nested schema into ordered questions', () => {
    const schema = makeValidSchema({
      sections: [
        {
          id: 's1',
          title: 'Section 1',
          questions: [
            {
              id: 'q1',
              type: 'text',
              name: 'name',
              label: 'Name',
              required: true,
            },
            {
              id: 'q2',
              type: 'select_one',
              name: 'gender',
              label: 'Gender',
              required: true,
              choices: 'gender_list',
            },
          ],
        },
        {
          id: 's2',
          title: 'Section 2',
          questions: [
            {
              id: 'q3',
              type: 'number',
              name: 'age',
              label: 'Age',
              required: true,
            },
          ],
        },
      ],
      choiceLists: {
        gender_list: [
          { label: 'Male', value: 'male' },
          { label: 'Female', value: 'female' },
        ],
      },
    });

    const result = NativeFormService.flattenForRender(schema);

    expect(result.questions).toHaveLength(3);
    expect(result.questions[0]).toEqual(
      expect.objectContaining({
        id: 'q1',
        sectionId: 's1',
        sectionTitle: 'Section 1',
      })
    );
    expect(result.questions[1].choices).toEqual([
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' },
    ]);
    expect(result.questions[2]).toEqual(
      expect.objectContaining({
        id: 'q3',
        sectionId: 's2',
        sectionTitle: 'Section 2',
      })
    );
  });
});
