/**
 * MFA API — Story 9-13.
 *
 * Wraps the six `/auth/mfa/*` and `/auth/login/mfa*` endpoints. Mirrors the
 * `auth.api.ts` style: explicit accessToken for authenticated calls,
 * `credentials: 'include'` for the refresh-cookie set by the unauth login
 * step-2 endpoints.
 */
import type { LoginResponse } from '@oslsr/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export class MfaApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MfaApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function mfaFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new MfaApiError(
      data.message || 'MFA request failed',
      data.code || 'MFA_ERROR',
      response.status,
      data.details,
    );
  }
  return data.data as T;
}

// ---------------------------------------------------------------------------
// Enrollment (authenticated + fresh re-auth)
// ---------------------------------------------------------------------------

export interface EnrollResponse {
  secret: string;
  provisioningUri: string;
  qrCodeDataUri: string;
  /** Plaintext — show ONCE; backend persists bcrypt hashes. */
  backupCodes: string[];
}

export async function enrollMfa(accessToken: string): Promise<EnrollResponse> {
  return mfaFetch<EnrollResponse>('/auth/mfa/enroll', { method: 'POST' }, accessToken);
}

export async function verifyMfa(code: string, accessToken: string): Promise<{ ok: true; mfaEnabled: boolean }> {
  return mfaFetch<{ ok: true; mfaEnabled: boolean }>(
    '/auth/mfa/verify',
    { method: 'POST', body: JSON.stringify({ code }) },
    accessToken,
  );
}

export async function disableMfa(code: string, accessToken: string): Promise<{ ok: true }> {
  return mfaFetch<{ ok: true }>(
    '/auth/mfa/disable',
    { method: 'POST', body: JSON.stringify({ code }) },
    accessToken,
  );
}

export async function regenerateMfaCodes(code: string, accessToken: string): Promise<{ backupCodes: string[] }> {
  return mfaFetch<{ backupCodes: string[] }>(
    '/auth/mfa/regenerate-codes',
    { method: 'POST', body: JSON.stringify({ code }) },
    accessToken,
  );
}

// ---------------------------------------------------------------------------
// Login step-2 (UNAUTHENTICATED — uses challenge token)
// ---------------------------------------------------------------------------

export interface LoginMfaRequest {
  mfaChallengeToken: string;
  code: string;
  /** hCaptcha token — same routes layered with verifyCaptcha as /staff/login. */
  captchaToken: string;
}

export async function loginMfa(request: LoginMfaRequest): Promise<LoginResponse> {
  return mfaFetch<LoginResponse>('/auth/login/mfa', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function loginMfaBackup(
  request: LoginMfaRequest,
): Promise<LoginResponse & { backupCodesRemaining: number }> {
  return mfaFetch<LoginResponse & { backupCodesRemaining: number }>('/auth/login/mfa-backup', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
