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
  /**
   * Story 9-18 Part F (AC#F1): Step 1 now collects given + family name as two
   * explicit fields (Yoruba/Nigerian surname-first safe). `fullName` is RETAINED
   * here as a deprecated legacy field so (a) in-flight pre-9-18 drafts still
   * type-check on load (migrated to given/family by `useWizardDraft`) and (b)
   * the re-engagement/cohort blast scripts can still read it from old rows.
   * Step 1 no longer WRITES it.
   * @deprecated use `givenName` + `familyName`
   */
  fullName?: string;
  givenName?: string;
  familyName?: string;
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
  /**
   * Story 9-18 Part B (AC#B1/B4) — names of questionnaire questions that Step 4
   * auto-filled from wizard identity data and hid from the FormRenderer flow.
   * Persisted as a string[] (JSONB-friendly); converted to/from
   * `ReadonlySet<string>` at the React boundary. Survives refresh so the Step 4
   * "pre-filled" banner (AC#B5) can re-render.
   */
  prefilledQuestionNames?: string[];
  /** Free-form merge slot. */
  extras?: Record<string, unknown>;
}

/**
 * Story 9-18 — single source of truth for "is this a pending-NIN registration?".
 * Mirrors the backend `submitWizard` derivation (`pendingNin || !nin`). Used by
 * BOTH the Step-5 Save label/badge and `WizardPage.handleSubmit` so they can
 * never drift (AI-Review M1). A registrant with no NIN — e.g. a resumed pre-9-18
 * draft that never reached the old Step-5 NIN input — is pending even if the
 * toggle was never explicitly pressed.
 */
export function derivePendingNin(fd: Pick<WizardDraftData, 'pendingNinToggle' | 'nin'>): boolean {
  return fd.pendingNinToggle === true || !fd.nin;
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
  givenName: string;
  /** Optional — mononym registrants submit a given name only (AI-Review M3). */
  familyName?: string;
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
  /** Public-facing reference (submissions UID) shown on the success screen. */
  submissionUid: string;
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
