// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import WorkersPage from '../pages/WorkersPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('WorkersPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<WorkersPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Get Discovered by Employers Across Oyo State');
  });

  it('renders Register Now CTA button in hero', () => {
    renderWithRouter(<WorkersPage />);
    const registerLinks = screen.getAllByRole('link', { name: /Register Now/i });
    expect(registerLinks.length).toBeGreaterThan(0);
    expect(registerLinks[0]).toHaveAttribute('href', '/register');
  });

  it('renders Why Register section with 3 benefits', () => {
    renderWithRouter(<WorkersPage />);
    expect(screen.getByText('Why Register?')).toBeInTheDocument();
    expect(screen.getByText('Government Verified Badge')).toBeInTheDocument();
    expect(screen.getByText('Appear in Marketplace')).toBeInTheDocument();
    expect(screen.getByText('Priority Access')).toBeInTheDocument();
  });

  it('renders verified badge callout', () => {
    renderWithRouter(<WorkersPage />);
    expect(screen.getByText('What the Verified Badge Means')).toBeInTheDocument();
    expect(screen.getByText(/government-verified badge/i)).toBeInTheDocument();
  });

  it('renders Who Should Register section with worker categories', () => {
    renderWithRouter(<WorkersPage />);
    expect(screen.getByText('Who Should Register?')).toBeInTheDocument();
    expect(screen.getByText('Artisans & Tradespeople')).toBeInTheDocument();
    expect(screen.getByText('Skilled Professionals')).toBeInTheDocument();
    expect(screen.getByText('Service Workers')).toBeInTheDocument();
    expect(screen.getByText('Technical & Digital')).toBeInTheDocument();
    expect(screen.getByText('Agricultural Workers')).toBeInTheDocument();
    expect(screen.getByText('Job Seekers')).toBeInTheDocument();
  });

  it('renders How Registration Works section with 4 steps', () => {
    renderWithRouter(<WorkersPage />);
    expect(screen.getByText('How Registration Works')).toBeInTheDocument();
    expect(screen.getByText('Create Account')).toBeInTheDocument();
    expect(screen.getByText('Verify Email')).toBeInTheDocument();
    expect(screen.getByText('Complete Survey')).toBeInTheDocument();
    expect(screen.getByText('Get Verified')).toBeInTheDocument();
  });

  it('renders What You Need section with requirements', () => {
    renderWithRouter(<WorkersPage />);
    expect(screen.getByText("What You'll Need")).toBeInTheDocument();
    expect(screen.getByText('NIN')).toBeInTheDocument();
    expect(screen.getByText('Phone Number')).toBeInTheDocument();
    expect(screen.getByText('Email Address')).toBeInTheDocument();
  });

  it('renders NIN callout with NIMC link', () => {
    renderWithRouter(<WorkersPage />);
    expect(screen.getByText("Don't have a NIN?")).toBeInTheDocument();
    const nimcLink = screen.getByRole('link', { name: /Find a NIMC enrollment center/i });
    expect(nimcLink).toHaveAttribute('href', 'https://nimc.gov.ng/enrollment-centers/');
    expect(nimcLink).toHaveAttribute('target', '_blank');
  });

  it('renders Privacy section with 4 assurances', () => {
    renderWithRouter(<WorkersPage />);
    expect(screen.getByText('Your Privacy Is Protected')).toBeInTheDocument();
    expect(screen.getByText('NDPA Compliant')).toBeInTheDocument();
    expect(screen.getByText('Data Encrypted')).toBeInTheDocument();
    expect(screen.getByText('You Control Visibility')).toBeInTheDocument();
    expect(screen.getByText('No Data Selling')).toBeInTheDocument();
  });

  it('renders FAQ section with questions', () => {
    renderWithRouter(<WorkersPage />);
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
    expect(screen.getByText('Is registration free?')).toBeInTheDocument();
    expect(screen.getByText('Do I need to upload a photo?')).toBeInTheDocument();
    expect(screen.getByText("What if I don't want to appear in the marketplace?")).toBeInTheDocument();
    expect(screen.getByText('Can I update my information later?')).toBeInTheDocument();
    expect(screen.getByText('How long does verification take?')).toBeInTheDocument();
  });

  it('renders final CTA section with Register and Continue links', () => {
    renderWithRouter(<WorkersPage />);
    expect(screen.getByText('Ready to Get Started?')).toBeInTheDocument();
    const continueLink = screen.getByRole('link', { name: /Continue your registration/i });
    expect(continueLink).toHaveAttribute('href', '/login');
  });
});
