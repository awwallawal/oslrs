import { apiClient } from '../../../lib/api-client';

export interface SubmitSurveyPayload {
  submissionId: string;
  formId: string;
  formVersion: string;
  responses: Record<string, unknown>;
  gpsLatitude?: number;
  gpsLongitude?: number;
  submittedAt: string;
  completionTimeSeconds?: number;
}

export interface SubmitSurveyResponse {
  data: {
    id: string | null;
    status: 'queued' | 'duplicate';
    /**
     * Story 9-58 (AC5.2) — human-friendly reference code (`OSL-YYYY-XXXXXX`)
     * for the respondent this submission creates, so the field officer can read
     * it back. `null` on a duplicate submission (no new respondent).
     */
    referenceCode?: string | null;
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

export async function fetchMySubmissionCounts(): Promise<Record<string, number>> {
  const result = await apiClient('/forms/submissions/my-counts');
  return result.data;
}

export async function fetchTeamSubmissionCounts(): Promise<Record<string, number>> {
  const result = await apiClient('/forms/submissions/my-counts?scope=team');
  return result.data;
}

export interface DailyCount {
  date: string;
  count: number;
}

export async function fetchDailySubmissionCounts(days: number): Promise<DailyCount[]> {
  const result = await apiClient(`/forms/submissions/daily-counts?days=${days}`);
  return result.data;
}
