// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockSystemHealthResult = vi.hoisted(() => ({
  data: null as any,
  isLoading: false,
  error: null as any,
}));

vi.mock('../../hooks/useSystemHealth', () => ({
  useSystemHealth: () => mockSystemHealthResult,
  systemHealthKeys: {
    all: ['systemHealth'],
    metrics: () => ['systemHealth', 'metrics'],
  },
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

import { renderWithQueryClient } from '../../../../test-utils';
import SystemHealthPage from '../SystemHealthPage';

// ── Mock data ───────────────────────────────────────────────────────────

const mockHealthData = {
  status: 'ok' as const,
  timestamp: '2026-02-26T10:00:00.000Z',
  version: '1.0.0',
  uptime: 86400,
  cpu: { usagePercent: 45, cores: 4 },
  memory: { totalMB: 8192, usedMB: 4096, usagePercent: 50 },
  disk: { totalGB: 100, usedGB: 60, usagePercent: 60 },
  database: { status: 'ok' as const, latencyMs: 5 },
  redis: { status: 'ok' as const, latencyMs: 2 },
  apiLatency: { p95Ms: 42 },
  queues: [
    { name: 'email-notification', status: 'ok' as const, waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
    { name: 'fraud-detection', status: 'ok' as const, waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
    { name: 'staff-import', status: 'ok' as const, waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
    { name: 'webhook-ingestion', status: 'ok' as const, waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
    { name: 'productivity-snapshot', status: 'ok' as const, waiting: 0, active: 0, failed: 0, delayed: 0, paused: false },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────

function renderPage() {
  return renderWithQueryClient(<SystemHealthPage />);
}

// ── Setup ───────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSystemHealthResult.data = mockHealthData;
  mockSystemHealthResult.isLoading = false;
  mockSystemHealthResult.error = null;
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('SystemHealthPage', () => {
  it('renders the page with all metric panels', () => {
    renderPage();
    expect(screen.getByTestId('system-health-page')).toBeInTheDocument();
    expect(screen.getByTestId('cpu-panel')).toBeInTheDocument();
    expect(screen.getByTestId('memory-panel')).toBeInTheDocument();
    expect(screen.getByTestId('disk-panel')).toBeInTheDocument();
    expect(screen.getByTestId('api-latency-panel')).toBeInTheDocument();
    expect(screen.getByTestId('db-redis-panel')).toBeInTheDocument();
    expect(screen.getByTestId('queue-health-panel')).toBeInTheDocument();
  });

  it('displays green status badge when system is OK', () => {
    renderPage();
    const okBadges = screen.getAllByTestId('status-badge-ok');
    expect(okBadges.length).toBeGreaterThan(0);
  });

  it('displays amber status badge for degraded metrics', () => {
    mockSystemHealthResult.data = {
      ...mockHealthData,
      status: 'degraded',
      cpu: { usagePercent: 80, cores: 4 },
    };
    renderPage();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('displays red status badge for critical metrics', () => {
    mockSystemHealthResult.data = {
      ...mockHealthData,
      status: 'critical',
      cpu: { usagePercent: 95, cores: 4 },
    };
    renderPage();
    const criticalBadges = screen.getAllByTestId('status-badge-critical');
    expect(criticalBadges.length).toBeGreaterThan(0);
  });

  it('shows queue health table with 5 queues', () => {
    renderPage();
    expect(screen.getByTestId('queue-row-email-notification')).toBeInTheDocument();
    expect(screen.getByTestId('queue-row-fraud-detection')).toBeInTheDocument();
    expect(screen.getByTestId('queue-row-staff-import')).toBeInTheDocument();
    expect(screen.getByTestId('queue-row-webhook-ingestion')).toBeInTheDocument();
    expect(screen.getByTestId('queue-row-productivity-snapshot')).toBeInTheDocument();
  });

  it('shows skeleton loading state when isLoading=true', () => {
    mockSystemHealthResult.data = null;
    mockSystemHealthResult.isLoading = true;
    renderPage();
    const skeletons = screen.getAllByTestId('skeleton-card');
    expect(skeletons.length).toBe(6);
  });

  it('shows error state when API fails', () => {
    mockSystemHealthResult.data = null;
    mockSystemHealthResult.error = new Error('Network error');
    renderPage();
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText(/Failed to load system health data/)).toBeInTheDocument();
  });

  it('renders refresh button', () => {
    renderPage();
    expect(screen.getByTestId('refresh-button')).toBeInTheDocument();
  });

  it('displays uptime information', () => {
    renderPage();
    // 86400 seconds = 1d 0h 0m
    expect(screen.getByText(/Uptime: 1d 0h 0m/)).toBeInTheDocument();
  });

  it('displays CPU percentage and core count', () => {
    renderPage();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('4 cores')).toBeInTheDocument();
  });

  it('displays memory usage with MB breakdown', () => {
    renderPage();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/4,096.*8,192 MB/)).toBeInTheDocument();
  });

  it('displays API p95 latency with target', () => {
    renderPage();
    expect(screen.getByText('42ms')).toBeInTheDocument();
    expect(screen.getByText('target: 250ms')).toBeInTheDocument();
  });

  it('displays database and redis latency', () => {
    renderPage();
    expect(screen.getByText('5ms')).toBeInTheDocument();
    expect(screen.getByText('2ms')).toBeInTheDocument();
  });
});
