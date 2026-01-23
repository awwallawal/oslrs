// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import HomePage from '../HomePage';

expect.extend(matchers);

// Wrapper with Router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('HomePage', () => {
  describe('renders all 9 sections', () => {
    it('renders HeroSection with H1 heading', () => {
      renderWithRouter(<HomePage />);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
      expect(h1).toHaveTextContent(/Oyo State's Workforce/i);
    });

    it('renders WhatIsSection', () => {
      renderWithRouter(<HomePage />);
      const section = document.getElementById('what-is');
      expect(section).toBeInTheDocument();
      expect(screen.getByText(/What Is OSLSR/i)).toBeInTheDocument();
    });

    it('renders ParticipantsSection with 3 cards', () => {
      renderWithRouter(<HomePage />);
      const section = document.getElementById('who-can-participate');
      expect(section).toBeInTheDocument();
      expect(screen.getByText(/Who Can Participate/i)).toBeInTheDocument();
      expect(screen.getByText('Residents')).toBeInTheDocument();
      expect(screen.getByText('Skilled Workers')).toBeInTheDocument();
      expect(screen.getByText('Employers')).toBeInTheDocument();
    });

    it('renders HowItWorksSection with 4 steps', () => {
      renderWithRouter(<HomePage />);
      const section = document.getElementById('how-it-works');
      expect(section).toBeInTheDocument();
      // Use within to scope the query to the section
      expect(within(section!).getByRole('heading', { level: 2 })).toHaveTextContent('How It Works');
      expect(within(section!).getByText('Create Account')).toBeInTheDocument();
      expect(within(section!).getByText('Verify Email')).toBeInTheDocument();
      expect(within(section!).getByText('Complete Survey')).toBeInTheDocument();
      expect(within(section!).getByText('Get Verified')).toBeInTheDocument();
    });

    it('renders RequirementsSection with checklist', () => {
      renderWithRouter(<HomePage />);
      const section = document.getElementById('what-youll-need');
      expect(section).toBeInTheDocument();
      expect(within(section!).getByRole('heading', { level: 2 })).toHaveTextContent("What You'll Need");
      // Use getAllByText since "NIN" appears in both heading and description
      const ninElements = within(section!).getAllByText(/NIN/i);
      expect(ninElements.length).toBeGreaterThan(0);
      expect(within(section!).getByRole('heading', { name: /Phone Number/i })).toBeInTheDocument();
    });

    it('renders CoverageSection with metrics', () => {
      renderWithRouter(<HomePage />);
      const section = document.getElementById('coverage');
      expect(section).toBeInTheDocument();
      expect(screen.getByText(/Coverage & Progress/i)).toBeInTheDocument();
      // Phase 1 metrics
      expect(screen.getByTestId('metric-lgas-covered')).toBeInTheDocument();
      expect(screen.getByTestId('metric-registered-workers')).toBeInTheDocument();
    });

    it('renders MarketplacePreviewSection (Phase 1 placeholder)', () => {
      renderWithRouter(<HomePage />);
      const section = document.getElementById('marketplace');
      expect(section).toBeInTheDocument();
      expect(within(section!).getByRole('heading', { level: 2 })).toHaveTextContent('Find Verified Local Talent');
      expect(within(section!).getByText(/marketplace coming soon/i)).toBeInTheDocument();
    });

    it('renders TrustSection', () => {
      renderWithRouter(<HomePage />);
      const section = document.getElementById('trust');
      expect(section).toBeInTheDocument();
      expect(screen.getByText(/Trust & Data Protection/i)).toBeInTheDocument();
      expect(screen.getByText(/NDPA Compliant/i)).toBeInTheDocument();
    });

    it('renders FinalCtaSection', () => {
      renderWithRouter(<HomePage />);
      const section = document.getElementById('final-cta');
      expect(section).toBeInTheDocument();
      expect(screen.getByText(/Ready to Register/i)).toBeInTheDocument();
    });
  });

  describe('heading structure', () => {
    it('has exactly one H1 (in HeroSection)', () => {
      renderWithRouter(<HomePage />);
      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s).toHaveLength(1);
    });

    it('has H2 headings for each content section', () => {
      renderWithRouter(<HomePage />);
      const h2s = screen.getAllByRole('heading', { level: 2 });
      // 8 sections with H2: What Is, Participants, How It Works, Requirements,
      // Coverage, Marketplace, Trust, Final CTA
      expect(h2s.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('navigation and CTAs', () => {
    it('renders Register CTA in hero', () => {
      renderWithRouter(<HomePage />);
      const heroSection = document.getElementById('hero');
      expect(heroSection).toBeInTheDocument();
      const registerLink = within(heroSection!).getByRole('link', {
        name: /Register Your Skills/i,
      });
      expect(registerLink).toHaveAttribute('href', '/register');
    });

    it('renders Register Now CTA in final section', () => {
      renderWithRouter(<HomePage />);
      const ctaSection = document.getElementById('final-cta');
      expect(ctaSection).toBeInTheDocument();
      const registerLink = within(ctaSection!).getByRole('link', {
        name: /Register Now/i,
      });
      expect(registerLink).toHaveAttribute('href', '/register');
    });

    it('renders Login link for returning users', () => {
      renderWithRouter(<HomePage />);
      const loginLink = screen.getByRole('link', {
        name: /Continue your registration/i,
      });
      expect(loginLink).toHaveAttribute('href', '/login');
    });

    it('renders Privacy Policy link in TrustSection', () => {
      renderWithRouter(<HomePage />);
      const privacyLink = screen.getByRole('link', {
        name: /Read Our Privacy Policy/i,
      });
      expect(privacyLink).toHaveAttribute('href', '/about/privacy');
    });
  });

  describe('section order', () => {
    it('renders sections in correct order per IA spec', () => {
      renderWithRouter(<HomePage />);
      const sections = document.querySelectorAll('section[id]');
      const sectionIds = Array.from(sections).map((s) => s.id);

      // Expected order from docs/public-website-ia.md (with actual IDs from components)
      const expectedOrder = [
        'hero',
        'what-is',
        'who-can-participate',
        'how-it-works',
        'what-youll-need',
        'coverage',
        'marketplace',
        'trust',
        'final-cta',
      ];

      expectedOrder.forEach((id, index) => {
        expect(sectionIds[index]).toBe(id);
      });
    });
  });

  describe('accessibility', () => {
    it('has sections with proper landmark structure', () => {
      renderWithRouter(<HomePage />);
      const sections = document.querySelectorAll('section');
      expect(sections.length).toBeGreaterThanOrEqual(9);
    });

    it('has accessible images with alt text', () => {
      renderWithRouter(<HomePage />);
      const images = screen.getAllByRole('img');
      images.forEach((img) => {
        expect(img).toHaveAttribute('alt');
        expect(img.getAttribute('alt')).not.toBe('');
      });
    });

    it('has focus-visible styles on primary CTA buttons', () => {
      renderWithRouter(<HomePage />);
      // Check hero register button has focus styles
      const heroSection = document.getElementById('hero');
      const heroRegisterLink = within(heroSection!).getByRole('link', {
        name: /Register Your Skills/i,
      });
      expect(heroRegisterLink.className).toMatch(/focus:/);
    });
  });

  describe('responsive design classes', () => {
    it('uses responsive typography in hero', () => {
      renderWithRouter(<HomePage />);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.className).toMatch(/text-4xl|text-5xl|lg:/);
    });

    it('uses container for content width', () => {
      renderWithRouter(<HomePage />);
      const containers = document.querySelectorAll('[class*="container"]');
      expect(containers.length).toBeGreaterThan(0);
    });
  });
});
