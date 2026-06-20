import { apiClient } from '../../../lib/api-client';

/**
 * Story 9-40 — frontend client for the authenticated registration-status
 * read-model (`GET /api/v1/me/registration-status`, Story 9-38 / me.service.ts).
 *
 * Authenticated: the backend resolves the caller from the JWT and returns THEIR
 * OWN state only. Mirrors the server `RegistrationStatusReadModel` shape.
 */

export type RegistrationState = 'none' | 'draft' | 'pending_nin' | 'complete';

export type NinStatus = 'provided' | 'pending' | 'none';

export interface RegistrationStatusRespondentSummary {
  id: string;
  status: string;
  lgaId: string | null;
  /** Human LGA name resolved server-side from `lgas.code` (Story 9-61). */
  lgaName: string | null;
  ninStatus: NinStatus;
  consentMarketplace: boolean;
  referenceCode: string | null;
}

export interface RegistrationStatusReadModel {
  state: RegistrationState;
  /** Last visited wizard step (present only for `state === 'draft'`). */
  draftStep?: number;
  /** Present for `pending_nin` + `complete` (a linked respondent exists). */
  respondent?: RegistrationStatusRespondentSummary;
}

export async function fetchRegistrationStatus(): Promise<RegistrationStatusReadModel> {
  const res = await apiClient('/me/registration-status', { method: 'GET' });
  return res.data as RegistrationStatusReadModel;
}

/**
 * Story 9-40 (AC#4) — self-service edit of the caller's registration. Currently
 * the marketplace-consent flag. Returns the refreshed respondent summary.
 */
export async function updateMarketplaceConsent(args: {
  consentMarketplace: boolean;
}): Promise<RegistrationStatusRespondentSummary> {
  const res = await apiClient('/me/registration', {
    method: 'PUT',
    body: JSON.stringify(args),
  });
  return res.data as RegistrationStatusRespondentSummary;
}
