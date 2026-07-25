// @vitest-environment jsdom

/**
 * Story 13-35 AC2 (code-review H1/H2) — WIZARD-LEVEL regression for the
 * all-prefilled-section skip on the public path.
 *
 * Why this file exists at all: AC2 was originally signed off with a unit test in
 * `section-relevance.test.ts` that hand-supplied the hidden-name set and a
 * hand-mirrored step model. That test is green against a BROKEN wizard, because
 * it feeds in the very state production had not computed yet:
 *
 *   `WizardPage` used to read the hide-set from
 *   `draft.formData.prefilledQuestionNames`, which is stamped by
 *   `Step4Questionnaire`'s effect — i.e. by the step the skip is meant to avoid.
 *   On a FIRST forward pass that array is empty, so an all-prefilled section
 *   looked like it had visible questions, the wizard navigated into it, and
 *   FormRenderer painted "No questions available" — the 13-29 dead-end, back
 *   through the bootstrap door. See [[pattern-ship-a-fix-that-never-fires]].
 *
 * So these tests drive the REAL wizard: Step1/Step2 write identity through
 * `mergeFields` exactly as the production steps do, and the assertions are about
 * what the user actually sees. Revert `unreachableQuestionNames` to the
 * draft-derived version and this file goes red; the unit test would not.
 *
 * Sibling of `WizardPage.geopointSuppression.test.tsx` (13-34), which guards the
 * same dead-end class for suppressed geopoints.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

expect.extend(matchers);
afterEach(cleanup);

const { mockFetchWizardDraft, mockFetchPublicActiveForm } = vi.hoisted(() => ({
  mockFetchWizardDraft: vi.fn(),
  mockFetchPublicActiveForm: vi.fn(),
}));

vi.mock('../../api/wizard.api', () => ({
  submitWizard: vi.fn(),
  requestMagicLink: vi.fn(),
  saveWizardDraft: vi.fn(),
  fetchWizardDraft: mockFetchWizardDraft,
  fetchPublicLgas: vi.fn().mockResolvedValue([]),
  fetchPublicActiveForm: mockFetchPublicActiveForm,
  derivePendingNin: (fd: { pendingNinToggle?: boolean; nin?: string }) =>
    fd.pendingNinToggle === true || !fd.nin,
}));

vi.mock('../../../forms/api/nin-check.api', () => ({
  checkNinAvailability: vi.fn().mockResolvedValue({ available: true }),
}));

// Step1/Step2 stubs write identity through mergeFields exactly as the real
// steps do — this is the sequence that leaves `prefilledQuestionNames` empty at
// the moment the skip decision is taken.
vi.mock('../Step1BasicInfo', () => ({
  Step1BasicInfo: ({
    mergeFields,
    onContinue,
  }: {
    mergeFields: (p: Record<string, unknown>) => void;
    onContinue: () => void;
  }) => (
    <button
      data-testid="Step1BasicInfo-continue"
      onClick={() => {
        mergeFields({ givenName: 'Ade', familyName: 'Ola' });
        onContinue();
      }}
    >
      Continue
    </button>
  ),
}));
vi.mock('../Step2ContactLga', () => ({
  Step2ContactLga: ({
    mergeFields,
    onContinue,
  }: {
    mergeFields: (p: Record<string, unknown>) => void;
    onContinue: () => void;
  }) => (
    <button
      data-testid="Step2ContactLga-continue"
      onClick={() => {
        mergeFields({ phone: '08030000000', email: 'ade@example.com' });
        onContinue();
      }}
    >
      Continue
    </button>
  ),
}));
vi.mock('../Step3Consent', () => ({
  Step3Consent: ({ onContinue }: { onContinue: () => void }) => (
    <button data-testid="Step3Consent-continue" onClick={onContinue}>
      Continue
    </button>
  ),
}));
// The Review stub surfaces the completeness gate, so a test can prove Submit is
// not hard-blocked when sections were skipped (see the gap-3 test below).
vi.mock('../Step5ReviewAndSave', () => ({
  Step5ReviewAndSave: ({ incompleteQuestionnaire }: { incompleteQuestionnaire: boolean }) => (
    <div data-testid="review-stub" data-incomplete={String(incompleteQuestionnaire)}>
      Review
    </div>
  ),
}));

import WizardPage from '../WizardPage';

function question(
  id: string,
  name: string,
  label: string,
  sectionId: string,
  sectionTitle: string,
) {
  return { id, type: 'text', name, label, required: true, sectionId, sectionTitle };
}

/** Section 1 is identity-ONLY (every question wizard-provided) — the real shape
 *  of Public Core's first section, and the one the blast audience hits first. */
const FORM_IDENTITY_FIRST = {
  formId: 'f-prefill',
  title: 'Public Core',
  version: '1.0.0',
  questions: [
    question('q-name', 'full_name', 'Full Name', 'grp_id', 'Your details'),
    question('q-phone', 'phone', 'Phone Number', 'grp_id', 'Your details'),
    question('q-occ', 'main_occupation', 'Main Occupation', 'grp_work', 'Your work'),
  ],
  choiceLists: {},
  sectionShowWhen: {},
  calculations: [],
};

/** EVERY question is wizard-provided — the whole-questionnaire case (AC2). */
const FORM_ALL_PREFILLED = {
  ...FORM_IDENTITY_FIRST,
  formId: 'f-all-prefill',
  questions: [
    question('q-name', 'full_name', 'Full Name', 'grp_id', 'Your details'),
    question('q-phone', 'phone', 'Phone Number', 'grp_id', 'Your details'),
    question('q-email', 'email', 'Email Address', 'grp_contact', 'Contact'),
  ],
};

function renderWizard(entry = '/register') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/register" element={<WizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function advancePastHeadSteps() {
  await userEvent.click(await screen.findByTestId('Step1BasicInfo-continue'));
  await userEvent.click(await screen.findByTestId('Step2ContactLga-continue'));
  await userEvent.click(await screen.findByTestId('Step3Consent-continue'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchWizardDraft.mockResolvedValue(null);
});

describe('WizardPage — all-prefilled section skip (Story 13-35 AC2)', () => {
  it('skips an all-prefilled FIRST section on the first forward pass (no dead-end)', async () => {
    mockFetchPublicActiveForm.mockResolvedValue(FORM_IDENTITY_FIRST);
    renderWizard();
    await advancePastHeadSteps();

    // The identity section holds nothing the user can answer, so Continue from
    // Consent must land on the next LIVE section — never on the empty state.
    expect(await screen.findByText('Main Occupation')).toBeInTheDocument();
    expect(screen.queryByTestId('form-renderer-empty')).not.toBeInTheDocument();
    expect(screen.queryByText('Full Name')).not.toBeInTheDocument();
  });

  it('skips straight to Review when the WHOLE questionnaire is prefilled', async () => {
    mockFetchPublicActiveForm.mockResolvedValue(FORM_ALL_PREFILLED);
    renderWizard();
    await advancePastHeadSteps();

    await waitFor(() => expect(screen.getByTestId('review-stub')).toBeInTheDocument());
    expect(screen.queryByTestId('form-renderer-empty')).not.toBeInTheDocument();
  });

  it('does NOT over-skip: a section with one live question still stops the user', async () => {
    mockFetchPublicActiveForm.mockResolvedValue(FORM_IDENTITY_FIRST);
    renderWizard();
    await advancePastHeadSteps();

    // grp_work has a real question, so the user is held there rather than being
    // fast-forwarded past answerable content.
    expect(await screen.findByText('Main Occupation')).toBeInTheDocument();
    expect(screen.queryByTestId('review-stub')).not.toBeInTheDocument();
  });

  it('Back from a live section retreats PAST the all-prefilled one, not onto it', async () => {
    mockFetchPublicActiveForm.mockResolvedValue(FORM_IDENTITY_FIRST);
    renderWizard();
    await advancePastHeadSteps();
    await screen.findByText('Main Occupation');

    // Back must not strand the user on the identity section it just skipped.
    await userEvent.click(screen.getByTestId('wizard-nav-back'));

    expect(await screen.findByTestId('Step3Consent-continue')).toBeInTheDocument();
    expect(screen.queryByTestId('form-renderer-empty')).not.toBeInTheDocument();
  });
});

/**
 * The two edges the first round of this fix did NOT cover — both found by
 * re-reviewing the fix itself.
 */
describe('WizardPage — all-prefilled skip, arrival + submit edges (13-35 review follow-up)', () => {
  it('a RESUMED draft saved ON an all-prefilled section is corrected forward, not stranded', async () => {
    // Pre-fix builds DID land users on the all-prefilled section, so real drafts
    // record exactly this `currentStep`. `isStepSkippable` used to be consulted
    // only by Continue/Back, so arriving here showed the dead-end regardless.
    mockFetchPublicActiveForm.mockResolvedValue(FORM_IDENTITY_FIRST);
    mockFetchWizardDraft.mockResolvedValue({
      currentStep: 4, // 1-indexed on the server → local index 3 == grp_id
      formData: {
        givenName: 'Ade',
        familyName: 'Ola',
        phone: '08030000000',
        email: 'ade@example.com',
      },
      lastUpdatedAt: '2026-07-25T00:00:00.000Z',
      expiresAt: '2026-08-28T00:00:00.000Z',
    });

    renderWizard('/register?token=resume-token');

    expect(await screen.findByText('Main Occupation')).toBeInTheDocument();
    expect(screen.queryByTestId('form-renderer-empty')).not.toBeInTheDocument();
  });

  it('does not hard-block Submit when EVERY section was skipped (prefill still reaches the gate)', async () => {
    // Step4Questionnaire is the only writer of the prefill into
    // questionnaireResponses — and when all sections skip it never mounts. If the
    // Review gate read the raw draft, these required identity questions would
    // look unanswered and Submit would block on a step that renders nothing.
    mockFetchPublicActiveForm.mockResolvedValue(FORM_ALL_PREFILLED);
    renderWizard();
    await advancePastHeadSteps();

    const review = await screen.findByTestId('review-stub');
    expect(review).toHaveAttribute('data-incomplete', 'false');
  });
});
