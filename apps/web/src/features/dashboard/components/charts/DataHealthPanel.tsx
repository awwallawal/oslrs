/**
 * Data-Health panel — Story 12-6.
 *
 * The registry is not one clean number, and the dashboard used to hide that:
 * `getRegistrySummary().totalRespondents` counted the ~76 respondents whose
 * answers were on file and printed it under the words "Total Respondents",
 * making the other 63 invisible. 12-5 fixed the label. This renders the SHAPE
 * behind it — the total → with-answers funnel, the per-`data_status` split, how
 * completely each question was answered, and who is recoverable.
 *
 * ── Composed, not rebuilt ───────────────────────────────────────────────────
 * Every visual here is an existing primitive: the `BarChart layout="vertical"`
 * waterfall from `VerificationFunnelChart`, the shared `ChartCard` header (which
 * carries the per-chart `n` 12-5 introduced), and shadcn `Card`. No new chart
 * library, no new stat method — this is a counting/legibility surface.
 *
 * ── It does not count anything itself ───────────────────────────────────────
 * The funnel and the status split come from 12-4's `getRegistryTotals`; the
 * per-field rates and the recovery cohort come from `getDataHealth`. This file
 * derives no registry facts of its own — that is the whole point of the epic.
 */

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import type { DataHealthData, RegistryDataStatus, RegistryTotals } from '@oslsr/types';
import { Card, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { ChartCard } from './ChartCard';
import { ChartExportButton } from './ChartExportButton';

/**
 * Human labels for the 9-59 taxonomy.
 *
 * ⚠️ Typed as a TOTAL `Record<RegistryDataStatus, …>`, which makes this a
 * compile-time completeness guard rather than a lookup table: adding a status to
 * the shared union without giving it a label fails `tsc`. That is deliberate —
 * AC2.2 requires every status to render, and the failure mode being guarded
 * against is a new status appearing as a blank row or silently not at all.
 *
 * The key ORDER here is also the render order, so there is exactly one list.
 */
export const DATA_STATUS_LABELS: Record<RegistryDataStatus, string> = {
  completed: 'Answers on file',
  data_lost: 'Answers lost (recoverable)',
  pending_nin: 'Awaiting NIN',
  nin_unavailable: 'NIN unavailable',
  imported: 'Imported (unverified)',
  no_submission: 'No questionnaire yet',
};

export const STATUS_ORDER = Object.keys(DATA_STATUS_LABELS) as RegistryDataStatus[];

const FUNNEL_COLORS = ['#3b82f6', '#22c55e'];
const STATUS_COLOR = '#9C1E23';
/** Under-answered questions read hot; well-answered ones read calm. */
const RATE_COLORS = { low: '#ef4444', mid: '#f59e0b', high: '#22c55e' };

function rateColor(rate: number): string {
  if (rate < 25) return RATE_COLORS.low;
  if (rate < 75) return RATE_COLORS.mid;
  return RATE_COLORS.high;
}

export interface DataHealthPanelProps {
  totals?: RegistryTotals;
  dataHealth?: DataHealthData;
  isLoading: boolean;
  isError: boolean;
}

export function DataHealthPanel({
  totals,
  dataHealth,
  isLoading,
  isError,
}: DataHealthPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="data-health-loading">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-6 text-center text-red-600" data-testid="data-health-error">
        Failed to load data health.
      </Card>
    );
  }

  // ⚠️ NEVER `return null` here (12-6 review H2). This branch is reached whenever
  // either query resolved without data while neither flag is set — most
  // realistically when `/registry-totals` failed but `/data-health` succeeded,
  // since the page previously passed only the data-health error through. A bare
  // `null` renders a completely blank tab: no skeleton, no error, nothing to
  // retry, and nothing that says a number is missing rather than zero. On a
  // completeness view that is the worst possible failure mode — it looks like an
  // answer.
  if (!totals || !dataHealth) {
    return (
      <Card className="p-6 text-center text-neutral-600" data-testid="data-health-unavailable">
        Data health is unavailable right now. Reload the page to try again.
      </Card>
    );
  }

  const funnelData = [
    { name: 'Registered people', value: totals.totalRespondents },
    { name: 'Answers on file', value: totals.withAnswers },
  ];

  const statusData = STATUS_ORDER.map((status) => ({
    status,
    name: DATA_STATUS_LABELS[status],
    // Zero-count statuses still render: 12-4 zero-fills the map so the shape is
    // stable, and "none in this state" is information a completeness view owes
    // the reader. A status that vanishes when empty reads as a status that does
    // not exist.
    value: totals.byDataStatus[status] ?? 0,
  }));

  const dataLost = totals.byDataStatus.data_lost ?? 0;
  const { recoveryCohort } = dataHealth;

  return (
    <div className="space-y-6" data-testid="data-health-panel">
      {/* ── Funnel: registered people → answers on file ───────────────────── */}
      <ChartCard
        title="Registry funnel"
        n={totals.totalRespondents}
        data-testid="data-health-funnel"
        actions={<ChartExportButton data={funnelData} filename="registry-funnel" />}
        bodyClassName="h-48"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={funnelData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={150} />
            <Tooltip formatter={(value: number | undefined) => (value ?? 0).toLocaleString()} />
            <Bar dataKey="value">
              {funnelData.map((_, index) => (
                <Cell key={index} fill={FUNNEL_COLORS[index]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/*
        The drafts line is a FUNNEL metric and is deliberately printed apart
        from the total rather than added to it: 12-4 returns `inProgressDrafts`
        GLOBALLY even when the rest of the object is filtered, so folding it in
        would sum two different populations.
      */}
      {totals.inProgressDrafts > 0 && (
        <p className="text-xs text-neutral-500 -mt-4" data-testid="data-health-drafts">
          + {totals.inProgressDrafts.toLocaleString()} in progress (drafts, all LGAs — not
          included in the total above)
        </p>
      )}

      {/* ── Per-data_status breakdown ─────────────────────────────────────── */}
      <ChartCard
        title="Registry by data status"
        n={totals.totalRespondents}
        data-testid="data-health-status-breakdown"
        actions={<ChartExportButton data={statusData} filename="registry-data-status" />}
        bodyClassName="h-72"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={statusData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={180} />
            <Tooltip formatter={(value: number | undefined) => (value ?? 0).toLocaleString()} />
            <Bar dataKey="value" fill={STATUS_COLOR} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Recovery cohort ───────────────────────────────────────────────── */}
      <Card data-testid="data-health-recovery">
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Recoverable respondents</p>
              <p className="text-2xl font-bold text-gray-800" data-testid="data-health-recovery-count">
                {dataLost.toLocaleString()}
              </p>
            </div>
            <p className="text-xs text-neutral-500 max-w-md">
              {/*
                Wording matters here. These people are on the register; only
                their questionnaire answers are gone. "Lost" invites a reader to
                write them off — the re-engagement campaign exists precisely
                because they are reachable.
              */}
              Registered, but their questionnaire answers are not on file. They are targets
              for the re-engagement campaign, not losses.
            </p>
          </div>

          {recoveryCohort.total > 0 && recoveryCohort.rows.length === 0 && (
            /*
              12-6 review L2. The drill narrows in SQL and then lets
              `deriveDataStatus` decide, so a bounded page can come back EMPTY
              while the cohort is non-empty — either past the end of the offset,
              or because the atom rejected every row this page held. Rendering
              nothing there leaves a bare count with no table and no reason,
              which reads as a broken table rather than an empty page.
            */
            <p className="text-xs text-neutral-400 mt-3" data-testid="data-health-recovery-empty-page">
              No rows on this page (showing from {recoveryCohort.offset.toLocaleString()} of{' '}
              {recoveryCohort.total.toLocaleString()}).
            </p>
          )}

          {recoveryCohort.rows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm" data-testid="data-health-recovery-table">
                <thead>
                  <tr className="text-left text-xs text-neutral-500 border-b">
                    <th className="py-2 pr-4 font-medium">Reference</th>
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">LGA</th>
                    <th className="py-2 pr-4 font-medium">Registered</th>
                    <th className="py-2 font-medium">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {recoveryCohort.rows.map((row) => (
                    <tr key={row.respondentId} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{row.referenceCode ?? '—'}</td>
                      <td className="py-2 pr-4">{row.fullName ?? '—'}</td>
                      <td className="py-2 pr-4">{row.lgaName ?? row.lgaId ?? '—'}</td>
                      <td className="py-2 pr-4">
                        {row.registeredAt ? row.registeredAt.slice(0, 10) : '—'}
                      </td>
                      <td className="py-2">{row.phoneNumber ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/*
                The page bound is stated rather than hidden. A drill showing 50
                of 55 with no caption reads as "55 is 50", which is the same
                class of error as the mislabelled total this epic exists to end.
              */}
              <p className="text-xs text-neutral-400 mt-2" data-testid="data-health-recovery-bound">
                Showing {recoveryCohort.rows.length.toLocaleString()} of{' '}
                {recoveryCohort.total.toLocaleString()}
                {recoveryCohort.total > recoveryCohort.rows.length + recoveryCohort.offset
                  ? ' — export the registry for the full cohort'
                  : ''}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Per-field response rates ──────────────────────────────────────── */}
      <ChartCard
        title="Response rate by question"
        // The per-field denominator is the answers-present cohort — a
        // `data_lost` respondent cannot answer a question, so including them
        // would deflate every field uniformly and mislead.
        n={dataHealth.withAnswers}
        subtitle={
          dataHealth.formTitle
            ? `questions from "${dataHealth.formTitle}"`
            : 'no published form — no question axis available'
        }
        data-testid="data-health-field-rates"
        actions={<ChartExportButton data={dataHealth.fields} filename="field-response-rates" />}
        bodyStyle={{ height: `${Math.max(240, dataHealth.fields.length * 26)}px` }}
        bodyClassName=""
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dataHealth.fields} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} unit="%" />
            <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number | undefined, _name, entry) => [
                `${value ?? 0}% (${(entry?.payload?.answeredCount ?? 0).toLocaleString()} of ${dataHealth.withAnswers.toLocaleString()})`,
                'Answered',
              ]}
            />
            <Bar dataKey="responseRate">
              {dataHealth.fields.map((field) => (
                <Cell key={field.key} fill={rateColor(field.responseRate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
