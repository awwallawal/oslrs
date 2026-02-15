import { z } from 'zod';
import { modulus11Check } from '@oslsr/utils/src/validation';
import type { ValidationRule } from '@oslsr/types';
import type { FlattenedQuestion } from '../api/form.api';

const regexCache = new Map<string, RegExp | null>();
const schemaCache = new Map<string, z.ZodObject<Record<string, z.ZodTypeAny>>>();

function getCachedRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) {
    return regexCache.get(pattern) ?? null;
  }

  try {
    const regex = new RegExp(pattern);
    regexCache.set(pattern, regex);
    return regex;
  } catch {
    regexCache.set(pattern, null);
    return null;
  }
}

function isEmptyValue(value: unknown): boolean {
  return (
    value == null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function checkRule(rule: ValidationRule, value: unknown): string | undefined {
  const strVal = String(value);
  const numVal = Number(value);

  switch (rule.type) {
    case 'minLength':
      if (strVal.length < Number(rule.value)) return rule.message;
      break;
    case 'maxLength':
      if (strVal.length > Number(rule.value)) return rule.message;
      break;
    case 'min':
      if (Number.isNaN(numVal) || numVal < Number(rule.value)) return rule.message;
      break;
    case 'max':
      if (Number.isNaN(numVal) || numVal > Number(rule.value)) return rule.message;
      break;
    case 'regex': {
      const regex = getCachedRegex(String(rule.value));
      // Fail closed for malformed rule configuration.
      if (!regex) return rule.message;
      if (!regex.test(strVal)) return rule.message;
      break;
    }
    case 'modulus11':
      if (!modulus11Check(strVal)) return rule.message;
      break;
  }

  return undefined;
}

export function validateQuestionValue(
  question: Pick<FlattenedQuestion, 'required' | 'validation'>,
  value: unknown
): string | undefined {
  if (question.required && isEmptyValue(value)) {
    return 'This field is required';
  }

  if (!question.validation || isEmptyValue(value)) {
    return undefined;
  }

  for (const rule of question.validation) {
    const error = checkRule(rule, value);
    if (error) return error;
  }

  return undefined;
}

export function buildDynamicFormSchema(questions: FlattenedQuestion[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const question of questions) {
    shape[question.name] = z.any().superRefine((value, ctx) => {
      const error = validateQuestionValue(question, value);
      if (error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
      }
    });
  }

  return z.object(shape);
}

function getSchemaCacheKey(questions: FlattenedQuestion[]): string {
  return questions
    .map((question) => {
      const validationKey = (question.validation ?? [])
        .map((rule) => `${rule.type}:${String(rule.value)}:${rule.message}`)
        .join('|');
      return `${question.id}:${question.name}:${question.required ? '1' : '0'}:${validationKey}`;
    })
    .join('||');
}

export function getCachedDynamicFormSchema(
  questions: FlattenedQuestion[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const cacheKey = getSchemaCacheKey(questions);
  const cached = schemaCache.get(cacheKey);
  if (cached) return cached;

  const schema = buildDynamicFormSchema(questions);
  schemaCache.set(cacheKey, schema);
  return schema;
}
