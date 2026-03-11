/**
 * Survey Analytics API Client
 *
 * Story 8.2: Super Admin & Government Official Survey Analytics Dashboard
 * Fetch functions for all 7 analytics endpoints (6 from 8-1 + pipeline-summary).
 */

import { apiClient } from '../../../lib/api-client';
import type {
  AnalyticsQueryParams,
  DemographicStats,
  EmploymentStats,
  HouseholdStats,
  SkillsFrequency,
  TrendDataPoint,
  RegistrySummary,
  PipelineSummary,
} from '@oslsr/types';

function buildQueryString(params?: AnalyticsQueryParams): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  if (params.lgaId) searchParams.set('lgaId', params.lgaId);
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) searchParams.set('dateTo', params.dateTo);
  if (params.source) searchParams.set('source', params.source);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchDemographics(params?: AnalyticsQueryParams): Promise<DemographicStats> {
  const result = await apiClient(`/analytics/demographics${buildQueryString(params)}`);
  return result.data;
}

export async function fetchEmployment(params?: AnalyticsQueryParams): Promise<EmploymentStats> {
  const result = await apiClient(`/analytics/employment${buildQueryString(params)}`);
  return result.data;
}

export async function fetchHousehold(params?: AnalyticsQueryParams): Promise<HouseholdStats> {
  const result = await apiClient(`/analytics/household${buildQueryString(params)}`);
  return result.data;
}

export async function fetchSkillsFrequency(params?: AnalyticsQueryParams): Promise<SkillsFrequency[]> {
  const result = await apiClient(`/analytics/skills${buildQueryString(params)}`);
  return result.data;
}

export async function fetchTrends(params?: AnalyticsQueryParams): Promise<TrendDataPoint[]> {
  const result = await apiClient(`/analytics/trends${buildQueryString(params)}`);
  return result.data;
}

export async function fetchRegistrySummary(params?: AnalyticsQueryParams): Promise<RegistrySummary> {
  const result = await apiClient(`/analytics/registry-summary${buildQueryString(params)}`);
  return result.data;
}

export async function fetchPipelineSummary(params?: AnalyticsQueryParams): Promise<PipelineSummary> {
  const result = await apiClient(`/analytics/pipeline-summary${buildQueryString(params)}`);
  return result.data;
}
