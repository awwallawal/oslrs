/**
 * Story 13-45 — CI guard: a story may not read `Status: done` while a residual is OPEN.
 *
 * I/O and exit code only; the detector lives in `../src/lib/story-residual-guard.ts` and is
 * unit-tested by the test-api job. `scripts/` is outside tsconfig, so it is RUN, never
 * type-checked — keep logic in src/lib. (Same split as `lint-registry-read-drift.ts`.)
 *
 * Exit codes:
 *   0 — no story marked done carries an open residual.
 *   1 — at least one does (or the artefacts directory could not be read).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findDoneStoriesWithOpenResiduals,
  formatResidualHits,
  type StoryFile,
} from '../src/lib/story-residual-guard.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ARTIFACTS = join(REPO_ROOT, '_bmad-output', 'implementation-artifacts');

function readStories(dir: string): StoryFile[] {
  const out: StoryFile[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isFile() || !entry.endsWith('.md')) continue;
    out.push({ path: relative(REPO_ROOT, full).replace(/\\/g, '/'), content: readFileSync(full, 'utf8') });
  }
  return out;
}

let stories: StoryFile[];
try {
  stories = readStories(ARTIFACTS);
} catch (err) {
  console.error(`❌ story-residual guard: cannot read ${ARTIFACTS}: ${(err as Error).message}`);
  process.exit(1);
}

const hits = findDoneStoriesWithOpenResiduals(stories);

if (hits.length === 0) {
  console.log(`✅ story-residual guard: ${stories.length} stories scanned, no done-with-open-residuals.`);
  process.exit(0);
}

console.error('');
console.error('❌ story-residual guard: a story is marked `done` while residuals are still OPEN.');
console.error('');
console.error(formatResidualHits(hits));
console.error('');
console.error('   The residual ledger is only worth keeping if `done` means done. Either close the');
console.error('   row with re-runnable evidence, ACCEPT it explicitly with an owner and a reopen');
console.error('   trigger, or hand it to a named story — then say so in the state cell.');
console.error('   Moving the story back to `review` also clears this.');
process.exit(1);
