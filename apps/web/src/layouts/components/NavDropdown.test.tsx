// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { NavDropdown, aboutItems, participateItems } from './NavDropdown';

expect.extend(matchers);

// Mock ResizeObserver for Radix UI components
beforeAll(() => {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Wrapper with Router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('NavDropdown', () => {
  it('renders About dropdown trigger', () => {
    renderWithRouter(<NavDropdown />);
    expect(screen.getByRole('button', { name: /about/i })).toBeInTheDocument();
  });

  it('renders Participate dropdown trigger', () => {
    renderWithRouter(<NavDropdown />);
    expect(screen.getByRole('button', { name: /participate/i })).toBeInTheDocument();
  });

  it('renders Support link with correct href', () => {
    renderWithRouter(<NavDropdown />);
    const supportLink = screen.getByRole('link', { name: /support/i });
    expect(supportLink).toBeInTheDocument();
    expect(supportLink).toHaveAttribute('href', '/support');
  });

  it('renders Marketplace link with correct href', () => {
    renderWithRouter(<NavDropdown />);
    const marketplaceLink = screen.getByRole('link', { name: /marketplace/i });
    expect(marketplaceLink).toBeInTheDocument();
    expect(marketplaceLink).toHaveAttribute('href', '/marketplace');
  });

  it('is hidden on mobile (md:flex)', () => {
    renderWithRouter(<NavDropdown />);
    const nav = screen.getByRole('navigation', { hidden: true });
    expect(nav).toHaveClass('hidden', 'md:flex');
  });

  it('exports aboutItems with correct structure', () => {
    expect(aboutItems).toBeInstanceOf(Array);
    expect(aboutItems.length).toBe(6);
    aboutItems.forEach((item) => {
      expect(item).toHaveProperty('href');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('description');
    });
  });

  it('exports participateItems with correct structure', () => {
    expect(participateItems).toBeInstanceOf(Array);
    expect(participateItems.length).toBe(3);
    participateItems.forEach((item) => {
      expect(item).toHaveProperty('href');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('description');
    });
  });

  it('aboutItems contains expected navigation paths', () => {
    const hrefs = aboutItems.map((item) => item.href);
    expect(hrefs).toContain('/about');
    expect(hrefs).toContain('/about/initiative');
    expect(hrefs).toContain('/about/how-it-works');
    expect(hrefs).toContain('/about/leadership');
    expect(hrefs).toContain('/about/partners');
    expect(hrefs).toContain('/about/privacy');
  });

  it('participateItems contains expected navigation paths', () => {
    const hrefs = participateItems.map((item) => item.href);
    expect(hrefs).toContain('/participate');
    expect(hrefs).toContain('/participate/workers');
    expect(hrefs).toContain('/participate/employers');
  });

  it('dropdown triggers have accessible styling', () => {
    renderWithRouter(<NavDropdown />);
    const aboutTrigger = screen.getByRole('button', { name: /about/i });
    const participateTrigger = screen.getByRole('button', { name: /participate/i });

    // Both should have hover states for primary color
    expect(aboutTrigger).toHaveClass('hover:text-primary-600');
    expect(participateTrigger).toHaveClass('hover:text-primary-600');
  });

  it('Support and Marketplace links have accessible styling', () => {
    renderWithRouter(<NavDropdown />);
    const supportLink = screen.getByRole('link', { name: /support/i });
    const marketplaceLink = screen.getByRole('link', { name: /marketplace/i });

    expect(supportLink).toHaveClass('hover:text-primary-600');
    expect(marketplaceLink).toHaveClass('hover:text-primary-600');
  });
});
