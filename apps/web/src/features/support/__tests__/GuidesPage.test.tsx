// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import GuidesPage from '../pages/GuidesPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('GuidesPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<GuidesPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Guides');
  });

  it('renders subheading', () => {
    renderWithRouter(<GuidesPage />);
    expect(screen.getByText('Step-by-step instructions to help you use OSLSR')).toBeInTheDocument();
  });

  it('renders For Workers section with 4 guides', () => {
    renderWithRouter(<GuidesPage />);
    expect(screen.getByText('For Workers')).toBeInTheDocument();
    expect(screen.getByText('How to Register')).toBeInTheDocument();
    expect(screen.getByText('How to Complete the Survey')).toBeInTheDocument();
    expect(screen.getByText('How to Opt Into the Marketplace')).toBeInTheDocument();
    expect(screen.getByText('How to Get a NIN')).toBeInTheDocument();
  });

  it('renders For Employers section with 3 guides', () => {
    renderWithRouter(<GuidesPage />);
    expect(screen.getByText('For Employers')).toBeInTheDocument();
    expect(screen.getByText('How to Search the Marketplace')).toBeInTheDocument();
    expect(screen.getByText('How to Create an Employer Account')).toBeInTheDocument();
    expect(screen.getByText('How to Verify a Worker')).toBeInTheDocument();
  });

  it('renders worker guide links with correct hrefs', () => {
    renderWithRouter(<GuidesPage />);
    expect(screen.getByRole('link', { name: /How to Register/i })).toHaveAttribute('href', '/participate/workers');
  });

  it('renders employer guide links with correct hrefs', () => {
    renderWithRouter(<GuidesPage />);
    expect(screen.getByRole('link', { name: /How to Verify a Worker/i })).toHaveAttribute('href', '/support/verify-worker');
    expect(screen.getByRole('link', { name: /How to Create an Employer Account/i })).toHaveAttribute('href', '/register');
  });

  it('renders NIN guide as external link to NIMC', () => {
    renderWithRouter(<GuidesPage />);
    const nimcLink = screen.getByRole('link', { name: /How to Get a NIN/i });
    expect(nimcLink).toHaveAttribute('href', 'https://nimc.gov.ng/enrollment-centers/');
    expect(nimcLink).toHaveAttribute('target', '_blank');
  });

  it('renders Need More Help CTA with FAQ and Contact links', () => {
    renderWithRouter(<GuidesPage />);
    expect(screen.getByText('Need More Help?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View FAQ/i })).toHaveAttribute('href', '/support/faq');
    expect(screen.getByRole('link', { name: /Contact Support/i })).toHaveAttribute('href', '/support/contact');
  });
});
