// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import LeadershipPage from '../pages/LeadershipPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('LeadershipPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<LeadershipPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Leadership');
  });

  it('displays "The Team Behind OSLSR" section', () => {
    renderWithRouter(<LeadershipPage />);
    expect(screen.getByText(/The Team Behind OSLSR/i)).toBeInTheDocument();
  });

  it('displays Commissioner profile card', () => {
    renderWithRouter(<LeadershipPage />);
    expect(screen.getByText(/Hon\. \[Name\]/i)).toBeInTheDocument();
    expect(screen.getByText(/Commissioner for Labour & Productivity/i)).toBeInTheDocument();
    // Check for quote
    expect(screen.getByText(/OSLSR represents our commitment/i)).toBeInTheDocument();
  });

  it('displays Project Director profile card', () => {
    renderWithRouter(<LeadershipPage />);
    expect(screen.getByText('Project Director, OSLSR')).toBeInTheDocument();
    expect(screen.getByText(/day-to-day implementation/i)).toBeInTheDocument();
  });

  it('displays Government Oversight section with seals', () => {
    renderWithRouter(<LeadershipPage />);
    expect(screen.getByText(/Government Oversight/i)).toBeInTheDocument();
    expect(screen.getByAltText(/Oyo State Coat of Arms/i)).toBeInTheDocument();
    expect(screen.getByAltText(/Ministry of Labour & Productivity/i)).toBeInTheDocument();
  });

  it('displays Contact the Team section', () => {
    renderWithRouter(<LeadershipPage />);
    expect(screen.getByText(/Contact the Team/i)).toBeInTheDocument();
    const emailLink = screen.getByRole('link', { name: /oslsr@oyostate\.gov\.ng/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:oslsr@oyostate.gov.ng');
  });

  it('displays office address', () => {
    renderWithRouter(<LeadershipPage />);
    // Ministry name appears multiple times (profile titles, oversight section, address)
    expect(screen.getAllByText(/Ministry of Labour & Productivity/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/State Secretariat/i)).toBeInTheDocument();
    expect(screen.getByText(/Ibadan, Oyo State/i)).toBeInTheDocument();
  });
});
