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
    pool: 'threads',
    ...(maxWorkers ? { maxWorkers, minWorkers: 1 } : {}),
    testTimeout: 10000,
    hookTimeout: 15000,
    reporters: ['default', 'json', new LiveReporter({ outputDir: workspaceRoot })],
    outputFile: 'vitest-report.json',
  },
})
