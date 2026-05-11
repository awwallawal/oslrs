import { apiClient } from '../../../lib/api-client';

/**
 * Story 9-12 MR-8 (2026-05-11 session 8) — magic-link frontend API surface
 * for the landing page that confirms + consumes magic-link tokens.
 *
 * Two endpoints:
 *   - GET  /auth/magic?token=…&purpose=…    → PEEK (safe, prefetcher-friendly)
 *   - POST /auth/magic/consume {token, purpose} → CONSUME (atomic single-use)
 */

export type MagicLinkPurpose = 'wizard_resume' | 'pending_nin_complete' | 'login';

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
