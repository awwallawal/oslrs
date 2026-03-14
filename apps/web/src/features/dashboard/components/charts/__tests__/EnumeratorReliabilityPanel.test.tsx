// @vitest-environment jsdom
/**
 * EnumeratorReliabilityPanel Tests
 * Story 8.8 AC#5: Distribution charts, flagging, threshold guard, flagsOnly mode.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EnumeratorReliabilityData } from '@oslsr/types';

expect.extend(matchers);

// Mock ThresholdGuard
vi.mock('../../ThresholdGuard', () => ({
  ThresholdGuard: ({ threshold, label, children }: { threshold: { met: boolean; currentN: number; requiredN: number }; label: string; children: React.ReactNode }) => {
    if (!threshold.met) {
      return <div data-testid="threshold-guard">{label} requires at least {threshold.requiredN} (currently {threshold.currentN})</div>;
    }
    return <>{children}</>;
  },
}));

import { EnumeratorReliabilityPanel } from '../EnumeratorReliabilityPanel';

const mockDataAboveThreshold: EnumeratorReliabilityData = {
  threshold: { met: true, currentN: 3, requiredN: 2 },
  enumerators: [
    {
      enumeratorId: 'e1',
      enumeratorName: 'Alice',
      submissionCount: 30,
      distributions: [
        { question: 'gender', answers: [{ label: 'female', count: 15, proportion: 0.5 }, { label: 'male', count: 15, proportion: 0.5 }] },
        { question: 'employment_type', answers: [{ label: 'formal', count: 20, proportion: 0.67 }, { label: 'informal', count: 10, proportion: 0.33 }] },
        { question: 'education_level', answers: [{ label: 'secondary', count: 20, proportion: 0.67 }, { label: 'tertiary', count: 10, proportion: 0.33 }] },
      ],
    },
    {
      enumeratorId: 'e2',
      enumeratorName: 'Bob',
      submissionCount: 25,
      distributions: [
        { question: 'gender', answers: [{ label: 'female', count: 5, proportion: 0.2 }, { label: 'male', count: 20, proportion: 0.8 }] },
        { question: 'employment_type', answers: [{ label: 'formal', count: 10, proportion: 0.4 }, { label: 'informal', count: 15, proportion: 0.6 }] },
        { question: 'education_level', answers: [{ label: 'secondary', count: 10, proportion: 0.4 }, { label: 'tertiary', count: 15, proportion: 0.6 }] },
      ],
    },
  ],
  pairs: [
    {
      enumeratorA: 'Alice',
      enumeratorB: 'Bob',
      divergenceScores: [
        { question: 'gender', jsDivergence: 0.55 },
        { question: 'employment_type', jsDivergence: 0.45 },
        { question: 'education_level', jsDivergence: 0.35 },
      ],
      avgDivergence: 0.55,
      flag: 'amber',
      interpretation: 'Alice and Bob report significantly different distributions in the same area — may warrant investigation',
    },
  ],
};

const mockDataBelowThreshold: EnumeratorReliabilityData = {
  threshold: { met: false, currentN: 1, requiredN: 2 },
  enumerators: [],
  pairs: [],
};

describe('EnumeratorReliabilityPanel', () => {
  it('renders distribution comparison charts when threshold met', () => {
    render(<EnumeratorReliabilityPanel data={mockDataAboveThreshold} isLoading={false} error={null} />);
    expect(screen.getByTestId('reliability-panel')).toBeInTheDocument();
    expect(screen.getByTestId('reliability-distributions')).toBeInTheDocument();
    // Alice and Bob appear in each question's table (3 tables)
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bob').length).toBeGreaterThanOrEqual(1);
  });

  it('shows amber/red badges for flagged pairs', () => {
    render(<EnumeratorReliabilityPanel data={mockDataAboveThreshold} isLoading={false} error={null} />);
    // Badge appears in both heatmap and flagged pairs section
    const badges = screen.getAllByText('Moderate Divergence');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('reliability-flags')).toBeInTheDocument();
    expect(screen.getByText(/significantly different/)).toBeInTheDocument();
  });

  it('shows ThresholdGuard when below threshold', () => {
    render(<EnumeratorReliabilityPanel data={mockDataBelowThreshold} isLoading={false} error={null} />);
    expect(screen.getByTestId('reliability-threshold')).toBeInTheDocument();
    expect(screen.getByTestId('threshold-guard')).toBeInTheDocument();
  });

  it('flagsOnly mode renders flagged pairs only (no heatmap/distributions)', () => {
    render(<EnumeratorReliabilityPanel data={mockDataAboveThreshold} isLoading={false} error={null} flagsOnly />);
    expect(screen.getByTestId('reliability-panel')).toBeInTheDocument();
    expect(screen.getByTestId('reliability-flags')).toBeInTheDocument();
    // Should NOT render full distributions or heatmap
    expect(screen.queryByTestId('reliability-distributions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reliability-heatmap')).not.toBeInTheDocument();
  });
});
