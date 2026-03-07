import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Eye, Users, UserCheck, AlertTriangle, Fingerprint } from 'lucide-react';
import { useRevealStats, useTopViewers, useTopProfiles, useSuspiciousDevices } from '../hooks/useRevealAnalytics';

function StatCard({ label, value, icon: Icon, testId }: { label: string; value: number | string; icon: React.ElementType; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-neutral-100 p-2">
            <Icon className="h-5 w-5 text-neutral-600" />
          </div>
          <div>
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="text-2xl font-bold text-neutral-900">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function truncateId(id: string): string {
  return id.length > 8 ? `${id.substring(0, 8)}...` : id;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="stats-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-neutral-100 p-2 h-9 w-9 animate-pulse" />
              <div className="space-y-2">
                <div className="h-3 w-20 bg-neutral-200 rounded animate-pulse" />
                <div className="h-6 w-12 bg-neutral-200 rounded animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3" data-testid="table-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 bg-neutral-100 rounded animate-pulse" />
      ))}
    </div>
  );
}

export default function RevealAnalyticsPage() {
  const [period, setPeriod] = useState<number>(7);
  const { data: stats, isLoading: statsLoading } = useRevealStats();
  const { data: topViewers = [], isLoading: viewersLoading } = useTopViewers(period);
  const { data: topProfiles = [], isLoading: profilesLoading } = useTopProfiles(period);
  const { data: suspiciousDevices = [], isLoading: devicesLoading } = useSuspiciousDevices(period);

  return (
    <div className="p-6 space-y-6" data-testid="reveal-analytics-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Contact Reveal Analytics</h1>
        <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
          <SelectTrigger className="w-32" data-testid="period-selector">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="stats-cards">
          <StatCard label="Reveals (24h)" value={stats.total24h} icon={Eye} testId="stat-24h" />
          <StatCard label="Reveals (7d)" value={stats.total7d} icon={Eye} testId="stat-7d" />
          <StatCard label="Reveals (30d)" value={stats.total30d} icon={Eye} testId="stat-30d" />
          <StatCard label="Unique Viewers (24h)" value={stats.uniqueViewers24h} icon={Users} testId="stat-viewers" />
          <StatCard label="Profiles Viewed (24h)" value={stats.uniqueProfiles24h} icon={UserCheck} testId="stat-profiles" />
        </div>
      ) : (
        <div className="text-center py-8 text-neutral-500" data-testid="stats-empty">
          <Eye className="h-8 w-8 mx-auto mb-2 text-neutral-400" />
          No contact reveals recorded yet.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Viewers Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Viewers</CardTitle>
          </CardHeader>
          <CardContent>
            {viewersLoading ? (
              <TableSkeleton />
            ) : topViewers.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-4" data-testid="viewers-empty">No reveals in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="top-viewers-table">
                  <thead>
                    <tr className="border-b text-left text-neutral-500">
                      <th className="pb-2 font-medium">Viewer ID</th>
                      <th className="pb-2 font-medium">Reveals</th>
                      <th className="pb-2 font-medium">Profiles</th>
                      <th className="pb-2 font-medium">Last Reveal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topViewers.map((v) => (
                      <tr key={v.viewerId} className="border-b border-neutral-100">
                        <td className="py-2 font-mono text-xs">{truncateId(v.viewerId)}</td>
                        <td className="py-2 font-semibold">{v.revealCount}</td>
                        <td className="py-2">{v.distinctProfiles}</td>
                        <td className="py-2 text-neutral-500">{formatDate(v.lastRevealAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Profiles Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Viewed Profiles</CardTitle>
          </CardHeader>
          <CardContent>
            {profilesLoading ? (
              <TableSkeleton />
            ) : topProfiles.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-4" data-testid="profiles-empty">No reveals in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="top-profiles-table">
                  <thead>
                    <tr className="border-b text-left text-neutral-500">
                      <th className="pb-2 font-medium">Profile ID</th>
                      <th className="pb-2 font-medium">Reveals</th>
                      <th className="pb-2 font-medium">Viewers</th>
                      <th className="pb-2 font-medium">Last Reveal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProfiles.map((p) => (
                      <tr key={p.profileId} className="border-b border-neutral-100">
                        <td className="py-2 font-mono text-xs">{truncateId(p.profileId)}</td>
                        <td className="py-2 font-semibold">{p.revealCount}</td>
                        <td className="py-2">{p.distinctViewers}</td>
                        <td className="py-2 text-neutral-500">{formatDate(p.lastRevealAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Suspicious Devices Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Suspicious Device Patterns
          </CardTitle>
        </CardHeader>
        <CardContent>
          {devicesLoading ? (
            <TableSkeleton />
          ) : suspiciousDevices.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-4" data-testid="devices-empty">
              No suspicious patterns detected in this period.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="suspicious-devices-grid">
              {suspiciousDevices.map((d) => (
                <Card
                  key={d.deviceFingerprint}
                  className={`border-l-4 ${d.accountCount >= 3 ? 'border-l-red-500 bg-red-50' : 'border-l-amber-500 bg-amber-50'}`}
                  data-testid="suspicious-device-card"
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2 mb-2">
                      <Fingerprint className={`h-4 w-4 mt-0.5 ${d.accountCount >= 3 ? 'text-red-600' : 'text-amber-600'}`} />
                      <span className="font-mono text-xs text-neutral-700">{truncateId(d.deviceFingerprint)}</span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Accounts</span>
                        <span className={`font-semibold ${d.accountCount >= 3 ? 'text-red-700' : 'text-amber-700'}`}>{d.accountCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Total Reveals</span>
                        <span className="font-medium">{d.totalReveals}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Last Seen</span>
                        <span className="text-neutral-600">{formatDate(d.lastSeenAt)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
