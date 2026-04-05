import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateProfilePayload } from '@oslsr/types';
import { useToast } from '../../../hooks/useToast';
import { useAuth } from '../../auth/context/AuthContext';
import { fetchProfile, updateProfile } from '../api/profile.api';

export const profileKeys = {
  profile: ['users', 'profile'] as const,
};

export function useProfile() {
  return useQuery({
    queryKey: profileKeys.profile,
    queryFn: fetchProfile,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: (data: UpdateProfilePayload) => updateProfile(data),
    onSuccess: () => {
      success({ message: 'Profile updated successfully' });
      queryClient.invalidateQueries({ queryKey: profileKeys.profile });
      // Re-sync AuthContext so sidebar/header name updates (AC#6)
      refreshUser();
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'DUPLICATE_PHONE') {
        showError({ message: 'Phone number already in use by another account' });
      } else {
        showError({ message: err.message || 'Failed to update profile' });
      }
    },
  });
}
