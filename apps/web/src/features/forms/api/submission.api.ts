import { apiClient } from '../../../lib/api-client';

export interface SubmitSurveyPayload {
  submissionId: string;
  formId: string;
  formVersion: string;
  responses: Record<string, unknown>;
  gpsLatitude?: number;
  gpsLongitude?: number;
  submittedAt: string;
}

export interface SubmitSurveyResponse {
  data: {
    id: string | null;
    status: 'queued' | 'duplicate';
  };
}

export async function submitSurvey(
  payload: SubmitSurveyPayload,
): Promise<SubmitSurveyResponse> {
  return apiClient('/forms/submissions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface SubmissionStatus {
  processed: boolean;
  processingError: string | null;
}

export async function fetchSubmissionStatuses(
  uids: string[],
): Promise<Record<string, SubmissionStatus>> {
  const result = await apiClient(`/forms/submissions/status?uids=${uids.join(',')}`);
  return result.data;
}
