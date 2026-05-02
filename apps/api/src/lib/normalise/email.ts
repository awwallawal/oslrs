/**
 * Email normaliser.
 *
 * Lowercases + trims input. Detects common domain typos via a curated
 * dictionary loaded at module init from `typo-dictionary.json`. The dictionary
 * is config (not code) so production updates do not require a deploy.
 *
 * Warning codes:
 *   - empty_input
 *   - invalid_format             (no `@`, or `@` at boundary)
 *   - missing_tld                (domain has no `.`)
 *   - suspected_typo:<bad>-><fix> (domain matched typo dictionary)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormaliseResult } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TypoDict {
  domain_typos: Record<string, string>;
}

// F5 (code-review 2026-05-02): graceful fallback on missing/malformed JSON.
// Previously the top-level `JSON.parse(readFileSync(...))` would crash the
// entire app at startup if the dictionary file was missing or corrupt. Now we
// fall back to an empty dictionary + log to stderr so the operator notices,
// but the app keeps running with no typo detection.
//
// Note: dictionary is read at MODULE INIT (not request-time). Updates to the
// JSON file require `pm2 restart oslsr-api --update-env` to take effect — the
// "no deploy needed" claim in story Risks #3 means no CODE deploy, but pm2
// restart IS needed.
function loadTypoDict(): TypoDict {
  try {
    return JSON.parse(
      readFileSync(join(__dirname, 'typo-dictionary.json'), 'utf8'),
    ) as TypoDict;
  } catch (err) {
    process.stderr.write(
      `[normalise/email] WARN: typo-dictionary.json failed to load (${(err as Error).message}); typo detection disabled\n`,
    );
    return { domain_typos: {} };
  }
}

const dict: TypoDict = loadTypoDict();

export function normaliseEmail(input: unknown): NormaliseResult {
  const warnings: string[] = [];

  if (typeof input !== 'string' || input.trim() === '') {
    return { value: '', warnings: ['empty_input'] };
  }

  const trimmed = input.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return { value: trimmed, warnings: ['invalid_format'] };
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  const corrected = dict.domain_typos[domain];
  if (corrected) {
    // F12 (code-review 2026-05-02): warn-only by design. Auto-correcting a
    // typo without user confirmation is a UX foot-gun (`gmail.vom` → `gmail.com`
    // looks helpful but `mybusiness.vom` → ??? is ambiguous). The frontend
    // Email-Typo Detection pattern (UX Form Pattern A.3, shipped in Story
    // 9-12 wizard) surfaces the suggested correction to the user with a
    // one-tap accept; the server-side normaliser only flags it for the audit
    // log so silent corruption is impossible.
    warnings.push(`suspected_typo:${domain}->${corrected}`);
  }

  if (!domain.includes('.')) {
    warnings.push('missing_tld');
  }

  return { value: `${local}@${domain}`, warnings };
}
