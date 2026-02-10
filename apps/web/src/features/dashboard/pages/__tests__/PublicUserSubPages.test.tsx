// @vitest-environment jsdom
/**
 * Public User Sub-Pages Tests
 *
 * Story 2.5-8 AC3: Navigation shows Survey Status, Marketplace, Support sub-pages.
 * Each sub-page renders with correct empty state pattern.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import PublicSurveysPage from '../PublicSurveysPage';
import PublicMarketplacePage from '../PublicMarketplacePage';
import PublicSupportPage from '../PublicSupportPage';

describe('PublicSurveysPage', () => {
  it('renders page title', () => {
    render(
      <MemoryRouter>
        <PublicSurveysPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Survey Status')).toBeInTheDocument();
  });

  it('renders empty state heading', () => {
    render(
      <MemoryRouter>
        <PublicSurveysPage />
      </MemoryRouter>
    );
    expect(screen.getByText('No surveys yet')).toBeInTheDocument();
  });

  it('renders empty state description with Epic 3 reference', () => {
    render(
      <MemoryRouter>
        <PublicSurveysPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Coming in Epic 3/i)).toBeInTheDocument();
  });

  it('renders a decorative icon', () => {
    render(
      <MemoryRouter>
        <PublicSurveysPage />
      </MemoryRouter>
    );
    // Verify SVG icon renders without relying on fragile lucide CSS class names
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
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
