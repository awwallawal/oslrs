// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { SyncStatusBadge } from '../SyncStatusBadge';

afterEach(() => {
  cleanup();
});

describe('SyncStatusBadge', () => {
  it('renders "Synced" state with correct data-state', () => {
    render(<SyncStatusBadge status="synced" pendingCount={0} failedCount={0} />);

    expect(screen.getByText('Synced')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByTestId('sync-badge')).toHaveAttribute('data-state', 'synced');
  });

  it('renders "Syncing" state with correct data-state', () => {
    render(<SyncStatusBadge status="syncing" pendingCount={3} failedCount={0} />);

    expect(screen.getByText('Syncing')).toBeInTheDocument();
    expect(screen.getByTestId('sync-badge')).toHaveAttribute('data-state', 'syncing');
  });

  it('renders "Attention" state with correct data-state', () => {
    render(<SyncStatusBadge status="attention" pendingCount={0} failedCount={2} />);

    expect(screen.getByText('Attention')).toBeInTheDocument();
    expect(screen.getByTestId('sync-badge')).toHaveAttribute('data-state', 'attention');
  });

  it('renders "Offline" state with correct data-state', () => {
    render(<SyncStatusBadge status="offline" pendingCount={0} failedCount={0} />);

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByTestId('sync-badge')).toHaveAttribute('data-state', 'offline');
  });

  it('renders null for "empty" state (badge hidden)', () => {
    const { container } = render(<SyncStatusBadge status="empty" pendingCount={0} failedCount={0} />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('has role="status" and aria-live="polite" for accessibility', () => {
    render(<SyncStatusBadge status="synced" pendingCount={0} failedCount={0} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-live', 'polite');
  });

  it('shows pending count when syncing and count > 0', () => {
    render(<SyncStatusBadge status="syncing" pendingCount={5} failedCount={0} />);

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows failed count when attention and failedCount > 0', () => {
    render(<SyncStatusBadge status="attention" pendingCount={0} failedCount={3} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('does not show count badge when synced', () => {
    render(<SyncStatusBadge status="synced" pendingCount={0} failedCount={0} />);

    expect(screen.queryByTestId('pending-count')).not.toBeInTheDocument();
  });

  // ── AC 3.7.6: Rejected NIN badge ──────────────────────────────────────

  it('shows "Duplicate NIN" rejected badge when rejectedCount > 0', () => {
    render(<SyncStatusBadge status="synced" pendingCount={0} failedCount={0} rejectedCount={1} />);

    expect(screen.getByTestId('rejected-badge')).toBeInTheDocument();
    expect(screen.getByText('Duplicate NIN')).toBeInTheDocument();
  });

  it('shows rejected count when rejectedCount > 1', () => {
    render(<SyncStatusBadge status="synced" pendingCount={0} failedCount={0} rejectedCount={3} />);

    expect(screen.getByTestId('rejected-badge')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides rejected badge when rejectedCount is 0', () => {
    render(<SyncStatusBadge status="synced" pendingCount={0} failedCount={0} rejectedCount={0} />);

    expect(screen.queryByTestId('rejected-badge')).not.toBeInTheDocument();
  });

  it('hides rejected badge when rejectedCount is not provided', () => {
    render(<SyncStatusBadge status="synced" pendingCount={0} failedCount={0} />);

    expect(screen.queryByTestId('rejected-badge')).not.toBeInTheDocument();
  });

  it('shows both attention state and rejected badge when failedCount > 0 and rejectedCount > 0', () => {
    render(<SyncStatusBadge status="attention" pendingCount={0} failedCount={2} rejectedCount={1} />);

    expect(screen.getByText('Attention')).toBeInTheDocument();
    expect(screen.getByTestId('sync-badge')).toHaveAttribute('data-state', 'attention');
    expect(screen.getByTestId('rejected-badge')).toBeInTheDocument();
    expect(screen.getByText('Duplicate NIN')).toBeInTheDocument();
  });
});
