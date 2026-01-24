// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import GuideEmployerAccountPage from '../../pages/guides/GuideEmployerAccountPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('GuideEmployerAccountPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<GuideEmployerAccountPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Setting Up an Employer Account');
  });

  it('renders estimated time', () => {
    renderWithRouter(<GuideEmployerAccountPage />);
    expect(screen.getByText(/2 minutes/)).toBeInTheDocument();
  });

  it('renders Why Create an Employer Account section', () => {
    renderWithRouter(<GuideEmployerAccountPage />);
    expect(screen.getByText('Why Create an Employer Account?')).toBeInTheDocument();
    expect(screen.getByText(/Access to verified worker contact details/)).toBeInTheDocument();
    expect(screen.getByText(/Advanced search and filter options/)).toBeInTheDocument();
  });

  it('renders 5 steps', () => {
    renderWithRouter(<GuideEmployerAccountPage />);
    expect(screen.getByText(/Click "Register" or "Create Employer Account"/)).toBeInTheDocument();
    expect(screen.getByText('Enter business information')).toBeInTheDocument();
    expect(screen.getByText('Verify your email')).toBeInTheDocument();
    expect(screen.getByText('Complete your business profile')).toBeInTheDocument();
    expect(screen.getByText('Start searching workers')).toBeInTheDocument();
  });

  it('renders important information tips', () => {
    renderWithRouter(<GuideEmployerAccountPage />);
    expect(screen.getByText('Important Information')).toBeInTheDocument();
    expect(screen.getByText('Registration is FREE')).toBeInTheDocument();
    expect(screen.getByText('Contact views are logged')).toBeInTheDocument();
  });

  it('renders Back to Guides link', () => {
    renderWithRouter(<GuideEmployerAccountPage />);
    const backLinks = screen.getAllByRole('link', { name: /Back to.*Guides/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    expect(backLinks[0]).toHaveAttribute('href', '/support/guides');
  });

  it('renders related guides section', () => {
    renderWithRouter(<GuideEmployerAccountPage />);
    expect(screen.getByText('Related Guides')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /How to Search the Marketplace/i })).toHaveAttribute('href', '/support/guides/search-marketplace');
  });

  it('renders Create Employer Account CTA', () => {
    renderWithRouter(<GuideEmployerAccountPage />);
    expect(screen.getByRole('link', { name: /Create Employer Account/i })).toHaveAttribute('href', '/register');
  });
});
