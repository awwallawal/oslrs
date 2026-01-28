import pino from 'pino';
import { AppError, encryptToken, requireEncryptionKey } from '@oslsr/utils';
import type {
  OdkConfig,
  OdkAppUserRecord,
  OdkAppUserResponse,
  OdkAppUserApiResponse,
} from '@oslsr/types';
import { createAppUser, requireOdkConfig } from './odk-client.js';

/**
 * ODK App User Provisioning Service
 *
 * Per ADR-002: ALL ODK Central API calls MUST go through @oslsr/odk-integration.
 * Per ADR-006: App User tokens MUST be encrypted using AES-256-GCM before storage.
 *
 * This service handles:
 * - Creating App Users in ODK Central
 * - Encrypting tokens for secure storage
 * - Providing an interface for the job processor to persist records
 */

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

/**
 * Interface for ODK App User persistence operations.
 * Implemented by the caller (apps/api) to handle database operations.
 */
export interface OdkAppUserPersistence {
  /** Check if an App User already exists for this user */
  findByUserId(userId: string): Promise<OdkAppUserRecord | null>;

  /** Save a new App User record */
  create(record: Omit<OdkAppUserRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<OdkAppUserRecord>;
}

/**
 * Interface for audit logging.
 * Implemented by the caller (apps/api) to handle audit operations.
 */
export interface OdkAppUserAudit {
  /** Log the App User provisioning action */
  logProvisioned(userId: string, odkAppUserId: number, odkProjectId: number, displayName: string): Promise<void>;
}

/**
 * Result of encrypting an ODK App User token.
 * Contains all data needed to store in odk_app_users table.
 */
export interface EncryptedAppUserData {
  userId: string;
  odkAppUserId: number;
  displayName: string;
  encryptedToken: string;
  tokenIv: string;
  odkProjectId: number;
}

/**
 * Provision an ODK App User for a staff member.
 *
 * Per AC1-AC8: Creates App User in ODK Central, encrypts token, persists to DB, and logs audit.
 *
 * @param userId Staff member's user ID
 * @param fullName Staff member's full name (used as displayName)
 * @param role Staff member's role (for logging context)
 * @param persistence Database operations interface
 * @param audit Audit logging interface
 * @returns OdkAppUserResponse (WITHOUT encrypted token - never expose plaintext)
 * @throws AppError if provisioning fails
 */
export async function provisionAppUser(
  userId: string,
  fullName: string,
  role: string,
  persistence: OdkAppUserPersistence,
  audit: OdkAppUserAudit
): Promise<OdkAppUserResponse> {
  // Get ODK configuration (throws if not configured)
  const config = requireOdkConfig();

  logger.info({
    event: 'odk.appuser.provision_started',
    userId,
    fullName,
    role,
    odkProjectId: config.ODK_PROJECT_ID,
  });

  // Check if App User already exists (idempotent - AC5)
  const existing = await persistence.findByUserId(userId);
  if (existing) {
    logger.info({
      event: 'odk.appuser.already_exists',
      userId,
      odkAppUserId: existing.odkAppUserId,
    });

    // Return existing record (without encrypted token)
    return toResponse(existing);
  }

  // Create App User in ODK Central (AC2)
  const displayName = `${fullName} (${role})`;
  const odkAppUser = await createAppUser(config, config.ODK_PROJECT_ID, displayName);

  // Encrypt token (AC4)
  const encryptedData = await encryptAppUserToken(userId, odkAppUser, config);

  // Persist to database (AC3)
  const record = await persistence.create({
    userId: encryptedData.userId,
    odkAppUserId: encryptedData.odkAppUserId,
    displayName: encryptedData.displayName,
    encryptedToken: encryptedData.encryptedToken,
    tokenIv: encryptedData.tokenIv,
    odkProjectId: encryptedData.odkProjectId,
  });

  // Create audit log (AC8)
  await audit.logProvisioned(
    userId,
    record.odkAppUserId,
    record.odkProjectId,
    record.displayName
  );

  logger.info({
    event: 'odk.appuser.created',
    userId,
    odkAppUserId: record.odkAppUserId,
    odkProjectId: record.odkProjectId,
  });

  // Return without token (never expose plaintext token)
  return toResponse(record);
}

/**
 * Encrypt an ODK App User token for storage.
 * Used internally by provisionAppUser and exposed for testing.
 *
 * @param userId Staff member's user ID
 * @param odkAppUser Response from ODK Central API
 * @param config ODK configuration (must include encryption key)
 * @returns Encrypted data ready for database storage
 * @throws Error if encryption key is not configured
 */
export function encryptAppUserToken(
  userId: string,
  odkAppUser: OdkAppUserApiResponse,
  config: OdkConfig
): EncryptedAppUserData {
  // Get encryption key (throws if not configured)
  const encryptionKey = requireEncryptionKey(config.ODK_TOKEN_ENCRYPTION_KEY);

  // Encrypt the token using AES-256-GCM
  const { ciphertext, iv } = encryptToken(odkAppUser.token, encryptionKey);

  return {
    userId,
    odkAppUserId: odkAppUser.id,
    displayName: odkAppUser.displayName,
    encryptedToken: ciphertext,
    tokenIv: iv,
    odkProjectId: config.ODK_PROJECT_ID,
  };
}

/**
 * Convert database record to API response (without encrypted token).
 */
function toResponse(record: OdkAppUserRecord): OdkAppUserResponse {
  return {
    id: record.id,
    userId: record.userId,
    odkAppUserId: record.odkAppUserId,
    displayName: record.displayName,
    odkProjectId: record.odkProjectId,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Log a critical alert for orphaned App User (ODK success but DB insert failed).
 * Per ADR-002: Do NOT attempt to delete from ODK - manual reconciliation needed.
 */
export function logOrphanedAppUser(
  userId: string,
  odkAppUserId: number,
  odkProjectId: number,
  error: Error
): void {
  logger.fatal({
    event: 'odk.appuser.provision_orphaned',
    userId,
    odkAppUserId,
    odkProjectId,
    error: error.message,
    stack: error.stack,
    action_required: 'Manual reconciliation needed - App User exists in ODK but not in app_db',
  });
}
