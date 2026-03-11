// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

expect.extend(matchers);
afterEach(() => cleanup());

const mockFetchLgas = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    { id: '1', name: 'Ibadan North', code: 'ibadan_north' },
    { id: '2', name: 'Oyo West', code: 'oyo_west' },
  ])
);
vi.mock('../../api/export.api', () => ({
  fetchLgas: mockFetchLgas,
}));

import { AnalyticsFilters } from '../AnalyticsFilters';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const LGA_MOCK_DATA = [
  { id: '1', name: 'Ibadan North', code: 'ibadan_north' },
  { id: '2', name: 'Oyo West', code: 'oyo_west' },
];

describe('AnalyticsFilters', () => {
  // Re-set mock return value before each test because mockReset: true in base config clears it
  beforeEach(() => {
    mockFetchLgas.mockResolvedValue(LGA_MOCK_DATA);
  });

  it('renders filter controls', () => {
    const onChange = vi.fn();
    render(<AnalyticsFilters value={{}} onChange={onChange} />, { wrapper });
    expect(screen.getByTestId('analytics-filters')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by LGA')).toBeInTheDocument();
    expect(screen.getByLabelText('Date from')).toBeInTheDocument();
    expect(screen.getByLabelText('Date to')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by source')).toBeInTheDocument();
  });

  it('LGA options load from API with correct names', async () => {
    const onChange = vi.fn();
    render(<AnalyticsFilters value={{}} onChange={onChange} />, { wrapper });
    // LGA dropdown should render "All LGAs" immediately
    expect(screen.getByText('All LGAs')).toBeInTheDocument();
    // After async load, specific LGA options appear
    await waitFor(() => {
      expect(screen.getByText('Ibadan North')).toBeInTheDocument();
    });
    expect(screen.getByText('Oyo West')).toBeInTheDocument();
  });

  it('calls onChange when source changes', () => {
    const onChange = vi.fn();
    render(<AnalyticsFilters value={{}} onChange={onChange} />, { wrapper });
    fireEvent.change(screen.getByLabelText('Filter by source'), { target: { value: 'enumerator' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ source: 'enumerator' }));
  });

  it('validates date inputs exist', () => {
    const onChange = vi.fn();
    render(<AnalyticsFilters value={{}} onChange={onChange} />, { wrapper });
    const dateFrom = screen.getByLabelText('Date from') as HTMLInputElement;
    const dateTo = screen.getByLabelText('Date to') as HTMLInputElement;
    expect(dateFrom.type).toBe('date');
    expect(dateTo.type).toBe('date');
  });

  describe('debounce behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not call onChange immediately on date input change', () => {
      const onChange = vi.fn();
      render(<AnalyticsFilters value={{}} onChange={onChange} />, { wrapper });

      fireEvent.change(screen.getByLabelText('Date from'), { target: { value: '2026-01-01' } });

      // onChange should NOT have been called yet (debounce pending)
      expect(onChange).not.toHaveBeenCalled();
    });

    it('calls onChange after debounce delay', async () => {
      const onChange = vi.fn();
      render(<AnalyticsFilters value={{}} onChange={onChange} />, { wrapper });

      fireEvent.change(screen.getByLabelText('Date from'), { target: { value: '2026-01-01' } });

      // Not called before 300ms
      act(() => { vi.advanceTimersByTime(200); });
      expect(onChange).not.toHaveBeenCalled();

      // Called after 300ms
      act(() => { vi.advanceTimersByTime(150); });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ dateFrom: '2026-01-01' })
      );
    });
  });
});
