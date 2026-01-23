// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import HowItWorksPage from '../pages/HowItWorksPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('HowItWorksPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<HowItWorksPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('How It Works');
  });

  it('displays all 4 registration steps', () => {
    renderWithRouter(<HowItWorksPage />);
    expect(screen.getByText(/Registration in 4 Simple Steps/i)).toBeInTheDocument();
    // Step titles appear multiple times (visual + detailed breakdown)
    expect(screen.getAllByText('Create Account').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Verify Email').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Complete Survey').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Get Verified').length).toBeGreaterThan(0);
  });

  it('displays step numbers 1-4', () => {
    renderWithRouter(<HowItWorksPage />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('displays "What You\'ll Need" section', () => {
    renderWithRouter(<HowItWorksPage />);
    expect(screen.getByText(/What You'll Need/i)).toBeInTheDocument();
    // NIN appears in both step details and requirements section
    expect(screen.getAllByText(/NIN/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Phone Number')).toBeInTheDocument();
    expect(screen.getByText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('About 10 Minutes')).toBeInTheDocument();
  });

  it('displays NIN info callout with NIMC link', () => {
    renderWithRouter(<HowItWorksPage />);
    expect(screen.getByText(/Don't have a NIN/i)).toBeInTheDocument();
    const nimcLink = screen.getByRole('link', { name: /NIMC enrollment center/i });
    expect(nimcLink).toHaveAttribute('href', 'https://nimc.gov.ng/enrollment-centers/');
  });

  it('renders CTA section with register link', () => {
    renderWithRouter(<HowItWorksPage />);
    expect(screen.getByText(/Ready to Start/i)).toBeInTheDocument();
    const registerLink = screen.getByRole('link', { name: /Register Now/i });
    expect(registerLink).toHaveAttribute('href', '/register');
  });
});
