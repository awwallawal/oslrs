// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter } from '../../../../test-utils';
import { StaffDetailModal } from '../StaffDetailModal';

expect.extend(matchers);

const mockGetStaffDetail = vi.fn();
vi.mock('../../api/staff.api', () => ({
  getStaffDetail: (...args: unknown[]) => mockGetStaffDetail(...args),
}));

const base = {
  id: 'u1',
  fullName: 'Badmus Aliyat Tolani',
  email: 'a@example.test',
  phone: '+2348000000001',
  status: 'active',
  roleName: 'enumerator',
  lgaName: 'Oluyole',
  nin: '12345678901',
  dateOfBirth: '1990-01-01',
  homeAddress: '12 Test Street',
  bankName: 'United Bank for Africa (UBA) Plc',
  accountNumber: '2388826445',
  accountName: 'Badmus Alia Tolani',
  nextOfKinName: 'Kin',
  nextOfKinPhone: '+2348000000002',
  liveSelfieOriginalUrl: null,
  invitedAt: '2026-09-06T08:18:00.000Z',
  lastLoginAt: '2026-09-16T06:24:00.000Z',
  createdAt: '2026-09-06T08:18:00.000Z',
  capturedCount: 2,
  accountNameMatchesFullName: false,
};

beforeEach(() => vi.clearAllMocks());

describe('StaffDetailModal', () => {
  it('shows the onboarding fields the payment flow needs', async () => {
    mockGetStaffDetail.mockResolvedValue({ data: base });
    renderWithRouter(<StaffDetailModal userId="u1" onClose={vi.fn()} />);

    expect(await screen.findByText('United Bank for Africa (UBA) Plc')).toBeInTheDocument();
    expect(screen.getByText('12345678901')).toBeInTheDocument();
    expect(screen.getByText('12 Test Street')).toBeInTheDocument();
  });

  /**
   * ⛔ The load-bearing assertion. Four of eleven activated enumerators on
   * production have an account name that differs from their full name; a bank
   * rejects on mismatch. The operator must see it BEFORE building a batch.
   */
  it('warns when the account name does not match the full name', async () => {
    mockGetStaffDetail.mockResolvedValue({ data: base });
    renderWithRouter(<StaffDetailModal userId="u1" onClose={vi.fn()} />);

    expect(
      await screen.findByText(/Account name does not match the full name/i),
    ).toBeInTheDocument();
  });

  it('does NOT warn when the name merely differs in ORDER', async () => {
    // Reordering is how Nigerian banks routinely hold names. Flagging it would
    // train the operator to ignore the warning, which costs more than the real
    // mismatches it catches.
    mockGetStaffDetail.mockResolvedValue({
      data: { ...base, accountNameMatchesFullName: true },
    });
    renderWithRouter(<StaffDetailModal userId="u1" onClose={vi.fn()} />);

    await screen.findByText('United Bank for Africa (UBA) Plc');
    expect(screen.queryByText(/does not match/i)).not.toBeInTheDocument();
  });

  it('does NOT warn when there is simply no account name yet', async () => {
    mockGetStaffDetail.mockResolvedValue({
      data: { ...base, accountName: null, accountNameMatchesFullName: null },
    });
    renderWithRouter(<StaffDetailModal userId="u1" onClose={vi.fn()} />);

    await screen.findByText('United Bank for Africa (UBA) Plc');
    expect(screen.queryByText(/does not match/i)).not.toBeInTheDocument();
  });

  it('masks the account number until it is explicitly revealed', async () => {
    mockGetStaffDetail.mockResolvedValue({ data: base });
    renderWithRouter(<StaffDetailModal userId="u1" onClose={vi.fn()} />);

    expect(await screen.findByText('••••••6445')).toBeInTheDocument();
    expect(screen.queryByText('2388826445')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Reveal account number'));
    await waitFor(() => expect(screen.getByText('2388826445')).toBeInTheDocument());
  });

  it('names a never-logged-in account rather than leaving it blank', async () => {
    // §0.1a: an activated account that never logged in reads as apathy unless
    // it is said out loud. It usually means the person cannot work out their
    // own login address.
    mockGetStaffDetail.mockResolvedValue({ data: { ...base, lastLoginAt: null } });
    renderWithRouter(<StaffDetailModal userId="u1" onClose={vi.fn()} />);

    expect(await screen.findByText('Never logged in')).toBeInTheDocument();
  });

  it('fetches nothing when no user is selected', () => {
    renderWithRouter(<StaffDetailModal userId={null} onClose={vi.fn()} />);
    expect(mockGetStaffDetail).not.toHaveBeenCalled();
  });
});
