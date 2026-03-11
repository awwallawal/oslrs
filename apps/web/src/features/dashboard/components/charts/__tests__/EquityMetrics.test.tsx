// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { EquityData } from '@oslsr/types';

expect.extend(matchers);
afterEach(() => cleanup());

vi.mock('../../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

import { EquityMetrics } from '../EquityMetrics';

const mockEquityData: EquityData = {
  gpiRatio: 0.95,
  employmentRatePct: 60,
  informalSectorPct: 45.3,
};

describe('EquityMetrics', () => {
  it('renders metrics with data', () => {
    render(
      <EquityMetrics
        data={mockEquityData}
        isLoading={false}
        error={null}
      />
    );
    expect(screen.getByTestId('equity-metrics')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(
      <EquityMetrics isLoading={true} error={null} />
    );
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('computes and displays GPI value of 0.95', () => {
    render(
      <EquityMetrics
        data={mockEquityData}
        isLoading={false}
        error={null}
      />
    );
    expect(screen.getByText('0.95')).toBeInTheDocument();
  });

  it('displays employment rate proxy from data.employmentRatePct', () => {
    render(
      <EquityMetrics
        data={mockEquityData}
        isLoading={false}
        error={null}
      />
    );
    // employmentRatePct is 60, displayed as "60.0%"
    expect(screen.getByText('60.0%')).toBeInTheDocument();
  });

  it('displays informal sector percentage from data', () => {
    render(
      <EquityMetrics
        data={mockEquityData}
        isLoading={false}
        error={null}
      />
    );
    expect(screen.getByText('Informal Sector')).toBeInTheDocument();
    // informalSectorPct is 45.3, displayed as "45.3%"
    expect(screen.getByText('45.3%')).toBeInTheDocument();
  });

  it('renders em-dash when data fields are null', () => {
    const nullData: EquityData = {
      gpiRatio: null,
      employmentRatePct: null,
      informalSectorPct: null,
    };
    render(
      <EquityMetrics
        data={nullData}
        isLoading={false}
        error={null}
      />
    );
    expect(screen.getByTestId('equity-metrics')).toBeInTheDocument();
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBe(3);
  });

  it('renders em-dash when data is undefined', () => {
    render(
      <EquityMetrics
        data={undefined}
        isLoading={false}
        error={null}
      />
    );
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBe(3);
  });

  it('renders error state with retry button', () => {
    const onRetry = vi.fn();
    render(
      <EquityMetrics
        isLoading={false}
        error={new Error('fail')}
        onRetry={onRetry}
      />
    );
    expect(screen.getByText('Unable to load data')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });
});
