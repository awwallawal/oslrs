import { apiClient } from '../../../lib/api-client';

/**
 * Story 9-28 Path B — Cohort A supplemental-survey client.
 *
 * The flow:
 *   1. User clicks email magic-link → MagicLinkLandingPage peeks token (purpose=supplemental_survey).
 *   2. User clicks "Complete my skills profile" → router lands on /register/supplemental?token=...
 *   3. SupplementalSurveyPage fetches canonical questionnaire (reusing /forms/public-active).
 *   4. User answers + submits → POST /api/v1/registration/supplemental {token, questionnaireResponses}.
 *   5. Backend atomically consumes the token + writes the submissions row tied to the respondent.
 *
 * Token consume is server-side single-use (Drizzle UPDATE ... WHERE used_at IS NULL); the
 * page does NOT pre-consume — submit owns the consume to keep the retry path harmless.
 */

export interface SubmitSupplementalSurveyResult {
  submissionUid: string;
  respondentId: string;
}

export async function submitSupplementalSurvey(args: {
  token: string;
  questionnaireResponses: Record<string, unknown>;
}): Promise<SubmitSupplementalSurveyResult> {
  const res = await apiClient('/registration/supplemental', {
    method: 'POST',
    body: JSON.stringify(args),
  });
  return res.data as SubmitSupplementalSurveyResult;
}
