// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NativeFormSchema } from '@oslsr/types';

expect.extend(matchers);

// ── Mock Data ────────────────────────────────────────────────────────────

const MOCK_FORM_ID = '018e5f2a-1234-7890-abcd-000000000001';

const MOCK_SCHEMA: NativeFormSchema = {
  id: MOCK_FORM_ID,
  title: 'Test Survey Form',
  version: '1.0.0',
  status: 'draft',
  sections: [
    {
      id: 'sec-1',
      title: 'Demographics',
      questions: [
        { id: 'q-1', type: 'text', name: 'full_name', label: 'Full Name', required: true },
        { id: 'q-2', type: 'number', name: 'age', label: 'Age', required: false },
        { id: 'q-3', type: 'select_one', name: 'gender', label: 'Gender', required: true, choices: 'gender_list' },
      ],
    },
    {
      id: 'sec-2',
      title: 'Skills',
      questions: [
        { id: 'q-4', type: 'select_multiple', name: 'skills', label: 'Skills', required: true, choices: 'skill_list' },
      ],
    },
  ],
  choiceLists: {
    gender_list: [
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' },
    ],
    skill_list: [
      { label: 'Carpentry', value: 'carpentry' },
      { label: 'Welding', value: 'welding' },
    ],
  },
  createdAt: '2026-02-07T10:00:00Z',
};

const PUBLISHED_SCHEMA: NativeFormSchema = {
  ...MOCK_SCHEMA,
  status: 'published',
  publishedAt: '2026-02-07T12:00:00Z',
};

// ── Mocks ────────────────────────────────────────────────────────────────

const mockMutate = vi.fn();
const mockPublishMutate = vi.fn();
const mockUseNativeFormSchema = vi.fn();
const mockUseUpdateNativeFormSchema = vi.fn();
const mockUsePublishNativeForm = vi.fn();

vi.mock('../hooks/useQuestionnaires', () => ({
  useNativeFormSchema: (...args: unknown[]) => mockUseNativeFormSchema(...args),
  useUpdateNativeFormSchema: () => mockUseUpdateNativeFormSchema(),
  usePublishNativeForm: () => mockUsePublishNativeForm(),
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

// Mock nativeFormSchema Zod validation
vi.mock('@oslsr/types', async () => {
  const actual = await vi.importActual('@oslsr/types');
  return {
    ...actual as Record<string, unknown>,
    nativeFormSchema: {
      safeParse: vi.fn(() => ({ success: true })),
    },
  };
});

// ── Helper ───────────────────────────────────────────────────────────────

function renderPage(formId: string = MOCK_FORM_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[`/builder/${formId}`]}
      >
        <Routes>
          <Route path="/builder/:formId" element={<FormBuilderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Must import AFTER mocks are set up
import FormBuilderPage from './FormBuilderPage';
import { SectionsTab } from '../components/SectionsTab';
import { ChoiceListsTab } from '../components/ChoiceListsTab';
import { PreviewTab } from '../components/PreviewTab';

afterEach(() => {
  cleanup();
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('FormBuilderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseUpdateNativeFormSchema.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
    mockUsePublishNativeForm.mockReturnValue({
      mutate: mockPublishMutate,
      isPending: false,
    });
  });

  // 1. Loading skeleton
  it('renders loading skeleton while fetching form schema', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderPage();
    expect(screen.getByLabelText('Loading form')).toBeInTheDocument();
  });

  // 2. Tabs render after load
  it('renders tabs (Settings, Sections, Choices, Preview) after load', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: { data: MOCK_SCHEMA },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Choices' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument();
  });

  // 3. Settings tab displays form title and version
  it('Settings tab displays form title and version', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: { data: MOCK_SCHEMA },
      isLoading: false,
      isError: false,
    });

    renderPage();

    // Settings is the default tab
    expect(screen.getByDisplayValue('Test Survey Form')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1.0.0')).toBeInTheDocument();
  });

  // 4. Settings tab allows editing title
  it('Settings tab allows editing title', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: { data: MOCK_SCHEMA },
      isLoading: false,
      isError: false,
    });

    renderPage();

    const titleInput = screen.getByDisplayValue('Test Survey Form');
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
    expect(screen.getByDisplayValue('Updated Title')).toBeInTheDocument();
    // Unsaved changes indicator should appear
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  // 5. Sections tab lists sections from schema (direct component test)
  it('SectionsTab lists sections from schema', () => {
    const onChange = vi.fn();
    render(
      <SectionsTab schema={MOCK_SCHEMA} onChange={onChange} readOnly={false} />
    );

    expect(screen.getByText('Demographics')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('3 questions')).toBeInTheDocument();
    expect(screen.getByText('1 question')).toBeInTheDocument();
  });

  // 6. Sections tab Add Section creates new section
  it('SectionsTab Add Section calls onChange', () => {
    const onChange = vi.fn();
    render(
      <SectionsTab schema={MOCK_SCHEMA} onChange={onChange} readOnly={false} />
    );

    fireEvent.click(screen.getByText('Add Section'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0];
    expect(call.sections).toHaveLength(3); // 2 existing + 1 new
    expect(call.sections[2].title).toBe('');
  });

  // 7. Choices tab lists choice lists
  it('ChoiceListsTab lists choice lists from schema', () => {
    const onChange = vi.fn();
    render(
      <ChoiceListsTab schema={MOCK_SCHEMA} onChange={onChange} readOnly={false} />
    );

    expect(screen.getByText('gender_list')).toBeInTheDocument();
    expect(screen.getByText('skill_list')).toBeInTheDocument();
  });

  // 8. Choices tab Add Choice List
  it('ChoiceListsTab Add Choice List calls onChange', () => {
    const onChange = vi.fn();
    render(
      <ChoiceListsTab schema={MOCK_SCHEMA} onChange={onChange} readOnly={false} />
    );

    fireEvent.click(screen.getByText('Add Choice List'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0];
    expect(call.choiceLists).toHaveProperty('new_list');
  });

  // 9. Preview tab shows field summary table
  it('PreviewTab shows field summary table', () => {
    render(
      <MemoryRouter>
        <PreviewTab schema={MOCK_SCHEMA} />
      </MemoryRouter>
    );

    expect(screen.getByText('Field Summary')).toBeInTheDocument();
    expect(screen.getByText('full_name')).toBeInTheDocument();
    expect(screen.getByText('age')).toBeInTheDocument();
    expect(screen.getByText('JSON Schema')).toBeInTheDocument();
  });

  // 10. Save button calls updateNativeFormSchema mutation
  it('Save button calls updateNativeFormSchema mutation', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: { data: MOCK_SCHEMA },
      isLoading: false,
      isError: false,
    });

    renderPage();

    // Make a change first to enable Save
    const titleInput = screen.getByDisplayValue('Test Survey Form');
    fireEvent.change(titleInput, { target: { value: 'Changed' } });

    fireEvent.click(screen.getByText('Save'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  // 11. Publish button shows confirmation dialog
  it('Publish button shows confirmation dialog', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: { data: MOCK_SCHEMA },
      isLoading: false,
      isError: false,
    });

    renderPage();

    fireEvent.click(screen.getByText('Publish'));
    expect(screen.getByText('Publish form?')).toBeInTheDocument();
    expect(screen.getByText(/Published forms cannot be edited/)).toBeInTheDocument();
  });

  // 12. Published form disables editing (read-only mode)
  it('Published form disables editing (read-only mode)', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: { data: PUBLISHED_SCHEMA },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByText(/This form is published/)).toBeInTheDocument();
    // Save and Publish buttons should not be present
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(screen.queryByText('Publish')).not.toBeInTheDocument();

    // Title input should be disabled
    const titleInput = screen.getByDisplayValue('Test Survey Form');
    expect(titleInput).toBeDisabled();
  });

  // 13. Shows form title in header
  it('shows form title in header', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: { data: MOCK_SCHEMA },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByText('Test Survey Form')).toBeInTheDocument();
  });

  // 14. Error state shows fallback
  it('shows error state when schema fails to load', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderPage();

    expect(screen.getByText('Failed to load form schema.')).toBeInTheDocument();
    expect(screen.getByText('Back to Questionnaires')).toBeInTheDocument();
  });

  // 15. Shows status badge
  it('shows status badge for draft form', () => {
    mockUseNativeFormSchema.mockReturnValue({
      data: { data: MOCK_SCHEMA },
      isLoading: false,
      isError: false,
    });

    renderPage();

    // The badge component renders the status text
    const badges = screen.getAllByText('draft');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
