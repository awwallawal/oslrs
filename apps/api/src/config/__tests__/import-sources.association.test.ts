/**
 * Association import config — the drift guard between the PAPER form and the MAPPING.
 *
 * ── Why this test reads an HTML file ─────────────────────────────────────────
 * The obvious test is `expect(mapping['Surname']).toBe('lastName')`. That test is
 * worthless: it restates the constant it is testing, so it moves whenever the
 * constant moves and can never catch the failure that actually matters.
 *
 * The failure that matters is DRIFT between two artefacts that live in different
 * worlds — `docs/launch-campaign/association-data-sheet-PRINT.html`, which is the
 * frozen sheet coordinators physically fill and transcribe, and the TypeScript
 * mapping that has to recognise what they typed. `buildParsedRow` matches headers
 * EXACTLY (after a trim); an unmatched header is kept in `raw` and never becomes a
 * canonical field. So a column added to the sheet without being added here does not
 * error, does not warn, and does not fail a dry-run — it silently arrives empty for
 * every row in the batch. With ~8,000 rows that is a column of missing people-data
 * discovered after the import, not before.
 *
 * So this test parses the actual sheet and asserts the mapping covers it. The two
 * artefacts must now change in the same commit, which is the point.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getImportSourceConfig, isImportableSource, resolveColumnMapping } from '../import-sources.js';
import { CANONICAL_FIELDS } from '../../services/import/parsers/types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEET = resolve(HERE, '../../../../../docs/launch-campaign/association-data-sheet-PRINT.html');

/** The sheet's `<th>` cells, whitespace-flattened the way a transcriber would type them. */
function sheetHeaders(): string[] {
  const html = readFileSync(SHEET, 'utf8');
  const out: string[] = [];
  for (const m of html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)) {
    const text = m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return out;
}

/**
 * `Gender(M/F)` on the page becomes `Gender (M/F)` once the line break is a space.
 * Normalise the space BEFORE a bracket so the comparison is about columns, not CSS.
 */
const tidy = (h: string) => h.replace(/\s*\(/g, ' (').replace(/\s+/g, ' ').trim();

/** Sheet-local, not respondent data — see the config comment on why it is unmapped. */
const NOT_RESPONDENT_DATA = new Set(['S/N']);

describe('imported_association config', () => {
  it('is registered, so the importer can resolve it at all', () => {
    // Before this config existed, `resolveColumnMapping` threw `Unknown import
    // source` and the association route was dead on arrival.
    expect(isImportableSource('imported_association')).toBe(true);
    expect(getImportSourceConfig('imported_association')?.source).toBe('imported_association');
    expect(() => resolveColumnMapping('imported_association')).not.toThrow();
  });

  it('the print sheet is where the headers come from, and it is readable', () => {
    // If the sheet moves or is renamed, fail HERE with a clear cause rather than
    // letting every assertion below pass vacuously over an empty header list.
    const headers = sheetHeaders();
    expect(headers.length).toBeGreaterThanOrEqual(10);
    expect(headers.map(tidy)).toContain('Surname');
  });

  it('⭐ maps EVERY respondent-data column on the frozen sheet', () => {
    const mapping = resolveColumnMapping('imported_association');
    const missing = sheetHeaders()
      .map(tidy)
      .filter((h) => !NOT_RESPONDENT_DATA.has(h))
      .filter((h) => !(h in mapping));

    // A column on the paper form with no mapping imports as blank for every row,
    // with no error and no warning. Name it rather than counting it.
    expect(missing).toEqual([]);
  });

  it('does not map S/N to an identifier', () => {
    // Every sheet has a row 1, so `S/N` as `externalReferenceId` would collide
    // across batches and make distinct people look like the same person.
    const mapping = resolveColumnMapping('imported_association');
    expect(mapping['S/N']).toBeUndefined();
  });

  it('targets only real canonical fields', () => {
    const mapping = resolveColumnMapping('imported_association');
    const bad = Object.entries(mapping).filter(([, f]) => !CANONICAL_FIELDS.includes(f));
    expect(bad).toEqual([]);
  });

  it('carries the identity and consent columns the confirm step depends on', () => {
    // Dedup keys are `phoneNumber` OR `nin`; a batch mapping neither would be
    // undedupable, which is how the same person gets imported twice.
    const targets = new Set(Object.values(resolveColumnMapping('imported_association')));
    expect(targets.has('phoneNumber')).toBe(true);
    expect(targets.has('nin')).toBe(true);
    expect(targets.has('consent')).toBe(true);
    expect(targets.has('lgaId')).toBe(true);
  });

  it('refuses an admin-supplied mapping', () => {
    // The sheet is frozen, so the mapping is fixed. Allowing an operator to
    // re-point columns at upload time would let one batch redefine what
    // "Trade / primary skill" means, which no later reader could detect.
    const config = getImportSourceConfig('imported_association');
    expect(config?.allowAdminMapping).toBe(false);
    expect(resolveColumnMapping('imported_association', { Surname: 'firstName' })).not.toMatchObject({
      Surname: 'firstName',
    });
  });
});
