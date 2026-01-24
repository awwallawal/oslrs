// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import TermsPage from '../pages/TermsPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('TermsPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<TermsPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Terms of Service');
  });

  it('renders last updated date', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });

  it('renders Acceptance of Terms section', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Acceptance of Terms')).toBeInTheDocument();
    expect(screen.getByText(/By accessing or using the Oyo State Labour/)).toBeInTheDocument();
  });

  it('renders Eligibility section', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Eligibility')).toBeInTheDocument();
    expect(screen.getByText('Be at least 18 years of age')).toBeInTheDocument();
    expect(screen.getByText(/valid National Identification Number/)).toBeInTheDocument();
  });

  it('renders User Responsibilities section', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('User Responsibilities')).toBeInTheDocument();
    expect(screen.getByText(/Provide accurate, current, and complete information/)).toBeInTheDocument();
  });

  it('renders Marketplace Rules section with worker and employer rules', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Marketplace Rules')).toBeInTheDocument();
    expect(screen.getByText('For Workers:')).toBeInTheDocument();
    expect(screen.getByText('For Employers:')).toBeInTheDocument();
    expect(screen.getByText(/opt-in to have your anonymized profile/)).toBeInTheDocument();
  });

  it('renders Prohibited Activities section', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Prohibited Activities')).toBeInTheDocument();
    expect(screen.getByText('Providing false or misleading information')).toBeInTheDocument();
    expect(screen.getByText('Impersonating another person or entity')).toBeInTheDocument();
  });

  it('renders Limitation of Liability section', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Limitation of Liability')).toBeInTheDocument();
    expect(screen.getByText(/facilitates connections between workers and employers/)).toBeInTheDocument();
  });

  it('renders Disclaimer of Warranties section', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Disclaimer of Warranties')).toBeInTheDocument();
    expect(screen.getByText(/provided on an "as is" and "as available" basis/)).toBeInTheDocument();
  });

  it('renders Governing Law section with Nigerian jurisdiction', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Governing Law')).toBeInTheDocument();
    expect(screen.getByText(/Nigerian law with exclusive jurisdiction in Oyo State courts/)).toBeInTheDocument();
  });

  it('renders Changes to Terms section', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Changes to Terms')).toBeInTheDocument();
    expect(screen.getByText(/reserve the right to modify these Terms/)).toBeInTheDocument();
  });

  it('renders Contact Information section', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByText('Ministry of Trade, Investment, Cooperatives & Industry')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /legal@oslsr\.oyo\.gov\.ng/ })).toHaveAttribute('href', 'mailto:legal@oslsr.oyo.gov.ng');
  });

  it('renders related links section', () => {
    renderWithRouter(<TermsPage />);
    expect(screen.getByText('Related Information')).toBeInTheDocument();
    // Multiple Privacy Policy links exist - one in the content, one in Related section
    const privacyLinks = screen.getAllByRole('link', { name: /Privacy Policy/i });
    expect(privacyLinks.length).toBeGreaterThanOrEqual(1);
    // The last one should be in the Related Information section
    const lastPrivacyLink = privacyLinks[privacyLinks.length - 1];
    expect(lastPrivacyLink).toHaveAttribute('href', '/about/privacy');
    // Contact Us link in Related section
    const contactLinks = screen.getAllByRole('link', { name: /Contact Us/i });
    expect(contactLinks[contactLinks.length - 1]).toHaveAttribute('href', '/support/contact');
  });
});
