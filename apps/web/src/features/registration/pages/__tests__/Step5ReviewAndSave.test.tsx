// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step5ReviewAndSave } from '../Step5ReviewAndSave';
import { fetchPublicLgas, type WizardDraftData } from '../../api/wizard.api';

expect.extend(matchers);
afterEach(cleanup);

vi.mock('../../api/wizard.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/wizard.api')>();
  return { ...actual, fetchPublicLgas: vi.fn() };
});
const mockedLgas = vi.mocked(fetchPublicLgas);

// Default LGA mock for every test — the ['wizard','lgas','public'] query must
// never resolve to `undefined` (TanStack Query rejects it with a noisy stderr).
// Blocks that assert on specific LGA names reset + reseed in their own
// beforeEach (which runs AFTER this top-level one).
beforeEach(() => {
  mockedLgas.mockResolvedValue([
    { id: '018e5f2a-1234-7890-abcd-1234567890ab', name: 'Egbeda', code: 'lga-egbeda' },
  ]);
});

function fullState(overrides: Partial<WizardDraftData> = {}): WizardDraftData {
  return {
    givenName: 'Kayode',
    familyName: 'Olowu',
    dateOfBirth: '1990-01-01',
    gender: 'male',
    nin: '12345678919',
    phone: '+2348012345678',
    email: 'kayode@example.com',
    lgaId: 'lga-egbeda',
    consentMarketplace: true,
    consentEnriched: false,
    ...overrides,
  };
}

/** Story 13-46 — same as renderStep5 but exposes rerender, for asserting a state transition. */
function renderStep5Rerenderable(formData: WizardDraftData, mergeFields = vi.fn()) {
  const onGoToStep = vi.fn();
  const onSubmit = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (fd: WizardDraftData) => (
    <QueryClientProvider client={qc}>
      <Step5ReviewAndSave formData={fd} mergeFields={mergeFields} onGoToStep={onGoToStep} onSubmit={onSubmit} onBack={vi.fn()} />
    </QueryClientProvider>
  );
  const r = render(tree(formData));
  return { onGoToStep, onSubmit, mergeFields, rerender: (fd: WizardDraftData) => r.rerender(tree(fd)) };
}

function renderStep5(formData: WizardDraftData, mergeFields = vi.fn()) {
  const onGoToStep = vi.fn();
  const onSubmit = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Step5ReviewAndSave formData={formData} mergeFields={mergeFields} onGoToStep={onGoToStep} onSubmit={onSubmit} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
  return { onGoToStep, onSubmit, mergeFields };
}

describe('Step5ReviewAndSave (Story 9-18 Part C AC#C1/D2)', () => {
  beforeEach(() => {
    mockedLgas.mockReset();
    // Story 13-16 — formData.lgaId now holds the SLUG (lga.code); id is the row UUID.
    mockedLgas.mockResolvedValue([
      { id: '018e5f2a-1234-7890-abcd-1234567890ab', name: 'Egbeda', code: 'lga-egbeda' },
    ]);
  });

  it('lists every summary field', async () => {
    renderStep5(fullState());
    expect(screen.getByTestId('step5-name')).toHaveTextContent('Kayode Olowu');
    expect(screen.getByTestId('step5-dob')).toHaveTextContent('1990-01-01');
    expect(screen.getByTestId('step5-gender')).toHaveTextContent('Male');
    expect(screen.getByTestId('step5-nin')).toHaveTextContent('12345-67891-9');
    expect(screen.getByTestId('step5-phone')).toHaveTextContent('+2348012345678');
    expect(screen.getByTestId('step5-email')).toHaveTextContent('kayode@example.com');
    expect(screen.getByTestId('step5-consent-marketplace')).toHaveTextContent('Allowed');
    expect(screen.getByTestId('step5-consent-enriched')).toHaveTextContent('Declined');
    // LGA name resolves from the public LGA query.
    expect(await screen.findByText('Egbeda')).toBeInTheDocument();
  });

  it('shows the formatted NIN when present', () => {
    renderStep5(fullState());
    expect(screen.getByTestId('step5-nin')).toHaveTextContent('12345-67891-9');
    expect(screen.queryByTestId('step5-nin-pending')).not.toBeInTheDocument();
  });

  it('shows a Pending badge instead of the NIN when pending-NIN is on', () => {
    renderStep5(fullState({ nin: '', pendingNinToggle: true }));
    expect(screen.getByTestId('step5-nin-pending')).toBeInTheDocument();
    expect(screen.getByTestId('step5-nin')).toHaveTextContent(/Pending/);
  });

  it('labels the Save button "Save Registration" by default', () => {
    renderStep5(fullState());
    expect(screen.getByTestId('wizard-save-button')).toHaveTextContent('Save Registration');
  });

  it('labels the Save button "Save as Pending" when pending-NIN is on', () => {
    renderStep5(fullState({ nin: '', pendingNinToggle: true }));
    expect(screen.getByTestId('wizard-save-button')).toHaveTextContent('Save as Pending');
  });

  it('Edit links jump to the owning step', () => {
    const { onGoToStep } = renderStep5(fullState());
    fireEvent.click(screen.getByTestId('step5-name-edit'));
    expect(onGoToStep).toHaveBeenCalledWith(0); // identity
    fireEvent.click(screen.getByTestId('step5-phone-edit'));
    expect(onGoToStep).toHaveBeenCalledWith(1); // contact
    fireEvent.click(screen.getByTestId('step5-consent-marketplace-edit'));
    expect(onGoToStep).toHaveBeenCalledWith(2); // consent
  });

  it('invokes onSubmit when Save is clicked', () => {
    const { onSubmit } = renderStep5(fullState());
    fireEvent.click(screen.getByTestId('wizard-save-button'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders no auth-choice control (auth-choice retired per AC#C3)', () => {
    renderStep5(fullState());
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('treats an empty NIN with no toggle as pending — label/badge match the submit (AI-Review M1)', () => {
    // A resumed pre-9-18 draft can have no NIN and no pendingNinToggle; the
    // submit derives pending via `!nin`, so the badge + label must agree.
    renderStep5(fullState({ nin: '', pendingNinToggle: undefined }));
    expect(screen.getByTestId('step5-nin-pending')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-save-button')).toHaveTextContent('Save as Pending');
  });

  it('renders a mononym (given name only) without a trailing space', () => {
    renderStep5(fullState({ familyName: '' }));
    expect(screen.getByTestId('step5-name')).toHaveTextContent('Kayode');
  });
});

describe('Step5ReviewAndSave incomplete-questionnaire guard (Story 9-54 AC6.2)', () => {
  beforeEach(() => {
    mockedLgas.mockReset();
    // Story 13-16 — slug-first lookup parity with the main describe block.
    mockedLgas.mockResolvedValue([
      { id: '018e5f2a-1234-7890-abcd-1234567890ab', name: 'Egbeda', code: 'lga-egbeda' },
    ]);
  });

  function renderGuarded(incomplete: boolean, missingStepIndex: number | null) {
    const onGoToStep = vi.fn();
    const onSubmit = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Step5ReviewAndSave
          formData={fullState()}
          mergeFields={vi.fn()}
          onGoToStep={onGoToStep}
          onSubmit={onSubmit}
          onBack={vi.fn()}
          incompleteQuestionnaire={incomplete}
          missingStepIndex={missingStepIndex}
        />
      </QueryClientProvider>,
    );
    return { onGoToStep, onSubmit };
  }

  it('disables Save and shows the notice when the questionnaire is incomplete', () => {
    const { onSubmit } = renderGuarded(true, 3);
    expect(screen.getByTestId('step5-incomplete-notice')).toBeInTheDocument();
    const save = screen.getByTestId('wizard-save-button');
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('jumps back to the offending step via the notice link', () => {
    const { onGoToStep } = renderGuarded(true, 3);
    fireEvent.click(screen.getByTestId('step5-incomplete-goto'));
    expect(onGoToStep).toHaveBeenCalledWith(3);
  });

  it('enables Save and hides the notice when complete', () => {
    const { onSubmit } = renderGuarded(false, null);
    expect(screen.queryByTestId('step5-incomplete-notice')).not.toBeInTheDocument();
    const save = screen.getByTestId('wizard-save-button');
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('Step5ReviewAndSave — campaign attribution question (Story 13-1 AC2)', () => {
  it('renders the optional "How did you hear about us?" select', () => {
    renderStep5(fullState());
    expect(screen.getByTestId('attribution-channel-select')).toBeInTheDocument();
    expect(screen.getByText(/how did you hear about us/i)).toBeInTheDocument();
  });

  it('writes the chosen channel into extras.acquisition via mergeFields', () => {
    const { mergeFields } = renderStep5(fullState());
    fireEvent.change(screen.getByTestId('attribution-channel-select'), { target: { value: 'Radio' } });
    expect(mergeFields).toHaveBeenCalledWith(
      expect.objectContaining({ extras: expect.objectContaining({ acquisition: { channel: 'Radio' } }) }),
    );
  });

  it('NEVER blocks submit — Save stays enabled regardless of the answer (AC2.2)', () => {
    renderStep5(fullState());
    expect(screen.getByTestId('wizard-save-button')).not.toBeDisabled();
  });
});

describe('Step5ReviewAndSave — acquisition-question prominence (Story 13-29 AC5)', () => {
  it('presents the question as a prominent, accessible labelled region (not a buried optional select)', () => {
    renderStep5(fullState());
    // Elevated to a landmark region named by its own heading — assistive tech and
    // sighted users both find it, instead of a faint "(optional)" select.
    const region = screen.getByRole('region', { name: /how did you hear about us/i });
    expect(region).toBeInTheDocument();
    expect(region).toContainElement(screen.getByTestId('attribution-channel-select'));
    // The prompt is a real, legible label (base weight/size), not a muted caption.
    const label = screen.getByText('How did you hear about us?');
    expect(label).toHaveClass('font-semibold');
  });

  it('remains optional + non-blocking — Save enabled with no channel chosen (13-1 guardrail)', () => {
    renderStep5(fullState());
    expect(screen.getByTestId('attribution-channel-select')).toHaveValue('');
    expect(screen.getByTestId('wizard-save-button')).not.toBeDisabled();
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * Story 13-46 (AC10) — the DENOMINATOR fix and the non-blocking nudge.
 *
 * AC10 and the nudge are ONE deliverable: the placeholder recovers WHO WAS ASKED, the nudge lifts
 * HOW MANY ANSWER. Every test below that touches the nudge also asserts the submit still happens,
 * because "never blocks" is the guardrail 13-1 recorded and this story must not reverse.
 * ───────────────────────────────────────────────────────────────────────────── */
describe('Step5ReviewAndSave — attribution denominator + de-biased order (13-46 AC10a/b)', () => {
  it('defaults to a real "— Select —" PLACEHOLDER, not to a pre-selected decline', () => {
    renderStep5(fullState());

    const select = screen.getByTestId('attribution-channel-select') as HTMLSelectElement;
    expect(select).toHaveValue('');
    expect(select.options[0].text).toBe('— Select —');
  });

  it('offers "Prefer not to say" as an EXPLICIT choice with a stored value', () => {
    renderStep5(fullState());

    const select = screen.getByTestId('attribution-channel-select') as HTMLSelectElement;
    const decline = [...select.options].find((o) => o.text === 'Prefer not to say');
    // The bug: it used to be `value=""` AND first, so declining and ignoring were the same row.
    expect(decline).toBeDefined();
    expect(decline!.value).toBe('Prefer not to say');
  });

  it('an explicit decline WRITES a value — declined is distinguishable from untouched', () => {
    const mergeFields = vi.fn();
    renderStep5(fullState(), mergeFields);

    fireEvent.change(screen.getByTestId('attribution-channel-select'), {
      target: { value: 'Prefer not to say' },
    });

    expect(mergeFields).toHaveBeenCalledWith(
      expect.objectContaining({
        extras: expect.objectContaining({ acquisition: { channel: 'Prefer not to say' } }),
      }),
    );
  });

  it('does NOT put Radio first — first position must not anchor the channel we are measuring', () => {
    renderStep5(fullState());

    const select = screen.getByTestId('attribution-channel-select') as HTMLSelectElement;
    // options[0] is the placeholder; options[1] is the first real channel.
    expect(select.options[1].text).not.toBe('Radio');
    expect([...select.options].some((o) => o.text === 'Radio')).toBe(true);
  });
});

describe('Step5ReviewAndSave — attribution prominence, NOT interception (13-46 AC10c)', () => {
  const save = () => fireEvent.click(screen.getByTestId('wizard-save-button'));

  /* ⚠️ THE GUARANTEE THIS BLOCK EXISTS FOR: nothing about the acquisition question can delay or
   * prevent a registration. An earlier build intercepted the first Save press when the question was
   * untouched; it was dropped on review (Awwal, 2026-08-21) because a lost registration is permanent
   * and an unanswered question costs one data point. The first three tests would each have FAILED
   * against that build — they are the regression guard against re-introducing it. */

  it('SUBMITS ON THE FIRST PRESS with the question UNTOUCHED', () => {
    const { onSubmit } = renderStep5(fullState());

    save();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('SUBMITS ON THE FIRST PRESS with a channel chosen', () => {
    const { onSubmit } = renderStep5(
      fullState({ extras: { acquisition: { channel: 'Radio' } } } as Partial<WizardDraftData>),
    );

    save();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('SUBMITS ON THE FIRST PRESS on an explicit decline', () => {
    const { onSubmit } = renderStep5(
      fullState({ extras: { acquisition: { channel: 'Prefer not to say' } } } as Partial<WizardDraftData>),
    );

    save();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('every press submits — pressing twice calls onSubmit twice, nothing is ever swallowed', () => {
    const { onSubmit } = renderStep5(fullState());

    save();
    save();

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('HIGHLIGHTS the card and shows one line of copy while the question is unanswered', () => {
    renderStep5(fullState());

    expect(screen.getByTestId('step5-attribution')).toHaveAttribute('data-unanswered', 'true');
    expect(screen.getByTestId('attribution-unanswered-hint')).toBeInTheDocument();
  });

  it('drops the highlight once a channel is chosen', () => {
    renderStep5(fullState({ extras: { acquisition: { channel: 'Radio' } } } as Partial<WizardDraftData>));

    expect(screen.getByTestId('step5-attribution')).toHaveAttribute('data-unanswered', 'false');
    expect(screen.queryByTestId('attribution-unanswered-hint')).not.toBeInTheDocument();
  });

  it('drops the highlight on an explicit decline — declining IS answering', () => {
    renderStep5(
      fullState({ extras: { acquisition: { channel: 'Prefer not to say' } } } as Partial<WizardDraftData>),
    );

    expect(screen.getByTestId('step5-attribution')).toHaveAttribute('data-unanswered', 'false');
    expect(screen.queryByTestId('attribution-unanswered-hint')).not.toBeInTheDocument();
  });

  it('clears the highlight as soon as the user picks something', () => {
    const mergeFields = vi.fn();
    const { rerender } = renderStep5Rerenderable(fullState(), mergeFields);
    expect(screen.getByTestId('step5-attribution')).toHaveAttribute('data-unanswered', 'true');

    rerender(fullState({ extras: { acquisition: { channel: 'Radio' } } } as Partial<WizardDraftData>));

    expect(screen.getByTestId('step5-attribution')).toHaveAttribute('data-unanswered', 'false');
  });

  it('leaves NO interception affordance behind — the skip button is gone with the nudge', () => {
    renderStep5(fullState());
    save();

    expect(screen.queryByTestId('attribution-nudge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('attribution-nudge-skip')).not.toBeInTheDocument();
  });
});
