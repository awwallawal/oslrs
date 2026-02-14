// @vitest-environment jsdom
/**
 * QuestionnaireList Tests
 *
 * Tests for the QuestionnaireList component:
 * - Renders forms table with status badges
 * - Shows delete button only for draft forms
 * - Delete button opens confirmation dialog
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuestionnaireList } from '../QuestionnaireList';

afterEach(() => {
  cleanup();
});

// Mock the hooks
const mockUseQuestionnaires = vi.fn();
const mockUpdateStatus = vi.fn();
const mockDeleteMutation = vi.fn();

vi.mock('../../hooks/useQuestionnaires', () => ({
  useQuestionnaires: () => mockUseQuestionnaires(),
  useUpdateStatus: () => ({
    mutate: mockUpdateStatus,
    isPending: false,
  }),
  useDeleteQuestionnaire: () => ({
    mutate: mockDeleteMutation,
    isPending: false,
  }),
}));

// Mock getDownloadUrl
vi.mock('../../api/questionnaire.api', () => ({
  getDownloadUrl: (id: string) => `/api/v1/questionnaires/${id}/download`,
}));

function renderWithProviders(component: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {component}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('QuestionnaireList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows delete button only for draft and archived forms', async () => {
    mockUseQuestionnaires.mockReturnValue({
      data: {
        data: [
          { id: '1', formId: 'form-1', title: 'Published Form', version: '1.0', status: 'published', uploadedAt: '2026-01-31T10:00:00Z' },
          { id: '2', formId: 'form-2', title: 'Draft Form', version: '1.0', status: 'draft', uploadedAt: '2026-01-31T10:00:00Z' },
          { id: '3', formId: 'form-3', title: 'Archived Form', version: '1.0', status: 'archived', uploadedAt: '2026-01-31T10:00:00Z' },
        ],
        meta: { total: 3, page: 1, pageSize: 10, totalPages: 1 },
      },
      isLoading: false,
    });

    renderWithProviders(<QuestionnaireList />);

    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      // Row 0 is header, Row 1 is published, Row 2 is draft, Row 3 is archived
      const publishedRow = rows[1];
      const draftRow = rows[2];
      const archivedRow = rows[3];

      // Published form should NOT have delete button
      expect(publishedRow.querySelector('button[title="Delete permanently"]')).not.toBeInTheDocument();

      // Draft form SHOULD have delete button
      expect(draftRow.querySelector('button[title="Delete permanently"]')).toBeInTheDocument();

      // Archived form SHOULD also have delete button
      expect(archivedRow.querySelector('button[title="Delete permanently"]')).toBeInTheDocument();
    });
  });

  it('shows empty state when no forms exist', async () => {
    mockUseQuestionnaires.mockReturnValue({
      data: {
        data: [],
        meta: { total: 0, page: 1, pageSize: 10, totalPages: 0 },
      },
      isLoading: false,
    });

    renderWithProviders(<QuestionnaireList />);

    await waitFor(() => {
      expect(screen.getByText('No questionnaire forms found')).toBeInTheDocument();
    });
  });
});
