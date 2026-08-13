import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

expect.extend(matchers);

/**
 * Story 13-60 AC1.1 — THE COMPLETION SCREEN MUST SAY THE PHOTO DID NOT SAVE.
 *
 * The API always knew. `activateAccount` computed the outcome, and the page
 * threw it away one frame before the only screen that could have shown it — so
 * "photo saved", "photo skipped" and "photo failed silently" all rendered the
 * identical "Account Activated!" card. An enumerator learned the difference at
 * a household door, holding nothing that said they were genuine.
 *
 * ⛔ ASSERT ON WHAT THE PERSON IS TOLD, not on reaching the success screen. A
 * test asserting "Account Activated! is shown" passes over this hole for every
 * one of the three outcomes — that is [[pattern-test-that-passes-over-a-hole]],
 * which this story exists to close.
 */

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const validateActivationToken = vi.fn();
vi.mock('../../api/auth.api', () => ({
  validateActivationToken: (...args: unknown[]) => validateActivationToken(...args),
}));

/**
 * The real wizard drags in the webcam + face-detection model. Stand it up with
 * a button per outcome so this suite stays about what the page DISPLAYS.
 */
vi.mock('../../components/activation-wizard/ActivationWizard', () => ({
  ActivationWizard: ({ onSuccess }: { onSuccess: (d: unknown) => void }) => (
    <>
      <button
        onClick={() =>
          onSuccess({ id: 'u1', status: 'active', photo: { status: 'failed', source: 'live_capture', failureReason: 'S3 upload failed' } })
        }
      >
        finish-failed
      </button>
      <button onClick={() => onSuccess({ id: 'u1', status: 'active', photo: { status: 'skipped', source: null, failureReason: null } })}>
        finish-skipped
      </button>
      <button onClick={() => onSuccess({ id: 'u1', status: 'active', photo: { status: 'saved', source: 'live_capture', failureReason: null } })}>
        finish-saved
      </button>
    </>
  ),
}));

import ActivationPage from '../ActivationPage';

function renderAt(token = 'tok_123') {
  return render(
    <MemoryRouter initialEntries={[`/activate/${token}`]}>
      <Routes>
        <Route path="/activate/:token" element={<ActivationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function finish(which: 'failed' | 'skipped' | 'saved') {
  renderAt();
  const btn = await screen.findByText(`finish-${which}`);
  fireEvent.click(btn);
  await screen.findByText(/Account Activated!/i);
}

describe('ActivationPage — the photo outcome is stated (13-60 AC1.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    validateActivationToken.mockResolvedValue({
      valid: true,
      fullName: 'Field Officer',
      email: 'f@x.com',
      roleName: 'enumerator',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tells the person their photo did not save, and how to fix it without a new invitation', async () => {
    await finish('failed');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Your photo did not save/i);
    expect(alert).toHaveTextContent(/ID card cannot be printed/i);
    // AC2 — the remedy, in the same breath as the problem.
    expect(alert).toHaveTextContent(/do not need a new invitation/i);

    /*
     * ⛔ AND IT NAMES A PLACE THAT EXISTS (review H2). This line used to send
     * them to "Profile › Photo" — there is no Photo section on the profile
     * page, and the only route that adds a photo is reached from the dashboard
     * banner. Pointing someone at a screen that is not there is the same
     * failure as saying nothing, one step later.
     */
    expect(alert).toHaveTextContent(/dashboard/i);
    expect(alert).toHaveTextContent(/Add your photo/i);
    expect(alert).not.toHaveTextContent(/Profile\s*›\s*Photo/i);
  });

  /**
   * ⚠️ The 5-second auto-redirect is the reason this needs its own test. The
   * message telling them their ID card does not exist is the only notice they
   * will ever get, and a timer yanking it off screen mid-sentence would
   * reproduce exactly the silence the story is about.
   */
  it('does NOT auto-redirect away from the failure notice', async () => {
    await finish('failed');
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    // …and they can still leave deliberately.
    expect(screen.getByRole('link', { name: /log in now/i })).toBeInTheDocument();
    expect(screen.queryByText(/Redirecting to login/i)).not.toBeInTheDocument();
  });

  it('still auto-redirects on the happy path — the change is scoped to failure', async () => {
    await finish('saved');
    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/staff/login');
  });

  it('distinguishes a deliberate skip from a failure', async () => {
    await finish('skipped');
    expect(await screen.findByText(/You skipped the photo step/i)).toBeInTheDocument();
    // A skip is not an alert — nothing went wrong, it was their choice.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says nothing about photos when one was saved', async () => {
    await finish('saved');
    expect(screen.queryByText(/did not save/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/You skipped the photo step/i)).not.toBeInTheDocument();
  });
});
