import { apiClient } from '../../../lib/api-client';
import type { MarketplaceSearchParams, MarketplaceSearchResultItem, CursorPaginatedResponse } from '@oslsr/types';

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
