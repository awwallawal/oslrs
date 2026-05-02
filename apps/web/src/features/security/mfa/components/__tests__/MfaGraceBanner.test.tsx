// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MfaGraceBanner } from '../MfaGraceBanner';

expect.extend(matchers);

// F19 (code-review 2026-05-02): RTL doesn't auto-cleanup in this project's
// vitest config — see MfaChallengePage.test.tsx for full rationale.
afterEach(() => {
  cleanup();
});

function renderBanner(graceUntil: Date) {
  return render(
    <MemoryRouter>
      <MfaGraceBanner graceUntil={graceUntil} />
    </MemoryRouter>
  );
}

describe('MfaGraceBanner', () => {
  it('renders the days+hours countdown when grace is in the future', () => {
    // 3 days + 4 hours + 30 minutes — extra padding so a sub-second test-execution
    // delay can't drop the floor()ed hour from 4 to 3.
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000 + 30 * 60 * 1000);
    renderBanner(future);
    expect(screen.getByText(/MFA enrollment required/i)).toBeInTheDocument();
    expect(screen.getByText(/3d 4h/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /enrol now/i })).toHaveAttribute(
      'href',
      '/dashboard/super-admin/security/mfa',
    );
  });

  it('renders an expired/restricted message when grace is in the past', () => {
    const past = new Date(Date.now() - 60_000);
    renderBanner(past);
    expect(screen.getByText(/grace period has expired/i)).toBeInTheDocument();
  });
});
