/**
 * Household Analytics Charts — Story 8.2
 *
 * Renders household-level analytics: size distribution, dependency ratio,
 * head-of-household gender, housing status, business ownership/registration,
 * and apprentice totals. Suppressed buckets (< 5 observations) are rendered
 * with a neutral gray fill and "< 5" label per privacy requirements.
 */

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import {
  SUPPRESSED_LABEL,
  SUPPRESSED_TOOLTIP,
  safeCount,
  bucketColor,
  formatLabel,
} from './chart-utils';
import type { HouseholdStats, FrequencyBucket } from '@oslsr/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HouseholdChartsProps {
  data?: HouseholdStats;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a percentage value (already in 0-100 range) for display. */
function fmtPct(value: number | null): string {
  if (value === null || value === undefined) return '\u2014';
  return `${value.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-6">
          <span className="text-4xl font-bold text-[#9C1E23]">{value}</span>
          {subtitle && (
            <span className="mt-1 text-sm text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NullStatCard({ title }: { title: string }) {
  return (
    <StatCard title={title} value={'\u2014'} subtitle="Insufficient data" />
  );
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Individual Chart Sections
// ---------------------------------------------------------------------------

function HouseholdSizeChart({ data }: { data: FrequencyBucket[] }) {
  const chartData = data.map((b) => ({
    ...b,
    displayCount: safeCount(b),
    displayLabel: formatLabel(b.label),
  }));

  return (
    <ChartCard title="Household Size Distribution">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="displayLabel"
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const bucket = payload[0].payload as FrequencyBucket & { displayLabel: string };
              if (bucket.suppressed) {
                return (
                  <div className="rounded border bg-white p-2 text-sm shadow">
                    <p className="font-medium">{bucket.displayLabel}</p>
                    <p className="text-neutral-500">{SUPPRESSED_TOOLTIP}</p>
                  </div>
                );
              }
              return (
                <div className="rounded border bg-white p-2 text-sm shadow">
                  <p className="font-medium">{bucket.displayLabel}</p>
                  <p>Count: <strong>{(bucket.count ?? 0).toLocaleString()}</strong></p>
                  {bucket.percentage != null && (
                    <p>Share: <strong>{bucket.percentage.toFixed(1)}%</strong></p>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="displayCount" name="Households" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={entry.label || i} fill={bucketColor(entry, i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DonutCard({
  title,
  buckets,
}: {
  title: string;
  buckets: FrequencyBucket[];
}) {
  const chartData = buckets.map((b) => ({
    ...b,
    displayCount: safeCount(b),
    displayLabel: b.suppressed ? SUPPRESSED_LABEL : formatLabel(b.label),
  }));
  const total = chartData.reduce((sum, d) => sum + d.displayCount, 0);

  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="displayCount"
            nameKey="displayLabel"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={95}
            paddingAngle={2}
          >
            {chartData.map((entry, i) => (
              <Cell key={entry.label || i} fill={bucketColor(entry, i)} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const bucket = payload[0].payload as FrequencyBucket & { displayLabel: string };
              if (bucket.suppressed) {
                return (
                  <div className="rounded border bg-white p-2 text-sm shadow">
                    <p className="font-medium">{bucket.displayLabel}</p>
                    <p className="text-neutral-500">{SUPPRESSED_TOOLTIP}</p>
                  </div>
                );
              }
              const pct = total > 0 ? (((bucket.count ?? 0) / total) * 100).toFixed(1) : '0';
              return (
                <div className="rounded border bg-white p-2 text-sm shadow">
                  <p className="font-medium">{bucket.displayLabel}</p>
                  <p>Count: <strong>{(bucket.count ?? 0).toLocaleString()}</strong></p>
                  <p>Share: <strong>{pct}%</strong></p>
                </div>
              );
            }}
          />
          <Legend
            formatter={(value: string) => <span className="text-sm">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function HouseholdCharts({ data, isLoading, error, onRetry, className }: HouseholdChartsProps) {
  // ---- Loading state ----
  if (isLoading) {
    return (
      <div
        data-testid="household-charts"
        className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${className ?? ''}`}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonCard key={i} lines={4} />
        ))}
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div data-testid="household-charts" className={className}>
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-red-500 mb-3">Unable to load data</p>
              {onRetry && (
                <button onClick={onRetry} className="text-sm text-blue-600 hover:underline">
                  Try again
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Empty / no data state ----
  if (!data) {
    return (
      <div data-testid="household-charts" className={className}>
        <Card>
          <CardContent>
            <div className="flex items-center justify-center py-12 text-neutral-400">
              No data available yet
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Normal render ----
  return (
    <div
      data-testid="household-charts"
      className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${className ?? ''}`}
    >
      {/* 1. Household size distribution — vertical bar chart */}
      <div className="sm:col-span-2">
        <HouseholdSizeChart data={data.householdSizeDistribution} />
      </div>

      {/* 2. Dependency ratio — stat card */}
      {data.dependencyRatio !== null && data.dependencyRatio !== undefined ? (
        <StatCard
          title="Dependency Ratio"
          value={data.dependencyRatio.toFixed(2)}
          subtitle="Dependents per working-age adult"
        />
      ) : (
        <NullStatCard title="Dependency Ratio" />
      )}

      {/* 3. Head of household by gender — donut chart */}
      <DonutCard title="Head of Household by Gender" buckets={data.headOfHouseholdByGender} />

      {/* 4. Housing status — donut chart */}
      <DonutCard title="Housing Status" buckets={data.housingDistribution} />

      {/* 5. Business ownership rate — stat card */}
      {data.businessOwnershipRate !== null && data.businessOwnershipRate !== undefined ? (
        <StatCard
          title="Business Ownership Rate"
          value={fmtPct(data.businessOwnershipRate)}
          subtitle="Of surveyed households"
        />
      ) : (
        <NullStatCard title="Business Ownership Rate" />
      )}

      {/* 6. Business registration rate — stat card */}
      {data.businessRegistrationRate !== null && data.businessRegistrationRate !== undefined ? (
        <StatCard
          title="Business Registration Rate"
          value={fmtPct(data.businessRegistrationRate)}
          subtitle="Of business-owning households"
        />
      ) : (
        <NullStatCard title="Business Registration Rate" />
      )}

      {/* 7. Apprentice total — stat card */}
      {data.apprenticeTotal !== null && data.apprenticeTotal !== undefined ? (
        <StatCard
          title="Apprentice Total"
          value={data.apprenticeTotal.toLocaleString()}
          subtitle="Registered apprentices"
        />
      ) : (
        <NullStatCard title="Apprentice Total" />
      )}
    </div>
  );
}
