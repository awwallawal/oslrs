/**
 * Story 13-54 — respondent-write drift guard (CLI).
 *
 * Fails the build when a respondent is CREATED outside the sanctioned
 * chokepoint. The same defect has been fixed by hand three times — R13, then
 * R21 (13-49), then 13-53 — each fix protecting one more caller rather than the
 * class, and twice discovered only after a real citizen was already holding two
 * records. Doc nudges only work if someone reads them; this makes the wrong way
 * hard to WRITE.
 *
 * Usage:
 *   pnpm --filter @oslsr/api lint:respondent-write
 *   (also folded into the package `lint` chain, so pre-commit/pre-push cover it,
 *    and run as its own blocking step in the ci-cd.yml `lint-and-build` job)
 *
 * Exit codes:
 *   0 — no unallow-listed respondent creation.
 *   1 — at least one blocked creation (or a usage/read error).
 *
 * The detector lives in ../src/lib/respondent-write-drift.ts and is unit-tested
 * by the test-api CI job (src/lib/__tests__/respondent-write-drift.test.ts) —
 * this file is only I/O + exit code. `scripts/` is outside tsconfig, so it is
 * RUN, never type-checked; keep logic in src/lib. That includes the
 * scannable-path rule: `isScannablePath` is imported rather than re-declared
 * here, because it is what keeps ~35 fixture creation sites out of the
 * allowlist and it deserves to be type-checked and tested.
 *
 * ⚠️ In CI this runs as its own NAMED step that must stay ABOVE the `Lint` step
 * in ci-cd.yml. It is also folded into the api `lint` chain for pre-commit
 * cover; if `Lint` ran first, a drift would abort the job there and the named
 * step would never execute. See the ordering note in ci-cd.yml (Pitfall #45).
 *
 * ⚠️ SCOPE: this guard covers respondent CREATION. `update(respondents)` spans
 * 12 files and is owned by Story 13-55.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findDriftHits,
  formatHits,
  isScannablePath,
  type DriftFile,
} from '../src/lib/respondent-write-drift.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Scanned roots. `scripts` is included for the same reason the 13-37 code
 * review added it there: one-off backfills and migrations are exactly where
 * someone would write a quick respondent insert, and leaving them unscanned
 * would make the guard blind in the highest-risk-per-line directory in the
 * package. Six of the twelve `update(respondents)` callers already live there.
 */
const SCAN_ROOTS = [join(PACKAGE_ROOT, 'src'), join(PACKAGE_ROOT, 'scripts')];

/** Pruned during the walk for speed. `isScannablePath` is the real authority. */
const PRUNE_DIRS = new Set(['node_modules', 'dist', '__tests__', 'test', 'tests']);

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (PRUNE_DIRS.has(entry)) continue;
      found.push(...collectSourceFiles(full));
    } else {
      found.push(full);
    }
  }
  return found;
}

function main(): void {
  let files: DriftFile[];
  try {
    files = SCAN_ROOTS.flatMap(collectSourceFiles)
      // Package-relative + forward slashes so allowlist patterns and CI output
      // are identical on Windows and Linux.
      .map((absolute) => relative(PACKAGE_ROOT, absolute).replace(/\\/g, '/'))
      .filter(isScannablePath)
      .map((path) => ({
        path,
        content: readFileSync(join(PACKAGE_ROOT, path), 'utf8'),
      }));
  } catch (err) {
    console.error(`❌ respondent-write drift guard: could not read ${SCAN_ROOTS.join(' / ')}`);
    console.error(`   ${(err as Error).message}`);
    process.exit(1);
  }

  const hits = findDriftHits(files);

  if (hits.length === 0) {
    console.log(
      `✅ respondent-write drift guard: ${files.length} files scanned, no un-sanctioned respondent CREATION.`,
    );
    console.log('   (Scope: creation only — update(respondents) is Story 13-55, not checked here.)');
    process.exit(0);
  }

  console.error(formatHits(hits));
  process.exit(1);
}

main();
