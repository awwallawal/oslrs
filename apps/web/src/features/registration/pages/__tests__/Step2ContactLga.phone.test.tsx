// @vitest-environment jsdom

/**
 * Story 13-57 AC1.2/AC1.3/AC1.4 — the phone field at the point of entry.
 *
 * Two things are pinned here, and they pull in opposite directions on purpose:
 *
 *   1. ACCEPT what Nigerians actually write. `0812…`, `+2348…`, `234 812…` and
 *      — the case that broke on 2026-08-04 — `+234 08120004038`, the country
 *      code AND the local trunk zero together, must all advance and all reduce
 *      to ONE E.164 value. Rejecting `+234 0812…` was the parser's mistake
 *      being charged to the citizen, which is the friction AC1.3 forbids.
 *
 *   2. STILL REFUSE what carries no derivable number at all — too few digits,
 *      letters. AC1.4 wants that said on this step, while the person is looking
 *      at the field, not after submit.
 *
 * ⚠️ This file is the PARITY CHECK for a knowing duplication: the canonical
 * normaliser is `apps/api/src/lib/normalise/phone.ts` and its own suite
 * (`phone.test.ts`, "AC1.2 — a trunk zero after the country code") asserts the
 * same input set. Keep the two lists in step; when Story 12-3 makes the API
 * module client-importable, delete this copy rather than growing it.
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step2ContactLga } from '../Step2ContactLga';
import { fetchPublicLgas, type WizardDraftData } from '../../api/wizard.api';

expect.extend(matchers);
afterEach(cleanup);

vi.mock('../../api/wizard.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/wizard.api')>();
  return { ...actual, fetchPublicLgas: vi.fn() };
});
const mockedLgas = vi.mocked(fetchPublicLgas);

const LGAS = [{ id: '018e5f2a-1234-7890-abcd-1234567890ab', name: 'Egbeda', code: 'egbeda' }];

/** Everything except the phone is already valid, so only the phone can block Continue. */
function renderWithPhone(phone: string) {
  const mergeFields = vi.fn();
  const onContinue = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Step2ContactLga
        formData={{ phone, email: 'Ade@Example.COM', lgaId: 'egbeda' } as WizardDraftData}
        mergeFields={mergeFields}
        onContinue={onContinue}
        onBack={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { mergeFields, onContinue };
}

describe('Step2ContactLga phone normalisation (Story 13-57 AC1)', () => {
  beforeEach(() => {
    mockedLgas.mockReset();
    mockedLgas.mockResolvedValue(LGAS);
  });

  // The six spellings of ONE number. `+234 07051286580` and `+234 08120004038`
  // are the two real inputs from the 2026-08-04 orphan submissions.
  const ACCEPTED: Array<[input: string, canonical: string]> = [
    ['07051286580', '+2347051286580'],
    ['+2347051286580', '+2347051286580'],
    ['2347051286580', '+2347051286580'],
    ['+234 07051286580', '+2347051286580'],
    ['234 070 5128 6580', '+2347051286580'],
    ['+234-0705-128-6580', '+2347051286580'],
    ['+234 08120004038', '+2348120004038'],
    ['08120004038', '+2348120004038'],
  ];

  it.each(ACCEPTED)('accepts %s and advances with %s', async (input, canonical) => {
    const user = userEvent.setup();
    const { mergeFields, onContinue } = renderWithPhone(input);

    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(mergeFields).toHaveBeenCalledWith(
      expect.objectContaining({ phone: canonical }),
    );
    expect(screen.queryByText(/Enter a Nigerian number/i)).not.toBeInTheDocument();
  });

  // AC1.4 — the refusal survives, and it is shown HERE. Both of these carry no
  // recoverable ten-digit number, so accepting them would only move the failure
  // to the database, which is the whole defect this story closes.
  const REFUSED = ['080123456', '0812abc4038'];

  it.each(REFUSED)('refuses %s at the point of entry rather than after submit', async (input) => {
    const user = userEvent.setup();
    const { onContinue } = renderWithPhone(input);

    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter a Nigerian number/i)).toBeInTheDocument();
  });
});
