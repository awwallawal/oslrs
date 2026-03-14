import { describe, it, expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { InsightsPanel } from '../InsightsPanel';

expect.extend(matchers);
import type { InferentialInsightsData } from '@oslsr/types';

// Mock ThresholdGuard to pass through children when met
vi.mock('../../ThresholdGuard', () => ({
  ThresholdGuard: ({ threshold, children, label }: any) =>
    threshold.met ? children : <div data-testid={`threshold-guard-${label}`}>Need {threshold.requiredN} submissions</div>,
}));

const mockData: InferentialInsightsData = {
  chiSquare: [
    {
      hypothesis: 'gender and employment type',
      chiSq: 15.23,
      df: 3,
      pValue: 0.005,
      pBracket: '< 0.01',
      cramersV: 0.25,
      effectLabel: 'small',
      interpretation: 'There is a statistically significant association between gender and employment type.',
      significant: true,
    },
    {
      hypothesis: 'education level and employment type',
      chiSq: 2.1,
      df: 5,
      pValue: 0.5,
      pBracket: '>= 0.05',
      cramersV: 0.05,
      effectLabel: 'negligible',
      interpretation: 'There is no significant association.',
      significant: false,
    },
  ],
  correlations: [
    {
      hypothesis: 'education and income',
      coefficient: 0.45,
      pValue: 0.005,
      pBracket: '< 0.01',
      method: 'spearman',
      interpretation: 'Positive correlation between education and income.',
      significant: true,
    },
  ],
  groupComparisons: [
    {
      hypothesis: 'Monthly income across LGAs',
      statistic: 25.3,
      pValue: 0.005,
      pBracket: '< 0.01',
      method: 'kruskal-wallis',
      groupMedians: { ibadan_north: 50000, ogbomoso: 30000 },
      interpretation: 'Income differs significantly across LGAs.',
      significant: true,
    },
  ],
  proportionCIs: [
    {
      metric: 'Unemployment rate',
      estimate: 0.15,
      ci95Lower: 0.12,
      ci95Upper: 0.18,
      n: 500,
      interpretation: 'Unemployment rate: 15.0% (95% CI: 12.0% – 18.0%)',
    },
  ],
  forecast: {
    dailyRate: 3.5,
    currentN: 120,
    nextThresholdN: 500,
    nextThresholdLabel: 'Phase 5 Regression Models',
    projectedDate: '2026-07-01',
    interpretation: 'At ~3.5/day, Phase 5 projected around 2026-07-01.',
  },
  thresholds: {
    chiSquare: { met: true, currentN: 120, requiredN: 100 },
    correlations: { met: true, currentN: 120, requiredN: 100 },
    groupComparisons: { met: true, currentN: 120, requiredN: 50 },
    proportionCIs: { met: true, currentN: 120, requiredN: 30 },
    forecast: { met: true, currentN: 120, requiredN: 10 },
  },
};

describe('InsightsPanel', () => {
  it('renders chi-square cards with significance badges', () => {
    render(<InsightsPanel data={mockData} />);
    expect(screen.getByText('gender and employment type')).toBeInTheDocument();
    // 3 cards have pBracket='< 0.01' (chi-square, correlation, group comparison)
    expect(screen.getAllByText(/Significant \(p < 0.01\)/)).toHaveLength(3);
    expect(screen.getByText('Not Significant')).toBeInTheDocument();
  });

  it('renders chi-square card with plain-English interpretation and p-bracket', () => {
    render(<InsightsPanel data={mockData} />);
    expect(screen.getByText(/statistically significant association/)).toBeInTheDocument();
    // Multiple cards show p < 0.01 (badge + stat line for chi-square, correlation, group comparison)
    expect(screen.getAllByText(/p < 0.01/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders Cramer\'s V effect label with correct color classes', () => {
    render(<InsightsPanel data={mockData} />);
    // small effect → blue classes
    const smallChip = screen.getByText(/V = 0.25/);
    expect(smallChip.className).toContain('blue');
    // negligible → grey classes
    const neglChip = screen.getByText(/V = 0.05/);
    expect(neglChip.className).toContain('gray');
  });

  it('renders correlation cards', () => {
    render(<InsightsPanel data={mockData} />);
    expect(screen.getByText('education and income')).toBeInTheDocument();
    expect(screen.getByText(/r = 0.45/)).toBeInTheDocument();
  });

  it('renders group comparison cards with group medians', () => {
    render(<InsightsPanel data={mockData} />);
    expect(screen.getByText('Monthly income across LGAs')).toBeInTheDocument();
    expect(screen.getByText('50,000')).toBeInTheDocument();
    expect(screen.getByText('30,000')).toBeInTheDocument();
  });

  it('renders proportion CI cards with range bar', () => {
    render(<InsightsPanel data={mockData} />);
    expect(screen.getByText('Unemployment rate')).toBeInTheDocument();
    expect(screen.getByText('15.0%')).toBeInTheDocument();
    expect(screen.getByText('12.0%')).toBeInTheDocument();
    expect(screen.getByText('18.0%')).toBeInTheDocument();
  });

  it('renders enrollment forecast card with projected date', () => {
    render(<InsightsPanel data={mockData} />);
    expect(screen.getByText('Enrollment Velocity Forecast')).toBeInTheDocument();
    expect(screen.getByText('~3.5/day')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01')).toBeInTheDocument();
  });

  it('shows threshold guards for below-threshold sections', () => {
    const belowThresholdData: InferentialInsightsData = {
      ...mockData,
      chiSquare: [],
      thresholds: {
        ...mockData.thresholds,
        chiSquare: { met: false, currentN: 40, requiredN: 100 },
      },
    };
    render(<InsightsPanel data={belowThresholdData} />);
    expect(screen.getByTestId('threshold-guard-Association Tests')).toBeInTheDocument();
  });

  it('renders enrollment forecast with flat rate fallback', () => {
    const flatData: InferentialInsightsData = {
      ...mockData,
      forecast: {
        dailyRate: 0,
        currentN: 50,
        nextThresholdN: 500,
        nextThresholdLabel: 'Phase 5',
        projectedDate: null,
        interpretation: 'Registration rate is flat or declining — no projection available.',
      },
    };
    render(<InsightsPanel data={flatData} />);
    expect(screen.getByText('Flat')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/flat or declining/)).toBeInTheDocument();
  });
});
