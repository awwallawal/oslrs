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
  SkillsFrequencyResult,
  TrendDataPoint,
  RegistrySummary,
  RegistryTotals,
  DataHealthData,
  PipelineSummary,
  TeamQualityData,
  PersonalStatsData,
  VerificationPipelineData,
  VerificationPipelineQueryParams,
  CrossTabResult,
  CrossTabQuery,
  SkillsInventoryData,
  InferentialInsightsData,
  ExtendedEquityData,
  ActivationStatusData,
  EnumeratorReliabilityData,
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

export async function fetchSkillsFrequency(params?: AnalyticsQueryParams): Promise<SkillsFrequencyResult> {
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

/**
 * Story 12-4's authoritative registry aggregate — counts PEOPLE.
 *
 * ⚠️ NOT interchangeable with {@link fetchRegistrySummary}, whose
 * `totalRespondents` is the answer-bearing SUBMISSION count (the "with answers"
 * numerator). Any surface showing a registry TOTAL reads this one.
 */
export async function fetchRegistryTotals(params?: AnalyticsQueryParams): Promise<RegistryTotals> {
  const result = await apiClient(`/analytics/registry-totals${buildQueryString(params)}`);
  return result.data;
}

/** Story 12-6 — Data-Health knobs that sit outside the shared analytics filter. */
export interface DataHealthQueryParams {
  /** Which published form's schema supplies the per-field axis. Latest by default. */
  formId?: string;
  /** Page bound on the `data_lost` recovery drill. */
  limit?: number;
  offset?: number;
}

/**
 * Story 12-6 — per-field response rates + the `data_lost` recovery cohort.
 *
 * ⚠️ Does NOT return the funnel or the per-`data_status` breakdown: those come
 * from {@link fetchRegistryTotals}, and fetching them twice would put two counts
 * of one registry on one screen.
 */
export async function fetchDataHealth(
  params?: AnalyticsQueryParams,
  options?: DataHealthQueryParams,
): Promise<DataHealthData> {
  const qs = buildQueryString(params);
  const extra = new URLSearchParams();
  if (options?.formId) extra.set('formId', options.formId);
  if (options?.limit != null) extra.set('limit', String(options.limit));
  if (options?.offset != null) extra.set('offset', String(options.offset));
  const extraQs = extra.toString();
  const suffix = extraQs ? (qs ? `${qs}&${extraQs}` : `?${extraQs}`) : qs;

  const result = await apiClient(`/analytics/data-health${suffix}`);
  return result.data;
}

export async function fetchPipelineSummary(params?: AnalyticsQueryParams): Promise<PipelineSummary> {
  const result = await apiClient(`/analytics/pipeline-summary${buildQueryString(params)}`);
  return result.data;
}

// --- Story 8.3: Team Quality + Personal Stats ---

export interface TeamQualityQueryParams {
  dateFrom?: string;
  dateTo?: string;
  enumeratorId?: string;
  supervisorId?: string;
}

function buildTeamQualityQueryString(params?: TeamQualityQueryParams): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) searchParams.set('dateTo', params.dateTo);
  if (params.enumeratorId) searchParams.set('enumeratorId', params.enumeratorId);
  if (params.supervisorId) searchParams.set('supervisorId', params.supervisorId);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchTeamQuality(params?: TeamQualityQueryParams): Promise<TeamQualityData> {
  const result = await apiClient(`/analytics/team-quality${buildTeamQualityQueryString(params)}`);
  return result.data;
}

export async function fetchPersonalStats(params?: AnalyticsQueryParams): Promise<PersonalStatsData> {
  const result = await apiClient(`/analytics/my-stats${buildQueryString(params)}`);
  return result.data;
}

// --- Story 8.4: Verification Pipeline Analytics ---

function buildVerificationQueryString(params?: VerificationPipelineQueryParams): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  if (params.lgaId) searchParams.set('lgaId', params.lgaId);
  if (params.severity && params.severity.length > 0) searchParams.set('severity', params.severity.join(','));
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) searchParams.set('dateTo', params.dateTo);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchVerificationPipeline(params?: VerificationPipelineQueryParams): Promise<VerificationPipelineData> {
  const result = await apiClient(`/analytics/verification-pipeline${buildVerificationQueryString(params)}`);
  return result.data;
}

// --- Story 8.6: Cross-Tabulation & Skills Inventory ---

export async function fetchCrossTab(query: CrossTabQuery, params?: AnalyticsQueryParams): Promise<CrossTabResult> {
  const searchParams = new URLSearchParams();
  searchParams.set('rowDim', query.rowDim);
  searchParams.set('colDim', query.colDim);
  if (query.measure) searchParams.set('measure', query.measure);
  if (params?.lgaId) searchParams.set('lgaId', params.lgaId);
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo);
  if (params?.source) searchParams.set('source', params.source);
  const result = await apiClient(`/analytics/cross-tab?${searchParams.toString()}`);
  return result.data;
}

export async function fetchSkillsInventory(params?: AnalyticsQueryParams): Promise<SkillsInventoryData> {
  const result = await apiClient(`/analytics/skills-inventory${buildQueryString(params)}`);
  return result.data;
}

// --- Story 8.8: Inter-Enumerator Reliability ---

export async function fetchEnumeratorReliability(lgaId?: string): Promise<EnumeratorReliabilityData> {
  const qs = lgaId ? `?lgaId=${encodeURIComponent(lgaId)}` : '';
  const result = await apiClient(`/analytics/enumerator-reliability${qs}`);
  return result.data;
}

// --- Story 8.7: Inferential Insights, Equity, Activation, Policy Brief ---

export async function fetchInferentialInsights(params?: AnalyticsQueryParams): Promise<InferentialInsightsData> {
  const result = await apiClient(`/analytics/insights${buildQueryString(params)}`);
  return result.data;
}

export async function fetchExtendedEquity(params?: AnalyticsQueryParams): Promise<ExtendedEquityData> {
  const result = await apiClient(`/analytics/equity${buildQueryString(params)}`);
  return result.data;
}

export async function fetchActivationStatus(): Promise<ActivationStatusData> {
  const result = await apiClient('/analytics/activation-status');
  return result.data;
}

export async function fetchPolicyBriefPdf(): Promise<Blob> {
  const { API_BASE_URL, getAuthHeaders } = await import('../../../lib/api-client');
  const response = await fetch(`${API_BASE_URL}/analytics/policy-brief`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'PDF generation failed' }));
    throw new Error(body.message || 'PDF generation failed');
  }
  return response.blob();
}
