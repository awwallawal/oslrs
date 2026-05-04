// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);

// ── Hoisted mocks ──────────────────────────────────────────────────────

const {
  mockListAuditLogs,
  mockGetDistinctValues,
  mockSearchPrincipals,
  mockExportAuditLogs,
} = vi.hoisted(() => ({
  mockListAuditLogs: vi.fn(),
  mockGetDistinctValues: vi.fn(),
  mockSearchPrincipals: vi.fn(),
  mockExportAuditLogs: vi.fn(),
}));

vi.mock('../api/audit-log.api', async () => {
  const actual = await vi.importActual<typeof import('../api/audit-log.api')>(
    '../api/audit-log.api',
  );
  return {
    ...actual,
    listAuditLogs: (...args: unknown[]) => mockListAuditLogs(...args),
    getDistinctValues: (...args: unknown[]) => mockGetDistinctValues(...args),
    searchPrincipals: (...args: unknown[]) => mockSearchPrincipals(...args),
    exportAuditLogs: (...args: unknown[]) => mockExportAuditLogs(...args),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import AuditLogPage from '../pages/AuditLogPage';

function renderPage(initialUrl = '/dashboard/super-admin/audit-log') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sampleRow = {
  id: '00000000-0000-0000-0000-000000000001',
  actorId: '11111111-1111-1111-1111-111111111111',
  consumerId: null,
  action: 'user.login',
  targetResource: 'users',
  targetId: '11111111-1111-1111-1111-111111111111',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla',
  details: { status_code: 200 },
  createdAt: '2026-05-04T12:00:00.000Z',
  principalName: 'Awwal Lawal',
  principalType: 'user' as const,
};

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockListAuditLogs.mockResolvedValue({ rows: [sampleRow], nextCursor: null });
    mockGetDistinctValues.mockImplementation((field: string) =>
      field === 'action'
        ? Promise.resolve(['user.login'])
        : Promise.resolve(['users']),
    );
    mockSearchPrincipals.mockResolvedValue([]);
  });

  it('renders the page heading and description', async () => {
    renderPage();
    expect(await screen.findByText('Audit Log')).toBeInTheDocument();
  });

  it('loads audit logs on mount and renders the row', async () => {
    renderPage();
    await waitFor(() => {
      expect(mockListAuditLogs).toHaveBeenCalled();
    });
    expect(await screen.findByText('Awwal Lawal')).toBeInTheDocument();
  });

  it('opens detail drawer on row click', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByTestId(`audit-log-row-${sampleRow.id}`);
    await user.click(row);

    expect(await screen.findByTestId('audit-log-detail-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('audit-log-payload')).toBeInTheDocument();
  });

  it('triggers CSV download on Export click', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['# header\nrow1'], { type: 'text/csv' });
    mockExportAuditLogs.mockResolvedValue({
      blob,
      filename: 'audit_log_all_all_all-dates.csv',
      rowCount: 1,
    });

    // Stub createObjectURL / revokeObjectURL — not implemented in jsdom.
    const createSpy = vi.fn(() => 'blob:mock');
    const revokeSpy = vi.fn();
    URL.createObjectURL = createSpy as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeSpy as typeof URL.revokeObjectURL;

    renderPage();
    await screen.findByText('Awwal Lawal');

    await user.click(screen.getByTestId('export-csv-button'));

    await waitFor(() => {
      expect(mockExportAuditLogs).toHaveBeenCalledTimes(1);
    });
    expect(createSpy).toHaveBeenCalledWith(blob);
  });

  it('disables Next pagination button when nextCursor is null', async () => {
    renderPage();

    await screen.findByText('Awwal Lawal');
    const nextButton = screen.getByTestId('pagination-next') as HTMLButtonElement;
    expect(nextButton.disabled).toBe(true);
  });

  it('parses URL filter params on mount', async () => {
    renderPage(
      '/dashboard/super-admin/audit-log?principal=user&action=user.login&from=2026-04-01T00:00:00.000Z',
    );

    await waitFor(() => {
      expect(mockListAuditLogs).toHaveBeenCalled();
    });
    const callArg = mockListAuditLogs.mock.calls[0][0];
    expect(callArg.principalTypes).toEqual(['user']);
    expect(callArg.actions).toEqual(['user.login']);
    expect(callArg.from).toBe('2026-04-01T00:00:00.000Z');
  });
});
