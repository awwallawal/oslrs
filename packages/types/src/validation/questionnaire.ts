import { z } from 'zod';
import { QUESTIONNAIRE_FORM_STATUSES, VALID_STATUS_TRANSITIONS } from '../questionnaire.js';
import type { QuestionnaireFormStatus } from '../questionnaire.js';

/**
 * Schema for the upload questionnaire request body (multipart form fields)
 */
export const uploadQuestionnaireSchema = z.object({
  changeNotes: z.string().max(500, 'Change notes must be 500 characters or less').optional(),
});

export type UploadQuestionnaireDto = z.infer<typeof uploadQuestionnaireSchema>;

/**
 * Schema for updating questionnaire status with transition validation
 */
export const updateStatusSchema = z.object({
  status: z.enum(QUESTIONNAIRE_FORM_STATUSES, {
    errorMap: () => ({
      message: `Invalid status. Must be one of: ${QUESTIONNAIRE_FORM_STATUSES.join(', ')}`,
    }),
  }),
});

export type UpdateStatusDto = z.infer<typeof updateStatusSchema>;

/**
 * Validate that a status transition is allowed
 */
export function isValidStatusTransition(
  currentStatus: QuestionnaireFormStatus,
  newStatus: QuestionnaireFormStatus
): boolean {
  return VALID_STATUS_TRANSITIONS[currentStatus].includes(newStatus);
}

/**
 * Schema for list questionnaires query params
 */
export const listQuestionnairesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(QUESTIONNAIRE_FORM_STATUSES).optional(),
});

export type ListQuestionnairesQuery = z.infer<typeof listQuestionnairesQuerySchema>;

/**
 * XLSForm validation result type for API error responses (AC8)
 */
export const xlsformValidationErrorSchema = z.object({
  code: z.literal('XLSFORM_VALIDATION_ERROR'),
  message: z.string(),
  details: z.object({
    errors: z.array(z.object({
      worksheet: z.enum(['survey', 'choices', 'settings']).optional(),
      row: z.number().optional(),
      column: z.string().optional(),
      message: z.string(),
      severity: z.literal('error'),
    })),
    warnings: z.array(z.object({
      worksheet: z.enum(['survey', 'choices', 'settings']).optional(),
      message: z.string(),
      severity: z.literal('warning'),
    })),
  }),
});

export type XlsformValidationErrorResponse = z.infer<typeof xlsformValidationErrorSchema>;
