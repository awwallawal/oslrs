/**
 * Employment Analytics Charts
 *
 * Story 8.2: Super Admin / Government Official Survey Analytics Dashboard
 * Renders employment statistics as a responsive grid of charts.
 *
 * Suppression: Any FrequencyBucket with `suppressed: true` renders as a gray
 * bar/slice with "< 5" label — the actual count is never shown.
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
import type { EmploymentStats, FrequencyBucket } from '@oslsr/types';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import {
  SUPPRESSED_LABEL,
  SUPPRESSED_TOOLTIP,
  safeCount,
  bucketColor,
  formatLabel,
} from './chart-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmploymentChartsProps {
  data?: EmploymentStats;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Shared tooltip renderer
// ---------------------------------------------------------------------------

interface BucketTooltipPayload {
  active?: boolean;
  payload?: Array<{ payload: FrequencyBucket }>;
}

function BucketTooltip({ active, payload }: BucketTooltipPayload) {
  if (!active || !payload?.[0]) return null;
  const bucket = payload[0].payload;

  if (bucket.suppressed) {
    return (
      <div className="rounded border bg-white p-2 text-sm shadow">
        <p className="font-medium">{formatLabel(bucket.label)}</p>
        <p className="text-neutral-500">{SUPPRESSED_TOOLTIP}</p>
      </div>
    );
  }

  return (
    <div className="rounded border bg-white p-2 text-sm shadow">
      <p className="font-medium">{formatLabel(bucket.label)}</p>
      <p>Count: <strong>{(bucket.count ?? 0).toLocaleString()}</strong></p>
      {bucket.percentage != null && (
        <p>Share: <strong>{bucket.percentage.toFixed(1)}%</strong></p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-chart: reusable vertical bar chart
// ---------------------------------------------------------------------------

function VerticalBarCard({
  title,
  buckets,
}: {
  title: string;
  buckets: FrequencyBucket[];
}) {
  const chartData = buckets.map((b) => ({
    ...b,
    displayCount: safeCount(b),
    displayLabel: formatLabel(b.label),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 40, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="displayLabel"
                tick={{ fontSize: 12 }}
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip content={(props) => <BucketTooltip {...(props as unknown as BucketTooltipPayload)} />} />
              <Bar dataKey="displayCount" name="Count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={entry.label || idx} fill={bucketColor(entry, idx)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-chart: horizontal bar chart (layout="vertical")
// ---------------------------------------------------------------------------

function HorizontalBarCard({
  title,
  buckets,
}: {
  title: string;
  buckets: FrequencyBucket[];
}) {
  const chartData = buckets.map((b) => ({
    ...b,
    displayCount: safeCount(b),
    displayLabel: formatLabel(b.label),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 20, bottom: 5, left: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="displayLabel"
                tick={{ fontSize: 12 }}
                width={75}
              />
              <Tooltip content={(props) => <BucketTooltip {...(props as unknown as BucketTooltipPayload)} />} />
              <Bar dataKey="displayCount" name="Count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={entry.label || idx} fill={bucketColor(entry, idx)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-chart: donut pie chart
// ---------------------------------------------------------------------------

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
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
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
                {chartData.map((entry, idx) => (
                  <Cell key={entry.label || idx} fill={bucketColor(entry, idx)} />
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
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-chart: formal/informal ratio stat card
// ---------------------------------------------------------------------------

function FormalInformalCard({ buckets }: { buckets: FrequencyBucket[] }) {
  const formalBucket = buckets.find((b) => b.label === 'formal');
  const informalBucket = buckets.find((b) => b.label === 'informal');

  const formalPct = formalBucket?.suppressed
    ? SUPPRESSED_LABEL
    : formalBucket?.percentage != null
      ? `${formalBucket.percentage.toFixed(1)}%`
      : '--';

  const informalPct = informalBucket?.suppressed
    ? SUPPRESSED_LABEL
    : informalBucket?.percentage != null
      ? `${informalBucket.percentage.toFixed(1)}%`
      : '--';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">Formal / Informal Ratio</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-80 items-center justify-center gap-12">
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-500">Formal</p>
            <p className="mt-1 text-4xl font-bold text-[#9C1E23]">{formalPct}</p>
          </div>
          <div className="h-16 w-px bg-neutral-200" />
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-500">Informal</p>
            <p className="mt-1 text-4xl font-bold text-[#4A5568]">{informalPct}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EmploymentCharts({ data, isLoading, error, onRetry, className }: EmploymentChartsProps) {
  // Loading state
  if (isLoading) {
    return (
      <div
        data-testid="employment-charts"
        className={`grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 ${className ?? ''}`}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonCard key={i} lines={6} />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div data-testid="employment-charts" className={className}>
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

  // Empty / no data state
  if (!data) {
    return (
      <Card data-testid="employment-charts" className={className}>
        <CardContent>
          <div className="py-12 text-center text-neutral-400">
            No data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      data-testid="employment-charts"
      className={`grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 ${className ?? ''}`}
    >
      {/* 1. Work status */}
      <VerticalBarCard title="Work Status" buckets={data.workStatusBreakdown} />

      {/* 2. Employment type — donut */}
      <DonutCard title="Employment Type" buckets={data.employmentTypeBreakdown} />

      {/* 3. Formal / Informal ratio — stat card */}
      <FormalInformalCard buckets={data.formalInformalRatio} />

      {/* 4. Experience distribution */}
      <VerticalBarCard title="Experience Distribution" buckets={data.experienceDistribution} />

      {/* 5. Hours worked — histogram */}
      <VerticalBarCard title="Hours Worked" buckets={data.hoursWorked} />

      {/* 6. Income distribution (Naira bands) */}
      <VerticalBarCard title="Income Distribution" buckets={data.incomeDistribution} />

      {/* 7. Income by LGA — horizontal bars */}
      <HorizontalBarCard title="Income by LGA" buckets={data.incomeByLga} />
    </div>
  );
}
