import { z } from 'zod';

/**
 * ODK Central environment configuration validation schema.
 * Per ADR-002: All ODK Central API calls must go through @oslsr/odk-integration.
 *
 * Environment variables:
 * - ODK_CENTRAL_URL: Base URL of ODK Central instance (e.g., https://odk.example.com)
 * - ODK_ADMIN_EMAIL: Admin email for session authentication
 * - ODK_ADMIN_PASSWORD: Admin password for session authentication
 * - ODK_PROJECT_ID: Single project ID for MVP (multi-project deferred)
 */
export const odkConfigSchema = z.object({
  ODK_CENTRAL_URL: z.string()
    .url('ODK_CENTRAL_URL must be a valid URL')
    .transform((url) => url.replace(/\/$/, '')), // Remove trailing slash
  ODK_ADMIN_EMAIL: z.string()
    .email('ODK_ADMIN_EMAIL must be a valid email'),
  ODK_ADMIN_PASSWORD: z.string()
    .min(1, 'ODK_ADMIN_PASSWORD is required'),
  ODK_PROJECT_ID: z.string()
    .regex(/^\d+$/, 'ODK_PROJECT_ID must be a numeric string')
    .transform((id) => parseInt(id, 10)),
});

export type OdkConfig = z.infer<typeof odkConfigSchema>;

/**
 * Validates ODK environment configuration.
 * Returns null if configuration is incomplete (ODK features unavailable).
 * Throws if configuration is present but invalid.
 */
export function validateOdkConfig(env: Record<string, string | undefined>): OdkConfig | null {
  // Check if any ODK vars are set
  const hasAnyOdkConfig = env.ODK_CENTRAL_URL || env.ODK_ADMIN_EMAIL ||
                          env.ODK_ADMIN_PASSWORD || env.ODK_PROJECT_ID;

  if (!hasAnyOdkConfig) {
    // No ODK configuration - features unavailable (not an error)
    return null;
  }

  // If any ODK vars are set, all must be valid
  const result = odkConfigSchema.safeParse(env);

  if (!result.success) {
    throw new Error(
      `Invalid ODK configuration: ${result.error.issues.map(i => i.message).join(', ')}`
    );
  }

  return result.data;
}

/**
 * ODK session token response from POST /v1/sessions
 */
export interface OdkSessionResponse {
  token: string;
  expiresAt: string; // ISO 8601 timestamp
  createdAt: string; // ISO 8601 timestamp
}

/**
 * ODK form deployment response
 */
export interface OdkFormResponse {
  projectId: number;
  xmlFormId: string;
  name: string;
  version: string;
  state: 'open' | 'closing' | 'closed';
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

/**
 * ODK API error response structure
 */
export interface OdkErrorResponse {
  code: number;
  message: string;
  details?: {
    field?: string;
    reason?: string;
  };
}
