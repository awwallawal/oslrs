/**
 * Story 13-2 R-A2 — how a detection with no enumerator renders.
 *
 * ⭐ WHY THIS TEST EXISTS. R-A2 made `fraud_detections.enumerator_id` nullable so
 * imported rows could be scored at all, and converted the API's `innerJoin(users)`
 * to a LEFT JOIN so those detections are not silently dropped from every listing.
 * That left one last place for the same defect to hide: the table typed
 * `enumeratorName: string` and rendered it raw, so an imported detection would have
 * shown a blank cell and an aria-label reading "Select null".
 *
 * The whole story is about fixes that do not fire where they execute. A detection
 * that reaches the screen unreadable is that same failure, one layer further on.
 */

import { describe, it, expect } from 'vitest';
import { fraudSubjectLabel } from '../fraud.api';

describe('fraudSubjectLabel', () => {
  it('uses the enumerator name for a field detection', () => {
    expect(fraudSubjectLabel({ enumeratorName: 'Adewale Johnson', importBatchId: null }))
      .toBe('Adewale Johnson');
  });

  /**
   * ⛔ NOT "Unknown". The subject is not unknown — it is a different KIND of
   * subject, and the reviewer has to know that before choosing a resolution: the
   * options include "warn enumerator" and "suspend enumerator", neither of which
   * means anything for an import.
   */
  it('names the import batch when there is no enumerator', () => {
    expect(fraudSubjectLabel({ enumeratorName: null, importBatchId: 'batch-1' }))
      .toBe('Imported batch');
  });

  it('never renders the string "null" (the defect this replaces)', () => {
    const label = fraudSubjectLabel({ enumeratorName: null, importBatchId: 'batch-1' });
    expect(label).not.toContain('null');
    expect(label.trim()).not.toBe('');
  });

  /** Neither an enumerator nor a batch is a data problem, and says so plainly. */
  it('falls back to Unattributed when there is neither', () => {
    expect(fraudSubjectLabel({ enumeratorName: null })).toBe('Unattributed');
  });

  it('treats an empty enumerator name as absent rather than rendering blank', () => {
    expect(fraudSubjectLabel({ enumeratorName: '', importBatchId: 'batch-1' }))
      .toBe('Imported batch');
  });
});
