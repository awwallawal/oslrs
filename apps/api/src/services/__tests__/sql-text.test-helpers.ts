/**
 * Flatten a drizzle SQL object (nested chunks + params) into inspectable text.
 *
 * WHY A TEST NEEDS THIS: a suite that asserts "the right helper was imported"
 * stays green while production divides by the wrong thing — 13-55's lesson, and
 * exactly how Story 12-4 shipped `unemploymentEstimate` still on the coarse
 * denominator with its own tests written and never run. Flattening the SQL lets
 * a test bind the STRUCTURE that will actually reach Postgres.
 *
 * Shared rather than copied: it is used by the totals model's own suite and by
 * `public-insights`, and two drifting copies of the inspector would defeat the
 * point of inspecting.
 */
export function sqlToText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(sqlToText).join(' ');
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('queryChunks' in obj) return sqlToText(obj.queryChunks);
    if ('value' in obj) return sqlToText(obj.value);
    return Object.values(obj).map(sqlToText).join(' ');
  }
  return String(node);
}

/** The same text with all whitespace removed, for formatting-independent matching. */
export const sqlShape = (node: unknown): string => sqlToText(node).replace(/\s+/g, '');
