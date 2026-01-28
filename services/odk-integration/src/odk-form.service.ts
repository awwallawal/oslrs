import pino from 'pino';
import { AppError } from '@oslsr/utils';
import type { OdkConfig, OdkFormResponse } from '@oslsr/types';
import { requireOdkConfig, odkRequest, handleOdkError } from './odk-client.js';

/**
 * ODK Form Deployment Service
 *
 * Per ADR-002: ALL ODK Central API calls MUST go through @oslsr/odk-integration.
 *
 * Deployment flows:
 * 1. First-time publish: POST /v1/projects/{projectId}/forms?publish=true
 * 2. Version update (409 on first-time): POST draft, then POST publish
 *
 * Error handling:
 * - ODK success + DB failure = log critical alert (odk.form.deploy_orphaned)
 * - Do NOT attempt to delete from ODK (destructive) - manual reconciliation
 */

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

/**
 * Result of a successful ODK deployment
 */
export interface OdkDeploymentResult {
  xmlFormId: string;
  projectId: number;
  publishedAt: string;
  isVersionUpdate: boolean;
}

/**
 * Deploy a form to ODK Central.
 *
 * @param fileBuffer - The XLSForm file content (xlsx or xml)
 * @param fileName - Original filename for Content-Disposition
 * @param mimeType - MIME type of the file
 * @returns Deployment result with xmlFormId and publishedAt
 * @throws AppError with ODK error codes
 */
export async function deployFormToOdk(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<OdkDeploymentResult> {
  const config = requireOdkConfig();

  logger.info({
    event: 'odk.form.deploy_started',
    fileName,
    fileSize: fileBuffer.length,
    projectId: config.ODK_PROJECT_ID,
  });

  // Try first-time publish
  const firstTimeResult = await tryFirstTimePublish(config, fileBuffer, fileName, mimeType);

  if (firstTimeResult.success) {
    logger.info({
      event: 'odk.form.deploy',
      xmlFormId: firstTimeResult.data!.xmlFormId,
      projectId: config.ODK_PROJECT_ID,
      isVersionUpdate: false,
    });
    return firstTimeResult.data!;
  }

  // If form already exists (409), try version update flow
  if (firstTimeResult.isFormExists) {
    const xmlFormId = firstTimeResult.existingXmlFormId;
    if (!xmlFormId) {
      throw new AppError(
        'ODK_DEPLOYMENT_FAILED',
        'Form exists but could not determine xmlFormId for version update',
        500,
        { fileName }
      );
    }

    logger.info({
      event: 'odk.form.deploy_version_update_starting',
      xmlFormId,
      projectId: config.ODK_PROJECT_ID,
    });

    const versionUpdateResult = await doVersionUpdate(config, fileBuffer, fileName, mimeType, xmlFormId);

    logger.info({
      event: 'odk.form.deploy_version_update',
      xmlFormId: versionUpdateResult.xmlFormId,
      projectId: config.ODK_PROJECT_ID,
      isVersionUpdate: true,
    });

    return versionUpdateResult;
  }

  // Other error - re-throw
  throw firstTimeResult.error!;
}

/**
 * Try first-time publish: POST /v1/projects/{projectId}/forms?publish=true&ignoreWarnings=true
 */
async function tryFirstTimePublish(
  config: OdkConfig,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{
  success: boolean;
  data?: OdkDeploymentResult;
  isFormExists?: boolean;
  existingXmlFormId?: string;
  error?: AppError;
}> {
  const path = `/v1/projects/${config.ODK_PROJECT_ID}/forms?publish=true&ignoreWarnings=true`;

  // Determine content type based on file type
  const contentType = mimeType.includes('xml')
    ? 'application/xml'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  try {
    const response = await odkRequest(config, 'POST', path, {
      body: fileBuffer,
      contentType,
      headers: {
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-XlsForm-FormId-Fallback': extractFormIdFromFileName(fileName),
      },
    });

    if (response.ok) {
      const formData = await response.json() as OdkFormResponse;
      return {
        success: true,
        data: {
          xmlFormId: formData.xmlFormId,
          projectId: config.ODK_PROJECT_ID,
          publishedAt: formData.publishedAt || new Date().toISOString(),
          isVersionUpdate: false,
        },
      };
    }

    // Handle 409 - form already exists
    if (response.status === 409) {
      const errorBody = await response.json().catch(() => ({ message: 'Form already exists' }));
      // Try to extract xmlFormId from error or use filename-based fallback
      const xmlFormId = extractXmlFormIdFromError(errorBody) || extractFormIdFromFileName(fileName);

      return {
        success: false,
        isFormExists: true,
        existingXmlFormId: xmlFormId,
      };
    }

    // Other error
    const errorBody = await response.text();
    return {
      success: false,
      error: new AppError(
        'ODK_DEPLOYMENT_FAILED',
        `ODK Central deployment failed: ${errorBody}`,
        response.status >= 500 ? 502 : response.status,
        { odkStatus: response.status, odkError: errorBody }
      ),
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { success: false, error };
    }
    return {
      success: false,
      error: new AppError(
        'ODK_DEPLOYMENT_FAILED',
        `ODK Central connection failed: ${(error as Error).message}`,
        503,
        { cause: (error as Error).message }
      ),
    };
  }
}

/**
 * Version update flow:
 * 1. POST /v1/projects/{projectId}/forms/{xmlFormId}/draft (upload new version as draft)
 * 2. POST /v1/projects/{projectId}/forms/{xmlFormId}/draft/publish (publish the draft)
 */
async function doVersionUpdate(
  config: OdkConfig,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  xmlFormId: string
): Promise<OdkDeploymentResult> {
  // Step 1: Upload as draft
  const draftPath = `/v1/projects/${config.ODK_PROJECT_ID}/forms/${encodeURIComponent(xmlFormId)}/draft`;

  const contentType = mimeType.includes('xml')
    ? 'application/xml'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const draftResponse = await odkRequest(config, 'POST', draftPath, {
    body: fileBuffer,
    contentType,
    headers: {
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });

  if (!draftResponse.ok) {
    const errorBody = await draftResponse.text();
    logger.error({
      event: 'odk.form.deploy_draft_failed',
      xmlFormId,
      status: draftResponse.status,
      error: errorBody,
    });
    handleOdkError(draftResponse, errorBody, { xmlFormId, stage: 'draft_upload' });
  }

  // Step 2: Publish the draft
  const publishPath = `/v1/projects/${config.ODK_PROJECT_ID}/forms/${encodeURIComponent(xmlFormId)}/draft/publish`;

  const publishResponse = await odkRequest(config, 'POST', publishPath, {});

  if (!publishResponse.ok) {
    const errorBody = await publishResponse.text();
    logger.error({
      event: 'odk.form.deploy_publish_failed',
      xmlFormId,
      status: publishResponse.status,
      error: errorBody,
    });
    handleOdkError(publishResponse, errorBody, { xmlFormId, stage: 'draft_publish' });
  }

  const formData = await publishResponse.json() as OdkFormResponse;

  return {
    xmlFormId: formData.xmlFormId,
    projectId: config.ODK_PROJECT_ID,
    publishedAt: formData.publishedAt || new Date().toISOString(),
    isVersionUpdate: true,
  };
}

/**
 * Log a critical alert for orphaned deployment (ODK success but DB update failed).
 * Per dev notes: Do NOT attempt to delete from ODK - manual reconciliation needed.
 */
export function logOrphanedDeployment(
  xmlFormId: string,
  projectId: number,
  formId: string,
  error: Error
): void {
  logger.fatal({
    event: 'odk.form.deploy_orphaned',
    xmlFormId,
    projectId,
    formId,
    error: error.message,
    stack: error.stack,
    action_required: 'Manual reconciliation needed - form exists in ODK but not marked published in app_db',
  });
}

/**
 * Extract form_id from filename (fallback for version updates)
 * e.g., "oslsr_master_v3.xlsx" -> "oslsr_master_v3"
 */
function extractFormIdFromFileName(fileName: string): string {
  return fileName.replace(/\.(xlsx|xml)$/i, '');
}

/**
 * Try to extract xmlFormId from ODK 409 error response
 */
function extractXmlFormIdFromError(errorBody: unknown): string | undefined {
  if (typeof errorBody === 'object' && errorBody !== null) {
    const body = errorBody as Record<string, unknown>;
    // ODK Central may include the existing form ID in the error details
    if (body.details && typeof body.details === 'object') {
      const details = body.details as Record<string, unknown>;
      if (typeof details.xmlFormId === 'string') {
        return details.xmlFormId;
      }
    }
  }
  return undefined;
}
