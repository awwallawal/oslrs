import type { Condition, ConditionGroup, NativeFormSchema } from '@oslsr/types';

/**
 * Evaluates a single condition against form data.
 */
export function evaluateCondition(
  condition: Condition,
  formData: Record<string, any>
): boolean {
  const fieldValue = formData[condition.field];
  const condValue = condition.value;

  switch (condition.operator) {
    case 'equals':
      // eslint-disable-next-line eqeqeq
      return fieldValue == condValue;

    case 'not_equals':
      // eslint-disable-next-line eqeqeq
      return fieldValue != condValue;

    case 'greater_than': {
      const num = Number(fieldValue);
      const target = Number(condValue);
      if (isNaN(num) || isNaN(target)) return false;
      return num > target;
    }

    case 'greater_or_equal': {
      const num = Number(fieldValue);
      const target = Number(condValue);
      if (isNaN(num) || isNaN(target)) return false;
      return num >= target;
    }

    case 'less_than': {
      const num = Number(fieldValue);
      const target = Number(condValue);
      if (isNaN(num) || isNaN(target)) return false;
      return num < target;
    }

    case 'less_or_equal': {
      const num = Number(fieldValue);
      const target = Number(condValue);
      if (isNaN(num) || isNaN(target)) return false;
      return num <= target;
    }

    case 'is_empty':
      return fieldValue == null || fieldValue === '';

    case 'is_not_empty':
      return fieldValue != null && fieldValue !== '';

    default:
      return false;
  }
}

/**
 * Evaluates a condition group (AND/OR) against form data.
 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  formData: Record<string, any>
): boolean {
  if (group.any) {
    return group.any.some((c) => evaluateCondition(c, formData));
  }
  if (group.all) {
    return group.all.every((c) => evaluateCondition(c, formData));
  }
  return false;
}

/**
 * Unified entry point: evaluates either a single Condition or a ConditionGroup.
 * Discriminates by checking for the `field` property (Condition) vs `any`/`all` (ConditionGroup).
 */
export function evaluateShowWhen(
  showWhen: Condition | ConditionGroup,
  formData: Record<string, any>
): boolean {
  if ('field' in showWhen) {
    return evaluateCondition(showWhen as Condition, formData);
  }
  return evaluateConditionGroup(showWhen as ConditionGroup, formData);
}

/**
 * Returns IDs of visible questions given a schema and current form data.
 * Sections with a failing showWhen hide all their questions.
 */
export function getVisibleQuestions(
  schema: NativeFormSchema,
  formData: Record<string, any>
): string[] {
  const visible: string[] = [];

  for (const section of schema.sections) {
    if (section.showWhen && !evaluateShowWhen(section.showWhen, formData)) {
      continue;
    }
    for (const question of section.questions) {
      if (question.showWhen && !evaluateShowWhen(question.showWhen, formData)) {
        continue;
      }
      visible.push(question.id);
    }
  }

  return visible;
}

/**
 * Parses a single atomic XLSForm relevance expression like `${field} = 'value'`.
 */
function parseAtomicExpression(expr: string): Condition {
  const trimmed = expr.trim();

  // Match: ${field} operator value
  const match = trimmed.match(
    /^\$\{([^}]+)\}\s*(>=|<=|!=|>|<|=)\s*(.+)$/
  );

  if (!match) {
    throw new Error(`Cannot parse XLSForm relevance expression: "${trimmed}"`);
  }

  const [, field, op, rawValue] = match;

  const operatorMap: Record<string, Condition['operator']> = {
    '=': 'equals',
    '!=': 'not_equals',
    '>': 'greater_than',
    '>=': 'greater_or_equal',
    '<': 'less_than',
    '<=': 'less_or_equal',
  };

  const operator = operatorMap[op];
  if (!operator) {
    throw new Error(`Unknown operator "${op}" in expression: "${trimmed}"`);
  }

  // Strip quotes for string values, parse numbers for numeric values
  let value: string | number;
  const strMatch = rawValue.trim().match(/^'([^']*)'$/);
  if (strMatch) {
    value = strMatch[1];
  } else {
    const num = Number(rawValue.trim());
    if (isNaN(num)) {
      throw new Error(`Cannot parse value "${rawValue.trim()}" in expression: "${trimmed}"`);
    }
    value = num;
  }

  return { field, operator, value };
}

/**
 * Parses an XLSForm relevance string into a native Condition or ConditionGroup.
 *
 * Supports:
 * - Simple: `${consent_basic} = 'yes'`
 * - OR: `${a} = 'x' or ${b} = 'y'`
 * - AND: `${a} = 'x' and ${b} = 'y'`
 * - Numeric comparisons: `${age} >= 15`
 */
export function parseXlsformRelevance(expression: string): Condition | ConditionGroup {
  const trimmed = expression.trim();

  if (!trimmed) {
    throw new Error('Empty XLSForm relevance expression');
  }

  // Check for OR expressions (split on ` or `)
  const orParts = trimmed.split(/\s+or\s+/);
  if (orParts.length > 1) {
    return { any: orParts.map(parseAtomicExpression) };
  }

  // Check for AND expressions (split on ` and `)
  const andParts = trimmed.split(/\s+and\s+/);
  if (andParts.length > 1) {
    return { all: andParts.map(parseAtomicExpression) };
  }

  // Single condition
  return parseAtomicExpression(trimmed);
}
