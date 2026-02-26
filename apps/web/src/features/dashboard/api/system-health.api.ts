/**
 * System Health API client
 * Created in Story 6-2.
 */

import { apiClient } from '../../../lib/api-client';

// Re-export shared types for local use
export type { SystemHealthResponse as SystemHealthData, QueueHealthStats as QueueStats } from '@oslsr/types';

export async function fetchSystemHealth() {
  const result = await apiClient('/system/health');
  return result.data;
}
