import { apiClient } from '../../../lib/api-client';
import type { ContactRevealResponse, MarketplaceProfileDetail, MarketplaceSearchParams, MarketplaceSearchResultItem, CursorPaginatedResponse, ProfileEditPayload } from '@oslsr/types';

export async function searchMarketplace(
  params: MarketplaceSearchParams,
): Promise<CursorPaginatedResponse<MarketplaceSearchResultItem>> {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set('q', params.q);
  if (params.lgaId) searchParams.set('lgaId', params.lgaId);
  if (params.profession) searchParams.set('profession', params.profession);
  if (params.experienceLevel) searchParams.set('experienceLevel', params.experienceLevel);
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));

  const qs = searchParams.toString();
  return apiClient(`/marketplace/search${qs ? `?${qs}` : ''}`);
}

export async function fetchMarketplaceProfile(id: string): Promise<MarketplaceProfileDetail> {
  const response = await apiClient(`/marketplace/profiles/${id}`);
  return response.data;
}

export async function revealMarketplaceContact(
  profileId: string,
  captchaToken: string,
): Promise<ContactRevealResponse> {
  const response = await apiClient(`/marketplace/profiles/${profileId}/reveal`, {
    method: 'POST',
    body: JSON.stringify({ captchaToken }),
  });
  return response.data;
}

export async function requestEditToken(
  phoneNumber: string,
  captchaToken: string,
): Promise<{ message: string }> {
  const response = await apiClient('/marketplace/request-edit-token', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, captchaToken }),
  });
  return response.data;
}

export async function validateEditToken(
  token: string,
): Promise<{ valid: boolean; bio?: string | null; portfolioUrl?: string | null; reason?: string }> {
  const response = await apiClient(`/marketplace/edit/${token}`);
  return response.data;
}

export async function submitProfileEdit(
  payload: ProfileEditPayload,
): Promise<{ message: string }> {
  const response = await apiClient('/marketplace/edit', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response.data;
}
