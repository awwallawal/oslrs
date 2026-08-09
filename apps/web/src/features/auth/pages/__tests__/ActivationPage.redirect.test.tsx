import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Activation sends STAFF to the STAFF login — 2026-08-09.
 *
 * Found on production by the enumerator invite dry run, not by any test.
 *
 * Activation is staff-only: `auth.service.activateAccount` is reachable only via
 * a staff invitation token. The page used to send the newly-activated user to
 * `/login`, which is the CITIZEN page — it posts to `/auth/public/login`, and
 * that endpoint hard-rejects anyone who is not a `public_user`:
 *
 *     if (user.role.name !== UserRole.PUBLIC_USER) throw ...
 *
 * So every activated enumerator, clerk, assessor and admin was delivered to a
 * door that refuses their credentials, on their first ever login, with nothing
 * on screen to say where to go instead.
 *
 * ⚠️ WHY THESE ASSERTIONS NAME THE PATH RATHER THAN "a login page":
 * a test asserting "the user reaches a login screen" would have passed happily
 * over this hole for as long as it existed — both routes render a login screen.
 * The defect is WHICH one. See [[pattern-test-that-passes-over-a-hole]].
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

// The wizard drags in the webcam + face-detection model; this suite is about the
// redirect target, so stand it up with a button that fires onSuccess.
vi.mock('../../components/activation-wizard/ActivationWizard', () => ({
  ActivationWizard: ({ onSuccess }: { onSuccess: () => void }) => (
    <button onClick={onSuccess}>finish-activation</button>
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

describe('ActivationPage — staff go to the staff login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `valid: true` is REQUIRED — ActivationPage branches on it and falls through
    // to the 'invalid' state without it. Read off the producer
    // (ActivationPage's own `validate()`), not assumed: a fixture written from an
    // assumption confirms the assumption. That is how the first draft of this
    // file "failed" against a correct fix.
    validateActivationToken.mockResolvedValue({
      valid: true,
      fullName: 'Test Enumerator One',
      email: 'enum1@example.com',
      roleName: 'enumerator',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('redirects a newly-activated staff member to /staff/login, NOT the citizen /login', async () => {
    // Fake timers BEFORE render: the 5s redirect is scheduled inside the click
    // handler, and a timer created under real timers cannot be advanced by a
    // clock installed afterwards.
    // `shouldAdvanceTime` so Testing Library's own waitFor polling still ticks —
    // a frozen clock makes findByText hang until the 10s test timeout.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt();

    const finish = await screen.findByText('finish-activation');
    fireEvent.click(finish);

    // The page waits 5s before sending them on.
    await vi.advanceTimersByTimeAsync(5_000);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/staff/login');
    expect(mockNavigate).not.toHaveBeenCalledWith('/login');
  });

  it('offers no link to the citizen login anywhere on the page', async () => {
    // The invalid-token screen is where the "Go to Login" links live.
    validateActivationToken.mockResolvedValue({ valid: false });
    renderAt();
    await waitFor(() => {
      const links = screen.queryAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
    });

    // Every login link on this staff-only page must point at the staff door.
    for (const link of screen.queryAllByRole('link')) {
      const href = link.getAttribute('href') ?? '';
      if (href.includes('login')) {
        expect(href).toBe('/staff/login');
      }
    }
  });
});
