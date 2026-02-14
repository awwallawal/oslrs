// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import GuideRegisterPage from '../../pages/guides/GuideRegisterPage';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('GuideRegisterPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<GuideRegisterPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('How to Register');
  });

  it('renders estimated time', () => {
    renderWithRouter(<GuideRegisterPage />);
    expect(screen.getByText(/5-10 minutes/)).toBeInTheDocument();
  });

  it('renders prerequisites section', () => {
    renderWithRouter(<GuideRegisterPage />);
    expect(screen.getByText('Before You Start')).toBeInTheDocument();
    // Check for prerequisites text - use more specific text to avoid matching step descriptions
    expect(screen.getByText('National Identification Number (NIN)')).toBeInTheDocument();
    expect(screen.getByText('Valid email address or phone number')).toBeInTheDocument();
  });

  it('renders 6 steps', () => {
    renderWithRouter(<GuideRegisterPage />);
    expect(screen.getByText('Visit the registration page')).toBeInTheDocument();
    expect(screen.getByText('Enter your NIN')).toBeInTheDocument();
    expect(screen.getByText('Verify your identity')).toBeInTheDocument();
    expect(screen.getByText('Create account credentials')).toBeInTheDocument();
    expect(screen.getByText('Verify your email/phone')).toBeInTheDocument();
    expect(screen.getByText('Complete your profile')).toBeInTheDocument();
  });

  it('renders tips section', () => {
    renderWithRouter(<GuideRegisterPage />);
    expect(screen.getByText('Tips for Success')).toBeInTheDocument();
    expect(screen.getByText('Prepare your NIN')).toBeInTheDocument();
    expect(screen.getByText('Registration is FREE')).toBeInTheDocument();
  });

  it('renders Back to Guides link', () => {
    renderWithRouter(<GuideRegisterPage />);
    const backLinks = screen.getAllByRole('link', { name: /Back to.*Guides/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    expect(backLinks[0]).toHaveAttribute('href', '/support/guides');
  });

  it('renders related guides section', () => {
    renderWithRouter(<GuideRegisterPage />);
    expect(screen.getByText('Related Guides')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /How to Complete the Survey/i })).toHaveAttribute('href', '/support/guides/survey');
    expect(screen.getByRole('link', { name: /How to Opt Into the Marketplace/i })).toHaveAttribute('href', '/support/guides/marketplace-opt-in');
  });
});
