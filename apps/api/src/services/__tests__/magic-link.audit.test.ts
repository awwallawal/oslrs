import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Story 13-50 AC2 — `magic_link.issued` IS WRITTEN AT THE MINT, NOT BY THE CALLER.
 *
 * THE BLIND SPOT THIS CLOSES. On 2026-08-05, 86 `wizard_resume` tokens were minted and
 * `magic_link.issued` recorded only `login` and `pending_nin_complete`. An entire token purpose
 * was invisible to the audit trail — which is why the dead-end link in AC1 looked like a small
 * fixed problem for a day. The stock was measured at 37, a mitigation was sized against 37, and
 * an hour later the same query returned 39; **the number moving between two measurements is the
 * only reason a producer was looked for at all.** With the mints audited, "86 today" would have
 * been on the first screen instead of the fifth.
 *
 * WHY THE AUDIT MOVED INTO `issueToken`. A census on 2026-08-23 found **10 mint sites and only 4
 * audit writes.** Auditing per-caller is the failure mode in
 * [[pattern-census-counts-sites-not-callers]]: the census counts SITES, a new caller simply
 * doesn't write a row, and nothing goes red. Making the audit a property of the PRIMITIVE means a
 * mint that is not audited is not expressible.
 *
 * WHY A SOURCE SCAN AND NOT JUST THE TYPE. `trigger` is a required arg, so `tsc` catches an
 * omission in `src/` — but **`scripts/` is outside `tsconfig`** (MEMORY.md: "RUN scripts, don't
 * trust tsc"), and 6 of the 10 mint sites live in `scripts/`. The type system covers exactly the
 * half of the census that was already audited. The scan below covers the half that was not.
 */

const mockInsertReturning = vi.fn();
const mockLogAction = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    insert: () => ({
      values: () => ({ returning: (...a: unknown[]) => mockInsertReturning(...a) }),
    }),
  },
}));
vi.mock('../email.service.js', () => ({
  EmailService: { sendGenericEmail: vi.fn().mockResolvedValue({ success: true }) },
}));
vi.mock('../audit.service.js', () => ({
  AuditService: { logAction: (...a: unknown[]) => mockLogAction(...a) },
  AUDIT_ACTIONS: { MAGIC_LINK_ISSUED: 'magic_link.issued', MAGIC_LINK_REDEEMED: 'magic_link.redeemed' },
  AUDIT_TARGETS: { MAGIC_LINK_TOKEN: 'magic_link_token' },
}));

const { MagicLinkService, MAGIC_LINK_TRIGGERS } = await import('../magic-link.service.js');
const { magicLinkPurposes } = await import('../../db/schema/magic-link-tokens.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockInsertReturning.mockResolvedValue([
    { id: 'tok-abc', email: 'person@example.com' },
  ]);
});

describe('13-50 AC2 — every mint writes exactly one audit row', () => {
  it('writes magic_link.issued carrying the purpose and the trigger', async () => {
    await MagicLinkService.issueToken({
      email: 'Person@Example.com',
      purpose: 'wizard_resume',
      trigger: 'check_registration_status',
      respondentId: 'r-1',
    });

    expect(mockLogAction).toHaveBeenCalledTimes(1);
    const row = mockLogAction.mock.calls[0][0];
    expect(row.action).toBe('magic_link.issued');
    expect(row.targetId).toBe('tok-abc');
    expect(row.details).toMatchObject({
      purpose: 'wizard_resume',
      trigger: 'check_registration_status',
      respondentId: 'r-1',
    });
  });

  /**
   * AC2.2 — "the audit row records WHY it was issued, so /check-registration mints are
   * distinguishable from genuine mid-wizard resumes. Without that, the count is a number with no
   * denominator." Two mints of the SAME purpose must be tellable apart.
   */
  it('distinguishes two wizard_resume mints by trigger — the denominator AC2.2 asks for', async () => {
    await MagicLinkService.issueToken({
      email: 'a@example.com', purpose: 'wizard_resume', trigger: 'check_registration_status',
    });
    await MagicLinkService.issueToken({
      email: 'b@example.com', purpose: 'wizard_resume', trigger: 'draft_adoption_invite',
    });

    const triggers = mockLogAction.mock.calls.map((c) => c[0].details.trigger);
    expect(triggers).toEqual(['check_registration_status', 'draft_adoption_invite']);
  });

  /**
   * AC2.3 — "Enumerate the enum in db/schema/magic-link-tokens.ts and confirm each mint site
   * writes an audit row — an audit-coverage gap found by accident twice is a gap nobody has ever
   * swept." Driving the assertion off the enum itself means a FIFTH purpose added later is
   * covered the day it is added, not the day somebody notices.
   */
  it('audits EVERY purpose in the enum, not just the ones somebody remembered', async () => {
    expect(magicLinkPurposes.length).toBeGreaterThan(0);
    for (const purpose of magicLinkPurposes) {
      mockLogAction.mockClear();
      await MagicLinkService.issueToken({
        email: 'sweep@example.com', purpose, trigger: 'operator_manual_mint',
      });
      expect(mockLogAction, `purpose '${purpose}' minted without an audit row`).toHaveBeenCalledTimes(1);
      expect(mockLogAction.mock.calls[0][0].details.purpose).toBe(purpose);
    }
  });

  it('carries no plaintext token into the audit trail', async () => {
    const issued = await MagicLinkService.issueToken({
      email: 'p@example.com', purpose: 'login', trigger: 'public_magic_link_request',
    });
    const serialised = JSON.stringify(mockLogAction.mock.calls[0][0]);
    expect(serialised).not.toContain(issued.tokenPlaintext);
  });
});

// ── The census, as a test ────────────────────────────────────────────────────
const API_ROOT = join(import.meta.dirname, '..', '..', '..');

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
      out.push(...tsFilesUnder(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Slice the argument list of a call starting at `callIndex`, by paren balance. */
function argsOf(source: string, callIndex: number): string {
  const open = source.indexOf('(', callIndex);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

describe('13-50 AC2.3 — the mint census, pinned', () => {
  const sites = tsFilesUnder(join(API_ROOT, 'src'))
    .concat(tsFilesUnder(join(API_ROOT, 'scripts')))
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const found: Array<{ file: string; args: string }> = [];
      let from = 0;
      for (;;) {
        const at = source.indexOf('MagicLinkService.issueToken', from);
        if (at === -1) break;
        from = at + 1;
        // Skip prose references in doc comments — a real call is followed by `(`.
        const next = source.slice(at + 'MagicLinkService.issueToken'.length).trimStart();
        if (!next.startsWith('(')) continue;
        found.push({ file: file.slice(API_ROOT.length + 1), args: argsOf(source, at) });
      }
      return found;
    });

  it('finds the mint sites at all (a zero here means the scan broke, not that the code is clean)', () => {
    // An empty result read as a negative result is its own defect class. If this scan silently
    // matched nothing, every assertion below would vacuously pass.
    expect(sites.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * ⚠️ CODE REVIEW 2026-08-24 (L2) — PIN THE CENSUS, DON'T FLOOR IT.
   *
   * This read `>= 9` while the measured census was 10, so a mint site could be DELETED and the
   * gate would still pass — and a census whose whole job is to be exact should not be satisfied
   * by "about nine". Bump this number and say why: the same convention `AUDIT_ACTIONS` and
   * `RAW_UPDATE_SITES` already follow.
   *
   * 10 at 13-50 (2026-08-23): 4 in `src/`, 6 in `scripts/`.
   */
  it('holds the mint-site figure — 10 since 13-50', () => {
    expect(sites.length).toBe(10);
  });

  /**
   * ⚠️ CODE REVIEW 2026-08-24 (L2) — PIN THE BINDING, WHICH IS WHAT TASK 2.1 ASKED FOR.
   *
   * Everything above keys off the literal text `MagicLinkService.issueToken`. A caller that
   * destructures (`const { issueToken } = MagicLinkService`) or aliases the class evades the scan
   * entirely — and in `scripts/`, which is outside tsconfig, it also evades the required-arg type.
   * That is [[pattern-census-counts-sites-not-callers]] reappearing inside the guard written to
   * prevent it. So: every `issueToken(` call in the tree must be reached through the class.
   */
  it('no caller reaches issueToken through an aliased or destructured binding', () => {
    const offenders: string[] = [];
    const all = tsFilesUnder(join(API_ROOT, 'src')).concat(tsFilesUnder(join(API_ROOT, 'scripts')));
    for (const file of all) {
      const source = readFileSync(file, 'utf8');
      const rel = file.slice(API_ROOT.length + 1);
      // The primitive's own declaration is not a caller.
      if (rel.endsWith('magic-link.service.ts')) continue;
      for (const m of source.matchAll(/(\w*)\.?issueToken\s*\(/g)) {
        if (m[1] !== 'MagicLinkService') offenders.push(`${rel} -> ${m[0].trim()}`);
      }
      if (/\{[^}]*issueToken[^}]*\}\s*=\s*MagicLinkService/.test(source)) {
        offenders.push(`${rel} -> destructured issueToken`);
      }
    }
    expect(offenders, `mint reached off-binding: ${offenders.join(' | ')}`).toEqual([]);
  });

  it.each(
    // `it.each` over a computed list still needs at least one row to register a test.
    sites.length ? sites : [{ file: '<scan produced nothing>', args: "trigger: 'nin_reconfirm'" }],
  )('$file names its trigger', ({ args }) => {
    expect(args).toMatch(/\btrigger\s*:/);
  });

  /**
   * ── CODE REVIEW 2026-08-24 (H2) — A CALLED WRITE IS NOT A COMMITTED ROW ──────────────────
   *
   * The assertions above prove `logAction` was CALLED. In `src/` that is enough: the process
   * outlives the write. In `scripts/` it is not — every one of these ends in `process.exit()`,
   * which kills the detached hash-chain transaction mid-flight (Story 9-26 Part H / M1, restated
   * in `_recover-abandoned-wizard-drafts.ts`; 13-46 F1). `nin-reconfirm.ts` used to write this
   * row with an awaited `logActionTx` and 13-50 removed that guarantee without noticing.
   *
   * So the scan pins the FLUSH as well as the trigger. `scripts/` is outside tsconfig, so this is
   * the only gate that can reach it.
   */
  it.each(
    sites.length
      ? sites.filter((s) => s.file.startsWith('scripts')) // path sep differs by OS; the prefix does not
      : [{ file: '<scan produced nothing>', args: "auditMode: 'awaited'" }],
  )('$file flushes its audit row before the process can exit', ({ args }) => {
    expect(args).toMatch(/\bauditMode\s*:\s*'awaited'/);
  });

  /**
   * Presence is not correctness. In `src/` the closed `MagicLinkTrigger` union means `tsc`
   * rejects a value that is not a member — but `scripts/` is excluded from tsconfig, so there a
   * typo'd trigger compiles, runs, and writes a real audit row under a label nothing groups on.
   * That row would be counted as "some other trigger" forever. Pin the VALUE, not just the key.
   */
  it.each(
    sites.length ? sites : [{ file: '<scan produced nothing>', args: "trigger: 'nin_reconfirm'" }],
  )('$file uses a trigger that exists in MAGIC_LINK_TRIGGERS', ({ args }) => {
    const named = args.match(/\btrigger\s*:\s*'([^']+)'/);
    expect(named, `no literal trigger found in: ${args.slice(0, 120)}`).not.toBeNull();
    expect(MAGIC_LINK_TRIGGERS as readonly string[]).toContain(named![1]);
  });
});
