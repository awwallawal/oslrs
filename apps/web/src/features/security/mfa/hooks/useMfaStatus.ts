import { useQuery } from '@tanstack/react-query';
import { getCurrentUser } from '../../../auth/api/auth.api';
import { useAuth } from '../../../auth/context/AuthContext';

/**
 * Story 9-13 AC#5c — fetch the user's MFA enrollment + grace state.
 *
 * Lightweight wrapper over `getCurrentUser`. Rendered components (e.g.
 * `MfaGraceBanner` in `DashboardLayout`) gate their visibility on
 * `mfaEnabled === false && mfaGraceUntil`. Super-admin only — the banner
 * doesn't show for other roles.
 */
export function useMfaStatus() {
  const { accessToken, user } = useAuth();
  const enabled = Boolean(accessToken) && user?.role === 'super_admin';

  return useQuery({
    queryKey: ['auth', 'mfa-status', user?.id],
    queryFn: async () => {
      if (!accessToken) return null;
      const me = await getCurrentUser(accessToken);
      return {
        mfaEnabled: me.mfaEnabled ?? false,
        mfaGraceUntil: me.mfaGraceUntil ?? null,
      };
    },
    enabled,
    // Banner state changes rarely; once a session is enough.
    staleTime: 5 * 60 * 1000,
  });
}
