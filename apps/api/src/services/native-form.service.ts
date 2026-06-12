import { db } from '../db/index.js';
import { questionnaireForms } from '../db/schema/index.js';
import { AuditService } from './audit.service.js';
import { getSetting } from '../lib/settings.js';
import { eq, desc } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { nativeFormSchema } from '@oslsr/types';
import type { NativeFormSchema, Question, Choice, Calculation } from '@oslsr/types';
import { validateFormFidelity, type FidelityFinding } from './form-fidelity-validator.js';
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
  /**
   * Story 9-54 AC1 — non-rendering computed fields. The client evaluates these
   * (via `evaluateCalculations`) into the answer map before running skip-logic
   * so section/question `showWhen` referencing computed fields (e.g. `${age}`)
   * resolve at render time.
   */
  calculations: Calculation[];
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
    /** Story 9-54 AC3 — non-blocking fidelity warnings (acknowledge, don't block). */
    warnings?: string[];
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

    // Validate showWhen conditions reference valid field names within form.
    // Story 9-54 AC2.3 — computed (calculate) field names are valid reference
    // targets too, so a group/question gated on `${age}` is NOT a dangling ref.
    const allQuestionNames = new Set<string>();
    for (const section of schema.sections || []) {
      for (const question of section.questions || []) {
        allQuestionNames.add(question.name);
      }
    }
    for (const calc of schema.calculations || []) {
      allQuestionNames.add(calc.name);
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

    // Story 9-54 AC3 — forms-engine fidelity: calculate-token safety (blocking)
    // + wizard-dedup vocabulary mismatch (warning). Errors join the blocking set;
    // warnings are surfaced for acknowledgement.
    const fidelity = validateFormFidelity(schema);
    for (const finding of fidelity.errors) {
      errors.push(finding.message);
    }
    const warnings = fidelity.warnings.map((w: FidelityFinding) => w.message);

    return { valid: errors.length === 0, errors, warnings };
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

    if (validation.warnings && validation.warnings.length > 0) {
      logger.warn({
        event: 'forms.validate.warnings',
        formId,
        warnings: validation.warnings,
      });
    }

    logger.info({ event: 'native_form.published', formId, userId });

    return { success: true, publishedAt: now.toISOString(), warnings: validation.warnings ?? [] };
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
   * Story 9-12 Task 5.4.2 — public-wizard form discovery (Option B).
   *
   * Reads the `wizard.public_form_id` setting; if set and the referenced form
   * is published, returns its flattened render schema. If the setting is null,
   * missing, or the pinned form is no longer published, throws
   * `PUBLIC_FORM_NOT_CONFIGURED` (404) so the wizard renders an empty-state on
   * Step 4 and tracks the gap as a metric for operator follow-up.
   *
   * Called by an UNAUTHENTICATED route — the form contents themselves are
   * public-survey questions that need to render before the respondent has an
   * account.
   */
  static async getPublicActiveForm(): Promise<FlattenedForm> {
    const formId = await getSetting<string | null>('wizard.public_form_id');

    if (!formId) {
      throw new AppError(
        'PUBLIC_FORM_NOT_CONFIGURED',
        'No public-wizard form is currently configured.',
        404,
      );
    }

    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, formId),
    });

    if (!form || form.status !== 'published') {
      // Pinned form has been unpublished or deleted since it was set.
      // Treat the same as "not configured" so the wizard renders the empty
      // state; operator must re-pin a published form via the Settings UI.
      throw new AppError(
        'PUBLIC_FORM_NOT_CONFIGURED',
        'The configured public-wizard form is not currently published.',
        404,
      );
    }

    const schema = form.formSchema as NativeFormSchema;
    return this.flattenForRender(schema, form.id);
  }

  /**
   * Flatten the nested form schema into an ordered array of questions with section metadata.
   * Resolves choice list keys to actual Choice arrays.
   *
   * Story 9-33 (Bug #1): `formId` in the returned {@link FlattenedForm} is the
   * questionnaire_forms ROW PRIMARY KEY (`form.id`), NOT the JSONB-embedded
   * `schema.id`. The inner `schema.id` is a version-tracking metadata artifact
   * and does NOT match the row PK that downstream submission-ingestion lookups
   * (submission-processing.service.ts resolveFormSchema) use. Returning the
   * inner id orphaned every enumerator submission. ALWAYS pass the row PK.
   *
   * @param schema     the form's JSONB schema
   * @param formRowId  the questionnaire_forms row primary key (canonical client-facing formId)
   */
  static flattenForRender(schema: NativeFormSchema, formRowId: string): FlattenedForm {
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
      formId: formRowId,
      title: schema.title,
      version: schema.version,
      questions,
      choiceLists: schema.choiceLists,
      sectionShowWhen,
      calculations: schema.calculations ?? [],
    };
  }
}
