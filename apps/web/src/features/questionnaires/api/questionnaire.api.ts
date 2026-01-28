import { apiClient, ApiError } from '../../../lib/api-client';
import type {
  QuestionnaireFormResponse,
  QuestionnaireFormStatus,
  XlsformValidationResult,
} from '@oslsr/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface UploadFormResult {
  status: string;
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
  status: string;
  data: QuestionnaireFormResponse[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

interface FormDetailResult {
  status: string;
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

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  return apiClient(`/questionnaires${query ? `?${query}` : ''}`, {
    headers: getAuthHeaders(),
  });
}

export async function getQuestionnaire(id: string): Promise<FormDetailResult> {
  return apiClient(`/questionnaires/${id}`, {
    headers: getAuthHeaders(),
  });
}

export async function getVersionHistory(formId: string): Promise<{ status: string; data: Array<FormDetailResult['data']> }> {
  return apiClient(`/questionnaires/form/${formId}/versions`, {
    headers: getAuthHeaders(),
  });
}

export async function updateQuestionnaireStatus(
  id: string,
  status: QuestionnaireFormStatus
): Promise<FormDetailResult> {
  return apiClient(`/questionnaires/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
}

export async function deleteQuestionnaire(id: string): Promise<void> {
  await apiClient(`/questionnaires/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
}

export function getDownloadUrl(id: string): string {
  return `${API_BASE_URL}/questionnaires/${id}/download`;
}

interface PublishResult {
  status: string;
  data: {
    id: string;
    formId: string;
    version: string;
    title: string;
    status: QuestionnaireFormStatus;
    odkXmlFormId: string;
    odkPublishedAt: string;
  };
}

/**
 * Publish a draft form to ODK Central (Story 2.2)
 */
export async function publishToOdk(id: string): Promise<PublishResult> {
  const response = await fetch(
    `${API_BASE_URL}/questionnaires/${id}/publish`,
    {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.message || 'Publish to ODK failed',
      response.status,
      data.code,
      data.details
    );
  }

  return data;
}
