// @vitest-environment jsdom
/**
 * EnumeratorSyncPage Tests
 *
 * Story 2.5-5 AC4: Sync Status placeholder page
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);

import EnumeratorSyncPage from '../EnumeratorSyncPage';

function renderComponent() {
  return render(<EnumeratorSyncPage />);
}

describe('EnumeratorSyncPage', () => {
  it('renders page heading', () => {
    renderComponent();
    expect(screen.getByText('Sync Status')).toBeInTheDocument();
    expect(screen.getByText('Data synchronization and upload status')).toBeInTheDocument();
  });

  it('renders sync status display', () => {
    renderComponent();
    expect(screen.getByText('All data synced')).toBeInTheDocument();
    expect(screen.getByText('Last synced: just now')).toBeInTheDocument();
  });

  it('renders CheckCircle and Clock icons', () => {
    renderComponent();
    expect(document.querySelector('.lucide-circle-check-big')).toBeInTheDocument();
    expect(document.querySelector('.lucide-clock')).toBeInTheDocument();
  });
});
