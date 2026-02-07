import { z } from 'zod';
import {
  questionTypes,
  conditionOperators,
  validationTypes,
} from '../native-form.js';

// ── Primitive Schemas ──────────────────────────────────────────────────────

export const choiceSchema = z.object({
  label: z.string().min(1),
  labelYoruba: z.string().optional(),
  value: z.string().min(1),
});

export const validationRuleSchema = z
  .object({
    type: z.enum(validationTypes),
    value: z.union([z.string(), z.number()]),
    message: z.string().min(1),
  })
  .refine(
    (rule) => {
      if (rule.type === 'regex' && typeof rule.value === 'string') {
        try {
          new RegExp(rule.value);
          return true;
        } catch {
          return false;
        }
      }
      return true;
    },
    { message: 'Invalid regex pattern' },
  );

export const conditionSchema = z
  .object({
    field: z.string().min(1),
    operator: z.enum(conditionOperators),
    value: z.union([z.string(), z.number()]).optional(),
  })
  .refine(
    (c) => {
      if (c.operator === 'is_empty' || c.operator === 'is_not_empty') return true;
      return c.value !== undefined;
    },
    { message: 'value is required for comparison operators' },
  );

export const conditionGroupSchema = z
  .object({
    any: z.array(conditionSchema).optional(),
    all: z.array(conditionSchema).optional(),
  })
  .refine((g) => (g.any && g.any.length > 0) || (g.all && g.all.length > 0), {
    message: 'ConditionGroup must have at least one condition in "any" or "all"',
  })
  .refine((g) => !(g.any && g.any.length > 0 && g.all && g.all.length > 0), {
    message: 'ConditionGroup must use either "any" or "all", not both',
  });

/** Accepts either a single Condition or a ConditionGroup */
export const showWhenSchema = z.union([conditionSchema, conditionGroupSchema]);

// ── Composite Schemas ──────────────────────────────────────────────────────

export const questionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(questionTypes),
  name: z.string().min(1),
  label: z.string().min(1),
  labelYoruba: z.string().optional(),
  required: z.boolean(),
  choices: z.string().optional(),
  showWhen: showWhenSchema.optional(),
  validation: z.array(validationRuleSchema).optional(),
});

export const sectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  showWhen: showWhenSchema.optional(),
  questions: z.array(questionSchema),
});

/**
 * Choice list map validated with uniqueness constraint:
 * each list's values must be unique within that list.
 */
export const choiceListsSchema = z.record(
  z.string(),
  z.array(choiceSchema).refine(
    (choices) => {
      const values = choices.map((c) => c.value);
      return new Set(values).size === values.length;
    },
    { message: 'Choice list values must be unique' },
  ),
);

export const nativeFormSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be valid semver (e.g., "1.0.0")'),
    status: z.enum(['draft', 'published', 'closing', 'deprecated', 'archived']),
    sections: z.array(sectionSchema),
    choiceLists: choiceListsSchema,
    createdAt: z.string().datetime(),
    publishedAt: z.string().datetime().optional(),
  })
  .refine(
    (form) => {
      for (const section of form.sections) {
        for (const question of section.questions) {
          if (question.choices && !(question.choices in form.choiceLists)) {
            return false;
          }
        }
      }
      return true;
    },
    { message: 'Question references a nonexistent choice list' },
  );

// ── API Request Schemas ──────────────────────────────────────────────────

export const createNativeFormRequestSchema = z.object({
  title: z.string().min(1).max(200),
  formId: z.string().min(1).max(100).optional(),
});
