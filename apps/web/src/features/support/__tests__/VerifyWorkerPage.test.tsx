// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import VerifyWorkerPage from '../pages/VerifyWorkerPage';
import {
  GOVERNMENT_VERIFICATION_MEANS,
  GOVERNMENT_VERIFICATION_DOES_NOT_MEAN,
  FORBIDDEN_IDENTITY_CLAIMS,
} from '../../../lib/trust-claims';

afterEach(() => {
  cleanup();
});

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

expect.extend(matchers);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('VerifyWorkerPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders hero section with correct H1', () => {
    renderWithRouter(<VerifyWorkerPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Verify a Worker');
  });

  it('renders subheading explaining the purpose', () => {
    renderWithRouter(<VerifyWorkerPage />);
    expect(screen.getByText(/Check whether a worker is registered/)).toBeInTheDocument();
  });

  it('renders Verification Lookup section with input', () => {
    renderWithRouter(<VerifyWorkerPage />);
    expect(screen.getByText('Verification Lookup')).toBeInTheDocument();
    expect(screen.getByLabelText(/Enter Verification Code/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/OSLSR-ABCD-1234/)).toBeInTheDocument();
  });

  it('renders Verify button', () => {
    renderWithRouter(<VerifyWorkerPage />);
    expect(screen.getByRole('button', { name: /Verify/i })).toBeInTheDocument();
  });

  it('shows error when submitting empty code', () => {
    renderWithRouter(<VerifyWorkerPage />);
    const submitButton = screen.getByRole('button', { name: /Verify/i });
    fireEvent.click(submitButton);
    expect(screen.getByText('Please enter a verification code')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to verify-staff page on valid submission', () => {
    renderWithRouter(<VerifyWorkerPage />);
    const input = screen.getByLabelText(/Enter Verification Code/i);
    const submitButton = screen.getByRole('button', { name: /Verify/i });

    fireEvent.change(input, { target: { value: 'OSLSR-TEST-1234' } });
    fireEvent.click(submitButton);

    expect(mockNavigate).toHaveBeenCalledWith('/verify-staff/OSLSR-TEST-1234');
  });

  it('renders What Does Verification Mean section', () => {
    renderWithRouter(<VerifyWorkerPage />);
    expect(screen.getByText('What Does Verification Mean?')).toBeInTheDocument();
    expect(screen.getByText('What Verification Confirms')).toBeInTheDocument();
    expect(screen.getByText('What It Does NOT Confirm')).toBeInTheDocument();
  });

  /**
   * ⚠️ [AI-Review][High] 2026-09-09 (Story 13-58) — THESE TESTS USED TO PIN THE
   * FALSE COPY. They asserted, word for word:
   *
   *   'NIN (National Identification Number) has been validated'
   *   "Worker's identity has been confirmed by the government"
   *
   * Neither is true — NIN validation is FORMAT-ONLY and there is no NIMC path —
   * and `GovernmentVerifiedBadge` had already been corrected away from exactly
   * that claim on 2026-08-18. So the lie was not merely present on a public page,
   * it was GUARDED: a green suite made it look deliberate, and anyone who fixed
   * the page would have been met by a failing test telling them to put it back.
   *
   * Both lists now render from `lib/trust-claims.ts`, so these assert the
   * canonical claims rather than a local copy of them.
   */
  it('displays verification positive points', () => {
    renderWithRouter(<VerifyWorkerPage />);
    for (const claim of GOVERNMENT_VERIFICATION_MEANS) {
      expect(screen.getByText(claim)).toBeInTheDocument();
    }
  });

  it('displays verification disclaimers', () => {
    renderWithRouter(<VerifyWorkerPage />);
    for (const claim of GOVERNMENT_VERIFICATION_DOES_NOT_MEAN) {
      expect(screen.getByText(claim)).toBeInTheDocument();
    }
  });

  /** R1 — the page must not claim an identity check anywhere in its copy. */
  it('makes no identity claim the system cannot back (R1)', () => {
    const { container } = renderWithRouter(<VerifyWorkerPage />);

    for (const { pattern, why } of FORBIDDEN_IDENTITY_CLAIMS) {
      expect(pattern.test(container.textContent ?? ''), why).toBe(false);
    }
  });

  it('renders Important Reminder callout', () => {
    renderWithRouter(<VerifyWorkerPage />);
    expect(screen.getByText('Important Reminder')).toBeInTheDocument();
    expect(screen.getByText(/Always interview and assess workers/)).toBeInTheDocument();
  });

  it('renders Need Help section with FAQ and Contact links', () => {
    renderWithRouter(<VerifyWorkerPage />);
    expect(screen.getByText('Need Help?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View FAQ/i })).toHaveAttribute('href', '/support/faq');
    expect(screen.getByRole('link', { name: /Contact Support/i })).toHaveAttribute('href', '/support/contact');
  });
});
