import { AppError, decryptToken, requireEncryptionKey } from '@oslsr/utils';
import type { OdkAppUserRecord, UserRole } from '@oslsr/types';
import {
  ODK_TOKEN_NOT_FOUND,
  ODK_TOKEN_ACCESS_DENIED,
  ODK_TOKEN_DECRYPTION_ERROR,
} from '@oslsr/types';
import { UserRole as UserRoleEnum } from '@oslsr/types';

/**
 * ODK Token Management Service (Story 2-4)
 *
 * Per ADR-002: ALL ODK Central operations MUST go through @oslsr/odk-integration.
 * Per ADR-006: Defense-in-depth security - tokens encrypted at rest, access controlled.
 *
 * This service handles:
 * - Token retrieval with authorization checks
 * - Token health validation (without exposing plaintext)
 * - Audit logging for token access
 */

/**
 * Context for token access authorization.
 * Per AC2: Authorization varies by purpose.
 */
export interface TokenAccessContext {
  /** ID of the caller requesting access */
  callerId: string;
  /** Purpose of the access request */
  purpose: 'enketo_launch' | 'health_check' | 'system';
  /** Role of the caller (required for health_check) */
  role?: UserRole;
}

/**
 * Result of token health validation.
 * Does NOT include the actual token.
 */
export interface TokenHealthResult {
  valid: boolean;
  error?: string;
}

/**
 * Interface for ODK token persistence operations.
 * Implemented by the caller (apps/api) to handle database operations.
 */
export interface OdkTokenPersistence {
  /** Find an ODK App User record by user ID */
  findByUserId(userId: string): Promise<OdkAppUserRecord | null>;
}

/**
 * Interface for audit logging.
 * Implemented by the caller (apps/api) to handle audit operations.
 */
export interface OdkTokenAudit {
  /** Log token access for compliance tracking */
  logTokenAccessed(userId: string, accessorId: string, purpose: string): Promise<void>;
}

/**
 * Configuration for token service.
 */
export interface OdkTokenConfig {
  /** 64-character hex encryption key (32 bytes) */
  encryptionKey?: string;
}

/**
 * Logger interface for structured logging.
 */
export interface OdkTokenLogger {
  info(obj: object): void;
  warn(obj: object): void;
  error(obj: object): void;
  debug?(obj: object): void;
}

/**
 * Dependencies for the ODK Token Service.
 */
export interface OdkTokenServiceDeps {
  persistence: OdkTokenPersistence;
  audit: OdkTokenAudit;
  config: OdkTokenConfig;
  logger: OdkTokenLogger;
}

/**
 * Context for health check authorization (AC6).
 */
export interface HealthCheckContext {
  /** ID of the caller requesting health check */
  callerId: string;
  /** Role of the caller (must be SUPER_ADMIN per AC6) */
  role?: UserRole;
}

/**
 * ODK Token Service interface.
 */
export interface OdkTokenService {
  /**
   * Retrieve and decrypt an ODK App User token.
   * Per AC1-AC4: Authorization, decryption, and audit logging.
   *
   * NOTE: For health checks (AC6), use validateTokenHealth() instead.
   * getDecryptedToken() does NOT support health_check purpose per AC2 ("no plaintext returned").
   *
   * @param userId The user whose token to retrieve
   * @param context Authorization context (caller, purpose, role)
   * @returns Decrypted plaintext token
   * @throws AppError with appropriate code if unauthorized, not found, or decryption fails
   */
  getDecryptedToken(userId: string, context: TokenAccessContext): Promise<string>;

  /**
   * Validate that a token can be decrypted without exposing the plaintext.
   * Per AC6: Health check for SUPER_ADMIN only.
   *
   * @param userId The user whose token to validate
   * @param context Optional caller context for authorization (required for external calls)
   * @returns Health result (valid: true/false, error message if invalid)
   */
  validateTokenHealth(userId: string, context?: HealthCheckContext): Promise<TokenHealthResult>;
}

/**
 * Check if the caller is authorized to access the token via getDecryptedToken().
 * Per AC2:
 * - purpose: 'system' → Always allowed (internal backend calls)
 * - purpose: 'enketo_launch' → Allowed if callerId === userId (owner only)
 * - purpose: 'health_check' → NOT allowed here (AC2: "no plaintext returned")
 *   → Use validateTokenHealth() for health checks instead
 */
function isAuthorized(userId: string, context: TokenAccessContext): boolean {
  if (context.purpose === 'system') {
    return true;
  }

  if (context.purpose === 'enketo_launch') {
    return context.callerId === userId;
  }

  // health_check purpose should use validateTokenHealth() instead of getDecryptedToken()
  // Per AC2: "no plaintext returned" for health_check
  // Per AC6: health checks verify token validity WITHOUT exposing plaintext
  return false;
}

/**
 * Create an ODK Token Service instance.
 * Uses dependency injection for testability.
 *
 * @param deps Service dependencies (persistence, audit, config, logger)
 * @returns OdkTokenService instance
 */
export function createOdkTokenService(deps: OdkTokenServiceDeps): OdkTokenService {
  const { persistence, audit, config, logger } = deps;

  return {
    async getDecryptedToken(userId: string, context: TokenAccessContext): Promise<string> {
      // Step 1: Authorization check (AC2)
      if (!isAuthorized(userId, context)) {
        logger.warn({
          event: 'odk.token.unauthorized_access',
          userId,
          callerId: context.callerId,
          purpose: context.purpose,
          role: context.role,
        });

        throw new AppError(
          ODK_TOKEN_ACCESS_DENIED,
          'Not authorized to access this token',
          403
        );
      }

      // Step 2: Retrieve record from database
      const record = await persistence.findByUserId(userId);

      if (!record) {
        logger.warn({
          event: 'odk.token.not_found',
          userId,
        });

        throw new AppError(
          ODK_TOKEN_NOT_FOUND,
          'No ODK App User found for this user',
          404
        );
      }

      // Step 3: Decrypt token (AC1, AC4)
      let plaintext: string;
      try {
        const key = requireEncryptionKey(config.encryptionKey);
        plaintext = decryptToken(record.encryptedToken, record.tokenIv, key);
      } catch (error) {
        // Log detailed error internally, return sanitized message (AC4)
        logger.error({
          event: 'odk.token.decryption_failed',
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw new AppError(
          ODK_TOKEN_DECRYPTION_ERROR,
          'Unable to decrypt token',
          500
        );
      }

      // Step 4: Audit log (AC3)
      // Note: health_check purpose never reaches here (blocked by isAuthorized)
      await audit.logTokenAccessed(userId, context.callerId, context.purpose);

      logger.info({
        event: 'odk.token.accessed',
        userId,
        accessorId: context.callerId,
        purpose: context.purpose,
      });

      return plaintext;
    },

    async validateTokenHealth(userId: string, context?: HealthCheckContext): Promise<TokenHealthResult> {
      // Step 0: Authorization check if context provided (AC6: SUPER_ADMIN only)
      if (context && context.role !== UserRoleEnum.SUPER_ADMIN) {
        logger.warn({
          event: 'odk.token.health_check.unauthorized',
          userId,
          callerId: context.callerId,
          role: context.role,
        });

        return {
          valid: false,
          error: 'Health check requires SUPER_ADMIN role',
        };
      }

      // Step 1: Find record
      const record = await persistence.findByUserId(userId);

      if (!record) {
        logger.info({
          event: 'odk.token.health_check',
          userId,
          callerId: context?.callerId,
          valid: false,
          error: 'not_found',
        });

        return {
          valid: false,
          error: 'ODK App User not found for this user',
        };
      }

      // Step 2: Try to decrypt (validates token integrity)
      try {
        const key = requireEncryptionKey(config.encryptionKey);
        // Decrypt to verify it works, but don't return the plaintext
        decryptToken(record.encryptedToken, record.tokenIv, key);

        logger.info({
          event: 'odk.token.health_check',
          userId,
          callerId: context?.callerId,
          valid: true,
        });

        return { valid: true };
      } catch (error) {
        logger.warn({
          event: 'odk.token.health_check',
          userId,
          callerId: context?.callerId,
          valid: false,
          error: 'decryption_failed',
        });

        return {
          valid: false,
          error: 'Unable to decrypt token - data may be corrupted',
        };
      }
    },
  };
}
