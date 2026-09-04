/**
 * Story 13-55 AC1.3 / AC1.4 — THE CENSUS, as an executable assertion.
 *
 * ── Why a source-level test and not a prose claim ───────────────────────────
 * AC1.4 says "the unified promote is the ONLY place that writes `respondents.nin` together with
 * `status = 'active'`". That is a statement about the whole tree, and the only honest way to keep
 * it true next month is to make it fail when it stops being true. 13-54 established the shape:
 * read the source, count the sites, red on drift.
 *
 * This story exists BECAUSE the count silently went from one to five. The shell that raised it said
 * there were three; the census found five, and the two nobody had counted were the two carrying the
 * live defects — a route whose audit action made it invisible to every promote monitor we have, and
 * two routes writing the same `trigger` from different code. Both were discovered by counting.
 * Nothing else would have found them, and nothing else will find the sixth.
 *
 * ⚠️ WHAT THIS DOES NOT DO. It reads text, not types, and it cannot evaluate SQL. A promote
 * assembled from fragments too far apart to see, or built at runtime, is invisible to it. That is
 * the same limit 13-54's guard carries and is stated for the same reason: a green here means "no
 * NEW spelling of the promote appeared", not "the promote is correct".
 *
 * ── Review M4: THE SPELLING LIMIT, stated because the distance limit was stated and this one was
 * not ────────────────────────────────────────────────────────────────────────
 * The detector needs to SEE `active` in the SET list. It now matches the quoted literal AND a
 * SCREAMING_CASE constant (`RESPONDENT_STATUS.ACTIVE`), because 13-55's own amendment to 13-54
 * Known limit #1 is the lesson that a guard blind to one spelling reads green and wrong. What
 * remains invisible, and cannot be fixed by a regex: a status chosen at RUNTIME
 * (`status: nextStatus`). A promote written that way is uncounted here, and the assertion in
 * `AC1.4 — the primitive has no production callers` below is what still catches it, because such a
 * promote has to reach the SQL through this module either way.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NIN_ARRIVAL_PROMOTABLE_STATUSES } from '../respondent-identity.js';

const API_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SEARCH_ROOTS = [join(API_ROOT, 'src'), join(API_ROOT, 'scripts')];

/** Every production `.ts` in the API — tests excluded, they are allowed to describe promotes. */
function productionSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules' || entry === 'dist') continue;
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
      out.push(full);
    }
  };
  SEARCH_ROOTS.forEach(walk);
  return out;
}

/*
 * ⭐ MEMOISED — the tree is walked ONCE, and each file is read ONCE (2026-09-04).
 *
 * `productionSources()` was called by five separate tests, each re-walking both
 * SEARCH_ROOTS with a `statSync` per directory entry, and each then `readFileSync`-ing
 * every file it found. That is five tree walks and roughly 1,980 file reads per run of
 * this one file, for a snapshot that cannot change while the process is alive.
 *
 * It made this the slowest API test file in the suite (9.7s / 12 tests = 811ms per test,
 * in a NODE environment where that should be milliseconds). Same shape as
 * `a3-eslint-policy` building a new ESLint per test: the work was redundant, not slow.
 *
 * ⚠️ Deliberately NOT a behaviour change — every caller sees exactly the bytes it saw
 * before. The census still reads the real tree; it just stops reading it five times.
 */
let sourceCache: Map<string, string> | undefined;
function sourceIndex(): Map<string, string> {
  if (!sourceCache) {
    sourceCache = new Map(productionSources().map((f) => [f, readFileSync(f, 'utf8')]));
  }
  return sourceCache;
}
/** Every production source, as [path, contents]. Walk + read happen once per process. */
function productionSourceEntries(): Array<[string, string]> {
  return [...sourceIndex()];
}

const rel = (f: string) => relative(API_ROOT, f).replace(/\\/g, '/');

/**
 * Does this window of source both fill a NIN and flip the status to `active`?
 *
 * Deliberately spelling-agnostic across the two forms the tree actually uses — the drizzle query
 * builder and raw `sql` — because 13-55's census found that TWO of the five promotes were the raw
 * form. A detector written against `.update(respondents)` alone would have been blind to the very
 * paths this story consolidated, which is exactly the trap 13-54's Known limit #1 was heading for.
 */
const WINDOW = 1400;
function promoteSitesIn(source: string): number {
  let count = 0;
  const starts = [
    ...source.matchAll(/\.update\(\s*respondents\s*\)/g),
    ...source.matchAll(/UPDATE\s+"respondents"/g),
  ];
  for (const m of starts) {
    const window = source.slice(m.index ?? 0, (m.index ?? 0) + WINDOW);
    // Review M4 — the quoted literal OR a constant spelling. Not a runtime value; see the header.
    const setsActive = /status['"]?\s*[:=]\s*('active'|[A-Za-z_$][\w$.]*\bACTIVE\b)/.test(window);
    const setsNin = /(^|[^a-zA-Z_])"?nin"?\s*[:=,]/m.test(window);
    if (setsActive && setsNin) count += 1;
  }
  return count;
}

describe('13-55 AC1.4 — exactly one implementation writes nin + status=active', () => {
  it('finds the promote in respondent-identity.ts and NOWHERE else', () => {
    const offenders: string[] = [];
    for (const [file, source] of productionSourceEntries()) {
      const sites = promoteSitesIn(source);
      if (sites > 0) offenders.push(`${rel(file)} (${sites})`);
    }

    /**
     * The whole point of the story, in one assertion. Before 13-55 this list held five entries:
     * `controllers/registration.controller.ts`, `services/submission-processing.service.ts`,
     * `services/me.service.ts`, `services/draft-adoption/promote-nin.ts` and
     * `services/respondent-identity.ts`.
     *
     * If this fails with a NEW file, do not add it to the list. Route that caller through
     * `promoteRespondentToActive` — that is what the list existing at all is for.
     */
    expect(offenders).toEqual(['src/services/respondent-identity.ts (1)']);
  });

  /**
   * ⚠️ REVIEW H1 — THE HOLE THE TEST ABOVE LEAVES, AND WHY COUNTING SQL SITES IS NOT ENOUGH.
   *
   * `respondent-identity.ts` told the reader this file already enforced "production code must call
   * `promoteRespondentToActive`". It did not. Counting SQL sites cannot see a bypass, because a
   * bypass writes NO SQL of its own — it calls the still-exported primitive and lets THIS module
   * issue the UPDATE. So the site count stays at 1, the six triggers stay six, every assertion
   * above stays green, and a sixth promote path ships **with no audit row at all** — precisely the
   * regression AC1.4 exists to prevent, and precisely how the count went 1 → 5 the first time.
   *
   * MEASURED, not reasoned. The review added `src/services/canary-sixth-promote.ts`:
   *
   *     export async function canarySixthPromote(respondentId: string, nin: string) {
   *       return promoteRespondentWithArrivingNin(db, { respondentId, nin });   // no audit
   *     }
   *
   * …and the census reported 9/9 passed. tsc clean, eslint clean, 13-54's drift guard silent (it
   * guards CREATION). Nothing in the repository objected. This assertion is what objects now, and
   * it was RED-verified by re-running the same canary: it fails naming the offending file.
   *
   * The primitive stays exported only for the 13 unit tests that bind to it directly (AC2.1 forbids
   * editing them), so `__tests__` is the sanctioned exception and the reason this cannot simply be
   * a lint rule on the export.
   */
  it('the SQL primitive has no production callers — a bypass writes no SQL of its own', () => {
    const PRIMITIVE = 'promoteRespondentWithArrivingNin';
    const callers: string[] = [];

    for (const [file, source] of productionSourceEntries()) {
      // The module that DEFINES the primitive is allowed to name it. Nothing else is.
      if (rel(file) === 'src/services/respondent-identity.ts') continue;
      // Strip comments first: prose about the primitive is documentation, not a call.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (new RegExp(`\\b${PRIMITIVE}\\b`).test(code)) callers.push(rel(file));
    }

    expect(
      callers,
      `${callers.join(', ')} reaches the SQL primitive directly and therefore promotes WITHOUT an ` +
        `audit row. Call promoteRespondentToActive instead — it writes PENDING_NIN_PROMOTED in ` +
        `your transaction, which is the whole point of Story 13-55.`,
    ).toEqual([]);
  });
});

/**
 * Story 13-55 Residual R2 — THE RAW-SQL INVENTORY, PINNED WITH REASONS.
 *
 * R2 recorded that `submission-processing.service.ts` still holds two raw `UPDATE "respondents"`
 * statements (9-58 / 13-21 metadata marker stamps), correctly excluded by the promote census
 * because neither writes a NIN, and filed it as "informational — feeds whatever story builds the
 * update-guard 13-54 limit #1 points at".
 *
 * ⚠️ Informational is how a measurement rots. 13-54's amendment already names THIS FILE as "the
 * working reference" for matching both spellings — a claim that was only true of the promote
 * detector above, while the six-file raw-SQL figure the amendment cites lived nowhere executable.
 * A number in a markdown file is not a measurement; it is a memory of one. So the inventory is an
 * assertion, and R2 becomes a guard instead of a note.
 *
 * WHAT A FAILURE HERE MEANS: someone added (or removed) a raw `UPDATE "respondents"`. That is not
 * forbidden — it is unreviewed. Add the file with a reason, exactly as 13-54's allowlist does, and
 * the next person inherits the reasoning instead of re-deriving it.
 */
describe('13-55 R2 — raw `UPDATE "respondents"` sites are inventoried, not merely counted', () => {
  const RAW_UPDATE_SITES: Record<string, { count: number; reason: string }> = {
    'src/services/respondent-identity.ts': {
      count: 1,
      reason: 'THE promote. The one site AC1.4 sanctions; every route reaches respondents through it.',
    },
    'src/services/registration-email-jobs.ts': {
      count: 2,
      reason:
        'R2 — metadata marker stamps only (9-58 confirmation-email, 13-21 thank-you send-once). ' +
        'Neither writes a NIN, so neither is a promote and the census above correctly ignores them. ' +
        '⚠️ Story 13-65 MOVED both, verbatim, out of `submission-processing.service.ts`: the sends ' +
        'they mark now execute in the email worker, and the handlers had to leave that service to ' +
        'avoid an ESM cycle (worker -> submission-processing -> queues). The guard caught the move, ' +
        'which is exactly what it is for — the count and the reason are unchanged, only the file is.',
    },
    'scripts/migrate-lgaid-uuid-to-slug.ts': {
      count: 1,
      reason: 'One-off LGA canonicalisation migration; touches lga_id, never nin or status.',
    },
    'scripts/_backfill-reference-code.ts': {
      count: 1,
      reason: 'Backfill of reference_code for rows minted before the code existed.',
    },
    'scripts/_backfill-wizard-public-users.ts': {
      count: 1,
      reason: 'Backfill linking wizard respondents to their public user accounts.',
    },
    'src/services/registration-status.service.ts': {
      count: 1,
      reason:
        'Story 13-50 AC1.3 — `ensureSignInAccount` stamps `respondents.user_id` after provisioning ' +
        'a passwordless sign-in account for a COMPLETE registrant who had none (the adopted-174 ' +
        'case), so the `login` magic link it is about to email can actually be redeemed. Writes ' +
        '`user_id` + `updated_at` ONLY — never nin, never status, so it is not a promote. Guarded ' +
        'on `user_id IS NULL` (same TOCTOU discipline as the 9-38 backfill, which is the sibling ' +
        'entry above) and non-fatal: a failure here leaves a working account merely unlinked.',
    },
    'scripts/_thankyou-referral-blast.ts': {
      count: 1,
      reason: 'Campaign send-once marker stamp; metadata only.',
    },
  };

  it('matches the pinned inventory — a new raw writer is unreviewed, not forbidden', () => {
    const measured: Record<string, number> = {};
    for (const [file, source] of productionSourceEntries()) {
      const hits = source.match(/UPDATE\s+"respondents"/g);
      if (hits) measured[rel(file)] = hits.length;
    }

    const expected = Object.fromEntries(
      Object.entries(RAW_UPDATE_SITES).map(([f, v]) => [f, v.count]),
    );
    expect(
      measured,
      'A raw `UPDATE "respondents"` site appeared or moved. If it is legitimate, add it to ' +
        'RAW_UPDATE_SITES with a reason. If it writes `nin` + `status`, it is a promote and belongs ' +
        'behind promoteRespondentToActive instead.',
    ).toEqual(expected);
  });

  /**
   * The figure 13-54 Known limit #1 was amended with, now measured rather than remembered. At
   * 13-55 it was SIX files, TWO of which were promote paths before that story — an update-guard
   * written only against `.update(respondents)` would have been blind to exactly those two.
   *
   * **Now SEVEN (2026-08-23, Story 13-50).** 13-55 R2 closed with the words "a 7th site reds and
   * someone reads it", and that is precisely what happened: `registration-status.service.ts` gained
   * a `user_id` stamp and this assertion went red until the site was entered above with a reason.
   * The tripwire worked, so the number moves — the point was never that six is correct forever,
   * it is that the count cannot change without somebody writing down why.
   */
  it('holds the raw-SQL site figure — 6 at 13-55, 7 since 13-50', () => {
    expect(Object.keys(RAW_UPDATE_SITES)).toHaveLength(7);
  });
});

describe('13-55 AC1.3 — every route is separately attributable in the audit trail', () => {
  /** Pull every `trigger: '<literal>'` handed to the shared promote, with its file. */
  function triggerCallSites(): Array<{ file: string; trigger: string }> {
    const found: Array<{ file: string; trigger: string }> = [];
    for (const [file, source] of productionSourceEntries()) {
      for (const m of source.matchAll(/promoteRespondentToActive\s*\([\s\S]{0,1600}?\)/g)) {
        for (const t of m[0].matchAll(/\btrigger:\s*'([a-z0-9_]+)'/g)) {
          found.push({ file: rel(file), trigger: t[1] });
        }
      }
    }
    return found;
  }

  it('every call site passes a trigger, and no two call sites share one', () => {
    const sites = triggerCallSites();
    // Five callers; the queue service holds two of them (strict merge + fuzzy NIN-arrival).
    expect(sites.length).toBe(6);

    const triggers = sites.map((s) => s.trigger);
    /**
     * THE DEFECT THIS STORY FOUND, PINNED. `nin_arrival_identity_match` was written by BOTH the
     * public wizard and the ingestion queue, so `audit_logs.details->>'trigger'` could not say
     * which route promoted a given citizen — the one thing 13-53 required it always say. A
     * duplicate here means that has happened again.
     */
    expect(new Set(triggers).size).toBe(triggers.length);

    // …and every one is a declared member of the union, not a free-form string that merely typed.
    expect(new Set(triggers)).toEqual(
      new Set([
        'magic_link_complete_nin',
        'race_resolution_merge',
        'nin_arrival_wizard',
        'nin_arrival_identity_match',
        'draft_adoption_ac14',
        'authenticated_dashboard_nin',
      ]),
    );
  });

  /**
   * AC3.3 — the route that was invisible.
   *
   * `MeService.completeNinAuthenticated` wrote `RESPONDENT_SELF_NIN_COMPLETED` and nothing else,
   * while every other promote wrote `PENDING_NIN_PROMOTED`. `reconcile-nin-promotion-audit.ts`
   * and 13-44's promote digest both filter on the latter, so a respondent completing their NIN
   * from their own dashboard was counted nowhere — a zero that means "the query cannot see this",
   * which is indistinguishable from "it did not happen".
   *
   * It must now write BOTH: the promote action so the counts are true, and the 9-61 action so no
   * existing consumer breaks.
   */
  it('the authenticated dashboard route writes BOTH audit actions', () => {
    const source = readFileSync(join(API_ROOT, 'src/services/me.service.ts'), 'utf8');
    const fn = source.slice(source.indexOf('completeNinAuthenticated'));
    expect(fn).toMatch(/promoteRespondentToActive/);
    expect(fn).toMatch(/RESPONDENT_SELF_NIN_COMPLETED/);
  });
});

describe('13-55 AC1.5 — no caller widened its status scope', () => {
  /**
   * Each caller's scope must be NARROWER THAN OR EQUAL TO what it had before the refactor. These
   * are the pre-13-55 scopes, read off the five implementations:
   *
   *   magic link            pending_nin_capture
   *   race-resolution merge pending_nin_capture
   *   draft adoption        nin_unavailable
   *   authenticated self    pending_nin_capture
   *   NIN arrival (13-53)   pending_nin_capture · nin_unavailable · active  (the H1 allow-list)
   *
   * A widening is not a refactor — it is a policy change to who may be promoted, and it belongs to
   * a story that argues for it.
   */
  const EXPECTED_SCOPES: Record<string, readonly string[]> = {
    magic_link_complete_nin: ['pending_nin_capture'],
    race_resolution_merge: ['pending_nin_capture'],
    draft_adoption_ac14: ['nin_unavailable'],
    authenticated_dashboard_nin: ['pending_nin_capture'],
    // The two NIN-arrival callers pass no `allowedStatuses` and so inherit the 13-53 allow-list.
    nin_arrival_wizard: NIN_ARRIVAL_PROMOTABLE_STATUSES,
    nin_arrival_identity_match: NIN_ARRIVAL_PROMOTABLE_STATUSES,
  };

  it.each(Object.entries(EXPECTED_SCOPES))(
    '%s promotes only its own statuses',
    (trigger, expected) => {
      /**
       * Each call site's block runs from its own `promoteRespondentToActive(` to the NEXT one (or
       * end of file). Bounding on the next call rather than on a closing brace matters: these call
       * sites carry long comment blocks, and a brace-counting terminator stopped early on the
       * wizard's — which would have silently reported "no call site" for the very path this story
       * renamed.
       */
      let block: string | null = null;
      for (const [file, source] of productionSourceEntries()) {
        const starts = [...source.matchAll(/promoteRespondentToActive\s*\(/g)].map((m) => m.index!);
        for (let i = 0; i < starts.length; i += 1) {
          const seg = source.slice(starts[i], starts[i + 1] ?? source.length);
          if (new RegExp(`trigger:\\s*'${trigger}'`).test(seg)) block = seg;
        }
      }
      expect(block, `no call site found for trigger '${trigger}'`).not.toBeNull();

      const declared = block!.match(/allowedStatuses:\s*\[([^\]]*)\]/);
      const scope = declared
        ? declared[1]
            .split(',')
            .map((s) => s.trim().replace(/^'|'$/g, ''))
            .filter(Boolean)
        : [...NIN_ARRIVAL_PROMOTABLE_STATUSES];

      expect(new Set(scope)).toEqual(new Set(expected));
    },
  );
});
