// @vitest-environment jsdom

/**
 * WizardPage URL ↔ state sync regression tests.
 *
 * 2026-05-12 — written to lock in the fix for the infinite render-loop bug
 * where clicking Continue on Step 1 left the wizard stuck flickering on
 * Step 1 forever. Root cause: the two `useEffect` hooks syncing URL ↔
 * `draft.currentStepIndex` shared an unstable `draft` dependency from the
 * `useWizardDraft` hook (fresh object every render), so Effect 1 fired on
 * every render and reverted state back to the stale URL value while
 * Effect 2 raced to push the URL forward. They fought to a stalemate.
 *
 * These tests would FAIL (timeout at `waitFor`) if the dep arrays drift
 * back to including `draft` — the screen would never transition from
 * Step 1 to Step 2.
 *
 * The step components are mocked as minimal stubs so the test focuses
 * purely on the wizard's URL ↔ state machinery. Full step-component
 * coverage lives in the step-specific test files (Step1BasicInfo,
 * Step5NinAndAuth, etc.).
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

expect.extend(matchers);
// AI-Review C1: this file lacked the explicit unmount every other RTL test file
// in the repo has, so tests 2..N collided on leftover DOM ("Found multiple
// elements by [data-testid=step1-stub]") and the load-bearing 427a80d URL-race
// guard failed 4/5 in a clean run.
afterEach(cleanup);

// ── Hoisted mocks ────────────────────────────────────────────────────────

const {
  mockSubmitWizard,
  mockRequestMagicLink,
  mockSaveWizardDraft,
  mockFetchWizardDraft,
  mockFetchPublicLgas,
  mockFetchPublicActiveForm,
} = vi.hoisted(() => ({
  mockSubmitWizard: vi.fn(),
  mockRequestMagicLink: vi.fn(),
  mockSaveWizardDraft: vi.fn(),
  mockFetchWizardDraft: vi.fn(),
  mockFetchPublicLgas: vi.fn(),
  mockFetchPublicActiveForm: vi.fn(),
}));

vi.mock('../../api/wizard.api', () => ({
  submitWizard: mockSubmitWizard,
  requestMagicLink: mockRequestMagicLink,
  saveWizardDraft: mockSaveWizardDraft,
  fetchWizardDraft: mockFetchWizardDraft,
  fetchPublicLgas: mockFetchPublicLgas,
  fetchPublicActiveForm: mockFetchPublicActiveForm,
}));

// Step components — minimal stubs. Each exposes a Continue button so we
// can drive the wizard transitions without depending on each step's
// internal validation.
vi.mock('../Step1BasicInfo', () => ({
  Step1BasicInfo: ({ onContinue }: { onContinue: () => void }) => (
    <div data-testid="step1-stub">
      <button data-testid="step1-continue" onClick={onContinue}>
        Continue
      </button>
    </div>
  ),
}));
vi.mock('../Step2ContactLga', () => ({
  Step2ContactLga: ({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) => (
    <div data-testid="step2-stub">
      <button data-testid="step2-back" onClick={onBack}>
        Back
      </button>
      <button data-testid="step2-continue" onClick={onContinue}>
        Continue
      </button>
    </div>
  ),
}));
vi.mock('../Step3Consent', () => ({
  Step3Consent: ({ onContinue }: { onContinue: () => void }) => (
    <div data-testid="step3-stub">
      <button data-testid="step3-continue" onClick={onContinue}>
        Continue
      </button>
    </div>
  ),
}));
vi.mock('../Step4Questionnaire', () => ({
  Step4Questionnaire: ({ onContinue }: { onContinue: () => void }) => (
    <div data-testid="step4-stub">
      <button data-testid="step4-continue" onClick={onContinue}>
        Continue
      </button>
    </div>
  ),
}));
vi.mock('../Step5NinAndAuth', () => ({
  Step5NinAndAuth: () => <div data-testid="step5-stub">Step 5</div>,
}));

// Layout / shared components — also stubbed so we don't pull in real
// shell DOM that's irrelevant to the URL ↔ state test. Path is the
// test file's relative location to `apps/web/src/layouts/WizardLayout`
// (4 `../` from `__tests__/`). Vitest normalises this against the SUT's
// import specifier under the hood.
vi.mock('../../../../layouts/WizardLayout', () => ({
  WizardLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="wizard-layout">{children}</div>
  ),
}));

import WizardPage from '../WizardPage';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Probe component that re-publishes the current URL search via a testid so
 * tests can assert on the URL transition without coupling to react-router
 * internals.
 */
function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location-search" data-search={location.search}>
      {location.search}
    </div>
  );
}

function renderAt(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/register"
          element={
            <>
              <WizardPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function urlSearch() {
  return screen.getByTestId('location-search').getAttribute('data-search') ?? '';
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no resume token in the URL → useWizardDraft hydrates immediately
  // to an empty draft (currentStepIndex=0, isHydrated=true). The hook only
  // calls fetchWizardDraft when a token is supplied via query string.
  mockFetchWizardDraft.mockResolvedValue(null);
});

describe('WizardPage URL ↔ state sync (regression — 2026-05-12 race fix)', () => {
  it('mounts on Step 1 and writes `?step=0` to the URL after hydration', async () => {
    renderAt('/register');
    await waitFor(() => {
      expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
    });
    // Effect 2 (state → URL) writes the canonical `?step=0` once hydration
    // completes. If the doom-loop returns, this would never settle.
    await waitFor(() => {
      expect(urlSearch()).toBe('?step=0');
    });
    expect(screen.queryByTestId('step2-stub')).not.toBeInTheDocument();
  });

  it('advances cleanly from Step 1 → Step 2 on Continue (no race, no revert)', async () => {
    renderAt('/register');
    await waitFor(() => {
      expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
    });

    // The doom-loop pre-fix: Continue click would update state to 1, Effect 1
    // would see URL=0 ≠ state=1 and revert state to 0, Effect 2 would push
    // URL to ?step=1, Effect 1 would re-fire and revert state back to 1,
    // Effect 2 would revert URL back to ?step=0... infinite. waitFor would
    // never observe Step 2 in the document.
    await userEvent.click(screen.getByTestId('step1-continue'));

    await waitFor(() => {
      expect(screen.getByTestId('step2-stub')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(urlSearch()).toBe('?step=1');
    });
    expect(screen.queryByTestId('step1-stub')).not.toBeInTheDocument();
  });

  it('navigates Back from Step 2 → Step 1 cleanly + URL reverts to `?step=0`', async () => {
    renderAt('/register');
    await waitFor(() => {
      expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('step1-continue'));
    await waitFor(() => {
      expect(screen.getByTestId('step2-stub')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('step2-back'));

    await waitFor(() => {
      expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(urlSearch()).toBe('?step=0');
    });
  });

  it('chains multiple Continue clicks Step 1 → 2 → 3 → 4 without sticking', async () => {
    renderAt('/register');
    await waitFor(() => {
      expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('step1-continue'));
    await waitFor(() => expect(screen.getByTestId('step2-stub')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('step2-continue'));
    await waitFor(() => expect(screen.getByTestId('step3-stub')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('step3-continue'));
    await waitFor(() => expect(screen.getByTestId('step4-stub')).toBeInTheDocument());

    await waitFor(() => expect(urlSearch()).toBe('?step=3'));
  });

  it('respects a `?step=2` deep-link on initial mount (URL → state)', async () => {
    renderAt('/register?step=2');
    // After hydration, the URL→state sync should land us on Step 3
    // (index 2 = Step 3 "Consent"). The one-shot ref guard runs on the
    // FIRST hydrated render so the deep-link survives.
    await waitFor(() => {
      expect(screen.getByTestId('step3-stub')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('step1-stub')).not.toBeInTheDocument();
  });
});
