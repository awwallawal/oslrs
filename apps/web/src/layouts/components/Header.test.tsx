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

  it('renders Register CTA button', () => {
    renderWithRouter(<Header />);
    const registerLink = screen.getByRole('link', { name: /^register$/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('renders Staff Login CTA button', () => {
    renderWithRouter(<Header />);
    const staffLoginLink = screen.getByRole('link', { name: /staff login/i });
    expect(staffLoginLink).toBeInTheDocument();
    expect(staffLoginLink).toHaveAttribute('href', '/staff/login');
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

  it('renders navigation menu items', () => {
    renderWithRouter(<Header />);
    // Check for navigation buttons/links
    expect(screen.getByRole('button', { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /participate/i })).toBeInTheDocument();
  });
});
