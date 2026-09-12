// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import EmployersPage from '../pages/EmployersPage';
import {
  GOVERNMENT_VERIFICATION_MEANS,
  GOVERNMENT_VERIFICATION_DOES_NOT_MEAN,
  FORBIDDEN_IDENTITY_CLAIMS,
} from '../../../lib/trust-claims';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('EmployersPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<EmployersPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Find Verified Skilled Workers in Your Area');
  });

  it('renders Browse Marketplace CTA in hero', () => {
    renderWithRouter(<EmployersPage />);
    const marketplaceLink = screen.getByRole('link', { name: /Browse Marketplace/i });
    expect(marketplaceLink).toHaveAttribute('href', '/marketplace');
  });

  it('renders Why Use Marketplace section with 6 benefits', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('Why Use the OSLSR Marketplace?')).toBeInTheDocument();
    expect(screen.getByText('Verified Identities')).toBeInTheDocument();
    expect(screen.getByText('Local Talent')).toBeInTheDocument();
    expect(screen.getByText('Reduce Hiring Risk')).toBeInTheDocument();
    expect(screen.getByText('Search by Skill')).toBeInTheDocument();
    expect(screen.getByText('Free to Search')).toBeInTheDocument();
    expect(screen.getByText('Support Local Workforce')).toBeInTheDocument();
  });

  it('renders How It Works section with 4 steps', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Search Marketplace')).toBeInTheDocument();
    expect(screen.getByText('View Profiles')).toBeInTheDocument();
    expect(screen.getByText('Request Contact')).toBeInTheDocument();
    expect(screen.getByText('Hire Directly')).toBeInTheDocument();
  });

  it('renders Understanding Verification section', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('Understanding Verification')).toBeInTheDocument();
    expect(screen.getByText('What the Badge Means')).toBeInTheDocument();
    expect(screen.getByText('What It Does NOT Mean')).toBeInTheDocument();
  });

  /**
   * ⚠️ [AI-Review][High] 2026-09-11, Story 13-58 R1 sweep. This block used to assert
   * 'Identity confirmed through NIN verification' and 'Badge indicates trustworthy identity'
   * WORD FOR WORD — so the false claim had a defender, and anyone who fixed the page would
   * have been met by a failing test telling them to put it back. Third instance of that shape
   * in this story. → [[pattern-test-that-passes-over-a-hole]]
   *
   * Now asserts the CANONICAL lists, so the test tracks `lib/trust-claims.ts` and can never
   * again disagree with the badge about what the platform checks.
   */
  it('displays verification positive points — from the canonical trust claims', () => {
    renderWithRouter(<EmployersPage />);
    for (const claim of GOVERNMENT_VERIFICATION_MEANS) {
      expect(screen.getByText(claim)).toBeInTheDocument();
    }
  });

  it('displays verification disclaimers — from the canonical trust claims', () => {
    renderWithRouter(<EmployersPage />);
    for (const claim of GOVERNMENT_VERIFICATION_DOES_NOT_MEAN) {
      expect(screen.getByText(claim)).toBeInTheDocument();
    }
  });

  it('makes no identity claim the platform cannot support (R1)', () => {
    const { container } = renderWithRouter(<EmployersPage />);
    const text = container.textContent ?? '';
    for (const { pattern, why } of FORBIDDEN_IDENTITY_CLAIMS) {
      expect(pattern.test(text), `EmployersPage must not claim: ${why}`).toBe(false);
    }
  });

  it('renders Visibility Table section', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('What Information Is Visible?')).toBeInTheDocument();
    expect(screen.getByText('Profession/Skill')).toBeInTheDocument();
    expect(screen.getByText('Local Government')).toBeInTheDocument();
    expect(screen.getByText("Worker's Name")).toBeInTheDocument();
    expect(screen.getByText('Phone Number')).toBeInTheDocument();
  });

  it('renders employer registration callout', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('Want Full Access?')).toBeInTheDocument();
    expect(screen.getByText(/creating a free employer account/i)).toBeInTheDocument();
  });

  it('renders FAQ section with questions', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
    expect(screen.getByText('Is there a fee to use the marketplace?')).toBeInTheDocument();
    expect(screen.getByText('Can I post job listings?')).toBeInTheDocument();
    expect(screen.getByText("What if a worker's contact info is hidden?")).toBeInTheDocument();
    expect(screen.getByText('How do I report a fake profile?')).toBeInTheDocument();
    expect(screen.getByText('Does the government guarantee worker quality?')).toBeInTheDocument();
  });

  it('renders disabled search preview section', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('Find Workers Now')).toBeInTheDocument();
    expect(screen.getByText('Marketplace search coming soon')).toBeInTheDocument();
  });

  it('renders final CTA with Create Employer Account link', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('Ready to Find Skilled Workers?')).toBeInTheDocument();
    const ctaLink = screen.getByRole('link', { name: /Create Employer Account/i });
    expect(ctaLink).toHaveAttribute('href', '/register');
  });
});
