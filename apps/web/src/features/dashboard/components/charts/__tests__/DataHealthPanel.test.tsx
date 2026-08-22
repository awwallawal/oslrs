// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { RegistryDataStatus, RegistryTotals } from '@oslsr/types';

expect.extend(matchers);
afterEach(() => cleanup());

/**
 * recharts is mocked to bare elements, so the CHART's own rendering is not what
 * these assert. What they assert is the DATA the panel hands recharts — which is
 * where AC2.2's "every status renders, zero-count included" actually lives.
 * `Bar` echoes its series into the DOM so the series can be inspected without
 * depending on SVG layout in jsdom.
 */
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children, data }: any) => (
    <div data-testid="barchart" data-series={JSON.stringify(data)}>{children}</div>
  ),
  Bar: ({ children }: any) => <div>{children}</div>,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
}));

vi.mock('../../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

const { DataHealthPanel, DATA_STATUS_LABELS, STATUS_ORDER } = await import('../DataHealthPanel');

/** 12-4 zero-fills every status, so `nin_unavailable` and `imported` are 0 here. */
const TOTALS: RegistryTotals = {
  totalRespondents: 139,
  withAnswers: 76,
  byDataStatus: {
    completed: 76,
    data_lost: 55,
    pending_nin: 1,
    nin_unavailable: 0,
    imported: 0,
    no_submission: 7,
  },
  bySource: { enumerator: 100, public: 39 },
  byCompleteness: { full: 40, core: 36, partial: 63 },
  byVerification: { nin_on_file: 80, self_declared: 58, pending_nin: 1, unverified_import: 0 },
  identityAmbiguous: 0,
  inProgressDrafts: 12,
};

const DATA_HEALTH = {
  withAnswers: 76,
  formId: 'form-1',
  formTitle: 'OSLSR Master v3',
  fields: [
    { key: 'monthly_income', label: 'Monthly income', answeredCount: 0, responseRate: 0 },
    { key: 'gender', label: 'Gender', answeredCount: 76, responseRate: 100 },
  ],
  recoveryCohort: { total: 55, limit: 50, offset: 0, rows: [] },
};

function seriesOf(index: number): Array<Record<string, unknown>> {
  const charts = screen.getAllByTestId('barchart');
  return JSON.parse(charts[index].getAttribute('data-series') ?? '[]');
}

describe('DataHealthPanel (Story 12-6)', () => {
  it('labels every status in the taxonomy — a missing label is a tsc error, not a blank row', () => {
    // The Record<RegistryDataStatus, string> type already enforces this at
    // compile time; this asserts it at runtime too, because the failure mode
    // (a status rendering as a blank bar) is silent in a chart.
    for (const status of STATUS_ORDER) {
      expect(DATA_STATUS_LABELS[status]).toBeTruthy();
    }
    // The order IS the label map's key order — one list, not two.
    expect(STATUS_ORDER).toEqual(Object.keys(DATA_STATUS_LABELS) as RegistryDataStatus[]);
  });

  it('AC2.2 — renders ZERO-count statuses instead of dropping them', () => {
    render(<DataHealthPanel totals={TOTALS} dataHealth={DATA_HEALTH as never} isLoading={false} isError={false} />);

    // Chart 0 is the funnel, chart 1 the status breakdown.
    const statuses = seriesOf(1);

    expect(statuses).toHaveLength(STATUS_ORDER.length);
    // A status that vanishes when empty reads to a Ministry as a status that
    // does not exist — the opposite of what a completeness view is for.
    const ninUnavailable = statuses.find((s) => s.status === 'nin_unavailable');
    expect(ninUnavailable).toBeDefined();
    expect(ninUnavailable!.value).toBe(0);
    expect(statuses.find((s) => s.status === 'imported')!.value).toBe(0);
    expect(statuses.find((s) => s.status === 'data_lost')!.value).toBe(55);
  });

  it('renders the funnel as registered people → answers on file, from 12-4 only', () => {
    render(<DataHealthPanel totals={TOTALS} dataHealth={DATA_HEALTH as never} isLoading={false} isError={false} />);

    expect(seriesOf(0)).toEqual([
      { name: 'Registered people', value: 139 },
      { name: 'Answers on file', value: 76 },
    ]);
  });

  it('keeps in-progress drafts OUT of the total and says so', () => {
    render(<DataHealthPanel totals={TOTALS} dataHealth={DATA_HEALTH as never} isLoading={false} isError={false} />);

    // 12-4 returns inProgressDrafts GLOBALLY even when the rest is filtered, so
    // folding it into the total would sum two different populations.
    const drafts = screen.getByTestId('data-health-drafts');
    expect(drafts).toHaveTextContent('12');
    expect(drafts).toHaveTextContent('not');
    expect(seriesOf(0).some((d) => d.value === 151)).toBe(false);
  });

  it('states the recoverable count as the COHORT size, never the drill page size', () => {
    render(<DataHealthPanel totals={TOTALS} dataHealth={DATA_HEALTH as never} isLoading={false} isError={false} />);

    // rows is empty here; the headline must still read 55.
    expect(screen.getByTestId('data-health-recovery-count')).toHaveTextContent('55');
    expect(screen.queryByTestId('data-health-recovery-table')).not.toBeInTheDocument();
  });

  it('describes the cohort as recoverable rather than lost', () => {
    render(<DataHealthPanel totals={TOTALS} dataHealth={DATA_HEALTH as never} isLoading={false} isError={false} />);
    // These people are reachable — the re-engagement campaign depends on the
    // reader not writing them off.
    expect(screen.getByTestId('data-health-recovery')).toHaveTextContent(/not losses/i);
  });

  it('orders the field chart most-under-answered first and names its denominator', () => {
    render(<DataHealthPanel totals={TOTALS} dataHealth={DATA_HEALTH as never} isLoading={false} isError={false} />);

    const fields = seriesOf(2);
    expect(fields[0].key).toBe('monthly_income');
    // The per-field denominator is the answers-present cohort (76), not the
    // registry total (139) — a data_lost respondent cannot answer a question.
    expect(screen.getByTestId('data-health-field-rates')).toHaveTextContent('N = 76');
  });

  it('says so plainly when there is no published form to build a question axis from', () => {
    render(
      <DataHealthPanel
        totals={TOTALS}
        dataHealth={{ ...DATA_HEALTH, formId: null, formTitle: null, fields: [] } as never}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByTestId('data-health-field-rates')).toHaveTextContent(/no published form/i);
  });

  it('says data is unavailable rather than rendering nothing at all (review H2)', () => {
    // ⚠️ This branch is reachable in production: `/data-health` succeeds while
    // `/registry-totals` fails. It used to `return null` — a completely blank
    // tab with no skeleton, no error and nothing to retry. On a view whose whole
    // job is showing what the registry does and does not hold, blank space reads
    // as an answer rather than as a missing one.
    render(
      <DataHealthPanel
        totals={undefined}
        dataHealth={DATA_HEALTH}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByTestId('data-health-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('data-health-panel')).not.toBeInTheDocument();
  });

  it('explains an empty drill page instead of showing a bare count (review L2)', () => {
    // The drill narrows in SQL and then lets `deriveDataStatus` decide, so a
    // bounded page can come back empty while the cohort is not — past the end of
    // the offset, or because the atom rejected every row on the page. Rendering
    // only the count there looks like a table that failed to load.
    render(
      <DataHealthPanel
        totals={TOTALS}
        dataHealth={{
          ...DATA_HEALTH,
          recoveryCohort: { total: 55, rows: [], limit: 50, offset: 50 },
        }}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByTestId('data-health-recovery-count')).toHaveTextContent('55');
    expect(screen.getByTestId('data-health-recovery-empty-page')).toHaveTextContent('55');
    expect(screen.queryByTestId('data-health-recovery-table')).not.toBeInTheDocument();
  });

  it('shows skeletons while loading and the error card on failure', () => {
    const { unmount } = render(
      <DataHealthPanel totals={undefined} dataHealth={undefined} isLoading isError={false} />,
    );
    expect(screen.getByTestId('data-health-loading')).toBeInTheDocument();
    unmount();

    render(<DataHealthPanel totals={undefined} dataHealth={undefined} isLoading={false} isError />);
    expect(screen.getByTestId('data-health-error')).toBeInTheDocument();
  });
});
