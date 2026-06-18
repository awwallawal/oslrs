import { apiClient } from '../../../lib/api-client';
import type { ContactRevealResponse, MarketplaceProfileDetail, MarketplaceSearchParams, MarketplaceSearchResultItem, CursorPaginatedResponse, ProfileEditPayload } from '@oslsr/types';

export async function searchMarketplace(
  params: MarketplaceSearchParams,
): Promise<CursorPaginatedResponse<MarketplaceSearchResultItem>> {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set('q', params.q);
  if (params.lgaId) searchParams.set('lgaId', params.lgaId);
  if (params.profession) searchParams.set('profession', params.profession);
  if (params.experienceLevel) searchParams.set('experienceLevel', params.experienceLevel);
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));

  const qs = searchParams.toString();
  return apiClient(`/marketplace/search${qs ? `?${qs}` : ''}`);
}

export async function fetchMarketplaceProfile(id: string): Promise<MarketplaceProfileDetail> {
  const response = await apiClient(`/marketplace/profiles/${id}`);
  return response.data;
}

/** Story 9-41 AC#5/#6 — optional accountability inputs sent on a reveal retry. */
export interface RevealAccountabilityInput {
  /** AC#6 — stated purpose (only required above the per-viewer volume threshold). */
  purpose?: string;
  /** AC#6 — acceptable-use terms accepted. */
  tosAccepted?: boolean;
}

export async function revealMarketplaceContact(
  profileId: string,
  captchaToken: string,
  deviceFingerprint?: string | null,
  accountability?: RevealAccountabilityInput,
): Promise<ContactRevealResponse> {
  const headers: Record<string, string> = {};
  if (deviceFingerprint) {
    headers['x-device-fingerprint'] = deviceFingerprint;
  }
  const body: Record<string, unknown> = { captchaToken };
  // Only attach purpose/ToS when the viewer has supplied them (above-threshold
  // retry). Below the threshold these stay absent and the reveal is frictionless.
  if (accountability?.purpose) body.purpose = accountability.purpose;
  if (accountability?.tosAccepted) body.tosAccepted = true;

  const response = await apiClient(`/marketplace/profiles/${profileId}/reveal`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
  return response.data;
}

/**
 * Story 9-41 AC#5 — request a one-time code to the authenticated viewer's
 * registered phone (OTP step-up rung). Reuses the existing SMS-OTP service.
 */
export async function requestRevealStepUp(): Promise<{ sent: boolean; expiresInSeconds: number }> {
  const response = await apiClient('/marketplace/reveal/step-up/request', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return response.data;
}

/**
 * Story 9-41 AC#5 — verify an OTP/MFA code to satisfy the step-up rung. On
 * success the server records a short-lived marker; the caller then retries the
 * reveal (which now passes the rung gate).
 */
export async function verifyRevealStepUp(
  method: 'otp' | 'mfa',
  code: string,
): Promise<{ verified: boolean; level: 'otp' | 'mfa' }> {
  const response = await apiClient('/marketplace/reveal/step-up', {
    method: 'POST',
    body: JSON.stringify({ method, code }),
  });
  return response.data;
}

export async function requestEditToken(
  phoneNumber: string,
  captchaToken: string,
): Promise<{ message: string }> {
  const response = await apiClient('/marketplace/request-edit-token', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, captchaToken }),
  });
  return response.data;
}

export async function validateEditToken(
  token: string,
): Promise<{ valid: boolean; bio?: string | null; portfolioUrl?: string | null; reason?: string }> {
  const response = await apiClient(`/marketplace/edit/${token}`);
  return response.data;
}

export async function submitProfileEdit(
  payload: ProfileEditPayload,
): Promise<{ message: string }> {
  const response = await apiClient('/marketplace/edit', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response.data;
}
