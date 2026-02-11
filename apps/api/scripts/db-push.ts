/**
 * Non-interactive wrapper for drizzle-kit push.
 *
 * drizzle-kit 0.21.x uses the `hanji` TUI library for interactive prompts in
 * two scenarios:
 *   1. Column/table rename conflicts — asks "Is X created or renamed from Y?"
 *      Default selection (index 0) = "create column/table" (safe choice).
 *   2. Data-loss confirmation — asks "Do you still want to push changes?"
 *      Default selection (index 0) = "No, abort". Must select index 1 = "Yes".
 *
 * This wrapper spawns drizzle-kit push and auto-responds to both prompt types.
 *
 * Usage (always use npm scripts to ensure tsc runs first):
 *   pnpm db:push              # standard interactive push (non-destructive changes)
 *   pnpm db:push:force        # auto-approve all prompts (destructive changes)
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const force = args.includes('--force');
const verbose = args.includes('--verbose');

const drizzleArgs = ['push'];
if (verbose) drizzleArgs.push('--verbose');

if (!force) {
  // Without --force, run drizzle-kit push normally (interactive)
  const child = spawn('drizzle-kit', drizzleArgs, {
    stdio: 'inherit',
    shell: true,
    cwd: apiRoot,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
} else {
  // With --force, pipe stdin to auto-approve all prompts
  const child = spawn('drizzle-kit', drizzleArgs, {
    stdio: ['pipe', 'pipe', 'inherit'],
    shell: true,
    cwd: apiRoot,
  });

  let output = '';

  child.stdout.on('data', (data: Buffer) => {
    const text = data.toString();
    output += text;
    process.stdout.write(data);

    // Prompt type 1: Column/table rename conflict
    // "Is X column in Y table created or renamed from another column?"
    // Default (index 0) = "create column" — just press Enter to accept.
    if (
      output.includes('created or renamed from another column') ||
      output.includes('created or renamed from another table')
    ) {
      // Accept default "create" by pressing Enter
      child.stdin.write('\r');
      // Reset output buffer so we can detect the next prompt
      output = '';
    }

    // Prompt type 2: Data-loss confirmation
    // "Do you still want to push changes?"
    // Default (index 0) = "No, abort". Must select index 1 = "Yes".
    if (
      output.includes('still want to push changes') ||
      output.includes('I want to execute all statements') ||
      output.includes('I want to remove') ||
      output.includes('I want to truncate')
    ) {
      // Send Down arrow to select "Yes", then Enter to submit
      setTimeout(() => {
        child.stdin.write('\x1b[B\r');
      }, 100);
      output = '';
    }
  });

  child.on('exit', (code) => {
    child.stdin.end();
    process.exit(code ?? 1);
  });

  // Timeout: if the process hangs for 60 seconds, force-kill
  const timeout = setTimeout(() => {
    console.error('\n[db-push] Timed out waiting for drizzle-kit push (60s). Killing process.');
    child.kill('SIGTERM');
    process.exit(1);
  }, 60_000);

  child.on('exit', () => clearTimeout(timeout));
}
