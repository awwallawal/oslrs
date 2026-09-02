import { describe, it, expect } from 'vitest';
import { REGISTRY_UNIFIED_SQL_TEXT } from '../registry-unified.js';
import { buildImportRawData } from '../import/submission-payload.js';

/**
 * Story 13-33 AC4 — the ingestion contract (respondent + submission.raw_data).
 *
 * The READ side is guarded by the real-DB smoke (submission-less rows are
 * included; answer-bearing rows carry raw_data). This file pins the contract's
 * design and -- since 2026-09-02 -- the WRITE-side obligation for source #3,
 * which sat here as an executable `it.todo` from 13-33 until the importer
 * existed. It was not idle: the gap it named was real, and shipped.
 *
 * See docs/registry-unified-ingestion-contract.md.
 */
describe('registry ingestion contract (AC4)', () => {
  it('the read is respondent-anchored, so a respondent-only import is COUNTED (never dropped)', () => {
    // Anchoring FROM respondents is what makes a submission-less import visible
    // as a registered person; a submission-anchored read would drop it.
    expect(REGISTRY_UNIFIED_SQL_TEXT).toMatch(/FROM\s+respondents\s+r/i);
  });

  /*
   * ⭐ THE WRITE-SIDE OBLIGATION, no longer a TODO (Story 13-2 AC3.4, 2026-09-02).
   *
   * This sat as `it.todo` from 13-33 until the importer existed, and the gap it
   * marked was real: the confirm path wrote a `respondents` row and NO
   * `submissions` row, so imported people were counted by `totalRegistered` and
   * the LGA map (both respondent-anchored) while contributing nothing to
   * `genderSplit`, `gpi`, `allSkills` or `skillsByLga` — all of which read
   * `raw_data`. Counted, but not describable.
   *
   * Asserted here against the PAYLOAD BUILDER rather than a live DB, because the
   * two things that actually break are both shape decisions, and both are
   * invisible to a green integration test that only checks a row exists:
   *   - `skills_possessed` must be an ARRAY OF SLUGS. `selectMultipleUnnest`
   *     treats an array as canonical and splits a bare string on SPACES, so the
   *     raw trade "Crop Farming" would unnest to the junk tokens "Crop" and
   *     "Farming" and cluster under neither.
   *   - `gender` must be exactly `male`/`female`, because every public query
   *     matches those literals. The real sheets carry `M`/`F`.
   * The end-to-end "both rows exist" half is covered by the import service suite.
   */
  it('the importer payload carries skills as an ARRAY OF SLUGS, not raw trade text', () => {
    const raw = buildImportRawData({ profession: 'Crop Farming' });
    expect(raw.skills_possessed).toEqual(['farming']);
    // Guard the exact failure above: a space-delimited scalar would unnest wrong.
    expect(Array.isArray(raw.skills_possessed)).toBe(true);
    expect(raw.trade_raw).toBe('Crop Farming'); // what they wrote survives too
    expect(raw.skill_basis).toBe('taxonomy_label');
  });

  it('the importer payload speaks the gender vocabulary the public queries match', () => {
    // M/F copied through unchanged would make the entire import invisible to
    // genderSplit and the GPI — present in the JSONB, counted by nothing.
    expect(buildImportRawData({ gender: 'M' }).gender).toBe('male');
    expect(buildImportRawData({ gender: 'F' }).gender).toBe('female');
    // Unreadable gender is ABSENT, never guessed into one side of a published
    // parity index.
    expect(buildImportRawData({ gender: 'x' }).gender).toBeUndefined();
    expect(buildImportRawData({}).gender).toBeUndefined();
  });

  it('an unresolvable trade still yields a payload — the person is never dropped', () => {
    // Losing a real person to keep a chart tidy inverts the point of the registry.
    const raw = buildImportRawData({ profession: 'Astronaut', gender: 'F' });
    expect(raw.skills_possessed).toBeUndefined();
    expect(raw.skill_basis).toBe('unmapped');
    expect(raw.trade_raw).toBe('Astronaut'); // auditable, and re-resolvable later
    expect(raw.gender).toBe('female'); // the rest of the row is unaffected
  });

  it('marks itself as import-derived, so it is never mistaken for field collection', () => {
    // Axis-1 provenance lives on `respondents.source`, but a reader holding only
    // the submission needs to know these answers were transcribed, not asked.
    expect(buildImportRawData({}).ingest_channel).toBe('import');
  });
});
