// @vitest-environment jsdom
/**
 * ClerkCompletedPage Tests
 *
 * Story 2.5-6 AC7: Empty state placeholder for completed entries
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

import ClerkCompletedPage from '../ClerkCompletedPage';

afterEach(() => {
  cleanup();
});

function renderComponent() {
  return render(<ClerkCompletedPage />);
}

describe('ClerkCompletedPage', () => {
  it('renders page heading', () => {
    renderComponent();
    expect(screen.getByText('Completed Entries')).toBeInTheDocument();
    expect(screen.getByText('Successfully submitted forms')).toBeInTheDocument();
  });

  it('renders empty state message', () => {
    renderComponent();
    expect(screen.getByText('No completed entries yet')).toBeInTheDocument();
    expect(screen.getByText('Submitted forms will appear here')).toBeInTheDocument();
  });

  it('keeps the empty state guidance visible', () => {
    renderComponent();
    expect(screen.getByText('No completed entries yet')).toBeInTheDocument();
  });
});
