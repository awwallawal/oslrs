/**
 * Government Official Policy Dashboard API Client
 *
 * Story 5.1: High-Level Policy Dashboard
 * Fetch functions for all 4 report endpoints.
 */

import { apiClient } from '../../../lib/api-client';
import type { OverviewStats, SkillDistribution, LgaBreakdown, DailyTrend } from '@oslsr/types';

export type { OverviewStats, SkillDistribution, LgaBreakdown, DailyTrend };

export async function fetchOverviewStats(): Promise<OverviewStats> {
  const result = await apiClient('/reports/overview');
  return result.data;
}

export async function fetchSkillsDistribution(): Promise<SkillDistribution[]> {
  const result = await apiClient('/reports/skills-distribution');
  return result.data;
}

export async function fetchLgaBreakdown(): Promise<LgaBreakdown[]> {
  const result = await apiClient('/reports/lga-breakdown');
  return result.data;
}

export async function fetchRegistrationTrends(days: number = 7): Promise<DailyTrend[]> {
  const result = await apiClient(`/reports/registration-trends?days=${days}`);
  return result.data;
}
