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

export interface EnumeratorMetric {
  id: string;
  fullName: string;
  status: string;
  lastLoginAt: string | null;
  dailyCount: number;
  weeklyCount: number;
  lastSubmittedAt: string | null;
}

export interface TeamMetrics {
  enumerators: EnumeratorMetric[];
}

export interface GpsPoint {
  enumeratorId: string;
  enumeratorName: string;
  latitude: number;
  longitude: number;
  submittedAt: string;
}

export interface TeamGps {
  points: GpsPoint[];
}

export async function fetchTeamOverview(): Promise<TeamOverview> {
  const result = await apiClient('/supervisor/team-overview');
  return result.data;
}

export async function fetchPendingAlerts(): Promise<PendingAlerts> {
  const result = await apiClient('/supervisor/pending-alerts');
  return result.data;
}

export async function fetchTeamMetrics(): Promise<TeamMetrics> {
  const result = await apiClient('/supervisor/team-metrics');
  return result.data;
}

export async function fetchTeamGps(): Promise<TeamGps> {
  const result = await apiClient('/supervisor/team-gps');
  return result.data;
}
