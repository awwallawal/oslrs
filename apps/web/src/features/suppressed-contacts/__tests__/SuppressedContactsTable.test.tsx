// @vitest-environment jsdom

/**
 * Story 13-51 (AC1) — the table renders the three buckets and never re-derives them.
 *
 * ⚠️ Run these from `apps/web` (`cd apps/web && pnpm vitest run`) — NEVER `pnpm vitest run` from
 * the repo root, which picks up the wrong config.
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);

import { SuppressedContactsTable } from '../components/SuppressedContactsTable';
import type { SuppressedContactRow } from '../api/suppressed-contacts.api';

function row(over: Partial<SuppressedContactRow> = {}): SuppressedContactRow {
  return {
    email: 'someone@example.test',
    reason: 'bounced',
    severity: 'hard',
    bounceCount: 1,
    suppressedAt: '2026-08-01T00:00:00.000Z',
    bucket: 'plausibly_dead',
    suggestedCorrection: null,
    respondentId: 'r-1',
    referenceCode: 'OSL-2026-TEST01',
    name: 'Test Person',
    phoneNumber: '+2348130000000',
    status: 'active',
    midLadder: false,
    healthyTwin: null,
    emailState: 'given_up' as const,
    retryEligibleAt: null,
    ...over,
  };
}

describe('SuppressedContactsTable (13-51 AC1)', () => {
  it('shows the phone number — for anyone unreachable by email it is the actual next step', () => {
    render(<SuppressedContactsTable rows={[row()]} onCorrect={vi.fn()} />);
    expect(screen.getByText('+2348130000000')).toBeInTheDocument();
  });

  it('flags the MID-LADDER case, which is the urgent one', () => {
    // The system is actively "reminding" this person into a void and will retire them as though
    // they had declined.
    render(<SuppressedContactsTable rows={[row({ midLadder: true, status: 'pending_nin_capture' })]} onCorrect={vi.fn()} />);
    expect(screen.getByText('MID-LADDER')).toBeInTheDocument();
  });

  it('AC1.7: shows the healthy twin so nobody "corrects" a reachable person', () => {
    render(<SuppressedContactsTable rows={[row({ healthyTwin: 'other@example.test' })]} onCorrect={vi.fn()} />);
    expect(screen.getByText('other@example.test')).toBeInTheDocument();
  });

  it('offers Correct… ONLY for the capture_typo bucket', () => {
    // ⚠️ The other two buckets must not offer it: a provider artefact was never typed by anyone,
    // and a plausibly-dead address was never wrong.
    const { rerender } = render(
      <SuppressedContactsTable rows={[row({ bucket: 'capture_typo', suggestedCorrection: 'a@gmail.com' })]} onCorrect={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /correct/i })).toBeInTheDocument();

    rerender(<SuppressedContactsTable rows={[row({ bucket: 'provider_artefact' })]} onCorrect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /correct/i })).not.toBeInTheDocument();

    rerender(<SuppressedContactsTable rows={[row({ bucket: 'plausibly_dead' })]} onCorrect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /correct/i })).not.toBeInTheDocument();
  });

  it('labels the three buckets distinctly — they must not be blurred', () => {
    render(
      <SuppressedContactsTable
        rows={[
          row({ email: 'a@x.test', bucket: 'capture_typo' }),
          row({ email: 'b@x.test', bucket: 'provider_artefact' }),
          row({ email: 'c@x.test', bucket: 'plausibly_dead' }),
        ]}
        onCorrect={vi.fn()}
      />,
    );
    expect(screen.getByText('Our typo')).toBeInTheDocument();
    expect(screen.getByText('Provider format')).toBeInTheDocument();
    expect(screen.getByText('Their mailbox')).toBeInTheDocument();
  });

  it('says plainly when email has given up, so the operator moves to phone', () => {
    render(<SuppressedContactsTable rows={[row({ emailState: 'given_up' })]} onCorrect={vi.fn()} />);
    expect(screen.getByText(/given up — use phone/)).toBeInTheDocument();
  });

  it('RED-VERIFY (M1): an OPTED-OUT person is never presented as somebody to phone', () => {
    // ⛔ The defect this replaces: `emailGivenUp` was true for every unsubscribe and complaint, so
    // this cell read "given up — use phone" for the one group who had explicitly asked us to stop.
    // Render an unsubscribed row through the old boolean and it invited exactly the contact the
    // person had refused.
    render(<SuppressedContactsTable rows={[row({ emailState: 'opted_out', reason: 'unsubscribed' })]} onCorrect={vi.fn()} />);
    expect(screen.getByText(/opted out — do not contact/)).toBeInTheDocument();
    expect(screen.queryByText(/use phone/)).not.toBeInTheDocument();
  });

  it('a HOLDING row says it is still waiting, not that email has failed', () => {
    render(<SuppressedContactsTable rows={[row({ emailState: 'holding' })]} onCorrect={vi.fn()} />);
    expect(screen.getByText(/holding/)).toBeInTheDocument();
    expect(screen.queryByText(/given up/)).not.toBeInTheDocument();
  });

  it('says "severity never measured" rather than inventing one for the pre-13-51 rows', () => {
    // Severity is UNRECOVERABLE for rows written before 13-51 — the payload was discarded. The UI
    // must not present a guess as a measurement.
    render(<SuppressedContactsTable rows={[row({ severity: null })]} onCorrect={vi.fn()} />);
    expect(screen.getByText(/severity never measured/)).toBeInTheDocument();
  });

  it('renders an empty state rather than an empty table', () => {
    render(<SuppressedContactsTable rows={[]} onCorrect={vi.fn()} />);
    expect(screen.getByText(/Nobody is being silently dropped/)).toBeInTheDocument();
  });
});
