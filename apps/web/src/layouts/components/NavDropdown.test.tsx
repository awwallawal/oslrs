// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { NavDropdown, aboutItems, participateItems, supportItems, insightsItems } from './NavDropdown';

afterEach(() => {
  cleanup();
});

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

  it('renders Support dropdown trigger (per Story 1.5-6 AC2)', () => {
    renderWithRouter(<NavDropdown />);
    // Support is now a dropdown, not a link
    expect(screen.getByRole('button', { name: /support/i })).toBeInTheDocument();
  });

  it('renders Marketplace link with correct href', () => {
    renderWithRouter(<NavDropdown />);
    const marketplaceLink = screen.getByRole('link', { name: /marketplace/i });
    expect(marketplaceLink).toBeInTheDocument();
    expect(marketplaceLink).toHaveAttribute('href', '/marketplace');
  });

  it('renders Contact link with correct href (per Story 1.5-6 AC3)', () => {
    renderWithRouter(<NavDropdown />);
    const contactLink = screen.getByRole('link', { name: /contact/i });
    expect(contactLink).toBeInTheDocument();
    expect(contactLink).toHaveAttribute('href', '/support/contact');
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

  it('exports supportItems with correct structure (per Story 1.5-6 AC2)', () => {
    expect(supportItems).toBeInstanceOf(Array);
    expect(supportItems.length).toBe(4);
    supportItems.forEach((item) => {
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

  it('supportItems contains expected navigation paths (per Story 1.5-6 AC2)', () => {
    const hrefs = supportItems.map((item) => item.href);
    expect(hrefs).toContain('/support');
    expect(hrefs).toContain('/support/faq');
    expect(hrefs).toContain('/support/guides');
    expect(hrefs).toContain('/support/verify-worker');
  });

  it('dropdown triggers have accessible styling', () => {
    renderWithRouter(<NavDropdown />);
    const aboutTrigger = screen.getByRole('button', { name: /about/i });
    const participateTrigger = screen.getByRole('button', { name: /participate/i });
    const supportTrigger = screen.getByRole('button', { name: /support/i });

    // All should have hover states for primary color
    expect(aboutTrigger).toHaveClass('hover:text-primary-600');
    expect(participateTrigger).toHaveClass('hover:text-primary-600');
    expect(supportTrigger).toHaveClass('hover:text-primary-600');
  });

  it('Marketplace and Contact links have accessible styling', () => {
    renderWithRouter(<NavDropdown />);
    const marketplaceLink = screen.getByRole('link', { name: /marketplace/i });
    const contactLink = screen.getByRole('link', { name: /contact/i });

    expect(marketplaceLink).toHaveClass('hover:text-primary-600');
    expect(contactLink).toHaveClass('hover:text-primary-600');
  });

  describe('Insights Navigation (Story 8-5)', () => {
    it('renders Insights dropdown trigger', () => {
      renderWithRouter(<NavDropdown />);
      expect(screen.getByRole('button', { name: /insights/i })).toBeInTheDocument();
    });

    it('navigation order is correct: Insights MUST be between Marketplace and Support (per AC6)', () => {
      renderWithRouter(<NavDropdown />);
      const nav = screen.getByRole('navigation', { hidden: true });
      const items = nav.querySelectorAll('[data-radix-collection-item]');

      // Extract text content from navigation items
      const itemTexts = Array.from(items).map(item => item.textContent?.trim());

      // Find indices
      const marketplaceIndex = itemTexts.findIndex(text => text === 'Marketplace');
      const insightsIndex = itemTexts.findIndex(text => text === 'Insights');
      const supportIndex = itemTexts.findIndex(text => text === 'Support');

      // Insights MUST be between Marketplace and Support
      expect(marketplaceIndex).toBeLessThan(insightsIndex);
      expect(insightsIndex).toBeLessThan(supportIndex);
    });

    it('exports insightsItems with 4 items (3 active + 1 Coming Soon)', () => {
      expect(insightsItems).toBeInstanceOf(Array);
      expect(insightsItems.length).toBe(4);

      // 3 items have href (active links)
      const activeItems = insightsItems.filter(item => item.href);
      expect(activeItems).toHaveLength(3);

      // 1 item is Coming Soon (Reports)
      const comingSoonItems = insightsItems.filter(item => item.comingSoon);
      expect(comingSoonItems).toHaveLength(1);
      expect(comingSoonItems[0].label).toBe('Reports');
    });

    it('insightsItems contains expected items with correct routes', () => {
      const labels = insightsItems.map((item) => item.label);
      expect(labels).toContain('Labour Force Overview');
      expect(labels).toContain('Skills Map');
      expect(labels).toContain('Trends');
      expect(labels).toContain('Reports');

      const overview = insightsItems.find(i => i.label === 'Labour Force Overview');
      expect(overview?.href).toBe('/insights');
      const skills = insightsItems.find(i => i.label === 'Skills Map');
      expect(skills?.href).toBe('/insights/skills');
      const trends = insightsItems.find(i => i.label === 'Trends');
      expect(trends?.href).toBe('/insights/trends');
    });
  });
});
