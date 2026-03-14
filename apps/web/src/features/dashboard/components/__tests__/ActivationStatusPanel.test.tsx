import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivationStatusPanel } from '../ActivationStatusPanel';

expect.extend(matchers);
import type { ActivationStatusData } from '@oslsr/types';

const mockData: ActivationStatusData = {
  totalSubmissions: 75,
  features: [
    { id: 'proportion_cis', label: 'Confidence Intervals', requiredN: 30, currentN: 75, met: true, phase: 4, category: 'active' },
    { id: 'group_comparisons', label: 'Group Comparisons', requiredN: 50, currentN: 75, met: true, phase: 4, category: 'active' },
    { id: 'chi_square', label: 'Association Tests (Chi-Square)', requiredN: 100, currentN: 75, met: false, phase: 4, category: 'approaching' },
    { id: 'correlations', label: 'Correlation Analysis', requiredN: 100, currentN: 75, met: false, phase: 4, category: 'approaching' },
    { id: 'regression_income', label: 'Income Predictors (OLS Regression)', requiredN: 500, currentN: 75, met: false, phase: 5, category: 'dormant' },
    { id: 'anomaly_detection', label: 'Automated Anomaly Detection', requiredN: 500, currentN: 75, met: false, phase: 5, category: 'dormant' },
  ],
};

// Mock the hook
vi.mock('../../hooks/useAnalytics', () => ({
  useActivationStatus: () => ({
    data: mockData,
    isLoading: false,
    error: null,
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  // Ensure panel starts collapsed so click-to-expand works consistently
  localStorage.setItem('analytics-activation-collapsed', 'true');
});

describe('ActivationStatusPanel', () => {
  it('groups features by status (active/approaching/dormant)', () => {
    renderWithProviders(<ActivationStatusPanel />);

    // Click to expand
    fireEvent.click(screen.getByText('Analytics Activation Status'));

    // Check groups exist
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Approaching')).toBeInTheDocument();
    expect(screen.getByText('Dormant')).toBeInTheDocument();
  });

  it('renders Phase 5 features as dormant with special label', () => {
    renderWithProviders(<ActivationStatusPanel />);
    fireEvent.click(screen.getByText('Analytics Activation Status'));

    expect(screen.getByText('Income Predictors (OLS Regression)')).toBeInTheDocument();
    expect(screen.getByText(/Requires 500\+ submissions/)).toBeInTheDocument();
  });

  it('shows progress bars with correct counts', () => {
    renderWithProviders(<ActivationStatusPanel />);
    fireEvent.click(screen.getByText('Analytics Activation Status'));

    expect(screen.getByText('75 / 30')).toBeInTheDocument(); // proportion_cis
    // chi_square + correlations both show 75 / 100
    expect(screen.getAllByText('75 / 100')).toHaveLength(2);
    // regression_income + anomaly_detection both show 75 / 500
    expect(screen.getAllByText('75 / 500')).toHaveLength(2);
  });

  it('shows summary counts in collapsed header', () => {
    renderWithProviders(<ActivationStatusPanel />);
    expect(screen.getByText(/2 active/)).toBeInTheDocument();
    expect(screen.getByText(/2 approaching/)).toBeInTheDocument();
    expect(screen.getByText(/2 dormant/)).toBeInTheDocument();
  });

  it('defaults to collapsed when no localStorage entry exists', () => {
    // beforeEach already clears localStorage; remove the key that beforeEach sets
    localStorage.removeItem('analytics-activation-collapsed');

    renderWithProviders(<ActivationStatusPanel />);

    // The toggle button should indicate collapsed (aria-expanded=false)
    const toggleBtn = screen.getByRole('button', { name: /Analytics Activation Status/i });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    // The content panel should NOT be in the document
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(document.getElementById('activation-status-content')).toBeNull();
  });
});
