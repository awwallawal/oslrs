import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { searchMarketplace, fetchMarketplaceProfile, revealMarketplaceContact, validateEditToken, submitProfileEdit } from '../api/marketplace.api';
import type { MarketplaceSearchParams, ProfileEditPayload } from '@oslsr/types';

export const marketplaceKeys = {
  all: ['marketplace'] as const,
  search: (params: MarketplaceSearchParams) => [...marketplaceKeys.all, 'search', params] as const,
  profile: (id: string) => [...marketplaceKeys.all, 'profile', id] as const,
  revealedContact: (profileId: string) => [...marketplaceKeys.all, 'revealed', profileId] as const,
  editToken: (token: string) => [...marketplaceKeys.all, 'editToken', token] as const,
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
    mutationFn: ({ profileId, captchaToken, deviceFingerprint }: { profileId: string; captchaToken: string; deviceFingerprint?: string | null }) =>
      revealMarketplaceContact(profileId, captchaToken, deviceFingerprint),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        marketplaceKeys.revealedContact(variables.profileId),
        data,
      );
    },
  });
}

export function useValidateEditToken(token: string) {
  return useQuery({
    queryKey: marketplaceKeys.editToken(token),
    queryFn: () => validateEditToken(token),
    enabled: !!token,
    retry: false,
  });
}

export function useSubmitProfileEdit() {
  return useMutation({
    mutationFn: (payload: ProfileEditPayload) => submitProfileEdit(payload),
  });
}
