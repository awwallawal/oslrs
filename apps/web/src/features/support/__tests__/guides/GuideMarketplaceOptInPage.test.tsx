// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import GuideMarketplaceOptInPage from '../../pages/guides/GuideMarketplaceOptInPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('GuideMarketplaceOptInPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<GuideMarketplaceOptInPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('How to Opt Into the Marketplace');
  });

  it('renders estimated time', () => {
    renderWithRouter(<GuideMarketplaceOptInPage />);
    expect(screen.getByText(/2 minutes/)).toBeInTheDocument();
  });

  it('renders prerequisites section', () => {
    renderWithRouter(<GuideMarketplaceOptInPage />);
    expect(screen.getByText('Before You Start')).toBeInTheDocument();
    expect(screen.getByText(/Completed OSLSR registration/)).toBeInTheDocument();
    expect(screen.getByText(/Completed skills survey/)).toBeInTheDocument();
  });

  it('renders 5 steps', () => {
    renderWithRouter(<GuideMarketplaceOptInPage />);
    expect(screen.getByText('Log in to your account')).toBeInTheDocument();
    expect(screen.getByText('Go to Privacy Settings')).toBeInTheDocument();
    expect(screen.getByText('Review marketplace consent options')).toBeInTheDocument();
    expect(screen.getByText('Choose your visibility level')).toBeInTheDocument();
    expect(screen.getByText('Confirm your choices')).toBeInTheDocument();
  });

  it('renders What Employers Can See section', () => {
    renderWithRouter(<GuideMarketplaceOptInPage />);
    expect(screen.getByText('What Employers Can See')).toBeInTheDocument();
    expect(screen.getByText('Always Visible')).toBeInTheDocument();
    expect(screen.getByText('Your Choice')).toBeInTheDocument();
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('renders Back to Guides link', () => {
    renderWithRouter(<GuideMarketplaceOptInPage />);
    const backLinks = screen.getAllByRole('link', { name: /Back to.*Guides/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    expect(backLinks[0]).toHaveAttribute('href', '/support/guides');
  });
});
