import { describe, it, expect } from 'vitest';
import { REGISTRY_UNIFIED_SQL_TEXT } from '../registry-unified.js';

/**
 * Story 13-33 AC4 — the ingestion contract (respondent + submission.raw_data).
 *
 * The READ side is guarded by the real-DB smoke (submission-less rows are
 * included; answer-bearing rows carry raw_data). This file pins the contract's
 * design and marks the WRITE-side obligation for the not-yet-built association
 * importer as an executable TODO so it can't be forgotten.
 *
 * See docs/registry-unified-ingestion-contract.md.
 */
describe('registry ingestion contract (AC4)', () => {
  it('the read is respondent-anchored, so a respondent-only import is COUNTED (never dropped)', () => {
    // Anchoring FROM respondents is what makes a submission-less import visible
    // as a registered person; a submission-anchored read would drop it.
    expect(REGISTRY_UNIFIED_SQL_TEXT).toMatch(/FROM\s+respondents\s+r/i);
  });

  // WRITE-side obligation for source #3. When the association importer lands it
  // MUST write a respondent AND a submission(raw_data with skills/sector), so
  // association members appear in marketplace/insights — not just as a headcount.
  // Implement this test (drive the importer, assert both rows) with the importer.
  it.todo('association importer writes respondent + submission(raw_data with skills/sector)');
});
