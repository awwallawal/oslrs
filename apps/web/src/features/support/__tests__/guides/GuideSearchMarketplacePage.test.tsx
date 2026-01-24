// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import GuideSearchMarketplacePage from '../../pages/guides/GuideSearchMarketplacePage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('GuideSearchMarketplacePage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<GuideSearchMarketplacePage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('How to Search the Marketplace');
  });

  it('renders estimated time', () => {
    renderWithRouter(<GuideSearchMarketplacePage />);
    expect(screen.getByText(/Instant/)).toBeInTheDocument();
  });

  it('renders prerequisites section', () => {
    renderWithRouter(<GuideSearchMarketplacePage />);
    expect(screen.getByText('Before You Start')).toBeInTheDocument();
    expect(screen.getByText(/None for basic search/)).toBeInTheDocument();
    expect(screen.getByText(/Employer account required/)).toBeInTheDocument();
  });

  it('renders 5 steps', () => {
    renderWithRouter(<GuideSearchMarketplacePage />);
    expect(screen.getByText('Go to the Marketplace')).toBeInTheDocument();
    expect(screen.getByText('Use the search bar or filters')).toBeInTheDocument();
    expect(screen.getByText('Filter by skill, location, availability')).toBeInTheDocument();
    expect(screen.getByText('View worker profiles')).toBeInTheDocument();
    expect(screen.getByText('Contact workers')).toBeInTheDocument();
  });

  it('renders tips section', () => {
    renderWithRouter(<GuideSearchMarketplacePage />);
    expect(screen.getByText('Tips for Effective Searching')).toBeInTheDocument();
    expect(screen.getByText('Use specific skill keywords')).toBeInTheDocument();
    expect(screen.getByText('Check verification badges')).toBeInTheDocument();
  });

  it('renders Back to Guides link', () => {
    renderWithRouter(<GuideSearchMarketplacePage />);
    const backLinks = screen.getAllByRole('link', { name: /Back to.*Guides/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    expect(backLinks[0]).toHaveAttribute('href', '/support/guides');
  });

  it('renders related guides section', () => {
    renderWithRouter(<GuideSearchMarketplacePage />);
    expect(screen.getByText('Related Guides')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Setting Up an Employer Account/i })).toHaveAttribute('href', '/support/guides/employer-account');
  });

  it('renders Go to Marketplace link', () => {
    renderWithRouter(<GuideSearchMarketplacePage />);
    expect(screen.getByRole('link', { name: /Go to Marketplace/i })).toHaveAttribute('href', '/marketplace');
  });
});
