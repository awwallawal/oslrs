/**
 * Registry-read drift guard — the core detector (Story 13-37).
 *
 * Story 13-33 shipped the ONE canonical respondent-anchored registry read
 * (`registryUnifiedSource` / `registry_unified`, defined in
 * `services/registry-unified.sql.ts`). Every registry-fact consumer composes
 * THAT shape. This module makes the retired shapes hard to write again: it
 * detects a hand-rolled respondent⟕submission registry read so a re-fork
 * reddens CI instead of silently re-creating the 76-vs-139 drift.
 *
 * Pure + filesystem-free so it is unit-testable in the `test-api` job; the CLI
 * runner (`scripts/lint-registry-read-drift.ts`) does the I/O and owns the exit
 * code. Mirrors the `osv-prod-gate` split (gate logic in `src/lib`, thin runner
 * in `scripts/`) — `scripts/` is outside tsconfig, so logic that must be
 * type-checked and tested lives here.
 *
 * ── The two retired shapes ───────────────────────────────────────────────────
 * (a) **Submission-anchored registry read** — `FROM submissions … LEFT JOIN
 *     respondents`. This is what 13-33 deleted from `public-insights.service.ts`
 *     (commit 787493b): it drops submission-less respondents (imported /
 *     data_lost / no_submission / pending_nin) and double-counts anyone with
 *     multiple submissions.
 * (b) **Hand-rolled latest-non-empty LATERAL** — a copy-paste of the canonical
 *     `JOIN LATERAL (… FROM submissions … ORDER BY submitted_at DESC …
 *     LIMIT 1)` instead of importing `registryUnifiedSource`. A copy cannot
 *     track edits to the canonical definition, so it drifts by construction.
 *
 * Both rules match ANY join spelling (`LEFT` / `INNER` / `CROSS` / `LEFT OUTER`
 * / bare `JOIN`, plus the comma join for rule (a)). Pinning them to `LEFT JOIN`
 * — as they were first written — left the cheapest possible evasion open:
 * copy the canonical read and change one keyword. Both widened forms measure
 * ZERO hits on the tree, so the breadth is free. (Code review, 2026-07-30.)
 *
 * ── Why rule (a) is SCOPED and rule (b) is GLOBAL (the false-positive ruling) ─
 * The story originally specified rule (a) globally. Measured against the tree at
 * implementation time, that flagged **50 reads, 48 of them legitimate**:
 *
 *     44  services/survey-analytics.service.ts
 *      2  services/verification-analytics.service.ts
 *      2  services/export-query.service.ts   (already allow-listed)
 *      1  services/personal-stats.service.ts
 *      1  lib/skills-extraction.ts           (inside a doc comment)
 *
 * `FROM submissions LEFT JOIN respondents` is the CORRECT grain for
 * survey/verification analytics — they answer "how many submissions say X",
 * not "how many people are registered". The join text alone cannot separate the
 * bug from correct code; what separated them in 13-33 was the module's JOB. So
 * rule (a) fires only inside the registry-fact modules (below), where composing
 * the canonical read is mandatory — both are clean today, so the current tree
 * yields zero unallow-listed hits. Rule (b) needs no such scoping: its signal is
 * specific enough to run across all of `apps/api/src` with the three sanctioned
 * holders allow-listed (measured: 6 hits, all allow-listed).
 *
 * Ruled by Awwal 2026-07-30 during dev-story, on the measurements above.
 * KNOWN GAP (accepted): a drifted registry COUNT added inside a non-registry
 * analytics module is not caught by rule (a). It is still caught by rule (b) if
 * it hand-rolls the join. Widening rule (a) requires a grain signal, not a
 * join-text signal — revisit if that gap ever bites.
 */

/** Inline suppression annotation — `// registry-read-drift-ok: <reason>`. */
export const ESCAPE_HATCH_TOKEN = 'registry-read-drift-ok';

/**
 * Minimum characters for an escape-hatch reason. Long enough that "ok" / "fix"
 * fail, short enough that a genuine one-liner passes — the point is to force a
 * deliberate, reviewable justification, not to police prose.
 */
export const MIN_REASON_CHARS = 8;

export type DriftRuleId =
  | 'submission-anchored-registry-read'
  | 'hand-rolled-latest-submission-lateral'
  | 'escape-hatch-missing-reason';

/** A source file to scan. `path` is package-relative (e.g. `src/services/x.ts`). */
export interface DriftFile {
  path: string;
  content: string;
}

/** One unsuppressed drift detection. */
export interface DriftHit {
  file: string;
  /** 1-indexed. */
  line: number;
  rule: DriftRuleId;
  /**
   * When `rule` is `escape-hatch-missing-reason`, the drift rule the annotation
   * was trying to suppress. Reported so a bad suppression still tells the author
   * WHAT they were suppressing, not merely that the reason was too short.
   */
  suppressedRule?: DriftRuleId;
  snippet: string;
  /** Why this is blocked — surfaced verbatim in the CI failure message. */
  why: string;
}

interface PathRule {
  /** Matched against the normalized (forward-slash) package-relative path. */
  pattern: RegExp;
  reason: string;
}

/**
 * Files that legitimately hold a respondent⟕submission read. Each is a
 * DELIBERATE exception with a reason, not a leak — see 13-33 AC5.
 */
export const ALLOWLIST: PathRule[] = [
  {
    pattern: /(^|\/)src\/services\/registry-unified\.sql\.ts$/,
    reason:
      'The canonical read itself (13-33) — the ONE sanctioned definition of the respondent⟕submission shape that every consumer composes.',
  },
  {
    pattern: /(^|\/)src\/services\/export-query\.service\.ts$/,
    reason:
      'getUnifiedExportData — respondent-anchored and proven equal to the canonical read by the parity smoke; deliberately not force-refactored (13-33 AC5).',
  },
  {
    pattern: /(^|\/)src\/services\/respondent\.service\.ts$/,
    reason:
      'listRespondents — the intentionally-scoped filtered/paginated registry table (12-7), which carries its own parity test.',
  },
];

/**
 * Modules whose job IS producing registry facts. Inside these, a
 * submission-anchored respondent join is drift by definition — the canonical
 * read is the only correct source. Rule (a) is scoped to this set; see the
 * header for the measurement that forced the scoping.
 */
export const REGISTRY_FACT_MODULES: PathRule[] = [
  {
    pattern: /(^|\/)src\/services\/public-insights\.service\.ts$/,
    reason:
      'The public /insights page — the exact surface whose breakdowns + density map 13-33 repointed off the submission-anchored read.',
  },
  {
    pattern: /(^|\/)src\/services\/registry-[^/]+\.ts$/,
    reason:
      'Any registry-* service (count-core, unified read, 12-4 getRegistryTotals) — these exist to report registry facts and must compose the canonical read.',
  },
];

const RULE_WHY: Record<DriftRuleId, string> = {
  'submission-anchored-registry-read':
    'Submission-anchored registry read. Starting FROM submissions drops respondents with no submission (imported / data_lost / no_submission / pending_nin) and double-counts anyone with several — the submission-vs-respondent drift Story 13-33 canonicalized away.',
  'hand-rolled-latest-submission-lateral':
    'Hand-rolled copy of the canonical latest-non-empty LATERAL. A copy cannot track edits to the canonical definition, so it drifts by construction (Story 13-33).',
  'escape-hatch-missing-reason': `A \`${ESCAPE_HATCH_TOKEN}\` annotation must carry a reason of at least ${MIN_REASON_CHARS} characters. An unexplained suppression is not a reviewable decision.`,
};

/** Normalize Windows separators so path rules are platform-independent. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function matchPathRule(path: string, rules: PathRule[]): PathRule | undefined {
  const normalized = normalizePath(path);
  return rules.find((r) => r.pattern.test(normalized));
}

/**
 * Blank out comment bodies, preserving length and newlines so every character
 * offset (and therefore every line number) stays valid.
 *
 * Real SQL lives in template literals; a comment that *describes* a retired
 * shape — this file's own header, `registry-unified.sql.ts`'s governance note,
 * `skills-extraction.ts`'s worked example — is documentation, not drift.
 * Without this the guard flags prose, which is how a linter earns a reputation
 * for crying wolf. Escape-hatch annotations are unaffected: they are matched
 * against the ORIGINAL lines.
 *
 * Tracks string/template state so a `//` inside a URL literal cannot blank the
 * rest of a line. Nested `${}` templates may flip state early; that under-masks
 * (treats a comment as code), which can only ever cost a false POSITIVE — loud
 * and immediately fixable.
 *
 * KNOWN LIMIT (deliberate): regex literals are not tracked, so a literal
 * containing `//` (e.g. `/\/\//`) starts a phantom line comment and over-masks
 * the remainder of that line — a false NEGATIVE. Tracking regex literals needs
 * real regex-vs-division disambiguation, which is more failure surface than the
 * case is worth: SQL drift and a regex literal do not share a line. If that ever
 * changes, the fix is an AST pass (see the "why a script, not an eslint rule"
 * note in the story), not more state in this loop.
 */
function maskComments(content: string): string {
  const out = content.split('');
  type State = 'code' | 'line' | 'block' | 'single' | 'double' | 'template';
  let state: State = 'code';
  let i = 0;

  while (i < content.length) {
    const c = content[i];
    const d = content[i + 1];

    if (state === 'code') {
      if (c === '/' && d === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        state = 'line';
        i += 2;
      } else if (c === '/' && d === '*') {
        out[i] = ' ';
        out[i + 1] = ' ';
        state = 'block';
        i += 2;
      } else {
        if (c === "'") state = 'single';
        else if (c === '"') state = 'double';
        else if (c === '`') state = 'template';
        i++;
      }
      continue;
    }

    if (state === 'line') {
      if (c === '\n') state = 'code';
      else out[i] = ' ';
      i++;
      continue;
    }

    if (state === 'block') {
      if (c === '*' && d === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        state = 'code';
        i += 2;
      } else {
        if (c !== '\n') out[i] = ' ';
        i++;
      }
      continue;
    }

    // Inside a string/template literal — never masked.
    if (c === '\\') {
      i += 2;
    } else if (
      (state === 'single' && c === "'") ||
      (state === 'double' && c === '"') ||
      (state === 'template' && c === '`')
    ) {
      state = 'code';
      i++;
    } else {
      i++;
    }
  }

  return out.join('');
}

/**
 * Text from `from` to the end of the enclosing SQL template (the next backtick)
 * or `maxLen` characters, whichever comes first. SQL lives in tagged template
 * literals, so the backtick is a cheap, accurate "same statement" boundary —
 * it stops a match bleeding into an unrelated query further down the file.
 */
function templateWindow(content: string, from: number, maxLen: number): string {
  const backtick = content.indexOf('`', from);
  const capped = from + maxLen;
  const end = backtick === -1 ? Math.min(content.length, capped) : Math.min(backtick, capped);
  return content.slice(from, end);
}

/** 1-indexed line number of a character offset. */
function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/**
 * True when the annotation on this line sits in COMMENT position — after `//`,
 * `/*`, a JSDoc `*`, or a SQL `--`. Without this check a bare `includes()` lets
 * the token suppress from inside a string literal or SQL text, which is not a
 * reviewable decision by anyone.
 */
function annotationIsInComment(line: string): boolean {
  const at = line.indexOf(ESCAPE_HATCH_TOKEN);
  if (at === -1) return false;
  return /(?:\/\/|\/\*|\*|--)[^\S\n]*$/.test(line.slice(0, at));
}

/**
 * Line (1-indexed) on which the SQL template enclosing `offset` opens, so an
 * annotation may be written against the STATEMENT rather than against the one
 * line the regex happened to match. A dev annotating a multi-line query writes
 * the comment above `db.execute(sql\``, not above the inner `FROM` line.
 * Falls back to the hit line when there is no template within `maxLookback`.
 */
function statementStartLine(content: string, offset: number, hitLine: number, maxLookback = 2000): number {
  const open = content.lastIndexOf('`', offset);
  if (open === -1 || offset - open > maxLookback) return hitLine;
  return lineNumberAt(content, open);
}

/**
 * Resolve an escape-hatch annotation for a hit, scanning `fromLine`..`toLine`
 * (1-indexed, inclusive) — the enclosing SQL statement plus the line above it.
 *
 * @returns `'none'` when unannotated, `'suppressed'` when annotated with a
 *   sufficient reason, `'missing-reason'` when annotated without one.
 */
function escapeHatchFor(
  lines: string[],
  fromLine: number,
  toLine: number,
): 'none' | 'suppressed' | 'missing-reason' {
  const candidates: string[] = [];
  for (let n = Math.max(1, fromLine); n <= toLine; n++) {
    const candidate = lines[n - 1];
    if (typeof candidate === 'string' && annotationIsInComment(candidate)) candidates.push(candidate);
  }
  if (candidates.length === 0) return 'none';

  for (const candidate of candidates) {
    const match = new RegExp(`${ESCAPE_HATCH_TOKEN}\\s*:?\\s*(.*)$`).exec(candidate);
    const reason = (match?.[1] ?? '')
      .replace(/\*\/\s*$/, '') // trailing block-comment terminator
      .trim();
    if (reason.length >= MIN_REASON_CHARS) return 'suppressed';
  }
  return 'missing-reason';
}

/**
 * Any spelling of a join onto `respondents`, including the comma (implicit)
 * join. `LEFT JOIN` alone was too narrow: `survey-analytics.service.ts:1674`
 * writes the INNER form (`FROM submissions s JOIN respondents r ON …`), so the
 * spelling a drifted registry read would most plausibly use was the one the
 * rule could not see. Widening is free here — rule (a) only runs inside the
 * registry-fact modules, and the widened pattern measures 0 hits on the tree.
 */
const JOIN_RESPONDENTS = /(\bJOIN\s+respondents\b|,\s*respondents\s+\w)/i;

/** Rule (a) — submission-anchored registry read. Registry-fact modules only. */
function findSubmissionAnchoredHits(content: string): number[] {
  const offsets: number[] = [];
  for (const match of content.matchAll(/FROM\s+submissions\b/gi)) {
    if (match.index === undefined) continue;
    const window = templateWindow(content, match.index, 800);
    if (JOIN_RESPONDENTS.test(window)) offsets.push(match.index);
  }
  return offsets;
}

/**
 * Rule (b) — hand-rolled latest-non-empty LATERAL. Global.
 *
 * Matches ANY lateral-join spelling (`LEFT JOIN LATERAL`, `CROSS JOIN LATERAL`,
 * `JOIN LATERAL`, `LEFT OUTER JOIN LATERAL`). Pinning it to `LEFT JOIN LATERAL`
 * left the cheapest evasion wide open — copy the canonical read and change one
 * keyword — and `CROSS JOIN LATERAL` is already this codebase's idiom
 * (`survey-analytics.service.ts:1675`). The three content signals below carry
 * the specificity, so the wider keyword costs no false positives (measured: 0).
 */
function findHandRolledLateralHits(content: string): number[] {
  const offsets: number[] = [];
  for (const match of content.matchAll(/\bJOIN\s+LATERAL/gi)) {
    if (match.index === undefined) continue;
    const window = templateWindow(content, match.index, 1500);
    const overSubmissions = /FROM\s+submissions/i.test(window);
    const latestFirst = /ORDER\s+BY[\s\S]{0,200}?submitted_at\s+DESC/i.test(window);
    const singleRow = /LIMIT\s+1\b/i.test(window);
    if (overSubmissions && latestFirst && singleRow) offsets.push(match.index);
  }
  return offsets;
}

/**
 * Scan files for the retired registry-read shapes.
 *
 * Allow-listed files are skipped entirely (they hold the pattern by design).
 * Results are sorted by file then line so CI output is stable.
 */
export function findDriftHits(files: DriftFile[]): DriftHit[] {
  const hits: DriftHit[] = [];

  for (const { path, content } of files) {
    if (matchPathRule(path, ALLOWLIST)) continue;

    const lines = content.split('\n');
    // Match against comment-masked source (offsets/lines preserved); report
    // snippets and resolve escape hatches against the original.
    const scannable = maskComments(content);
    const isRegistryFactModule = Boolean(matchPathRule(path, REGISTRY_FACT_MODULES));

    const candidates: Array<{ offset: number; rule: DriftRuleId }> = [
      ...(isRegistryFactModule
        ? findSubmissionAnchoredHits(scannable).map((offset) => ({
            offset,
            rule: 'submission-anchored-registry-read' as const,
          }))
        : []),
      ...findHandRolledLateralHits(scannable).map((offset) => ({
        offset,
        rule: 'hand-rolled-latest-submission-lateral' as const,
      })),
    ];

    for (const { offset, rule } of candidates) {
      const line = lineNumberAt(content, offset);
      const verdict = escapeHatchFor(lines, statementStartLine(scannable, offset, line) - 1, line);
      if (verdict === 'suppressed') continue;

      const missingReason = verdict === 'missing-reason';
      const effectiveRule: DriftRuleId = missingReason ? 'escape-hatch-missing-reason' : rule;
      hits.push({
        file: path,
        line,
        rule: effectiveRule,
        ...(missingReason ? { suppressedRule: rule } : {}),
        snippet: (lines[line - 1] ?? '').trim().slice(0, 160),
        why: missingReason
          ? `${RULE_WHY['escape-hatch-missing-reason']} The detection it tried to suppress was [${rule}]: ${RULE_WHY[rule]}`
          : RULE_WHY[effectiveRule],
      });
    }
  }

  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/**
 * Render hits as the CI failure message (AC4): file:line, the offending
 * snippet, why it is blocked, and how to fix or deliberately suppress it.
 * Returns '' for zero hits so the caller can print nothing on success.
 */
export function formatHits(hits: DriftHit[]): string {
  if (hits.length === 0) return '';

  const blocks = hits.map((hit) => {
    const rule = hit.suppressedRule ? `${hit.rule} → ${hit.suppressedRule}` : hit.rule;
    return [
      `  ${hit.file}:${hit.line}  [${rule}]`,
      `    ${hit.snippet}`,
      `    WHY: ${hit.why}`,
    ].join('\n');
  });

  return [
    `❌ registry-read drift: ${hits.length} blocked read${hits.length === 1 ? '' : 's'}.`,
    '',
    ...blocks,
    '',
    'FIX — compose the ONE canonical respondent-anchored read instead of re-deriving it:',
    '',
    '    // import path is relative to YOUR file; the module is',
    '    // apps/api/src/services/registry-unified.ts',
    "    import { registryUnifiedSource } from './registry-unified.js';",
    '',
    '    const result = await db.execute(sql`',
    '      SELECT COUNT(*)::int AS total',
    "      FROM ${registryUnifiedSource('ru')}",
    '      WHERE ru.lga_id IS NOT NULL',
    '    `);',
    '',
    'It is respondent-anchored (one row per person, submission-less rows included),',
    'so counts agree with the headline, the export and the density map by construction.',
    'Contract: docs/registry-unified-ingestion-contract.md',
    'Definition: apps/api/src/services/registry-unified.sql.ts',
    '',
    'GENUINE EXCEPTION — put this in a COMMENT anywhere inside the flagged SQL',
    'statement (or on the line directly above it) and say why:',
    '',
    `    // ${ESCAPE_HATCH_TOKEN}: <reason, at least ${MIN_REASON_CHARS} characters>`,
    '',
  ].join('\n');
}
