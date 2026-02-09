// @vitest-environment jsdom
/**
 * ClerkQueuePage Tests
 *
 * Story 2.5-6 AC7: Empty state placeholder for entry queue
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);

import ClerkQueuePage from '../ClerkQueuePage';

function renderComponent() {
  return render(<ClerkQueuePage />);
}

describe('ClerkQueuePage', () => {
  it('renders page heading', () => {
    renderComponent();
    expect(screen.getByText('Entry Queue')).toBeInTheDocument();
    expect(screen.getByText('Forms awaiting digitization')).toBeInTheDocument();
  });

  it('renders empty state message', () => {
    renderComponent();
    expect(screen.getByText('No pending entries')).toBeInTheDocument();
    expect(screen.getByText('Forms will appear here when assigned')).toBeInTheDocument();
  });

  it('renders ListOrdered icon', () => {
    renderComponent();
    expect(document.querySelector('.lucide-list-ordered')).toBeInTheDocument();
  });
});
