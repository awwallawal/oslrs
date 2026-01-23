// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import EmployersPage from '../pages/EmployersPage';

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

  it('displays verification positive points', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('Identity confirmed through NIN verification')).toBeInTheDocument();
    expect(screen.getByText('Worker voluntarily registered their skills')).toBeInTheDocument();
    expect(screen.getByText('Government oversight ensures data accuracy')).toBeInTheDocument();
    expect(screen.getByText('Badge indicates trustworthy identity')).toBeInTheDocument();
  });

  it('displays verification disclaimers', () => {
    renderWithRouter(<EmployersPage />);
    expect(screen.getByText('Does not guarantee skill proficiency')).toBeInTheDocument();
    expect(screen.getByText('Does not verify work history claims')).toBeInTheDocument();
    expect(screen.getByText('Does not replace your own due diligence')).toBeInTheDocument();
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
