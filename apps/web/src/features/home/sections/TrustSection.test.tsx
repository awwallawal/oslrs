// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { TrustSection } from './TrustSection';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('TrustSection', () => {
  it('renders section heading', () => {
    renderWithRouter(<TrustSection />);
    expect(screen.getByRole('heading', { name: /trust & data protection/i })).toBeInTheDocument();
  });

  it('renders Oyo State Seal image', () => {
    renderWithRouter(<TrustSection />);
    const seal = screen.getByAltText(/oyo state seal/i);
    expect(seal).toBeInTheDocument();
    expect(seal).toHaveAttribute('src', '/images/oyo-coat-of-arms.png');
  });

  it('does NOT render Ministry Logo (removed per Story 9.3)', () => {
    renderWithRouter(<TrustSection />);
    const ministryLogo = screen.queryByAltText(/ministry of trade/i);
    expect(ministryLogo).not.toBeInTheDocument();
  });

  it('renders NDPA Compliant badge', () => {
    renderWithRouter(<TrustSection />);
    expect(screen.getByText(/ndpa compliant/i)).toBeInTheDocument();
  });

  it('renders privacy policy link', () => {
    renderWithRouter(<TrustSection />);
    const privacyLink = screen.getByRole('link', { name: /read our privacy policy/i });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute('href', '/about/privacy');
  });
});
