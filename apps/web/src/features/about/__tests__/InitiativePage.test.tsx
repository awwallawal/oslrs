// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import InitiativePage from '../pages/InitiativePage';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('InitiativePage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<InitiativePage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('The Initiative');
  });

  it('displays "The Problem We\'re Solving" section', () => {
    renderWithRouter(<InitiativePage />);
    expect(screen.getByText(/The Problem We're Solving/i)).toBeInTheDocument();
    expect(screen.getByText(/workforce planning without accurate data/i)).toBeInTheDocument();
  });

  it('displays "How Your Data Helps" section with 5 benefit cards', () => {
    renderWithRouter(<InitiativePage />);
    expect(screen.getByText(/How Your Data Helps/i)).toBeInTheDocument();
    expect(screen.getByText('Policy Planning')).toBeInTheDocument();
    expect(screen.getByText('Skills Training')).toBeInTheDocument();
    expect(screen.getByText('Job Creation')).toBeInTheDocument();
    expect(screen.getByText('Investment Attraction')).toBeInTheDocument();
    expect(screen.getByText('Program Evaluation')).toBeInTheDocument();
  });

  it('displays "A Living Registry" section', () => {
    renderWithRouter(<InitiativePage />);
    expect(screen.getByText(/A Living Registry/i)).toBeInTheDocument();
    expect(screen.getByText(/continuously updated database/i)).toBeInTheDocument();
  });

  it('renders CTA section with register link', () => {
    renderWithRouter(<InitiativePage />);
    expect(screen.getByText(/Ready to Contribute/i)).toBeInTheDocument();
    const registerLink = screen.getByRole('link', { name: /Register Now/i });
    expect(registerLink).toHaveAttribute('href', '/register');
  });
});
