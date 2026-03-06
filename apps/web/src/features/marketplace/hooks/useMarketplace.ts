import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchMarketplace } from '../api/marketplace.api';
import type { MarketplaceSearchParams } from '@oslsr/types';

export const marketplaceKeys = {
  all: ['marketplace'] as const,
  search: (params: MarketplaceSearchParams) => [...marketplaceKeys.all, 'search', params] as const,
};

export function useMarketplaceSearch(params: MarketplaceSearchParams) {
  return useQuery({
    queryKey: marketplaceKeys.search(params),
    queryFn: () => searchMarketplace(params),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
