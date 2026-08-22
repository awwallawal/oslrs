import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { like } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { respondents } from '../../db/schema/index.js';
import {
  getRegistryCountCore,
  deriveVerification,
  REGISTRY_VERIFICATION_TIERS,
  type RegistryVerification,
} from '../registry-totals.service.js';

/**
 * Story 13-46 (AC5) — THE DRIFT GUARD for `VERIFICATION_TIER_SQL`.
 *
 * The Axis-3 rule now exists in two languages: `deriveVerification` (TS, used by 12-4's totals) and
 * `VERIFICATION_TIER_SQL` (SQL, used by the count-core so the public split is one aggregate rather
 * than every respondent row loaded into Node). Two declarations of one taxonomy is precisely the
 * drift 13-33/13-37 exist to kill, and a comment saying "keep these in sync" is not a guard.
 *
 * This asserts they agree over EVERY row in the database — the seeded edge cases below plus
 * whatever else the test DB holds. Change one implementation without the other and this fails.
 */
const REF_PREFIX = '13-46-AX3-';

interface Seed {
  ref: string;
  status: 'active' | 'pending_nin_capture' | 'imported_unverified' | 'nin_unavailable';
  source: 'public' | 'enumerator' | 'imported_itf_supa' | 'imported_association';
  nin: string | null;
  expected: RegistryVerification;
}

/** One row per branch of the precedence, including the ones that are easy to get wrong. */
const SEEDS: Seed[] = [
  { ref: 'plain', status: 'active', source: 'public', nin: null, expected: 'self_declared' },
  { ref: 'nin', status: 'active', source: 'public', nin: '12345678901', expected: 'nin_on_file' },
  { ref: 'pending', status: 'pending_nin_capture', source: 'public', nin: null, expected: 'pending_nin' },
  // ⚠️ THE STALLED PROMOTE: pending_nin_capture WHILE already carrying a NIN. It must read
  // `pending_nin`, not `nin_on_file` — surfacing that state is the point (13-53's seam).
  { ref: 'stalled', status: 'pending_nin_capture', source: 'public', nin: '12345678902', expected: 'pending_nin' },
  { ref: 'impstatus', status: 'imported_unverified', source: 'public', nin: null, expected: 'unverified_import' },
  // Source-prefixed import, ACTIVE status — caught by the LIKE branch, not the status branch.
  { ref: 'impsrc', status: 'active', source: 'imported_itf_supa', nin: null, expected: 'unverified_import' },
  { ref: 'impassoc', status: 'active', source: 'imported_association', nin: null, expected: 'unverified_import' },
  // An import WITH a NIN still reads as an unverified import — provenance beats possession.
  { ref: 'impnin', status: 'active', source: 'imported_itf_supa', nin: '12345678903', expected: 'unverified_import' },
  // Whitespace-only NIN is NOT a NIN (BTRIM in SQL, .trim() in TS — the classic divergence).
  { ref: 'blanknin', status: 'active', source: 'public', nin: '   ', expected: 'self_declared' },
  // ⚠️ review A11 / finding L3 — the seed above is SPACES, the one whitespace class where bare
  // BTRIM (ASCII spaces only) and String.prototype.trim() (all Unicode whitespace) already agreed.
  // The guard passed over its own hole. These three are the classes that actually diverged.
  { ref: 'tabnin', status: 'active', source: 'public', nin: '\t\t', expected: 'self_declared' },
  { ref: 'newlinenin', status: 'active', source: 'public', nin: '\n', expected: 'self_declared' },
  { ref: 'nbspnin', status: 'active', source: 'public', nin: '\u00a0', expected: 'self_declared' },
  { ref: 'ninunavail', status: 'nin_unavailable', source: 'enumerator', nin: null, expected: 'self_declared' },
];

async function cleanup(): Promise<void> {
  await db.delete(respondents).where(like(respondents.referenceCode, `${REF_PREFIX}%`));
}

describe('Axis-3 verification: SQL ↔ TS parity (13-46 AC5) — real DB', () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(respondents).values(
      SEEDS.map((s, i) => ({
        id: uuidv7(),
        referenceCode: `${REF_PREFIX}${s.ref}`,
        firstName: 'Axis',
        lastName: s.ref,
        phoneNumber: `+23480000001${String(i).padStart(2, '0')}`,
        status: s.status,
        source: s.source,
        nin: s.nin,
      })),
    );
  });

  afterAll(cleanup);

  it('the TS atom returns the documented tier for every seeded edge case', () => {
    // Guards the EXPECTATIONS themselves — if this drifts, the parity test below would happily
    // agree on the wrong answer in both languages.
    for (const s of SEEDS) {
      expect(deriveVerification({ nin: s.nin, status: s.status, source: s.source })).toBe(s.expected);
    }
  });

  it('the SQL tier and the TS atom agree on EVERY row in the database', async () => {
    const core = await getRegistryCountCore();

    // Tally the same rows in TypeScript, straight from the stored columns.
    const rows = await db
      .select({
        nin: respondents.nin,
        status: respondents.status,
        source: respondents.source,
      })
      .from(respondents);

    const expected = Object.fromEntries(
      REGISTRY_VERIFICATION_TIERS.map((t) => [t, 0]),
    ) as Record<RegistryVerification, number>;
    for (const r of rows) {
      expected[deriveVerification({ nin: r.nin, status: r.status, source: r.source })] += 1;
    }

    expect(core.byVerification).toEqual(expected);
  });

  it('the tiers PARTITION the headline — they sum to totalRespondents exactly', async () => {
    const core = await getRegistryCountCore();

    const sum = REGISTRY_VERIFICATION_TIERS.reduce((acc, t) => acc + core.byVerification[t], 0);

    // If these ever diverge, the public page would publish a split that does not add up to its own
    // headline — worse than publishing no split at all.
    expect(sum).toBe(core.totalRespondents);
  });

  it('publishes NO `verified` tier — a NIN is captured, never validated (12-4 R1)', async () => {
    const core = await getRegistryCountCore();

    expect(Object.keys(core.byVerification)).not.toContain('verified');
    expect(Object.keys(core.byVerification).sort()).toEqual([...REGISTRY_VERIFICATION_TIERS].sort());
  });
});
