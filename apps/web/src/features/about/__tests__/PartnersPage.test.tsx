// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import PartnersPage from '../pages/PartnersPage';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PartnersPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<PartnersPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Partners');
  });

  it('displays introductory text', () => {
    renderWithRouter(<PartnersPage />);
    expect(screen.getByText(/Organizations Supporting the OSLSR/i)).toBeInTheDocument();
    expect(screen.getByText(/collaboration between government agencies/i)).toBeInTheDocument();
  });

  it('displays Government Agencies section with 3 partners', () => {
    renderWithRouter(<PartnersPage />);
    expect(screen.getByText('Government Agencies')).toBeInTheDocument();
    expect(screen.getByText('Ministry of Labour & Productivity')).toBeInTheDocument();
    expect(screen.getByText('Oyo State Bureau of Statistics')).toBeInTheDocument();
    expect(screen.getByText('National Bureau of Statistics (Advisory)')).toBeInTheDocument();
  });

  it('displays Industry Associations section with 2 partners', () => {
    renderWithRouter(<PartnersPage />);
    expect(screen.getByText('Industry Associations')).toBeInTheDocument();
    expect(screen.getByText('Oyo State Chamber of Commerce')).toBeInTheDocument();
    expect(screen.getByText('Association of Nigerian Artisans')).toBeInTheDocument();
  });

  it('displays "Become a Partner" CTA section', () => {
    renderWithRouter(<PartnersPage />);
    expect(screen.getByText(/Become a Partner/i)).toBeInTheDocument();
    const contactLink = screen.getByRole('link', { name: /Contact Us/i });
    expect(contactLink).toHaveAttribute('href', 'mailto:partnerships@oyostate.gov.ng');
  });

  it('displays partnership email address', () => {
    renderWithRouter(<PartnersPage />);
    expect(screen.getByText('partnerships@oyostate.gov.ng')).toBeInTheDocument();
  });
});
