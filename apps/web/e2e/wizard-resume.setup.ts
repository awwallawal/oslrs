import { test as setup, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WIZARD_RESUME_FIXTURE,
  type WizardResumeFixture,
  type WizardResumeToken,
} from './helpers/wizard-resume-fixture';

/**
 * Story 9-57 / AI-Review M1 — wizard-resume token fixture.
 *
 * The cross-device-resume (AC5.2a) and autosave-across-reload (AC5.2b) e2e
 * tests need a valid `wizard_resume` magic-link token to hit
 * `GET /registration/draft?token=…`. Tokens are stored only as a SHA-256 hash,
 * so the plaintext can't be read back from the DB — it normally lives only in
 * the resume email. This setup project mints one per test via the test-only
 * api script `scripts/_mint-wizard-resume-token.ts` (which calls the REAL
 * `MagicLinkService.issueToken`, so it exercises the genuine path and adds NO
 * server route), then writes the plaintext tokens to a gitignored fixture the
 * wizard tests read. Mirrors the `auth-setup` dependency-project pattern.
 *
 * Unique per-run emails keep each run's draft isolated (drafts upsert by email).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** repo root — three levels up from apps/web/e2e. */
const REPO_ROOT = path.resolve(__dirname, '../../..');

function mintToken(email: string): WizardResumeToken {
  // Run the api-package mint script from the repo root. A single shell command
  // string (execSync) is used deliberately: on Windows, pnpm is a `.cmd` shim
  // which Node refuses to spawn without a shell (CVE-2024-27980 hardening), and
  // passing an args ARRAY with a shell triggers the DEP0190 deprecation. A bare
  // command string sidesteps both and runs identically on cmd.exe and POSIX sh.
  // `email` is a controlled literal (timestamp + @example.test, no shell
  // metacharacters), so there is no injection surface to escape.
  const cmd = `pnpm --filter @oslsr/api exec tsx scripts/_mint-wizard-resume-token.ts --email ${email}`;
  const stdout = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const line = stdout
    .split(/\r?\n/)
    .find((l) => l.startsWith('MINT_RESULT='));
  if (!line) {
    throw new Error(`mint-wizard-resume-token produced no MINT_RESULT line for ${email}.\nstdout:\n${stdout}`);
  }
  const parsed = JSON.parse(line.slice('MINT_RESULT='.length)) as { email: string; token: string };
  return { email: parsed.email, token: parsed.token };
}

setup('mint wizard-resume tokens', () => {
  // A timestamp keeps each run's drafts isolated. (Date.now is fine here — this
  // is a Node setup script, not a deterministic-replay workflow.)
  const stamp = Date.now();
  const fixture: WizardResumeFixture = {
    resume: mintToken(`e2e-resume-${stamp}@example.test`),
    reload: mintToken(`e2e-reload-${stamp}@example.test`),
  };

  expect(fixture.resume.token, 'resume token minted').toBeTruthy();
  expect(fixture.reload.token, 'reload token minted').toBeTruthy();

  writeFileSync(WIZARD_RESUME_FIXTURE, JSON.stringify(fixture, null, 2), 'utf8');
});
