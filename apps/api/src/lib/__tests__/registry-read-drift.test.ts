import { describe, it, expect } from 'vitest';
import {
  findDriftHits,
  formatHits,
  ALLOWLIST,
  REGISTRY_FACT_MODULES,
  ESCAPE_HATCH_TOKEN,
  type DriftFile,
} from '../registry-read-drift.js';
import { REGISTRY_UNIFIED_SQL_TEXT } from '../../services/registry-unified.sql.js';

/**
 * Story 13-37 — the registry-read drift guard.
 *
 * Fixtures are in-memory `DriftFile`s so the core is testable without touching
 * the filesystem (the CLI runner does the I/O). NOTE: this file lives under
 * `__tests__/`, which the runner excludes from its scan — the drift shapes
 * below are fixtures, not real reads, and must never trip the guard on itself.
 */

/** Retired shape (a): the submission-anchored registry read 13-33 deleted from public-insights. */
const SUBMISSION_ANCHORED = `
  const rows = await db.execute(sql\`
    SELECT COALESCE(l.name, r.lga_id, 'Unknown') AS label, COUNT(*) AS count
    FROM submissions s
    LEFT JOIN respondents r ON r.id = s.respondent_id
    LEFT JOIN lgas l ON l.code = r.lga_id
    WHERE s.raw_data IS NOT NULL
    GROUP BY label
  \`);
`;

/** Retired shape (b): a hand-rolled copy of the canonical latest-non-empty LATERAL. */
const HAND_ROLLED_LATERAL = `
  const rows = await db.execute(sql\`
    SELECT r.id, answers.raw_data
    FROM respondents r
    LEFT JOIN LATERAL (
      SELECT sx.raw_data
      FROM submissions sx
      WHERE sx.respondent_id = r.id
        AND sx.raw_data IS NOT NULL
      ORDER BY sx.submitted_at DESC NULLS LAST
      LIMIT 1
    ) answers ON true
  \`);
`;

/** The sanctioned way — compose the canonical source. */
const CANONICAL_COMPOSED = `
  import { registryUnifiedSource } from './registry-unified.js';

  const rows = await db.execute(sql\`
    SELECT COUNT(*)::int AS total_respondents
    FROM \${registryUnifiedSource('ru')}
    WHERE ru.lga_id IS NOT NULL
  \`);
`;

/** Legitimate submission-grain analytics — identical JOIN text, different question. */
const SUBMISSION_GRAIN_ANALYTICS = `
  const rows = await db.execute(sql\`
    SELECT s.raw_data->>'gender' AS label, COUNT(*) AS count
    FROM submissions s
    LEFT JOIN respondents r ON r.id = s.respondent_id
    WHERE s.processed = true
    GROUP BY label
  \`);
`;

const file = (path: string, content: string): DriftFile => ({ path, content });

describe('registry-read-drift guard (Story 13-37)', () => {
  describe('AC1 — catches the retired shapes', () => {
    it('FAILS a submission-anchored registry read in a registry-fact module', () => {
      const hits = findDriftHits([
        file('src/services/public-insights.service.ts', SUBMISSION_ANCHORED),
      ]);

      expect(hits).toHaveLength(1);
      expect(hits[0].rule).toBe('submission-anchored-registry-read');
      expect(hits[0].file).toBe('src/services/public-insights.service.ts');
      expect(hits[0].line).toBe(4); // `FROM submissions` line of the fixture
      expect(hits[0].snippet).toContain('FROM submissions');
    });

    it('FAILS a submission-anchored read in any registry-*.ts module', () => {
      const hits = findDriftHits([
        file('src/services/registry-totals.service.ts', SUBMISSION_ANCHORED),
      ]);
      expect(hits.map((h) => h.rule)).toEqual(['submission-anchored-registry-read']);
    });

    it('FAILS a hand-rolled latest-submission LATERAL anywhere in src', () => {
      const hits = findDriftHits([
        file('src/services/some-new.service.ts', HAND_ROLLED_LATERAL),
      ]);

      expect(hits).toHaveLength(1);
      expect(hits[0].rule).toBe('hand-rolled-latest-submission-lateral');
      expect(hits[0].snippet).toContain('LEFT JOIN LATERAL');
    });

    it('catches the hand-rolled LATERAL in a NON-registry module too (rule b is global)', () => {
      const hits = findDriftHits([
        file('src/services/team-quality.service.ts', HAND_ROLLED_LATERAL),
      ]);
      expect(hits.map((h) => h.rule)).toEqual(['hand-rolled-latest-submission-lateral']);
    });

    it('requires ALL of the LATERAL signals — a plain LATERAL join is not drift', () => {
      const benign = `
        const rows = await db.execute(sql\`
          SELECT u.id, latest.name
          FROM users u
          LEFT JOIN LATERAL (
            SELECT t.name FROM teams t WHERE t.owner_id = u.id LIMIT 1
          ) latest ON true
        \`);
      `;
      expect(findDriftHits([file('src/services/team.service.ts', benign)])).toHaveLength(0);
    });
  });

  describe('AC1/AC2 — near-zero false positives', () => {
    it('PASSES a registryUnifiedSource-composed read', () => {
      expect(
        findDriftHits([file('src/services/public-insights.service.ts', CANONICAL_COMPOSED)]),
      ).toHaveLength(0);
    });

    it('PASSES submission-grain analytics outside the registry-fact modules', () => {
      // The reason rule (a) is scoped: `FROM submissions LEFT JOIN respondents`
      // is the LEGITIMATE grain for survey/verification analytics. Measured on
      // the 13-37 tree, the unscoped rule flagged 48 such reads.
      expect(
        findDriftHits([
          file('src/services/survey-analytics.service.ts', SUBMISSION_GRAIN_ANALYTICS),
          file('src/services/verification-analytics.service.ts', SUBMISSION_GRAIN_ANALYTICS),
          file('src/services/personal-stats.service.ts', SUBMISSION_GRAIN_ANALYTICS),
          file('src/lib/skills-extraction.ts', SUBMISSION_GRAIN_ANALYTICS),
        ]),
      ).toHaveLength(0);
    });

    it('PASSES a doc comment that DESCRIBES the retired shape', () => {
      // The guard's own header, registry-unified.sql.ts's governance note and
      // skills-extraction.ts's worked example all document the retired shapes.
      // Documentation is not drift.
      const documented = `
        /**
         * The retired shape was:
         *   FROM submissions s
         *   LEFT JOIN respondents r ON r.id = s.respondent_id
         * and the hand-rolled variant:
         *   LEFT JOIN LATERAL (SELECT sx.raw_data FROM submissions sx
         *   ORDER BY sx.submitted_at DESC LIMIT 1) answers ON true
         */
        export const NOTE = 'see above';
      `;
      expect(
        findDriftHits([file('src/services/public-insights.service.ts', documented)]),
      ).toHaveLength(0);
    });

    it('PASSES drift that is commented OUT with a line comment', () => {
      const commented = HAND_ROLLED_LATERAL.split('\n')
        .map((l) => `// ${l}`)
        .join('\n');
      expect(findDriftHits([file('src/services/x.service.ts', commented)])).toHaveLength(0);
    });

    it('still catches drift on a line that also carries a trailing comment', () => {
      const withTrailingComment = HAND_ROLLED_LATERAL.replace(
        '    LEFT JOIN LATERAL (',
        '    LEFT JOIN LATERAL ( // build the answers join',
      );
      expect(
        findDriftHits([file('src/services/x.service.ts', withTrailingComment)]),
      ).toHaveLength(1);
    });

    it('PASSES a bare `FROM submissions` with no respondent join in a registry module', () => {
      const trends = `
        const rows = await db.execute(sql\`
          SELECT DATE(s.created_at) AS date, COUNT(*) AS count
          FROM submissions s
          WHERE s.raw_data IS NOT NULL
          GROUP BY date
        \`);
      `;
      expect(
        findDriftHits([file('src/services/public-insights.service.ts', trends)]),
      ).toHaveLength(0);
    });
  });

  describe('AC2 — allowlist', () => {
    it('PASSES the allow-listed holders of the canonical pattern', () => {
      expect(
        findDriftHits([
          file('src/services/registry-unified.sql.ts', HAND_ROLLED_LATERAL),
          file('src/services/export-query.service.ts', HAND_ROLLED_LATERAL),
          file('src/services/respondent.service.ts', HAND_ROLLED_LATERAL),
        ]),
      ).toHaveLength(0);
    });

    it('allow-lists a registry-fact module against rule (a) as well', () => {
      // registry-unified.sql.ts matches BOTH the registry-module scope and the
      // allowlist — the allowlist must win.
      expect(
        findDriftHits([file('src/services/registry-unified.sql.ts', SUBMISSION_ANCHORED)]),
      ).toHaveLength(0);
    });

    it('every allowlist entry carries a reason', () => {
      expect(ALLOWLIST.length).toBeGreaterThan(0);
      for (const entry of ALLOWLIST) {
        expect(entry.reason.trim().length).toBeGreaterThan(10);
      }
    });

    it('every registry-fact module entry carries a reason', () => {
      expect(REGISTRY_FACT_MODULES.length).toBeGreaterThan(0);
      for (const entry of REGISTRY_FACT_MODULES) {
        expect(entry.reason.trim().length).toBeGreaterThan(10);
      }
    });

    it('normalizes Windows-style separators when matching paths', () => {
      expect(
        findDriftHits([file('src\\services\\registry-unified.sql.ts', HAND_ROLLED_LATERAL)]),
      ).toHaveLength(0);
    });
  });

  describe('AC2 — inline escape hatch', () => {
    const withAnnotation = (text: string) =>
      HAND_ROLLED_LATERAL.replace('    LEFT JOIN LATERAL (', `${text}\n    LEFT JOIN LATERAL (`);

    it('PASSES when annotated WITH a reason on the line above', () => {
      const src = withAnnotation(
        `    // ${ESCAPE_HATCH_TOKEN}: one-off migration backfill, not a registry read`,
      );
      expect(findDriftHits([file('src/services/x.service.ts', src)])).toHaveLength(0);
    });

    it('PASSES when annotated WITH a reason on the same line', () => {
      const src = HAND_ROLLED_LATERAL.replace(
        '    LEFT JOIN LATERAL (',
        `    LEFT JOIN LATERAL ( -- ${ESCAPE_HATCH_TOKEN}: deliberate one-off, see ADR-012`,
      );
      expect(findDriftHits([file('src/services/x.service.ts', src)])).toHaveLength(0);
    });

    it('FAILS when the escape hatch carries NO reason', () => {
      const hits = findDriftHits([
        file('src/services/x.service.ts', withAnnotation(`    // ${ESCAPE_HATCH_TOKEN}:`)),
      ]);
      expect(hits).toHaveLength(1);
      expect(hits[0].rule).toBe('escape-hatch-missing-reason');
    });

    it('FAILS when the escape hatch has no colon or reason at all', () => {
      const hits = findDriftHits([
        file('src/services/x.service.ts', withAnnotation(`    // ${ESCAPE_HATCH_TOKEN}`)),
      ]);
      expect(hits).toHaveLength(1);
      expect(hits[0].rule).toBe('escape-hatch-missing-reason');
    });

    it('rejects a too-short reason (not a real justification)', () => {
      const hits = findDriftHits([
        file('src/services/x.service.ts', withAnnotation(`    // ${ESCAPE_HATCH_TOKEN}: ok`)),
      ]);
      expect(hits).toHaveLength(1);
      expect(hits[0].rule).toBe('escape-hatch-missing-reason');
    });

    it('names the offending file:line in the missing-reason hit', () => {
      const hits = findDriftHits([
        file('src/services/x.service.ts', withAnnotation(`    // ${ESCAPE_HATCH_TOKEN}:`)),
      ]);
      expect(formatHits(hits)).toContain('src/services/x.service.ts:');
    });
  });

  describe('AC4 — actionable failure message', () => {
    const hits = findDriftHits([
      file('src/services/public-insights.service.ts', SUBMISSION_ANCHORED),
    ]);
    const msg = formatHits(hits);

    it('names file:line', () => {
      expect(msg).toContain('src/services/public-insights.service.ts:4');
    });

    it('shows the offending snippet', () => {
      expect(msg).toContain('FROM submissions');
    });

    it('states WHY it is blocked (the 13-33 submission-vs-respondent drift)', () => {
      expect(msg).toMatch(/13-33/);
      expect(msg).toMatch(/drift/i);
    });

    it('points at the canonical source and the ingestion contract', () => {
      expect(msg).toContain("registryUnifiedSource('ru')");
      expect(msg).toContain('docs/registry-unified-ingestion-contract.md');
    });

    it('documents the escape-hatch syntax', () => {
      expect(msg).toContain(ESCAPE_HATCH_TOKEN);
    });

    it('is empty for zero hits', () => {
      expect(formatHits([])).toBe('');
    });
  });

  describe('multi-file behaviour', () => {
    it('reports every hit across files, ordered by file then line', () => {
      const hits = findDriftHits([
        file('src/services/public-insights.service.ts', SUBMISSION_ANCHORED),
        file('src/services/a-new.service.ts', HAND_ROLLED_LATERAL),
      ]);
      expect(hits).toHaveLength(2);
      expect(hits.map((h) => h.file)).toEqual([
        'src/services/a-new.service.ts',
        'src/services/public-insights.service.ts',
      ]);
    });

    it('returns no hits for an empty file set', () => {
      expect(findDriftHits([])).toEqual([]);
    });
  });

  // ── Code-review hardening (2026-07-30) ────────────────────────────────────
  // The rules originally matched only the `LEFT JOIN` spelling, which left the
  // cheapest evasion open (copy the canonical read, change one keyword) — and
  // the missed spellings are this codebase's own idiom.

  describe('regression lock — the guard tracks the REAL canonical read', () => {
    it('catches a verbatim copy of REGISTRY_UNIFIED_SQL_TEXT in a non-allowlisted file', () => {
      // THE point of rule (b): copy-pasting the canonical read instead of
      // importing it. Asserting against the REAL constant (not a hand-written
      // lookalike) means editing 13-33's SQL out from under the guard's
      // patterns reddens here instead of silently disarming it.
      const copied = 'const q = sql`' + REGISTRY_UNIFIED_SQL_TEXT + '`;\n';
      const hits = findDriftHits([file('src/services/brand-new.service.ts', copied)]);

      expect(hits).toHaveLength(1);
      expect(hits[0].rule).toBe('hand-rolled-latest-submission-lateral');
    });
  });

  describe('rule (a) — every join spelling onto respondents', () => {
    const inRegistryModule = (joinClause: string) =>
      findDriftHits([
        file(
          'src/services/public-insights.service.ts',
          'const q = sql`\n  SELECT COUNT(*)\n  FROM submissions s\n  ' + joinClause + '\n`;\n',
        ),
      ]);

    it.each([
      ['LEFT JOIN respondents r ON r.id = s.respondent_id'],
      ['JOIN respondents r ON r.id = s.respondent_id'],
      ['INNER JOIN respondents r ON r.id = s.respondent_id'],
      ['LEFT OUTER JOIN respondents r ON r.id = s.respondent_id'],
    ])('catches `%s`', (joinClause) => {
      expect(inRegistryModule(joinClause).map((h) => h.rule)).toEqual([
        'submission-anchored-registry-read',
      ]);
    });

    it('catches the comma (implicit) join', () => {
      const hits = findDriftHits([
        file(
          'src/services/public-insights.service.ts',
          'const q = sql`\n  SELECT COUNT(*)\n  FROM submissions s, respondents r\n  WHERE r.id = s.respondent_id\n`;\n',
        ),
      ]);
      expect(hits.map((h) => h.rule)).toEqual(['submission-anchored-registry-read']);
    });

    it('still PASSES the inner-join spelling outside the registry-fact modules', () => {
      // survey-analytics.service.ts:1674 writes exactly this, legitimately —
      // widening the join keyword must not widen the SCOPE.
      expect(
        inRegistryModule('JOIN respondents r ON r.id = s.respondent_id').length,
      ).toBeGreaterThan(0);
      expect(
        findDriftHits([
          file(
            'src/services/survey-analytics.service.ts',
            'const q = sql`\n  SELECT COUNT(*)\n  FROM submissions s\n  JOIN respondents r ON r.id = s.respondent_id\n`;\n',
          ),
        ]),
      ).toHaveLength(0);
    });
  });

  describe('rule (b) — every lateral-join spelling', () => {
    it.each([['LEFT JOIN LATERAL'], ['JOIN LATERAL'], ['CROSS JOIN LATERAL'], ['LEFT OUTER JOIN LATERAL']])(
      'catches `%s`',
      (keyword) => {
        const src = HAND_ROLLED_LATERAL.replace('LEFT JOIN LATERAL', keyword);
        expect(findDriftHits([file('src/services/x.service.ts', src)]).map((h) => h.rule)).toEqual([
          'hand-rolled-latest-submission-lateral',
        ]);
      },
    );

    it('PASSES a CROSS JOIN LATERAL (VALUES …) unpivot — the real survey-analytics shape', () => {
      // The submissions FROM sits BEFORE the lateral and the window is
      // forward-bounded by the template, so this must not trip the wider rule.
      const unpivot = `
        const rows = await db.execute(sql\`
          SELECT s.submitter_id, q.question, q.answer
          FROM submissions s
          JOIN respondents r ON r.id = s.respondent_id
          CROSS JOIN LATERAL (
            VALUES ('gender', s.raw_data->>'gender')
          ) AS q(question, answer)
          ORDER BY s.submitter_id, q.question
        \`);
      `;
      expect(findDriftHits([file('src/services/survey-analytics.service.ts', unpivot)])).toHaveLength(0);
    });
  });

  describe('escape hatch — scope and comment-position', () => {
    it('PASSES when annotated above the whole SQL statement, not just the hit line', () => {
      // What a dev actually writes: the comment goes above `db.execute(sql\``,
      // several lines above the line the regex happened to match.
      const src = HAND_ROLLED_LATERAL.replace(
        '  const rows = await db.execute(sql`',
        '  // ' + ESCAPE_HATCH_TOKEN + ': one-off migration read, not a registry fact\n  const rows = await db.execute(sql`',
      );
      expect(findDriftHits([file('src/services/x.service.ts', src)])).toHaveLength(0);
    });

    it('PASSES when annotated on a line INSIDE the statement, away from the hit line', () => {
      const src = HAND_ROLLED_LATERAL.replace(
        '    SELECT r.id, answers.raw_data',
        '    -- ' + ESCAPE_HATCH_TOKEN + ': deliberate one-off, see ADR-012\n    SELECT r.id, answers.raw_data',
      );
      expect(findDriftHits([file('src/services/x.service.ts', src)])).toHaveLength(0);
    });

    it('does NOT suppress from inside a string literal (must be a comment)', () => {
      const src = HAND_ROLLED_LATERAL.replace(
        '  const rows = await db.execute(sql`',
        "  const note = '" + ESCAPE_HATCH_TOKEN + ": this is data, not a reviewed decision';\n  const rows = await db.execute(sql`",
      );
      expect(findDriftHits([file('src/services/x.service.ts', src)])).toHaveLength(1);
    });

    it('reports WHICH drift a reason-less annotation tried to suppress', () => {
      const src = HAND_ROLLED_LATERAL.replace(
        '    LEFT JOIN LATERAL (',
        `    // ${ESCAPE_HATCH_TOKEN}:\n    LEFT JOIN LATERAL (`,
      );
      const hits = findDriftHits([file('src/services/x.service.ts', src)]);

      expect(hits).toHaveLength(1);
      expect(hits[0].rule).toBe('escape-hatch-missing-reason');
      expect(hits[0].suppressedRule).toBe('hand-rolled-latest-submission-lateral');
      expect(hits[0].why).toContain('hand-rolled-latest-submission-lateral');
      expect(formatHits(hits)).toContain(
        '[escape-hatch-missing-reason → hand-rolled-latest-submission-lateral]',
      );
    });
  });
});
