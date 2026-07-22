// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

expect.extend(matchers);

const { mockFetchPublicActiveForm, mockSubmitSupplemental } = vi.hoisted(() => ({
  mockFetchPublicActiveForm: vi.fn(),
  mockSubmitSupplemental: vi.fn(),
}));

vi.mock('../../api/wizard.api', () => ({
  fetchPublicActiveForm: () => mockFetchPublicActiveForm(),
}));

vi.mock('../../api/supplemental-survey.api', () => ({
  submitSupplementalSurvey: (...args: unknown[]) => mockSubmitSupplemental(...args),
}));

// FormRenderer is heavy — stub it so we can drive submission deterministically
// from the test without depending on its internal step machinery.
vi.mock('../../../forms/components/FormRenderer', () => ({
  FormRenderer: ({
    onComplete,
    suppressGeopoint,
  }: {
    onComplete: (responses: Record<string, unknown>) => void;
    suppressGeopoint?: boolean;
  }) => (
    <div
      data-testid="form-renderer-stub"
      // Story 13-34 AC2 (code-review M1) — surface the prop so the mount's
      // opt-in is asserted, not assumed.
      data-suppress-geopoint={String(suppressGeopoint === true)}
    >
      <button
        type="button"
        data-testid="stub-complete"
        onClick={() => onComplete({ employment_status: 'employed', skills_possessed: ['plumbing'] })}
      >
        Stub complete
      </button>
    </div>
  ),
}));

import SupplementalSurveyPage from '../SupplementalSurveyPage';

function renderAt(token: string | null) {
  const path = token ? `/register/supplemental?token=${token}` : '/register/supplemental';
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/register/supplemental" element={<SupplementalSurveyPage />} />
          <Route path="/" element={<div data-testid="home-redirect">home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SupplementalSurveyPage (Story 9-28 Path B)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the missing-token card when token query param is absent', () => {
    renderAt(null);
    expect(screen.getByTestId('supplemental-missing-token')).toBeInTheDocument();
    expect(screen.getByText(/Link incomplete/i)).toBeInTheDocument();
    expect(mockFetchPublicActiveForm).not.toHaveBeenCalled();
  });

  it('renders the form once the questionnaire loads', async () => {
    mockFetchPublicActiveForm.mockResolvedValueOnce({
      formId: 'f1',
      version: 'v1',
      title: 'Skills Questionnaire',
      questions: [],
    });

    renderAt('good-token');

    await waitFor(() => {
      expect(screen.getByTestId('form-renderer-stub')).toBeInTheDocument();
    });
    expect(screen.getByText(/Complete your skills profile/i)).toBeInTheDocument();
  });

  // Story 13-34 AC2 (code-review M1) — this Cohort-A page serves the SAME pinned
  // public form as the wizard, so it must opt into geopoint suppression too.
  // Without this assertion the prop could be dropped with every suite still green.
  it('mounts FormRenderer with geopoint suppression (public respondent surface)', async () => {
    mockFetchPublicActiveForm.mockResolvedValueOnce({
      formId: 'f1',
      version: 'v1',
      title: 'Skills Questionnaire',
      questions: [],
    });

    renderAt('good-token');

    await waitFor(() => {
      expect(screen.getByTestId('form-renderer-stub')).toHaveAttribute(
        'data-suppress-geopoint',
        'true',
      );
    });
  });

  it('renders no-form card when the public active form is null', async () => {
    mockFetchPublicActiveForm.mockResolvedValueOnce(null);

    renderAt('good-token');

    await waitFor(() => {
      expect(screen.getByTestId('supplemental-no-form')).toBeInTheDocument();
    });
  });

  it('submits the questionnaire payload + shows success card', async () => {
    mockFetchPublicActiveForm.mockResolvedValueOnce({
      formId: 'f1',
      version: 'v1',
      title: 'Skills Questionnaire',
      questions: [],
    });
    mockSubmitSupplemental.mockResolvedValueOnce({
      submissionUid: 'sub-uid-123',
      respondentId: 'resp-id-456',
    });

    renderAt('good-token');

    await waitFor(() => {
      expect(screen.getByTestId('form-renderer-stub')).toBeInTheDocument();
    });

    screen.getByTestId('stub-complete').click();

    await waitFor(() => {
      expect(screen.getByTestId('supplemental-success')).toBeInTheDocument();
    });
    expect(screen.getByText(/Thank you/i)).toBeInTheDocument();
    // L10 fix — reference is truncated to first 8 chars on display; full UUID
    // stored on the element's title attribute for support-ticket cross-ref.
    expect(screen.getByText(/Reference: sub-uid-/)).toBeInTheDocument();
    expect(screen.getByText(/Reference: sub-uid-/).getAttribute('title')).toBe('sub-uid-123');

    expect(mockSubmitSupplemental).toHaveBeenCalledWith({
      token: 'good-token',
      questionnaireResponses: { employment_status: 'employed', skills_possessed: ['plumbing'] },
    });
  });

  it('surfaces a friendly error when submit fails', async () => {
    mockFetchPublicActiveForm.mockResolvedValueOnce({
      formId: 'f1',
      version: 'v1',
      title: 'Skills Questionnaire',
      questions: [],
    });
    mockSubmitSupplemental.mockRejectedValueOnce(new Error('Network error'));

    renderAt('good-token');

    await waitFor(() => {
      expect(screen.getByTestId('form-renderer-stub')).toBeInTheDocument();
    });

    screen.getByTestId('stub-complete').click();

    await waitFor(() => {
      expect(screen.getByTestId('supplemental-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });
});
