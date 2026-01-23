// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import AboutLandingPage from '../pages/AboutLandingPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('AboutLandingPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<AboutLandingPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent("Understanding Oyo State's Workforce");
  });

  it('renders mission statement section', () => {
    renderWithRouter(<AboutLandingPage />);
    expect(screen.getByText(/Our Mission/i)).toBeInTheDocument();
    expect(screen.getByText(/comprehensive, accurate picture/i)).toBeInTheDocument();
  });

  it('displays all 5 navigation cards', () => {
    renderWithRouter(<AboutLandingPage />);
    expect(screen.getByText('The Initiative')).toBeInTheDocument();
    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Leadership')).toBeInTheDocument();
    expect(screen.getByText('Partners')).toBeInTheDocument();
    expect(screen.getByText('Privacy & Data Protection')).toBeInTheDocument();
  });

  it('renders navigation links with correct hrefs', () => {
    renderWithRouter(<AboutLandingPage />);
    expect(screen.getByRole('link', { name: /The Initiative/i })).toHaveAttribute('href', '/about/initiative');
    expect(screen.getByRole('link', { name: /How It Works/i })).toHaveAttribute('href', '/about/how-it-works');
    expect(screen.getByRole('link', { name: /Leadership/i })).toHaveAttribute('href', '/about/leadership');
    expect(screen.getByRole('link', { name: /Partners/i })).toHaveAttribute('href', '/about/partners');
    expect(screen.getByRole('link', { name: /Privacy & Data Protection/i })).toHaveAttribute('href', '/about/privacy');
  });

  it('displays project timeline section', () => {
    renderWithRouter(<AboutLandingPage />);
    expect(screen.getByText(/Project Timeline/i)).toBeInTheDocument();
    expect(screen.getByText('Q4 2025')).toBeInTheDocument();
    expect(screen.getByText('Q1 2026')).toBeInTheDocument();
    expect(screen.getByText('Q2 2026')).toBeInTheDocument();
    expect(screen.getByText('Q3 2026')).toBeInTheDocument();
  });

  it('renders CTA section with register link', () => {
    renderWithRouter(<AboutLandingPage />);
    const registerLinks = screen.getAllByRole('link', { name: /Register Now/i });
    expect(registerLinks.length).toBeGreaterThan(0);
    expect(registerLinks[0]).toHaveAttribute('href', '/register');
  });
});
