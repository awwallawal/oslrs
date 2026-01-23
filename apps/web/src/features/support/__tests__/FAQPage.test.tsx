// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import FAQPage from '../pages/FAQPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('FAQPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<FAQPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Frequently Asked Questions');
  });

  it('renders search box placeholder', () => {
    renderWithRouter(<FAQPage />);
    expect(screen.getByPlaceholderText(/Search FAQs/i)).toBeInTheDocument();
  });

  it('renders all category tabs', () => {
    renderWithRouter(<FAQPage />);
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Registration' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Survey' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Verification' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Marketplace' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Technical' })).toBeInTheDocument();
  });

  it('shows all FAQ sections when All tab is selected', () => {
    renderWithRouter(<FAQPage />);
    // All tab should be selected by default
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    // Should show multiple category headings
    expect(screen.getByRole('heading', { name: 'Registration' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Survey' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verification' })).toBeInTheDocument();
  });

  it('filters FAQ sections when category tab is clicked', () => {
    renderWithRouter(<FAQPage />);
    // Click Registration tab
    fireEvent.click(screen.getByRole('tab', { name: 'Registration' }));
    // Registration section should be visible
    expect(screen.getByText('How do I register for OSLSR?')).toBeInTheDocument();
    // Other sections should be hidden
    expect(screen.queryByRole('heading', { name: 'Survey' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Technical' })).not.toBeInTheDocument();
  });

  it('renders Registration FAQ questions', () => {
    renderWithRouter(<FAQPage />);
    expect(screen.getByText('How do I register for OSLSR?')).toBeInTheDocument();
    expect(screen.getByText('Is registration free?')).toBeInTheDocument();
    expect(screen.getByText('What is the NIN and where do I get one?')).toBeInTheDocument();
    expect(screen.getByText('Do I need to upload a photo?')).toBeInTheDocument();
    expect(screen.getByText('Can I register if I am currently unemployed?')).toBeInTheDocument();
  });

  it('renders Survey FAQ questions', () => {
    renderWithRouter(<FAQPage />);
    expect(screen.getByText('How long does the survey take?')).toBeInTheDocument();
    expect(screen.getByText('Can I save and continue later?')).toBeInTheDocument();
    expect(screen.getByText('What information does the survey ask for?')).toBeInTheDocument();
  });

  it('renders Contact Support CTA', () => {
    renderWithRouter(<FAQPage />);
    expect(screen.getByText("Can't Find Your Answer?")).toBeInTheDocument();
    const contactLink = screen.getByRole('link', { name: /Contact Support/i });
    expect(contactLink).toHaveAttribute('href', '/support/contact');
  });
});
