// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import ParticipateLandingPage from '../pages/ParticipateLandingPage';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ParticipateLandingPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<ParticipateLandingPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent("Join Oyo State's Official Workforce Registry");
  });

  it('renders the I Am A section with both pathway cards', () => {
    renderWithRouter(<ParticipateLandingPage />);
    expect(screen.getByRole('heading', { name: /I Am A\.\.\./i })).toBeInTheDocument();
    expect(screen.getByText('Skilled Worker')).toBeInTheDocument();
    expect(screen.getByText('Employer')).toBeInTheDocument();
  });

  it('renders Worker pathway card with correct content', () => {
    renderWithRouter(<ParticipateLandingPage />);
    expect(screen.getByText('Register your skills and get discovered by employers looking for your expertise.')).toBeInTheDocument();
    expect(screen.getByText('Get a government-verified badge')).toBeInTheDocument();
    expect(screen.getByText('Appear in the public skills marketplace')).toBeInTheDocument();
    expect(screen.getByText('Priority access to training programs')).toBeInTheDocument();
  });

  it('renders Employer pathway card with correct content', () => {
    renderWithRouter(<ParticipateLandingPage />);
    expect(screen.getByText('Find verified skilled workers in your local area for your business needs.')).toBeInTheDocument();
    expect(screen.getByText('Search verified local talent')).toBeInTheDocument();
    expect(screen.getByText('View worker profiles and skills')).toBeInTheDocument();
    expect(screen.getByText('Connect directly with workers')).toBeInTheDocument();
  });

  it('renders Register My Skills link with correct href', () => {
    renderWithRouter(<ParticipateLandingPage />);
    const link = screen.getByRole('link', { name: /Register My Skills/i });
    expect(link).toHaveAttribute('href', '/participate/workers');
  });

  it('renders Find Workers link with correct href', () => {
    renderWithRouter(<ParticipateLandingPage />);
    const link = screen.getByRole('link', { name: /Find Workers/i });
    expect(link).toHaveAttribute('href', '/participate/employers');
  });

  it('renders helper links section', () => {
    renderWithRouter(<ParticipateLandingPage />);
    expect(screen.getByText('Not sure where to start?')).toBeInTheDocument();
    expect(screen.getByText('Learn How It Works')).toBeInTheDocument();
    expect(screen.getByText('Read Our Privacy Policy')).toBeInTheDocument();
    expect(screen.getByText('Contact Support')).toBeInTheDocument();
  });

  it('renders helper links with correct hrefs', () => {
    renderWithRouter(<ParticipateLandingPage />);
    expect(screen.getByRole('link', { name: /Learn How It Works/i })).toHaveAttribute('href', '/about/how-it-works');
    expect(screen.getByRole('link', { name: /Read Our Privacy Policy/i })).toHaveAttribute('href', '/about/privacy');
    expect(screen.getByRole('link', { name: /Contact Support/i })).toHaveAttribute('href', '/support');
  });
});
