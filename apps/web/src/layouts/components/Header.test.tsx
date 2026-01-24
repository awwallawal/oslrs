// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { Header } from './Header';

expect.extend(matchers);

// Mock the MobileNav component to simplify testing
vi.mock('./MobileNav', () => ({
  MobileNav: () => <button data-testid="mobile-nav">Mobile Menu</button>,
}));

// Mock the SmartCta component to simplify testing (per Story 1.5-8 AC5)
vi.mock('./SmartCta', () => ({
  SmartCta: () => <a href="/register" data-testid="smart-cta">Register</a>,
}));

// Wrapper with Router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('Header', () => {
  it('renders logo link to homepage', () => {
    renderWithRouter(<Header />);
    const logoLink = screen.getByRole('link', { name: /oslsr home/i });
    expect(logoLink).toBeInTheDocument();
    expect(logoLink).toHaveAttribute('href', '/');
  });

  it('renders SmartCta component (per Story 1.5-8 AC5)', () => {
    renderWithRouter(<Header />);
    const smartCta = screen.getByTestId('smart-cta');
    expect(smartCta).toBeInTheDocument();
  });

  it('does NOT render Staff Login in header (per Story 1.5-6 AC4 - moved to Footer)', () => {
    renderWithRouter(<Header />);
    const staffLoginLink = screen.queryByRole('link', { name: /staff login/i });
    expect(staffLoginLink).not.toBeInTheDocument();
  });

  it('renders mobile navigation trigger', () => {
    renderWithRouter(<Header />);
    const mobileNav = screen.getByTestId('mobile-nav');
    expect(mobileNav).toBeInTheDocument();
  });

  it('has sticky positioning', () => {
    renderWithRouter(<Header />);
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('sticky', 'top-0');
  });

  it('renders navigation menu items including Support dropdown', () => {
    renderWithRouter(<Header />);
    // Check for navigation buttons/links
    expect(screen.getByRole('button', { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /participate/i })).toBeInTheDocument();
    // Support is now a dropdown per Story 1.5-6 AC2
    expect(screen.getByRole('button', { name: /support/i })).toBeInTheDocument();
  });

  it('renders Insights dropdown trigger (per Story 1.5-8 AC6)', () => {
    renderWithRouter(<Header />);
    expect(screen.getByRole('button', { name: /insights/i })).toBeInTheDocument();
  });

  it('renders Contact as top-level navigation item (per Story 1.5-6 AC3)', () => {
    renderWithRouter(<Header />);
    const contactLink = screen.getByRole('link', { name: /^contact$/i });
    expect(contactLink).toBeInTheDocument();
    expect(contactLink).toHaveAttribute('href', '/support/contact');
  });
});
