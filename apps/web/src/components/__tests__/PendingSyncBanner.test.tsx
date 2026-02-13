// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

import { PendingSyncBanner } from '../PendingSyncBanner';

const defaultProps = {
  pendingCount: 0,
  failedCount: 0,
  onSyncNow: vi.fn(),
  onRetryFailed: vi.fn(),
  isSyncing: false,
};

describe('PendingSyncBanner', () => {
  it('renders pending variant with correct text', () => {
    render(<PendingSyncBanner {...defaultProps} pendingCount={3} />);

    expect(
      screen.getByText(/you have 3 pending survey\(s\) waiting to sync/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sync-banner')).toHaveAttribute('data-variant', 'pending');
  });

  it('renders failed variant with correct text when failedCount > 0', () => {
    render(<PendingSyncBanner {...defaultProps} failedCount={2} />);

    expect(
      screen.getByText(/2 survey\(s\) failed to sync/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sync-banner')).toHaveAttribute('data-variant', 'failed');
  });

  it('does not render when both pendingCount and failedCount are 0', () => {
    const { container } = render(
      <PendingSyncBanner {...defaultProps} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('has role="alert" for screen readers', () => {
    render(<PendingSyncBanner {...defaultProps} pendingCount={2} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('calls onSyncNow when "Upload Now" button is clicked (pending variant)', () => {
    const onSyncNow = vi.fn();
    render(<PendingSyncBanner {...defaultProps} pendingCount={2} onSyncNow={onSyncNow} />);

    fireEvent.click(screen.getByRole('button', { name: /upload now/i }));
    expect(onSyncNow).toHaveBeenCalledTimes(1);
  });

  it('calls onRetryFailed when "Retry" button is clicked (failed variant)', () => {
    const onRetryFailed = vi.fn();
    render(<PendingSyncBanner {...defaultProps} failedCount={1} onRetryFailed={onRetryFailed} />);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetryFailed).toHaveBeenCalledTimes(1);
  });

  it('disables "Upload Now" button while syncing', () => {
    render(<PendingSyncBanner {...defaultProps} pendingCount={2} isSyncing={true} />);

    expect(screen.getByRole('button', { name: /upload now/i })).toBeDisabled();
  });

  it('disables "Retry" button while syncing', () => {
    render(<PendingSyncBanner {...defaultProps} failedCount={1} isSyncing={true} />);

    expect(screen.getByRole('button', { name: /retry/i })).toBeDisabled();
  });

  it('shows failed variant (priority) when both pending and failed exist', () => {
    render(<PendingSyncBanner {...defaultProps} pendingCount={3} failedCount={2} />);

    expect(screen.getByText(/2 survey\(s\) failed to sync/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
