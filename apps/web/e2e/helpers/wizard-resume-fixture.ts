import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Story 9-57 / AI-Review M1 — shared location + types for the wizard-resume
 * token fixture. Kept in a PLAIN module (no `@playwright/test` import) so the
 * spec can read it without pulling in the setup project's `setup(...)`
 * registration. The fixture is written by `wizard-resume.setup.ts` and read by
 * the resume/reload tests in `wizard-registration.spec.ts`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** apps/web/e2e/.wizard-resume-tokens.json (gitignored). */
export const WIZARD_RESUME_FIXTURE = path.join(__dirname, '..', '.wizard-resume-tokens.json');

export interface WizardResumeToken {
  email: string;
  token: string;
}
export interface WizardResumeFixture {
  /** AC5.2a — cross-device resume (fresh browser context). */
  resume: WizardResumeToken;
  /** AC5.2b — autosave persists across a reload. */
  reload: WizardResumeToken;
}

export function readWizardResumeFixture(): WizardResumeFixture {
  return JSON.parse(readFileSync(WIZARD_RESUME_FIXTURE, 'utf8')) as WizardResumeFixture;
}
