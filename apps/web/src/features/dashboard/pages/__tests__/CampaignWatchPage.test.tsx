// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { CampaignWatchSnapshot } from '@oslsr/types';

expect.extend(matchers);
afterEach(() => cleanup());

const mockWatch = vi.hoisted(() => ({
  data: null as CampaignWatchSnapshot | null,
  isLoading: false,
  error: null as Error | null,
}));

vi.mock('../../api/campaign-watch.api', () => ({
  useCampaignWatch: () => mockWatch,
}));

import CampaignWatchPage from '../CampaignWatchPage';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderPage = () =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CampaignWatchPage /></MemoryRouter>
    </QueryClientProvider>,
  );

const snapshot: CampaignWatchSnapshot = {
  baseline: 328,
  baselineAtAuthoring: 328,
  baselineDrifted: false,
  campaignStart: '2026-08-24T00:00:00+01:00',
  totalNow: 364,
  sinceCampaignStart: 36,
  attributedCount: 28,
  unattributedCount: 8,
  attributionCoveragePct: 77.8,
  byChannel: [
    { channel: 'Radio', count: 15 },
    { channel: 'Association / cooperative', count: 8 },
    { channel: null, count: 8 },
  ],
  byDay: [{ day: '2026-08-26', registrations: 19, attributed: 14, radio: 7 }],
  radioByLga: [{ lgaId: 'ibadan_north', count: 6 }],
  generatedAt: '2026-08-27T12:00:00.000Z',
};

describe('CampaignWatchPage', () => {
  it('renders the lift against the baseline', () => {
    mockWatch.data = snapshot; mockWatch.isLoading = false; mockWatch.error = null;
    renderPage();
    expect(screen.getByText('328')).toBeInTheDocument();   // baseline
    expect(screen.getByText('364')).toBeInTheDocument();   // now
    expect(screen.getByText('+36')).toBeInTheDocument();   // lift = 364 - 328
    expect(screen.getByText(/11% above baseline/)).toBeInTheDocument();
    // "15" legitimately appears twice — the Radio stat card AND its channel-table row.
    // Assert BOTH exist rather than asserting uniqueness, which is not the property.
    expect(screen.getAllByText('15').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/a floor — see the note above/)).toBeInTheDocument();
  });

  /*
   * ⭐ THE POINT OF THIS PAGE. Radio is a FLOOR, not an estimate — an unattributed row
   * is not a non-radio row. The caveat must render ABOVE the numbers and must name the
   * unattributed count, because a reader who takes only the headline should take the
   * uncertainty with it. This is the inverse of the public /insights rule: there a
   * caveat is a screenshot risk, so that page publishes only figures needing none.
   */
  it('⭐ leads with the attribution caveat and names the unattributed rows', () => {
    mockWatch.data = snapshot; mockWatch.isLoading = false; mockWatch.error = null;
    renderPage();
    const caveat = screen.getByTestId('attribution-caveat');
    expect(caveat).toBeInTheDocument();
    expect(caveat.textContent).toMatch(/77\.8% of registrations named a channel/);
    expect(caveat.textContent).toMatch(/28 of 36/);
    expect(caveat.textContent).toMatch(/floor, not an estimate/i);
    // It must say the unattributed are NOT counted as non-radio.
    expect(caveat.textContent).toMatch(/not.*counted as/i);
  });

  it('hides the caveat only when coverage is complete', () => {
    mockWatch.data = { ...snapshot, attributionCoveragePct: 100, unattributedCount: 0, attributedCount: 36 };
    renderPage();
    expect(screen.queryByTestId('attribution-caveat')).not.toBeInTheDocument();
  });

  it('shows unattributed as its OWN channel row — never dropped from the table', () => {
    mockWatch.data = snapshot;
    renderPage();
    const rows = screen.getByTestId('channel-rows');
    expect(within(rows).getByText('Did not answer')).toBeInTheDocument();
    expect(rows.textContent).toMatch(/Radio/);
  });

  it('⭐ raises a drift alarm when the baseline no longer matches', () => {
    // The register's history changing under a fixed control is the thing that silently
    // invalidates every comparison on the page, so it gets its own loud banner.
    mockWatch.data = { ...snapshot, baseline: 340, baselineDrifted: true };
    renderPage();
    const drift = screen.getByTestId('baseline-drift');
    expect(drift.textContent).toMatch(/Baseline moved/);
    expect(drift.textContent).toMatch(/340/);
    expect(drift.textContent).toMatch(/328/);
  });

  it('does not raise a drift alarm when the baseline holds', () => {
    mockWatch.data = snapshot;
    renderPage();
    expect(screen.queryByTestId('baseline-drift')).not.toBeInTheDocument();
  });

  it('renders the error state without throwing', () => {
    mockWatch.data = null; mockWatch.isLoading = false; mockWatch.error = new Error('boom');
    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText(/unable to load campaign watch/i)).toBeInTheDocument();
  });
});
