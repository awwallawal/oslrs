// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import GuideSurveyPage from '../../pages/guides/GuideSurveyPage';

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('GuideSurveyPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<GuideSurveyPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('How to Complete the Survey');
  });

  it('renders estimated time', () => {
    renderWithRouter(<GuideSurveyPage />);
    expect(screen.getByText(/Estimated time: 10-15 minutes/)).toBeInTheDocument();
  });

  it('renders prerequisites section', () => {
    renderWithRouter(<GuideSurveyPage />);
    expect(screen.getByText('Before You Start')).toBeInTheDocument();
    expect(screen.getByText(/Completed OSLSR registration/)).toBeInTheDocument();
    expect(screen.getByText(/Device with internet connection/)).toBeInTheDocument();
  });

  it('renders 6 steps', () => {
    renderWithRouter(<GuideSurveyPage />);
    expect(screen.getByText('Log in to your account')).toBeInTheDocument();
    expect(screen.getByText('Navigate to the survey section')).toBeInTheDocument();
    expect(screen.getByText('Complete personal information')).toBeInTheDocument();
    expect(screen.getByText('Enter your skills and experience')).toBeInTheDocument();
    expect(screen.getByText('Answer employment history questions')).toBeInTheDocument();
    expect(screen.getByText('Save and submit')).toBeInTheDocument();
  });

  it('renders tips section', () => {
    renderWithRouter(<GuideSurveyPage />);
    expect(screen.getByText('Tips for Success')).toBeInTheDocument();
    expect(screen.getByText('Save your progress')).toBeInTheDocument();
    expect(screen.getByText('Offline mode available')).toBeInTheDocument();
  });

  it('renders Back to Guides link', () => {
    renderWithRouter(<GuideSurveyPage />);
    const backLinks = screen.getAllByRole('link', { name: /Back to.*Guides/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    expect(backLinks[0]).toHaveAttribute('href', '/support/guides');
  });

  it('renders related guides section', () => {
    renderWithRouter(<GuideSurveyPage />);
    expect(screen.getByText('Related Guides')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /How to Register/i })).toHaveAttribute('href', '/support/guides/register');
  });
});
