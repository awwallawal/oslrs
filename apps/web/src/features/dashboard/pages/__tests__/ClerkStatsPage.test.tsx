// @vitest-environment jsdom
/**
 * ClerkStatsPage Tests
 *
 * Story 2.5-6 AC7: Empty state placeholder for performance stats
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);

import ClerkStatsPage from '../ClerkStatsPage';

function renderComponent() {
  return render(<ClerkStatsPage />);
}

describe('ClerkStatsPage', () => {
  it('renders page heading', () => {
    renderComponent();
    expect(screen.getByText('My Performance Stats')).toBeInTheDocument();
    expect(screen.getByText('Track your data entry productivity')).toBeInTheDocument();
  });

  it('renders empty state message', () => {
    renderComponent();
    expect(screen.getByText('No stats available yet')).toBeInTheDocument();
    expect(screen.getByText('Stats will populate as you complete entries')).toBeInTheDocument();
  });

  it('renders BarChart icon', () => {
    renderComponent();
    expect(document.querySelector('.lucide-bar-chart')).toBeInTheDocument();
  });
});
