/**
 * prep-settings-landing-and-feature-flags — TanStack Query hooks for the
 * super-admin settings landing page.
 *
 * Wraps the 3 endpoints at `/api/v1/admin/settings/*`:
 *   - GET  /            — list all settings
 *   - GET  /:key        — get one setting
 *   - PATCH /:key       — update one setting (audit-logged)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';

export interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
}

export interface SettingsListResponse {
  settings: SettingRow[];
}

export const SETTINGS_QUERY_KEY = ['settings'] as const;

/**
 * List all system settings (super-admin only).
 *
 * Stale-time matches the backend Redis cache TTL (60s) so the client doesn't
 * refetch faster than the cache can pick up writes from other operators.
 */
export function useSettings() {
  return useQuery<SettingsListResponse>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => apiClient('/admin/settings') as Promise<SettingsListResponse>,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Update a single setting (super-admin only). Backend audit-logs every flip.
 *
 * On success: invalidates the list query so refetched values + audit metadata
 * (`updatedBy`, `updatedAt`) reflect the change.
 */
export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      await apiClient(`/admin/settings/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: JSON.stringify({ value }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });
}
