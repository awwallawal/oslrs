/**
 * Story 13-37 — registry-read drift guard (CLI).
 *
 * Fails the build when new code hand-rolls a respondent⟕submission registry
 * read instead of composing the ONE canonical `registryUnifiedSource` that
 * Story 13-33 established. Doc nudges (the read's governance header, the
 * per-story harmonization notes) only work if someone reads them; this makes
 * the wrong way hard to WRITE.
 *
 * Usage:
 *   pnpm --filter @oslsr/api lint:registry-read
 *   (also folded into the package `lint` chain, so pre-commit/pre-push cover it,
 *    and run as its own blocking step in the ci-cd.yml `lint-and-build` job)
 *
 * Exit codes:
 *   0 — no unallow-listed drift.
 *   1 — at least one blocked read (or a usage/read error).
 *
 * The detector lives in ../src/lib/registry-read-drift.ts and is unit-tested by
 * the test-api CI job (src/lib/__tests__/registry-read-drift.test.ts) — this
 * file is only I/O + exit code. `scripts/` is outside tsconfig, so it is RUN,
 * never type-checked; keep logic in src/lib.
 *
 * ⚠️ In CI this runs as its own NAMED step that must stay ABOVE the `Lint` step
 * in ci-cd.yml. It is also folded into the api `lint` chain for pre-commit
 * cover; if `Lint` ran first, a drift would abort the job there and the named
 * step would never execute. See the ordering note in ci-cd.yml.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDriftHits, formatHits, type DriftFile } from '../src/lib/registry-read-drift.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Scanned roots. `src` is AC1's scope; `scripts` was added by the 13-37 code
 * review — one-off backfills and migrations are exactly where someone would
 * write a quick registry count, and leaving them unscanned meant the guard was
 * blind in the highest-risk-per-line directory in the package. Measured free:
 * 54 script files, 0 hits.
 */
const SCAN_ROOTS = [join(PACKAGE_ROOT, 'src'), join(PACKAGE_ROOT, 'scripts')];

/** Directories never scanned. `__tests__`/`test` hold deliberate drift FIXTURES. */
const SKIP_DIRS = new Set(['__tests__', 'test', 'tests', 'node_modules', 'dist']);

/** Test/declaration suffixes never scanned (fixtures, not reads). */
const SKIP_SUFFIXES = ['.test.ts', '.spec.ts', '.d.ts'];

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      found.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts') && !SKIP_SUFFIXES.some((s) => entry.endsWith(s))) {
      found.push(full);
    }
  }
  return found;
}

function main(): void {
  let files: DriftFile[];
  try {
    files = SCAN_ROOTS.flatMap(collectSourceFiles).map((absolute) => ({
      // Package-relative + forward slashes so allowlist patterns and CI output
      // are identical on Windows and Linux.
      path: relative(PACKAGE_ROOT, absolute).replace(/\\/g, '/'),
      content: readFileSync(absolute, 'utf8'),
    }));
  } catch (err) {
    console.error(`❌ registry-read drift guard: could not read ${SCAN_ROOTS.join(' / ')}`);
    console.error(`   ${(err as Error).message}`);
    process.exit(1);
  }

  const hits = findDriftHits(files);

  if (hits.length === 0) {
    console.log(`✅ registry-read drift guard: ${files.length} files scanned, no drift.`);
    process.exit(0);
  }

  console.error(formatHits(hits));
  process.exit(1);
}

main();
