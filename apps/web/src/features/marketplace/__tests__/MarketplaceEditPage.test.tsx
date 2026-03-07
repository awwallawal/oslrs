// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

expect.extend(matchers);

// ── Mock state ──────────────────────────────────────────────────────────────

let mockValidateReturn: {
  data: any;
  isLoading: boolean;
};

let mockSubmitMutation: {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
};

// ── Mock modules ────────────────────────────────────────────────────────────

vi.mock('../hooks/useMarketplace', () => ({
  useValidateEditToken: () => mockValidateReturn,
  useSubmitProfileEdit: () => mockSubmitMutation,
  marketplaceKeys: {
    all: ['marketplace'],
    editToken: (token: string) => ['marketplace', 'editToken', token],
  },
}));

// ── Import SUT ──────────────────────────────────────────────────────────────

import MarketplaceEditPage from '../pages/MarketplaceEditPage';

// ── Helpers ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

function renderPage(token: string = VALID_TOKEN) {
  return render(
    <MemoryRouter initialEntries={[`/marketplace/edit/${token}`]}>
      <Routes>
        <Route path="marketplace/edit/:token" element={<MarketplaceEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MarketplaceEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateReturn = {
      data: null,
      isLoading: true,
    };
    mockSubmitMutation = {
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    };
  });

  afterEach(cleanup);

  it('should show loading spinner while validating token', () => {
    renderPage();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('should render edit form with pre-populated fields for valid token', () => {
    mockValidateReturn = {
      data: { valid: true, bio: 'Expert plumber', portfolioUrl: 'https://example.com' },
      isLoading: false,
    };

    renderPage();

    const bioInput = screen.getByTestId('bio-input') as HTMLTextAreaElement;
    const portfolioInput = screen.getByTestId('portfolio-input') as HTMLInputElement;
    expect(bioInput.value).toBe('Expert plumber');
    expect(portfolioInput.value).toBe('https://example.com');
  });

  it('should show expiry message for expired token', () => {
    mockValidateReturn = {
      data: { valid: false, reason: 'expired' },
      isLoading: false,
    };

    renderPage();

    expect(screen.getByTestId('token-invalid')).toBeInTheDocument();
    expect(screen.getByText('This link has expired or has already been used')).toBeInTheDocument();
    expect(screen.getByTestId('request-new-token-link')).toBeInTheDocument();
  });

  it('should show invalid message for unknown token', () => {
    mockValidateReturn = {
      data: { valid: false, reason: 'invalid' },
      isLoading: false,
    };

    renderPage();

    expect(screen.getByTestId('token-invalid')).toBeInTheDocument();
  });

  it('should update bio character counter live', () => {
    mockValidateReturn = {
      data: { valid: true, bio: '', portfolioUrl: null },
      isLoading: false,
    };

    renderPage();

    const bioInput = screen.getByTestId('bio-input');
    fireEvent.change(bioInput, { target: { value: 'Hello world' } });

    expect(screen.getByTestId('bio-counter')).toHaveTextContent('11/150');
  });

  it('should turn counter red when bio approaches limit', () => {
    mockValidateReturn = {
      data: { valid: true, bio: '', portfolioUrl: null },
      isLoading: false,
    };

    renderPage();

    const bioInput = screen.getByTestId('bio-input');
    fireEvent.change(bioInput, { target: { value: 'a'.repeat(145) } });

    const counter = screen.getByTestId('bio-counter');
    expect(counter).toHaveTextContent('145/150');
    expect(counter.className).toContain('text-red-500');
  });

  it('should truncate bio at 150 characters', () => {
    mockValidateReturn = {
      data: { valid: true, bio: '', portfolioUrl: null },
      isLoading: false,
    };

    renderPage();

    const bioInput = screen.getByTestId('bio-input') as HTMLTextAreaElement;
    fireEvent.change(bioInput, { target: { value: 'a'.repeat(200) } });

    expect(bioInput.value).toBe('a'.repeat(150));
  });

  it('should not call mutation when URL is invalid', () => {
    mockValidateReturn = {
      data: { valid: true, bio: 'Bio', portfolioUrl: 'not-a-url' },
      isLoading: false,
    };

    renderPage();

    // Pre-populated with invalid URL from mock data — clicking save triggers validation
    const saveButton = screen.getByTestId('save-button');
    fireEvent.click(saveButton);

    // Mutation should NOT be called because validation failed
    expect(mockSubmitMutation.mutate).not.toHaveBeenCalled();
  });

  it('should call mutation on valid submit', () => {
    mockValidateReturn = {
      data: { valid: true, bio: 'Old bio', portfolioUrl: null },
      isLoading: false,
    };

    renderPage();

    const bioInput = screen.getByTestId('bio-input');
    fireEvent.change(bioInput, { target: { value: 'New bio' } });
    fireEvent.click(screen.getByTestId('save-button'));

    expect(mockSubmitMutation.mutate).toHaveBeenCalledWith({
      editToken: VALID_TOKEN,
      bio: 'New bio',
      portfolioUrl: null,
    });
  });

  it('should show success confirmation after successful submit', () => {
    mockValidateReturn = {
      data: { valid: true, bio: 'Bio', portfolioUrl: null },
      isLoading: false,
    };
    mockSubmitMutation = {
      ...mockSubmitMutation,
      isSuccess: true,
    };

    renderPage();

    expect(screen.getByTestId('edit-success')).toBeInTheDocument();
    expect(screen.getByText('Your profile has been updated!')).toBeInTheDocument();
  });

  it('should show error message on submit failure', () => {
    mockValidateReturn = {
      data: { valid: true, bio: 'Bio', portfolioUrl: null },
      isLoading: false,
    };
    mockSubmitMutation = {
      ...mockSubmitMutation,
      isError: true,
      error: new Error('Token expired'),
    };

    renderPage();

    expect(screen.getByTestId('submit-error')).toBeInTheDocument();
  });

  it('should disable form fields while submitting', () => {
    mockValidateReturn = {
      data: { valid: true, bio: 'Bio', portfolioUrl: null },
      isLoading: false,
    };
    mockSubmitMutation = {
      ...mockSubmitMutation,
      isPending: true,
    };

    renderPage();

    expect(screen.getByTestId('save-button')).toBeDisabled();
  });
});
