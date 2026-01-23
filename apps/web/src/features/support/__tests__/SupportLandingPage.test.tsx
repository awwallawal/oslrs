// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import SupportLandingPage from '../pages/SupportLandingPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('SupportLandingPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<SupportLandingPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('How Can We Help?');
  });

  it('renders search box placeholder', () => {
    renderWithRouter(<SupportLandingPage />);
    expect(screen.getByPlaceholderText(/Search for help/i)).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('renders Quick Links section with 4 cards', () => {
    renderWithRouter(<SupportLandingPage />);
    expect(screen.getByText('Quick Links')).toBeInTheDocument();
    expect(screen.getByText('FAQ')).toBeInTheDocument();
    expect(screen.getByText('Guides')).toBeInTheDocument();
    expect(screen.getByText('Contact Us')).toBeInTheDocument();
    expect(screen.getByText('Verify a Worker')).toBeInTheDocument();
  });

  it('renders quick link cards with correct hrefs', () => {
    renderWithRouter(<SupportLandingPage />);
    // Use getAllByRole and check the first one (the card link)
    const faqLinks = screen.getAllByRole('link', { name: /FAQ/i });
    expect(faqLinks[0]).toHaveAttribute('href', '/support/faq');
    expect(screen.getByRole('link', { name: /^Guides/i })).toHaveAttribute('href', '/support/guides');
    expect(screen.getByRole('link', { name: /^Contact Us/i })).toHaveAttribute('href', '/support/contact');
    expect(screen.getByRole('link', { name: /^Verify a Worker/i })).toHaveAttribute('href', '/support/verify-worker');
  });

  it('renders Popular Questions section with correct 5 FAQ items', () => {
    renderWithRouter(<SupportLandingPage />);
    expect(screen.getByText('Popular Questions')).toBeInTheDocument();
    // Per AC1: specific 5 FAQs
    expect(screen.getByText('How do I register for OSLSR?')).toBeInTheDocument();
    expect(screen.getByText('What is the NIN and where do I get one?')).toBeInTheDocument();
    expect(screen.getByText('Is registration free?')).toBeInTheDocument();
    expect(screen.getByText('How long does verification take?')).toBeInTheDocument();
    expect(screen.getByText('Can I update my information after registering?')).toBeInTheDocument();
  });

  it('renders See all FAQs link', () => {
    renderWithRouter(<SupportLandingPage />);
    const link = screen.getByRole('link', { name: /See all FAQs/i });
    expect(link).toHaveAttribute('href', '/support/faq');
  });

  it('renders Still Need Help CTA section', () => {
    renderWithRouter(<SupportLandingPage />);
    expect(screen.getByText('Still Need Help?')).toBeInTheDocument();
    const contactLink = screen.getByRole('link', { name: /Contact Support/i });
    expect(contactLink).toHaveAttribute('href', '/support/contact');
  });
});
