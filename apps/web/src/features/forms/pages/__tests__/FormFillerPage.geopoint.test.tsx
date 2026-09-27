/**
 * Story 13-71 — auto-capture on open, refresh at submit, and the enumerator gate.
 *
 * A SEPARATE FILE from `FormFillerPage.test.tsx` deliberately: every test here
 * needs a form that SERVES a geopoint question, and the existing file's fixture
 * does not have one. Widening that fixture would have quietly changed what two
 * dozen unrelated tests exercise.
 *
 * ⛔ WHAT THIS FILE IS CAREFUL ABOUT. The gate under test is "enumerator AND the
 * form serves a geopoint question", and each half has a way of passing for the
 * wrong reason — a clerk test that goes green because the form had no geopoint,
 * or a no-geopoint test that goes green because the role was wrong. So the two
 * exemptions are asserted against a fixture that isolates exactly one variable at
 * a time, and AC7's clerk case runs on the SAME geopoint form the enumerator case
 * is refused on.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

expect.extend(matchers);

import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FormFillerPage from '../FormFillerPage';
import type { FlattenedForm } from '../../api/form.api';

// ── Harness ────────────────────────────────────────────────────────────────

const mockCompleteDraft = vi.fn();
const mockSaveDraft = vi.fn();
/** Captures the options FormFillerPage hands the draft hook (Task 1.1). */
const mockUseDraftPersistence = vi.fn();

/**
 * Review R7 — the draft the page resumes from. `null` for a fresh interview;
 * set to a `{ restored: true }` shape to exercise a REOPENED rejected submission.
 */
let mockResumeData: {
  formData: Record<string, unknown>;
  questionPosition: number;
  restored: boolean;
} | null = null;

vi.mock('../../hooks/useDraftPersistence', () => ({
  useDraftPersistence: (options: unknown) => {
    mockUseDraftPersistence(options);
    return {
      draftId: 'draft-1',
      resumeData: mockResumeData,
      loading: false,
      saveDraft: mockSaveDraft,
      completeDraft: mockCompleteDraft,
      discardDraft: vi.fn(),
      resetForNewEntry: vi.fn(),
    };
  },
}));

vi.mock('../../../../services/sync-manager', () => ({
  syncManager: { syncNow: () => Promise.resolve() },
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
  SkeletonText: () => <div data-testid="skeleton-text" />,
}));

vi.mock('../../hooks/useNinCheck', () => ({
  useNinCheck: () => ({
    isChecking: false,
    isDuplicate: false,
    duplicateInfo: null,
    checkNin: vi.fn(),
    reset: vi.fn(),
  }),
}));

let mockUserRole = 'enumerator';
vi.mock('../../../auth', () => ({
  useAuth: () => ({ user: { role: mockUserRole } }),
}));

/**
 * ⭐ THE QUESTION IS NAMED `site_location`, NOT `gps_location`.
 *
 * That is the point of Task 1.1. `useDraftPersistence` used to read the literal
 * `formData.gps_location`; if this fixture used that name, every assertion below
 * would pass whether or not the hardcode was ever removed.
 */
const GEO_NAME = 'site_location';

const geoForm: FlattenedForm = {
  formId: 'geo-form-id',
  title: 'Field Survey',
  version: '1.0.0',
  questions: [
    {
      id: 'q1', type: 'geopoint', name: GEO_NAME, label: 'Where is this interview?',
      required: false, sectionId: 's1', sectionTitle: 'General',
    },
    {
      id: 'q2', type: 'text', name: 'full_name', label: 'What is your full name?',
      required: false, sectionId: 's2', sectionTitle: 'Personal Info',
    },
  ],
  choiceLists: {},
  sectionShowWhen: {},
};

/** AC3's fence case: a real live shape — a form that serves NO geopoint question. */
const noGeoForm: FlattenedForm = {
  ...geoForm,
  formId: 'public-core-like',
  questions: [geoForm.questions[1]],
};

let mockHookReturn = { data: geoForm as FlattenedForm | undefined, isLoading: false, error: null as Error | null };
vi.mock('../../hooks/useForms', () => ({
  useFormSchema: () => mockHookReturn,
  useFormPreview: () => mockHookReturn,
}));

// ── Geolocation doubles ────────────────────────────────────────────────────

const OPEN_POS = { latitude: 7.3775, longitude: 3.9470, accuracy: 25 };
const SUBMIT_POS = { latitude: 7.4001, longitude: 3.9002, accuracy: 8 };

const originalGeolocation = navigator.geolocation;
const originalPermissions = (navigator as Navigator & { permissions?: Permissions }).permissions;

function setNavigatorProp(key: 'geolocation' | 'permissions', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
}

/** Resolve with `positions` in order, one per call; `null` means "fail with `code`". */
function stubGeolocation(positions: Array<typeof OPEN_POS | null>, code = 1) {
  let call = 0;
  const getCurrentPosition = vi.fn(
    (onOk: PositionCallback, onErr?: PositionErrorCallback) => {
      const next = positions[Math.min(call, positions.length - 1)];
      call += 1;
      if (next) onOk({ coords: next } as GeolocationPosition);
      else onErr?.({ code } as GeolocationPositionError);
    },
  );
  setNavigatorProp('geolocation', { getCurrentPosition });
  return getCurrentPosition;
}

/**
 * act-WRAPPED ON PURPOSE. The AC1 auto-capture resolves a promise and sets state
 * after mount, so a bare `render()` lets that update land OUTSIDE React's act()
 * and prints a warning on nearly every test in this file. The warning is noise
 * today and a flake tomorrow: a state update racing the assertions is exactly the
 * shape that produces a test which passes locally and reds in CI.
 *
 * The one test that asserts the first question renders SYNCHRONOUSLY calls
 * `render()` directly instead -- flushing the queue there would destroy its claim.
 */
async function renderPage() {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={['/survey/geo-form-id']}>
        <Routes>
          <Route path="/survey/:formId" element={<FormFillerPage mode="fill" />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return result;
}

/** Walk to the end of the form and press Complete Survey. */
async function completeSurvey() {
  // Question 1 (geopoint) → Continue
  fireEvent.click(screen.getByTestId('continue-btn'));
  // 13-75 — explicit timeout: asyncUtilTimeout (1000 ms) is not testTimeout.
  await waitFor(() => expect(screen.getByText('What is your full name?')).toBeInTheDocument(), { timeout: 5000 });
  // Question 2 (last) → Complete Survey
  fireEvent.click(screen.getByTestId('continue-btn'));
}

/** The answers object the page handed to `completeDraft`. */
function submittedAnswers(): Record<string, unknown> {
  expect(mockCompleteDraft).toHaveBeenCalled();
  return mockCompleteDraft.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCompleteDraft.mockResolvedValue(undefined);
  mockSaveDraft.mockResolvedValue(undefined);
  mockUserRole = 'enumerator';
  mockResumeData = null;
  mockHookReturn = { data: geoForm, isLoading: false, error: null };
  setNavigatorProp('permissions', { query: async () => ({ state: 'granted' }) });
  stubGeolocation([OPEN_POS]);
});

afterEach(() => {
  cleanup();
  setNavigatorProp('geolocation', originalGeolocation);
  setNavigatorProp('permissions', originalPermissions);
});

// ── AC1 — the tap that no longer has to happen ─────────────────────────────

describe('13-71 AC1 — a survey opened in fill mode takes the position itself', () => {
  it('requests a position once the schema is available', async () => {
    const getCurrentPosition = stubGeolocation([OPEN_POS]);
    await renderPage();
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
  });

  it('writes it under the SCHEMA question name, not a hardcoded one', async () => {
    await renderPage();
    // The captured value shows on the geopoint screen, which is the first screen.
    await waitFor(() =>
      expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument(),
    );

    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    // ⭐ `site_location`, not `gps_location`.
    expect(submittedAnswers()[GEO_NAME]).toMatchObject({
      latitude: OPEN_POS.latitude,
      longitude: OPEN_POS.longitude,
    });
  });

  it('hands the draft hook the schema name so the hook need not guess either', async () => {
    await renderPage();
    const options = mockUseDraftPersistence.mock.calls.at(-1)?.[0] as { geopointQuestionName?: string };
    expect(options.geopointQuestionName).toBe(GEO_NAME);
  });

  it('⛔ does NOT block the first question on the browser — it renders while GPS is in flight', () => {
    // A getCurrentPosition that never calls back at all.
    setNavigatorProp('geolocation', { getCurrentPosition: vi.fn() });

    // ⛔ A BARE `render()`, NOT the act-wrapped `renderPage()` helper, and NOT an
    // async test. The claim here is that the first question is on screen with
    // NOTHING awaited and nothing resolved. Flushing the microtask queue first --
    // which is exactly what the helper does -- would make this pass even if the
    // page DID block on the browser, which is the whole thing it must rule out.
    render(
      <MemoryRouter initialEntries={['/survey/geo-form-id']}>
        <Routes>
          <Route path="/survey/:formId" element={<FormFillerPage mode="fill" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Where is this interview?')).toBeInTheDocument();
    expect(screen.getByTestId('continue-btn')).toBeInTheDocument();
  });

  it('captures exactly once per open, not once per render', async () => {
    const getCurrentPosition = stubGeolocation([OPEN_POS]);
    await renderPage();
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('continue-btn'));
    await waitFor(() => expect(screen.getByText('What is your full name?')).toBeInTheDocument());
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('does not auto-capture in PREVIEW mode — a preview must take nobody’s location', async () => {
    const getCurrentPosition = stubGeolocation([OPEN_POS]);
    render(
      <MemoryRouter initialEntries={['/survey/geo-form-id']}>
        <Routes>
          <Route path="/survey/:formId" element={<FormFillerPage mode="preview" />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Where is this interview?')).toBeInTheDocument());
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});

// ── AC2 — the submit-time refresh, and holding both ────────────────────────

describe('13-71 AC2 — refreshed at submit, with the open-time fix retained', () => {
  it('⭐ stores the SUBMIT-time coordinate AND keeps the open-time one under a distinct key', async () => {
    stubGeolocation([OPEN_POS, SUBMIT_POS]);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());

    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());

    const answers = submittedAnswers();
    // Both are present...
    expect(answers[GEO_NAME]).toMatchObject({ latitude: SUBMIT_POS.latitude, longitude: SUBMIT_POS.longitude });
    expect(answers._gpsOpenCapture).toMatchObject({ latitude: OPEN_POS.latitude, longitude: OPEN_POS.longitude });
    // ...and they are DISTINGUISHABLE, which is the whole claim. A form filled at
    // the door and submitted twenty minutes later is now visible as such.
    expect(answers[GEO_NAME]).not.toEqual(answers._gpsOpenCapture);
  });

  it('a failed refresh leaves the open-time position standing and still submits', async () => {
    stubGeolocation([OPEN_POS, null], 3 /* TIMEOUT */);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());

    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    // A refresh is an improvement, never a precondition.
    expect(submittedAnswers()[GEO_NAME]).toMatchObject({ latitude: OPEN_POS.latitude });
  });

  it('does NOT refresh when the browser would have to prompt', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) });
    const getCurrentPosition = stubGeolocation([OPEN_POS, SUBMIT_POS]);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());

    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    // Exactly one call: the open-time capture. No OS dialog on top of a
    // "Complete Survey" tap the enumerator has already made.
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(submittedAnswers()[GEO_NAME]).toMatchObject({ latitude: OPEN_POS.latitude });
  });

  it('⛔ iOS Safari (no navigator.permissions) DOES refresh — the branch that would otherwise never fire', async () => {
    setNavigatorProp('permissions', undefined);
    stubGeolocation([OPEN_POS, SUBMIT_POS]);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());

    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    // Measured 2026-09-20: 4 of the trial enumerators are here.
    expect(submittedAnswers()[GEO_NAME]).toMatchObject({ latitude: SUBMIT_POS.latitude });
  });
});

// ── AC3 / AC4 — refused, and the one way out ───────────────────────────────

describe('13-71 AC3/AC4 — an enumerator submission with neither is refused', () => {
  it('blocks the submit when the position could not be captured', async () => {
    stubGeolocation([null], 1 /* PERMISSION_DENIED */);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());

    await completeSurvey();

    await waitFor(() => expect(screen.getByTestId('gps-required-block')).toBeInTheDocument());
    // Nothing was queued. A blocked submit is blocked, not deferred.
    expect(mockCompleteDraft).not.toHaveBeenCalled();
  });

  /*
   * ⚠️ SUPERSEDED BY 13-75 AC1, deliberately. This asserted exactly ONE button in
   * the block. 13-75 adds the fix (a live capture) beside the waiver, because the
   * one action on offer was the exit, and the first human to reach it used it on a
   * retryable `timeout`. What 13-71 cared about survives: the waiver is still a
   * confirmation, never a <select> of causes.
   */
  it('offers the fix and ONE waiver — and the waiver is a confirmation, not a diagnosis', async () => {
    stubGeolocation([null], 1);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-required-block')).toBeInTheDocument());

    const block = screen.getByTestId('gps-required-block');
    // ⛔ Not a <select>, not a list of causes whose first item is the easy way out.
    expect(block.querySelectorAll('button')).toHaveLength(2);
    expect(block.querySelector('select')).toBeNull();
    expect(screen.getByTestId('gps-block-capture-btn')).toHaveTextContent('Capture GPS Location');
    expect(screen.getByTestId('gps-unavailable-btn')).toHaveTextContent('I could not capture a location');
  });

  it('⭐ the recorded reason is DERIVED from the browser, not chosen: denied → permission_denied', async () => {
    stubGeolocation([null], 1);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-unavailable-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('gps-unavailable-btn'));
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    expect(submittedAnswers()._gpsUnavailableReason).toBe('permission_denied');
  });

  it('a TIMEOUT records timeout — the two are no longer the same absent value', async () => {
    stubGeolocation([null], 3);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-required-block')).toBeInTheDocument(), { timeout: 5000 });

    // 13-75 AC6 — `timeout` is retryable, so the waiver is offered only after one
    // in-banner attempt has failed. That attempt times out again here.
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(screen.getByTestId('gps-unavailable-btn')).toBeInTheDocument(), { timeout: 3000 });

    fireEvent.click(screen.getByTestId('gps-unavailable-btn'));
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    expect(submittedAnswers()._gpsUnavailableReason).toBe('timeout');
  });

  it('a browser with no geolocation at all records `unsupported`', async () => {
    setNavigatorProp('geolocation', undefined);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-unavailable-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('gps-unavailable-btn'));
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    expect(submittedAnswers()._gpsUnavailableReason).toBe('unsupported');
  });

  it('confirming the reason lets the submit through — the requirement is not a wall', async () => {
    stubGeolocation([null], 1);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-unavailable-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('gps-unavailable-btn'));
    await waitFor(() => expect(screen.getByTestId('completion-screen')).toBeInTheDocument());
  });

  it('a successful capture is never blocked', async () => {
    stubGeolocation([OPEN_POS, OPEN_POS]);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
  });

  it('Task 3.2 — a MANUAL capture after a refusal clears the stale reason', async () => {
    const getCurrentPosition = vi.fn(
      (onOk: PositionCallback, onErr?: PositionErrorCallback) => {
        // Auto-capture fails; the manual tap then succeeds.
        if (getCurrentPosition.mock.calls.length === 1) onErr?.({ code: 1 } as GeolocationPositionError);
        else onOk({ coords: OPEN_POS } as GeolocationPosition);
      },
    );
    setNavigatorProp('geolocation', { getCurrentPosition });

    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-capture-${GEO_NAME}`)).toBeInTheDocument());

    fireEvent.click(screen.getByTestId(`geopoint-capture-${GEO_NAME}`));
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());

    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());

    const answers = submittedAnswers();
    expect(answers[GEO_NAME]).toMatchObject({ latitude: OPEN_POS.latitude });
    // ⛔ No reason rides along beside a real position.
    expect(answers._gpsUnavailableReason).toBeUndefined();
  });
});

// ── ULTRA REVIEW FINDINGS ──────────────────────────────────────────────────

describe('13-71 U1/U14 — only the ENUMERATOR path is geolocated', () => {
  it('⛔ a PUBLIC user opening the same form is NEVER geolocated', async () => {
    // `mode="fill"` is mounted on TWO routes; `App.tsx:1435` is
    // `/dashboard/public/surveys/:formId` — "Story 3.5: Public User Form Filler".
    // With no role gate, a member of the public was silently located and the
    // coordinates filed with `source='public'` — the channel 13-34 deliberately
    // stripped the geopoint from. A privacy exposure first, a data defect second.
    mockUserRole = 'public_user';
    const getCurrentPosition = stubGeolocation([OPEN_POS]);

    await renderPage();
    await waitFor(() => expect(screen.getByText('Where is this interview?')).toBeInTheDocument());

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('⛔ a CLERK is not geolocated either — AC7 reasoning applied to CAPTURE', async () => {
    // AC7 exempts the clerk because "office coordinates filed as field captures
    // would poison the base map". That argument is about who holds the phone, so
    // it governs capture, not merely enforcement. Capturing for a clerk and then
    // not requiring it was the worst of both: the poisoned coordinate without the
    // coverage.
    mockUserRole = 'data_entry_clerk';
    const getCurrentPosition = stubGeolocation([OPEN_POS]);

    await renderPage();
    await waitFor(() => expect(screen.getByText('Where is this interview?')).toBeInTheDocument());

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('the ENUMERATOR path still captures — the gate narrows, it does not disable', async () => {
    mockUserRole = 'enumerator';
    const getCurrentPosition = stubGeolocation([OPEN_POS]);
    await renderPage();
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
  });

  it('U14: a non-enumerator never stamps `other` into the reason column', async () => {
    mockUserRole = 'public_user';
    setNavigatorProp('geolocation', undefined);

    await renderPage();
    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());

    // AC6's column exists to be GROUPed BY. Desk work in it is noise that cannot
    // be explained away by a browser error code.
    expect(submittedAnswers()._gpsUnavailableReason).toBeUndefined();
  });
});

describe('13-71 U9 — auto-capture survives StrictMode double-invocation', () => {
  it('⛔ still captures when the effect is mounted, cleaned up and re-mounted', async () => {
    /*
     * `React.StrictMode` IS enabled in this app (`main.tsx:7`), so in development
     * every effect runs mount → cleanup → mount. The original once-guard latched
     * the instant the effect ran and was never released, so run 1 started a
     * capture and was cancelled, and run 2 returned at the guard: **auto-capture
     * never worked in development at all.**
     *
     * ⭐ And no existing test could see it, because RTL does not render under
     * StrictMode unless asked. This asks.
     */
    const getCurrentPosition = stubGeolocation([OPEN_POS]);

    await act(async () => {
      render(
        <StrictMode>
          <MemoryRouter initialEntries={['/survey/geo-form-id']}>
            <Routes>
              <Route path="/survey/:formId" element={<FormFillerPage mode="fill" />} />
            </Routes>
          </MemoryRouter>
        </StrictMode>,
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument(),
    );
    expect(getCurrentPosition).toHaveBeenCalled();
  });

  /*
   * ⚠️ AN HONEST NOTE ABOUT THE TEST ABOVE, recorded rather than smoothed over.
   *
   * It passes both WITH and WITHOUT the two-ref fix, so it is a regression guard
   * and NOT the proof. The reason is worth writing down: the effect is gated on
   * `draftLoaded`, which is false during the StrictMode mount → cleanup → mount
   * pair, so BOTH of those runs return before touching the guard, and the run that
   * does the work is a later update — which StrictMode does not double-invoke.
   * U9's "auto-capture never works in development at all" therefore does not
   * reproduce on this path; the finding's OTHER half does, and is pinned below.
   *
   * The fix is kept regardless: it costs nothing and the ordering that protects
   * this today is incidental, not designed.
   */
  it('⛔ a re-run while a capture is IN FLIGHT starts a fresh one, not silence', async () => {
    // U9's production half: "a background refetch inside the 10 s window cancels
    // it permanently". The old single ref latched before the work finished and was
    // never released, so the cancelled attempt locked out every later one.
    let pendingCalls = 0;
    const getCurrentPosition = vi.fn(() => { pendingCalls += 1; });
    setNavigatorProp('geolocation', { getCurrentPosition });

    await renderPage();
    await waitFor(() => expect(pendingCalls).toBe(1));

    // A new schema object identity — exactly what a background refetch produces.
    // The effect cleans up (cancelling attempt 1) and runs again.
    // A NEW question object, not just a new wrapper: `geopointQuestion` is a
    // `useMemo` over `form.questions.find(...)`, so spreading the form alone
    // returns the identical question and the effect never re-runs.
    mockHookReturn = {
      data: { ...geoForm, questions: [{ ...geoForm.questions[0] }, geoForm.questions[1]] },
      isLoading: false,
      error: null,
    };
    await act(async () => {
      fireEvent.click(screen.getByTestId('continue-btn'));
    });

    await waitFor(() => expect(pendingCalls).toBeGreaterThan(1));
  });
});

describe('13-71 U10 — the amber panel does not follow the enumerator around', () => {
  it('⛔ navigating BACK clears the blocked panel', async () => {
    stubGeolocation([null], 1);
    await renderPage();
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-required-block')).toBeInTheDocument());

    // Its own text says "Go back to the location question" — which is precisely
    // the action that used to leave it rendered on every screen, one mis-tap away
    // from filing the whole interview.
    fireEvent.click(screen.getByTestId('back-btn'));

    await waitFor(() => expect(screen.queryByTestId('gps-required-block')).toBeNull());
  });
});

describe('13-71 U4/U5 — a failed write is never reported as a saved survey', () => {
  it('⛔ the PRIMARY exit shows an error and NO completion screen when the write rejects', async () => {
    stubGeolocation([OPEN_POS, OPEN_POS]);
    mockCompleteDraft.mockRejectedValue(new Error('QuotaExceededError'));

    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());
    await completeSurvey();

    // Before the shared helper this path had no try/catch at all: the rejection
    // threw out of the onClick handler and the enumerator saw nothing happen.
    await waitFor(() => expect(screen.getByTestId('submit-error-block')).toBeInTheDocument());
    expect(screen.queryByTestId('completion-screen')).toBeNull();
  });

  it('a recovered retry then completes normally', async () => {
    stubGeolocation([OPEN_POS, OPEN_POS]);
    mockCompleteDraft.mockRejectedValueOnce(new Error('QuotaExceededError'));

    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('submit-error-block')).toBeInTheDocument());

    // The guard must release on failure, or the retry the UI offers is a lie.
    mockCompleteDraft.mockResolvedValue(undefined);
    fireEvent.click(screen.getByTestId('continue-btn'));
    await waitFor(() => expect(screen.getByTestId('completion-screen')).toBeInTheDocument());
  });
});

describe('13-71 U8 — one interview cannot become two queue rows', () => {
  /*
   * ⚠️ THIS TEST WAS WRITTEN WRONG THE FIRST TIME, AND THE MUTATION SAID SO.
   *
   * The first version awaited the in-flight state before tapping again, so React
   * had already re-rendered the button as `disabled` and `fireEvent.click` on a
   * disabled button is a no-op. Deleting the `submitInFlightRef` guard entirely
   * left the suite GREEN: the test pinned the visual affordance and proved nothing
   * about the authoritative guard. [[pattern-test-that-passes-over-a-hole]]
   *
   * The taps now land in the SAME TICK as the first, before any re-render can
   * disable anything — which is also what an impatient thumb on a slow phone
   * actually does.
   */
  it('⛔ repeat taps in the same tick do NOT start a second submission', async () => {
    stubGeolocation([OPEN_POS, OPEN_POS]);
    let release: (() => void) | undefined;
    mockCompleteDraft.mockImplementation(
      () => new Promise<void>((resolve) => { release = () => resolve(); }),
    );

    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());

    // Walk to the last question WITHOUT submitting.
    fireEvent.click(screen.getByTestId('continue-btn'));
    await waitFor(() => expect(screen.getByText('What is your full name?')).toBeInTheDocument());

    const btn = screen.getByTestId('continue-btn');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    // ⭐ Two queue rows from one interview is not merely untidy: AC12, in this same
    // story, would score the pair as duplicate fraud against the enumerator.
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalledTimes(1));
    expect(mockCompleteDraft).toHaveBeenCalledTimes(1);

    release?.();
    await waitFor(() => expect(screen.getByTestId('completion-screen')).toBeInTheDocument());
  });

  it('the button says what is happening and stops accepting taps', async () => {
    stubGeolocation([OPEN_POS, OPEN_POS]);
    mockCompleteDraft.mockImplementation(() => new Promise<void>(() => {}));

    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());
    await completeSurvey();

    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeDisabled());
    expect(screen.getByTestId('continue-btn')).toHaveTextContent('Saving');
  });
});

describe('13-71 U13 — a late capture cannot mutate a submission already being written', () => {
  /*
   * ⚠️ RETARGETED AFTER THE MUTATION SAID THE FIRST VERSION PROVED NOTHING.
   *
   * It drove the ESCAPE-HATCH exit, which spreads its own copy at the call site —
   * so neutering `snapshotAnswers` left the suite green. The object that actually
   * came from `snapshotAnswers` is the one the PRIMARY exit submits, and that is
   * the path this now uses. [[pattern-test-that-passes-over-a-hole]]
   */
  it('⛔ the answers handed to completeDraft are a SNAPSHOT, not the live accumulator', async () => {
    // The open-time capture is slow and still outstanding.
    let resolveOpenCapture: ((p: GeolocationPosition) => void) | undefined;
    setNavigatorProp('geolocation', {
      getCurrentPosition: (onOk: PositionCallback) => { resolveOpenCapture = onOk; },
    });
    // No submit-time refresh, so the primary exit returns the snapshot directly.
    setNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) });

    let releaseWrite: (() => void) | undefined;
    const answersSeen: Array<Record<string, unknown>> = [];
    mockCompleteDraft.mockImplementation((answers: Record<string, unknown>) => {
      answersSeen.push(answers);
      return new Promise<void>((resolve) => { releaseWrite = () => resolve(); });
    });

    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-capture-${GEO_NAME}`)).toBeInTheDocument());

    // The enumerator gets impatient and taps the button; THAT capture succeeds.
    const manual = { latitude: 7.5, longitude: 3.5, accuracy: 4 };
    setNavigatorProp('geolocation', {
      getCurrentPosition: (onOk: PositionCallback) =>
        onOk({ coords: manual } as GeolocationPosition),
    });
    fireEvent.click(screen.getByTestId(`geopoint-capture-${GEO_NAME}`));
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());

    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());

    // The ORIGINAL open-time promise finally lands, mid-write, with a DIFFERENT fix.
    await act(async () => {
      resolveOpenCapture?.({ coords: OPEN_POS } as GeolocationPosition);
    });
    releaseWrite?.();

    // ⛔ The queued interview keeps the position it was submitted with.
    expect(answersSeen[0][GEO_NAME]).toMatchObject({ latitude: manual.latitude });
  });
});

describe('13-71 U15 — a MANUAL capture failure is what gets filed', () => {
  it('⛔ a permission refusal on the manual button overrides the open-time timeout', async () => {
    // The open-time attempt TIMES OUT (concrete building); the enumerator walks
    // outside, taps the button, and is refused PERMISSION. Before U15 the page
    // never heard the second verdict and filed `timeout` — a phone problem
    // recorded as a signal problem, which is the one distinction AC4 exists for.
    const getCurrentPosition = vi.fn(
      (_ok: PositionCallback, onErr?: PositionErrorCallback) => {
        const code = getCurrentPosition.mock.calls.length === 1 ? 3 : 1;
        onErr?.({ code } as GeolocationPositionError);
      },
    );
    setNavigatorProp('geolocation', { getCurrentPosition });

    await renderPage();
    await waitFor(() => expect(screen.getByTestId(`geopoint-capture-${GEO_NAME}`)).toBeInTheDocument());

    fireEvent.click(screen.getByTestId(`geopoint-capture-${GEO_NAME}`));
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(2));

    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-unavailable-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('gps-unavailable-btn'));

    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    expect(submittedAnswers()._gpsUnavailableReason).toBe('permission_denied');
  });
});

// ── AC7 / AC3's fence — who is EXEMPT, and why ─────────────────────────────

describe('13-71 AC7 — the clerk path is exempt, and a test fails if the exemption is removed', () => {
  it('⛔ a CLERK submits the SAME geopoint form with no position and is NOT blocked', async () => {
    mockUserRole = 'data_entry_clerk';
    stubGeolocation([null], 1);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());

    await completeSurvey();

    // Same form, same failed capture, different role. A clerk transcribing a paper
    // form records the OFFICE; office coordinates filed as field captures would
    // poison the base map this story exists to enable.
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
  });

  it('a PUBLIC user is exempt too', async () => {
    mockUserRole = 'public_user';
    stubGeolocation([null], 1);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
  });

  it('a SUPERVISOR is exempt — everything unlisted maps to `webapp`, not to the field', async () => {
    mockUserRole = 'supervisor';
    stubGeolocation([null], 1);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
  });

  it('⛔ AC3 FENCE: a form serving NO geopoint question stays submittable by an enumerator', async () => {
    mockUserRole = 'enumerator';
    mockHookReturn = { data: noGeoForm, isLoading: false, error: null };
    setNavigatorProp('geolocation', undefined);
    await renderPage();

    await waitFor(() => expect(screen.getByText('What is your full name?')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('continue-btn'));

    // Two live submissions are in exactly this position (one on Public Core, one
    // on a deleted form row). A requirement nobody can satisfy is a lockout.
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
  });

  it('and a form with no geopoint question triggers no capture attempt at all', async () => {
    mockHookReturn = { data: noGeoForm, isLoading: false, error: null };
    const getCurrentPosition = stubGeolocation([OPEN_POS]);
    await renderPage();
    await waitFor(() => expect(screen.getByText('What is your full name?')).toBeInTheDocument());
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});

// ── Adversarial review findings ────────────────────────────────────────────

/**
 * ⛔ REVIEW R7 — A REOPENED SUBMISSION MUST NOT ACQUIRE A POSITION.
 *
 * `restoreToDraft` puts a REJECTED submission back into drafts behind a button
 * that promises "nothing is lost". The interview already happened, somewhere
 * else, possibly days earlier — so auto-capturing now files WHERE THE OPERATOR IS
 * STANDING TODAY as the place the work was done. On deploy day that is the
 * office at the end of the round, and in AC10's coverage read it is
 * indistinguishable from a genuine field capture.
 *
 * This is the harm that made the deploy-day queue rejection worse than a stuck
 * row: the documented recovery silently manufactured a false location.
 */
describe('13-71 review R7 — a restored draft never acquires a false position', () => {
  it('⛔ does NOT auto-capture when the draft is a reopened rejected submission', async () => {
    const getCurrentPosition = stubGeolocation([OPEN_POS]);
    mockResumeData = { formData: { full_name: 'Adebayo' }, questionPosition: 0, restored: true };

    await renderPage();

    // ⭐ Not "captured something else" — never asked the browser at all.
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('stamps the honest `other` instead, so the submission is not blocked', async () => {
    stubGeolocation([OPEN_POS]);
    mockResumeData = { formData: { full_name: 'Adebayo' }, questionPosition: 0, restored: true };

    await renderPage();
    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());

    // ⭐ It went through WITHOUT the escape-hatch panel: the stamped reason
    // satisfies AC3's gate on its own, so reopening never becomes a dead end.
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
    const answers = submittedAnswers();
    expect(answers._gpsUnavailableReason).toBe('other');
    // And no position was invented under the question name.
    expect(answers[GEO_NAME]).toBeUndefined();
  });

  /**
   * ⭐ THE OBVIOUS OBJECTION TO R7's FIX, ANSWERED RATHER THAN ASSERTED.
   *
   * Suppressing auto-capture on a reopened submission must NOT mean a reopened
   * submission can never carry a position. An enumerator who genuinely returns to
   * the door to redo the interview has to be able to take one — otherwise the fix
   * trades a false coordinate for a permanently missing one, which is the other
   * half of the same mistake.
   */
  it('⭐ a MANUAL capture on a restored draft still works, and clears the stamped `other`', async () => {
    const getCurrentPosition = vi.fn((onOk: PositionCallback) => {
      onOk({ coords: OPEN_POS } as GeolocationPosition);
    });
    setNavigatorProp('geolocation', { getCurrentPosition });
    mockResumeData = { formData: { full_name: 'Adebayo' }, questionPosition: 0, restored: true };

    await renderPage();
    // Nothing was captured automatically — that is R7.
    expect(getCurrentPosition).not.toHaveBeenCalled();

    // The enumerator is back at the door and taps the button themselves.
    fireEvent.click(screen.getByTestId(`geopoint-capture-${GEO_NAME}`));
    await waitFor(() => expect(screen.getByTestId(`geopoint-display-${GEO_NAME}`)).toBeInTheDocument());

    await completeSurvey();
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled());

    const answers = submittedAnswers();
    expect(answers[GEO_NAME]).toMatchObject({ latitude: OPEN_POS.latitude });
    // ⛔ And the honest `other` stamped at open is gone — a real position
    // supersedes it, or the row would carry both.
    expect(answers._gpsUnavailableReason).toBeUndefined();
  });

  it('⭐ an ORDINARY resumed draft still auto-captures — the guard is narrow', async () => {
    const getCurrentPosition = stubGeolocation([OPEN_POS]);
    mockResumeData = { formData: { full_name: 'Adebayo' }, questionPosition: 0, restored: false };

    await renderPage();

    // A draft the enumerator simply left mid-interview is still at the door.
    expect(getCurrentPosition).toHaveBeenCalled();
  });
});

/**
 * ⛔ REVIEW R9 — THE ESCAPE HATCH CLEARED ITSELF BEFORE AN UNGUARDED AWAIT.
 *
 * `setGpsBlocked(false)` ran before an unwrapped `await completeDraft(...)`, with
 * `setCompleted(true)` after it. When the draft write rejected — IndexedDB quota,
 * private browsing — the panel had already gone, no completion screen rendered,
 * and nothing said anything had failed. The enumerator was left on the last
 * question with the only submit path they had just used, gone.
 */
describe('13-71 review R9 — a failed escape-hatch submit says so', () => {
  it('⛔ keeps the panel and reports the failure instead of showing completion', async () => {
    stubGeolocation([null], 1); // permission denied → the block appears
    mockCompleteDraft.mockRejectedValue(new Error('QuotaExceededError'));

    await renderPage();
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-required-block')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('gps-unavailable-btn'));
    });

    // The action is still there to retry, and the failure is on screen.
    expect(screen.getByTestId('gps-required-block')).toBeInTheDocument();
    expect(screen.getByTestId('gps-submit-error')).toBeInTheDocument();
    // ⭐ And NOT a completion screen for a submission that was never queued.
    expect(screen.queryByTestId('gps-unavailable-btn')).toBeInTheDocument();
  });

  it('the happy path still completes — the guard did not break the ordinary case', async () => {
    stubGeolocation([null], 1);
    mockCompleteDraft.mockResolvedValue(undefined);

    await renderPage();
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-required-block')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('gps-unavailable-btn'));
    });

    expect(screen.queryByTestId('gps-submit-error')).not.toBeInTheDocument();
    expect(submittedAnswers()._gpsUnavailableReason).toBe('permission_denied');
  });
});

// ── STORY 13-75 — the blocked submit offers the fix ────────────────────────
/*
 * ⚠️ Every async query added below carries an explicit `{ timeout: N }`.
 * testing-library's `asyncUtilTimeout` is 1000 ms and is NOT governed by vitest's
 * `testTimeout` — a missing element under suite contention dies at 1 s
 * (pitfall-asyncutiltimeout-not-governed-by-testtimeout, 2026-09-26).
 */
const T = { timeout: 5000 };

/*
 * ⚠️ AC11 (added after review, ruled 2026-09-27) puts ONE silent capture at submit
 * when the open-time miss was RETRYABLE. So in every script below that opens on a
 * `3` (timeout) and then refuses, the SECOND call is that silent retry, and the
 * in-banner tap is the THIRD. The extra `3` in those scripts is that call failing
 * too — which is what it takes to reach the amber block at all now.
 */

/**
 * A geolocation whose calls are answered by `script[i]` for call i: a position,
 * an error code, or `'hold'` (never answers until `release(i, …)` is called).
 */
function scriptGeolocation(script: Array<typeof OPEN_POS | number | 'hold'>) {
  const held: Array<{ ok: PositionCallback; err?: PositionErrorCallback }> = [];
  const getCurrentPosition = vi.fn((onOk: PositionCallback, onErr?: PositionErrorCallback) => {
    const step = script[Math.min(getCurrentPosition.mock.calls.length - 1, script.length - 1)];
    if (step === 'hold') held.push({ ok: onOk, err: onErr });
    else if (typeof step === 'number') onErr?.({ code: step } as GeolocationPositionError);
    else onOk({ coords: step } as GeolocationPosition);
  });
  setNavigatorProp('geolocation', { getCurrentPosition });
  return {
    getCurrentPosition,
    resolveHeld: (index: number, pos: typeof OPEN_POS) => held[index]?.ok({ coords: pos } as GeolocationPosition),
    /** 13-75 review L1 — a held attempt that FAILS late, with a GeolocationPositionError code. */
    rejectHeld: (index: number, code: number) => held[index]?.err?.({ code } as GeolocationPositionError),
  };
}

/** Reach the amber block. */
async function reachBlock() {
  await renderPage();
  await completeSurvey();
  await waitFor(() => expect(screen.getByTestId('gps-required-block')).toBeInTheDocument(), T);
}

/** Back from the last question; waits for the 50 ms slide to actually land on Q1. */
async function goBackToLocation() {
  fireEvent.click(screen.getByTestId('back-btn'));
  await waitFor(() => expect(screen.getByText('Where is this interview?')).toBeInTheDocument(), T);
  expect(screen.queryByTestId('gps-required-block')).toBeNull();
}

describe('13-75 AC1/AC3/AC10 — the block carries a live capture, and success submits', () => {
  it('⭐ a successful in-banner capture commits the WHOLE position and retries the submit — one tap', async () => {
    // Open-time capture times out (the field case), so does AC11's silent retry at
    // submit; the in-banner tap succeeds.
    const { getCurrentPosition } = scriptGeolocation([3, 3, OPEN_POS]);
    await reachBlock();
    expect(mockCompleteDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));

    expect(await screen.findByTestId('completion-screen', {}, T)).toBeInTheDocument();
    expect(getCurrentPosition).toHaveBeenCalledTimes(3);
    expect(mockCompleteDraft).toHaveBeenCalledTimes(1);
    const answers = submittedAnswers();
    // AC10 — accuracy rides along exactly as from every other site.
    expect(answers[GEO_NAME]).toEqual(OPEN_POS);
    // AC2 — and no reason beside a real position.
    expect(answers._gpsUnavailableReason).toBeUndefined();
  });

  it('⛔ AC3 — a failed retry reports through submit-error-block and NEVER shows completion', async () => {
    scriptGeolocation([3, 3, OPEN_POS]);
    mockCompleteDraft.mockRejectedValue(new Error('QuotaExceededError'));
    await reachBlock();

    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));

    expect(await screen.findByTestId('submit-error-block', {}, T)).toBeInTheDocument();
    expect(screen.queryByTestId('completion-screen')).toBeNull();
    // GPS is no longer the blocker, so the amber panel is retired (U13) — the
    // storage failure is what is reported, on its own panel (U5).
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
  });

  it('⛔ AC2 / Task 1.3 — the in-banner fix reaches the RENDERED field, not only the payload', async () => {
    // A failed write leaves the enumerator on the form; going Back to the location
    // question must show the position the banner just took. Without
    // `commitGeopoint`'s `setValue` the field renders an untouched capture button
    // over a survey that holds a position (13-71 Task 3.2's reasoning).
    scriptGeolocation([3, 3, OPEN_POS]);
    mockCompleteDraft.mockRejectedValue(new Error('QuotaExceededError'));
    await reachBlock();
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await screen.findByTestId('submit-error-block', {}, T);

    fireEvent.click(screen.getByTestId('back-btn'));

    expect(await screen.findByTestId(`geopoint-display-${GEO_NAME}`, {}, T)).toHaveTextContent('7.3775° N');
  });

  it('the capture button shows it is working and stops accepting taps while in flight', async () => {
    const { getCurrentPosition } = scriptGeolocation([3, 3, 'hold']);
    await reachBlock();

    const btn = screen.getByTestId('gps-block-capture-btn');
    /*
     * ⚠️ BOTH TAPS INSIDE ONE act(), and the mutation is why. With two bare
     * `fireEvent.click`s, RTL flushes the `setGpsBlockCapturing(true)` re-render
     * between them, the second lands on a DISABLED button, and deleting the
     * `gpsBlockCaptureInFlightRef` guard left this test green — U8's hole again.
     * One act() holds the re-render until both taps have landed, which is what a
     * double-tap on a slow phone actually does.
     */
    act(() => {
      btn.click();
      btn.click();
    });
    await waitFor(() => expect(screen.getByTestId('gps-block-capture-btn')).toBeDisabled(), T);
    expect(screen.getByTestId('gps-block-capture-btn')).toHaveTextContent('Capturing location');
    // Open-time + AC11 silent retry + ONE in-banner attempt, however many taps.
    expect(getCurrentPosition).toHaveBeenCalledTimes(3);
  });

  it('⛔ Back during an in-flight capture withdraws the submit — a late fix is kept, not submitted', async () => {
    const { resolveHeld } = scriptGeolocation([3, 3, 'hold']);
    await reachBlock();

    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(screen.getByTestId('gps-block-capture-btn')).toBeDisabled(), T);

    await goBackToLocation();

    await act(async () => {
      resolveHeld(0, OPEN_POS);
    });

    // U10's shape again if it submitted: the panel following the enumerator.
    expect(mockCompleteDraft).not.toHaveBeenCalled();
    expect(screen.queryByTestId('completion-screen')).toBeNull();
    // But a real position is a real position.
    expect(await screen.findByTestId(`geopoint-display-${GEO_NAME}`, {}, T)).toBeInTheDocument();
  });
});

describe('13-75 AC4/AC5 — guidance names what is actually wrong', () => {
  it('position_unavailable → the phone’s Location toggle', async () => {
    scriptGeolocation([2]);
    await reachBlock();
    expect(screen.getByTestId('gps-block-remediation')).toHaveTextContent(/location may be switched off/);
  });

  it('⛔ AC5 — permission_denied names the site permission AND the OS Location toggle', async () => {
    scriptGeolocation([1]);
    await reachBlock();
    const copy = screen.getByTestId('gps-block-remediation');
    expect(copy).toHaveTextContent(/blocked for this site/);
    expect(copy).toHaveTextContent(/Location Services/);
  });

  it('timeout → move, then capture again', async () => {
    scriptGeolocation([3]);
    await reachBlock();
    expect(screen.getByTestId('gps-block-remediation')).toHaveTextContent(/Step outside/);
  });

  it('⛔ the dead-end instruction is gone — nothing says "go back to the location question"', async () => {
    scriptGeolocation([3]);
    await reachBlock();
    expect(screen.getByTestId('gps-required-block')).not.toHaveTextContent(/go back/i);
  });
});

describe('13-75 AC6 — the waiver is demoted and gated by retryability', () => {
  it.each([
    ['timeout', 3],
    ['position_unavailable', 2],
  ])('⛔ %s (retryable) hides the waiver until an in-banner attempt has failed', async (_label, code) => {
    scriptGeolocation([code]);
    await reachBlock();

    expect(screen.queryByTestId('gps-unavailable-btn')).toBeNull();
    expect(screen.getByTestId('gps-waiver-pending')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));

    expect(await screen.findByTestId('gps-unavailable-btn', {}, T)).toBeInTheDocument();
    expect(screen.queryByTestId('gps-waiver-pending')).toBeNull();
  });

  it('permission_denied (settled) offers the waiver at once — no forced attempts', async () => {
    scriptGeolocation([1]);
    await reachBlock();
    expect(screen.getByTestId('gps-unavailable-btn')).toBeInTheDocument();
  });

  it('unsupported (settled) offers the waiver at once', async () => {
    setNavigatorProp('geolocation', undefined);
    await reachBlock();
    expect(screen.getByTestId('gps-unavailable-btn')).toBeInTheDocument();
  });

  it('the waiver cannot be tapped while a capture is in flight', async () => {
    scriptGeolocation([1, 'hold']);
    await reachBlock();
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(screen.getByTestId('gps-unavailable-btn')).toBeDisabled(), T);
  });
});

describe('13-75 AC9 — the waiver files the reason LAST observed', () => {
  it('⛔ open-time timeout, in-banner permission_denied → files permission_denied, not timeout', async () => {
    scriptGeolocation([3, 3, 1]);
    await reachBlock();

    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    // The guidance follows the new verdict too.
    await waitFor(
      () => expect(screen.getByTestId('gps-block-remediation')).toHaveTextContent(/blocked for this site/),
      T,
    );

    fireEvent.click(screen.getByTestId('gps-unavailable-btn'));
    await waitFor(() => expect(mockCompleteDraft).toHaveBeenCalled(), T);
    expect(submittedAnswers()._gpsUnavailableReason).toBe('permission_denied');
  });
});

describe('13-75 AC7 — discovery moves earlier, without a standing banner', () => {
  it('a failed open-time capture is explained ON the location question, before any submit', async () => {
    scriptGeolocation([2]);
    await renderPage();

    expect(
      await screen.findByTestId(`geopoint-remediation-${GEO_NAME}`, {}, T),
    ).toHaveTextContent(/location may be switched off/);
    // ⛔ And the end-of-form block is still submit-triggered (13-71's ruling).
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
  });

  it('a successful open-time capture shows no guidance at all', async () => {
    scriptGeolocation([OPEN_POS]);
    await renderPage();
    await screen.findByTestId(`geopoint-display-${GEO_NAME}`, {}, T);
    expect(screen.queryByTestId(`geopoint-remediation-${GEO_NAME}`)).toBeNull();
  });
});

describe('13-75 AC8 — U10 must not regress, and the new state clears with it', () => {
  it('⛔ Back clears the block AND the failed-attempt count, so the next refusal gates the waiver again', async () => {
    scriptGeolocation([3]);
    await reachBlock();

    // One failed in-banner attempt releases the waiver…
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await screen.findByTestId('gps-unavailable-btn', {}, T);

    // …Back retires the panel (U10)…
    await goBackToLocation();

    // …and the next refusal starts from zero attempts: nobody has tried yet.
    await completeSurvey();
    await screen.findByTestId('gps-required-block', {}, T);
    expect(screen.queryByTestId('gps-unavailable-btn')).toBeNull();
    expect(screen.getByTestId('gps-waiver-pending')).toBeInTheDocument();
  });

  it('⛔ Back while a capture is in flight leaves the NEXT panel’s capture button live', async () => {
    const { getCurrentPosition } = scriptGeolocation([3, 3, 'hold', 3, 'hold']);
    await reachBlock();
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(screen.getByTestId('gps-block-capture-btn')).toBeDisabled(), T);

    await goBackToLocation();
    await completeSurvey();
    await screen.findByTestId('gps-required-block', {}, T);

    expect(screen.getByTestId('gps-block-capture-btn')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(5), T);
  });
});

// ── STORY 13-75 — ADVERSARIAL REVIEW FOLLOW-UPS ────────────────────────────
/*
 * Each of these was first a FAILING probe against the uncommitted code (review
 * 2026-09-27), and each is RED-verified by deleting the fix it covers.
 */
describe('13-75 review H1 — a discarded interview is never queued by a capture still in flight', () => {
  it('⛔ a fix arriving while the Discard confirm is open does NOT queue the declined interview', async () => {
    const { resolveHeld } = scriptGeolocation([3, 3, 'hold']);
    await reachBlock();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Declined Respondent' } });
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(screen.getByTestId('gps-block-capture-btn')).toBeDisabled(), T);

    // The position lands while the operator is reading the confirm: in a browser
    // the callback queues behind the dialog and runs inside `discardDraft`'s await,
    // BEFORE the answers are reset. Before the fix this queued the whole interview
    // (name, reference code, position) under a NEW draft id.
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => {
      resolveHeld(0, OPEN_POS);
      return true;
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('discard-interview-btn'));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    confirmSpy.mockRestore();

    expect(mockCompleteDraft).not.toHaveBeenCalled();
  });

  it('⛔ a fix arriving after the discarded page has unmounted queues nothing either', async () => {
    const { resolveHeld } = scriptGeolocation([3, 3, 'hold']);
    await reachBlock();
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(screen.getByTestId('gps-block-capture-btn')).toBeDisabled(), T);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      fireEvent.click(screen.getByTestId('discard-interview-btn'));
    });
    await waitFor(() => expect(screen.queryByTestId('question-card')).toBeNull(), T);
    confirmSpy.mockRestore();

    await act(async () => {
      resolveHeld(0, OPEN_POS);
      await new Promise((r) => setTimeout(r, 50));
    });

    // Before the fix: a queued `{ site_location }` with no interview behind it.
    expect(mockCompleteDraft).not.toHaveBeenCalled();
  });
});

describe('13-75 review M1 — one interview is submitted once', () => {
  it('⛔ an in-banner success landing AFTER the survey completed does not submit it again', async () => {
    // Open-time still out at the refusal; the in-banner attempt is out too; the
    // third call is the submit-time refresh.
    const { resolveHeld } = scriptGeolocation(['hold', 'hold', SUBMIT_POS]);
    await reachBlock();
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(screen.getByTestId('gps-block-capture-btn')).toBeDisabled(), T);

    // The open-time fix lands — U13 retires the panel — and the enumerator does
    // what the screen now invites: Complete Survey.
    await act(async () => {
      resolveHeld(0, OPEN_POS);
    });
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
    fireEvent.click(screen.getByTestId('continue-btn'));
    await screen.findByTestId('completion-screen', {}, T);
    expect(mockCompleteDraft).toHaveBeenCalledTimes(1);

    // The in-banner attempt settles last. Before the fix: a SECOND completeDraft,
    // from the completion screen, rewriting the queued row with another position.
    await act(async () => {
      resolveHeld(1, SUBMIT_POS);
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockCompleteDraft).toHaveBeenCalledTimes(1);
  });
});

describe('13-75 review L1 — a late in-banner FAILURE after Back is the verdict the next panel reads', () => {
  it('open-time timeout, Back, the withdrawn attempt fails permission_denied → the next panel says so, waiver at once', async () => {
    const { rejectHeld } = scriptGeolocation([3, 3, 'hold']);
    await reachBlock();
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(screen.getByTestId('gps-block-capture-btn')).toBeDisabled(), T);

    await goBackToLocation();
    await act(async () => {
      rejectHeld(0, 1);
    });

    await completeSurvey();
    await screen.findByTestId('gps-required-block', {}, T);
    // Before the fix: the stale `timeout` copy, and the waiver withheld on it.
    expect(screen.getByTestId('gps-block-remediation')).toHaveTextContent(/blocked for this site/);
    expect(screen.getByTestId('gps-unavailable-btn')).toBeInTheDocument();
  });
});

/** A form whose geopoint is the LAST question, so the question and the block share a screen. */
const geoLastForm: FlattenedForm = {
  ...geoForm,
  formId: 'geo-last-form',
  questions: [
    { ...geoForm.questions[1], sectionId: 's1', sectionTitle: 'General' },
    { ...geoForm.questions[0], sectionId: 's2', sectionTitle: 'Location' },
  ],
};

/** A form whose ONLY question is the geopoint. */
const geoOnlyForm: FlattenedForm = { ...geoForm, formId: 'geo-only-form', questions: [geoForm.questions[0]] };

describe('13-75 review L2/L5 — when the location question and the block share a screen', () => {
  it('⛔ L5 — the question shows the SAME, newest reason as the block beside it', async () => {
    mockHookReturn = { data: geoLastForm, isLoading: false, error: null };
    // open-time: timeout · GeopointInput tap: timeout · AC11 silent retry: timeout · in-banner: permission_denied
    scriptGeolocation([3, 3, 3, 1]);
    await renderPage();
    fireEvent.click(screen.getByTestId('continue-btn'));
    await waitFor(() => expect(screen.getByText('Where is this interview?')).toBeInTheDocument(), T);

    fireEvent.click(screen.getByTestId(`geopoint-capture-${GEO_NAME}`));
    await waitFor(
      () => expect(screen.getByTestId(`geopoint-remediation-${GEO_NAME}`)).toHaveTextContent(/Step outside/),
      T,
    );

    fireEvent.click(screen.getByTestId('continue-btn')); // Complete Survey → refused
    await screen.findByTestId('gps-required-block', {}, T);
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));

    await waitFor(
      () => expect(screen.getByTestId('gps-block-remediation')).toHaveTextContent(/blocked for this site/),
      T,
    );
    // Before the fix: the question kept its own older `timeout` copy.
    expect(screen.getByTestId(`geopoint-remediation-${GEO_NAME}`)).toHaveTextContent(/blocked for this site/);
  });

  it('⛔ L2 — a manual capture retires a stale "did not save" notice, not only the panel', async () => {
    mockHookReturn = { data: geoOnlyForm, isLoading: false, error: null };
    // open-time: permission_denied (waiver at once) · then the manual button succeeds.
    scriptGeolocation([1, OPEN_POS]);
    mockCompleteDraft.mockRejectedValueOnce(new Error('QuotaExceededError'));
    await renderPage();

    fireEvent.click(screen.getByTestId('continue-btn')); // Complete Survey → refused
    await screen.findByTestId('gps-required-block', {}, T);
    fireEvent.click(screen.getByTestId('gps-unavailable-btn')); // the waiver's write fails
    await screen.findByTestId('gps-submit-error', {}, T);

    fireEvent.click(screen.getByTestId(`geopoint-capture-${GEO_NAME}`)); // and now it works
    await screen.findByTestId(`geopoint-display-${GEO_NAME}`, {}, T);

    // The position answers the panel (U13), and the failure notice goes with it:
    // nothing has been retried yet, so "That did not save" would describe an
    // attempt that is no longer the state of the survey.
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
    expect(screen.queryByTestId('submit-error-block')).toBeNull();
  });
});

describe('13-75 review H1 — the guard is the page going away, not only the Discard button', () => {
  it('⛔ ANY unmount mid-capture (router back, closed tab-view) queues nothing', async () => {
    const { resolveHeld } = scriptGeolocation([3, 3, 'hold']);
    const { unmount } = await renderPage();
    await completeSurvey();
    await screen.findByTestId('gps-required-block', {}, T);
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));
    await waitFor(() => expect(screen.getByTestId('gps-block-capture-btn')).toBeDisabled(), T);

    unmount();
    await act(async () => {
      resolveHeld(0, OPEN_POS);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockCompleteDraft).not.toHaveBeenCalled();
  });

  it('⛔ and under StrictMode the flag does NOT latch — the in-banner fix still submits (U9’s shape)', async () => {
    /*
     * The flag is set true by an unmount cleanup. StrictMode runs mount → cleanup →
     * mount and KEEPS the ref, so a flag that is only ever set true would be
     * latched from the first render and the one-tap recovery would silently never
     * submit in development — exactly how U9 hid auto-capture.
     */
    // Order-independent: every attempt times out until the phone gets a fix, which
    // it does just before the in-banner tap — however many open-time attempts
    // StrictMode's double mount started.
    let hasFix = false;
    setNavigatorProp('geolocation', {
      getCurrentPosition: vi.fn((onOk: PositionCallback, onErr?: PositionErrorCallback) => {
        if (hasFix) onOk({ coords: OPEN_POS } as GeolocationPosition);
        else onErr?.({ code: 3 } as GeolocationPositionError);
      }),
    });
    await act(async () => {
      render(
        <StrictMode>
          <MemoryRouter initialEntries={['/survey/geo-form-id']}>
            <Routes>
              <Route path="/survey/:formId" element={<FormFillerPage mode="fill" />} />
            </Routes>
          </MemoryRouter>
        </StrictMode>,
      );
    });
    await completeSurvey();
    await screen.findByTestId('gps-required-block', {}, T);

    hasFix = true;
    fireEvent.click(screen.getByTestId('gps-block-capture-btn'));

    expect(await screen.findByTestId('completion-screen', {}, T)).toBeInTheDocument();
    expect(mockCompleteDraft).toHaveBeenCalledTimes(1);
  });
});

// ── STORY 13-75 AC11 — a retryable miss gets ONE silent retry before any refusal ──
/*
 * Ruled by Awwal 2026-09-27 as a scope addition, to close R4: AC7's hint cannot
 * reach a `timeout` on `oslsr_master_v3` (the location question is screen 1 and the
 * miss lands after the enumerator has left it) — and a timeout is not something an
 * enumerator can read their way out of. The phone needs another go.
 */
describe('13-75 AC11 — the silent retry at submit', () => {
  it('⭐ the field case: open-time TIMEOUT, then Complete Survey → submitted with NO block and NO tap', async () => {
    const { getCurrentPosition } = scriptGeolocation([3, OPEN_POS]);
    await renderPage();
    await completeSurvey();

    expect(await screen.findByTestId('completion-screen', {}, T)).toBeInTheDocument();
    expect(screen.queryByTestId('gps-required-block')).toBeNull();
    // Open-time + exactly ONE silent retry. Not a loop.
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    const answers = submittedAnswers();
    expect(answers[GEO_NAME]).toEqual(OPEN_POS);
    // AC2 — a position, and no reason beside it.
    expect(answers._gpsUnavailableReason).toBeUndefined();
  });

  it('a failed silent retry refuses with the NEWEST reason, and the waiver still waits for a human attempt', async () => {
    // Open-time timeout; the silent retry comes back position_unavailable.
    const { getCurrentPosition } = scriptGeolocation([3, 2]);
    await reachBlock();

    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    // AC9 — the block describes the retry's verdict, not the open-time one.
    expect(screen.getByTestId('gps-block-remediation')).toHaveTextContent(/location may be switched off/);
    // AC6 — a silent attempt is not the enumerator's attempt; the waiver still waits.
    expect(screen.queryByTestId('gps-unavailable-btn')).toBeNull();
    expect(screen.getByTestId('gps-waiver-pending')).toBeInTheDocument();
  });

  it('⛔ a SETTLED reason (permission_denied) gets no silent retry — asking again changes nothing', async () => {
    const { getCurrentPosition } = scriptGeolocation([1]);
    await reachBlock();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('⛔ no retry while the browser would have to PROMPT — never a dialog on top of Complete Survey', async () => {
    setNavigatorProp('permissions', { query: async () => ({ state: 'prompt' }) });
    const { getCurrentPosition } = scriptGeolocation([3]);
    await reachBlock();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('⛔ no retry while the open-time capture is still running — never two captures at once', async () => {
    const { getCurrentPosition } = scriptGeolocation(['hold']);
    await reachBlock();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('⛔ a CLERK is never captured silently — office coordinates are not field captures (13-71 AC7)', async () => {
    mockUserRole = 'data_entry_clerk';
    // No open-time capture for a clerk; their own tap times out, which records a
    // retryable reason — exactly what would arm the retry without the role fence.
    const getCurrentPosition = stubGeolocation([null], 3);
    await renderPage();
    fireEvent.click(screen.getByTestId(`geopoint-capture-${GEO_NAME}`));
    await waitFor(() => expect(screen.getByTestId(`geopoint-remediation-${GEO_NAME}`)).toBeInTheDocument(), T);
    await completeSurvey();

    await screen.findByTestId('completion-screen', {}, T);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(submittedAnswers()[GEO_NAME]).toBeUndefined();
  });

  it('⛔ a REOPENED submission is never captured silently — a false coordinate is worse than none (13-71 R7)', async () => {
    mockResumeData = { formData: {}, questionPosition: 0, restored: true };
    const getCurrentPosition = stubGeolocation([null], 3);
    await renderPage();
    // No open-time capture on a restored draft; a manual tap times out and records
    // a retryable reason.
    fireEvent.click(screen.getByTestId(`geopoint-capture-${GEO_NAME}`));
    await waitFor(() => expect(screen.getByTestId(`geopoint-remediation-${GEO_NAME}`)).toBeInTheDocument(), T);
    await completeSurvey();

    await screen.findByTestId('completion-screen', {}, T);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(submittedAnswers()[GEO_NAME]).toBeUndefined();
  });

  it('the wait is VISIBLE and Back is off while the silent retry decides', async () => {
    const { resolveHeld } = scriptGeolocation([3, 'hold']);
    await renderPage();
    await completeSurvey();

    await waitFor(() => expect(screen.getByTestId('continue-btn')).toHaveTextContent('Getting location'), T);
    expect(screen.getByTestId('continue-btn')).toBeDisabled();
    expect(screen.getByTestId('back-btn')).toBeDisabled();

    await act(async () => {
      resolveHeld(0, OPEN_POS);
    });
    expect(await screen.findByTestId('completion-screen', {}, T)).toBeInTheDocument();
  });

  it('⛔ and the SAME holds for the 13-71 refresh over a held position — Back there used to submit anyway', async () => {
    // Open-time succeeds; the submit-time refresh is held.
    const { resolveHeld } = scriptGeolocation([OPEN_POS, 'hold']);
    await renderPage();
    await completeSurvey();

    await waitFor(() => expect(screen.getByTestId('back-btn')).toBeDisabled(), T);
    expect(screen.getByTestId('continue-btn')).toHaveTextContent('Getting location');

    await act(async () => {
      resolveHeld(0, SUBMIT_POS);
    });
    expect(await screen.findByTestId('completion-screen', {}, T)).toBeInTheDocument();
  });
});
