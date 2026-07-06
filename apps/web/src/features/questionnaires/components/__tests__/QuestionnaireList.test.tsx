// @vitest-environment jsdom
/**
 * QuestionnaireList Tests
 *
 * Tests for the QuestionnaireList component:
 * - Renders forms table with status badges
 * - Shows delete button only for draft forms
 * - Delete button opens confirmation dialog
 * - Story 9-17: public-wizard pin badge + Pin/Unpin buttons + dialogs
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QuestionnaireList } from '../QuestionnaireList';
import { ApiError } from '../../../../lib/api-client';

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

// Story 9-17: mock the settings API hooks the pin UI consumes.
const mockUseGetSetting = vi.fn();
const mockUpdateSettingMutate = vi.fn();

vi.mock('../../../settings/api/settings.api', () => ({
  useGetSetting: (key: string) => mockUseGetSetting(key),
  useUpdateSetting: () => ({
    mutate: mockUpdateSettingMutate,
    isPending: false,
  }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderWithProviders(component: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {component}
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { queryClient, ...utils };
}

describe('QuestionnaireList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: nothing pinned.
    mockUseGetSetting.mockReturnValue({ data: { key: 'wizard.public_form_id', value: null } });
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

// ── Story 9-17: public-wizard pin UI ──────────────────────────────────────
describe('QuestionnaireList — public-wizard pin (Story 9-17)', () => {
  const PIN_KEY = 'wizard.public_form_id';

  const FORMS = [
    { id: 'id-a', formId: 'form-a', title: 'Alpha Survey', version: '1.0', status: 'published', uploadedAt: '2026-01-31T10:00:00Z' },
    { id: 'id-b', formId: 'form-b', title: 'Beta Survey', version: '2.0', status: 'published', uploadedAt: '2026-01-31T10:00:00Z' },
    { id: 'id-c', formId: 'form-c', title: 'Gamma Draft', version: '1.0', status: 'draft', uploadedAt: '2026-01-31T10:00:00Z' },
    { id: 'id-d', formId: 'form-d', title: 'Delta Archived', version: '1.0', status: 'archived', uploadedAt: '2026-01-31T10:00:00Z' },
  ];

  function rowFor(title: string): HTMLElement {
    return screen.getByText(title).closest('tr') as HTMLElement;
  }

  function setForms() {
    mockUseQuestionnaires.mockReturnValue({
      data: { data: FORMS, meta: { total: 4, page: 1, pageSize: 10, totalPages: 1 } },
      isLoading: false,
    });
  }

  function setPinned(formId: string | null) {
    mockUseGetSetting.mockReturnValue({ data: { key: PIN_KEY, value: formId } });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setForms();
    setPinned(null);
  });

  it('1. renders the active-for-public-wizard badge on the pinned row', async () => {
    setPinned('id-a');
    renderWithProviders(<QuestionnaireList />);

    const rowA = rowFor('Alpha Survey');
    expect(within(rowA).getByTestId('qm-pinned-badge')).toBeInTheDocument();
    expect(within(rowA).getByTestId('qm-pinned-badge')).toHaveAttribute(
      'aria-label',
      'Currently active as the public-registration form',
    );
  });

  it('2. badge is absent on all other published rows', async () => {
    setPinned('id-a');
    renderWithProviders(<QuestionnaireList />);

    const rowB = rowFor('Beta Survey');
    expect(within(rowB).queryByTestId('qm-pinned-badge')).not.toBeInTheDocument();
  });

  it('3. pin button present on unpinned published rows, absent on draft/archived rows', async () => {
    renderWithProviders(<QuestionnaireList />);

    expect(within(rowFor('Alpha Survey')).getByTestId('qm-pin-button')).toBeInTheDocument();
    expect(within(rowFor('Beta Survey')).getByTestId('qm-pin-button')).toBeInTheDocument();
    expect(within(rowFor('Gamma Draft')).queryByTestId('qm-pin-button')).not.toBeInTheDocument();
    expect(within(rowFor('Delta Archived')).queryByTestId('qm-pin-button')).not.toBeInTheDocument();
  });

  it('4. clicking Pin opens the dialog with the dynamic body (current + new title)', async () => {
    setPinned('id-a'); // Alpha currently pinned
    renderWithProviders(<QuestionnaireList />);

    // Pin Beta — dialog should mention current (Alpha) + new (Beta)
    await userEvent.click(within(rowFor('Beta Survey')).getByTestId('qm-pin-button'));

    expect(await screen.findByText('Pin for public wizard?')).toBeInTheDocument();
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Alpha Survey/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Beta Survey/)).toBeInTheDocument();
    expect(within(dialog).getByText(/up to 5 minutes/)).toBeInTheDocument();
  });

  it('5. confirming Pin invokes the update-setting mutation with the right payload', async () => {
    renderWithProviders(<QuestionnaireList />);

    await userEvent.click(within(rowFor('Beta Survey')).getByTestId('qm-pin-button'));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(mockUpdateSettingMutate).toHaveBeenCalledWith(
      { key: PIN_KEY, value: 'id-b' },
      expect.anything(),
    );
  });

  it('6. confirming Pin invalidates the questionnaires + setting queries on success', async () => {
    mockUpdateSettingMutate.mockImplementation((_payload, opts) => opts?.onSuccess?.());
    const { queryClient } = renderWithProviders(<QuestionnaireList />);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await userEvent.click(within(rowFor('Beta Survey')).getByTestId('qm-pin-button'));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['questionnaires'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settings', PIN_KEY] });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Beta Survey'));
  });

  it('7. on mutation error, badge rolls back and an error toast appears', async () => {
    setPinned('id-a'); // Alpha pinned
    mockUpdateSettingMutate.mockImplementation((_payload, opts) =>
      opts?.onError?.(new Error('boom')),
    );
    renderWithProviders(<QuestionnaireList />);

    // Attempt to pin Beta — optimistic then rollback
    await userEvent.click(within(rowFor('Beta Survey')).getByTestId('qm-pin-button'));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Couldn't pin the form. Please try again.");
    });
    // Badge rolled back to Alpha (not moved to Beta).
    expect(within(rowFor('Alpha Survey')).getByTestId('qm-pinned-badge')).toBeInTheDocument();
    expect(within(rowFor('Beta Survey')).queryByTestId('qm-pinned-badge')).not.toBeInTheDocument();
  });

  it('8. pin button on the pinned form shows as Pinned · Unpin', async () => {
    setPinned('id-a');
    renderWithProviders(<QuestionnaireList />);

    const rowA = rowFor('Alpha Survey');
    const unpinBtn = within(rowA).getByTestId('qm-unpin-button');
    expect(unpinBtn).toBeInTheDocument();
    expect(unpinBtn).toHaveTextContent(/Pinned/);
    // The pinned row does not also offer a "Pin" button.
    expect(within(rowA).queryByTestId('qm-pin-button')).not.toBeInTheDocument();
  });

  it('9. clicking Unpin opens the dialog with the unpin-warning body', async () => {
    setPinned('id-a');
    renderWithProviders(<QuestionnaireList />);

    await userEvent.click(within(rowFor('Alpha Survey')).getByTestId('qm-unpin-button'));

    expect(await screen.findByText('Un-pin this form?')).toBeInTheDocument();
    expect(
      screen.getByText(/Public users won't see any survey questions until you pin a form/),
    ).toBeInTheDocument();
  });

  // Story 13-17: the global interceptor runs the re-auth flow; a rejection
  // with AUTH_REAUTH_REQUIRED means the user cancelled it — the toast must be
  // honest (not the generic "try again"), and the optimistic pin rolls back.
  it('11. reauth-cancelled pin shows the honest re-auth toast and rolls back (Story 13-17)', async () => {
    setPinned('id-a'); // Alpha pinned
    mockUpdateSettingMutate.mockImplementation((_payload, opts) =>
      opts?.onError?.(
        new ApiError('Re-authentication was not completed, so this action was cancelled.', 403, 'AUTH_REAUTH_REQUIRED'),
      ),
    );
    renderWithProviders(<QuestionnaireList />);

    await userEvent.click(within(rowFor('Beta Survey')).getByTestId('qm-pin-button'));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Re-authentication is required to pin a form. The form was not pinned.',
      );
    });
    // Rolled back: Alpha still pinned, Beta not.
    expect(within(rowFor('Alpha Survey')).getByTestId('qm-pinned-badge')).toBeInTheDocument();
    expect(within(rowFor('Beta Survey')).queryByTestId('qm-pinned-badge')).not.toBeInTheDocument();
  });

  it('12. reauth-cancelled UNPIN shows the unpin-specific honest toast (Story 13-17)', async () => {
    setPinned('id-a');
    mockUpdateSettingMutate.mockImplementation((_payload, opts) =>
      opts?.onError?.(
        new ApiError('Re-authentication was not completed, so this action was cancelled.', 403, 'AUTH_REAUTH_REQUIRED'),
      ),
    );
    renderWithProviders(<QuestionnaireList />);

    await userEvent.click(within(rowFor('Alpha Survey')).getByTestId('qm-unpin-button'));
    await userEvent.click(await screen.findByRole('button', { name: 'Un-pin' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Re-authentication is required to un-pin a form. The form is still pinned.',
      );
    });
    expect(within(rowFor('Alpha Survey')).getByTestId('qm-pinned-badge')).toBeInTheDocument();
  });

  it('10. confirming Unpin sets the mutation payload value to null', async () => {
    setPinned('id-a');
    renderWithProviders(<QuestionnaireList />);

    await userEvent.click(within(rowFor('Alpha Survey')).getByTestId('qm-unpin-button'));
    await userEvent.click(await screen.findByRole('button', { name: 'Un-pin' }));

    expect(mockUpdateSettingMutate).toHaveBeenCalledWith(
      { key: PIN_KEY, value: null },
      expect.anything(),
    );
  });
});
