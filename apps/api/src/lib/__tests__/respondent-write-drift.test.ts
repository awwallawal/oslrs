/**
 * Story 13-54 — respondent-write drift guard, detector unit tests.
 *
 * These pin the four behaviours AC1/AC2 are actually about:
 *   1. a sanctioned (allow-listed) creation site passes,
 *   2. an un-sanctioned `insert(respondents)` fails — builder AND raw SQL,
 *   3. an escape hatch WITHOUT a reason fails (AC2.2),
 *   4. a fixture path is never scanned (so the allowlist stays a reviewable
 *      list of four production sites, not 35 test files).
 *
 * The RED-verify question for every test here: *would this fail if I deleted
 * the guard?* Tests that only assert the safe outcome are the hole this repo
 * has been bitten by before ([[pattern-test-that-passes-over-a-hole]]).
 */
import { describe, it, expect } from 'vitest';
import {
  findDriftHits,
  formatHits,
  isScannablePath,
  ALLOWLIST,
  ESCAPE_HATCH_TOKEN,
  MIN_REASON_CHARS,
  type DriftFile,
} from '../respondent-write-drift.js';

/** Drizzle builder-form creation, as written in the real callers. */
const BUILDER_INSERT = `
const [created] = await db.insert(respondents).values({
  ninHash,
  status: 'active',
}).returning();
`;

/** Raw-SQL creation, as written in the seeds. */
const RAW_INSERT = `
await db.execute(sql\`
  INSERT INTO respondents (id, status, source, created_at)
  VALUES (\${id}, 'active', 'seed', NOW())
\`);
`;

function file(path: string, content: string): DriftFile {
  return { path, content };
}

describe('respondent-write drift detector', () => {
  describe('AC1.2 — detects un-sanctioned respondent creation', () => {
    it('flags a builder-form insert(respondents) outside the allowlist', () => {
      const hits = findDriftHits([file('src/services/new-ingest.service.ts', BUILDER_INSERT)]);

      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({
        file: 'src/services/new-ingest.service.ts',
        rule: 'unsanctioned-respondent-insert',
      });
      expect(hits[0]?.line).toBeGreaterThan(0);
    });

    it('flags a raw INSERT INTO respondents outside the allowlist', () => {
      const hits = findDriftHits([file('src/services/new-ingest.service.ts', RAW_INSERT)]);

      expect(hits).toHaveLength(1);
      expect(hits[0]?.rule).toBe('unsanctioned-respondent-raw-insert');
    });

    it('flags the double-quoted raw spelling too', () => {
      const quoted = RAW_INSERT.replace('INTO respondents', 'INTO "respondents"');
      const hits = findDriftHits([file('src/services/new-ingest.service.ts', quoted)]);

      expect(hits).toHaveLength(1);
      expect(hits[0]?.rule).toBe('unsanctioned-respondent-raw-insert');
    });

    it('flags a transaction-scoped insert — tx.insert, not just db.insert', () => {
      const viaTx = BUILDER_INSERT.replace('db.insert', 'tx.insert');
      const hits = findDriftHits([file('src/services/new-ingest.service.ts', viaTx)]);

      expect(hits).toHaveLength(1);
    });

    /**
     * ⚠️ REVIEW H1/M4 (2026-08-08) — THE SPELLINGS THE ORIGINAL RULES MISSED.
     *
     * The first RED-verify used the two spellings the two regexes were written
     * for, so it could only ever confirm what the author already believed. A
     * probe file carrying these six was then dropped into `src/services/` and
     * the guard COUNTED IT AND REPORTED GREEN. Each case below is one of those
     * six. They are `it.each` rather than prose because the failure mode is a
     * rename, and a rename is cheap: the guard has to fail on the SHAPE of the
     * call, not on the identifier the author happened to choose.
     */
    it.each([
      ['namespaced import — `import * as schema` is used at db/index.ts:3', 'db.insert(schema.respondents)'],
      ['aliased import — the ordinary Drizzle idiom', 'db.insert(respondentsTable)'],
      ['a cast between the parens', 'db.insert(respondents as never)'],
      ['multi-line call with a trailing comma', 'db\n  .insert(\n    respondents,\n  )'],
    ])('flags a creation that evades a bare-identifier rule: %s', (_label, call) => {
      const hits = findDriftHits([file('src/services/new-ingest.service.ts', `${call}.values({}).returning();`)]);

      expect(hits).toHaveLength(1);
      expect(hits[0]?.rule).toBe('unsanctioned-respondent-insert');
    });

    it.each([
      ['schema-qualified raw SQL', 'INSERT INTO public.respondents (id) VALUES (1)'],
      ['quoted schema-qualified raw SQL', 'INSERT INTO "public"."respondents" (id) VALUES (1)'],
    ])('flags raw creation that evades an unqualified rule: %s', (_label, statement) => {
      const hits = findDriftHits([
        file('src/services/new-ingest.service.ts', `await db.execute(sql\`${statement}\`);`),
      ]);

      expect(hits).toHaveLength(1);
      expect(hits[0]?.rule).toBe('unsanctioned-respondent-raw-insert');
    });

    it('does NOT flag an insert into a different table', () => {
      const other = BUILDER_INSERT.replace('respondents', 'submissions');
      expect(findDriftHits([file('src/services/new-ingest.service.ts', other)])).toEqual([]);
    });

    it('does NOT flag prose describing the pattern in a comment', () => {
      const comment = `
// Historically this file called db.insert(respondents) directly; it now routes
// through the chokepoint instead. See Story 13-54.
const x = 1;
`;
      expect(findDriftHits([file('src/services/some.service.ts', comment)])).toEqual([]);
    });
  });

  describe('AC1.3 — the sanctioned set is an allowlist with a reason per entry', () => {
    it('permits every allow-listed production site', () => {
      const sanctioned: DriftFile[] = [
        file('src/services/submission-processing.service.ts', BUILDER_INSERT),
        file('src/controllers/registration.controller.ts', BUILDER_INSERT),
        file('src/services/import.service.ts', BUILDER_INSERT),
        file('src/db/seed-projected-scale.ts', RAW_INSERT),
      ];

      expect(findDriftHits(sanctioned)).toEqual([]);
    });

    it('carries exactly four entries, and NONE without a reason', () => {
      expect(ALLOWLIST).toHaveLength(4);
      for (const entry of ALLOWLIST) {
        expect(entry.reason.trim().length).toBeGreaterThanOrEqual(20);
      }
    });

    it('matches allowlist paths identically with Windows separators', () => {
      const windowsPath = 'src\\services\\import.service.ts';
      expect(findDriftHits([file(windowsPath, BUILDER_INSERT)])).toEqual([]);
    });
  });

  describe('AC2.2 — the escape hatch must carry a reason', () => {
    it('suppresses when annotated with a sufficient reason', () => {
      const annotated = `
// ${ESCAPE_HATCH_TOKEN}: fixture builder for the identity-guard regression suite
${BUILDER_INSERT}
`;
      expect(findDriftHits([file('src/services/new-ingest.service.ts', annotated)])).toEqual([]);
    });

    it('FAILS when annotated without a reason, and still names what was suppressed', () => {
      const bare = `
// ${ESCAPE_HATCH_TOKEN}: ok
${BUILDER_INSERT}
`;
      const hits = findDriftHits([file('src/services/new-ingest.service.ts', bare)]);

      expect(hits).toHaveLength(1);
      expect(hits[0]?.rule).toBe('escape-hatch-missing-reason');
      expect(hits[0]?.suppressedRule).toBe('unsanctioned-respondent-insert');
    });

    it('rejects a reason shorter than MIN_REASON_CHARS', () => {
      const short = 'x'.repeat(MIN_REASON_CHARS - 1);
      const annotated = `
// ${ESCAPE_HATCH_TOKEN}: ${short}
${BUILDER_INSERT}
`;
      expect(findDriftHits([file('src/services/new-ingest.service.ts', annotated)])).toHaveLength(1);
    });

    /**
     * Review L1 — one annotation used to suppress every hit within three lines
     * below it, so a justified creation could silently cover an unjustified one
     * that happened to land next to it. The lookback now stops at the first line
     * of real code.
     */
    it('does not let one annotation cover a SECOND, unrelated creation below it', () => {
      const twoCalls = `
// ${ESCAPE_HATCH_TOKEN}: the migration back-fill documented in Story 13-54
await db.insert(respondents).values(a);
await db.insert(respondents).values(b);
`;
      const hits = findDriftHits([file('src/services/new-ingest.service.ts', twoCalls)]);

      expect(hits).toHaveLength(1);
      expect(hits[0]?.rule).toBe('unsanctioned-respondent-insert');
      // The SECOND call is the one still blocked; the annotated one is cleared.
      expect(hits[0]?.snippet).toContain('values(b)');
    });

    it('honours a trailing annotation on the hit line itself', () => {
      const inline = `await db.insert(respondents).values(a); // ${ESCAPE_HATCH_TOKEN}: one-off repair for OSL-2026-56C9PG\n`;
      expect(findDriftHits([file('src/services/new-ingest.service.ts', inline)])).toEqual([]);
    });

    it('ignores the token when it is NOT in comment position', () => {
      const inString = `
const msg = "${ESCAPE_HATCH_TOKEN}: this is data, not a reviewable decision";
${BUILDER_INSERT}
`;
      const hits = findDriftHits([file('src/services/new-ingest.service.ts', inString)]);
      expect(hits).toHaveLength(1);
      expect(hits[0]?.rule).toBe('unsanctioned-respondent-insert');
    });
  });

  describe('fixtures are skipped by RULE, not by allowlist entry', () => {
    it.each([
      'src/services/__tests__/foo.service.test.ts',
      'src/db/schema/__tests__/respondents.constraints.test.ts',
      'scripts/__tests__/blast-cohort-dedupe.integration.test.ts',
      'src/lib/thing.spec.ts',
      'src/types/generated.d.ts',
      'node_modules/pkg/index.ts',
      'dist/bundle.ts',
      // Review L2 — the fixture rules have to follow the new extensions.
      'src/services/__tests__/foo.test.tsx',
      'src/lib/thing.spec.tsx',
      'src/types/generated.d.mts',
      'src/services/notes.md',
    ])('%s is not scannable', (path) => {
      expect(isScannablePath(path)).toBe(false);
    });

    it.each([
      'src/services/import.service.ts',
      'src/controllers/registration.controller.ts',
      'scripts/_backfill-name-canonicalization.ts',
      // Review L2 — a creation site in one of these used to be invisible.
      'src/services/new-ingest.service.mts',
      'src/services/new-ingest.service.cts',
      'src/components/AdminRespondentForm.tsx',
    ])('%s IS scannable', (path) => {
      expect(isScannablePath(path)).toBe(true);
    });

    it('treats Windows separators the same way', () => {
      expect(isScannablePath('src\\services\\__tests__\\foo.test.ts')).toBe(false);
      expect(isScannablePath('src\\services\\import.service.ts')).toBe(true);
    });
  });

  describe('AC2.1 — the message teaches', () => {
    const hits = findDriftHits([file('src/services/new-ingest.service.ts', BUILDER_INSERT)]);
    const message = formatHits(hits);

    it('names the file and line', () => {
      expect(message).toContain('src/services/new-ingest.service.ts:');
    });

    it('states why in one sentence — two records for one citizen', () => {
      expect(message).toMatch(/two records/i);
      expect(message).toMatch(/identity guard/i);
    });

    it('gives the escape hatch WITH the reason requirement', () => {
      expect(message).toContain(ESCAPE_HATCH_TOKEN);
      expect(message).toMatch(new RegExp(`${MIN_REASON_CHARS}`));
    });

    it('says CREATION and hands updates to 13-55 (D4 — the title overclaims)', () => {
      expect(message).toMatch(/creation/i);
      expect(message).toContain('13-55');
      expect(message).toMatch(/update\(respondents\)/);
    });

    it('returns empty string for zero hits so success prints nothing', () => {
      expect(formatHits([])).toBe('');
    });
  });
});
