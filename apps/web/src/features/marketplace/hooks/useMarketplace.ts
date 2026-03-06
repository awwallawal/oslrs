import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { searchMarketplace, fetchMarketplaceProfile, revealMarketplaceContact } from '../api/marketplace.api';
import type { MarketplaceSearchParams } from '@oslsr/types';

export const marketplaceKeys = {
  all: ['marketplace'] as const,
  search: (params: MarketplaceSearchParams) => [...marketplaceKeys.all, 'search', params] as const,
  profile: (id: string) => [...marketplaceKeys.all, 'profile', id] as const,
  revealedContact: (profileId: string) => [...marketplaceKeys.all, 'revealed', profileId] as const,
};

export function useMarketplaceSearch(params: MarketplaceSearchParams) {
  return useQuery({
    queryKey: marketplaceKeys.search(params),
    queryFn: () => searchMarketplace(params),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useMarketplaceProfile(id: string) {
  return useQuery({
    queryKey: marketplaceKeys.profile(id),
    queryFn: () => fetchMarketplaceProfile(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRevealContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, captchaToken }: { profileId: string; captchaToken: string }) =>
      revealMarketplaceContact(profileId, captchaToken),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        marketplaceKeys.revealedContact(variables.profileId),
        data,
      );
    },
  });
}
