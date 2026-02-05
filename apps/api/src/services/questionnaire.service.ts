import { db } from '../db/index.js';
import {
  questionnaireForms,
  questionnaireFiles,
  questionnaireVersions,
} from '../db/schema/index.js';
import { auditLogs } from '../db/schema/index.js';
import { eq, desc, count } from 'drizzle-orm';
import { createHash } from 'crypto';
import { AppError } from '@oslsr/utils';
import { XlsformParserService } from './xlsform-parser.service.js';
import type {
  QuestionnaireFormStatus,
  XlsformValidationResult,
} from '@oslsr/types';
import { VALID_STATUS_TRANSITIONS } from '@oslsr/types';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';

const logger = pino({ name: 'questionnaire-service' });

export interface UploadFormResult {
  id: string;
  formId: string;
  version: string;
  title: string;
  status: QuestionnaireFormStatus;
  validation: XlsformValidationResult;
}

export interface FormWithVersions {
  id: string;
  formId: string;
  version: string;
  title: string;
  status: QuestionnaireFormStatus;
  fileHash: string;
  fileName: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: Date;
  versions: Array<{
    id: string;
    version: string;
    changeNotes: string | null;
    createdBy: string;
    createdAt: Date;
  }>;
}

/**
 * Questionnaire Service
 * Handles XLSForm upload, validation, versioning, and lifecycle management
 */
export class QuestionnaireService {
  /**
   * Upload and process a new XLSForm
   */
  static async uploadForm(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    userId: string,
    changeNotes?: string
  ): Promise<UploadFormResult> {
    logger.info({
      event: 'questionnaire.upload_started',
      fileName: file.originalname,
      fileSize: file.size,
      userId,
    });

    // Validate file type
    const isXlsx = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.toLowerCase().endsWith('.xlsx');
    const isXml = file.mimetype === 'application/xml' ||
      file.mimetype === 'text/xml' ||
      file.originalname.toLowerCase().endsWith('.xml');

    if (!isXlsx && !isXml) {
      throw new AppError(
        'INVALID_FILE_TYPE',
        'Only .xlsx and .xml files are allowed',
        400
      );
    }

    // Parse the file
    let formData;
    try {
      formData = isXlsx
        ? XlsformParserService.parseXlsxFile(file.buffer)
        : XlsformParserService.parseXmlFile(file.buffer);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'XLSFORM_PARSE_ERROR',
        `Failed to parse file: ${(error as Error).message}`,
        400
      );
    }

    // Validate the form (XML files get limited validation)
    const validation = XlsformParserService.validate(formData, isXml);

    if (!validation.isValid) {
      logger.warn({
        event: 'questionnaire.validation_failed',
        formId: formData.settings.form_id,
        errorCount: validation.errors.length,
      });
      throw new AppError(
        'XLSFORM_VALIDATION_ERROR',
        'Form validation failed',
        400,
        {
          errors: validation.errors,
          warnings: validation.warnings,
        }
      );
    }

    // Compute file hash for duplicate detection
    const fileHash = this.computeFileHash(file.buffer);

    // Check for duplicate file
    const existingByHash = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.fileHash, fileHash),
    });

    if (existingByHash) {
      throw new AppError(
        'DUPLICATE_FORM',
        `This file has already been uploaded as version ${existingByHash.version} of form "${existingByHash.title}"`,
        409,
        { existingFormId: existingByHash.id, existingVersion: existingByHash.version }
      );
    }

    // Get existing versions for this form_id to determine new version
    const existingVersions = await db.query.questionnaireForms.findMany({
      where: eq(questionnaireForms.formId, formData.settings.form_id),
      orderBy: desc(questionnaireForms.createdAt),
    });

    const newVersion = this.generateVersion(
      formData.settings.version,
      existingVersions.map(v => v.version)
    );

    // Create the form record
    const formId = uuidv7();
    const fileId = uuidv7();
    const versionId = uuidv7();

    await db.transaction(async (tx) => {
      // Insert form record
      await tx.insert(questionnaireForms).values({
        id: formId,
        formId: formData.settings.form_id,
        version: newVersion,
        title: formData.settings.form_title,
        status: 'draft',
        fileHash,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        validationWarnings: validation.warnings.length > 0
          ? JSON.stringify(validation.warnings)
          : null,
        uploadedBy: userId,
      });

      // Insert file blob
      await tx.insert(questionnaireFiles).values({
        id: fileId,
        formId,
        fileBlob: file.buffer,
      });

      // Insert version record
      await tx.insert(questionnaireVersions).values({
        id: versionId,
        formIdLogical: formData.settings.form_id,
        version: newVersion,
        questionnaireFormId: formId,
        changeNotes: changeNotes || null,
        createdBy: userId,
      });

      // Create audit log
      await tx.insert(auditLogs).values({
        id: uuidv7(),
        actorId: userId,
        action: 'questionnaire.upload',
        targetResource: 'questionnaire_forms',
        targetId: formId,
        details: {
          formId: formData.settings.form_id,
          version: newVersion,
          title: formData.settings.form_title,
          fileName: file.originalname,
          fileSize: file.size,
          fileHash,
          warningCount: validation.warnings.length,
        },
      });
    });

    logger.info({
      event: 'questionnaire.upload_success',
      formId: formData.settings.form_id,
      version: newVersion,
      id: formId,
    });

    return {
      id: formId,
      formId: formData.settings.form_id,
      version: newVersion,
      title: formData.settings.form_title,
      status: 'draft',
      validation,
    };
  }

  /**
   * Get all versions of a form by its logical form_id
   */
  static async getFormVersions(logicalFormId: string): Promise<FormWithVersions[]> {
    const forms = await db.query.questionnaireForms.findMany({
      where: eq(questionnaireForms.formId, logicalFormId),
      orderBy: desc(questionnaireForms.createdAt),
    });

    const result: FormWithVersions[] = [];

    for (const form of forms) {
      const versions = await db.query.questionnaireVersions.findMany({
        where: eq(questionnaireVersions.questionnaireFormId, form.id),
        orderBy: desc(questionnaireVersions.createdAt),
      });

      result.push({
        id: form.id,
        formId: form.formId,
        version: form.version,
        title: form.title,
        status: form.status as QuestionnaireFormStatus,
        fileHash: form.fileHash,
        fileName: form.fileName,
        fileSize: form.fileSize,
        uploadedBy: form.uploadedBy,
        uploadedAt: form.createdAt,
        versions: versions.map(v => ({
          id: v.id,
          version: v.version,
          changeNotes: v.changeNotes,
          createdBy: v.createdBy,
          createdAt: v.createdAt,
        })),
      });
    }

    return result;
  }

  /**
   * Get a single form by its UUID
   */
  static async getFormById(id: string): Promise<FormWithVersions | null> {
    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, id),
    });

    if (!form) return null;

    const versions = await db.query.questionnaireVersions.findMany({
      where: eq(questionnaireVersions.questionnaireFormId, form.id),
      orderBy: desc(questionnaireVersions.createdAt),
    });

    return {
      id: form.id,
      formId: form.formId,
      version: form.version,
      title: form.title,
      status: form.status as QuestionnaireFormStatus,
      fileHash: form.fileHash,
      fileName: form.fileName,
      fileSize: form.fileSize,
      uploadedBy: form.uploadedBy,
      uploadedAt: form.createdAt,
      versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        changeNotes: v.changeNotes,
        createdBy: v.createdBy,
        createdAt: v.createdAt,
      })),
    };
  }

  /**
   * List all forms with pagination
   */
  static async listForms(options: {
    page?: number;
    pageSize?: number;
    status?: QuestionnaireFormStatus;
  } = {}): Promise<{
    data: Array<Omit<FormWithVersions, 'versions'>>;
    meta: { total: number; page: number; pageSize: number; totalPages: number };
  }> {
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const offset = (page - 1) * pageSize;

    const whereClause = options.status
      ? eq(questionnaireForms.status, options.status)
      : undefined;

    const [forms, countResult] = await Promise.all([
      db.query.questionnaireForms.findMany({
        where: whereClause,
        orderBy: desc(questionnaireForms.createdAt),
        limit: pageSize,
        offset,
      }),
      db.select({ count: count() }).from(questionnaireForms).where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: forms.map(form => ({
        id: form.id,
        formId: form.formId,
        version: form.version,
        title: form.title,
        status: form.status as QuestionnaireFormStatus,
        fileHash: form.fileHash,
        fileName: form.fileName,
        fileSize: form.fileSize,
        uploadedBy: form.uploadedBy,
        uploadedAt: form.createdAt,
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Update form status with transition validation
   */
  static async updateFormStatus(
    id: string,
    newStatus: QuestionnaireFormStatus,
    userId: string
  ): Promise<void> {
    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, id),
    });

    if (!form) {
      throw new AppError('FORM_NOT_FOUND', 'Questionnaire form not found', 404);
    }

    const currentStatus = form.status as QuestionnaireFormStatus;

    // Validate status transition using shared transition map
    if (!VALID_STATUS_TRANSITIONS[currentStatus].includes(newStatus)) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition from '${currentStatus}' to '${newStatus}'`,
        400,
        { currentStatus, newStatus, allowedTransitions: VALID_STATUS_TRANSITIONS[currentStatus] }
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(questionnaireForms)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(questionnaireForms.id, id));

      await tx.insert(auditLogs).values({
        id: uuidv7(),
        actorId: userId,
        action: 'questionnaire.status_change',
        targetResource: 'questionnaire_forms',
        targetId: id,
        details: {
          formId: form.formId,
          version: form.version,
          previousStatus: currentStatus,
          newStatus,
        },
      });
    });

    logger.info({
      event: 'questionnaire.status_changed',
      formId: form.formId,
      version: form.version,
      previousStatus: currentStatus,
      newStatus,
      userId,
    });
  }

  /**
   * Delete a draft form (only drafts can be deleted)
   */
  static async deleteForm(id: string, userId: string): Promise<void> {
    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, id),
    });

    if (!form) {
      throw new AppError('FORM_NOT_FOUND', 'Questionnaire form not found', 404);
    }

    if (form.status !== 'draft') {
      throw new AppError(
        'CANNOT_DELETE_NON_DRAFT',
        'Only draft forms can be deleted. Use archive for non-draft forms.',
        400,
        { currentStatus: form.status }
      );
    }

    await db.transaction(async (tx) => {
      // Delete version records first (FK constraint)
      await tx
        .delete(questionnaireVersions)
        .where(eq(questionnaireVersions.questionnaireFormId, id));

      // Files are cascade deleted via FK
      await tx.delete(questionnaireForms).where(eq(questionnaireForms.id, id));

      await tx.insert(auditLogs).values({
        id: uuidv7(),
        actorId: userId,
        action: 'questionnaire.delete',
        targetResource: 'questionnaire_forms',
        targetId: id,
        details: {
          formId: form.formId,
          version: form.version,
          title: form.title,
          fileName: form.fileName,
        },
      });
    });

    logger.info({
      event: 'questionnaire.deleted',
      formId: form.formId,
      version: form.version,
      id,
      userId,
    });
  }

  /**
   * Download the original file for a form
   */
  static async downloadForm(id: string): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }> {
    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, id),
    });

    if (!form) {
      throw new AppError('FORM_NOT_FOUND', 'Questionnaire form not found', 404);
    }

    const file = await db.query.questionnaireFiles.findFirst({
      where: eq(questionnaireFiles.formId, id),
    });

    if (!file) {
      throw new AppError('FILE_NOT_FOUND', 'Form file not found', 404);
    }

    return {
      buffer: file.fileBlob,
      fileName: form.fileName,
      mimeType: form.mimeType,
    };
  }

  /**
   * Generate a new version number based on existing versions
   * If the uploaded form has a version, use it (but increment if conflict)
   * Otherwise, auto-increment from existing versions
   */
  static generateVersion(requestedVersion: string, existingVersions: string[]): string {
    if (existingVersions.length === 0) {
      return requestedVersion || '1.0.0';
    }

    // Parse and find the highest existing version
    const parseVersion = (v: string): [number, number, number] => {
      const parts = v.split('.').map(p => parseInt(p, 10) || 0);
      return [parts[0] || 1, parts[1] || 0, parts[2] || 0];
    };

    const highestVersion = existingVersions
      .map(parseVersion)
      .sort((a, b) => {
        if (a[0] !== b[0]) return b[0] - a[0];
        if (a[1] !== b[1]) return b[1] - a[1];
        return b[2] - a[2];
      })[0];

    // If requested version exists, increment patch
    if (existingVersions.includes(requestedVersion)) {
      return `${highestVersion[0]}.${highestVersion[1]}.${highestVersion[2] + 1}`;
    }

    // If requested version is higher than existing, use it
    const requestedParsed = parseVersion(requestedVersion);
    if (
      requestedParsed[0] > highestVersion[0] ||
      (requestedParsed[0] === highestVersion[0] && requestedParsed[1] > highestVersion[1]) ||
      (requestedParsed[0] === highestVersion[0] && requestedParsed[1] === highestVersion[1] && requestedParsed[2] > highestVersion[2])
    ) {
      return requestedVersion;
    }

    // Otherwise, increment minor version
    return `${highestVersion[0]}.${highestVersion[1] + 1}.0`;
  }

  /**
   * Compute SHA-256 hash of file content
   */
  static computeFileHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
