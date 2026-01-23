// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import ContactPage from '../pages/ContactPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ContactPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<ContactPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Contact Us');
  });

  it('renders subheading', () => {
    renderWithRouter(<ContactPage />);
    expect(screen.getByText('Get in Touch with the OSLSR Team')).toBeInTheDocument();
  });

  it('renders General Inquiries section with contact details and response time', () => {
    renderWithRouter(<ContactPage />);
    expect(screen.getByText('General Inquiries')).toBeInTheDocument();
    expect(screen.getByText('support@oslsr.oyo.gov.ng')).toBeInTheDocument();
    expect(screen.getByText('Monday - Friday, 8:00 AM - 5:00 PM')).toBeInTheDocument();
    // Per AC4: response time added
    expect(screen.getByText('We typically respond within 2-3 business days')).toBeInTheDocument();
  });

  it('renders Technical Support section', () => {
    renderWithRouter(<ContactPage />);
    expect(screen.getByText('Technical Support')).toBeInTheDocument();
    expect(screen.getByText('tech@oslsr.oyo.gov.ng')).toBeInTheDocument();
  });

  it('renders Data & Privacy Requests section', () => {
    renderWithRouter(<ContactPage />);
    expect(screen.getByText('Data & Privacy Requests')).toBeInTheDocument();
    expect(screen.getByText('dpo@oyostate.gov.ng')).toBeInTheDocument();
  });

  it('renders Partnerships & Media section', () => {
    renderWithRouter(<ContactPage />);
    expect(screen.getByText('Partnerships & Media')).toBeInTheDocument();
    expect(screen.getByText('partnerships@oyostate.gov.ng')).toBeInTheDocument();
  });

  it('renders Report Abuse callout with warning', () => {
    renderWithRouter(<ContactPage />);
    expect(screen.getByText('Report Abuse or Fraud')).toBeInTheDocument();
    expect(screen.getByText(/OSLSR registration is completely FREE/)).toBeInTheDocument();
    expect(screen.getByText('report@oslsr.oyo.gov.ng')).toBeInTheDocument();
  });

  it('renders Office Location section', () => {
    renderWithRouter(<ContactPage />);
    expect(screen.getByText('Office Location')).toBeInTheDocument();
    expect(screen.getByText('Ministry of Labour & Productivity')).toBeInTheDocument();
    expect(screen.getByText('Ibadan, Oyo State')).toBeInTheDocument();
    expect(screen.getByText('Map coming soon')).toBeInTheDocument();
  });

  it('renders Before You Contact Us quick links', () => {
    renderWithRouter(<ContactPage />);
    expect(screen.getByText('Before You Contact Us')).toBeInTheDocument();
    expect(screen.getByText('Check FAQ')).toBeInTheDocument();
    expect(screen.getByText('Read Guides')).toBeInTheDocument();
  });

  it('renders email links with correct mailto hrefs', () => {
    renderWithRouter(<ContactPage />);
    expect(screen.getByRole('link', { name: 'support@oslsr.oyo.gov.ng' })).toHaveAttribute('href', 'mailto:support@oslsr.oyo.gov.ng');
    expect(screen.getByRole('link', { name: 'tech@oslsr.oyo.gov.ng' })).toHaveAttribute('href', 'mailto:tech@oslsr.oyo.gov.ng');
  });
});
