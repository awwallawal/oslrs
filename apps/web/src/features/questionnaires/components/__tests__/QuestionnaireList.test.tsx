// @vitest-environment jsdom
/**
 * QuestionnaireList Unpublish Tests
 *
 * Story 2.5-2: Tests for unpublish functionality in QuestionnaireList
 *
 * Tests:
 * - Shows unpublish button only for published forms
 * - Unpublish button opens confirmation dialog
 * - Confirmation dialog triggers mutation on confirm
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuestionnaireList } from '../QuestionnaireList';

// Mock the hooks
const mockUseQuestionnaires = vi.fn();
const mockUpdateStatus = vi.fn();
const mockDeleteMutation = vi.fn();
const mockPublishMutation = vi.fn();
const mockUnpublishMutation = vi.fn();

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
  usePublishToOdk: () => ({
    mutate: mockPublishMutation,
    isPending: false,
  }),
  useUnpublishFromOdk: () => ({
    mutate: mockUnpublishMutation,
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

describe('QuestionnaireList - Unpublish Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows unpublish button only for published forms', async () => {
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
      // Published form should have unpublish button (CloudOff icon)
      const rows = screen.getAllByRole('row');
      // Row 0 is header, Row 1 is published form
      const publishedRow = rows[1];
      const unpublishButton = publishedRow.querySelector('button[title="Unpublish from ODK Central"]');
      expect(unpublishButton).toBeInTheDocument();

      // Draft form should NOT have unpublish button
      const draftRow = rows[2];
      const draftUnpublishButton = draftRow.querySelector('button[title="Unpublish from ODK Central"]');
      expect(draftUnpublishButton).not.toBeInTheDocument();

      // Archived form should NOT have unpublish button
      const archivedRow = rows[3];
      const archivedUnpublishButton = archivedRow.querySelector('button[title="Unpublish from ODK Central"]');
      expect(archivedUnpublishButton).not.toBeInTheDocument();
    });
  });

  it('unpublish button opens confirmation dialog', async () => {
    mockUseQuestionnaires.mockReturnValue({
      data: {
        data: [
          { id: '1', formId: 'form-1', title: 'Test Form', version: '2.0', status: 'published', uploadedAt: '2026-01-31T10:00:00Z' },
        ],
        meta: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
      },
      isLoading: false,
    });

    renderWithProviders(<QuestionnaireList />);

    await waitFor(() => {
      const unpublishButton = screen.getByTitle('Unpublish from ODK Central');
      fireEvent.click(unpublishButton);
    });

    // Dialog should be visible
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText('Unpublish from ODK Central?')).toBeInTheDocument();
      expect(screen.getByText(/This will unpublish "Test Form" v2.0/)).toBeInTheDocument();
    });
  });

  it('confirmation dialog triggers mutation on confirm', async () => {
    mockUseQuestionnaires.mockReturnValue({
      data: {
        data: [
          { id: 'form-uuid-123', formId: 'form-1', title: 'Test Form', version: '1.0', status: 'published', uploadedAt: '2026-01-31T10:00:00Z' },
        ],
        meta: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
      },
      isLoading: false,
    });

    renderWithProviders(<QuestionnaireList />);

    // Click unpublish button to open dialog
    await waitFor(() => {
      const unpublishButton = screen.getByTitle('Unpublish from ODK Central');
      fireEvent.click(unpublishButton);
    });

    // Click the confirm button in dialog
    await waitFor(() => {
      const confirmButton = screen.getByRole('button', { name: /unpublish/i });
      // Filter to get the action button, not the trigger
      if (confirmButton.closest('[role="alertdialog"]')) {
        fireEvent.click(confirmButton);
      }
    });

    // Mutation should be called with the form ID
    await waitFor(() => {
      expect(mockUnpublishMutation).toHaveBeenCalledWith(
        'form-uuid-123',
        expect.objectContaining({
          onSettled: expect.any(Function),
        })
      );
    });
  });
});
