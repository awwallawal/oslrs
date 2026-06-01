/**
 * OperationsDashboardPage — Super Admin Operations Dashboard (Story 9-19 Part B).
 *
 * Route: `/dashboard/super-admin/operations`
 *
 * Renders the same data as the `pnpm dashboard` CLI in 5 cards (System health,
 * Adoption + funnel, Email deliverability, Email queue, Recommendations) with
 * 30s auto-refresh + a manual refresh button. Status dots are computed from the
 * SHARED `OPS_THRESHOLDS` (AC#B1/#B5) so the colour decision matches the CLI
 * exactly. Sections that come back null render a "section unavailable"
 * placeholder mirroring the CLI's graceful degradation (AC#B6).
 */
import { RefreshCw } from 'lucide-react';
import {
  OPS_THRESHOLDS as T,
  opsStatusLevel,
  RESEND_FREE_TIER_DAILY,
  type OpsStatusLevel,
  type OpsSystemHealth,
  type OpsTrafficSnapshot,
  type OpsResendStatus,
  type OpsQueueHealth,
  type OpsRecommendation,
} from '@oslsr/types';
import { Skeleton } from '../../../components/ui/skeleton';
import { useOperationsDashboard } from '../api/operations.api';

const DOT_CLASS: Record<OpsStatusLevel, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

/** Highest-severity wins. */
function worstLevel(...levels: OpsStatusLevel[]): OpsStatusLevel {
  if (levels.includes('red')) return 'red';
  if (levels.includes('yellow')) return 'yellow';
  return 'green';
}

function StatusDot({ level, testId }: { level: OpsStatusLevel; testId?: string }) {
  return (
    <span
      data-testid={testId}
      data-level={level}
      className={`inline-block h-3 w-3 rounded-full ${DOT_CLASS[level]}`}
      aria-label={`status: ${level}`}
    />
  );
}

function Card({
  title,
  dot,
  testId,
  children,
}: {
  title: string;
  dot?: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
    >
      <header className="mb-3 flex items-center gap-2">
        {dot}
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function SectionUnavailable({ testId }: { testId: string }) {
  return (
    <p data-testid={testId} className="text-sm italic text-gray-400">
      section unavailable
    </p>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function SystemCard({ sys }: { sys: OpsSystemHealth | null }) {
  const dot = sys
    ? worstLevel(
        opsStatusLevel(sys.ramUsedPct, T.ramUsedPctYellow, T.ramUsedPctRed),
        opsStatusLevel(sys.diskUsedPct, T.diskUsedPctYellow, T.diskUsedPctRed),
        opsStatusLevel(sys.loadAvg1m, T.cpuLoad1mYellow, T.cpuLoad1mRed),
      )
    : 'green';
  return (
    <Card title="System health" testId="ops-card-system" dot={<StatusDot level={dot} testId="ops-system-dot" />}>
      {sys ? (
        <div>
          <Row label="API process" value={`online · uptime ${sys.pm2Uptime}`} />
          <Row label="Restarts / mem / cpu" value={`${sys.pm2RestartCount} · ${sys.pm2Memory} · ${sys.pm2CpuPct}%`} />
          <Row label="CPU load (1m / 5m / 15m)" value={`${sys.loadAvg1m.toFixed(2)} / ${sys.loadAvg5m.toFixed(2)} / ${sys.loadAvg15m.toFixed(2)}`} />
          <Row label="RAM" value={`${sys.ramUsedMb}/${sys.ramTotalMb} MB (${sys.ramUsedPct}%)`} />
          <Row label="Disk" value={`${sys.diskUsedGb}/${sys.diskTotalGb} GB (${sys.diskUsedPct}%)`} />
          <Row label="OS uptime" value={sys.osUptime} />
        </div>
      ) : (
        <SectionUnavailable testId="ops-system-unavailable" />
      )}
    </Card>
  );
}

function AdoptionCard({ traffic }: { traffic: OpsTrafficSnapshot | null }) {
  const dot = traffic
    ? opsStatusLevel(traffic.step4StallPct, T.step4StallPctYellow, T.step4StallPctRed)
    : 'green';
  const completePct =
    traffic && traffic.totalDrafts > 0
      ? Math.round((traffic.totalRespondents / traffic.totalDrafts) * 100)
      : 0;
  return (
    <Card title="Adoption + funnel" testId="ops-card-adoption" dot={<StatusDot level={dot} testId="ops-adoption-dot" />}>
      {traffic ? (
        <div>
          <Row label="Total drafts (last 24h)" value={`${traffic.totalDrafts} (${traffic.draftsLast24h})`} />
          <Row
            label="Completed registrations"
            value={`${traffic.totalRespondents} (active ${traffic.respondentsActive}, pending-NIN ${traffic.respondentsPending})`}
          />
          <Row label="Completion rate" value={`${completePct}%`} />
          <Row label="Step-4 stall" value={`${traffic.step4StallPct}% of live drafts`} />
          <Row label="Magic-links" value={`${traffic.magicLinksIssued} issued · ${traffic.magicLinksConsumed} consumed`} />
          <div className="mt-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Funnel</p>
            {traffic.funnel.map((f) => (
              <Row key={f.step} label={`Step ${f.step}`} value={f.drafts} />
            ))}
          </div>
        </div>
      ) : (
        <SectionUnavailable testId="ops-adoption-unavailable" />
      )}
    </Card>
  );
}

function EmailCard({ resend }: { resend: OpsResendStatus | null }) {
  const dailyPct = resend ? Math.round((resend.todayCount / RESEND_FREE_TIER_DAILY) * 100) : 0;
  const dot = resend
    ? worstLevel(
        opsStatusLevel(dailyPct, T.resendDailyPctYellow, T.resendDailyPctRed),
        opsStatusLevel(resend.bounced + resend.complained, 1, 5),
      )
    : 'green';
  const todayLabel = resend ? `${resend.todayCount}${resend.truncated ? '+' : ''}/${RESEND_FREE_TIER_DAILY}` : '';
  return (
    <Card title="Email deliverability" testId="ops-card-email" dot={<StatusDot level={dot} testId="ops-email-dot" />}>
      {resend ? (
        <div>
          <Row label={`Today (free tier ${RESEND_FREE_TIER_DAILY}/day)`} value={`${todayLabel} (${dailyPct}%)`} />
          <Row
            label="Since launch"
            value={`${resend.recentCount} sent · ${resend.delivered} delivered · ${resend.bounced} bounced · ${resend.complained} complained`}
          />
          <div className="mt-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Last 5 sends</p>
            {resend.last5.map((e, i) => (
              <Row key={i} label={`${e.when.slice(0, 19)} → ${e.to}`} value={e.event} />
            ))}
          </div>
        </div>
      ) : (
        <SectionUnavailable testId="ops-email-unavailable" />
      )}
    </Card>
  );
}

function QueueCard({ queue }: { queue: OpsQueueHealth | null }) {
  const dot = queue ? opsStatusLevel(queue.failed, T.queueFailedYellow, T.queueFailedRed) : 'green';
  return (
    <Card title="Email queue" testId="ops-card-queue" dot={<StatusDot level={dot} testId="ops-queue-dot" />}>
      {queue ? (
        <div>
          <Row label="Waiting / active" value={`${queue.waiting} / ${queue.active}`} />
          <Row label="Completed" value={queue.completed} />
          <Row label="Failed / delayed" value={`${queue.failed} / ${queue.delayed}`} />
          {queue.failedSamples.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-red-400">Failed job samples</p>
              {queue.failedSamples.map((j, i) => (
                <p key={i} className="truncate text-xs text-gray-600">
                  {j.name}: {j.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <SectionUnavailable testId="ops-queue-unavailable" />
      )}
    </Card>
  );
}

function RecommendationsCard({ recs }: { recs: OpsRecommendation[] }) {
  return (
    <Card
      title="Recommendations"
      testId="ops-card-recommendations"
      dot={<StatusDot level={recs.some((r) => r.severity === 'red') ? 'red' : recs.length ? 'yellow' : 'green'} />}
    >
      {recs.length === 0 ? (
        <p data-testid="ops-recs-healthy" className="text-sm text-green-700">
          ● All metrics within healthy thresholds. No action required.
        </p>
      ) : (
        <ul className="space-y-2">
          {recs.map((r) => (
            <li
              key={r.key}
              data-testid={`ops-rec-${r.key}`}
              data-severity={r.severity}
              className={`text-sm ${r.severity === 'red' ? 'text-red-700' : 'text-yellow-700'}`}
            >
              ▲ {r.text}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function OperationsDashboardPage() {
  const { data, isLoading, error, refresh, isRefreshing } = useOperationsDashboard();

  return (
    <div className="space-y-6 p-6" data-testid="operations-dashboard-page">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations</h1>
          <p className="mt-1 text-sm text-gray-600">
            Live VPS health, adoption funnel, email deliverability + queue. Auto-refreshes every 30s.
          </p>
        </div>
        <button
          type="button"
          data-testid="ops-refresh-button"
          onClick={() => refresh()}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
          data-testid="ops-error"
        >
          Refreshing failed; retrying in 30s.
        </div>
      )}

      {isLoading && !data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="ops-loading">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {data && (
        <>
          {data.generatedAt && (
            <p className="text-xs text-gray-400" data-testid="ops-generated-at">
              Snapshot {data.generatedAt.replace('T', ' ').slice(0, 19)} UTC
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SystemCard sys={data.system} />
            <AdoptionCard traffic={data.traffic} />
            <EmailCard resend={data.resend} />
            <QueueCard queue={data.queue} />
          </div>
          <RecommendationsCard recs={data.recommendations} />
        </>
      )}
    </div>
  );
}
