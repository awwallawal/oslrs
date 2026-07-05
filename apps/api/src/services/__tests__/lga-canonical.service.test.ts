/**
 * Story 13-16 (AC1/AC6) — `canonicalizeLgaId` resolves a UUID-shaped LGA value
 * (the pre-13-16 public-wizard vocabulary, `lgas.id`) to the canonical slug
 * (`lgas.code`), and passes every non-UUID value through untouched. Real-DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { lgas } from '../../db/schema/index.js';
import { canonicalizeLgaId, UUID_SHAPED_RE, FOSSIL_LGA_ALIASES } from '../lga-canonical.service.js';

describe('canonicalizeLgaId (Story 13-16 AC1)', () => {
  const stamp = Date.now();
  const code = `lga-canon-test-${stamp}`;
  let lgaUuid: string;

  beforeAll(async () => {
    const [row] = await db
      .insert(lgas)
      .values({ code, name: `Canon Test ${stamp}` })
      .returning({ id: lgas.id });
    lgaUuid = row.id;
  }, 30000);

  afterAll(async () => {
    await db.delete(lgas).where(eq(lgas.code, code));
  }, 30000);

  it('resolves a UUID-shaped value to the lgas.code slug', async () => {
    await expect(canonicalizeLgaId(lgaUuid)).resolves.toBe(code);
  });

  it('passes a slug value through untouched (no lookup needed)', async () => {
    await expect(canonicalizeLgaId('ibadan_north')).resolves.toBe('ibadan_north');
    await expect(canonicalizeLgaId(code)).resolves.toBe(code);
  });

  it('passes undefined / empty through untouched', async () => {
    await expect(canonicalizeLgaId(undefined)).resolves.toBeUndefined();
    await expect(canonicalizeLgaId('')).resolves.toBe('');
  });

  it('resolves every retired form-vocabulary alias to its canonical slug (review M3)', async () => {
    // The live published form's lga_list carries these 6 fossils until the
    // 13-14 re-publish; the enumerator write-site must never persist them.
    expect(Object.keys(FOSSIL_LGA_ALIASES)).toHaveLength(6);
    for (const [fossil, canonical] of Object.entries(FOSSIL_LGA_ALIASES)) {
      await expect(canonicalizeLgaId(fossil)).resolves.toBe(canonical);
      // The canonical side must be a fixed point (idempotent re-processing).
      await expect(canonicalizeLgaId(canonical)).resolves.toBe(canonical);
    }
  });

  it('returns an unmatched UUID as-is (never nulls it) for manual review', async () => {
    const orphan = '00000000-0000-7000-8000-000000000999';
    await expect(canonicalizeLgaId(orphan)).resolves.toBe(orphan);
  });

  it('UUID_SHAPED_RE matches full UUIDs only — slugs with dashes stay slugs', () => {
    expect(UUID_SHAPED_RE.test(lgaUuid)).toBe(true);
    expect(UUID_SHAPED_RE.test('lga-egbeda')).toBe(false);
    expect(UUID_SHAPED_RE.test('ibadan_north')).toBe(false);
    // Prefix-only lookalike must NOT match (backfill parity: full shape only).
    expect(UUID_SHAPED_RE.test('0198c2f4-dead-beef')).toBe(false);
  });
});
