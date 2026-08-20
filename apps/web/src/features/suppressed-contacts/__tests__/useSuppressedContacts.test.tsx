/**
 * Story 13-51 (code-review H1) — DOES THE SUPPRESSION LIST ACTUALLY FETCH?
 *
 * ⛔ THE HOLE THIS FILLS. Every other test in this feature renders `SuppressedContactsTable` with
 * `rows` handed in as a prop, so the entire suite was green while the page fetched NOTHING. The
 * hook paired `initialData: []` with `staleTime: 30_000`; TanStack writes `initialData` into the
 * cache stamped `dataUpdatedAt = now`, so the query was never stale on mount and `refetchOnMount`
 * skipped the request. It also forces `status: 'success'`, so `isLoading` was false and the page
 * went straight to the empty state — **"No suppressed addresses. Nobody is being silently
 * dropped."** The screen built to end [[pattern-ship-a-fix-that-never-fires]] was an instance of it.
 *
 * ⚠️ ASSERT THE FETCH AND THE DATA, never "the hook rendered". Swap `placeholderData` back to
 * `initialData` and the first assertion reds — that is the only thing separating this file from
 * one more test that passes over the hole.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const listSuppressedContacts = vi.fn();

vi.mock('../api/suppressed-contacts.api', () => ({
  listSuppressedContacts: () => listSuppressedContacts(),
  correctContactEmail: vi.fn(),
  ContactAddressClashError: class extends Error {},
}));

const { useSuppressedContacts } = await import('../hooks/useSuppressedContacts');

const ROW = {
  email: 'asirusakirat@gmail.come',
  reason: 'bounced',
  severity: null,
  bounceCount: 1,
  suppressedAt: '2026-08-06T00:00:00.000Z',
  bucket: 'capture_typo' as const,
  suggestedCorrection: 'asirusakirat@gmail.com',
  respondentId: 'r1',
  referenceCode: 'OSL-2026-DQNPTQ',
  name: 'Sakirat Asiru',
  phoneNumber: '+2348000000000',
  status: 'pending_nin_capture',
  midLadder: true,
  healthyTwin: null,
  emailState: 'holding' as const,
  retryEligibleAt: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useSuppressedContacts (13-51 H1)', () => {
  beforeEach(() => {
    listSuppressedContacts.mockReset();
    listSuppressedContacts.mockResolvedValue([ROW]);
  });

  it('RED-VERIFY (H1): CALLS the API on mount — an empty list must be measured, never assumed', async () => {
    renderHook(() => useSuppressedContacts(), { wrapper });
    await waitFor(() => expect(listSuppressedContacts).toHaveBeenCalledTimes(1));
  });

  it('RED-VERIFY (H1): resolves to the REAL rows, not to the empty default', async () => {
    // Asserting the fetch alone is not enough — the data has to arrive at the consumer, because
    // the visible failure was a page confidently reporting nobody had been silenced.
    const { result } = renderHook(() => useSuppressedContacts(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0]?.referenceCode).toBe('OSL-2026-DQNPTQ');
  });

  it('still hands the consumer an array before the request resolves', async () => {
    // The repo's standing race-condition rule: Query data defaults to [], never undefined.
    const { result } = renderHook(() => useSuppressedContacts(), { wrapper });
    expect(Array.isArray(result.current.data)).toBe(true);
    await waitFor(() => expect(listSuppressedContacts).toHaveBeenCalled());
  });
});
