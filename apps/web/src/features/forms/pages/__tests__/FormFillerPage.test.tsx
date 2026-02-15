import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FormFillerPage from '../FormFillerPage';
import type { FlattenedForm } from '../../api/form.api';

afterEach(() => {
  cleanup();
});

// Mock useDraftPersistence hook
const mockCompleteDraft = vi.fn().mockResolvedValue(undefined);
const mockSaveDraft = vi.fn().mockResolvedValue(undefined);
const mockUseDraftPersistence = vi.fn();

vi.mock('../../hooks/useDraftPersistence', () => ({
  useDraftPersistence: (options: unknown) => {
    mockUseDraftPersistence(options);
    return {
    draftId: null,
    resumeData: null,
    loading: false,
    saveDraft: mockSaveDraft,
    completeDraft: mockCompleteDraft,
    };
  },
}));

// Mock useFormSchema hook
const mockForm: FlattenedForm = {
  formId: 'test-form-id',
  title: 'Test Survey',
  version: '1.0.0',
  questions: [
    {
      id: 'q1',
      type: 'text',
      name: 'full_name',
      label: 'What is your full name?',
      required: true,
      sectionId: 's1',
      sectionTitle: 'Personal Info',
    },
    {
      id: 'q2',
      type: 'number',
      name: 'age',
      label: 'How old are you?',
      required: false,
      sectionId: 's1',
      sectionTitle: 'Personal Info',
    },
    {
      id: 'q3',
      type: 'select_one',
      name: 'employed',
      label: 'Are you employed?',
      required: false,
      sectionId: 's2',
      sectionTitle: 'Employment',
      choices: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    },
  ],
  choiceLists: {},
  sectionShowWhen: {},
};

let mockHookReturn = {
  data: mockForm as FlattenedForm | undefined,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../../hooks/useForms', () => ({
  useFormSchema: () => mockHookReturn,
  useFormPreview: () => mockHookReturn,
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
  SkeletonText: () => <div data-testid="skeleton-text" />,
}));

// Mock useNinCheck for NIN pre-check tests
let mockNinCheckReturn = {
  isChecking: false,
  isDuplicate: false,
  duplicateInfo: null as { reason: string; registeredAt?: string } | null,
  checkNin: vi.fn(),
  reset: vi.fn(),
};

vi.mock('../../hooks/useNinCheck', () => ({
  useNinCheck: () => mockNinCheckReturn,
}));

let mockUserRole = 'enumerator';

vi.mock('../../../auth', () => ({
  useAuth: () => ({ user: { role: mockUserRole } }),
}));

function renderPage(mode: 'fill' | 'preview' = 'fill', initialPath = '/survey/test-form-id') {
  const routePath = initialPath.startsWith('/dashboard/public') ? '/dashboard/public/surveys/:formId' : '/survey/:formId';
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={routePath} element={<FormFillerPage mode={mode} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FormFillerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'enumerator';
    mockHookReturn = {
      data: mockForm,
      isLoading: false,
      error: null,
    };
    mockNinCheckReturn = {
      isChecking: false,
      isDuplicate: false,
      duplicateInfo: null,
      checkNin: vi.fn(),
      reset: vi.fn(),
    };
  });

  it('loads form and displays first question', () => {
    renderPage();
    expect(screen.getByText('What is your full name?')).toBeInTheDocument();
    expect(screen.getByTestId('question-card')).toBeInTheDocument();
  });

  it('navigates forward with Continue button', async () => {
    renderPage();

    // Fill first question (required)
    fireEvent.change(screen.getByTestId('input-full_name'), {
      target: { value: 'John Doe' },
    });

    fireEvent.click(screen.getByTestId('continue-btn'));

    await waitFor(() => {
      expect(screen.getByText('How old are you?')).toBeInTheDocument();
    });
  });

  it('navigates back with Back button', async () => {
    renderPage();

    // Fill and advance
    fireEvent.change(screen.getByTestId('input-full_name'), {
      target: { value: 'John' },
    });
    fireEvent.click(screen.getByTestId('continue-btn'));

    await waitFor(() => {
      expect(screen.getByText('How old are you?')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('back-btn'));

    await waitFor(() => {
      expect(screen.getByText('What is your full name?')).toBeInTheDocument();
    });
  });

  it('shows validation error when required field is empty', () => {
    renderPage();

    // Try to advance without filling required field
    fireEvent.click(screen.getByTestId('continue-btn'));

    expect(screen.getByRole('alert')).toHaveTextContent('This field is required');
  });

  it('shows progress indicator', () => {
    renderPage();
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 3/)).toBeInTheDocument();
  });

  it('passes RHF watch-driven formData to draft persistence hook', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('input-full_name'), {
      target: { value: 'John Watcher' },
    });

    await waitFor(() => {
      expect(mockUseDraftPersistence).toHaveBeenCalledWith(
        expect.objectContaining({
          formData: expect.objectContaining({ full_name: 'John Watcher' }),
        })
      );
    });
  });

  it('shows preview banner in preview mode', () => {
    renderPage('preview');
    expect(screen.getByTestId('preview-banner')).toBeInTheDocument();
    expect(screen.getByText('Preview Mode — Data Not Saved')).toBeInTheDocument();
  });

  it('shows completion screen after last question', async () => {
    // Use a simple single-question form
    mockHookReturn = {
      data: {
        ...mockForm,
        questions: [
          {
            id: 'q1',
            type: 'text',
            name: 'name',
            label: 'Name',
            required: false,
            sectionId: 's1',
            sectionTitle: 'Section 1',
          },
        ],
        sectionShowWhen: {},
      },
      isLoading: false,
      error: null,
    };

    renderPage();

    fireEvent.click(screen.getByTestId('continue-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('completion-screen')).toBeInTheDocument();
      expect(screen.getByText('Survey saved!')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton when data is loading', () => {
    mockHookReturn = {
      data: undefined,
      isLoading: true,
      error: null,
    };

    renderPage();
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('shows error when form not found', () => {
    mockHookReturn = {
      data: undefined,
      isLoading: false,
      error: new Error('Form not found'),
    };

    renderPage();
    expect(screen.getByTestId('form-error')).toHaveTextContent('Form not found');
  });

  it('disables inputs in preview mode', () => {
    renderPage('preview');
    expect(screen.getByTestId('input-full_name')).toBeDisabled();
  });

  it('shows exit preview button on completion in preview mode', async () => {
    mockHookReturn = {
      data: {
        ...mockForm,
        questions: [
          {
            id: 'q1',
            type: 'text',
            name: 'name',
            label: 'Name',
            required: false,
            sectionId: 's1',
            sectionTitle: 'Section 1',
          },
        ],
        sectionShowWhen: {},
      },
      isLoading: false,
      error: null,
    };

    renderPage('preview');

    fireEvent.click(screen.getByTestId('continue-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('exit-preview-btn')).toBeInTheDocument();
    });
  });

  describe('modulus11 NIN validation', () => {
    const ninForm: FlattenedForm = {
      formId: 'nin-form',
      title: 'NIN Test',
      version: '1.0.0',
      questions: [
        {
          id: 'q-nin',
          type: 'text',
          name: 'nin',
          label: 'Enter NIN',
          required: true,
          sectionId: 's1',
          sectionTitle: 'Identity',
          validation: [
            { type: 'minLength', value: 11, message: 'NIN must be 11 digits' },
            { type: 'maxLength', value: 11, message: 'NIN must be 11 digits' },
            { type: 'modulus11', value: 1, message: 'Invalid NIN — please check for typos' },
          ],
        },
      ],
      choiceLists: {},
      sectionShowWhen: {},
    };

    it('shows modulus11 validation error for invalid NIN', () => {
      mockHookReturn = { data: ninForm, isLoading: false, error: null };
      renderPage();

      fireEvent.change(screen.getByTestId('input-nin'), {
        target: { value: '12345678902' },
      });
      fireEvent.click(screen.getByTestId('continue-btn'));

      expect(screen.getByRole('alert')).toHaveTextContent('Invalid NIN');
    });

    it('passes modulus11 validation for valid NIN', async () => {
      mockHookReturn = { data: ninForm, isLoading: false, error: null };
      renderPage();

      // 61961438053 is a known valid NIN (from project context)
      fireEvent.change(screen.getByTestId('input-nin'), {
        target: { value: '61961438053' },
      });
      fireEvent.click(screen.getByTestId('continue-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('completion-screen')).toBeInTheDocument();
      });
    });

    it('shows modulus11 error for non-11-digit string', () => {
      mockHookReturn = { data: ninForm, isLoading: false, error: null };
      renderPage();

      fireEvent.change(screen.getByTestId('input-nin'), {
        target: { value: '12345' },
      });
      fireEvent.click(screen.getByTestId('continue-btn'));

      expect(screen.getByRole('alert')).toHaveTextContent('NIN must be 11 digits');
    });
  });

  describe('watch-driven skip logic', () => {
    const skipLogicForm: FlattenedForm = {
      formId: 'skip-logic-form',
      title: 'Skip Logic Form',
      version: '1.0.0',
      questions: [
        {
          id: 'q1',
          type: 'text',
          name: 'wants_followup',
          label: 'Type yes to answer a follow-up',
          required: true,
          sectionId: 's1',
          sectionTitle: 'Section 1',
        },
        {
          id: 'q2',
          type: 'text',
          name: 'follow_up',
          label: 'Follow-up question',
          required: true,
          sectionId: 's1',
          sectionTitle: 'Section 1',
          showWhen: {
            field: 'wants_followup',
            operator: 'equals',
            value: 'yes',
          },
        },
      ],
      choiceLists: {},
      sectionShowWhen: {},
    };

    it('skips hidden follow-up question when showWhen condition is false', async () => {
      mockHookReturn = { data: skipLogicForm, isLoading: false, error: null };
      renderPage();

      fireEvent.change(screen.getByTestId('input-wants_followup'), {
        target: { value: 'no' },
      });
      fireEvent.click(screen.getByTestId('continue-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('completion-screen')).toBeInTheDocument();
      });
      expect(screen.queryByText('Follow-up question')).not.toBeInTheDocument();
    });
  });

  describe('Story 3.7: NIN pre-check integration', () => {
    const ninForm: FlattenedForm = {
      formId: 'nin-form',
      title: 'NIN Test',
      version: '1.0.0',
      questions: [
        {
          id: 'q-nin',
          type: 'text',
          name: 'nin',
          label: 'Enter NIN',
          required: true,
          sectionId: 's1',
          sectionTitle: 'Identity',
        },
      ],
      choiceLists: {},
      sectionShowWhen: {},
    };

    it('shows inline NIN duplicate error when isDuplicate is true (AC 3.7.3)', () => {
      mockHookReturn = { data: ninForm, isLoading: false, error: null };
      mockNinCheckReturn = {
        ...mockNinCheckReturn,
        isDuplicate: true,
        duplicateInfo: { reason: 'respondent', registeredAt: '2026-02-10T14:30:00.000Z' },
      };
      renderPage();

      expect(screen.getByRole('alert')).toHaveTextContent('This NIN is already registered');
    });

    it('disables Continue button when NIN duplicate detected (AC 3.7.3)', () => {
      mockHookReturn = { data: ninForm, isLoading: false, error: null };
      mockNinCheckReturn = {
        ...mockNinCheckReturn,
        isDuplicate: true,
        duplicateInfo: { reason: 'staff' },
      };
      renderPage();

      expect(screen.getByTestId('continue-btn')).toBeDisabled();
    });
  });

  describe('Story 3.5 AC3.5.4: Public user completion screen', () => {
    const singleQuestionForm: FlattenedForm = {
      formId: 'test-form-id',
      title: 'Public Survey',
      version: '1.0.0',
      questions: [
        {
          id: 'q1',
          type: 'text',
          name: 'name',
          label: 'Name',
          required: false,
          sectionId: 's1',
          sectionTitle: 'Section 1',
        },
      ],
      choiceLists: {},
      sectionShowWhen: {},
    };

    it('shows civic message on completion for public users', async () => {
      mockUserRole = 'public_user';
      mockHookReturn = { data: singleQuestionForm, isLoading: false, error: null };
      renderPage('fill', '/dashboard/public/surveys/test-form-id');

      fireEvent.click(screen.getByTestId('continue-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('completion-screen')).toBeInTheDocument();
        expect(screen.getByTestId('civic-message')).toHaveTextContent(
          'Thank you for contributing to the Oyo State Labour Registry'
        );
      });
    });

    it('shows "Back to Dashboard" button for public users', async () => {
      mockUserRole = 'public_user';
      mockHookReturn = { data: singleQuestionForm, isLoading: false, error: null };
      renderPage('fill', '/dashboard/public/surveys/test-form-id');

      fireEvent.click(screen.getByTestId('continue-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('back-to-dashboard-btn')).toBeInTheDocument();
        expect(screen.getByTestId('back-to-dashboard-btn')).toHaveTextContent('Back to Dashboard');
      });
    });

    it('shows "View All Surveys" button for public users', async () => {
      mockUserRole = 'public_user';
      mockHookReturn = { data: singleQuestionForm, isLoading: false, error: null };
      renderPage('fill', '/dashboard/public/surveys/test-form-id');

      fireEvent.click(screen.getByTestId('continue-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('view-all-surveys-btn')).toBeInTheDocument();
        expect(screen.getByTestId('view-all-surveys-btn')).toHaveTextContent('View All Surveys');
      });
    });

    it('does NOT show civic message for non-public users', async () => {
      mockUserRole = 'enumerator';
      mockHookReturn = { data: singleQuestionForm, isLoading: false, error: null };
      renderPage('fill');

      fireEvent.click(screen.getByTestId('continue-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('completion-screen')).toBeInTheDocument();
        expect(screen.queryByTestId('civic-message')).not.toBeInTheDocument();
        expect(screen.getByTestId('back-to-surveys-btn')).toBeInTheDocument();
      });
    });
  });
});
