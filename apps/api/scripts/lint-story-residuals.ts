/**
 * Story 13-45 — CI guard: a story may not read `Status: done` while a residual is OPEN.
 * Story 13-70 — AND a residual that named a date may not sit past it.
 *
 * I/O and exit code only; the detector lives in `../src/lib/story-residual-guard.ts` and is
 * unit-tested by the test-api job. `scripts/` is outside tsconfig, so it is RUN, never
 * type-checked — keep logic in src/lib. (Same split as `lint-registry-read-drift.ts`.)
 *
 * ⚠️ RUN IT DIRECT — `pnpm --filter @oslsr/api run lint:story-residuals`, never through `pnpm lint`.
 * `_bmad-output/**` is outside the turbo `lint` task's inputs, so a story-only change replays a
 * CACHED verdict (playbook §2y(c)). Live proof 2026-09-20: the pre-commit hook reported "327 stories
 * scanned" from cache while the direct run reported 328 — the hook never saw a ledger just added.
 *
 * Exit codes:
 *   0 — no story marked done carries an open residual, and no dated deferral has expired.
 *   1 — at least one does (or the artefacts directory could not be read).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findDoneStoriesWithOpenResiduals,
  findExpiredDatedResiduals,
  formatResidualHits,
  formatExpiredResiduals,
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

// Story 13-70 4.1d — ONE clock, read once, UTC. Never `new Date()` inside the detector, so the
// guard cannot change its answer at local midnight and the tests can pass a fixed day.
const now = new Date();

const hits = findDoneStoriesWithOpenResiduals(stories);
const expired = findExpiredDatedResiduals(stories, now);

if (hits.length === 0 && expired.length === 0) {
  console.log(
    `✅ story-residual guard: ${stories.length} stories scanned, no done-with-open-residuals, ` +
      `no expired DATED deferrals (today ${now.toISOString().slice(0, 10)} UTC).`,
  );
  process.exit(0);
}

if (hits.length > 0) {
  console.error('');
  console.error('❌ story-residual guard: a story is marked `done` while residuals are still OPEN.');
  console.error('');
  console.error(formatResidualHits(hits));
  console.error('');
  console.error('   The residual ledger is only worth keeping if `done` means done. Either close the');
  console.error('   row with re-runnable evidence, ACCEPT it explicitly with an owner and a reopen');
  console.error('   trigger, or hand it to a named story — then say so in the state cell.');
  console.error('   Moving the story back to `review` also clears this.');
}

if (expired.length > 0) {
  console.error('');
  console.error('❌ story-residual guard: a residual named a date, and the date has passed.');
  console.error('');
  console.error(formatExpiredResiduals(expired, now));
  console.error('');
  console.error('   This is the deliverable of Story 13-70, not a defect in it: a deferral that names');
  console.error('   a date is supposed to become loud when the date arrives. Do ONE of:');
  console.error('     • do the work, and close the row with re-runnable evidence;');
  console.error('     • re-date it — change the `DATED <iso>` marker, and say in the row WHY it moved');
  console.error('       and who decided. A date moved without a reason is how this got here;');
  console.error('     • drop the deadline deliberately: remove the `DATED` marker and give the row a');
  console.error('       reopen TRIGGER instead, which is the right shape for an event, not a date.');
  console.error('   ⛔ Do NOT soften the guard to make this quiet.');
}

process.exit(1);
