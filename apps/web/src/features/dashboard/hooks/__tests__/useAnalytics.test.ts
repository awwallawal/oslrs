// @vitest-environment jsdom
/**
 * useAnalytics Hook Tests
 *
 * Story 8.2: Verify each hook returns data, handles loading, and forwards params.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Mock all API functions
vi.mock('../../api/analytics.api', () => ({
  fetchDemographics: vi.fn(),
  fetchEmployment: vi.fn(),
  fetchHousehold: vi.fn(),
  fetchSkillsFrequency: vi.fn(),
  fetchTrends: vi.fn(),
  fetchRegistrySummary: vi.fn(),
  fetchPipelineSummary: vi.fn(),
  fetchTeamQuality: vi.fn(),
  fetchPersonalStats: vi.fn(),
}));

import {
  useDemographics,
  useEmployment,
  useHousehold,
  useSkillsFrequency,
  useTrends,
  useRegistrySummary,
  usePipelineSummary,
  useTeamQuality,
  usePersonalStats,
} from '../useAnalytics';

import {
  fetchDemographics,
  fetchEmployment,
  fetchHousehold,
  fetchSkillsFrequency,
  fetchTrends,
  fetchRegistrySummary,
  fetchPipelineSummary,
  fetchTeamQuality,
  fetchPersonalStats,
} from '../../api/analytics.api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useAnalytics hooks', () => {
  it('useDemographics returns data and forwards params', async () => {
    const mockData = { genderDistribution: [{ label: 'male', count: 50, percentage: 50 }] };
    vi.mocked(fetchDemographics).mockResolvedValue(mockData as any);

    const params = { lgaId: 'ibadan_north' };
    const { result } = renderHook(() => useDemographics(params), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetchDemographics).toHaveBeenCalledWith(params);
  });

  it('useEmployment returns data and forwards params', async () => {
    const mockData = { workStatusBreakdown: [{ label: 'employed', count: 80, percentage: 80 }] };
    vi.mocked(fetchEmployment).mockResolvedValue(mockData as any);

    const params = { dateFrom: '2026-01-01' };
    const { result } = renderHook(() => useEmployment(params), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetchEmployment).toHaveBeenCalledWith(params);
  });

  it('useHousehold returns data and forwards params', async () => {
    const mockData = { householdSizeDistribution: [], dependencyRatio: 0.45 };
    vi.mocked(fetchHousehold).mockResolvedValue(mockData as any);

    const { result } = renderHook(() => useHousehold({ source: 'enumerator' }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetchHousehold).toHaveBeenCalledWith({ source: 'enumerator' });
  });

  it('useSkillsFrequency returns data and forwards params', async () => {
    const mockData = [{ skill: 'welding', count: 30, percentage: 30 }];
    vi.mocked(fetchSkillsFrequency).mockResolvedValue(mockData);

    const { result } = renderHook(() => useSkillsFrequency(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetchSkillsFrequency).toHaveBeenCalledWith(undefined);
  });

  it('useTrends returns data and forwards params', async () => {
    const mockData = [{ date: '2026-03-01', count: 10 }];
    vi.mocked(fetchTrends).mockResolvedValue(mockData);

    const params = { dateTo: '2026-03-10' };
    const { result } = renderHook(() => useTrends(params), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetchTrends).toHaveBeenCalledWith(params);
  });

  it('useRegistrySummary returns data and forwards params', async () => {
    const mockData = { totalRespondents: 200, employedCount: 120, employedPct: 60 };
    vi.mocked(fetchRegistrySummary).mockResolvedValue(mockData as any);

    const { result } = renderHook(() => useRegistrySummary(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetchRegistrySummary).toHaveBeenCalledWith(undefined);
  });

  it('usePipelineSummary returns data and forwards params', async () => {
    const mockData = { totalSubmissions: 500, completionRate: 85, avgCompletionTimeSecs: 1200, activeEnumerators: 12 };
    vi.mocked(fetchPipelineSummary).mockResolvedValue(mockData);

    const params = { lgaId: 'oyo_west' };
    const { result } = renderHook(() => usePipelineSummary(params), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetchPipelineSummary).toHaveBeenCalledWith(params);
  });

  it('useDemographics returns error state when API fails', async () => {
    vi.mocked(fetchDemographics).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDemographics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Network error');
    expect(result.current.data).toBeUndefined();
  });

  it('useEmployment returns error state when API fails', async () => {
    vi.mocked(fetchEmployment).mockRejectedValue(new Error('Server unavailable'));

    const { result } = renderHook(() => useEmployment(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Server unavailable');
    expect(result.current.data).toBeUndefined();
  });

  it('useRegistrySummary returns error state when API fails', async () => {
    vi.mocked(fetchRegistrySummary).mockRejectedValue(new Error('403 Forbidden'));

    const { result } = renderHook(() => useRegistrySummary(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('403 Forbidden');
    expect(result.current.data).toBeUndefined();
  });
});

describe('useAnalytics hooks — Story 8.3', () => {
  it('useTeamQuality returns data and forwards params', async () => {
    const mockData = {
      enumerators: [],
      teamAverages: { avgCompletionTime: 600, gpsRate: 0.85, ninRate: 0.7, skipRate: 0.1, fraudRate: 0.02 },
      submissionsByDay: [],
      dayOfWeekPattern: [],
      hourOfDayPattern: [],
    };
    vi.mocked(fetchTeamQuality).mockResolvedValue(mockData as any);

    const params = { dateFrom: '2026-01-01', supervisorId: 'sup-1' };
    const { result } = renderHook(() => useTeamQuality(params), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetchTeamQuality).toHaveBeenCalledWith(params);
  });

  it('useTeamQuality returns error state when API fails', async () => {
    vi.mocked(fetchTeamQuality).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTeamQuality(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Network error');
    expect(result.current.data).toBeUndefined();
  });

  it('usePersonalStats returns data and forwards params', async () => {
    const mockData = {
      dailyTrend: [],
      cumulativeCount: 42,
      avgCompletionTimeSec: 300,
      teamAvgCompletionTimeSec: 350,
      gpsRate: 0.9,
      ninRate: 0.8,
      skipRate: 0.05,
      fraudFlagRate: 0.01,
      teamAvgFraudRate: 0.03,
      respondentDiversity: { genderSplit: [], ageSpread: [] },
      topSkillsCollected: [],
      compositeQualityScore: 78,
    };
    vi.mocked(fetchPersonalStats).mockResolvedValue(mockData as any);

    const params = { dateFrom: '2026-02-01', dateTo: '2026-03-01' };
    const { result } = renderHook(() => usePersonalStats(params), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetchPersonalStats).toHaveBeenCalledWith(params);
  });

  it('usePersonalStats returns error state when API fails', async () => {
    vi.mocked(fetchPersonalStats).mockRejectedValue(new Error('Server unavailable'));

    const { result } = renderHook(() => usePersonalStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Server unavailable');
    expect(result.current.data).toBeUndefined();
  });
});
