import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

expect.extend(matchers);

import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FormFillerPage from '../FormFillerPage';
import type { FlattenedForm } from '../../api/form.api';

// Mock useDraftPersistence hook
const mockCompleteDraft = vi.fn().mockResolvedValue(undefined);
const mockSaveDraft = vi.fn().mockResolvedValue(undefined);

vi.mock('../../hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => ({
    draftId: null,
    resumeData: null,
    loading: false,
    saveDraft: mockSaveDraft,
    completeDraft: mockCompleteDraft,
  }),
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

function renderPage(mode: 'fill' | 'preview' = 'fill') {
  return render(
    <MemoryRouter initialEntries={['/survey/test-form-id']}>
      <Routes>
        <Route path="/survey/:formId" element={<FormFillerPage mode={mode} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FormFillerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHookReturn = {
      data: mockForm,
      isLoading: false,
      error: null,
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
});
