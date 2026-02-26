import { db } from '../db/index.js';
import { questionnaireForms } from '../db/schema/index.js';
import { AuditService } from './audit.service.js';
import { eq, desc } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { nativeFormSchema } from '@oslsr/types';
import type { NativeFormSchema, Question, Choice } from '@oslsr/types';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';

const logger = pino({ name: 'native-form-service' });

export interface FlattenedQuestion {
  id: string;
  type: string;
  name: string;
  label: string;
  labelYoruba?: string;
  required: boolean;
  sectionId: string;
  sectionTitle: string;
  choices?: Choice[];
  showWhen?: Question['showWhen'];
  validation?: Question['validation'];
}

export interface FlattenedForm {
  formId: string;
  title: string;
  version: string;
  questions: FlattenedQuestion[];
  choiceLists: Record<string, Choice[]>;
  sectionShowWhen: Record<string, Question['showWhen']>;
}

/**
 * Native Form Service
 * Handles CRUD operations for native forms stored as JSONB in questionnaire_forms.
 */
export class NativeFormService {
  /**
   * Create a new native form with an initial empty schema.
   */
  static async createForm(
    data: { title: string; formId?: string },
    userId: string
  ) {
    const id = uuidv7();
    const logicalFormId = data.formId || id;

    const initialSchema: NativeFormSchema = {
      id,
      title: data.title,
      version: '1.0.0',
      status: 'draft',
      sections: [],
      choiceLists: {},
      createdAt: new Date().toISOString(),
    };

    const schemaJson = JSON.stringify(initialSchema);

    const created = await db.transaction(async (tx) => {
      const [result] = await tx
        .insert(questionnaireForms)
        .values({
          id,
          formId: logicalFormId,
          version: '1.0.0',
          title: data.title,
          status: 'draft',
          fileHash: `native:${id}`,
          fileName: `${data.title}.json`,
          fileSize: Buffer.byteLength(schemaJson, 'utf8'),
          mimeType: 'application/json',
          isNative: true,
          formSchema: initialSchema,
          uploadedBy: userId,
        })
        .returning();

      await AuditService.logActionTx(tx, {
        actorId: userId,
        action: 'native_form.created',
        targetResource: 'questionnaire_forms',
        targetId: id,
        details: { title: data.title, formId: logicalFormId },
      });

      return result;
    });

    logger.info({ event: 'native_form.created', formId: id, userId });

    return created;
  }

  /**
   * Update the form schema JSONB for a draft form.
   */
  static async updateFormSchema(
    formId: string,
    schema: NativeFormSchema,
    userId: string
  ) {
    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, formId),
    });

    if (!form) {
      throw new AppError('FORM_NOT_FOUND', 'Form not found', 404);
    }

    if (form.status !== 'draft') {
      throw new AppError(
        'FORM_NOT_EDITABLE',
        'Cannot edit a published form',
        400
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(questionnaireForms)
        .set({
          formSchema: schema,
          title: schema.title,
          updatedAt: new Date(),
        })
        .where(eq(questionnaireForms.id, formId));

      await AuditService.logActionTx(tx, {
        actorId: userId,
        action: 'native_form.schema_updated',
        targetResource: 'questionnaire_forms',
        targetId: formId,
        details: { version: schema.version },
      });
    });

    logger.info({ event: 'native_form.schema_updated', formId, userId });

    return { success: true };
  }

  /**
   * Validate a schema for publish readiness.
   * Returns { valid, errors }.
   */
  static validateForPublish(schema: NativeFormSchema): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Zod validation
    const zodResult = nativeFormSchema.safeParse(schema);
    if (!zodResult.success) {
      for (const issue of zodResult.error.issues) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`);
      }
    }

    // At least one section with at least one question
    if (!schema.sections || schema.sections.length === 0) {
      errors.push('Form must have at least one section');
    } else {
      const hasQuestions = schema.sections.some(
        (s) => s.questions && s.questions.length > 0
      );
      if (!hasQuestions) {
        errors.push(
          'Form must have at least one question in at least one section'
        );
      }
    }

    // Validate select_one/select_multiple reference valid choice lists
    for (const section of schema.sections || []) {
      for (const question of section.questions || []) {
        if (
          (question.type === 'select_one' ||
            question.type === 'select_multiple') &&
          question.choices
        ) {
          if (!(question.choices in (schema.choiceLists || {}))) {
            errors.push(
              `Question "${question.name}" references nonexistent choice list "${question.choices}"`
            );
          }
        }
      }
    }

    // Validate showWhen conditions reference valid question names within form
    const allQuestionNames = new Set<string>();
    for (const section of schema.sections || []) {
      for (const question of section.questions || []) {
        allQuestionNames.add(question.name);
      }
    }

    const validateShowWhenFields = (
      showWhen: Question['showWhen'],
      context: string
    ) => {
      if (!showWhen) return;
      if ('field' in showWhen) {
        if (!allQuestionNames.has(showWhen.field)) {
          errors.push(
            `${context} showWhen references nonexistent field "${showWhen.field}"`
          );
        }
      } else {
        const conditions = showWhen.any || showWhen.all || [];
        for (const c of conditions) {
          if (!allQuestionNames.has(c.field)) {
            errors.push(
              `${context} showWhen references nonexistent field "${c.field}"`
            );
          }
        }
      }
    };

    for (const section of schema.sections || []) {
      validateShowWhenFields(section.showWhen, `Section "${section.title}"`);
      for (const question of section.questions || []) {
        validateShowWhenFields(
          question.showWhen,
          `Question "${question.name}"`
        );
      }
    }

    // Title must be non-empty
    if (!schema.title || schema.title.trim() === '') {
      errors.push('Form title must not be empty');
    }

    // Version must be valid semver
    if (!schema.version || !/^\d+\.\d+\.\d+$/.test(schema.version)) {
      errors.push('Form version must be valid semver (e.g., "1.0.0")');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Publish a draft form. Sets status to published and syncs nativePublishedAt.
   */
  static async publishForm(formId: string, userId: string) {
    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, formId),
    });

    if (!form) {
      throw new AppError('FORM_NOT_FOUND', 'Form not found', 404);
    }

    if (form.status !== 'draft') {
      throw new AppError(
        'FORM_NOT_EDITABLE',
        'Only draft forms can be published',
        400
      );
    }

    const schema = form.formSchema as NativeFormSchema;
    const validation = this.validateForPublish(schema);

    if (!validation.valid) {
      throw new AppError(
        'PUBLISH_VALIDATION_FAILED',
        'Form validation failed for publish',
        400,
        { errors: validation.errors }
      );
    }

    const now = new Date();
    const updatedSchema: NativeFormSchema = {
      ...schema,
      status: 'published',
      publishedAt: now.toISOString(),
    };

    await db.transaction(async (tx) => {
      await tx
        .update(questionnaireForms)
        .set({
          status: 'published',
          nativePublishedAt: now,
          formSchema: updatedSchema,
          updatedAt: now,
        })
        .where(eq(questionnaireForms.id, formId));

      await AuditService.logActionTx(tx, {
        actorId: userId,
        action: 'native_form.published',
        targetResource: 'questionnaire_forms',
        targetId: formId,
        details: { version: schema.version },
      });
    });

    logger.info({ event: 'native_form.published', formId, userId });

    return { success: true, publishedAt: now.toISOString() };
  }

  /**
   * Retrieve the form schema JSONB for a form (any status — used by builder/admin).
   */
  static async getFormSchema(formId: string): Promise<NativeFormSchema> {
    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, formId),
    });

    if (!form) {
      throw new AppError('FORM_NOT_FOUND', 'Form not found', 404);
    }

    return form.formSchema as NativeFormSchema;
  }

  /**
   * Retrieve a PUBLISHED form schema for rendering. Rejects draft/archived forms.
   */
  static async getPublishedFormSchema(formId: string): Promise<NativeFormSchema> {
    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, formId),
    });

    if (!form) {
      throw new AppError('FORM_NOT_FOUND', 'Form not found', 404);
    }

    if (form.status !== 'published') {
      throw new AppError('FORM_NOT_PUBLISHED', 'Form is not available for data collection', 403);
    }

    return form.formSchema as NativeFormSchema;
  }

  /**
   * List published forms with fields needed by the form renderer.
   */
  static async listPublished() {
    const forms = await db.query.questionnaireForms.findMany({
      where: eq(questionnaireForms.status, 'published'),
      columns: {
        id: true,
        formId: true,
        title: true,
        description: true,
        version: true,
        status: true,
        nativePublishedAt: true,
      },
      orderBy: [desc(questionnaireForms.createdAt)],
    });

    return forms.map((f) => ({
      id: f.id,
      formId: f.formId,
      title: f.title,
      description: f.description ?? null,
      version: f.version,
      status: f.status,
      publishedAt: f.nativePublishedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Flatten the nested form schema into an ordered array of questions with section metadata.
   * Resolves choice list keys to actual Choice arrays.
   */
  static flattenForRender(schema: NativeFormSchema): FlattenedForm {
    const questions: FlattenedQuestion[] = [];
    const sectionShowWhen: Record<string, Question['showWhen']> = {};

    for (const section of schema.sections) {
      if (section.showWhen) {
        sectionShowWhen[section.id] = section.showWhen;
      }

      for (const question of section.questions) {
        const flattened: FlattenedQuestion = {
          id: question.id,
          type: question.type,
          name: question.name,
          label: question.label,
          labelYoruba: question.labelYoruba,
          required: question.required,
          sectionId: section.id,
          sectionTitle: section.title,
          showWhen: question.showWhen,
          validation: question.validation,
        };

        if (question.choices && schema.choiceLists[question.choices]) {
          flattened.choices = schema.choiceLists[question.choices];
        }

        questions.push(flattened);
      }
    }

    return {
      formId: schema.id,
      title: schema.title,
      version: schema.version,
      questions,
      choiceLists: schema.choiceLists,
      sectionShowWhen,
    };
  }
}
