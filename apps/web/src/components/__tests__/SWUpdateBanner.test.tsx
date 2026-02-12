// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

import { SWUpdateBanner } from '../SWUpdateBanner';

describe('SWUpdateBanner', () => {
  it('renders update message and refresh button', () => {
    render(<SWUpdateBanner onRefresh={vi.fn()} />);
    expect(screen.getByText('A new version is available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('calls onRefresh when refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(<SWUpdateBanner onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('hides banner when dismiss button is clicked', () => {
    render(<SWUpdateBanner onRefresh={vi.fn()} />);
    const dismiss = screen.getByRole('button', { name: 'Dismiss update notification' });
    fireEvent.click(dismiss);
    expect(screen.queryByText('A new version is available')).not.toBeInTheDocument();
  });

  it('has role="alert" and aria-live="polite" for accessibility', () => {
    render(<SWUpdateBanner onRefresh={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });
});
