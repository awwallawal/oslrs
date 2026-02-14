// @vitest-environment jsdom
/**
 * PublicSurveysPage Tests
 *
 * Story 3.5 AC3.5.1: Grid of published survey form cards with Start Survey / Resume Draft.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { MemoryRouter } from 'react-router-dom';
import PublicSurveysPage from '../PublicSurveysPage';

afterEach(() => {
  cleanup();
});

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockHookReturn = {
  data: undefined as { id: string; formId: string; title: string; description: string | null; version: string; status: string; publishedAt: string }[] | undefined,
  isLoading: false,
  error: null as Error | null,
};

let mockDraftMap: Record<string, 'in-progress' | 'completed'> = {};

vi.mock('../../../forms/hooks/useForms', () => ({
  usePublishedForms: () => mockHookReturn,
  useFormDrafts: () => ({ draftMap: mockDraftMap, loading: false }),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div aria-label="Loading card" />,
}));

function renderComponent() {
  return render(
    <MemoryRouter>
      <PublicSurveysPage />
    </MemoryRouter>
  );
}

describe('PublicSurveysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHookReturn = { data: undefined, isLoading: false, error: null };
    mockDraftMap = {};
  });

  it('renders page heading', () => {
    mockHookReturn = { data: [], isLoading: false, error: null };
    renderComponent();
    expect(screen.getByText('Surveys')).toBeInTheDocument();
    expect(screen.getByText('Available surveys for you to complete')).toBeInTheDocument();
  });

  it('shows loading skeleton cards when loading', () => {
    mockHookReturn = { data: undefined, isLoading: true, error: null };
    renderComponent();
    expect(screen.getByTestId('surveys-loading')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Loading card')).toHaveLength(3);
  });

  it('shows empty state when no surveys available', () => {
    mockHookReturn = { data: [], isLoading: false, error: null };
    renderComponent();
    expect(screen.getByText('No surveys available yet')).toBeInTheDocument();
    expect(screen.getByText('Check back soon.')).toBeInTheDocument();
  });

  it('shows error state on fetch failure', () => {
    mockHookReturn = { data: undefined, isLoading: false, error: new Error('Network error') };
    renderComponent();
    expect(screen.getByTestId('surveys-error')).toHaveTextContent('Network error');
  });

  it('renders survey cards when forms are available', () => {
    mockHookReturn = {
      data: [
        { id: 'f1', formId: 'form-1', title: 'Labour Survey 2026', description: null, version: '1.0.0', status: 'published', publishedAt: '2026-01-01' },
        { id: 'f2', formId: 'form-2', title: 'Skills Assessment', description: null, version: '2.0.0', status: 'published', publishedAt: '2026-01-15' },
      ],
      isLoading: false,
      error: null,
    };
    renderComponent();

    expect(screen.getByTestId('surveys-grid')).toBeInTheDocument();
    expect(screen.getByText('Labour Survey 2026')).toBeInTheDocument();
    expect(screen.getByText('Skills Assessment')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
  });

  it('renders form description when available', () => {
    mockHookReturn = {
      data: [
        { id: 'f1', formId: 'form-1', title: 'Labour Survey', description: 'Register your skills and experience', version: '1.0.0', status: 'published', publishedAt: '2026-01-01' },
      ],
      isLoading: false,
      error: null,
    };
    renderComponent();

    expect(screen.getByText('Register your skills and experience')).toBeInTheDocument();
  });

  it('does not render description when null', () => {
    mockHookReturn = {
      data: [
        { id: 'f1', formId: 'form-1', title: 'Labour Survey', description: null, version: '1.0.0', status: 'published', publishedAt: '2026-01-01' },
      ],
      isLoading: false,
      error: null,
    };
    renderComponent();

    expect(screen.getByText('Labour Survey')).toBeInTheDocument();
    // Only the title area and button — no description paragraph
    const card = screen.getByTestId('surveys-grid');
    expect(card.querySelectorAll('.line-clamp-2')).toHaveLength(0);
  });

  it('navigates to public survey form on Start Survey click', () => {
    mockHookReturn = {
      data: [
        { id: 'f1', formId: 'form-1', title: 'Labour Survey', description: null, version: '1.0.0', status: 'published', publishedAt: '2026-01-01' },
      ],
      isLoading: false,
      error: null,
    };
    renderComponent();

    fireEvent.click(screen.getByTestId('start-survey-f1'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/public/surveys/f1');
  });

  it('shows Resume Draft button when form has an in-progress draft', () => {
    mockDraftMap = { f1: 'in-progress' };
    mockHookReturn = {
      data: [
        { id: 'f1', formId: 'form-1', title: 'Labour Survey', description: null, version: '1.0.0', status: 'published', publishedAt: '2026-01-01' },
        { id: 'f2', formId: 'form-2', title: 'Skills Assessment', description: null, version: '2.0.0', status: 'published', publishedAt: '2026-01-15' },
      ],
      isLoading: false,
      error: null,
    };
    renderComponent();

    expect(screen.getByTestId('start-survey-f1')).toHaveTextContent('Resume Draft');
    expect(screen.getByTestId('start-survey-f2')).toHaveTextContent('Start Survey');
  });

  it('shows Completed badge when form draft is completed', () => {
    mockDraftMap = { f1: 'completed' };
    mockHookReturn = {
      data: [
        { id: 'f1', formId: 'form-1', title: 'Labour Survey', description: null, version: '1.0.0', status: 'published', publishedAt: '2026-01-01' },
      ],
      isLoading: false,
      error: null,
    };
    renderComponent();

    expect(screen.getByTestId('completed-survey-f1')).toHaveTextContent('Completed');
  });

  it('shows Start Survey for forms without drafts', () => {
    mockHookReturn = {
      data: [
        { id: 'f1', formId: 'form-1', title: 'Labour Survey', description: null, version: '1.0.0', status: 'published', publishedAt: '2026-01-01' },
      ],
      isLoading: false,
      error: null,
    };
    renderComponent();

    expect(screen.getByTestId('start-survey-f1')).toHaveTextContent('Start Survey');
  });
});
