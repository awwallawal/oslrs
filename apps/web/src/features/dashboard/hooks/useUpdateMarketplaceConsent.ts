import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMarketplaceConsent } from '../api/me.api';
import { meKeys } from './useRegistrationStatus';
import { useToast } from '../../../hooks/useToast';

/**
 * Story 9-40 (AC#4) — toggle the caller's marketplace consent and refresh the
 * registration-status read-model so the dashboard reflects the new state.
 *
 * Surfaces success/failure via toast (9-40 review M3): without an onError the
 * mutation failed SILENTLY — the spinner stopped, the label stayed, and the
 * user had no idea their opt-in/out didn't take. Mirrors the useFraudThresholds
 * toast pattern.
 */
export function useUpdateMarketplaceConsent() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: updateMarketplaceConsent,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: meKeys.registrationStatus() });
      toast.success({
        message: data.consentMarketplace
          ? 'You are now opted in to the Skills Marketplace.'
          : 'You have opted out of the Skills Marketplace.',
      });
    },
    onError: () => {
      toast.error({
        message: 'Could not update your marketplace preference. Please try again.',
      });
    },
  });
}
