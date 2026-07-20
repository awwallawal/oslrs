/**
 * Parser registry (Story 11-2). Maps the operator-chosen parser name to its
 * implementation. Parser selection is explicit at upload time (never
 * auto-detected) — see story "Why explicit parser selection".
 */

import { parseCsv } from './csv.parser.js';
import { parseXlsx } from './xlsx.parser.js';
import { parsePdfTabular } from './pdf-tabular.parser.js';
import type { ImportParser } from '../../../config/import-sources.js';
import type { ParserFn } from './types.js';

export const PARSERS: Record<ImportParser, ParserFn> = {
  csv: parseCsv,
  xlsx: parseXlsx,
  pdf_tabular: parsePdfTabular,
};

/** Resolve a parser by name; throws if unknown (caller wraps in AppError). */
export function getParser(name: string): ParserFn {
  const parser = PARSERS[name as ImportParser];
  if (!parser) {
    throw new Error(`Unknown parser: ${name}`);
  }
  return parser;
}

export * from './types.js';
