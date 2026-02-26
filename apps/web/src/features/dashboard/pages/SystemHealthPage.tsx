/**
 * System Health Dashboard Page
 *
 * Real-time monitoring of CPU, RAM, disk, database, Redis, and BullMQ queues.
 * Polls every 30 seconds via TanStack Query. Super Admin only.
 *
 * Created in Story 6-2.
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Activity, Database, Server, HardDrive, Clock, Gauge } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { useSystemHealth, systemHealthKeys } from '../hooks/useSystemHealth';
import type { QueueStats } from '../api/system-health.api';

// ── Status badge component ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'ok' | 'degraded' | 'critical' | 'warning' | 'error' }) {
  const config = {
    ok: { color: 'bg-green-500', label: 'OK' },
    degraded: { color: 'bg-amber-500', label: 'Degraded' },
    warning: { color: 'bg-amber-500', label: 'Warning' },
    critical: { color: 'bg-red-500', label: 'Critical' },
    error: { color: 'bg-red-500', label: 'Error' },
  };
  const { color, label } = config[status] || config.error;
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={`status-badge-${status}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-sm font-medium">{label}</span>
    </span>
  );
}

// ── Progress bar ────────────────────────────────────────────────────────────
function ProgressBar({ value, warningAt, criticalAt }: { value: number; warningAt: number; criticalAt: number }) {
  const color =
    value >= criticalAt ? 'bg-red-500' :
    value >= warningAt ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="w-full bg-gray-200 rounded-full h-3" data-testid="progress-bar">
      <div
        className={`h-3 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

// ── Metric Card component ───────────────────────────────────────────────────
function MetricCard({
  title,
  icon: Icon,
  status,
  children,
  testId,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'ok' | 'degraded' | 'critical' | 'warning' | 'error';
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Icon className="w-5 h-5 text-gray-600" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ── Queue Health Panel ──────────────────────────────────────────────────────
function QueueHealthPanel({ queues }: { queues: QueueStats[] }) {
  return (
    <Card data-testid="queue-health-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Activity className="w-5 h-5 text-gray-600" />
          </div>
          <CardTitle className="text-base">Queue Health</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-gray-600">Queue</th>
                <th className="pb-2 font-medium text-gray-600 text-right">Waiting</th>
                <th className="pb-2 font-medium text-gray-600 text-right">Active</th>
                <th className="pb-2 font-medium text-gray-600 text-right">Failed</th>
                <th className="pb-2 font-medium text-gray-600 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.name} className="border-b last:border-0" data-testid={`queue-row-${q.name}`}>
                  <td className="py-2 font-medium">{q.name}</td>
                  <td className="py-2 text-right">{q.waiting}</td>
                  <td className="py-2 text-right">{q.active}</td>
                  <td className="py-2 text-right text-red-600">{q.failed}</td>
                  <td className="py-2 text-center">
                    <StatusBadge status={q.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── API Latency Panel ───────────────────────────────────────────────────────
function ApiLatencyPanel({ db, redis }: { db: { latencyMs: number; status: string }; redis: { latencyMs: number; status: string } }) {
  const dbStatus = db.status === 'ok' ? 'ok' : 'error';
  const redisStatus = redis.status === 'ok' ? 'ok' : 'error';
  const overallStatus: 'ok' | 'warning' | 'error' =
    dbStatus === 'error' || redisStatus === 'error' ? 'error' :
    db.latencyMs > 250 || redis.latencyMs > 250 ? 'warning' : 'ok';

  return (
    <MetricCard title="Database & Redis" icon={Database} status={overallStatus} testId="db-redis-panel">
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-gray-600">PostgreSQL</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{db.latencyMs}ms</span>
              <StatusBadge status={dbStatus} />
            </div>
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-gray-600">Redis</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{redis.latencyMs}ms</span>
              <StatusBadge status={redisStatus} />
            </div>
          </div>
        </div>
      </div>
    </MetricCard>
  );
}

// ── API Latency (p95) Panel ──────────────────────────────────────────────────
function ApiP95Panel({ p95Ms }: { p95Ms: number }) {
  const status: 'ok' | 'warning' | 'critical' =
    p95Ms > 500 ? 'critical' :
    p95Ms > 250 ? 'warning' : 'ok';

  return (
    <MetricCard title="API Latency (p95)" icon={Gauge} status={status} testId="api-latency-panel">
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-3xl font-semibold">{p95Ms}ms</span>
          <span className="text-sm text-gray-500">target: 250ms</span>
        </div>
        <ProgressBar value={Math.min((p95Ms / 500) * 100, 100)} warningAt={50} criticalAt={100} />
      </div>
    </MetricCard>
  );
}

// ── Format uptime ───────────────────────────────────────────────────────────
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function SystemHealthPage() {
  const queryClient = useQueryClient();
  const { data: health, isLoading, error } = useSystemHealth();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: systemHealthKeys.all });
    setLastRefreshed(new Date());
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="p-6" data-testid="system-health-page">
        <div className="mb-6">
          <h1 className="text-2xl font-brand font-semibold text-neutral-900">System Health</h1>
          <p className="text-neutral-600 mt-1">Real-time monitoring and alerts</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6" data-testid="system-health-page">
        <div className="mb-6">
          <h1 className="text-2xl font-brand font-semibold text-neutral-900">System Health</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center" data-testid="error-state">
          <p className="text-red-700 font-medium">Failed to load system health data</p>
          <p className="text-red-600 text-sm mt-1">Please check your connection and try again.</p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!health) return null;

  const cpuStatus: 'ok' | 'warning' | 'critical' =
    health.cpu.usagePercent > 90 ? 'critical' :
    health.cpu.usagePercent > 70 ? 'warning' : 'ok';

  const memStatus: 'ok' | 'warning' | 'critical' =
    health.memory.usagePercent > 90 ? 'critical' :
    health.memory.usagePercent > 75 ? 'warning' : 'ok';

  const diskFreePercent = health.disk.usagePercent > 0 ? 100 - health.disk.usagePercent : 100;
  const diskStatus: 'ok' | 'warning' | 'critical' =
    diskFreePercent < 10 ? 'critical' :
    diskFreePercent < 20 ? 'warning' : 'ok';

  return (
    <div className="p-6" data-testid="system-health-page">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-brand font-semibold text-neutral-900">System Health</h1>
          <p className="text-neutral-600 mt-1">Real-time monitoring and alerts</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={health.status} />
          <div className="text-sm text-gray-500 flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>Uptime: {formatUptime(health.uptime)}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Refresh health data"
            data-testid="refresh-button"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* 6-panel grid layout */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* CPU */}
        <MetricCard title="CPU Usage" icon={Server} status={cpuStatus} testId="cpu-panel">
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-3xl font-semibold">{health.cpu.usagePercent}%</span>
              <span className="text-sm text-gray-500">{health.cpu.cores} cores</span>
            </div>
            <ProgressBar value={health.cpu.usagePercent} warningAt={70} criticalAt={90} />
          </div>
        </MetricCard>

        {/* Memory */}
        <MetricCard title="RAM Usage" icon={Server} status={memStatus} testId="memory-panel">
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-3xl font-semibold">{health.memory.usagePercent}%</span>
              <span className="text-sm text-gray-500">
                {health.memory.usedMB.toLocaleString()} / {health.memory.totalMB.toLocaleString()} MB
              </span>
            </div>
            <ProgressBar value={health.memory.usagePercent} warningAt={75} criticalAt={90} />
          </div>
        </MetricCard>

        {/* Disk */}
        <MetricCard title="Disk Usage" icon={HardDrive} status={diskStatus} testId="disk-panel">
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-3xl font-semibold">{health.disk.usagePercent}%</span>
              <span className="text-sm text-gray-500">
                {health.disk.usedGB} / {health.disk.totalGB} GB
              </span>
            </div>
            <ProgressBar value={health.disk.usagePercent} warningAt={80} criticalAt={90} />
            <p className="text-xs text-gray-500">{diskFreePercent}% free</p>
          </div>
        </MetricCard>

        {/* API Latency (p95) */}
        <ApiP95Panel p95Ms={health.apiLatency?.p95Ms ?? 0} />

        {/* Database & Redis */}
        <ApiLatencyPanel db={health.database} redis={health.redis} />

        {/* Queue Health — spans 2 columns on larger screens */}
        <div className="lg:col-span-2">
          <QueueHealthPanel queues={health.queues} />
        </div>
      </div>
    </div>
  );
}
