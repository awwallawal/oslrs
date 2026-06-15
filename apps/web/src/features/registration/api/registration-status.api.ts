import { apiClient } from '../../../lib/api-client';

/**
 * Story 9-58 (Deliverable A) — public registration-status check.
 *
 * Unauthenticated. The backend ALWAYS returns the same neutral response on a
 * valid captcha (anti-enumeration); the caller shows a constant "if you're in
 * our registry…" message regardless of the result. Status + a magic-link are
 * delivered to the registrant's own channel, never on-screen.
 */
export interface RequestRegistrationStatusArgs {
  /** Free-text: email OR phone OR reference code (auto-detected server-side). */
  identifier: string;
  /** hCaptcha token from the widget. */
  captchaToken: string;
}

export async function requestRegistrationStatus(
  args: RequestRegistrationStatusArgs,
): Promise<void> {
  await apiClient('/registration-status/request', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}
