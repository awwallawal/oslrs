// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

import { StorageWarningBanner } from '../StorageWarningBanner';

describe('StorageWarningBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders warning message', () => {
    render(<StorageWarningBanner />);
    expect(
      screen.getByText(
        'Storage not secured. Avoid clearing browser data to prevent data loss.'
      )
    ).toBeInTheDocument();
  });

  it('has role="alert" for accessibility', () => {
    render(<StorageWarningBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('hides banner when dismiss button is clicked and persists to sessionStorage', () => {
    render(<StorageWarningBanner />);
    const dismiss = screen.getByRole('button', { name: 'Dismiss storage warning' });
    fireEvent.click(dismiss);
    expect(
      screen.queryByText(
        'Storage not secured. Avoid clearing browser data to prevent data loss.'
      )
    ).not.toBeInTheDocument();
    expect(sessionStorage.getItem('oslrs-storage-warning-dismissed')).toBe('1');
  });

  it('does not render if previously dismissed in session', () => {
    sessionStorage.setItem('oslrs-storage-warning-dismissed', '1');
    render(<StorageWarningBanner />);
    expect(
      screen.queryByText(
        'Storage not secured. Avoid clearing browser data to prevent data loss.'
      )
    ).not.toBeInTheDocument();
  });
});
