// @vitest-environment jsdom
/**
 * EnumeratorDraftsPage Tests
 *
 * Story 2.5-5 AC4: Drafts placeholder page
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

import EnumeratorDraftsPage from '../EnumeratorDraftsPage';

afterEach(() => {
  cleanup();
});

function renderComponent() {
  return render(<EnumeratorDraftsPage />);
}

describe('EnumeratorDraftsPage', () => {
  it('renders page heading', () => {
    renderComponent();
    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getByText('Saved survey drafts for offline completion')).toBeInTheDocument();
  });

  it('renders empty state message', () => {
    renderComponent();
    expect(screen.getByText('No drafts saved')).toBeInTheDocument();
    expect(screen.getByText('Start a survey to save drafts for later.')).toBeInTheDocument();
  });

  it('keeps the empty state guidance visible', () => {
    renderComponent();
    expect(screen.getByText('No drafts saved')).toBeInTheDocument();
  });
});
