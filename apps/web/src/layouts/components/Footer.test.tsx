// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { Footer, aboutLinks, participateLinks, supportLinks, legalLinks, socialLinks } from './Footer';

afterEach(() => {
  cleanup();
});

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

  describe('AC1: 6-Column Footer Layout', () => {
    it('renders all 6 column sections', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByRole('heading', { name: /^about$/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^participate$/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^insights$/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^support$/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^legal$/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^connect$/i })).toBeInTheDocument();
    });

    it('renders ABOUT column links', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByRole('link', { name: /the initiative/i })).toHaveAttribute('href', '/about/initiative');
      expect(screen.getByRole('link', { name: /how it works/i })).toHaveAttribute('href', '/about/how-it-works');
      expect(screen.getByRole('link', { name: /leadership/i })).toHaveAttribute('href', '/about/leadership');
      expect(screen.getByRole('link', { name: /partners/i })).toHaveAttribute('href', '/about/partners');
      expect(screen.getByRole('link', { name: /^privacy$/i })).toHaveAttribute('href', '/about/privacy');
    });

    it('renders PARTICIPATE column links', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByRole('link', { name: /for workers/i })).toHaveAttribute('href', '/participate/workers');
      expect(screen.getByRole('link', { name: /for employers/i })).toHaveAttribute('href', '/participate/employers');
    });

    it('renders INSIGHTS column with Coming Soon placeholder', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    });

    it('renders SUPPORT column links', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByRole('link', { name: /^faq$/i })).toHaveAttribute('href', '/support/faq');
      expect(screen.getByRole('link', { name: /^guides$/i })).toHaveAttribute('href', '/support/guides');
      expect(screen.getByRole('link', { name: /^contact$/i })).toHaveAttribute('href', '/support/contact');
      expect(screen.getByRole('link', { name: /verify worker/i })).toHaveAttribute('href', '/support/verify-worker');
    });

    it('renders LEGAL column links', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute('href', '/terms');
      expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/about/privacy');
    });
  });

  describe('AC2: Social Media Links', () => {
    it('renders Twitter, Facebook, Instagram links', () => {
      renderWithRouter(<Footer />);
      const twitterLink = screen.getByRole('link', { name: /follow us on twitter/i });
      const facebookLink = screen.getByRole('link', { name: /follow us on facebook/i });
      const instagramLink = screen.getByRole('link', { name: /follow us on instagram/i });

      expect(twitterLink).toBeInTheDocument();
      expect(facebookLink).toBeInTheDocument();
      expect(instagramLink).toBeInTheDocument();
    });

    it('social links open in new tab with security attributes', () => {
      renderWithRouter(<Footer />);
      const twitterLink = screen.getByRole('link', { name: /follow us on twitter/i });

      expect(twitterLink).toHaveAttribute('target', '_blank');
      expect(twitterLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('social links have correct hrefs', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByRole('link', { name: /follow us on twitter/i })).toHaveAttribute('href', 'https://twitter.com/oyaboremi');
      expect(screen.getByRole('link', { name: /follow us on facebook/i })).toHaveAttribute('href', 'https://facebook.com/oyostate');
      expect(screen.getByRole('link', { name: /follow us on instagram/i })).toHaveAttribute('href', 'https://instagram.com/oyostate');
    });
  });

  describe('AC3: NDPA Compliant Badge', () => {
    it('renders NDPA Compliant badge', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByText(/ndpa compliant/i)).toBeInTheDocument();
    });

    it('NDPA badge links to privacy page', () => {
      renderWithRouter(<Footer />);
      const ndpaBadge = screen.getByRole('link', { name: /ndpa compliant/i });
      expect(ndpaBadge).toHaveAttribute('href', '/about/privacy');
    });
  });

  describe('AC4: Oyo State Seal', () => {
    it('renders Oyo State Seal image', () => {
      renderWithRouter(<Footer />);
      const sealImage = screen.getByAltText(/oyo state seal/i);
      expect(sealImage).toBeInTheDocument();
      expect(sealImage).toHaveClass('h-8');
    });

    it('Oyo State Seal links to official website', () => {
      renderWithRouter(<Footer />);
      const sealLink = screen.getByRole('link', { name: /oyo state government official website/i });
      expect(sealLink).toHaveAttribute('href', 'https://oyostate.gov.ng');
      expect(sealLink).toHaveAttribute('target', '_blank');
      expect(sealLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('AC8: Staff Portal Link', () => {
    it('renders Staff Portal link', () => {
      renderWithRouter(<Footer />);
      const staffPortalLink = screen.getByRole('link', { name: /staff portal/i });
      expect(staffPortalLink).toBeInTheDocument();
      expect(staffPortalLink).toHaveAttribute('href', '/staff/login');
    });

    it('Staff Portal link has muted styling', () => {
      renderWithRouter(<Footer />);
      const staffPortalLink = screen.getByRole('link', { name: /staff portal/i });
      expect(staffPortalLink).toHaveClass('text-neutral-500');
    });
  });

  it('renders copyright notice with current year', () => {
    renderWithRouter(<Footer />);
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${currentYear}.*Oyo State Government`, 'i'))).toBeInTheDocument();
  });

  it('exports link arrays with correct structure', () => {
    expect(aboutLinks).toBeInstanceOf(Array);
    expect(aboutLinks.length).toBe(5);

    expect(participateLinks).toBeInstanceOf(Array);
    expect(participateLinks.length).toBe(2);

    expect(supportLinks).toBeInstanceOf(Array);
    expect(supportLinks.length).toBe(4);

    expect(legalLinks).toBeInstanceOf(Array);
    expect(legalLinks.length).toBe(2);

    expect(socialLinks).toBeInstanceOf(Array);
    expect(socialLinks.length).toBe(3);
  });

  it('has accessible link focus states with focus-visible', () => {
    renderWithRouter(<Footer />);
    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      expect(link).toHaveClass('focus:outline-none');
    });
  });
});
