// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import VerifyWorkerPage from '../pages/VerifyWorkerPage';

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
    expect(screen.getByText(/Check if a worker is registered and verified/)).toBeInTheDocument();
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

  it('displays verification positive points', () => {
    renderWithRouter(<VerifyWorkerPage />);
    expect(screen.getByText('Worker is registered in the OSLSR system')).toBeInTheDocument();
    expect(screen.getByText('NIN (National Identification Number) has been validated')).toBeInTheDocument();
    expect(screen.getByText("Worker's identity has been confirmed by the government")).toBeInTheDocument();
  });

  it('displays verification disclaimers', () => {
    renderWithRouter(<VerifyWorkerPage />);
    expect(screen.getByText("Worker's skill level or proficiency")).toBeInTheDocument();
    expect(screen.getByText('Quality of previous work')).toBeInTheDocument();
    expect(screen.getByText('Employment history or references')).toBeInTheDocument();
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
