// @vitest-environment jsdom
/**
 * Public User Sub-Pages Tests
 *
 * Story 2.5-8 AC3: Navigation shows Marketplace, Support sub-pages.
 * PublicSurveysPage has its own dedicated test file: PublicSurveysPage.test.tsx.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import PublicMarketplacePage from '../PublicMarketplacePage';
import PublicSupportPage from '../PublicSupportPage';

afterEach(() => {
  cleanup();
});

describe('PublicMarketplacePage', () => {
  it('renders page title', () => {
    render(
      <MemoryRouter>
        <PublicMarketplacePage />
      </MemoryRouter>
    );
    expect(screen.getByText('Marketplace')).toBeInTheDocument();
  });

  it('renders empty state heading', () => {
    render(
      <MemoryRouter>
        <PublicMarketplacePage />
      </MemoryRouter>
    );
    expect(screen.getByText('Not yet available')).toBeInTheDocument();
  });

  it('renders empty state description with Epic 7 reference', () => {
    render(
      <MemoryRouter>
        <PublicMarketplacePage />
      </MemoryRouter>
    );
    expect(screen.getByText(/coming in Epic 7/i)).toBeInTheDocument();
  });

  it('renders a decorative icon', () => {
    render(
      <MemoryRouter>
        <PublicMarketplacePage />
      </MemoryRouter>
    );
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
});

describe('PublicSupportPage', () => {
  it('renders page title', () => {
    render(
      <MemoryRouter>
        <PublicSupportPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('renders empty state heading', () => {
    render(
      <MemoryRouter>
        <PublicSupportPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Support resources')).toBeInTheDocument();
  });

  it('renders empty state description', () => {
    render(
      <MemoryRouter>
        <PublicSupportPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/FAQs will be available/i)).toBeInTheDocument();
  });

  it('renders a decorative icon', () => {
    render(
      <MemoryRouter>
        <PublicSupportPage />
      </MemoryRouter>
    );
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
});
