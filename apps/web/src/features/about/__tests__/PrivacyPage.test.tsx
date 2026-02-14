// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import PrivacyPage from '../pages/PrivacyPage';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PrivacyPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<PrivacyPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Privacy & Data Protection');
  });

  it('displays TL;DR summary box', () => {
    renderWithRouter(<PrivacyPage />);
    expect(screen.getByText(/TL;DR - The Quick Version/i)).toBeInTheDocument();
    expect(screen.getByText(/comply with the Nigeria Data Protection Act/i)).toBeInTheDocument();
  });

  it('displays "What Data We Collect" section with 3 categories', () => {
    renderWithRouter(<PrivacyPage />);
    expect(screen.getByText(/What Data We Collect/i)).toBeInTheDocument();
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText('Work & Skills Information')).toBeInTheDocument();
    expect(screen.getByText('Optional Marketplace Information')).toBeInTheDocument();
  });

  it('displays "How We Use Your Data" section', () => {
    renderWithRouter(<PrivacyPage />);
    expect(screen.getByText(/How We Use Your Data/i)).toBeInTheDocument();
    expect(screen.getByText(/Workforce planning and policy development/i)).toBeInTheDocument();
  });

  it('displays "What We Don\'t Do" section with NEVER statements', () => {
    renderWithRouter(<PrivacyPage />);
    expect(screen.getByText(/What We Don't Do/i)).toBeInTheDocument();
    expect(screen.getByText(/We will NEVER/i)).toBeInTheDocument();
    expect(screen.getByText(/Sell your personal data/i)).toBeInTheDocument();
  });

  it('displays "Data Protection Measures" section', () => {
    renderWithRouter(<PrivacyPage />);
    expect(screen.getByText(/Data Protection Measures/i)).toBeInTheDocument();
    expect(screen.getByText('Encryption')).toBeInTheDocument();
    expect(screen.getByText('Access Control')).toBeInTheDocument();
    expect(screen.getByText('Security Testing')).toBeInTheDocument();
    expect(screen.getByText('Audit Logging')).toBeInTheDocument();
  });

  it('displays "Your Rights Under NDPA" section with 5 rights', () => {
    renderWithRouter(<PrivacyPage />);
    expect(screen.getByText(/Your Rights Under NDPA/i)).toBeInTheDocument();
    expect(screen.getByText('Right to Access')).toBeInTheDocument();
    expect(screen.getByText('Right to Rectification')).toBeInTheDocument();
    expect(screen.getByText('Right to Erasure')).toBeInTheDocument();
    expect(screen.getByText('Right to Restriction')).toBeInTheDocument();
    expect(screen.getByText('Right to Object')).toBeInTheDocument();
  });

  it('displays "Data Retention" section', () => {
    renderWithRouter(<PrivacyPage />);
    expect(screen.getByText(/Data Retention/i)).toBeInTheDocument();
    expect(screen.getByText(/Active accounts/i)).toBeInTheDocument();
    expect(screen.getByText(/Deleted accounts/i)).toBeInTheDocument();
  });

  it('displays DPO contact section', () => {
    renderWithRouter(<PrivacyPage />);
    expect(screen.getByText(/Contact the Data Protection Officer/i)).toBeInTheDocument();
    const dpoLink = screen.getByRole('link', { name: /Contact DPO/i });
    expect(dpoLink).toHaveAttribute('href', 'mailto:dpo@oyostate.gov.ng');
  });

  it('displays last updated date', () => {
    renderWithRouter(<PrivacyPage />);
    expect(screen.getByText(/Last Updated: January 2026/i)).toBeInTheDocument();
  });
});
