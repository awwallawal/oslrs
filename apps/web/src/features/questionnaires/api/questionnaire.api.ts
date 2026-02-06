import { apiClient, ApiError, API_BASE_URL, getAuthHeaders } from '../../../lib/api-client';
import type {
  QuestionnaireFormResponse,
  QuestionnaireFormStatus,
  XlsformValidationResult,
} from '@oslsr/types';

interface UploadFormResult {
  data: {
    id: string;
    formId: string;
    version: string;
    title: string;
    status: QuestionnaireFormStatus;
  };
  validation: XlsformValidationResult;
}

interface ListFormsResult {
  data: QuestionnaireFormResponse[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

interface FormDetailResult {
  data: QuestionnaireFormResponse & {
    versions: Array<{
      id: string;
      version: string;
      changeNotes: string | null;
      createdBy: string;
      createdAt: string;
    }>;
  };
}

export async function uploadQuestionnaire(
  file: File,
  changeNotes?: string
): Promise<UploadFormResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (changeNotes) {
    formData.append('changeNotes', changeNotes);
  }

  const response = await fetch(
    `${API_BASE_URL}/questionnaires/upload`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.message || 'Upload failed',
      response.status,
      data.code,
      data.details
    );
  }

  return data;
}

export async function listQuestionnaires(params?: {
  page?: number;
  pageSize?: number;
  status?: QuestionnaireFormStatus;
}): Promise<ListFormsResult> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.status) searchParams.set('status', params.status);

  const query = searchParams.toString();
  return apiClient(`/questionnaires${query ? `?${query}` : ''}`);
}

export async function getQuestionnaire(id: string): Promise<FormDetailResult> {
  return apiClient(`/questionnaires/${id}`);
}

export async function getVersionHistory(formId: string): Promise<{ data: Array<FormDetailResult['data']> }> {
  return apiClient(`/questionnaires/form/${formId}/versions`);
}

export async function updateQuestionnaireStatus(
  id: string,
  status: QuestionnaireFormStatus
): Promise<FormDetailResult> {
  return apiClient(`/questionnaires/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteQuestionnaire(id: string): Promise<void> {
  await apiClient(`/questionnaires/${id}`, {
    method: 'DELETE',
  });
}

export function getDownloadUrl(id: string): string {
  return `${API_BASE_URL}/questionnaires/${id}/download`;
}
