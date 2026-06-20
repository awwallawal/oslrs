import { useQuery } from '@tanstack/react-query';
import { fetchRegistrationStatus } from '../api/me.api';

/**
 * Story 9-40 — the authenticated public user's registration-status read-model.
 * The single source of truth the dashboard (`PublicUserHome`) renders off of.
 */
export const meKeys = {
  registrationStatus: () => ['me', 'registration-status'] as const,
};

export function useRegistrationStatus() {
  return useQuery({
    queryKey: meKeys.registrationStatus(),
    queryFn: fetchRegistrationStatus,
  });
}
