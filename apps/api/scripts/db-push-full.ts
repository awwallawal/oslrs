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

async function main(): Promise<void> {
  // Step 1: db:push
  if (FORCE) {
    await run('pnpm', ['exec', 'tsx', 'scripts/db-push.ts', '--force']);
  } else {
    await run('pnpm', ['exec', 'drizzle-kit', 'push']);
  }

  // Step 2: discover and run every migrate-*-init.ts in alphabetical order
  const scriptsDir = path.resolve(apiRoot, 'scripts');
  const runners = readdirSync(scriptsDir)
    .filter((f) => /^migrate-.*-init\.ts$/.test(f))
    .sort();

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
