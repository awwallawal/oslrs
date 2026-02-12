import type { LoginResponse } from '@oslsr/types';
import { AuthApiError } from './auth.api.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

/**
 * Verify Google ID token with backend.
 * Backend creates/finds user, creates session, returns JWT tokens.
 */
export async function verifyGoogleToken(idToken: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/google/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Required for refresh token cookie
    body: JSON.stringify({ idToken }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new AuthApiError(
      data.message || 'Google authentication failed',
      data.code || 'AUTH_GOOGLE_TOKEN_INVALID',
      response.status,
      data.details
    );
  }

  return data.data as LoginResponse;
}
