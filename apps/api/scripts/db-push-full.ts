/**
 * db:push:full — local-dev umbrella that runs `drizzle-kit push` PLUS every
 * idempotent migrate-init runner in sequence.
 *
 * **Why this script exists:**
 * `drizzle-kit push:force` aggressively reconciles — it DROPS any constraint
 * or index that isn't expressed in the Drizzle schema. That includes:
 *   - `chk_respondents_phone_number_e164` (prep-input-sanitisation-layer)
 *   - `respondents_status_check` CHECK (Story 11-1)
 *   - `respondents_nin_unique_when_present` partial UNIQUE (Story 11-1)
 *
 * Drizzle 0.45 cannot express CHECK constraints or partial unique indexes in
 * the pgTable schema, so they live in `migrate-*-init.ts` runners. Production
 * deploys (.github/workflows/ci-cd.yml) chain `db:push` + every runner, so the
 * brief reconciliation gap is paved over within seconds. Local dev had no
 * such umbrella — `pnpm db:push` standalone leaves the local DB without any
 * of the init-script-managed objects until the developer remembers to run the
 * runners manually. This script closes that gap.
 *
 * **Usage:**
 *   pnpm --filter @oslsr/api db:push:full         # interactive push (safe by default)
 *   pnpm --filter @oslsr/api db:push:full --force # auto-approve drops (matches db:push:force)
 *
 * **What it runs (in order):**
 *   1. `drizzle-kit push` (or `db:push:force` with --force)
 *   2. Every `apps/api/scripts/migrate-*-init.ts` runner (alphabetical order)
 *
 * Adding a new migrate-init runner? Just drop it in `apps/api/scripts/`
 * matching the `migrate-*-init.ts` glob — this script auto-discovers it.
 *
 * **Production:** does NOT replace ci-cd.yml. Production deploys keep their
 * explicit step ordering for audit-trail clarity. This script is local-dev only.
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

const FORCE = process.argv.includes('--force');

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n[db:push:full] $ ${cmd} ${args.join(' ')}\n`);
    // L2 (code-review 2026-05-03) — `shell: true` is intentional. Required
    // for cross-platform `pnpm` resolution: on Windows, `pnpm` resolves to
    // `pnpm.cmd` which spawn() can only invoke via shell. cmd + args are
    // hardcoded in this file (no user input flows through), so shell injection
    // is not a risk surface. If we ever take cmd from user input, switch to
    // `shell: false` + an explicit Windows-aware path resolver.
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, cwd: apiRoot });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

/**
 * ⛔ Runners that MUST execute BEFORE `drizzle-kit push`, not after it.
 *
 * The default for a `migrate-*-init.ts` runner is to run AFTER push, because it
 * adds objects Drizzle cannot express. A runner belongs on THIS list only when
 * its job is to make push a no-op — i.e. it performs a change push would
 * otherwise get catastrophically wrong.
 *
 * `migrate-photo-provenance-init.ts` (Story 13-60) renames
 * `users.liveness_score` → `users.photo_sharpness_score`. `drizzle-kit push`
 * cannot tell a rename from a drop+add: it prompts, and `db-push.ts --force`
 * answers that prompt with "create column" and auto-confirms the follow-up
 * data-loss prompt. Pushing first would therefore create an EMPTY
 * `photo_sharpness_score` and DROP the populated `liveness_score`. Doing the
 * `ALTER TABLE ... RENAME COLUMN` first leaves push nothing to ask about.
 */
const PRE_PUSH_RUNNERS = ['migrate-photo-provenance-init.ts'];

async function main(): Promise<void> {
  const scriptsDir = path.resolve(apiRoot, 'scripts');
  const allRunners = readdirSync(scriptsDir)
    .filter((f) => /^migrate-.*-init\.ts$/.test(f))
    .sort();

  // Step 0: the pre-push runners. Fail loudly if one is named but missing —
  // silently skipping it is how the column gets dropped.
  for (const runner of PRE_PUSH_RUNNERS) {
    if (!allRunners.includes(runner)) {
      throw new Error(
        `PRE_PUSH_RUNNERS names "${runner}" but it does not exist in scripts/. ` +
          `Either restore it or remove it from the list — running push without it can drop columns.`,
      );
    }
    console.log(`\n[db:push:full] Running PRE-push runner: ${runner}`);
    await run('pnpm', ['exec', 'tsx', path.posix.join('scripts', runner)]);
  }

  // Step 1: db:push
  if (FORCE) {
    await run('pnpm', ['exec', 'tsx', 'scripts/db-push.ts', '--force']);
  } else {
    await run('pnpm', ['exec', 'drizzle-kit', 'push']);
  }

  // Step 2: every remaining migrate-*-init.ts in alphabetical order
  const runners = allRunners.filter((f) => !PRE_PUSH_RUNNERS.includes(f));

  if (runners.length === 0) {
    console.warn('[db:push:full] No migrate-*-init.ts runners found in apps/api/scripts/.');
  } else {
    console.log(`\n[db:push:full] Discovered ${runners.length} migrate-init runner(s): ${runners.join(', ')}`);
  }

  for (const runner of runners) {
    await run('pnpm', ['exec', 'tsx', path.posix.join('scripts', runner)]);
  }

  console.log('\n[db:push:full] ✓ All steps complete.');
}

main().catch((err) => {
  console.error('\n[db:push:full] FAILED:', (err as Error).message);
  process.exit(1);
});
