// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import GuideVerifyWorkerPage from '../../pages/guides/GuideVerifyWorkerPage';
import {
  GOVERNMENT_VERIFICATION_MEANS,
  GOVERNMENT_VERIFICATION_DOES_NOT_MEAN,
  FORBIDDEN_IDENTITY_CLAIMS,
} from '../../../../lib/trust-claims';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('GuideVerifyWorkerPage', () => {
  it('renders hero section with correct H1', () => {
    renderWithRouter(<GuideVerifyWorkerPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('How to Verify a Worker');
  });

  it('renders estimated time', () => {
    renderWithRouter(<GuideVerifyWorkerPage />);
    expect(screen.getByText(/1 minute/)).toBeInTheDocument();
  });

  /**
   * ⚠️ [AI-Review][High] 2026-09-09 (Story 13-58) — the list this asserts used to
   * contain "NIN has been validated" and "Identity verified by government", both
   * false, on a public page under a green tick. It now renders the canonical
   * claims from `lib/trust-claims.ts`.
   */
  it('renders What Verification Confirms section', () => {
    renderWithRouter(<GuideVerifyWorkerPage />);
    expect(screen.getByText('What Verification Confirms')).toBeInTheDocument();
    expect(screen.getByText('What It DOES Confirm')).toBeInTheDocument();
    expect(screen.getByText('What It Does NOT Confirm')).toBeInTheDocument();
    for (const claim of GOVERNMENT_VERIFICATION_MEANS) {
      expect(screen.getByText(claim)).toBeInTheDocument();
    }
    for (const claim of GOVERNMENT_VERIFICATION_DOES_NOT_MEAN) {
      expect(screen.getByText(claim)).toBeInTheDocument();
    }
  });

  /** R1 — no identity claim anywhere in this guide's copy, steps included. */
  it('makes no identity claim the system cannot back (R1)', () => {
    const { container } = renderWithRouter(<GuideVerifyWorkerPage />);

    for (const { pattern, why } of FORBIDDEN_IDENTITY_CLAIMS) {
      expect(pattern.test(container.textContent ?? ''), why).toBe(false);
    }
  });

  it('renders 5 steps', () => {
    renderWithRouter(<GuideVerifyWorkerPage />);
    expect(screen.getByText(/Obtain the worker's verification code/)).toBeInTheDocument();
    expect(screen.getByText('Go to the Verify Worker page')).toBeInTheDocument();
    expect(screen.getByText('Enter the verification code')).toBeInTheDocument();
    expect(screen.getByText('View verification results')).toBeInTheDocument();
    expect(screen.getByText('Understand what results mean')).toBeInTheDocument();
  });

  it('renders verification results explanation', () => {
    renderWithRouter(<GuideVerifyWorkerPage />);
    expect(screen.getByText('Understanding Verification Results')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Not Found')).toBeInTheDocument();
  });

  it('renders important reminders tips', () => {
    renderWithRouter(<GuideVerifyWorkerPage />);
    expect(screen.getByText('Important Reminders')).toBeInTheDocument();
    expect(screen.getByText('Verification is just one step')).toBeInTheDocument();
    expect(screen.getByText('Report suspicious activity')).toBeInTheDocument();
  });

  it('renders Back to Guides link', () => {
    renderWithRouter(<GuideVerifyWorkerPage />);
    const backLinks = screen.getAllByRole('link', { name: /Back to.*Guides/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
    expect(backLinks[0]).toHaveAttribute('href', '/support/guides');
  });

  it('renders related guides section', () => {
    renderWithRouter(<GuideVerifyWorkerPage />);
    expect(screen.getByText('Related Guides')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /How to Search the Marketplace/i })).toHaveAttribute('href', '/support/guides/search-marketplace');
  });

  it('renders Go to Verification Tool CTA', () => {
    renderWithRouter(<GuideVerifyWorkerPage />);
    expect(screen.getByRole('link', { name: /Go to Verification Tool/i })).toHaveAttribute('href', '/support/verify-worker');
  });
});
