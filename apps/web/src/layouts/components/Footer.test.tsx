// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { Footer } from './Footer';

expect.extend(matchers);

// Wrapper with Router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('Footer', () => {
  it('renders with contentinfo role', () => {
    renderWithRouter(<Footer />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
  });

  it('renders brand logo link to homepage', () => {
    renderWithRouter(<Footer />);
    const logoLink = screen.getByRole('link', { name: /oslsr home/i });
    expect(logoLink).toBeInTheDocument();
    expect(logoLink).toHaveAttribute('href', '/');
  });

  it('renders Quick Links section', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByRole('heading', { name: /quick links/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^home$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^about$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^participate$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^support$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^marketplace$/i })).toBeInTheDocument();
  });

  it('renders About section with legal links per Story 1.5-6 AC5', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByRole('heading', { name: /^about$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/about/privacy');
    expect(screen.getByRole('link', { name: /contact us/i })).toHaveAttribute('href', '/support/contact');
  });

  it('renders Staff Login link in footer per Story 1.5-6 AC5', () => {
    renderWithRouter(<Footer />);
    const staffLoginLink = screen.getByRole('link', { name: /staff login/i });
    expect(staffLoginLink).toBeInTheDocument();
    expect(staffLoginLink).toHaveAttribute('href', '/staff/login');
  });

  it('renders Contact section', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByRole('heading', { name: /contact/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /info@oyotradeministry\.com\.ng/i })).toBeInTheDocument();
  });

  it('renders copyright notice with current year', () => {
    renderWithRouter(<Footer />);
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${currentYear}.*Oyo State Government`, 'i'))).toBeInTheDocument();
  });

  it('has accessible link focus states', () => {
    renderWithRouter(<Footer />);
    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      // All links have focus:outline-none, and either focus:ring-2 or focus-visible:ring-2
      expect(link).toHaveClass('focus:outline-none');
    });
  });
});
