// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

expect.extend(matchers);

const { mockCompleteNin, mockDeferReminder } = vi.hoisted(() => ({
  mockCompleteNin: vi.fn(),
  mockDeferReminder: vi.fn(),
}));

vi.mock('../../api/wizard.api', () => ({
  completeNin: (...args: unknown[]) => mockCompleteNin(...args),
  deferReminder: (...args: unknown[]) => mockDeferReminder(...args),
}));

import CompleteNinPage from '../CompleteNinPage';
import { ApiError } from '../../../../lib/api-client';

function renderWithToken(token: string | null) {
  const path = token ? `/register/complete-nin?token=${token}` : '/register/complete-nin';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/register/complete-nin" element={<CompleteNinPage />} />
        <Route path="/register/complete" element={<div data-testid="redirected-complete">complete</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CompleteNinPage (Story 9-12 Task 7)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the NinHelpHint banner + NIN input + Save + remind-me-later affordances', () => {
    renderWithToken('valid-token-1');
    expect(screen.getByTestId('complete-nin-card')).toBeInTheDocument();
    expect(screen.getByTestId('nin-help-hint-banner')).toBeInTheDocument();
    expect(screen.getByTestId('complete-nin-input')).toBeInTheDocument();
    expect(screen.getByTestId('complete-nin-save')).toBeInTheDocument();
    expect(screen.getByTestId('complete-nin-defer')).toBeInTheDocument();
  });

  it('warns the user when the URL is missing the magic-link token', async () => {
    renderWithToken(null);
    expect(screen.getByTestId('complete-nin-token-missing')).toBeInTheDocument();
    // Save is still disabled because NIN is empty.
    expect(screen.getByTestId('complete-nin-save')).toBeDisabled();
  });

  it('disables Save until a valid 11-digit NIN is entered', async () => {
    renderWithToken('valid-token-1');
    const save = screen.getByTestId('complete-nin-save') as HTMLButtonElement;
    expect(save).toBeDisabled();

    const input = screen.getByTestId('complete-nin-input') as HTMLInputElement;
    await userEvent.type(input, '123');
    expect(save).toBeDisabled();

    await userEvent.type(input, '45678901');
    expect(save).not.toBeDisabled();
  });

  it('strips non-digit characters from NIN entry and caps at 11 chars', async () => {
    renderWithToken('valid-token-1');
    const input = screen.getByTestId('complete-nin-input') as HTMLInputElement;
    await userEvent.type(input, '12-34a567 8901extra');
    expect(input.value).toBe('12345678901');
  });

  it('redirects to /register/complete on successful save', async () => {
    mockCompleteNin.mockResolvedValueOnce({
      respondentId: 'r-1',
      source: 'public',
      alreadyPromoted: false,
    });
    renderWithToken('valid-token-1');
    await userEvent.type(screen.getByTestId('complete-nin-input'), '12345678901');
    await userEvent.click(screen.getByTestId('complete-nin-save'));

    await waitFor(() => {
      expect(screen.getByTestId('redirected-complete')).toBeInTheDocument();
    });
    expect(mockCompleteNin).toHaveBeenCalledWith({
      token: 'valid-token-1',
      nin: '12345678901',
    });
  });

  it('renders FR21 duplicate-NIN block on NIN_DUPLICATE error', async () => {
    mockCompleteNin.mockRejectedValueOnce(
      new ApiError(
        'This NIN was already registered.',
        409,
        'NIN_DUPLICATE',
        {
          firstRegisteredAt: '2026-01-15T10:00:00.000Z',
          firstRegisteredVia: 'public',
        },
      ),
    );
    renderWithToken('valid-token-1');
    await userEvent.type(screen.getByTestId('complete-nin-input'), '12345678901');
    await userEvent.click(screen.getByTestId('complete-nin-save'));

    await waitFor(() => {
      expect(screen.getByTestId('complete-nin-duplicate')).toBeInTheDocument();
    });
    expect(screen.getByTestId('complete-nin-duplicate-back')).toBeInTheDocument();
    expect(screen.getByTestId('complete-nin-duplicate-support')).toHaveAttribute(
      'href',
      '/support/contact',
    );
    // Save button is disabled while duplicate state holds.
    expect(screen.getByTestId('complete-nin-save')).toBeDisabled();
  });

  it('clearing the duplicate state via "Try a different NIN" re-enables Save', async () => {
    mockCompleteNin.mockRejectedValueOnce(
      new ApiError('Duplicate', 409, 'NIN_DUPLICATE', {}),
    );
    renderWithToken('valid-token-1');
    await userEvent.type(screen.getByTestId('complete-nin-input'), '12345678901');
    await userEvent.click(screen.getByTestId('complete-nin-save'));

    await waitFor(() => {
      expect(screen.getByTestId('complete-nin-duplicate')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('complete-nin-duplicate-back'));
    expect(screen.queryByTestId('complete-nin-duplicate')).toBeNull();
    expect((screen.getByTestId('complete-nin-input') as HTMLInputElement).value).toBe('');
  });

  it('calls deferReminder and shows confirmation when the user clicks "remind me later"', async () => {
    mockDeferReminder.mockResolvedValueOnce({
      respondentId: 'r-1',
      deferred: true,
      deferredAt: '2026-05-11T10:00:00.000Z',
    });
    renderWithToken('valid-token-1');
    await userEvent.click(screen.getByTestId('complete-nin-defer'));

    await waitFor(() => {
      expect(screen.getByTestId('complete-nin-deferred')).toBeInTheDocument();
    });
    expect(mockDeferReminder).toHaveBeenCalledWith({ token: 'valid-token-1' });
    // The defer button is disabled after a successful deferral.
    expect(screen.getByTestId('complete-nin-defer')).toBeDisabled();
  });

  it('surfaces the API error when deferReminder fails', async () => {
    mockDeferReminder.mockRejectedValueOnce(
      new ApiError('Reminder reset failed', 400, 'DEFER_FAILED'),
    );
    renderWithToken('valid-token-1');
    await userEvent.click(screen.getByTestId('complete-nin-defer'));

    await waitFor(() => {
      expect(screen.getByTestId('complete-nin-error')).toHaveTextContent('Reminder reset failed');
    });
  });
});
