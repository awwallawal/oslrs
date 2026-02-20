// @vitest-environment jsdom
/**
 * FloatingActionBar Tests
 * Story 4.5 AC4.5.2: Visibility on 2+ selection, hidden on 0-1.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { FloatingActionBar } from '../FloatingActionBar';

afterEach(() => {
  cleanup();
});

describe('FloatingActionBar', () => {
  const defaultProps = {
    selectedCount: 0,
    onVerify: vi.fn(),
    onClear: vi.fn(),
  };

  it('is hidden when 0 items are selected', () => {
    render(<FloatingActionBar {...defaultProps} selectedCount={0} />);
    expect(screen.queryByTestId('floating-action-bar')).not.toBeInTheDocument();
  });

  it('is hidden when 1 item is selected', () => {
    render(<FloatingActionBar {...defaultProps} selectedCount={1} />);
    expect(screen.queryByTestId('floating-action-bar')).not.toBeInTheDocument();
  });

  it('is visible when 2 items are selected', () => {
    render(<FloatingActionBar {...defaultProps} selectedCount={2} />);
    expect(screen.getByTestId('floating-action-bar')).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('is visible when many items are selected', () => {
    render(<FloatingActionBar {...defaultProps} selectedCount={15} />);
    expect(screen.getByTestId('floating-action-bar')).toBeInTheDocument();
    expect(screen.getByText('15 selected')).toBeInTheDocument();
  });

  it('renders Verify Event button', () => {
    render(<FloatingActionBar {...defaultProps} selectedCount={5} />);
    expect(screen.getByTestId('bulk-verify-button')).toBeInTheDocument();
    expect(screen.getByText('Verify Event')).toBeInTheDocument();
  });

  it('renders Clear Selection button', () => {
    render(<FloatingActionBar {...defaultProps} selectedCount={5} />);
    expect(screen.getByTestId('clear-selection-button')).toBeInTheDocument();
    expect(screen.getByText('Clear Selection')).toBeInTheDocument();
  });

  it('calls onVerify when Verify Event is clicked', () => {
    const onVerify = vi.fn();
    render(<FloatingActionBar {...defaultProps} selectedCount={3} onVerify={onVerify} />);
    fireEvent.click(screen.getByTestId('bulk-verify-button'));
    expect(onVerify).toHaveBeenCalledOnce();
  });

  it('calls onClear when Clear Selection is clicked', () => {
    const onClear = vi.fn();
    render(<FloatingActionBar {...defaultProps} selectedCount={3} onClear={onClear} />);
    fireEvent.click(screen.getByTestId('clear-selection-button'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('has toolbar role for accessibility', () => {
    render(<FloatingActionBar {...defaultProps} selectedCount={5} />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });
});
