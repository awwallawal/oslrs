import pino from 'pino';
import { AppError } from '@oslsr/utils';
import {
  type OdkConfig,
  type OdkSessionResponse,
  type OdkErrorResponse,
  type OdkAppUserApiResponse,
  validateOdkConfig,
} from '@oslsr/types';

/**
 * ODK Central API Client
 *
 * Per ADR-002: ALL ODK Central API calls MUST go through this client.
 * No other service or controller may call ODK endpoints directly.
 *
 * Authentication:
 * - Uses session tokens via POST /v1/sessions (email+password)
 * - Tokens expire in 24 hours
 * - Auto-caches token and refreshes on 401 responses
 *
 * Error Codes:
 * - ODK_AUTH_FAILED: Authentication failure (401/403)
 * - ODK_PROJECT_NOT_FOUND: Project does not exist (404)
 * - ODK_FORM_EXISTS: Form already exists with same xmlFormId (409)
 * - ODK_DEPLOYMENT_FAILED: General deployment failure
 * - ODK_UNAVAILABLE: ODK Central configuration missing
 */

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

// Token cache - single session per process
let cachedToken: string | null = null;
let tokenExpiresAt: Date | null = null;

// Buffer time before expiry to trigger refresh (1 hour)
const TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000;

/**
 * Get validated ODK configuration from environment.
 * Returns null if ODK is not configured.
 */
export function getOdkConfig(): OdkConfig | null {
  return validateOdkConfig(process.env as Record<string, string | undefined>);
}

/**
 * Check if ODK integration is available (configured).
 */
export function isOdkAvailable(): boolean {
  return getOdkConfig() !== null;
}

/**
 * Clear cached session token (for testing or forced re-auth).
 */
export function clearOdkSession(): void {
  cachedToken = null;
  tokenExpiresAt = null;
  logger.debug({ event: 'odk.session.cleared' });
}

/**
 * Get a valid session token, refreshing if needed.
 * @throws AppError with code ODK_AUTH_FAILED or ODK_UNAVAILABLE
 */
async function getSessionToken(config: OdkConfig): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiresAt) {
    const now = new Date();
    const bufferTime = new Date(tokenExpiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS);

    if (now < bufferTime) {
      logger.debug({ event: 'odk.session.cache_hit', expiresAt: tokenExpiresAt.toISOString() });
      return cachedToken;
    }
    logger.debug({ event: 'odk.session.cache_expired', expiresAt: tokenExpiresAt.toISOString() });
  }

  // Need to get a new token
  return await createSession(config);
}

/**
 * Create a new ODK Central session.
 * @throws AppError with code ODK_AUTH_FAILED
 */
async function createSession(config: OdkConfig): Promise<string> {
  const url = `${config.ODK_CENTRAL_URL}/v1/sessions`;

  logger.info({ event: 'odk.auth.session_creating', url });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: config.ODK_ADMIN_EMAIL,
        password: config.ODK_ADMIN_PASSWORD,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({
        event: 'odk.auth.session_failed',
        status: response.status,
        body: errorBody,
      });

      throw new AppError(
        'ODK_AUTH_FAILED',
        'Failed to authenticate with ODK Central',
        401,
        { odkStatus: response.status }
      );
    }

    const sessionData = await response.json() as OdkSessionResponse;

    // Cache the token
    cachedToken = sessionData.token;
    tokenExpiresAt = new Date(sessionData.expiresAt);

    logger.info({
      event: 'odk.auth.session_created',
      expiresAt: sessionData.expiresAt,
    });

    return sessionData.token;
  } catch (error) {
    if (error instanceof AppError) throw error;

    logger.error({
      event: 'odk.auth.session_error',
      error: error instanceof Error ? error.message : String(error),
    });

    throw new AppError(
      'ODK_AUTH_FAILED',
      'Unable to connect to ODK Central',
      503,
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Make an authenticated request to ODK Central API.
 * Handles token refresh on 401 responses.
 *
 * @param config ODK configuration
 * @param method HTTP method
 * @param path API path (without base URL, e.g., "/v1/projects/1/forms")
 * @param options Request options (body, headers, etc.)
 * @returns Response object
 * @throws AppError with appropriate ODK error code
 */
export async function odkRequest(
  config: OdkConfig,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options?: {
    body?: Buffer | string | Record<string, unknown>;
    headers?: Record<string, string>;
    contentType?: string;
    retryOnAuth?: boolean;
  }
): Promise<Response> {
  const { body, headers = {}, contentType, retryOnAuth = true } = options || {};

  const token = await getSessionToken(config);
  const url = `${config.ODK_CENTRAL_URL}${path}`;

  // Prepare headers
  const requestHeaders: Record<string, string> = {
    ...headers,
    'Authorization': `Bearer ${token}`,
  };

  // Set content type
  if (contentType) {
    requestHeaders['Content-Type'] = contentType;
  } else if (body && !(body instanceof Buffer)) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  // Prepare body
  let requestBody: BodyInit | undefined;
  if (body instanceof Buffer) {
    // Convert Node.js Buffer to Blob for fetch compatibility
    // Type assertion needed due to strict ArrayBuffer types in TypeScript 5.x
    requestBody = new Blob([body as unknown as BlobPart]);
  } else if (typeof body === 'string') {
    requestBody = body;
  } else if (body) {
    requestBody = JSON.stringify(body);
  }

  logger.debug({
    event: 'odk.request.start',
    method,
    url,
    contentType: requestHeaders['Content-Type'],
  });

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  // Handle 401 - try to refresh token and retry once
  if (response.status === 401 && retryOnAuth) {
    logger.info({ event: 'odk.auth.session_refreshed', reason: '401 response' });
    clearOdkSession();
    return odkRequest(config, method, path, { ...options, retryOnAuth: false });
  }

  logger.debug({
    event: 'odk.request.complete',
    method,
    url,
    status: response.status,
  });

  return response;
}

/**
 * Parse ODK error response and throw appropriate AppError.
 */
export function handleOdkError(
  response: Response,
  errorBody: string | OdkErrorResponse,
  context?: Record<string, unknown>
): never {
  const status = response.status;
  const odkError = typeof errorBody === 'string' ? errorBody : errorBody.message;

  logger.error({
    event: 'odk.request.error',
    status,
    odkError,
    ...context,
  });

  // Map ODK status codes to error codes
  if (status === 401 || status === 403) {
    throw new AppError(
      'ODK_AUTH_FAILED',
      'ODK Central authentication failed',
      401,
      { odkStatus: status, odkError, ...context }
    );
  }

  if (status === 404) {
    throw new AppError(
      'ODK_PROJECT_NOT_FOUND',
      'ODK Central project or resource not found',
      404,
      { odkStatus: status, odkError, ...context }
    );
  }

  if (status === 409) {
    throw new AppError(
      'ODK_FORM_EXISTS',
      'Form already exists in ODK Central',
      409,
      { odkStatus: status, odkError, ...context }
    );
  }

  // General deployment failure
  throw new AppError(
    'ODK_DEPLOYMENT_FAILED',
    `ODK Central API error: ${odkError}`,
    status >= 500 ? 502 : status,
    { odkStatus: status, odkError, ...context }
  );
}

/**
 * Ensure ODK is configured before making requests.
 * @throws AppError with code ODK_UNAVAILABLE
 */
export function requireOdkConfig(): OdkConfig {
  const config = getOdkConfig();
  if (!config) {
    throw new AppError(
      'ODK_UNAVAILABLE',
      'ODK Central integration is not configured. Set ODK_CENTRAL_URL, ODK_ADMIN_EMAIL, ODK_ADMIN_PASSWORD, and ODK_PROJECT_ID environment variables.',
      503,
      { missing: ['ODK_CENTRAL_URL', 'ODK_ADMIN_EMAIL', 'ODK_ADMIN_PASSWORD', 'ODK_PROJECT_ID'] }
    );
  }
  return config;
}

/**
 * Create an App User in ODK Central for data collection.
 * Per AC2: Calls POST /v1/projects/{projectId}/app-users
 *
 * ODK Central App Users are field keys used for Enketo form submission.
 * The token returned is a long-lived key (never expires) used for authentication.
 *
 * CRITICAL: Token is only returned on creation. Store securely immediately.
 *
 * @param config ODK configuration
 * @param projectId ODK Central project ID
 * @param displayName Display name for the App User (staff full name + role)
 * @returns OdkAppUserApiResponse containing id, type, displayName, token, createdAt
 * @throws AppError with ODK_* codes on failure
 */
export async function createAppUser(
  config: OdkConfig,
  projectId: number,
  displayName: string
): Promise<OdkAppUserApiResponse> {
  const path = `/v1/projects/${projectId}/app-users`;

  logger.info({
    event: 'odk.appuser.creating',
    projectId,
    displayName,
  });

  const response = await odkRequest(config, 'POST', path, {
    body: { displayName },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedError: OdkErrorResponse | string = errorBody;
    try {
      parsedError = JSON.parse(errorBody) as OdkErrorResponse;
    } catch {
      // Use raw error string if not JSON
    }

    handleOdkError(response, parsedError, { projectId, displayName });
  }

  const appUser = await response.json() as OdkAppUserApiResponse;

  logger.info({
    event: 'odk.appuser.created',
    projectId,
    odkAppUserId: appUser.id,
    displayName: appUser.displayName,
    createdAt: appUser.createdAt,
    // Note: token is NOT logged for security
  });

  return appUser;
}
