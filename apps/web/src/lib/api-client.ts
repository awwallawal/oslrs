import { getAccessToken, awaitAccessToken } from './auth-token-holder';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

/**
 * Custom API error with additional context
 */
export class ApiError extends Error {
  code?: string;
  status: number;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Get auth headers from the in-memory token holder (Story 9-49 — token is never
 * in web storage). Exported for raw fetch calls that bypass apiClient (e.g. blob
 * downloads, file uploads). Synchronous: callers that may run during the boot
 * refresh should `await awaitAccessToken()` first (apiClient does this for them).
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiClient(endpoint: string, options: RequestInit = {}) {
  const { headers, ...rest } = options;

  // Story 9-49 (AC#3): queue behind any in-flight boot/silent refresh so requests
  // issued during boot await the re-minted token instead of firing a 401 stampede.
  await awaitAccessToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...headers,
    },
    ...rest,
  });

  // 204 No Content has no body to parse
  if (response.status === 204) {
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.message || 'Something went wrong',
      response.status,
      data.code,
      data.details
    );
  }

  return data;
}
