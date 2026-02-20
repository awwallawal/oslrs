// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQueryClient } from '../../../../test-utils';
import SuperAdminFraudThresholdsPage from '../SuperAdminFraudThresholdsPage';

expect.extend(matchers);

// ── Mock hooks ─────────────────────────────────────────────────────────

const mockMutate = vi.fn();

const mockUseFraudThresholds = vi.fn(() => ({
  data: undefined as Record<string, unknown[]> | undefined,
  isLoading: false,
  error: null as Error | null,
}));

const mockUseUpdateFraudThreshold = vi.fn(() => ({
  mutate: mockMutate,
  isPending: false,
}));

vi.mock('../../hooks/useFraudThresholds', () => ({
  useFraudThresholds: () => mockUseFraudThresholds(),
  useUpdateFraudThreshold: () => mockUseUpdateFraudThreshold(),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

// ── Test Data ──────────────────────────────────────────────────────────

const mockThresholdsByCategory = {
  gps: [
    { id: '1', ruleKey: 'gps_cluster_radius_m', displayName: 'Cluster Radius', ruleCategory: 'gps', thresholdValue: 50, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
    { id: '2', ruleKey: 'gps_weight', displayName: 'GPS Weight', ruleCategory: 'gps', thresholdValue: 25, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  ],
  speed: [
    { id: '3', ruleKey: 'speed_weight', displayName: 'Speed Weight', ruleCategory: 'speed', thresholdValue: 25, weight: null, severityFloor: null, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, version: 1, createdBy: 'system', createdAt: '2026-01-01T00:00:00Z', notes: null },
  ],
};

// ── Tests ──────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

describe('SuperAdminFraudThresholdsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeletons while fetching', () => {
    mockUseFraudThresholds.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderWithQueryClient(<SuperAdminFraudThresholdsPage />);

    expect(screen.getByTestId('thresholds-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(3);
  });

  it('shows error state on fetch failure', () => {
    mockUseFraudThresholds.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    });

    renderWithQueryClient(<SuperAdminFraudThresholdsPage />);

    expect(screen.getByTestId('thresholds-error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load fraud thresholds')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows empty state when no thresholds', () => {
    mockUseFraudThresholds.mockReturnValue({
      data: {},
      isLoading: false,
      error: null,
    });

    renderWithQueryClient(<SuperAdminFraudThresholdsPage />);

    expect(screen.getByTestId('thresholds-empty')).toBeInTheDocument();
    expect(screen.getByText('No fraud thresholds configured')).toBeInTheDocument();
  });

  it('renders category cards with thresholds', () => {
    mockUseFraudThresholds.mockReturnValue({
      data: mockThresholdsByCategory,
      isLoading: false,
      error: null,
    });

    renderWithQueryClient(<SuperAdminFraudThresholdsPage />);

    expect(screen.getByTestId('fraud-thresholds-page')).toBeInTheDocument();
    expect(screen.getByText('Fraud Detection Thresholds')).toBeInTheDocument();

    // Category cards
    expect(screen.getByTestId('category-card-gps')).toBeInTheDocument();
    expect(screen.getByTestId('category-card-speed')).toBeInTheDocument();

    // Category labels
    expect(screen.getByText('GPS Clustering')).toBeInTheDocument();
    expect(screen.getByText('Speed Run')).toBeInTheDocument();
  });

  it('renders threshold rows with display name and value', () => {
    mockUseFraudThresholds.mockReturnValue({
      data: mockThresholdsByCategory,
      isLoading: false,
      error: null,
    });

    renderWithQueryClient(<SuperAdminFraudThresholdsPage />);

    expect(screen.getByText('Cluster Radius')).toBeInTheDocument();
    expect(screen.getByTestId('threshold-value-gps_cluster_radius_m')).toHaveTextContent('50');
    expect(screen.getByTestId('threshold-value-gps_weight')).toHaveTextContent('25');
  });

  it('enters edit mode and saves a threshold', () => {
    mockUseFraudThresholds.mockReturnValue({
      data: mockThresholdsByCategory,
      isLoading: false,
      error: null,
    });

    renderWithQueryClient(<SuperAdminFraudThresholdsPage />);

    // Click edit button
    fireEvent.click(screen.getByTestId('threshold-edit-gps_cluster_radius_m'));

    // Input should appear
    const input = screen.getByTestId('threshold-input-gps_cluster_radius_m');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(50);

    // Change value and save
    fireEvent.change(input, { target: { value: '75' } });
    fireEvent.click(screen.getByTestId('threshold-save-gps_cluster_radius_m'));

    expect(mockMutate).toHaveBeenCalledWith({
      ruleKey: 'gps_cluster_radius_m',
      data: { thresholdValue: 75 },
    });
  });

  it('cancels edit and reverts value', () => {
    mockUseFraudThresholds.mockReturnValue({
      data: mockThresholdsByCategory,
      isLoading: false,
      error: null,
    });

    renderWithQueryClient(<SuperAdminFraudThresholdsPage />);

    // Click edit
    fireEvent.click(screen.getByTestId('threshold-edit-gps_cluster_radius_m'));

    // Change value
    const input = screen.getByTestId('threshold-input-gps_cluster_radius_m');
    fireEvent.change(input, { target: { value: '999' } });

    // Click cancel
    fireEvent.click(screen.getByTestId('threshold-cancel-gps_cluster_radius_m'));

    // Should revert to display mode with original value
    expect(screen.getByTestId('threshold-value-gps_cluster_radius_m')).toHaveTextContent('50');
    expect(screen.queryByTestId('threshold-input-gps_cluster_radius_m')).not.toBeInTheDocument();
  });
});
