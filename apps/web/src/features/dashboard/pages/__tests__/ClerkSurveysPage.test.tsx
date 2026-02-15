// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClerkSurveysPage from '../ClerkSurveysPage';

expect.extend(matchers);

// ── Mock state ──────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

let mockFormsReturn: {
  data: any[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

let mockDraftMap: Record<string, 'in-progress'>;

// ── Mock modules ────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../forms/hooks/useForms', () => ({
  usePublishedForms: () => mockFormsReturn,
  useFormDrafts: () => ({ draftMap: mockDraftMap, loading: false }),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div aria-label="Loading card" />,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockForms = [
  { id: 'f1', formId: 'f1', title: 'Labour Survey', description: 'Annual survey', version: '1.0', status: 'published', publishedAt: '2026-01-01' },
  { id: 'f2', formId: 'f2', title: 'Skills Assessment', description: null, version: '2.0', status: 'published', publishedAt: '2026-01-15' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ClerkSurveysPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFormsReturn = { data: mockForms, isLoading: false, error: null };
  mockDraftMap = {};
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ClerkSurveysPage', () => {
  describe('AC3.6.10: Survey List Page', () => {
    it('renders page title and subtitle', () => {
      renderPage();
      expect(screen.getByText('Entry Queue')).toBeInTheDocument();
      expect(screen.getByText('Select a form to begin data entry')).toBeInTheDocument();
    });

    it('renders form cards in a grid', () => {
      renderPage();
      expect(screen.getByTestId('surveys-grid')).toBeInTheDocument();
      expect(screen.getByText('Labour Survey')).toBeInTheDocument();
      expect(screen.getByText('Skills Assessment')).toBeInTheDocument();
    });

    it('shows form description when available', () => {
      renderPage();
      expect(screen.getByText('Annual survey')).toBeInTheDocument();
    });

    it('shows form version', () => {
      renderPage();
      expect(screen.getByText('v1.0')).toBeInTheDocument();
      expect(screen.getByText('v2.0')).toBeInTheDocument();
    });

    it('navigates to entry page on Start Entry click', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('start-entry-f1'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/clerk/surveys/f1/entry');
    });
  });

  describe('Loading state', () => {
    it('shows skeleton cards when loading', () => {
      mockFormsReturn = { data: undefined, isLoading: true, error: null };
      renderPage();
      expect(screen.getByTestId('surveys-loading')).toBeInTheDocument();
      expect(screen.getAllByLabelText('Loading card')).toHaveLength(3);
    });
  });

  describe('Error state', () => {
    it('shows error message on fetch failure', () => {
      mockFormsReturn = { data: undefined, isLoading: false, error: new Error('Network error') };
      renderPage();
      expect(screen.getByTestId('surveys-error')).toHaveTextContent('Network error');
    });
  });

  describe('Empty state', () => {
    it('shows empty state when no forms available', () => {
      mockFormsReturn = { data: [], isLoading: false, error: null };
      renderPage();
      expect(screen.getByTestId('surveys-empty')).toHaveTextContent('No forms available');
    });
  });

  describe('Draft state handling', () => {
    it('shows Resume Draft for in-progress forms', () => {
      mockDraftMap = { f1: 'in-progress' };
      renderPage();
      expect(screen.getByTestId('start-entry-f1')).toHaveTextContent('Resume Draft');
      expect(screen.getByTestId('start-entry-f2')).toHaveTextContent('Start Entry');
    });

    it('shows Start Entry for form with no draft (re-submission after completion)', () => {
      mockDraftMap = {};
      renderPage();
      expect(screen.getByTestId('start-entry-f1')).toHaveTextContent('Start Entry');
    });
  });
});
