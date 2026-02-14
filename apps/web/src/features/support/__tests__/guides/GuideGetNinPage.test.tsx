// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import GuideGetNinPage from '../../pages/guides/GuideGetNinPage';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('GuideGetNinPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<GuideGetNinPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('How to Get a NIN');
  });

  it('renders estimated time', () => {
    renderWithRouter(<GuideGetNinPage />);
    expect(screen.getByText(/30-60 minutes at NIMC center/)).toBeInTheDocument();
  });

  it('renders What is NIN section', () => {
    renderWithRouter(<GuideGetNinPage />);
    expect(screen.getByText('What is a NIN?')).toBeInTheDocument();
    expect(screen.getByText(/National Identification Number/)).toBeInTheDocument();
  });

  it('renders 5 steps', () => {
    renderWithRouter(<GuideGetNinPage />);
    expect(screen.getByText('Find your nearest NIMC enrollment center')).toBeInTheDocument();
    expect(screen.getByText('Gather required documents')).toBeInTheDocument();
    expect(screen.getByText('Visit the center during operating hours')).toBeInTheDocument();
    expect(screen.getByText('Complete biometric enrollment')).toBeInTheDocument();
    expect(screen.getByText('Receive your NIN slip')).toBeInTheDocument();
  });

  it('renders NIMC external link button', () => {
    renderWithRouter(<GuideGetNinPage />);
    const nimcLink = screen.getByRole('link', { name: /Find NIMC Centers/i });
    expect(nimcLink).toBeInTheDocument();
    expect(nimcLink).toHaveAttribute('href', 'https://nimc.gov.ng/enrollment-centers/');
    expect(nimcLink).toHaveAttribute('target', '_blank');
  });

  it('renders tips section', () => {
    renderWithRouter(<GuideGetNinPage />);
    expect(screen.getByText('NIN enrollment is FREE')).toBeInTheDocument();
    expect(screen.getByText('Already have a NIN?')).toBeInTheDocument();
    expect(screen.getByText('Required for OSLSR')).toBeInTheDocument();
  });

  it('renders Back to Guides link', () => {
    renderWithRouter(<GuideGetNinPage />);
    const backLinks = screen.getAllByRole('link', { name: /Back to.*Guides/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    expect(backLinks[0]).toHaveAttribute('href', '/support/guides');
  });

  it('renders related guides section with Register link', () => {
    renderWithRouter(<GuideGetNinPage />);
    expect(screen.getByText('Related Guides')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /How to Register/i })).toHaveAttribute('href', '/support/guides/register');
  });
});
