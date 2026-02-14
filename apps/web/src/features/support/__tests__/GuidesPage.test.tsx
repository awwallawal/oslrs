// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import GuidesPage from '../pages/GuidesPage';

afterEach(() => {
  cleanup();
});

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

  // Story 1.5.7 AC8 - Updated links to guide detail pages
  it('renders worker guide links with correct hrefs (Story 1.5.7 AC8)', () => {
    renderWithRouter(<GuidesPage />);
    expect(screen.getByRole('link', { name: /How to Register/i })).toHaveAttribute('href', '/support/guides/register');
    expect(screen.getByRole('link', { name: /How to Complete the Survey/i })).toHaveAttribute('href', '/support/guides/survey');
    expect(screen.getByRole('link', { name: /How to Opt Into the Marketplace/i })).toHaveAttribute('href', '/support/guides/marketplace-opt-in');
    expect(screen.getByRole('link', { name: /How to Get a NIN/i })).toHaveAttribute('href', '/support/guides/get-nin');
  });

  it('renders employer guide links with correct hrefs (Story 1.5.7 AC8)', () => {
    renderWithRouter(<GuidesPage />);
    expect(screen.getByRole('link', { name: /How to Search the Marketplace/i })).toHaveAttribute('href', '/support/guides/search-marketplace');
    expect(screen.getByRole('link', { name: /How to Create an Employer Account/i })).toHaveAttribute('href', '/support/guides/employer-account');
    expect(screen.getByRole('link', { name: /How to Verify a Worker/i })).toHaveAttribute('href', '/support/guides/verify-worker');
  });

  it('How to Get a NIN is now an internal link (Story 1.5.7 AC8)', () => {
    renderWithRouter(<GuidesPage />);
    const ninLink = screen.getByRole('link', { name: /How to Get a NIN/i });
    // Should be internal link, not external
    expect(ninLink).toHaveAttribute('href', '/support/guides/get-nin');
    expect(ninLink).not.toHaveAttribute('target', '_blank');
  });

  it('renders Need More Help CTA with FAQ and Contact links', () => {
    renderWithRouter(<GuidesPage />);
    expect(screen.getByText('Need More Help?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View FAQ/i })).toHaveAttribute('href', '/support/faq');
    expect(screen.getByRole('link', { name: /Contact Support/i })).toHaveAttribute('href', '/support/contact');
  });
});
