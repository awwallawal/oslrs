import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../hooks/useToast';
import {
  listQuestionnaires,
  getQuestionnaire,
  getVersionHistory,
  uploadQuestionnaire,
  updateQuestionnaireStatus,
  deleteQuestionnaire,
  getNativeFormSchema,
  updateNativeFormSchema,
  publishNativeForm,
  createNativeForm,
} from '../api/questionnaire.api';
import type { QuestionnaireFormStatus, NativeFormSchema } from '@oslsr/types';

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

// ── Native Form Hooks (Story 2.10) ─────────────────────────────────────

export const nativeFormKeys = {
  all: ['native-forms'] as const,
  schemas: () => [...nativeFormKeys.all, 'schema'] as const,
  schema: (id: string) => [...nativeFormKeys.schemas(), id] as const,
};

export function useNativeFormSchema(formId: string) {
  return useQuery({
    queryKey: nativeFormKeys.schema(formId),
    queryFn: () => getNativeFormSchema(formId),
    enabled: !!formId,
  });
}

export function useUpdateNativeFormSchema() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: ({ formId, schema }: { formId: string; schema: NativeFormSchema }) =>
      updateNativeFormSchema(formId, schema),
    onSuccess: (_, { formId }) => {
      queryClient.invalidateQueries({ queryKey: nativeFormKeys.schema(formId) });
      success({ message: 'Form schema saved' });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Failed to save form schema' });
    },
  });
}

export function usePublishNativeForm() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: (formId: string) => publishNativeForm(formId),
    onSuccess: (_, formId) => {
      queryClient.invalidateQueries({ queryKey: nativeFormKeys.schema(formId) });
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
      success({ message: 'Form published successfully' });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Failed to publish form' });
    },
  });
}

export function useCreateNativeForm() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: (data: { title: string }) => createNativeForm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
      success({ message: 'New form created' });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Failed to create form' });
    },
  });
}
