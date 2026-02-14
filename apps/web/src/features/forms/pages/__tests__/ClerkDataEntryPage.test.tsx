// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

expect.extend(matchers);

// ── Mock state ──────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

let mockFormReturn: {
  data: any;
  isLoading: boolean;
  error: Error | null;
};

const mockSaveDraft = vi.fn().mockResolvedValue(undefined);
const mockCompleteDraft = vi.fn().mockResolvedValue(undefined);
const mockResetForNewEntry = vi.fn();

let mockDraftReturn: {
  draftId: string | null;
  resumeData: { formData: Record<string, unknown>; questionPosition: number } | null;
  saveDraft: typeof mockSaveDraft;
  completeDraft: typeof mockCompleteDraft;
  resetForNewEntry: typeof mockResetForNewEntry;
  loading: boolean;
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
  promise: vi.fn(),
};

// ── Mock modules ────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../hooks/useForms', () => ({
  useFormSchema: () => mockFormReturn,
}));

vi.mock('../../hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => mockDraftReturn,
}));

vi.mock('../../utils/skipLogic', () => ({
  getVisibleQuestions: (questions: any[], _formData: any, _sectionShowWhen: any) => questions,
}));

vi.mock('../../components/QuestionRenderer', () => ({
  QuestionRenderer: ({ question, value, onChange, error }: any) => (
    <div data-testid={`question-${question.name}`}>
      <label htmlFor={`input-${question.name}`}>{question.label}</label>
      <input
        id={`input-${question.name}`}
        data-testid={`input-${question.name}`}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        type={question.type === 'number' ? 'number' : 'text'}
        aria-invalid={error ? 'true' : undefined}
      />
      {error && <span data-testid={`error-${question.name}`} role="alert">{error}</span>}
    </div>
  ),
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonForm: () => <div data-testid="skeleton-form" />,
}));

vi.mock('@oslsr/utils/src/validation', () => ({
  modulus11Check: (val: string) => val === '61961438053',
}));

// ── Test fixtures ───────────────────────────────────────────────────────────

const mockForm = {
  formId: 'test-form-id',
  title: 'Labour Survey 2026',
  version: '1.0',
  questions: [
    {
      id: 'q1',
      type: 'text',
      name: 'full_name',
      label: 'Full Name',
      required: true,
      sectionId: 'sec1',
      sectionTitle: 'Personal Info',
    },
    {
      id: 'q2',
      type: 'number',
      name: 'age',
      label: 'Age',
      required: true,
      sectionId: 'sec1',
      sectionTitle: 'Personal Info',
    },
    {
      id: 'q3',
      type: 'select_one',
      name: 'gender',
      label: 'Gender',
      required: false,
      sectionId: 'sec2',
      sectionTitle: 'Demographics',
      choices: [
        { label: 'Male', value: 'male' },
        { label: 'Female', value: 'female' },
      ],
    },
  ],
  choiceLists: {},
  sectionShowWhen: {},
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/clerk/surveys/test-form-id/entry']}>
      <Routes>
        <Route
          path="/dashboard/clerk/surveys/:formId/entry"
          element={<ClerkDataEntryPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

// Lazy import so mocks apply
let ClerkDataEntryPage: any;
beforeEach(async () => {
  vi.clearAllMocks();
  sessionStorage.clear();

  mockFormReturn = { data: mockForm, isLoading: false, error: null };
  mockDraftReturn = {
    draftId: null,
    resumeData: null,
    saveDraft: mockSaveDraft,
    completeDraft: mockCompleteDraft,
    resetForNewEntry: mockResetForNewEntry,
    loading: false,
  };

  // Mock scrollIntoView (not available in jsdom)
  Element.prototype.scrollIntoView = vi.fn();

  const mod = await import('../ClerkDataEntryPage');
  ClerkDataEntryPage = mod.default;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ClerkDataEntryPage', () => {
  describe('AC3.6.1: All-Fields Form Layout', () => {
    it('renders form title', () => {
      renderPage();
      expect(screen.getByText('Labour Survey 2026')).toBeInTheDocument();
    });

    it('renders all questions grouped by section', () => {
      renderPage();
      expect(screen.getByText('Personal Info')).toBeInTheDocument();
      expect(screen.getByText('Demographics')).toBeInTheDocument();
      expect(screen.getByTestId('question-full_name')).toBeInTheDocument();
      expect(screen.getByTestId('question-age')).toBeInTheDocument();
      expect(screen.getByTestId('question-gender')).toBeInTheDocument();
    });

    it('renders sections as fieldsets', () => {
      const { container } = renderPage();
      const fieldsets = container.querySelectorAll('fieldset');
      expect(fieldsets.length).toBe(2);
    });
  });

  describe('AC3.6.1: Auto-focus', () => {
    it('auto-focuses first input on mount', async () => {
      renderPage();
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByTestId('input-full_name'));
      }, { timeout: 500 });
    });
  });

  describe('AC3.6.4: Ctrl+Enter to Submit', () => {
    it('validates and calls completeDraft on Ctrl+Enter with valid data', async () => {
      renderPage();
      // Fill required fields
      fireEvent.change(screen.getByTestId('input-full_name'), {
        target: { value: 'John Doe' },
      });
      fireEvent.change(screen.getByTestId('input-age'), {
        target: { value: '30' },
      });

      // Fire Ctrl+Enter on the form
      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(mockCompleteDraft).toHaveBeenCalled();
      });
    });

    it('shows validation errors on Ctrl+Enter with empty required fields', async () => {
      renderPage();

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(screen.getByTestId('error-count-badge')).toBeInTheDocument();
      });
      expect(mockCompleteDraft).not.toHaveBeenCalled();
    });
  });

  describe('AC3.6.5: Auto-Reset After Submission', () => {
    it('resets form data after successful submission', async () => {
      renderPage();
      // Fill required fields
      fireEvent.change(screen.getByTestId('input-full_name'), {
        target: { value: 'John Doe' },
      });
      fireEvent.change(screen.getByTestId('input-age'), {
        target: { value: '30' },
      });

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(mockCompleteDraft).toHaveBeenCalled();
        expect(mockResetForNewEntry).toHaveBeenCalled();
      });
    });

    it('shows success toast with completion time', async () => {
      renderPage();
      fireEvent.change(screen.getByTestId('input-full_name'), {
        target: { value: 'John Doe' },
      });
      fireEvent.change(screen.getByTestId('input-age'), {
        target: { value: '30' },
      });

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringMatching(/Form completed in \d+s/),
          }),
        );
      });
    });
  });

  describe('AC3.6.6: Session Tracking', () => {
    it('shows session header with forms completed count', () => {
      renderPage();
      expect(screen.getByTestId('session-header')).toHaveTextContent('Forms completed: 0');
    });

    it('increments session counter after submission', async () => {
      renderPage();
      fireEvent.change(screen.getByTestId('input-full_name'), {
        target: { value: 'John Doe' },
      });
      fireEvent.change(screen.getByTestId('input-age'), {
        target: { value: '30' },
      });

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(screen.getByTestId('session-header')).toHaveTextContent('Forms completed: 1');
      });
    });

    it('persists session to sessionStorage', async () => {
      renderPage();
      fireEvent.change(screen.getByTestId('input-full_name'), {
        target: { value: 'John Doe' },
      });
      fireEvent.change(screen.getByTestId('input-age'), {
        target: { value: '30' },
      });

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        const stored = sessionStorage.getItem('clerk-session');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed.count).toBe(1);
      });
    });
  });

  describe('AC3.6.7: Ctrl+S Save Draft', () => {
    it('calls saveDraft on Ctrl+S', async () => {
      renderPage();

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 's', ctrlKey: true });

      await waitFor(() => {
        expect(mockSaveDraft).toHaveBeenCalled();
        expect(mockToast.success).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Draft saved' }),
        );
      });
    });
  });

  describe('AC3.6.8: Validation & Error Display', () => {
    it('shows inline validation errors for required fields', async () => {
      renderPage();

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(screen.getByTestId('error-full_name')).toHaveTextContent('This field is required');
        expect(screen.getByTestId('error-age')).toHaveTextContent('This field is required');
      });
    });

    it('shows error count badge', async () => {
      renderPage();

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(screen.getByTestId('error-count-badge')).toHaveTextContent('2 errors');
      });
    });

    it('clears error when field is filled', async () => {
      renderPage();

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(screen.getByTestId('error-full_name')).toBeInTheDocument();
      });

      // Fill the field
      fireEvent.change(screen.getByTestId('input-full_name'), {
        target: { value: 'John Doe' },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('error-full_name')).not.toBeInTheDocument();
      });
    });
  });

  describe('Keyboard Shortcuts Bar', () => {
    it('renders shortcuts bar with all shortcuts', () => {
      renderPage();
      const bar = screen.getByTestId('shortcuts-bar');
      expect(bar).toHaveTextContent('Tab');
      expect(bar).toHaveTextContent('Enter');
      expect(bar).toHaveTextContent('Ctrl+Enter');
      expect(bar).toHaveTextContent('Ctrl+S');
      expect(bar).toHaveTextContent('Ctrl+E');
    });
  });

  describe('Loading and Error States', () => {
    it('shows skeleton loading state', () => {
      mockFormReturn = { data: undefined, isLoading: true, error: null };
      renderPage();
      expect(screen.getAllByTestId('skeleton-form')).toHaveLength(2);
    });

    it('shows error state on fetch failure', () => {
      mockFormReturn = { data: undefined, isLoading: false, error: new Error('Network error') };
      renderPage();
      expect(screen.getByText('Failed to load form')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('shows back link in error state', () => {
      mockFormReturn = { data: undefined, isLoading: false, error: new Error('Network error') };
      renderPage();
      fireEvent.click(screen.getByText('Back to surveys'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/clerk/surveys');
    });
  });

  describe('AC3.6.2: Tab / Shift+Tab Navigation', () => {
    it('all form inputs are tabbable (no negative tabindex)', () => {
      renderPage();
      const inputs = document.querySelectorAll(
        '[data-clerk-form] input, [data-clerk-form] select, [data-clerk-form] textarea',
      );
      expect(inputs.length).toBeGreaterThanOrEqual(3);
      inputs.forEach(el => {
        expect(el).not.toHaveAttribute('tabindex', '-1');
      });
    });
  });

  describe('AC3.6.3: Enter-to-advance', () => {
    it('Enter on a text input moves focus to the next input', async () => {
      renderPage();
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByTestId('input-full_name'));
      }, { timeout: 500 });

      // Press Enter on the first input
      fireEvent.keyDown(screen.getByTestId('input-full_name'), { key: 'Enter' });

      expect(document.activeElement).toBe(screen.getByTestId('input-age'));
    });

    it('Enter on the last input does not throw', async () => {
      renderPage();
      const genderInput = screen.getByTestId('input-gender');
      genderInput.focus();

      // Should not throw — idx === inputs.length - 1, no next element
      fireEvent.keyDown(genderInput, { key: 'Enter' });
      // Focus stays on current element
      expect(document.activeElement).toBe(genderInput);
    });
  });

  describe('AC3.6.8: Ctrl+E Error Jump', () => {
    it('Ctrl+E focuses first field with aria-invalid', async () => {
      renderPage();

      // Trigger validation errors
      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(screen.getByTestId('error-full_name')).toBeInTheDocument();
      });

      // Move focus away from any error field
      screen.getByTestId('input-gender').focus();

      // Ctrl+E should jump to first error
      fireEvent.keyDown(form, { key: 'e', ctrlKey: true });

      expect(document.activeElement).toBe(screen.getByTestId('input-full_name'));
    });
  });

  describe('AC3.6.6: Milestone Toast', () => {
    it('shows milestone info toast every 10 forms', async () => {
      // Pre-seed session to count=9 so next submission is the 10th
      sessionStorage.setItem(
        'clerk-session',
        JSON.stringify({ count: 9, totalTimeMs: 90000 }),
      );

      // Re-import to pick up pre-seeded sessionStorage
      const mod = await import('../ClerkDataEntryPage');
      ClerkDataEntryPage = mod.default;

      renderPage();

      // Fill required fields
      fireEvent.change(screen.getByTestId('input-full_name'), {
        target: { value: 'Jane Doe' },
      });
      fireEvent.change(screen.getByTestId('input-age'), {
        target: { value: '25' },
      });

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(mockToast.info).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringMatching(/10 forms complete/),
          }),
        );
      });
    });
  });

  describe('Navigation', () => {
    it('renders back button that navigates to surveys', () => {
      renderPage();
      fireEvent.click(screen.getByText('Back to surveys'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/clerk/surveys');
    });
  });

  describe('Draft Resume (M3)', () => {
    it('restores formData from resumeData on mount', async () => {
      mockDraftReturn = {
        ...mockDraftReturn,
        resumeData: {
          formData: { full_name: 'Saved Name', age: '42' },
          questionPosition: 0,
        },
      };
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('input-full_name')).toHaveValue('Saved Name');
        // Number input: jest-dom expects numeric value
        expect(screen.getByTestId('input-age')).toHaveValue(42);
      });
    });
  });

  describe('Error Handling (H1/H2)', () => {
    it('shows error toast when completeDraft fails', async () => {
      mockCompleteDraft.mockRejectedValueOnce(new Error('IndexedDB full'));
      renderPage();
      fireEvent.change(screen.getByTestId('input-full_name'), {
        target: { value: 'John Doe' },
      });
      fireEvent.change(screen.getByTestId('input-age'), {
        target: { value: '30' },
      });

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Failed to save submission. Please try again.' }),
        );
      });
      // Form should NOT reset on failure
      expect(mockResetForNewEntry).not.toHaveBeenCalled();
    });

    it('shows error toast when saveDraft fails', async () => {
      mockSaveDraft.mockRejectedValueOnce(new Error('Storage quota exceeded'));
      renderPage();

      const form = document.querySelector('[data-clerk-form]')!;
      fireEvent.keyDown(form, { key: 's', ctrlKey: true });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Failed to save draft. Please try again.' }),
        );
      });
    });
  });
});
