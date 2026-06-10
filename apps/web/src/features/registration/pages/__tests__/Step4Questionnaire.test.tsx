// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step4Questionnaire } from '../Step4Questionnaire';
import { fetchPublicActiveForm, type WizardDraftData } from '../../api/wizard.api';
import type { FlattenedForm, FlattenedQuestion } from '../../../forms/api/form.api';

expect.extend(matchers);

vi.mock('../../api/wizard.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/wizard.api')>();
  return { ...actual, fetchPublicActiveForm: vi.fn() };
});

vi.mock('../../../forms/api/nin-check.api', () => ({
  checkNinAvailability: vi.fn().mockResolvedValue({ available: true }),
}));

const mockedFetch = vi.mocked(fetchPublicActiveForm);

function q(name: string, label: string): FlattenedQuestion {
  return {
    id: `q-${name}`,
    type: 'text',
    name,
    label,
    required: false,
    sectionId: 's1',
    sectionTitle: 'Section 1',
  };
}

function makeForm(questions: FlattenedQuestion[]): FlattenedForm {
  return {
    formId: 'f1',
    title: 'Survey',
    version: '1.0.0',
    questions,
    choiceLists: {},
    sectionShowWhen: {},
  };
}

function renderStep4(formData: WizardDraftData) {
  const merge = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Step4Questionnaire
        formData={formData}
        mergeFields={merge}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return merge;
}

/** Find the mergeFields call that carries the prefill stamp. */
function prefillCall(merge: ReturnType<typeof vi.fn>) {
  return merge.mock.calls.map((c) => c[0]).find((p) => p && 'prefilledQuestionNames' in p);
}

describe('Step4Questionnaire — Pattern C dedup (Story 9-18 AC#B4/B5)', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  afterEach(cleanup);

  it('auto-fills name/phone/email, hides them, and names them in the banner', async () => {
    mockedFetch.mockResolvedValue(
      makeForm([q('full_name', 'Full name'), q('phone', 'Phone'), q('email', 'Email'), q('gender', 'Gender')]),
    );
    const merge = renderStep4({
      fullName: 'Ada Okoye',
      phone: '+2348012345678',
      email: 'ada@example.com',
      questionnaireResponses: {},
    });

    const banner = await screen.findByTestId('step4-prefilled-banner');
    expect(banner).toHaveTextContent(
      "We've pre-filled Name, Phone, and Email from your earlier answers. Click Back to edit anything.",
    );

    await waitFor(() => {
      const patch = prefillCall(merge);
      expect(patch?.prefilledQuestionNames).toEqual(
        expect.arrayContaining(['full_name', 'phone', 'email']),
      );
      expect(patch?.questionnaireResponses).toMatchObject({
        full_name: 'Ada Okoye',
        phone: '+2348012345678',
        email: 'ada@example.com',
      });
    });

    // Hidden questions are skipped → the only visible question is Gender.
    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.queryByText('Full name')).not.toBeInTheDocument();
  });

  it('composes a "full_name" question from given + family name (AI-Review H1)', async () => {
    // Part F stopped writing formData.fullName; a "Full Name"/"name" question
    // must still be deduped by composing given + family.
    mockedFetch.mockResolvedValue(makeForm([q('full_name', 'Full name'), q('gender', 'Gender')]));
    const merge = renderStep4({ givenName: 'Kayode', familyName: 'Olowu', questionnaireResponses: {} });

    const banner = await screen.findByTestId('step4-prefilled-banner');
    expect(banner).toHaveTextContent('Name');

    await waitFor(() => {
      const patch = prefillCall(merge);
      expect(patch?.questionnaireResponses).toMatchObject({ full_name: 'Kayode Olowu' });
      expect(patch?.prefilledQuestionNames).toContain('full_name');
    });
    expect(screen.queryByText('Full name')).not.toBeInTheDocument();
  });

  it('composes "full_name" from a mononym given name alone (AI-Review H1 + M3)', async () => {
    mockedFetch.mockResolvedValue(makeForm([q('name', 'Name'), q('gender', 'Gender')]));
    const merge = renderStep4({ givenName: 'Sadeke', questionnaireResponses: {} });
    await waitFor(() => {
      const patch = prefillCall(merge);
      expect(patch?.questionnaireResponses).toMatchObject({ name: 'Sadeke' });
    });
  });

  it('auto-fills a legacy "national_id" question from the wizard NIN', async () => {
    mockedFetch.mockResolvedValue(makeForm([q('national_id', 'National ID'), q('gender', 'Gender')]));
    const merge = renderStep4({ nin: '12345678901', questionnaireResponses: {} });

    const banner = await screen.findByTestId('step4-prefilled-banner');
    expect(banner).toHaveTextContent('NIN');

    await waitFor(() => {
      const patch = prefillCall(merge);
      expect(patch?.questionnaireResponses).toMatchObject({ national_id: '12345678901' });
    });
  });

  it('hides the NIN question without auto-filling when pending-NIN is on (banner omits NIN)', async () => {
    mockedFetch.mockResolvedValue(makeForm([q('nin', 'NIN'), q('phone', 'Phone'), q('gender', 'Gender')]));
    const merge = renderStep4({
      pendingNinToggle: true,
      phone: '+2348012345678',
      questionnaireResponses: {},
    });

    const banner = await screen.findByTestId('step4-prefilled-banner');
    expect(banner).toHaveTextContent("We've pre-filled Phone from your earlier answers.");
    expect(banner).not.toHaveTextContent('NIN');

    await waitFor(() => {
      const patch = prefillCall(merge);
      // NIN question hidden (don't ask) but not auto-filled (no value).
      expect(patch?.prefilledQuestionNames).toContain('nin');
      expect(patch?.questionnaireResponses).not.toHaveProperty('nin');
    });
  });

  it('auto-fills a date_of_birth question from the wizard dateOfBirth (verbatim, AI-Review L5)', async () => {
    mockedFetch.mockResolvedValue(makeForm([q('date_of_birth', 'Date of birth'), q('gender', 'Gender')]));
    const merge = renderStep4({ dateOfBirth: '1990-05-14', questionnaireResponses: {} });

    const banner = await screen.findByTestId('step4-prefilled-banner');
    expect(banner).toHaveTextContent('Date of Birth');

    await waitFor(() => {
      const patch = prefillCall(merge);
      // The wizard stores dateOfBirth as a YYYY-MM-DD string; it round-trips
      // verbatim into the date question's response.
      expect(patch?.questionnaireResponses).toMatchObject({ date_of_birth: '1990-05-14' });
    });
  });

  it('purges a previously auto-filled NIN when pending-NIN switches on (AI-Review H1)', async () => {
    mockedFetch.mockResolvedValue(makeForm([q('nin', 'NIN'), q('gender', 'Gender')]));
    // Simulates re-entry after the NIN was auto-filled (toggle off) and the user
    // then flipped pending-NIN on: the prior stamp owns 'nin', the value is still
    // sitting in questionnaireResponses, and pending is now true.
    const merge = renderStep4({
      pendingNinToggle: true,
      questionnaireResponses: { nin: '12345678901' },
      prefilledQuestionNames: ['nin'],
    });

    await waitFor(() => {
      const patch = prefillCall(merge);
      expect(patch).toBeDefined();
      // Stale NIN removed from the submitted responses…
      expect(patch?.questionnaireResponses).not.toHaveProperty('nin');
      // …but the question stays hidden (don't re-ask).
      expect(patch?.prefilledQuestionNames).toContain('nin');
    });
  });

  it('renders no banner when nothing matches the wizard fields', async () => {
    mockedFetch.mockResolvedValue(makeForm([q('gender', 'Gender'), q('occupation', 'Occupation')]));
    renderStep4({ fullName: 'Ada Okoye', questionnaireResponses: {} });

    await screen.findByText('Gender');
    expect(screen.queryByTestId('step4-prefilled-banner')).not.toBeInTheDocument();
  });
});
