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
  await waitFor(() => expect(screen.getByText('What is your full name?')).toBeInTheDocument());
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

  it('offers exactly ONE action, and it is a confirmation rather than a diagnosis', async () => {
    stubGeolocation([null], 1);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('continue-btn')).toBeInTheDocument());
    await completeSurvey();
    await waitFor(() => expect(screen.getByTestId('gps-required-block')).toBeInTheDocument());

    const block = screen.getByTestId('gps-required-block');
    // ⛔ One button. Not a <select>, not a list of causes whose first item is the
    // easy way out of the requirement.
    expect(block.querySelectorAll('button')).toHaveLength(1);
    expect(block.querySelector('select')).toBeNull();
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
    await waitFor(() => expect(screen.getByTestId('gps-unavailable-btn')).toBeInTheDocument());

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
