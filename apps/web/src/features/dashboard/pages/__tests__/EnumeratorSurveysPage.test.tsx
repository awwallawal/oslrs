// @vitest-environment jsdom
/**
 * EnumeratorSurveysPage Tests
 *
 * Story 2.5-5 AC2: Survey list with empty state
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);

import EnumeratorSurveysPage from '../EnumeratorSurveysPage';

function renderComponent() {
  return render(<EnumeratorSurveysPage />);
}

describe('EnumeratorSurveysPage', () => {
  it('renders page heading', () => {
    renderComponent();
    expect(screen.getByText('Surveys')).toBeInTheDocument();
    expect(screen.getByText('Available questionnaires for data collection')).toBeInTheDocument();
  });

  it('renders empty state message', () => {
    renderComponent();
    expect(screen.getByText('No surveys assigned yet')).toBeInTheDocument();
    expect(screen.getByText('Contact your supervisor.')).toBeInTheDocument();
  });

  it('renders FileText icon', () => {
    renderComponent();
    expect(document.querySelector('.lucide-file-text')).toBeInTheDocument();
  });
});
