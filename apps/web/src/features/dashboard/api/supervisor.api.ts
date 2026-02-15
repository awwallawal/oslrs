import { apiClient } from '../../../lib/api-client';

export interface TeamOverview {
  total: number;
  active: number;
  inactive: number;
}

export interface PendingAlerts {
  unprocessedCount: number;
  failedCount: number;
  totalAlerts: number;
}

export async function fetchTeamOverview(): Promise<TeamOverview> {
  const result = await apiClient('/supervisor/team-overview');
  return result.data;
}

export async function fetchPendingAlerts(): Promise<PendingAlerts> {
  const result = await apiClient('/supervisor/pending-alerts');
  return result.data;
}
