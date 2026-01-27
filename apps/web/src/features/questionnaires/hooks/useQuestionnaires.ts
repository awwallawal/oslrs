import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../hooks/useToast';
import {
  listQuestionnaires,
  getQuestionnaire,
  getVersionHistory,
  uploadQuestionnaire,
  updateQuestionnaireStatus,
  deleteQuestionnaire,
} from '../api/questionnaire.api';
import type { QuestionnaireFormStatus } from '@oslsr/types';

export function useQuestionnaires(params?: {
  page?: number;
  pageSize?: number;
  status?: QuestionnaireFormStatus;
}) {
  return useQuery({
    queryKey: ['questionnaires', params],
    queryFn: () => listQuestionnaires(params),
  });
}

export function useQuestionnaire(id: string) {
  return useQuery({
    queryKey: ['questionnaires', id],
    queryFn: () => getQuestionnaire(id),
    enabled: !!id,
  });
}

export function useVersionHistory(logicalFormId: string) {
  return useQuery({
    queryKey: ['questionnaires', 'versions', logicalFormId],
    queryFn: () => getVersionHistory(logicalFormId),
    enabled: !!logicalFormId,
  });
}

export function useUploadQuestionnaire() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: ({ file, changeNotes }: { file: File; changeNotes?: string }) =>
      uploadQuestionnaire(file, changeNotes),
    onSuccess: (data) => {
      success({ message: `Form "${data.data.title}" uploaded as v${data.data.version}` });
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Upload failed' });
    },
  });
}

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuestionnaireFormStatus }) =>
      updateQuestionnaireStatus(id, status),
    onSuccess: (data) => {
      success({ message: `Status updated to ${data.data.status}` });
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Status update failed' });
    },
  });
}

export function useDeleteQuestionnaire() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteQuestionnaire(id),
    onSuccess: () => {
      success({ message: 'Draft form deleted' });
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Delete failed' });
    },
  });
}
