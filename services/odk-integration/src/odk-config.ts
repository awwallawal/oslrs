import pino from 'pino';
import { AppError } from '@oslsr/utils';
import { validateOdkConfig as validateBasicOdkConfig } from '@oslsr/types';
import { ODK_CONFIG_ERROR } from '@oslsr/types';

/**
 * ODK Configuration Validation (Story 2-4)
 *
 * Per AC7: Graceful startup validation - fail gracefully with ODK_CONFIG_ERROR
 * rather than crashing if encryption key is missing.
 *
 * This module provides:
 * - validateOdkTokenConfig(): Full validation including encryption key
 * - isOdkFullyConfigured(): Checks all config including encryption key
 */

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

/**
 * Result of ODK configuration validation.
 */
export interface OdkConfigValidationResult {
  /** Whether all configuration is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** Indicates which features are available */
  features: {
    /** Basic ODK operations (form deployment, etc.) */
    basicOperations: boolean;
    /** Token encryption/decryption for App Users */
    tokenManagement: boolean;
  };
}

/**
 * Validate full ODK configuration including encryption key.
 * Per AC7: Returns validation result instead of throwing.
 *
 * @returns Validation result with errors and feature availability
 */
export function validateOdkTokenConfig(): OdkConfigValidationResult {
  const errors: string[] = [];
  const features = {
    basicOperations: false,
    tokenManagement: false,
  };

  // Check basic ODK config first
  try {
    const basicConfig = validateBasicOdkConfig(process.env as Record<string, string | undefined>);

    if (basicConfig) {
      features.basicOperations = true;

      // Check encryption key for token management
      const encryptionKey = process.env.ODK_TOKEN_ENCRYPTION_KEY;

      if (!encryptionKey) {
        errors.push('ODK_TOKEN_ENCRYPTION_KEY is not set - token management disabled');
      } else if (encryptionKey.length !== 64) {
        errors.push(`ODK_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes), got ${encryptionKey.length}`);
      } else if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
        errors.push('ODK_TOKEN_ENCRYPTION_KEY must be a valid hex string');
      } else {
        features.tokenManagement = true;
      }
    } else {
      // Check which specific env vars are missing (don't assume all are missing)
      if (!process.env.ODK_CENTRAL_URL) {
        errors.push('ODK_CENTRAL_URL is not configured - ODK features disabled');
      }
      if (!process.env.ODK_ADMIN_EMAIL) {
        errors.push('ODK_ADMIN_EMAIL is not configured');
      }
      if (!process.env.ODK_ADMIN_PASSWORD) {
        errors.push('ODK_ADMIN_PASSWORD is not configured');
      }
      if (!process.env.ODK_PROJECT_ID) {
        errors.push('ODK_PROJECT_ID is not configured');
      }
      if (!process.env.ODK_TOKEN_ENCRYPTION_KEY) {
        errors.push('ODK_TOKEN_ENCRYPTION_KEY is not configured');
      }
    }
  } catch (error) {
    // Basic config validation threw an error (partial config with invalid values)
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    valid: errors.length === 0,
    errors,
    features,
  };
}

/**
 * Check if ODK is fully configured for all features including token management.
 * Per AC7: Use this to check before token operations.
 *
 * @returns true if ALL ODK config (including encryption key) is valid
 */
export function isOdkFullyConfigured(): boolean {
  const result = validateOdkTokenConfig();
  return result.features.basicOperations && result.features.tokenManagement;
}

/**
 * Log startup warnings if ODK configuration is incomplete.
 * Called during application initialization.
 */
export function logOdkConfigStatus(): void {
  const result = validateOdkTokenConfig();

  if (!result.features.basicOperations) {
    logger.warn({
      event: 'odk.config.unavailable',
      message: 'ODK Central integration is not configured. ODK features will be disabled.',
      errors: result.errors,
    });
    return;
  }

  if (!result.features.tokenManagement) {
    logger.warn({
      event: 'odk.config.partial',
      message: 'ODK_TOKEN_ENCRYPTION_KEY is not configured. App User token operations will fail.',
      errors: result.errors.filter(e => e.includes('ENCRYPTION_KEY')),
    });
    return;
  }

  logger.info({
    event: 'odk.config.ready',
    message: 'ODK integration fully configured.',
    features: result.features,
  });
}

/**
 * Require encryption key to be configured.
 * Throws ODK_CONFIG_ERROR if missing (for endpoint error responses).
 *
 * @returns The encryption key hex string
 * @throws AppError with ODK_CONFIG_ERROR code if key not configured
 */
export function requireTokenEncryptionKey(): string {
  const key = process.env.ODK_TOKEN_ENCRYPTION_KEY;

  if (!key) {
    throw new AppError(
      ODK_CONFIG_ERROR,
      'ODK integration is not fully configured - encryption key missing',
      503
    );
  }

  if (key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new AppError(
      ODK_CONFIG_ERROR,
      'ODK integration is not fully configured - invalid encryption key',
      503
    );
  }

  return key;
}
