// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);

import AuditLogResultsTable from '../components/AuditLogResultsTable';
import type { AuditLogRow } from '../api/audit-log.api';

const sampleRows: AuditLogRow[] = [
  {
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
    principalType: 'user',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    actorId: null,
    consumerId: '22222222-2222-2222-2222-222222222222',
    action: 'consumer.api_call',
    targetResource: 'respondents',
    targetId: null,
    ipAddress: '10.0.0.1',
    userAgent: null,
    details: { status_code: 401 },
    createdAt: '2026-05-04T11:30:00.000Z',
    principalName: 'Acme Partner',
    principalType: 'consumer',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    actorId: null,
    consumerId: null,
    action: 'system.cron',
    targetResource: 'submissions',
    targetId: null,
    ipAddress: null,
    userAgent: null,
    details: null,
    createdAt: '2026-05-04T11:00:00.000Z',
    principalName: 'System',
    principalType: 'system',
  },
];

describe('AuditLogResultsTable', () => {
  it('renders skeleton while loading', () => {
    render(<AuditLogResultsTable rows={[]} isLoading={true} onRowClick={vi.fn()} />);
    expect(screen.getByTestId('results-table-skeleton')).toBeInTheDocument();
  });

  it('renders empty state when no rows', () => {
    render(<AuditLogResultsTable rows={[]} isLoading={false} onRowClick={vi.fn()} />);
    expect(screen.getByTestId('results-table-empty')).toBeInTheDocument();
  });

  it('renders rows with principal name + action + outcome derived from status_code', () => {
    render(
      <AuditLogResultsTable rows={sampleRows} isLoading={false} onRowClick={vi.fn()} />,
    );

    const table = screen.getByTestId('audit-log-results-table');
    expect(within(table).getByText('Awwal Lawal')).toBeInTheDocument();
    expect(within(table).getByText('user.login')).toBeInTheDocument();
    expect(within(table).getByText('consumer.api_call')).toBeInTheDocument();
    expect(within(table).getByText('System')).toBeInTheDocument();

    // Outcome inferred from details.status_code — 200 → Success, 401 → Failure, null → —
    expect(within(table).getByText('Success')).toBeInTheDocument();
    expect(within(table).getByText('Failure')).toBeInTheDocument();
  });

  it('invokes onRowClick when a row is clicked', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <AuditLogResultsTable rows={sampleRows} isLoading={false} onRowClick={onRowClick} />,
    );

    const row = screen.getByTestId(`audit-log-row-${sampleRows[0].id}`);
    await user.click(row);

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(sampleRows[0]);
  });

  it('toggles client-side sort on Principal column', async () => {
    const user = userEvent.setup();
    render(
      <AuditLogResultsTable rows={sampleRows} isLoading={false} onRowClick={vi.fn()} />,
    );

    // Default order: server DESC by timestamp — first row is Awwal Lawal.
    const beforeRows = screen.getAllByRole('button', { name: /Audit event/ });
    expect(beforeRows[0]).toHaveAttribute(
      'data-testid',
      `audit-log-row-${sampleRows[0].id}`,
    );

    // Click the Principal header — switches to ascending alphabetic sort.
    await user.click(screen.getByTestId('sort-header-principal'));

    const afterRows = screen.getAllByRole('button', { name: /Audit event/ });
    // Acme Partner (consumer) sorts before Awwal Lawal alphabetically.
    expect(afterRows[0]).toHaveAttribute(
      'data-testid',
      `audit-log-row-${sampleRows[1].id}`,
    );
  });
});
