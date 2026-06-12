import { apiClient } from '../../../lib/api-client';
import type {
  QuestionType,
  Choice,
  Condition,
  ConditionGroup,
  ValidationRule,
  Calculation,
} from '@oslsr/types';

// ── Response types matching backend FlattenedForm/FlattenedQuestion ──

export interface FlattenedQuestion {
  id: string;
  type: QuestionType;
  name: string;
  label: string;
  labelYoruba?: string;
  required: boolean;
  sectionId: string;
  sectionTitle: string;
  choices?: Choice[];
  showWhen?: Condition | ConditionGroup;
  validation?: ValidationRule[];
}

export interface FlattenedForm {
  formId: string;
  title: string;
  version: string;
  questions: FlattenedQuestion[];
  choiceLists: Record<string, Choice[]>;
  sectionShowWhen: Record<string, Condition | ConditionGroup>;
  /**
   * Story 9-54 AC1 — non-rendering computed fields evaluated client-side into
   * the answer map before skip-logic so `showWhen` on `${age}` etc. resolves.
   * Optional-defaulted to `[]` by the renderer for pre-9-54 cached payloads.
   */
  calculations?: Calculation[];
}

export interface PublishedFormSummary {
  id: string;
  formId: string;
  title: string;
  description: string | null;
  version: string;
  status: string;
  publishedAt: string | null;
}

// ── API functions ──

export async function fetchPublishedForms(): Promise<PublishedFormSummary[]> {
  const result = await apiClient('/forms/published');
  return result.data;
}

export async function fetchFormForRender(formId: string): Promise<FlattenedForm> {
  const result = await apiClient(`/forms/${formId}/render`);
  return result.data;
}

export async function fetchFormForPreview(formId: string): Promise<FlattenedForm> {
  const result = await apiClient(`/forms/${formId}/preview`);
  return result.data;
}
