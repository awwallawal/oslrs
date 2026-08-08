/**
 * Respondent-write drift guard — the core detector (Story 13-54).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The same defect has been fixed by hand THREE times, and each fix protected
 * one more caller rather than the class:
 *
 *   R13          identity guard added to `findOrCreateRespondent`   (by design)
 *   R21 (13-49)  the public wizard does not call it — it creates directly
 *                                                      (found: a live duplicate)
 *   13-53        the NIN-arrival direction does not call it either
 *                          (found: a live duplicate, `56C9PG` / `W1PS38`)
 *
 * That is not a converging series. It is the same sentence written three times,
 * and the next ingestion path added will miss it too. Two of the three were
 * discovered by a whole-register sweep AFTER a real citizen was already holding
 * two records and two reference numbers — not by review, not by tests, not by
 * types. This module makes the wrong way hard to WRITE.
 *
 * ── SCOPE — creation, not "write" ───────────────────────────────────────────
 * ⚠️ This guard covers respondent **CREATION**. It does NOT cover
 * `update(respondents)`, which spans 12 files (`draft-adoption/promote-nin.ts`,
 * `draft-adoption/adopt.ts`, `nin-reconfirm.ts`, `merge-duplicate-respondents.ts`,
 * `reminder.worker.ts`, and three backfill scripts). That is the promote class
 * and **Story 13-55 owns it**.
 *
 * The story's title says "write". The guard says creation. The gap is stated
 * here, in the failure message, and in the success line ON PURPOSE: this repo's
 * most expensive defect class is "fixed one instance of a class", and 13-54
 * exists to end that pattern — it must not quietly become the fourth instance
 * by shipping under a name that promises more than it checks.
 *
 * ── Shape ───────────────────────────────────────────────────────────────────
 * Pure + filesystem-free so it is unit-testable in the `test-api` job; the CLI
 * runner (`scripts/lint-respondent-write-drift.ts`) does the I/O and owns the
 * exit code. Modelled on the proven sibling `registry-read-drift.ts` (13-37) —
 * `maskComments`, the escape-hatch resolution and the path normalisation are
 * that module's design, reused rather than re-derived.
 *
 * ⚠️ DEVIATION FROM THE SIBLING (deliberate): the sibling keeps its
 * `SKIP_DIRS`/`SKIP_SUFFIXES` in the CLI, i.e. inside `scripts/`, which is
 * outside tsconfig and therefore neither type-checked nor unit-tested. The skip
 * predicate is load-bearing here — it is what keeps ~35 fixture creation sites
 * out of the allowlist, and an allowlist of 35 test files would drown AC1.3's
 * "an entry without a reason is a hole with a comment". So `isScannablePath`
 * lives HERE, typed and tested, and the CLI imports it. Same reasoning AC1.1
 * gives for putting the detector in `src/lib` at all.
 */

/** Inline suppression annotation — `// respondent-write-drift-ok: <reason>`. */
export const ESCAPE_HATCH_TOKEN = 'respondent-write-drift-ok';

/**
 * Minimum characters for an escape-hatch reason. Long enough that "ok" / "fix"
 * fail, short enough that a genuine one-liner passes — the point is to force a
 * deliberate, reviewable justification, not to police prose.
 */
export const MIN_REASON_CHARS = 8;

/**
 * How many lines above a hit are searched for an escape-hatch annotation.
 * Three covers the realistic spellings — the line directly above, a blank line
 * between comment and code, and the closing line of a short block comment.
 * KNOWN LIMIT: an annotation further away than this is not honoured. That fails
 * LOUD (the guard still reds) rather than silently letting a write through, so
 * the failure direction is the safe one.
 *
 * Review L1 (2026-08-08): the lookback also STOPS at the first line of real
 * code. Without that, one annotation suppressed every hit in the three lines
 * below it — including a second, unrelated creation the author never justified.
 * A suppression has to be adjacent to the thing it suppresses or it is not a
 * reviewable decision about that thing.
 */
const ANNOTATION_LOOKBACK_LINES = 3;

export type DriftRuleId =
  | 'unsanctioned-respondent-insert'
  | 'unsanctioned-respondent-raw-insert'
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

export interface PathRule {
  /** Matched against the normalized (forward-slash) package-relative path. */
  pattern: RegExp;
  reason: string;
}

/**
 * The sanctioned respondent-CREATION sites. Measured against the tree on
 * 2026-08-08: these four, and no others, create a respondent in production
 * code. Each is a DELIBERATE exception with a reason — an entry without one is
 * a hole with a comment (AC1.3).
 *
 * This is a path allowlist, NOT a directory rule, precisely so that adding a
 * fifth is a visible, reviewable act rather than a side effect of where someone
 * put a file.
 */
export const ALLOWLIST: PathRule[] = [
  {
    pattern: /(^|\/)src\/services\/submission-processing\.service\.ts$/,
    reason:
      'findOrCreateRespondent — THE chokepoint. This is the function the identity guard lives in; every other path is supposed to route here.',
  },
  {
    pattern: /(^|\/)src\/controllers\/registration\.controller\.ts$/,
    reason:
      'The public wizard registration path. It creates directly (that WAS defect R21); it now carries the identity guard inline and the NIN-arrival promote from 13-53. Consolidation is Story 13-55, not this guard.',
  },
  {
    pattern: /(^|\/)src\/services\/import\.service\.ts$/,
    reason:
      'The Epic 11 multi-source import spine — bulk creation from operator-supplied files, deduped on its own batch key before insert.',
  },
  {
    pattern: /(^|\/)src\/db\/seed-projected-scale\.ts$/,
    reason:
      'Synthetic scale-test seed data (raw SQL, never runs against a real register). Not an ingestion path.',
  },
];

/** Directory segments never scanned — fixtures hold DELIBERATE creation calls. */
const SKIP_DIRS = new Set(['__tests__', 'test', 'tests', 'node_modules', 'dist']);

/**
 * Extensions scanned. Review L2 (2026-08-08): this was `.ts` only, so a
 * creation site in a `.mts`/`.cts`/`.tsx` file was silently unscanned — the
 * package is all-`.ts` today, but "the guard happens to be right about the file
 * extensions currently in use" is not a property anyone would notice losing.
 */
const SCANNABLE_EXTENSIONS = ['.ts', '.mts', '.cts', '.tsx'];

/** File suffixes never scanned (fixtures and declarations, not creation sites). */
const SKIP_SUFFIXES = [
  '.test.ts',
  '.test.tsx',
  '.test.mts',
  '.spec.ts',
  '.spec.tsx',
  '.spec.mts',
  '.d.ts',
  '.d.mts',
  '.d.cts',
];

const RULE_WHY: Record<DriftRuleId, string> = {
  'unsanctioned-respondent-insert':
    'A respondent is created here, outside the sanctioned set. Creating one directly skips the identity guard — which is exactly how the public wizard (R21) and the NIN-arrival path (13-53) each ended up giving a real citizen two records and two reference numbers, eight weeks apart.',
  'unsanctioned-respondent-raw-insert':
    'A respondent is created here by raw SQL, outside the sanctioned set. Raw SQL bypasses the identity guard the same way the builder form does — and is harder to spot in review, which is why it is blocked rather than merely discouraged.',
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
 * True when this path should be scanned at all. Fixtures are excluded by RULE,
 * never by allowlist entry — see the deviation note in the module header.
 */
export function isScannablePath(path: string): boolean {
  const normalized = normalizePath(path);
  if (!SCANNABLE_EXTENSIONS.some((extension) => normalized.endsWith(extension))) return false;
  if (SKIP_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return false;
  return !normalized.split('/').some((segment) => SKIP_DIRS.has(segment));
}

/**
 * Blank out comment bodies, preserving length and newlines so every character
 * offset (and therefore every line number) stays valid.
 *
 * Prose that DESCRIBES a creation call — this file's own header, a migration
 * note, a changelog line — is documentation, not drift. Without this the guard
 * flags prose, which is how a linter earns a reputation for crying wolf.
 * Escape-hatch annotations are unaffected: they are matched against the
 * ORIGINAL lines.
 *
 * Adapted verbatim from `registry-read-drift.ts` (13-37), including its known
 * limit: regex literals are not tracked, so a literal containing `//` starts a
 * phantom line comment and over-masks the remainder of that line — a false
 * NEGATIVE. Tracking regex literals needs real regex-vs-division
 * disambiguation, which is more failure surface than the case is worth.
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

    // Inside a string/template literal — never masked. SQL lives in templates.
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
 * the token suppress from inside a string literal, which is not a reviewable
 * decision by anyone.
 */
function annotationIsInComment(line: string): boolean {
  const at = line.indexOf(ESCAPE_HATCH_TOKEN);
  if (at === -1) return false;
  return /(?:\/\/|\/\*|\*|--)[^\S\n]*$/.test(line.slice(0, at));
}

/**
 * True when this line carries real code rather than blank space or a comment.
 * Used to STOP the lookback: an annotation separated from the hit by a
 * statement is an annotation about that statement, not about this hit (L1).
 */
function isCodeLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  return !/^(?:\/\/|\/\*|\*|--)/.test(trimmed);
}

/**
 * Resolve an escape-hatch annotation for a hit: the hit line itself, then
 * upwards through blank/comment lines only, at most
 * `ANNOTATION_LOOKBACK_LINES` — stopping at the first line of real code.
 *
 * @returns `'none'` when unannotated, `'suppressed'` when annotated with a
 *   sufficient reason, `'missing-reason'` when annotated without one.
 */
function escapeHatchFor(lines: string[], hitLine: number): 'none' | 'suppressed' | 'missing-reason' {
  const candidates: string[] = [];

  // The hit line itself — a trailing `// respondent-write-drift-ok: …`.
  const onHitLine = lines[hitLine - 1];
  if (typeof onHitLine === 'string' && annotationIsInComment(onHitLine)) candidates.push(onHitLine);

  const stopAt = Math.max(1, hitLine - ANNOTATION_LOOKBACK_LINES);
  for (let n = hitLine - 1; n >= stopAt; n--) {
    const candidate = lines[n - 1];
    if (typeof candidate !== 'string') break;
    // L1 — a statement between the annotation and the hit breaks the link.
    if (isCodeLine(candidate)) break;
    if (annotationIsInComment(candidate)) candidates.push(candidate);
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
 * Rule 1 — Drizzle builder creation, any receiver, any SPELLING of the table.
 *
 * Matches `db.insert(respondents)`, `tx.insert(respondents)` and the bare
 * `.insert(respondents)` continuation spelling used at
 * `registration.controller.ts:919`. Pinning it to `db.` would leave the
 * cheapest evasion open: every transactional caller writes `tx.`.
 *
 * ⚠️ REVIEW H1 (2026-08-08) — THIS RULE USED TO REQUIRE THE BARE IDENTIFIER
 * `respondents`, AND THAT MADE THE GUARD DEFEATABLE BY A RENAME. Measured, not
 * theorised: a probe file carrying four un-sanctioned creations was dropped into
 * `src/services/` and the guard counted it and reported GREEN. All four evaded —
 *
 *     db.insert(schema.respondents)      // `import * as schema` — used at db/index.ts:3
 *     db.insert(respondentsTable)        // aliased import, the ordinary Drizzle idiom
 *     db.insert(respondents as any)      // a cast between the parens
 *     db.insert(\n  respondents,\n)      // multi-line with a trailing comma
 *
 * The whole premise of 13-54 is that R13/R21/13-53 each protected one more
 * CALLER; a guard that protects one more TOKEN is the same mistake at a smaller
 * scale. So the rule now accepts an optional dotted qualifier, any identifier
 * CONTAINING `respondents`, an optional `as` cast, and a trailing comma.
 *
 * KNOWN over-match, deliberate: a different table whose name contains
 * `respondents` (say `respondentsArchive`) is flagged. That fails LOUD and is
 * cleared by an allowlist entry or an inline reason — the safe direction.
 */
const BUILDER_INSERT_RE =
  /\.\s*insert\s*\(\s*(?:[\w$]+\s*\.\s*)*[\w$]*respondents[\w$]*\s*(?:as\s+[\w$<>[\].|\s]+?)?\s*[,)]/gi;

/**
 * Rule 2 — raw SQL creation: quoted, unquoted, and SCHEMA-QUALIFIED.
 *
 * `seed-projected-scale.ts:235` writes the unquoted form; Postgres accepts the
 * double-quoted identifier equally. Review H1 adds the qualifier: both
 * `INSERT INTO public.respondents` and `INSERT INTO "public"."respondents"`
 * previously sailed straight through.
 */
const RAW_INSERT_RE = /INSERT\s+INTO\s+(?:"?[\w$]+"?\s*\.\s*)?"?[\w$]*respondents[\w$]*"?/gi;

function offsetsOf(content: string, re: RegExp): number[] {
  const offsets: number[] = [];
  for (const match of content.matchAll(re)) {
    if (match.index !== undefined) offsets.push(match.index);
  }
  return offsets;
}

/**
 * Scan files for un-sanctioned respondent creation.
 *
 * Allow-listed files are skipped entirely (they create by design). Non-scannable
 * paths are skipped by rule. Results are sorted by file then line so CI output
 * is stable.
 */
export function findDriftHits(files: DriftFile[]): DriftHit[] {
  const hits: DriftHit[] = [];

  for (const { path, content } of files) {
    if (!isScannablePath(path)) continue;
    if (matchPathRule(path, ALLOWLIST)) continue;

    const lines = content.split('\n');
    // Match against comment-masked source (offsets/lines preserved); report
    // snippets and resolve escape hatches against the original.
    const scannable = maskComments(content);

    const candidates: Array<{ offset: number; rule: DriftRuleId }> = [
      ...offsetsOf(scannable, BUILDER_INSERT_RE).map((offset) => ({
        offset,
        rule: 'unsanctioned-respondent-insert' as const,
      })),
      ...offsetsOf(scannable, RAW_INSERT_RE).map((offset) => ({
        offset,
        rule: 'unsanctioned-respondent-raw-insert' as const,
      })),
    ];

    for (const { offset, rule } of candidates) {
      const line = lineNumberAt(content, offset);
      const verdict = escapeHatchFor(lines, line);
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

  // Review L4 — byte order, not locale order. `localeCompare` sorts differently
  // under different ICU data, so a Windows laptop and a Linux runner could print
  // the same hits in a different order and read as a different failure.
  return hits.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line);
}

/**
 * Render hits as the CI failure message (AC2).
 *
 * This message fires on someone who does not know any of this history, so it
 * has to teach rather than merely refuse: what was found, why it is blocked in
 * one sentence, how to do it correctly, and how to record a genuine exception.
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
    `❌ respondent-write drift: ${hits.length} un-sanctioned respondent creation${hits.length === 1 ? '' : 's'}.`,
    '',
    ...blocks,
    '',
    'FIX — route respondent creation through the chokepoint instead of creating a row directly:',
    '',
    "    import { findOrCreateRespondent } from '../services/submission-processing.service.js';",
    '',
    'It carries the identity guard (same phone + >=2 shared name tokens) that decides',
    'whether this person is ALREADY in the register under a different spelling of their',
    'name. Surname-first and dropped middle names are normal here, so exact name equality',
    'catches none of it — that is measured, not assumed (0 of 4 real collisions caught).',
    '',
    'GENUINE EXCEPTION — two ways, both deliberate and both reviewable:',
    '',
    `  1. Inline, for a one-off: put this in a COMMENT within ${ANNOTATION_LOOKBACK_LINES} lines above the call —`,
    '',
    `         // ${ESCAPE_HATCH_TOKEN}: <reason, at least ${MIN_REASON_CHARS} characters>`,
    '',
    '  2. Permanent, for a new sanctioned ingestion path: add the file to ALLOWLIST in',
    '     apps/api/src/lib/respondent-write-drift.ts — WITH A REASON. Adding one without',
    '     a reason is exactly how this class comes back: it makes the guard look satisfied',
    '     while removing the thing it was guarding.',
    '',
    '⚠️ SCOPE — this guard covers respondent CREATION only. It does NOT check',
    '   update(respondents), which spans 12 files and is owned by Story 13-55.',
    '   If you are filling a NIN or promoting someone to active, this guard has',
    '   nothing to say about your change — that does not mean it is safe.',
    '',
  ].join('\n');
}
