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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

expect.extend(matchers);

// Story 9-18 Part E — WizardPage now derives its steps from the pinned form's
// sections. A 1-section form keeps the step model at 5 (basics/contact/consent/
// section/review) so these URL-race tests stay index-stable: index 3 = the
// section step (Step4Questionnaire stub), index 4 = Review.
// Story 13-23 (L4) — `formId` is a real questionnaire_forms row-PK UUID, matching
// what `flattenForRender(schema, form.id)` serves and what the server's
// `submitWizardSchema` accepts (`z.string().uuid()`). A non-UUID placeholder here
// would pass this client-only test yet be 400'd by the real server, so it could
// not catch a slug-vs-UUID payload regression (the 13-16 discipline).
const PUBLIC_FORM_UUID = '019f48c2-a499-7000-8000-000000000abc';
const ONE_SECTION_FORM = {
  formId: PUBLIC_FORM_UUID,
  title: 'Survey',
  version: '1.0.0',
  questions: [
    { id: 'q-occupation', type: 'text', name: 'occupation', label: 'Occupation', required: false, sectionId: 's1', sectionTitle: 'Livelihood' },
  ],
  choiceLists: {},
  sectionShowWhen: {},
};
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
  mockFetchEditableRegistration,
  mockEditRegistration,
} = vi.hoisted(() => ({
  mockSubmitWizard: vi.fn(),
  mockRequestMagicLink: vi.fn(),
  mockSaveWizardDraft: vi.fn(),
  mockFetchWizardDraft: vi.fn(),
  mockFetchPublicLgas: vi.fn(),
  mockFetchPublicActiveForm: vi.fn(),
  mockFetchEditableRegistration: vi.fn(),
  mockEditRegistration: vi.fn(),
}));

vi.mock('../../api/wizard.api', () => ({
  submitWizard: mockSubmitWizard,
  requestMagicLink: mockRequestMagicLink,
  saveWizardDraft: mockSaveWizardDraft,
  fetchWizardDraft: mockFetchWizardDraft,
  fetchPublicLgas: mockFetchPublicLgas,
  fetchPublicActiveForm: mockFetchPublicActiveForm,
  fetchEditableRegistration: mockFetchEditableRegistration,
  editRegistration: mockEditRegistration,
  derivePendingNin: (fd: { pendingNinToggle?: boolean; nin?: string }) =>
    fd.pendingNinToggle === true || !fd.nin,
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
vi.mock('../Step5ReviewAndSave', () => ({
  Step5ReviewAndSave: ({ onSubmit }: { onSubmit?: () => void }) => (
    <div data-testid="step5-stub">
      <button data-testid="step5-submit" onClick={() => onSubmit?.()}>
        Save
      </button>
    </div>
  ),
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
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
      </MemoryRouter>
    </QueryClientProvider>,
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
  // Part E: WizardPage fetches the pinned form to build its step list.
  mockFetchPublicActiveForm.mockResolvedValue(ONE_SECTION_FORM);
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

  // Story 9-54 AC6.1 (GAP 4) — a COLD deep-link beyond the furthest step the
  // user has legitimately reached is clamped back to it (here: 0, fresh mount),
  // never honoured. Previously `?step=2` jumped straight to Consent; the same
  // vector with `?step=<last>` let a user skip the questionnaire to Review.
  it('clamps a cold `?step=2` deep-link to the furthest-reached step (0) and corrects the URL', async () => {
    renderAt('/register?step=2');
    await waitFor(() => {
      expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('step3-stub')).not.toBeInTheDocument();
    // The over-reaching URL is rewritten so it can't be re-shared / re-trigger.
    await waitFor(() => expect(urlSearch()).toBe('?step=0'));
  });

  it('clamps a cold `?step=<last>` deep-link so Review cannot be reached past the questionnaire (AC6.1)', async () => {
    renderAt('/register?step=4'); // index 4 = Review in the 5-step model
    await waitFor(() => {
      expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('step5-stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step4-stub')).not.toBeInTheDocument();
  });
});

describe('WizardPage resume seed (Story 9-57 AC3)', () => {
  it('seeds the URL from the saved draft step on `?token` resume and lands there', async () => {
    // Server draft saved at currentStep 4 (1-indexed) → index 3 (the section
    // step in the 5-step model). maxReached rises to 3 from the saved step, so
    // the deep-link clamp permits landing on it.
    mockFetchWizardDraft.mockResolvedValue({
      formData: { email: 'resume@example.test' },
      currentStep: 4,
    });

    renderAt('/register?token=abc123');

    await waitFor(() => {
      expect(screen.getByTestId('step4-stub')).toBeInTheDocument();
    });
    // The URL is seeded to the saved step (one-time reconciliation) and the
    // resume token is preserved.
    await waitFor(() => {
      expect(urlSearch()).toContain('step=3');
    });
    expect(urlSearch()).toContain('token=abc123');
    expect(screen.queryByTestId('step1-stub')).not.toBeInTheDocument();
  });

  it('lets an explicit `?step` win over the saved draft step (AC3.2)', async () => {
    mockFetchWizardDraft.mockResolvedValue({
      formData: { email: 'resume@example.test' },
      currentStep: 4, // saved at index 3
    });

    // Explicit ?step=1 present alongside the token → it wins (clamped to the
    // reached range, which the saved step 3 has widened).
    renderAt('/register?token=abc123&step=1');

    await waitFor(() => {
      expect(screen.getByTestId('step2-stub')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('step4-stub')).not.toBeInTheDocument();
    expect(urlSearch()).toContain('step=1');
  });

  // AI-Review H1 — the AC3.2 test above only passes because react-query's
  // `isSuccess` happens to lag a raw draft `.then()` in jsdom, so `maxReached`
  // commits before the over-reach effect's guard opens. This test forces the
  // OPPOSITE, realistic ordering: the form query settles BEFORE the draft
  // hydrates (draft resolved on a delayed macrotask), so on the render where
  // `isHydrated` flips, `maxReachedStepIndex` state is still 0. Pre-fix, the
  // over-reach effect read that stale 0 and rewrote the explicit `?step=1` down
  // to `?step=0` (user landed on step 0). The synchronous `effectiveMaxReached`
  // (folding in the hydrated draft step) must keep the explicit step intact.
  it('keeps an explicit `?step` when the form settles before the draft hydrates (AI-Review H1)', async () => {
    mockFetchWizardDraft.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ formData: { email: 'resume@example.test' }, currentStep: 4 }),
            50,
          ),
        ),
    );

    renderAt('/register?token=abc123&step=1');

    await waitFor(() => {
      expect(screen.getByTestId('step2-stub')).toBeInTheDocument();
    });
    expect(urlSearch()).toContain('step=1');
    // The over-reach effect must NOT have clamped the explicit step down to 0.
    expect(urlSearch()).not.toContain('step=0');
    expect(screen.queryByTestId('step1-stub')).not.toBeInTheDocument();
  });
});

function renderAuthenticatedAt(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/registration/manage"
            element={
              <>
                <WizardPage authenticated />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WizardPage authenticated edit mode (Story 9-61)', () => {
  it('seeds the form from GET /me/registration on mount and skips the public submit path', async () => {
    mockFetchEditableRegistration.mockResolvedValue({
      mode: 'edit',
      respondentId: 'r1',
      wizardData: {
        givenName: 'Ada',
        phone: '+2348012345678',
        email: 'me@example.com',
        lgaId: 'lga-egbeda',
        consentMarketplace: true,
      },
    });

    renderAuthenticatedAt('/registration/manage');

    await waitFor(() => {
      expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
    });
    // AC#1 — the authenticated read-model drives the prefill.
    await waitFor(() => {
      expect(mockFetchEditableRegistration).toHaveBeenCalled();
    });
    // The public submit endpoint is never used in authenticated mode.
    expect(mockSubmitWizard).not.toHaveBeenCalled();
  });
});

describe('WizardPage form binding (Story 13-23 AC2)', () => {
  it('carries the pinned form UUID (`form.formId`) into the submit payload', async () => {
    // Resume a COMPLETE draft landed on Review (step 5) so the submit guards
    // pass. ONE_SECTION_FORM.occupation is optional → completeness is satisfied.
    mockFetchWizardDraft.mockResolvedValue({
      formData: {
        givenName: 'Ada',
        phone: '+2348012345678',
        email: 'ada@example.test',
        lgaId: 'lga-egbeda',
        consentMarketplace: true,
        nin: '12345678901',
      },
      currentStep: 5,
    });
    mockSubmitWizard.mockResolvedValue({
      respondentId: 'r1',
      submissionUid: 's1',
      referenceCode: 'OSL-2026-AAA111',
      status: 'active',
      pendingNin: false,
      authChoice: 'magic-link',
    });
    mockRequestMagicLink.mockResolvedValue(undefined);

    renderAt('/register?token=abc123');

    const submit = await screen.findByTestId('step5-submit');
    await userEvent.click(submit);

    await waitFor(() => {
      expect(mockSubmitWizard).toHaveBeenCalled();
    });
    // The payload binds to the form the wizard rendered — `ONE_SECTION_FORM.formId`
    // (a real row-PK UUID), the value the server persists as
    // submissions.questionnaire_form_id (no longer a draft-race sentinel).
    expect(mockSubmitWizard).toHaveBeenCalledWith(
      expect.objectContaining({ questionnaireFormId: PUBLIC_FORM_UUID }),
    );
  });
});
