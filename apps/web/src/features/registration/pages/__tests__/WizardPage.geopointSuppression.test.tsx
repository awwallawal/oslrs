// @vitest-environment jsdom

/**
 * Story 13-34 AC2 (code-review H2 + M1) — WIZARD-LEVEL regression for geopoint
 * suppression on the public path.
 *
 * `FormRenderer.suppressGeopoint.test.tsx` pins the component contract; this
 * test guards the WIRING that would actually break in production and that a
 * component-only test cannot see:
 *
 *   1. Step4Questionnaire really passes `suppressGeopoint` — delete that prop
 *      and this test goes red (the pure-component suite would stay green:
 *      [[pattern-ship-a-fix-that-never-fires]]).
 *   2. A section left with ONLY a suppressed geopoint is AUTO-SKIPPED by
 *      `WizardPage.isStepSkippable`. Without the hide-set union the wizard
 *      happily navigates to that step and FormRenderer paints "No questions
 *      available" — the 13-29 dead-end, reintroduced through a different door.
 *
 * Step1–3 + Review are stubbed; Step4 is the REAL component so the prop
 * threading is exercised end to end.
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

vi.mock('../Step1BasicInfo', () => ({
  Step1BasicInfo: ({ onContinue }: { onContinue: () => void }) => (
    <button data-testid="Step1BasicInfo-continue" onClick={onContinue}>Continue</button>
  ),
}));
vi.mock('../Step2ContactLga', () => ({
  Step2ContactLga: ({ onContinue }: { onContinue: () => void }) => (
    <button data-testid="Step2ContactLga-continue" onClick={onContinue}>Continue</button>
  ),
}));
vi.mock('../Step3Consent', () => ({
  Step3Consent: ({ onContinue }: { onContinue: () => void }) => (
    <button data-testid="Step3Consent-continue" onClick={onContinue}>Continue</button>
  ),
}));
vi.mock('../Step5ReviewAndSave', () => ({
  Step5ReviewAndSave: () => <div data-testid="review-stub">Review</div>,
}));

import WizardPage from '../WizardPage';

function question(
  id: string,
  name: string,
  label: string,
  type: string,
  sectionId: string,
  sectionTitle: string,
  required = false,
) {
  return { id, type, name, label, required, sectionId, sectionTitle };
}

/** grp_work = [occupation, geopoint]; grp_gps = geopoint ONLY (the dead-end shape). */
const FORM_WITH_GEOPOINT = {
  formId: 'f-gps',
  title: 'Public Core',
  version: '1.0.0',
  questions: [
    question('q-occ', 'main_occupation', 'Main Occupation', 'text', 'grp_work', 'Your work'),
    question('q-gps1', 'gps_location', 'Capture GPS', 'geopoint', 'grp_work', 'Your work', true),
    question('q-gps2', 'gps_only', 'Capture GPS again', 'geopoint', 'grp_gps', 'Location', true),
  ],
  choiceLists: {},
  sectionShowWhen: {},
  calculations: [],
};

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<WizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function advanceToFirstSection() {
  await userEvent.click(await screen.findByTestId('Step1BasicInfo-continue'));
  await userEvent.click(await screen.findByTestId('Step2ContactLga-continue'));
  await userEvent.click(await screen.findByTestId('Step3Consent-continue'));
  return screen.findByTestId('step4-questionnaire');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchWizardDraft.mockResolvedValue(null);
  mockFetchPublicActiveForm.mockResolvedValue(FORM_WITH_GEOPOINT);
});

describe('WizardPage — public geopoint suppression wiring (Story 13-34 AC2)', () => {
  it('Step4 mounts FormRenderer with suppression: the GPS permission control never renders', async () => {
    renderWizard();
    await advanceToFirstSection();

    // The section's own text question renders; its geopoint sibling does not.
    expect(await screen.findByText('Main Occupation')).toBeInTheDocument();
    expect(screen.queryByText('Capture GPS')).not.toBeInTheDocument();
    expect(screen.queryByTestId('geopoint-capture-gps_location')).not.toBeInTheDocument();
  });

  it('auto-skips a section whose ONLY question is a suppressed geopoint (no "No questions available" dead-end)', async () => {
    renderWizard();
    await advanceToFirstSection();

    // Continue out of grp_work: grp_gps holds nothing reachable → must be skipped
    // straight through to Review, never painting FormRenderer's empty state.
    await userEvent.click(screen.getByTestId('wizard-nav-continue'));

    await waitFor(() => expect(screen.getByTestId('review-stub')).toBeInTheDocument());
    expect(screen.queryByTestId('form-renderer-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('geopoint-capture-gps_only')).not.toBeInTheDocument();
  });
});
