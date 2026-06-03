import { apiClient } from '../../../lib/api-client';
import type { LoginResponse } from '@oslsr/types';

/**
 * Story 9-12 MR-8 (2026-05-11 session 8) — magic-link frontend API surface
 * for the landing page that confirms + consumes magic-link tokens.
 *
 * Two endpoints:
 *   - GET  /auth/magic?token=…&purpose=…    → PEEK (safe, prefetcher-friendly)
 *   - POST /auth/magic/consume {token, purpose} → CONSUME (atomic single-use)
 *
 * Story 9-16 adds the login channel:
 *   - POST /auth/public/magic-link {email, purpose:'login'} → request a link
 *   - POST /auth/magic/login {token, purpose:'login', rememberMe} → sign in
 */

export type MagicLinkPurpose =
  | 'wizard_resume'
  | 'pending_nin_complete'
  | 'login'
  | 'supplemental_survey'; // Story 9-28 Path B — Cohort A Step 4-only landing

export interface MagicLinkPeekResult {
  tokenId: string;
  purpose: MagicLinkPurpose;
  email: string;
  userId: string | null;
  respondentId: string | null;
  requiresConsume: boolean;
}

export interface MagicLinkConsumeResult {
  tokenId: string;
  purpose: MagicLinkPurpose;
  email: string;
  userId: string | null;
  respondentId: string | null;
}

export async function peekMagicLink(args: {
  token: string;
  purpose: MagicLinkPurpose;
}): Promise<MagicLinkPeekResult> {
  const params = new URLSearchParams({ token: args.token, purpose: args.purpose });
  const res = await apiClient(`/auth/magic?${params.toString()}`, { method: 'GET' });
  return res.data as MagicLinkPeekResult;
}

export async function consumeMagicLink(args: {
  token: string;
  purpose: MagicLinkPurpose;
}): Promise<MagicLinkConsumeResult> {
  const res = await apiClient('/auth/magic/consume', {
    method: 'POST',
    body: JSON.stringify(args),
  });
  return res.data as MagicLinkConsumeResult;
}

/**
 * Story 9-16 — discriminated result of `POST /auth/magic/login`. Either a full
 * session (`LoginResponse`) or a 2-step MFA challenge.
 */
export interface MagicLinkLoginMfaRequired {
  requiresMfa: true;
  mfaChallengeToken: string;
  expiresIn: number;
}

export type MagicLinkLoginResult = LoginResponse | MagicLinkLoginMfaRequired;

export function isMagicLinkMfaRequired(
  result: MagicLinkLoginResult,
): result is MagicLinkLoginMfaRequired {
  return 'requiresMfa' in result && result.requiresMfa === true;
}

/**
 * Story 9-16 — request a `login`-purpose magic link by email. The backend
 * ALWAYS returns 200 (anti-enumeration); the caller must show a generic
 * "if your account exists…" message regardless of the result.
 */
export async function requestLoginMagicLink(args: { email: string }): Promise<void> {
  await apiClient('/auth/public/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email: args.email, purpose: 'login' }),
  });
}

/**
 * Story 9-16 — exchange a `login`-purpose token for a session. `credentials:
 * 'include'` is REQUIRED so the browser stores the httpOnly refresh-token
 * cookie the backend sets (apiClient does not include credentials by default).
 */
export async function loginByMagicLink(args: {
  token: string;
  rememberMe?: boolean;
}): Promise<MagicLinkLoginResult> {
  const res = await apiClient('/auth/magic/login', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({
      token: args.token,
      purpose: 'login',
      rememberMe: args.rememberMe ?? false,
    }),
  });
  return res.data as MagicLinkLoginResult;
}
