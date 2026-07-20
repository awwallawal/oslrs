/**
 * Story 13-16 (AC1/AC6) — `canonicalizeLgaId` resolves a UUID-shaped LGA value
 * (the pre-13-16 public-wizard vocabulary, `lgas.id`) to the canonical slug
 * (`lgas.code`), and passes every non-UUID value through untouched. Real-DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { lgas } from '../../db/schema/index.js';
import { OYO_STATE_LGAS } from '../../db/seeds/lgas.seed.js';
import {
  canonicalizeLgaId,
  UUID_SHAPED_RE,
  FOSSIL_LGA_ALIASES,
  buildLgaLabelResolver,
} from '../lga-canonical.service.js';

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

describe('buildLgaLabelResolver (Story 11-2 code-review L1) — pure, no DB', () => {
  const rows = OYO_STATE_LGAS.map((l) => ({ code: l.code, name: l.name }));
  const resolve = buildLgaLabelResolver(rows);

  it('resolves the canonical name and slug exactly', () => {
    expect(resolve('Ibadan North-East').code).toBe('ibadan_north_east');
    expect(resolve('ibadan_north_east').code).toBe('ibadan_north_east');
    expect(resolve('Egbeda').code).toBe('egbeda');
  });

  it('resolves structural variants (case / hyphen / space / underscore)', () => {
    for (const v of ['IBADAN NORTH EAST', 'ibadan north-east', 'Ibadan_North_East', '  ibadan   north   east ']) {
      expect(resolve(v).code).toBe('ibadan_north_east');
    }
  });

  it('resolves spaceless and re-spaced forms of two-word LGAs', () => {
    expect(resolve('Onaara').code).toBe('ona_ara');
    expect(resolve('Ona Ara').code).toBe('ona_ara');
    expect(resolve('ORI IRE').code).toBe('ori_ire');
    expect(resolve('Ogooluwa').code).toBe('ogo_oluwa');
  });

  it('resolves the Ogbomosho/Ogbomoso (silent-h) + Saki/Shaki spelling aliases', () => {
    expect(resolve('Ogbomoso North').code).toBe('ogbomosho_north');
    expect(resolve('Ogbomosho North').code).toBe('ogbomosho_north');
    expect(resolve('Shaki West').code).toBe('saki_west');
    expect(resolve('Saki West').code).toBe('saki_west');
  });

  it('resolves directional abbreviations (NE/NW/SE/SW, with or without dots)', () => {
    expect(resolve('Ibadan NE').code).toBe('ibadan_north_east');
    expect(resolve('Ibadan N.E.').code).toBe('ibadan_north_east');
    expect(resolve('Ibadan SW').code).toBe('ibadan_south_west');
  });

  it('returns null + warning for genuinely non-Oyo-LGA text (honest, not guessed)', () => {
    expect(resolve('Lagos Mainland')).toEqual({ code: null, warning: 'unresolved_lga' });
    expect(resolve('N/A').code).toBeNull();
    expect(resolve('   ').code).toBeNull();
  });

  it('never maps an alias to a slug absent from the supplied rows', () => {
    // A minimal row set without Saki must not resolve the Shaki alias.
    const tiny = buildLgaLabelResolver([{ code: 'egbeda', name: 'Egbeda' }]);
    expect(tiny('Shaki West').code).toBeNull();
    expect(tiny('Egbeda').code).toBe('egbeda');
  });
});
