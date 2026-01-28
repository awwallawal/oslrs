/**
 * @oslsr/odk-integration
 *
 * ODK Central Integration Module (ADR-002)
 *
 * ALL ODK Central API calls MUST go through this package.
 * No other service or controller may import HTTP clients or call ODK endpoints directly.
 *
 * Exports:
 * - ODK Client: Low-level HTTP client with session token management
 * - ODK Form Service: Form deployment business logic (Story 2.2)
 * - ODK App User Service: App User provisioning business logic (Story 2.3)
 */

// ODK Client - low-level HTTP client with auth management
export {
  getOdkConfig,
  isOdkAvailable,
  clearOdkSession,
  odkRequest,
  handleOdkError,
  requireOdkConfig,
  createAppUser,
} from './odk-client.js';

// ODK Form Service - form deployment business logic
export {
  deployFormToOdk,
  logOrphanedDeployment,
  type OdkDeploymentResult,
} from './odk-form.service.js';

// ODK App User Service - App User provisioning business logic (Story 2.3)
export {
  provisionAppUser,
  encryptAppUserToken,
  logOrphanedAppUser,
  type OdkAppUserPersistence,
  type OdkAppUserAudit,
  type EncryptedAppUserData,
} from './odk-app-user.service.js';

// Re-export types from @oslsr/types for convenience
export type {
  OdkConfig,
  OdkSessionResponse,
  OdkFormResponse,
  OdkErrorResponse,
  OdkAppUserApiResponse,
  OdkAppUserRecord,
  OdkAppUserResponse,
} from '@oslsr/types';
