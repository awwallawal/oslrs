import { apiClient } from '../../../lib/api-client';
import type { FlattenedForm } from '../../forms/api/form.api';

/**
 * Story 9-12 Task 4.4 / Task 5 — wizard API surface.
 *
 * All endpoints are unauthenticated; identity is established at the wizard
 * submit (`POST /registration/wizard`). Drafts are keyed by email; hydration
 * on a fresh device uses a magic-link `wizard_resume` token.
 */

export type { FlattenedForm };

/** Shape mirrors `WizardDraftData` in `apps/api/src/db/schema/wizard-drafts.ts`. */
export interface WizardDraftData {
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  email?: string;
  lgaId?: string;
  consentMarketplace?: boolean;
  consentEnriched?: boolean;
  questionnaireResponses?: Record<string, unknown>;
  nin?: string;
  pendingNinToggle?: boolean;
  authChoice?: 'magic-link' | 'password' | 'skip';
  /** Step-4 schema introspection result (Story 9-12 Dev Notes — state-aware dispatcher). */
  formHasNinQuestion?: boolean;
  /** Version-locking (Step 4 Task 5.4.5). */
  questionnaireFormId?: string;
  questionnaireFormVersionId?: string;
  /** Free-form merge slot. */
  extras?: Record<string, unknown>;
}

export interface SaveDraftRequest {
  email: string;
  currentStep?: number;
  formData?: WizardDraftData;
}

export interface SaveDraftResponse {
  id: string;
  currentStep: number;
  lastUpdatedAt: string;
  expiresAt: string;
}

export async function saveWizardDraft(
  payload: SaveDraftRequest,
): Promise<SaveDraftResponse> {
  const res = await apiClient('/registration/draft', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return res.data as SaveDraftResponse;
}

export interface FetchedDraft {
  email: string;
  currentStep: number;
  formData: WizardDraftData;
  lastUpdatedAt: string;
  expiresAt: string;
}

export async function fetchWizardDraft(args: {
  email?: string;
  token?: string;
}): Promise<FetchedDraft | null> {
  const params = new URLSearchParams();
  if (args.email) params.set('email', args.email);
  if (args.token) params.set('token', args.token);
  const res = await apiClient(`/registration/draft?${params.toString()}`, {
    method: 'GET',
  });
  return res?.data?.draft ?? null;
}

// ─── Form discovery ─────────────────────────────────────────────────────────

/**
 * Wizard reuses `FlattenedForm` from the existing forms feature so
 * `<FormRenderer>` (which already typed against it) accepts the wizard's
 * fetched schema without casting. See re-export above.
 */

export async function fetchPublicActiveForm(): Promise<FlattenedForm | null> {
  try {
    const res = await apiClient('/forms/public-active', { method: 'GET' });
    return res.data as FlattenedForm;
  } catch (err) {
    // 404 PUBLIC_FORM_NOT_CONFIGURED → empty-state on Step 4 (no form configured).
    if (
      err &&
      typeof err === 'object' &&
      'status' in err &&
      (err as { status?: number }).status === 404
    ) {
      return null;
    }
    throw err;
  }
}

// ─── LGA list ───────────────────────────────────────────────────────────────

export interface PublicLga {
  id: string;
  name: string;
  code: string;
}

export async function fetchPublicLgas(): Promise<PublicLga[]> {
  const res = await apiClient('/lgas/public', { method: 'GET' });
  return res.data as PublicLga[];
}

// ─── Magic-link request (login / wizard_resume) ─────────────────────────────

export interface RequestMagicLinkArgs {
  email: string;
  purpose: 'login' | 'wizard_resume' | 'pending_nin_complete';
}

export async function requestMagicLink(args: RequestMagicLinkArgs): Promise<void> {
  await apiClient('/auth/public/magic-link', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

// ─── Final wizard submit ────────────────────────────────────────────────────

export interface SubmitWizardRequest {
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  phone: string;
  email: string;
  lgaId: string;
  consentMarketplace: boolean;
  consentEnriched?: boolean;
  nin?: string;
  pendingNin?: boolean;
  deferReasonNin?: string;
  questionnaireResponses?: Record<string, unknown>;
  authChoice: 'magic-link' | 'password' | 'skip';
}

export interface SubmitWizardResponse {
  respondentId: string;
  status: string;
  pendingNin: boolean;
  authChoice: 'magic-link' | 'password' | 'skip';
}

export async function submitWizard(
  payload: SubmitWizardRequest,
): Promise<SubmitWizardResponse> {
  const res = await apiClient('/registration/wizard', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data as SubmitWizardResponse;
}

// ─── Pending-NIN return-to-complete (Task 7 / AC#9) ─────────────────────────

export interface CompleteNinResponse {
  respondentId: string;
  source?: string;
  alreadyPromoted: boolean;
}

export async function completeNin(args: {
  token: string;
  nin: string;
}): Promise<CompleteNinResponse> {
  const res = await apiClient('/registration/complete-nin', {
    method: 'POST',
    body: JSON.stringify(args),
  });
  return res.data as CompleteNinResponse;
}

export interface DeferReminderResponse {
  respondentId: string;
  deferred: boolean;
  deferredAt?: string;
  reason?: string;
}

export async function deferReminder(args: {
  token: string;
}): Promise<DeferReminderResponse> {
  const res = await apiClient('/registration/defer-reminder', {
    method: 'POST',
    body: JSON.stringify(args),
  });
  return res.data as DeferReminderResponse;
}
