/**
 * ODK Form Unpublish Service (Story 2-5, AC: 3)
 *
 * Per ADR-002: ALL ODK Central API calls MUST go through @oslsr/odk-integration.
 *
 * Handles unpublishing forms from ODK Central:
 * - Sets ODK form state to 'closing' (no new submissions, data still accessible)
 * - Updates app_db questionnaire status to 'closing'
 * - Creates audit log entry with action 'form.unpublished'
 *
 * Note: 'closing' is the correct ODK state for unpublish (NOT 'draft').
 * Once published, a form cannot return to draft state.
 */

import pino from 'pino';
import { AppError } from '@oslsr/utils';
import {
  type OdkConfig,
  AUDIT_ACTION_FORM_UNPUBLISHED,
} from '@oslsr/types';
import { setFormState } from './odk-client.js';
import { isOdkFullyConfigured } from './odk-config.js';

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

/**
 * Persistence interface for form unpublish operations
 */
export interface OdkFormUnpublishPersistence {
  getQuestionnaireForm(formId: string): Promise<{
    id: string;
    status: string;
    odkXmlFormId: string | null;
  } | null>;
  updateQuestionnaireStatus(formId: string, status: string): Promise<void>;
  createAuditLog(entry: {
    actorId: string;
    action: string;
    targetResource: string;
    targetId: string;
    details: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>;
}

/**
 * Dependencies for ODK Form Unpublish Service
 */
export interface OdkFormUnpublishServiceDeps {
  persistence: OdkFormUnpublishPersistence;
  getOdkConfig: () => OdkConfig | null;
  logger?: typeof logger;
}

/**
 * Result of unpublishing a form
 */
export interface UnpublishFormResult {
  success: boolean;
  formId: string;
  previousStatus: string;
  newStatus: string;
  odkUpdated: boolean;
}

/**
 * ODK Form Unpublish Service interface
 */
export interface OdkFormUnpublishService {
  unpublishForm(
    formId: string,
    actorId: string,
    requestContext?: { ipAddress?: string; userAgent?: string }
  ): Promise<UnpublishFormResult>;
}

/**
 * Create ODK Form Unpublish Service with dependency injection
 */
export function createOdkFormUnpublishService(deps: OdkFormUnpublishServiceDeps): OdkFormUnpublishService {
  const { persistence, getOdkConfig, logger: log = logger } = deps;

  /**
   * Unpublish a form in ODK Central.
   *
   * Per AC3: Sets form state to 'closing' and creates audit log.
   *
   * @param formId The questionnaire_forms.id
   * @param actorId The user performing the action
   * @param requestContext IP address and user agent for audit log
   * @returns UnpublishFormResult
   */
  async function unpublishForm(
    formId: string,
    actorId: string,
    requestContext?: { ipAddress?: string; userAgent?: string }
  ): Promise<UnpublishFormResult> {
    // Check ODK configuration
    if (!isOdkFullyConfigured()) {
      throw new AppError(
        'ODK_CONFIG_ERROR',
        'ODK integration is not fully configured',
        503
      );
    }

    const config = getOdkConfig();
    if (!config) {
      throw new AppError(
        'ODK_CONFIG_ERROR',
        'ODK integration is not fully configured',
        503
      );
    }

    // Get the form record
    const form = await persistence.getQuestionnaireForm(formId);

    if (!form) {
      throw new AppError(
        'FORM_NOT_FOUND',
        `Questionnaire form ${formId} not found`,
        404
      );
    }

    // Validate current status allows unpublish
    if (form.status !== 'published') {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot unpublish form with status '${form.status}'. Only published forms can be unpublished.`,
        400,
        { currentStatus: form.status }
      );
    }

    // Verify form has been deployed to ODK
    if (!form.odkXmlFormId) {
      throw new AppError(
        'FORM_NOT_DEPLOYED',
        'Form has not been deployed to ODK Central and cannot be unpublished',
        400
      );
    }

    log.info({
      event: 'odk.form.unpublish_started',
      formId,
      odkXmlFormId: form.odkXmlFormId,
      actorId,
    });

    let odkUpdated = false;

    try {
      // Step 1: Set ODK form state to 'closing'
      await setFormState(config, config.ODK_PROJECT_ID, form.odkXmlFormId, 'closing');
      odkUpdated = true;

      log.info({
        event: 'odk.form.unpublish_odk_updated',
        formId,
        odkXmlFormId: form.odkXmlFormId,
      });
    } catch (error) {
      log.error({
        event: 'odk.form.unpublish_odk_failed',
        formId,
        odkXmlFormId: form.odkXmlFormId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new AppError(
        'ODK_UNPUBLISH_FAILED',
        `Failed to unpublish form in ODK Central: ${error instanceof Error ? error.message : String(error)}`,
        502,
        { formId, odkXmlFormId: form.odkXmlFormId }
      );
    }

    // Step 2: Update app_db status to 'closing'
    await persistence.updateQuestionnaireStatus(formId, 'closing');

    log.info({
      event: 'odk.form.unpublish_db_updated',
      formId,
      newStatus: 'closing',
    });

    // Step 3: Create audit log
    await persistence.createAuditLog({
      actorId,
      action: AUDIT_ACTION_FORM_UNPUBLISHED,
      targetResource: 'questionnaire_forms',
      targetId: formId,
      details: {
        odkXmlFormId: form.odkXmlFormId,
        previousStatus: form.status,
        newStatus: 'closing',
      },
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent,
    });

    log.info({
      event: 'odk.form.unpublish_completed',
      formId,
      odkXmlFormId: form.odkXmlFormId,
      actorId,
    });

    return {
      success: true,
      formId,
      previousStatus: form.status,
      newStatus: 'closing',
      odkUpdated,
    };
  }

  return {
    unpublishForm,
  };
}
