import { defineConfig } from 'vitest/config'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { LiveReporter } from './packages/testing/src/reporter'

/**
 * Find workspace root by looking for pnpm-workspace.yaml
 * This works reliably in both local and CI environments
 */
function findWorkspaceRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached root
    dir = parent;
  }
  return startDir; // fallback to start dir
}

// Calculate workspace root - more reliable than import.meta.url in CI
const workspaceRoot = findWorkspaceRoot(process.cwd());

// Also try import.meta.url for comparison
let importMetaDir: string;
try {
  importMetaDir = path.dirname(fileURLToPath(import.meta.url));
} catch {
  importMetaDir = 'N/A';
}

console.log('[Vitest Base] Loading config with LiveReporter...');
console.log('[Vitest Base] Workspace root:', workspaceRoot);
console.log('[Vitest Base] import.meta.url dir:', importMetaDir);
console.log('[Vitest Base] CWD:', process.cwd());
console.log('[Vitest Base] Reporter will write to:', workspaceRoot);

// Optional worker-pool cap (Story 9-55 review follow-up, 2026-06-14).
// Heavy jsdom suites (web) spawn one worker per core by default. On a contended
// local machine — a second suite running, or laptop sleep/resume mid-run — that
// oversubscribes OS threads/RAM and trips "Failed to start threads worker" /
// timeout flakes in the pre-push gate (Pitfall #37 / feedback_local_full_suite_flakiness).
// The 9-54 `turbo --concurrency=1` fix serialized PACKAGES but not the web
// package's own pool. Bounding the simultaneous worker count keeps the honest
// gate deterministic. Unset → vitest's default (CI's dedicated runners want full
// parallelism and never set this var). Set by .husky/pre-push.
const explicitCap = process.env.VITEST_MAX_THREADS
  ? Math.max(1, Number(process.env.VITEST_MAX_THREADS))
  : undefined;
// Off-CI default cap (2026-06-19): a plain local `pnpm vitest run` otherwise
// spawns ~one worker per core and oversubscribes CPU/RAM on a busy laptop,
// CPU-STARVING heavy jsdom renders past their waitFor timeout. That — not cold
// chunk imports — is the root cause of the route-resolution `/register` flake:
// under uncapped oversubscription even a warm WizardPage render exceeds 5s, but
// the SAME suite capped at 2 workers is green (Pitfall #37 / 9-21 review).
// The pre-push gate already exports VITEST_MAX_THREADS=2; mirroring that as the
// off-CI DEFAULT makes every ad-hoc local run deterministic too. CI's dedicated
// runners run the suite alone and want full parallelism, so leave them uncapped
// (process.env.CI). Explicit VITEST_MAX_THREADS always wins (e.g. for a fast
// run on an idle machine: `VITEST_MAX_THREADS=4 pnpm test`).
const maxWorkers = explicitCap ?? (process.env.CI ? undefined : 2);
if (maxWorkers) {
  console.log(
    '[Vitest Base] capping worker pool at',
    maxWorkers,
    explicitCap ? 'workers (VITEST_MAX_THREADS)' : 'workers (off-CI default; set VITEST_MAX_THREADS to override)',
  );
}

// Worker pool: FORKS on Windows, THREADS elsewhere (2026-08-03, Pitfall #37 re-diagnosed).
//
// ⚠️ `VITEST_MAX_THREADS=1` WAS NEVER THE FIX FOR THE SEGFAULT, and believing it was cost six
// failed pushes in one day. That variable bounds HOW MANY worker threads run; the crash is a
// native-addon teardown INSIDE a worker thread, so one thread crashes exactly like eight.
//
// Measured 2026-08-03 on Windows:
//   pdf-tabular.parser.test.ts ALONE ............................. exit 0, clean
//   full API suite, pool 'threads' (even with VITEST_MAX_THREADS=1)  0xC0000005, 6 of 6 runs,
//     always IMMEDIATELY AFTER that file's 5 tests pass — a teardown crash, never a failure
//   full suite, pool 'forks', identical pre-push env ............. 4/4 packages green, exit 0
//
// pdfjs-dist leaves the worker in a state the next module load cannot survive; `isolate: true`
// resets module state but reuses the THREAD. A fork gives each file its own PROCESS, so the
// damage dies with it.
//
// Scoped to win32 deliberately: CI's Linux runners have never shown this and are the gate that
// actually blocks deploys — flipping their pool on the strength of a Windows-only fault would be
// changing what CI proves in order to fix a laptop. Override either way with VITEST_POOL=forks|threads.
const pool = (process.env.VITEST_POOL as 'forks' | 'threads' | undefined)
  ?? (process.platform === 'win32' ? 'forks' : 'threads');
console.log(
  '[Vitest Base] pool:',
  pool,
  process.env.VITEST_POOL ? '(VITEST_POOL)' : `(default for ${process.platform})`,
);

// Debug: Write a marker file to prove config is loaded
try {
  const markerPath = path.join(workspaceRoot, '.vitest-config-loaded');
  fs.writeFileSync(markerPath, `Config loaded at ${new Date().toISOString()}\nWorkspace: ${workspaceRoot}\nCWD: ${process.cwd()}\n`);
  console.log('[Vitest Base] Wrote marker file:', markerPath);
} catch (err) {
  console.error('[Vitest Base] Failed to write marker file:', (err as Error).message);
}

export const baseConfig = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: [path.resolve(workspaceRoot, 'test/setup.ts')],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    isolate: true,
    pool,
    ...(maxWorkers ? { maxWorkers, minWorkers: 1 } : {}),
    testTimeout: 10000,
    hookTimeout: 15000,
    reporters: ['default', 'json', new LiveReporter({ outputDir: workspaceRoot })],
    outputFile: 'vitest-report.json',
  },
})
