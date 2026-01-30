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
  // Health monitoring methods (Story 2.5)
  getProjectForms,
  getFormSubmissionCount,
  getSubmissionsAfter,
  setFormState,
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

// ODK Token Service - Token retrieval and management (Story 2.4)
export {
  createOdkTokenService,
  type TokenAccessContext,
  type TokenHealthResult,
  type HealthCheckContext,
  type OdkTokenPersistence,
  type OdkTokenAudit,
  type OdkTokenConfig,
  type OdkTokenLogger,
  type OdkTokenServiceDeps,
  type OdkTokenService,
} from './odk-token.service.js';

// ODK Configuration Validation (Story 2.4)
export {
  validateOdkTokenConfig,
  isOdkFullyConfigured,
  logOdkConfigStatus,
  requireTokenEncryptionKey,
  type OdkConfigValidationResult,
} from './odk-config.js';

// ODK Health Service - Health monitoring and backfill (Story 2.5)
export {
  createOdkHealthService,
  type OdkSyncFailurePersistence,
  type OdkHealthLogger,
  type OdkHealthServiceDeps,
  type OdkHealthService,
  type RetryHandler,
} from './odk-health.service.js';

// ODK Form Unpublish Service - Form lifecycle management (Story 2.5)
export {
  createOdkFormUnpublishService,
  type OdkFormUnpublishPersistence,
  type OdkFormUnpublishServiceDeps,
  type UnpublishFormResult,
  type OdkFormUnpublishService,
} from './odk-form-unpublish.service.js';

// ODK Backfill Service - Manual submission backfill (Story 2.5, AC5)
export {
  createOdkBackfillService,
  type OdkBackfillPersistence,
  type OdkBackfillLock,
  type OdkBackfillServiceDeps,
  type OdkBackfillService,
  type FormSubmissionGap,
  type SubmissionGapResult,
  type BackfillResult,
} from './odk-backfill.service.js';

// Re-export types from @oslsr/types for convenience
export type {
  OdkConfig,
  OdkSessionResponse,
  OdkFormResponse,
  OdkErrorResponse,
  OdkAppUserApiResponse,
  OdkAppUserRecord,
  OdkAppUserResponse,
  OdkOperation,
  OdkSyncFailure,
  OdkConnectivityStatus,
  OdkSubmissionSyncStatus,
  OdkHealthResponse,
  OdkFormInfo,
  OdkSubmissionInfo,
  RecordSyncFailureInput,
  RetrySyncFailureResult,
} from '@oslsr/types';
