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
}));

import {
  useDemographics,
  useEmployment,
  useHousehold,
  useSkillsFrequency,
  useTrends,
  useRegistrySummary,
  usePipelineSummary,
} from '../useAnalytics';

import {
  fetchDemographics,
  fetchEmployment,
  fetchHousehold,
  fetchSkillsFrequency,
  fetchTrends,
  fetchRegistrySummary,
  fetchPipelineSummary,
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
